import React from 'react';
import { LogIn, UserCheck, Shield, Sparkles, Send } from 'lucide-react';

interface ZadtooNavbarProps {
  activeTab: 'home' | 'signals' | 'news' | 'autotrade' | 'memberships' | 'admin';
  setActiveTab: (tab: 'home' | 'signals' | 'news' | 'autotrade' | 'memberships' | 'admin') => void;
  isAdmin: boolean;
  onOpenLogin: () => void;
  onOpenAbout?: () => void;
  onOpenContact?: () => void;
  telegramLink?: string;
}

export const ZadtooLogo: React.FC<{ size?: 'sm' | 'md' | 'lg'; light?: boolean }> = ({ size = 'md' }) => {
  const iconH = size === 'sm' ? 'h-5' : size === 'lg' ? 'h-8' : 'h-6';
  const textS = size === 'sm' ? 'text-lg' : size === 'lg' ? 'text-2xl' : 'text-xl';
  return (
    <div className="flex items-center gap-2 select-none">
      {/* 3-bar green/cyan chart logo */}
      <div className={`flex items-end gap-1 ${iconH}`}>
        <span className="w-1.5 h-3.5 bg-emerald-500 rounded-sm" />
        <span className="w-1.5 h-5 bg-emerald-600 rounded-sm" />
        <span className="w-1.5 h-6 bg-teal-400 rounded-sm" />
      </div>
      <span className={`font-black tracking-tight ${textS} text-slate-900`}>
        ZAD <span className="text-emerald-600">FX</span>
      </span>
    </div>
  );
};

export const ZadtooNavbar: React.FC<ZadtooNavbarProps> = ({
  activeTab,
  setActiveTab,
  isAdmin,
  onOpenLogin,
  onOpenAbout,
  onOpenContact
}) => {
  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between">
        {/* Logo */}
        <div
          onClick={() => setActiveTab('home')}
          className="cursor-pointer transition-transform hover:scale-105 active:scale-95"
        >
          <ZadtooLogo size="md" />
        </div>

        {/* Desktop Navigation Links */}
        <nav className="hidden md:flex items-center gap-1 lg:gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('home')}
            className={`px-3.5 py-2 text-sm font-bold rounded-lg transition-colors cursor-pointer ${
              activeTab === 'home'
                ? 'text-emerald-700 bg-emerald-50 font-extrabold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            الرئيسية
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('signals')}
            className={`px-3.5 py-2 text-sm font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'signals'
                ? 'text-emerald-700 bg-emerald-50 font-extrabold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <span>الإشارات</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          </button>

          {/* Forex Breaking News Tab */}
          <button
            type="button"
            onClick={() => setActiveTab('news')}
            className={`px-3 py-2 text-sm font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'news'
                ? 'text-rose-700 bg-rose-50 font-extrabold shadow-xs'
                : 'text-slate-600 hover:text-rose-600 hover:bg-rose-50/50'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
            <span>الأخبار العاجلة</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700 font-bold border border-rose-200">
              أسبوعي 🔴
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('autotrade')}
            className={`px-3.5 py-2 text-sm font-bold rounded-lg transition-colors cursor-pointer ${
              activeTab === 'autotrade'
                ? 'text-emerald-700 bg-emerald-50 font-extrabold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            التداول الآلي
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('memberships')}
            className={`px-3.5 py-2 text-sm font-bold rounded-lg transition-colors cursor-pointer ${
              activeTab === 'memberships'
                ? 'text-emerald-700 bg-emerald-50 font-extrabold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            العضويات
          </button>

          <button
            type="button"
            onClick={onOpenAbout}
            className="px-3.5 py-2 text-sm font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
          >
            من نحن
          </button>

          <button
            type="button"
            onClick={onOpenContact}
            className="px-3.5 py-2 text-sm font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
          >
            تواصل معنا
          </button>

          {isAdmin && (
            <button
              type="button"
              onClick={() => setActiveTab('admin')}
              className={`px-3.5 py-2 text-sm font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1 ${
                activeTab === 'admin'
                  ? 'text-sky-700 bg-sky-50 font-extrabold'
                  : 'text-sky-600 hover:text-sky-800 hover:bg-sky-50'
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              <span>لوحة التحكم</span>
            </button>
          )}
        </nav>

        {/* Right Action Buttons */}
        <div className="flex items-center gap-2 sm:gap-3">
          {isAdmin ? (
            <button
              type="button"
              onClick={() => setActiveTab('admin')}
              className="px-3.5 py-1.5 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg border border-slate-300 transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>مدير النظام</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenLogin}
              className="px-3.5 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-bold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors cursor-pointer shadow-2xs"
            >
              تسجيل الدخول
            </button>
          )}

          <button
            type="button"
            onClick={() => setActiveTab('memberships')}
            className="px-4 sm:px-5 py-1.5 sm:py-2 text-xs sm:text-sm font-extrabold text-white bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 rounded-lg transition-all cursor-pointer shadow-sm hover:shadow-md hover:scale-102 active:scale-98"
          >
            اشترك الآن
          </button>
        </div>
      </div>

      {/* Mobile Secondary Menu */}
      <div className="md:hidden flex items-center justify-around border-t border-slate-100 px-2 py-1.5 bg-slate-50/80 text-xs font-bold text-slate-700 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('home')}
          className={`px-2.5 py-1 rounded ${activeTab === 'home' ? 'text-emerald-700 bg-emerald-100/70 font-extrabold' : ''}`}
        >
          الرئيسية
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('signals')}
          className={`px-2.5 py-1 rounded ${activeTab === 'signals' ? 'text-emerald-700 bg-emerald-100/70 font-extrabold' : ''}`}
        >
          الإشارات
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('news')}
          className={`px-2.5 py-1 rounded flex items-center gap-1 ${activeTab === 'news' ? 'text-rose-700 bg-rose-100/80 font-extrabold' : 'text-rose-600'}`}
        >
          <span>الأخبار</span>
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('autotrade')}
          className={`px-2.5 py-1 rounded ${activeTab === 'autotrade' ? 'text-emerald-700 bg-emerald-100/70 font-extrabold' : ''}`}
        >
          التداول الآلي
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('memberships')}
          className={`px-2.5 py-1 rounded ${activeTab === 'memberships' ? 'text-emerald-700 bg-emerald-100/70 font-extrabold' : ''}`}
        >
          العضويات
        </button>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setActiveTab('admin')}
            className={`px-2.5 py-1 rounded ${activeTab === 'admin' ? 'text-sky-700 bg-sky-100 font-extrabold' : 'text-sky-600'}`}
          >
            الإدارة
          </button>
        )}
      </div>
    </header>
  );
};
