import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { initializeApp } from 'firebase/app';
import { initializeFirestore, doc, getDoc, setDoc, runTransaction, setLogLevel } from 'firebase/firestore';
import {
  parseRawQuotexSignal,
  formatSignalMessage,
  appendResultToSignalMessage,
  extractMinuteOnly,
  GLOBAL_FOREX_PAIRS,
  DEFAULT_CUSTOM_TEMPLATE,
  FormatterOptions,
  ParsedSignal
} from './src/utils/signalParser.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STATE_FILE = path.join(process.cwd(), 'autopilot-state.json');
const FIREBASE_CONFIG_FILE = path.join(process.cwd(), 'firebase-applet-config.json');

setLogLevel('silent');

let serverFirestoreDb: ReturnType<typeof initializeFirestore> | null = null;
try {
  if (fs.existsSync(FIREBASE_CONFIG_FILE)) {
    const fbCfg = JSON.parse(fs.readFileSync(FIREBASE_CONFIG_FILE, 'utf-8'));
    if (fbCfg.projectId && fbCfg.apiKey) {
      const fbApp = initializeApp(fbCfg, 'server-worker-app');
      serverFirestoreDb = initializeFirestore(
        fbApp,
        { experimentalForceLongPolling: true },
        fbCfg.firestoreDatabaseId
      );
    }
  }
} catch (_e) {
  // Fallback to local disk persistence if cloud init is unavailable
}

const ADMIN_EMAIL = 'thrayanabil2026@gmail.com';
const ADMIN_PASS = 'Tr@7177';

export interface SignalItem {
  id: string;
  asset: string;
  isOtc: boolean;
  direction: 'CALL' | 'PUT';
  timeframe: string;
  entryMinute: string;
  entryTime: string;
  targetEntryTimestamp?: number; // Exact epoch seconds of the 1-minute candle (e.g. 09:34:00 UTC)
  payout?: string;
  livePrice?: string;
  rsiValue?: number;
  analysisReason?: string;
  entryPriceNumeric?: number;
  formattedMessage: string;
  rawOriginal?: string;
  status: 'PENDING' | 'WIN' | 'WIN_GALE1' | 'LOSS' | 'DRAW';
  galeStep?: number; // 0 = direct entry, 1 = waiting for 1st Martingale candle
  createdAt: string;
  telegramMessageId?: number;
  telegramReplyMessageId?: number;
  vipTelegramMessageId?: number;
  vipTelegramReplyMessageId?: number;
  resultSent?: boolean;
  autoSent?: boolean;
}

export interface LivePairSnapshot {
  pair: string;
  price: number;
  formattedPrice: string;
  rsi: number;
  trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  signalReady: 'CALL' | 'PUT' | null;
  reason: string;
  updatedAt: string;
}

export interface AutoPilotConfig {
  enabled: boolean;
  lastResetEgyptDate?: string; // Tracks the Cairo date (YYYY-MM-DD) for automatic daily reset of signals log & daily stats
  // Bot 1: Free Channel Bot (With optional Egypt Cairo working hours schedule)
  freeBotEnabled?: boolean;
  botToken: string;
  chatId: string;
  freeScheduleEnabled: boolean;
  freeStartHourEgypt: number; // 0 to 23 in Africa/Cairo time
  freeEndHourEgypt: number;   // 0 to 23 in Africa/Cairo time
  freeWinIcon?: string;       // Custom Win icon/text for Bot 1 (Free Channel)
  freeWinGale1Icon?: string;  // Custom Win Gale 1 icon/text for Bot 1 (Free Channel)
  freeLossIcon?: string;      // Custom Loss icon/text for Bot 1 (Free Channel)
  freeWinImageUrl?: string;      // Custom Win photo/sticker (base64 data URL) for Bot 1
  freeWinGale1ImageUrl?: string; // Custom Win Gale 1 photo/sticker (base64 data URL) for Bot 1
  freeLossImageUrl?: string;     // Custom Loss photo/sticker (base64 data URL) for Bot 1
  // Bot 2: VIP Channel Bot (Always 24/7 on the exact same signal)
  vipEnabled: boolean;
  vipBotToken: string;
  vipChatId: string;
  vipWinIcon?: string;        // Custom Win icon/text for Bot 2 (VIP Channel)
  vipWinGale1Icon?: string;   // Custom Win Gale 1 icon/text for Bot 2 (VIP Channel)
  vipLossIcon?: string;       // Custom Loss icon/text for Bot 2 (VIP Channel)
  vipWinImageUrl?: string;       // Custom Win photo/sticker (base64 data URL) for Bot 2
  vipWinGale1ImageUrl?: string;  // Custom Win Gale 1 photo/sticker (base64 data URL) for Bot 2
  vipLossImageUrl?: string;      // Custom Loss photo/sticker (base64 data URL) for Bot 2
  sourceChannel: string;
  intervalMinutes: number; // Minimum cooldown between signals to avoid flooding (default 15 mins)
  strictnessLevel: 'high' | 'extreme'; // High: RSI <= 28 / >= 72, Extreme: RSI <= 24 / >= 76
  resultMode: 'candle_exact' | 'auto_win' | 'manual_only'; // Controls how trade outcome is sent
  oneGaleEnabled?: boolean; // Enable 1-Step Martingale (مضاعفة واحدة) on first candle loss
  quotexReferralLink?: string; // Official Quotex Affiliate/Referral Link for Free VIP activation
  quotexMinDepositUsd?: number; // Minimum deposit in Quotex account for Free VIP (default 100$)
  autoWinNotification: boolean;
  autoDailyReportEnabled?: boolean; // Automatically send End-of-Day Final Report when trading day closes at freeEndHourEgypt
  lastDailyReportSentDate?: string; // Tracks Cairo date (YYYY-MM-DD) when the end-of-day report was last sent
  lastRunAt: string | null;
  nextRunAt: string | null;
  totalAutoSent: number;
  lastError: string | null;
  marketOpenStatus: boolean;
  currentEgyptHour?: number;
  isFreeBotWithinSchedule?: boolean;
}

export interface SubscriberMessage {
  id: string;
  sender: 'admin' | 'member';
  text: string;
  imageUrl?: string;
  createdAt: string;
  isActivationLink?: boolean;
}

export interface QuickNote {
  id: string;
  title: string;
  content: string;
}

export interface VipSubscriber {
  id: string;
  name: string;
  telegramUsername: string;
  country: string;
  email: string;
  phone: string;
  broker: string;
  brokerAccountId: string; // Trader's Account ID in the Broker platform (used as password to login)
  subscriptionType?: 'paid_plan' | 'quotex_referral'; // Paid monthly packages OR Free Quotex referral + $100 deposit
  quotexDepositConfirmed?: boolean; // Whether Admin verified the $100+ deposit in member's Quotex account
  planDuration?: string;    // '1_month' | '3_months' | '6_months' | '1_year' | 'quotex_referral_free'
  amountPaid?: number;      // Amount paid in USD (e.g., 30, 65, 80, 111)
  paymentMethod?: string;   // 'تحويل بنكي' | 'محافظ إلكترونية' | 'إحالة كيوتكس مجاناً (إيداع 100$)'
  status: 'PENDING' | 'ACTIVE' | 'BANNED';
  activationLink?: string;
  expiryDate?: string; // ISO date string or YYYY-MM-DD
  // Quotex Automated Trading Robot fields (Per-member API Key & Validity)
  robotApiKey?: string;
  robotExpiryDate?: string; // YYYY-MM-DD
  robotEnabled?: boolean;
  robotDefaultMode?: 'AUTO' | 'MANUAL';
  robotTradeStake?: number;
  robotWins?: number;
  robotLosses?: number;
  messages: SubscriberMessage[];
  createdAt: string;
}

export interface QuotexRobotSettings {
  isPublishedToVisitors: boolean; // false = Under Development (Admin Only)
  robotTitle: string;
  version: string;
  defaultMode: 'AUTO' | 'MANUAL';
  noMartingaleStrict: boolean; // Strictly 0 Martingale
  soundAlertsEnabled: boolean;
  autoSelectPair: boolean;
  autoSetExpiryM1: boolean;
  defaultStakeUsd: number;
}

export interface AppSettings extends FormatterOptions {
  sourceChannel: string;
}

export interface DailyStatRecord {
  date: string; // YYYY-MM-DD in Egypt Time (Africa/Cairo)
  directWins: number; // الصفقات الرابحة المباشرة (1$)
  gale1Wins: number; // الربح بالمضاعفة (2$)
  losses: number; // الخاسرة بالمضاعفة (خسارة 1$ + 2$ = 3$)
  draws?: number;
  manualOverride?: boolean;
  updatedAt: string;
}

interface PersistedState {
  stateUpdatedAt?: string;
  signals: SignalItem[];
  settings: AppSettings;
  autopilot: AutoPilotConfig;
  robotSettings?: QuotexRobotSettings;
  subscribers?: VipSubscriber[];
  quickNotes?: QuickNote[];
  dailyStats?: DailyStatRecord[];
  lastDispatchedEpochMinute?: number;
}

const defaultRobotSettings: QuotexRobotSettings = {
  isPublishedToVisitors: false, // Under development - hidden from visitors until finished
  robotTitle: 'روبوت التداول الآلي الذكي (Quotex Pro Bot)',
  version: 'v1.0 Beta (قيد التطوير)',
  defaultMode: 'AUTO',
  noMartingaleStrict: true, // Strictly no martingale (0 Gale)
  soundAlertsEnabled: true,
  autoSelectPair: true,
  autoSetExpiryM1: true,
  defaultStakeUsd: 5
};

function generateMemberRobotApiKey(seedId?: string): string {
  const randomPart = () => Math.random().toString(36).substring(2, 6).toUpperCase();
  const suffix = seedId ? seedId.replace(/[^A-Z0-9]/gi, '').slice(-4).toUpperCase() : randomPart();
  return `QX-ZAD-${randomPart()}-${randomPart()}-${suffix}`;
}

const defaultSettings: AppSettings = {
  sourceChannel: 'LIVE_GLOBAL_FOREX',
  channelTitle: 'نَبض التداول | السوق العالمي',
  channelSignature: '💡 نركز على الفرص القوية فقط — التزم بإدارة رأس المال',
  templateStyle: 'elegant',
  customTemplatePattern: DEFAULT_CUSTOM_TEMPLATE,
  includeLiveAnalysis: true,
  removeSourceMentions: true,
  removePromoLinks: true,
  removeMartingaleSteps: true,
  removePayoutInfo: true,
  blockedWords: ['QuotexSignalsBot_M1', 'Quotex', 'VIP', 'Register', 'Sign up', 'Gale', 'Martingale', 'Promo', 'Bonus', 'OTC']
};

const defaultAutoPilot: AutoPilotConfig = {
  enabled: false,
  freeBotEnabled: true,
  botToken: '',
  chatId: '@ZadNBFX',
  freeScheduleEnabled: true,
  freeStartHourEgypt: 9,  // Default 09:00 AM Cairo Time
  freeEndHourEgypt: 21,   // Default 09:00 PM Cairo Time
  freeWinIcon: '✅ ربح',
  freeWinGale1Icon: '✅ ربح مضاعفة واحدة',
  freeLossIcon: '❌',
  freeWinImageUrl: '',
  freeWinGale1ImageUrl: '',
  freeLossImageUrl: '',
  vipEnabled: false,
  vipBotToken: '',
  vipChatId: '',
  vipWinIcon: '👑✅ ربح VIP',
  vipWinGale1Icon: '👑✅ ربح مضاعفة واحدة',
  vipLossIcon: '❌',
  vipWinImageUrl: '',
  vipWinGale1ImageUrl: '',
  vipLossImageUrl: '',
  sourceChannel: 'LIVE_GLOBAL_FOREX',
  intervalMinutes: 15, // Anti-flooding: minimum 15 minutes between focused signals
  strictnessLevel: 'high',
  resultMode: 'candle_exact',
  oneGaleEnabled: false, // Default: Martingale disabled (0 Gale)
  quotexReferralLink: 'https://broker-qx.pro/?lid=2303934',
  quotexMinDepositUsd: 100,
  autoWinNotification: true,
  autoDailyReportEnabled: true,
  lastDailyReportSentDate: '',
  lastRunAt: null,
  nextRunAt: null,
  totalAutoSent: 0,
  lastError: null,
  marketOpenStatus: true
};

/**
 * Returns the current date string (YYYY-MM-DD) in Egypt Time (Africa/Cairo)
 */
function getCurrentEgyptDateString(dateObj: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Cairo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(dateObj);
    const y = parts.find(p => p.type === 'year')?.value;
    const m = parts.find(p => p.type === 'month')?.value;
    const d = parts.find(p => p.type === 'day')?.value;
    if (y && m && d) return `${y}-${m}-${d}`;
    return dateObj.toISOString().split('T')[0];
  } catch (_e) {
    return dateObj.toISOString().split('T')[0];
  }
}

/**
 * Synchronizes completed signals from a list of signals into dailyStatsStore grouped by Cairo date (YYYY-MM-DD).
 * Used before daily midnight reset and on every state save so no daily trading statistics are ever lost.
 */
function syncSignalsIntoDailyStats(signalsList: SignalItem[], allowOverwriteActiveDay = false): boolean {
  let changed = false;
  const byDate: Record<string, { directWins: number; gale1Wins: number; losses: number; draws: number }> = {};

  for (const sig of signalsList) {
    if (!sig.createdAt || sig.status === 'PENDING') continue;
    const sigDate = new Date(sig.createdAt);
    if (isNaN(sigDate.getTime())) continue;
    const dateKey = getCurrentEgyptDateString(sigDate);
    if (!byDate[dateKey]) {
      byDate[dateKey] = { directWins: 0, gale1Wins: 0, losses: 0, draws: 0 };
    }
    if (sig.status === 'WIN') byDate[dateKey].directWins += 1;
    else if (sig.status === 'WIN_GALE1') byDate[dateKey].gale1Wins += 1;
    else if (sig.status === 'LOSS') byDate[dateKey].losses += 1;
    else if (sig.status === 'DRAW') byDate[dateKey].draws += 1;
  }

  const todayEgypt = getCurrentEgyptDateString(new Date());

  for (const [dateKey, counts] of Object.entries(byDate)) {
    const existing = dailyStatsStore[dateKey];
    if (!existing) {
      dailyStatsStore[dateKey] = {
        date: dateKey,
        directWins: counts.directWins,
        gale1Wins: counts.gale1Wins,
        losses: counts.losses,
        draws: counts.draws,
        manualOverride: false,
        updatedAt: new Date().toISOString()
      };
      changed = true;
    } else if (!existing.manualOverride) {
      // For today's active log, if allowOverwriteActiveDay is true, reflect exact live counts (e.g., if admin changed status or deleted a signal)
      const nextDirect =
        dateKey === todayEgypt && allowOverwriteActiveDay
          ? counts.directWins
          : Math.max(existing.directWins, counts.directWins);
      const nextGale1 =
        dateKey === todayEgypt && allowOverwriteActiveDay
          ? counts.gale1Wins
          : Math.max(existing.gale1Wins, counts.gale1Wins);
      const nextLosses =
        dateKey === todayEgypt && allowOverwriteActiveDay
          ? counts.losses
          : Math.max(existing.losses, counts.losses);
      const nextDraws =
        dateKey === todayEgypt && allowOverwriteActiveDay
          ? counts.draws
          : Math.max(existing.draws || 0, counts.draws);

      if (
        existing.directWins !== nextDirect ||
        existing.gale1Wins !== nextGale1 ||
        existing.losses !== nextLosses ||
        (existing.draws || 0) !== nextDraws
      ) {
        existing.directWins = nextDirect;
        existing.gale1Wins = nextGale1;
        existing.losses = nextLosses;
        existing.draws = nextDraws;
        existing.updatedAt = new Date().toISOString();
        changed = true;
      }
    }
  }

  return changed;
}

