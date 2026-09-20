import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getAuth, Auth } from 'firebase/auth';

export interface FirebaseCustomConfig {
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  databaseId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
}

const FIREBASE_CONFIG_STORAGE_KEY = 'goroute_firebase_custom_config';

const DEFAULT_FIREBASE_CONFIG: FirebaseCustomConfig = {
  apiKey: "AIzaSyCyVaFVFfEmANuVZmbKIoMA91TJNWceXaU",
  authDomain: "you-can-touch-me-8919838-dba1d.firebaseapp.com",
  projectId: "you-can-touch-me-8919838-dba1d",
  databaseId: "goroute-sfa-dms",
  storageBucket: "you-can-touch-me-8919838-dba1d.firebasestorage.app",
  messagingSenderId: "731815279263",
  appId: "1:731815279263:web:d93eb61d3231bdecb180aa",
};

export const getFirebaseConfig = (): FirebaseCustomConfig => {
  // 1. Check if user configured custom in-app config in localStorage
  try {
    const saved = localStorage.getItem(FIREBASE_CONFIG_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.projectId) {
        return {
          ...DEFAULT_FIREBASE_CONFIG,
          ...parsed,
          databaseId: parsed.databaseId || DEFAULT_FIREBASE_CONFIG.databaseId
        };
      }
    }
  } catch (e) {
    console.warn('Failed to parse custom firebase config from storage', e);
  }

  // 2. Vite environment variables or default configured credentials
  const envProjectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  if (envProjectId && envProjectId.trim() !== '') {
    return {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY || DEFAULT_FIREBASE_CONFIG.apiKey,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || DEFAULT_FIREBASE_CONFIG.authDomain,
      projectId: envProjectId,
      databaseId: import.meta.env.VITE_FIREBASE_DATABASE_ID || DEFAULT_FIREBASE_CONFIG.databaseId,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || DEFAULT_FIREBASE_CONFIG.storageBucket,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || DEFAULT_FIREBASE_CONFIG.messagingSenderId,
      appId: import.meta.env.VITE_FIREBASE_APP_ID || DEFAULT_FIREBASE_CONFIG.appId,
    };
  }

  return DEFAULT_FIREBASE_CONFIG;
};

export const isFirebaseConfigured = (): boolean => {
  const config = getFirebaseConfig();
  return Boolean(config.projectId && config.projectId.trim() !== '');
};

let appInstance: FirebaseApp | null = null;
let dbInstance: Firestore | null = null;
let authInstance: Auth | null = null;

export const initFirebase = (): { app: FirebaseApp | null; db: Firestore | null; auth: Auth | null } => {
  const config = getFirebaseConfig();

  if (!config.projectId) {
    return { app: null, db: null, auth: null };
  }

  try {
    if (!getApps().length) {
      appInstance = initializeApp({
        apiKey: config.apiKey || 'placeholder-api-key',
        authDomain: config.authDomain || `${config.projectId}.firebaseapp.com`,
        projectId: config.projectId,
        storageBucket: config.storageBucket || `${config.projectId}.appspot.com`,
        messagingSenderId: config.messagingSenderId || '123456789',
        appId: config.appId || '1:123456789:web:abcdef',
      });
    } else {
      appInstance = getApp();
    }

    // Connect to specified databaseId or default
    const targetDbId = config.databaseId && config.databaseId.trim() !== '' && config.databaseId !== '(default)'
      ? config.databaseId.trim()
      : undefined;

    dbInstance = targetDbId ? getFirestore(appInstance, targetDbId) : getFirestore(appInstance);
    authInstance = getAuth(appInstance);

    return { app: appInstance, db: dbInstance, auth: authInstance };
  } catch (error) {
    console.error('Failed to initialize Firebase SDK:', error);
    return { app: null, db: null, auth: null };
  }
};

// Lazy singletons
export const getDb = (): Firestore | null => {
  if (!dbInstance && isFirebaseConfigured()) {
    initFirebase();
  }
  return dbInstance;
};

export const getFirebaseAuth = (): Auth | null => {
  if (!authInstance && isFirebaseConfigured()) {
    initFirebase();
  }
  return authInstance;
};

export const saveCustomFirebaseConfig = (config: FirebaseCustomConfig) => {
  try {
    localStorage.setItem(FIREBASE_CONFIG_STORAGE_KEY, JSON.stringify(config));
    // Reset instances to re-initialize with new config
    appInstance = null;
    dbInstance = null;
    authInstance = null;
    initFirebase();
    return true;
  } catch (e) {
    console.error('Failed to save Firebase config', e);
    return false;
  }
};

export const clearCustomFirebaseConfig = () => {
  localStorage.removeItem(FIREBASE_CONFIG_STORAGE_KEY);
  appInstance = null;
  dbInstance = null;
  authInstance = null;
};
