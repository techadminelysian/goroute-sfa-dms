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
  StockLedgerEntry,
  Invoice,
  Claim,
  Payment,
  User
} from '../types';
import {
  INITIAL_TENANTS,
  INITIAL_TENANT_SETTINGS,
  INITIAL_COMPANIES,
  INITIAL_DISPATCH_POINTS,
  INITIAL_SKUS,
  INITIAL_BEATS,
  INITIAL_RETAILERS,
  INITIAL_DISTRIBUTORS,
  INITIAL_ORDERS,
  INITIAL_STOCK_LEDGER,
  INITIAL_INVOICES,
  INITIAL_CLAIMS,
  INITIAL_PAYMENTS,
  INITIAL_USERS
} from '../data/initialData';

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
    const collectionsToSeed = [
      { name: COLLECTIONS.TENANTS, data: INITIAL_TENANTS, label: 'Tenants' },
      { 
        name: COLLECTIONS.TENANT_SETTINGS, 
        data: Object.entries(INITIAL_TENANT_SETTINGS).map(([id, val]) => ({ ...val, id })), 
        label: 'Tenant Settings' 
      },
      { name: COLLECTIONS.COMPANIES, data: INITIAL_COMPANIES, label: 'Principal Companies' },
      { name: COLLECTIONS.DISPATCH_POINTS, data: INITIAL_DISPATCH_POINTS, label: 'Warehouses / Depots' },
      { name: COLLECTIONS.SKUS, data: INITIAL_SKUS, label: 'SKU Catalog' },
      { name: COLLECTIONS.BEATS, data: INITIAL_BEATS, label: 'Beats & Field Routes' },
      { name: COLLECTIONS.RETAILERS, data: INITIAL_RETAILERS, label: 'Retail Outlets' },
      { name: COLLECTIONS.DISTRIBUTORS, data: INITIAL_DISTRIBUTORS, label: 'Distributors & Institutions' },
      { name: COLLECTIONS.ORDERS, data: INITIAL_ORDERS, label: 'Sales Orders' },
      { name: COLLECTIONS.STOCK_LEDGER, data: INITIAL_STOCK_LEDGER, label: 'Stock Ledger' },
      { name: COLLECTIONS.INVOICES, data: INITIAL_INVOICES, label: 'Invoices' },
      { name: COLLECTIONS.CLAIMS, data: INITIAL_CLAIMS, label: 'Claims' },
      { name: COLLECTIONS.PAYMENTS, data: INITIAL_PAYMENTS, label: 'Payment Collections' },
      { name: COLLECTIONS.USERS, data: INITIAL_USERS, label: 'User Master Accounts' },
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
          batch.set(ref, item);
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
      tenants_count: INITIAL_TENANTS.length,
      companies_count: INITIAL_COMPANIES.length,
      skus_count: INITIAL_SKUS.length,
      retailers_count: INITIAL_RETAILERS.length,
      orders_count: INITIAL_ORDERS.length,
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
      orders: ordersSnap.docs.map((d) => d.data() as Order),
      stockLedger: stockLedgerSnap.docs.map((d) => d.data() as StockLedgerEntry),
      invoices: invoicesSnap.docs.map((d) => d.data() as Invoice),
      claims: claimsSnap.docs.map((d) => d.data() as Claim),
      payments: paymentsSnap.docs.map((d) => d.data() as Payment),
      users: usersSnap.docs.map((d) => d.data() as User),
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

  try {
    const docRef = doc(db, collectionName, docId);
    await setDoc(docRef, data, { merge: true });
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${collectionName}/${docId}`);
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
            onDataUpdate({ orders: snapshot.docs.map((d) => d.data() as Order) });
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

    // Users
    unsubscribes.push(
      onSnapshot(
        collection(db, COLLECTIONS.USERS),
        (snapshot) => {
          if (!snapshot.empty) {
            onDataUpdate({ users: snapshot.docs.map((d) => d.data() as User) });
          }
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
        return { ...u, id: docSnap.id };
      }
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, COLLECTIONS.USERS);
    return null;
  }
};

