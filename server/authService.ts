import crypto from 'crypto';
import { User, UserRole } from '../src/types';

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
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes lockout after 5 consecutive failures
const RESET_TOKEN_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes single-use
const SESSION_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

// Store in memory for Node server
const rateLimitMap = new Map<string, RateLimitRecord>();
const resetTokensMap = new Map<string, PasswordResetTokenRecord>();
const activeSessionsMap = new Map<string, SessionRecord>();

// Crypto Hashing Helper using PBKDF2 with SHA-512 and unique salt
export function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const userSalt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, userSalt, 100000, 64, 'sha512').toString('hex');
  return { hash, salt: userSalt };
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  if (!password || !hash || !salt) return false;
  const computedHash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(computedHash, 'hex'), Buffer.from(hash, 'hex'));
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
    console.warn(`[SECURITY AUDIT] Account / IP ${identifier} locked out for 15 minutes due to ${record.failedAttempts} consecutive failed attempts.`);
    return { isNowLocked: true, lockDurationMinutes: 15 };
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
  const token = generateSessionToken();
  const session: SessionRecord = {
    token,
    userId: user.id,
    role: user.role,
    tenant_id: user.tenant_id,
    mobile_number: user.mobile_number || '',
    name: user.name,
    created_at: Date.now(),
    expires_at: Date.now() + SESSION_EXPIRY_MS,
  };

  activeSessionsMap.set(token, session);
  return session;
}

export function getSession(token: string): SessionRecord | null {
  if (!token) return null;
  const session = activeSessionsMap.get(token);
  if (!session) return null;

  if (Date.now() > session.expires_at) {
    activeSessionsMap.delete(token);
    return null;
  }

  return session;
}

export function invalidateSession(token: string): void {
  activeSessionsMap.delete(token);
}

export function invalidateAllUserSessions(userId: string): void {
  for (const [t, session] of activeSessionsMap.entries()) {
    if (session.userId === userId) {
      activeSessionsMap.delete(t);
    }
  }
}
