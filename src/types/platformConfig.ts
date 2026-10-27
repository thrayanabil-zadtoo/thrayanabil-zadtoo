export interface SubscriptionPlan {
  id: string;
  name: string; // مسمى الباقة (e.g., الباقة الذهبية VIP)
  priceUsd: number; // السعر بالدولار
  durationDays: number; // المدة بالأيام (30, 90, 365, ...)
  durationLabel: string; // نص المدة (e.g., / شهر, سنة كاملة)
  badge?: string; // شارة تميز (e.g., الأعلى تميزاً 👑, الأكثر طلباً)
  features: string[]; // قائمة مميزات الباقة
  isPopular?: boolean; // باقة موصى بها
  isReferralFree?: boolean; // باقة إحالة كيوتكس المجانية
  enabled: boolean; // مفعلة أم معطلة
  icon?: 'gift' | 'star' | 'shield' | 'crown' | 'zap'; // أيقونة الباقة
  colorTheme?: 'emerald' | 'sky' | 'slate' | 'amber' | 'purple' | 'rose';
}

export interface PlatformContactLinks {
  quotexReferralLink: string; // رابط الإحالة لمنصة التداول
  telegramChannelUrl: string; // رابط قناة التليجرام العامة
  telegramChannelUsername: string; // معرف القناة (e.g. @ZadNBFX)
  telegramVipChannelUrl: string; // رابط قناة الـ VIP
  telegramSupportUrl: string; // رابط أو معرف الدعم الفني المباشر
  whatsappSupportNumber: string; // رقم أو رابط واتساب للدعم
  supportEmail: string; // البريد الإلكتروني للدعم
  contactNotes?: string; // ملاحظات أو تعليمات الدفع والتواصل
}

export const INITIAL_SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: 'free_trial',
    name: 'الباقة التجريبية',
    priceUsd: 0,
    durationDays: 7,
    durationLabel: 'لمدة 7 أيام',
    badge: 'مجانية 🎁',
    icon: 'gift',
    colorTheme: 'emerald',
    features: ['إشارات محدودة يومياً', 'مميزات أساسية وتحليل M1', 'قناة التليجرام العامة'],
    enabled: true
  },
  {
    id: 'basic_19',
    name: 'الباقة الأساسية',
    priceUsd: 19,
    durationDays: 30,
    durationLabel: '/ شهر',
    badge: 'باقة المبتدئين',
    icon: 'star',
    colorTheme: 'sky',
    features: ['إشارات يومية فريم الدقيقة', 'قناة تليجرام خاصة', 'دعم فني سريع عبر البريد'],
    enabled: true
  },
  {
    id: 'silver_49',
    name: 'الباقة الفضية',
    priceUsd: 49,
    durationDays: 30,
    durationLabel: '/ شهر',
    badge: 'الأكثر توفيراً',
    icon: 'shield',
    colorTheme: 'slate',
    features: ['إشارات دقيقة بدون مضاعفات', 'جروب خاص للمناقشات', 'دعم فني مباشر على مدار الساعة', 'تنبيهات صوتية فورية'],
    enabled: true
  },
  {
    id: 'gold_99',
    name: 'الباقة الذهبية (VIP)',
    priceUsd: 99,
    durationDays: 30,
    durationLabel: '/ شهر',
    badge: 'الأعلى تميزاً 👑',
    icon: 'crown',
    colorTheme: 'amber',
    isPopular: true,
    features: [
      'جميع إشارات السوق العالمي (فريم M1)',
      'روبوت التداول الآلي (Quotex Pro Bot)',
      'دعم فني VIP مخصص على مدار 24/7',
      'توصيات الأخبار العاجلة الحصرية'
    ],
    enabled: true
  },
  {
    id: 'quotex_referral_free',
    name: 'عضوية كيوتكس مجاناً',
    priceUsd: 0,
    durationDays: 30,
    durationLabel: 'شهرياً (مجاناً)',
    badge: 'إحالة كيوتكس 🎁',
    icon: 'zap',
    colorTheme: 'emerald',
    isReferralFree: true,
    features: [
      'التسجيل برابط إحالة منصة كيوتكس',
      'إيداع 100$ في حسابك للتداول بها',
      'تفعيل قناة VIP والروبوت مجاناً'
    ],
    enabled: true
  }
];

export const INITIAL_CONTACT_LINKS: PlatformContactLinks = {
  quotexReferralLink: 'https://broker-qx.pro/?lid=2303934',
  telegramChannelUrl: 'https://t.me/ZadNBFX',
  telegramChannelUsername: '@ZadNBFX',
  telegramVipChannelUrl: 'https://t.me/ZadNBFX',
  telegramSupportUrl: 'https://t.me/ZadNBFX',
  whatsappSupportNumber: '+201000000000',
  supportEmail: 'support@zadtoo.com',
  contactNotes: 'فريق الدعم وإدارة الاشتراكات متاح 24/7. يمكن التحويل عبر المحافظ الإلكترونية، إنستاباي، والتحويل البنكي.'
};

