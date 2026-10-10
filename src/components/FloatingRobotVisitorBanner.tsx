import React, { useState } from 'react';
import {
  Bot,
  Crown,
  CheckCircle2,
  Sparkles,
  Zap,
  ShieldCheck,
  Send,
  ExternalLink,
  Laptop,
  Check,
  Copy,
  Clock,
  ArrowRight
} from 'lucide-react';

interface FloatingRobotVisitorBannerProps {
  onOpenRegisterModal: () => void;
  quotexReferralLink?: string;
  telegramVipChannelName?: string;
}

export default function FloatingRobotVisitorBanner({
  onOpenRegisterModal,
  quotexReferralLink = 'https://broker-qx.pro/?lid=2303934',
  telegramVipChannelName = '@ZadNBFX'
}: FloatingRobotVisitorBannerProps) {
  const [activeTab, setActiveTab] = useState<'AUTO' | 'MANUAL'>('AUTO');
  const [stake, setStake] = useState<number>(5);
  const [copiedLink, setCopiedLink] = useState(false);

  const handleCopy = (text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#07131B] via-[#0A1624] to-[#0A0F1A] border-2 border-emerald-500/50 shadow-[0_20px_50px_rgba(16,185,129,0.15)] p-5 sm:p-8">
      {/* Decorative ambient background glows */}
      <div className="absolute -top-24 -right-24 w-72 h-72 bg-emerald-500/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -left-24 w-72 h-72 bg-amber-500/15 rounded-full blur-3xl pointer-events-none" />

      {/* Header Tag / Badge */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-6 border-b border-slate-800/80">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-extrabold">
          <Bot className="w-4 h-4 text-emerald-400 animate-pulse" />
          <span>هدية وميزة حصرية لكل مشترك جديد</span>
          <span className="text-slate-500">|</span>
          <span className="text-amber-300">الروبوت العائم الذكي + قناة VIP</span>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="px-2.5 py-1 rounded-md bg-amber-400/20 text-amber-300 font-bold border border-amber-400/30 flex items-center gap-1.5">
            <Crown className="w-3.5 h-3.5" />
            <span>اشتراك VIP 24/7 متواصل</span>
          </span>
          <span className="px-2.5 py-1 rounded-md bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
            0 مضاعفات نهائياً
          </span>
        </div>
      </div>

      {/* Main Grid: Content on Right, High-Fidelity Robot Card Mockup on Left */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center pt-6">
        {/* Right 7 Columns: Clarification & Benefits for Visitor */}
        <div className="lg:col-span-7 space-y-5">
          <div className="space-y-2">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white tracking-tight leading-snug">
              احصل مجاناً على <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-300 to-amber-300">الروبوت العائم التلقائي</span> واشتراك فوري في <span className="text-amber-400">قناة VIP</span> على تليجرام!
            </h2>
            <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
              بمجرد انضمامك واشتراكك في عضويتنا، ستحصل مباشرة على نسختك الخاصة من الروبوت العائم الذكي الذي يعمل مباشرة على متصفحك فوق شاشة المنصة، بالإضافة إلى وصول كامل لقناة التليجرام الـ VIP لتلقي الصفقات الدقيقة لحظة بلحظة.
            </p>
          </div>

          {/* Core Highlights List */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
            <div className="p-3.5 rounded-xl bg-slate-900/80 border border-emerald-500/30 space-y-1">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs sm:text-sm">
                <Bot className="w-4 h-4 shrink-0" />
                <span>1. روبوت عائم (Floating Widget)</span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-300 leading-relaxed">
                يعمل كشاشة عائمة مدمجة على متصفحك فوق منصة التداول؛ يختار الزوج ويحدد مدة الدقيقة ويفتح الصفقة فوراً.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900/80 border border-amber-500/30 space-y-1">
              <div className="flex items-center gap-2 text-amber-400 font-bold text-xs sm:text-sm">
                <Send className="w-4 h-4 shrink-0" />
                <span>2. اشتراك كامل في قناة VIP تليجرام</span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-300 leading-relaxed">
                إشارات مستمرة على مدار 24 ساعة لجميع الجلسات العالمية مع تفاصيل التحليل وأوقات الدخول بالثانية.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900/80 border border-emerald-500/30 space-y-1">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs sm:text-sm">
                <Zap className="w-4 h-4 shrink-0" />
                <span>3. خيار التداول الآلي أو اليدوي</span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-300 leading-relaxed">
                تحكم كامل بزر واحد؛ اختر التنفيذ الآلي بنقرة زر أو التنبيه الصوتي مع التنفيذ اليدوي حسب رغبتك.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900/80 border border-sky-500/30 space-y-1">
              <div className="flex items-center gap-2 text-sky-400 font-bold text-xs sm:text-sm">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>4. بدون مضاعفات وإحصاء فوري</span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-300 leading-relaxed">
                حماية كاملة لرأس المال (0 مضاعفات) مع عدّاد فوري للصفقات الرابحة والخاسرة ونسبة النجاح المباشرة.
              </p>
            </div>
          </div>

          {/* Special Quotex Activation Notice & Actions */}
          <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-950/40 via-slate-900/90 to-amber-950/30 border border-emerald-400/50 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="text-xs sm:text-sm font-extrabold text-white flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-300" />
                <span>متاح لجميع المنصات + تفعيل مجاني لعملاء كيوتكس (Quotex)</span>
              </div>
              <p className="text-xs text-slate-300">
                سجل حسابك برقم الـ Broker ID الخاص بك وستحصل على مفتاح API الخاص بك لتشغيل الروبوت فوراً.
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={onOpenRegisterModal}
                className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-400 to-amber-300 hover:from-amber-300 hover:to-amber-200 text-slate-950 font-extrabold text-xs sm:text-sm shadow-lg shadow-amber-400/20 transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <span>اشترك الآن واستلم الروبوت</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Left 5 Columns: The Exact Floating Robot Visual UI Mockup (matches 20.PNG) */}
        <div className="lg:col-span-5 flex flex-col items-center">
          <div className="w-full max-w-[320px] bg-[#071018] rounded-2xl border-2 border-emerald-400/90 p-4 shadow-[0_15px_45px_rgba(16,185,129,0.3)] space-y-3 relative group">
            {/* Top Glow & Header */}
            <div className="flex items-center justify-between pb-1">
              <div className="flex items-center gap-2">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
                </span>
                <span className="text-xs sm:text-sm font-extrabold text-white">
                  روبوت نَبض كيوتكس
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="px-2 py-0.5 text-[10px] font-extrabold rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  0 مضاعفات
                </span>
                <button
                  type="button"
                  className="px-1.5 py-0.5 text-[10px] font-bold bg-slate-800 text-slate-300 rounded border border-slate-700"
                >
                  تصغير −
                </button>
              </div>
            </div>

            {/* Subscriber Info Card */}
            <div className="p-2.5 rounded-xl bg-[#0c1624] border border-slate-800 text-xs space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-[11px]">العضو المشترك:</span>
                <span className="font-extrabold text-amber-300 text-[11px]">
                  حساب المشرف التجريبي (aster...
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-[11px]">صلاحية المفتاح:</span>
                <span className="font-extrabold text-emerald-400 text-[11px]">
                  نشط (26746 يوم)
                </span>
              </div>
            </div>

            {/* Mode Switch (Auto / Manual) Interactive Toggle */}
            <div className="grid grid-cols-2 p-1 rounded-xl bg-slate-900 border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setActiveTab('AUTO')}
                className={`py-1.5 rounded-lg font-extrabold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                  activeTab === 'AUTO'
                    ? 'bg-emerald-400 text-slate-950 shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <span>🤖 تداول آلي</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('MANUAL')}
                className={`py-1.5 rounded-lg font-extrabold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                  activeTab === 'MANUAL'
                    ? 'bg-amber-400 text-slate-950 shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <span>✋ تداول يدوي</span>
              </button>
            </div>

            {/* Current Signal Feed Box */}
            <div className="p-3 rounded-xl bg-[#09121d] border border-slate-800/90 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-sky-400 flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-sky-400 animate-ping inline-block" />
                  <span>((•)) إشارة الـ API الحالية:</span>
                </span>
                <span className="px-2.5 py-0.5 rounded bg-slate-800 text-amber-300 border border-slate-700 text-[11px] font-extrabold font-mono tracking-wider">
                  بانتظار إشارة
                </span>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                الروبوت متصل بالـ API ومستعد لاختيار الزوج وفتح الصفقة فور صدورها.
              </p>
            </div>

            {/* Wins, Losses, and WinRate 3-Column Boxes */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 rounded-xl bg-emerald-950/40 border border-emerald-500/40">
                <div className="text-[10px] font-extrabold text-emerald-300">✅ الرابحة</div>
                <div className="text-lg font-extrabold text-white font-mono mt-0.5">0</div>
              </div>

              <div className="p-2 rounded-xl bg-rose-950/40 border border-rose-500/40">
                <div className="text-[10px] font-extrabold text-rose-300">❌ الخاسرة</div>
                <div className="text-lg font-extrabold text-white font-mono mt-0.5">0</div>
              </div>

              <div className="p-2 rounded-xl bg-amber-950/40 border border-amber-500/40">
                <div className="text-[10px] font-extrabold text-amber-300">🎯 النسبة</div>
                <div className="text-lg font-extrabold text-amber-300 font-mono mt-0.5">100%</div>
              </div>
            </div>

            {/* Stake selector & Alert button */}
            <div className="flex items-center justify-between gap-1 p-2 rounded-xl bg-slate-900/90 border border-slate-800 text-xs">
              <span className="text-[11px] text-slate-400 font-bold">المبلغ ($):</span>
              <div className="flex items-center gap-1">
                {[1, 5, 10, 20].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setStake(amt)}
                    className={`px-2 py-0.5 rounded font-extrabold font-mono text-[11px] transition-all cursor-pointer ${
                      stake === amt
                        ? 'bg-emerald-400 text-slate-950'
                        : 'bg-slate-800 text-slate-300 hover:text-white'
                    }`}
                  >
                    ${amt}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="px-2 py-0.5 rounded bg-sky-600 text-white font-bold text-[10px] flex items-center gap-1"
              >
                <span>🔔 تنبيه</span>
              </button>
            </div>

            {/* Floating watermark */}
            <div className="text-center pt-0.5">
              <span className="text-[10px] text-slate-400 font-mono">
                صورة حية من واجهة الروبوت العائم الفعلية
              </span>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2 text-xs text-emerald-400 font-medium">
            <Laptop className="w-3.5 h-3.5" />
            <span>يعمل على متصفح Chrome و Edge وفايرفوكس بدون برامج خارجية</span>
          </div>
        </div>
      </div>
    </section>
  );
}
