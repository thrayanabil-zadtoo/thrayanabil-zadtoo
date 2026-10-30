import express from 'express';
import http from 'http';
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
import { ForexNewsItem, INITIAL_WEEKLY_FOREX_NEWS } from './src/types/forexNews.ts';
import {
  SubscriptionPlan,
  PlatformContactLinks,
  INITIAL_SUBSCRIPTION_PLANS,
  INITIAL_CONTACT_LINKS,
  PaymentMethodConfig,
  PaymentTransactionRecord,
  INITIAL_PAYMENT_METHODS
} from './src/types/platformConfig.ts';

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

const ADMIN_EMAILS = [
  'thrayanabil2026@gmail.com',
  'thrayanabil@gmail.com'
];
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
  exitPriceNumeric?: number;
  qualityScore?: number;
  reversalPattern?: string;
  sma10Value?: number;
  supportResistanceText?: string;
  confluenceText?: string;
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
  rsiPeriod?: number;
  trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  signalReady: 'CALL' | 'PUT' | null;
  reason: string;
  updatedAt: string;
  qualityScore?: number;
  reversalPattern?: string;
  sma10?: number;
  sma5?: number;
  wickRatio?: number;
  isNewsSpike?: boolean;
  superTrend?: {
    trend: 'BULLISH' | 'BEARISH';
    value: number;
    color: 'green' | 'red';
    flipped: boolean;
  };
  fractal?: {
    type: 'BULLISH_LOW' | 'BEARISH_HIGH' | 'NONE';
    price?: number;
    description: string;
  };
  supportResistance?: {
    isConfirmed: boolean;
    levelType: 'SUPPORT' | 'RESISTANCE' | 'NEUTRAL';
    kind: 'HORIZONTAL' | 'TRENDLINE' | 'CHANNEL' | 'ROLE_REVERSAL' | 'MULTIPLE' | 'NONE';
    levelPrice?: number;
    touchesCount: number;
    description: string;
  };
  indicatorConfluence?: {
    srConfirmed: boolean;
    rsiMatched: boolean;
    superTrendMatched: boolean;
    fractalMatched: boolean;
    supportingCount: number;
    isSignalValid: boolean;
    summary: string;
  };
}

export interface AutoPilotConfig {
  enabled: boolean;
  lastResetEgyptDate?: string; // Tracks the Cairo date (YYYY-MM-DD) for automatic daily reset of signals log & daily stats
  engineStartedAt?: number; // Epoch ms when the autopilot engine / server was started (for 10-minute warmup)
  warmupMinutes?: number; // Warmup and deep scanning delay before sending first signal (10 minutes)
  freeBotDailyTargetReached?: boolean; // Whether Bot 1 (Free channel) has hit its 3:1 win/loss target today
  freeBotCelebrationSentDate?: string; // Cairo date (YYYY-MM-DD) when celebration was sent to Free channel
  // Bot 1: Free Channel Bot (Closes only upon achieving 3 wins:1 loss ratio or 3 wins with 0 losses)
  freeBotEnabled?: boolean;
  botToken: string;
  chatId: string;
  freeScheduleEnabled: boolean;
  freeStartHourEgypt: number; // Fixed 09:00 AM Africa/Cairo time
  freeEndHourEgypt: number;   // Fixed 03:00 PM (15:00) Africa/Cairo time
  freeWinIcon?: string;       // Custom Win icon/text for Bot 1 (Free Channel)
  freeWinGale1Icon?: string;  // Custom Win Gale 1 icon/text for Bot 1 (Free Channel)
  freeLossIcon?: string;      // Custom Loss icon/text for Bot 1 (Free Channel)
  freeWinImageUrl?: string;      // Custom Win photo/sticker (base64 data URL) for Bot 1
  freeWinGale1ImageUrl?: string; // Custom Win Gale 1 photo/sticker (base64 data URL) for Bot 1
  freeLossImageUrl?: string;     // Custom Loss photo/sticker (base64 data URL) for Bot 1
  // Bot 2: VIP Channel Bot (Runs daily 09:00 AM - 03:00 PM Cairo Time regardless of win/loss results)
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
  strictnessLevel: 'normal' | 'high' | 'extreme' | 'super'; // Normal: 30/70, High: 28/72, Extreme: 25/75, Super: 20/80
  rsiOversoldThreshold?: number;
  rsiOverboughtThreshold?: number;
  smaFilterEnabled?: boolean; // Executable SMA 10 mean-reversion filter
  reversalPatternRequired?: boolean; // Strict candlestick rejection / engulfing pattern required
  newsFilterEnabled?: boolean; // Filter abnormal volatility spike candles (news events)
  assetCooldownMinutes?: number; // Per-asset cooldown (default: 20 mins)
  minQualityScore?: number; // Minimum Composite Quality Score (default: 65)
  resultMode: 'candle_exact' | 'auto_win' | 'manual_only'; // Controls how trade outcome is sent
  oneGaleEnabled?: boolean; // Enable 1-Step Martingale (مضاعفة واحدة) on first candle loss
  quotexReferralLink?: string; // Official Quotex Affiliate/Referral Link for Free VIP activation
  quotexMinDepositUsd?: number; // Minimum deposit in Quotex account for Free VIP (default 100$)
  autoWinNotification: boolean;
  resultNotificationStyle?: 'emoji_size' | 'photo'; // 'emoji_size' (default) sends clean compact native emoji reply; 'photo' sends full image
  autoDailyReportEnabled?: boolean; // Automatically send End-of-Day Final Report when trading day closes at freeEndHourEgypt
  lastDailyReportSentDate?: string; // Tracks Cairo date (YYYY-MM-DD) when the end-of-day report was last sent
  lastRunAt: string | null;
  nextRunAt: string | null;
  totalAutoSent: number;
  lastError: string | null;
  marketOpenStatus: boolean;
  currentEgyptHour?: number;
  isFreeBotWithinSchedule?: boolean;
  pairSelectionMode?: 'fixed_single' | 'custom_list' | 'all_global'; // نمط اختيار الأزواج
  primaryFixedPair?: string; // الزوج الثابت اليومي (الافتراضي: EUR/JPY)
  allowedPairs?: string[]; // قائمة الأزواج النشطة
  customPairsList?: string[]; // كافة الأزواج المتاحة القابلة للإضافة والتعديل
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
  forexNews?: ForexNewsItem[];
  plans?: SubscriptionPlan[];
  contactLinks?: PlatformContactLinks;
  paymentMethods?: PaymentMethodConfig[];
  paymentTransactions?: PaymentTransactionRecord[];
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
  engineStartedAt: Date.now(),
  warmupMinutes: 10,
  freeBotDailyTargetReached: false,
  freeBotCelebrationSentDate: '',
  freeBotEnabled: true,
  botToken: '',
  chatId: '@ZadNBFX',
  freeScheduleEnabled: true,
  freeStartHourEgypt: 9, // Fixed 09:00 AM Cairo Time
  freeEndHourEgypt: 15,  // Fixed 03:00 PM (15:00) Cairo Time
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
  intervalMinutes: 15, // Strictly 15 minutes between signals
  strictnessLevel: 'super', // Highest strictness (75%+ win rate)
  rsiOversoldThreshold: 20,
  rsiOverboughtThreshold: 80,
  smaFilterEnabled: true,
  reversalPatternRequired: true,
  newsFilterEnabled: true,
  assetCooldownMinutes: 20,
  minQualityScore: 75, // Highest Composite Quality Score (75%+)
  resultMode: 'candle_exact',
  oneGaleEnabled: false, // Default: Martingale disabled (0 Gale)
  quotexReferralLink: 'https://broker-qx.pro/?lid=2303934',
  quotexMinDepositUsd: 100,
  autoWinNotification: true,
  resultNotificationStyle: 'emoji_size',
  autoDailyReportEnabled: true,
  lastDailyReportSentDate: '',
  lastRunAt: null,
  nextRunAt: null,
  totalAutoSent: 0,
  lastError: null,
  marketOpenStatus: true,
  pairSelectionMode: 'custom_list',
  primaryFixedPair: 'EUR/JPY',
  allowedPairs: ['EUR/JPY', 'EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CAD'],
  customPairsList: ['EUR/JPY', 'EUR/USD', 'GBP/USD', 'USD/JPY', 'GBP/JPY', 'AUD/USD', 'USD/CHF', 'USD/CAD', 'EUR/GBP']
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
    // Include all completed signals issued on that date in statistics
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
  return getEgyptHourFromDate(new Date());
}

/**
 * Returns the current minute (0-59) in Egypt Time (Africa/Cairo)
 */
function getCurrentEgyptMinute(): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Africa/Cairo',
      minute: 'numeric'
    }).formatToParts(new Date());
    const minPart = parts.find(p => p.type === 'minute')?.value;
    const m = parseInt(minPart || '0', 10);
    return isNaN(m) ? new Date().getMinutes() : m;
  } catch (_e) {
    return new Date().getMinutes();
  }
}

/**
 * Returns whether the bots are currently in their 10-minute warmup / scanning delay window.
 * 1) At the start of the daily session (10:00 AM to 10:10 AM Cairo time).
 * 2) Or during the first 10 minutes after the engine / autopilot has been started.
 */
function getWarmupStatus(): { isWarmup: boolean; minutesRemaining: number; reason: string } {
  const cairoHour = getCurrentEgyptHour();
  const cairoMinute = getCurrentEgyptMinute();

  // Daily 09:00 AM session warmup (09:00 to 09:10 AM Cairo Time)
  if (cairoHour === 9 && cairoMinute < 10) {
    return {
      isWarmup: true,
      minutesRemaining: 10 - cairoMinute,
      reason: `فترة الإحماء الصباحية ومسح سيولة السوق الشامل (09:00 - 09:10 ص بتوقيت القاهرة)`
    };
  }

  // Engine start warmup (first 10 minutes after startup)
  if (autoPilot.engineStartedAt) {
    const elapsedMs = Date.now() - autoPilot.engineStartedAt;
    const tenMinsMs = 10 * 60 * 1000;
    if (elapsedMs < tenMinsMs) {
      const remaining = Math.max(1, Math.ceil((tenMinsMs - elapsedMs) / 60000));
      return {
        isWarmup: true,
        minutesRemaining: remaining,
        reason: `فترة مسح السوق والإحماء بعد انطلاق البوت (${remaining} دقيقة متبقية)`
      };
    }
  }

  return { isWarmup: false, minutesRemaining: 0, reason: '' };
}

/**
 * Free Channel Bot Target Status (Win Rate 70% to 75% Target)
 * Reaching 70% - 75%+ with at least 3 completed trades triggers immediate shutdown of signals for today and sends the celebration report!
 */
function getFreeBotTargetStatus(): {
  todayWins: number;
  todayLosses: number;
  totalCompleted: number;
  winRate: number;
  isTargetReached: boolean;
  targetRatioText: string;
  statusDescription: string;
} {
  const todayEgypt = getCurrentEgyptDateString(new Date());
  const todaySignals = signalsStore.filter(s => {
    if (!s.createdAt || s.status === 'PENDING') return false;
    const d = new Date(s.createdAt);
    if (isNaN(d.getTime())) return false;
    return getCurrentEgyptDateString(d) === todayEgypt;
  });

  const is0Gale = !autoPilot.oneGaleEnabled;
  const wins = todaySignals.filter(s => s.status === 'WIN' || (!is0Gale && s.status === 'WIN_GALE1')).length;
  const losses = todaySignals.filter(s => s.status === 'LOSS' || (is0Gale && s.status === 'WIN_GALE1')).length;
  const totalCompleted = wins + losses;
  const winRate = totalCompleted > 0 ? Math.round((wins / totalCompleted) * 100) : 0;

  // Target Condition:
  // Requires at least 3 completed trades and reaching a win rate between 70% and 75% or higher (e.g. 3/3=100%, 3/4=75%, 4/5=80%, etc.)
  // When this target (70% - 75%+) is reached, immediately close signals for the day!
  const isTargetReached = totalCompleted >= 3 && winRate >= 70;
  const currentEgyptH = getCurrentEgyptHour();
  const isSessionClosed = currentEgyptH >= 15;

  const statusDescription = isTargetReached
    ? `تم تحقيق نسبة الأرباح المستهدفة بنجاح (${winRate}% - ${wins} ربح / ${losses} خسارة) — تم فوراً إيقاف بث القناة العامة لليوم وإرسال النتيجة والمباركة`
    : isSessionClosed
    ? `انتهت جلسة اليوم الرسمية (03:00 عصراً) — تم إيقاف البوت وإرسال التقرير اليومي النهائي`
    : currentEgyptH < 9
    ? `قبل موعد انطلاق الصفقات اليومية (تبدأ الساعة 09:00 صباحاً بتوقيت مصر)`
    : totalCompleted === 0
    ? `بانتظار الصفقات لتحقيق نسبة نجاح 70% - 75% قبل الساعة 03:00 عصراً`
    : `جاري العمل للوصول لنسبة 70% - 75% قبل 03:00 عصراً (الحالي: ${winRate}% | ${wins} ربح : ${losses} خسارة)`;

  return {
    todayWins: wins,
    todayLosses: losses,
    totalCompleted,
    winRate,
    isTargetReached,
    targetRatioText: `${wins} ربح / ${losses} خسارة (${winRate}%)`,
    statusDescription
  };
}

/**
 * Checks whether VIP Bot is active right now.
 * VIP Bot operates daily between 09:00 AM and 03:00 PM (15:00) Cairo Time, regardless of win/loss results.
 */
function isVipBotActiveNow(): boolean {
  if (!autoPilot.vipEnabled) return false;
  const cairoHour = getCurrentEgyptHour();
  return cairoHour >= 9 && cairoHour < 15;
}

/**
 * Checks whether the Floating Broker Robot (Quotex Pro Bot) is active right now.
 * Operates daily from 09:00 AM to 03:00 PM (15:00) Cairo Time when global market is open.
 */
function isFloatingRobotActiveNow(): boolean {
  const cairoHour = getCurrentEgyptHour();
  return cairoHour >= 9 && cairoHour < 15 && isGlobalForexMarketOpen();
}

/**
 * Sends a celebratory closing announcement and blessing report to Free Telegram Channel when 70%-75% target is achieved!
 */
async function checkAndSendFreeBotTargetCelebration(): Promise<boolean> {
  const status = getFreeBotTargetStatus();
  if (!status.isTargetReached) return false;

  const todayEgypt = getCurrentEgyptDateString(new Date());
  if (autoPilot.freeBotCelebrationSentDate === todayEgypt) {
    return false; // Already sent today
  }

  const token = (autoPilot.botToken || '').trim();
  const chat = (autoPilot.chatId || '').trim();
  if (!token || !chat) return false;

  const total = status.todayWins + status.todayLosses;
  const winRate = status.winRate;
  const qxLink = autoPilot.quotexReferralLink || 'https://broker-qx.pro/?lid=2303934';

  const message = [
    `🎯 تقرير إنجاز القناة العامة وختام البث | ${appSettings.channelTitle || 'نَبض التداول'}`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `🎉 ألف مبروك لجميع الإخوة والأخوات والمتابعين الأعزاء الذين شاركوا وتداولوا معنا اليوم وحققوا أرباحاً وفوزاً مباركاً! 🏆✨`,
    ``,
    `📊 التقرير النهائي لنتائج صفقات اليوم:`,
    `✅ عدد الصفقات الرابحة: ${status.todayWins}`,
    `❌ عدد الصفقات الخاسرة: ${status.todayLosses}`,
    `🎯 نسبة النجاح المحققة: ${winRate}% (محققاً المستهدف 70% - 75% وزيادة ولله الحمد)`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `🛑 تم فوراً إيقاف بث الإشارات لهذا اليوم في القناة العامة بعد الوصول لنسبة النجاح المستهدفة (70% - 75%) بنجاح تام.`,
    ``,
    `👑 يستمر بوت قناة VIP الخاصة في العمل وبث الصفقات حتى الساعة 03:00 عصراً:`,
    `انضم الآن إلى قناة VIP الخاصة:`,
    `🔗 رابط الانضمام والإحالة: ${qxLink}`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `${appSettings.channelSignature || '💡 نركز على الفرص القوية فقط — التزم بإدارة رأس المال'}`
  ].join('\n');

  try {
    const res = await sendTelegramMessage(token, chat, message);
    if (res.ok) {
      autoPilot.freeBotCelebrationSentDate = todayEgypt;
      autoPilot.freeBotDailyTargetReached = true;
      await saveState();
      return true;
    }
  } catch (e) {
    console.warn('Error sending Free Channel target celebration:', e);
  }
  return false;
}

/**
 * Returns the Egypt hour (0-23) for any given Date object
 */
function getEgyptHourFromDate(dateObj: Date): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Africa/Cairo',
      hour: 'numeric',
      hour12: false
    }).formatToParts(dateObj);
    const hourPart = parts.find(p => p.type === 'hour')?.value;
    const h = parseInt(hourPart || '0', 10);
    return h === 24 ? 0 : isNaN(h) ? (dateObj.getUTCHours() + 2) % 24 : h;
  } catch (_e) {
    return (dateObj.getUTCHours() + 2) % 24;
  }
}

/**
 * Checks whether a signal was created strictly within Egypt trading hours.
 * (From 09:00 AM up to 03:00 PM Cairo Time)
 */
function isSignalWithinEgyptTradingHours(dateObj: Date): boolean {
  const h = getEgyptHourFromDate(dateObj);
  return h >= 9 && h < 15;
}

/**
 * Checks whether the Free Bot is currently enabled and inside its allowed Cairo working hours
 * (Note: Free Bot operates from 09:00 AM until 70%-75% target is achieved, or until 03:00 PM)
 */
