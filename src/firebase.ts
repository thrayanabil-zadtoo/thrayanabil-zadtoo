import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User
} from 'firebase/auth';
import { initializeFirestore, doc, getDoc, getDocFromServer, setDoc, deleteDoc, setLogLevel } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Silence noisy internal WebChannel connection retry warnings in restricted iframe/proxy networks
setLogLevel('silent');

const app = initializeApp(firebaseConfig);

// Use experimentalAutoDetectLongPolling so Firestore prefers fast WebChannel and cleanly falls back in restricted proxies
export const db = initializeFirestore(
  app,
  {
    experimentalAutoDetectLongPolling: true,
  },
  firebaseConfig.firestoreDatabaseId
);

export const auth = getAuth(app);

export const FIRESTORE_REST_BASE = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${firebaseConfig.firestoreDatabaseId || '(default)'}/documents`;
export const FIREBASE_REST_API_KEY = firebaseConfig.apiKey;

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

export async function getCurrentFirebaseIdToken(): Promise<string | null> {
  if (!auth.currentUser || !isVerifiedAdminUser(auth.currentUser)) return null;
  try {
    return await auth.currentUser.getIdToken();
  } catch (_e) {
    return null;
  }
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
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      // Retry once after brief startup settle in case browser iframe channel was still initializing
      await new Promise((r) => setTimeout(r, 1500));
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
        return;
      } catch (_retryErr) {
        // Confirm via Firestore REST API whether database/config is actually unreachable
        try {
          const restRes = await fetch(
            `${FIRESTORE_REST_BASE}/test/connection?key=${encodeURIComponent(firebaseConfig.apiKey)}`
          );
          if (restRes.ok || restRes.status === 404 || restRes.status === 403) {
            return;
          }
        } catch (_restErr) {}
      }
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
export const PLATFORM_SUBSCRIBERS_DOC_ID = 'platform_subscribers';
export const TELEGRAM_BOT_STATE_DOC_ID = 'telegram_bot_state';

let inMemoryCachedPlans: any[] | null = null;
let inMemoryCachedLinks: any | null = null;
let inMemoryCachedSubscribers: any[] | null = null;

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

function normalizeCloudSubscriber(s: any) {
  const safeMessages = Array.isArray(s?.messages)
    ? s.messages.slice(-20).map((m: any) => ({
        id: String(m?.id || ''),
        sender: m?.sender === 'admin' ? 'admin' : 'member',
        text: String(m?.text || '').slice(0, 1200),
        createdAt: String(m?.createdAt || ''),
        ...(m?.isActivationLink ? { isActivationLink: true } : {})
      }))
    : [];
  return {
    id: String(s?.id || ''),
    name: String(s?.name || ''),
    telegramUsername: String(s?.telegramUsername || ''),
    country: String(s?.country || 'مصر 🇪🇬'),
    email: String(s?.email || ''),
    phone: String(s?.phone || ''),
    broker: String(s?.broker || 'بدون منصة محددة'),
    brokerAccountId: String(s?.brokerAccountId || ''),
    subscriptionType: s?.subscriptionType === 'quotex_referral' ? 'quotex_referral' : 'paid_plan',
    quotexDepositConfirmed: Boolean(s?.quotexDepositConfirmed),
    planDuration: String(s?.planDuration || '1_month'),
    amountPaid: typeof s?.amountPaid === 'number' ? s.amountPaid : 0,
    paymentMethod: String(s?.paymentMethod || ''),
    activationLink: String(s?.activationLink || ''),
    robotApiKey: String(s?.robotApiKey || '').trim().toUpperCase(),
    status: s?.status || 'ACTIVE',
    robotExpiryDate: String(s?.robotExpiryDate || s?.expiryDate || ''),
    expiryDate: String(s?.expiryDate || s?.robotExpiryDate || ''),
    robotEnabled: s?.robotEnabled !== false,
    robotDefaultMode: s?.robotDefaultMode || s?.defaultMode || 'AUTO',
    robotTradeStake: Number(s?.robotTradeStake || s?.tradeStakeUsd) || 5,
    robotWins: Number(s?.robotWins) || 0,
    robotLosses: Number(s?.robotLosses) || 0,
    messages: safeMessages,
    createdAt: s?.createdAt || new Date().toISOString()
  };
}

function mergeSubscriberListsById(primary: any[], secondary: any[]): any[] {
  const seen = new Set<string>();
  const out: any[] = [];
  for (const item of [...primary, ...secondary]) {
    if (!item || !item.id || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

export const ROBOT_LICENSES_COLLECTION = 'robot_licenses';
const syncedLicenseSignatures = new Map<string, string>();

function cleanLicenseKey(raw: string): string {
  return String(raw || '')
    .replace(/[\s\u200B-\u200F\u202A-\u202E\uFEFF]+/g, '')
    .trim()
    .toUpperCase();
}

export async function sha256Hex(raw: string): Promise<string> {
  const normalized = cleanLicenseKey(raw);
  if (!normalized || typeof crypto === 'undefined' || !crypto.subtle) return '';
  const data = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function syncSubscriberLicenseDocs(sub: any): Promise<void> {
  if (!isFirebaseAdminSignedIn() || !sub) return;
  const candidateKeys = Array.from(
    new Set(
      [cleanLicenseKey(sub.robotApiKey || ''), cleanLicenseKey(sub.brokerAccountId || '')].filter(
        k => k.length >= 3
      )
    )
  );
  if (candidateKeys.length === 0) return;

  const statusVal: 'ACTIVE' | 'PENDING' | 'BANNED' =
    sub.status === 'PENDING' || sub.status === 'BANNED' ? sub.status : 'ACTIVE';
  const rawExp = String(sub.robotExpiryDate || sub.expiryDate || '').trim();
  const expiryDate = /^\d{4}-\d{2}-\d{2}$/.test(rawExp) ? rawExp : '';
  const active = statusVal === 'ACTIVE' && sub.robotEnabled !== false;
  const defaultMode: 'AUTO' | 'MANUAL' =
    sub.robotDefaultMode === 'MANUAL' || sub.defaultMode === 'MANUAL' ? 'MANUAL' : 'AUTO';
  const tradeStake = Math.min(10000, Math.max(1, Number(sub.robotTradeStake || sub.tradeStakeUsd) || 5));
  const memberLabel = String(sub.name || 'عضو ZAD FX').trim().slice(0, 120) || 'عضو ZAD FX';
  const signature = `${active}|${statusVal}|${expiryDate}|${defaultMode}|${tradeStake}|${memberLabel}`;

  for (const keyVal of candidateKeys) {
    const hash = await sha256Hex(keyVal);
    if (!hash) continue;
    if (syncedLicenseSignatures.get(hash) === signature) continue;
    try {
      await setDoc(doc(db, ROBOT_LICENSES_COLLECTION, hash), {
        active,
        status: statusVal,
        expiryDate,
        defaultMode,
        tradeStake,
        memberLabel,
        updatedAt: new Date().toISOString()
      });
      syncedLicenseSignatures.set(hash, signature);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `${ROBOT_LICENSES_COLLECTION}/${hash}`);
    }
  }
}

export async function syncSubscribersToRobotLicenses(subscribers: any[]): Promise<void> {
  if (!isFirebaseAdminSignedIn() || !Array.isArray(subscribers)) return;
  for (const sub of subscribers) {
    await syncSubscriberLicenseDocs(sub).catch(() => {});
  }
}

export async function deleteRobotLicenseFromFirestore(robotApiKey?: string, brokerAccountId?: string): Promise<void> {
  if (!isFirebaseAdminSignedIn()) return;
  const keys = Array.from(
    new Set(
      [cleanLicenseKey(robotApiKey || ''), cleanLicenseKey(brokerAccountId || '')].filter(
        k => k.length >= 3
      )
    )
  );
  for (const k of keys) {
    const hash = await sha256Hex(k);
    if (!hash) continue;
    syncedLicenseSignatures.delete(hash);
    try {
      await deleteDoc(doc(db, ROBOT_LICENSES_COLLECTION, hash));
    } catch (_e) {}
  }
}

export async function saveCloudSubscribers(subscribers: any[]): Promise<boolean> {
  if (!Array.isArray(subscribers)) return false;
  const normalized = mergeSubscriberListsById(subscribers.map(normalizeCloudSubscriber), []).slice(0, 250);
  inMemoryCachedSubscribers = normalized;
  if (!isFirebaseAdminSignedIn()) return false;

  const fullPath = `${SYSTEM_STATE_DOC_PATH}/${PLATFORM_SUBSCRIBERS_DOC_ID}`;
  try {
    const nowIso = new Date().toISOString();
    let listToSerialize = normalized;
    let serialized = JSON.stringify(listToSerialize);
    if (serialized.length > 480000) {
      listToSerialize = normalized.map(s => ({ ...s, messages: [] }));
      serialized = JSON.stringify(listToSerialize);
    }
    if (serialized.length > 480000) {
      listToSerialize = listToSerialize.slice(0, 150);
      serialized = JSON.stringify(listToSerialize);
    }
    if (serialized.length > 495000) return false;

    await setDoc(doc(db, SYSTEM_STATE_DOC_PATH, PLATFORM_SUBSCRIBERS_DOC_ID), {
      updatedAt: nowIso,
      payload: serialized
    });

    try {
      const mainState = await readMainStateDoc();
      if (mainState) {
        mainState.subscribers = listToSerialize.slice(0, 100);
        await writeMainStateDoc(mainState);
      }
    } catch (_ignore) {}

    syncSubscribersToRobotLicenses(normalized).catch(() => {});
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, fullPath);
    return false;
  }
}

export async function loadSubscribersFromFirestore<T = any[]>(): Promise<T | null> {
  if (!isFirebaseAdminSignedIn()) return null;
  const fullPath = `${SYSTEM_STATE_DOC_PATH}/${PLATFORM_SUBSCRIBERS_DOC_ID}`;
  let dedicatedSubs: any[] = [];
  let hasDedicatedDoc = false;
  try {
    const snap = await getDoc(doc(db, SYSTEM_STATE_DOC_PATH, PLATFORM_SUBSCRIBERS_DOC_ID));
    if (snap.exists()) {
      hasDedicatedDoc = true;
      const data = snap.data();
      if (data && typeof data.payload === 'string') {
        const parsed = JSON.parse(data.payload);
        if (Array.isArray(parsed)) {
          dedicatedSubs = parsed;
        }
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, fullPath);
  }

  let mainSubs: any[] = [];
  let hasMainSubs = false;
  try {
    const mainState = await readMainStateDoc();
    if (mainState && Array.isArray(mainState.subscribers)) {
      hasMainSubs = true;
      mainSubs = mainState.subscribers;
    }
  } catch (_err) {}

  if (!hasDedicatedDoc && !hasMainSubs) {
    return inMemoryCachedSubscribers as T | null;
  }

  const merged = mergeSubscriberListsById(dedicatedSubs, mainSubs);
  inMemoryCachedSubscribers = merged;
  syncSubscribersToRobotLicenses(merged).catch(() => {});
  return merged as T;
}

export async function saveSubscriberToFirestore(subscriber: any): Promise<boolean> {
  if (!isFirebaseAdminSignedIn() || !subscriber || !subscriber.id) return false;
  await syncSubscriberLicenseDocs(subscriber).catch(() => {});
  const existing = (await loadSubscribersFromFirestore<any[]>()) || [];
  const next = mergeSubscriberListsById([subscriber], existing);
  return await saveCloudSubscribers(next);
}

export async function deleteSubscriberFromFirestore(subscriberId: string, _robotApiKey?: string): Promise<boolean> {
  if (!isFirebaseAdminSignedIn() || !subscriberId) return false;
  const existing = (await loadSubscribersFromFirestore<any[]>()) || [];
  const target = existing.find((s: any) => s.id === subscriberId);
  await deleteRobotLicenseFromFirestore(
    _robotApiKey || target?.robotApiKey,
    target?.brokerAccountId
  ).catch(() => {});

  const filtered = existing.filter((s: any) => s.id !== subscriberId);
  inMemoryCachedSubscribers = filtered;

  let okDedicated = false;
  const fullPath = `${SYSTEM_STATE_DOC_PATH}/${PLATFORM_SUBSCRIBERS_DOC_ID}`;
  try {
    const nowIso = new Date().toISOString();
    const serialized = JSON.stringify(filtered.map(normalizeCloudSubscriber));
    if (serialized.length <= 495000) {
      await setDoc(doc(db, SYSTEM_STATE_DOC_PATH, PLATFORM_SUBSCRIBERS_DOC_ID), {
        updatedAt: nowIso,
        payload: serialized
      });
      okDedicated = true;
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, fullPath);
  }

  let okMain = false;
  try {
    const mainState = (await readMainStateDoc()) || {};
    const list: any[] = Array.isArray(mainState.subscribers) ? mainState.subscribers : [];
    mainState.subscribers = list.filter((s: any) => s.id !== subscriberId);
    okMain = await writeMainStateDoc(mainState);
  } catch (_err) {}

  return okDedicated || okMain;
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

function decodeFirestoreValue(val: any): any {
  if (!val || typeof val !== 'object') return undefined;
  if ('nullValue' in val) return null;
  if ('booleanValue' in val) return Boolean(val.booleanValue);
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue' in val) return Number(val.doubleValue);
  if ('stringValue' in val) return String(val.stringValue);
  if ('timestampValue' in val) return String(val.timestampValue);
  if ('arrayValue' in val) {
    const arr = Array.isArray(val.arrayValue?.values) ? val.arrayValue.values : [];
    return arr.map(decodeFirestoreValue);
  }
  if ('mapValue' in val) {
    const fields = val.mapValue?.fields || {};
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(fields)) {
      out[k] = decodeFirestoreValue(v);
    }
    return out;
  }
  return undefined;
}

function decodeFirestoreFields(fields: Record<string, any> | undefined): Record<string, any> | null {
  if (!fields || typeof fields !== 'object') return null;
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(fields)) {
    out[k] = decodeFirestoreValue(v);
  }
  return out;
}

async function fetchFirestoreDocRestOrSdk(collectionName: string, docId: string): Promise<Record<string, any> | null> {
  try {
    const url = `${FIRESTORE_REST_BASE}/${encodeURIComponent(collectionName)}/${encodeURIComponent(docId)}?key=${encodeURIComponent(FIREBASE_REST_API_KEY)}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (res.status === 404) return null;
    if (res.ok) {
      const json = await res.json().catch(() => null);
      if (json && json.fields) {
        return decodeFirestoreFields(json.fields);
      }
    }
  } catch (_e) {}

  try {
    const snap = await getDocFromServer(doc(db, collectionName, docId));
    return snap.exists() ? (snap.data() as Record<string, any>) : null;
  } catch (_err) {
    return null;
  }
}

