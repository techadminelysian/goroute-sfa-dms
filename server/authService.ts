import crypto from 'crypto';
import { User, UserRole } from '../src/types';
import { hashClientPassword } from '../src/utils/authClient';

// In-memory rate limiting & failed attempt tracker
interface RateLimitRecord {
  failedAttempts: number;
  lastAttemptTime: number;
  lockedUntil: number | null;
}

// In-memory Password Reset Tokens (Deprecated / Scrapped for public access)
interface PasswordResetTokenRecord {
  token: string;
  mobile_number: string;
  expires_at: number; // Unix epoch ms (10 minutes)
  used: boolean;
  created_at: number;
}

// In-memory Active Sessions
interface SessionRecord {
  token: string;
  userId: string;
  role: UserRole;
  tenant_id: string;
  mobile_number: string;
  name: string;
  created_at: number;
  expires_at: number;
}

// Security Policies
const MAX_FAILED_ATTEMPTS = 3;
const LOCKOUT_DURATION_MS = 30 * 60 * 1000; // 30 minutes lockout after 3 consecutive failures
const RESET_TOKEN_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes single-use
const SESSION_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

// Stable server signing key for session tokens (survives dev restarts when SESSION_SECRET or default app key is used)
const SESSION_SIGNING_KEY = crypto
  .createHash('sha256')
  .update(process.env.SESSION_SECRET || 'decode-fmcg-goroute-sfa-dms-session-signing-key-v1')
  .digest();

// Store in memory for Node server
const rateLimitMap = new Map<string, RateLimitRecord>();
const resetTokensMap = new Map<string, PasswordResetTokenRecord>();
const activeSessionsMap = new Map<string, SessionRecord>();
const revokedTokensSet = new Set<string>();
const userInvalidatedAfterMap = new Map<string, number>();

interface SignedSessionPayload {
  jti: string;
  uid: string;
  role: UserRole;
  tenant_id: string;
  mobile_number: string;
  name: string;
  iat: number;
  exp: number;
}

function signSessionPayload(payload: SignedSessionPayload): string {
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sigB64 = crypto
    .createHmac('sha256', SESSION_SIGNING_KEY)
    .update(payloadB64)
    .digest('base64url');
  return `sess_v1.${payloadB64}.${sigB64}`;
}

function verifySignedSessionToken(token: string): (SignedSessionPayload & { token: string }) | null {
  if (!token || !token.startsWith('sess_v1.')) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [, payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) return null;

  try {
    const expectedSig = crypto
      .createHmac('sha256', SESSION_SIGNING_KEY)
      .update(payloadB64)
      .digest('base64url');

    const providedBuf = Buffer.from(sigB64, 'utf8');
    const expectedBuf = Buffer.from(expectedSig, 'utf8');
    if (providedBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(providedBuf, expectedBuf)) {
      return null;
    }

    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as SignedSessionPayload;
    if (!payload || !payload.uid || !payload.exp || Date.now() > payload.exp) {
      return null;
    }
    if (revokedTokensSet.has(token) || (payload.jti && revokedTokensSet.has(payload.jti))) {
      return null;
    }
    const invalidatedBefore = userInvalidatedAfterMap.get(payload.uid);
    if (invalidatedBefore && payload.iat <= invalidatedBefore) {
      return null;
    }

    return { ...payload, token };
  } catch {
    return null;
  }
}

// Crypto Hashing Helper using PBKDF2 with SHA-512 and unique salt
export function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const userSalt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, userSalt, 100000, 64, 'sha512').toString('hex');
  return { hash, salt: userSalt };
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  if (!password || !hash || !salt) return false;

  // 1. Standard PBKDF2 SHA-512 hash (128 hex chars = 64 bytes)
  if (/^[0-9a-fA-F]{128}$/.test(hash)) {
    const computedHash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
    const a = Buffer.from(computedHash, 'hex');
    const b = Buffer.from(hash, 'hex');
    if (a.length !== b.length || a.length === 0) return false;
    return crypto.timingSafeEqual(a, b);
  }

  // 2. Legacy client hash fallback so accounts created offline/pre-fix still verify without crashing timingSafeEqual
  const legacyCandidate = hashClientPassword(password, salt || 'fmcg_salt_2025');
  return legacyCandidate === hash;
}

