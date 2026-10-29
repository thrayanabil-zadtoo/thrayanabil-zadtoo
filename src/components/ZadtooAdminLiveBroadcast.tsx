import React, { useState } from 'react';
import {
  Radio,
  Send,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Bot,
  Crown,
  Monitor,
  Flame,
  CheckSquare,
  Square,
  MessageSquare,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  Clock,
  Layers,
  Award,
  ShieldCheck
} from 'lucide-react';
import type { AutoPilotConfig } from '../App';

interface ZadtooAdminLiveBroadcastProps {
  autoPilot?: AutoPilotConfig;
  onRefreshSignals?: () => void;
  onNavigateHome?: () => void;
}

export const MAJOR_6_PAIRS = [
  { pair: 'EUR/USD', label: 'EUR/USD (اليورو / دولار أمريكي)', flag1: '🇪🇺', flag2: '🇺🇸', defaultSpread: '0.8' },
  { pair: 'GBP/USD', label: 'GBP/USD (الجنيه الإسترليني / دولار أمريكي)', flag1: '🇬🇧', flag2: '🇺🇸', defaultSpread: '1.1' },
  { pair: 'USD/JPY', label: 'USD/JPY (الدولار الأمريكي / الين الياباني)', flag1: '🇺🇸', flag2: '🇯🇵', defaultSpread: '0.9' },
  { pair: 'USD/CAD', label: 'USD/CAD (الدولار الأمريكي / الدولار الكندي)', flag1: '🇺🇸', flag2: '🇨🇦', defaultSpread: '1.2' },
  { pair: 'AUD/USD', label: 'AUD/USD (الدولار الأسترالي / الدولار الأمريكي)', flag1: '🇦🇺', flag2: '🇺🇸', defaultSpread: '1.0' },
  { pair: 'USD/CHF', label: 'USD/CHF (الدولار الأمريكي / الفرنك السويسري)', flag1: '🇺🇸', flag2: '🇨🇭', defaultSpread: '1.3' }
];

