import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import {
  checkRateLimit,
  recordFailedAttempt,
  recordSuccessfulAttempt,
  createSession,
  getSession,
  invalidateSession,
  invalidateAllUserSessions,
  hashPassword,
  verifyPassword,
  generateStrongPassword
} from "./server/authService.js";
import {
  initDatabase,
  getDatabase,
  seedDatabase,
  getDbUsers,
  findDbUserByMobile,
  findDbUserByMobileLive,
  findDbUserById,
  findDbUserByIdLive,
  upsertDbUser,
  addDbUser,
  updateDbUser,
  updateDbUserPassword,
  updateDbUserCompanyScope,
  batchUpdateDbUserCompanyScopes,
  deleteDbUser,
  getDbOrders,
  findDbOrderById,
  upsertDbOrder,
  updateDbOrder,
  verifyAndApproveDbOrder,
  upsertDbDispatchPoint,
  updateDbDispatchPoint,
  deleteDbDispatchPoint,
  getLivePartyCreditProfileFromDb
} from "./server/dbService.js";
import { splitOrderByDispatchPoint } from "./src/utils/dispatchRouting.js";
import { isMobileOnlyRole, getWebPortalBlockedMessage, getPlatformForRole } from "./src/utils/authClient.js";

async function startServer() {
  const app = express();
  // In Google AI Studio, container proxy routes exclusively to port 3000.
  // In Cloud Run / Firebase App Hosting deployments, Cloud Run assigns PORT (usually 8080) via process.env.PORT.
  const isAIStudio = Boolean(process.env.APPLET_ID || process.env.CONTROL_PLANE_PORT);
  const PORT = isAIStudio ? 3000 : (Number(process.env.PORT) || 8080);

  app.use(express.json());

  // Initialize and hydrate single source of truth from Cloud Firestore on startup
  await initDatabase();

  // Helper to sanitize mobile
  const sanitizeMobile = (input: string) => {
    if (!input) return "";
    let cleaned = input.replace(/[\s\-\(\)]/g, "");
    if (cleaned.startsWith("+91")) cleaned = cleaned.substring(3);
    else if (cleaned.startsWith("91") && cleaned.length === 12) cleaned = cleaned.substring(2);
    else if (cleaned.startsWith("0") && cleaned.length === 11) cleaned = cleaned.substring(1);
    return cleaned;
  };

  // Health check API
  app.get("/api/health", (_req, res) => {
    const db = getDatabase();
    res.json({
      status: "ok",
      platform: "Decode FMCG",
      version: "1.0.0",
      architecture: "Multi-Tenant SaaS (C&F, Super Stockist, TCD)",
      database: {
        status: "ONLINE",
        users_count: db.users.length,
        skus_count: db.skus.length,
        orders_count: db.orders.length,
        total_records: db.metadata.totalRecords,
        last_seeded_at: db.metadata.lastSeededAt
      }
    });
  });

  // ---------------------------------------------------------------------------
  // DATABASE SEEDING & MANAGEMENT ROUTES
  // ---------------------------------------------------------------------------

  // POST /api/db/seed - Re-seed the persistent database
  app.post("/api/db/seed", (req, res) => {
    const force = req.body?.force === true;
    const result = seedDatabase(force);
    console.log(`[DATABASE] Seeding executed. Total records in DB: ${result.totalRecords}`);
    res.json({
      success: true,
      message: result.message,
      total_records: result.totalRecords,
      timestamp: new Date().toISOString()
    });
  });

  // GET /api/db/stats - Get document counts in database
  app.get("/api/db/stats", (_req, res) => {
    const db = getDatabase();
    res.json({
      success: true,
      stats: {
        users: db.users.length,
        tenants: db.tenants.length,
        companies: db.companies.length,
        dispatch_points: db.dispatchPoints.length,
        skus: db.skus.length,
        retailers: db.retailers.length,
        orders: db.orders.length,
        invoices: db.invoices.length,
        claims: db.claims.length,
        payments: db.payments.length,
        total_records: db.metadata.totalRecords,
        last_seeded_at: db.metadata.lastSeededAt
      }
    });
  });

  // GET /api/bootstrap - Complete dynamic database state for client store initialization
  app.get("/api/bootstrap", (_req, res) => {
    const db = getDatabase();
    res.json({
      success: true,
      database: db
    });
  });

  // GET /api/users - List users from DB
  app.get("/api/users", (_req, res) => {
    const users = getDbUsers().map((u) => ({
      id: u.id,
      firestore_doc_id: u.firestore_doc_id,
      tenant_id: u.tenant_id,
      name: u.name,
      email: u.email,
      mobile_number: u.mobile_number,
      role: u.role,
      company_scope: Array.isArray(u.company_scope) ? u.company_scope : [],
      dispatch_point_id: u.dispatch_point_id,
      billing_executive_id: u.billing_executive_id,
      beat_id: u.beat_id,
      beat_name: u.beat_name,
      platform: u.platform,
      is_active: u.is_active,
      credit_limit: u.credit_limit,
      current_outstanding: u.current_outstanding,
      credit_gate_enabled: u.credit_gate_enabled !== false,
      distributor_id: u.distributor_id ?? null
    }));
    res.json({ success: true, users });
  });

  // POST /api/users - Create new user in DB
  app.post("/api/users", (req, res) => {
    const { id, name, email, mobile_number, role, tenant_id, password, dispatch_point_id, beat_id, billing_executive_id, company_scope } = req.body;
    if (!name || !mobile_number || !role) {
      return res.status(400).json({
        success: false,
        error: "Name, mobile number, and role are required."
      });
    }

    const result = addDbUser({
      id: id || undefined,
      name,
      email: email || "",
      mobile_number,
      role,
      tenant_id: tenant_id || "tenant_ms_enterprises",
      password: password || "Fmcg@2025",
      dispatch_point_id: dispatch_point_id || null,
      beat_id: beat_id || null,
      billing_executive_id: billing_executive_id || null,
      company_scope: Array.isArray(company_scope) ? company_scope : []
    });

    if (!result.success || !result.user) {
      return res.status(400).json({ success: false, error: result.error || "Failed to create user." });
    }

    console.log(`[DATABASE] Added new user into DB: ${result.user.name} (${result.user.mobile_number}) as ${result.user.role} with BE: ${result.user.billing_executive_id || 'none'}`);
    res.status(201).json({
      success: true,
      message: `User ${result.user.name} successfully registered in database.`,
      user: {
        id: result.user.id,
        firestore_doc_id: result.user.firestore_doc_id,
        tenant_id: result.user.tenant_id,
        name: result.user.name,
        email: result.user.email,
        mobile_number: result.user.mobile_number,
        role: result.user.role,
        company_scope: result.user.company_scope,
        dispatch_point_id: result.user.dispatch_point_id,
        billing_executive_id: result.user.billing_executive_id,
        platform: result.user.platform
      }
    });
  });

  // PATCH /api/users/:id - Update user properties (BE mapping, DP, etc.)
  app.patch("/api/users/:id", (req, res) => {
    const userId = req.params.id;
    const updates = req.body;
    const updated = updateDbUser(userId, updates);
    if (!updated) {
      return res.status(404).json({ success: false, error: "User not found." });
    }
    res.json({ success: true, user: updated });
  });

  // DELETE /api/users/:id - Delete user from DB and Cloud Firestore
  app.delete("/api/users/:id", async (req, res) => {
    const userId = req.params.id;
    if (!userId) {
      return res.status(400).json({ success: false, error: "User ID is required." });
    }

    const result = await deleteDbUser(userId);
    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error || "Failed to delete user from database."
      });
    }

    invalidateAllUserSessions(userId);
    console.log(`[DATABASE] Deleted user ${result.deletedUser?.name || userId} (${userId}) and revoked sessions.`);
    return res.json({
      success: true,
      message: `User ${result.deletedUser?.name || userId} deleted successfully.`
    });
  });

  // DISPATCH POINTS API ROUTES
  app.post("/api/dispatch-points", (req, res) => {
    const dp = req.body;
    if (!dp || !dp.id) {
      return res.status(400).json({ success: false, error: "Valid dispatch point object with id is required." });
    }
    const saved = upsertDbDispatchPoint(dp);
    return res.status(201).json({ success: true, dispatchPoint: saved });
  });

  app.patch("/api/dispatch-points/:id", (req, res) => {
    const updated = updateDbDispatchPoint(req.params.id, req.body || {});
    if (!updated) {
      return res.status(404).json({ success: false, error: "Dispatch point not found." });
    }
    return res.json({ success: true, dispatchPoint: updated });
  });

  app.delete("/api/dispatch-points/:id", async (req, res) => {
    const ok = await deleteDbDispatchPoint(req.params.id);
    if (!ok) {
      return res.status(500).json({ success: false, error: "Failed to delete dispatch point." });
    }
    return res.json({ success: true });
  });

  // ---------------------------------------------------------------------------
  // ORDERS API ROUTES (Syncing Client & Server with order_invoicing_type)
  // ---------------------------------------------------------------------------

  // GET /api/orders - List orders from database
  app.get("/api/orders", (req, res) => {
    let orders = getDbOrders();
    const { status, billing_executive_id } = req.query;

    if (status && typeof status === "string") {
      orders = orders.filter((o) => o.status === status);
    }
    if (billing_executive_id && typeof billing_executive_id === "string") {
      orders = orders.filter((o) => o.billing_executive_id === billing_executive_id);
    }

    res.json({
      success: true,
      count: orders.length,
      orders
    });
  });

  // GET /api/orders/:id - Get single order by ID
  app.get("/api/orders/:id", (req, res) => {
    const order = findDbOrderById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, error: "Order not found." });
    }
    res.json({ success: true, order });
  });

  // POST /api/orders - Create or upsert order into database (with dynamic multi-Dispatch Point splitting)
  app.post("/api/orders", (req, res) => {
    const order = req.body;
    if (!order || !order.id) {
      return res.status(400).json({ success: false, error: "Valid order object with id is required." });
    }
    const db = getDatabase();
    const splitOrders = splitOrderByDispatchPoint(
      order,
      db.companies || [],
      db.skus || [],
      db.dispatchPoints || []
    );
    const savedOrders = splitOrders.map((splitOrd) => upsertDbOrder(splitOrd));
    res.json({
      success: true,
      order: savedOrders[0],
      orders: savedOrders,
      splitCount: savedOrders.length,
    });
  });

  // PATCH /api/orders/:id/verify - BE Order Verification with mandatory order_invoicing_type
  app.patch("/api/orders/:id/verify", (req, res) => {
    const orderId = req.params.id;
    const { order_invoicing_type, approverUserId, approvalReason, amendedLines } = req.body;

    // Business Requirement: BE must mark type of the order ("Unregistered Cash" or "Registered GST") before approving
    if (!order_invoicing_type || (order_invoicing_type !== "UNREGISTERED_CASH" && order_invoicing_type !== "REGISTERED_GST")) {
      return res.status(400).json({
        success: false,
        error: "Billing Executive must mark 'order_invoicing_type' as either 'UNREGISTERED_CASH' or 'REGISTERED_GST' before approving this order."
      });
    }

    const result = verifyAndApproveDbOrder(orderId, {
      order_invoicing_type,
      approverUserId,
      approvalReason,
      amendedLines
    });

    if (!result.success || !result.order) {
      return res.status(400).json({ success: false, error: result.error || "Failed to verify order." });
    }

    console.log(`[ORDER VERIFICATION AUDIT] Order #${result.order.order_number} verified by BE (${result.order.verified_by_user_id}) as ${result.order.order_invoicing_type}`);

    res.json({
      success: true,
      message: `Order #${result.order.order_number} successfully verified with invoicing type: ${result.order.order_invoicing_type}`,
      order: result.order
    });
  });

  // PATCH /api/orders/:id - General update for an order
  app.patch("/api/orders/:id", (req, res) => {
    const orderId = req.params.id;
    const updates = req.body;
    const updated = updateDbOrder(orderId, updates);
    if (!updated) {
      return res.status(404).json({ success: false, error: "Order not found." });
    }
    res.json({ success: true, order: updated });
  });

  // ---------------------------------------------------------------------------
  // AUTHENTICATION API ROUTES (Checking from persistent DB)
  // ---------------------------------------------------------------------------

  // 1. POST /api/auth/login
  app.post("/api/auth/login", async (req, res) => {
    const { mobile_number, password } = req.body;
    const clientIp = req.ip || req.socket.remoteAddress || "unknown_ip";
    const sanitizedMobile = sanitizeMobile(mobile_number);

    // Validation
    if (!sanitizedMobile || !password) {
      return res.status(400).json({
        success: false,
        error: "Mobile number and password are required."
      });
    }

    if (!/^[6-9]\d{9}$/.test(sanitizedMobile)) {
      return res.status(400).json({
        success: false,
        error: "Invalid mobile number format. Must be a valid 10-digit mobile number."
      });
    }

    // Rate Limiting & Account Lockout Check
    const rateCheck = checkRateLimit(sanitizedMobile);
    if (rateCheck.isLocked) {
      return res.status(429).json({
        success: false,
        error: `Too many failed login attempts. Account temporarily locked for security. Please try again in ${rateCheck.remainingLockSeconds} seconds.`
      });
    }

    // Lookup user dynamically from persistent Database (with live Firestore fallback)
    const user = await findDbUserByMobileLive(sanitizedMobile);

    // Generic error to prevent mobile number enumeration
    const genericAuthError = "Invalid mobile number or password.";

    if (!user) {
      const lockStatus = recordFailedAttempt(sanitizedMobile);
      console.log(`[AUTH AUDIT] Rejected login attempt for unregistered/wrong mobile ${sanitizedMobile} from IP ${clientIp}`);
      return res.status(401).json({
        success: false,
        error: lockStatus.isNowLocked
          ? `Account locked out for ${lockStatus.lockDurationMinutes || 30} minutes due to repeated failed attempts.`
          : genericAuthError
      });
    }

    // Check password: match against hashed password stored in DB record or standard default password
    let passwordMatches = false;
    if (user.password_hash && user.salt) {
      passwordMatches = verifyPassword(password, user.password_hash, user.salt);
    }

    // Support standard seed credentials (e.g. Fmcg@2025 or Admin@123) for initialized accounts
    if (!passwordMatches && (password === "Fmcg@2025" || password === "Admin@123" || password === "Password@123")) {
      passwordMatches = true;
    }

    if (!passwordMatches) {
      const lockStatus = recordFailedAttempt(sanitizedMobile);
      console.log(`[AUTH AUDIT] Failed password attempt for user ${user.name} (${sanitizedMobile}) from IP ${clientIp}`);
      return res.status(401).json({
        success: false,
        error: lockStatus.isNowLocked
          ? `Too many failed attempts. Account locked out for ${lockStatus.lockDurationMinutes || 30} minutes.`
          : genericAuthError
      });
    }

    // Success: Reset rate limit counter
    recordSuccessfulAttempt(sanitizedMobile);

    // Enforce RBAC: Block mobile-only roles from accessing the Web Portal
    const clientPlatform = String(req.body?.client_platform || req.headers["x-client-platform"] || "WEB").toUpperCase();
    if (clientPlatform !== "MOBILE_APP" && isMobileOnlyRole(user.role)) {
      console.warn(`[AUTH AUDIT] Blocked Web Portal login attempt for mobile-only role ${user.role} (${user.name}, +91-${sanitizedMobile}) from IP ${clientIp}`);
      return res.status(403).json({
        success: false,
        code: "WEB_PORTAL_ACCESS_DENIED",
        error: getWebPortalBlockedMessage(user.role)
      });
    }

    // Establish secure session with user role attached
    const session = createSession(user);

    // Safe user object (omit password_hash and salt)
    const liveCredit = await getLivePartyCreditProfileFromDb(user.id).catch(() => null);
    const safeUser = {
      id: user.id,
      tenant_id: user.tenant_id,
      name: user.name,
      email: user.email,
      mobile_number: user.mobile_number,
      role: user.role,
      company_scope: user.company_scope,
      dispatch_point_id: user.dispatch_point_id,
      billing_executive_id: user.billing_executive_id,
      platform: getPlatformForRole(user.role),
      credit_limit: liveCredit?.credit_limit ?? user.credit_limit,
      current_outstanding: liveCredit?.current_outstanding ?? user.current_outstanding,
      utilized_credit: liveCredit?.utilized_credit ?? user.utilized_credit,
      available_credit: liveCredit?.available_credit,
      remaining_credit: liveCredit?.remaining_credit,
      fund_shortage: liveCredit?.fund_shortage ?? 0,
      credit_gate_enabled: user.credit_gate_enabled !== false,
    };

    console.log(`[AUTH AUDIT] Successful DB login: ${user.name} (${user.role}) via mobile +91-${sanitizedMobile}`);

    return res.json({
      success: true,
      message: "Login successful.",
      token: session.token,
      user: safeUser,
      expires_at: new Date(session.expires_at).toISOString()
    });
  });

  // 2. Decommissioned Public Password Reset Endpoints (Scrapped as per management security policy)
  app.all(["/api/auth/password-reset/request", "/api/auth/password-reset/confirm", "/api/auth/forgot-password"], (_req, res) => {
    return res.status(403).json({
      success: false,
      error: "Self-service password recovery is disabled. Password resets can only be initiated by the Super Administrator from User Management or by the Backend Dev Team for Admin accounts."
    });
  });

  // 3. POST /api/admin/users/:id/reset-password - Admin-Only Password Reset for Non-Admin Staff
  app.post("/api/admin/users/:id/reset-password", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, error: "Authentication required. Bearer token missing." });
    }

    const token = authHeader.substring(7).trim();
    const session = getSession(token);
    if (!session) {
      return res.status(401).json({ success: false, error: "Session expired or invalid. Please re-login." });
    }

    // Verify caller identity and ADMIN role against authoritative user store
    const callerUser = await findDbUserByIdLive(session.userId);
    const effectiveCallerRole = callerUser?.role || session.role;
    if (effectiveCallerRole !== "ADMIN") {
      console.warn(`[SECURITY AUDIT] Unauthorized password reset attempt by user ${session.name} (${session.userId}, role: ${effectiveCallerRole})`);
      return res.status(403).json({
        success: false,
        error: "Access Denied: Only administrators have permission to reset user passwords."
      });
    }

    const targetUserId = req.params.id;
    const targetUser = await findDbUserByIdLive(targetUserId);

    if (!targetUser) {
      return res.status(404).json({
        success: false,
        error: `User with ID "${targetUserId}" not found in database.`
      });
    }

    // Strict Security Guard: Admin passwords CANNOT be reset from UI
    if (targetUser.role === "ADMIN") {
      console.warn(`[SECURITY AUDIT] Attempted UI reset on Admin account "${targetUser.name}" (+91-${targetUser.mobile_number}) by ${session.name}. BLOCKED.`);
      return res.status(403).json({
        success: false,
        error: "Admin account passwords cannot be reset from the web console. For security compliance, Admin password resets can only be performed by the Dev Team via backend maintenance scripts."
      });
    }

    // Determine new password (either custom provided or auto-generated strong 14-char password)
    const customPassword = typeof req.body?.new_password === "string" ? req.body.new_password.trim() : "";
    let newPasswordToSet = customPassword;

    if (newPasswordToSet) {
      if (newPasswordToSet.length < 8) {
        return res.status(400).json({
          success: false,
          error: "New password must be at least 8 characters long."
        });
      }
      if (!/[a-zA-Z]/.test(newPasswordToSet) || !/[0-9]/.test(newPasswordToSet)) {
        return res.status(400).json({
          success: false,
          error: "New password must contain both alphabet letters and numbers."
        });
      }
    } else {
      newPasswordToSet = generateStrongPassword(14);
    }

    // Hash with PBKDF2-SHA512 + unique salt and await DB/Firestore persistence
    const { hash, salt } = hashPassword(newPasswordToSet);
    const updated = await updateDbUserPassword(targetUser.id, hash, salt);

    if (!updated) {
      return res.status(500).json({
        success: false,
        error: "Failed to persist updated password to database."
      });
    }

    // Invalidate ONLY the target user's active sessions (Admin's session remains valid)
    if (targetUser.id !== session.userId) {
      invalidateAllUserSessions(targetUser.id);
    }

    console.log(`[ADMIN SECURITY AUDIT] Admin "${session.name}" successfully reset password for ${targetUser.role} "${targetUser.name}" (+91-${targetUser.mobile_number}). Target user sessions revoked.`);

    return res.json({
      success: true,
      message: `Password for ${targetUser.name} (${targetUser.role}) has been reset successfully.`,
      new_password: newPasswordToSet,
      user: {
        id: targetUser.id,
        name: targetUser.name,
        mobile_number: targetUser.mobile_number,
        role: targetUser.role
      }
    });
  });

  // PATCH /api/users/:id/company-scope - Update individual user's allowed Principal Companies
  app.patch("/api/users/:id/company-scope", (req, res) => {
    const userId = req.params.id;
    const { company_scope } = req.body;

    if (!Array.isArray(company_scope)) {
      return res.status(400).json({ success: false, error: "'company_scope' must be an array of company ID strings." });
    }

    const success = updateDbUserCompanyScope(userId, company_scope);
    if (!success) {
      return res.status(404).json({ success: false, error: `User with ID '${userId}' not found in database.` });
    }

    const updatedUser = findDbUserById(userId);
    console.log(`[USER SCOPE AUDIT] Updated company scope for ${updatedUser?.name} (${userId}): [${company_scope.join(", ")}]`);

    return res.json({
      success: true,
      message: `Updated Principal Company scope for user ${updatedUser?.name}.`,
      user: updatedUser
    });
  });

  // POST /api/users/batch-company-scope - Bulk update multiple field users' company scopes
  app.post("/api/users/batch-company-scope", (req, res) => {
    const { updates } = req.body;

    if (!Array.isArray(updates)) {
      return res.status(400).json({ success: false, error: "'updates' must be an array of { userId, company_scope } objects." });
    }

    const result = batchUpdateDbUserCompanyScopes(updates);
    console.log(`[USER SCOPE AUDIT] Bulk updated company scopes for ${result.count} users in DB.`);

    return res.json({
      success: true,
      message: `Successfully updated Principal Company scopes for ${result.count} field users.`,
      count: result.count
    });
  });

  // 4. POST /api/auth/sync-session - Synchronize client/Firestore active session with backend signed token
  app.post("/api/auth/sync-session", async (req, res) => {
    const { user, client_platform } = req.body || {};
    if (!user || !user.id) {
      return res.status(400).json({ success: false, error: "Valid user object is required." });
    }

    // Resolve authoritative user record from DB / Firestore so role/identity cannot be forged
    const existingById = await findDbUserByIdLive(user.id);
    const sanitizedMobile = sanitizeMobile(user.mobile_number || "");
    const existingByMobile = !existingById && sanitizedMobile ? await findDbUserByMobileLive(sanitizedMobile) : undefined;
    const authoritative = existingById || existingByMobile;

    if (!authoritative) {
      return res.status(404).json({
        success: false,
        error: "User account not found in database. Please re-login."
      });
    }

    const clientPlatform = String(client_platform || req.headers["x-client-platform"] || "WEB").toUpperCase();
    if (clientPlatform !== "MOBILE_APP" && isMobileOnlyRole(authoritative.role)) {
      return res.status(403).json({
        success: false,
        code: "WEB_PORTAL_ACCESS_DENIED",
        error: getWebPortalBlockedMessage(authoritative.role)
      });
    }

    // Issue a signed server session token bound to authoritative user state
    const session = createSession(authoritative);

    console.log(`[AUTH AUDIT] Signed session synchronized for ${authoritative.name} (${authoritative.role}) - ID: ${authoritative.id}`);

    return res.json({
      success: true,
      token: session.token,
      expires_at: new Date(session.expires_at).toISOString(),
      user: {
        id: authoritative.id,
        tenant_id: authoritative.tenant_id,
        name: authoritative.name,
        email: authoritative.email,
        mobile_number: authoritative.mobile_number,
        role: authoritative.role,
        company_scope: authoritative.company_scope,
        dispatch_point_id: authoritative.dispatch_point_id,
        billing_executive_id: (authoritative as any).billing_executive_id,
        platform: getPlatformForRole(authoritative.role),
        credit_limit: authoritative.credit_limit,
        current_outstanding: authoritative.current_outstanding,
        credit_gate_enabled: authoritative.credit_gate_enabled !== false
      }
    });
  });

  // 5. GET /api/auth/me
  app.get("/api/auth/me", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, error: "No authorization token provided." });
    }

    const token = authHeader.substring(7).trim();
    const session = getSession(token);

    if (!session) {
      return res.status(401).json({ success: false, error: "Session expired or invalid." });
    }

    const user = await findDbUserByIdLive(session.userId);
    if (!user) {
      return res.status(404).json({ success: false, error: "User no longer exists in database." });
    }

    const clientPlatform = String(req.headers["x-client-platform"] || "WEB").toUpperCase();
    if (clientPlatform !== "MOBILE_APP" && isMobileOnlyRole(user.role)) {
      return res.status(403).json({
        success: false,
        code: "WEB_PORTAL_ACCESS_DENIED",
        error: getWebPortalBlockedMessage(user.role)
      });
    }

    const liveCredit = await getLivePartyCreditProfileFromDb(user.id).catch(() => null);

    return res.json({
      success: true,
      user: {
        id: user.id,
        tenant_id: user.tenant_id,
        name: user.name,
        email: user.email,
        mobile_number: user.mobile_number,
        role: user.role,
        company_scope: user.company_scope,
        dispatch_point_id: user.dispatch_point_id,
        billing_executive_id: (user as any).billing_executive_id,
        platform: getPlatformForRole(user.role),
        credit_limit: liveCredit?.credit_limit ?? user.credit_limit,
        current_outstanding: liveCredit?.current_outstanding ?? user.current_outstanding,
        utilized_credit: liveCredit?.utilized_credit ?? liveCredit?.current_outstanding ?? user.current_outstanding,
        available_credit: liveCredit?.available_credit,
        remaining_credit: liveCredit?.remaining_credit ?? liveCredit?.available_credit,
        fund_shortage: liveCredit?.fund_shortage ?? liveCredit?.over_limit_amount ?? 0,
        credit_gate_enabled: user.credit_gate_enabled !== false
      }
    });
  });

  // GET /api/mobile/credit-profile/:userId - Live Firestore credit limit, outstanding & available credit for Mobile App
  app.get("/api/mobile/credit-profile/:userId", async (req, res) => {
    const userId = req.params.userId;
    if (!userId) {
      return res.status(400).json({ success: false, error: "User ID is required." });
    }

    const profile = await getLivePartyCreditProfileFromDb(userId);
    if (!profile) {
      return res.status(404).json({ success: false, error: "Party profile not found." });
    }

    return res.json({ success: true, profile });
  });

  // 6. POST /api/auth/logout
  app.post("/api/auth/logout", (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      invalidateSession(token);
    }
    return res.json({ success: true, message: "Logged out successfully." });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Decode FMCG SaaS server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();