// Generate Cryptographically Secure Password for Credential Generation
export function generateStrongPassword(length: number = 14): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const numbers = '23456789';
  const symbols = '!@#$%^&*()_+~=';
  const allChars = upper + lower + numbers + symbols;

  const chars: string[] = [
    upper[crypto.randomInt(0, upper.length)],
    upper[crypto.randomInt(0, upper.length)],
    lower[crypto.randomInt(0, lower.length)],
    lower[crypto.randomInt(0, lower.length)],
    numbers[crypto.randomInt(0, numbers.length)],
    numbers[crypto.randomInt(0, numbers.length)],
    symbols[crypto.randomInt(0, symbols.length)],
    symbols[crypto.randomInt(0, symbols.length)]
  ];

  while (chars.length < Math.max(12, length)) {
    chars.push(allChars[crypto.randomInt(0, allChars.length)]);
  }

  // Shuffle using Fisher-Yates
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    const tmp = chars[i];
    chars[i] = chars[j];
    chars[j] = tmp;
  }

  return chars.join('');
}

// Generate Cryptographically Secure Single-Use Token (6-digit numeric OTP or 32-character token)
export function generateResetToken(): string {
  // 6-digit numeric OTP with high entropy
  const randomBuffer = crypto.randomBytes(4);
  const code = (randomBuffer.readUInt32BE(0) % 900000) + 100000;
  return code.toString();
}

// Generate Secure Session Token
export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// Rate Limiter Check
export function checkRateLimit(identifier: string): { isLocked: boolean; remainingLockSeconds?: number } {
  const now = Date.now();
  const record = rateLimitMap.get(identifier);

  if (!record) return { isLocked: false };

  if (record.lockedUntil && record.lockedUntil > now) {
    const remainingLockSeconds = Math.ceil((record.lockedUntil - now) / 1000);
    return { isLocked: true, remainingLockSeconds };
  }

  // If lockout expired, reset
  if (record.lockedUntil && record.lockedUntil <= now) {
    rateLimitMap.delete(identifier);
    return { isLocked: false };
  }

  return { isLocked: false };
}

export function recordFailedAttempt(identifier: string): { isNowLocked: boolean; lockDurationMinutes?: number } {
  const now = Date.now();
  const record = rateLimitMap.get(identifier) || { failedAttempts: 0, lastAttemptTime: now, lockedUntil: null };

  record.failedAttempts += 1;
  record.lastAttemptTime = now;

  if (record.failedAttempts >= MAX_FAILED_ATTEMPTS) {
    record.lockedUntil = now + LOCKOUT_DURATION_MS;
    rateLimitMap.set(identifier, record);
    console.warn(`[SECURITY AUDIT] Account / IP ${identifier} locked out for 30 minutes due to ${record.failedAttempts} consecutive failed attempts.`);
    return { isNowLocked: true, lockDurationMinutes: 30 };
  }

  rateLimitMap.set(identifier, record);
  return { isNowLocked: false };
}

export function recordSuccessfulAttempt(identifier: string): void {
  rateLimitMap.delete(identifier);
}

export function clearRateLimit(identifier: string): void {
  rateLimitMap.delete(identifier);
}

// Password Reset Flow
export function createPasswordResetToken(mobileNumber: string): { token: string; expires_at: number } {
  // Invalidate any existing tokens for this mobile number
  for (const [t, rec] of resetTokensMap.entries()) {
    if (rec.mobile_number === mobileNumber) {
      resetTokensMap.delete(t);
    }
  }

  const token = generateResetToken();
  const expires_at = Date.now() + RESET_TOKEN_EXPIRY_MS;

  resetTokensMap.set(token, {
    token,
    mobile_number: mobileNumber,
    expires_at,
    used: false,
    created_at: Date.now()
  });

  // Simulated SMS Dispatcher Log
  console.log(`[SMS GATEWAY DISPATCH] Sent to +91-${mobileNumber}: "Your Decode FMCG password reset OTP is ${token}. Valid for 10 minutes. Do not share this OTP with anyone."`);

  return { token, expires_at };
}

