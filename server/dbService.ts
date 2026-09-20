import fs from 'fs';
import path from 'path';
import {
  Tenant,
  TenantSettings,
  Company,
  DispatchPoint,
  SKU,
  Retailer,
  Order,
  OrderInvoicingType,
  StockLedgerEntry,
  Invoice,
  Claim,
  Payment,
  User,
  PrinciplePurchaseOrder,
  WorkflowNotification
} from '../src/types';
import {
  INITIAL_TENANTS,
  INITIAL_TENANT_SETTINGS,
  INITIAL_COMPANIES,
  INITIAL_DISPATCH_POINTS,
  INITIAL_SKUS,
  INITIAL_RETAILERS,
  INITIAL_ORDERS,
  INITIAL_STOCK_LEDGER,
  INITIAL_INVOICES,
  INITIAL_CLAIMS,
  INITIAL_PAYMENTS,
  INITIAL_USERS,
  INITIAL_PURCHASE_ORDERS,
  INITIAL_WORKFLOW_NOTIFICATIONS
} from '../src/data/initialData';
import { hashPassword } from './authService';

export interface DatabaseSchema {
  tenants: Tenant[];
  tenantSettings: Record<string, TenantSettings>;
  companies: Company[];
  dispatchPoints: DispatchPoint[];
  skus: SKU[];
  retailers: Retailer[];
  orders: Order[];
  purchaseOrders: PrinciplePurchaseOrder[];
  workflowNotifications: WorkflowNotification[];
  stockLedger: StockLedgerEntry[];
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

// Database service for persistent and in-memory multi-tenant operations
function generateDefaultDatabase(): DatabaseSchema {
  // Pre-seed users with valid PBKDF2 hashes for 'Fmcg@2025' and 'Admin@123'
  const seededUsers: User[] = INITIAL_USERS.map((u) => {
    // Default initial password for all seeded accounts is Fmcg@2025 (or Admin@123)
    const initialPwd = u.role === 'ADMIN' ? 'Admin@123' : 'Fmcg@2025';
    const { hash, salt } = hashPassword(initialPwd);
    return {
      ...u,
      password_hash: hash,
      salt: salt
    };
  });

  const total =
    INITIAL_TENANTS.length +
    INITIAL_COMPANIES.length +
    INITIAL_DISPATCH_POINTS.length +
    INITIAL_SKUS.length +
    INITIAL_RETAILERS.length +
    INITIAL_ORDERS.length +
    INITIAL_STOCK_LEDGER.length +
    INITIAL_INVOICES.length +
    INITIAL_CLAIMS.length +
    INITIAL_PAYMENTS.length +
    seededUsers.length;

  return {
    tenants: [...INITIAL_TENANTS],
    tenantSettings: { ...INITIAL_TENANT_SETTINGS },
    companies: [...INITIAL_COMPANIES],
    dispatchPoints: [...INITIAL_DISPATCH_POINTS],
    skus: [...INITIAL_SKUS],
    retailers: [...INITIAL_RETAILERS],
    orders: [...INITIAL_ORDERS],
    purchaseOrders: [...INITIAL_PURCHASE_ORDERS],
    workflowNotifications: [...INITIAL_WORKFLOW_NOTIFICATIONS],
    stockLedger: [...INITIAL_STOCK_LEDGER],
    invoices: [...INITIAL_INVOICES],
    claims: [...INITIAL_CLAIMS],
    payments: [...INITIAL_PAYMENTS],
    users: seededUsers,
    metadata: {
      lastSeededAt: new Date().toISOString(),
      version: 1,
      totalRecords: total
    }
  };
}

let inMemoryDb: DatabaseSchema = generateDefaultDatabase();

export function initDatabase(): DatabaseSchema {
  console.log(`[DATABASE] Initialized dynamic DB store with ${inMemoryDb.users.length} users and ${inMemoryDb.skus.length} SKUs.`);
  return inMemoryDb;
}

export function saveDatabaseToDisk(): boolean {
  return true;
}

export function getDatabase(): DatabaseSchema {
  return inMemoryDb;
}

export function seedDatabase(force = false): { success: boolean; totalRecords: number; message: string } {
  inMemoryDb = generateDefaultDatabase();
  saveDatabaseToDisk();
  return {
    success: true,
    totalRecords: inMemoryDb.metadata.totalRecords,
    message: `Database successfully seeded with ${inMemoryDb.metadata.totalRecords} records across all collections.`
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
    return inMemoryDb.users[existingIdx];
  } else {
    inMemoryDb.users.push(user);
    inMemoryDb.metadata.totalRecords += 1;
    saveDatabaseToDisk();
    return user;
  }
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
    id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    tenant_id: userData.tenant_id || 'tenant_ms_enterprises',
    name: userData.name.trim(),
    email: (userData.email || '').trim().toLowerCase(),
    mobile_number: targetMobile,
    password_hash: hash,
    salt: salt,
    role: userData.role,
    company_scope: [],
    dispatch_point_id: userData.dispatch_point_id !== undefined ? userData.dispatch_point_id : (userData.role === 'DISPATCHER' ? 'dp_central' : null),
    beat_id: userData.beat_id || null,
    platform: userData.role === 'DISPATCHER' || userData.role === 'AGENT' ? 'MOBILE' : 'WEB',
    is_active: true
  };

  inMemoryDb.users.push(newUser);
  inMemoryDb.metadata.totalRecords += 1;
  saveDatabaseToDisk();

  return { success: true, user: newUser };
}

export function updateDbUserPassword(userId: string, newHash: string, salt: string): boolean {
  const user = inMemoryDb.users.find((u) => u.id === userId);
  if (!user) return false;

  user.password_hash = newHash;
  user.salt = salt;
  saveDatabaseToDisk();
  return true;
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
    saveDatabaseToDisk();
    return inMemoryDb.orders[existingIdx];
  } else {
    inMemoryDb.orders.unshift(order);
    inMemoryDb.metadata.totalRecords += 1;
    saveDatabaseToDisk();
    return order;
  }
}

export function updateDbOrder(orderId: string, updates: Partial<Order>): Order | undefined {
  const existingIdx = inMemoryDb.orders.findIndex((o) => o.id === orderId);
  if (existingIdx < 0) return undefined;

  inMemoryDb.orders[existingIdx] = {
    ...inMemoryDb.orders[existingIdx],
    ...updates,
  };
  saveDatabaseToDisk();
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
  saveDatabaseToDisk();

  return { success: true, order: updatedOrder };
}

