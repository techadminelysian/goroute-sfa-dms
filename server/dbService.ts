import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, getDocs, getDoc, doc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import {
  Tenant,
  TenantSettings,
  Company,
  DispatchPoint,
  SKU,
  Beat,
  Retailer,
  DistributorInstitution,
  Order,
  OrderInvoicingType,
  OrderStatus,
  StockLedgerEntry,
  ReturnableAssetLedgerEntry,
  Invoice,
  Claim,
  Payment,
  User,
  PrinciplePurchaseOrder,
  WorkflowNotification
} from '../src/types';
import { hashPassword } from './authService';
import { getPlatformForRole } from '../src/utils/authClient';
import { syncDispatchPointsForUsers } from '../src/utils/dispatchRouting';
import { computeUserLiveCreditProfile, PartyCreditProfile } from '../src/utils/creditLedger';

export interface DatabaseSchema {
  tenants: Tenant[];
  tenantSettings: Record<string, TenantSettings>;
  companies: Company[];
  dispatchPoints: DispatchPoint[];
  skus: SKU[];
  beats: Beat[];
  retailers: Retailer[];
  distributors: DistributorInstitution[];
  orders: Order[];
  purchaseOrders: PrinciplePurchaseOrder[];
  workflowNotifications: WorkflowNotification[];
  stockLedger: StockLedgerEntry[];
  returnableAssetLedger?: ReturnableAssetLedgerEntry[];
  invoices: Invoice[];
  claims: Claim[];
  payments: Payment[];
  users: User[];
  metadata: {
    lastSeededAt: string;
    version: number;
    totalRecords: number;
  };
}

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCyVaFVFfEmANuVZmbKIoMA91TJNWceXaU",
  authDomain: "you-can-touch-me-8919838-dba1d.firebaseapp.com",
  projectId: "you-can-touch-me-8919838-dba1d",
  databaseId: "goroute-sfa-dms",
  storageBucket: "you-can-touch-me-8919838-dba1d.firebasestorage.app",
  messagingSenderId: "731815279263",
  appId: "1:731815279263:web:d93eb61d3231bdecb180aa",
};

let firestoreInstance: any = null;
export function getFirestoreDb() {
  if (firestoreInstance) return firestoreInstance;
  try {
    const app = getApps().length > 0 ? getApp() : initializeApp(FIREBASE_CONFIG);
    firestoreInstance = getFirestore(app, "goroute-sfa-dms");
    return firestoreInstance;
  } catch (err) {
    console.error("[DATABASE] Failed to initialize Firestore on server:", err);
    return null;
  }
}

function createEmptyDatabase(): DatabaseSchema {
  return {
    tenants: [],
    tenantSettings: {},
    companies: [],
    dispatchPoints: [],
    skus: [],
    beats: [],
    retailers: [],
    distributors: [],
    orders: [],
    purchaseOrders: [],
    workflowNotifications: [],
    stockLedger: [],
    returnableAssetLedger: [],
    invoices: [],
    claims: [],
    payments: [],
    users: [],
    metadata: {
      lastSeededAt: new Date().toISOString(),
      version: 2,
      totalRecords: 0
    }
  };
}

// In-memory cache holding real-time Cloud Firestore state for high-performance server lookups
let inMemoryDb: DatabaseSchema = createEmptyDatabase();
let isInitialized = false;

/**
 * Recursively strips `undefined` properties from objects and array items
 * because Cloud Firestore rejects any `undefined` field values on writes.
 */
function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefined(item)) as unknown as T;
  }
  if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
    const cleaned: Record<string, any> = {};
    for (const [k, v] of Object.entries(value as Record<string, any>)) {
      if (v !== undefined) {
        cleaned[k] = stripUndefined(v);
      }
    }
    return cleaned as T;
  }
  return value;
}

/**
 * Normalizes an order from Firestore for server cache consistency.
 */
