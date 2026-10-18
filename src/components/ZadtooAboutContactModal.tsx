import React from 'react';
import { Send, Mail, Phone, ShieldCheck, Award, TrendingUp, X } from 'lucide-react';
import { ZadtooLogo } from './ZadtooNavbar';

interface ZadtooAboutContactModalProps {
  type: 'about' | 'contact' | null;
  onClose: () => void;
  telegramLink?: string;
}

export const ZadtooAboutContactModal: React.FC<ZadtooAboutContactModalProps> = ({
  type,
  onClose,
  telegramLink = 'https://t.me/ZadNBFX'
}) => {
  if (!type) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-7 shadow-2xl border border-slate-200 relative space-y-5">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 left-5 text-slate-400 hover:text-slate-700 text-sm font-bold cursor-pointer"
        >
          ✕
        </button>

        {type === 'about' ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <ZadtooLogo size="md" />
            </div>

            <h3 className="text-xl font-black text-slate-900">
              عن منصة <span className="text-emerald-600">ZAD FX</span>
            </h3>

            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              <strong>ZAD FX</strong> هي منظومة تقنية متكاملة ومبتكرة متخصصة في تحليل أسواق الخيارات الثنائية (Binary Options) والعملات الرقمية والفوركس، معتمدة على أحدث تقنيات الرادار المالي والذكاء الاصطناعي للتنبؤ بالاتجاهات على فريم الدقيقة بدقة متناهية وبدون أي مضاعفات مارتينجال.
            </p>

            <div className="grid grid-cols-2 gap-3 pt-2 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-1">
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
                <strong className="block text-slate-900">رؤيتنا:</strong>
                <span className="text-slate-500">تمكين المتداول العربي بأدوات تداول آلية واحترافية.</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-1">
                <Award className="w-5 h-5 text-sky-600" />
                <strong className="block text-slate-900">قيمنا:</strong>
                <span className="text-slate-500">الشفافية الكاملة، الدقة العالية، وحماية رأس المال.</span>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 flex justify-between items-center text-xs text-slate-400">
              <span>إشراف وتطوير تقني: Nabil Barakat</span>
              <span className="font-mono-num">2026 ZAD FX Platform</span>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-xl font-black text-slate-900">تواصل معنا</h3>
              <p className="text-xs text-slate-400 mt-1">
                فريق الدعم الفني وإدارة الاشتراكات متاح على مدار الساعة للإجابة على استفساراتكم.
              </p>
            </div>

            <div className="space-y-2.5 text-xs">
              <a
                href={telegramLink}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between p-3.5 rounded-xl bg-sky-50 hover:bg-sky-100/70 border border-sky-200 text-sky-900 transition-colors cursor-pointer group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-sky-500 text-white flex items-center justify-center">
                    <Send className="w-5 h-5" />
                  </div>
                  <div>
                    <strong className="block text-sm">قناة ومحادثة التليجرام</strong>
                    <span className="text-slate-500">@ZadNBFX — رد فوري 24/7</span>
                  </div>
                </div>
                <span className="text-sky-600 font-bold group-hover:translate-x-[-4px] transition-transform">
                  فتح ←
                </span>
              </a>

              <div className="flex items-center gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800">
                <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <Mail className="w-5 h-5" />
                </div>
                <div>
                  <strong className="block text-sm">البريد الإلكتروني الرسمي</strong>
                  <span className="text-slate-500 font-mono-num">support@zadtoo.com</span>
                </div>
              </div>
            </div>

            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 text-center">
              💡 <strong>ملاحظة:</strong> لتفعيل مفاتيح الروبوت الخاصة بالأعضاء الجدد، يرجى التواصل عبر قناة التليجرام برقم الحساب (ID).
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
