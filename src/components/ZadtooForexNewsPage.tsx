import React, { useState, useEffect, useMemo } from 'react';
import {
  Flame,
  Clock,
  Send,
  Plus,
  Edit2,
  Trash2,
  TrendingUp,
  TrendingDown,
  Globe,
  Compass,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Sparkles,
  RefreshCw,
  Search,
  Filter,
  DollarSign,
  Info,
  X,
  ExternalLink,
  ChevronDown
} from 'lucide-react';
import { ForexNewsItem, INITIAL_WEEKLY_FOREX_NEWS } from '../types/forexNews';

interface ZadtooForexNewsPageProps {
  isAdmin: boolean;
  onNavigateSignals?: () => void;
  onNavigateHome?: () => void;
}

export const ZadtooForexNewsPage: React.FC<ZadtooForexNewsPageProps> = ({
  isAdmin,
  onNavigateSignals
}) => {
  const [news, setNews] = useState<ForexNewsItem[]>(INITIAL_WEEKLY_FOREX_NEWS);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [selectedCurrency, setSelectedCurrency] = useState<string>('ALL');
  const [selectedImpact, setSelectedImpact] = useState<string>('ALL');
  const [selectedDay, setSelectedDay] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'upcoming' | 'expired'>('ALL');
  const [deviceNow, setDeviceNow] = useState<number>(Date.now());

  // Broadcasting states
  const [broadcastingId, setBroadcastingId] = useState<string | null>(null);
  const [broadcastFeedback, setBroadcastFeedback] = useState<{ id: string; success: boolean; msg: string } | null>(null);

  // Edit/Add Modal states
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingItem, setEditingItem] = useState<ForexNewsItem | null>(null);
  const [formData, setFormData] = useState<Partial<ForexNewsItem>>({
    title: '',
    currency: 'USD',
    impact: 'high',
    category: 'أسعار الفائدة',
    eventDate: new Date().toISOString().split('T')[0],
    eventDayArabic: 'الأربعاء',
    timeGmt: '12:30',
    timeCairo: '14:30',
    timeMecca: '15:30',
    previous: '',
    forecast: '',
    actual: '',
    expectedImpact: 'usd_bullish',
    expectedMoveSummary: '',
    recommendation: {
      pair: 'EUR/USD',
      action: 'SELL',
      entryStrategy: 'دخول بيع مع كسر الدعم اللحظي بعد صدور الخبر'
    }
  });

  // Ticking live clock every second
  useEffect(() => {
    const timer = setInterval(() => {
      setDeviceNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch news from server
  const fetchNews = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/forex-news');
      if (res.ok) {
        const data = await res.json();
        if (data.ok && Array.isArray(data.news) && data.news.length > 0) {
          setNews(data.news);
        }
      }
    } catch (_e) {
      // Ignore
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchNews();
  }, []);

  // Calculate live clocks for GMT, Cairo, Mecca
  const liveClocks = useMemo(() => {
    const d = new Date(deviceNow);
    const fmt = (tz: string) =>
      new Intl.DateTimeFormat('ar-EG', {
        timeZone: tz,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      }).format(d);

    return {
      gmt: fmt('UTC'),
      cairo: fmt('Africa/Cairo'),
      mecca: fmt('Asia/Riyadh')
    };
  }, [deviceNow]);

  // Handle Telegram recommendation broadcast
  const handleBroadcast = async (item: ForexNewsItem) => {
    if (!isAdmin) return;
    setBroadcastingId(item.id);
    setBroadcastFeedback(null);
    try {
      const res = await fetch(`/api/forex-news/${item.id}/broadcast`, {
        method: 'POST'
      });
      const data = await res.json();
      if (data.ok) {
        setBroadcastFeedback({
          id: item.id,
          success: true,
          msg: 'تم نشر توصية الخبر بنجاح على التليجرام! 📢'
        });
        setNews(prev =>
          prev.map(n =>
            n.id === item.id ? { ...n, isBroadcasted: true, broadcastedAt: new Date().toISOString() } : n
          )
        );
      } else {
        setBroadcastFeedback({
          id: item.id,
          success: false,
          msg: data.error || 'فشل إرسال التوصية، يرجى فحص إعدادات البوت'
        });
      }
    } catch (err: any) {
      setBroadcastFeedback({
        id: item.id,
        success: false,
        msg: err.message || 'خطأ في الاتصال'
      });
    } finally {
      setBroadcastingId(null);
      setTimeout(() => setBroadcastFeedback(null), 6000);
    }
  };

  // Handle Save / Create news item
  const handleSaveModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.currency) return;

    // Calculate approximate targetEpochMs from eventDate and timeGmt
    let calculatedEpochMs = Date.now() + 3600000;
    try {
      if (formData.eventDate && formData.timeGmt) {
        const [hours, minutes] = formData.timeGmt.split(':').map(Number);
        const [y, m, d] = formData.eventDate.split('-').map(Number);
        const gmtDate = new Date(Date.UTC(y, m - 1, d, hours || 0, minutes || 0, 0));
        if (!isNaN(gmtDate.getTime())) {
          calculatedEpochMs = gmtDate.getTime();
        }
      }
    } catch (_e) {}

    const payload = {
      ...formData,
      targetEpochMs: calculatedEpochMs
    };

    try {
      if (editingItem) {
        // Update
        const res = await fetch(`/api/forex-news/${editingItem.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          const data = await res.json();
          setNews(prev => prev.map(n => (n.id === editingItem.id ? data.item : n)));
        }
      } else {
        // Create
        const res = await fetch('/api/forex-news', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          const data = await res.json();
          setNews(prev => [data.item, ...prev]);
        }
      }
      setIsModalOpen(false);
      setEditingItem(null);
    } catch (err) {
      console.error(err);
    }
  };

  // Handle Delete
  const handleDelete = async (id: string) => {
    if (!isAdmin) return;
    if (!window.confirm('هل أنت متأكد من حذف هذا الخبر؟')) return;
    try {
      const res = await fetch(`/api/forex-news/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setNews(prev => prev.filter(n => n.id !== id));
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Handle Seed Weekly
  const handleSeedWeekly = async () => {
    if (!isAdmin) return;
    if (!window.confirm('هل تريد إعادة تعيين الأجندة وتحميل الأخبار الأسبوعية القياسية المحدثة؟')) return;
    try {
      const res = await fetch('/api/forex-news/seed-weekly', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setNews(data.news);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Open modal for editing
  const openEditModal = (item: ForexNewsItem) => {
    setEditingItem(item);
    setFormData({
      title: item.title,
      currency: item.currency,
      impact: item.impact,
      category: item.category,
      eventDate: item.eventDate,
      eventDayArabic: item.eventDayArabic,
      timeGmt: item.timeGmt,
      timeCairo: item.timeCairo,
      timeMecca: item.timeMecca,
      previous: item.previous || '',
      forecast: item.forecast || '',
      actual: item.actual || '',
      expectedImpact: item.expectedImpact,
      expectedMoveSummary: item.expectedMoveSummary,
      recommendation: item.recommendation || {
        pair: 'EUR/USD',
        action: 'SELL',
        entryStrategy: 'دخول بيع بعد كسر الدعم اللحظي'
      }
    });
    setIsModalOpen(true);
  };

  // Open modal for new item
  const openAddModal = () => {
    setEditingItem(null);
    setFormData({
      title: '',
      currency: 'USD',
      impact: 'high',
      category: 'أسعار الفائدة',
      eventDate: new Date().toISOString().split('T')[0],
      eventDayArabic: 'اليوم',
      timeGmt: '12:30',
      timeCairo: '14:30',
      timeMecca: '15:30',
      previous: '',
      forecast: '',
      actual: '',
      expectedImpact: 'usd_bullish',
      expectedMoveSummary: '',
      recommendation: {
        pair: 'EUR/USD',
        action: 'BUY',
        entryStrategy: 'شراء مع افتتاح الشمعة فور تأكيد ضعف الدولار'
      }
    });
    setIsModalOpen(true);
  };

  // Format countdown string
  const getCountdownString = (targetEpochMs: number) => {
    const diff = targetEpochMs - deviceNow;
    if (diff <= 0) {
      return { isExpired: true, text: 'منتهي الصدور (انتهى وقت الخبر)' };
    }
    const totalSecs = Math.floor(diff / 1000);
    const hours = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;

    if (hours > 24) {
      const days = Math.floor(hours / 24);
      const remHours = hours % 24;
      return { isExpired: false, text: `متبقي ${days} يوم و ${remHours} ساعة` };
    }
    if (hours > 0) {
      return { isExpired: false, text: `متبقي ${hours} س و ${mins} د و ${secs} ث` };
    }
    return { isExpired: false, text: `متبقي ${mins} دقيقة و ${secs} ثانية (قريب جداً ⚡)` };
  };

  // Filtered news items
  const filteredNews = useMemo(() => {
    return news.filter(item => {
      const isExpired = deviceNow > item.targetEpochMs;

      // Currency filter
      if (selectedCurrency !== 'ALL' && item.currency !== selectedCurrency) return false;

      // Impact filter
      if (selectedImpact !== 'ALL' && item.impact !== selectedImpact) return false;

      // Day filter
      if (selectedDay !== 'ALL' && item.eventDayArabic !== selectedDay) return false;

      // Status filter
      if (statusFilter === 'upcoming' && isExpired) return false;
      if (statusFilter === 'expired' && !isExpired) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchTitle = item.title.toLowerCase().includes(q);
        const matchCategory = item.category.toLowerCase().includes(q);
        const matchPair = item.recommendation?.pair.toLowerCase().includes(q);
        const matchSummary = item.expectedMoveSummary.toLowerCase().includes(q);
        if (!matchTitle && !matchCategory && !matchPair && !matchSummary) return false;
      }

      return true;
    });
  }, [news, selectedCurrency, selectedImpact, selectedDay, statusFilter, searchQuery, deviceNow]);

  // Statistics
  const stats = useMemo(() => {
    const total = news.length;
    const highCount = news.filter(n => n.impact === 'high').length;
    const usdCount = news.filter(n => n.currency === 'USD').length;
    const upcomingCount = news.filter(n => deviceNow <= n.targetEpochMs).length;
    const expiredCount = news.filter(n => deviceNow > n.targetEpochMs).length;
    return { total, highCount, usdCount, upcomingCount, expiredCount };
  }, [news, deviceNow]);

  return (
    <div className="min-h-screen bg-[#070A0F] text-slate-100 flex flex-col antialiased selection:bg-rose-500 selection:text-white" dir="rtl">
      {/* Top Ambient Glow Banner */}
      <div className="relative overflow-hidden border-b border-rose-900/30 bg-gradient-to-b from-rose-950/30 via-[#0B0F17] to-[#070A0F] py-8 px-4 sm:px-6 lg:px-8">
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-rose-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-7xl mx-auto relative z-10 space-y-6">
          {/* Header Title & Badges */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-bold">
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                <span>مفكرة الأخبار الاقتصادية العاجلة بالفوركس (تحديث أسبوعي)</span>
              </div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-white tracking-tight flex items-center gap-3">
                <span>🔴 رادار الأخبار وتوقعات حركة الدولار والعملات</span>
              </h1>
              <p className="text-sm text-slate-400 max-w-3xl leading-relaxed">
                رصد أسبوعي مستمر لأقوى الأحداث الاقتصادية وقرارات البنوك المركزية، مع توقعات اتجاه الدولار والعملات الكبرى بثلاثة تواقيت معتمدة (مصر، مكة، غرينتش) وتوصيات دخول جاهزة.
              </p>
            </div>

            {/* Quick Action Buttons for Admin or Visitor */}
            <div className="flex items-center gap-2.5 flex-wrap">
              {isAdmin ? (
                <>
                  <button
                    type="button"
                    onClick={openAddModal}
                    className="px-4 py-2.5 bg-rose-600 hover:bg-rose-500 active:scale-95 text-white font-bold rounded-xl text-xs sm:text-sm flex items-center gap-2 transition-all shadow-lg shadow-rose-600/25 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>إضافة خبر عاجل</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleSeedWeekly}
                    title="تعبئة المفكرة بنماذج الأحداث الكبرى لهذا الأسبوع"
                    className="px-3 py-2.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 border border-slate-700 font-semibold rounded-xl text-xs flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>تعبئة الأجندة الأسبوعية</span>
                  </button>
                </>
              ) : (
                <div className="px-3.5 py-2 rounded-xl bg-slate-900/80 border border-slate-800 text-xs text-slate-400 flex items-center gap-2">
                  <Globe className="w-4 h-4 text-emerald-400" />
                  <span>تحديث دوري ومجاني لكافة زوار ومتابعي ZAD FX</span>
                </div>
              )}
            </div>
          </div>

          {/* 3 Live Clocks Bar: Egypt, Mecca, Greenwich */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
            {/* Cairo Clock */}
            <div className="p-3.5 rounded-xl bg-slate-900/80 border border-amber-500/20 flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">🇪🇬</span>
                <div>
                  <div className="text-[11px] font-semibold text-slate-400">توقيت مصر (القاهرة)</div>
                  <div className="text-xs text-amber-400 font-medium">GMT +2</div>
                </div>
              </div>
              <div className="text-lg font-mono font-bold text-white tracking-wider">
                {liveClocks.cairo}
              </div>
            </div>

            {/* Mecca Clock */}
            <div className="p-3.5 rounded-xl bg-slate-900/80 border border-emerald-500/20 flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">🕋</span>
                <div>
                  <div className="text-[11px] font-semibold text-slate-400">توقيت مكة المكرمة</div>
                  <div className="text-xs text-emerald-400 font-medium">GMT +3</div>
                </div>
              </div>
              <div className="text-lg font-mono font-bold text-white tracking-wider">
                {liveClocks.mecca}
              </div>
            </div>

            {/* GMT Clock */}
            <div className="p-3.5 rounded-xl bg-slate-900/80 border border-cyan-500/20 flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">🌍</span>
                <div>
                  <div className="text-[11px] font-semibold text-slate-400">توقيت غرينتش العالمي</div>
                  <div className="text-xs text-cyan-400 font-medium">GMT / UTC</div>
                </div>
              </div>
              <div className="text-lg font-mono font-bold text-white tracking-wider">
                {liveClocks.gmt}
              </div>
            </div>
          </div>

          {/* Key Metrics Ribbon */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1 text-xs">
            <div className="p-3 rounded-xl bg-[#0B0F17]/90 border border-slate-800 flex items-center justify-between">
              <span className="text-slate-400">أخبار هذا الأسبوع:</span>
              <span className="font-bold text-white font-mono text-sm">{stats.total}</span>
            </div>
            <div className="p-3 rounded-xl bg-[#0B0F17]/90 border border-rose-500/20 flex items-center justify-between">
              <span className="text-rose-300 flex items-center gap-1">
                <Flame className="w-3.5 h-3.5 text-rose-500" />
                <span>عالية الأهمية 🔴:</span>
              </span>
              <span className="font-bold text-rose-400 font-mono text-sm">{stats.highCount}</span>
            </div>
            <div className="p-3 rounded-xl bg-[#0B0F17]/90 border border-slate-800 flex items-center justify-between">
              <span className="text-slate-400">أخبار الدولار (USD):</span>
              <span className="font-bold text-emerald-400 font-mono text-sm">{stats.usdCount}</span>
            </div>
            <div className="p-3 rounded-xl bg-[#0B0F17]/90 border border-slate-800 flex items-center justify-between">
              <span className="text-slate-400">القادمة / المنتهية:</span>
              <span className="font-bold text-slate-200 font-mono text-sm">
                <span className="text-cyan-400">{stats.upcomingCount}</span> / <span className="text-slate-500">{stats.expiredCount}</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-6">
        {/* Broadcast Toast Feedback if triggered */}
        {broadcastFeedback && (
          <div
            className={`p-4 rounded-xl border flex items-center justify-between text-sm animate-fade-in ${
              broadcastFeedback.success
                ? 'bg-emerald-950/90 border-emerald-500/50 text-emerald-200'
                : 'bg-rose-950/90 border-rose-500/50 text-rose-200'
            }`}
          >
            <div className="flex items-center gap-2">
              {broadcastFeedback.success ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
              )}
              <span>{broadcastFeedback.msg}</span>
            </div>
            <button
              type="button"
              onClick={() => setBroadcastFeedback(null)}
              className="text-xs text-slate-400 hover:text-white cursor-pointer px-2 py-1"
            >
              إغلاق ✕
            </button>
          </div>
        )}

        {/* Filter Toolbar */}
        <div className="p-4 rounded-2xl bg-[#0B0F17] border border-slate-800 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="ابحث عن اسم الخبر، العملة، الزوج الموصى به..."
                className="w-full pr-9 pl-4 py-2 bg-slate-900/90 border border-slate-700/80 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Currency Filter Chips */}
            <div className="flex items-center gap-1.5 flex-wrap overflow-x-auto pb-1 text-xs">
              <span className="text-slate-400 text-[11px] font-semibold flex items-center gap-1">
                <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                <span>العملة:</span>
              </span>
              {['ALL', 'USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'XAU'].map(curr => (
                <button
                  key={curr}
                  type="button"
                  onClick={() => setSelectedCurrency(curr)}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                    selectedCurrency === curr
                      ? 'bg-rose-600 text-white shadow-sm'
                      : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
                  }`}
                >
                  {curr === 'ALL' ? 'كافة العملات' : curr === 'XAU' ? 'الذهب 🥇' : curr}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800/80 text-xs">
            {/* Impact Filter */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-slate-400 text-[11px]">الأهمية:</span>
              <button
                type="button"
                onClick={() => setSelectedImpact('ALL')}
                className={`px-2 py-0.5 rounded-md cursor-pointer ${
                  selectedImpact === 'ALL' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                الكل
              </button>
              <button
                type="button"
                onClick={() => setSelectedImpact('high')}
                className={`px-2 py-0.5 rounded-md cursor-pointer flex items-center gap-1 ${
                  selectedImpact === 'high' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 font-bold' : 'text-slate-400 hover:text-rose-400'
                }`}
              >
                <Flame className="w-3 h-3 text-rose-500" />
                <span>عالي الأهمية فقط 🔴</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedImpact('medium')}
                className={`px-2 py-0.5 rounded-md cursor-pointer ${
                  selectedImpact === 'medium' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold' : 'text-slate-400 hover:text-amber-400'
                }`}
              >
                متوسط 🟡
              </button>
            </div>

            {/* Day Filter */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-slate-400 text-[11px]">اليوم:</span>
              {['ALL', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'].map(day => (
                <button
                  key={day}
                  type="button"
                  onClick={() => setSelectedDay(day)}
                  className={`px-2 py-0.5 rounded-md cursor-pointer ${
                    selectedDay === day ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {day === 'ALL' ? 'كامل الأسبوع' : day}
                </button>
              ))}
            </div>

            {/* Upcoming vs Expired Filter */}
            <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800">
              <button
                type="button"
                onClick={() => setStatusFilter('ALL')}
                className={`px-2.5 py-0.5 rounded-md cursor-pointer ${statusFilter === 'ALL' ? 'bg-slate-800 text-white font-bold' : 'text-slate-400'}`}
              >
                الكل
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('upcoming')}
                className={`px-2.5 py-0.5 rounded-md cursor-pointer ${statusFilter === 'upcoming' ? 'bg-emerald-600 text-white font-bold' : 'text-slate-400'}`}
              >
                القادمة فقط
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('expired')}
                className={`px-2.5 py-0.5 rounded-md cursor-pointer ${statusFilter === 'expired' ? 'bg-slate-700 text-slate-300 font-bold' : 'text-slate-500'}`}
              >
                المنتهية (القاتمة)
              </button>
            </div>
          </div>
        </div>

        {/* News Cards Grid */}
        <div className="space-y-4">
          {filteredNews.length === 0 ? (
            <div className="p-12 text-center rounded-2xl bg-[#0B0F17] border border-slate-800 space-y-3">
              <div className="w-12 h-12 mx-auto rounded-full bg-slate-900 flex items-center justify-center text-slate-500">
                <Calendar className="w-6 h-6" />
              </div>
              <div className="text-base font-bold text-slate-300">لا توجد أخبار مطابقة للفلاتر المحددة</div>
              <p className="text-xs text-slate-500">جرب تغيير فلتر العملة أو اليوم أو تصفية الأهمية لعرض بقية أحداث الأسبوع.</p>
              {isAdmin && (
                <button
                  type="button"
                  onClick={handleSeedWeekly}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors"
                >
                  استعادة الأخبار القياسية لهذا الأسبوع
                </button>
              )}
            </div>
          ) : (
            filteredNews.map(item => {
              const countdown = getCountdownString(item.targetEpochMs);
              const isExpired = countdown.isExpired;
              const isHighImpact = item.impact === 'high';

              // Visual styling: "بمجرد أن ينتهي يصبح لون الخبر قاتم"
              const cardClass = isExpired
                ? 'bg-slate-950/60 border-slate-800/50 opacity-60 grayscale-[35%] hover:opacity-85 transition-opacity'
                : isHighImpact
                ? 'bg-gradient-to-br from-[#120B10] via-[#0B0F17] to-[#070A0F] border-rose-500/40 shadow-lg shadow-rose-950/20 hover:border-rose-500/70'
                : 'bg-[#0B0F17] border-slate-800 hover:border-slate-700';

              return (
                <div
                  key={item.id}
                  className={`rounded-2xl border p-5 sm:p-6 transition-all space-y-4 relative overflow-hidden ${cardClass}`}
                >
                  {/* Subtle Top Status Accent Line */}
                  <div
                    className={`absolute top-0 left-0 right-0 h-1 ${
                      isExpired
                        ? 'bg-slate-700/40'
                        : isHighImpact
                        ? 'bg-gradient-to-r from-rose-600 via-amber-500 to-rose-600 animate-pulse'
                        : 'bg-emerald-500/60'
                    }`}
                  />

                  {/* Header Row: Impact Badge, Currency, Day, Title, and Expired Tag */}
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-2 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Currency Badge */}
                        <span className="px-2.5 py-0.5 rounded-lg bg-slate-800 border border-slate-700 text-white font-mono font-bold text-xs flex items-center gap-1">
                          <span>{item.currency}</span>
                          <span className="text-[10px]">
                            {item.currency === 'USD' ? '🇺🇸' : item.currency === 'EUR' ? '🇪🇺' : item.currency === 'GBP' ? '🇬🇧' : item.currency === 'JPY' ? '🇯🇵' : item.currency === 'XAU' ? '🥇' : '🌐'}
                          </span>
                        </span>

                        {/* Impact Badge */}
                        {isHighImpact ? (
                          <span className="px-2.5 py-0.5 rounded-lg bg-rose-500/20 border border-rose-500/40 text-rose-300 font-bold text-xs flex items-center gap-1">
                            <Flame className="w-3.5 h-3.5 text-rose-500" />
                            <span>عالي الأهمية (High Impact)</span>
                          </span>
                        ) : item.impact === 'medium' ? (
                          <span className="px-2 py-0.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 font-bold text-xs">
                            متوسط الأهمية 🟡
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-bold text-xs">
                            منخفض الأهمية 🟢
                          </span>
                        )}

                        {/* Category */}
                        <span className="px-2 py-0.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 text-[11px]">
                          {item.category}
                        </span>

                        {/* Day and Date */}
                        <span className="px-2 py-0.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 text-[11px] font-semibold flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          <span>{item.eventDayArabic} ({item.eventDate})</span>
                        </span>

                        {/* Expired vs Live Countdown Tag */}
                        {isExpired ? (
                          <span className="px-2.5 py-0.5 rounded-lg bg-slate-800 text-slate-400 text-xs font-semibold border border-slate-700">
                            ⚪ منتهي الصدور (Expired)
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-lg bg-cyan-950/80 border border-cyan-500/40 text-cyan-300 text-xs font-mono font-bold flex items-center gap-1 animate-pulse">
                            <Clock className="w-3 h-3 text-cyan-400" />
                            <span>{countdown.text}</span>
                          </span>
                        )}
                      </div>

                      {/* Main Title */}
                      <h3 className={`text-lg sm:text-xl font-black ${isExpired ? 'text-slate-300' : 'text-white'} leading-tight`}>
                        {item.title}
                      </h3>
                    </div>

                    {/* Admin Actions Toolbar (ONLY VISIBLE FOR ADMIN, 100% HIDDEN FOR VISITORS) */}
                    {isAdmin && (
                      <div className="flex items-center gap-1.5 shrink-0 bg-slate-900/90 p-1 rounded-xl border border-slate-800 self-start">
                        {/* Publish to Telegram Recommendation Button */}
                        <button
                          type="button"
                          onClick={() => handleBroadcast(item)}
                          disabled={broadcastingId === item.id}
                          className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 active:scale-95 text-white font-bold rounded-lg text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm shadow-rose-600/30"
                          title="نشر هذا الخبر كتوصية تداول فورية إلى قنوات التليجرام"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>
                            {broadcastingId === item.id ? 'جاري النشر...' : item.isBroadcasted ? 'إعادة نشر للتليجرام 📢' : 'نشر كتوصية 🚀'}
                          </span>
                        </button>

                        {/* Edit Button */}
                        <button
                          type="button"
                          onClick={() => openEditModal(item)}
                          className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                          title="تعديل تفاصيل وتوقيت الخبر"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>

                        {/* Delete Button */}
                        <button
                          type="button"
                          onClick={() => handleDelete(item.id)}
                          className="p-1.5 text-rose-400 hover:text-rose-300 hover:bg-rose-950/50 rounded-lg transition-colors cursor-pointer"
                          title="حذف الخبر"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* 3 Time Zones Box: Egypt, Mecca, Greenwich */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 text-xs">
                    <div className="flex items-center justify-between px-2 py-1 bg-slate-900/60 rounded-lg">
                      <span className="text-slate-400 flex items-center gap-1.5">
                        <span>🇪🇬</span>
                        <span>مصر (القاهرة):</span>
                      </span>
                      <span className="font-mono font-bold text-amber-300 text-sm">
                        {item.timeCairo}
                      </span>
                    </div>

                    <div className="flex items-center justify-between px-2 py-1 bg-slate-900/60 rounded-lg">
                      <span className="text-slate-400 flex items-center gap-1.5">
                        <span>🕋</span>
                        <span>مكة المكرمة:</span>
                      </span>
                      <span className="font-mono font-bold text-emerald-300 text-sm">
                        {item.timeMecca}
                      </span>
                    </div>

                    <div className="flex items-center justify-between px-2 py-1 bg-slate-900/60 rounded-lg">
                      <span className="text-slate-400 flex items-center gap-1.5">
                        <span>🌍</span>
                        <span>غرينتش (GMT):</span>
                      </span>
                      <span className="font-mono font-bold text-cyan-300 text-sm">
                        {item.timeGmt}
                      </span>
                    </div>
                  </div>

                  {/* Economic Data Figures & USD / Currency Move Forecast */}
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3 text-xs">
                    {/* Figures: Previous, Forecast, Actual */}
                    <div className="md:col-span-5 p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-2">
                      <div className="text-[11px] font-semibold text-slate-400 flex items-center gap-1">
                        <TrendingUp className="w-3.5 h-3.5 text-cyan-400" />
                        <span>البيانات الرقمية للخبر:</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center pt-1">
                        <div className="p-1.5 rounded-lg bg-slate-950/60 border border-slate-800">
                          <div className="text-[10px] text-slate-500">السابق</div>
                          <div className="font-mono font-bold text-slate-300 mt-0.5">{item.previous || '-'}</div>
                        </div>
                        <div className="p-1.5 rounded-lg bg-slate-950/60 border border-cyan-500/30">
                          <div className="text-[10px] text-cyan-400">التوقع</div>
                          <div className="font-mono font-bold text-cyan-300 mt-0.5">{item.forecast || '-'}</div>
                        </div>
                        <div className="p-1.5 rounded-lg bg-slate-950/60 border border-emerald-500/30">
                          <div className="text-[10px] text-emerald-400">الفعلي</div>
                          <div className="font-mono font-bold text-emerald-300 mt-0.5">{item.actual || 'قيد الانتظار'}</div>
                        </div>
                      </div>
                    </div>

                    {/* Movement Forecast: USD Rise or Fall & Market Impact */}
                    <div className="md:col-span-7 p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-2 flex flex-col justify-between">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold text-slate-400">توقع اتجاه السوق والدولار:</span>
                        {item.expectedImpact === 'usd_bullish' ? (
                          <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-bold text-[11px] flex items-center gap-1">
                            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                            <span>صعود متوقع للدولار (USD Bullish ↗️)</span>
                          </span>
                        ) : item.expectedImpact === 'usd_bearish' ? (
                          <span className="px-2.5 py-0.5 rounded-full bg-rose-500/20 border border-rose-500/40 text-rose-300 font-bold text-[11px] flex items-center gap-1">
                            <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
                            <span>هبوط متوقع للدولار (USD Bearish ↘️)</span>
                          </span>
                        ) : item.expectedImpact === 'currency_bullish' ? (
                          <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-bold text-[11px] flex items-center gap-1">
                            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                            <span>إيجابي وقوة للعملة ({item.currency} ↗️)</span>
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full bg-rose-500/20 border border-rose-500/40 text-rose-300 font-bold text-[11px] flex items-center gap-1">
                            <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
                            <span>سلبي وضغط هبوطي ({item.currency} ↘️)</span>
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-300 leading-relaxed">
                        {item.expectedMoveSummary || 'تحليل تأثير الخبر على السيولة العامة وحركة أسواق الفوركس.'}
                      </p>
                    </div>
                  </div>

                  {/* Recommended Trade Recommendation Box */}
                  {item.recommendation && (
                    <div className="p-3.5 rounded-xl bg-gradient-to-r from-emerald-950/20 via-slate-900/60 to-slate-950/80 border border-emerald-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-bold text-emerald-400 flex items-center gap-1">
                            <Compass className="w-3.5 h-3.5 text-emerald-400" />
                            <span>التوصية الفنية الموصى بها للخبر:</span>
                          </span>
                          <span className="px-2 py-0.5 rounded font-mono font-bold bg-slate-900 text-white border border-slate-700">
                            {item.recommendation.pair}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded font-bold text-xs ${
                              item.recommendation.action === 'BUY'
                                ? 'bg-emerald-500 text-slate-950'
                                : 'bg-rose-500 text-white'
                            }`}
                          >
                            {item.recommendation.action === 'BUY' ? 'شراء (BUY) 🟢' : 'بيع (SELL) 🔴'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400">
                          {item.recommendation.entryStrategy}
                        </p>
                      </div>

                      {/* Broadcasted Badge if already sent */}
                      {item.isBroadcasted && (
                        <div className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-[10px] text-emerald-300 font-semibold shrink-0 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          <span>تم النشر للمشتركين والتليجرام ✓</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Admin Add/Edit News Item Modal (Only accessible by Admin) */}
      {isAdmin && isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#0B0F17] border border-slate-700 w-full max-w-2xl rounded-2xl shadow-2xl p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Flame className="w-5 h-5 text-rose-500" />
                <span>{editingItem ? 'تعديل تفاصيل الخبر العاجل' : 'إضافة خبر اقتصادي عاجل جديد'}</span>
              </h2>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveModal} className="space-y-4 text-xs">
              {/* Title */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  عنوان الخبر / الحدث الاقتصادي:
                </label>
                <input
                  type="text"
                  required
                  value={formData.title || ''}
                  onChange={e => setFormData(p => ({ ...p, title: e.target.value }))}
                  placeholder="مثال: قرار أسعار الفائدة الصادر عن الفيدرالي الأمريكي (FOMC)"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-rose-500"
                />
              </div>

              {/* Currency, Impact, Category */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">العملة الأساسية:</label>
                  <select
                    value={formData.currency || 'USD'}
                    onChange={e => setFormData(p => ({ ...p, currency: e.target.value as any }))}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-rose-500 cursor-pointer"
                  >
                    <option value="USD">USD - الدولار الأمريكي 🇺🇸</option>
                    <option value="EUR">EUR - اليورو الأوروبي 🇪🇺</option>
                    <option value="GBP">GBP - الجنيه الإسترليني 🇬🇧</option>
                    <option value="JPY">JPY - الين الياباني 🇯🇵</option>
                    <option value="CAD">CAD - الدولار الكندي 🇨🇦</option>
                    <option value="AUD">AUD - الدولار الأسترالي 🇦🇺</option>
                    <option value="XAU">XAU - الذهب 🥇</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">درجة الأهمية:</label>
                  <select
                    value={formData.impact || 'high'}
                    onChange={e => setFormData(p => ({ ...p, impact: e.target.value as any }))}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-rose-500 cursor-pointer"
                  >
                    <option value="high">🔴 عالي الأهمية (High Impact) 🔥</option>
                    <option value="medium">🟡 متوسط الأهمية</option>
                    <option value="low">🟢 منخفض الأهمية</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">تصنيف الخبر:</label>
                  <input
                    type="text"
                    value={formData.category || ''}
                    onChange={e => setFormData(p => ({ ...p, category: e.target.value }))}
                    placeholder="أسعار الفائدة، تضخم، وظائف، ناتج محلي"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-rose-500"
                  />
                </div>
              </div>

              {/* Date & Day */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">التاريخ (YYYY-MM-DD):</label>
                  <input
                    type="date"
                    required
                    value={formData.eventDate || ''}
                    onChange={e => setFormData(p => ({ ...p, eventDate: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-rose-500 cursor-pointer font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">اليوم بالعربي:</label>
                  <select
                    value={formData.eventDayArabic || 'الأربعاء'}
                    onChange={e => setFormData(p => ({ ...p, eventDayArabic: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-rose-500 cursor-pointer"
                  >
                    <option value="الإثنين">الإثنين</option>
                    <option value="الثلاثاء">الثلاثاء</option>
                    <option value="الأربعاء">الأربعاء</option>
                    <option value="الخميس">الخميس</option>
                    <option value="الجمعة">الجمعة</option>
                    <option value="السبت">السبت</option>
                    <option value="الأحد">الأحد</option>
                  </select>
                </div>
              </div>

              {/* 3 Time Zones: Cairo, Mecca, GMT */}
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                <div className="text-[11px] font-semibold text-slate-400">التوقيت الدقيق بالمناطق الثلاث:</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <label className="block text-slate-400 text-[10px] mb-1">🇪🇬 توقيت مصر (القاهرة):</label>
                    <input
                      type="text"
                      value={formData.timeCairo || ''}
                      onChange={e => setFormData(p => ({ ...p, timeCairo: e.target.value }))}
                      placeholder="14:30"
                      className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded text-white font-mono text-center"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 text-[10px] mb-1">🕋 توقيت مكة المكرمة:</label>
                    <input
                      type="text"
                      value={formData.timeMecca || ''}
                      onChange={e => setFormData(p => ({ ...p, timeMecca: e.target.value }))}
                      placeholder="15:30"
                      className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded text-white font-mono text-center"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 text-[10px] mb-1">🌍 توقيت غرينتش (GMT):</label>
                    <input
                      type="text"
                      value={formData.timeGmt || ''}
                      onChange={e => setFormData(p => ({ ...p, timeGmt: e.target.value }))}
                      placeholder="12:30"
                      className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded text-white font-mono text-center"
                    />
                  </div>
                </div>
              </div>

              {/* Numbers: Previous, Forecast, Actual */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">القراءة السابقة:</label>
                  <input
                    type="text"
                    value={formData.previous || ''}
                    onChange={e => setFormData(p => ({ ...p, previous: e.target.value }))}
                    placeholder="مثال: 5.00%"
                    className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded text-white font-mono text-center"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">التوقع التقديري:</label>
                  <input
                    type="text"
                    value={formData.forecast || ''}
                    onChange={e => setFormData(p => ({ ...p, forecast: e.target.value }))}
                    placeholder="مثال: 4.75%"
                    className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded text-white font-mono text-center"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">النتيجة الفعلية:</label>
                  <input
                    type="text"
                    value={formData.actual || ''}
                    onChange={e => setFormData(p => ({ ...p, actual: e.target.value }))}
                    placeholder="فارغ حتى الصدور"
                    className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded text-white font-mono text-center"
                  />
                </div>
              </div>

              {/* Movement Impact & Summary */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1">توقع اتجاه الدولار / العملة:</label>
                <select
                  value={formData.expectedImpact || 'usd_bullish'}
                  onChange={e => setFormData(p => ({ ...p, expectedImpact: e.target.value as any }))}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-rose-500 cursor-pointer"
                >
                  <option value="usd_bullish">🟢 صعود قوي متوقع للدولار (USD Bullish ↗️)</option>
                  <option value="usd_bearish">🔴 هبوط قوي متوقع للدولار (USD Bearish ↘️)</option>
                  <option value="currency_bullish">🟢 إيجابي وصعود للعملة الأساسية ↗️</option>
                  <option value="currency_bearish">🔴 سلبي وهبوط للعملة الأساسية ↘️</option>
                  <option value="neutral">⚖️ تذبذب ومحايد</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">شرح وتفاصيل تأثير الخبر على السوق:</label>
                <textarea
                  rows={2}
                  value={formData.expectedMoveSummary || ''}
                  onChange={e => setFormData(p => ({ ...p, expectedMoveSummary: e.target.value }))}
                  placeholder="مثال: خفض الفائدة المتوقع سيضعف الدولار ويدعم صعود الذهب واليورو، ننصح بمراقبة اختراق المقاومة الفورية."
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-rose-500"
                />
              </div>

              {/* Recommendation Setup */}
              <div className="p-3 bg-slate-950 rounded-xl border border-emerald-500/30 space-y-2">
                <div className="text-[11px] font-bold text-emerald-400">التوصية الفنية المرفقة:</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 mb-1">الزوج الموصى به:</label>
                    <input
                      type="text"
                      value={formData.recommendation?.pair || 'EUR/USD'}
                      onChange={e =>
                        setFormData(p => ({
                          ...p,
                          recommendation: {
                            pair: e.target.value,
                            action: p.recommendation?.action || 'BUY',
                            entryStrategy: p.recommendation?.entryStrategy || ''
                          }
                        }))
                      }
                      placeholder="EUR/USD أو GOLD (XAU/USD)"
                      className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded text-white font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1">القرار (شراء / بيع):</label>
                    <select
                      value={formData.recommendation?.action || 'BUY'}
                      onChange={e =>
                        setFormData(p => ({
                          ...p,
                          recommendation: {
                            pair: p.recommendation?.pair || 'EUR/USD',
                            action: e.target.value as 'BUY' | 'SELL',
                            entryStrategy: p.recommendation?.entryStrategy || ''
                          }
                        }))
                      }
                      className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded text-white cursor-pointer"
                    >
                      <option value="BUY">🟢 شراء (BUY)</option>
                      <option value="SELL">🔴 بيع (SELL)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">استراتيجية الدخول:</label>
                  <input
                    type="text"
                    value={formData.recommendation?.entryStrategy || ''}
                    onChange={e =>
                      setFormData(p => ({
                        ...p,
                        recommendation: {
                          pair: p.recommendation?.pair || 'EUR/USD',
                          action: p.recommendation?.action || 'BUY',
                          entryStrategy: e.target.value
                        }
                      }))
                    }
                    placeholder="مثال: شراء فور تأكيد الشمعة الأولى لكسر المقاومة بعد صدور الخبر"
                    className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded text-white"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl cursor-pointer shadow-md shadow-rose-600/30"
                >
                  {editingItem ? 'حفظ التعديلات' : 'إضافة ونشر الخبر'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
