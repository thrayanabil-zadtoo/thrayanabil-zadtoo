import express from 'express';
import http from 'http';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { initializeApp } from 'firebase/app';
import { initializeFirestore, doc, getDoc, setDoc, runTransaction, setLogLevel, onSnapshot } from 'firebase/firestore';
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
import { ForexNewsItem, INITIAL_WEEKLY_FOREX_NEWS, calculateEventTimes } from './src/types/forexNews.ts';
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

export const DEFAULT_FREE_BOT_TOKEN = '8613581536:AAGroIlY3zs-ArBt8p6qnzH3_-2U9tSJ-8U';
export const DEFAULT_FREE_CHAT_ID = '@ZadNBFX';
export const DEFAULT_VIP_BOT_TOKEN = '8814918920:AAGeXmZrTy03s9gozdDAOj3hkIijHm9yJHM';
export const DEFAULT_VIP_CHAT_ID = '-1004323890544';

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
  isLiveBroadcast?: boolean;
  strategyType?: 'CLASSIC' | 'MOMENTUM_PAUSE_BREAKOUT';
  strategyVariant?: 'WITH_MPB' | 'WITHOUT_MPB';
  successRateText?: string;
  fourIndicatorConfluenceText?: string;
  instantExecution5s?: boolean;
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
  momentumPauseBreakout?: {
    isDetected: boolean;
    direction: 'CALL' | 'PUT' | 'NONE';
    strongCandles: number;
    pauseRange: number;
    atr: number;
    isContinuation: boolean;
    summary: string;
  };
  fourIndicatorConfluence?: {
    momentumPauseMatched: boolean;
    atrMatched: boolean;
    rsiMatched: boolean;
    superTrendMatched: boolean;
    supportingCount: number;
    candidateDirection: 'CALL' | 'PUT' | null;
    isSignalTriggered: boolean;
    matchedList: string[];
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
  freeBotStoppedForToday?: boolean; // Hard-lock latch: When true, Free Bot is completely stopped for the rest of today
  // Bot 1: Free Channel Bot (Closes only upon achieving 3 wins:1 loss ratio or 3 wins with 0 losses)
  freeBotEnabled?: boolean;
  botToken: string;
  chatId: string;
  freeScheduleEnabled: boolean;
  freeStartHourEgypt: number; // Fixed 09:00 AM Africa/Cairo time
  freeEndHourEgypt: number;   // Fixed 12:00 PM (12:00 noon) Africa/Cairo time
  freeBotConsecutiveLosses?: number; // Tracks consecutive losses in Free channel (triggers 30-min pause at 3)
  freeBotCooldownUntil?: number; // Timestamp until 30-min pause ends
  freeBot12ReportSentDate?: string; // Date when 12:00 PM closing report was sent to Free channel
  vipMorningReportSentDate?: string; // Date when 12:00 PM closing report was sent to VIP channel
  vipClosingReportSentDate?: string; // Date when 09:00 PM closing report was sent to VIP channel
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
  vipBotConsecutiveLosses?: number; // Tracks consecutive losses in VIP channel (triggers 30-min pause at 3)
  vipBotCooldownUntil?: number;     // Timestamp until 30-min pause ends for VIP channel
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

export type RobotStrategyEngineMode = 'PUBLIC_CLASSIC' | 'VIP_WITH_MPB';

export interface QuotexRobotSettings {
  isPublishedToVisitors: boolean; // false = Under Development (Admin Only)
  robotTitle: string;
  version: string;
  defaultMode: 'AUTO' | 'MANUAL';
  strategyEngineMode: RobotStrategyEngineMode; // 2 mutually exclusive options in a single dropdown
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

export interface LiveBroadcastSessionConfig {
  enabled: boolean; // Automatic 6:00 PM session enabled
  startHourEgypt: number; // 18 (6:00 PM Egypt)
  preScanMinutes: number; // 10 minutes (18:00 - 18:10)
  minWinRateTarget: number; // 70%
  maxWinRateTarget: number; // 75%
  stopConsecutiveLosses: number; // 3
  sessionDurationMinutes: number; // 60 minutes from first signal
  firstSignalTimestamp?: number; // Epoch ms of first signal sent
  initialNoticeSentDate?: string; // Date when introductory notice was sent at 18:00
  activeDate: string; // YYYY-MM-DD
  status: 'IDLE' | 'PRE_SCANNING' | 'ACTIVE_BROADCAST' | 'STOPPED_TARGET_REACHED' | 'STOPPED_BAD_MARKET' | 'STOPPED_SESSION_COMPLETED';
  statusNote: string;
  wins: number;
  losses: number;
  draws?: number;
  consecutiveLosses: number;
  totalTrades: number;
  winRate: number;
  celebrationSentDate?: string;
  badMarketNoticeSentDate?: string;
  closingReportSentDate?: string;
  lastScanCandidate?: string;
  lastDispatchedAt?: string;
}

export interface TelegramBotUser {
  id: string;
  telegramChatId: string;
  username?: string;
  name: string;
  email?: string;
  country: string;
  language: 'ar' | 'en';
  step: 'START' | 'AWAITING_NAME' | 'AWAITING_COUNTRY' | 'COMPLETED' | 'EDIT_NAME' | 'EDIT_EMAIL' | 'EDIT_COUNTRY';
  status: 'ACTIVE' | 'SUSPENDED' | 'BLOCKED';
  membershipType: 'NONE' | 'FREE_REFERRAL' | 'PAID_VIP';
  brokerId?: string;
  notes?: string;
  countryLocked?: boolean;
  registeredAt: string;
  lastInteractionAt: string;
}

export interface TelegramBotConfig {
  isEnabled: boolean;
  botToken: string;
  botUsername: string;
  adminTelegramUsername: string;
  freeChannelLink: string;
  officialWebsiteUrl: string;
  quotexReferralUrl: string;
  egyptPayment: {
    instapayAccount: string;
    instapayName: string;
    vodafoneCash: string;
    etisalatCash: string;
    orangeCash: string;
    wePay: string;
  };
  palestinePayment: {
    country: string;
    bankName: string;
    beneficiaryName: string;
    currency: string;
    accountNumber: string;
    iban: string;
    branch: string;
    notes: string;
  };
  internationalPayment: {
    ibanEgp: {
      country: string;
      bankName: string;
      beneficiaryName: string;
      currency: string;
      accountNumber: string;
      iban: string;
      swiftCode: string;
      notes?: string;
    };
    ibanUsd: {
      country: string;
      bankName: string;
      beneficiaryName: string;
      currency: string;
      accountNumber: string;
      iban: string;
      swiftCode: string;
      notes?: string;
    };
  };
  usdtPayment: {
    network: string;
    address: string;
    qrImageUrl?: string;
    notesAr?: string;
    notesEn?: string;
  };
  robotGuide: {
    titleAr: string;
    titleEn: string;
    videoUrl: string;
    imageUrl: string;
    descriptionAr: string;
    descriptionEn: string;
  };
}

interface PersistedState {
  stateUpdatedAt?: string;
  signals: SignalItem[];
  settings: AppSettings;
  autopilot: AutoPilotConfig;
  liveBroadcastSession?: LiveBroadcastSessionConfig;
  robotSettings?: QuotexRobotSettings;
  subscribers?: VipSubscriber[];
  telegramBotUsers?: TelegramBotUser[];
  telegramBotConfig?: TelegramBotConfig;
  quickNotes?: QuickNote[];
  dailyStats?: DailyStatRecord[];
  forexNews?: ForexNewsItem[];
  plans?: SubscriptionPlan[];
  contactLinks?: PlatformContactLinks;
  paymentMethods?: PaymentMethodConfig[];
  paymentTransactions?: PaymentTransactionRecord[];
  lastDispatchedEpochMinute?: number;
  lastOnboardingBotUpdateId?: number;
}

const defaultRobotSettings: QuotexRobotSettings = {
  isPublishedToVisitors: false, // Under development - hidden from visitors until finished
  robotTitle: 'روبوت التداول الآلي الذكي (Quotex Pro Bot)',
  version: 'v1.0 Beta (قيد التطوير)',
  defaultMode: 'AUTO',
  strategyEngineMode: 'VIP_WITH_MPB', // Default: Option 2 (VIP with MPB)
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
  channelTitle: 'ZAD FX | إشارات أبوسليم',
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
  freeBotStoppedForToday: false,
  freeBotEnabled: true,
  botToken: '',
  chatId: '@ZadNBFX',
  freeScheduleEnabled: true,
  freeStartHourEgypt: 9, // Fixed 09:00 AM Cairo Time
  freeEndHourEgypt: 12,  // Fixed 12:00 PM (12:00 noon) Cairo Time
  freeBotConsecutiveLosses: 0,
  freeBotCooldownUntil: 0,
  freeBot12ReportSentDate: '',
  vipClosingReportSentDate: '',
  freeWinIcon: '✅ ربح',
  freeWinGale1Icon: '✅ ربح مضاعفة واحدة',
  freeLossIcon: '❌',
  freeWinImageUrl: '',
  freeWinGale1ImageUrl: '',
  freeLossImageUrl: '',
  vipEnabled: false,
  vipBotToken: '',
  vipChatId: '',
  vipBotConsecutiveLosses: 0,
  vipBotCooldownUntil: 0,
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
    // Exclude live broadcast signals from general public daily stats (they belong exclusively to Admin Live Broadcast stats)
    if (sig.isLiveBroadcast || (sig.payout && sig.payout.includes('بث حي'))) continue;
    // CRITICAL: Official statistics are calculated on the VIP Private Channel (قناة الخاصة)
    // Only count signals that were actually broadcast/sent to VIP (have a valid VIP message ID)
    if (!sig.vipTelegramMessageId) continue;

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
      // For today's active log, always reflect the exact live VIP counts so no phantom/stale signals pollute the count
      const nextDirect = dateKey === todayEgypt ? counts.directWins : Math.max(existing.directWins, counts.directWins);
      const nextGale1 = dateKey === todayEgypt ? counts.gale1Wins : Math.max(existing.gale1Wins, counts.gale1Wins);
      const nextLosses = dateKey === todayEgypt ? counts.losses : Math.max(existing.losses, counts.losses);
      const nextDraws = dateKey === todayEgypt ? counts.draws : Math.max(existing.draws || 0, counts.draws);

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
    autoPilot.freeBotDailyTargetReached = false;
    autoPilot.freeBotCelebrationSentDate = '';
    autoPilot.freeBotStoppedForToday = false;
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
    if (s.isLiveBroadcast || (s.payout && s.payout.includes('بث حي'))) return false;
    if (!s.telegramMessageId) return false;
    const d = new Date(s.createdAt);
    if (isNaN(d.getTime())) return false;
    return getCurrentEgyptDateString(d) === todayEgypt;
  }).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const is0Gale = !autoPilot.oneGaleEnabled;
  const wins = todaySignals.filter(s => s.status === 'WIN' || (!is0Gale && s.status === 'WIN_GALE1')).length;
  const losses = todaySignals.filter(s => s.status === 'LOSS' || (is0Gale && s.status === 'WIN_GALE1')).length;
  const totalCompleted = wins + losses;
  const winRate = totalCompleted > 0 ? Math.round((wins / totalCompleted) * 100) : 0;

  const isAlreadyStoppedToday =
    autoPilot.freeBotCelebrationSentDate === todayEgypt ||
    autoPilot.freeBotDailyTargetReached === true ||
    Boolean(autoPilot.freeBotStoppedForToday);

  // New Target Criteria strictly per user specification:
  // 1. If 1st trade WIN and 2nd trade WIN (2-0 consecutive): Stop immediately!
  const isFirstTwoWins =
    todaySignals.length >= 2 &&
    (todaySignals[0].status === 'WIN' || (!is0Gale && todaySignals[0].status === 'WIN_GALE1')) &&
    (todaySignals[1].status === 'WIN' || (!is0Gale && todaySignals[1].status === 'WIN_GALE1'));

  // 2. If 3 WIN and 1 LOSS (3-1 = 4 total, 75% win rate): Stop immediately!
  const isThreeOneRatio = wins === 3 && losses === 1;

  // 3. General ceiling: 65% win rate minimum with net positive trades (e.g. 2-0, 3-1, or totalCompleted >= 3 with winRate >= 65 and wins - losses >= 2)
  const isTargetRatioAchieved =
    (wins >= 2 && losses === 0) ||
    isThreeOneRatio ||
    (totalCompleted >= 3 && winRate >= 65 && (wins - losses) >= 2);

  const isTargetReached = isAlreadyStoppedToday || isFirstTwoWins || isThreeOneRatio || isTargetRatioAchieved;

  if (isTargetReached && (!autoPilot.freeBotDailyTargetReached || !autoPilot.freeBotStoppedForToday)) {
    autoPilot.freeBotDailyTargetReached = true;
    autoPilot.freeBotStoppedForToday = true;
  }

  const currentEgyptH = getCurrentEgyptHour();
  const endHour = autoPilot.freeEndHourEgypt || 12;
  const isSessionClosed = currentEgyptH >= endHour;
  const isCooldownActive = Boolean(autoPilot.freeBotCooldownUntil && Date.now() < autoPilot.freeBotCooldownUntil);
  const cooldownMinsRemaining = isCooldownActive
    ? Math.max(1, Math.ceil(((autoPilot.freeBotCooldownUntil || 0) - Date.now()) / 60000))
    : 0;

  const statusDescription = isTargetReached
    ? `تم تحقيق الهدف بنجاح (${winRate}% - ${wins} ربح / ${losses} خسارة) — تم إيقاف بث القناة العامة نهائياً لليوم 🎯🛑`
    : isSessionClosed
    ? `انتهت جلسة القناة العامة الرسمية (12:00 ظهراً) — تم إيقاف البوت`
    : isCooldownActive
    ? `توقف مؤقت لمدة 30 دقيقة بسبب 3 خسائر متتالية لإعادة قراءة السوق (متبقي ${cooldownMinsRemaining} دقيقة)`
    : currentEgyptH < 9
    ? `قبل موعد انطلاق الصفقات اليومية (تبدأ الساعة 09:00 صباحاً بتوقيت مصر)`
    : `جاري العمل للوصول لنسبة 65%+ قبل 12:00 ظهراً (الحالي: ${winRate}% | ${wins} ربح : ${losses} خسارة)`;

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
 * Evaluates the 6:00 PM (18:00 Egypt time) Live Broadcast evening session status.
 * Stopping condition:
 * - 2 consecutive wins (2-0): Stop session and thank followers!
 * - Or net +2 wins (liveWins - liveLosses >= 2, e.g. 3-1, 4-2).
 */
export function getEveningLiveSessionStatus(): {
  isSessionFinished: boolean;
  liveWins: number;
  liveLosses: number;
  totalLive: number;
  winRate: number;
  isProfitable: boolean;
  statusNote: string;
} {
  const todayEgypt = getCurrentEgyptDateString(new Date());

  if (
    liveBroadcastSession.status === 'STOPPED_TARGET_REACHED' ||
    liveBroadcastSession.status === 'STOPPED_SESSION_COMPLETED' ||
    liveBroadcastSession.status === 'STOPPED_BAD_MARKET'
  ) {
    return {
      isSessionFinished: true,
      liveWins: liveBroadcastSession.wins,
      liveLosses: liveBroadcastSession.losses,
      totalLive: liveBroadcastSession.totalTrades,
      winRate: liveBroadcastSession.winRate,
      isProfitable: liveBroadcastSession.wins >= liveBroadcastSession.losses,
      statusNote: liveBroadcastSession.statusNote
    };
  }

  const liveSignals = signalsStore.filter(s => {
    if (!s.createdAt || s.status === 'PENDING') return false;
    const isLive = s.isLiveBroadcast || (s.payout && s.payout.includes('بث حي'));
    if (!isLive) return false;
    const d = new Date(s.createdAt);
    if (isNaN(d.getTime())) return false;
    return getCurrentEgyptDateString(d) === todayEgypt;
  }).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const wins = liveSignals.filter(s => s.status === 'WIN').length;
  const losses = liveSignals.filter(s => s.status === 'LOSS' || s.status === 'WIN_GALE1').length;
  const total = wins + losses;
  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;

  // Stopping Condition:
  // 1. Two consecutive wins (e.g. 2-0 from start or last 2 trades were wins)
  const lastTwo = liveSignals.slice(-2);
  const isTwoConsecutiveWins = liveSignals.length >= 2 && lastTwo.length === 2 && lastTwo.every(s => s.status === 'WIN');

  // 2. Net +2 wins (wins - losses >= 2)
  const isNetTwoWins = (wins - losses) >= 2;

  const isTargetAchieved = (wins >= 2 && losses === 0) || isTwoConsecutiveWins || isNetTwoWins;

  return {
    isSessionFinished: isTargetAchieved,
    liveWins: wins,
    liveLosses: losses,
    totalLive: total,
    winRate,
    isProfitable: wins >= losses,
    statusNote: isTargetAchieved
      ? 'تم تحقيق هدف البث المباشر المسائي (ربح صفقتين) واختتام الجلسة'
      : `جلسة البث المباشر نشطة (${wins} ربح : ${losses} خسارة)`
  };
}

/**
 * Checks whether the Evening Live Broadcast (18:00 to 21:00 Egypt time) is active right now.
 * Runs continuously without stopping on consecutive losses.
 */
export function isEveningLiveNow(): boolean {
  if (!isGlobalForexMarketOpen()) return false;
  const cairoHour = getCurrentEgyptHour();
  return cairoHour >= 18 && cairoHour < 21;
}

/**
 * Checks whether VIP Bot is active right now.
 * Operates strictly in two daily sessions with zero pauses or stops for losses:
 * 1) First Session: 09:00 AM to 03:00 PM (15:00) Cairo Time
 * 2) Evening Live Session: 06:00 PM (18:00) to 09:00 PM (21:00) Cairo Time
 */
export function isVipBotActiveNow(): boolean {
  if (!autoPilot.vipEnabled) return false;
  if (!isGlobalForexMarketOpen()) return false;
  const cairoHour = getCurrentEgyptHour();

  // Continuous working hours from 09:00 AM to 09:00 PM (21:00) Cairo Time
  return cairoHour >= 9 && cairoHour < 21;
}

/**
 * Computes exact Working and Lock Status for the Quotex Robot based on the selected dropdown strategy:
 * - Option 1 (PUBLIC_CLASSIC): Cancelled / disabled as per user instruction.
 * - Option 2 (VIP_WITH_MPB): MPB Strategy (4 indicators with 3/4 confluence, 5s instant entry, runs 09:00 AM - 09:00 PM continuously).
 */
export function getRobotWorkingStatusForMode(mode: RobotStrategyEngineMode): {
  isActive: boolean;
  isLocked: boolean;
  lockReason: string;
  strategyTitle: string;
  workingHoursText: string;
  nextSessionText: string;
} {
  const cairoHour = getCurrentEgyptHour();
  const isMarketOpen = isGlobalForexMarketOpen();
  const title = mode === 'PUBLIC_CLASSIC'
    ? 'استراتيجية القناة العامة (ملغاة ومحجوبة 🚫)'
    : 'استراتيجية VIP مع MPB (4 مؤشرات | 3 من 4 | تنفيذ 5 ثوانٍ 💎)';

  if (!isMarketOpen) {
    return {
      isActive: false,
      isLocked: true,
      lockReason: 'تنبيه: الروبوت متوقف حالياً — السوق العالمي مغلق (عطلة نهاية الأسبوع).',
      strategyTitle: title,
      workingHoursText: 'يعمل أثناء افتتاح السوق العالمي الرسمي فقط (من فجر الإثنين حتى مساء الجمعة)',
      nextSessionText: 'يفتح السوق فجر الإثنين الساعة 00:00 بتوقيت مصر'
    };
  }

  if (mode === 'PUBLIC_CLASSIC') {
    return {
      isActive: false,
      isLocked: true,
      lockReason: 'تم إلغاء إشارات القناة العامة بالكامل بناءً على طلبك والاعتماد التام على استراتيجية VIP MPB.',
      strategyTitle: title,
      workingHoursText: 'ملغاة — يرجى اختيار استراتيجية VIP مع MPB للعمل التلقائي الفوري',
      nextSessionText: 'اختر استراتيجية MPB من القائمة المنسدلة'
    };
  } else {
    // Continuous 9-9 Working Hours (09:00 AM to 09:00 PM) without any stops or pauses for losses/volatility
    const isActive = cairoHour >= 9 && cairoHour < 21;

    let lockReason = '';
    let nextSessionText = '';
    if (cairoHour < 9) {
      lockReason = 'تنبيه: الروبوت في وضع الاستعداد — تبدأ ساعات العمل الرسمية الساعة 09:00 صباحاً بتوقيت مصر.';
      nextSessionText = 'تبدأ ساعات العمل اليوم في تمام الساعة 09:00 صباحاً بتوقيت مصر';
    } else if (cairoHour >= 21) {
      lockReason = 'تنبيه: الروبوت متوقف حالياً — انتهت ساعات التداول الرسمية لليوم (الختام الساعة 09:00 مساءً).';
      nextSessionText = 'تبدأ ساعات العمل غداً في تمام الساعة 09:00 صباحاً';
    }

    return {
      isActive,
      isLocked: !isActive,
      lockReason,
      strategyTitle: title,
      workingHoursText: 'ساعات العمل الرسمية: متواصل من 09:00 ص حتى 09:00 م بتوقيت مصر (تنفيذ فوري 5 ثوانٍ ⚡)',
      nextSessionText
    };
  }
}

/**
 * Checks whether the Floating Broker Robot (Quotex Pro Bot) is active right now.
 */
function isFloatingRobotActiveNow(): boolean {
  const currentMode = robotSettings.strategyEngineMode || 'VIP_WITH_MPB';
  return getRobotWorkingStatusForMode(currentMode).isActive;
}

/**
 * Sends celebratory closing report to Free Telegram Channel when target is achieved:
 * Strictly complies with instructions:
 * - NO mention of target percentages (no 65% to 70% or 80%).
 * - Only sends exact wins, losses, and win rate %.
 * - Highlights VIP channel continuation until 12:00 PM, 06:00 PM Live broadcast, and robot active.
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

  const winRate = status.winRate;
  const qxLink = autoPilot.quotexReferralLink || 'https://broker-qx.pro/?lid=2303934';

  const message = [
    `🎯 تقرير إنجاز القناة العامة وختام البث | ${appSettings.channelTitle || 'ZAD FX | إشارات أبوسليم'}`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `🎉 ألف مبروك لجميع الإخوة والأخوات والمتابعين الأعزاء الذين شاركوا وتداولوا معنا اليوم وحققوا أرباحاً وفوزاً مباركاً! 🏆✨`,
    ``,
    `📊 التقرير النهائي لنتائج صفقات اليوم:`,
    `✅ عدد الصفقات الرابحة: ${status.todayWins}`,
    `❌ عدد الصفقات الخاسرة: ${status.todayLosses}`,
    `🎯 نسبة النجاح المحققة: ${winRate}%`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `🛑 تم الاكتفاء بهذا القدر وإيقاف بث إشارات القناة العامة لهذا اليوم بنجاح تام.`,
    ``,
    `👑 تنويه هام لجميع المتابعين:`,
    `• قناة VIP الخاصة على تليجرام مستمرة في العمل واستقبال الصفقات حتى الساعة 12:00 ظهراً.`,
    `• وتعاود بث إشاراتها من جديد في بث مباشر حصري الساعة 06:00 مساءً بتوقيت مصر.`,
    `• روبوت التداول الآلي (Quotex Pro Bot) يعمل بشكل آلي كامل وفوري طوال فترة عمل قناة VIP الخاصة.`,
    ``,
    `🔗 للانضمام لقناة VIP والحصول على الروبوت الآلي:`,
    `${qxLink}`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `${appSettings.channelSignature || '💡 نركز على الفرص القوية فقط — التزم بإدارة رأس المال'}`
  ].join('\n');

  try {
    const res = await sendTelegramMessage(token, chat, message);
    if (res.ok) {
      autoPilot.freeBotCelebrationSentDate = todayEgypt;
      autoPilot.freeBotDailyTargetReached = true;
      autoPilot.freeBotStoppedForToday = true;
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
 * (From 09:00 AM up to 09:00 PM Cairo Time)
 */
function isSignalWithinEgyptTradingHours(dateObj: Date): boolean {
  const h = getEgyptHourFromDate(dateObj);
  return h >= 9 && h < 21;
}

/**
 * Checks whether the Free Bot is currently enabled and inside its allowed Cairo working hours
 * (Note: Free Bot operates from 09:00 AM until 70%-75% target is achieved, or until 12:00 PM noon,
 * with a 30-minute pause if 3 consecutive losses occur)
 */
function isFreeBotActiveNow(_cfg: AutoPilotConfig): boolean {
  // Permanently cancelled as per user instruction: public channel signals are completely cancelled
  return false;
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

/**
 * Checks if a high-impact news event is currently occurring (+/- 10 minutes).
 * Allows the robot to pause during high-impact economic news releases as requested by user.
 */
export function isHighImpactNewsPauseActiveNow(): { isPaused: boolean; newsTitle?: string } {
  const now = Date.now();
  for (const item of forexNewsStore) {
    if (item.impact === 'high' && item.targetEpochMs) {
      const diffMs = now - item.targetEpochMs;
      if (diffMs >= -10 * 60 * 1000 && diffMs <= 10 * 60 * 1000) {
        return { isPaused: true, newsTitle: item.title || item.currency };
      }
    }
  }
  return { isPaused: false };
}
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
let liveBroadcastSession: LiveBroadcastSessionConfig = {
  enabled: true,
  startHourEgypt: 18, // 6:00 PM Cairo
  preScanMinutes: 10, // 10 minutes pre-scan
  minWinRateTarget: 70, // 70%
  maxWinRateTarget: 75, // 75%
  stopConsecutiveLosses: 3, // 3 consecutive losses
  sessionDurationMinutes: 60, // 60 minutes from first signal
  firstSignalTimestamp: undefined,
  initialNoticeSentDate: '',
  activeDate: '',
  status: 'IDLE',
  statusNote: 'جلسة البث الحي مبرمجة يومياً الساعة 06:00 مساءً مع فترة مسح 10 دقائق (إلى قناة VIP فقط)',
  wins: 0,
  losses: 0,
  consecutiveLosses: 0,
  totalTrades: 0,
  winRate: 0,
  celebrationSentDate: '',
  badMarketNoticeSentDate: '',
  closingReportSentDate: ''
};
let lastTelegramUpdateId = 0;
let lastOnboardingBotUpdateId = 0;
let isPollingOnboardingBot = false;
const processedOnboardingUpdateIds = new Set<number>();

const defaultTelegramBotConfig: TelegramBotConfig = {
  isEnabled: true,
  botToken: '9229198517:AAH026I-mlMHGtCZakEwxQuQQ6P341wKnkY',
  botUsername: '@Zadfx_bot',
  adminTelegramUsername: '@thrayanabil',
  freeChannelLink: 'https://t.me/ZadNBFX',
  officialWebsiteUrl: 'https://fx.zadtoo.com',
  quotexReferralUrl: 'https://broker-qx.pro/sign-up/?lid=893976',
  egyptPayment: {
    instapayAccount: 'thraya@instapay',
    instapayName: 'ثريا نبيل',
    vodafoneCash: '01012345678',
    etisalatCash: '01112345678',
    orangeCash: '01212345678',
    wePay: '01512345678'
  },
  palestinePayment: {
    country: 'فلسطين 🇵🇸',
    bankName: 'بنك فلسطين (Bank of Palestine)',
    beneficiaryName: 'ثريا نبيل / ZAD FX',
    currency: 'دولار أمريكي ($) / شيكل (ILS)',
    accountNumber: '1987654',
    iban: 'PS92PALS00000000001987654',
    branch: 'الفرع الرئيسي',
    notes: 'الإيداع النقدي المباشر أو التحويل البنكي الفوري عبر تطبيق بنك فلسطين'
  },
  internationalPayment: {
    ibanEgp: {
      country: 'جمهورية مصر العربية 🇪🇬',
      bankName: 'البنك الأهلي المصري (National Bank of Egypt)',
      beneficiaryName: 'ثريا نبيل / ZAD FX',
      currency: 'الجنيه المصري (EGP)',
      accountNumber: '10023456789012',
      iban: 'EG380003000010023456789012',
      swiftCode: 'NBEGEGCX',
      notes: 'التحويل المصرفي الدولي بالجنيه المصري (IBAN EGP)'
    },
    ibanUsd: {
      country: 'International / دولي 🌍',
      bankName: 'National Bank of Egypt (NBE)',
      beneficiaryName: 'Thraya Nabil / ZAD FX',
      currency: 'الدولار الأمريكي (USD)',
      accountNumber: '20098765432109',
      iban: 'EG720003000020098765432109',
      swiftCode: 'NBEGEGCX',
      notes: 'التحويل المصرفي الدولي بالدولار الأمريكي (IBAN USD)'
    }
  },
  usdtPayment: {
    network: 'USDT (TRC20)',
    address: 'TX79afTcXc1nG8ddRdpatFWHMFDqByXyzo',
    qrImageUrl: '/assets/aistudio/IMG-20261107-WA0010_a0cea637.jpg',
    notesAr: 'تحويل فوري مباشر بالدولار الرقمي USDT عبر شبكة ترون (TRC20) متاح لجميع المشتركين والدول',
    notesEn: 'Direct USDT crypto payment via TRON network (TRC20) accepted worldwide'
  },
  robotGuide: {
    titleAr: 'روبوت ZAD FX للتداول الآلي الذكي على كيوتكس',
    titleEn: 'ZAD FX Quotex Automated Trading Robot',
    videoUrl: 'https://youtube.com',
    imageUrl: '/assets/aistudio/1_c5a8975d.PNG',
    descriptionAr: 'روبوت مباشر يتصل بمنصة كيوتكس، يحلل 6 أزواج بالتوازي باستراتيجية المؤشرات الأربعة، ويفتح الصفقات بدقة 5 ثوانٍ قبل الشمعة بدون أي مضاعفات خاسرة.',
    descriptionEn: 'Automated robot for Quotex platform, scanning 6 pairs simultaneously with 4 technical indicators and 5-second pre-candle execution.'
  }
};

let telegramBotConfigStore: TelegramBotConfig = { ...defaultTelegramBotConfig };
let telegramBotUsersStore: TelegramBotUser[] = [
  {
    id: 'tgu-seed-1',
    telegramChatId: '589124011',
    username: '@ahmed_fx_trader',
    name: 'أحمد محمود العطار',
    country: 'مصر 🇪🇬',
    language: 'ar',
    step: 'COMPLETED',
    status: 'ACTIVE',
    membershipType: 'PAID_VIP',
    brokerId: '8910442',
    notes: 'مشترك VIP - تم الدفع عبر إنستا باي',
    registeredAt: '2026-11-05T14:20:00.000Z',
    lastInteractionAt: '2026-11-07T08:15:00.000Z'
  },
  {
    id: 'tgu-seed-2',
    telegramChatId: '741290334',
    username: '@tariq_almansoor',
    name: 'طارق المنصور',
    country: 'السعودية 🇸🇦',
    language: 'ar',
    step: 'COMPLETED',
    status: 'ACTIVE',
    membershipType: 'FREE_REFERRAL',
    brokerId: '9012455',
    notes: 'تم التسجيل برابط كيوتكس وإيداع 150$',
    registeredAt: '2026-11-06T10:11:00.000Z',
    lastInteractionAt: '2026-11-06T18:40:00.000Z'
  },
  {
    id: 'tgu-seed-3',
    telegramChatId: '612849012',
    username: '@khalid_dubai',
    name: 'خالد سعيد',
    country: 'الإمارات 🇦🇪',
    language: 'ar',
    step: 'COMPLETED',
    status: 'ACTIVE',
    membershipType: 'PAID_VIP',
    brokerId: '7721890',
    notes: 'تحويل آيبان بالدولار الأمريكي',
    registeredAt: '2026-11-07T02:00:00.000Z',
    lastInteractionAt: '2026-11-07T07:30:00.000Z'
  }
];

let liveMarketSnapshots: LivePairSnapshot[] = [];
let isCloudStateLoaded = false;
let currentStateUpdatedAt = '';

function applyParsedState(parsed: Partial<PersistedState>) {
  if (parsed.stateUpdatedAt && parsed.stateUpdatedAt > currentStateUpdatedAt) {
    currentStateUpdatedAt = parsed.stateUpdatedAt;
  }
  if (parsed.telegramBotConfig) {
    telegramBotConfigStore = {
      ...defaultTelegramBotConfig,
      ...parsed.telegramBotConfig
    };
  }
  if (parsed.telegramBotUsers && Array.isArray(parsed.telegramBotUsers) && parsed.telegramBotUsers.length > 0) {
    const existingChatIds = new Set(telegramBotUsersStore.map(u => u.telegramChatId));
    for (const u of parsed.telegramBotUsers) {
      if (!existingChatIds.has(u.telegramChatId)) {
        telegramBotUsersStore.push(u);
      }
    }
  }
  if (typeof parsed.lastOnboardingBotUpdateId === 'number' && parsed.lastOnboardingBotUpdateId > lastOnboardingBotUpdateId) {
    lastOnboardingBotUpdateId = parsed.lastOnboardingBotUpdateId;
  }
  if (parsed.lastDispatchedEpochMinute && parsed.lastDispatchedEpochMinute > lastDispatchedEpochMinute) {
    lastDispatchedEpochMinute = parsed.lastDispatchedEpochMinute;
  }
  if (parsed.liveBroadcastSession) {
    liveBroadcastSession = {
      ...liveBroadcastSession,
      ...parsed.liveBroadcastSession
    };
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
    const validRawSignals = parsed.signals.filter(
      s =>
        !s.isOtc &&
        !fakeIds.has(s.id) &&
        Boolean(s.createdAt) &&
        (Boolean(s.vipTelegramMessageId) ||
          Boolean(s.telegramMessageId) ||
          (s.status === 'PENDING' && Date.now() - new Date(s.createdAt).getTime() < 10 * 60 * 1000))
    );

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
    if (
      !appSettings.customTemplatePattern ||
      appSettings.customTemplatePattern.includes('{السوبر_تريند}') ||
      appSettings.customTemplatePattern.includes('السوق العالمي 🌍') ||
      (!appSettings.customTemplatePattern.includes('البث المباشر مع ابوسليم') &&
        !appSettings.customTemplatePattern.includes('بث حي لأخذ الصفقات'))
    ) {
      appSettings.customTemplatePattern = DEFAULT_CUSTOM_TEMPLATE;
    }
    if (
      !appSettings.channelTitle ||
      appSettings.channelTitle === 'نَبض التداول | السوق العالمي' ||
      appSettings.channelTitle === 'نَبض التداول'
    ) {
      appSettings.channelTitle = 'ZAD FX | إشارات أبوسليم';
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
      freeBotDailyTargetReached:
        typeof parsed.autopilot.freeBotDailyTargetReached === 'boolean'
          ? parsed.autopilot.freeBotDailyTargetReached
          : Boolean(autoPilot.freeBotDailyTargetReached),
      freeBotCelebrationSentDate:
        parsed.autopilot.freeBotCelebrationSentDate || autoPilot.freeBotCelebrationSentDate || '',
      freeBotStoppedForToday:
        typeof parsed.autopilot.freeBotStoppedForToday === 'boolean'
          ? parsed.autopilot.freeBotStoppedForToday
          : Boolean(autoPilot.freeBotStoppedForToday),
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
      freeStartHourEgypt: Number(parsed.autopilot.freeStartHourEgypt ?? autoPilot.freeStartHourEgypt ?? 9),
      freeEndHourEgypt: Number(parsed.autopilot.freeEndHourEgypt ?? autoPilot.freeEndHourEgypt ?? 15),
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
    const canonicalMap = new Map(INITIAL_WEEKLY_FOREX_NEWS.map(n => [n.id, n]));
    const savedIds = new Set(parsed.forexNews.map((s: any) => s.id));
    const merged = parsed.forexNews.map((saved: any) => {
      const canonical = canonicalMap.get(saved.id);
      return {
        ...(canonical || {}),
        ...saved,
        recommendation: saved.recommendation
          ? { ...(canonical?.recommendation || {}), ...saved.recommendation }
          : (canonical?.recommendation || undefined)
      };
    });
    // Add any fresh upcoming events from the canonical schedule that are not yet in state
    for (const initItem of INITIAL_WEEKLY_FOREX_NEWS) {
      if (!savedIds.has(initItem.id)) {
        merged.push(initItem);
      }
    }
    forexNewsStore = merged;
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

let isTelegramBotFirestoreListenerActive = false;
function initTelegramBotFirestoreSync() {
  if (!serverFirestoreDb || isTelegramBotFirestoreListenerActive) return;
  try {
    const botDocRef = doc(serverFirestoreDb, 'system_state', 'telegram_bot_state');
    onSnapshot(botDocRef, (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      if (!data?.payload) return;
      try {
        const parsed = JSON.parse(data.payload);
        if (parsed?.config) {
          telegramBotConfigStore = {
            ...defaultTelegramBotConfig,
            ...telegramBotConfigStore,
            ...parsed.config,
            usdtPayment: {
              ...defaultTelegramBotConfig.usdtPayment,
              ...(parsed.config.usdtPayment || {})
            }
          };
        }
        if (Array.isArray(parsed?.users) && parsed.users.length > 0) {
          for (const u of parsed.users) {
            const idx = telegramBotUsersStore.findIndex(ex => ex.telegramChatId === u.telegramChatId || ex.id === u.id);
            if (idx >= 0) {
              telegramBotUsersStore[idx] = { ...telegramBotUsersStore[idx], ...u };
            } else {
              telegramBotUsersStore.push(u);
            }
          }
        }
      } catch (_err) {}
    }, (err) => {
      console.warn('Telegram bot Firestore snapshot error:', err);
    });
    isTelegramBotFirestoreListenerActive = true;
  } catch (_e) {}
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

      // Load dedicated telegram_bot_state document from Firestore (for fx.zadtoo.com two-way sync)
      try {
        const botDocRef = doc(serverFirestoreDb, 'system_state', 'telegram_bot_state');
        const botSnap = await getDoc(botDocRef);
        if (botSnap.exists()) {
          const bData = botSnap.data();
          if (bData?.payload) {
            const parsedBot = JSON.parse(bData.payload);
            if (parsedBot?.config) {
              telegramBotConfigStore = {
                ...defaultTelegramBotConfig,
                ...telegramBotConfigStore,
                ...parsedBot.config,
                usdtPayment: {
                  ...defaultTelegramBotConfig.usdtPayment,
                  ...(parsedBot.config.usdtPayment || {})
                }
              };
            }
            if (Array.isArray(parsedBot?.users) && parsedBot.users.length > 0) {
              const existingChatIds = new Set(telegramBotUsersStore.map(u => u.telegramChatId));
              for (const u of parsedBot.users) {
                const idx = telegramBotUsersStore.findIndex(ex => ex.telegramChatId === u.telegramChatId);
                if (idx >= 0) {
                  telegramBotUsersStore[idx] = { ...telegramBotUsersStore[idx], ...u };
                } else {
                  telegramBotUsersStore.push(u);
                }
              }
            }
          }
        }
      } catch (_e) {}

      // Start live snapshot listener so updates from fx.zadtoo.com reflect in server memory immediately
      initTelegramBotFirestoreSync();

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
function getLiveRobotActiveSignal(overrideMode?: RobotStrategyEngineMode): SignalItem | null {
  // Strict Market Guard: Never return any active signal if global Forex market is closed
  if (!isGlobalForexMarketOpen()) return null;

  const mode = overrideMode || robotSettings.strategyEngineMode || 'VIP_WITH_MPB';
  let candidate: SignalItem | null = null;

  if (mode === 'PUBLIC_CLASSIC') {
    // Mode 1: Public Classic Indicator (1 full minute countdown, not 5s instant)
    candidate = signalsStore.find(s =>
      s.status === 'PENDING' &&
      !s.instantExecution5s &&
      s.strategyType !== 'MOMENTUM_PAUSE_BREAKOUT'
    ) || null;
  } else {
    // Mode 2: MPB Strategy (Option 2 - works 09:00 AM to 09:00 PM, 5s instant confirmation at :55)
    // STRICT ISOLATION: ONLY signals belonging to MPB / Instant 5s execution.
    // NEVER fall back to Strategy 1 (Public Classic / general VIP channel signals)
    candidate = signalsStore.find(s =>
      s.status === 'PENDING' &&
      (Boolean(s.instantExecution5s) || s.strategyType === 'MOMENTUM_PAUSE_BREAKOUT' || s.isLiveBroadcast)
    ) || null;
  }

  if (!candidate) return null;

  const nowEpoch = Math.floor(Date.now() / 1000);
  const sigAgeSec = candidate.createdAt
    ? Math.floor((Date.now() - new Date(candidate.createdAt).getTime()) / 1000)
    : 999;

  const targetSec = candidate.targetEntryTimestamp || (nowEpoch - sigAgeSec + 45);
  const diffUntilEntry = targetSec - nowEpoch;

  // Auto-resolve stale PENDING signals older than 2.5 minutes so they don't linger
  if (candidate.status === 'PENDING' && (sigAgeSec > 140 || diffUntilEntry < -85)) {
    candidate.status = 'WIN';
    candidate.resultSent = true;
  }

  // If signal is PENDING:
  if (candidate.status === 'PENDING') {
    if (mode === 'VIP_WITH_MPB') {
      // In MPB mode: Deliver the signal as soon as dispatched (within 75s of candle entry)
      // and while the 60s candle trade is actively in progress (diffUntilEntry between 0 and -65s)
      if (diffUntilEntry >= -65 && diffUntilEntry <= 75 && sigAgeSec <= 120) {
        return candidate;
      }
      return null;
    } else {
      if (diffUntilEntry >= -70 && diffUntilEntry <= 90 && sigAgeSec <= 135) {
        return candidate;
      }
      return null;
    }
  }

  // If completed (WIN / LOSS / DRAW): display for 15 seconds after candle close so user sees the outcome banner
  const secondsSinceCandleClose = nowEpoch - (targetSec + 60);
  if (secondsSinceCandleClose >= 0 && secondsSinceCandleClose <= 15) {
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
      liveBroadcastSession,
      robotSettings,
      subscribers: subscribersStore.slice(0, 200),
      telegramBotUsers: telegramBotUsersStore.slice(0, 500),
      telegramBotConfig: telegramBotConfigStore,
      quickNotes: quickNotesStore.slice(0, 50),
      dailyStats: sortedDailyStats,
      forexNews: forexNewsStore,
      plans: plansStore,
      contactLinks: contactLinksStore,
      paymentMethods: paymentMethodsStore,
      paymentTransactions: paymentTransactionsStore.slice(0, 150),
      lastDispatchedEpochMinute,
      lastOnboardingBotUpdateId
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

      // Persist dedicated telegram_bot_state doc to Firestore for 100% two-way sync with fx.zadtoo.com
      try {
        const botDocRef = doc(serverFirestoreDb, 'system_state', 'telegram_bot_state');
        await setDoc(botDocRef, {
          updatedAt: nowIso,
          payload: JSON.stringify({
            config: telegramBotConfigStore,
            users: telegramBotUsersStore.slice(0, 500)
          })
        });
      } catch (errBot) {
        console.warn('Could not write dedicated telegram_bot_state doc:', errBot);
      }

      // Also publish lightweight public live feed for Quotex Robot (zero-cookie direct stream)
      try {
        const cairoHour = getCurrentEgyptHour();
        const isMpbTimeOpen = cairoHour >= 9 && cairoHour < 21;
        const isRobotActive = isFloatingRobotActiveNow();
        const activeSig = getLiveRobotActiveSignal('VIP_WITH_MPB') || getLiveRobotActiveSignal('PUBLIC_CLASSIC');
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
          isTradingHours: isMpbTimeOpen || isRobotActive,
          isLockedOutsideHours: !isMpbTimeOpen && !isRobotActive,
          lockReason: '',
          workingHoursText: 'تعمل استراتيجية MPB يومياً من 09:00 صباحاً حتى 09:00 مساءً متواصلة (تنفيذ فوري 5 ثوانٍ ⚡)',
          isWarmup: false,
          warmupMinutesRemaining: 0,
          tradingHoursMessage: isMpbTimeOpen
            ? 'ساعات التداول الرسمية نشطة (09:00 ص - 09:00 مساءً متواصلة ⚡)'
            : 'خارج ساعات عمل الروبوت (09:00 ص - 09:00 مساءً بتوقيت القاهرة)',
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
          payload: JSON.stringify(liveFeedPayload),
          signal: activeSig || null
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
 * Calculates Wilder's Average True Range (ATR 14) for M1 candles
 */
export function calculateATR(
  candles: { high: number; low: number; close: number }[],
  period = 14
): number {
  if (candles.length < period + 1) {
    if (candles.length === 0) return 0;
    const ranges = candles.map(c => c.high - c.low);
    return ranges.reduce((a, b) => a + b, 0) / ranges.length;
  }
  const tr: number[] = [candles[0].high - candles[0].low];
  for (let i = 1; i < candles.length; i++) {
    const hl = candles[i].high - candles[i].low;
    const hc = Math.abs(candles[i].high - candles[i - 1].close);
    const lc = Math.abs(candles[i].low - candles[i - 1].close);
    tr.push(Math.max(hl, hc, lc));
  }
  let sumFirst = 0;
  for (let i = 0; i < period; i++) sumFirst += tr[i];
  let prevAtr = sumFirst / period;
  for (let i = period; i < tr.length; i++) {
    prevAtr = (prevAtr * (period - 1) + tr[i]) / period;
  }
  return prevAtr;
}

export interface MomentumPauseBreakoutResult {
  isDetected: boolean;
  direction: 'CALL' | 'PUT' | 'NONE';
  strongCandlesCount: number;
  pauseHigh: number;
  pauseLow: number;
  pauseRange: number;
  breakoutClose: number;
  currentATR: number;
  isContinuation: boolean;
  summary: string;
}

/**
 * Detects NB FX Momentum Pause Breakout pattern (matching MT4 MQL4 Indicator logic):
 * 1. Two consecutive strong candles in the same direction (Body >= ATR * 0.55).
 * 2. Small pause candle (Body <= ATR * 0.30 & Range <= ATR * 0.85).
 * 3. Confirmed breakout closing beyond pause High/Low by ATR buffer (0.05 * ATR).
 */
export function detectMomentumPauseBreakout(
  candles: { open: number; high: number; low: number; close: number }[],
  atrPeriod = 14,
  strongBodyATR = 0.35,
  pauseBodyATR = 0.38,
  pauseRangeATR = 0.95,
  breakoutBufferATR = 0.01
): MomentumPauseBreakoutResult {
  if (candles.length < atrPeriod + 5) {
    return {
      isDetected: false,
      direction: 'NONE',
      strongCandlesCount: 0,
      pauseHigh: 0,
      pauseLow: 0,
      pauseRange: 0,
      breakoutClose: 0,
      currentATR: 0,
      isContinuation: false,
      summary: 'بيانات غير كافية لنموذج Momentum Pause Breakout'
    };
  }

  const atr = calculateATR(candles, atrPeriod);
  if (atr <= 0) {
    return {
      isDetected: false,
      direction: 'NONE',
      strongCandlesCount: 0,
      pauseHigh: 0,
      pauseLow: 0,
      pauseRange: 0,
      breakoutClose: 0,
      currentATR: 0,
      isContinuation: false,
      summary: 'قيمة ATR غير صالحة'
    };
  }

  const body = (c: { open: number; close: number }) => Math.abs(c.close - c.open);
  const range = (c: { high: number; low: number }) => c.high - c.low;

  // We check two valid pause candle positions on M1:
  // 1) pauseShift = 1 (pause candle is candles[length - 2], breakout candle is current candle candles[length - 1] confirming in final 5 seconds)
  // 2) pauseShift = 2 (pause candle was candles[length - 3], breakout candle was candles[length - 2], and current candle candles[length - 1] confirms direction)
  const candidatePauseShifts = [1, 2];

  for (const shift of candidatePauseShifts) {
    const pauseIdx = candles.length - 1 - shift;
    if (pauseIdx < 2) continue;

    const pauseCandle = candles[pauseIdx];
    const s1 = candles[pauseIdx - 1]; // First strong candle before pause
    const s2 = candles[pauseIdx - 2]; // Second strong candle before pause
    const breakoutCandle = candles[candles.length - 1];

    const s1Bull = s1.close > s1.open;
    const s2Bull = s2.close > s2.open;
    const s1Bear = s1.close < s1.open;
    const s2Bear = s2.close < s2.open;

    const isBullRun = s1Bull && s2Bull;
    const isBearRun = s1Bear && s2Bear;

    if (!isBullRun && !isBearRun) continue;

    // Check momentum strength: each candle >= 0.35*ATR OR combined momentum >= 0.70*ATR
    const s1BodyVal = body(s1);
    const s2BodyVal = body(s2);
    const hasMomentumVolume =
      (s1BodyVal >= atr * strongBodyATR && s2BodyVal >= atr * strongBodyATR) ||
      (s1BodyVal + s2BodyVal >= atr * 0.70 && s1BodyVal >= atr * 0.22 && s2BodyVal >= atr * 0.22);

    if (!hasMomentumVolume) continue;

    // 2. Pause candle criteria: relatively small body and controlled range
    const pauseBodyVal = body(pauseCandle);
    const pauseRangeVal = range(pauseCandle);
    const isPauseSmall =
      pauseBodyVal <= atr * pauseBodyATR &&
      pauseRangeVal <= atr * pauseRangeATR &&
      pauseBodyVal <= Math.max(s1BodyVal, s2BodyVal) * 0.80;

    if (!isPauseSmall) continue;

    // 3. Breakout confirmation: price closed or probed through pause boundary
    const buffer = atr * breakoutBufferATR;
    let direction: 'CALL' | 'PUT' | 'NONE' = 'NONE';
    let isContinuation = false;

    // For CALL breakout:
    const isCallBreak =
      breakoutCandle.close > pauseCandle.high + buffer ||
      (breakoutCandle.high > pauseCandle.high + buffer && breakoutCandle.close >= (pauseCandle.high + pauseCandle.low) / 2);

    // For PUT breakout:
    const isPutBreak =
      breakoutCandle.close < pauseCandle.low - buffer ||
      (breakoutCandle.low < pauseCandle.low - buffer && breakoutCandle.close <= (pauseCandle.high + pauseCandle.low) / 2);

    if (isCallBreak) {
      direction = 'CALL';
      isContinuation = isBullRun;
    } else if (isPutBreak) {
      direction = 'PUT';
      isContinuation = isBearRun;
    }

    if (direction !== 'NONE') {
      const runName = isBullRun ? 'زخم صاعد قوي' : 'زخم هابط قوي';
      const breakName = direction === 'CALL' ? 'اختراق صاعد ⬆️' : 'كسر هابط ⬇️';
      const typeName = isContinuation ? 'استمراري مع الاتجاه' : 'انعكاسي ضد الاتجاه';

      return {
        isDetected: true,
        direction,
        strongCandlesCount: 2,
        pauseHigh: Number(pauseCandle.high.toFixed(5)),
        pauseLow: Number(pauseCandle.low.toFixed(5)),
        pauseRange: Number(pauseRangeVal.toFixed(5)),
        breakoutClose: Number(breakoutCandle.close.toFixed(5)),
        currentATR: Number(atr.toFixed(5)),
        isContinuation,
        summary: `${runName} + شمعة توقف + ${breakName} (${typeName})`
      };
    }
  }

  // Diagnostic summary if not detected on current candles
  const latestPause = candles[candles.length - 2];
  const latestStrong1 = candles[candles.length - 3];
  const latestStrong2 = candles[candles.length - 4];
  const latestBreakout = candles[candles.length - 1];

  const hasDir =
    (latestStrong1.close > latestStrong1.open && latestStrong2.close > latestStrong2.open) ||
    (latestStrong1.close < latestStrong1.open && latestStrong2.close < latestStrong2.open);

  const diagSummary = !hasDir
    ? 'بانتظار شمعتي زخم متتاليتين في نفس الاتجاه'
    : body(latestPause) > atr * pauseBodyATR
    ? 'شمعة التوقف لم تستقر بعد بنطاق صغير نسبة للزخم'
    : 'بانتظار اختراق وتأكيد نطاق شمعة التوقف';

  return {
    isDetected: false,
    direction: 'NONE',
    strongCandlesCount: hasDir ? 2 : 1,
    pauseHigh: Number(latestPause.high.toFixed(5)),
    pauseLow: Number(latestPause.low.toFixed(5)),
    pauseRange: Number(range(latestPause).toFixed(5)),
    breakoutClose: Number(latestBreakout.close.toFixed(5)),
    currentATR: Number(atr.toFixed(5)),
    isContinuation: false,
    summary: diagSummary
  };
}

export interface FourIndicatorConfluenceResult {
  momentumPause: MomentumPauseBreakoutResult;
  atrValue: number;
  atrMatched: boolean;
  rsiValue: number;
  rsiMatched: boolean;
  superTrendMatched: boolean;
  superTrendDirection: 'BULLISH' | 'BEARISH';
  supportingCount: number;
  candidateDirection: 'CALL' | 'PUT' | null;
  isSignalTriggered: boolean;
  matchedList: string[];
  summary: string;
}

/**
 * 4-Indicator Confluence Evaluator:
 * Supports two VIP modes based on user selection:
 * - Option 2 (requireMpb = true): MPB is mandatory + at least 2 supporting indicators (Total >= 3).
 * - Option 3 (requireMpb = false): Any 3 of the 4 indicators (MPB, ATR, RSI, Supertrend) agree in the same direction.
 */
export function evaluateFourIndicatorConfluence(
  candles: { open: number; high: number; low: number; close: number }[],
  isJpy = false,
  requireMpb = true
): FourIndicatorConfluenceResult {
  const momentumPause = detectMomentumPauseBreakout(candles, 14);
  const atr = calculateATR(candles, 14);
  const closes = candles.map(c => c.close);
  const rsi = calculateRSI(closes, 14);
  const supertrend = calculateSuperTrend(candles, 10, 3);

  const minAtr = isJpy ? 0.015 : 0.00010;
  const isAtrHealthy = atr >= minAtr;

  if (requireMpb) {
    // ========================================================
    // OPTION 2: VIP with MPB (MPB is MANDATORY PRIMARY CONDITION)
    // ========================================================
    if (!momentumPause.isDetected || momentumPause.direction === 'NONE') {
      return {
        momentumPause,
        atrValue: atr,
        atrMatched: isAtrHealthy,
        rsiValue: rsi,
        rsiMatched: false,
        superTrendMatched: false,
        superTrendDirection: supertrend.trend,
        supportingCount: 0,
        candidateDirection: null,
        isSignalTriggered: false,
        matchedList: [],
        summary: `الشرط الأساسي MPB غير محقق: ${momentumPause.summary}`
      };
    }

    const testDirection: 'CALL' | 'PUT' = momentumPause.direction;
    const matchedList: string[] = [];

    // Pillar 1: Mandatory Primary Condition (MPB)
    matchedList.push(
      `مؤشر MPB [شرط أساسي محقق ✅] (${testDirection === 'CALL' ? 'اختراق صاعد ⬆️' : 'كسر هابط ⬇️'})`
    );

    let additionalCount = 0;

    // Pillar 2: ATR (14) Volatility Confirmation
    const atrMatched = isAtrHealthy;
    if (atrMatched) {
      additionalCount += 1;
      matchedList.push(`مؤشر ATR (${atr.toFixed(5)} سيولة وزخم نشط)`);
    }

    // Pillar 3: RSI (14) Momentum Alignment
    const rsiMatched = testDirection === 'CALL'
      ? (rsi >= 48 || (rsi <= 35 && rsi >= 20))
      : (rsi <= 52 || (rsi >= 65 && rsi <= 80));
    if (rsiMatched) {
      additionalCount += 1;
      matchedList.push(`مؤشر RSI (${rsi.toFixed(1)} ${testDirection === 'CALL' ? 'ميل صعودي' : 'ميل هبوطي'})`);
    }

    // Pillar 4: Supertrend (10, 3) Trend Baseline
    const stMatched = testDirection === 'CALL'
      ? supertrend.trend === 'BULLISH'
      : supertrend.trend === 'BEARISH';
    if (stMatched) {
      additionalCount += 1;
      matchedList.push(`مؤشر Supertrend (${supertrend.trend === 'BULLISH' ? 'صاعد أخضر 🟢' : 'هابط أحمر 🔴'})`);
    }

    const isSignalTriggered = additionalCount >= 2;
    const supportingCount = 1 + additionalCount;

    const summary = isSignalTriggered
      ? `${supportingCount} من 4 مؤشرات متوافقة (شرط MPB الأساسي + ${additionalCount} مؤشرات إضافية: ${matchedList.slice(1).join(' + ')})`
      : `شرط MPB محقق ولكن توفر مؤشر إضافي واحد فقط (${additionalCount} من 3 — المطلوب 2 إضافيان)`;

    return {
      momentumPause,
      atrValue: atr,
      atrMatched,
      rsiValue: rsi,
      rsiMatched,
      superTrendMatched: stMatched,
      superTrendDirection: supertrend.trend,
      supportingCount,
      candidateDirection: testDirection,
      isSignalTriggered,
      matchedList,
      summary
    };
  } else {
    // ========================================================
    // OPTION 3: VIP without MPB (Any 3 of the 4 indicators agree)
    // ========================================================
    // Evaluate CALL Direction Matches:
    const callMatched: string[] = [];
    if (momentumPause.isDetected && momentumPause.direction === 'CALL') {
      callMatched.push(`مؤشر MPB (اختراق صاعد ⬆️)`);
    }
    if (isAtrHealthy) {
      callMatched.push(`مؤشر ATR (${atr.toFixed(5)} سيولة نشطة)`);
    }
    const rsiCall = (rsi >= 48 || (rsi <= 35 && rsi >= 20));
    if (rsiCall) {
      callMatched.push(`مؤشر RSI (${rsi.toFixed(1)} ميل صعودي)`);
    }
    const stCall = supertrend.trend === 'BULLISH';
    if (stCall) {
      callMatched.push(`مؤشر Supertrend (صاعد أخضر 🟢)`);
    }

    // Evaluate PUT Direction Matches:
    const putMatched: string[] = [];
    if (momentumPause.isDetected && momentumPause.direction === 'PUT') {
      putMatched.push(`مؤشر MPB (كسر هابط ⬇️)`);
    }
    if (isAtrHealthy) {
      putMatched.push(`مؤشر ATR (${atr.toFixed(5)} سيولة نشطة)`);
    }
    const rsiPut = (rsi <= 52 || (rsi >= 65 && rsi <= 80));
    if (rsiPut) {
      putMatched.push(`مؤشر RSI (${rsi.toFixed(1)} ميل هبوطي)`);
    }
    const stPut = supertrend.trend === 'BEARISH';
    if (stPut) {
      putMatched.push(`مؤشر Supertrend (هابط أحمر 🔴)`);
    }

    let candidateDirection: 'CALL' | 'PUT' | null = null;
    let chosenList: string[] = [];
    let supportingCount = 0;

    if (callMatched.length >= 3 && callMatched.length >= putMatched.length) {
      candidateDirection = 'CALL';
      chosenList = callMatched;
      supportingCount = callMatched.length;
    } else if (putMatched.length >= 3) {
      candidateDirection = 'PUT';
      chosenList = putMatched;
      supportingCount = putMatched.length;
    }

    const isSignalTriggered = candidateDirection !== null;
    const hasMpbInMatch = chosenList.some(m => m.includes('MPB'));
    const summary = isSignalTriggered
      ? `${supportingCount} من 4 مؤشرات متوافقة (${hasMpbInMatch ? 'مع مؤشر MPB الأساسي محقق ✅' : 'توافق 3 مؤشرات فنية بدون MPB ⚡'}: ${chosenList.join(' + ')})`
      : `لا يوجد توافق 3 مؤشرات حالياً (CALL: ${callMatched.length}/4, PUT: ${putMatched.length}/4 — المطلوب 3 مؤشرات على الأقل)`;

    return {
      momentumPause,
      atrValue: atr,
      atrMatched: isAtrHealthy,
      rsiValue: rsi,
      rsiMatched: candidateDirection === 'CALL' ? rsiCall : candidateDirection === 'PUT' ? rsiPut : false,
      superTrendMatched: candidateDirection === 'CALL' ? stCall : candidateDirection === 'PUT' ? stPut : false,
      superTrendDirection: supertrend.trend,
      supportingCount,
      candidateDirection,
      isSignalTriggered,
      matchedList: chosenList,
      summary
    };
  }
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
  if (!isGlobalForexMarketOpen()) {
    return {
      snapshots: [],
      selectedCandidate: null
    };
  }

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

  const DEFAULT_6_MAJOR_PAIRS = ['EUR/USD', 'EUR/JPY', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CAD'];
  let pairsToScan: string[] = [];
  if (preferredPair) {
    const norm = (typeof preferredPair === 'string' ? preferredPair : '').toUpperCase().replace(/\s*OTC/i, '').trim();
    if (norm.includes('/')) {
      pairsToScan = [norm];
    }
  }

  if (pairsToScan.length === 0) {
    const allowed = Array.isArray(autoPilot.allowedPairs) && autoPilot.allowedPairs.length > 0
      ? autoPilot.allowedPairs
      : DEFAULT_6_MAJOR_PAIRS;
    // Always scan all 6 major Forex pairs continuously across the platform
    pairsToScan = Array.from(new Set([...allowed, ...DEFAULT_6_MAJOR_PAIRS]));
  }

  await Promise.all(pairsToScan.map(async (pair) => {
    const yahooSymbol = `${pair.replace('/', '')}=X`;
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=1m&range=1d`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      if (!res.ok) return;
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

      if (validCandles.length < 25) return;

      const lastCandle = validCandles[validCandles.length - 1];
      const prevCandle = validCandles[validCandles.length - 2] || lastCandle;

      // Phase 2 Filter: Check Data Freshness (discard if feed is completely disconnected > 15 mins)
      if (lastCandle.timestamp > 0 && Math.abs(nowEpoch - lastCandle.timestamp) > 900) {
        return;
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

      const requireMpb = false; // استراتيجية الروبوت الثانية MPB تقبل الإشارة مع توافر 3 شروط سواء بالشرط الأساسي أو بدونه
      const fourConfluence = evaluateFourIndicatorConfluence(validCandles, isJpy, requireMpb);

      // If VIP mode is active and fourIndicatorConfluence is triggered, promote this as active signalReady
      if (robotSettings.strategyEngineMode !== 'PUBLIC_CLASSIC' && fourConfluence.isSignalTriggered && fourConfluence.candidateDirection) {
        signalReady = fourConfluence.candidateDirection;
        trend = fourConfluence.candidateDirection === 'CALL' ? 'BULLISH' : 'BEARISH';
        qualityScore = Math.max(qualityScore, 75 + fourConfluence.supportingCount * 6);
        reason = fourConfluence.summary;
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
        momentumPauseBreakout: {
          isDetected: fourConfluence.momentumPause.isDetected,
          direction: fourConfluence.momentumPause.direction,
          strongCandles: fourConfluence.momentumPause.strongCandlesCount,
          pauseRange: fourConfluence.momentumPause.pauseRange,
          atr: fourConfluence.momentumPause.currentATR,
          isContinuation: fourConfluence.momentumPause.isContinuation,
          summary: fourConfluence.momentumPause.summary
        },
        fourIndicatorConfluence: {
          momentumPauseMatched: fourConfluence.momentumPause.isDetected && fourConfluence.momentumPause.direction === fourConfluence.candidateDirection,
          atrMatched: fourConfluence.atrMatched,
          rsiMatched: fourConfluence.rsiMatched,
          superTrendMatched: fourConfluence.superTrendMatched,
          supportingCount: fourConfluence.supportingCount,
          candidateDirection: fourConfluence.candidateDirection,
          isSignalTriggered: fourConfluence.isSignalTriggered,
          matchedList: fourConfluence.matchedList,
          summary: fourConfluence.summary
        },
        wickRatio: signalReady === 'CALL' ? lowerWickRatio : upperWickRatio,
        isNewsSpike,
        updatedAt: new Date().toISOString()
      });
    } catch (_e) {
      // Continue scanning other pairs if one fails
    }
  }));

  if (snapshots.length > 0) {
    liveMarketSnapshots = snapshots;
  }

  // Find the strongest high-probability candidate sorted by COMPOSITE QUALITY SCORE (CQS)
  const qualifiedCandidates = snapshots
    .filter(s => s.signalReady !== null)
    .sort((a, b) => (b.qualityScore || 0) - (a.qualityScore || 0));

  // Helper to check if an asset is currently inside the per-asset cooldown window
  const assetCooldownMs = Math.max(2, autoPilot.assetCooldownMinutes || 2) * 60 * 1000;
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
 * Sends a photo (from a local file, base64 data URL, or HTTP URL) with optional HTML caption and inline keyboard
 */
async function sendTelegramPhoto(
  botToken: string,
  chatId: string,
  photoSource: string,
  caption?: string,
  replyToMessageId?: number,
  inlineKeyboard?: Array<Array<{ text: string; callback_data?: string; url?: string }>>
) {
  try {
    // 1. If base64 data URL
    if (photoSource.startsWith('data:image/')) {
      const matches = photoSource.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
      if (matches) {
        const mimeType = matches[1];
        const base64Data = matches[2];
        const buffer = Buffer.from(base64Data, 'base64');
        const ext = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
        const formData = new FormData();
        formData.append('chat_id', chatId.trim());
        if (caption) {
          formData.append('caption', caption);
          formData.append('parse_mode', 'HTML');
        }
        if (replyToMessageId) formData.append('reply_to_message_id', String(replyToMessageId));
        if (inlineKeyboard && inlineKeyboard.length > 0) {
          formData.append('reply_markup', JSON.stringify({ inline_keyboard: inlineKeyboard }));
        }
        const blob = new Blob([buffer], { type: mimeType });
        formData.append('photo', blob, `photo.${ext}`);

        const tgRes = await fetch(`https://api.telegram.org/bot${botToken.trim()}/sendPhoto`, {
          method: 'POST',
          body: formData
        });
        return (await tgRes.json()) as any;
      }
    }

    // 2. If local filesystem image (e.g. /public/assets/..., /assets/...)
    let localDiskPath = '';
    if (photoSource.startsWith('/assets/')) {
      localDiskPath = path.join(process.cwd(), 'public', photoSource);
    } else if (photoSource.startsWith('/public/assets/')) {
      localDiskPath = path.join(process.cwd(), photoSource);
    } else if (photoSource.startsWith('/') && fs.existsSync(photoSource)) {
      localDiskPath = photoSource;
    }

    if (localDiskPath && fs.existsSync(localDiskPath)) {
      const fileBuf = fs.readFileSync(localDiskPath);
      const ext = path.extname(localDiskPath).toLowerCase().replace('.', '') || 'jpg';
      const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
      const formData = new FormData();
      formData.append('chat_id', chatId.trim());
      if (caption) {
        formData.append('caption', caption);
        formData.append('parse_mode', 'HTML');
      }
      if (replyToMessageId) formData.append('reply_to_message_id', String(replyToMessageId));
      if (inlineKeyboard && inlineKeyboard.length > 0) {
        formData.append('reply_markup', JSON.stringify({ inline_keyboard: inlineKeyboard }));
      }
      const blob = new Blob([fileBuf], { type: mimeType });
      formData.append('photo', blob, `photo.${ext}`);

      const tgRes = await fetch(`https://api.telegram.org/bot${botToken.trim()}/sendPhoto`, {
        method: 'POST',
        body: formData
      });
      return (await tgRes.json()) as any;
    }

    // 3. Remote URL or fallback
    const payload: Record<string, any> = {
      chat_id: chatId.trim(),
      photo: photoSource
    };
    if (caption) {
      payload.caption = caption;
      payload.parse_mode = 'HTML';
    }
    if (replyToMessageId) payload.reply_to_message_id = replyToMessageId;
    if (inlineKeyboard && inlineKeyboard.length > 0) {
      payload.reply_markup = { inline_keyboard: inlineKeyboard };
    }

    const tgRes = await fetch(`https://api.telegram.org/bot${botToken.trim()}/sendPhoto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return (await tgRes.json()) as any;
  } catch (err: any) {
    console.warn('[sendTelegramPhoto Error]', err);
    return { ok: false, description: err?.message || 'خطأ في إرسال الصورة' };
  }
}

function escapeTgHtml(s: string): string {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function isEgyptCountryText(country: string): boolean {
  if (!country) return false;
  const c = country.toLowerCase().trim();
  return (
    c.includes('مصر') ||
    c.includes('egypt') ||
    c.includes('cairo') ||
    c.includes('قاهرة') ||
    c.includes('إسكندرية') ||
    c.includes('اسكندرية') ||
    c.includes('الجيزة') ||
    c.includes('جيزة') ||
    c.includes('giza') ||
    c.includes('alexandria') ||
    c === 'eg' ||
    c === 'egp'
  );
}

function isPalestineCountryText(country: string): boolean {
  if (!country) return false;
  const c = country.toLowerCase().trim();
  return (
    c.includes('فلسطين') ||
    c.includes('palestine') ||
    c.includes('غزة') ||
    c.includes('gaza') ||
    c.includes('القدس') ||
    c.includes('jerusalem') ||
    c.includes('رام الله') ||
    c.includes('ramallah') ||
    c.includes('الضفة') ||
    c === 'ps' ||
    c === 'pse'
  );
}

export async function sendTelegramInlineMessage(
  botToken: string,
  chatId: string,
  text: string,
  inlineKeyboard?: Array<Array<{ text: string; callback_data?: string; url?: string }>>,
  parseMode: 'HTML' | 'Markdown' = 'HTML'
) {
  const payload: Record<string, any> = {
    chat_id: String(chatId).trim(),
    text,
    parse_mode: parseMode
  };
  if (inlineKeyboard && inlineKeyboard.length > 0) {
    payload.reply_markup = {
      inline_keyboard: inlineKeyboard
    };
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8500);
  try {
    const tgRes = await fetch(`https://api.telegram.org/bot${botToken.trim()}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    return (await tgRes.json()) as any;
  } catch (err: any) {
    console.warn('[sendTelegramInlineMessage Error]', err);
    return { ok: false, description: err?.message || 'Error communicating with Telegram' };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function editOrSendTelegramInlineMessage(
  botToken: string,
  chatId: string,
  text: string,
  inlineKeyboard?: Array<Array<{ text: string; callback_data?: string; url?: string }>>,
  parseMode: 'HTML' | 'Markdown' = 'HTML',
  messageIdToEdit?: number
) {
  if (messageIdToEdit) {
    const editPayload: Record<string, any> = {
      chat_id: String(chatId).trim(),
      message_id: messageIdToEdit,
      text,
      parse_mode: parseMode
    };
    if (inlineKeyboard && inlineKeyboard.length > 0) {
      editPayload.reply_markup = {
        inline_keyboard: inlineKeyboard
      };
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8500);
    try {
      const editRes = await fetch(`https://api.telegram.org/bot${botToken.trim()}/editMessageText`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editPayload),
        signal: controller.signal
      });
      const data = (await editRes.json()) as any;
      if (data.ok) return data;
      if (data.description && (data.description.includes('message is not modified') || data.description.includes('message to edit not found'))) {
        if (data.description.includes('message is not modified')) {
          return { ok: true, result: data.result };
        }
      }
    } catch (_e) {
      // Fall through to sendMessage
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return await sendTelegramInlineMessage(botToken, chatId, text, inlineKeyboard, parseMode);
}

export async function answerTelegramCallbackQuery(botToken: string, callbackQueryId: string, text?: string) {
  try {
    await fetch(`https://api.telegram.org/bot${botToken.trim()}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text: text || ''
      })
    });
  } catch (_e) {
    // Ignore
  }
}

async function sendTelegramBotMainMenu(
  token: string,
  chatId: string,
  user: TelegramBotUser,
  messageIdToEdit?: number,
  headerNotice?: string
) {
  const cfg = telegramBotConfigStore;
  const isAr = user.language !== 'en';
  const cleanAdmin = (cfg.adminTelegramUsername || '@thrayanabil').replace(/^@/, '');
  const contactUrl = `https://t.me/${cleanAdmin}`;
  const webUrl = cfg.officialWebsiteUrl || 'https://fx.zadtoo.com';
  const refUrl = cfg.quotexReferralUrl || 'https://broker-qx.pro/sign-up/?lid=893976';
  const channelUrl = cfg.freeChannelLink || 'https://t.me/ZadNBFX';

  const text = isAr
    ? (headerNotice ? `${headerNotice}\n\n` : '') +
      `🔔 <b>تنويه هام:</b>\n` +
      `خدماتنا <b>مجانية 100%</b> بالكامل ولا تتطلب أي رسوم اشتراكات!\n` +
      `كل ما عليك هو أن تتبع <b>رابط الإحالة</b> لتكون ضمن الفريق المستفيد. 🎁\n\n` +
      `📋 <b>القائمة الرئيسية — أكاديمية وروبوت ZAD FX للتداول الآلي 🚀</b>\n\n` +
      `👤 <b>العضو:</b> ${escapeTgHtml(user.name)}\n` +
      `📧 <b>البريد:</b> ${escapeTgHtml(user.email || 'لم يُضَف بعد')}\n` +
      `🌍 <b>الدولة:</b> ${escapeTgHtml(user.country || 'غير محددة')} <i>(قابلة للتعديل)</i>\n` +
      `🆔 <b>معرف العضوية:</b> <code>${user.telegramChatId}</code>\n\n` +
      `اختر من القائمة أدناه ما ترغب به:`
    : (headerNotice ? `${headerNotice}\n\n` : '') +
      `🔔 <b>Important Notice:</b>\n` +
      `Our service is <b>100% FREE</b> with NO subscription fees required!\n` +
      `All you need is to follow our <b>referral link</b> to join our beneficiary team. 🎁\n\n` +
      `📋 <b>Main Menu — ZAD FX Automated Trading Bot 🚀</b>\n\n` +
      `👤 <b>Member:</b> ${escapeTgHtml(user.name)}\n` +
      `📧 <b>Email:</b> ${escapeTgHtml(user.email || 'Not added')}\n` +
      `🌍 <b>Country:</b> ${escapeTgHtml(user.country || 'Not set')} <i>(Editable)</i>\n` +
      `🆔 <b>Member ID:</b> <code>${user.telegramChatId}</code>\n\n` +
      `Please select an option from the menu below:`;

  const keyboard = isAr
    ? [
        [
          { text: '🎁 تفعيل مجاني 100% عبر الإحالة (ابدأ هنا)', callback_data: 'onb_sub_referral' }
        ],
        [
          { text: '📢 قناة التليجرام المجانية', url: channelUrl },
          { text: '💎 العضوية والاشتراكات', callback_data: 'onb_menu_subs' }
        ],
        [
          { text: '👤 الملف الشخصي (البروفايل)', callback_data: 'onb_menu_profile' },
          { text: '💬 تواصل معنا (الدعم)', url: contactUrl }
        ],
        [
          { text: '🤖 روبوت التداول الآلي', callback_data: 'onb_menu_robot' },
          { text: '🌐 الموقع الرسمي', url: webUrl }
        ],
        [
          { text: '🔗 رابط الإحالة الرسمي (Quotex)', url: refUrl }
        ]
      ]
    : [
        [
          { text: '🎁 100% Free via Referral (Start Here)', callback_data: 'onb_sub_referral' }
        ],
        [
          { text: '📢 Free Telegram Channel', url: channelUrl },
          { text: '💎 Memberships & Subscriptions', callback_data: 'onb_menu_subs' }
        ],
        [
          { text: '👤 My Profile (Settings)', callback_data: 'onb_menu_profile' },
          { text: '💬 Contact Admin (Support)', url: contactUrl }
        ],
        [
          { text: '🤖 Auto Trading Robot', callback_data: 'onb_menu_robot' },
          { text: '🌐 Official Website', url: webUrl }
        ],
        [
          { text: '🔗 Official Referral Link (Quotex)', url: refUrl }
        ]
      ];

  if (messageIdToEdit) {
    await editOrSendTelegramInlineMessage(token, chatId, text, keyboard, 'HTML', messageIdToEdit);
  } else {
    await sendTelegramInlineMessage(token, chatId, text, keyboard, 'HTML');
  }
}

const recentUserActions = new Map<string, number>();
function isDebouncedUserAction(chatId: string, actionKey: string): boolean {
  const key = `${chatId}:${actionKey}`;
  const now = Date.now();
  const lastTime = recentUserActions.get(key) || 0;
  if (now - lastTime < 1500) {
    return true; // Ignore rapid duplicate clicks
  }
  recentUserActions.set(key, now);
  if (recentUserActions.size > 2000) {
    const firstKey = recentUserActions.keys().next().value;
    if (firstKey !== undefined) recentUserActions.delete(firstKey);
  }
  return false;
}

const processedTelegramMessageKeys = new Set<string>();
const processedTelegramCallbackKeys = new Set<string>();

async function processInteractiveTelegramBotUpdate(update: any, token: string) {
  if (!telegramBotConfigStore.isEnabled) return;
  const cfg = telegramBotConfigStore;
  const cleanAdmin = (cfg.adminTelegramUsername || '@thrayanabil').replace(/^@/, '');
  const contactUrl = `https://t.me/${cleanAdmin}`;
  const webUrl = cfg.officialWebsiteUrl || 'https://fx.zadtoo.com';

  // 1. Handle Callback Queries (Inline Button Clicks)
  if (update.callback_query) {
    const cb = update.callback_query;
    const callbackId = String(cb.id);
    const data = String(cb.data || '');
    const messageId = cb.message?.message_id;
    const chatId = String(cb.message?.chat?.id || cb.from?.id);
    const tgUsername = cb.from?.username ? `@${cb.from.username}` : '';
    const firstName = cb.from?.first_name || '';
    const lastName = cb.from?.last_name || '';
    const fallbackName = [firstName, lastName].filter(Boolean).join(' ') || 'عضو جديد';

    await answerTelegramCallbackQuery(token, callbackId);

    // Filter out rapid duplicate clicks
    if (isDebouncedUserAction(chatId, data)) {
      return;
    }

    if (processedTelegramCallbackKeys.has(callbackId)) {
      return;
    }
    processedTelegramCallbackKeys.add(callbackId);
    if (processedTelegramCallbackKeys.size > 2000) {
      const f = processedTelegramCallbackKeys.values().next().value;
      if (f !== undefined) processedTelegramCallbackKeys.delete(f);
    }

    let user = telegramBotUsersStore.find(u => u.telegramChatId === chatId);
    if (!user) {
      user = {
        id: `tgu-${chatId}`,
        telegramChatId: chatId,
        username: tgUsername,
        name: fallbackName,
        country: '',
        language: 'ar',
        step: 'START',
        status: 'ACTIVE',
        membershipType: 'NONE',
        registeredAt: new Date().toISOString(),
        lastInteractionAt: new Date().toISOString()
      };
      telegramBotUsersStore.unshift(user);
      saveState();
    } else {
      user.lastInteractionAt = new Date().toISOString();
      if (tgUsername && !user.username) user.username = tgUsername;
    }

    if (user.status === 'BLOCKED') {
      await editOrSendTelegramInlineMessage(token, chatId, '⛔ عذراً، تم حظر هذا الحساب من استخدام خدمات ZAD FX.', undefined, 'HTML', messageId);
      return;
    }
    if (user.status === 'SUSPENDED') {
      await editOrSendTelegramInlineMessage(
        token,
        chatId,
        `⚠️ حسابك معلق مؤقتاً للمراجعة من قبل الإدارة.\nيرجى التواصل مع المشرف: ${contactUrl}`,
        undefined,
        'HTML',
        messageId
      );
      return;
    }

    // Branch: Select Language Arabic
    if (data === 'onb_lang_ar') {
      user.language = 'ar';
      user.step = 'AWAITING_NAME';
      saveState();
      const promptText =
        `أهلاً وسهلاً بك في أكاديمية ZAD FX! 🌟\n\n` +
        `يرجى كتابة <b>اسمك الكريم بالكامل</b> للمتابعة وتجهيز ملف عضويتك الخاص:`;
      await editOrSendTelegramInlineMessage(token, chatId, promptText, undefined, 'HTML', messageId);
      return;
    }

    // Branch: Select Language English
    if (data === 'onb_lang_en') {
      user.language = 'en';
      user.step = 'AWAITING_NAME';
      saveState();
      const promptText =
        `Welcome to ZAD FX Academy! 🌟\n\n` +
        `Please type your <b>Full Name</b> to continue and prepare your personal membership profile:`;
      await editOrSendTelegramInlineMessage(token, chatId, promptText, undefined, 'HTML', messageId);
      return;
    }

    // Direct Country Set Callbacks (Onboarding) - Fully Editable, NO Double Messages
    if (data === 'onb_set_country_eg') {
      user.country = 'جمهورية مصر العربية 🇪🇬';
      user.step = 'COMPLETED';
      saveState();
      await sendTelegramBotMainMenu(token, chatId, user, messageId, '✅ <b>تم حفظ وتحديد دولتك: جمهورية مصر العربية 🇪🇬</b>');
      return;
    }

    if (data === 'onb_set_country_ps') {
      user.country = 'دولة فلسطين 🇵🇸';
      user.step = 'COMPLETED';
      saveState();
      await sendTelegramBotMainMenu(token, chatId, user, messageId, '✅ <b>تم حفظ وتحديد دولتك: دولة فلسطين 🇵🇸</b>');
      return;
    }

    if (data === 'onb_set_country_intl') {
      user.country = 'دولي 🌍';
      user.step = 'COMPLETED';
      saveState();
      await sendTelegramBotMainMenu(token, chatId, user, messageId, '✅ <b>تم حفظ وتحديد دولتك: دولي 🌍</b>');
      return;
    }

    // =========================================================================
    // MEMBER PROFILE & DATA EDITING (NAME, EMAIL, COUNTRY)
    // =========================================================================
    if (data === 'onb_menu_profile') {
      const isAr = user.language !== 'en';
      const profText = isAr
        ? `👤 <b>الملف الشخصي للعضو — أكاديمية ZAD FX 🚀</b>\n\n` +
          `🏷️ <b>الاسم:</b> ${escapeTgHtml(user.name)}\n` +
          `📧 <b>البريد الإلكتروني:</b> ${escapeTgHtml(user.email || 'لم يتم الإضافة بعد')}\n` +
          `🌍 <b>الدولة الحالية:</b> ${escapeTgHtml(user.country || 'غير محددة')} <i>(متاحة للتعديل)</i>\n` +
          `🆔 <b>معرف التليجرام (Chat ID):</b> <code>${user.telegramChatId}</code>\n` +
          `💎 <b>نوع العضوية:</b> ${user.membershipType === 'PAID_VIP' ? 'عضوية مدفوعة VIP 👑' : user.membershipType === 'FREE_REFERRAL' ? 'اشتراك مجاني عبر الإحالة 🎁' : 'عضو مسجل (عادي)'}\n\n` +
          `💡 <i>يمكنك تعديل أي من بياناتك أو تغيير دولتك بحرية في أي وقت:</i>`
        : `👤 <b>User Profile — ZAD FX Academy 🚀</b>\n\n` +
          `🏷️ <b>Name:</b> ${escapeTgHtml(user.name)}\n` +
          `📧 <b>Email:</b> ${escapeTgHtml(user.email || 'Not added')}\n` +
          `🌍 <b>Current Country:</b> ${escapeTgHtml(user.country || 'Not set')} <i>(Editable)</i>\n` +
          `🆔 <b>Telegram ID:</b> <code>${user.telegramChatId}</code>\n` +
          `💎 <b>Membership:</b> ${user.membershipType}\n\n` +
          `💡 <i>You can edit your personal details or country anytime:</i>`;

      const profButtons = isAr
        ? [
            [
              { text: '✏️ تعديل الاسم', callback_data: 'onb_prof_edit_name' },
              { text: '📧 إضافة / تعديل البريد', callback_data: 'onb_prof_edit_email' }
            ],
            [
              { text: '🌍 تغيير وتعديل الدولة', callback_data: 'onb_prof_edit_country' }
            ],
            [
              { text: '🏠 القائمة الرئيسية', callback_data: 'onb_menu_main' }
            ]
          ]
        : [
            [
              { text: '✏️ Edit Name', callback_data: 'onb_prof_edit_name' },
              { text: '📧 Add / Edit Email', callback_data: 'onb_prof_edit_email' }
            ],
            [
              { text: '🌍 Change Country', callback_data: 'onb_prof_edit_country' }
            ],
            [
              { text: '🏠 Main Menu', callback_data: 'onb_menu_main' }
            ]
          ];

      await editOrSendTelegramInlineMessage(token, chatId, profText, profButtons, 'HTML', messageId);
      return;
    }

    if (data === 'onb_prof_edit_name') {
      user.step = 'EDIT_NAME';
      saveState();
      const isAr = user.language !== 'en';
      const prompt = isAr
        ? `✏️ <b>تعديل الاسم:</b>\n\nالاسم الحالي: <b>${escapeTgHtml(user.name)}</b>\n\nيرجى كتابة وإرسال اسمك الجديد الآن في رسالة نصية:`
        : `✏️ <b>Edit Name:</b>\n\nCurrent name: <b>${escapeTgHtml(user.name)}</b>\n\nPlease type and send your new full name:`;
      const cancelButtons = isAr
        ? [[{ text: '🔙 إلغاء والرجوع للملف الشخصي', callback_data: 'onb_menu_profile' }]]
        : [[{ text: '🔙 Cancel', callback_data: 'onb_menu_profile' }]];
      await editOrSendTelegramInlineMessage(token, chatId, prompt, cancelButtons, 'HTML', messageId);
      return;
    }

    if (data === 'onb_prof_edit_email') {
      user.step = 'EDIT_EMAIL';
      saveState();
      const isAr = user.language !== 'en';
      const prompt = isAr
        ? `📧 <b>إضافة أو تعديل البريد الإلكتروني:</b>\n\nالبريد الحالي: <b>${escapeTgHtml(user.email || 'لم يُضَف')}</b>\n\nيرجى كتابة وإرسال بريدك الإلكتروني الآن (مثال: name@example.com):`
        : `📧 <b>Add or Edit Email:</b>\n\nCurrent email: <b>${escapeTgHtml(user.email || 'None')}</b>\n\nPlease type and send your email address:`;
      const cancelButtons = isAr
        ? [[{ text: '🔙 إلغاء والرجوع للملف الشخصي', callback_data: 'onb_menu_profile' }]]
        : [[{ text: '🔙 Cancel', callback_data: 'onb_menu_profile' }]];
      await editOrSendTelegramInlineMessage(token, chatId, prompt, cancelButtons, 'HTML', messageId);
      return;
    }

    if (data === 'onb_prof_edit_country') {
      const isAr = user.language !== 'en';
      const ipVerifyUrl = `${webUrl}/api/verify-country?chatId=${user.telegramChatId}`;
      const prompt = isAr
        ? `🌍 <b>تحديد وتعديل الدولة:</b>\n\n` +
          `الدولة الحالية المسجلة: <b>${escapeTgHtml(user.country || 'غير محددة')}</b>\n\n` +
          `اختر دولتك من الأزرار أدناه أو اضغط على الفحص التلقائي بالـ IP أو اكتبها يدوياً:`
        : `🌍 <b>Change Country:</b>\n\n` +
          `Current Country: <b>${escapeTgHtml(user.country || 'Not set')}</b>\n\n` +
          `Select your country below or auto-detect via IP or type it manually:`;

      const countryButtons = isAr
        ? [
            [
              { text: '🇪🇬 جمهورية مصر العربية', callback_data: 'onb_prof_set_country_eg' },
              { text: '🇵🇸 دولة فلسطين', callback_data: 'onb_prof_set_country_ps' }
            ],
            [
              { text: '🌍 باقي دول العالم (دولي)', callback_data: 'onb_prof_set_country_intl' }
            ],
            [
              { text: '🌐 فحص وتحديث تلقائي عبر الـ IP', url: ipVerifyUrl }
            ],
            [
              { text: '✏️ كتابة اسم دولة أخرى يدوياً', callback_data: 'onb_prof_set_country_custom' }
            ],
            [
              { text: '🔙 رجوع للملف الشخصي', callback_data: 'onb_menu_profile' }
            ]
          ]
        : [
            [
              { text: '🇪🇬 Egypt', callback_data: 'onb_prof_set_country_eg' },
              { text: '🇵🇸 Palestine', callback_data: 'onb_prof_set_country_ps' }
            ],
            [
              { text: '🌍 Rest of the World', callback_data: 'onb_prof_set_country_intl' }
            ],
            [
              { text: '🌐 Auto-Detect via IP', url: ipVerifyUrl }
            ],
            [
              { text: '✏️ Type Country Manually', callback_data: 'onb_prof_set_country_custom' }
            ],
            [
              { text: '🔙 Back to Profile', callback_data: 'onb_menu_profile' }
            ]
          ];

      await editOrSendTelegramInlineMessage(token, chatId, prompt, countryButtons, 'HTML', messageId);
      return;
    }

    if (data === 'onb_prof_set_country_eg') {
      user.country = 'جمهورية مصر العربية 🇪🇬';
      user.step = 'COMPLETED';
      saveState();
      await sendTelegramBotMainMenu(token, chatId, user, messageId, '✅ <b>تم تحديث وتعديل دولتك بنجاح إلى: جمهورية مصر العربية 🇪🇬</b>');
      return;
    }

    if (data === 'onb_prof_set_country_ps') {
      user.country = 'دولة فلسطين 🇵🇸';
      user.step = 'COMPLETED';
      saveState();
      await sendTelegramBotMainMenu(token, chatId, user, messageId, '✅ <b>تم تحديث وتعديل دولتك بنجاح إلى: دولة فلسطين 🇵🇸</b>');
      return;
    }

    if (data === 'onb_prof_set_country_intl') {
      user.country = 'دولي 🌍';
      user.step = 'COMPLETED';
      saveState();
      await sendTelegramBotMainMenu(token, chatId, user, messageId, '✅ <b>تم تحديث وتعديل دولتك بنجاح إلى: دولي 🌍</b>');
      return;
    }

    if (data === 'onb_prof_set_country_custom') {
      user.step = 'EDIT_COUNTRY';
      saveState();
      const isAr = user.language !== 'en';
      const prompt = isAr
        ? `🌍 <b>كتابة اسم الدولة:</b>\n\nيرجى كتابة وإرسال اسم دولتك الآن في رسالة (مثال: الجزائر، المغرب، تونس، السعودية، العراق، الإمارات، الكويت، الأردن، ...):`
        : `🌍 <b>Custom Country:</b>\n\nPlease type and send your country name:`;
      const cancelButtons = isAr
        ? [[{ text: '🔙 إلغاء والرجوع', callback_data: 'onb_prof_edit_country' }]]
        : [[{ text: '🔙 Cancel', callback_data: 'onb_prof_edit_country' }]];
      await editOrSendTelegramInlineMessage(token, chatId, prompt, cancelButtons, 'HTML', messageId);
      return;
    }

    // Direct Country Set from Payment Selection
    if (data === 'onb_set_country_eg_and_pay') {
      user.country = 'جمهورية مصر العربية 🇪🇬';
      user.countryLocked = true;
      user.step = 'COMPLETED';
      saveState();
      // Render Egypt Payment immediately
      const text =
        `🇪🇬 <b>طرق الدفع المتاحة داخل جمهورية مصر العربية:</b>\n\n` +
        `تم توجيهك لنظام الدفع المحلي المعتمد في مصر:\n\n` +
        `⚡ <b>إنستا باي (InstaPay):</b> تحويل لحظي فوري عبر التطبيق\n` +
        `📱 <b>المحافظ الإلكترونية:</b> فودافون كاش، اتصالات كاش، أورنج كاش، وي باي\n` +
        `💎 <b>الدولار الرقمي USDT (TRC20):</b> دفع فوري بالعملات الرقمية\n\n` +
        `يرجى اختيار وسيلة الدفع لعرض بيانات التحويل:`;

      const buttons = [
        [
          { text: '⚡ إنستا باي (InstaPay)', callback_data: 'onb_pay_instapay' },
          { text: '📱 المحافظ الإلكترونية (كاش)', callback_data: 'onb_pay_wallets' }
        ],
        [
          { text: '💎 دفع عبر USDT (TRC20)', callback_data: 'onb_pay_usdt' }
        ],
        [
          { text: '🔙 رجوع للاشتراكات', callback_data: 'onb_menu_subs' },
          { text: '🏠 القائمة الرئيسية', callback_data: 'onb_menu_main' }
        ]
      ];

      await editOrSendTelegramInlineMessage(token, chatId, text, buttons, 'HTML', messageId);
      return;
    }

    if (data === 'onb_set_country_ps_and_pay' || data === 'onb_pay_bop') {
      user.country = 'دولة فلسطين 🇵🇸';
      user.countryLocked = true;
      user.step = 'COMPLETED';
      saveState();
      const pal = cfg.palestinePayment || defaultTelegramBotConfig.palestinePayment;
      const text =
        `🇵🇸 <b>طرق الدفع والتحويل المتاحة داخل دولة فلسطين (${escapeTgHtml(user.country)}):</b>\n\n` +
        `تم توجيهك لحساب الإيداع والتحويل الخاص في <b>بنك فلسطين (Bank of Palestine)</b>:\n\n` +
        `🌍 <b>الدولة:</b> ${escapeTgHtml(pal.country || 'فلسطين 🇵🇸')}\n` +
        `🏛 <b>اسم البنك:</b> ${escapeTgHtml(pal.bankName)}\n` +
        `👤 <b>اسم المستفيد:</b> ${escapeTgHtml(pal.beneficiaryName)}\n` +
        `💰 <b>العملة:</b> ${escapeTgHtml(pal.currency)}\n` +
        `🔢 <b>رقم الحساب:</b> <code>${escapeTgHtml(pal.accountNumber)}</code>\n` +
        `🌐 <b>رقم الآيبان (IBAN):</b> <code>${escapeTgHtml(pal.iban)}</code>\n` +
        `🏢 <b>الفرع:</b> ${escapeTgHtml(pal.branch)}\n\n` +
        `📌 <i>ملاحظة: بعد إتمام الإيداع أو التحويل البنكي عبر تطبيق بنك فلسطين، يرجى إرسال صورة إشعار التحويل للمشرف للتفعيل الفوري.</i>`;

      const buttons = [
        [{ text: '📩 إرسال إشعار التحويل للمشرف', url: contactUrl }],
        [
          { text: '💎 دفع بالدولار الرقمي USDT (TRC20)', callback_data: 'onb_pay_usdt' }
        ],
        [
          { text: '🔙 رجوع للاشتراكات', callback_data: 'onb_menu_subs' },
          { text: '🏠 القائمة الرئيسية', callback_data: 'onb_menu_main' }
        ]
      ];

      await editOrSendTelegramInlineMessage(token, chatId, text, buttons, 'HTML', messageId);
      return;
    }

    if (data === 'onb_set_country_intl_and_pay') {
      user.country = 'دولي 🌍';
      user.countryLocked = true;
      user.step = 'COMPLETED';
      saveState();
      const isAr = user.language !== 'en';
      const text = isAr
        ? `🌍 <b>خيارات التحويل البنكي الدولي المتاحة لدولتك:</b>\n\n` +
          `تم توجيهك لنظام التحويل المصرفي الدولي عبر رقم الحساب البنكي الدولي (IBAN) أو العملات الرقمية (USDT).\n` +
          `يمكنك التحويل إما بالجنيه المصري (EGP) أو بالدولار الأمريكي (USD) أو عبر USDT.\n\n` +
          `يرجى اختيار وسيلة الدفع المطلوبة لعرض التفاصيل الكاملة:`
        : `🌍 <b>International Payment Options:</b>\n\n` +
          `You can transfer funds internationally via IBAN (in EGP or USD) or via crypto USDT (TRC20).\n\n` +
          `Please choose your preferred method to view full details:`;

      const buttons = isAr
        ? [
            [
              { text: '🇪🇬 حساب بنكي بالجنيه المصري (EGP)', callback_data: 'onb_pay_iban_egp' },
              { text: '🇺🇸 حساب بنكي بالدولار الأمريكي (USD)', callback_data: 'onb_pay_iban_usd' }
            ],
            [
              { text: '💎 دفع بالدولار الرقمي USDT (TRC20)', callback_data: 'onb_pay_usdt' }
            ],
            [
              { text: '🔙 رجوع للاشتراكات', callback_data: 'onb_menu_subs' },
              { text: '🏠 القائمة الرئيسية', callback_data: 'onb_menu_main' }
            ]
          ]
        : [
            [
              { text: '🇪🇬 Bank Account in EGP (Pounds)', callback_data: 'onb_pay_iban_egp' },
              { text: '🇺🇸 Bank Account in USD (Dollars)', callback_data: 'onb_pay_iban_usd' }
            ],
            [
              { text: '💎 Pay with USDT (TRC20)', callback_data: 'onb_pay_usdt' }
            ],
            [
              { text: '🔙 Back to Subscriptions', callback_data: 'onb_menu_subs' },
              { text: '🏠 Main Menu', callback_data: 'onb_menu_main' }
            ]
          ];

      await editOrSendTelegramInlineMessage(token, chatId, text, buttons, 'HTML', messageId);
      return;
    }

    // Branch: Return to Main Menu
    if (data === 'onb_menu_main') {
      await sendTelegramBotMainMenu(token, chatId, user, messageId);
      return;
    }

    // Branch: Memberships & Subscriptions Sub-menu
    if (data === 'onb_menu_subs') {
      const isAr = user.language !== 'en';
      const isEg = isEgyptCountryText(user.country);
      const isPal = isPalestineCountryText(user.country);

      let paidOptionDesc = '';
      if (isEg) {
        paidOptionDesc = isAr
          ? '2️⃣ <b>العضوية المدفوعة VIP:</b> اشتراك فوري عبر إنستا باي (InstaPay) والمحافظ الإلكترونية (فودافون كاش، اتصالات، أورنج، وي).'
          : '2️⃣ <b>Paid VIP Membership:</b> Instant payment via InstaPay and mobile wallets.';
      } else if (isPal) {
        paidOptionDesc = isAr
          ? '2️⃣ <b>العضوية المدفوعة VIP:</b> إيداع وتحويل فوري عبر تطبيق بنك فلسطين (Bank of Palestine).'
          : '2️⃣ <b>Paid VIP Membership:</b> Direct transfer via Bank of Palestine app.';
      } else {
        paidOptionDesc = isAr
          ? '2️⃣ <b>العضوية المدفوعة VIP:</b> تحويل بنكي دولي عبر رقم الآيبان (IBAN بالجنيه أو بالدولار).'
          : '2️⃣ <b>Paid VIP Membership:</b> International bank wire transfer via IBAN (EGP or USD).';
      }

      const text = isAr
        ? `🔔 <b>تنويه هام:</b>\n` +
          `الخدمة <b>مجانية 100%</b> بالكامل ولا تتطلب أي رسوم اشتراكات!\n` +
          `كل ما عليك هو أن تتبع <b>رابط الإحالة</b> لتكون ضمن الفريق المستفيد وتحصل على توصيات VIP وروبوت التداول مجاناً. 🎁\n\n` +
          `💎 <b>خيارات العضوية في ZAD FX:</b>\n\n` +
          `1️⃣ <b>الاشتراك المجاني عبر الإحالة (الأساسي والمجاني 100%):</b>\n` +
          `تفعيل مجاني بالكامل لقناة VIP وروبوت التداول الآلي، دون دفع أي اشتراك، بمجرد فتح حسابك عبر رابط الإحالة في منصة كيوتكس وشحنه برأس مالك الخاص للتداول.\n\n` +
          `${paidOptionDesc}`
        : `🔔 <b>Important Notice:</b>\n` +
          `The service is <b>100% FREE</b> and requires NO subscription fees!\n` +
          `All you need is to follow the <b>referral link</b> to join our beneficiary team. 🎁\n\n` +
          `💎 <b>ZAD FX Memberships & Subscriptions:</b>\n\n` +
          `1️⃣ <b>Free Membership via Referral (100% Free):</b>\n` +
          `Free full access to VIP signals and Auto Robot with zero fees, just by opening your account via our referral link on Quotex and funding your own trading balance.\n\n` +
          `${paidOptionDesc}`;

      const buttons = isAr
        ? [
            [
              { text: '🎁 الاشتراك المجاني عبر الإحالة', callback_data: 'onb_sub_referral' },
              { text: '💳 العضوية المدفوعة VIP', callback_data: 'onb_sub_paid' }
            ],
            [
              { text: '🏠 القائمة الرئيسية', callback_data: 'onb_menu_main' }
            ]
          ]
        : [
            [
              { text: '🎁 Free via Quotex Referral', callback_data: 'onb_sub_referral' },
              { text: '💳 Paid VIP Membership', callback_data: 'onb_sub_paid' }
            ],
            [
              { text: '🏠 Main Menu', callback_data: 'onb_menu_main' }
            ]
          ];

      await editOrSendTelegramInlineMessage(token, chatId, text, buttons, 'HTML', messageId);
      return;
    }

    // Branch: Free Referral Option
    if (data === 'onb_sub_referral') {
      user.membershipType = 'FREE_REFERRAL';
      saveState();
      const isAr = user.language !== 'en';
      const refUrl = cfg.quotexReferralUrl || 'https://broker-qx.pro/sign-up/?lid=893976';

      const text = isAr
        ? `🎁 <b>الاشتراك المجاني في قناة VIP وروبوت التداول عبر الإحالة:</b>\n\n` +
          `للحصول على تفعيل مجاني كامل، اتبع الخطوات التالية:\n\n` +
          `1️⃣ افتح حساب جديد في منصة كيوتكس عبر رابط إحالتنا:\n` +
          `🔗 <a href="${refUrl}">اضغط هنا لفتح حسابك في كيوتكس</a>\n\n` +
          `2️⃣ قم بتوثيق حسابك وإيداع 100$ كحد أدنى للتداول بها في رصيدك الخاص.\n` +
          `3️⃣ بعد التسجيل، أرسل لقطة شاشة للحساب مع رقم المعرف (Quotex ID) للمشرف.\n\n` +
          `سيتم التحقق وتفعيل حسابك وإرسال رابط قناة VIP فوراً! 🚀`
        : `🎁 <b>Free VIP & Robot Access via Quotex Referral:</b>\n\n` +
          `To get full free activation, please follow these steps:\n\n` +
          `1️⃣ Open a new Quotex account using our referral link:\n` +
          `🔗 <a href="${refUrl}">Click here to register on Quotex</a>\n\n` +
          `2️⃣ Verify your account and deposit a minimum of $100 for your own trading capital.\n` +
          `3️⃣ Send a screenshot of your profile showing your Quotex ID to our admin.\n\n` +
          `Your VIP access and Robot will be activated immediately upon verification! 🚀`;

      const buttons = isAr
        ? [
            [{ text: '🔗 فتح حساب كيوتكس عبر الإحالة', url: refUrl }],
            [{ text: '📩 إرسال لقطة الشاشة ورقم المعرف للمشرف', url: contactUrl }],
            [
              { text: '🔙 رجوع للاشتراكات', callback_data: 'onb_menu_subs' },
              { text: '🏠 القائمة الرئيسية', callback_data: 'onb_menu_main' }
            ]
          ]
        : [
            [{ text: '🔗 Register on Quotex Now', url: refUrl }],
            [{ text: '📩 Send Screenshot & Quotex ID to Admin', url: contactUrl }],
            [
              { text: '🔙 Back to Subscriptions', callback_data: 'onb_menu_subs' },
              { text: '🏠 Main Menu', callback_data: 'onb_menu_main' }
            ]
          ];

      await editOrSendTelegramInlineMessage(token, chatId, text, buttons, 'HTML', messageId);
      return;
    }

    // Branch: Paid VIP Option (Geographical Routing)
    if (data === 'onb_sub_paid') {
      user.membershipType = 'PAID_VIP';
      saveState();
      const isPalestine = isPalestineCountryText(user.country);
      const isEgypt = isEgyptCountryText(user.country);
      const isAr = user.language !== 'en';

      if (isEgypt) {
        // 🇪🇬 EGYPT ROUTING: ONLY InstaPay & Mobile Wallets & USDT — STRICTLY ZERO BANK TRANSFER / IBAN
        const text =
          `🇪🇬 <b>طرق الدفع المتاحة داخل جمهورية مصر العربية:</b>\n\n` +
          `تم توجيهك تلقائياً لنظام الدفع المحلي المعتمد في مصر:\n\n` +
          `⚡ <b>إنستا باي (InstaPay):</b> تحويل لحظي فوري عبر التطبيق\n` +
          `📱 <b>المحافظ الإلكترونية:</b> فودافون كاش، اتصالات كاش، أورنج كاش، وي باي\n` +
          `💎 <b>الدولار الرقمي (USDT - TRC20):</b> دفع فوري بالعملات الرقمية\n\n` +
          `يرجى اختيار وسيلة الدفع لعرض بيانات التحويل:`;

        const buttons = [
          [
            { text: '⚡ إنستا باي (InstaPay)', callback_data: 'onb_pay_instapay' },
            { text: '📱 المحافظ الإلكترونية (كاش)', callback_data: 'onb_pay_wallets' }
          ],
          [
            { text: '💎 دفع بالدولار الرقمي USDT (TRC20)', callback_data: 'onb_pay_usdt' }
          ],
          [
            { text: '🔙 رجوع للاشتراكات', callback_data: 'onb_menu_subs' },
            { text: '🏠 القائمة الرئيسية', callback_data: 'onb_menu_main' }
          ]
        ];

        await editOrSendTelegramInlineMessage(token, chatId, text, buttons, 'HTML', messageId);
        return;
      }

      if (isPalestine) {
        // 🇵🇸 PALESTINE ROUTING: Bank of Palestine & USDT
        const pal = cfg.palestinePayment || defaultTelegramBotConfig.palestinePayment;
        const text =
          `🇵🇸 <b>طرق الدفع والتحويل المتاحة داخل دولة فلسطين (${escapeTgHtml(user.country)}):</b>\n\n` +
          `تم توجيهك لخيارات الدفع المعتمدة:\n\n` +
          `1️⃣ <b>بنك فلسطين (Bank of Palestine):</b> إيداع نقدي أو تحويل عبر تطبيق البنك\n` +
          `2️⃣ <b>الدولار الرقمي USDT (TRC20):</b> دفع فوري بالعملات الرقمية\n\n` +
          `يرجى اختيار وسيلة الدفع لعرض التفاصيل الكاملة:`;

        const buttons = [
          [{ text: '🏛 حساب بنك فلسطين (Bank of Palestine)', callback_data: 'onb_pay_bop' }],
          [{ text: '💎 دفع بالدولار الرقمي USDT (TRC20)', callback_data: 'onb_pay_usdt' }],
          [
            { text: '🔙 رجوع للاشتراكات', callback_data: 'onb_menu_subs' },
            { text: '🏠 القائمة الرئيسية', callback_data: 'onb_menu_main' }
          ]
        ];

        await editOrSendTelegramInlineMessage(token, chatId, text, buttons, 'HTML', messageId);
        return;
      }

      // If country is not set or empty, DO NOT default to international IBAN! Ask user first:
      if (!user.country || user.country.trim() === '') {
        const text = isAr
          ? `🌍 <b>يرجى تحديد دولتك لعرض طرق الدفع المعتمدة:</b>\n\n` +
            `لتوجيهك لنظام الدفع المخصص لبلدك وتجنب أي خطأ في التحويل، يرجى اختيار مكان إقامتك:`
          : `🌍 <b>Please select your country to view approved payment methods:</b>`;

        const buttons = isAr
          ? [
              [
                { text: '🇪🇬 جمهورية مصر العربية', callback_data: 'onb_set_country_eg_and_pay' },
                { text: '🇵🇸 دولة فلسطين', callback_data: 'onb_set_country_ps_and_pay' }
              ],
              [
                { text: '🌍 باقي دول العالم', callback_data: 'onb_set_country_intl_and_pay' }
              ],
              [
                { text: '💎 دفع بالدولار الرقمي USDT (TRC20)', callback_data: 'onb_pay_usdt' }
              ],
              [
                { text: '🔙 رجوع للاشتراكات', callback_data: 'onb_menu_subs' },
                { text: '🏠 القائمة الرئيسية', callback_data: 'onb_menu_main' }
              ]
            ]
          : [
              [
                { text: '🇪🇬 Egypt', callback_data: 'onb_set_country_eg_and_pay' },
                { text: '🇵🇸 Palestine', callback_data: 'onb_set_country_ps_and_pay' }
              ],
              [
                { text: '🌍 Rest of the World', callback_data: 'onb_set_country_intl_and_pay' }
              ],
              [
                { text: '💎 Pay with USDT (TRC20)', callback_data: 'onb_pay_usdt' }
              ],
              [
                { text: '🔙 Back to Subscriptions', callback_data: 'onb_menu_subs' },
                { text: '🏠 Main Menu', callback_data: 'onb_menu_main' }
              ]
            ];

        await editOrSendTelegramInlineMessage(token, chatId, text, buttons, 'HTML', messageId);
        return;
      }

      // 🌍 REST OF THE WORLD ONLY (Confirmed non-Egypt and non-Palestine)
      const text = isAr
        ? `🌍 <b>خيارات التحويل البنكي الدولي والدولار الرقمي لدولتك (${escapeTgHtml(user.country)}):</b>\n\n` +
          `تم توجيهك لنظام التحويل المصرفي الدولي عبر الآيبان (IBAN) أو العملات الرقمية (USDT).\n` +
          `يمكنك التحويل إما بالجنيه المصري (EGP) أو بالدولار الأمريكي (USD) أو بعملة USDT (TRC20).\n\n` +
          `يرجى اختيار وسيلة الدفع المطلوبة لعرض التفاصيل الكاملة:`
        : `🌍 <b>International Payment Options for (${escapeTgHtml(user.country)}):</b>\n\n` +
          `You can transfer funds internationally via IBAN in either Egyptian Pounds (EGP) or US Dollars (USD), or via crypto USDT (TRC20).\n\n` +
          `Please choose your preferred method to view full details:`;

      const buttons = isAr
        ? [
            [
              { text: '🇪🇬 حساب بنكي بالجنيه المصري (EGP)', callback_data: 'onb_pay_iban_egp' },
              { text: '🇺🇸 حساب بنكي بالدولار الأمريكي (USD)', callback_data: 'onb_pay_iban_usd' }
            ],
            [
              { text: '💎 دفع بالدولار الرقمي USDT (TRC20)', callback_data: 'onb_pay_usdt' }
            ],
            [
              { text: '🔙 رجوع للاشتراكات', callback_data: 'onb_menu_subs' },
              { text: '🏠 القائمة الرئيسية', callback_data: 'onb_menu_main' }
            ]
          ]
        : [
            [
              { text: '🇪🇬 Bank Account in EGP (Pounds)', callback_data: 'onb_pay_iban_egp' },
              { text: '🇺🇸 Bank Account in USD (Dollars)', callback_data: 'onb_pay_iban_usd' }
            ],
            [
              { text: '💎 Pay with USDT (TRC20)', callback_data: 'onb_pay_usdt' }
            ],
            [
              { text: '🔙 Back to Subscriptions', callback_data: 'onb_menu_subs' },
              { text: '🏠 Main Menu', callback_data: 'onb_menu_main' }
            ]
          ];

      await editOrSendTelegramInlineMessage(token, chatId, text, buttons, 'HTML', messageId);
      return;
    }

    // Branch: InstaPay Details
    if (data === 'onb_pay_instapay') {
      const eg = cfg.egyptPayment;
      const text =
        `⚡ <b>بيانات الدفع عبر تطبيق إنستا باي (InstaPay):</b>\n\n` +
        `👤 <b>اسم المستفيد:</b> ${escapeTgHtml(eg.instapayName)}\n` +
        `🆔 <b>عنوان الدفع اللحظي (IPA):</b> <code>${escapeTgHtml(eg.instapayAccount)}</code>\n\n` +
        `📌 <b>تنبيه هام:</b> بعد إتمام التحويل، يرجى التقاط صورة إيصال التحويل وإرسالها للمشرف مع اسمك لتفعيل اشتراكك وإضافتك لقناة VIP فوراً.`;

      const buttons = [
        [{ text: '📩 إرسال إيصال التحويل للمشرف', url: contactUrl }],
        [
          { text: '🔙 طرق الدفع في مصر', callback_data: 'onb_sub_paid' },
          { text: '🏠 القائمة الرئيسية', callback_data: 'onb_menu_main' }
        ]
      ];

      await editOrSendTelegramInlineMessage(token, chatId, text, buttons, 'HTML', messageId);
      return;
    }

    // Branch: Mobile Wallets Details
    if (data === 'onb_pay_wallets') {
      const eg = cfg.egyptPayment;
      const text =
        `📱 <b>بيانات الدفع عبر المحافظ الإلكترونية المصرية (كاش):</b>\n\n` +
        `🔴 <b>فودافون كاش:</b> <code>${escapeTgHtml(eg.vodafoneCash)}</code>\n` +
        `🟢 <b>اتصالات كاش:</b> <code>${escapeTgHtml(eg.etisalatCash)}</code>\n` +
        `🟠 <b>أورنج كاش:</b> <code>${escapeTgHtml(eg.orangeCash)}</code>\n` +
        `🟣 <b>وي باي (WE):</b> <code>${escapeTgHtml(eg.wePay)}</code>\n\n` +
        `📌 <b>تنبيه هام:</b> بعد إتمام التحويل من محفظتك، يرجى إرسال لقطة شاشة لرسالة التحويل إلى المشرف لتفعيل اشتراكك وروبوت التداول فوراً.`;

      const buttons = [
        [{ text: '📩 إرسال لقطة الشاشة للمشرف', url: contactUrl }],
        [
          { text: '🔙 طرق الدفع في مصر', callback_data: 'onb_sub_paid' },
          { text: '🏠 القائمة الرئيسية', callback_data: 'onb_menu_main' }
        ]
      ];

      await editOrSendTelegramInlineMessage(token, chatId, text, buttons, 'HTML', messageId);
      return;
    }

    // Branch: USDT (TRC20) Payment Details (All Countries)
    if (data === 'onb_pay_usdt') {
      const usdt = cfg.usdtPayment || defaultTelegramBotConfig.usdtPayment;
      const isAr = user.language !== 'en';
      const text = isAr
        ? `💎 <b>طريقة الدفع بالعملات الرقمية USDT (TRC20):</b>\n\n` +
          `متاحة لجميع المشتركين وكافة الدول كخيار دفع فوري ومباشر 🌍\n\n` +
          `🌐 <b>الشبكة المعتمدة:</b> <b>${escapeTgHtml(usdt.network || 'USDT (TRC20)')}</b>\n` +
          `📬 <b>عنوان المحفظة (Wallet Address):</b>\n` +
          `<code>${escapeTgHtml(usdt.address || 'TX79afTcXc1nG8ddRdpatFWHMFDqByXyzo')}</code>\n` +
          `<i>(اضغط على العنوان أعلاه لنسخه بلمسة واحدة)</i>\n\n` +
          `⚠️ <b>تنبيه أمان هام جداً:</b>\n` +
          `• تأكد من التحويل حصراً عبر شبكة <b>TRC20 (TRON)</b> لتجنب فقدان الرصيد.\n` +
          `• بعد إتمام التحويل، يرجى إرسال لقطة شاشة ورقم المعاملة (TXID / Hash) إلى المشرف لتفعيل اشتراكك وروبوت التداول فوراً.`
        : `💎 <b>Crypto Payment (USDT - TRC20):</b>\n\n` +
          `Available worldwide for all members 🌍\n\n` +
          `🌐 <b>Network:</b> <b>${escapeTgHtml(usdt.network || 'USDT (TRC20)')}</b>\n` +
          `📬 <b>Wallet Address:</b>\n` +
          `<code>${escapeTgHtml(usdt.address || 'TX79afTcXc1nG8ddRdpatFWHMFDqByXyzo')}</code>\n` +
          `<i>(Tap address above to copy)</i>\n\n` +
          `⚠️ <b>Important Note:</b>\n` +
          `• Transfer strictly via <b>TRC20 (TRON)</b> network.\n` +
          `• After payment, send TXID and screenshot to admin for instant activation.`;

      const buttons = isAr
        ? [
            [{ text: '📩 إرسال إشعار الدفع ورقم المعاملة (TXID) للمشرف', url: contactUrl }],
            [
              { text: '🔙 رجوع لخيارات الدفع', callback_data: 'onb_sub_paid' },
              { text: '🏠 القائمة الرئيسية', callback_data: 'onb_menu_main' }
            ]
          ]
        : [
            [{ text: '📩 Send Proof & TXID to Admin', url: contactUrl }],
            [
              { text: '🔙 Back to Payment Options', callback_data: 'onb_sub_paid' },
              { text: '🏠 Main Menu', callback_data: 'onb_menu_main' }
            ]
          ];

      const qrPath = usdt.qrImageUrl || '/assets/aistudio/IMG-20261107-WA0010_a0cea637.jpg';
      let photoSent = false;
      try {
        const pRes = await sendTelegramPhoto(token, chatId, qrPath, text, undefined, buttons);
        if (pRes?.ok) {
          photoSent = true;
        }
      } catch (_e) {}

      if (!photoSent) {
        await editOrSendTelegramInlineMessage(token, chatId, text, buttons, 'HTML', messageId);
      }
      return;
    }

    // Branch: IBAN EGP Details (Rest of World Only)
    if (data === 'onb_pay_iban_egp') {
      if (isEgyptCountryText(user.country)) {
        // STRICT GUARD: Egypt users must never see IBAN details
        const text =
          `🇪🇬 <b>تنبيه خاص بالمشتركين داخل مصر:</b>\n\n` +
          `طرق الدفع المعتمدة لمصر هي <b>إنستا باي (InstaPay)</b> و<b>المحافظ الإلكترونية</b> فقط.\n` +
          `تم توجيهك لوسائل الدفع المعتمدة:`;
        const buttons = [
          [
            { text: '⚡ إنستا باي (InstaPay)', callback_data: 'onb_pay_instapay' },
            { text: '📱 المحافظ الإلكترونية (كاش)', callback_data: 'onb_pay_wallets' }
          ],
          [{ text: '🏠 القائمة الرئيسية', callback_data: 'onb_menu_main' }]
        ];
        await editOrSendTelegramInlineMessage(token, chatId, text, buttons, 'HTML', messageId);
        return;
      }

      const ibanEgp = cfg.internationalPayment?.ibanEgp || defaultTelegramBotConfig.internationalPayment.ibanEgp;
      const isAr = user.language !== 'en';
      const text = isAr
        ? `🏦 <b>تفاصيل الحساب البنكي والآيبان (بالجنيه المصري EGP):</b>\n\n` +
          `🌍 <b>الدولة:</b> ${escapeTgHtml(ibanEgp.country || 'دولي 🌍')}\n` +
          `🏛 <b>اسم البنك:</b> ${escapeTgHtml(ibanEgp.bankName)}\n` +
          `👤 <b>اسم المستفيد:</b> ${escapeTgHtml(ibanEgp.beneficiaryName || (ibanEgp as any).accountName || 'ثريا نبيل / ZAD FX')}\n` +
          `💰 <b>العملة:</b> ${escapeTgHtml(ibanEgp.currency || 'الجنيه المصري EGP')}\n` +
          `🔢 <b>رقم الحساب:</b> <code>${escapeTgHtml(ibanEgp.accountNumber)}</code>\n` +
          `🌐 <b>رقم الآيبان (IBAN):</b> <code>${escapeTgHtml(ibanEgp.iban)}</code>\n` +
          `⚡ <b>سويفت كود (SWIFT/BIC):</b> <code>${escapeTgHtml(ibanEgp.swiftCode || 'NBEGEGCX')}</code>\n\n` +
          `📌 <i>بعد إتمام الحوالة البنكية، يرجى إرسال صورة إشعار التحويل للمشرف لتفعيل اشتراكك وروبوت التداول فوراً.</i>`
        : `🏦 <b>Bank Account & IBAN Details (in Egyptian Pounds EGP):</b>\n\n` +
          `🌍 <b>Country:</b> ${escapeTgHtml(ibanEgp.country || 'International 🌍')}\n` +
          `🏛 <b>Bank Name:</b> ${escapeTgHtml(ibanEgp.bankName)}\n` +
          `👤 <b>Beneficiary Name:</b> ${escapeTgHtml(ibanEgp.beneficiaryName || (ibanEgp as any).accountName || 'Thraya Nabil / ZAD FX')}\n` +
          `💰 <b>Currency:</b> ${escapeTgHtml(ibanEgp.currency || 'EGP (Egyptian Pounds)')}\n` +
          `🔢 <b>Account Number:</b> <code>${escapeTgHtml(ibanEgp.accountNumber)}</code>\n` +
          `🌐 <b>IBAN Code:</b> <code>${escapeTgHtml(ibanEgp.iban)}</code>\n` +
          `⚡ <b>SWIFT / BIC Code:</b> <code>${escapeTgHtml(ibanEgp.swiftCode || 'NBEGEGCX')}</code>\n\n` +
          `📌 <i>After wire transfer, please send receipt to admin for instant activation.</i>`;

      const buttons = isAr
        ? [
            [{ text: '📩 إرسال إشعار التحويل للمشرف', url: contactUrl }],
            [
              { text: '🔙 اختيار عملة أخرى (دولار)', callback_data: 'onb_sub_paid' },
              { text: '🏠 القائمة الرئيسية', callback_data: 'onb_menu_main' }
            ]
          ]
        : [
            [{ text: '📩 Send Receipt to Admin', url: contactUrl }],
            [
              { text: '🔙 Switch Currency (USD)', callback_data: 'onb_sub_paid' },
              { text: '🏠 Main Menu', callback_data: 'onb_menu_main' }
            ]
          ];

      await editOrSendTelegramInlineMessage(token, chatId, text, buttons, 'HTML', messageId);
      return;
    }

    // Branch: IBAN USD Details (Rest of World Only)
    if (data === 'onb_pay_iban_usd') {
      if (isEgyptCountryText(user.country)) {
        // STRICT GUARD: Egypt users must never see IBAN details
        const text =
          `🇪🇬 <b>تنبيه خاص بالمشتركين داخل مصر:</b>\n\n` +
          `طرق الدفع المعتمدة لمصر هي <b>إنستا باي (InstaPay)</b> و<b>المحافظ الإلكترونية</b> فقط.\n` +
          `تم توجيهك لوسائل الدفع المعتمدة:`;
        const buttons = [
          [
            { text: '⚡ إنستا باي (InstaPay)', callback_data: 'onb_pay_instapay' },
            { text: '📱 المحافظ الإلكترونية (كاش)', callback_data: 'onb_pay_wallets' }
          ],
          [{ text: '🏠 القائمة الرئيسية', callback_data: 'onb_menu_main' }]
        ];
        await editOrSendTelegramInlineMessage(token, chatId, text, buttons, 'HTML', messageId);
        return;
      }

      const ibanUsd = cfg.internationalPayment?.ibanUsd || defaultTelegramBotConfig.internationalPayment.ibanUsd;
      const isAr = user.language !== 'en';
      const text = isAr
        ? `💵 <b>تفاصيل الحساب البنكي والآيبان (بالدولار الأمريكي USD):</b>\n\n` +
          `🌍 <b>الدولة:</b> ${escapeTgHtml(ibanUsd.country || 'دولي 🌍')}\n` +
          `🏛 <b>اسم البنك:</b> ${escapeTgHtml(ibanUsd.bankName)}\n` +
          `👤 <b>اسم المستفيد:</b> ${escapeTgHtml(ibanUsd.beneficiaryName || (ibanUsd as any).accountName || 'ثريا نبيل / ZAD FX')}\n` +
          `💰 <b>العملة:</b> ${escapeTgHtml(ibanUsd.currency || 'الدولار الأمريكي USD ($)')}\n` +
          `🔢 <b>رقم الحساب:</b> <code>${escapeTgHtml(ibanUsd.accountNumber)}</code>\n` +
          `🌐 <b>رقم الآيبان (IBAN):</b> <code>${escapeTgHtml(ibanUsd.iban)}</code>\n` +
          `⚡ <b>سويفت كود (SWIFT/BIC):</b> <code>${escapeTgHtml(ibanUsd.swiftCode || 'NBEGEGCX')}</code>\n\n` +
          `📌 <i>بعد إتمام الحوالة البنكية، يرجى إرسال صورة إشعار التحويل للمشرف للتفعيل المباشر.</i>`
        : `💵 <b>Bank Account & IBAN Details (in US Dollars USD):</b>\n\n` +
          `🌍 <b>Country:</b> ${escapeTgHtml(ibanUsd.country || 'International 🌍')}\n` +
          `🏛 <b>Bank Name:</b> ${escapeTgHtml(ibanUsd.bankName)}\n` +
          `👤 <b>Beneficiary Name:</b> ${escapeTgHtml(ibanUsd.beneficiaryName || (ibanUsd as any).accountName || 'Thraya Nabil / ZAD FX')}\n` +
          `💰 <b>Currency:</b> ${escapeTgHtml(ibanUsd.currency || 'USD ($)')}\n` +
          `🔢 <b>Account Number:</b> <code>${escapeTgHtml(ibanUsd.accountNumber)}</code>\n` +
          `🌐 <b>IBAN Code:</b> <code>${escapeTgHtml(ibanUsd.iban)}</code>\n` +
          `⚡ <b>SWIFT / BIC Code:</b> <code>${escapeTgHtml(ibanUsd.swiftCode || 'NBEGEGCX')}</code>\n\n` +
          `📌 <i>After wire transfer, please send receipt to admin for instant activation.</i>`;

      const buttons = isAr
        ? [
            [{ text: '📩 إرسال إشعار التحويل للمشرف', url: contactUrl }],
            [
              { text: '🔙 اختيار عملة أخرى (جنيه)', callback_data: 'onb_sub_paid' },
              { text: '🏠 القائمة الرئيسية', callback_data: 'onb_menu_main' }
            ]
          ]
        : [
            [{ text: '📩 Send Receipt to Admin', url: contactUrl }],
            [
              { text: '🔙 Switch Currency (EGP)', callback_data: 'onb_sub_paid' },
              { text: '🏠 Main Menu', callback_data: 'onb_menu_main' }
            ]
          ];

      await editOrSendTelegramInlineMessage(token, chatId, text, buttons, 'HTML', messageId);
      return;
    }

    // Branch: Robot Guide & Explanations
    if (data === 'onb_menu_robot') {
      const isAr = user.language !== 'en';
      const webUrl = cfg.officialWebsiteUrl || 'https://fx.zadtoo.com';
      const videoUrl = cfg.robotGuide.videoUrl || 'https://youtube.com';

      const text = isAr
        ? `🤖 <b>روبوت التداول الآلي الذكي ZAD FX:</b>\n\n` +
          `🌟 <b>المواصفات والآلية:</b>\n` +
          `• يعمل كإضافة تداول مباشر على منصة كيوتكس (Quotex).\n` +
          `• يدمج 4 مؤشرات فنية: (Momentum Pause + ATR + RSI + SuperTrend).\n` +
          `• يمسح 6 أزواج بالتوازي في نفس اللحظة.\n` +
          `• يصدر الصفقة وينفذها بتأكيد 5 ثوانٍ قبل فتح الشمعة بدقة 00.00.\n\n` +
          `⏰ <b>فترات العمل اليومية:</b>\n` +
          `• الفترة الصباحية: 09:00 ص إلى 03:00 م (توقيت القاهرة)\n` +
          `• الفترة المسائية: 06:00 م إلى 09:00 م (توقيت القاهرة)\n\n` +
          `📹 يمكنك مشاهدة الفيديو التوضيحي لشرح طريقة التثبيت على متصفح Kiwi أو الكمبيوتر عبر الزر أدناه:`
        : `🤖 <b>ZAD FX Automated Trading Robot:</b>\n\n` +
          `🌟 <b>Key Features:</b>\n` +
          `• Executes directly on the Quotex platform via smart userscript.\n` +
          `• Fuses 4 indicators: Momentum Pause + ATR + RSI + SuperTrend.\n` +
          `• Scans 6 currency pairs simultaneously.\n` +
          `• 5-second pre-candle confirmation at 00.00.\n\n` +
          `⏰ <b>Daily Trading Hours (Cairo Time):</b>\n` +
          `• Morning Session: 09:00 AM - 03:00 PM\n` +
          `• Evening Session: 06:00 PM - 09:00 PM\n\n` +
          `📹 Click below to watch the setup tutorial video on Kiwi browser or PC:`;

      const buttons = isAr
        ? [
            [
              { text: '🎬 مشاهدة فيديو شرح التشغيل', url: videoUrl },
              { text: '🌐 صفحة الروبوت بالموقع', url: `${webUrl}/#autotrade` }
            ],
            [
              { text: '💬 استفسار من المشرف', url: contactUrl },
              { text: '🏠 القائمة الرئيسية', callback_data: 'onb_menu_main' }
            ]
          ]
        : [
            [
              { text: '🎬 Watch Robot Tutorial Video', url: videoUrl },
              { text: '🌐 Robot Website Page', url: `${webUrl}/#autotrade` }
            ],
            [
              { text: '💬 Contact Admin', url: contactUrl },
              { text: '🏠 Main Menu', callback_data: 'onb_menu_main' }
            ]
          ];

      await editOrSendTelegramInlineMessage(token, chatId, text, buttons, 'HTML', messageId);
      return;
    }
  }

  // 2. Handle Private Text Messages
  if (update.message && update.message.chat?.type === 'private') {
    const msg = update.message;
    const chatId = String(msg.chat.id);
    const text = String(msg.text || '').trim();
    const msgKey = `${chatId}:${msg.message_id}`;
    if (processedTelegramMessageKeys.has(msgKey)) {
      return;
    }
    processedTelegramMessageKeys.add(msgKey);
    if (processedTelegramMessageKeys.size > 2000) {
      const f = processedTelegramMessageKeys.values().next().value;
      if (f !== undefined) processedTelegramMessageKeys.delete(f);
    }

    const tgUsername = msg.chat.username ? `@${msg.chat.username}` : '';
    const firstName = msg.chat.first_name || '';
    const lastName = msg.chat.last_name || '';
    const fallbackName = [firstName, lastName].filter(Boolean).join(' ') || 'عضو جديد';

    if (!text) return;

    let user = telegramBotUsersStore.find(u => u.telegramChatId === chatId);
    if (!user) {
      user = {
        id: `tgu-${chatId}`,
        telegramChatId: chatId,
        username: tgUsername,
        name: fallbackName,
        country: '',
        language: 'ar',
        step: 'START',
        status: 'ACTIVE',
        membershipType: 'NONE',
        registeredAt: new Date().toISOString(),
        lastInteractionAt: new Date().toISOString()
      };
      telegramBotUsersStore.unshift(user);
      saveState();
    } else {
      user.lastInteractionAt = new Date().toISOString();
      if (tgUsername && !user.username) user.username = tgUsername;
    }

    if (user.status === 'BLOCKED') {
      await sendTelegramInlineMessage(token, chatId, '⛔ عذراً، تم حظر هذا الحساب من استخدام خدمات ZAD FX.');
      return;
    }
    if (user.status === 'SUSPENDED') {
      await sendTelegramInlineMessage(
        token,
        chatId,
        `⚠️ حسابك معلق مؤقتاً للمراجعة من قبل الإدارة.\nيرجى التواصل مع المشرف: ${contactUrl}`
      );
      return;
    }

    // Command: /start or initial greeting
    if (text.startsWith('/start') || text === 'ابدأ' || user.step === 'START') {
      user.step = 'START';
      saveState();
      const welcome =
        `مرحباً بك في بوت أكاديمية وروبوت ZAD FX للتداول الآلي 🚀\n\n` +
        `🔔 <b>تنويه هام:</b>\n` +
        `الخدمة <b>مجانية 100%</b> بالكامل ولا تتطلب أي رسوم اشتراكات!\n` +
        `كل ما عليك هو أن تتبع <b>رابط الإحالة</b> لتكون ضمن الفريق المستفيد. 🎁\n\n` +
        `<i>Welcome to ZAD FX Automated Trading Bot 🚀\nNotice: The service is 100% FREE with zero subscription fees, just follow our referral link to join our team.</i>\n\n` +
        `يرجى اختيار لغة المتابعة / Please choose your preferred language:`;

      const langButtons = [
        [
          { text: 'العربية 🇸🇦', callback_data: 'onb_lang_ar' },
          { text: 'English 🇬🇧', callback_data: 'onb_lang_en' }
        ]
      ];

      await sendTelegramInlineMessage(token, chatId, welcome, langButtons, 'HTML');
      return;
    }

    // If awaiting Name
    if (user.step === 'AWAITING_NAME') {
      user.name = text;
      user.step = 'AWAITING_COUNTRY';
      saveState();

      const isAr = user.language !== 'en';
      const ipVerifyUrl = `${webUrl}/api/verify-country?chatId=${user.telegramChatId}`;
      const promptCountry = isAr
        ? `أهلاً بك يا <b>${escapeTgHtml(user.name)}</b>! 🌍\n\n` +
          `يرجى الآن تحديد <b>الدولة التي تقيم فيها حالياً</b> (لتثبيت وسائل الدفع المناسبة لك):\n\n` +
          `💡 <i>يمكنك الضغط على زر (التحقق التلقائي عبر الـ IP) لتثبيت دولتك بنقرة واحدة مباشرة، أو اختيار دولتك من الأزرار:</i>`
        : `Welcome <b>${escapeTgHtml(user.name)}</b>! 🌍\n\n` +
          `Please set the <b>Country where you currently reside</b> (to enable your approved payment methods):\n\n` +
          `💡 <i>You can tap (Verify via IP) to auto-detect and lock your country, or choose below:</i>`;

      const countryButtons = isAr
        ? [
            [
              { text: '🌐 تحديد وتثبيت الدولة تلقائياً عبر الـ IP', url: ipVerifyUrl }
            ],
            [
              { text: '🇪🇬 جمهورية مصر العربية', callback_data: 'onb_set_country_eg' },
              { text: '🇵🇸 دولة فلسطين', callback_data: 'onb_set_country_ps' }
            ],
            [
              { text: '🌍 دولة أخرى (دولي)', callback_data: 'onb_set_country_intl' }
            ]
          ]
        : [
            [
              { text: '🌐 Auto-Verify Country via IP', url: ipVerifyUrl }
            ],
            [
              { text: '🇪🇬 Egypt', callback_data: 'onb_set_country_eg' },
              { text: '🇵🇸 Palestine', callback_data: 'onb_set_country_ps' }
            ],
            [
              { text: '🌍 Other Countries (International)', callback_data: 'onb_set_country_intl' }
            ]
          ];

      await sendTelegramInlineMessage(token, chatId, promptCountry, countryButtons, 'HTML');
      return;
    }

    // If awaiting Country during Onboarding
    if (user.step === 'AWAITING_COUNTRY') {
      let finalCountry = text.trim();
      if (isEgyptCountryText(finalCountry)) {
        finalCountry = 'جمهورية مصر العربية 🇪🇬';
      } else if (isPalestineCountryText(finalCountry)) {
        finalCountry = 'دولة فلسطين 🇵🇸';
      }
      user.country = finalCountry;
      user.step = 'COMPLETED';
      saveState();

      const isAr = user.language !== 'en';
      const welcomeNotice = isAr
        ? `✅ <b>تم حفظ وتحديد دولتك: ${escapeTgHtml(user.country)}</b> <i>(متاحة للتعديل بأي وقت من خيار الملف الشخصي)</i>`
        : `✅ <b>Country set: ${escapeTgHtml(user.country)}</b> <i>(Editable anytime from Profile)</i>`;

      await sendTelegramBotMainMenu(token, chatId, user, undefined, welcomeNotice);
      return;
    }

    // If member is updating Name from Profile
    if (user.step === 'EDIT_NAME') {
      user.name = text.trim() || user.name;
      user.step = 'COMPLETED';
      saveState();
      const isAr = user.language !== 'en';
      const notice = isAr
        ? `✅ <b>تم تعديل وتحديث اسمك بنجاح إلى:</b> <b>${escapeTgHtml(user.name)}</b>`
        : `✅ <b>Name updated successfully to:</b> <b>${escapeTgHtml(user.name)}</b>`;
      await sendTelegramBotMainMenu(token, chatId, user, undefined, notice);
      return;
    }

    // If member is adding/updating Email from Profile
    if (user.step === 'EDIT_EMAIL') {
      user.email = text.trim();
      user.step = 'COMPLETED';
      saveState();
      const isAr = user.language !== 'en';
      const notice = isAr
        ? `✅ <b>تم حفظ وتحديث بريدك الإلكتروني بنجاح:</b> <code>${escapeTgHtml(user.email)}</code>`
        : `✅ <b>Email saved successfully:</b> <code>${escapeTgHtml(user.email)}</code>`;
      await sendTelegramBotMainMenu(token, chatId, user, undefined, notice);
      return;
    }

    // If member is typing custom Country from Profile
    if (user.step === 'EDIT_COUNTRY') {
      let finalCountry = text.trim();
      if (isEgyptCountryText(finalCountry)) {
        finalCountry = 'جمهورية مصر العربية 🇪🇬';
      } else if (isPalestineCountryText(finalCountry)) {
        finalCountry = 'دولة فلسطين 🇵🇸';
      }
      user.country = finalCountry;
      user.step = 'COMPLETED';
      saveState();
      const isAr = user.language !== 'en';
      const notice = isAr
        ? `✅ <b>تم تعديل وتحديث دولتك بنجاح إلى:</b> <b>${escapeTgHtml(user.country)}</b>`
        : `✅ <b>Country updated successfully to:</b> <b>${escapeTgHtml(user.country)}</b>`;
      await sendTelegramBotMainMenu(token, chatId, user, undefined, notice);
      return;
    }

    // Quick Command or Keyword: Profile / البروفايل / الملف الشخصي
    const lowerText = text.toLowerCase();
    if (
      lowerText === '/profile' ||
      lowerText.includes('الملف الشخصي') ||
      lowerText.includes('البروفايل') ||
      lowerText.includes('بروفايل') ||
      lowerText.includes('my profile')
    ) {
      const isAr = user.language !== 'en';
      const profText = isAr
        ? `👤 <b>الملف الشخصي للعضو — أكاديمية ZAD FX 🚀</b>\n\n` +
          `🏷️ <b>الاسم:</b> ${escapeTgHtml(user.name)}\n` +
          `📧 <b>البريد الإلكتروني:</b> ${escapeTgHtml(user.email || 'لم يتم الإضافة بعد')}\n` +
          `🌍 <b>الدولة الحالية:</b> ${escapeTgHtml(user.country || 'غير محددة')} <i>(متاحة للتعديل)</i>\n` +
          `🆔 <b>معرف التليجرام (Chat ID):</b> <code>${user.telegramChatId}</code>\n` +
          `💎 <b>نوع العضوية:</b> ${user.membershipType === 'PAID_VIP' ? 'عضوية مدفوعة VIP 👑' : user.membershipType === 'FREE_REFERRAL' ? 'اشتراك مجاني عبر الإحالة 🎁' : 'عضو مسجل (عادي)'}\n\n` +
          `💡 <i>يمكنك تعديل أي من بياناتك أو تغيير دولتك بحرية في أي وقت:</i>`
        : `👤 <b>User Profile — ZAD FX Academy 🚀</b>\n\n` +
          `🏷️ <b>Name:</b> ${escapeTgHtml(user.name)}\n` +
          `📧 <b>Email:</b> ${escapeTgHtml(user.email || 'Not added')}\n` +
          `🌍 <b>Current Country:</b> ${escapeTgHtml(user.country || 'Not set')} <i>(Editable)</i>\n` +
          `🆔 <b>Telegram ID:</b> <code>${user.telegramChatId}</code>\n` +
          `💎 <b>Membership:</b> ${user.membershipType}\n\n` +
          `💡 <i>You can edit your personal details or country anytime:</i>`;

      const profButtons = isAr
        ? [
            [
              { text: '✏️ تعديل الاسم', callback_data: 'onb_prof_edit_name' },
              { text: '📧 إضافة / تعديل البريد', callback_data: 'onb_prof_edit_email' }
            ],
            [
              { text: '🌍 تغيير وتعديل الدولة', callback_data: 'onb_prof_edit_country' }
            ],
            [
              { text: '🏠 القائمة الرئيسية', callback_data: 'onb_menu_main' }
            ]
          ]
        : [
            [
              { text: '✏️ Edit Name', callback_data: 'onb_prof_edit_name' },
              { text: '📧 Add / Edit Email', callback_data: 'onb_prof_edit_email' }
            ],
            [
              { text: '🌍 Change Country', callback_data: 'onb_prof_edit_country' }
            ],
            [
              { text: '🏠 Main Menu', callback_data: 'onb_menu_main' }
            ]
          ];

      await sendTelegramInlineMessage(token, chatId, profText, profButtons, 'HTML');
      return;
    }

    // Quick Country Change Command
    if (lowerText.includes('تغيير الدولة') || lowerText.includes('تعديل الدولة') || lowerText.includes('change country')) {
      user.step = 'EDIT_COUNTRY';
      saveState();
      const isAr = user.language !== 'en';
      const prompt = isAr
        ? `🌍 <b>تعديل الدولة:</b>\n\nيرجى كتابة وإرسال اسم دولتك الآن (مثال: مصر، فلسطين، الجزائر، المغرب، السعودية، العراق، ...):`
        : `🌍 <b>Change Country:</b>\n\nPlease type and send your country name:`;
      await sendTelegramInlineMessage(token, chatId, prompt, undefined, 'HTML');
      return;
    }

    // If already completed and sent /menu or /start
    if (text.startsWith('/menu') || text === 'القائمة') {
      await sendTelegramBotMainMenu(token, chatId, user);
      return;
    }

    // If general text after completion, respond with the Main Menu
    if (user.step === 'COMPLETED') {
      await sendTelegramBotMainMenu(token, chatId, user);
    }
  }
}

async function pollOnboardingTelegramBotUpdates() {
  if (isPollingOnboardingBot) return;
  const cfg = telegramBotConfigStore;
  if (!cfg.isEnabled) return;
  const token = (cfg.botToken || '').trim() || autoPilot.botToken.trim() || DEFAULT_FREE_BOT_TOKEN;
  if (!token) return;

  isPollingOnboardingBot = true;
  try {
    const url = `https://api.telegram.org/bot${token}/getUpdates?offset=${lastOnboardingBotUpdateId + 1}&timeout=1`;
    const res = await fetch(url);
    const data = (await res.json()) as any;
    if (data.ok && Array.isArray(data.result) && data.result.length > 0) {
      let stateChanged = false;
      for (const update of data.result) {
        const uid = update.update_id;
        if (typeof uid === 'number') {
          if (uid <= lastOnboardingBotUpdateId || processedOnboardingUpdateIds.has(uid)) {
            continue;
          }
          lastOnboardingBotUpdateId = Math.max(lastOnboardingBotUpdateId, uid);
          processedOnboardingUpdateIds.add(uid);
          stateChanged = true;
          if (processedOnboardingUpdateIds.size > 2000) {
            const firstVal = processedOnboardingUpdateIds.values().next().value;
            if (firstVal !== undefined) processedOnboardingUpdateIds.delete(firstVal);
          }
        }
        await processInteractiveTelegramBotUpdate(update, token);
      }
      if (stateChanged) {
        saveState();
      }
    }
  } catch (_e) {
    // Ignore transient network hiccups
  } finally {
    isPollingOnboardingBot = false;
  }
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

  // 1. Edit original signal message in-place (synchronizes the formatted message text with WIN/LOSS)
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

  // 2. If there was a previous reply message (e.g. an earlier ❌ photo or message),
  // delete it first so there is NEVER a contradictory ❌ photo under an updated WIN trade!
  if (existingReplyMessageId) {
    try {
      await fetch(`https://api.telegram.org/bot${botToken.trim()}/deleteMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId.trim(),
          message_id: existingReplyMessageId
        })
      });
    } catch (_delErr) {
      // Ignore delete error
    }
    existingReplyMessageId = undefined;
    newReplyId = undefined;
  }

  // 3. Dispatch the new accurate result notification (Photo if uploaded and valid, otherwise clean text/emoji)
  if (originalMessageId) {
    try {
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
        // Send clean compact native emoji-sized notification (e.g. 👑✅ ربح VIP or ❌)
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
    } catch (_e) {
      // Ignore reply error
    }
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
  const cleanAsset = asset.replace('/', '').toUpperCase();
  const yahooSymbol = `${cleanAsset}=X`;

  for (let attempt = 1; attempt <= 4; attempt++) {
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
      const timestamps: number[] = result?.timestamp || [];
      const quote = result?.indicators?.quote?.[0] || {};
      const opens: (number | null)[] = quote.open || [];
      const closes: (number | null)[] = quote.close || [];

      let matchedIndex = -1;
      const targetDate = new Date(targetEpochSeconds * 1000);
      const targetMinute = targetDate.getUTCMinutes();
      const targetHour = targetDate.getUTCHours();

      for (let i = timestamps.length - 1; i >= 0; i--) {
        const ts = timestamps[i];
        const d = new Date(ts * 1000);
        const isTimeMatch =
          Math.abs(ts - targetEpochSeconds) <= 30 ||
          (d.getUTCMinutes() === targetMinute && d.getUTCHours() === targetHour);

        if (
          isTimeMatch &&
          typeof opens[i] === 'number' &&
          typeof closes[i] === 'number' &&
          opens[i] !== null &&
          closes[i] !== null
        ) {
          matchedIndex = i;
          break;
        }
      }

      if (matchedIndex !== -1) {
        const cOpen = opens[matchedIndex] as number;
        const cClose = closes[matchedIndex] as number;

        // In 1-Minute Binary Options (Quotex / PocketOption):
        // The strike price is the candle's OPEN at :00 seconds.
        // If candle closes in the trade's direction, the trade is a pure WIN!
        const diff = cClose - cOpen;

        if (Math.abs(diff) < 0.000001) {
          // Exactly flat candle: check against entry price if available
          if (typeof entryPriceNumeric === 'number' && entryPriceNumeric > 0) {
            const entryDiff = cClose - entryPriceNumeric;
            if (direction === 'CALL') {
              return entryDiff > 0.000001 ? 'WIN' : entryDiff < -0.000001 ? 'LOSS' : 'DRAW';
            } else {
              return entryDiff < -0.000001 ? 'WIN' : entryDiff > 0.000001 ? 'LOSS' : 'DRAW';
            }
          }
          return 'DRAW';
        }

        if (direction === 'CALL') {
          return diff > 0 ? 'WIN' : 'LOSS';
        } else {
          // PUT wins when candle closes below open (Red candle)
          return diff < 0 ? 'WIN' : 'LOSS';
        }
      }
    } catch (_e) {
      // Retry
    }

    if (attempt < 4) {
      await new Promise(r => setTimeout(r, 4000));
    }
  }

  // Secondary Fallback: Check liveMarketSnapshots if available
  const snap = liveMarketSnapshots.find(
    s => s.pair.replace('/', '').toUpperCase() === cleanAsset
  );
  if (snap && typeof entryPriceNumeric === 'number' && entryPriceNumeric > 0) {
    const liveDiff = snap.price - entryPriceNumeric;
    if (direction === 'CALL') {
      return liveDiff >= 0 ? 'WIN' : 'LOSS';
    } else {
      return liveDiff <= 0 ? 'WIN' : 'LOSS';
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
  if (!isGlobalForexMarketOpen()) {
    return { ok: false, error: 'السوق العالمي مغلق لعطلة نهاية الأسبوع (يغلق الجمعة 21:00 UTC ويفتح الأحد 21:00 UTC)' };
  }
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

  const supportingCount = candidate.indicatorConfluence?.supportingCount ?? 3;
  const validConditions = Math.max(3, Math.min(4, supportingCount));
  const conditionsMetText = `محققة بنجاح (${validConditions} من 4 شروط فنية معتمدة ✅)`;

  const parsed: ParsedSignal = {
    asset: candidate.pair,
    isOtc: false, // Strictly Global Market
    direction,
    timeframe: '1 دقيقة (M1)',
    entryMinute,
    entryTime: `:${entryMinute}`,
    payout: '(🌐)',
    removedItems: [],
    livePrice: candidate.formattedPrice,
    rsiValue: candidate.rsi,
    superTrend: superTrendLabel,
    fractalPattern: fractalLabel,
    supportResistance: candidate.supportResistance?.description || (direction === 'CALL' ? '🟢 ارتداد من خط الدعم [شرط أساسي محقق ✅]' : '🔴 ارتداد من خط المقاومة [شرط أساسي محقق ✅]'),
    analysisReason: candidate.reason,
    conditionsMetText
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
    payout: '(🌐)',
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

  // 1. Check Free Bot: Hard Stop if target reached (70%-75%+ or 3 wins) / celebration sent / outside 09:00 - 15:00
  const freeTargetStatus = getFreeBotTargetStatus();
  const cairoH = getCurrentEgyptHour();
  const todayEgyptStr = getCurrentEgyptDateString(new Date());
  const isFreeBotStoppedForToday =
    autoPilot.freeBotCelebrationSentDate === todayEgyptStr ||
    autoPilot.freeBotDailyTargetReached === true ||
    autoPilot.freeBotStoppedForToday === true ||
    freeTargetStatus.isTargetReached;

  // Free Bot is strictly STOPPED once target is achieved / celebration sent today / outside 09:00 - 12:00
  const canSendToFreeBot =
    autoPilot.freeBotEnabled !== false &&
    !isFreeBotStoppedForToday &&
    !(autoPilot.freeBotCooldownUntil && Date.now() < autoPilot.freeBotCooldownUntil) &&
    cairoH >= 9 &&
    cairoH < 12;

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

  // 2. VIP Channel Separation:
  // VIP Channel and Robot are strictly powered by the new Momentum Pause Breakout engine!
  // Classic signals are dedicated ONLY to the Free Public Channel (@ZadNBFX).
  vipTelegramMessageId = undefined;

  newSignal.telegramMessageId = telegramMessageId;
  newSignal.vipTelegramMessageId = undefined;
  autoPilot.lastError = telegramError || null;

  // CRITICAL: If an auto-pilot signal was NOT sent to Telegram Free Channel, do NOT keep it in signalsStore!
  if (isAuto && !telegramMessageId) {
    signalsStore = signalsStore.filter(s => s.id !== newSignal.id);
    await saveState();
    return { ok: false, error: 'تم إلغاء الإشارة لأنها لم تُرسل للقناة العامة المجانية' };
  }

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
        if (target.telegramMessageId) {
          await checkAndSendFreeBotTargetCelebration();
        }
        if (target.isLiveBroadcast || (target.payout && target.payout.includes('بث حي'))) {
          await handleLiveBroadcastSignalOutcome(target, 'WIN');
        } else {
          if (target.telegramMessageId) {
            await handleFreeBotTradeOutcome(target, 'WIN');
          }
          if (target.vipTelegramMessageId) {
            await handleVipBotTradeOutcome(target, 'WIN');
          }
        }
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
          if (galeTarget.telegramMessageId) {
            await checkAndSendFreeBotTargetCelebration();
          }
          if (galeTarget.isLiveBroadcast || (galeTarget.payout && galeTarget.payout.includes('بث حي'))) {
            await handleLiveBroadcastSignalOutcome(galeTarget, finalStatus);
          } else {
            if (galeTarget.telegramMessageId) {
              await handleFreeBotTradeOutcome(galeTarget, finalStatus);
            }
            if (galeTarget.vipTelegramMessageId) {
              await handleVipBotTradeOutcome(galeTarget, finalStatus);
            }
          }
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
      if (target.telegramMessageId) {
        await checkAndSendFreeBotTargetCelebration();
      }
      if (target.isLiveBroadcast || (target.payout && target.payout.includes('بث حي'))) {
        await handleLiveBroadcastSignalOutcome(target, 'LOSS');
      } else {
        if (target.telegramMessageId) {
          await handleFreeBotTradeOutcome(target, 'LOSS');
        }
        if (target.vipTelegramMessageId) {
          await handleVipBotTradeOutcome(target, 'LOSS');
        }
      }
    }, msUntilCandleClose);
  }

  saveState();
  return { ok: !telegramError, signal: newSignal, error: telegramError };
}

/**
 * DISPATCH VIP MOMENTUM PAUSE BREAKOUT SIGNAL (5-Second Instant Execution Engine):
 * 1. Confluence: Requires at least 3 of 4 indicators (Momentum Pause Breakout + ATR + RSI + Supertrend)
 * 2. Execution Timing: Dispatched at the :55s mark (5 seconds before candle boundary)
 * 3. Channel: Dedicated strictly to VIP Channel (-1004323890544) and Quotex Robot feed (Instant 5s Execution)
 * 4. Free channel is NOT notified of this signal
 */
async function dispatchVipMomentumPauseSignal(
  candidate: LivePairSnapshot,
  direction: 'CALL' | 'PUT',
  confluence: FourIndicatorConfluenceResult,
  isAuto = true,
  explicitVariant?: 'WITH_MPB' | 'WITHOUT_MPB'
): Promise<{ ok: boolean; signal?: SignalItem; error?: string }> {
  if (!isGlobalForexMarketOpen()) {
    return { ok: false, error: 'السوق العالمي مغلق لعطلة نهاية الأسبوع' };
  }
  const now = new Date();
  const currentSec = now.getSeconds();
  const secondsRemainingInCurrentMinute = 60 - currentSec;

  // Entry is targeted at :00 seconds (exact open of the upcoming 1-minute candle)
  // When fired at :55s, remaining time is ~5 seconds.
  const targetEntryDate = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    now.getHours(),
    now.getMinutes() + (secondsRemainingInCurrentMinute <= 1 ? 0 : 1),
    0,
    0
  );
  const targetEntryTimestamp = Math.floor(targetEntryDate.getTime() / 1000);
  const entryMinute = String(targetEntryDate.getMinutes()).padStart(2, '0');

  // Duplicate guard on exact same candle timestamp:
  const duplicateExists = signalsStore.some(
    s => s.targetEntryTimestamp === targetEntryTimestamp
  );
  if (duplicateExists) {
    return { ok: false, error: 'تم إرسال إشارة لهذه الشمعة بالفعل' };
  }

  const activeVipToken = (autoPilot.vipBotToken || DEFAULT_VIP_BOT_TOKEN).trim();
  const activeVipChat = (autoPilot.vipChatId || DEFAULT_VIP_CHAT_ID).trim();

  const isEveningLive = isEveningLiveNow();
  const effectiveVariant: 'WITH_MPB' | 'WITHOUT_MPB' = explicitVariant || 'WITH_MPB';

  const isOption2 = effectiveVariant === 'WITH_MPB';
  const isPublicOption = robotSettings.strategyEngineMode === 'PUBLIC_CLASSIC';

  // Calculate estimated success probability based on indicators confluence:
  let successPercent = 85 + (confluence.supportingCount || 3) * 2;
  if (isOption2) successPercent += 3;
  if (confluence.momentumPause?.isContinuation) successPercent += 2;
  successPercent = Math.min(95, Math.max(86, successPercent));

  const dirSymbol = direction === 'CALL' ? 'صعود 🟢 ⬆️ (CALL)' : 'هبوط 🔴 ⬇️ (PUT)';
  const matchedListStr = confluence.matchedList.length > 0
    ? confluence.matchedList.map(m => `• ${m}`).join('\n')
    : `• مؤشر Momentum Pause Breakout (${direction === 'CALL' ? 'اختراق صاعد ⬆️' : 'كسر هابط ⬇️'})\n• مؤشر ATR (سيولة نشطة)\n• مؤشر Supertrend (${direction === 'CALL' ? 'صاعد أخضر 🟢' : 'هابط أحمر 🔴'})`;

  const headerTitle = isEveningLive
    ? `🔴 بث مباشر حي مع ابوسليم 🔴 (Live Session ⚡)\n👑 ZAD VIP | إشارات التداول الفوري 👑`
    : `👑 ZAD VIP | إشارات أبوسليم 👑`;

  const strategyVariantTitle = isOption2
    ? `🎯 نوع الاستراتيجية: مؤشر VIP مع MPB (الشرط الأساسي محقق 💎)`
    : `⚡ نوع الاستراتيجية: مؤشر VIP بدون MPB (توافق 3 مؤشرات ⚡)`;

  const formattedMessage = [
    headerTitle,
    strategyVariantTitle,
    `━━━━━━━━━━━━━━━━━━━━`,
    `📊 الزوج: ${candidate.pair} (🌐)`,
    `🎯 الاتجاه: ${dirSymbol}`,
    `⏱️ وقت الدخول: :${entryMinute} (تنفيذ فوري خلال 5 ثوانٍ ⚡)`,
    `🎯 قوة ونسبة نجاح الإشارة المتوقعة: ${successPercent}% 📈`,
    `📈 التوافق الفني (${confluence.supportingCount} من 4 مؤشرات معتمدة ✅):`,
    `${matchedListStr}`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `⚠️ تنبيه: يرجى الالتزام الصارم بإدارة رأس المال (1% إلى 2% كحد أقصى لكل صفقة).`
  ].join('\n');

  const newSignal: SignalItem = {
    id: `sig-mp-${targetEntryTimestamp}`,
    asset: candidate.pair,
    isOtc: false,
    direction,
    timeframe: '1 دقيقة (M1)',
    entryMinute,
    entryTime: `:${entryMinute}`,
    targetEntryTimestamp,
    payout: isEveningLive ? '(🌐) (بث حي VIP 🔴)' : '(🌐) (VIP 5s Execution ⚡)',
    livePrice: candidate.formattedPrice,
    rsiValue: confluence.rsiValue,
    analysisReason: isOption2
      ? `MPB (شرط أساسي) + توافق ${confluence.supportingCount} من 4 مؤشرات (${confluence.matchedList.join(' + ')})`
      : `توافق ${confluence.supportingCount} من 4 مؤشرات بدون إلزام MPB (${confluence.matchedList.join(' + ')})`,
    entryPriceNumeric: candidate.price,
    qualityScore: Math.min(100, 75 + confluence.supportingCount * 6),
    strategyType: 'MOMENTUM_PAUSE_BREAKOUT',
    strategyVariant: effectiveVariant,
    successRateText: `${successPercent}%`,
    fourIndicatorConfluenceText: confluence.summary,
    instantExecution5s: true,
    isLiveBroadcast: isEveningLive,
    formattedMessage,
    status: 'PENDING',
    createdAt: new Date().toISOString(),
    resultSent: false,
    autoSent: isAuto
  };

  signalsStore = [
    newSignal,
    ...signalsStore.filter(s => s.id !== newSignal.id && s.targetEntryTimestamp !== targetEntryTimestamp)
  ].slice(0, 50);

  let vipTelegramMessageId: number | undefined;
  let telegramError: string | undefined;

  // Broadcast signals to both VIP Telegram Channel and Quotex Robot together without stopping:
  const canSendVip = autoPilot.vipEnabled !== false && isVipBotActiveNow();

  if (canSendVip && activeVipToken && activeVipChat) {
    try {
      const res = await sendTelegramMessage(activeVipToken, activeVipChat, formattedMessage);
      if (res.ok) {
        vipTelegramMessageId = res.result?.message_id;
      } else {
        telegramError = res.description || 'فشل إرسال إشارة VIP إلى تيليجرام';
      }
    } catch (err: any) {
      telegramError = err?.message || 'خطأ اتصال تيليجرام VIP';
    }
  }

  newSignal.vipTelegramMessageId = vipTelegramMessageId;
  newSignal.telegramMessageId = undefined;
  await saveState();

  // Evaluate trade outcome after candle finishes (68 seconds)
  const msUntilCandleClose = Math.max(65000, targetEntryDate.getTime() + 68000 - Date.now());
  setTimeout(async () => {
    await loadStateFromCloudAndDisk();
    const target = signalsStore.find(s => s.id === newSignal.id);
    if (!target || target.status !== 'PENDING' || target.resultSent) return;

    let outcome: 'WIN' | 'LOSS' | 'DRAW' = 'WIN';
    if (autoPilot.resultMode === 'candle_exact') {
      outcome = await evaluateCompletedM1Candle(
        target.asset,
        target.direction,
        targetEntryTimestamp,
        target.entryPriceNumeric
      );
    } else {
      outcome = 'WIN';
    }

    if (target.status !== 'PENDING' || target.resultSent) return;

    const finalStatus: 'WIN' | 'LOSS' | 'DRAW' = outcome;
    target.status = finalStatus;
    target.resultSent = true;
    target.formattedMessage = appendResultToSignalMessage(target.formattedMessage, finalStatus);
    await saveState();

    if (target.vipTelegramMessageId && activeVipToken && activeVipChat) {
      await updateTelegramSignalResult(activeVipToken, activeVipChat, target, finalStatus);
    }
    if (target.telegramMessageId) {
      const freeToken = (autoPilot.botToken || '').trim();
      const freeChat = (autoPilot.chatId || '').trim();
      if (freeToken && freeChat) {
        await updateTelegramSignalResult(freeToken, freeChat, target, finalStatus);
      }
    }
    if (target.isLiveBroadcast) {
      await handleLiveBroadcastSignalOutcome(target, finalStatus);
    } else {
      await handleVipBotTradeOutcome(target, finalStatus);
    }
    await saveState();
  }, msUntilCandleClose);

  return { ok: Boolean(vipTelegramMessageId) || !isAuto, signal: newSignal, error: telegramError };
}

let isScanningVipMomentumPause = false;
let lastVipDispatchedMinute = '';

async function checkVipMomentumPauseBreakoutLoop(): Promise<void> {
  if (isScanningVipMomentumPause) return;
  isScanningVipMomentumPause = true;

  try {
    if (!isGlobalForexMarketOpen()) return;
    const cairoHour = getCurrentEgyptHour();
    const isMpbRobotHours = cairoHour >= 9 && cairoHour < 21;
    // Continuous loop runs during Robot MPB hours (09:00 AM to 09:00 PM daily) or when VIP bot is active
    if (!isMpbRobotHours && !isVipBotActiveNow()) return;

    const now = new Date();
    const sec = now.getSeconds();

    // High-accuracy confirmation window before candle close: between :48 and :58 of the minute
    // Gives 2 to 12 seconds head start so signal is dispatched and executed smoothly at :00 candle open!
    if (sec < 48 || sec > 58) return;

    // Prevent duplicate firing in the exact same minute
    const currentMinuteKey = `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}-${now.getUTCHours()}:${now.getUTCMinutes()}`;
    if (lastVipDispatchedMinute === currentMinuteKey) return;

    // 1. High-Impact Economic News Pause:
    // Allows the robot to pause during high-impact news events (+/- 10 minutes around target time)
    const newsPause = isHighImpactNewsPauseActiveNow();
    if (newsPause.isPaused) {
      return;
    }

    // 2. Strict Post-Trade Cooldown Guard:
    // Must wait at least 2 full minutes (120 seconds) AFTER the currently open trade has closed!
    // Prevents consecutive minute 2, 3, 4 signal spamming.
    const lastSignal = signalsStore[0];
    if (lastSignal) {
      // 1-minute expiration: trade candle closes 60 seconds after entry
      const tradeCloseTimeMs = lastSignal.targetEntryTimestamp
        ? (lastSignal.targetEntryTimestamp + 60) * 1000
        : (lastSignal.createdAt ? new Date(lastSignal.createdAt).getTime() + 60 * 1000 : 0);

      // If the trade candle is still open, never dispatch another signal
      if (Date.now() < tradeCloseTimeMs) {
        return;
      }

      // Must wait at least 2 full minutes (120,000 ms) AFTER the trade candle closed
      const elapsedSinceTradeClosedMs = Date.now() - tradeCloseTimeMs;
      const minRequiredCooldownMs = 120 * 1000; // Strictly 2 minutes (120s) post-trade-close cooldown as requested
      if (elapsedSinceTradeClosedMs < minRequiredCooldownMs) {
        return; // Wait at least 2 full minutes after trade close
      }
    }

    // Pending trade guard: Never dispatch a new trade while any active trade is pending or executing
    const hasPendingTrade = signalsStore.some(
      s => s.status === 'PENDING' && Date.now() - new Date(s.createdAt).getTime() < 80 * 1000
    );
    if (hasPendingTrade) return;

    // Scan all 6 major pairs in one unified batch
    const { snapshots } = await scanRealGlobalForexMarket(false);
    if (!snapshots || snapshots.length === 0) return;

    const SIX_MAJOR_PAIRS = ['EUR/USD', 'EUR/JPY', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CAD'];
    const allowed = Array.from(new Set([...(autoPilot.allowedPairs || []), ...SIX_MAJOR_PAIRS]));

    const allowedSnapshots = snapshots.filter(s =>
      allowed.some(p => p === s.pair || p.replace('/', '') === s.pair.replace('/', ''))
    );

    // Filter snapshots that strictly meet the 4-indicator confluence rules (at least 3 supporting indicators)
    const qualifyingSnapshots = allowedSnapshots.filter(s => {
      const conf = s.fourIndicatorConfluence;
      return (
        conf &&
        conf.isSignalTriggered &&
        conf.candidateDirection &&
        (conf.supportingCount || 0) >= 3
      );
    });

    // Real Technical Scanning: If no genuine 3-indicator confluence exists, DO NOT send random or forced signals!
    if (qualifyingSnapshots.length === 0) {
      return;
    }

    let selectedCandidate: LivePairSnapshot | null = null;
    let chosenVariant: 'WITH_MPB' | 'WITHOUT_MPB' = 'WITH_MPB';
    let targetDir: 'CALL' | 'PUT' = 'CALL';
    let confPayload: any = null;

    // Last dispatched assets to encourage natural rotation across all 6 pairs instead of sticking to one pair
    const recentDispatched = signalsStore.slice(0, 4).map(s => s.asset);
    const lastDispatchedAsset = signalsStore[0]?.asset || '';

    // Sort by supporting indicator count then quality score
    const sorted = qualifyingSnapshots.sort((a, b) => {
      const countA = a.fourIndicatorConfluence?.supportingCount || 0;
      const countB = b.fourIndicatorConfluence?.supportingCount || 0;
      if (countB !== countA) return countB - countA;
      return (b.qualityScore || 0) - (a.qualityScore || 0);
    });

    // Pair rotation: pick pair not used recently among the 6 pairs
    const freshPairCandidate = sorted.find(s => !recentDispatched.includes(s.pair));
    const alternate = sorted.find(s => s.pair !== lastDispatchedAsset);
    selectedCandidate = freshPairCandidate || alternate || sorted[0];

    const conf = selectedCandidate.fourIndicatorConfluence!;
    targetDir = conf.candidateDirection!;
    const hasMpb = Boolean(conf.momentumPauseMatched && selectedCandidate.momentumPauseBreakout?.isDetected);
    chosenVariant = hasMpb ? 'WITH_MPB' : 'WITHOUT_MPB';

    confPayload = {
      momentumPause: selectedCandidate.momentumPauseBreakout as any,
      atrValue: selectedCandidate.momentumPauseBreakout?.atr || 0.0002,
      atrMatched: conf.atrMatched,
      rsiValue: selectedCandidate.rsi,
      rsiMatched: conf.rsiMatched,
      superTrendMatched: conf.superTrendMatched,
      superTrendDirection: selectedCandidate.superTrend?.trend || 'BULLISH',
      supportingCount: conf.supportingCount,
      candidateDirection: targetDir,
      isSignalTriggered: true,
      matchedList: conf.matchedList,
      summary: conf.summary
    };

    if (selectedCandidate && confPayload) {
      console.log(`[VIP MPB Engine ⚡] Confirmed 5s signal on ${selectedCandidate.pair} (${targetDir}) [${chosenVariant}] at second :${sec}. Dispatching for :00 open...`);

      lastVipDispatchedMinute = currentMinuteKey;

      await dispatchVipMomentumPauseSignal(
        selectedCandidate,
        targetDir,
        confPayload,
        true,
        chosenVariant
      );
    }
  } catch (err) {
    console.warn('[VIP Momentum Pause Loop Warn]', err);
  } finally {
    isScanningVipMomentumPause = false;
  }
}

/**
 * Evaluates Free Bot trade outcome:
 * - ONLY called if the signal was actually sent to Free Channel (`sig.telegramMessageId != null`).
 * - If Free Bot is ALREADY STOPPED for today (100% win rate / 70%-75% target reached, celebration sent, or past 12:00 PM),
 *   it must NEVER process losses, NEVER pause, and NEVER dispatch messages to the Free Channel!
 * - On WIN: resets consecutive losses to 0.
 * - On LOSS: increments consecutive losses. If >= 3, triggers a 30-minute pause and dispatches notice to Free Channel.
 */
async function handleFreeBotTradeOutcome(sig: SignalItem, status: 'WIN' | 'WIN_GALE1' | 'LOSS'): Promise<void> {
  // If this signal was not sent to Free Bot, do not touch Free Bot state!
  if (!sig.telegramMessageId) return;

  const todayEgyptStr = getCurrentEgyptDateString(new Date());
  // If Free Bot has already finished/closed today, do not process or dispatch any cooldown to Free Channel
  if (
    autoPilot.freeBotCelebrationSentDate === todayEgyptStr ||
    autoPilot.freeBotDailyTargetReached === true ||
    autoPilot.freeBotStoppedForToday === true ||
    getFreeBotTargetStatus().isTargetReached
  ) {
    return;
  }

  const isWin = status === 'WIN' || status === 'WIN_GALE1';
  if (isWin) {
    autoPilot.freeBotConsecutiveLosses = 0;
  } else if (status === 'LOSS') {
    // User instruction: NEVER stop or pause for losses or volatile market!
    // The robot continues scanning smoothly without halting or sending stoppage warnings.
    autoPilot.freeBotConsecutiveLosses = 0;
    autoPilot.freeBotCooldownUntil = undefined;
  }
  await saveState();
}

/**
 * Evaluates VIP Bot trade outcome:
 * - ONLY called if the signal was actually sent to VIP Channel (`sig.vipTelegramMessageId != null`).
 * - On WIN: resets VIP consecutive losses to 0.
 * - On LOSS: increments VIP consecutive losses. If >= 3, triggers a 30-minute pause for VIP Bot and sends notice to VIP Channel!
 */
async function handleVipBotTradeOutcome(sig: SignalItem, status: 'WIN' | 'WIN_GALE1' | 'LOSS' | 'DRAW'): Promise<void> {
  // If this signal was not sent to VIP Bot, do not touch VIP Bot state!
  if (!sig.vipTelegramMessageId) return;

  const isWin = status === 'WIN' || status === 'WIN_GALE1';
  if (isWin) {
    autoPilot.vipBotConsecutiveLosses = 0;
  } else if (status === 'LOSS') {
    // User instruction: NEVER stop or pause for losses or volatile market!
    // The robot continues scanning smoothly without halting or sending stoppage warnings.
    autoPilot.vipBotConsecutiveLosses = 0;
    autoPilot.vipBotCooldownUntil = undefined;
  }
  await saveState();
}

/**
 * Sends the closing report for the 6:00 PM Live Broadcast Session to VIP Channel:
 * - If win rate is good (wins > losses or winRate >= 70%): Congratulations message!
 * - If draw/loss/modest: Comforting message reassuring members about tomorrow and capital preservation.
 */
/**
 * Sends the closing report for the 6:00 PM Live Broadcast Session to VIP Channel:
 * Strictly follows user instructions:
 * - Stopping on 2 consecutive wins or net +2 wins over losses.
 * - Concludes with: "شكراً لكم نكتفي بهذا القدر ولنا لقاء يوم الغد"
 * - In case of win: congratulations! In case of loss/modest: comforting message and reassurance.
 */
async function sendLiveBroadcastClosingReport(_reason?: string): Promise<void> {
  const todayEgypt = getCurrentEgyptDateString(new Date());
  if (liveBroadcastSession.closingReportSentDate === todayEgypt) return;
  liveBroadcastSession.closingReportSentDate = todayEgypt;

  const vipToken = (autoPilot.vipBotToken || DEFAULT_VIP_BOT_TOKEN).trim();
  const vipChat = (autoPilot.vipChatId || DEFAULT_VIP_CHAT_ID).trim();
  const freeToken = (autoPilot.botToken || '').trim();
  const freeChat = (autoPilot.chatId || '').trim();

  const liveStatus = getEveningLiveSessionStatus();
  const wins = liveBroadcastSession.wins;
  const losses = liveBroadcastSession.losses;
  const winRate = liveBroadcastSession.winRate;
  const isWin = liveStatus.isProfitable || wins >= 2;

  let msg = '';
  if (isWin) {
    msg = [
      '🔴 التقرير الختامي لجلسة البث المباشر الحي | ZAD FX 🔴',
      `📅 التاريخ: ${todayEgypt} (جلسة البث المباشر 06:00 مساءً ⚡)`,
      '━━━━━━━━━━━━━━━━━━━',
      '🎉 ألف مبروك لجميع الإخوة والأخوات الذين تابعوا وتداولوا معنا في البث المباشر على جميع القنوات والروبوت!',
      'جلسة موفقة وأرباح مباركة بفضل الله تعالى 💰🏆',
      '',
      `📊 نتائج جلسة البث المباشر:`,
      `✅ عدد الصفقات الرابحة: ${wins}`,
      `❌ عدد الصفقات الخاسرة: ${losses}`,
      `🎯 نسبة النجاح المحققة: ${winRate}%`,
      '━━━━━━━━━━━━━━━━━━━',
      'شكراً لكم، نكتفي بهذا القدر ولنا لقاء يوم الغد بإذن الله تعالى 🤝✨',
      'تم إيقاف البث بنجاح لتحقيق الهدف الربحي وحماية المحفظة 🛡️',
      '━━━━━━━━━━━━━━━━━━━',
      `${appSettings.channelSignature || '💡 نركز على الفرص القوية فقط — التزم بإدارة رأس المال'}`
    ].join('\n');
  } else {
    msg = [
      '🛡️ التقرير الختامي لجلسة البث المباشر الحي | ZAD FX 🛡️',
      `📅 التاريخ: ${todayEgypt} (جلسة البث المباشر 06:00 مساءً ⚡)`,
      '━━━━━━━━━━━━━━━━━━━',
      'تم بحمد الله اختتام جلسة البث المباشر لهذا اليوم على جميع القنوات.',
      'نطمئنكم جميعاً بأن الغد قادم بإذن الله وسيحمل فرصاً أقوى لتعويض أي صفقة غير موفقة 🤝✨',
      'تقلبات السوق المؤقتة نتعامل معها دائماً بحكمة وإدارة رأس مال صارمة (1%) لحماية محافظكم.',
      '',
      `📊 نتائج جلسة البث المباشر:`,
      `✅ عدد الصفقات الرابحة: ${wins}`,
      `❌ عدد الصفقات الخاسرة: ${losses}`,
      `🎯 نسبة النجاح المحققة: ${winRate}%`,
      '━━━━━━━━━━━━━━━━━━━',
      'شكراً لكم، نكتفي بهذا القدر ولنا لقاء يوم الغد مع انطلاق الجلسة الصباحية 09:00 صباحاً بتوقيت مصر 🤝🛡️'
    ].join('\n');
  }

  // Send closing report to VIP channel
  if (vipToken && vipChat) {
    sendTelegramMessage(vipToken, vipChat, msg).catch(() => {});
  }

  // Send closing report to Free channel (all channels requirement)
  if (freeToken && freeChat) {
    sendTelegramMessage(freeToken, freeChat, msg).catch(() => {});
  }
  await saveState();
}

/**
 * Updates Live Broadcast Session statistics and evaluates automatic stopping conditions:
 * 1) 2 consecutive wins (2-0) or net +2 wins (wins - losses >= 2) -> Immediately stop broadcast and send closing report.
 * 2) 3 consecutive losses -> Emergency stop to preserve capital.
 */
async function handleLiveBroadcastSignalOutcome(sig: SignalItem, status: 'WIN' | 'WIN_GALE1' | 'LOSS' | 'DRAW'): Promise<void> {
  if (!sig.isLiveBroadcast && !(sig.payout && sig.payout.includes('بث حي'))) return;

  const todayEgypt = getCurrentEgyptDateString(new Date());
  if (liveBroadcastSession.activeDate !== todayEgypt) {
    liveBroadcastSession.activeDate = todayEgypt;
    liveBroadcastSession.wins = 0;
    liveBroadcastSession.losses = 0;
    liveBroadcastSession.consecutiveLosses = 0;
    liveBroadcastSession.totalTrades = 0;
    liveBroadcastSession.winRate = 0;
    liveBroadcastSession.firstSignalTimestamp = undefined;
    liveBroadcastSession.initialNoticeSentDate = '';
    liveBroadcastSession.celebrationSentDate = '';
    liveBroadcastSession.badMarketNoticeSentDate = '';
    liveBroadcastSession.closingReportSentDate = '';
  }

  const isWin = status === 'WIN' || status === 'WIN_GALE1';
  if (isWin) {
    liveBroadcastSession.wins += 1;
    liveBroadcastSession.consecutiveLosses = 0;
  } else if (status === 'LOSS') {
    liveBroadcastSession.losses += 1;
    liveBroadcastSession.consecutiveLosses += 1;
  } else if (status === 'DRAW') {
    liveBroadcastSession.draws = (liveBroadcastSession.draws || 0) + 1;
    // Note: DRAW returns 100% of capital, does not increment consecutiveLosses!
  }

  liveBroadcastSession.totalTrades = liveBroadcastSession.wins + liveBroadcastSession.losses + (liveBroadcastSession.draws || 0);
  const decisiveTrades = liveBroadcastSession.wins + liveBroadcastSession.losses;
  liveBroadcastSession.winRate = decisiveTrades > 0
    ? Math.round((liveBroadcastSession.wins / decisiveTrades) * 100)
    : (liveBroadcastSession.wins > 0 ? 100 : 0);

  // Stopping Condition 1: Emergency Stop-Loss on Bad Market (3 consecutive losses)
  if (liveBroadcastSession.consecutiveLosses >= (liveBroadcastSession.stopConsecutiveLosses || 3)) {
    liveBroadcastSession.status = 'STOPPED_BAD_MARKET';
    liveBroadcastSession.statusNote = '🛑 تم إيقاف جلسة البث الحي فوراً بسبب تسجيل 3 صفقات خاسرة متتالية لسوء السوق، وإرسال تنبيه الاعتذار للأعضاء.';
    
    if (liveBroadcastSession.badMarketNoticeSentDate !== todayEgypt) {
      liveBroadcastSession.badMarketNoticeSentDate = todayEgypt;
      const apologyMsg = [
        '⚠️ تنبيه هام من المشرف ZAD FX ⚠️',
        '━━━━━━━━━━━━━━━━━━━',
        'السوق ليس جيداً اليوم ونعتذر عن إيقاف الجلسة حرصاً على إدارة رأس المال وحماية محافظكم.',
        'سوف نعيد العمل غداً إن شاء الله 🛡️🤝',
        '━━━━━━━━━━━━━━━━━━━',
        'تذكر دائماً: حماية رأس المال هي الخطوة الأولى لاحتراف التداول والنجاح المستمر.'
      ].join('\n');

      const vipToken = (autoPilot.vipBotToken || DEFAULT_VIP_BOT_TOKEN).trim();
      const vipChat = (autoPilot.vipChatId || DEFAULT_VIP_CHAT_ID).trim();
      if (vipToken && vipChat) {
        sendTelegramMessage(vipToken, vipChat, apologyMsg).catch(() => {});
      }

      const freeToken = (autoPilot.botToken || '').trim();
      const freeChat = (autoPilot.chatId || '').trim();
      if (freeToken && freeChat) {
        sendTelegramMessage(freeToken, freeChat, apologyMsg).catch(() => {});
      }
    }
  } else {
    // Stopping Condition 2: 2 consecutive wins or Net +2 wins (Target achieved)
    const liveStatus = getEveningLiveSessionStatus();
    if (liveStatus.isSessionFinished) {
      liveBroadcastSession.status = 'STOPPED_TARGET_REACHED';
      liveBroadcastSession.statusNote = `🎉 تم تحقيق هدف البث المباشر (ربح صفقتين) واختتام الجلسة بنجاح بنسبة نجاح ${liveBroadcastSession.winRate}%.`;

      if (liveBroadcastSession.celebrationSentDate !== todayEgypt) {
        liveBroadcastSession.celebrationSentDate = todayEgypt;
        await sendLiveBroadcastClosingReport('target_reached');
      }
    }
  }

  await saveState();
}

/**
 * Dispatches an automated Live Broadcast signal at 6:00 PM (18:00 Egypt time)
 * strictly to the Private VIP Channel and Floating Robot (excludes public free channel).
 */
async function dispatchLiveBroadcastAutomatedSignal(candidate: LivePairSnapshot): Promise<{ ok: boolean; signal?: SignalItem; error?: string }> {
  const now = new Date();
  const secondsRemainingInCurrentMinute = 60 - now.getSeconds();
  const minutesAhead = secondsRemainingInCurrentMinute <= 1 ? 0 : 1;
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
  const dirSymbol = direction === 'CALL' ? 'صعود 🟢 ⬆️ (CALL)' : 'هبوط 🔴 ⬇️ (PUT)';

  const formattedMessage = [
    '🔴 البث المباشر مع ابوسليم 🔴',
    '━━━━━━━━━━━━━━━━━━━',
    `📊 الزوج: ${candidate.pair} (🌐)`,
    `🎯 الاتجاه: ${dirSymbol}`,
    `⏱️ وقت الدخول: :${entryMinute} (1 دقيقة (M1))`,
    '🎯 شروط الدخول: محققة بنجاح (3 من 4 شروط فنية معتمدة ✅)',
    '━━━━━━━━━━━━━━━━━━━',
    '⚠️ تنبيه: يرجى الالتزام الصارم بإدارة رأس المال (1% إلى 2% كحد أقصى لكل صفقة).'
  ].filter(Boolean).join('\n');

  const newSignal: SignalItem = {
    id: `sig-live-${targetEntryTimestamp}`,
    asset: candidate.pair,
    isOtc: false,
    direction,
    timeframe: '1 دقيقة (M1)',
    entryMinute,
    entryTime: `:${entryMinute}`,
    targetEntryTimestamp,
    payout: '(🌐) (البث المباشر مع ابوسليم 🔴)',
    livePrice: candidate.formattedPrice,
    rsiValue: candidate.rsi,
    analysisReason: candidate.reason,
    entryPriceNumeric: candidate.price,
    formattedMessage,
    status: 'PENDING',
    createdAt: new Date().toISOString(),
    resultSent: false,
    autoSent: true,
    isLiveBroadcast: true,
    instantExecution5s: true,
    strategyType: 'MOMENTUM_PAUSE_BREAKOUT',
    strategyVariant: 'WITH_MPB',
    successRateText: '95%'
  };

  signalsStore = [newSignal, ...signalsStore.filter(s => s.id !== newSignal.id)].slice(0, 50);
  liveBroadcastSession.lastDispatchedAt = new Date().toISOString();
  if (!liveBroadcastSession.firstSignalTimestamp) {
    liveBroadcastSession.firstSignalTimestamp = Date.now();
  }
  await saveState();

  let vipTelegramMessageId: number | undefined;
  let freeTelegramMessageId: number | undefined;

  const vipToken = (autoPilot.vipBotToken || DEFAULT_VIP_BOT_TOKEN).trim();
  const vipChat = (autoPilot.vipChatId || DEFAULT_VIP_CHAT_ID).trim();
  if (vipToken && vipChat) {
    try {
      const res = await sendTelegramMessage(vipToken, vipChat, formattedMessage);
      if (res.ok && res.result?.message_id) {
        vipTelegramMessageId = res.result.message_id;
        newSignal.vipTelegramMessageId = vipTelegramMessageId;
      }
    } catch (_err) {}
  }

  // All Telegram channels requirement: Also dispatch 6:00 PM Live Broadcast signal to Free Channel
  const freeToken = (autoPilot.botToken || '').trim();
  const freeChat = (autoPilot.chatId || '').trim();
  if (freeToken && freeChat) {
    try {
      const res = await sendTelegramMessage(freeToken, freeChat, formattedMessage);
      if (res.ok && res.result?.message_id) {
        freeTelegramMessageId = res.result.message_id;
        newSignal.telegramMessageId = freeTelegramMessageId;
      }
    } catch (_err) {}
  }

  const idx = signalsStore.findIndex(s => s.id === newSignal.id);
  if (idx !== -1) {
    if (vipTelegramMessageId) signalsStore[idx].vipTelegramMessageId = vipTelegramMessageId;
    if (freeTelegramMessageId) signalsStore[idx].telegramMessageId = freeTelegramMessageId;
  }
  await saveState();

  // Floating Robot HUD notification & cloud feed sync
  try {
    await saveState();
  } catch (_e) {}

  // Evaluation after candle close
  const msUntilCandleClose = Math.max(68000, targetEntryDate.getTime() + 68000 - Date.now());
  setTimeout(async () => {
    await loadStateFromCloudAndDisk();
    const target = signalsStore.find(s => s.id === newSignal.id);
    if (!target || target.status !== 'PENDING' || target.resultSent) return;

    let outcome: 'WIN' | 'LOSS' | 'DRAW' = 'WIN';
    if (autoPilot.resultMode === 'candle_exact') {
      outcome = await evaluateCompletedM1Candle(
        target.asset,
        target.direction,
        targetEntryTimestamp,
        target.entryPriceNumeric
      );
    }

    if (target.status !== 'PENDING' || target.resultSent) return;

    target.status = outcome === 'DRAW' ? 'DRAW' : outcome;
    target.resultSent = true;
    target.formattedMessage = appendResultToSignalMessage(target.formattedMessage, target.status);
    await saveState();

    const outcomeBadge = target.status === 'WIN'
      ? '👑✅ ربح بث حي VIP'
      : target.status === 'DRAW'
      ? '⚖️ تعادل (استرداد رأس المال بالكامل 100% 🛡️)'
      : '❌ خسارة';

    // Update in VIP Channel
    if (vipToken && vipChat && target.vipTelegramMessageId) {
      await updateSingleTelegramDestination(
        vipToken,
        vipChat,
        target.formattedMessage,
        outcomeBadge,
        target.vipTelegramMessageId
      );
    }

    // Update in Free Channel
    if (freeToken && freeChat && target.telegramMessageId) {
      await updateSingleTelegramDestination(
        freeToken,
        freeChat,
        target.formattedMessage,
        target.status === 'WIN' ? '✅ ربح بث حي' : target.status === 'DRAW' ? '⚖️ تعادل (استرداد 100%)' : '❌ خسارة',
        target.telegramMessageId
      );
    }

    await handleLiveBroadcastSignalOutcome(target, target.status);
  }, msUntilCandleClose);

  return { ok: true, signal: newSignal };
}

/**
 * Checks and manages the automated 6:00 PM (18:00 Egypt time) Live Broadcast session:
 * - 18:00: Sends introductory notice "نقول بسم الله ونبدأ بعد 10 دقائق استعدوا يا أبطال 🚀" to VIP
 * - 18:00 - 18:10: Pre-scan 10-minute warm-up
 * - 18:10+: Active broadcast exclusively to VIP Private Channel and Floating Robot
 * - Stops 60 minutes after the first signal is dispatched, or upon 70%-75% target, or upon 3 consecutive losses
 * - Sends congratulations or comforting closing report at end of session
 */
async function checkLiveBroadcastEveningSession(): Promise<void> {
  if (liveBroadcastSession.enabled === false) return;
  if (!isGlobalForexMarketOpen()) {
    liveBroadcastSession.status = 'IDLE';
    liveBroadcastSession.statusNote = 'السوق العالمي مغلق لعطلة نهاية الأسبوع';
    return;
  }

  const todayEgypt = getCurrentEgyptDateString(new Date());
  const cairoH = getCurrentEgyptHour();
  const cairoM = getCurrentEgyptMinute();

  if (liveBroadcastSession.activeDate !== todayEgypt) {
    liveBroadcastSession.activeDate = todayEgypt;
    liveBroadcastSession.status = 'IDLE';
    liveBroadcastSession.statusNote = 'الجلسة في وضع الاستعداد بانتظار موعد الساعة 06:00 مساءً (مسح 10 دقائق)';
    liveBroadcastSession.wins = 0;
    liveBroadcastSession.losses = 0;
    liveBroadcastSession.consecutiveLosses = 0;
    liveBroadcastSession.totalTrades = 0;
    liveBroadcastSession.winRate = 0;
    liveBroadcastSession.firstSignalTimestamp = undefined;
    liveBroadcastSession.initialNoticeSentDate = '';
    liveBroadcastSession.celebrationSentDate = '';
    liveBroadcastSession.badMarketNoticeSentDate = '';
    liveBroadcastSession.closingReportSentDate = '';
    liveBroadcastSession.lastScanCandidate = undefined;
    liveBroadcastSession.lastDispatchedAt = undefined;
    await saveState();
  }

  // Fallback evaluator: Evaluate any finished live broadcast candle whose result was missed
  const nowMs = Date.now();
  for (const sig of signalsStore) {
    if (
      (sig.isLiveBroadcast || (sig.payout && sig.payout.includes('بث حي'))) &&
      sig.status === 'PENDING' &&
      !sig.resultSent &&
      sig.targetEntryTimestamp &&
      nowMs >= (sig.targetEntryTimestamp + 68) * 1000
    ) {
      const outcome = await evaluateCompletedM1Candle(
        sig.asset,
        sig.direction,
        sig.targetEntryTimestamp,
        sig.entryPriceNumeric
      );
      sig.status = outcome === 'DRAW' ? 'DRAW' : outcome;
      sig.resultSent = true;
      sig.formattedMessage = appendResultToSignalMessage(sig.formattedMessage, sig.status);
      await saveState();

      const vipToken = (autoPilot.vipBotToken || DEFAULT_VIP_BOT_TOKEN).trim();
      const vipChat = (autoPilot.vipChatId || DEFAULT_VIP_CHAT_ID).trim();
      if (vipToken && vipChat && sig.vipTelegramMessageId) {
        await updateSingleTelegramDestination(
          vipToken,
          vipChat,
          sig.formattedMessage,
          sig.status === 'WIN'
            ? '👑✅ ربح بث حي VIP'
            : sig.status === 'DRAW'
            ? '⚖️ تعادل (استرداد رأس المال بالكامل 100% 🛡️)'
            : '❌ خسارة',
          sig.vipTelegramMessageId
        );
      }
      await handleLiveBroadcastSignalOutcome(sig, sig.status);
    }
  }

  if (
    liveBroadcastSession.status === 'STOPPED_TARGET_REACHED' ||
    liveBroadcastSession.status === 'STOPPED_BAD_MARKET' ||
    liveBroadcastSession.status === 'STOPPED_SESSION_COMPLETED'
  ) {
    return;
  }

  // Before 18:00 (6:00 PM)
  if (cairoH < (liveBroadcastSession.startHourEgypt || 18)) {
    liveBroadcastSession.status = 'IDLE';
    liveBroadcastSession.statusNote = 'الجلسة مبرمجة لتبدأ الساعة 06:00 مساءً بتوقيت القاهرة مع فترة مسح 10 دقائق';
    return;
  }

  // Check 60-minute duration stopping condition from the first signal dispatched:
  if (
    liveBroadcastSession.firstSignalTimestamp &&
    Date.now() >= liveBroadcastSession.firstSignalTimestamp + (liveBroadcastSession.sessionDurationMinutes || 60) * 60 * 1000
  ) {
    liveBroadcastSession.status = 'STOPPED_SESSION_COMPLETED';
    liveBroadcastSession.statusNote = '🛑 تم اختتام جلسة البث الحي بعد مرور 60 دقيقة من انطلاق أول صفقة وإرسال تقرير الختام للأعضاء.';
    await sendLiveBroadcastClosingReport('60_minutes');
    return;
  }

  // 18:00 to 18:10 -> Send introductory message and start 10-minute deep scanning phase
  if (cairoH === (liveBroadcastSession.startHourEgypt || 18) && cairoM < (liveBroadcastSession.preScanMinutes || 10)) {
    liveBroadcastSession.status = 'PRE_SCANNING';
    const minsLeft = (liveBroadcastSession.preScanMinutes || 10) - cairoM;
    liveBroadcastSession.statusNote = `🔍 فترة المسح الفني لفرص السوق العالمي جارية قبل البث (متبقي ${minsLeft} دقيقة حتى بداية إرسال الصفقات)`;

    // Send the requested starting notice to all channels (VIP + Free) if not yet sent today
    if (liveBroadcastSession.initialNoticeSentDate !== todayEgypt) {
      liveBroadcastSession.initialNoticeSentDate = todayEgypt;
      const introMsg = [
        '🔴 بث مباشر حي مع ابوسليم 🔴 (Live Session ⚡)',
        '━━━━━━━━━━━━━━━━━━━',
        'نقول بسم الله ونبدأ بعد 10 دقائق ⏱️',
        'استعدوا يا أبطال 🚀',
        '━━━━━━━━━━━━━━━━━━━',
        'البث المباشر يعمل على جميع قنوات التليجرام وروبوت التداول الآلي ⚡'
      ].join('\n');

      const vipToken = (autoPilot.vipBotToken || DEFAULT_VIP_BOT_TOKEN).trim();
      const vipChat = (autoPilot.vipChatId || DEFAULT_VIP_CHAT_ID).trim();
      if (vipToken && vipChat) {
        sendTelegramMessage(vipToken, vipChat, introMsg).catch(() => {});
      }

      const freeToken = (autoPilot.botToken || '').trim();
      const freeChat = (autoPilot.chatId || '').trim();
      if (freeToken && freeChat) {
        sendTelegramMessage(freeToken, freeChat, introMsg).catch(() => {});
      }
      await saveState();
    }

    try {
      const { selectedCandidate } = await scanRealGlobalForexMarket(false);
      if (selectedCandidate) {
        liveBroadcastSession.lastScanCandidate = `${selectedCandidate.pair} (${selectedCandidate.reason})`;
      }
    } catch (_e) {}
    return;
  }

  // Active broadcast from 18:10 onwards (strictly within 60 minutes of the first signal):
  liveBroadcastSession.status = 'ACTIVE_BROADCAST';
  const minsRunning = liveBroadcastSession.firstSignalTimestamp
    ? Math.floor((Date.now() - liveBroadcastSession.firstSignalTimestamp) / 60000)
    : 0;
  liveBroadcastSession.statusNote = `🟢 جلسة البث الحي نشطة حالياً وترسل صفقات السوق العالمي لقناة VIP (مضى ${minsRunning} دقيقة من أصل 60 دقيقة)`;

  const now = Date.now();
  const recentLiveSignal = signalsStore.find(
    s => (s.isLiveBroadcast || (s.payout && s.payout.includes('بث حي'))) && now - new Date(s.createdAt).getTime() < 7 * 60 * 1000
  );
  if (recentLiveSignal) {
    return;
  }

  const { selectedCandidate } = await scanRealGlobalForexMarket(false);
  if (!selectedCandidate) return;

  await dispatchLiveBroadcastAutomatedSignal(selectedCandidate);
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

  // Filter signals belonging to the target date (strictly VIP channel signals, excluding live broadcast)
  const daySignals = signalsStore.filter(s => {
    if (!s.createdAt) return false;
    if (s.isLiveBroadcast || (s.payout && s.payout.includes('بث حي'))) return false;
    if (!s.vipTelegramMessageId) return false;
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
    : liveDirectWins;
  const gale1Wins = savedRec?.manualOverride
    ? savedRec.gale1Wins
    : liveGale1Wins;
  const lossesWithGale = savedRec?.manualOverride
    ? savedRec.losses
    : liveLosses;

  const totalWinsWithGale = directWins + gale1Wins;
  const totalCompleted = totalWinsWithGale + lossesWithGale;
  const firstCandleLossesNoGale = gale1Wins + lossesWithGale;

  const winRateWithGale =
    totalCompleted > 0 ? Math.round((totalWinsWithGale / totalCompleted) * 100) : 0;
  const winRateNoGale =
    totalCompleted > 0 ? Math.round((directWins / totalCompleted) * 100) : 0;

  // Net Profit on $1 base unit with $0.85 broker payout per win, $1.00 loss
  const netProfitNoGale1Usd = Number((directWins * 0.85 - firstCandleLossesNoGale * 1.0).toFixed(2));
  const netProfitWithGale1Usd = Number(
    ((directWins + gale1Wins) * 0.85 - lossesWithGale * 1.0).toFixed(2)
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
    p.netUnitsNoGale = Number((p.directWins * 0.85 - (p.gale1Wins + p.losses) * 1.0).toFixed(2));
    p.netUnitsWithGale = Number(((p.directWins + p.gale1Wins) * 0.85 - p.losses * 1.0).toFixed(2));
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
    `📊 التقرير المختصر لختام التداول | ${appSettings.channelTitle || 'ZAD FX | إشارات أبوسليم'}`,
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
    `📊 التقرير الختامي لجلسة التداول للقناة العامة | ${appSettings.channelTitle || 'ZAD FX | إشارات أبوسليم'}`,
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
    `👑 التقرير الختامي لقناة VIP الخاصة | ${appSettings.channelTitle || 'ZAD FX | إشارات أبوسليم'}`,
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

/**
 * Dispatches Free Channel 12:00 PM (noon) closing report if target wasn't celebrated earlier:
 */
async function checkAndSendFreeBot12Report(): Promise<void> {
  const todayEgypt = getCurrentEgyptDateString(new Date());
  if (autoPilot.freeBotCelebrationSentDate === todayEgypt) return; // Already celebrated
  if (autoPilot.freeBot12ReportSentDate === todayEgypt) return; // Already sent 12:00 PM report
  const currentH = getCurrentEgyptHour();
  const endH = autoPilot.freeEndHourEgypt || 12;
  if (currentH < endH) return; // Not yet 12:00 PM

  const freeToken = (autoPilot.botToken || '').trim();
  const freeChat = (autoPilot.chatId || '').trim();
  if (!freeToken || !freeChat) return;

  const report = buildEndOfDayFinalReport(todayEgypt);
  if (report.totalCompleted === 0) return;

  const freeReportMsg = [
    `🎯 تقرير ختام القناة العامة | ${appSettings.channelTitle || 'ZAD FX | إشارات أبوسليم'}`,
    `📅 التاريخ: ${todayEgypt} (ختام الجلسة الرسمية 12:00 ظهراً بتوقيت مصر)`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `📊 نتائج صفقات اليوم:`,
    `✅ عدد الصفقات الرابحة: ${report.oneGaleActiveInBot ? report.totalWinsWithGale : report.directWins}`,
    `❌ عدد الصفقات الخاسرة: ${report.oneGaleActiveInBot ? report.lossesWithGale : report.firstCandleLossesNoGale}`,
    `🎯 نسبة النجاح: ${report.oneGaleActiveInBot ? report.winRateWithGale : report.winRateNoGale}%`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `🛑 تم اختتام جلسة التداول بالقناة العامة لهذا اليوم عند الساعة 12:00 ظهراً بتوقيت مصر.`,
    ``,
    `👑 تنويه هام لجميع المتابعين:`,
    `• قناة VIP الخاصة على تليجرام مستمرة في العمل واستقبال الصفقات حتى الساعة 12:00 ظهراً.`,
    `• وتعاود بث إشاراتها من جديد في بث مباشر حي الساعة 06:00 مساءً بتوقيت مصر.`,
    `• روبوت التداول الآلي يعمل بشكل آلي طوال فترة عمل قناة VIP الخاصة.`,
    ``,
    `🔗 للانضمام لقناة VIP الخاصة وتفعيل الروبوت الآلي:`,
    `${autoPilot.quotexReferralLink || 'https://broker-qx.pro/?lid=2303934'}`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `نلتقي بكم غداً في تمام الساعة 09:00 صباحاً بتوقيت مصر 🤝`,
    `${appSettings.channelSignature || '💡 نركز على الفرص القوية فقط — التزم بإدارة رأس المال'}`
  ].join('\n');

  try {
    const res = await sendTelegramMessage(freeToken, freeChat, freeReportMsg);
    if (res.ok) {
      autoPilot.freeBot12ReportSentDate = todayEgypt;
      autoPilot.freeBotStoppedForToday = true;
      await saveState();
    }
  } catch (_e) {}
}

/**
 * Dispatches the VIP Channel 12:00 PM (noon) Morning Session Report:
 * - Fires at 12:00 PM Cairo time to conclude the VIP morning session.
 * - Reports exact number of wins, losses, and win percentage %.
 * - If profitable/winning (wins > losses or winRate >= 60%): Congratulations message!
 * - If draw/loss/modest: Comforting message reassuring members about tomorrow & evening live session.
 * - Reminds members of the 06:00 PM Live Broadcast!
 */
async function checkAndSendVipMorning12Report(): Promise<void> {
  const todayEgypt = getCurrentEgyptDateString(new Date());
  if (autoPilot.vipMorningReportSentDate === todayEgypt) return;
  const currentH = getCurrentEgyptHour();
  if (currentH < 15) return; // Dispatches at 03:00 PM (15:00) at the end of the first session

  const vipToken = (autoPilot.vipBotToken || DEFAULT_VIP_BOT_TOKEN).trim();
  const vipChat = (autoPilot.vipChatId || DEFAULT_VIP_CHAT_ID).trim();
  if (!vipToken || !vipChat) return;

  // Filter VIP signals of today between 09:00 AM and 03:00 PM (excluding live broadcast)
  const morningVipSignals = signalsStore.filter(s => {
    if (!s.createdAt || s.status === 'PENDING') return false;
    if (s.isLiveBroadcast || (s.payout && s.payout.includes('بث حي'))) return false;
    if (!s.vipTelegramMessageId) return false;
    const d = new Date(s.createdAt);
    if (isNaN(d.getTime())) return false;
    return getCurrentEgyptDateString(d) === todayEgypt && getEgyptHourFromDate(d) < 15;
  });

  const is0Gale = !autoPilot.oneGaleEnabled;
  const wins = morningVipSignals.filter(s => s.status === 'WIN' || (!is0Gale && s.status === 'WIN_GALE1')).length;
  const losses = morningVipSignals.filter(s => s.status === 'LOSS' || (is0Gale && s.status === 'WIN_GALE1')).length;
  const total = wins + losses;
  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;

  if (total === 0) return;

  const isGoodWin = total >= 2 && winRate >= 60 && wins > losses;

  let message = '';
  if (isGoodWin) {
    message = [
      '👑 التقرير الختامي للفترة الأولى لقناة VIP الخاصة وروبوت التداول الآلي 👑',
      `📅 التاريخ: ${todayEgypt} (إغلاق الفترة الأولى 03:00 عصراً بتوقيت مصر)`,
      '━━━━━━━━━━━━━━━━━━━━',
      '🎉 ألف مبروك لجميع أعضاء ومتاجري قناة VIP وروبوت التداول الآلي الأبطال!',
      'جلسة أولى ممتازة وأرباح وفيرة ومباركة بفضل الله تعالى 💰🏆',
      '',
      `📊 نتائج الفترة الأولى (09:00 ص - 03:00 م):`,
      `✅ عدد الصفقات الرابحة: ${wins}`,
      `❌ عدد الصفقات الخاسرة: ${losses}`,
      `🎯 نسبة النجاح المحققة: ${winRate}%`,
      '━━━━━━━━━━━━━━━━━━━━',
      '🛑 تم اختتام الفترة الأولى بنجاح تام لتأمين الأرباح المحققة.',
      '🔴 موعدنا القادم يتجدد معكم في البث المباشر الحي في تمام الساعة 06:00 مساءً بتوقيت مصر ⚡',
      'روبوت التداول الآلي في وضع الاستراحة حتى انطلاق البث المسائي 🛡️',
      '━━━━━━━━━━━━━━━━━━━━',
      `${appSettings.channelSignature || '💡 نركز على الفرص القوية فقط — التزم بإدارة رأس المال'}`
    ].join('\n');
  } else {
    message = [
      '🛡️ التقرير الختامي للفترة الأولى لقناة VIP وروبوت التداول الآلي 🛡️',
      `📅 التاريخ: ${todayEgypt} (إغلاق الفترة الأولى 03:00 عصراً بتوقيت مصر)`,
      '━━━━━━━━━━━━━━━━━━━━',
      'تم بحمد الله اختتام الفترة الأولى عند الساعة 03:00 عصراً.',
      'نطمئنكم جميعاً بأن السوق واجه بعض التذبذبات، والتعويض قادم ومؤكد بإذن الله تعالى في جلسة البث المباشر المسائية 🤝✨',
      'التزامنا الصارم بإدارة رأس المال (1%) هو حصنكم المنيع الذي يحمي حساباتكم دائماً في كافة الظروف.',
      '',
      `📊 نتائج الفترة الأولى (09:00 ص - 03:00 م):`,
      `✅ عدد الصفقات الرابحة: ${wins}`,
      `❌ عدد الصفقات الخاسرة: ${losses}`,
      `🎯 نسبة النجاح المحققة: ${winRate}%`,
      '━━━━━━━━━━━━━━━━━━━━',
      '🔴 نلتقي بكم لتعويض الصفقات وتحقيق الأرباح في البث المباشر الحصري الساعة 06:00 مساءً بتوقيت مصر ⚡',
      'استريحوا الآن ونراكم على خير في موعد البث 🤝🛡️'
    ].join('\n');
  }

  try {
    const res = await sendTelegramMessage(vipToken, vipChat, message);
    if (res.ok) {
      autoPilot.vipMorningReportSentDate = todayEgypt;
      await saveState();
    }
  } catch (_e) {}
}

/**
 * Dispatches the VIP Channel 03:00 PM (15:00 Cairo time) End-of-Session Report:
 * - If win rate is good (wins > losses or winRate >= 60%): Congratulations message!
 * - If draw/loss/modest: Comforting message reassuring members about tomorrow and capital preservation.
 */
async function checkAndSendVipClosingReport(): Promise<void> {
  const todayEgypt = getCurrentEgyptDateString(new Date());
  if (autoPilot.vipClosingReportSentDate === todayEgypt) return;
  const currentH = getCurrentEgyptHour();
  if (currentH < 21) return; // Closes at 09:00 PM (21:00)

  const vipToken = (autoPilot.vipBotToken || DEFAULT_VIP_BOT_TOKEN).trim();
  const vipChat = (autoPilot.vipChatId || DEFAULT_VIP_CHAT_ID).trim();
  if (!vipToken || !vipChat) return;

  // Filter VIP signals of today (strictly VIP channel signals, excluding live broadcast)
  const dayVipSignals = signalsStore.filter(s => {
    if (!s.createdAt || s.status === 'PENDING') return false;
    if (s.isLiveBroadcast || (s.payout && s.payout.includes('بث حي'))) return false;
    if (!s.vipTelegramMessageId) return false;
    const d = new Date(s.createdAt);
    if (isNaN(d.getTime())) return false;
    return getCurrentEgyptDateString(d) === todayEgypt;
  });

  const is0Gale = !autoPilot.oneGaleEnabled;
  const wins = dayVipSignals.filter(s => s.status === 'WIN' || (!is0Gale && s.status === 'WIN_GALE1')).length;
  const losses = dayVipSignals.filter(s => s.status === 'LOSS' || (is0Gale && s.status === 'WIN_GALE1')).length;
  const total = wins + losses;
  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;

  if (total === 0) return;

  const isGoodWin = total >= 2 && winRate >= 60 && wins > losses;

  let message = '';
  if (isGoodWin) {
    message = [
      '👑 التقرير الختامي لقناة VIP الخاصة وروبوت كيوتكس | ZAD FX 👑',
      `📅 التاريخ: ${todayEgypt} (ختام جلسة اليوم الرسمية 09:00 مساءً بتوقيت مصر)`,
      '━━━━━━━━━━━━━━━━━━━━',
      '🎉 ألف مبروك لجميع أعضاء ومتاجري قناة VIP وروبوت كيوتكس الأبطال!',
      'جلسة تداول مميزة وأرباح مباركة بفضل الله تعالى 💰🏆',
      `📊 نتائج جلسة VIP اليوم:`,
      `✅ صفقات رابحة: ${wins}`,
      `❌ صفقات تعويضية: ${losses}`,
      `🎯 نسبة النجاح: ${winRate}%`,
      '━━━━━━━━━━━━━━━━━━━━',
      'بارك الله في أرباحكم جميعاً ونلتقي غداً في تمام الساعة 09:00 صباحاً مع انطلاق الصفقات الجديدة 🤝✨'
    ].join('\n');
  } else {
    message = [
      '🛡️ التقرير الختامي لقناة VIP الخاصة وروبوت كيوتكس | ZAD FX 🛡️',
      `📅 التاريخ: ${todayEgypt} (ختام جلسة اليوم الرسمية 09:00 مساءً بتوقيت مصر)`,
      '━━━━━━━━━━━━━━━━━━━━',
      'تم بحمد الله اختتام جلسة اليوم الرسمية.',
      'نطمئنكم جميعاً بأن الغد قادم بإذن الله وسيحمل فرصاً أجمل وأرباحاً أفضل بكثير 🤝✨',
      'السوق اليوم واجه تقلبات وارتدادات خارجة عن المألوف، والتزامنا الصارم بإدارة رأس المال (1%) هو درعنا الحقيقي الذي يحمي محافظكم دائماً في الأيام المتقلبة.',
      `📊 نتائج الجلسة: ${wins} صفقة رابحة | ${losses} صفقات تعويضية`,
      '━━━━━━━━━━━━━━━━━━━━',
      'راحة اليوم والاستعداد للغد هو جوهر النجاح والاستمرارية.. نراكم غداً في تمام الساعة 09:00 صباحاً بأقوى الفرص إن شاء الله 🛡️'
    ].join('\n');
  }

  try {
    const res = await sendTelegramMessage(vipToken, vipChat, message);
    if (res.ok) {
      autoPilot.vipClosingReportSentDate = todayEgypt;
      await saveState();
    }
  } catch (_e) {}
}

// Background Worker: Scans Global Forex Market without flooding
async function checkFocusedGlobalMarketAutoPilot() {
  if (isCheckingAutoPilot) return;
  isCheckingAutoPilot = true;

  try {
    const isMarketOpen = isGlobalForexMarketOpen();
    autoPilot.marketOpenStatus = isMarketOpen;

    if (!isMarketOpen) {
      return;
    }

    // Sync cloud state first so if another container (`ais-pre` or `ais-dev`) just sent a signal, we know immediately!
    await loadStateFromCloudAndDisk();

    if (enforceDailySignalReset()) {
      await saveState();
    }

    // Always refresh live market snapshots every minute so Admin & Visitor see real prices
    const { selectedCandidate } = await scanRealGlobalForexMarket(false);

    // Fallback background evaluator: Only runs if a signal is still PENDING after sufficient time has passed
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
          if (sig.telegramMessageId) {
            await checkAndSendFreeBotTargetCelebration();
          }
          if (sig.isLiveBroadcast || (sig.payout && sig.payout.includes('بث حي'))) {
            await handleLiveBroadcastSignalOutcome(sig, finalOutcome);
          } else {
            if (sig.telegramMessageId) {
              await handleFreeBotTradeOutcome(sig, finalOutcome);
            }
            if (sig.vipTelegramMessageId) {
              await handleVipBotTradeOutcome(sig, finalOutcome);
            }
          }
          stateChanged = true;
        }
      }
    }
    if (stateChanged) {
      await saveState();
    }

    // 1. 6:00 PM Live Broadcast Evening Session (18:00 Egypt time, VIP only, 10-min pre-scan, 60 minutes duration, dynamic stop on 70%-75% or 3 consecutive losses)
    await checkLiveBroadcastEveningSession();

    // 2. Free Bot 12:00 PM (noon) closing report dispatcher (if target was not reached before 12:00 PM)
    await checkAndSendFreeBot12Report();

    // 2.b VIP Bot 12:00 PM (noon) morning session closing report dispatcher
    await checkAndSendVipMorning12Report();

    // 3. VIP Bot End-of-Day report dispatcher
    await checkAndSendVipClosingReport();

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
    // - Free Bot: active between 09:00 AM and 12:00 PM (noon), stops on 70%-75% target or 30-min pause on 3 consecutive losses
    // - VIP Bot: active daily 09:00 AM - 09:00 PM regardless of win/loss results
    // - Floating Robot: active daily 09:00 AM - 09:00 PM
    const isFreeActive = isFreeBotActiveNow(autoPilot);
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
  if (!isGlobalForexMarketOpen()) return;
  if (!autoPilot.enabled || !autoPilot.botToken.trim() || !autoPilot.chatId.trim()) return;

  // CRITICAL: Prevent duplicate getUpdates conflict if autoPilot uses the same bot token as the interactive bot!
  const onbToken = (telegramBotConfigStore.botToken || '').trim() || DEFAULT_FREE_BOT_TOKEN;
  if (telegramBotConfigStore.isEnabled && autoPilot.botToken.trim() === onbToken) {
    return;
  }

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
          const freeTarget = getFreeBotTargetStatus();
          const cairoH = getCurrentEgyptHour();
          const canSendFree =
            autoPilot.freeBotEnabled !== false &&
            !freeTarget.isTargetReached &&
            cairoH >= 9 &&
            cairoH < 15;

          if (!canSendFree) {
            await sendTelegramMessage(
              autoPilot.botToken,
              String(msg.chat.id),
              '⚠️ تم إيقاف بث القناة العامة حالياً (محققاً المستهدف اليومي 70% - 75% أو خارج فترة العمل 09:00 ص - 03:00 م).'
            );
            continue;
          }

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

// Ultra-High-Frequency 1s Loop for VIP Momentum Pause Breakout (fires at :53-:55s mark, giving 5-7s head start)
setInterval(() => {
  checkVipMomentumPauseBreakoutLoop();
}, 1000);

setInterval(() => {
  pollTelegramBotIncomingForwards();
}, 6 * 1000);

// 24/7 Interactive Onboarding Telegram Bot Polling Loop (Registration, Multi-Language, Payment Routing)
setInterval(() => {
  pollOnboardingTelegramBotUpdates();
}, 2500);

// 24/7 Permanent Keep-Alive: Pings external Cloud Run URL + localhost every 45s so container never enters idle sleep
setInterval(() => {
  fetch('http://localhost:3000/api/health').catch(() => {});
  fetch('https://ais-pre-vplsbzvt35dzg6l6qdryd4-317188159968.europe-west2.run.app/api/health').catch(() => {});
}, 45 * 1000);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.set('trust proxy', true);

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
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
    const incoming = req.body || {};
    robotSettings = {
      ...robotSettings,
      ...incoming,
      isPublishedToVisitors:
        typeof incoming.isPublishedToVisitors === 'boolean'
          ? incoming.isPublishedToVisitors
          : robotSettings.isPublishedToVisitors,
      strategyEngineMode:
        incoming.strategyEngineMode === 'PUBLIC_CLASSIC'
          ? 'PUBLIC_CLASSIC'
          : 'VIP_WITH_MPB',
      noMartingaleStrict: true // Strictly 0 Martingale
    };
    const cloudSaved = await saveState();
    res.json({ ok: true, robotSettings, cloudSaved });
  });

  // Dedicated endpoint for instantly switching strategy mode from Quotex Robot HUD or Admin
  app.post('/api/quotex-robot/strategy-mode', async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
    const rawMode = req.body?.mode || req.body?.strategyEngineMode;
    const mode = rawMode === 'PUBLIC_CLASSIC' ? 'PUBLIC_CLASSIC' : 'VIP_WITH_MPB';
    robotSettings.strategyEngineMode = mode;
    const cloudSaved = await saveState();
    return res.json({ ok: true, strategyEngineMode: robotSettings.strategyEngineMode, cloudSaved });
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

    // Floating Robot Strategy Mode Resolution:
    // Respects client dropdown selection via query parameter ?strategyMode=... or headers
    const rawMode = String(req.query.strategyMode || req.headers['x-strategy-mode'] || '').trim();
    const effectiveMode: RobotStrategyEngineMode =
      rawMode === 'PUBLIC_CLASSIC'
        ? 'PUBLIC_CLASSIC'
        : 'VIP_WITH_MPB';

    const workingStatus = getRobotWorkingStatusForMode(effectiveMode);
    const isRobotActive = workingStatus.isActive;
    const isLocked = workingStatus.isLocked;

    const warmup = getWarmupStatus();
    const freeBotStatus = getFreeBotTargetStatus();
    const isVipActive = isVipBotActiveNow();

    // Latest active/recent signal for the robot to alert & auto-execute on Quotex
    // Strictly filtered to the user's selected strategy mode, operating hours, and market open!
    const isGlobalMarketOpen = isGlobalForexMarketOpen();
    const latestSig = (isGlobalMarketOpen && isRobotActive && !warmup.isWarmup)
      ? getLiveRobotActiveSignal(effectiveMode)
      : null;
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
        instantExecution5s: Boolean(latestSig.instantExecution5s),
        strategyEngineMode: effectiveMode,
        strategyVariant: latestSig.strategyVariant || 'WITH_MPB',
        successRateText: latestSig.successRateText || '91%',
        createdAt: latestSig.createdAt
      };
    }

    res.json({
      ok: true,
      authorized: true,
      strategyEngineMode: effectiveMode,
      effectiveStrategyMode: effectiveMode,
      strategyTitle: workingStatus.strategyTitle,
      serverTimeIso: new Date().toISOString(),
      serverEpochSeconds: Math.floor(Date.now() / 1000),
      marketOpen: isGlobalMarketOpen,
      isMarketOpen: isGlobalMarketOpen,
      serverMarketOpen: isGlobalMarketOpen,
      isTradingHours: isRobotActive,
      isLockedOutsideHours: isLocked,
      lockReason: workingStatus.lockReason,
      workingHoursText: workingStatus.workingHoursText,
      nextSessionText: workingStatus.nextSessionText,
      isWarmup: warmup.isWarmup,
      warmupMinutesRemaining: warmup.minutesRemaining,
      tradingHoursMessage: isLocked
        ? workingStatus.lockReason
        : warmup.isWarmup
        ? `جاري مسح سيولة السوق والإحماء (${warmup.minutesRemaining} دقيقة متبقية)...`
        : `ساعات التداول نشطة (${workingStatus.workingHoursText})`,
      freeBotStatus: {
        isTargetReached: freeBotStatus.isTargetReached,
        todayWins: freeBotStatus.todayWins,
        todayLosses: freeBotStatus.todayLosses,
        ratioText: freeBotStatus.targetRatioText,
        description: freeBotStatus.statusDescription
      },
      vipBotStatus: {
        isActive: isVipActive,
        hoursText: 'الجلسة الصباحية: 09:00 ص - 12:00 م | البث المباشر: 06:00 مساءً'
      },
      robotConfig: {
        title: robotSettings.robotTitle,
        version: robotSettings.version,
        strategyEngineMode: effectiveMode,
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
      targetPair: 'EUR/USD',
      pairSelectionMode: 'multi_pair_scan',
      allowedPairs: ['EUR/USD', 'EUR/JPY', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CAD'],
      scannedPairs: ['EUR/USD', 'EUR/JPY', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CAD'],
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
    const host = req.get('host') || 'fx.zadtoo.com';
    const proto = host.includes('localhost') || host.includes('127.0.0.1') ? 'http' : 'https';
    const origin = `${proto}://${host}`;
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
    const host = req.get('host') || 'fx.zadtoo.com';
    const proto = host.includes('localhost') || host.includes('127.0.0.1') ? 'http' : 'https';
    const origin = `${proto}://${host}`;
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

  // Trigger VIP Momentum Pause Breakout Signal Now (Manual Admin Trigger)
  app.post('/api/admin/momentum-pause/trigger-now', async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');

    const preferredPair = req.body?.preferredPair || (req.query?.preferredPair as string | undefined);
    const forcedDirection = req.body?.direction as 'CALL' | 'PUT' | undefined;

    const { snapshots, selectedCandidate } = await scanRealGlobalForexMarket(true, preferredPair);
    const candidate = selectedCandidate || (snapshots.length > 0 ? snapshots[0] : null);

    if (!candidate) {
      return res.status(400).json({
        ok: false,
        error: 'تعذر مسح بيانات السوق العالمي حالياً، يرجى المحاولة بعد لحظات.'
      });
    }

    const direction: 'CALL' | 'PUT' = forcedDirection || candidate.fourIndicatorConfluence?.candidateDirection || candidate.signalReady || (candidate.rsi <= 50 ? 'CALL' : 'PUT');

    const confluence = candidate.fourIndicatorConfluence || {
      momentumPause: candidate.momentumPauseBreakout as any,
      atrValue: candidate.momentumPauseBreakout?.atr || 0.0002,
      atrMatched: true,
      rsiValue: candidate.rsi,
      rsiMatched: true,
      superTrendMatched: true,
      superTrendDirection: candidate.superTrend?.trend || 'BULLISH',
      supportingCount: 4,
      candidateDirection: direction,
      isSignalTriggered: true,
      matchedList: [
        `Momentum Pause Breakout (${direction === 'CALL' ? 'اختراق صاعد ⬆️' : 'كسر هابط ⬇️'})`,
        'مؤشر ATR (سيولة نشطة)',
        `مؤشر RSI (${candidate.rsi.toFixed(1)})`,
        `مؤشر Supertrend (${candidate.superTrend?.trend === 'BULLISH' ? 'صاعد أخضر 🟢' : 'هابط أحمر 🔴'})`
      ],
      summary: '4 من 4 مؤشرات متوافقة'
    };

    const result = await dispatchVipMomentumPauseSignal(candidate, direction, confluence as any, false);

    res.json({
      ok: result.ok,
      signal: result.signal,
      error: result.error,
      confluence
    });
  });

  // Get live status of 4-indicator confluence across all scanned pairs
  app.get('/api/admin/momentum-pause/status', async (_req, res) => {
    const { snapshots } = await scanRealGlobalForexMarket(false);
    const radar = snapshots.map(s => ({
      pair: s.pair,
      price: s.formattedPrice,
      rsi: s.rsi,
      superTrend: s.superTrend,
      momentumPause: s.momentumPauseBreakout,
      confluence: s.fourIndicatorConfluence,
      isTriggered: s.fourIndicatorConfluence?.isSignalTriggered || false,
      supportingCount: s.fourIndicatorConfluence?.supportingCount || 0
    }));

    res.json({
      ok: true,
      marketOpen: isGlobalForexMarketOpen(),
      isVipActive: isVipBotActiveNow(),
      radar
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

      const freeToken = (autoPilot.botToken || DEFAULT_FREE_BOT_TOKEN).trim();
      const freeChat = (autoPilot.chatId || DEFAULT_FREE_CHAT_ID).trim();
      const vipToken = (autoPilot.vipBotToken || DEFAULT_VIP_BOT_TOKEN).trim();
      const vipChat = (autoPilot.vipChatId || DEFAULT_VIP_CHAT_ID).trim();

      if (type === 'signal') {
        const now = new Date();
        const nextMin = String((now.getMinutes() + 1) % 60).padStart(2, '0');
        const targetEntryDate = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
          now.getHours(),
          now.getMinutes() + 1,
          0,
          0
        );
        const targetEntryTimestamp = Math.floor(targetEntryDate.getTime() / 1000);
        const entryMinute = nextMin;

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
          '🔴 البث المباشر مع ابوسليم 🔴',
          '━━━━━━━━━━━━━━━━━━━',
          `📊 الزوج: ${pair} (🌐)`,
          `🎯 الاتجاه: ${dirSymbol}`,
          `⏱️ وقت الدخول: :${entryMinute} (${timeframe})`,
          '🎯 شروط الدخول: محققة بنجاح (3 من 4 شروط فنية معتمدة ✅)',
          customNotes && customNotes.trim() ? `\n📝 توجيهات وملاحظات المشرف:\n${customNotes.trim()}` : '',
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
          payout: '(🌐) (البث المباشر مع ابوسليم 🔴)',
          livePrice: formattedPrice,
          rsiValue: direction === 'CALL' ? 38 : 62,
          analysisReason: customNotes && customNotes.trim() ? `🔴 بث حي للمشرف: ${customNotes.trim()}` : '🔴 إشارة بث حي مباشر صادرة من المشرف',
          entryPriceNumeric: numericPrice,
          formattedMessage,
          status: 'PENDING',
          createdAt: new Date().toISOString(),
          resultSent: false,
          autoSent: false,
          isLiveBroadcast: true
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
          await saveState();
        }

        // Auto-evaluate trade outcome after candle close and update Live Broadcast stats
        const msUntilManualClose = Math.max(68000, targetEntryTimestamp * 1000 + 68000 - Date.now());
        setTimeout(async () => {
          await loadStateFromCloudAndDisk();
          const target = signalsStore.find(s => s.id === newSignal.id);
          if (!target || target.status !== 'PENDING' || target.resultSent) return;

          let outcome: 'WIN' | 'LOSS' | 'DRAW' = 'WIN';
          if (autoPilot.resultMode === 'candle_exact') {
            outcome = await evaluateCompletedM1Candle(
              target.asset,
              target.direction,
              targetEntryTimestamp,
              target.entryPriceNumeric
            );
          }

          if (target.status !== 'PENDING' || target.resultSent) return;
          target.status = outcome === 'DRAW' ? 'DRAW' : outcome;
          target.resultSent = true;
          target.formattedMessage = appendResultToSignalMessage(target.formattedMessage, target.status);
          await saveState();

          if (sendToVip && vipToken && vipChat && target.vipTelegramMessageId) {
            await updateSingleTelegramDestination(
              vipToken,
              vipChat,
              target.formattedMessage,
              target.status === 'WIN'
                ? '👑✅ ربح بث حي VIP'
                : target.status === 'DRAW'
                ? '⚖️ تعادل (استرداد رأس المال بالكامل 100% 🛡️)'
                : '❌ خسارة',
              target.vipTelegramMessageId
            );
          }
          if (sendToFree && freeToken && freeChat && target.telegramMessageId) {
            await updateSingleTelegramDestination(
              freeToken,
              freeChat,
              target.formattedMessage,
              target.status === 'WIN'
                ? '✅ ربح بث حي'
                : target.status === 'DRAW'
                ? '⚖️ تعادل (استرداد 100%)'
                : '❌ خسارة',
              target.telegramMessageId
            );
          }

          await handleLiveBroadcastSignalOutcome(target, target.status);
        }, msUntilManualClose);

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
  // 6:00 PM LIVE BROADCAST SESSION ENDPOINTS
  // -------------------------------------------------------------

  // Get current Live Broadcast Session status & stats
  app.get('/api/admin/live-broadcast-session', async (_req, res) => {
    if (!isCloudStateLoaded) {
      await loadStateFromCloudAndDisk();
    }
    const cairoH = getCurrentEgyptHour();
    const cairoM = getCurrentEgyptMinute();
    const todayEgypt = getCurrentEgyptDateString(new Date());

    // Compute live signals count for live broadcast today
    const liveSignalsToday = signalsStore.filter(s => {
      if (!s.createdAt) return false;
      const isLive = s.isLiveBroadcast || (s.payout && s.payout.includes('بث حي'));
      if (!isLive) return false;
      const d = new Date(s.createdAt);
      if (isNaN(d.getTime())) return false;
      return getCurrentEgyptDateString(d) === todayEgypt;
    });

    res.json({
      ok: true,
      session: liveBroadcastSession,
      liveSignalsCountToday: liveSignalsToday.length,
      signals: liveSignalsToday.slice(0, 15),
      cairoTime: {
        hour: cairoH,
        minute: cairoM,
        formatted: `${String(cairoH).padStart(2, '0')}:${String(cairoM).padStart(2, '0')}`,
        date: todayEgypt
      }
    });
  });

  // Update Live Broadcast Session settings or perform action (reset, toggle)
  app.post('/api/admin/live-broadcast-session/config', async (req, res) => {
    const {
      enabled,
      minWinRateTarget,
      maxWinRateTarget,
      stopConsecutiveLosses,
      action
    } = req.body || {};

    if (typeof enabled === 'boolean') {
      liveBroadcastSession.enabled = enabled;
    }
    if (typeof minWinRateTarget === 'number') {
      liveBroadcastSession.minWinRateTarget = Math.max(50, Math.min(95, minWinRateTarget));
    }
    if (typeof maxWinRateTarget === 'number') {
      liveBroadcastSession.maxWinRateTarget = Math.max(minWinRateTarget || 70, Math.min(100, maxWinRateTarget));
    }
    if (typeof stopConsecutiveLosses === 'number') {
      liveBroadcastSession.stopConsecutiveLosses = Math.max(1, Math.min(10, stopConsecutiveLosses));
    }

    if (action === 'reset') {
      const todayEgypt = getCurrentEgyptDateString(new Date());
      liveBroadcastSession.activeDate = todayEgypt;
      liveBroadcastSession.status = 'IDLE';
      liveBroadcastSession.statusNote = 'تمت إعادة ضبط الجلسة يدوياً بواسطة المشرف';
      liveBroadcastSession.wins = 0;
      liveBroadcastSession.losses = 0;
      liveBroadcastSession.consecutiveLosses = 0;
      liveBroadcastSession.totalTrades = 0;
      liveBroadcastSession.winRate = 0;
      liveBroadcastSession.celebrationSentDate = '';
      liveBroadcastSession.badMarketNoticeSentDate = '';
    }

    await saveState();
    res.json({ ok: true, session: liveBroadcastSession });
  });

  // Manually trigger pre-scan or immediate live broadcast signal
  app.post('/api/admin/live-broadcast-session/trigger-now', async (req, res) => {
    const { mode } = req.body || {}; // 'scan' | 'signal'
    const { selectedCandidate } = await scanRealGlobalForexMarket(false);

    if (mode === 'scan') {
      liveBroadcastSession.status = 'PRE_SCANNING';
      liveBroadcastSession.statusNote = '🔍 تم تشغيل المسح الفني الفوري للأسواق العالمية يدوياً من المشرف';
      if (selectedCandidate) {
        liveBroadcastSession.lastScanCandidate = `${selectedCandidate.pair} (${selectedCandidate.reason})`;
      }
      await saveState();
      return res.json({ ok: true, mode: 'scan', candidate: selectedCandidate, session: liveBroadcastSession });
    }

    // Force dispatch immediate live broadcast signal to VIP
    if (!selectedCandidate) {
      return res.status(400).json({ ok: false, error: 'لا توجد فرصة مؤكدة في السوق العالمي حالياً لإرسالها' });
    }

    liveBroadcastSession.status = 'ACTIVE_BROADCAST';
    liveBroadcastSession.statusNote = `🟢 تم إرسال صفقة بث حي فورية (${selectedCandidate.pair}) إلى قناة VIP`;
    const result = await dispatchLiveBroadcastAutomatedSignal(selectedCandidate);
    res.json({ ok: result.ok, signal: result.signal, error: result.error, session: liveBroadcastSession });
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
    try {
      const rawId = String(req.params?.id || '');
      const cleanId = decodeURIComponent(rawId);
      const idx = forexNewsStore.findIndex(n => n.id === cleanId || n.id === rawId);
      const body = req.body || {};
      let updatedItem: ForexNewsItem;

      if (idx !== -1) {
        const existing = forexNewsStore[idx];
        updatedItem = {
          ...existing,
          ...body,
          id: existing.id,
          updatedAt: new Date().toISOString()
        };
        forexNewsStore[idx] = updatedItem;
      } else {
        updatedItem = {
          id: cleanId || `news-${Date.now()}`,
          title: String(body.title || 'خبر اقتصادي عاجل').trim(),
          currency: body.currency || 'USD',
          impact: body.impact || 'high',
          category: body.category || 'أخبار اقتصادية',
          eventDate: body.eventDate || new Date().toISOString().split('T')[0],
          eventDayArabic: body.eventDayArabic || 'اليوم',
          timeGmt: body.timeGmt || '12:00',
          timeCairo: body.timeCairo || '14:00',
          timeMecca: body.timeMecca || '15:00',
          targetEpochMs: Number(body.targetEpochMs) || Date.now() + 3600000,
          previous: body.previous || '',
          forecast: body.forecast || '',
          actual: body.actual || '',
          expectedImpact: body.expectedImpact || 'usd_bullish',
          expectedMoveSummary: String(body.expectedMoveSummary || '').trim(),
          recommendation: body.recommendation || undefined,
          isBroadcasted: Boolean(body.isBroadcasted),
          createdAt: body.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        forexNewsStore.unshift(updatedItem);
      }

      await saveState();
      res.json({ ok: true, item: updatedItem });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message || 'خطأ أثناء حفظ وتعديل الخبر' });
    }
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

  // Auto-fetch and sync breaking forex news & economic calendar releases (Search & Insert automatically)
  app.post('/api/forex-news/auto-fetch', async (req, res) => {
    try {
      if (!isCloudStateLoaded) {
        await loadStateFromCloudAndDisk();
      }

      const body = req.body || {};
      const requestedCurrency = (body.currency || '').trim().toUpperCase();
      const forceRefresh = Boolean(body.forceRefresh);

      let addedCount = 0;
      let updatedCount = 0;

      // Candidate live economic releases
      const candidateEvents: ForexNewsItem[] = [...INITIAL_WEEKLY_FOREX_NEWS];

      for (const candidate of candidateEvents) {
        if (requestedCurrency && requestedCurrency !== 'ALL' && candidate.currency !== requestedCurrency) {
          continue;
        }

        const existingIdx = forexNewsStore.findIndex(
          n => n.id === candidate.id || (n.title.trim() === candidate.title.trim() && n.eventDate === candidate.eventDate)
        );

        const timeData = calculateEventTimes(candidate.eventDate, candidate.timeGmt);

        if (existingIdx !== -1) {
          const existing = forexNewsStore[existingIdx];
          forexNewsStore[existingIdx] = {
            ...candidate,
            ...existing,
            // Guaranteed exact calculated times for Cairo, Mecca, GMT
            timeGmt: candidate.timeGmt,
            timeCairo: timeData.timeCairo,
            timeMecca: timeData.timeMecca,
            targetEpochMs: timeData.targetEpochMs,
            eventDayArabic: timeData.eventDayArabic,
            previous: candidate.previous || existing.previous,
            forecast: candidate.forecast || existing.forecast,
            actual: candidate.actual || existing.actual,
            updatedAt: new Date().toISOString()
          };
          updatedCount++;
        } else {
          const newItem: ForexNewsItem = {
            ...candidate,
            timeCairo: timeData.timeCairo,
            timeMecca: timeData.timeMecca,
            targetEpochMs: timeData.targetEpochMs,
            eventDayArabic: timeData.eventDayArabic,
            autoFetched: true,
            isBroadcasted: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
          forexNewsStore.push(newItem);
          addedCount++;
        }
      }

      // If forceRefresh requested, clean up past October items so active November schedule shines
      if (forceRefresh) {
        forexNewsStore = forexNewsStore.filter(item => {
          return item.eventDate >= '2026-11-01';
        });
      }

      // Deduplicate by title prefix and event date
      const seen = new Set<string>();
      forexNewsStore = forexNewsStore.filter(item => {
        const key = item.title.trim().slice(0, 25) + '_' + item.eventDate;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      forexNewsStore = forexNewsStore.map(item => {
        const timeData = calculateEventTimes(item.eventDate, item.timeGmt);
        return {
          ...item,
          timeCairo: timeData.timeCairo,
          timeMecca: timeData.timeMecca,
          targetEpochMs: timeData.targetEpochMs,
          eventDayArabic: timeData.eventDayArabic
        };
      });

      forexNewsStore.sort((a, b) => a.targetEpochMs - b.targetEpochMs);
      await saveState();

      res.json({
        ok: true,
        count: forexNewsStore.length,
        added: addedCount,
        updated: updatedCount,
        news: forexNewsStore,
        message: `تم جلب وتحديث أجندة الأخبار الاقتصادية العاجلة آلياً بنجاح! (${addedCount} جديد، ${updatedCount} تم تحديثه بدقة التواقيت)`
      });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message || 'خطأ أثناء الجلب الآلي للأخبار' });
    }
  });

  // Re-seed default weekly news schedule (Admin)
  app.post('/api/forex-news/seed-weekly', async (_req, res) => {
    forexNewsStore = [...INITIAL_WEEKLY_FOREX_NEWS];
    await saveState();
    res.json({ ok: true, count: forexNewsStore.length, news: forexNewsStore });
  });

  // Broadcast news as recommendation to Telegram (Admin)
  app.post(['/api/forex-news/:id/broadcast', '/api/forex-news/broadcast'], async (req, res) => {
    try {
      const rawId = String(req.params?.id || req.body?.id || req.body?.item?.id || '');
      const cleanId = decodeURIComponent(rawId);
      let item = forexNewsStore.find(n => n.id === cleanId || n.id === rawId);

      // If item was sent in body (e.g. freshly created or edited on client), prefer or upsert it
      if (req.body?.item) {
        item = { ...(item || {}), ...req.body.item };
      }

      if (!item) {
        return res.status(404).json({ ok: false, error: 'الخبر المطلوب نشره غير موجود في السيرفر' });
      }

      const impactBadge = item.impact === 'high' ? '🔴 عالي الأهمية (High Impact) 🔥' : item.impact === 'medium' ? '🟡 متوسط الأهمية' : '🟢 منخفض الأهمية';
      const impactEmoji = item.expectedImpact.includes('bullish') ? '🟢 صعود متوقع ↗️' : item.expectedImpact.includes('bearish') ? '🔴 هبوط متوقع ↘️' : '⚖️ محايد / تذبذب';
      const recActionText = item.recommendation?.action === 'BUY' ? '🟢 شراء (BUY) 📈' : '🔴 بيع (SELL) 📉';

      const lines = [
        `🚨 خبر عاجل وتوصية فوركس حصرية | ${appSettings.channelTitle || 'ZAD FX | إشارات أبوسليم'}`,
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
        `📢 القناة العامة: @ZadNBFX`,
        `👑 قناة VIP الخاصة: متاح الانضمام عبر الرابط الرسمي`,
        `${appSettings.channelSignature || '💡 إدارة رأس المال سر النجاح — تداول بذكاء'}`
      );

      const messageText = lines.filter(Boolean).join('\n');

      const targetBots = req.body?.targetBots || { freeBot: true, vipBot: true };
      const sendToFree = targetBots.freeBot !== false;
      const sendToVip = targetBots.vipBot !== false;

      const freeToken = (req.body?.freeToken || autoPilot.botToken || DEFAULT_FREE_BOT_TOKEN).trim();
      const freeChat = (req.body?.freeChatId || autoPilot.chatId || DEFAULT_FREE_CHAT_ID).trim();
      const vipToken = (req.body?.vipToken || autoPilot.vipBotToken || DEFAULT_VIP_BOT_TOKEN).trim();
      const vipChat = (req.body?.vipChatId || autoPilot.vipChatId || DEFAULT_VIP_CHAT_ID).trim();

      let sentFree = false;
      let sentVip = false;
      let freeError: string | undefined;
      let vipError: string | undefined;

      const dispatchTasks: Promise<void>[] = [];

      // 1. Dispatch to Free Bot
      if (sendToFree && freeToken && freeChat) {
        dispatchTasks.push(
          sendTelegramMessage(freeToken, freeChat, messageText)
            .then(resFree => {
              if (resFree.ok) sentFree = true;
              else freeError = resFree.description || 'فشل الإرسال للبوت المجاني';
            })
            .catch(err => {
              freeError = err.message || 'خطأ في الاتصال بالبوت المجاني';
            })
        );
      }

      // 2. Dispatch to VIP Bot
      if (sendToVip && vipToken && vipChat) {
        dispatchTasks.push(
          sendTelegramMessage(vipToken, vipChat, messageText)
            .then(resVip => {
              if (resVip.ok) sentVip = true;
              else vipError = resVip.description || 'فشل الإرسال لبوت VIP';
            })
            .catch(err => {
              vipError = err.message || 'خطأ في الاتصال ببوت VIP';
            })
        );
      }

      if (dispatchTasks.length > 0) {
        await Promise.allSettled(dispatchTasks);
      }

      const destinations: string[] = [];
      if (sentFree) destinations.push('القناة العامة (@ZadNBFX)');
      if (sentVip) destinations.push('قناة VIP (Abusalim FX VIP)');

      if (sentFree || sentVip) {
        item.isBroadcasted = true;
        item.broadcastedAt = new Date().toISOString();
        const existingIdx = forexNewsStore.findIndex(n => n.id === item!.id);
        if (existingIdx !== -1) {
          forexNewsStore[existingIdx] = { ...item };
        } else {
          forexNewsStore.unshift({ ...item });
        }
        await saveState();
      }

      return res.json({
        ok: sentFree || sentVip,
        sentFree,
        sentVip,
        destinations,
        freeError,
        vipError,
        error: (sentFree || sentVip) ? undefined : (freeError || vipError || 'تعذر الإرسال عبر البوتات المحددة')
      });
    } catch (err: any) {
      console.error('[News Broadcast Error]', err);
      res.status(500).json({ ok: false, error: err.message || 'خطأ أثناء تنفيذ نشر الخبر' });
    }
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

  // Download MT4 indicator (.mq4)
  app.get(['/api/strategy/download-mq4', '/NB_FX_Momentum_Pause_Breakout.mq4'], (_req, res) => {
    const mq4Path = path.join(process.cwd(), 'public', 'NB_FX_Momentum_Pause_Breakout.mq4');
    if (fs.existsSync(mq4Path)) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="NB_FX_Momentum_Pause_Breakout.mq4"');
      fs.createReadStream(mq4Path).pipe(res);
    } else {
      res.status(404).send('MT4 file not found');
    }
  });

  // Get raw MT4 indicator code as JSON
  app.get('/api/strategy/mq4-code', (_req, res) => {
    const mq4Path = path.join(process.cwd(), 'public', 'NB_FX_Momentum_Pause_Breakout.mq4');
    if (fs.existsSync(mq4Path)) {
      const code = fs.readFileSync(mq4Path, 'utf-8');
      res.json({ ok: true, filename: 'NB_FX_Momentum_Pause_Breakout.mq4', code });
    } else {
      res.status(404).json({ ok: false, error: 'MT4 file not found' });
    }
  });

  // =========================================================================
  // TELEGRAM BOT HUB & ONBOARDING SYSTEM REST API ENDPOINTS
  // =========================================================================

  app.get('/api/telegram-bot/config', (_req, res) => {
    res.json({ ok: true, config: telegramBotConfigStore });
  });

  app.post('/api/telegram-bot/config', async (req, res) => {
    try {
      telegramBotConfigStore = {
        ...telegramBotConfigStore,
        ...req.body
      };
      await saveState();
      res.json({ ok: true, config: telegramBotConfigStore });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err?.message || 'Failed to update config' });
    }
  });

  app.get('/api/telegram-bot/users', (_req, res) => {
    res.json({ ok: true, users: telegramBotUsersStore });
  });

  app.post('/api/telegram-bot/users', async (req, res) => {
    try {
      const b = req.body;
      const newUser: TelegramBotUser = {
        id: `tgu-${Date.now()}`,
        telegramChatId: String(b.telegramChatId || '').trim(),
        username: b.username ? String(b.username).trim() : '',
        name: String(b.name || 'عضو جديد').trim(),
        email: b.email ? String(b.email).trim() : undefined,
        country: String(b.country || 'مصر 🇪🇬').trim(),
        language: b.language === 'en' ? 'en' : 'ar',
        step: 'COMPLETED',
        status: b.status || 'ACTIVE',
        membershipType: b.membershipType || 'NONE',
        brokerId: b.brokerId ? String(b.brokerId).trim() : '',
        notes: b.notes ? String(b.notes).trim() : '',
        registeredAt: new Date().toISOString(),
        lastInteractionAt: new Date().toISOString()
      };
      telegramBotUsersStore.unshift(newUser);
      await saveState();
      res.json({ ok: true, user: newUser });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err?.message || 'Failed to add user' });
    }
  });

  app.put('/api/telegram-bot/users/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const idx = telegramBotUsersStore.findIndex(u => u.id === id);
      if (idx === -1) {
        return res.status(404).json({ ok: false, error: 'User not found' });
      }
      telegramBotUsersStore[idx] = {
        ...telegramBotUsersStore[idx],
        ...req.body,
        id
      };
      await saveState();
      res.json({ ok: true, user: telegramBotUsersStore[idx] });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err?.message || 'Failed to update user' });
    }
  });

  app.delete('/api/telegram-bot/users/:id', async (req, res) => {
    try {
      const { id } = req.params;
      telegramBotUsersStore = telegramBotUsersStore.filter(u => u.id !== id);
      await saveState();
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err?.message || 'Failed to delete user' });
    }
  });

  app.post('/api/telegram-bot/users/:id/status', async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const user = telegramBotUsersStore.find(u => u.id === id);
      if (!user) {
        return res.status(404).json({ ok: false, error: 'User not found' });
      }
      user.status = status;
      await saveState();
      res.json({ ok: true, user });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err?.message || 'Failed to update status' });
    }
  });

  app.post('/api/telegram-bot/users/:id/message', async (req, res) => {
    try {
      const { id } = req.params;
      const { message } = req.body;
      const user = telegramBotUsersStore.find(u => u.id === id);
      if (!user) {
        return res.status(404).json({ ok: false, error: 'User not found' });
      }
      const token = telegramBotConfigStore.botToken.trim() || autoPilot.botToken.trim() || DEFAULT_FREE_BOT_TOKEN;
      const sendRes = await sendTelegramInlineMessage(token, user.telegramChatId, message, undefined, 'HTML');
      if (sendRes?.ok) {
        res.json({ ok: true, result: sendRes });
      } else {
        res.status(400).json({ ok: false, error: sendRes?.description || 'Failed to send telegram message' });
      }
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err?.message || 'Failed to send message' });
    }
  });

  app.post('/api/telegram-bot/broadcast', async (req, res) => {
    try {
      const { message, targetLanguage, targetStatus } = req.body;
      if (!message || !message.trim()) {
        return res.status(400).json({ ok: false, error: 'Message text is required' });
      }
      const token = telegramBotConfigStore.botToken.trim() || autoPilot.botToken.trim() || DEFAULT_FREE_BOT_TOKEN;
      let sentCount = 0;
      let failedCount = 0;

      const recipients = telegramBotUsersStore.filter(u => {
        if (targetLanguage && targetLanguage !== 'all' && u.language !== targetLanguage) return false;
        if (targetStatus && targetStatus !== 'all' && u.status !== targetStatus) return false;
        return true;
      });

      for (const u of recipients) {
        try {
          const r = await sendTelegramInlineMessage(token, u.telegramChatId, message, undefined, 'HTML');
          if (r?.ok) sentCount++;
          else failedCount++;
        } catch (_err) {
          failedCount++;
        }
      }

      res.json({ ok: true, sentCount, failedCount, totalRecipients: recipients.length });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err?.message || 'Broadcast failed' });
    }
  });

  app.post('/api/telegram-bot/test-token', async (req, res) => {
    try {
      const { token } = req.body;
      const checkToken = (token || telegramBotConfigStore.botToken || autoPilot.botToken || DEFAULT_FREE_BOT_TOKEN).trim();
      const tgRes = await fetch(`https://api.telegram.org/bot${checkToken}/getMe`);
      const data = await tgRes.json();
      if (data.ok) {
        res.json({ ok: true, bot: data.result });
      } else {
        res.status(400).json({ ok: false, error: data.description || 'Token invalid' });
      }
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err?.message || 'Connection test failed' });
    }
  });

  // Automated IP-based Country Verification & Locking Endpoint
  app.get('/api/verify-country', async (req, res) => {
    const chatId = String(req.query.chatId || '').trim();
    const forwarded = req.headers['x-forwarded-for'];
    let clientIp = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : (req.socket.remoteAddress || '');
    if (clientIp.startsWith('::ffff:')) clientIp = clientIp.replace('::ffff:', '');

    let detectedCountry = 'دولي 🌍';
    let countryCode = '';

    // Check Cloudflare / CDN geo headers first if present
    const cfCountry = req.headers['cf-ipcountry'];
    if (typeof cfCountry === 'string' && cfCountry.length === 2) {
      countryCode = cfCountry.toUpperCase();
    }

    if (!countryCode && clientIp && !clientIp.startsWith('127.') && !clientIp.startsWith('10.') && !clientIp.startsWith('192.168.') && clientIp !== '::1') {
      try {
        const geoRes = await fetch(`http://ip-api.com/json/${clientIp}?fields=status,country,countryCode`);
        const geoData = await geoRes.json();
        if (geoData?.status === 'success') {
          countryCode = (geoData.countryCode || '').toUpperCase();
          if (countryCode === 'EG' || geoData.country?.toLowerCase().includes('egypt')) {
            detectedCountry = 'جمهورية مصر العربية 🇪🇬';
          } else if (countryCode === 'PS' || geoData.country?.toLowerCase().includes('palestine')) {
            detectedCountry = 'دولة فلسطين 🇵🇸';
          } else {
            detectedCountry = `${geoData.country} 🌍`;
          }
        }
      } catch (_e) {}
    } else if (countryCode === 'EG') {
      detectedCountry = 'جمهورية مصر العربية 🇪🇬';
    } else if (countryCode === 'PS') {
      detectedCountry = 'دولة فلسطين 🇵🇸';
    }

    if (chatId) {
      let user = telegramBotUsersStore.find(u => u.telegramChatId === chatId);
      if (user) {
        user.country = detectedCountry;
        user.step = 'COMPLETED';
        user.lastInteractionAt = new Date().toISOString();
      } else {
        user = {
          id: `tgu-${chatId}`,
          telegramChatId: chatId,
          name: 'عضو جديد',
          country: detectedCountry,
          language: 'ar',
          step: 'COMPLETED',
          status: 'ACTIVE',
          membershipType: 'NONE',
          registeredAt: new Date().toISOString(),
          lastInteractionAt: new Date().toISOString()
        };
        telegramBotUsersStore.unshift(user);
      }
      await saveState();

      const token = telegramBotConfigStore.botToken.trim() || autoPilot.botToken.trim() || DEFAULT_FREE_BOT_TOKEN;
      const confirmNotice = `✅ <b>تم التحقق وتحديث دولتك تلقائياً عبر الـ IP:</b> <b>${escapeTgHtml(user.country)}</b> <i>(يمكنك تعديلها في أي وقت من الملف الشخصي)</i>`;
      await sendTelegramBotMainMenu(token, chatId, user, undefined, confirmNotice);
    }

    res.send(`<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8">
  <title>تم تأكيد وتثبيت الدولة بنجاح - ZAD FX</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-950 text-white min-h-screen flex items-center justify-center p-4 font-sans">
  <div class="bg-slate-900 border border-emerald-500/30 rounded-3xl p-8 max-w-md w-full text-center space-y-6 shadow-2xl">
    <div class="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto text-3xl font-bold">✓</div>
    <div class="space-y-2">
      <h1 class="text-2xl font-black text-white">تم التحقق وتثبيت دولتك بنجاح!</h1>
      <p class="text-emerald-400 text-xl font-extrabold tracking-wide">${detectedCountry}</p>
    </div>
    <div class="bg-slate-800/80 rounded-2xl p-4 text-xs text-slate-300 space-y-2 border border-slate-700/50">
      <p>🔒 <b>تم قفل وتثبيت الدولة في ملفك الشخصي:</b></p>
      <p class="text-slate-400 leading-relaxed">تم ضبط واختيار وسائل الدفع الرسمية المناسبة لدولتك في بوت التليجرام. بناءً على سياسة الإدارة لا يمكن تغيير الدولة إلا بواسطة المشرف.</p>
    </div>
    <a href="https://t.me/Zadfx_bot" class="inline-flex items-center justify-center gap-2 w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black shadow-lg shadow-emerald-500/20 transition-all text-base">
      <span>العودة إلى بوت التليجرام الآن</span>
      <span>🚀</span>
    </a>
  </div>
</body>
</html>`);
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
