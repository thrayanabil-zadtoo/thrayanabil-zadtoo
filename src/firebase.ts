import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  type User
} from 'firebase/auth';
import {
  initializeFirestore,
  doc,
  getDoc,
  getDocs,
  getDocFromServer,
  setDoc,
  deleteDoc,
  collection,
  query,
  where,
  serverTimestamp,
  setLogLevel
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Silence noisy internal WebChannel connection retry warnings in restricted iframe/proxy networks
setLogLevel('silent');

const app = initializeApp(firebaseConfig);

// Use experimentalForceLongPolling so Firestore connects reliably across browsers and proxy networks
export const db = initializeFirestore(
  app,
  {
    experimentalForceLongPolling: true,
  },
  firebaseConfig.firestoreDatabaseId
);

export const auth = getAuth(app);
export const ADMIN_EMAIL = 'thrayanabil@gmail.com';
export const FIREBASE_PROJECT_ID = firebaseConfig.projectId;
export const FIREBASE_DATABASE_ID = firebaseConfig.firestoreDatabaseId;
export const FIREBASE_WEB_API_KEY = firebaseConfig.apiKey;
export const FIRESTORE_REST_BASE = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${firebaseConfig.firestoreDatabaseId}/documents`;

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

// Startup connection validation required by Firebase SDK guidelines
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
if (typeof window !== 'undefined') {
  testConnection();
}

export function isFirebaseAdminUser(user: User | null | undefined): boolean {
  return Boolean(
    user &&
      user.email &&
      user.email.toLowerCase() === ADMIN_EMAIL &&
      user.emailVerified
  );
}

export function subscribeFirebaseAdminAuth(callback: (isAdmin: boolean, user: User | null) => void): () => void {
  return onAuthStateChanged(auth, (user) => {
    callback(isFirebaseAdminUser(user), user);
  });
}

export async function signInAdminWithGoogle(): Promise<{ ok: boolean; user?: User; error?: string }> {
  try {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const result = await signInWithPopup(auth, provider);
    const user = result.user;
    if (!isFirebaseAdminUser(user)) {
      await signOut(auth).catch(() => {});
      return {
        ok: false,
        error: `هذا الحساب (${user?.email || 'غير معروف'}) غير مصرح له بصلاحيات المشرف. يرجى الدخول بحساب ${ADMIN_EMAIL}.`
      };
    }
    return { ok: true, user };
  } catch (err: any) {
    const code = err?.code || '';
    if (code === 'auth/popup-closed-by-user') {
      return { ok: false, error: 'تم إغلاق نافذة تسجيل الدخول قبل إتمام المصادقة.' };
    }
    if (code === 'auth/popup-blocked') {
      return { ok: false, error: 'المتصفح منع النافذة المنبثقة — اسمح بالنوافذ المنبثقة وحاول مرة أخرى.' };
    }
    return { ok: false, error: err?.message || 'تعذر تسجيل الدخول عبر Google.' };
  }
}

export async function signOutFirebaseAdmin(): Promise<void> {
  await signOut(auth).catch(() => {});
}

export function sanitizeFirestoreId(raw: string, fallbackPrefix = 'id'): string {
  const cleaned = String(raw || '')
    .trim()
    .replace(/[^a-zA-Z0-9_\-]/g, '_')
    .slice(0, 128);
  return cleaned || `${fallbackPrefix}_${Date.now()}`;
}

export function canWriteFirestoreAsAdmin(): boolean {
  return isFirebaseAdminUser(auth.currentUser);
}

// Legacy compatibility constants
export const SYSTEM_STATE_DOC_PATH = 'system_state';
export const SYSTEM_STATE_DOC_ID = 'zad_main_state_v1';
export const PLATFORM_PLANS_DOC_ID = 'platform_plans';
export const PLATFORM_LINKS_DOC_ID = 'platform_contact_links';

export async function loadCloudPlans<T = any[]>(): Promise<T | null> {
  try {
    const pubSnap = await getDoc(doc(db, 'public_config', 'plans'));
    if (pubSnap.exists()) {
      const data = pubSnap.data();
      if (data && Array.isArray(data.items) && data.items.length > 0) {
        return data.items as T;
      }
    }
    const legacySnap = await getDoc(doc(db, SYSTEM_STATE_DOC_PATH, PLATFORM_PLANS_DOC_ID));
    if (legacySnap.exists()) {
      const data = legacySnap.data();
      if (data && typeof data.payload === 'string') {
        const parsed = JSON.parse(data.payload);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed as T;
      }
    }
  } catch (_e) {}
  return null;
}

export async function saveCloudPlans(plans: any[]): Promise<boolean> {
  if (!canWriteFirestoreAsAdmin()) return false;
  const safePlans = (Array.isArray(plans) ? plans : []).slice(0, 20).map((p) => {
    const item: Record<string, any> = {
      id: String(p?.id || '').slice(0, 64),
      name: String(p?.name || p?.label || 'باقة اشتراك').slice(0, 120),
      priceUsd: Math.max(0, Number(p?.priceUsd) || 0),
      durationDays: Math.max(1, Number(p?.durationDays) || 30),
      durationLabel: String(p?.durationLabel || '/ شهر').slice(0, 64),
      isPopular: Boolean(p?.isPopular),
      isReferralFree: Boolean(p?.isReferralFree),
      enabled: p?.enabled !== false && p?.isActive !== false,
      features: Array.isArray(p?.features) ? p.features.slice(0, 10).map((f: any) => String(f).slice(0, 140)) : []
    };
    if (p?.badge) item.badge = String(p.badge).slice(0, 64);
    if (p?.icon) item.icon = String(p.icon).slice(0, 32);
    if (p?.colorTheme) item.colorTheme = String(p.colorTheme).slice(0, 32);
    return item;
  });
  try {
    await setDoc(doc(db, 'public_config', 'plans'), {
      items: safePlans,
      updatedAt: serverTimestamp()
    });
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'public_config/plans');
    return false;
  }
}

export async function loadCloudContactLinks<T = any>(): Promise<T | null> {
  try {
    const pubSnap = await getDoc(doc(db, 'public_config', 'contact_links'));
    if (pubSnap.exists()) {
      const data = pubSnap.data();
      if (data && typeof data === 'object') {
        const { updatedAt: _u, ...rest } = data as any;
        return rest as T;
      }
    }
    const legacySnap = await getDoc(doc(db, SYSTEM_STATE_DOC_PATH, PLATFORM_LINKS_DOC_ID));
    if (legacySnap.exists()) {
      const data = legacySnap.data();
      if (data && typeof data.payload === 'string') {
        const parsed = JSON.parse(data.payload);
        if (parsed && typeof parsed === 'object') return parsed as T;
      }
    }
  } catch (_e) {}
  return null;
}

export async function saveCloudContactLinks(links: any): Promise<boolean> {
  if (!canWriteFirestoreAsAdmin() || !links || typeof links !== 'object') return false;
  try {
    await setDoc(doc(db, 'public_config', 'contact_links'), {
      quotexReferralLink: String(links.quotexReferralLink || '').slice(0, 300),
      telegramChannelUrl: String(links.telegramChannelUrl || '').slice(0, 300),
      telegramChannelUsername: String(links.telegramChannelUsername || '').slice(0, 128),
      telegramVipChannelUrl: String(links.telegramVipChannelUrl || '').slice(0, 300),
      telegramSupportUrl: String(links.telegramSupportUrl || '').slice(0, 300),
      whatsappSupportNumber: String(links.whatsappSupportNumber || '').slice(0, 64),
      supportEmail: String(links.supportEmail || '').slice(0, 160),
      contactNotes: String(links.contactNotes || '').slice(0, 1000),
      updatedAt: serverTimestamp()
    });
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'public_config/contact_links');
    return false;
  }
}

export async function loadCloudPaymentMethods<T = any[]>(): Promise<T | null> {
  try {
    const snap = await getDoc(doc(db, 'public_config', 'payment_methods'));
    if (snap.exists()) {
      const data = snap.data();
      if (data && Array.isArray(data.items) && data.items.length > 0) {
        return data.items as T;
      }
    }
  } catch (_e) {}
  return null;
}

export async function saveCloudPaymentMethods(methods: any[]): Promise<boolean> {
  if (!canWriteFirestoreAsAdmin()) return false;
  const safeMethods = (Array.isArray(methods) ? methods : []).slice(0, 25).map((m) => {
    const item: Record<string, any> = {
      id: String(m?.id || '').slice(0, 64),
      name: String(m?.name || '').slice(0, 120),
      category: String(m?.category || 'other').slice(0, 32),
      accountNumber: String(m?.accountNumber || '').slice(0, 160),
      accountHolderName: String(m?.accountHolderName || m?.accountHolder || '').slice(0, 120),
      networkOrBank: String(m?.networkOrBank || '').slice(0, 120),
      instructions: String(m?.instructions || m?.notes || '').slice(0, 500),
      minAmountUsd: Math.max(0, Number(m?.minAmountUsd) || 10),
      isActive: m?.isActive !== false,
      supportedCurrencies: Array.isArray(m?.supportedCurrencies)
        ? m.supportedCurrencies.slice(0, 10).map((c: any) => String(c).slice(0, 16))
        : ['USD', 'EGP']
    };
    if (m?.qrCodeUrl) item.qrCodeUrl = String(m.qrCodeUrl).slice(0, 300);
    return item;
  });
  try {
    await setDoc(doc(db, 'public_config', 'payment_methods'), {
      items: safeMethods,
      updatedAt: serverTimestamp()
    });
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'public_config/payment_methods');
    return false;
  }
}

export async function loadCloudRobotSettings<T = any>(): Promise<T | null> {
  try {
    const snap = await getDoc(doc(db, 'public_config', 'robot_settings'));
    if (snap.exists()) {
      const data = snap.data();
      if (data && typeof data === 'object') {
        const { updatedAt: _u, ...rest } = data as any;
        return rest as T;
      }
    }
  } catch (_e) {}
  return null;
}

export async function saveCloudRobotSettings(settings: any): Promise<boolean> {
  if (!canWriteFirestoreAsAdmin() || !settings || typeof settings !== 'object') return false;
  try {
    await setDoc(doc(db, 'public_config', 'robot_settings'), {
      isPublishedToVisitors: Boolean(settings.isPublishedToVisitors),
      robotTitle: String(settings.robotTitle || 'روبوت التداول الآلي الذكي (Quotex Pro Bot)').slice(0, 160),
      version: String(settings.version || 'v5.0').slice(0, 64),
      defaultMode: settings.defaultMode === 'AUTO' ? 'AUTO' : 'MANUAL',
      strategyEngineMode: settings.strategyEngineMode === 'PUBLIC_CLASSIC' ? 'PUBLIC_CLASSIC' : 'VIP_WITH_MPB',
      noMartingaleStrict: true,
      soundAlertsEnabled: settings.soundAlertsEnabled !== false,
      autoSelectPair: settings.autoSelectPair !== false,
      autoSetExpiryM1: settings.autoSetExpiryM1 !== false,
      defaultStakeUsd: Math.min(10000, Math.max(1, Number(settings.defaultStakeUsd) || 5)),
      updatedAt: serverTimestamp()
    });
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'public_config/robot_settings');
    return false;
  }
}

export async function loadSubscribersFromFirestore(): Promise<any[] | null> {
  if (!canWriteFirestoreAsAdmin()) return null;
  try {
    const snap = await getDocs(collection(db, 'subscribers'));
    const list: any[] = [];
    snap.forEach((docSnap) => {
      const d = docSnap.data();
      list.push({
        ...d,
        id: d.id || docSnap.id,
        createdAt: d.createdAtIso || new Date().toISOString()
      });
    });
    list.sort((a, b) => String(b.createdAtIso || '').localeCompare(String(a.createdAtIso || '')));
    return list;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'subscribers');
    return null;
  }
}

export async function saveSubscriberToFirestore(sub: any): Promise<boolean> {
  if (!canWriteFirestoreAsAdmin() || !sub || !sub.id) return false;
  const subId = sanitizeFirestoreId(String(sub.id), 'sub');
  const status: 'PENDING' | 'ACTIVE' | 'BANNED' =
    sub.status === 'ACTIVE' || sub.status === 'BANNED' ? sub.status : 'PENDING';
  const payload: Record<string, any> = {
    id: subId,
    name: String(sub.name || 'عضو VIP').slice(0, 160),
    telegramUsername: String(sub.telegramUsername || '').slice(0, 128),
    country: String(sub.country || '').slice(0, 80),
    email: String(sub.email || '').slice(0, 160),
    phone: String(sub.phone || '').slice(0, 64),
    broker: String(sub.broker || 'Quotex (كوتيكس)').slice(0, 80),
    brokerAccountId: String(sub.brokerAccountId || '').slice(0, 128),
    subscriptionType: String(sub.subscriptionType || 'paid_plan').slice(0, 64),
    planDuration: String(sub.planDuration || '1_month').slice(0, 64),
    paymentMethod: String(sub.paymentMethod || '').slice(0, 160),
    amountPaid: Math.min(1000000, Math.max(0, Number(sub.amountPaid) || 0)),
    status,
    expiryDate: String(sub.expiryDate || '').slice(0, 32),
    robotApiKey: String(sub.robotApiKey || '').slice(0, 128),
    robotExpiryDate: String(sub.robotExpiryDate || sub.expiryDate || '').slice(0, 32),
    robotEnabled: sub.robotEnabled !== false,
    robotDefaultMode: sub.robotDefaultMode === 'MANUAL' ? 'MANUAL' : 'AUTO',
    robotStakeUsd: Math.min(10000, Math.max(1, Number(sub.robotStakeUsd ?? sub.robotTradeStake) || 5)),
    activationLink: String(sub.activationLink || '').slice(0, 512),
    notes: String(sub.notes || '').slice(0, 2000),
    createdAtIso: String(sub.createdAt || sub.createdAtIso || new Date().toISOString()).slice(0, 64),
    updatedAt: serverTimestamp()
  };

  try {
    await setDoc(doc(db, 'subscribers', subId), payload);
    const keyId = String(sub.robotApiKey || '').trim().toUpperCase();
    if (keyId && /^[A-Z0-9_\-]+$/.test(keyId) && keyId.length <= 128) {
      await setDoc(doc(db, 'robot_keys', keyId), {
        active: status === 'ACTIVE' && sub.robotEnabled !== false,
        expiryDate: String(sub.robotExpiryDate || sub.expiryDate || '2099-12-31').slice(0, 32),
        defaultMode: sub.robotDefaultMode === 'MANUAL' ? 'MANUAL' : 'AUTO',
        defaultStakeUsd: Math.min(10000, Math.max(1, Number(sub.robotStakeUsd ?? sub.robotTradeStake) || 5)),
        label: String(sub.name || 'عضو VIP').slice(0, 80),
        updatedAt: serverTimestamp()
      });
    }
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `subscribers/${subId}`);
    return false;
  }
}

export async function deleteSubscriberFromFirestore(subId: string, robotApiKey?: string): Promise<boolean> {
  if (!canWriteFirestoreAsAdmin() || !subId) return false;
  const safeId = sanitizeFirestoreId(subId, 'sub');
  try {
    await deleteDoc(doc(db, 'subscribers', safeId));
    const keyId = String(robotApiKey || '').trim().toUpperCase();
    if (keyId && /^[A-Z0-9_\-]+$/.test(keyId) && keyId.length <= 128) {
      await deleteDoc(doc(db, 'robot_keys', keyId)).catch(() => {});
    }
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `subscribers/${safeId}`);
    return false;
  }
}

export async function loadSignalsFromFirestore(): Promise<any[] | null> {
  try {
    const q = query(
      collection(db, 'signals'),
      where('status', 'in', ['PENDING', 'WIN', 'WIN_GALE1', 'LOSS'])
    );
    const snap = await getDocs(q);
    const list: any[] = [];
    snap.forEach((docSnap) => {
      const d = docSnap.data();
      list.push({
        ...d,
        id: d.id || docSnap.id,
        createdAt: d.createdAtIso || new Date().toISOString()
      });
    });
    list.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    return list;
  } catch (_err) {
    return null;
  }
}

export async function saveSignalToFirestore(sig: any): Promise<boolean> {
  if (!canWriteFirestoreAsAdmin() || !sig || !sig.id) return false;
  const sigId = sanitizeFirestoreId(String(sig.id), 'sig');
  const direction = sig.direction === 'PUT' ? 'PUT' : 'CALL';
  const status =
    sig.status === 'WIN' || sig.status === 'WIN_GALE1' || sig.status === 'LOSS'
      ? sig.status
      : 'PENDING';
  const payload: Record<string, any> = {
    id: sigId,
    asset: String(sig.asset || 'EUR/USD').slice(0, 32),
    direction,
    timeframe: String(sig.timeframe || 'M1').slice(0, 16),
    entryMinute: String(sig.entryMinute || '').slice(0, 32),
    entryTime: String(sig.entryTime || '').slice(0, 32),
    status,
    livePrice: String(sig.livePrice || '').slice(0, 64),
    strategyType: String(sig.strategyType || 'MOMENTUM_PAUSE_BREAKOUT').slice(0, 64),
    successRateText: String(sig.successRateText || '94%').slice(0, 32),
    qualityScore: Math.min(100, Math.max(0, Number(sig.qualityScore) || 92)),
    createdAtIso: String(sig.createdAt || sig.createdAtIso || new Date().toISOString()).slice(0, 64),
    updatedAt: serverTimestamp()
  };
  if (typeof sig.rsiValue === 'number' && Number.isFinite(sig.rsiValue)) {
    payload.rsiValue = sig.rsiValue;
  }
  if (typeof sig.targetEntryTimestamp === 'number' && Number.isFinite(sig.targetEntryTimestamp)) {
    payload.targetEntryTimestamp = sig.targetEntryTimestamp;
  }
  try {
    await setDoc(doc(db, 'signals', sigId), payload);
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `signals/${sigId}`);
    return false;
  }
}

export async function deleteSignalFromFirestore(sigId: string): Promise<boolean> {
  if (!canWriteFirestoreAsAdmin() || !sigId) return false;
  const safeId = sanitizeFirestoreId(sigId, 'sig');
  try {
    await deleteDoc(doc(db, 'signals', safeId));
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `signals/${safeId}`);
    return false;
  }
}

export async function syncRobotPublicFeedToFirestore(
  signals: any[],
  options?: { targetPair?: string; allowedPairs?: string[] }
): Promise<boolean> {
  if (!canWriteFirestoreAsAdmin()) return false;
  const nowMs = Date.now();
  const safeSignals = Array.isArray(signals) ? signals : [];
  const activeSig =
    safeSignals.find((s) => s?.status === 'PENDING') ||
    safeSignals[0] ||
    null;

  const todayPrefix = new Date().toISOString().slice(0, 10);
  const todaySignals = safeSignals.filter((s) =>
    String(s?.createdAt || s?.createdAtIso || '').startsWith(todayPrefix)
  );
  const wins = todaySignals.filter((s) => s?.status === 'WIN').length;
  const losses = todaySignals.filter(
    (s) => s?.status === 'LOSS' || s?.status === 'WIN_GALE1'
  ).length;
  const total = wins + losses;
  const winRate = total > 0 ? Math.round((wins / total) * 100) : 100;

  const nowDate = new Date();
  const day = nowDate.getUTCDay();
  const hour = nowDate.getUTCHours();
  const marketOpen = !(day === 6 || (day === 5 && hour >= 21) || (day === 0 && hour < 21));

  const allowedPairs = (
    options?.allowedPairs && options.allowedPairs.length > 0
      ? options.allowedPairs
      : ['EUR/USD', 'EUR/JPY', 'GBP/USD', 'AUD/USD', 'USD/CAD', 'GBP/JPY']
  )
    .filter((p) => p && !p.includes('USD/JPY') && !p.includes('USDJPY'))
    .slice(0, 20);

  const feedDoc: Record<string, any> = {
    updatedAt: serverTimestamp(),
    serverEpochMs: nowMs,
    marketOpen,
    isTradingHours: marketOpen,
    isLockedOutsideHours: !marketOpen,
    lockReason: marketOpen ? '' : 'السوق العالمي مغلق حالياً (عطلة نهاية الأسبوع)',
    workingHoursText: '09:00 ص - 09:00 م',
    nextSessionText: marketOpen ? 'الجلسة نشطة الآن' : 'يفتح الأحد 21:00 UTC',
    wins,
    losses,
    winRate,
    targetPair: String(options?.targetPair || allowedPairs[0] || 'EUR/USD').slice(0, 32),
    allowedPairs,
    hasActiveSignal: Boolean(activeSig),
    signalId: activeSig ? String(activeSig.id || '').slice(0, 128) : '',
    signalAsset: activeSig ? String(activeSig.asset || '').slice(0, 32) : '',
    signalDirection: activeSig && (activeSig.direction === 'CALL' || activeSig.direction === 'PUT') ? activeSig.direction : '',
    signalTimeframe: activeSig ? String(activeSig.timeframe || 'M1').slice(0, 16) : '',
    signalEntryMinute: activeSig ? String(activeSig.entryMinute || '').slice(0, 32) : '',
    signalEntryTime: activeSig ? String(activeSig.entryTime || '').slice(0, 32) : '',
    signalTargetEntryTimestamp: activeSig && Number.isFinite(Number(activeSig.targetEntryTimestamp)) ? Number(activeSig.targetEntryTimestamp) : Math.floor(nowMs / 1000) + 15,
    signalStatus: activeSig ? String(activeSig.status || 'PENDING').slice(0, 32) : '',
    signalLivePrice: activeSig ? String(activeSig.livePrice || '').slice(0, 64) : '',
    signalStrategyType: activeSig ? String(activeSig.strategyType || 'MOMENTUM_PAUSE_BREAKOUT').slice(0, 64) : '',
    signalSuccessRateText: activeSig ? String(activeSig.successRateText || '94%').slice(0, 32) : '',
    signalQualityScore: activeSig ? Math.min(100, Math.max(0, Number(activeSig.qualityScore) || 92)) : 0
  };

  try {
    await setDoc(doc(db, 'robot_public_feed', 'live'), feedDoc);
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'robot_public_feed/live');
    return false;
  }
}

export async function fetchRobotFeedFromFirestore(apiKey: string): Promise<any> {
  const cleanKey = String(apiKey || '').trim().toUpperCase();
  const isMasterPreview = cleanKey === 'QX-ADMIN-MASTER-TEST';
  let keyAuthorized = false;
  let keyLabel = '';
  let daysLeft = 0;
  let authError = '';

  try {
    if (isMasterPreview) {
      keyAuthorized = true;
      keyLabel = 'حساب المشرف التجريبي (Master)';
      daysLeft = 999;
    } else if (cleanKey && /^[A-Z0-9_\-]+$/.test(cleanKey)) {
      const keySnap = await getDoc(doc(db, 'robot_keys', cleanKey));
      if (keySnap.exists()) {
        const kd = keySnap.data();
        const expStr = String(kd.expiryDate || '');
        if (expStr && /^\d{4}-\d{2}-\d{2}$/.test(expStr)) {
          const diff = new Date(`${expStr}T23:59:59Z`).getTime() - Date.now();
          daysLeft = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
        } else {
          daysLeft = 365;
        }
        keyAuthorized = Boolean(kd.active) && daysLeft > 0;
        keyLabel = String(kd.label || 'عضو VIP');
        if (!keyAuthorized) authError = daysLeft <= 0 ? 'انتهت صلاحية الاشتراك' : 'المفتاح موقوف حالياً';
      } else {
        authError = 'مفتاح العضو غير موجود أو غير مفعل في السحابة';
      }
    } else {
      authError = 'يرجى إدخال مفتاح عضو صحيح';
    }

    const feedSnap = await getDoc(doc(db, 'robot_public_feed', 'live'));
    const fd = feedSnap.exists() ? feedSnap.data() : {};
    const hasSig = Boolean(fd.hasActiveSignal && fd.signalId && fd.signalAsset && (fd.signalDirection === 'CALL' || fd.signalDirection === 'PUT'));

    return {
      ok: true,
      source: 'firestore',
      authorized: keyAuthorized,
      memberName: keyLabel || undefined,
      daysLeft,
      error: authError || undefined,
      serverEpochMs: Date.now(),
      serverEpochSeconds: Math.floor(Date.now() / 1000),
      marketOpen: fd.marketOpen !== false,
      isMarketOpen: fd.marketOpen !== false,
      isTradingHours: fd.isTradingHours !== false,
      isLockedOutsideHours: Boolean(fd.isLockedOutsideHours),
      lockReason: fd.lockReason || '',
      workingHoursText: fd.workingHoursText || '09:00 ص - 09:00 م',
      nextSessionText: fd.nextSessionText || 'الجلسة نشطة',
      statsNoMartingale: {
        wins: Number(fd.wins) || 0,
        losses: Number(fd.losses) || 0,
        winRate: fd.winRate !== undefined ? Number(fd.winRate) : 100
      },
      activeSignal: keyAuthorized && hasSig ? {
        id: fd.signalId,
        asset: fd.signalAsset,
        direction: fd.signalDirection,
        timeframe: fd.signalTimeframe || 'M1',
        entryMinute: fd.signalEntryMinute || '',
        entryTime: fd.signalEntryTime || '',
        targetEntryTimestamp: fd.signalTargetEntryTimestamp,
        status: fd.signalStatus || 'PENDING',
        livePrice: fd.signalLivePrice || '',
        strategyType: fd.signalStrategyType || 'MOMENTUM_PAUSE_BREAKOUT',
        successRateText: fd.signalSuccessRateText || '94%',
        qualityScore: Number(fd.signalQualityScore) || 92
      } : null,
      allowedPairs: Array.isArray(fd.allowedPairs) ? fd.allowedPairs : ['EUR/USD', 'EUR/JPY', 'GBP/USD', 'AUD/USD', 'USD/CAD', 'GBP/JPY']
    };
  } catch (err: any) {
    return { ok: false, authorized: false, error: err?.message || 'تعذر القراءة من سحابة Firestore' };
  }
}

export async function syncAllAdminStateToFirestore(params: {
  subscribers?: any[];
  signals?: any[];
  plans?: any[];
  contactLinks?: any;
  paymentMethods?: any[];
  robotSettings?: any;
}): Promise<boolean> {
  if (!canWriteFirestoreAsAdmin()) return false;
  try {
    const tasks: Promise<any>[] = [];
    if (Array.isArray(params.plans) && params.plans.length > 0) {
      tasks.push(saveCloudPlans(params.plans));
    }
    if (params.contactLinks) {
      tasks.push(saveCloudContactLinks(params.contactLinks));
    }
    if (Array.isArray(params.paymentMethods) && params.paymentMethods.length > 0) {
      tasks.push(saveCloudPaymentMethods(params.paymentMethods));
    }
    if (params.robotSettings) {
      tasks.push(saveCloudRobotSettings(params.robotSettings));
    }
    if (Array.isArray(params.subscribers)) {
      for (const s of params.subscribers.slice(0, 60)) {
        tasks.push(saveSubscriberToFirestore(s));
      }
    }
    if (Array.isArray(params.signals)) {
      for (const sig of params.signals.slice(0, 25)) {
        tasks.push(saveSignalToFirestore(sig));
      }
      tasks.push(syncRobotPublicFeedToFirestore(params.signals));
    }
    await Promise.all(tasks);
    return true;
  } catch (_e) {
    return false;
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
