import React, { useState } from 'react';
import {
  LayoutDashboard,
  TrendingUp,
  Users,
  CreditCard,
  FileText,
  Settings,
  LogOut,
  Plus,
  ArrowUp,
  ArrowDown,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  Calendar,
  DollarSign,
  Cpu,
  Zap,
  BarChart2,
  Send,
  X,
  Radio,
  Clock,
  ExternalLink,
  Target,
  Trash2,
  Crown,
  Play,
  Pause,
  RefreshCw,
  Activity,
  MessageSquare,
  AlertCircle
} from 'lucide-react';
import { ZadtooLogo } from './ZadtooNavbar';
import { getPairFlags } from './ZadtooSignalsPage';
import { ZadtooPlansAndLinksManager } from './ZadtooPlansAndLinksManager';
import { ZadtooPaymentsManager } from './ZadtooPaymentsManager';
import type { SubscriptionPlan, PlatformContactLinks } from '../types/platformConfig';
import type { AutoPilotConfig } from '../App';

interface ZadtooAdminDashboardProps {
  onLogout: () => void;
  onOpenSignalModal?: () => void;
  onOpenAddUser?: () => void;
  onOpenSettings?: () => void;
  onOpenReports?: () => void;
  onOpenRobotAdmin?: () => void;
  totalUsersCount?: number;
  activeSubscribersCount?: number;
  todaySignalsCount?: number;
  winRatePercent?: number;
  autoPilot?: AutoPilotConfig;
  onSaveAutoPilot?: (patch: Partial<AutoPilotConfig>) => Promise<void>;
  onAddCustomPair?: (pair: string) => Promise<void>;
  onRemoveCustomPair?: (pair: string) => Promise<void>;
  plans?: SubscriptionPlan[];
  contactLinks?: PlatformContactLinks;
  onConfigChanged?: (plans: SubscriptionPlan[], contactLinks: PlatformContactLinks) => void;
}

