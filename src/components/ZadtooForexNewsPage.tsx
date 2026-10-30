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
import {
  DEFAULT_FREE_BOT_TOKEN,
  DEFAULT_FREE_CHAT_ID,
  DEFAULT_VIP_BOT_TOKEN,
  DEFAULT_VIP_CHAT_ID
} from './ZadtooAdminLiveBroadcast';
import { db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

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

  // Broadcast Confirmation Modal State (تأكيد الإرسال)
  const [confirmBroadcastItem, setConfirmBroadcastItem] = useState<ForexNewsItem | null>(null);
  const [broadcastTargetFree, setBroadcastTargetFree] = useState<boolean>(true);
  const [broadcastTargetVip, setBroadcastTargetVip] = useState<boolean>(true);

  // Edit/Add Modal states
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingItem, setEditingItem] = useState<ForexNewsItem | null>(null);
  const [isSavingNews, setIsSavingNews] = useState<boolean>(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [autoPublishTelegram, setAutoPublishTelegram] = useState<boolean>(true);
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

  // Fetch news from Firestore, server, or local cache
  const fetchNews = async () => {
    setIsLoading(true);
    let loaded = false;

    // 1. Check persistent Firestore first for real-time admin changes
    try {
      const docRef = doc(db, 'system_state', 'zad_main_state_v1');
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const d = snap.data();
        if (d?.payload) {
          const parsed = JSON.parse(d.payload);
          if (Array.isArray(parsed.forexNews) && parsed.forexNews.length > 0) {
            setNews(parsed.forexNews);
            loaded = true;
          }
        }
      }
    } catch (_firestoreErr) {
      // fallback
    }

    // 2. Try server API if not loaded
    if (!loaded) {
      try {
        const res = await fetch('/api/forex-news');
        const contentType = res.headers.get('content-type') || '';
        if (res.ok && contentType.includes('application/json')) {
          const data = await res.json();
          if (data.ok && Array.isArray(data.news) && data.news.length > 0) {
            setNews(data.news);
            loaded = true;
          }
        }
      } catch (_serverErr) {
        // fallback
      }
    }

    // 3. Check localStorage cache
    if (!loaded) {
      try {
        const cached = localStorage.getItem('cached_forex_news');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setNews(parsed);
          }
        }
      } catch (_cacheErr) {}
    }

    setIsLoading(false);
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