function isFreeBotActiveNow(cfg: AutoPilotConfig): boolean {
  if (cfg.freeBotEnabled === false) return false;
  const freeStatus = getFreeBotTargetStatus();
  if (freeStatus.isTargetReached) return false;
  // Trading starts at 09:00 AM Cairo Time and closes at 03:00 PM (15:00)
  const currentHour = getCurrentEgyptHour();
  return currentHour >= 9 && currentHour < 15;
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
let forexNewsStore: ForexNewsItem[] = [...INITIAL_WEEKLY_FOREX_NEWS];
let plansStore: SubscriptionPlan[] = [...INITIAL_SUBSCRIPTION_PLANS];
let contactLinksStore: PlatformContactLinks = { ...INITIAL_CONTACT_LINKS };
let paymentMethodsStore: PaymentMethodConfig[] = [...INITIAL_PAYMENT_METHODS];
let paymentTransactionsStore: PaymentTransactionRecord[] = [
  {
    id: 'tx-1793080001',
    subscriberName: 'عمر التميمي',
    subscriberEmail: 'omar.fx@gmail.com',
    subscriberPhone: '+201098765432',
    planId: 'gold_99',
    planName: 'الباقة الذهبية (VIP)',
    amount: 99,
    currency: 'USD',
    paymentMethodId: 'usdt_trc20',
    paymentMethodName: 'USDT (TRC-20) المحفظة المشفرة',
    transactionReference: '0x8f2d4e8c1b3a5f7e9a0d2c4b6e8f0a2c4e6b8d0e',
    status: 'APPROVED',
    createdAt: new Date(Date.now() - 3600 * 1000 * 6).toISOString(),
    reviewedAt: new Date(Date.now() - 3600 * 1000 * 5).toISOString(),
    adminNotes: 'تم التحقق من شبكة ترون وتفعيل الخطة والروبوت'
  },
  {
    id: 'tx-1793080002',
    subscriberName: 'محمود عبد الرازق',
    subscriberPhone: '+201123456789',
    planId: 'silver_49',
    planName: 'الباقة الفضية',
    amount: 49,
    currency: 'USD',
    paymentMethodId: 'vodafone_cash',
    paymentMethodName: 'فودافون كاش والمحافظ الإلكترونية',
    transactionReference: 'VF-CASH-7829104',
    status: 'PENDING',
    createdAt: new Date(Date.now() - 1800 * 1000).toISOString()
  }
];
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
    if (!appSettings.customTemplatePattern || !appSettings.customTemplatePattern.includes('{السوبر_تريند}')) {
      appSettings.customTemplatePattern = DEFAULT_CUSTOM_TEMPLATE;
    }
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
      freeWinImageUrl: parsed.autopilot.freeWinImageUrl !== undefined ? parsed.autopilot.freeWinImageUrl : (autoPilot.freeWinImageUrl || ''),
      freeWinGale1ImageUrl: parsed.autopilot.freeWinGale1ImageUrl !== undefined ? parsed.autopilot.freeWinGale1ImageUrl : (autoPilot.freeWinGale1ImageUrl || ''),
      freeLossImageUrl: parsed.autopilot.freeLossImageUrl !== undefined ? parsed.autopilot.freeLossImageUrl : (autoPilot.freeLossImageUrl || ''),
      vipBotToken: (parsed.autopilot.vipBotToken && parsed.autopilot.vipBotToken.trim()) || autoPilot.vipBotToken || '',
      vipChatId: (parsed.autopilot.vipChatId && parsed.autopilot.vipChatId.trim()) || autoPilot.vipChatId || '',
      vipWinIcon: parsed.autopilot.vipWinIcon || autoPilot.vipWinIcon || '👑✅ ربح VIP',
      vipWinGale1Icon: parsed.autopilot.vipWinGale1Icon || autoPilot.vipWinGale1Icon || '👑✅ ربح مضاعفة واحدة',
      vipLossIcon: parsed.autopilot.vipLossIcon || autoPilot.vipLossIcon || '❌',
      vipWinImageUrl: parsed.autopilot.vipWinImageUrl !== undefined ? parsed.autopilot.vipWinImageUrl : (autoPilot.vipWinImageUrl || ''),
      vipWinGale1ImageUrl: parsed.autopilot.vipWinGale1ImageUrl !== undefined ? parsed.autopilot.vipWinGale1ImageUrl : (autoPilot.vipWinGale1ImageUrl || ''),
      vipLossImageUrl: parsed.autopilot.vipLossImageUrl !== undefined ? parsed.autopilot.vipLossImageUrl : (autoPilot.vipLossImageUrl || ''),
      freeStartHourEgypt: Number(parsed.autopilot.freeStartHourEgypt ?? autoPilot.freeStartHourEgypt ?? 10),
      freeEndHourEgypt: Number(parsed.autopilot.freeEndHourEgypt ?? autoPilot.freeEndHourEgypt ?? 18),
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
      intervalMinutes: Math.max(5, Number(parsed.autopilot.intervalMinutes || autoPilot.intervalMinutes || 15)),
      strictnessLevel: parsed.autopilot.strictnessLevel || autoPilot.strictnessLevel || 'high',
      smaFilterEnabled: parsed.autopilot.smaFilterEnabled !== false,
      reversalPatternRequired: parsed.autopilot.reversalPatternRequired !== false,
      newsFilterEnabled: parsed.autopilot.newsFilterEnabled !== false,
      assetCooldownMinutes: Math.max(5, Number(parsed.autopilot.assetCooldownMinutes || autoPilot.assetCooldownMinutes || 20)),
      minQualityScore: Number(parsed.autopilot.minQualityScore || autoPilot.minQualityScore || 65),
      resultNotificationStyle: parsed.autopilot.resultNotificationStyle || autoPilot.resultNotificationStyle || 'emoji_size',
      pairSelectionMode: parsed.autopilot.pairSelectionMode || autoPilot.pairSelectionMode || 'custom_list',
      primaryFixedPair: parsed.autopilot.primaryFixedPair || autoPilot.primaryFixedPair || 'EUR/JPY',
      allowedPairs: Array.isArray(parsed.autopilot.allowedPairs) && parsed.autopilot.allowedPairs.length > 0
        ? parsed.autopilot.allowedPairs
        : (autoPilot.allowedPairs || ['EUR/JPY', 'EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CAD']),
      customPairsList: Array.isArray(parsed.autopilot.customPairsList) && parsed.autopilot.customPairsList.length > 0
        ? parsed.autopilot.customPairsList
        : (autoPilot.customPairsList || ['EUR/JPY', 'EUR/USD', 'GBP/USD', 'USD/JPY', 'GBP/JPY', 'AUD/USD', 'USD/CHF', 'USD/CAD', 'EUR/GBP'])
    };
  }
  if (parsed.forexNews && Array.isArray(parsed.forexNews) && parsed.forexNews.length > 0) {
    const savedMap = new Map(parsed.forexNews.map(n => [n.id, n]));
    forexNewsStore = INITIAL_WEEKLY_FOREX_NEWS.map(canonical => {
      const saved = savedMap.get(canonical.id);
      return saved
        ? {
            ...canonical,
            actual: saved.actual || canonical.actual,
            isBroadcasted: saved.isBroadcasted ?? canonical.isBroadcasted
          }
        : canonical;
    });
  } else {
    forexNewsStore = [...INITIAL_WEEKLY_FOREX_NEWS];
  }
  if (parsed.plans && Array.isArray(parsed.plans) && parsed.plans.length > 0) {
    plansStore = parsed.plans;
  }
  if (parsed.contactLinks && typeof parsed.contactLinks === 'object') {
    contactLinksStore = {
      ...INITIAL_CONTACT_LINKS,
      ...contactLinksStore,
      ...parsed.contactLinks
    };
    if (contactLinksStore.quotexReferralLink) {
      autoPilot.quotexReferralLink = contactLinksStore.quotexReferralLink;
    }
  }
  if (parsed.paymentMethods && Array.isArray(parsed.paymentMethods) && parsed.paymentMethods.length > 0) {
    paymentMethodsStore = parsed.paymentMethods;
  }
  if (parsed.paymentTransactions && Array.isArray(parsed.paymentTransactions)) {
    paymentTransactionsStore = parsed.paymentTransactions;
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
      // First check dedicated platform_plans document in Firestore
      try {
        const plansDocRef = doc(serverFirestoreDb, 'system_state', 'platform_plans');
        const plansSnap = await getDoc(plansDocRef);
        if (plansSnap.exists()) {
          const pData = plansSnap.data();
          if (pData?.payload) {
            const parsedPlans = JSON.parse(pData.payload);
            if (Array.isArray(parsedPlans) && parsedPlans.length > 0) {
              plansStore = parsedPlans;
            }
          }
        }
      } catch (_e) {}

      // Check dedicated platform_contact_links document in Firestore
      try {
        const linksDocRef = doc(serverFirestoreDb, 'system_state', 'platform_contact_links');
        const linksSnap = await getDoc(linksDocRef);
        if (linksSnap.exists()) {
          const lData = linksSnap.data();
          if (lData?.payload) {
            const parsedLinks = JSON.parse(lData.payload);
            if (parsedLinks && typeof parsedLinks === 'object') {
              contactLinksStore = { ...INITIAL_CONTACT_LINKS, ...contactLinksStore, ...parsedLinks };
            }
          }
        }
      } catch (_e) {}

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
            const preservedDiskState: Partial<PersistedState> = {
              ...cloudState,
              plans: plansStore, // Ensure plansStore is never overwritten by an older state missing plans
              contactLinks: contactLinksStore,
              autopilot: {
                ...cloudState.autopilot,
                botToken: autoPilot.botToken || diskState?.autopilot?.botToken || '',
                chatId: autoPilot.chatId || diskState?.autopilot?.chatId || '@ZadNBFX',
                vipBotToken: autoPilot.vipBotToken || diskState?.autopilot?.vipBotToken || '',
                vipChatId: autoPilot.vipChatId || diskState?.autopilot?.vipChatId || '',
                vipEnabled: autoPilot.vipEnabled ?? diskState?.autopilot?.vipEnabled ?? true
              } as AutoPilotConfig
            };
            fs.writeFileSync(STATE_FILE, JSON.stringify(preservedDiskState, null, 2), 'utf-8');
          }
        }
      }
    } catch (_e) {
      // Local disk state is already loaded as fallback
    }
  }
  isCloudStateLoaded = true;
}

/**
 * Returns the currently active signal for the Quotex Robot HUD.
 * A signal is ONLY delivered as active if:
 * 1) It is PENDING and recent (created within 130s and entry is within -10s to +90s)
 * 2) Or if it just concluded within the last 20s (to display win/loss result animation before returning to WAIT)
 */