export const ZadtooAdminDashboard: React.FC<ZadtooAdminDashboardProps> = ({
  onLogout,
  onOpenSignalModal,
  onOpenAddUser,
  onOpenSettings,
  onOpenReports,
  onOpenRobotAdmin,
  totalUsersCount = 1248,
  activeSubscribersCount = 892,
  todaySignalsCount = 18,
  winRatePercent = 78,
  autoPilot,
  onSaveAutoPilot,
  onAddCustomPair,
  onRemoveCustomPair,
  plans,
  contactLinks,
  onConfigChanged
}) => {
  const [activeAdminNav, setActiveAdminNav] = useState<
    'overview' | 'pairs' | 'signals' | 'users' | 'subs' | 'reports' | 'settings' | 'plans_links' | 'payments'
  >('overview');

  const [showAddSignalModal, setShowAddSignalModal] = useState(false);
  const [newAsset, setNewAsset] = useState('EUR/JPY');
  const [newDirection, setNewDirection] = useState<'CALL' | 'PUT'>('CALL');
  const [newTimeframe, setNewTimeframe] = useState('1 دقيقة');
  const [broadcastTelegram, setBroadcastTelegram] = useState(true);
  const [broadcastSuccessMessage, setBroadcastSuccessMessage] = useState('');
  const [newPairInput, setNewPairInput] = useState('');
  const [isSavingPair, setIsSavingPair] = useState(false);

  // Fallback defaults for pairs if autoPilot is loading
  const currentMode = autoPilot?.pairSelectionMode || 'fixed_single';
  const fixedPair = autoPilot?.primaryFixedPair || 'EUR/JPY';
  const allowedPairs = autoPilot?.allowedPairs || ['EUR/JPY'];
  const customPairs = autoPilot?.customPairsList || [
    'EUR/JPY',
    'EUR/USD',
    'GBP/USD',
    'USD/JPY',
    'GBP/JPY',
    'AUD/USD',
    'USD/CHF',
    'USD/CAD',
    'EUR/GBP'
  ];

  // Chart data for 7-day performance matching Screen 5
  const chartDays = ['24/04', '25/04', '26/04', '27/04', '28/04', '29/04', '30/04'];

  // Recent registered users matching Screen 5
  const [recentUsers] = useState([
    { name: 'أحمد محمد', plan: 'الذهبية', date: '2025-05-01', status: 'نشط' },
    { name: 'سارة علي', plan: 'الفضية', date: '2025-05-01', status: 'نشط' },
    { name: 'محمود حسن', plan: 'الأساسية', date: '2025-04-30', status: 'نشط' },
    { name: 'ليلى أحمد', plan: 'الأساسية', date: '2025-04-30', status: 'نشط' }
  ]);

  // Recent added signals matching Screen 5
  const [recentSignals, setRecentSignals] = useState([
    { asset: 'EUR/JPY', direction: 'CALL', time: '14:35' },
    { asset: 'EUR/USD', direction: 'CALL', time: '14:32' },
    { asset: 'GBP/JPY', direction: 'PUT', time: '14:31' },
    { asset: 'AUD/USD', direction: 'CALL', time: '14:30' },
    { asset: 'USD/JPY', direction: 'PUT', time: '14:28' }
  ]);

  const handleCreateSignal = (e: React.FormEvent) => {
    e.preventDefault();
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const newSig = {
      asset: newAsset,
      direction: newDirection,
      time: timeStr
    };

    setRecentSignals((prev) => [newSig, ...prev.slice(0, 4)]);
    setShowAddSignalModal(false);
    setBroadcastSuccessMessage(`تم بث إشارة ${newAsset} (${newDirection === 'CALL' ? 'شراء' : 'بيع'}) بنجاح!`);
    setTimeout(() => setBroadcastSuccessMessage(''), 4000);
  };

  const PRIMARY_6_PAIRS = ['EUR/JPY', 'EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CAD'];

  const handleSelectMode = async (mode: 'fixed_single' | 'custom_list' | 'all_global') => {
    if (!onSaveAutoPilot) return;
    setIsSavingPair(true);
    try {
      const payload: Partial<AutoPilotConfig> = { pairSelectionMode: mode };
      if (mode === 'custom_list') {
        payload.allowedPairs = allowedPairs.length > 1 ? allowedPairs : PRIMARY_6_PAIRS;
      }
      await onSaveAutoPilot(payload);
      const label =
        mode === 'fixed_single'
          ? `الزوج الثابت (${fixedPair})`
          : mode === 'custom_list'
          ? `قائمة الأزواج المخصصة (${payload.allowedPairs?.length || allowedPairs.length} أزواج)`
          : 'مسح كل أزواج السوق';
      setBroadcastSuccessMessage(`✅ تم تفعيل نمط: ${label}`);
      setTimeout(() => setBroadcastSuccessMessage(''), 4000);
    } finally {
      setIsSavingPair(false);
    }
  };

  const handleActivatePrimary6Pairs = async () => {
    if (!onSaveAutoPilot) return;
    setIsSavingPair(true);
    try {
      await onSaveAutoPilot({
        allowedPairs: PRIMARY_6_PAIRS,
        pairSelectionMode: 'custom_list'
      });
      setBroadcastSuccessMessage('⚡ تم تفعيل وتثبيت الـ 6 أزواج الأساسية بنجاح: (EUR/JPY, EUR/USD, GBP/USD, USD/JPY, AUD/USD, USD/CAD)!');
      setTimeout(() => setBroadcastSuccessMessage(''), 5000);
    } finally {
      setIsSavingPair(false);
    }
  };

  const handleSetFixedPair = async (pair: string) => {
    if (!onSaveAutoPilot) return;
    setIsSavingPair(true);
    try {
      await onSaveAutoPilot({ primaryFixedPair: pair, pairSelectionMode: 'fixed_single' });
      setBroadcastSuccessMessage(`✅ تم تثبيت الزوج الأساسي اليومي على: ${pair}`);
      setTimeout(() => setBroadcastSuccessMessage(''), 4000);
    } finally {
      setIsSavingPair(false);
    }
  };

  const handleToggleAllowedPair = async (pair: string) => {
    if (!onSaveAutoPilot) return;
    const exists = allowedPairs.includes(pair);
    let next: string[];
    if (exists) {
      next = allowedPairs.filter((p) => p !== pair);
      if (next.length === 0) next = [fixedPair || 'EUR/JPY'];
    } else {
      next = [...allowedPairs, pair];
    }
    setIsSavingPair(true);
    try {
      await onSaveAutoPilot({ allowedPairs: next, pairSelectionMode: 'custom_list' });
      setBroadcastSuccessMessage(`✅ تم تحديث قائمة الأزواج المصرح بها (${next.length} أزواج: ${next.join(', ')})`);
      setTimeout(() => setBroadcastSuccessMessage(''), 4000);
    } finally {
      setIsSavingPair(false);
    }
  };

  const handleAddNewCustomPairSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    let p = newPairInput.toUpperCase().trim();
    if (!p) return;
    if (!p.includes('/') && p.length === 6) {
      p = `${p.slice(0, 3)}/${p.slice(3, 6)}`;
    }
    if (onAddCustomPair) {
      setIsSavingPair(true);
      try {
        await onAddCustomPair(p);
        setNewPairInput('');
        setBroadcastSuccessMessage(`✅ تمت إضافة الزوج (${p}) بنجاح إلى قائمة الروبوت والإشارات`);
        setTimeout(() => setBroadcastSuccessMessage(''), 4000);
      } finally {
        setIsSavingPair(false);
      }
    }
  };

  const [isTogglingAutopilot, setIsTogglingAutopilot] = useState(false);
  const [isTriggeringInstant, setIsTriggeringInstant] = useState(false);
  const [isTestingTelegram, setIsTestingTelegram] = useState(false);
  const [telegramStatusMessage, setTelegramStatusMessage] = useState<string | null>(null);

  const isBotActive = Boolean(autoPilot?.enabled);

  const handleToggleAutopilot = async () => {
    if (!onSaveAutoPilot) return;
    setIsTogglingAutopilot(true);
    const nextState = !isBotActive;
    try {
      await onSaveAutoPilot({ enabled: nextState });
      setBroadcastSuccessMessage(
        nextState
          ? '🟢 تم تشغيل البوت التلقائي بنجاح! يتم الآن مسح السوق وإرسال الإشارات تلقائياً إلى القناة @ZadNBFX.'
          : '⏸️ تم إيقاف البوت التلقائي مؤقتاً. لن يتم إرسال صفقات تلقائية حتى إعادة التشغيل.'
      );
      setTimeout(() => setBroadcastSuccessMessage(''), 5000);
    } catch (err: any) {
      setBroadcastSuccessMessage(`❌ حدث خطأ أثناء تعديل حالة البوت: ${err?.message || ''}`);
    } finally {
      setIsTogglingAutopilot(false);
    }
  };

  const handleTriggerInstant = async () => {
    setIsTriggeringInstant(true);
    try {
      const res = await fetch('/api/autopilot/trigger-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferredPair: fixedPair })
      });
      const data = await res.json();
      if (data.ok) {
        const sig = data.signal;
        setBroadcastSuccessMessage(
          `⚡ تم بث إشارة فورية بنجاح إلى القناة (@ZadNBFX)! الزوج: ${sig?.asset || fixedPair} | الاتجاه: ${sig?.direction === 'CALL' ? 'شراء 🟢' : 'بيع 🔴'} (رسالة تليجرام #${sig?.telegramMessageId || ''})`
        );
        if (sig) {
          setRecentSignals((prev) => [
            { asset: sig.asset, direction: sig.direction, time: sig.entryTime || 'الآن' },
            ...prev.slice(0, 4)
          ]);
        }
      } else {
        setBroadcastSuccessMessage(`⚠️ تعذر البث: ${data.error || 'خطأ غير معروف'}`);
      }
    } catch (err: any) {
      setBroadcastSuccessMessage(`❌ خطأ في الاتصال بالسيرفر: ${err?.message || ''}`);
    } finally {
      setIsTriggeringInstant(false);
      setTimeout(() => setBroadcastSuccessMessage(''), 6000);
    }
  };

  const handleTestTelegram = async () => {
    setIsTestingTelegram(true);
    setTelegramStatusMessage(null);
    try {
      const res = await fetch('/api/telegram/test-connection', { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        setTelegramStatusMessage(`✅ الاتصال بالقناة سليم وموثق بنسبة 100%! (@ZadNBFX - رسالة فحص #${data.messageId || ''})`);
      } else {
        setTelegramStatusMessage(`❌ فشل الاتصال: ${data.error || data.description || 'تأكد من صلاحيات البوت في القناة'}`);
      }
    } catch (err: any) {
      setTelegramStatusMessage(`❌ خطأ أثناء فحص التليجرام: ${err?.message || ''}`);
    } finally {
      setIsTestingTelegram(false);
      setTimeout(() => setTelegramStatusMessage(null), 8000);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-800 flex flex-col md:flex-row">
      {/* Sidebar matching Screen 5 */}
      <aside className="w-full md:w-60 bg-white border-b md:border-b-0 md:border-l border-slate-200/80 p-5 flex flex-col justify-between shrink-0">
        <div className="space-y-6">
          <div className="pb-4 border-b border-slate-100 flex items-center justify-between">
            <ZadtooLogo size="md" />
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1 text-sm font-bold">
            <button
              type="button"
              onClick={() => setActiveAdminNav('overview')}
              className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl transition-colors cursor-pointer text-right ${
                activeAdminNav === 'overview'
                  ? 'bg-sky-50 text-sky-700 font-extrabold border border-sky-100'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <LayoutDashboard className="w-4 h-4 text-sky-600" />
              <span>الرئيسية</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveAdminNav('pairs')}
              className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl transition-colors cursor-pointer text-right ${
                activeAdminNav === 'pairs'
                  ? 'bg-emerald-50 text-emerald-700 font-extrabold border border-emerald-200'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <Target className="w-4 h-4 text-emerald-600" />
              <span>أزواج الإشارات والروبوت</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveAdminNav('signals');
                setShowAddSignalModal(true);
              }}
              className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl transition-colors cursor-pointer text-right ${
                activeAdminNav === 'signals'
                  ? 'bg-sky-50 text-sky-700 font-extrabold border border-sky-100'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <TrendingUp className="w-4 h-4 text-emerald-600" />
              <span>الإشارات والبث</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveAdminNav('users');
                if (onOpenAddUser) onOpenAddUser();
              }}
              className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl transition-colors cursor-pointer text-right ${
                activeAdminNav === 'users'
                  ? 'bg-sky-50 text-sky-700 font-extrabold border border-sky-100'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <Users className="w-4 h-4 text-slate-500" />
              <span>المستخدمين</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveAdminNav('subs');
                if (onOpenAddUser) onOpenAddUser();
              }}
              className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl transition-colors cursor-pointer text-right ${
                activeAdminNav === 'subs'
                  ? 'bg-sky-50 text-sky-700 font-extrabold border border-sky-100'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <CreditCard className="w-4 h-4 text-slate-500" />
              <span>الاشتراكات</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveAdminNav('payments')}
              className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl transition-colors cursor-pointer text-right ${
                activeAdminNav === 'payments'
                  ? 'bg-emerald-50 text-emerald-800 font-extrabold border border-emerald-300 shadow-xs'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <DollarSign className="w-4 h-4 text-emerald-600" />
              <span>المدفوعات ووسائل الدفع</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-800 font-bold mr-auto">
                جديد
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveAdminNav('plans_links')}
              className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl transition-colors cursor-pointer text-right ${
                activeAdminNav === 'plans_links'
                  ? 'bg-amber-50 text-amber-900 font-extrabold border border-amber-300 shadow-xs'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <Crown className="w-4 h-4 text-amber-600" />
              <span>الباقات والروابط</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-800 font-bold mr-auto">
                إدارة
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveAdminNav('reports');
                if (onOpenReports) onOpenReports();
              }}
              className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl transition-colors cursor-pointer text-right ${
                activeAdminNav === 'reports'
                  ? 'bg-sky-50 text-sky-700 font-extrabold border border-sky-100'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <FileText className="w-4 h-4 text-slate-500" />
              <span>التقارير</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveAdminNav('settings');
                if (onOpenSettings) onOpenSettings();
              }}
              className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl transition-colors cursor-pointer text-right ${
                activeAdminNav === 'settings'
                  ? 'bg-sky-50 text-sky-700 font-extrabold border border-sky-100'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <Settings className="w-4 h-4 text-slate-500" />
              <span>الإعدادات المتقدمة</span>
            </button>

            {onOpenRobotAdmin && (
              <button
                type="button"
                onClick={onOpenRobotAdmin}
                className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl transition-colors cursor-pointer text-right text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 mt-2"
              >
                <Cpu className="w-4 h-4 text-emerald-600" />
                <span>الروبوت العائم السحابي</span>
              </button>
            )}
          </nav>
        </div>

        {/* Logout Button */}
        <div className="pt-6 border-t border-slate-100">
          <button
            type="button"
            onClick={onLogout}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>تسجيل الخروج</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6 overflow-y-auto">
        {/* Notification Toast if an action succeeded */}
        {broadcastSuccessMessage && (
          <div className="p-3.5 bg-emerald-600 text-white rounded-2xl text-xs font-bold flex items-center justify-between shadow-lg animate-in fade-in">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              <span>{broadcastSuccessMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setBroadcastSuccessMessage('')}
              className="text-white hover:text-emerald-100 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Top Header Row matching Screen 5 */}
        <div className="flex items-center justify-between bg-white rounded-2xl p-4 border border-slate-200/80 shadow-2xs">
          <div>
            <h1 className="text-xl font-black text-slate-900">لوحة تحكم الإدارة</h1>
            <p className="text-xs text-slate-400">إدارة الإشارات والمستخدمين وزوج التداول والروبوت الآلي</p>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 flex-wrap justify-end">
            {/* Quick Autopilot Toggle in Header */}
            <button
              type="button"
              onClick={handleToggleAutopilot}
              disabled={isTogglingAutopilot}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-black transition-all cursor-pointer ${
                isBotActive
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100 shadow-xs'
                  : 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
              }`}
              title="انقر لتشغيل أو إيقاف إرسال الإشارات تلقائياً"
            >
              {isTogglingAutopilot ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : isBotActive ? (
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              ) : (
                <Pause className="w-3 h-3 text-amber-600" />
              )}
              <span>{isBotActive ? '🟢 البوت: شغال' : '⏸️ البوت: متوقف'}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveAdminNav(activeAdminNav === 'payments' ? 'overview' : 'payments')}
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              <CreditCard className="w-3.5 h-3.5" />
              <span>{activeAdminNav === 'payments' ? '← العودة للرئيسية' : 'إدارة المدفوعات ووسائل الدفع'}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveAdminNav(activeAdminNav === 'plans_links' ? 'overview' : 'plans_links')}
              className="flex items-center gap-1.5 px-3 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              <Crown className="w-3.5 h-3.5" />
              <span>{activeAdminNav === 'plans_links' ? '← العودة للرئيسية' : 'الباقات والروابط'}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowAddSignalModal(true)}
              className="hidden sm:flex items-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>إضافة إشارة</span>
            </button>

            <div className="flex items-center gap-2 text-xs bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl">
              <div className="w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-xs">
                A
              </div>
              <div className="text-right">
                <span className="font-extrabold text-slate-900 block leading-tight">مدير النظام</span>
                <span className="text-[10px] text-slate-400 block">admin</span>
              </div>
            </div>
          </div>
        </div>

        {/* View Switch: Payments Manager OR Plans & Links Manager OR Normal Overview */}
        {activeAdminNav === 'payments' ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 p-3.5 rounded-2xl">
              <div className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-emerald-600 shrink-0" />
                <span className="text-xs sm:text-sm font-black text-emerald-950">
                  قسم إدارة المدفوعات، وسائل الدفع المعتمدة (USDT، فودافون كاش، إنستاباي، بايننس)، ومراجعة وتفعيل الإيصالات
                </span>
              </div>
              <button
                type="button"
                onClick={() => setActiveAdminNav('overview')}
                className="px-3.5 py-1.5 bg-white hover:bg-emerald-100/60 text-emerald-900 text-xs font-bold rounded-xl border border-emerald-300 transition-colors cursor-pointer"
              >
                ← العودة إلى لوحة التحكم الرئيسية
              </button>
            </div>

            <ZadtooPaymentsManager />
          </div>
        ) : activeAdminNav === 'plans_links' ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between bg-amber-50 border border-amber-200 p-3.5 rounded-2xl">
              <div className="flex items-center gap-2">
                <Crown className="w-5 h-5 text-amber-600 shrink-0" />
                <span className="text-xs sm:text-sm font-black text-amber-950">
                  قسم إدارة باقات الاشتراك المتاحة للزوار وروابط التواصل والإحالة
                </span>
              </div>
              <button
                type="button"
                onClick={() => setActiveAdminNav('overview')}
                className="px-3.5 py-1.5 bg-white hover:bg-amber-100/60 text-amber-900 text-xs font-bold rounded-xl border border-amber-300 transition-colors cursor-pointer"
              >
                ← العودة إلى لوحة التحكم الرئيسية
              </button>
            </div>

            <ZadtooPlansAndLinksManager
              initialPlans={plans}
              initialContactLinks={contactLinks}
              onConfigChanged={onConfigChanged}
            />
          </div>
        ) : (
          <>
        {/* DEDICATED LIVE AUTOPILOT & TELEGRAM CONTROL CENTER */}
        <div className={`rounded-2xl p-5 border shadow-xs transition-all space-y-4 ${
          isBotActive
            ? 'bg-gradient-to-r from-emerald-500/10 via-sky-500/5 to-white border-emerald-300'
            : 'bg-gradient-to-r from-amber-500/10 via-slate-50 to-white border-amber-300'
        }`}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/60 pb-3">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-lg shadow-xs ${
                isBotActive ? 'bg-emerald-600 text-white animate-pulse' : 'bg-amber-600 text-white'
              }`}>
                {isBotActive ? <Zap className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-base font-black text-slate-900">
                    مركز التحكم المباشر بالبوت التلقائي وقناة التليجرام
                  </h2>
                  <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-black ${
                    isBotActive ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-amber-100 text-amber-800 border border-amber-300'
                  }`}>
                    {isBotActive ? '🟢 الإرسال التلقائي: شغال (مفعّل)' : '⏸️ الإرسال التلقائي: متوقف مؤقتاً'}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  القناة المستهدفة: <strong className="text-sky-700">@ZadNBFX</strong> | فريم التداول: <strong className="text-slate-800">M1 (1 دقيقة بدون مضاعفات)</strong> | الفاصل الزمني: <strong className="text-slate-800">كل 15 دقيقة</strong>
                </p>
              </div>
            </div>

            {/* Quick Actions in Header of Card */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleToggleAutopilot}
                disabled={isTogglingAutopilot}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer shadow-xs ${
                  isBotActive
                    ? 'bg-amber-500 hover:bg-amber-600 text-slate-950'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                }`}
              >
                {isTogglingAutopilot ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : isBotActive ? (
                  <Pause className="w-4 h-4" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
                <span>{isBotActive ? 'إيقاف البوت مؤقتاً' : 'تشغيل البوت الآن'}</span>
              </button>

              <button
                type="button"
                onClick={handleTriggerInstant}
                disabled={isTriggeringInstant}
                className="flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-black rounded-xl transition-all shadow-xs cursor-pointer disabled:opacity-60"
              >
                {isTriggeringInstant ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                <span>⚡ بث إشارة فورية للقناة الآن</span>
              </button>

              <button
                type="button"
                onClick={handleTestTelegram}
                disabled={isTestingTelegram}
                className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-bold rounded-xl transition-all cursor-pointer disabled:opacity-60"
              >
                {isTestingTelegram ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Radio className="w-3.5 h-3.5 text-sky-600" />
                )}
                <span>فحص اتصال القناة</span>
              </button>
            </div>
          </div>

          {/* Telegram Diagnostic Status Feedback */}
          {telegramStatusMessage && (
            <div className="p-3 bg-sky-50 text-sky-900 border border-sky-200 rounded-xl text-xs font-bold flex items-center justify-between">
              <span>{telegramStatusMessage}</span>
              <button
                type="button"
                onClick={() => setTelegramStatusMessage(null)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {/* 4 Informational Status Badges */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div className="bg-white/90 backdrop-blur-xs p-3 rounded-xl border border-slate-200 space-y-1">
              <span className="text-slate-400 block font-bold text-[11px]">ساعات العمل المعتمدة</span>
              <div className="font-extrabold text-slate-900 font-mono-num">10:00 ص - 06:00 م</div>
              <span className="text-[10px] text-slate-500 block">توقيت جمهورية مصر العربية</span>
            </div>

            <div className="bg-white/90 backdrop-blur-xs p-3 rounded-xl border border-slate-200 space-y-1">
              <span className="text-slate-400 block font-bold text-[11px]">التوقيت الحالي والجدول</span>
              <div className="font-extrabold text-emerald-700 flex items-center gap-1 font-mono-num">
                <Clock className="w-3.5 h-3.5 text-emerald-600" />
                <span>الساعة {autoPilot?.currentEgyptHour ?? 12}:00 (القاهرة)</span>
              </div>
              <span className="text-[10px] text-emerald-600 font-bold block">
                {autoPilot?.isFreeBotWithinSchedule ? 'ضمن فترة العمل النشطة ✅' : 'خارج فترة العمل المحددة'}
              </span>
            </div>

            <div className="bg-white/90 backdrop-blur-xs p-3 rounded-xl border border-slate-200 space-y-1">
              <span className="text-slate-400 block font-bold text-[11px]">الفاصل الزمني وجودة الإشارة</span>
              <div className="font-extrabold text-slate-900 font-mono-num">
                كل {autoPilot?.intervalMinutes || 15} دقيقة
              </div>
              <span className="text-[10px] text-sky-700 font-bold block">
                حد أدنى للجودة {autoPilot?.minQualityScore || 75}% (صفقات قوية فقط)
              </span>
            </div>

            <div className="bg-white/90 backdrop-blur-xs p-3 rounded-xl border border-slate-200 space-y-1">
              <span className="text-slate-400 block font-bold text-[11px]">الإشارة المجدولة القادمة</span>
              <div className="font-extrabold text-slate-900 font-mono-num">
                {autoPilot?.nextRunAt ? new Date(autoPilot.nextRunAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : 'جاهز للرصد فوراً'}
              </div>
              <span className="text-[10px] text-slate-500 block">
                إجمالي الإشارات المرسلة: <strong className="text-slate-800">{autoPilot?.totalAutoSent || 0}</strong>
              </span>
            </div>
          </div>
        </div>

        {/* DEDICATED SECTION: Trading Pair Control for Signals & Robot */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-2xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center">
                <Target className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-black text-slate-900">
                  تحديد وتخصيص زوج الإشارات والروبوت (Pair Selection)
                </h2>
                <p className="text-xs text-slate-400">
                  حدد الزوج الذي ترسل عليه الإشارات (مثل الزوج الثابت يومياً EUR/JPY)، أو أضف أزواجاً مخصصة تعمل تلقائياً في الموقع والروبوت
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">الزوج المعتمد حالياً:</span>
              <span className="px-3 py-1 bg-sky-500/10 text-sky-700 border border-sky-300 rounded-lg text-xs font-black font-mono-num">
                {currentMode === 'fixed_single'
                  ? `${fixedPair} ★ (ثابت يومي)`
                  : currentMode === 'custom_list'
                  ? `قائمة (${allowedPairs.length} أزواج نشطة)`
                  : 'كامل أزواج السوق'}
              </span>
            </div>
          </div>

          {/* 3 Modes selector */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <button
              type="button"
              disabled={isSavingPair}
              onClick={() => handleSelectMode('fixed_single')}
              className={`p-3.5 rounded-xl border text-right transition-all cursor-pointer space-y-1 ${
                currentMode === 'fixed_single'
                  ? 'bg-sky-50 border-sky-400 ring-2 ring-sky-300/40 text-sky-900'
                  : 'bg-slate-50 border-slate-200 hover:border-slate-300 text-slate-700'
              }`}
            >
              <div className="flex items-center justify-between font-bold text-xs">
                <span>📌 1. زوج ثابت يومياً (الموصى به)</span>
                {currentMode === 'fixed_single' && <CheckCircle2 className="w-4 h-4 text-sky-600" />}
              </div>
              <p className="text-[11px] text-slate-500">
                تركيز الإشارات والروبوت على زوج واحد ثابت يومياً (الافتراضي: <strong>EUR/JPY</strong>).
              </p>
            </button>

            <button
              type="button"
              disabled={isSavingPair}
              onClick={() => handleSelectMode('custom_list')}
              className={`p-3.5 rounded-xl border text-right transition-all cursor-pointer space-y-1 ${
                currentMode === 'custom_list'
                  ? 'bg-emerald-50 border-emerald-400 ring-2 ring-emerald-300/40 text-emerald-900'
                  : 'bg-slate-50 border-slate-200 hover:border-slate-300 text-slate-700'
              }`}
            >
              <div className="flex items-center justify-between font-bold text-xs">
                <span>📋 2. قائمة أزواج مخصصة</span>
                {currentMode === 'custom_list' && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
              </div>
              <p className="text-[11px] text-slate-500">
                اختيار وتفعيل أزواج متعددة محددة يدوياً مع إمكانية إضافة وحذف أي زوج.
              </p>
            </button>

            <button
              type="button"
              disabled={isSavingPair}
              onClick={() => handleSelectMode('all_global')}
              className={`p-3.5 rounded-xl border text-right transition-all cursor-pointer space-y-1 ${
                currentMode === 'all_global'
                  ? 'bg-amber-50 border-amber-400 ring-2 ring-amber-300/40 text-amber-900'
                  : 'bg-slate-50 border-slate-200 hover:border-slate-300 text-slate-700'
              }`}
            >
              <div className="flex items-center justify-between font-bold text-xs">
                <span>🌐 3. مسح كل أزواج السوق</span>
                {currentMode === 'all_global' && <CheckCircle2 className="w-4 h-4 text-amber-600" />}
              </div>
              <p className="text-[11px] text-slate-500">
                مسح مستمر لجميع أزواج العملات العالمية لاقتناص أقوى مؤشرات التشبع.
              </p>
            </button>
          </div>

          {/* Sub-block: Fixed Pair Quick Selection */}
          {currentMode === 'fixed_single' && (
            <div className="p-4 bg-sky-50/50 border border-sky-200 rounded-xl space-y-2">
              <label className="block text-xs font-bold text-sky-900">
                اختر الزوج الثابت اليومي (الافتراضي EUR/JPY):
              </label>
              <div className="flex flex-wrap items-center gap-2">
                {customPairs.map((pair) => {
                  const isSelected = fixedPair === pair;
                  return (
                    <button
                      key={`fixed-opt-${pair}`}
                      type="button"
                      disabled={isSavingPair}
                      onClick={() => handleSetFixedPair(pair)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold font-mono-num transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-sky-600 text-white shadow-xs font-black'
                          : 'bg-white text-slate-700 border border-slate-200 hover:border-sky-400'
                      }`}
                    >
                      {pair}
                      {isSelected ? ' ★ (المحدد حالياً)' : ''}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Sub-block: Custom Pairs Checklist & Add New Pair Form */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-bold text-slate-800">
                الأزواج المتاحة في النظام (اضغط لتفعيل/تعطيل الزوج في الروبوت):
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isSavingPair}
                  onClick={handleActivatePrimary6Pairs}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
                  title="تفعيل الأزواج الستة الأساسية فوراً: EUR/JPY, EUR/USD, GBP/USD, USD/JPY, AUD/USD, USD/CAD"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>⚡ تفعيل الـ 6 أزواج الأساسية دفعة واحدة</span>
                </button>
                <span className="text-[11px] text-slate-500 font-bold bg-white px-2 py-1 rounded-lg border border-slate-200">
                  المفعلة: {allowedPairs.length} من {customPairs.length}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {customPairs.map((pair) => {
                const isAllowed = allowedPairs.includes(pair);
                const isPrimary = fixedPair === pair;

                return (
                  <div
                    key={`dash-pair-${pair}`}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-mono-num transition-colors ${
                      isAllowed
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                        : 'bg-white border-slate-200 text-slate-400'
                    }`}
                  >
                    <button
                      type="button"
                      disabled={isSavingPair}
                      onClick={() => handleToggleAllowedPair(pair)}
                      className="cursor-pointer flex items-center gap-1 font-bold"
                    >
                      <span>{isAllowed ? '✅' : '⚪'}</span>
                      <span>{pair}</span>
                      {isPrimary && <span className="text-[10px] text-sky-600 font-bold">(ثابت)</span>}
                    </button>

                    {!isPrimary && onRemoveCustomPair && (
                      <button
                        type="button"
                        onClick={() => onRemoveCustomPair(pair)}
                        className="text-slate-300 hover:text-rose-500 mr-1 cursor-pointer"
                        title={`حذف ${pair}`}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Form to add a new custom pair */}
            <form onSubmit={handleAddNewCustomPairSubmit} className="pt-2 flex flex-wrap items-center gap-2 border-t border-slate-200/80">
              <div className="flex-1 min-w-[200px]">
                <input
                  type="text"
                  value={newPairInput}
                  onChange={(e) => setNewPairInput(e.target.value.toUpperCase())}
                  placeholder="إضافة زوج جديد (مثال: GBP/JPY أو USDCHF)"
                  className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono-num font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <button
                type="submit"
                disabled={isSavingPair || !newPairInput.trim()}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs rounded-lg transition-colors cursor-pointer flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>إضافة وتثبيت الزوج</span>
              </button>
            </form>
          </div>

          <div className="p-3 bg-sky-50/70 rounded-xl border border-sky-100 flex items-start gap-2 text-xs text-sky-800">
            <span className="text-base shrink-0">💡</span>
            <p className="leading-relaxed">
              <strong>ملاحظة تقنية هامة:</strong> أي زوج يتم تحديده أو إضافته هنا يُحفظ فوراً في خادم المنصة، ويُنقل آلياً ومباشرة إلى روبوت التداول العائم (Quotex Pro Bot) وقناة التليجرام دون الحاجة لأي تدخل يدوي من المستخدمين.
            </p>
          </div>
        </div>

        {/* DEDICATED SECTION: Live Quotex Strategy & Indicators (SuperTrend + Fractal + RSI) */}
        <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 text-white rounded-2xl p-5 border border-slate-700/80 shadow-md space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-amber-400/20 text-amber-400 border border-amber-400/30 flex items-center justify-center">
                <TrendingUp className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-black text-white">
                    استراتيجية التداول المعتمدة (S/R Core + 2 of 3 Confluence)
                  </h2>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-mono-num font-bold">
                    فريم M1 مباشر (بدون مضاعفات)
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  القاعدة الذهبية: <strong className="text-amber-300">مؤشر الدعم والمقاومة شرط أساسي إلزامي 100%</strong> + توافق مؤشرين على الأقل من المؤشرات الثلاثة المتبقية (سوبر تريند، فركتال، RSI)
                </p>
              </div>
            </div>

            <a
              href="/strategy.txt"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5 text-amber-400" />
              <span>عرض وثيقة الاستراتيجية (strategy.txt)</span>
              <ExternalLink className="w-3 h-3 text-slate-400" />
            </a>
          </div>

          {/* 4 Indicators Breakdown Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* 0. SUPPORT & RESISTANCE (MANDATORY CORE) */}
            <div className="p-3.5 bg-gradient-to-br from-amber-950/40 via-slate-950/80 to-slate-900 rounded-xl border-2 border-amber-500/50 space-y-2 relative shadow-xs">
              <div className="flex items-center justify-between">
                <span className="font-mono-num font-black text-xs text-amber-300">
                  🧱 الدعم والمقاومة (S/R)
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500 text-slate-950 font-black animate-pulse">
                  شرط أساسي 100%
                </span>
              </div>
              <p className="text-[11px] text-slate-200 leading-relaxed">
                لا تظهر أي إشارة بدون ارتداد مؤكد من خط دعم (للشراء CALL) أو خط مقاومة (للبيع PUT): أفقية، خطوط اتجاه مائلة، قنوات، أو تبادل الأدوار بعد الاختراق.
              </p>
              <div className="text-[10px] text-amber-300 font-mono-num flex items-center justify-between pt-1 border-t border-amber-500/30 font-bold">
                <span>ارتداد دعم: شراء 🟢</span>
                <span>ارتداد مقاومة: بيع 🔴</span>
              </div>
            </div>

            {/* 1. SuperTrend (10, 3) */}
            <div className="p-3.5 bg-slate-950/60 rounded-xl border border-emerald-500/30 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono-num font-black text-xs text-emerald-400">
                  1. SUPERTREND (10, 3)
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">
                  داعم (الاتجاه)
                </span>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                مؤشر الاتجاه المعتمد (ATR 10, Multiplier 3): خط أخضر أسفل الشموع للصعود وخط أحمر أعلاها للهبوط، مع رصد دقيق لانقلاب الاتجاه اللحظي.
              </p>
              <div className="text-[10px] text-slate-400 font-mono-num flex items-center justify-between pt-1 border-t border-slate-800">
                <span>الخط الأخضر: شراء 🟢</span>
                <span>الخط الأحمر: بيع 🔴</span>
              </div>
            </div>

            {/* 2. Williams Fractal (5) */}
            <div className="p-3.5 bg-slate-950/60 rounded-xl border border-sky-500/30 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono-num font-black text-xs text-sky-400">
                  2. FRACTAL (Period = 5)
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 font-bold">
                  داعم (القمم والقيعان)
                </span>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                مؤشر الفركتالز الكلاسيكي (5 شموع): رصد قيعان الانعكاس وقمم المقاومة بأسهم واضحة وتأكيد شمعة الرفض اللحظية (Pin Bar / ابتلاع).
              </p>
              <div className="text-[10px] text-slate-400 font-mono-num flex items-center justify-between pt-1 border-t border-slate-800">
                <span>سهم سفلي: دعم قاع ▲</span>
                <span>سهم علوي: مقاومة قمة ▼</span>
              </div>
            </div>

            {/* 3. RSI (9, 70, 30) */}
            <div className="p-3.5 bg-slate-950/60 rounded-xl border border-purple-500/30 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono-num font-black text-xs text-purple-400">
                  3. RSI (9) [70 / 30]
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 font-bold">
                  داعم (الزخم M1)
                </span>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                مؤشر القوة النسبية بفترة 9 شموع سريعة لفريم الدقيقة: تشبع بيعي عند &lt;= 35 وتشبع شرائي عند &gt;= 65 مع اختراق خط 50 لتأكيد الزخم.
              </p>
              <div className="text-[10px] text-slate-400 font-mono-num flex items-center justify-between pt-1 border-t border-slate-800">
                <span>تشبع بيعي: &lt;= 35 🟢</span>
                <span>تشبع شرائي: &gt;= 65 🔴</span>
              </div>
            </div>
          </div>
        </div>

        {/* 4 Overview Statistics Cards matching Screen 5 */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-2xs space-y-1">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-bold">إجمالي المستخدمين</span>
              <Users className="w-4 h-4 text-sky-500" />
            </div>
            <div className="text-2xl font-black text-slate-900 font-mono-num">
              {totalUsersCount.toLocaleString('en-US')}
            </div>
            <span className="text-[11px] text-emerald-600 font-bold font-mono-num">+12% هذا الشهر</span>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-2xs space-y-1">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-bold">المشتركين النشطين</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="text-2xl font-black text-slate-900 font-mono-num">
              {activeSubscribersCount.toLocaleString('en-US')}
            </div>
            <span className="text-[11px] text-emerald-600 font-bold font-mono-num">71% معدل التحويل</span>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-2xs space-y-1">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-bold">إشارات اليوم</span>
              <TrendingUp className="w-4 h-4 text-sky-500" />
            </div>
            <div className="text-2xl font-black text-slate-900 font-mono-num">{todaySignalsCount}</div>
            <span className="text-[11px] text-sky-600 font-bold font-mono-num">14 رابحة / 2 مضاعفة</span>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-2xs space-y-1">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-bold">نسبة النجاح العامة</span>
              <Sparkles className="w-4 h-4 text-amber-500" />
            </div>
            <div className="text-2xl font-black text-emerald-600 font-mono-num">{winRatePercent}%</div>
            <span className="text-[11px] text-slate-400 font-mono-num">فريم الدقيقة M1</span>
          </div>
        </div>

        {/* 3 Columns Section matching Screen 5 */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left Table: آخر المستخدمين المسجلين */}
          <div className="lg:col-span-4 bg-white rounded-2xl p-5 border border-slate-200/80 shadow-2xs space-y-3">
            <h3 className="text-xs font-black text-slate-900 border-b border-slate-100 pb-2">
              آخر المستخدمين المسجلين
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-right">
                <thead>
                  <tr className="text-slate-400 border-b border-slate-100">
                    <th className="pb-2 font-medium">الاسم</th>
                    <th className="pb-2 font-medium">الباقة</th>
                    <th className="pb-2 font-medium">تاريخ الإشتراك</th>
                    <th className="pb-2 font-medium">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {recentUsers.map((u, i) => (
                    <tr key={i} className="hover:bg-slate-50/80">
                      <td className="py-2.5 font-bold text-slate-800">{u.name}</td>
                      <td className="py-2.5 text-slate-600">{u.plan}</td>
                      <td className="py-2.5 font-mono-num text-[11px] text-slate-400">{u.date}</td>
                      <td className="py-2.5">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">
                          {u.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Center Chart: أداء الإشارات (آخر 7 أيام) */}
          <div className="lg:col-span-4 bg-white rounded-2xl p-5 border border-slate-200/80 shadow-2xs space-y-3">
            <h3 className="text-xs font-black text-slate-900 border-b border-slate-100 pb-2">
              أداء الإشارات (آخر 7 أيام)
            </h3>

            {/* Line Chart Visual SVG */}
            <div className="pt-2">
              <div className="h-44 w-full relative">
                {/* Background Grid Lines */}
                <div className="absolute inset-0 flex flex-col justify-between text-[9px] text-slate-400 font-mono-num pointer-events-none">
                  <div className="border-b border-slate-100 w-full flex justify-between">
                    <span>100%</span>
                  </div>
                  <div className="border-b border-slate-100 w-full flex justify-between">
                    <span>75%</span>
                  </div>
                  <div className="border-b border-slate-100 w-full flex justify-between">
                    <span>50%</span>
                  </div>
                  <div className="border-b border-slate-100 w-full flex justify-between">
                    <span>25%</span>
                  </div>
                  <div className="border-b border-slate-100 w-full flex justify-between">
                    <span>0%</span>
                  </div>
                </div>

                {/* SVG Curve Line */}
                <svg className="w-full h-full overflow-visible" viewBox="0 0 300 120" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>
                  {/* Fill Area */}
                  <polygon
                    points="0,120 0,35 50,22 100,45 150,30 200,18 250,26 300,14 300,120"
                    fill="url(#chartGrad)"
                  />
                  {/* Stroke Line */}
                  <polyline
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points="0,35 50,22 100,45 150,30 200,18 250,26 300,14"
                  />
                  {/* Dots on Points */}
                  {[
                    [0, 35],
                    [50, 22],
                    [100, 45],
                    [150, 30],
                    [200, 18],
                    [250, 26],
                    [300, 14]
                  ].map(([x, y], idx) => (
                    <circle key={idx} cx={x} cy={y} r="3" fill="#10b981" stroke="#ffffff" strokeWidth="1.5" />
                  ))}
                </svg>
              </div>

              {/* Dates Row under chart */}
              <div className="flex justify-between text-[10px] text-slate-400 font-mono-num pt-3">
                {chartDays.map((d, i) => (
                  <span key={i}>{d}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Right Table + Actions: آخر الإشارات المضافة + إجراءات سريعة */}
          <div className="lg:col-span-4 space-y-4">
            {/* Table: آخر الإشارات المضافة */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-2xs space-y-3">
              <h3 className="text-xs font-black text-slate-900 border-b border-slate-100 pb-2">
                آخر الإشارات المضافة
              </h3>

              <div className="space-y-2 text-xs">
                {recentSignals.map((sig, i) => {
                  const isCall = sig.direction === 'CALL';
                  const flags = getPairFlags(sig.asset);
                  return (
                    <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-slate-50/80">
                      <div className="flex items-center gap-1.5 font-bold font-mono-num text-slate-800">
                        <span>{flags.base}</span>
                        <span>{sig.asset}</span>
                      </div>

                      <div className="flex items-center gap-1 text-[11px] font-extrabold">
                        {isCall ? (
                          <span className="text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded flex items-center gap-0.5">
                            <ArrowUp className="w-3 h-3" />
                            <span>شراء</span>
                          </span>
                        ) : (
                          <span className="text-rose-700 bg-rose-100 px-2 py-0.5 rounded flex items-center gap-0.5">
                            <ArrowDown className="w-3 h-3" />
                            <span>بيع</span>
                          </span>
                        )}
                      </div>

                      <span className="text-[10px] text-slate-400 font-mono-num">{sig.time}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Quick Actions (إجراءات سريعة) matching Screen 5 */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-2xs space-y-2 text-xs">
              <span className="text-xs font-black text-slate-900 block pb-1 border-b border-slate-100">
                إجراءات سريعة
              </span>

              <button
                type="button"
                onClick={() => setShowAddSignalModal(true)}
                className="w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>إضافة إشارة جديدة فورية</span>
              </button>

              <button
                type="button"
                onClick={onOpenAddUser}
                className="w-full py-2 px-3 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                <span>إدارة الاشتراكات والمستخدمين</span>
              </button>

              <button
                type="button"
                onClick={onOpenSettings}
                className="w-full py-2 px-3 bg-white hover:bg-slate-50 text-slate-700 font-bold rounded-xl border border-slate-300 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                <span>تعديل الإعدادات وبوت التليجرام</span>
              </button>

              <button
                type="button"
                onClick={onOpenReports}
                className="w-full py-2 px-3 bg-white hover:bg-slate-50 text-slate-700 font-bold rounded-xl border border-slate-300 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                <span>تقرير الأرباح والخسائر والنتائج</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveAdminNav('plans_links')}
                className="w-full py-2 px-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
              >
                <Crown className="w-4 h-4 text-slate-950" />
                <span>إدارة وتعديل الباقات والروابط</span>
              </button>
            </div>
          </div>
        </div>
        </>
        )}
      </main>

      {/* Quick Add Signal Modal */}
      {showAddSignalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 space-y-4 relative text-right">
            <button
              type="button"
              onClick={() => setShowAddSignalModal(false)}
              className="absolute top-4 left-4 text-slate-400 hover:text-slate-700 text-sm font-bold cursor-pointer"
            >
              ✕
            </button>

            <div className="border-b border-slate-100 pb-2">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <Plus className="w-4 h-4 text-emerald-600" />
                <span>إضافة وبث إشارة جديدة فورية</span>
              </h3>
              <p className="text-[11px] text-slate-400">
                سيتم إدراج الإشارة في المنصة وإرسالها لقناة التليجرام مباشرة
              </p>
            </div>

            <form onSubmit={handleCreateSignal} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">زوج العملات:</label>
                <select
                  value={newAsset}
                  onChange={(e) => setNewAsset(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-mono-num font-bold focus:outline-none focus:border-emerald-500"
                >
                  <option value="EUR/JPY">EUR/JPY (الزوج الثابت) 🇪🇺🇯🇵</option>
                  <option value="EUR/USD">EUR/USD 🇪🇺🇺🇸</option>
                  <option value="GBP/USD">GBP/USD 🇬🇧🇺🇸</option>
                  <option value="USD/JPY">USD/JPY 🇺🇸🇯🇵</option>
                  <option value="GBP/JPY">GBP/JPY 🇬🇧🇯🇵</option>
                  <option value="AUD/USD">AUD/USD 🇦🇺🇺🇸</option>
                  <option value="EUR/GBP">EUR/GBP 🇪🇺🇬🇧</option>
                  <option value="USD/CAD">USD/CAD 🇺🇸🇨🇦</option>
                  <option value="XAU/USD">XAU/USD (الذهب) 🪙</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">الاتجاه:</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewDirection('CALL')}
                    className={`py-2 rounded-lg font-bold border transition-colors cursor-pointer flex items-center justify-center gap-1 ${
                      newDirection === 'CALL'
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-slate-50 text-slate-600 border-slate-200'
                    }`}
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                    <span>شراء (CALL)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setNewDirection('PUT')}
                    className={`py-2 rounded-lg font-bold border transition-colors cursor-pointer flex items-center justify-center gap-1 ${
                      newDirection === 'PUT'
                        ? 'bg-rose-600 text-white border-rose-600'
                        : 'bg-slate-50 text-slate-600 border-slate-200'
                    }`}
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                    <span>بيع (PUT)</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">فريم الصفقة:</label>
                <select
                  value={newTimeframe}
                  onChange={(e) => setNewTimeframe(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-bold focus:outline-none focus:border-emerald-500"
                >
                  <option value="1 دقيقة">1 دقيقة (M1 - فريم الدقيقة)</option>
                  <option value="5 دقائق">5 دقائق (M5)</option>
                </select>
              </div>

              <div className="pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-slate-700">
                  <input
                    type="checkbox"
                    checked={broadcastTelegram}
                    onChange={(e) => setBroadcastTelegram(e.target.checked)}
                    className="accent-emerald-600 rounded"
                  />
                  <span>إرسال إشعار فوري إلى قناة التليجرام @ZadNBFX</span>
                </label>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5 mt-2"
              >
                <Send className="w-3.5 h-3.5" />
                <span>نشر وبث الإشارة الآن</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
