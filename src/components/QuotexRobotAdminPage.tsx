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
  const [simTestFeedback, setSimTestFeedback] = useState<string | null>(null);

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

  useEffect(() => {
    if (latestSignal?.asset && latestSignal.status === 'PENDING') {
      setSimQuotexPair(latestSignal.asset);
    }
  }, [latestSignal?.id, latestSignal?.asset, latestSignal?.status]);

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
          `🚀 تم فتح صفقة ${
            targetDir === 'CALL' ? 'صعود CALL 🟢' : 'هبوط PUT 🔴'
          } تلقائياً على ${targetPair} بقيمة $${widgetStakeUsd} — الصفقة جارية الآن طوال فترة فتحها!`
        );
        setSimCountdownSec(60);
        let s = 60;
        const tick = setInterval(() => {
          s -= 6;
          if (s <= 0) {
            clearInterval(tick);
            setSimAutoTradeStatus('IDLE');
            setSimAlertBanner(null);
            setSimCountdownSec(0);
          } else {
            setSimCountdownSec(s);
          }
        }, 1000);
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

  const handleDownloadUserscript = async () => {
    try {
      let code = canonicalUserscript;
      if (!code) {
        const key = selectedTestApiKey || 'QX-ADMIN-MASTER-TEST';
        const res = await fetch(`/api/quotex-robot/zad-broker-robot.user.js?apiKey=${encodeURIComponent(key)}`);
        code = await res.text();
        setCanonicalUserscript(code);
      }
      const blob = new Blob([code], { type: 'text/javascript;charset=utf-8' });
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

  const [isRestoringGolden, setIsRestoringGolden] = useState<boolean>(false);
  const [goldenRestoreMessage, setGoldenRestoreMessage] = useState<string | null>(null);

  const handleDownloadGoldenScript = async () => {
    try {
      const key = selectedTestApiKey || 'QX-ADMIN-MASTER-TEST';
      const res = await fetch(`/api/quotex-robot/golden-reference.user.js?apiKey=${encodeURIComponent(key)}`);
      const code = await res.text();
      const blob = new Blob([code], { type: 'text/javascript;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'zad-broker-robot.golden-v3.6.user.js';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch(e) {
      console.error('Download golden error:', e);
    }
  };

  const handleRestoreGoldenBaseline = async () => {
    if (!window.confirm('🔒 هل أنت متأكد من رغبتك في استعادة وتثبيت النسخة المرجعية الذهبية (v3.6 Golden Baseline)؟\nسيتم تثبيت كود محرك التبديل والتداول المعتمد بنسبة 100% كمرجع أساسي.')) {
      return;
    }
    setIsRestoringGolden(true);
    setGoldenRestoreMessage(null);
    try {
      const res = await fetch('/api/quotex-robot/restore-golden-baseline', { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        setGoldenRestoreMessage(data.message || '✅ تم تثبيت واستعادة النسخة المرجعية الذهبية بنجاح!');
        const key = selectedTestApiKey || 'QX-ADMIN-MASTER-TEST';
        const txt = await fetch(`/api/quotex-robot/zad-broker-robot.user.js?apiKey=${encodeURIComponent(key)}`).then(r => r.text());
        setCanonicalUserscript(txt);
      } else {
        setGoldenRestoreMessage('❌ فشل: ' + (data.error || 'تعذر الاستعادة'));
      }
    } catch (err: any) {
      setGoldenRestoreMessage('❌ خطأ: ' + err.message);
    } finally {
      setIsRestoringGolden(false);
      setTimeout(() => setGoldenRestoreMessage(null), 7000);
    }
  };

  // Primary Official Domain & Current App Origin
  const officialDomain = 'https://fx.zadtoo.com';
  const appOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://fx.zadtoo.com';

  // Canonical Userscript loaded dynamically from server endpoint (single source of truth)
  const [canonicalUserscript, setCanonicalUserscript] = useState<string>('');

  useEffect(() => {
    const key = selectedTestApiKey || 'QX-ADMIN-MASTER-TEST';
    fetch(`/api/quotex-robot/zad-broker-robot.user.js?apiKey=${encodeURIComponent(key)}`)
      .then(res => res.text())
      .then(txt => {
        if (txt && txt.length > 500) {
          setCanonicalUserscript(txt);
        }
      })
      .catch((err) => {
        console.warn('Failed to load canonical userscript from endpoint:', err);
      });
  }, [selectedTestApiKey]);

  const handleCopyUserscript = async () => {
    try {
      let code = canonicalUserscript;
      if (!code) {
        const key = selectedTestApiKey || 'QX-ADMIN-MASTER-TEST';
        const res = await fetch(`/api/quotex-robot/zad-broker-robot.user.js?apiKey=${encodeURIComponent(key)}`);
        code = await res.text();
        setCanonicalUserscript(code);
      }
      handleCopy(code, 'userscript-code');
    } catch(e) {
      console.error('Copy error:', e);
    }
  };

  const generatedQuotexUserscript = canonicalUserscript;

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
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 text-xs">
          <div className="p-3 bg-[#0B0F17] border border-slate-800 rounded-xl">
            <div className="text-[11px] text-slate-400">ساعات عمل الروبوت</div>
            <div className="font-extrabold text-sky-300 mt-0.5 font-mono-num">10:00 ص - 06:00 م</div>
          </div>
          <div className="p-3 bg-[#0B0F17] border border-slate-800 rounded-xl">
            <div className="text-[11px] text-slate-400">فترة مسح السوق</div>
            <div className="font-extrabold text-amber-300 mt-0.5">إحماء 10 د عند البدء</div>
          </div>
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
                  {['EUR/JPY', 'EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CAD', 'EUR/GBP', 'GOLD (XAU/USD)'].map(pair => (
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
                    ? 'fixed bottom-8 left-8 z-[99999] shadow-[0_20px_50px_rgba(0,0,0,0.95),0_0_30px_rgba(16,185,129,0.35)]'
                    : 'absolute top-4 left-2 sm:top-8 sm:left-4 z-30 shadow-[0_15px_40px_rgba(0,0,0,0.85),0_0_25px_rgba(16,185,129,0.3)]'
                } w-full max-w-[250px] bg-[#0B0F17]/95 backdrop-blur-md border border-emerald-400/90 rounded-xl overflow-hidden select-none transition-shadow`}
              >
                {/* Compact Floating Header - Draggable */}
                <div
                  onMouseDown={handleDragStart}
                  onTouchStart={handleTouchStart}
                  className="px-2.5 py-1.5 bg-gradient-to-r from-emerald-950/90 via-slate-900 to-slate-900 border-b border-slate-800 flex items-center justify-between cursor-move"
                  title="اضغط واسحب لتحريك النافذة العائمة"
                >
                      <div className="flex items-center gap-1.5">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                        </span>
                        <span className="text-[11px] font-extrabold text-white">
                          روبوت ZAD FX
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => toggleScreenFloating()}
                          className={`px-1 py-0.5 text-[9px] font-bold rounded border transition-colors cursor-pointer ${
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
                          className={`px-1 py-0.5 text-[9px] font-bold rounded border transition-colors cursor-pointer ${
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
                          className={`px-1 py-0.5 text-[9px] font-bold rounded border transition-colors cursor-pointer flex items-center gap-0.5 ${
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
                          className="px-1 py-0.5 text-[9px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 rounded cursor-pointer"
                          title="تصغير / تكبير الروبوت العائم"
                        >
                          {widgetMinimized ? '+' : '−'}
                        </button>
                        <button
                          type="button"
                          onClick={handleCloseRobot}
                          className="text-slate-400 hover:text-rose-400 p-0.5 cursor-pointer text-xs font-bold leading-none transition-colors ml-0.5"
                          title="إغلاق"
                        >
                          ✕
                        </button>
                      </div>
                    </div>

                  {/* Info Modal / Drawer inside Widget */}
                  {showWidgetInfo && !widgetMinimized && (
                    <div className="m-2 p-2 bg-gradient-to-br from-[#0F172A] to-slate-900 border border-sky-500/50 rounded-lg space-y-1.5 text-[10px] shadow-lg animate-in fade-in duration-200">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-1">
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
                      <div className="space-y-1 leading-relaxed text-slate-300">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">🌐 الموقع:</span>
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
                          <span className="text-slate-400">📢 القناة:</span>
                          <a
                            href="https://t.me/ZadNBFX"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-bold text-sky-400 hover:underline flex items-center gap-1"
                          >
                            <span>@ZadNBFX</span>
                          </a>
                        </div>
                        <div className="pt-1 border-t border-slate-800/80 flex items-center justify-between text-[9.5px]">
                          <span className="text-slate-400">👨‍💻 برمجة:</span>
                          <strong className="text-amber-300 font-bold">Nabil Barakat</strong>
                        </div>
                      </div>
                    </div>
                  )}

                  {!widgetMinimized ? (
                    <div className="p-2.5 space-y-2 text-[10.5px]">
                      {/* Member Subscription & Key Status Row */}
                      <div className="p-2 bg-slate-900/90 border border-slate-800 rounded-lg space-y-1">
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-slate-400">العضو المشترك:</span>
                          <strong className="text-amber-300 truncate max-w-[130px]">
                            {apiFeedResponse?.member?.name || 'حساب المشرف التجريبي'}
                          </strong>
                        </div>
                        <div className="flex items-center justify-between text-[10px]">
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
                        <div className="p-1.5 bg-gradient-to-r from-emerald-950 via-[#032e22] to-slate-900 border border-emerald-500/50 rounded-lg flex items-center justify-between gap-1.5 shadow-lg animate-in fade-in duration-200">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="relative flex h-1.5 w-1.5 flex-shrink-0">
                              <span className={`absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 ${isQuranPlaying ? 'animate-ping' : ''}`} />
                              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
                            </span>
                            <div className="truncate">
                              <div className="text-[9.5px] font-extrabold text-emerald-200 truncate flex items-center gap-1">
                                <span>📖</span>
                                <span>الشيخ ماهر المعيقلي</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button
                              type="button"
                              onClick={handleToggleQuranPlayPause}
                              className="px-1.5 py-0.5 text-[9px] font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded cursor-pointer transition-colors shadow"
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
                      <div className="grid grid-cols-2 gap-1 p-0.5 bg-slate-900 border border-slate-800 rounded-lg">
                        <button
                          type="button"
                          onClick={() => setWidgetMode('AUTO')}
                          className={`py-1 px-1.5 rounded-md text-[10px] font-extrabold transition-all cursor-pointer flex items-center justify-center gap-1 ${
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
                          className={`py-1 px-1.5 rounded-md text-[10px] font-extrabold transition-all cursor-pointer flex items-center justify-center gap-1 ${
                            widgetMode === 'MANUAL'
                              ? 'bg-amber-400 text-slate-950 shadow'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          <span>🖐️ تداول يدوي</span>
                        </button>
                      </div>

                      {/* مزامنة سحابية حصرية مع الإشارات المعتمدة */}
                      <div className="flex items-center justify-between px-2 py-1 bg-[#09121f] border border-sky-900/50 rounded-lg text-[9.5px]">
                        <span className="flex items-center gap-1 text-slate-200">
                          <span className="text-sky-400">⚡</span>
                          <span className="font-bold text-sky-300">مزامنة سحابية معتمدة</span>
                        </span>
                        <span className="text-[8.5px] font-bold px-1 py-0.2 rounded border text-emerald-300 bg-emerald-500/15 border-emerald-500/30">
                          مفعلة ✓
                        </span>
                      </div>

                      {/* Active Signal & Auto Pair/Expiry Box */}
                      <div className="p-2 bg-[#070A10] border border-emerald-500/30 rounded-lg space-y-1">
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-sky-300 font-bold flex items-center gap-1">
                            <Radio className="w-2.5 h-2.5 text-emerald-400" />
                            <span>حالة الإشارة:</span>
                          </span>
                          <span className="font-mono-num text-[9.5px] px-1 py-0.5 rounded bg-slate-800 text-amber-300">
                            {latestSignal ? `الدقيقة ${latestSignal.entryTime}` : isGlobalMarketOpen ? 'بانتظار إشارة' : 'مغلق السوق'}
                          </span>
                        </div>

                        {simAutoTradeStatus === 'TRADE_OPENED' ? (
                          <div className="p-2 bg-gradient-to-br from-emerald-950 via-[#022c22] to-slate-900 border border-emerald-500 rounded-lg space-y-1 text-center shadow-[0_0_15px_rgba(16,185,129,0.35)]">
                            <div className="flex items-center justify-between">
                              <span className="text-emerald-300 font-extrabold text-[10px] flex items-center gap-1">
                                <span className="animate-pulse">⚡</span>
                                <span>الصفقة جارية بالمنصة</span>
                              </span>
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                                M1 (60ث)
                              </span>
                            </div>
                            <div className="flex items-center justify-between bg-black/40 px-2 py-0.5 rounded text-[9.5px]">
                              <span className="text-slate-400">🎯 الزوج: <b className="text-sky-400 font-mono">{simQuotexPair}</b></span>
                              <span className="text-slate-300">الصلاحية: <b>60 ثانية</b></span>
                            </div>
                            <div className="p-1 bg-[#022c22] border border-emerald-500/50 rounded">
                              <div className="text-[9px] text-emerald-200">⏳ متبقي على الانتهاء:</div>
                              <div className="text-sm font-black font-mono-num text-amber-300">
                                {simCountdownSec > 0 ? `${simCountdownSec} ثانية` : 'الصفقة مفتوحة (جارية)'}
                              </div>
                            </div>
                            <div className="text-[8.5px] text-slate-400">
                              📊 مفتوحة بحسابك — بانتظار إغلاق الشمعة
                            </div>
                          </div>
                        ) : latestSignal && latestSignal.status === 'PENDING' ? (
                          <div className="space-y-1 pt-0.5">
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="text-xs font-extrabold text-white font-mono-num flex items-center gap-1">
                                  <span>{latestSignal.asset}</span>
                                  <span className="text-[8.5px] text-emerald-300 bg-emerald-950 px-1 py-0.2 rounded border border-emerald-800">
                                    مؤكدة 🎯
                                  </span>
                                </div>
                                <div className="text-[9px] text-slate-400">
                                  الدخول: :00 (افتتاح الشمعة) | 60 ثانية
                                </div>
                              </div>
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                                  latestSignal.direction === 'CALL'
                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                    : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                                }`}
                              >
                                {latestSignal.direction === 'CALL' ? 'صعود 🟢' : 'هبوط 🔴'}
                              </span>
                            </div>

                            <div className="text-[9.5px] font-bold text-emerald-400 bg-emerald-950/40 border border-emerald-500/30 rounded py-0.5 text-center">
                              🎯 جاهز للتنفيذ ({widgetMode === 'AUTO' ? 'آلياً' : 'يدوياً'}) عند ثانية :00
                            </div>
                          </div>
                        ) : !isGlobalMarketOpen ? (
                          <div className="p-2 bg-rose-950/20 rounded-lg border border-rose-500/40 text-[10px] text-rose-300 text-center space-y-0.5">
                            <div className="flex items-center justify-center gap-1.5 font-black text-xs text-rose-400">
                              <span>🔴</span>
                              <span>مغلق السوق</span>
                            </div>
                            <p className="text-[9px] text-slate-400">السوق العالمي في عطلة أسبوعية</p>
                          </div>
                        ) : (
                          <div className="p-2 bg-[#09121d] rounded-lg border border-amber-500/40 text-[10px] text-slate-300 space-y-1 text-center">
                            <div className="flex items-center justify-center gap-1.5 text-amber-300 font-bold text-xs">
                              <span>⏸️</span>
                              <span>وضع الانتظار (WAIT)</span>
                            </div>
                            <p className="text-[9px] text-slate-400">جاري مسح السوق — لن يتم التكرار</p>
                            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#061b2d] border border-sky-500/40 text-[9.5px] font-mono-num text-sky-300">
                              <span>⏳ اكتمال الشمعة:</span>
                              <b className="text-sky-400 font-bold">{60 - (new Date().getSeconds())} ثانية</b>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Three Result-Framed Colored Boxes (ربح - خسارة - النسبة) with Direct Click Increment (Without Hint/Explanation) */}
                      <div className="grid grid-cols-3 gap-1.5 text-center pt-0.5 select-none">
                        {/* 1. Wins Box (Green Border) */}
                        <div
                          onClick={() => setManualWins(prev => prev + 1)}
                          className="p-1.5 bg-emerald-950/30 hover:bg-emerald-950/50 border border-emerald-500/80 rounded-lg flex flex-col items-center justify-center cursor-pointer shadow-[0_0_10px_rgba(16,185,129,0.15)] transition-all active:scale-95"
                        >
                          <span className="text-[9.5px] font-bold text-emerald-300">✅ ربح</span>
                          <span className="text-sm font-black text-white font-mono-num mt-0.5">
                            {manualWins}
                          </span>
                        </div>

                        {/* 2. Losses Box (Red Border) */}
                        <div
                          onClick={() => setManualLosses(prev => prev + 1)}
                          className="p-1.5 bg-rose-950/30 hover:bg-rose-950/50 border border-rose-500/80 rounded-lg flex flex-col items-center justify-center cursor-pointer shadow-[0_0_10px_rgba(239,68,68,0.15)] transition-all active:scale-95"
                        >
                          <span className="text-[9.5px] font-bold text-rose-300">❌ خسارة</span>
                          <span className="text-sm font-black text-white font-mono-num mt-0.5">
                            {manualLosses}
                          </span>
                        </div>

                        {/* 3. Win Rate Box (Amber Border) */}
                        <div className="p-1.5 bg-amber-950/30 border border-amber-500/80 rounded-lg flex flex-col items-center justify-center shadow-[0_0_10px_rgba(245,158,11,0.15)]">
                          <span className="text-[9.5px] font-bold text-amber-300">🎯 النسبة</span>
                          <span className="text-sm font-black text-amber-300 font-mono-num mt-0.5">
                            {manualRate}%
                          </span>
                        </div>
                      </div>

                      {/* قسم تجربة واختبار أزرار المنصة في الواجهة */}
                      <div className="p-2 bg-[#090d16] border border-slate-800 rounded-lg space-y-1.5 text-[9.5px]">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-sky-400 flex items-center gap-1">
                            <span>🛠️</span>
                            <span>اختبار أزرار المنصة:</span>
                          </span>
                          <span className="text-[8.5px] font-bold text-amber-300 bg-amber-950/60 px-1 py-0.5 rounded border border-amber-800/60">
                            📌 تثبيت يدوي متاح
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setSimTestFeedback('✅ تم اختبار زر الشراء (CALL 🟢): الزر مكتشف وجاهز للتنفيذ بالثانية!');
                              setTimeout(() => setSimTestFeedback(null), 5000);
                            }}
                            className="py-1 px-1 bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-500/80 text-emerald-300 rounded font-extrabold text-[9.5px] cursor-pointer flex items-center justify-center gap-1 transition-all active:scale-95 shadow"
                          >
                            <span>🟢 شراء (CALL)</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSimTestFeedback('✅ تم اختبار زر البيع (PUT 🔴): الزر مكتشف وجاهز للتنفيذ بالثانية!');
                              setTimeout(() => setSimTestFeedback(null), 5000);
                            }}
                            className="py-1 px-1 bg-rose-950/80 hover:bg-rose-900 border border-rose-500/80 text-rose-300 rounded font-extrabold text-[9.5px] cursor-pointer flex items-center justify-center gap-1 transition-all active:scale-95 shadow"
                          >
                            <span>🔴 بيع (PUT)</span>
                          </button>
                        </div>
                        {simTestFeedback && (
                          <div className="p-1 bg-emerald-950/40 border border-emerald-500/40 rounded text-emerald-300 font-bold text-center text-[9px] animate-in fade-in duration-200">
                            {simTestFeedback}
                          </div>
                        )}
                      </div>

                      {/* Stake & Sound Quick Controls */}
                      <div className="flex items-center justify-between gap-1.5 pt-1 border-t border-slate-800 text-[10px]">
                        <div className="flex items-center gap-1">
                          <span className="text-slate-400">المبلغ:</span>
                          {[1, 5, 10, 20].map(amt => (
                            <button
                              key={amt}
                              type="button"
                              onClick={() => setWidgetStakeUsd(amt)}
                              className={`px-1 py-0.5 rounded font-mono-num font-bold cursor-pointer text-[9.5px] ${
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
                          className={`px-1.5 py-0.5 rounded font-bold cursor-pointer text-[9.5px] ${
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
                    <div className="px-2.5 py-1.5 flex items-center justify-between text-[10px] text-slate-300">
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
                onClick={handleCopyUserscript}
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

            {/* GOLDEN REFERENCE BASELINE LOCK CARD (النسخة المرجعية الذهبية المعتمدة والمقفولة) */}
            <div className="p-4 bg-gradient-to-r from-amber-950/40 via-slate-950 to-amber-950/30 border-2 border-amber-500/60 rounded-xl space-y-3 shadow-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-400/50 flex items-center justify-center text-amber-300 font-bold text-sm">
                    🔒
                  </span>
                  <div>
                    <h4 className="text-xs font-extrabold text-amber-300 flex items-center gap-1.5">
                      <span>النسخة المرجعية الذهبية المعتمدة (v3.6 Golden Baseline)</span>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[9px] font-bold">
                        محمية ومقفولة
                      </span>
                    </h4>
                    <p className="text-[10.5px] text-slate-400 mt-0.5">
                      تم حفظ وتجميد محرك النقر والتبديل واختيار الشارت المعتمد كمرجع دائم لا يتأثر بأي تعديلات في العضويات أو المؤشرات.
                    </p>
                  </div>
                </div>
              </div>

              {goldenRestoreMessage && (
                <div className="p-2.5 rounded-lg bg-emerald-950/90 border border-emerald-500/50 text-emerald-200 text-xs font-bold flex items-center gap-2 animate-fade-in">
                  <span>{goldenRestoreMessage}</span>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-amber-500/20">
                <button
                  type="button"
                  onClick={handleRestoreGoldenBaseline}
                  disabled={isRestoringGolden}
                  className="px-3 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-extrabold rounded-lg text-xs transition-all cursor-pointer flex items-center gap-1.5 shadow"
                >
                  <span>{isRestoringGolden ? '⏳ جاري الاستعادة...' : '🔄 استعادة وتثبيت النسخة الذهبية بنقرة واحدة'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleDownloadGoldenScript}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/40 font-bold rounded-lg text-xs transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <span>📥 تحميل نسخة الاحتياط الذهبية (.user.js)</span>
                </button>

                <a
                  href="/api/quotex-robot/golden-reference.user.js"
                  target="_blank"
                  rel="noreferrer"
                  className="px-2.5 py-2 text-[11px] text-slate-400 hover:text-white underline underline-offset-4"
                >
                  عرض الكود المرجعي الخام ↗
                </a>
              </div>
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