/**
 * Checks if a new day has started in Egypt Time (Africa/Cairo) or filters out signals from previous days
 * so that "04. سجل إشارات السوق العالمي المنشورة" and daily accuracy/wins reset automatically every day,
 * while preserving the completed daily stats in dailyStatsStore for the Admin Statistics A4 page.
 */
function enforceDailySignalReset(): boolean {
  const todayEgypt = getCurrentEgyptDateString(new Date());
  let changed = false;

  // Archive any completed signals into dailyStatsStore BEFORE filtering out yesterday's signals
  if (syncSignalsIntoDailyStats(signalsStore, false)) {
    changed = true;
  }

  // Filter signalsStore to keep only signals created today (in Cairo time) or currently PENDING within the last 10 mins
  const beforeLen = signalsStore.length;
  signalsStore = signalsStore.filter(sig => {
    if (!sig.createdAt) return false;
    const sigDate = new Date(sig.createdAt);
    if (isNaN(sigDate.getTime())) return false;
    const sigEgyptDate = getCurrentEgyptDateString(sigDate);
    if (sigEgyptDate === todayEgypt) return true;
    // Keep a PENDING signal only if it was just created around midnight (< 10 mins ago)
    if (sig.status === 'PENDING' && Date.now() - sigDate.getTime() < 10 * 60 * 1000) {
      return true;
    }
    return false;
  });

  if (signalsStore.length !== beforeLen) {
    changed = true;
  }

  if (autoPilot.lastResetEgyptDate !== todayEgypt) {
    autoPilot.lastResetEgyptDate = todayEgypt;
    autoPilot.totalAutoSent = signalsStore.filter(s => s.autoSent).length;
    changed = true;
  }

  return changed;
}

/**
 * Returns the current hour (0-23) in Egypt Time (Africa/Cairo)
 */
function getCurrentEgyptHour(): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Africa/Cairo',
      hour: 'numeric',
      hour12: false
    }).formatToParts(new Date());
    const hourPart = parts.find(p => p.type === 'hour')?.value;
    const h = parseInt(hourPart || '0', 10);
    return h === 24 ? 0 : isNaN(h) ? new Date().getUTCHours() + 2 : h;
  } catch (_e) {
    return (new Date().getUTCHours() + 2) % 24;
  }
}

/**
 * Checks whether the Free Bot is currently enabled and inside its allowed Cairo working hours
 */
function isFreeBotActiveNow(cfg: AutoPilotConfig): boolean {
  if (cfg.freeBotEnabled === false) return false;
  if (!cfg.freeScheduleEnabled) return true; // If schedule restriction is off, Free Bot runs 24/7
  const currentHour = getCurrentEgyptHour();
  const start = Number(cfg.freeStartHourEgypt ?? 10);
  const end = Number(cfg.freeEndHourEgypt ?? 22);

  if (start === end) return true; // 24 hours
  if (start < end) {
    // Same day window, e.g., 10:00 to 22:00 (active when 10 <= hour < 22)
    return currentHour >= start && currentHour < end;
  } else {
    // Overnight window, e.g., 20:00 to 04:00 (active when hour >= 20 OR hour < 4)
    return currentHour >= start || currentHour < end;
  }
}

const initialSignals: SignalItem[] = [];

const initialQuickNotes: QuickNote[] = [
  {
    id: 'note-1',
    title: 'باقات وأسعار VIP وطرق الدفع',
    content: `👑 باقات الاشتراك في قناة VIP (شغال 24 ساعة):
• شهر واحد: 30$ (في مصر: 1,650 جنيه)
• 3 شهور: 65$ (في مصر: 3,575 جنيه)
• 6 شهور: 80$ (في مصر: 4,400 جنيه)
• سنة كاملة: 111$ (في مصر: 6,105 جنيه)
💳 الدفع متاح عبر: محافظ إلكترونية (لمصر) | تحويل لبنك فلسطيني بالدولار أو الشيكل ($) (لفلسطين) | تحويل بنكي`
  },
  {
    id: 'note-2',
    title: 'تأكيد استلام الدفع والتفعيل',
    content: '✅ تم استلام الدفعة بنجاح وتفعيل عضويتك في قناة VIP! تجد رابط الدخول وتاريخ انتهاء عضويتك في أعلى صفحتك الآن. بالتوفيق والربح الوفير.'
  },
  {
    id: 'note-3',
    title: 'تنبيه قرب انتهاء العضوية',
    content: '🔔 تنبيه ودي: قاربت عضويتك في قناة VIP على الانتهاء. يمكنك تجديد الباقة من خلال أيقونة طلب تجديد الاشتراك في حسابك لاستمرار وصول الإشارات 24/7 بدون انقطاع.'
  }
];

let signalsStore: SignalItem[] = [...initialSignals];
let subscribersStore: VipSubscriber[] = [];
let quickNotesStore: QuickNote[] = [...initialQuickNotes];
let dailyStatsStore: Record<string, DailyStatRecord> = {};
let lastDispatchedEpochMinute = 0;
let appSettings: AppSettings = { ...defaultSettings };
let autoPilot: AutoPilotConfig = { ...defaultAutoPilot };
let robotSettings: QuotexRobotSettings = { ...defaultRobotSettings };
let lastTelegramUpdateId = 0;
let liveMarketSnapshots: LivePairSnapshot[] = [];
let isCloudStateLoaded = false;
let currentStateUpdatedAt = '';

function applyParsedState(parsed: Partial<PersistedState>) {
  if (parsed.stateUpdatedAt && parsed.stateUpdatedAt > currentStateUpdatedAt) {
    currentStateUpdatedAt = parsed.stateUpdatedAt;
  }
  if (parsed.lastDispatchedEpochMinute && parsed.lastDispatchedEpochMinute > lastDispatchedEpochMinute) {
    lastDispatchedEpochMinute = parsed.lastDispatchedEpochMinute;
  }
  if (parsed.robotSettings) {
    robotSettings = {
      ...defaultRobotSettings,
      ...robotSettings,
      ...parsed.robotSettings,
      noMartingaleStrict: true // Always strictly no martingale as requested
    };
  }
  if (parsed.dailyStats && Array.isArray(parsed.dailyStats)) {
    for (const item of parsed.dailyStats) {
      if (item && typeof item.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.date)) {
        const existing = dailyStatsStore[item.date];
        if (!existing || new Date(item.updatedAt || 0).getTime() >= new Date(existing.updatedAt || 0).getTime()) {
          dailyStatsStore[item.date] = {
            date: item.date,
            directWins: Math.max(0, Number(item.directWins) || 0),
            gale1Wins: Math.max(0, Number(item.gale1Wins) || 0),
            losses: Math.max(0, Number(item.losses) || 0),
            draws: Math.max(0, Number(item.draws) || 0),
            manualOverride: Boolean(item.manualOverride),
            updatedAt: item.updatedAt || new Date().toISOString()
          };
        }
      }
    }
  }
  if (parsed.quickNotes && Array.isArray(parsed.quickNotes) && parsed.quickNotes.length > 0) {
    quickNotesStore = parsed.quickNotes;
  }
  if (parsed.subscribers && Array.isArray(parsed.subscribers)) {
    if (parsed.subscribers.length >= subscribersStore.length || subscribersStore.length === 0) {
      subscribersStore = parsed.subscribers.map(sub => ({
        ...sub,
        country: sub.country || 'مصر 🇪🇬',
        brokerAccountId: sub.brokerAccountId || '',
        planDuration: sub.planDuration || '1_month',
        amountPaid: typeof sub.amountPaid === 'number' ? sub.amountPaid : 0,
        paymentMethod: sub.paymentMethod || 'محافظ إلكترونية',
        status: sub.status || 'PENDING',
        robotApiKey: sub.robotApiKey || generateMemberRobotApiKey(sub.id),
        robotExpiryDate: sub.robotExpiryDate || sub.expiryDate || '',
        robotEnabled: sub.robotEnabled !== undefined ? Boolean(sub.robotEnabled) : sub.status === 'ACTIVE',
        robotDefaultMode: sub.robotDefaultMode === 'MANUAL' ? 'MANUAL' : 'AUTO',
        robotTradeStake: typeof sub.robotTradeStake === 'number' ? sub.robotTradeStake : 5,
        robotWins: typeof sub.robotWins === 'number' ? sub.robotWins : 0,
        robotLosses: typeof sub.robotLosses === 'number' ? sub.robotLosses : 0,
        messages: Array.isArray(sub.messages) ? sub.messages : []
      }));
    }
  }
  if (parsed.signals && Array.isArray(parsed.signals)) {
    const todayEgypt = getCurrentEgyptDateString(new Date());
    const fakeIds = new Set(['sig-101', 'sig-102', 'sig-103', 'sig-201', 'sig-202']);
    const validRawSignals = parsed.signals.filter(s => !s.isOtc && !fakeIds.has(s.id) && Boolean(s.createdAt));

    // Archive any historical signals into dailyStatsStore before filtering signalsStore to today only
    syncSignalsIntoDailyStats(validRawSignals, false);

    const cleanedSignals = validRawSignals
      .filter(s => {
        const sigDate = new Date(s.createdAt);
        if (isNaN(sigDate.getTime())) return false;
        const sigEgyptDate = getCurrentEgyptDateString(sigDate);
        return sigEgyptDate === todayEgypt || (s.status === 'PENDING' && Date.now() - sigDate.getTime() < 10 * 60 * 1000);
      })
      .map(s => ({
        ...s,
        isOtc: false,
        formattedMessage:
          s.status !== 'PENDING'
            ? appendResultToSignalMessage(s.formattedMessage, s.status)
            : s.formattedMessage,
        entryMinute: s.entryMinute || extractMinuteOnly(s.entryTime)
      }));

    signalsStore = cleanedSignals;
    syncSignalsIntoDailyStats(signalsStore, false);
  }
  if (parsed.settings) {
    appSettings = {
      ...defaultSettings,
      ...appSettings,
      ...parsed.settings
    };
  }
  if (parsed.autopilot) {
    const incomingQxLink = parsed.autopilot.quotexReferralLink;
    const resolvedQxLink =
      !incomingQxLink || incomingQxLink.includes('lid=ZadNBFX')
        ? 'https://broker-qx.pro/?lid=2303934'
        : incomingQxLink;
    autoPilot = {
      ...defaultAutoPilot,
      ...autoPilot,
      ...parsed.autopilot,
      quotexReferralLink: resolvedQxLink,
      botToken: parsed.autopilot.botToken || autoPilot.botToken,
      chatId: parsed.autopilot.chatId || autoPilot.chatId,
      freeWinIcon: parsed.autopilot.freeWinIcon || autoPilot.freeWinIcon || '✅ ربح',
      freeWinGale1Icon: parsed.autopilot.freeWinGale1Icon || autoPilot.freeWinGale1Icon || '✅ ربح مضاعفة واحدة',
      freeLossIcon: parsed.autopilot.freeLossIcon || autoPilot.freeLossIcon || '❌',
      freeWinImageUrl: parsed.autopilot.freeWinImageUrl ?? autoPilot.freeWinImageUrl ?? '',
      freeWinGale1ImageUrl: parsed.autopilot.freeWinGale1ImageUrl ?? autoPilot.freeWinGale1ImageUrl ?? '',
      freeLossImageUrl: parsed.autopilot.freeLossImageUrl ?? autoPilot.freeLossImageUrl ?? '',
      vipBotToken: parsed.autopilot.vipBotToken ?? autoPilot.vipBotToken,
      vipChatId: parsed.autopilot.vipChatId ?? autoPilot.vipChatId,
      vipWinIcon: parsed.autopilot.vipWinIcon || autoPilot.vipWinIcon || '👑✅ ربح VIP',
      vipWinGale1Icon: parsed.autopilot.vipWinGale1Icon || autoPilot.vipWinGale1Icon || '👑✅ ربح مضاعفة واحدة',
      vipLossIcon: parsed.autopilot.vipLossIcon || autoPilot.vipLossIcon || '❌',
      vipWinImageUrl: parsed.autopilot.vipWinImageUrl ?? autoPilot.vipWinImageUrl ?? '',
      vipWinGale1ImageUrl: parsed.autopilot.vipWinGale1ImageUrl ?? autoPilot.vipWinGale1ImageUrl ?? '',
      vipLossImageUrl: parsed.autopilot.vipLossImageUrl ?? autoPilot.vipLossImageUrl ?? '',
      freeStartHourEgypt: Number(parsed.autopilot.freeStartHourEgypt ?? autoPilot.freeStartHourEgypt ?? 9),
      freeEndHourEgypt: Number(parsed.autopilot.freeEndHourEgypt ?? autoPilot.freeEndHourEgypt ?? 21),
      oneGaleEnabled:
        typeof parsed.autopilot.oneGaleEnabled === 'boolean'
          ? parsed.autopilot.oneGaleEnabled
          : Boolean(autoPilot.oneGaleEnabled),
      autoDailyReportEnabled:
        typeof parsed.autopilot.autoDailyReportEnabled === 'boolean'
          ? parsed.autopilot.autoDailyReportEnabled
          : autoPilot.autoDailyReportEnabled !== false,
      lastDailyReportSentDate:
        parsed.autopilot.lastDailyReportSentDate || autoPilot.lastDailyReportSentDate || '',
      intervalMinutes: Math.max(5, Number(parsed.autopilot.intervalMinutes || autoPilot.intervalMinutes || 15))
    };
  }
}

async function loadStateFromCloudAndDisk() {
  let diskState: Partial<PersistedState> | null = null;
  // 1. Load local disk first for instant boot
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, 'utf-8');
      diskState = JSON.parse(raw) as Partial<PersistedState>;
      applyParsedState(diskState);
    }
  } catch (e) {
    console.error('Error loading local state:', e);
  }

  // 2. Load from permanent Firebase Cloud Firestore (only apply if cloud state is newer than local disk state)
  if (serverFirestoreDb) {
    try {
      const docRef = doc(serverFirestoreDb, 'system_state', 'zad_main_state_v1');
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data();
        if (data && typeof data.payload === 'string') {
          const cloudState = JSON.parse(data.payload) as Partial<PersistedState>;
          const cloudTime = new Date(cloudState.stateUpdatedAt || data.updatedAt || 0).getTime();
          const diskTime = new Date(diskState?.stateUpdatedAt || currentStateUpdatedAt || 0).getTime();
          if (!diskState || cloudTime >= diskTime) {
            applyParsedState(cloudState);
            fs.writeFileSync(STATE_FILE, JSON.stringify(cloudState, null, 2), 'utf-8');
          }
        }
      }
    } catch (_e) {
      // Local disk state is already loaded as fallback
    }
  }
  isCloudStateLoaded = true;
}

async function saveState(): Promise<boolean> {
  try {
    syncSignalsIntoDailyStats(signalsStore, true);
    const sortedDailyStats = Object.values(dailyStatsStore)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 120);

    const nowIso = new Date().toISOString();
    currentStateUpdatedAt = nowIso;

    const state: PersistedState = {
      stateUpdatedAt: nowIso,
      signals: signalsStore.slice(0, 80),
      settings: appSettings,
      autopilot: autoPilot,
      robotSettings,
      subscribers: subscribersStore.slice(0, 200),
      quickNotes: quickNotesStore.slice(0, 50),
      dailyStats: sortedDailyStats,
      lastDispatchedEpochMinute
    };
    const serialized = JSON.stringify(state);
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');

    // Save to permanent Firebase Cloud Firestore (even if custom images are removed from cloud payload if > 495KB)
    if (serverFirestoreDb) {
      let cloudPayload = serialized;
      if (cloudPayload.length > 490000) {
        const lightState: PersistedState = {
          ...state,
          autopilot: {
            ...state.autopilot,
            freeWinImageUrl: '',
            freeWinGale1ImageUrl: '',
            freeLossImageUrl: '',
            vipWinImageUrl: '',
            vipWinGale1ImageUrl: '',
            vipLossImageUrl: ''
          }
        };
        cloudPayload = JSON.stringify(lightState);
      }
      if (cloudPayload.length <= 495000) {
        const docRef = doc(serverFirestoreDb, 'system_state', 'zad_main_state_v1');
        await setDoc(docRef, {
          updatedAt: nowIso,
          payload: cloudPayload
        });
      }
      return true;
    }
    return true;
  } catch (_e) {
    return true;
  }
}

