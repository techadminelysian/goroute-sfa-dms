import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  writeBatch,
  onSnapshot,
  Unsubscribe
} from 'firebase/firestore';
import { getDb, isFirebaseConfigured, getFirebaseConfig, getFirebaseAuth } from './config';
import {
  Tenant,
  TenantSettings,
  Company,
  DispatchPoint,
  SKU,
  Retailer,
  DistributorInstitution,
  Beat,
  Order,
  OrderLine,
  OrderStatus,
  StockLedgerEntry,
  Invoice,
  Claim,
  Payment,
  PartyLedgerEntry,
  User
} from '../types';
import { getPlatformForRole } from '../utils/authClient';
import { computeUserLiveCreditProfile, PartyCreditProfile } from '../utils/creditLedger';


export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): FirestoreErrorInfo {
  const auth = getFirebaseAuth();
  const rawMsg = error instanceof Error ? error.message : String(error);
  const errInfo: FirestoreErrorInfo = {
    error: rawMsg,
    authInfo: {
      userId: auth?.currentUser?.uid || null,
      email: auth?.currentUser?.email || null,
      emailVerified: auth?.currentUser?.emailVerified || null,
      isAnonymous: auth?.currentUser?.isAnonymous || null,
      tenantId: auth?.currentUser?.tenantId || null,
      providerInfo: auth?.currentUser?.providerData?.map((provider) => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || [],
    },
    operationType,
    path,
  };
  console.warn('Firestore Operation Notice:', JSON.stringify(errInfo));
  return errInfo;
}

export interface FirestoreStoreData {
  tenants: Tenant[];
  tenantSettings: Record<string, TenantSettings>;
  companies: Company[];
  dispatchPoints: DispatchPoint[];
  skus: SKU[];
  beats: Beat[];
  retailers: Retailer[];
  distributors: DistributorInstitution[];
  orders: Order[];
  stockLedger: StockLedgerEntry[];
  invoices: Invoice[];
  claims: Claim[];
  payments: Payment[];
  partyLedger: PartyLedgerEntry[];
  users: User[];
}

export const COLLECTIONS = {
  TENANTS: 'tenants',
  TENANT_SETTINGS: 'tenant_settings',
  COMPANIES: 'companies',
  DISPATCH_POINTS: 'dispatch_points',
  SKUS: 'skus',
  BEATS: 'beats',
  RETAILERS: 'retailers',
  DISTRIBUTORS: 'distributors',
  ORDERS: 'orders',
  STOCK_LEDGER: 'stock_ledger',
  INVOICES: 'invoices',
  CLAIMS: 'claims',
  PAYMENTS: 'payments',
  PARTY_LEDGER: 'party_ledger',
  USERS: 'users',
  METADATA: '_metadata'
} as const;

/**
 * Checks if the Firestore database is empty or has not been seeded yet.
 */
export const checkDatabaseNeedsSeeding = async (): Promise<{ needsSeeding: boolean; error?: string }> => {
  const db = getDb();
  if (!db) return { needsSeeding: false, error: 'Firebase SDK not initialized' };

  try {
    const metaDocRef = doc(db, COLLECTIONS.METADATA, 'initial_seed');
    const metaSnap = await getDoc(metaDocRef);
    if (metaSnap.exists()) {
      return { needsSeeding: false };
    }

    // Also check if tenants collection has any items
    const tenantsSnap = await getDocs(collection(db, COLLECTIONS.TENANTS));
    return { needsSeeding: tenantsSnap.empty };
  } catch (error: any) {
    console.warn('Could not query Firestore metadata for seeding check:', error);
    return { 
      needsSeeding: false, 
      error: error?.code || error?.message || 'Database query error' 
    };
  }
};

export interface SeedProgressCallback {
  (step: string, current: number, total: number): void;
}

/**
 * Seeds all initial static data into Firestore collections with granular batches and progress reporting.
 */
export const seedInitialFirestoreData = async (
  force: boolean = false,
  onProgress?: SeedProgressCallback
): Promise<{ success: boolean; message: string; count: number; error?: string; stepFailed?: string }> => {
  const db = getDb();
  if (!db) {
    return { 
      success: false, 
      message: 'Firestore is not configured or initialized. Verify project ID and credentials.', 
      count: 0,
      error: 'Firebase database instance is null' 
    };
  }

  try {
    if (!force) {
      const checkResult = await checkDatabaseNeedsSeeding();
      if (!checkResult.needsSeeding && !checkResult.error) {
        return { success: true, message: 'Firestore database is already populated with data.', count: 0 };
      }
    }

    let totalRecords = 0;
    let seedSource: any = {};
    try {
      const res = await fetch('/api/bootstrap');
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.database) {
          seedSource = json.database;
        }
      }
    } catch (e) {
      console.warn('Could not fetch bootstrap data from server for Firestore seeding', e);
    }

    const collectionsToSeed = [
      { name: COLLECTIONS.TENANTS, data: seedSource.tenants || [], label: 'Tenants' },
      { 
        name: COLLECTIONS.TENANT_SETTINGS, 
        data: Object.entries(seedSource.tenantSettings || {}).map(([id, val]: [string, any]) => ({ ...val, id })), 
        label: 'Tenant Settings' 
      },
      { name: COLLECTIONS.COMPANIES, data: seedSource.companies || [], label: 'Principal Companies' },
      { name: COLLECTIONS.DISPATCH_POINTS, data: seedSource.dispatchPoints || [], label: 'Warehouses / Depots' },
      { name: COLLECTIONS.SKUS, data: seedSource.skus || [], label: 'SKU Catalog' },
      { name: COLLECTIONS.BEATS, data: seedSource.beats || [], label: 'Beats & Field Routes' },
      { name: COLLECTIONS.RETAILERS, data: seedSource.retailers || [], label: 'Retail Outlets' },
      { name: COLLECTIONS.DISTRIBUTORS, data: seedSource.distributors || [], label: 'Distributors & Institutions' },
      { name: COLLECTIONS.ORDERS, data: seedSource.orders || [], label: 'Sales Orders' },
      { name: COLLECTIONS.STOCK_LEDGER, data: seedSource.stockLedger || [], label: 'Stock Ledger' },
      { name: COLLECTIONS.INVOICES, data: seedSource.invoices || [], label: 'Invoices' },
      { name: COLLECTIONS.CLAIMS, data: seedSource.claims || [], label: 'Claims' },
      { name: COLLECTIONS.PAYMENTS, data: seedSource.payments || [], label: 'Payment Collections' },
      { name: COLLECTIONS.USERS, data: seedSource.users || [], label: 'User Master Accounts' },
    ];

    const totalSteps = collectionsToSeed.length + 1;
    let stepIndex = 0;

    for (const col of collectionsToSeed) {
      stepIndex++;
      if (onProgress) {
        onProgress(`Writing ${col.label} (${col.data.length} records)...`, stepIndex, totalSteps);
      }

      // Chunk into batches of up to 200 items (Firestore limit is 500)
      const chunkSize = 200;
      for (let i = 0; i < col.data.length; i += chunkSize) {
        const chunk = col.data.slice(i, i + chunkSize);
        const batch = writeBatch(db);
        for (const item of chunk) {
          const docId = (item as any).id || `doc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          const ref = doc(db, col.name, docId);
          batch.set(ref, stripUndefined(item));
          totalRecords++;
        }
        await batch.commit();
      }
    }

    // Write Metadata Marker
    stepIndex++;
    if (onProgress) {
      onProgress('Finalizing seed metadata...', stepIndex, totalSteps);
    }
    const metaRef = doc(db, COLLECTIONS.METADATA, 'initial_seed');
    await setDoc(metaRef, {
      seeded_at: new Date().toISOString(),
      version: 1,
      total_records: totalRecords,
      tenants_count: (seedSource.tenants || []).length,
      companies_count: (seedSource.companies || []).length,
      skus_count: (seedSource.skus || []).length,
      retailers_count: (seedSource.retailers || []).length,
      orders_count: (seedSource.orders || []).length,
    });

    return {
      success: true,
      message: `Successfully seeded ${totalRecords} records across all 12 Firestore collections!`,
      count: totalRecords
    };
  } catch (error: any) {
    handleFirestoreError(error, OperationType.WRITE, 'initial_seed');

    let friendlyMessage = error?.message || 'Failed to seed Firestore data';
    const errorCode = error?.code || '';

    if (errorCode === 'permission-denied' || friendlyMessage.includes('permission-denied') || friendlyMessage.includes('Missing or insufficient permissions')) {
      friendlyMessage = 'PERMISSION DENIED: Your Firebase Firestore Security Rules are blocking writes. Go to Firebase Console > Firestore Database > Rules and set "allow read, write: if true;" for testing.';
    } else if (errorCode === 'not-found' || friendlyMessage.includes('not-found') || friendlyMessage.includes('database does not exist')) {
      friendlyMessage = 'DATABASE NOT FOUND: Cloud Firestore has not been created yet in your Firebase Project. Go to Firebase Console > Build > Firestore Database and click "Create Database".';
    } else if (errorCode === 'unavailable') {
      friendlyMessage = 'FIRESTORE UNAVAILABLE: Unable to reach Firebase servers. Please check your internet connection or project status.';
    }

    return {
      success: false,
      message: friendlyMessage,
      count: 0,
      error: errorCode || error?.message,
    };
  }
};

export interface FetchFirestoreResult {
  success: boolean;
  data: FirestoreStoreData | null;
  isPermissionDenied: boolean;
  errorMessage?: string;
}

/**
 * Recursively strips `undefined` properties from objects and array items
 * because Cloud Firestore rejects any `undefined` field values on writes.
 */
export function stripUndefined<T>(value: T): T {
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
 * Normalizes an order document from Firestore on ingestion.
 * Resolves missing tenant_id, maps lines from items, and ensures consistent keys,
 * while strictly preserving the status from Firestore as-is (no CLEARED to VERIFIED conversion).
 */
export const normalizeFirestoreOrder = (docId: string, raw: any): Order => {
  if (!raw) {
    return {
      id: docId,
      tenant_id: 'tenant_ms_enterprises',
      order_number: docId,
      channel: 'GT',
      company_id: '',
      retailer_id: null,
      retailer_name_raw: '',
      beat_name: '',
      dispatch_point_id: '',
      created_by_user_id: '',
      order_date: new Date().toISOString(),
      delivery_date: '',
      status: 'PENDING_VERIFICATION',
      total_amount: 0,
      tax_amount: 0,
      lines: [],
      has_below_cost_lines: false,
    };
  }

  const tenantId = raw.tenant_id || 'tenant_ms_enterprises';
  const orderId = raw.id || docId;
  const orderNumber = raw.order_number || docId;

  let lines: OrderLine[] = [];
  if (Array.isArray(raw.lines) && raw.lines.length > 0) {
    lines = raw.lines;
  } else if (Array.isArray(raw.items) && raw.items.length > 0) {
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
      principal_discount_slab: it.principal_discount_slab || undefined,
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
    dispatch_point_id: raw.dispatch_point_id || '',
    billing_executive_id: raw.billing_executive_id || null,
    created_by_user_id: raw.created_by_user_id || '',
    commission_agent_id: raw.commission_agent_id || null,
    commission_agent_name: raw.commission_agent_name || undefined,
    order_date: raw.order_date || new Date().toISOString(),
    delivery_date: raw.delivery_date || '',
    status: resolvedStatus,
    total_amount: Number(raw.total_amount) || lines.reduce((s, l) => s + (Number(l.total) || 0), 0),
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
    confirmed_at: raw.confirmed_at || null,
    dispatch_date: raw.dispatch_date || null,
    dispatch_batch_id: raw.dispatch_batch_id || null,
    firestore_doc_id: docId,
  });
};

export const ORDER_STATUS_PRIORITY: Record<string, number> = {
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
 * Deduplicates orders by unique ID while preferring the highest workflow state.
 */
export const deduplicateOrders = (orders: Order[]): Order[] => {
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
};

/**
 * Fetches all collections from Firestore to hydrate local memory store.
 */
export const fetchAllFromFirestore = async (): Promise<FetchFirestoreResult> => {
  const db = getDb();
  if (!db) {
    return {
      success: false,
      data: null,
      isPermissionDenied: false,
      errorMessage: 'Firebase database instance is not initialized',
    };
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
      partyLedgerSnap,
      usersSnap,
    ] = await Promise.all([
      getDocs(collection(db, COLLECTIONS.TENANTS)),
      getDocs(collection(db, COLLECTIONS.TENANT_SETTINGS)),
      getDocs(collection(db, COLLECTIONS.COMPANIES)),
      getDocs(collection(db, COLLECTIONS.DISPATCH_POINTS)),
      getDocs(collection(db, COLLECTIONS.SKUS)),
      getDocs(collection(db, COLLECTIONS.BEATS)),
      getDocs(collection(db, COLLECTIONS.RETAILERS)),
      getDocs(collection(db, COLLECTIONS.DISTRIBUTORS)),
      getDocs(collection(db, COLLECTIONS.ORDERS)),
      getDocs(collection(db, COLLECTIONS.STOCK_LEDGER)),
      getDocs(collection(db, COLLECTIONS.INVOICES)),
      getDocs(collection(db, COLLECTIONS.CLAIMS)),
      getDocs(collection(db, COLLECTIONS.PAYMENTS)),
      getDocs(collection(db, COLLECTIONS.PARTY_LEDGER)),
      getDocs(collection(db, COLLECTIONS.USERS)),
    ]);

    const tenantSettings: Record<string, TenantSettings> = {};
    tenantSettingsSnap.docs.forEach((d) => {
      const data = d.data() as TenantSettings;
      tenantSettings[d.id] = data;
    });

    const data: FirestoreStoreData = {
      tenants: tenantsSnap.docs.map((d) => d.data() as Tenant),
      tenantSettings,
      companies: companiesSnap.docs.map((d) => d.data() as Company),
      dispatchPoints: dispatchPointsSnap.docs.map((d) => d.data() as DispatchPoint),
      skus: skusSnap.docs.map((d) => d.data() as SKU),
      beats: beatsSnap.docs.map((d) => d.data() as Beat),
      retailers: retailersSnap.docs.map((d) => d.data() as Retailer),
      distributors: distributorsSnap.docs.map((d) => d.data() as DistributorInstitution),
      orders: deduplicateOrders(ordersSnap.docs.map((d) => normalizeFirestoreOrder(d.id, d.data()))),
      stockLedger: stockLedgerSnap.docs.map((d) => d.data() as StockLedgerEntry),
      invoices: invoicesSnap.docs.map((d) => d.data() as Invoice),
      claims: claimsSnap.docs.map((d) => d.data() as Claim),
      payments: paymentsSnap.docs.map((d) => d.data() as Payment),
      partyLedger: partyLedgerSnap.docs.map((d) => ({ ...(d.data() as PartyLedgerEntry), id: (d.data() as any).id || d.id })),
      users: usersSnap.docs.map((d) => normalizeFirestoreUser(d.id, d.data())),
    };

    return {
      success: true,
      data,
      isPermissionDenied: false,
    };
  } catch (error: any) {
    const errInfo = handleFirestoreError(error, OperationType.GET, 'all_collections');
    const isPermission = 
      error?.code === 'permission-denied' || 
      errInfo.error.includes('Missing or insufficient permissions') ||
      errInfo.error.includes('permission-denied');

    return {
      success: false,
      data: null,
      isPermissionDenied: isPermission,
      errorMessage: errInfo.error,
    };
  }
};

/**
 * Persists an individual record to Firestore in the background.
 */
export const saveRecordToFirestore = async (collectionName: string, docId: string, data: any): Promise<boolean> => {
  const db = getDb();
  if (!db) return false;

  const targetDocId =
    (collectionName === COLLECTIONS.ORDERS || collectionName === COLLECTIONS.USERS) && data?.firestore_doc_id
      ? data.firestore_doc_id
      : docId;

  try {
    const docRef = doc(db, collectionName, targetDocId);
    const sanitizedData = stripUndefined(data);
    await setDoc(docRef, sanitizedData, { merge: true });
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${collectionName}/${targetDocId}`);
    return false;
  }
};

/**
 * Deletes an individual record from Firestore in the background.
 */
export const deleteRecordFromFirestore = async (collectionName: string, docId: string): Promise<boolean> => {
  const db = getDb();
  if (!db) return false;

  try {
    const docRef = doc(db, collectionName, docId);
    await deleteDoc(docRef);
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${collectionName}/${docId}`);
    return false;
  }
};

/**
 * Deletes a user record from Firestore across canonical docId, payload userId,
 * and any duplicate documents referencing data.id === userId.
 */
export const deleteUserFromFirestore = async (
  userId: string,
  firestoreDocId?: string
): Promise<{ success: boolean; error?: string }> => {
  const db = getDb();
  if (!db) return { success: true };

  try {
    const docIdsToDelete = new Set<string>();
    if (firestoreDocId) docIdsToDelete.add(firestoreDocId);
    if (userId) docIdsToDelete.add(userId);

    const usersSnap = await getDocs(collection(db, COLLECTIONS.USERS));
    usersSnap.docs.forEach((d) => {
      const data = d.data() as Partial<User>;
      if (d.id === userId || d.id === firestoreDocId || data?.id === userId) {
        docIdsToDelete.add(d.id);
      }
    });

    for (const targetId of docIdsToDelete) {
      await deleteDoc(doc(db, COLLECTIONS.USERS, targetId));
    }

    return { success: true };
  } catch (error: any) {
    const errInfo = handleFirestoreError(error, OperationType.DELETE, `${COLLECTIONS.USERS}/${firestoreDocId || userId}`);
    return { success: false, error: errInfo.error };
  }
};

/**
 * Sets up real-time onSnapshot listeners for changes in Firestore with guarded error callbacks.
 */
export const subscribeToAllCollections = (onDataUpdate: (data: Partial<FirestoreStoreData>) => void): (() => void) => {
  const db = getDb();
  if (!db) return () => {};

  const unsubscribes: Unsubscribe[] = [];

  try {
    // Tenants
    unsubscribes.push(
      onSnapshot(
        collection(db, COLLECTIONS.TENANTS),
        (snapshot) => {
          if (!snapshot.empty) {
            onDataUpdate({ tenants: snapshot.docs.map((d) => d.data() as Tenant) });
          }
        },
        (error) => {
          handleFirestoreError(error, OperationType.GET, COLLECTIONS.TENANTS);
        }
      )
    );

    // Companies
    unsubscribes.push(
      onSnapshot(
        collection(db, COLLECTIONS.COMPANIES),
        (snapshot) => {
          if (!snapshot.empty) {
            onDataUpdate({ companies: snapshot.docs.map((d) => d.data() as Company) });
          }
        },
        (error) => {
          handleFirestoreError(error, OperationType.GET, COLLECTIONS.COMPANIES);
        }
      )
    );

    // Dispatch Points / Hubs
    unsubscribes.push(
      onSnapshot(
        collection(db, COLLECTIONS.DISPATCH_POINTS),
        (snapshot) => {
          if (!snapshot.empty) {
            onDataUpdate({ dispatchPoints: snapshot.docs.map((d) => d.data() as DispatchPoint) });
          }
        },
        (error) => {
          handleFirestoreError(error, OperationType.GET, COLLECTIONS.DISPATCH_POINTS);
        }
      )
    );

    // SKUs
    unsubscribes.push(
      onSnapshot(
        collection(db, COLLECTIONS.SKUS),
        (snapshot) => {
          if (!snapshot.empty) {
            onDataUpdate({ skus: snapshot.docs.map((d) => d.data() as SKU) });
          }
        },
        (error) => {
          handleFirestoreError(error, OperationType.GET, COLLECTIONS.SKUS);
        }
      )
    );

    // Beats
    unsubscribes.push(
      onSnapshot(
        collection(db, COLLECTIONS.BEATS),
        (snapshot) => {
          if (!snapshot.empty) {
            onDataUpdate({ beats: snapshot.docs.map((d) => d.data() as Beat) });
          }
        },
        (error) => {
          handleFirestoreError(error, OperationType.GET, COLLECTIONS.BEATS);
        }
      )
    );

    // Retailers
    unsubscribes.push(
      onSnapshot(
        collection(db, COLLECTIONS.RETAILERS),
        (snapshot) => {
          if (!snapshot.empty) {
            onDataUpdate({ retailers: snapshot.docs.map((d) => d.data() as Retailer) });
          }
        },
        (error) => {
          handleFirestoreError(error, OperationType.GET, COLLECTIONS.RETAILERS);
        }
      )
    );

    // Distributors & Institutions
    unsubscribes.push(
      onSnapshot(
        collection(db, COLLECTIONS.DISTRIBUTORS),
        (snapshot) => {
          if (!snapshot.empty) {
            onDataUpdate({ distributors: snapshot.docs.map((d) => d.data() as DistributorInstitution) });
          }
        },
        (error) => {
          handleFirestoreError(error, OperationType.GET, COLLECTIONS.DISTRIBUTORS);
        }
      )
    );

    // Orders
    unsubscribes.push(
      onSnapshot(
        collection(db, COLLECTIONS.ORDERS),
        (snapshot) => {
          if (!snapshot.empty) {
            onDataUpdate({ orders: deduplicateOrders(snapshot.docs.map((d) => normalizeFirestoreOrder(d.id, d.data()))) });
          }
        },
        (error) => {
          handleFirestoreError(error, OperationType.GET, COLLECTIONS.ORDERS);
        }
      )
    );

    // Stock Ledger
    unsubscribes.push(
      onSnapshot(
        collection(db, COLLECTIONS.STOCK_LEDGER),
        (snapshot) => {
          if (!snapshot.empty) {
            onDataUpdate({ stockLedger: snapshot.docs.map((d) => d.data() as StockLedgerEntry) });
          }
        },
        (error) => {
          handleFirestoreError(error, OperationType.GET, COLLECTIONS.STOCK_LEDGER);
        }
      )
    );

    // Invoices
    unsubscribes.push(
      onSnapshot(
        collection(db, COLLECTIONS.INVOICES),
        (snapshot) => {
          if (!snapshot.empty) {
            onDataUpdate({ invoices: snapshot.docs.map((d) => d.data() as Invoice) });
          }
        },
        (error) => {
          handleFirestoreError(error, OperationType.GET, COLLECTIONS.INVOICES);
        }
      )
    );

    // Claims
    unsubscribes.push(
      onSnapshot(
        collection(db, COLLECTIONS.CLAIMS),
        (snapshot) => {
          if (!snapshot.empty) {
            onDataUpdate({ claims: snapshot.docs.map((d) => d.data() as Claim) });
          }
        },
        (error) => {
          handleFirestoreError(error, OperationType.GET, COLLECTIONS.CLAIMS);
        }
      )
    );

    // Payments
    unsubscribes.push(
      onSnapshot(
        collection(db, COLLECTIONS.PAYMENTS),
        (snapshot) => {
          if (!snapshot.empty) {
            onDataUpdate({ payments: snapshot.docs.map((d) => d.data() as Payment) });
          }
        },
        (error) => {
          handleFirestoreError(error, OperationType.GET, COLLECTIONS.PAYMENTS);
        }
      )
    );

    // Party Ledger
    unsubscribes.push(
      onSnapshot(
        collection(db, COLLECTIONS.PARTY_LEDGER),
        (snapshot) => {
          if (!snapshot.empty) {
            onDataUpdate({
              partyLedger: snapshot.docs.map((d) => ({
                ...(d.data() as PartyLedgerEntry),
                id: (d.data() as any).id || d.id,
              })),
            });
          }
        },
        (error) => {
          handleFirestoreError(error, OperationType.GET, COLLECTIONS.PARTY_LEDGER);
        }
      )
    );

    // Users
    unsubscribes.push(
      onSnapshot(
        collection(db, COLLECTIONS.USERS),
        (snapshot) => {
          onDataUpdate({ users: snapshot.docs.map((d) => normalizeFirestoreUser(d.id, d.data())) });
        },
        (error) => {
          handleFirestoreError(error, OperationType.GET, COLLECTIONS.USERS);
        }
      )
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, 'collection_subscriptions');
  }

  return () => {
    unsubscribes.forEach((unsub) => unsub());
  };
};

export interface FirestoreConnectionTestResult {
  success: boolean;
  message: string;
  projectId: string;
  databaseId: string;
  latencyMs: number;
  readStatus: 'SUCCESS' | 'FAILED' | 'PENDING';
  writeStatus: 'SUCCESS' | 'FAILED' | 'SKIPPED';
  tenantsCount: number;
  collectionsFound: string[];
  error?: string;
}

/**
 * Diagnostic utility to test active Firestore connection, perform a read/write roundtrip, and check latency.
 */
export const testFirestoreConnection = async (): Promise<FirestoreConnectionTestResult> => {
  const db = getDb();
  const config = getFirebaseConfig();
  const targetDatabaseId = config.databaseId || 'goroute-sfa-dms';

  if (!db) {
    return {
      success: false,
      message: 'Firebase SDK is not initialized. Please verify your Project ID and API credentials.',
      projectId: config.projectId || 'None',
      databaseId: targetDatabaseId,
      latencyMs: 0,
      readStatus: 'FAILED',
      writeStatus: 'SKIPPED',
      tenantsCount: 0,
      collectionsFound: [],
      error: 'Firebase database instance is null',
    };
  }

  const startTime = performance.now();
  const collectionsFound: string[] = [];

  try {
    // 1. Test Write with a ping document
    const pingRef = doc(db, COLLECTIONS.METADATA, 'connection_ping');
    await setDoc(pingRef, {
      last_ping: new Date().toISOString(),
      source: 'goroute-web-app',
      database_id: targetDatabaseId,
      status: 'OK',
    }, { merge: true });

    // 2. Test Read
    const tenantsSnap = await getDocs(collection(db, COLLECTIONS.TENANTS));
    if (!tenantsSnap.empty) collectionsFound.push('tenants');

    const skusSnap = await getDocs(collection(db, COLLECTIONS.SKUS));
    if (!skusSnap.empty) collectionsFound.push('skus');

    const ordersSnap = await getDocs(collection(db, COLLECTIONS.ORDERS));
    if (!ordersSnap.empty) collectionsFound.push('orders');

    const endTime = performance.now();
    const latencyMs = Math.round(endTime - startTime);

    return {
      success: true,
      message: `Connected to Cloud Firestore database "${targetDatabaseId}"! Roundtrip latency: ${latencyMs}ms.`,
      projectId: db.app.options.projectId || 'you-can-touch-me-8919838-dba1d',
      databaseId: targetDatabaseId,
      latencyMs,
      readStatus: 'SUCCESS',
      writeStatus: 'SUCCESS',
      tenantsCount: tenantsSnap.size,
      collectionsFound,
    };
  } catch (error: any) {
    const endTime = performance.now();
    const latencyMs = Math.round(endTime - startTime);
    handleFirestoreError(error, OperationType.GET, 'diagnostic_connection_test');

    let friendlyError = error?.message || 'Network or permissions error';
    if (error?.code === 'permission-denied' || friendlyError.includes('Missing or insufficient permissions')) {
      friendlyError = `PERMISSION DENIED on database "${targetDatabaseId}". Check Firestore Security Rules in Firebase Console for database "${targetDatabaseId}".`;
    } else if (error?.code === 'not-found' || friendlyError.includes('not-found') || friendlyError.includes('database does not exist')) {
      friendlyError = `DATABASE "${targetDatabaseId}" NOT FOUND. Ensure this database exists in Firebase Console > Firestore Database.`;
    }

    return {
      success: false,
      message: `Firestore connection notice: ${friendlyError}`,
      projectId: db.app?.options?.projectId || config.projectId || 'Unknown',
      databaseId: targetDatabaseId,
      latencyMs,
      readStatus: 'FAILED',
      writeStatus: 'FAILED',
      tenantsCount: 0,
      collectionsFound: [],
      error: error?.code || error?.message || 'Unknown Firestore error',
    };
  }
};

/**
 * Directly queries a User document from Firestore by mobile number.
 */
export const findFirestoreUserByMobile = async (sanitizedMobile: string): Promise<User | null> => {
  const db = getDb();
  if (!db) return null;

  try {
    const usersSnap = await getDocs(collection(db, COLLECTIONS.USERS));
    const sanitize = (m: string) => m.replace(/[\s\-\(\)\+]/g, '').slice(-10);
    const target = sanitize(sanitizedMobile);
    
    for (const docSnap of usersSnap.docs) {
      const u = docSnap.data() as User;
      if (u.mobile_number && sanitize(u.mobile_number) === target) {
        return normalizeFirestoreUser(docSnap.id, u);
      }
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, COLLECTIONS.USERS);
    return null;
  }
};

export const normalizeFirestoreUser = (docId: string, rawData: any): User => {
  const data = (rawData || {}) as User;
  return {
    ...data,
    id: data.id || docId,
    firestore_doc_id: docId,
    platform: getPlatformForRole(data.role),
    company_scope: Array.isArray(data.company_scope) ? data.company_scope : [],
    credit_limit: data.credit_limit !== undefined && data.credit_limit !== null ? Number(data.credit_limit) : undefined,
    current_outstanding:
      data.current_outstanding !== undefined && data.current_outstanding !== null
        ? Number(data.current_outstanding)
        : undefined,
    credit_gate_enabled: data.credit_gate_enabled === false ? false : true,
    distributor_id: data.distributor_id ?? null,
  };
};

/**
 * Fetches all credit-relevant collections directly from Cloud Firestore for Admin Credit Gate sync.
 */
export const fetchCreditGateCollectionsFromFirestore = async (): Promise<{
  success: boolean;
  users?: User[];
  distributors?: DistributorInstitution[];
  retailers?: Retailer[];
  orders?: Order[];
  invoices?: Invoice[];
  payments?: Payment[];
  partyLedger?: PartyLedgerEntry[];
}> => {
  const db = getDb();
  if (!db) return { success: false };

  try {
    const [usersSnap, distSnap, retSnap, ordersSnap, invSnap, paySnap, ledgerSnap] = await Promise.all([
      getDocs(collection(db, COLLECTIONS.USERS)),
      getDocs(collection(db, COLLECTIONS.DISTRIBUTORS)),
      getDocs(collection(db, COLLECTIONS.RETAILERS)),
      getDocs(collection(db, COLLECTIONS.ORDERS)),
      getDocs(collection(db, COLLECTIONS.INVOICES)),
      getDocs(collection(db, COLLECTIONS.PAYMENTS)),
      getDocs(collection(db, COLLECTIONS.PARTY_LEDGER)),
    ]);

    return {
      success: true,
      users: usersSnap.docs.map((d) => normalizeFirestoreUser(d.id, d.data())),
      distributors: distSnap.docs.map((d) => d.data() as DistributorInstitution),
      retailers: retSnap.docs.map((d) => d.data() as Retailer),
      orders: deduplicateOrders(ordersSnap.docs.map((d) => normalizeFirestoreOrder(d.id, d.data()))),
      invoices: invSnap.docs.map((d) => d.data() as Invoice),
      payments: paySnap.docs.map((d) => d.data() as Payment),
      partyLedger: ledgerSnap.docs.map((d) => ({
        ...(d.data() as PartyLedgerEntry),
        id: (d.data() as any).id || d.id,
      })),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, COLLECTIONS.USERS);
    return { success: false };
  }
};

/**
 * Dynamically fetches live credit_limit, current_outstanding, and available_credit
 * directly from Cloud Firestore for a logged-in Distributor or CFS user on mobile.
 */
export const fetchLivePartyCreditFromFirestore = async (
  userId: string,
  fallbackUser?: Partial<User>,
  defaultCreditLimit: number = 50000
): Promise<PartyCreditProfile | null> => {
  const db = getDb();
  if (!db || !userId) return null;

  try {
    const [usersSnap, distSnap, ordersSnap, invSnap, paySnap] = await Promise.all([
      getDocs(collection(db, COLLECTIONS.USERS)),
      getDocs(collection(db, COLLECTIONS.DISTRIBUTORS)),
      getDocs(collection(db, COLLECTIONS.ORDERS)),
      getDocs(collection(db, COLLECTIONS.INVOICES)),
      getDocs(collection(db, COLLECTIONS.PAYMENTS)),
    ]);

    const sanitize = (m?: string) => (m ? m.replace(/[\s\-\(\)\+]/g, '').slice(-10) : '');
    const targetMobile = sanitize(fallbackUser?.mobile_number);

    const allUsers = usersSnap.docs.map((d) => normalizeFirestoreUser(d.id, d.data()));
    const liveUser =
      allUsers.find((u) => u.id === userId || u.firestore_doc_id === userId) ||
      (targetMobile ? allUsers.find((u) => sanitize(u.mobile_number) === targetMobile) : undefined) ||
      (fallbackUser?.role
        ? ({
            id: userId,
            tenant_id: fallbackUser.tenant_id || 'tenant_ms_enterprises',
            name: fallbackUser.name || 'Field Partner',
            role: fallbackUser.role,
            company_scope: fallbackUser.company_scope || [],
            dispatch_point_id: fallbackUser.dispatch_point_id || null,
            platform: getPlatformForRole(fallbackUser.role),
            ...fallbackUser,
          } as User)
        : undefined);

    if (!liveUser) return null;

    const tenantId = liveUser.tenant_id;
    const distributors = distSnap.docs
      .map((d) => d.data() as DistributorInstitution)
      .filter((d) => !tenantId || d.tenant_id === tenantId);
    const orders = deduplicateOrders(
      ordersSnap.docs.map((d) => normalizeFirestoreOrder(d.id, d.data()))
    ).filter((o) => !tenantId || o.tenant_id === tenantId);
    const invoices = invSnap.docs
      .map((d) => d.data() as Invoice)
      .filter((i) => !tenantId || i.tenant_id === tenantId);
    const payments = paySnap.docs
      .map((d) => d.data() as Payment)
      .filter((p) => !tenantId || p.tenant_id === tenantId);

    return computeUserLiveCreditProfile(liveUser, {
      distributors,
      orders,
      invoices,
      payments,
      defaultCreditLimit,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `${COLLECTIONS.USERS}/${userId}`);
    return null;
  }
};

