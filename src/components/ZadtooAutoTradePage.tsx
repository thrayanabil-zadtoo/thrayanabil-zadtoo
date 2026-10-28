import React, { useState, useEffect } from 'react';
import {
  Cpu,
  ShieldCheck,
  Zap,
  Sparkles,
  CheckCircle2,
  Download,
  Copy,
  ExternalLink,
  Play,
  Pause,
  Clock,
  ArrowUp,
  ArrowDown,
  Settings,
  Activity,
  Check,
  RefreshCw,
  Terminal,
  TrendingUp,
  Sliders
} from 'lucide-react';

interface ZadtooAutoTradePageProps {
  onOpenRobotAdmin?: () => void;
  userscriptCode?: string;
  onDownloadScript?: () => void;
  appOrigin?: string;
}

interface SimulatedTrade {
  id: string;
  asset: string;
  direction: 'CALL' | 'PUT';
  stake: number;
  result: 'WIN' | 'PENDING' | 'LOSS';
  profit: number;
  time: string;
}

export const ZadtooAutoTradePage: React.FC<ZadtooAutoTradePageProps> = ({
  onOpenRobotAdmin,
  userscriptCode = '',
  onDownloadScript,
  appOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://fx.zadtoo.com'
}) => {
  const [copied, setCopied] = useState(false);
  const [isSimulating, setIsSimulating] = useState(true);
  const [brokerConnected, setBrokerConnected] = useState(true);
  const [selectedBroker, setSelectedBroker] = useState<'Quotex' | 'Pocket Option' | 'Olymp Trade'>('Quotex');
  const [tradeStake, setTradeStake] = useState(5);
  const [martingaleFactor, setMartingaleFactor] = useState(2);
  const [activeTab, setActiveTab] = useState<'features' | 'simulator' | 'install'>('features');

  // Simulated live bot trades stream
  const [simTrades, setSimTrades] = useState<SimulatedTrade[]>([
    {
      id: 'trade-1',
      asset: 'EUR/USD',
      direction: 'CALL',
      stake: 5,
      result: 'WIN',
      profit: 4.6,
      time: '14:32:00'
    },
    {
      id: 'trade-2',
      asset: 'GBP/JPY',
      direction: 'PUT',
      stake: 5,
      result: 'WIN',
      profit: 4.5,
      time: '14:30:00'
    },
    {
      id: 'trade-3',
      asset: 'AUD/USD',
      direction: 'CALL',
      stake: 5,
      result: 'WIN',
      profit: 4.55,
      time: '14:28:00'
    }
  ]);

  const [simStats, setSimStats] = useState({
    totalTrades: 16,
    wins: 13,
    losses: 3,
    netProfit: 48.75
  });

  // Ticking simulation engine
  useEffect(() => {
    if (!isSimulating) return;

    const interval = setInterval(() => {
      const pairs = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'EUR/JPY'];
      const randomPair = pairs[Math.floor(Math.random() * pairs.length)];
      const randomDir: 'CALL' | 'PUT' = Math.random() > 0.48 ? 'CALL' : 'PUT';
      const isWin = Math.random() < 0.82; // 82% win rate simulation
      const profit = isWin ? Number((tradeStake * 0.9).toFixed(2)) : -tradeStake;

      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

      const newTrade: SimulatedTrade = {
        id: `trade-${Date.now()}`,
        asset: randomPair,
        direction: randomDir,
        stake: tradeStake,
        result: isWin ? 'WIN' : 'LOSS',
        profit: profit,
        time: timeStr
      };

      setSimTrades(prev => [newTrade, ...prev.slice(0, 9)]);
      setSimStats(prev => ({
        totalTrades: prev.totalTrades + 1,
        wins: isWin ? prev.wins + 1 : prev.wins,
        losses: isWin ? prev.losses : prev.losses + 1,
        netProfit: Number((prev.netProfit + profit).toFixed(2))
      }));
    }, 12000);

    return () => clearInterval(interval);
  }, [isSimulating, tradeStake]);

  const handleCopyCode = () => {
    if (userscriptCode) {
      navigator.clipboard.writeText(userscriptCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] py-10 sm:py-16 text-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
        {/* Main Section matching Screen 3 */}
        <div className="bg-gradient-to-br from-white via-sky-50/40 to-emerald-50/30 rounded-3xl p-6 sm:p-10 lg:p-12 border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            {/* Robot Mascot Illustration */}
            <div className="lg:col-span-4 flex justify-center order-2 lg:order-1">
              <div className="relative">
                {/* 3D Robot Vector Illustration */}
                <div className="w-56 h-56 sm:w-64 sm:h-64 rounded-full bg-gradient-to-tr from-sky-500/20 via-emerald-500/20 to-teal-400/20 flex items-center justify-center p-4 shadow-xl border border-sky-200">
                  <div className="w-full h-full rounded-full bg-white flex flex-col items-center justify-center p-6 text-center space-y-3 shadow-inner">
                    {/* Cute Robot Head */}
                    <div className="w-20 h-20 rounded-2xl bg-gradient-to-b from-sky-400 to-sky-600 p-2 shadow-lg flex flex-col items-center justify-center relative">
                      <div className="w-2.5 h-2.5 bg-amber-400 rounded-full absolute -top-3 animate-ping" />
                      <div className="w-1 h-3 bg-slate-400 absolute -top-3" />
                      {/* Eyes Screen */}
                      <div className="w-14 h-9 bg-slate-950 rounded-xl flex items-center justify-around px-2">
                        <span className="w-3 h-3 bg-emerald-400 rounded-full animate-pulse shadow-[0_0_8px_#34d399]" />
                        <span className="w-3 h-3 bg-emerald-400 rounded-full animate-pulse shadow-[0_0_8px_#34d399]" />
                      </div>
                      {/* Smile */}
                      <div className="w-6 h-1 bg-sky-200 rounded-full mt-1.5" />
                    </div>

                    <div className="font-black text-sm text-slate-800">
                      روبوت ZAD FX الذكي
                    </div>
                    <div className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      متصل ومتزامن بالسيرفر
                    </div>
                  </div>
                </div>

                <div className="absolute -bottom-2 -right-2 bg-emerald-500 text-white text-[11px] font-extrabold px-3 py-1 rounded-full shadow-md flex items-center gap-1">
                  <Zap className="w-3 h-3 fill-white" />
                  <span>تنفيذ بالثانية</span>
                </div>
              </div>
            </div>

            {/* Center Content Text */}
            <div className="lg:col-span-5 text-center lg:text-right space-y-5 order-1 lg:order-2">
              <h2 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight leading-tight">
                التداول الآلي
                <span className="block text-sky-700 text-2xl sm:text-3xl font-extrabold mt-1">
                  تكنولوجيا ذكية .. لفرص أكبر
                </span>
              </h2>

              <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
                نظام التداول الآلي في ZAD FX مبرمج وفقاً لاستراتيجية الدعم والمقاومة الإلزامية (S/R) مع توافق مؤشرين على الأقل من: (SuperTrend 10, 3 + Williams Fractal 5 + RSI 9, 70, 30) لتنفيذ الصفقات على فريم الدقيقة (M1) بأعلى دقة وتوافق فني وبدون أي مضاعفات.
              </p>

              {/* Indicators Badge */}
              <div className="inline-flex flex-wrap items-center gap-1.5 p-2 bg-slate-900 text-white rounded-xl text-xs font-mono-num font-bold">
                <span className="text-amber-400 font-sans text-[11px] font-black">المؤشرات:</span>
                <span className="px-2 py-0.5 rounded bg-amber-500/30 text-amber-300 border border-amber-500/50 font-black">🧱 دعم ومقاومة (أساسي 100%)</span>
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">SUPERTREND 10 3</span>
                <span className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30">FRACTAL 5</span>
                <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">RSI 9 [70/30]</span>
              </div>

              {/* 3 Badges matching Screen 3 */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <div className="p-3 bg-white rounded-xl border border-slate-200 text-center space-y-1 shadow-2xs">
                  <Clock className="w-5 h-5 text-sky-600 mx-auto" />
                  <div className="text-xs font-extrabold text-slate-800">إدارة المخاطر</div>
                  <div className="text-[10px] text-slate-400">لحماية رأس المال</div>
                </div>

                <div className="p-3 bg-white rounded-xl border border-slate-200 text-center space-y-1 shadow-2xs">
                  <Zap className="w-5 h-5 text-emerald-600 mx-auto" />
                  <div className="text-xs font-extrabold text-slate-800">تنفيذ تلقائي</div>
                  <div className="text-[10px] text-slate-400">بدون تدخل يدوي</div>
                </div>

                <div className="p-3 bg-white rounded-xl border border-slate-200 text-center space-y-1 shadow-2xs">
                  <Cpu className="w-5 h-5 text-purple-600 mx-auto" />
                  <div className="text-xs font-extrabold text-slate-800">تحليل فني متقدم</div>
                  <div className="text-[10px] text-slate-400">بالذكاء الاصطناعي</div>
                </div>
              </div>

              <div className="pt-2 flex flex-wrap gap-3 justify-center lg:justify-start">
                <a
                  href={`${appOrigin}/api/quotex-robot/zad-broker-robot.user.js`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-6 py-2.5 bg-sky-600 hover:bg-sky-500 text-white font-extrabold text-sm rounded-xl transition-all cursor-pointer shadow-md flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  <span>تثبيت الروبوت في المتصفح بنقرة واحدة</span>
                </a>

                {onOpenRobotAdmin && (
                  <button
                    type="button"
                    onClick={onOpenRobotAdmin}
                    className="px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 font-bold text-sm rounded-xl border border-slate-300 transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    <Settings className="w-4 h-4 text-slate-500" />
                    <span>إعدادات الروبوت المتقدمة</span>
                  </button>
                )}
              </div>
            </div>

            {/* Right Card: مثال على إشارة تداول آلي */}
            <div className="lg:col-span-3 order-3">
              <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
                <div className="text-xs font-bold text-slate-400 border-b border-slate-100 pb-2">
                  مثال على إشارة تداول آلي
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">🇪🇺🇺🇸</span>
                      <strong className="text-base font-extrabold text-slate-900 font-mono-num">
                        EUR/USD
                      </strong>
                    </div>

                    <span className="px-2.5 py-1 text-xs font-extrabold bg-emerald-100 text-emerald-700 rounded-lg flex items-center gap-1">
                      <ArrowUp className="w-3.5 h-3.5" />
                      <span>شراء</span>
                    </span>
                  </div>

                  <div className="text-xs text-slate-400 font-mono-num flex justify-between">
                    <span>الوقت: 14:32</span>
                    <span className="text-sky-600 font-bold">فريم 1 دقيقة</span>
                  </div>

                  {/* Mini Candle Illustration */}
                  <div className="h-16 bg-slate-50 rounded-xl p-2 flex items-end justify-between gap-1 border border-slate-100">
                    <div className="w-2 bg-emerald-400 h-6 rounded-xs" />
                    <div className="w-2 bg-emerald-500 h-10 rounded-xs" />
                    <div className="w-2 bg-rose-400 h-5 rounded-xs" />
                    <div className="w-2 bg-emerald-500 h-12 rounded-xs" />
                    <div className="w-2 bg-emerald-600 h-14 rounded-xs shadow-xs" />
                  </div>

                  {/* Execution Status Badge */}
                  <div className="p-2.5 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-700 text-xs font-bold flex items-center justify-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>تم التنفيذ تلقائياً</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Live Bot Execution Simulator Console */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-emerald-500 animate-ping" />
                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                  <span>محاكي التداول الآلي الحي (Live Cloud Engine)</span>
                </h3>
              </div>
              <p className="text-xs text-slate-500">
                شاهد كيفية تحليل السوق وتنفيذ الصفقات بالثانية ومعدل الأرباح مباشرة
              </p>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setIsSimulating(!isSimulating)}
                className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  isSimulating
                    ? 'bg-amber-500 hover:bg-amber-600 text-white'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                }`}
              >
                {isSimulating ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                <span>{isSimulating ? 'إيقاف مؤقت' : 'تشغيل المحاكي'}</span>
              </button>

              <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-emerald-700 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>البروكر: {selectedBroker} متصل</span>
              </div>
            </div>
          </div>

          {/* Stats Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 space-y-1">
              <span className="text-[11px] text-slate-400 font-medium">إجمالي الصفقات</span>
              <div className="text-xl font-black text-slate-900 font-mono-num">
                {simStats.totalTrades}
              </div>
            </div>

            <div className="p-3.5 bg-emerald-50/70 rounded-2xl border border-emerald-100 space-y-1">
              <span className="text-[11px] text-emerald-700 font-medium">الصفقات الرابحة</span>
              <div className="text-xl font-black text-emerald-600 font-mono-num">
                {simStats.wins} صفقات
              </div>
            </div>

            <div className="p-3.5 bg-sky-50/70 rounded-2xl border border-sky-100 space-y-1">
              <span className="text-[11px] text-sky-700 font-medium">نسبة النجاح الفعلي</span>
              <div className="text-xl font-black text-sky-600 font-mono-num">
                {Math.round((simStats.wins / simStats.totalTrades) * 100)}%
              </div>
            </div>

            <div className="p-3.5 bg-amber-50/70 rounded-2xl border border-amber-100 space-y-1">
              <span className="text-[11px] text-amber-700 font-medium">صافي الربح التقديري</span>
              <div className="text-xl font-black text-amber-600 font-mono-num">
                +${simStats.netProfit.toFixed(2)}
              </div>
            </div>
          </div>

          {/* Live Trades Stream Table */}
          <div className="border border-slate-200 rounded-2xl overflow-hidden">
            <div className="p-3 bg-slate-50 border-b border-slate-200 text-xs font-extrabold text-slate-700 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Terminal className="w-4 h-4 text-slate-500" />
                <span>سجل التنفيذ المباشر للصفقات (Live Execution Log):</span>
              </span>
              <span className="text-[10px] text-slate-400 font-mono-num">
                يتم التحديث كل شمعة دقيقة
              </span>
            </div>

            <div className="divide-y divide-slate-100 text-xs max-h-60 overflow-y-auto font-mono-num">
              {simTrades.map(trade => (
                <div
                  key={trade.id}
                  className="p-3 flex items-center justify-between hover:bg-slate-50/80 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400 text-[11px]">{trade.time}</span>
                    <strong className="text-slate-900 font-bold">{trade.asset}</strong>
                  </div>

                  <div className="flex items-center gap-1">
                    {trade.direction === 'CALL' ? (
                      <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded text-[11px] font-bold flex items-center gap-0.5">
                        <ArrowUp className="w-3 h-3" />
                        <span>شراء</span>
                      </span>
                    ) : (
                      <span className="text-rose-700 bg-rose-50 px-2 py-0.5 rounded text-[11px] font-bold flex items-center gap-0.5">
                        <ArrowDown className="w-3 h-3" />
                        <span>بيع</span>
                      </span>
                    )}
                  </div>

                  <div className="text-slate-500">
                    قيمة الصفقة: <strong>${trade.stake}</strong>
                  </div>

                  <div className="font-extrabold">
                    {trade.result === 'WIN' ? (
                      <span className="text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg">
                        +${trade.profit.toFixed(2)} (ربح ✅)
                      </span>
                    ) : (
                      <span className="text-rose-600 bg-rose-50 px-2.5 py-1 rounded-lg">
                        -${trade.stake} (مضاعفة ⏳)
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Quick Script Installer Box for Users */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <Cpu className="w-5 h-5 text-emerald-600" />
                <span>روبوت ZAD FX العائم (Universal Broker Pro Bot v3.6)</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                يعمل مستقلاً 100% كنافذة عائمة على المنصة مع عد تنازلي بالثانية وتنفيذ آلي فوري.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <a
                href={`${appOrigin}/api/quotex-robot/zad-broker-robot.user.js`}
                target="_blank"
                rel="noreferrer"
                className="px-3.5 py-1.5 bg-sky-500 hover:bg-sky-400 text-white font-extrabold text-xs rounded-lg flex items-center gap-1 transition-all"
              >
                <span>تثبيت مباشر بنقرة واحدة ↗</span>
              </a>

              {onDownloadScript && (
                <button
                  type="button"
                  onClick={onDownloadScript}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs rounded-lg flex items-center gap-1 transition-all cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>تحميل ملف .user.js</span>
                </button>
              )}

              {userscriptCode && (
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg border border-slate-300 transition-all cursor-pointer flex items-center gap-1"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{copied ? '✓ تم النسخ' : 'نسخ الكود'}</span>
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-slate-600">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
              <strong className="text-slate-900 block mb-1">1. التثبيت السريع:</strong>
              قم بتثبيت إضافة Tampermonkey في متصفحك (كروم/إيدج/أوبرا).
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
              <strong className="text-slate-900 block mb-1">2. إضافة السكريبت:</strong>
              اضغط على زر التثبيت المباشر أو انسخ الكود والصقه في إضافة Tampermonkey.
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
              <strong className="text-slate-900 block mb-1">3. التداول المباشر:</strong>
              افتح منصة كيوتكس وستظهر لك النافذة العائمة الذكية جاهزة بالثانية!
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