export const ZadtooAdminLiveBroadcast: React.FC<ZadtooAdminLiveBroadcastProps> = ({
  autoPilot,
  onRefreshSignals,
  onNavigateHome
}) => {
  // --- Section 1: Signal Broadcast Form State ---
  const [selectedPair, setSelectedPair] = useState<string>('EUR/USD');
  const [direction, setDirection] = useState<'CALL' | 'PUT'>('CALL');
  const [targetFreeBot, setTargetFreeBot] = useState<boolean>(true);
  const [targetVipBot, setTargetVipBot] = useState<boolean>(true);
  const [targetFloatingRobot, setTargetFloatingRobot] = useState<boolean>(true);
  const [customNotes, setCustomNotes] = useState<string>('');
  const [isSendingSignal, setIsSendingSignal] = useState<boolean>(false);
  const [signalFeedback, setSignalFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
    details?: string;
  } | null>(null);

  // --- Section 2: Announcements & Celebrations State ---
  const [winMessage, setWinMessage] = useState<string>(
    '🎉 ألف مبروك لجميع من شارك ودخل معنا في هذا البث الحي!\n🟢 صفقة رابحة ومحققة للهدف بفضل الله تعالى 💰🚀\nبارك الله في أرباحكم جميعاً ونسأل الله دوام التوفيق والنجاح!'
  );
  const [lossMessage, setLossMessage] = useState<string>(
    '⚠️ تنبيه مباشر للمشاركين في البث الحي:\nالصفقة السابقة واجهت تقلبات وارتداد غير متوقع. نرجو الالتزام التام بإدارة رأس المال (1%) وعدم التسرع، نجهز الآن لفرصة تعويضية قوية ومحسوبة بإذن الله.'
  );
  const [closingMessage, setClosingMessage] = useState<string>(
    '🔴 تم بحمد الله اختتام جلسة البث الحي لهذا اليوم.\nنشكر كل من شارك وتفاعل وتداول معنا اليوم، نلتقي بكم غداً في نفس الموعد مع صفقات وبث جديد بإذن الله 🤝'
  );
  const [customAnnouncement, setCustomAnnouncement] = useState<string>('');

  const [announcementFreeBot, setAnnouncementFreeBot] = useState<boolean>(true);
  const [announcementVipBot, setAnnouncementVipBot] = useState<boolean>(true);
  const [isSendingAnnouncement, setIsSendingAnnouncement] = useState<string | null>(null);
  const [announcementFeedback, setAnnouncementFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Quick preset notes for the signal
  const PRESET_NOTES = [
    'تأكيد الدخول فور إغلاق الشمعة الحالية مباشرة ⏱️',
    'ارتداد قوي ومثالي من مستوى دعم رئيسي 🟢',
    'كسر كاذب وارتداد من مستوى مقاومة رئيسي 🔴',
    'التزام صارم بإدارة رأس المال 1% كحد أقصى ⚖️'
  ];

  // Handler for sending the live signal
  const handleSendLiveSignal = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!targetFreeBot && !targetVipBot && !targetFloatingRobot) {
      setSignalFeedback({
        type: 'error',
        text: 'يرجى تحديد وجهة واحدة على الأقل (بوت القناة العامة أو بوت VIP أو الروبوت العائم).'
      });
      return;
    }

    setIsSendingSignal(true);
    setSignalFeedback(null);

    try {
      const res = await fetch('/api/admin/live-broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'signal',
          pair: selectedPair,
          direction,
          timeframe: '1 دقيقة (M1)',
          customNotes: customNotes.trim(),
          targetBots: {
            freeBot: targetFreeBot,
            vipBot: targetVipBot,
            floatingRobot: targetFloatingRobot
          }
        })
      });

      const data = await res.json();
      if (data.ok) {
        const destParts: string[] = [];
        if (data.sentToFree) destParts.push('بوت القناة العامة');
        if (data.sentToVip) destParts.push('بوت VIP');
        if (data.sentToFloating) destParts.push('الروبوت العائم');

        setSignalFeedback({
          type: 'success',
          text: `تم إرسال إشارة ${selectedPair} (${direction === 'CALL' ? 'صعود 🟢' : 'هبوط 🔴'}) بنجاح!`,
          details: `وصلت الإشارة إلى: ${destParts.join(' + ') || 'الأجهزة المحددة'}`
        });

        // Trigger signal refresh across app
        if (onRefreshSignals) onRefreshSignals();
      } else {
        setSignalFeedback({
          type: 'error',
          text: data.error || data.telegramError || 'تعذر إرسال الإشارة، يرجى المحاولة مرة أخرى.'
        });
      }
    } catch (err: any) {
      setSignalFeedback({
        type: 'error',
        text: err?.message || 'خطأ في الاتصال بالسيرفر أثناء إرسال الإشارة.'
      });
    } finally {
      setIsSendingSignal(false);
    }
  };

  // Handler for sending announcements / celebrations
  const handleSendAnnouncement = async (
    boxId: 'win' | 'loss' | 'closing' | 'custom',
    text: string
  ) => {
    if (!announcementFreeBot && !announcementVipBot) {
      setAnnouncementFeedback({
        type: 'error',
        text: 'يرجى تفعيل بوت القناة العامة أو بوت VIP لإرسال الرسالة.'
      });
      return;
    }

    if (!text.trim()) {
      setAnnouncementFeedback({
        type: 'error',
        text: 'الرجاء كتابة نص الرسالة المراد إرسالها.'
      });
      return;
    }

    setIsSendingAnnouncement(boxId);
    setAnnouncementFeedback(null);

    try {
      const res = await fetch('/api/admin/live-broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'announcement',
          announcementType: boxId,
          announcementText: text.trim(),
          targetBots: {
            freeBot: announcementFreeBot,
            vipBot: announcementVipBot
          }
        })
      });

      const data = await res.json();
      if (data.ok) {
        const destParts: string[] = [];
        if (data.sentToFree) destParts.push('القناة العامة');
        if (data.sentToVip) destParts.push('قناة VIP');

        setAnnouncementFeedback({
          type: 'success',
          text: `تم إرسال الرسالة بنجاح إلى: ${destParts.join(' و ') || 'البوتات المحددة'}!`
        });

        if (boxId === 'custom') {
          setCustomAnnouncement('');
        }
      } else {
        setAnnouncementFeedback({
          type: 'error',
          text: data.error || data.telegramError || 'فشل إرسال الرسالة، تأكد من التوكن والقنوات.'
        });
      }
    } catch (err: any) {
      setAnnouncementFeedback({
        type: 'error',
        text: err?.message || 'خطأ في الاتصال أثناء إرسال الرسالة.'
      });
    } finally {
      setIsSendingAnnouncement(null);
    }
  };

  const selectedPairObj = MAJOR_6_PAIRS.find((p) => p.pair === selectedPair) || MAJOR_6_PAIRS[0];

  return (
    <div className="space-y-8 animate-fadeIn" dir="rtl">
      {/* Top Banner Header */}
      <div className="p-6 bg-gradient-to-r from-slate-900 via-rose-950/40 to-slate-900 border border-rose-500/30 rounded-2xl shadow-xl text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/20 border border-rose-400/30 text-rose-300 text-xs font-black">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
              <span>لوحة البث الحي الحصري للمشرف ZAD FX</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center gap-2.5">
              <Radio className="w-7 h-7 text-rose-400 animate-pulse" />
              <span>البث الحي للمشرف</span>
            </h1>
            <p className="text-slate-300 text-xs sm:text-sm max-w-2xl leading-relaxed">
              تحكم كامل في بث الإشارات المباشرة أثناء جلسات التداول الحي، الإرسال الفوري لبوت القناة المجانية وبوت VIP والروبوت العائم معاً، وصناديق المباركة وإعلانات النتائج.
            </p>
          </div>

          {/* Bot Connection Quick Status Badges */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-xs flex items-center gap-2">
              <Bot className="w-4 h-4 text-emerald-400" />
              <div>
                <div className="text-[10px] text-slate-400">البوت المجاني</div>
                <div className="font-bold text-emerald-300">
                  {autoPilot?.botToken ? '@ZadNBFX (جاهز)' : 'غير متصل'}
                </div>
              </div>
            </div>

            <div className="px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-xs flex items-center gap-2">
              <Crown className="w-4 h-4 text-amber-400" />
              <div>
                <div className="text-[10px] text-slate-400">بوت VIP الخاص</div>
                <div className="font-bold text-amber-300">
                  {autoPilot?.vipBotToken ? 'Abusalim VIP (جاهز)' : 'غير متصل'}
                </div>
              </div>
            </div>

            <div className="px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-xs flex items-center gap-2">
              <Monitor className="w-4 h-4 text-sky-400" />
              <div>
                <div className="text-[10px] text-slate-400">الروبوت العائم</div>
                <div className="font-bold text-sky-300">متصل ومتزامن</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================
          SECTION 1: مربع إرسال إشارة البث الحي اليدوية
          ======================================================== */}
      <div className="bg-white border-2 border-slate-200/90 rounded-2xl shadow-md p-6 sm:p-8 space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-200 font-bold">
              01
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-extrabold text-slate-900">
                إرسال إشارة البث الحي المباشر
              </h2>
              <p className="text-xs text-slate-500">
                حدد الزوج من الأزواج الستة، واختر الاتجاه (هبوط أو صعود)، وحدد البوتات المستهدفة
              </p>
            </div>
          </div>

          {/* Direction Live Indicator Badge */}
          <div
            className={`px-4 py-2 rounded-xl font-black text-sm flex items-center gap-2 border shadow-xs transition-all ${
              direction === 'CALL'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-300 ring-2 ring-emerald-500/20'
                : 'bg-rose-50 text-rose-800 border-rose-300 ring-2 ring-rose-500/20'
            }`}
          >
            {direction === 'CALL' ? (
              <>
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <ArrowUpRight className="w-5 h-5 text-emerald-600 stroke-[3]" />
                <span>صعود 🟢 ⬆️ (CALL)</span>
              </>
            ) : (
              <>
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
                <ArrowDownRight className="w-5 h-5 text-rose-600 stroke-[3]" />
                <span>هبوط 🔴 ⬇️ (PUT)</span>
              </>
            )}
          </div>
        </div>

        <form onSubmit={handleSendLiveSignal} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* 1. قائمة منسدلة للأزواج الستة الرئيسية */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700">
                1. اختيار زوج العملة (الستة أزواج الرئيسية المعتمدة):
              </label>
              <div className="relative">
                <select
                  value={selectedPair}
                  onChange={(e) => setSelectedPair(e.target.value)}
                  className="w-full px-4 py-3.5 pr-12 rounded-xl border-2 border-slate-200 bg-slate-50 text-slate-900 font-black text-base focus:border-rose-500 focus:bg-white focus:outline-hidden transition-colors cursor-pointer appearance-none"
                >
                  {MAJOR_6_PAIRS.map((item) => (
                    <option key={item.pair} value={item.pair}>
                      {item.flag1} {item.flag2} {item.label}
                    </option>
                  ))}
                </select>
                <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-xl">
                  {selectedPairObj.flag1}
                </div>
              </div>
              <div className="text-[11px] text-slate-500 flex items-center justify-between px-1">
                <span>سوق عالمي فوري بدون انقطاع</span>
                <span className="font-bold text-slate-700">
                  فريم التحليل: 1 دقيقة (M1)
                </span>
              </div>
            </div>

            {/* 2. قائمة منسدلة لاتجاه الصفقة (هبوط 🔴 أو صعود 🟢) */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700">
                2. اتجاه الصفقة (هبوط أو صعود مع الرمز التوضيحي):
              </label>
              <div className="relative">
                <select
                  value={direction}
                  onChange={(e) => setDirection(e.target.value as 'CALL' | 'PUT')}
                  className={`w-full px-4 py-3.5 pr-12 rounded-xl border-2 font-black text-base focus:outline-hidden transition-all cursor-pointer appearance-none ${
                    direction === 'CALL'
                      ? 'border-emerald-400 bg-emerald-50/60 text-emerald-950 focus:border-emerald-600'
                      : 'border-rose-400 bg-rose-50/60 text-rose-950 focus:border-rose-600'
                  }`}
                >
                  <option value="CALL">🟢 ⬆️ صعود (CALL / شراء)</option>
                  <option value="PUT">🔴 ⬇️ هبوط (PUT / بيع)</option>
                </select>
                <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
                  {direction === 'CALL' ? (
                    <ArrowUpRight className="w-6 h-6 text-emerald-600 stroke-[3]" />
                  ) : (
                    <ArrowDownRight className="w-6 h-6 text-rose-600 stroke-[3]" />
                  )}
                </div>
              </div>

              {/* Quick toggle buttons beside dropdown */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setDirection('CALL')}
                  className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer border ${
                    direction === 'CALL'
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                      : 'bg-white text-emerald-800 border-emerald-200 hover:bg-emerald-50'
                  }`}
                >
                  <span>🟢</span>
                  <span>صعود (CALL)</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setDirection('PUT')}
                  className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer border ${
                    direction === 'PUT'
                      ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                      : 'bg-white text-rose-800 border-rose-200 hover:bg-rose-50'
                  }`}
                >
                  <span>🔴</span>
                  <span>هبوط (PUT)</span>
                  <ArrowDownRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* 3. مربعات الاختيار بعلامة صح لتفعيل أحد البوتين أو الاثنين معاً */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <div className="text-xs font-bold text-slate-800 flex items-center gap-2">
              <Layers className="w-4 h-4 text-rose-600" />
              <span>3. تحديد وجهة البث (اختر أحد البوتين أو كلاهما معاً):</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Free Bot Checkbox */}
              <label
                className={`flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer select-none transition-all ${
                  targetFreeBot
                    ? 'bg-emerald-50/80 border-emerald-300 text-emerald-950 font-bold shadow-xs'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100/60'
                }`}
              >
                <input
                  type="checkbox"
                  checked={targetFreeBot}
                  onChange={(e) => setTargetFreeBot(e.target.checked)}
                  className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                />
                <div className="flex-1">
                  <div className="text-xs font-extrabold flex items-center gap-1.5">
                    <Bot className="w-4 h-4 text-emerald-600" />
                    <span>بوت القناة العامة المجانية</span>
                  </div>
                  <div className="text-[10px] text-slate-500 font-normal">@ZadNBFX</div>
                </div>
              </label>

              {/* VIP Bot Checkbox */}
              <label
                className={`flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer select-none transition-all ${
                  targetVipBot
                    ? 'bg-amber-50/80 border-amber-300 text-amber-950 font-bold shadow-xs'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100/60'
                }`}
              >
                <input
                  type="checkbox"
                  checked={targetVipBot}
                  onChange={(e) => setTargetVipBot(e.target.checked)}
                  className="w-4 h-4 text-amber-600 rounded border-slate-300 focus:ring-amber-500 cursor-pointer"
                />
                <div className="flex-1">
                  <div className="text-xs font-extrabold flex items-center gap-1.5">
                    <Crown className="w-4 h-4 text-amber-600" />
                    <span>بوت القناة الخاصة VIP</span>
                  </div>
                  <div className="text-[10px] text-slate-500 font-normal">Abusalim FX VIP</div>
                </div>
              </label>

              {/* Floating Robot Checkbox */}
              <label
                className={`flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer select-none transition-all ${
                  targetFloatingRobot
                    ? 'bg-sky-50/80 border-sky-300 text-sky-950 font-bold shadow-xs'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100/60'
                }`}
              >
                <input
                  type="checkbox"
                  checked={targetFloatingRobot}
                  onChange={(e) => setTargetFloatingRobot(e.target.checked)}
                  className="w-4 h-4 text-sky-600 rounded border-slate-300 focus:ring-sky-500 cursor-pointer"
                />
                <div className="flex-1">
                  <div className="text-xs font-extrabold flex items-center gap-1.5">
                    <Monitor className="w-4 h-4 text-sky-600" />
                    <span>الروبوت العائم في المنصة</span>
                  </div>
                  <div className="text-[10px] text-slate-500 font-normal">يصل فوراً لشاشة المشتركين</div>
                </div>
              </label>
            </div>
          </div>

          {/* 4. المربع النصي لكتابة ما يراه المشرف */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-slate-700">
                4. ملاحظات وتوجيهات المشرف المباشرة (اكتب ما تراه مناسباً للإشارة):
              </label>
              <span className="text-[11px] text-slate-500">اختياري - يظهر داخل رسالة البث</span>
            </div>
            <textarea
              value={customNotes}
              onChange={(e) => setCustomNotes(e.target.value)}
              rows={3}
              placeholder="مثال: يرجى انتظار إغلاق الشمعة الحالية عند الدقيقة 42 والدخول مع بداية الشمعة الجديدة، هدف الصفقة ارتدادي مع إدارة رأس مال 1%..."
              className="w-full p-3.5 rounded-xl border-2 border-slate-200 bg-slate-50 text-slate-900 text-sm font-medium focus:border-rose-500 focus:bg-white focus:outline-hidden transition-all resize-y"
            />

            {/* Quick Presets */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[10px] text-slate-500 font-bold ml-1">تعبئة سريعة:</span>
              {PRESET_NOTES.map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setCustomNotes(preset)}
                  className="px-2 py-1 rounded-md text-[11px] bg-slate-100 hover:bg-rose-50 hover:text-rose-700 text-slate-700 border border-slate-200 transition-colors cursor-pointer"
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          {/* Feedback Banner */}
          {signalFeedback && (
            <div
              className={`p-4 rounded-xl text-xs font-bold flex items-start gap-2.5 animate-fadeIn ${
                signalFeedback.type === 'success'
                  ? 'bg-emerald-50 text-emerald-900 border border-emerald-300'
                  : 'bg-rose-50 text-rose-900 border border-rose-300'
              }`}
            >
              {signalFeedback.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              )}
              <div className="space-y-0.5">
                <div>{signalFeedback.text}</div>
                {signalFeedback.details && (
                  <div className="text-[11px] font-normal text-emerald-800">
                    {signalFeedback.details}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Action Send Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isSendingSignal}
              className={`w-full py-4 px-6 rounded-xl font-black text-base flex items-center justify-center gap-2.5 shadow-lg transition-all cursor-pointer text-white ${
                direction === 'CALL'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-emerald-500/20'
                  : 'bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 shadow-rose-500/20'
              } ${isSendingSignal ? 'opacity-70 cursor-not-allowed' : 'hover:scale-[1.01] active:scale-[0.99]'}`}
            >
              {isSendingSignal ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  <span>جاري إرسال إشارة البث الحي الآن...</span>
                </>
              ) : (
                <>
                  <Send className="w-5 h-5" />
                  <span>
                    إرسال إشارة {selectedPair} ({direction === 'CALL' ? 'صعود 🟢' : 'هبوط 🔴'}) إلى البوتات المحددة والروبوت العائم 🚀
                  </span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* ========================================================
          SECTION 2: صناديق النتائج السريعة والمباركة للمشاركين
          ======================================================== */}
      <div className="bg-slate-900 text-white border-2 border-slate-800 rounded-2xl shadow-xl p-6 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30 font-bold">
              02
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-extrabold text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-400" />
                <span>صناديق النتائج السريعة والمباركة للمشاركين</span>
              </h2>
              <p className="text-xs text-slate-400">
                صناديق جاهزة ومستقلة لإرسال رسائل الفوز والربح أو التنبيه والتعويض أو إنهاء البث الحي فوراً
              </p>
            </div>
          </div>

          {/* Bot destination toggles for announcements */}
          <div className="flex items-center gap-2 bg-slate-800/90 p-2 rounded-xl border border-slate-700 text-xs">
            <span className="text-[11px] text-slate-400 ml-1">إرسال النتائج إلى:</span>
            <label className="flex items-center gap-1.5 cursor-pointer font-bold text-emerald-400">
              <input
                type="checkbox"
                checked={announcementFreeBot}
                onChange={(e) => setAnnouncementFreeBot(e.target.checked)}
                className="rounded border-slate-600 cursor-pointer"
              />
              <span>العامة 📢</span>
            </label>
            <span className="text-slate-600">|</span>
            <label className="flex items-center gap-1.5 cursor-pointer font-bold text-amber-400">
              <input
                type="checkbox"
                checked={announcementVipBot}
                onChange={(e) => setAnnouncementVipBot(e.target.checked)}
                className="rounded border-slate-600 cursor-pointer"
              />
              <span>VIP 👑</span>
            </label>
          </div>
        </div>

        {/* Global Announcement Feedback */}
        {announcementFeedback && (
          <div
            className={`p-4 rounded-xl text-xs font-bold flex items-center gap-2.5 animate-fadeIn ${
              announcementFeedback.type === 'success'
                ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/40'
                : 'bg-rose-500/20 text-rose-200 border border-rose-500/40'
            }`}
          >
            {announcementFeedback.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
            )}
            <span>{announcementFeedback.text}</span>
          </div>
        )}

        {/* The 3 Ready Boxes with Independent Controls */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* BOX A: رسالة الفوز والربح والمباركة */}
          <div className="p-5 bg-slate-800/80 border-2 border-emerald-500/40 rounded-2xl flex flex-col justify-between space-y-4 hover:border-emerald-400 transition-all">
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-700">
                <div className="flex items-center gap-2 text-emerald-400 font-extrabold text-sm">
                  <Award className="w-5 h-5 text-emerald-400" />
                  <span>صندوق مباركة الفوز والربح</span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold">
                  WIN 🟢
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                رسالة مجهزة مسبقاً لمباركة الأرباح للأعضاء الذين شاركوا ودخلوا في البث:
              </p>
              <textarea
                value={winMessage}
                onChange={(e) => setWinMessage(e.target.value)}
                rows={5}
                className="w-full p-3 rounded-xl bg-slate-900 border border-slate-700 text-emerald-200 text-xs font-medium focus:border-emerald-500 focus:outline-hidden transition-all resize-y"
              />
            </div>

            <button
              type="button"
              disabled={isSendingAnnouncement === 'win'}
              onClick={() => handleSendAnnouncement('win', winMessage)}
              className="w-full py-3 px-4 rounded-xl font-black text-xs sm:text-sm bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-md shadow-emerald-500/20 flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-95 disabled:opacity-60"
            >
              {isSendingAnnouncement === 'win' ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>جاري الإرسال للبوت...</span>
                </>
              ) : (
                <>
                  <Award className="w-4 h-4" />
                  <span>🎉 إرسال مباركة الفوز والربح فوراً</span>
                </>
              )}
            </button>
          </div>

          {/* BOX B: رسالة الخسارة أو التعويض والتنبيه */}
          <div className="p-5 bg-slate-800/80 border-2 border-amber-500/40 rounded-2xl flex flex-col justify-between space-y-4 hover:border-amber-400 transition-all">
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-700">
                <div className="flex items-center gap-2 text-amber-400 font-extrabold text-sm">
                  <AlertCircle className="w-5 h-5 text-amber-400" />
                  <span>صندوق التنبيه والفرصة التعويضية</span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
                  NOTICE ⚠️
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                تنبيه وتوجيه للمشاركين في حالة ارتداد الصفقة وتأكيد خطة إدارة المخاطر:
              </p>
              <textarea
                value={lossMessage}
                onChange={(e) => setLossMessage(e.target.value)}
                rows={5}
                className="w-full p-3 rounded-xl bg-slate-900 border border-slate-700 text-amber-200 text-xs font-medium focus:border-amber-500 focus:outline-hidden transition-all resize-y"
              />
            </div>

            <button
              type="button"
              disabled={isSendingAnnouncement === 'loss'}
              onClick={() => handleSendAnnouncement('loss', lossMessage)}
              className="w-full py-3 px-4 rounded-xl font-black text-xs sm:text-sm bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white shadow-md shadow-amber-500/20 flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-95 disabled:opacity-60"
            >
              {isSendingAnnouncement === 'loss' ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>جاري الإرسال للبوت...</span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-4 h-4" />
                  <span>⚠️ إرسال إشعار التنبيه والتعويض</span>
                </>
              )}
            </button>
          </div>

          {/* BOX C: رسالة اختتام البث الحي والشكر */}
          <div className="p-5 bg-slate-800/80 border-2 border-sky-500/40 rounded-2xl flex flex-col justify-between space-y-4 hover:border-sky-400 transition-all">
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-700">
                <div className="flex items-center gap-2 text-sky-400 font-extrabold text-sm">
                  <Clock className="w-5 h-5 text-sky-400" />
                  <span>صندوق ختام البث الحي والشكر</span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30 font-bold">
                  CLOSING 🔴
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                إشعار رسمي بانتهاء جلسة البث الحي المباشر وشكر كل من شارك:
              </p>
              <textarea
                value={closingMessage}
                onChange={(e) => setClosingMessage(e.target.value)}
                rows={5}
                className="w-full p-3 rounded-xl bg-slate-900 border border-slate-700 text-sky-200 text-xs font-medium focus:border-sky-500 focus:outline-hidden transition-all resize-y"
              />
            </div>

            <button
              type="button"
              disabled={isSendingAnnouncement === 'closing'}
              onClick={() => handleSendAnnouncement('closing', closingMessage)}
              className="w-full py-3 px-4 rounded-xl font-black text-xs sm:text-sm bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white shadow-md shadow-sky-500/20 flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-95 disabled:opacity-60"
            >
              {isSendingAnnouncement === 'closing' ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>جاري الإرسال للبوت...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>📢 إرسال إشعار اختتام البث الحي</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* BOX D: رسالة مخصصة حرة للمشرف */}
        <div className="pt-4 border-t border-slate-800">
          <div className="p-4 bg-slate-800/50 border border-slate-700 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-purple-400" />
                <span>رسالة إدارية حرة للمشاركين (اكتب أي إشعار فوري):</span>
              </span>
              <span className="text-[10px] text-slate-500">تصل مباشرة للبوتات المحددة بالأعلى</span>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={customAnnouncement}
                onChange={(e) => setCustomAnnouncement(e.target.value)}
                placeholder="اكتب هنا أي رسالة عاجلة، تنبيه صفقات، إعلان مهم للمشاركين في البث..."
                className="flex-1 px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs font-medium focus:border-purple-500 focus:outline-hidden transition-all"
              />
              <button
                type="button"
                disabled={isSendingAnnouncement === 'custom' || !customAnnouncement.trim()}
                onClick={() => handleSendAnnouncement('custom', customAnnouncement)}
                className="px-5 py-2.5 rounded-xl font-bold text-xs bg-purple-600 hover:bg-purple-500 text-white flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
              >
                {isSendingAnnouncement === 'custom' ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                <span>إرسال الرسالة</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ZadtooAdminLiveBroadcast;
