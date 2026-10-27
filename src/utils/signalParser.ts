export interface ParsedSignal {
  asset: string;
  isOtc: boolean;
  direction: 'CALL' | 'PUT';
  timeframe: string;
  entryMinute: string; // Strictly the minute (MM) since hours differ by timezone
  entryTime: string;   // Local HH:MM synced with device clock or ":MM"
  payout: string;
  removedItems: string[];
  livePrice?: string;
  rsiValue?: number;
  analysisReason?: string;
  superTrend?: string;
  fractalPattern?: string;
}

export interface FormatterOptions {
  channelTitle: string;
  channelSignature: string;
  templateStyle: 'elegant' | 'minimal' | 'pro' | 'custom';
  customTemplatePattern?: string;
  includeLiveAnalysis?: boolean;
  removeSourceMentions: boolean;
  removePromoLinks: boolean;
  removeMartingaleSteps: boolean;
  removePayoutInfo: boolean;
  blockedWords: string[];
}

export const DEFAULT_CUSTOM_TEMPLATE = `✨ {العنوان} ✨
━━━━━━━━━━━━━━
📊 الزوج: {الزوج_كامل}
⏱ المدة: {المدة}
⏰ وقت الدخول: الدقيقة :{الدقيقة} (حسب ساعة جهازك)
{الاتجاه}
📈 السعر: {السعر} | مؤشر RSI (9): {RSI}
🧭 سوبر تريند: {السوبر_تريند}
📐 الفركتال: {الفركتال}
━━━━━━━━━━━━━━
📢 قناتنا المجانية: @ZadNBFX
{التوقيع}`;

/**
 * Converts a directly edited final message into a reusable custom template pattern
 * so that any text edits inside "نص الرسالة النهائي" are saved directly and permanently
 * for all future manual and automated signals!
 */
export function convertEditedMessageToCustomPattern(
  editedText: string,
  parsed: ParsedSignal
): string {
  let pattern = editedText;
  const pairLabel = `${parsed.asset} (السوق العالمي 🌍)`;
  const minuteOnly = extractMinuteOnly(parsed.entryMinute || parsed.entryTime);
  const directionArabic =
    parsed.direction === 'CALL'
      ? '🟢 الاتجاه: صعود (شراء ⬆️)'
      : '🔴 الاتجاه: هبوط (بيع ⬇️)';
  const directionShort =
    parsed.direction === 'CALL'
      ? '🟢 صعود (شراء ⬆️)'
      : '🔴 هبوط (بيع ⬇️)';

  if (pairLabel && pattern.includes(pairLabel)) {
    pattern = pattern.split(pairLabel).join('{الزوج_كامل}');
  } else if (parsed.asset && pattern.includes(parsed.asset)) {
    pattern = pattern.split(parsed.asset).join('{الزوج}');
  }

  if (parsed.timeframe && pattern.includes(parsed.timeframe)) {
    pattern = pattern.split(parsed.timeframe).join('{المدة}');
  }

  if (minuteOnly && pattern.includes(`:${minuteOnly}`)) {
    pattern = pattern.split(`:${minuteOnly}`).join(':{الدقيقة}');
  }

  if (pattern.includes(directionArabic)) {
    pattern = pattern.split(directionArabic).join('{الاتجاه}');
  } else if (pattern.includes(directionShort)) {
    pattern = pattern.split(directionShort).join('{الاتجاه_مختصر}');
  }

  if (parsed.livePrice && pattern.includes(parsed.livePrice)) {
    pattern = pattern.split(parsed.livePrice).join('{السعر}');
  }

  if (parsed.rsiValue !== undefined && pattern.includes(`RSI: ${parsed.rsiValue}`)) {
    pattern = pattern.split(`RSI: ${parsed.rsiValue}`).join('RSI: {RSI}');
  }

  if (parsed.superTrend && pattern.includes(parsed.superTrend)) {
    pattern = pattern.split(parsed.superTrend).join('{السوبر_تريند}');
  }

  if (parsed.fractalPattern && pattern.includes(parsed.fractalPattern)) {
    pattern = pattern.split(parsed.fractalPattern).join('{الفركتال}');
  }

  if (parsed.analysisReason && pattern.includes(parsed.analysisReason)) {
    pattern = pattern.split(parsed.analysisReason).join('{السبب}');
  }

  return pattern;
}

export const GLOBAL_FOREX_PAIRS = [
  'EUR/USD',
  'GBP/USD',
  'USD/JPY',
  'GBP/JPY',
  'EUR/JPY',
  'AUD/USD',
  'USD/CHF',
  'USD/CAD',
  'EUR/GBP'
];

