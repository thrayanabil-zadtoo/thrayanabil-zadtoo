import React, { useState } from 'react';
import {
  TrendingUp,
  Cpu,
  Send,
  Users,
  Play,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Sparkles,
  BarChart2,
  Bell,
  Smartphone
} from 'lucide-react';

interface ZadtooHomePageProps {
  onStartNow: () => void;
  onExploreSignals: () => void;
  onExploreAutoTrade: () => void;
  telegramChannelLink?: string;
}

export const ZadtooHomePage: React.FC<ZadtooHomePageProps> = ({
  onStartNow,
  onExploreSignals,
  onExploreAutoTrade,
  telegramChannelLink = 'https://t.me/ZadNBFX'
}) => {
  const [showVideoModal, setShowVideoModal] = useState(false);

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-800">
      {/* Hero Section */}
      <section className="relative overflow-hidden pt-10 pb-16 lg:pt-16 lg:pb-24">
        {/* Subtle decorative background gradient */}
        <div className="absolute top-0 inset-x-0 h-96 bg-gradient-to-b from-emerald-50/60 via-sky-50/30 to-transparent pointer-events-none" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-8 items-center">
            {/* Left/Right Text Content (RTL: appears on right in Arabic) */}
            <div className="lg:col-span-5 text-center lg:text-right space-y-6">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-100/70 border border-emerald-300 text-emerald-800 text-xs font-bold shadow-2xs">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                <span>المنصة الرائدة في إشارات الخيارات الثنائية فريم الدقيقة</span>
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-5xl font-black text-slate-900 leading-[1.25] tracking-tight">
                <span className="text-slate-900 block">ZAD FX</span>
                <span className="text-slate-900 block mt-1">
                  تداول بذكاء .. <span className="text-emerald-600">لنتائج أفضل</span>
                </span>
              </h1>

              <p className="text-base sm:text-lg text-slate-600 leading-relaxed max-w-xl mx-auto lg:mx-0">
                منصة متكاملة لتداول الخيارات الثنائية مع إشارات دقيقة فريم الدقيقة وتداول آلي احترافي.
              </p>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-center lg:justify-start gap-3.5 pt-2">
                <button
                  type="button"
                  onClick={onStartNow}
                  className="px-7 py-3 text-base font-extrabold text-white bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 rounded-xl transition-all cursor-pointer shadow-md hover:shadow-lg hover:scale-103 active:scale-97"
                >
                  ابدأ الآن
                </button>

                <button
                  type="button"
                  onClick={() => setShowVideoModal(true)}
                  className="px-5 py-3 text-sm font-bold text-sky-700 hover:text-sky-800 bg-sky-50/80 hover:bg-sky-100 border border-sky-300 rounded-xl transition-all cursor-pointer flex items-center gap-2"
                >
                  <Play className="w-4 h-4 fill-sky-600 text-sky-600" />
                  <span>شاهد الفيديو</span>
                </button>
              </div>

              <div className="flex items-center justify-center lg:justify-start gap-4 text-xs text-slate-500 pt-2 font-medium">
                <span className="flex items-center gap-1 text-emerald-700">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span>دقة تصل إلى 80%+</span>
                </span>
                <span>•</span>
                <span className="flex items-center gap-1 text-sky-700">
                  <CheckCircle2 className="w-4 h-4 text-sky-500" />
                  <span>بدون مضاعفات (Zero Gale)</span>
                </span>
                <span>•</span>
                <span className="flex items-center gap-1 text-slate-700">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span>روبوت عائم مستقل</span>
                </span>
              </div>
            </div>

            {/* Visual: Laptop & Phone Mockup (Exactly matching the design screenshot) */}
            <div className="lg:col-span-7 flex justify-center items-center relative">
              <div className="w-full max-w-2xl relative select-none">
                {/* Modern Laptop Mockup Canvas */}
                <div className="bg-slate-900 rounded-2xl p-2.5 sm:p-3.5 shadow-2xl border-4 border-slate-700 relative">
                  {/* Laptop Screen Header */}
                  <div className="bg-[#0B0F17] rounded-xl p-3 sm:p-4 text-white relative overflow-hidden">
                    {/* Platform Topbar */}
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2.5 mb-3 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-white text-sm font-mono-num">EUR/USD</span>
                        <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/30">
                          +87% عائل
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="bg-slate-800 px-2.5 py-1 rounded-md text-[11px] font-mono-num text-amber-300 font-bold flex items-center gap-1">
                          <Clock className="w-3 h-3 text-amber-400" />
                          <span>00:01:00</span>
                        </div>
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                      </div>
                    </div>

                    {/* Candlestick Interactive Mockup Chart */}
                    <div className="h-40 sm:h-52 w-full flex items-end justify-between gap-1 px-1 py-2 relative">
                      {/* Grid Lines */}
                      <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-10">
                        <div className="border-b border-slate-400 w-full" />
                        <div className="border-b border-slate-400 w-full" />
                        <div className="border-b border-slate-400 w-full" />
                      </div>

                      {/* Mock Candlesticks */}
                      {[
                        { h: '45%', bull: true },
                        { h: '60%', bull: true },
                        { h: '40%', bull: false },
                        { h: '55%', bull: true },
                        { h: '35%', bull: false },
                        { h: '70%', bull: true },
                        { h: '65%', bull: true },
                        { h: '50%', bull: false },
                        { h: '80%', bull: true },
                        { h: '75%', bull: true },
                        { h: '88%', bull: true },
                        { h: '70%', bull: false },
                        { h: '92%', bull: true }
                      ].map((candle, idx) => (
                        <div key={idx} className="flex-1 flex flex-col items-center justify-end h-full relative group">
                          {/* Wick */}
                          <div
                            className={`w-[1px] absolute ${candle.bull ? 'bg-emerald-400' : 'bg-rose-400'}`}
                            style={{ height: '100%', top: '5%' }}
                          />
                          {/* Candle Body */}
                          <div
                            className={`w-full max-w-[14px] rounded-xs z-10 transition-all ${
                              candle.bull
                                ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.3)]'
                                : 'bg-rose-500 shadow-[0_0_8px_rgba(239,68,68,0.3)]'
                            }`}
                            style={{ height: candle.h }}
                          />
                        </div>
                      ))}
                    </div>

                    {/* Trade Action Overlay (matching screenshot: Green UP button & Red DOWN button) */}
                    <div className="mt-3 pt-2.5 border-t border-slate-800 grid grid-cols-2 gap-2.5">
                      <div className="bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs sm:text-sm py-2 px-3 rounded-lg text-center cursor-pointer shadow-md flex items-center justify-center gap-1.5 transition-transform active:scale-95">
                        <span>↑</span>
                        <span>شراء CALL</span>
                      </div>
                      <div className="bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs sm:text-sm py-2 px-3 rounded-lg text-center cursor-pointer shadow-md flex items-center justify-center gap-1.5 transition-transform active:scale-95">
                        <span>↓</span>
                        <span>بيع PUT</span>
                      </div>
                    </div>
                  </div>

                  {/* Laptop Base Stand */}
                  <div className="h-3 bg-slate-700 rounded-b-xl mt-1 flex justify-center items-center">
                    <div className="w-16 h-1 bg-slate-500 rounded-full" />
                  </div>
                </div>

                {/* Overlaid Smartphone Mockup (on the right, showing Telegram Signals like screenshot) */}
                <div className="absolute -bottom-6 -left-2 sm:-left-6 w-44 sm:w-56 bg-slate-900 border-4 border-slate-700 rounded-3xl p-2.5 shadow-2xl transform rotate-2 hover:rotate-0 transition-transform duration-300">
                  <div className="bg-[#09111E] rounded-2xl p-2.5 text-white space-y-2 border border-slate-800">
                    {/* Phone Top Notch */}
                    <div className="w-16 h-1.5 bg-slate-800 rounded-full mx-auto mb-1" />

                    <div className="flex items-center justify-between text-[11px] border-b border-slate-800 pb-1.5">
                      <div className="flex items-center gap-1 text-sky-400 font-bold">
                        <Send className="w-3 h-3 text-sky-400" />
                        <span>إشارات تليجرام</span>
                      </div>
                      <span className="text-[9px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded">
                        مباشر ⚡
                      </span>
                    </div>

                    {/* Signal Item Inside Phone */}
                    <div className="p-2 bg-slate-800/80 rounded-xl border border-emerald-500/30 text-[10.5px] space-y-1">
                      <div className="flex items-center justify-between font-bold">
                        <span className="text-white font-mono-num">EUR/USD</span>
                        <span className="text-emerald-400">شراء ↑</span>
                      </div>
                      <div className="flex items-center justify-between text-[9px] text-slate-400">
                        <span>الوقت: 14:32</span>
                        <span className="text-amber-300">1 دقيقة M1</span>
                      </div>
                    </div>

                    <div className="p-2 bg-slate-800/80 rounded-xl border border-rose-500/30 text-[10.5px] space-y-1">
                      <div className="flex items-center justify-between font-bold">
                        <span className="text-white font-mono-num">GBP/JPY</span>
                        <span className="text-rose-400">بيع ↓</span>
                      </div>
                      <div className="flex items-center justify-between text-[9px] text-slate-400">
                        <span>الوقت: 14:31</span>
                        <span className="text-amber-300">1 دقيقة M1</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4 Highlights Feature Cards (Directly matching Screen 1 bottom cards) */}
      <section className="py-12 bg-white border-y border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {/* Card 1: إشارات فورية فريم الدقيقة */}
            <div
              onClick={onExploreSignals}
              className="p-6 rounded-2xl bg-slate-50 hover:bg-emerald-50/50 border border-slate-200 hover:border-emerald-300 transition-all cursor-pointer group shadow-2xs hover:shadow-md"
            >
              <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <TrendingUp className="w-6 h-6 text-emerald-600" />
              </div>
              <h3 className="text-base font-extrabold text-slate-900 mb-1">
                إشارات فورية
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                فريم الدقيقة (M1) مع نقاط دخول مؤكدة بالثانية
              </p>
            </div>

            {/* Card 2: التداول الآلي بأحدث التقنيات */}
            <div
              onClick={onExploreAutoTrade}
              className="p-6 rounded-2xl bg-slate-50 hover:bg-sky-50/50 border border-slate-200 hover:border-sky-300 transition-all cursor-pointer group shadow-2xs hover:shadow-md"
            >
              <div className="w-12 h-12 rounded-xl bg-sky-100 text-sky-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Cpu className="w-6 h-6 text-sky-600" />
              </div>
              <h3 className="text-base font-extrabold text-slate-900 mb-1">
                التداول الآلي
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                بأحدث التقنيات السحابية وتنفيذ فوري على المنصة
              </p>
            </div>

            {/* Card 3: قناة تليجرام للتنبيهات المباشرة */}
            <a
              href={telegramChannelLink}
              target="_blank"
              rel="noopener noreferrer"
              className="p-6 rounded-2xl bg-slate-50 hover:bg-blue-50/50 border border-slate-200 hover:border-blue-300 transition-all cursor-pointer group shadow-2xs hover:shadow-md block"
            >
              <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Send className="w-6 h-6 text-blue-600" />
              </div>
              <h3 className="text-base font-extrabold text-slate-900 mb-1">
                قناة تليجرام
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                للتنبيهات المباشرة والإشعارات الفورية لحظة بلحظة
              </p>
            </a>

            {/* Card 4: عضويات مرنة تناسب الجميع */}
            <div
              onClick={onStartNow}
              className="p-6 rounded-2xl bg-slate-50 hover:bg-amber-50/50 border border-slate-200 hover:border-amber-300 transition-all cursor-pointer group shadow-2xs hover:shadow-md"
            >
              <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Users className="w-6 h-6 text-amber-600" />
              </div>
              <h3 className="text-base font-extrabold text-slate-900 mb-1">
                عضويات مرنة
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                باقات مخصصة تناسب جميع المستويات وحسابات التداول
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Video Modal Walkthrough */}
      {showVideoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full space-y-4 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Play className="w-5 h-5 text-emerald-600 fill-emerald-600" />
                <span>شرح منصة وتداول ZAD FX</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowVideoModal(false)}
                className="text-slate-400 hover:text-slate-700 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="aspect-video bg-slate-950 rounded-xl flex flex-col items-center justify-center text-center p-4 text-white space-y-3">
              <div className="w-14 h-14 rounded-full bg-emerald-600/30 border-2 border-emerald-400 flex items-center justify-center animate-pulse">
                <Play className="w-6 h-6 fill-white text-white ml-0.5" />
              </div>
              <div className="text-sm font-bold">شاهد كيفية استقبال الإشارة وفتح الصفقة بالثانية</div>
              <p className="text-xs text-slate-400 max-w-xs">
                يقوم النظام بتحليل الشموع بدقة متناهية وإرسال الإشارة عبر تليجرام والروبوت العائم مباشرة.
              </p>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowVideoModal(false);
                  onStartNow();
                }}
                className="px-5 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl cursor-pointer"
              >
                ابدأ التداول الآن
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
