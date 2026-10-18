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
          freeWinImageUrl: '',
          freeWinGale1ImageUrl: '',
          freeLossImageUrl: '',
          vipWinImageUrl: '',
          vipWinGale1ImageUrl: '',
          vipLossImageUrl: '',
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
        return JSON.parse(data.payload) as T;
      }
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, fullPath);
    return null;
  }
}
