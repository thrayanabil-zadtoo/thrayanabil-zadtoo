import React, { useState, useEffect } from 'react';
import {
  Send,
  Users,
  Settings,
  Shield,
  CreditCard,
  Globe,
  Radio,
  CheckCircle2,
  AlertTriangle,
  Ban,
  UserCheck,
  UserX,
  Search,
  Filter,
  Plus,
  Trash2,
  Edit3,
  ExternalLink,
  RefreshCw,
  MessageSquare,
  Bot,
  HelpCircle,
  Copy,
  Check,
  Building,
  Smartphone,
  Eye,
  ArrowRight,
  Flame,
  FileText
} from 'lucide-react';

export interface TelegramBotUser {
  id: string;
  telegramChatId: string;
  username?: string;
  name: string;
  country: string;
  language: 'ar' | 'en';
  step: 'START' | 'AWAITING_NAME' | 'AWAITING_COUNTRY' | 'COMPLETED';
  status: 'ACTIVE' | 'SUSPENDED' | 'BLOCKED';
  membershipType: 'NONE' | 'FREE_REFERRAL' | 'PAID_VIP';
  brokerId?: string;
  notes?: string;
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
  robotGuide: {
    titleAr: string;
    titleEn: string;
    videoUrl: string;
    imageUrl: string;
    descriptionAr: string;
    descriptionEn: string;
  };
}

const DEFAULT_CONFIG: TelegramBotConfig = {
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
      notes: 'التحويل متاح من كافة البنوك الدولية لحساب الجنيه المصري'
    },
    ibanUsd: {
      country: 'دولي (International 🌍)',
      bankName: 'البنك الأهلي المصري (National Bank of Egypt - NBE)',
      beneficiaryName: 'Thraya Nabil / ZAD FX',
      currency: 'الدولار الأمريكي ($ - USD)',
      accountNumber: '20098765432109',
      iban: 'EG720003000020098765432109',
      swiftCode: 'NBEGEGCX',
      notes: 'Wire Transfer / Swift Transfer in USD accepted worldwide'
    }
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

