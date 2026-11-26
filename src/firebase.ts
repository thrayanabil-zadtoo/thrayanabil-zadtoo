import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User
} from 'firebase/auth';
import { initializeFirestore, doc, getDoc, getDocFromServer, setDoc, setLogLevel } from 'firebase/firestore';
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

export const FIRESTORE_REST_BASE = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${firebaseConfig.firestoreDatabaseId || '(default)'}/documents`;

const ADMIN_EMAILS = new Set([
  'thrayanabil@gmail.com',
  'thrayanabil2026@gmail.com',
]);

function isVerifiedAdminUser(user: User | null): boolean {
  if (!user || !user.email || !user.emailVerified) return false;
  return ADMIN_EMAILS.has(user.email.trim().toLowerCase());
}

export function isFirebaseAdminSignedIn(): boolean {
  return isVerifiedAdminUser(auth.currentUser);
}

export function canWriteFirestoreAsAdmin(): boolean {
  return isFirebaseAdminSignedIn();
}

export function subscribeFirebaseAdminAuth(callback: (isFbAdmin: boolean) => void): () => void {
  return onAuthStateChanged(auth, (user) => {
    callback(isVerifiedAdminUser(user));
  });
}

export async function signInAdminWithGoogle(): Promise<{ ok: boolean; error?: string }> {
  try {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const cred = await signInWithPopup(auth, provider);
    if (!isVerifiedAdminUser(cred.user)) {
      await signOut(auth).catch(() => {});
      return {
        ok: false,
        error: 'هذا الحساب غير مصرح له بصلاحيات المشرف.'
      };
    }
    return { ok: true };
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || 'تعذر تسجيل الدخول عبر Google.'
    };
  }
}

export async function signOutFirebaseAdmin(): Promise<void> {
  await signOut(auth).catch(() => {});
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

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
export const TELEGRAM_BOT_STATE_DOC_ID = 'telegram_bot_state';

let inMemoryCachedPlans: any[] | null = null;
let inMemoryCachedLinks: any | null = null;

async function readMainStateDoc(): Promise<Record<string, any> | null> {
  if (!isFirebaseAdminSignedIn()) return null;
  const fullPath = `${SYSTEM_STATE_DOC_PATH}/${SYSTEM_STATE_DOC_ID}`;
  try {
    const snap = await getDoc(doc(db, SYSTEM_STATE_DOC_PATH, SYSTEM_STATE_DOC_ID));
    if (snap.exists()) {
      const data = snap.data();
      if (data && typeof data.payload === 'string') {
        return JSON.parse(data.payload);
      }
    }
    return {};
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, fullPath);
    return null;
  }
}

async function writeMainStateDoc(mainState: Record<string, any>): Promise<boolean> {
  if (!isFirebaseAdminSignedIn()) return false;
  const fullPath = `${SYSTEM_STATE_DOC_PATH}/${SYSTEM_STATE_DOC_ID}`;
  try {
    const nowIso = new Date().toISOString();
    mainState.stateUpdatedAt = nowIso;
    if (mainState.autopilot) {
      mainState.autopilot = {
        ...mainState.autopilot,
        botToken: '',
        vipBotToken: ''
      };
    }
    mainState.quickNotes = [];
    const serialized = JSON.stringify(mainState);
    if (serialized.length > 495000) return false;
    await setDoc(doc(db, SYSTEM_STATE_DOC_PATH, SYSTEM_STATE_DOC_ID), {
      updatedAt: nowIso,
      payload: serialized
    });
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, fullPath);
    return false;
  }
}

export async function saveCloudPlans(plans: any[]): Promise<boolean> {
  if (!Array.isArray(plans)) return false;
  inMemoryCachedPlans = plans;
  if (!isFirebaseAdminSignedIn()) return false;

  const fullPath = `${SYSTEM_STATE_DOC_PATH}/${PLATFORM_PLANS_DOC_ID}`;
  try {
    const nowIso = new Date().toISOString();
    const serialized = JSON.stringify(plans);
    if (serialized.length > 495000) return false;

    await setDoc(doc(db, SYSTEM_STATE_DOC_PATH, PLATFORM_PLANS_DOC_ID), {
      updatedAt: nowIso,
      payload: serialized,
    });

    try {
      const mainState = await readMainStateDoc();
      if (mainState) {
        mainState.plans = plans;
        await writeMainStateDoc(mainState);
      }
    } catch (_ignore) {}
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, fullPath);
    return false;
  }
}

export async function loadCloudPlans<T = any[]>(): Promise<T | null> {
  const fullPath = `${SYSTEM_STATE_DOC_PATH}/${PLATFORM_PLANS_DOC_ID}`;
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
    if (isFirebaseAdminSignedIn()) {
      const parsedMain = await readMainStateDoc();
      if (parsedMain && Array.isArray(parsedMain.plans) && parsedMain.plans.length > 0) {
        inMemoryCachedPlans = parsedMain.plans;
        return parsedMain.plans as T;
      }
    }
    return inMemoryCachedPlans as T | null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, fullPath);
    return inMemoryCachedPlans as T | null;
  }
}

export async function saveCloudContactLinks(links: any): Promise<boolean> {
  if (!links || typeof links !== 'object') return false;
  inMemoryCachedLinks = links;
  if (!isFirebaseAdminSignedIn()) return false;

  const fullPath = `${SYSTEM_STATE_DOC_PATH}/${PLATFORM_LINKS_DOC_ID}`;
  try {
    const nowIso = new Date().toISOString();
    const serialized = JSON.stringify(links);
    if (serialized.length > 495000) return false;
    await setDoc(doc(db, SYSTEM_STATE_DOC_PATH, PLATFORM_LINKS_DOC_ID), {
      updatedAt: nowIso,
      payload: serialized,
    });
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, fullPath);
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

export async function loadCloudRobotSettings<T = any>(): Promise<T | null> {
  if (!isFirebaseAdminSignedIn()) return null;
  const mainState = await readMainStateDoc();
  if (mainState && mainState.robotSettings) {
    return {
      ...mainState.robotSettings,
      strategyEngineMode: 'VIP_WITH_MPB',
      noMartingaleStrict: true
    } as T;
  }
  return null;
}

export async function saveCloudRobotSettings(robotSettings: any): Promise<boolean> {
  if (!isFirebaseAdminSignedIn() || !robotSettings) return false;
  const mainState = (await readMainStateDoc()) || {};
  mainState.robotSettings = {
    ...robotSettings,
    strategyEngineMode: 'VIP_WITH_MPB',
    noMartingaleStrict: true
  };
  return await writeMainStateDoc(mainState);
}

export async function loadCloudPaymentMethods<T = any[]>(): Promise<T | null> {
  if (!isFirebaseAdminSignedIn()) return null;
  const mainState = await readMainStateDoc();
  if (mainState && Array.isArray(mainState.paymentMethods)) {
    return mainState.paymentMethods as T;
  }
  return null;
}

export async function saveCloudPaymentMethods(methods: any[]): Promise<boolean> {
  if (!isFirebaseAdminSignedIn() || !Array.isArray(methods)) return false;
  const mainState = (await readMainStateDoc()) || {};
  mainState.paymentMethods = methods;
  return await writeMainStateDoc(mainState);
}

export async function loadSubscribersFromFirestore<T = any[]>(): Promise<T | null> {
  if (!isFirebaseAdminSignedIn()) return null;
  const mainState = await readMainStateDoc();
  if (mainState && Array.isArray(mainState.subscribers)) {
    return mainState.subscribers as T;
  }
  return null;
}

export async function saveSubscriberToFirestore(subscriber: any): Promise<boolean> {
  if (!isFirebaseAdminSignedIn() || !subscriber || !subscriber.id) return false;
  const mainState = (await readMainStateDoc()) || {};
  const list: any[] = Array.isArray(mainState.subscribers) ? mainState.subscribers : [];
  const next = [subscriber, ...list.filter((s: any) => s.id !== subscriber.id)];
  mainState.subscribers = next.map((s: any) => ({
    id: s.id,
    name: s.name,
    brokerAccountId: s.brokerAccountId || '',
    robotApiKey: s.robotApiKey || '',
    status: s.status,
    robotExpiryDate: s.robotExpiryDate || s.expiryDate || '',
    expiryDate: s.expiryDate || '',
    robotEnabled: s.robotEnabled !== false,
    robotDefaultMode: s.robotDefaultMode || 'AUTO',
    robotTradeStake: s.robotTradeStake || 5,
    createdAt: s.createdAt || new Date().toISOString()
  }));
  return await writeMainStateDoc(mainState);
}

export async function deleteSubscriberFromFirestore(subscriberId: string, _robotApiKey?: string): Promise<boolean> {
  if (!isFirebaseAdminSignedIn() || !subscriberId) return false;
  const mainState = (await readMainStateDoc()) || {};
  const list: any[] = Array.isArray(mainState.subscribers) ? mainState.subscribers : [];
  mainState.subscribers = list.filter((s: any) => s.id !== subscriberId);
  return await writeMainStateDoc(mainState);
}

export async function loadSignalsFromFirestore<T = any[]>(): Promise<T | null> {
  if (!isFirebaseAdminSignedIn()) return null;
  const mainState = await readMainStateDoc();
  if (mainState && Array.isArray(mainState.signals)) {
    return mainState.signals as T;
  }
  return null;
}

export async function saveSignalToFirestore(signal: any): Promise<boolean> {
  if (!isFirebaseAdminSignedIn() || !signal || !signal.id) return false;
  const mainState = (await readMainStateDoc()) || {};
  const list: any[] = Array.isArray(mainState.signals) ? mainState.signals : [];
  mainState.signals = [signal, ...list.filter((s: any) => s.id !== signal.id)].slice(0, 50);
  return await writeMainStateDoc(mainState);
}

export async function deleteSignalFromFirestore(signalId: string): Promise<boolean> {
  if (!isFirebaseAdminSignedIn() || !signalId) return false;
  const mainState = (await readMainStateDoc()) || {};
  const list: any[] = Array.isArray(mainState.signals) ? mainState.signals : [];
  mainState.signals = list.filter((s: any) => s.id !== signalId);
  return await writeMainStateDoc(mainState);
}

/**
 * Option A security policy:
 * NEVER place member names, emails, or API keys in robot_feed/live.
 * robot_feed/live may only mirror anonymized signal status metadata for verified admin view.
 */
export async function syncRobotPublicFeedToFirestore(signalsList: any[]): Promise<boolean> {
  if (!isFirebaseAdminSignedIn()) return false;
  const latest = Array.isArray(signalsList) ? signalsList[0] || null : null;
  const sanitizedSignal = latest
    ? {
        id: String(latest.id || ''),
        asset: String(latest.asset || ''),
        direction: String(latest.direction || ''),
        status: String(latest.status || 'PENDING'),
        timeframe: String(latest.timeframe || 'M1'),
        entryTime: String(latest.entryTime || ''),
        targetEntryTimestamp: Number(latest.targetEntryTimestamp || 0)
      }
    : null;

  try {
    await setDoc(doc(db, 'robot_feed', 'live'), {
      updatedAt: new Date().toISOString(),
      signal: sanitizedSignal
    });
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'robot_feed/live');
    return false;
  }
}

/**
 * Option A security policy:
 * Member verification happens strictly on the Express backend (/api/quotex-robot/feed?apiKey=...).
 */
export async function fetchRobotFeedFromFirestore(_apiKey?: string): Promise<any> {
  return {
    ok: false,
    authorized: false,
    error: 'التحقق من صلاحية الروبوت يتم حصرياً عبر السيرفر المعتمد (/api/quotex-robot/feed).'
  };
}

export async function syncAllAdminStateToFirestore(state: {
  subscribers?: any[];
  signals?: any[];
  plans?: any[];
  contactLinks?: any;
  robotSettings?: any;
}): Promise<boolean> {
  if (!isFirebaseAdminSignedIn()) return false;
  const existing = (await readMainStateDoc()) || {};
  const merged = {
    ...existing,
    ...(Array.isArray(state.signals) ? { signals: state.signals.slice(0, 50) } : {}),
    ...(Array.isArray(state.plans) ? { plans: state.plans } : {}),
    ...(state.contactLinks ? { contactLinks: state.contactLinks } : {}),
    ...(state.robotSettings
      ? {
          robotSettings: {
            ...state.robotSettings,
            strategyEngineMode: 'VIP_WITH_MPB',
            noMartingaleStrict: true
          }
        }
      : {}),
    ...(Array.isArray(state.subscribers) ? { subscribers: state.subscribers } : {})
  };

  const ok = await saveCloudSystemState(merged);
  if (Array.isArray(state.plans) && state.plans.length > 0) {
    await saveCloudPlans(state.plans).catch(() => false);
  }
  if (state.contactLinks) {
    await saveCloudContactLinks(state.contactLinks).catch(() => false);
  }
  return ok;
}

export async function saveCloudSystemState(payloadObj: any): Promise<boolean> {
  if (!isFirebaseAdminSignedIn()) return false;

  const fullPath = `${SYSTEM_STATE_DOC_PATH}/${SYSTEM_STATE_DOC_ID}`;
  try {
    const nowIso = new Date().toISOString();
    const sanitizedObj = payloadObj && typeof payloadObj === 'object' ? { ...payloadObj } : payloadObj;
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
          defaultMode: s.robotDefaultMode || s.defaultMode || 'AUTO',
          tradeStakeUsd: s.robotTradeStake || s.tradeStakeUsd || 5,
        }));
      }
      sanitizedObj.quickNotes = [];
      sanitizedObj.stateUpdatedAt = nowIso;

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
    handleFirestoreError(error, OperationType.WRITE, fullPath);
    return false;
  }
}

export async function loadCloudSystemState<T = any>(): Promise<T | null> {
  if (!isFirebaseAdminSignedIn()) return null;

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

export async function saveCloudTelegramBotState(config: any, users: any[]): Promise<boolean> {
  if (!isFirebaseAdminSignedIn()) return false;

  const fullPath = `${SYSTEM_STATE_DOC_PATH}/${TELEGRAM_BOT_STATE_DOC_ID}`;
  try {
    const nowIso = new Date().toISOString();
    const payload = JSON.stringify({
      config,
      users: Array.isArray(users) ? users.slice(0, 500) : [],
    });
    if (payload.length > 495000) return false;
    await setDoc(doc(db, SYSTEM_STATE_DOC_PATH, TELEGRAM_BOT_STATE_DOC_ID), {
      updatedAt: nowIso,
      payload,
    });
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, fullPath);
    return false;
  }
}

export async function loadCloudTelegramBotState(): Promise<{ config?: any; users?: any[] } | null> {
  if (!isFirebaseAdminSignedIn()) return null;

  const fullPath = `${SYSTEM_STATE_DOC_PATH}/${TELEGRAM_BOT_STATE_DOC_ID}`;
  try {
    const snap = await getDoc(doc(db, SYSTEM_STATE_DOC_PATH, TELEGRAM_BOT_STATE_DOC_ID));
    if (snap.exists()) {
      const d = snap.data();
      if (d?.payload && typeof d.payload === 'string') {
        const parsed = JSON.parse(d.payload);
        return parsed;
      }
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, fullPath);
    return null;
  }
}
