import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, doc, getDoc, setLogLevel } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Silence noisy internal WebChannel connection retry warnings in restricted iframe/proxy networks
setLogLevel('silent');

const app = initializeApp(firebaseConfig);

// Use experimentalForceLongPolling so Firestore connects reliably inside cloud preview iframes and proxies
export const db = initializeFirestore(
  app,
  {
    experimentalForceLongPolling: true,
  },
  firebaseConfig.firestoreDatabaseId
);

export const auth = getAuth(app);

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

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const msg = error instanceof Error ? error.message : String(error);
  // Only throw structured error on permission-denied as required by security rules debugging
  if (msg.includes('Missing or insufficient permissions') || msg.includes('permission-denied')) {
    const errInfo: FirestoreErrorInfo = {
      error: msg,
      authInfo: {
        userId: auth.currentUser?.uid,
        email: auth.currentUser?.email,
        emailVerified: auth.currentUser?.emailVerified,
        isAnonymous: auth.currentUser?.isAnonymous,
        tenantId: auth.currentUser?.tenantId,
        providerInfo:
          auth.currentUser?.providerData?.map((provider) => ({
            providerId: provider.providerId,
            email: provider.email,
          })) || [],
      },
      operationType,
      path,
    };
    console.error('Firestore Error: ', JSON.stringify(errInfo));
    throw new Error(JSON.stringify(errInfo));
  }
}

export const SYSTEM_STATE_DOC_PATH = 'system_state';
export const SYSTEM_STATE_DOC_ID = 'zad_main_state_v1';
export const PLATFORM_PLANS_DOC_ID = 'platform_plans';
export const PLATFORM_LINKS_DOC_ID = 'platform_contact_links';

let inMemoryCachedPlans: any[] | null = null;
let inMemoryCachedLinks: any | null = null;

export async function saveCloudPlans(_plans: any[]): Promise<boolean> {
  return false;
}

export async function loadCloudPlans<T = any[]>(): Promise<T | null> {
  try {
    const snap = await getDoc(doc(db, SYSTEM_STATE_DOC_PATH, PLATFORM_PLANS_DOC_ID));
    if (snap.exists()) {
      const data = snap.data();
      if (data && typeof data.payload === 'string') {
        const parsed = JSON.parse(data.payload);
        if (Array.isArray(parsed) && parsed.length > 0) {
          inMemoryCachedPlans = parsed;
          return parsed as T;
        }
      }
    }
    return inMemoryCachedPlans as T | null;
  } catch (_error) {
    return inMemoryCachedPlans as T | null;
  }
}

export async function saveCloudContactLinks(_links: any): Promise<boolean> {
  return false;
}

export async function loadCloudContactLinks<T = any>(): Promise<T | null> {
  try {
    const snap = await getDoc(doc(db, SYSTEM_STATE_DOC_PATH, PLATFORM_LINKS_DOC_ID));
    if (snap.exists()) {
      const data = snap.data();
      if (data && typeof data.payload === 'string') {
        const parsed = JSON.parse(data.payload);
        if (parsed && typeof parsed === 'object') {
          inMemoryCachedLinks = parsed;
          return parsed as T;
        }
      }
    }
    return inMemoryCachedLinks as T | null;
  } catch (_error) {
    return inMemoryCachedLinks as T | null;
  }
}

export async function saveCloudSystemState(_payloadObj: any): Promise<boolean> {
  return false;
}

export async function loadCloudSystemState<T = any>(): Promise<T | null> {
  return null;
}

export const TELEGRAM_BOT_STATE_DOC_ID = 'telegram_bot_state';

export async function saveCloudTelegramBotState(_config: any, _users: any[]): Promise<boolean> {
  return false;
}

export async function loadCloudTelegramBotState(): Promise<{ config?: any; users?: any[] } | null> {
  return null;
}