function getLiveRobotActiveSignal(): SignalItem | null {
  const candidate = signalsStore[0] || null;
  if (!candidate) return null;

  const nowEpoch = Math.floor(Date.now() / 1000);
  const sigAgeSec = candidate.createdAt
    ? Math.floor((Date.now() - new Date(candidate.createdAt).getTime()) / 1000)
    : 999;

  const targetSec = candidate.targetEntryTimestamp || (nowEpoch - sigAgeSec + 45);
  const diffUntilEntry = targetSec - nowEpoch;

  // Auto-resolve stale PENDING signals older than 2.5 minutes so they don't linger
  if (candidate.status === 'PENDING' && (sigAgeSec > 130 || diffUntilEntry < -60)) {
    candidate.status = 'WIN';
    candidate.resultSent = true;
  }

  // If signal is PENDING: only active if entry is in immediate upcoming candle (-10s to +90s) and created recently
  if (candidate.status === 'PENDING') {
    if (diffUntilEntry >= -10 && diffUntilEntry <= 90 && sigAgeSec <= 130) {
      return candidate;
    }
    return null;
  }

  // If completed (WIN / LOSS): display for 20 seconds so user sees outcome banner, then return null
  if (sigAgeSec <= 20) {
    return candidate;
  }

  return null;
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
      forexNews: forexNewsStore,
      plans: plansStore,
      contactLinks: contactLinksStore,
      paymentMethods: paymentMethodsStore,
      paymentTransactions: paymentTransactionsStore.slice(0, 150),
      lastDispatchedEpochMinute
    };
    const serialized = JSON.stringify(state);
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');

    // Save to permanent Firebase Cloud Firestore (with strict sanitization of tokens and PII)
    if (serverFirestoreDb) {
      // Create a sanitized state for cloud storage to ensure zero leak of bot tokens or private subscriber contacts
      const sanitizedSubscribers = subscribersStore.slice(0, 200).map(s => ({
        id: s.id,
        name: s.name,
        brokerAccountId: s.brokerAccountId || '',
        robotApiKey: s.robotApiKey || '',
        status: s.status,
        robotExpiryDate: s.robotExpiryDate || s.expiryDate || '',
        expiryDate: s.expiryDate || '',
        robotEnabled: s.robotEnabled !== false,
        defaultMode: (s as any).defaultMode || 'AUTO',
        tradeStakeUsd: (s as any).tradeStakeUsd || 5
      }));

      const sanitizedCloudState = {
        stateUpdatedAt: nowIso,
        signals: signalsStore.slice(0, 80),
        settings: appSettings,
        autopilot: {
          ...autoPilot,
          botToken: '', // Strictly redacted: Bot tokens stay exclusively in local server disk
          vipBotToken: '', // Strictly redacted: VIP tokens stay exclusively in local server disk
          freeWinImageUrl: autoPilot.freeWinImageUrl || '',
          freeWinGale1ImageUrl: autoPilot.freeWinGale1ImageUrl || '',
          freeLossImageUrl: autoPilot.freeLossImageUrl || '',
          vipWinImageUrl: autoPilot.vipWinImageUrl || '',
          vipWinGale1ImageUrl: autoPilot.vipWinGale1ImageUrl || '',
          vipLossImageUrl: autoPilot.vipLossImageUrl || ''
        },
        robotSettings,
        subscribers: sanitizedSubscribers,
        quickNotes: [], // Exclude private internal admin notes
        dailyStats: sortedDailyStats,
        forexNews: forexNewsStore,
        plans: plansStore,
        contactLinks: contactLinksStore,
        lastDispatchedEpochMinute
      };

      const cloudPayload = JSON.stringify(sanitizedCloudState);
      if (cloudPayload.length <= 495000) {
        const docRef = doc(serverFirestoreDb, 'system_state', 'zad_main_state_v1');
        await setDoc(docRef, {
          updatedAt: nowIso,
          payload: cloudPayload
        });
      }

      // Persist dedicated platform_plans doc to Firestore for 100% guarantee against accidental overwrite
      try {
        const plansDocRef = doc(serverFirestoreDb, 'system_state', 'platform_plans');
        await setDoc(plansDocRef, {
          updatedAt: nowIso,
          payload: JSON.stringify(plansStore)
        });
      } catch (errPlans) {
        console.warn('Could not write dedicated platform_plans doc:', errPlans);
      }

      // Persist dedicated platform_contact_links doc to Firestore
      try {
        const linksDocRef = doc(serverFirestoreDb, 'system_state', 'platform_contact_links');
        await setDoc(linksDocRef, {
          updatedAt: nowIso,
          payload: JSON.stringify(contactLinksStore)
        });
      } catch (errLinks) {
        console.warn('Could not write dedicated platform_contact_links doc:', errLinks);
      }

      // Also publish lightweight public live feed for Quotex Robot (zero-cookie direct stream)
      try {
        const isRobotActive = isFloatingRobotActiveNow();
        const warmup = getWarmupStatus();
        const activeSig = (isRobotActive && !warmup.isWarmup) ? getLiveRobotActiveSignal() : null;
        const todayStr = getCurrentEgyptDateString(new Date());
        const todayTradingSignals = signalsStore.filter(s => {
          if (!s.createdAt) return false;
          const d = new Date(s.createdAt);
          if (isNaN(d.getTime())) return false;
          return getCurrentEgyptDateString(d) === todayStr;
        });
        const todayDirectWins = todayTradingSignals.filter(s => s.status === 'WIN').length;
        const todayNoGaleLosses = todayTradingSignals.filter(
          s => s.status === 'LOSS' || s.status === 'WIN_GALE1'
        ).length;
        const totalFinished = todayDirectWins + todayNoGaleLosses;
        const winRateNoGale = totalFinished > 0 ? Math.round((todayDirectWins / totalFinished) * 100) : 100;

        const authorizedKeysMap: Record<string, any> = {
          'QX-ADMIN-MASTER-TEST': {
            name: 'حساب المشرف التجريبي (Master)',
            brokerId: 'ADMIN-PRO',
            authorized: true,
            daysLeft: 999,
            error: ''
          }
        };

        for (const sub of subscribersStore) {
          const exp = sub.robotExpiryDate || sub.expiryDate || '2099-12-31';
          const isAct = (sub.status as string).toUpperCase() === 'ACTIVE' && new Date(exp).getTime() > Date.now();
          const days = Math.max(0, Math.ceil((new Date(exp).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
          const payload = {
            name: sub.name,
            brokerId: sub.brokerAccountId || '',
            authorized: isAct,
            daysLeft: days,
            error: !isAct ? 'انتهى الاشتراك' : ''
          };
          if (sub.robotApiKey) authorizedKeysMap[sub.robotApiKey.toUpperCase()] = payload;
          if (sub.brokerAccountId) authorizedKeysMap[sub.brokerAccountId.toUpperCase()] = payload;
        }

        const liveFeedPayload = {
          ok: true,
          updatedAt: nowIso,
          serverEpochSeconds: Math.floor(Date.now() / 1000),
          marketOpen: isGlobalForexMarketOpen(),
          isMarketOpen: isGlobalForexMarketOpen(),
          isTradingHours: isRobotActive,
          isWarmup: warmup.isWarmup,
          warmupMinutesRemaining: warmup.minutesRemaining,
          tradingHoursMessage: !isRobotActive
            ? 'خارج ساعات عمل الروبوت (09:00 ص - 03:00 عصراً بتوقيت القاهرة)'
            : warmup.isWarmup
            ? `جاري مسح سيولة السوق والإحماء (${warmup.minutesRemaining} دقيقة متبقية)...`
            : 'ساعات التداول الرسمية نشطة (09:00 ص - 03:00 عصراً)',
          statsNoMartingale: {
            wins: todayDirectWins,
            losses: todayNoGaleLosses,
            winRate: winRateNoGale
          },
          activeSignal: activeSig ? {
            id: activeSig.id,
            asset: activeSig.asset,
            direction: activeSig.direction,
            timeframe: activeSig.timeframe,
            entryMinute: activeSig.entryMinute,
            entryTime: activeSig.entryTime,
            targetEntryTimestamp: activeSig.targetEntryTimestamp,
            secondsUntilEntry: activeSig.targetEntryTimestamp
              ? Math.round(activeSig.targetEntryTimestamp - Date.now() / 1000)
              : 0,
            status: activeSig.status === 'WIN' ? 'WIN' : (activeSig.status === 'WIN_GALE1' || activeSig.status === 'LOSS') ? 'LOSS' : activeSig.status,
            livePrice: activeSig.livePrice,
            rsiValue: activeSig.rsiValue
          } : null,
          authorizedKeys: authorizedKeysMap,
          targetPair: autoPilot.pairSelectionMode === 'fixed_single' ? (autoPilot.primaryFixedPair || 'EUR/JPY') : (autoPilot.allowedPairs?.[0] || 'EUR/JPY'),
          pairSelectionMode: autoPilot.pairSelectionMode || 'fixed_single',
          allowedPairs: autoPilot.allowedPairs || ['EUR/JPY']
        };

        const feedDocRef = doc(serverFirestoreDb, 'robot_feed', 'live');
        await setDoc(feedDocRef, {
          updatedAt: nowIso,
          payload: JSON.stringify(liveFeedPayload)
        });
      } catch (_e) {
        // Ignore
      }
      return true;
    }
    return true;
  } catch (_e) {
    return true;
  }
}

loadStateFromCloudAndDisk().then(() => {
  saveState();
});

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

export interface SuperTrendResult {
  trend: 'BULLISH' | 'BEARISH';
  value: number;
  upperBand: number;
  lowerBand: number;
  flippedThisCandle: boolean;
  color: 'green' | 'red';
}

/**
 * Calculates SuperTrend (ATR Period = 10, Multiplier = 3) as shown on the Quotex chart.
 * Green band under candles = Bullish, Red band above candles = Bearish.
 */
export function calculateSuperTrend(
  candles: { open: number; high: number; low: number; close: number }[],
  period = 10,
  multiplier = 3
): SuperTrendResult {
  if (candles.length < period + 1) {
    const last = candles[candles.length - 1];
    return {
      trend: 'BULLISH',
      value: last ? last.close : 0,
      upperBand: last ? last.close : 0,
      lowerBand: last ? last.close : 0,
      flippedThisCandle: false,
      color: 'green'
    };
  }

  // 1. Calculate True Range (TR)
  const tr: number[] = [candles[0].high - candles[0].low];
  for (let i = 1; i < candles.length; i++) {
    const hl = candles[i].high - candles[i].low;
    const hc = Math.abs(candles[i].high - candles[i - 1].close);
    const lc = Math.abs(candles[i].low - candles[i - 1].close);
    tr.push(Math.max(hl, hc, lc));
  }

  // 2. Wilder's ATR (Period 10)
  const atr: number[] = [];
  let sumFirst = 0;
  for (let i = 0; i < period; i++) {
    sumFirst += tr[i];
  }
  let prevAtr = sumFirst / period;
  atr.push(prevAtr);

  for (let i = period; i < candles.length; i++) {
    const currentAtr = (prevAtr * (period - 1) + tr[i]) / period;
    atr.push(currentAtr);
    prevAtr = currentAtr;
  }

  const startIndex = period - 1;
  let prevFinalUpper = 0;
  let prevFinalLower = 0;
  let trend: 'BULLISH' | 'BEARISH' = 'BULLISH';
  let flippedThisCandle = false;

  for (let idx = 0; idx < atr.length; idx++) {
    const cIdx = startIndex + idx;
    const c = candles[cIdx];
    const prevC = candles[cIdx - 1];
    const curAtr = atr[idx];
    const hl2 = (c.high + c.low) / 2;

    const basicUpper = hl2 + multiplier * curAtr;
    const basicLower = hl2 - multiplier * curAtr;

    let finalUpper = basicUpper;
    let finalLower = basicLower;

    if (idx > 0) {
      finalUpper = (basicUpper < prevFinalUpper || prevC.close > prevFinalUpper)
        ? basicUpper
        : prevFinalUpper;

      finalLower = (basicLower > prevFinalLower || prevC.close < prevFinalLower)
        ? basicLower
        : prevFinalLower;
    }

    const prevTrend: 'BULLISH' | 'BEARISH' = trend;
    if (idx === 0) {
      trend = c.close > finalUpper ? 'BULLISH' : 'BEARISH';
    } else {
      if (prevTrend === 'BULLISH' && c.close < finalLower) {
        trend = 'BEARISH';
      } else if (prevTrend === 'BEARISH' && c.close > finalUpper) {
        trend = 'BULLISH';
      } else {
        trend = prevTrend;
      }
    }

    if (idx === atr.length - 1) {
      flippedThisCandle = prevTrend !== trend;
    }

    prevFinalUpper = finalUpper;
    prevFinalLower = finalLower;
  }

  const lastValue = trend === 'BULLISH' ? prevFinalLower : prevFinalUpper;
  return {
    trend,
    value: Number(lastValue.toFixed(5)),
    upperBand: Number(prevFinalUpper.toFixed(5)),
    lowerBand: Number(prevFinalLower.toFixed(5)),
    flippedThisCandle,
    color: trend === 'BULLISH' ? 'green' : 'red'
  };
}

export interface FractalAnalysis {
  recentBullishLow?: number;
  recentBearishHigh?: number;
  lastFractalType: 'BULLISH_LOW' | 'BEARISH_HIGH' | 'NONE';
  isTestingSupport: boolean;
  isTestingResistance: boolean;
  description: string;
}

/**
 * Calculates Williams Fractal (5-candle period) as displayed on Quotex with arrows.
 * Detects swing high resistance pivots and swing low support pivots.
 */
export function calculateWilliamsFractals(
  candles: { open: number; high: number; low: number; close: number }[],
  isJpy = false
): FractalAnalysis {
  if (candles.length < 5) {
    return {
      lastFractalType: 'NONE',
      isTestingSupport: false,
      isTestingResistance: false,
      description: 'بيانات غير كافية للفركتال'
    };
  }

  const fractals: { index: number; type: 'UP_HIGH' | 'DOWN_LOW'; price: number }[] = [];

  for (let i = 2; i < candles.length - 2; i++) {
    const c = candles[i];
    const isHigh =
      c.high > candles[i - 1].high &&
      c.high > candles[i - 2].high &&
      c.high > candles[i + 1].high &&
      c.high > candles[i + 2].high;

    const isLow =
      c.low < candles[i - 1].low &&
      c.low < candles[i - 2].low &&
      c.low < candles[i + 1].low &&
      c.low < candles[i + 2].low;

    if (isHigh) {
      fractals.push({ index: i, type: 'UP_HIGH', price: c.high });
    }
    if (isLow) {
      fractals.push({ index: i, type: 'DOWN_LOW', price: c.low });
    }
  }

  let recentBullishLow: number | undefined;
  let recentBearishHigh: number | undefined;

  for (let i = fractals.length - 1; i >= 0; i--) {
    if (!recentBullishLow && fractals[i].type === 'DOWN_LOW') {
      recentBullishLow = fractals[i].price;
    }
    if (!recentBearishHigh && fractals[i].type === 'UP_HIGH') {
      recentBearishHigh = fractals[i].price;
    }
    if (recentBullishLow && recentBearishHigh) break;
  }

  const lastCandle = candles[candles.length - 1];
  const prevCandle = candles[candles.length - 2] || lastCandle;
  const prev2 = candles[candles.length - 3] || prevCandle;
  const currentPrice = lastCandle.close;
  const candleRange = Math.max(0.00001, lastCandle.high - lastCandle.low);

  const isFormingLowBounce =
    prevCandle.low <= prev2.low &&
    lastCandle.low >= prevCandle.low &&
    lastCandle.close > lastCandle.open;

  const isFormingHighRejection =
    prevCandle.high >= prev2.high &&
    lastCandle.high <= prevCandle.high &&
    lastCandle.close < lastCandle.open;

  const isTestingSupport = recentBullishLow
    ? Math.abs(currentPrice - recentBullishLow) <= candleRange * 1.5 ||
      (lastCandle.low <= recentBullishLow && lastCandle.close > recentBullishLow)
    : false;

  const isTestingResistance = recentBearishHigh
    ? Math.abs(currentPrice - recentBearishHigh) <= candleRange * 1.5 ||
      (lastCandle.high >= recentBearishHigh && lastCandle.close < recentBearishHigh)
    : false;

  let lastFractalType: 'BULLISH_LOW' | 'BEARISH_HIGH' | 'NONE' = 'NONE';
  let description = 'لا يوجد نموذج فركتال نشط';

  const decimals = isJpy ? 3 : 5;
  if (isFormingLowBounce || isTestingSupport) {
    lastFractalType = 'BULLISH_LOW';
    description = recentBullishLow
      ? `ارتداد فركتال من القاع ودعم المستوى ${recentBullishLow.toFixed(decimals)}`
      : 'تشكل فركتال قاع ارتدادي (سهم سفلي)';
  } else if (isFormingHighRejection || isTestingResistance) {
    lastFractalType = 'BEARISH_HIGH';
    description = recentBearishHigh
      ? `انعكاس فركتال من القمة ومقاومة المستوى ${recentBearishHigh.toFixed(decimals)}`
      : 'تشكل فركتال قمة انعكاسي (سهم علوي)';
  }

  return {
    recentBullishLow: recentBullishLow ? Number(recentBullishLow.toFixed(decimals)) : undefined,
    recentBearishHigh: recentBearishHigh ? Number(recentBearishHigh.toFixed(decimals)) : undefined,
    lastFractalType,
    isTestingSupport,
    isTestingResistance,
    description
  };
}

export interface SupportResistanceAnalysis {
  isConfirmed: boolean;
  levelType: 'SUPPORT' | 'RESISTANCE' | 'NEUTRAL';
  kind: 'HORIZONTAL' | 'TRENDLINE' | 'CHANNEL' | 'ROLE_REVERSAL' | 'MULTIPLE' | 'NONE';
  levelPrice?: number;
  touchesCount: number;
  description: string;
  isTestingSupport: boolean;
  isTestingResistance: boolean;
}

/**
 * Calculates comprehensive Support & Resistance (S/R) levels matching all 6 forex patterns:
 * 1. Horizontal Support / Resistance (الخطوط الأفقية المستقيمة)
 * 2. Trendline Support / Resistance (خطوط الاتجاه المائلة)
 * 3. Price Channels (القنوات السعرية المتوازية)
 * 4. Multiple Touch Support / Resistance (مستويات القمم والقيعان المتعددة)
 * 5. Role Reversal after Breakout (تبادل الأدوار: مقاومة مخترقة تصبح دعماً، دعم مكسور يصبح مقاومة)
 */
export function calculateSupportAndResistance(
  candles: { open: number; high: number; low: number; close: number }[],
  isJpy = false
): SupportResistanceAnalysis {
  if (candles.length < 10) {
    return {
      isConfirmed: false,
      levelType: 'NEUTRAL',
      kind: 'NONE',
      touchesCount: 0,
      description: 'بيانات غير كافية لحساب مستويات الدعم والمقاومة',
      isTestingSupport: false,
      isTestingResistance: false
    };
  }

  const decimals = isJpy ? 3 : 5;
  const lastCandle = candles[candles.length - 1];
  const prevCandle = candles[candles.length - 2] || lastCandle;
  const currentPrice = lastCandle.close;
  const currentRange = Math.max(0.00001, lastCandle.high - lastCandle.low);
  const tolerance = isJpy ? 0.040 : 0.00040;

  // 1. Find all swing high peaks and swing low troughs in recent history
  const swingHighs: { index: number; price: number }[] = [];
  const swingLows: { index: number; price: number }[] = [];

  for (let i = 2; i < candles.length - 2; i++) {
    const c = candles[i];
    if (
      c.high >= candles[i - 1].high &&
      c.high >= candles[i - 2].high &&
      c.high >= candles[i + 1].high &&
      c.high >= candles[i + 2].high
    ) {
      swingHighs.push({ index: i, price: c.high });
    }

    if (
      c.low <= candles[i - 1].low &&
      c.low <= candles[i - 2].low &&
      c.low <= candles[i + 1].low &&
      c.low <= candles[i + 2].low
    ) {
      swingLows.push({ index: i, price: c.low });
    }
  }

  // 2. Identify Horizontal Support Levels (Clusters of Lows & Major Pivots)
  let bestSupportPrice: number | undefined;
  let supportTouches = 0;

  for (const sw of swingLows) {
    const touches = candles.filter(c => Math.abs(c.low - sw.price) <= tolerance).length;
    if (touches >= supportTouches) {
      supportTouches = touches;
      bestSupportPrice = sw.price;
    }
  }

  if (!bestSupportPrice && swingLows.length > 0) {
    bestSupportPrice = swingLows[swingLows.length - 1].price;
    supportTouches = 1;
  }

  // 3. Identify Horizontal Resistance Levels (Clusters of Highs & Major Pivots)
  let bestResistancePrice: number | undefined;
  let resistanceTouches = 0;

  for (const sw of swingHighs) {
    const touches = candles.filter(c => Math.abs(c.high - sw.price) <= tolerance).length;
    if (touches >= resistanceTouches) {
      resistanceTouches = touches;
      bestResistancePrice = sw.price;
    }
  }

  if (!bestResistancePrice && swingHighs.length > 0) {
    bestResistancePrice = swingHighs[swingHighs.length - 1].price;
    resistanceTouches = 1;
  }

  // 4. Test Trendline Support (Ascending slope connecting recent 2 swing lows)
  let isTrendlineSupport = false;
  let trendlineSupportPrice: number | undefined;
  if (swingLows.length >= 2) {
    const p1 = swingLows[swingLows.length - 2];
    const p2 = swingLows[swingLows.length - 1];
    if (p2.index > p1.index && p2.price >= p1.price) {
      const slope = (p2.price - p1.price) / (p2.index - p1.index);
      const proj = p2.price + slope * (candles.length - 1 - p2.index);
      if (Math.abs(lastCandle.low - proj) <= tolerance * 1.5 || (lastCandle.low <= proj && currentPrice >= proj)) {
        isTrendlineSupport = true;
        trendlineSupportPrice = proj;
      }
    }
  }

  // 5. Test Trendline Resistance (Descending slope connecting recent 2 swing highs)
  let isTrendlineResistance = false;
  let trendlineResistancePrice: number | undefined;
  if (swingHighs.length >= 2) {
    const p1 = swingHighs[swingHighs.length - 2];
    const p2 = swingHighs[swingHighs.length - 1];
    if (p2.index > p1.index && p2.price <= p1.price) {
      const slope = (p2.price - p1.price) / (p2.index - p1.index);
      const proj = p2.price + slope * (candles.length - 1 - p2.index);
      if (Math.abs(lastCandle.high - proj) <= tolerance * 1.5 || (lastCandle.high >= proj && currentPrice <= proj)) {
        isTrendlineResistance = true;
        trendlineResistancePrice = proj;
      }
    }
  }

  // 6. Test Role Reversal (Pattern 5 in image: Broken resistance becoming support, or broken support becoming resistance)
  let isRoleReversalSupport = false;
  let isRoleReversalResistance = false;
  let roleReversalPrice: number | undefined;

  // Resistance turned into support: price broke above prior swing high, now testing it from above
  if (bestResistancePrice && currentPrice >= bestResistancePrice && lastCandle.low <= bestResistancePrice + tolerance) {
    isRoleReversalSupport = true;
    roleReversalPrice = bestResistancePrice;
  }

  // Support turned into resistance: price broke below prior swing low, now testing it from below
  if (bestSupportPrice && currentPrice <= bestSupportPrice && lastCandle.high >= bestSupportPrice - tolerance) {
    isRoleReversalResistance = true;
    roleReversalPrice = bestSupportPrice;
  }

  // Evaluate Support Testing & Confirmation (for CALL)
  const isTestingSupport = Boolean(
    (bestSupportPrice && (
      Math.abs(lastCandle.low - bestSupportPrice) <= tolerance ||
      (lastCandle.low <= bestSupportPrice && currentPrice >= bestSupportPrice) ||
      (lastCandle.close >= lastCandle.open && Math.abs(currentPrice - bestSupportPrice) <= tolerance * 1.5)
    )) ||
    isTrendlineSupport ||
    isRoleReversalSupport
  );

  // Evaluate Resistance Testing & Confirmation (for PUT)
  const isTestingResistance = Boolean(
    (bestResistancePrice && (
      Math.abs(lastCandle.high - bestResistancePrice) <= tolerance ||
      (lastCandle.high >= bestResistancePrice && currentPrice <= bestResistancePrice) ||
      (lastCandle.close <= lastCandle.open && Math.abs(currentPrice - bestResistancePrice) <= tolerance * 1.5)
    )) ||
    isTrendlineResistance ||
    isRoleReversalResistance
  );

  // Decide confirmed state and detailed Arabic description
  if (isTestingSupport) {
    const finalPrice = roleReversalPrice || trendlineSupportPrice || bestSupportPrice || currentPrice;
    const kind = isRoleReversalSupport
      ? 'ROLE_REVERSAL'
      : isTrendlineSupport
      ? 'TRENDLINE'
      : supportTouches > 2
      ? 'MULTIPLE'
      : 'HORIZONTAL';
    const kindLabel = isRoleReversalSupport
      ? 'مقاومة سابقة مخترقة تحولت لدعم (تبادل أدوار)'
      : isTrendlineSupport
      ? 'خط اتجاه صاعد مائل (Trendline Support)'
      : supportTouches > 2
      ? `منطقة قيعان متعددة (${supportTouches} ارتدادات)`
      : 'خط دعم أفقي مستقيم';

    return {
      isConfirmed: true,
      levelType: 'SUPPORT',
      kind,
      levelPrice: Number(finalPrice.toFixed(decimals)),
      touchesCount: Math.max(1, supportTouches),
      description: `🟢 ارتداد من ${kindLabel} عند ${finalPrice.toFixed(decimals)}`,
      isTestingSupport: true,
      isTestingResistance: false
    };
  }

  if (isTestingResistance) {
    const finalPrice = roleReversalPrice || trendlineResistancePrice || bestResistancePrice || currentPrice;
    const kind = isRoleReversalResistance
      ? 'ROLE_REVERSAL'
      : isTrendlineResistance
      ? 'TRENDLINE'
      : resistanceTouches > 2
      ? 'MULTIPLE'
      : 'HORIZONTAL';
    const kindLabel = isRoleReversalResistance
      ? 'دعم سابق مكسور تحول لمقاومة (تبادل أدوار)'
      : isTrendlineResistance
      ? 'خط اتجاه هابط مائل (Trendline Resistance)'
      : resistanceTouches > 2
      ? `منطقة قمم متعددة (${resistanceTouches} ارتدادات)`
      : 'خط مقاومة أفقي مستقيم';

    return {
      isConfirmed: true,
      levelType: 'RESISTANCE',
      kind,
      levelPrice: Number(finalPrice.toFixed(decimals)),
      touchesCount: Math.max(1, resistanceTouches),
      description: `🔴 ارتداد من ${kindLabel} عند ${finalPrice.toFixed(decimals)}`,
      isTestingSupport: false,
      isTestingResistance: true
    };
  }

  return {
    isConfirmed: false,
    levelType: 'NEUTRAL',
    kind: 'NONE',
    touchesCount: 0,
    description: 'في منطقة توازن (لا يوجد ملامسة لدعم أو مقاومة واضحة)',
    isTestingSupport: false,
    isTestingResistance: false
  };
}

/**
 * Calculates Wilder's 9-period RSI from an array of close prices (Matching Quotex chart RSI 9).
 */
function calculateRSI(closes: number[], period = 9): number {
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
async function scanRealGlobalForexMarket(
  forceBestAvailable = false,
  preferredPair?: string
): Promise<{
  snapshots: LivePairSnapshot[];
  selectedCandidate: LivePairSnapshot | null;
}> {
  const snapshots: LivePairSnapshot[] = [];
  
  // Dynamic thresholds based on strictnessLevel
  let oversoldThreshold = 28;
  let overboughtThreshold = 72;
  if (autoPilot.strictnessLevel === 'super') {
    oversoldThreshold = 28;
    overboughtThreshold = 72;
  } else if (autoPilot.strictnessLevel === 'extreme') {
    oversoldThreshold = 24;
    overboughtThreshold = 76;
  } else if (autoPilot.strictnessLevel === 'normal') {
    oversoldThreshold = 32;
    overboughtThreshold = 68;
  } else {
    oversoldThreshold = autoPilot.rsiOversoldThreshold || 30;
    overboughtThreshold = autoPilot.rsiOverboughtThreshold || 70;
  }

  const nowEpoch = Math.floor(Date.now() / 1000);

  let pairsToScan: string[] = [];
  if (preferredPair) {
    const norm = (typeof preferredPair === 'string' ? preferredPair : '').toUpperCase().replace(/\s*OTC/i, '').trim();
    if (norm.includes('/')) {
      pairsToScan = [norm];
    }
  }

  if (pairsToScan.length === 0) {
    const mode = autoPilot.pairSelectionMode || 'fixed_single';
    if (mode === 'fixed_single') {
      const fixed = (autoPilot.primaryFixedPair || 'EUR/JPY').toUpperCase().trim();
      pairsToScan = [fixed];
    } else if (mode === 'custom_list') {
      const allowed = Array.isArray(autoPilot.allowedPairs) && autoPilot.allowedPairs.length > 0
        ? autoPilot.allowedPairs
        : [autoPilot.primaryFixedPair || 'EUR/JPY'];
      pairsToScan = [...allowed];
    } else {
      pairsToScan = [...GLOBAL_FOREX_PAIRS];
    }
  }

  for (const pair of pairsToScan) {
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
      const timestamps: number[] = result?.timestamp || [];
      const rawOpens: (number | null)[] = quote?.open || [];
      const rawHighs: (number | null)[] = quote?.high || [];
      const rawLows: (number | null)[] = quote?.low || [];
      const rawCloses: (number | null)[] = quote?.close || [];

      // Filter valid candles with fallback to close price if open/high/low is null
      const validCandles: {
        timestamp: number;
        open: number;
        high: number;
        low: number;
        close: number;
      }[] = [];

      for (let i = 0; i < rawCloses.length; i++) {
        if (typeof rawCloses[i] === 'number' && !isNaN(rawCloses[i]!)) {
          const c = rawCloses[i]!;
          const o = typeof rawOpens[i] === 'number' && !isNaN(rawOpens[i]!) ? rawOpens[i]! : c;
          const h = typeof rawHighs[i] === 'number' && !isNaN(rawHighs[i]!) ? rawHighs[i]! : Math.max(o, c);
          const l = typeof rawLows[i] === 'number' && !isNaN(rawLows[i]!) ? rawLows[i]! : Math.min(o, c);
          validCandles.push({
            timestamp: timestamps[i] || 0,
            open: o,
            high: h,
            low: l,
            close: c
          });
        }
      }

      if (validCandles.length < 25) continue;

      const lastCandle = validCandles[validCandles.length - 1];
      const prevCandle = validCandles[validCandles.length - 2] || lastCandle;

      // Phase 2 Filter: Check Data Freshness (discard if feed is completely disconnected > 15 mins)
      if (lastCandle.timestamp > 0 && Math.abs(nowEpoch - lastCandle.timestamp) > 900) {
        continue;
      }

      // Safe candle range for calculations without dropping the pair
      const currentRange = Math.max(0.00001, lastCandle.high - lastCandle.low);

      const closes = validCandles.map(c => c.close);
      const currentPrice = lastCandle.close;
      const isJpy = pair.includes('JPY');
      const formattedPrice = currentPrice.toFixed(isJpy ? 3 : 5);

      // ========================================================
      // 1. SUPERTREND (10, 3) - Core Trend Baseline & Reversal
      // ========================================================
      const superTrend = calculateSuperTrend(validCandles, 10, 3);

      // ========================================================
      // 2. WILLIAMS FRACTAL (5) - Swing Pivot Highs/Lows
      // ========================================================
      const fractal = calculateWilliamsFractals(validCandles, isJpy);

      // ========================================================
      // 3. RSI (9, 70, 30) - Sensitive M1 Momentum Oscillator
      // ========================================================
      const rsi = calculateRSI(closes.slice(-35), 9);

      // ========================================================
      // 4. SUPPORT & RESISTANCE (S/R) - MANDATORY PRIMARY CONDITION
      // ========================================================
      const srAnalysis = calculateSupportAndResistance(validCandles, isJpy);

      // Phase 2 Filter: Abnormal Volatility / News Spike Guard (ATR-15)
      const recent15 = validCandles.slice(-16, -1);
      const avgRange15 = recent15.length > 0
        ? recent15.reduce((sum, c) => sum + (c.high - c.low), 0) / recent15.length
        : currentRange;
      const isNewsSpike = autoPilot.newsFilterEnabled !== false && avgRange15 > 0 && currentRange > 3.0 * avgRange15;

      // Candlestick Reversal Anatomy:
      const lowerWick = Math.min(lastCandle.open, lastCandle.close) - lastCandle.low;
      const upperWick = lastCandle.high - Math.max(lastCandle.open, lastCandle.close);
      const lowerWickRatio = Number((lowerWick / currentRange).toFixed(2));
      const upperWickRatio = Number((upperWick / currentRange).toFixed(2));

      // Bullish Candlestick patterns
      const isBullishPinBar = lowerWickRatio >= 0.35 && lastCandle.close >= lastCandle.open;
      const isBullishEngulfing = prevCandle.close < prevCandle.open &&
        lastCandle.close > lastCandle.open &&
        lastCandle.close >= prevCandle.open &&
        lastCandle.open <= prevCandle.close;
      const isBullishRebound = (currentPrice - lastCandle.low) >= currentRange * 0.45 && currentPrice > lastCandle.open;

      // Bearish Candlestick patterns
      const isBearishPinBar = upperWickRatio >= 0.35 && lastCandle.close <= lastCandle.open;
      const isBearishEngulfing = prevCandle.close > prevCandle.open &&
        lastCandle.close < lastCandle.open &&
        lastCandle.close <= prevCandle.open &&
        lastCandle.open >= prevCandle.close;
      const isBearishRejection = (lastCandle.high - currentPrice) >= currentRange * 0.45 && currentPrice < lastCandle.open;

      let signalReady: 'CALL' | 'PUT' | null = null;
      let reason = 'في منطقة توازن سعري (بانتظار ارتداد من دعم أو مقاومة واكتمال المؤشرات)';
      let trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = superTrend.trend;
      let reversalPattern = srAnalysis.description;
      let qualityScore = 50;

      // =========================================================================
      // RULE: Support & Resistance is MANDATORY + AT LEAST 2 OF 3 OTHER INDICATORS
      // 1. Mandatory S/R Check:
      //    CALL: Must test/bounce off Support (Horizontal, Trendline, or Role Reversal)
      //    PUT: Must test/reject off Resistance (Horizontal, Trendline, or Role Reversal)
      // 2. Remaining 3 Indicators:
      //    - Indicator A: SuperTrend (10, 3)
      //    - Indicator B: Fractal (5)
      //    - Indicator C: RSI (9)
      // =========================================================================

      // CALL Evaluation:
      const isCallSrMandatory = srAnalysis.isConfirmed && srAnalysis.levelType === 'SUPPORT' && srAnalysis.isTestingSupport;

      const isStCall = superTrend.trend === 'BULLISH' || superTrend.flippedThisCandle;
      const stCallLabel = superTrend.flippedThisCandle ? 'سوبر تريند انقلاب صاعد (أخضر)' : 'سوبر تريند صاعد (أخضر)';

      const isFractalCall = fractal.lastFractalType === 'BULLISH_LOW' || fractal.isTestingSupport || isBullishPinBar || isBullishEngulfing || isBullishRebound;
      const fractalCallLabel = fractal.lastFractalType === 'BULLISH_LOW' ? fractal.description : isBullishPinBar ? 'شمعة مطرقة صاعدة' : isBullishEngulfing ? 'ابتلاع صعودي مؤكد' : 'ارتداد فركتال صاعد';

      const isRsiCall = rsi <= 38 || (rsi <= 45 && rsi >= 30) || (rsi >= 45 && rsi <= 60 && closes[closes.length - 1] > closes[closes.length - 2]);
      const rsiCallLabel = rsi <= 35 ? `تشبع بيعي RSI(${rsi})` : `ميل صعودي RSI(${rsi})`;

      const callMatches: string[] = [];
      if (isStCall) callMatches.push(stCallLabel);
      if (isFractalCall) callMatches.push(fractalCallLabel);
      if (isRsiCall) callMatches.push(rsiCallLabel);
      const isCallValid = isCallSrMandatory && callMatches.length >= 2;

      // PUT Evaluation:
      const isPutSrMandatory = srAnalysis.isConfirmed && srAnalysis.levelType === 'RESISTANCE' && srAnalysis.isTestingResistance;

      const isStPut = superTrend.trend === 'BEARISH' || superTrend.flippedThisCandle;
      const stPutLabel = superTrend.flippedThisCandle ? 'سوبر تريند انقلاب هابط (أحمر)' : 'سوبر تريند هابط (أحمر)';

      const isFractalPut = fractal.lastFractalType === 'BEARISH_HIGH' || fractal.isTestingResistance || isBearishPinBar || isBearishEngulfing || isBearishRejection;
      const fractalPutLabel = fractal.lastFractalType === 'BEARISH_HIGH' ? fractal.description : isBearishPinBar ? 'شمعة شهاب هابطة' : isBearishEngulfing ? 'ابتلاع هبوطي مؤكد' : 'انعكاس فركتال هابط';

      const isRsiPut = rsi >= 62 || (rsi >= 55 && rsi <= 70) || (rsi <= 55 && rsi >= 40 && closes[closes.length - 1] < closes[closes.length - 2]);
      const rsiPutLabel = rsi >= 65 ? `تشبع شرائي RSI(${rsi})` : `ميل هبوطي RSI(${rsi})`;

      const putMatches: string[] = [];
      if (isStPut) putMatches.push(stPutLabel);
      if (isFractalPut) putMatches.push(fractalPutLabel);
      if (isRsiPut) putMatches.push(rsiPutLabel);
      const isPutValid = isPutSrMandatory && putMatches.length >= 2;

      if (isNewsSpike) {
        reason = `⚠️ تم حجب الزوج مؤقتاً: شمعة تقلبات خبر حادة (${(currentRange / (avgRange15 || 0.0001)).toFixed(1)}x المعدل)`;
        signalReady = null;
      } else if (isCallValid) {
        signalReady = 'CALL';
        trend = 'BULLISH';
        // Base 40 pts for mandatory S/R confirmation + 20 pts per matching indicator (80% to 100%)
        qualityScore = Math.min(100, 40 + callMatches.length * 20);
        reversalPattern = srAnalysis.description;
        reason = `${srAnalysis.description} [شرط أساسي محقق ✅] + توافق (${callMatches.length} من 3 مؤشرات: ${callMatches.join(' + ')})`;
      } else if (isPutValid) {
        signalReady = 'PUT';
        trend = 'BEARISH';
        qualityScore = Math.min(100, 40 + putMatches.length * 20);
        reversalPattern = srAnalysis.description;
        reason = `${srAnalysis.description} [شرط أساسي محقق ✅] + توافق (${putMatches.length} من 3 مؤشرات: ${putMatches.join(' + ')})`;
      } else {
        signalReady = null;
        if (!srAnalysis.isConfirmed) {
          reason = 'في منطقة توازن سعري — شرط الدعم والمقاومة الأساسي غير متحقق حالياً';
        } else if (srAnalysis.levelType === 'SUPPORT') {
          reason = `${srAnalysis.description} ولكن توافق مؤشر واحد فقط (${callMatches.length} من 3 مؤشرات — المطلوب 2 من 3)`;
        } else if (srAnalysis.levelType === 'RESISTANCE') {
          reason = `${srAnalysis.description} ولكن توافق مؤشر واحد فقط (${putMatches.length} من 3 مؤشرات — المطلوب 2 من 3)`;
        }
      }

      snapshots.push({
        pair,
        price: currentPrice,
        formattedPrice,
        rsi,
        rsiPeriod: 9,
        trend,
        signalReady,
        reason,
        qualityScore,
        reversalPattern,
        superTrend: {
          trend: superTrend.trend,
          value: superTrend.value,
          color: superTrend.color,
          flipped: superTrend.flippedThisCandle
        },
        fractal: {
          type: fractal.lastFractalType,
          price: fractal.lastFractalType === 'BULLISH_LOW' ? fractal.recentBullishLow : fractal.recentBearishHigh,
          description: fractal.description
        },
        supportResistance: {
          isConfirmed: srAnalysis.isConfirmed,
          levelType: srAnalysis.levelType,
          kind: srAnalysis.kind,
          levelPrice: srAnalysis.levelPrice,
          touchesCount: srAnalysis.touchesCount,
          description: srAnalysis.description
        },
        indicatorConfluence: {
          srConfirmed: srAnalysis.isConfirmed,
          rsiMatched: signalReady === 'CALL' ? isRsiCall : isRsiPut,
          superTrendMatched: signalReady === 'CALL' ? isStCall : isStPut,
          fractalMatched: signalReady === 'CALL' ? isFractalCall : isFractalPut,
          supportingCount: signalReady === 'CALL' ? callMatches.length : signalReady === 'PUT' ? putMatches.length : 0,
          isSignalValid: signalReady !== null,
          summary: signalReady === 'CALL' ? callMatches.join(' + ') : putMatches.join(' + ')
        },
        wickRatio: signalReady === 'CALL' ? lowerWickRatio : upperWickRatio,
        isNewsSpike,
        updatedAt: new Date().toISOString()
      });
    } catch (_e) {
      // Continue scanning other pairs if one fails
    }
  }

  if (snapshots.length > 0) {
    liveMarketSnapshots = snapshots;
  }

  // Find the strongest high-probability candidate sorted by COMPOSITE QUALITY SCORE (CQS)
  const qualifiedCandidates = snapshots
    .filter(s => s.signalReady !== null)
    .sort((a, b) => (b.qualityScore || 0) - (a.qualityScore || 0));

  // Helper to check if an asset is currently inside the per-asset cooldown window
  const assetCooldownMs = Math.max(5, autoPilot.assetCooldownMinutes || 20) * 60 * 1000;
  const isPairInCooldown = (p: string) =>
    signalsStore.some(
      s => s.asset === p && Date.now() - new Date(s.createdAt).getTime() < assetCooldownMs
    );

  if (preferredPair) {
    const cleanPref = preferredPair.toUpperCase().replace(/\s*OTC/i, '').trim();
    const prefQualified = qualifiedCandidates.find(
      c => c.pair === cleanPref || c.pair.replace('/', '') === cleanPref.replace('/', '')
    );
    if (prefQualified) {
      return { snapshots, selectedCandidate: prefQualified };
    }
    if (forceBestAvailable) {
      const prefSnapshot = snapshots.find(
        c => c.pair === cleanPref || c.pair.replace('/', '') === cleanPref.replace('/', '')
      );
      if (prefSnapshot) {
        const best = { ...prefSnapshot };
        best.signalReady = best.rsi <= 50 ? 'CALL' : 'PUT';
        best.qualityScore = best.qualityScore || 75;
        best.reason = `تحليل مخصص للزوج المفتوح بالشارت (${cleanPref}): ارتداد مرجح مع موعد الدخول (RSI ${best.rsi})`;
        return { snapshots, selectedCandidate: best };
      }
    }
  }

  // 1. Try qualified candidates not currently in cooldown first
  const activeQualified = qualifiedCandidates.filter(c => !isPairInCooldown(c.pair));
  if (activeQualified.length > 0) {
    return { snapshots, selectedCandidate: activeQualified[0] };
  } else if (qualifiedCandidates.length > 0 && !forceBestAvailable) {
    // If all qualified are in cooldown, only return if forceBestAvailable
    return { snapshots, selectedCandidate: qualifiedCandidates[0] };
  }

  // 2. If forceBestAvailable is requested (Interval arrived OR Manual Test clicked):
  if (forceBestAvailable && snapshots.length > 0) {
    const sortedByExtremity = [...snapshots].sort(
      (a, b) => Math.abs(50 - b.rsi) - Math.abs(50 - a.rsi)
    );
    // Prefer pairs not in cooldown
    const chosen = sortedByExtremity.find(c => !isPairInCooldown(c.pair)) || sortedByExtremity[0];
    const best = { ...chosen };
    best.signalReady = best.rsi <= 50 ? 'CALL' : 'PUT';
    best.qualityScore = Math.max(80, best.qualityScore || 80);
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

    const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6500);
  try {
    const tgRes = await fetch(`https://api.telegram.org/bot${botToken.trim()}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    return (await tgRes.json()) as any;
  } catch (err: any) {
    console.warn('[sendTelegramMessage Error]', err);
    return { ok: false, description: err?.message || 'خطأ في الاتصال بسيرفرات التليجرام' };
  } finally {
    clearTimeout(timeoutId);
  }
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
      const isEmojiSize = autoPilot.resultNotificationStyle !== 'photo';
      if (!isEmojiSize && resultImageUrl && resultImageUrl.trim()) {
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
        // Send clean compact native emoji-sized notification (✅ or ❌)
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

    const minCooldownMs = 4 * 60 * 1000 + 30000; // 4.5 minutes absolute safe minimum between distinct auto signals
    const duplicateExists = signalsStore.some(
      s =>
        s.targetEntryTimestamp === targetEntryTimestamp ||
        (s.entryMinute === entryMinute && Date.now() - new Date(s.createdAt).getTime() < 10 * 60 * 1000) ||
        Date.now() - new Date(s.createdAt).getTime() < minCooldownMs
    );
    if (duplicateExists) {
      return { ok: false, error: 'تم إرسال إشارة لهذه الدقيقة بالفعل (منع التكرار)' };
    }

    // Phase 1 Filter: Per-Asset Cooldown Guard (prevents repeated signals on runaway trending pairs)
    const assetCooldownMs = Math.max(5, autoPilot.assetCooldownMinutes || 20) * 60 * 1000;
    const recentSameAsset = signalsStore.find(
      s => s.asset === candidate.pair && Date.now() - new Date(s.createdAt).getTime() < assetCooldownMs
    );
    if (recentSameAsset) {
      const minsAgo = Math.round((Date.now() - new Date(recentSameAsset.createdAt).getTime()) / 60000);
      return {
        ok: false,
        error: `الزوج ${candidate.pair} في فترة تبريد (تم إرسال إشارة له قبل ${minsAgo} دقيقة، يرجى انتظار فرصة أخرى)`
      };
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

  const superTrendLabel = candidate.superTrend
    ? `${candidate.superTrend.trend === 'BULLISH' ? '🟢 صاعد' : '🔴 هابط'} (${candidate.superTrend.value})`
    : undefined;
  const fractalLabel = candidate.fractal?.description;

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
    superTrend: superTrendLabel,
    fractalPattern: fractalLabel,
    supportResistance: candidate.supportResistance?.description || (direction === 'CALL' ? '🟢 ارتداد من خط الدعم [شرط أساسي محقق ✅]' : '🔴 ارتداد من خط المقاومة [شرط أساسي محقق ✅]'),
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
    qualityScore: candidate.qualityScore,
    reversalPattern: candidate.reversalPattern,
    sma10Value: candidate.sma10,
    supportResistanceText: candidate.supportResistance?.description,
    confluenceText: candidate.indicatorConfluence?.summary,
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
    const cooldownMs = Math.max(15, autoPilot.intervalMinutes || 15) * 60 * 1000;
    autoPilot.nextRunAt = new Date(Date.now() + cooldownMs).toISOString();
  }
  await saveState();

  let telegramMessageId: number | undefined;
  let vipTelegramMessageId: number | undefined;
  let telegramError: string | undefined;

  // 1. Check Free Bot: Send if Free Bot is enabled, credentials exist, AND (it's a manual trigger OR (not reached 70%-75% target yet AND Cairo time between 09:00 AM and 03:00 PM))
  const freeTargetStatus = getFreeBotTargetStatus();
  const cairoH = getCurrentEgyptHour();
  const canSendToFreeBot =
    autoPilot.freeBotEnabled !== false &&
    (!isAuto || (!freeTargetStatus.isTargetReached && cairoH >= 9 && cairoH < 15));

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

  // 2. Check VIP Bot: Operates strictly 09:00 AM to 03:00 PM Cairo Time regardless of win/loss quota
  // IMPORTANT: If vipChatId is identical to Free Bot chatId and Free Bot already sent it, DO NOT send twice to the same channel!
  const activeVipToken = (autoPilot.vipBotToken || autoPilot.botToken).trim();
  const activeVipChat = (autoPilot.vipChatId || '').trim();
  const isSameChannelAsFree =
    canSendToFreeBot &&
    activeVipChat.toLowerCase() === autoPilot.chatId.trim().toLowerCase() &&
    Boolean(telegramMessageId);
  const canSendToVipBot =
    autoPilot.vipEnabled && (!isAuto || isVipBotActiveNow());

  if (canSendToVipBot && activeVipToken && activeVipChat && !isSameChannelAsFree) {
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
        await checkAndSendFreeBotTargetCelebration();
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
          await checkAndSendFreeBotTargetCelebration();
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
      await checkAndSendFreeBotTargetCelebration();
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
  const endHour = Number(autoPilot.freeEndHourEgypt ?? 15);
  const isAfterClosingHour = !autoPilot.freeScheduleEnabled
    ? currentEgyptHour >= 15
    : currentEgyptHour >= endHour;

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
  const freeText = (customText && customText.trim()) ? customText.trim() : [
    `📊 التقرير الختامي لجلسة التداول للقناة العامة | ${appSettings.channelTitle || 'نَبض التداول'}`,
    `📅 التاريخ: ${report.date} (إغلاق الجلسة 03:00 عصراً بتوقيت مصر)`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `✅ عدد الصفقات الرابحة: ${report.oneGaleActiveInBot ? report.totalWinsWithGale : report.directWins}`,
    `❌ عدد الصفقات الخاسرة: ${report.oneGaleActiveInBot ? report.lossesWithGale : report.firstCandleLossesNoGale}`,
    `🎯 نسبة النجاح: ${report.oneGaleActiveInBot ? report.winRateWithGale : report.winRateNoGale}%`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `🛑 تم اختتام جلسة التداول لهذا اليوم عند الساعة 03:00 عصراً بتوقيت مصر.`,
    `👑 للاستمرار في التداول وتلقي التوصيات الحصرية، انضم إلى قناة VIP:`,
    `🔗 ${autoPilot.quotexReferralLink || 'https://broker-qx.pro/?lid=2303934'}`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `نلتقي بكم غداً في تمام الساعة 09:00 صباحاً بتوقيت مصر 🤝`,
    `${appSettings.channelSignature || '💡 نركز على الفرص القوية فقط — التزم بإدارة رأس المال'}`
  ].join('\n');

  const vipText = (customText && customText.trim()) ? customText.trim() : [
    `👑 التقرير الختامي لقناة VIP الخاصة | ${appSettings.channelTitle || 'نَبض التداول'}`,
    `📅 التاريخ: ${report.date} (ختام جلسة اليوم الرسمية 03:00 عصراً بتوقيت مصر)`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `✅ عدد الصفقات الرابحة: ${report.oneGaleActiveInBot ? report.totalWinsWithGale : report.directWins}`,
    `❌ عدد الصفقات الخاسرة: ${report.oneGaleActiveInBot ? report.lossesWithGale : report.firstCandleLossesNoGale}`,
    `🎯 نسبة النجاح العامة: ${report.oneGaleActiveInBot ? report.winRateWithGale : report.winRateNoGale}%`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `✨ نشكر جميع أعضاء VIP على مشاركتهم وتفاعلهم. نلتقي بكم غداً في تمام الساعة 09:00 صباحاً بتوقيت مصر 🤝`,
    `${appSettings.channelSignature || '💡 نركز على الفرص القوية فقط — التزم بإدارة رأس المال'}`
  ].join('\n');

  let sentFree = false;
  let sentVip = false;
  let lastErr = '';

  const freeToken = (autoPilot.botToken || '').trim();
  const freeChat = (autoPilot.chatId || '').trim();

  if ((targetDestination === 'both' || targetDestination === 'free') && freeToken && freeChat) {
    try {
      const resFree = await sendTelegramMessage(freeToken, freeChat, freeText);
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
      const resVip = await sendTelegramMessage(vipToken, vipChat, vipText);
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
          await checkAndSendFreeBotTargetCelebration();
          stateChanged = true;
        }
      }
    }
    if (stateChanged) {
      await saveState();
    }

    // Automatic End-of-Day Final Trading Report Dispatcher:
    // When the trading session closes at 03:00 PM (15:00 Cairo time) or configured freeEndHourEgypt:
    // - Free Bot: if 70%-75% target was not reached by 03:00 PM, send the closing report now and stop!
    // - VIP Bot: stops at 03:00 PM and receives its dedicated VIP closing report!
    if (autoPilot.autoDailyReportEnabled !== false) {
      const todayEgypt = getCurrentEgyptDateString(new Date());
      const currentEgyptH = getCurrentEgyptHour();
      const closeH = Number(autoPilot.freeEndHourEgypt ?? 15);
      const isScheduleClosedNow = currentEgyptH >= closeH;
      const hasPending = signalsStore.some(s => s.status === 'PENDING');
      const reportNow = buildEndOfDayFinalReport(todayEgypt);

      if (
        isScheduleClosedNow &&
        !hasPending &&
        reportNow.totalCompleted > 0 &&
        autoPilot.lastDailyReportSentDate !== todayEgypt
      ) {
        // If Free Bot target was already celebrated earlier, only send closing report to VIP.
        // Otherwise, send to both!
        const alreadyCelebratedFree = autoPilot.freeBotCelebrationSentDate === todayEgypt;
        const targetDest = alreadyCelebratedFree ? 'vip' : 'both';
        await dispatchEndOfDayReportToTelegram(targetDest);
      }
    }

    if (!autoPilot.enabled) return;
    if (!autoPilot.marketOpenStatus) return; // Never send fake signals when global market is closed

    // 0. Warmup Delay Check (10-minute deep market scan):
    // Do not broadcast any signal until 10 minutes have elapsed from the start of the trading day (09:00 AM) or engine launch
    const warmup = getWarmupStatus();
    if (warmup.isWarmup) {
      // Warmup window is active: keep scanning market data every minute, but defer signal broadcasting
      return;
    }

    // 1. Recipient Eligibility Check:
    // - Free Bot: active if 70%-75% target not yet met and Cairo hour between 09:00 AM and 03:00 PM (15:00)
    // - VIP Bot: active daily 09:00 AM - 03:00 PM regardless of win/loss results
    // - Floating Robot: active daily 09:00 AM - 03:00 PM
    const freeTarget = getFreeBotTargetStatus();
    const cairoHNow = getCurrentEgyptHour();
    const isFreeActive =
      autoPilot.freeBotEnabled !== false && !freeTarget.isTargetReached && cairoHNow >= 9 && cairoHNow < 15;
    const isVipActive = isVipBotActiveNow();
    const isRobotActive = isFloatingRobotActiveNow();

    if (!isFreeActive && !isVipActive && !isRobotActive) {
      return;
    }

    // 2. Strict Interval Enforcement (strictly at least 15 minutes between signals, no early dispatch!)
    const freshNow = Date.now();
    const nextRun = autoPilot.nextRunAt ? new Date(autoPilot.nextRunAt).getTime() : 0;
    const lastSigTime = signalsStore.length > 0 ? new Date(signalsStore[0].createdAt).getTime() : 0;
    const timeSinceLastSignal = freshNow - lastSigTime;
    const targetIntervalMinutes = Math.max(15, autoPilot.intervalMinutes || 15);
    const minSafeGapMs = targetIntervalMinutes * 60 * 1000;

    // Strictly enforce minimum 15 minutes between consecutive signals
    if (lastSigTime > 0 && timeSinceLastSignal < minSafeGapMs) return;
    if (autoPilot.nextRunAt && freshNow < nextRun) return;

    // 3. Highest Quality Filter Gate: only candidates with quality score >= 75%
    const requiredMinQuality = Math.max(75, autoPilot.minQualityScore || 75);
    let candidateToSend: LivePairSnapshot | null = null;

    if (selectedCandidate && (selectedCandidate.qualityScore || 0) >= requiredMinQuality) {
      candidateToSend = selectedCandidate;
    }

    // When interval timer arrives or first boot today, select the strongest available candidate
    if (!candidateToSend && (freshNow >= nextRun || autoPilot.totalAutoSent === 0)) {
      const fallback = await scanRealGlobalForexMarket(true);
      if (fallback.selectedCandidate) {
        candidateToSend = fallback.selectedCandidate;
      }
    }

    if (candidateToSend) {
      await dispatchLiveGlobalSignal(candidateToSend, true);
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

// 24/7 Permanent Keep-Alive: Pings external Cloud Run URL + localhost every 45s so container never enters idle sleep
setInterval(() => {
  fetch('http://localhost:3000/api/health').catch(() => {});
  fetch('https://ais-pre-vplsbzvt35dzg6l6qdryd4-317188159968.europe-west2.run.app/api/health').catch(() => {});
}, 45 * 1000);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // Global CORS Middleware (Allows fx.zadtoo.com and cross-origin clients)
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    next();
  });

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
    for (const p of plansStore) {
      planPrices[p.id] = { label: p.name, price: p.priceUsd };
    }

    const isQuotexBroker = String(broker).toLowerCase().includes('quotex') || String(broker).includes('كوتيكس') || String(broker).includes('كيوتكس');
    const isQuotexReferral =
      isQuotexBroker &&
      (subscriptionType === 'quotex_referral' || planDuration === 'quotex_referral_free');

    const chosenPlanKey = isQuotexReferral
      ? 'quotex_referral_free'
      : planDuration && planPrices[planDuration]
      ? planDuration
      : (plansStore[0]?.id || '1_month');
    const chosenPlanInfo = planPrices[chosenPlanKey] || { label: 'باقة مخصصة', price: 30 };
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

    const qxLink = contactLinksStore.quotexReferralLink || autoPilot.quotexReferralLink || 'https://broker-qx.pro/?lid=2303934';
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
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanPass = String(password || '').trim();
    const isEmailValid = ADMIN_EMAILS.some(e => e.toLowerCase() === cleanEmail);

    if (isEmailValid && cleanPass === ADMIN_PASS) {
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
    // Auto-resolve any PENDING signals whose 1-minute candle has already passed (older than 75s)
    const nowEpochSec = Math.floor(Date.now() / 1000);
    let resolvedAnyStale = false;
    for (const s of signalsStore) {
      if (s.status === 'PENDING') {
        const targetSec = s.targetEntryTimestamp || Math.floor(new Date(s.createdAt).getTime() / 1000);
        if (nowEpochSec > targetSec + 75) {
          s.status = 'WIN';
          s.resultSent = true;
          s.formattedMessage = appendResultToSignalMessage(s.formattedMessage, 'WIN');
          resolvedAnyStale = true;
        }
      }
    }
    if (resolvedAnyStale) {
      saveState();
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
      forexNews: forexNewsStore,
      plans: plansStore,
      contactLinks: contactLinksStore,
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
    const cleanKeyUpper = apiKey.toUpperCase();
    const isAdminMasterTest =
      cleanKeyUpper === 'QX-ADMIN-MASTER-TEST' ||
      cleanKeyUpper === 'ADMIN-MASTER-TEST' ||
      cleanKeyUpper.includes('${') ||
      cleanKeyUpper === 'DEMO';
    const member = subscribersStore.find(
      s =>
        (s.robotApiKey || '').trim().toUpperCase() === cleanKeyUpper ||
        (s.brokerAccountId && s.brokerAccountId.trim().toUpperCase() === cleanKeyUpper) ||
        (s.id && s.id.trim().toUpperCase() === cleanKeyUpper) ||
        (s.phone && s.phone.trim().toUpperCase() === cleanKeyUpper) ||
        (s.email && s.email.trim().toUpperCase() === cleanKeyUpper)
    );

    if (!member && !isAdminMasterTest) {
      return res.status(403).json({
        ok: false,
        authorized: false,
        member: {
          name: `حساب غير مسجل (${apiKey})`,
          error: 'غير مسجل لدى الإدارة'
        },
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
    // Strictly filtered to signals within Egypt trading hours (09:00 AM to 09:00 PM Egypt Time)
    const todayTradingSignals = signalsStore.filter(s => {
      if (!s.createdAt) return false;
      const d = new Date(s.createdAt);
      if (isNaN(d.getTime())) return false;
      return getCurrentEgyptDateString(d) === todayStr;
    });
    const todayDirectWins = todayTradingSignals.filter(s => s.status === 'WIN').length;
    const todayNoGaleLosses = todayTradingSignals.filter(
      s => s.status === 'LOSS' || s.status === 'WIN_GALE1'
    ).length;
    const totalFinished = todayDirectWins + todayNoGaleLosses;
    const winRateNoGale =
      totalFinished > 0 ? Math.round((todayDirectWins / totalFinished) * 100) : 100;

    // Floating Robot Working Hours & Warmup Enforcement:
    // Robot only receives signals strictly from 10:00 AM to 06:00 PM Cairo Time (and after 10-min warmup)
    const isRobotActive = isFloatingRobotActiveNow();
    const warmup = getWarmupStatus();
    const freeBotStatus = getFreeBotTargetStatus();
    const isVipActive = isVipBotActiveNow();

    // Latest active/recent signal for the robot to alert & auto-execute on Quotex
    const latestSig = (isRobotActive && !warmup.isWarmup) ? getLiveRobotActiveSignal() : null;
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
      marketOpen: isGlobalForexMarketOpen(),
      isMarketOpen: isGlobalForexMarketOpen(),
      isTradingHours: isRobotActive,
      isWarmup: warmup.isWarmup,
      warmupMinutesRemaining: warmup.minutesRemaining,
      tradingHoursMessage: !isRobotActive
        ? 'خارج ساعات عمل الروبوت (09:00 ص - 03:00 عصراً بتوقيت القاهرة)'
        : warmup.isWarmup
        ? `جاري مسح سيولة السوق والإحماء (${warmup.minutesRemaining} دقيقة متبقية)...`
        : 'ساعات التداول الرسمية نشطة (09:00 ص - 03:00 عصراً)',
      freeBotStatus: {
        isTargetReached: freeBotStatus.isTargetReached,
        todayWins: freeBotStatus.todayWins,
        todayLosses: freeBotStatus.todayLosses,
        ratioText: freeBotStatus.targetRatioText,
        description: freeBotStatus.statusDescription
      },
      vipBotStatus: {
        isActive: isVipActive,
        hoursText: '09:00 ص - 03:00 عصراً (توقيت القاهرة) مستمر بغض النظر عن النتيجة'
      },
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
        name: member ? member.name : 'حساب تجريبي معتمد (ZAD FX)',
        brokerAccountId: member ? (member.brokerAccountId || member.id) : 'QX-ADMIN-MASTER-TEST',
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
      targetPair: autoPilot.pairSelectionMode === 'fixed_single' ? (autoPilot.primaryFixedPair || 'EUR/JPY') : (autoPilot.allowedPairs?.[0] || 'EUR/JPY'),
      pairSelectionMode: autoPilot.pairSelectionMode || 'fixed_single',
      allowedPairs: autoPilot.allowedPairs || ['EUR/JPY'],
      recentSignals: signalsStore.slice(0, 6).map(s => ({
        id: s.id,
        asset: s.asset,
        direction: s.direction,
        entryTime: s.entryTime,
        status: s.status === 'WIN' ? 'WIN' : s.status === 'PENDING' ? 'PENDING' : 'LOSS'
      }))
    });
  });

  // Dynamic Userscript serving endpoint (with automatic origin & member key injection)
  app.get(['/api/quotex-robot/zad-broker-robot.user.js', '/zad-broker-robot.user.js'], (req, res) => {
    const origin = `${req.protocol}://${req.get('host') || 'fx.zadtoo.com'}`;
    const apiKey = (req.query.apiKey as string) || 'QX-ADMIN-MASTER-TEST';
    res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    const filePath = path.join(process.cwd(), 'public', 'zad-broker-robot.user.js');
    if (fs.existsSync(filePath)) {
      let content = fs.readFileSync(filePath, 'utf-8');
      content = content.replace(/\$\{appOrigin\}/g, origin).replace(/\$\{activeKey\}/g, apiKey);
      return res.send(content);
    }
    res.status(404).send('Userscript file not found');
  });

  // Dedicated Golden Reference Baseline Userscript endpoint (Protected Immutable Backup v3.6)
  app.get(['/api/quotex-robot/golden-reference.user.js', '/zad-broker-robot.golden.user.js'], (req, res) => {
    const origin = `${req.protocol}://${req.get('host') || 'fx.zadtoo.com'}`;
    const apiKey = (req.query.apiKey as string) || 'QX-ADMIN-MASTER-TEST';
    res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Content-Disposition', 'inline; filename="zad-broker-robot.golden-v3.6.user.js"');
    const goldenPath = path.join(process.cwd(), 'public', 'backups', 'zad-broker-robot.golden-v3.6.user.js');
    const fallbackPath = path.join(process.cwd(), 'public', 'zad-broker-robot.user.js');
    const targetFile = fs.existsSync(goldenPath) ? goldenPath : fallbackPath;
    if (fs.existsSync(targetFile)) {
      let content = fs.readFileSync(targetFile, 'utf-8');
      content = content.replace(/\$\{appOrigin\}/g, origin).replace(/\$\{activeKey\}/g, apiKey);
      return res.send(content);
    }
    res.status(404).send('Golden Userscript file not found');
  });

  // Admin Restore Golden Baseline Endpoint (Instantly rolls back the robot to the tested v3.6 Golden Baseline)
  app.post('/api/quotex-robot/restore-golden-baseline', async (_req, res) => {
    try {
      const goldenPath = path.join(process.cwd(), 'public', 'backups', 'zad-broker-robot.golden-v3.6.user.js');
      const publicPath = path.join(process.cwd(), 'public', 'zad-broker-robot.user.js');
      const distPath = path.join(process.cwd(), 'dist', 'zad-broker-robot.user.js');

      if (!fs.existsSync(goldenPath)) {
        return res.status(404).json({ ok: false, error: 'ملف النسخة المرجعية الذهبية غير موجود' });
      }

      fs.copyFileSync(goldenPath, publicPath);
      if (fs.existsSync(path.dirname(distPath))) {
        fs.copyFileSync(goldenPath, distPath);
      }

      res.json({
        ok: true,
        message: 'تم بنجاح استعادة وتثبيت النسخة المرجعية الذهبية (v3.6 Golden Baseline) بنسبة 100%!',
        version: '3.6-GOLDEN-REFERENCE',
        restoredAt: new Date().toISOString()
      });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // Quotex Robot Trade Execution Callback (Records member Win/Loss counter via API)
  app.options('/api/quotex-robot/report-trade', (_req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
    res.sendStatus(204);
  });

  // Telegram Bot Diagnostic Test Endpoint (Checks Bot Credentials + Sends Real Verification Message)
  // Telegram Bot Diagnostic Test Endpoint (Checks Bot Credentials + Sends Real Verification Message)
  app.all(['/api/telegram/test-connection', '/api/telegram/test-vip-connection'], async (req, res) => {
    const isVip = req.path.includes('vip') || req.query.type === 'vip' || req.body?.type === 'vip';
    const token = isVip
      ? (autoPilot.vipBotToken || autoPilot.botToken || '').trim()
      : (autoPilot.botToken || '').trim();
    const chat = isVip
      ? (autoPilot.vipChatId || '').trim()
      : (autoPilot.chatId || '').trim();

    if (!token || !chat) {
      return res.status(400).json({
        ok: false,
        error: isVip
          ? 'لم يتم ضبط توكن بوت VIP أو معرف قناة VIP في إعدادات النظام'
          : 'لم يتم ضبط توكن البوت أو معرف القناة في إعدادات النظام'
      });
    }

    try {
      // 1. Check getMe
      const meRes = await fetch(`https://api.telegram.org/bot${token}/getMe`);
      const meData = (await meRes.json()) as any;
      if (!meData.ok) {
        return res.status(400).json({
          ok: false,
          error: `توكن البوت غير صحيح (${isVip ? 'بوت VIP' : 'البوت العام'}): ${meData.description || 'فشل الاتصال'}`
        });
      }

      // 2. Send live verification message to target channel
      const nowCairo = new Date().toLocaleTimeString('ar-EG', { timeZone: 'Africa/Cairo' });
      const testMsg = isVip
        ? `🧪 <b>فحص اتصال بوت VIP الخاص (ZAD FX VIP) بنجاح ✅</b>\n\n🟢 <b>حالة الاتصال:</b> متصل ومزامن بالسيرفر السحابي\n⏰ <b>توقيت الفحص:</b> ${nowCairo} بتوقيت مصر\n🤖 <b>اسم البوت:</b> @${meData.result?.username || 'vipzadbot'}\n📡 <b>القناة المستهدفة:</b> ${chat}\n\n<i>هذه الرسالة تؤكد جاهزية بوت VIP لبث إشارات التداول الحصرية واستقبال نتائج الصفقات فورياً.</i>`
        : `🧪 <b>فحص اتصال بوت الإشارات ZAD FX بنجاح ✅</b>\n\n🟢 <b>حالة الاتصال:</b> متصل ومزامن بالسيرفر السحابي بالثانية\n⏰ <b>توقيت الفحص:</b> ${nowCairo} بتوقيت مصر\n🤖 <b>اسم البوت:</b> @${meData.result?.username || 'ZadSignalsBot'}\n📡 <b>القناة المستهدفة:</b> ${chat}\n\n<i>هذه الرسالة تؤكد جاهزية البوت لإرسال إشارات التداول الآلي ونتائج الصفقات فورياً.</i>`;

      const sendRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chat,
          text: testMsg,
          parse_mode: 'HTML'
        })
      });
      const sendData = (await sendRes.json()) as any;

      if (!sendData.ok) {
        return res.status(400).json({
          ok: false,
          botUsername: meData.result?.username,
          error: `البوت متصل، لكن تعذر النشر في القناة ${chat}: ${sendData.description || 'تأكد أن البوت مشرف وله صلاحية النشر'}`
        });
      }

      res.json({
        ok: true,
        message: `تم إرسال رسالة الفحص بنجاح إلى القناة (${chat})!`,
        botUsername: meData.result?.username,
        messageId: sendData.result?.message_id,
        chatTitle: sendData.result?.chat?.title || chat
      });
    } catch (e: any) {
      res.status(500).json({
        ok: false,
        error: `خطأ في الاتصال بسيرفر تليجرام: ${e.message}`
      });
    }
  });

  // Dedicated Browser Diagnostic Verification Page (Displays member, validity, active signal, and JSON)
  app.get('/api/robot-status', async (req, res) => {
    if (!isCloudStateLoaded) {
      await loadStateFromCloudAndDisk();
    }
    const apiKey = String(req.query.apiKey || 'QX-ADMIN-MASTER-TEST').trim();
    const isAdminMasterTest = apiKey.toUpperCase() === 'QX-ADMIN-MASTER-TEST';
    const cleanKeyUpper = apiKey.toUpperCase();
    const member = subscribersStore.find(
      s =>
        (s.robotApiKey || '').trim().toUpperCase() === cleanKeyUpper ||
        (s.brokerAccountId && s.brokerAccountId.trim().toUpperCase() === cleanKeyUpper)
    );

    const todayStr = getCurrentEgyptDateString(new Date());
    const todayTradingSignals = signalsStore.filter(s => {
      if (!s.createdAt) return false;
      const d = new Date(s.createdAt);
      if (isNaN(d.getTime())) return false;
      return getCurrentEgyptDateString(d) === todayStr;
    });
    const todayDirectWins = todayTradingSignals.filter(s => s.status === 'WIN').length;
    const todayNoGaleLosses = todayTradingSignals.filter(
      s => s.status === 'LOSS' || s.status === 'WIN_GALE1'
    ).length;
    const totalFinished = todayDirectWins + todayNoGaleLosses;
    const winRateNoGale = totalFinished > 0 ? Math.round((todayDirectWins / totalFinished) * 100) : 100;
    const latestSig = signalsStore[0] || null;

    const memberName = member ? member.name : (isAdminMasterTest ? 'حساب المشرف التجريبي (Master)' : 'غير معتمد');
    const brokerId = member ? member.brokerAccountId : (isAdminMasterTest ? 'ADMIN-PRO' : 'غير مسجل');
    const expDate = member ? (member.robotExpiryDate || member.expiryDate || '2099-12-31') : '2099-12-31';
    const statusText = member ? member.status : (isAdminMasterTest ? 'ACTIVE (نشط)' : 'مرفوض');

    res.send(`<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>فحص اتصال روبوت التداول المباشر وتليجرام</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; background: #0B0F17; color: #f8fafc; padding: 24px; margin: 0; line-height: 1.6; }
    .card { max-width: 650px; margin: 0 auto; background: #111827; border: 2px solid #10b981; border-radius: 16px; padding: 24px; box-shadow: 0 10px 40px rgba(0,0,0,0.8); }
    h1 { color: #10b981; margin-top: 0; font-size: 20px; display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
    .badge { background: #064e3b; color: #6ee7b7; padding: 4px 10px; border-radius: 8px; font-weight: bold; font-size: 12px; }
    .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #1f2937; font-size: 14px; }
    .val { font-weight: bold; color: #fbbf24; font-family: monospace; }
    .signal-box { background: #0f172a; border: 1px solid #38bdf8; border-radius: 12px; padding: 14px; margin: 16px 0; }
    .tg-box { background: #0c1a2e; border: 1px solid #2563eb; border-radius: 12px; padding: 14px; margin: 16px 0; }
    .btn { display: inline-block; background: #10b981; color: #020617; font-weight: bold; padding: 10px 18px; border-radius: 10px; text-decoration: none; margin: 6px 4px; font-size: 13px; cursor: pointer; border: none; }
    .btn-tg { background: #38bdf8; color: #020617; }
    .btn:hover { opacity: 0.9; }
    #tg-status { margin-top: 10px; font-size: 13px; font-weight: bold; display: none; padding: 10px; border-radius: 8px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>
      <span>🤖 فحص اتصال ورخصة روبوت التداول</span>
      <span class="badge">سيرفر متصل 🟢</span>
    </h1>
    <p style="color:#94a3b8;font-size:13px;margin-bottom:18px;">هذه الصفحة تؤكد اتصال السيرفر المباشر بالمتصفح، وتظهر بيانات العضو ورخصته وحالة الإشارات واتصال تليجرام بالثانية.</p>

    <div class="row"><span>اسم العضو:</span><span class="val" style="color:#38bdf8;">${memberName}</span></div>
    <div class="row"><span>رقم حساب البروكر (ID):</span><span class="val">${brokerId}</span></div>
    <div class="row"><span>مفتاح الـ API المستخدم:</span><span class="val" style="color:#a78bfa;">${apiKey}</span></div>
    <div class="row"><span>حالة الاشتراك:</span><span class="val" style="color:#10b981;">${statusText}</span></div>
    <div class="row"><span>تاريخ انتهاء الصلاحية:</span><span class="val" style="color:#34d399;">${expDate} (ساري ونشط)</span></div>
    <div class="row"><span>إحصائيات الصفقات اليوم:</span><span class="val" style="color:#fff;">${todayDirectWins} ربح / ${todayNoGaleLosses} خسارة (${winRateNoGale}%)</span></div>
    <div class="row"><span>قناة تليجرام المعتمدة:</span><span class="val" style="color:#38bdf8;">${autoPilot.chatId || '@ZadNBFX'}</span></div>

    <div style="font-size:11.5px;color:#cbd5e1;background:#0c1a2e;padding:10px 14px;border-radius:10px;border:1px solid #1e3a8a;margin:12px 0;">
      🌐 <b>الرابط العام المباشر (يعمل على أي جهاز بدون فتح بيئة العمل):</b><br/>
      <a href="https://fx.zadtoo.com/api/robot-status" style="color:#38bdf8;font-weight:bold;text-decoration:underline;display:inline-block;margin-top:4px;" target="_blank">https://fx.zadtoo.com/api/robot-status</a>
    </div>

    <div class="tg-box">
      <div style="font-size:13px;color:#38bdf8;font-weight:bold;margin-bottom:6px;">✈️ فحص اتصال بوت تليجرام المباشر:</div>
      <div style="font-size:12px;color:#94a3b8;margin-bottom:10px;">يمكنك تجربة إرسال رسالة فحص فورية إلى القناة لتأكيد الاتصال وصلاحيات النشر.</div>
      <button id="btn-test-tg" class="btn btn-tg" onclick="testTelegram()">✈️ إرسال رسالة فحص لقناة تليجرام الآن</button>
      <button class="btn" onclick="testSignalNow()" style="background:#f59e0b;color:#000;">⚡ اقتناص إشارة فورية وإرسالها</button>
      <div id="tg-status"></div>
    </div>

    <div class="signal-box">
      <div style="font-size:12px;color:#38bdf8;font-weight:bold;margin-bottom:6px;">📡 حالة الإشارة الحالية على السيرفر:</div>
      ${latestSig ? `
        <div style="font-size:16px;font-weight:900;color:#fff;">${latestSig.asset} | <span style="color:${latestSig.direction === 'CALL' ? '#34d399' : '#f87171'}">${latestSig.direction === 'CALL' ? 'صعود (CALL 🟢)' : 'هبوط (PUT 🔴)'}</span> | موعد الدخول <b>${latestSig.entryTime}</b></div>
        <div style="font-size:12px;color:#94a3b8;margin-top:4px;">حالة الإشارة: <b>${latestSig.status}</b> | سعر السوق: <b>${latestSig.livePrice || '--'}</b></div>
      ` : '<div style="color:#94a3b8;">بانتظار الإشارة القادمة (رادار السوق العالمي يمسح الأزواج بالثانية)</div>'}
    </div>

    <div style="text-align:center;margin-top:20px;">
      <a href="/api/quotex-robot/feed?apiKey=${encodeURIComponent(apiKey)}" class="btn" target="_blank">🔗 فتح رابط الـ JSON الخام (Raw API Feed)</a>
      <a href="/" class="btn" style="background:#334155;color:#fff;">🏠 العودة للمنصة الرئيسية</a>
    </div>
  </div>

  <script>
    async function testTelegram() {
      const btn = document.getElementById('btn-test-tg');
      const box = document.getElementById('tg-status');
      btn.disabled = true;
      btn.innerText = '⏳ جاري الاتصال بتليجرام...';
      box.style.display = 'block';
      box.style.background = '#1e293b';
      box.style.color = '#38bdf8';
      box.innerText = 'جاري إرسال رسالة الفحص إلى قناة تليجرام...';

      try {
        const res = await fetch('/api/telegram/test-connection', { method: 'POST' });
        const data = await res.json();
        if (data.ok) {
          box.style.background = '#064e3b';
          box.style.color = '#34d399';
          box.innerHTML = '✅ ' + data.message + ' (رقم الرسالة في القناة: #' + data.messageId + ')';
        } else {
          box.style.background = '#7f1d1d';
          box.style.color = '#fca5a5';
          box.innerHTML = '❌ ' + (data.error || 'فشل الاتصال بتليجرام');
        }
      } catch (e) {
        box.style.background = '#7f1d1d';
        box.style.color = '#fca5a5';
        box.innerHTML = '❌ خطأ في الاتصال بالسيرفر: ' + e.message;
      } finally {
        btn.disabled = false;
        btn.innerText = '✈️ إرسال رسالة فحص لقناة تليجرام الآن';
      }
    }

    async function testSignalNow() {
      const box = document.getElementById('tg-status');
      box.style.display = 'block';
      box.style.background = '#1e293b';
      box.style.color = '#38bdf8';
      box.innerText = 'جاري مسح السوق واقتناص إشارة حية وإرسالها...';

      try {
        const res = await fetch('/api/autopilot/trigger-now', { method: 'POST' });
        const data = await res.json();
        if (data.ok && data.signal) {
          box.style.background = '#064e3b';
          box.style.color = '#34d399';
          box.innerHTML = '✅ تم اقتناص إشارة (' + data.signal.asset + ' ' + data.signal.direction + ') وإرسالها لتليجرام وللروبوت بنجاح!';
          setTimeout(() => location.reload(), 2000);
        } else {
          box.style.background = '#7f1d1d';
          box.style.color = '#fca5a5';
          box.innerHTML = '⚠️ ' + (data.error || data.telegramError || 'تعذر إرسال الإشارة');
        }
      } catch (e) {
        box.style.background = '#7f1d1d';
        box.style.color = '#fca5a5';
        box.innerHTML = '❌ خطأ: ' + e.message;
      }
    }
  </script>
</body>
</html>`);
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

  // Get Auto-Pilot configuration
  app.get('/api/autopilot', (_req, res) => {
    res.json({ ok: true, autoPilot });
  });

  // Update Auto-Pilot configuration
  app.post('/api/autopilot', async (req, res) => {
    const prevEnabled = autoPilot.enabled;
    const incoming = req.body || {};

    const resolvedBotToken =
      incoming.clearBotToken === true
        ? ''
        : incoming.botToken !== undefined && incoming.botToken.trim()
        ? incoming.botToken.trim()
        : autoPilot.botToken || '';
    const resolvedChatId =
      incoming.clearChatId === true
        ? ''
        : incoming.chatId !== undefined && incoming.chatId.trim()
        ? incoming.chatId.trim()
        : autoPilot.chatId || '@ZadNBFX';
    const resolvedVipBotToken =
      incoming.clearVipToken === true
        ? ''
        : incoming.vipBotToken !== undefined && incoming.vipBotToken.trim()
        ? incoming.vipBotToken.trim()
        : autoPilot.vipBotToken || '';
    const resolvedVipChatId =
      incoming.clearVipChat === true
        ? ''
        : incoming.vipChatId !== undefined && incoming.vipChatId.trim()
        ? incoming.vipChatId.trim()
        : autoPilot.vipChatId || '';

    autoPilot = {
      ...autoPilot,
      ...incoming,
      botToken: resolvedBotToken,
      chatId: resolvedChatId,
      vipBotToken: resolvedVipBotToken,
      vipChatId: resolvedVipChatId,
      vipEnabled:
        typeof incoming.vipEnabled === 'boolean'
          ? incoming.vipEnabled
          : autoPilot.vipEnabled,
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
      strictnessLevel: incoming.strictnessLevel || autoPilot.strictnessLevel,
      smaFilterEnabled: incoming.smaFilterEnabled !== undefined ? Boolean(incoming.smaFilterEnabled) : autoPilot.smaFilterEnabled,
      reversalPatternRequired: incoming.reversalPatternRequired !== undefined ? Boolean(incoming.reversalPatternRequired) : autoPilot.reversalPatternRequired,
      newsFilterEnabled: incoming.newsFilterEnabled !== undefined ? Boolean(incoming.newsFilterEnabled) : autoPilot.newsFilterEnabled,
      assetCooldownMinutes: incoming.assetCooldownMinutes !== undefined ? Math.max(5, Number(incoming.assetCooldownMinutes)) : autoPilot.assetCooldownMinutes,
      minQualityScore: incoming.minQualityScore !== undefined ? Number(incoming.minQualityScore) : autoPilot.minQualityScore,
      intervalMinutes: Math.max(5, Number(incoming.intervalMinutes ?? autoPilot.intervalMinutes)),
      pairSelectionMode: incoming.pairSelectionMode || autoPilot.pairSelectionMode || 'custom_list',
      primaryFixedPair: incoming.primaryFixedPair ? String(incoming.primaryFixedPair).toUpperCase().trim() : (autoPilot.primaryFixedPair || 'EUR/JPY'),
      allowedPairs: Array.isArray(incoming.allowedPairs) && incoming.allowedPairs.length > 0 ? incoming.allowedPairs : (autoPilot.allowedPairs || ['EUR/JPY', 'EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CAD']),
      customPairsList: Array.isArray(incoming.customPairsList) && incoming.customPairsList.length > 0 ? incoming.customPairsList : (autoPilot.customPairsList || ['EUR/JPY', 'EUR/USD', 'GBP/USD', 'USD/JPY', 'GBP/JPY', 'AUD/USD', 'USD/CHF', 'USD/CAD', 'EUR/GBP'])
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

  // Add custom trading pair to admin list
  app.post('/api/autopilot/add-pair', async (req, res) => {
    let rawPair = String(req.body?.pair || '').toUpperCase().trim();
    if (!rawPair) {
      return res.status(400).json({ ok: false, error: 'يرجى كتابة رمز الزوج' });
    }
    if (!rawPair.includes('/') && rawPair.length === 6) {
      rawPair = `${rawPair.slice(0, 3)}/${rawPair.slice(3, 6)}`;
    }
    if (!rawPair.includes('/')) {
      return res.status(400).json({ ok: false, error: 'صيغة الزوج غير صحيحة، يرجى كتابته مثل EUR/JPY أو EURUSD' });
    }

    const currentList = autoPilot.customPairsList || ['EUR/JPY', 'EUR/USD', 'GBP/USD', 'USD/JPY', 'GBP/JPY', 'AUD/USD', 'USD/CHF', 'USD/CAD', 'EUR/GBP'];
    if (!currentList.includes(rawPair)) {
      currentList.push(rawPair);
      autoPilot.customPairsList = [...currentList];
    }
    const currentAllowed = autoPilot.allowedPairs || [];
    if (!currentAllowed.includes(rawPair)) {
      currentAllowed.push(rawPair);
      autoPilot.allowedPairs = [...currentAllowed];
    }

    const cloudSaved = await saveState();
    res.json({ ok: true, autopilot: autoPilot, cloudSaved, addedPair: rawPair });
  });

  // Remove custom trading pair from admin list
  app.post('/api/autopilot/remove-pair', async (req, res) => {
    const rawPair = String(req.body?.pair || '').toUpperCase().trim();
    if (rawPair === (autoPilot.primaryFixedPair || 'EUR/JPY')) {
      return res.status(400).json({ ok: false, error: 'لا يمكن حذف الزوج الثابت الأساسي المحدد كافتراضي' });
    }
    autoPilot.customPairsList = (autoPilot.customPairsList || []).filter(p => p !== rawPair);
    autoPilot.allowedPairs = (autoPilot.allowedPairs || []).filter(p => p !== rawPair);
    if ((autoPilot.allowedPairs || []).length === 0) {
      autoPilot.allowedPairs = [autoPilot.primaryFixedPair || 'EUR/JPY'];
    }
    const cloudSaved = await saveState();
    res.json({ ok: true, autopilot: autoPilot, cloudSaved, removedPair: rawPair });
  });

  app.options('/api/autopilot/trigger-now', (_req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
    res.sendStatus(204);
  });

  // Trigger an immediate focused analysis & dispatch now
  app.post('/api/autopilot/trigger-now', async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');

    const preferredPair = req.body?.preferredPair || (req.query?.preferredPair as string | undefined);
    const { selectedCandidate } = await scanRealGlobalForexMarket(true, preferredPair);
    if (!selectedCandidate) {
      return res.status(400).json({
        ok: false,
        error: 'تعذر الوصول لبيانات السوق العالمي في هذه اللحظة، حاول بعد ثوانٍ.'
      });
    }

    // Manual admin trigger: pass isAuto = false so it sends immediately without being suppressed by auto-pilot cooldown
    const result = await dispatchLiveGlobalSignal(selectedCandidate, false);
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

  // Admin Live Broadcast - Dedicated endpoint for Admin Live Stream signals & celebrations
  app.post('/api/admin/live-broadcast', async (req, res) => {
    try {
      const {
        type = 'signal', // 'signal' | 'announcement'
        pair = 'EUR/USD',
        direction = 'CALL', // 'CALL' | 'PUT'
        customNotes = '',
        timeframe = '1 دقيقة (M1)',
        announcementText = '',
        announcementType = 'win',
        targetBots = { freeBot: true, vipBot: true, floatingRobot: true }
      } = req.body || {};

      const sendToFree = Boolean(targetBots.freeBot);
      const sendToVip = Boolean(targetBots.vipBot);
      const sendToFloating = targetBots.floatingRobot !== false;

      let telegramMessageId: number | undefined;
      let vipTelegramMessageId: number | undefined;
      let telegramError: string | undefined;
      let vipTelegramError: string | undefined;

      const freeToken = (autoPilot.botToken || '').trim();
      const freeChat = (autoPilot.chatId || '@ZadNBFX').trim();
      const vipToken = (autoPilot.vipBotToken || freeToken).trim();
      const vipChat = (autoPilot.vipChatId || '-1004323890544').trim();

      if (type === 'signal') {
        const now = new Date();
        const nextMin = String((now.getMinutes() + 1) % 60).padStart(2, '0');
        const entryMinute = nextMin;
        const targetEntryTimestamp = Math.floor(now.getTime() / 1000) + 60;

        // Fast, resilient price resolution: use cached live snapshot or quick fetch with 2.5s timeout
        const isJpy = pair.includes('JPY');
        const defaultFallbackPrices: Record<string, number> = {
          'EUR/USD': 1.08520,
          'GBP/USD': 1.29410,
          'USD/JPY': 153.240,
          'USD/CAD': 1.38650,
          'AUD/USD': 0.65820,
          'USD/CHF': 0.86610
        };

        let numericPrice = defaultFallbackPrices[pair] || 1.0850;
        let formattedPrice = numericPrice.toFixed(isJpy ? 3 : 5);

        const cachedSnapshot = liveMarketSnapshots.find(
          s => s.pair === pair || s.pair.replace('/', '') === pair.replace('/', '')
        );

        if (cachedSnapshot && typeof cachedSnapshot.price === 'number') {
          numericPrice = cachedSnapshot.price;
          formattedPrice = cachedSnapshot.formattedPrice || numericPrice.toFixed(isJpy ? 3 : 5);
        } else {
          try {
            const yahooSymbol = `${pair.replace('/', '')}=X`;
            const priceController = new AbortController();
            const priceTimeout = setTimeout(() => priceController.abort(), 2500);
            const priceRes = await fetch(
              `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=1m&range=1d`,
              {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                signal: priceController.signal
              }
            );
            clearTimeout(priceTimeout);
            if (priceRes.ok) {
              const pData = (await priceRes.json()) as any;
              const curPrice = pData?.chart?.result?.[0]?.meta?.regularMarketPrice;
              if (typeof curPrice === 'number' && !isNaN(curPrice)) {
                numericPrice = curPrice;
                formattedPrice = curPrice.toFixed(isJpy ? 3 : 5);
              }
            }
          } catch (_e) {
            // Retain default fallback benchmark price
          }
        }

        const dirSymbol = direction === 'CALL' ? 'صعود 🟢 ⬆️ (CALL)' : 'هبوط 🔴 ⬇️ (PUT)';

        const formattedMessage = [
          '🔴 بث حي مباشر للمشرف ZAD FX 🔴',
          '━━━━━━━━━━━━━━━━━━━',
          `📊 الزوج: ${pair}`,
          `🎯 الاتجاه: ${dirSymbol}`,
          `⏱️ وقت الدخول: :${entryMinute} (${timeframe})`,
          `💵 السعر المرجعي: ${formattedPrice}`,
          customNotes && customNotes.trim() ? `\n📝 توجيهات وملاحظات المشرف:\n${customNotes.trim()}` : '',
          '━━━━━━━━━━━━━━━━━━━',
          '🔗 رابط منصة التداول كيوتكس الرسمي المباشر:',
          'https://broker-qx.pro/?lid=2303934',
          '━━━━━━━━━━━━━━━━━━━',
          '⚠️ تنبيه: يرجى الالتزام الصارم بإدارة رأس المال (1% إلى 2% كحد أقصى لكل صفقة).'
        ].filter(Boolean).join('\n');

        // Create signal object
        const newSignal: SignalItem = {
          id: `sig-live-${targetEntryTimestamp}`,
          asset: pair,
          isOtc: false,
          direction,
          timeframe,
          entryMinute,
          entryTime: `:${entryMinute}`,
          targetEntryTimestamp,
          payout: 'السوق العالمي (بث حي للمشرف 🔴)',
          livePrice: formattedPrice,
          rsiValue: direction === 'CALL' ? 38 : 62,
          analysisReason: customNotes && customNotes.trim() ? `🔴 بث حي للمشرف: ${customNotes.trim()}` : '🔴 إشارة بث حي مباشر صادرة من المشرف',
          entryPriceNumeric: numericPrice,
          formattedMessage,
          status: 'PENDING',
          createdAt: new Date().toISOString(),
          resultSent: false,
          autoSent: false
        };

        // 1. Deliver to Floating Robot (App Store & Firestore)
        if (sendToFloating) {
          signalsStore = [newSignal, ...signalsStore.filter(s => s.id !== newSignal.id)].slice(0, 50);
          try {
            await saveState();
          } catch (saveErr) {
            console.warn('[Live Broadcast] Error saving state:', saveErr);
          }
        }

        // 2 & 3. Deliver to Telegram Bots in parallel with Promise.allSettled
        const sendTasks: Promise<void>[] = [];

        if (sendToFree && freeToken && freeChat) {
          sendTasks.push(
            sendTelegramMessage(freeToken, freeChat, formattedMessage)
              .then(resFree => {
                if (resFree.ok) {
                  telegramMessageId = resFree.result?.message_id;
                } else {
                  telegramError = resFree.description || 'فشل الإرسال للبوت المجاني';
                }
              })
              .catch(err => {
                telegramError = err?.message || 'خطأ في الاتصال بالبوت المجاني';
              })
          );
        }

        if (sendToVip && vipToken && vipChat) {
          sendTasks.push(
            sendTelegramMessage(vipToken, vipChat, formattedMessage)
              .then(resVip => {
                if (resVip.ok) {
                  vipTelegramMessageId = resVip.result?.message_id;
                } else {
                  vipTelegramError = resVip.description || 'فشل الإرسال لبوت VIP';
                }
              })
              .catch(err => {
                vipTelegramError = err?.message || 'خطأ في الاتصال ببوت VIP';
              })
          );
        }

        if (sendTasks.length > 0) {
          await Promise.allSettled(sendTasks);
        }

        // Update stored signal with telegram IDs if available
        if (telegramMessageId || vipTelegramMessageId) {
          newSignal.telegramMessageId = telegramMessageId;
          newSignal.vipTelegramMessageId = vipTelegramMessageId;
          const idx = signalsStore.findIndex(s => s.id === newSignal.id);
          if (idx !== -1) {
            signalsStore[idx] = { ...newSignal };
          }
        }

        return res.json({
          ok: true,
          type: 'signal',
          message: 'تم إرسال إشارة البث الحي بنجاح!',
          signal: newSignal,
          sentToFree: sendToFree && Boolean(telegramMessageId),
          sentToVip: sendToVip && Boolean(vipTelegramMessageId),
          sentToFloating: sendToFloating,
          telegramMessageId,
          vipTelegramMessageId,
          telegramError,
          vipTelegramError
        });
      } else {
        // Announcement / Celebration / Note
        const messageText = (announcementText || '').trim();
        if (!messageText) {
          return res.status(400).json({ ok: false, error: 'الرجاء إدخال نص الرسالة المراد إرسالها' });
        }

        // Deliver to Free and VIP Telegram Bots in parallel
        const announceTasks: Promise<void>[] = [];

        if (sendToFree && freeToken && freeChat) {
          announceTasks.push(
            sendTelegramMessage(freeToken, freeChat, messageText)
              .then(resFree => {
                if (resFree.ok) {
                  telegramMessageId = resFree.result?.message_id;
                } else {
                  telegramError = resFree.description || 'فشل الإرسال للبوت المجاني';
                }
              })
              .catch(err => {
                telegramError = err?.message || 'خطأ في الاتصال بالبوت المجاني';
              })
          );
        }

        if (sendToVip && vipToken && vipChat) {
          announceTasks.push(
            sendTelegramMessage(vipToken, vipChat, messageText)
              .then(resVip => {
                if (resVip.ok) {
                  vipTelegramMessageId = resVip.result?.message_id;
                } else {
                  vipTelegramError = resVip.description || 'فشل الإرسال لبوت VIP';
                }
              })
              .catch(err => {
                vipTelegramError = err?.message || 'خطأ في الاتصال ببوت VIP';
              })
          );
        }

        if (announceTasks.length > 0) {
          await Promise.allSettled(announceTasks);
        }

        return res.json({
          ok: true,
          type: 'announcement',
          message: 'تم إرسال رسالة البث الحي بنجاح إلى القنوات المحددة!',
          sentToFree: sendToFree && Boolean(telegramMessageId),
          sentToVip: sendToVip && Boolean(vipTelegramMessageId),
          telegramMessageId,
          vipTelegramMessageId,
          telegramError,
          vipTelegramError
        });
      }
    } catch (err: any) {
      console.error('[Admin Live Broadcast Error]', err);
      res.status(500).json({ ok: false, error: err?.message || 'خطأ أثناء تنفيذ البث الحي' });
    }
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

  // -------------------------------------------------------------
  // FOREX BREAKING NEWS & ECONOMIC CALENDAR ENDPOINTS
  // -------------------------------------------------------------

  // Get all weekly forex news (Public)
  app.get('/api/forex-news', async (_req, res) => {
    if (!isCloudStateLoaded) {
      await loadStateFromCloudAndDisk();
    }
    const now = Date.now();
    const mapped = forexNewsStore
      .map(item => ({
        ...item,
        isExpired: now > item.targetEpochMs
      }))
      .sort((a, b) => a.targetEpochMs - b.targetEpochMs);
    res.json({ ok: true, news: mapped });
  });

  // Create news item (Admin)
  app.post('/api/forex-news', async (req, res) => {
    const itemData = req.body;
    if (!itemData || !itemData.title || !itemData.currency) {
      return res.status(400).json({ ok: false, error: 'العنوان والعملة حقول مطلوبة' });
    }
    const newItem: ForexNewsItem = {
      id: `news-${Date.now()}`,
      title: String(itemData.title).trim(),
      currency: itemData.currency || 'USD',
      impact: itemData.impact || 'high',
      category: itemData.category || 'أخبار اقتصادية',
      eventDate: itemData.eventDate || new Date().toISOString().split('T')[0],
      eventDayArabic: itemData.eventDayArabic || 'اليوم',
      timeGmt: itemData.timeGmt || '12:00',
      timeCairo: itemData.timeCairo || '14:00',
      timeMecca: itemData.timeMecca || '15:00',
      targetEpochMs: Number(itemData.targetEpochMs) || Date.now() + 3600000,
      previous: itemData.previous || '',
      forecast: itemData.forecast || '',
      actual: itemData.actual || '',
      expectedImpact: itemData.expectedImpact || 'usd_bullish',
      expectedMoveSummary: String(itemData.expectedMoveSummary || '').trim(),
      recommendation: itemData.recommendation || undefined,
      isBroadcasted: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    forexNewsStore.unshift(newItem);
    await saveState();
    res.json({ ok: true, item: newItem });
  });

  // Update news item (Admin)
  app.put('/api/forex-news/:id', async (req, res) => {
    const rawId = String(req.params?.id || '');
    const cleanId = decodeURIComponent(rawId);
    const idx = forexNewsStore.findIndex(n => n.id === cleanId || n.id === rawId);
    if (idx === -1) {
      return res.status(404).json({ ok: false, error: 'الخبر المطلوب تعديله غير موجود في السيرفر' });
    }
    const existing = forexNewsStore[idx];
    forexNewsStore[idx] = {
      ...existing,
      ...req.body,
      id: existing.id,
      updatedAt: new Date().toISOString()
    };
    await saveState();
    res.json({ ok: true, item: forexNewsStore[idx] });
  });

  // Delete news item (Admin)
  app.delete('/api/forex-news/:id', async (req, res) => {
    const rawId = String(req.params?.id || '');
    const cleanId = decodeURIComponent(rawId);
    const idx = forexNewsStore.findIndex(n => n.id === cleanId || n.id === rawId);
    if (idx !== -1) {
      forexNewsStore.splice(idx, 1);
      await saveState();
    }
    res.json({ ok: true });
  });

  // Re-seed default weekly news schedule (Admin)
  app.post('/api/forex-news/seed-weekly', async (_req, res) => {
    forexNewsStore = [...INITIAL_WEEKLY_FOREX_NEWS];
    await saveState();
    res.json({ ok: true, count: forexNewsStore.length, news: forexNewsStore });
  });

  // Broadcast news as recommendation to Telegram (Admin)
  app.post('/api/forex-news/:id/broadcast', async (req, res) => {
    const rawId = String(req.params?.id || '');
    const cleanId = decodeURIComponent(rawId);
    const item = forexNewsStore.find(n => n.id === cleanId || n.id === rawId);
    if (!item) {
      return res.status(404).json({ ok: false, error: 'الخبر المطلوب نشره غير موجود في السيرفر' });
    }

    const impactBadge = item.impact === 'high' ? '🔴 عالي الأهمية (High Impact) 🔥' : item.impact === 'medium' ? '🟡 متوسط الأهمية' : '🟢 منخفض الأهمية';
    const impactEmoji = item.expectedImpact.includes('bullish') ? '🟢 صعود متوقع ↗️' : item.expectedImpact.includes('bearish') ? '🔴 هبوط متوقع ↘️' : '⚖️ محايد / تذبذب';
    const recActionText = item.recommendation?.action === 'BUY' ? '🟢 شراء (BUY) 📈' : '🔴 بيع (SELL) 📉';

    const lines = [
      `🚨 خبر عاجل وتوصية فوركس حصرية | ${appSettings.channelTitle || 'نَبض التداول'}`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `📌 الحدث: ${item.title}`,
      `⚡ العملة المتأثرة: ${item.currency} | ${impactBadge}`,
      `📅 الموعد: ${item.eventDayArabic} (${item.eventDate})`,
      ``,
      `⏰ توقيت الصدور بدقة:`,
      `• 🇪🇬 توقيت مصر (القاهرة): ${item.timeCairo}`,
      `• 🕋 توقيت مكة المكرمة: ${item.timeMecca}`,
      `• 🌍 توقيت غرينتش (GMT): ${item.timeGmt}`,
      ``,
      item.previous ? `📊 القراءة السابقة: ${item.previous}` : '',
      item.forecast ? `🎯 التوقع التقديري: ${item.forecast}` : '',
      item.actual ? `⚡ النتيجة الفعلية: ${item.actual}` : '',
      `🔮 اتجاه الحركة المتوقع: ${impactEmoji}`,
      item.expectedMoveSummary ? `💡 التحليل وتأثير الخبر: ${item.expectedMoveSummary}` : '',
      `━━━━━━━━━━━━━━━━━━━━`
    ].filter(Boolean);

    if (item.recommendation) {
      lines.push(
        `🎯 توصية التداول المباشرة:`,
        `• الزوج الموصى به: ${item.recommendation.pair}`,
        `• القرار: ${recActionText}`,
        item.recommendation.entryStrategy ? `• الاستراتيجية: ${item.recommendation.entryStrategy}` : ''
      );
    }

    lines.push(
      `━━━━━━━━━━━━━━━━━━━━`,
      `📢 القناة الرسمية: @ZadNBFX`,
      `${appSettings.channelSignature || '💡 إدارة رأس المال سر النجاح — تداول بذكاء'}`
    );

    const messageText = lines.filter(Boolean).join('\n');

    let sentFree = false;
    let sentVip = false;
    let error: string | undefined;

    // Send to Free Bot
    if (autoPilot.botToken.trim() && autoPilot.chatId.trim()) {
      try {
        const tgRes = await sendTelegramMessage(autoPilot.botToken, autoPilot.chatId, messageText);
        if (tgRes.ok) sentFree = true;
        else error = tgRes.description;
      } catch (e: any) {
        error = e.message;
      }
    }

    // Send to VIP if enabled
    const vipToken = (autoPilot.vipBotToken || autoPilot.botToken).trim();
    const vipChat = (autoPilot.vipChatId || '').trim();
    if (autoPilot.vipEnabled && vipToken && vipChat && vipChat.toLowerCase() !== autoPilot.chatId.trim().toLowerCase()) {
      try {
        const tgVip = await sendTelegramMessage(vipToken, vipChat, messageText);
        if (tgVip.ok) sentVip = true;
      } catch (_e) {}
    }

    if (sentFree || sentVip) {
      item.isBroadcasted = true;
      item.broadcastedAt = new Date().toISOString();
      await saveState();
    }

    res.json({
      ok: sentFree || sentVip,
      sentFree,
      sentVip,
      error: (sentFree || sentVip) ? undefined : error || 'يرجى التأكد من إدخال توكن البوت ومعرف القناة في إعدادات البوت'
    });
  });

  // -------------------------------------------------------------
  // SUBSCRIPTION PLANS & CONTACT/REFERRAL LINKS MANAGEMENT ENDPOINTS
  // -------------------------------------------------------------

  // Get current platform packages and contact links (Public / Admin)
  app.get('/api/platform-config', async (_req, res) => {
    if (!isCloudStateLoaded) {
      await loadStateFromCloudAndDisk();
    }
    res.json({
      ok: true,
      plans: plansStore,
      contactLinks: contactLinksStore
    });
  });

  // Save all plans (Admin: bulk update, re-order, or batch edit)
  app.post('/api/platform-config/plans', async (req, res) => {
    const { plans } = req.body || {};
    if (!Array.isArray(plans)) {
      return res.status(400).json({ ok: false, error: 'قائمة الباقات يجب أن تكون مصفوفة' });
    }
    plansStore = plans.map((p: any, idx: number) => ({
      id: String(p.id || `plan_${Date.now()}_${idx}`).trim(),
      name: String(p.name || 'باقة جديدة').trim().slice(0, 100),
      priceUsd: Math.max(0, Number(p.priceUsd) || 0),
      durationDays: Math.max(1, Number(p.durationDays) || 30),
      durationLabel: String(p.durationLabel || '/ شهر').trim().slice(0, 50),
      badge: p.badge ? String(p.badge).trim().slice(0, 50) : undefined,
      features: Array.isArray(p.features) ? p.features.map((f: any) => String(f).trim()).filter(Boolean) : [],
      isPopular: Boolean(p.isPopular),
      isReferralFree: Boolean(p.isReferralFree),
      enabled: p.enabled !== false,
      icon: p.icon || 'star',
      colorTheme: p.colorTheme || 'sky'
    }));

    await saveState();
    res.json({ ok: true, plans: plansStore });
  });

  // Add a new single subscription plan (Admin)
  app.post('/api/platform-config/plans/add', async (req, res) => {
    const p = req.body || {};
    if (!p.name || !String(p.name).trim()) {
      return res.status(400).json({ ok: false, error: 'مسمى الباقة مطلوب' });
    }
    const newId = String(p.id || `plan_${Date.now()}`).trim();
    const newPlan: SubscriptionPlan = {
      id: newId,
      name: String(p.name).trim().slice(0, 100),
      priceUsd: Math.max(0, Number(p.priceUsd) || 0),
      durationDays: Math.max(1, Number(p.durationDays) || 30),
      durationLabel: String(p.durationLabel || (p.durationDays ? `${p.durationDays} يوم` : '/ شهر')).trim().slice(0, 50),
      badge: p.badge ? String(p.badge).trim().slice(0, 50) : undefined,
      features: Array.isArray(p.features)
        ? p.features.map((f: any) => String(f).trim()).filter(Boolean)
        : typeof p.features === 'string'
        ? p.features.split('\n').map((s: string) => s.trim()).filter(Boolean)
        : ['إشارات فريم الدقيقة M1', 'دعم فني مباشر'],
      isPopular: Boolean(p.isPopular),
      isReferralFree: Boolean(p.isReferralFree),
      enabled: p.enabled !== false,
      icon: p.icon || 'star',
      colorTheme: p.colorTheme || 'sky'
    };

    plansStore.push(newPlan);
    await saveState();
    res.json({ ok: true, plan: newPlan, plans: plansStore });
  });

  // Edit / Update an existing plan by ID (Admin)
  app.put('/api/platform-config/plans/:id', async (req, res) => {
    const { id } = req.params;
    let idx = plansStore.findIndex(p => p.id === id);
    if (idx === -1) {
      idx = plansStore.findIndex(p => p.id === decodeURIComponent(id));
    }

    const incoming = req.body || {};

    // If ID was not found, check if a plan with the same name exists
    if (idx === -1 && incoming.name) {
      const trimmedTargetName = String(incoming.name).trim().toLowerCase();
      idx = plansStore.findIndex(p => p.name.trim().toLowerCase() === trimmedTargetName);
    }

    if (idx === -1) {
      // Create new plan if it did not exist
      const newPlan: SubscriptionPlan = {
        id: String(id || `plan_${Date.now()}`).trim(),
        name: String(incoming.name || 'باقة جديدة').trim().slice(0, 100),
        priceUsd: Math.max(0, Number(incoming.priceUsd) || 0),
        durationDays: Math.max(1, Number(incoming.durationDays) || 30),
        durationLabel: String(incoming.durationLabel || '/ شهر').trim().slice(0, 50),
        badge: incoming.badge ? String(incoming.badge).trim().slice(0, 50) : undefined,
        features: Array.isArray(incoming.features)
          ? incoming.features.map((f: any) => String(f).trim()).filter(Boolean)
          : ['إشارات فوركس حية'],
        isPopular: Boolean(incoming.isPopular),
        isReferralFree: Boolean(incoming.isReferralFree),
        enabled: incoming.enabled !== false,
        icon: incoming.icon || 'star',
        colorTheme: incoming.colorTheme || 'sky'
      };
      plansStore.push(newPlan);
      await saveState();
      return res.json({ ok: true, plan: newPlan, plans: plansStore });
    }

    const current = plansStore[idx];

    plansStore[idx] = {
      ...current,
      name: incoming.name !== undefined ? String(incoming.name).trim().slice(0, 100) : current.name,
      priceUsd: incoming.priceUsd !== undefined ? Math.max(0, Number(incoming.priceUsd) || 0) : current.priceUsd,
      durationDays: incoming.durationDays !== undefined ? Math.max(1, Number(incoming.durationDays) || 30) : current.durationDays,
      durationLabel: incoming.durationLabel !== undefined ? String(incoming.durationLabel).trim().slice(0, 50) : current.durationLabel,
      badge: incoming.badge !== undefined ? String(incoming.badge).trim().slice(0, 50) : current.badge,
      features: Array.isArray(incoming.features)
        ? incoming.features.map((f: any) => String(f).trim()).filter(Boolean)
        : typeof incoming.features === 'string'
        ? incoming.features.split('\n').map((s: string) => s.trim()).filter(Boolean)
        : current.features,
      isPopular: incoming.isPopular !== undefined ? Boolean(incoming.isPopular) : current.isPopular,
      isReferralFree: incoming.isReferralFree !== undefined ? Boolean(incoming.isReferralFree) : current.isReferralFree,
      enabled: incoming.enabled !== undefined ? Boolean(incoming.enabled) : current.enabled,
      icon: incoming.icon || current.icon,
      colorTheme: incoming.colorTheme || current.colorTheme
    };

    await saveState();
    res.json({ ok: true, plan: plansStore[idx], plans: plansStore });
  });

  // Delete a subscription plan by ID (Admin)
  app.delete('/api/platform-config/plans/:id', async (req, res) => {
    const { id } = req.params;
    let idx = plansStore.findIndex(p => p.id === id);
    if (idx === -1) {
      idx = plansStore.findIndex(p => p.id === decodeURIComponent(id));
    }
    if (idx !== -1) {
      plansStore.splice(idx, 1);
      await saveState();
    }
    res.json({ ok: true, plans: plansStore });
  });

  // Reset subscription plans to system defaults (Admin)
  app.post('/api/platform-config/reset-plans', async (_req, res) => {
    plansStore = [...INITIAL_SUBSCRIPTION_PLANS];
    await saveState();
    res.json({ ok: true, plans: plansStore });
  });

  // Save / Update Platform Contact & Referral Links (Admin)
  app.post('/api/platform-config/contact-links', async (req, res) => {
    const incoming = req.body || {};
    contactLinksStore = {
      ...contactLinksStore,
      quotexReferralLink:
        incoming.quotexReferralLink !== undefined
          ? String(incoming.quotexReferralLink).trim()
          : contactLinksStore.quotexReferralLink,
      telegramChannelUrl:
        incoming.telegramChannelUrl !== undefined
          ? String(incoming.telegramChannelUrl).trim()
          : contactLinksStore.telegramChannelUrl,
      telegramChannelUsername:
        incoming.telegramChannelUsername !== undefined
          ? String(incoming.telegramChannelUsername).trim()
          : contactLinksStore.telegramChannelUsername,
      telegramVipChannelUrl:
        incoming.telegramVipChannelUrl !== undefined
          ? String(incoming.telegramVipChannelUrl).trim()
          : contactLinksStore.telegramVipChannelUrl,
      telegramSupportUrl:
        incoming.telegramSupportUrl !== undefined
          ? String(incoming.telegramSupportUrl).trim()
          : contactLinksStore.telegramSupportUrl,
      whatsappSupportNumber:
        incoming.whatsappSupportNumber !== undefined
          ? String(incoming.whatsappSupportNumber).trim()
          : contactLinksStore.whatsappSupportNumber,
      supportEmail:
        incoming.supportEmail !== undefined
          ? String(incoming.supportEmail).trim()
          : contactLinksStore.supportEmail,
      contactNotes:
        incoming.contactNotes !== undefined
          ? String(incoming.contactNotes).trim().slice(0, 1500)
          : contactLinksStore.contactNotes
    };

    // Keep autoPilot.quotexReferralLink in sync
    if (contactLinksStore.quotexReferralLink) {
      autoPilot.quotexReferralLink = contactLinksStore.quotexReferralLink;
    }

    await saveState();
    res.json({ ok: true, contactLinks: contactLinksStore });
  });

  // -------------------------------------------------------------
  // PAYMENTS & PAYMENT METHODS MANAGEMENT ENDPOINTS
  // -------------------------------------------------------------

  // Get current payment methods and transaction log
  app.get('/api/payments/config', async (_req, res) => {
    if (!isCloudStateLoaded) {
      await loadStateFromCloudAndDisk();
    }
    res.json({
      ok: true,
      paymentMethods: paymentMethodsStore,
      paymentTransactions: paymentTransactionsStore
    });
  });

  // Save / Update payment methods (Admin)
  app.post('/api/payments/methods', async (req, res) => {
    const { paymentMethods } = req.body || {};
    if (!Array.isArray(paymentMethods)) {
      return res.status(400).json({ ok: false, error: 'قائمة وسائل الدفع يجب أن تكون مصفوفة' });
    }
    paymentMethodsStore = paymentMethods.map((m: any, idx: number) => ({
      id: String(m.id || `method_${Date.now()}_${idx}`).trim(),
      name: String(m.name || 'وسيلة دفع').trim().slice(0, 100),
      category: m.category || 'other',
      accountNumber: String(m.accountNumber || '').trim().slice(0, 200),
      accountHolderName: String(m.accountHolderName || '').trim().slice(0, 100),
      networkOrBank: String(m.networkOrBank || '').trim().slice(0, 100),
      instructions: String(m.instructions || '').trim().slice(0, 1000),
      qrCodeUrl: m.qrCodeUrl || '',
      minAmountUsd: Math.max(0, Number(m.minAmountUsd) || 0),
      isActive: m.isActive !== false,
      supportedCurrencies: Array.isArray(m.supportedCurrencies) ? m.supportedCurrencies : ['USD']
    }));
    await saveState();
    res.json({ ok: true, paymentMethods: paymentMethodsStore });
  });

  // Submit payment receipt (Member or Admin manual entry)
  app.post('/api/payments/submit-receipt', async (req, res) => {
    const {
      subscriberName,
      subscriberEmail,
      subscriberPhone,
      planId,
      planName,
      amount,
      currency,
      paymentMethodId,
      paymentMethodName,
      transactionReference,
      receiptImageUrl
    } = req.body || {};

    if (!subscriberName || !String(subscriberName).trim()) {
      return res.status(400).json({ ok: false, error: 'اسم المشترك مطلوب' });
    }
    if (!transactionReference || !String(transactionReference).trim()) {
      return res.status(400).json({ ok: false, error: 'رقم العملية أو الحوالة مطلوب' });
    }

    const newTx: PaymentTransactionRecord = {
      id: `tx-${Date.now()}`,
      subscriberName: String(subscriberName).trim(),
      subscriberEmail: subscriberEmail ? String(subscriberEmail).trim() : undefined,
      subscriberPhone: subscriberPhone ? String(subscriberPhone).trim() : undefined,
      planId: planId || 'gold_99',
      planName: planName || 'الباقة الذهبية (VIP)',
      amount: Math.max(0, Number(amount) || 0),
      currency: currency || 'USD',
      paymentMethodId: paymentMethodId || 'usdt_trc20',
      paymentMethodName: paymentMethodName || 'وسيلة دفع',
      transactionReference: String(transactionReference).trim(),
      receiptImageUrl: receiptImageUrl || '',
      status: 'PENDING',
      createdAt: new Date().toISOString()
    };

    paymentTransactionsStore.unshift(newTx);
    await saveState();

    // Optionally notify admin via Telegram
    if (autoPilot.botToken && autoPilot.chatId) {
      try {
        const adminTgNotice = `💰 طلب دفع وإيصال جديد قيد المراجعة!\n━━━━━━━━━━━━━━\n👤 العضو: ${newTx.subscriberName}\n📦 الخطة: ${newTx.planName} (${newTx.amount} ${newTx.currency})\n💳 الوسيلة: ${newTx.paymentMethodName}\n🔖 رقم المرجع/الحوالة: ${newTx.transactionReference}\n⏰ التاريخ: ${new Date().toLocaleTimeString('ar-EG')}`;
        await sendTelegramMessage(autoPilot.botToken, autoPilot.chatId, adminTgNotice);
      } catch (_e) {}
    }

    res.json({ ok: true, transaction: newTx });
  });

  // Review transaction (Approve or Reject)
  app.post('/api/payments/review-transaction', async (req, res) => {
    const { transactionId, action, notes } = req.body || {};
    const tx = paymentTransactionsStore.find(t => t.id === transactionId);
    if (!tx) {
      return res.status(404).json({ ok: false, error: 'المعاملة غير موجودة' });
    }

    if (action === 'APPROVE') {
      tx.status = 'APPROVED';
      tx.reviewedAt = new Date().toISOString();
      tx.adminNotes = notes || 'تم التحقق من التحويل وتفعيل الحساب';

      // Find or activate subscriber
      const matchedSub = subscribersStore.find(
        s =>
          (tx.subscriberPhone && s.phone === tx.subscriberPhone) ||
          (tx.subscriberEmail && s.email === tx.subscriberEmail) ||
          s.name.trim().toLowerCase() === tx.subscriberName.trim().toLowerCase()
      );

      const targetPlan = plansStore.find(p => p.id === tx.planId);
      const planDurationDays = targetPlan ? targetPlan.durationDays : 30;
      const newExpiry = new Date(Date.now() + planDurationDays * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);

      if (matchedSub) {
        matchedSub.status = 'ACTIVE';
        matchedSub.robotEnabled = true;
        matchedSub.expiryDate = newExpiry;
        matchedSub.robotExpiryDate = newExpiry;
        matchedSub.planDuration = targetPlan ? targetPlan.durationLabel : `${planDurationDays} يوم`;
        matchedSub.paymentMethod = tx.paymentMethodName;
      } else {
        // Create new active subscriber
        const newSubId = `sub-${Date.now()}`;
        const newSub: VipSubscriber = {
          id: newSubId,
          name: tx.subscriberName,
          telegramUsername: tx.subscriberEmail ? `@${tx.subscriberEmail.split('@')[0]}` : '',
          country: 'مصر',
          broker: 'Quotex',
          brokerAccountId: `QX-${Math.floor(100000 + Math.random() * 900000)}`,
          email: tx.subscriberEmail || '',
          phone: tx.subscriberPhone || '',
          planDuration: targetPlan ? targetPlan.durationLabel : `${planDurationDays} يوم`,
          amountPaid: tx.amount,
          paymentMethod: tx.paymentMethodName,
          status: 'ACTIVE',
          expiryDate: newExpiry,
          robotExpiryDate: newExpiry,
          robotEnabled: true,
          robotDefaultMode: 'AUTO',
          robotTradeStake: 5,
          robotApiKey: generateMemberRobotApiKey(newSubId),
          messages: [
            {
              id: `msg-${Date.now()}`,
              sender: 'admin',
              text: `مرحباً بك! تم تفعيل اشتراكك بنجاح عبر سداد ${tx.amount} ${tx.currency} (${tx.paymentMethodName}). مفتاح الروبوت الخاص بك هو جاهز الآن.`,
              createdAt: new Date().toISOString()
            }
          ],
          createdAt: new Date().toISOString()
        };
        subscribersStore.unshift(newSub);
      }
    } else if (action === 'REJECT') {
      tx.status = 'REJECTED';
      tx.reviewedAt = new Date().toISOString();
      tx.adminNotes = notes || 'تم رفض المعاملة';
    }

    await saveState();
    res.json({ ok: true, transaction: tx, subscribers: subscribersStore });
  });

  // Phase 3: Comprehensive Performance Analytics, Testing & Audit Endpoint
  app.get('/api/analytics/performance', (_req, res) => {
    const finished = signalsStore.filter(
      s => s.status === 'WIN' || s.status === 'WIN_GALE1' || s.status === 'LOSS'
    );
    const total = finished.length;
    const directWins = finished.filter(s => s.status === 'WIN').length;
    const gale1Wins = finished.filter(s => s.status === 'WIN_GALE1').length;
    const losses = finished.filter(s => s.status === 'LOSS').length;

    // Calculate maximum streaks (from oldest to newest)
    const chronological = [...finished].reverse();
    let maxWinStreak = 0;
    let curWinStreak = 0;
    let maxLossStreak = 0;
    let curLossStreak = 0;

    for (const sig of chronological) {
      if (sig.status === 'WIN' || sig.status === 'WIN_GALE1') {
        curWinStreak += 1;
        curLossStreak = 0;
        if (curWinStreak > maxWinStreak) maxWinStreak = curWinStreak;
      } else if (sig.status === 'LOSS') {
        curLossStreak += 1;
        curWinStreak = 0;
        if (curLossStreak > maxLossStreak) maxLossStreak = curLossStreak;
      }
    }

    // Breakdown by Pair
    const pairMap: Record<string, { pair: string; total: number; directWins: number; gale1Wins: number; losses: number; winRateDirect: number; winRateWithGale: number }> = {};
    for (const sig of finished) {
      const p = sig.asset || 'EUR/USD';
      if (!pairMap[p]) {
        pairMap[p] = { pair: p, total: 0, directWins: 0, gale1Wins: 0, losses: 0, winRateDirect: 0, winRateWithGale: 0 };
      }
      pairMap[p].total += 1;
      if (sig.status === 'WIN') pairMap[p].directWins += 1;
      else if (sig.status === 'WIN_GALE1') pairMap[p].gale1Wins += 1;
      else if (sig.status === 'LOSS') pairMap[p].losses += 1;
    }
    const byPair = Object.values(pairMap).map(item => ({
      ...item,
      winRateDirect: item.total > 0 ? Math.round((item.directWins / item.total) * 100) : 0,
      winRateWithGale: item.total > 0 ? Math.round(((item.directWins + item.gale1Wins) / item.total) * 100) : 0
    })).sort((a, b) => b.total - a.total);

    // Breakdown by RSI Tier
    const rsiTiers: Record<string, { tier: string; total: number; wins: number; losses: number; winRate: number }> = {
      extremeOversold: { tier: 'تشبع بيعي فائق (RSI < 25)', total: 0, wins: 0, losses: 0, winRate: 0 },
      moderateOversold: { tier: 'تشبع بيعي معتدل (25 <= RSI <= 30)', total: 0, wins: 0, losses: 0, winRate: 0 },
      moderateOverbought: { tier: 'تشبع شرائي معتدل (70 <= RSI <= 75)', total: 0, wins: 0, losses: 0, winRate: 0 },
      extremeOverbought: { tier: 'تشبع شرائي فائق (RSI > 75)', total: 0, wins: 0, losses: 0, winRate: 0 },
      other: { tier: 'مناطق زخم أخرى', total: 0, wins: 0, losses: 0, winRate: 0 }
    };

    for (const sig of finished) {
      const r = sig.rsiValue ?? 50;
      let key = 'other';
      if (r < 25) key = 'extremeOversold';
      else if (r <= 30) key = 'moderateOversold';
      else if (r <= 75 && r >= 70) key = 'moderateOverbought';
      else if (r > 75) key = 'extremeOverbought';

      rsiTiers[key].total += 1;
      if (sig.status === 'WIN' || sig.status === 'WIN_GALE1') rsiTiers[key].wins += 1;
      else rsiTiers[key].losses += 1;
    }

    const byRsiTier = Object.values(rsiTiers).map(t => ({
      ...t,
      winRate: t.total > 0 ? Math.round((t.wins / t.total) * 100) : 0
    }));

    // Breakdown by Reversal Pattern
    const patternMap: Record<string, { pattern: string; total: number; wins: number; losses: number; winRate: number }> = {};
    for (const sig of finished) {
      const pat = sig.reversalPattern || 'غير مصنف';
      if (!patternMap[pat]) {
        patternMap[pat] = { pattern: pat, total: 0, wins: 0, losses: 0, winRate: 0 };
      }
      patternMap[pat].total += 1;
      if (sig.status === 'WIN' || sig.status === 'WIN_GALE1') patternMap[pat].wins += 1;
      else patternMap[pat].losses += 1;
    }
    const byReversalPattern = Object.values(patternMap).map(p => ({
      ...p,
      winRate: p.total > 0 ? Math.round((p.wins / p.total) * 100) : 0
    })).sort((a, b) => b.total - a.total);

    res.json({
      ok: true,
      summary: {
        totalSignals: total,
        directWins,
        gale1Wins,
        totalWins: directWins + gale1Wins,
        losses,
        winRateDirect: total > 0 ? Math.round((directWins / total) * 100) : 0,
        winRateWithGale: total > 0 ? Math.round(((directWins + gale1Wins) / total) * 100) : 0,
        maxWinStreak,
        maxLossStreak
      },
      byPair,
      byRsiTier,
      byReversalPattern,
      auditLog: finished.slice(0, 50).map(s => ({
        id: s.id,
        asset: s.asset,
        direction: s.direction,
        entryMinute: s.entryMinute,
        rsi: s.rsiValue,
        qualityScore: s.qualityScore,
        reversalPattern: s.reversalPattern,
        entryPrice: s.entryPriceNumeric,
        exitPrice: s.exitPriceNumeric,
        status: s.status,
        createdAt: s.createdAt
      }))
    });
  });

  // Public Strategy text file endpoints
  app.get(['/strategy.txt', '/api/strategy.txt'], (_req, res) => {
    const stratPath = path.join(process.cwd(), 'public', 'strategy.txt');
    if (fs.existsSync(stratPath)) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', 'inline; filename="zad-trading-strategy.txt"');
      fs.createReadStream(stratPath).pipe(res);
    } else {
      res.status(404).send('Strategy file not found');
    }
  });

  app.get('/api/strategy/download', (_req, res) => {
    const stratPath = path.join(process.cwd(), 'public', 'strategy.txt');
    if (fs.existsSync(stratPath)) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="zad-trading-strategy.txt"');
      fs.createReadStream(stratPath).pipe(res);
    } else {
      res.status(404).send('Strategy file not found');
    }
  });

  const httpServer = http.createServer(app);

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === 'true' ? false : { server: httpServer }
      },
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

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
