// ==UserScript==
// @name         روبوت ZAD FX - الروبوت العائم السحابي الشامل (Universal Cloud Broker Robot)
// @namespace    https://fx.zadtoo.com
// @version      3.6
// @description  روبوت عائم سحابي مستقل 100% يعمل مباشرة على كيوتكس وكافة المنصات دون الحاجة لفتح أي صفحة أخرى - مزامنة فورية وتنبيهات صوتية ومرئية
// @updateURL    ${appOrigin}/api/quotex-robot/zad-broker-robot.user.js
// @downloadURL  ${appOrigin}/api/quotex-robot/zad-broker-robot.user.js
// @match        *://*.qxbroker.com/*
// @match        *://qxbroker.com/*
// @match        *://*.quotex.io/*
// @match        *://quotex.io/*
// @match        *://*.broker-qx.pro/*
// @match        *://broker-qx.pro/*
// @match        *://*.market-qx.pro/*
// @match        *://market-qx.pro/*
// @match        *://*.market-qx.com/*
// @match        *://market-qx.com/*
// @match        *://*.quotex-broker.com/*
// @match        *://quotex-broker.com/*
// @match        *://*.quotex-market.com/*
// @match        *://quotex-market.com/*
// @match        *://*.quotex.com/*
// @match        *://quotex.com/*
// @match        *://*.qxplus.com/*
// @match        *://qxplus.com/*
// @match        *://*.qx-market.com/*
// @match        *://qx-market.com/*
// @match        *://*.pocketoption.com/*
// @match        *://pocketoption.com/*
// @match        *://*.po.market/*
// @match        *://po.market/*
// @match        *://*.po.trade/*
// @match        *://po.trade/*
// @match        *://*.olymptrade.com/*
// @match        *://olymptrade.com/*
// @match        *://*.iqoption.com/*
// @match        *://iqoption.com/*
// @match        *://*.binomo.com/*
// @match        *://binomo.com/*
// @match        *://*.run.app/*
// @match        *://*.zadtoo.com/*
// @match        *://zadtoo.com/*
// @match        *://localhost:*/*
// @match        *://127.0.0.1:*/*
// @match        *://*/*
// @include      *://*quotex*/*
// @include      *://*qxbroker*/*
// @include      *://*broker-qx*/*
// @include      *://*market-qx*/*
// @include      *://*qx*/*
// @include      *://*pocketoption*/*
// @include      *://*po.market*/*
// @include      *://*po.trade*/*
// @include      *://*zadtoo*/*
// @include      *
// @allFrames    false
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addValueChangeListener
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @connect      *
// @run-at       document-end
// ==/UserScript==

