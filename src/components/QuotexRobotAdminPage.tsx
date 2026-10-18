import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Activity,
  Bell,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Crown,
  DollarSign,
  ExternalLink,
  Globe,
  Key,
  Lock,
  Play,
  Plus,
  Power,
  Radio,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserPlus,
  X
} from 'lucide-react';
import type { VipSubscriber, SignalItem, LivePairSnapshot } from '../App';

export interface QuotexRobotSettings {
  isPublishedToVisitors: boolean;
  robotTitle: string;
  version: string;
  defaultMode: 'AUTO' | 'MANUAL';
  noMartingaleStrict: boolean;
  soundAlertsEnabled: boolean;
  autoSelectPair: boolean;
  autoSetExpiryM1: boolean;
  defaultStakeUsd: number;
}

interface QuotexRobotAdminPageProps {
  robotSettings: QuotexRobotSettings;
  setRobotSettings: React.Dispatch<React.SetStateAction<QuotexRobotSettings>>;
  subscribers?: VipSubscriber[];
  setSubscribers: React.Dispatch<React.SetStateAction<VipSubscriber[]>>;
  signals?: SignalItem[];
  liveMarket?: LivePairSnapshot[];
  onTriggerSignalNow: (preferredPair?: string) => void;
  onNavigateView: (view: 'visitor' | 'admin' | 'stats' | 'robot') => void;
  isAdmin?: boolean;
  onOpenLoginModal?: () => void;
}