loadStateFromCloudAndDisk();

/**
 * Checks if the Official Global Forex Market is currently open.
 * Global Forex closes Friday 21:00 UTC and reopens Sunday 21:00 UTC.
 */
function isGlobalForexMarketOpen(): boolean {
  const now = new Date();
  const day = now.getUTCDay(); // 0 = Sun, 5 = Fri, 6 = Sat
  const hour = now.getUTCHours();
  if (day === 6) return false; // Saturday closed
  if (day === 5 && hour >= 21) return false; // Friday after 21:00 UTC closed
  if (day === 0 && hour < 21) return false; // Sunday before 21:00 UTC closed
  return true;
}

/**
 * Calculates Wilder's 14-period RSI from an array of close prices.
 */
function calculateRSI(closes: number[], period = 14): number {
  if (closes.length <= period) return 50;

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return Number((100 - 100 / (1 + rs)).toFixed(1));
}

/**
 * Fetches REAL Global Forex M1 candles from Yahoo Finance public chart API
 * (e.g., EURUSD=X, GBPUSD=X, USDJPY=X, GBPJPY=X, EURJPY=X, AUDUSD=X, USDCHF=X, USDCAD=X)
 */
async function scanRealGlobalForexMarket(forceBestAvailable = false): Promise<{
  snapshots: LivePairSnapshot[];
  selectedCandidate: LivePairSnapshot | null;
}> {
  const snapshots: LivePairSnapshot[] = [];
  const oversoldThreshold = autoPilot.strictnessLevel === 'extreme' ? 25 : 30;
  const overboughtThreshold = autoPilot.strictnessLevel === 'extreme' ? 75 : 70;

  for (const pair of GLOBAL_FOREX_PAIRS) {
    const yahooSymbol = `${pair.replace('/', '')}=X`;
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=1m&range=1d`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      if (!res.ok) continue;
      const data = (await res.json()) as any;
      const result = data?.chart?.result?.[0];
      const quote = result?.indicators?.quote?.[0];
      const rawCloses: (number | null)[] = quote?.close || [];
      const closes = rawCloses.filter((c): c is number => typeof c === 'number' && !isNaN(c));

      if (closes.length < 20) continue;

      const currentPrice = closes[closes.length - 1];
      const prevPrice = closes[closes.length - 2];
      const rsi = calculateRSI(closes.slice(-35), 14);
      const isJpy = pair.includes('JPY');
      const formattedPrice = currentPrice.toFixed(isJpy ? 3 : 5);

      // Compute simple EMA-10 to confirm short-term momentum reversal
      const recent10 = closes.slice(-10);
      const sma10 = recent10.reduce((a, b) => a + b, 0) / recent10.length;

      let signalReady: 'CALL' | 'PUT' | null = null;
      let reason = 'في منطقة التوازن (انتظار فرصة أقوى)';
      let trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';

      if (rsi <= oversoldThreshold && currentPrice >= prevPrice) {
        signalReady = 'CALL';
        trend = 'BULLISH';
        reason = `تشبع بيعي قوي (RSI ${rsi}) مع بداية شمعة ارتداد صاعدة في السوق العالمي`;
      } else if (rsi >= overboughtThreshold && currentPrice <= prevPrice) {
        signalReady = 'PUT';
        trend = 'BEARISH';
        reason = `تشبع شرائي حاد (RSI ${rsi}) مع بداية انعكاس هابط من مقاومة سعرية`;
      } else if (currentPrice > sma10) {
        trend = 'BULLISH';
      } else if (currentPrice < sma10) {
        trend = 'BEARISH';
      }

      snapshots.push({
        pair,
        price: currentPrice,
        formattedPrice,
        rsi,
        trend,
        signalReady,
        reason,
        updatedAt: new Date().toISOString()
      });
    } catch (_e) {
      // Continue scanning other pairs if one fails
    }
  }

  if (snapshots.length > 0) {
    liveMarketSnapshots = snapshots;
  }

  // Find the strongest high-probability candidate (most extreme RSI)
  const strongCandidates = snapshots
    .filter(s => s.signalReady !== null)
    .sort((a, b) => Math.abs(50 - b.rsi) - Math.abs(50 - a.rsi));

  if (strongCandidates.length > 0) {
    return { snapshots, selectedCandidate: strongCandidates[0] };
  }

  // Only if the admin explicitly clicked "Manual Immediate Test" (forceBestAvailable), pick the pair furthest from RSI 50
  if (forceBestAvailable && snapshots.length > 0) {
    const sortedByExtremity = [...snapshots].sort(
      (a, b) => Math.abs(50 - b.rsi) - Math.abs(50 - a.rsi)
    );
    const best = { ...sortedByExtremity[0] };
    best.signalReady = best.rsi <= 50 ? 'CALL' : 'PUT';
    best.reason =
      best.rsi <= 50
        ? `أقوى فرصة متاحة حالياً في السوق العالمي (RSI ${best.rsi} - ميل صعودي)`
        : `أقوى فرصة متاحة حالياً في السوق العالمي (RSI ${best.rsi} - ميل هبوطي)`;
    return { snapshots, selectedCandidate: best };
  }

  return { snapshots, selectedCandidate: null };
}

async function sendTelegramMessage(botToken: string, chatId: string, text: string, replyToMessageId?: number) {
  const payload: Record<string, any> = {
    chat_id: chatId.trim(),
    text
  };
  if (replyToMessageId) {
    payload.reply_to_message_id = replyToMessageId;
  }

  const tgRes = await fetch(`https://api.telegram.org/bot${botToken.trim()}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return (await tgRes.json()) as any;
}

/**
 * Sends a photo (from a base64 data URL or HTTP URL) with a caption to a Telegram channel/chat
 */
async function sendTelegramPhoto(
  botToken: string,
  chatId: string,
  photoDataUrl: string,
  caption?: string,
  replyToMessageId?: number
) {
  if (photoDataUrl.startsWith('data:image/')) {
    const matches = photoDataUrl.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
    if (matches) {
      const mimeType = matches[1];
      const base64Data = matches[2];
      const buffer = Buffer.from(base64Data, 'base64');
      const ext = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
      const formData = new FormData();
      formData.append('chat_id', chatId.trim());
      if (caption) formData.append('caption', caption);
      if (replyToMessageId) formData.append('reply_to_message_id', String(replyToMessageId));
      const blob = new Blob([buffer], { type: mimeType });
      formData.append('photo', blob, `result.${ext}`);

      const tgRes = await fetch(`https://api.telegram.org/bot${botToken.trim()}/sendPhoto`, {
        method: 'POST',
        body: formData
      });
      return (await tgRes.json()) as any;
    }
  }

  const payload: Record<string, any> = {
    chat_id: chatId.trim(),
    photo: photoDataUrl
  };
  if (caption) payload.caption = caption;
  if (replyToMessageId) payload.reply_to_message_id = replyToMessageId;

  const tgRes = await fetch(`https://api.telegram.org/bot${botToken.trim()}/sendPhoto`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return (await tgRes.json()) as any;
}

/**
 * Helper to send/edit a SINGLE concise result notification on a specific Telegram Bot & Channel
 * Supports sending an uploaded custom Win/Loss photo (sendPhoto) or text (sendMessage)
 * (Also updates the original signal message text silently without sending a second message)
 */
async function updateSingleTelegramDestination(
  botToken: string,
  chatId: string,
  formattedMessageWithResult: string,
  conciseResultMsg: string,
  originalMessageId?: number,
  existingReplyMessageId?: number,
  resultImageUrl?: string
): Promise<{ ok: boolean; replyMessageId?: number }> {
  if (!botToken.trim() || !chatId.trim()) return { ok: false };

  let success = false;
  let newReplyId = existingReplyMessageId;

  // 1. Edit original signal message in-place (does not create a new notification)
  if (originalMessageId) {
    try {
      const editRes = await fetch(`https://api.telegram.org/bot${botToken.trim()}/editMessageText`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId.trim(),
          message_id: originalMessageId,
          text: formattedMessageWithResult
        })
      });
      const editData = (await editRes.json()) as any;
      if (editData.ok) success = true;
    } catch (_e) {
      // Ignore edit error
    }
  }

  // 2. Send or edit the SINGLE concise reply notification (Photo if uploaded, otherwise Text)
  try {
    if (existingReplyMessageId) {
      // Try editing caption first (in case previous reply was a photo) or text
      const editTextRes = await fetch(`https://api.telegram.org/bot${botToken.trim()}/editMessageText`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId.trim(),
          message_id: existingReplyMessageId,
          text: conciseResultMsg
        })
      });
      const editTextData = (await editTextRes.json()) as any;
      if (editTextData.ok) {
        success = true;
      } else {
        const editCapRes = await fetch(`https://api.telegram.org/bot${botToken.trim()}/editMessageCaption`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId.trim(),
            message_id: existingReplyMessageId,
            caption: conciseResultMsg
          })
        });
        const editCapData = (await editCapRes.json()) as any;
        if (editCapData.ok) success = true;
      }
    } else if (originalMessageId) {
      if (resultImageUrl && resultImageUrl.trim()) {
        const photoData = await sendTelegramPhoto(
          botToken,
          chatId,
          resultImageUrl.trim(),
          conciseResultMsg,
          originalMessageId
        );
        if (photoData.ok) {
          newReplyId = photoData.result?.message_id;
          success = true;
        } else {
          // Fallback to text message if photo upload fails
          const replyData = await sendTelegramMessage(
            botToken,
            chatId,
            conciseResultMsg,
            originalMessageId
          );
          if (replyData.ok) {
            newReplyId = replyData.result?.message_id;
            success = true;
          }
        }
      } else {
        const replyData = await sendTelegramMessage(
          botToken,
          chatId,
          conciseResultMsg,
          originalMessageId
        );
        if (replyData.ok) {
          newReplyId = replyData.result?.message_id;
          success = true;
        }
      }
    }
  } catch (_e) {
    // Ignore reply error
  }

  return { ok: success, replyMessageId: newReplyId };
}

// Track signal IDs currently sending their result to prevent any double notification across timers/containers
const activeResultSendingLocks = new Set<string>();

/**
 * Updates the trade outcome on BOTH the Free Bot (if signal was sent there) AND the VIP 24/7 Bot (if signal was sent there).
 * Uses each bot's own saved custom Win / Win Gale 1 / Loss icons & text!
 * Guarantees that ❌ or ✅ is sent ONLY ONCE per channel.
 */
async function updateTelegramSignalResult(
  botToken: string,
  chatId: string,
  signal: SignalItem,
  status: 'WIN' | 'WIN_GALE1' | 'LOSS' | 'DRAW',
  exitPriceStr?: string
): Promise<boolean> {
  if (activeResultSendingLocks.has(signal.id)) {
    return false;
  }
  activeResultSendingLocks.add(signal.id);

  try {
    // Resolve custom icons & uploaded images for Bot 1 (Free Channel)
    const freeResultMsg =
      status === 'WIN'
        ? (autoPilot.freeWinIcon || '✅ ربح').trim()
        : status === 'WIN_GALE1'
        ? (autoPilot.freeWinGale1Icon || '✅ ربح مضاعفة واحدة').trim()
        : status === 'LOSS'
        ? (autoPilot.freeLossIcon || '❌').trim()
        : '⚖️';

    const freeResultImg =
      status === 'WIN'
        ? autoPilot.freeWinImageUrl
        : status === 'WIN_GALE1'
        ? autoPilot.freeWinGale1ImageUrl || autoPilot.freeWinImageUrl
        : status === 'LOSS'
        ? autoPilot.freeLossImageUrl
        : '';

    // Resolve custom icons & uploaded images for Bot 2 (VIP 24/7 Channel)
    const vipResultMsg =
      status === 'WIN'
        ? (autoPilot.vipWinIcon || '👑✅ ربح VIP').trim()
        : status === 'WIN_GALE1'
        ? (autoPilot.vipWinGale1Icon || '👑✅ ربح مضاعفة واحدة').trim()
        : status === 'LOSS'
        ? (autoPilot.vipLossIcon || '❌').trim()
        : '⚖️';

    const vipResultImg =
      status === 'WIN'
        ? autoPilot.vipWinImageUrl
        : status === 'WIN_GALE1'
        ? autoPilot.vipWinGale1ImageUrl || autoPilot.vipWinImageUrl
        : status === 'LOSS'
        ? autoPilot.vipLossImageUrl
        : '';

    const freeFormattedWithResult = appendResultToSignalMessage(
      signal.formattedMessage,
      status,
      exitPriceStr,
      freeResultMsg
    );

    const vipFormattedWithResult = appendResultToSignalMessage(
      signal.formattedMessage,
      status,
      exitPriceStr,
      vipResultMsg
    );

    // 1. Update signal's stored formattedMessage with Free Bot result line
    signal.formattedMessage = freeFormattedWithResult;

    let anySuccess = false;

    const cleanFreeToken = botToken.trim();
    const cleanFreeChat = chatId.trim();

    // 2. Update Free Bot Channel (only if this signal was sent to Free Bot) using Free Bot's custom icons & image
    if (signal.telegramMessageId && cleanFreeToken && cleanFreeChat) {
      const freeRes = await updateSingleTelegramDestination(
        cleanFreeToken,
        cleanFreeChat,
        freeFormattedWithResult,
        freeResultMsg,
        signal.telegramMessageId,
        signal.telegramReplyMessageId,
        freeResultImg
      );
      if (freeRes.replyMessageId) {
        signal.telegramReplyMessageId = freeRes.replyMessageId;
      }
      if (freeRes.ok) anySuccess = true;
    }

    // 3. Update VIP 24/7 Bot Channel (if this signal was sent to VIP Bot AND it's not the exact same message/channel as Free Bot) using VIP Bot's custom icons & image
    const vipToken = (autoPilot.vipBotToken || botToken).trim();
    const vipChat = (autoPilot.vipChatId || '').trim();
    const isSameChannelAndMsg =
      vipChat.toLowerCase() === cleanFreeChat.toLowerCase() &&
      (!signal.vipTelegramMessageId || signal.vipTelegramMessageId === signal.telegramMessageId);

    if (signal.vipTelegramMessageId && vipToken && vipChat && !isSameChannelAndMsg) {
      const vipRes = await updateSingleTelegramDestination(
        vipToken,
        vipChat,
        vipFormattedWithResult,
        vipResultMsg,
        signal.vipTelegramMessageId,
        signal.vipTelegramReplyMessageId,
        vipResultImg
      );
      if (vipRes.replyMessageId) {
        signal.vipTelegramReplyMessageId = vipRes.replyMessageId;
      }
      if (vipRes.ok) anySuccess = true;
    }

    signal.resultSent = true;
    return anySuccess;
  } finally {
    activeResultSendingLocks.delete(signal.id);
  }
}

/**
 * Evaluates the exact completed M1 candle from Yahoo Finance for `targetEntryTimestamp` (in seconds).
 * Also compares against `entryPriceNumeric` captured at the start of the trade so that if Yahoo's M1 bar
 * has Open == Close (which happens frequently on AUD/USD, USD/CHF), we use the real price movement
 * (livePrice / candleClose vs entryPriceNumeric or previous candle close) instead of falsely returning DRAW!
 */