/**
 * Computes a local HH:MM string using the device's current hour and the target signal minute (MM).
 */
export function formatDeviceLocalTimeFromMinute(minuteStr: string): string {
  const cleanMin = minuteStr.replace(/[^0-9]/g, '').padStart(2, '0').slice(-2);
  const targetMin = parseInt(cleanMin, 10);
  const now = new Date();
  if (isNaN(targetMin)) {
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  }

  let hour = now.getHours();
  const currentMin = now.getMinutes();

  if (targetMin < currentMin && currentMin - targetMin > 45) {
    hour = (hour + 1) % 24;
  } else if (targetMin > currentMin && targetMin - currentMin > 45) {
    hour = (hour + 23) % 24;
  }

  return `${String(hour).padStart(2, '0')}:${String(targetMin).padStart(2, '0')}`;
}

export function extractMinuteOnly(timeOrMinute: string): string {
  if (!timeOrMinute) {
    const nextMin = new Date(Date.now() + 60000);
    return String(nextMin.getMinutes()).padStart(2, '0');
  }
  const colonMatch = timeOrMinute.match(/:([0-5]\d)/);
  if (colonMatch) {
    return colonMatch[1];
  }
  const digitsMatch = timeOrMinute.match(/\b([0-5]?\d)\b/);
  if (digitsMatch) {
    return digitsMatch[1].padStart(2, '0');
  }
  const nextMin = new Date(Date.now() + 60000);
  return String(nextMin.getMinutes()).padStart(2, '0');
}

export function parseRawQuotexSignal(rawText: string, options: FormatterOptions): ParsedSignal {
  const removedItems: string[] = [];
  const text = rawText || '';

  if (options.removeSourceMentions && /QuotexSignalsBot_M1|Quotex|@[A-Za-z0-9_]+/i.test(text)) {
    removedItems.push('معرف وحقوق البوت المصدر');
  }
  if (options.removePromoLinks && /(https?:\/\/[^\s]+|t\.me\/[^\s]+|Register|Sign\s*up|VIP|Bonus)/i.test(text)) {
    removedItems.push('روابط الإحالة والدعاية الترويجية');
  }
  if (options.removeMartingaleSteps && /(Gale|Martingale|1st\s*Gale|2nd\s*Gale|مضاعفة)/i.test(text)) {
    removedItems.push('سطور المضاعفات (Martingale / Gale)');
  }
  if (/\bOTC\b/i.test(text) || /أوتيسي|او تي سي/.test(text)) {
    removedItems.push('إشارة OTC (تم التحويل للسوق العالمي الرسمي فقط)');
  }

  // 1. Extract Asset Pair (Global Market Only)
  let detectedAsset = 'EUR/USD';
  const slashPairMatch = text.match(/\b([A-Z]{3})\s*[\/\-]\s*([A-Z]{3})\b/i);
  if (slashPairMatch) {
    detectedAsset = `${slashPairMatch[1].toUpperCase()}/${slashPairMatch[2].toUpperCase()}`;
  } else {
    const compactMatch = text.match(/\b(EURUSD|GBPUSD|USDJPY|USDCHF|AUDUSD|USDCAD|EURGBP|EURJPY|GBPJPY)\b/i);
    if (compactMatch) {
      const raw = compactMatch[1].toUpperCase();
      detectedAsset = `${raw.slice(0, 3)}/${raw.slice(3, 6)}`;
    } else {
      for (const pair of GLOBAL_FOREX_PAIRS) {
        if (text.toUpperCase().includes(pair)) {
          detectedAsset = pair;
          break;
        }
      }
    }
  }

  // Strictly Global Market Only (isOtc is always false)
  const isOtc = false;

  // 2. Detect Direction
  let direction: 'CALL' | 'PUT' = 'CALL';
  if (/\b(PUT|DOWN|SELL|LOWER|RED)\b/i.test(text) || /(🔴|⬇️|🔽|هبوط|بيع)/.test(text)) {
    direction = 'PUT';
  } else if (/\b(CALL|UP|BUY|HIGHER|GREEN)\b/i.test(text) || /(🟢|⬆️|🔼|صعود|شراء)/.test(text)) {
    direction = 'CALL';
  }

  // 3. Detect Timeframe
  let timeframe = '1 دقيقة (M1)';
  if (/\b(M5|5\s*Min|5\s*Minutes)\b/i.test(text) || /5 دقائق/.test(text)) {
    timeframe = '5 دقائق (M5)';
  } else if (/\b(M15|15\s*Min)\b/i.test(text) || /15 دقيقة/.test(text)) {
    timeframe = '15 دقيقة (M15)';
  }

  // 4. Extract ONLY the Minute (MM)
  let entryMinute = '';
  const lines = text.split('\n');
  for (const line of lines) {
    if (/(Gale|Martingale)/i.test(line)) continue;
    const timeMatch = line.match(/\b(?:[01]?\d|2[0-3]):([0-5]\d)\b/);
    if (timeMatch) {
      entryMinute = timeMatch[1];
      break;
    }
  }
  if (!entryMinute) {
    const anyTimeMatch = text.match(/\b(?:[01]?\d|2[0-3]):([0-5]\d)\b/);
    if (anyTimeMatch) {
      entryMinute = anyTimeMatch[1];
    } else {
      const nextMin = new Date(Date.now() + 60000);
      entryMinute = String(nextMin.getMinutes()).padStart(2, '0');
    }
  }

  const entryTime = formatDeviceLocalTimeFromMinute(entryMinute);

  // 5. Extract optional live price or RSI if present
  const priceMatch = text.match(/Price:\s*([0-9.]+)/i);
  const rsiMatch = text.match(/RSI:\s*([0-9.]+)/i);

  return {
    asset: detectedAsset,
    isOtc,
    direction,
    timeframe,
    entryMinute,
    entryTime,
    payout: 'السوق العالمي',
    removedItems,
    livePrice: priceMatch ? priceMatch[1] : undefined,
    rsiValue: rsiMatch ? parseFloat(rsiMatch[1]) : undefined
  };
}

