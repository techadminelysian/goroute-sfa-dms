# Implementation Plan - Seamless Android & Web Authentication Logic (Firestore DB)

Provide a complete, production-ready Android Authentication specification and implementation blueprint in Kotlin & Jetpack Compose. This ensures your Android App Creation Agent can replicate the exact authentication logic, Firestore user document lookups, password hashing algorithms, and session management used in the GoRoute web application.

---

## 1. Architecture & Parity Overview

To achieve seamless cross-platform parity between Web and Android:
1. **Firestore `users` Collection Schema Parity**:
   - Both platforms query the same `users` collection in Firestore.
   - User document model matches `src/types/index.ts` (`id`, `tenant_id`, `name`, `mobile_number`, `password_hash`, `salt`, `role`, `company_scope`, `dispatch_point_id`, `beat_id`, `platform`, `is_active`).
2. **Dual-Layer Password Verification Engine**:
   - **Algorithm 1 (Client Hash Parity)**: Browser-compatible deterministic hash formula:
     `((hash << 5) - hash) + char` with salt appended `_<salt[0..7]>`.
   - **Algorithm 2 (Server PBKDF2 Parity)**: Standard PBKDF2 with SHA-512 (100,000 iterations, 64-byte key) with unique user salt.
   - **Algorithm 3 (Seeded Admin Bypass)**: Support for seeded admin master credentials (`Fmcg@2025`, `Admin@123`, `Password@123`).
3. **Mobile Number Normalization**:
   - Sanitize all spaces, hyphens, parentheses, and prefixes (`+91`, `91`, `0`).
   - Standard 10-digit validation: `^[6-9]\d{9}$`.
4. **Client-Side Brute-Force Rate Limiting**:
   - 5 consecutive failed attempts trigger a 15-minute account lockout on the device.
5. **Secure Session Persistence (Jetpack Compose / Android)**:
   - `EncryptedSharedPreferences` storing auth session token, user ID, role, tenant ID, and expiration.

---

## 2. Deliverable Assets

### Deliverable 1: `/ANDROID_AUTH_SPEC.md`
A self-contained, prompt-ready markdown specification to feed directly into your Android AI Agent, containing:
1. **System Flow & Sequence Diagram**: Complete step-by-step auth pipeline.
2. **Data Models in Kotlin**: `User`, `UserRole`, `AuthSession`, `LoginResult`.
3. **Password Hashing Utility (`PasswordHasher.kt`)**: Native Kotlin implementation of the exact client and PBKDF2 hash functions.
4. **Phone Validator (`PhoneUtils.kt`)**: Strict 10-digit Indian mobile sanitizer.
5. **Rate Limiting Engine (`RateLimiter.kt`)**: In-memory / preference-backed attempt tracker and lockout timer.
6. **Firestore Authentication Repository (`AuthRepository.kt`)**: Direct Firestore query against `users` collection with timeout and error mapping.
7. **Session Storage (`SessionManager.kt`)**: Android `EncryptedSharedPreferences` for auto-login and session validation.
8. **Jetpack Compose UI Component (`LoginScreen.kt`)**: Clean Haute-Minimalist Executive login screen supporting mobile number + password + remember me.

---

## 3. Verification & Testing Steps

1. Verify `ANDROID_AUTH_SPEC.md` contains 100% mathematical parity with `hashClientPassword` from `src/utils/authClient.ts` and `hashPassword` from `server/authService.ts`.
2. Validate that Firestore document field names in the Kotlin data class match `COLLECTIONS.USERS` records seeded in `src/data/initialData.ts`.
3. Verify test accounts (e.g. `9810012345` / Rajesh Sharma, `7830260134` / Prashant Vasu, `9810099888` / Yash Sharma) authenticate identically across Web and Android logic.
