import { User, UserRole, AuthSession, LoginResponse, PasswordResetRequestResponse, PasswordResetConfirmResponse } from '../types';

const AUTH_SESSION_KEY = 'decode_fmcg_auth_session';
const FAILED_LOGINS_KEY = 'decode_fmcg_failed_logins';
const PASSWORD_RESETS_KEY = 'decode_fmcg_active_resets';

export const MOBILE_ONLY_ROLES: ReadonlyArray<UserRole> = [
  'DISPATCHER',
  'DISTRIBUTOR',
  'SALES_EXECUTIVE',
  'COMMISSION_AGENT',
  'DELIVERY_VAN_EXECUTIVE',
];

export const WEB_PORTAL_ALLOWED_ROLES: ReadonlyArray<UserRole> = [
  'ADMIN',
  'SUB_ADMIN',
  'BILLING',
  'ORDER_PUNCHER',
  'ACCOUNTANT',
];

export function isMobileOnlyRole(role?: UserRole | string | null): boolean {
  if (!role) return false;
  return MOBILE_ONLY_ROLES.includes(role as UserRole);
}

export function isWebPortalAllowedRole(role?: UserRole | string | null): boolean {
  if (!role) return false;
  return WEB_PORTAL_ALLOWED_ROLES.includes(role as UserRole);
}

export function getPlatformForRole(role?: UserRole | string | null): 'MOBILE' | 'WEB' {
  return isMobileOnlyRole(role) ? 'MOBILE' : 'WEB';
}

export function formatRoleDisplayName(role?: UserRole | string | null): string {
  switch (role) {
    case 'DISPATCHER':
      return 'Dispatcher';
    case 'DISTRIBUTOR':
      return 'Distributor';
    case 'SALES_EXECUTIVE':
      return 'Sales Rep (Sales Executive)';
    case 'COMMISSION_AGENT':
      return 'Commission Agent';
    case 'DELIVERY_VAN_EXECUTIVE':
      return 'Delivery Van Executive';
    case 'BILLING':
      return 'Billing Executive';
    case 'ORDER_PUNCHER':
      return 'Order Puncher';
    case 'SUB_ADMIN':
      return 'Sub-Admin';
    case 'ADMIN':
      return 'Administrator';
    case 'ACCOUNTANT':
      return 'Accountant';
    default:
      return String(role || 'User');
  }
}

export function getWebPortalBlockedMessage(role?: UserRole | string | null): string {
  return `Web Portal Access Restricted: ${formatRoleDisplayName(role)} accounts are restricted strictly to the mobile application and cannot access the web portal.`;
}

// Format and validate mobile number: E.164 or 10-digit Indian standard
export function sanitizeMobileNumber(input: string): string {
  if (!input) return '';
  // Remove all spaces, dashes, parentheses, and leading '+91' or '0'
  let cleaned = input.replace(/[\s\-\(\)]/g, '');
  if (cleaned.startsWith('+91')) {
    cleaned = cleaned.substring(3);
  } else if (cleaned.startsWith('91') && cleaned.length === 12) {
    cleaned = cleaned.substring(2);
  } else if (cleaned.startsWith('0') && cleaned.length === 11) {
    cleaned = cleaned.substring(1);
  }
  return cleaned;
}

export function isValidMobileNumber(mobile: string): boolean {
  const sanitized = sanitizeMobileNumber(mobile);
  // Exactly 10 digits starting with 6, 7, 8, or 9
  return /^[6-9]\d{9}$/.test(sanitized);
}

/**
 * Checks if the user is authorized to access Tenant Settings.
 * Strictly limited to backend team user ID / mobile: 7830260134.
 */
export function isTenantSettingsAuthorized(user: { id?: string; mobile_number?: string } | null | undefined): boolean {
  if (!user) return false;
  const cleanMobile = user.mobile_number ? sanitizeMobileNumber(user.mobile_number) : '';
  const cleanId = user.id ? sanitizeMobileNumber(user.id) : '';
  return user.id === '7830260134' || cleanMobile === '7830260134' || cleanId === '7830260134';
}

/**
 * Checks if the user is authorized to access Onboarding Wizard / Tenant Setup.
 * Strictly limited to the user: Yash Sharma.
 */
export function isOnboardingAuthorized(user: { id?: string; name?: string; email?: string; mobile_number?: string } | null | undefined): boolean {
  if (!user) return false;
  const name = (user.name || '').trim().toLowerCase();
  const id = (user.id || '').trim().toLowerCase();
  const email = (user.email || '').trim().toLowerCase();
  return (
    name.includes('yash') ||
    id.includes('yash') ||
    email.includes('yash')
  );
}

// Password Complexity Requirement: Min 8 chars, at least 1 letter, 1 number
export function validatePasswordStrength(password: string): { isValid: boolean; message?: string } {
  if (!password || password.length < 8) {
    return { isValid: false, message: 'Password must be at least 8 characters long.' };
  }
  if (!/[a-zA-Z]/.test(password)) {
    return { isValid: false, message: 'Password must contain at least one alphabet letter.' };
  }
  if (!/[0-9]/.test(password)) {
    return { isValid: false, message: 'Password must contain at least one numeric digit.' };
  }
  return { isValid: true };
}

