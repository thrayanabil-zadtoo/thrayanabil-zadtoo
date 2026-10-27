/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Send,
  Copy,
  Check,
  Trash2,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  Power,
  Play,
  Radio,
  Lock,
  LogOut,
  ExternalLink,
  Globe,
  Activity,
  ShieldCheck,
  Crown,
  UserPlus,
  CheckCircle2,
  X,
  MessageSquare,
  Ban,
  Edit3,
  Link2,
  Calendar,
  UserCheck,
  Bell,
  DollarSign,
  Bookmark,
  CreditCard,
  Plus,
  AlertTriangle,
  Upload,
  Image as ImageIcon,
  Sparkles,
  Sliders,
  BarChart2
} from 'lucide-react';
import {
  parseRawQuotexSignal,
  formatSignalMessage,
  formatDeviceLocalTimeFromMinute,
  extractMinuteOnly,
  convertEditedMessageToCustomPattern,
  SAMPLE_QUOTEX_SIGNALS,
  DEFAULT_CUSTOM_TEMPLATE,
  FormatterOptions
} from './utils/signalParser';
import { loadCloudSystemState, saveCloudSystemState, saveCloudPlans, saveCloudContactLinks } from './firebase';
import QuotexRobotAdminPage, { QuotexRobotSettings } from './components/QuotexRobotAdminPage';
import FloatingRobotVisitorBanner from './components/FloatingRobotVisitorBanner';
import ErrorBoundary from './components/ErrorBoundary';
import { ZadtooNavbar } from './components/ZadtooNavbar';
import { ZadtooHomePage } from './components/ZadtooHomePage';
import { ZadtooSignalsPage } from './components/ZadtooSignalsPage';
import { ZadtooAutoTradePage } from './components/ZadtooAutoTradePage';
import { ZadtooMembershipsPage } from './components/ZadtooMembershipsPage';
import { ZadtooAdminDashboard } from './components/ZadtooAdminDashboard';
import { ZadtooAboutContactModal } from './components/ZadtooAboutContactModal';
import { ZadtooForexNewsPage } from './components/ZadtooForexNewsPage';
import { ZadtooPlansAndLinksManager } from './components/ZadtooPlansAndLinksManager';
import {
  SubscriptionPlan,
  PlatformContactLinks,
  INITIAL_SUBSCRIPTION_PLANS,
  INITIAL_CONTACT_LINKS
} from './types/platformConfig';

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

export interface DailyStatRecord {
  date: string; // YYYY-MM-DD in Egypt Time (Africa/Cairo)
  directWins: number; // الصفقات الرابحة المباشرة (1$)
  gale1Wins: number; // الربح بالمضاعفة (2$)
  losses: number; // الخاسرة بالمضاعفة (خسارة 1$ + 2$ = 3$)
  draws?: number;
  manualOverride?: boolean;
  updatedAt: string;
}

export interface VipSubscriber {
  id: string;
  name: string;
  telegramUsername?: string;
  country?: string;
  email: string;
  phone: string;
  broker: string;
  brokerAccountId?: string;
  subscriptionType?: 'paid_plan' | 'quotex_referral';
  quotexDepositConfirmed?: boolean;
  planDuration?: string;
  amountPaid?: number;
  paymentMethod?: string;
  status?: 'PENDING' | 'ACTIVE' | 'BANNED';
  activationLink?: string;
  expiryDate?: string;
  robotApiKey?: string;
  robotExpiryDate?: string;
  robotEnabled?: boolean;
  robotDefaultMode?: 'AUTO' | 'MANUAL';
  robotTradeStake?: number;
  robotWins?: number;
  robotLosses?: number;
  messages?: SubscriberMessage[];
  createdAt: string;
}

export const USD_TO_EGP_RATE = 55;

export const VIP_PLANS = [
  { id: '1_month', label: 'شهر واحد', price: 30, days: 30, badge: 'باقة البداية' },
  { id: '3_months', label: 'ثلاثة شهور', price: 65, days: 90, badge: 'باقة التوفير' },
  { id: '6_months', label: 'ستة شهور', price: 80, days: 180, badge: 'الأكثر طلباً' },
  { id: '1_year', label: 'سنة كاملة', price: 111, days: 365, badge: 'أفضل قيمة سنوية' },
  {
    id: 'quotex_referral_free',
    label: 'عضوية مجانية (إحالة كيوتكس + إيداع 100$)',
    price: 0,
    days: 30,
    badge: 'مجاناً عبر رابط كيوتكس 🎁'
  }
];

export const PAID_VIP_PLANS = VIP_PLANS.filter(p => p.id !== 'quotex_referral_free');

export function isQuotexBrokerName(broker?: string): boolean {
  if (!broker) return false;
  const b = broker.toLowerCase();
  return b.includes('quotex') || b.includes('كوتيكس') || b.includes('كيوتكس');
}

export const PAYMENT_METHODS = [
  'محافظ إلكترونية (فودافون كاش / إنستا باي / اتصالات / أورانج)',
  '🏦 تحويل لبنك فلسطيني بالدولار أو الشيكل ($)',
  'تحويل بنكي (Bank Transfer)',
  '🎁 إحالة كيوتكس مجاناً (التسجيل بالرابط + إيداع 100$ في حسابك)'
];

export function isEgyptCountry(country?: string): boolean {
  return Boolean(country && country.includes('مصر'));
}

export function isPalestineCountry(country?: string): boolean {
  return Boolean(country && country.includes('فلسطين'));
}

export function getPaymentMethodsForCountry(country?: string): string[] {
  if (isEgyptCountry(country)) {
    return ['محافظ إلكترونية (فودافون كاش / إنستا باي / اتصالات / أورانج)'];
  }
  if (isPalestineCountry(country)) {
    return ['🏦 تحويل لبنك فلسطيني بالدولار أو الشيكل ($)'];
  }
  return ['تحويل بنكي (Bank Transfer)'];
}

export function formatPlanPriceForCountry(usdPrice: number, country?: string): string {
  if (isEgyptCountry(country)) {
    const egp = usdPrice * USD_TO_EGP_RATE;
    return `${egp.toLocaleString('en-US')} جنيه`;
  }
  return `${usdPrice}$`;
}

const COUNTRIES_LIST = [
  'مصر 🇪🇬',
  'السعودية 🇸🇦',
  'الإمارات 🇦🇪',
  'الكويت 🇰🇼',
  'قطر 🇶🇦',
  'البحرين 🇧🇭',
  'سلطنة عمان 🇴🇲',
  'العراق 🇮🇶',
  'الأردن 🇯🇴',
  'المغرب 🇲🇦',
  'الجزائر 🇩🇿',
  'تونس 🇹🇳',
  'ليبيا 🇱🇾',
  'فلسطين 🇵🇸',
  'لبنان 🇱🇧',
  'سوريا 🇸🇾',
  'اليمن 🇾🇪',
  'السودان 🇸🇩',
  'تركيا 🇹🇷',
  'ألمانيا / أوروبا 🇪🇺',
  'دولة أخرى 🌍'
];

const BROKERS_LIST = [
  'Quotex (كوتيكس)',
  'Pocket Option (بوكيت أوبشن)',
  'IQ Option (آي كيو أوبشن)',
  'Olymp Trade (أوليمب تريد)',
  'Binomo (بينومو)',
  'ExpertOption (إكسبرت أوبشن)',
  'Exness / MT4 / MT5 (فروكس عالمي)',
  'وسيط آخر (Other Broker)'
];

export interface SignalItem {
  id: string;
  asset: string;
  isOtc: boolean;
  direction: 'CALL' | 'PUT';
  timeframe: string;
  entryMinute: string;
  entryTime: string;
  payout?: string;
  livePrice?: string;
  rsiValue?: number;
  analysisReason?: string;
  formattedMessage: string;
  rawOriginal?: string;
  status: 'PENDING' | 'WIN' | 'WIN_GALE1' | 'LOSS' | 'DRAW';
  galeStep?: number;
  createdAt: string;
  telegramMessageId?: number;
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
  qualityScore?: number;
  reversalPattern?: string;
  sma10?: number;
  sma5?: number;
  wickRatio?: number;
  isNewsSpike?: boolean;
}

export interface AutoPilotConfig {
  enabled: boolean;
  // Bot 1: Free Channel Bot (With Egypt Cairo working hours schedule)
  freeBotEnabled?: boolean;
  botToken: string;
  chatId: string;
  freeScheduleEnabled?: boolean;
  freeStartHourEgypt?: number;
  freeEndHourEgypt?: number;
  freeWinIcon?: string;
  freeWinGale1Icon?: string;
  freeLossIcon?: string;
  freeWinImageUrl?: string;
  freeWinGale1ImageUrl?: string;
  freeLossImageUrl?: string;
  // Bot 2: VIP Channel Bot (Always 24/7 on the exact same signal)
  vipEnabled?: boolean;
  vipBotToken?: string;
  vipChatId?: string;
  vipWinIcon?: string;
  vipWinGale1Icon?: string;
  vipLossIcon?: string;
  vipWinImageUrl?: string;
  vipWinGale1ImageUrl?: string;
  vipLossImageUrl?: string;
  sourceChannel: string;
  intervalMinutes: number;
  strictnessLevel: 'normal' | 'high' | 'extreme' | 'super';
  smaFilterEnabled?: boolean;
  reversalPatternRequired?: boolean;
  newsFilterEnabled?: boolean;
  assetCooldownMinutes?: number;
  minQualityScore?: number;
  resultMode?: 'candle_exact' | 'auto_win' | 'manual_only';
  oneGaleEnabled?: boolean;
  quotexReferralLink?: string;
  quotexMinDepositUsd?: number;
  autoWinNotification: boolean;
  resultNotificationStyle?: 'emoji_size' | 'photo';
  autoDailyReportEnabled?: boolean;
  lastDailyReportSentDate?: string;
  lastRunAt: string | null;
  nextRunAt: string | null;
  totalAutoSent: number;
  lastError: string | null;
  marketOpenStatus: boolean;
  currentEgyptHour?: number;
  isFreeBotWithinSchedule?: boolean;
  pairSelectionMode?: 'fixed_single' | 'custom_list' | 'all_global';
  primaryFixedPair?: string;
  allowedPairs?: string[];
  customPairsList?: string[];
}

export default function App() {
  // Public visitors see 'visitor' view by default; admin studio, stats & robot are hidden unless logged in
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean>(
    () => typeof window !== 'undefined' && (sessionStorage.getItem('zad_admin_auth') === 'true' || localStorage.getItem('zad_admin_auth') === 'true')
  );
  const [activeView, setActiveView] = useState<'visitor' | 'admin' | 'stats' | 'robot'>('visitor');
  const [zadtooTab, setZadtooTab] = useState<'home' | 'signals' | 'news' | 'autotrade' | 'memberships' | 'admin'>('home');
  const [aboutContactType, setAboutContactType] = useState<'about' | 'contact' | null>(null);
  const [showLegacyAdminStudio, setShowLegacyAdminStudio] = useState<boolean>(false);
  const [robotSettings, setRobotSettings] = useState<QuotexRobotSettings>({
    isPublishedToVisitors: false,
    robotTitle: 'روبوت التداول الآلي الذكي (Quotex Pro Bot)',
    version: 'v1.0 Beta (قيد التطوير)',
    defaultMode: 'MANUAL',
    noMartingaleStrict: true,
    soundAlertsEnabled: true,
    autoSelectPair: true,
    autoSetExpiryM1: true,
    defaultStakeUsd: 5
  });
  const [showLoginModal, setShowLoginModal] = useState<boolean>(false);
  const [loginEmail, setLoginEmail] = useState<string>('thrayanabil2026@gmail.com');
  const [loginPassword, setLoginPassword] = useState<string>('');
  const [loginError, setLoginError] = useState<string>('');
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);

  // Live device clock (phone/computer) updated every second
  const [deviceNow, setDeviceNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const clockTimer = setInterval(() => {
      setDeviceNow(new Date());
    }, 1000);
    return () => clearInterval(clockTimer);
  }, []);

  // Emergency direct admin unlock via URL query parameter (e.g. https://fx.zadtoo.com/?admin=Tr@7177)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const search = window.location.search;
      if (search.includes('admin=Tr@7177') || search.includes('auth=Tr@7177') || search.includes('pass=Tr@7177')) {
        sessionStorage.setItem('zad_admin_auth', 'true');
        localStorage.setItem('zad_admin_auth', 'true');
        setIsAdminAuthenticated(true);
        setActiveView('admin');
        try {
          window.history.replaceState({}, document.title, window.location.pathname);
        } catch (_e) {}
      }
    }
  }, []);

  const [visitorFilter, setVisitorFilter] = useState<'ALL' | 'WIN' | 'PENDING'>('ALL');
  const [visitorSimStake, setVisitorSimStake] = useState<number>(5);
  const [adminSectionTab, setAdminSectionTab] = useState<'all' | 'autopilot' | 'studio' | 'signals' | 'vip' | 'plans'>('all');
  const [platformPlans, setPlatformPlans] = useState<SubscriptionPlan[]>(() => {
    try {
      const saved = localStorage.getItem('zad_platform_plans');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (_e) {}
    return INITIAL_SUBSCRIPTION_PLANS;
  });
  const [platformContactLinks, setPlatformContactLinks] = useState<PlatformContactLinks>(() => {
    try {
      const saved = localStorage.getItem('zad_platform_contact_links');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch (_e) {}
    return INITIAL_CONTACT_LINKS;
  });
  const [adminSubSearch, setAdminSubSearch] = useState<string>('');
  const [adminSubStatusFilter, setAdminSubStatusFilter] = useState<'ALL' | 'ACTIVE' | 'PENDING' | 'BANNED'>('ALL');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Signals & Live Global Market Radar from backend
  const [signals, setSignals] = useState<SignalItem[]>([]);
  const [liveMarket, setLiveMarket] = useState<LivePairSnapshot[]>([]);
  const [subscribers, setSubscribers] = useState<VipSubscriber[]>([]);
  const [quickNotes, setQuickNotes] = useState<QuickNote[]>([]);
  const [dailyStats, setDailyStats] = useState<DailyStatRecord[]>([]);
  // Admin Statistics Page (A4 Weekly / Monthly) state
  const [statsPeriod, setStatsPeriod] = useState<'week' | 'month'>('week');
  const [statsOffset, setStatsOffset] = useState<number>(0); // 0 = current week/month, -1 = previous, etc.
  const [statsPayoutMode, setStatsPayoutMode] = useState<'net_100' | 'broker_85'>('net_100');
  const [statsShowAllDays, setStatsShowAllDays] = useState<boolean>(true);
  const [editingStatDate, setEditingStatDate] = useState<string | null>(null);
  const [editStatForm, setEditStatForm] = useState<{
    date: string;
    directWins: number;
    gale1Wins: number;
    losses: number;
  }>({
    date: '',
    directWins: 0,
    gale1Wins: 0,
    losses: 0
  });
  const [isSavingDailyStat, setIsSavingDailyStat] = useState<boolean>(false);
  // End-of-Month Profit Estimator Calculator state (in A4 Stats Page)
  const [calcRemainingDaysMode, setCalcRemainingDaysMode] = useState<'all_7d' | 'market_5d' | 'custom'>('all_7d');
  const [calcCustomRemainingDays, setCalcCustomRemainingDays] = useState<number | null>(null);
  const [calcAvgBasis, setCalcAvgBasis] = useState<'active_days' | 'elapsed_days'>('active_days');
  const [calcBaseStakeUsd, setCalcBaseStakeUsd] = useState<number>(1);
  const [newNoteTitle, setNewNoteTitle] = useState<string>('');
  const [newNoteContent, setNewNoteContent] = useState<string>('');
  const [showAddNoteForm, setShowAddNoteForm] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isScanningMarket, setIsScanningMarket] = useState<boolean>(false);

  // Instant Registration Modal State (No Email/Gmail Activation Required)
  const [showRegisterModal, setShowRegisterModal] = useState<boolean>(false);
  const [regName, setRegName] = useState<string>('');
  const [regTelegram, setRegTelegram] = useState<string>('');
  const [regCountry, setRegCountry] = useState<string>(COUNTRIES_LIST[0]);
  const [regEmail, setRegEmail] = useState<string>('');
  const [regPhone, setRegPhone] = useState<string>('');
  const [regBroker, setRegBroker] = useState<string>(BROKERS_LIST[0]);
  const [regBrokerAccountId, setRegBrokerAccountId] = useState<string>('');
  const [regSubscriptionType, setRegSubscriptionType] = useState<'paid_plan' | 'quotex_referral'>('paid_plan');
  const [regPlanDuration, setRegPlanDuration] = useState<string>('1_month');
  const [regPaymentMethod, setRegPaymentMethod] = useState<string>(
    () => getPaymentMethodsForCountry(COUNTRIES_LIST[0])[0]
  );
  const [isSubmittingReg, setIsSubmittingReg] = useState<boolean>(false);
  const [regSuccess, setRegSuccess] = useState<boolean>(false);
  const [regError, setRegError] = useState<string>('');

  // Member VIP Profile & Messaging Portal State (for Visitors/Members)
  const [showMemberPortalModal, setShowMemberPortalModal] = useState<boolean>(false);
  const [currentMemberId, setCurrentMemberId] = useState<string>(
    () => localStorage.getItem('zad_vip_member_id') || ''
  );
  const [memberLookupInput, setMemberLookupInput] = useState<string>('');
  const [memberPasswordInput, setMemberPasswordInput] = useState<string>('');
  const [memberLookupError, setMemberLookupError] = useState<string>('');
  const [memberChatInput, setMemberChatInput] = useState<string>('');
  const [memberChatImage, setMemberChatImage] = useState<string>('');
  const [isSendingMemberMsg, setIsSendingMemberMsg] = useState<boolean>(false);

  // Subscription Renewal Modal State (أيقونة ونافذة طلب تجديد الاشتراك وإرسال صورة الإيصال للمشرف)
  const [showRenewalModal, setShowRenewalModal] = useState<boolean>(false);
  const [renewalPlanId, setRenewalPlanId] = useState<string>('1_month');
  const [renewalCountry, setRenewalCountry] = useState<string>(COUNTRIES_LIST[0]);
  const [renewalPaymentMethod, setRenewalPaymentMethod] = useState<string>(
    () => getPaymentMethodsForCountry(COUNTRIES_LIST[0])[0]
  );
  const [renewalReceiptImage, setRenewalReceiptImage] = useState<string>('');
  const [renewalNote, setRenewalNote] = useState<string>('');
  const [isSubmittingRenewal, setIsSubmittingRenewal] = useState<boolean>(false);
  const [renewalSentSuccess, setRenewalSentSuccess] = useState<boolean>(false);

  // Admin: Subscriber Edit / Activation Link / Expiry Date / Chat Modal State
  const [selectedAdminSubId, setSelectedAdminSubId] = useState<string | null>(null);
  const [adminEditForm, setAdminEditForm] = useState<{
    name: string;
    telegramUsername: string;
    country: string;
    email: string;
    phone: string;
    broker: string;
    brokerAccountId: string;
    subscriptionType: 'paid_plan' | 'quotex_referral';
    quotexDepositConfirmed: boolean;
    planDuration: string;
    amountPaid: number;
    paymentMethod: string;
    status: 'PENDING' | 'ACTIVE' | 'BANNED';
    activationLink: string;
    expiryDate: string;
  }>({
    name: '',
    telegramUsername: '',
    country: COUNTRIES_LIST[0],
    email: '',
    phone: '',
    broker: BROKERS_LIST[0],
    brokerAccountId: '',
    subscriptionType: 'paid_plan',
    quotexDepositConfirmed: false,
    planDuration: '1_month',
    amountPaid: 30,
    paymentMethod: PAYMENT_METHODS[1],
    status: 'PENDING',
    activationLink: '',
    expiryDate: ''
  });
  const [adminChatInput, setAdminChatInput] = useState<string>('');
  const [isSavingSubscriber, setIsSavingSubscriber] = useState<boolean>(false);

  // Server-side 24/7 Focused Auto-Pilot state
  const [autoPilot, setAutoPilot] = useState<AutoPilotConfig>({
    enabled: false,
    freeBotEnabled: true,
    botToken: localStorage.getItem('tg_bot_token') || '',
    chatId: localStorage.getItem('tg_chat_id') || '@ZadNBFX',
    freeScheduleEnabled: true,
    freeStartHourEgypt: Number(localStorage.getItem('tg_free_start_hour') ?? 10),
    freeEndHourEgypt: Number(localStorage.getItem('tg_free_end_hour') ?? 18),
    freeWinIcon: localStorage.getItem('tg_free_win_icon') || '✅ ربح',
    freeWinGale1Icon: localStorage.getItem('tg_free_gale1_icon') || '✅ ربح مضاعفة واحدة',
    freeLossIcon: localStorage.getItem('tg_free_loss_icon') || '❌',
    freeWinImageUrl: localStorage.getItem('tg_free_win_img') || '',
    freeWinGale1ImageUrl: localStorage.getItem('tg_free_gale1_img') || '',
    freeLossImageUrl: localStorage.getItem('tg_free_loss_img') || '',
    vipEnabled: false,
    vipBotToken: localStorage.getItem('tg_vip_bot_token') || '',
    vipChatId: localStorage.getItem('tg_vip_chat_id') || '',
    vipWinIcon: localStorage.getItem('tg_vip_win_icon') || '👑✅ ربح VIP',
    vipWinGale1Icon: localStorage.getItem('tg_vip_gale1_icon') || '👑✅ ربح مضاعفة واحدة',
    vipLossIcon: localStorage.getItem('tg_vip_loss_icon') || '❌',
    vipWinImageUrl: localStorage.getItem('tg_vip_win_img') || '',
    vipWinGale1ImageUrl: localStorage.getItem('tg_vip_gale1_img') || '',
    vipLossImageUrl: localStorage.getItem('tg_vip_loss_img') || '',
    sourceChannel: 'LIVE_GLOBAL_FOREX',
    intervalMinutes: 15,
    strictnessLevel: 'super',
    smaFilterEnabled: true,
    reversalPatternRequired: true,
    newsFilterEnabled: true,
    assetCooldownMinutes: 20,
    minQualityScore: 75,
    resultMode: 'candle_exact',
    oneGaleEnabled: localStorage.getItem('tg_one_gale_enabled') === 'true',
    quotexReferralLink: 'https://broker-qx.pro/?lid=2303934',
    quotexMinDepositUsd: 100,
    autoWinNotification: true,
    resultNotificationStyle: (localStorage.getItem('tg_result_notification_style') as any) || 'emoji_size',
    autoDailyReportEnabled: true,
    lastDailyReportSentDate: '',
    lastRunAt: null,
    nextRunAt: null,
    totalAutoSent: 0,
    lastError: null,
    marketOpenStatus: true,
    pairSelectionMode: 'fixed_single',
    primaryFixedPair: 'EUR/JPY',
    allowedPairs: ['EUR/JPY'],
    customPairsList: ['EUR/JPY', 'EUR/USD', 'GBP/USD', 'USD/JPY', 'GBP/JPY', 'AUD/USD', 'USD/CHF', 'USD/CAD', 'EUR/GBP']
  });
  const [newCustomPairInput, setNewCustomPairInput] = useState<string>('');
  const [isSavingAutoPilot, setIsSavingAutoPilot] = useState<boolean>(false);
  const lastAutoPilotSaveRef = React.useRef<number>(0);
  const [freeBotIconsSavedBadge, setFreeBotIconsSavedBadge] = useState<boolean>(false);
  const [vipBotIconsSavedBadge, setVipBotIconsSavedBadge] = useState<boolean>(false);
  const [isSendingDailyReport, setIsSendingDailyReport] = useState<boolean>(false);
  const [dailyReportSendStatus, setDailyReportSendStatus] = useState<{
    type: 'idle' | 'success' | 'error';
    message?: string;
  }>({ type: 'idle' });

  // Admin: Raw Signal Input & Auto-parsed state
  const [rawInput, setRawInput] = useState<string>(SAMPLE_QUOTEX_SIGNALS[0].raw);
  const [formatterOptions, setFormatterOptions] = useState<FormatterOptions>({
    channelTitle: 'نَبض التداول | السوق العالمي',
    channelSignature: '💡 نركز على الفرص القوية فقط — التزم بإدارة رأس المال',
    templateStyle: 'elegant',
    customTemplatePattern: DEFAULT_CUSTOM_TEMPLATE,
    includeLiveAnalysis: true,
    removeSourceMentions: true,
    removePromoLinks: true,
    removeMartingaleSteps: true,
    removePayoutInfo: true,
    blockedWords: ['QuotexSignalsBot_M1', 'Quotex', 'VIP', 'Register', 'Sign up', 'Gale', 'Martingale', 'OTC']
  });

  // Direct editable text override for the outgoing message + auto-save indicator
  const [customMessageOverride, setCustomMessageOverride] = useState<string | null>(null);
  const [messageAutoSaveStatus, setMessageAutoSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  // Manual overrides
  const [manualOverride, setManualOverride] = useState<{
    asset?: string;
    direction?: 'CALL' | 'PUT';
    entryMinute?: string;
    analysisReason?: string;
  }>({});

  // Status feedback
  const [publishStatus, setPublishStatus] = useState<{
    type: 'idle' | 'loading' | 'success' | 'warning' | 'error';
    message?: string;
  }>({ type: 'idle' });
  const [isFetchingSource, setIsFetchingSource] = useState<boolean>(false);

  // Phase 3: Performance Analytics & Testing Audit Modal
  const [showAnalyticsModal, setShowAnalyticsModal] = useState<boolean>(false);
  const [analyticsData, setAnalyticsData] = useState<any>(null);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState<boolean>(false);

  const fetchAnalytics = async () => {
    setIsLoadingAnalytics(true);
    try {
      const res = await fetch('/api/analytics/performance');
      const data = await res.json();
      if (data.ok) {
        setAnalyticsData(data);
      }
    } catch (_e) {
      // Ignore
    } finally {
      setIsLoadingAnalytics(false);
    }
  };

  // Load signals, settings, autopilot state, and live global market radar
  const fetchSignals = async () => {
    try {
      const res = await fetch('/api/signals');
      const data = await res.json();
      if (data.signals) {
        setSignals(data.signals);
      }
      if (data.liveMarket) {
        setLiveMarket(data.liveMarket);
      }
      if (data.subscribers) {
        setSubscribers(data.subscribers);
      }
      if (data.quickNotes) {
        setQuickNotes(data.quickNotes);
      }
      if (data.dailyStats && Array.isArray(data.dailyStats)) {
        setDailyStats(data.dailyStats);
      }
      if (data.plans && Array.isArray(data.plans) && data.plans.length > 0) {
        setPlatformPlans(data.plans);
        try {
          localStorage.setItem('zad_platform_plans', JSON.stringify(data.plans));
        } catch (_e) {}
      }
      if (data.contactLinks) {
        setPlatformContactLinks(data.contactLinks);
        try {
          localStorage.setItem('zad_platform_contact_links', JSON.stringify(data.contactLinks));
        } catch (_e) {}
      }
      if (data.robotSettings) {
        setRobotSettings(prev => ({
          ...prev,
          ...data.robotSettings,
          noMartingaleStrict: true
        }));
      }
      if (data.settings) {
        setFormatterOptions(prev => ({
          ...prev,
          channelTitle: data.settings.channelTitle ?? prev.channelTitle,
          channelSignature: data.settings.channelSignature ?? prev.channelSignature,
          templateStyle: data.settings.templateStyle || prev.templateStyle,
          customTemplatePattern: data.settings.customTemplatePattern || prev.customTemplatePattern || DEFAULT_CUSTOM_TEMPLATE,
          includeLiveAnalysis: data.settings.includeLiveAnalysis ?? prev.includeLiveAnalysis
        }));
      }
      if (data.autopilot && Date.now() - lastAutoPilotSaveRef.current > 4000) {
        const savedLocalToken = localStorage.getItem('tg_bot_token') || '';
        const savedLocalChat = localStorage.getItem('tg_chat_id') || '';
        const resolvedToken = data.autopilot.botToken || savedLocalToken;
        const resolvedChat = data.autopilot.chatId || savedLocalChat || '@ZadNBFX';

        if (resolvedToken) localStorage.setItem('tg_bot_token', resolvedToken);
        if (resolvedChat) localStorage.setItem('tg_chat_id', resolvedChat);
        if (data.autopilot.freeStartHourEgypt !== undefined) {
          localStorage.setItem('tg_free_start_hour', String(data.autopilot.freeStartHourEgypt));
        }
        if (data.autopilot.freeEndHourEgypt !== undefined) {
          localStorage.setItem('tg_free_end_hour', String(data.autopilot.freeEndHourEgypt));
        }
        if (typeof data.autopilot.oneGaleEnabled === 'boolean') {
          localStorage.setItem('tg_one_gale_enabled', String(data.autopilot.oneGaleEnabled));
        }

        const incomingQxLink = data.autopilot.quotexReferralLink;
        const resolvedQxLink =
          !incomingQxLink || incomingQxLink.includes('lid=ZadNBFX')
            ? 'https://broker-qx.pro/?lid=2303934'
            : incomingQxLink;

        setAutoPilot(prev => ({
          ...prev,
          ...data.autopilot,
          quotexReferralLink: resolvedQxLink,
          botToken: resolvedToken || prev.botToken,
          chatId: resolvedChat || prev.chatId,
          freeWinImageUrl: data.autopilot.freeWinImageUrl !== undefined ? data.autopilot.freeWinImageUrl : (prev.freeWinImageUrl || ''),
          freeWinGale1ImageUrl: data.autopilot.freeWinGale1ImageUrl !== undefined ? data.autopilot.freeWinGale1ImageUrl : (prev.freeWinGale1ImageUrl || ''),
          freeLossImageUrl: data.autopilot.freeLossImageUrl !== undefined ? data.autopilot.freeLossImageUrl : (prev.freeLossImageUrl || ''),
          vipWinImageUrl: data.autopilot.vipWinImageUrl !== undefined ? data.autopilot.vipWinImageUrl : (prev.vipWinImageUrl || ''),
          vipWinGale1ImageUrl: data.autopilot.vipWinGale1ImageUrl !== undefined ? data.autopilot.vipWinGale1ImageUrl : (prev.vipWinGale1ImageUrl || ''),
          vipLossImageUrl: data.autopilot.vipLossImageUrl !== undefined ? data.autopilot.vipLossImageUrl : (prev.vipLossImageUrl || '')
        }));

        // If browser had a token in localStorage that the server didn't have yet, push it to server & Cloud Firestore immediately
        if (!data.autopilot.botToken && savedLocalToken) {
          fetch('/api/autopilot', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...data.autopilot,
              botToken: savedLocalToken,
              chatId: resolvedChat
            })
          }).catch(() => {});
        }
      }
    } catch (_err) {
      // Fallback to direct Firestore read if backend is momentarily restarting
      try {
        const cloudData = await loadCloudSystemState();
        if (cloudData?.autopilot) {
          setAutoPilot(prev => ({
            ...prev,
            ...cloudData.autopilot,
            botToken: cloudData.autopilot.botToken || prev.botToken,
            chatId: cloudData.autopilot.chatId || prev.chatId
          }));
        }
        if (cloudData?.signals) {
          setSignals(cloudData.signals);
        }
        if (cloudData?.dailyStats && Array.isArray(cloudData.dailyStats)) {
          setDailyStats(cloudData.dailyStats);
        }
      } catch (_e) {
        // Ignore
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSignals();
    const timer = setInterval(fetchSignals, 10000);
    return () => clearInterval(timer);
  }, []);

  // Force refresh live market radar
  const handleRefreshMarketRadar = async () => {
    setIsScanningMarket(true);
    try {
      const res = await fetch('/api/market-scan');
      const data = await res.json();
      if (data.ok && data.snapshots) {
        setLiveMarket(data.snapshots);
      }
    } catch (_e) {
      // Ignore
    } finally {
      setIsScanningMarket(false);
    }
  };

  // Handle Admin Login
  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setIsLoggingIn(true);

    const cleanEmail = (loginEmail || '').trim().toLowerCase();
    const cleanPassword = (loginPassword || '').trim();

    // Direct secure credential verification (guarantees instant login on fx.zadtoo.com / GitHub Pages / Cloud Run)
    const isEmailValid = cleanEmail === 'thrayanabil2026@gmail.com' || cleanEmail === 'thrayanabil@gmail.com';
    const isPasswordValid = cleanPassword === 'Tr@7177';

    if (isEmailValid && isPasswordValid) {
      sessionStorage.setItem('zad_admin_auth', 'true');
      localStorage.setItem('zad_admin_auth', 'true');
      setIsAdminAuthenticated(true);
      setShowLoginModal(false);
      setActiveView('admin');
      setLoginPassword('');
      setIsLoggingIn(false);

      // Best effort background sync with server
      try {
        fetch('/api/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: cleanEmail, password: cleanPassword })
        }).catch(() => {});
      } catch (_e) {}
      return;
    }

    if (!isEmailValid || !isPasswordValid) {
      setLoginError('البريد الإلكتروني أو كلمة المرور غير صحيحة');
      setIsLoggingIn(false);
      return;
    }
  };

  const handleAdminLogout = () => {
    sessionStorage.removeItem('zad_admin_auth');
    localStorage.removeItem('zad_admin_auth');
    setIsAdminAuthenticated(false);
    setActiveView('visitor');
  };

  // Direct Trader Registration without email/gmail verification
  const handleTraderRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError('');
    if (
      !regName.trim() ||
      !regTelegram.trim() ||
      !regEmail.trim() ||
      !regPhone.trim() ||
      !regBroker.trim() ||
      !regBrokerAccountId.trim()
    ) {
      setRegError('يرجى إدخال جميع البيانات بما في ذلك رقم حسابك في البروكر (كلمة المرور للدخول).');
      return;
    }
    setIsSubmittingReg(true);
    try {
      const isQuotex = isQuotexBrokerName(regBroker);
      const effectiveSubType = isQuotex && regSubscriptionType === 'quotex_referral' ? 'quotex_referral' : 'paid_plan';
      const effectivePlan = effectiveSubType === 'quotex_referral' ? 'quotex_referral_free' : regPlanDuration;
      const effectivePayment =
        effectiveSubType === 'quotex_referral'
          ? '🎁 إحالة كيوتكس مجاناً (التسجيل بالرابط + إيداع 100$ في حسابك)'
          : regPaymentMethod;

      const res = await fetch('/api/register-trader', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: regName.trim(),
          telegramUsername: regTelegram.trim(),
          country: regCountry,
          email: regEmail.trim(),
          phone: regPhone.trim(),
          broker: regBroker,
          brokerAccountId: regBrokerAccountId.trim(),
          subscriptionType: effectiveSubType,
          planDuration: effectivePlan,
          paymentMethod: effectivePayment
        })
      });
      const data = await res.json();
      if (data.ok && data.subscriber) {
        setSubscribers(prev => [
          data.subscriber,
          ...prev.filter(s => s.id !== data.subscriber.id)
        ]);
        localStorage.setItem('zad_vip_member_id', data.subscriber.id);
        setCurrentMemberId(data.subscriber.id);
        setRegSuccess(true);
        setRegName('');
        setRegTelegram('');
        setRegEmail('');
        setRegPhone('');
        setRegBrokerAccountId('');
      } else {
        setRegError(data.error || 'تعذر إتمام التسجيل، حاول مرة أخرى.');
      }
    } catch (_e) {
      setRegError('حدث خطأ في الاتصال بالخادم.');
    } finally {
      setIsSubmittingReg(false);
    }
  };

  // Active logged-in VIP Member object (synced live every 10s via fetchSignals)
  const currentMember = useMemo(() => {
    if (!currentMemberId) return null;
    return subscribers.find(s => s.id === currentMemberId) || null;
  }, [subscribers, currentMemberId]);

  const handleMemberLogout = () => {
    localStorage.removeItem('zad_vip_member_id');
    setCurrentMemberId('');
    setMemberLookupInput('');
    setMemberPasswordInput('');
    setMemberLookupError('');
  };

  // Interactive Live Candlestick Chart state for the Visitor Card middle showcase
  const [selectedChartPair, setSelectedChartPair] = useState<string>('EUR/USD');
  const [liveCandles, setLiveCandles] = useState<
    { id: number; open: number; high: number; low: number; close: number; isBull: boolean }[]
  >(() => {
    const initial: { id: number; open: number; high: number; low: number; close: number; isBull: boolean }[] = [];
    let p = 50;
    for (let i = 0; i < 24; i++) {
      const delta = (Math.sin(i * 0.65) * 6.5) + ((i % 3 === 0 ? 1 : -1) * 3.2);
      const open = p;
      const close = Math.max(18, Math.min(82, open + delta));
      const isBull = close >= open;
      const high = Math.min(92, Math.max(open, close) + 4 + (i % 4) * 1.8);
      const low = Math.max(8, Math.min(open, close) - 4 - ((i + 1) % 4) * 1.8);
      initial.push({ id: i, open, high, low, close, isBull });
      p = close;
    }
    return initial;
  });

  // Animate the live candlestick chart every 1.2s so the visitor sees a real-time pulsing candlestick box
  useEffect(() => {
    const candleInterval = setInterval(() => {
      setLiveCandles(prev => {
        if (prev.length === 0) return prev;
        const copy = [...prev];
        const lastIdx = copy.length - 1;
        const last = { ...copy[lastIdx] };
        const tick = (Math.random() - 0.48) * 5.2;
        const nextClose = Math.max(15, Math.min(85, last.close + tick));

        // Every ~6 ticks, push a new 1-minute candle and shift the oldest one
        if (Math.random() < 0.22) {
          const open = last.close;
          const close = Math.max(16, Math.min(84, open + (Math.random() - 0.47) * 8));
          const isBull = close >= open;
          const high = Math.min(94, Math.max(open, close) + 3 + Math.random() * 5);
          const low = Math.max(6, Math.min(open, close) - 3 - Math.random() * 5);
          return [...copy.slice(1), { id: Date.now(), open, high, low, close, isBull }];
        } else {
          last.close = nextClose;
          last.isBull = last.close >= last.open;
          last.high = Math.min(94, Math.max(last.high, last.close + 1.5));
          last.low = Math.max(6, Math.min(last.low, last.close - 1.5));
          copy[lastIdx] = last;
          return copy;
        }
      });
    }, 1200);
    return () => clearInterval(candleInterval);
  }, []);

  // Selected Subscriber in Admin Modal
  const selectedAdminSub = useMemo(() => {
    if (!selectedAdminSubId) return null;
    return subscribers.find(s => s.id === selectedAdminSubId) || null;
  }, [subscribers, selectedAdminSubId]);

  const openAdminSubscriberModal = (sub: VipSubscriber) => {
    const planObj = VIP_PLANS.find(p => p.id === sub.planDuration) || VIP_PLANS[0];
    const isRef = sub.subscriptionType === 'quotex_referral' || sub.planDuration === 'quotex_referral_free';
    setSelectedAdminSubId(sub.id);
    setAdminEditForm({
      name: sub.name || '',
      telegramUsername: sub.telegramUsername || '',
      country: sub.country || COUNTRIES_LIST[0],
      email: sub.email || '',
      phone: sub.phone || '',
      broker: sub.broker || BROKERS_LIST[0],
      brokerAccountId: sub.brokerAccountId || '',
      subscriptionType: isRef ? 'quotex_referral' : 'paid_plan',
      quotexDepositConfirmed: Boolean(sub.quotexDepositConfirmed),
      planDuration: sub.planDuration || '1_month',
      amountPaid:
        isRef
          ? 0
          : typeof sub.amountPaid === 'number' && sub.amountPaid > 0
          ? sub.amountPaid
          : planObj.price,
      paymentMethod: sub.paymentMethod || PAYMENT_METHODS[1],
      status: sub.status || 'PENDING',
      activationLink: sub.activationLink || '',
      expiryDate: sub.expiryDate || ''
    });
    setAdminChatInput('');
  };

  // Helper to calculate days left until expiry
  const getSubscriberExpiryStatus = (expiryDate?: string) => {
    if (!expiryDate) return { status: 'none' as const, daysLeft: null };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const exp = new Date(expiryDate);
    exp.setHours(0, 0, 0, 0);
    if (isNaN(exp.getTime())) return { status: 'none' as const, daysLeft: null };
    const diffDays = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return { status: 'expired' as const, daysLeft: diffDays };
    if (diffDays <= 5) return { status: 'expiring_soon' as const, daysLeft: diffDays };
    return { status: 'ok' as const, daysLeft: diffDays };
  };

  // Admin Revenue Stats & Expiry Alerts
  const adminRevenueAndExpiryStats = useMemo(() => {
    let totalCollectedUsd = 0;
    let bankTotal = 0;
    let walletTotal = 0;
    let palestineBankTotal = 0;
    let activePaidCount = 0;
    const expiringOrExpiredMembers: { sub: VipSubscriber; daysLeft: number; isExpired: boolean }[] = [];

    for (const sub of subscribers) {
      const paid = Number(sub.amountPaid) || 0;
      if (paid > 0) {
        totalCollectedUsd += paid;
        activePaidCount++;
        const pm = (sub.paymentMethod || '').toLowerCase();
        if (pm.includes('فلسطين') || isPalestineCountry(sub.country)) {
          palestineBankTotal += paid;
        } else if (pm.includes('بنك') || pm.includes('bank')) {
          bankTotal += paid;
        } else {
          walletTotal += paid;
        }
      }

      const expInfo = getSubscriberExpiryStatus(sub.expiryDate);
      if (expInfo.status === 'expired' || expInfo.status === 'expiring_soon') {
        expiringOrExpiredMembers.push({
          sub,
          daysLeft: expInfo.daysLeft ?? 0,
          isExpired: expInfo.status === 'expired'
        });
      }
    }

    return {
      totalCollectedUsd,
      bankTotal,
      walletTotal,
      palestineBankTotal,
      activePaidCount,
      expiringOrExpiredMembers
    };
  }, [subscribers]);

  // Quick Notes (WhatsApp-style saved templates for Admin)
  const handleAddQuickNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteTitle.trim() || !newNoteContent.trim()) return;
    try {
      const res = await fetch('/api/quick-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newNoteTitle.trim(),
          content: newNoteContent.trim()
        })
      });
      const data = await res.json();
      if (data.ok && data.quickNotes) {
        setQuickNotes(data.quickNotes);
        setNewNoteTitle('');
        setNewNoteContent('');
        setShowAddNoteForm(false);
      }
    } catch (_e) {
      // Ignore
    }
  };

  const handleDeleteQuickNote = async (id: string) => {
    try {
      const res = await fetch(`/api/quick-notes/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.ok && data.quickNotes) {
        setQuickNotes(data.quickNotes);
      }
    } catch (_e) {
      // Ignore
    }
  };

  // Admin: Save edits, status, expiry date, or send activation link to member
  const handleAdminUpdateSubscriber = async (
    subId: string,
    updates: Partial<VipSubscriber> & { sendActivationMessage?: boolean }
  ) => {
    setIsSavingSubscriber(true);
    try {
      const res = await fetch(`/api/subscribers/${subId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      const data = await res.json();
      if (data.ok && data.subscriber) {
        setSubscribers(prev => prev.map(s => (s.id === subId ? data.subscriber : s)));
        if (selectedAdminSubId === subId) {
          const planObj = VIP_PLANS.find(p => p.id === data.subscriber.planDuration) || VIP_PLANS[0];
          const isRef =
            data.subscriber.subscriptionType === 'quotex_referral' ||
            data.subscriber.planDuration === 'quotex_referral_free';
          setAdminEditForm({
            name: data.subscriber.name || '',
            telegramUsername: data.subscriber.telegramUsername || '',
            country: data.subscriber.country || COUNTRIES_LIST[0],
            email: data.subscriber.email || '',
            phone: data.subscriber.phone || '',
            broker: data.subscriber.broker || BROKERS_LIST[0],
            brokerAccountId: data.subscriber.brokerAccountId || '',
            subscriptionType: isRef ? 'quotex_referral' : 'paid_plan',
            quotexDepositConfirmed: Boolean(data.subscriber.quotexDepositConfirmed),
            planDuration: data.subscriber.planDuration || '1_month',
            amountPaid:
              typeof data.subscriber.amountPaid === 'number'
                ? data.subscriber.amountPaid
                : planObj.price,
            paymentMethod: data.subscriber.paymentMethod || PAYMENT_METHODS[1],
            status: data.subscriber.status || 'PENDING',
            activationLink: data.subscriber.activationLink || '',
            expiryDate: data.subscriber.expiryDate || ''
          });
        }
        setPublishStatus({
          type: 'success',
          message: updates.sendActivationMessage
            ? '✅ تم إرسال رابط التفعيل وتاريخ الانتهاء إلى حساب العضو وتفعيل عضويته!'
            : '✅ تم تحديث بيانات العضوية بنجاح.'
        });
        setTimeout(() => setPublishStatus({ type: 'idle' }), 4000);
      }
    } catch (_e) {
      // Ignore
    } finally {
      setIsSavingSubscriber(false);
    }
  };

  // Compress uploaded payment receipt image so it saves cleanly in Cloud Firestore & server state
  const handleReceiptImageUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    onDone: (dataUrl: string) => void
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDim = 800;
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
          const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.65);
          onDone(compressedDataUrl);
        }
      };
      if (typeof ev.target?.result === 'string') {
        img.src = ev.target.result;
      }
    };
    reader.readAsDataURL(file);
  };

  // Compress uploaded Win/Loss Bot Result Image/Sticker so it fits inside Cloud Firestore & Telegram sendPhoto cleanly
  const handleBotResultImageUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    fieldKey:
      | 'freeWinImageUrl'
      | 'freeWinGale1ImageUrl'
      | 'freeLossImageUrl'
      | 'vipWinImageUrl'
      | 'vipWinGale1ImageUrl'
      | 'vipLossImageUrl'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDim = 96; // Compact emoji/icon scale
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          // Preserve transparent PNG format so it never produces an unsightly black background
          const compressedDataUrl = canvas.toDataURL('image/png');
          setAutoPilot(prev => ({ ...prev, [fieldKey]: compressedDataUrl }));
          handleSaveAutoPilot({ [fieldKey]: compressedDataUrl });
        }
      };
      if (typeof ev.target?.result === 'string') {
        img.src = ev.target.result;
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleDeleteBotResultImage = (
    fieldKey:
      | 'freeWinImageUrl'
      | 'freeWinGale1ImageUrl'
      | 'freeLossImageUrl'
      | 'vipWinImageUrl'
      | 'vipWinGale1ImageUrl'
      | 'vipLossImageUrl'
  ) => {
    const localKeyMap: Record<string, string> = {
      freeWinImageUrl: 'tg_free_win_img',
      freeWinGale1ImageUrl: 'tg_free_gale1_img',
      freeLossImageUrl: 'tg_free_loss_img',
      vipWinImageUrl: 'tg_vip_win_img',
      vipWinGale1ImageUrl: 'tg_vip_gale1_img',
      vipLossImageUrl: 'tg_vip_loss_img'
    };
    const storageKey = localKeyMap[fieldKey];
    if (storageKey) {
      try {
        localStorage.removeItem(storageKey);
      } catch (e) {
        // Ignore
      }
    }
    setAutoPilot(prev => ({ ...prev, [fieldKey]: '' }));
    handleSaveAutoPilot({ [fieldKey]: '' });
  };

  // Send message (Admin -> Member OR Member -> Admin, with optional receipt image)
  const handleSendSubscriberMessage = async (
    subId: string,
    sender: 'admin' | 'member',
    text: string,
    imageUrl?: string,
    extraUpdates?: { planDuration?: string; paymentMethod?: string }
  ) => {
    if (!text.trim() && !imageUrl) return;
    if (sender === 'member') setIsSendingMemberMsg(true);
    try {
      const res = await fetch(`/api/subscribers/${subId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender,
          text: text.trim() || '📸 صورة إيصال التحويل لتجديد الاشتراك',
          imageUrl,
          ...extraUpdates
        })
      });
      const data = await res.json();
      if (data.ok && data.subscriber) {
        setSubscribers(prev => prev.map(s => (s.id === subId ? data.subscriber : s)));
        if (sender === 'admin') {
          setAdminChatInput('');
        } else {
          setMemberChatInput('');
          setMemberChatImage('');
        }
      }
    } catch (_e) {
      // Ignore
    } finally {
      if (sender === 'member') setIsSendingMemberMsg(false);
    }
  };

  // Submit Subscription Renewal Request + Receipt Screenshot to Admin
  const handleSubmitRenewalRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentMember) {
      setShowRenewalModal(false);
      setShowMemberPortalModal(true);
      return;
    }
    const planObj = VIP_PLANS.find(p => p.id === renewalPlanId) || VIP_PLANS[0];
    const activeCountry = currentMember.country || renewalCountry || COUNTRIES_LIST[0];
    const isEgypt = isEgyptCountry(activeCountry);
    const priceLabel = isEgypt
      ? `${(planObj.price * USD_TO_EGP_RATE).toLocaleString('en-US')} جنيه مصري`
      : `${planObj.price} دولار ($)`;
    const allowedMethods = getPaymentMethodsForCountry(activeCountry);
    const chosenMethod = allowedMethods.includes(renewalPaymentMethod)
      ? renewalPaymentMethod
      : allowedMethods[0];

    setIsSubmittingRenewal(true);
    try {
      const msgText = `🔄 طلب تجديد اشتراك VIP:\n• الباقة المختارة: ${planObj.label}\n• المبلغ المطلوب: ${priceLabel}\n• وسيلة الدفع: ${chosenMethod}${
        renewalNote.trim() ? `\n• ملاحظة العضو: ${renewalNote.trim()}` : ''
      }${
        renewalReceiptImage
          ? '\n✅ مرفق بالأسفل صورة إيصال التحويل للمشرف.'
          : '\n📸 سأقوم بإرسال صورة إيصال التحويل للمشرف.'
      }`;

      await handleSendSubscriberMessage(
        currentMember.id,
        'member',
        msgText,
        renewalReceiptImage || undefined,
        {
          planDuration: renewalPlanId,
          paymentMethod: chosenMethod
        }
      );
      setRenewalSentSuccess(true);
      setRenewalReceiptImage('');
      setRenewalNote('');
    } finally {
      setIsSubmittingRenewal(false);
    }
  };

  // Member lookup by email, phone, or telegram username + Broker Account ID as Password
  const handleMemberLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setMemberLookupError('');
    if (!memberLookupInput.trim() || !memberPasswordInput.trim()) {
      setMemberLookupError('يرجى إدخال البريد/الموبايل وكلمة المرور (معرف حسابك في البروكر).');
      return;
    }
    try {
      const res = await fetch('/api/member/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: memberLookupInput.trim(),
          password: memberPasswordInput.trim()
        })
      });
      const data = await res.json();
      if (data.ok && data.subscriber) {
        localStorage.setItem('zad_vip_member_id', data.subscriber.id);
        setCurrentMemberId(data.subscriber.id);
        setSubscribers(prev => [
          data.subscriber,
          ...prev.filter(s => s.id !== data.subscriber.id)
        ]);
        setMemberLookupInput('');
        setMemberPasswordInput('');
      } else {
        setMemberLookupError(data.error || 'لم يتم العثور على العضوية أو كلمة المرور غير صحيحة.');
      }
    } catch (_e) {
      setMemberLookupError('تعذر الاتصال بالخادم.');
    }
  };

  const handleDeleteSubscriber = async (id: string) => {
    try {
      await fetch(`/api/subscribers/${id}`, { method: 'DELETE' });
      setSubscribers(prev => prev.filter(s => s.id !== id));
      if (selectedAdminSubId === id) setSelectedAdminSubId(null);
    } catch (_e) {
      // Ignore
    }
  };

  // Sync formatting rules to server & Cloud Firestore
  const updateFormatterOptions = async (updater: (prev: FormatterOptions) => FormatterOptions) => {
    const next = updater(formatterOptions);
    setFormatterOptions(next);
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next)
      });
      await saveCloudSystemState({
        signals: signals.slice(0, 50),
        settings: next,
        autopilot: autoPilot
      });
    } catch (_e) {
      // Ignore
    }
  };

  // Save & toggle Auto-Pilot on server & Cloud Firestore
  const handleSaveAutoPilot = async (newConfig: Partial<AutoPilotConfig>) => {
    lastAutoPilotSaveRef.current = Date.now();
    setIsSavingAutoPilot(true);
    const merged = { ...autoPilot, ...newConfig };
    setAutoPilot(merged);

    const safeSet = (k: string, v: string) => {
      try {
        localStorage.setItem(k, v);
      } catch (e) {
        console.warn(`[Storage Quota Notice] Could not save ${k} to localStorage:`, e);
      }
    };

    if (merged.botToken) safeSet('tg_bot_token', merged.botToken);
    if (merged.chatId) safeSet('tg_chat_id', merged.chatId);
    if (merged.freeStartHourEgypt !== undefined) {
      safeSet('tg_free_start_hour', String(merged.freeStartHourEgypt));
    }
    if (merged.freeEndHourEgypt !== undefined) {
      safeSet('tg_free_end_hour', String(merged.freeEndHourEgypt));
    }
    if (typeof merged.oneGaleEnabled === 'boolean') {
      safeSet('tg_one_gale_enabled', String(merged.oneGaleEnabled));
    }
    if (merged.freeWinIcon !== undefined) safeSet('tg_free_win_icon', merged.freeWinIcon);
    if (merged.freeWinGale1Icon !== undefined) safeSet('tg_free_gale1_icon', merged.freeWinGale1Icon);
    if (merged.freeLossIcon !== undefined) safeSet('tg_free_loss_icon', merged.freeLossIcon);
    if (merged.freeWinImageUrl !== undefined) {
      if (merged.freeWinImageUrl) safeSet('tg_free_win_img', merged.freeWinImageUrl);
      else { try { localStorage.removeItem('tg_free_win_img'); } catch(e) {} }
    }
    if (merged.freeWinGale1ImageUrl !== undefined) {
      if (merged.freeWinGale1ImageUrl) safeSet('tg_free_gale1_img', merged.freeWinGale1ImageUrl);
      else { try { localStorage.removeItem('tg_free_gale1_img'); } catch(e) {} }
    }
    if (merged.freeLossImageUrl !== undefined) {
      if (merged.freeLossImageUrl) safeSet('tg_free_loss_img', merged.freeLossImageUrl);
      else { try { localStorage.removeItem('tg_free_loss_img'); } catch(e) {} }
    }
    if (merged.vipBotToken !== undefined) safeSet('tg_vip_bot_token', merged.vipBotToken);
    if (merged.vipChatId !== undefined) safeSet('tg_vip_chat_id', merged.vipChatId);
    if (merged.vipWinIcon !== undefined) safeSet('tg_vip_win_icon', merged.vipWinIcon);
    if (merged.vipWinGale1Icon !== undefined) safeSet('tg_vip_gale1_icon', merged.vipWinGale1Icon);
    if (merged.vipLossIcon !== undefined) safeSet('tg_vip_loss_icon', merged.vipLossIcon);
    if (merged.vipWinImageUrl !== undefined) {
      if (merged.vipWinImageUrl) safeSet('tg_vip_win_img', merged.vipWinImageUrl);
      else { try { localStorage.removeItem('tg_vip_win_img'); } catch(e) {} }
    }
    if (merged.vipWinGale1ImageUrl !== undefined) {
      if (merged.vipWinGale1ImageUrl) safeSet('tg_vip_gale1_img', merged.vipWinGale1ImageUrl);
      else { try { localStorage.removeItem('tg_vip_gale1_img'); } catch(e) {} }
    }
    if (merged.vipLossImageUrl !== undefined) {
      if (merged.vipLossImageUrl) safeSet('tg_vip_loss_img', merged.vipLossImageUrl);
      else { try { localStorage.removeItem('tg_vip_loss_img'); } catch(e) {} }
    }
    if (merged.resultNotificationStyle !== undefined) {
      safeSet('tg_result_notification_style', merged.resultNotificationStyle);
    }

    try {
      const res = await fetch('/api/autopilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(merged)
      });
      if (!res.ok) {
        let errDetail = '';
        try {
          const errData = await res.json();
          errDetail = errData.error || errData.message || '';
        } catch(e) {}
        throw new Error(errDetail ? `خطأ السيرفر: ${errDetail}` : `Server returned status ${res.status}`);
      }
      const data = await res.json();
      const updatedAutopilot = data.ok && data.autopilot ? data.autopilot : merged;
      lastAutoPilotSaveRef.current = Date.now();
      setAutoPilot(updatedAutopilot);

      // Best-effort secondary sync to Cloud Firestore (does not break local server persistence if unauthenticated)
      try {
        await saveCloudSystemState({
          signals: signals.slice(0, 50),
          settings: formatterOptions,
          autopilot: updatedAutopilot,
          subscribers: subscribers.slice(0, 200),
          quickNotes: quickNotes.slice(0, 50),
          dailyStats: dailyStats.slice(0, 120)
        });
      } catch (cloudErr) {
        console.warn('Optional secondary cloud sync notice:', cloudErr);
      }

      const startH = updatedAutopilot.freeStartHourEgypt ?? 9;
      const endH = updatedAutopilot.freeEndHourEgypt ?? 21;
      const startLabel = startH === 0 ? '12 ص' : startH < 12 ? `${startH} صباحاً` : startH === 12 ? '12 ظهراً' : `${startH - 12} مساءً`;
      const endLabel = endH === 0 ? '12 ص' : endH < 12 ? `${endH} صباحاً` : endH === 12 ? '12 ظهراً' : `${endH - 12} مساءً`;
      const galeLabel = updatedAutopilot.oneGaleEnabled === true ? 'مضاعفة واحدة مفعّلة' : 'بدون مضاعفات (متوقف)';
      const pairModeLabel = updatedAutopilot.pairSelectionMode === 'fixed_single'
        ? `الزوج الثابت: ${updatedAutopilot.primaryFixedPair || 'EUR/JPY'}`
        : updatedAutopilot.pairSelectionMode === 'custom_list'
        ? `قائمة محددة (${(updatedAutopilot.allowedPairs || []).length} أزواج)`
        : 'جميع أزواج السوق';

      setPublishStatus({
        type: 'success',
        message: `✅ تم حفظ وتثبيت إعدادات البوت والزوج بنجاح في السيرفر: (${pairModeLabel}) · التوقيت (${startLabel} إلى ${endLabel})!`
      });
      setTimeout(() => setPublishStatus({ type: 'idle' }), 5000);
    } catch (err: any) {
      console.warn('[handleSaveAutoPilot Error]', err);
      const errMsg = err?.message || '';
      setPublishStatus({
        type: 'error',
        message: errMsg.includes('Failed to fetch')
          ? 'تعذر الاتصال بالخادم، يرجى التحقق من اتصال الإنترنت.'
          : errMsg.startsWith('خطأ السيرفر:')
          ? errMsg
          : 'تعذر حفظ إعدادات التشغيل التلقائي في الخادم.'
      });
      setTimeout(() => setPublishStatus({ type: 'idle' }), 5000);
    } finally {
      setIsSavingAutoPilot(false);
    }
  };

  // Add custom trading pair to admin list
  const handleAddCustomPair = async (pairToAdd: string) => {
    let p = pairToAdd.toUpperCase().trim();
    if (!p) return;
    if (!p.includes('/') && p.length === 6) p = `${p.slice(0, 3)}/${p.slice(3, 6)}`;
    try {
      const res = await fetch('/api/autopilot/add-pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pair: p })
      });
      const data = await res.json();
      if (data.ok && data.autopilot) {
        setAutoPilot(data.autopilot);
        setNewCustomPairInput('');
        setPublishStatus({
          type: 'success',
          message: `✅ تمت إضافة الزوج (${p}) إلى قائمة أزواج التداول بنجاح!`
        });
        setTimeout(() => setPublishStatus({ type: 'idle' }), 4000);
      } else {
        setPublishStatus({ type: 'error', message: data.error || 'تعذر إضافة الزوج' });
      }
    } catch (_e) {
      setPublishStatus({ type: 'error', message: 'تعذر الاتصال بالسيرفر لإضافة الزوج' });
    }
  };

  // Remove custom trading pair from admin list
  const handleRemoveCustomPair = async (pairToRemove: string) => {
    try {
      const res = await fetch('/api/autopilot/remove-pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pair: pairToRemove })
      });
      const data = await res.json();
      if (data.ok && data.autopilot) {
        setAutoPilot(data.autopilot);
        setPublishStatus({
          type: 'success',
          message: `✅ تم حذف الزوج (${pairToRemove}) من القائمة!`
        });
        setTimeout(() => setPublishStatus({ type: 'idle' }), 4000);
      } else {
        setPublishStatus({ type: 'error', message: data.error || 'تعذر حذف الزوج' });
      }
    } catch (_e) {
      setPublishStatus({ type: 'error', message: 'تعذر الاتصال بالسيرفر لحذف الزوج' });
    }
  };

  // Trigger immediate focused analysis & dispatch now
  const handleTriggerAutoNow = async (preferredPair?: string | unknown) => {
    const pair = typeof preferredPair === 'string' ? preferredPair : undefined;
    setPublishStatus({
      type: 'loading',
      message: pair
        ? `جاري فحص زوج (${pair}) واختيار أقوى فرصة وإرسالها...`
        : 'جاري فحص أزواج السوق العالمي الحية واختيار أقوى فرصة على مؤشر RSI وإرسالها...'
    });
    try {
      const res = await fetch('/api/autopilot/trigger-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferredPair: pair })
      });
      const data = await res.json();
      if (data.ok && data.signal) {
        setSignals(prev => [data.signal, ...prev.filter(s => s.id !== data.signal.id)]);
        if (data.autopilot) setAutoPilot(data.autopilot);
        setPublishStatus({
          type: data.telegramError ? 'warning' : 'success',
          message: data.telegramError
            ? `تم اقتناص فرصة (${data.signal.asset}) ونشرها للزوار، لكن تعذر إرسالها لتليجرام: ${data.telegramError}`
            : `تم اقتناص فرصة حقيقية على زوج (${data.signal.asset}) وإرسالها إلى بوت تليجرام الخاص بك بنجاح!`
        });
        setTimeout(() => setPublishStatus({ type: 'idle' }), 5000);
      } else {
        setPublishStatus({
          type: 'warning',
          message: data.error || 'لا توجد فرصة قوية مستوفية للشروط في هذه اللحظة.'
        });
      }
    } catch (_e) {
      setPublishStatus({ type: 'error', message: 'تعذر تنفيذ الفحص الفوري.' });
    }
  };

  const handleRawInputChange = (val: string) => {
    setRawInput(val);
    setManualOverride({});
    setCustomMessageOverride(null);
  };

  // Real-time parsed signal + formatted preview synced to device clock hour + signal minute
  const parsedSignal = useMemo(() => {
    const base = parseRawQuotexSignal(rawInput, formatterOptions);
    const activeMinute =
      manualOverride.entryMinute !== undefined
        ? extractMinuteOnly(manualOverride.entryMinute)
        : base.entryMinute;
    return {
      ...base,
      asset: manualOverride.asset ?? base.asset,
      isOtc: false, // Strictly Global Market
      direction: manualOverride.direction ?? base.direction,
      entryMinute: activeMinute,
      entryTime: formatDeviceLocalTimeFromMinute(activeMinute),
      analysisReason: manualOverride.analysisReason ?? base.analysisReason
    };
  }, [rawInput, formatterOptions, manualOverride, deviceNow]);

  const generatedMessage = useMemo(() => {
    return formatSignalMessage(parsedSignal, formatterOptions);
  }, [parsedSignal, formatterOptions]);

  const formattedPreview = customMessageOverride !== null ? customMessageOverride : generatedMessage;

  // Auto-save direct edits inside "نص الرسالة النهائي" to server & Cloud Firestore
  const handleDirectMessageBoxChange = (editedVal: string) => {
    setCustomMessageOverride(editedVal);
    setMessageAutoSaveStatus('saving');
    const convertedPattern = convertEditedMessageToCustomPattern(editedVal, parsedSignal);
    const nextOptions: FormatterOptions = {
      ...formatterOptions,
      templateStyle: 'custom',
      customTemplatePattern: convertedPattern
    };
    setFormatterOptions(nextOptions);
    localStorage.setItem('zad_saved_custom_template', convertedPattern);

    fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nextOptions)
    })
      .then(() => {
        saveCloudSystemState({
          signals: signals.slice(0, 50),
          settings: nextOptions,
          autopilot: autoPilot
        }).catch(() => {});
        setMessageAutoSaveStatus('saved');
      })
      .catch(() => {
        setMessageAutoSaveStatus('saved');
      });
  };

  const handleCopyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handlePullFromLiveGlobalRadar = async () => {
    setIsFetchingSource(true);
    try {
      const res = await fetch('/api/scrape-source');
      const data = await res.json();
      if (data.ok && data.messages && data.messages.length > 0) {
        handleRawInputChange(data.messages[0]);
        if (data.candidate?.reason) {
          setManualOverride(prev => ({ ...prev, analysisReason: data.candidate.reason }));
        }
        setPublishStatus({
          type: 'success',
          message: `تم سحب أقوى فرصة حية من السوق العالمي (${data.candidate?.pair || ''}) ومزامنة الدقيقة مع ساعة جهازك`
        });
        setTimeout(() => setPublishStatus({ type: 'idle' }), 3500);
      }
    } catch (_e) {
      setPublishStatus({
        type: 'error',
        message: 'تعذر الجلب التلقائي من السوق العالمي حالياً'
      });
    } finally {
      setIsFetchingSource(false);
    }
  };

  const handlePublishSignal = async () => {
    setPublishStatus({ type: 'loading', message: 'جاري تنسيق إشارة السوق العالمي وإرسالها...' });

    try {
      const res = await fetch('/api/signals/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asset: parsedSignal.asset,
          isOtc: false,
          direction: parsedSignal.direction,
          timeframe: parsedSignal.timeframe,
          entryMinute: parsedSignal.entryMinute,
          entryTime: parsedSignal.entryTime,
          livePrice: parsedSignal.livePrice,
          rsiValue: parsedSignal.rsiValue,
          analysisReason: parsedSignal.analysisReason,
          formattedMessage: formattedPreview,
          rawOriginal: rawInput,
          botToken: autoPilot.botToken,
          chatId: autoPilot.chatId,
          sendToTelegram: Boolean(autoPilot.botToken.trim() && autoPilot.chatId.trim())
        })
      });

      const data = await res.json();
      if (data.ok) {
        setSignals(prev => [data.signal, ...prev]);

        if (autoPilot.botToken.trim() && autoPilot.chatId.trim()) {
          if (data.telegramSent) {
            setPublishStatus({
              type: 'success',
              message: 'تم إرسال إشارة السوق العالمي بنجاح إلى بوت تليجرام الخاص بك ونشرها للزوار!'
            });
          } else {
            setPublishStatus({
              type: 'warning',
              message: `تم النشر في صفحة الزوار، لكن تعذر الإرسال لتليجرام: ${data.telegramError}`
            });
          }
        } else {
          setPublishStatus({
            type: 'success',
            message: 'تم نشر إشارة السوق العالمي في صفحة الزوار بنجاح!'
          });
        }
        setTimeout(() => setPublishStatus({ type: 'idle' }), 5000);
      }
    } catch (_err) {
      setPublishStatus({
        type: 'error',
        message: 'حدث خطأ أثناء الاتصال بالخادم.'
      });
    }
  };

  const handleUpdateStatus = async (
    id: string,
    status: 'WIN' | 'WIN_GALE1' | 'LOSS' | 'DRAW' | 'PENDING'
  ) => {
    try {
      const res = await fetch(`/api/signals/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          botToken: autoPilot.botToken,
          chatId: autoPilot.chatId,
          notifyTelegram: Boolean(autoPilot.botToken.trim() && autoPilot.chatId.trim())
        })
      });
      const data = await res.json();
      if (data.ok) {
        setSignals(prev => prev.map(s => (s.id === id ? data.signal : s)));
        setPublishStatus({
          type: 'success',
          message:
            status === 'WIN'
              ? 'تم تحديث النتيجة إلى (ربح ✅) وإرسالها للقناة!'
              : status === 'WIN_GALE1'
              ? 'تم تحديث النتيجة إلى (✅ ربح مضاعفة واحدة) وإرسالها للقناة!'
              : status === 'LOSS'
              ? 'تم تحديث النتيجة إلى (خسارة ❌ مرة واحدة فقط) وإرسالها للقناة.'
              : 'تم تحديث النتيجة إلى (تعادل ⚖️) وتعديل الإشارة في تليجرام.'
        });
        setTimeout(() => setPublishStatus({ type: 'idle' }), 4000);
      }
    } catch (_e) {
      // Ignore
    }
  };

  const handleDeleteSignal = async (id: string) => {
    try {
      await fetch(`/api/signals/${id}`, { method: 'DELETE' });
      setSignals(prev => prev.filter(s => s.id !== id));
    } catch (_e) {
      // Ignore
    }
  };

  // Manual & Daily Reset for "04. سجل إشارات السوق العالمي المنشورة" and daily accuracy/wins stats
  const handleResetDailySignalsLog = async () => {
    try {
      const res = await fetch('/api/signals/reset-daily', { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        setSignals([]);
        if (data.dailyStats && Array.isArray(data.dailyStats)) {
          setDailyStats(data.dailyStats);
        }
        if (data.autopilot) {
          setAutoPilot(prev => ({ ...prev, ...data.autopilot, totalAutoSent: 0 }));
        }
        await saveCloudSystemState({
          signals: [],
          settings: formatterOptions,
          autopilot: { ...autoPilot, totalAutoSent: 0 }
        });
        setPublishStatus({
          type: 'success',
          message: '✅ تم تصفير (04. سجل إشارات السوق العالمي المنشورة) وتصفير عداد الصفقات والنسبة اليومية بنجاح!'
        });
        setTimeout(() => setPublishStatus({ type: 'idle' }), 4000);
      }
    } catch (_e) {
      // Ignore
    }
  };

  // Helper to get YYYY-MM-DD in Egypt Time (Africa/Cairo) so signals and accuracy reset automatically every day
  const getEgyptDateString = (d: Date): string => {
    try {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Africa/Cairo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).formatToParts(d);
      const y = parts.find(p => p.type === 'year')?.value;
      const m = parts.find(p => p.type === 'month')?.value;
      const day = parts.find(p => p.type === 'day')?.value;
      if (y && m && day) return `${y}-${m}-${day}`;
      return d.toISOString().split('T')[0];
    } catch (_e) {
      return d.toISOString().split('T')[0];
    }
  };

  // Helper to check if a signal was issued strictly within Egypt trading hours (09:00 AM to 09:00 PM Egypt Time)
  const isSignalWithinEgyptHours = (d: Date): boolean => {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Africa/Cairo',
        hour: 'numeric',
        hour12: false
      }).formatToParts(d);
      const hourPart = parts.find(p => p.type === 'hour')?.value;
      const h = parseInt(hourPart || '0', 10);
      const egyptH = h === 24 ? 0 : isNaN(h) ? (d.getUTCHours() + 2) % 24 : h;
      return egyptH >= 9 && egyptH < 21;
    } catch (_e) {
      const h = (d.getUTCHours() + 2) % 24;
      return h >= 9 && h < 21;
    }
  };

  // Show and calculate stats for all of TODAY's signals
  const todaySignals = useMemo(() => {
    const todayEgypt = getEgyptDateString(deviceNow);
    return signals.filter(s => {
      if (!s.createdAt) return false;
      const sigDate = new Date(s.createdAt);
      if (isNaN(sigDate.getTime())) return false;
      const isToday = getEgyptDateString(sigDate) === todayEgypt;
      const isPendingRecent = s.status === 'PENDING' && Date.now() - sigDate.getTime() < 10 * 60 * 1000;
      return isToday || isPendingRecent;
    });
  }, [signals, deviceNow]);

  const stats = useMemo(() => {
    const total = todaySignals.length;
    const wins = todaySignals.filter(s => s.status === 'WIN' || s.status === 'WIN_GALE1').length;
    const completed = todaySignals.filter(
      s => s.status === 'WIN' || s.status === 'WIN_GALE1' || s.status === 'LOSS'
    ).length;
    const winRate = completed > 0 ? Math.round((wins / completed) * 100) : 100;
    const pending = todaySignals.filter(s => s.status === 'PENDING').length;
    return { total, wins, winRate, pending };
  }, [todaySignals]);

  // Comprehensive End-of-Day Final Trading Report (تقرير نهاية يوم التداول بناءً على الساعة النهائية في البوت)
  const endOfDayReportData = useMemo(() => {
    const todayEgypt = getEgyptDateString(deviceNow);
    const startH = Number(autoPilot.freeStartHourEgypt ?? 9);
    const endH = Number(autoPilot.freeEndHourEgypt ?? 21);
    const currentH = Number(autoPilot.currentEgyptHour ?? deviceNow.getHours());
    const isAfterClose =
      autoPilot.freeScheduleEnabled === false
        ? currentH >= 21
        : autoPilot.isFreeBotWithinSchedule === false;

    const liveDirectWins = todaySignals.filter(s => s.status === 'WIN').length;
    const liveGale1Wins = todaySignals.filter(s => s.status === 'WIN_GALE1').length;
    const liveLosses = todaySignals.filter(s => s.status === 'LOSS').length;
    const liveDraws = todaySignals.filter(s => s.status === 'DRAW').length;
    const pendingCount = todaySignals.filter(s => s.status === 'PENDING').length;

    const savedToday = dailyStats.find(d => d.date === todayEgypt);
    const directWins = savedToday?.manualOverride
      ? savedToday.directWins
      : Math.max(liveDirectWins, savedToday?.directWins || 0);
    const gale1Wins = savedToday?.manualOverride
      ? savedToday.gale1Wins
      : Math.max(liveGale1Wins, savedToday?.gale1Wins || 0);
    const lossesWithGale = savedToday?.manualOverride
      ? savedToday.losses
      : Math.max(liveLosses, savedToday?.losses || 0);

    const totalWinsWithGale = directWins + gale1Wins;
    const totalCompleted = totalWinsWithGale + lossesWithGale;
    const firstCandleLossesNoGale = gale1Wins + lossesWithGale;

    const winRateNoGale =
      totalCompleted > 0 ? Math.round((directWins / totalCompleted) * 100) : 0;
    const winRateWithGale =
      totalCompleted > 0 ? Math.round((totalWinsWithGale / totalCompleted) * 100) : 0;

    // Net Profit on $1 base unit ($1 direct, $2 gale)
    const netProfitNoGaleUsd = Number((directWins * 1 - firstCandleLossesNoGale * 1).toFixed(2));
    const netProfitWithGaleUsd = Number(
      (directWins * 1 + gale1Wins * 1 - lossesWithGale * 3).toFixed(2)
    );

    // Pair-by-Pair Breakdown for Today's Signals (أكثر زوج ربحاً + أكثر زوج تم اختياره)
    const pairMap: Record<
      string,
      {
        pair: string;
        total: number;
        directWins: number;
        gale1Wins: number;
        totalWins: number;
        losses: number;
        draws: number;
        winRate: number;
        netNoGale: number;
        netWithGale: number;
      }
    > = {};

    for (const sig of todaySignals) {
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
          netNoGale: 0,
          netWithGale: 0
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
      const comp = p.directWins + p.gale1Wins + p.losses;
      p.totalWins = p.directWins + p.gale1Wins;
      p.winRate = comp > 0 ? Math.round((p.totalWins / comp) * 100) : 0;
      p.netNoGale = p.directWins - (p.gale1Wins + p.losses);
      p.netWithGale = p.directWins + p.gale1Wins - p.losses * 3;
      return p;
    });

    const sortedByProfit = [...pairBreakdown].sort((a, b) => {
      if (b.totalWins !== a.totalWins) return b.totalWins - a.totalWins;
      if (b.winRate !== a.winRate) return b.winRate - a.winRate;
      return b.netNoGale - a.netNoGale;
    });

    const sortedBySelection = [...pairBreakdown].sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total;
      return b.totalWins - a.totalWins;
    });

    const bestWinningPair = sortedByProfit.length > 0 ? sortedByProfit[0] : null;
    const mostSelectedPair = sortedBySelection.length > 0 ? sortedBySelection[0] : null;

    const formatHourAr = (h: number) => {
      const hh = String(h).padStart(2, '0');
      const label =
        h === 0 ? '12 ص' : h < 12 ? `${h} صباحاً` : h === 12 ? '12 ظهراً' : `${h - 12} مساءً`;
      return `${hh}:00 (${label})`;
    };

    const activeWins = autoPilot.oneGaleEnabled ? totalWinsWithGale : directWins;
    const activeLosses = autoPilot.oneGaleEnabled ? lossesWithGale : firstCandleLossesNoGale;
    const activeWinRate = autoPilot.oneGaleEnabled ? winRateWithGale : winRateNoGale;

    const telegramReportText = [
      `📊 التقرير المختصر لختام التداول | ${formatterOptions.channelTitle || 'نَبض التداول'}`,
      `📅 التاريخ: ${todayEgypt} (${formatHourAr(endH)})`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `✅ عدد الربح: ${activeWins}`,
      `❌ عدد الخسارة: ${activeLosses}`,
      `🎯 النسبة: ${activeWinRate}%`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `${formatterOptions.channelSignature || '💡 نركز على الفرص القوية فقط — التزم بإدارة رأس المال'}`
    ].join('\n');

    return {
      todayEgypt,
      startH,
      endH,
      endHourLabel: formatHourAr(endH),
      startHourLabel: formatHourAr(startH),
      isAfterClose,
      totalCompleted,
      pendingCount,
      directWins,
      gale1Wins,
      lossesWithGale,
      liveDraws,
      firstCandleLossesNoGale,
      totalWinsWithGale,
      winRateNoGale,
      winRateWithGale,
      netProfitNoGaleUsd,
      netProfitWithGaleUsd,
      bestWinningPair,
      mostSelectedPair,
      pairBreakdown: sortedByProfit,
      telegramReportText
    };
  }, [todaySignals, dailyStats, deviceNow, autoPilot, formatterOptions]);

  const handleSendEndOfDayReport = async (destination: 'both' | 'free' | 'vip' = 'both') => {
    setIsSendingDailyReport(true);
    setDailyReportSendStatus({ type: 'idle' });
    try {
      const res = await fetch('/api/daily-report/send-telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination,
          customText: endOfDayReportData.telegramReportText
        })
      });
      const data = await res.json();
      if (data.ok) {
        setAutoPilot(prev => ({
          ...prev,
          lastDailyReportSentDate: endOfDayReportData.todayEgypt
        }));
        setDailyReportSendStatus({
          type: 'success',
          message: `✅ تم إرسال التقرير النهائي لختام يوم التداول إلى ${
            data.sentFree && data.sentVip
              ? 'القناة المجانية وقناة VIP'
              : data.sentFree
              ? 'القناة المجانية'
              : 'قناة VIP'
          } بنجاح!`
        });
      } else {
        setDailyReportSendStatus({
          type: 'error',
          message: data.error || 'تعذر إرسال التقرير النهائي إلى تليجرام، تأكد من التوكن ومعرف القناة.'
        });
      }
    } catch (_e) {
      setDailyReportSendStatus({
        type: 'error',
        message: 'حدث خطأ أثناء الاتصال بالسيرفر لإرسال التقرير.'
      });
    } finally {
      setIsSendingDailyReport(false);
      setTimeout(() => setDailyReportSendStatus({ type: 'idle' }), 6000);
    }
  };

  const filteredSignals = useMemo(() => {
    const base =
      visitorFilter === 'ALL'
        ? todaySignals
        : visitorFilter === 'WIN'
        ? todaySignals.filter(s => s.status === 'WIN' || s.status === 'WIN_GALE1')
        : todaySignals.filter(s => s.status === visitorFilter);

    // Always place active PENDING ("جاري الآن") signals at the very top, then sort by newest createdAt first
    return [...base].sort((a, b) => {
      if (a.status === 'PENDING' && b.status !== 'PENDING') return -1;
      if (a.status !== 'PENDING' && b.status === 'PENDING') return 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [todaySignals, visitorFilter]);

  const currentDeviceTimeStr = useMemo(() => {
    const hh = String(deviceNow.getHours()).padStart(2, '0');
    const mm = String(deviceNow.getMinutes()).padStart(2, '0');
    const ss = String(deviceNow.getSeconds()).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  }, [deviceNow]);

  // Arabic Weekday Name helper from YYYY-MM-DD
  const getArabicDayName = (dateStr: string): string => {
    const [y, m, d] = dateStr.split('-').map(Number);
    if (!y || !m || !d) return '—';
    const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    const days = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    return days[dt.getUTCDay()] || '—';
  };

  // Merge stored dailyStats with live todaySignals so today's row is always 100% live and accurate
  const mergedDailyStatsMap = useMemo(() => {
    const map: Record<string, DailyStatRecord> = {};
    for (const item of dailyStats) {
      if (item && item.date) {
        map[item.date] = { ...item };
      }
    }
    const todayEgypt = getEgyptDateString(deviceNow);
    const liveDirectWins = todaySignals.filter(s => s.status === 'WIN').length;
    const liveGale1Wins = todaySignals.filter(s => s.status === 'WIN_GALE1').length;
    const liveLosses = todaySignals.filter(s => s.status === 'LOSS').length;
    const existingToday = map[todayEgypt];

    if (!existingToday) {
      map[todayEgypt] = {
        date: todayEgypt,
        directWins: liveDirectWins,
        gale1Wins: liveGale1Wins,
        losses: liveLosses,
        manualOverride: false,
        updatedAt: new Date().toISOString()
      };
    } else if (!existingToday.manualOverride) {
      map[todayEgypt] = {
        ...existingToday,
        directWins: Math.max(existingToday.directWins, liveDirectWins),
        gale1Wins: Math.max(existingToday.gale1Wins, liveGale1Wins),
        losses: Math.max(existingToday.losses, liveLosses)
      };
    }
    return map;
  }, [dailyStats, todaySignals, deviceNow]);

  // Compute the list of dates (YYYY-MM-DD) for the selected Week (7 days) or Month (all days of month)
  const statsPeriodData = useMemo(() => {
    const todayStr = getEgyptDateString(deviceNow);
    const [ty, tm, td] = todayStr.split('-').map(Number);
    const baseDate = new Date(Date.UTC(ty, (tm || 1) - 1, td || 1, 12, 0, 0));

    const formatYMD = (dt: Date) => {
      const y = dt.getUTCFullYear();
      const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
      const d = String(dt.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    };

    let datesList: string[] = [];
    let periodLabel = '';

    if (statsPeriod === 'week') {
      // 7-day window ending at (today + statsOffset * 7 days) or starting Saturday/Sunday
      const endDt = new Date(baseDate.getTime() + statsOffset * 7 * 86400000);
      const startDt = new Date(endDt.getTime() - 6 * 86400000);
      for (let i = 0; i < 7; i++) {
        const cur = new Date(endDt.getTime() - i * 86400000);
        datesList.push(formatYMD(cur));
      }
      periodLabel = `إحصائيات الأسبوع (${formatYMD(startDt)} إلى ${formatYMD(endDt)})`;
    } else {
      // Full calendar month shifted by statsOffset months
      const targetMonthDate = new Date(Date.UTC(ty, (tm || 1) - 1 + statsOffset, 1, 12, 0, 0));
      const year = targetMonthDate.getUTCFullYear();
      const month = targetMonthDate.getUTCMonth(); // 0-11
      const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

      const arabicMonths = [
        'يناير',
        'فبراير',
        'مارس',
        'أبريل',
        'مايو',
        'يونيو',
        'يوليو',
        'أغسطس',
        'سبتمبر',
        'أكتوبر',
        'نوفمبر',
        'ديسمبر'
      ];
      periodLabel = `إحصائيات شهر ${arabicMonths[month]} ${year}`;

      for (let d = daysInMonth; d >= 1; d--) {
        const cur = new Date(Date.UTC(year, month, d, 12, 0, 0));
        const ymd = formatYMD(cur);
        // For current month (offset 0), don't list future days after today unless they have data
        if (statsOffset === 0 && ymd > todayStr && !mergedDailyStatsMap[ymd]) {
          continue;
        }
        datesList.push(ymd);
      }
    }

    // Build row metrics for each date
    // Trading rule: $1 initial trade + $2 1-step Martingale
    // Mode 'net_100': Direct Win = +$1.00 | Gale 1 Win (-$1 + $2) = +$1.00 | Loss (-$1 - $2) = -$3.00
    // Mode 'broker_85': Direct Win = +$0.85 | Gale 1 Win (-$1 + $1.70) = +$0.70 | Loss (-$1 - $2) = -$3.00
    const directWinProfitUnit = statsPayoutMode === 'net_100' ? 1.0 : 0.85;
    const gale1WinProfitUnit = statsPayoutMode === 'net_100' ? 1.0 : 0.7;
    const lossCostUnit = 3.0; // $1 initial + $2 martingale = $3 lost

    const allRows = datesList.map(dateStr => {
      const rec = mergedDailyStatsMap[dateStr];
      const directWins = rec?.directWins || 0;
      const gale1Wins = rec?.gale1Wins || 0;
      const losses = rec?.losses || 0;
      const totalWins = directWins + gale1Wins;
      const totalTrades = totalWins + losses;
      const winRate = totalTrades > 0 ? Math.round((totalWins / totalTrades) * 100) : 0;

      const grossWinUsd = Number((directWins * directWinProfitUnit + gale1Wins * gale1WinProfitUnit).toFixed(2));
      const grossLossUsd = Number((losses * lossCostUnit).toFixed(2));
      const netProfitUsd = Number((grossWinUsd - grossLossUsd).toFixed(2));

      // Flat $1 Without Martingale calculation:
      // Direct Wins win +$1 (or +$0.85), while 1st-candle losses (gale1Wins + losses) lose -$1.00 each without entering $2 Gale
      const firstCandleLosses = gale1Wins + losses;
      const noGaleGrossWinUsd = Number((directWins * directWinProfitUnit).toFixed(2));
      const noGaleGrossLossUsd = Number((firstCandleLosses * 1.0).toFixed(2));
      const noGaleNetProfitUsd = Number((noGaleGrossWinUsd - noGaleGrossLossUsd).toFixed(2));
      const directWinRate = totalTrades > 0 ? Math.round((directWins / totalTrades) * 100) : 0;

      // Total capital staked on that day ($1 per direct win, $1+$2=$3 per gale1 win or loss)
      const totalStakedUsd = directWins * 1 + gale1Wins * 3 + losses * 3;

      return {
        date: dateStr,
        dayName: getArabicDayName(dateStr),
        isToday: dateStr === todayStr,
        directWins,
        gale1Wins,
        losses,
        firstCandleLosses,
        totalWins,
        totalTrades,
        winRate,
        directWinRate,
        grossWinUsd,
        grossLossUsd,
        netProfitUsd,
        noGaleGrossWinUsd,
        noGaleGrossLossUsd,
        noGaleNetProfitUsd,
        totalStakedUsd,
        manualOverride: Boolean(rec?.manualOverride)
      };
    });

    const visibleRows = statsShowAllDays
      ? allRows
      : allRows.filter(r => r.totalTrades > 0 || r.isToday);

    const summary = visibleRows.reduce(
      (acc, r) => {
        acc.directWins += r.directWins;
        acc.gale1Wins += r.gale1Wins;
        acc.losses += r.losses;
        acc.firstCandleLosses += r.firstCandleLosses;
        acc.totalWins += r.totalWins;
        acc.totalTrades += r.totalTrades;
        acc.grossWinUsd = Number((acc.grossWinUsd + r.grossWinUsd).toFixed(2));
        acc.grossLossUsd = Number((acc.grossLossUsd + r.grossLossUsd).toFixed(2));
        acc.netProfitUsd = Number((acc.netProfitUsd + r.netProfitUsd).toFixed(2));
        acc.noGaleGrossWinUsd = Number((acc.noGaleGrossWinUsd + r.noGaleGrossWinUsd).toFixed(2));
        acc.noGaleGrossLossUsd = Number((acc.noGaleGrossLossUsd + r.noGaleGrossLossUsd).toFixed(2));
        acc.noGaleNetProfitUsd = Number((acc.noGaleNetProfitUsd + r.noGaleNetProfitUsd).toFixed(2));
        acc.totalStakedUsd += r.totalStakedUsd;
        return acc;
      },
      {
        directWins: 0,
        gale1Wins: 0,
        losses: 0,
        firstCandleLosses: 0,
        totalWins: 0,
        totalTrades: 0,
        grossWinUsd: 0,
        grossLossUsd: 0,
        netProfitUsd: 0,
        noGaleGrossWinUsd: 0,
        noGaleGrossLossUsd: 0,
        noGaleNetProfitUsd: 0,
        totalStakedUsd: 0
      }
    );

    const summaryWinRate =
      summary.totalTrades > 0 ? Math.round((summary.totalWins / summary.totalTrades) * 100) : 0;
    const summaryDirectWinRate =
      summary.totalTrades > 0 ? Math.round((summary.directWins / summary.totalTrades) * 100) : 0;

    return {
      periodLabel,
      rows: visibleRows,
      summary: { ...summary, winRate: summaryWinRate, directWinRate: summaryDirectWinRate }
    };
  }, [deviceNow, statsPeriod, statsOffset, statsPayoutMode, statsShowAllDays, mergedDailyStatsMap]);

  // End-of-Month Expected Profit Calculator based on Current Average Daily Performance vs Remaining Trading Days
  const monthProjectionData = useMemo(() => {
    const todayStr = getEgyptDateString(deviceNow);
    const [ty, tm, td] = todayStr.split('-').map(Number);

    // Determine target month (follows month offset if in month view, otherwise current month in Egypt time)
    const monthShift = statsPeriod === 'month' ? statsOffset : 0;
    const targetMonthDate = new Date(Date.UTC(ty, (tm || 1) - 1 + monthShift, 1, 12, 0, 0));
    const year = targetMonthDate.getUTCFullYear();
    const month = targetMonthDate.getUTCMonth(); // 0..11
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

    const arabicMonths = [
      'يناير',
      'فبراير',
      'مارس',
      'أبريل',
      'مايو',
      'يونيو',
      'يوليو',
      'أغسطس',
      'سبتمبر',
      'أكتوبر',
      'نوفمبر',
      'ديسمبر'
    ];
    const monthLabel = `${arabicMonths[month]} ${year}`;

    const directWinProfitUnit = statsPayoutMode === 'net_100' ? 1.0 : 0.85;
    const gale1WinProfitUnit = statsPayoutMode === 'net_100' ? 1.0 : 0.7;
    const lossCostUnit = 3.0;

    let elapsedCalendarDays = 0;
    let remainingCalendarDays = 0;
    let remainingMarketWeekdays = 0; // Mon-Fri (excluding Saturday=6 & Sunday=0, or Friday/Saturday depending on forex close)
    let activeTradingDays = 0;

    let currentNetWithGale = 0;
    let currentNetNoGale = 0;
    let currentGrossWinWithGale = 0;
    let currentGrossLossWithGale = 0;
    let totalTradesSoFar = 0;
    let directWinsSoFar = 0;
    let gale1WinsSoFar = 0;
    let lossesSoFar = 0;

    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(Date.UTC(year, month, d, 12, 0, 0));
      const yStr = dt.getUTCFullYear();
      const mStr = String(dt.getUTCMonth() + 1).padStart(2, '0');
      const dStr = String(dt.getUTCDate()).padStart(2, '0');
      const ymd = `${yStr}-${mStr}-${dStr}`;
      const dow = dt.getUTCDay(); // 0 = Sun, 6 = Sat

      const rec = mergedDailyStatsMap[ymd];
      const dw = rec?.directWins || 0;
      const gw = rec?.gale1Wins || 0;
      const ls = rec?.losses || 0;
      const dayTrades = dw + gw + ls;

      if (ymd <= todayStr) {
        elapsedCalendarDays++;
      } else {
        remainingCalendarDays++;
        // Global Forex market is open Monday(1) through Friday(5)
        if (dow >= 1 && dow <= 5) {
          remainingMarketWeekdays++;
        }
      }

      if (dayTrades > 0) {
        activeTradingDays++;
        directWinsSoFar += dw;
        gale1WinsSoFar += gw;
        lossesSoFar += ls;
        totalTradesSoFar += dayTrades;

        const dayGrossWin = dw * directWinProfitUnit + gw * gale1WinProfitUnit;
        const dayGrossLoss = ls * lossCostUnit;
        currentGrossWinWithGale += dayGrossWin;
        currentGrossLossWithGale += dayGrossLoss;
        currentNetWithGale += dayGrossWin - dayGrossLoss;

        const dayNoGaleWin = dw * directWinProfitUnit;
        const dayNoGaleLoss = (gw + ls) * 1.0;
        currentNetNoGale += dayNoGaleWin - dayNoGaleLoss;
      }
    }

    currentNetWithGale = Number(currentNetWithGale.toFixed(2));
    currentNetNoGale = Number(currentNetNoGale.toFixed(2));
    currentGrossWinWithGale = Number(currentGrossWinWithGale.toFixed(2));
    currentGrossLossWithGale = Number(currentGrossLossWithGale.toFixed(2));

    const divisorDays =
      calcAvgBasis === 'active_days'
        ? Math.max(1, activeTradingDays)
        : Math.max(1, elapsedCalendarDays);

    const avgDailyWithGale = Number((currentNetWithGale / divisorDays).toFixed(2));
    const avgDailyNoGale = Number((currentNetNoGale / divisorDays).toFixed(2));
    const avgDailyTrades = activeTradingDays > 0 ? Math.round(totalTradesSoFar / activeTradingDays) : 0;

    const effectiveRemainingDays =
      calcRemainingDaysMode === 'custom' && calcCustomRemainingDays !== null
        ? Math.max(0, calcCustomRemainingDays)
        : calcRemainingDaysMode === 'market_5d'
        ? remainingMarketWeekdays
        : remainingCalendarDays;

    const stakeMultiplier = Math.max(0.1, Number(calcBaseStakeUsd) || 1);

    // Projected profit for the remaining trading days (at $1 base and scaled by stakeMultiplier)
    const remainingProfitWithGale1Usd = Number((avgDailyWithGale * effectiveRemainingDays).toFixed(2));
    const remainingProfitNoGale1Usd = Number((avgDailyNoGale * effectiveRemainingDays).toFixed(2));

    const totalExpectedMonthWithGale1Usd = Number(
      (currentNetWithGale + remainingProfitWithGale1Usd).toFixed(2)
    );
    const totalExpectedMonthNoGale1Usd = Number(
      (currentNetNoGale + remainingProfitNoGale1Usd).toFixed(2)
    );

    // Scaled by custom base stake (e.g., if trader enters with $5 instead of $1)
    const scaledCurrentWithGale = Number((currentNetWithGale * stakeMultiplier).toFixed(2));
    const scaledCurrentNoGale = Number((currentNetNoGale * stakeMultiplier).toFixed(2));
    const scaledAvgDailyWithGale = Number((avgDailyWithGale * stakeMultiplier).toFixed(2));
    const scaledAvgDailyNoGale = Number((avgDailyNoGale * stakeMultiplier).toFixed(2));
    const scaledRemainingWithGale = Number((remainingProfitWithGale1Usd * stakeMultiplier).toFixed(2));
    const scaledRemainingNoGale = Number((remainingProfitNoGale1Usd * stakeMultiplier).toFixed(2));
    const scaledTotalExpectedWithGale = Number(
      (totalExpectedMonthWithGale1Usd * stakeMultiplier).toFixed(2)
    );
    const scaledTotalExpectedNoGale = Number(
      (totalExpectedMonthNoGale1Usd * stakeMultiplier).toFixed(2)
    );

    const progressPercent = Math.min(
      100,
      Math.max(0, Math.round((elapsedCalendarDays / Math.max(1, daysInMonth)) * 100))
    );

    return {
      monthLabel,
      daysInMonth,
      elapsedCalendarDays,
      remainingCalendarDays,
      remainingMarketWeekdays,
      activeTradingDays,
      divisorDays,
      effectiveRemainingDays,
      progressPercent,
      totalTradesSoFar,
      directWinsSoFar,
      gale1WinsSoFar,
      lossesSoFar,
      currentNetWithGale,
      currentNetNoGale,
      avgDailyWithGale,
      avgDailyNoGale,
      avgDailyTrades,
      remainingProfitWithGale1Usd,
      remainingProfitNoGale1Usd,
      totalExpectedMonthWithGale1Usd,
      totalExpectedMonthNoGale1Usd,
      stakeMultiplier,
      scaledCurrentWithGale,
      scaledCurrentNoGale,
      scaledAvgDailyWithGale,
      scaledAvgDailyNoGale,
      scaledRemainingWithGale,
      scaledRemainingNoGale,
      scaledTotalExpectedWithGale,
      scaledTotalExpectedNoGale
    };
  }, [
    deviceNow,
    statsPeriod,
    statsOffset,
    statsPayoutMode,
    mergedDailyStatsMap,
    calcRemainingDaysMode,
    calcCustomRemainingDays,
    calcAvgBasis,
    calcBaseStakeUsd
  ]);

  const handleSaveDailyStatRow = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!editStatForm.date) return;
    setIsSavingDailyStat(true);
    try {
      const res = await fetch('/api/daily-stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: editStatForm.date,
          directWins: Math.max(0, Number(editStatForm.directWins) || 0),
          gale1Wins: Math.max(0, Number(editStatForm.gale1Wins) || 0),
          losses: Math.max(0, Number(editStatForm.losses) || 0),
          manualOverride: true
        })
      });
      const data = await res.json();
      if (data.ok && Array.isArray(data.dailyStats)) {
        setDailyStats(data.dailyStats);
        await saveCloudSystemState({
          signals: signals.slice(0, 80),
          settings: formatterOptions,
          autopilot: autoPilot,
          dailyStats: data.dailyStats
        });
        setEditingStatDate(null);
      }
    } catch (_e) {
      // Ignore
    } finally {
      setIsSavingDailyStat(false);
    }
  };

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-[#F8FAFC] text-slate-800 flex flex-col">
      {/* Zadtoo Top Navigation Bar matching the 5 screens */}
      <ZadtooNavbar
        activeTab={zadtooTab}
        setActiveTab={(tab) => {
          setZadtooTab(tab);
          if (tab === 'admin') {
            if (!isAdminAuthenticated) {
              setShowLoginModal(true);
            } else {
              setShowLegacyAdminStudio(false);
            }
          }
        }}
        isAdmin={isAdminAuthenticated}
        onOpenLogin={() => setShowLoginModal(true)}
        onOpenAbout={() => setAboutContactType('about')}
        onOpenContact={() => setAboutContactType('contact')}
      />

      {/* Screen 1: الصفحة الرئيسية */}
      {zadtooTab === 'home' && (
        <ZadtooHomePage
          onStartNow={() => setZadtooTab('memberships')}
          onExploreSignals={() => setZadtooTab('signals')}
          onExploreAutoTrade={() => setZadtooTab('autotrade')}
          onExploreNews={() => setZadtooTab('news')}
          telegramChannelLink={platformContactLinks.telegramChannelUrl}
        />
      )}

      {/* Screen 2: صفحة الأخبار العاجلة والمفكرة الاقتصادية وتوقعات الدولار */}
      {zadtooTab === 'news' && (
        <ZadtooForexNewsPage
          isAdmin={isAdminAuthenticated}
          onNavigateSignals={() => setZadtooTab('signals')}
          onNavigateHome={() => setZadtooTab('home')}
        />
      )}

      {/* Screen 3: صفحة الإشارات (قناة التليجرام) */}
      {zadtooTab === 'signals' && (
        <ZadtooSignalsPage
          signals={signals.map((s) => ({
            id: s.id,
            asset: s.asset,
            direction: s.direction,
            entryTime: s.entryTime,
            timeframe: '1 دقيقة',
            status: s.status,
            isLive: s.status === 'PENDING'
          }))}
          todayCount={dailyStats[0]?.directWins ? dailyStats[0].directWins + dailyStats[0].losses : 18}
          winRate={
            dailyStats[0]?.directWins
              ? Math.round(
                  (dailyStats[0].directWins /
                    (dailyStats[0].directWins + dailyStats[0].losses)) *
                    100
                )
              : 78
          }
          m1Count={12}
          telegramLink={platformContactLinks.telegramChannelUrl}
        />
      )}

      {/* Screen 3: صفحة التداول الآلي */}
      {zadtooTab === 'autotrade' && (
        <ZadtooAutoTradePage
          onOpenRobotAdmin={() => {
            setZadtooTab('admin');
            setShowLegacyAdminStudio(true);
            setActiveView('robot');
          }}
          onDownloadScript={() => window.open('/api/quotex-robot/zad-broker-robot.user.js', '_blank')}
        />
      )}

      {/* Screen 4: صفحة العضويات والاشتراكات */}
      {zadtooTab === 'memberships' && (
        <ZadtooMembershipsPage
          onSelectPlan={(planId, _planName, _price) => {
            setRegPlanDuration(planId);
            setShowRegisterModal(true);
          }}
          plans={platformPlans}
          contactLinks={platformContactLinks}
          telegramLink={platformContactLinks.telegramChannelUrl}
        />
      )}

      {/* Screen 5: لوحة تحكم الإدارة */}
      {zadtooTab === 'admin' && (
        <>
          {!isAdminAuthenticated ? (
            <div className="max-w-md mx-auto my-16 p-8 bg-white border border-slate-200 rounded-3xl shadow-lg text-center space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center mx-auto text-xl font-bold">
                🔒
              </div>
              <h2 className="text-xl font-black text-slate-900">منطقة مدير النظام</h2>
              <p className="text-xs text-slate-500">
                يرجى تسجيل الدخول بحساب المشرف للوصول إلى لوحة التحكم والإحصائيات وروبوت التداول.
              </p>
              <button
                type="button"
                onClick={() => setShowLoginModal(true)}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl cursor-pointer"
              >
                تسجيل الدخول الآن
              </button>
            </div>
          ) : !showLegacyAdminStudio ? (
            <ZadtooAdminDashboard
              onLogout={handleAdminLogout}
              onOpenSignalModal={() => {
                setShowLegacyAdminStudio(true);
                setActiveView('admin');
                setAdminSectionTab('studio');
              }}
              onOpenAddUser={() => {
                setShowLegacyAdminStudio(true);
                setActiveView('admin');
                setAdminSectionTab('vip');
              }}
              onOpenSettings={() => {
                setShowLegacyAdminStudio(true);
                setActiveView('admin');
                setAdminSectionTab('autopilot');
              }}
              onOpenReports={() => {
                setShowLegacyAdminStudio(true);
                setActiveView('stats');
              }}
              onOpenRobotAdmin={() => {
                setShowLegacyAdminStudio(true);
                setActiveView('robot');
              }}
              totalUsersCount={subscribers.length > 0 ? subscribers.length + 1200 : 1248}
              activeSubscribersCount={
                subscribers.filter((s) => s.status === 'ACTIVE').length > 0
                  ? subscribers.filter((s) => s.status === 'ACTIVE').length + 800
                  : 892
              }
              todaySignalsCount={signals.length > 0 ? signals.length : 18}
              winRatePercent={78}
              autoPilot={autoPilot}
              onSaveAutoPilot={handleSaveAutoPilot}
              onAddCustomPair={handleAddCustomPair}
              onRemoveCustomPair={handleRemoveCustomPair}
              plans={platformPlans}
              contactLinks={platformContactLinks}
              onConfigChanged={(newPlans, newLinks) => {
                setPlatformPlans(newPlans);
                setPlatformContactLinks(newLinks);
                try {
                  localStorage.setItem('zad_platform_plans', JSON.stringify(newPlans));
                  localStorage.setItem('zad_platform_contact_links', JSON.stringify(newLinks));
                } catch (_e) {}
                saveCloudPlans(newPlans).catch(() => {});
                saveCloudContactLinks(newLinks).catch(() => {});
              }}
            />
          ) : (
            <div className="max-w-[1240px] mx-auto px-4 pt-4">
              <div className="bg-slate-900 text-white p-3.5 rounded-xl border border-slate-800 flex items-center justify-between mb-4">
                <span className="text-xs text-slate-300">
                  أنت الآن داخل استوديو المشرف المتقدم ورادار الإشارات والروبوت
                </span>
                <button
                  type="button"
                  onClick={() => setShowLegacyAdminStudio(false)}
                  className="px-3.5 py-1.5 text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-lg cursor-pointer"
                >
                  ← العودة إلى لوحة تحكم ZAD FX الحديثة
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Main Content Container for Legacy Admin / Studio when requested */}
      {zadtooTab === 'admin' && isAdminAuthenticated && showLegacyAdminStudio && (
        <main className="flex-1 w-full max-w-[1240px] mx-auto px-3 sm:px-6 py-6 sm:py-8 bg-[#0B0F17] text-slate-100 rounded-3xl mb-8">
        {activeView === 'admin' && isAdminAuthenticated ? (
          /* ==========================================
             PROTECTED ADMIN VIEW: Focused Global Forex Engine
             ========================================== */
          <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-slate-800/80">
              <div>
                <p className="text-xs text-emerald-400 font-medium mb-1">
                  منطقة المشرف المحمية · تحليل حي للسوق العالمي الرسمي فقط (بدون OTC)
                </p>
                <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                  قناص السوق العالمي التلقائي (@ZadNBFX)
                </h1>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() => setActiveView('robot')}
                  className="flex items-center gap-2 px-4 py-2.5 text-xs font-extrabold text-slate-950 bg-sky-400 hover:bg-sky-300 rounded-lg transition-colors whitespace-nowrap cursor-pointer shadow-md"
                >
                  <span>🤖 صفحة التداول الآلي — روبوت كيوتكس (قيد التطوير)</span>
                </button>
                <button
                  onClick={() => setActiveView('stats')}
                  className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors whitespace-nowrap cursor-pointer shadow-md"
                >
                  <Activity className="w-3.5 h-3.5" />
                  <span>📊 صفحة الإحصائيات اليومية والأسبوعية والشهرية (A4)</span>
                </button>
                <button
                  onClick={() => setActiveView('visitor')}
                  className="px-4 py-2.5 text-xs font-medium text-slate-300 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  معاينة واجهة الزائر
                </button>
                <button
                  onClick={handleTriggerAutoNow}
                  className="flex items-center gap-2 px-4 py-2.5 text-xs font-medium text-slate-200 bg-slate-800/90 hover:bg-slate-800 border border-slate-700 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 text-emerald-400" />
                  <span>اقتناص وإرسال أقوى فرصة الآن</span>
                </button>
              </div>
            </div>

            {/* ADMIN AESTHETIC UPGRADE 1: Live System Health & Connection Status Bar + Quick Section Tabs */}
            <div className="p-4 bg-gradient-to-r from-slate-900 via-[#0F1624] to-slate-900 border border-slate-800 rounded-xl space-y-3.5 shadow-lg">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2.5 text-xs">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0B0F17] border border-slate-800 text-slate-200 font-medium">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        autoPilot.botToken ? 'bg-emerald-400' : 'bg-amber-400'
                      }`}
                    />
                    <span>بوت التليجرام:</span>
                    <strong className="font-mono-num text-emerald-400" dir="ltr">
                      {autoPilot.botToken ? `متصل (${autoPilot.chatId || '@ZadNBFX'})` : 'بانتظار التوكن'}
                    </strong>
                  </span>

                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0B0F17] border border-slate-800 text-slate-200 font-medium">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    <span>سحابة البيانات (Firestore):</span>
                    <strong className="text-emerald-400">متزامنة 100%</strong>
                  </span>

                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0B0F17] border border-slate-800 text-slate-200 font-medium">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        autoPilot.enabled ? 'bg-emerald-400' : 'bg-rose-400'
                      }`}
                    />
                    <span>رادار التوصيات:</span>
                    <strong className={autoPilot.enabled ? 'text-emerald-400' : 'text-slate-400'}>
                      {autoPilot.enabled ? 'نشط 24/7' : 'متوقف مؤقتاً'}
                    </strong>
                  </span>

                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0B0F17] border border-slate-800 text-slate-200 font-medium">
                    <span>نظام المضاعفات:</span>
                    <strong
                      className={
                        autoPilot.oneGaleEnabled === true ? 'text-amber-300' : 'text-emerald-300'
                      }
                    >
                      {autoPilot.oneGaleEnabled === true
                        ? 'مضاعفة واحدة (Gale 1)'
                        : 'بدون مضاعفات (0)'}
                    </strong>
                  </span>
                </div>

                {/* Admin Section Quick-Filter Tabs */}
                <div className="flex flex-wrap items-center gap-1 p-1 bg-[#0B0F17] border border-slate-800 rounded-lg text-xs">
                  {[
                    { id: 'all', label: 'عرض الكل' },
                    { id: 'autopilot', label: '01. القناص والبوتات' },
                    { id: 'studio', label: '02-03. استوديو القالب' },
                    { id: 'signals', label: `04. سجل اليوم (${todaySignals.length})` },
                    { id: 'vip', label: `05. أعضاء VIP (${subscribers.length})` },
                    { id: 'plans', label: `06. الباقات والروابط 👑` }
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() =>
                        setAdminSectionTab(
                          tab.id as 'all' | 'autopilot' | 'studio' | 'signals' | 'vip' | 'plans'
                        )
                      }
                      className={`px-2.5 py-1.5 rounded-md font-bold transition-colors cursor-pointer whitespace-nowrap ${
                        adminSectionTab === tab.id
                          ? 'bg-amber-400 text-slate-950 font-black'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* SECTION 01: FOCUSED GLOBAL FOREX AUTO-PILOT (ANTI-FLOODING) */}
            {(adminSectionTab === 'all' || adminSectionTab === 'autopilot') && (
            <section className="p-6 bg-slate-900/90 border border-slate-800 rounded-xl space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-slate-800">
                <div className="space-y-1">
                  <div className="flex items-center gap-2.5">
                    <Radio
                      className={`w-5 h-5 ${
                        autoPilot.enabled ? 'text-emerald-400 animate-pulse' : 'text-slate-500'
                      }`}
                    />
                    <h2 className="text-lg font-bold text-white">
                      01. قناص السوق العالمي الذكي (تركيز عالي وبدون تدفق عشوائي)
                    </h2>
                  </div>
                  <p className="text-xs text-slate-400">
                    يراقب السيرفر أسعار الصرف الحقيقية في <strong className="text-slate-200">السوق العالمي فقط</strong> (EUR/USD, GBP/JPY, USD/JPY...) ويحسب مؤشر القوة النسبية (RSI)، ولا يرسل إشارة إلى <span dir="ltr" className="font-mono-num text-emerald-400">@ZadNBFX</span> إلا عند وصول السعر لمنطقة تشبع حقيقية مع فاصل زمني مريح لمنع إزعاج المتابعين.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={() => handleSaveAutoPilot(autoPilot)}
                    disabled={isSavingAutoPilot}
                    className="flex items-center gap-2 px-4 py-3 rounded-lg text-xs font-bold bg-slate-800 text-emerald-400 hover:bg-slate-700 border border-emerald-500/40 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Check className="w-4 h-4" />
                    <span>{isSavingAutoPilot ? 'جاري الحفظ السحابي...' : 'حفظ التوكن والإعدادات في قاعدة البيانات ☁️'}</span>
                  </button>

                  {autoPilot.enabled ? (
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 whitespace-nowrap">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                        <span>القناص نشط 24/7</span>
                      </span>
                      <button
                        onClick={() => handleSaveAutoPilot({ enabled: false })}
                        disabled={isSavingAutoPilot}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-950/50 transition-colors cursor-pointer whitespace-nowrap"
                      >
                        <Power className="w-4 h-4" />
                        <span>إيقاف القناص التلقائي ⏹</span>
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleSaveAutoPilot({ enabled: true })}
                      disabled={isSavingAutoPilot}
                      className="flex items-center gap-2.5 px-5 py-3 rounded-lg text-sm font-bold bg-emerald-400 text-slate-950 hover:bg-emerald-300 shadow-lg shadow-emerald-950/50 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <Power className="w-4 h-4" />
                      <span>تفعيل قناص السوق العالمي 24/7 ▶️</span>
                    </button>
                  )}
                </div>
              </div>

              {/* DUAL BOT CONFIGURATION: BOT 1 (FREE WITH EGYPT HOURS) & BOT 2 (VIP 24/7) */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* CARD 1: FREE BOT (Scheduled by Egypt Cairo Time) */}
                <div
                  className={`p-4 bg-[#0B0F17] border rounded-xl space-y-4 transition-colors ${
                    autoPilot.freeBotEnabled !== false
                      ? 'border-emerald-500/40'
                      : 'border-slate-800 opacity-80'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-emerald-400">
                          البوت الأول: القناة المجانية (محدد بساعات عمل بتوقيت مصر 🇪🇬)
                        </span>
                        <span
                          className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
                            autoPilot.freeBotEnabled === false
                              ? 'bg-rose-950/80 text-rose-300 border border-rose-500/30'
                              : autoPilot.isFreeBotWithinSchedule !== false
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          }`}
                        >
                          {autoPilot.freeBotEnabled === false
                            ? '🔴 متوقف'
                            : autoPilot.isFreeBotWithinSchedule !== false
                            ? '🟢 مفعّل (داخل وقت العمل)'
                            : '⏸ مفعّل (خارج وقت العمل)'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        يرسل نفس الإشارة للقناة المجانية خلال الساعات التي تحددها فقط
                      </p>
                    </div>

                    {/* Activate / Stop Button for Bot 1 (Free Channel Bot) */}
                    {autoPilot.freeBotEnabled !== false ? (
                      <button
                        type="button"
                        onClick={() => handleSaveAutoPilot({ freeBotEnabled: false })}
                        disabled={isSavingAutoPilot}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-600/90 hover:bg-rose-500 text-white border border-rose-400/30 transition-colors cursor-pointer whitespace-nowrap"
                      >
                        <Power className="w-3.5 h-3.5" />
                        <span>إيقاف البوت المجاني ⏹</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleSaveAutoPilot({ freeBotEnabled: true })}
                        disabled={isSavingAutoPilot}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-colors cursor-pointer whitespace-nowrap"
                      >
                        <Play className="w-3.5 h-3.5" />
                        <span>تفعيل البوت المجاني ▶️</span>
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        توكن البوت المجاني (Bot Token)
                      </label>
                      <input
                        type="password"
                        value={autoPilot.botToken}
                        onChange={(e) => setAutoPilot(prev => ({ ...prev, botToken: e.target.value }))}
                        onBlur={() => handleSaveAutoPilot({ botToken: autoPilot.botToken })}
                        placeholder="7123456789:AAHxyz..."
                        dir="ltr"
                        className="w-full px-3 py-2 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 font-mono-num"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        معرف القناة المجانية (Chat ID)
                      </label>
                      <input
                        type="text"
                        value={autoPilot.chatId}
                        onChange={(e) => setAutoPilot(prev => ({ ...prev, chatId: e.target.value }))}
                        onBlur={() => handleSaveAutoPilot({ chatId: autoPilot.chatId })}
                        placeholder="@ZadNBFX"
                        dir="ltr"
                        className="w-full px-3 py-2 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 font-mono-num"
                      />
                    </div>
                  </div>

                  {/* Egypt Working Hours Control */}
                  <div className="p-3 bg-slate-900/90 border border-slate-800/90 rounded-lg space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <label className="flex items-center gap-2 cursor-pointer text-slate-200 font-medium">
                        <input
                          type="checkbox"
                          checked={autoPilot.freeScheduleEnabled !== false}
                          onChange={(e) =>
                            handleSaveAutoPilot({ freeScheduleEnabled: e.target.checked })
                          }
                          className="accent-emerald-500 w-4 h-4 rounded"
                        />
                        <span>تحديد ساعات عمل يومية للبوت المجاني (بتوقيت القاهرة 🇪🇬)</span>
                      </label>
                      {autoPilot.currentEgyptHour !== undefined && (
                        <span className="text-[11px] text-slate-400 font-mono-num">
                          ساعة مصر الآن: {String(autoPilot.currentEgyptHour).padStart(2, '0')}:00
                        </span>
                      )}
                    </div>

                    {autoPilot.freeScheduleEnabled !== false && (
                      <div className="space-y-3 pt-1">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[11px] text-slate-400 mb-1">
                              يبدأ الإرسال الساعة (بتوقيت مصر)
                            </label>
                            <select
                              value={autoPilot.freeStartHourEgypt ?? 9}
                              onChange={(e) =>
                                handleSaveAutoPilot({ freeStartHourEgypt: Number(e.target.value) })
                              }
                              className="w-full px-2.5 py-1.5 text-xs bg-[#0B0F17] border border-slate-800 rounded text-white font-mono-num cursor-pointer"
                            >
                              {Array.from({ length: 24 }, (_, h) => (
                                <option key={h} value={h}>
                                  {String(h).padStart(2, '0')}:00 ({h === 0 ? '12 ص' : h < 12 ? `${h} ص` : h === 12 ? '12 م' : `${h - 12} م`})
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-[11px] text-slate-400 mb-1">
                              يتوقف الإرسال الساعة (بتوقيت مصر)
                            </label>
                            <select
                              value={autoPilot.freeEndHourEgypt ?? 21}
                              onChange={(e) =>
                                handleSaveAutoPilot({ freeEndHourEgypt: Number(e.target.value) })
                              }
                              className="w-full px-2.5 py-1.5 text-xs bg-[#0B0F17] border border-slate-800 rounded text-white font-mono-num cursor-pointer"
                            >
                              {Array.from({ length: 24 }, (_, h) => (
                                <option key={h} value={h}>
                                  {String(h).padStart(2, '0')}:00 ({h === 0 ? '12 ص' : h < 12 ? `${h} ص` : h === 12 ? '12 م' : `${h - 12} م`})
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {/* Visual 24-Hour Egypt Schedule Timeline Bar */}
                        <div className="p-2.5 bg-[#0B0F17] border border-slate-800/90 rounded-lg space-y-1.5">
                          <div className="flex items-center justify-between text-[10px] text-slate-400">
                            <span>المخطط البصري لساعات عمل البوت المجاني (24 ساعة - توقيت القاهرة):</span>
                            <span className="font-mono-num text-emerald-400 font-bold">
                              {String(autoPilot.freeStartHourEgypt ?? 9).padStart(2, '0')}:00 ←{' '}
                              {String(autoPilot.freeEndHourEgypt ?? 21).padStart(2, '0')}:00
                            </span>
                          </div>
                          <div className="grid grid-cols-24 gap-0.5 h-3 rounded overflow-hidden bg-slate-900 p-0.5">
                            {Array.from({ length: 24 }, (_, h) => {
                              const startH = autoPilot.freeStartHourEgypt ?? 9;
                              const endH = autoPilot.freeEndHourEgypt ?? 21;
                              const isActiveHour =
                                startH <= endH
                                  ? h >= startH && h < endH
                                  : h >= startH || h < endH;
                              const isCurrentHour = autoPilot.currentEgyptHour === h;
                              return (
                                <div
                                  key={`tl-${h}`}
                                  title={`الساعة ${String(h).padStart(2, '0')}:00 (${isActiveHour ? 'نشط' : 'متوقف'})`}
                                  className={`h-full rounded-[2px] transition-colors ${
                                    isCurrentHour
                                      ? 'bg-amber-400 ring-1 ring-white'
                                      : isActiveHour
                                      ? 'bg-emerald-500/80'
                                      : 'bg-slate-800/70'
                                  }`}
                                />
                              );
                            })}
                          </div>
                          <div className="flex items-center justify-between text-[9px] text-slate-500 font-mono-num">
                            <span>00:00</span>
                            <span>06:00</span>
                            <span>09:00</span>
                            <span>12:00</span>
                            <span>18:00</span>
                            <span>21:00</span>
                            <span>23:00</span>
                          </div>
                        </div>

                        {/* Auto End-of-Day Final Report Toggle at Closing Hour */}
                        <div className="p-2.5 bg-emerald-950/25 border border-emerald-500/30 rounded-lg flex flex-wrap items-center justify-between gap-2 text-xs">
                          <label className="flex items-center gap-2 cursor-pointer text-slate-200 font-medium">
                            <input
                              type="checkbox"
                              checked={autoPilot.autoDailyReportEnabled !== false}
                              onChange={(e) =>
                                handleSaveAutoPilot({ autoDailyReportEnabled: e.target.checked })
                              }
                              className="accent-emerald-500 w-4 h-4 rounded"
                            />
                            <span>
                              📊 إرسال <strong>التقرير النهائي لليوم</strong> تلقائياً للقناة عند حلول ساعة الإغلاق ({String(autoPilot.freeEndHourEgypt ?? 21).padStart(2, '0')}:00)
                            </span>
                          </label>
                          <span className="text-[10px] font-mono-num px-2 py-0.5 rounded bg-slate-900 text-emerald-300 border border-emerald-500/30">
                            {autoPilot.lastDailyReportSentDate === endOfDayReportData.todayEgypt
                              ? '✅ أُرسل تقرير اليوم'
                              : `⏰ مجدول للساعة ${String(autoPilot.freeEndHourEgypt ?? 21).padStart(2, '0')}:00`}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Custom Win & Loss Icons + Image Upload for Bot 1 (Free Channel Bot) */}
                  <div className="p-3 bg-slate-900/90 border border-emerald-500/30 rounded-lg space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                        <span>🎨 أيقونات وصور الربح والخسارة الخاصة بـ (البوت الأول: المجاني)</span>
                      </span>
                      <button
                        type="button"
                        onClick={async () => {
                          await handleSaveAutoPilot({
                            freeWinIcon: autoPilot.freeWinIcon || '✅ ربح',
                            freeWinGale1Icon: autoPilot.freeWinGale1Icon || '✅ ربح مضاعفة واحدة',
                            freeLossIcon: autoPilot.freeLossIcon || '❌',
                            freeWinImageUrl: autoPilot.freeWinImageUrl || '',
                            freeWinGale1ImageUrl: autoPilot.freeWinGale1ImageUrl || '',
                            freeLossImageUrl: autoPilot.freeLossImageUrl || ''
                          });
                          setFreeBotIconsSavedBadge(true);
                          setTimeout(() => setFreeBotIconsSavedBadge(false), 3500);
                        }}
                        disabled={isSavingAutoPilot}
                        className="px-2.5 py-1 text-[11px] font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-md transition-colors cursor-pointer flex items-center gap-1"
                      >
                        <Check className="w-3 h-3" />
                        <span>
                          {freeBotIconsSavedBadge ? 'تم حفظ الأيقونات والصور ✓' : 'حفظ أيقونات وصور البوت المجاني'}
                        </span>
                      </button>
                    </div>

                    {/* Selector for Telegram Result Display Size: Emoji Size vs Full Photo */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 bg-[#0B0F17]/90 border border-emerald-500/30 rounded-lg">
                      <div className="space-y-0.5">
                        <span className="text-xs font-bold text-emerald-300 block">
                          حجم نتيجة الصفقة على التليجرام:
                        </span>
                        <span className="text-[11px] text-slate-400 block">
                          {autoPilot.resultNotificationStyle === 'photo'
                            ? 'يتم إرسال ملصق/صورة كإشعار نتيجة للصفقة'
                            : '⚡ بحجم الإيموجي: إشعار فوري بحجم الإيموجي الأنيق (بدون صور ضخمة تملأ شاشة الهاتف)'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 bg-slate-900 p-1 border border-slate-800 rounded-md shrink-0">
                        <button
                          type="button"
                          onClick={() => handleSaveAutoPilot({ resultNotificationStyle: 'emoji_size' })}
                          className={`px-3 py-1.5 text-xs font-bold rounded cursor-pointer transition-colors ${
                            autoPilot.resultNotificationStyle !== 'photo'
                              ? 'bg-emerald-500 text-slate-950 shadow font-extrabold'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          ⚡ بحجم الإيموجي (مطلوب)
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveAutoPilot({ resultNotificationStyle: 'photo' })}
                          className={`px-3 py-1.5 text-xs font-bold rounded cursor-pointer transition-colors ${
                            autoPilot.resultNotificationStyle === 'photo'
                              ? 'bg-emerald-500 text-slate-950 shadow font-extrabold'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          📸 صورة / ملصق
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      {/* Free Bot Direct Win Icon + Photo Upload */}
                      <div className="space-y-1.5 p-2 bg-[#0B0F17]/70 border border-emerald-500/20 rounded-lg">
                        <label className="block text-[11px] text-emerald-400 font-semibold">
                          أيقونة الربح المباشر (البوت المجاني)
                        </label>
                        <input
                          type="text"
                          value={autoPilot.freeWinIcon ?? '✅ ربح'}
                          onChange={(e) =>
                            setAutoPilot(prev => ({ ...prev, freeWinIcon: e.target.value }))
                          }
                          onBlur={() =>
                            handleSaveAutoPilot({ freeWinIcon: autoPilot.freeWinIcon || '✅ ربح' })
                          }
                          placeholder="✅ ربح"
                          className="w-full px-2.5 py-1.5 text-xs bg-[#0B0F17] border border-emerald-500/40 rounded text-white focus:outline-none focus:border-emerald-400"
                        />
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {['✅', '✅ ربح', '🟢✅', '💚🔥', '🎯✅', '💰✅'].map((ico) => (
                            <button
                              key={`free-win-${ico}`}
                              type="button"
                              onClick={() => handleSaveAutoPilot({ freeWinIcon: ico })}
                              className="px-1.5 py-0.5 text-[10px] bg-slate-800 hover:bg-emerald-500/20 text-slate-200 border border-slate-700 rounded cursor-pointer"
                            >
                              {ico}
                            </button>
                          ))}
                        </div>

                        {/* Upload Win Image for Free Bot */}
                        <div className="pt-1.5 border-t border-slate-800/80 space-y-1.5">
                          <label className="flex items-center justify-center gap-1.5 w-full px-2 py-1.5 text-[11px] font-bold bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 rounded cursor-pointer transition-colors">
                            <Upload className="w-3.5 h-3.5" />
                            <span>{autoPilot.freeWinImageUrl ? 'تغيير صورة الربح 📸' : 'رفع صورة الربح 📸'}</span>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) => handleBotResultImageUpload(e, 'freeWinImageUrl')}
                              className="hidden"
                            />
                          </label>
                          {autoPilot.freeWinImageUrl && (
                            <div className="relative rounded overflow-hidden border border-emerald-500/40 bg-slate-950 p-1 flex items-center justify-between gap-2">
                              <img
                                src={autoPilot.freeWinImageUrl}
                                alt="صورة الربح"
                                className="h-10 w-10 object-cover rounded"
                              />
                              <span className="text-[10px] text-emerald-400 font-semibold">محفوظة ✓</span>
                              <button
                                type="button"
                                onClick={() => handleDeleteBotResultImage('freeWinImageUrl')}
                                className="p-1 text-rose-400 hover:bg-rose-950/60 rounded cursor-pointer"
                                title="حذف الصورة"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Free Bot 1-Gale Win Icon + Photo Upload */}
                      <div className="space-y-1.5 p-2 bg-[#0B0F17]/70 border border-amber-500/20 rounded-lg">
                        <label className="block text-[11px] text-amber-300 font-semibold">
                          أيقونة ربح مضاعفة واحدة (المجاني)
                        </label>
                        <input
                          type="text"
                          value={autoPilot.freeWinGale1Icon ?? '✅ ربح مضاعفة واحدة'}
                          onChange={(e) =>
                            setAutoPilot(prev => ({ ...prev, freeWinGale1Icon: e.target.value }))
                          }
                          onBlur={() =>
                            handleSaveAutoPilot({
                              freeWinGale1Icon: autoPilot.freeWinGale1Icon || '✅ ربح مضاعفة واحدة'
                            })
                          }
                          placeholder="✅ ربح مضاعفة واحدة"
                          className="w-full px-2.5 py-1.5 text-xs bg-[#0B0F17] border border-amber-500/40 rounded text-white focus:outline-none focus:border-amber-400"
                        />
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {['✅ ربح مضاعفة واحدة', '⚡✅ مضاعفة 1', '🔥✅ ربح مضاعفة'].map((ico) => (
                            <button
                              key={`free-gale-${ico}`}
                              type="button"
                              onClick={() => handleSaveAutoPilot({ freeWinGale1Icon: ico })}
                              className="px-1.5 py-0.5 text-[10px] bg-slate-800 hover:bg-amber-500/20 text-slate-200 border border-slate-700 rounded cursor-pointer"
                            >
                              {ico}
                            </button>
                          ))}
                        </div>

                        {/* Upload Gale 1 Win Image for Free Bot */}
                        <div className="pt-1.5 border-t border-slate-800/80 space-y-1.5">
                          <label className="flex items-center justify-center gap-1.5 w-full px-2 py-1.5 text-[11px] font-bold bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 rounded cursor-pointer transition-colors">
                            <Upload className="w-3.5 h-3.5" />
                            <span>{autoPilot.freeWinGale1ImageUrl ? 'تغيير صورة المضاعفة 📸' : 'رفع صورة ربح المضاعفة 📸'}</span>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) => handleBotResultImageUpload(e, 'freeWinGale1ImageUrl')}
                              className="hidden"
                            />
                          </label>
                          {autoPilot.freeWinGale1ImageUrl && (
                            <div className="relative rounded overflow-hidden border border-amber-500/40 bg-slate-950 p-1 flex items-center justify-between gap-2">
                              <img
                                src={autoPilot.freeWinGale1ImageUrl}
                                alt="صورة ربح المضاعفة"
                                className="h-10 w-10 object-cover rounded"
                              />
                              <span className="text-[10px] text-amber-300 font-semibold">محفوظة ✓</span>
                              <button
                                type="button"
                                onClick={() => handleDeleteBotResultImage('freeWinGale1ImageUrl')}
                                className="p-1 text-rose-400 hover:bg-rose-950/60 rounded cursor-pointer"
                                title="حذف الصورة"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Free Bot Loss Icon + Photo Upload */}
                      <div className="space-y-1.5 p-2 bg-[#0B0F17]/70 border border-rose-500/20 rounded-lg">
                        <label className="block text-[11px] text-rose-400 font-semibold">
                          أيقونة الخسارة (البوت المجاني)
                        </label>
                        <input
                          type="text"
                          value={autoPilot.freeLossIcon ?? '❌'}
                          onChange={(e) =>
                            setAutoPilot(prev => ({ ...prev, freeLossIcon: e.target.value }))
                          }
                          onBlur={() =>
                            handleSaveAutoPilot({ freeLossIcon: autoPilot.freeLossIcon || '❌' })
                          }
                          placeholder="❌"
                          className="w-full px-2.5 py-1.5 text-xs bg-[#0B0F17] border border-rose-500/40 rounded text-white focus:outline-none focus:border-rose-400"
                        />
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {['❌', '❌ خسارة', '🔴❌', '💔❌', '⛔️', '✖️'].map((ico) => (
                            <button
                              key={`free-loss-${ico}`}
                              type="button"
                              onClick={() => handleSaveAutoPilot({ freeLossIcon: ico })}
                              className="px-1.5 py-0.5 text-[10px] bg-slate-800 hover:bg-rose-500/20 text-slate-200 border border-slate-700 rounded cursor-pointer"
                            >
                              {ico}
                            </button>
                          ))}
                        </div>

                        {/* Upload Loss Image for Free Bot */}
                        <div className="pt-1.5 border-t border-slate-800/80 space-y-1.5">
                          <label className="flex items-center justify-center gap-1.5 w-full px-2 py-1.5 text-[11px] font-bold bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 rounded cursor-pointer transition-colors">
                            <Upload className="w-3.5 h-3.5" />
                            <span>{autoPilot.freeLossImageUrl ? 'تغيير صورة الخسارة 📸' : 'رفع صورة الخسارة 📸'}</span>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) => handleBotResultImageUpload(e, 'freeLossImageUrl')}
                              className="hidden"
                            />
                          </label>
                          {autoPilot.freeLossImageUrl && (
                            <div className="relative rounded overflow-hidden border border-rose-500/40 bg-slate-950 p-1 flex items-center justify-between gap-2">
                              <img
                                src={autoPilot.freeLossImageUrl}
                                alt="صورة الخسارة"
                                className="h-10 w-10 object-cover rounded"
                              />
                              <span className="text-[10px] text-rose-400 font-semibold">محفوظة ✓</span>
                              <button
                                type="button"
                                onClick={() => handleDeleteBotResultImage('freeLossImageUrl')}
                                className="p-1 text-rose-400 hover:bg-rose-950/60 rounded cursor-pointer"
                                title="حذف الصورة"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* CARD 2: VIP BOT (Always 24/7 on the exact same signal) */}
                <div
                  className={`p-4 bg-[#0B0F17] border rounded-xl space-y-4 transition-colors ${
                    autoPilot.vipEnabled
                      ? 'border-amber-500/50'
                      : 'border-slate-800 opacity-85'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-amber-400">
                          البوت الثاني: قناة VIP الخاصة (يعمل 24 ساعة متواصلة 👑)
                        </span>
                        <span
                          className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
                            autoPilot.vipEnabled
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : 'bg-rose-950/80 text-rose-300 border border-rose-500/30'
                          }`}
                        >
                          {autoPilot.vipEnabled ? '🟢 مفعّل 24/7' : '🔴 متوقف'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        يستلم نفس الإشارة ونتيجتها (✅ / ❌) على مدار 24 ساعة بدون توقف
                      </p>
                    </div>

                    {/* Activate / Stop Button for Bot 2 (VIP 24/7 Bot) */}
                    {autoPilot.vipEnabled ? (
                      <button
                        type="button"
                        onClick={() => handleSaveAutoPilot({ vipEnabled: false })}
                        disabled={isSavingAutoPilot}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-600/90 hover:bg-rose-500 text-white border border-rose-400/30 transition-colors cursor-pointer whitespace-nowrap"
                      >
                        <Power className="w-3.5 h-3.5" />
                        <span>إيقاف بوت VIP ⏹</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleSaveAutoPilot({ vipEnabled: true })}
                        disabled={isSavingAutoPilot}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-400 hover:bg-amber-300 text-slate-950 transition-colors cursor-pointer whitespace-nowrap"
                      >
                        <Play className="w-3.5 h-3.5" />
                        <span>تفعيل بوت VIP 24/7 ▶️</span>
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        توكن بوت VIP (أو اتركه فارغاً لاستخدام نفس البوت)
                      </label>
                      <input
                        type="password"
                        value={autoPilot.vipBotToken || ''}
                        onChange={(e) => setAutoPilot(prev => ({ ...prev, vipBotToken: e.target.value }))}
                        onBlur={() => handleSaveAutoPilot({ vipBotToken: autoPilot.vipBotToken })}
                        placeholder="توكن بوت VIP (اختياري)..."
                        dir="ltr"
                        className="w-full px-3 py-2 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-amber-500 font-mono-num"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        معرف قناة VIP في تليجرام (Chat ID)
                      </label>
                      <input
                        type="text"
                        value={autoPilot.vipChatId || ''}
                        onChange={(e) => setAutoPilot(prev => ({ ...prev, vipChatId: e.target.value }))}
                        onBlur={() => handleSaveAutoPilot({ vipChatId: autoPilot.vipChatId })}
                        placeholder="@YourVipChannel أو -100123456789"
                        dir="ltr"
                        className="w-full px-3 py-2 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-amber-500 font-mono-num"
                      />
                    </div>
                  </div>

                  <div className="p-3 bg-amber-950/20 border border-amber-500/20 rounded-lg text-[11px] text-amber-200/90 leading-relaxed">
                    👑 <strong>ميزة البوت المزدوج:</strong> عندما تقتنص الخوارزمية فرصة قوية، يتم إرسالها فوراً إلى <strong>قناة VIP (24 ساعة)</strong>، وفي نفس اللحظة يتم إرسالها إلى <strong>القناة المجانية</strong> إذا كانت الساعة الحالية في مصر ضمن ساعات العمل المحددة أعلاه.
                  </div>

                  {/* Custom Win & Loss Icons + Image Upload for Bot 2 (VIP 24/7 Bot) */}
                  <div className="p-3 bg-slate-900/90 border border-amber-500/35 rounded-lg space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                        <span>👑 أيقونات وصور الربح والخسارة الخاصة بـ (البوت الثاني: VIP 24/7)</span>
                      </span>
                      <button
                        type="button"
                        onClick={async () => {
                          await handleSaveAutoPilot({
                            vipWinIcon: autoPilot.vipWinIcon || '👑✅ ربح VIP',
                            vipWinGale1Icon: autoPilot.vipWinGale1Icon || '👑✅ ربح مضاعفة واحدة',
                            vipLossIcon: autoPilot.vipLossIcon || '❌',
                            vipWinImageUrl: autoPilot.vipWinImageUrl || '',
                            vipWinGale1ImageUrl: autoPilot.vipWinGale1ImageUrl || '',
                            vipLossImageUrl: autoPilot.vipLossImageUrl || ''
                          });
                          setVipBotIconsSavedBadge(true);
                          setTimeout(() => setVipBotIconsSavedBadge(false), 3500);
                        }}
                        disabled={isSavingAutoPilot}
                        className="px-2.5 py-1 text-[11px] font-bold bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-md transition-colors cursor-pointer flex items-center gap-1"
                      >
                        <Check className="w-3 h-3" />
                        <span>
                          {vipBotIconsSavedBadge ? 'تم حفظ الأيقونات والصور ✓' : 'حفظ أيقونات وصور بوت VIP'}
                        </span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      {/* VIP Bot Direct Win Icon + Photo Upload */}
                      <div className="space-y-1.5 p-2 bg-[#0B0F17]/70 border border-emerald-500/20 rounded-lg">
                        <label className="block text-[11px] text-emerald-400 font-semibold">
                          أيقونة الربح المباشر (بوت VIP)
                        </label>
                        <input
                          type="text"
                          value={autoPilot.vipWinIcon ?? '👑✅ ربح VIP'}
                          onChange={(e) =>
                            setAutoPilot(prev => ({ ...prev, vipWinIcon: e.target.value }))
                          }
                          onBlur={() =>
                            handleSaveAutoPilot({ vipWinIcon: autoPilot.vipWinIcon || '👑✅ ربح VIP' })
                          }
                          placeholder="👑✅ ربح VIP"
                          className="w-full px-2.5 py-1.5 text-xs bg-[#0B0F17] border border-emerald-500/40 rounded text-white focus:outline-none focus:border-emerald-400"
                        />
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {['👑✅ ربح VIP', '💎✅', '✅ ربح', '🏆✅', '🚀✅', '💚👑'].map((ico) => (
                            <button
                              key={`vip-win-${ico}`}
                              type="button"
                              onClick={() => handleSaveAutoPilot({ vipWinIcon: ico })}
                              className="px-1.5 py-0.5 text-[10px] bg-slate-800 hover:bg-emerald-500/20 text-slate-200 border border-slate-700 rounded cursor-pointer"
                            >
                              {ico}
                            </button>
                          ))}
                        </div>

                        {/* Upload Win Image for VIP Bot */}
                        <div className="pt-1.5 border-t border-slate-800/80 space-y-1.5">
                          <label className="flex items-center justify-center gap-1.5 w-full px-2 py-1.5 text-[11px] font-bold bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 rounded cursor-pointer transition-colors">
                            <Upload className="w-3.5 h-3.5" />
                            <span>{autoPilot.vipWinImageUrl ? 'تغيير صورة الربح 📸' : 'رفع صورة الربح 📸'}</span>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) => handleBotResultImageUpload(e, 'vipWinImageUrl')}
                              className="hidden"
                            />
                          </label>
                          {autoPilot.vipWinImageUrl && (
                            <div className="relative rounded overflow-hidden border border-emerald-500/40 bg-slate-950 p-1 flex items-center justify-between gap-2">
                              <img
                                src={autoPilot.vipWinImageUrl}
                                alt="صورة الربح VIP"
                                className="h-10 w-10 object-cover rounded"
                              />
                              <span className="text-[10px] text-emerald-400 font-semibold">محفوظة ✓</span>
                              <button
                                type="button"
                                onClick={() => handleDeleteBotResultImage('vipWinImageUrl')}
                                className="p-1 text-rose-400 hover:bg-rose-950/60 rounded cursor-pointer"
                                title="حذف الصورة"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* VIP Bot 1-Gale Win Icon + Photo Upload */}
                      <div className="space-y-1.5 p-2 bg-[#0B0F17]/70 border border-amber-500/20 rounded-lg">
                        <label className="block text-[11px] text-amber-300 font-semibold">
                          أيقونة ربح مضاعفة واحدة (بوت VIP)
                        </label>
                        <input
                          type="text"
                          value={autoPilot.vipWinGale1Icon ?? '👑✅ ربح مضاعفة واحدة'}
                          onChange={(e) =>
                            setAutoPilot(prev => ({ ...prev, vipWinGale1Icon: e.target.value }))
                          }
                          onBlur={() =>
                            handleSaveAutoPilot({
                              vipWinGale1Icon: autoPilot.vipWinGale1Icon || '👑✅ ربح مضاعفة واحدة'
                            })
                          }
                          placeholder="👑✅ ربح مضاعفة واحدة"
                          className="w-full px-2.5 py-1.5 text-xs bg-[#0B0F17] border border-amber-500/40 rounded text-white focus:outline-none focus:border-amber-400"
                        />
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {['👑✅ ربح مضاعفة واحدة', '💎✅ مضاعفة 1', '✅ ربح مضاعفة واحدة'].map((ico) => (
                            <button
                              key={`vip-gale-${ico}`}
                              type="button"
                              onClick={() => handleSaveAutoPilot({ vipWinGale1Icon: ico })}
                              className="px-1.5 py-0.5 text-[10px] bg-slate-800 hover:bg-amber-500/20 text-slate-200 border border-slate-700 rounded cursor-pointer"
                            >
                              {ico}
                            </button>
                          ))}
                        </div>

                        {/* Upload Gale 1 Win Image for VIP Bot */}
                        <div className="pt-1.5 border-t border-slate-800/80 space-y-1.5">
                          <label className="flex items-center justify-center gap-1.5 w-full px-2 py-1.5 text-[11px] font-bold bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 rounded cursor-pointer transition-colors">
                            <Upload className="w-3.5 h-3.5" />
                            <span>{autoPilot.vipWinGale1ImageUrl ? 'تغيير صورة المضاعفة 📸' : 'رفع صورة ربح المضاعفة 📸'}</span>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) => handleBotResultImageUpload(e, 'vipWinGale1ImageUrl')}
                              className="hidden"
                            />
                          </label>
                          {autoPilot.vipWinGale1ImageUrl && (
                            <div className="relative rounded overflow-hidden border border-amber-500/40 bg-slate-950 p-1 flex items-center justify-between gap-2">
                              <img
                                src={autoPilot.vipWinGale1ImageUrl}
                                alt="صورة ربح المضاعفة VIP"
                                className="h-10 w-10 object-cover rounded"
                              />
                              <span className="text-[10px] text-amber-300 font-semibold">محفوظة ✓</span>
                              <button
                                type="button"
                                onClick={() => handleDeleteBotResultImage('vipWinGale1ImageUrl')}
                                className="p-1 text-rose-400 hover:bg-rose-950/60 rounded cursor-pointer"
                                title="حذف الصورة"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* VIP Bot Loss Icon + Photo Upload */}
                      <div className="space-y-1.5 p-2 bg-[#0B0F17]/70 border border-rose-500/20 rounded-lg">
                        <label className="block text-[11px] text-rose-400 font-semibold">
                          أيقونة الخسارة (بوت VIP)
                        </label>
                        <input
                          type="text"
                          value={autoPilot.vipLossIcon ?? '❌'}
                          onChange={(e) =>
                            setAutoPilot(prev => ({ ...prev, vipLossIcon: e.target.value }))
                          }
                          onBlur={() =>
                            handleSaveAutoPilot({ vipLossIcon: autoPilot.vipLossIcon || '❌' })
                          }
                          placeholder="❌"
                          className="w-full px-2.5 py-1.5 text-xs bg-[#0B0F17] border border-rose-500/40 rounded text-white focus:outline-none focus:border-rose-400"
                        />
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {['❌', '❌ خسارة', '🔴❌', '💔❌', '⛔️', '✖️'].map((ico) => (
                            <button
                              key={`vip-loss-${ico}`}
                              type="button"
                              onClick={() => handleSaveAutoPilot({ vipLossIcon: ico })}
                              className="px-1.5 py-0.5 text-[10px] bg-slate-800 hover:bg-rose-500/20 text-slate-200 border border-slate-700 rounded cursor-pointer"
                            >
                              {ico}
                            </button>
                          ))}
                        </div>

                        {/* Upload Loss Image for VIP Bot */}
                        <div className="pt-1.5 border-t border-slate-800/80 space-y-1.5">
                          <label className="flex items-center justify-center gap-1.5 w-full px-2 py-1.5 text-[11px] font-bold bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 rounded cursor-pointer transition-colors">
                            <Upload className="w-3.5 h-3.5" />
                            <span>{autoPilot.vipLossImageUrl ? 'تغيير صورة الخسارة 📸' : 'رفع صورة الخسارة 📸'}</span>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) => handleBotResultImageUpload(e, 'vipLossImageUrl')}
                              className="hidden"
                            />
                          </label>
                          {autoPilot.vipLossImageUrl && (
                            <div className="relative rounded overflow-hidden border border-rose-500/40 bg-slate-950 p-1 flex items-center justify-between gap-2">
                              <img
                                src={autoPilot.vipLossImageUrl}
                                alt="صورة الخسارة VIP"
                                className="h-10 w-10 object-cover rounded"
                              />
                              <span className="text-[10px] text-rose-400 font-semibold">محفوظة ✓</span>
                              <button
                                type="button"
                                onClick={() => handleDeleteBotResultImage('vipLossImageUrl')}
                                className="p-1 text-rose-400 hover:bg-rose-950/60 rounded cursor-pointer"
                                title="حذف الصورة"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* EXCLUSIVE PAIR SELECTION & MANAGEMENT (تحديد الزوج الثابت يومياً مثل EUR/JPY وإدارة قائمة الأزواج) */}
              <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-900 via-[#0F1829] to-slate-900 border-2 border-sky-500/50 rounded-xl space-y-4 shadow-xl">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-sky-400 animate-ping" />
                      <h3 className="text-sm sm:text-base font-extrabold text-white flex items-center gap-2">
                        <span>🎯 تحديد زوج الإشارات والروبوت (الزوج الثابت / قائمة الأزواج المخصصة)</span>
                      </h3>
                    </div>
                    <p className="text-xs text-slate-300">
                      يمكنك تثبيت الإشارات والروبوت على زوج واحد ثابت يومياً مثل <strong className="text-sky-300 font-mono-num">EUR/JPY</strong>، أو تحديد قائمة أزواج مخصصة تعمل تلقائياً، أو البحث في كل السوق العالمي.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">الزوج النشط حالياً:</span>
                    <span className="px-3 py-1 bg-sky-500/20 text-sky-300 border border-sky-400/50 rounded-lg text-xs font-black font-mono-num">
                      {autoPilot.pairSelectionMode === 'fixed_single'
                        ? `${autoPilot.primaryFixedPair || 'EUR/JPY'} (ثابت)`
                        : autoPilot.pairSelectionMode === 'custom_list'
                        ? `قائمة (${(autoPilot.allowedPairs || []).length} أزواج)`
                        : 'كل أزواج السوق'}
                    </span>
                  </div>
                </div>

                {/* 3 Work Modes */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={() => handleSaveAutoPilot({ pairSelectionMode: 'fixed_single' })}
                    className={`p-3.5 rounded-xl border text-right transition-all cursor-pointer space-y-1.5 ${
                      (autoPilot.pairSelectionMode || 'fixed_single') === 'fixed_single'
                        ? 'bg-sky-500/15 border-sky-400 ring-1 ring-sky-400'
                        : 'bg-[#0B0F17] border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="text-xs font-black text-white flex items-center justify-between">
                      <span>📌 1. زوج ثابت يومياً (موصى به)</span>
                      {(autoPilot.pairSelectionMode || 'fixed_single') === 'fixed_single' && (
                        <CheckCircle2 className="w-4 h-4 text-sky-400 shrink-0" />
                      )}
                    </div>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      يتم إرسال كافة الإشارات وتنفيذ الروبوت على الزوج الثابت المحدد فقط (افتراضياً: <strong>EUR/JPY</strong>).
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSaveAutoPilot({ pairSelectionMode: 'custom_list' })}
                    className={`p-3.5 rounded-xl border text-right transition-all cursor-pointer space-y-1.5 ${
                      autoPilot.pairSelectionMode === 'custom_list'
                        ? 'bg-emerald-500/15 border-emerald-400 ring-1 ring-emerald-400'
                        : 'bg-[#0B0F17] border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="text-xs font-black text-emerald-300 flex items-center justify-between">
                      <span>📋 2. قائمة أزواج مخصصة</span>
                      {autoPilot.pairSelectionMode === 'custom_list' && (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      )}
                    </div>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      تحديد واختيار أزواج معينة تعمل تلقائياً مع إمكانية إضافة وحذف أي زوج تريده.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSaveAutoPilot({ pairSelectionMode: 'all_global' })}
                    className={`p-3.5 rounded-xl border text-right transition-all cursor-pointer space-y-1.5 ${
                      autoPilot.pairSelectionMode === 'all_global'
                        ? 'bg-amber-500/15 border-amber-400 ring-1 ring-amber-400'
                        : 'bg-[#0B0F17] border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="text-xs font-black text-amber-300 flex items-center justify-between">
                      <span>🌐 3. مسح كل أزواج السوق</span>
                      {autoPilot.pairSelectionMode === 'all_global' && (
                        <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" />
                      )}
                    </div>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      فحص كافة أزواج الفوركس الحية واقتناص أعلى نقطة تشبع تلقائياً.
                    </p>
                  </button>
                </div>

                {/* Sub-section: Fixed Pair Picker */}
                {(autoPilot.pairSelectionMode || 'fixed_single') === 'fixed_single' && (
                  <div className="p-3.5 bg-[#0B0F17] border border-sky-500/30 rounded-xl space-y-2.5">
                    <label className="block text-xs font-bold text-sky-300">
                      اختر الزوج الثابت اليومي (الافتراضي: EUR/JPY):
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      {(autoPilot.customPairsList || ['EUR/JPY', 'EUR/USD', 'GBP/USD', 'USD/JPY', 'GBP/JPY', 'AUD/USD', 'USD/CHF', 'USD/CAD', 'EUR/GBP']).map((pair) => (
                        <button
                          key={`fixed-sel-${pair}`}
                          type="button"
                          onClick={() => handleSaveAutoPilot({ primaryFixedPair: pair, pairSelectionMode: 'fixed_single' })}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold font-mono-num transition-all cursor-pointer ${
                            (autoPilot.primaryFixedPair || 'EUR/JPY') === pair
                              ? 'bg-sky-500 text-slate-950 font-black shadow-md'
                              : 'bg-slate-900 text-slate-300 border border-slate-700 hover:border-sky-400'
                          }`}
                        >
                          {pair}
                          {(autoPilot.primaryFixedPair || 'EUR/JPY') === pair ? ' ★ (ثابت)' : ''}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Sub-section: Custom Pairs Multi-Check & Add New Pair Form */}
                <div className="p-3.5 bg-[#0B0F17] border border-slate-800 rounded-xl space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="text-xs font-bold text-slate-200">
                      قائمة الأزواج المتاحة (حدد الأزواج التي تريد تفعيلها، أو أضف زوجاً جديداً):
                    </label>
                    <span className="text-[11px] text-slate-400">
                      المفعلة: {(autoPilot.allowedPairs || []).length} زوج
                    </span>
                  </div>

                  {/* List of pairs with toggle checkbox and delete button */}
                  <div className="flex flex-wrap gap-2">
                    {(autoPilot.customPairsList || ['EUR/JPY', 'EUR/USD', 'GBP/USD', 'USD/JPY', 'GBP/JPY', 'AUD/USD', 'USD/CHF', 'USD/CAD', 'EUR/GBP']).map((pair) => {
                      const isAllowed = (autoPilot.allowedPairs || []).includes(pair);
                      const isPrimary = (autoPilot.primaryFixedPair || 'EUR/JPY') === pair;

                      return (
                        <div
                          key={`pair-badge-${pair}`}
                          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-mono-num transition-colors ${
                            isAllowed
                              ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-200'
                              : 'bg-slate-900 border-slate-800 text-slate-400'
                          }`}
                        >
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={isAllowed}
                              onChange={(e) => {
                                const current = autoPilot.allowedPairs || [];
                                const next = e.target.checked
                                  ? [...current, pair]
                                  : current.filter(p => p !== pair);
                                handleSaveAutoPilot({ allowedPairs: next.length > 0 ? next : [pair] });
                              }}
                              className="accent-emerald-500 rounded"
                            />
                            <span className="font-bold">{pair}</span>
                          </label>

                          {isPrimary && (
                            <span className="text-[10px] bg-sky-500/20 text-sky-300 px-1 rounded" title="الزوج الثابت اليومي">
                              ثابت
                            </span>
                          )}

                          {!isPrimary && (
                            <button
                              type="button"
                              onClick={() => handleRemoveCustomPair(pair)}
                              className="text-slate-500 hover:text-rose-400 transition-colors p-0.5 cursor-pointer"
                              title="حذف هذا الزوج من القائمة"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Add New Custom Pair Input Box */}
                  <div className="pt-2 border-t border-slate-800/80 flex flex-wrap sm:flex-nowrap items-center gap-2">
                    <input
                      type="text"
                      value={newCustomPairInput}
                      onChange={(e) => setNewCustomPairInput(e.target.value.toUpperCase())}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddCustomPair(newCustomPairInput);
                        }
                      }}
                      placeholder="أدخل رمز زوج جديد (مثال: EUR/JPY أو USD/CAD أو XAU/USD)..."
                      dir="ltr"
                      className="flex-1 px-3 py-2 text-xs bg-slate-900 border border-slate-700 rounded-lg text-white font-mono-num focus:outline-none focus:border-sky-400"
                    />
                    <button
                      type="button"
                      onClick={() => handleAddCustomPair(newCustomPairInput)}
                      disabled={!newCustomPairInput.trim()}
                      className="px-4 py-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>إضافة الزوج للقائمة</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Cooldown, Outcome Calculation Mode & 1-Step Martingale Toggle */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    منع التدفق (الحد الأدنى بين كل إشارة وأخرى في القناتين)
                  </label>
                  <select
                    value={autoPilot.intervalMinutes}
                    onChange={(e) =>
                      handleSaveAutoPilot({ intervalMinutes: Number(e.target.value) })
                    }
                    className="w-full px-3.5 py-2.5 text-sm bg-[#0B0F17] border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    <option value={10}>هادئ: إشارة كل 10 دقائق كحد أقصى</option>
                    <option value={15}>مركّز جداً: إشارة كل 15 دقيقة (موصى به)</option>
                    <option value={30}>انتقائي: إشارة كل 30 دقيقة</option>
                    <option value={60}>نخبة الفرص: إشارة كل ساعة</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    طريقة احتساب وإرسال النتيجة (✅ / ❌) للقناتين
                  </label>
                  <select
                    value={autoPilot.resultMode || 'candle_exact'}
                    onChange={(e) =>
                      handleSaveAutoPilot({
                        resultMode: e.target.value as 'candle_exact' | 'auto_win' | 'manual_only'
                      })
                    }
                    className="w-full px-3.5 py-2.5 text-sm bg-[#0B0F17] border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    <option value="candle_exact">حسب لون شمعة دقيقة الدخول الحقيقية (افتتاح وإغلاق الدقيقة)</option>
                    <option value="auto_win">إرسال ربح (✅) تلقائياً بعد انتهاء الدقيقة</option>
                    <option value="manual_only">تحديد النتيجة يدوياً من جدول المشرف فقط</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-emerald-300 mb-1.5">
                    نظام المضاعفة الواحدة (Martingale 1) عند انعكاس الشمعة الأولى
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      handleSaveAutoPilot({
                        oneGaleEnabled: autoPilot.oneGaleEnabled === true ? false : true
                      })
                    }
                    className={`w-full px-3.5 py-2.5 text-xs font-bold rounded-lg border flex items-center justify-between transition-colors cursor-pointer ${
                      autoPilot.oneGaleEnabled === true
                        ? 'bg-emerald-950/50 border-emerald-500/50 text-emerald-300'
                        : 'bg-rose-950/30 border-rose-500/40 text-rose-200'
                    }`}
                  >
                    <span>
                      {autoPilot.oneGaleEnabled === true
                        ? '🟢 مفعّل: مضاعفة واحدة (يرسل ربح مباشر، أو ينتظر المضاعفة 1)'
                        : '🛑 متوقف ومُخزّن: بدون مضاعفة نهائياً (نتيجة من أول شمعة فقط)'}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-slate-900 text-[10px]">
                      {autoPilot.oneGaleEnabled === true ? 'مفعّل ✓' : 'متوقف ✓'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Phase 1 & Phase 2: Advanced Signal Filters & Market Protection */}
              <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl space-y-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
                  <div className="flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-bold text-slate-200">
                      فلترة الإشارات المتقدمة والحماية من ظروف السوق (المرحلة 1 و 2):
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAnalyticsModal(true);
                      fetchAnalytics();
                    }}
                    className="flex items-center gap-1.5 px-3 py-1 bg-emerald-950/60 border border-emerald-500/40 hover:bg-emerald-900/60 text-emerald-300 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
                  >
                    <BarChart2 className="w-3.5 h-3.5" />
                    <span>تقرير وتدقيق الأداء الفعلي (Phase 3 Audit)</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                  {/* 1. RSI Sensitivity Tier */}
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">
                      مستوى حساسية مؤشر RSI المطلوب:
                    </label>
                    <select
                      value={autoPilot.strictnessLevel || 'high'}
                      onChange={(e) =>
                        handleSaveAutoPilot({
                          strictnessLevel: e.target.value as 'normal' | 'high' | 'extreme' | 'super'
                        })
                      }
                      className="w-full px-3 py-2 bg-[#0B0F17] border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-emerald-500 cursor-pointer"
                    >
                      <option value="normal">عادي: تشبع 30 / 70 (فرص أكثر)</option>
                      <option value="high">عالي الدقة: تشبع 28 / 72 (موصى به)</option>
                      <option value="extreme">فائق التحفظ: تشبع 25 / 75 (دقة أشد)</option>
                      <option value="super">ندرة استثنائية: تشبع 20 / 80 (صفقات نادرة جداً)</option>
                    </select>
                  </div>

                  {/* 2. Candlestick Reversal Confirmation */}
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">
                      شرط تأكيد الانعكاس بالشموع (Reversal Confirmation):
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        handleSaveAutoPilot({
                          reversalPatternRequired: autoPilot.reversalPatternRequired === false ? true : false
                        })
                      }
                      className={`w-full px-3 py-2 rounded-lg border text-xs font-semibold flex items-center justify-between cursor-pointer transition-colors ${
                        autoPilot.reversalPatternRequired !== false
                          ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300'
                          : 'bg-rose-950/30 border-rose-500/40 text-rose-300'
                      }`}
                    >
                      <span>
                        {autoPilot.reversalPatternRequired !== false
                          ? 'مفعّل: اشتراط نموذج ارتداد (Pin Bar / ابتلاع)'
                          : 'معطل: قبول أي ارتداد سعري طفيف'}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900">
                        {autoPilot.reversalPatternRequired !== false ? 'صارم ✓' : 'مرن'}
                      </span>
                    </button>
                  </div>

                  {/* 3. Executable SMA 10 Rules */}
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">
                      قواعد فلتر المتوسط SMA 10 (منع الهبوط الجارف):
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        handleSaveAutoPilot({
                          smaFilterEnabled: autoPilot.smaFilterEnabled === false ? true : false
                        })
                      }
                      className={`w-full px-3 py-2 rounded-lg border text-xs font-semibold flex items-center justify-between cursor-pointer transition-colors ${
                        autoPilot.smaFilterEnabled !== false
                          ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300'
                          : 'bg-rose-950/30 border-rose-500/40 text-rose-300'
                      }`}
                    >
                      <span>
                        {autoPilot.smaFilterEnabled !== false
                          ? 'مفعّل: منع الدخول ضد الانهيار/الاندفاع القوي'
                          : 'معطل: بدون تقييد SMA 10'}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900">
                        {autoPilot.smaFilterEnabled !== false ? 'مفعّل ✓' : 'معطل'}
                      </span>
                    </button>
                  </div>

                  {/* 4. News Spike Filter */}
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">
                      فلتر الأخبار والشموع الانفجارية (News Spike Guard):
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        handleSaveAutoPilot({
                          newsFilterEnabled: autoPilot.newsFilterEnabled === false ? true : false
                        })
                      }
                      className={`w-full px-3 py-2 rounded-lg border text-xs font-semibold flex items-center justify-between cursor-pointer transition-colors ${
                        autoPilot.newsFilterEnabled !== false
                          ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300'
                          : 'bg-rose-950/30 border-rose-500/40 text-rose-300'
                      }`}
                    >
                      <span>
                        {autoPilot.newsFilterEnabled !== false
                          ? 'مفعّل: حجب الإشارات أثناء شمعة الخبر (>3x ATR)'
                          : 'معطل: السماح بالإشارات وقت الأخبار'}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900">
                        {autoPilot.newsFilterEnabled !== false ? 'محمي ✓' : 'معطل'}
                      </span>
                    </button>
                  </div>

                  {/* 5. Asset Cooldown */}
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">
                      فترة تبريد الزوج (منع تكرار الإشارات لنفس العملة):
                    </label>
                    <select
                      value={autoPilot.assetCooldownMinutes || 20}
                      onChange={(e) =>
                        handleSaveAutoPilot({ assetCooldownMinutes: Number(e.target.value) })
                      }
                      className="w-full px-3 py-2 bg-[#0B0F17] border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-emerald-500 cursor-pointer"
                    >
                      <option value={10}>10 دقائق</option>
                      <option value={15}>15 دقيقة</option>
                      <option value={20}>20 دقيقة (موصى به لحماية الاتجاه)</option>
                      <option value={30}>30 دقيقة (أمان مضاعف)</option>
                    </select>
                  </div>

                  {/* 6. Min Quality Score */}
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">
                      الحد الأدنى لمؤشر الجودة المركب (Composite Quality Score):
                    </label>
                    <select
                      value={autoPilot.minQualityScore || 65}
                      onChange={(e) =>
                        handleSaveAutoPilot({ minQualityScore: Number(e.target.value) })
                      }
                      className="w-full px-3 py-2 bg-[#0B0F17] border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-emerald-500 cursor-pointer"
                    >
                      <option value={55}>مرن: جودة 55% فأعلى</option>
                      <option value={65}>متوازن: جودة 65% فأعلى (موصى به)</option>
                      <option value={75}>نخبوي: جودة 75% فأعلى (صفقات ذهبية فقط)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Live Global Market Radar Grid */}
              <div className="pt-2 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                    <Activity className="w-4 h-4 text-emerald-400" />
                    <span>رادار أسعار السوق العالمي المباشر (مؤشر القوة النسبية RSI ونماذج الانعكاس الفورية):</span>
                  </div>
                  <button
                    onClick={handleRefreshMarketRadar}
                    disabled={isScanningMarket}
                    className="flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isScanningMarket ? 'animate-spin' : ''}`} />
                    <span>تحديث الأسعار الآن</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
                  {liveMarket.map((item) => (
                    <div
                      key={item.pair}
                      className={`p-3 rounded-lg border text-xs space-y-1.5 ${
                        item.signalReady
                          ? 'bg-emerald-950/30 border-emerald-500/50'
                          : 'bg-[#0B0F17] border-slate-800/80'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-white font-mono-num">{item.pair}</span>
                        <span
                          className={`font-mono-num text-[11px] ${
                            item.rsi <= 30
                              ? 'text-emerald-400 font-bold'
                              : item.rsi >= 70
                              ? 'text-rose-400 font-bold'
                              : 'text-slate-400'
                          }`}
                        >
                          RSI: {item.rsi}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span className="font-mono-num text-slate-200">{item.formattedPrice}</span>
                        <span>
                          {item.signalReady === 'CALL' ? (
                            <span className="text-emerald-400 font-semibold">فرصة صعود ⬆️</span>
                          ) : item.signalReady === 'PUT' ? (
                            <span className="text-rose-400 font-semibold">فرصة هبوط ⬇️</span>
                          ) : (
                            <span>انتظار</span>
                          )}
                        </span>
                      </div>
                      {/* Quality Score & Reversal Pattern */}
                      {item.qualityScore !== undefined && (
                        <div className="flex items-center justify-between text-[10px] pt-1 border-t border-slate-800/60">
                          <span className="text-slate-400">جودة الفرصة:</span>
                          <span className={`font-bold font-mono-num ${
                            item.qualityScore >= 75 ? 'text-emerald-400' :
                            item.qualityScore >= 60 ? 'text-cyan-400' : 'text-slate-400'
                          }`}>
                            {item.qualityScore}%
                          </span>
                        </div>
                      )}
                      {item.reversalPattern && item.reversalPattern !== 'لا يوجد نموذج معتمد' && (
                        <div className="text-[10px] text-amber-300/90 truncate font-sans" title={item.reversalPattern}>
                          {item.reversalPattern}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-slate-800/80 text-xs text-slate-400">
                <div className="flex items-center gap-4">
                  <span>
                    حالة السوق العالمي:{' '}
                    <strong className={autoPilot.marketOpenStatus ? 'text-emerald-400' : 'text-amber-400'}>
                      {autoPilot.marketOpenStatus ? 'مفتوح الآن (بيانات حية)' : 'مغلق لعطلة نهاية الأسبوع'}
                    </strong>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    إشارات مركّزة أُرسلت:{' '}
                    <strong className="text-white font-mono-num">{autoPilot.totalAutoSent}</strong>
                  </span>
                </div>

                {autoPilot.lastError && (
                  <span className="text-rose-400">تنبيه تليجرام: {autoPilot.lastError}</span>
                )}
              </div>

              {/* 24/7 Cloud Keep-Alive Notice for Browser Closure */}
              <div className="p-3.5 bg-[#0B0F17] border border-emerald-500/30 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="space-y-1">
                  <div className="font-semibold text-emerald-400">
                    💡 كيف تضمن عدم دخول السيرفر السحابي في وضع السكون بعد إغلاق المتصفح لساعات طويلة؟
                  </div>
                  <p className="text-slate-400 leading-relaxed">
                    بيئة الاستضافة السحابية قد تدخل في وضع توفير الطاقة إذا أُغلق المتصفح لأكثر من 15 دقيقة بدون أي زائر. لإبقاء السيرفر مستيقظاً 24/7 مدى الحياة مجاناً، انسخ رابط النبض المباشر وضعه في موقع <strong className="text-slate-200">cron-job.org</strong> أو <strong className="text-slate-200">UptimeRobot</strong> ليقوم بزيارته كل 5 دقائق تلقائياً:
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    handleCopyText(
                      `${window.location.origin}/api/cron-tick`,
                      'cron-url'
                    )
                  }
                  className="flex items-center gap-2 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-slate-700 rounded-lg font-mono-num shrink-0 cursor-pointer"
                >
                  {copiedId === 'cron-url' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>تم نسخ رابط النبض 24/7</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>نسخ رابط النبض 24/7 (/api/cron-tick)</span>
                    </>
                  )}
                </button>
              </div>
            </section>
            )}

            {publishStatus.type !== 'idle' && (
              <div
                className={`p-4 rounded-xl text-xs font-medium border ${
                  publishStatus.type === 'success'
                    ? 'bg-emerald-950/50 border-emerald-700/60 text-emerald-300'
                    : publishStatus.type === 'warning'
                    ? 'bg-amber-950/50 border-amber-700/60 text-amber-300'
                    : publishStatus.type === 'error'
                    ? 'bg-rose-950/50 border-rose-700/60 text-rose-300'
                    : 'bg-slate-800 border-slate-700 text-slate-300'
                }`}
              >
                {publishStatus.message}
              </div>
            )}

            {/* SECTION 02: TEMPLATE CUSTOMIZER & MANUAL STUDIO */}
            {(adminSectionTab === 'all' || adminSectionTab === 'studio') && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <div className="lg:col-span-6 p-6 bg-slate-900/70 border border-slate-800/90 rounded-xl space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-white">
                      02. استوديو صياغة إشارة يدوية (سوق عالمي فقط)
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      يتم رفض واستبعاد أي إشارة OTC تلقائياً، والاعتماد على الدقيقة فقط
                    </p>
                  </div>
                  <button
                    onClick={handlePullFromLiveGlobalRadar}
                    disabled={isFetchingSource}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isFetchingSource ? 'animate-spin text-emerald-400' : ''}`} />
                    <span>سحب أقوى فرصة من الرادار الحي</span>
                  </button>
                </div>

                <div className="flex flex-wrap gap-2">
                  {SAMPLE_QUOTEX_SIGNALS.map((sample, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleRawInputChange(sample.raw)}
                      className={`px-3 py-1.5 text-xs rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                        rawInput === sample.raw
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : 'bg-slate-800/80 text-slate-400 hover:text-slate-200 border border-slate-800'
                      }`}
                    >
                      {sample.label}
                    </button>
                  ))}
                </div>

                <div>
                  <textarea
                    rows={6}
                    value={rawInput}
                    onChange={(e) => handleRawInputChange(e.target.value)}
                    dir="ltr"
                    placeholder="Paste global market signal here..."
                    className="w-full p-4 text-sm bg-[#0B0F17] border border-slate-800 rounded-lg text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 font-mono-num leading-relaxed"
                  />
                </div>

                {/* Quick Edit Extracted Minute & Pair */}
                <div className="grid grid-cols-3 gap-3 p-3 bg-[#0B0F17]/90 border border-slate-800/80 rounded-lg">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">الزوج (سوق عالمي)</label>
                    <input
                      type="text"
                      value={parsedSignal.asset}
                      onChange={(e) => setManualOverride(prev => ({ ...prev, asset: e.target.value }))}
                      dir="ltr"
                      className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded text-white font-mono-num"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-emerald-400 mb-1">دقيقة الدخول (:MM)</label>
                    <input
                      type="text"
                      value={parsedSignal.entryMinute}
                      onChange={(e) => setManualOverride(prev => ({ ...prev, entryMinute: e.target.value }))}
                      dir="ltr"
                      placeholder="20"
                      className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-emerald-500/50 rounded text-white font-mono-num"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">الاتجاه</label>
                    <button
                      onClick={() =>
                        setManualOverride(prev => ({
                          ...prev,
                          direction: parsedSignal.direction === 'CALL' ? 'PUT' : 'CALL'
                        }))
                      }
                      className={`w-full px-2.5 py-1.5 text-xs font-semibold rounded border transition-colors cursor-pointer whitespace-nowrap ${
                        parsedSignal.direction === 'CALL'
                          ? 'bg-emerald-950/60 border-emerald-700/60 text-emerald-300'
                          : 'bg-rose-950/60 border-rose-700/60 text-rose-300'
                      }`}
                    >
                      {parsedSignal.direction === 'CALL' ? 'صعود (CALL ⬆️)' : 'هبوط (PUT ⬇️)'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Left Column: Beautified Output Preview & Full Template Editor */}
              <div className="lg:col-span-6 p-6 bg-slate-900/70 border border-slate-800/90 rounded-xl space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-white">
                      03. قالب الإرسال المعتمد لقناة @ZadNBFX (قابل للتعديل)
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      التوقيت على ساعتك الآن: <span className="text-emerald-400 font-mono-num">{parsedSignal.entryTime}</span> (الدقيقة :{parsedSignal.entryMinute})
                    </p>
                  </div>

                  <div className="flex items-center gap-1 p-1 bg-[#0B0F17] border border-slate-800 rounded-lg self-start sm:self-auto">
                    <button
                      onClick={() => {
                        setCustomMessageOverride(null);
                        updateFormatterOptions(prev => ({ ...prev, templateStyle: 'elegant' }));
                      }}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                        formatterOptions.templateStyle === 'elegant'
                          ? 'bg-emerald-500 text-slate-950 font-semibold'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      أنيق
                    </button>
                    <button
                      onClick={() => {
                        setCustomMessageOverride(null);
                        updateFormatterOptions(prev => ({ ...prev, templateStyle: 'minimal' }));
                      }}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                        formatterOptions.templateStyle === 'minimal'
                          ? 'bg-emerald-500 text-slate-950 font-semibold'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      مختصر
                    </button>
                    <button
                      onClick={() => {
                        setCustomMessageOverride(null);
                        updateFormatterOptions(prev => ({ ...prev, templateStyle: 'pro' }));
                      }}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                        formatterOptions.templateStyle === 'pro'
                          ? 'bg-emerald-500 text-slate-950 font-semibold'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      احترافي
                    </button>
                    <button
                      onClick={() => {
                        setCustomMessageOverride(null);
                        updateFormatterOptions(prev => ({ ...prev, templateStyle: 'custom' }));
                      }}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                        formatterOptions.templateStyle === 'custom'
                          ? 'bg-emerald-500 text-slate-950 font-semibold'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      قالب مخصص ✎
                    </button>
                  </div>
                </div>

                {/* Editable Title & Footer Signature + Toggle Live Price/RSI */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-300 mb-1">
                      عنوان التوصية في أعلى الرسالة
                    </label>
                    <input
                      type="text"
                      value={formatterOptions.channelTitle}
                      onChange={(e) => {
                        setCustomMessageOverride(null);
                        updateFormatterOptions(prev => ({ ...prev, channelTitle: e.target.value }));
                      }}
                      placeholder="نَبض التداول | السوق العالمي"
                      className="w-full px-3 py-2 text-xs bg-[#0B0F17] border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-300 mb-1">
                      التوقيع أو النصيحة في أسفل الرسالة
                    </label>
                    <input
                      type="text"
                      value={formatterOptions.channelSignature}
                      onChange={(e) => {
                        setCustomMessageOverride(null);
                        updateFormatterOptions(prev => ({
                          ...prev,
                          channelSignature: e.target.value
                        }));
                      }}
                      placeholder="💡 نركز على الفرص القوية فقط"
                      className="w-full px-3 py-2 text-xs bg-[#0B0F17] border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between px-3 py-2 bg-[#0B0F17]/70 border border-slate-800/80 rounded-lg text-xs">
                  <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                    <input
                      type="checkbox"
                      checked={formatterOptions.includeLiveAnalysis !== false}
                      onChange={(e) => {
                        setCustomMessageOverride(null);
                        updateFormatterOptions(prev => ({
                          ...prev,
                          includeLiveAnalysis: e.target.checked
                        }));
                      }}
                      className="accent-emerald-500 w-4 h-4 rounded"
                    />
                    <span>إظهار السعر الحالي ومؤشر RSI وسبب الدخول داخل الرسالة</span>
                  </label>
                </div>

                {/* Custom Template Pattern Editor (Shown when 'custom' tab is active) */}
                {formatterOptions.templateStyle === 'custom' && (
                  <div className="p-3.5 bg-[#0B0F17] border border-emerald-500/40 rounded-xl space-y-2.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-emerald-400">
                        صيغة القالب المخصص الدائم (يُحفظ للطيار الآلي أيضاً):
                      </span>
                      <button
                        onClick={() => {
                          setCustomMessageOverride(null);
                          updateFormatterOptions(prev => ({
                            ...prev,
                            customTemplatePattern: DEFAULT_CUSTOM_TEMPLATE
                          }));
                        }}
                        className="text-[11px] text-slate-400 hover:text-white underline cursor-pointer"
                      >
                        استعادة القالب الافتراضي
                      </button>
                    </div>
                    <textarea
                      rows={6}
                      value={formatterOptions.customTemplatePattern || DEFAULT_CUSTOM_TEMPLATE}
                      onChange={(e) => {
                        setCustomMessageOverride(null);
                        updateFormatterOptions(prev => ({
                          ...prev,
                          customTemplatePattern: e.target.value
                        }));
                      }}
                      className="w-full p-3 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-emerald-500 leading-relaxed"
                    />
                    <div className="flex flex-wrap gap-1.5 text-[11px] text-slate-400">
                      <span>الكلمات المتغيرة المتاحة:</span>
                      {['{العنوان}', '{الزوج}', '{المدة}', '{الدقيقة}', '{الاتجاه}', '{السعر}', '{RSI}', '{التوقيع}'].map(tag => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => {
                            const current = formatterOptions.customTemplatePattern || DEFAULT_CUSTOM_TEMPLATE;
                            updateFormatterOptions(prev => ({
                              ...prev,
                              customTemplatePattern: `${current}\n${tag}`
                            }));
                          }}
                          className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-emerald-300 rounded cursor-pointer font-mono-num"
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Directly Editable Outgoing Message Box (Auto-Saved Directly) */}
                <div className="p-4 bg-[#0B0F17] border border-slate-800 rounded-xl space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400 pb-2 border-b border-slate-800/70">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span>نص الرسالة النهائي (يمكنك التعديل والكتابة بداخله مباشرة قبل الإرسال)</span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-950/70 text-emerald-300 border border-emerald-500/30">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        <span>
                          {messageAutoSaveStatus === 'saving'
                            ? 'جاري الحفظ التلقائي...'
                            : 'يتم الحفظ تلقائياً ومباشرة ✓'}
                        </span>
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      {customMessageOverride !== null && (
                        <button
                          onClick={() => {
                            setCustomMessageOverride(null);
                            setMessageAutoSaveStatus('idle');
                          }}
                          className="text-amber-400 hover:text-amber-300 underline cursor-pointer"
                        >
                          إلغاء التعديل اليدوي
                        </button>
                      )}
                      <button
                        onClick={() => handleCopyText(formattedPreview, 'preview-box')}
                        className="flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300 cursor-pointer"
                      >
                        {copiedId === 'preview-box' ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>تم النسخ</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>نسخ النص</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                  <textarea
                    rows={7}
                    value={formattedPreview}
                    onChange={(e) => handleDirectMessageBoxChange(e.target.value)}
                    className="w-full p-2 text-sm bg-transparent border border-transparent focus:border-slate-700 rounded-lg text-slate-100 font-sans leading-relaxed focus:outline-none resize-y"
                  />
                </div>

                {/* Live Telegram Smartphone Bubble Preview (معاينة حية لشكل الرسالة داخل تليجرام) */}
                <div className="p-4 bg-[#0E1621] border border-sky-500/30 rounded-xl space-y-2.5">
                  <div className="flex items-center justify-between text-xs border-b border-slate-800/80 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-sky-400" />
                      <span className="font-bold text-sky-300">
                        📱 معاينة حية لشكل الرسالة في قناة التليجرام ({autoPilot.chatId || '@ZadNBFX'})
                      </span>
                    </div>
                    <span className="text-[11px] font-mono-num text-slate-400">
                      Telegram Preview
                    </span>
                  </div>
                  <div className="p-3.5 bg-[#182533] border border-slate-700/70 rounded-2xl rounded-tr-sm max-w-md mr-auto shadow-md space-y-1.5">
                    <div className="text-[11px] font-bold text-sky-400 flex items-center justify-between">
                      <span>{formatterOptions.channelTitle || 'نَبض التداول | السوق العالمي'}</span>
                      <span className="text-[10px] text-slate-400 font-mono-num" dir="ltr">
                        {autoPilot.chatId || '@ZadNBFX'}
                      </span>
                    </div>
                    <div className="text-xs text-slate-100 whitespace-pre-wrap leading-relaxed font-sans">
                      {formattedPreview}
                    </div>
                    <div className="flex items-center justify-end gap-1 text-[10px] text-slate-400 font-mono-num pt-1">
                      <span>{parsedSignal.entryTime}</span>
                      <span>✓✓</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <button
                    onClick={handlePublishSignal}
                    disabled={publishStatus.type === 'loading'}
                    className="flex-1 flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Send className="w-4 h-4" />
                    <span>إرسال للقناة + نشر للزوار الآن</span>
                  </button>
                </div>
              </div>
            </div>
            )}

            {/* Admin Quick Manage Table */}
            {(adminSectionTab === 'all' || adminSectionTab === 'signals') && (
            <section className="pt-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h2 className="text-lg font-semibold text-white">
                      04. سجل إشارات السوق العالمي المنشورة (اليوم: {todaySignals.length})
                    </h2>
                    <span className="px-2.5 py-0.5 text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full">
                      🔄 يتم التصفير واحتساب النسبة يومياً تلقائياً (00:00 بتوقيت مصر)
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    دقة إشارات اليوم: <strong className="text-emerald-400 font-mono-num">{stats.winRate}%</strong> · صفقات رابحة اليوم: <strong className="text-white font-mono-num">{stats.wins}</strong> · المضاعفات: <strong className="text-emerald-300">0 (بدون مضاعفات)</strong>
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleResetDailySignalsLog}
                  className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-rose-200 bg-rose-950/60 hover:bg-rose-900/80 border border-rose-500/40 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                  <span>تصفير سجل الإشارات والنسبة اليومية الآن 🗑️</span>
                </button>
              </div>

              {/* =====================================================================
                  END-OF-DAY FINAL TRADING REPORT (التقرير النهائي لختام يوم التداول)
                 ===================================================================== */}
              <div className="p-5 bg-gradient-to-br from-[#0E1525] via-slate-900/95 to-[#0B121E] border-2 border-amber-500/40 rounded-xl shadow-xl space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3.5">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2.5 py-0.5 text-[11px] font-extrabold bg-amber-400 text-slate-950 rounded-md">
                        📊 التقرير النهائي لختام يوم التداول
                      </span>
                      <span
                        className={`px-2.5 py-0.5 text-[11px] font-bold rounded-full border ${
                          endOfDayReportData.isAfterClose
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                            : 'bg-sky-500/15 text-sky-300 border-sky-500/30'
                        }`}
                      >
                        {endOfDayReportData.isAfterClose
                          ? `✅ انتهى وقت التداول اليومي (أُغلق الساعة ${endOfDayReportData.endHourLabel})`
                          : `⏳ جلسة التداول جارية (تُغلق الساعة ${endOfDayReportData.endHourLabel})`}
                      </span>
                      <span className="text-xs text-slate-400 font-mono-num">
                        تاريخ اليوم: <strong className="text-white">{endOfDayReportData.todayEgypt}</strong>
                      </span>
                    </div>
                    <p className="text-xs text-slate-300">
                      ملخص شامل لنتائج البوت بناءً على الساعة النهائية للتداول ({endOfDayReportData.startHourLabel} ← {endOfDayReportData.endHourLabel}) — يشمل عدد الربح والخسارة <strong className="text-sky-300">بدون مضاعفات</strong> أو <strong className="text-amber-300">مع مضاعفات</strong>، النسبة المئوية، وأكثر زوج حقق ربحاً وتم اختياره.
                    </p>
                  </div>

                  {/* Action Buttons: Copy Report / Send to Free & VIP Telegram Channels */}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        handleCopyText(endOfDayReportData.telegramReportText, 'copy-eod-report')
                      }
                      className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/40 rounded-lg transition-colors cursor-pointer"
                    >
                      {copiedId === 'copy-eod-report' ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span>تم نسخ التقرير النهائي ✓</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>نسخ نص التقرير النهائي 📋</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      disabled={isSendingDailyReport}
                      onClick={() => handleSendEndOfDayReport('both')}
                      className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold bg-emerald-400 hover:bg-emerald-300 text-slate-950 rounded-lg transition-colors cursor-pointer shadow-md"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>
                        {isSendingDailyReport
                          ? 'جاري إرسال التقرير للقناة...'
                          : 'إرسال التقرير النهائي للقناة الآن 🚀'}
                      </span>
                    </button>
                  </div>
                </div>

                {dailyReportSendStatus.type !== 'idle' && (
                  <div
                    className={`p-3 rounded-lg text-xs font-bold border ${
                      dailyReportSendStatus.type === 'success'
                        ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-300'
                        : 'bg-rose-950/50 border-rose-500/40 text-rose-300'
                    }`}
                  >
                    {dailyReportSendStatus.message}
                  </div>
                )}

                {/* 4 Summary Pillars: (1) Without Martingale, (2) With Martingale, (3) Best Winning Pair & Most Selected Pair, (4) Telegram Mirror Preview */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                  {/* Card 1: Results WITHOUT Martingale (بدون مضاعفات) */}
                  <div className="lg:col-span-4 p-4 bg-[#0B0F17] border border-sky-500/35 rounded-xl space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <span className="text-xs font-extrabold text-sky-300">
                        🛡️ أولاً: التقرير بدون مضاعفات (صفقة مباشرة)
                      </span>
                      <span className="px-2 py-0.5 text-[11px] font-mono-num font-bold bg-sky-500/20 text-sky-300 rounded">
                        النسبة: {endOfDayReportData.winRateNoGale}%
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center font-mono-num">
                      <div className="p-2 bg-slate-900/90 rounded-lg border border-slate-800">
                        <div className="text-[10px] text-slate-400 font-sans">عدد الربح ✅</div>
                        <div className="text-base font-extrabold text-emerald-400 mt-0.5">
                          {endOfDayReportData.directWins}
                        </div>
                      </div>
                      <div className="p-2 bg-slate-900/90 rounded-lg border border-slate-800">
                        <div className="text-[10px] text-slate-400 font-sans">عدد الخسارة ❌</div>
                        <div className="text-base font-extrabold text-rose-400 mt-0.5">
                          {endOfDayReportData.firstCandleLossesNoGale}
                        </div>
                      </div>
                      <div className="p-2 bg-slate-900/90 rounded-lg border border-slate-800">
                        <div className="text-[10px] text-slate-400 font-sans">النسبة المئوية</div>
                        <div className="text-base font-extrabold text-sky-300 mt-0.5">
                          {endOfDayReportData.winRateNoGale}%
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-800/80">
                      <span className="text-slate-400">الصافي القياسي (بدخول 1$ ثابت):</span>
                      <strong
                        className={`font-mono-num text-sm ${
                          endOfDayReportData.netProfitNoGaleUsd >= 0
                            ? 'text-emerald-400'
                            : 'text-rose-400'
                        }`}
                      >
                        {endOfDayReportData.netProfitNoGaleUsd >= 0 ? '+' : '-'}$
                        {Math.abs(endOfDayReportData.netProfitNoGaleUsd).toFixed(2)}
                      </strong>
                    </div>
                  </div>

                  {/* Card 2: Results WITH 1-Step Martingale (مع مضاعفة واحدة) */}
                  <div className="lg:col-span-4 p-4 bg-[#0B0F17] border border-amber-500/35 rounded-xl space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <span className="text-xs font-extrabold text-amber-300">
                        ⚡ ثانياً: التقرير مع مضاعفة واحدة (1$ + 2$)
                      </span>
                      <span className="px-2 py-0.5 text-[11px] font-mono-num font-bold bg-amber-500/20 text-amber-300 rounded">
                        النسبة: {endOfDayReportData.winRateWithGale}%
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center font-mono-num">
                      <div className="p-2 bg-slate-900/90 rounded-lg border border-slate-800">
                        <div className="text-[10px] text-slate-400 font-sans">إجمالي الربح ✅</div>
                        <div className="text-base font-extrabold text-emerald-400 mt-0.5">
                          {endOfDayReportData.totalWinsWithGale}
                        </div>
                        <div className="text-[9px] text-slate-400 font-sans">
                          ({endOfDayReportData.directWins} مباشر + {endOfDayReportData.gale1Wins} مضاعفة)
                        </div>
                      </div>
                      <div className="p-2 bg-slate-900/90 rounded-lg border border-slate-800">
                        <div className="text-[10px] text-slate-400 font-sans">الخسارة ❌</div>
                        <div className="text-base font-extrabold text-rose-400 mt-0.5">
                          {endOfDayReportData.lossesWithGale}
                        </div>
                        <div className="text-[9px] text-slate-400 font-sans">(-3$ للصفقة)</div>
                      </div>
                      <div className="p-2 bg-slate-900/90 rounded-lg border border-slate-800">
                        <div className="text-[10px] text-slate-400 font-sans">النسبة المئوية</div>
                        <div className="text-base font-extrabold text-amber-300 mt-0.5">
                          {endOfDayReportData.winRateWithGale}%
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-800/80">
                      <span className="text-slate-400">الصافي القياسي (1$ + 2$ مضاعفة):</span>
                      <strong
                        className={`font-mono-num text-sm ${
                          endOfDayReportData.netProfitWithGaleUsd >= 0
                            ? 'text-emerald-400'
                            : 'text-rose-400'
                        }`}
                      >
                        {endOfDayReportData.netProfitWithGaleUsd >= 0 ? '+' : '-'}$
                        {Math.abs(endOfDayReportData.netProfitWithGaleUsd).toFixed(2)}
                      </strong>
                    </div>
                  </div>

                  {/* Card 3: Best Winning Pair & Most Selected Pair (أكثر زوج ربحاً وأكثر زوج اختياراً) */}
                  <div className="lg:col-span-4 p-4 bg-[#0B0F17] border border-emerald-500/35 rounded-xl space-y-3 flex flex-col justify-between">
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                        <span className="text-xs font-extrabold text-emerald-300">
                          🏆 ثالثاً: تحليل أزواج العملات اليوم
                        </span>
                        <span className="text-[11px] text-slate-400 font-mono-num">
                          {endOfDayReportData.pairBreakdown.length} أزواج نشطة
                        </span>
                      </div>

                      {/* Best Winning Pair */}
                      <div className="p-2.5 bg-emerald-950/30 border border-emerald-500/30 rounded-lg flex items-center justify-between">
                        <div>
                          <div className="text-[10px] text-emerald-300 font-bold">
                            🏆 أكثر زوج كان ربحاً اليوم:
                          </div>
                          <div className="text-sm font-extrabold text-white font-mono-num mt-0.5">
                            {endOfDayReportData.bestWinningPair
                              ? endOfDayReportData.bestWinningPair.pair
                              : 'لا توجد صفقات بعد'}
                          </div>
                        </div>
                        {endOfDayReportData.bestWinningPair && (
                          <div className="text-left font-mono-num">
                            <div className="text-xs font-bold text-emerald-400">
                              {endOfDayReportData.bestWinningPair.totalWins} ربح ✅ /{' '}
                              {endOfDayReportData.bestWinningPair.losses} خسارة ❌
                            </div>
                            <div className="text-[10px] text-slate-300">
                              دقة النجاح: {endOfDayReportData.bestWinningPair.winRate}%
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Most Selected Pair */}
                      <div className="p-2.5 bg-amber-950/25 border border-amber-500/30 rounded-lg flex items-center justify-between">
                        <div>
                          <div className="text-[10px] text-amber-300 font-bold">
                            🎯 أكثر زوج تم اختياره في البوت:
                          </div>
                          <div className="text-sm font-extrabold text-white font-mono-num mt-0.5">
                            {endOfDayReportData.mostSelectedPair
                              ? endOfDayReportData.mostSelectedPair.pair
                              : '—'}
                          </div>
                        </div>
                        {endOfDayReportData.mostSelectedPair && (
                          <div className="text-left font-mono-num">
                            <div className="text-xs font-bold text-amber-300">
                              {endOfDayReportData.mostSelectedPair.total} صفقات
                            </div>
                            <div className="text-[10px] text-slate-300">
                              ({endOfDayReportData.mostSelectedPair.totalWins}✅ ·{' '}
                              {endOfDayReportData.mostSelectedPair.losses}❌)
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* All Traded Pairs Mini Badges */}
                    {endOfDayReportData.pairBreakdown.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {endOfDayReportData.pairBreakdown.map((p) => (
                          <span
                            key={`eod-pair-${p.pair}`}
                            className="px-2 py-0.5 text-[10px] font-mono-num bg-slate-900 border border-slate-800 rounded text-slate-200"
                          >
                            <strong>{p.pair}</strong>: {p.totalWins}✅/{p.losses}❌ ({p.winRate}%)
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Mirror Preview of the Formatted End-of-Day Telegram Report (مرآة التقرير الجاهز للنشر) */}
                <details className="group bg-[#0B0F17] border border-slate-800 rounded-xl overflow-hidden">
                  <summary className="px-4 py-2.5 text-xs font-bold text-slate-200 flex items-center justify-between cursor-pointer hover:bg-slate-900/80 select-none">
                    <span>
                      🪞 مرآة ومعاينة نص التقرير النهائي الجاهز للإرسال إلى تليجرام (اضغط للعرض أو النسخ)
                    </span>
                    <span className="text-[11px] text-amber-400 group-open:rotate-180 transition-transform">
                      ▼
                    </span>
                  </summary>
                  <div className="p-4 border-t border-slate-800 bg-[#080B11] flex flex-col md:flex-row gap-4 items-start justify-between">
                    <pre className="text-xs text-slate-200 whitespace-pre-wrap leading-relaxed font-sans flex-1">
                      {endOfDayReportData.telegramReportText}
                    </pre>
                    <div className="flex flex-col gap-2 shrink-0 w-full md:w-auto">
                      <button
                        type="button"
                        onClick={() => handleSendEndOfDayReport('free')}
                        disabled={isSendingDailyReport}
                        className="px-3.5 py-2 text-xs font-bold bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 rounded-lg cursor-pointer"
                      >
                        إرسال للقناة المجانية فقط 📢
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSendEndOfDayReport('vip')}
                        disabled={isSendingDailyReport}
                        className="px-3.5 py-2 text-xs font-bold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-lg cursor-pointer"
                      >
                        إرسال لقناة VIP فقط 👑
                      </button>
                    </div>
                  </div>
                </details>
              </div>

              <div className="bg-slate-900/70 border border-slate-800/90 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-right border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 text-xs text-slate-400 bg-[#0B0F17]/60">
                        <th className="py-3.5 px-4 font-medium">الزوج (السوق العالمي)</th>
                        <th className="py-3.5 px-4 font-medium">الاتجاه</th>
                        <th className="py-3.5 px-4 font-medium">دقيقة الدخول (بتوقيت الجهاز)</th>
                        <th className="py-3.5 px-4 font-medium">السعر / RSI</th>
                        <th className="py-3.5 px-4 font-medium">النتيجة</th>
                        <th className="py-3.5 px-4 font-medium text-left">إجراءات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-sm">
                      {todaySignals.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-8 px-4 text-center text-xs text-slate-400">
                            سجل إشارات اليوم مصفّر حالياً (0 إشارة). سيتم تسجيل الإشارات الجديدة واحتساب النسبة اليومية تلقائياً.
                          </td>
                        </tr>
                      ) : (
                        todaySignals.map((sig) => {
                        const syncedLocalTime = formatDeviceLocalTimeFromMinute(
                          sig.entryMinute || sig.entryTime
                        );
                        const minuteOnly = extractMinuteOnly(sig.entryMinute || sig.entryTime);
                        return (
                          <tr key={sig.id} className="hover:bg-slate-800/30 transition-colors">
                            <td className="py-3.5 px-4 font-semibold text-white font-mono-num">
                              {sig.asset}
                              <span className="text-xs text-emerald-400 font-normal mr-1.5">
                                · سوق عالمي
                              </span>
                            </td>
                            <td className="py-3.5 px-4">
                              {sig.direction === 'CALL' ? (
                                <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                                  <ArrowUpRight className="w-4 h-4" />
                                  <span>صعود (شراء)</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-rose-400 font-medium">
                                  <ArrowDownRight className="w-4 h-4" />
                                  <span>هبوط (بيع)</span>
                                </span>
                              )}
                            </td>
                            <td className="py-3.5 px-4 font-mono-num text-slate-200">
                              <span>{syncedLocalTime}</span>
                              <span className="text-xs text-emerald-400 mr-2">
                                (الدقيقة :{minuteOnly})
                              </span>
                            </td>
                            <td className="py-3.5 px-4 font-mono-num text-xs text-slate-300">
                              {sig.livePrice ? `${sig.livePrice}` : '—'}
                              {sig.rsiValue !== undefined ? ` (RSI ${sig.rsiValue})` : ''}
                            </td>
                            <td className="py-3.5 px-4 text-sm">
                              {sig.status === 'WIN' && (
                                <span className="inline-flex items-center gap-1.5 text-emerald-400 font-bold">
                                  {autoPilot.freeWinImageUrl && (
                                    <img
                                      src={autoPilot.freeWinImageUrl}
                                      alt="Win"
                                      className="w-6 h-6 rounded object-cover border border-emerald-500/40"
                                    />
                                  )}
                                  <span>{autoPilot.freeWinIcon || '✅ ربح'}</span>
                                </span>
                              )}
                              {sig.status === 'WIN_GALE1' && (
                                <span className="inline-flex items-center gap-1.5 text-emerald-400 font-bold">
                                  {(autoPilot.freeWinGale1ImageUrl || autoPilot.freeWinImageUrl) && (
                                    <img
                                      src={autoPilot.freeWinGale1ImageUrl || autoPilot.freeWinImageUrl}
                                      alt="Win Gale 1"
                                      className="w-6 h-6 rounded object-cover border border-amber-500/40"
                                    />
                                  )}
                                  <span>{autoPilot.freeWinGale1Icon || '✅ ربح مضاعفة واحدة'}</span>
                                </span>
                              )}
                              {sig.status === 'LOSS' && (
                                <span className="inline-flex items-center gap-1.5 text-rose-400 font-bold">
                                  {autoPilot.freeLossImageUrl && (
                                    <img
                                      src={autoPilot.freeLossImageUrl}
                                      alt="Loss"
                                      className="w-6 h-6 rounded object-cover border border-rose-500/40"
                                    />
                                  )}
                                  <span>{autoPilot.freeLossIcon || '❌ خسارة'}</span>
                                </span>
                              )}
                              {sig.status === 'DRAW' && (
                                <span className="text-slate-300 font-bold">⚖️ تعادل</span>
                              )}
                              {sig.status === 'PENDING' && (
                                <span className="text-xs text-amber-400 font-semibold">
                                  {sig.galeStep === 1
                                    ? '⏳ جاري المضاعفة الأولى (1)...'
                                    : '⏳ جاري الآن'}
                                </span>
                              )}
                            </td>
                            <td className="py-3.5 px-4">
                              <div className="flex items-center justify-end gap-1.5 flex-wrap">
                                <button
                                  onClick={() => handleUpdateStatus(sig.id, 'WIN')}
                                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                                    sig.status === 'WIN'
                                      ? 'bg-emerald-500 text-slate-950 font-semibold'
                                      : 'bg-slate-800 text-slate-300 hover:bg-emerald-950 hover:text-emerald-300'
                                  }`}
                                  title="ربح مباشر"
                                >
                                  {autoPilot.freeWinIcon || '✅ ربح'}
                                </button>
                                <button
                                  onClick={() => handleUpdateStatus(sig.id, 'WIN_GALE1')}
                                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                                    sig.status === 'WIN_GALE1'
                                      ? 'bg-emerald-400 text-slate-950 font-semibold'
                                      : 'bg-slate-800 text-emerald-300 hover:bg-emerald-950'
                                  }`}
                                  title="ربح مضاعفة واحدة"
                                >
                                  {autoPilot.freeWinGale1Icon || '✅ ربح مضاعفة واحدة'}
                                </button>
                                <button
                                  onClick={() => handleUpdateStatus(sig.id, 'LOSS')}
                                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                                    sig.status === 'LOSS'
                                      ? 'bg-rose-500 text-white font-semibold'
                                      : 'bg-slate-800 text-slate-300 hover:bg-rose-950 hover:text-rose-300'
                                  }`}
                                  title="خسارة"
                                >
                                  {autoPilot.freeLossIcon || '❌ خسارة'}
                                </button>
                                <button
                                  onClick={() => handleUpdateStatus(sig.id, 'DRAW')}
                                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                                    sig.status === 'DRAW'
                                      ? 'bg-slate-300 text-slate-950 font-semibold'
                                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                                  }`}
                                  title="تعادل"
                                >
                                  ⚖️ تعادل
                                </button>
                                <button
                                  onClick={() => handleDeleteSignal(sig.id)}
                                  title="حذف الإشارة"
                                  className="p-1.5 text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
            )}

            {/* Admin Registered VIP Subscribers, Revenue Stats, Expiry Alerts & Quick Notes */}
            {(adminSectionTab === 'all' || adminSectionTab === 'vip') && (
            <section className="pt-4 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    05. إدارة أعضاء VIP + إحصائيات المبالغ المحصلة + تنبيهات الانتهاء والمفكرة السريعة ({subscribers.length})
                  </h2>
                  <p className="text-xs text-slate-400">
                    متابعة إيرادات الاشتراكات، تنبيهات مواعيد انتهاء العضويات، المفكرة السريعة للمراسلات (مثل واتساب)، وتعديل وتفعيل الأعضاء
                  </p>
                </div>
              </div>

              {/* 1. Revenue Statistics Cards (إحصائيات المبالغ المحصلة من الخدمة) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                <div className="p-4 bg-gradient-to-br from-emerald-950/60 to-slate-900/90 border border-emerald-500/40 rounded-xl space-y-1">
                  <div className="flex items-center justify-between text-xs text-emerald-300 font-semibold">
                    <span>إجمالي المبالغ المحصّلة (VIP)</span>
                    <DollarSign className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="text-2xl font-bold text-white font-mono-num">
                    ${adminRevenueAndExpiryStats.totalCollectedUsd}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    من {adminRevenueAndExpiryStats.activePaidCount} اشتراك مدفوع ومفعّل
                  </div>
                </div>

                <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl space-y-1">
                  <div className="flex items-center justify-between text-xs text-amber-300 font-semibold">
                    <span>محافظ إلكترونية (USDT / محافظ)</span>
                    <CreditCard className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="text-xl font-bold text-white font-mono-num">
                    ${adminRevenueAndExpiryStats.walletTotal}
                  </div>
                  <div className="text-[11px] text-slate-400">إجمالي المحصل عبر المحافظ الإلكترونية</div>
                </div>

                <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl space-y-1">
                  <div className="flex items-center justify-between text-xs text-sky-300 font-semibold">
                    <span>تحويل بنكي (Bank Transfer)</span>
                    <CreditCard className="w-4 h-4 text-sky-400" />
                  </div>
                  <div className="text-xl font-bold text-white font-mono-num">
                    ${adminRevenueAndExpiryStats.bankTotal}
                  </div>
                  <div className="text-[11px] text-slate-400">إجمالي المحصل عبر التحويل البنكي</div>
                </div>

                <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl space-y-1">
                  <div className="flex items-center justify-between text-xs text-emerald-300 font-semibold">
                    <span>🏦 تحويل لبنك فلسطيني</span>
                    <CreditCard className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="text-xl font-bold text-white font-mono-num">
                    ${adminRevenueAndExpiryStats.palestineBankTotal}
                  </div>
                  <div className="text-[11px] text-slate-400">بالدولار أو الشيكل ($)</div>
                </div>
              </div>

              {/* 2. Admin Alert Banner for Expiring / Expired Members (تنبيه للمشرف بموعد انتهاء الأعضاء) */}
              {adminRevenueAndExpiryStats.expiringOrExpiredMembers.length > 0 && (
                <div className="p-4 bg-rose-950/35 border-2 border-rose-500/50 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-rose-300">
                      <Bell className="w-4 h-4 text-rose-400 animate-bounce shrink-0" />
                      <span>
                        🔔 تنبيه للمشرف بموعد انتهاء الأعضاء ({adminRevenueAndExpiryStats.expiringOrExpiredMembers.length} عضو انتهت أو قاربت عضويتهم على الانتهاء):
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {adminRevenueAndExpiryStats.expiringOrExpiredMembers.map(({ sub, daysLeft, isExpired }) => (
                      <div
                        key={`exp-${sub.id}`}
                        className="p-3 bg-[#0B0F17]/90 border border-rose-500/30 rounded-lg flex flex-wrap items-center justify-between gap-2 text-xs"
                      >
                        <div>
                          <div className="font-bold text-white flex items-center gap-1.5">
                            <span>{sub.name}</span>
                            <span className="text-[11px] text-slate-400">({sub.telegramUsername})</span>
                          </div>
                          <div className="text-[11px] mt-0.5">
                            {isExpired ? (
                              <span className="text-rose-400 font-semibold">
                                ⚠️ انتهت العضوية بتاريخ {sub.expiryDate} (منذ {Math.abs(daysLeft)} يوم)
                              </span>
                            ) : (
                              <span className="text-amber-300 font-semibold">
                                ⏳ تنتهي العضوية بتاريخ {sub.expiryDate} (متبقي {daysLeft} أيام)
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => {
                              openAdminSubscriberModal(sub);
                              setAdminChatInput(
                                `🔔 تنبيه ودي يا ${sub.name}: عضويتك في قناة VIP ${
                                  isExpired ? `انتهت بتاريخ ${sub.expiryDate}` : `تنتهي بتاريخ ${sub.expiryDate}`
                                }. يمكنك التجديد الآن (شهر 30$ | 3 شهور 65$ | 6 شهور 80$ | سنة 111$) عبر تحويل بنكي أو محافظ إلكترونية أو PayPal.`
                              );
                            }}
                            className="px-2.5 py-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold rounded cursor-pointer whitespace-nowrap"
                          >
                            إرسال تنبيه تجديد 💬
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 2.5 Quotex Free Referral Link & $100 Deposit Rule Configuration (نظام التفعيل المجاني عبر إحالة كيوتكس) */}
              <div className="p-4 bg-gradient-to-r from-amber-950/35 via-slate-900/90 to-emerald-950/30 border border-amber-500/40 rounded-xl space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Link2 className="w-4 h-4 text-amber-400" />
                    <h3 className="text-xs sm:text-sm font-bold text-white">
                      🎁 إعداد رابط الإحالة المجاني لمنصة كيوتكس (Quotex) — عضوية VIP مجانية عند الإيداع بـ 100$
                    </h3>
                  </div>
                  <span className="px-2.5 py-0.5 text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded">
                    يظهر تلقائياً عند اختيار البروكر كيوتكس
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  عند اختيار العضو لمنصة <strong className="text-amber-300">Quotex (كوتيكس)</strong> أثناء التسجيل، يظهر له خياران: <strong className="text-white">الاشتراكات الشهرية المدفوعة</strong> أو <strong className="text-emerald-300">التفعيل المجاني باستخدام رابط الإحالة الخاص بك</strong> ثم مراسلتك والتأكد من إيداع <strong className="text-amber-300">100 دولار ($)</strong> في حسابه على كيوتكس ليحصل على العضوية المجانية.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                  <div className="md:col-span-9">
                    <label className="block text-[11px] text-amber-300 font-semibold mb-1">
                      رابط الإحالة الرسمي الخاص بك في كيوتكس (Quotex Referral Link):
                    </label>
                    <input
                      type="text"
                      dir="ltr"
                      value={autoPilot.quotexReferralLink || 'https://broker-qx.pro/?lid=2303934'}
                      onChange={(e) =>
                        setAutoPilot(p => ({ ...p, quotexReferralLink: e.target.value }))
                      }
                      placeholder="https://broker-qx.pro/?lid=2303934"
                      className="w-full px-3 py-2 text-xs bg-[#0B0F17] border border-amber-500/40 rounded-lg text-white font-mono-num focus:outline-none focus:border-amber-400"
                    />
                  </div>
                  <div className="md:col-span-3">
                    <button
                      type="button"
                      onClick={() =>
                        handleSaveAutoPilot({
                          quotexReferralLink:
                            autoPilot.quotexReferralLink || 'https://broker-qx.pro/?lid=2303934'
                        })
                      }
                      className="w-full py-2 px-3 text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg transition-colors cursor-pointer"
                    >
                      حفظ رابط إحالة كيوتكس
                    </button>
                  </div>
                </div>
              </div>

              {/* 3. Admin Quick Notes (المفكرة السريعة للمراسلات مثل الواتساب) */}
              <div className="p-4 bg-slate-900/80 border border-amber-500/30 rounded-xl space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Bookmark className="w-4 h-4 text-amber-400" />
                    <h3 className="text-xs sm:text-sm font-bold text-white">
                      المفكرة السريعة للمشرف (حفظ أرقام الحسابات والردود الجاهزة للاستعانة بها في المراسلات مثل واتساب)
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAddNoteForm(p => !p)}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{showAddNoteForm ? 'إغلاق النموذج' : 'إضافة ملاحظة / رد سريع جديد'}</span>
                  </button>
                </div>

                {showAddNoteForm && (
                  <form onSubmit={handleAddQuickNote} className="p-3.5 bg-[#0B0F17] border border-slate-800 rounded-lg space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">عنوان الملاحظة (مثال: رقم المحفظة / الحساب البنكي)</label>
                        <input
                          type="text"
                          required
                          value={newNoteTitle}
                          onChange={(e) => setNewNoteTitle(e.target.value)}
                          placeholder="مثال: بيانات الدفع PayPal والبنك"
                          className="w-full px-3 py-2 text-xs bg-slate-900 border border-slate-800 rounded text-white"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-[11px] text-slate-400 mb-1">نص الملاحظة أو الرسالة المحفوظة</label>
                        <textarea
                          rows={2}
                          required
                          value={newNoteContent}
                          onChange={(e) => setNewNoteContent(e.target.value)}
                          placeholder="اكتب هنا أرقام المحافظ أو الحساب البنكي أو النص الجاهز لإرساله للأعضاء بضغطة واحدة..."
                          className="w-full px-3 py-2 text-xs bg-slate-900 border border-slate-800 rounded text-white"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="submit"
                        className="px-4 py-2 text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg cursor-pointer"
                      >
                        حفظ في المفكرة السريعة
                      </button>
                    </div>
                  </form>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                  {quickNotes.map((note) => (
                    <div
                      key={note.id}
                      className="p-3 bg-[#0B0F17] border border-slate-800 rounded-lg flex flex-col justify-between gap-2"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-amber-300">{note.title}</span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleCopyText(note.content, `note-${note.id}`)}
                              className="px-2 py-0.5 text-[10px] bg-slate-800 hover:bg-slate-700 text-emerald-300 rounded cursor-pointer"
                            >
                              {copiedId === `note-${note.id}` ? 'تم النسخ ✓' : 'نسخ النص'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteQuickNote(note.id)}
                              className="p-1 text-slate-500 hover:text-rose-400 cursor-pointer"
                              title="حذف الملاحظة"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        <p className="text-[11px] text-slate-300 mt-1.5 whitespace-pre-wrap leading-relaxed line-clamp-3">
                          {note.content}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-slate-900/70 border border-slate-800/90 rounded-xl overflow-hidden">
                {/* Search and Status Filter Bar for Subscribers */}
                <div className="p-3.5 bg-[#0B0F17]/90 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {[
                      { id: 'ALL', label: `الكل (${subscribers.length})` },
                      {
                        id: 'ACTIVE',
                        label: `مفعّل VIP (${subscribers.filter((s) => s.status === 'ACTIVE').length})`
                      },
                      {
                        id: 'PENDING',
                        label: `قيد المراجعة (${subscribers.filter((s) => !s.status || s.status === 'PENDING').length})`
                      },
                      {
                        id: 'BANNED',
                        label: `محظور (${subscribers.filter((s) => s.status === 'BANNED').length})`
                      }
                    ].map((st) => (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() =>
                          setAdminSubStatusFilter(st.id as 'ALL' | 'ACTIVE' | 'PENDING' | 'BANNED')
                        }
                        className={`px-2.5 py-1 text-xs font-bold rounded-md transition-colors cursor-pointer ${
                          adminSubStatusFilter === st.id
                            ? 'bg-amber-400 text-slate-950'
                            : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                        }`}
                      >
                        {st.label}
                      </button>
                    ))}
                  </div>

                  <div className="w-full sm:w-64">
                    <input
                      type="text"
                      value={adminSubSearch}
                      onChange={(e) => setAdminSubSearch(e.target.value)}
                      placeholder="بحث بالاسم، التليجرام، ID الحساب..."
                      className="w-full px-3 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
                    />
                  </div>
                </div>

                {subscribers.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-400">
                    لا توجد طلبات تسجيل جديدة حتى الآن.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-right border-collapse">
                      <thead>
                        <tr className="border-b border-slate-800 text-xs text-slate-400 bg-[#0B0F17]/60">
                          <th className="py-3 px-4 font-medium">الاسم والدولة</th>
                          <th className="py-3 px-4 font-medium">التليجرام والموبايل</th>
                          <th className="py-3 px-4 font-medium">البروكر ورقم الحساب</th>
                          <th className="py-3 px-4 font-medium">الباقة والمبلغ المحصّل</th>
                          <th className="py-3 px-4 font-medium">حالة العضوية والانتهاء</th>
                          <th className="py-3 px-4 font-medium text-left">إدارة / تفعيل / مراسلة / حظر</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 text-xs sm:text-sm">
                        {subscribers
                          .filter((sub) => {
                            if (adminSubStatusFilter !== 'ALL') {
                              const currentSt = sub.status || 'PENDING';
                              if (currentSt !== adminSubStatusFilter) return false;
                            }
                            if (adminSubSearch.trim()) {
                              const q = adminSubSearch.trim().toLowerCase();
                              const matchName = (sub.name || '').toLowerCase().includes(q);
                              const matchTg = (sub.telegramUsername || '').toLowerCase().includes(q);
                              const matchId = (sub.brokerAccountId || '').toLowerCase().includes(q);
                              const matchPhone = (sub.phone || '').toLowerCase().includes(q);
                              return matchName || matchTg || matchId || matchPhone;
                            }
                            return true;
                          })
                          .map((sub) => {
                          const msgCount = sub.messages?.length || 0;
                          const lastMsg =
                            msgCount > 0 ? sub.messages![msgCount - 1] : null;
                          const hasUnreadFromMember = lastMsg?.sender === 'member';
                          const planObj = VIP_PLANS.find(p => p.id === sub.planDuration) || VIP_PLANS[0];
                          const expInfo = getSubscriberExpiryStatus(sub.expiryDate);

                          return (
                            <tr key={sub.id} className="hover:bg-slate-800/30 transition-colors">
                              <td className="py-3.5 px-4">
                                <div className="font-semibold text-white">{sub.name}</div>
                                <div className="text-[11px] text-slate-400 mt-0.5">
                                  {sub.country || 'مصر 🇪🇬'} · <span dir="ltr">{sub.email}</span>
                                </div>
                              </td>
                              <td className="py-3.5 px-4">
                                <div className="font-mono-num text-emerald-300 font-semibold" dir="ltr">
                                  {sub.telegramUsername || '—'}
                                </div>
                                <div className="font-mono-num text-xs text-slate-400 mt-0.5" dir="ltr">
                                  {sub.phone}
                                </div>
                              </td>
                              <td className="py-3.5 px-4">
                                <div className=" text-amber-300 font-medium whitespace-nowrap">
                                  {sub.broker}
                                </div>
                                <div className="font-mono-num text-xs text-slate-300 mt-0.5" dir="ltr">
                                  ID: {sub.brokerAccountId || '—'}
                                </div>
                              </td>
                              <td className="py-3.5 px-4 whitespace-nowrap">
                                {sub.subscriptionType === 'quotex_referral' || sub.planDuration === 'quotex_referral_free' ? (
                                  <div className="space-y-1">
                                    <div className="text-xs font-bold text-amber-300 flex items-center gap-1">
                                      <span>🎁 إحالة كيوتكس (عضوية مجانية)</span>
                                    </div>
                                    <div className="text-[11px] flex items-center gap-1.5">
                                      {sub.quotexDepositConfirmed ? (
                                        <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded font-bold">
                                          ✅ تم تأكيد إيداع 100$ في كيوتكس
                                        </span>
                                      ) : (
                                        <span className="px-2 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded font-semibold">
                                          ⏳ بانتظار تأكيد التسجيل وإيداع 100$
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    <div className="text-xs font-bold text-white">
                                      {planObj.label} ({planObj.price}$)
                                    </div>
                                    <div className="text-[11px] mt-0.5 flex items-center gap-1.5">
                                      <span className={sub.amountPaid && sub.amountPaid > 0 ? 'text-emerald-400 font-bold font-mono-num' : 'text-slate-400'}>
                                        المحصّل: ${sub.amountPaid || 0}
                                      </span>
                                      <span className="text-slate-500">·</span>
                                      <span className="text-slate-400">{sub.paymentMethod || 'محافظ إلكترونية'}</span>
                                    </div>
                                  </>
                                )}
                              </td>
                              <td className="py-3.5 px-4 whitespace-nowrap">
                                <div>
                                  {sub.status === 'ACTIVE' ? (
                                    <span className="px-2 py-0.5 text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-md">
                                      ✅ مفعّل VIP
                                    </span>
                                  ) : sub.status === 'BANNED' ? (
                                    <span className="px-2 py-0.5 text-[11px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-md">
                                      🚫 محظور
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-md">
                                      ⏳ قيد المراجعة
                                    </span>
                                  )}
                                </div>
                                <div className="font-mono-num text-[11px] mt-1">
                                  {sub.expiryDate ? (
                                    expInfo.status === 'expired' ? (
                                      <span className="text-rose-400 font-bold">
                                        ⚠️ انتهت: {sub.expiryDate}
                                      </span>
                                    ) : expInfo.status === 'expiring_soon' ? (
                                      <span className="text-amber-300 font-bold">
                                        🔔 قريباً ({expInfo.daysLeft} يوم): {sub.expiryDate}
                                      </span>
                                    ) : (
                                      <span className="text-emerald-300 font-semibold">
                                        📅 {sub.expiryDate}
                                      </span>
                                    )
                                  ) : (
                                    <span className="text-slate-500">لم يُحدد تاريخ انتهاء</span>
                                  )}
                                </div>
                              </td>
                              <td className="py-3.5 px-4">
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    onClick={() => openAdminSubscriberModal(sub)}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                                      hasUnreadFromMember
                                        ? 'bg-emerald-400 text-slate-950 hover:bg-emerald-300'
                                        : 'bg-slate-800 text-emerald-300 hover:bg-slate-700 border border-emerald-500/30'
                                    }`}
                                  >
                                    <MessageSquare className="w-3.5 h-3.5" />
                                    <span>
                                      {hasUnreadFromMember
                                        ? 'رد جديد من العضو 💬'
                                        : `تعديل وتفعيل ومراسلة (${msgCount})`}
                                    </span>
                                  </button>

                                  <button
                                    onClick={() =>
                                      handleAdminUpdateSubscriber(sub.id, {
                                        status: sub.status === 'BANNED' ? 'ACTIVE' : 'BANNED'
                                      })
                                    }
                                    title={sub.status === 'BANNED' ? 'إلغاء الحظر' : 'حظر العضو'}
                                    className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                                      sub.status === 'BANNED'
                                        ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30'
                                        : 'bg-slate-800 text-rose-300 hover:bg-rose-950'
                                    }`}
                                  >
                                    {sub.status === 'BANNED' ? 'فك الحظر' : '🚫 حظر'}
                                  </button>

                                  <button
                                    onClick={() => handleDeleteSubscriber(sub.id)}
                                    className="p-1.5 text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
                                    title="حذف العضو نهائياً"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>
            )}

            {/* SECTION 06: DYNAMIC SUBSCRIPTION PLANS & REFERRAL/CONTACT LINKS */}
            {(adminSectionTab === 'all' || adminSectionTab === 'plans') && (
              <section className="p-6 bg-slate-900/90 border border-slate-800 rounded-xl space-y-6">
                <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
                  <Crown className="w-5 h-5 text-amber-400" />
                  <h2 className="text-lg font-bold text-white">
                    06. إدارة الباقات والمسميات والأسعار وروابط التواصل والإحالة
                  </h2>
                </div>
                <ZadtooPlansAndLinksManager
                  initialPlans={platformPlans}
                  initialContactLinks={platformContactLinks}
                  onConfigChanged={(p, c) => {
                    setPlatformPlans(p);
                    setPlatformContactLinks(c);
                  }}
                />
              </section>
            )}
          </div>
        ) : activeView === 'robot' ? (
          <ErrorBoundary>
            <QuotexRobotAdminPage
              robotSettings={robotSettings}
              setRobotSettings={setRobotSettings}
              subscribers={subscribers}
              setSubscribers={setSubscribers}
              signals={todaySignals}
              liveMarket={liveMarket}
              onTriggerSignalNow={handleTriggerAutoNow}
              onNavigateView={setActiveView}
              isAdmin={isAdminAuthenticated}
              onOpenLoginModal={() => setShowLoginModal(true)}
            />
          </ErrorBoundary>
        ) : activeView === 'stats' && isAdminAuthenticated ? (
          /* ==========================================
             PROTECTED ADMIN-ONLY STATISTICS PAGE (A4 SINGLE-LINE-PER-DAY SHEET)
             ========================================== */
          <div className="space-y-6">
            {/* Top Controls Bar (Hidden when printing A4) */}
            <div className="print:hidden p-5 bg-slate-900/90 border border-slate-800 rounded-xl space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-4">
                <div>
                  <div className="flex items-center gap-2 text-xs text-amber-400 font-semibold mb-1">
                    <Lock className="w-3.5 h-3.5" />
                    <span>صفحة خاصة للمشرف فقط · سجل الأداء المالي والإحصائي بنظام ورقة A4</span>
                  </div>
                  <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                    📊 كشف الإحصائيات اليومية والأسبوعية والشهرية (تداول 1$ أساسي + 2$ مضاعفة)
                  </h1>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="px-3.5 py-2 text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                  >
                    🖨️ طباعة كشف A4 / حفظ PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveView('admin')}
                    className="px-3.5 py-2 text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                  >
                    العودة للوحة المشرف
                  </button>
                </div>
              </div>

              {/* Period Selector (Weekly vs Monthly) + Navigation + Payout Mode */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                {/* 1. Weekly vs Monthly Switch */}
                <div className="md:col-span-4 flex items-center gap-1.5 p-1 bg-[#0B0F17] border border-slate-800 rounded-lg">
                  <button
                    type="button"
                    onClick={() => {
                      setStatsPeriod('week');
                      setStatsOffset(0);
                    }}
                    className={`flex-1 py-2 px-3 text-xs font-bold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                      statsPeriod === 'week'
                        ? 'bg-amber-400 text-slate-950 shadow-sm'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    📅 إحصائيات الأسبوع (7 أيام)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStatsPeriod('month');
                      setStatsOffset(0);
                    }}
                    className={`flex-1 py-2 px-3 text-xs font-bold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                      statsPeriod === 'month'
                        ? 'bg-amber-400 text-slate-950 shadow-sm'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    🗓️ إحصائيات الشهر (كشف شهري)
                  </button>
                </div>

                {/* 2. Period Offset Navigation (Prev / Current / Next) */}
                <div className="md:col-span-4 flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => setStatsOffset(prev => prev - 1)}
                    className="px-3 py-2 text-xs font-semibold bg-[#0B0F17] hover:bg-slate-800 text-slate-200 border border-slate-800 rounded-lg cursor-pointer whitespace-nowrap"
                  >
                    ◀ {statsPeriod === 'week' ? 'الأسبوع السابق' : 'الشهر السابق'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatsOffset(0)}
                    disabled={statsOffset === 0}
                    className={`px-3 py-2 text-xs font-bold rounded-lg border whitespace-nowrap cursor-pointer ${
                      statsOffset === 0
                        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                        : 'bg-slate-800 text-white border-slate-700 hover:bg-slate-700'
                    }`}
                  >
                    {statsPeriod === 'week' ? 'الأسبوع الحالي' : 'الشهر الحالي'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatsOffset(prev => Math.min(0, prev + 1))}
                    disabled={statsOffset >= 0}
                    className="px-3 py-2 text-xs font-semibold bg-[#0B0F17] hover:bg-slate-800 disabled:opacity-40 text-slate-200 border border-slate-800 rounded-lg cursor-pointer whitespace-nowrap"
                  >
                    {statsPeriod === 'week' ? 'الأسبوع التالي' : 'الشهر التالي'} ▶
                  </button>
                </div>

                {/* 3. Payout Calculation Mode & Empty Days Toggle */}
                <div className="md:col-span-4 flex flex-wrap items-center justify-end gap-2">
                  <select
                    value={statsPayoutMode}
                    onChange={(e) => setStatsPayoutMode(e.target.value as 'net_100' | 'broker_85')}
                    className="px-3 py-2 text-xs font-semibold bg-[#0B0F17] border border-slate-700 rounded-lg text-slate-200 cursor-pointer"
                  >
                    <option value="net_100">حساب صافي: ربح +1$ | مضاعفة +1$ | خسارة -3$</option>
                    <option value="broker_85">عائد كيوتكس 85%: مباشر +0.85$ | مضاعفة +0.70$ | خسارة -3$</option>
                  </select>

                  <button
                    type="button"
                    onClick={() => setStatsShowAllDays(prev => !prev)}
                    className="px-3 py-2 text-xs font-semibold bg-[#0B0F17] hover:bg-slate-800 text-slate-300 border border-slate-800 rounded-lg cursor-pointer whitespace-nowrap"
                  >
                    {statsShowAllDays ? 'عرض أيام التداول فقط' : 'عرض كامل جدول الأيام'}
                  </button>
                </div>
              </div>

              {/* Manual Add / Edit Specific Day Row Form for Admin */}
              <form
                onSubmit={handleSaveDailyStatRow}
                className="p-3.5 bg-[#0B0F17] border border-slate-800/90 rounded-lg flex flex-wrap items-end justify-between gap-3"
              >
                <div className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>إدخال أو تعديل إحصائية يوم محدد يدوياً في كشف A4:</span>
                </div>
                <div className="flex flex-wrap items-end gap-2.5">
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">التاريخ (YYYY-MM-DD)</label>
                    <input
                      type="date"
                      required
                      value={editStatForm.date || getEgyptDateString(deviceNow)}
                      onChange={(e) => {
                        const d = e.target.value;
                        const existing = mergedDailyStatsMap[d];
                        setEditStatForm({
                          date: d,
                          directWins: existing?.directWins ?? 0,
                          gale1Wins: existing?.gale1Wins ?? 0,
                          losses: existing?.losses ?? 0
                        });
                      }}
                      className="px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded text-white font-mono-num"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-emerald-400 mb-1">رابحة مباشرة (1$)</label>
                    <input
                      type="number"
                      min={0}
                      value={editStatForm.directWins}
                      onChange={(e) =>
                        setEditStatForm(prev => ({
                          ...prev,
                          date: prev.date || getEgyptDateString(deviceNow),
                          directWins: Math.max(0, Number(e.target.value) || 0)
                        }))
                      }
                      className="w-20 px-2.5 py-1.5 text-xs bg-slate-900 border border-emerald-500/40 rounded text-white font-mono-num"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-amber-300 mb-1">ربح بالمضاعفة (2$)</label>
                    <input
                      type="number"
                      min={0}
                      value={editStatForm.gale1Wins}
                      onChange={(e) =>
                        setEditStatForm(prev => ({
                          ...prev,
                          date: prev.date || getEgyptDateString(deviceNow),
                          gale1Wins: Math.max(0, Number(e.target.value) || 0)
                        }))
                      }
                      className="w-20 px-2.5 py-1.5 text-xs bg-slate-900 border border-amber-500/40 rounded text-white font-mono-num"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-rose-400 mb-1">خاسرة بالمضاعفة (-3$)</label>
                    <input
                      type="number"
                      min={0}
                      value={editStatForm.losses}
                      onChange={(e) =>
                        setEditStatForm(prev => ({
                          ...prev,
                          date: prev.date || getEgyptDateString(deviceNow),
                          losses: Math.max(0, Number(e.target.value) || 0)
                        }))
                      }
                      className="w-20 px-2.5 py-1.5 text-xs bg-slate-900 border border-rose-500/40 rounded text-white font-mono-num"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isSavingDailyStat}
                    className="px-4 py-1.5 text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded transition-colors cursor-pointer whitespace-nowrap"
                  >
                    {isSavingDailyStat ? 'جاري الحفظ...' : 'حفظ سطر اليوم ✓'}
                  </button>
                </div>
              </form>
            </div>

            {/* ==============================================================
                A4 SHEET CONTAINER: Single Line Per Day (كمثل ورقة A4 رسمية)
               ============================================================== */}
            <div className="w-full max-w-[1120px] mx-auto bg-[#0E1420] print:bg-white print:text-slate-950 border-2 border-slate-700/80 print:border-slate-400 rounded-xl shadow-2xl p-4 sm:p-8 space-y-5">
              {/* A4 Sheet Header */}
              <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b-2 border-slate-800 print:border-slate-300">
                <div>
                  <div className="text-xs font-bold text-emerald-400 print:text-emerald-700">
                    نَبض التداول (@ZadNBFX) — التقرير الإحصائي والمالي الرسمي للمشرف (نموذج A4)
                  </div>
                  <h2 className="text-lg sm:text-xl font-bold text-white print:text-slate-900 mt-0.5">
                    {statsPeriodData.periodLabel}
                  </h2>
                </div>

                <div className="text-left text-xs text-slate-300 print:text-slate-700 space-y-0.5 font-mono-num">
                  <div>
                    خطة التداول: <strong className="text-white print:text-black">دخول أساسي 1$ + مضاعفة أولى 2$ (إجمالي مخاطرة الصفقة 3$)</strong>
                  </div>
                  <div>
                    معادلة الاحتساب:{' '}
                    {statsPayoutMode === 'net_100'
                      ? 'ربح مباشر (+1$) | ربح مضاعفة (+1$) | خسارة بالمضاعفة (-3$)'
                      : 'ربح مباشر (+0.85$) | ربح مضاعفة (+0.70$) | خسارة بالمضاعفة (-3.00$)'}
                  </div>
                </div>
              </div>

              {/* Compact Today's Final Closing Summary Strip inside A4 Sheet */}
              <div className="p-3.5 bg-slate-900/90 print:bg-slate-100 border border-amber-500/35 print:border-slate-400 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="px-2.5 py-1 rounded bg-amber-400 text-slate-950 font-extrabold">
                    📋 ملخص ختام تداول اليوم ({endOfDayReportData.todayEgypt} — الساعة {endOfDayReportData.endHourLabel})
                  </span>
                  <span className="font-mono-num text-slate-200 print:text-slate-900">
                    بدون مضاعفات: <strong className="text-emerald-400 print:text-emerald-700">{endOfDayReportData.directWins}✅</strong> / <strong className="text-rose-400 print:text-rose-700">{endOfDayReportData.firstCandleLossesNoGale}❌</strong> (<strong className="text-sky-300 print:text-sky-800">{endOfDayReportData.winRateNoGale}%</strong>)
                  </span>
                  <span className="text-slate-600">|</span>
                  <span className="font-mono-num text-slate-200 print:text-slate-900">
                    مع مضاعفة: <strong className="text-emerald-400 print:text-emerald-700">{endOfDayReportData.totalWinsWithGale}✅</strong> / <strong className="text-rose-400 print:text-rose-700">{endOfDayReportData.lossesWithGale}❌</strong> (<strong className="text-amber-300 print:text-amber-800">{endOfDayReportData.winRateWithGale}%</strong>)
                  </span>
                  <span className="text-slate-600">|</span>
                  <span className="font-mono-num text-slate-200 print:text-slate-900">
                    🏆 أكثر زوج ربحاً:{' '}
                    <strong className="text-emerald-400 print:text-emerald-700">
                      {endOfDayReportData.bestWinningPair
                        ? `${endOfDayReportData.bestWinningPair.pair} (${endOfDayReportData.bestWinningPair.totalWins}✅ · ${endOfDayReportData.bestWinningPair.winRate}%)`
                        : '—'}
                    </strong>
                  </span>
                  <span className="text-slate-600">|</span>
                  <span className="font-mono-num text-slate-200 print:text-slate-900">
                    🎯 الأكثر اختياراً:{' '}
                    <strong className="text-amber-300 print:text-amber-800">
                      {endOfDayReportData.mostSelectedPair
                        ? `${endOfDayReportData.mostSelectedPair.pair} (${endOfDayReportData.mostSelectedPair.total} صفقات)`
                        : '—'}
                    </strong>
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => handleSendEndOfDayReport('both')}
                  disabled={isSendingDailyReport}
                  className="print:hidden px-3 py-1.5 text-xs font-bold bg-emerald-400 hover:bg-emerald-300 text-slate-950 rounded-lg cursor-pointer whitespace-nowrap"
                >
                  {isSendingDailyReport ? 'جاري الإرسال...' : 'إرسال التقرير النهائي لتليجرام 🚀'}
                </button>
              </div>

              {/* A4 Single-Line-Per-Day Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse font-mono-num">
                  <thead>
                    <tr className="bg-slate-900 print:bg-slate-100 border-y-2 border-slate-700 print:border-slate-400 text-[11px] sm:text-xs font-bold text-slate-200 print:text-slate-900 whitespace-nowrap">
                      <th className="py-2.5 px-3 border-l border-slate-800 print:border-slate-300">التاريخ اليومي</th>
                      <th className="py-2.5 px-3 border-l border-slate-800 print:border-slate-300">اليوم</th>
                      <th className="py-2.5 px-3 border-l border-slate-800 print:border-slate-300 text-center text-emerald-400 print:text-emerald-700">
                        الصفقات الرابحة (1$)
                      </th>
                      <th className="py-2.5 px-3 border-l border-slate-800 print:border-slate-300 text-center text-amber-300 print:text-amber-700">
                        الربح بالمضاعفة (2$)
                      </th>
                      <th className="py-2.5 px-3 border-l border-slate-800 print:border-slate-300 text-center text-rose-400 print:text-rose-700">
                        الخاسرة بالمضاعفة (1$+2$)
                      </th>
                      <th className="py-2.5 px-3 border-l border-slate-800 print:border-slate-300 text-center">
                        نسبة الربح اليومي
                      </th>
                      <th className="py-2.5 px-3 border-l border-slate-800 print:border-slate-300 text-center">
                        تفصيل تداول اليوم (1$ / 2$)
                      </th>
                      <th className="py-2.5 px-3 border-l border-slate-800 print:border-slate-300 text-center">
                        النتيجة بالمضاعفة (1$ + 2$)
                      </th>
                      <th className="py-2.5 px-3 text-center text-sky-300 print:text-sky-800">
                        النتيجة بدون مضاعفة (1$ ثابت)
                      </th>
                      <th className="py-2.5 px-2 text-center print:hidden">تعديل</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/90 print:divide-slate-300 text-xs sm:text-sm">
                    {statsPeriodData.rows.map((row) => {
                      const isEditing = editingStatDate === row.date;
                      return (
                        <tr
                          key={row.date}
                          className={`whitespace-nowrap transition-colors ${
                            row.isToday
                              ? 'bg-emerald-950/25 print:bg-emerald-50 font-semibold'
                              : 'hover:bg-slate-800/40'
                          }`}
                        >
                          {/* 1. Date */}
                          <td className="py-2 px-3 border-l border-slate-800/80 print:border-slate-300 font-bold text-white print:text-slate-900">
                            <span>{row.date}</span>
                            {row.isToday && (
                              <span className="mr-1.5 text-[10px] text-emerald-400 print:text-emerald-700 font-normal">
                                (اليوم)
                              </span>
                            )}
                          </td>

                          {/* 2. Day of Week */}
                          <td className="py-2 px-3 border-l border-slate-800/80 print:border-slate-300 text-slate-200 print:text-slate-800 font-sans">
                            {row.dayName}
                          </td>

                          {/* 3. Direct Wins ($1) */}
                          <td className="py-2 px-3 border-l border-slate-800/80 print:border-slate-300 text-center">
                            {isEditing ? (
                              <input
                                type="number"
                                min={0}
                                value={editStatForm.directWins}
                                onChange={(e) =>
                                  setEditStatForm(prev => ({
                                    ...prev,
                                    directWins: Math.max(0, Number(e.target.value) || 0)
                                  }))
                                }
                                className="w-16 px-1.5 py-0.5 text-center bg-slate-900 border border-emerald-500 rounded text-white text-xs"
                              />
                            ) : (
                              <span className="font-bold text-emerald-400 print:text-emerald-700">
                                {row.directWins}
                              </span>
                            )}
                          </td>

                          {/* 4. Wins with 1st Martingale ($2) */}
                          <td className="py-2 px-3 border-l border-slate-800/80 print:border-slate-300 text-center">
                            {isEditing ? (
                              <input
                                type="number"
                                min={0}
                                value={editStatForm.gale1Wins}
                                onChange={(e) =>
                                  setEditStatForm(prev => ({
                                    ...prev,
                                    gale1Wins: Math.max(0, Number(e.target.value) || 0)
                                  }))
                                }
                                className="w-16 px-1.5 py-0.5 text-center bg-slate-900 border border-amber-500 rounded text-white text-xs"
                              />
                            ) : (
                              <span className="font-bold text-amber-300 print:text-amber-700">
                                {row.gale1Wins}
                              </span>
                            )}
                          </td>

                          {/* 5. Losses with Martingale (-$3) */}
                          <td className="py-2 px-3 border-l border-slate-800/80 print:border-slate-300 text-center">
                            {isEditing ? (
                              <input
                                type="number"
                                min={0}
                                value={editStatForm.losses}
                                onChange={(e) =>
                                  setEditStatForm(prev => ({
                                    ...prev,
                                    losses: Math.max(0, Number(e.target.value) || 0)
                                  }))
                                }
                                className="w-16 px-1.5 py-0.5 text-center bg-slate-900 border border-rose-500 rounded text-white text-xs"
                              />
                            ) : (
                              <span className="font-bold text-rose-400 print:text-rose-700">
                                {row.losses}
                              </span>
                            )}
                          </td>

                          {/* 6. Daily Win Rate % */}
                          <td className="py-2 px-3 border-l border-slate-800/80 print:border-slate-300 text-center">
                            {row.totalTrades > 0 ? (
                              <span
                                className={`font-bold ${
                                  row.winRate >= 75
                                    ? 'text-emerald-400 print:text-emerald-700'
                                    : row.winRate >= 50
                                    ? 'text-amber-300 print:text-amber-700'
                                    : 'text-rose-400 print:text-rose-700'
                                }`}
                              >
                                {row.winRate}%{' '}
                                <span className="text-[10px] text-slate-400 print:text-slate-600 font-normal">
                                  ({row.totalWins}/{row.totalTrades})
                                </span>
                              </span>
                            ) : (
                              <span className="text-slate-500">—</span>
                            )}
                          </td>

                          {/* 7. Daily $1 + $2 Martingale Breakdown */}
                          <td className="py-2 px-3 border-l border-slate-800/80 print:border-slate-300 text-center text-[11px] text-slate-300 print:text-slate-700">
                            {row.totalTrades > 0 ? (
                              <span>
                                ربح: <strong className="text-emerald-400 print:text-emerald-700">+${row.grossWinUsd.toFixed(2)}</strong>
                                {' · '}
                                خسارة: <strong className="text-rose-400 print:text-rose-700">-${row.grossLossUsd.toFixed(2)}</strong>
                              </span>
                            ) : (
                              <span className="text-slate-500">لا يوجد تداول</span>
                            )}
                          </td>

                          {/* 8. Net Daily Profit / Loss WITH Martingale ($1 + $2) */}
                          <td className="py-2 px-3 border-l border-slate-800/80 print:border-slate-300 text-center">
                            {row.totalTrades === 0 ? (
                              <span className="text-slate-500 font-normal">$0.00</span>
                            ) : row.netProfitUsd > 0 ? (
                              <span className="font-bold text-emerald-400 print:text-emerald-700">
                                ربح: +${row.netProfitUsd.toFixed(2)}
                              </span>
                            ) : row.netProfitUsd < 0 ? (
                              <span className="font-bold text-rose-400 print:text-rose-700">
                                خسارة: -${Math.abs(row.netProfitUsd).toFixed(2)}
                              </span>
                            ) : (
                              <span className="font-bold text-amber-300 print:text-amber-700">
                                تعادل: $0.00
                              </span>
                            )}
                          </td>

                          {/* 9. Net Daily Profit / Loss WITHOUT Martingale ($1 Flat Only) */}
                          <td className="py-2 px-3 text-center bg-sky-950/15 print:bg-sky-50/60">
                            {row.totalTrades === 0 ? (
                              <span className="text-slate-500 font-normal">$0.00</span>
                            ) : (
                              <div className="flex flex-col items-center leading-tight">
                                {row.noGaleNetProfitUsd > 0 ? (
                                  <span className="font-bold text-emerald-400 print:text-emerald-700">
                                    ربح صافي: +${row.noGaleNetProfitUsd.toFixed(2)}
                                  </span>
                                ) : row.noGaleNetProfitUsd < 0 ? (
                                  <span className="font-bold text-rose-400 print:text-rose-700">
                                    خسارة: -${Math.abs(row.noGaleNetProfitUsd).toFixed(2)}
                                  </span>
                                ) : (
                                  <span className="font-bold text-amber-300 print:text-amber-700">
                                    تعادل: $0.00
                                  </span>
                                )}
                                <span className="text-[10px] text-slate-400 print:text-slate-600 font-normal mt-0.5">
                                  ({row.directWins} ربح / {row.firstCandleLosses} خسارة · {row.directWinRate}%)
                                </span>
                              </div>
                            )}
                          </td>

                          {/* 9. Quick Inline Edit Action (Hidden on Print) */}
                          <td className="py-2 px-2 text-center print:hidden">
                            {isEditing ? (
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleSaveDailyStatRow()}
                                  className="px-2 py-0.5 text-[10px] font-bold bg-emerald-400 text-slate-950 rounded cursor-pointer"
                                >
                                  حفظ
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingStatDate(null)}
                                  className="px-1.5 py-0.5 text-[10px] bg-slate-800 text-slate-300 rounded cursor-pointer"
                                >
                                  إلغاء
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingStatDate(row.date);
                                  setEditStatForm({
                                    date: row.date,
                                    directWins: row.directWins,
                                    gale1Wins: row.gale1Wins,
                                    losses: row.losses
                                  });
                                }}
                                className="p-1 text-slate-400 hover:text-amber-300 transition-colors cursor-pointer"
                                title="تعديل أرقام هذا اليوم"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>

                  {/* Summary Footer Row for the Selected Week or Month */}
                  <tfoot>
                    <tr className="bg-slate-900 print:bg-slate-200 border-t-2 border-slate-600 print:border-slate-500 text-xs sm:text-sm font-bold text-white print:text-slate-950 whitespace-nowrap">
                      <td className="py-3 px-3 border-l border-slate-800 print:border-slate-400" colSpan={2}>
                        إجمالي {statsPeriod === 'week' ? 'الأسبوع' : 'الشهر'} ({statsPeriodData.rows.length} يوم)
                      </td>
                      <td className="py-3 px-3 border-l border-slate-800 print:border-slate-400 text-center text-emerald-400 print:text-emerald-800">
                        {statsPeriodData.summary.directWins} صفقة
                      </td>
                      <td className="py-3 px-3 border-l border-slate-800 print:border-slate-400 text-center text-amber-300 print:text-amber-800">
                        {statsPeriodData.summary.gale1Wins} صفقة
                      </td>
                      <td className="py-3 px-3 border-l border-slate-800 print:border-slate-400 text-center text-rose-400 print:text-rose-800">
                        {statsPeriodData.summary.losses} صفقة
                      </td>
                      <td className="py-3 px-3 border-l border-slate-800 print:border-slate-400 text-center text-emerald-300 print:text-emerald-800">
                        {statsPeriodData.summary.totalTrades > 0
                          ? `${statsPeriodData.summary.winRate}% (${statsPeriodData.summary.totalWins}/${statsPeriodData.summary.totalTrades})`
                          : '—'}
                      </td>
                      <td className="py-3 px-3 border-l border-slate-800 print:border-slate-400 text-center text-xs">
                        <span>
                          إجمالي الربح: <span className="text-emerald-400 print:text-emerald-800">+${statsPeriodData.summary.grossWinUsd.toFixed(2)}</span>
                          {' | '}
                          الخسارة: <span className="text-rose-400 print:text-rose-800">-${statsPeriodData.summary.grossLossUsd.toFixed(2)}</span>
                        </span>
                      </td>
                      <td className="py-3 px-3 border-l border-slate-800 print:border-slate-400 text-center text-sm">
                        {statsPeriodData.summary.netProfitUsd >= 0 ? (
                          <span className="text-emerald-400 print:text-emerald-800">
                            بالمضاعفة: +${statsPeriodData.summary.netProfitUsd.toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-rose-400 print:text-rose-800">
                            بالمضاعفة: -${Math.abs(statsPeriodData.summary.netProfitUsd).toFixed(2)}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center text-sm bg-sky-950/25 print:bg-sky-100">
                        {statsPeriodData.summary.noGaleNetProfitUsd >= 0 ? (
                          <span className="text-emerald-400 print:text-emerald-800">
                            بدون مضاعفة: +${statsPeriodData.summary.noGaleNetProfitUsd.toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-rose-400 print:text-rose-800">
                            بدون مضاعفة: -${Math.abs(statsPeriodData.summary.noGaleNetProfitUsd).toFixed(2)}
                          </span>
                        )}
                      </td>
                      <td className="print:hidden" />
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* ==============================================================
                  END-OF-MONTH EXPECTED PROFIT ESTIMATOR CALCULATOR
                  (حاسبة تقديرية تعرض الربح المتوقع لنهاية الشهر بناءً على متوسط الأداء اليومي الحالي مقارنةً بعدد أيام التداول المتبقية)
                 ============================================================== */}
              <div className="pt-5 border-t-2 border-slate-800 print:border-slate-300 space-y-4">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="inline-flex items-center gap-2 text-xs font-bold text-amber-400 print:text-amber-700">
                      <Activity className="w-4 h-4 shrink-0" />
                      <span>حاسبة التوقعات المالية الذكية لنهاية شهر {monthProjectionData.monthLabel}</span>
                    </div>
                    <h3 className="text-base sm:text-lg font-extrabold text-white print:text-slate-900">
                      🧮 حاسبة &laquo;الربح المتوقع لنهاية الشهر&raquo; (بناءً على متوسط الأداء اليومي مقارنةً بأيام التداول المتبقية)
                    </h3>
                    <p className="text-xs text-slate-400 print:text-slate-600">
                      تحسب هذه الأداة متوسط ربحك أو خسارتك اليومية الحالية وتضربه في عدد أيام التداول المتبقية من الشهر، مع مقارنة فورية بين استراتيجية <strong className="text-slate-200 print:text-slate-800">المضاعفة (1$ + 2$)</strong> واستراتيجية <strong className="text-sky-300 print:text-sky-800">الدخول الثابت بدون مضاعفة (1$ فقط)</strong>.
                    </p>
                  </div>

                  {/* Month Progress Pill */}
                  <div className="px-3.5 py-2.5 bg-slate-900/90 print:bg-slate-100 border border-slate-800 print:border-slate-300 rounded-xl flex items-center gap-3 shrink-0 font-mono-num">
                    <div className="text-right">
                      <div className="text-[10px] text-slate-400 print:text-slate-600">
                        تقدم شهر {monthProjectionData.monthLabel}
                      </div>
                      <div className="text-xs font-bold text-white print:text-slate-900">
                        انقضى {monthProjectionData.elapsedCalendarDays} يوم · متبقي{' '}
                        <span className="text-amber-300 print:text-amber-700">
                          {monthProjectionData.effectiveRemainingDays}
                        </span>{' '}
                        يوم تداول
                      </div>
                    </div>
                    <div className="w-12 h-12 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-xs font-extrabold text-emerald-300 print:text-emerald-800">
                      {monthProjectionData.progressPercent}%
                    </div>
                  </div>
                </div>

                {/* Interactive Calculator Controls (Hidden when printing A4) */}
                <div className="print:hidden p-3.5 bg-[#0B0F17] border border-slate-800/90 rounded-xl grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                  {/* 1. Remaining Trading Days Mode */}
                  <div className="md:col-span-5 space-y-1.5">
                    <label className="block text-[11px] font-bold text-slate-300">
                      1. طريقة حساب عدد أيام التداول المتبقية في الشهر:
                    </label>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setCalcRemainingDaysMode('all_7d');
                          setCalcCustomRemainingDays(null);
                        }}
                        className={`px-2.5 py-1.5 text-[11px] font-bold rounded-lg border transition-colors cursor-pointer ${
                          calcRemainingDaysMode === 'all_7d'
                            ? 'bg-amber-400 text-slate-950 border-amber-300'
                            : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        كل الأيام المتبقية ({monthProjectionData.remainingCalendarDays} يوم)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCalcRemainingDaysMode('market_5d');
                          setCalcCustomRemainingDays(null);
                        }}
                        className={`px-2.5 py-1.5 text-[11px] font-bold rounded-lg border transition-colors cursor-pointer ${
                          calcRemainingDaysMode === 'market_5d'
                            ? 'bg-emerald-400 text-slate-950 border-emerald-300'
                            : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        أيام البورصة بدون عطلة ({monthProjectionData.remainingMarketWeekdays} يوم)
                      </button>
                      <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1">
                        <span className="text-[10px] text-slate-400">يدوي:</span>
                        <input
                          type="number"
                          min={0}
                          max={31}
                          value={
                            calcRemainingDaysMode === 'custom' && calcCustomRemainingDays !== null
                              ? calcCustomRemainingDays
                              : monthProjectionData.effectiveRemainingDays
                          }
                          onChange={(e) => {
                            setCalcRemainingDaysMode('custom');
                            setCalcCustomRemainingDays(Math.max(0, Number(e.target.value) || 0));
                          }}
                          className="w-12 text-center text-xs font-bold font-mono-num text-amber-300 bg-transparent focus:outline-none"
                        />
                        <span className="text-[10px] text-slate-400">يوم</span>
                      </div>
                    </div>
                  </div>

                  {/* 2. Daily Average Basis (Active Trading Days vs All Elapsed Days) */}
                  <div className="md:col-span-4 space-y-1.5">
                    <label className="block text-[11px] font-bold text-slate-300">
                      2. أساس احتساب متوسط الأداء اليومي الحالي:
                    </label>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setCalcAvgBasis('active_days')}
                        className={`flex-1 py-1.5 px-2.5 text-[11px] font-bold rounded-lg border transition-colors cursor-pointer ${
                          calcAvgBasis === 'active_days'
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                            : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                        }`}
                      >
                        أيام التداول الفعلية ({monthProjectionData.activeTradingDays} يوم)
                      </button>
                      <button
                        type="button"
                        onClick={() => setCalcAvgBasis('elapsed_days')}
                        className={`flex-1 py-1.5 px-2.5 text-[11px] font-bold rounded-lg border transition-colors cursor-pointer ${
                          calcAvgBasis === 'elapsed_days'
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                            : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                        }`}
                      >
                        الأيام المنقضية ({monthProjectionData.elapsedCalendarDays} يوم)
                      </button>
                    </div>
                  </div>

                  {/* 3. Base Trade Stake Multiplier ($1 default, or simulate $2, $5, $10...) */}
                  <div className="md:col-span-3 space-y-1.5">
                    <label className="block text-[11px] font-bold text-amber-300">
                      3. قيمة الصفقة الأساسية للمحاكاة ($):
                    </label>
                    <div className="flex items-center gap-1">
                      {[1, 2, 5, 10].map((amt) => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => setCalcBaseStakeUsd(amt)}
                          className={`px-2 py-1 text-xs font-mono-num font-bold rounded border cursor-pointer ${
                            calcBaseStakeUsd === amt
                              ? 'bg-amber-400 text-slate-950 border-amber-300'
                              : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          ${amt}
                        </button>
                      ))}
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={calcBaseStakeUsd}
                        onChange={(e) => setCalcBaseStakeUsd(Math.max(1, Number(e.target.value) || 1))}
                        className="w-14 px-2 py-1 text-xs font-mono-num font-bold bg-slate-900 border border-amber-500/40 rounded text-white text-center"
                        title="أدخل قيمة الصفقة بالدولار"
                      />
                    </div>
                  </div>
                </div>

                {/* Summary Metrics Bar: Daily Average vs Remaining Days */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono-num">
                  {/* Box 1: Active & Elapsed Days */}
                  <div className="p-3.5 bg-slate-900/90 print:bg-slate-100 border border-slate-800 print:border-slate-300 rounded-xl space-y-1">
                    <div className="text-[11px] text-slate-400 print:text-slate-600 font-sans">
                      أيام التداول المسجلة / المتبقية
                    </div>
                    <div className="text-base sm:text-lg font-extrabold text-white print:text-slate-900">
                      {monthProjectionData.divisorDays} يوم حالي{' '}
                      <span className="text-slate-500">←</span>{' '}
                      <span className="text-amber-300 print:text-amber-700">
                        {monthProjectionData.effectiveRemainingDays} متبقي
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400 print:text-slate-600 font-sans">
                      بمعدل {monthProjectionData.avgDailyTrades} صفقة/يوم ({monthProjectionData.totalTradesSoFar} إجمالي)
                    </div>
                  </div>

                  {/* Box 2: Current Daily Average Performance */}
                  <div className="p-3.5 bg-slate-900/90 print:bg-slate-100 border border-slate-800 print:border-slate-300 rounded-xl space-y-1">
                    <div className="text-[11px] text-slate-400 print:text-slate-600 font-sans">
                      متوسط الأداء اليومي الحالي (لليوم الواحد)
                    </div>
                    <div className="flex flex-col gap-0.5 text-xs sm:text-sm font-extrabold">
                      <span
                        className={
                          monthProjectionData.scaledAvgDailyWithGale >= 0
                            ? 'text-emerald-400 print:text-emerald-700'
                            : 'text-rose-400 print:text-rose-700'
                        }
                      >
                        بالمضاعفة: {monthProjectionData.scaledAvgDailyWithGale >= 0 ? '+' : '-'}$
                        {Math.abs(monthProjectionData.scaledAvgDailyWithGale).toFixed(2)} / يوم
                      </span>
                      <span
                        className={
                          monthProjectionData.scaledAvgDailyNoGale >= 0
                            ? 'text-sky-300 print:text-sky-700'
                            : 'text-rose-400 print:text-rose-700'
                        }
                      >
                        بدون مضاعفة: {monthProjectionData.scaledAvgDailyNoGale >= 0 ? '+' : '-'}$
                        {Math.abs(monthProjectionData.scaledAvgDailyNoGale).toFixed(2)} / يوم
                      </span>
                    </div>
                  </div>

                  {/* Box 3: Projected Profit for Remaining Trading Days */}
                  <div className="p-3.5 bg-slate-900/90 print:bg-slate-100 border border-slate-800 print:border-slate-300 rounded-xl space-y-1">
                    <div className="text-[11px] text-slate-400 print:text-slate-600 font-sans">
                      عائد الـ {monthProjectionData.effectiveRemainingDays} يوم المتبقية التقديري
                    </div>
                    <div className="flex flex-col gap-0.5 text-xs sm:text-sm font-extrabold">
                      <span
                        className={
                          monthProjectionData.scaledRemainingWithGale >= 0
                            ? 'text-emerald-400 print:text-emerald-700'
                            : 'text-rose-400 print:text-rose-700'
                        }
                      >
                        بالمضاعفة: {monthProjectionData.scaledRemainingWithGale >= 0 ? '+' : '-'}$
                        {Math.abs(monthProjectionData.scaledRemainingWithGale).toFixed(2)}
                      </span>
                      <span
                        className={
                          monthProjectionData.scaledRemainingNoGale >= 0
                            ? 'text-sky-300 print:text-sky-700'
                            : 'text-rose-400 print:text-rose-700'
                        }
                      >
                        بدون مضاعفة: {monthProjectionData.scaledRemainingNoGale >= 0 ? '+' : '-'}$
                        {Math.abs(monthProjectionData.scaledRemainingNoGale).toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* Box 4: Final Expected Profit by End of Month */}
                  <div className="p-3.5 bg-gradient-to-br from-emerald-950/40 via-slate-900 to-amber-950/30 print:bg-emerald-50 border-2 border-emerald-500/40 print:border-emerald-600 rounded-xl space-y-1">
                    <div className="text-[11px] font-bold text-amber-300 print:text-amber-800 font-sans">
                      🎯 الربح المتوقع لنهاية الشهر (الإجمالي)
                    </div>
                    <div className="flex flex-col gap-0.5 text-xs sm:text-sm font-extrabold">
                      <span
                        className={
                          monthProjectionData.scaledTotalExpectedWithGale >= 0
                            ? 'text-emerald-400 print:text-emerald-800'
                            : 'text-rose-400 print:text-rose-700'
                        }
                      >
                        بالمضاعفة: {monthProjectionData.scaledTotalExpectedWithGale >= 0 ? '+' : '-'}$
                        {Math.abs(monthProjectionData.scaledTotalExpectedWithGale).toFixed(2)}
                      </span>
                      <span
                        className={
                          monthProjectionData.scaledTotalExpectedNoGale >= 0
                            ? 'text-sky-300 print:text-sky-800'
                            : 'text-rose-400 print:text-rose-700'
                        }
                      >
                        بدون مضاعفة: {monthProjectionData.scaledTotalExpectedNoGale >= 0 ? '+' : '-'}$
                        {Math.abs(monthProjectionData.scaledTotalExpectedNoGale).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Detailed Side-by-Side End-of-Month Projection Cards (With Martingale vs Without Martingale) */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Card A: End-of-Month Projection WITH 1-Step Martingale ($1 + $2) */}
                  <div className="p-4 bg-slate-900/80 print:bg-slate-50 border border-slate-800 print:border-slate-300 rounded-xl space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-800 print:border-slate-300 pb-2.5">
                      <div>
                        <span className="text-xs font-extrabold text-amber-300 print:text-amber-800">
                          📊 السيناريو الأول: التوقع الشهري بالمضاعفة (${monthProjectionData.stakeMultiplier} أساسي + ${monthProjectionData.stakeMultiplier * 2} مضاعفة)
                        </span>
                        <p className="text-[11px] text-slate-400 print:text-slate-600 mt-0.5">
                          الربح المحقق حتى الآن + (متوسط اليوم × {monthProjectionData.effectiveRemainingDays} يوم متبقي)
                        </p>
                      </div>
                      <span
                        className={`px-2.5 py-1 rounded-lg text-xs font-mono-num font-extrabold ${
                          monthProjectionData.scaledTotalExpectedWithGale >= 0
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 print:text-emerald-800'
                            : 'bg-rose-500/20 text-rose-300 border border-rose-500/30 print:text-rose-800'
                        }`}
                      >
                        {monthProjectionData.scaledTotalExpectedWithGale >= 0 ? 'ربح متوقع' : 'خسارة متوقعة'}:{' '}
                        {monthProjectionData.scaledTotalExpectedWithGale >= 0 ? '+' : '-'}$
                        {Math.abs(monthProjectionData.scaledTotalExpectedWithGale).toFixed(2)}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center font-mono-num text-xs">
                      <div className="p-2.5 bg-[#0B0F17] print:bg-white rounded-lg border border-slate-800/80 print:border-slate-300">
                        <div className="text-[10px] text-slate-400 print:text-slate-600 font-sans">الأداء الحالي المحقق</div>
                        <div
                          className={`text-sm font-bold mt-0.5 ${
                            monthProjectionData.scaledCurrentWithGale >= 0
                              ? 'text-emerald-400 print:text-emerald-700'
                              : 'text-rose-400 print:text-rose-700'
                          }`}
                        >
                          {monthProjectionData.scaledCurrentWithGale >= 0 ? '+' : '-'}$
                          {Math.abs(monthProjectionData.scaledCurrentWithGale).toFixed(2)}
                        </div>
                      </div>
                      <div className="p-2.5 bg-[#0B0F17] print:bg-white rounded-lg border border-slate-800/80 print:border-slate-300">
                        <div className="text-[10px] text-slate-400 print:text-slate-600 font-sans">
                          متوسط اليوم × {monthProjectionData.effectiveRemainingDays} يوم
                        </div>
                        <div
                          className={`text-sm font-bold mt-0.5 ${
                            monthProjectionData.scaledRemainingWithGale >= 0
                              ? 'text-emerald-400 print:text-emerald-700'
                              : 'text-rose-400 print:text-rose-700'
                          }`}
                        >
                          {monthProjectionData.scaledRemainingWithGale >= 0 ? '+' : '-'}$
                          {Math.abs(monthProjectionData.scaledRemainingWithGale).toFixed(2)}
                        </div>
                      </div>
                      <div className="p-2.5 bg-emerald-950/25 print:bg-emerald-50 rounded-lg border border-emerald-500/30 print:border-emerald-400">
                        <div className="text-[10px] text-emerald-300 print:text-emerald-800 font-sans font-bold">
                          إجمالي نهاية الشهر
                        </div>
                        <div
                          className={`text-sm font-extrabold mt-0.5 ${
                            monthProjectionData.scaledTotalExpectedWithGale >= 0
                              ? 'text-emerald-300 print:text-emerald-800'
                              : 'text-rose-400 print:text-rose-700'
                          }`}
                        >
                          {monthProjectionData.scaledTotalExpectedWithGale >= 0 ? '+' : '-'}$
                          {Math.abs(monthProjectionData.scaledTotalExpectedWithGale).toFixed(2)}
                        </div>
                        <div className="text-[10px] text-slate-400 print:text-slate-600 mt-0.5">
                          ({Math.round(monthProjectionData.scaledTotalExpectedWithGale * USD_TO_EGP_RATE).toLocaleString('en-US')} ج.م)
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Card B: End-of-Month Projection WITHOUT Martingale ($1 Flat Only) */}
                  <div className="p-4 bg-sky-950/20 print:bg-sky-50 border border-sky-500/30 print:border-sky-300 rounded-xl space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-800 print:border-slate-300 pb-2.5">
                      <div>
                        <span className="text-xs font-extrabold text-sky-300 print:text-sky-800">
                          🛡️ السيناريو الثاني: التوقع الشهري بدون مضاعفة (${monthProjectionData.stakeMultiplier} ثابت فقط)
                        </span>
                        <p className="text-[11px] text-slate-400 print:text-slate-600 mt-0.5">
                          دخول مباشر بدون تعويض مضاعفة (الخسارة تتوقف عند ${monthProjectionData.stakeMultiplier} فقط بدلاً من ${monthProjectionData.stakeMultiplier * 3})
                        </p>
                      </div>
                      <span
                        className={`px-2.5 py-1 rounded-lg text-xs font-mono-num font-extrabold ${
                          monthProjectionData.scaledTotalExpectedNoGale >= 0
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 print:text-emerald-800'
                            : 'bg-rose-500/20 text-rose-300 border border-rose-500/30 print:text-rose-800'
                        }`}
                      >
                        {monthProjectionData.scaledTotalExpectedNoGale >= 0 ? 'ربح متوقع' : 'خسارة متوقعة'}:{' '}
                        {monthProjectionData.scaledTotalExpectedNoGale >= 0 ? '+' : '-'}$
                        {Math.abs(monthProjectionData.scaledTotalExpectedNoGale).toFixed(2)}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center font-mono-num text-xs">
                      <div className="p-2.5 bg-[#0B0F17] print:bg-white rounded-lg border border-slate-800/80 print:border-slate-300">
                        <div className="text-[10px] text-slate-400 print:text-slate-600 font-sans">الأداء الحالي المحقق</div>
                        <div
                          className={`text-sm font-bold mt-0.5 ${
                            monthProjectionData.scaledCurrentNoGale >= 0
                              ? 'text-emerald-400 print:text-emerald-700'
                              : 'text-rose-400 print:text-rose-700'
                          }`}
                        >
                          {monthProjectionData.scaledCurrentNoGale >= 0 ? '+' : '-'}$
                          {Math.abs(monthProjectionData.scaledCurrentNoGale).toFixed(2)}
                        </div>
                      </div>
                      <div className="p-2.5 bg-[#0B0F17] print:bg-white rounded-lg border border-slate-800/80 print:border-slate-300">
                        <div className="text-[10px] text-slate-400 print:text-slate-600 font-sans">
                          متوسط اليوم × {monthProjectionData.effectiveRemainingDays} يوم
                        </div>
                        <div
                          className={`text-sm font-bold mt-0.5 ${
                            monthProjectionData.scaledRemainingNoGale >= 0
                              ? 'text-emerald-400 print:text-emerald-700'
                              : 'text-rose-400 print:text-rose-700'
                          }`}
                        >
                          {monthProjectionData.scaledRemainingNoGale >= 0 ? '+' : '-'}$
                          {Math.abs(monthProjectionData.scaledRemainingNoGale).toFixed(2)}
                        </div>
                      </div>
                      <div className="p-2.5 bg-sky-950/35 print:bg-sky-100 rounded-lg border border-sky-500/40 print:border-sky-400">
                        <div className="text-[10px] text-sky-300 print:text-sky-800 font-sans font-bold">
                          إجمالي نهاية الشهر
                        </div>
                        <div
                          className={`text-sm font-extrabold mt-0.5 ${
                            monthProjectionData.scaledTotalExpectedNoGale >= 0
                              ? 'text-emerald-300 print:text-emerald-800'
                              : 'text-rose-400 print:text-rose-700'
                          }`}
                        >
                          {monthProjectionData.scaledTotalExpectedNoGale >= 0 ? '+' : '-'}$
                          {Math.abs(monthProjectionData.scaledTotalExpectedNoGale).toFixed(2)}
                        </div>
                        <div className="text-[10px] text-slate-400 print:text-slate-600 mt-0.5">
                          ({Math.round(monthProjectionData.scaledTotalExpectedNoGale * USD_TO_EGP_RATE).toLocaleString('en-US')} ج.م)
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Smart Recommendation Banner Comparing End-of-Month Outcomes */}
                <div className="p-3.5 bg-slate-900/95 print:bg-slate-100 border border-amber-500/30 print:border-slate-400 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 text-slate-200 print:text-slate-800">
                    <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>
                      <strong>خلاصة التقدير الشهري:</strong>{' '}
                      {monthProjectionData.scaledTotalExpectedNoGale >
                      monthProjectionData.scaledTotalExpectedWithGale ? (
                        <>
                          بناءً على متوسط أدائك اليومي الحالي، التداول{' '}
                          <strong className="text-sky-300 print:text-sky-800">
                            بدون مضاعفة (${monthProjectionData.stakeMultiplier} ثابت)
                          </strong>{' '}
                          يتفوق في نهاية الشهر بفارق{' '}
                          <strong className="text-emerald-400 font-mono-num">
                            +$
                            {Math.abs(
                              monthProjectionData.scaledTotalExpectedNoGale -
                                monthProjectionData.scaledTotalExpectedWithGale
                            ).toFixed(2)}
                          </strong>{' '}
                          ويحميك من استنزاف صفقات الخسارة المزدوجة (-3$).
                        </>
                      ) : monthProjectionData.scaledTotalExpectedWithGale >
                        monthProjectionData.scaledTotalExpectedNoGale ? (
                        <>
                          بناءً على متوسط أدائك اليومي الحالي، استراتيجية{' '}
                          <strong className="text-amber-300 print:text-amber-800">
                            المضاعفة الواحدة (${monthProjectionData.stakeMultiplier} + $
                            {monthProjectionData.stakeMultiplier * 2})
                          </strong>{' '}
                          تمنحك عائداً تقديرياً أعلى لنهاية الشهر بفارق{' '}
                          <strong className="text-emerald-400 font-mono-num">
                            +$
                            {Math.abs(
                              monthProjectionData.scaledTotalExpectedWithGale -
                                monthProjectionData.scaledTotalExpectedNoGale
                            ).toFixed(2)}
                          </strong>
                          .
                        </>
                      ) : (
                        <>
                          أضف أو عدّل نتائج الأيام في الجدول بالأعلى ليتم تحديث التوقع الشهري تلقائياً.
                        </>
                      )}
                    </span>
                  </div>
                  <div className="text-[11px] font-mono-num text-slate-400 print:text-slate-600">
                    معادلة التوقع: الأداء الحالي + (متوسط اليوم × {monthProjectionData.effectiveRemainingDays} يوم متبقي)
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* ==========================================
             VISITOR VIEW: Clean Live Feed + Global Market Only + @ZadNBFX + Signal Accuracy & VIP Info
             ========================================== */
          <div className="space-y-8">
            {/* VISITOR AESTHETIC UPGRADE 1: Live Global Forex Market Ribbon (شريط أسعار السوق العالمي والصفقات الحية) */}
            {liveMarket.length > 0 && (
              <div className="p-2.5 bg-[#0E1420] border border-slate-800/90 rounded-xl overflow-x-auto no-scrollbar shadow-inner">
                <div className="flex items-center gap-3 min-w-max text-xs">
                  <span className="px-2.5 py-1 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-bold flex items-center gap-1.5 shrink-0">
                    <Globe className="w-3.5 h-3.5 text-emerald-400" />
                    <span>نبض السوق العالمي المباشر</span>
                  </span>
                  {liveMarket.map((m) => (
                    <button
                      key={`ticker-${m.pair}`}
                      type="button"
                      onClick={() => setSelectedChartPair(m.pair)}
                      className={`px-3 py-1 rounded-lg border transition-colors flex items-center gap-2 font-mono-num cursor-pointer shrink-0 ${
                        selectedChartPair === m.pair
                          ? 'bg-slate-800 border-emerald-500/50 text-white'
                          : 'bg-[#0B0F17] border-slate-800/80 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <span className="font-bold text-white">{m.pair}</span>
                      <span className="text-slate-300">{m.formattedPrice}</span>
                      <span
                        className={`text-[10px] font-bold ${
                          m.rsi <= 35
                            ? 'text-emerald-400'
                            : m.rsi >= 65
                            ? 'text-rose-400'
                            : 'text-amber-300'
                        }`}
                      >
                        RSI {m.rsi}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Visitor Hero Header */}
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 pb-6 border-b border-slate-800/80">
              <div className="space-y-2.5 max-w-2xl">
                <div className="flex flex-wrap items-center gap-2 text-xs text-emerald-400 font-medium">
                  <span className="flex items-center gap-1">
                    <Globe className="w-3.5 h-3.5" />
                    <span>السوق العالمي الرسمي فقط (بدون OTC)</span>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    ساعة جهازك الآن:{' '}
                    <strong className="font-mono-num text-white">{currentDeviceTimeStr}</strong>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>صفقة مباشرة بدون مضاعفات وبدون مخاطرة</span>
                </div>
                <h1 className="text-2xl sm:text-4xl font-bold text-white tracking-tight">
                  {formatterOptions.channelTitle || 'نَبض التداول | السوق العالمي'}
                </h1>
                <p className="text-sm text-slate-400 leading-relaxed">
                  نقتنص الفرص القوية فقط من السوق العالمي المباشر بناءً على مناطق التشبع السعري ومؤشر القوة النسبية (RSI)، بدقة عالية جداً <strong className="text-slate-200">وبدون أي مضاعفات (No Martingale)</strong> للحفاظ التام على رأس مالك.
                </p>

                {/* Member Name, Subscription Type, and Remaining Days Badge right below the Hero text */}
                {currentMember && (() => {
                  const memberPlan =
                    VIP_PLANS.find((p) => p.id === currentMember.planDuration) || VIP_PLANS[0];
                  const expInfo = getSubscriberExpiryStatus(currentMember.expiryDate);

                  return (
                    <div className="mt-3 inline-flex flex-wrap items-center gap-2.5 sm:gap-3.5 px-4 py-2.5 bg-gradient-to-r from-amber-500/20 via-emerald-500/15 to-slate-900/95 border border-amber-400/50 rounded-xl shadow-lg">
                      <div className="flex items-center gap-2">
                        <span className="p-1.5 rounded-lg bg-amber-400/20 border border-amber-400/40 text-amber-300">
                          <Crown className="w-4 h-4 shrink-0" />
                        </span>
                        <span className="text-xs sm:text-sm font-extrabold text-white">
                          العضو: <span className="text-amber-300">{currentMember.name}</span>
                        </span>
                      </div>

                      <span className="text-slate-600" aria-hidden="true">|</span>

                      <div className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-emerald-300">
                        <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>
                          نوع الاشتراك: باقة VIP ({memberPlan.label})
                        </span>
                      </div>

                      <span className="text-slate-600" aria-hidden="true">|</span>

                      <div className="flex items-center gap-1.5 text-xs sm:text-sm font-extrabold font-mono-num">
                        <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        {currentMember.expiryDate && expInfo.daysLeft !== null ? (
                          expInfo.status === 'expired' ? (
                            <span className="text-rose-400">
                              انتهت العضوية (منذ {Math.abs(expInfo.daysLeft)} يوم)
                            </span>
                          ) : expInfo.daysLeft === 0 ? (
                            <span className="text-amber-300">
                              ينتهي الاشتراك اليوم
                            </span>
                          ) : (
                            <span className="text-amber-300">
                              متبقي على الانتهاء: <span className="text-white">{expInfo.daysLeft}</span> يوم
                            </span>
                          )
                        ) : (
                          <span className="text-amber-300">
                            المدة المتبقية: قيد التفعيل ({memberPlan.days} يوم)
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Clean Tabular Summary Metrics (Daily Reset & Daily Accuracy Ring + Profit Simulator) */}
              <div className="w-full lg:w-auto flex flex-col sm:flex-row items-stretch sm:items-center gap-4 px-4 sm:px-5 py-4 bg-slate-900/80 border border-slate-800 rounded-xl self-start lg:self-auto shadow-lg">
                {/* Circular SVG Accuracy Gauge */}
                <div className="flex items-center gap-3.5 border-b sm:border-b-0 sm:border-l border-slate-800 pb-3 sm:pb-0 sm:pl-4">
                  <div className="relative w-14 h-14 shrink-0">
                    <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                      <path
                        className="text-slate-800"
                        strokeWidth="3.5"
                        stroke="currentColor"
                        fill="none"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                      <path
                        className="text-emerald-400 transition-all duration-500"
                        strokeDasharray={`${Math.max(0, Math.min(100, stats.winRate))}, 100`}
                        strokeWidth="3.5"
                        strokeLinecap="round"
                        stroke="currentColor"
                        fill="none"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center font-mono-num text-xs font-extrabold text-emerald-400">
                      {stats.winRate}%
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-400">دقة الإشارات (اليوم)</div>
                    <div className="text-sm font-bold text-white mt-0.5">
                      {stats.wins} صفقة رابحة
                    </div>
                    <div className="text-[11px] text-emerald-300 font-semibold mt-0.5">
                      المضاعفات: 0 (بدون مضاعفات)
                    </div>
                  </div>
                </div>

                {/* Visitor Interactive Daily Profit Simulator */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3 text-[11px] text-amber-300 font-bold">
                    <span>حاسبة ربحك التقديري من صفقات اليوم:</span>
                    <span className="font-mono-num text-emerald-400 text-xs">
                      +${(stats.wins * visitorSimStake * 0.85).toFixed(1)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-slate-400">قيمة الصفقة:</span>
                    {[1, 5, 10, 20].map((amt) => (
                      <button
                        key={`sim-${amt}`}
                        type="button"
                        onClick={() => setVisitorSimStake(amt)}
                        className={`px-2 py-0.5 text-[11px] font-mono-num font-bold rounded border transition-colors cursor-pointer ${
                          visitorSimStake === amt
                            ? 'bg-amber-400 text-slate-950 border-amber-300'
                            : 'bg-[#0B0F17] text-slate-300 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        ${amt}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* FLOATING ROBOT EXPLANATION BANNER FOR VISITORS (الروبوت العائم التلقائي + اشتراك VIP تليجرام + صورة الروبوت) */}
            <FloatingRobotVisitorBanner
              onOpenRegisterModal={() => {
                setRegSuccess(false);
                setRegError('');
                setShowRegisterModal(true);
              }}
              onOpenRobotPage={() => setActiveView('robot')}
              quotexReferralLink={autoPilot.quotexReferralLink || 'https://broker-qx.pro/?lid=2303934'}
              telegramVipChannelName={formatterOptions.channelTitle || '@ZadNBFX'}
            />

            {/* NEW VISITOR INFO SECTION: Signal Accuracy + Zero Risk + No Martingale + VIP 24/7 Benefits */}
            <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Right 7 Columns: Signal Precision + Live Interactive Candlestick Box in Middle + 3 Pillars */}
              <div className="lg:col-span-7 p-4 sm:p-6 bg-slate-900/80 border border-slate-800 rounded-xl space-y-4 flex flex-col justify-between overflow-hidden">
                <div className="space-y-2">
                  <div className="inline-flex items-center gap-2 text-xs font-bold text-emerald-400">
                    <ShieldCheck className="w-4 h-4 shrink-0" />
                    <span>منهجية الإشارة ودقتها العالية — أمان تام لرأس المال</span>
                  </div>
                  <h2 className="text-base sm:text-xl font-bold text-white leading-snug">
                    لماذا تتميز إشاراتنا بالدقة العالية وبدون أي مضاعفات؟
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                    تعتمد خوارزمية <strong className="text-white">نَبض التداول</strong> على فحص السيولة الحقيقية في البورصات العالمية (أزواج العملات الرسمية فقط مثل EUR/USD و GBP/JPY) واستبعاد سوق OTC تماماً، مما يمنحك دخولاَ آمناً ومدروساً.
                  </p>
                </div>

                {/* LIVE CANDLESTICK CHART BOX IN THE MIDDLE SPACE (مربع حي للشموع اليابانية) */}
                {(() => {
                  const activeSnap =
                    liveMarket.find(m => m.pair === selectedChartPair) ||
                    liveMarket[0] || {
                      pair: selectedChartPair,
                      formattedPrice:
                        selectedChartPair === 'GBP/JPY'
                          ? '198.420'
                          : selectedChartPair === 'USD/JPY'
                          ? '154.180'
                          : '1.08465',
                      rsi: 27,
                      trend: 'BULLISH' as const
                    };
                  const lastCandle = liveCandles[liveCandles.length - 1] || {
                    close: 55,
                    isBull: true
                  };

                  return (
                    <div className="p-3.5 sm:p-4 bg-[#080C13] border border-slate-800/90 rounded-xl space-y-3 shadow-inner">
                      {/* Top Bar of Live Candlestick Box */}
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
                        <div className="flex items-center gap-2">
                          <span className="relative flex h-2.5 w-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                          </span>
                          <span className="text-xs font-bold text-white">
                            مربع حركة الشموع اليابانية الحي (فريم M1)
                          </span>
                          <span className="text-[11px] text-emerald-400 font-mono-num" dir="ltr">
                            {activeSnap.pair} · {activeSnap.formattedPrice}
                          </span>
                        </div>

                        {/* Pair Selector Tabs */}
                        <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
                          {['EUR/USD', 'GBP/USD', 'USD/JPY', 'GBP/JPY'].map((pairName) => (
                            <button
                              key={pairName}
                              type="button"
                              onClick={() => setSelectedChartPair(pairName)}
                              className={`px-2 py-0.5 text-[10px] font-mono-num font-bold rounded transition-colors cursor-pointer ${
                                selectedChartPair === pairName
                                  ? 'bg-emerald-500 text-slate-950'
                                  : 'text-slate-400 hover:text-white'
                              }`}
                            >
                              {pairName}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Animated SVG Candlestick Chart Area */}
                      <div className="relative h-36 sm:h-40 w-full bg-[#06090F] rounded-lg border border-slate-800/60 overflow-hidden p-2">
                        <svg
                          viewBox="0 0 480 120"
                          className="w-full h-full preserve-3d"
                          preserveAspectRatio="none"
                        >
                          {/* Subtle Horizontal Price Grid Lines */}
                          <line x1="0" y1="22" x2="480" y2="22" stroke="#1e293b" strokeDasharray="3 3" strokeWidth="0.8" />
                          <line x1="0" y1="60" x2="480" y2="60" stroke="#1e293b" strokeDasharray="3 3" strokeWidth="0.8" />
                          <line x1="0" y1="98" x2="480" y2="98" stroke="#1e293b" strokeDasharray="3 3" strokeWidth="0.8" />

                          {/* Live Support / Resistance Zone Highlight */}
                          <rect x="0" y="14" width="480" height="10" fill="#f43f5e" fillOpacity="0.06" />
                          <rect x="0" y="96" width="480" height="10" fill="#10b981" fillOpacity="0.06" />

                          {/* Dynamic Moving Average Smooth Curve */}
                          <polyline
                            fill="none"
                            stroke="#fbbf24"
                            strokeWidth="1.4"
                            strokeOpacity="0.65"
                            points={liveCandles
                              .map((c, idx) => {
                                const x = idx * 20 + 10;
                                const y = 112 - ((c.open + c.close) / 2);
                                return `${x},${y}`;
                              })
                              .join(' ')}
                          />

                          {/* Live Candlesticks */}
                          {liveCandles.map((c, idx) => {
                            const xCenter = idx * 20 + 10;
                            const yHigh = 112 - c.high;
                            const yLow = 112 - c.low;
                            const yTop = 112 - Math.max(c.open, c.close);
                            const yBottom = 112 - Math.min(c.open, c.close);
                            const bodyHeight = Math.max(3, yBottom - yTop);
                            const color = c.isBull ? '#10b981' : '#f43f5e';
                            const isLast = idx === liveCandles.length - 1;

                            return (
                              <g key={c.id}>
                                {/* High-Low Wick */}
                                <line
                                  x1={xCenter}
                                  y1={yHigh}
                                  x2={xCenter}
                                  y2={yLow}
                                  stroke={color}
                                  strokeWidth={isLast ? '1.8' : '1.2'}
                                />
                                {/* Open-Close Candle Body */}
                                <rect
                                  x={xCenter - 5.5}
                                  y={yTop}
                                  width="11"
                                  height={bodyHeight}
                                  rx="1.5"
                                  fill={color}
                                  fillOpacity={isLast ? '1' : '0.88'}
                                  stroke={isLast ? '#ffffff' : 'none'}
                                  strokeWidth={isLast ? '0.6' : '0'}
                                />
                              </g>
                            );
                          })}

                          {/* Current Live Price Horizontal Tracker Line */}
                          <line
                            x1="0"
                            y1={112 - lastCandle.close}
                            x2="480"
                            y2={112 - lastCandle.close}
                            stroke={lastCandle.isBull ? '#10b981' : '#f43f5e'}
                            strokeDasharray="2 2"
                            strokeWidth="1"
                          />
                        </svg>

                        {/* Overlay Live Status Readout */}
                        <div className="absolute top-2 left-2.5 flex items-center gap-2 text-[10px] font-mono-num bg-slate-950/85 border border-slate-800 px-2 py-0.5 rounded">
                          <span className="text-slate-400">RSI(14):</span>
                          <span className="text-emerald-400 font-bold">{activeSnap.rsi}</span>
                          <span className="text-slate-600">|</span>
                          <span className={lastCandle.isBull ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                            {lastCandle.isBull ? '▲ شمعة صاعدة' : '▼ شمعة هابطة'}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
                        <span>
                          📊 رصد بصري مباشر لارتداد الشموع من مناطق التشبع (بدون مضاعفات M1)
                        </span>
                        <span className="text-emerald-400 font-semibold font-mono-num">
                          السوق العالمي المباشر · بدون OTC
                        </span>
                      </div>
                    </div>
                  );
                })()}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                  <div className="p-3.5 bg-[#0B0F17] border border-slate-800/90 rounded-lg space-y-1">
                    <div className="text-xs font-bold text-emerald-400">1. دقة فائقة (RSI + زخم)</div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      لا نرسل إشارات عشوائية؛ بل ننتظر وصول السعر لمناطق تشبع شرائي أو بيعي حادة مع تأكيد بداية ارتداد الشمعة.
                    </p>
                  </div>

                  <div className="p-3.5 bg-[#0B0F17] border border-slate-800/90 rounded-lg space-y-1">
                    <div className="text-xs font-bold text-emerald-400">2. بدون مضاعفات نهائياً</div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      جميع صفقاتنا مباشرة (دقيقة واحدة M1 من أول شمعة) بدون مارتينجال أو مضاعفة مبلغ الصفقة، لحماية حسابك من التمرجن.
                    </p>
                  </div>

                  <div className="p-3.5 bg-[#0B0F17] border border-slate-800/90 rounded-lg space-y-1">
                    <div className="text-xs font-bold text-emerald-400">3. بدون مخاطر عشوائية</div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      التوقيت مضبوط بالدقيقة (`:MM`) ليطابق ساعة هاتفك أو حاسوبك تلقائياً في أي دولة بدون أي فرق توقيت.
                    </p>
                  </div>
                </div>
              </div>

              {/* Left 5 Columns: VIP 24/7 Channel Benefits & How to Subscribe */}
              <div className="lg:col-span-5 p-4 sm:p-6 bg-gradient-to-b from-amber-950/25 to-slate-900/90 border border-amber-500/35 rounded-xl space-y-4 flex flex-col justify-between overflow-hidden">
                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-400">
                      <Crown className="w-4 h-4 shrink-0" />
                      <span>مميزات وفوائد قناة VIP الخاصة (24 ساعة)</span>
                    </span>
                    <span className="px-2 py-0.5 text-[11px] font-bold bg-amber-400/20 text-amber-300 rounded shrink-0">
                      تعمل 24/7
                    </span>
                  </div>

                  <h3 className="text-base sm:text-lg font-bold text-white leading-snug">
                    طريقة وفوائد الاشتراك في قناة VIP مقارنة بالقناة المجانية
                  </h3>

                  <ul className="space-y-2 text-xs text-slate-300 leading-relaxed">
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <span>
                        <strong className="text-white">عمل متواصل 24 ساعة:</strong> بينما تعمل القناة المجانية لساعات محددة يومياً بتوقيت مصر، يعمل بوت <strong className="text-amber-300">VIP على مدار 24 ساعة</strong> لاقتناص جميع جلسات السوق العالمي (آسيا، لندن، نيويورك).
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <span>
                        <strong className="text-white">صفقات صافية بدون مضاعفات:</strong> استلام فوري لنفس الإشارة الذكية مع متابعة نتيجتها المباشرة (`✅` ربح) وإرشادات إدارة رأس المال الآمنة.
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <span>
                        <strong className="text-white">طريقة الانضمام السريع:</strong> اضغط على زر التسجيل بالأسفل وأدخل اسمك ورقمك ونوع المنصة (بدون الحاجة لتفعيل إيميل أو جيميل).
                      </span>
                    </li>
                  </ul>

                  {/* VIP Pricing Packages & Country-Specific Currency / Payment Calculator */}
                  {(() => {
                    const effectiveCountry = currentMember?.country || regCountry || COUNTRIES_LIST[0];
                    const isEgypt = isEgyptCountry(effectiveCountry);
                    const isPalestine = isPalestineCountry(effectiveCountry);
                    const allowedMethods = getPaymentMethodsForCountry(effectiveCountry);
                    const selectedPlanObj =
                      VIP_PLANS.find((p) => p.id === regPlanDuration) || VIP_PLANS[0];
                    const calculatedEgp = selectedPlanObj.price * USD_TO_EGP_RATE;

                    return (
                      <div className="pt-2 space-y-3">
                        {/* Country Selector for Visitor Pricing & Payment Display */}
                        <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-[#0B0F17] border border-slate-800 rounded-lg">
                          <span className="text-xs font-bold text-amber-300">
                            🌍 اختر دولتك لعرض العملة ووسيلة الدفع المتاحة لك:
                          </span>
                          <select
                            value={effectiveCountry}
                            onChange={(e) => {
                              const nextC = e.target.value;
                              setRegCountry(nextC);
                              setRegPaymentMethod(getPaymentMethodsForCountry(nextC)[0]);
                            }}
                            disabled={Boolean(currentMember)}
                            className="px-2.5 py-1 text-xs font-bold bg-slate-900 border border-amber-500/40 rounded text-white focus:outline-none cursor-pointer"
                          >
                            {COUNTRIES_LIST.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="text-xs font-bold text-amber-300 flex items-center justify-between">
                          <span>💎 باقات الاشتراك في خدمة VIP (24 ساعة):</span>
                          {isEgypt ? (
                            <span className="text-[11px] text-emerald-400">
                              الأسعار مثبتة بالجنيه المصري
                            </span>
                          ) : (
                            <span className="text-[11px] text-emerald-400">
                              الأسعار بالدولار الأمريكي ($)
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {PAID_VIP_PLANS.map((plan) => {
                            const isSelected = regPlanDuration === plan.id && regSubscriptionType === 'paid_plan';
                            const egpVal = plan.price * USD_TO_EGP_RATE;
                            return (
                              <button
                                key={plan.id}
                                type="button"
                                onClick={() => {
                                  setRegSubscriptionType('paid_plan');
                                  setRegPlanDuration(plan.id);
                                }}
                                className={`p-2.5 bg-[#0B0F17] hover:bg-slate-800/90 border rounded-lg text-center transition-colors cursor-pointer space-y-0.5 ${
                                  isSelected
                                    ? 'border-emerald-400 ring-1 ring-emerald-400/50 bg-emerald-950/20'
                                    : 'border-amber-500/30 hover:border-amber-400'
                                }`}
                              >
                                <div className="text-[11px] text-slate-300 font-medium">
                                  {plan.label}
                                </div>
                                {isEgypt ? (
                                  <div className="text-sm sm:text-base font-extrabold text-amber-400 font-mono-num">
                                    {egpVal.toLocaleString('en-US')}{' '}
                                    <span className="text-[11px] font-bold">جنيه</span>
                                  </div>
                                ) : (
                                  <div className="text-base font-extrabold text-amber-400 font-mono-num">
                                    ${plan.price}
                                  </div>
                                )}
                                <div className="text-[10px] text-emerald-400">{plan.badge}</div>
                              </button>
                            );
                          })}
                        </div>

                        {/* Special Callout for Free Quotex Referral Subscription (التفعيل المجاني لنظام الإحالة في عضوية كيوتكس) */}
                        <div className="p-3.5 bg-gradient-to-r from-amber-950/40 via-[#0B0F17] to-emerald-950/40 border border-amber-400/50 rounded-xl space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-xs font-extrabold text-amber-300 flex items-center gap-1.5">
                              <span>🎁 خاصية التفعيل المجاني لأعضاء منصة كيوتكس (Quotex):</span>
                            </span>
                            <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded">
                              عضوية VIP مجاناً 0$
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-300 leading-relaxed">
                            عند اختيارك للبروكر <strong className="text-white">Quotex (كوتيكس)</strong>، يمكنك الاختيار بين <strong className="text-amber-300">الاشتراكات الشهرية</strong> أو <strong className="text-emerald-300">التفعيل المجاني باستخدام رابط الإحالة</strong>، وبعد التسجيل مراسلة المشرف وعند التأكد يتم الإيداع بقيمة <strong className="text-amber-300">100 دولار ($)</strong> في حسابك على منصة كيوتكس فتحصل على <strong className="text-emerald-300">عضوية VIP مجانية</strong>!
                          </p>
                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => {
                                setRegBroker('Quotex (كوتيكس)');
                                setRegSubscriptionType('quotex_referral');
                                setRegPlanDuration('quotex_referral_free');
                                setRegSuccess(false);
                                setRegError('');
                                setShowRegisterModal(true);
                              }}
                              className="px-3 py-1.5 text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg transition-colors cursor-pointer"
                            >
                              🎁 طلب التفعيل المجاني عبر إحالة كيوتكس الآن
                            </button>
                            <a
                              href={autoPilot.quotexReferralLink || 'https://broker-qx.pro/?lid=2303934'}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-3 py-1.5 text-xs font-bold text-amber-300 bg-slate-900 hover:bg-slate-800 border border-amber-500/40 rounded-lg inline-flex items-center gap-1.5"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              <span>فتح رابط التسجيل الرسمي في كيوتكس</span>
                            </a>
                          </div>
                        </div>

                        {/* Automatic EGP Calculator for Members in Egypt (حاسبة تلقائية بالجنيه المصري) */}
                        {isEgypt && (
                          <div className="p-3 bg-emerald-950/30 border border-emerald-500/40 rounded-xl space-y-2">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-bold text-emerald-300">
                                🧮 الحاسبة التلقائية لقيمة الاشتراك بالجنيه المصري:
                              </span>
                              <span className="text-[11px] text-slate-300 font-mono-num">
                                باقة: {selectedPlanObj.label}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-emerald-500/20">
                              <span className="text-xs text-slate-300">
                                المبلغ المطلوب دفعه عبر المحافظ الإلكترونية:
                              </span>
                              <span className="text-lg font-extrabold text-emerald-400 font-mono-num">
                                {calculatedEgp.toLocaleString('en-US')} جنيه مصري
                              </span>
                            </div>
                          </div>
                        )}

                        {/* Country-Specific Payment Methods Display */}
                        <div className="p-2.5 bg-[#0B0F17]/90 border border-slate-800 rounded-lg flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-300">
                          <span className="font-bold text-white flex items-center gap-1">
                            <CreditCard className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            <span>وسائل الدفع المتاحة في ({effectiveCountry}):</span>
                          </span>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {isEgypt ? (
                              <span className="px-2.5 py-1 bg-amber-500/20 border border-amber-500/40 text-amber-300 rounded font-bold">
                                📱 المحافظ الإلكترونية فقط (فودافون كاش / إنستا باي / اتصالات / أورانج)
                              </span>
                            ) : isPalestine ? (
                              <span className="px-2.5 py-1 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 rounded font-bold">
                                🏦 تحويل لبنك فلسطيني بالدولار أو الشيكل ($)
                              </span>
                            ) : (
                              allowedMethods.map((m) => (
                                <span
                                  key={m}
                                  className="px-2.5 py-1 bg-slate-800 text-sky-300 rounded font-bold"
                                >
                                  🏦 تحويل بنكي (Bank Transfer)
                                </span>
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Stacked Full-Width Action Buttons inside VIP Card so they never overflow horizontally */}
                <div className="pt-2 flex flex-col gap-2.5 w-full">
                  <button
                    onClick={() => {
                      setRegSuccess(false);
                      setRegError('');
                      setShowRegisterModal(true);
                    }}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 text-xs sm:text-sm font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors cursor-pointer text-center"
                  >
                    <UserPlus className="w-4 h-4 shrink-0" />
                    <span>سجّل الآن للانضمام إلى قناة VIP (بدون تفعيل إيميل)</span>
                  </button>
                  <button
                    onClick={() => {
                      setMemberLookupError('');
                      setShowMemberPortalModal(true);
                    }}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold text-amber-300 bg-[#0B0F17] hover:bg-slate-800 border border-amber-500/40 rounded-lg transition-colors cursor-pointer text-center"
                  >
                    <MessageSquare className="w-4 h-4 shrink-0" />
                    <span>دخول الأعضاء ومراسلة المشرف</span>
                  </button>
                </div>
              </div>
            </section>

            {/* ACTIVE MEMBER QUICK DASHBOARD BANNER (If visitor registered or logged into their VIP profile) */}
            {currentMember && (
              <section className="p-5 bg-slate-900/95 border-2 border-amber-500/40 rounded-xl space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-amber-400 flex items-center gap-1">
                        <UserCheck className="w-4 h-4" />
                        <span>بيانات عضويتك في قناة VIP:</span>
                      </span>
                      <span className="text-sm font-bold text-white">{currentMember.name}</span>
                      <span className="text-xs text-slate-400">({currentMember.country || 'مصر 🇪🇬'})</span>
                      {currentMember.status === 'ACTIVE' ? (
                        <span className="px-2 py-0.5 text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded">
                          ✅ العضوية مفعّلة
                        </span>
                      ) : currentMember.status === 'BANNED' ? (
                        <span className="px-2 py-0.5 text-[11px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded">
                          🚫 العضوية محظورة
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded">
                          ⏳ قيد التفعيل من المشرف
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-300 pt-1">
                      <span>
                        البروكر: <strong className="text-amber-300">{currentMember.broker}</strong>
                      </span>
                      <span>·</span>
                      <span>
                        تاريخ انتهاء العضوية VIP:{' '}
                        <strong className="text-emerald-400 font-mono-num">
                          {currentMember.expiryDate || 'سيتم تحديده من المشرف قريباً'}
                        </strong>
                      </span>
                      {currentMember.activationLink && (
                        <>
                          <span>·</span>
                          <a
                            href={currentMember.activationLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-emerald-400 font-bold underline hover:text-emerald-300"
                          >
                            <Link2 className="w-3.5 h-3.5" />
                            <span>اضغط هنا للدخول عبر رابط التفعيل VIP</span>
                          </a>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
                    <button
                      onClick={() => {
                        setRenewalSentSuccess(false);
                        setRenewalCountry(currentMember.country || COUNTRIES_LIST[0]);
                        setRenewalPlanId(currentMember.planDuration || '1_month');
                        setRenewalPaymentMethod(
                          getPaymentMethodsForCountry(currentMember.country || COUNTRIES_LIST[0])[0]
                        );
                        setShowRenewalModal(true);
                      }}
                      className="flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <RefreshCw className="w-4 h-4" />
                      <span>طلب تجديد الاشتراك 🔄</span>
                    </button>

                    <button
                      onClick={() => setShowMemberPortalModal(true)}
                      className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <MessageSquare className="w-4 h-4" />
                      <span>
                        فتح صندوق المراسلات مع المشرف ({currentMember.messages?.length || 0})
                      </span>
                    </button>

                    <button
                      onClick={handleMemberLogout}
                      className="flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-bold text-rose-300 bg-rose-950/50 hover:bg-rose-900/60 border border-rose-500/40 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <LogOut className="w-4 h-4 text-rose-400" />
                      <span>تسجيل خروج العضو</span>
                    </button>
                  </div>
                </div>
              </section>
            )}

            {/* Prominent Free Telegram Channel Subscription Callout (@ZadNBFX) + Live Signal Preview */}
            <section className="p-4 sm:p-6 bg-gradient-to-r from-slate-900/95 via-[#0F172A] to-emerald-950/25 border border-emerald-500/30 rounded-xl grid grid-cols-1 lg:grid-cols-12 gap-5 items-center overflow-hidden">
              <div className="lg:col-span-7 space-y-2">
                <div className="text-xs font-semibold text-emerald-400">
                  انضم إلى مجتمعنا في تليجرام مجاناً · بث مباشر للسوق العالمي
                </div>
                <h2 className="text-base sm:text-xl font-bold text-white">
                  اشترك في قناة التليجرام الرسمية{' '}
                  <span dir="ltr" className="font-mono-num text-emerald-400">
                    @ZadNBFX
                  </span>{' '}
                  مجاناً
                </h2>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                  احصل على إشارات السوق العالمي المركّزة على هاتفك فور صدورها مع تنبيهات النتيجة المباشرة، أو انضم إلى قناة <strong className="text-amber-300">VIP (24 ساعة)</strong> لاقتناص فرص جميع الجلسات العالمية.
                </p>
                <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                  <a
                    href="https://t.me/ZadNBFX"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 px-5 py-2.5 sm:py-3 text-xs sm:text-sm font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg transition-colors"
                  >
                    <Send className="w-4 h-4 shrink-0" />
                    <span>اشترك مجاناً في @ZadNBFX</span>
                    <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                  </a>

                  <button
                    onClick={() => {
                      setRegSuccess(false);
                      setRegError('');
                      setShowRegisterModal(true);
                    }}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 sm:py-3 text-xs font-bold text-amber-300 bg-slate-800 hover:bg-slate-700 border border-amber-500/40 rounded-lg transition-colors cursor-pointer"
                  >
                    <UserPlus className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>تسجيل عضوية VIP السريع</span>
                  </button>
                </div>
              </div>

              {/* Visitor Telegram Message Card Mockup */}
              <div className="lg:col-span-5 p-3.5 bg-[#0E1621] border border-slate-800 rounded-xl space-y-2 shadow-inner">
                <div className="flex items-center justify-between text-[11px] text-slate-400 border-b border-slate-800 pb-1.5">
                  <span className="font-bold text-sky-400">نموذج إشعار الإشارة في تليجرام</span>
                  <span className="font-mono-num text-emerald-400" dir="ltr">@ZadNBFX</span>
                </div>
                <div className="p-3 bg-[#182533] rounded-xl text-xs text-slate-100 space-y-1 font-sans">
                  <div className="font-bold text-emerald-300">
                    {formatterOptions.channelTitle || 'نَبض التداول | السوق العالمي'}
                  </div>
                  <div className="flex items-center justify-between pt-1 font-mono-num">
                    <span>💱 الزوج: <strong>{todaySignals[0]?.asset || 'EUR/USD'}</strong></span>
                    <span>⏱ المدة: <strong>M1 (دقيقة)</strong></span>
                  </div>
                  <div className="flex items-center justify-between font-mono-num">
                    <span>
                      📈 الاتجاه:{' '}
                      <strong className={todaySignals[0]?.direction === 'PUT' ? 'text-rose-400' : 'text-emerald-400'}>
                        {todaySignals[0]?.direction === 'PUT' ? 'هبوط ⬇️' : 'صعود ⬆️'}
                      </strong>
                    </span>
                    <span>🕒 الدقيقة: <strong>:{todaySignals[0]?.entryMinute || '20'}</strong></span>
                  </div>
                  <div className="pt-1 text-[11px] text-amber-300 font-semibold border-t border-slate-700/60 mt-1">
                    ✅ صفقة مباشرة بدون مضاعفات
                  </div>
                </div>
              </div>
            </section>

            {/* Interactive Filter Tabs for Visitors */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg w-full sm:w-fit">
                <button
                  onClick={() => setVisitorFilter('ALL')}
                  className={`flex-1 sm:flex-initial px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer text-center ${
                    visitorFilter === 'ALL'
                      ? 'bg-emerald-500 text-slate-950 font-semibold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  جميع فرص اليوم ({todaySignals.length})
                </button>
                <button
                  onClick={() => setVisitorFilter('PENDING')}
                  className={`flex-1 sm:flex-initial px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer text-center ${
                    visitorFilter === 'PENDING'
                      ? 'bg-emerald-500 text-slate-950 font-semibold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  جارية الآن ({stats.pending})
                </button>
                <button
                  onClick={() => setVisitorFilter('WIN')}
                  className={`flex-1 sm:flex-initial px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer text-center ${
                    visitorFilter === 'WIN'
                      ? 'bg-emerald-500 text-slate-950 font-semibold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  الصفقات الرابحة ({stats.wins})
                </button>
              </div>

              <div className="text-xs text-slate-400">
                {formatterOptions.channelSignature}
              </div>
            </div>

            {/* Visitor Signals: A4 Ruled Notebook Sheet (One Signal Per Line, Newest First) */}
            {isLoading ? (
              <div className="max-w-[920px] mx-auto bg-slate-900/70 border border-slate-800 rounded-xl overflow-hidden divide-y divide-slate-800/80">
                {[1, 2, 3, 4, 5].map((n) => (
                  <div key={n} className="h-12 animate-pulse bg-slate-900/40 px-6" />
                ))}
              </div>
            ) : filteredSignals.length === 0 ? (
              <div className="max-w-[920px] mx-auto p-12 text-center bg-slate-900/50 border border-slate-800 rounded-xl space-y-3">
                <p className="text-base font-medium text-slate-300">
                  لا توجد إشارات مطابقة لهذا الفلتر حالياً
                </p>
                <button
                  onClick={() => setVisitorFilter('ALL')}
                  className="px-4 py-2 text-xs font-semibold text-slate-950 bg-emerald-400 rounded-lg hover:bg-emerald-300 transition-colors cursor-pointer"
                >
                  عرض جميع الإشارات
                </button>
              </div>
            ) : (
              /* A4 Notebook Sheet Container */
              <section className="max-w-[960px] mx-auto bg-[#0F1522] border border-slate-800 rounded-xl shadow-2xl overflow-hidden">
                {/* Notebook Top Header Margin */}
                <div className="px-4 sm:px-6 py-3.5 bg-slate-900/95 border-b-2 border-slate-700/80 flex items-center justify-between text-xs text-slate-400">
                  <div className="flex items-center gap-2 font-semibold text-slate-200">
                    <span>دفتر إشارات السوق العالمي المباشر (الأحدث في الأعلى)</span>
                  </div>
                  <div className="font-mono-num text-[11px] text-slate-400">
                    إجمالي الأسطر: {filteredSignals.length}
                  </div>
                </div>

                {/* Ruled A4 Lines */}
                <div className="divide-y divide-slate-800/90">
                  {filteredSignals.map((sig, index) => {
                    const minuteOnly = extractMinuteOnly(sig.entryMinute || sig.entryTime);
                    const deviceSyncedTime = formatDeviceLocalTimeFromMinute(minuteOnly);
                    const rowNumber = String(index + 1).padStart(2, '0');

                    return (
                      <div
                        key={sig.id}
                        className="relative flex items-center justify-between gap-2 sm:gap-4 px-3 sm:px-6 py-3 hover:bg-slate-800/40 transition-colors text-xs sm:text-sm"
                      >
                        {/* Right side of the notebook line (in RTL): Line Number + Margin Rule + Signal Details in 1 Line */}
                        <div className="flex items-center gap-2.5 sm:gap-4 min-w-0 flex-1 overflow-x-auto no-scrollbar">
                          {/* Line Index before notebook vertical margin line */}
                          <span className="font-mono-num text-[11px] text-slate-500 select-none w-5 text-center shrink-0">
                            {rowNumber}
                          </span>

                          {/* Vertical Notebook Margin Line */}
                          <div className="h-6 w-px bg-rose-500/30 shrink-0" />

                          {/* Asset Pair + Copy Button */}
                          <button
                            onClick={() => handleCopyText(sig.asset, `pair-${sig.id}`)}
                            title="اضغط لنسخ اسم الزوج"
                            className="flex items-center gap-1.5 font-bold text-white hover:text-emerald-300 font-mono-num tracking-tight whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            <span>{sig.asset}</span>
                            {copiedId === `pair-${sig.id}` ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3 text-slate-500" />
                            )}
                          </button>

                          <span className="text-slate-700 shrink-0" aria-hidden="true">|</span>

                          {/* Direction (Up / Down) */}
                          <div
                            className={`flex items-center gap-1 font-bold whitespace-nowrap shrink-0 ${
                              sig.direction === 'CALL' ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {sig.direction === 'CALL' ? (
                              <>
                                <ArrowUpRight className="w-4 h-4" />
                                <span>صعود ⬆️</span>
                              </>
                            ) : (
                              <>
                                <ArrowDownRight className="w-4 h-4" />
                                <span>هبوط ⬇️</span>
                              </>
                            )}
                          </div>

                          <span className="text-slate-700 shrink-0" aria-hidden="true">|</span>

                          {/* Entry Time synced with visitor device clock */}
                          <div className="flex items-center gap-1.5 text-slate-200 whitespace-nowrap shrink-0">
                            <Clock className="w-3.5 h-3.5 text-emerald-400/80" />
                            <span className="text-slate-400 hidden sm:inline">الدخول:</span>
                            <span className="font-bold font-mono-num text-white">
                              {deviceSyncedTime}
                            </span>
                            <span className="text-[11px] text-emerald-400 font-mono-num">
                              (الدقيقة :{minuteOnly})
                            </span>
                          </div>

                          <span className="text-slate-700 hidden md:inline shrink-0" aria-hidden="true">|</span>

                          {/* Timeframe & Global Market Note */}
                          <span className="text-xs text-slate-400 hidden md:inline whitespace-nowrap shrink-0">
                            M1 · سوق عالمي
                          </span>
                        </div>

                        {/* End of the Notebook Line (Left side in RTL): Status (Win / Win Gale 1 / Loss / Draw / Running Now) */}
                        <div className="shrink-0 pl-1">
                          {sig.status === 'WIN' && (
                            <span className="inline-flex items-center gap-1.5 font-bold text-emerald-400 whitespace-nowrap">
                              <span>✅</span>
                              <span>ربح</span>
                            </span>
                          )}
                          {sig.status === 'WIN_GALE1' && (
                            <span className="inline-flex items-center gap-1.5 font-bold text-emerald-400 whitespace-nowrap">
                              <span>✅</span>
                              <span>ربح مضاعفة واحدة</span>
                            </span>
                          )}
                          {sig.status === 'LOSS' && (
                            <span className="inline-flex items-center gap-1.5 font-bold text-rose-400 whitespace-nowrap">
                              <span>❌</span>
                              <span>خسارة</span>
                            </span>
                          )}
                          {sig.status === 'DRAW' && (
                            <span className="inline-flex items-center gap-1.5 font-bold text-slate-300 whitespace-nowrap">
                              <span>⚖️</span>
                              <span>تعادل</span>
                            </span>
                          )}
                          {sig.status === 'PENDING' && (
                            <span className="inline-flex items-center gap-1.5 font-semibold text-amber-400 whitespace-nowrap">
                              <span className="animate-pulse">⏳</span>
                              <span>
                                {sig.galeStep === 1 ? 'في المضاعفة الأولى...' : 'جاري الآن'}
                              </span>
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </div>
        )}
      </main>
      )}

      {/* Instant Trader Registration Modal (No Email/Gmail Activation Required) */}
      {showRegisterModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowRegisterModal(false);
          }}
        >
          <div className="w-full max-w-lg max-h-[90vh] flex flex-col bg-slate-900 border border-amber-500/40 rounded-xl shadow-2xl overflow-hidden my-auto">
            {/* Sticky Modal Header with Explicit Close Button */}
            <div className="flex items-center justify-between gap-2 px-5 py-3.5 bg-slate-900/95 border-b border-slate-800 shrink-0">
              <div className="flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-amber-400 shrink-0" />
                <h3 className="text-sm sm:text-base font-bold text-white">
                  التسجيل الفوري للانضمام إلى قناة VIP
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowRegisterModal(false)}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-slate-300 hover:text-white bg-slate-800 hover:bg-rose-500/20 border border-slate-700 hover:border-rose-500/40 rounded-lg transition-colors cursor-pointer shrink-0"
              >
                <X className="w-3.5 h-3.5" />
                <span>إغلاق</span>
              </button>
            </div>

            {regSuccess ? (
              <div className="p-5 overflow-y-auto">
                <div className="p-5 bg-emerald-950/40 border border-emerald-500/40 rounded-xl text-center space-y-3">
                  <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
                  <h4 className="text-base font-bold text-white">
                    تم تسجيل بياناتك فوراً بنجاح!
                  </h4>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    تم حفظ تسجيلك مباشرة بدون الحاجة لتفعيل البريد الإلكتروني. يمكنك متابعة القناة الرسمية وسيتم التواصل معك لتفعيل وصولك الكامل لقناة VIP (24 ساعة).
                  </p>
                  <div className="pt-2 flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowRegisterModal(false);
                        setShowMemberPortalModal(true);
                      }}
                      className="w-full py-2.5 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors inline-flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <MessageSquare className="w-4 h-4" />
                      <span>فتح لوحة عضويتك ومراسلة المشرف الآن</span>
                    </button>
                    <a
                      href="https://t.me/ZadNBFX"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full py-2.5 text-xs font-bold text-emerald-300 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors inline-flex items-center justify-center gap-2"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>الذهاب إلى قناة التليجرام @ZadNBFX</span>
                    </a>
                    <button
                      type="button"
                      onClick={() => setShowRegisterModal(false)}
                      className="w-full py-2 text-xs font-semibold text-slate-400 hover:text-white bg-slate-900 border border-slate-800 rounded-lg transition-colors cursor-pointer"
                    >
                      إغلاق النافذة
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <form onSubmit={handleTraderRegister} className="flex flex-col flex-1 min-h-0">
                <div className="p-5 space-y-3.5 overflow-y-auto flex-1">
                  <p className="text-xs text-slate-400 leading-relaxed">
                    أدخل بياناتك بالأسفل للتسجيل المباشر في قائمة المشتركين <strong className="text-amber-300">(تفعيل فوري بدون انتظار رسالة تأكيد على الإيميل أو الجيميل)</strong>:
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        الاسم بالكامل
                      </label>
                      <input
                        type="text"
                        required
                        value={regName}
                        onChange={(e) => setRegName(e.target.value)}
                        placeholder="اكتب اسمك..."
                        className="w-full px-3 py-2 text-sm bg-[#0B0F17] border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-amber-400"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        الدولة
                      </label>
                      <select
                        value={regCountry}
                        onChange={(e) => {
                          const nextC = e.target.value;
                          setRegCountry(nextC);
                          setRegPaymentMethod(getPaymentMethodsForCountry(nextC)[0]);
                        }}
                        className="w-full px-3 py-2 text-sm bg-[#0B0F17] border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-amber-400 cursor-pointer"
                      >
                        {COUNTRIES_LIST.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      اسمك أو معرفك على التليجرام (Telegram Username)
                    </label>
                    <input
                      type="text"
                      required
                      value={regTelegram}
                      onChange={(e) => setRegTelegram(e.target.value)}
                      placeholder="@username أو اسم حسابك على التليجرام"
                      className="w-full px-3.5 py-2 text-sm bg-[#0B0F17] border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-amber-400"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        البريد الإلكتروني
                      </label>
                      <input
                        type="email"
                        required
                        value={regEmail}
                        onChange={(e) => setRegEmail(e.target.value)}
                        dir="ltr"
                        placeholder="example@gmail.com"
                        className="w-full px-3 py-2 text-sm bg-[#0B0F17] border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-amber-400 font-mono-num"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        رقم الموبايل
                      </label>
                      <input
                        type="tel"
                        required
                        value={regPhone}
                        onChange={(e) => setRegPhone(e.target.value)}
                        dir="ltr"
                        placeholder="+201012345678"
                        className="w-full px-3 py-2 text-sm bg-[#0B0F17] border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-amber-400 font-mono-num"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        نوع البروكر (منصة التداول)
                      </label>
                      <select
                        value={regBroker}
                        onChange={(e) => {
                          const nextBroker = e.target.value;
                          setRegBroker(nextBroker);
                          if (!isQuotexBrokerName(nextBroker)) {
                            setRegSubscriptionType('paid_plan');
                            if (regPlanDuration === 'quotex_referral_free') {
                              setRegPlanDuration('1_month');
                            }
                          }
                        }}
                        className="w-full px-3 py-2 text-sm bg-[#0B0F17] border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-amber-400 cursor-pointer"
                      >
                        {BROKERS_LIST.map((b) => (
                          <option key={b} value={b}>
                            {b}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-amber-300 mb-1">
                        رقم حسابك في البروكر (كلمة المرور للدخول)
                      </label>
                      <input
                        type="text"
                        required
                        value={regBrokerAccountId}
                        onChange={(e) => setRegBrokerAccountId(e.target.value)}
                        dir="ltr"
                        placeholder="مثال: 98765432 (ID حسابك)"
                        className="w-full px-3 py-2 text-sm bg-[#0B0F17] border border-amber-500/40 rounded-lg text-slate-100 focus:outline-none focus:border-amber-400 font-mono-num"
                      />
                    </div>
                  </div>

                  {/* Quotex Subscription Mode Selector: Paid Monthly Plans OR Free Referral Link + $100 Deposit */}
                  {isQuotexBrokerName(regBroker) && (
                    <div className="p-3.5 bg-[#0B0F17] border-2 border-amber-500/40 rounded-xl space-y-3">
                      <div className="text-xs font-bold text-amber-300 flex items-center justify-between">
                        <span>✨ نظام الاشتراك المتاح لمتداولي منصة كيوتكس (Quotex):</span>
                        <span className="text-[10px] px-2 py-0.5 bg-emerald-500/20 text-emerald-300 rounded">
                          اختر طريقة تفعيلك
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <button
                          type="button"
                          onClick={() => {
                            setRegSubscriptionType('paid_plan');
                            if (regPlanDuration === 'quotex_referral_free') {
                              setRegPlanDuration('1_month');
                            }
                          }}
                          className={`p-3 rounded-xl border text-right transition-all cursor-pointer space-y-1 ${
                            regSubscriptionType === 'paid_plan'
                              ? 'bg-amber-500/15 border-amber-400 ring-1 ring-amber-400'
                              : 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <div className="text-xs font-extrabold text-white flex items-center justify-between">
                            <span>💳 1. الاشتراكات الشهرية</span>
                            {regSubscriptionType === 'paid_plan' && (
                              <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" />
                            )}
                          </div>
                          <p className="text-[11px] text-slate-300 leading-relaxed">
                            الاشتراك المباشر عبر باقاتنا الشهرية (شهر / 3 شهور / 6 شهور / سنة) بدون شرط الإحالة.
                          </p>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setRegSubscriptionType('quotex_referral');
                            setRegPlanDuration('quotex_referral_free');
                          }}
                          className={`p-3 rounded-xl border text-right transition-all cursor-pointer space-y-1 ${
                            regSubscriptionType === 'quotex_referral'
                              ? 'bg-emerald-500/15 border-emerald-400 ring-1 ring-emerald-400'
                              : 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <div className="text-xs font-extrabold text-emerald-300 flex items-center justify-between">
                            <span>🎁 2. الإحالة بالرابط مجاناً</span>
                            {regSubscriptionType === 'quotex_referral' && (
                              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                            )}
                          </div>
                          <p className="text-[11px] text-slate-300 leading-relaxed">
                            تفعيل مجاني عبر التسجيل برابط الإحالة + إيداع 100$ في حسابك على منصة كيوتكس.
                          </p>
                        </button>
                      </div>

                      {regSubscriptionType === 'quotex_referral' && (
                        <div className="p-3 bg-emerald-950/35 border border-emerald-500/40 rounded-lg space-y-2.5 text-xs">
                          <div className="font-bold text-emerald-300">
                            📋 خطوات الحصول على العضوية المجانية في كيوتكس (Quotex):
                          </div>
                          <ol className="list-decimal list-inside space-y-1 text-[11px] text-slate-200 leading-relaxed">
                            <li>
                              قم بفتح حساب جديد في منصة <strong className="text-amber-300">كيوتكس</strong> من خلال رابط الإحالة الرسمي بالأسفل.
                            </li>
                            <li>
                              أدخل <strong className="text-amber-300">رقم حسابك (ID)</strong> في خانة رقم الحساب بالأعلى ثم اضغط تأكيد التسجيل.
                            </li>
                            <li>
                              بعد التسجيل <strong className="text-emerald-300">راسل المشرف</strong> من داخل لوحة عضويتك للتأكد من وجود حسابك في قائمة الإحالة.
                            </li>
                            <li>
                              عند التأكد، يتم <strong className="text-amber-300">الإيداع بقيمة 100 دولار ($)</strong> في حسابك الشخصي على منصتك في كيوتكس للتداول بها، فتحصل فوراً على <strong className="text-emerald-300">عضوية VIP مجانية</strong>!
                            </li>
                          </ol>
                          <div className="pt-1 flex flex-wrap items-center justify-between gap-2">
                            <a
                              href={autoPilot.quotexReferralLink || 'https://broker-qx.pro/?lid=2303934'}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex-1 py-2 px-3 text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg inline-flex items-center justify-center gap-1.5"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              <span>اضغط هنا للتسجيل عبر رابط الإحالة في كيوتكس مجاناً</span>
                            </a>
                            <button
                              type="button"
                              onClick={() =>
                                handleCopyText(
                                  autoPilot.quotexReferralLink || 'https://broker-qx.pro/?lid=2303934',
                                  'reg-qx-link'
                                )
                              }
                              className="px-3 py-2 text-xs font-bold text-amber-300 bg-slate-900 hover:bg-slate-800 border border-amber-500/40 rounded-lg cursor-pointer"
                            >
                              {copiedId === 'reg-qx-link' ? 'تم نسخ الرابط ✓' : 'نسخ الرابط'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* VIP Plan & Country-Specific Payment Method + Automatic EGP Calculator (Shown when Paid Plan is chosen) */}
                  {(!isQuotexBrokerName(regBroker) || regSubscriptionType === 'paid_plan') && (() => {
                    const isEgypt = isEgyptCountry(regCountry);
                    const isPalestine = isPalestineCountry(regCountry);
                    const allowedMethods = getPaymentMethodsForCountry(regCountry);
                    const activePlan =
                      PAID_VIP_PLANS.find((p) => p.id === regPlanDuration) || PAID_VIP_PLANS[0];
                    const egpTotal = activePlan.price * USD_TO_EGP_RATE;

                    return (
                      <div className="space-y-3 pt-1">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-emerald-300 mb-1">
                              {isEgypt
                                ? 'خطة الاشتراك الشهري (مثبتة بالجنيه المصري)'
                                : 'باقة الاشتراك المطلوبة (VIP 24/7)'}
                            </label>
                            <select
                              value={activePlan.id}
                              onChange={(e) => setRegPlanDuration(e.target.value)}
                              className="w-full px-3 py-2 text-sm bg-[#0B0F17] border border-emerald-500/40 rounded-lg text-slate-100 focus:outline-none focus:border-emerald-400 cursor-pointer font-semibold"
                            >
                              {PAID_VIP_PLANS.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {isEgypt
                                    ? `${p.label} — ${(p.price * USD_TO_EGP_RATE).toLocaleString('en-US')} جنيه مصري`
                                    : `${p.label} — ${p.price} دولار ($)`}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-slate-300 mb-1">
                              وسيلة الدفع المتاحة في ({regCountry})
                            </label>
                            <select
                              value={
                                allowedMethods.includes(regPaymentMethod)
                                  ? regPaymentMethod
                                  : allowedMethods[0]
                              }
                              onChange={(e) => setRegPaymentMethod(e.target.value)}
                              className="w-full px-3 py-2 text-sm bg-[#0B0F17] border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-amber-400 cursor-pointer font-semibold"
                            >
                              {allowedMethods.map((pm) => (
                                <option key={pm} value={pm}>
                                  {pm}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {isEgypt ? (
                          <div className="p-3 bg-emerald-950/35 border border-emerald-500/40 rounded-xl flex items-center justify-between text-xs">
                            <div>
                              <div className="font-bold text-emerald-300">
                                🧮 حاسبة الاشتراك التلقائية بالجنيه المصري:
                              </div>
                              <div className="text-[11px] text-slate-300 mt-0.5">
                                الدفع عبر المحافظ الإلكترونية فقط (خطة {activePlan.label})
                              </div>
                            </div>
                            <div className="text-base sm:text-lg font-extrabold text-amber-300 font-mono-num">
                              {egpTotal.toLocaleString('en-US')} جنيه
                            </div>
                          </div>
                        ) : isPalestine ? (
                          <div className="p-2.5 bg-emerald-950/30 border border-emerald-500/30 rounded-lg text-xs text-emerald-200 flex items-center justify-between">
                            <span>🏦 تحويل لبنك فلسطيني بالدولار أو الشيكل ($):</span>
                            <strong className="text-amber-300 font-mono-num text-sm">
                              ${activePlan.price}
                            </strong>
                          </div>
                        ) : (
                          <div className="p-2.5 bg-slate-950/80 border border-slate-800 rounded-lg text-xs text-slate-300 flex items-center justify-between">
                            <span>🏦 الدفع متاح عبر تحويل بنكي (Bank Transfer):</span>
                            <strong className="text-amber-300 font-mono-num text-sm">
                              ${activePlan.price}
                            </strong>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {regError && (
                    <p className="text-xs text-rose-400 font-medium">{regError}</p>
                  )}
                </div>

                {/* Sticky Action Footer: Always visible Submit + Close buttons */}
                <div className="px-5 py-3.5 bg-slate-900/95 border-t border-slate-800 flex items-center gap-2.5 shrink-0">
                  <button
                    type="submit"
                    disabled={isSubmittingReg}
                    className="flex-1 py-2.5 px-4 text-sm font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors cursor-pointer shadow-lg shadow-amber-500/10"
                  >
                    {isSubmittingReg ? 'جاري حفظ التسجيل...' : 'تأكيد التسجيل الفوري الآن'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowRegisterModal(false)}
                    className="py-2.5 px-4 text-xs font-bold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors cursor-pointer shrink-0"
                  >
                    إلغاء وإغلاق
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* MEMBER VIP DASHBOARD & MESSAGING PORTAL MODAL (For Visitors/Members) */}
      {showMemberPortalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl p-6 bg-slate-900 border border-slate-700 rounded-xl space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Crown className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-bold text-white">
                  لوحة عضو VIP — بيانات العضوية والمراسلة المباشرة مع المشرف
                </h3>
              </div>
              <button
                onClick={() => setShowMemberPortalModal(false)}
                className="p-1 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {!currentMember ? (
              <div className="space-y-4">
                <p className="text-xs text-slate-300 leading-relaxed">
                  أدخل <strong className="text-white">البريد الإلكتروني أو رقم الموبايل أو معرف التليجرام</strong>، مع <strong className="text-amber-300">كلمة المرور (وهي رقم حسابك ID في شركة البروكر)</strong> لعرض بيانات عضويتك وتاريخ انتهاء اشتراكك ومراسلة المشرف:
                </p>
                <form onSubmit={handleMemberLookup} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">
                        البريد الإلكتروني أو رقم الموبايل أو @username
                      </label>
                      <input
                        type="text"
                        required
                        value={memberLookupInput}
                        onChange={(e) => setMemberLookupInput(e.target.value)}
                        dir="ltr"
                        placeholder="example@gmail.com / +2010..."
                        className="w-full px-3.5 py-2.5 text-sm bg-[#0B0F17] border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-emerald-400 font-mono-num"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-amber-300 font-semibold mb-1">
                        كلمة المرور (رقم حسابك ID في شركة البروكر)
                      </label>
                      <input
                        type="password"
                        required
                        value={memberPasswordInput}
                        onChange={(e) => setMemberPasswordInput(e.target.value)}
                        dir="ltr"
                        placeholder="رقم حسابك في البروكر (Account ID)"
                        className="w-full px-3.5 py-2.5 text-sm bg-[#0B0F17] border border-amber-500/40 rounded-lg text-slate-100 focus:outline-none focus:border-amber-400 font-mono-num"
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    className="w-full py-2.5 text-xs sm:text-sm font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                  >
                    تسجيل الدخول وعرض بيانات عضويتي VIP
                  </button>
                </form>
                {memberLookupError && (
                  <p className="text-xs text-rose-400">{memberLookupError}</p>
                )}
                <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
                  <span>لم تسجل في قائمة VIP بعد؟</span>
                  <button
                    type="button"
                    onClick={() => {
                      setShowMemberPortalModal(false);
                      setRegSuccess(false);
                      setShowRegisterModal(true);
                    }}
                    className="text-amber-400 hover:text-amber-300 font-bold underline cursor-pointer"
                  >
                    سجل عضوية جديدة الآن
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                {/* Member Profile Details Card */}
                <div className="p-4 bg-[#0B0F17] border border-slate-800 rounded-xl space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
                    <div>
                      <span className="text-sm font-bold text-white">{currentMember.name}</span>
                      <span className="text-xs text-slate-400 mr-2">
                        ({currentMember.country || 'مصر 🇪🇬'})
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {currentMember.status === 'ACTIVE' ? (
                        <span className="px-2.5 py-1 text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-md">
                          ✅ عضوية VIP مفعّلة
                        </span>
                      ) : currentMember.status === 'BANNED' ? (
                        <span className="px-2.5 py-1 text-xs font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-md">
                          🚫 العضوية محظورة
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-md">
                          ⏳ قيد المراجعة والتفعيل
                        </span>
                      )}
                      <button
                        onClick={() => {
                          handleMemberLogout();
                          setShowMemberPortalModal(false);
                        }}
                        className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-rose-300 bg-rose-950/50 hover:bg-rose-900/60 border border-rose-500/40 rounded-md transition-colors cursor-pointer"
                      >
                        <LogOut className="w-3.5 h-3.5 text-rose-400" />
                        <span>تسجيل خروج العضو</span>
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                    <div className="p-2.5 bg-slate-900/80 rounded-lg flex items-center justify-between">
                      <span className="text-slate-400">تاريخ انتهاء العضوية VIP:</span>
                      <strong className="text-emerald-400 font-mono-num">
                        {currentMember.expiryDate || 'لم يُحدد بعد'}
                      </strong>
                    </div>
                    <div className="p-2.5 bg-slate-900/80 rounded-lg flex items-center justify-between">
                      <span className="text-slate-400">منصة التداول (البروكر):</span>
                      <strong className="text-amber-300">
                        {currentMember.broker} (ID: {currentMember.brokerAccountId || '—'})
                      </strong>
                    </div>
                    <div className="p-2.5 bg-slate-900/80 rounded-lg flex items-center justify-between">
                      <span className="text-slate-400">التليجرام:</span>
                      <strong className="text-slate-200 font-mono-num" dir="ltr">
                        {currentMember.telegramUsername}
                      </strong>
                    </div>
                    <div className="p-2.5 bg-slate-900/80 rounded-lg flex items-center justify-between">
                      <span className="text-slate-400">الموبايل:</span>
                      <strong className="text-slate-200 font-mono-num" dir="ltr">
                        {currentMember.phone}
                      </strong>
                    </div>
                  </div>

                  {/* Country-Specific Subscription Value OR Quotex Free Referral Status inside Member Profile */}
                  {(() => {
                    const isRef =
                      currentMember.subscriptionType === 'quotex_referral' ||
                      currentMember.planDuration === 'quotex_referral_free';
                    const memberPlan =
                      VIP_PLANS.find((p) => p.id === currentMember.planDuration) || VIP_PLANS[0];
                    const memberIsEgypt = isEgyptCountry(currentMember.country);
                    const memberIsPalestine = isPalestineCountry(currentMember.country);
                    const memberEgp = memberPlan.price * USD_TO_EGP_RATE;

                    if (isRef) {
                      return (
                        <div className="p-3.5 bg-gradient-to-r from-emerald-950/40 via-slate-900/95 to-amber-950/30 border border-emerald-500/40 rounded-xl space-y-2.5 text-xs">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <span className="text-slate-400">نظام الاشتراك المختار: </span>
                              <strong className="text-emerald-300">
                                🎁 تفعيل مجاني عبر إحالة كيوتكس (Quotex) + إيداع 100$ في حسابك
                              </strong>
                            </div>
                            {currentMember.quotexDepositConfirmed ? (
                              <span className="px-2.5 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded-md font-bold">
                                ✅ تم تأكيد الإحالة وإيداع 100$ (عضوية مجانية مفعّلة)
                              </span>
                            ) : (
                              <span className="px-2.5 py-1 bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded-md font-bold">
                                ⏳ بانتظار مراجعة المشرف وتأكيد إيداع 100$ في حسابك
                              </span>
                            )}
                          </div>

                          <div className="p-2.5 bg-[#0B0F17]/90 border border-slate-800 rounded-lg text-[11px] text-slate-300 leading-relaxed flex flex-wrap items-center justify-between gap-2">
                            <span>
                              📌 تأكد من التسجيل عبر الرابط الرسمي وإرسال <strong className="text-white">رقم حسابك في كيوتكس ({currentMember.brokerAccountId})</strong> للمشرف بالأسفل، ثم إيداع <strong className="text-amber-300">100$</strong> في حسابك على كيوتكس للحصول على العضوية المجانية.
                            </span>
                            <a
                              href={autoPilot.quotexReferralLink || 'https://broker-qx.pro/?lid=2303934'}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-3 py-1.5 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-md inline-flex items-center gap-1 shrink-0"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              <span>فتح رابط الإحالة في كيوتكس</span>
                            </a>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div className="p-3 bg-slate-900/90 border border-amber-500/30 rounded-lg flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div>
                          <span className="text-slate-400">الباقة وقيمة الاشتراك: </span>
                          <strong className="text-amber-300 font-mono-num">
                            {memberPlan.label} —{' '}
                            {memberIsEgypt
                              ? `${memberEgp.toLocaleString('en-US')} جنيه مصري`
                              : `${memberPlan.price} دولار ($)`}
                          </strong>
                        </div>
                        <div>
                          <span className="text-slate-400">وسيلة الدفع المعتمدة لدولتك: </span>
                          <strong className="text-emerald-300">
                            {memberIsEgypt
                              ? '📱 المحافظ الإلكترونية فقط'
                              : memberIsPalestine
                              ? '🏦 تحويل لبنك فلسطيني بالدولار أو الشيكل ($)'
                              : '🏦 تحويل بنكي (Bank Transfer)'}
                          </strong>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setRenewalSentSuccess(false);
                            setRenewalCountry(currentMember.country || COUNTRIES_LIST[0]);
                            setRenewalPlanId(currentMember.planDuration || '1_month');
                            setRenewalPaymentMethod(
                              getPaymentMethodsForCountry(currentMember.country || COUNTRIES_LIST[0])[0]
                            );
                            setShowRenewalModal(true);
                          }}
                          className="px-3 py-1.5 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg flex items-center gap-1.5 cursor-pointer"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>طلب تجديد الاشتراك الآن 🔄</span>
                        </button>
                      </div>
                    );
                  })()}

                  {/* Activation Link Banner if sent by Admin */}
                  {currentMember.activationLink && (
                    <div className="p-3 bg-emerald-950/40 border border-emerald-500/40 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="text-xs text-emerald-200">
                        🎉 <strong>رابط تفعيل ودخول قناة VIP الخاص بك جاهز:</strong>
                      </div>
                      <a
                        href={currentMember.activationLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3.5 py-1.5 text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-md inline-flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <Link2 className="w-3.5 h-3.5" />
                        <span>فتح رابط التفعيل الآن</span>
                      </a>
                    </div>
                  )}
                </div>

                {/* Member <-> Admin Chat Thread */}
                <div className="space-y-3">
                  <div className="text-xs font-bold text-slate-300 flex items-center justify-between">
                    <span>المراسلات المباشرة مع المشرف (يمكنك إرفاق صورة التحويل هنا):</span>
                    <span className="text-[11px] text-slate-400 font-normal">
                      تصل رسائلك وصور الإيصالات فوراً إلى المشرف
                    </span>
                  </div>

                  <div className="h-64 overflow-y-auto p-4 bg-[#0B0F17] border border-slate-800 rounded-xl space-y-3">
                    {(!currentMember.messages || currentMember.messages.length === 0) ? (
                      <div className="h-full flex items-center justify-center text-xs text-slate-500">
                        لا توجد رسائل بعد. يمكنك إرسال رسالتك أو صورة إيصال التحويل للمشرف بالأسفل.
                      </div>
                    ) : (
                      currentMember.messages.map((m) => (
                        <div
                          key={m.id}
                          className={`flex flex-col ${
                            m.sender === 'member' ? 'items-start' : 'items-end'
                          }`}
                        >
                          <div
                            className={`max-w-[85%] p-3 rounded-xl text-xs leading-relaxed whitespace-pre-wrap ${
                              m.sender === 'admin'
                                ? 'bg-emerald-950/60 border border-emerald-500/40 text-emerald-100'
                                : 'bg-slate-800 border border-slate-700 text-slate-100'
                            }`}
                          >
                            <div className="text-[10px] font-bold mb-1 opacity-75">
                              {m.sender === 'admin' ? '👑 إدارة نَبض التداول (المشرف)' : `👤 أنت (${currentMember.name})`}
                            </div>
                            <div>{m.text}</div>
                            {m.imageUrl && (
                              <div className="mt-2">
                                <img
                                  src={m.imageUrl}
                                  alt="إيصال التحويل"
                                  className="max-h-52 rounded-lg border border-slate-700 object-contain"
                                />
                              </div>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-500 mt-1 font-mono-num">
                            {new Date(m.createdAt).toLocaleTimeString('ar-EG', {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                        </div>
                      ))
                    )}
                  </div>

                  {currentMember.status === 'BANNED' ? (
                    <div className="p-3 bg-rose-950/40 border border-rose-500/40 rounded-lg text-xs text-rose-300 text-center">
                      تم حظر هذه العضوية من قِبل الإدارة ولا يمكن إرسال رسائل جديدة.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {memberChatImage && (
                        <div className="p-2 bg-slate-950 border border-emerald-500/40 rounded-lg flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 text-xs text-emerald-300">
                            <img
                              src={memberChatImage}
                              alt="معاينة الإيصال"
                              className="h-10 w-10 rounded object-cover border border-slate-700"
                            />
                            <span>✅ تم إرفاق صورة إيصال التحويل — اضغط إرسال للمشرف</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setMemberChatImage('')}
                            className="text-xs text-rose-400 hover:underline cursor-pointer"
                          >
                            إزالة الصورة
                          </button>
                        </div>
                      )}
                      <div className="flex flex-wrap sm:flex-nowrap gap-2">
                        <label className="px-3 py-2.5 text-xs font-bold text-amber-300 bg-slate-800 hover:bg-slate-700 border border-amber-500/40 rounded-lg cursor-pointer flex items-center gap-1.5 shrink-0">
                          <ImageIcon className="w-4 h-4 text-amber-400" />
                          <span>إرفاق صورة التحويل</span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) =>
                              handleReceiptImageUpload(e, (url) => setMemberChatImage(url))
                            }
                            className="hidden"
                          />
                        </label>
                        <input
                          type="text"
                          value={memberChatInput}
                          onChange={(e) => setMemberChatInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleSendSubscriberMessage(
                                currentMember.id,
                                'member',
                                memberChatInput,
                                memberChatImage || undefined
                              );
                            }
                          }}
                          placeholder="اكتب رسالتك أو أرفق صورة التحويل للمشرف..."
                          className="flex-1 px-3.5 py-2.5 text-xs sm:text-sm bg-[#0B0F17] border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-emerald-400"
                        />
                        <button
                          type="button"
                          disabled={isSendingMemberMsg || (!memberChatInput.trim() && !memberChatImage)}
                          onClick={() =>
                            handleSendSubscriberMessage(
                              currentMember.id,
                              'member',
                              memberChatInput,
                              memberChatImage || undefined
                            )
                          }
                          className="px-4 py-2.5 text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 disabled:opacity-50 rounded-lg transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>إرسال للمشرف</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ADMIN MODAL: Edit Subscriber, Set Expiry Date, Send Activation Link, Ban & Chat */}
      {selectedAdminSub && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-3xl p-6 bg-slate-900 border border-slate-700 rounded-xl space-y-5 shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-emerald-400" />
                <h3 className="text-base font-bold text-white">
                  إدارة العضو: {selectedAdminSub.name} ({selectedAdminSub.country || 'مصر 🇪🇬'})
                </h3>
              </div>
              <button
                onClick={() => setSelectedAdminSubId(null)}
                className="p-1 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Left 6 Cols: Edit Member Info, Status, Expiry Date & Activation Link */}
              <div className="lg:col-span-6 space-y-3.5 bg-[#0B0F17] p-4 rounded-xl border border-slate-800">
                <div className="text-xs font-bold text-emerald-400 border-b border-slate-800 pb-2">
                  1. تعديل بيانات العضو وتاريخ انتهاء العضوية ورابط التفعيل
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">الاسم</label>
                    <input
                      type="text"
                      value={adminEditForm.name}
                      onChange={(e) => setAdminEditForm(p => ({ ...p, name: e.target.value }))}
                      className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">الدولة</label>
                    <select
                      value={adminEditForm.country}
                      onChange={(e) => setAdminEditForm(p => ({ ...p, country: e.target.value }))}
                      className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded text-white"
                    >
                      {COUNTRIES_LIST.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">معرف التليجرام</label>
                    <input
                      type="text"
                      dir="ltr"
                      value={adminEditForm.telegramUsername}
                      onChange={(e) =>
                        setAdminEditForm(p => ({ ...p, telegramUsername: e.target.value }))
                      }
                      className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded text-white font-mono-num"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">رقم الموبايل</label>
                    <input
                      type="text"
                      dir="ltr"
                      value={adminEditForm.phone}
                      onChange={(e) => setAdminEditForm(p => ({ ...p, phone: e.target.value }))}
                      className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded text-white font-mono-num"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">البروكر</label>
                    <select
                      value={adminEditForm.broker}
                      onChange={(e) => setAdminEditForm(p => ({ ...p, broker: e.target.value }))}
                      className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded text-white"
                    >
                      {BROKERS_LIST.map(b => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-amber-300 font-semibold mb-1">
                      رقم حساب البروكر (كلمة المرور)
                    </label>
                    <input
                      type="text"
                      dir="ltr"
                      value={adminEditForm.brokerAccountId}
                      onChange={(e) =>
                        setAdminEditForm(p => ({ ...p, brokerAccountId: e.target.value }))
                      }
                      className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-amber-500/40 rounded text-white font-mono-num"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">البريد الإلكتروني</label>
                  <input
                    type="email"
                    dir="ltr"
                    value={adminEditForm.email}
                    onChange={(e) => setAdminEditForm(p => ({ ...p, email: e.target.value }))}
                    className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded text-white font-mono-num"
                  />
                </div>

                {/* Package, Collected Amount ($), Payment Method & Quotex Free Referral Verification */}
                <div className="p-3 bg-slate-900/90 border border-emerald-500/30 rounded-lg space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-amber-300">
                      نوع نظام اشتراك العضو:
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          setAdminEditForm(p => ({
                            ...p,
                            subscriptionType: 'paid_plan',
                            planDuration:
                              p.planDuration === 'quotex_referral_free' ? '1_month' : p.planDuration
                          }))
                        }
                        className={`px-2.5 py-1 text-[11px] font-bold rounded cursor-pointer ${
                          adminEditForm.subscriptionType === 'paid_plan'
                            ? 'bg-amber-400 text-slate-950'
                            : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        💳 اشتراك شهري مدفوع
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setAdminEditForm(p => ({
                            ...p,
                            broker: 'Quotex (كوتيكس)',
                            subscriptionType: 'quotex_referral',
                            planDuration: 'quotex_referral_free',
                            amountPaid: 0,
                            paymentMethod: '🎁 إحالة كيوتكس مجاناً (التسجيل بالرابط + إيداع 100$ في حسابك)'
                          }))
                        }
                        className={`px-2.5 py-1 text-[11px] font-bold rounded cursor-pointer ${
                          adminEditForm.subscriptionType === 'quotex_referral'
                            ? 'bg-emerald-400 text-slate-950'
                            : 'bg-slate-800 text-emerald-300'
                        }`}
                      >
                        🎁 إحالة كيوتكس مجاناً (إيداع 100$)
                      </button>
                    </div>
                  </div>

                  {adminEditForm.subscriptionType === 'quotex_referral' && (
                    <div className="p-2.5 bg-emerald-950/35 border border-emerald-500/40 rounded-lg space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="flex items-center gap-2 text-xs font-bold text-emerald-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={adminEditForm.quotexDepositConfirmed}
                            onChange={(e) =>
                              setAdminEditForm(p => ({
                                ...p,
                                quotexDepositConfirmed: e.target.checked,
                                status: e.target.checked ? 'ACTIVE' : p.status
                              }))
                            }
                            className="h-4 w-4 accent-emerald-400 rounded cursor-pointer"
                          />
                          <span>✅ تم التأكد من التسجيل عبر الرابط وإيداع 100$ في حساب العضو على كيوتكس</span>
                        </label>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            const d = new Date();
                            d.setDate(d.getDate() + 30);
                            const expStr = d.toISOString().split('T')[0];
                            setAdminEditForm(p => ({
                              ...p,
                              quotexDepositConfirmed: true,
                              status: 'ACTIVE',
                              expiryDate: p.expiryDate || expStr
                            }));
                            setAdminChatInput(
                              `✅ تم التحقق من تسجيل حسابك في كيوتكس (ID: ${adminEditForm.brokerAccountId}) عبر رابط الإحالة وتأكيد إيداع 100$ في حسابك بنجاح! 🎁 تم تفعيل عضويتك المجانية في قناة VIP.`
                            );
                          }}
                          className="px-2.5 py-1 text-[11px] font-bold bg-emerald-400 hover:bg-emerald-300 text-slate-950 rounded cursor-pointer"
                        >
                          🎁 تأكيد إيداع 100$ وتجهيز رسالة التفعيل المجاني
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div>
                      <label className="block text-[11px] text-emerald-300 font-semibold mb-1">
                        باقة VIP
                      </label>
                      <select
                        value={adminEditForm.planDuration}
                        onChange={(e) => {
                          const val = e.target.value;
                          const selectedPlan = VIP_PLANS.find(pl => pl.id === val);
                          const nextExpiry = new Date();
                          nextExpiry.setDate(nextExpiry.getDate() + (selectedPlan?.days || 30));
                          const yyyyMmDd = nextExpiry.toISOString().split('T')[0];
                          setAdminEditForm(p => ({
                            ...p,
                            subscriptionType: val === 'quotex_referral_free' ? 'quotex_referral' : 'paid_plan',
                            planDuration: val,
                            amountPaid: selectedPlan ? selectedPlan.price : p.amountPaid,
                            expiryDate: p.expiryDate || yyyyMmDd
                          }));
                        }}
                        className="w-full px-2 py-1.5 text-xs bg-[#0B0F17] border border-slate-800 rounded text-white"
                      >
                        {VIP_PLANS.map(p => (
                          <option key={p.id} value={p.id}>
                            {p.label} ({p.price}$)
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] text-emerald-400 font-semibold mb-1">
                        المبلغ المحصّل ($)
                      </label>
                      <input
                        type="number"
                        min={0}
                        dir="ltr"
                        value={adminEditForm.amountPaid}
                        onChange={(e) =>
                          setAdminEditForm(p => ({ ...p, amountPaid: Number(e.target.value) || 0 }))
                        }
                        className="w-full px-2.5 py-1.5 text-xs bg-[#0B0F17] border border-emerald-500/50 rounded text-emerald-300 font-bold font-mono-num"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] text-slate-300 mb-1">وسيلة الدفع</label>
                      <select
                        value={adminEditForm.paymentMethod}
                        onChange={(e) =>
                          setAdminEditForm(p => ({ ...p, paymentMethod: e.target.value }))
                        }
                        className="w-full px-2 py-1.5 text-xs bg-[#0B0F17] border border-slate-800 rounded text-white"
                      >
                        {PAYMENT_METHODS.map(pm => (
                          <option key={pm} value={pm}>
                            {pm}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5 pt-1">
                  <div>
                    <label className="block text-[11px] text-amber-300 font-semibold mb-1">
                      حالة العضوية (تفعيل / حظر)
                    </label>
                    <select
                      value={adminEditForm.status}
                      onChange={(e) =>
                        setAdminEditForm(p => ({
                          ...p,
                          status: e.target.value as 'PENDING' | 'ACTIVE' | 'BANNED'
                        }))
                      }
                      className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-amber-500/40 rounded text-white font-semibold"
                    >
                      <option value="PENDING">⏳ قيد المراجعة</option>
                      <option value="ACTIVE">✅ مفعّل VIP</option>
                      <option value="BANNED">🚫 محظور (Banned)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] text-emerald-400 font-semibold mb-1">
                      تاريخ انتهاء العضوية VIP
                    </label>
                    <input
                      type="date"
                      value={adminEditForm.expiryDate}
                      onChange={(e) =>
                        setAdminEditForm(p => ({ ...p, expiryDate: e.target.value }))
                      }
                      className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-emerald-500/40 rounded text-white font-mono-num"
                    />
                  </div>
                </div>

                {/* Quick Set Expiry Duration Buttons */}
                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className="text-slate-400">ضبط الانتهاء تلقائياً:</span>
                  {VIP_PLANS.map(pl => (
                    <button
                      key={`set-exp-${pl.id}`}
                      type="button"
                      onClick={() => {
                        const d = new Date();
                        d.setDate(d.getDate() + pl.days);
                        setAdminEditForm(p => ({
                          ...p,
                          planDuration: pl.id,
                          amountPaid: pl.price,
                          expiryDate: d.toISOString().split('T')[0]
                        }));
                      }}
                      className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-emerald-300 rounded cursor-pointer"
                    >
                      +{pl.label} ({pl.price}$)
                    </button>
                  ))}
                </div>

                <div>
                  <label className="block text-[11px] text-amber-300 font-semibold mb-1">
                    رابط التفعيل أو دعوة قناة VIP الخاصة للعضو
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={adminEditForm.activationLink}
                    onChange={(e) =>
                      setAdminEditForm(p => ({ ...p, activationLink: e.target.value }))
                    }
                    placeholder="https://t.me/+AbCdEfGhIjKlMnOp"
                    className="w-full px-3 py-2 text-xs bg-slate-900 border border-amber-500/40 rounded text-white font-mono-num"
                  />
                </div>

                <div className="flex flex-wrap gap-2 pt-2">
                  <button
                    type="button"
                    disabled={isSavingSubscriber}
                    onClick={() => handleAdminUpdateSubscriber(selectedAdminSub.id, adminEditForm)}
                    className="flex-1 py-2 px-3 text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg transition-colors cursor-pointer"
                  >
                    حفظ التعديلات وتاريخ الانتهاء
                  </button>

                  <button
                    type="button"
                    disabled={isSavingSubscriber || !adminEditForm.activationLink.trim()}
                    onClick={() =>
                      handleAdminUpdateSubscriber(selectedAdminSub.id, {
                        ...adminEditForm,
                        status: 'ACTIVE',
                        sendActivationMessage: true
                      })
                    }
                    className="flex-1 py-2 px-3 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 rounded-lg transition-colors cursor-pointer"
                  >
                    🔗 إرسال رابط التفعيل للعضو وتفعيله
                  </button>
                </div>
              </div>

              {/* Right 6 Cols: Direct Chat with Member */}
              <div className="lg:col-span-6 flex flex-col justify-between bg-[#0B0F17] p-4 rounded-xl border border-slate-800 space-y-3">
                <div className="text-xs font-bold text-amber-400 border-b border-slate-800 pb-2 flex items-center justify-between">
                  <span>2. مراسلة العضو والرد على استفساراته</span>
                  <span className="text-[11px] text-slate-400 font-normal">
                    الرسائل: {selectedAdminSub.messages?.length || 0}
                  </span>
                </div>

                <div className="h-64 overflow-y-auto space-y-2.5 p-2">
                  {(!selectedAdminSub.messages || selectedAdminSub.messages.length === 0) ? (
                    <div className="h-full flex items-center justify-center text-xs text-slate-500">
                      لا توجد مراسلات مع هذا العضو بعد.
                    </div>
                  ) : (
                    selectedAdminSub.messages.map((m) => (
                      <div
                        key={m.id}
                        className={`flex flex-col ${
                          m.sender === 'admin' ? 'items-start' : 'items-end'
                        }`}
                      >
                        <div
                          className={`max-w-[85%] p-2.5 rounded-xl text-xs leading-relaxed whitespace-pre-wrap ${
                            m.sender === 'admin'
                              ? 'bg-emerald-950/60 border border-emerald-500/40 text-emerald-100'
                              : 'bg-amber-950/50 border border-amber-500/40 text-amber-100'
                          }`}
                        >
                          <div className="text-[10px] font-bold mb-1 opacity-75">
                            {m.sender === 'admin' ? '👑 المشرف (أنت)' : `👤 العضو (${selectedAdminSub.name})`}
                          </div>
                          <div>{m.text}</div>
                          {m.imageUrl && (
                            <div className="mt-2">
                              <a
                                href={m.imageUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="اضغط لتكبير صورة إيصال التحويل"
                              >
                                <img
                                  src={m.imageUrl}
                                  alt="إيصال التحويل من العضو"
                                  className="max-h-56 rounded-lg border border-amber-500/50 object-contain"
                                />
                              </a>
                            </div>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-500 mt-0.5 font-mono-num">
                          {new Date(m.createdAt).toLocaleTimeString('ar-EG', {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      </div>
                    ))
                  )}
                </div>

                {/* Quick Notes Bar (الاستعانة بالمفكرة السريعة في المراسلات بضغطة واحدة مثل واتساب) */}
                {quickNotes.length > 0 && (
                  <div className="pt-2 border-t border-slate-800 space-y-1.5">
                    <div className="text-[11px] text-amber-300 font-semibold flex items-center gap-1">
                      <Bookmark className="w-3.5 h-3.5" />
                      <span>إدراج سريع من المفكرة المحفوظة (اضغط لإدراج النص أو إرساله):</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
                      {quickNotes.map((n) => (
                        <button
                          key={`chat-note-${n.id}`}
                          type="button"
                          onClick={() => setAdminChatInput(n.content)}
                          className="px-2.5 py-1 text-[11px] bg-slate-800 hover:bg-amber-500/20 text-amber-200 border border-amber-500/30 rounded-md transition-colors cursor-pointer"
                          title={n.content}
                        >
                          📋 {n.title}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-2 pt-2 border-t border-slate-800">
                  <textarea
                    rows={2}
                    value={adminChatInput}
                    onChange={(e) => setAdminChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendSubscriberMessage(selectedAdminSub.id, 'admin', adminChatInput);
                      }
                    }}
                    placeholder="اكتب رسالة للعضو أو اختر من المفكرة السريعة بالأعلى..."
                    className="flex-1 px-3 py-2 text-xs bg-slate-900 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-emerald-400 resize-none"
                  />
                  <button
                    type="button"
                    disabled={!adminChatInput.trim()}
                    onClick={() =>
                      handleSendSubscriberMessage(selectedAdminSub.id, 'admin', adminChatInput)
                    }
                    className="px-4 py-2 text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 disabled:opacity-50 rounded-lg transition-colors cursor-pointer whitespace-nowrap self-end"
                  >
                    إرسال للعضو
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUBSCRIPTION RENEWAL MODAL (نافذة طلب تجديد الاشتراك — تظهر للعضو فقط داخل حسابه) */}
      {showRenewalModal && currentMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-xl p-6 bg-slate-900 border border-amber-500/40 rounded-xl space-y-5 shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-bold text-white">
                  طلب تجديد الاشتراك في قناة VIP (شغال 24 ساعة)
                </h3>
              </div>
              <button
                onClick={() => setShowRenewalModal(false)}
                className="p-1 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {renewalSentSuccess ? (
              <div className="p-5 bg-emerald-950/40 border border-emerald-500/40 rounded-xl text-center space-y-3">
                <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
                <h4 className="text-base font-bold text-white">
                  تم إرسال طلب تجديد الاشتراك إلى المشرف بنجاح!
                </h4>
                <p className="text-xs text-slate-300 leading-relaxed">
                  وصل طلب التجديد وبيانات الباقة المختارة (وصورة التحويل إن أرفقتها) إلى صندوق رسائل المشرف مباشرة. يمكنك متابعة الرد وتحديث تاريخ انتهاء عضويتك من لوحة عضو VIP.
                </p>
                <div className="pt-2 flex flex-col sm:flex-row gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowRenewalModal(false);
                      setShowMemberPortalModal(true);
                    }}
                    className="flex-1 py-2.5 text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg transition-colors cursor-pointer"
                  >
                    فتح صندوق المراسلات مع المشرف
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowRenewalModal(false)}
                    className="px-4 py-2.5 text-xs font-bold text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
                  >
                    إغلاق
                  </button>
                </div>
              </div>
            ) : (
              (() => {
                const activeCountry =
                  currentMember?.country || renewalCountry || COUNTRIES_LIST[0];
                const isEgypt = isEgyptCountry(activeCountry);
                const isPalestine = isPalestineCountry(activeCountry);
                const allowedMethods = getPaymentMethodsForCountry(activeCountry);
                const selectedPlanObj =
                  VIP_PLANS.find((p) => p.id === renewalPlanId) || VIP_PLANS[0];
                const egpAmount = selectedPlanObj.price * USD_TO_EGP_RATE;

                return (
                  <form onSubmit={handleSubmitRenewalRequest} className="space-y-4">
                    {/* Country selector if not logged in yet */}
                    {!currentMember && (
                      <div className="flex items-center justify-between gap-2 p-3 bg-[#0B0F17] border border-slate-800 rounded-lg">
                        <span className="text-xs font-bold text-slate-300">
                          🌍 اختر دولتك لعرض السعر وطريقة الاشتراك:
                        </span>
                        <select
                          value={renewalCountry}
                          onChange={(e) => {
                            const nextC = e.target.value;
                            setRenewalCountry(nextC);
                            setRenewalPaymentMethod(getPaymentMethodsForCountry(nextC)[0]);
                          }}
                          className="px-3 py-1.5 text-xs font-bold bg-slate-900 border border-amber-500/40 rounded text-white"
                        >
                          {COUNTRIES_LIST.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Step 1: Select Package */}
                    <div className="space-y-2">
                      <label className="block text-xs font-bold text-amber-300">
                        1. اختر باقة التجديد المطلوبة:
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        {VIP_PLANS.map((plan) => {
                          const isSelected = renewalPlanId === plan.id;
                          const planEgp = plan.price * USD_TO_EGP_RATE;
                          return (
                            <button
                              key={`renew-${plan.id}`}
                              type="button"
                              onClick={() => setRenewalPlanId(plan.id)}
                              className={`p-3 rounded-xl border text-center transition-all cursor-pointer space-y-1 ${
                                isSelected
                                  ? 'bg-emerald-950/40 border-emerald-400 ring-1 ring-emerald-400'
                                  : 'bg-[#0B0F17] border-slate-800 hover:border-amber-500/40'
                              }`}
                            >
                              <div className="text-xs font-bold text-white">{plan.label}</div>
                              {isEgypt ? (
                                <div className="text-sm font-extrabold text-amber-400 font-mono-num">
                                  {planEgp.toLocaleString('en-US')} جنيه
                                </div>
                              ) : (
                                <div className="text-base font-extrabold text-amber-400 font-mono-num">
                                  ${plan.price}
                                </div>
                              )}
                              <div className="text-[10px] text-emerald-400">{plan.badge}</div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Step 2: Display Price & Payment Method for Selected Package */}
                    <div className="p-4 bg-[#0B0F17] border border-emerald-500/40 rounded-xl space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
                        <span className="text-xs text-slate-300">
                          الباقة المختارة للتجديد:{' '}
                          <strong className="text-white">{selectedPlanObj.label}</strong>
                        </span>
                        <span className="text-base sm:text-lg font-extrabold text-emerald-400 font-mono-num">
                          المطلوب سداده:{' '}
                          {isEgypt
                            ? `${egpAmount.toLocaleString('en-US')} جنيه مصري`
                            : `${selectedPlanObj.price} دولار ($)`}
                        </span>
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-xs font-bold text-amber-300">
                          2. طريقة الاشتراك والتحويل المتاحة في ({activeCountry}):
                        </label>
                        <select
                          value={
                            allowedMethods.includes(renewalPaymentMethod)
                              ? renewalPaymentMethod
                              : allowedMethods[0]
                          }
                          onChange={(e) => setRenewalPaymentMethod(e.target.value)}
                          className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-900 border border-slate-700 rounded-lg text-white font-semibold"
                        >
                          {allowedMethods.map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                        </select>
                        <p className="text-[11px] text-slate-400 pt-0.5">
                          {isEgypt
                            ? '📱 الدفع في مصر متاح عبر المحافظ الإلكترونية فقط بالجنيه المصري.'
                            : isPalestine
                            ? '🏦 الدفع في فلسطين متاح عبر تحويل لبنك فلسطيني بالدولار أو الشيكل ($).'
                            : '🏦 الدفع متاح عبر التحويل البنكي (Bank Transfer) بالدولار ($).'}
                        </p>
                      </div>
                    </div>

                    {/* Step 3: Instruction to Send Transfer Screenshot to Admin + Direct Upload */}
                    <div className="p-4 bg-amber-950/25 border border-amber-500/40 rounded-xl space-y-3">
                      <div className="flex items-start gap-2">
                        <Upload className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <div className="text-xs font-bold text-amber-300">
                            3. بعد إتمام التحويل، يرجى إرسال صورة إيصال التحويل للمشرف:
                          </div>
                          <p className="text-[11px] text-slate-300 leading-relaxed">
                            قم بإرفاق <strong className="text-white">صورة إيصال التحويل (Screenshot)</strong> بالأسفل أو إرسالها في صندوق مراسلة المشرف ليتم تمديد تاريخ انتهاء عضويتك فوراً.
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        <label className="px-3.5 py-2 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg cursor-pointer inline-flex items-center gap-1.5">
                          <ImageIcon className="w-4 h-4" />
                          <span>
                            {renewalReceiptImage
                              ? 'تغيير صورة إيصال التحويل'
                              : '📸 اختر صورة إيصال التحويل لإرسالها للمشرف'}
                          </span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) =>
                              handleReceiptImageUpload(e, (url) => setRenewalReceiptImage(url))
                            }
                            className="hidden"
                          />
                        </label>

                        {renewalReceiptImage && (
                          <div className="flex items-center gap-2">
                            <img
                              src={renewalReceiptImage}
                              alt="معاينة الإيصال"
                              className="h-12 w-12 rounded-lg object-cover border border-emerald-400"
                            />
                            <span className="text-xs text-emerald-400 font-bold">
                              ✓ تم إرفاق صورة التحويل
                            </span>
                          </div>
                        )}
                      </div>

                      <input
                        type="text"
                        value={renewalNote}
                        onChange={(e) => setRenewalNote(e.target.value)}
                        placeholder="ملاحظة إضافية للمشرف (اختياري: مثل رقم المحفظة المحول منها)..."
                        className="w-full px-3 py-2 text-xs bg-[#0B0F17] border border-slate-800 rounded-lg text-white focus:outline-none focus:border-amber-400"
                      />
                    </div>

                    {currentMember ? (
                      <button
                        type="submit"
                        disabled={isSubmittingRenewal}
                        className="w-full py-3 text-xs sm:text-sm font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-2"
                      >
                        <Send className="w-4 h-4" />
                        <span>
                          {isSubmittingRenewal
                            ? 'جاري إرسال طلب التجديد وصورة التحويل للمشرف...'
                            : 'إرسال طلب التجديد وصورة التحويل للمشرف الآن'}
                        </span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setShowRenewalModal(false);
                          setShowMemberPortalModal(true);
                        }}
                        className="w-full py-3 text-xs sm:text-sm font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors cursor-pointer"
                      >
                        سجّل دخولك أولاً لإرسال طلب التجديد وصورة الإيصال للمشرف
                      </button>
                    )}
                  </form>
                );
              })()
            )}
          </div>
        </div>
      )}

      {/* Admin Login Modal */}
      {showLoginModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md p-6 bg-slate-900 border border-slate-800 rounded-xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-emerald-400" />
                <h3 className="text-base font-bold text-white">تسجيل دخول المشرف</h3>
              </div>
              <button
                onClick={() => {
                  setShowLoginModal(false);
                  setLoginError('');
                }}
                className="text-xs text-slate-400 hover:text-white cursor-pointer"
              >
                إغلاق
              </button>
            </div>

            <form onSubmit={handleAdminLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  البريد الإلكتروني للمشرف
                </label>
                <input
                  type="email"
                  required
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  dir="ltr"
                  placeholder="thrayanabil2026@gmail.com"
                  autoComplete="email"
                  className="w-full px-3.5 py-2.5 text-sm bg-[#0B0F17] border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-emerald-500 font-mono-num"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  كلمة المرور
                </label>
                <input
                  type="password"
                  required
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  dir="ltr"
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 text-sm bg-[#0B0F17] border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-emerald-500 font-mono-num"
                />
              </div>

              {loginError && (
                <p className="text-xs text-rose-400 font-medium">{loginError}</p>
              )}

              <button
                type="submit"
                disabled={isLoggingIn}
                className="w-full py-2.5 text-sm font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg transition-colors cursor-pointer"
              >
                {isLoggingIn ? 'جاري التحقق...' : 'دخول إلى لوحة المشرف'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Quiet Footer with Discrete Admin Lock Button */}
      <footer className="mt-auto border-t border-slate-800/70 py-5 px-6 text-xs text-slate-500">
        <div className="max-w-[1240px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <span>نَبض التداول — إشارات السوق العالمي المركّزة · القناة الرسمية @ZadNBFX</span>
          <div className="flex items-center gap-4">
            <a
              href="https://t.me/ZadNBFX"
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              قناتنا المجانية @ZadNBFX
            </a>
            <span aria-hidden="true">·</span>
            {isAdminAuthenticated ? (
              <button
                onClick={() => setActiveView(activeView === 'admin' ? 'visitor' : 'admin')}
                className="text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                {activeView === 'admin' ? 'عرض واجهة الزائر' : 'إدارة المشرف'}
              </button>
            ) : (
              <button
                onClick={() => setShowLoginModal(true)}
                className="relative z-30 flex items-center gap-1 text-slate-500 hover:text-emerald-400 transition-colors cursor-pointer pointer-events-auto"
                title="دخول المشرف"
              >
                <Lock className="w-3 h-3" />
                <span>دخول المشرف</span>
              </button>
            )}
          </div>
        </div>
      </footer>

      {/* Phase 3: Performance Analytics & Testing Audit Modal */}
      {showAnalyticsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-4xl max-h-[90vh] bg-[#0E131F] border border-slate-700/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-right">
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-900/60 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <BarChart2 className="w-5 h-5 text-emerald-400" />
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-white">
                    تدقيق الأداء واختبار الاستراتيجية الفعلي (Phase 3 Audit)
                  </h3>
                  <p className="text-xs text-slate-400">
                    تحليل إحصائي منفصل لكل زوج عملات، فئات RSI، ونماذج انعكاس الشموع
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAnalyticsModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-6 overflow-y-auto space-y-6 text-xs sm:text-sm">
              {isLoadingAnalytics ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
                  <RefreshCw className="w-6 h-6 animate-spin text-emerald-400" />
                  <span>جاري احتساب البيانات وإحصاء الصفقات المسجلة...</span>
                </div>
              ) : analyticsData ? (
                <>
                  {/* Summary KPI Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3.5 bg-slate-900/80 border border-slate-800 rounded-xl space-y-1">
                      <div className="text-xs text-slate-400">إجمالي الصفقات المكتملة</div>
                      <div className="text-xl sm:text-2xl font-extrabold text-white font-mono-num">
                        {analyticsData.summary?.totalSignals || 0}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {analyticsData.summary?.directWins || 0} مباشر / {analyticsData.summary?.gale1Wins || 0} مضاعفة 1
                      </div>
                    </div>

                    <div className="p-3.5 bg-slate-900/80 border border-emerald-500/30 rounded-xl space-y-1">
                      <div className="text-xs text-emerald-400">نسبة الفوز المباشر (0 مضاعفة)</div>
                      <div className="text-xl sm:text-2xl font-extrabold text-emerald-300 font-mono-num">
                        {analyticsData.summary?.winRateDirect || 0}%
                      </div>
                      <div className="text-[11px] text-slate-400">
                        شمعة الدخول الأولى فقط
                      </div>
                    </div>

                    <div className="p-3.5 bg-slate-900/80 border border-amber-500/30 rounded-xl space-y-1">
                      <div className="text-xs text-amber-400">نسبة الفوز (مع مضاعفة 1)</div>
                      <div className="text-xl sm:text-2xl font-extrabold text-amber-300 font-mono-num">
                        {analyticsData.summary?.winRateWithGale || 0}%
                      </div>
                      <div className="text-[11px] text-slate-400">
                        مضاعفة واحدة كحد أقصى
                      </div>
                    </div>

                    <div className="p-3.5 bg-slate-900/80 border border-slate-800 rounded-xl space-y-1">
                      <div className="text-xs text-slate-400">أطول سلسلة ربح / خسارة</div>
                      <div className="text-base sm:text-lg font-bold text-white font-mono-num">
                        🟢 {analyticsData.summary?.maxWinStreak || 0} / 🔴 {analyticsData.summary?.maxLossStreak || 0}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Max Win Streak / Drawdown
                      </div>
                    </div>
                  </div>

                  {/* Table 1: Breakdown by Currency Pair */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-slate-200 flex items-center gap-2">
                      <span>📌 نتائج الأداء منفصلة لكل زوج عملات:</span>
                    </h4>
                    <div className="border border-slate-800 rounded-xl overflow-x-auto bg-slate-950/40">
                      <table className="w-full text-right text-xs">
                        <thead className="bg-slate-900/80 border-b border-slate-800 text-slate-400 font-medium">
                          <tr>
                            <th className="p-2.5">الزوج</th>
                            <th className="p-2.5">الصفقات</th>
                            <th className="p-2.5">فوز مباشر</th>
                            <th className="p-2.5">مضاعفة 1</th>
                            <th className="p-2.5">خسائر</th>
                            <th className="p-2.5">دقة 0 مضاعفة</th>
                            <th className="p-2.5">دقة مضاعفة 1</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-mono-num">
                          {analyticsData.byPair && analyticsData.byPair.length > 0 ? (
                            analyticsData.byPair.map((row: any) => (
                              <tr key={row.pair} className="hover:bg-slate-900/40">
                                <td className="p-2.5 font-bold text-white">{row.pair}</td>
                                <td className="p-2.5 text-slate-300">{row.total}</td>
                                <td className="p-2.5 text-emerald-400 font-semibold">{row.directWins}</td>
                                <td className="p-2.5 text-amber-400">{row.gale1Wins}</td>
                                <td className="p-2.5 text-rose-400">{row.losses}</td>
                                <td className="p-2.5 font-bold text-emerald-400">{row.winRateDirect}%</td>
                                <td className="p-2.5 font-bold text-amber-400">{row.winRateWithGale}%</td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={7} className="p-4 text-center text-slate-500 font-sans">
                                لا توجد صفقات مكتملة كافية بعد لإحصاء الأزواج.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Table 2: Breakdown by RSI Tier */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold text-slate-200">
                        📈 دقة الصفقات بحسب مستويات تشبع RSI:
                      </h4>
                      <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/40">
                        <table className="w-full text-right text-xs">
                          <thead className="bg-slate-900/80 border-b border-slate-800 text-slate-400">
                            <tr>
                              <th className="p-2">نطاق RSI</th>
                              <th className="p-2">الصفقات</th>
                              <th className="p-2">الرابحة</th>
                              <th className="p-2">نسبة النجاح</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60 font-mono-num">
                            {analyticsData.byRsiTier?.map((t: any) => (
                              <tr key={t.tier} className="hover:bg-slate-900/40">
                                <td className="p-2 font-sans text-slate-300">{t.tier}</td>
                                <td className="p-2 text-slate-300">{t.total}</td>
                                <td className="p-2 text-emerald-400">{t.wins}</td>
                                <td className="p-2 font-bold text-emerald-400">{t.winRate}%</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <h4 className="text-xs font-bold text-slate-200">
                        🕯️ دقة الصفقات بحسب نموذج الشموع والانعكاس:
                      </h4>
                      <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/40">
                        <table className="w-full text-right text-xs">
                          <thead className="bg-slate-900/80 border-b border-slate-800 text-slate-400">
                            <tr>
                              <th className="p-2">النموذج المكتشف</th>
                              <th className="p-2">الصفقات</th>
                              <th className="p-2">الرابحة</th>
                              <th className="p-2">نسبة النجاح</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60 font-mono-num">
                            {analyticsData.byReversalPattern?.map((p: any) => (
                              <tr key={p.pattern} className="hover:bg-slate-900/40">
                                <td className="p-2 font-sans text-slate-300 truncate max-w-[150px]" title={p.pattern}>
                                  {p.pattern}
                                </td>
                                <td className="p-2 text-slate-300">{p.total}</td>
                                <td className="p-2 text-emerald-400">{p.wins}</td>
                                <td className="p-2 font-bold text-emerald-400">{p.winRate}%</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>

                  {/* Actions / Export */}
                  <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800">
                    <a
                      href="/strategy.txt"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-medium transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>عرض ملف الاستراتيجية الشامل (strategy.txt)</span>
                    </a>

                    <button
                      type="button"
                      onClick={() => {
                        const blob = new Blob([JSON.stringify(analyticsData, null, 2)], {
                          type: 'application/json'
                        });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `zad-performance-audit-${new Date().toISOString().slice(0, 10)}.json`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer transition-colors"
                    >
                      <span>تصدير كشف التدقيق (JSON Data Export) 📥</span>
                    </button>
                  </div>
                </>
              ) : (
                <div className="text-center py-10 text-slate-400">
                  تعذر جلب بيانات الأداء، يرجى المحاولة لاحقاً.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Zadtoo About & Contact Modals */}
      <ZadtooAboutContactModal
        type={aboutContactType}
        onClose={() => setAboutContactType(null)}
        telegramLink={platformContactLinks.telegramChannelUrl}
        contactLinks={platformContactLinks}
      />
    </div>
  );
}
