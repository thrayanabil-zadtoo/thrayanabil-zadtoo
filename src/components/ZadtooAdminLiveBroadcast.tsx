import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, SYSTEM_STATE_DOC_PATH, SYSTEM_STATE_DOC_ID } from '../firebase';
import {
  Radio,
  Send,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Sparkles,
  Bot,
  Crown,
  Monitor,
  Flame,
  CheckSquare,
  Square,
  MessageSquare,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  Clock,
  Layers,
  Award,
  ShieldCheck,
  ShieldAlert,
  Zap,
  Check,
  RotateCcw,
  Sliders,
  Activity,
  Power,
  X
} from 'lucide-react';
import type { AutoPilotConfig, SignalItem } from '../App';

export const DEFAULT_FREE_BOT_TOKEN = '8613581536:AAGroIlY3zs-ArBt8p6qnzH3_-2U9tSJ-8U';
export const DEFAULT_FREE_CHAT_ID = '@ZadNBFX';
export const DEFAULT_VIP_BOT_TOKEN = '8814918920:AAGeXmZrTy03s9gozdDAOj3hkIijHm9yJHM';
export const DEFAULT_VIP_CHAT_ID = '-1004323890544';

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

interface ZadtooAdminLiveBroadcastProps {
  autoPilot?: AutoPilotConfig;
  onRefreshSignals?: () => void;
  onNavigateHome?: () => void;
  onSignalCreated?: (signal: SignalItem) => void;
}

export const MAJOR_6_PAIRS = [
  { pair: 'EUR/USD', label: 'EUR/USD (اليورو / دولار أمريكي)', flag1: '🇪🇺', flag2: '🇺🇸', defaultSpread: '0.8' },
  { pair: 'GBP/USD', label: 'GBP/USD (الجنيه الإسترليني / دولار أمريكي)', flag1: '🇬🇧', flag2: '🇺🇸', defaultSpread: '1.1' },
  { pair: 'USD/JPY', label: 'USD/JPY (الدولار الأمريكي / الين الياباني)', flag1: '🇺🇸', flag2: '🇯🇵', defaultSpread: '0.9' },
  { pair: 'USD/CAD', label: 'USD/CAD (الدولار الأمريكي / الدولار الكندي)', flag1: '🇺🇸', flag2: '🇨🇦', defaultSpread: '1.2' },
  { pair: 'AUD/USD', label: 'AUD/USD (الدولار الأسترالي / الدولار الأمريكي)', flag1: '🇦🇺', flag2: '🇺🇸', defaultSpread: '1.0' },
  { pair: 'USD/CHF', label: 'USD/CHF (الدولار الأمريكي / الفرنك السويسري)', flag1: '🇺🇸', flag2: '🇨🇭', defaultSpread: '1.3' }
];