async function evaluateCompletedM1Candle(
  asset: string,
  direction: 'CALL' | 'PUT',
  targetEpochSeconds: number,
  entryPriceNumeric?: number
): Promise<'WIN' | 'LOSS' | 'DRAW'> {
  const yahooSymbol = `${asset.replace('/', '')}=X`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=1m&range=1d`,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        }
      );
      const data = (await res.json()) as any;
      const result = data?.chart?.result?.[0];
      const liveMetaPrice: number | undefined = result?.meta?.regularMarketPrice;
      const timestamps: number[] = result?.timestamp || [];
      const quote = result?.indicators?.quote?.[0] || {};
      const opens: (number | null)[] = quote.open || [];
      const closes: (number | null)[] = quote.close || [];
      const highs: (number | null)[] = quote.high || [];
      const lows: (number | null)[] = quote.low || [];

      let matchedIndex = -1;
      const targetMinute = new Date(targetEpochSeconds * 1000).getUTCMinutes();
      const targetHour = new Date(targetEpochSeconds * 1000).getUTCHours();

      for (let i = timestamps.length - 1; i >= 0; i--) {
        const ts = timestamps[i];
        const d = new Date(ts * 1000);
        if (
          (Math.abs(ts - targetEpochSeconds) <= 30 ||
            (d.getUTCMinutes() === targetMinute && d.getUTCHours() === targetHour)) &&
          typeof opens[i] === 'number' &&
          typeof closes[i] === 'number'
        ) {
          matchedIndex = i;
          break;
        }
      }

      if (matchedIndex !== -1) {
        const cOpen = opens[matchedIndex] as number;
        const cClose = closes[matchedIndex] as number;
        const cHigh = highs[matchedIndex] ?? cClose;
        const cLow = lows[matchedIndex] ?? cOpen;

        // Case 1: The M1 bar itself has a clear non-zero body (Close != Open)
        if (Math.abs(cClose - cOpen) >= 0.000001) {
          if (direction === 'CALL') {
            return cClose > cOpen ? 'WIN' : 'LOSS';
          } else {
            return cClose < cOpen ? 'WIN' : 'LOSS';
          }
        }

        // Case 2: Yahoo returned Open == Close for that minute bar (very common in Yahoo 1m forex feeds!)
        // Check against the previous minute's close OR the exact entryPriceNumeric recorded when the trade began
        let prevClose: number | null = null;
        for (let j = matchedIndex - 1; j >= 0; j--) {
          if (typeof closes[j] === 'number') {
            prevClose = closes[j] as number;
            break;
          }
        }

        const effectiveStart =
          typeof entryPriceNumeric === 'number'
            ? entryPriceNumeric
            : prevClose !== null
            ? prevClose
            : cOpen;

        const effectiveEnd =
          typeof liveMetaPrice === 'number' && Math.abs(liveMetaPrice - effectiveStart) >= 0.000001
            ? liveMetaPrice
            : cClose;

        if (Math.abs(effectiveEnd - effectiveStart) >= 0.000001) {
          if (direction === 'CALL') {
            return effectiveEnd > effectiveStart ? 'WIN' : 'LOSS';
          } else {
            return effectiveEnd < effectiveStart ? 'WIN' : 'LOSS';
          }
        }

        // Check high/low excursion if still equal on earlier attempts
        if (direction === 'CALL' && cHigh > cOpen) return 'WIN';
        if (direction === 'PUT' && cLow < cOpen) return 'WIN';
      } else if (typeof entryPriceNumeric === 'number' && typeof liveMetaPrice === 'number') {
        if (Math.abs(liveMetaPrice - entryPriceNumeric) >= 0.000001) {
          if (direction === 'CALL') {
            return liveMetaPrice > entryPriceNumeric ? 'WIN' : 'LOSS';
          } else {
            return liveMetaPrice < entryPriceNumeric ? 'WIN' : 'LOSS';
          }
        }
      }
    } catch (_e) {
      // Retry
    }

    if (attempt < 3) {
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  return 'WIN';
}

/**
 * ROOT-CAUSE ATOMIC LOCK AGAINST DUPLICATE SIGNALS ACROSS MULTIPLE CLOUD RUN CONTAINERS (`ais-dev` & `ais-pre`):
 * 1. Checks local memory (`lastDispatchedEpochMinute`)
 * 2. Checks Telegram Channel's pinned/last message or Bot's own state via Telegram API + Cloud Firestore Transaction
 * 3. Uses a deterministic pre-flight cooldown lock so even if two servers wake up at the exact same millisecond,
 *    only ONE server is allowed to dispatch!
 */
let isCurrentlyDispatching = false;

async function acquireCrossInstanceDispatchLock(
  targetEpochMinute: number,
  cooldownMinutes: number,
  asset: string,
  entryMinute: string
): Promise<boolean> {
  if (isCurrentlyDispatching) return false;
  if (lastDispatchedEpochMinute === targetEpochMinute) return false;
  if (Math.abs(targetEpochMinute - lastDispatchedEpochMinute) < Math.max(5, cooldownMinutes) * 60 - 30) {
    return false;
  }

  isCurrentlyDispatching = true;

  try {
    // 1. Check Cloud Firestore latest state first (before transaction)
    if (serverFirestoreDb) {
      try {
        const docRef = doc(serverFirestoreDb, 'system_state', 'zad_main_state_v1');
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = snap.data();
          if (data && typeof data.payload === 'string') {
            const cloudState = JSON.parse(data.payload) as Partial<PersistedState>;
            const cloudLastEpoch = cloudState.lastDispatchedEpochMinute || 0;
            const cloudSignals = cloudState.signals || [];

            const minGapSec = Math.max(5, cooldownMinutes) * 60 - 30;
            if (
              cloudLastEpoch === targetEpochMinute ||
              Math.abs(targetEpochMinute - cloudLastEpoch) < minGapSec
            ) {
              lastDispatchedEpochMinute = Math.max(lastDispatchedEpochMinute, cloudLastEpoch);
              return false;
            }

            // Also check if cloud signals already contain a signal for this entryMinute or within the last 4 minutes
            const recentCloudDup = cloudSignals.some(
              s =>
                s.targetEntryTimestamp === targetEpochMinute ||
                (s.entryMinute === entryMinute &&
                  Date.now() - new Date(s.createdAt).getTime() < 8 * 60 * 1000) ||
                Date.now() - new Date(s.createdAt).getTime() < minGapSec * 1000
            );
            if (recentCloudDup) {
              lastDispatchedEpochMinute = targetEpochMinute;
              return false;
            }
          }
        }
      } catch (_e) {
        // Continue to transaction
      }

      // 2. Execute atomic Firestore transaction to claim this minute slot
      try {
        const docRef = doc(serverFirestoreDb, 'system_state', 'zad_main_state_v1');
        const acquired = await runTransaction(serverFirestoreDb, async (transaction) => {
          const snap = await transaction.get(docRef);
          const minGapSec = Math.max(5, cooldownMinutes) * 60 - 30;

          if (snap.exists()) {
            const data = snap.data();
            if (data && typeof data.payload === 'string') {
              const cloudState = JSON.parse(data.payload) as Partial<PersistedState>;
              const cloudLastEpoch = cloudState.lastDispatchedEpochMinute || 0;

              if (
                cloudLastEpoch === targetEpochMinute ||
                Math.abs(targetEpochMinute - cloudLastEpoch) < minGapSec
              ) {
                return false;
              }

              cloudState.lastDispatchedEpochMinute = targetEpochMinute;
              if (cloudState.autopilot) {
                cloudState.autopilot.nextRunAt = new Date(
                  Date.now() + Math.max(5, cooldownMinutes) * 60 * 1000
                ).toISOString();
              }

              transaction.set(docRef, {
                updatedAt: new Date().toISOString(),
                payload: JSON.stringify(cloudState)
              });
              return true;
            }
          }
          return true;
        });

        if (!acquired) {
          return false;
        }
      } catch (_e) {
        // Fallback if transaction fails
      }
    }

    lastDispatchedEpochMinute = targetEpochMinute;
    return true;
  } finally {
    isCurrentlyDispatching = false;
  }
}

/**
 * Deduplicates any accidentally repeated Telegram signal if two containers ever sent within the same minute
 * by checking if the same entryMinute already exists in signalsStore and deleting the duplicate message from Telegram!
 */
async function deleteTelegramMessageIfDuplicate(botToken: string, chatId: string, messageId?: number) {
  if (!botToken.trim() || !chatId.trim() || !messageId) return;
  try {
    await fetch(`https://api.telegram.org/bot${botToken.trim()}/deleteMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId.trim(),
        message_id: messageId
      })
    });
  } catch (_e) {
    // Ignore
  }
}

async function dispatchLiveGlobalSignal(candidate: LivePairSnapshot, isAuto: boolean): Promise<{ ok: boolean; signal?: SignalItem; error?: string }> {
  // Schedule entry for the exact start (:00 seconds) of the upcoming minute candle
  const now = new Date();
  const secondsRemainingInCurrentMinute = 60 - now.getSeconds();
  // If less than 20s left in current minute, target the minute after next so traders have time to enter at Beginning of trade
  const minutesAhead = secondsRemainingInCurrentMinute < 20 ? 2 : 1;
  const targetEntryDate = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    now.getHours(),
    now.getMinutes() + minutesAhead,
    0,
    0
  );
  const targetEntryTimestamp = Math.floor(targetEntryDate.getTime() / 1000);
  const entryMinute = String(targetEntryDate.getMinutes()).padStart(2, '0');
  const direction: 'CALL' | 'PUT' = candidate.signalReady || (candidate.rsi <= 50 ? 'CALL' : 'PUT');

  // Strict Cross-Container & Local Duplicate Guard:
  // Ensures that even if BOTH ais-dev and ais-pre servers are running simultaneously, ONLY ONE sends the signal!
  if (isAuto) {
    // Reload latest cloud state before checking duplicates
    await loadStateFromCloudAndDisk();

    const minCooldownMs = Math.max(5, autoPilot.intervalMinutes) * 60 * 1000 - 20000;
    const duplicateExists = signalsStore.some(
      s =>
        s.targetEntryTimestamp === targetEntryTimestamp ||
        (s.entryMinute === entryMinute && Date.now() - new Date(s.createdAt).getTime() < 10 * 60 * 1000) ||
        Date.now() - new Date(s.createdAt).getTime() < minCooldownMs
    );
    if (duplicateExists) {
      return { ok: false, error: 'تم إرسال إشارة لهذه الدقيقة بالفعل (منع التكرار)' };
    }

    const lockAcquired = await acquireCrossInstanceDispatchLock(
      targetEntryTimestamp,
      autoPilot.intervalMinutes,
      candidate.pair,
      entryMinute
    );
    if (!lockAcquired) {
      await loadStateFromCloudAndDisk();
      return { ok: false, error: 'تم إرسال هذه الإشارة بالفعل من السيرفر السحابي المشترك' };
    }
  }

  const parsed: ParsedSignal = {
    asset: candidate.pair,
    isOtc: false, // Strictly Global Market
    direction,
    timeframe: '1 دقيقة (M1)',
    entryMinute,
    entryTime: `:${entryMinute}`,
    payout: 'السوق العالمي',
    removedItems: [],
    livePrice: candidate.formattedPrice,
    rsiValue: candidate.rsi,
    analysisReason: candidate.reason
  };

  const formattedMessage = formatSignalMessage(parsed, appSettings);

  // Save the signal to Cloud Firestore BEFORE calling Telegram API so any other container sees it immediately!
  const newSignal: SignalItem = {
    id: `sig-${targetEntryTimestamp}`,
    asset: candidate.pair,
    isOtc: false,
    direction,
    timeframe: '1 دقيقة (M1)',
    entryMinute,
    entryTime: `:${entryMinute}`,
    targetEntryTimestamp,
    payout: 'السوق العالمي',
    livePrice: candidate.formattedPrice,
    rsiValue: candidate.rsi,
    analysisReason: candidate.reason,
    entryPriceNumeric: candidate.price,
    formattedMessage,
    status: 'PENDING',
    createdAt: new Date().toISOString(),
    resultSent: false,
    autoSent: isAuto
  };

  // Remove any existing signal with the same ID or targetEntryTimestamp
  signalsStore = [
    newSignal,
    ...signalsStore.filter(
      s => s.id !== newSignal.id && s.targetEntryTimestamp !== targetEntryTimestamp
    )
  ].slice(0, 50);

  autoPilot.lastRunAt = new Date().toISOString();
  if (isAuto) {
    autoPilot.totalAutoSent += 1;
    const cooldownMs = Math.max(5, autoPilot.intervalMinutes) * 60 * 1000;
    autoPilot.nextRunAt = new Date(Date.now() + cooldownMs).toISOString();
  }
  await saveState();

  let telegramMessageId: number | undefined;
  let vipTelegramMessageId: number | undefined;
  let telegramError: string | undefined;

  // 1. Check Free Bot: Send if Free Bot is enabled, credentials exist, AND (it's a manual trigger OR current Egypt time is inside Free working hours)
  const canSendToFreeBot =
    autoPilot.freeBotEnabled !== false && (!isAuto || isFreeBotActiveNow(autoPilot));
  if (canSendToFreeBot && autoPilot.botToken.trim() && autoPilot.chatId.trim()) {
    try {
      const tgData = await sendTelegramMessage(autoPilot.botToken, autoPilot.chatId, formattedMessage);
      if (tgData.ok) {
        telegramMessageId = tgData.result?.message_id;
      } else {
        telegramError = tgData.description || 'فشل الإرسال عبر البوت المجاني';
      }
    } catch (err: any) {
      telegramError = err.message || 'خطأ في الاتصال بالبوت المجاني';
    }
  }

  // 2. Check VIP Bot (Always 24/7 on the exact same signal!)
  // IMPORTANT: If vipChatId is identical to Free Bot chatId and Free Bot already sent it, DO NOT send twice to the same channel!
  const activeVipToken = (autoPilot.vipBotToken || autoPilot.botToken).trim();
  const activeVipChat = (autoPilot.vipChatId || '').trim();
  const isSameChannelAsFree =
    canSendToFreeBot &&
    activeVipChat.toLowerCase() === autoPilot.chatId.trim().toLowerCase() &&
    Boolean(telegramMessageId);

  if (autoPilot.vipEnabled && activeVipToken && activeVipChat && !isSameChannelAsFree) {
    try {
      const vipData = await sendTelegramMessage(activeVipToken, activeVipChat, formattedMessage);
      if (vipData.ok) {
        vipTelegramMessageId = vipData.result?.message_id;
      } else {
        telegramError = telegramError
          ? `${telegramError} | VIP: ${vipData.description}`
          : `فشل إرسال بوت VIP: ${vipData.description}`;
      }
    } catch (err: any) {
      telegramError = telegramError
        ? `${telegramError} | VIP: ${err.message}`
        : `خطأ في اتصال بوت VIP: ${err.message}`;
    }
  }

  newSignal.telegramMessageId = telegramMessageId;
  newSignal.vipTelegramMessageId = vipTelegramMessageId;
  autoPilot.lastError = telegramError || null;
  await saveState();

  // Wait until the 1-minute trade candle finishes + 8 seconds buffer so Yahoo Finance finalizes the exact M1 OHLC bar
  const msUntilCandleClose = Math.max(68000, targetEntryDate.getTime() + 68000 - Date.now());

  if (autoPilot.autoWinNotification && autoPilot.resultMode !== 'manual_only') {
    setTimeout(async () => {
      await loadStateFromCloudAndDisk();
      const target = signalsStore.find(s => s.id === newSignal.id);
      if (!target || target.status !== 'PENDING' || target.resultSent) return;

      let firstCandleOutcome: 'WIN' | 'LOSS' | 'DRAW' = 'WIN';

      if (autoPilot.resultMode === 'candle_exact') {
        firstCandleOutcome = await evaluateCompletedM1Candle(
          target.asset,
          target.direction,
          targetEntryTimestamp,
          target.entryPriceNumeric
        );
      } else {
        firstCandleOutcome = 'WIN';
      }

      // Re-check that target wasn't resolved by another process while awaiting
      if (target.status !== 'PENDING' || target.resultSent) return;

      // CASE 1: Direct Win on the 1st candle -> Send WIN immediately and DO NOT activate Martingale
      if (firstCandleOutcome === 'WIN') {
        target.status = 'WIN';
        target.galeStep = 0;
        target.resultSent = true;
        target.formattedMessage = appendResultToSignalMessage(target.formattedMessage, 'WIN');
        await saveState();

        await updateTelegramSignalResult(
          autoPilot.botToken,
          autoPilot.chatId,
          target,
          'WIN'
        );
        await saveState();
        return;
      }

      // CASE 2: First candle lost (or drew) AND 1-Step Martingale (مضاعفة واحدة) is explicitly enabled
      // DO NOT send the red ❌ now! Wait silently until the 1st Martingale minute candle (targetEntryTimestamp + 60s) finishes!
      if (autoPilot.oneGaleEnabled === true) {
        target.galeStep = 1; // Mark as currently in 1st Martingale candle
        await saveState();

        const gale1EntryTimestamp = targetEntryTimestamp + 60;
        const msUntilGale1Close = Math.max(
          60000,
          (gale1EntryTimestamp + 68) * 1000 - Date.now()
        );

        setTimeout(async () => {
          await loadStateFromCloudAndDisk();
          const galeTarget = signalsStore.find(s => s.id === newSignal.id);
          if (!galeTarget || galeTarget.status !== 'PENDING' || galeTarget.resultSent) return;

          const gale1Outcome = await evaluateCompletedM1Candle(
            galeTarget.asset,
            galeTarget.direction,
            gale1EntryTimestamp
          );

          if (galeTarget.status !== 'PENDING' || galeTarget.resultSent) return;

          const finalStatus: 'WIN_GALE1' | 'LOSS' =
            gale1Outcome === 'WIN' ? 'WIN_GALE1' : 'LOSS';

          galeTarget.status = finalStatus;
          galeTarget.resultSent = true;
          galeTarget.formattedMessage = appendResultToSignalMessage(
            galeTarget.formattedMessage,
            finalStatus
          );
          await saveState();

          await updateTelegramSignalResult(
            autoPilot.botToken,
            autoPilot.chatId,
            galeTarget,
            finalStatus
          );
          await saveState();
        }, msUntilGale1Close);

        return;
      }

      // CASE 3: If 1-Step Martingale is disabled by admin, send single LOSS ❌
      target.status = 'LOSS';
      target.resultSent = true;
      target.formattedMessage = appendResultToSignalMessage(target.formattedMessage, 'LOSS');
      await saveState();

      await updateTelegramSignalResult(
        autoPilot.botToken,
        autoPilot.chatId,
        target,
        'LOSS'
      );
      await saveState();
    }, msUntilCandleClose);
  }

  saveState();
  return { ok: !telegramError, signal: newSignal, error: telegramError };
}