export interface PaymentMethodConfig {
  id: string;
  name: string;
  category: 'crypto' | 'electronic_wallet' | 'bank_transfer' | 'credit_card' | 'other';
  accountNumber: string; // العنوان أو رقم الموبايل أو المعرف
  accountHolderName: string; // اسم صاحب الحساب أو المحفظة
  networkOrBank: string; // الشبكة أو البنك (مثل TRC20، فودافون كاش، CIB)
  instructions: string; // تعليمات الإرسال للعميل
  qrCodeUrl?: string; // رابط أو كود QR
  minAmountUsd?: number;
  isActive: boolean;
  supportedCurrencies?: string[];
}

export interface PaymentTransactionRecord {
  id: string;
  subscriberId?: string;
  subscriberName: string;
  subscriberEmail?: string;
  subscriberPhone?: string;
  planId?: string;
  planName?: string;
  amount: number;
  currency: string;
  paymentMethodId: string;
  paymentMethodName: string;
  transactionReference: string; // رقم الحوالة / العملية / TxID
  receiptImageUrl?: string; // صورة الإيصال
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
  reviewedAt?: string;
  adminNotes?: string;
}

export const INITIAL_PAYMENT_METHODS: PaymentMethodConfig[] = [
  {
    id: 'usdt_trc20',
    name: 'USDT (TRC-20) المحفظة المشفرة',
    category: 'crypto',
    accountNumber: 'TLLq8K6Vb1Y7z8YhE9K7D8xNBFX2026Crypto',
    accountHolderName: 'ZAD FX Official Crypto Wallet',
    networkOrBank: 'TRON (TRC-20)',
    instructions: 'يرجى إرسال المبلغ الصافي بالـ USDT عبر شبكة TRC20 فقط، ثم نسخ رقم العملية (TxID) وإرفاق لقطة شاشة للتحويل.',
    minAmountUsd: 10,
    isActive: true,
    supportedCurrencies: ['USDT', 'USD']
  },
  {
    id: 'vodafone_cash',
    name: 'فودافون كاش والمحافظ الإلكترونية',
    category: 'electronic_wallet',
    accountNumber: '01023456789',
    accountHolderName: 'خدمات التداول والاستشارات - ZAD FX',
    networkOrBank: 'فودافون كاش / اتصالات / وي / أورنج',
    instructions: 'التحويل متاح من كافة المحافظ الذكية في مصر. يرجى كتابة اسم صاحب المحفظة المحول منها وإرفاق لقطة شاشة واضحة لرسالة التأكيد.',
    minAmountUsd: 10,
    isActive: true,
    supportedCurrencies: ['EGP', 'USD']
  },
  {
    id: 'instapay',
    name: 'إنستاباي (InstaPay Egypt)',
    category: 'bank_transfer',
    accountNumber: 'zadfx@instapay',
    accountHolderName: 'ZAD FX Official Account',
    networkOrBank: 'شبكة المدفوعات اللحظية المصرية (InstaPay)',
    instructions: 'تحويل لحظي فوري عبر تطبيق InstaPay. يرجى التأكد من اسم المستلم وإرسال إشعار العملية.',
    minAmountUsd: 10,
    isActive: true,
    supportedCurrencies: ['EGP', 'USD']
  },
  {
    id: 'binance_pay',
    name: 'Binance Pay (بينانس باي)',
    category: 'crypto',
    accountNumber: '861358153',
    accountHolderName: 'ZAD FX Binance Merchant',
    networkOrBank: 'Binance Pay (بدون رسوم 0% Fees)',
    instructions: 'تحويل مباشر مجاني عبر تطبيق Binance باستخدام معرف Pay ID مع تفعيل فوري للاشتراك.',
    minAmountUsd: 10,
    isActive: true,
    supportedCurrencies: ['USDT', 'BUSD', 'BTC', 'ETH']
  },
  {
    id: 'bank_transfer',
    name: 'تحويل بنكي مباشر (Bank Wire / IBAN)',
    category: 'bank_transfer',
    accountNumber: 'EG5400030000123456789012345',
    accountHolderName: 'ZAD Financial Services LLC',
    networkOrBank: 'البنك التجاري الدولي CIB / البنك الأهلي',
    instructions: 'متاح للتحويلات البنكية المحلية والدولية، يرجى تزويدنا برقم السويفت وإيصال الإيداع.',
    minAmountUsd: 50,
    isActive: true,
    supportedCurrencies: ['USD', 'EUR', 'EGP']
  },
  {
    id: 'credit_card',
    name: 'بطاقة بنكية (Visa / MasterCard)',
    category: 'credit_card',
    accountNumber: 'بوابة دفع إلكترونية مؤمنة 3D Secure',
    accountHolderName: 'ZAD FX Global Payments',
    networkOrBank: 'Visa / MasterCard / Meeza',
    instructions: 'للدفع الفوري عبر البطاقات المصرفية، تواصل مع الدعم الفني لتزويدك برابط دفع مباشر مؤمن.',
    minAmountUsd: 19,
    isActive: true,
    supportedCurrencies: ['USD', 'EUR', 'EGP']
  }
];
