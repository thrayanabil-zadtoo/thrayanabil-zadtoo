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
  onOpenRobotPage?: () => void;
  quotexReferralLink?: string;
  telegramVipChannelName?: string;
}

export default function FloatingRobotVisitorBanner({
  onOpenRegisterModal,
  onOpenRobotPage,
  quotexReferralLink = 'https://broker-qx.pro/?lid=2303934',
  telegramVipChannelName = '@ZadNBFX'
}: FloatingRobotVisitorBannerProps) {
  // بمجرد تثبيت البرنامج العائم يكون على وضع التداول اليدوي وليس الآلي افتراضياً
  const [activeTab, setActiveTab] = useState<'AUTO' | 'MANUAL'>('MANUAL');
  const [stake, setStake] = useState<number>(5);
  const [copiedLink, setCopiedLink] = useState(false);
  const [bannerWins, setBannerWins] = useState<number>(0);
  const [bannerLosses, setBannerLosses] = useState<number>(0);
  const bannerTotal = bannerWins + bannerLosses;
  const bannerRate = bannerTotal > 0 ? Math.round((bannerWins / bannerTotal) * 100) : 100;
  const [isClosed, setIsClosed] = useState(false);

  // Holy Quran audio player state (Sheikh Maher Al-Muaiqly)
  const [showQuran, setShowQuran] = useState(false);
  const [isQuranPlaying, setIsQuranPlaying] = useState(false);
  const quranAudioRef = React.useRef<HTMLAudioElement | null>(null);

  const toggleQuran = () => {
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
    if (!showQuran) {
      setShowQuran(true);
      quranAudioRef.current.play().then(() => setIsQuranPlaying(true)).catch(() => {});
    } else {
      if (isQuranPlaying) {
        quranAudioRef.current.pause();
      } else {
        quranAudioRef.current.play().catch(() => {});
      }
    }
  };

  const handleClose = () => {
    setBannerWins(0);
    setBannerLosses(0);
    if (quranAudioRef.current) {
      quranAudioRef.current.pause();
      quranAudioRef.current.currentTime = 0;
    }
    setIsQuranPlaying(false);
    setShowQuran(false);
    setIsClosed(true);
  };

  const [dotCount, setDotCount] = useState(1);
  React.useEffect(() => {
    const t = setInterval(() => setDotCount(p => (p % 7) + 1), 350);
    return () => clearInterval(t);
  }, []);
  const movingDots = '.'.repeat(dotCount);

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
                <span>4. عدّاد وإحصاء فوري للصفقات</span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-300 leading-relaxed">
                متابعة دقيقة للأداء مع عدّاد فوري للصفقات الرابحة والخاسرة ونسبة النجاح المباشرة بالثانية.
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

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {onOpenRobotPage && (
                <button
                  type="button"
                  onClick={onOpenRobotPage}
                  className="px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-extrabold text-xs sm:text-sm shadow-lg shadow-sky-500/20 transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <Bot className="w-4 h-4" />
                  <span>فتح شاشة الروبوت العائم الكاملة</span>
                </button>
              )}
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
            {isClosed ? (
              <div className="py-8 flex flex-col items-center justify-center text-center space-y-3">
                <span className="text-xs text-slate-400">تم إغلاق نافذة الروبوت وتصفير العداد</span>
                <button
                  type="button"
                  onClick={() => setIsClosed(false)}
                  className="px-4 py-1.5 bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-500/80 text-emerald-300 font-extrabold rounded-full text-xs cursor-pointer shadow flex items-center gap-1.5 transition-all"
                >
                  <Bot className="w-3.5 h-3.5 text-emerald-400" />
                  <span>🤖 إظهار نافذة الروبوت</span>
                </button>
              </div>
            ) : (
              <>
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
                    <button
                      type="button"
                      onClick={toggleQuran}
                      className={`px-1.5 py-0.5 text-[10px] font-bold rounded border transition-colors cursor-pointer flex items-center gap-1 ${
                        showQuran
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
                      className="px-1.5 py-0.5 text-[10px] font-bold bg-slate-800 text-slate-300 rounded border border-slate-700"
                    >
                      −
                    </button>
                    <button
                      type="button"
                      onClick={handleClose}
                      className="text-slate-400 hover:text-rose-400 p-0.5 cursor-pointer text-sm font-bold leading-none transition-colors ml-1"
                      title="إغلاق"
                    >
                      ✕
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

                {/* مشغل القرآن الكريم المصغر (الشيخ ماهر المعيقلي) أسفل اسم العضو */}
                {showQuran && (
                  <div className="p-2 bg-gradient-to-r from-emerald-950 via-[#032e22] to-slate-900 border border-emerald-500/50 rounded-xl flex items-center justify-between gap-2 shadow-lg animate-in fade-in duration-200">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="relative flex h-2 w-2 flex-shrink-0">
                        <span className={`absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 ${isQuranPlaying ? 'animate-ping' : ''}`} />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                      </span>
                      <div className="truncate">
                        <div className="text-[10px] font-extrabold text-emerald-200 truncate flex items-center gap-1">
                          <span>📖</span>
                          <span>القرآن — الشيخ ماهر المعيقلي</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          if (!quranAudioRef.current) return;
                          if (isQuranPlaying) {
                            quranAudioRef.current.pause();
                          } else {
                            quranAudioRef.current.play().catch(() => {});
                          }
                        }}
                        className="px-2 py-0.5 text-[9.5px] font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded cursor-pointer transition-colors shadow"
                      >
                        {isQuranPlaying ? '⏸️' : '▶️'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (quranAudioRef.current) {
                            quranAudioRef.current.pause();
                            quranAudioRef.current.currentTime = 0;
                          }
                          setIsQuranPlaying(false);
                          setShowQuran(false);
                        }}
                        className="text-slate-400 hover:text-white p-0.5 cursor-pointer text-xs font-bold leading-none"
                        title="إغلاق مشغل القرآن"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                )}

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
                    <span>🖐️ تداول يدوي</span>
                  </button>
                </div>

                {/* مزامنة حصرية مع إشارات التليجرام فقط */}
                <div className="flex items-center justify-between px-2.5 py-1.5 bg-[#09121f] border border-sky-900/50 rounded-xl text-[10.5px]">
                  <div className="flex items-center gap-2 text-slate-200 select-none">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="font-bold text-sky-300">
                      📢 مزامنة حصرية مع إشارات التليجرام
                    </span>
                  </div>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border text-emerald-300 bg-emerald-500/15 border-emerald-500/30">
                    نشط بالثانية ⚡
                  </span>
                </div>

                {/* Current Signal Feed Box with Direct Pair Display */}
                <div className="p-2.5 rounded-xl bg-[#09121d] border border-slate-800/90 space-y-1.5">
                  <div className="flex items-center justify-between pb-0.5">
                    <span className="text-[11px] text-slate-400 flex items-center gap-1.5">
                      <span>🎯 الزوج:</span>
                      <b className="text-sky-300 font-mono text-xs px-2 py-0.5 rounded bg-sky-950/80 border border-sky-800">
                        بانتظار إشارة التليجرام...
                      </b>
                    </span>
                    <span className="text-[9.5px] text-sky-400 font-bold bg-sky-950/60 px-1.5 py-0.5 rounded border border-sky-800">
                      📢 مزامن مع التليجرام
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-800/80 pt-1.5">
                    <span className="text-xs font-extrabold text-sky-400 flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-sky-400 animate-ping inline-block" />
                      <span>📡 بانتظار الإشارة القادمة:</span>
                    </span>
                    <span className="text-amber-300 font-mono font-black text-sm tracking-widest animate-pulse">
                      {movingDots}
                    </span>
                  </div>
                </div>

                {/* Three Result-Framed Colored Boxes (ربح - خسارة - النسبة) with Direct Click Increment (Without Hint/Explanation) */}
                <div className="grid grid-cols-3 gap-2 text-center select-none">
                  {/* 1. Wins Box (Green Border) */}
                  <div
                    onClick={() => setBannerWins(prev => prev + 1)}
                    className="p-2.5 rounded-xl bg-emerald-950/40 hover:bg-emerald-950/60 border-2 border-emerald-500 flex flex-col items-center justify-center cursor-pointer shadow-[0_0_12px_rgba(16,185,129,0.2)] transition-all active:scale-95"
                  >
                    <span className="text-[11px] font-bold text-emerald-300">✅ ربح</span>
                    <span className="text-lg font-black text-white font-mono mt-1">{bannerWins}</span>
                  </div>

                  {/* 2. Losses Box (Red Border) */}
                  <div
                    onClick={() => setBannerLosses(prev => prev + 1)}
                    className="p-2.5 rounded-xl bg-rose-950/40 hover:bg-rose-950/60 border-2 border-rose-500 flex flex-col items-center justify-center cursor-pointer shadow-[0_0_12px_rgba(239,68,68,0.2)] transition-all active:scale-95"
                  >
                    <span className="text-[11px] font-bold text-rose-300">❌ خسارة</span>
                    <span className="text-lg font-black text-white font-mono mt-1">{bannerLosses}</span>
                  </div>

                  {/* 3. Win Rate Box (Amber Border) */}
                  <div className="p-2.5 rounded-xl bg-amber-950/40 border-2 border-amber-500 flex flex-col items-center justify-center shadow-[0_0_12px_rgba(245,158,11,0.2)]">
                    <span className="text-[11px] font-bold text-amber-300">🎯 النسبة</span>
                    <span className="text-lg font-black text-amber-300 font-mono mt-1">{bannerRate}%</span>
                  </div>
                </div>
              </>
            )}

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