async function sendTelegramDirect(token: string, chatId: string, text: string) {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 8500);
  try {
    const res = await fetch(`https://api.telegram.org/bot${token.trim()}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId.trim(), text }),
      signal: ctrl.signal
    });
    return (await res.json()) as { ok: boolean; result?: any; description?: string };
  } catch (err: any) {
    return { ok: false, description: err?.message || 'تعذر الاتصال بسيرفر التليجرام' };
  } finally {
    clearTimeout(tid);
  }
}

function buildNewsTelegramMessage(item: ForexNewsItem): string {
  const impactBadge =
    item.impact === 'high'
      ? '🔴 عالي الأهمية (High Impact) 🔥'
      : item.impact === 'medium'
      ? '🟡 متوسط الأهمية'
      : '🟢 منخفض الأهمية';
  const impactEmoji = item.expectedImpact.includes('bullish')
    ? '🟢 صعود متوقع ↗️'
    : item.expectedImpact.includes('bearish')
    ? '🔴 هبوط متوقع ↘️'
    : '⚖️ محايد / تذبذب';
  const recActionText = item.recommendation?.action === 'BUY' ? '🟢 شراء (BUY) 📈' : '🔴 بيع (SELL) 📉';

  const lines = [
    `🚨 خبر عاجل وتوصية فوركس حصرية | ZAD FX`,
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
    `💡 إدارة رأس المال سر النجاح — تداول بذكاء`
  );

  return lines.filter(Boolean).join('\n');
}

  // Request Broadcast -> opens the confirmation modal with channel targets
  const handleRequestBroadcast = (item: ForexNewsItem) => {
    if (!isAdmin) return;
    setConfirmBroadcastItem(item);
    setBroadcastTargetFree(true);
    setBroadcastTargetVip(true);
  };

  const handleBroadcast = (item: ForexNewsItem) => {
    handleRequestBroadcast(item);
  };

  // Execute Telegram recommendation broadcast after confirmation
  const executeBroadcast = async (
    item: ForexNewsItem,
    sendFree: boolean = true,
    sendVip: boolean = true
  ) => {
    if (!isAdmin) return;
    if (!sendFree && !sendVip) {
      setBroadcastFeedback({
        id: item.id,
        success: false,
        msg: 'يرجى اختيار قناة واحدة على الأقل لنشر التوصية.'
      });
      return;
    }

    setBroadcastingId(item.id);
    setBroadcastFeedback(null);
    setConfirmBroadcastItem(null);

    const messageText = buildNewsTelegramMessage(item);
    const freeToken = (localStorage.getItem('tg_bot_token') || DEFAULT_FREE_BOT_TOKEN).trim();
    const freeChat = (localStorage.getItem('tg_chat_id') || DEFAULT_FREE_CHAT_ID).trim();
    const vipToken = (localStorage.getItem('tg_vip_bot_token') || DEFAULT_VIP_BOT_TOKEN).trim();
    const vipChat = (localStorage.getItem('tg_vip_chat_id') || DEFAULT_VIP_CHAT_ID).trim();

    const destParts: string[] = [];
    const tasks: Promise<void>[] = [];
    let freeErr: string | undefined;
    let vipErr: string | undefined;

    // Direct Client Dispatch to Telegram (Guaranteed on fx.zadtoo.com & incognito)
    if (sendFree && freeToken && freeChat) {
      tasks.push(
        sendTelegramDirect(freeToken, freeChat, messageText)
          .then(r => {
            if (r.ok) destParts.push('القناة العامة (@ZadNBFX)');
            else freeErr = r.description;
          })
          .catch(e => {
            freeErr = e?.message;
          })
      );
    }

    if (sendVip && vipToken && vipChat) {
      tasks.push(
        sendTelegramDirect(vipToken, vipChat, messageText)
          .then(r => {
            if (r.ok) destParts.push('قناة VIP (Abusalim FX VIP)');
            else vipErr = r.description;
          })
          .catch(e => {
            vipErr = e?.message;
          })
      );
    }

    // Also trigger server route in background if available
    try {
      fetch(`/api/forex-news/${encodeURIComponent(item.id)}/broadcast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
      }).catch(() => {});
    } catch (_e) {}

    if (tasks.length > 0) {
      await Promise.allSettled(tasks);
    }

    setBroadcastingId(null);

    if (destParts.length > 0) {
      const updatedItem: ForexNewsItem = {
        ...item,
        isBroadcasted: true,
        broadcastedAt: new Date().toISOString()
      };

      setNews(prev => {
        const next = prev.map(n => (n.id === item.id ? updatedItem : n));
        try {
          localStorage.setItem('cached_forex_news', JSON.stringify(next));
        } catch (_e) {}
        return next;
      });

      // Persist broadcast status to Firestore
      try {
        const docRef = doc(db, 'system_state', 'zad_main_state_v1');
        const snap = await getDoc(docRef);
        const d = snap.exists() ? snap.data() : null;
        const parsed = d?.payload ? JSON.parse(d.payload) : {};
        const currentList = Array.isArray(parsed.forexNews) && parsed.forexNews.length > 0
          ? parsed.forexNews
          : [...INITIAL_WEEKLY_FOREX_NEWS];
        const exists = currentList.some((n: any) => n.id === item.id);
        parsed.forexNews = exists
          ? currentList.map((n: any) => (n.id === item.id ? updatedItem : n))
          : [updatedItem, ...currentList];
        await setDoc(docRef, {
          updatedAt: new Date().toISOString(),
          payload: JSON.stringify(parsed)
        }, { merge: true });
      } catch (_e) {}

      setBroadcastFeedback({
        id: item.id,
        success: true,
        msg: `✅ تم تأكيد ونشر توصية الخبر بنجاح إلى: ${destParts.join(' و ')} 📢`
      });
    } else {
      setBroadcastFeedback({
        id: item.id,
        success: false,
        msg: freeErr || vipErr || 'تعذر إرسال التوصية عبر التليجرام، تأكد من الاتصال وتوكن البوت.'
      });
    }

    setTimeout(() => setBroadcastFeedback(null), 8000);
  };

  // Handle Save / Create news item (تعديل أو إضافة خبر)
  const handleSaveModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title?.trim() || !formData.currency?.trim()) {
      setModalError('يرجى ملء عنوان الخبر والعملة المتأثرة كحقول إجبارية.');
      return;
    }

    setIsSavingNews(true);
    setModalError(null);

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
      title: formData.title.trim(),
      currency: formData.currency.trim().toUpperCase(),
      targetEpochMs: calculatedEpochMs
    };

    try {
      let savedItem: ForexNewsItem | null = null;
      const isEditing = Boolean(editingItem);

      // Try server endpoint in background
      try {
        if (editingItem) {
          fetch(`/api/forex-news/${encodeURIComponent(editingItem.id)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify(payload)
          }).catch(() => {});
        } else {
          fetch('/api/forex-news', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify(payload)
          }).catch(() => {});
        }
      } catch (_serverErr) {}

      // Create or update item in client state
      if (editingItem) {
        savedItem = {
          ...editingItem,
          ...(payload as any),
          id: editingItem.id,
          updatedAt: new Date().toISOString()
        };
      } else {
        savedItem = {
          ...(payload as any),
          id: `news-${Date.now()}`,
          isBroadcasted: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
      }

      // Update React state & localStorage
      setNews(prev => {
        const exists = prev.some(n => n.id === savedItem!.id);
        const nextList = exists
          ? prev.map(n => (n.id === savedItem!.id ? savedItem! : n))
          : [savedItem!, ...prev];
        try {
          localStorage.setItem('cached_forex_news', JSON.stringify(nextList));
        } catch (_e) {}
        return nextList;
      });

      // Sync to persistent Firestore (doc: zad_main_state_v1)
      try {
        const docRef = doc(db, 'system_state', 'zad_main_state_v1');
        const snap = await getDoc(docRef);
        const d = snap.exists() ? snap.data() : null;
        const parsed = d?.payload ? JSON.parse(d.payload) : {};
        const currentList: any[] = Array.isArray(parsed.forexNews) && parsed.forexNews.length > 0
          ? parsed.forexNews
          : [...INITIAL_WEEKLY_FOREX_NEWS];
        const existsInDb = currentList.some((n: any) => n.id === savedItem!.id);
        const updatedList = existsInDb
          ? currentList.map((n: any) => (n.id === savedItem!.id ? savedItem : n))
          : [savedItem, ...currentList.filter((n: any) => n.id !== savedItem!.id)];
        parsed.forexNews = updatedList;
        await setDoc(docRef, {
          updatedAt: new Date().toISOString(),
          payload: JSON.stringify(parsed)
        }, { merge: true });
      } catch (_e) {}

      setIsModalOpen(false);
      setEditingItem(null);

      if (autoPublishTelegram && savedItem) {
        await executeBroadcast(savedItem, true, true);
      } else {
        setBroadcastFeedback({
          id: savedItem?.id || editingItem?.id || 'saved',
          success: true,
          msg: isEditing ? '✅ تم حفظ وتحديث بيانات الخبر بنجاح في الأجندة الاقتصادية!' : '✅ تم إضافة وحفظ الخبر العاجل بنجاح في الأجندة!'
        });
        setTimeout(() => setBroadcastFeedback(null), 7000);
      }
    } catch (err: any) {
      console.error('Save news error:', err);
      setModalError(err?.message || 'حدث خطأ أثناء حفظ الخبر.');
    } finally {
      setIsSavingNews(false);
    }
  };

  // Handle Delete
  const handleDelete = async (id: string) => {
    if (!isAdmin) return;
    if (!window.confirm('هل أنت متأكد من حذف هذا الخبر نهائياً من الأجندة؟')) return;

    // 1. Update React state & localStorage immediately
    setNews(prev => {
      const filtered = prev.filter(n => n.id !== id);
      try {
        localStorage.setItem('cached_forex_news', JSON.stringify(filtered));
      } catch (_e) {}
      return filtered;
    });

    // 2. Try server route
    try {
      fetch(`/api/forex-news/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { 'Accept': 'application/json' }
      }).catch(() => {});
    } catch (_e) {}

    // 3. Sync to persistent Firestore
    try {
      const docRef = doc(db, 'system_state', 'zad_main_state_v1');
      const snap = await getDoc(docRef);
      const d = snap.exists() ? snap.data() : null;
      const parsed = d?.payload ? JSON.parse(d.payload) : {};
      const currentList: any[] = Array.isArray(parsed.forexNews) && parsed.forexNews.length > 0
        ? parsed.forexNews
        : [...INITIAL_WEEKLY_FOREX_NEWS];
      parsed.forexNews = currentList.filter((n: any) => n.id !== id);
      await setDoc(docRef, {
        updatedAt: new Date().toISOString(),
        payload: JSON.stringify(parsed)
      }, { merge: true });
    } catch (_e) {}

    setBroadcastFeedback({
      id,
      success: true,
      msg: '✅ تم حذف الخبر بنجاح من الأجندة.'
    });
    setTimeout(() => setBroadcastFeedback(null), 5000);
  };

  // Handle Seed Weekly
  const handleSeedWeekly = async () => {
    if (!isAdmin) return;
    if (!window.confirm('هل تريد إعادة تعيين الأجندة وتحميل جدول الأخبار القياسية الأسبوعية المحدثة؟')) return;

    setNews(INITIAL_WEEKLY_FOREX_NEWS);
    try {
      localStorage.setItem('cached_forex_news', JSON.stringify(INITIAL_WEEKLY_FOREX_NEWS));
    } catch (_e) {}

    try {
      fetch('/api/forex-news/seed-weekly', {
        method: 'POST',
        headers: { 'Accept': 'application/json' }
      }).catch(() => {});
    } catch (_e) {}

    try {
      const docRef = doc(db, 'system_state', 'zad_main_state_v1');
      const snap = await getDoc(docRef);
      const d = snap.exists() ? snap.data() : null;
      const parsed = d?.payload ? JSON.parse(d.payload) : {};
      parsed.forexNews = INITIAL_WEEKLY_FOREX_NEWS;
      await setDoc(docRef, {
        updatedAt: new Date().toISOString(),
        payload: JSON.stringify(parsed)
      }, { merge: true });
    } catch (_e) {}

    setBroadcastFeedback({
      id: 'seed',
      success: true,
      msg: '✅ تمت استعادة وتحميل جدول الأخبار القياسية الأسبوعية بنجاح!'
    });
    setTimeout(() => setBroadcastFeedback(null), 5000);
  };

  // Open modal for editing
  const openEditModal = (item: ForexNewsItem) => {
    setEditingItem(item);
    setModalError(null);
    setAutoPublishTelegram(false);
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
    setModalError(null);
    setAutoPublishTelegram(true);
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
                        <span>
                          {item.category === 'المؤتمرات الصحفية' || (!item.previous && !item.forecast)
                            ? 'طبيعة وتصنيف الحدث:'
                            : 'البيانات الرقمية للخبر:'}
                        </span>
                      </div>
                      {item.category === 'المؤتمرات الصحفية' || (!item.previous && !item.forecast) ? (
                        <div className="p-2.5 rounded-lg bg-slate-950/80 border border-cyan-500/30 text-right space-y-1">
                          <div className="flex items-center gap-1.5 text-cyan-300 font-bold text-xs">
                            <span>🎙️</span>
                            <span>مؤتمر صحفي وخطاب مباشر</span>
                          </div>
                          <div className="text-[11px] text-slate-400 leading-relaxed">
                            بيان إعلامي مباشر وتصريحات صحفية للبنك المركزي (لا توجد أرقام إحصائية مسبقة). التأثير يتبع نبرة الخطاب فوراً.
                          </div>
                        </div>
                      ) : (
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
                      )}
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
              {modalError && (
                <div className="p-3 bg-rose-950/90 border border-rose-500 rounded-xl text-rose-200 text-xs font-bold flex items-center gap-2 animate-shake">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{modalError}</span>
                </div>
              )}

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

              {/* Direct Telegram Broadcast Checkbox */}
              <label className="flex items-center gap-2 cursor-pointer bg-slate-950 p-3 rounded-xl border border-slate-800 hover:border-slate-700 transition-colors">
                <input
                  type="checkbox"
                  checked={autoPublishTelegram}
                  onChange={e => setAutoPublishTelegram(e.target.checked)}
                  className="w-4 h-4 accent-rose-500 rounded cursor-pointer"
                />
                <div className="text-right">
                  <span className="text-xs font-bold text-slate-200 block">
                    📢 بث ونشر توصية هذا الخبر مباشرة إلى قناة التليجرام (@ZadNBFX) بعد الحفظ فوراً
                  </span>
                  <span className="text-[10px] text-slate-500 block">
                    سيتم إرسال التحليل، التوقيت، وزوج التوصية المختار إلى المشتركين فور اعتماد الحفظ
                  </span>
                </div>
              </label>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  disabled={isSavingNews}
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 rounded-xl cursor-pointer transition-colors"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSavingNews}
                  className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-60 text-white font-bold rounded-xl cursor-pointer shadow-md shadow-rose-600/30 flex items-center gap-2 transition-all"
                >
                  {isSavingNews ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>جاري الحفظ والتنفيذ...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>
                        {editingItem
                          ? (autoPublishTelegram ? 'حفظ التعديلات وبثها للتليجرام 📢' : 'حفظ التعديلات')
                          : (autoPublishTelegram ? 'إضافة ونشر الخبر الآن 🚀' : 'إضافة وحفظ الخبر')}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Broadcast Confirmation Modal (تأكيد الإرسال والبث للتليجرام) */}
      {isAdmin && confirmBroadcastItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn" dir="rtl">
          <div className="bg-[#0B0F17] border border-rose-500/40 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
            {/* Header */}
            <div className="p-5 bg-gradient-to-r from-rose-950/80 via-slate-900 to-[#0B0F17] border-b border-rose-500/30 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-600/20 border border-rose-500/40 flex items-center justify-center text-rose-400">
                  <Send className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                    <span>تأكيد بث ونشر التوصية للتليجرام</span>
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 font-normal border border-rose-500/30">
                      طلب تأكيد المشرف
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    راجع تفاصيل التوصية وقنوات الإرسال المحددة قبل الإرسال المباشر
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setConfirmBroadcastItem(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 overflow-y-auto text-xs">
              {/* Event Summary Card */}
              <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-white text-sm leading-tight">{confirmBroadcastItem.title}</span>
                  <span className="px-2.5 py-0.5 rounded-lg bg-slate-800 border border-slate-700 text-rose-300 font-mono font-bold text-xs shrink-0">
                    {confirmBroadcastItem.currency}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-slate-300 text-[11px]">
                  <span>📅 {confirmBroadcastItem.eventDayArabic} ({confirmBroadcastItem.eventDate})</span>
                  <span>🇪🇬 توقيت مصر: <b className="text-emerald-400 font-mono">{confirmBroadcastItem.timeCairo}</b></span>
                  <span>🕋 مكة: <b className="text-cyan-400 font-mono">{confirmBroadcastItem.timeMecca}</b></span>
                  <span>🌍 GMT: <b className="text-slate-400 font-mono">{confirmBroadcastItem.timeGmt}</b></span>
                </div>
                {confirmBroadcastItem.recommendation && (
                  <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400">الزوج الموصى به:</span>
                      <span className="font-bold text-white font-mono bg-slate-900 px-2 py-0.5 rounded border border-slate-700">
                        {confirmBroadcastItem.recommendation.pair}
                      </span>
                      <span className={`px-2 py-0.5 rounded font-bold ${
                        confirmBroadcastItem.recommendation.action === 'BUY'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                      }`}>
                        {confirmBroadcastItem.recommendation.action === 'BUY' ? '🟢 شراء (BUY)' : '🔴 بيع (SELL)'}
                      </span>
                    </div>
                    {confirmBroadcastItem.recommendation.entryStrategy && (
                      <div className="text-slate-400 text-[10px] w-full">
                        💡 الاستراتيجية: {confirmBroadcastItem.recommendation.entryStrategy}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Target Channel Destination Selection */}
              <div className="space-y-2">
                <div className="font-bold text-slate-200">اختر القنوات المستهدفة لنشر التوصية:</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <label
                    onClick={() => setBroadcastTargetFree(!broadcastTargetFree)}
                    className={`p-3 rounded-xl border flex items-center gap-3 cursor-pointer transition-all ${
                      broadcastTargetFree
                        ? 'bg-emerald-950/40 border-emerald-500/60 text-white'
                        : 'bg-slate-950/40 border-slate-800 text-slate-400 opacity-60'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={broadcastTargetFree}
                      onChange={() => {}}
                      className="w-4 h-4 accent-emerald-500 cursor-pointer"
                    />
                    <div className="text-right">
                      <div className="font-bold flex items-center gap-1.5">
                        <span>📢 القناة العامة (@ZadNBFX)</span>
                      </div>
                      <div className="text-[10px] text-slate-400">بوت ZAD FX لجميع المشتركين</div>
                    </div>
                  </label>

                  <label
                    onClick={() => setBroadcastTargetVip(!broadcastTargetVip)}
                    className={`p-3 rounded-xl border flex items-center gap-3 cursor-pointer transition-all ${
                      broadcastTargetVip
                        ? 'bg-amber-950/40 border-amber-500/60 text-white'
                        : 'bg-slate-950/40 border-slate-800 text-slate-400 opacity-60'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={broadcastTargetVip}
                      onChange={() => {}}
                      className="w-4 h-4 accent-amber-500 cursor-pointer"
                    />
                    <div className="text-right">
                      <div className="font-bold flex items-center gap-1.5 text-amber-300">
                        <span>👑 قناة VIP الخاصة (Abusalim FX)</span>
                      </div>
                      <div className="text-[10px] text-slate-400">بوت وتوصيات أعضاء VIP المميزين</div>
                    </div>
                  </label>
                </div>
                {!broadcastTargetFree && !broadcastTargetVip && (
                  <p className="text-rose-400 text-[11px] font-semibold">
                    ⚠️ يرجى اختيار قناة واحدة على الأقل لإتمام البث.
                  </p>
                )}
              </div>

              {/* Message Live Preview */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-slate-300 font-semibold">
                  <span>معاينة نص الرسالة بالتليجرام:</span>
                  <span className="text-[10px] text-slate-500">جاهز للإرسال المباشر</span>
                </div>
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-slate-300 whitespace-pre-wrap font-mono text-[11px] leading-relaxed max-h-44 overflow-y-auto select-all">
                  {buildNewsTelegramMessage(confirmBroadcastItem)}
                </div>
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setConfirmBroadcastItem(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer transition-colors"
              >
                إلغاء ✕
              </button>

              <button
                type="button"
                disabled={(!broadcastTargetFree && !broadcastTargetVip) || broadcastingId === confirmBroadcastItem.id}
                onClick={() => executeBroadcast(confirmBroadcastItem, broadcastTargetFree, broadcastTargetVip)}
                className="px-5 py-2.5 bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 disabled:opacity-50 text-white font-bold rounded-xl text-xs cursor-pointer shadow-lg shadow-rose-600/30 flex items-center gap-2 transition-all"
              >
                {broadcastingId === confirmBroadcastItem.id ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>جاري إرسال التوصية إلى التليجرام...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>تأكيد وبث التوصية الآن 🚀</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