function getCairoScheduleSnapshot() {
  const now = new Date();
  const dayUtc = now.getUTCDay();
  const hourUtc = now.getUTCHours();
  const marketOpen = !(dayUtc === 6 || (dayUtc === 5 && hourUtc >= 21) || (dayUtc === 0 && hourUtc < 21));

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(now);
  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }
  const todayStr = `${map.year}-${map.month}-${map.day}`;
  const cairoHour = Number(map.hour) % 24;
  const cairoMinute = Number(map.minute);
  const totalMins = cairoHour * 60 + cairoMinute;
  // VIP & Robot evening session: 16:30 (990) to 19:00 (1140) Cairo time
  const inEveningVipWindow = totalMins >= 16 * 60 + 30 && totalMins < 19 * 60;
  return {
    todayStr,
    marketOpen,
    inEveningVipWindow
  };
}

/**
 * Option A security policy:
 * NEVER place member PII, emails, or raw API keys in robot_feed/live.
 * robot_feed/live only mirrors anonymized signal status & session metadata.
 */
export async function syncRobotPublicFeedToFirestore(
  signalsList: any[],
  meta?: {
    marketOpen?: boolean;
    isTradingHours?: boolean;
    isLockedOutsideHours?: boolean;
    lockReason?: string;
    workingHoursText?: string;
    nextSessionText?: string;
    isWarmup?: boolean;
    warmupMinutesRemaining?: number;
    warmupReason?: string;
    tradingHoursMessage?: string;
  }
): Promise<boolean> {
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
        entryMinute: String(latest.entryMinute || ''),
        targetEntryTimestamp: Number(latest.targetEntryTimestamp || 0),
        livePrice: String(latest.livePrice || ''),
        createdAt: String(latest.createdAt || '')
      }
    : null;

  const updatedAt = new Date().toISOString();
  const payloadObj = {
    updatedAt,
    ...(meta || {}),
    activeSignal: sanitizedSignal
  };
  const payloadStr = JSON.stringify(payloadObj);

  try {
    await setDoc(doc(db, 'robot_feed', 'live'), {
      updatedAt,
      signal: sanitizedSignal,
      ...(payloadStr.length <= 490000 ? { payload: payloadStr } : {})
    });
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'robot_feed/live');
    return false;
  }
}