function normalizeServerOrder(docId: string, raw: any): Order {
  const tenantId = raw.tenant_id || 'tenant_ms_enterprises';
  const orderId = raw.id || docId;
  const orderNumber = raw.order_number || docId;

  let lines = raw.lines || [];
  if ((!lines || lines.length === 0) && Array.isArray(raw.items) && raw.items.length > 0) {
    lines = raw.items.map((it: any, idx: number) => ({
      id: it.id || `line_${orderId}_${it.sku_id || idx}`,
      tenant_id: it.tenant_id || tenantId,
      order_id: it.order_id || orderId,
      sku_id: it.sku_id || '',
      sku_name: it.sku_name || '',
      quantity: Number(it.quantity) || 0,
      verified_quantity: it.verified_quantity != null ? Number(it.verified_quantity) : Number(it.quantity) || 0,
      is_amended: Boolean(it.is_amended),
      unit_price: Number(it.unit_price) || 0,
      landing_price: Number(it.landing_price) || 0,
      total: Number(it.total) != null ? Number(it.total) : (Number(it.quantity) || 0) * (Number(it.unit_price) || 0),
      discount_percentage: Number(it.discount_percentage) || 0,
      discount_amount: Number(it.discount_amount) || 0,
      is_below_cost: Boolean(it.is_below_cost),
      expected_claim_total: Number(it.expected_claim_total) || 0,
      company_id: it.company_id || raw.company_id || undefined,
      company_name: it.company_name || undefined,
    }));
  }

  // Status normalization: Every incoming order that has not been explicitly verified by a BE must enter PENDING_VERIFICATION
  const postVerificationStatuses: OrderStatus[] = [
    'VERIFIED',
    'VERIFIED_BY_BILLING',
    'CONFIRMED',
    'PO_GENERATED',
    'PUNCHED_TO_PRINCIPAL',
    'PRINCIPAL_DISPATCHED',
    'APPROVED',
    'DISPATCHED',
    'DELIVERED',
    'INVOICED',
  ];
  const rawStatus = String(raw.status || '') as OrderStatus;
  let resolvedStatus: OrderStatus = 'PENDING_VERIFICATION';
  const isPostVerificationStatus = postVerificationStatuses.includes(rawStatus);
  const isExplicitlyVerified = isPostVerificationStatus || Boolean(raw.verified_at || raw.verified_by_user_id);

  if (rawStatus === 'CANCELLED') {
    resolvedStatus = 'CANCELLED';
  } else if (isPostVerificationStatus) {
    resolvedStatus = rawStatus;
  } else if (isExplicitlyVerified) {
    resolvedStatus = 'VERIFIED';
  } else {
    resolvedStatus = 'PENDING_VERIFICATION';
  }

  return stripUndefined({
    ...raw,
    id: orderId,
    tenant_id: tenantId,
    order_number: orderNumber,
    retailer_name_raw: raw.retailer_name_raw || raw.retailer_name || '',
    channel: raw.channel || 'GT',
    company_id: raw.company_id || (raw.company_ids && raw.company_ids[0]) || '',
    company_ids: Array.isArray(raw.company_ids) ? raw.company_ids : (raw.company_id ? [raw.company_id] : []),
    retailer_id: raw.retailer_id || null,
    beat_id: raw.beat_id || undefined,
    beat_name: raw.beat_name || '',
    dispatch_point_id: raw.dispatch_point_id || 'dp_sahibabad',
    billing_executive_id: raw.billing_executive_id || null,
    created_by_user_id: raw.created_by_user_id || '',
    commission_agent_id: raw.commission_agent_id || null,
    commission_agent_name: raw.commission_agent_name || undefined,
    order_date: raw.order_date || new Date().toISOString(),
    delivery_date: raw.delivery_date || '',
    status: resolvedStatus,
    total_amount: Number(raw.total_amount) || lines.reduce((s: number, l: any) => s + (Number(l.total) || 0), 0),
    original_total_amount: Number(raw.original_total_amount) || Number(raw.total_amount) || 0,
    tax_amount: Number(raw.tax_amount) || 0,
    lines,
    has_below_cost_lines: Boolean(raw.has_below_cost_lines),
    credit_limit_exceeded: Boolean(raw.credit_limit_exceeded),
    exposure_variance: Number(raw.exposure_variance) || 0,
    approved_credit_limit_snapshot: Number(raw.approved_credit_limit_snapshot) || 0,
    retailer_outstanding_snapshot: Number(raw.retailer_outstanding_snapshot) || 0,
    be_approval_reason: raw.be_approval_reason || null,
    verified_by_user_id: raw.verified_by_user_id || null,
    verified_at: raw.verified_at || null,
    is_locked: Boolean(raw.is_locked),
    order_invoicing_type: raw.order_invoicing_type || null,
    crates_issued: Number(raw.crates_issued) || 0,
    crates_returned: Number(raw.crates_returned) || 0,
    fulfillment_source: raw.fulfillment_source || null,
    parent_order_id: raw.parent_order_id || null,
    split_sequence: raw.split_sequence != null ? Number(raw.split_sequence) : undefined,
    dispatched_at: raw.dispatched_at || null,
    invoiced_at: raw.invoiced_at || null,
    firestore_doc_id: docId,
  });
}

const ORDER_STATUS_PRIORITY: Record<string, number> = {
  PENDING_VERIFICATION: 1,
  PUNCHED: 1,
  FLAGGED: 1,
  CLEARED: 1,
  VERIFIED: 5,
  VERIFIED_BY_BILLING: 5,
  APPROVED: 6,
  PO_GENERATED: 7,
  CONFIRMED: 8,
  PUNCHED_TO_PRINCIPAL: 8,
  PRINCIPAL_DISPATCHED: 9,
  DISPATCHED: 10,
  INVOICED: 11,
  DELIVERED: 12,
  CANCELLED: 99,
};

function getOrderPrecedenceScore(o: Order): number {
  const statusScore = (ORDER_STATUS_PRIORITY[o.status] || 0) * 100;
  const verifiedScore = o.verified_at ? 20 : 0;
  const lockedScore = o.is_locked ? 10 : 0;
  const mobileDocScore = o.firestore_doc_id?.startsWith('#') ? 1 : 0;
  return statusScore + verifiedScore + lockedScore + mobileDocScore;
}

/**
 * Deduplicates orders by unique ID or order_number while preferring the highest workflow state.
 */
