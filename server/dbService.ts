import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, setDoc, updateDoc } from 'firebase/firestore';
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

  return {
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
    status: raw.status || 'PENDING_VERIFICATION',
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
  };
}

/**
 * Deduplicates orders by unique ID or order_number to guarantee unique records.
 */
export function deduplicateOrders(orders: Order[]): Order[] {
  const seen = new Set<string>();
  const result: Order[] = [];
  for (const o of orders) {
    const key = o.id || o.order_number;
    if (key && !seen.has(key)) {
      seen.add(key);
      result.push(o);
    }
  }
  return result;
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
      users: usersSnap.docs.map((d) => d.data() as User),
      metadata: {
        lastSeededAt: new Date().toISOString(),
        version: 2,
        totalRecords: usersSnap.size + ordersSnap.size + skusSnap.size,
      },
    };

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

export function findDbUserById(userId: string): User | undefined {
  return inMemoryDb.users.find((u) => u.id === userId);
}

export function upsertDbUser(user: User): User {
  const targetMobile = sanitizeMobile(user.mobile_number || '');
  const existingIdx = inMemoryDb.users.findIndex(
    (u) => u.id === user.id || (targetMobile && sanitizeMobile(u.mobile_number || '') === targetMobile)
  );

  if (existingIdx >= 0) {
    inMemoryDb.users[existingIdx] = { ...inMemoryDb.users[existingIdx], ...user };
  } else {
    inMemoryDb.users.push(user);
    inMemoryDb.metadata.totalRecords += 1;
  }

  // Persist directly to Cloud Firestore
  const db = getFirestoreDb();
  if (db) {
    setDoc(doc(db, 'users', user.id), user).catch((err) =>
      console.error('[DATABASE] Firestore upsert user error:', err)
    );
  }

  return user;
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

  const newUser: User = {
    id: userData.id || `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    tenant_id: userData.tenant_id || 'tenant_ms_enterprises',
    name: userData.name.trim(),
    email: (userData.email || '').trim().toLowerCase(),
    mobile_number: targetMobile,
    password_hash: hash,
    salt: salt,
    role: userData.role,
    company_scope: [],
    dispatch_point_id: userData.dispatch_point_id !== undefined ? userData.dispatch_point_id : (userData.role === 'DISPATCHER' ? 'dp_central' : null),
    billing_executive_id: userData.billing_executive_id || null,
    beat_id: userData.beat_id || null,
    platform: userData.role === 'DISPATCHER' || userData.role === 'COMMISSION_AGENT' || userData.role === 'SALES_EXECUTIVE' ? 'MOBILE' : 'WEB',
    is_active: true
  };

  inMemoryDb.users.push(newUser);
  inMemoryDb.metadata.totalRecords += 1;

  // Persist directly to Cloud Firestore
  const db = getFirestoreDb();
  if (db) {
    setDoc(doc(db, 'users', newUser.id), newUser).catch((err) =>
      console.error('[DATABASE] Firestore add user error:', err)
    );
  }

  return { success: true, user: newUser };
}

export function updateDbUser(userId: string, updates: Partial<User>): User | undefined {
  const user = inMemoryDb.users.find((u) => u.id === userId);
  if (!user) return undefined;

  Object.assign(user, updates);

  // Persist directly to Cloud Firestore
  const db = getFirestoreDb();
  if (db) {
    setDoc(doc(db, 'users', userId), user, { merge: true }).catch((err) =>
      console.error('[DATABASE] Firestore update user error:', err)
    );
  }

  return user;
}

export function updateDbUserPassword(userId: string, newHash: string, salt: string): boolean {
  const user = inMemoryDb.users.find((u) => u.id === userId);
  if (!user) return false;

  user.password_hash = newHash;
  user.salt = salt;

  // Persist directly to Cloud Firestore
  const db = getFirestoreDb();
  if (db) {
    updateDoc(doc(db, 'users', userId), { password_hash: newHash, salt }).catch((err) =>
      console.error('[DATABASE] Firestore update password error:', err)
    );
  }

  return true;
}

export function updateDbUserCompanyScope(userId: string, companyScope: string[]): boolean {
  const user = inMemoryDb.users.find((u) => u.id === userId);
  if (!user) return false;

  user.company_scope = [...companyScope];

  // Persist directly to Cloud Firestore
  const db = getFirestoreDb();
  if (db) {
    updateDoc(doc(db, 'users', userId), { company_scope: [...companyScope] }).catch((err) =>
      console.error('[DATABASE] Firestore update company scope error:', err)
    );
  }

  return true;
}

export function batchUpdateDbUserCompanyScopes(updates: { userId: string; company_scope: string[] }[]): { success: boolean; count: number } {
  let count = 0;
  const db = getFirestoreDb();

  updates.forEach(({ userId, company_scope }) => {
    const user = inMemoryDb.users.find((u) => u.id === userId);
    if (user) {
      user.company_scope = [...company_scope];
      count++;
      if (db) {
        updateDoc(doc(db, 'users', userId), { company_scope: [...company_scope] }).catch((err) =>
          console.error('[DATABASE] Firestore batch update company scope error:', err)
        );
      }
    }
  });

  return { success: true, count };
}

// ---------------------------------------------------------------------------
// ORDERS OPERATIONS & ORDER INVOICING TYPE ENFORCEMENT
// ---------------------------------------------------------------------------

export function getDbOrders(): Order[] {
  return inMemoryDb.orders;
}

export function findDbOrderById(orderId: string): Order | undefined {
  return inMemoryDb.orders.find((o) => o.id === orderId);
}

export function upsertDbOrder(order: Order): Order {
  const existingIdx = inMemoryDb.orders.findIndex((o) => o.id === order.id);
  if (existingIdx >= 0) {
    inMemoryDb.orders[existingIdx] = { ...inMemoryDb.orders[existingIdx], ...order };
  } else {
    inMemoryDb.orders.unshift(order);
    inMemoryDb.metadata.totalRecords += 1;
  }

  // Persist directly to Cloud Firestore
  const db = getFirestoreDb();
  if (db) {
    setDoc(doc(db, 'orders', order.id), order).catch((err) =>
      console.error('[DATABASE] Firestore upsert order error:', err)
    );
  }

  return order;
}

export function updateDbOrder(orderId: string, updates: Partial<Order>): Order | undefined {
  const existingIdx = inMemoryDb.orders.findIndex((o) => o.id === orderId);
  if (existingIdx < 0) return undefined;

  inMemoryDb.orders[existingIdx] = {
    ...inMemoryDb.orders[existingIdx],
    ...updates,
  };

  // Persist directly to Cloud Firestore
  const db = getFirestoreDb();
  if (db) {
    setDoc(doc(db, 'orders', orderId), updates, { merge: true }).catch((err) =>
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
  const existingIdx = inMemoryDb.orders.findIndex((o) => o.id === orderId);
  if (existingIdx < 0) {
    return { success: false, error: `Order with ID ${orderId} not found.` };
  }

  const existingOrder = inMemoryDb.orders[existingIdx];

  // Business Rule: BE must mark type of the order before approving any order
  if (!data.order_invoicing_type || (data.order_invoicing_type !== 'UNREGISTERED_CASH' && data.order_invoicing_type !== 'REGISTERED_GST')) {
    return {
      success: false,
      error: 'Order Invoicing Type is mandatory for BE approval. Must be either "UNREGISTERED_CASH" or "REGISTERED_GST".',
    };
  }

  const now = new Date().toISOString();
  let newTotal = 0;
  let hasAmendments = false;

  const updatedLines = (existingOrder.lines || []).map((line) => {
    const amendment = data.amendedLines?.find((a) => a.sku_id === line.sku_id);
    const verifiedQty = amendment !== undefined ? Math.max(0, Number(amendment.verified_quantity)) : (line.verified_quantity ?? line.quantity);
    const isAmended = verifiedQty < line.quantity;
    if (isAmended) hasAmendments = true;

    const lineTotal = verifiedQty * line.unit_price;
    newTotal += lineTotal;

    return {
      ...line,
      verified_quantity: verifiedQty,
      is_amended: isAmended,
      total: lineTotal,
    };
  });

  const newTaxAmount = Math.round(newTotal * 0.18 * 100) / 100;
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
  };

  inMemoryDb.orders[existingIdx] = updatedOrder;

  // Persist directly to Cloud Firestore
  const db = getFirestoreDb();
  if (db) {
    setDoc(doc(db, 'orders', orderId), updatedOrder).catch((err) =>
      console.error('[DATABASE] Firestore verify order error:', err)
    );
  }

  return { success: true, order: updatedOrder };
}