export function formatSignalMessage(parsed: ParsedSignal, options: FormatterOptions): string {
  // Strictly Global Market (No OTC)
  const pairLabel = `${parsed.asset} (السوق العالمي 🌍)`;
  const minuteOnly = extractMinuteOnly(parsed.entryMinute || parsed.entryTime);

  const directionArabic = parsed.direction === 'CALL'
    ? '🟢 الاتجاه: صعود (شراء ⬆️)'
    : '🔴 الاتجاه: هبوط (بيع ⬇️)';

  const directionShort = parsed.direction === 'CALL'
    ? '🟢 صعود (شراء ⬆️)'
    : '🔴 هبوط (بيع ⬇️)';

  const showAnalysis = options.includeLiveAnalysis !== false;

  const liveDetailsLine =
    showAnalysis && parsed.livePrice
      ? `\n📈 السعر: ${parsed.livePrice}${parsed.rsiValue !== undefined ? ` | مؤشر RSI (9): ${parsed.rsiValue}` : ''}${parsed.superTrend ? `\n🧭 سوبر تريند: ${parsed.superTrend}` : ''}${parsed.fractalPattern ? `\n📐 الفركتال: ${parsed.fractalPattern}` : ''}`
      : '';

  const reasonLine =
    showAnalysis && parsed.analysisReason
      ? `\n🎯 سبب الدخول: ${parsed.analysisReason}`
      : '';

  let output = '';

  if (options.templateStyle === 'custom' && options.customTemplatePattern?.trim()) {
    output = options.customTemplatePattern
      .replace(/\{العنوان\}/g, options.channelTitle || 'نَبض التداول | السوق العالمي')
      .replace(/\{الزوج\}/g, parsed.asset)
      .replace(/\{الزوج_كامل\}/g, pairLabel)
      .replace(/\{المدة\}/g, parsed.timeframe)
      .replace(/\{الدقيقة\}/g, minuteOnly)
      .replace(/\{الوقت\}/g, parsed.entryTime)
      .replace(/\{الاتجاه\}/g, directionArabic)
      .replace(/\{الاتجاه_مختصر\}/g, directionShort)
      .replace(/\{السعر\}/g, parsed.livePrice || '')
      .replace(/\{RSI\}/g, parsed.rsiValue !== undefined ? String(parsed.rsiValue) : '')
      .replace(/\{السوبر_تريند\}/g, parsed.superTrend || '')
      .replace(/\{الفركتال\}/g, parsed.fractalPattern || '')
      .replace(/\{السبب\}/g, parsed.analysisReason || '')
      .replace(/\{التوقيع\}/g, options.channelSignature || '');
  } else if (options.templateStyle === 'elegant') {
    output = `✨ ${options.channelTitle || 'نَبض التداول | السوق العالمي'} ✨
━━━━━━━━━━━━━━
📊 الزوج: ${pairLabel}
⏱ المدة: ${parsed.timeframe}
⏰ وقت الدخول: الدقيقة :${minuteOnly} (حسب ساعة جهازك)
${directionArabic}${liveDetailsLine}${reasonLine}
━━━━━━━━━━━━━━
📢 قناتنا المجانية: @ZadNBFX
${options.channelSignature || '💡 نركز على الفرص القوية فقط — التزم بإدارة رأس المال'}`;
  } else if (options.templateStyle === 'minimal') {
    output = `⚡ فرصة مركّزة (سوق عالمي) | ${parsed.asset}
• الاتجاه: ${directionShort}
• المدة: ${parsed.timeframe}
• الدخول عند الدقيقة: :${minuteOnly} (بتوقيت جهازك)${liveDetailsLine}${reasonLine}

📢 تابعنا مجاناً: @ZadNBFX
${options.channelSignature || '💡 التزم بإدارة رأس المال الحكيمة'}`;
  } else {
    output = `🎯 قناص السوق العالمي | ${options.channelTitle || 'فرصة مؤكدة'}
┌───────────────────
│ 🌍 الزوج: ${parsed.asset} (سوق عالمي)
│ ⏳ الفريم: ${parsed.timeframe}
│ 🕒 الدخول: الدقيقة :${minuteOnly} (بتوقيتك)
│ 🚀 القرار: ${directionShort}${liveDetailsLine ? `\n│ 📊 السعر: ${parsed.livePrice}` : ''}
└───────────────────
📢 القناة المجانية: @ZadNBFX
${options.channelSignature || '💡 إدارة رأس المال سر النجاح'}`;
  }

  for (const word of options.blockedWords) {
    if (word.trim()) {
      const escaped = word.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      output = output.replace(new RegExp(escaped, 'gi'), '');
    }
  }

  return output.trim();
}

