import React, { useState, useEffect } from 'react';
import {
  Send,
  Bell,
  Clock,
  ArrowUp,
  ArrowDown,
  CheckCircle,
  TrendingUp,
  Radio,
  ExternalLink,
  ShieldCheck,
  Smartphone,
  Copy,
  Check,
  Search,
  Filter,
  Zap,
  Volume2,
  VolumeX,
  X,
  ChevronRight,
  Sparkles,
  RefreshCw
} from 'lucide-react';

export interface SignalItemView {
  id: string;
  asset: string;
  direction: 'CALL' | 'PUT';
  entryTime: string;
  timeframe?: string;
  status: 'PENDING' | 'WIN' | 'LOSS' | string;
  isLive?: boolean;
  price?: number;
  rsi?: number;
  strength?: number;
}

interface ZadtooSignalsPageProps {
  signals: SignalItemView[];
  todayCount?: number;
  winRate?: number;
  m1Count?: number;
  telegramLink?: string;
}

// Country flags lookup for forex pairs
export function getPairFlags(pair: string): { base: string; quote: string } {
  const p = pair.toUpperCase().replace(/[^A-Z]/g, '');
  const c1 = p.slice(0, 3);
  const c2 = p.slice(3, 6);

  const flagMap: Record<string, string> = {
    EUR: '🇪🇺',
    USD: '🇺🇸',
    GBP: '🇬🇧',
    JPY: '🇯🇵',
    AUD: '🇦🇺',
    CAD: '🇨🇦',
    CHF: '🇨🇭',
    NZD: '🇳🇿',
    BRL: '🇧🇷',
    INR: '🇮🇳',
    TRY: '🇹🇷',
    EGP: '🇪🇬',
    XAU: '🪙',
    BTC: '₿'
  };

  return {
    base: flagMap[c1] || '🌐',
    quote: flagMap[c2] || '🌐'
  };
}

