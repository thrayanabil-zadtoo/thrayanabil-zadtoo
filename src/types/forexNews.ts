export interface ForexNewsItem {
  id: string;
  title: string; // عنوان الخبر (e.g., قرار أسعار الفائدة الفيدرالية الأمريكية FOMC)
  currency: 'USD' | 'EUR' | 'GBP' | 'JPY' | 'CAD' | 'AUD' | 'CHF' | 'XAU'; // العملة المتأثرة
  impact: 'high' | 'medium' | 'low'; // درجة الأهمية: عالي الأهمية (أحمر), متوسط (برتقالي), منخفض (أخضر)
  category: string; // تصنيف: أسعار الفائدة, تضخم CPI, وظائف NFP, ناتج محلي GDP, مؤشر PMI, مبيعات التجزئة
  eventDate: string; // التاريخ YYYY-MM-DD
  eventDayArabic: string; // اليوم بالعربي: الإثنين, الثلاثاء, الأربعاء, الخميس, الجمعة
  timeGmt: string; // توقيت غرينتش (e.g., 18:00)
  timeCairo: string; // توقيت مصر / القاهرة (e.g., 20:00)
  timeMecca: string; // توقيت مكة المكرمة (e.g., 21:00)
  targetEpochMs: number; // الوقت الإجمالي بالميلي ثانية للعد التنازلي والانتهاء التلقائي
  previous?: string; // القراءة السابقة (e.g., 5.00%)
  forecast?: string; // التوقع التقديري (e.g., 4.75%)
  actual?: string; // النتيجة الفعلية عند الصدور (e.g., 4.75%)
  expectedImpact: 'usd_bullish' | 'usd_bearish' | 'currency_bullish' | 'currency_bearish' | 'neutral';
  // توقع صعود أو هبوط الدولار أو العملة
  expectedMoveSummary: string; // شرح موجز لتأثير الخبر
  recommendation?: {
    pair: string; // الزوج الموصى به (e.g., EUR/USD, GOLD XAU/USD, USD/JPY)
    action: 'BUY' | 'SELL'; // شراء أو بيع
    entryStrategy: string; // استراتيجية الدخول
    stopLoss?: string;
    takeProfit?: string;
  };
  isBroadcasted?: boolean;
  broadcastedAt?: string;
  autoFetched?: boolean;
  source?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Calculates exact Cairo, Mecca, and GMT timings and target epoch from ISO date and GMT time string.
 */
export function calculateEventTimes(eventDate: string, timeGmt: string) {
  try {
    const [year, month, day] = eventDate.split('-').map(Number);
    const [hours, minutes] = timeGmt.split(':').map(Number);
    const dateObj = new Date(Date.UTC(year, month - 1, day, hours, minutes, 0));
    const targetEpochMs = dateObj.getTime();

    const fmtCairo = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Cairo',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(dateObj);

    const fmtMecca = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Riyadh',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(dateObj);

    const arabicDays = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    const eventDayArabic = arabicDays[dateObj.getUTCDay()] || 'اليوم';

    return {
      targetEpochMs,
      timeCairo: fmtCairo,
      timeMecca: fmtMecca,
      eventDayArabic
    };
  } catch (_e) {
    return {
      targetEpochMs: Date.now() + 3600000,
      timeCairo: '14:00',
      timeMecca: '15:00',
      eventDayArabic: 'اليوم'
    };
  }
}

/**
 * Filters out expired news items immediately at expiry (graceMs = 0 by default)
 * and replaces any banned USD/JPY pair recommendations.
 */
export function filterActiveForexNews(items: ForexNewsItem[], graceMs = 0): ForexNewsItem[] {
  const nowMs = Date.now();
  return items
    .filter(item => item && typeof item.targetEpochMs === 'number' && nowMs < item.targetEpochMs + graceMs)
    .map(item => {
      if (item.recommendation?.pair && (item.recommendation.pair.includes('USD/JPY') || item.recommendation.pair.includes('USDJPY'))) {
        return {
          ...item,
          recommendation: {
            ...item.recommendation,
            pair: 'GBP/JPY',
            entryStrategy: item.recommendation.entryStrategy.replace(/الدولار\/ين|USD\/JPY/gi, 'الباوند/ين (GBP/JPY)')
          }
        };
      }
      return item;
    })
    .sort((a, b) => a.targetEpochMs - b.targetEpochMs);
}

function buildCanonicalNewsItem(
  base: Omit<ForexNewsItem, 'timeCairo' | 'timeMecca' | 'targetEpochMs' | 'eventDayArabic' | 'createdAt' | 'updatedAt'>
): ForexNewsItem {
  const t = calculateEventTimes(base.eventDate, base.timeGmt);
  const nowIso = new Date().toISOString();
  return {
    ...base,
    timeCairo: t.timeCairo,
    timeMecca: t.timeMecca,
    targetEpochMs: t.targetEpochMs,
    eventDayArabic: t.eventDayArabic,
    createdAt: nowIso,
    updatedAt: nowIso
  };
}

export const INITIAL_WEEKLY_FOREX_NEWS: ForexNewsItem[] = [
  buildCanonicalNewsItem({
    id: 'news-mon-eur-trade-nov16',
    title: 'الميزان التجاري لمنطقة اليورو وتصريحات المركزي الأوروبي (Eurozone Trade Balance & ECB)',
    currency: 'EUR',
    impact: 'medium',
    category: 'التجارة والبنوك المركزية',
    eventDate: '2026-11-16',
    timeGmt: '10:00',
    previous: '11.0B',
    forecast: '12.4B',
    actual: '',
    expectedImpact: 'currency_bullish',
    expectedMoveSummary: 'تحسن فائض الميزان التجاري لمنطقة اليورو مع افتتاح الأسبوع يدعم قوة اليورو مقابل الدولار الأمريكي.',
    recommendation: {
      pair: 'EUR/USD',
      action: 'BUY',
      entryStrategy: 'شراء زوج EUR/USD مع تأكيد استقرار الشمعة فوق الدعم اللحظي وقت صدور البيانات الأوروبية'
    },
    isBroadcasted: false,
    autoFetched: true,
    source: 'التقويم الاقتصادي العالمي المعتمد'
  }),
  buildCanonicalNewsItem({
    id: 'news-mon-cad-housing-nov16',
    title: 'مبيعات الصناعات التحويلية الكندية وبداية المشاريع السكنية (Canada Manufacturing Sales)',
    currency: 'CAD',
    impact: 'medium',
    category: 'النشاط الاقتصادي',
    eventDate: '2026-11-16',
    timeGmt: '13:30',
    previous: '-1.3%',
    forecast: '-0.5%',
    actual: '',
    expectedImpact: 'currency_bullish',
    expectedMoveSummary: 'صدور قراءة أفضل من المتوقع للمبيعات الصناعية في كندا يمنح الدولار الكندي دعماً فورياً أمام الدولار الأمريكي.',
    recommendation: {
      pair: 'USD/CAD',
      action: 'SELL',
      entryStrategy: 'بيع زوج USD/CAD عند صدور القراءة الكندية إيجابية أعلى من التوقعات'
    },
    isBroadcasted: false,
    autoFetched: true,
    source: 'التقويم الاقتصادي العالمي المعتمد'
  }),
  buildCanonicalNewsItem({
    id: 'news-tue-rba-minutes-nov17',
    title: 'محضر اجتماع السياسة النقدية للبنك المركزي الأسترالي (RBA Monetary Policy Minutes)',
    currency: 'AUD',
    impact: 'high',
    category: 'السياسة النقدية',
    eventDate: '2026-11-17',
    timeGmt: '00:30',
    previous: '-',
    forecast: '-',
    actual: '',
    expectedImpact: 'currency_bullish',
    expectedMoveSummary: 'تفاصيل مناقشات المركزي الأسترالي حول التضخم والفائدة ترفع تقلبات زوج AUD/USD بقوة في بداية الجلسة.',
    recommendation: {
      pair: 'AUD/USD',
      action: 'BUY',
      entryStrategy: 'شراء زوج AUD/USD في حال تأكيد لهجة متشددة من المركزي الأسترالي في المحضر'
    },
    isBroadcasted: false,
    autoFetched: true,
    source: 'التقويم الاقتصادي العالمي المعتمد'
  }),
  buildCanonicalNewsItem({
    id: 'news-tue-us-retail-sales-nov17',
    title: 'مبيعات التجزئة الأمريكية الأساسية والكلية شهرياً (US Core & Retail Sales MoM)',
    currency: 'USD',
    impact: 'high',
    category: 'الإنفاق الاستهلاكي',
    eventDate: '2026-11-17',
    timeGmt: '13:30',
    previous: '0.4%',
    forecast: '0.3%',
    actual: '',
    expectedImpact: 'usd_bullish',
    expectedMoveSummary: 'محرك رئيسي للسيولة في النيويورك سيشن؛ تفوق مبيعات التجزئة على 0.3% يعزز الدولار ويهبط بالذهب واليورو.',
    recommendation: {
      pair: 'GOLD (XAU/USD)',
      action: 'SELL',
      entryStrategy: 'بيع الذهب أو EUR/USD مع كسر أول دعم عند صدور أرقام إنفاق استهلاكي أمريكية قوية'
    },
    isBroadcasted: false,
    autoFetched: true,
    source: 'التقويم الاقتصادي العالمي المعتمد'
  }),
  buildCanonicalNewsItem({
    id: 'news-wed-gbp-cpi-nov18',
    title: 'مؤشر أسعار المستهلكين البريطاني السنوي (UK CPI Inflation Rate YoY)',
    currency: 'GBP',
    impact: 'high',
    category: 'التضخم',
    eventDate: '2026-11-18',
    timeGmt: '07:00',
    previous: '1.7%',
    forecast: '2.2%',
    actual: '',
    expectedImpact: 'currency_bullish',
    expectedMoveSummary: 'بيانات التضخم البريطاني تحدد مسار فائدة بنك إنجلترا القادمة وتولد حركة سريعة على الباوند دولار والباوند ين.',
    recommendation: {
      pair: 'GBP/JPY',
      action: 'BUY',
      entryStrategy: 'شراء GBP/JPY مع تأكيد ارتفاع التضخم البريطاني فوق التقديرات اللحظية'
    },
    isBroadcasted: false,
    autoFetched: true,
    source: 'التقويم الاقتصادي العالمي المعتمد'
  }),
  buildCanonicalNewsItem({
    id: 'news-wed-eur-cpi-nov18',
    title: 'القراءة النهائية لمؤشر أسعار المستهلكين الأوروبي (Eurozone Final CPI YoY)',
    currency: 'EUR',
    impact: 'medium',
    category: 'التضخم',
    eventDate: '2026-11-18',
    timeGmt: '10:00',
    previous: '2.0%',
    forecast: '2.0%',
    actual: '',
    expectedImpact: 'currency_bullish',
    expectedMoveSummary: 'تأكيد استقرار التضخم الأوروبي عند المستهدف 2.0% يمنح توازناً وسرعة استجابة فنية لأزواج اليورو.',
    recommendation: {
      pair: 'EUR/JPY',
      action: 'BUY',
      entryStrategy: 'شراء EUR/JPY مع اختراق المقاومة اللحظية أثناء الجلسة الصباحية'
    },
    isBroadcasted: false,
    autoFetched: true,
    source: 'التقويم الاقتصادي العالمي المعتمد'
  }),
  buildCanonicalNewsItem({
    id: 'news-thu-us-jobless-claims-nov19',
    title: 'طلبات إعانة البطالة الأمريكية الأسبوعية ومؤشر فيلادلفيا الصناعي (US Jobless Claims & Philly Fed)',
    currency: 'USD',
    impact: 'high',
    category: 'الوظائف والبطالة',
    eventDate: '2026-11-19',
    timeGmt: '13:30',
    previous: '217K',
    forecast: '220K',
    actual: '',
    expectedImpact: 'usd_bearish',
    expectedMoveSummary: 'ارتفاع طلبات البطالة فوق 222K يضغط على الدولار الأمريكي فوراً ويدفع اليورو والذهب للصعود.',
    recommendation: {
      pair: 'EUR/USD',
      action: 'BUY',
      entryStrategy: 'شراء EUR/USD مع انطلاق شمعة الخبر في حال تجاوز شكاوى البطالة 220K'
    },
    isBroadcasted: false,
    autoFetched: true,
    source: 'التقويم الاقتصادي العالمي المعتمد'
  }),
  buildCanonicalNewsItem({
    id: 'news-fri-gbp-retail-pmi-nov20',
    title: 'مبيعات التجزئة البريطانية ومؤشرات مديري المشتريات الأوروبية والأمريكية (UK Retail & Flash PMI)',
    currency: 'GBP',
    impact: 'high',
    category: 'النشاط الاقتصادي والخدمات',
    eventDate: '2026-11-20',
    timeGmt: '09:30',
    previous: '51.8',
    forecast: '51.5',
    actual: '',
    expectedImpact: 'currency_bullish',
    expectedMoveSummary: 'يوم مؤشرات مديري المشتريات PMI العالمي في ختام الأسبوع يرفع الزخم والسيولة على الباوند واليورو.',
    recommendation: {
      pair: 'GBP/USD',
      action: 'BUY',
      entryStrategy: 'شراء GBP/USD عند صدور مؤشر PMI البريطاني فوق مستوى 51.5'
    },
    isBroadcasted: false,
    autoFetched: true,
    source: 'التقويم الاقتصادي العالمي المعتمد'
  }),
  buildCanonicalNewsItem({
    id: 'news-fri-us-flash-pmi-nov20',
    title: 'مؤشر مديري المشتريات الأمريكي التصنيعي والخدمي الأولي (US Flash Manufacturing & Services PMI)',
    currency: 'USD',
    impact: 'high',
    category: 'النشاط الاقتصادي',
    eventDate: '2026-11-20',
    timeGmt: '14:45',
    previous: '55.0',
    forecast: '55.2',
    actual: '',
    expectedImpact: 'usd_bullish',
    expectedMoveSummary: 'الخبر الختامي الأهم في الأسبوع؛ قراءة قوية لقطاع الخدمات الأمريكي تعزز الدولار أمام العملات.',
    recommendation: {
      pair: 'USD/CHF',
      action: 'BUY',
      entryStrategy: 'شراء USD/CHF عند صدور مؤشر PMI الخدمي الأمريكي أعلى من 55.2'
    },
    isBroadcasted: false,
    autoFetched: true,
    source: 'التقويم الاقتصادي العالمي المعتمد'
  })
];