export function deduplicateOrders(orders: Order[]): Order[] {
  const byKey = new Map<string, Order>();
  for (const o of orders) {
    const key = o.id || o.order_number;
    if (!key) continue;
    const existing = byKey.get(key);
    if (!existing || getOrderPrecedenceScore(o) > getOrderPrecedenceScore(existing)) {
      byKey.set(key, o);
    }
  }
  return Array.from(byKey.values());
}

/**
 * Single source of truth: Cloud Firestore hydration
 */
export async function initDatabase(): Promise<DatabaseSchema> {
  const db = getFirestoreDb();
  if (!db) {
    console.warn('[DATABASE] Cloud Firestore not accessible, using in-memory defaults.');
    return inMemoryDb;
  }

  try {
    const [
      tenantsSnap,
      tenantSettingsSnap,
      companiesSnap,
      dispatchPointsSnap,
      skusSnap,
      beatsSnap,
      retailersSnap,
      distributorsSnap,
      ordersSnap,
      stockLedgerSnap,
      invoicesSnap,
      claimsSnap,
      paymentsSnap,
      usersSnap,
    ] = await Promise.all([
      getDocs(collection(db, "tenants")),
      getDocs(collection(db, "tenant_settings")),
      getDocs(collection(db, "companies")),
      getDocs(collection(db, "dispatch_points")),
      getDocs(collection(db, "skus")),
      getDocs(collection(db, "beats")),
      getDocs(collection(db, "retailers")),
      getDocs(collection(db, "distributors")),
      getDocs(collection(db, "orders")),
      getDocs(collection(db, "stock_ledger")),
      getDocs(collection(db, "invoices")),
      getDocs(collection(db, "claims")),
      getDocs(collection(db, "payments")),
      getDocs(collection(db, "users")),
    ]);

    const tenantSettings: Record<string, TenantSettings> = {};
    tenantSettingsSnap.docs.forEach((d) => {
      tenantSettings[d.id] = d.data() as TenantSettings;
    });

    inMemoryDb = {
      tenants: tenantsSnap.docs.map((d) => d.data() as Tenant),
      tenantSettings,
      companies: companiesSnap.docs.map((d) => d.data() as Company),
      dispatchPoints: dispatchPointsSnap.docs.map((d) => d.data() as DispatchPoint),
      skus: skusSnap.docs.map((d) => d.data() as SKU),
      beats: beatsSnap.docs.map((d) => d.data() as Beat),
      retailers: retailersSnap.docs.map((d) => d.data() as Retailer),
      distributors: distributorsSnap.docs.map((d) => d.data() as DistributorInstitution),
      orders: deduplicateOrders(ordersSnap.docs.map((d) => normalizeServerOrder(d.id, d.data()))),
      purchaseOrders: [],
      workflowNotifications: [],
      stockLedger: stockLedgerSnap.docs.map((d) => d.data() as StockLedgerEntry),
      returnableAssetLedger: [],
      invoices: invoicesSnap.docs.map((d) => d.data() as Invoice),
      claims: claimsSnap.docs.map((d) => d.data() as Claim),
      payments: paymentsSnap.docs.map((d) => d.data() as Payment),
      users: usersSnap.docs.map((d) => {
        const u = d.data() as User;
        return {
          ...u,
          id: u.id || d.id,
          firestore_doc_id: d.id,
          platform: getPlatformForRole(u.role),
          company_scope: Array.isArray(u.company_scope) ? u.company_scope : [],
          credit_limit: u.credit_limit !== undefined && u.credit_limit !== null ? Number(u.credit_limit) : undefined,
          current_outstanding:
            u.current_outstanding !== undefined && u.current_outstanding !== null
              ? Number(u.current_outstanding)
              : undefined,
          credit_gate_enabled: u.credit_gate_enabled === false ? false : true,
          distributor_id: u.distributor_id ?? null,
        };
      }),
      metadata: {
        lastSeededAt: new Date().toISOString(),
        version: 2,
        totalRecords: usersSnap.size + ordersSnap.size + skusSnap.size,
      },
    };

    const { updatedDispatchPoints, changedDispatchPoints } = syncDispatchPointsForUsers(
      inMemoryDb.dispatchPoints,
      inMemoryDb.users
    );
    inMemoryDb.dispatchPoints = updatedDispatchPoints;
    if (changedDispatchPoints.length > 0) {
      changedDispatchPoints.forEach((dp) => {
        setDoc(doc(db, 'dispatch_points', dp.id), stripUndefined(dp), { merge: true }).catch((err) =>
          console.error('[DATABASE] Firestore DP supervisor init sync error:', err)
        );
      });
    }

    isInitialized = true;
    console.log(`[DATABASE] Single Source of Truth connected to Cloud Firestore (goroute-sfa-dms): ${inMemoryDb.users.length} users, ${inMemoryDb.orders.length} orders.`);
  } catch (err) {
    console.error('[DATABASE] Failed to hydrate database from Cloud Firestore:', err);
  }
  return inMemoryDb;
}

// Initial fire-and-forget hydration on module load so synchronous getters have cached state
initDatabase().catch(() => {});

/**
 * Retires disk file storage (no-op retained for backwards compatibility)
 */