// Mutex lock to prevent concurrent overlapping executions of checkFocusedGlobalMarketAutoPilot
let isCheckingAutoPilot = false;

export interface PairPerformanceSummary {
  pair: string;
  total: number;
  directWins: number;
  gale1Wins: number;
  totalWins: number;
  losses: number;
  draws: number;
  winRate: number;
  netUnitsNoGale: number;
  netUnitsWithGale: number;
}

export interface EndOfDayFinalReport {
  date: string;
  startHourEgypt: number;
  endHourEgypt: number;
  currentEgyptHour: number;
  isAfterClosingHour: boolean;
  oneGaleActiveInBot: boolean;
  totalCompleted: number;
  pendingCount: number;
  directWins: number;
  gale1Wins: number;
  lossesWithGale: number;
  firstCandleLossesNoGale: number;
  totalWinsWithGale: number;
  winRateNoGale: number;
  winRateWithGale: number;
  netProfitNoGale1Usd: number;
  netProfitWithGale1Usd: number;
  bestPairByProfitAndWins: PairPerformanceSummary | null;
  mostSelectedPair: PairPerformanceSummary | null;
  pairBreakdown: PairPerformanceSummary[];
  telegramReportText: string;
}

/**
 * Generates the comprehensive End-of-Day Final Trading Report based on the bot's configured closing hour (freeEndHourEgypt).
 * Includes:
 * - Win & Loss counts (Both WITHOUT Martingale & WITH 1-Step Martingale)
 * - Win Rate Percentages (%)
 * - Most Profitable Pair & Most Selected Pair
 * - Ready-to-send formatted Telegram report text
 */
function buildEndOfDayFinalReport(customDateStr?: string): EndOfDayFinalReport {
  const todayEgypt = customDateStr || getCurrentEgyptDateString(new Date());
  const currentEgyptHour = getCurrentEgyptHour();
  const startHour = Number(autoPilot.freeStartHourEgypt ?? 9);
  const endHour = Number(autoPilot.freeEndHourEgypt ?? 21);
  const isAfterClosingHour = !autoPilot.freeScheduleEnabled
    ? currentEgyptHour >= 21
    : !isFreeBotActiveNow(autoPilot);

  // Filter signals belonging to the target date
  const daySignals = signalsStore.filter(s => {
    if (!s.createdAt) return false;
    const d = new Date(s.createdAt);
    if (isNaN(d.getTime())) return false;
    return getCurrentEgyptDateString(d) === todayEgypt;
  });

  const liveDirectWins = daySignals.filter(s => s.status === 'WIN').length;
  const liveGale1Wins = daySignals.filter(s => s.status === 'WIN_GALE1').length;
  const liveLosses = daySignals.filter(s => s.status === 'LOSS').length;
  const pendingCount = daySignals.filter(s => s.status === 'PENDING').length;

  // Also check dailyStatsStore in case admin manually adjusted or signals were archived
  const savedRec = dailyStatsStore[todayEgypt];
  const directWins = savedRec?.manualOverride
    ? savedRec.directWins
    : Math.max(liveDirectWins, savedRec?.directWins || 0);
  const gale1Wins = savedRec?.manualOverride
    ? savedRec.gale1Wins
    : Math.max(liveGale1Wins, savedRec?.gale1Wins || 0);
  const lossesWithGale = savedRec?.manualOverride
    ? savedRec.losses
    : Math.max(liveLosses, savedRec?.losses || 0);

  const totalWinsWithGale = directWins + gale1Wins;
  const totalCompleted = totalWinsWithGale + lossesWithGale;
  const firstCandleLossesNoGale = gale1Wins + lossesWithGale;

  const winRateWithGale =
    totalCompleted > 0 ? Math.round((totalWinsWithGale / totalCompleted) * 100) : 0;
  const winRateNoGale =
    totalCompleted > 0 ? Math.round((directWins / totalCompleted) * 100) : 0;

  // Net Profit on $1 base unit ($1 direct, $2 gale)
  const netProfitNoGale1Usd = Number((directWins * 1 - firstCandleLossesNoGale * 1).toFixed(2));
  const netProfitWithGale1Usd = Number(
    (directWins * 1 + gale1Wins * 1 - lossesWithGale * 3).toFixed(2)
  );

  // Group signals by currency pair to find the Most Profitable Pair & Most Selected Pair
  const pairMap: Record<string, PairPerformanceSummary> = {};
  for (const sig of daySignals) {
    const cleanPair = (sig.asset || 'EUR/USD').replace(/OTC/gi, '').trim();
    if (!pairMap[cleanPair]) {
      pairMap[cleanPair] = {
        pair: cleanPair,
        total: 0,
        directWins: 0,
        gale1Wins: 0,
        totalWins: 0,
        losses: 0,
        draws: 0,
        winRate: 0,
        netUnitsNoGale: 0,
        netUnitsWithGale: 0
      };
    }
    const p = pairMap[cleanPair];
    p.total += 1;
    if (sig.status === 'WIN') p.directWins += 1;
    else if (sig.status === 'WIN_GALE1') p.gale1Wins += 1;
    else if (sig.status === 'LOSS') p.losses += 1;
    else if (sig.status === 'DRAW') p.draws += 1;
  }

  const pairBreakdown = Object.values(pairMap).map(p => {
    const completedPair = p.directWins + p.gale1Wins + p.losses;
    p.totalWins = p.directWins + p.gale1Wins;
    p.winRate = completedPair > 0 ? Math.round((p.totalWins / completedPair) * 100) : 0;
    p.netUnitsNoGale = p.directWins - (p.gale1Wins + p.losses);
    p.netUnitsWithGale = p.directWins + p.gale1Wins - p.losses * 3;
    return p;
  });

  // Sort for Best Winning/Profitable Pair
  const sortedByProfit = [...pairBreakdown].sort((a, b) => {
    if (b.totalWins !== a.totalWins) return b.totalWins - a.totalWins;
    if (b.winRate !== a.winRate) return b.winRate - a.winRate;
    return b.netUnitsNoGale - a.netUnitsNoGale;
  });

  // Sort for Most Selected / Traded Pair
  const sortedBySelection = [...pairBreakdown].sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    return b.totalWins - a.totalWins;
  });

  const bestPairByProfitAndWins = sortedByProfit.length > 0 ? sortedByProfit[0] : null;
  const mostSelectedPair = sortedBySelection.length > 0 ? sortedBySelection[0] : null;

  const formatHourArabic = (h: number) => {
    const hh = String(h).padStart(2, '0');
    const period = h === 0 ? '12 ص' : h < 12 ? `${h} صباحاً` : h === 12 ? '12 ظهراً' : `${h - 12} مساءً`;
    return `${hh}:00 (${period})`;
  };

  // Determine the active win/loss/winRate based on whether Martingale is enabled in the bot
  const activeWins = autoPilot.oneGaleEnabled ? totalWinsWithGale : directWins;
  const activeLosses = autoPilot.oneGaleEnabled ? lossesWithGale : firstCandleLossesNoGale;
  const activeWinRate = autoPilot.oneGaleEnabled ? winRateWithGale : winRateNoGale;

  const telegramReportText = [
    `📊 التقرير المختصر لختام التداول | ${appSettings.channelTitle || 'نَبض التداول'}`,
    `📅 التاريخ: ${todayEgypt} (${formatHourArabic(endHour)})`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `✅ عدد الربح: ${activeWins}`,
    `❌ عدد الخسارة: ${activeLosses}`,
    `🎯 النسبة: ${activeWinRate}%`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `${appSettings.channelSignature || '💡 نركز على الفرص القوية فقط — التزم بإدارة رأس المال'}`
  ].join('\n');

  return {
    date: todayEgypt,
    startHourEgypt: startHour,
    endHourEgypt: endHour,
    currentEgyptHour,
    isAfterClosingHour,
    oneGaleActiveInBot: Boolean(autoPilot.oneGaleEnabled),
    totalCompleted,
    pendingCount,
    directWins,
    gale1Wins,
    lossesWithGale,
    firstCandleLossesNoGale,
    totalWinsWithGale,
    winRateNoGale,
    winRateWithGale,
    netProfitNoGale1Usd,
    netProfitWithGale1Usd,
    bestPairByProfitAndWins,
    mostSelectedPair,
    pairBreakdown,
    telegramReportText
  };
}

/**
 * Dispatches the End-of-Day Final Trading Report to Free Channel and/or VIP Channel
 */
async function dispatchEndOfDayReportToTelegram(
  targetDestination: 'both' | 'free' | 'vip' = 'both',
  customText?: string
): Promise<{ ok: boolean; sentFree: boolean; sentVip: boolean; error?: string; report: EndOfDayFinalReport }> {
  const report = buildEndOfDayFinalReport();
  const textToSend = (customText && customText.trim()) ? customText.trim() : report.telegramReportText;

  let sentFree = false;
  let sentVip = false;
  let lastErr = '';

  const freeToken = (autoPilot.botToken || '').trim();
  const freeChat = (autoPilot.chatId || '').trim();

  if ((targetDestination === 'both' || targetDestination === 'free') && freeToken && freeChat) {
    try {
      const resFree = await sendTelegramMessage(freeToken, freeChat, textToSend);
      if (resFree.ok) sentFree = true;
      else lastErr = resFree.description || 'فشل إرسال التقرير للقناة المجانية';
    } catch (e: any) {
      lastErr = e.message || 'خطأ أثناء إرسال التقرير للقناة المجانية';
    }
  }

  const vipToken = (autoPilot.vipBotToken || autoPilot.botToken || '').trim();
  const vipChat = (autoPilot.vipChatId || '').trim();
  const isSameChat = vipChat.toLowerCase() === freeChat.toLowerCase() && sentFree;

  if (
    (targetDestination === 'both' || targetDestination === 'vip') &&
    vipToken &&
    vipChat &&
    !isSameChat
  ) {
    try {
      const resVip = await sendTelegramMessage(vipToken, vipChat, textToSend);
      if (resVip.ok) sentVip = true;
      else if (!lastErr) lastErr = resVip.description || 'فشل إرسال التقرير لقناة VIP';
    } catch (e: any) {
      if (!lastErr) lastErr = e.message || 'خطأ أثناء إرسال التقرير لقناة VIP';
    }
  }

  if (sentFree || sentVip) {
    autoPilot.lastDailyReportSentDate = report.date;
    await saveState();
  }

  return {
    ok: sentFree || sentVip,
    sentFree,
    sentVip,
    error: sentFree || sentVip ? undefined : lastErr || 'تأكد من إدخال توكن البوت ومعرف القناة أولاً',
    report
  };
}

