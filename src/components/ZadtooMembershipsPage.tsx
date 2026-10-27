import React, { useState, useEffect } from 'react';
import {
  Gift,
  Star,
  Shield,
  Crown,
  Check,
  Zap,
  ArrowLeft,
  X,
  CreditCard,
  Send,
  Smartphone,
  Coins,
  Copy,
  ExternalLink,
  MessageCircle,
  HelpCircle
} from 'lucide-react';
import type { SubscriptionPlan, PlatformContactLinks } from '../types/platformConfig';
import { INITIAL_SUBSCRIPTION_PLANS, INITIAL_CONTACT_LINKS } from '../types/platformConfig';
import { loadCloudPlans, loadCloudContactLinks } from '../firebase';

interface ZadtooMembershipsPageProps {
  onSelectPlan: (planId: string, planName: string, price: number) => void;
  telegramLink?: string;
  plans?: SubscriptionPlan[];
  contactLinks?: PlatformContactLinks;
}

export const ZadtooMembershipsPage: React.FC<ZadtooMembershipsPageProps> = ({
  onSelectPlan,
  telegramLink = 'https://t.me/ZadNBFX',
  plans: propPlans,
  contactLinks: propContactLinks
}) => {
  const [plans, setPlans] = useState<SubscriptionPlan[]>(() => {
    if (propPlans && propPlans.length > 0) return propPlans;
    try {
      const cached = localStorage.getItem('zad_platform_plans');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (_e) {}
    return INITIAL_SUBSCRIPTION_PLANS;
  });

  const [contactLinks, setContactLinks] = useState<PlatformContactLinks>(() => {
    if (propContactLinks) return propContactLinks;
    try {
      const cached = localStorage.getItem('zad_platform_contact_links');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch (_e) {}
    return INITIAL_CONTACT_LINKS;
  });

  const [selectedPlanModal, setSelectedPlanModal] = useState<{
    id: string;
    name: string;
    price: number;
    badge: string;
    isReferralFree?: boolean;
  } | null>(null);

  const [subscriberName, setSubscriberName] = useState('');
  const [subscriberEmail, setSubscriberEmail] = useState('');
  const [subscriberPhone, setSubscriberPhone] = useState('');
  const [quotexId, setQuotexId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'wallets' | 'bank' | 'usdt' | 'free_referral'>('wallets');
  const [userCountry, setUserCountry] = useState('مصر 🇪🇬');
  const [submittedSuccess, setSubmittedSuccess] = useState(false);
  const [copiedText, setCopiedText] = useState(false);

  // Sync props or fetch from API / Cloud
  useEffect(() => {
    if (propPlans && propPlans.length > 0) {
      setPlans(propPlans);
    } else {
      fetch('/api/platform-config')
        .then(r => r.json())
        .then(data => {
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
          } else {
            fallbackLoadCloud();
          }
        })
        .catch(() => {
          fallbackLoadCloud();
        });
    }
  }, [propPlans]);

  const fallbackLoadCloud = async () => {
    try {
      const cloudPlans = await loadCloudPlans<SubscriptionPlan[]>();
      if (cloudPlans && Array.isArray(cloudPlans) && cloudPlans.length > 0) {
        setPlans(cloudPlans);
      }
      const cloudLinks = await loadCloudContactLinks<PlatformContactLinks>();
      if (cloudLinks && typeof cloudLinks === 'object') {
        setContactLinks(cloudLinks);
      }
    } catch (_e) {}
  };

  useEffect(() => {
    if (propContactLinks) setContactLinks(propContactLinks);
  }, [propContactLinks]);

  const activePlans = plans.filter(p => p.enabled !== false);

  const handleOpenSubscribe = (
    id: string,
    name: string,
    price: number,
    badge: string,
    isReferralFree?: boolean
  ) => {
    setSelectedPlanModal({ id, name, price, badge, isReferralFree });
    setSubmittedSuccess(false);
    if (isReferralFree) {
      setPaymentMethod('free_referral');
    } else {
      setPaymentMethod('wallets');
    }
  };

  const handleSubmitSubscription = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlanModal) return;
    onSelectPlan(selectedPlanModal.id, selectedPlanModal.name, selectedPlanModal.price);
    setSubmittedSuccess(true);
  };

  const handleCopyPaymentInfo = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  const priceInEgp = selectedPlanModal ? selectedPlanModal.price * 55 : 0;
  const activeTgLink = contactLinks.telegramChannelUrl || telegramLink;
  const activeSupportTg = contactLinks.telegramSupportUrl || activeTgLink;
  const activeQxLink = contactLinks.quotexReferralLink || 'https://broker-qx.pro/?lid=2303934';

  const renderIcon = (iconName?: string) => {
    switch (iconName) {
      case 'crown':
        return <Crown className="w-6 h-6 text-amber-600" />;
      case 'shield':
        return <Shield className="w-6 h-6 text-slate-700" />;
      case 'gift':
        return <Gift className="w-6 h-6 text-emerald-600" />;
      case 'zap':
        return <Zap className="w-6 h-6 text-emerald-600" />;
      case 'star':
      default:
        return <Star className="w-6 h-6 text-sky-600 fill-sky-600" />;
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] py-12 sm:py-16 text-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
        {/* Header Title & Subtitle */}
        <div className="text-center space-y-2 max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200 mb-2">
            <Crown className="w-3.5 h-3.5 text-emerald-600" />
            <span>باقات اشتراك معتمدة · فريم الدقيقة M1</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
            اختر باقتك المناسبة
          </h2>
          <p className="text-sm sm:text-base text-slate-500 font-medium">
            باقات اشتراك مرنة تناسب جميع مستويات المتداولين مع إمكانية التفعيل المجاني عبر منصة كيوتكس
          </p>
        </div>

        {/* Dynamic Pricing Cards Side-by-Side */}
        <div
          className={`grid grid-cols-1 sm:grid-cols-2 ${
            activePlans.length <= 3
              ? 'lg:grid-cols-3'
              : activePlans.length === 4
              ? 'lg:grid-cols-4'
              : 'lg:grid-cols-3 xl:grid-cols-5'
          } gap-6 items-stretch`}
        >
          {activePlans.map((plan) => {
            const isFree = plan.priceUsd === 0;
            const isPopular = Boolean(plan.isPopular);
            const isReferralFree = Boolean(plan.isReferralFree);

            // Styling based on colorTheme
            let borderClass = 'border-slate-200/90';
            let iconBgClass = 'bg-sky-50 text-sky-600 border-sky-100';
            let btnClass = 'text-white bg-sky-600 hover:bg-sky-500 shadow-sky-600/20';

            if (plan.colorTheme === 'amber' || isPopular) {
              borderClass = 'border-2 border-amber-400/90 shadow-md hover:shadow-lg';
              iconBgClass = 'bg-amber-50 text-amber-600 border-amber-200';
              btnClass = 'text-slate-950 bg-amber-400 hover:bg-amber-300 shadow-amber-400/30';
            } else if (plan.colorTheme === 'emerald' || isFree) {
              borderClass = isReferralFree
                ? 'border-2 border-emerald-400/90 shadow-md hover:shadow-lg'
                : 'border-slate-200/90';
              iconBgClass = 'bg-emerald-50 text-emerald-600 border-emerald-100';
              btnClass = isReferralFree
                ? 'text-white bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/20'
                : 'text-emerald-700 bg-white hover:bg-emerald-50 border-2 border-emerald-500';
            } else if (plan.colorTheme === 'slate') {
              borderClass = 'border-slate-200/90';
              iconBgClass = 'bg-slate-100 text-slate-700 border-slate-200';
              btnClass = 'text-white bg-slate-800 hover:bg-slate-700';
            }

            return (
              <div
                key={plan.id}
                className={`bg-white rounded-3xl p-6 sm:p-7 border ${borderClass} shadow-sm hover:shadow-md transition-all flex flex-col justify-between text-center relative group`}
              >
                {/* Badge on top */}
                {plan.badge && (
                  <div
                    className={`absolute -top-3 left-1/2 transform -translate-x-1/2 text-[10px] font-black px-3 py-0.5 rounded-full shadow-xs whitespace-nowrap ${
                      isPopular
                        ? 'bg-amber-500 text-white'
                        : isReferralFree
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-900 text-white'
                    }`}
                  >
                    {plan.badge}
                  </div>
                )}

                <div className="space-y-4">
                  {/* Icon */}
                  <div
                    className={`w-12 h-12 rounded-2xl flex items-center justify-center mx-auto border ${iconBgClass}`}
                  >
                    {renderIcon(plan.icon)}
                  </div>

                  {/* Title & Price */}
                  <div>
                    <h3 className="text-lg font-black text-slate-900">{plan.name}</h3>
                    <div className="text-2xl font-black text-slate-900 mt-2 font-mono-num">
                      {isFree ? (
                        <span className="text-emerald-600">مجانية 0$</span>
                      ) : (
                        <>
                          ${plan.priceUsd}{' '}
                          <span className="text-xs text-slate-400 font-normal">
                            {plan.durationLabel}
                          </span>
                        </>
                      )}
                    </div>
                    {!isFree && (
                      <span className="text-[11px] text-slate-400 block font-medium mt-0.5">
                        (في مصر: {(plan.priceUsd * 55).toLocaleString('en-US')} ج.م تقريباً)
                      </span>
                    )}
                  </div>

                  {/* Features List */}
                  <div className="border-t border-slate-100 pt-4 space-y-2.5 text-xs text-slate-700 font-medium text-right pr-1">
                    {(plan.features || []).map((feat, fIdx) => (
                      <div key={fIdx} className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                        <span className="leading-tight">{feat}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Card Button */}
                <div className="pt-6">
                  <button
                    type="button"
                    onClick={() =>
                      handleOpenSubscribe(
                        plan.id,
                        plan.name,
                        plan.priceUsd,
                        plan.badge || (isFree ? 'مجانية' : `$${plan.priceUsd}`),
                        isReferralFree
                      )
                    }
                    className={`w-full py-2.5 px-4 rounded-xl text-sm font-extrabold transition-colors cursor-pointer shadow-sm ${btnClass}`}
                  >
                    {isFree ? 'ابدأ الآن مجاناً' : 'اشترك الآن'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Free Quotex Referral Banner */}
        <div className="bg-gradient-to-r from-emerald-900 via-teal-900 to-slate-900 rounded-3xl p-6 sm:p-8 text-white flex flex-col md:flex-row items-center justify-between gap-6 shadow-xl border border-emerald-500/30">
          <div className="space-y-2 text-right">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-bold border border-emerald-400/30">
              <Zap className="w-3.5 h-3.5 text-emerald-400" />
              <span>فرصة ذهبية للمتداولين</span>
            </div>
            <h3 className="text-xl sm:text-2xl font-black">
              احصل على عضوية VIP وروبوت التداول مجاناً 100% 🎁
            </h3>
            <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
              سجل حسابك في منصة التداول كيوتكس (Quotex) عبر رابط الإحالة الرسمي المعتمد، وقم بإيداع 100 دولار أو أكثر في رصيدك للتداول بها، وسيتم منحك اشتراك VIP مجاناً مع كامل إشارات فريم الدقيقة وروبوت التداول الآلي!
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <a
              href={activeQxLink}
              target="_blank"
              rel="noreferrer"
              className="px-5 py-3 rounded-xl font-black text-xs sm:text-sm bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-colors shadow-lg cursor-pointer flex items-center gap-2"
            >
              <span>سجل في كيوتكس الآن</span>
              <ExternalLink className="w-4 h-4" />
            </a>

            <a
              href={activeSupportTg}
              target="_blank"
              rel="noreferrer"
              className="px-4 py-3 rounded-xl font-bold text-xs sm:text-sm bg-white/10 hover:bg-white/20 text-white transition-colors border border-white/20 cursor-pointer flex items-center gap-2"
            >
              <Send className="w-4 h-4 text-sky-400" />
              <span>راسل المشرف للتفعيل</span>
            </a>
          </div>
        </div>
      </div>

      {/* Subscription & Order Modal */}
      {selectedPlanModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-7 shadow-2xl border border-slate-200 space-y-5 text-right relative max-h-[90vh] overflow-y-auto">
            <button
              type="button"
              onClick={() => setSelectedPlanModal(null)}
              className="absolute top-5 left-5 text-slate-400 hover:text-slate-700 text-sm font-bold cursor-pointer"
            >
              ✕
            </button>

            <div className="border-b border-slate-100 pb-3">
              <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                {selectedPlanModal.badge}
              </span>
              <h3 className="text-xl font-black text-slate-900 mt-1">
                الاشتراك في: {selectedPlanModal.name}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                أدخل بياناتك وسيتم تفعيل حسابك مباشرة فور التحقق
              </p>
            </div>

            {submittedSuccess ? (
              <div className="text-center py-6 space-y-4">
                <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto text-2xl font-bold border border-emerald-200">
                  ✓
                </div>
                <div>
                  <h4 className="text-lg font-black text-slate-900">تم تسجيل طلبك بنجاح!</h4>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    تم استلام طلبك لتفعيل <strong className="text-slate-800 font-bold">{selectedPlanModal.name}</strong>. يرجى مراسلة الدعم على تليجرام لتأكيد حسابك واستلام رابط القناة وروبوت التداول.
                  </p>
                </div>

                <a
                  href={activeSupportTg}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full py-3 px-4 bg-sky-600 hover:bg-sky-500 text-white font-extrabold text-xs sm:text-sm rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-md"
                >
                  <Send className="w-4 h-4" />
                  <span>تأكيد التفعيل عبر تليجرام @ZadNBFX</span>
                </a>
              </div>
            ) : (
              <form onSubmit={handleSubmitSubscription} className="space-y-3.5 text-xs">
                {/* Pricing summary */}
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                  <span className="font-bold text-slate-600">المبلغ المطلوب:</span>
                  <div className="text-left font-mono-num">
                    <span className="text-base font-black text-slate-900">
                      ${selectedPlanModal.price}
                    </span>
                    {selectedPlanModal.price > 0 && (
                      <span className="text-[11px] text-emerald-600 block">
                        ({priceInEgp.toLocaleString()} جنيه مصري تقريباً)
                      </span>
                    )}
                  </div>
                </div>

                {/* If Quotex Free Referral plan */}
                {selectedPlanModal.isReferralFree ? (
                  <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 space-y-2">
                    <span className="text-xs font-bold text-emerald-950 block">
                      خطوات التفعيل المجاني عبر منصة كيوتكس:
                    </span>
                    <ol className="text-[11px] text-emerald-900 list-decimal list-inside space-y-1">
                      <li>سجل حساب جديد عبر رابط الإحالة.</li>
                      <li>أدخل رقم حسابك (ID) في الحقل أدناه.</li>
                      <li>قم بإيداع 100$ للتداول بها في رصيدك.</li>
                    </ol>
                    <a
                      href={activeQxLink}
                      target="_blank"
                      rel="noreferrer"
                      className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <span>فتح رابط التسجيل في كيوتكس</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                ) : (
                  /* Payment Method Selector */
                  <div className="space-y-1.5">
                    <label className="block text-slate-700 font-bold">طريقة الدفع المفضلة:</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setPaymentMethod('wallets')}
                        className={`p-2 rounded-lg border text-right transition-all cursor-pointer flex items-center gap-1.5 ${
                          paymentMethod === 'wallets'
                            ? 'border-emerald-500 bg-emerald-50/50 text-emerald-800 font-bold'
                            : 'border-slate-200 bg-white text-slate-600'
                        }`}
                      >
                        <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
                        <span>محافظ إلكترونية / إنستاباي</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setPaymentMethod('usdt')}
                        className={`p-2 rounded-lg border text-right transition-all cursor-pointer flex items-center gap-1.5 ${
                          paymentMethod === 'usdt'
                            ? 'border-emerald-500 bg-emerald-50/50 text-emerald-800 font-bold'
                            : 'border-slate-200 bg-white text-slate-600'
                        }`}
                      >
                        <Coins className="w-3.5 h-3.5 text-amber-600" />
                        <span>USDT (TRC20)</span>
                      </button>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-slate-700 font-bold mb-1">الاسم الكامل:</label>
                  <input
                    type="text"
                    required
                    value={subscriberName}
                    onChange={e => setSubscriberName(e.target.value)}
                    placeholder="مثال: أحمد محمد"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">البريد الإلكتروني:</label>
                    <input
                      type="email"
                      required
                      value={subscriberEmail}
                      onChange={e => setSubscriberEmail(e.target.value)}
                      dir="ltr"
                      placeholder="name@example.com"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-emerald-500 font-mono-num"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">رقم الواتساب / الموبايل:</label>
                    <input
                      type="tel"
                      required
                      value={subscriberPhone}
                      onChange={e => setSubscriberPhone(e.target.value)}
                      dir="ltr"
                      placeholder="+20 1xxxxxxxxx"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-emerald-500 font-mono-num"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    معرف منصة التداول (Quotex ID أو تليجرام):
                  </label>
                  <input
                    type="text"
                    value={quotexId}
                    onChange={e => setQuotexId(e.target.value)}
                    dir="ltr"
                    placeholder="رقم حسابك في المنصة ID أو @username"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-emerald-500 font-mono-num"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-extrabold rounded-xl transition-all cursor-pointer shadow-md shadow-emerald-600/20 mt-2"
                >
                  تأكيد الاشتراك وتفعيل الحساب
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