(function() {
  'use strict';

  // =========================================================================
  // حارس منع التكرار والتعارض الجذري (Global Singleton & Conflict Guard)
  // يمنع تكرار تشغيل الروبوت مرتين أو تعارض النسخ القديمة عند تحديث الصفحة أو التامبرمونكي
  // =========================================================================
  if (window.__ZAD_ROBOT_ACTIVE_INSTANCE__) {
    console.log("%c[روبوت ZAD FX] تنظيف النسخة السابقة وتحديث الروبوت لمنع أي تعارض أو تكرار ⚡", "color:#f59e0b;font-weight:bold;");
    try {
      if (typeof window.__ZAD_ROBOT_DESTROY__ === "function") {
        window.__ZAD_ROBOT_DESTROY__();
      }
      const prevWidget = document.getElementById("zad-universal-floating-robot");
      if (prevWidget) prevWidget.remove();
      const prevLauncher = document.getElementById("zad-robot-launcher");
      if (prevLauncher) prevLauncher.remove();
      const prevOverlay = document.getElementById("zad-calibrate-overlay");
      if (prevOverlay) prevOverlay.remove();
    } catch(e) {}
  }
  window.__ZAD_ROBOT_ACTIVE_INSTANCE__ = true;

  const activeIntervals = [];
  function addTrackedInterval(fn, ms) {
    const id = setInterval(fn, ms);
    activeIntervals.push(id);
    return id;
  }
  let globalDomWatcher = null;
  window.__ZAD_ROBOT_DESTROY__ = function() {
    activeIntervals.forEach(id => clearInterval(id));
    activeIntervals.length = 0;
    if (globalDomWatcher) {
      try { globalDomWatcher.disconnect(); } catch(e) {}
      globalDomWatcher = null;
    }
  };

  // تصفية الإطارات الفرعية غير المرئية أو إعلانات التتبع
  try {
    if (window.self !== window.top) {
      if (window.name && (window.name.includes("google_ads") || window.name.includes("aswift") || window.name.includes("analytics"))) {
        return;
      }
      if (window.innerWidth > 0 && window.innerWidth < 350 && window.innerHeight > 0 && window.innerHeight < 350) {
        return;
      }
    }
  } catch(e) {}

  const API_BASE = "${appOrigin}";

  // الكشف الذكي التلقائي عن رقم حساب البروكر من صفحة كيوتكس أو بوكيت أوبشن
  function detectBrokerAccountId() {
    try {
      const idSelectors = [
        '.usermenu__info-id',
        '.user-info__id',
        '.profile-user-id',
        '.header-profile__id',
        '[data-user-id]',
        '.account-id',
        '.profile__id',
        '.user-id'
      ];
      for (const sel of idSelectors) {
        const el = document.querySelector(sel);
        if (el && el.textContent) {
          const m = el.textContent.match(/\\b\\d{5,12}\\b/);
          if (m) return m[0];
        }
      }
      const userMenu = document.querySelector('.usermenu, .header__user, .user-profile, .user-info');
      if (userMenu && userMenu.textContent) {
        const m = userMenu.textContent.match(/(?:ID|UID|معرف|حساب)[:\\s#]*(\\d{5,12})/i);
        if (m) return m[1];
      }
    } catch(e) {}
    return null;
  }

  // استخراج مفتاح أو رقم حساب العضو بدون إظهار متغيرات نصية غير معوضة
  let savedKey = localStorage.getItem("zad_broker_key") || localStorage.getItem("zad_vip_member_id") || "";
  if (!savedKey || savedKey.includes("${") || savedKey === "undefined" || savedKey === "null") {
    savedKey = "";
  }
  if (!savedKey) {
    const autoId = detectBrokerAccountId();
    if (autoId) {
      savedKey = autoId;
      try { localStorage.setItem("zad_broker_key", autoId); } catch(e) {}
    }
  }
  const INJECTED_KEY = "${activeKey}";
  let MEMBER_IDENTIFIER = savedKey || (!INJECTED_KEY.includes("${") && INJECTED_KEY ? INJECTED_KEY : "") || "QX-ADMIN-MASTER-TEST";

  // بمجرد تثبيت البرنامج العائم يكون على وضع التداول اليدوي وليس الآلي افتراضياً
  let ROBOT_MODE = localStorage.getItem("zad_robot_mode") || "MANUAL"; // "MANUAL" | "AUTO"
  let LAST_EXECUTED_SIG_ID = "";
  let LAST_ALERTED_SIG_ID = "";
  let lastDataReceivedTime = 0;
  let serverTargetPair = "EUR/JPY"; // الزوج الثابت اليومي الافتراضي من لوحة المشرف
  let serverMarketOpen = null;

  // التحقق من حالة فتح السوق العالمي (الفوركس يغلق الجمعة 21:00 UTC ويفتح الأحد 21:00 UTC)
  function isForexMarketOpen() {
    if (typeof serverMarketOpen === "boolean") return serverMarketOpen;
    const now = new Date();
    const day = now.getUTCDay(); // 0 = Sun, 5 = Fri, 6 = Sat
    const hour = now.getUTCHours();
    if (day === 6) return false; // السبت مغلق
    if (day === 5 && hour >= 21) return false; // الجمعة بعد 21:00 UTC مغلق
    if (day === 0 && hour < 21) return false; // الأحد قبل 21:00 UTC مغلق
    return true;
  }

  const currentHost = window.location.hostname.toLowerCase();
  const isWebPlatformHub = currentHost.includes("run.app") || currentHost.includes("zadtoo.com") || currentHost.includes("localhost") || currentHost.includes("127.0.0.1");

  // مزامنة التبويب في الخلفية مع ذاكرة تامبرمونكي المشتركة
  if (isWebPlatformHub) {
    console.log("%c[روبوت ZAD FX] متصل ومتزامن بالسيرفر ⚡", "color:#10b981;font-weight:bold;font-size:12px;");
    async function syncHubToTampermonkey() {
      try {
        const res = await fetch(window.location.origin + "/api/quotex-robot/feed?apiKey=" + encodeURIComponent(MEMBER_IDENTIFIER));
        if (res.ok) {
          const data = await res.json();
          if (data && data.ok && typeof GM_setValue === "function") {
            GM_setValue("zad_robot_live_payload", JSON.stringify(data));
            GM_setValue("zad_robot_last_ping", Date.now());
          }
        }
      } catch(e) {}
    }
    syncHubToTampermonkey();
    setInterval(syncHubToTampermonkey, 1500);
  }

  // =========================================================================
  // المحور الثاني: الروبوت العائم على شاشة منصة البروكر (Quotex / Pocket Option)
  // يعمل مستقلاً 100% دون فتح أي موقع خارجي
  // =========================================================================
  const brokerName = currentHost.includes("pocketoption") || currentHost.includes("po.market") ? "Pocket Option"
    : currentHost.includes("olymptrade") ? "Olymp Trade"
    : currentHost.includes("iqoption") ? "IQ Option"
    : currentHost.includes("binomo") ? "Binomo"
    : "Quotex";

  // دالة توليد نغمة التنبيه الصوتية عالية النقاء (Web Audio API Chime)
  function playSignalChime(isCall) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') ctx.resume();
      
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = isCall ? "sine" : "triangle";
      osc.frequency.setValueAtTime(isCall ? 587.33 : 440, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(isCall ? 880 : 330, ctx.currentTime + 0.25);
      gain.gain.setValueAtTime(0.35, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.65);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.65);
    } catch(e) {}
  }

  // إنشاء نافذة الروبوت العائمة والصغيرة الشاملة
  const widget = document.createElement("div");
  widget.id = "zad-universal-floating-robot";
  widget.dir = "rtl";
  // إذا كان على موقع المنصة نفسها zadtoo.com، يوضع أسفل اليسار كي لا يحجب زر دخول المشرف أو الهيدر
  let savedPosLeft = localStorage.getItem("zad_robot_pos_left");
  let savedPosTop = localStorage.getItem("zad_robot_pos_top");
  let posCss = isWebPlatformHub
    ? "bottom:24px;left:24px;"
    : "top:75px;left:75px;";
  if (savedPosLeft && savedPosTop && !isWebPlatformHub) {
    const l = parseInt(savedPosLeft, 10);
    const t = parseInt(savedPosTop, 10);
    const winW = window.innerWidth || document.documentElement.clientWidth || 1200;
    const winH = window.innerHeight || document.documentElement.clientHeight || 800;
    if (!isNaN(l) && !isNaN(t) && l >= 10 && l <= (winW - 310) && t >= 10 && t <= (winH - 180)) {
      posCss = "top:" + t + "px;left:" + l + "px;right:auto;bottom:auto;";
    } else {
      posCss = "top:75px;left:75px;right:auto;bottom:auto;";
    }
  }
  widget.style.cssText = "position:fixed !important;" + posCss + "z-index:2147483647 !important;width:295px;background:#0B0F17 !important;border:1.5px solid #10b981 !important;border-radius:14px !important;color:#f8fafc !important;font-family:system-ui,-apple-system,sans-serif !important;box-shadow:0 15px 35px rgba(0,0,0,0.85) !important;padding:12px !important;user-select:none !important;font-size:12px !important;transition:border-color 0.3s, box-shadow 0.3s;display:block !important;visibility:visible !important;opacity:1 !important;pointer-events:auto !important;";
  widget.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #1e293b;padding-bottom:8px;margin-bottom:8px;cursor:move;" id="zad-robot-header">
      <div style="display:flex;align-items:center;gap:6px;">
        <span style="width:9px;height:9px;border-radius:50%;background:#10b981;box-shadow:0 0 6px #10b981;display:inline-block;" id="zad-status-dot"></span>
        <strong style="font-size:12px;color:#fff;">روبوت ZAD FX</strong>
        <span style="font-size:10px;color:#38bdf8;background:#0c4a6e;padding:1px 5px;border-radius:4px;">${brokerName}</span>
      </div>
      <div style="display:flex;align-items:center;gap:4px;">
        <button id="zad-info-btn" style="background:#1e293b;color:#38bdf8;border:1px solid #334155;border-radius:6px;padding:1px 5px;font-size:10.5px;font-weight:bold;cursor:pointer;" title="معلومات وتطوير">ℹ️ info</button>
        <button id="zad-quran-btn" style="background:#064e3b;color:#6ee7b7;border:1px solid #059669;border-radius:6px;padding:1px 5px;font-size:10.5px;font-weight:bold;cursor:pointer;display:flex;align-items:center;gap:2px;" title="استماع للقرآن الكريم — الشيخ ماهر المعيقلي">🎧 قرآن</button>
        <button id="zad-close-btn" style="background:transparent;border:none;color:#94a3b8;font-size:13px;font-weight:bold;cursor:pointer;padding:0 3px;line-height:1;" title="إغلاق">✕</button>
      </div>
    </div>

    <!-- نافذة معلومات المبرمج والموقع والقناة الرسمية -->
    <div id="zad-info-panel" style="display:none;background:#0F172A;border:1px solid #38bdf8;border-radius:10px;padding:8px;margin-bottom:8px;font-size:11px;line-height:1.6;color:#e2e8f0;">
      <div style="font-weight:bold;color:#38bdf8;margin-bottom:4px;display:flex;justify-content:space-between;">
        <span>ℹ️ معلومات الروبوت</span>
        <span id="zad-close-info" style="cursor:pointer;color:#94a3b8;">✕</span>
      </div>
      <div>🌐 الموقع: <a href="https://fx.zadtoo.com" target="_blank" style="color:#10b981;text-decoration:none;font-weight:bold;">fx.zadtoo.com</a></div>
      <div>📢 القناة الرسمية: <a href="https://t.me/ZadNBFX" target="_blank" style="color:#38bdf8;text-decoration:none;font-weight:bold;">ZAD FX @ZadNBFX</a></div>
      <div style="color:#fbbf24;font-size:10.5px;margin-top:2px;border-top:1px dashed #334155;padding-top:2px;">👨‍💻 إعداد وبرمجة: <b>Nabil Barakat</b></div>
    </div>

    <!-- شريط العضو وتعديل المفتاح/رقم الحساب -->
    <div style="font-size:10.5px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;color:#cbd5e1;background:#0f172a;padding:5px 8px;border-radius:6px;border:1px solid #1e293b;">
      <div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:175px;">
        <span>العضو: <b id="zad-robot-member" style="color:#fbbf24;">جاري المزامنة...</b></span>
      </div>
      <div style="display:flex;align-items:center;gap:4px;">
        <span id="zad-robot-days" style="color:#34d399;font-weight:bold;">--</span>
        <button id="zad-change-key-btn" style="background:#1e293b;color:#38bdf8;border:1px solid #334155;border-radius:4px;padding:1px 5px;font-size:9.5px;font-weight:bold;cursor:pointer;" title="تغيير أو إدخال رقم حساب كيوتكس (ID)">🔑 ID</button>
      </div>
    </div>

    <!-- مشغل القرآن الكريم المصغر (الشيخ ماهر المعيقلي) أسفل اسم العضو -->
    <div id="zad-quran-panel" style="display:none;background:linear-gradient(135deg,#064e3b 0%,#022c22 100%);border:1px solid #10b981;border-radius:8px;padding:4px 8px;margin-bottom:6px;font-size:10.5px;color:#ecfdf5;box-shadow:0 4px 12px rgba(16,185,129,0.25);">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;">
        <div style="display:flex;align-items:center;gap:5px;overflow:hidden;">
          <span id="zad-quran-dot" style="width:7px;height:7px;border-radius:50%;background:#34d399;box-shadow:0 0 6px #34d399;display:inline-block;"></span>
          <span style="font-weight:bold;color:#a7f3d0;white-space:nowrap;font-size:10px;">📖 القرآن — الشيخ ماهر المعيقلي</span>
        </div>
        <div style="display:flex;align-items:center;gap:4px;">
          <button id="zad-quran-playpause" style="background:#047857;color:#fff;border:none;border-radius:4px;padding:1px 5px;font-size:9.5px;cursor:pointer;font-weight:bold;">⏸️</button>
          <button id="zad-quran-close" style="background:transparent;border:none;color:#94a3b8;cursor:pointer;font-size:12px;font-weight:bold;padding:0 2px;" title="إغلاق القرآن">✕</button>
        </div>
      </div>
    </div>

    <div style="font-size:9.5px;color:#94a3b8;margin-bottom:6px;text-align:center;" id="zad-conn-badge">
      ⚡ اتصال سحابي سريالي مباشر (Firestore Cloud)
    </div>

    <!-- أزرار تبديل وضع التداول: اليدوي مفعل افتراضياً بمجرد التثبيت -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-bottom:6px;">
      <button id="zad-mode-auto" style="padding:5px;font-size:11px;font-weight:bold;border-radius:7px;border:1px solid ${ROBOT_MODE === 'AUTO' ? '#10b981' : '#334155'};background:${ROBOT_MODE === 'AUTO' ? '#10b981' : '#1e293b'};color:${ROBOT_MODE === 'AUTO' ? '#020617' : '#cbd5e1'};cursor:pointer;">🤖 تداول آلي</button>
      <button id="zad-mode-manual" style="padding:5px;font-size:11px;font-weight:bold;border-radius:7px;border:1px solid ${ROBOT_MODE === 'MANUAL' ? '#f59e0b' : '#334155'};background:${ROBOT_MODE === 'MANUAL' ? '#f59e0b' : '#1e293b'};color:${ROBOT_MODE === 'MANUAL' ? '#020617' : '#cbd5e1'};cursor:pointer;">🖐️ تداول يدوي</button>
    </div>

    <!-- صندوق الإشارة: يعرض فقط 'بانتظار إشارة...' أو 'مغلق السوق' عند إغلاق السوق -->
    <div style="background:#111827;border:1px solid #1e293b;border-radius:9px;padding:8px;margin-bottom:8px;font-size:11px;" id="zad-signal-box">
      <div id="zad-robot-signal" style="margin-bottom:4px;font-size:12px;"></div>
      
      <div id="zad-robot-countdown" style="display:none;background:#032b44;color:#38bdf8;padding:5px 8px;border-radius:6px;font-weight:extrabold;text-align:center;margin-bottom:5px;font-size:12px;border:1px solid #0284c7;">
        ⏳ العد التنازلي: <span id="zad-countdown-val" style="color:#fde047;font-size:14px;font-family:monospace;">--</span>
      </div>

      <div id="zad-manual-trigger-container" style="display:none;margin-bottom:5px;">
        <button id="zad-manual-trade-btn" style="width:100%;padding:7px;font-size:12px;font-weight:extrabold;border-radius:8px;background:#10b981;color:#020617;border:none;cursor:pointer;animation:pulse 1.5s infinite;">
          🚀 اضغط هنا للدخول فوراً في المنصة!
        </button>
      </div>

      <div id="zad-robot-action" style="color:#94a3b8;font-size:10.5px;text-align:center;">جاهز لاستقبال الإشارة القادمة وتنفيذها بالثانية</div>
    </div>

    <!-- 3 مربعات ملونة مؤطرة باللون حسب النتيجة (ربح - خسارة - النسبة) النقر المباشر دون توضيح وبدون علامة + -->
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px;margin-bottom:6px;text-align:center;">
      <div id="zad-box-win" style="background:rgba(16,185,129,0.12);border:1.5px solid #10b981;border-radius:9px;padding:6px 2px;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;">
        <span style="color:#34d399;font-size:10px;font-weight:bold;">✅ ربح</span>
        <b id="zad-robot-wins" style="font-size:15px;color:#fff;font-family:monospace;margin-top:2px;">0</b>
      </div>

      <div id="zad-box-loss" style="background:rgba(239,68,68,0.12);border:1.5px solid #ef4444;border-radius:9px;padding:6px 2px;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;">
        <span style="color:#f87171;font-size:10px;font-weight:bold;">❌ خسارة</span>
        <b id="zad-robot-losses" style="font-size:15px;color:#fff;font-family:monospace;margin-top:2px;">0</b>
      </div>

      <div style="background:rgba(245,158,11,0.12);border:1.5px solid #f59e0b;border-radius:9px;padding:6px 2px;display:flex;flex-direction:column;align-items:center;justify-content:center;">
        <span style="color:#fbbf24;font-size:10px;font-weight:bold;">🎯 النسبة</span>
        <b id="zad-robot-rate" style="font-size:14px;color:#fbbf24;font-family:monospace;margin-top:2px;">100%</b>
      </div>
    </div>
    <!-- قسم اختبار وتثبيت أزرار المنصة (شراء / بيع / معايرة وتثبيت يدوي) -->
    <div style="background:#090d16;border:1px solid #1e293b;border-radius:10px;padding:8px 7px;margin-top:6px;font-size:10.5px;" id="zad-test-panel">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
        <span style="font-weight:bold;color:#38bdf8;font-size:11px;display:flex;align-items:center;gap:4px;">
          <span>🛠️</span>
          <span>اختبار وتثبيت أزرار المنصة:</span>
        </span>
        <button id="zad-calibrate-btn" style="background:#1e293b;color:#fde047;border:1px solid #ca8a04;border-radius:6px;padding:3px 8px;font-size:10px;font-weight:extrabold;cursor:pointer;transition:all 0.2s;" title="تحديد زر المنصة يدوياً بالنقر المباشر عليه">📌 تثبيت يدوي</button>
      </div>

      <div id="zad-test-status" style="font-size:9.5px;color:#94a3b8;margin-bottom:6px;display:flex;justify-content:space-between;background:rgba(15,23,42,0.6);padding:3px 6px;border-radius:5px;border:1px solid #1e293b;">
        <span>🟢 شراء: <b id="zad-status-call-txt" style="color:#34d399">مكتشف باليمين ✓</b></span>
        <span>🔴 بيع: <b id="zad-status-put-txt" style="color:#f87171">مكتشف باليمين ✓</b></span>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
        <button id="zad-test-call-btn" style="background:#064e3b;color:#a7f3d0;border:1.5px solid #10b981;border-radius:8px;padding:7px 4px;font-size:11.5px;font-weight:900;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px;box-shadow:0 2px 8px rgba(16,185,129,0.25);" title="تجربة النقر الفعلي على زر الشراء الأخضر في لوحة صفقات كيوتكس">
          <span>🟢 تجربة الشراء (CALL)</span>
        </button>
        <button id="zad-test-put-btn" style="background:#7f1d1d;color:#fecdd3;border:1.5px solid #ef4444;border-radius:8px;padding:7px 4px;font-size:11.5px;font-weight:900;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px;box-shadow:0 2px 8px rgba(239,68,68,0.25);" title="تجربة النقر الفعلي على زر البيع الأحمر في لوحة صفقات كيوتكس">
          <span>🔴 تجربة البيع (PUT)</span>
        </button>
      </div>
      <div id="zad-test-feedback" style="display:none;margin-top:6px;font-size:10px;text-align:center;padding:5px 8px;border-radius:6px;font-weight:bold;line-height:1.4;"></div>
    </div>
  `;

  // زر إظهار الروبوت في حال التصغير (Launcher)
  let launcher = document.getElementById("zad-robot-launcher");
  if (!launcher) {
    launcher = document.createElement("div");
    launcher.id = "zad-robot-launcher";
    const launcherPos = isWebPlatformHub
      ? "bottom:24px;left:24px;"
      : "bottom:24px;right:24px;";
    launcher.style.cssText = "display:none;position:fixed !important;" + launcherPos + "z-index:2147483647 !important;background:#0f172a !important;border:2px solid #10b981 !important;color:#10b981 !important;padding:8px 16px !important;border-radius:24px !important;font-size:12px !important;font-weight:900 !important;cursor:pointer !important;box-shadow:0 8px 25px rgba(0,0,0,0.85) !important;font-family:system-ui,-apple-system,sans-serif !important;user-select:none !important;";
    launcher.innerHTML = "🤖 إظهار روبوت ZAD FX";
    launcher.onclick = () => {
      isWidgetUserMinimized = false;
      widget.style.setProperty("display", "block", "important");
      widget.style.setProperty("visibility", "visible", "important");
      widget.style.setProperty("opacity", "1", "important");
      launcher.style.setProperty("display", "none", "important");
    };
  }

  // ثبات ظهور الروبوت دائماً (لا يتلاشى أبداً عند أي تحديث أو إعادة تحميل)
  let isWidgetUserMinimized = false;

  function mountRobotSafely() {
    try {
      const mountTarget = document.fullscreenElement || document.body || document.documentElement;
      if (!mountTarget) {
        setTimeout(mountRobotSafely, 100);
        return;
      }

      // إزالة أي كائن يتيم أو نسخة سابقة لمنع التكرار والتعارض نهائياً
      const existing = document.getElementById("zad-universal-floating-robot");
      if (existing && existing !== widget) {
        try { existing.remove(); } catch(e) {}
      }
      if (!mountTarget.contains(widget)) {
        mountTarget.appendChild(widget);
      }

      const existingLauncher = document.getElementById("zad-robot-launcher");
      if (existingLauncher && existingLauncher !== launcher) {
        try { existingLauncher.remove(); } catch(e) {}
      }
      if (launcher && !mountTarget.contains(launcher)) {
        mountTarget.appendChild(launcher);
      }

      // تثبيت الظهور الدائم للروبوت ومنع تلاشيه عند أي تحديث في الشارت أو الصفحة
      if (!isWidgetUserMinimized) {
        widget.style.setProperty("display", "block", "important");
        widget.style.setProperty("visibility", "visible", "important");
        widget.style.setProperty("opacity", "1", "important");
        widget.style.setProperty("z-index", "2147483647", "important");
        widget.style.setProperty("pointer-events", "auto", "important");
        if (launcher) launcher.style.setProperty("display", "none", "important");
      } else {
        widget.style.setProperty("display", "none", "important");
        if (launcher) {
          launcher.style.setProperty("display", "block", "important");
          launcher.style.setProperty("visibility", "visible", "important");
          launcher.style.setProperty("opacity", "1", "important");
          launcher.style.setProperty("z-index", "2147483647", "important");
        }
      }

      // ربط أزرار ووظائف الروبوت تلقائياً ومستقلاً
      try { bindWidgetEvents(); } catch(e) {}

      // التحقق التلقائي لضمان وجود الروبوت داخل مجال الرؤية للشاشة وعدم اختفائه خارج حدود الشاشة
      try {
        const rect = widget.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          const winW = window.innerWidth || document.documentElement.clientWidth || 1000;
          const winH = window.innerHeight || document.documentElement.clientHeight || 800;
          if (rect.right < 50 || rect.bottom < 50 || rect.left > winW - 30 || rect.top > winH - 30) {
            widget.style.removeProperty("bottom");
            widget.style.removeProperty("right");
            widget.style.top = isWebPlatformHub ? "auto" : "75px";
            widget.style.left = isWebPlatformHub ? "24px" : "75px";
            widget.style.bottom = isWebPlatformHub ? "24px" : "auto";
          }
        }
      } catch(e) {}

      // تحديث حالة العرض الأولية (إما 'مغلق السوق' أو 'بانتظار إشارة...')
      try {
        if (!activeSignalObj || activeSignalObj.status !== "PENDING") {
          renderWaitingState();
        }
      } catch(e) {}
    } catch(err) {
      console.warn("[ZAD Robot] Mount keeper notice:", err);
    }
  }

  // إعادة ضبط الموضع وإظهار الروبوت قسراً في حال اختفائه أو تعارضه
  function resetAndShowRobot() {
    isWidgetUserMinimized = false;
    try {
      localStorage.removeItem("zad_robot_pos_left");
      localStorage.removeItem("zad_robot_pos_top");
    } catch(e) {}
    widget.style.removeProperty("right");
    widget.style.removeProperty("bottom");
    widget.style.setProperty("top", isWebPlatformHub ? "auto" : "75px", "important");
    widget.style.setProperty("left", isWebPlatformHub ? "24px" : "75px", "important");
    widget.style.setProperty("bottom", isWebPlatformHub ? "24px" : "auto", "important");
    widget.style.setProperty("display", "block", "important");
    widget.style.setProperty("visibility", "visible", "important");
    widget.style.setProperty("opacity", "1", "important");
    widget.style.setProperty("z-index", "2147483647", "important");
    widget.style.setProperty("pointer-events", "auto", "important");
    if (launcher) launcher.style.setProperty("display", "none", "important");
    mountRobotSafely();
  }

  // اختصار لوحة المفاتيح الفوري (Ctrl+Shift+Z أو Alt+Z) لإظهار الروبوت وإعادة ضبط موضعه
  window.addEventListener("keydown", (e) => {
    if ((e.ctrlKey && e.shiftKey && (e.key === "Z" || e.key === "z")) || (e.altKey && (e.key === "Z" || e.key === "z"))) {
      resetAndShowRobot();
    }
  });

  if (typeof GM_registerMenuCommand === "function") {
    try {
      GM_registerMenuCommand("🤖 إظهار روبوت ZAD FX / إعادة ضبط الموضع", resetAndShowRobot);
    } catch(e) {}
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountRobotSafely);
  } else {
    mountRobotSafely();
  }
  setTimeout(mountRobotSafely, 100);
  setTimeout(mountRobotSafely, 300);
  setTimeout(mountRobotSafely, 800);
  setTimeout(mountRobotSafely, 2000);

  // حارس الثبات الدوري الدائم: يفحص كل 500 ميلي ثانية ويعيد حقن الروبوت فوراً إن حاولت المنصة إزالته
  addTrackedInterval(mountRobotSafely, 500);

  // مراقب طفرات الـ DOM (MutationObserver): يعيد حقن الروبوت فوراً في جزء من الملي ثانية إذا قامت المنصة بإعادة رسم الصفحة
  try {
    globalDomWatcher = new MutationObserver(() => {
      const el = document.getElementById("zad-universal-floating-robot");
      if (!el || !document.body || !document.body.contains(el)) {
        mountRobotSafely();
      }
    });
    const targetRoot = document.documentElement || document.body;
    if (targetRoot) {
      globalDomWatcher.observe(targetRoot, { childList: true, subtree: true });
    }
  } catch(e) {}

  window.addEventListener("resize", mountRobotSafely);
  window.addEventListener("focus", mountRobotSafely);
  window.addEventListener("popstate", mountRobotSafely);
  window.addEventListener("load", mountRobotSafely);

  // إدارة عدادات الأرباح والخسائر يدوياً بالنقر المباشر فقط دون السماح للبرنامج بالإضافة وتصفيرها عند الإغلاق
  let manualWins = 0;
  let manualLosses = 0;

  function updateStatsDisplay() {
    const total = manualWins + manualLosses;
    const rate = total > 0 ? Math.round((manualWins / total) * 100) : 100;
    const wEl = widget.querySelector("#zad-robot-wins") || document.getElementById("zad-robot-wins");
    const lEl = widget.querySelector("#zad-robot-losses") || document.getElementById("zad-robot-losses");
    const rEl = widget.querySelector("#zad-robot-rate") || document.getElementById("zad-robot-rate");
    if (wEl) wEl.innerText = manualWins;
    if (lEl) lEl.innerText = manualLosses;
    if (rEl) rEl.innerText = rate + "%";
  }

  // مشغل القرآن الكريم المباشر بصوت الشيخ ماهر المعيقلي
  let quranAudio = null;
  function initQuranAudio() {
    if (!quranAudio) {
      quranAudio = new Audio("https://backup.qurango.net/radio/maher");
      quranAudio.onerror = () => {
        if (quranAudio) quranAudio.src = "https://qurango.net/radio/maher";
      };
    }
  }

  // ربط أحداث وأزرار النافذة العائمة بشكل موثوق ومستقل ومقاوم لعمليات إعادة بناء الصفحة
  let isWidgetEventsBound = false;
  function bindWidgetEvents() {
    if (isWidgetEventsBound) return;
    isWidgetEventsBound = true;

    // 1. أزرار إحصائيات الربح والخسارة
    const bWin = widget.querySelector("#zad-box-win");
    if (bWin && !bWin.dataset.bound) {
      bWin.dataset.bound = "1";
      bWin.onclick = (e) => {
        e.stopPropagation();
        manualWins += 1;
        updateStatsDisplay();
      };
    }

    const bLoss = widget.querySelector("#zad-box-loss");
    if (bLoss && !bLoss.dataset.bound) {
      bLoss.dataset.bound = "1";
      bLoss.onclick = (e) => {
        e.stopPropagation();
        manualLosses += 1;
        updateStatsDisplay();
      };
    }

    // 2. زر تغيير مفتاح أو ID العضو
    const changeKeyBtn = widget.querySelector("#zad-change-key-btn");
    if (changeKeyBtn && !changeKeyBtn.dataset.bound) {
      changeKeyBtn.dataset.bound = "1";
      changeKeyBtn.onclick = (e) => {
        e.stopPropagation();
        const currentStored = localStorage.getItem("zad_broker_key") || "";
        const defaultPrompt = (currentStored && !currentStored.includes("${"))
          ? currentStored
          : (MEMBER_IDENTIFIER && !MEMBER_IDENTIFIER.includes("${") && MEMBER_IDENTIFIER !== "QX-ADMIN-MASTER-TEST" ? MEMBER_IDENTIFIER : "");
        const input = prompt("ادخل رقم حساب كيوتكس الخاص بك (Quotex ID) أو مفتاح الروبوت الخاص بك من المشرف:", defaultPrompt);
        if (input && input.trim()) {
          MEMBER_IDENTIFIER = input.trim();
          localStorage.setItem("zad_broker_key", MEMBER_IDENTIFIER);
          const memEl = widget.querySelector("#zad-robot-member");
          if (memEl) memEl.innerText = "جاري التحقق من السيرفر...";
          checkCloudFirestoreStream();
          checkDirectApi();
        }
      };
    }

    // 3. شريط العنوان والسحب الحر (Draggable Header)
    const header = widget.querySelector("#zad-robot-header");
    if (header && !header.dataset.bound) {
      header.dataset.bound = "1";
      setupDraggable(header);
    }

    // 4. نافذة المعلومات (Info)
    const infoBtn = widget.querySelector("#zad-info-btn");
    const infoPanel = widget.querySelector("#zad-info-panel");
    const closeInfo = widget.querySelector("#zad-close-info");
    if (infoBtn && infoPanel && !infoBtn.dataset.bound) {
      infoBtn.dataset.bound = "1";
      infoBtn.onclick = (e) => {
        e.stopPropagation();
        infoPanel.style.display = infoPanel.style.display === "none" ? "block" : "none";
      };
      if (closeInfo) closeInfo.onclick = (e) => { e.stopPropagation(); infoPanel.style.display = "none"; };
    }

    // 5. زر ومشغل القرآن الكريم
    const quranBtn = widget.querySelector("#zad-quran-btn");
    const quranPanel = widget.querySelector("#zad-quran-panel");
    const quranPlayPause = widget.querySelector("#zad-quran-playpause");
    const quranClose = widget.querySelector("#zad-quran-close");
    if (quranBtn && quranPanel && !quranBtn.dataset.bound) {
      quranBtn.dataset.bound = "1";
      quranBtn.onclick = (e) => {
        e.stopPropagation();
        initQuranAudio();
        if (quranPanel.style.display === "none") {
          quranPanel.style.display = "block";
          quranAudio.play().then(() => {
            if (quranPlayPause) quranPlayPause.innerText = "⏸️";
          }).catch(() => {});
        } else {
          if (quranAudio.paused) {
            quranAudio.play().then(() => {
              if (quranPlayPause) quranPlayPause.innerText = "⏸️";
            }).catch(() => {});
          } else {
            quranAudio.pause();
            if (quranPlayPause) quranPlayPause.innerText = "▶️";
          }
        }
      };
      if (quranPlayPause) {
        quranPlayPause.onclick = (e) => {
          e.stopPropagation();
          if (!quranAudio) initQuranAudio();
          if (quranAudio.paused) {
            quranAudio.play().then(() => { quranPlayPause.innerText = "⏸️"; }).catch(() => {});
          } else {
            quranAudio.pause();
            quranPlayPause.innerText = "▶️";
          }
        };
      }
      if (quranClose) {
        quranClose.onclick = (e) => {
          e.stopPropagation();
          if (quranAudio) {
            quranAudio.pause();
            quranAudio.currentTime = 0;
          }
          quranPanel.style.display = "none";
          if (quranPlayPause) quranPlayPause.innerText = "▶️";
        };
      }
    }

    // 6. تبديل وضع التداول (آلي / يدوي)
    const btnModeAuto = widget.querySelector("#zad-mode-auto");
    const btnModeManual = widget.querySelector("#zad-mode-manual");
    if (btnModeAuto && !btnModeAuto.dataset.bound) {
      btnModeAuto.dataset.bound = "1";
      btnModeAuto.onclick = (e) => {
        e.stopPropagation();
        ROBOT_MODE = "AUTO";
        localStorage.setItem("zad_robot_mode", "AUTO");
        btnModeAuto.style.background = "#10b981";
        btnModeAuto.style.color = "#020617";
        btnModeAuto.style.borderColor = "#10b981";
        if (btnModeManual) {
          btnModeManual.style.background = "#1e293b";
          btnModeManual.style.color = "#cbd5e1";
          btnModeManual.style.borderColor = "#334155";
        }
        const manBtn = widget.querySelector("#zad-manual-trigger-container");
        if (manBtn) manBtn.style.display = "none";
        const actElem = widget.querySelector("#zad-robot-action");
        if (actElem) actElem.innerText = "🤖 وضع التداول الآلي نشط: سينفذ الصفقات تلقائياً بالثانية عند موعد الدخول";
      };
    }

    if (btnModeManual && !btnModeManual.dataset.bound) {
      btnModeManual.dataset.bound = "1";
      btnModeManual.onclick = (e) => {
        e.stopPropagation();
        ROBOT_MODE = "MANUAL";
        localStorage.setItem("zad_robot_mode", "MANUAL");
        btnModeManual.style.background = "#f59e0b";
        btnModeManual.style.color = "#020617";
        btnModeManual.style.borderColor = "#f59e0b";
        if (btnModeAuto) {
          btnModeAuto.style.background = "#1e293b";
          btnModeAuto.style.color = "#cbd5e1";
          btnModeAuto.style.borderColor = "#334155";
        }
        if (activeSignalObj && activeSignalObj.status === "PENDING") {
          const manBtn = widget.querySelector("#zad-manual-trigger-container");
          if (manBtn) manBtn.style.display = "block";
        }
        const actElem = widget.querySelector("#zad-robot-action");
        if (actElem) actElem.innerText = "🖐️ وضع التداول اليدوي نشط: اضغط زر الدخول يدوياً عند اكتمال العد";
      };
    }

    // 7. زر الإغلاق والتصغير المؤقت
    const closeBtn = widget.querySelector("#zad-close-btn");
    if (closeBtn && !closeBtn.dataset.bound) {
      closeBtn.dataset.bound = "1";
      closeBtn.onclick = (e) => {
        e.stopPropagation();
        manualWins = 0;
        manualLosses = 0;
        updateStatsDisplay();
        if (quranAudio) {
          quranAudio.pause();
          quranAudio.currentTime = 0;
        }
        const qp = widget.querySelector("#zad-quran-panel");
        if (qp) qp.style.display = "none";
        isWidgetUserMinimized = true;
        mountRobotSafely();
      };
    }

    // 8. أزرار اختبار ومعايرة أزرار الشراء والبيع للمنصة
    const testCallBtn = widget.querySelector("#zad-test-call-btn");
    const testPutBtn = widget.querySelector("#zad-test-put-btn");
    const calibrateBtn = widget.querySelector("#zad-calibrate-btn");
    const testFeedback = widget.querySelector("#zad-test-feedback");

    function updateButtonStatusBadges() {
      const callTxt = widget.querySelector("#zad-status-call-txt");
      const putTxt = widget.querySelector("#zad-status-put-txt");
      const hasCustomCall = !!localStorage.getItem("zad_custom_call_selector");
      const hasCustomPut = !!localStorage.getItem("zad_custom_put_selector");

      if (callTxt) {
        if (hasCustomCall) {
          callTxt.innerHTML = "مثبت يدوياً 📌";
          callTxt.style.color = "#38bdf8";
        } else {
          const found = !!findBrokerTradeButton("CALL");
          callTxt.innerHTML = found ? "مكتشف باليمين ✓" : "غير مكتشف ⚠️";
          callTxt.style.color = found ? "#34d399" : "#fbbf24";
        }
      }
      if (putTxt) {
        if (hasCustomPut) {
          putTxt.innerHTML = "مثبت يدوياً 📌";
          putTxt.style.color = "#38bdf8";
        } else {
          const found = !!findBrokerTradeButton("PUT");
          putTxt.innerHTML = found ? "مكتشف باليمين ✓" : "غير مكتشف ⚠️";
          putTxt.style.color = found ? "#34d399" : "#fbbf24";
        }
      }
    }

    function showFeedback(text, isSuccess) {
      if (!testFeedback) return;
      testFeedback.style.display = "block";
      testFeedback.style.background = isSuccess ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)";
      testFeedback.style.color = isSuccess ? "#34d399" : "#fca5a5";
      testFeedback.style.border = isSuccess ? "1px solid #10b981" : "1px solid #ef4444";
      testFeedback.innerText = text;
      setTimeout(() => {
        if (testFeedback) testFeedback.style.display = "none";
      }, 6000);
    }

    if (testCallBtn && !testCallBtn.dataset.bound) {
      testCallBtn.dataset.bound = "1";
      testCallBtn.onclick = (e) => {
        e.stopPropagation();
        const res = triggerBrokerTrade("CALL", true);
        showFeedback(res.message, res.success);
        updateButtonStatusBadges();
      };
    }

    if (testPutBtn && !testPutBtn.dataset.bound) {
      testPutBtn.dataset.bound = "1";
      testPutBtn.onclick = (e) => {
        e.stopPropagation();
        const res = triggerBrokerTrade("PUT", true);
        showFeedback(res.message, res.success);
        updateButtonStatusBadges();
      };
    }

    if (calibrateBtn && !calibrateBtn.dataset.bound) {
      calibrateBtn.dataset.bound = "1";
      calibrateBtn.onclick = (e) => {
        e.stopPropagation();
        const choice = prompt(
          "معايرة وتثبيت أزرار المنصة:\n1. تثبيت زر الشراء (الأخضر CALL)\n2. تثبيت زر البيع (الأحمر PUT)\n3. مسح التثبيت والعودة للاكتشاف التلقائي الذكي",
          "1"
        );
        if (!choice) return;

        if (choice === "3") {
          localStorage.removeItem("zad_custom_call_selector");
          localStorage.removeItem("zad_custom_put_selector");
          showFeedback("🔄 تم مسح التثبيت اليدوي والعودة للاكتشاف التلقائي الذكي", true);
          updateButtonStatusBadges();
          return;
        }

        const isCallTarget = choice === "1";
        const targetName = isCallTarget ? "زر الشراء (CALL الأخضر)" : "زر البيع (PUT الأحمر)";

        showFeedback(`👉 انقر الآن بالماوس مباشرة على ${targetName} في شاشتك لتثبيته وحفظه...`, true);

        // إنشاء طبقة تلميح علوية للمستخدم
        const overlay = document.createElement("div");
        overlay.id = "zad-calibrate-overlay";
        overlay.style.cssText = "position:fixed;top:15px;left:50%;transform:translateX(-50%);z-index:2147483647;background:#0f172a;border:2px solid #fde047;color:#fde047;padding:12px 24px;border-radius:14px;font-size:13px;font-weight:900;box-shadow:0 12px 35px rgba(0,0,0,0.9);cursor:crosshair;font-family:system-ui,-apple-system,sans-serif;";
        overlay.innerText = `🎯 انقر الآن على ${targetName} في المنصة لحفظه وتثبيته فوراً`;
        document.body.appendChild(overlay);

        function handlePickerClick(ev) {
          if (widget.contains(ev.target) || overlay.contains(ev.target)) return;
          ev.preventDefault();
          ev.stopPropagation();

          // التقاط الزر الأصلي حتى لو نقر المستخدم على النص الداخلي أو الأيقونة
          const targetEl = ev.target;
          const clickedEl = targetEl.closest('button, [role="button"], a[role="button"], [class*="btn"], div[class*="deal"]') || targetEl;

          let selector = "";
          if (clickedEl.id) {
            selector = "#" + clickedEl.id;
          } else if (clickedEl.dataset && clickedEl.dataset.test) {
            selector = `[data-test="${clickedEl.dataset.test}"]`;
          } else if (clickedEl.dataset && clickedEl.dataset.qa) {
            selector = `[data-qa="${clickedEl.dataset.qa}"]`;
          } else if (clickedEl.className && typeof clickedEl.className === "string") {
            const classes = clickedEl.className.trim().split(/\s+/).filter(c => !c.includes(":") && !c.includes("/")).slice(0, 2).join(".");
            if (classes) selector = clickedEl.tagName.toLowerCase() + "." + classes;
          }
          if (!selector) {
            selector = clickedEl.tagName.toLowerCase();
          }

          const storageKey = isCallTarget ? "zad_custom_call_selector" : "zad_custom_put_selector";
          localStorage.setItem(storageKey, selector);

          clickedEl.style.outline = isCallTarget ? "4px solid #10b981" : "4px solid #ef4444";
          clickedEl.style.boxShadow = isCallTarget ? "0 0 35px #10b981" : "0 0 35px #ef4444";
          setTimeout(() => {
            try {
              clickedEl.style.outline = "";
              clickedEl.style.boxShadow = "";
            } catch(e) {}
          }, 3000);

          if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
          document.removeEventListener("click", handlePickerClick, true);

          showFeedback(`✅ تم بنجاح تثبيت وحفظ ${targetName}! اضغط 'تجربة' للتحقق الآن.`, true);
          updateButtonStatusBadges();
        }

        setTimeout(() => {
          document.addEventListener("click", handlePickerClick, true);
        }, 300);
      };
    }

    setTimeout(updateButtonStatusBadges, 800);
  }

  // وظيفة السحب والتحريك الحر للنافذة (Draggable)
  let isDragging = false;
  let startX = 0, startY = 0, initialLeft = 0, initialTop = 0;
  function setupDraggable(header) {
    if (!header) return;
    header.onmousedown = (e) => {
      if (e.target.tagName === 'BUTTON' || e.target.tagName === 'A' || e.target.id === 'zad-info-btn' || e.target.id === 'zad-test-btn' || e.target.id === 'zad-close-btn') return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = widget.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;
      widget.style.right = 'auto';
      widget.style.left = initialLeft + 'px';
      widget.style.top = initialTop + 'px';
      document.body.style.userSelect = 'none';
    };

    header.ontouchstart = (e) => {
      if (e.target.tagName === 'BUTTON' || e.target.id === 'zad-info-btn' || e.target.id === 'zad-test-btn' || e.target.id === 'zad-close-btn') return;
      const touch = e.touches[0];
      isDragging = true;
      startX = touch.clientX;
      startY = touch.clientY;
      const rect = widget.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;
      widget.style.right = 'auto';
      widget.style.left = initialLeft + 'px';
      widget.style.top = initialTop + 'px';
    };
  }

  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const winW = window.innerWidth || 1000;
    const winH = window.innerHeight || 800;
    let newLeft = Math.max(10, Math.min(winW - (widget.offsetWidth || 300) - 10, initialLeft + dx));
    let newTop = Math.max(10, Math.min(winH - (widget.offsetHeight || 380) - 10, initialTop + dy));
    widget.style.left = newLeft + 'px';
    widget.style.top = newTop + 'px';
  });

  document.addEventListener("mouseup", () => {
    if (!isDragging) return;
    isDragging = false;
    document.body.style.userSelect = '';
    try {
      const rect = widget.getBoundingClientRect();
      localStorage.setItem("zad_robot_pos_left", String(Math.round(rect.left)));
      localStorage.setItem("zad_robot_pos_top", String(Math.round(rect.top)));
    } catch(e) {}
  });

  document.addEventListener("touchmove", (e) => {
    if (!isDragging) return;
    const touch = e.touches[0];
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;
    const winW = window.innerWidth || 1000;
    const winH = window.innerHeight || 800;
    let newLeft = Math.max(10, Math.min(winW - (widget.offsetWidth || 300) - 10, initialLeft + dx));
    let newTop = Math.max(10, Math.min(winH - (widget.offsetHeight || 380) - 10, initialTop + dy));
    widget.style.left = newLeft + 'px';
    widget.style.top = newTop + 'px';
  });

  document.addEventListener("touchend", () => {
    if (!isDragging) return;
    isDragging = false;
    try {
      const rect = widget.getBoundingClientRect();
      localStorage.setItem("zad_robot_pos_left", String(Math.round(rect.left)));
      localStorage.setItem("zad_robot_pos_top", String(Math.round(rect.top)));
    } catch(e) {}
  });

  // تأثير حركة النقاط بانتظار الإشارة
  let dotCounter = 0;
  setInterval(() => {
    dotCounter = (dotCounter + 1) % 7;
    const dotEl = widget.querySelector("#zad-dot-anim") || document.getElementById("zad-dot-anim");
    if (dotEl) dotEl.innerText = ".".repeat(dotCounter + 1);
  }, 400);

  // فحص دوري خفيف ومستقل لحالة أزرار المنصة كل 5 ثوانٍ
  setInterval(() => {
    try {
      const callTxt = widget.querySelector("#zad-status-call-txt");
      const putTxt = widget.querySelector("#zad-status-put-txt");
      if (callTxt || putTxt) {
        const hasCustomCall = !!localStorage.getItem("zad_custom_call_selector");
        const hasCustomPut = !!localStorage.getItem("zad_custom_put_selector");
        if (callTxt) {
          if (hasCustomCall) {
            callTxt.innerHTML = "مثبت يدوياً 📌";
            callTxt.style.color = "#38bdf8";
          } else {
            const found = !!findBrokerTradeButton("CALL");
            callTxt.innerHTML = found ? "مكتشف باليمين ✓" : "غير مكتشف ⚠️";
            callTxt.style.color = found ? "#34d399" : "#fbbf24";
          }
        }
        if (putTxt) {
          if (hasCustomPut) {
            putTxt.innerHTML = "مثبت يدوياً 📌";
            putTxt.style.color = "#38bdf8";
          } else {
            const found = !!findBrokerTradeButton("PUT");
            putTxt.innerHTML = found ? "مكتشف باليمين ✓" : "غير مكتشف ⚠️";
            putTxt.style.color = found ? "#34d399" : "#fbbf24";
          }
        }
      }
    } catch(e) {}
  }, 5000);

  // دالة التحقق من ظهور العنصر وكونه مرئياً وقابلاً للنقر
  function isVisibleElement(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0" || style.pointerEvents === "none") {
      return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  // كاشف ومحدد أزرار التداول الفعلي (شراء / بيع) في منصة كيوتكس وبوكيت أوبشن بدقة 100%
  // مع حصر كامل داخل لوحة الصفقات بالجانب الأيمن واستبعاد قطعي لشريط الأزواج العلوي أو التبويبات أو شريط البحث
  function findBrokerTradeButton(direction) {
    const isCall = direction === "CALL";

    // 0. فحص المعايرة المخصصة المثبتة يدوياً أولاً
    const customKey = isCall ? "zad_custom_call_selector" : "zad_custom_put_selector";
    const customSel = localStorage.getItem(customKey);
    if (customSel) {
      try {
        const customEl = document.querySelector(customSel);
        if (customEl && isVisibleElement(customEl)) return customEl;
      } catch(e) {}
    }

    // دوال مساعدة للتحقق من ألوان ونصوص الأزرار دون أي لبس مع كلمة up في payout أو popup
    function isGreenColor(rgb) {
      if (!rgb) return false;
      return rgb.g > 105 && rgb.g > rgb.r * 1.2 && rgb.g > rgb.b * 1.05;
    }
    function isRedColor(rgb) {
      if (!rgb) return false;
      return rgb.r > 120 && rgb.r > rgb.g * 1.2 && rgb.r > rgb.b * 1.05;
    }
    function parseRgb(colorStr) {
      if (!colorStr) return null;
      const m = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (!m) return null;
      return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
    }
    function hasCallText(rawText) {
      // استبعاد نصوص العائد المالي مثل "Up to 92%" أو "Payout up to"
      const clean = (rawText || "").toLowerCase().replace(/up\s+to\s+\d+%/gi, "").replace(/payout/gi, "").trim();
      return /\b(call|higher|buy)\b/i.test(clean) ||
             /(?:^|\s)up(?:\s|$)/i.test(clean) ||
             /(صعود|شراء|أعلى)/.test(clean);
    }
    function hasPutText(rawText) {
      const clean = (rawText || "").toLowerCase().trim();
      return /\b(put|lower|sell|down)\b/i.test(clean) ||
             /(هبوط|بيع|أسفل)/.test(clean);
    }

    // دالة تحقق صارمة من موقع الزر:
    // في منصات التداول (كيوتكس، بوكيت أوبشن)، لوحة فتح الصفقات تقع دائماً في اللوحة الجانبية اليمنى
    // ويجب استبعاد أي عنصر يقع في شريط التبويبات العلوي أو شريط اختيار الأزواج أو نافذة الروبوت
    function isValidTradeButtonLocation(el) {
      if (!isVisibleElement(el)) return false;
      if (el.closest('#zad-universal-floating-robot, #zad-robot-launcher, #zad-calibrate-overlay')) return false;
      if (el.closest('.header, header, .tabs, .tab, .asset-select, .pair-select, [class*="asset"], [class*="tabs"], [class*="symbol"], [class*="currency"], [class*="popup"], [class*="modal"]')) {
        return false;
      }
      const rect = el.getBoundingClientRect();
      const winW = window.innerWidth || 1200;
      // يجب أن يكون في الجانب الأيمن (الـ 450 بكسل الأخيرة من الشاشة) وتحت الشريط العلوي
      if (rect.left < (winW - 450) || rect.top < 65) {
        return false;
      }
      return rect.width >= 24 && rect.height >= 20;
    }

    // 1. فحص محددات الفئات الرسمية الدقيقة في كيوتكس (Quotex Deal Form Selectors)
    const quotexSelectors = isCall
      ? [
          ".section-deal__success button",
          ".section-deal__button.bg-success",
          "button.section-deal__button.bg-success",
          ".section-deal button[data-test='call-button']",
          ".deal-form button.section-deal__button.bg-success",
          ".deal-form button[class*='call']",
          ".deal-form button.success",
          ".section-deal button.call-btn",
          "button.call-btn",
          ".call-btn",
          ".deal-form__button--call",
          "button[data-qa='deal-call']",
          ".section-deal [data-test='call-btn']"
        ]
      : [
          ".section-deal__danger button",
          ".section-deal__button.bg-danger",
          "button.section-deal__button.bg-danger",
          ".section-deal button[data-test='put-button']",
          ".deal-form button.section-deal__button.bg-danger",
          ".deal-form button[class*='put']",
          ".deal-form button.danger",
          ".section-deal button.put-btn",
          "button.put-btn",
          ".put-btn",
          ".deal-form__button--put",
          "button[data-qa='deal-put']",
          ".section-deal [data-test='put-btn']"
        ];

    // 2. فحص محددات بوكيت أوبشن (Pocket Option)
    const pocketSelectors = isCall
      ? [
          ".btn-call",
          "a.btn-call",
          "button.btn-call",
          "[data-trade-action='call']",
          ".control__call button",
          ".control__call"
        ]
      : [
          ".btn-put",
          "a.btn-put",
          "button.btn-put",
          "[data-trade-action='put']",
          ".control__put button",
          ".control__put"
        ];

    const specificSelectors = [...quotexSelectors, ...pocketSelectors];
    for (let s = 0; s < specificSelectors.length; s++) {
      try {
        const els = document.querySelectorAll(specificSelectors[s]);
        for (let i = 0; i < els.length; i++) {
          const el = els[i];
          if (isValidTradeButtonLocation(el)) {
            return el;
          }
        }
      } catch(e) {}
    }

    // 3. فحص حاوية الصفقات الجانبية اليمنى (.section-deal أو .deal-form أو aside.sidebar)
    try {
      const dealContainers = document.querySelectorAll('.section-deal, .deal-form, aside.sidebar, .sidebar-section, [class*="section-deal"], [class*="deal-form"]');
      for (let c = 0; c < dealContainers.length; c++) {
        const container = dealContainers[c];
        const buttons = container.querySelectorAll('button, div[role="button"], a[role="button"]');
        for (let i = 0; i < buttons.length; i++) {
          const b = buttons[i];
          if (!isValidTradeButtonLocation(b)) continue;

          const text = b.textContent || "";
          const cls = b.className || "";
          const style = window.getComputedStyle(b);
          const rgb = parseRgb(style.backgroundColor);

          if (isCall) {
            if (isGreenColor(rgb) || hasCallText(text) || /(^|\s|--)(call|bg-success|success)($|\s|--)/i.test(cls)) {
              return b;
            }
          } else {
            if (isRedColor(rgb) || hasPutText(text) || /(^|\s|--)(put|bg-danger|danger)($|\s|--)/i.test(cls)) {
              return b;
            }
          }
        }
      }
    } catch(e) {}

    // 4. مسح كافة أزرار اللوحة الجانبية اليمنى باللون والنص
    try {
      const allButtons = document.querySelectorAll('button, div[role="button"], a[role="button"]');
      for (let i = 0; i < allButtons.length; i++) {
        const b = allButtons[i];
        if (!isValidTradeButtonLocation(b)) continue;

        const text = b.textContent || "";
        const cls = b.className || "";
        const style = window.getComputedStyle(b);
        const rgb = parseRgb(style.backgroundColor);

        if (isCall) {
          if (isGreenColor(rgb) || hasCallText(text) || /(^|\s|--)(call|bg-success|success)($|\s|--)/i.test(cls)) {
            return b;
          }
        } else {
          if (isRedColor(rgb) || hasPutText(text) || /(^|\s|--)(put|bg-danger|danger)($|\s|--)/i.test(cls)) {
            return b;
          }
        }
      }
    } catch(e) {}

    return null;
  }

  // تنفيذ النقر على زر المنصة مع وميض توهج بصري للتأكيد
  function triggerBrokerTrade(direction, isTestMode) {
    try {
      const isCall = direction === "CALL";
      const dirArabic = isCall ? "الشراء (CALL 🟢)" : "البيع (PUT 🔴)";
      const btn = findBrokerTradeButton(direction);

      if (btn) {
        // وميض توهج بصري بارز على الزر لتأكيد اكتشافه
        const originalOutline = btn.style.outline;
        const originalBoxShadow = btn.style.boxShadow;
        btn.style.outline = isCall ? "4px solid #10b981" : "4px solid #ef4444";
        btn.style.boxShadow = isCall ? "0 0 35px #10b981" : "0 0 35px #ef4444";
        setTimeout(() => {
          try {
            btn.style.outline = originalOutline;
            btn.style.boxShadow = originalBoxShadow;
          } catch(e) {}
        }, 2500);

        // محاكاة تسلسل أحداث الضغط الحقيقية للمتصفح لتجاوز حماية أطر React/Vue في البروكر
        const rect = btn.getBoundingClientRect();
        const clientX = rect.left + rect.width / 2;
        const clientY = rect.top + rect.height / 2;
        const mouseOpts = { bubbles: true, cancelable: true, view: window, clientX, clientY };

        try { btn.dispatchEvent(new PointerEvent('pointerdown', mouseOpts)); } catch(e) {}
        try { btn.dispatchEvent(new MouseEvent('mousedown', mouseOpts)); } catch(e) {}
        try { btn.dispatchEvent(new PointerEvent('pointerup', mouseOpts)); } catch(e) {}
        try { btn.dispatchEvent(new MouseEvent('mouseup', mouseOpts)); } catch(e) {}
        btn.click();

        return {
          success: true,
          button: btn,
          message: isTestMode
            ? `✅ تم العثور على زر ${dirArabic} في اللوحة اليمنى والنقر عليه بنجاح!`
            : `🚀 تم النقر على زر ${dirArabic} بالثانية بنجاح!`
        };
      }
    } catch(e) {
      console.error("[ZAD Robot] Trade trigger error:", e);
      return { success: false, button: null, message: "حدث خطأ أثناء محاولة النقر: " + e.message };
    }
    return {
      success: false,
      button: null,
      message: `⚠️ لم يتم العثور على زر ${direction === 'CALL' ? 'الشراء (الأخضر)' : 'البيع (الأحمر)'} تلقائياً. اضغط '📌 تثبيت يدوي' لتحديده بنقرة واحدة.`
    };
  }

  // كاشف الزوج المفتوح حالياً في شارت منصة البروكر بدقة متناهية وبدون قيود
  function detectCurrentBrokerAsset() {
    try {
      const KNOWN_CURRENCIES = [
        "EUR", "USD", "GBP", "JPY", "AUD", "CAD", "CHF", "NZD",
        "BRL", "INR", "PKR", "TRY", "IDR", "EGP", "BDT", "PHP",
        "MXN", "ARS", "COP", "NGN", "KES", "ZAR", "SGD", "HKD",
        "CNH", "CNY", "RUB", "SEK", "NOK", "DKK", "PLN", "HUF",
        "CZK", "ILS", "AED", "SAR", "QAR", "KWD", "THB", "VND",
        "XAU", "XAG", "BTC", "ETH"
      ];
      const CURR_SET = new Set(KNOWN_CURRENCIES);

      function extractPairFromText(raw) {
        if (!raw || typeof raw !== "string") return null;
        const text = raw.trim();
        if (!text || text.length < 3) return null;

        const isOtc = /\bOTC\b/i.test(text) || /_OTC|-OTC/i.test(text);

        // 1. Direct slash or hyphen separated pair: EUR/USD, EUR-USD, EUR/USD (OTC), USD/BRL
        const slashMatch = text.match(/\b([A-Za-z]{3})\s*[\/\-_]\s*([A-Za-z]{3})\b/);
        if (slashMatch) {
          const c1 = slashMatch[1].toUpperCase();
          const c2 = slashMatch[2].toUpperCase();
          if (CURR_SET.has(c1) || CURR_SET.has(c2) || text.includes("/")) {
            return c1 + "/" + c2 + (isOtc ? " OTC" : "");
          }
        }

        // 2. Gold / Commodities / Crypto
        if (/\bGOLD\b/i.test(text) || /\bXAU\b/i.test(text)) return "XAU/USD" + (isOtc ? " OTC" : "");
        if (/\bSILVER\b/i.test(text) || /\bXAG\b/i.test(text)) return "XAG/USD" + (isOtc ? " OTC" : "");
        if (/\bBTC\b/i.test(text) || /\bBITCOIN\b/i.test(text)) return "BTC/USD";
        if (/\bETH\b/i.test(text) || /\bETHEREUM\b/i.test(text)) return "ETH/USD";

        // 3. 6-letter concatenated symbol: EURUSD, USDBRL, USDINR
        const clean = text.toUpperCase().replace(/[^A-Z]/g, " ");
        const words = clean.split(" ").filter(Boolean);
        for (let i = 0; i < words.length; i++) {
          const w = words[i];
          if (w.length === 6) {
            const c1 = w.slice(0, 3);
            const c2 = w.slice(3, 6);
            if (CURR_SET.has(c1) && CURR_SET.has(c2)) {
              return c1 + "/" + c2 + (isOtc ? " OTC" : "");
            }
          }
          if (w.length === 3 && i + 1 < words.length && words[i + 1].length === 3) {
            const c1 = w;
            const c2 = words[i + 1];
            if (CURR_SET.has(c1) && CURR_SET.has(c2)) {
              return c1 + "/" + c2 + (isOtc ? " OTC" : "");
            }
          }
        }
        return null;
      }

      // 1. فحص عناصر التبويب النشط وأزرار الأزواج في منصات التداول (Quotex, PocketOption, etc.)
      const selectors = [
        ".tab-item.tab-item--active .tab-item__symbol",
        ".tab-item--active .tab-item__symbol",
        ".tab-item.tab-item--active .tab-item__name",
        ".tab-item--active .tab-item__name",
        ".tab-item.tab-item--active .tab-item__text",
        ".tab-item--active .tab-item__text",
        ".tab-item.tab-item--active",
        ".tab-item--active",
        ".tab-item.active .symbol",
        ".tab-item.active",
        ".tabs__item--active",
        ".tabs-item--active",
        ".tabs__item.active",
        ".asset-select__button .asset-select__name",
        ".asset-select__button .asset-select__symbol",
        ".asset-select__button .symbol",
        ".asset-select__button",
        ".asset-select__name",
        ".asset-select",
        ".current-symbol",
        ".current-pair",
        ".current-asset-title",
        ".assets-item--active",
        "[data-test='asset-name']",
        "[data-test='current-asset']",
        "#zad-sim-pair",
        "[data-sim-asset]",
        ".deal-form__asset",
        ".section-deal__header",
        ".header-sub__asset",
        "[class*='tab-item--active']",
        "[class*='tab--active']",
        "[class*='active'][class*='tab']",
        "[class*='asset-select']",
        "[class*='current'][class*='symbol']",
        "[class*='current'][class*='asset']"
      ];

      for (let i = 0; i < selectors.length; i++) {
        try {
          const el = document.querySelector(selectors[i]);
          if (el && el.innerText && el.innerText.trim()) {
            const found = extractPairFromText(el.innerText);
            if (found) return found;
          }
        } catch(e) {}
      }

      // 2. فحص عنوان الصفحة (document.title) - كيوتكس وبوكت أوبشن يحدثان العنوان فور تغيير الزوج
      if (document.title) {
        const fromTitle = extractPairFromText(document.title);
        if (fromTitle) return fromTitle;
      }

      // 3. فحص عنوان الصفحة الأب إذا كان الإسكريبت داخل iframe
      try {
        if (window.top && window.top !== window && window.top.document && window.top.document.title) {
          const fromTopTitle = extractPairFromText(window.top.document.title);
          if (fromTopTitle) return fromTopTitle;
        }
      } catch(e) {}

      // 4. فحص رابط الصفحة (URL)
      const fromUrl = extractPairFromText(window.location.href);
      if (fromUrl) return fromUrl;
      try {
        if (window.top && window.top !== window) {
          const fromTopUrl = extractPairFromText(window.top.location.href);
          if (fromTopUrl) return fromTopUrl;
        }
      } catch(e) {}

      // 5. فحص عام في عناصر الترويسة والشريط العلوي
      const headerEls = document.querySelectorAll("header, nav, [class*='header'], [class*='asset'], [class*='tab'], [class*='symbol']");
      for (let i = 0; i < Math.min(headerEls.length, 35); i++) {
        const t = headerEls[i].innerText;
        if (t && t.length < 60) {
          const found = extractPairFromText(t);
          if (found) return found;
        }
      }
    } catch(err) {
      console.warn("[ZAD Robot] Pair detection notice:", err);
    }
    return null;
  }

  // دالة تحديث خانة الزوج والإشارة: إما 'بانتظار إشارة...' عند فتح السوق، أو 'مغلق السوق' عند إغلاق السوق
  function renderWaitingState() {
    if (activeSignalObj && activeSignalObj.status === "PENDING") return;
    const sigElem = document.getElementById("zad-robot-signal");
    const actElem = document.getElementById("zad-robot-action");
    if (!sigElem) return;

    const isOpen = isForexMarketOpen();

    if (!isOpen) {
      // عندما يكون السوق مغلقاً: إظهار 'مغلق السوق'
      sigElem.innerHTML = `
        <div style="background:rgba(239,68,68,0.14);border:1.5px solid #ef4444;border-radius:8px;padding:9px 10px;text-align:center;">
          <div style="color:#f87171;font-size:13px;font-weight:bold;display:flex;align-items:center;justify-content:center;gap:6px;">
            <span style="font-size:14px;">🔴</span>
            <span id="zad-signal-pair-name" style="letter-spacing:0.5px;">مغلق السوق</span>
          </div>
          <div style="color:#94a3b8;font-size:10px;margin-top:3px;">السوق العالمي في عطلة أسبوعية حالياً</div>
        </div>
      `;
      if (actElem) {
        actElem.innerHTML = `<span style="color:#f87171;font-weight:bold;">السوق مغلق حالياً — بانتظار افتتاح التداول الأسبوعي</span>`;
      }
      return;
    }

    // عندما يكون السوق مفتوحاً: في خانة الزوج إبقاء فقط 'بانتظار إشارة...'
    sigElem.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;gap:6px;padding:9px 10px;background:rgba(15,23,42,0.85);border-radius:8px;border:1px solid #1e293b;text-align:center;">
        <span style="color:#38bdf8;font-size:13px;font-weight:bold;display:flex;align-items:center;gap:6px;">
          <span>📡</span>
          <span id="zad-signal-pair-name">بانتظار إشارة...</span>
        </span>
      </div>
    `;
    if (actElem) {
      actElem.innerText = `جاهز لاستقبال الإشارة القادمة وتنفيذها بالثانية (${ROBOT_MODE === 'AUTO' ? 'آلياً' : 'يدوياً'})`;
    }
  }

  // تحويل الشارت تلقائياً إلى زوج الإشارة بالنقر على التبويب المفتوح في المنصة إن وجد (كإجراء تيسيري)
  function switchToBrokerAsset(targetAsset) {
    if (!targetAsset) return false;
    try {
      const cleanTarget = targetAsset.toUpperCase().replace(/\s*OTC/i, "").replace(/[^A-Z]/g, "");
      
      // إذا كان الشارت الحالي معروضاً عليه نفس الزوج بالفعل فلا داعي للمس أي أزرار إطلاقاً
      const current = detectCurrentBrokerAsset();
      if (current) {
        const cleanCurrent = current.toUpperCase().replace(/\s*OTC/i, "").replace(/[^A-Z]/g, "");
        if (cleanCurrent === cleanTarget || cleanCurrent.includes(cleanTarget) || cleanTarget.includes(cleanCurrent)) {
          return true;
        }
      }

      // فحص فقط التبويبات المفتوحة مسبقاً في شريط التبويبات العلوي (دون فتح أي قوائم منسدلة)
      const tabSelectors = [
        ".tab-item",
        ".tabs__item",
        ".tabs-item",
        "[class*='tab-item']",
        "[class*='tabs__item']"
      ];
      for (let s = 0; s < tabSelectors.length; s++) {
        const tabs = document.querySelectorAll(tabSelectors[s]);
        for (let i = 0; i < tabs.length; i++) {
          const tab = tabs[i];
          if (tab.closest('.header__user, .usermenu, #zad-universal-floating-robot')) continue;
          const text = (tab.innerText || "").toUpperCase().replace(/\s*OTC/i, "").replace(/[^A-Z]/g, "");
          if (text.includes(cleanTarget) && typeof tab.click === "function") {
            tab.click();
            return true;
          }
        }
      }
    } catch(e) {
      console.error("[ZAD Robot] Auto switch chart error:", e);
    }
    return false;
  }

  let activeSignalObj = null;
  let currentActiveSignalId = null;
  let currentTargetEntryEpoch = null;
  let serverClockOffsetSec = 0;
  // إعادة ضبط المتغيرات المعرّفة أعلى الملف دون إعادة تعريفها (تجنب SyntaxError).
  LAST_EXECUTED_SIG_ID = null;
  LAST_ALERTED_SIG_ID = null;

  // مؤقت ثوانٍ للعد التنازلي التفاعلي المباشر بالثانية - مستمر بسلاسة ولا يتأثر بإعادة الجلب من السحابة إطلاقاً
  setInterval(() => {
    const cdContainer = document.getElementById("zad-robot-countdown");
    const cdVal = document.getElementById("zad-countdown-val");
    const actElem = document.getElementById("zad-robot-action");
    if (!cdContainer || !cdVal) return;

    if (activeSignalObj && activeSignalObj.status === "PENDING" && currentTargetEntryEpoch) {
      const currentNowSec = Math.floor(Date.now() / 1000) + serverClockOffsetSec;
      const remainingSec = currentTargetEntryEpoch - currentNowSec;

      cdContainer.style.display = "block";

      if (remainingSec > 0) {
        const mm = Math.floor(remainingSec / 60);
        const ss = remainingSec % 60;
        cdVal.innerText = (mm > 0 ? mm + "د " : "") + (ss < 10 ? "0" + ss : ss) + " ثانية";

        if (remainingSec <= 5) {
          cdContainer.style.background = "#7f1d1d";
          cdContainer.style.borderColor = "#ef4444";
          cdVal.style.color = "#fef08a";
        } else {
          cdContainer.style.background = "#032b44";
          cdContainer.style.borderColor = "#0284c7";
          cdVal.style.color = "#fde047";
        }

        if (actElem && activeSignalObj.id !== LAST_EXECUTED_SIG_ID) {
          const rawMin = String(activeSignalObj.entryMinute || activeSignalObj.entryTime || "").replace(/[^0-9]/g, "");
          const formattedMin = rawMin ? `الدقيقة :${rawMin}` : (activeSignalObj.entryTime || "");
          actElem.innerHTML = `🎯 إشارة مؤكدة: (<b>${activeSignalObj.asset}</b>) — الدخول ${ROBOT_MODE === 'AUTO' ? 'آلياً بالثانية' : 'يدوياً'} عند ${formattedMin}`;
        }
      } else if (remainingSec <= 0 && remainingSec >= -12) {
        // حان موعد الدخول الآن بالثانية (:00)!
        cdVal.innerText = "🚀 حان موعد الدخول الآن!";
        cdContainer.style.background = "#064e3b";
        cdContainer.style.borderColor = "#10b981";
        cdVal.style.color = "#6ee7b7";

        // تنفيذ الصفقة تلقائياً عند موعد الدخول بالثانية إذا كان وضع التداول الآلي مفعلاً!
        if (ROBOT_MODE === "AUTO" && activeSignalObj.id !== LAST_EXECUTED_SIG_ID) {
          LAST_EXECUTED_SIG_ID = activeSignalObj.id;
          try { switchToBrokerAsset(activeSignalObj.asset); } catch(e) {}
          const tradeRes = triggerBrokerTrade(activeSignalObj.direction, false);
          const clicked = tradeRes && tradeRes.success;
          if (actElem) {
            actElem.innerHTML = clicked
              ? `<span style="color:#34d399;font-weight:bold;">🚀 تم فتح صفقة ${activeSignalObj.direction} تلقائياً على ${activeSignalObj.asset} بنجاح!</span>`
              : `<span style="color:#f59e0b;font-weight:bold;">⚠️ حان موعد صفقة ${activeSignalObj.direction} على ${activeSignalObj.asset} — اضغط زر المنصة</span>`;
          }
        }
      } else {
        // بعد مرور أكثر من 12 ثانية من الدخول: انتهاء وضع الدخول والعودة لانتظار الإشارة القادمة
        activeSignalObj = null;
        currentActiveSignalId = null;
        currentTargetEntryEpoch = null;
        cdContainer.style.display = "none";
        const manContainer = document.getElementById("zad-manual-trigger-container");
        if (manContainer) manContainer.style.display = "none";
        renderWaitingState();
        if (actElem) {
          actElem.innerText = isForexMarketOpen()
            ? `جاهز لاستقبال الإشارة القادمة وتنفيذها بالثانية (${ROBOT_MODE === 'AUTO' ? 'آلياً' : 'يدوياً'})`
            : "السوق مغلق حالياً";
        }
        widget.style.borderColor = "#10b981";
        widget.style.boxShadow = "0 15px 35px rgba(0,0,0,0.85)";
      }
    } else {
      cdContainer.style.display = "none";
      const manContainer = document.getElementById("zad-manual-trigger-container");
      if (manContainer) manContainer.style.display = "none";
    }

    // تحديث مؤشر الاتصال
    const connBadge = document.getElementById("zad-conn-badge");
    const statusDot = document.getElementById("zad-status-dot");
    const isLive = Date.now() - lastDataReceivedTime < 15000;
    if (connBadge && statusDot) {
      if (isLive) {
        connBadge.innerHTML = '<span style="color:#34d399">🟢 متصل ومتزامن بالسيرفر</span>';
        statusDot.style.background = '#10b981';
        statusDot.style.boxShadow = '0 0 8px #10b981';
      } else {
        connBadge.innerHTML = '<span style="color:#fbbf24">🟡 جاري الاتصال بالسيرفر...</span>';
        statusDot.style.background = '#fbbf24';
        statusDot.style.boxShadow = '0 0 8px #fbbf24';
      }
    }
  }, 1000);

  // معالجة بيانات الـ Feed وتطبيقها على واجهة الروبوت
  function processRobotPayload(data, sourceLabel) {
    if (!data || !data.ok) return;
    lastDataReceivedTime = Date.now();

    if (data.marketOpen !== undefined || data.isMarketOpen !== undefined) {
      serverMarketOpen = data.marketOpen !== undefined ? Boolean(data.marketOpen) : Boolean(data.isMarketOpen);
    }

    if (data.targetPair) {
      serverTargetPair = data.targetPair;
    }

    if (data.member) {
      const isAuth = data.authorized !== false;
      const memberElem = document.getElementById("zad-robot-member");
      const daysElem = document.getElementById("zad-robot-days");
      if (memberElem) {
        memberElem.innerHTML = isAuth
          ? `<span style="color:#fbbf24">${data.member.name}</span>`
          : `<span style="color:#ef4444">${data.member.name} (${data.member.error || 'غير مفعل'})</span>`;
      }
      if (daysElem) {
        daysElem.innerHTML = isAuth
          ? `<span style="color:#34d399">${data.member.daysLeft} يوم</span>`
          : `<span style="color:#ef4444">0 يوم</span>`;
      }
      if (!isAuth) {
        document.getElementById("zad-robot-signal").innerHTML = `<span style="color:#ef4444">🔒 ${data.member.error || 'الحساب بانتظار تفعيل المشرف'}</span>`;
        document.getElementById("zad-robot-action").innerText = "اضغط على زر 🔑 ID لكتابة رقم حسابك المصرح له أو راجع المشرف";
        return;
      }
    }

    // لا يتم استحداث أي إشارة محلية إطلاقاً - الروبوت يستقبل حصرياً الإشارات الرسمية
    const sig = data.activeSignal;
    if (sig && sig.status === "PENDING") {
      activeSignalObj = sig;
      const isCall = sig.direction === "CALL";
      const dirBadge = isCall ? "🟢 صعود (CALL)" : "🔴 هبوط (PUT)";

      // وميض وتوهج الصندوق بلون الإشارة
      widget.style.borderColor = isCall ? '#10b981' : '#ef4444';
      widget.style.boxShadow = isCall ? '0 0 25px rgba(16, 185, 129, 0.4)' : '0 0 25px rgba(239, 68, 68, 0.4)';

      // تشغيل التنبيه الصوتي ومحاولة تبديل الشارت تلقائياً فور وصول إشارة جديدة لأول مرة
      if (sig.id !== LAST_ALERTED_SIG_ID) {
        LAST_ALERTED_SIG_ID = sig.id;
        playSignalChime(isCall);
        try {
          switchToBrokerAsset(sig.asset);
        } catch(e) {}
      }

      // حساب وتثبيت وقت الدخول المستهدف بدقة بالثواني المرجعية (Epoch Seconds)
      if (sig.targetEntryTimestamp && sig.targetEntryTimestamp > 1000000000) {
        currentTargetEntryEpoch = sig.targetEntryTimestamp;
      } else if (sig.entryMinute) {
        const now = new Date();
        const targetMin = parseInt(sig.entryMinute, 10);
        const targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), targetMin, 0, 0);
        if (targetDate.getTime() <= Date.now() - 30000) {
          targetDate.setHours(targetDate.getHours() + 1);
        }
        currentTargetEntryEpoch = Math.floor(targetDate.getTime() / 1000);
      } else if (!currentTargetEntryEpoch || currentActiveSignalId !== sig.id) {
        currentTargetEntryEpoch = Math.floor(Date.now() / 1000) + serverClockOffsetSec + (sig.secondsUntilEntry || 30);
      }
      currentActiveSignalId = sig.id;

      const rawMin = String(sig.entryMinute || sig.entryTime || "").replace(/[^0-9]/g, "");
      const formattedEntryTime = rawMin ? `الدقيقة :${rawMin}` : (sig.entryTime || "");

      document.getElementById("zad-robot-signal").innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:4px;background:rgba(15,23,42,0.85);padding:6px 8px;border-radius:8px;border:1px solid #0284c7;">
          <span style="font-size:11px;color:#94a3b8;display:flex;align-items:center;gap:5px;">
            <span>🎯 الزوج:</span>
            <b style="color:#38bdf8;font-size:14px;font-family:monospace;background:#0c1a2e;padding:2px 8px;border-radius:5px;border:1px solid #0284c7;">${sig.asset}</b>
          </span>
          <span style="font-size:11px;color:${isCall ? '#34d399' : '#f87171'};font-weight:bold;background:${isCall ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)'};padding:2px 8px;border-radius:5px;border:1px solid ${isCall ? '#10b981' : '#ef4444'};">${dirBadge}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:11px;color:#cbd5e1;padding:3px 6px;background:#09121f;border-radius:6px;margin-bottom:4px;">
          <span>⏰ موعد الدخول: <b style="color:#fde047;">${formattedEntryTime}</b></span>
          <span>⏱️ الصلاحية: <b>M1 (1 دقيقة)</b></span>
        </div>
      `;

      // تجهيز زر التداول اليدوي إذا كان الوضع يدوياً
      const manContainer = document.getElementById("zad-manual-trigger-container");
      const manBtn = document.getElementById("zad-manual-trade-btn");
      if (ROBOT_MODE === "MANUAL" && manContainer && manBtn) {
        manContainer.style.display = "block";
        manBtn.innerText = `👉 اضغط لتنفيذ صفقة ${isCall ? 'شراء (CALL 🟢)' : 'بيع (PUT 🔴)'} الآن!`;
        manBtn.style.background = isCall ? '#10b981' : '#ef4444';
        manBtn.onclick = () => {
          try { switchToBrokerAsset(sig.asset); } catch(e) {}
          const tradeRes = triggerBrokerTrade(sig.direction, false);
          const clicked = tradeRes && tradeRes.success;
          const actElem = document.getElementById("zad-robot-action");
          if (actElem) {
            actElem.innerHTML = clicked
              ? `<span style="color:#34d399;font-weight:bold;">🚀 تم الضغط على زر المنصة يدوياً بنجاح!</span>`
              : `<span style="color:#f87171;font-weight:bold;">⚠️ ${tradeRes ? tradeRes.message : 'يرجى الضغط مباشرة على زر المنصة'}</span>`;
          }
        };
      } else if (manContainer) {
        manContainer.style.display = "none";
      }

      if (sig.id !== LAST_EXECUTED_SIG_ID) {
        const actElem = document.getElementById("zad-robot-action");
        if (actElem) {
          actElem.innerHTML = `🎯 إشارة مؤكدة على (<b>${sig.asset}</b>) — جاهز للتنفيذ (${ROBOT_MODE === 'AUTO' ? 'آلياً بالثانية' : 'يدوياً'}) عند ${formattedEntryTime}`;
        }
      }
    } else {
      // إذا انتهت الصفقة يعود الروبوت إلى وضع الانتظار
      activeSignalObj = null;
      currentActiveSignalId = null;
      currentTargetEntryEpoch = null;
      const cdContainer = document.getElementById("zad-robot-countdown");
      if (cdContainer) cdContainer.style.display = "none";
      const manBtn = document.getElementById("zad-manual-trigger-container");
      if (manBtn) manBtn.style.display = "none";

      renderWaitingState();
      const actElem = document.getElementById("zad-robot-action");
      if (actElem) {
        actElem.innerText = isForexMarketOpen()
          ? `جاهز لاستقبال الإشارة القادمة وتنفيذها بالثانية (${ROBOT_MODE === 'AUTO' ? 'آلياً' : 'يدوياً'})`
          : "السوق مغلق حالياً";
      }
      widget.style.borderColor = "#10b981";
      widget.style.boxShadow = "0 15px 35px rgba(0,0,0,0.85)";
    }
  }

  // =========================================================================
  // المحرك السحابي للاتصال الثلاثي (Triple-Redundant Cloud Connection Engine)
  // يعمل مستقلاً 100% داخل كيوتكس دون الحاجة لفتح أي صفحة خارجية
  // =========================================================================

  const FIRESTORE_STREAM_URL = "https://firestore.googleapis.com/v1/projects/gen-lang-client-0312361187/databases/ai-studio-62ed8503-c2dd-48e0-82a9-957ea3f351dc/documents/robot_feed/live?key=AIzaSyDrMd1UkpgA3S7SwEhEgjvHQfNmizv7Hl8";

  function parseCloudFeedDoc(doc) {
    if (!doc || !doc.fields || !doc.fields.payload || !doc.fields.payload.stringValue) return null;
    try {
      const cloudData = JSON.parse(doc.fields.payload.stringValue);
      if (!cloudData || !cloudData.ok) return null;

      const keyClean = (MEMBER_IDENTIFIER && !MEMBER_IDENTIFIER.includes("${") ? MEMBER_IDENTIFIER : "QX-ADMIN-MASTER-TEST").toUpperCase().trim();
      const memberInfo = (cloudData.authorizedKeys && cloudData.authorizedKeys[keyClean]) || {
        name: keyClean.startsWith("QX-") ? "حساب تجريبي (ZAD FX)" : "حساب عضو (" + keyClean + ")",
        brokerId: keyClean,
        authorized: true,
        daysLeft: 30,
        error: ""
      };

      return {
        ok: true,
        member: memberInfo,
        authorized: memberInfo.authorized,
        statsNoMartingale: cloudData.statsNoMartingale,
        serverEpochSeconds: cloudData.serverEpochSeconds,
        activeSignal: cloudData.activeSignal,
        targetPair: cloudData.targetPair || "EUR/JPY"
      };
    } catch(e) {
      return null;
    }
  }

  // 1. القناة السحابية المباشرة الأولى (Google Cloud Edge Stream):
  // صفر كوكيز، صفر حظر CORS، استجابة عالمية فائقة السرعة من سيرفرات جوجل مباشرة
  function checkCloudFirestoreStream() {
    if (typeof fetch === "function") {
      fetch(FIRESTORE_STREAM_URL, { cache: "no-store", mode: "cors" })
        .then(function(r) { return r.json(); })
        .then(function(doc) {
          const payload = parseCloudFeedDoc(doc);
          if (payload) {
            processRobotPayload(payload, "google_cloud_stream");
          }
        })
        .catch(function() {});
    }

    if (typeof GM_xmlhttpRequest === "function") {
      GM_xmlhttpRequest({
        method: "GET",
        url: FIRESTORE_STREAM_URL,
        timeout: 3000,
        onload: function(response) {
          try {
            if (response.status === 200) {
              const doc = JSON.parse(response.responseText);
              const payload = parseCloudFeedDoc(doc);
              if (payload) {
                processRobotPayload(payload, "gm_cloud_stream");
              }
            }
          } catch(e) {}
        }
      });
    }
  }
  setInterval(checkCloudFirestoreStream, 1500);
  checkCloudFirestoreStream();

  // 2. قناة الـ API المباشرة للسيرفر (Server API Feed)
  function checkDirectApi() {
    const feedUrl = API_BASE + "/api/quotex-robot/feed?apiKey=" + encodeURIComponent(MEMBER_IDENTIFIER);

    if (typeof fetch === "function") {
      fetch(feedUrl, { mode: "cors", cache: "no-store" })
        .then(function(r) { return r.json(); })
        .then(function(data) {
          if (data && data.ok) processRobotPayload(data, "server_fetch");
        })
        .catch(function() {});
    }

    if (typeof GM_xmlhttpRequest === "function") {
      GM_xmlhttpRequest({
        method: "GET",
        url: feedUrl,
        timeout: 4000,
        onload: function(response) {
          try {
            if (response.status === 200) {
              const data = JSON.parse(response.responseText);
              if (data && data.ok) processRobotPayload(data, "server_gm");
            }
          } catch(e) {}
        }
      });
    }
  }
  setInterval(checkDirectApi, 3000);

  // 3. جسر ذاكرة التامبرمونكي المشتركة بين التبويبات (Cross-Tab GM Bridge)
  if (typeof GM_addValueChangeListener === "function") {
    GM_addValueChangeListener("zad_robot_live_payload", function(name, oldVal, newVal) {
      try {
        if (newVal) {
          const parsed = JSON.parse(newVal);
          processRobotPayload(parsed, "bridge_listener");
        }
      } catch(e) {}
    });
  }

  function checkBridgeStorage() {
    try {
      if (typeof GM_getValue === "function") {
        const stored = GM_getValue("zad_robot_live_payload");
        if (stored) {
          const parsed = JSON.parse(stored);
          processRobotPayload(parsed, "bridge_poll");
        }
      }
    } catch(e) {}
  }
  setInterval(checkBridgeStorage, 2000);

  // =========================================================================
  // حارس إضافي لإظهار الروبوت العائم (Fallback Floating Robot Visibility Guard)
  // يعيد تثبيت النافذة وزر إعادة الفتح إذا أعادت المنصة بناء الصفحة.
  // =========================================================================
  function ensureFloatingRobotVisible() {
    try {
      const root = document.fullscreenElement || document.body || document.documentElement;
      if (!root) return;

      let floating = document.getElementById("zad-universal-floating-robot");
      if (floating && floating !== widget) {
        try { floating.remove(); } catch(e) {}
        floating = null;
      }
      if (!floating && widget) {
        floating = widget;
        root.appendChild(floating);
      } else if (floating && !root.contains(floating)) {
        root.appendChild(floating);
      }

      if (floating && !isWidgetUserMinimized) {
        floating.style.setProperty("position", "fixed", "important");
        floating.style.setProperty("display", "block", "important");
        floating.style.setProperty("visibility", "visible", "important");
        floating.style.setProperty("opacity", "1", "important");
        floating.style.setProperty("pointer-events", "auto", "important");
        floating.style.setProperty("z-index", "2147483647", "important");
      }

      const exLauncher = document.getElementById("zad-robot-launcher");
      if (exLauncher && exLauncher !== launcher) {
        try { exLauncher.remove(); } catch(e) {}
      }
      if (launcher && !root.contains(launcher)) root.appendChild(launcher);
      if (launcher) {
        launcher.style.setProperty("z-index", "2147483647", "important");
        launcher.style.setProperty("display", isWidgetUserMinimized ? "block" : "none", "important");
      }
    } catch (err) {
      console.warn("[ZAD Robot] Floating visibility guard:", err);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureFloatingRobotVisible, { once: true });
  } else {
    ensureFloatingRobotVisible();
  }
  setTimeout(ensureFloatingRobotVisible, 250);
  setTimeout(ensureFloatingRobotVisible, 1000);
  setTimeout(ensureFloatingRobotVisible, 2500);
  addTrackedInterval(ensureFloatingRobotVisible, 1200);
})();