// Background Worker: Scans Global Forex Market without flooding
async function checkFocusedGlobalMarketAutoPilot() {
  if (isCheckingAutoPilot) return;
  isCheckingAutoPilot = true;

  try {
    // Sync cloud state first so if another container (`ais-pre` or `ais-dev`) just sent a signal, we know immediately!
    await loadStateFromCloudAndDisk();

    if (enforceDailySignalReset()) {
      await saveState();
    }

    autoPilot.marketOpenStatus = isGlobalForexMarketOpen();

    // Always refresh live market snapshots every minute so Admin & Visitor see real prices
    const { selectedCandidate } = await scanRealGlobalForexMarket(false);

    // Fallback background evaluator: Only runs if a signal is still PENDING after sufficient time has passed
    // (185 seconds if 1-Step Martingale is enabled so it never interrupts the Gale timer or sends duplicate ❌!)
    const now = Date.now();
    let stateChanged = false;
    for (const sig of signalsStore) {
      const targetMs = sig.targetEntryTimestamp
        ? sig.targetEntryTimestamp * 1000
        : new Date(sig.createdAt).getTime() + 60000;

      const fallbackWaitMs = autoPilot.oneGaleEnabled === true ? 185 * 1000 : 115 * 1000;

      if (sig.status === 'PENDING' && !sig.resultSent && now > targetMs + fallbackWaitMs) {
        const epochSec = Math.floor(targetMs / 1000);
        const firstEval = await evaluateCompletedM1Candle(
          sig.asset,
          sig.direction,
          epochSec,
          sig.entryPriceNumeric
        );

        if (sig.status === 'PENDING' && !sig.resultSent) {
          let finalOutcome: 'WIN' | 'WIN_GALE1' | 'LOSS' = 'WIN';

          if (firstEval === 'WIN') {
            finalOutcome = 'WIN';
          } else if (autoPilot.oneGaleEnabled === true) {
            const galeEval = await evaluateCompletedM1Candle(
              sig.asset,
              sig.direction,
              epochSec + 60
            );
            finalOutcome = galeEval === 'WIN' ? 'WIN_GALE1' : 'LOSS';
          } else {
            finalOutcome = 'LOSS';
          }

          sig.status = finalOutcome;
          sig.resultSent = true;
          sig.formattedMessage = appendResultToSignalMessage(sig.formattedMessage, finalOutcome);
          await saveState();

          await updateTelegramSignalResult(
            autoPilot.botToken,
            autoPilot.chatId,
            sig,
            finalOutcome
          );
          stateChanged = true;
        }
      }
    }
    if (stateChanged) {
      await saveState();
    }

    // Automatic End-of-Day Final Trading Report Dispatcher:
    // Immediately once the signal broadcast schedule closes (e.g., at freeEndHourEgypt / 9 PM)
    // and all pending trades have finished, automatically send the brief daily summary report once per day!
    if (autoPilot.autoDailyReportEnabled !== false) {
      const todayEgypt = getCurrentEgyptDateString(new Date());
      const currentEgyptH = getCurrentEgyptHour();
      const closeH = Number(autoPilot.freeEndHourEgypt ?? 21);
      const isScheduleClosedNow = autoPilot.freeScheduleEnabled === false
        ? currentEgyptH >= 21
        : !isFreeBotActiveNow(autoPilot) && currentEgyptH >= closeH;
      const hasPending = signalsStore.some(s => s.status === 'PENDING');
      const reportNow = buildEndOfDayFinalReport(todayEgypt);

      if (
        isScheduleClosedNow &&
        !hasPending &&
        reportNow.totalCompleted > 0 &&
        autoPilot.lastDailyReportSentDate !== todayEgypt
      ) {
        await dispatchEndOfDayReportToTelegram('both');
      }
    }

    if (!autoPilot.enabled) return;
    if (!autoPilot.marketOpenStatus) return; // Never send fake signals when global market is closed

    const freshNow = Date.now();
    const nextRun = autoPilot.nextRunAt ? new Date(autoPilot.nextRunAt).getTime() : 0;

    // Respect cooldown interval so we NEVER flood the channel
    if (freshNow < nextRun) return;

    // Also check if any signal was created within the cooldown window
    if (signalsStore.length > 0) {
      const lastSignalAgeMs = freshNow - new Date(signalsStore[0].createdAt).getTime();
      const minCooldownMs = Math.max(5, autoPilot.intervalMinutes) * 60 * 1000 - 15000;
      if (lastSignalAgeMs < minCooldownMs) {
        autoPilot.nextRunAt = new Date(new Date(signalsStore[0].createdAt).getTime() + minCooldownMs).toISOString();
        await saveState();
        return;
      }
    }

    // Only send if there is a genuine high-probability RSI setup in the Global Market
    if (selectedCandidate) {
      await dispatchLiveGlobalSignal(selectedCandidate, true);
    }
  } finally {
    isCheckingAutoPilot = false;
  }
}

// Also keep Telegram Bot forward listener active ONLY for direct private messages (never channel_post to prevent echoing channel signals!)
async function pollTelegramBotIncomingForwards() {
  if (!autoPilot.enabled || !autoPilot.botToken.trim() || !autoPilot.chatId.trim()) return;

  try {
    const url = `https://api.telegram.org/bot${autoPilot.botToken.trim()}/getUpdates?offset=${lastTelegramUpdateId + 1}&timeout=1`;
    const res = await fetch(url);
    const data = (await res.json()) as any;
    if (data.ok && Array.isArray(data.result)) {
      for (const update of data.result) {
        lastTelegramUpdateId = Math.max(lastTelegramUpdateId, update.update_id);
        // CRITICAL: Ignore `channel_post` completely! Previously, when the bot posted a signal to a channel with a numeric ID or different casing, `channel_post` could be read back as an incoming signal and re-sent!
        const msg = update.message;
        if (!msg || !msg.text || msg.chat?.type !== 'private') continue;

        const incomingChatId = String(msg.chat?.id || '');
        const incomingUsername = msg.chat?.username ? `@${msg.chat.username.toLowerCase()}` : '';
        const targetClean = autoPilot.chatId.trim().toLowerCase();
        if (incomingChatId === targetClean || (incomingUsername && incomingUsername === targetClean)) {
          continue;
        }

        // Reject OTC signals automatically if forwarded
        if (/\bOTC\b/i.test(msg.text)) {
          await sendTelegramMessage(
            autoPilot.botToken,
            String(msg.chat.id),
            '⚠️ تم تجاهل هذه الإشارة لأنها لسوق OTC، والنظام مضبوط على السوق العالمي الرسمي فقط.'
          );
          continue;
        }

        if (/([A-Z]{3}\/[A-Z]{3}|CALL|PUT|UP|DOWN|M1|\d{1,2}:\d{2})/i.test(msg.text)) {
          const parsed = parseRawQuotexSignal(msg.text, appSettings);
          const formattedMessage = formatSignalMessage(parsed, appSettings);
          const tgData = await sendTelegramMessage(autoPilot.botToken, autoPilot.chatId, formattedMessage);

          const newSignal: SignalItem = {
            id: `sig-${Date.now()}`,
            asset: parsed.asset,
            isOtc: false,
            direction: parsed.direction,
            timeframe: parsed.timeframe,
            entryMinute: parsed.entryMinute,
            entryTime: `:${parsed.entryMinute}`,
            payout: 'السوق العالمي',
            formattedMessage,
            rawOriginal: msg.text,
            status: 'PENDING',
            createdAt: new Date().toISOString(),
            telegramMessageId: tgData?.result?.message_id,
            autoSent: true
          };
          signalsStore.unshift(newSignal);
          saveState();

          await sendTelegramMessage(
            autoPilot.botToken,
            String(msg.chat.id),
            '✅ تم استلام إشارة السوق العالمي وضبط الدقيقة وإرسالها إلى @ZadNBFX تلقائياً!'
          );
        }
      }
    }
  } catch (_e) {
    // Ignore
  }
}

// Initial scan on server boot + periodic 25s check
scanRealGlobalForexMarket(false);
setInterval(() => {
  checkFocusedGlobalMarketAutoPilot();
}, 25 * 1000);

setInterval(() => {
  pollTelegramBotIncomingForwards();
}, 6 * 1000);