export function saveDatabaseToDisk(): boolean {
  return true;
}

export function getDatabase(): DatabaseSchema {
  return inMemoryDb;
}

export function seedDatabase(force = false): { success: boolean; totalRecords: number; message: string } {
  initDatabase().catch((e) => console.error('[DATABASE] seed re-sync error:', e));
  return {
    success: true,
    totalRecords: inMemoryDb.metadata.totalRecords,
    message: `Cloud Firestore synced as single source of truth (${inMemoryDb.metadata.totalRecords} records across collections).`
  };
}

export function getDbUsers(): User[] {
  return inMemoryDb.users;
}

export function sanitizeMobile(m: string): string {
  return m ? m.replace(/[\s\-\(\)\+]/g, '').slice(-10) : '';
}

export function findDbUserByMobile(mobileNumber: string): User | undefined {
  const target = sanitizeMobile(mobileNumber);
  return inMemoryDb.users.find((u) => sanitizeMobile(u.mobile_number || '') === target);
}

export async function findDbUserByMobileLive(mobileNumber: string): Promise<User | undefined> {
  const cached = findDbUserByMobile(mobileNumber);
  if (cached) return cached;

  const target = sanitizeMobile(mobileNumber);
  if (!target) return undefined;

  const db = getFirestoreDb();
  if (!db) return undefined;

  try {
    const usersSnap = await getDocs(collection(db, 'users'));
    for (const d of usersSnap.docs) {
      const u = d.data() as User;
      if (sanitizeMobile(u.mobile_number || '') === target) {
        const normalized: User = {
          ...u,
          id: u.id || d.id,
          firestore_doc_id: d.id,
          platform: getPlatformForRole(u.role),
          company_scope: Array.isArray(u.company_scope) ? u.company_scope : [],
          credit_limit: u.credit_limit !== undefined && u.credit_limit !== null ? Number(u.credit_limit) : undefined,
          current_outstanding:
            u.current_outstanding !== undefined && u.current_outstanding !== null
              ? Number(u.current_outstanding)
              : undefined,
          credit_gate_enabled: u.credit_gate_enabled === false ? false : true,
          distributor_id: u.distributor_id ?? null,
        };
        const existingIdx = inMemoryDb.users.findIndex(
          (usr) => usr.id === normalized.id || usr.firestore_doc_id === d.id
        );
        if (existingIdx >= 0) {
          inMemoryDb.users[existingIdx] = normalized;
        } else {
          inMemoryDb.users.push(normalized);
        }
        return normalized;
      }
    }
  } catch (err) {
    console.warn('[DATABASE] Live mobile lookup warning:', err);
  }
  return undefined;
}

export function findDbUserById(userId: string): User | undefined {
  return inMemoryDb.users.find((u) => u.id === userId || u.firestore_doc_id === userId);
}

export async function findDbUserByIdLive(userId: string): Promise<User | undefined> {
  if (!userId) return undefined;
  const cached = findDbUserById(userId);
  if (cached) return cached;

  const db = getFirestoreDb();
  if (!db) return undefined;

  try {
    const directSnap = await getDoc(doc(db, 'users', userId));
    if (directSnap.exists()) {
      const u = directSnap.data() as User;
      const normalized: User = {
        ...u,
        id: u.id || directSnap.id,
        firestore_doc_id: directSnap.id,
        platform: getPlatformForRole(u.role),
        company_scope: Array.isArray(u.company_scope) ? u.company_scope : [],
        credit_limit: u.credit_limit !== undefined && u.credit_limit !== null ? Number(u.credit_limit) : undefined,
        current_outstanding:
          u.current_outstanding !== undefined && u.current_outstanding !== null
            ? Number(u.current_outstanding)
            : undefined,
        credit_gate_enabled: u.credit_gate_enabled === false ? false : true,
        distributor_id: u.distributor_id ?? null,
      };
      inMemoryDb.users.push(normalized);
      return normalized;
    }

    const usersSnap = await getDocs(collection(db, 'users'));
    for (const d of usersSnap.docs) {
      const u = d.data() as User;
      if (d.id === userId || u.id === userId) {
        const normalized: User = {
          ...u,
          id: u.id || d.id,
          firestore_doc_id: d.id,
          platform: getPlatformForRole(u.role),
          company_scope: Array.isArray(u.company_scope) ? u.company_scope : [],
          credit_limit: u.credit_limit !== undefined && u.credit_limit !== null ? Number(u.credit_limit) : undefined,
          current_outstanding:
            u.current_outstanding !== undefined && u.current_outstanding !== null
              ? Number(u.current_outstanding)
              : undefined,
          credit_gate_enabled: u.credit_gate_enabled === false ? false : true,
          distributor_id: u.distributor_id ?? null,
        };
        const existingIdx = inMemoryDb.users.findIndex(
          (usr) => usr.id === normalized.id || usr.firestore_doc_id === d.id
        );
        if (existingIdx >= 0) {
          inMemoryDb.users[existingIdx] = normalized;
        } else {
          inMemoryDb.users.push(normalized);
        }
        return normalized;
      }
    }
  } catch (err) {
    console.warn('[DATABASE] Live ID lookup warning:', err);
  }
  return undefined;
}