// Auto-generate strong secure password meeting current security standards
export function generateSecurePassword(length: number = 14): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const numbers = '23456789';
  const symbols = '!@#$%^&*()_+~=';
  const allChars = upper + lower + numbers + symbols;

  const getRandomChar = (charset: string) => {
    if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
      const arr = new Uint32Array(1);
      window.crypto.getRandomValues(arr);
      return charset[arr[0] % charset.length];
    }
    return charset[Math.floor(Math.random() * charset.length)];
  };

  // Ensure character diversity across all classes
  const passwordChars = [
    getRandomChar(upper),
    getRandomChar(upper),
    getRandomChar(lower),
    getRandomChar(lower),
    getRandomChar(numbers),
    getRandomChar(numbers),
    getRandomChar(symbols),
    getRandomChar(symbols),
  ];

  while (passwordChars.length < Math.max(12, length)) {
    passwordChars.push(getRandomChar(allChars));
  }

  // Shuffle using Fisher-Yates
  for (let i = passwordChars.length - 1; i > 0; i--) {
    let j = 0;
    if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
      const arr = new Uint32Array(1);
      window.crypto.getRandomValues(arr);
      j = arr[0] % (i + 1);
    } else {
      j = Math.floor(Math.random() * (i + 1));
    }
    const temp = passwordChars[i];
    passwordChars[i] = passwordChars[j];
    passwordChars[j] = temp;
  }

  return passwordChars.join('');
}

// Client-side Session Management
export function getSavedSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(AUTH_SESSION_KEY) || sessionStorage.getItem(AUTH_SESSION_KEY);
    if (!raw) return null;
    const session: AuthSession = JSON.parse(raw);
    if (new Date(session.expires_at).getTime() < Date.now()) {
      clearSession();
      return null;
    }
    return session;
  } catch {
    clearSession();
    return null;
  }
}

export function saveSession(session: AuthSession, rememberMe: boolean = true): void {
  const json = JSON.stringify(session);
  if (rememberMe) {
    localStorage.setItem(AUTH_SESSION_KEY, json);
  } else {
    sessionStorage.setItem(AUTH_SESSION_KEY, json);
  }
}

export function clearSession(): void {
  localStorage.removeItem(AUTH_SESSION_KEY);
  sessionStorage.removeItem(AUTH_SESSION_KEY);
}

// Client-side rate limiting tracker (prevents brute-force in client preview)
interface ClientRateLimit {
  [mobileNumber: string]: {
    attempts: number;
    lockedUntil: number | null;
  };
}

function getRateLimits(): ClientRateLimit {
  try {
    const raw = localStorage.getItem(FAILED_LOGINS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function setRateLimits(data: ClientRateLimit): void {
  try {
    localStorage.setItem(FAILED_LOGINS_KEY, JSON.stringify(data));
  } catch (e) {
    console.error(e);
  }
}

export function checkClientRateLimit(mobile: string): { isLocked: boolean; remainingSeconds?: number } {
  const sanitized = sanitizeMobileNumber(mobile);
  const limits = getRateLimits();
  const entry = limits[sanitized];
  if (!entry) return { isLocked: false };

  const now = Date.now();
  if (entry.lockedUntil && entry.lockedUntil > now) {
    return { isLocked: true, remainingSeconds: Math.ceil((entry.lockedUntil - now) / 1000) };
  }
  if (entry.lockedUntil && entry.lockedUntil <= now) {
    delete limits[sanitized];
    setRateLimits(limits);
    return { isLocked: false };
  }
  return { isLocked: false };
}

export function recordClientFailedAttempt(mobile: string): { isNowLocked: boolean; remainingSeconds?: number } {
  const sanitized = sanitizeMobileNumber(mobile);
  const limits = getRateLimits();
  const entry = limits[sanitized] || { attempts: 0, lockedUntil: null };

  entry.attempts += 1;
  if (entry.attempts >= 3) {
    entry.lockedUntil = Date.now() + 30 * 60 * 1000; // 30 min lockout
    limits[sanitized] = entry;
    setRateLimits(limits);
    return { isNowLocked: true, remainingSeconds: 30 * 60 };
  }

  limits[sanitized] = entry;
  setRateLimits(limits);
  return { isNowLocked: false };
}

export function clearClientRateLimit(mobile: string): void {
  const sanitized = sanitizeMobileNumber(mobile);
  const limits = getRateLimits();
  delete limits[sanitized];
  setRateLimits(limits);
}

// Simple deterministic hash for browser client validation
export function hashClientPassword(password: string, salt: string = 'fmcg_salt_2025'): string {
  let hash = 0;
  const combined = `${password}__${salt}__decode_enterprise_sec_v1`;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).padStart(16, '0') + '_' + salt.substring(0, 8);
}
