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
  createdAt: string;
  updatedAt: string;
}

export const INITIAL_WEEKLY_FOREX_NEWS: ForexNewsItem[] = [
  {
    id: 'news-fomc-rate',
    title: 'قرار أسعار الفائدة الصادر عن البنك الفيدرالي الأمريكي (FOMC)',
    currency: 'USD',
    impact: 'high',
    category: 'أسعار الفائدة',
    eventDate: '2026-10-28',
    eventDayArabic: 'الأربعاء',
    timeGmt: '18:00',
    timeCairo: '20:00',
    timeMecca: '21:00',
    targetEpochMs: new Date('2026-10-28T18:00:00Z').getTime(),
    previous: '5.00%',
    forecast: '4.75%',
    actual: '',
    expectedImpact: 'usd_bearish',
    expectedMoveSummary: 'التوقعات تشير لخفض الفائدة 25 نقطة أساس، مما يضغط على الدولار الأمريكي بالهبوط ويمنح الذهب واليورو دفعة صعودية قوية.',
    recommendation: {
      pair: 'GOLD (XAU/USD)',
      action: 'BUY',
      entryStrategy: 'شراء مع اختراق مستويات المقاومة الفورية وتأكيد سلبية الدولار الأمريكي'
    },
    isBroadcasted: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'news-ecb-rate',
    title: 'قرار أسعار الفائدة للبنك المركزي الأوروبي (ECB Interest Rate Decision)',
    currency: 'EUR',
    impact: 'high',
    category: 'أسعار الفائدة',
    eventDate: '2026-10-29',
    eventDayArabic: 'الخميس',
    timeGmt: '12:15',
    timeCairo: '15:15', // 3:15 عصرًا بتوقيت مصر
    timeMecca: '16:15',
    targetEpochMs: new Date('2026-10-29T12:15:00Z').getTime(),
    previous: '3.40%',
    forecast: '3.25%',
    actual: '',
    expectedImpact: 'currency_bearish',
    expectedMoveSummary: 'قرار البنك المركزي الأوروبي بشأن أسعار الفائدة (3:15 عصراً بتوقيت مصر). خفض الفائدة يضغط على عملة اليورو سلبياً بالهبوط، والزوج المباشر والأقوى تأثراً هو اليورو مقابل الدولار (EUR/USD هبوط 🔴).',
    recommendation: {
      pair: 'EUR/USD',
      action: 'SELL',
      entryStrategy: 'بيع زوج اليورو/دولار (EUR/USD هبوط 🔴) مع كسر الدعم وتأكيد سلبية خفض الفائدة'
    },
    isBroadcasted: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'news-ecb-lagarde-conference',
    title: 'مؤتمر كريستين لاغارد الصحفي - رئيس البنك المركزي الأوروبي (ECB Press Conference)',
    currency: 'EUR',
    impact: 'high',
    category: 'المؤتمرات الصحفية',
    eventDate: '2026-10-29',
    eventDayArabic: 'الخميس',
    timeGmt: '12:45',
    timeCairo: '15:45', // 3:45 عصرًا بتوقيت مصر
    timeMecca: '16:45',
    targetEpochMs: new Date('2026-10-29T12:45:00Z').getTime(),
    previous: '',
    forecast: '',
    actual: '',
    expectedImpact: 'currency_bearish',
    expectedMoveSummary: 'مؤتمر صحفي واقتصادي حي للسيدة كريستين لاغارد (3:45 عصراً بتوقيت مصر). النبرة التيسيرية واستمرار خفض الفائدة تواصل الضغط الهبوطي على اليورو أمام الدولار (EUR/USD هبوط 🔴). لا توجد أرقام إحصائية مسبقة للخطاب.',
    recommendation: {
      pair: 'EUR/USD',
      action: 'SELL',
      entryStrategy: 'بيع زوج اليورو/دولار (EUR/USD هبوط 🔴) لمواكبة استمرار الضغط السلبي على اليورو خلال المؤتمر الصحفي'
    },
    isBroadcasted: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'news-us-cpi',
    title: 'مؤشر أسعار المستهلكين الأمريكي لشهر أكتوبر (US CPI Inflation Rate)',
    currency: 'USD',
    impact: 'high',
    category: 'التضخم',
    eventDate: '2026-11-10', // الموعد الرسمي القادم الصادر عن مكتب إحصاءات العمل الأمريكي
    eventDayArabic: 'الثلاثاء',
    timeGmt: '13:30',
    timeCairo: '15:30',
    timeMecca: '16:30',
    targetEpochMs: new Date('2026-11-10T13:30:00Z').getTime(),
    previous: '2.4%',
    forecast: '2.3%',
    actual: '',
    expectedImpact: 'usd_bullish',
    expectedMoveSummary: 'الموعد الرسمي القادم لمؤشر تضخم أسعار المستهلكين الأمريكي لشهر أكتوبر وفق جدول مكتب إحصاءات العمل الأمريكي (10 نوفمبر 2026).',
    recommendation: {
      pair: 'USD/JPY',
      action: 'BUY',
      entryStrategy: 'شراء الدولار مقابل الين مع افتتاح شمعة الخبر في حال تجاوز التضخم للتوقعات'
    },
    isBroadcasted: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'news-us-nfp',
    title: 'تقرير التوظيف والوظائف غير الزراعية الأمريكية (US NFP)',
    currency: 'USD',
    impact: 'high',
    category: 'الوظائف والبطالة',
    eventDate: '2026-10-30',
    eventDayArabic: 'الجمعة',
    timeGmt: '12:30',
    timeCairo: '14:30',
    timeMecca: '15:30',
    targetEpochMs: new Date('2026-10-30T12:30:00Z').getTime(),
    previous: '254K',
    forecast: '115K',
    actual: '',
    expectedImpact: 'usd_bullish',
    expectedMoveSummary: 'صدور أرقام وظائف تفوق 120 ألف وظيفة سيعيد الثقة للاقتصاد الأمريكي ويدفع مؤشر الدولار (DXY) للصعود السريع.',
    recommendation: {
      pair: 'EUR/USD',
      action: 'SELL',
      entryStrategy: 'بيع زوج EUR/USD مع تأكيد شمعة الـ 5 دقائق الأولى بعد صدور تقرير الوظائف'
    },
    isBroadcasted: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'news-gbp-pmi',
    title: 'مؤشر مديري المشتريات للقطاع التصنيعي البريطاني (UK Manufacturing PMI)',
    currency: 'GBP',
    impact: 'medium',
    category: 'النشاط الاقتصادي',
    eventDate: '2026-10-27',
    eventDayArabic: 'الثلاثاء',
    timeGmt: '09:30',
    timeCairo: '11:30',
    timeMecca: '12:30',
    targetEpochMs: new Date('2026-10-27T09:30:00Z').getTime(),
    previous: '51.5',
    forecast: '50.9',
    actual: '',
    expectedImpact: 'currency_bullish',
    expectedMoveSummary: 'استمرار المؤشر فوق مستوى 50 نقطة يعزز قوة الجنيه الإسترليني ويدعم صعوده أمام الدولار والين.',
    recommendation: {
      pair: 'GBP/USD',
      action: 'BUY',
      entryStrategy: 'شراء الإسترليني/دولار مع ارتداد السعر من دعم شارت الدقيقة'
    },
    isBroadcasted: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'news-us-retail',
    title: 'مبيعات التجزئة الأمريكية الأساسية شهرياً (Core Retail Sales)',
    currency: 'USD',
    impact: 'high',
    category: 'الإنفاق الاستهلاكي',
    eventDate: '2026-10-30',
    eventDayArabic: 'الجمعة',
    timeGmt: '12:30',
    timeCairo: '14:30',
    timeMecca: '15:30',
    targetEpochMs: new Date('2026-10-30T12:30:00Z').getTime(),
    previous: '0.5%',
    forecast: '0.3%',
    actual: '',
    expectedImpact: 'usd_bullish',
    expectedMoveSummary: 'نمو إنفاق المستهلكين يعكس متانة الطلب المحلي الأمريكي ويدعم مكاسب الدولار.',
    recommendation: {
      pair: 'USD/CAD',
      action: 'BUY',
      entryStrategy: 'شراء الدولار/كندي مع اختراق القمة السابقة'
    },
    isBroadcasted: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];