export function upsertDbUser(user: User): User {
  const targetMobile = sanitizeMobile(user.mobile_number || '');
  const existingIdx = inMemoryDb.users.findIndex(
    (u) =>
      u.id === user.id ||
      (user.firestore_doc_id && u.firestore_doc_id === user.firestore_doc_id) ||
      (targetMobile && sanitizeMobile(u.mobile_number || '') === targetMobile)
  );

  const targetDocId =
    user.firestore_doc_id ||
    (existingIdx >= 0 ? inMemoryDb.users[existingIdx].firestore_doc_id : undefined) ||
    user.id;
  const normalizedUser: User = {
    ...user,
    firestore_doc_id: targetDocId,
    company_scope: Array.isArray(user.company_scope) ? user.company_scope : [],
  };

  if (existingIdx >= 0) {
    inMemoryDb.users[existingIdx] = { ...inMemoryDb.users[existingIdx], ...normalizedUser };
  } else {
    inMemoryDb.users.push(normalizedUser);
    inMemoryDb.metadata.totalRecords += 1;
  }

  // Persist directly to Cloud Firestore using canonical doc ID
  const db = getFirestoreDb();
  if (db) {
    setDoc(doc(db, 'users', targetDocId), stripUndefined(normalizedUser), { merge: true }).catch((err) =>
      console.error('[DATABASE] Firestore upsert user error:', err)
    );
  }

  return normalizedUser;
}

