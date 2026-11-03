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

export const INITIAL_WEEKLY_FOREX_NEWS: ForexNewsItem[] = [
  {
    id: 'news-us-jolts-nov',
    title: 'فرص العمل ودوران العمالة الأمريكية (US JOLTs Job Openings)',
    currency: 'USD',
    impact: 'high',
    category: 'الوظائف والعمالة',
    eventDate: '2026-11-03',
    eventDayArabic: 'الثلاثاء',
    timeGmt: '15:00',
    timeCairo: '17:00',
    timeMecca: '18:00',
    targetEpochMs: new Date('2026-11-03T15:00:00Z').getTime(),
    previous: '8.04M',
    forecast: '7.98M',
    actual: '',
    expectedImpact: 'usd_bearish',
    expectedMoveSummary: 'انخفاض فرص العمل دون 7.9M يعكس تباطؤ وتيرة التوظيف ويضغط على مؤشر الدولار بالهبوط، مما يمنح الذهب واليورو دفعة صعودية قوية.',
    recommendation: {
      pair: 'GOLD (XAU/USD)',
      action: 'BUY',
      entryStrategy: 'شراء الذهب فور تأكيد تراجع أرقام فرص العمل الأمريكية دون التوقعات اللحظية'
    },
    isBroadcasted: false,
    autoFetched: true,
    source: 'التقويم الاقتصادي العالمي المعتمد',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'news-rba-rate-decision',
    title: 'قرار أسعار الفائدة وبيان السياسة النقدية للمركزي الأسترالي (RBA Interest Rate)',
    currency: 'AUD',
    impact: 'high',
    category: 'أسعار الفائدة',
    eventDate: '2026-11-03',
    eventDayArabic: 'الثلاثاء',
    timeGmt: '03:30',
    timeCairo: '05:30',
    timeMecca: '06:30',
    targetEpochMs: new Date('2026-11-03T03:30:00Z').getTime(),
    previous: '4.35%',
    forecast: '4.35%',
    actual: '4.35%',
    expectedImpact: 'currency_bullish',
    expectedMoveSummary: 'تثبيت الفائدة مع لهجة متشددة تؤكد الحذر من عودة التضخم تمنح الدولار الأسترالي زخماً صعودياً أمام الدولار الأمريكي.',
    recommendation: {
      pair: 'AUD/USD',
      action: 'BUY',
      entryStrategy: 'شراء زوج الأسترالي/دولار مع اختراق المقاومة اللحظية وتأكيد ثبات الفائدة'
    },
    isBroadcasted: false,
    autoFetched: true,
    source: 'التقويم الاقتصادي العالمي المعتمد',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'news-us-adp-employment',
    title: 'تقرير التوظيف بالقطاع الخاص الأمريكي (ADP Non-Farm Employment Change)',
    currency: 'USD',
    impact: 'high',
    category: 'الوظائف والعمالة',
    eventDate: '2026-11-04',
    eventDayArabic: 'الأربعاء',
    timeGmt: '13:15',
    timeCairo: '15:15',
    timeMecca: '16:15',
    targetEpochMs: new Date('2026-11-04T13:15:00Z').getTime(),
    previous: '143K',
    forecast: '150K',
    actual: '',
    expectedImpact: 'usd_bullish',
    expectedMoveSummary: 'المؤشر الاستباقي الرئيسي لتقرير الوظائف غير الزراعية NFP. أي قراءة تتجاوز 155 ألف وظيفة ستعزز قوة الدولار وتضغط على اليورو والذهب.',
    recommendation: {
      pair: 'USD/JPY',
      action: 'BUY',
      entryStrategy: 'شراء الدولار/ين فور صدور بيانات التوظيف بالقطاع الخاص أعلى من المتوقع'
    },
    isBroadcasted: false,
    autoFetched: true,
    source: 'التقويم الاقتصادي العالمي المعتمد',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'news-us-ism-services',
    title: 'مؤشر مديري المشتريات للقطاع الخدمي الأمريكي الصادر عن معهد ISM (Services PMI)',
    currency: 'USD',
    impact: 'high',
    category: 'النشاط الاقتصادي',
    eventDate: '2026-11-04',
    eventDayArabic: 'الأربعاء',
    timeGmt: '15:00',
    timeCairo: '17:00',
    timeMecca: '18:00',
    targetEpochMs: new Date('2026-11-04T15:00:00Z').getTime(),
    previous: '54.9',
    forecast: '53.8',
    actual: '',
    expectedImpact: 'usd_bullish',
    expectedMoveSummary: 'القطاع الخدمي يشكل أكثر من ثلثي الناتج الإجمالي الأمريكي. الحفاظ على وتيرة النمو فوق 53 يدعم قوة الدولار الأمريكي عالمياً.',
    recommendation: {
      pair: 'EUR/USD',
      action: 'SELL',
      entryStrategy: 'بيع زوج اليورو/دولار مع إعادة اختبار مستوى المقاومة بعد صدور بيانات الخدمات'
    },
    isBroadcasted: false,
    autoFetched: true,
    source: 'التقويم الاقتصادي العالمي المعتمد',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'news-boe-rate-decision',
    title: 'قرار أسعار الفائدة الصادر عن بنك إنجلترا المركزي (BoE Official Bank Rate)',
    currency: 'GBP',
    impact: 'high',
    category: 'أسعار الفائدة',
    eventDate: '2026-11-05',
    eventDayArabic: 'الخميس',
    timeGmt: '12:00',
    timeCairo: '14:00',
    timeMecca: '15:00',
    targetEpochMs: new Date('2026-11-05T12:00:00Z').getTime(),
    previous: '5.00%',
    forecast: '4.75%',
    actual: '',
    expectedImpact: 'currency_bearish',
    expectedMoveSummary: 'توقعات شبه إجماعية بخفض أسعار الفائدة البريطانية بمقدار 25 نقطة أساس إلى 4.75%، مما يضغط سلباً على الجنيه الإسترليني.',
    recommendation: {
      pair: 'GBP/USD',
      action: 'SELL',
      entryStrategy: 'بيع الجنيه الإسترليني مقابل الدولار مع كسر الدعم اللحظي وتأكيد قرار الخفض'
    },
    isBroadcasted: false,
    autoFetched: true,
    source: 'التقويم الاقتصادي العالمي المعتمد',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'news-us-initial-jobless',
    title: 'معدلات الشكاوى من البطالة الأمريكية الأسبوعية (US Initial Jobless Claims)',
    currency: 'USD',
    impact: 'high',
    category: 'الوظائف والبطالة',
    eventDate: '2026-11-05',
    eventDayArabic: 'الخميس',
    timeGmt: '13:30',
    timeCairo: '15:30',
    timeMecca: '16:30',
    targetEpochMs: new Date('2026-11-05T13:30:00Z').getTime(),
    previous: '216K',
    forecast: '220K',
    actual: '',
    expectedImpact: 'usd_bearish',
    expectedMoveSummary: 'مقياس أسبوعي مباشر لصحة سوق العمل الأمريكي، صدور قراءة أعلى من 222 ألف يضغط على الدولار بالهبوط الفوري.',
    recommendation: {
      pair: 'GOLD (XAU/USD)',
      action: 'BUY',
      entryStrategy: 'شراء الذهب مع شمعة الدقيقة الأولى في حال ارتفاع طلبات البطالة فوق التوقعات'
    },
    isBroadcasted: false,
    autoFetched: true,
    source: 'التقويم الاقتصادي العالمي المعتمد',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'news-fomc-rate-decision-nov',
    title: 'قرار أسعار الفائدة الصادر عن البنك الفيدرالي الأمريكي (FOMC Federal Funds Rate)',
    currency: 'USD',
    impact: 'high',
    category: 'أسعار الفائدة',
    eventDate: '2026-11-05',
    eventDayArabic: 'الخميس',
    timeGmt: '19:00',
    timeCairo: '21:00',
    timeMecca: '22:00',
    targetEpochMs: new Date('2026-11-05T19:00:00Z').getTime(),
    previous: '5.00%',
    forecast: '4.75%',
    actual: '',
    expectedImpact: 'usd_bearish',
    expectedMoveSummary: 'الحدث الأضخم لهذا الأسبوع! البنك الفيدرالي يتجه لخفض الفائدة 25 نقطة أساس لتصل 4.75%، متوقع انفجار صعودي لأسعار الذهب وهبوط للدولار.',
    recommendation: {
      pair: 'GOLD (XAU/USD)',
      action: 'BUY',
      entryStrategy: 'شراء قوي ومباشر للذهب مع صدور بيان الفائدة وتأكيد خفض الفائدة الأمريكية'
    },
    isBroadcasted: false,
    autoFetched: true,
    source: 'التقويم الاقتصادي العالمي المعتمد',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'news-fomc-powell-conference',
    title: 'المؤتمر الصحفي لرئيس الفيدرالي الأمريكي جيروم باول (FOMC Press Conference)',
    currency: 'USD',
    impact: 'high',
    category: 'المؤتمرات الصحفية',
    eventDate: '2026-11-05',
    eventDayArabic: 'الخميس',
    timeGmt: '19:30',
    timeCairo: '21:30',
    timeMecca: '22:30',
    targetEpochMs: new Date('2026-11-05T19:30:00Z').getTime(),
    previous: '-',
    forecast: '-',
    actual: '',
    expectedImpact: 'usd_bearish',
    expectedMoveSummary: 'تصريحات جيروم باول بشأن مستقبل التضخم والسياسة النقدية القادمة، أي لهجة تيسيرية ستمنح أزواج العملات ضد الدولار دفعة إضافية.',
    recommendation: {
      pair: 'EUR/USD',
      action: 'BUY',
      entryStrategy: 'شراء اليورو/دولار مع اختراق مستويات المقاومة أثناء المؤتمر الصحفي'
    },
    isBroadcasted: false,
    autoFetched: true,
    source: 'التقويم الاقتصادي العالمي المعتمد',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'news-us-nfp-nov',
    title: 'تقرير التوظيف بغير القطاع الزراعي ومعدل البطالة الأمريكي (US NFP & Unemployment)',
    currency: 'USD',
    impact: 'high',
    category: 'الوظائف والبطالة',
    eventDate: '2026-11-06',
    eventDayArabic: 'الجمعة',
    timeGmt: '13:30',
    timeCairo: '15:30',
    timeMecca: '16:30',
    targetEpochMs: new Date('2026-11-06T13:30:00Z').getTime(),
    previous: '254K',
    forecast: '113K',
    actual: '',
    expectedImpact: 'usd_bullish',
    expectedMoveSummary: 'تقرير NFP الأهم على الإطلاق. صدور رقم يفوق 130K وظيفة سيدعم ارتداد الدولار الأمريكي ويهبط باليورو والذهب.',
    recommendation: {
      pair: 'EUR/USD',
      action: 'SELL',
      entryStrategy: 'بيع زوج EUR/USD مع تأكيد أول شمعة 5 دقائق بعد الصدور في حال تفوق الأرقام على التوقعات'
    },
    isBroadcasted: false,
    autoFetched: true,
    source: 'التقويم الاقتصادي العالمي المعتمد',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'news-cad-employment-change',
    title: 'معدل التغير في التوظيف ومعدل البطالة الكندي (Canada Employment Change)',
    currency: 'CAD',
    impact: 'high',
    category: 'الوظائف والعمالة',
    eventDate: '2026-11-06',
    eventDayArabic: 'الجمعة',
    timeGmt: '13:30',
    timeCairo: '15:30',
    timeMecca: '16:30',
    targetEpochMs: new Date('2026-11-06T13:30:00Z').getTime(),
    previous: '46.7K',
    forecast: '27.5K',
    actual: '',
    expectedImpact: 'currency_bullish',
    expectedMoveSummary: 'صدور بيانات كندا بالتزامن مع NFP الأمريكي يولد فرص سكالبينج قوية على زوج USD/CAD.',
    recommendation: {
      pair: 'USD/CAD',
      action: 'BUY',
      entryStrategy: 'شراء USD/CAD مع تأكيد قوة بيانات الدولار وضعف أرقام التوظيف الكندية'
    },
    isBroadcasted: false,
    autoFetched: true,
    source: 'التقويم الاقتصادي العالمي المعتمد',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'news-us-cpi-nov',
    title: 'مؤشر أسعار المستهلكين الأمريكي السنوي والشهري (US CPI Inflation Rate)',
    currency: 'USD',
    impact: 'high',
    category: 'التضخم',
    eventDate: '2026-11-10',
    eventDayArabic: 'الثلاثاء',
    timeGmt: '13:30',
    timeCairo: '15:30',
    timeMecca: '16:30',
    targetEpochMs: new Date('2026-11-10T13:30:00Z').getTime(),
    previous: '2.4%',
    forecast: '2.3%',
    actual: '',
    expectedImpact: 'usd_bullish',
    expectedMoveSummary: 'مؤشر التضخم الرئيسي الذي يحدد قرارات الفيدرالي القادمة، تجاوزه 2.3% يعزز الدولار بشكل واسع.',
    recommendation: {
      pair: 'USD/JPY',
      action: 'BUY',
      entryStrategy: 'شراء الدولار/ين مع افتتاح شمعة الخبر عند بقاء التضخم أعلى من المستهدف'
    },
    isBroadcasted: false,
    autoFetched: true,
    source: 'التقويم الاقتصادي العالمي المعتمد',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'news-us-retail-sales-nov',
    title: 'مبيعات التجزئة الأمريكية الأساسية شهرياً (Core Retail Sales MoM)',
    currency: 'USD',
    impact: 'high',
    category: 'الإنفاق الاستهلاكي',
    eventDate: '2026-11-13',
    eventDayArabic: 'الجمعة',
    timeGmt: '13:30',
    timeCairo: '15:30',
    timeMecca: '16:30',
    targetEpochMs: new Date('2026-11-13T13:30:00Z').getTime(),
    previous: '0.5%',
    forecast: '0.3%',
    actual: '',
    expectedImpact: 'usd_bullish',
    expectedMoveSummary: 'نمو إنفاق المستهلكين يعكس قوة الاستهلاك الداخلي الأمريكي ويدعم مكاسب الدولار أمام العملات المقابلة.',
    recommendation: {
      pair: 'USD/CHF',
      action: 'BUY',
      entryStrategy: 'شراء الدولار/فرنك فور صدور مبيعات التجزئة أعلى من التوقعات'
    },
    isBroadcasted: false,
    autoFetched: true,
    source: 'التقويم الاقتصادي العالمي المعتمد',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];