/**
 * Appends or updates the concise result line at the bottom of the original signal message
 * Supports direct win (✅), 1st martingale win (✅ ربح مضاعفة واحدة), and single loss (❌).
 */
export function appendResultToSignalMessage(
  baseMessage: string,
  status: 'WIN' | 'WIN_GALE1' | 'LOSS' | 'DRAW' | 'PENDING',
  _exitPrice?: string,
  customResultLine?: string
): string {
  // Strip any previous result line if updating again
  const cleaned = baseMessage
    .replace(/\n*━━━━━━━━━━━━━━\n📌 النتيجة:[\s\S]*$/g, '')
    .replace(/\n*━━━━━━━━━━━━━━\n[\s\S]*$/g, (match) => {
      // Only strip the trailing separator block if it is the result block (not the signature block)
      if (match.includes('📢') || match.includes('💡')) return match;
      return '';
    })
    .replace(/\n*📌 النتيجة:[\s\S]*$/g, '')
    .replace(/\n*(?:✅|❌|⚖️)[^\n]*$/g, '')
    .trim();

  if (status === 'PENDING') {
    return cleaned;
  }

  const defaultResultLine =
    status === 'WIN'
      ? '✅ ربح'
      : status === 'WIN_GALE1'
      ? '✅ ربح مضاعفة واحدة'
      : status === 'LOSS'
      ? '❌'
      : '⚖️';

  const resultLine = (customResultLine && customResultLine.trim()) || defaultResultLine;

  return `${cleaned}\n━━━━━━━━━━━━━━\n${resultLine}`;
}

export const SAMPLE_QUOTEX_SIGNALS = [
  {
    label: 'إشارة EUR/USD صعود (سوق عالمي)',
    raw: `🌍 GLOBAL MARKET SIGNAL
Asset: EUR/USD
Expiration: M1 (1 Minute)
Entry Time: 16:20
Direction: 🟢 CALL (UP)
Price: 1.08450 | RSI: 24.5`
  },
  {
    label: 'إشارة GBP/JPY هبوط (سوق عالمي)',
    raw: `🌍 GLOBAL MARKET SIGNAL
Pair: GBP/JPY
Time: 16:45
Expiration: 1 Min
Action: 🔴 PUT / DOWN ⬇️
Price: 193.420 | RSI: 76.2`
  },
  {
    label: 'إشارة USD/JPY صعود (سوق عالمي)',
    raw: `🌍 GLOBAL MARKET SIGNAL
Currency: USD/JPY
Timeframe: M1
Clock: 17:10
Signal: GREEN / UP 🟢
Price: 149.850 | RSI: 26.8`
  }
];