export function addDbUser(userData: {
  name: string;
  email?: string;
  mobile_number: string;
  role: User['role'];
  tenant_id: string;
  password?: string;
  dispatch_point_id?: string | null;
  beat_id?: string | null;
  billing_executive_id?: string | null;
  company_scope?: string[];
  id?: string;
}): { success: boolean; user?: User; error?: string } {
  const sanitize = (m: string) => m.replace(/[\s\-\(\)\+]/g, '').slice(-10);
  const targetMobile = sanitize(userData.mobile_number);

  if (!targetMobile || targetMobile.length !== 10) {
    return { success: false, error: 'Mobile number must be a valid 10-digit number.' };
  }

  const existing = findDbUserByMobile(targetMobile);
  if (existing) {
    return { success: false, error: `A user with mobile number ${targetMobile} already exists in the database.` };
  }

  const { hash, salt } = hashPassword(userData.password || 'Fmcg@2025');
  const userId = userData.id || `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  const newUser: User = {
    id: userId,
    firestore_doc_id: userId,
    tenant_id: userData.tenant_id || 'tenant_ms_enterprises',
    name: userData.name.trim(),
    email: (userData.email || '').trim().toLowerCase(),
    mobile_number: targetMobile,
    password_hash: hash,
    salt: salt,
    role: userData.role,
    company_scope: Array.isArray(userData.company_scope) ? [...userData.company_scope] : [],
    dispatch_point_id: userData.dispatch_point_id !== undefined ? userData.dispatch_point_id : (userData.role === 'DISPATCHER' ? 'dp_central' : null),
    billing_executive_id: userData.billing_executive_id || null,
    beat_id: userData.beat_id || null,
    platform: getPlatformForRole(userData.role),
    is_active: true
  };

  inMemoryDb.users.push(newUser);
  inMemoryDb.metadata.totalRecords += 1;

  // Persist directly to Cloud Firestore
  const db = getFirestoreDb();
  if (db) {
    setDoc(doc(db, 'users', userId), stripUndefined(newUser)).catch((err) =>
      console.error('[DATABASE] Firestore add user error:', err)
    );
  }

  if (newUser.role === 'DISPATCHER' && newUser.dispatch_point_id) {
    syncDbDispatchPointsSupervisor([newUser.dispatch_point_id]);
  }

  return { success: true, user: newUser };
}

export function updateDbUser(userId: string, updates: Partial<User>): User | undefined {
  const user = findDbUserById(userId);
  if (!user) return undefined;

  const prevRole = user.role;
  const prevDpId = user.dispatch_point_id;

  Object.assign(user, updates);
  if (updates.role) {
    user.platform = getPlatformForRole(updates.role);
  }
  const targetDocId = user.firestore_doc_id || user.id || userId;

  // Persist directly to Cloud Firestore
  const db = getFirestoreDb();
  if (db) {
    setDoc(doc(db, 'users', targetDocId), stripUndefined(user), { merge: true }).catch((err) =>
      console.error('[DATABASE] Firestore update user error:', err)
    );
  }

  if (
    prevRole === 'DISPATCHER' ||
    user.role === 'DISPATCHER' ||
    updates.dispatch_point_id !== undefined ||
    updates.name !== undefined ||
    updates.mobile_number !== undefined
  ) {
    syncDbDispatchPointsSupervisor([prevDpId, user.dispatch_point_id]);
  }

  return user;
}

export function syncDbDispatchPointsSupervisor(affectedDpIds?: (string | null | undefined)[]): DispatchPoint[] {
  const { updatedDispatchPoints, changedDispatchPoints } = syncDispatchPointsForUsers(
    inMemoryDb.dispatchPoints,
    inMemoryDb.users,
    affectedDpIds
  );
  inMemoryDb.dispatchPoints = updatedDispatchPoints;

  const db = getFirestoreDb();
  if (db && changedDispatchPoints.length > 0) {
    changedDispatchPoints.forEach((dp) => {
      setDoc(doc(db, 'dispatch_points', dp.id), stripUndefined(dp), { merge: true }).catch((err) =>
        console.error('[DATABASE] Firestore sync dispatch point supervisor error:', err)
      );
    });
  }

  return changedDispatchPoints;
}

export function upsertDbDispatchPoint(dp: DispatchPoint): DispatchPoint {
  const idx = inMemoryDb.dispatchPoints.findIndex((item) => item.id === dp.id);
  const nextDp: DispatchPoint = stripUndefined({ ...dp });
  if (idx >= 0) {
    inMemoryDb.dispatchPoints[idx] = { ...inMemoryDb.dispatchPoints[idx], ...nextDp };
  } else {
    inMemoryDb.dispatchPoints.unshift(nextDp);
  }

  const db = getFirestoreDb();
  if (db) {
    setDoc(doc(db, 'dispatch_points', nextDp.id), stripUndefined(nextDp), { merge: true }).catch((err) =>
      console.error('[DATABASE] Firestore upsert dispatch point error:', err)
    );
  }

  syncDbDispatchPointsSupervisor([nextDp.id]);
  return inMemoryDb.dispatchPoints.find((item) => item.id === nextDp.id) || nextDp;
}

export function updateDbDispatchPoint(dpId: string, updates: Partial<DispatchPoint>): DispatchPoint | undefined {
  const idx = inMemoryDb.dispatchPoints.findIndex((dp) => dp.id === dpId);
  if (idx < 0) return undefined;

  const updated = stripUndefined({
    ...inMemoryDb.dispatchPoints[idx],
    ...updates,
    id: dpId,
  });
  inMemoryDb.dispatchPoints[idx] = updated;

  const db = getFirestoreDb();
  if (db) {
    setDoc(doc(db, 'dispatch_points', dpId), updated, { merge: true }).catch((err) =>
      console.error('[DATABASE] Firestore update dispatch point error:', err)
    );
  }

  return updated;
}

export async function deleteDbDispatchPoint(dpId: string): Promise<boolean> {
  inMemoryDb.dispatchPoints = inMemoryDb.dispatchPoints.filter((dp) => dp.id !== dpId);
  const db = getFirestoreDb();
  if (db) {
    try {
      await deleteDoc(doc(db, 'dispatch_points', dpId));
    } catch (err) {
      console.error('[DATABASE] Firestore delete dispatch point error:', err);
      return false;
    }
  }
  return true;
}

export async function updateDbUserPassword(userId: string, newHash: string, salt: string): Promise<boolean> {
  const user = await findDbUserByIdLive(userId);
  if (!user) return false;

  user.password_hash = newHash;
  user.salt = salt;
  const targetDocId = user.firestore_doc_id || user.id || userId;

  // Persist directly to Cloud Firestore and await confirmation
  const db = getFirestoreDb();
  if (db) {
    try {
      await setDoc(doc(db, 'users', targetDocId), { password_hash: newHash, salt }, { merge: true });
    } catch (err) {
      console.error('[DATABASE] Firestore update password error:', err);
      return false;
    }
  }

  return true;
}

export function updateDbUserCompanyScope(userId: string, companyScope: string[]): boolean {
  const user = findDbUserById(userId);
  if (user) {
    user.company_scope = [...companyScope];
  }
  const targetDocId = user?.firestore_doc_id || user?.id || userId;

  // Persist directly to Cloud Firestore (merge ensures sync even if user was just created on client)
  const db = getFirestoreDb();
  if (db) {
    setDoc(doc(db, 'users', targetDocId), { company_scope: [...companyScope] }, { merge: true }).catch((err) =>
      console.error('[DATABASE] Firestore update company scope error:', err)
    );
  }

  return Boolean(user || db);
}

export function batchUpdateDbUserCompanyScopes(updates: { userId: string; company_scope: string[] }[]): { success: boolean; count: number } {
  let count = 0;
  const db = getFirestoreDb();

  updates.forEach(({ userId, company_scope }) => {
    const user = findDbUserById(userId);
    const targetDocId = user?.firestore_doc_id || user?.id || userId;
    if (user) {
      user.company_scope = [...company_scope];
      count++;
    }
    if (db) {
      setDoc(doc(db, 'users', targetDocId), { company_scope: [...company_scope] }, { merge: true }).catch((err) =>
        console.error('[DATABASE] Firestore batch update company scope error:', err)
      );
      if (!user) count++;
    }
  });

  return { success: true, count };
}

export async function deleteDbUser(userId: string): Promise<{ success: boolean; deletedUser?: User; error?: string }> {
  const existing = findDbUserById(userId);
  const targetDocId = existing?.firestore_doc_id || existing?.id || userId;

  inMemoryDb.users = inMemoryDb.users.filter(
    (u) => u.id !== userId && u.firestore_doc_id !== userId && u.firestore_doc_id !== targetDocId
  );

  const db = getFirestoreDb();
  if (db) {
    try {
      const docIdsToDelete = new Set<string>([targetDocId, userId]);
      const usersSnap = await getDocs(collection(db, 'users'));
      usersSnap.docs.forEach((d) => {
        const data = d.data() as Partial<User>;
        if (d.id === userId || d.id === targetDocId || data?.id === userId) {
          docIdsToDelete.add(d.id);
        }
      });

      for (const idToDelete of docIdsToDelete) {
        await deleteDoc(doc(db, 'users', idToDelete));
      }
    } catch (err: any) {
      if (existing) {
        inMemoryDb.users.push(existing);
      }
      console.error('[DATABASE] Firestore delete user error:', err);
      return {
        success: false,
        error: err?.message || 'Failed to delete user from Cloud Firestore.',
      };
    }
  }

  if (existing && (existing.role === 'DISPATCHER' || existing.dispatch_point_id)) {
    syncDbDispatchPointsSupervisor([existing.dispatch_point_id]);
  }

  return { success: true, deletedUser: existing };
}

// ---------------------------------------------------------------------------
// ORDERS OPERATIONS & ORDER INVOICING TYPE ENFORCEMENT
// ---------------------------------------------------------------------------

export function getDbOrders(): Order[] {
  return inMemoryDb.orders;
}

export function findDbOrderById(orderId: string): Order | undefined {
  return inMemoryDb.orders.find((o) => o.id === orderId || o.firestore_doc_id === orderId);
}

export function upsertDbOrder(order: Order): Order {
  const existingIdx = inMemoryDb.orders.findIndex((o) => o.id === order.id || (order.firestore_doc_id && o.firestore_doc_id === order.firestore_doc_id));
  const targetDocId = order.firestore_doc_id || (existingIdx >= 0 ? inMemoryDb.orders[existingIdx].firestore_doc_id : undefined) || order.id;
  const orderWithDocId: Order = { ...order, firestore_doc_id: targetDocId };

  if (existingIdx >= 0) {
    inMemoryDb.orders[existingIdx] = { ...inMemoryDb.orders[existingIdx], ...orderWithDocId };
  } else {
    inMemoryDb.orders.unshift(orderWithDocId);
    inMemoryDb.metadata.totalRecords += 1;
  }

  // Persist directly to Cloud Firestore using canonical doc ID
  const db = getFirestoreDb();
  if (db) {
    setDoc(doc(db, 'orders', targetDocId), stripUndefined(orderWithDocId), { merge: true }).catch((err) =>
      console.error('[DATABASE] Firestore upsert order error:', err)
    );
  }

  return orderWithDocId;
}

export function updateDbOrder(orderId: string, updates: Partial<Order>): Order | undefined {
  const existingIdx = inMemoryDb.orders.findIndex((o) => o.id === orderId || o.firestore_doc_id === orderId);
  if (existingIdx < 0) return undefined;

  const existingOrder = inMemoryDb.orders[existingIdx];
  const targetDocId = existingOrder.firestore_doc_id || updates.firestore_doc_id || orderId;

  inMemoryDb.orders[existingIdx] = stripUndefined({
    ...existingOrder,
    ...updates,
    firestore_doc_id: targetDocId,
  });

  // Persist directly to Cloud Firestore using canonical doc ID
  const db = getFirestoreDb();
  if (db) {
    setDoc(doc(db, 'orders', targetDocId), stripUndefined(updates), { merge: true }).catch((err) =>
      console.error('[DATABASE] Firestore update order error:', err)
    );
  }

  return inMemoryDb.orders[existingIdx];
}

export function verifyAndApproveDbOrder(
  orderId: string,
  data: {
    order_invoicing_type: OrderInvoicingType;
    approverUserId?: string;
    approvalReason?: string;
    amendedLines?: { sku_id: string; verified_quantity: number }[];
  }
): { success: boolean; order?: Order; error?: string } {
  const existingIdx = inMemoryDb.orders.findIndex((o) => o.id === orderId || o.firestore_doc_id === orderId);
  if (existingIdx < 0) {
    return { success: false, error: `Order with ID ${orderId} not found.` };
  }

  const existingOrder = inMemoryDb.orders[existingIdx];
  const targetDocId = existingOrder.firestore_doc_id || orderId;

  // Business Rule: BE must mark type of the order before approving any order
  if (!data.order_invoicing_type || (data.order_invoicing_type !== 'UNREGISTERED_CASH' && data.order_invoicing_type !== 'REGISTERED_GST')) {
    return {
      success: false,
      error: 'Order Invoicing Type is mandatory for BE approval. Must be either "UNREGISTERED_CASH" or "REGISTERED_GST".',
    };
  }

  const now = new Date().toISOString();
  let newTotal = 0;
  let calculatedTax = 0;

  const updatedLines = (existingOrder.lines || []).map((line) => {
    const amendment = data.amendedLines?.find((a) => a.sku_id === line.sku_id);
    const verifiedQty = amendment !== undefined ? Math.max(0, Number(amendment.verified_quantity)) : (line.verified_quantity ?? line.quantity);
    const isAmended = verifiedQty < line.quantity;

    const lineTotal = verifiedQty * line.unit_price;
    newTotal += lineTotal;

    const matchedSku = inMemoryDb.skus.find((s) => s.id === line.sku_id);
    const taxRate = matchedSku?.tax_rate !== undefined ? Number(matchedSku.tax_rate) : 18;
    calculatedTax += lineTotal * (taxRate / 100);

    return {
      ...line,
      verified_quantity: verifiedQty,
      is_amended: isAmended,
      total: lineTotal,
    };
  });

  const newTaxAmount = Math.round(calculatedTax * 100) / 100;
  const newTotalWithGst = Math.round((newTotal + newTaxAmount) * 100) / 100;

  const updatedOrder: Order = {
    ...existingOrder,
    status: 'VERIFIED',
    order_invoicing_type: data.order_invoicing_type,
    lines: updatedLines,
    total_amount: newTotalWithGst,
    tax_amount: newTaxAmount,
    original_total_amount: existingOrder.original_total_amount || existingOrder.total_amount,
    verified_by_user_id: data.approverUserId || 'usr_billing_1',
    verified_at: now,
    be_approval_reason: data.approvalReason || existingOrder.be_approval_reason || null,
    is_locked: true,
    firestore_doc_id: targetDocId,
  };

  const sanitizedOrder = stripUndefined(updatedOrder);
  inMemoryDb.orders[existingIdx] = sanitizedOrder;

  // Persist directly to Cloud Firestore using canonical doc ID
  const db = getFirestoreDb();
  if (db) {
    setDoc(doc(db, 'orders', targetDocId), sanitizedOrder, { merge: true }).catch((err) =>
      console.error('[DATABASE] Firestore verify order error:', err)
    );
  }

  return { success: true, order: sanitizedOrder };
}

export async function getLivePartyCreditProfileFromDb(userId: string): Promise<PartyCreditProfile | null> {
  const db = getFirestoreDb();
  let user = await findDbUserByIdLive(userId);

  if (db) {
    try {
      const [usersSnap, distSnap, ordersSnap, invSnap, paySnap, settingsSnap] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'distributors')),
        getDocs(collection(db, 'orders')),
        getDocs(collection(db, 'invoices')),
        getDocs(collection(db, 'payments')),
        getDocs(collection(db, 'tenant_settings')),
      ]);

      const allUsers = usersSnap.docs.map((d) => {
        const u = d.data() as User;
        return {
          ...u,
          id: u.id || d.id,
          firestore_doc_id: d.id,
          platform: getPlatformForRole(u.role),
          company_scope: Array.isArray(u.company_scope) ? u.company_scope : [],
          credit_limit: u.credit_limit !== undefined && u.credit_limit !== null ? Number(u.credit_limit) : undefined,
          current_outstanding:
            u.current_outstanding !== undefined && u.current_outstanding !== null
              ? Number(u.current_outstanding)
              : undefined,
          credit_gate_enabled: u.credit_gate_enabled === false ? false : true,
          distributor_id: u.distributor_id ?? null,
        } as User;
      });
      user = allUsers.find((u) => u.id === userId || u.firestore_doc_id === userId) || user;
      if (!user) return null;

      const tenantId = user.tenant_id;
      const settingsDoc = settingsSnap.docs.find((s) => s.id === tenantId)?.data() as TenantSettings | undefined;
      const defaultLimit = settingsDoc?.credit_limit_default ?? inMemoryDb.tenantSettings[tenantId]?.credit_limit_default ?? 50000;

      const distributors = distSnap.docs
        .map((d) => d.data() as DistributorInstitution)
        .filter((d) => !tenantId || d.tenant_id === tenantId);
      const orders = deduplicateOrders(
        ordersSnap.docs.map((d) => normalizeServerOrder(d.id, d.data()))
      ).filter((o) => !tenantId || o.tenant_id === tenantId);
      const invoices = invSnap.docs
        .map((d) => d.data() as Invoice)
        .filter((i) => !tenantId || i.tenant_id === tenantId);
      const payments = paySnap.docs
        .map((d) => d.data() as Payment)
        .filter((p) => !tenantId || p.tenant_id === tenantId);

      return computeUserLiveCreditProfile(user, {
        distributors,
        orders,
        invoices,
        payments,
        defaultCreditLimit: defaultLimit,
      });
    } catch (err) {
      console.warn('[DATABASE] Live Firestore credit profile fetch error, falling back to cache:', err);
    }
  }

  if (!user) return null;
  const tenantId = user.tenant_id;
  const defaultLimit = inMemoryDb.tenantSettings[tenantId]?.credit_limit_default ?? 50000;
  return computeUserLiveCreditProfile(user, {
    distributors: inMemoryDb.distributors.filter((d) => !tenantId || d.tenant_id === tenantId),
    orders: inMemoryDb.orders.filter((o) => !tenantId || o.tenant_id === tenantId),
    invoices: inMemoryDb.invoices.filter((i) => !tenantId || i.tenant_id === tenantId),
    payments: inMemoryDb.payments.filter((p) => !tenantId || p.tenant_id === tenantId),
    defaultCreditLimit: defaultLimit,
  });
}