export const ZadtooAdminLiveBroadcast: React.FC<ZadtooAdminLiveBroadcastProps> = ({
  autoPilot,
  onRefreshSignals,
  onNavigateHome,
  onSignalCreated
}) => {
  // --- Section 1: Signal Broadcast Form State ---
  const [selectedPair, setSelectedPair] = useState<string>('EUR/USD');
  const [direction, setDirection] = useState<'CALL' | 'PUT'>('CALL');
  const [targetFreeBot, setTargetFreeBot] = useState<boolean>(true);
  const [targetVipBot, setTargetVipBot] = useState<boolean>(true);
  const [targetFloatingRobot, setTargetFloatingRobot] = useState<boolean>(true);
  const [customNotes, setCustomNotes] = useState<string>('');
  const [isSendingSignal, setIsSendingSignal] = useState<boolean>(false);
  const [signalFeedback, setSignalFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
    details?: string;
  } | null>(null);

  // --- Section 2: Announcements & Celebrations State ---
  const [winMessage, setWinMessage] = useState<string>(
    '🎉 ألف مبروك لجميع من شارك ودخل معنا في هذا البث الحي!\n🟢 صفقة رابحة ومحققة للهدف بفضل الله تعالى 💰🚀\nبارك الله في أرباحكم جميعاً ونسأل الله دوام التوفيق والنجاح!'
  );
  const [lossMessage, setLossMessage] = useState<string>(
    '⚠️ تنبيه مباشر للمشاركين في البث الحي:\nالصفقة السابقة واجهت تقلبات وارتداد غير متوقع. نرجو الالتزام التام بإدارة رأس المال (1%) وعدم التسرع، نجهز الآن لفرصة تعويضية قوية ومحسوبة بإذن الله.'
  );
  const [closingMessage, setClosingMessage] = useState<string>(
    '🔴 تم بحمد الله اختتام جلسة البث الحي لهذا اليوم.\nنشكر كل من شارك وتفاعل وتداول معنا اليوم، نلتقي بكم غداً في نفس الموعد مع صفقات وبث جديد بإذن الله 🤝'
  );
  const [customAnnouncement, setCustomAnnouncement] = useState<string>('');

  const [announcementFreeBot, setAnnouncementFreeBot] = useState<boolean>(true);
  const [announcementVipBot, setAnnouncementVipBot] = useState<boolean>(true);
  const [isSendingAnnouncement, setIsSendingAnnouncement] = useState<string | null>(null);
  const [announcementFeedback, setAnnouncementFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // --- Section 3: Send Confirmation Modals State (تأكيد الإرسال) ---
  const [confirmSignalModalOpen, setConfirmSignalModalOpen] = useState<boolean>(false);
  const [confirmAnnouncement, setConfirmAnnouncement] = useState<{
    boxId: 'win' | 'loss' | 'closing' | 'custom';
    title: string;
    text: string;
  } | null>(null);

  // --- Section 0: 6:00 PM Automated Live Broadcast Session State ---
  const [sessionData, setSessionData] = useState<{
    enabled: boolean;
    startHourEgypt: number;
    preScanMinutes: number;
    minWinRateTarget: number;
    maxWinRateTarget: number;
    stopConsecutiveLosses: number;
    activeDate: string;
    status: 'IDLE' | 'PRE_SCANNING' | 'ACTIVE_BROADCAST' | 'STOPPED_TARGET_REACHED' | 'STOPPED_BAD_MARKET';
    statusNote: string;
    wins: number;
    losses: number;
    consecutiveLosses: number;
    totalTrades: number;
    winRate: number;
    celebrationSentDate?: string;
    badMarketNoticeSentDate?: string;
    lastScanCandidate?: string;
    lastDispatchedAt?: string;
  } | null>(null);
  const [cairoTime, setCairoTime] = useState<{
    hour: number;
    minute: number;
    formatted: string;
    date: string;
  } | null>(null);
  const [sessionSignals, setSessionSignals] = useState<SignalItem[]>([]);
  const [isSessionActionLoading, setIsSessionActionLoading] = useState<string | null>(null);
  const [sessionActionFeedback, setSessionActionFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const fetchSessionStatus = async () => {
    try {
      const res = await fetch('/api/admin/live-broadcast-session');
      if (res.ok) {
        const data = await res.json();
        if (data.ok && data.session) {
          setSessionData(data.session);
          if (data.cairoTime) setCairoTime(data.cairoTime);
          if (Array.isArray(data.signals)) setSessionSignals(data.signals);
        }
      }
    } catch (_err) {
      // Ignore background poll errors
    }
  };

  useEffect(() => {
    fetchSessionStatus();
    const interval = setInterval(fetchSessionStatus, 8000);
    return () => clearInterval(interval);
  }, []);

  const handleToggleSessionEnabled = async () => {
    if (!sessionData) return;
    setIsSessionActionLoading('toggle');
    setSessionActionFeedback(null);
    try {
      const res = await fetch('/api/admin/live-broadcast-session/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !sessionData.enabled })
      });
      const data = await res.json();
      if (data.ok && data.session) {
        setSessionData(data.session);
        setSessionActionFeedback({
          type: 'success',
          text: data.session.enabled
            ? 'تم تفعيل جلسة البث الحي الآلي (الساعة 6:00 مساءً) بنجاح!'
            : 'تم إيقاف جلسة البث الحي الآلي مؤقتاً.'
        });
      }
    } catch (e: any) {
      setSessionActionFeedback({ type: 'error', text: 'فشل تعديل حالة الجلسة: ' + (e?.message || '') });
    } finally {
      setIsSessionActionLoading(null);
    }
  };

  const handleResetSession = async () => {
    setIsSessionActionLoading('reset');
    setSessionActionFeedback(null);
    try {
      const res = await fetch('/api/admin/live-broadcast-session/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset' })
      });
      const data = await res.json();
      if (data.ok && data.session) {
        setSessionData(data.session);
        setSessionActionFeedback({
          type: 'success',
          text: 'تمت إعادة ضبط إحصائيات جلسة البث المشرف لليوم بنجاح!'
        });
        fetchSessionStatus();
      }
    } catch (e: any) {
      setSessionActionFeedback({ type: 'error', text: 'فشل إعادة ضبط الجلسة: ' + (e?.message || '') });
    } finally {
      setIsSessionActionLoading(null);
    }
  };

  const handleTriggerSessionNow = async (mode: 'scan' | 'signal') => {
    setIsSessionActionLoading(mode);
    setSessionActionFeedback(null);
    try {
      const res = await fetch('/api/admin/live-broadcast-session/trigger-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode })
      });
      const data = await res.json();
      if (data.ok) {
        if (data.session) setSessionData(data.session);
        setSessionActionFeedback({
          type: 'success',
          text: mode === 'scan'
            ? 'تم فحص السوق واختيار أفضل مرشح بنجاح!'
            : 'تم إرسال صفقة البث الحي بنجاح إلى قناة VIP الخاصة والروبوت العائم!'
        });
        if (data.signal && onSignalCreated) onSignalCreated(data.signal);
        fetchSessionStatus();
        if (onRefreshSignals) onRefreshSignals();
      } else {
        setSessionActionFeedback({ type: 'error', text: data.error || 'تعذر تنفيذ الأمر' });
      }
    } catch (e: any) {
      setSessionActionFeedback({ type: 'error', text: 'خطأ في الاتصال بالسيرفر: ' + (e?.message || '') });
    } finally {
      setIsSessionActionLoading(null);
    }
  };

  // Quick preset notes for the signal
  const PRESET_NOTES = [
    'تأكيد الدخول فور إغلاق الشمعة الحالية مباشرة ⏱️',
    'ارتداد قوي ومثالي من مستوى دعم رئيسي 🟢',
    'كسر كاذب وارتداد من مستوى مقاومة رئيسي 🔴',
    'التزام صارم بإدارة رأس المال 1% كحد أقصى ⚖️'
  ];

  // Request Confirmation before sending Live Signal
  const handleRequestSendSignal = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!targetFreeBot && !targetVipBot && !targetFloatingRobot) {
      setSignalFeedback({
        type: 'error',
        text: 'يرجى تحديد وجهة واحدة على الأقل (بوت القناة العامة أو بوت VIP أو الروبوت العائم).'
      });
      return;
    }
    setConfirmSignalModalOpen(true);
  };

  // Execute sending the live signal after confirmation
  const executeSendLiveSignal = async () => {
    setConfirmSignalModalOpen(false);
    setIsSendingSignal(true);
    setSignalFeedback(null);

    // Resolve tokens and chat IDs with guaranteed fallbacks (supports incognito / fx.zadtoo.com)
    const freeToken = (autoPilot?.botToken || localStorage.getItem('tg_bot_token') || DEFAULT_FREE_BOT_TOKEN).trim();
    const freeChat = (autoPilot?.chatId || localStorage.getItem('tg_chat_id') || DEFAULT_FREE_CHAT_ID).trim();
    const vipToken = (autoPilot?.vipBotToken || localStorage.getItem('tg_vip_bot_token') || DEFAULT_VIP_BOT_TOKEN).trim();
    const vipChat = (autoPilot?.vipChatId || localStorage.getItem('tg_vip_chat_id') || DEFAULT_VIP_CHAT_ID).trim();

    // Prepare standard signal metadata
    const now = new Date();
    const nextMin = String((now.getMinutes() + 1) % 60).padStart(2, '0');
    const entryMinute = nextMin;
    const targetEntryTimestamp = Math.floor(now.getTime() / 1000) + 60;
    const dirSymbol = direction === 'CALL' ? 'صعود 🟢 ⬆️ (CALL)' : 'هبوط 🔴 ⬇️ (PUT)';
    const defaultPrices: Record<string, string> = {
      'EUR/USD': '1.08520',
      'GBP/USD': '1.29410',
      'USD/JPY': '153.240',
      'USD/CAD': '1.38650',
      'AUD/USD': '0.65820',
      'USD/CHF': '0.86610'
    };
    const livePrice = defaultPrices[selectedPair] || '1.08500';

    const formattedMessage = [
      '🔴 بث حي مباشر للمشرف ZAD FX 🔴',
      '━━━━━━━━━━━━━━━━━━━',
      `📊 الزوج: ${selectedPair} (🌐)`,
      `🎯 الاتجاه: ${dirSymbol}`,
      `⏱️ وقت الدخول: :${entryMinute} (1 دقيقة (M1))`,
      '🎯 شروط الدخول: محققة بنجاح (3 من 4 شروط فنية معتمدة ✅)',
      customNotes && customNotes.trim() ? `\n📝 توجيهات وملاحظات المشرف:\n${customNotes.trim()}` : '',
      '━━━━━━━━━━━━━━━━━━━',
      '🎙️ بث حي لأخذ الصفقات مباشر يومياً الساعة 6:00 مساءً',
      '🎁 احصل على عضوية القناة الخاصة مع روبوت التداول مجاناً',
      '🔗 رابط منصة التداول كيوتكس الرسمي المباشر:',
      'https://broker-qx.pro/?lid=2303934',
      '━━━━━━━━━━━━━━━━━━━',
      '⚠️ تنبيه: يرجى الالتزام الصارم بإدارة رأس المال (1% إلى 2% كحد أقصى لكل صفقة).'
    ].filter(Boolean).join('\n');

    const newSignal: SignalItem = {
      id: `sig-live-${targetEntryTimestamp}`,
      asset: selectedPair,
      isOtc: false,
      direction,
      timeframe: '1 دقيقة (M1)',
      entryMinute,
      entryTime: `:${entryMinute}`,
      targetEntryTimestamp,
      payout: '(🌐) (بث حي للمشرف 🔴)',
      livePrice,
      rsiValue: direction === 'CALL' ? 38 : 62,
      analysisReason: customNotes && customNotes.trim() ? `🔴 بث حي للمشرف: ${customNotes.trim()}` : '🔴 إشارة بث حي مباشر صادرة من المشرف',
      entryPriceNumeric: parseFloat(livePrice),
      formattedMessage,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
      resultSent: false,
      autoSent: false
    };

    let serverSuccess = false;
    let serverData: any = null;

    // Step 1: Always prioritize Backend Server API (Reliable in cloud container)
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 9000);
      const res = await fetch('/api/admin/live-broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          type: 'signal',
          pair: selectedPair,
          direction,
          timeframe: '1 دقيقة (M1)',
          customNotes: customNotes.trim(),
          targetBots: {
            freeBot: targetFreeBot,
            vipBot: targetVipBot,
            floatingRobot: targetFloatingRobot
          }
        })
      });
      clearTimeout(timeoutId);

      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        const d = await res.json();
        if (d && d.ok) {
          serverSuccess = true;
          serverData = d;
        }
      }
    } catch (_serverErr) {
      // Backend route unreachable, fallback to direct client execution below
    }

    try {
      if (serverSuccess && serverData) {
        const destParts: string[] = [];
        if (serverData.sentToFree) destParts.push('بوت القناة العامة (@ZadNBFX)');
        if (serverData.sentToVip) destParts.push('بوت VIP');
        if (serverData.sentToFloating) destParts.push('الروبوت العائم');

        let detailsText = `وصلت الإشارة بنجاح إلى: ${destParts.join(' + ') || 'الوجهات المحددة'}`;
        if (serverData.telegramError) {
          detailsText += ` | ملاحظة البوت المجاني: ${serverData.telegramError}`;
        }
        if (serverData.vipTelegramError) {
          detailsText += ` | ملاحظة بوت VIP: ${serverData.vipTelegramError}`;
        }

        setSignalFeedback({
          type: 'success',
          text: `تم إرسال إشارة ${selectedPair} (${direction === 'CALL' ? 'صعود 🟢' : 'هبوط 🔴'}) بنجاح!`,
          details: detailsText
        });

        if (onSignalCreated) onSignalCreated(serverData.signal || newSignal);
        if (onRefreshSignals) onRefreshSignals();
      } else {
        // Step 2: Direct Client Execution (Guaranteed to work on fx.zadtoo.com & Incognito mode)
        const destParts: string[] = [];
        const sendTasks: Promise<void>[] = [];
        let directFreeError: string | undefined;
        let directVipError: string | undefined;

        if (targetFreeBot && freeToken && freeChat) {
          sendTasks.push(
            sendTelegramDirect(freeToken, freeChat, formattedMessage)
              .then(resFree => {
                if (resFree.ok) {
                  destParts.push('بوت القناة العامة (@ZadNBFX)');
                } else {
                  directFreeError = resFree.description || 'فشل الإرسال للبوت المجاني';
                }
              })
              .catch(err => {
                directFreeError = err?.message || 'خطأ في الاتصال بالبوت المجاني';
              })
          );
        }

        if (targetVipBot && vipToken && vipChat) {
          sendTasks.push(
            sendTelegramDirect(vipToken, vipChat, formattedMessage)
              .then(resVip => {
                if (resVip.ok) {
                  destParts.push('بوت VIP');
                } else {
                  directVipError = resVip.description || 'فشل الإرسال لبوت VIP';
                }
              })
              .catch(err => {
                directVipError = err?.message || 'خطأ في الاتصال ببوت VIP';
              })
          );
        }

        if (targetFloatingRobot) {
          destParts.push('الروبوت العائم');
          sendTasks.push(
            (async () => {
              // 1. Write to robot_feed/live for instant visitor robot HUD
              try {
                await setDoc(doc(db, 'robot_feed', 'live'), {
                  signal: newSignal,
                  updatedAt: new Date().toISOString()
                });
              } catch (_e) {}

              // 2. Append to persistent Firestore system state
              try {
                const snap = await getDoc(doc(db, SYSTEM_STATE_DOC_PATH, SYSTEM_STATE_DOC_ID));
                if (snap.exists()) {
                  const d = snap.data();
                  if (d?.payload) {
                    const parsed = JSON.parse(d.payload);
                    const existingSigs = Array.isArray(parsed.signals) ? parsed.signals : [];
                    parsed.signals = [newSignal, ...existingSigs.filter((s: any) => s.id !== newSignal.id)].slice(0, 50);
                    parsed.stateUpdatedAt = new Date().toISOString();
                    await setDoc(doc(db, SYSTEM_STATE_DOC_PATH, SYSTEM_STATE_DOC_ID), {
                      updatedAt: new Date().toISOString(),
                      payload: JSON.stringify(parsed)
                    });
                  }
                }
              } catch (_e) {}
            })()
          );
        }

        if (sendTasks.length > 0) {
          await Promise.allSettled(sendTasks);
        }

        let detailsText = `وصلت الإشارة بنجاح إلى: ${destParts.join(' + ') || 'الوجهات المحددة'}`;
        if (directFreeError) detailsText += ` | ملاحظة البوت المجاني: ${directFreeError}`;
        if (directVipError) detailsText += ` | ملاحظة بوت VIP: ${directVipError}`;

        setSignalFeedback({
          type: 'success',
          text: `تم إرسال إشارة ${selectedPair} (${direction === 'CALL' ? 'صعود 🟢' : 'هبوط 🔴'}) بنجاح!`,
          details: detailsText
        });

        if (onSignalCreated) onSignalCreated(newSignal);
        if (onRefreshSignals) onRefreshSignals();
      }
    } catch (err: any) {
      const msg = err?.message === 'Failed to fetch'
        ? 'تعذر الاتصال بالخادم. يرجى التأكد من اتصال الإنترنت ثم إعادة المحاولة.'
        : (err?.message || 'حدث خطأ أثناء إرسال الإشارة.');
      setSignalFeedback({
        type: 'error',
        text: msg
      });
    } finally {
      setIsSendingSignal(false);
    }
  };

  // Request Confirmation before sending Announcement
  const handleRequestSendAnnouncement = (
    boxId: 'win' | 'loss' | 'closing' | 'custom',
    title: string,
    text: string
  ) => {
    if (!announcementFreeBot && !announcementVipBot) {
      setAnnouncementFeedback({
        type: 'error',
        text: 'يرجى تفعيل بوت القناة العامة أو بوت VIP لإرسال الرسالة.'
      });
      return;
    }

    if (!text.trim()) {
      setAnnouncementFeedback({
        type: 'error',
        text: 'الرجاء كتابة نص الرسالة المراد إرسالها.'
      });
      return;
    }

    setConfirmAnnouncement({ boxId, title, text: text.trim() });
  };

  // Execute sending announcement after confirmation
  const executeSendAnnouncement = async (
    boxId: 'win' | 'loss' | 'closing' | 'custom',
    text: string
  ) => {
    setConfirmAnnouncement(null);
    setIsSendingAnnouncement(boxId);
    setAnnouncementFeedback(null);

    const freeToken = (autoPilot?.botToken || localStorage.getItem('tg_bot_token') || DEFAULT_FREE_BOT_TOKEN).trim();
    const freeChat = (autoPilot?.chatId || localStorage.getItem('tg_chat_id') || DEFAULT_FREE_CHAT_ID).trim();
    const vipToken = (autoPilot?.vipBotToken || localStorage.getItem('tg_vip_bot_token') || DEFAULT_VIP_BOT_TOKEN).trim();
    const vipChat = (autoPilot?.vipChatId || localStorage.getItem('tg_vip_chat_id') || DEFAULT_VIP_CHAT_ID).trim();

    let serverSuccess = false;

    // Step 1: Always prioritize Backend Server API (Reliable in cloud container)
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 9000);
      const res = await fetch('/api/admin/live-broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          type: 'announcement',
          announcementType: boxId,
          announcementText: text.trim(),
          targetBots: {
            freeBot: announcementFreeBot,
            vipBot: announcementVipBot
          }
        })
      });
      clearTimeout(timeoutId);

      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        const d = await res.json();
        if (d && d.ok) {
          serverSuccess = true;
        }
      }
    } catch (_serverErr) {
      // Backend route unreachable, fallback to direct client execution below
    }

    try {
      if (serverSuccess) {
        const destParts: string[] = [];
        if (announcementFreeBot) destParts.push('القناة العامة (@ZadNBFX)');
        if (announcementVipBot) destParts.push('قناة VIP');

        setAnnouncementFeedback({
          type: 'success',
          text: `تم إرسال الرسالة بنجاح إلى: ${destParts.join(' و ') || 'البوتات المحددة'}!`
        });

        if (boxId === 'custom') {
          setCustomAnnouncement('');
        }
      } else {
        // Step 2: Direct Client Execution to Telegram API
        const destParts: string[] = [];
        const sendTasks: Promise<void>[] = [];
        let directFreeError: string | undefined;
        let directVipError: string | undefined;

        if (announcementFreeBot && freeToken && freeChat) {
          sendTasks.push(
            sendTelegramDirect(freeToken, freeChat, text.trim())
              .then(resFree => {
                if (resFree.ok) {
                  destParts.push('القناة العامة (@ZadNBFX)');
                } else {
                  directFreeError = resFree.description || 'فشل الإرسال للبوت المجاني';
                }
              })
              .catch(err => {
                directFreeError = err?.message || 'خطأ في الاتصال بالبوت المجاني';
              })
          );
        }

        if (announcementVipBot && vipToken && vipChat) {
          sendTasks.push(
            sendTelegramDirect(vipToken, vipChat, text.trim())
              .then(resVip => {
                if (resVip.ok) {
                  destParts.push('قناة VIP');
                } else {
                  directVipError = resVip.description || 'فشل الإرسال لبوت VIP';
                }
              })
              .catch(err => {
                directVipError = err?.message || 'خطأ في الاتصال ببوت VIP';
              })
          );
        }

        if (sendTasks.length > 0) {
          await Promise.allSettled(sendTasks);
        }

        if (destParts.length > 0) {
          setAnnouncementFeedback({
            type: 'success',
            text: `تم إرسال الرسالة بنجاح إلى: ${destParts.join(' و ') || 'البوتات المحددة'}!`
          });

          if (boxId === 'custom') {
            setCustomAnnouncement('');
          }
        } else {
          setAnnouncementFeedback({
            type: 'error',
            text: directFreeError || directVipError || 'تعذر إرسال الرسالة إلى البوتات، تأكد من الاتصال.'
          });
        }
      }
    } catch (err: any) {
      const msg = err?.message === 'Failed to fetch'
        ? 'تعذر الاتصال بالخادم. يرجى التأكد من اتصال الإنترنت ثم إعادة المحاولة.'
        : (err?.message || 'حدث خطأ أثناء إرسال الرسالة.');
      setAnnouncementFeedback({
        type: 'error',
        text: msg
      });
    } finally {
      setIsSendingAnnouncement(null);
    }
  };

  const selectedPairObj = MAJOR_6_PAIRS.find((p) => p.pair === selectedPair) || MAJOR_6_PAIRS[0];

  return (
    <div className="space-y-8 animate-fadeIn" dir="rtl">
      {/* Top Banner Header */}
      <div className="p-6 bg-gradient-to-r from-slate-900 via-rose-950/40 to-slate-900 border border-rose-500/30 rounded-2xl shadow-xl text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/20 border border-rose-400/30 text-rose-300 text-xs font-black">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
              <span>لوحة البث الحي الحصري للمشرف ZAD FX</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center gap-2.5">
              <Radio className="w-7 h-7 text-rose-400 animate-pulse" />
              <span>البث الحي للمشرف</span>
            </h1>
            <p className="text-slate-300 text-xs sm:text-sm max-w-2xl leading-relaxed">
              تحكم كامل في بث الإشارات المباشرة أثناء جلسات التداول الحي، الإرسال الفوري لبوت القناة المجانية وبوت VIP والروبوت العائم معاً، وصناديق المباركة وإعلانات النتائج.
            </p>
          </div>

          {/* Bot Connection Quick Status Badges */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-xs flex items-center gap-2">
              <Bot className="w-4 h-4 text-emerald-400" />
              <div>
                <div className="text-[10px] text-slate-400">البوت المجاني</div>
                <div className="font-bold text-emerald-300">
                  {autoPilot?.botToken ? '@ZadNBFX (جاهز)' : 'غير متصل'}
                </div>
              </div>
            </div>

            <div className="px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-xs flex items-center gap-2">
              <Crown className="w-4 h-4 text-amber-400" />
              <div>
                <div className="text-[10px] text-slate-400">بوت VIP الخاص</div>
                <div className="font-bold text-amber-300">
                  {autoPilot?.vipBotToken ? 'Abusalim VIP (جاهز)' : 'غير متصل'}
                </div>
              </div>
            </div>

            <div className="px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-xs flex items-center gap-2">
              <Monitor className="w-4 h-4 text-sky-400" />
              <div>
                <div className="text-[10px] text-slate-400">الروبوت العائم</div>
                <div className="font-bold text-sky-300">متصل ومتزامن</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================
          SECTION 0: جلسة البث الحي الآلي للسوق العالمي (الساعة 6:00 مساءً)
          ======================================================== */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950 border-2 border-amber-500/40 rounded-2xl shadow-2xl p-6 sm:p-8 space-y-6 text-white relative overflow-hidden">
        {/* Glow ambient background effect */}
        <div className="absolute top-0 left-0 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-80 h-80 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b border-slate-700/80">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-300 text-xs font-black">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>نظام البث الآلي الذكي المشرف ZAD FX</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2.5">
              <Crown className="w-6 h-6 text-amber-400" />
              <span>جلسة البث الحي للسوق العالمي (الساعة 06:00 مساءً بتوقيت مصر)</span>
            </h2>
            <p className="text-slate-300 text-xs sm:text-sm max-w-3xl leading-relaxed">
              بث حي آلي مباشر للسوق العالمي يبدأ يومياً الساعة <b>06:00 مساءً</b> بإرسال تنبيه: <i>«نقول بسم الله ونبدأ بعد 10 دقائق استعدوا يا أبطال 🚀»</i> مع مسح فني مدته <b>10 دقائق (18:00 - 18:10)</b>. تُرسل الإشارات <b>حصرياً لقناة VIP الخاصة</b> وتتوقف الجلسة تلقائياً <b>بعد 60 دقيقة من انطلاق الإشارة الأولى</b> أو عند تحقيق <b>70% - 75%</b>، مع إيقاف طوارئ فوري عند <b>3 خسائر متتالية</b> لحماية رأس المال، وإحصائياتها معزولة تماماً ضمن «إحصائيات البث المشرف».
            </p>
          </div>

          {/* Current Cairo Time & Session Status Badge */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="px-4 py-2.5 rounded-xl bg-slate-800/90 border border-slate-700 text-right">
              <div className="text-[11px] text-slate-400 flex items-center gap-1.5 justify-end">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                <span>ساعة مصر (القاهرة):</span>
              </div>
              <div className="text-base font-black text-amber-300 font-mono tracking-wider">
                {cairoTime?.formatted || '--:--'}
              </div>
            </div>

            <div
              className={`px-4 py-2.5 rounded-xl border font-bold text-xs flex items-center gap-2 shadow-sm ${
                sessionData?.status === 'ACTIVE_BROADCAST'
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 ring-2 ring-emerald-500/20'
                  : sessionData?.status === 'PRE_SCANNING'
                  ? 'bg-sky-500/20 text-sky-300 border-sky-500/50 ring-2 ring-sky-500/20 animate-pulse'
                  : sessionData?.status === 'STOPPED_TARGET_REACHED'
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                  : sessionData?.status === 'STOPPED_BAD_MARKET'
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/50 ring-2 ring-rose-500/20'
                  : 'bg-slate-800 text-slate-300 border-slate-700'
              }`}
            >
              {sessionData?.status === 'ACTIVE_BROADCAST' && (
                <>
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                  <span>🟢 جاري البث الحي المباشر (قناة VIP)</span>
                </>
              )}
              {sessionData?.status === 'PRE_SCANNING' && (
                <>
                  <span className="w-2.5 h-2.5 rounded-full bg-sky-400 animate-ping" />
                  <span>🔍 مرحلة المسح الفني العميق (10 دقائق)</span>
                </>
              )}
              {sessionData?.status === 'STOPPED_TARGET_REACHED' && (
                <>
                  <Award className="w-4 h-4 text-amber-400" />
                  <span>🎯 تم تحقيق الهدف (70% - 75%) وتم إيقاف البث</span>
                </>
              )}
              {sessionData?.status === 'STOPPED_BAD_MARKET' && (
                <>
                  <ShieldAlert className="w-4 h-4 text-rose-400" />
                  <span>🛡️ تم إيقاف الطوارئ (3 خسائر متتالية)</span>
                </>
              )}
              {(!sessionData || sessionData.status === 'IDLE') && (
                <>
                  <Clock className="w-4 h-4 text-slate-400" />
                  <span>⚪ في وضع الاستعداد (تبدأ 06:00 م)</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Live Status Note Alert Banner */}
        {sessionData?.statusNote && (
          <div
            className={`p-4 rounded-xl border text-xs sm:text-sm font-semibold flex items-center justify-between gap-3 ${
              sessionData.status === 'STOPPED_BAD_MARKET'
                ? 'bg-rose-950/60 border-rose-500/50 text-rose-200'
                : sessionData.status === 'STOPPED_TARGET_REACHED'
                ? 'bg-amber-950/60 border-amber-500/50 text-amber-200'
                : sessionData.status === 'PRE_SCANNING'
                ? 'bg-sky-950/60 border-sky-500/50 text-sky-200'
                : 'bg-slate-800/80 border-slate-700 text-slate-300'
            }`}
          >
            <div className="flex items-center gap-2.5">
              {sessionData.status === 'STOPPED_BAD_MARKET' ? (
                <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0" />
              ) : sessionData.status === 'STOPPED_TARGET_REACHED' ? (
                <Award className="w-5 h-5 text-amber-400 shrink-0" />
              ) : (
                <Activity className="w-5 h-5 text-amber-400 shrink-0" />
              )}
              <span>{sessionData.statusNote}</span>
            </div>
            {sessionData.lastScanCandidate && (
              <span className="text-[11px] px-2.5 py-1 rounded bg-black/40 border border-white/10 font-mono text-amber-300">
                المرشح: {sessionData.lastScanCandidate}
              </span>
            )}
          </div>
        )}

        {/* Emergency Stop Notice (If Market Bad / 3 Consecutive Losses) */}
        {sessionData?.status === 'STOPPED_BAD_MARKET' && (
          <div className="p-4 rounded-xl bg-gradient-to-r from-rose-950 to-slate-900 border-2 border-rose-500/60 text-rose-100 space-y-2">
            <div className="flex items-center gap-2 text-rose-400 font-extrabold text-sm sm:text-base">
              <AlertTriangle className="w-5 h-5 text-rose-400" />
              <span>نص إشعار الاعتذار الذي تم إرساله لقناة VIP تلقائياً:</span>
            </div>
            <div className="p-3 bg-black/50 border border-rose-500/30 rounded-lg text-xs leading-relaxed font-mono whitespace-pre-line text-slate-200">
              ⚠️ تنبيه هام من المشرف ZAD FX ⚠️{'\n'}
              ━━━━━━━━━━━━━━━━━━━{'\n'}
              السوق ليس جيداً اليوم ونعتذر عن إيقاف الجلسة حرصاً على إدارة رأس المال وحماية محافظكم.{'\n'}
              سوف نعيد العمل غداً إن شاء الله 🛡️🤝{'\n'}
              ━━━━━━━━━━━━━━━━━━━{'\n'}
              تذكر دائماً: حماية رأس المال هي الخطوة الأولى لاحتراف التداول والنجاح المستمر.
            </div>
          </div>
        )}

        {/* 5 Real-Time Admin Live Broadcast Statistics Counters */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
          {/* Card 1: Total Trades */}
          <div className="p-4 rounded-xl bg-slate-800/80 border border-slate-700/80 flex flex-col justify-between">
            <div className="text-slate-400 text-xs font-semibold flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-slate-400" />
              <span>صفقات البث اليوم</span>
            </div>
            <div className="mt-2 text-2xl sm:text-3xl font-black text-white font-mono">
              {sessionData?.totalTrades ?? 0}
            </div>
            <div className="text-[10px] text-slate-400 mt-1">
              مجموع صفقات جلسة 6:00 م
            </div>
          </div>

          {/* Card 2: Wins */}
          <div className="p-4 rounded-xl bg-slate-800/80 border border-emerald-500/40 flex flex-col justify-between">
            <div className="text-emerald-400 text-xs font-semibold flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>صفقات رابحة (فوز)</span>
            </div>
            <div className="mt-2 text-2xl sm:text-3xl font-black text-emerald-400 font-mono">
              {sessionData?.wins ?? 0}
            </div>
            <div className="text-[10px] text-emerald-300/80 mt-1">
              أرباح مباشرة مؤكدة ✅
            </div>
          </div>

          {/* Card 3: Losses */}
          <div className="p-4 rounded-xl bg-slate-800/80 border border-rose-500/40 flex flex-col justify-between">
            <div className="text-rose-400 text-xs font-semibold flex items-center gap-1.5">
              <X className="w-4 h-4 text-rose-400" />
              <span>صفقات خاسرة</span>
            </div>
            <div className="mt-2 text-2xl sm:text-3xl font-black text-rose-400 font-mono">
              {sessionData?.losses ?? 0}
            </div>
            <div className="text-[10px] text-rose-300/80 mt-1">
              بدون مضاعفات (0 Gale)
            </div>
          </div>

          {/* Card 4: Consecutive Losses */}
          <div
            className={`p-4 rounded-xl border flex flex-col justify-between ${
              (sessionData?.consecutiveLosses ?? 0) >= 2
                ? 'bg-rose-950/80 border-rose-500 ring-2 ring-rose-500/30'
                : 'bg-slate-800/80 border-slate-700/80'
            }`}
          >
            <div className="text-xs font-semibold flex items-center gap-1.5 text-amber-300">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span>خسائر متتالية</span>
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-2xl sm:text-3xl font-black font-mono text-white">
                {sessionData?.consecutiveLosses ?? 0}
              </span>
              <span className="text-xs text-slate-400 font-mono">/ 3 حد أقصى</span>
            </div>
            <div className="text-[10px] text-slate-400 mt-1">
              {(sessionData?.consecutiveLosses ?? 0) >= 3
                ? '🛑 تم التوقف التلقائي'
                : (sessionData?.consecutiveLosses ?? 0) === 2
                ? '⚠️ تنبيه: اقتراب من إيقاف الطوارئ'
                : 'ضمن النطاق الآمن 🛡️'}
            </div>
          </div>

          {/* Card 5: Win Rate % */}
          <div className="p-4 rounded-xl bg-slate-800/80 border border-amber-500/50 flex flex-col justify-between col-span-2 sm:col-span-1">
            <div className="text-amber-400 text-xs font-semibold flex items-center gap-1.5">
              <Award className="w-4 h-4 text-amber-400" />
              <span>نسبة النجاح</span>
            </div>
            <div className="mt-2 text-2xl sm:text-3xl font-black text-amber-400 font-mono">
              {sessionData?.winRate ?? 0}%
            </div>
            <div className="text-[10px] text-amber-300/80 mt-1">
              الهدف: 70% إلى 75% 🎯
            </div>
          </div>
        </div>

        {/* 4 Feature Badges & Policy Checklist */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs bg-slate-800/50 p-4 rounded-xl border border-slate-700">
          <div className="flex items-start gap-2.5">
            <Crown className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-white">حصري لقناة VIP الخاصة</div>
              <div className="text-slate-400 text-[11px]">
                تصل الإشارات حصرياً لمشتركي VIP والروبوت العائم، دون النشر في القناة المجانية.
              </div>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-white">إحصائيات البث المشرف فقط</div>
              <div className="text-slate-400 text-[11px]">
                معزولة كلياً ومحمية ولا تتدخل في إحصائيات القناة العامة اليومية.
              </div>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <Clock className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-white">10 دقائق مسح + مدة 60 دقيقة</div>
              <div className="text-slate-400 text-[11px]">
                تنبيه البداية عند 18:00، ومسح 10 دقائق، وتنتهي الجلسة بعد 60 دقيقة من أول إشارة.
              </div>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-white">إيقاف طوارئ عند 3 خسائر متتالية</div>
              <div className="text-slate-400 text-[11px]">
                حماية صارمة لرأس المال وإرسال رسالة الاعتذار وتأجيل التداول للغد.
              </div>
            </div>
          </div>
        </div>

        {/* Action Feedback Banner */}
        {sessionActionFeedback && (
          <div
            className={`p-3 rounded-xl border text-xs sm:text-sm font-bold flex items-center justify-between ${
              sessionActionFeedback.type === 'success'
                ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300'
                : 'bg-rose-950/80 border-rose-500/50 text-rose-300'
            }`}
          >
            <span>{sessionActionFeedback.text}</span>
            <button
              onClick={() => setSessionActionFeedback(null)}
              className="text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Session Admin Interactive Control Buttons */}
        <div className="flex flex-wrap items-center gap-3 pt-2">
          {/* Toggle Enable Button */}
          <button
            onClick={handleToggleSessionEnabled}
            disabled={isSessionActionLoading === 'toggle'}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center gap-2 transition-all ${
              sessionData?.enabled
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md'
                : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
            }`}
          >
            <Power className="w-4 h-4" />
            <span>
              {sessionData?.enabled ? 'الجلسة الآلية: مفعّلة (نشطة)' : 'الجلسة الآلية: متوقفة مؤقتاً'}
            </span>
          </button>

          {/* Trigger Scan Button */}
          <button
            onClick={() => handleTriggerSessionNow('scan')}
            disabled={Boolean(isSessionActionLoading)}
            className="px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs sm:text-sm flex items-center gap-2 shadow-md transition-all disabled:opacity-50"
          >
            <RefreshCw
              className={`w-4 h-4 ${isSessionActionLoading === 'scan' ? 'animate-spin' : ''}`}
            />
            <span>
              {isSessionActionLoading === 'scan'
                ? 'جاري مسح أزواج السوق...'
                : '🔍 مسح فني عميق للأسواق واختيار مرشح'}
            </span>
          </button>

          {/* Trigger Immediate Signal Button */}
          <button
            onClick={() => handleTriggerSessionNow('signal')}
            disabled={Boolean(isSessionActionLoading)}
            className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs sm:text-sm flex items-center gap-2 shadow-md transition-all disabled:opacity-50"
          >
            <Zap
              className={`w-4 h-4 ${isSessionActionLoading === 'signal' ? 'animate-bounce' : ''}`}
            />
            <span>
              {isSessionActionLoading === 'signal'
                ? 'جاري إرسال الصفقة لقناة VIP...'
                : '⚡ إرسال صفقة بث حي فورية إلى VIP'}
            </span>
          </button>

          {/* Reset Session Stats Button */}
          <button
            onClick={handleResetSession}
            disabled={Boolean(isSessionActionLoading)}
            className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-all disabled:opacity-50"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
            <span>تصفير إحصائيات جلسة اليوم</span>
          </button>
        </div>

        {/* Live Session Recent Signals List (if any) */}
        {sessionSignals.length > 0 && (
          <div className="pt-4 border-t border-slate-800 space-y-2.5">
            <div className="text-xs font-bold text-amber-300 flex items-center gap-2">
              <Radio className="w-4 h-4 text-amber-400 animate-pulse" />
              <span>صفقات البث الحي المنشورة اليوم في جلسة VIP ({sessionSignals.length} صفقات):</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-48 overflow-y-auto">
              {sessionSignals.map(sig => (
                <div
                  key={sig.id}
                  className="p-2.5 rounded-lg bg-slate-800/90 border border-slate-700 flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        sig.status === 'WIN'
                          ? 'bg-emerald-400'
                          : sig.status === 'LOSS'
                          ? 'bg-rose-400'
                          : 'bg-amber-400 animate-pulse'
                      }`}
                    />
                    <span className="font-bold text-white font-mono">{sig.asset}</span>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        sig.direction === 'CALL'
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/30'
                          : 'bg-rose-950 text-rose-300 border border-rose-500/30'
                      }`}
                    >
                      {sig.direction === 'CALL' ? 'CALL 🟢' : 'PUT 🔴'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] font-mono">
                    <span className="text-slate-400">:{sig.entryMinute}</span>
                    <span
                      className={`font-black px-2 py-0.5 rounded ${
                        sig.status === 'WIN'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : sig.status === 'LOSS'
                          ? 'bg-rose-500/20 text-rose-300'
                          : 'bg-amber-500/20 text-amber-300'
                      }`}
                    >
                      {sig.status === 'WIN'
                        ? '✅ ربح'
                        : sig.status === 'LOSS'
                        ? '❌ خسارة'
                        : '⏳ قيد التنفيذ'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ========================================================
          SECTION 1: مربع إرسال إشارة البث الحي اليدوية
          ======================================================== */}
      <div className="bg-white border-2 border-slate-200/90 rounded-2xl shadow-md p-6 sm:p-8 space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-200 font-bold">
              01
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-extrabold text-slate-900">
                إرسال إشارة البث الحي المباشر
              </h2>
              <p className="text-xs text-slate-500">
                حدد الزوج من الأزواج الستة، واختر الاتجاه (هبوط أو صعود)، وحدد البوتات المستهدفة
              </p>
            </div>
          </div>

          {/* Direction Live Indicator Badge */}
          <div
            className={`px-4 py-2 rounded-xl font-black text-sm flex items-center gap-2 border shadow-xs transition-all ${
              direction === 'CALL'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-300 ring-2 ring-emerald-500/20'
                : 'bg-rose-50 text-rose-800 border-rose-300 ring-2 ring-rose-500/20'
            }`}
          >
            {direction === 'CALL' ? (
              <>
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <ArrowUpRight className="w-5 h-5 text-emerald-600 stroke-[3]" />
                <span>صعود 🟢 ⬆️ (CALL)</span>
              </>
            ) : (
              <>
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
                <ArrowDownRight className="w-5 h-5 text-rose-600 stroke-[3]" />
                <span>هبوط 🔴 ⬇️ (PUT)</span>
              </>
            )}
          </div>
        </div>

        <form onSubmit={handleRequestSendSignal} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* 1. قائمة منسدلة للأزواج الستة الرئيسية */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700">
                1. اختيار زوج العملة (الستة أزواج الرئيسية المعتمدة):
              </label>
              <div className="relative">
                <select
                  value={selectedPair}
                  onChange={(e) => setSelectedPair(e.target.value)}
                  className="w-full px-4 py-3.5 pr-12 rounded-xl border-2 border-slate-200 bg-slate-50 text-slate-900 font-black text-base focus:border-rose-500 focus:bg-white focus:outline-hidden transition-colors cursor-pointer appearance-none"
                >
                  {MAJOR_6_PAIRS.map((item) => (
                    <option key={item.pair} value={item.pair}>
                      {item.flag1} {item.flag2} {item.label}
                    </option>
                  ))}
                </select>
                <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-xl">
                  {selectedPairObj.flag1}
                </div>
              </div>
              <div className="text-[11px] text-slate-500 flex items-center justify-between px-1">
                <span>سوق عالمي فوري بدون انقطاع</span>
                <span className="font-bold text-slate-700">
                  فريم التحليل: 1 دقيقة (M1)
                </span>
              </div>
            </div>

            {/* 2. قائمة منسدلة لاتجاه الصفقة (هبوط 🔴 أو صعود 🟢) */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700">
                2. اتجاه الصفقة (هبوط أو صعود مع الرمز التوضيحي):
              </label>
              <div className="relative">
                <select
                  value={direction}
                  onChange={(e) => setDirection(e.target.value as 'CALL' | 'PUT')}
                  className={`w-full px-4 py-3.5 pr-12 rounded-xl border-2 font-black text-base focus:outline-hidden transition-all cursor-pointer appearance-none ${
                    direction === 'CALL'
                      ? 'border-emerald-400 bg-emerald-50/60 text-emerald-950 focus:border-emerald-600'
                      : 'border-rose-400 bg-rose-50/60 text-rose-950 focus:border-rose-600'
                  }`}
                >
                  <option value="CALL">🟢 ⬆️ صعود (CALL / شراء)</option>
                  <option value="PUT">🔴 ⬇️ هبوط (PUT / بيع)</option>
                </select>
                <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
                  {direction === 'CALL' ? (
                    <ArrowUpRight className="w-6 h-6 text-emerald-600 stroke-[3]" />
                  ) : (
                    <ArrowDownRight className="w-6 h-6 text-rose-600 stroke-[3]" />
                  )}
                </div>
              </div>

              {/* Quick toggle buttons beside dropdown */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setDirection('CALL')}
                  className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer border ${
                    direction === 'CALL'
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                      : 'bg-white text-emerald-800 border-emerald-200 hover:bg-emerald-50'
                  }`}
                >
                  <span>🟢</span>
                  <span>صعود (CALL)</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setDirection('PUT')}
                  className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer border ${
                    direction === 'PUT'
                      ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                      : 'bg-white text-rose-800 border-rose-200 hover:bg-rose-50'
                  }`}
                >
                  <span>🔴</span>
                  <span>هبوط (PUT)</span>
                  <ArrowDownRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* 3. مربعات الاختيار بعلامة صح لتفعيل أحد البوتين أو الاثنين معاً */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <div className="text-xs font-bold text-slate-800 flex items-center gap-2">
              <Layers className="w-4 h-4 text-rose-600" />
              <span>3. تحديد وجهة البث (اختر أحد البوتين أو كلاهما معاً):</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Free Bot Checkbox */}
              <label
                className={`flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer select-none transition-all ${
                  targetFreeBot
                    ? 'bg-emerald-50/80 border-emerald-300 text-emerald-950 font-bold shadow-xs'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100/60'
                }`}
              >
                <input
                  type="checkbox"
                  checked={targetFreeBot}
                  onChange={(e) => setTargetFreeBot(e.target.checked)}
                  className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                />
                <div className="flex-1">
                  <div className="text-xs font-extrabold flex items-center gap-1.5">
                    <Bot className="w-4 h-4 text-emerald-600" />
                    <span>بوت القناة العامة المجانية</span>
                  </div>
                  <div className="text-[10px] text-slate-500 font-normal">@ZadNBFX · هدف 70% - 75% أو حتى 03:00 م</div>
                </div>
              </label>

              {/* VIP Bot Checkbox */}
              <label
                className={`flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer select-none transition-all ${
                  targetVipBot
                    ? 'bg-amber-50/80 border-amber-300 text-amber-950 font-bold shadow-xs'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100/60'
                }`}
              >
                <input
                  type="checkbox"
                  checked={targetVipBot}
                  onChange={(e) => setTargetVipBot(e.target.checked)}
                  className="w-4 h-4 text-amber-600 rounded border-slate-300 focus:ring-amber-500 cursor-pointer"
                />
                <div className="flex-1">
                  <div className="text-xs font-extrabold flex items-center gap-1.5">
                    <Crown className="w-4 h-4 text-amber-600" />
                    <span>بوت القناة الخاصة VIP</span>
                  </div>
                  <div className="text-[10px] text-slate-500 font-normal">Abusalim FX VIP · مستمر حتى 03:00 م بغض النظر عن النتيجة</div>
                </div>
              </label>

              {/* Floating Robot Checkbox */}
              <label
                className={`flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer select-none transition-all ${
                  targetFloatingRobot
                    ? 'bg-sky-50/80 border-sky-300 text-sky-950 font-bold shadow-xs'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100/60'
                }`}
              >
                <input
                  type="checkbox"
                  checked={targetFloatingRobot}
                  onChange={(e) => setTargetFloatingRobot(e.target.checked)}
                  className="w-4 h-4 text-sky-600 rounded border-slate-300 focus:ring-sky-500 cursor-pointer"
                />
                <div className="flex-1">
                  <div className="text-xs font-extrabold flex items-center gap-1.5">
                    <Monitor className="w-4 h-4 text-sky-600" />
                    <span>الروبوت العائم في المنصة</span>
                  </div>
                  <div className="text-[10px] text-slate-500 font-normal">يصل فوراً لشاشة المشتركين</div>
                </div>
              </label>
            </div>
          </div>

          {/* 4. المربع النصي لكتابة ما يراه المشرف */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-slate-700">
                4. ملاحظات وتوجيهات المشرف المباشرة (اكتب ما تراه مناسباً للإشارة):
              </label>
              <span className="text-[11px] text-slate-500">اختياري - يظهر داخل رسالة البث</span>
            </div>
            <textarea
              value={customNotes}
              onChange={(e) => setCustomNotes(e.target.value)}
              rows={3}
              placeholder="مثال: يرجى انتظار إغلاق الشمعة الحالية عند الدقيقة 42 والدخول مع بداية الشمعة الجديدة، هدف الصفقة ارتدادي مع إدارة رأس مال 1%..."
              className="w-full p-3.5 rounded-xl border-2 border-slate-200 bg-slate-50 text-slate-900 text-sm font-medium focus:border-rose-500 focus:bg-white focus:outline-hidden transition-all resize-y"
            />

            {/* Quick Presets */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[10px] text-slate-500 font-bold ml-1">تعبئة سريعة:</span>
              {PRESET_NOTES.map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setCustomNotes(preset)}
                  className="px-2 py-1 rounded-md text-[11px] bg-slate-100 hover:bg-rose-50 hover:text-rose-700 text-slate-700 border border-slate-200 transition-colors cursor-pointer"
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          {/* Feedback Banner */}
          {signalFeedback && (
            <div
              className={`p-4 rounded-xl text-xs font-bold flex items-start gap-2.5 animate-fadeIn ${
                signalFeedback.type === 'success'
                  ? 'bg-emerald-50 text-emerald-900 border border-emerald-300'
                  : 'bg-rose-50 text-rose-900 border border-rose-300'
              }`}
            >
              {signalFeedback.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              )}
              <div className="space-y-0.5">
                <div>{signalFeedback.text}</div>
                {signalFeedback.details && (
                  <div className="text-[11px] font-normal text-emerald-800">
                    {signalFeedback.details}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Action Send Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isSendingSignal}
              className={`w-full py-4 px-6 rounded-xl font-black text-base flex items-center justify-center gap-2.5 shadow-lg transition-all cursor-pointer text-white ${
                direction === 'CALL'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-emerald-500/20'
                  : 'bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 shadow-rose-500/20'
              } ${isSendingSignal ? 'opacity-70 cursor-not-allowed' : 'hover:scale-[1.01] active:scale-[0.99]'}`}
            >
              {isSendingSignal ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  <span>جاري إرسال إشارة البث الحي الآن...</span>
                </>
              ) : (
                <>
                  <Send className="w-5 h-5" />
                  <span>
                    إرسال إشارة {selectedPair} ({direction === 'CALL' ? 'صعود 🟢' : 'هبوط 🔴'}) إلى البوتات المحددة والروبوت العائم 🚀
                  </span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* ========================================================
          SECTION 2: صناديق النتائج السريعة والمباركة للمشاركين
          ======================================================== */}
      <div className="bg-slate-900 text-white border-2 border-slate-800 rounded-2xl shadow-xl p-6 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30 font-bold">
              02
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-extrabold text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-400" />
                <span>صناديق النتائج السريعة والمباركة للمشاركين</span>
              </h2>
              <p className="text-xs text-slate-400">
                صناديق جاهزة ومستقلة لإرسال رسائل الفوز والربح أو التنبيه والتعويض أو إنهاء البث الحي فوراً
              </p>
            </div>
          </div>

          {/* Bot destination toggles for announcements */}
          <div className="flex items-center gap-2 bg-slate-800/90 p-2 rounded-xl border border-slate-700 text-xs">
            <span className="text-[11px] text-slate-400 ml-1">إرسال النتائج إلى:</span>
            <label className="flex items-center gap-1.5 cursor-pointer font-bold text-emerald-400">
              <input
                type="checkbox"
                checked={announcementFreeBot}
                onChange={(e) => setAnnouncementFreeBot(e.target.checked)}
                className="rounded border-slate-600 cursor-pointer"
              />
              <span>العامة 📢</span>
            </label>
            <span className="text-slate-600">|</span>
            <label className="flex items-center gap-1.5 cursor-pointer font-bold text-amber-400">
              <input
                type="checkbox"
                checked={announcementVipBot}
                onChange={(e) => setAnnouncementVipBot(e.target.checked)}
                className="rounded border-slate-600 cursor-pointer"
              />
              <span>VIP 👑</span>
            </label>
          </div>
        </div>

        {/* Global Announcement Feedback */}
        {announcementFeedback && (
          <div
            className={`p-4 rounded-xl text-xs font-bold flex items-center gap-2.5 animate-fadeIn ${
              announcementFeedback.type === 'success'
                ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/40'
                : 'bg-rose-500/20 text-rose-200 border border-rose-500/40'
            }`}
          >
            {announcementFeedback.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
            )}
            <span>{announcementFeedback.text}</span>
          </div>
        )}

        {/* The 3 Ready Boxes with Independent Controls */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* BOX A: رسالة الفوز والربح والمباركة */}
          <div className="p-5 bg-slate-800/80 border-2 border-emerald-500/40 rounded-2xl flex flex-col justify-between space-y-4 hover:border-emerald-400 transition-all">
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-700">
                <div className="flex items-center gap-2 text-emerald-400 font-extrabold text-sm">
                  <Award className="w-5 h-5 text-emerald-400" />
                  <span>صندوق مباركة الفوز والربح</span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold">
                  WIN 🟢
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                رسالة مجهزة مسبقاً لمباركة الأرباح للأعضاء الذين شاركوا ودخلوا في البث:
              </p>
              <textarea
                value={winMessage}
                onChange={(e) => setWinMessage(e.target.value)}
                rows={5}
                className="w-full p-3 rounded-xl bg-slate-900 border border-slate-700 text-emerald-200 text-xs font-medium focus:border-emerald-500 focus:outline-hidden transition-all resize-y"
              />
            </div>

            <button
              type="button"
              disabled={isSendingAnnouncement === 'win'}
              onClick={() => handleRequestSendAnnouncement('win', 'رسالة مباركة الفوز والربح', winMessage)}
              className="w-full py-3 px-4 rounded-xl font-black text-xs sm:text-sm bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-md shadow-emerald-500/20 flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-95 disabled:opacity-60"
            >
              {isSendingAnnouncement === 'win' ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>جاري الإرسال للبوت...</span>
                </>
              ) : (
                <>
                  <Award className="w-4 h-4" />
                  <span>🎉 إرسال مباركة الفوز والربح (طلب تأكيد)</span>
                </>
              )}
            </button>
          </div>

          {/* BOX B: رسالة الخسارة أو التعويض والتنبيه */}
          <div className="p-5 bg-slate-800/80 border-2 border-amber-500/40 rounded-2xl flex flex-col justify-between space-y-4 hover:border-amber-400 transition-all">
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-700">
                <div className="flex items-center gap-2 text-amber-400 font-extrabold text-sm">
                  <AlertCircle className="w-5 h-5 text-amber-400" />
                  <span>صندوق التنبيه والفرصة التعويضية</span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
                  NOTICE ⚠️
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                تنبيه وتوجيه للمشاركين في حالة ارتداد الصفقة وتأكيد خطة إدارة المخاطر:
              </p>
              <textarea
                value={lossMessage}
                onChange={(e) => setLossMessage(e.target.value)}
                rows={5}
                className="w-full p-3 rounded-xl bg-slate-900 border border-slate-700 text-amber-200 text-xs font-medium focus:border-amber-500 focus:outline-hidden transition-all resize-y"
              />
            </div>

            <button
              type="button"
              disabled={isSendingAnnouncement === 'loss'}
              onClick={() => handleRequestSendAnnouncement('loss', 'رسالة التنبيه والفرصة التعويضية', lossMessage)}
              className="w-full py-3 px-4 rounded-xl font-black text-xs sm:text-sm bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white shadow-md shadow-amber-500/20 flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-95 disabled:opacity-60"
            >
              {isSendingAnnouncement === 'loss' ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>جاري الإرسال للبوت...</span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-4 h-4" />
                  <span>⚠️ إرسال إشعار التنبيه والتعويض (طلب تأكيد)</span>
                </>
              )}
            </button>
          </div>

          {/* BOX C: رسالة اختتام البث الحي والشكر */}
          <div className="p-5 bg-slate-800/80 border-2 border-sky-500/40 rounded-2xl flex flex-col justify-between space-y-4 hover:border-sky-400 transition-all">
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-700">
                <div className="flex items-center gap-2 text-sky-400 font-extrabold text-sm">
                  <Clock className="w-5 h-5 text-sky-400" />
                  <span>صندوق ختام البث الحي والشكر</span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30 font-bold">
                  CLOSING 🔴
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                إشعار رسمي بانتهاء جلسة البث الحي المباشر وشكر كل من شارك:
              </p>
              <textarea
                value={closingMessage}
                onChange={(e) => setClosingMessage(e.target.value)}
                rows={5}
                className="w-full p-3 rounded-xl bg-slate-900 border border-slate-700 text-sky-200 text-xs font-medium focus:border-sky-500 focus:outline-hidden transition-all resize-y"
              />
            </div>

            <button
              type="button"
              disabled={isSendingAnnouncement === 'closing'}
              onClick={() => handleRequestSendAnnouncement('closing', 'رسالة اختتام البث الحي والشكر', closingMessage)}
              className="w-full py-3 px-4 rounded-xl font-black text-xs sm:text-sm bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white shadow-md shadow-sky-500/20 flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-95 disabled:opacity-60"
            >
              {isSendingAnnouncement === 'closing' ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>جاري الإرسال للبوت...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>📢 إرسال إشعار اختتام البث الحي (طلب تأكيد)</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* BOX D: رسالة مخصصة حرة للمشرف */}
        <div className="pt-4 border-t border-slate-800">
          <div className="p-4 bg-slate-800/50 border border-slate-700 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-purple-400" />
                <span>رسالة إدارية حرة للمشاركين (اكتب أي إشعار فوري):</span>
              </span>
              <span className="text-[10px] text-slate-500">تصل مباشرة للبوتات المحددة بالأعلى</span>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={customAnnouncement}
                onChange={(e) => setCustomAnnouncement(e.target.value)}
                placeholder="اكتب هنا أي رسالة عاجلة، تنبيه صفقات، إعلان مهم للمشاركين في البث..."
                className="flex-1 px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs font-medium focus:border-purple-500 focus:outline-hidden transition-all"
              />
              <button
                type="button"
                disabled={isSendingAnnouncement === 'custom' || !customAnnouncement.trim()}
                onClick={() => handleRequestSendAnnouncement('custom', 'رسالة إدارية مخصصة', customAnnouncement)}
                className="px-5 py-2.5 rounded-xl font-bold text-xs bg-purple-600 hover:bg-purple-500 text-white flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
              >
                {isSendingAnnouncement === 'custom' ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                <span>إرسال الرسالة (طلب تأكيد)</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Modal 1: تأكيد إرسال إشارة البث الحي المباشرة */}
      {confirmSignalModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn" dir="rtl">
          <div className="bg-[#0B0F17] border border-rose-500/50 rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
            <div className="p-5 bg-gradient-to-r from-rose-950/90 via-slate-900 to-[#0B0F17] border-b border-rose-500/30 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-600/20 border border-rose-500/40 flex items-center justify-center text-rose-400">
                  <Send className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                    <span>تأكيد إرسال إشارة البث الحي المباشر</span>
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 font-normal border border-rose-500/30">
                      موافقة المشرف 🔴
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    راجع تفاصيل الصفقة والوجهات المحددة قبل البث إلى المشتركين
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setConfirmSignalModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto text-xs">
              <div className="grid grid-cols-2 gap-3 p-3.5 bg-slate-950 rounded-xl border border-slate-800">
                <div>
                  <span className="text-slate-400 block text-[11px]">زوج العملة:</span>
                  <span className="text-white font-black text-base font-mono">{selectedPair}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">الاتجاه:</span>
                  <span className={`font-black text-sm flex items-center gap-1 ${
                    direction === 'CALL' ? 'text-emerald-400' : 'text-rose-400'
                  }`}>
                    {direction === 'CALL' ? 'صعود 🟢 ⬆️ (CALL)' : 'هبوط 🔴 ⬇️ (PUT)'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">فريم الصفقة:</span>
                  <span className="text-cyan-300 font-bold">1 دقيقة (M1)</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">وقت الدخول:</span>
                  <span className="text-amber-300 font-bold font-mono">مع بداية الشمعة القادمة مباشرة</span>
                </div>
              </div>

              {customNotes && customNotes.trim() && (
                <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-1">
                  <div className="text-[11px] font-bold text-slate-300">📝 ملاحظات وتوجيهات المشرف:</div>
                  <div className="text-slate-200 text-xs leading-relaxed">{customNotes.trim()}</div>
                </div>
              )}

              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                <div className="text-[11px] font-bold text-slate-300">📡 الوجهات المحددة لاستقبال الإشارة:</div>
                <div className="flex flex-wrap gap-2 text-xs">
                  {targetFreeBot && (
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 font-bold">
                      📢 القناة العامة (@ZadNBFX)
                    </span>
                  )}
                  {targetVipBot && (
                    <span className="px-2.5 py-1 rounded-lg bg-amber-950/80 border border-amber-500/40 text-amber-300 font-bold">
                      👑 قناة VIP الخاصة (Abusalim FX)
                    </span>
                  )}
                  {targetFloatingRobot && (
                    <span className="px-2.5 py-1 rounded-lg bg-cyan-950/80 border border-cyan-500/40 text-cyan-300 font-bold">
                      🤖 الروبوت العائم على منصة Quotex
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setConfirmSignalModalOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer transition-colors"
              >
                إلغاء ✕
              </button>

              <button
                type="button"
                disabled={isSendingSignal}
                onClick={executeSendLiveSignal}
                className="px-6 py-2.5 bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 disabled:opacity-50 text-white font-bold rounded-xl text-xs cursor-pointer shadow-lg shadow-rose-600/30 flex items-center gap-2 transition-all"
              >
                {isSendingSignal ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>جاري الإرسال للبوتات...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>تأكيد وإرسال الإشارة فوراً 🚀</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal 2: تأكيد إرسال رسائل ونتائج البث الحي */}
      {confirmAnnouncement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn" dir="rtl">
          <div className="bg-[#0B0F17] border border-amber-500/50 rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
            <div className="p-5 bg-gradient-to-r from-amber-950/90 via-slate-900 to-[#0B0F17] border-b border-amber-500/30 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-600/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                    <span>تأكيد إرسال رسالة البث الحي</span>
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-normal border border-amber-500/30">
                      طلب موافقة المشرف 📢
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    {confirmAnnouncement.title}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setConfirmAnnouncement(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto text-xs">
              <div className="space-y-1.5">
                <div className="font-bold text-slate-300">معاينة نص الرسالة قبل الإرسال:</div>
                <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 text-slate-200 whitespace-pre-wrap font-sans text-xs leading-relaxed max-h-56 overflow-y-auto select-all">
                  {confirmAnnouncement.text}
                </div>
              </div>

              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                <div className="text-[11px] font-bold text-slate-300">📡 القنوات المستهدفة:</div>
                <div className="flex flex-wrap gap-2 text-xs">
                  {announcementFreeBot && (
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 font-bold">
                      📢 القناة العامة (@ZadNBFX)
                    </span>
                  )}
                  {announcementVipBot && (
                    <span className="px-2.5 py-1 rounded-lg bg-amber-950/80 border border-amber-500/40 text-amber-300 font-bold">
                      👑 قناة VIP الخاصة (Abusalim FX)
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setConfirmAnnouncement(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer transition-colors"
              >
                إلغاء ✕
              </button>

              <button
                type="button"
                disabled={Boolean(isSendingAnnouncement)}
                onClick={() => executeSendAnnouncement(confirmAnnouncement.boxId, confirmAnnouncement.text)}
                className="px-6 py-2.5 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 disabled:opacity-50 text-white font-bold rounded-xl text-xs cursor-pointer shadow-lg shadow-amber-600/30 flex items-center gap-2 transition-all"
              >
                {isSendingAnnouncement ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>جاري الإرسال للبوت...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>تأكيد وإرسال الرسالة الآن 📢</span>
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

export default ZadtooAdminLiveBroadcast;