export const TelegramBotManager: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'users' | 'settings' | 'broadcast' | 'simulator'>('users');
  const [users, setUsers] = useState<TelegramBotUser[]>([]);
  const [config, setConfig] = useState<TelegramBotConfig>(DEFAULT_CONFIG);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'SUSPENDED' | 'BLOCKED'>('ALL');
  const [countryFilter, setCountryFilter] = useState<'ALL' | 'EGYPT' | 'PALESTINE' | 'INTERNATIONAL'>('ALL');
  const [membershipFilter, setMembershipFilter] = useState<'ALL' | 'FREE_REFERRAL' | 'PAID_VIP' | 'NONE'>('ALL');

  // Modals
  const [editingUser, setEditingUser] = useState<TelegramBotUser | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [directMsgUser, setDirectMsgUser] = useState<TelegramBotUser | null>(null);
  const [directMsgText, setDirectMsgText] = useState('');
  const [isSendingMsg, setIsSendingMsg] = useState(false);

  // New Member Form
  const [newMember, setNewMember] = useState<Partial<TelegramBotUser>>({
    name: '',
    country: 'مصر 🇪🇬',
    language: 'ar',
    telegramChatId: '',
    username: '',
    status: 'ACTIVE',
    membershipType: 'FREE_REFERRAL',
    brokerId: '',
    notes: ''
  });

  // Broadcast Form
  const [broadcastText, setBroadcastText] = useState('');
  const [broadcastLang, setBroadcastLang] = useState<'all' | 'ar' | 'en'>('all');
  const [broadcastTarget, setBroadcastTarget] = useState<'all' | 'ACTIVE'>('ACTIVE');
  const [isBroadcasting, setIsBroadcasting] = useState(false);

  // Simulator State
  const [simStep, setSimStep] = useState<'start' | 'name' | 'country' | 'menu' | 'memberships' | 'referral' | 'paid_egypt' | 'paid_palestine' | 'paid_intl' | 'instapay' | 'wallets' | 'iban_egp' | 'iban_usd' | 'robot_guide'>('start');
  const [simLang, setSimLang] = useState<'ar' | 'en'>('ar');
  const [simName, setSimName] = useState('كريم الأحمدي');
  const [simCountry, setSimCountry] = useState('مصر');

  // Fetch initial data
  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [resUsers, resConfig] = await Promise.all([
        fetch('/api/telegram-bot/users'),
        fetch('/api/telegram-bot/config')
      ]);
      const dataUsers = await resUsers.json();
      const dataConfig = await resConfig.json();

      if (dataUsers?.users && Array.isArray(dataUsers.users)) {
        setUsers(dataUsers.users);
      }
      if (dataConfig?.config) {
        setConfig(dataConfig.config);
      }
    } catch (e) {
      console.error('Failed to load telegram bot data:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setStatusMessage({ text, type });
    setTimeout(() => setStatusMessage(null), 4000);
  };

  // Save Settings
  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const res = await fetch('/api/telegram-bot/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      const data = await res.json();
      if (data.ok) {
        showToast('✅ تم حفظ كافة إعدادات بوت التليجرام والمدفوعات بنجاح!');
      } else {
        showToast(`❌ فشل الحفظ: ${data.error || 'خطأ غير معروف'}`, 'error');
      }
    } catch (_err) {
      showToast('❌ تعذر الاتصال بالسيرفر لحفظ الإعدادات', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Toggle user status
  const handleUpdateUserStatus = async (id: string, status: 'ACTIVE' | 'SUSPENDED' | 'BLOCKED') => {
    try {
      const res = await fetch(`/api/telegram-bot/users/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      const data = await res.json();
      if (data.ok) {
        setUsers(prev => prev.map(u => (u.id === id ? { ...u, status } : u)));
        showToast(`✅ تم تحديث حالة العضو إلى: ${status === 'ACTIVE' ? 'نشط' : status === 'SUSPENDED' ? 'معلق' : 'موقوف'}`);
      }
    } catch (_err) {
      showToast('❌ فشل تغيير حالة العضو', 'error');
    }
  };

  // Delete User
  const handleDeleteUser = async (id: string, name: string) => {
    if (!window.confirm(`هل أنت متأكد من حذف العضو "${name}" نهائياً من سجل البوت؟`)) return;
    try {
      const res = await fetch(`/api/telegram-bot/users/${id}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.ok) {
        setUsers(prev => prev.filter(u => u.id !== id));
        showToast(`🗑️ تم حذف العضو "${name}" بنجاح`);
      }
    } catch (_err) {
      showToast('❌ تعذر حذف العضو', 'error');
    }
  };

  // Save Edit User
  const handleSaveEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    try {
      const res = await fetch(`/api/telegram-bot/users/${editingUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingUser)
      });
      const data = await res.json();
      if (data.ok) {
        setUsers(prev => prev.map(u => (u.id === editingUser.id ? editingUser : u)));
        setEditingUser(null);
        showToast('✅ تم حفظ تعديلات ملف العضو بنجاح');
      }
    } catch (_err) {
      showToast('❌ تعذر حفظ تعديلات العضو', 'error');
    }
  };

  // Add Member
  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMember.name || !newMember.telegramChatId) {
      showToast('⚠️ يرجى إدخال اسم العضو ومعرف التليجرام (Chat ID)', 'error');
      return;
    }
    try {
      const res = await fetch('/api/telegram-bot/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newMember)
      });
      const data = await res.json();
      if (data.ok && data.user) {
        setUsers(prev => [data.user, ...prev]);
        setIsAddModalOpen(false);
        setNewMember({
          name: '',
          country: 'مصر 🇪🇬',
          language: 'ar',
          telegramChatId: '',
          username: '',
          status: 'ACTIVE',
          membershipType: 'FREE_REFERRAL',
          brokerId: '',
          notes: ''
        });
        showToast('✅ تم إضافة العضو الجديد للملف بنجاح');
      }
    } catch (_err) {
      showToast('❌ تعذر إضافة العضو', 'error');
    }
  };

  // Send Direct Message
  const handleSendDirectMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!directMsgUser || !directMsgText.trim()) return;
    setIsSendingMsg(true);
    try {
      const res = await fetch(`/api/telegram-bot/users/${directMsgUser.id}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: directMsgText.trim() })
      });
      const data = await res.json();
      if (data.ok) {
        showToast(`🚀 تم إرسال الرسالة إلى ${directMsgUser.name} بنجاح عبر التليجرام!`);
        setDirectMsgText('');
        setDirectMsgUser(null);
      } else {
        showToast(`❌ تعذر الإرسال: ${data.error || 'تأكد من تفعيل البوت لدى العضو'}`, 'error');
      }
    } catch (_err) {
      showToast('❌ فشل إرسال الرسالة للمشترك', 'error');
    } finally {
      setIsSendingMsg(false);
    }
  };

  // Broadcast Message
  const handleBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastText.trim()) {
      showToast('⚠️ يرجى كتابة نص الرسالة للبث الجماعي', 'error');
      return;
    }
    if (!window.confirm('هل أنت متأكد من إرسال هذا البث الجماعي إلى جميع المشتركين المحددين؟')) return;
    setIsBroadcasting(true);
    try {
      const res = await fetch('/api/telegram-bot/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: broadcastText.trim(),
          targetLanguage: broadcastLang,
          targetStatus: broadcastTarget
        })
      });
      const data = await res.json();
      if (data.ok) {
        showToast(`📢 تم إرسال البث الجماعي بنجاح إلى (${data.sentCount} عضو)!`);
        setBroadcastText('');
      } else {
        showToast(`❌ حدث خطأ أثناء البث: ${data.error}`, 'error');
      }
    } catch (_err) {
      showToast('❌ تعذر تنفيذ البث الجماعي', 'error');
    } finally {
      setIsBroadcasting(false);
    }
  };

  // Filtered Users
  const isEgyptCheck = (country: string) => {
    const c = (country || '').toLowerCase();
    return c.includes('مصر') || c.includes('egypt') || c.includes('eg');
  };

  const isPalestineCheck = (country: string) => {
    const c = (country || '').toLowerCase();
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
      c.includes('pse') ||
      c.includes('ps')
    );
  };

  const filteredUsers = users.filter(u => {
    const q = searchQuery.toLowerCase().trim();
    const matchSearch =
      !q ||
      u.name.toLowerCase().includes(q) ||
      u.country.toLowerCase().includes(q) ||
      u.telegramChatId.includes(q) ||
      (u.username && u.username.toLowerCase().includes(q)) ||
      (u.brokerId && u.brokerId.includes(q));

    const matchStatus = statusFilter === 'ALL' || u.status === statusFilter;

    const matchCountry =
      countryFilter === 'ALL' ||
      (countryFilter === 'EGYPT' && isEgyptCheck(u.country)) ||
      (countryFilter === 'PALESTINE' && isPalestineCheck(u.country)) ||
      (countryFilter === 'INTERNATIONAL' && !isEgyptCheck(u.country) && !isPalestineCheck(u.country));

    const matchMembership =
      membershipFilter === 'ALL' || u.membershipType === membershipFilter;

    return matchSearch && matchStatus && matchCountry && matchMembership;
  });

  const stats = {
    total: users.length,
    active: users.filter(u => u.status === 'ACTIVE').length,
    suspended: users.filter(u => u.status === 'SUSPENDED').length,
    blocked: users.filter(u => u.status === 'BLOCKED').length,
    egypt: users.filter(u => isEgyptCheck(u.country)).length,
    palestine: users.filter(u => isPalestineCheck(u.country)).length,
    international: users.filter(u => !isEgyptCheck(u.country) && !isPalestineCheck(u.country)).length,
    freeReferral: users.filter(u => u.membershipType === 'FREE_REFERRAL').length,
    paidVip: users.filter(u => u.membershipType === 'PAID_VIP').length
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-4 sm:p-6 lg:p-8 font-sans" dir="rtl">
      {/* Toast Alert */}
      {statusMessage && (
        <div
          className={`fixed bottom-6 left-6 z-50 px-5 py-3.5 rounded-xl shadow-2xl flex items-center gap-3 border text-sm font-bold transition-all transform animate-bounce ${
            statusMessage.type === 'success'
              ? 'bg-emerald-950 text-emerald-200 border-emerald-600'
              : 'bg-rose-950 text-rose-200 border-rose-600'
          }`}
        >
          {statusMessage.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="max-w-7xl mx-auto mb-8 bg-gradient-to-r from-slate-800 via-indigo-950/60 to-slate-800 border border-indigo-700/40 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 relative z-10">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-600 to-sky-500 flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <Bot className="w-8 h-8 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                  قسم بوت التليجرام الذكي
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  ZAD FX Auto-Bot
                </span>
              </div>
              <p className="text-sm text-slate-400 mt-1">
                نظام تفاعلي متكامل لتسجيل الأعضاء (عربي / إنجليزي)، توجيه المدفوعات جغرافياً (مصر: إنستا باي ومحافظ / دولي: آيبان)، وإدارة المشتركين.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-900/80 border border-slate-700 text-xs font-bold">
              <span className={`w-2.5 h-2.5 rounded-full ${config.isEnabled ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
              <span>حالة البوت: {config.isEnabled ? 'متصل ونشط 24/7' : 'متوقف مؤقتاً'}</span>
            </div>
            <button
              onClick={() => fetchData()}
              disabled={isLoading}
              className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-indigo-400' : ''}`} />
              <span>تحديث البيانات</span>
            </button>
            <a
              href={`https://t.me/${config.botUsername.replace(/^@/, '')}`}
              target="_blank"
              rel="noreferrer"
              className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-md shadow-indigo-600/30 transition-all cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>فتح البوت في تليجرام</span>
              <ExternalLink className="w-3 h-3 opacity-70" />
            </a>
          </div>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 mt-6 pt-6 border-t border-slate-700/60">
          <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-800">
            <span className="text-xs text-slate-400 block font-medium">إجمالي المسجلين</span>
            <span className="text-xl font-black text-white mt-0.5 block">{stats.total}</span>
          </div>
          <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-800">
            <span className="text-xs text-emerald-400 block font-medium">الأعضاء النشطين</span>
            <span className="text-xl font-black text-emerald-400 mt-0.5 block">{stats.active}</span>
          </div>
          <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-800">
            <span className="text-xs text-amber-400 block font-medium">مشتركي مصر (إنستا/كاش)</span>
            <span className="text-xl font-black text-amber-300 mt-0.5 block">{stats.egypt}</span>
          </div>
          <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-800">
            <span className="text-xs text-sky-400 block font-medium">دولي (تحويل IBAN)</span>
            <span className="text-xl font-black text-sky-300 mt-0.5 block">{stats.international}</span>
          </div>
          <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-800">
            <span className="text-xs text-indigo-400 block font-medium">إحالة كيوتكس مجاناً</span>
            <span className="text-xl font-black text-indigo-300 mt-0.5 block">{stats.freeReferral}</span>
          </div>
          <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-800">
            <span className="text-xs text-rose-400 block font-medium">معلق / موقوف</span>
            <span className="text-xl font-black text-rose-400 mt-0.5 block">{stats.suspended + stats.blocked}</span>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="max-w-7xl mx-auto mb-6 flex flex-wrap items-center gap-2 border-b border-slate-800 pb-3">
        <button
          onClick={() => setActiveTab('users')}
          className={`px-4 py-2.5 rounded-xl text-sm font-extrabold flex items-center gap-2 transition-all cursor-pointer ${
            activeTab === 'users'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
              : 'bg-slate-800/80 hover:bg-slate-800 text-slate-300'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>سجل المشتركين والأعضاء ({users.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`px-4 py-2.5 rounded-xl text-sm font-extrabold flex items-center gap-2 transition-all cursor-pointer ${
            activeTab === 'settings'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
              : 'bg-slate-800/80 hover:bg-slate-800 text-slate-300'
          }`}
        >
          <Settings className="w-4 h-4" />
          <span>إعدادات البوت والمدفوعات وروابط الإحالة</span>
        </button>

        <button
          onClick={() => setActiveTab('broadcast')}
          className={`px-4 py-2.5 rounded-xl text-sm font-extrabold flex items-center gap-2 transition-all cursor-pointer ${
            activeTab === 'broadcast'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
              : 'bg-slate-800/80 hover:bg-slate-800 text-slate-300'
          }`}
        >
          <Send className="w-4 h-4" />
          <span>بث جماعي للأعضاء (Broadcast)</span>
        </button>

        <button
          onClick={() => setActiveTab('simulator')}
          className={`px-4 py-2.5 rounded-xl text-sm font-extrabold flex items-center gap-2 transition-all cursor-pointer ${
            activeTab === 'simulator'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
              : 'bg-slate-800/80 hover:bg-slate-800 text-slate-300'
          }`}
        >
          <Eye className="w-4 h-4" />
          <span>محاكي تجربة المشترك (Live Preview)</span>
        </button>
      </div>

      {/* Main Content Areas */}
      <div className="max-w-7xl mx-auto">
        {/* ==================== TAB 1: USERS LIST ==================== */}
        {activeTab === 'users' && (
          <div className="space-y-6">
            {/* Filters Bar */}
            <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 shadow-md">
              <div className="flex-1 relative">
                <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5" />
                <input
                  type="text"
                  placeholder="ابحث بالاسم، الدولة، معرف التليجرام، أو رقم كيوتكس..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl pr-10 pl-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value as any)}
                  className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-200 focus:outline-none focus:border-indigo-500"
                >
                  <option value="ALL">كل الحالات</option>
                  <option value="ACTIVE">نشط فقط (Active)</option>
                  <option value="SUSPENDED">معلق (Suspended)</option>
                  <option value="BLOCKED">موقوف (Blocked)</option>
                </select>

                <select
                  value={countryFilter}
                  onChange={e => setCountryFilter(e.target.value as any)}
                  className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-200 focus:outline-none focus:border-indigo-500"
                >
                  <option value="ALL">كل الدول</option>
                  <option value="EGYPT">مصر فقط 🇪🇬</option>
                  <option value="PALESTINE">فلسطين فقط 🇵🇸</option>
                  <option value="INTERNATIONAL">باقي الدول (دولي 🌍)</option>
                </select>

                <select
                  value={membershipFilter}
                  onChange={e => setMembershipFilter(e.target.value as any)}
                  className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-200 focus:outline-none focus:border-indigo-500"
                >
                  <option value="ALL">كل الاشتراكات</option>
                  <option value="FREE_REFERRAL">إحالة كيوتكس مجاناً</option>
                  <option value="PAID_VIP">عضوية VIP مدفوعة</option>
                  <option value="NONE">غير محدد</option>
                </select>

                <button
                  onClick={() => setIsAddModalOpen(true)}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black flex items-center gap-1.5 shadow-md shadow-emerald-600/30 transition-all cursor-pointer mr-auto"
                >
                  <Plus className="w-4 h-4" />
                  <span>إضافة عضو يدوياً</span>
                </button>
              </div>
            </div>

            {/* Members Table */}
            <div className="bg-slate-800/80 border border-slate-700 rounded-2xl overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-900/90 text-slate-400 font-bold border-b border-slate-700">
                    <tr>
                      <th className="py-3.5 px-4">العضو / الحساب</th>
                      <th className="py-3.5 px-4">الدولة واللغة</th>
                      <th className="py-3.5 px-4">نوع العضوية</th>
                      <th className="py-3.5 px-4">معرف كيوتكس (ID)</th>
                      <th className="py-3.5 px-4">الحالة</th>
                      <th className="py-3.5 px-4">تاريخ التسجيل</th>
                      <th className="py-3.5 px-4 text-center">الإجراءات والتحكم</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/60 font-medium">
                    {filteredUsers.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-slate-500">
                          <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
                          <p className="text-sm font-bold">لا يوجد أعضاء مطابقين للبحث أو التصفية</p>
                        </td>
                      </tr>
                    ) : (
                      filteredUsers.map(user => {
                        const isEg = isEgyptCheck(user.country);
                        const isPal = isPalestineCheck(user.country);
                        return (
                          <tr key={user.id} className="hover:bg-slate-700/30 transition-colors">
                            {/* Member info */}
                            <td className="py-3.5 px-4">
                              <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-indigo-600 to-indigo-800 flex items-center justify-center font-bold text-white text-sm shadow">
                                  {user.name.charAt(0) || 'U'}
                                </div>
                                <div>
                                  <div className="font-extrabold text-white text-sm">{user.name}</div>
                                  <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                                    <span>ID: {user.telegramChatId}</span>
                                    {user.username && (
                                      <a
                                        href={`https://t.me/${user.username.replace(/^@/, '')}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-indigo-400 hover:underline"
                                      >
                                        {user.username}
                                      </a>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </td>

                            {/* Country & Language */}
                            <td className="py-3.5 px-4">
                              <div className="flex items-center gap-1.5 font-bold text-slate-200">
                                <span>{user.country || 'غير محدد'}</span>
                                {isEg && (
                                  <span className="text-[10px] px-1.5 py-0.2 bg-amber-500/20 text-amber-300 rounded font-black border border-amber-500/30">
                                    مصر
                                  </span>
                                )}
                                {isPal && (
                                  <span className="text-[10px] px-1.5 py-0.2 bg-emerald-500/20 text-emerald-300 rounded font-black border border-emerald-500/30">
                                    فلسطين 🇵🇸
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-slate-400 block mt-0.5">
                                {user.language === 'ar' ? 'العربية 🇸🇦' : 'English 🇬🇧'}
                              </span>
                            </td>

                            {/* Membership */}
                            <td className="py-3.5 px-4">
                              {user.membershipType === 'FREE_REFERRAL' ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 font-extrabold border border-emerald-500/30">
                                  <span>إحالة كيوتكس مجاناً</span>
                                </span>
                              ) : user.membershipType === 'PAID_VIP' ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-500/20 text-indigo-300 font-extrabold border border-indigo-500/30">
                                  <span>عضوية VIP مدفوعة</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-slate-700/60 text-slate-400">
                                  لم يحدد بعد
                                </span>
                              )}
                            </td>

                            {/* Broker ID */}
                            <td className="py-3.5 px-4 font-mono font-bold text-slate-200">
                              {user.brokerId ? (
                                <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700">
                                  {user.brokerId}
                                </span>
                              ) : (
                                <span className="text-slate-500">-</span>
                              )}
                            </td>

                            {/* Status */}
                            <td className="py-3.5 px-4">
                              {user.status === 'ACTIVE' && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                  <span>نشط (Active)</span>
                                </span>
                              )}
                              {user.status === 'SUSPENDED' && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                                  <span>معلق (Suspended)</span>
                                </span>
                              )}
                              {user.status === 'BLOCKED' && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-rose-500/20 text-rose-400 border border-rose-500/40">
                                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                                  <span>موقوف (Blocked)</span>
                                </span>
                              )}
                            </td>

                            {/* Registration date */}
                            <td className="py-3.5 px-4 text-slate-400 text-[11px]">
                              {new Date(user.registeredAt).toLocaleDateString('ar-EG', {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric'
                              })}
                            </td>

                            {/* Action Buttons */}
                            <td className="py-3.5 px-4">
                              <div className="flex items-center justify-center gap-1.5">
                                {/* Direct Telegram Message */}
                                <button
                                  type="button"
                                  title="مراسلة عبر التليجرام"
                                  onClick={() => {
                                    setDirectMsgUser(user);
                                    setDirectMsgText('');
                                  }}
                                  className="p-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white transition-colors cursor-pointer"
                                >
                                  <MessageSquare className="w-3.5 h-3.5" />
                                </button>

                                {/* Edit Button */}
                                <button
                                  type="button"
                                  title="تعديل ملف العضو"
                                  onClick={() => setEditingUser({ ...user })}
                                  className="p-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors cursor-pointer"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>

                                {/* Suspend Toggle */}
                                {user.status !== 'SUSPENDED' ? (
                                  <button
                                    type="button"
                                    title="تعليق العضوية مؤقتاً"
                                    onClick={() => handleUpdateUserStatus(user.id, 'SUSPENDED')}
                                    className="p-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-white transition-colors cursor-pointer"
                                  >
                                    <AlertTriangle className="w-3.5 h-3.5" />
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    title="إعادة التنشيط"
                                    onClick={() => handleUpdateUserStatus(user.id, 'ACTIVE')}
                                    className="p-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500 text-emerald-300 hover:text-white transition-colors cursor-pointer"
                                  >
                                    <UserCheck className="w-3.5 h-3.5" />
                                  </button>
                                )}

                                {/* Block/Stop Toggle */}
                                {user.status !== 'BLOCKED' ? (
                                  <button
                                    type="button"
                                    title="توقيف وحظر العضو"
                                    onClick={() => handleUpdateUserStatus(user.id, 'BLOCKED')}
                                    className="p-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500 text-rose-300 hover:text-white transition-colors cursor-pointer"
                                  >
                                    <Ban className="w-3.5 h-3.5" />
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    title="فك الحظر"
                                    onClick={() => handleUpdateUserStatus(user.id, 'ACTIVE')}
                                    className="p-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500 text-emerald-300 hover:text-white transition-colors cursor-pointer"
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                  </button>
                                )}

                                {/* Delete */}
                                <button
                                  type="button"
                                  title="حذف العضو نهائياً"
                                  onClick={() => handleDeleteUser(user.id, user.name)}
                                  className="p-1.5 rounded-lg bg-slate-700 hover:bg-rose-600 text-slate-400 hover:text-white transition-colors cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
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
        )}

        {/* ==================== TAB 2: SETTINGS & PAYMENTS ==================== */}
        {activeTab === 'settings' && (
          <form onSubmit={handleSaveConfig} className="space-y-6">
            {/* Top Save Action */}
            <div className="flex items-center justify-between bg-slate-800/90 border border-slate-700 rounded-2xl p-4 shadow-md">
              <div>
                <h2 className="text-lg font-black text-white">إعدادات البوت والمدفوعات وروابط التوجيه</h2>
                <p className="text-xs text-slate-400">يمكنك تعديل بيانات الحسابات وتخصيص تجربة المشترك بالكامل</p>
              </div>
              <button
                type="submit"
                disabled={isLoading}
                className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-sm shadow-lg shadow-indigo-600/30 transition-all cursor-pointer flex items-center gap-2"
              >
                <Check className="w-4 h-4" />
                <span>حفظ كافة التغييرات</span>
              </button>
            </div>

            {/* Core Bot Setup */}
            <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-6 shadow-md">
              <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-700">
                <Bot className="w-5 h-5 text-indigo-400" />
                <h3 className="text-base font-extrabold text-white">بيانات اتصال بوت التليجرام الأساسية</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">حالة تشغيل البوت</label>
                  <select
                    value={config.isEnabled ? 'true' : 'false'}
                    onChange={e => setConfig({ ...config, isEnabled: e.target.value === 'true' })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 font-bold"
                  >
                    <option value="true">نشط ومتصل (Active 24/7)</option>
                    <option value="false">معطل مؤقتاً (Paused)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">معرف البوت (Bot Username)</label>
                  <input
                    type="text"
                    value={config.botUsername}
                    onChange={e => setConfig({ ...config, botUsername: e.target.value })}
                    placeholder="@ZadNBFX_bot"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">معرف المشرف للتواصل والدعم</label>
                  <input
                    type="text"
                    value={config.adminTelegramUsername}
                    onChange={e => setConfig({ ...config, adminTelegramUsername: e.target.value })}
                    placeholder="@thrayanabil"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">رابط قناة التليجرام المجانية</label>
                  <input
                    type="text"
                    value={config.freeChannelLink}
                    onChange={e => setConfig({ ...config, freeChannelLink: e.target.value })}
                    placeholder="https://t.me/ZadNBFX"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">رابط الموقع الرسمي</label>
                  <input
                    type="text"
                    value={config.officialWebsiteUrl}
                    onChange={e => setConfig({ ...config, officialWebsiteUrl: e.target.value })}
                    placeholder="https://fx.zadtoo.com"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">رابط إحالة كيوتكس (Quotex Referral)</label>
                  <input
                    type="text"
                    value={config.quotexReferralUrl}
                    onChange={e => setConfig({ ...config, quotexReferralUrl: e.target.value })}
                    placeholder="https://broker-qx.pro/sign-up/?lid=..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 font-mono text-xs"
                  />
                </div>
              </div>
            </div>

            {/* Egypt Payments (InstaPay & Mobile Wallets) */}
            <div className="bg-slate-800/80 border border-amber-500/30 rounded-2xl p-6 shadow-md relative overflow-hidden">
              <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-700">
                <span className="text-xl">🇪🇬</span>
                <div>
                  <h3 className="text-base font-extrabold text-amber-300">نظام مدفوعات جمهورية مصر العربية (مصر فقط)</h3>
                  <p className="text-xs text-slate-400">يظهر تلقائياً لأي مشترك يختار دولة مصر عند بدء المحادثة مع البوت</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">حساب إنستا باي (IPA / Phone)</label>
                  <input
                    type="text"
                    value={config.egyptPayment.instapayAccount}
                    onChange={e => setConfig({
                      ...config,
                      egyptPayment: { ...config.egyptPayment, instapayAccount: e.target.value }
                    })}
                    placeholder="username@instapay"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">اسم المستفيد في إنستا باي</label>
                  <input
                    type="text"
                    value={config.egyptPayment.instapayName}
                    onChange={e => setConfig({
                      ...config,
                      egyptPayment: { ...config.egyptPayment, instapayName: e.target.value }
                    })}
                    placeholder="ثريا نبيل"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">رقم فودافون كاش (Vodafone Cash)</label>
                  <input
                    type="text"
                    value={config.egyptPayment.vodafoneCash}
                    onChange={e => setConfig({
                      ...config,
                      egyptPayment: { ...config.egyptPayment, vodafoneCash: e.target.value }
                    })}
                    placeholder="010xxxxxxxx"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">رقم اتصالات كاش (Etisalat Cash)</label>
                  <input
                    type="text"
                    value={config.egyptPayment.etisalatCash}
                    onChange={e => setConfig({
                      ...config,
                      egyptPayment: { ...config.egyptPayment, etisalatCash: e.target.value }
                    })}
                    placeholder="011xxxxxxxx"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">رقم أورنج كاش (Orange Cash)</label>
                  <input
                    type="text"
                    value={config.egyptPayment.orangeCash}
                    onChange={e => setConfig({
                      ...config,
                      egyptPayment: { ...config.egyptPayment, orangeCash: e.target.value }
                    })}
                    placeholder="012xxxxxxxx"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">رقم وي باي (WE Pay)</label>
                  <input
                    type="text"
                    value={config.egyptPayment.wePay}
                    onChange={e => setConfig({
                      ...config,
                      egyptPayment: { ...config.egyptPayment, wePay: e.target.value }
                    })}
                    placeholder="015xxxxxxxx"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Palestine Payments (Bank of Palestine) */}
            <div className="bg-slate-800/80 border border-emerald-500/30 rounded-2xl p-6 shadow-md relative overflow-hidden">
              <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-700">
                <span className="text-xl">🇵🇸</span>
                <div>
                  <h3 className="text-base font-extrabold text-emerald-300">نظام مدفوعات دولة فلسطين (بنك فلسطين)</h3>
                  <p className="text-xs text-slate-400">يظهر تلقائياً لأي مشترك يقيم في فلسطين (الضفة الغربية، قطاع غزة، القدس) مع بيانات الإيداع وتطبيق بنك فلسطين</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">الدولة (Country)</label>
                  <input
                    type="text"
                    value={config.palestinePayment?.country || 'فلسطين 🇵🇸'}
                    onChange={e => setConfig({
                      ...config,
                      palestinePayment: { ...(config.palestinePayment || DEFAULT_CONFIG.palestinePayment), country: e.target.value }
                    })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">اسم البنك (Bank Name)</label>
                  <input
                    type="text"
                    value={config.palestinePayment?.bankName || ''}
                    onChange={e => setConfig({
                      ...config,
                      palestinePayment: { ...(config.palestinePayment || DEFAULT_CONFIG.palestinePayment), bankName: e.target.value }
                    })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">اسم المستفيد (Beneficiary)</label>
                  <input
                    type="text"
                    value={config.palestinePayment?.beneficiaryName || ''}
                    onChange={e => setConfig({
                      ...config,
                      palestinePayment: { ...(config.palestinePayment || DEFAULT_CONFIG.palestinePayment), beneficiaryName: e.target.value }
                    })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">العملة المقبولة</label>
                  <input
                    type="text"
                    value={config.palestinePayment?.currency || ''}
                    onChange={e => setConfig({
                      ...config,
                      palestinePayment: { ...(config.palestinePayment || DEFAULT_CONFIG.palestinePayment), currency: e.target.value }
                    })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">رقم الحساب البنكي</label>
                  <input
                    type="text"
                    value={config.palestinePayment?.accountNumber || ''}
                    onChange={e => setConfig({
                      ...config,
                      palestinePayment: { ...(config.palestinePayment || DEFAULT_CONFIG.palestinePayment), accountNumber: e.target.value }
                    })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">رقم الآيبان (IBAN Code)</label>
                  <input
                    type="text"
                    value={config.palestinePayment?.iban || ''}
                    onChange={e => setConfig({
                      ...config,
                      palestinePayment: { ...(config.palestinePayment || DEFAULT_CONFIG.palestinePayment), iban: e.target.value }
                    })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">الفرع (Branch)</label>
                  <input
                    type="text"
                    value={config.palestinePayment?.branch || ''}
                    onChange={e => setConfig({
                      ...config,
                      palestinePayment: { ...(config.palestinePayment || DEFAULT_CONFIG.palestinePayment), branch: e.target.value }
                    })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">ملاحظات التحويل والإيداع</label>
                  <input
                    type="text"
                    value={config.palestinePayment?.notes || ''}
                    onChange={e => setConfig({
                      ...config,
                      palestinePayment: { ...(config.palestinePayment || DEFAULT_CONFIG.palestinePayment), notes: e.target.value }
                    })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            </div>

            {/* International Payments (Rest of World - Separated Lists: EGP & USD) */}
            <div className="bg-slate-800/80 border border-sky-500/30 rounded-2xl p-6 shadow-md relative overflow-hidden">
              <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-700">
                <span className="text-xl">🌍</span>
                <div>
                  <h3 className="text-base font-extrabold text-sky-300">نظام التحويل البنكي الدولي (باقي دول العالم - IBAN)</h3>
                  <p className="text-xs text-slate-400">قائمتان منفصلتان بالكامل: يختار المشترك بين (الحساب بالجنيه المصري EGP) أو (الحساب بالدولار الأمريكي USD) فتظهر له بيانات الآيبان الكاملة</p>
                </div>
              </div>

              {/* Sub-grid: EGP vs USD */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* EGP IBAN Card */}
                <div className="bg-slate-900/80 rounded-xl p-5 border border-slate-700 space-y-3.5">
                  <div className="flex items-center gap-2 pb-2.5 border-b border-slate-700">
                    <Building className="w-4 h-4 text-emerald-400" />
                    <div>
                      <h4 className="text-sm font-black text-emerald-400">1. قائمة الحساب البنكي والآيبان بالجنيه المصري (EGP)</h4>
                      <span className="text-[10px] text-slate-400">تظهر عند اختيار المشترك: حساب بنكي بالجنيه المصري</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-300 mb-1">🌍 الدولة (Country)</label>
                      <input
                        type="text"
                        value={config.internationalPayment.ibanEgp.country || 'جمهورية مصر العربية 🇪🇬'}
                        onChange={e => setConfig({
                          ...config,
                          internationalPayment: {
                            ...config.internationalPayment,
                            ibanEgp: { ...config.internationalPayment.ibanEgp, country: e.target.value }
                          }
                        })}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-300 mb-1">🏛 اسم البنك (Bank Name)</label>
                      <input
                        type="text"
                        value={config.internationalPayment.ibanEgp.bankName}
                        onChange={e => setConfig({
                          ...config,
                          internationalPayment: {
                            ...config.internationalPayment,
                            ibanEgp: { ...config.internationalPayment.ibanEgp, bankName: e.target.value }
                          }
                        })}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-300 mb-1">👤 اسم المستفيد (Beneficiary)</label>
                      <input
                        type="text"
                        value={config.internationalPayment.ibanEgp.beneficiaryName}
                        onChange={e => setConfig({
                          ...config,
                          internationalPayment: {
                            ...config.internationalPayment,
                            ibanEgp: { ...config.internationalPayment.ibanEgp, beneficiaryName: e.target.value }
                          }
                        })}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-300 mb-1">💰 العملة (Currency)</label>
                      <input
                        type="text"
                        value={config.internationalPayment.ibanEgp.currency || 'الجنيه المصري (EGP)'}
                        onChange={e => setConfig({
                          ...config,
                          internationalPayment: {
                            ...config.internationalPayment,
                            ibanEgp: { ...config.internationalPayment.ibanEgp, currency: e.target.value }
                          }
                        })}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-300 mb-1">🔢 رقم الحساب (Account Number)</label>
                      <input
                        type="text"
                        value={config.internationalPayment.ibanEgp.accountNumber}
                        onChange={e => setConfig({
                          ...config,
                          internationalPayment: {
                            ...config.internationalPayment,
                            ibanEgp: { ...config.internationalPayment.ibanEgp, accountNumber: e.target.value }
                          }
                        })}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-300 mb-1">🌐 رقم الآيبان (IBAN Code)</label>
                      <input
                        type="text"
                        value={config.internationalPayment.ibanEgp.iban}
                        onChange={e => setConfig({
                          ...config,
                          internationalPayment: {
                            ...config.internationalPayment,
                            ibanEgp: { ...config.internationalPayment.ibanEgp, iban: e.target.value }
                          }
                        })}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-300 mb-1">⚡ سويفت كود (SWIFT / BIC)</label>
                      <input
                        type="text"
                        value={config.internationalPayment.ibanEgp.swiftCode}
                        onChange={e => setConfig({
                          ...config,
                          internationalPayment: {
                            ...config.internationalPayment,
                            ibanEgp: { ...config.internationalPayment.ibanEgp, swiftCode: e.target.value }
                          }
                        })}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-300 mb-1">📌 ملاحظات التحويل</label>
                      <input
                        type="text"
                        value={config.internationalPayment.ibanEgp.notes || ''}
                        onChange={e => setConfig({
                          ...config,
                          internationalPayment: {
                            ...config.internationalPayment,
                            ibanEgp: { ...config.internationalPayment.ibanEgp, notes: e.target.value }
                          }
                        })}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                      />
                    </div>
                  </div>
                </div>

                {/* USD IBAN Card */}
                <div className="bg-slate-900/80 rounded-xl p-5 border border-slate-700 space-y-3.5">
                  <div className="flex items-center gap-2 pb-2.5 border-b border-slate-700">
                    <Building className="w-4 h-4 text-sky-400" />
                    <div>
                      <h4 className="text-sm font-black text-sky-400">2. قائمة الحساب البنكي والآيبان بالدولار الأمريكي (USD)</h4>
                      <span className="text-[10px] text-slate-400">تظهر عند اختيار المشترك: حساب بنكي بالدولار الأمريكي</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-300 mb-1">🌍 الدولة (Country)</label>
                      <input
                        type="text"
                        value={config.internationalPayment.ibanUsd.country || 'دولي 🌍'}
                        onChange={e => setConfig({
                          ...config,
                          internationalPayment: {
                            ...config.internationalPayment,
                            ibanUsd: { ...config.internationalPayment.ibanUsd, country: e.target.value }
                          }
                        })}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-300 mb-1">🏛 اسم البنك (Bank Name)</label>
                      <input
                        type="text"
                        value={config.internationalPayment.ibanUsd.bankName}
                        onChange={e => setConfig({
                          ...config,
                          internationalPayment: {
                            ...config.internationalPayment,
                            ibanUsd: { ...config.internationalPayment.ibanUsd, bankName: e.target.value }
                          }
                        })}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-300 mb-1">👤 اسم المستفيد (Beneficiary)</label>
                      <input
                        type="text"
                        value={config.internationalPayment.ibanUsd.beneficiaryName}
                        onChange={e => setConfig({
                          ...config,
                          internationalPayment: {
                            ...config.internationalPayment,
                            ibanUsd: { ...config.internationalPayment.ibanUsd, beneficiaryName: e.target.value }
                          }
                        })}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-300 mb-1">💰 العملة (Currency)</label>
                      <input
                        type="text"
                        value={config.internationalPayment.ibanUsd.currency || 'الدولار الأمريكي ($)'}
                        onChange={e => setConfig({
                          ...config,
                          internationalPayment: {
                            ...config.internationalPayment,
                            ibanUsd: { ...config.internationalPayment.ibanUsd, currency: e.target.value }
                          }
                        })}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-300 mb-1">🔢 رقم الحساب (Account Number)</label>
                      <input
                        type="text"
                        value={config.internationalPayment.ibanUsd.accountNumber}
                        onChange={e => setConfig({
                          ...config,
                          internationalPayment: {
                            ...config.internationalPayment,
                            ibanUsd: { ...config.internationalPayment.ibanUsd, accountNumber: e.target.value }
                          }
                        })}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-300 mb-1">🌐 رقم الآيبان (IBAN Code)</label>
                      <input
                        type="text"
                        value={config.internationalPayment.ibanUsd.iban}
                        onChange={e => setConfig({
                          ...config,
                          internationalPayment: {
                            ...config.internationalPayment,
                            ibanUsd: { ...config.internationalPayment.ibanUsd, iban: e.target.value }
                          }
                        })}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-300 mb-1">⚡ سويفت كود (SWIFT / BIC)</label>
                      <input
                        type="text"
                        value={config.internationalPayment.ibanUsd.swiftCode}
                        onChange={e => setConfig({
                          ...config,
                          internationalPayment: {
                            ...config.internationalPayment,
                            ibanUsd: { ...config.internationalPayment.ibanUsd, swiftCode: e.target.value }
                          }
                        })}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-300 mb-1">📌 ملاحظات التحويل الدولي</label>
                      <input
                        type="text"
                        value={config.internationalPayment.ibanUsd.notes || ''}
                        onChange={e => setConfig({
                          ...config,
                          internationalPayment: {
                            ...config.internationalPayment,
                            ibanUsd: { ...config.internationalPayment.ibanUsd, notes: e.target.value }
                          }
                        })}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Robot Guide & Media Section */}
            <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-6 shadow-md">
              <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-700">
                <Flame className="w-5 h-5 text-indigo-400" />
                <h3 className="text-base font-extrabold text-white">محتوى شرح وفيديوهات روبوت التداول الآلي داخل البوت</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">رابط فيديو شرح عمل الروبوت (YouTube / Video)</label>
                  <input
                    type="text"
                    value={config.robotGuide.videoUrl}
                    onChange={e => setConfig({
                      ...config,
                      robotGuide: { ...config.robotGuide, videoUrl: e.target.value }
                    })}
                    placeholder="https://youtube.com/watch?v=..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">رابط صورة أو بوستر الروبوت</label>
                  <input
                    type="text"
                    value={config.robotGuide.imageUrl}
                    onChange={e => setConfig({
                      ...config,
                      robotGuide: { ...config.robotGuide, imageUrl: e.target.value }
                    })}
                    placeholder="/assets/aistudio/1_c5a8975d.PNG"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 font-mono text-xs"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">النص التوضيحي لشرح الروبوت بالعربية</label>
                  <textarea
                    rows={3}
                    value={config.robotGuide.descriptionAr}
                    onChange={e => setConfig({
                      ...config,
                      robotGuide: { ...config.robotGuide, descriptionAr: e.target.value }
                    })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            </div>

            {/* Bottom Save */}
            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={isLoading}
                className="px-8 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-sm shadow-xl shadow-indigo-600/30 transition-all cursor-pointer flex items-center gap-2"
              >
                <Check className="w-5 h-5" />
                <span>تثبيت وحفظ التعديلات</span>
              </button>
            </div>
          </form>
        )}

        {/* ==================== TAB 3: BROADCAST ANNOUNCEMENTS ==================== */}
        {activeTab === 'broadcast' && (
          <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-6 shadow-xl max-w-4xl mx-auto space-y-6">
            <div className="flex items-center gap-3 pb-4 border-b border-slate-700">
              <div className="w-10 h-10 rounded-xl bg-indigo-600/30 text-indigo-400 flex items-center justify-center">
                <Send className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-black text-white">إرسال بث جماعي مباشر للمشتركين (Broadcast)</h2>
                <p className="text-xs text-slate-400">إرسال تنبيهات، تحديثات الإشارات، أو عروض ترويجية لجميع أعضاء البوت فوراً</p>
              </div>
            </div>

            <form onSubmit={handleBroadcast} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">لغة الجمهور المستهدف</label>
                  <select
                    value={broadcastLang}
                    onChange={e => setBroadcastLang(e.target.value as any)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 font-bold"
                  >
                    <option value="all">الكل (العربية والإنجليزية)</option>
                    <option value="ar">المشتركين الناطقين بالعربية فقط 🇸🇦</option>
                    <option value="en">English Speaking Members Only 🇬🇧</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">حالة الحساب المستهدف</label>
                  <select
                    value={broadcastTarget}
                    onChange={e => setBroadcastTarget(e.target.value as any)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 font-bold"
                  >
                    <option value="ACTIVE">الأعضاء النشطين فقط (موصى به)</option>
                    <option value="all">كافة الأعضاء المسجلين</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">نص رسالة البث (يدعم تنسيق HTML)</label>
                <textarea
                  rows={6}
                  value={broadcastText}
                  onChange={e => setBroadcastText(e.target.value)}
                  placeholder="اكتب رسالتك هنا، مثلاً:
📢 أهلاً بكم يا أبطال ZAD FX!
تم إضافة تحديث جديد لروبوت التداول الآلي، وتأكيد الإشارات المباشرة قبل 5 ثوانٍ..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-4 text-sm text-white focus:outline-none focus:border-indigo-500 placeholder-slate-500 leading-relaxed font-sans"
                />
              </div>

              <div className="flex items-center justify-between pt-3">
                <span className="text-xs text-slate-400">
                  سيتم الإرسال لعدد: <strong className="text-indigo-400 font-bold">{users.filter(u => broadcastTarget === 'all' || u.status === 'ACTIVE').length}</strong> عضو
                </span>
                <button
                  type="submit"
                  disabled={isBroadcasting || !broadcastText.trim()}
                  className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-sm shadow-lg shadow-indigo-600/30 transition-all cursor-pointer flex items-center gap-2 disabled:opacity-50"
                >
                  <Send className={`w-4 h-4 ${isBroadcasting ? 'animate-spin' : ''}`} />
                  <span>{isBroadcasting ? 'جارِ الإرسال...' : 'بدء البث الجماعي الآن'}</span>
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ==================== TAB 4: SIMULATOR ==================== */}
        {activeTab === 'simulator' && (
          <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-6 shadow-xl max-w-xl mx-auto space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-700">
              <div className="flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-indigo-400" />
                <h3 className="text-base font-extrabold text-white">محاكي تجربة المشترك في تليجرام</h3>
              </div>
              <button
                onClick={() => setSimStep('start')}
                className="text-xs text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer font-bold"
              >
                <RefreshCw className="w-3 h-3" />
                <span>إعادة البدء (/start)</span>
              </button>
            </div>

            {/* Telegram Screen Frame */}
            <div className="bg-slate-950 rounded-2xl border-4 border-slate-800 p-4 min-h-[460px] flex flex-col justify-between shadow-2xl relative">
              {/* Bot Header inside frame */}
              <div className="flex items-center gap-2.5 pb-3 border-b border-slate-800">
                <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-bold text-white">
                  FX
                </div>
                <div>
                  <div className="text-xs font-bold text-white">ZAD FX Auto Bot</div>
                  <div className="text-[10px] text-emerald-400">bot • دائماً متصل</div>
                </div>
              </div>

              {/* Chat Bubble Area */}
              <div className="flex-1 py-4 space-y-3 overflow-y-auto">
                {/* STEP: START */}
                {simStep === 'start' && (
                  <div className="space-y-3">
                    <div className="bg-slate-800 rounded-2xl rounded-tr-none p-3.5 text-xs text-slate-200 leading-relaxed max-w-[85%] border border-slate-700">
                      مرحباً بك في بوت أكاديمية وروبوت ZAD FX للتداول الآلي 🚀<br />
                      <i>Welcome to ZAD FX Automated Trading Bot</i><br /><br />
                      يرجى اختيار لغة المتابعة / Please choose your language:
                    </div>
                    <div className="grid grid-cols-2 gap-2 max-w-[85%]">
                      <button
                        onClick={() => {
                          setSimLang('ar');
                          setSimStep('name');
                        }}
                        className="py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow text-center cursor-pointer transition-colors"
                      >
                        العربية 🇸🇦
                      </button>
                      <button
                        onClick={() => {
                          setSimLang('en');
                          setSimStep('name');
                        }}
                        className="py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow text-center cursor-pointer transition-colors"
                      >
                        English 🇬🇧
                      </button>
                    </div>
                  </div>
                )}

                {/* STEP: NAME */}
                {simStep === 'name' && (
                  <div className="space-y-3">
                    <div className="bg-slate-800 rounded-2xl rounded-tr-none p-3.5 text-xs text-slate-200 leading-relaxed max-w-[85%] border border-slate-700">
                      {simLang === 'ar' ? (
                        <>أهلاً بك في ZAD FX! 🌟<br />يرجى كتابة <b>اسمك الكريم بالكامل</b> للمتابعة:</>
                      ) : (
                        <>Welcome to ZAD FX! 🌟<br />Please enter your <b>Full Name</b> to continue:</>
                      )}
                    </div>
                    {/* User response mock */}
                    <div className="mr-auto bg-indigo-700 rounded-2xl rounded-tl-none p-2.5 text-xs text-white max-w-[70%] font-bold">
                      {simName}
                    </div>
                    <div className="flex justify-end">
                      <button
                        onClick={() => setSimStep('country')}
                        className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg font-bold cursor-pointer transition-colors"
                      >
                        التالي: كتابة الدولة ➡️
                      </button>
                    </div>
                  </div>
                )}

                {/* STEP: COUNTRY */}
                {simStep === 'country' && (
                  <div className="space-y-3">
                    <div className="bg-slate-800 rounded-2xl rounded-tr-none p-3.5 text-xs text-slate-200 leading-relaxed max-w-[85%] border border-slate-700">
                      {simLang === 'ar' ? (
                        <>أهلاً بك يا <b>{simName}</b>! 🌍<br />يرجى الآن تحديد أو كتابة <b>الدولة التي تقيم فيها حالياً</b>:</>
                      ) : (
                        <>Welcome <b>{simName}</b>! 🌍<br />Please enter the <b>Country where you currently reside</b>:</>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 max-w-[95%]">
                      <button
                        onClick={() => {
                          setSimCountry('مصر');
                          setSimStep('menu');
                        }}
                        className="py-2 px-2.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold text-[11px] cursor-pointer text-center"
                      >
                        مصر 🇪🇬 (إنستا باي ومحافظ)
                      </button>
                      <button
                        onClick={() => {
                          setSimCountry('فلسطين');
                          setSimStep('menu');
                        }}
                        className="py-2 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] cursor-pointer text-center"
                      >
                        فلسطين 🇵🇸 (بنك فلسطين)
                      </button>
                      <button
                        onClick={() => {
                          setSimCountry('الإمارات');
                          setSimStep('menu');
                        }}
                        className="py-2 px-2.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold text-[11px] cursor-pointer text-center"
                      >
                        دولة أخرى 🌍 (حساب دولي)
                      </button>
                    </div>
                  </div>
                )}

                {/* STEP: MAIN MENU */}
                {simStep === 'menu' && (
                  <div className="space-y-3">
                    <div className="bg-slate-800 rounded-2xl rounded-tr-none p-3.5 text-xs text-slate-200 leading-relaxed max-w-[85%] border border-slate-700">
                      ✅ تم تجهيز ملف عضويتك بنجاح!<br />
                      👤 الاسم: <b>{simName}</b><br />
                      🌍 الدولة: <b>{simCountry}</b><br /><br />
                      اختر ما ترغب به من القائمة الرئيسية:
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 max-w-[95%]">
                      <a
                        href={config.freeChannelLink}
                        target="_blank"
                        rel="noreferrer"
                        className="py-2 px-2 text-center rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-bold border border-slate-700"
                      >
                        📢 قناة التليجرام المجانية
                      </a>
                      <button
                        onClick={() => setSimStep('memberships')}
                        className="py-2 px-2 text-center rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold shadow cursor-pointer"
                      >
                        💎 العضوية والاشتراكات
                      </button>
                      <a
                        href={config.officialWebsiteUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="py-2 px-2 text-center rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-bold border border-slate-700"
                      >
                        🌐 الموقع الرسمي
                      </a>
                      <a
                        href={`https://t.me/${config.adminTelegramUsername.replace(/^@/, '')}`}
                        target="_blank"
                        rel="noreferrer"
                        className="py-2 px-2 text-center rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-bold border border-slate-700"
                      >
                        💬 تواصل معنا
                      </a>
                      <button
                        onClick={() => setSimStep('robot_guide')}
                        className="py-2 px-2 text-center rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold shadow cursor-pointer"
                      >
                        🤖 روبوت التداول الآلي
                      </button>
                      <a
                        href={config.quotexReferralUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="py-2 px-2 text-center rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-bold shadow"
                      >
                        🔗 رابط الإحالة كيوتكس
                      </a>
                    </div>
                  </div>
                )}

                {/* STEP: MEMBERSHIPS */}
                {simStep === 'memberships' && (
                  <div className="space-y-3">
                    <div className="bg-slate-800 rounded-2xl rounded-tr-none p-3.5 text-xs text-slate-200 leading-relaxed max-w-[85%] border border-slate-700">
                      💎 <b>العضوية والاشتراكات في ZAD FX:</b><br /><br />
                      اختر نوع العضوية المطلوبة:<br />
                      1️⃣ <b>الاشتراك المجاني عبر الإحالة:</b> تفعيل مجاني لقناة VIP وروبوت التداول عند التسجيل عبر رابطنا والإيداع.<br />
                      2️⃣ <b>العضوية المدفوعة:</b> اشتراك مباشر بالدفع الفوري والمحافظ أو التحويل البنكي.
                    </div>
                    <div className="flex flex-col gap-2 max-w-[85%]">
                      <button
                        onClick={() => setSimStep('referral')}
                        className="py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold text-center cursor-pointer"
                      >
                        🎁 الاشتراك المجاني عبر الإحالة
                      </button>
                      <button
                        onClick={() => {
                          if (isPalestineCheck(simCountry)) {
                            setSimStep('paid_palestine');
                          } else if (isEgyptCheck(simCountry)) {
                            setSimStep('paid_egypt');
                          } else {
                            setSimStep('paid_intl');
                          }
                        }}
                        className="py-2 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold text-center cursor-pointer"
                      >
                        💳 العضوية المدفوعة VIP
                      </button>
                      <button
                        onClick={() => setSimStep('menu')}
                        className="py-1.5 px-3 rounded-lg bg-slate-800 text-slate-300 text-xs font-bold text-center cursor-pointer"
                      >
                        🔙 العودة للقائمة الرئيسية
                      </button>
                    </div>
                  </div>
                )}

                {/* STEP: REFERRAL */}
                {simStep === 'referral' && (
                  <div className="space-y-3">
                    <div className="bg-slate-800 rounded-2xl rounded-tr-none p-3.5 text-xs text-slate-200 leading-relaxed max-w-[85%] border border-slate-700">
                      🎁 <b>الاشتراك المجاني عبر إحالة كيوتكس:</b><br /><br />
                      1. افتح حساب جديد برابط الإحالة أدناه:<br />
                      2. أودع 100$ كحد أدنى في حسابك الخاص للتداول بها.<br />
                      3. أرسل صورة الحساب ورقم ID للمشرف لتفعيل اشتراكك فوراً!
                    </div>
                    <div className="flex flex-col gap-2 max-w-[85%]">
                      <a
                        href={config.quotexReferralUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="py-2 px-3 rounded-lg bg-amber-600 text-white text-xs font-bold text-center"
                      >
                        🔗 فتح حساب كيوتكس عبر الإحالة
                      </a>
                      <a
                        href={`https://t.me/${config.adminTelegramUsername.replace(/^@/, '')}`}
                        target="_blank"
                        rel="noreferrer"
                        className="py-2 px-3 rounded-lg bg-indigo-600 text-white text-xs font-bold text-center"
                      >
                        📩 إرسال لقطة الشاشة ورقم المعرف للمشرف
                      </a>
                      <button
                        onClick={() => setSimStep('memberships')}
                        className="py-1 px-3 text-xs text-slate-400 hover:text-white"
                      >
                        🔙 رجوع
                      </button>
                    </div>
                  </div>
                )}

                {/* STEP: PALESTINE ROUTING */}
                {simStep === 'paid_palestine' && (
                  <div className="space-y-3">
                    <div className="bg-slate-800 rounded-2xl rounded-tr-none p-3.5 text-xs text-slate-200 leading-relaxed max-w-[85%] border border-emerald-500/40">
                      🇵🇸 <b>تفاصيل الحساب البنكي في دولة فلسطين (بنك فلسطين):</b><br /><br />
                      🌍 <b>الدولة:</b> {config.palestinePayment?.country || 'فلسطين 🇵🇸'}<br />
                      🏛 <b>اسم البنك:</b> {config.palestinePayment?.bankName || 'بنك فلسطين (Bank of Palestine)'}<br />
                      👤 <b>اسم المستفيد:</b> {config.palestinePayment?.beneficiaryName || 'ثريا نبيل / ZAD FX'}<br />
                      💰 <b>العملة:</b> {config.palestinePayment?.currency || 'دولار أمريكي ($) / شيكل (ILS)'}<br />
                      🔢 <b>رقم الحساب:</b> <code>{config.palestinePayment?.accountNumber}</code><br />
                      🌐 <b>رقم الآيبان (IBAN):</b> <code>{config.palestinePayment?.iban}</code><br />
                      🏢 <b>الفرع:</b> {config.palestinePayment?.branch || 'الفرع الرئيسي'}<br /><br />
                      📌 <i>{config.palestinePayment?.notes || 'الإيداع النقدي المباشر أو التحويل البنكي الفوري عبر تطبيق بنك فلسطين'}</i>
                    </div>
                    <div className="flex flex-col gap-2 max-w-[85%]">
                      <a
                        href={`https://t.me/${config.adminTelegramUsername.replace(/^@/, '')}`}
                        target="_blank"
                        rel="noreferrer"
                        className="py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold text-center"
                      >
                        📩 إرسال إشعار التحويل للمشرف
                      </a>
                      <button
                        onClick={() => setSimStep('memberships')}
                        className="py-1 px-3 text-xs text-slate-400 hover:text-white"
                      >
                        🔙 رجوع للاشتراكات
                      </button>
                    </div>
                  </div>
                )}

                {/* STEP: EGYPT ROUTING */}
                {simStep === 'paid_egypt' && (
                  <div className="space-y-3">
                    <div className="bg-slate-800 rounded-2xl rounded-tr-none p-3.5 text-xs text-slate-200 leading-relaxed max-w-[85%] border border-slate-700">
                      🇪🇬 <b>طرق الدفع المتاحة داخل جمهورية مصر العربية:</b><br /><br />
                      تم توجيهك تلقائياً لنظام الدفع المحلي في مصر:<br />
                      • إنستا باي (InstaPay) تحويل لحظي<br />
                      • المحافظ الإلكترونية (فودافون كاش، اتصالات، أورنج، وي)
                    </div>
                    <div className="flex flex-col gap-2 max-w-[85%]">
                      <button
                        onClick={() => setSimStep('instapay')}
                        className="py-2 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold cursor-pointer"
                      >
                        ⚡ إنستا باي (InstaPay)
                      </button>
                      <button
                        onClick={() => setSimStep('wallets')}
                        className="py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer"
                      >
                        📱 المحافظ الإلكترونية (كاش)
                      </button>
                      <button
                        onClick={() => setSimStep('memberships')}
                        className="py-1 px-3 text-xs text-slate-400 hover:text-white"
                      >
                        🔙 رجوع
                      </button>
                    </div>
                  </div>
                )}

                {/* STEP: INSTAPAY */}
                {simStep === 'instapay' && (
                  <div className="space-y-3">
                    <div className="bg-slate-800 rounded-2xl rounded-tr-none p-3.5 text-xs text-slate-200 leading-relaxed max-w-[85%] border border-slate-700">
                      ⚡ <b>بيانات السداد عبر إنستا باي (InstaPay):</b><br /><br />
                      👤 الاسم: <b>{config.egyptPayment.instapayName}</b><br />
                      🆔 عنوان الدفع: <code>{config.egyptPayment.instapayAccount}</code><br /><br />
                      📌 يرجى إرسال صورة إيصال التحويل للمشرف لتفعيل الحساب فوراً.
                    </div>
                    <div className="flex flex-col gap-2 max-w-[85%]">
                      <a
                        href={`https://t.me/${config.adminTelegramUsername.replace(/^@/, '')}`}
                        target="_blank"
                        rel="noreferrer"
                        className="py-2 px-3 rounded-lg bg-indigo-600 text-white text-xs font-bold text-center"
                      >
                        📩 إرسال إيصال التحويل للمشرف
                      </a>
                      <button
                        onClick={() => setSimStep('paid_egypt')}
                        className="py-1 px-3 text-xs text-slate-400 hover:text-white"
                      >
                        🔙 رجوع لخيارات الدفع
                      </button>
                    </div>
                  </div>
                )}

                {/* STEP: WALLETS */}
                {simStep === 'wallets' && (
                  <div className="space-y-3">
                    <div className="bg-slate-800 rounded-2xl rounded-tr-none p-3.5 text-xs text-slate-200 leading-relaxed max-w-[85%] border border-slate-700">
                      📱 <b>المحافظ الإلكترونية المصرية:</b><br /><br />
                      🔴 فودافون كاش: <code>{config.egyptPayment.vodafoneCash}</code><br />
                      🟢 اتصالات كاش: <code>{config.egyptPayment.etisalatCash}</code><br />
                      🟠 أورنج كاش: <code>{config.egyptPayment.orangeCash}</code><br />
                      🟣 وي باي: <code>{config.egyptPayment.wePay}</code><br /><br />
                      📌 يرجى إرسال لقطة شاشة لرسالة التحويل للمشرف للتفعيل.
                    </div>
                    <div className="flex flex-col gap-2 max-w-[85%]">
                      <a
                        href={`https://t.me/${config.adminTelegramUsername.replace(/^@/, '')}`}
                        target="_blank"
                        rel="noreferrer"
                        className="py-2 px-3 rounded-lg bg-indigo-600 text-white text-xs font-bold text-center"
                      >
                        📩 إرسال لقطة الشاشة للمشرف
                      </a>
                      <button
                        onClick={() => setSimStep('paid_egypt')}
                        className="py-1 px-3 text-xs text-slate-400 hover:text-white"
                      >
                        🔙 رجوع لخيارات الدفع
                      </button>
                    </div>
                  </div>
                )}

                {/* STEP: INTL ROUTING (REST OF WORLD) */}
                {simStep === 'paid_intl' && (
                  <div className="space-y-3">
                    <div className="bg-slate-800 rounded-2xl rounded-tr-none p-3.5 text-xs text-slate-200 leading-relaxed max-w-[85%] border border-sky-500/40">
                      🌍 <b>التحويل البنكي الدولي المتاح لدولتك ({simCountry}):</b><br /><br />
                      يرجى اختيار العملة المطلوبة لعرض تفاصيل الحساب والآيبان بشكل منفصل:
                    </div>
                    <div className="flex flex-col gap-2 max-w-[85%]">
                      <button
                        onClick={() => setSimStep('iban_egp')}
                        className="py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer flex items-center justify-between"
                      >
                        <span>🏦 حساب بنكي بالجنيه المصري (EGP)</span>
                        <span className="text-[10px] opacity-80">عرض الآيبان ⬅️</span>
                      </button>
                      <button
                        onClick={() => setSimStep('iban_usd')}
                        className="py-2 px-3 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold cursor-pointer flex items-center justify-between"
                      >
                        <span>💵 حساب بنكي بالدولار الأمريكي (USD)</span>
                        <span className="text-[10px] opacity-80">عرض الآيبان ⬅️</span>
                      </button>
                      <button
                        onClick={() => setSimStep('memberships')}
                        className="py-1 px-3 text-xs text-slate-400 hover:text-white text-center"
                      >
                        🔙 رجوع للاشتراكات
                      </button>
                    </div>
                  </div>
                )}

                {/* STEP: IBAN EGP */}
                {simStep === 'iban_egp' && (
                  <div className="space-y-3">
                    <div className="bg-slate-800 rounded-2xl rounded-tr-none p-3.5 text-xs text-slate-200 leading-relaxed max-w-[85%] border border-emerald-500/40">
                      🏦 <b>قائمة الحساب البنكي والآيبان (بالجنيه المصري EGP):</b><br /><br />
                      🌍 <b>الدولة:</b> {config.internationalPayment.ibanEgp.country || 'جمهورية مصر العربية 🇪🇬'}<br />
                      🏛 <b>اسم البنك:</b> {config.internationalPayment.ibanEgp.bankName}<br />
                      👤 <b>اسم المستفيد:</b> {config.internationalPayment.ibanEgp.beneficiaryName}<br />
                      💰 <b>العملة:</b> {config.internationalPayment.ibanEgp.currency || 'الجنيه المصري (EGP)'}<br />
                      🔢 <b>رقم الحساب:</b> <code>{config.internationalPayment.ibanEgp.accountNumber}</code><br />
                      🌐 <b>رقم الآيبان (IBAN):</b> <code>{config.internationalPayment.ibanEgp.iban}</code><br />
                      ⚡ <b>سويفت كود (SWIFT):</b> <code>{config.internationalPayment.ibanEgp.swiftCode}</code><br /><br />
                      📌 <i>{config.internationalPayment.ibanEgp.notes || 'يرجى إرسال إشعار التحويل للمشرف لتفعيل اشتراكك وروبوت التداول فوراً.'}</i>
                    </div>
                    <div className="flex flex-col gap-2 max-w-[85%]">
                      <a
                        href={`https://t.me/${config.adminTelegramUsername.replace(/^@/, '')}`}
                        target="_blank"
                        rel="noreferrer"
                        className="py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold text-center"
                      >
                        📩 إرسال إشعار الحوالة للمشرف
                      </a>
                      <button
                        onClick={() => setSimStep('iban_usd')}
                        className="py-1.5 px-3 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold text-center cursor-pointer"
                      >
                        💵 التحويل بالدولار الأمريكي (USD)
                      </button>
                      <button
                        onClick={() => setSimStep('paid_intl')}
                        className="py-1 px-3 text-xs text-slate-400 hover:text-white text-center"
                      >
                        🔙 رجوع لخيارات الآيبان
                      </button>
                    </div>
                  </div>
                )}

                {/* STEP: IBAN USD */}
                {simStep === 'iban_usd' && (
                  <div className="space-y-3">
                    <div className="bg-slate-800 rounded-2xl rounded-tr-none p-3.5 text-xs text-slate-200 leading-relaxed max-w-[85%] border border-sky-500/40">
                      💵 <b>قائمة الحساب البنكي والآيبان (بالدولار الأمريكي USD):</b><br /><br />
                      🌍 <b>الدولة:</b> {config.internationalPayment.ibanUsd.country || 'دولي 🌍'}<br />
                      🏛 <b>اسم البنك:</b> {config.internationalPayment.ibanUsd.bankName}<br />
                      👤 <b>اسم المستفيد:</b> {config.internationalPayment.ibanUsd.beneficiaryName}<br />
                      💰 <b>العملة:</b> {config.internationalPayment.ibanUsd.currency || 'الدولار الأمريكي ($ - USD)'}<br />
                      🔢 <b>رقم الحساب:</b> <code>{config.internationalPayment.ibanUsd.accountNumber}</code><br />
                      🌐 <b>رقم الآيبان (IBAN):</b> <code>{config.internationalPayment.ibanUsd.iban}</code><br />
                      ⚡ <b>سويفت كود (SWIFT):</b> <code>{config.internationalPayment.ibanUsd.swiftCode}</code><br /><br />
                      📌 <i>{config.internationalPayment.ibanUsd.notes || 'Please send wire transfer receipt to admin for instant activation.'}</i>
                    </div>
                    <div className="flex flex-col gap-2 max-w-[85%]">
                      <a
                        href={`https://t.me/${config.adminTelegramUsername.replace(/^@/, '')}`}
                        target="_blank"
                        rel="noreferrer"
                        className="py-2 px-3 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold text-center"
                      >
                        📩 إرسال إشعار الحوالة للمشرف
                      </a>
                      <button
                        onClick={() => setSimStep('iban_egp')}
                        className="py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold text-center cursor-pointer"
                      >
                        🏦 التحويل بالجنيه المصري (EGP)
                      </button>
                      <button
                        onClick={() => setSimStep('paid_intl')}
                        className="py-1 px-3 text-xs text-slate-400 hover:text-white text-center"
                      >
                        🔙 رجوع لخيارات الآيبان
                      </button>
                    </div>
                  </div>
                )}

                {/* STEP: ROBOT GUIDE */}
                {simStep === 'robot_guide' && (
                  <div className="space-y-3">
                    <div className="bg-slate-800 rounded-2xl rounded-tr-none p-3.5 text-xs text-slate-200 leading-relaxed max-w-[85%] border border-slate-700">
                      🤖 <b>روبوت التداول الآلي الذكي ZAD FX:</b><br /><br />
                      {config.robotGuide.descriptionAr}<br /><br />
                      ⏰ <b>مواعيد العمل:</b><br />
                      الفترة الأولى: 09:00 ص إلى 03:00 م<br />
                      الفترة الثانية: 06:00 م إلى 09:00 م<br /><br />
                      ⚡ فتح الصفقات بتأكيد 5 ثوانٍ قبل الشمعة (00.00).
                    </div>
                    <div className="flex flex-col gap-2 max-w-[85%]">
                      <a
                        href={config.robotGuide.videoUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="py-2 px-3 rounded-lg bg-indigo-600 text-white text-xs font-bold text-center"
                      >
                        🎬 مشاهدة فيديو شرح التشغيل
                      </a>
                      <button
                        onClick={() => setSimStep('menu')}
                        className="py-1.5 px-3 rounded-lg bg-slate-800 text-slate-300 text-xs font-bold text-center"
                      >
                        🏠 العودة للقائمة الرئيسية
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ==================== MODAL 1: EDIT USER ==================== */}
      {editingUser && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-700">
              <h3 className="text-base font-extrabold text-white">تعديل ملف العضو ({editingUser.name})</h3>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEditUser} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">اسم العضو</label>
                <input
                  type="text"
                  value={editingUser.name}
                  onChange={e => setEditingUser({ ...editingUser, name: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">الدولة</label>
                  <input
                    type="text"
                    value={editingUser.country}
                    onChange={e => setEditingUser({ ...editingUser, country: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">اللغة</label>
                  <select
                    value={editingUser.language}
                    onChange={e => setEditingUser({ ...editingUser, language: e.target.value as any })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-bold"
                  >
                    <option value="ar">العربية 🇸🇦</option>
                    <option value="en">English 🇬🇧</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">نوع العضوية</label>
                  <select
                    value={editingUser.membershipType}
                    onChange={e => setEditingUser({ ...editingUser, membershipType: e.target.value as any })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-bold"
                  >
                    <option value="FREE_REFERRAL">إحالة كيوتكس مجاناً</option>
                    <option value="PAID_VIP">عضوية VIP مدفوعة</option>
                    <option value="NONE">غير محدد</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">الحالة</label>
                  <select
                    value={editingUser.status}
                    onChange={e => setEditingUser({ ...editingUser, status: e.target.value as any })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-bold"
                  >
                    <option value="ACTIVE">نشط (Active)</option>
                    <option value="SUSPENDED">معلق (Suspended)</option>
                    <option value="BLOCKED">موقوف (Blocked)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">رقم معرف كيوتكس (Quotex ID)</label>
                <input
                  type="text"
                  value={editingUser.brokerId || ''}
                  onChange={e => setEditingUser({ ...editingUser, brokerId: e.target.value })}
                  placeholder="مثال: 9812450"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">ملاحظات الإدارة</label>
                <textarea
                  rows={2}
                  value={editingUser.notes || ''}
                  onChange={e => setEditingUser({ ...editingUser, notes: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-bold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow cursor-pointer"
                >
                  حفظ التعديلات
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================== MODAL 2: ADD MEMBER MANUALLY ==================== */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-700">
              <h3 className="text-base font-extrabold text-white">إضافة عضو جديد يدوياً إلى سجل البوت</h3>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddMember} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">اسم العضو الكريم *</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: محمد السيد"
                  value={newMember.name}
                  onChange={e => setNewMember({ ...newMember, name: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">معرف تليجرام Chat ID *</label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: 589124011"
                    value={newMember.telegramChatId}
                    onChange={e => setNewMember({ ...newMember, telegramChatId: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">اليوزرنيم (Username)</label>
                  <input
                    type="text"
                    placeholder="@username"
                    value={newMember.username}
                    onChange={e => setNewMember({ ...newMember, username: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">الدولة</label>
                  <input
                    type="text"
                    placeholder="مصر، السعودية، الإمارات..."
                    value={newMember.country}
                    onChange={e => setNewMember({ ...newMember, country: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">اللغة المفضلة</label>
                  <select
                    value={newMember.language}
                    onChange={e => setNewMember({ ...newMember, language: e.target.value as any })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-bold"
                  >
                    <option value="ar">العربية 🇸🇦</option>
                    <option value="en">English 🇬🇧</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">نوع العضوية</label>
                  <select
                    value={newMember.membershipType}
                    onChange={e => setNewMember({ ...newMember, membershipType: e.target.value as any })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-bold"
                  >
                    <option value="FREE_REFERRAL">إحالة كيوتكس مجاناً</option>
                    <option value="PAID_VIP">عضوية VIP مدفوعة</option>
                    <option value="NONE">غير محدد</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">الحالة</label>
                  <select
                    value={newMember.status}
                    onChange={e => setNewMember({ ...newMember, status: e.target.value as any })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-bold"
                  >
                    <option value="ACTIVE">نشط (Active)</option>
                    <option value="SUSPENDED">معلق (Suspended)</option>
                    <option value="BLOCKED">موقوف (Blocked)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">رقم معرف كيوتكس (Quotex ID)</label>
                <input
                  type="text"
                  placeholder="مثال: 9812450"
                  value={newMember.brokerId}
                  onChange={e => setNewMember({ ...newMember, brokerId: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-mono"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-bold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black shadow cursor-pointer"
                >
                  تأكيد الإضافة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================== MODAL 3: DIRECT MESSAGE ==================== */}
      {directMsgUser && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-700">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-indigo-400" />
                <h3 className="text-sm font-extrabold text-white">إرسال رسالة تليجرام خاصة إلى: {directMsgUser.name}</h3>
              </div>
              <button
                type="button"
                onClick={() => setDirectMsgUser(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSendDirectMessage} className="space-y-4">
              <div className="text-xs text-slate-400">
                المعرف: <code className="text-indigo-300 font-mono">{directMsgUser.telegramChatId}</code> | الدولة: <strong>{directMsgUser.country}</strong>
              </div>

              <div>
                <textarea
                  rows={4}
                  required
                  placeholder="اكتب رسالتك للمشترك هنا..."
                  value={directMsgText}
                  onChange={e => setDirectMsgText(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDirectMsgUser(null)}
                  className="px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-bold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSendingMsg || !directMsgText.trim()}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow cursor-pointer flex items-center gap-1.5"
                >
                  <Send className={`w-3.5 h-3.5 ${isSendingMsg ? 'animate-spin' : ''}`} />
                  <span>{isSendingMsg ? 'جارِ الإرسال...' : 'إرسال الآن'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