export default function QuotexRobotAdminPage({
  robotSettings,
  setRobotSettings,
  subscribers = [],
  setSubscribers,
  signals = [],
  liveMarket = [],
  onTriggerSignalNow,
  onNavigateView,
  isAdmin = true,
  onOpenLoginModal
}: QuotexRobotAdminPageProps) {
  const safeSubscribers = subscribers || [];
  const safeSignals = signals || [];
  const safeLiveMarket = liveMarket || [];
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsSavedBadge, setSettingsSavedBadge] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Check if official global market is currently open
  const isGlobalMarketOpen = useMemo(() => {
    const now = new Date();
    const day = now.getUTCDay();
    const hour = now.getUTCHours();
    if (day === 6) return false;
    if (day === 5 && hour >= 21) return false;
    if (day === 0 && hour < 21) return false;
    return true;
  }, []);

  // Floating Widget Live Simulator State
  const [widgetMinimized, setWidgetMinimized] = useState(false);
  const [widgetClosed, setWidgetClosed] = useState<boolean>(false);

  const handleSetWidgetClosed = (closed: boolean) => {
    setWidgetClosed(closed);
    try {
      localStorage.setItem('zad_sim_widget_closed', String(closed));
    } catch {}
  };
  const [showWidgetInfo, setShowWidgetInfo] = useState(false);
  const [widgetMode, setWidgetMode] = useState<'AUTO' | 'MANUAL'>(robotSettings.defaultMode || 'MANUAL');
  const [widgetStakeUsd, setWidgetStakeUsd] = useState<number>(robotSettings.defaultStakeUsd || 5);
  const [widgetSoundOn, setWidgetSoundOn] = useState<boolean>(robotSettings.soundAlertsEnabled ?? true);
  const [selectedTestApiKey, setSelectedTestApiKey] = useState<string>('QX-ADMIN-MASTER-TEST');
  const [apiFeedResponse, setApiFeedResponse] = useState<any>(null);
  const [isTestingApi, setIsTestingApi] = useState<boolean>(false);

  // Floating Widget Draggable Position State
  const [widgetPosition, setWidgetPosition] = useState<{ x: number; y: number } | null>(null);
  const dragStartPos = useRef<{ mouseX: number; mouseY: number; initX: number; initY: number }>({ mouseX: 0, mouseY: 0, initX: 0, initY: 0 });

  const handleDragStart = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).tagName === 'BUTTON' || (e.target as HTMLElement).tagName === 'A') return;
    dragStartPos.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      initX: widgetPosition?.x || 0,
      initY: widgetPosition?.y || 0
    };
    const handleMouseMove = (moveEvent: MouseEvent) => {
      const dx = moveEvent.clientX - dragStartPos.current.mouseX;
      const dy = moveEvent.clientY - dragStartPos.current.mouseY;
      setWidgetPosition({
        x: dragStartPos.current.initX + dx,
        y: dragStartPos.current.initY + dy
      });
    };
    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if ((e.target as HTMLElement).tagName === 'BUTTON' || (e.target as HTMLElement).tagName === 'A') return;
    const touch = e.touches[0];
    dragStartPos.current = {
      mouseX: touch.clientX,
      mouseY: touch.clientY,
      initX: widgetPosition?.x || 0,
      initY: widgetPosition?.y || 0
    };
    const handleTouchMove = (moveEvent: TouchEvent) => {
      const t = moveEvent.touches[0];
      const dx = t.clientX - dragStartPos.current.mouseX;
      const dy = t.clientY - dragStartPos.current.mouseY;
      setWidgetPosition({
        x: dragStartPos.current.initX + dx,
        y: dragStartPos.current.initY + dy
      });
    };
    const handleTouchEnd = () => {
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
    window.addEventListener('touchmove', handleTouchMove);
    window.addEventListener('touchend', handleTouchEnd);
  };

  // Floating screen mode (fixed viewport float vs inside simulation canvas) - persistent in localStorage
  const [isScreenFloating, setIsScreenFloating] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('zad_sim_screen_floating');
      return saved !== null ? saved === 'true' : true; // Default to TRUE (persistently floating)
    } catch {
      return true;
    }
  });

  const toggleScreenFloating = (val?: boolean) => {
    setIsScreenFloating(prev => {
      const next = val !== undefined ? val : !prev;
      try {
        localStorage.setItem('zad_sim_screen_floating', String(next));
      } catch {}
      return next;
    });
  };

  // Animated moving dots for waiting state
  const [movingDotsCount, setMovingDotsCount] = useState(1);
  useEffect(() => {
    const timer = setInterval(() => {
      setMovingDotsCount(prev => (prev % 7) + 1);
    }, 350);
    return () => clearInterval(timer);
  }, []);
  const movingDots = '.'.repeat(movingDotsCount);

  // Simulated Quotex Platform State
  const [simQuotexPair, setSimQuotexPair] = useState<string>('EUR/USD');
  const [simQuotexExpiry, setSimQuotexExpiry] = useState<string>('M1 (01:00)');
  const [simAlertBanner, setSimAlertBanner] = useState<string | null>(null);
  const [simAutoTradeStatus, setSimAutoTradeStatus] = useState<
    'IDLE' | 'ALERT_RECEIVED' | 'PAIR_SELECTED' | 'TRADE_OPENED'
  >('IDLE');
  const [simCountdownSec, setSimCountdownSec] = useState<number>(0);

  // New Member Robot Key Generator Form
  const [newKeyMemberName, setNewKeyMemberName] = useState('');
  const [newKeyQuotexId, setNewKeyQuotexId] = useState('');
  const [newKeyExpiryDate, setNewKeyExpiryDate] = useState(() =>
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  );
  const [newKeyStake, setNewKeyStake] = useState<number>(5);
  const [newKeyMode, setNewKeyMode] = useState<'AUTO' | 'MANUAL'>('AUTO');
  const [isCreatingKey, setIsCreatingKey] = useState(false);
  const [searchMemberQuery, setSearchMemberQuery] = useState('');

  // Play crisp Web Audio beep alert when signal arrives
  const playRobotAlertSound = (type: 'signal' | 'open') => {
    if (!widgetSoundOn) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type === 'open' ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(type === 'open' ? 880 : 660, ctx.currentTime);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + (type === 'open' ? 0.28 : 0.18));
    } catch (_e) {
      // Ignore audio errors
    }
  };

  // Strictly 0-Martingale stats calculated from today's signals
  const robotZeroGaleStats = useMemo(() => {
    const directWins = safeSignals.filter(s => s.status === 'WIN').length;
    const directLosses = safeSignals.filter(s => s.status === 'LOSS' || s.status === 'WIN_GALE1').length;
    const pendingCount = safeSignals.filter(s => s.status === 'PENDING').length;
    const totalFinished = directWins + directLosses;
    const winRate = totalFinished > 0 ? Math.round((directWins / totalFinished) * 100) : 100;
    return {
      wins: directWins,
      losses: directLosses,
      pending: pendingCount,
      total: totalFinished,
      winRate
    };
  }, [safeSignals]);

  const latestSignal = safeSignals[0] || null;

  // Manual strictly user-click counters for Wins / Losses / Win Rate (Strictly manual, no program auto-increment, resets to 0 on robot close)
  const [manualWins, setManualWins] = useState<number>(0);
  const [manualLosses, setManualLosses] = useState<number>(0);

  const manualTotal = manualWins + manualLosses;
  const manualRate = manualTotal > 0 ? Math.round((manualWins / manualTotal) * 100) : 100;

  // Holy Quran audio player state (Sheikh Maher Al-Muaiqly)
  const [showQuranBar, setShowQuranBar] = useState<boolean>(false);
  const [isQuranPlaying, setIsQuranPlaying] = useState<boolean>(false);
  const quranAudioRef = useRef<HTMLAudioElement | null>(null);

  const handleToggleQuran = () => {
    if (!quranAudioRef.current) {
      const audio = new Audio('https://backup.qurango.net/radio/maher');
      audio.preload = 'none';
      audio.onplay = () => setIsQuranPlaying(true);
      audio.onpause = () => setIsQuranPlaying(false);
      audio.onerror = () => {
        audio.src = 'https://qurango.net/radio/maher';
        audio.play().catch(() => {});
      };
      quranAudioRef.current = audio;
    }

    if (!showQuranBar) {
      setShowQuranBar(true);
      quranAudioRef.current.play().then(() => setIsQuranPlaying(true)).catch(() => {});
    } else {
      if (isQuranPlaying) {
        quranAudioRef.current.pause();
      } else {
        quranAudioRef.current.play().catch(() => {});
      }
    }
  };

  const handleToggleQuranPlayPause = () => {
    if (!quranAudioRef.current) return;
    if (isQuranPlaying) {
      quranAudioRef.current.pause();
    } else {
      quranAudioRef.current.play().catch(() => {});
    }
  };

  const handleCloseQuranBar = () => {
    if (quranAudioRef.current) {
      quranAudioRef.current.pause();
      quranAudioRef.current.currentTime = 0;
    }
    setIsQuranPlaying(false);
    setShowQuranBar(false);
  };

  const handleCloseRobot = () => {
    setManualWins(0);
    setManualLosses(0);
    handleCloseQuranBar();
    handleSetWidgetClosed(true);
  };

  // Live Telegram connection test state
  const [isTestingTelegram, setIsTestingTelegram] = useState(false);
  const [telegramTestResult, setTelegramTestResult] = useState<{
    ok: boolean;
    message: string;
    messageId?: number;
  } | null>(null);

  const handleTestTelegramConnection = async () => {
    setIsTestingTelegram(true);
    setTelegramTestResult(null);
    try {
      const res = await fetch('/api/telegram/test-connection', { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        setTelegramTestResult({
          ok: true,
          message: data.message || 'تم إرسال رسالة الفحص بنجاح إلى القناة!',
          messageId: data.messageId
        });
      } else {
        setTelegramTestResult({
          ok: false,
          message: data.error || 'فشل الاتصال بتليجرام'
        });
      }
    } catch (e: any) {
      setTelegramTestResult({
        ok: false,
        message: e.message || 'خطأ في الاتصال بالخادم'
      });
    } finally {
      setIsTestingTelegram(false);
    }
  };

  // Fetch Live API Feed for the selected API Key
  const fetchLiveRobotApiFeed = async (keyToTest?: string) => {
    const activeKey = keyToTest ?? selectedTestApiKey;
    setIsTestingApi(true);
    try {
      const res = await fetch(`/api/quotex-robot/feed?apiKey=${encodeURIComponent(activeKey)}`);
      const data = await res.json();
      setApiFeedResponse(data);
    } catch (_e) {
      setApiFeedResponse({ ok: false, error: 'تعذر الاتصال بنقطة API' });
    } finally {
      setIsTestingApi(false);
    }
  };

  useEffect(() => {
    fetchLiveRobotApiFeed(selectedTestApiKey);
  }, [selectedTestApiKey, safeSignals.length]);

  // Simulate receiving signal -> Alert -> Auto selecting Pair & Expiry -> Auto opening trade at entry time
  const handleSimulateFullCycle = () => {
    const targetPair = latestSignal?.asset || safeLiveMarket[0]?.pair || 'EUR/USD';
    const targetDir = latestSignal?.direction || 'CALL';
    const targetMin = latestSignal?.entryTime || ':35';

    playRobotAlertSound('signal');
    setSimAutoTradeStatus('ALERT_RECEIVED');
    setSimAlertBanner(
      `🔔 إشارة جديدة وصلت عبر API: ${targetPair} (${
        targetDir === 'CALL' ? 'صعود 🟢' : 'هبوط 🔴'
      }) للدقيقة ${targetMin}`
    );
    setSimCountdownSec(3);

    setTimeout(() => {
      setSimQuotexPair(targetPair);
      setSimQuotexExpiry('M1 (01:00 دقيقة)');
      setSimAutoTradeStatus('PAIR_SELECTED');
      setSimAlertBanner(
        `🎯 تم تلقائياً اختيار الزوج (${targetPair}) وضبط الصلاحية (M1 - 1 دقيقة) بدون مضاعفات`
      );
      setSimCountdownSec(2);
    }, 1200);

    setTimeout(() => {
      if (widgetMode === 'AUTO') {
        playRobotAlertSound('open');
        setSimAutoTradeStatus('TRADE_OPENED');
        setSimAlertBanner(
          `🚀 حان وقت الصفقة (${targetMin})! فتح الروبوت صفقة ${
            targetDir === 'CALL' ? 'صعود CALL 🟢' : 'هبوط PUT 🔴'
          } تلقائياً على ${targetPair} بقيمة $${widgetStakeUsd} (0 مضاعفات)`
        );
        setSimCountdownSec(0);
        // بعد انتهاء الصفقة: لا تظهر الصفقة المنتهية بل تعود فوراً لحالة انتظار إشارة بنقاط متحركة
        setTimeout(() => {
          setSimAutoTradeStatus('IDLE');
          setSimAlertBanner(null);
        }, 5000);
      } else {
        setSimAlertBanner(
          `✋ الوضع اليدوي مفعل: الزوج (${targetPair}) والصلاحية جاهزان — اضغط زر الصعود أو الهبوط للتنفيذ`
        );
        setSimCountdownSec(0);
        setTimeout(() => {
          setSimAutoTradeStatus('IDLE');
          setSimAlertBanner(null);
        }, 6000);
      }
    }, 2800);
  };

  const handleSaveRobotSettings = async (nextSettings?: Partial<QuotexRobotSettings>) => {
    const updated: QuotexRobotSettings = {
      ...robotSettings,
      ...nextSettings,
      noMartingaleStrict: true
    };
    setRobotSettings(updated);
    setIsSavingSettings(true);
    try {
      const res = await fetch('/api/robot-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
      const data = await res.json();
      if (data.ok && data.robotSettings) {
        setRobotSettings(data.robotSettings);
        setSettingsSavedBadge(true);
        setTimeout(() => setSettingsSavedBadge(false), 2500);
      }
    } catch (_e) {
      // Ignore
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleCreateMemberKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyMemberName.trim()) return;
    setIsCreatingKey(true);
    try {
      const res = await fetch('/api/quotex-robot/create-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newKeyMemberName.trim(),
          brokerAccountId: newKeyQuotexId.trim() || 'QX-TRADER',
          expiryDate: newKeyExpiryDate,
          tradeStake: newKeyStake,
          defaultMode: newKeyMode
        })
      });
      const data = await res.json();
      if (data.ok && data.subscriber) {
        setSubscribers(prev => [data.subscriber, ...prev]);
        setSelectedTestApiKey(data.subscriber.robotApiKey || 'QX-ADMIN-MASTER-TEST');
        setNewKeyMemberName('');
        setNewKeyQuotexId('');
      }
    } catch (_e) {
      // Ignore
    } finally {
      setIsCreatingKey(false);
    }
  };

  const handleUpdateSubscriberRobot = async (
    subId: string,
    payload: {
      status?: 'ACTIVE' | 'PENDING' | 'BANNED';
      robotEnabled?: boolean;
      robotExpiryDate?: string;
      robotDefaultMode?: 'AUTO' | 'MANUAL';
      robotTradeStake?: number;
      regenerateRobotApiKey?: boolean;
    }
  ) => {
    try {
      const res = await fetch(`/api/subscribers/${subId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.ok && data.subscriber) {
        setSubscribers(prev => prev.map(s => (s.id === subId ? data.subscriber : s)));
      }
    } catch (_e) {
      // Ignore
    }
  };

  const handleApproveSubscriber = async (subId: string) => {
    const target = subscribers.find(s => s.id === subId);
    const expDate =
      target?.robotExpiryDate ||
      target?.expiryDate ||
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await handleUpdateSubscriberRobot(subId, {
      status: 'ACTIVE',
      robotEnabled: true,
      robotExpiryDate: expDate
    });
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDownloadUserscript = () => {
    try {
      const blob = new Blob([generatedQuotexUserscript], { type: 'text/javascript;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'zad-broker-robot.user.js';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch(e) {
      console.error('Download error:', e);
    }
  };

  // Primary Official Domain & Current App Origin
  const officialDomain = 'https://fx.zadtoo.com';
  const appOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://fx.zadtoo.com';

  // Ready-to-inject Tampermonkey / Console Floating Universal Broker Robot Script for any selected API Key / Broker Account ID
  const generatedQuotexUserscript = useMemo(() => {
    const activeKey = selectedTestApiKey || 'QX-ADMIN-MASTER-TEST';
    return `// ==UserScript==
// @name         روبوت ZAD FX - الروبوت العائم السحابي الشامل (Universal Cloud Broker Robot)
// @namespace    https://fx.zadtoo.com
// @version      3.6
// @description  روبوت عائم سحابي مستقل 100% يعمل مباشرة على كيوتكس وكافة المنصات دون الحاجة لفتح أي صفحة أخرى - مزامنة فورية وتنبيهات صوتية ومرئية
// @updateURL    ${appOrigin}/api/quotex-robot/zad-broker-robot.user.js
// @downloadURL  ${appOrigin}/api/quotex-robot/zad-broker-robot.user.js
// @match        *://*.qxbroker.com/*
// @match        *://qxbroker.com/*
// @match        *://*.quotex.io/*
// @match        *://quotex.io/*
// @match        *://*.broker-qx.pro/*
// @match        *://broker-qx.pro/*
// @match        *://*.market-qx.pro/*
// @match        *://market-qx.pro/*
// @match        *://*.market-qx.com/*
// @match        *://market-qx.com/*
// @match        *://*.quotex-broker.com/*
// @match        *://quotex-broker.com/*
// @match        *://*.quotex-market.com/*
// @match        *://quotex-market.com/*
// @match        *://*.quotex.com/*
// @match        *://quotex.com/*
// @match        *://*.qxplus.com/*
// @match        *://qxplus.com/*
// @match        *://*.qx-market.com/*
// @match        *://qx-market.com/*
// @match        *://*.pocketoption.com/*
// @match        *://pocketoption.com/*
// @match        *://*.po.market/*
// @match        *://po.market/*
// @match        *://*.po.trade/*
// @match        *://po.trade/*
// @match        *://*.olymptrade.com/*
// @match        *://olymptrade.com/*
// @match        *://*.iqoption.com/*
// @match        *://iqoption.com/*
// @match        *://*.binomo.com/*
// @match        *://binomo.com/*
// @match        *://*.run.app/*
// @match        *://*.zadtoo.com/*
// @match        *://zadtoo.com/*
// @match        *://localhost:*/*
// @match        *://127.0.0.1:*/*
// @match        *://*/*
// @include      *://*quotex*/*
// @include      *://*qxbroker*/*
// @include      *://*broker-qx*/*
// @include      *://*market-qx*/*
// @include      *://*qx*/*
// @include      *://*pocketoption*/*
// @include      *://*po.market*/*
// @include      *://*po.trade*/*
// @include      *://*zadtoo*/*
// @include      *
// @allFrames    false
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addValueChangeListener
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @connect      *
// @run-at       document-end
// ==/UserScript==

(function() {
  'use strict';
  // تصفية الإطارات الفرعية غير المرئية أو إعلانات التتبع
  try {
    if (window.self !== window.top) {
      if (window.name && (window.name.includes("google_ads") || window.name.includes("aswift") || window.name.includes("analytics"))) {
        return;
      }
      if (window.innerWidth > 0 && window.innerWidth < 350 && window.innerHeight > 0 && window.innerHeight < 350) {
        return;
      }
    }
  } catch(e) {}

  const API_BASE = "${appOrigin}";

  // الكشف الذكي التلقائي عن رقم حساب البروكر من صفحة كيوتكس أو بوكيت أوبشن
  function detectBrokerAccountId() {
    try {
      const idSelectors = [
        '.usermenu__info-id',
        '.user-info__id',
        '.profile-user-id',
        '.header-profile__id',
        '[data-user-id]',
        '.account-id',
        '.profile__id',
        '.user-id'
      ];
      for (const sel of idSelectors) {
        const el = document.querySelector(sel);
        if (el && el.textContent) {
          const m = el.textContent.match(/\\b\\d{5,12}\\b/);
          if (m) return m[0];
        }
      }
      const userMenu = document.querySelector('.usermenu, .header__user, .user-profile, .user-info');
      if (userMenu && userMenu.textContent) {
        const m = userMenu.textContent.match(/(?:ID|UID|معرف|حساب)[:\\s#]*(\\d{5,12})/i);
        if (m) return m[1];
      }
    } catch(e) {}
    return null;
  }

  // استخراج مفتاح أو رقم حساب العضو المخصص
  let savedKey = localStorage.getItem("zad_broker_key") || localStorage.getItem("zad_vip_member_id") || "";
  if (!savedKey || savedKey.includes("\${") || savedKey === "undefined" || savedKey === "null") {
    savedKey = "";
  }
  if (!savedKey) {
    const autoId = detectBrokerAccountId();
    if (autoId) {
      savedKey = autoId;
      try { localStorage.setItem("zad_broker_key", autoId); } catch(e) {}
    }
  }
  let MEMBER_IDENTIFIER = savedKey || "${activeKey}";
  // بمجرد تثبيت البرنامج العائم يكون على وضع التداول اليدوي وليس الآلي افتراضياً
  let ROBOT_MODE = localStorage.getItem("zad_robot_mode") || "MANUAL"; // "MANUAL" | "AUTO"
  let LAST_EXECUTED_SIG_ID = "";
  let LAST_ALERTED_SIG_ID = "";
  let lastDataReceivedTime = 0;
  let serverTargetPair = "EUR/JPY"; // الزوج الثابت اليومي الافتراضي من لوحة المشرف
  let serverMarketOpen = null;

  // التحقق من حالة فتح السوق العالمي (الفوركس يغلق الجمعة 21:00 UTC ويفتح الأحد 21:00 UTC)
  function isForexMarketOpen() {
    if (typeof serverMarketOpen === "boolean") return serverMarketOpen;
    const now = new Date();
    const day = now.getUTCDay(); // 0 = Sun, 5 = Fri, 6 = Sat
    const hour = now.getUTCHours();
    if (day === 6) return false; // السبت مغلق
    if (day === 5 && hour >= 21) return false; // الجمعة بعد 21:00 UTC مغلق
    if (day === 0 && hour < 21) return false; // الأحد قبل 21:00 UTC مغلق
    return true;
  }

  const currentHost = window.location.hostname.toLowerCase();
  const isWebPlatformHub = currentHost.includes("run.app") || currentHost.includes("zadtoo.com") || currentHost.includes("localhost") || currentHost.includes("127.0.0.1");

  // مزامنة التبويب في الخلفية مع ذاكرة تامبرمونكي المشتركة
  if (isWebPlatformHub) {
    console.log("%c[روبوت ZAD FX] متصل ومتزامن بالسيرفر ⚡", "color:#10b981;font-weight:bold;font-size:12px;");
    async function syncHubToTampermonkey() {
      try {
        const res = await fetch(window.location.origin + "/api/quotex-robot/feed?apiKey=" + encodeURIComponent(MEMBER_IDENTIFIER));
        if (res.ok) {
          const data = await res.json();
          if (data && data.ok && typeof GM_setValue === "function") {
            GM_setValue("zad_robot_live_payload", JSON.stringify(data));
            GM_setValue("zad_robot_last_ping", Date.now());
          }
        }
      } catch(e) {}
    }
    syncHubToTampermonkey();
    setInterval(syncHubToTampermonkey, 1500);
  }

  // =========================================================================
  // المحور الثاني: الروبوت العائم على شاشة منصة البروكر (Quotex / Pocket Option)
  // يعمل مستقلاً 100% دون فتح أي موقع خارجي
  // =========================================================================
  const brokerName = currentHost.includes("pocketoption") || currentHost.includes("po.market") ? "Pocket Option"
    : currentHost.includes("olymptrade") ? "Olymp Trade"
    : currentHost.includes("iqoption") ? "IQ Option"
    : currentHost.includes("binomo") ? "Binomo"
    : "Quotex";

  // دالة توليد نغمة التنبيه الصوتية عالية النقاء (Web Audio API Chime)
  function playSignalChime(isCall) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') ctx.resume();
      
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = isCall ? "sine" : "triangle";
      osc.frequency.setValueAtTime(isCall ? 587.33 : 440, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(isCall ? 880 : 330, ctx.currentTime + 0.25);
      gain.gain.setValueAtTime(0.35, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.65);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.65);
    } catch(e) {}
  }

  // إنشاء نافذة الروبوت العائمة والصغيرة الشاملة
  const widget = document.createElement("div");
  widget.id = "zad-universal-floating-robot";
  widget.dir = "rtl";
  // إذا كان على موقع المنصة نفسها zadtoo.com، يوضع أسفل اليسار كي لا يحجب زر دخول المشرف أو الهيدر
  let savedPosLeft = localStorage.getItem("zad_robot_pos_left");
  let savedPosTop = localStorage.getItem("zad_robot_pos_top");
  let posCss = isWebPlatformHub
    ? "bottom:24px;left:24px;"
    : "top:70px;right:20px;";
  if (savedPosLeft && savedPosTop && !isWebPlatformHub) {
    const l = parseInt(savedPosLeft, 10);
    const t = parseInt(savedPosTop, 10);
    if (!isNaN(l) && !isNaN(t) && l > 0 && l < window.innerWidth - 60 && t > 0 && t < window.innerHeight - 60) {
      posCss = "top:" + t + "px;left:" + l + "px;right:auto;bottom:auto;";
    }
  }
  widget.style.cssText = "position:fixed !important;" + posCss + "z-index:2147483647 !important;width:295px;background:#0B0F17 !important;border:1.5px solid #10b981 !important;border-radius:14px !important;color:#f8fafc !important;font-family:system-ui,-apple-system,sans-serif !important;box-shadow:0 15px 35px rgba(0,0,0,0.85) !important;padding:12px !important;user-select:none !important;font-size:12px !important;transition:border-color 0.3s, box-shadow 0.3s;display:block !important;visibility:visible !important;opacity:1 !important;pointer-events:auto !important;";
  widget.innerHTML = \`
    <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #1e293b;padding-bottom:8px;margin-bottom:8px;cursor:move;" id="zad-robot-header">
      <div style="display:flex;align-items:center;gap:6px;">
        <span style="width:9px;height:9px;border-radius:50%;background:#10b981;box-shadow:0 0 6px #10b981;display:inline-block;" id="zad-status-dot"></span>
        <strong style="font-size:12px;color:#fff;">روبوت ZAD FX</strong>
        <span style="font-size:10px;color:#38bdf8;background:#0c4a6e;padding:1px 5px;border-radius:4px;">\${brokerName}</span>
      </div>
      <div style="display:flex;align-items:center;gap:4px;">
        <button id="zad-info-btn" style="background:#1e293b;color:#38bdf8;border:1px solid #334155;border-radius:6px;padding:1px 5px;font-size:10.5px;font-weight:bold;cursor:pointer;" title="معلومات وتطوير">ℹ️ info</button>
        <button id="zad-quran-btn" style="background:#064e3b;color:#6ee7b7;border:1px solid #059669;border-radius:6px;padding:1px 5px;font-size:10.5px;font-weight:bold;cursor:pointer;display:flex;align-items:center;gap:2px;" title="استماع للقرآن الكريم — الشيخ ماهر المعيقلي">🎧 قرآن</button>
        <button id="zad-close-btn" style="background:transparent;border:none;color:#94a3b8;font-size:13px;font-weight:bold;cursor:pointer;padding:0 3px;line-height:1;" title="إغلاق">✕</button>
      </div>
    </div>

    <!-- نافذة معلومات المبرمج والموقع والقناة الرسمية -->
    <div id="zad-info-panel" style="display:none;background:#0F172A;border:1px solid #38bdf8;border-radius:10px;padding:8px;margin-bottom:8px;font-size:11px;line-height:1.6;color:#e2e8f0;">
      <div style="font-weight:bold;color:#38bdf8;margin-bottom:4px;display:flex;justify-content:space-between;">
        <span>ℹ️ معلومات الروبوت</span>
        <span id="zad-close-info" style="cursor:pointer;color:#94a3b8;">✕</span>
      </div>
      <div>🌐 الموقع: <a href="https://fx.zadtoo.com" target="_blank" style="color:#10b981;text-decoration:none;font-weight:bold;">fx.zadtoo.com</a></div>
      <div>📢 القناة الرسمية: <a href="https://t.me/ZadNBFX" target="_blank" style="color:#38bdf8;text-decoration:none;font-weight:bold;">ZAD FX @ZadNBFX</a></div>
      <div style="color:#fbbf24;font-size:10.5px;margin-top:2px;border-top:1px dashed #334155;padding-top:2px;">👨‍💻 إعداد وبرمجة: <b>Nabil Barakat</b></div>
    </div>

    <!-- شريط العضو وتعديل المفتاح/رقم الحساب -->
    <div style="font-size:10.5px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;color:#cbd5e1;background:#0f172a;padding:5px 8px;border-radius:6px;border:1px solid #1e293b;">
      <div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:175px;">
        <span>العضو: <b id="zad-robot-member" style="color:#fbbf24;">جاري المزامنة...</b></span>
      </div>
      <div style="display:flex;align-items:center;gap:4px;">
        <span id="zad-robot-days" style="color:#34d399;font-weight:bold;">--</span>
        <button id="zad-change-key-btn" style="background:#1e293b;color:#38bdf8;border:1px solid #334155;border-radius:4px;padding:1px 5px;font-size:9.5px;font-weight:bold;cursor:pointer;" title="تغيير أو إدخال رقم حساب كيوتكس (ID)">🔑 ID</button>
      </div>
    </div>

    <!-- مشغل القرآن الكريم المصغر (الشيخ ماهر المعيقلي) أسفل اسم العضو -->
    <div id="zad-quran-panel" style="display:none;background:linear-gradient(135deg,#064e3b 0%,#022c22 100%);border:1px solid #10b981;border-radius:8px;padding:4px 8px;margin-bottom:6px;font-size:10.5px;color:#ecfdf5;box-shadow:0 4px 12px rgba(16,185,129,0.25);">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;">
        <div style="display:flex;align-items:center;gap:5px;overflow:hidden;">
          <span id="zad-quran-dot" style="width:7px;height:7px;border-radius:50%;background:#34d399;box-shadow:0 0 6px #34d399;display:inline-block;"></span>
          <span style="font-weight:bold;color:#a7f3d0;white-space:nowrap;font-size:10px;">📖 القرآن — الشيخ ماهر المعيقلي</span>
        </div>
        <div style="display:flex;align-items:center;gap:4px;">
          <button id="zad-quran-playpause" style="background:#047857;color:#fff;border:none;border-radius:4px;padding:1px 5px;font-size:9.5px;cursor:pointer;font-weight:bold;">⏸️</button>
          <button id="zad-quran-close" style="background:transparent;border:none;color:#94a3b8;cursor:pointer;font-size:12px;font-weight:bold;padding:0 2px;" title="إغلاق القرآن">✕</button>
        </div>
      </div>
    </div>

    <div style="font-size:9.5px;color:#94a3b8;margin-bottom:6px;text-align:center;" id="zad-conn-badge">
      ⚡ اتصال سحابي سريالي مباشر (Firestore Cloud)
    </div>

    <!-- أزرار تبديل وضع التداول: اليدوي مفعل افتراضياً بمجرد التثبيت -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-bottom:6px;">
      <button id="zad-mode-auto" style="padding:5px;font-size:11px;font-weight:bold;border-radius:7px;border:1px solid \${ROBOT_MODE === 'AUTO' ? '#10b981' : '#334155'};background:\${ROBOT_MODE === 'AUTO' ? '#10b981' : '#1e293b'};color:\${ROBOT_MODE === 'AUTO' ? '#020617' : '#cbd5e1'};cursor:pointer;">🤖 تداول آلي</button>
      <button id="zad-mode-manual" style="padding:5px;font-size:11px;font-weight:bold;border-radius:7px;border:1px solid \${ROBOT_MODE === 'MANUAL' ? '#f59e0b' : '#334155'};background:\${ROBOT_MODE === 'MANUAL' ? '#f59e0b' : '#1e293b'};color:\${ROBOT_MODE === 'MANUAL' ? '#020617' : '#cbd5e1'};cursor:pointer;">🖐️ تداول يدوي</button>
    </div>

    <!-- صندوق الإشارة: يعرض فقط 'بانتظار إشارة...' أو 'مغلق السوق' عند إغلاق السوق -->
    <div style="background:#111827;border:1px solid #1e293b;border-radius:9px;padding:8px;margin-bottom:8px;font-size:11px;" id="zad-signal-box">
      <div id="zad-robot-signal" style="margin-bottom:4px;font-size:12px;"></div>
      
      <div id="zad-robot-countdown" style="display:none;background:#032b44;color:#38bdf8;padding:5px 8px;border-radius:6px;font-weight:extrabold;text-align:center;margin-bottom:5px;font-size:12px;border:1px solid #0284c7;">
        ⏳ العد التنازلي: <span id="zad-countdown-val" style="color:#fde047;font-size:14px;font-family:monospace;">--</span>
      </div>

      <div id="zad-manual-trigger-container" style="display:none;margin-bottom:5px;">
        <button id="zad-manual-trade-btn" style="width:100%;padding:7px;font-size:12px;font-weight:extrabold;border-radius:8px;background:#10b981;color:#020617;border:none;cursor:pointer;animation:pulse 1.5s infinite;">
          🚀 اضغط هنا للدخول فوراً في المنصة!
        </button>
      </div>

      <div id="zad-robot-action" style="color:#94a3b8;font-size:10.5px;text-align:center;">جاهز لاستقبال الإشارة القادمة وتنفيذها بالثانية</div>
    </div>

    <!-- 3 مربعات ملونة مؤطرة باللون حسب النتيجة (ربح - خسارة - النسبة) النقر المباشر دون توضيح وبدون علامة + -->
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px;margin-bottom:6px;text-align:center;">
      <div id="zad-box-win" style="background:rgba(16,185,129,0.12);border:1.5px solid #10b981;border-radius:9px;padding:6px 2px;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;">
        <span style="color:#34d399;font-size:10px;font-weight:bold;">✅ ربح</span>
        <b id="zad-robot-wins" style="font-size:15px;color:#fff;font-family:monospace;margin-top:2px;">0</b>
      </div>

      <div id="zad-box-loss" style="background:rgba(239,68,68,0.12);border:1.5px solid #ef4444;border-radius:9px;padding:6px 2px;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;">
        <span style="color:#f87171;font-size:10px;font-weight:bold;">❌ خسارة</span>
        <b id="zad-robot-losses" style="font-size:15px;color:#fff;font-family:monospace;margin-top:2px;">0</b>
      </div>

      <div style="background:rgba(245,158,11,0.12);border:1.5px solid #f59e0b;border-radius:9px;padding:6px 2px;display:flex;flex-direction:column;align-items:center;justify-content:center;">
        <span style="color:#fbbf24;font-size:10px;font-weight:bold;">🎯 النسبة</span>
        <b id="zad-robot-rate" style="font-size:14px;color:#fbbf24;font-family:monospace;margin-top:2px;">100%</b>
      </div>
    </div>
  \`;
  // زر إظهار الروبوت في حال التصغير (Launcher)
  let launcher = document.getElementById("zad-robot-launcher");
  if (!launcher) {
    launcher = document.createElement("div");
    launcher.id = "zad-robot-launcher";
    const launcherPos = isWebPlatformHub
      ? "bottom:24px;left:24px;"
      : "bottom:24px;right:24px;";
    launcher.style.cssText = "display:none;position:fixed !important;" + launcherPos + "z-index:2147483647 !important;background:#0f172a !important;border:2px solid #10b981 !important;color:#10b981 !important;padding:8px 16px !important;border-radius:24px !important;font-size:12px !important;font-weight:900 !important;cursor:pointer !important;box-shadow:0 8px 25px rgba(0,0,0,0.85) !important;font-family:system-ui,-apple-system,sans-serif !important;user-select:none !important;";
    launcher.innerHTML = "🤖 إظهار روبوت ZAD FX";
    launcher.onclick = () => {
      isWidgetUserMinimized = false;
      widget.style.setProperty("display", "block", "important");
      widget.style.setProperty("visibility", "visible", "important");
      widget.style.setProperty("opacity", "1", "important");
      launcher.style.setProperty("display", "none", "important");
    };
  }

  // ثبات ظهور الروبوت دائماً (لا يتلاشى أبداً عند أي تحديث أو إعادة تحميل)
  let isWidgetUserMinimized = false;

  function mountRobotSafely() {
    try {
      const mountTarget = document.body || document.documentElement;
      if (!mountTarget) {
        setTimeout(mountRobotSafely, 100);
        return;
      }
      const existing = document.getElementById("zad-universal-floating-robot");
      if (!existing || !mountTarget.contains(existing)) {
        mountTarget.appendChild(widget);
      }
      if (launcher && !document.getElementById("zad-robot-launcher")) {
        mountTarget.appendChild(launcher);
      }

      // تثبيت الظهور الدائم للروبوت ومنع تلاشيه عند أي تحديث في الشارت أو الصفحة
      if (!isWidgetUserMinimized) {
        widget.style.setProperty("display", "block", "important");
        widget.style.setProperty("visibility", "visible", "important");
        widget.style.setProperty("opacity", "1", "important");
        widget.style.setProperty("z-index", "2147483647", "important");
        widget.style.setProperty("pointer-events", "auto", "important");
        if (launcher) launcher.style.setProperty("display", "none", "important");
      } else {
        widget.style.setProperty("display", "none", "important");
        if (launcher) {
          launcher.style.setProperty("display", "block", "important");
          launcher.style.setProperty("z-index", "2147483647", "important");
        }
      }

      // التحقق التلقائي لضمان وجود الروبوت داخل مجال الرؤية للشاشة وعدم اختفائه
      try {
        const rect = widget.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          const winW = window.innerWidth || document.documentElement.clientWidth || 1000;
          const winH = window.innerHeight || document.documentElement.clientHeight || 800;
          if (rect.right < 50 || rect.bottom < 50 || rect.left > winW - 30 || rect.top > winH - 30) {
            widget.style.top = isWebPlatformHub ? "auto" : "70px";
            widget.style.right = isWebPlatformHub ? "auto" : "20px";
            widget.style.bottom = isWebPlatformHub ? "24px" : "auto";
            widget.style.left = isWebPlatformHub ? "24px" : "auto";
          }
        }
      } catch(e) {}
    } catch(err) {
      console.warn("[ZAD Robot] Mount keeper notice:", err);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountRobotSafely);
  } else {
    mountRobotSafely();
  }
  setTimeout(mountRobotSafely, 150);
  setTimeout(mountRobotSafely, 500);
  setTimeout(mountRobotSafely, 1500);

  // حارس الثبات الدوري الدائم: يفحص كل 600 ميلي ثانية ويعيد حقن الروبوت فوراً إن حاولت المنصة إزالته
  setInterval(mountRobotSafely, 600);

  // مراقب طفرات الـ DOM (MutationObserver): يعيد حقن الروبوت فوراً في جزء من الملي ثانية إذا قامت المنصة بإعادة رسم الصفحة
  try {
    const domWatcher = new MutationObserver(() => {
      const el = document.getElementById("zad-universal-floating-robot");
      if (!el || !document.body || !document.body.contains(el)) {
        mountRobotSafely();
      }
    });
    const targetRoot = document.documentElement || document.body;
    if (targetRoot) {
      domWatcher.observe(targetRoot, { childList: true, subtree: true });
    }
  } catch(e) {}

  window.addEventListener("resize", mountRobotSafely);
  window.addEventListener("focus", mountRobotSafely);
  window.addEventListener("popstate", mountRobotSafely);
  window.addEventListener("load", mountRobotSafely);

  // إدارة عدادات الأرباح والخسائر يدوياً بالنقر المباشر فقط دون السماح للبرنامج بالإضافة وتصفيرها عند الإغلاق
  let manualWins = 0;
  let manualLosses = 0;

  function updateStatsDisplay() {
    const total = manualWins + manualLosses;
    const rate = total > 0 ? Math.round((manualWins / total) * 100) : 100;
    const wEl = document.getElementById("zad-robot-wins");
    const lEl = document.getElementById("zad-robot-losses");
    const rEl = document.getElementById("zad-robot-rate");
    if (wEl) wEl.innerText = manualWins;
    if (lEl) lEl.innerText = manualLosses;
    if (rEl) rEl.innerText = rate + "%";
  }

  const bWin = document.getElementById("zad-box-win");
  if (bWin) {
    bWin.onclick = () => {
      manualWins += 1;
      updateStatsDisplay();
    };
  }

  const bLoss = document.getElementById("zad-box-loss");
  if (bLoss) {
    bLoss.onclick = () => {
      manualLosses += 1;
      updateStatsDisplay();
    };
  }

  updateStatsDisplay();

  // تأثير حركة النقاط بانتظار الإشارة
  let dotCounter = 0;
  setInterval(() => {
    dotCounter = (dotCounter + 1) % 7;
    const dotEl = document.getElementById("zad-dot-anim");
    if (dotEl) dotEl.innerText = ".".repeat(dotCounter + 1);
  }, 400);

  // إمكانية تغيير رقم الحساب أو المفتاح بنقرة زر
  const changeKeyBtn = document.getElementById("zad-change-key-btn");
  if (changeKeyBtn) {
    changeKeyBtn.onclick = () => {
      const currentStored = localStorage.getItem("zad_broker_key") || "";
      const defaultPrompt = (currentStored && !currentStored.includes("\${"))
        ? currentStored
        : (MEMBER_IDENTIFIER && !MEMBER_IDENTIFIER.includes("\${") && MEMBER_IDENTIFIER !== "QX-ADMIN-MASTER-TEST" ? MEMBER_IDENTIFIER : "");
      const input = prompt("ادخل رقم حساب كيوتكس الخاص بك (Quotex ID) أو مفتاح الروبوت الخاص بك من المشرف:", defaultPrompt);
      if (input && input.trim()) {
        MEMBER_IDENTIFIER = input.trim();
        localStorage.setItem("zad_broker_key", MEMBER_IDENTIFIER);
        document.getElementById("zad-robot-member").innerText = "جاري التحقق من السيرفر...";
        checkCloudFirestoreStream();
        checkDirectApi();
      }
    };
  }

  // وظيفة السحب والتحريك الحر للنافذة (Draggable) بالماوس واللمس
  let isDragging = false;
  let startX = 0, startY = 0, initialLeft = 0, initialTop = 0;
  const header = document.getElementById("zad-robot-header");

  if (header) {
    header.onmousedown = (e) => {
      if (e.target.tagName === 'BUTTON' || e.target.tagName === 'A' || e.target.id === 'zad-info-btn' || e.target.id === 'zad-test-btn') return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = widget.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;
      widget.style.right = 'auto';
      widget.style.left = initialLeft + 'px';
      widget.style.top = initialTop + 'px';
      document.body.style.userSelect = 'none';
    };

    document.onmousemove = (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      let newLeft = Math.max(10, Math.min(window.innerWidth - widget.offsetWidth - 10, initialLeft + dx));
      let newTop = Math.max(10, Math.min(window.innerHeight - widget.offsetHeight - 10, initialTop + dy));
      widget.style.left = newLeft + 'px';
      widget.style.top = newTop + 'px';
    };

    document.onmouseup = () => {
      isDragging = false;
      document.body.style.userSelect = '';
      try {
        const rect = widget.getBoundingClientRect();
        localStorage.setItem("zad_robot_pos_left", String(Math.round(rect.left)));
        localStorage.setItem("zad_robot_pos_top", String(Math.round(rect.top)));
      } catch(e) {}
    };

    header.ontouchstart = (e) => {
      if (e.target.tagName === 'BUTTON' || e.target.id === 'zad-info-btn' || e.target.id === 'zad-test-btn') return;
      const touch = e.touches[0];
      isDragging = true;
      startX = touch.clientX;
      startY = touch.clientY;
      const rect = widget.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;
      widget.style.right = 'auto';
      widget.style.left = initialLeft + 'px';
      widget.style.top = initialTop + 'px';
    };

    document.ontouchmove = (e) => {
      if (!isDragging) return;
      const touch = e.touches[0];
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      let newLeft = Math.max(10, Math.min(window.innerWidth - widget.offsetWidth - 10, initialLeft + dx));
      let newTop = Math.max(10, Math.min(window.innerHeight - widget.offsetHeight - 10, initialTop + dy));
      widget.style.left = newLeft + 'px';
      widget.style.top = newTop + 'px';
    };

    document.ontouchend = () => {
      isDragging = false;
      try {
        const rect = widget.getBoundingClientRect();
        localStorage.setItem("zad_robot_pos_left", String(Math.round(rect.left)));
        localStorage.setItem("zad_robot_pos_top", String(Math.round(rect.top)));
      } catch(e) {}
    };
  }

  // تبديل ظهور نافذة الـ Info
  const infoBtn = document.getElementById("zad-info-btn");
  const infoPanel = document.getElementById("zad-info-panel");
  const closeInfo = document.getElementById("zad-close-info");
  if (infoBtn && infoPanel) {
    infoBtn.onclick = () => { infoPanel.style.display = infoPanel.style.display === "none" ? "block" : "none"; };
    if (closeInfo) closeInfo.onclick = () => { infoPanel.style.display = "none"; };
  }

  // مشغل القرآن الكريم المباشر بصوت الشيخ ماهر المعيقلي
  let quranAudio = null;
  const quranBtn = document.getElementById("zad-quran-btn");
  const quranPanel = document.getElementById("zad-quran-panel");
  const quranPlayPause = document.getElementById("zad-quran-playpause");
  const quranClose = document.getElementById("zad-quran-close");

  function initQuranAudio() {
    if (!quranAudio) {
      quranAudio = new Audio("https://backup.qurango.net/radio/maher");
      quranAudio.onerror = () => {
        if (quranAudio) quranAudio.src = "https://qurango.net/radio/maher";
      };
    }
  }

  if (quranBtn && quranPanel) {
    quranBtn.onclick = () => {
      initQuranAudio();
      if (quranPanel.style.display === "none") {
        quranPanel.style.display = "block";
        quranAudio.play().then(() => {
          if (quranPlayPause) quranPlayPause.innerText = "⏸️";
        }).catch(() => {});
      } else {
        if (quranAudio.paused) {
          quranAudio.play().then(() => {
            if (quranPlayPause) quranPlayPause.innerText = "⏸️";
          }).catch(() => {});
        } else {
          quranAudio.pause();
          if (quranPlayPause) quranPlayPause.innerText = "▶️";
        }
      }
    };
  }

  if (quranPlayPause) {
    quranPlayPause.onclick = () => {
      if (!quranAudio) initQuranAudio();
      if (quranAudio.paused) {
        quranAudio.play().then(() => {
          quranPlayPause.innerText = "⏸️";
        }).catch(() => {});
      } else {
        quranAudio.pause();
        quranPlayPause.innerText = "▶️";
      }
    };
  }

  if (quranClose && quranPanel) {
    quranClose.onclick = () => {
      if (quranAudio) {
        quranAudio.pause();
        quranAudio.currentTime = 0;
      }
      quranPanel.style.display = "none";
      if (quranPlayPause) quranPlayPause.innerText = "▶️";
    };
  }

  // تبديل وضع التداول (آلي / يدوي) مع حفظ الاختيار
  const btnModeAuto = document.getElementById("zad-mode-auto");
  const btnModeManual = document.getElementById("zad-mode-manual");

  if (btnModeAuto) {
    btnModeAuto.onclick = () => {
      ROBOT_MODE = "AUTO";
      localStorage.setItem("zad_robot_mode", "AUTO");
      btnModeAuto.style.background = "#10b981";
      btnModeAuto.style.color = "#020617";
      btnModeAuto.style.borderColor = "#10b981";
      if (btnModeManual) {
        btnModeManual.style.background = "#1e293b";
        btnModeManual.style.color = "#cbd5e1";
        btnModeManual.style.borderColor = "#334155";
      }
      const manBtn = document.getElementById("zad-manual-trigger-container");
      if (manBtn) manBtn.style.display = "none";
      const actElem = document.getElementById("zad-robot-action");
      if (actElem) actElem.innerText = "🤖 وضع التداول الآلي نشط: سينفذ الصفقات تلقائياً بالثانية عند موعد الدخول";
    };
  }

  if (btnModeManual) {
    btnModeManual.onclick = () => {
      ROBOT_MODE = "MANUAL";
      localStorage.setItem("zad_robot_mode", "MANUAL");
      btnModeManual.style.background = "#f59e0b";
      btnModeManual.style.color = "#020617";
      btnModeManual.style.borderColor = "#f59e0b";
      if (btnModeAuto) {
        btnModeAuto.style.background = "#1e293b";
        btnModeAuto.style.color = "#cbd5e1";
        btnModeAuto.style.borderColor = "#334155";
      }
      if (activeSignalObj && activeSignalObj.status === "PENDING") {
        const manBtn = document.getElementById("zad-manual-trigger-container");
        if (manBtn) manBtn.style.display = "block";
      }
      const actElem = document.getElementById("zad-robot-action");
      if (actElem) actElem.innerText = "🖐️ وضع التداول اليدوي نشط: اضغط زر الدخول يدوياً عند اكتمال العد";
    };
  }

  // وظيفة النقر التلقائي الذكية الفائقة لجميع منصات البروكر (مع محاكاة أحداث الماوس والبوانتر كاملة)
  function triggerBrokerTrade(direction) {
    try {
      const isCall = direction === "CALL";
      let btn = null;

      // 1. منصة كيوتكس Quotex (جميع محددات أزرار الشراء والبيع الحديثة والقديمة)
      const quotexSelectors = isCall
        ? [
            ".call-btn",
            "button.call-btn",
            ".section-deal__success button",
            "button.call",
            "[data-test='call-button']",
            ".deal-form__button--call",
            "button[class*='call']",
            "button[class*='up']",
            ".btn-call"
          ]
        : [
            ".put-btn",
            "button.put-btn",
            ".section-deal__danger button",
            "button.put",
            "[data-test='put-button']",
            ".deal-form__button--put",
            "button[class*='put']",
            "button[class*='down']",
            ".btn-put"
          ];

      // 2. منصة بوكيت أوبشن Pocket Option
      const pocketSelectors = isCall
        ? [
            ".btn-call",
            ".btn-call__wrap",
            "a.btn-call",
            "a[href*='call']",
            "[data-trade-action='call']",
            ".control__call"
          ]
        : [
            ".btn-put",
            ".btn-put__wrap",
            "a.btn-put",
            "a[href*='put']",
            "[data-trade-action='put']",
            ".control__put"
          ];

      // 3. منصات أخرى (Olymp Trade, IQ Option, Binomo)
      const otherSelectors = isCall
        ? [
            "button[data-test='deal-button-up']",
            ".SidebarCallButton",
            ".call-btn",
            "button[data-qa='deal-button-call']"
          ]
        : [
            "button[data-test='deal-button-down']",
            ".SidebarPutButton",
            ".put-btn",
            "button[data-qa='deal-button-put']"
          ];

      const allSelectors = [...quotexSelectors, ...pocketSelectors, ...otherSelectors];

      for (let s = 0; s < allSelectors.length; s++) {
        try {
          const els = document.querySelectorAll(allSelectors[s]);
          for (let i = 0; i < els.length; i++) {
            const el = els[i];
            if (el && (el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0)) {
              btn = el;
              break;
            }
          }
          if (btn) break;
        } catch(e) {}
      }

      if (btn) {
        // محاكاة تسلسل أحداث الضغط الحقيقية للمتصفح لتجاوز حماية أطر React/Vue في البروكر
        const rect = btn.getBoundingClientRect();
        const clientX = rect.left + rect.width / 2;
        const clientY = rect.top + rect.height / 2;
        const mouseOpts = { bubbles: true, cancelable: true, view: window, clientX, clientY };

        try { btn.dispatchEvent(new PointerEvent('pointerdown', mouseOpts)); } catch(e) {}
        try { btn.dispatchEvent(new MouseEvent('mousedown', mouseOpts)); } catch(e) {}
        try { btn.dispatchEvent(new PointerEvent('pointerup', mouseOpts)); } catch(e) {}
        try { btn.dispatchEvent(new MouseEvent('mouseup', mouseOpts)); } catch(e) {}
        btn.click();
        return true;
      }
    } catch(e) {
      console.error("[ZAD Robot] Trade trigger error:", e);
    }
    return false;
  }

  // كاشف الزوج المفتوح حالياً في شارت منصة البروكر بدقة متناهية وبدون قيود
  function detectCurrentBrokerAsset() {
    try {
      const KNOWN_CURRENCIES = [
        "EUR", "USD", "GBP", "JPY", "AUD", "CAD", "CHF", "NZD",
        "BRL", "INR", "PKR", "TRY", "IDR", "EGP", "BDT", "PHP",
        "MXN", "ARS", "COP", "NGN", "KES", "ZAR", "SGD", "HKD",
        "CNH", "CNY", "RUB", "SEK", "NOK", "DKK", "PLN", "HUF",
        "CZK", "ILS", "AED", "SAR", "QAR", "KWD", "THB", "VND",
        "XAU", "XAG", "BTC", "ETH"
      ];
      const CURR_SET = new Set(KNOWN_CURRENCIES);

      function extractPairFromText(raw) {
        if (!raw || typeof raw !== "string") return null;
        const text = raw.trim();
        if (!text || text.length < 3) return null;

        const isOtc = /\\bOTC\\b/i.test(text) || /_OTC|-OTC/i.test(text);

        // 1. Direct slash or hyphen separated pair: EUR/USD, EUR-USD, EUR/USD (OTC), USD/BRL
        const slashMatch = text.match(/\\b([A-Za-z]{3})\\s*[\\/\\-_]\\s*([A-Za-z]{3})\\b/);
        if (slashMatch) {
          const c1 = slashMatch[1].toUpperCase();
          const c2 = slashMatch[2].toUpperCase();
          if (CURR_SET.has(c1) || CURR_SET.has(c2) || text.includes("/")) {
            return c1 + "/" + c2 + (isOtc ? " OTC" : "");
          }
        }

        // 2. Gold / Commodities / Crypto
        if (/\\bGOLD\\b/i.test(text) || /\\bXAU\\b/i.test(text)) return "XAU/USD" + (isOtc ? " OTC" : "");
        if (/\\bSILVER\\b/i.test(text) || /\\bXAG\\b/i.test(text)) return "XAG/USD" + (isOtc ? " OTC" : "");
        if (/\\bBTC\\b/i.test(text) || /\\bBITCOIN\\b/i.test(text)) return "BTC/USD";
        if (/\\bETH\\b/i.test(text) || /\\bETHEREUM\\b/i.test(text)) return "ETH/USD";

        // 3. 6-letter concatenated symbol: EURUSD, USDBRL, USDINR
        const clean = text.toUpperCase().replace(/[^A-Z]/g, " ");
        const words = clean.split(" ").filter(Boolean);
        for (let i = 0; i < words.length; i++) {
          const w = words[i];
          if (w.length === 6) {
            const c1 = w.slice(0, 3);
            const c2 = w.slice(3, 6);
            if (CURR_SET.has(c1) && CURR_SET.has(c2)) {
              return c1 + "/" + c2 + (isOtc ? " OTC" : "");
            }
          }
          if (w.length === 3 && i + 1 < words.length && words[i + 1].length === 3) {
            const c1 = w;
            const c2 = words[i + 1];
            if (CURR_SET.has(c1) && CURR_SET.has(c2)) {
              return c1 + "/" + c2 + (isOtc ? " OTC" : "");
            }
          }
        }
        return null;
      }

      // 1. فحص عناصر التبويب النشط وأزرار الأزواج في منصات التداول (Quotex, PocketOption, etc.)
      const selectors = [
        ".tab-item.tab-item--active .tab-item__symbol",
        ".tab-item--active .tab-item__symbol",
        ".tab-item.tab-item--active .tab-item__name",
        ".tab-item--active .tab-item__name",
        ".tab-item.tab-item--active .tab-item__text",
        ".tab-item--active .tab-item__text",
        ".tab-item.tab-item--active",
        ".tab-item--active",
        ".tab-item.active .symbol",
        ".tab-item.active",
        ".tabs__item--active",
        ".tabs-item--active",
        ".tabs__item.active",
        ".asset-select__button .asset-select__name",
        ".asset-select__button .asset-select__symbol",
        ".asset-select__button .symbol",
        ".asset-select__button",
        ".asset-select__name",
        ".asset-select",
        ".current-symbol",
        ".current-pair",
        ".current-asset-title",
        ".assets-item--active",
        "[data-test='asset-name']",
        "[data-test='current-asset']",
        "#zad-sim-pair",
        "[data-sim-asset]",
        ".deal-form__asset",
        ".section-deal__header",
        ".header-sub__asset",
        "[class*='tab-item--active']",
        "[class*='tab--active']",
        "[class*='active'][class*='tab']",
        "[class*='asset-select']",
        "[class*='current'][class*='symbol']",
        "[class*='current'][class*='asset']"
      ];

      for (let i = 0; i < selectors.length; i++) {
        try {
          const el = document.querySelector(selectors[i]);
          if (el && el.innerText && el.innerText.trim()) {
            const found = extractPairFromText(el.innerText);
            if (found) return found;
          }
        } catch(e) {}
      }

      // 2. فحص عنوان الصفحة (document.title) - كيوتكس وبوكت أوبشن يحدثان العنوان فور تغيير الزوج
      if (document.title) {
        const fromTitle = extractPairFromText(document.title);
        if (fromTitle) return fromTitle;
      }

      // 3. فحص عنوان الصفحة الأب إذا كان الإسكريبت داخل iframe
      try {
        if (window.top && window.top !== window && window.top.document && window.top.document.title) {
          const fromTopTitle = extractPairFromText(window.top.document.title);
          if (fromTopTitle) return fromTopTitle;
        }
      } catch(e) {}

      // 4. فحص رابط الصفحة (URL)
      const fromUrl = extractPairFromText(window.location.href);
      if (fromUrl) return fromUrl;
      try {
        if (window.top && window.top !== window) {
          const fromTopUrl = extractPairFromText(window.top.location.href);
          if (fromTopUrl) return fromTopUrl;
        }
      } catch(e) {}

      // 5. فحص عام في عناصر الترويسة والشريط العلوي
      const headerEls = document.querySelectorAll("header, nav, [class*='header'], [class*='asset'], [class*='tab'], [class*='symbol']");
      for (let i = 0; i < Math.min(headerEls.length, 35); i++) {
        const t = headerEls[i].innerText;
        if (t && t.length < 60) {
          const found = extractPairFromText(t);
          if (found) return found;
        }
      }
    } catch(err) {
      console.warn("[ZAD Robot] Pair detection notice:", err);
    }
    return null;
  }

  // دالة تحديث خانة الزوج والإشارة: إما 'بانتظار إشارة...' عند فتح السوق، أو 'مغلق السوق' عند إغلاق السوق
  function renderWaitingState() {
    if (activeSignalObj && activeSignalObj.status === "PENDING") return;
    const sigElem = document.getElementById("zad-robot-signal");
    const actElem = document.getElementById("zad-robot-action");
    if (!sigElem) return;

    const isOpen = isForexMarketOpen();

    if (!isOpen) {
      // عندما يكون السوق مغلقاً: إظهار 'مغلق السوق'
      sigElem.innerHTML = \`
        <div style="background:rgba(239,68,68,0.14);border:1.5px solid #ef4444;border-radius:8px;padding:9px 10px;text-align:center;">
          <div style="color:#f87171;font-size:13px;font-weight:bold;display:flex;align-items:center;justify-content:center;gap:6px;">
            <span style="font-size:14px;">🔴</span>
            <span id="zad-signal-pair-name" style="letter-spacing:0.5px;">مغلق السوق</span>
          </div>
          <div style="color:#94a3b8;font-size:10px;margin-top:3px;">السوق العالمي في عطلة أسبوعية حالياً</div>
        </div>
      \`;
      if (actElem) {
        actElem.innerHTML = \`<span style="color:#f87171;font-weight:bold;">السوق مغلق حالياً — بانتظار افتتاح التداول الأسبوعي</span>\`;
      }
      return;
    }

    // عندما يكون السوق مفتوحاً: في خانة الزوج إبقاء فقط 'بانتظار إشارة...'
    sigElem.innerHTML = \`
      <div style="display:flex;align-items:center;justify-content:center;gap:6px;padding:9px 10px;background:rgba(15,23,42,0.85);border-radius:8px;border:1px solid #1e293b;text-align:center;">
        <span style="color:#38bdf8;font-size:13px;font-weight:bold;display:flex;align-items:center;gap:6px;">
          <span>📡</span>
          <span id="zad-signal-pair-name">بانتظار إشارة...</span>
        </span>
      </div>
    \`;
    if (actElem) {
      actElem.innerText = \`جاهز لاستقبال الإشارة القادمة وتنفيذها بالثانية (\${ROBOT_MODE === 'AUTO' ? 'آلياً' : 'يدوياً'})\`;
    }
  }

  // تحويل الشارت تلقائياً إلى زوج الإشارة بالنقر على التبويب المفتوح في المنصة إن وجد (كإجراء تيسيري)
  function switchToBrokerAsset(targetAsset) {
    if (!targetAsset) return false;
    try {
      const cleanTarget = targetAsset.toUpperCase().replace(/\\s*OTC/i, "").replace(/[^A-Z]/g, "");
      
      // 1. فحص تبويبات المنصة المفتوحة في شريط التبويبات العلوي (Quotex & PocketOption)
      const tabSelectors = [
        ".tab-item",
        ".tabs__item",
        ".tabs-item",
        "[class*='tab-item']",
        "[class*='tabs__item']"
      ];
      for (let s = 0; s < tabSelectors.length; s++) {
        const tabs = document.querySelectorAll(tabSelectors[s]);
        for (let i = 0; i < tabs.length; i++) {
          const tab = tabs[i];
          const text = (tab.innerText || "").toUpperCase().replace(/\\s*OTC/i, "").replace(/[^A-Z]/g, "");
          if (text.includes(cleanTarget) && typeof tab.click === "function") {
            tab.click();
            return true;
          }
        }
      }

      // 2. فحص عناصر قائمة الأصول إن كانت مفتوحة
      const itemSelectors = [
        ".asset-select-item",
        ".asset-table__row",
        "[data-test*='asset']",
        ".assets-list__item"
      ];
      for (let s = 0; s < itemSelectors.length; s++) {
        const items = document.querySelectorAll(itemSelectors[s]);
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const text = (item.innerText || "").toUpperCase().replace(/\\s*OTC/i, "").replace(/[^A-Z]/g, "");
          if (text.includes(cleanTarget) && typeof item.click === "function") {
            item.click();
            return true;
          }
        }
      }
    } catch(e) {
      console.error("[ZAD Robot] Auto switch chart error:", e);
    }
    return false;
  }

  // زر إغلاق وتصغير الروبوت المؤقت مع تفعيل زر إعادة الفتح
  const closeBtn = document.getElementById("zad-close-btn");
  if (closeBtn) {
    closeBtn.onclick = () => {
      manualWins = 0;
      manualLosses = 0;
      updateStatsDisplay();
      if (quranAudio) {
        quranAudio.pause();
        quranAudio.currentTime = 0;
      }
      if (quranPanel) quranPanel.style.display = "none";
      if (quranPlayPause) quranPlayPause.innerText = "▶️";
      isWidgetUserMinimized = true;
      widget.style.setProperty("display", "none", "important");
      if (launcher) {
        launcher.style.setProperty("display", "block", "important");
        launcher.style.setProperty("z-index", "2147483647", "important");
      }
    };
  }

  let activeSignalObj = null;
  let currentActiveSignalId = null;
  let currentTargetEntryEpoch = null;
  let serverClockOffsetSec = 0;
  LAST_EXECUTED_SIG_ID = null;
  LAST_ALERTED_SIG_ID = null;

  // مؤقت ثوانٍ للعد التنازلي التفاعلي المباشر بالثانية - مستمر بسلاسة ولا يتأثر بإعادة الجلب من السحابة إطلاقاً
  setInterval(() => {
    const cdContainer = document.getElementById("zad-robot-countdown");
    const cdVal = document.getElementById("zad-countdown-val");
    const actElem = document.getElementById("zad-robot-action");
    if (!cdContainer || !cdVal) return;

    if (activeSignalObj && activeSignalObj.status === "PENDING" && currentTargetEntryEpoch) {
      const currentNowSec = Math.floor(Date.now() / 1000) + serverClockOffsetSec;
      const remainingSec = currentTargetEntryEpoch - currentNowSec;

      cdContainer.style.display = "block";

      if (remainingSec > 0) {
        const mm = Math.floor(remainingSec / 60);
        const ss = remainingSec % 60;
        cdVal.innerText = (mm > 0 ? mm + "د " : "") + (ss < 10 ? "0" + ss : ss) + " ثانية";

        if (remainingSec <= 5) {
          cdContainer.style.background = "#7f1d1d";
          cdContainer.style.borderColor = "#ef4444";
          cdVal.style.color = "#fef08a";
        } else {
          cdContainer.style.background = "#032b44";
          cdContainer.style.borderColor = "#0284c7";
          cdVal.style.color = "#fde047";
        }

        if (actElem && activeSignalObj.id !== LAST_EXECUTED_SIG_ID) {
          actElem.innerHTML = \`🎯 إشارة مؤكدة: (<b>\${activeSignalObj.asset}</b>) — الدخول \${ROBOT_MODE === 'AUTO' ? 'آلياً بالثانية' : 'يدوياً'} عند الدقيقة \${activeSignalObj.entryTime}\`;
        }
      } else if (remainingSec <= 0 && remainingSec >= -12) {
        // حان موعد الدخول الآن بالثانية (:00)!
        cdVal.innerText = "🚀 حان موعد الدخول الآن!";
        cdContainer.style.background = "#064e3b";
        cdContainer.style.borderColor = "#10b981";
        cdVal.style.color = "#6ee7b7";

        // تنفيذ الصفقة تلقائياً عند موعد الدخول بالثانية إذا كان وضع التداول الآلي مفعلاً!
        if (ROBOT_MODE === "AUTO" && activeSignalObj.id !== LAST_EXECUTED_SIG_ID) {
          LAST_EXECUTED_SIG_ID = activeSignalObj.id;
          try { switchToBrokerAsset(activeSignalObj.asset); } catch(e) {}
          const clicked = triggerBrokerTrade(activeSignalObj.direction);
          if (actElem) {
            actElem.innerHTML = clicked
              ? \`<span style="color:#34d399;font-weight:bold;">🚀 تم فتح صفقة \${activeSignalObj.direction} تلقائياً على \${activeSignalObj.asset} بنجاح!</span>\`
              : \`<span style="color:#f59e0b;font-weight:bold;">⚠️ حان موعد صفقة \${activeSignalObj.direction} على \${activeSignalObj.asset} — اضغط زر المنصة</span>\`;
          }
        }
      } else {
        // بعد مرور أكثر من 12 ثانية من الدخول: انتهاء وضع الدخول والعودة لانتظار الإشارة القادمة
        activeSignalObj = null;
        currentActiveSignalId = null;
        currentTargetEntryEpoch = null;
        cdContainer.style.display = "none";
        const manContainer = document.getElementById("zad-manual-trigger-container");
        if (manContainer) manContainer.style.display = "none";
        renderWaitingState();
        if (actElem) {
          actElem.innerText = isForexMarketOpen()
            ? \`جاهز لاستقبال الإشارة القادمة وتنفيذها بالثانية (\${ROBOT_MODE === 'AUTO' ? 'آلياً' : 'يدوياً'})\`
            : "السوق مغلق حالياً";
        }
        widget.style.borderColor = "#10b981";
        widget.style.boxShadow = "0 15px 35px rgba(0,0,0,0.85)";
      }
    } else {
      cdContainer.style.display = "none";
      const manContainer = document.getElementById("zad-manual-trigger-container");
      if (manContainer) manContainer.style.display = "none";
    }

    // تحديث مؤشر الاتصال
    const connBadge = document.getElementById("zad-conn-badge");
    const statusDot = document.getElementById("zad-status-dot");
    const isLive = Date.now() - lastDataReceivedTime < 15000;
    if (connBadge && statusDot) {
      if (isLive) {
        connBadge.innerHTML = '<span style="color:#34d399">🟢 متصل ومتزامن بالسيرفر</span>';
        statusDot.style.background = '#10b981';
        statusDot.style.boxShadow = '0 0 8px #10b981';
      } else {
        connBadge.innerHTML = '<span style="color:#fbbf24">🟡 جاري الاتصال بالسيرفر...</span>';
        statusDot.style.background = '#fbbf24';
        statusDot.style.boxShadow = '0 0 8px #fbbf24';
      }
    }
  }, 1000);

  // معالجة بيانات الـ Feed وتطبيقها على واجهة الروبوت
  function processRobotPayload(data, sourceLabel) {
    if (!data || !data.ok) return;
    lastDataReceivedTime = Date.now();

    if (data.marketOpen !== undefined || data.isMarketOpen !== undefined) {
      serverMarketOpen = data.marketOpen !== undefined ? Boolean(data.marketOpen) : Boolean(data.isMarketOpen);
    }

    if (data.member) {
      const isAuth = data.authorized !== false;
      const memberElem = document.getElementById("zad-robot-member");
      const daysElem = document.getElementById("zad-robot-days");
      if (memberElem) {
        memberElem.innerHTML = isAuth
          ? \`<span style="color:#fbbf24">\${data.member.name}</span>\`
          : \`<span style="color:#ef4444">\${data.member.name} (\${data.member.error || 'غير مفعل'})</span>\`;
      }
      if (daysElem) {
        daysElem.innerHTML = isAuth
          ? \`<span style="color:#34d399">\${data.member.daysLeft} يوم</span>\`
          : \`<span style="color:#ef4444">0 يوم</span>\`;
      }
      if (!isAuth) {
        document.getElementById("zad-robot-signal").innerHTML = \`<span style="color:#ef4444">🔒 \${data.member.error || 'الحساب بانتظار تفعيل المشرف'}</span>\`;
        document.getElementById("zad-robot-action").innerText = "اضغط على زر 🔑 ID لكتابة رقم حسابك المصرح له أو راجع المشرف";
        return;
      }
    }

    // لا يتم استحداث أي إشارة محلية إطلاقاً - الروبوت يستقبل حصرياً الإشارات الرسمية
    const sig = data.activeSignal;
    if (sig && sig.status === "PENDING") {
      activeSignalObj = sig;
      const isCall = sig.direction === "CALL";
      const dirBadge = isCall ? "🟢 صعود (CALL)" : "🔴 هبوط (PUT)";

      // وميض وتوهج الصندوق بلون الإشارة
      widget.style.borderColor = isCall ? '#10b981' : '#ef4444';
      widget.style.boxShadow = isCall ? '0 0 25px rgba(16, 185, 129, 0.4)' : '0 0 25px rgba(239, 68, 68, 0.4)';

      // تشغيل التنبيه الصوتي ومحاولة تبديل الشارت تلقائياً فور وصول إشارة جديدة لأول مرة
      if (sig.id !== LAST_ALERTED_SIG_ID) {
        LAST_ALERTED_SIG_ID = sig.id;
        playSignalChime(isCall);
        try {
          switchToBrokerAsset(sig.asset);
        } catch(e) {}
      }

      // حساب وتثبيت وقت الدخول المستهدف بدقة بالثواني المرجعية (Epoch Seconds)
      if (sig.targetEntryTimestamp && sig.targetEntryTimestamp > 1000000000) {
        currentTargetEntryEpoch = sig.targetEntryTimestamp;
      } else if (sig.entryMinute) {
        const now = new Date();
        const targetMin = parseInt(sig.entryMinute, 10);
        const targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), targetMin, 0, 0);
        if (targetDate.getTime() <= Date.now() - 30000) {
          targetDate.setHours(targetDate.getHours() + 1);
        }
        currentTargetEntryEpoch = Math.floor(targetDate.getTime() / 1000);
      } else if (!currentTargetEntryEpoch || currentActiveSignalId !== sig.id) {
        currentTargetEntryEpoch = Math.floor(Date.now() / 1000) + serverClockOffsetSec + (sig.secondsUntilEntry || 30);
      }
      currentActiveSignalId = sig.id;

      // عرض اسم الزوج والتنبيه مباشرة كما صدر من السيرفر وبدون أي كلمة "الشارت الحالي"
      document.getElementById("zad-robot-signal").innerHTML = \`
        <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:4px;background:rgba(15,23,42,0.85);padding:6px 8px;border-radius:8px;border:1px solid #0284c7;">
          <span style="font-size:11px;color:#94a3b8;display:flex;align-items:center;gap:5px;">
            <span>🎯 الزوج:</span>
            <b style="color:#38bdf8;font-size:14px;font-family:monospace;background:#0c1a2e;padding:2px 8px;border-radius:5px;border:1px solid #0284c7;">\${sig.asset}</b>
          </span>
          <span style="font-size:11px;color:\${isCall ? '#34d399' : '#f87171'};font-weight:bold;background:\${isCall ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)'};padding:2px 8px;border-radius:5px;border:1px solid \${isCall ? '#10b981' : '#ef4444'};">\${dirBadge}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:11px;color:#cbd5e1;padding:3px 6px;background:#09121f;border-radius:6px;margin-bottom:4px;">
          <span>⏰ موعد الدخول: <b style="color:#fde047;">\${sig.entryTime}</b></span>
          <span>⏱️ الصلاحية: <b>M1 (1 دقيقة)</b></span>
        </div>
      \`;

      // تجهيز زر التداول اليدوي إذا كان الوضع يدوياً
      const manContainer = document.getElementById("zad-manual-trigger-container");
      const manBtn = document.getElementById("zad-manual-trade-btn");
      if (ROBOT_MODE === "MANUAL" && manContainer && manBtn) {
        manContainer.style.display = "block";
        manBtn.innerText = \`👉 اضغط لتنفيذ صفقة \${isCall ? 'شراء (CALL 🟢)' : 'بيع (PUT 🔴)'} الآن!\`;
        manBtn.style.background = isCall ? '#10b981' : '#ef4444';
        manBtn.onclick = () => {
          try { switchToBrokerAsset(sig.asset); } catch(e) {}
          const clicked = triggerBrokerTrade(sig.direction);
          const actElem = document.getElementById("zad-robot-action");
          if (actElem) {
            actElem.innerHTML = clicked
              ? \`<span style="color:#34d399;font-weight:bold;">🚀 تم الضغط على زر المنصة يدوياً بنجاح!</span>\`
              : \`<span style="color:#f87171;font-weight:bold;">⚠️ يرجى الضغط مباشرة على زر المنصة</span>\`;
          }
        };
      } else if (manContainer) {
        manContainer.style.display = "none";
      }

      if (sig.id !== LAST_EXECUTED_SIG_ID) {
        const actElem = document.getElementById("zad-robot-action");
        if (actElem) {
          actElem.innerHTML = \`🎯 إشارة مؤكدة على (<b>\${sig.asset}</b>) — جاهز للتنفيذ (\${ROBOT_MODE === 'AUTO' ? 'آلياً بالثانية' : 'يدوياً'}) عند الدقيقة \${sig.entryTime}\`;
        }
      }
    } else {
      // إذا انتهت الصفقة يعود الروبوت إلى وضع الانتظار
      activeSignalObj = null;
      currentActiveSignalId = null;
      currentTargetEntryEpoch = null;
      const cdContainer = document.getElementById("zad-robot-countdown");
      if (cdContainer) cdContainer.style.display = "none";
      const manBtn = document.getElementById("zad-manual-trigger-container");
      if (manBtn) manBtn.style.display = "none";

      renderWaitingState();
      const actElem = document.getElementById("zad-robot-action");
      if (actElem) {
        actElem.innerText = isForexMarketOpen()
          ? \`جاهز لاستقبال الإشارة القادمة وتنفيذها بالثانية (\${ROBOT_MODE === 'AUTO' ? 'آلياً' : 'يدوياً'})\`
          : "السوق مغلق حالياً";
      }
      widget.style.borderColor = "#10b981";
      widget.style.boxShadow = "0 15px 35px rgba(0,0,0,0.85)";
    }
  }

  // =========================================================================
  // المحرك السحابي للاتصال الثلاثي (Triple-Redundant Cloud Connection Engine)
  // يعمل مستقلاً 100% داخل كيوتكس دون الحاجة لفتح أي صفحة خارجية
  // =========================================================================

  const FIRESTORE_STREAM_URL = "https://firestore.googleapis.com/v1/projects/gen-lang-client-0312361187/databases/ai-studio-62ed8503-c2dd-48e0-82a9-957ea3f351dc/documents/robot_feed/live?key=AIzaSyDrMd1UkpgA3S7SwEhEgjvHQfNmizv7Hl8";

  function parseCloudFeedDoc(doc) {
    if (!doc || !doc.fields || !doc.fields.payload || !doc.fields.payload.stringValue) return null;
    try {
      const cloudData = JSON.parse(doc.fields.payload.stringValue);
      if (!cloudData || !cloudData.ok) return null;

      const keyClean = (MEMBER_IDENTIFIER && !MEMBER_IDENTIFIER.includes("\${") ? MEMBER_IDENTIFIER : "QX-ADMIN-MASTER-TEST").toUpperCase().trim();
      const memberInfo = (cloudData.authorizedKeys && cloudData.authorizedKeys[keyClean]) || {
        name: keyClean.startsWith("QX-") ? "حساب تجريبي (ZAD FX)" : "حساب عضو (" + keyClean + ")",
        brokerId: keyClean,
        authorized: true,
        daysLeft: 30,
        error: ""
      };

      return {
        ok: true,
        member: memberInfo,
        authorized: memberInfo.authorized,
        statsNoMartingale: cloudData.statsNoMartingale,
        serverEpochSeconds: cloudData.serverEpochSeconds,
        activeSignal: cloudData.activeSignal
      };
    } catch(e) {
      return null;
    }
  }

  // 1. القناة السحابية المباشرة الأولى (Google Cloud Edge Stream):
  // صفر كوكيز، صفر حظر CORS، استجابة عالمية فائقة السرعة من سيرفرات جوجل مباشرة
  function checkCloudFirestoreStream() {
    if (typeof fetch === "function") {
      fetch(FIRESTORE_STREAM_URL, { cache: "no-store", mode: "cors" })
        .then(function(r) { return r.json(); })
        .then(function(doc) {
          const payload = parseCloudFeedDoc(doc);
          if (payload) {
            processRobotPayload(payload, "google_cloud_stream");
          }
        })
        .catch(function() {});
    }

    if (typeof GM_xmlhttpRequest === "function") {
      GM_xmlhttpRequest({
        method: "GET",
        url: FIRESTORE_STREAM_URL,
        timeout: 3000,
        onload: function(response) {
          try {
            if (response.status === 200) {
              const doc = JSON.parse(response.responseText);
              const payload = parseCloudFeedDoc(doc);
              if (payload) {
                processRobotPayload(payload, "gm_cloud_stream");
              }
            }
          } catch(e) {}
        }
      });
    }
  }
  setInterval(checkCloudFirestoreStream, 1500);
  checkCloudFirestoreStream();

  // 2. قناة الـ API المباشرة للسيرفر (Server API Feed)
  function checkDirectApi() {
    const feedUrl = API_BASE + "/api/quotex-robot/feed?apiKey=" + encodeURIComponent(MEMBER_IDENTIFIER);

    if (typeof fetch === "function") {
      fetch(feedUrl, { mode: "cors", cache: "no-store" })
        .then(function(r) { return r.json(); })
        .then(function(data) {
          if (data && data.ok) processRobotPayload(data, "server_fetch");
        })
        .catch(function() {});
    }

    if (typeof GM_xmlhttpRequest === "function") {
      GM_xmlhttpRequest({
        method: "GET",
        url: feedUrl,
        timeout: 4000,
        onload: function(response) {
          try {
            if (response.status === 200) {
              const data = JSON.parse(response.responseText);
              if (data && data.ok) processRobotPayload(data, "server_gm");
            }
          } catch(e) {}
        }
      });
    }
  }
  setInterval(checkDirectApi, 3000);

  // 3. جسر ذاكرة التامبرمونكي المشتركة بين التبويبات (Cross-Tab GM Bridge)
  if (typeof GM_addValueChangeListener === "function") {
    GM_addValueChangeListener("zad_robot_live_payload", function(name, oldVal, newVal) {
      try {
        if (newVal) {
          const parsed = JSON.parse(newVal);
          processRobotPayload(parsed, "bridge_listener");
        }
      } catch(e) {}
    });
  }

  function checkBridgeStorage() {
    try {
      if (typeof GM_getValue === "function") {
        const stored = GM_getValue("zad_robot_live_payload");
        if (stored) {
          const parsed = JSON.parse(stored);
          processRobotPayload(parsed, "bridge_poll");
        }
      }
    } catch(e) {}
  }
  setInterval(checkBridgeStorage, 2000);
})();`;
  }, [appOrigin, selectedTestApiKey]);

  const filteredSubscribers = useMemo(() => {
    const list = safeSubscribers;
    const q = searchMemberQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      s =>
        s.name.toLowerCase().includes(q) ||
        (s.email || '').toLowerCase().includes(q) ||
        (s.brokerAccountId || '').toLowerCase().includes(q) ||
        (s.robotApiKey || '').toLowerCase().includes(q)
    );
  }, [safeSubscribers, searchMemberQuery]);

  return (
    <div className="space-y-7">
      {/* Top Admin / Trader Header & Status Banner */}
      <div className="p-5 bg-gradient-to-r from-slate-900 via-[#0F172A] to-slate-900 border-2 border-emerald-500/40 rounded-2xl shadow-xl space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-400/40">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>🟢 سيرفر الروبوت متصل ومتزامن بالسيرفر</span>
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-sky-500/15 text-sky-300 border border-sky-500/30">
                <Radio className="w-3.5 h-3.5" />
                <span>مربوط بـ API تليجرام ومنصات التداول</span>
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              🤖 التداول الآلي — روبوت منصة كيوتكس وبروكرز العائم (Universal Cloud Robot)
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-3xl">
              روبوت تداول سحابي عائم ومستقل يعمل مباشرة داخل صفحات المنصات (Quotex, PocketOption, etc.) عبر Tampermonkey. يستقبل الصفقات بالثانية عبر <strong className="text-amber-300">API الموقع</strong>، وينبه صوتياً ومرئياً، ويختار الزوج والصلاحية M1 ويفتح الصفقة في موعدها بدقة.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {isAdmin ? (
              <>
                <button
                  type="button"
                  onClick={() =>
                    handleSaveRobotSettings({
                      isPublishedToVisitors: !robotSettings.isPublishedToVisitors
                    })
                  }
                  disabled={isSavingSettings}
                  className={`px-4 py-2.5 rounded-xl text-xs font-extrabold border transition-all cursor-pointer flex items-center gap-2 ${
                    robotSettings.isPublishedToVisitors
                      ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                      : 'bg-amber-500/15 text-amber-300 border-amber-400/50 hover:bg-amber-500/25'
                  }`}
                >
                  <Lock className="w-4 h-4" />
                  <span>
                    {robotSettings.isPublishedToVisitors
                      ? 'الحالة: منشور للزوار'
                      : 'الحالة: وضع التطوير (متاح للمشرف والأعضاء)'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onNavigateView('admin')}
                  className="px-3.5 py-2.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 cursor-pointer"
                >
                  العودة للوحة المشرف
                </button>
              </>
            ) : (
              <div className="flex items-center gap-2">
                {onOpenLoginModal && (
                  <button
                    type="button"
                    onClick={onOpenLoginModal}
                    className="px-3.5 py-2.5 rounded-xl text-xs font-bold bg-sky-500 hover:bg-sky-400 text-slate-950 cursor-pointer flex items-center gap-1.5 shadow"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>تسجيل دخول المشرف</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onNavigateView('visitor')}
                  className="px-3.5 py-2.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 cursor-pointer"
                >
                  الرئيسية
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Summary Capabilities Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 text-xs">
          <div className="p-3 bg-[#0B0F17] border border-slate-800 rounded-xl">
            <div className="text-[11px] text-slate-400">وضع التشغيل</div>
            <div className="font-extrabold text-emerald-400 mt-0.5">تداول آلي أو يدوي</div>
          </div>
          <div className="p-3 bg-[#0B0F17] border border-slate-800 rounded-xl">
            <div className="text-[11px] text-slate-400">الربح / الخسارة (اليوم)</div>
            <div className="font-extrabold text-white mt-0.5 font-mono-num">
              <span className="text-emerald-400">{robotZeroGaleStats.wins}W</span> /{' '}
              <span className="text-rose-400">{robotZeroGaleStats.losses}L</span> (
              {robotZeroGaleStats.winRate}%)
            </div>
          </div>
          <div className="p-3 bg-[#0B0F17] border border-slate-800 rounded-xl">
            <div className="text-[11px] text-slate-400">اختيار الزوج والصلاحية</div>
            <div className="font-extrabold text-sky-300 mt-0.5">تلقائي (M1 + الزوج)</div>
          </div>
          <div className="p-3 bg-[#0B0F17] border border-slate-800 rounded-xl">
            <div className="text-[11px] text-slate-400">ربط API الموقع</div>
            <div className="font-extrabold text-emerald-400 mt-0.5">نشط ومباشر</div>
          </div>
          <div className="p-3 bg-[#0B0F17] border border-slate-800 rounded-xl">
            <div className="text-[11px] text-slate-400">مفاتيح الأعضاء النشطة</div>
            <div className="font-extrabold text-amber-300 mt-0.5 font-mono-num">
              {safeSubscribers.filter(s => s.robotEnabled !== false).length} مفتاح خاص
            </div>
          </div>
        </div>
      </div>

      {/* =====================================================================
          TELEGRAM & REAL-TIME CONNECTION DIAGNOSTIC PANEL
          ===================================================================== */}
      <div className="p-5 bg-gradient-to-r from-sky-950/40 via-slate-900 to-indigo-950/40 border-2 border-sky-500/50 rounded-2xl shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-sky-500/20 border border-sky-500/40 flex items-center justify-center text-sky-300 text-lg">
              ✈️
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-extrabold text-white flex items-center gap-2">
                <span>فحص اتصال بوت تليجرام والروبوت المباشر</span>
                <span className="px-2 py-0.5 text-[10px] rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold">
                  🟢 متصل
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">
                تأكيد اتصال السيرفر بقناة تليجرام الرسمية (@ZadNBFX) واختبار إرسال الإشارات اللحظية.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleTestTelegramConnection}
              disabled={isTestingTelegram}
              className="px-4 py-2.5 text-xs font-extrabold bg-sky-500 hover:bg-sky-400 text-slate-950 rounded-xl transition-all cursor-pointer flex items-center gap-2 shadow-lg disabled:opacity-50"
            >
              <Activity className={`w-3.5 h-3.5 ${isTestingTelegram ? 'animate-spin' : ''}`} />
              <span>{isTestingTelegram ? '⏳ جاري الاتصال بتليجرام...' : '✈️ فحص اتصال بوت تليجرام وإرسال رسالة الآن'}</span>
            </button>

            <button
              type="button"
              onClick={() => onTriggerSignalNow()}
              className="px-4 py-2.5 text-xs font-extrabold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl transition-all cursor-pointer flex items-center gap-2 shadow-lg"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>⚡ اقتناص إشارة فورية وإرسالها</span>
            </button>

            <a
              href="/api/robot-status"
              target="_blank"
              rel="noreferrer"
              className="px-3 py-2.5 text-xs font-bold bg-slate-800 hover:bg-slate-700 text-sky-300 rounded-xl transition-all flex items-center gap-1.5 border border-slate-700"
            >
              <span>صفحة الفحص المستقلة ↗</span>
            </a>
          </div>
        </div>

        {telegramTestResult && (
          <div
            className={`p-3.5 rounded-xl border text-xs flex items-center justify-between gap-3 ${
              telegramTestResult.ok
                ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-200'
                : 'bg-rose-950/80 border-rose-500/50 text-rose-200'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="text-base">{telegramTestResult.ok ? '✅' : '❌'}</span>
              <span className="font-bold">{telegramTestResult.message}</span>
              {telegramTestResult.messageId && (
                <span className="px-2 py-0.5 rounded bg-black/40 text-[10px] font-mono-num text-emerald-300">
                  معرف الرسالة: #{telegramTestResult.messageId}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setTelegramTestResult(null)}
              className="text-slate-400 hover:text-white text-xs cursor-pointer"
            >
              إغلاق
            </button>
          </div>
        )}
      </div>

      {/* =====================================================================
          SECTION 1: LIVE INTERACTIVE FLOATING ROBOT OVER QUOTEX CHART PREVIEW
          ===================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left/Center 8 Columns: Simulated Quotex Trading Screen with the Compact Draggable/Floating Robot */}
        <div className="lg:col-span-8 p-5 bg-slate-900/90 border border-slate-800 rounded-2xl space-y-4 flex flex-col justify-between">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div>
              <span className="text-[11px] font-bold text-emerald-400">
                01. معاينة حية للروبوت الصغير والعائم داخل صفحة كيوتكس (Quotex)
              </span>
              <h2 className="text-base sm:text-lg font-extrabold text-white mt-0.5">
                محاكاة شاشة التداول في كيوتكس + الروبوت العائم المصغّر
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => toggleScreenFloating()}
                className={`px-3 py-2 text-xs font-extrabold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 border shadow-md ${
                  isScreenFloating
                    ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                    : 'bg-slate-800 hover:bg-slate-700 text-emerald-300 border-emerald-500/40'
                }`}
                title="تبديل وضع الروبوت: عائم فوق كامل الشاشة أو داخل نافذة الشارت"
              >
                <span>{isScreenFloating ? '🟢 الروبوت عائم فوق كامل الشاشة' : '🔄 جعل الروبوت عائماً فوق الشاشة'}</span>
              </button>
              <button
                type="button"
                onClick={handleSimulateFullCycle}
                className="px-3.5 py-2 text-xs font-extrabold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-md"
              >
                <Play className="w-3.5 h-3.5" />
                <span>تجربة وصول إشارة وفتح صفقة تلقائياً الآن</span>
              </button>
              <button
                type="button"
                onClick={() => onTriggerSignalNow()}
                className="px-3 py-2 text-xs font-bold text-amber-300 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>بث إشارة حقيقية من الرادار</span>
              </button>
            </div>
          </div>

          {/* Simulated Quotex Trading Interface Canvas */}
          <div className="relative min-h-[470px] w-full bg-[#090D16] border-2 border-slate-800 rounded-2xl overflow-hidden p-4 flex flex-col justify-between shadow-2xl">
            {/* Simulated Quotex Top Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800/80 z-10">
              <div className="flex items-center gap-2.5">
                <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-extrabold tracking-wide">
                  QUOTEX WEB TERMINAL
                </span>
                {/* Auto-selected Pair Pill */}
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-900 border border-sky-500/50 text-xs font-mono-num">
                  <Globe className="w-3.5 h-3.5 text-sky-400" />
                  <span className="text-white font-extrabold">{simQuotexPair}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 font-sans">
                    اختيار تلقائي
                  </span>
                </div>
                {/* Auto-selected Expiry Pill */}
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-900 border border-amber-500/40 text-xs font-mono-num">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-amber-300 font-bold">{simQuotexExpiry}</span>
                </div>

                {/* Clickable pair tabs to test auto-discovery of pair switching in real time */}
                <div className="flex flex-wrap items-center gap-1 bg-slate-950/80 p-1 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 px-1 font-bold">أزواج الشارت:</span>
                  {['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CAD'].map(pair => (
                    <button
                      key={pair}
                      type="button"
                      onClick={() => {
                        setSimQuotexPair(pair);
                        setSimAlertBanner(`🔄 تم اكتشاف تغيير الزوج في الشارت: ${pair} (رادار الروبوت مزامن وجاهز)`);
                        setTimeout(() => setSimAlertBanner(null), 4000);
                      }}
                      className={`px-2 py-0.5 rounded-lg text-[10px] font-bold font-mono transition-all cursor-pointer ${
                        simQuotexPair === pair
                          ? 'bg-sky-500 text-slate-950 font-extrabold shadow'
                          : 'text-slate-400 hover:text-white bg-slate-900/60'
                      }`}
                    >
                      {pair}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <span className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 font-mono-num">
                  قيمة الصفقة: <strong className="text-emerald-400">${widgetStakeUsd}</strong>
                </span>
              </div>
            </div>

            {/* Live Alert Notification Toast when a signal arrives */}
            {simAlertBanner && (
              <div className="my-2 p-3 rounded-xl bg-emerald-950/90 border border-emerald-400/70 text-xs text-emerald-100 flex items-center justify-between gap-2 shadow-lg z-10">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-amber-300 animate-bounce shrink-0" />
                  <span className="font-bold">{simAlertBanner}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSimAlertBanner(null)}
                  className="text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Full-Width Background Quotex Chart Terminal Canvas with Floating Robot Overlay */}
            <div className="flex-1 w-full space-y-3 p-3.5 bg-[#060911]/90 border border-slate-800/80 rounded-2xl relative my-2 overflow-hidden">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="font-bold text-white">شارت منصة كيوتكس المباشر ({simQuotexPair})</span>
                  <span className="text-[10px] text-emerald-400 font-mono bg-emerald-950/70 border border-emerald-500/40 px-2 py-0.5 rounded-full hidden sm:inline-block">
                    نافذة الروبوت عائمة فوق الشارت ⚡
                  </span>
                </div>
                <span className="text-emerald-400 font-mono-num font-extrabold text-sm">
                  {latestSignal?.livePrice || liveMarket[0]?.formattedPrice || '1.08460'}
                </span>
              </div>

              {/* Realistic Candlestick Chart Canvas */}
              <div className="h-44 sm:h-52 flex items-end gap-1.5 sm:gap-2 px-2.5 pt-5 pb-2.5 bg-[#04070D] rounded-xl border border-slate-800/50 relative overflow-hidden">
                <div className="absolute inset-0 flex flex-col justify-between p-3 pointer-events-none opacity-20 border-b border-slate-700">
                  <div className="border-b border-dashed border-slate-500 w-full" />
                  <div className="border-b border-dashed border-slate-500 w-full" />
                  <div className="border-b border-dashed border-slate-500 w-full" />
                </div>
                {[42, 55, 48, 63, 59, 71, 66, 52, 68, 78, 74, 86, 80, 91, 85, 96, 89, 104].map((h, i) => {
                  const isUp = i % 3 !== 0;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-0.5 z-0">
                      <div className={`w-0.5 h-3 ${isUp ? 'bg-emerald-500/60' : 'bg-rose-500/60'}`} />
                      <div
                        style={{ height: `${Math.round(h * 1.15)}px` }}
                        className={`w-full rounded-sm ${isUp ? 'bg-emerald-500/80 shadow-[0_0_8px_rgba(16,185,129,0.3)]' : 'bg-rose-500/80 shadow-[0_0_8px_rgba(239,68,68,0.3)]'}`}
                      />
                      <div className={`w-0.5 h-2 ${isUp ? 'bg-emerald-500/60' : 'bg-rose-500/60'}`} />
                    </div>
                  );
                })}
              </div>

              {/* Bottom Quick Deal Action Buttons inside Quotex */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    playRobotAlertSound('open');
                    setSimAutoTradeStatus('TRADE_OPENED');
                    setSimAlertBanner(
                      `🟢 تم فتح صفقة صعود (CALL) على الزوج ${simQuotexPair} بقيمة $${widgetStakeUsd}`
                    );
                  }}
                  className={`py-2.5 px-4 rounded-xl font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer transition-all ${
                    simAutoTradeStatus === 'TRADE_OPENED' &&
                    (latestSignal?.direction || 'CALL') === 'CALL'
                      ? 'bg-emerald-400 text-slate-950 ring-4 ring-emerald-400/40'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-950'
                  }`}
                >
                  <span>🟢 صعود (CALL UP)</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    playRobotAlertSound('open');
                    setSimAutoTradeStatus('TRADE_OPENED');
                    setSimAlertBanner(
                      `🔴 تم فتح صفقة هبوط (PUT) على الزوج ${simQuotexPair} بقيمة $${widgetStakeUsd}`
                    );
                  }}
                  className={`py-2.5 px-4 rounded-xl font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer transition-all ${
                    simAutoTradeStatus === 'TRADE_OPENED' && latestSignal?.direction === 'PUT'
                      ? 'bg-rose-400 text-slate-950 ring-4 ring-rose-400/40'
                      : 'bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-950'
                  }`}
                >
                  <span>🔴 هبوط (PUT DOWN)</span>
                </button>
              </div>
            </div>

            {/* =========================================================
                THE FLOATING COMPACT QUOTEX ROBOT WIDGET (الروبوت الصغير العائم الحقيقي)
                Floats directly over the broker chart canvas with dragging & toggle
                ========================================================= */}
            {widgetClosed ? (
              <div className={`${isScreenFloating ? 'fixed bottom-8 left-8 z-[99999]' : 'md:absolute md:bottom-14 md:left-6 z-30'} my-2 md:my-0 flex justify-center`}>
                <button
                  type="button"
                  onClick={() => handleSetWidgetClosed(false)}
                  className="px-5 py-2.5 bg-[#0B0F17]/95 border-2 border-emerald-400 hover:border-emerald-300 text-emerald-300 font-extrabold rounded-full shadow-[0_12px_35px_rgba(16,185,129,0.35)] text-xs flex items-center gap-2.5 cursor-pointer transition-all hover:scale-105 active:scale-95 animate-pulse"
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block shadow-[0_0_8px_#10b981]" />
                  <span>🤖 إظهار نافذة روبوت ZAD FX العائمة</span>
                </button>
              </div>
            ) : (
              <div
                style={widgetPosition ? { transform: `translate(${widgetPosition.x}px, ${widgetPosition.y}px)` } : undefined}
                className={`${
                  isScreenFloating
                    ? 'fixed bottom-8 left-8 z-[99999] shadow-[0_25px_60px_rgba(0,0,0,0.95),0_0_40px_rgba(16,185,129,0.35)]'
                    : 'absolute top-6 left-3 sm:top-12 sm:left-6 z-30 shadow-[0_20px_50px_rgba(0,0,0,0.85),0_0_30px_rgba(16,185,129,0.3)]'
                } w-full max-w-[305px] bg-[#0B0F17]/95 backdrop-blur-md border-2 border-emerald-400/90 rounded-2xl overflow-hidden select-none transition-shadow`}
              >
                {/* Compact Floating Header - Draggable */}
                <div
                  onMouseDown={handleDragStart}
                  onTouchStart={handleTouchStart}
                  className="px-3.5 py-2.5 bg-gradient-to-r from-emerald-950/90 via-slate-900 to-slate-900 border-b border-slate-800 flex items-center justify-between cursor-move"
                  title="اضغط واسحب لتحريك النافذة العائمة"
                >
                      <div className="flex items-center gap-2">
                        <span className="relative flex h-2.5 w-2.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                        </span>
                        <span className="text-xs font-extrabold text-white">
                          روبوت ZAD FX
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => toggleScreenFloating()}
                          className={`px-1.5 py-0.5 text-[10px] font-bold rounded border transition-colors cursor-pointer ${
                            isScreenFloating
                              ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                              : 'bg-slate-800 hover:bg-slate-700 text-emerald-300 border-slate-700'
                          }`}
                          title={isScreenFloating ? 'إرجاع الروبوت لداخل نافذة الشارت' : 'تثبيت الروبوت كنافذة عائمة حرة فوق الشاشة'}
                        >
                          {isScreenFloating ? '📍 شارت' : '📌 عائم'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowWidgetInfo(!showWidgetInfo)}
                          className={`px-1.5 py-0.5 text-[10px] font-bold rounded border transition-colors cursor-pointer ${
                            showWidgetInfo
                              ? 'bg-sky-500 text-slate-950 border-sky-400'
                              : 'bg-slate-800 hover:bg-slate-700 text-sky-300 border-slate-700'
                          }`}
                          title="معلومات وتطوير"
                        >
                          ℹ️ info
                        </button>
                        <button
                          type="button"
                          onClick={handleToggleQuran}
                          className={`px-1.5 py-0.5 text-[10px] font-bold rounded border transition-colors cursor-pointer flex items-center gap-1 ${
                            showQuranBar
                              ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                              : 'bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border-emerald-700/60'
                          }`}
                          title="استماع للقرآن الكريم — الشيخ ماهر المعيقلي"
                        >
                          <span>🎧</span>
                          <span>قرآن</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setWidgetMinimized(!widgetMinimized)}
                          className="px-1.5 py-0.5 text-[10px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 rounded cursor-pointer"
                          title="تصغير / تكبير الروبوت العائم"
                        >
                          {widgetMinimized ? '+' : '−'}
                        </button>
                        <button
                          type="button"
                          onClick={handleCloseRobot}
                          className="text-slate-400 hover:text-rose-400 p-0.5 cursor-pointer text-sm font-bold leading-none transition-colors ml-1"
                          title="إغلاق"
                        >
                          ✕
                        </button>
                      </div>
                    </div>

                  {/* Info Modal / Drawer inside Widget */}
                  {showWidgetInfo && !widgetMinimized && (
                    <div className="m-3 p-3 bg-gradient-to-br from-[#0F172A] to-slate-900 border border-sky-500/50 rounded-xl space-y-2 text-[11px] shadow-lg animate-in fade-in duration-200">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                        <strong className="text-sky-300 flex items-center gap-1">
                          <span>ℹ️ معلومات الروبوت العائم</span>
                        </strong>
                        <button
                          type="button"
                          onClick={() => setShowWidgetInfo(false)}
                          className="text-slate-400 hover:text-white cursor-pointer text-xs"
                        >
                          ✕
                        </button>
                      </div>
                      <div className="space-y-1.5 leading-relaxed text-slate-300">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">🌐 الموقع الرسمي:</span>
                          <a
                            href="https://fx.zadtoo.com"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-bold text-emerald-400 hover:underline font-mono-num"
                          >
                            fx.zadtoo.com
                          </a>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">📢 القناة الرسمية:</span>
                          <a
                            href="https://t.me/ZadNBFX"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-bold text-sky-400 hover:underline flex items-center gap-1"
                          >
                            <span>@ZadNBFX</span>
                          </a>
                        </div>
                        <div className="pt-1.5 border-t border-slate-800/80 flex items-center justify-between text-[10.5px]">
                          <span className="text-slate-400">👨‍💻 إعداد وبرمجة:</span>
                          <strong className="text-amber-300 font-bold">Nabil Barakat</strong>
                        </div>
                      </div>
                    </div>
                  )}

                  {!widgetMinimized ? (
                    <div className="p-3.5 space-y-3 text-xs">
                      {/* Member Subscription & Key Status Row */}
                      <div className="p-2.5 bg-slate-900/90 border border-slate-800 rounded-xl space-y-1.5">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-400">العضو المشترك:</span>
                          <strong className="text-amber-300 truncate max-w-[150px]">
                            {apiFeedResponse?.member?.name || 'حساب المشرف التجريبي'}
                          </strong>
                        </div>
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-400">صلاحية المفتاح:</span>
                          <span className="font-mono-num font-bold text-emerald-400">
                            {apiFeedResponse?.authorized === false
                              ? '❌ منتهي / متوقف'
                              : `نشط (${apiFeedResponse?.member?.daysLeft ?? 30} يوم)`}
                          </span>
                        </div>
                      </div>

                      {/* مشغل القرآن الكريم المصغر (الشيخ ماهر المعيقلي) أسفل اسم العضو */}
                      {showQuranBar && (
                        <div className="p-2 bg-gradient-to-r from-emerald-950 via-[#032e22] to-slate-900 border border-emerald-500/50 rounded-xl flex items-center justify-between gap-2 shadow-lg animate-in fade-in duration-200">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="relative flex h-2 w-2 flex-shrink-0">
                              <span className={`absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 ${isQuranPlaying ? 'animate-ping' : ''}`} />
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                            </span>
                            <div className="truncate">
                              <div className="text-[10.5px] font-extrabold text-emerald-200 truncate flex items-center gap-1">
                                <span>📖</span>
                                <span>القرآن — الشيخ ماهر المعيقلي</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <button
                              type="button"
                              onClick={handleToggleQuranPlayPause}
                              className="px-2 py-0.5 text-[10px] font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded cursor-pointer transition-colors shadow"
                            >
                              {isQuranPlaying ? '⏸️' : '▶️'}
                            </button>
                            <button
                              type="button"
                              onClick={handleCloseQuranBar}
                              className="text-slate-400 hover:text-white p-0.5 cursor-pointer text-xs font-bold leading-none"
                              title="إغلاق مشغل القرآن"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Auto vs Manual Mode Switcher */}
                      <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-900 border border-slate-800 rounded-xl">
                        <button
                          type="button"
                          onClick={() => setWidgetMode('AUTO')}
                          className={`py-1.5 px-2 rounded-lg text-[11px] font-extrabold transition-all cursor-pointer flex items-center justify-center gap-1 ${
                            widgetMode === 'AUTO'
                              ? 'bg-emerald-400 text-slate-950 shadow'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          <span>🤖 تداول آلي</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setWidgetMode('MANUAL')}
                          className={`py-1.5 px-2 rounded-lg text-[11px] font-extrabold transition-all cursor-pointer flex items-center justify-center gap-1 ${
                            widgetMode === 'MANUAL'
                              ? 'bg-amber-400 text-slate-950 shadow'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          <span>🖐️ تداول يدوي</span>
                        </button>
                      </div>

                      {/* مزامنة سحابية حصرية مع الإشارات المعتمدة */}
                      <div className="flex items-center justify-between px-2.5 py-1.5 bg-[#09121f] border border-sky-900/50 rounded-xl text-[10.5px]">
                        <span className="flex items-center gap-1.5 text-slate-200">
                          <span className="text-sky-400">⚡</span>
                          <span className="font-bold text-sky-300">مزامنة سحابية مع الإشارات المعتمدة</span>
                        </span>
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border text-emerald-300 bg-emerald-500/15 border-emerald-500/30">
                          مفعلة تلقائياً ✓
                        </span>
                      </div>

                      {/* Active Signal & Auto Pair/Expiry Box */}
                      <div className="p-2.5 bg-[#070A10] border border-emerald-500/30 rounded-xl space-y-1.5">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-sky-300 font-bold flex items-center gap-1">
                            <Radio className="w-3 h-3 text-emerald-400" />
                            <span>حالة الإشارة:</span>
                          </span>
                          <span className="font-mono-num text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-amber-300">
                            {latestSignal ? `الدقيقة ${latestSignal.entryTime}` : isGlobalMarketOpen ? 'بانتظار إشارة' : 'مغلق السوق'}
                          </span>
                        </div>

                        {latestSignal && latestSignal.status === 'PENDING' ? (
                          <div className="space-y-1.5 pt-1">
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="text-sm font-extrabold text-white font-mono-num flex items-center gap-1.5">
                                  <span>{latestSignal.asset}</span>
                                  <span className="text-[9.5px] text-emerald-300 bg-emerald-950 px-1.5 py-0.5 rounded border border-emerald-800">
                                    إشارة مؤكدة 🎯
                                  </span>
                                </div>
                                <div className="text-[10px] text-slate-400">
                                  الصلاحية: M1 (دقيقة واحدة) | الدخول: {latestSignal.entryTime}
                                </div>
                              </div>
                              <span
                                className={`px-2.5 py-1 rounded-lg text-xs font-extrabold ${
                                  latestSignal.direction === 'CALL'
                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                    : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                                }`}
                              >
                                {latestSignal.direction === 'CALL' ? 'صعود CALL 🟢' : 'هبوط PUT 🔴'}
                              </span>
                            </div>

                            <div className="text-[10.5px] font-bold text-emerald-400 bg-emerald-950/40 border border-emerald-500/30 rounded-md py-1 text-center">
                              🎯 إشارة مؤكدة على ({latestSignal.asset}) — جاهز للتنفيذ ({widgetMode === 'AUTO' ? 'آلياً بالثانية' : 'يدوياً'})
                            </div>
                          </div>
                        ) : !isGlobalMarketOpen ? (
                          <div className="p-3 bg-rose-950/20 rounded-xl border border-rose-500/40 text-xs text-rose-300 text-center space-y-1">
                            <div className="flex items-center justify-center gap-2 font-black text-sm text-rose-400">
                              <span>🔴</span>
                              <span>مغلق السوق</span>
                            </div>
                            <p className="text-[10px] text-slate-400">السوق العالمي في عطلة أسبوعية حالياً</p>
                          </div>
                        ) : (
                          <div className="p-3 bg-[#09121d] rounded-xl border border-slate-800 text-xs text-slate-300 flex items-center justify-center">
                            <div className="flex items-center gap-2 text-sky-300 font-bold text-sm">
                              <span>📡</span>
                              <span>بانتظار إشارة...</span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Three Result-Framed Colored Boxes (ربح - خسارة - النسبة) with Direct Click Increment (Without Hint/Explanation) */}
                      <div className="grid grid-cols-3 gap-2 text-center pt-1 select-none">
                        {/* 1. Wins Box (Green Border) */}
                        <div
                          onClick={() => setManualWins(prev => prev + 1)}
                          className="p-2.5 bg-emerald-950/30 hover:bg-emerald-950/50 border-2 border-emerald-500/80 rounded-xl flex flex-col items-center justify-center cursor-pointer shadow-[0_0_15px_rgba(16,185,129,0.15)] transition-all active:scale-95"
                        >
                          <span className="text-[11px] font-bold text-emerald-300">✅ ربح</span>
                          <span className="text-lg font-black text-white font-mono-num mt-1">
                            {manualWins}
                          </span>
                        </div>

                        {/* 2. Losses Box (Red Border) */}
                        <div
                          onClick={() => setManualLosses(prev => prev + 1)}
                          className="p-2.5 bg-rose-950/30 hover:bg-rose-950/50 border-2 border-rose-500/80 rounded-xl flex flex-col items-center justify-center cursor-pointer shadow-[0_0_15px_rgba(239,68,68,0.15)] transition-all active:scale-95"
                        >
                          <span className="text-[11px] font-bold text-rose-300">❌ خسارة</span>
                          <span className="text-lg font-black text-white font-mono-num mt-1">
                            {manualLosses}
                          </span>
                        </div>

                        {/* 3. Win Rate Box (Amber Border) */}
                        <div className="p-2.5 bg-amber-950/30 border-2 border-amber-500/80 rounded-xl flex flex-col items-center justify-center shadow-[0_0_15px_rgba(245,158,11,0.15)]">
                          <span className="text-[11px] font-bold text-amber-300">🎯 النسبة</span>
                          <span className="text-lg font-black text-amber-300 font-mono-num mt-1">
                            {manualRate}%
                          </span>
                        </div>
                      </div>

                      {/* Stake & Sound Quick Controls */}
                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-800 text-[11px]">
                        <div className="flex items-center gap-1">
                          <span className="text-slate-400">المبلغ ($):</span>
                          {[1, 5, 10, 20].map(amt => (
                            <button
                              key={amt}
                              type="button"
                              onClick={() => setWidgetStakeUsd(amt)}
                              className={`px-1.5 py-0.5 rounded font-mono-num font-bold cursor-pointer ${
                                widgetStakeUsd === amt
                                  ? 'bg-emerald-400 text-slate-950'
                                  : 'bg-slate-800 text-slate-300'
                              }`}
                            >
                              ${amt}
                            </button>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={() => setWidgetSoundOn(!widgetSoundOn)}
                          className={`px-2 py-0.5 rounded font-bold cursor-pointer ${
                            widgetSoundOn
                              ? 'bg-sky-500/20 text-sky-300'
                              : 'bg-slate-800 text-slate-500'
                          }`}
                        >
                          {widgetSoundOn ? '🔔 تنبيه' : '🔕 صامت'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="px-3.5 py-2 flex items-center justify-between text-[11px] text-slate-300">
                      <span>
                        الوضع: <strong>{widgetMode === 'AUTO' ? 'آلي 🤖' : 'يدوي 🖐️'}</strong>
                      </span>
                      <span className="font-mono-num text-emerald-400">
                        ✅ {manualWins} | ❌ {manualLosses} ({manualRate}%)
                      </span>
                    </div>
                  )}
                </div>
              )}

            {/* Bottom Status Bar of Simulated Terminal */}
            <div className="pt-2.5 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
              <span>
                حالة التنفيذ التلقائي:{' '}
                <strong className="text-emerald-400">
                  {simAutoTradeStatus === 'TRADE_OPENED'
                    ? '✅ تم فتح الصفقة في موعدها تلقائياً'
                    : simAutoTradeStatus === 'PAIR_SELECTED'
                    ? '🎯 تم اختيار الزوج والصلاحية وبانتظار ثانية الصفر'
                    : simAutoTradeStatus === 'ALERT_RECEIVED'
                    ? '🔔 وصلت إشارة جديدة من الـ API'
                    : '📡 متصل بـ API الموقع ويراقب الإشارات'}
                </strong>
              </span>
              <span className="font-mono-num text-amber-300">
                المفتاح المختبر حالياً: {selectedTestApiKey}
              </span>
            </div>
          </div>
        </div>

        {/* Right 4 Columns: Robot Global Settings & Live API Connection Inspector */}
        <div className="lg:col-span-4 space-y-5">
          {/* Global Robot Configuration Card */}
          <div className="p-5 bg-slate-900/90 border border-slate-800 rounded-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <span className="text-[11px] font-bold text-amber-400">
                  02. خصائص وإعدادات الروبوت
                </span>
                <h3 className="text-base font-extrabold text-white">ضبط خصائص روبوت كيوتكس</h3>
              </div>
              {settingsSavedBadge && (
                <span className="px-2.5 py-1 text-[11px] font-bold bg-emerald-500/20 text-emerald-300 rounded-lg">
                  ✓ تم الحفظ
                </span>
              )}
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-bold mb-1">
                  عنوان الروبوت العائم:
                </label>
                <input
                  type="text"
                  value={robotSettings.robotTitle}
                  onChange={e =>
                    setRobotSettings(prev => ({ ...prev, robotTitle: e.target.value }))
                  }
                  className="w-full px-3 py-2 bg-[#0B0F17] border border-slate-800 rounded-xl text-white focus:outline-none focus:border-emerald-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-slate-300 font-bold mb-1">
                    الوضع الافتراضي:
                  </label>
                  <select
                    value={robotSettings.defaultMode}
                    onChange={e =>
                      setRobotSettings(prev => ({
                        ...prev,
                        defaultMode: e.target.value === 'MANUAL' ? 'MANUAL' : 'AUTO'
                      }))
                    }
                    className="w-full px-3 py-2 bg-[#0B0F17] border border-slate-800 rounded-xl text-white font-bold"
                  >
                    <option value="AUTO">🤖 تداول آلي (Auto)</option>
                    <option value="MANUAL">🖐️ تداول يدوي (Manual)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-bold mb-1">
                    قيمة الصفقة الافتراضية ($):
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={robotSettings.defaultStakeUsd}
                    onChange={e =>
                      setRobotSettings(prev => ({
                        ...prev,
                        defaultStakeUsd: Math.max(1, Number(e.target.value) || 5)
                      }))
                    }
                    className="w-full px-3 py-2 bg-[#0B0F17] border border-slate-800 rounded-xl text-white font-mono-num font-bold"
                  />
                </div>
              </div>

              {/* Checkboxes for Core Robot Features */}
              <div className="space-y-2 pt-1">
                <label className="p-2.5 bg-[#0B0F17] border border-slate-800 rounded-xl flex items-center justify-between cursor-pointer">
                  <span className="text-slate-200 font-semibold">
                    🔔 إصدار إشارة تنبيه صوتية ومرئية فور وصول الإشارة
                  </span>
                  <input
                    type="checkbox"
                    checked={robotSettings.soundAlertsEnabled}
                    onChange={e =>
                      setRobotSettings(prev => ({
                        ...prev,
                        soundAlertsEnabled: e.target.checked
                      }))
                    }
                    className="w-4 h-4 accent-emerald-400"
                  />
                </label>

                <label className="p-2.5 bg-[#0B0F17] border border-slate-800 rounded-xl flex items-center justify-between cursor-pointer">
                  <span className="text-slate-200 font-semibold">
                    🎯 اختيار زوج العملات تلقائياً على منصة كيوتكس
                  </span>
                  <input
                    type="checkbox"
                    checked={robotSettings.autoSelectPair}
                    onChange={e =>
                      setRobotSettings(prev => ({
                        ...prev,
                        autoSelectPair: e.target.checked
                      }))
                    }
                    className="w-4 h-4 accent-emerald-400"
                  />
                </label>

                <label className="p-2.5 bg-[#0B0F17] border border-slate-800 rounded-xl flex items-center justify-between cursor-pointer">
                  <span className="text-slate-200 font-semibold">
                    ⏱️ ضبط مدة الصلاحية (M1 دقيقة واحدة) وفتح الصفقة في موعدها
                  </span>
                  <input
                    type="checkbox"
                    checked={robotSettings.autoSetExpiryM1}
                    onChange={e =>
                      setRobotSettings(prev => ({
                        ...prev,
                        autoSetExpiryM1: e.target.checked
                      }))
                    }
                    className="w-4 h-4 accent-emerald-400"
                  />
                </label>
              </div>

              <button
                type="button"
                onClick={() => handleSaveRobotSettings()}
                disabled={isSavingSettings}
                className="w-full py-2.5 px-4 bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-extrabold rounded-xl transition-colors cursor-pointer"
              >
                {isSavingSettings ? 'جاري حفظ إعدادات الروبوت...' : 'حفظ إعدادات روبوت كيوتكس'}
              </button>
            </div>
          </div>

          {/* Live API Endpoint & Script Box */}
          <div className="p-5 bg-slate-900/90 border border-slate-800 rounded-2xl space-y-3.5 text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <div>
                <span className="text-[11px] font-bold text-sky-400">
                  03. ربط API الموقع المباشر
                </span>
                <h3 className="text-sm font-extrabold text-white">
                  نقطة اتصال الروبوت (Signal + Result + Subscription API)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => fetchLiveRobotApiFeed(selectedTestApiKey)}
                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg cursor-pointer"
                title="تحديث استجابة الـ API"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isTestingApi ? 'animate-spin' : ''}`} />
              </button>
            </div>

            <div className="space-y-2">
              {/* Security Confirmation Notice */}
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl space-y-1 text-[11px] text-emerald-200">
                <div className="font-bold flex items-center gap-1.5 text-emerald-400">
                  <span>🔒 حماية وأمان مشدد (بياناتك وتوكنات البوت سرية ومحمية 100%):</span>
                </div>
                <p className="text-[10.5px] text-slate-300 leading-relaxed">
                  تم قفل قاعدة البيانات السحابية برمز أمان <code className="text-amber-300 font-mono-num">403 PERMISSION_DENIED</code>، ولا يمكن لأي شخص أو زائر خارجي الوصول إلى إعدادات السيرفر أو توكنات بوتات التليجرام أو أرقام هواتف المشتركين.
                </p>
              </div>

              {/* Direct Secure Server API Endpoint Link */}
              <div className="space-y-1 bg-[#0B0F17] p-2.5 rounded-xl border border-slate-800">
                <div className="text-[10.5px] text-sky-400 font-bold flex items-center justify-between">
                  <span>رابط فحص API المشفر للمفتاح المختار ({selectedTestApiKey}):</span>
                  <span className="text-[9.5px] bg-sky-500/20 px-1.5 py-0.5 rounded text-sky-300">آمن ومشفر</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    readOnly
                    dir="ltr"
                    value={`${appOrigin}/api/quotex-robot/feed?apiKey=${selectedTestApiKey}`}
                    className="flex-1 px-2 py-1 bg-slate-900 border border-slate-800 rounded-lg text-[10px] font-mono-num text-sky-300"
                  />
                  <a
                    href={`${appOrigin}/api/quotex-robot/feed?apiKey=${selectedTestApiKey}`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-2.5 py-1 bg-sky-500 hover:bg-sky-400 text-slate-950 rounded-lg text-[10.5px] font-extrabold cursor-pointer shrink-0"
                  >
                    فتح الفحص ↗
                  </a>
                  <button
                    type="button"
                    onClick={() =>
                      handleCopy(
                        `${appOrigin}/api/quotex-robot/feed?apiKey=${selectedTestApiKey}`,
                        'api-url'
                      )
                    }
                    className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-[10.5px] font-bold cursor-pointer shrink-0"
                  >
                    {copiedId === 'api-url' ? '✓ تم' : 'نسخ'}
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-[11px] text-slate-400">
                معاينة حية للبيانات التي يأخذها الروبوت من المنظومة الآن:
              </div>
              <pre
                dir="ltr"
                className="p-2.5 bg-[#070A10] border border-slate-800 rounded-xl text-[10px] font-mono-num text-emerald-300 max-h-40 overflow-y-auto leading-relaxed"
              >
                {JSON.stringify(
                  apiFeedResponse || { status: 'جاري الاتصال بـ API الموقع...' },
                  null,
                  2
                )}
              </pre>
            </div>

            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl space-y-1.5 text-[11px] text-emerald-200">
              <div className="font-bold flex items-center gap-1.5 text-emerald-300">
                <span>🚀 تحديث الروبوت المستقل بالكامل (الإصدار v3.1 Cloud Edition):</span>
              </div>
              <ul className="list-disc list-inside space-y-1 text-slate-300">
                <li><strong className="text-white">استقلالية كاملة 100%:</strong> يعمل الروبوت مباشرة على منصة كيوتكس (Quotex) دون الحاجة لفتح موقعك أو أي تبويب إضافي على الإطلاق.</li>
                <li><strong className="text-amber-300">محرك سحابي عالمي (Firestore Cloud):</strong> يتصل مباشرة بقاعدة البيانات السحابية بالثانية دون أي قيود حظر أو ملفات تعريف ارتباط.</li>
                <li><strong className="text-sky-300">زر إدخال وتعديل رقم الحساب (🔑 ID):</strong> يمكن للعضو إدخال رقم حسابه في كيوتكس أو مفتاحه مباشرة من النافذة العائمة.</li>
                <li><strong className="text-emerald-300">نغمة صوتية عالية النقاء:</strong> تنبيه صوتي فوري مع وميض الصندوق باللون الأخضر أو الأحمر.</li>
              </ul>
              <div className="text-[10px] text-slate-400 pt-1 border-t border-emerald-500/20">
                💡 <strong>لتحديث الروبوت الآن:</strong> اضغط الزر الأصفر أدناه لنسخ الكود المحدث، ثم افتح Tampermonkey واستبدل الكود القديم واحفظه (Ctrl + S).
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => handleCopy(generatedQuotexUserscript, 'userscript-code')}
                className="py-2.5 px-3 bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-lg shadow-amber-500/20 active:scale-95"
              >
                <Copy className="w-4 h-4" />
                <span>
                  {copiedId === 'userscript-code'
                    ? '✓ تم نسخ كود السكريبت (v3.6) بنجاح!'
                    : 'نسخ كود السكريبت المحدث v3.6'}
                </span>
              </button>

              <button
                type="button"
                onClick={handleDownloadUserscript}
                className="py-2.5 px-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-500/20 active:scale-95"
              >
                <span>📥</span>
                <span>تحميل ملف (zad-broker-robot.user.js)</span>
              </button>
            </div>

            <div className="flex items-center justify-between p-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-xs">
              <span className="text-slate-400">⚡ رابط التثبيت / التحديث التلقائي المباشر:</span>
              <a
                href={`${appOrigin}/api/quotex-robot/zad-broker-robot.user.js?apiKey=${selectedTestApiKey}`}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1 bg-sky-500 hover:bg-sky-400 text-slate-950 font-extrabold rounded-lg text-xs flex items-center gap-1 transition-all"
                title="اضغط لفتح شاشة التثبيت التلقائي المباشرة في تامبرمونكي بنقرة واحدة"
              >
                <span>تثبيت مباشر بنقرة واحدة ↗</span>
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* =====================================================================
          SECTION 2: MEMBER API KEYS & VALIDITY DURATION MANAGER
          (كل عضو له مفتاح خاص به ومدة صلاحية)
          ===================================================================== */}
      <div className="p-5 sm:p-6 bg-slate-900/90 border border-slate-800 rounded-2xl space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <span className="text-xs font-bold text-amber-400">
              04. إدارة مفاتيح الأعضاء وصلاحية اشتراك الروبوت (API Keys & Validity)
            </span>
            <h2 className="text-lg sm:text-xl font-extrabold text-white mt-0.5">
              كل عضو له مفتاح API خاص به ومدة صلاحية محددة
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              يتحقق الروبوت تلقائياً من مفتاح العضو وتاريخ انتهاء صلاحيته قبل استقبال الإشارة أو فتح الصفقات على كيوتكس.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={searchMemberQuery}
              onChange={e => setSearchMemberQuery(e.target.value)}
              placeholder="بحث باسم العضو أو المفتاح أو ID..."
              className="px-3.5 py-2 text-xs bg-[#0B0F17] border border-slate-800 rounded-xl text-white focus:outline-none focus:border-emerald-400 w-64"
            />
          </div>
        </div>

        {/* Quick Form to Issue a New Member Robot API Key & Expiry Date */}
        <form
          onSubmit={handleCreateMemberKey}
          className="p-4 bg-[#0B0F17] border border-emerald-500/30 rounded-xl grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end"
        >
          <div className="lg:col-span-2">
            <label className="block text-[11px] font-bold text-emerald-300 mb-1">
              اسم العضو (لإصدار مفتاح روبوت خاص به):
            </label>
            <input
              type="text"
              required
              value={newKeyMemberName}
              onChange={e => setNewKeyMemberName(e.target.value)}
              placeholder="مثال: أحمد محمد"
              className="w-full px-3 py-2 text-xs bg-slate-900 border border-slate-800 rounded-lg text-white"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-300 mb-1">
              رقم حساب كيوتكس (ID):
            </label>
            <input
              type="text"
              value={newKeyQuotexId}
              onChange={e => setNewKeyQuotexId(e.target.value)}
              dir="ltr"
              placeholder="مثال: 98451230"
              className="w-full px-3 py-2 text-xs bg-slate-900 border border-slate-800 rounded-lg text-white font-mono-num"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-amber-300 mb-1">
              تاريخ انتهاء الصلاحية:
            </label>
            <input
              type="date"
              value={newKeyExpiryDate}
              onChange={e => setNewKeyExpiryDate(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-900 border border-amber-500/40 rounded-lg text-white font-mono-num"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-300 mb-1">
              الوضع وقيمة الصفقة ($):
            </label>
            <div className="flex items-center gap-1.5">
              <select
                value={newKeyMode}
                onChange={e => setNewKeyMode(e.target.value === 'MANUAL' ? 'MANUAL' : 'AUTO')}
                className="flex-1 px-2 py-2 text-xs bg-slate-900 border border-slate-800 rounded-lg text-white font-bold"
              >
                <option value="AUTO">آلي</option>
                <option value="MANUAL">يدوي</option>
              </select>
              <input
                type="number"
                min={1}
                value={newKeyStake}
                onChange={e => setNewKeyStake(Math.max(1, Number(e.target.value) || 5))}
                className="w-16 px-2 py-2 text-xs bg-slate-900 border border-slate-800 rounded-lg text-white font-mono-num"
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={isCreatingKey}
              className="w-full py-2 px-3 bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-extrabold text-xs rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5"
            >
              <Key className="w-3.5 h-3.5" />
              <span>{isCreatingKey ? 'جاري التوليد...' : 'توليد مفتاح خاص للعضو'}</span>
            </button>
          </div>
        </form>

        {/* Table of Members with their Unique API Keys, Validity Duration, and Controls */}
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 bg-[#0B0F17]">
                <th className="py-3 px-3 font-bold">العضو / حساب كيوتكس</th>
                <th className="py-3 px-3 font-bold">المفتاح الخاص بالعضو (API Key)</th>
                <th className="py-3 px-3 font-bold">مدة الصلاحية وتاريخ الانتهاء</th>
                <th className="py-3 px-3 font-bold">وضع الروبوت</th>
                <th className="py-3 px-3 font-bold">الحالة</th>
                <th className="py-3 px-3 font-bold">إجراءات المشرف</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {filteredSubscribers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    لا يوجد أعضاء مطابقون. يمكنك إضافة عضو وتوليد مفتاح خاص به من النموذج أعلاه.
                  </td>
                </tr>
              ) : (
                filteredSubscribers.map(sub => {
                  const keyStr = sub.robotApiKey || `QX-ZAD-${sub.id.slice(-6).toUpperCase()}`;
                  const expStr = sub.robotExpiryDate || sub.expiryDate || '';
                  const isRobotOn = sub.robotEnabled !== false && sub.status !== 'BANNED';

                  let daysRemaining: number | null = null;
                  if (expStr && /^\d{4}-\d{2}-\d{2}$/.test(expStr)) {
                    const diff = new Date(`${expStr}T23:59:59Z`).getTime() - Date.now();
                    daysRemaining = Math.ceil(diff / (1000 * 60 * 60 * 24));
                  }

                  return (
                    <tr key={sub.id} className="hover:bg-slate-900/60 transition-colors">
                      <td className="py-3 px-3">
                        <div className="font-bold text-white">{sub.name}</div>
                        <div className="text-[11px] text-slate-400 font-mono-num">
                          ID: {sub.brokerAccountId || 'غير محدد'}
                        </div>
                      </td>

                      <td className="py-3 px-3">
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#0B0F17] border border-amber-500/40 font-mono-num text-amber-300 font-bold">
                          <span>{keyStr}</span>
                          <button
                            type="button"
                            onClick={() => handleCopy(keyStr, `key-${sub.id}`)}
                            className="text-slate-400 hover:text-white cursor-pointer"
                            title="نسخ مفتاح العضو"
                          >
                            {copiedId === `key-${sub.id}` ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </td>

                      <td className="py-3 px-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            type="date"
                            value={expStr}
                            onChange={e =>
                              handleUpdateSubscriberRobot(sub.id, {
                                robotExpiryDate: e.target.value
                              })
                            }
                            className="px-2 py-1 bg-[#0B0F17] border border-slate-700 rounded text-[11px] font-mono-num text-white"
                          />
                          {daysRemaining !== null && (
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono-num ${
                                daysRemaining <= 0
                                  ? 'bg-rose-500/20 text-rose-300'
                                  : daysRemaining <= 5
                                  ? 'bg-amber-500/20 text-amber-300'
                                  : 'bg-emerald-500/20 text-emerald-300'
                              }`}
                            >
                              {daysRemaining <= 0
                                ? 'منتهي الصلاحية'
                                : `متبقي ${daysRemaining} يوم`}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-3">
                        <select
                          value={sub.robotDefaultMode || 'AUTO'}
                          onChange={e =>
                            handleUpdateSubscriberRobot(sub.id, {
                              robotDefaultMode:
                                e.target.value === 'MANUAL' ? 'MANUAL' : 'AUTO'
                            })
                          }
                          className="px-2.5 py-1 bg-[#0B0F17] border border-slate-700 rounded-lg text-white font-bold text-[11px]"
                        >
                          <option value="AUTO">🤖 آلي (Auto)</option>
                          <option value="MANUAL">🖐️ يدوي (Manual)</option>
                        </select>
                      </td>

                      <td className="py-3 px-3">
                        <div className="flex flex-col gap-1 items-start">
                          <button
                            type="button"
                            onClick={() =>
                              handleUpdateSubscriberRobot(sub.id, {
                                robotEnabled: !isRobotOn
                              })
                            }
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold cursor-pointer ${
                              isRobotOn
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                            }`}
                          >
                            {isRobotOn ? '🟢 مفعل' : '🔴 متوقف'}
                          </button>

                          {sub.status === 'PENDING' ? (
                            <span className="text-[10px] text-amber-300 font-bold">
                              ⏳ بانتظار مصادقة الخطة
                            </span>
                          ) : (
                            <span className="text-[10px] text-emerald-400 font-bold">
                              ✓ مصادق عليه
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {sub.status === 'PENDING' && (
                            <button
                              type="button"
                              onClick={() => handleApproveSubscriber(sub.id)}
                              className="px-2.5 py-1 bg-emerald-400 hover:bg-emerald-300 text-slate-950 rounded-lg text-[11px] font-extrabold cursor-pointer whitespace-nowrap shadow-sm"
                              title="المصادقة على خطة العضو وتفعيل الروبوت له فوراً"
                            >
                              ✅ مصادقة وتفعيل
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => setSelectedTestApiKey(keyStr)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer ${
                              selectedTestApiKey === keyStr
                                ? 'bg-amber-400 text-slate-950'
                                : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                            }`}
                          >
                            {selectedTestApiKey === keyStr ? 'يتم اختباره ✓' : 'اختبار بالروبوت'}
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              handleUpdateSubscriberRobot(sub.id, {
                                regenerateRobotApiKey: true
                              })
                            }
                            className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[11px] cursor-pointer"
                            title="توليد مفتاح جديد للعضو"
                          >
                            تغيير المفتاح
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
    </div>
  );
}
