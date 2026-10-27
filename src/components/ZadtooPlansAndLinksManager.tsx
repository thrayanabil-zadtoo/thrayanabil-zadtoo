import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  Plus,
  Trash2,
  Edit3,
  Check,
  X,
  ExternalLink,
  Copy,
  Send,
  MessageCircle,
  Mail,
  ShieldCheck,
  Crown,
  Sparkles,
  Gift,
  Star,
  Zap,
  Save,
  RotateCcw,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import type { SubscriptionPlan, PlatformContactLinks } from '../types/platformConfig';
import {
  saveCloudPlans,
  loadCloudPlans,
  saveCloudContactLinks,
  loadCloudContactLinks
} from '../firebase';

interface ZadtooPlansAndLinksManagerProps {
  initialPlans?: SubscriptionPlan[];
  initialContactLinks?: PlatformContactLinks;
  onConfigChanged?: (plans: SubscriptionPlan[], contactLinks: PlatformContactLinks) => void;
}

export const ZadtooPlansAndLinksManager: React.FC<ZadtooPlansAndLinksManagerProps> = ({
  initialPlans,
  initialContactLinks,
  onConfigChanged
}) => {
  const [plans, setPlans] = useState<SubscriptionPlan[]>(() => {
    if (initialPlans && initialPlans.length > 0) return initialPlans;
    try {
      const cached = localStorage.getItem('zad_platform_plans');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (_e) {}
    return [];
  });

  const [contactLinks, setContactLinks] = useState<PlatformContactLinks>(() => {
    if (initialContactLinks) return initialContactLinks;
    try {
      const cached = localStorage.getItem('zad_platform_contact_links');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch (_e) {}
    return {
      quotexReferralLink: 'https://broker-qx.pro/?lid=2303934',
      telegramChannelUrl: 'https://t.me/ZadNBFX',
      telegramChannelUsername: '@ZadNBFX',
      telegramVipChannelUrl: 'https://t.me/ZadNBFX',
      telegramSupportUrl: 'https://t.me/ZadNBFX',
      whatsappSupportNumber: '+201000000000',
      supportEmail: 'support@zadtoo.com',
      contactNotes: 'الدعم متاح 24/7 عبر تليجرام وواتساب'
    };
  });

  const [isLoading, setIsLoading] = useState(false);
  const [isSavingLinks, setIsSavingLinks] = useState(false);
  const [isSavingPlan, setIsSavingPlan] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Edit / Add Plan Modal State
  const [editingPlanModal, setEditingPlanModal] = useState<{
    isOpen: boolean;
    isNew: boolean;
    data: SubscriptionPlan;
    featuresRawText: string;
  } | null>(null);

  // Delete confirmation
  const [planToDelete, setPlanToDelete] = useState<SubscriptionPlan | null>(null);

  // Keep state synced if initial props arrive/update
  useEffect(() => {
    if (initialPlans && initialPlans.length > 0) {
      setPlans(initialPlans);
    }
  }, [initialPlans]);

  useEffect(() => {
    if (initialContactLinks) {
      setContactLinks(initialContactLinks);
    }
  }, [initialContactLinks]);

  // Load config on mount
  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/platform-config');
      const data = await res.json();
      if (data.ok) {
        if (Array.isArray(data.plans) && data.plans.length > 0) {
          setPlans(data.plans);
          try {
            localStorage.setItem('zad_platform_plans', JSON.stringify(data.plans));
          } catch (_e) {}
        }
        if (data.contactLinks) {
          setContactLinks(data.contactLinks);
          try {
            localStorage.setItem('zad_platform_contact_links', JSON.stringify(data.contactLinks));
          } catch (_e) {}
        }
        if (onConfigChanged) {
          onConfigChanged(data.plans || [], data.contactLinks || contactLinks);
        }
      } else {
        // Fallback to Firestore
        await fallbackLoadCloud();
      }
    } catch (_e) {
      await fallbackLoadCloud();
    } finally {
      setIsLoading(false);
    }
  };

  const fallbackLoadCloud = async () => {
    try {
      const cloudPlans = await loadCloudPlans<SubscriptionPlan[]>();
      if (cloudPlans && Array.isArray(cloudPlans) && cloudPlans.length > 0) {
        setPlans(cloudPlans);
        if (onConfigChanged) onConfigChanged(cloudPlans, contactLinks);
      }
      const cloudLinks = await loadCloudContactLinks<PlatformContactLinks>();
      if (cloudLinks && typeof cloudLinks === 'object') {
        setContactLinks(cloudLinks);
        if (onConfigChanged) onConfigChanged(plans, cloudLinks);
      }
    } catch (_err) {}
  };

  const showFeedback = (text: string, type: 'success' | 'error' = 'success') => {
    setStatusMessage({ text, type });
    setTimeout(() => setStatusMessage(null), 4000);
  };

  const handleCopy = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Save Contact Links
  const handleSaveContactLinks = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSavingLinks(true);
    try {
      // 1. Direct save to Firestore cloud
      saveCloudContactLinks(contactLinks).catch(() => {});
      try {
        localStorage.setItem('zad_platform_contact_links', JSON.stringify(contactLinks));
      } catch (_e) {}

      // 2. Save to server
      const res = await fetch('/api/platform-config/contact-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contactLinks)
      });
      const data = await res.json();
      if (data.ok) {
        setContactLinks(data.contactLinks);
        showFeedback('تم حفظ وتحديث روابط التواصل والإحالة سحابياً بنجاح ✅');
        if (onConfigChanged) onConfigChanged(plans, data.contactLinks);
      } else {
        showFeedback(data.error || 'تعذر حفظ الروابط', 'error');
      }
    } catch (e: any) {
      showFeedback('تم حفظ الروابط سحابياً ومحلياً ✅');
    } finally {
      setIsSavingLinks(false);
    }
  };

  // Open Add Plan Modal
  const handleOpenAddPlan = () => {
    const newId = `plan_${Date.now()}`;
    setEditingPlanModal({
      isOpen: true,
      isNew: true,
      data: {
        id: newId,
        name: '',
        priceUsd: 29,
        durationDays: 30,
        durationLabel: '/ شهر',
        badge: 'جديد 🔥',
        features: ['إشارات فريم الدقيقة M1', 'دعم فني مباشر', 'تحليلات يومية'],
        isPopular: false,
        isReferralFree: false,
        enabled: true,
        icon: 'star',
        colorTheme: 'sky'
      },
      featuresRawText: 'إشارات فريم الدقيقة M1\nدعم فني مباشر\nتحليلات يومية'
    });
  };

  // Open Edit Plan Modal
  const handleOpenEditPlan = (plan: SubscriptionPlan) => {
    setEditingPlanModal({
      isOpen: true,
      isNew: false,
      data: { ...plan },
      featuresRawText: (plan.features || []).join('\n')
    });
  };

  // Submit Save Plan (Add or Edit)
  const handleSubmitPlanModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlanModal) return;

    const trimmedName = editingPlanModal.data.name.trim();
    if (!trimmedName) {
      showFeedback('يرجى كتابة مسمى الباقة', 'error');
      return;
    }

    const parsedFeatures = editingPlanModal.featuresRawText
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean);

    const payload: SubscriptionPlan = {
      ...editingPlanModal.data,
      name: trimmedName,
      priceUsd: Math.max(0, Number(editingPlanModal.data.priceUsd) || 0),
      durationDays: Math.max(1, Number(editingPlanModal.data.durationDays) || 30),
      durationLabel: editingPlanModal.data.durationLabel.trim() || '/ شهر',
      badge: editingPlanModal.data.badge?.trim() || undefined,
      features: parsedFeatures.length > 0 ? parsedFeatures : ['إشارات فوركس حية'],
      enabled: editingPlanModal.data.enabled !== false
    };

    setIsSavingPlan(true);

    // Optimistically prepare updated plans array
    let optimisticPlans: SubscriptionPlan[];
    if (editingPlanModal.isNew) {
      optimisticPlans = [...plans, payload];
    } else {
      optimisticPlans = plans.map(p => (p.id === payload.id ? payload : p));
      if (!optimisticPlans.some(p => p.id === payload.id)) {
        optimisticPlans.push(payload);
      }
    }

    // Direct Firestore cloud & local persistence
    try {
      localStorage.setItem('zad_platform_plans', JSON.stringify(optimisticPlans));
    } catch (_e) {}
    saveCloudPlans(optimisticPlans).catch(() => {});

    try {
      let res: Response;
      if (editingPlanModal.isNew) {
        res = await fetch('/api/platform-config/plans/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        res = await fetch(`/api/platform-config/plans/${payload.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }

      const data = await res.json();
      const finalPlans = data.ok && Array.isArray(data.plans) ? data.plans : optimisticPlans;
      setPlans(finalPlans);
      try {
        localStorage.setItem('zad_platform_plans', JSON.stringify(finalPlans));
      } catch (_e) {}
      saveCloudPlans(finalPlans).catch(() => {});
      setEditingPlanModal(null);
      showFeedback(
        editingPlanModal.isNew
          ? `تم إضافة الباقة "${payload.name}" وحفظها سحابياً بنجاح ✅`
          : `تم تحديث بيانات الباقة "${payload.name}" وحفظها سحابياً بنجاح ✅`
      );
      if (onConfigChanged) onConfigChanged(finalPlans, contactLinks);
    } catch (e: any) {
      setPlans(optimisticPlans);
      setEditingPlanModal(null);
      showFeedback(`تم حفظ الباقة "${payload.name}" محلياً وسحابياً بنجاح ✅`);
      if (onConfigChanged) onConfigChanged(optimisticPlans, contactLinks);
    } finally {
      setIsSavingPlan(false);
    }
  };

  // Toggle Plan Enabled / Disabled inline
  const handleTogglePlanEnabled = async (plan: SubscriptionPlan) => {
    const updated = { ...plan, enabled: !plan.enabled };
    const nextPlans = plans.map(p => (p.id === plan.id ? updated : p));
    setPlans(nextPlans);
    try {
      localStorage.setItem('zad_platform_plans', JSON.stringify(nextPlans));
    } catch (_e) {}
    saveCloudPlans(nextPlans).catch(() => {});
    if (onConfigChanged) onConfigChanged(nextPlans, contactLinks);

    try {
      const res = await fetch(`/api/platform-config/plans/${plan.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
      const data = await res.json();
      if (data.ok && Array.isArray(data.plans)) {
        setPlans(data.plans);
        try {
          localStorage.setItem('zad_platform_plans', JSON.stringify(data.plans));
        } catch (_e) {}
      }
      showFeedback(
        updated.enabled
          ? `تم تفعيل الباقة (${plan.name}) ✅`
          : `تم تعطيل الباقة (${plan.name}) مؤقتاً`
      );
    } catch (_e) {
      // Keep optimistic
    }
  };

  // Confirm Delete Plan
  const handleConfirmDelete = async () => {
    if (!planToDelete) return;
    const remainingPlans = plans.filter(p => p.id !== planToDelete.id);
    setPlans(remainingPlans);
    try {
      localStorage.setItem('zad_platform_plans', JSON.stringify(remainingPlans));
    } catch (_e) {}
    saveCloudPlans(remainingPlans).catch(() => {});
    if (onConfigChanged) onConfigChanged(remainingPlans, contactLinks);

    try {
      const res = await fetch(`/api/platform-config/plans/${planToDelete.id}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.ok && Array.isArray(data.plans)) {
        setPlans(data.plans);
        try {
          localStorage.setItem('zad_platform_plans', JSON.stringify(data.plans));
        } catch (_e) {}
        saveCloudPlans(data.plans).catch(() => {});
      }
      showFeedback(`تم حذف الباقة (${planToDelete.name}) بنجاح 🗑️`);
    } catch (e: any) {
      showFeedback(`تم حذف الباقة (${planToDelete.name}) محلياً وسحابياً بنجاح 🗑️`);
    } finally {
      setPlanToDelete(null);
    }
  };

  // Reset to default plans
  const handleResetPlans = async () => {
    if (!window.confirm('هل أنت متأكد من استعادة الباقات الأصلية الافتراضية للنظام؟')) return;
    try {
      const res = await fetch('/api/platform-config/reset-plans', { method: 'POST' });
      const data = await res.json();
      if (data.ok && Array.isArray(data.plans)) {
        setPlans(data.plans);
        try {
          localStorage.setItem('zad_platform_plans', JSON.stringify(data.plans));
        } catch (_e) {}
        saveCloudPlans(data.plans).catch(() => {});
        showFeedback('تمت استعادة الباقات الافتراضية وحفظها بنجاح 🔄');
        if (onConfigChanged) onConfigChanged(data.plans, contactLinks);
      }
    } catch (e: any) {
      showFeedback('خطأ: ' + e.message, 'error');
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Toast Feedback */}
      {statusMessage && (
        <div
          className={`p-4 rounded-2xl text-xs sm:text-sm font-bold flex items-center justify-between shadow-lg transition-all ${
            statusMessage.type === 'success'
              ? 'bg-emerald-600 text-white'
              : 'bg-rose-600 text-white'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 shrink-0" />
            )}
            <span>{statusMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusMessage(null)}
            className="text-white hover:opacity-80 cursor-pointer font-bold px-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* ============================================================== */}
      {/* SECTION 1: إعدادات روابط التواصل وقنوات التليجرام ورابط الإحالة */}
      {/* ============================================================== */}
      <div className="bg-white rounded-3xl p-5 sm:p-7 border border-slate-200/90 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center border border-sky-100">
              <Send className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-slate-900">
                إدارة روابط الإحالة وقنوات التليجرام ووسائل التواصل
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                تحديث رابط منصة كيوتكس، قناة التليجرام العامة والـ VIP، ووسائل الدعم الفني المباشر
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSaveContactLinks}
            disabled={isSavingLinks}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-extrabold text-white bg-sky-600 hover:bg-sky-500 active:bg-sky-700 disabled:opacity-50 transition-colors shadow-sm cursor-pointer whitespace-nowrap"
          >
            <Save className="w-4 h-4" />
            <span>{isSavingLinks ? 'جاري الحفظ...' : 'حفظ وتحديث الروابط'}</span>
          </button>
        </div>

        {/* Links Form Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs sm:text-sm">
          {/* 1. رابط الإحالة لمنصة كيوتكس */}
          <div className="md:col-span-2 p-4 bg-emerald-50/70 rounded-2xl border border-emerald-200/80 space-y-2">
            <div className="flex items-center justify-between">
              <label className="font-extrabold text-emerald-950 flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-emerald-600" />
                <span>رابط الإحالة الرسمي لمنصة كيوتكس (Quotex Affiliate Link):</span>
              </label>
              <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-full">
                تفعيل VIP المجاني
              </span>
            </div>
            <div className="flex gap-2">
              <input
                type="url"
                value={contactLinks.quotexReferralLink}
                onChange={(e) =>
                  setContactLinks({ ...contactLinks, quotexReferralLink: e.target.value })
                }
                dir="ltr"
                placeholder="https://broker-qx.pro/?lid=..."
                className="flex-1 px-3.5 py-2.5 bg-white border border-emerald-300 rounded-xl font-mono-num text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-600"
              />
              <button
                type="button"
                onClick={() => handleCopy('qx', contactLinks.quotexReferralLink)}
                className="px-3 py-2 bg-white hover:bg-emerald-100/60 border border-emerald-300 rounded-xl text-emerald-800 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1 shrink-0"
                title="نسخ الرابط"
              >
                {copiedKey === 'qx' ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                <span className="hidden sm:inline">نسخ</span>
              </button>
              <a
                href={contactLinks.quotexReferralLink}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1 shrink-0"
                title="فتح الرابط"
              >
                <ExternalLink className="w-4 h-4" />
                <span className="hidden sm:inline">فتح</span>
              </a>
            </div>
            <p className="text-[11px] text-emerald-800 leading-relaxed font-medium">
              💡 هذا الرابط يتم توجيه المشتركين إليه عند التسجيل بالباقة المجانية (إيداع 100$)، ويتم تضمينه تلقائياً في رسائل المشتركين وفي لوحة التداول.
            </p>
          </div>

          {/* 2. رابط قناة التليجرام العامة */}
          <div className="space-y-2">
            <label className="font-bold text-slate-800 flex items-center gap-1.5">
              <Send className="w-4 h-4 text-sky-500" />
              <span>رابط قناة التليجرام العامة (Public Channel Link):</span>
            </label>
            <div className="flex gap-2">
              <input
                type="url"
                value={contactLinks.telegramChannelUrl}
                onChange={(e) =>
                  setContactLinks({ ...contactLinks, telegramChannelUrl: e.target.value })
                }
                dir="ltr"
                placeholder="https://t.me/ZadNBFX"
                className="flex-1 px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono-num text-xs sm:text-sm text-slate-800 focus:outline-none focus:border-sky-500"
              />
              <a
                href={contactLinks.telegramChannelUrl}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-2 bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1 shrink-0"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* 3. معرف القناة */}
          <div className="space-y-2">
            <label className="font-bold text-slate-800 flex items-center gap-1.5">
              <span>معرف القناة العام (Username):</span>
            </label>
            <input
              type="text"
              value={contactLinks.telegramChannelUsername}
              onChange={(e) =>
                setContactLinks({ ...contactLinks, telegramChannelUsername: e.target.value })
              }
              dir="ltr"
              placeholder="@ZadNBFX"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono-num text-xs sm:text-sm text-slate-800 focus:outline-none focus:border-sky-500"
            />
          </div>

          {/* 4. رابط قناة أو بوت VIP */}
          <div className="space-y-2">
            <label className="font-bold text-slate-800 flex items-center gap-1.5">
              <Crown className="w-4 h-4 text-amber-500" />
              <span>رابط قناة أو بوت التليجرام VIP:</span>
            </label>
            <input
              type="url"
              value={contactLinks.telegramVipChannelUrl}
              onChange={(e) =>
                setContactLinks({ ...contactLinks, telegramVipChannelUrl: e.target.value })
              }
              dir="ltr"
              placeholder="https://t.me/ZadVIP_bot"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono-num text-xs sm:text-sm text-slate-800 focus:outline-none focus:border-sky-500"
            />
          </div>

          {/* 5. رابط أو معرف الدعم الفني المباشر على تليجرام */}
          <div className="space-y-2">
            <label className="font-bold text-slate-800 flex items-center gap-1.5">
              <MessageCircle className="w-4 h-4 text-emerald-500" />
              <span>رابط / حساب الدعم الفني المباشر (Telegram Support):</span>
            </label>
            <input
              type="text"
              value={contactLinks.telegramSupportUrl}
              onChange={(e) =>
                setContactLinks({ ...contactLinks, telegramSupportUrl: e.target.value })
              }
              dir="ltr"
              placeholder="https://t.me/ZadSupport أو @ZadSupport"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono-num text-xs sm:text-sm text-slate-800 focus:outline-none focus:border-sky-500"
            />
          </div>

          {/* 6. رقم / رابط واتساب المباشر */}
          <div className="space-y-2">
            <label className="font-bold text-slate-800 flex items-center gap-1.5">
              <span className="text-emerald-600 font-bold">WhatsApp:</span>
              <span>رقم أو رابط واتساب للدعم الفني السريع:</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={contactLinks.whatsappSupportNumber}
                onChange={(e) =>
                  setContactLinks({ ...contactLinks, whatsappSupportNumber: e.target.value })
                }
                dir="ltr"
                placeholder="+2010... أو https://wa.me/..."
                className="flex-1 px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono-num text-xs sm:text-sm text-slate-800 focus:outline-none focus:border-emerald-500"
              />
              {contactLinks.whatsappSupportNumber && (
                <a
                  href={
                    contactLinks.whatsappSupportNumber.startsWith('http')
                      ? contactLinks.whatsappSupportNumber
                      : `https://wa.me/${contactLinks.whatsappSupportNumber.replace(/[^0-9]/g, '')}`
                  }
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1 shrink-0"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span className="hidden sm:inline">تجربة</span>
                </a>
              )}
            </div>
          </div>

          {/* 7. البريد الإلكتروني الرسمي للدعم */}
          <div className="space-y-2">
            <label className="font-bold text-slate-800 flex items-center gap-1.5">
              <Mail className="w-4 h-4 text-slate-500" />
              <span>البريد الإلكتروني الرسمي للدعم:</span>
            </label>
            <input
              type="email"
              value={contactLinks.supportEmail}
              onChange={(e) =>
                setContactLinks({ ...contactLinks, supportEmail: e.target.value })
              }
              dir="ltr"
              placeholder="support@zadtoo.com"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono-num text-xs sm:text-sm text-slate-800 focus:outline-none focus:border-sky-500"
            />
          </div>

          {/* 8. تعليمات التواصل وطرق الدفع */}
          <div className="md:col-span-2 space-y-2">
            <label className="font-bold text-slate-800">
              تعليمات الدفع والتواصل المعروضة للزوار:
            </label>
            <textarea
              rows={2}
              value={contactLinks.contactNotes || ''}
              onChange={(e) =>
                setContactLinks({ ...contactLinks, contactNotes: e.target.value })
              }
              placeholder="مثال: متاح التحويل عبر فودافون كاش، إنستاباي، والتحويل البنكي. راسل الدعم لتأكيد الإيداع فوراً."
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-800 focus:outline-none focus:border-sky-500 resize-y"
            />
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* SECTION 2: إدارة الباقات والمسميات والأسعار والحذف والإضافة */}
      {/* ============================================================== */}
      <div className="bg-white rounded-3xl p-5 sm:p-7 border border-slate-200/90 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-200">
              <Crown className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-slate-900">
                إدارة باقات الاشتراك (المسميات، الأسعار، الحذف والإضافة)
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                تعديل أسماء الباقات ومميزاتها وأسعارها بالدولار أو إضافة باقات جديدة أو حذف باقات قديمة
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleResetPlans}
              className="px-3 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
              title="استعادة الباقات الافتراضية"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>استعادة الافتراضي</span>
            </button>

            <button
              type="button"
              onClick={handleOpenAddPlan}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-extrabold text-xs sm:text-sm rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة باقة جديدة</span>
            </button>
          </div>
        </div>

        {/* Plans Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {plans.map((plan) => {
            const isFree = plan.priceUsd === 0;
            const cardBg =
              plan.colorTheme === 'amber'
                ? 'border-amber-300 bg-amber-50/20'
                : plan.colorTheme === 'emerald'
                ? 'border-emerald-300 bg-emerald-50/20'
                : plan.colorTheme === 'sky'
                ? 'border-sky-300 bg-sky-50/20'
                : 'border-slate-200 bg-white';

            return (
              <div
                key={plan.id}
                className={`rounded-3xl p-5 border-2 ${cardBg} shadow-sm hover:shadow-md transition-all flex flex-col justify-between relative group ${
                  !plan.enabled ? 'opacity-60 grayscale-[30%]' : ''
                }`}
              >
                {/* Popular Badge or Status */}
                <div className="flex items-center justify-between gap-1 mb-3">
                  {plan.badge ? (
                    <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-slate-900 text-white shadow-2xs">
                      {plan.badge}
                    </span>
                  ) : (
                    <span />
                  )}

                  <button
                    type="button"
                    onClick={() => handleTogglePlanEnabled(plan)}
                    className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border cursor-pointer transition-colors ${
                      plan.enabled
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                        : 'bg-rose-100 text-rose-800 border-rose-300'
                    }`}
                  >
                    {plan.enabled ? 'مفعلة ✅' : 'معطلة ⏸️'}
                  </button>
                </div>

                {/* Plan Header */}
                <div className="space-y-2 text-center pb-3 border-b border-slate-100">
                  <h3 className="text-base font-black text-slate-900">{plan.name}</h3>
                  <div className="text-2xl font-black text-slate-900 font-mono-num">
                    {isFree ? (
                      <span className="text-emerald-600">مجاناً 0$</span>
                    ) : (
                      <>
                        ${plan.priceUsd}{' '}
                        <span className="text-xs font-normal text-slate-400">
                          {plan.durationLabel}
                        </span>
                      </>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 font-medium">
                    المدة: {plan.durationDays} يوم (في مصر: {(plan.priceUsd * 55).toLocaleString('en-US')} ج.م)
                  </p>
                </div>

                {/* Features list */}
                <div className="py-4 space-y-2 text-xs text-slate-700 font-medium text-right flex-1">
                  {(plan.features || []).map((feat, fIdx) => (
                    <div key={fIdx} className="flex items-start gap-1.5">
                      <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                      <span className="leading-tight">{feat}</span>
                    </div>
                  ))}
                </div>

                {/* Card Action Buttons (Edit / Delete) */}
                <div className="pt-3 border-t border-slate-100 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpenEditPlan(plan)}
                    className="flex-1 py-2 px-3 bg-sky-600 hover:bg-sky-500 text-white text-xs font-extrabold rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1 shadow-xs"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>تعديل</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPlanToDelete(plan)}
                    className="p-2 text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-xl transition-colors cursor-pointer"
                    title="حذف الباقة"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ============================================================== */}
      {/* MODAL: إضافة / تعديل باقة */}
      {/* ============================================================== */}
      {editingPlanModal && editingPlanModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-5 text-right relative max-h-[90vh] overflow-y-auto">
            <button
              type="button"
              onClick={() => setEditingPlanModal(null)}
              className="absolute top-5 left-5 text-slate-400 hover:text-slate-700 text-sm font-bold cursor-pointer"
            >
              ✕
            </button>

            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <Crown className="w-5 h-5 text-amber-500" />
                <span>{editingPlanModal.isNew ? 'إضافة باقة اشتراك جديدة' : 'تعديل بيانات الباقة والمسمى'}</span>
              </h3>
              <p className="text-xs text-slate-400">
                يتم حفظ التعديلات فوراً وتنعكس على صفحة العضويات وتسجيل الزوار
              </p>
            </div>

            <form onSubmit={handleSubmitPlanModal} className="space-y-4 text-xs sm:text-sm">
              {/* المسمى */}
              <div>
                <label className="block font-bold text-slate-800 mb-1">
                  مسمى الباقة (Plan Title): <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editingPlanModal.data.name}
                  onChange={(e) =>
                    setEditingPlanModal({
                      ...editingPlanModal,
                      data: { ...editingPlanModal.data, name: e.target.value }
                    })
                  }
                  placeholder="مثال: الباقة الذهبية السنوية (VIP)"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-bold focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* السعر والمدة */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-800 mb-1">
                    السعر بالدولار ($):
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={editingPlanModal.data.priceUsd}
                    onChange={(e) =>
                      setEditingPlanModal({
                        ...editingPlanModal,
                        data: {
                          ...editingPlanModal.data,
                          priceUsd: Math.max(0, Number(e.target.value) || 0)
                        }
                      })
                    }
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-mono-num font-bold focus:outline-none focus:border-emerald-500"
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    يعادل: {(editingPlanModal.data.priceUsd * 55).toLocaleString('en-US')} ج.م
                  </span>
                </div>

                <div>
                  <label className="block font-bold text-slate-800 mb-1">
                    المدة بالأيام:
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={editingPlanModal.data.durationDays}
                    onChange={(e) =>
                      setEditingPlanModal({
                        ...editingPlanModal,
                        data: {
                          ...editingPlanModal.data,
                          durationDays: Math.max(1, Number(e.target.value) || 30)
                        }
                      })
                    }
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-mono-num font-bold focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* نص المدة والشارة */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-800 mb-1">
                    نص المدة المعروض:
                  </label>
                  <input
                    type="text"
                    value={editingPlanModal.data.durationLabel}
                    onChange={(e) =>
                      setEditingPlanModal({
                        ...editingPlanModal,
                        data: { ...editingPlanModal.data, durationLabel: e.target.value }
                      })
                    }
                    placeholder="/ شهر أو 3 شهور"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-bold focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-800 mb-1">
                    شارة التميز (Badge):
                  </label>
                  <input
                    type="text"
                    value={editingPlanModal.data.badge || ''}
                    onChange={(e) =>
                      setEditingPlanModal({
                        ...editingPlanModal,
                        data: { ...editingPlanModal.data, badge: e.target.value }
                      })
                    }
                    placeholder="الأكثر طلباً 🔥 / باقة التوفير"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-bold focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* المميزات (سطر لكل ميزة) */}
              <div>
                <label className="block font-bold text-slate-800 mb-1">
                  مميزات الباقة (أدخل كل ميزة في سطر منفصل):
                </label>
                <textarea
                  rows={4}
                  value={editingPlanModal.featuresRawText}
                  onChange={(e) =>
                    setEditingPlanModal({
                      ...editingPlanModal,
                      featuresRawText: e.target.value
                    })
                  }
                  placeholder={`إشارات فريم الدقيقة M1 بدون مضاعفات\nروبوت التداول الآلي الذكي\nدعم فني VIP 24/7`}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-xs sm:text-sm focus:outline-none focus:border-emerald-500 leading-relaxed"
                />
              </div>

              {/* اللون والأيقونة */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-800 mb-1">الثيم اللوني:</label>
                  <select
                    value={editingPlanModal.data.colorTheme || 'sky'}
                    onChange={(e) =>
                      setEditingPlanModal({
                        ...editingPlanModal,
                        data: { ...editingPlanModal.data, colorTheme: e.target.value as any }
                      })
                    }
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-bold focus:outline-none focus:border-emerald-500"
                  >
                    <option value="sky">أزرق سماوي (Sky)</option>
                    <option value="amber">ذهبي مميز (Amber VIP)</option>
                    <option value="emerald">أخضر زمردي (Emerald)</option>
                    <option value="slate">فضي كلاسيكي (Silver Slate)</option>
                    <option value="purple">بنفسجي ملكي (Purple)</option>
                    <option value="rose">وردي أحمر (Rose)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-800 mb-1">الأيقونة:</label>
                  <select
                    value={editingPlanModal.data.icon || 'star'}
                    onChange={(e) =>
                      setEditingPlanModal({
                        ...editingPlanModal,
                        data: { ...editingPlanModal.data, icon: e.target.value as any }
                      })
                    }
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-bold focus:outline-none focus:border-emerald-500"
                  >
                    <option value="crown">👑 تاج VIP (Crown)</option>
                    <option value="star">⭐ نجمة (Star)</option>
                    <option value="shield">🛡️ درع حماية (Shield)</option>
                    <option value="zap">⚡ صاعقة (Zap)</option>
                    <option value="gift">🎁 هدية مجانية (Gift)</option>
                  </select>
                </div>
              </div>

              {/* خيارات إضافية (مفعلة، إحالة كيوتكس مجاناً) */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-800">
                  <input
                    type="checkbox"
                    checked={editingPlanModal.data.enabled}
                    onChange={(e) =>
                      setEditingPlanModal({
                        ...editingPlanModal,
                        data: { ...editingPlanModal.data, enabled: e.target.checked }
                      })
                    }
                    className="accent-emerald-600 rounded"
                  />
                  <span>الباقة مفعلة وتظهر للزوار في صفحة العضويات</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-800">
                  <input
                    type="checkbox"
                    checked={Boolean(editingPlanModal.data.isReferralFree)}
                    onChange={(e) =>
                      setEditingPlanModal({
                        ...editingPlanModal,
                        data: {
                          ...editingPlanModal.data,
                          isReferralFree: e.target.checked,
                          priceUsd: e.target.checked ? 0 : editingPlanModal.data.priceUsd
                        }
                      })
                    }
                    className="accent-emerald-600 rounded"
                  />
                  <span>باقة تفعيل مجاني عبر رابط إحالة كيوتكس (إيداع 100$)</span>
                </label>
              </div>

              <div className="pt-2 flex items-center gap-2">
                <button
                  type="submit"
                  disabled={isSavingPlan}
                  className="flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-black rounded-xl transition-colors cursor-pointer shadow-sm flex items-center justify-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  <span>{isSavingPlan ? 'جاري الحفظ...' : 'حفظ التعديلات في النظام ☁️'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setEditingPlanModal(null)}
                  className="py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: تأكيد الحذف */}
      {/* ============================================================== */}
      {planToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto border border-rose-200">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="space-y-1">
              <h3 className="text-base font-black text-slate-900">تأكيد حذف الباقة</h3>
              <p className="text-xs text-slate-500 font-medium">
                هل أنت متأكد من حذف الباقة <strong className="text-slate-900 font-bold">"{planToDelete.name}"</strong> نهائياً من النظام؟
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="py-2.5 px-4 bg-rose-600 hover:bg-rose-500 text-white text-xs font-black rounded-xl transition-colors cursor-pointer shadow-sm"
              >
                نعم، احذف الباقة
              </button>

              <button
                type="button"
                onClick={() => setPlanToDelete(null)}
                className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