export function validateResetToken(token: string, mobileNumber: string): { isValid: boolean; error?: string } {
  const record = resetTokensMap.get(token.trim());
  if (!record) {
    return { isValid: false, error: 'Invalid or expired password reset OTP/token.' };
  }

  if (record.used) {
    return { isValid: false, error: 'This password reset token has already been used.' };
  }

  if (Date.now() > record.expires_at) {
    resetTokensMap.delete(token);
    return { isValid: false, error: 'Password reset token has expired. Please request a new one.' };
  }

  if (record.mobile_number !== mobileNumber.trim()) {
    return { isValid: false, error: 'Token does not match registered mobile number.' };
  }

  return { isValid: true };
}

export function consumeResetToken(token: string): void {
  const record = resetTokensMap.get(token.trim());
  if (record) {
    record.used = true;
    resetTokensMap.delete(token.trim());
  }
}

// Session Creation & Invalidation
export function createSession(user: User): SessionRecord {
  const invalidatedBefore = userInvalidatedAfterMap.get(user.id) || 0;
  const issuedAt = Math.max(Date.now(), invalidatedBefore + 1);
  const expiresAt = issuedAt + SESSION_EXPIRY_MS;
  const jti = crypto.randomBytes(12).toString('hex');

  const payload: SignedSessionPayload = {
    jti,
    uid: user.id,
    role: user.role,
    tenant_id: user.tenant_id || 'tenant_ms_enterprises',
    mobile_number: user.mobile_number || '',
    name: user.name,
    iat: issuedAt,
    exp: expiresAt,
  };

  const token = signSessionPayload(payload);
  const session: SessionRecord = {
    token,
    userId: user.id,
    role: user.role,
    tenant_id: payload.tenant_id,
    mobile_number: payload.mobile_number,
    name: user.name,
    created_at: issuedAt,
    expires_at: expiresAt,
  };

  activeSessionsMap.set(token, session);
  return session;
}

export function getSession(token: string): SessionRecord | null {
  if (!token || revokedTokensSet.has(token)) return null;

  const cached = activeSessionsMap.get(token);
  if (cached) {
    const invalidatedBefore = userInvalidatedAfterMap.get(cached.userId);
    if (Date.now() > cached.expires_at || (invalidatedBefore && cached.created_at <= invalidatedBefore)) {
      activeSessionsMap.delete(token);
      return null;
    }
    return cached;
  }

  // Stateless HMAC verification fallback for signed tokens (e.g. after server restart / HMR)
  const verified = verifySignedSessionToken(token);
  if (verified) {
    const recovered: SessionRecord = {
      token,
      userId: verified.uid,
      role: verified.role,
      tenant_id: verified.tenant_id,
      mobile_number: verified.mobile_number,
      name: verified.name,
      created_at: verified.iat,
      expires_at: verified.exp,
    };
    activeSessionsMap.set(token, recovered);
    return recovered;
  }

  return null;
}

export function invalidateSession(token: string): void {
  if (!token) return;
  activeSessionsMap.delete(token);
  revokedTokensSet.add(token);
  const verified = verifySignedSessionToken(token);
  if (verified?.jti) {
    revokedTokensSet.add(verified.jti);
  }
}

export function invalidateAllUserSessions(userId: string): void {
  if (!userId) return;
  userInvalidatedAfterMap.set(userId, Date.now());
  for (const [t, session] of activeSessionsMap.entries()) {
    if (session.userId === userId) {
      revokedTokensSet.add(t);
      activeSessionsMap.delete(t);
    }
  }
}

export function clearInMemorySessionCacheForTest(token?: string): void {
  if (token) {
    activeSessionsMap.delete(token);
  } else {
    activeSessionsMap.clear();
  }
}
