import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, doc, getDoc, setDoc, setLogLevel } from 'firebase/firestore';
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

export async function saveCloudPlans(plans: any[]): Promise<boolean> {
  const fullPath = `${SYSTEM_STATE_DOC_PATH}/${PLATFORM_PLANS_DOC_ID}`;
  try {
    if (!Array.isArray(plans)) return false;
    inMemoryCachedPlans = plans;
    const nowIso = new Date().toISOString();
    const serialized = JSON.stringify(plans);
    // 1. Write dedicated document
    await setDoc(doc(db, SYSTEM_STATE_DOC_PATH, PLATFORM_PLANS_DOC_ID), {
      updatedAt: nowIso,
      payload: serialized,
    });
    // 2. Also try to merge into main state if present
    try {
      const snap = await getDoc(doc(db, SYSTEM_STATE_DOC_PATH, SYSTEM_STATE_DOC_ID));
      if (snap.exists()) {
        const d = snap.data();
        if (d?.payload) {
          const mainState = JSON.parse(d.payload);
          mainState.plans = plans;
          mainState.stateUpdatedAt = nowIso;
          await setDoc(doc(db, SYSTEM_STATE_DOC_PATH, SYSTEM_STATE_DOC_ID), {
            updatedAt: nowIso,
            payload: JSON.stringify(mainState),
          });
        }
      }
    } catch (_ignore) {}
    return true;
  } catch (error) {
    console.warn('[Firebase] Could not save plans to cloud:', error);
    return false;
  }
}

export async function loadCloudPlans<T = any[]>(): Promise<T | null> {
  const fullPath = `${SYSTEM_STATE_DOC_PATH}/${PLATFORM_PLANS_DOC_ID}`;
  try {
    // 1. Try dedicated document first
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
    // 2. Fallback to main state document
    const mainSnap = await getDoc(doc(db, SYSTEM_STATE_DOC_PATH, SYSTEM_STATE_DOC_ID));
    if (mainSnap.exists()) {
      const mainData = mainSnap.data();
      if (mainData && typeof mainData.payload === 'string') {
        const parsedMain = JSON.parse(mainData.payload);
        if (Array.isArray(parsedMain.plans) && parsedMain.plans.length > 0) {
          inMemoryCachedPlans = parsedMain.plans;
          return parsedMain.plans as T;
        }
      }
    }
    return inMemoryCachedPlans as T | null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, fullPath);
    return inMemoryCachedPlans as T | null;
  }
}

export async function saveCloudContactLinks(links: any): Promise<boolean> {
  const fullPath = `${SYSTEM_STATE_DOC_PATH}/${PLATFORM_LINKS_DOC_ID}`;
  try {
    if (!links || typeof links !== 'object') return false;
    inMemoryCachedLinks = links;
    const nowIso = new Date().toISOString();
    const serialized = JSON.stringify(links);
    await setDoc(doc(db, SYSTEM_STATE_DOC_PATH, PLATFORM_LINKS_DOC_ID), {
      updatedAt: nowIso,
      payload: serialized,
    });
    return true;
  } catch (error) {
    console.warn('[Firebase] Could not save links to cloud:', error);
    return false;
  }
}

export async function loadCloudContactLinks<T = any>(): Promise<T | null> {
  const fullPath = `${SYSTEM_STATE_DOC_PATH}/${PLATFORM_LINKS_DOC_ID}`;
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
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, fullPath);
    return inMemoryCachedLinks as T | null;
  }
}

export async function saveCloudSystemState(payloadObj: any): Promise<boolean> {
  const fullPath = `${SYSTEM_STATE_DOC_PATH}/${SYSTEM_STATE_DOC_ID}`;
  try {
    const nowIso = new Date().toISOString();
    let sanitizedObj = payloadObj && typeof payloadObj === 'object' ? { ...payloadObj } : payloadObj;
    if (sanitizedObj && typeof sanitizedObj === 'object') {
      if (sanitizedObj.autopilot) {
        sanitizedObj.autopilot = {
          ...sanitizedObj.autopilot,
          botToken: '', // Redact sensitive Telegram token from cloud
          vipBotToken: '', // Redact sensitive VIP token from cloud
          freeWinImageUrl: sanitizedObj.autopilot.freeWinImageUrl || '',
          freeWinGale1ImageUrl: sanitizedObj.autopilot.freeWinGale1ImageUrl || '',
          freeLossImageUrl: sanitizedObj.autopilot.freeLossImageUrl || '',
          vipWinImageUrl: sanitizedObj.autopilot.vipWinImageUrl || '',
          vipWinGale1ImageUrl: sanitizedObj.autopilot.vipWinGale1ImageUrl || '',
          vipLossImageUrl: sanitizedObj.autopilot.vipLossImageUrl || '',
        };
      }
      if (Array.isArray(sanitizedObj.subscribers)) {
        sanitizedObj.subscribers = sanitizedObj.subscribers.map((s: any) => ({
          id: s.id,
          name: s.name,
          brokerAccountId: s.brokerAccountId || '',
          robotApiKey: s.robotApiKey || '',
          status: s.status,
          robotExpiryDate: s.robotExpiryDate || s.expiryDate || '',
          expiryDate: s.expiryDate || '',
          robotEnabled: s.robotEnabled !== false,
          defaultMode: s.defaultMode || 'AUTO',
          tradeStakeUsd: s.tradeStakeUsd || 5,
        }));
      }
      sanitizedObj.quickNotes = [];
      sanitizedObj.stateUpdatedAt = nowIso;

      // CRITICAL PRESERVATION: If plans or contactLinks are not passed in this partial update,
      // preserve them from memory cache or from existing document so they are never wiped!
      if (!Array.isArray(sanitizedObj.plans) || sanitizedObj.plans.length === 0) {
        if (inMemoryCachedPlans && inMemoryCachedPlans.length > 0) {
          sanitizedObj.plans = inMemoryCachedPlans;
        }
      } else {
        inMemoryCachedPlans = sanitizedObj.plans;
      }

      if (!sanitizedObj.contactLinks) {
        if (inMemoryCachedLinks) {
          sanitizedObj.contactLinks = inMemoryCachedLinks;
        }
      } else {
        inMemoryCachedLinks = sanitizedObj.contactLinks;
      }
    }
    const serialized = JSON.stringify(sanitizedObj);
    if (serialized.length > 495000) return false;
    await setDoc(doc(db, SYSTEM_STATE_DOC_PATH, SYSTEM_STATE_DOC_ID), {
      updatedAt: nowIso,
      payload: serialized,
    });
    return true;
  } catch (error) {
    console.warn('[Firebase Cloud Backup] Client-side direct write skipped or denied:', error);
    return false;
  }
}

export async function loadCloudSystemState<T = any>(): Promise<T | null> {
  const fullPath = `${SYSTEM_STATE_DOC_PATH}/${SYSTEM_STATE_DOC_ID}`;
  try {
    const snap = await getDoc(doc(db, SYSTEM_STATE_DOC_PATH, SYSTEM_STATE_DOC_ID));
    if (snap.exists()) {
      const data = snap.data();
      if (data && typeof data.payload === 'string') {
        const parsed = JSON.parse(data.payload) as any;
        if (parsed?.plans && Array.isArray(parsed.plans)) {
          inMemoryCachedPlans = parsed.plans;
        }
        if (parsed?.contactLinks) {
          inMemoryCachedLinks = parsed.contactLinks;
        }
        return parsed as T;
      }
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, fullPath);
    return null;
  }
}
