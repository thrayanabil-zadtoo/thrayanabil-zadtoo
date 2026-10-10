import React, { useState, useEffect, useMemo } from 'react';
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
  subscribers: VipSubscriber[];
  setSubscribers: React.Dispatch<React.SetStateAction<VipSubscriber[]>>;
  signals: SignalItem[];
  liveMarket: LivePairSnapshot[];
  onTriggerSignalNow: () => void;
  onNavigateView: (view: 'visitor' | 'admin' | 'stats' | 'robot') => void;
}

export default function QuotexRobotAdminPage({
  robotSettings,
  setRobotSettings,
  subscribers,
  setSubscribers,
  signals,
  liveMarket,
  onTriggerSignalNow,
  onNavigateView
}: QuotexRobotAdminPageProps) {
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsSavedBadge, setSettingsSavedBadge] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Floating Widget Live Simulator State
  const [widgetMinimized, setWidgetMinimized] = useState(false);
  const [showWidgetInfo, setShowWidgetInfo] = useState(false);
  const [widgetMode, setWidgetMode] = useState<'AUTO' | 'MANUAL'>(robotSettings.defaultMode || 'AUTO');
  const [widgetStakeUsd, setWidgetStakeUsd] = useState<number>(robotSettings.defaultStakeUsd || 5);
  const [widgetSoundOn, setWidgetSoundOn] = useState<boolean>(robotSettings.soundAlertsEnabled ?? true);
  const [selectedTestApiKey, setSelectedTestApiKey] = useState<string>('QX-ADMIN-MASTER-TEST');
  const [apiFeedResponse, setApiFeedResponse] = useState<any>(null);
  const [isTestingApi, setIsTestingApi] = useState<boolean>(false);

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
    const directWins = signals.filter(s => s.status === 'WIN').length;
    const directLosses = signals.filter(s => s.status === 'LOSS' || s.status === 'WIN_GALE1').length;
    const pendingCount = signals.filter(s => s.status === 'PENDING').length;
    const totalFinished = directWins + directLosses;
    const winRate = totalFinished > 0 ? Math.round((directWins / totalFinished) * 100) : 100;
    return {
      wins: directWins,
      losses: directLosses,
      pending: pendingCount,
      total: totalFinished,
      winRate
    };
  }, [signals]);

  const latestSignal = signals[0] || null;

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
  }, [selectedTestApiKey, signals.length]);

  // Simulate receiving signal -> Alert -> Auto selecting Pair & Expiry -> Auto opening trade at entry time
  const handleSimulateFullCycle = () => {
    const targetPair = latestSignal?.asset || liveMarket[0]?.pair || 'EUR/USD';
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
      } else {
        setSimAlertBanner(
          `✋ الوضع اليدوي مفعل: الزوج (${targetPair}) والصلاحية جاهزان — اضغط زر الصعود أو الهبوط للتنفيذ`
        );
        setSimCountdownSec(0);
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

  // Always use the Public Shared URL (ais-pre) instead of the private Development URL (ais-dev)
  // so the floating robot on Quotex can connect to the API without authentication/cookie blocks.
  const rawOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const appOrigin = rawOrigin
    ? rawOrigin.replace('https://ais-dev-', 'https://ais-pre-')
    : 'https://ais-pre-vplsbzvt35dzg6l6qdryd4-317188159968.europe-west2.run.app';

  // Ready-to-inject Tampermonkey / Console Floating Universal Broker Robot Script for any selected API Key / Broker Account ID
  const generatedQuotexUserscript = useMemo(() => {
    const activeKey = selectedTestApiKey || 'QX-ADMIN-MASTER-TEST';
    return `// ==UserScript==
// @name         نَبض التداول - الروبوت العائم الشامل لجميع منصات البروكر (Universal Broker Robot)
// @namespace    ${appOrigin}
// @version      2.0
// @description  روبوت عائم مصغر يعمل على جميع منصات البروكر (كيوتكس، بوكيت أوبشن، أوليمب تريد، آي كيو أوبشن...) - تداول آلي ويدوي بدون مضاعفات نهائياً
// @match        *://*.qxbroker.com/*
// @match        *://*.quotex.io/*
// @match        *://*.broker-qx.pro/*
// @match        *://*.pocketoption.com/*
// @match        *://*.po.market/*
// @match        *://*.olymptrade.com/*
// @match        *://*.iqoption.com/*
// @match        *://*.binomo.com/*
// @grant        none
// ==/UserScript==

(function() {
  'use strict';
  const API_BASE = "${appOrigin}";
  let MEMBER_IDENTIFIER = localStorage.getItem("zad_broker_key") || "${activeKey}";
  let ROBOT_MODE = "AUTO"; // "AUTO" | "MANUAL"
  let LAST_EXECUTED_SIG_ID = "";

  // الكشف التلقائي عن اسم منصة البروكر المفتوحة
  const currentHost = window.location.hostname.toLowerCase();
  const brokerName = currentHost.includes("pocketoption") || currentHost.includes("po.market") ? "Pocket Option"
    : currentHost.includes("olymptrade") ? "Olymp Trade"
    : currentHost.includes("iqoption") ? "IQ Option"
    : currentHost.includes("binomo") ? "Binomo"
    : "Quotex";

  // إنشاء نافذة الروبوت العائمة والصغيرة الشاملة لجميع المنصات
  const widget = document.createElement("div");
  widget.id = "zad-universal-floating-robot";
  widget.dir = "rtl";
  widget.style.cssText = "position:fixed;top:70px;right:20px;z-index:9999999;width:280px;background:#0B0F17;border:1.5px solid #10b981;border-radius:14px;color:#f8fafc;font-family:system-ui,-apple-system,sans-serif;box-shadow:0 15px 35px rgba(0,0,0,0.85);padding:12px;user-select:none;font-size:12px;";
  widget.innerHTML = \`
    <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #1e293b;padding-bottom:8px;margin-bottom:8px;cursor:move;" id="zad-robot-header">
      <div style="display:flex;align-items:center;gap:6px;">
        <span style="width:9px;height:9px;border-radius:50%;background:#10b981;display:inline-block;"></span>
        <strong style="font-size:12px;color:#fff;">روبوت نَبض التداول</strong>
        <span style="font-size:10px;color:#38bdf8;background:#0c4a6e;padding:1px 5px;border-radius:4px;">\${brokerName}</span>
      </div>
      <div style="display:flex;align-items:center;gap:4px;">
        <button id="zad-info-btn" style="background:#1e293b;color:#38bdf8;border:1px solid #334155;border-radius:6px;padding:1px 6px;font-size:11px;font-weight:bold;cursor:pointer;" title="معلومات وتطوير">ℹ️ info</button>
        <span style="font-size:10px;background:#064e3b;color:#6ee7b7;padding:2px 5px;border-radius:6px;font-weight:bold;">0 مضاعفات</span>
      </div>
    </div>

    <!-- نافذة معلومات المبرمج والموقع وقناة التليجرام -->
    <div id="zad-info-panel" style="display:none;background:#0F172A;border:1px solid #38bdf8;border-radius:10px;padding:8px;margin-bottom:8px;font-size:11px;line-height:1.6;color:#e2e8f0;">
      <div style="font-weight:bold;color:#38bdf8;margin-bottom:4px;display:flex;justify-content:space-between;">
        <span>ℹ️ معلومات الروبوت</span>
        <span id="zad-close-info" style="cursor:pointer;color:#94a3b8;">✕</span>
      </div>
      <div>🌐 الموقع: <a href="https://fx.zadtoo.com" target="_blank" style="color:#10b981;text-decoration:none;font-weight:bold;">fx.zadtoo.com</a></div>
      <div>📢 التليجرام: <a href="https://t.me/ZadNBFX" target="_blank" style="color:#38bdf8;text-decoration:none;font-weight:bold;">قناة نَبض التداول @ZadNBFX</a></div>
      <div style="color:#fbbf24;font-size:10.5px;margin-top:2px;border-top:1px dashed #334155;padding-top:2px;">👨‍💻 إعداد وبرمجة: <b>Nabil Barakat</b></div>
    </div>

    <div style="font-size:11px;margin-bottom:8px;display:flex;justify-content:space-between;color:#cbd5e1;">
      <span>العضو: <b id="zad-robot-member" style="color:#fbbf24;">جاري التحقق...</b></span>
      <span>الصلاحية: <b id="zad-robot-days" style="color:#34d399;">--</b></span>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-bottom:8px;">
      <button id="zad-mode-auto" style="padding:5px;font-size:11px;font-weight:bold;border-radius:7px;border:1px solid #10b981;background:#10b981;color:#020617;cursor:pointer;">🤖 تداول آلي</button>
      <button id="zad-mode-manual" style="padding:5px;font-size:11px;font-weight:bold;border-radius:7px;border:1px solid #334155;background:#1e293b;color:#cbd5e1;cursor:pointer;">🖐️ تداول يدوي</button>
    </div>

    <div style="background:#111827;border:1px solid #1e293b;border-radius:9px;padding:8px;margin-bottom:8px;font-size:11px;">
      <div id="zad-robot-signal" style="color:#38bdf8;font-weight:bold;margin-bottom:4px;">📡 بانتظار الإشارة القادمة...</div>
      <div id="zad-robot-action" style="color:#94a3b8;font-size:10px;">اختيار الزوج والصلاحية M1 تلقائياً عند الموعد</div>
    </div>

    <div style="display:flex;justify-content:space-between;background:#0f172a;padding:6px 10px;border-radius:8px;font-size:11px;font-weight:bold;">
      <span style="color:#34d399;">✅ ربح: <b id="zad-robot-wins">0</b></span>
      <span style="color:#f87171;">❌ خسارة: <b id="zad-robot-losses">0</b></span>
      <span style="color:#fbbf24;">🎯 النسبة: <b id="zad-robot-rate">100%</b></span>
    </div>
  \`;
  document.body.appendChild(widget);

  // تبديل ظهور نافذة الـ Info
  const infoBtn = document.getElementById("zad-info-btn");
  const infoPanel = document.getElementById("zad-info-panel");
  const closeInfo = document.getElementById("zad-close-info");
  if (infoBtn && infoPanel) {
    infoBtn.onclick = () => { infoPanel.style.display = infoPanel.style.display === "none" ? "block" : "none"; };
    if (closeInfo) closeInfo.onclick = () => { infoPanel.style.display = "none"; };
  }

  // تبديل وضع التداول (آلي / يدوي)
  document.getElementById("zad-mode-auto").onclick = () => {
    ROBOT_MODE = "AUTO";
    document.getElementById("zad-mode-auto").style.background = "#10b981";
    document.getElementById("zad-mode-auto").style.color = "#020617";
    document.getElementById("zad-mode-manual").style.background = "#1e293b";
    document.getElementById("zad-mode-manual").style.color = "#cbd5e1";
  };
  document.getElementById("zad-mode-manual").onclick = () => {
    ROBOT_MODE = "MANUAL";
    document.getElementById("zad-mode-manual").style.background = "#f59e0b";
    document.getElementById("zad-mode-manual").style.color = "#020617";
    document.getElementById("zad-mode-auto").style.background = "#1e293b";
    document.getElementById("zad-mode-auto").style.color = "#cbd5e1";
  };

  // وظيفة النقر التلقائي الذكية الشاملة لجميع منصات البروكر
  function triggerBrokerTrade(direction) {
    try {
      const isCall = direction === "CALL";
      let btn = null;

      // 1. منصة كيوتكس Quotex
      btn = isCall ? document.querySelector(".call-btn, .section-deal__success button") : document.querySelector(".put-btn, .section-deal__danger button");

      // 2. منصة بوكيت أوبشن Pocket Option
      if (!btn) {
        btn = isCall ? document.querySelector(".btn-call, .btn-call__wrap, a[href*='call']") : document.querySelector(".btn-put, .btn-put__wrap, a[href*='put']");
      }

      // 3. منصة أوليمب تريد Olymp Trade
      if (!btn) {
        btn = isCall ? document.querySelector("button[data-test='deal-button-up']") : document.querySelector("button[data-test='deal-button-down']");
      }

      // 4. منصة آي كيو أوبشن IQ Option
      if (!btn) {
        btn = isCall ? document.querySelector(".SidebarCallButton, .call-btn") : document.querySelector(".SidebarPutButton, .put-btn");
      }

      if (btn) {
        btn.click();
        return true;
      }
    } catch(e) {}
    return false;
  }

  // فحص الـ API كل ثانيتين لجلب الإشارة والنتيجة واشتراك العضو المربوط برقم البروكر
  setInterval(async () => {
    try {
      const res = await fetch(\`\${API_BASE}/api/quotex-robot/feed?apiKey=\${encodeURIComponent(MEMBER_IDENTIFIER)}\`);
      const data = await res.json();
      if (!data.ok || !data.authorized) {
        document.getElementById("zad-robot-member").innerText = "غير مفعل";
        document.getElementById("zad-robot-signal").innerText = data.error || "تأكد من رقم حساب البروكر الخاص بك";
        return;
      }
      document.getElementById("zad-robot-member").innerText = data.member.name;
      document.getElementById("zad-robot-days").innerText = data.member.daysLeft + " يوم";
      document.getElementById("zad-robot-wins").innerText = data.statsNoMartingale.wins;
      document.getElementById("zad-robot-losses").innerText = data.statsNoMartingale.losses;
      document.getElementById("zad-robot-rate").innerText = data.statsNoMartingale.winRate + "%";

      const sig = data.activeSignal;
      if (sig) {
        document.getElementById("zad-robot-signal").innerText = \`\${sig.asset} | \${sig.directionArabic} | وقت \${sig.entryTime}\`;
        if (sig.status === "PENDING" && sig.id !== LAST_EXECUTED_SIG_ID) {
          document.getElementById("zad-robot-action").innerText = \`🔔 تم تحديد الزوج (\${sig.asset}) والصلاحية M1 — موعد الدخول \${sig.entryTime}\`;
          if (ROBOT_MODE === "AUTO" && sig.secondsUntilEntry <= 1 && sig.secondsUntilEntry >= -15) {
            LAST_EXECUTED_SIG_ID = sig.id;
            const clicked = triggerBrokerTrade(sig.direction);
            document.getElementById("zad-robot-action").innerText = clicked
              ? \`🚀 تم فتح صفقة \${sig.direction} تلقائياً على \${brokerName} بدون مضاعفات!\`
              : \`⚠️ حان موعد صفقة \${sig.direction}، اضغط زر التنفيذ يدوياً على المنصة\`;
          }
        }
      }
    } catch (e) {}
  }, 2000);
})();`;
  }, [appOrigin, selectedTestApiKey]);

  const filteredSubscribers = useMemo(() => {
    const q = searchMemberQuery.trim().toLowerCase();
    if (!q) return subscribers;
    return subscribers.filter(
      s =>
        s.name.toLowerCase().includes(q) ||
        (s.email || '').toLowerCase().includes(q) ||
        (s.brokerAccountId || '').toLowerCase().includes(q) ||
        (s.robotApiKey || '').toLowerCase().includes(q)
    );
  }, [subscribers, searchMemberQuery]);

  return (
    <div className="space-y-7">
      {/* Top Protected Admin Header & Under-Development Status Banner */}
      <div className="p-5 bg-gradient-to-r from-slate-900 via-[#0F172A] to-slate-900 border-2 border-emerald-500/40 rounded-2xl shadow-xl space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-amber-500/20 text-amber-300 border border-amber-400/40">
                <Lock className="w-3.5 h-3.5" />
                <span>
                  {robotSettings.isPublishedToVisitors
                    ? '🟢 معروض للزوار والأعضاء'
                    : '🚧 قيد التطوير — خاص بالمشرف فقط (مخفي تماماً عن الزوار)'}
                </span>
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>بدون مضاعفات نهائياً (0 Martingale)</span>
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-sky-500/15 text-sky-300 border border-sky-500/30">
                <Radio className="w-3.5 h-3.5" />
                <span>مربوط بـ API الموقع مباشرة</span>
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              🤖 التداول الآلي — روبوت منصة كيوتكس العائم (Quotex Auto Robot)
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-3xl">
              هذه الصفحة خاصة بالمشرف لتطوير واختبار وإدارة <strong className="text-emerald-300">روبوت التداول الآلي العائم على صفحة كيوتكس</strong>. يستقبل الروبوت الإشارة والنتيجة واشتراك العضو عبر <strong className="text-amber-300">API الموقع</strong>، ويصدر تنبيهاً صوتياً ومرئياً فور وصول الإشارة، ويختار الزوج والصلاحية تلقائياً، ويفتح الصفقة في موعدها بدقة بدون أي مضاعفات.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {/* Toggle Visibility to Visitors (Default: Hidden / Under Development) */}
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
                  ? 'الحالة: منشور للزوار (اضغط للإخفاء)'
                  : 'الحالة: مخفي عن الزوار - قيد التطوير (اضغط للنشر عند الانتهاء)'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => onNavigateView('admin')}
              className="px-3.5 py-2.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 cursor-pointer"
            >
              العودة للوحة المشرف
            </button>
          </div>
        </div>

        {/* Summary Capabilities Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 text-xs">
          <div className="p-3 bg-[#0B0F17] border border-slate-800 rounded-xl">
            <div className="text-[11px] text-slate-400">وضع التشغيل</div>
            <div className="font-extrabold text-emerald-400 mt-0.5">تداول آلي أو يدوي</div>
          </div>
          <div className="p-3 bg-[#0B0F17] border border-slate-800 rounded-xl">
            <div className="text-[11px] text-slate-400">نظام المضاعفات</div>
            <div className="font-extrabold text-amber-300 mt-0.5">بدون مضاعفات (0)</div>
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
            <div className="font-extrabold text-emerald-400 mt-0.5">نشط (إشارة + نتيجة)</div>
          </div>
          <div className="p-3 bg-[#0B0F17] border border-slate-800 rounded-xl">
            <div className="text-[11px] text-slate-400">مفاتيح الأعضاء النشطة</div>
            <div className="font-extrabold text-amber-300 mt-0.5 font-mono-num">
              {subscribers.filter(s => s.robotEnabled !== false).length} مفتاح خاص
            </div>
          </div>
        </div>
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
                onClick={handleSimulateFullCycle}
                className="px-3.5 py-2 text-xs font-extrabold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-md"
              >
                <Play className="w-3.5 h-3.5" />
                <span>تجربة وصول إشارة وفتح صفقة تلقائياً الآن</span>
              </button>
              <button
                type="button"
                onClick={onTriggerSignalNow}
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

            {/* Background Quotex Chart Grid & Simulated Execution Buttons */}
            <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-4 items-center my-2">
              <div className="md:col-span-7 space-y-3 p-3 bg-[#060911]/90 border border-slate-800/80 rounded-xl">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>شارت كيوتكس المباشر ({simQuotexPair})</span>
                  <span className="text-emerald-400 font-mono-num">
                    {latestSignal?.livePrice || liveMarket[0]?.formattedPrice || '1.08460'}
                  </span>
                </div>
                <div className="h-36 flex items-end gap-1.5 px-2 pt-4 pb-2 bg-[#04070D] rounded-lg border border-slate-800/50">
                  {[42, 55, 48, 63, 59, 71, 66, 52, 68, 78, 74, 86, 80, 91].map((h, i) => {
                    const isUp = i % 3 !== 0;
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                        <div
                          className={`w-0.5 h-3 ${isUp ? 'bg-emerald-500/60' : 'bg-rose-500/60'}`}
                        />
                        <div
                          style={{ height: `${h}px` }}
                          className={`w-full rounded-sm ${
                            isUp ? 'bg-emerald-500/80' : 'bg-rose-500/80'
                          }`}
                        />
                        <div
                          className={`w-0.5 h-2 ${isUp ? 'bg-emerald-500/60' : 'bg-rose-500/60'}`}
                        />
                      </div>
                    );
                  })}
                </div>
                <div className="grid grid-cols-2 gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      playRobotAlertSound('open');
                      setSimAutoTradeStatus('TRADE_OPENED');
                      setSimAlertBanner(
                        `🟢 تم فتح صفقة صعود (CALL) على الزوج ${simQuotexPair} بقيمة $${widgetStakeUsd} بدون مضاعفات`
                      );
                    }}
                    className={`py-2.5 px-3 rounded-xl font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                      simAutoTradeStatus === 'TRADE_OPENED' &&
                      (latestSignal?.direction || 'CALL') === 'CALL'
                        ? 'bg-emerald-400 text-slate-950 ring-4 ring-emerald-400/40'
                        : 'bg-emerald-600 hover:bg-emerald-500 text-white'
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
                        `🔴 تم فتح صفقة هبوط (PUT) على الزوج ${simQuotexPair} بقيمة $${widgetStakeUsd} بدون مضاعفات`
                      );
                    }}
                    className={`py-2.5 px-3 rounded-xl font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                      simAutoTradeStatus === 'TRADE_OPENED' && latestSignal?.direction === 'PUT'
                        ? 'bg-rose-400 text-slate-950 ring-4 ring-rose-400/40'
                        : 'bg-rose-600 hover:bg-rose-500 text-white'
                    }`}
                  >
                    <span>🔴 هبوط (PUT DOWN)</span>
                  </button>
                </div>
              </div>

              {/* =========================================================
                  THE FLOATING COMPACT QUOTEX ROBOT WIDGET (الروبوت الصغير العائم)
                  ========================================================= */}
              <div className="md:col-span-5 flex justify-center">
                <div className="w-full max-w-[295px] bg-[#0B0F17]/95 backdrop-blur-md border-2 border-emerald-400/80 rounded-2xl shadow-[0_15px_40px_rgba(16,185,129,0.25)] overflow-hidden transition-all">
                  {/* Compact Floating Header */}
                  <div className="px-3.5 py-2.5 bg-gradient-to-r from-emerald-950/90 via-slate-900 to-slate-900 border-b border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="relative flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                      </span>
                      <span className="text-xs font-extrabold text-white">
                        روبوت نَبض التداول
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setShowWidgetInfo(!showWidgetInfo)}
                        className={`px-1.5 py-0.5 text-[10px] font-bold rounded border transition-colors cursor-pointer ${
                          showWidgetInfo
                            ? 'bg-sky-500 text-slate-950 border-sky-400'
                            : 'bg-slate-800 hover:bg-slate-700 text-sky-300 border-slate-700'
                        }`}
                        title="معلومات الروبوت والبرمجة"
                      >
                        ℹ️ info
                      </button>
                      <span className="px-2 py-0.5 text-[10px] font-extrabold rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        0 مضاعفات
                      </span>
                      <button
                        type="button"
                        onClick={() => setWidgetMinimized(!widgetMinimized)}
                        className="px-1.5 py-0.5 text-[10px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 rounded cursor-pointer"
                        title="تصغير / تكبير الروبوت العائم"
                      >
                        {widgetMinimized ? 'تكبير +' : 'تصغير −'}
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
                          <span className="text-slate-400">📢 قناة التليجرام:</span>
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

                      {/* Active Signal & Auto Pair/Expiry Box */}
                      <div className="p-2.5 bg-[#070A10] border border-emerald-500/30 rounded-xl space-y-1.5">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-sky-300 font-bold flex items-center gap-1">
                            <Radio className="w-3 h-3 text-emerald-400" />
                            <span>إشارة الـ API الحالية:</span>
                          </span>
                          <span className="font-mono-num text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-amber-300">
                            {latestSignal ? `الدقيقة ${latestSignal.entryTime}` : 'بانتظار إشارة'}
                          </span>
                        </div>

                        {latestSignal ? (
                          <div className="flex items-center justify-between pt-1">
                            <div>
                              <div className="text-sm font-extrabold text-white font-mono-num">
                                {latestSignal.asset}
                              </div>
                              <div className="text-[10px] text-slate-400">
                                الصلاحية: M1 (دقيقة واحدة)
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
                        ) : (
                          <div className="text-[11px] text-slate-400 py-1">
                            الروبوت متصل بالـ API ومستعد لاختيار الزوج وفتح الصفقة فور صدورها.
                          </div>
                        )}
                      </div>

                      {/* Win / Loss Counter (Strictly 0 Martingale) */}
                      <div className="grid grid-cols-3 gap-1.5 text-center">
                        <div className="p-2 bg-emerald-950/40 border border-emerald-500/30 rounded-lg">
                          <div className="text-[10px] text-emerald-300">✅ الرابحة</div>
                          <div className="text-sm font-extrabold text-emerald-400 font-mono-num">
                            {robotZeroGaleStats.wins}
                          </div>
                        </div>
                        <div className="p-2 bg-rose-950/40 border border-rose-500/30 rounded-lg">
                          <div className="text-[10px] text-rose-300">❌ الخاسرة</div>
                          <div className="text-sm font-extrabold text-rose-400 font-mono-num">
                            {robotZeroGaleStats.losses}
                          </div>
                        </div>
                        <div className="p-2 bg-amber-950/40 border border-amber-500/30 rounded-lg">
                          <div className="text-[10px] text-amber-300">🎯 النسبة</div>
                          <div className="text-sm font-extrabold text-amber-300 font-mono-num">
                            {robotZeroGaleStats.winRate}%
                          </div>
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
                        ✅ {robotZeroGaleStats.wins} | ❌ {robotZeroGaleStats.losses}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

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
                <div className="p-2.5 bg-emerald-950/30 border border-emerald-500/40 rounded-xl flex items-center justify-between">
                  <span className="font-bold text-emerald-300">
                    🛡️ تداول بدون مضاعفات نهائياً (0 Martingale)
                  </span>
                  <span className="px-2 py-0.5 text-[10px] font-extrabold bg-emerald-500 text-slate-950 rounded">
                    إجباري مفعل دائماً
                  </span>
                </div>

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

            <div className="space-y-1.5">
              <div className="text-[11px] text-slate-400">رابط الـ API المباشر للروبوت:</div>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  readOnly
                  dir="ltr"
                  value={`${appOrigin}/api/quotex-robot/feed?apiKey=${selectedTestApiKey}`}
                  className="flex-1 px-2.5 py-1.5 bg-[#0B0F17] border border-slate-800 rounded-lg text-[11px] font-mono-num text-emerald-300"
                />
                <button
                  type="button"
                  onClick={() =>
                    handleCopy(
                      `${appOrigin}/api/quotex-robot/feed?apiKey=${selectedTestApiKey}`,
                      'api-url'
                    )
                  }
                  className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-[11px] font-bold cursor-pointer shrink-0"
                >
                  {copiedId === 'api-url' ? 'تم النسخ ✓' : 'نسخ API'}
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-[11px] text-slate-400">
                معاينة حية للبيانات التي يأخذها الروبوت من الموقع الآن:
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

            <button
              type="button"
              onClick={() => handleCopy(generatedQuotexUserscript, 'userscript-code')}
              className="w-full py-2.5 px-3 bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>
                {copiedId === 'userscript-code'
                  ? '✓ تم نسخ كود الروبوت العائم لصفحة كيوتكس!'
                  : 'نسخ كود سكريبت الروبوت العائم لصفحة كيوتكس (Tampermonkey)'}
              </span>
            </button>
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
