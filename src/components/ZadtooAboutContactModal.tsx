import React from 'react';
import { Send, Mail, Phone, ShieldCheck, Award, MessageCircle, ExternalLink, X } from 'lucide-react';
import { ZadtooLogo } from './ZadtooNavbar';
import type { PlatformContactLinks } from '../types/platformConfig';

interface ZadtooAboutContactModalProps {
  type: 'about' | 'contact' | null;
  onClose: () => void;
  telegramLink?: string;
  contactLinks?: PlatformContactLinks;
}

export const ZadtooAboutContactModal: React.FC<ZadtooAboutContactModalProps> = ({
  type,
  onClose,
  telegramLink = 'https://t.me/ZadNBFX',
  contactLinks
}) => {
  if (!type) return null;

  const tgChannel = contactLinks?.telegramChannelUrl || telegramLink;
  const tgSupport = contactLinks?.telegramSupportUrl || tgChannel;
  const whatsappNum = contactLinks?.whatsappSupportNumber || '';
  const email = contactLinks?.supportEmail || 'support@zadtoo.com';
  const notes = contactLinks?.contactNotes;

  const whatsappHref = whatsappNum.startsWith('http')
    ? whatsappNum
    : `https://wa.me/${whatsappNum.replace(/[^0-9]/g, '')}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-7 shadow-2xl border border-slate-200 relative space-y-5 text-right">
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
              <strong>ZAD FX</strong> هي منظومة تقنية متكاملة ومبتكرة متخصصة في تحليل أسواق الخيارات الثنائية (Binary Options) والعملات الرقمية والفوركس، معتمدة على أحدث تقنيات الرادار المالي للتنبؤ بالاتجاهات على فريم الدقيقة بدقة متناهية وبدون أي مضاعفات مارتينجال.
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
                فريق الدعم الفني وإدارة الاشتراكات متاح على مدار الساعة للإجابة على استفساراتكم وتأكيد عضويتكم.
              </p>
            </div>

            <div className="space-y-2.5 text-xs sm:text-sm">
              {/* Telegram Channel */}
              <a
                href={tgChannel}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between p-3.5 rounded-2xl bg-sky-50 hover:bg-sky-100/70 border border-sky-200 text-sky-900 transition-colors cursor-pointer group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-sky-500 text-white flex items-center justify-center shrink-0">
                    <Send className="w-5 h-5" />
                  </div>
                  <div>
                    <strong className="block text-sm">قناة التليجرام الرسمية</strong>
                    <span className="text-slate-500 font-mono-num">
                      {contactLinks?.telegramChannelUsername || '@ZadNBFX'} — إشارات وتحديثات حية
                    </span>
                  </div>
                </div>
                <span className="text-sky-600 font-bold group-hover:translate-x-[-4px] transition-transform text-xs">
                  فتح ←
                </span>
              </a>

              {/* Direct Telegram Support */}
              <a
                href={tgSupport}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between p-3.5 rounded-2xl bg-indigo-50 hover:bg-indigo-100/70 border border-indigo-200 text-indigo-900 transition-colors cursor-pointer group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center shrink-0">
                    <MessageCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <strong className="block text-sm">الدعم المباشر على تليجرام</strong>
                    <span className="text-slate-500">رد فوري على الاستفسارات والتفعيل 24/7</span>
                  </div>
                </div>
                <span className="text-indigo-600 font-bold group-hover:translate-x-[-4px] transition-transform text-xs">
                  مراسلة ←
                </span>
              </a>

              {/* WhatsApp Support */}
              {whatsappNum && (
                <a
                  href={whatsappHref}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between p-3.5 rounded-2xl bg-emerald-50 hover:bg-emerald-100/70 border border-emerald-200 text-emerald-950 transition-colors cursor-pointer group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0">
                      <Phone className="w-5 h-5" />
                    </div>
                    <div>
                      <strong className="block text-sm">محادثة واتساب المباشرة</strong>
                      <span className="text-slate-500 font-mono-num" dir="ltr">
                        {whatsappNum}
                      </span>
                    </div>
                  </div>
                  <span className="text-emerald-700 font-bold group-hover:translate-x-[-4px] transition-transform text-xs">
                    محادثة ←
                  </span>
                </a>
              )}

              {/* Official Support Email */}
              <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-slate-800">
                <div className="w-10 h-10 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center shrink-0">
                  <Mail className="w-5 h-5" />
                </div>
                <div>
                  <strong className="block text-sm">البريد الإلكتروني الرسمي</strong>
                  <span className="text-slate-500 font-mono-num">{email}</span>
                </div>
              </div>
            </div>

            {notes && (
              <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200 text-xs text-amber-900 leading-relaxed">
                💡 <strong>تعليمات الدفع والتواصل:</strong> {notes}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