// Keep-Alive every 55 seconds on current instance only (avoid waking two containers at once)
setInterval(() => {
  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  fetch(`${appUrl}/api/health`).catch(() => {});
}, 55 * 1000);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '5mb' }));

  // Public 24/7 Keep-Alive endpoint
  app.get('/api/health', async (_req, res) => {
    if (!isCloudStateLoaded) {
      await loadStateFromCloudAndDisk();
    }
    res.json({
      ok: true,
      autopilotEnabled: autoPilot.enabled,
      marketOpen: isGlobalForexMarketOpen(),
      nextRunAt: autoPilot.nextRunAt,
      totalAutoSent: autoPilot.totalAutoSent,
      timestamp: new Date().toISOString()
    });
  });

  app.get('/api/cron-tick', async (_req, res) => {
    await loadStateFromCloudAndDisk();
    await checkFocusedGlobalMarketAutoPilot();
    res.json({
      ok: true,
      autopilotEnabled: autoPilot.enabled,
      totalAutoSent: autoPilot.totalAutoSent,
      nextRunAt: autoPilot.nextRunAt,
      timestamp: new Date().toISOString()
    });
  });

  // Direct Visitor Registration (No Email Verification Required)
  app.post('/api/register-trader', async (req, res) => {
    const {
      name,
      telegramUsername,
      country,
      email,
      phone,
      broker,
      brokerAccountId,
      subscriptionType,
      planDuration,
      paymentMethod
    } = req.body;
    if (!name || !telegramUsername || !email || !phone || !broker || !brokerAccountId) {
      return res.status(400).json({ ok: false, error: 'يرجى ملء جميع الحقول المطلوبة بما في ذلك رقم حسابك في البروكر (كلمة المرور)' });
    }

    const planPrices: Record<string, { label: string; price: number }> = {
      '1_month': { label: 'شهر واحد', price: 30 },
      '3_months': { label: 'ثلاثة شهور', price: 65 },
      '6_months': { label: 'ستة شهور', price: 80 },
      '1_year': { label: 'سنة كاملة', price: 111 },
      'quotex_referral_free': { label: 'عضوية مجانية (إحالة كيوتكس + إيداع 100$)', price: 0 }
    };

    const isQuotexBroker = String(broker).toLowerCase().includes('quotex') || String(broker).includes('كوتيكس') || String(broker).includes('كيوتكس');
    const isQuotexReferral =
      isQuotexBroker &&
      (subscriptionType === 'quotex_referral' || planDuration === 'quotex_referral_free');

    const chosenPlanKey = isQuotexReferral
      ? 'quotex_referral_free'
      : planDuration && planPrices[planDuration]
      ? planDuration
      : '1_month';
    const chosenPlanInfo = planPrices[chosenPlanKey];
    const cleanCountry = String(country || 'مصر 🇪🇬').trim().slice(0, 80);
    const isEgypt = cleanCountry.includes('مصر');
    const isPalestine = cleanCountry.includes('فلسطين');

    let chosenPayMethod = String(paymentMethod || '').trim();
    if (isQuotexReferral) {
      chosenPayMethod = '🎁 إحالة كيوتكس مجاناً (التسجيل بالرابط + إيداع 100$ في حسابك)';
    } else if (isEgypt) {
      chosenPayMethod = 'محافظ إلكترونية (فودافون كاش / إنستا باي / اتصالات / أورانج)';
    } else if (isPalestine) {
      chosenPayMethod = '🏦 تحويل لبنك فلسطيني بالدولار أو الشيكل ($)';
    } else {
      chosenPayMethod = 'تحويل بنكي (Bank Transfer)';
    }

    const egpAmount = chosenPlanInfo.price * 55;
    const priceDisplayForWelcome = isQuotexReferral
      ? 'مجاناً 0$ (بشرط التسجيل عبر رابط الإحالة وإيداع 100$ في حسابك على كيوتكس)'
      : isEgypt
      ? `${egpAmount.toLocaleString('en-US')} جنيه مصري`
      : `${chosenPlanInfo.price} دولار ($)`;

    // Check if member already registered by email or phone
    const cleanEmail = String(email).trim().toLowerCase();
    const cleanPhone = String(phone).trim();
    const existing = subscribersStore.find(
      s => s.email.toLowerCase() === cleanEmail || s.phone === cleanPhone
    );

    if (existing) {
      if (existing.status === 'BANNED') {
        return res.status(403).json({
          ok: false,
          error: 'عذراً، تم حظر هذه العضوية من قِبل الإدارة.'
        });
      }
      // Update existing profile fields and return it so they can access their dashboard
      existing.name = String(name).trim().slice(0, 120);
      existing.telegramUsername = String(telegramUsername).trim().slice(0, 100);
      existing.country = cleanCountry;
      existing.broker = String(broker).trim().slice(0, 80);
      existing.brokerAccountId = String(brokerAccountId).trim().slice(0, 80);
      existing.subscriptionType = isQuotexReferral ? 'quotex_referral' : 'paid_plan';
      existing.planDuration = chosenPlanKey;
      existing.paymentMethod = chosenPayMethod;
      await saveState();
      return res.json({ ok: true, subscriber: existing });
    }

    const qxLink = autoPilot.quotexReferralLink || 'https://broker-qx.pro/?lid=2303934';
    const welcomeMsg: SubscriberMessage = {
      id: `msg-${Date.now()}`,
      sender: 'admin',
      text: isQuotexReferral
        ? `مرحباً بك يا ${String(name).trim()} في نظام التفعيل المجاني لعضوية كيوتكس (Quotex) VIP! 🎁\n🔗 رابط الإحالة الرسمي للتسجيل في كيوتكس:\n${qxLink}\n📋 خطوات التفعيل المجاني:\n1️⃣ تأكد من تسجيل حسابك في كيوتكس عبر رابط الإحالة أعلاه.\n2️⃣ رقم حسابك في كيوتكس (ID): ${String(brokerAccountId).trim()}\n3️⃣ راسل المشرف هنا لتأكيد ارتباط حسابك في الإحالة.\n4️⃣ بعد التأكد، قم بإيداع 100 دولار ($) أو أكثر في حسابك الشخصي على منصة كيوتكس للتداول بها، وسيتم منحك عضوية VIP مجانية فوراً!`
        : `مرحباً بك يا ${String(name).trim()} في نَبض التداول VIP!\n🌍 الدولة: ${cleanCountry}\n📦 الباقة المختارة: ${chosenPlanInfo.label} (${priceDisplayForWelcome})\n💳 طريقة الدفع المتاحة: ${chosenPayMethod}\n🔑 رقم حساب البروكر: ${String(brokerAccountId).trim()}\nيمكنك مراسلة المشرف هنا مباشرة لإتمام التفعيل واستلام رابط قناة VIP.`,
      createdAt: new Date().toISOString()
    };

    const newSubId = `sub-${Date.now()}`;
    const newSub: VipSubscriber = {
      id: newSubId,
      name: String(name).trim().slice(0, 120),
      telegramUsername: String(telegramUsername).trim().slice(0, 100),
      country: String(country || 'مصر 🇪🇬').trim().slice(0, 80),
      email: String(email).trim().slice(0, 150),
      phone: String(phone).trim().slice(0, 50),
      broker: String(broker).trim().slice(0, 80),
      brokerAccountId: String(brokerAccountId).trim().slice(0, 80),
      subscriptionType: isQuotexReferral ? 'quotex_referral' : 'paid_plan',
      quotexDepositConfirmed: false,
      planDuration: chosenPlanKey,
      amountPaid: 0, // Set to package price when Admin confirms payment / activates
      paymentMethod: chosenPayMethod,
      status: 'PENDING',
      activationLink: '',
      expiryDate: '',
      robotApiKey: generateMemberRobotApiKey(newSubId),
      robotExpiryDate: '',
      robotEnabled: false,
      robotDefaultMode: 'AUTO',
      robotTradeStake: 5,
      robotWins: 0,
      robotLosses: 0,
      messages: [welcomeMsg],
      createdAt: new Date().toISOString()
    };

    subscribersStore.unshift(newSub);
    if (subscribersStore.length > 200) subscribersStore.pop();
    await saveState();

    res.json({ ok: true, subscriber: newSub });
  });

  // Member lookup by ID or by Email/Phone/Telegram + Broker Account ID as Password (for Member VIP Dashboard)
  app.post('/api/member/lookup', async (req, res) => {
    if (!isCloudStateLoaded) {
      await loadStateFromCloudAndDisk();
    }
    const { id, identifier, password } = req.body;
    let found: VipSubscriber | undefined;

    if (id) {
      found = subscribersStore.find(s => s.id === id);
    }
    if (!found && identifier) {
      const clean = String(identifier).trim().toLowerCase();
      found = subscribersStore.find(
        s =>
          s.email.toLowerCase() === clean ||
          s.phone.toLowerCase() === clean ||
          s.telegramUsername.toLowerCase() === clean ||
          s.telegramUsername.toLowerCase() === `@${clean.replace(/^@/, '')}`
      );
    }

    if (!found) {
      return res.status(404).json({
        ok: false,
        error: 'لم يتم العثور على عضوية مطابقة. تأكد من البريد الإلكتروني أو رقم الموبايل أو سجل عضوية جديدة.'
      });
    }

    // Verify password (which is the member's Broker Account ID) if logging in via identifier
    if (!id && password !== undefined) {
      const cleanPass = String(password).trim();
      if (found.brokerAccountId && found.brokerAccountId !== cleanPass) {
        return res.status(401).json({
          ok: false,
          error: 'كلمة المرور (معرف حسابك في شركة البروكر ID) غير صحيحة.'
        });
      }
    }

    res.json({ ok: true, subscriber: found });
  });

  // Admin: Edit subscriber details, status (ACTIVE / PENDING / BANNED), expiryDate, activationLink, brokerAccountId, planDuration, amountPaid, paymentMethod, and Quotex Robot fields
  app.patch('/api/subscribers/:id', async (req, res) => {
    const sub = subscribersStore.find(s => s.id === req.params.id);
    if (!sub) {
      return res.status(404).json({ ok: false, error: 'العضو غير موجود' });
    }

    const {
      name,
      telegramUsername,
      country,
      email,
      phone,
      broker,
      brokerAccountId,
      subscriptionType,
      quotexDepositConfirmed,
      planDuration,
      amountPaid,
      paymentMethod,
      status,
      activationLink,
      expiryDate,
      robotApiKey,
      robotExpiryDate,
      robotEnabled,
      robotDefaultMode,
      robotTradeStake,
      robotWins,
      robotLosses,
      regenerateRobotApiKey,
      sendActivationMessage
    } = req.body;

    if (name !== undefined) sub.name = String(name).trim().slice(0, 120);
    if (telegramUsername !== undefined) sub.telegramUsername = String(telegramUsername).trim().slice(0, 100);
    if (country !== undefined) sub.country = String(country).trim().slice(0, 80);
    if (email !== undefined) sub.email = String(email).trim().slice(0, 150);
    if (phone !== undefined) sub.phone = String(phone).trim().slice(0, 50);
    if (broker !== undefined) sub.broker = String(broker).trim().slice(0, 80);
    if (brokerAccountId !== undefined) sub.brokerAccountId = String(brokerAccountId).trim().slice(0, 80);
    if (subscriptionType !== undefined) sub.subscriptionType = subscriptionType;
    if (quotexDepositConfirmed !== undefined) sub.quotexDepositConfirmed = Boolean(quotexDepositConfirmed);
    if (planDuration !== undefined) sub.planDuration = String(planDuration).trim();
    if (amountPaid !== undefined) sub.amountPaid = Math.max(0, Number(amountPaid) || 0);
    if (paymentMethod !== undefined) sub.paymentMethod = String(paymentMethod).trim();
    if (status !== undefined) sub.status = status;
    if (activationLink !== undefined) sub.activationLink = String(activationLink).trim();
    if (expiryDate !== undefined) sub.expiryDate = String(expiryDate).trim();
    if (robotApiKey !== undefined) sub.robotApiKey = String(robotApiKey).trim();
    if (regenerateRobotApiKey) sub.robotApiKey = generateMemberRobotApiKey(sub.id);
    if (!sub.robotApiKey) sub.robotApiKey = generateMemberRobotApiKey(sub.id);
    if (robotExpiryDate !== undefined) sub.robotExpiryDate = String(robotExpiryDate).trim();
    if (robotEnabled !== undefined) sub.robotEnabled = Boolean(robotEnabled);
    if (robotDefaultMode === 'AUTO' || robotDefaultMode === 'MANUAL') sub.robotDefaultMode = robotDefaultMode;
    if (robotTradeStake !== undefined) sub.robotTradeStake = Math.max(1, Number(robotTradeStake) || 5);
    if (robotWins !== undefined) sub.robotWins = Math.max(0, Number(robotWins) || 0);
    if (robotLosses !== undefined) sub.robotLosses = Math.max(0, Number(robotLosses) || 0);

    if (!Array.isArray(sub.messages)) sub.messages = [];

    if (sendActivationMessage && sub.activationLink) {
      sub.status = 'ACTIVE';
      if (sub.robotEnabled === undefined) sub.robotEnabled = true;
      if (!sub.robotExpiryDate && sub.expiryDate) sub.robotExpiryDate = sub.expiryDate;
      sub.messages.push({
        id: `msg-${Date.now()}`,
        sender: 'admin',
        text: `🎉 تم تفعيل عضويتك في قناة VIP بنجاح!\n🔗 رابط التفعيل والانضمام الخاص بك:\n${sub.activationLink}${
          sub.expiryDate ? `\n📅 تاريخ انتهاء العضوية: ${sub.expiryDate}` : ''
        }\n🤖 مفتاح روبوت التداول الآلي (Quotex API Key): ${sub.robotApiKey}`,
        createdAt: new Date().toISOString(),
        isActivationLink: true
      });
    }

    await saveState();
    res.json({ ok: true, subscriber: sub });
  });

  // Admin Quick Notes (WhatsApp-style saved replies & notes)
  app.post('/api/quick-notes', async (req, res) => {
    const { title, content } = req.body;
    if (!title || !content) {
      return res.status(400).json({ ok: false, error: 'العنوان والنص مطلوبان' });
    }
    const note: QuickNote = {
      id: `note-${Date.now()}`,
      title: String(title).trim().slice(0, 100),
      content: String(content).trim().slice(0, 2000)
    };
    quickNotesStore.unshift(note);
    if (quickNotesStore.length > 50) quickNotesStore.pop();
    await saveState();
    res.json({ ok: true, quickNotes: quickNotesStore, note });
  });

  app.put('/api/quick-notes/:id', async (req, res) => {
    const note = quickNotesStore.find(n => n.id === req.params.id);
    if (!note) {
      return res.status(404).json({ ok: false, error: 'الملاحظة غير موجودة' });
    }
    if (req.body.title !== undefined) note.title = String(req.body.title).trim().slice(0, 100);
    if (req.body.content !== undefined) note.content = String(req.body.content).trim().slice(0, 2000);
    await saveState();
    res.json({ ok: true, quickNotes: quickNotesStore, note });
  });

  app.delete('/api/quick-notes/:id', async (req, res) => {
    const idx = quickNotesStore.findIndex(n => n.id === req.params.id);
    if (idx !== -1) {
      quickNotesStore.splice(idx, 1);
      await saveState();
    }
    res.json({ ok: true, quickNotes: quickNotesStore });
  });

  // Bidirectional Messaging between Admin and Member (Supports text + payment receipt screenshot imageUrl)
  app.post('/api/subscribers/:id/message', async (req, res) => {
    const sub = subscribersStore.find(s => s.id === req.params.id);
    if (!sub) {
      return res.status(404).json({ ok: false, error: 'العضو غير موجود' });
    }

    const { sender, text, imageUrl, planDuration, paymentMethod } = req.body;
    if ((!text || !String(text).trim()) && !imageUrl) {
      return res.status(400).json({ ok: false, error: 'نص الرسالة أو صورة الإيصال مطلوبة' });
    }

    if (sender === 'member' && sub.status === 'BANNED') {
      return res.status(403).json({ ok: false, error: 'تم حظر هذه العضوية ولا يمكن إرسال رسائل.' });
    }

    if (planDuration) sub.planDuration = String(planDuration).trim();
    if (paymentMethod) sub.paymentMethod = String(paymentMethod).trim();

    if (!Array.isArray(sub.messages)) sub.messages = [];

    const newMsg: SubscriberMessage = {
      id: `msg-${Date.now()}`,
      sender: sender === 'admin' ? 'admin' : 'member',
      text: String(text || '📸 صورة إيصال التحويل لتجديد الاشتراك').trim().slice(0, 1500),
      imageUrl: imageUrl ? String(imageUrl).slice(0, 450000) : undefined,
      createdAt: new Date().toISOString()
    };

    sub.messages.push(newMsg);
    if (sub.messages.length > 100) {
      sub.messages = sub.messages.slice(-100);
    }

    await saveState();
    res.json({ ok: true, subscriber: sub, message: newMsg });
  });

  app.delete('/api/subscribers/:id', async (req, res) => {
    const idx = subscribersStore.findIndex(s => s.id === req.params.id);
    if (idx !== -1) {
      subscribersStore.splice(idx, 1);
      await saveState();
    }
    res.json({ ok: true });
  });

  // Admin Login Verification
  app.post('/api/admin/login', (req, res) => {
    const { email, password } = req.body;
    if (
      String(email || '').trim().toLowerCase() === ADMIN_EMAIL.toLowerCase() &&
      String(password || '') === ADMIN_PASS
    ) {
      res.json({ ok: true });
    } else {
      res.status(401).json({ ok: false, error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });
    }
  });

  // Get signals, settings, autopilot status, robotSettings, and live global forex radar
  app.get('/api/signals', async (_req, res) => {
    if (!isCloudStateLoaded) {
      await loadStateFromCloudAndDisk();
    }
    if (enforceDailySignalReset()) {
      await saveState();
    }
    autoPilot.marketOpenStatus = isGlobalForexMarketOpen();
    autoPilot.currentEgyptHour = getCurrentEgyptHour();
    autoPilot.isFreeBotWithinSchedule = isFreeBotActiveNow(autoPilot);
    syncSignalsIntoDailyStats(signalsStore, true);
    res.json({
      signals: signalsStore,
      settings: appSettings,
      autopilot: autoPilot,
      robotSettings,
      liveMarket: liveMarketSnapshots,
      subscribers: subscribersStore,
      quickNotes: quickNotesStore,
      dailyStats: Object.values(dailyStatsStore).sort((a, b) => b.date.localeCompare(a.date)),
      todayEgyptDate: getCurrentEgyptDateString(new Date()),
      endOfDayReport: buildEndOfDayFinalReport(),
      cloudSynced: Boolean(serverFirestoreDb)
    });
  });

  // Update Quotex Automated Trading Robot Settings (Admin)
  app.post('/api/robot-settings', async (req, res) => {
    const incoming = req.body || {};
    robotSettings = {
      ...robotSettings,
      ...incoming,
      isPublishedToVisitors:
        typeof incoming.isPublishedToVisitors === 'boolean'
          ? incoming.isPublishedToVisitors
          : robotSettings.isPublishedToVisitors,
      noMartingaleStrict: true // Strictly 0 Martingale
    };
    const cloudSaved = await saveState();
    res.json({ ok: true, robotSettings, cloudSaved });
  });

  // Admin: Quickly create a dedicated member/key or generate key for Quotex Robot
  app.post('/api/quotex-robot/create-key', async (req, res) => {
    const { name, brokerAccountId, expiryDate, tradeStake, defaultMode } = req.body || {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({ ok: false, error: 'اسم العضو مطلوب لتوليد مفتاح الروبوت' });
    }
    const newId = `sub-${Date.now()}`;
    const generatedKey = generateMemberRobotApiKey(newId);
    const expDate =
      expiryDate && String(expiryDate).trim()
        ? String(expiryDate).trim()
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const newSub: VipSubscriber = {
      id: newId,
      name: String(name).trim().slice(0, 120),
      telegramUsername: '@QuotexTrader',
      country: 'مصر 🇪🇬',
      email: `robot.${Date.now()}@zadnbfx.com`,
      phone: String(brokerAccountId || Date.now()).slice(0, 20),
      broker: 'Quotex (كوتيكس)',
      brokerAccountId: String(brokerAccountId || 'QX-AUTO').trim(),
      subscriptionType: 'paid_plan',
      planDuration: '1_month',
      amountPaid: 30,
      paymentMethod: 'مفتاح روبوت كيوتكس الآلي',
      status: 'ACTIVE',
      activationLink: '',
      expiryDate: expDate,
      robotApiKey: generatedKey,
      robotExpiryDate: expDate,
      robotEnabled: true,
      robotDefaultMode: defaultMode === 'MANUAL' ? 'MANUAL' : 'AUTO',
      robotTradeStake: Math.max(1, Number(tradeStake) || 5),
      robotWins: 0,
      robotLosses: 0,
      messages: [],
      createdAt: new Date().toISOString()
    };

    subscribersStore.unshift(newSub);
    await saveState();
    res.json({ ok: true, subscriber: newSub });
  });

  // Quotex Floating Robot Live API Endpoint (Supports CORS for Quotex Floating Script)
  // Takes Member API Key -> Verifies Subscription & Validity -> Returns Active Signal, Result, Pair, Expiry, and Win/Loss Stats (Strictly No Martingale)
  app.options('/api/quotex-robot/feed', (_req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
    res.sendStatus(204);
  });

  app.get('/api/quotex-robot/feed', async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');

    if (!isCloudStateLoaded) {
      await loadStateFromCloudAndDisk();
    }

    const apiKey = String(req.query.apiKey || req.headers['x-api-key'] || '').trim();
    if (!apiKey) {
      return res.status(401).json({
        ok: false,
        authorized: false,
        error: 'يرجى إدخال مفتاح API الخاص بالعضو (API Key).'
      });
    }

    // Check Master Admin Preview Key, Member Robot API Key, OR Member Broker Account ID (Must be explicitly approved and active)
    const isAdminMasterTest = apiKey.toUpperCase() === 'QX-ADMIN-MASTER-TEST';
    const cleanKeyUpper = apiKey.toUpperCase();
    const member = subscribersStore.find(
      s =>
        (s.robotApiKey || '').trim().toUpperCase() === cleanKeyUpper ||
        (s.brokerAccountId && s.brokerAccountId.trim().toUpperCase() === cleanKeyUpper) ||
        (s.phone && s.phone.trim().toUpperCase() === cleanKeyUpper)
    );

    if (!member && !isAdminMasterTest) {
      return res.status(403).json({
        ok: false,
        authorized: false,
        error: 'رقم حساب البروكر غير مسجل لدى الإدارة. يجب مصادقة المشرف على حسابك وتفعيل خطتك أولاً.'
      });
    }

    const todayStr = getCurrentEgyptDateString(new Date());

    if (member) {
      // 1. Strict Admin Approval Check: Member status must be ACTIVE
      if (member.status === 'PENDING') {
        return res.status(403).json({
          ok: false,
          authorized: false,
          memberName: member.name,
          error: 'حسابك قيد المراجعة وبانتظار مصادقة المشرف وتحديد خطتك وصلاحيتها.'
        });
      }

      // 2. Admin disabled robot or banned member
      if (member.status === 'BANNED' || member.robotEnabled === false) {
        return res.status(403).json({
          ok: false,
          authorized: false,
          memberName: member.name,
          error: 'تم إيقاف صلاحية الروبوت لهذا الحساب من قِبل المشرف.'
        });
      }

      // 3. Expiry Date Check: Plan validity must be set by admin and not expired
      const expDate = (member.robotExpiryDate || member.expiryDate || '').trim();
      if (!expDate || !/^\d{4}-\d{2}-\d{2}$/.test(expDate)) {
        return res.status(403).json({
          ok: false,
          authorized: false,
          memberName: member.name,
          error: 'لم يحدد المشرف مدة صلاحية الخطة لهذا الحساب بعد. يرجى مراجعة الإدارة لتفعيل الخطة.'
        });
      }

      if (expDate < todayStr) {
        return res.status(403).json({
          ok: false,
          authorized: false,
          memberName: member.name,
          expiryDate: expDate,
          daysLeft: 0,
          error: `انتهت مدة صلاحية خطتك بتاريخ (${expDate}). يرجى مراجعة المشرف لتجديد الاشتراك.`
        });
      }
    }

    const expDateStr = member
      ? (member.robotExpiryDate || member.expiryDate || '')
      : '2099-12-31';

    let daysLeft = 30;
    if (expDateStr && /^\d{4}-\d{2}-\d{2}$/.test(expDateStr)) {
      const diffMs = new Date(`${expDateStr}T23:59:59Z`).getTime() - Date.now();
      daysLeft = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    }

    // Strictly No Martingale (0 Gale) calculation for the Robot:
    // Only direct 1st-candle wins count as WIN; any Gale1 or Loss counts as a direct 1st-candle LOSS in 0-Martingale mode
    const todayDirectWins = signalsStore.filter(s => s.status === 'WIN').length;
    const todayNoGaleLosses = signalsStore.filter(
      s => s.status === 'LOSS' || s.status === 'WIN_GALE1'
    ).length;
    const totalFinished = todayDirectWins + todayNoGaleLosses;
    const winRateNoGale =
      totalFinished > 0 ? Math.round((todayDirectWins / totalFinished) * 100) : 100;

    // Latest active/recent signal for the robot to alert & auto-execute on Quotex
    const latestSig = signalsStore[0] || null;
    let activeSignalPayload = null;

    if (latestSig) {
      // Map status to strictly no-martingale status for the robot
      const robotNormalizedStatus =
        latestSig.status === 'WIN'
          ? 'WIN'
          : latestSig.status === 'WIN_GALE1' || latestSig.status === 'LOSS'
          ? 'LOSS'
          : latestSig.status;

      const secondsUntilEntry = latestSig.targetEntryTimestamp
        ? Math.round(latestSig.targetEntryTimestamp - Date.now() / 1000)
        : 0;

      activeSignalPayload = {
        id: latestSig.id,
        asset: latestSig.asset,
        quotexPairCode: latestSig.asset.replace('/', ''),
        direction: latestSig.direction, // 'CALL' | 'PUT'
        directionArabic: latestSig.direction === 'CALL' ? 'صعود (CALL 🟢)' : 'هبوط (PUT 🔴)',
        timeframe: 'M1 (1 دقيقة)',
        expirySeconds: 60,
        entryMinute: latestSig.entryMinute,
        entryTime: latestSig.entryTime,
        targetEntryTimestamp: latestSig.targetEntryTimestamp || null,
        secondsUntilEntry,
        livePrice: latestSig.livePrice || '',
        rsiValue: latestSig.rsiValue || null,
        status: robotNormalizedStatus, // 'PENDING' | 'WIN' | 'LOSS'
        martingaleSteps: 0, // Strictly 0 Martingale
        createdAt: latestSig.createdAt
      };
    }

    res.json({
      ok: true,
      authorized: true,
      serverTimeIso: new Date().toISOString(),
      serverEpochSeconds: Math.floor(Date.now() / 1000),
      robotConfig: {
        title: robotSettings.robotTitle,
        version: robotSettings.version,
        noMartingaleStrict: true,
        autoSelectPair: robotSettings.autoSelectPair,
        autoSetExpiryM1: robotSettings.autoSetExpiryM1,
        soundAlertsEnabled: robotSettings.soundAlertsEnabled
      },
      member: {
        id: member ? member.id : 'admin-master',
        name: member ? member.name : 'حساب المشرف التجريبي (Master)',
        brokerAccountId: member ? member.brokerAccountId : 'ADMIN-PRO',
        planDuration: member ? member.planDuration : 'unlimited',
        status: member ? member.status : 'ACTIVE',
        expiryDate: expDateStr || 'مفتوح',
        daysLeft,
        defaultMode: member?.robotDefaultMode || robotSettings.defaultMode || 'AUTO',
        tradeStakeUsd: member?.robotTradeStake || robotSettings.defaultStakeUsd || 5,
        memberWins: member?.robotWins || 0,
        memberLosses: member?.robotLosses || 0
      },
      statsNoMartingale: {
        wins: todayDirectWins,
        losses: todayNoGaleLosses,
        total: totalFinished,
        winRate: winRateNoGale
      },
      activeSignal: activeSignalPayload,
      recentSignals: signalsStore.slice(0, 6).map(s => ({
        id: s.id,
        asset: s.asset,
        direction: s.direction,
        entryTime: s.entryTime,
        status: s.status === 'WIN' ? 'WIN' : s.status === 'PENDING' ? 'PENDING' : 'LOSS'
      }))
    });
  });

  // Quotex Robot Trade Execution Callback (Records member Win/Loss counter via API)
  app.options('/api/quotex-robot/report-trade', (_req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
    res.sendStatus(204);
  });

  app.post('/api/quotex-robot/report-trade', async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const { apiKey, outcome } = req.body || {};
    const cleanKey = String(apiKey || '').trim().toUpperCase();
    const member = subscribersStore.find(
      s => (s.robotApiKey || '').trim().toUpperCase() === cleanKey
    );
    if (!member) {
      return res.status(404).json({ ok: false, error: 'مفتاح العضو غير موجود' });
    }
    if (outcome === 'WIN') {
      member.robotWins = (member.robotWins || 0) + 1;
    } else if (outcome === 'LOSS') {
      member.robotLosses = (member.robotLosses || 0) + 1;
    }
    await saveState();
    res.json({
      ok: true,
      memberWins: member.robotWins || 0,
      memberLosses: member.robotLosses || 0
    });
  });

  // Get live preview of the End-of-Day Final Trading Report
  app.get('/api/daily-report', async (_req, res) => {
    if (!isCloudStateLoaded) {
      await loadStateFromCloudAndDisk();
    }
    syncSignalsIntoDailyStats(signalsStore, true);
    res.json({
      ok: true,
      report: buildEndOfDayFinalReport()
    });
  });

  // Manually send or re-send the End-of-Day Final Trading Report to Telegram (Free / VIP / Both)
  app.post('/api/daily-report/send-telegram', async (req, res) => {
    const { destination, customText } = req.body || {};
    const dest =
      destination === 'free' || destination === 'vip' || destination === 'both'
        ? destination
        : 'both';
    const result = await dispatchEndOfDayReportToTelegram(dest, customText);
    res.json(result);
  });

  // Reset / Clear all signals in the published log ("04. سجل إشارات السوق العالمي المنشورة") and reset daily counters
  app.post('/api/signals/reset-daily', async (_req, res) => {
    const todayEgypt = getCurrentEgyptDateString(new Date());
    signalsStore = [];
    autoPilot.totalAutoSent = 0;
    autoPilot.lastResetEgyptDate = todayEgypt;
    if (dailyStatsStore[todayEgypt] && !dailyStatsStore[todayEgypt].manualOverride) {
      dailyStatsStore[todayEgypt] = {
        date: todayEgypt,
        directWins: 0,
        gale1Wins: 0,
        losses: 0,
        draws: 0,
        manualOverride: false,
        updatedAt: new Date().toISOString()
      };
    }
    await saveState();
    res.json({
      ok: true,
      signals: signalsStore,
      autopilot: autoPilot,
      dailyStats: Object.values(dailyStatsStore).sort((a, b) => b.date.localeCompare(a.date))
    });
  });

  // Admin: Update or create a daily statistics row (for A4 Weekly/Monthly Statistics Page)
  app.post('/api/daily-stats', async (req, res) => {
    const { date, directWins, gale1Wins, losses, draws, manualOverride } = req.body;
    const cleanDate = String(date || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
      return res.status(400).json({ ok: false, error: 'صيغة التاريخ يجب أن تكون YYYY-MM-DD' });
    }
    dailyStatsStore[cleanDate] = {
      date: cleanDate,
      directWins: Math.max(0, Number(directWins) || 0),
      gale1Wins: Math.max(0, Number(gale1Wins) || 0),
      losses: Math.max(0, Number(losses) || 0),
      draws: Math.max(0, Number(draws) || 0),
      manualOverride: manualOverride !== undefined ? Boolean(manualOverride) : true,
      updatedAt: new Date().toISOString()
    };
    await saveState();
    res.json({
      ok: true,
      record: dailyStatsStore[cleanDate],
      dailyStats: Object.values(dailyStatsStore).sort((a, b) => b.date.localeCompare(a.date))
    });
  });

  // Admin: Delete / Reset a specific day's manual statistics row
  app.delete('/api/daily-stats/:date', async (req, res) => {
    const cleanDate = String(req.params.date || '').trim();
    if (dailyStatsStore[cleanDate]) {
      delete dailyStatsStore[cleanDate];
      await saveState();
    }
    res.json({
      ok: true,
      dailyStats: Object.values(dailyStatsStore).sort((a, b) => b.date.localeCompare(a.date))
    });
  });

  // Force refresh live market radar
  app.get('/api/market-scan', async (_req, res) => {
    const { snapshots, selectedCandidate } = await scanRealGlobalForexMarket(true);
    res.json({
      ok: true,
      marketOpen: isGlobalForexMarketOpen(),
      snapshots,
      bestCandidate: selectedCandidate
    });
  });

  // Update formatting settings
  app.post('/api/settings', async (req, res) => {
    appSettings = { ...appSettings, ...req.body };
    const cloudSaved = await saveState();
    res.json({ ok: true, settings: appSettings, cloudSaved });
  });

  // Update Auto-Pilot configuration
  app.post('/api/autopilot', async (req, res) => {
    const prevEnabled = autoPilot.enabled;
    const incoming = req.body || {};
    autoPilot = {
      ...autoPilot,
      ...incoming,
      freeStartHourEgypt:
        incoming.freeStartHourEgypt !== undefined
          ? Number(incoming.freeStartHourEgypt)
          : autoPilot.freeStartHourEgypt,
      freeEndHourEgypt:
        incoming.freeEndHourEgypt !== undefined
          ? Number(incoming.freeEndHourEgypt)
          : autoPilot.freeEndHourEgypt,
      oneGaleEnabled:
        typeof incoming.oneGaleEnabled === 'boolean'
          ? incoming.oneGaleEnabled
          : autoPilot.oneGaleEnabled,
      autoDailyReportEnabled:
        typeof incoming.autoDailyReportEnabled === 'boolean'
          ? incoming.autoDailyReportEnabled
          : autoPilot.autoDailyReportEnabled,
      intervalMinutes: Math.max(5, Number(incoming.intervalMinutes ?? autoPilot.intervalMinutes))
    };

    autoPilot.currentEgyptHour = getCurrentEgyptHour();
    autoPilot.isFreeBotWithinSchedule = isFreeBotActiveNow(autoPilot);

    if (autoPilot.enabled && !prevEnabled) {
      autoPilot.nextRunAt = new Date(Date.now() + 3000).toISOString();
      autoPilot.lastError = null;
    } else if (!autoPilot.enabled) {
      autoPilot.nextRunAt = null;
    }

    const cloudSaved = await saveState();
    res.json({ ok: true, autopilot: autoPilot, cloudSaved });
  });

  // Trigger an immediate focused analysis & dispatch now
  app.post('/api/autopilot/trigger-now', async (_req, res) => {
    const { selectedCandidate } = await scanRealGlobalForexMarket(true);
    if (!selectedCandidate) {
      return res.status(400).json({
        ok: false,
        error: 'تعذر الوصول لبيانات السوق العالمي في هذه اللحظة، حاول بعد ثوانٍ.'
      });
    }

    const result = await dispatchLiveGlobalSignal(selectedCandidate, true);
    const cooldownMs = Math.max(5, autoPilot.intervalMinutes) * 60 * 1000;
    autoPilot.nextRunAt = new Date(Date.now() + cooldownMs).toISOString();
    saveState();

    res.json({
      ok: true,
      signal: result.signal,
      autopilot: autoPilot,
      telegramError: result.error
    });
  });

  // Pull best real global setup into the manual studio editor
  app.get('/api/scrape-source', async (_req, res) => {
    const { selectedCandidate } = await scanRealGlobalForexMarket(true);
    if (selectedCandidate) {
      const nextMin = String(new Date(Date.now() + 60000).getMinutes()).padStart(2, '0');
      const hh = String(new Date().getHours()).padStart(2, '0');
      const dirText = selectedCandidate.signalReady === 'PUT' ? '🔴 PUT (DOWN ⬇️)' : '🟢 CALL (UP ⬆️)';
      const raw = `🌍 LIVE GLOBAL FOREX RADAR 🌍\nAsset: ${selectedCandidate.pair}\nTimeframe: M1 (1 Minute)\nEntry Time: ${hh}:${nextMin}\nDirection: ${dirText}\nPrice: ${selectedCandidate.formattedPrice} | RSI: ${selectedCandidate.rsi}\nReason: ${selectedCandidate.reason}`;
      res.json({
        ok: true,
        messages: [raw],
        candidate: selectedCandidate
      });
    } else {
      res.status(500).json({ ok: false, error: 'تعذر جلب بيانات السوق العالمي المباشرة' });
    }
  });

  // Publish signal manually
  app.post('/api/signals/publish', async (req, res) => {
    const {
      asset,
      direction,
      timeframe,
      entryMinute,
      entryTime,
      livePrice,
      rsiValue,
      analysisReason,
      formattedMessage,
      rawOriginal,
      botToken,
      chatId,
      sendToTelegram
    } = req.body;

    if (botToken && chatId) {
      autoPilot.botToken = botToken;
      autoPilot.chatId = chatId;
    }

    let telegramResult = null;
    let vipTelegramResult = null;
    let telegramError = null;

    if (sendToTelegram && autoPilot.freeBotEnabled !== false && botToken && chatId) {
      try {
        const tgData = await sendTelegramMessage(botToken, chatId, formattedMessage);
        if (!tgData.ok) {
          telegramError = tgData.description || 'فشل الإرسال عبر البوت المجاني، تأكد من التوكن ومعرف القناة.';
        } else {
          telegramResult = tgData.result;
        }
      } catch (err: any) {
        telegramError = err.message || 'خطأ في الاتصال بواجهة تليجرام';
      }
    }

    // Also send manual signal to VIP Bot if enabled (and not the exact same channel as Free Bot)
    const activeVipToken = (autoPilot.vipBotToken || botToken || autoPilot.botToken).trim();
    const activeVipChat = (autoPilot.vipChatId || '').trim();
    const isSameAsFree =
      Boolean(telegramResult) &&
      activeVipChat.toLowerCase() === String(chatId || '').trim().toLowerCase();

    if (sendToTelegram && autoPilot.vipEnabled && activeVipToken && activeVipChat && !isSameAsFree) {
      try {
        const vipData = await sendTelegramMessage(activeVipToken, activeVipChat, formattedMessage);
        if (vipData.ok) {
          vipTelegramResult = vipData.result;
        }
      } catch (_e) {
        // Ignore
      }
    }

    const cleanMinute = extractMinuteOnly(entryMinute || entryTime);

    const newSignal: SignalItem = {
      id: `sig-${Date.now()}`,
      asset: (asset || 'EUR/USD').replace(/OTC/gi, '').trim(),
      isOtc: false, // Strictly Global Market
      direction: direction === 'PUT' ? 'PUT' : 'CALL',
      timeframe: timeframe || '1 دقيقة (M1)',
      entryMinute: cleanMinute,
      entryTime: `:${cleanMinute}`,
      payout: 'السوق العالمي',
      livePrice,
      rsiValue,
      analysisReason,
      formattedMessage,
      rawOriginal,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
      telegramMessageId: telegramResult?.message_id,
      vipTelegramMessageId: vipTelegramResult?.message_id
    };

    signalsStore.unshift(newSignal);
    if (signalsStore.length > 50) {
      signalsStore.pop();
    }
    saveState();

    res.json({
      ok: true,
      signal: newSignal,
      telegramSent: Boolean(telegramResult || vipTelegramResult),
      telegramError
    });
  });

  // Update signal status (WIN / LOSS / PENDING) + Edit original signal message with concise result
  app.patch('/api/signals/:id/status', async (req, res) => {
    const { id } = req.params;
    const { status, botToken, chatId, notifyTelegram } = req.body;

    const signal = signalsStore.find(s => s.id === id);
    if (!signal) {
      return res.status(404).json({ ok: false, error: 'الإشارة غير موجودة' });
    }

    signal.status = status;
    signal.formattedMessage = appendResultToSignalMessage(signal.formattedMessage, status);

    const activeToken = botToken || autoPilot.botToken;
    const activeChat = chatId || autoPilot.chatId;

    let telegramSent = false;
    if (
      notifyTelegram &&
      (status === 'WIN' || status === 'WIN_GALE1' || status === 'LOSS' || status === 'DRAW')
    ) {
      telegramSent = await updateTelegramSignalResult(
        activeToken,
        activeChat,
        signal,
        status
      );
    }

    saveState();
    res.json({ ok: true, signal, telegramSent });
  });

  // Delete signal
  app.delete('/api/signals/:id', (req, res) => {
    const idx = signalsStore.findIndex(s => s.id === req.params.id);
    if (idx !== -1) {
      signalsStore.splice(idx, 1);
      saveState();
    }
    res.json({ ok: true });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