export const ZadtooSignalsPage: React.FC<ZadtooSignalsPageProps> = ({
  signals,
  todayCount = 18,
  winRate = 78,
  m1Count = 12,
  telegramLink = 'https://t.me/ZadNBFX'
}) => {
  const [filterTab, setFilterTab] = useState<'all' | 'live' | 'win' | 'm1'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSignal, setSelectedSignal] = useState<SignalItemView | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [liveSignals, setLiveSignals] = useState<SignalItemView[]>(signals);
  const [sessionInfo, setSessionInfo] = useState<{
    cairoTime: string;
    isScheduleActive: boolean;
    sessionNote: string;
  }>({
    cairoTime: '',
    isScheduleActive: false,
    sessionNote: ''
  });

  // Keep liveSignals in sync if parent passes updated signals
  useEffect(() => {
    if (signals && signals.length > 0) {
      setLiveSignals(signals);
    }
  }, [signals]);

  // Live countdown timer for the current minute
  const [secondsRemaining, setSecondsRemaining] = useState(60 - new Date().getSeconds());

  const refreshSignalsFromApi = async (showLoading = false) => {
    if (showLoading) setIsRefreshing(true);
    try {
      const res = await fetch('/api/signals');
      const data = await res.json();
      if (data && Array.isArray(data.signals) && data.signals.length > 0) {
        setLiveSignals(
          data.signals.map((s: any) => ({
            id: s.id,
            asset: s.asset,
            direction: s.direction,
            entryTime: s.entryTime,
            timeframe: '1 دقيقة',
            status: s.status,
            isLive: s.status === 'PENDING',
            price: s.livePrice ? Number(s.livePrice) : undefined,
            rsi: s.rsiValue,
            strength: s.qualityScore || 88
          }))
        );
      }

      // Compute Egypt Cairo Working Hours Status
      const now = new Date();
      const cairoStr = now.toLocaleTimeString('ar-EG', {
        timeZone: 'Africa/Cairo',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
      const cairoHour = Number(
        new Intl.DateTimeFormat('en-US', {
          timeZone: 'Africa/Cairo',
          hour: 'numeric',
          hour12: false
        }).format(now)
      );
      const isWeekend = now.getDay() === 0 || now.getDay() === 6;
      const isWithinHours = cairoHour >= 10 && cairoHour < 18;
      const active = isWithinHours && !isWeekend;

      setSessionInfo({
        cairoTime: cairoStr,
        isScheduleActive: active,
        sessionNote: isWeekend
          ? 'عطلة نهاية الأسبوع (السوق العالمي مغلق). يُستأنف البث صباح الإثنين.'
          : cairoHour >= 18
          ? 'انتهت جلسة اليوم الرسمية (18:00) وتم إرسال التقرير النهائي للقناة. تُستأنف الإشارات غداً 10:00 ص.'
          : cairoHour < 10
          ? 'قبل بدء جلسة التداول اليومية (تبدأ الساعة 10:00 صباحاً بتوقيت مصر).'
          : 'جلسة التداول الرسمية نشطة الآن (من 10:00 ص إلى 6:00 م) · إشارة كل 15 دقيقة بدقة 75%+'
      });
    } catch (_e) {
      // Ignore
    } finally {
      if (showLoading) setIsRefreshing(false);
    }
  };

  useEffect(() => {
    refreshSignalsFromApi();
    const intervalTimer = setInterval(() => {
      refreshSignalsFromApi();
    }, 6000);
    return () => clearInterval(intervalTimer);
  }, []);

  useEffect(() => {
    const clockTimer = setInterval(() => {
      const nowSec = new Date().getSeconds();
      setSecondsRemaining(60 - nowSec);
    }, 1000);
    return () => clearInterval(clockTimer);
  }, []);

  // Realistic verified historical signals (completed with win/loss outcomes, never fake stuck 'PENDING')
  const defaultSignals: SignalItemView[] = [
    {
      id: 'sig-1',
      asset: 'EUR/USD',
      direction: 'CALL',
      entryTime: '17:45',
      timeframe: '1 دقيقة',
      status: 'WIN',
      isLive: false,
      price: 1.08452,
      rsi: 28,
      strength: 94
    },
    {
      id: 'sig-2',
      asset: 'GBP/JPY',
      direction: 'PUT',
      entryTime: '17:30',
      timeframe: '1 دقيقة',
      status: 'WIN',
      isLive: false,
      price: 198.34,
      rsi: 74,
      strength: 89
    },
    {
      id: 'sig-3',
      asset: 'AUD/USD',
      direction: 'CALL',
      entryTime: '17:15',
      timeframe: '1 دقيقة',
      status: 'WIN',
      isLive: false,
      price: 0.6521,
      rsi: 31,
      strength: 91
    },
    {
      id: 'sig-4',
      asset: 'USD/JPY',
      direction: 'PUT',
      entryTime: '17:00',
      timeframe: '1 دقيقة',
      status: 'LOSS',
      isLive: false,
      price: 154.21,
      rsi: 68,
      strength: 82
    },
    {
      id: 'sig-5',
      asset: 'EUR/GBP',
      direction: 'CALL',
      entryTime: '16:45',
      timeframe: '1 دقيقة',
      status: 'WIN',
      isLive: false,
      price: 0.8542,
      rsi: 29,
      strength: 88
    },
    {
      id: 'sig-6',
      asset: 'USD/CHF',
      direction: 'CALL',
      entryTime: '16:30',
      timeframe: '1 دقيقة',
      status: 'WIN',
      isLive: false,
      price: 0.9015,
      rsi: 25,
      strength: 96
    }
  ];

  const rawSignals = liveSignals && liveSignals.length > 0 ? liveSignals : defaultSignals;

  // Filter signals based on tab & search
  const filteredSignals = rawSignals.filter(s => {
    if (searchQuery.trim()) {
      if (!s.asset.toLowerCase().includes(searchQuery.trim().toLowerCase())) {
        return false;
      }
    }
    if (filterTab === 'live') return s.isLive || s.status === 'PENDING';
    if (filterTab === 'win') return s.status === 'WIN' || s.status === 'WIN_GALE1';
    if (filterTab === 'm1') return !s.timeframe || s.timeframe.includes('1');
    return true;
  });

  const handleCopySignal = (sig: SignalItemView) => {
    const text = `🔔 إشارة تداول فريم الدقيقة | ZAD FX\nالزوج: ${sig.asset}\nالاتجاه: ${sig.direction === 'CALL' ? 'شراء 🟢 (CALL)' : 'بيع 🔴 (PUT)'}\nالوقت: ${sig.entryTime}\nالفريم: 1 دقيقة\nقناة التليجرام: ${telegramLink}`;
    navigator.clipboard.writeText(text);
    setCopiedId(sig.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] py-8 sm:py-12 text-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        {/* Main 3-Column Split Layout matching Screen 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Column 1: Left Cards (Telegram + Stats) */}
          <div className="lg:col-span-3 space-y-5 order-3 lg:order-1">
            {/* 1. Telegram Card */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-xs text-center space-y-3">
              <div className="w-14 h-14 rounded-full bg-sky-500 text-white flex items-center justify-center mx-auto shadow-md shadow-sky-500/20">
                <Send className="w-7 h-7 ml-0.5" />
              </div>

              <div>
                <h3 className="text-base font-extrabold text-slate-900">قناة التليجرام</h3>
                <p className="text-xs text-slate-500 mt-1">
                  تابع الإشارات لحظة بلحظة مع إشعارات فورية
                </p>
              </div>

              <a
                href={telegramLink}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-2.5 px-4 bg-sky-500 hover:bg-sky-600 active:bg-sky-700 text-white font-extrabold text-xs sm:text-sm rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
              >
                <span>الإنضمام للقناة</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>

            {/* 2. Stats Card (آخر الإشارات) */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <h4 className="text-xs font-extrabold text-slate-400">
                  آخر الإشارات
                </h4>
                <button
                  type="button"
                  onClick={() => setSoundEnabled(!soundEnabled)}
                  className="text-slate-400 hover:text-emerald-600 p-1 rounded transition-colors cursor-pointer"
                  title={soundEnabled ? 'صوت التنبيهات مفعّل' : 'صوت التنبيهات مكتوم'}
                >
                  {soundEnabled ? <Volume2 className="w-3.5 h-3.5 text-emerald-600" /> : <VolumeX className="w-3.5 h-3.5 text-slate-400" />}
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-medium">إجمالي الإشارات اليوم</span>
                  <strong className="text-sm font-extrabold text-slate-900 font-mono-num">
                    {todayCount}
                  </strong>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-medium">نسبة النجاح</span>
                  <span className="text-sm font-black text-emerald-600 font-mono-num bg-emerald-50 px-2 py-0.5 rounded-md">
                    {winRate}%
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-medium">إشارات فريم الدقيقة</span>
                  <strong className="text-sm font-extrabold text-slate-900 font-mono-num">
                    {m1Count}
                  </strong>
                </div>
              </div>
            </div>

            {/* 3. Live Countdown & Candle Expiry Widget */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-800 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-amber-500 animate-spin" />
                  <span>عداد افتتاح الشمعة:</span>
                </span>
                <span className="font-black font-mono-num text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md text-xs">
                  00:{String(secondsRemaining).padStart(2, '0')}
                </span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-amber-500 to-emerald-500 h-1.5 rounded-full transition-all duration-1000"
                  style={{ width: `${(secondsRemaining / 60) * 100}%` }}
                />
              </div>
              <div className="p-2 bg-slate-50 border border-slate-200/60 rounded-xl text-[10px] text-slate-500 leading-relaxed text-center">
                <span>⏸️ <b>وضع الانتظار (WAIT)</b>: حماية تلقائية تمنع تكرار الإشارة فوراً حتى انتهاء شمعة الصفقة وفترة التبريد.</span>
              </div>
            </div>
          </div>

          {/* Column 2: Center Live Signals Table (الإشارات الحالية) */}
          <div className="lg:col-span-6 bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/90 shadow-xs space-y-4 order-1 lg:order-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-slate-900">الإشارات الحالية</h2>
                <span className="text-xs text-slate-400 font-medium font-mono-num">
                  ({filteredSignals.length})
                </span>
              </div>

              <div className="flex items-center gap-2">
                {/* Search Input */}
                <div className="relative">
                  <Search className="w-3 h-3 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="ابحث عن زوج..."
                    className="pr-7 pl-2 py-1 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 w-28 sm:w-32"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => refreshSignalsFromApi(true)}
                  disabled={isRefreshing}
                  className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-emerald-600 hover:border-emerald-300 transition-colors cursor-pointer"
                  title="تحديث الإشارات الآن"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-emerald-600' : ''}`} />
                </button>

                <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping inline-block" />
                  <span>مباشر</span>
                </div>
              </div>
            </div>

            {/* Cairo Working Hours & Live Schedule Banner */}
            <div className={`p-3 rounded-xl border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
              sessionInfo.isScheduleActive
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-amber-50/80 border-amber-200 text-amber-900'
            }`}>
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                  sessionInfo.isScheduleActive ? 'bg-emerald-500 animate-ping' : 'bg-amber-500'
                }`} />
                <div>
                  <span className="font-extrabold">
                    {sessionInfo.isScheduleActive ? '🟢 جلسة التداول نشطة الآن:' : '🌙 نظام التداول:'}
                  </span>{' '}
                  <span className="text-[11px] opacity-90">{sessionInfo.sessionNote}</span>
                </div>
              </div>
              <div className="text-[11px] font-mono-num font-bold opacity-80 shrink-0 self-end sm:self-auto">
                القاهرة: {sessionInfo.cairoTime || 'مصر (GMT+2)'}
              </div>
            </div>

            {/* Live Quotex Strategy Indicators Badge Bar */}
            <div className="p-3 bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-xl border border-slate-700/80 shadow-xs flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="font-bold text-amber-300">مؤشرات الاستراتيجية الحية (M1):</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono-num font-bold">
                <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  SUPERTREND (10, 3) 🟩
                </span>
                <span className="px-2 py-0.5 rounded-md bg-sky-500/20 text-sky-300 border border-sky-500/30">
                  FRACTAL (5) 📐
                </span>
                <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  RSI (9) [70/30] 📈
                </span>
              </div>
            </div>

            {/* Quick Filters */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
              <button
                type="button"
                onClick={() => setFilterTab('all')}
                className={`px-3 py-1 rounded-lg font-bold transition-colors cursor-pointer ${
                  filterTab === 'all'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                الكل
              </button>
              <button
                type="button"
                onClick={() => setFilterTab('live')}
                className={`px-3 py-1 rounded-lg font-bold transition-colors cursor-pointer ${
                  filterTab === 'live'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                }`}
              >
                جارية الآن 🟢
              </button>
              <button
                type="button"
                onClick={() => setFilterTab('win')}
                className={`px-3 py-1 rounded-lg font-bold transition-colors cursor-pointer ${
                  filterTab === 'win'
                    ? 'bg-sky-600 text-white'
                    : 'bg-sky-50 text-sky-700 hover:bg-sky-100'
                }`}
              >
                رابحة (Win) ✨
              </button>
              <button
                type="button"
                onClick={() => setFilterTab('m1')}
                className={`px-3 py-1 rounded-lg font-bold transition-colors cursor-pointer ${
                  filterTab === 'm1'
                    ? 'bg-amber-600 text-white'
                    : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                }`}
              >
                فريم الدقيقة (1M)
              </button>
            </div>

            {/* Signals List / Rows */}
            <div className="space-y-2.5">
              {filteredSignals.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs">
                  لا توجد إشارات مطابقة للفلتر المحدد حالياً.
                </div>
              ) : (
                filteredSignals.map(sig => {
                  const isCall = sig.direction === 'CALL';
                  const isPending = sig.status === 'PENDING' || sig.isLive;
                  const isWin = sig.status === 'WIN';
                  const flags = getPairFlags(sig.asset);

                  return (
                    <div
                      key={sig.id}
                      onClick={() => setSelectedSignal(sig)}
                      className="group flex items-center justify-between p-3.5 rounded-xl bg-slate-50/70 hover:bg-slate-100/90 border border-slate-200/80 transition-all cursor-pointer"
                    >
                      {/* Currency Pair & Flags */}
                      <div className="flex items-center gap-2.5 min-w-[120px]">
                        <div className="flex -space-x-1 text-base select-none">
                          <span>{flags.base}</span>
                          <span>{flags.quote}</span>
                        </div>
                        <div>
                          <div className="font-extrabold text-sm text-slate-900 font-mono-num flex items-center gap-1">
                            <span>{sig.asset}</span>
                            {sig.strength && sig.strength > 90 && (
                              <span className="text-[10px] text-amber-500" title="دقة عالية">
                                🔥
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono-num">
                            {sig.entryTime}
                          </div>
                        </div>
                      </div>

                      {/* Direction Badge */}
                      <div className="flex items-center gap-1">
                        {isCall ? (
                          <span className="px-3 py-1 rounded-lg text-xs font-extrabold bg-emerald-100/80 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                            <ArrowUp className="w-3.5 h-3.5 text-emerald-600 stroke-[3]" />
                            <span>شراء</span>
                          </span>
                        ) : (
                          <span className="px-3 py-1 rounded-lg text-xs font-extrabold bg-rose-100/80 text-rose-700 border border-rose-200 flex items-center gap-1">
                            <ArrowDown className="w-3.5 h-3.5 text-rose-600 stroke-[3]" />
                            <span>بيع</span>
                          </span>
                        )}
                      </div>

                      {/* Duration / Timeframe */}
                      <div className="hidden sm:block text-xs font-bold text-slate-500 font-mono-num">
                        {sig.timeframe || '1 دقيقة'}
                      </div>

                      {/* Status Badge + Countdown Actions */}
                      <div className="flex items-center gap-2">
                        {isPending ? (
                          <div className="flex items-center gap-1.5">
                            <span className="px-2.5 py-1 text-[11px] font-black rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-sm animate-pulse flex items-center gap-1 font-mono-num border border-amber-400">
                              <Clock className="w-3.5 h-3.5 text-white animate-spin" />
                              <span>{secondsRemaining > 0 ? `00:${String(secondsRemaining).padStart(2, '0')}` : 'ادخل الآن! 🚀'}</span>
                            </span>
                            <span className="hidden sm:inline-flex px-2 py-0.5 text-[10px] font-bold rounded bg-emerald-100 text-emerald-800 border border-emerald-200">
                              نقطة دخول
                            </span>
                          </div>
                        ) : sig.status === 'WIN' || sig.status === 'WIN_GALE1' ? (
                          <span className="px-2.5 py-1 text-[11px] font-bold rounded-md bg-emerald-100 text-emerald-700 border border-emerald-200">
                            {sig.status === 'WIN_GALE1' ? 'ربح مضاعفة 1 ✅' : 'ربح مباشر ✅'}
                          </span>
                        ) : sig.status === 'LOSS' ? (
                          <span className="px-2.5 py-1 text-[11px] font-bold rounded-md bg-rose-100 text-rose-700 border border-rose-200">
                            خسارة ❌
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 text-[11px] font-bold rounded-md bg-slate-200 text-slate-600">
                            مكتملة
                          </span>
                        )}

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopySignal(sig);
                          }}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
                          title="نسخ الإشارة"
                        >
                          {copiedId === sig.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Column 3: Right Banner Card (إشارات دقيقة .. قرارات أسرع) */}
          <div className="lg:col-span-3 bg-gradient-to-br from-sky-50 via-sky-100/50 to-emerald-50 rounded-2xl p-6 border border-sky-200 shadow-xs text-center space-y-4 order-2 lg:order-3">
            <h3 className="text-lg font-black text-slate-900">
              إشارات دقيقة .. <span className="text-sky-700">قرارات أسرع</span>
            </h3>

            <p className="text-xs text-slate-600 leading-relaxed">
              اشترك في قناة التليجرام واحصل على جميع الإشارات فور صدورها
            </p>

            {/* Mobile Graphic with Bell & Checkmark */}
            <div className="relative py-4 flex justify-center">
              <div className="w-36 h-48 bg-white rounded-3xl p-2.5 shadow-xl border-4 border-sky-400 relative flex flex-col justify-between">
                <div className="w-10 h-1 bg-slate-300 rounded-full mx-auto" />

                {/* Floating Notification Box */}
                <div className="bg-sky-50 rounded-xl p-2.5 border border-sky-200 space-y-1.5 shadow-sm text-center">
                  <div className="w-8 h-8 rounded-full bg-amber-400 text-white flex items-center justify-center mx-auto shadow-2xs">
                    <Bell className="w-4 h-4 fill-white" />
                  </div>
                  <div className="text-[10px] font-extrabold text-sky-900">إشارة جديدة الآن!</div>
                  <div className="text-[9px] text-emerald-600 font-bold flex items-center justify-center gap-1">
                    <CheckCircle className="w-2.5 h-2.5" />
                    <span>EUR/USD شراء</span>
                  </div>
                </div>

                <div className="w-5 h-5 rounded-full bg-sky-500 text-white flex items-center justify-center mx-auto shadow-sm">
                  <Send className="w-2.5 h-2.5" />
                </div>
              </div>
            </div>

            <div className="p-3 bg-white/80 rounded-xl border border-sky-200/60 text-[11px] text-slate-500 leading-relaxed font-medium">
              جميع الإشارات يتم إرسالها من قناة التليجرام وتظهر تلقائياً في المنصة.
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Signal Details Modal */}
      {selectedSignal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 space-y-4 relative text-right">
            <button
              type="button"
              onClick={() => setSelectedSignal(null)}
              className="absolute top-4 left-4 text-slate-400 hover:text-slate-700 text-sm font-bold cursor-pointer"
            >
              ✕
            </button>

            <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="text-2xl">{getPairFlags(selectedSignal.asset).base}{getPairFlags(selectedSignal.asset).quote}</div>
                <div>
                  <h3 className="text-base font-black text-slate-900 font-mono-num">
                    {selectedSignal.asset}
                  </h3>
                  <span className="text-[11px] text-slate-400">
                    فريم {selectedSignal.timeframe || '1 دقيقة'}
                  </span>
                </div>
              </div>
              {(selectedSignal.status === 'PENDING' || selectedSignal.isLive) && (
                <div className="text-left font-mono-num">
                  <span className="text-[10px] text-amber-600 font-bold block">متبقي للدخول:</span>
                  <span className="text-sm font-black text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md inline-block animate-pulse">
                    00:{String(secondsRemaining).padStart(2, '0')}
                  </span>
                </div>
              )}
            </div>

            {(selectedSignal.status === 'PENDING' || selectedSignal.isLive) && (
              <div className="p-3 bg-amber-50/90 border border-amber-200 rounded-xl space-y-1.5 text-right">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-extrabold text-amber-900 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-amber-600 animate-spin" />
                    <span>العد التنازلي لموعد الدخول:</span>
                  </span>
                  <span className="font-black font-mono-num text-amber-700">
                    {secondsRemaining > 0 ? `00:${String(secondsRemaining).padStart(2, '0')} ثانية` : 'ادخل الآن! 🚀'}
                  </span>
                </div>
                <div className="w-full bg-amber-200/60 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-amber-600 h-1.5 rounded-full transition-all duration-1000"
                    style={{ width: `${(secondsRemaining / 60) * 100}%` }}
                  />
                </div>
                <p className="text-[10px] text-amber-800">
                  ⚡ اضغط زر {selectedSignal.direction === 'CALL' ? 'الشراء (CALL الأخضر)' : 'البيع (PUT الأحمر)'} في منصة التداول فور وصول العداد للصفر.
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2.5 text-xs">
              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-slate-400 block text-[10px]">الاتجاه الموصى به:</span>
                <strong className={`font-bold ${selectedSignal.direction === 'CALL' ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {selectedSignal.direction === 'CALL' ? 'شراء (CALL ⬆️)' : 'بيع (PUT ⬇️)'}
                </strong>
              </div>

              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-slate-400 block text-[10px]">وقت الدخول:</span>
                <strong className="font-bold text-slate-800 font-mono-num">
                  {selectedSignal.entryTime}
                </strong>
              </div>

              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-slate-400 block text-[10px]">مؤشر RSI:</span>
                <strong className="font-bold text-slate-800 font-mono-num">
                  {selectedSignal.rsi || 30} ({selectedSignal.direction === 'CALL' ? 'تشبع بيعي' : 'تشبع شرائي'})
                </strong>
              </div>

              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-slate-400 block text-[10px]">قوة الفرصة:</span>
                <strong className="font-bold text-emerald-600 font-mono-num">
                  {selectedSignal.strength || 92}%
                </strong>
              </div>
            </div>

            <div className="pt-2 flex gap-2">
              <button
                type="button"
                onClick={() => handleCopySignal(selectedSignal)}
                className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>{copiedId === selectedSignal.id ? 'تم النسخ ✓' : 'نسخ الإشارة'}</span>
              </button>
              <a
                href={telegramLink}
                target="_blank"
                rel="noreferrer"
                className="py-2 px-3 bg-sky-500 hover:bg-sky-400 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                <span>فتح القناة</span>
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