/**
 * Direct Firestore REST/SDK verification using SHA-256 hashed non-PII license docs (`robot_licenses/{sha256}`)
 * combined with `robot_feed/live` so fx.zadtoo.com and Tampermonkey connect directly without server proxy walls.
 */
export async function fetchRobotFeedFromFirestore(apiKey?: string): Promise<any> {
  const cleanKey = cleanLicenseKey(apiKey || '');
  if (!cleanKey) {
    return {
      ok: false,
      authorized: false,
      error: 'يرجى إدخال مفتاح تفعيل العضو (API Key) الصادر من المشرف.'
    };
  }

  const keyHash = await sha256Hex(cleanKey);
  if (!keyHash) {
    return {
      ok: false,
      authorized: false,
      error: 'تعذر تشفير المفتاح للتحقق السحابي.'
    };
  }

  const [licenseDoc, feedDoc] = await Promise.all([
    fetchFirestoreDocRestOrSdk(ROBOT_LICENSES_COLLECTION, keyHash),
    fetchFirestoreDocRestOrSdk('robot_feed', 'live')
  ]);

  if (!licenseDoc) {
    return {
      ok: false,
      authorized: false,
      error: 'مفتاح الروبوت أو رقم حساب البروكر غير مسجل أو غير مصادق عليه من المشرف.'
    };
  }

  const sched = getCairoScheduleSnapshot();
  if (licenseDoc.status === 'PENDING') {
    return {
      ok: false,
      authorized: false,
      memberName: licenseDoc.memberLabel || 'عضو ZAD FX',
      error: 'حسابك قيد المراجعة وبانتظار مصادقة المشرف وتحديد خطتك وصلاحيتها.'
    };
  }
  if (licenseDoc.status === 'BANNED' || licenseDoc.active === false) {
    return {
      ok: false,
      authorized: false,
      memberName: licenseDoc.memberLabel || 'عضو ZAD FX',
      error: 'تم إيقاف صلاحية الروبوت لهذا الحساب من قِبل المشرف.'
    };
  }

  const expDate = String(licenseDoc.expiryDate || '').trim();
  if (!expDate || !/^\d{4}-\d{2}-\d{2}$/.test(expDate)) {
    return {
      ok: false,
      authorized: false,
      memberName: licenseDoc.memberLabel || 'عضو ZAD FX',
      error: 'لم يحدد المشرف مدة صلاحية الخطة لهذا الحساب بعد.'
    };
  }
  if (expDate < sched.todayStr) {
    return {
      ok: false,
      authorized: false,
      memberName: licenseDoc.memberLabel || 'عضو ZAD FX',
      expiryDate: expDate,
      daysLeft: 0,
      error: `انتهت مدة صلاحية خطتك بتاريخ (${expDate}). يرجى مراجعة المشرف لتجديد الاشتراك.`
    };
  }

  const diffMs = new Date(`${expDate}T23:59:59Z`).getTime() - Date.now();
  const daysLeft = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

  let feedMeta: any = {};
  if (feedDoc && typeof feedDoc.payload === 'string') {
    try {
      feedMeta = JSON.parse(feedDoc.payload) || {};
    } catch (_e) {}
  }

  const rawSig = feedMeta.activeSignal || feedDoc?.signal || null;
  let activeSignal = null;
  if (rawSig && rawSig.id && sched.marketOpen) {
    const nowSec = Math.floor(Date.now() / 1000);
    const targetSec = Number(rawSig.targetEntryTimestamp || 0);
    const createdAgeSec = rawSig.createdAt
      ? Math.floor((Date.now() - new Date(rawSig.createdAt).getTime()) / 1000)
      : 0;
    const isFreshPending =
      rawSig.status === 'PENDING' &&
      createdAgeSec <= 180 &&
      (!targetSec || (targetSec - nowSec >= -65 && targetSec - nowSec <= 180));
    const isRecentResult =
      (rawSig.status === 'WIN' || rawSig.status === 'LOSS') &&
      targetSec > 0 &&
      nowSec - (targetSec + 60) >= 0 &&
      nowSec - (targetSec + 60) <= 15;
    if (isFreshPending || isRecentResult) {
      activeSignal = {
        ...rawSig,
        secondsUntilEntry: targetSec ? Math.round(targetSec - nowSec) : 0
      };
    }
  }

  const feedAgeMs = feedDoc?.updatedAt ? Date.now() - new Date(feedDoc.updatedAt).getTime() : Infinity;
  const useFeedSession = feedAgeMs < 120000 && typeof feedMeta.isTradingHours === 'boolean';
  const isTradingHours = useFeedSession ? Boolean(feedMeta.isTradingHours) : sched.inEveningVipWindow;
  const isLockedOutsideHours = useFeedSession ? Boolean(feedMeta.isLockedOutsideHours) : !sched.inEveningVipWindow;

  return {
    ok: true,
    authorized: true,
    source: 'cloud_firestore',
    strategyEngineMode: 'VIP_WITH_MPB',
    serverTimeIso: new Date().toISOString(),
    serverEpochMs: Date.now(),
    serverEpochSeconds: Math.floor(Date.now() / 1000),
    marketOpen: sched.marketOpen,
    isMarketOpen: sched.marketOpen,
    isTradingHours,
    isLockedOutsideHours,
    lockReason: useFeedSession
      ? (feedMeta.lockReason || '')
      : (!sched.inEveningVipWindow ? 'جلسة VIP والروبوت تعمل يومياً من 04:30 عصراً حتى 07:00 مساءً بتوقيت القاهرة.' : ''),
    workingHoursText: feedMeta.workingHoursText || '04:30 م - 07:00 م بتوقيت القاهرة',
    isWarmup: useFeedSession ? Boolean(feedMeta.isWarmup) : false,
    tradingHoursMessage: useFeedSession
      ? (feedMeta.tradingHoursMessage || '')
      : (sched.inEveningVipWindow ? 'ساعات التداول نشطة (04:30 م - 07:00 م)' : 'الروبوت بانتظار موعد الجلسة المسائية 04:30 م بتوقيت القاهرة'),
    member: {
      name: licenseDoc.memberLabel || 'عضو ZAD FX',
      status: licenseDoc.status,
      expiryDate: expDate,
      daysLeft,
      defaultMode: licenseDoc.defaultMode || 'AUTO',
      tradeStakeUsd: Number(licenseDoc.tradeStake) || 5
    },
    activeSignal
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
  const [existing, existingCloudSubs] = await Promise.all([
    readMainStateDoc().then(r => r || {}),
    loadSubscribersFromFirestore<any[]>().then(r => (Array.isArray(r) ? r : []))
  ]);
  const mainSubs: any[] = Array.isArray(existing.subscribers) ? existing.subscribers : [];
  const allExistingSubs = mergeSubscriberListsById(existingCloudSubs, mainSubs);

  let mergedSubscribers = allExistingSubs;
  if (Array.isArray(state.subscribers)) {
    mergedSubscribers = mergeSubscriberListsById(state.subscribers, allExistingSubs);
    await saveCloudSubscribers(mergedSubscribers).catch(() => false);
  }
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
    ...(Array.isArray(state.subscribers) ? { subscribers: mergedSubscribers.map(normalizeCloudSubscriber) } : {})
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
        sanitizedObj.subscribers = sanitizedObj.subscribers.map(normalizeCloudSubscriber);
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
