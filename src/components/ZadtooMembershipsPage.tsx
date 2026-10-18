import React, { useState } from 'react';
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
  Building,
  Coins,
  Copy,
  ExternalLink
} from 'lucide-react';

interface ZadtooMembershipsPageProps {
  onSelectPlan: (planId: string, planName: string, price: number) => void;
  telegramLink?: string;
}

export const ZadtooMembershipsPage: React.FC<ZadtooMembershipsPageProps> = ({
  onSelectPlan,
  telegramLink = 'https://t.me/ZadNBFX'
}) => {
  const [selectedPlanModal, setSelectedPlanModal] = useState<{
    id: string;
    name: string;
    price: number;
    badge: string;
  } | null>(null);

  const [subscriberName, setSubscriberName] = useState('');
  const [subscriberEmail, setSubscriberEmail] = useState('');
  const [subscriberPhone, setSubscriberPhone] = useState('');
  const [quotexId, setQuotexId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'wallets' | 'bank' | 'usdt' | 'free_referral'>('wallets');
  const [userCountry, setUserCountry] = useState('مصر 🇪🇬');
  const [submittedSuccess, setSubmittedSuccess] = useState(false);
  const [copiedText, setCopiedText] = useState(false);

  const handleOpenSubscribe = (id: string, name: string, price: number, badge: string) => {
    setSelectedPlanModal({ id, name, price, badge });
    setSubmittedSuccess(false);
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

  return (
    <div className="min-h-screen bg-[#F8FAFC] py-12 sm:py-16 text-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
        {/* Header Title & Subtitle matching Screen 4 */}
        <div className="text-center space-y-2 max-w-2xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
            اختر باقتك المناسبة
          </h2>
          <p className="text-sm sm:text-base text-slate-500 font-medium">
            باقات اشتراك مرنة تناسب جميع مستويات المتداولين
          </p>
        </div>

        {/* 4 Pricing Cards Side-by-Side (matching Screen 4) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch">
          {/* 1. الباقة التجريبية (مجانية) - Green */}
          <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200/90 shadow-sm hover:shadow-md transition-all flex flex-col justify-between text-center relative group">
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto border border-emerald-100">
                <Gift className="w-6 h-6 text-emerald-600" />
              </div>

              <div>
                <h3 className="text-lg font-black text-slate-900">الباقة التجريبية</h3>
                <div className="text-2xl font-black text-emerald-600 mt-2">
                  مجانية
                </div>
              </div>

              <div className="border-t border-slate-100 pt-4 space-y-2.5 text-xs text-slate-600 font-medium text-right pr-2">
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>إشارات محدودة</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>مميزات أساسية</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>لمدة 7 أيام</span>
                </div>
              </div>
            </div>

            <div className="pt-6">
              <button
                type="button"
                onClick={() => handleOpenSubscribe('free_trial', 'الباقة التجريبية', 0, 'مجانية')}
                className="w-full py-2.5 px-4 rounded-xl text-sm font-extrabold text-emerald-700 bg-white hover:bg-emerald-50 border-2 border-emerald-500 transition-colors cursor-pointer"
              >
                ابدأ الآن
              </button>
            </div>
          </div>

          {/* 2. الباقة الأساسية ($19 / شهر) - Blue */}
          <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200/90 shadow-sm hover:shadow-md transition-all flex flex-col justify-between text-center relative group">
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center mx-auto border border-sky-100">
                <Star className="w-6 h-6 text-sky-600 fill-sky-600" />
              </div>

              <div>
                <h3 className="text-lg font-black text-slate-900">الباقة الأساسية</h3>
                <div className="text-2xl font-black text-slate-900 mt-2 font-mono-num">
                  $19 <span className="text-xs text-slate-400 font-normal">/ شهر</span>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-4 space-y-2.5 text-xs text-slate-600 font-medium text-right pr-2">
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-sky-500 shrink-0" />
                  <span>إشارات يومية</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-sky-500 shrink-0" />
                  <span>قناة تليجرام</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-sky-500 shrink-0" />
                  <span>دعم عبر البريد</span>
                </div>
              </div>
            </div>

            <div className="pt-6">
              <button
                type="button"
                onClick={() => handleOpenSubscribe('basic_19', 'الباقة الأساسية', 19, '$19 / شهر')}
                className="w-full py-2.5 px-4 rounded-xl text-sm font-extrabold text-white bg-sky-600 hover:bg-sky-500 transition-colors cursor-pointer shadow-sm shadow-sky-600/20"
              >
                اشترك الآن
              </button>
            </div>
          </div>

          {/* 3. الباقة الفضية ($49 / شهر) - Slate Blue / Silver */}
          <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200/90 shadow-sm hover:shadow-md transition-all flex flex-col justify-between text-center relative group">
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-600 flex items-center justify-center mx-auto border border-slate-200">
                <Shield className="w-6 h-6 text-slate-700" />
              </div>

              <div>
                <h3 className="text-lg font-black text-slate-900">الباقة الفضية</h3>
                <div className="text-2xl font-black text-slate-900 mt-2 font-mono-num">
                  $49 <span className="text-xs text-slate-400 font-normal">/ شهر</span>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-4 space-y-2.5 text-xs text-slate-600 font-medium text-right pr-2">
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-slate-700 shrink-0" />
                  <span>إشارات فريم الدقيقة</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-slate-700 shrink-0" />
                  <span>دعم فني</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-slate-700 shrink-0" />
                  <span>جروب خاص</span>
                </div>
              </div>
            </div>

            <div className="pt-6">
              <button
                type="button"
                onClick={() => handleOpenSubscribe('silver_49', 'الباقة الفضية', 49, '$49 / شهر')}
                className="w-full py-2.5 px-4 rounded-xl text-sm font-extrabold text-white bg-slate-800 hover:bg-slate-700 transition-colors cursor-pointer shadow-sm"
              >
                اشترك الآن
              </button>
            </div>
          </div>

          {/* 4. الباقة الذهبية ($99 / شهر) - Gold Crown (VIP) */}
          <div className="bg-white rounded-3xl p-6 sm:p-7 border-2 border-amber-400/80 shadow-md hover:shadow-lg transition-all flex flex-col justify-between text-center relative group">
            {/* VIP Ribbon */}
            <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-amber-500 text-white text-[10px] font-black px-3 py-0.5 rounded-full shadow-xs">
              الأعلى تميزاً 👑
            </div>

            <div className="space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto border border-amber-200">
                <Crown className="w-6 h-6 text-amber-600" />
              </div>

              <div>
                <h3 className="text-lg font-black text-slate-900">الباقة الذهبية</h3>
                <div className="text-2xl font-black text-amber-600 mt-2 font-mono-num">
                  $99 <span className="text-xs text-slate-400 font-normal">/ شهر</span>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-4 space-y-2.5 text-xs text-slate-700 font-medium text-right pr-2">
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-amber-600 shrink-0" />
                  <strong className="text-slate-900">جميع الإشارات (فريم الدقيقة)</strong>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-amber-600 shrink-0" />
                  <strong className="text-amber-700">التداول الآلي (الروبوت العائم)</strong>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>دعم فني مميز على مدار الساعة</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>منصة متقدمة وإشعارات VIP</span>
                </div>
              </div>
            </div>

            <div className="pt-6">
              <button
                type="button"
                onClick={() => handleOpenSubscribe('gold_99', 'الباقة الذهبية', 99, '$99 / شهر')}
                className="w-full py-2.5 px-4 rounded-xl text-sm font-extrabold text-white bg-amber-500 hover:bg-amber-600 transition-colors cursor-pointer shadow-md shadow-amber-500/20"
              >
                اشترك الآن
              </button>
            </div>
          </div>
        </div>

        {/* Free Quotex Referral Alternative Note */}
        <div className="max-w-2xl mx-auto p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-center text-xs text-emerald-800 space-y-1">
          <strong className="font-bold">هل تفضل الاشتراك مجاناً 100%؟</strong>
          <p className="text-emerald-700">
            يمكنك الحصول على الباقة الذهبية مجاناً بالتسجيل عبر رابط إحالة كيوتكس وإيداع 100$ في حسابك الخاص بالتداول.
          </p>
        </div>
      </div>

      {/* Subscription Checkout Modal */}
      {selectedPlanModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 relative text-right">
            <button
              type="button"
              onClick={() => setSelectedPlanModal(null)}
              className="absolute top-4 left-4 text-slate-400 hover:text-slate-700 text-sm font-bold cursor-pointer"
            >
              ✕
            </button>

            <div className="border-b border-slate-100 pb-3">
              <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                تفعيل الاشتراك
              </span>
              <h3 className="text-lg font-black text-slate-900 mt-1">
                {selectedPlanModal.name} ({selectedPlanModal.badge})
              </h3>
            </div>

            {submittedSuccess ? (
              <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-emerald-500 text-white flex items-center justify-center mx-auto text-xl font-bold">
                  ✓
                </div>
                <h4 className="text-sm font-bold text-emerald-900">
                  تم استلام طلب اشتراكك بنجاح!
                </h4>
                <p className="text-xs text-emerald-700">
                  سيتم تفعيل مفتاح الروبوت وإرسال رابط القناة الخاصة بك عبر التليجرام والواتساب فوراً.
                </p>
                <a
                  href={telegramLink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white rounded-lg text-xs font-bold"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>تأكيد التفعيل عبر تليجرام</span>
                </a>
              </div>
            ) : (
              <form onSubmit={handleSubmitSubscription} className="space-y-3 text-xs">
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

                {/* Payment Method Selector */}
                <div className="space-y-1.5">
                  <label className="block text-slate-700 font-bold">طريقة الدفع:</label>
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
                      <span>محافظ إلكترونية</span>
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
                  <label className="block text-slate-700 font-bold mb-1">معرف منصة التداول (Quotex ID أو تليجرام):</label>
                  <input
                    type="text"
                    value={quotexId}
                    onChange={e => setQuotexId(e.target.value)}
                    dir="ltr"
                    placeholder="ID أو @username"
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
