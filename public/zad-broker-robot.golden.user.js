// ==UserScript==
// @name         روبوت ZAD FX - الروبوت العائم السحابي الشامل (Universal Cloud Broker Robot)
// @version      4.5
// @description  روبوت عائم سحابي مستقل 100% يعمل مباشرة على كيوتكس وكافة المنصات دون الحاجة لفتح أي صفحة أخرى - مزامنة فورية وتنفيذ صفقة واحدة حصرية بالثانية
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
// @noframes
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addValueChangeListener
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @connect      *.run.app
// @connect      *.zadtoo.com
// @connect      zadtoo.com
// @connect      localhost
// @connect      127.0.0.1
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
    if (window.__zadScheduledTimerId) {
      try { clearTimeout(window.__zadScheduledTimerId); } catch(e) {}
      window.__zadScheduledTimerId = null;
    }
    if (globalDomWatcher) {
      try { globalDomWatcher.disconnect(); } catch(e) {}
      globalDomWatcher = null;
    }
  };

  // حظر التشغيل داخل أي إطار فرعي (iframe) خارج المنصة الأم لمنع ازدواجية تنفيذ الصفقات نهائياً
  try {
    const _h = window.location.hostname.toLowerCase();
    const _isHubHost = _h.includes("run.app") || _h.includes("zadtoo.com") || _h.includes("localhost") || _h.includes("127.0.0.1");
    if (window.self !== window.top && !_isHubHost) {
      return;
    }
  } catch(e) {
    return;
  }

  const KNOWN_ORIGINS = [
    (window.location.origin.includes("run.app") || window.location.origin.includes("zadtoo.com")) ? window.location.origin : "",
    "https://fx.zadtoo.com",
    "https://ais-dev-vplsbzvt35dzg6l6qdryd4-317188159968.europe-west2.run.app",
    "https://ais-pre-vplsbzvt35dzg6l6qdryd4-317188159968.europe-west2.run.app"
  ].filter(Boolean);

  let API_BASE = "${appOrigin}";
  if (!API_BASE || API_BASE.includes("${") || !API_BASE.startsWith("http")) {
    API_BASE = KNOWN_ORIGINS[0] || "https://fx.zadtoo.com";
  }
  if (API_BASE.startsWith("http://") && !API_BASE.includes("localhost") && !API_BASE.includes("127.0.0.1")) {
    API_BASE = API_BASE.replace("http://", "https://");
  }

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
  let MEMBER_IDENTIFIER = savedKey || (!INJECTED_KEY.includes("${") && INJECTED_KEY ? INJECTED_KEY : "");
  if (MEMBER_IDENTIFIER && /^(QX-ADMIN-MASTER-TEST|ADMIN-MASTER-TEST|DEMO)$/i.test(MEMBER_IDENTIFIER.trim())) {
    MEMBER_IDENTIFIER = "";
    try { localStorage.removeItem("zad_broker_key"); } catch(e) {}
  }

  // بمجرد تثبيت البرنامج العائم يكون على وضع التداول اليدوي وليس الآلي افتراضياً
  let ROBOT_MODE = localStorage.getItem("zad_robot_mode") || "MANUAL"; // "MANUAL" | "AUTO"
  const ROBOT_STRATEGY_MODE = "VIP_WITH_MPB";
  try { localStorage.setItem("zad_robot_strategy_mode", "VIP_WITH_MPB"); } catch(e) {}
  let LAST_EXECUTED_SIG_ID = "";
  let LAST_ALERTED_SIG_ID = "";
  let LAST_SWITCHED_SIG_ID = "";
  let lastDataReceivedTime = 0;
  let serverTargetPair = "EUR/JPY"; // الزوج الثابت اليومي الافتراضي من لوحة المشرف
  let serverMarketOpen = null;

  // التحقق من حالة فتح السوق العالمي (الفوركس يغلق الجمعة 21:00 UTC ويفتح الأحد 21:00 UTC)
  function isForexMarketOpen() {
    if (serverMarketOpen === false) return false;
    const now = new Date();
    const day = now.getUTCDay(); // 0 = Sun, 5 = Fri, 6 = Sat
    const hour = now.getUTCHours();
    if (day === 6) return false; // السبت مغلق
    if (day === 5 && hour >= 21) return false; // الجمعة بعد 21:00 UTC مغلق
    if (day === 0 && hour < 21) return false; // الأحد قبل 21:00 UTC مغلق
    if (typeof serverMarketOpen === "boolean") return serverMarketOpen;
    return true;
  }

  const currentHost = window.location.hostname.toLowerCase();
  const isWebPlatformHub = currentHost.includes("run.app") || currentHost.includes("zadtoo.com") || currentHost.includes("localhost") || currentHost.includes("127.0.0.1");

  // مزامنة التبويب في الخلفية مع ذاكرة تامبرمونكي المشتركة فقط للعضو المرخص والمفعّل من السيرفر
  if (isWebPlatformHub) {
    console.log("%c[روبوت ZAD FX] متصل ومتزامن بالسيرفر ⚡", "color:#10b981;font-weight:bold;font-size:12px;");
    async function syncHubToTampermonkey() {
      if (!MEMBER_IDENTIFIER) return;
      try {
        const res = await fetch(window.location.origin + "/api/quotex-robot/feed?apiKey=" + encodeURIComponent(MEMBER_IDENTIFIER));
        const data = await res.json().catch(() => null);
        if (data && typeof GM_setValue === "function") {
          if (res.ok && data.ok && data.authorized === true) {
            GM_setValue("zad_robot_live_payload", JSON.stringify(data));
            GM_setValue("zad_robot_last_ping", Date.now());
          } else {
            GM_setValue("zad_robot_live_payload", JSON.stringify({
              ok: false,
              authorized: false,
              error: data.error || "الحساب غير مصرح له بتشغيل الروبوت",
              member: data.member || { name: "غير مصرح", error: data.error || "غير مصرح" }
            }));
          }
        }
      } catch(e) {}
    }
    syncHubToTampermonkey();
    addTrackedInterval(syncHubToTampermonkey, 1500);
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
  widget.style.cssText = "position:fixed !important;" + posCss + "z-index:2147483647 !important;width:245px;background:#0B0F17 !important;border:1.5px solid #10b981 !important;border-radius:12px !important;color:#f8fafc !important;font-family:system-ui,-apple-system,sans-serif !important;box-shadow:0 12px 28px rgba(0,0,0,0.85) !important;padding:7px !important;user-select:none !important;font-size:10.5px !important;transition:border-color 0.3s, box-shadow 0.3s;display:block !important;visibility:visible !important;opacity:1 !important;pointer-events:auto !important;";
  widget.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #1e293b;padding-bottom:5px;margin-bottom:5px;cursor:move;" id="zad-robot-header">
      <div style="display:flex;align-items:center;gap:4px;">
        <span style="width:7px;height:7px;border-radius:50%;background:#10b981;box-shadow:0 0 6px #10b981;display:inline-block;" id="zad-status-dot"></span>
        <strong style="font-size:11px;color:#fff;">روبوت ZAD FX</strong>
        <span style="font-size:8px;color:#fde047;background:#422006;border:1px solid #a16207;padding:0.5px 4px;border-radius:3px;font-weight:bold;">v4.5</span>
        <span style="font-size:8.5px;color:#38bdf8;background:#0c4a6e;padding:1px 4px;border-radius:3px;">${brokerName}</span>
      </div>
      <div style="display:flex;align-items:center;gap:3px;">
        <button id="zad-info-btn" style="background:#1e293b;color:#38bdf8;border:1px solid #334155;border-radius:4px;padding:1px 4px;font-size:9px;font-weight:bold;cursor:pointer;" title="معلومات وتطوير">ℹ️ info</button>
        <button id="zad-quran-btn" style="background:#064e3b;color:#6ee7b7;border:1px solid #059669;border-radius:4px;padding:1px 4px;font-size:9px;font-weight:bold;cursor:pointer;display:flex;align-items:center;gap:2px;" title="استماع للقرآن الكريم — الشيخ ماهر المعيقلي">🎧 قرآن</button>
        <button id="zad-close-btn" style="background:transparent;border:none;color:#94a3b8;font-size:12px;font-weight:bold;cursor:pointer;padding:0 2px;line-height:1;" title="إغلاق">✕</button>
      </div>
    </div>

    <!-- نافذة معلومات المبرمج والموقع والقناة الرسمية -->
    <div id="zad-info-panel" style="display:none;background:#0F172A;border:1px solid #38bdf8;border-radius:8px;padding:6px;margin-bottom:5px;font-size:9.5px;line-height:1.5;color:#e2e8f0;">
      <div style="font-weight:bold;color:#38bdf8;margin-bottom:3px;display:flex;justify-content:space-between;">
        <span>ℹ️ معلومات الروبوت</span>
        <span id="zad-close-info" style="cursor:pointer;color:#94a3b8;">✕</span>
      </div>
      <div>🌐 الموقع: <a href="https://fx.zadtoo.com" target="_blank" style="color:#10b981;text-decoration:none;font-weight:bold;">fx.zadtoo.com</a></div>
      <div>📢 القناة: <a href="https://t.me/ZadNBFX" target="_blank" style="color:#38bdf8;text-decoration:none;font-weight:bold;">ZAD FX @ZadNBFX</a></div>
      <div style="color:#fbbf24;font-size:9px;margin-top:2px;border-top:1px dashed #334155;padding-top:2px;">👨‍💻 برمجة: <b>Nabil Barakat</b></div>
    </div>

    <!-- شريط العضو وتعديل المفتاح/رقم الحساب -->
    <div style="font-size:9.5px;margin-bottom:4px;display:flex;justify-content:space-between;align-items:center;color:#cbd5e1;background:#0f172a;padding:3px 6px;border-radius:5px;border:1px solid #1e293b;">
      <div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:140px;">
        <span>العضو: <b id="zad-robot-member" style="color:#fbbf24;">${MEMBER_IDENTIFIER ? 'جاري التحقق من السيرفر...' : 'أدخل مفتاح التفعيل 🔑'}</b></span>
      </div>
      <div style="display:flex;align-items:center;gap:3px;">
        <span id="zad-robot-days" style="color:#94a3b8;font-weight:bold;">--</span>
        <button id="zad-change-key-btn" style="background:#1e293b;color:#38bdf8;border:1px solid #334155;border-radius:3px;padding:1px 4px;font-size:8.5px;font-weight:bold;cursor:pointer;" title="تغيير أو إدخال رقم حساب كيوتكس (ID) أو مفتاح الروبوت">🔑 ID</button>
      </div>
    </div>

    <!-- مشغل القرآن الكريم المصغر (الشيخ ماهر المعيقلي) أسفل اسم العضو -->
    <div id="zad-quran-panel" style="display:none;background:linear-gradient(135deg,#064e3b 0%,#022c22 100%);border:1px solid #10b981;border-radius:6px;padding:3px 6px;margin-bottom:4px;font-size:9.5px;color:#ecfdf5;box-shadow:0 3px 10px rgba(16,185,129,0.25);">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:4px;">
        <div style="display:flex;align-items:center;gap:4px;overflow:hidden;">
          <span id="zad-quran-dot" style="width:6px;height:6px;border-radius:50%;background:#34d399;box-shadow:0 0 5px #34d399;display:inline-block;"></span>
          <span style="font-weight:bold;color:#a7f3d0;white-space:nowrap;font-size:9px;">📖 الشيخ ماهر المعيقلي</span>
        </div>
        <div style="display:flex;align-items:center;gap:3px;">
          <button id="zad-quran-playpause" style="background:#047857;color:#fff;border:none;border-radius:3px;padding:1px 4px;font-size:8.5px;cursor:pointer;font-weight:bold;">⏸️</button>
          <button id="zad-quran-close" style="background:transparent;border:none;color:#94a3b8;cursor:pointer;font-size:11px;font-weight:bold;padding:0 2px;" title="إغلاق القرآن">✕</button>
        </div>
      </div>
    </div>

    <div style="font-size:8.5px;color:#94a3b8;margin-bottom:4px;text-align:center;" id="zad-conn-badge">
      <span style="color:#34d399">🟢 متصل بسيرفر أبوسليم</span>
    </div>

    <!-- أزرار تبديل وضع التداول: اليدوي مفعل افتراضياً بمجرد التثبيت -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:4px;">
      <button id="zad-mode-auto" style="padding:3.5px 2px;font-size:9.5px;font-weight:bold;border-radius:6px;border:1px solid ${ROBOT_MODE === 'AUTO' ? '#10b981' : '#334155'};background:${ROBOT_MODE === 'AUTO' ? '#10b981' : '#1e293b'};color:${ROBOT_MODE === 'AUTO' ? '#020617' : '#cbd5e1'};cursor:pointer;">🤖 تداول آلي</button>
      <button id="zad-mode-manual" style="padding:3.5px 2px;font-size:9.5px;font-weight:bold;border-radius:6px;border:1px solid ${ROBOT_MODE === 'MANUAL' ? '#f59e0b' : '#334155'};background:${ROBOT_MODE === 'MANUAL' ? '#f59e0b' : '#1e293b'};color:${ROBOT_MODE === 'MANUAL' ? '#020617' : '#cbd5e1'};cursor:pointer;">🖐️ تداول يدوي</button>
    </div>

    <!-- الاستراتيجية المعتمدة موحدة وثابتة (أحدث إصدار MPB بدون تبديل) -->
    <div style="display:none;" id="zad-strategy-wrapper">
      <span id="zad-strategy-badge">5 ثوانٍ ⚡ (MPB الموحدة)</span>
    </div>

    <!-- شريط مسح الأزواج الستة في الوقت الحقيقي (يعمل في الخلفية ومخفي عن الواجهة لتقليل المساحة) -->
    <div style="display:none;" id="zad-six-pairs-panel">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2.5px;font-size:8px;">
        <span style="color:#38bdf8;font-weight:bold;display:flex;align-items:center;gap:3px;">
          <span style="display:inline-block;width:5px;height:5px;border-radius:50%;background:#10b981;box-shadow:0 0 5px #10b981;"></span>
          <span>مسح حي لـ 6 أزواج بالتوازي:</span>
        </span>
        <span id="zad-scanner-active-count" style="color:#34d399;font-weight:extrabold;font-family:monospace;font-size:8px;">(6/6 متصل)</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(6, 1fr);gap:2px;text-align:center;" id="zad-pairs-chips">
        <div class="zad-pair-chip" id="chip-EURUSD" style="background:#0f172a;border:1px solid #334155;border-radius:3px;padding:1.5px 0;font-size:7px;color:#94a3b8;font-weight:bold;">EUR/USD</div>
        <div class="zad-pair-chip" id="chip-EURJPY" style="background:#0f172a;border:1px solid #334155;border-radius:3px;padding:1.5px 0;font-size:7px;color:#94a3b8;font-weight:bold;">EUR/JPY</div>
        <div class="zad-pair-chip" id="chip-GBPUSD" style="background:#0f172a;border:1px solid #334155;border-radius:3px;padding:1.5px 0;font-size:7px;color:#94a3b8;font-weight:bold;">GBP/USD</div>
        <div class="zad-pair-chip" id="chip-GBPJPY" style="background:#0f172a;border:1px solid #334155;border-radius:3px;padding:1.5px 0;font-size:7px;color:#94a3b8;font-weight:bold;">GBP/JPY</div>
        <div class="zad-pair-chip" id="chip-AUDUSD" style="background:#0f172a;border:1px solid #334155;border-radius:3px;padding:1.5px 0;font-size:7px;color:#94a3b8;font-weight:bold;">AUD/USD</div>
        <div class="zad-pair-chip" id="chip-USDCAD" style="background:#0f172a;border:1px solid #334155;border-radius:3px;padding:1.5px 0;font-size:7px;color:#94a3b8;font-weight:bold;">USD/CAD</div>
      </div>
    </div>

    <!-- صندوق الإشارة: يعرض إما الإشارة الحية مع العداد التنازلي أو 'وضع الانتظار WAIT' لمنع التكرار -->
    <div style="background:#111827;border:1px solid #1e293b;border-radius:8px;padding:5px 6px;margin-bottom:5px;font-size:10px;" id="zad-signal-box">
      <div id="zad-robot-signal" style="margin-bottom:3px;font-size:10.5px;"></div>
      
      <!-- عداد تنازلي تفاعلي بارز لأخذ الصفقة -->
      <div id="zad-robot-countdown" style="display:none;background:linear-gradient(135deg, #032035 0%, #01111d 100%);color:#38bdf8;padding:4px 6px;border-radius:6px;font-weight:extrabold;text-align:center;margin-bottom:4px;font-size:10px;border:1.5px solid #0284c7;box-shadow:0 0 12px rgba(2,132,199,0.3);">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:3px;">
          <span style="font-size:9.5px;color:#93c5fd;display:flex;align-items:center;gap:3px;">
            <span style="font-size:11px;">⏳</span>
            <span id="zad-countdown-label">متبقي على الصفقة:</span>
          </span>
          <span id="zad-countdown-val" style="color:#fde047;font-size:12.5px;font-family:monospace;font-weight:900;letter-spacing:0.5px;background:#061b2d;padding:1px 6px;border-radius:4px;border:1px solid #0369a1;">-- ثانية</span>
        </div>
        <div style="width:100%;background:#091b2c;border-radius:999px;height:4px;overflow:hidden;margin-top:3px;">
          <div id="zad-countdown-bar" style="background:linear-gradient(90deg,#0284c7,#38bdf8);height:100%;width:100%;border-radius:999px;transition:width 0.9s linear;"></div>
        </div>
        <div id="zad-countdown-tip" style="font-size:8.5px;color:#94a3b8;margin-top:3px;display:flex;align-items:center;justify-content:center;gap:3px;">
          <span>🎯</span>
          <span>ادخل بدقة عند ثانية :00 افتتاح الشمعة</span>
        </div>
      </div>

      <div id="zad-manual-trigger-container" style="display:none;margin-bottom:4px;">
        <button id="zad-manual-trade-btn" style="width:100%;padding:5px 4px;font-size:10px;font-weight:extrabold;border-radius:6px;background:#10b981;color:#020617;border:none;cursor:pointer;">
          🚀 اضغط هنا للدخول فوراً في المنصة!
        </button>
      </div>

      <div id="zad-robot-action" style="color:#94a3b8;font-size:8.5px;text-align:center;">جاهز لاستقبال الإشارة القادمة وتنفيذها بالثانية</div>
    </div>

    <!-- 3 مربعات ملونة مؤطرة باللون حسب النتيجة (ربح - خسارة - النسبة) النقر المباشر دون توضيح وبدون علامة + -->
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:3.5px;margin-bottom:4px;text-align:center;">
      <div id="zad-box-win" style="background:rgba(16,185,129,0.12);border:1.5px solid #10b981;border-radius:7px;padding:3px 1px;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;">
        <span style="color:#34d399;font-size:8.5px;font-weight:bold;">✅ ربح</span>
        <b id="zad-robot-wins" style="font-size:12.5px;color:#fff;font-family:monospace;margin-top:1px;">0</b>
      </div>

      <div id="zad-box-loss" style="background:rgba(239,68,68,0.12);border:1.5px solid #ef4444;border-radius:7px;padding:3px 1px;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;">
        <span style="color:#f87171;font-size:8.5px;font-weight:bold;">❌ خسارة</span>
        <b id="zad-robot-losses" style="font-size:12.5px;color:#fff;font-family:monospace;margin-top:1px;">0</b>
      </div>

      <div style="background:rgba(245,158,11,0.12);border:1.5px solid #f59e0b;border-radius:7px;padding:3px 1px;display:flex;flex-direction:column;align-items:center;justify-content:center;">
        <span style="color:#fbbf24;font-size:8.5px;font-weight:bold;">🎯 النسبة</span>
        <b id="zad-robot-rate" style="font-size:12px;color:#fbbf24;font-family:monospace;margin-top:1px;">100%</b>
      </div>
    </div>
    <!-- قسم اختبار وتثبيت أزرار المنصة (شراء / بيع / معايرة وتثبيت يدوي) -->
    <div style="background:#090d16;border:1px solid #1e293b;border-radius:8px;padding:5px 6px;margin-top:4px;font-size:9px;" id="zad-test-panel">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
        <span style="font-weight:bold;color:#38bdf8;font-size:9.5px;display:flex;align-items:center;gap:3px;">
          <span>🛠️</span>
          <span>اختبار أزرار المنصة:</span>
        </span>
        <button id="zad-calibrate-btn" style="background:#1e293b;color:#fde047;border:1px solid #ca8a04;border-radius:4px;padding:1.5px 5px;font-size:8.5px;font-weight:extrabold;cursor:pointer;transition:all 0.2s;" title="تحديد زر المنصة يدوياً بالنقر المباشر عليه">📌 تثبيت يدوي</button>
      </div>

      <div id="zad-test-status" style="font-size:8.5px;color:#94a3b8;margin-bottom:4px;display:flex;justify-content:space-between;background:rgba(15,23,42,0.6);padding:2px 4px;border-radius:4px;border:1px solid #1e293b;">
        <span>🟢 شراء: <b id="zad-status-call-txt" style="color:#34d399">مكتشف ✓</b></span>
        <span>🔴 بيع: <b id="zad-status-put-txt" style="color:#f87171">مكتشف ✓</b></span>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;">
        <button id="zad-test-call-btn" style="background:#064e3b;color:#a7f3d0;border:1.5px solid #10b981;border-radius:6px;padding:4.5px 2px;font-size:9.5px;font-weight:900;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:2px;box-shadow:0 2px 6px rgba(16,185,129,0.25);" title="تجربة النقر الفعلي على زر الشراء الأخضر في لوحة صفقات كيوتكس">
          <span>🟢 شراء (CALL)</span>
        </button>
        <button id="zad-test-put-btn" style="background:#7f1d1d;color:#fecdd3;border:1.5px solid #ef4444;border-radius:6px;padding:4.5px 2px;font-size:9.5px;font-weight:900;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:2px;box-shadow:0 2px 6px rgba(239,68,68,0.25);" title="تجربة النقر الفعلي على زر البيع الأحمر في لوحة صفقات كيوتكس">
          <span>🔴 بيع (PUT)</span>
        </button>
      </div>
      <div id="zad-test-feedback" style="display:none;margin-top:4px;font-size:8.5px;text-align:center;padding:3px 5px;border-radius:5px;font-weight:bold;line-height:1.3;"></div>
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

      // تحديث حالة العرض الأولية فقط عند أول تحميل (لمنع الوميض)
      try {
        if (!currentRobotUiState && (!activeSignalObj || activeSignalObj.status !== "PENDING")) {
          if (serverLockedInfo && serverLockedInfo.isLockedOutsideHours === true) {
            renderLockedState(serverLockedInfo);
          } else {
            renderWaitingState();
          }
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
          : (MEMBER_IDENTIFIER && !MEMBER_IDENTIFIER.includes("${") ? MEMBER_IDENTIFIER : "");
        const input = prompt("ادخل رقم حساب كيوتكس الخاص بك (Quotex ID) أو مفتاح الروبوت المفعّل من المشرف:", defaultPrompt);
        if (input !== null) {
          MEMBER_IDENTIFIER = input.trim();
          if (MEMBER_IDENTIFIER) {
            localStorage.setItem("zad_broker_key", MEMBER_IDENTIFIER);
          } else {
            localStorage.removeItem("zad_broker_key");
          }
          const memEl = widget.querySelector("#zad-robot-member");
          if (memEl) memEl.innerText = MEMBER_IDENTIFIER ? "جاري التحقق من السيرفر..." : "أدخل مفتاح التفعيل 🔑";
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

    // 6.5. الاستراتيجية موحدة ومقفلة على أحدث تحديث (VIP_WITH_MPB) بدون تبديل

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
  addTrackedInterval(() => {
    dotCounter = (dotCounter + 1) % 7;
    const dotEl = widget.querySelector("#zad-dot-anim") || document.getElementById("zad-dot-anim");
    if (dotEl) dotEl.innerText = ".".repeat(dotCounter + 1);
  }, 400);

  // فحص دوري خفيف ومستقل لحالة أزرار المنصة كل 5 ثوانٍ
  addTrackedInterval(() => {
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
      // استبعاد التبويبات العلوية وأزرار + / - وتكبير الشارت وأشرطة التنقل
      const rawTxt = (el.textContent || "").trim();
      if (rawTxt === "+" || rawTxt === "-" || rawTxt === "×") return false;
      if (el.closest('.header, header, .tabs, .tab, .asset-select, .pair-select, [class*="tabs__item"], [class*="tab-item"], [class*="popup"], [class*="modal"], [class*="zoom"], [class*="plus"], [class*="input-control"]')) {
        return false;
      }
      const rect = el.getBoundingClientRect();
      const winW = window.innerWidth || 1200;
      // إذا كان العنصر داخل حاوية الصفقات الصريحة فهو معتمد فوراً
      const inDealContainer = !!el.closest('.section-deal, .deal-form, aside.sidebar, [class*="section-deal"], [class*="deal-form"], [class*="deal_form"]');
      if (!inDealContainer) {
        if (rect.left < (winW * 0.55) || rect.top < 45) {
          return false;
        }
      }
      return rect.width >= 20 && rect.height >= 18;
    }

    // 1. فحص محددات الفئات الرسمية الدقيقة في كيوتكس (Quotex Deal Form Selectors)
    const quotexSelectors = isCall
      ? [
          "button[data-qa='deal-call']",
          "button[data-test='call-btn']",
          "button[data-test='call-button']",
          ".section-deal__success button",
          ".section-deal__button.bg-success",
          "button.section-deal__button.bg-success",
          ".deal-form button.section-deal__button.bg-success",
          ".deal-form button[class*='call']",
          ".deal-form button.success",
          ".section-deal button[class*='call']",
          ".section-deal button.bg-success",
          "button[class*='deal-call']",
          ".section-deal button.call-btn",
          "button.call-btn",
          ".call-btn",
          ".deal-form__button--call",
          ".section-deal [data-test='call-btn']"
        ]
      : [
          "button[data-qa='deal-put']",
          "button[data-test='put-btn']",
          "button[data-test='put-button']",
          ".section-deal__danger button",
          ".section-deal__button.bg-danger",
          "button.section-deal__button.bg-danger",
          ".deal-form button.section-deal__button.bg-danger",
          ".deal-form button[class*='put']",
          ".deal-form button.danger",
          ".section-deal button[class*='put']",
          ".section-deal button.bg-danger",
          "button[class*='deal-put']",
          ".section-deal button.put-btn",
          "button.put-btn",
          ".put-btn",
          ".deal-form__button--put",
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

  // قفل حماية حديدي مانع لتكرار الصفقات (Strict Single Trade Mutex)
  let globalTradeLockUntil = 0;

  // تنفيذ النقر على زر المنصة مع وميض توهج بصري للتأكيد
  function triggerBrokerTrade(direction, isTestMode) {
    try {
      const now = Date.now();
      if (!isTestMode && isWebPlatformHub) {
        return { success: false, reason: "locked", button: null, message: "تنفيذ الصفقات معطل في تبويب الموقع الأم" };
      }
      // قفل أمان صارم: منع فتح أي صفقة إذا تم فتح صفقة خلال آخر 50 ثانية
      if (!isTestMode && now < globalTradeLockUntil) {
        console.warn("[روبوت ZAD FX] ⚠️ تم حظر فتح صفقة مكررة بواسطة القفل الحديدي (Strict Mutex Lock)");
        return { success: false, reason: "locked", button: null, message: "صفقة جارية بالمنصة بالفعل — منع التكرار" };
      }

      const isCall = direction === "CALL";
      const dirArabic = isCall ? "الشراء (CALL 🟢)" : "البيع (PUT 🔴)";
      let btn = null;
      if (cachedTradeButton && cachedTradeButton.dir === direction && cachedTradeButton.el && document.body.contains(cachedTradeButton.el) && (now - cachedTradeButton.cachedAt) < 10000) {
        btn = cachedTradeButton.el;
      } else {
        btn = findBrokerTradeButton(direction);
      }

      if (btn) {
        if (!isTestMode) {
          const lastBtnClickMs = parseInt((btn.dataset && btn.dataset.zadLastClickMs) || "0", 10);
          if (lastBtnClickMs && (now - lastBtnClickMs) < 5000) {
            return { success: false, reason: "locked", button: btn, message: "تم النقر على هذا الزر للتو — منع التكرار" };
          }
          if (btn.dataset) btn.dataset.zadLastClickMs = String(now);
          globalTradeLockUntil = now + 50000; // قفل 50 ثانية كاملة
        }

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

        // نقرة حصرية واحدة مؤكدة (Single Atomic Click) لمنع أي تكرار أو فتح صفقتين
        try {
          if (typeof btn.focus === "function") btn.focus();
          const rect = btn.getBoundingClientRect();
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          const evInit = {
            bubbles: true,
            cancelable: true,
            composed: true,
            view: window,
            clientX: cx,
            clientY: cy,
            button: 0,
            buttons: 1
          };

          if (typeof btn.click === "function") {
            btn.click();
          } else {
            btn.dispatchEvent(new MouseEvent("click", { ...evInit, buttons: 0 }));
          }
        } catch(e) {
          try { if (typeof btn.click === "function") btn.click(); } catch(_e) {}
        }

        console.log(`%c[روبوت ZAD FX] 🚀 تم إرسال أمر فتح صفقة واحدة ${dirArabic} بالثانية للمنصة بنجاح!`, "color:#10b981;font-weight:bold;font-size:12px;");

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
      return { success: false, reason: "error", button: null, message: "حدث خطأ أثناء محاولة النقر: " + e.message };
    }
    return {
      success: false,
      reason: "button_not_found",
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

      // 1. فحص عنوان الزوج باللوحة اليمنى أولاً ثم التبويب النشط بدقة (تجاهل أي حاوية تضم أكثر من زوج واحد)
      const activeSelectors = [
        ".section-deal__header .pair",
        ".section-deal__header",
        ".deal-form__asset",
        ".tab-item.tab-item--active .tab-item__symbol",
        ".tab-item--active .tab-item__symbol",
        ".tab-item.tab-item--active .tab-item__name",
        ".tab-item--active .tab-item__name",
        ".tab-item.tab-item--active",
        ".tab-item--active",
        ".tab-item.active .symbol",
        ".tab-item.active",
        ".tabs__item--active",
        ".tabs-item--active",
        ".tabs__item.active",
        ".assets-item--active",
        "[class*='tab-item--active']",
        "[class*='tab--active']",
        "[aria-selected='true'][class*='tab']",
        ".header-sub__asset",
        ".asset-select__button .asset-select__symbol",
        ".asset-select__button .asset-select__name",
        ".asset-select__button",
        ".current-symbol",
        ".current-pair",
        ".current-asset-title"
      ];

      for (let i = 0; i < activeSelectors.length; i++) {
        try {
          const el = document.querySelector(activeSelectors[i]);
          if (el && !el.closest('#zad-universal-floating-robot, #zad-robot-launcher')) {
            const txt = (el.innerText || el.textContent || "").trim();
            if (txt && txt.length <= 45) {
              const allPairMatches = txt.toUpperCase().match(/[A-Z]{3}\s*[\/\-]\s*[A-Z]{3}/g);
              if (allPairMatches && allPairMatches.length > 1) continue;
              const found = extractPairFromText(txt);
              if (found) return found;
            }
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
    } catch(err) {
      console.warn("[ZAD Robot] Pair detection notice:", err);
    }
    return null;
  }

  // حالة العرض الحالية للواجهة (لمنع الوميض وإعادة بناء الـ DOM المتكررة)
  let currentRobotUiState = "";
  let currentActiveTrade = null;

  // دالة عرض صفحة الصفقة الجارية في المنصة طوال فترة فتحها (60 ثانية M1) بالثواني ودون وميض
  function renderInTradeState() {
    if (!currentActiveTrade) return;
    const sigElem = document.getElementById("zad-robot-signal");
    const actElem = document.getElementById("zad-robot-action");
    const cdContainer = document.getElementById("zad-robot-countdown");
    const manContainer = document.getElementById("zad-manual-trigger-container");
    if (cdContainer) cdContainer.style.display = "none";
    if (manContainer) manContainer.style.display = "none";
    if (!sigElem) return;

    const isCall = currentActiveTrade.direction === "CALL";
    const dirBadge = isCall ? "🟢 صعود (CALL)" : "🔴 هبوط (PUT)";
    const tradeRemainingSec = Math.max(0, Math.ceil((currentActiveTrade.expireTime - Date.now()) / 1000));

    if (currentRobotUiState !== "IN_TRADE") {
      currentRobotUiState = "IN_TRADE";
      sigElem.innerHTML = `
        <div id="zad-in-trade-card" style="background:linear-gradient(135deg, rgba(6,78,59,0.95) 0%, rgba(2,44,34,0.98) 100%);border:1.5px solid ${isCall ? '#10b981' : '#ef4444'};border-radius:7px;padding:5px 6px;text-align:center;box-shadow:0 0 15px ${isCall ? 'rgba(16,185,129,0.35)' : 'rgba(239,68,68,0.35)'};">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:3px;">
            <span style="color:#6ee7b7;font-size:10px;font-weight:900;display:flex;align-items:center;gap:3px;">
              <span style="font-size:11px;">⚡</span>
              <span>الصفقة جارية بالمنصة</span>
            </span>
            <span style="font-size:9px;font-weight:900;padding:1px 5px;border-radius:4px;background:${isCall ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)'};color:${isCall ? '#34d399' : '#f87171'};border:1px solid ${isCall ? '#10b981' : '#ef4444'};">
              ${dirBadge}
            </span>
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between;background:rgba(0,0,0,0.4);padding:2px 5px;border-radius:4px;margin-bottom:3px;font-size:9.5px;">
            <span style="color:#94a3b8;">🎯 الزوج: <b style="color:#38bdf8;font-family:monospace;font-size:11.5px;">${currentActiveTrade.asset}</b></span>
            <span style="color:#cbd5e1;">⏱️ M1 (60ث)</span>
          </div>
          <div style="background:#022c22;border:1px solid #10b981;border-radius:5px;padding:3px;margin-bottom:3px;">
            <div style="font-size:9px;color:#a7f3d0;margin-bottom:1px;">⏳ متبقي على انتهاء الصفقة:</div>
            <div id="zad-in-trade-sec" style="font-size:14px;font-weight:900;font-family:monospace;color:#fde047;letter-spacing:0.5px;">${tradeRemainingSec} ثانية</div>
            <div style="width:100%;background:#064e3b;height:3.5px;border-radius:999px;overflow:hidden;margin-top:2px;">
              <div id="zad-in-trade-bar" style="background:linear-gradient(90deg, #10b981, #34d399);height:100%;width:${(tradeRemainingSec / 60) * 100}%;border-radius:999px;transition:width 0.9s linear;"></div>
            </div>
          </div>
          <div style="font-size:8.5px;color:#94a3b8;">📊 الصفقة مفتوحة — بانتظار إغلاق الشمعة</div>
        </div>
      `;
      widget.style.borderColor = isCall ? '#10b981' : '#ef4444';
      widget.style.boxShadow = isCall ? '0 0 20px rgba(16,185,129,0.4)' : '0 0 20px rgba(239,68,68,0.4)';
    } else {
      // تحديث النصوص فقط دون المساس بـ innerHTML لمنع أي وميض
      const secEl = document.getElementById("zad-in-trade-sec");
      const barEl = document.getElementById("zad-in-trade-bar");
      const secText = tradeRemainingSec + " ثانية";
      if (secEl && secEl.textContent !== secText) secEl.textContent = secText;
      if (barEl) barEl.style.width = Math.min(100, Math.max(0, (tradeRemainingSec / 60) * 100)) + "%";
    }

    if (actElem) {
      const actText = `🚀 صفقة ${currentActiveTrade.direction} جارية على ${currentActiveTrade.asset} (متبقي ${tradeRemainingSec} ثانية)`;
      if (actElem.textContent !== actText) {
        actElem.textContent = actText;
      }
    }
  }

  let serverLockedInfo = null;
  let latestReceivedServerEpochMs = 0;

  // دالة عرض وضع التوقف الهادئ خارج أوقات العمل أو بعد تحقيق الهدف (مستقر تماماً دون وميض أو تعارض مع WAIT)
  function renderLockedState(lockedInfo) {
    if (currentActiveTrade && Date.now() < currentActiveTrade.expireTime) {
      renderInTradeState();
      return;
    }
    if (lockedInfo) {
      serverLockedInfo = { ...lockedInfo, isLockedOutsideHours: true };
    }
    const activeLock = serverLockedInfo || lockedInfo || {};
    const sigElem = document.getElementById("zad-robot-signal");
    const actElem = document.getElementById("zad-robot-action");
    const cdContainer = document.getElementById("zad-robot-countdown");
    if (cdContainer) cdContainer.style.display = "none";
    const manBtn = document.getElementById("zad-manual-trigger-container");
    if (manBtn) manBtn.style.display = "none";

    const reason = activeLock.lockReason || "الروبوت في وضع التوقف الهادئ خارج أوقات الجلسات";
    const workingHours = activeLock.workingHoursText || "الجلسة الصباحية: 10:30 ص - 01:00 م | البث المباشر: 04:30 م - 08:00 م";
    const nextSession = activeLock.nextSessionText || "بانتظار موعد انطلاق الجلسة القادمة";
    const isTargetAchieved = reason.includes("المستهدف") || reason.includes("الهدف") || reason.includes("60%+");

    const stateKey = "LOCKED_" + (isTargetAchieved ? "DONE_" : "PAUSE_") + reason.slice(0, 18);
    if (currentRobotUiState === stateKey) return;
    currentRobotUiState = stateKey;

    const cardBg = isTargetAchieved ? "rgba(6,78,59,0.28)" : "rgba(15,23,42,0.92)";
    const cardBorder = isTargetAchieved ? "#10b981" : "#f59e0b";
    const titleColor = isTargetAchieved ? "#34d399" : "#fbbf24";
    const titleIcon = isTargetAchieved ? "✅" : "⏸️";
    const titleText = isTargetAchieved ? "اكتملت الجلسة بتحقيق الهدف" : "استراحة بين الجلسات";
    const reasonColor = isTargetAchieved ? "#d1fae5" : "#e2e8f0";

    if (sigElem) {
      sigElem.innerHTML = `
        <div style="background:${cardBg};border:1.5px solid ${cardBorder};border-radius:7px;padding:6px 8px;text-align:center;">
          <div style="color:${titleColor};font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;gap:5px;">
            <span style="font-size:12px;">${titleIcon}</span>
            <span>${titleText}</span>
          </div>
          <div style="color:${reasonColor};font-size:9.5px;margin-top:3px;font-weight:600;line-height:1.4;">${reason}</div>
          <div style="margin-top:5px;background:#0f172a;border:1px solid #334155;border-radius:5px;padding:4px 6px;font-size:8.5px;color:#cbd5e1;text-align:right;line-height:1.45;">
            <div>⏰ <b>المواعيد:</b> ${workingHours}</div>
            <div style="color:#fde047;margin-top:2px;">⏳ <b>القادم:</b> ${nextSession}</div>
          </div>
        </div>
      `;
    }
    if (actElem) {
      const actMsg = isTargetAchieved
        ? "✅ تم تحقيق المستهدف الربحي بنجاح — بانتظار الجلسة القادمة"
        : "⏸️ الروبوت في استراحة مجدولة — بانتظار بدء الجلسة القادمة";
      if (actElem.textContent !== actMsg) {
        actElem.textContent = actMsg;
        actElem.style.color = isTargetAchieved ? "#34d399" : "#fbbf24";
        actElem.style.fontWeight = "bold";
      }
    }
    widget.style.borderColor = isTargetAchieved ? "#10b981" : "#64748b";
    widget.style.boxShadow = "0 10px 25px rgba(0,0,0,0.8)";
  }

  // دالة تحديث خانة الزوج والإشارة: 'وضع الانتظار (WAIT)' أو 'مغلق السوق' دون وميض نهائياً
  function renderWaitingState() {
    if (currentActiveTrade && Date.now() < currentActiveTrade.expireTime) {
      renderInTradeState();
      return;
    }
    const sigElem = document.getElementById("zad-robot-signal");
    const actElem = document.getElementById("zad-robot-action");
    if (!sigElem) return;

    const isOpen = isForexMarketOpen();
    if (!isOpen) {
      if (currentRobotUiState !== "MARKET_CLOSED") {
        currentRobotUiState = "MARKET_CLOSED";
        sigElem.innerHTML = `
          <div style="background:rgba(15,23,42,0.95);border:1.5px solid #f43f5e;border-radius:7px;padding:6px 8px;text-align:center;">
            <div style="color:#fda4af;font-size:11px;font-weight:bold;display:flex;align-items:center;justify-content:center;gap:4px;">
              <span style="font-size:12px;">⏸️</span>
              <span id="zad-signal-pair-name" style="letter-spacing:0.3px;">السوق مغلق (عطلة أسبوعية)</span>
            </div>
            <div style="color:#94a3b8;font-size:8.5px;margin-top:2px;">السوق العالمي في عطلة أسبوعية حالياً</div>
          </div>
        `;
        if (actElem) actElem.innerHTML = `<span style="color:#fda4af;font-weight:bold;">السوق مغلق حالياً — بانتظار الافتتاح</span>`;
      }
      return;
    }

    if (serverLockedInfo && serverLockedInfo.isLockedOutsideHours === true) {
      renderLockedState(serverLockedInfo);
      return;
    }

    const cSec = 60 - (new Date().getSeconds());
    const warmupNotice = typeof window.__zadWarmupReason === "string" ? window.__zadWarmupReason : "";
    const stateKey = warmupNotice ? ("WARMUP_" + warmupNotice.slice(0, 12)) : "WAITING";
    if (currentRobotUiState !== stateKey) {
      currentRobotUiState = stateKey;
      sigElem.innerHTML = `
        <div style="background:${warmupNotice ? 'rgba(6,78,59,0.22)' : '#0f172a'};border:1.5px solid ${warmupNotice ? '#10b981' : '#ca8a04'};border-radius:7px;padding:6px 7px;text-align:center;">
          <div style="color:${warmupNotice ? '#34d399' : '#fde047'};font-size:11px;font-weight:bold;display:flex;align-items:center;justify-content:center;gap:4px;">
            <span>${warmupNotice ? '☀️' : '⏸️'}</span>
            <span id="zad-signal-pair-name">${warmupNotice ? 'فترة الاستعداد ومسح الأزواج' : 'وضع الانتظار (WAIT)'}</span>
          </div>
          <div style="color:${warmupNotice ? '#a7f3d0' : '#cbd5e1'};font-size:8.5px;margin-top:2px;">${warmupNotice || 'جاري مسح السوق في الأزواج الستة المفتوحة — لن يتم التكرار'}</div>
          <div style="margin-top:4px;display:inline-flex;align-items:center;gap:4px;background:#061b2d;border:1px solid #0284c7;border-radius:5px;padding:2px 6px;font-size:9.5px;">
            <span style="color:#93c5fd;">⏳ اكتمال الشمعة:</span>
            <b id="zad-wait-candle-cd" style="color:#38bdf8;font-family:monospace;font-variant-numeric:tabular-nums;font-size:11px;">${cSec} ثانية</b>
          </div>
        </div>
      `;
      widget.style.borderColor = "#10b981";
      widget.style.boxShadow = "0 8px 20px rgba(0,0,0,0.75)";
      if (actElem) {
        const waitActText = warmupNotice
          ? `☀️ صباح الخير — جاري مسح الأزواج الستة المفتوحة (5-10 دقائق قبل أول إشارة)`
          : `جاهز لاستقبال الإشارة القادمة وتنفيذها بالثانية (${ROBOT_MODE === 'AUTO' ? 'آلياً' : 'يدوياً'})`;
        if (actElem.textContent !== waitActText) {
          actElem.textContent = waitActText;
          actElem.style.color = "#94a3b8";
          actElem.style.fontWeight = "normal";
        }
      }
    } else {
      const waitEl = document.getElementById("zad-wait-candle-cd");
      const nextSecText = cSec + " ثانية";
      if (waitEl && waitEl.textContent !== nextSecText) waitEl.textContent = nextSecText;
    }
  }

  /* =========================================================================
     🛡️ ZAD ROBOT CORE ENGINE - GOLDEN BASELINE (v3.6 LOCKED & PROTECTED)
     هذا الجزء هو محرك النقر والتبديل المعتمد بالمنصة (المقفول كمرجع أساسي ذهبي)
     لا يتم تعديل أو المساس بمنطق دالة switchToBrokerAsset أو triggerRealisticTabClick
     عند إضافة أي مؤشرات جديدة أو تعديلات في العضويات أو الرسائل.
     ========================================================================= */

  // تحويل الشارت تلقائياً إلى زوج الإشارة بالنقر المباشر والدقيق على تبويب الزوج المفتوح بالمنصة (يعمل مع جميع الأزواج والسلع ديناميكياً)
  function switchToBrokerAsset(targetAsset, force) {
    if (!targetAsset) return false;
    try {
      const rawTarget = String(targetAsset).toUpperCase().trim();
      let cleanTarget = rawTarget.replace(/\s*OTC/i, "").replace(/[^A-Z]/g, "");

      // استخراج رموز الزوج ودعم ديناميكي شامل لكافة أزواج العملات العالمية والسلع والكريبتو
      let c1 = "";
      let c2 = "";
      let isCommodityOrCrypto = false;
      let altNames = [];

      if (cleanTarget.includes("GOLD") || cleanTarget.startsWith("XAU")) {
        c1 = "XAU"; c2 = "USD";
        isCommodityOrCrypto = true;
        altNames = ["GOLD", "XAUUSD", "XAU"];
      } else if (cleanTarget.includes("SILVER") || cleanTarget.startsWith("XAG")) {
        c1 = "XAG"; c2 = "USD";
        isCommodityOrCrypto = true;
        altNames = ["SILVER", "XAGUSD", "XAG"];
      } else if (cleanTarget.includes("BITCOIN") || cleanTarget.startsWith("BTC")) {
        c1 = "BTC"; c2 = "USD";
        isCommodityOrCrypto = true;
        altNames = ["BTC", "BITCOIN", "BTCUSD"];
      } else if (cleanTarget.includes("ETHEREUM") || cleanTarget.startsWith("ETH")) {
        c1 = "ETH"; c2 = "USD";
        isCommodityOrCrypto = true;
        altNames = ["ETH", "ETHEREUM", "ETHUSD"];
      } else if (cleanTarget.length >= 6) {
        c1 = cleanTarget.slice(0, 3);
        c2 = cleanTarget.slice(3, 6);
      } else {
        return false;
      }

      // 1. إذا كان الشارت الحالي معروضاً عليه نفس الزوج بالفعل (وليس نقراً إجبارياً)
      if (!force) {
        const current = detectCurrentBrokerAsset();
        if (current) {
          const cleanCurrent = current.toUpperCase().replace(/\s*OTC/i, "").replace(/[^A-Z]/g, "");
          const curMatches = isCommodityOrCrypto 
            ? (cleanCurrent.includes(c1) || altNames.some(alt => cleanCurrent.includes(alt)))
            : (cleanCurrent.length >= 6 && cleanCurrent.slice(0, 6) === (c1 + c2));
          if (curMatches) {
            return true;
          }
        }
      }

      function isExcludedNode(n) {
        if (!n) return true;
        const raw = (n.innerText || n.textContent || "").trim();
        // حظر صريح لأزرار + / - / × أو أزرار الأيقونات الخالية من اسم الزوج
        if (raw === "+" || raw === "-" || raw === "×" || raw === "✕") return true;
        if (n.closest('#zad-universal-floating-robot, #zad-robot-launcher, #zad-calibrate-overlay, .usermenu, .header__user')) return true;
        const addEl = n.closest('.header__add, button[class*="add"], [aria-label*="Add"], [title*="Add"]');
        if (addEl) {
          const addRect = addEl.getBoundingClientRect ? addEl.getBoundingClientRect() : null;
          if (!addRect || addRect.width < 75 || (addEl.innerText || addEl.textContent || "").trim() === "+") return true;
        }
        // استبعاد أزرار تكبير الشارت فقط
        if (n.closest('[class*="zoom"]')) return true;
        return false;
      }

      // التحقق الصارم من أن العنصر يمثل تبويباً مفتوحاً لهذا الزوج تحديداً دون الاقتراب من زر + أو القائمة المنسدلة
      function isSpecificPairTabNode(el) {
        if (!el || isExcludedNode(el)) return false;
        const raw = (el.innerText || el.textContent || "").toUpperCase().trim();
        if (!raw || raw.length < 4 || raw.length > 70 || raw === "+") return false;

        // التحقق من تواجد شطري الزوج أو الاسم البديل (مثل GOLD لـ XAU/USD)
        let hasPair = false;
        if (isCommodityOrCrypto) {
          hasPair = altNames.some(alt => raw.includes(alt)) ||
                    raw.includes(c1 + '/' + c2) || raw.includes(c1 + ' / ' + c2) || raw.includes(c1 + '-' + c2) ||
                    (raw.includes(c1) && raw.includes(c2));
        } else {
          hasPair = raw.includes(c1 + '/' + c2) ||
                    raw.includes(c1 + ' / ' + c2) ||
                    raw.includes(c1 + '-' + c2) ||
                    raw.includes(c1 + c2) ||
                    (raw.includes(c1) && raw.includes(c2));
        }
        if (!hasPair) return false;

        // استبعاد أي حاوية تضم عملات رئيسية أخرى لمنع النقر على شريط التبويبات ككل
        const MAJOR_CHECK = ["EUR", "USD", "GBP", "JPY", "AUD", "CAD", "CHF", "NZD", "BRL", "INR", "BTC", "ETH", "GOLD", "SILVER"];
        const OTHER_CURR = MAJOR_CHECK.filter(c => c !== c1 && c !== c2 && !altNames.includes(c));
        let otherCount = 0;
        for (let i = 0; i < OTHER_CURR.length; i++) {
          if (raw.includes(OTHER_CURR[i])) otherCount++;
        }
        return otherCount === 0;
      }

      // نقرة واحدة واقعية ومباشرة على تبويب الزوج المفتوح (Pointer + Mouse + Click بدون لمس زر +)
      function triggerRealisticTabClick(containerNode, optionalRect, leafNode) {
        if (!containerNode || isExcludedNode(containerNode)) return false;
        try {
          const rect = optionalRect || containerNode.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) return false;
          // استبعاد الأزرار الصغيرة جداً مثل زر + أو ×
          if (rect.width < 45) return false;

          // النقر على منتصف يسار التبويب (35%) لتفادي زر الإغلاق (×) الموجود أقصى يمين التبويب
          const clientX = rect.left + Math.max(14, Math.min(rect.width * 0.35, 58));
          const clientY = rect.top + rect.height / 2;

          let dispatchTarget = containerNode;
          try {
            const pointEl = document.elementFromPoint(clientX, clientY);
            if (pointEl) {
              const pTxt = (pointEl.innerText || pointEl.textContent || "").trim();
              if (pTxt === "+" || pTxt === "×" || pTxt === "✕" || pointEl.closest('#zad-universal-floating-robot, .header__add')) {
                return false;
              }
              if (containerNode.contains(pointEl) && !pointEl.closest('button[class*="close"], [class*="close"]')) {
                dispatchTarget = pointEl;
              }
            }
          } catch(e) {}

          if (dispatchTarget === containerNode && leafNode && containerNode.contains(leafNode) && !isExcludedNode(leafNode)) {
            dispatchTarget = leafNode;
          }

          // تجنب الروابط الخارجية المنسوبة لصفحات الإيداع/السحب/الدعم فقط
          const anchorCheck = dispatchTarget.closest ? dispatchTarget.closest('a[href]') : null;
          if (anchorCheck) {
            const hrefVal = (anchorCheck.getAttribute("href") || "").toLowerCase();
            if (hrefVal && !hrefVal.startsWith("#") && !hrefVal.startsWith("javascript:") && /(deposit|withdraw|analytics|faq|support|profile|market)/i.test(hrefVal)) {
              return false;
            }
          }

          // وميض توهج مؤقت على التبويب لتأكيد الوصول البصري
          try {
            containerNode.style.outline = "2.5px solid #38bdf8";
            setTimeout(() => { try { containerNode.style.outline = ""; } catch(e) {} }, 800);
          } catch(e) {}

          const ptrOpts = {
            bubbles: true,
            cancelable: true,
            composed: true,
            view: window,
            pointerId: 1,
            pointerType: "mouse",
            isPrimary: true,
            clientX: clientX,
            clientY: clientY,
            button: 0,
            buttons: 1
          };
          const mouseOpts = {
            bubbles: true,
            cancelable: true,
            composed: true,
            view: window,
            detail: 1,
            clientX: clientX,
            clientY: clientY,
            button: 0,
            buttons: 1
          };

          if (typeof PointerEvent === "function") {
            dispatchTarget.dispatchEvent(new PointerEvent("pointerdown", ptrOpts));
          }
          dispatchTarget.dispatchEvent(new MouseEvent("mousedown", mouseOpts));
          if (typeof PointerEvent === "function") {
            dispatchTarget.dispatchEvent(new PointerEvent("pointerup", { ...ptrOpts, buttons: 0 }));
          }
          dispatchTarget.dispatchEvent(new MouseEvent("mouseup", { ...mouseOpts, buttons: 0 }));

          if (typeof dispatchTarget.click === "function") {
            dispatchTarget.click();
          } else {
            dispatchTarget.dispatchEvent(new MouseEvent("click", { ...mouseOpts, buttons: 0 }));
          }
          return true;
        } catch(err) {
          console.error("[ZAD Robot] Tab click error:", err);
          return false;
        }
      }

      function isTabAlreadyActive(node) {
        if (!node) return false;
        try {
          const cls = String(node.className || "").toLowerCase();
          if (cls.includes("active") || cls.includes("selected") || node.getAttribute("aria-selected") === "true") {
            return true;
          }
          // في كيوتكس: التبويب النشط يعرض +$ أو يطابق الزوج المكتشف باللوحة اليمنى
          const txt = (node.innerText || "").trim();
          if (txt.includes("$")) {
            return true;
          }
          const cur = detectCurrentBrokerAsset();
          if (cur) {
            const cleanCur = cur.toUpperCase().replace(/[^A-Z]/g, "");
            if (cleanCur.includes(c1 + c2)) return true;
          }
        } catch(_e) {}
        return false;
      }

      // 1. فحص مباشر في شريط التبويبات المفتوحة بالأعلى (بدون النقر على زر + نهائياً أو نقر التبويب النشط)
      const matched = [];
      const allTopNodes = document.querySelectorAll("div, button, span, li, a");
      for (let i = 0; i < allTopNodes.length; i++) {
        const n = allTopNodes[i];
        if (isExcludedNode(n)) continue;
        const rect = n.getBoundingClientRect();
        if (rect.top >= 0 && rect.bottom <= 210 && rect.width >= 50 && rect.width <= 280 && rect.height >= 18 && rect.height <= 110 && rect.left >= 30 && rect.left <= window.innerWidth) {
          if (isSpecificPairTabNode(n)) {
            matched.push({ node: n, rect: rect, area: rect.width * rect.height });
          }
        }
      }

      if (matched.length > 0) {
        matched.sort((a, b) => b.area - a.area);
        const bestContainer = matched[0];
        const smallestLeaf = matched[matched.length - 1];

        // حظر النقر المكرر إذا كان التبويب نشطاً بالفعل (لمنع فتح قائمة الأزواج المنبثقة!)
        if (isTabAlreadyActive(bestContainer.node)) {
          console.log("%c[روبوت ZAD FX] ✅ الزوج (" + targetAsset + ") نشط ومختار بالفعل — لن يتم النقر لتفادي فتح القائمة!", "color:#10b981;font-weight:bold;");
          return true;
        }

        triggerRealisticTabClick(bestContainer.node, bestContainer.rect, smallestLeaf.node);

        console.log("%c[روبوت ZAD FX] 🎯 تم التبديل مباشرة إلى تبويب الزوج المفتوح (" + targetAsset + ")!", "color:#10b981;font-weight:bold;font-size:12px;");
        const actElem = document.getElementById("zad-robot-action");
        if (actElem) {
          actElem.innerHTML = `🎯 تم التحويل الفوري إلى تبويب الزوج المفتوح (<b>${targetAsset}</b>)`;
        }
        return true;
      }

      // 2. محددات إضافية احتياطية للتبويبات المفتوحة فقط (بدون الضغط على + أو أي قائمة إضافة أزواج)
      const tabSelectors = [
        ".tab-item",
        ".tabs__item",
        ".tabs-item",
        "[class*='tab-item']",
        "[class*='tabs__item']",
        "[data-test*='tab']"
      ];
      for (let s = 0; s < tabSelectors.length; s++) {
        const tabList = document.querySelectorAll(tabSelectors[s]);
        for (let i = 0; i < tabList.length; i++) {
          const tNode = tabList[i];
          if (isSpecificPairTabNode(tNode)) {
            if (isTabAlreadyActive(tNode)) return true;
            triggerRealisticTabClick(tNode);
            return true;
          }
        }
      }

      console.log("%c[روبوت ZAD FX] ⚠️ لم يتم العثور على تبويب مفتوح للزوج (" + targetAsset + ") في الشريط العلوي", "color:#f59e0b;font-weight:bold;");
    } catch(e) {
      console.error("[ZAD Robot] Auto switch chart error:", e);
    }
    return false;
  }

  let activeSignalObj = null;
  let currentActiveSignalId = null;
  let currentTargetEntryEpoch = null;
  let serverClockOffsetMs = 0;
  let hasLiveServerClock = false;
  let bestClockRttMs = 9999;
  let cachedTradeButton = { dir: "", el: null, cachedAt: 0 };
  LAST_EXECUTED_SIG_ID = localStorage.getItem("zad_last_executed_sig_id") || "";
  let LAST_EXPIRED_SIG_ID = "";
  LAST_ALERTED_SIG_ID = null;
  let LAST_EXECUTED_TIMESTAMP = parseInt(localStorage.getItem("zad_last_executed_time") || "0", 10);
  let isTradeExecuting = false;

  // كاشف السعر اللحظي الدقيق من شاشة المنصة للتحقق من عدم انعكاس الشمعة قبل ثانية :00
  function detectBrokerLivePrice() {
    try {
      const priceSelectors = [
        ".current-price",
        ".deal-form__price",
        ".chart-tooltip__price",
        ".chart-cursor-price",
        "[data-test='current-price']",
        ".active-price"
      ];
      for (const sel of priceSelectors) {
        const el = document.querySelector(sel);
        if (el && el.textContent) {
          const num = parseFloat(el.textContent.replace(/[^0-9.]/g, ""));
          if (!isNaN(num) && num > 0) return num;
        }
      }
      const titleMatch = document.title.match(/([0-9]+\.[0-9]+)/);
      if (titleMatch) {
        const num = parseFloat(titleMatch[1]);
        if (!isNaN(num) && num > 0) return num;
      }
    } catch(e) {}
    return null;
  }

  // بروتوكول إيقاف فتح الصفقة لوضع طارئ عند انعكاس اتجاه الشمعة قبل ثانية :00
  function abortEmergencyCandleReversal(reason) {
    console.warn(`%c[روبوت ZAD FX] 🛑 تم إيقاف فتح الصفقة لوضع طارئ: ${reason}`, "color:#ef4444;font-weight:bold;font-size:12px;");
    const sigAsset = activeSignalObj ? activeSignalObj.asset : "";
    const sigDir = activeSignalObj ? activeSignalObj.direction : "";

    activeSignalObj = null;
    currentActiveSignalId = null;
    currentTargetEntryEpoch = null;

    const cdContainer = document.getElementById("zad-robot-countdown");
    if (cdContainer) cdContainer.style.display = "none";
    const manContainer = document.getElementById("zad-manual-trigger-container");
    if (manContainer) manContainer.style.display = "none";

    const sigElem = document.getElementById("zad-robot-signal");
    const actElem = document.getElementById("zad-robot-action");
    if (sigElem) {
      sigElem.innerHTML = `
        <div style="background:rgba(239,68,68,0.2);border:2px solid #ef4444;border-radius:8px;padding:6px 8px;text-align:center;box-shadow:0 0 16px rgba(239,68,68,0.5);">
          <div style="color:#f87171;font-size:11px;font-weight:900;display:flex;align-items:center;justify-content:center;gap:4px;">
            <span style="font-size:13px;">🛑</span>
            <span>إيقاف فتح الصفقة (إجراء طارئ ⚠️)</span>
          </div>
          <div style="color:#fecdd3;font-size:9px;margin-top:2.5px;font-weight:bold;">
            انعكست الشمعة فجأة قبل نقطة الدخول (:00) — تم إلغاء الصفقة لحماية المحفظة
          </div>
          <div style="color:#cbd5e1;font-size:8px;margin-top:2px;">الزوج: ${sigAsset} | الاتجاه السابق: ${sigDir}</div>
        </div>
      `;
    }
    if (actElem) {
      actElem.innerHTML = `<span style="color:#ef4444;font-weight:bold;">⚠️ تم إلغاء الصفقة قبل ثانية :00 لانعكاس اتجاه الشمعة (حماية طارئة)</span>`;
    }
    widget.style.borderColor = '#ef4444';
    widget.style.boxShadow = '0 0 25px rgba(239,68,68,0.6)';

    setTimeout(() => {
      renderWaitingState();
    }, 4500);
  }

  // دالة الحماية الحصرية لفتح صفقة واحدة فقط لا غير (Strict Single Trade Mutex عبر جميع التبويبات والإطارات)
  function executeSingleTrade(sigId, direction, source) {
    if (!sigId || isTradeExecuting || isWebPlatformHub) return false;
    if (window.__zadScheduledTimerId) {
      try { clearTimeout(window.__zadScheduledTimerId); } catch(e) {}
      window.__zadScheduledTimerId = null;
    }
    const now = Date.now();
    // تأمين حديدي ثلاثي: الذاكرة + localStorage + ذاكرة Tampermonkey المشتركة لمنع فتح أكثر من صفقة واحدة أو تكرار الإشارة
    if (sigId === LAST_EXECUTED_SIG_ID || (now - LAST_EXECUTED_TIMESTAMP) < 48000) {
      return false;
    }
    try {
      if (localStorage.getItem("zad_exec_lock_" + sigId)) return false;
      if (typeof GM_getValue === "function") {
        const gmRaw = GM_getValue("zad_gm_exec_lock_v4", "");
        if (gmRaw) {
          const gmLock = JSON.parse(gmRaw);
          if (gmLock && (gmLock.sigId === sigId || (now - (gmLock.ts || 0)) < 48000)) {
            return false;
          }
        }
      }
    } catch(e) {}

    isTradeExecuting = true;
    LAST_EXECUTED_SIG_ID = sigId;
    LAST_EXECUTED_TIMESTAMP = now;
    try {
      localStorage.setItem("zad_exec_lock_" + sigId, String(now));
      localStorage.setItem("zad_last_executed_sig_id", sigId);
      localStorage.setItem("zad_last_executed_time", String(LAST_EXECUTED_TIMESTAMP));
    } catch(e) {}
    try {
      if (typeof GM_setValue === "function") {
        GM_setValue("zad_gm_exec_lock_v4", JSON.stringify({ sigId, ts: now }));
      }
    } catch(e) {}

    console.log(`%c[روبوت ZAD FX] ⚡ تنفيذ صفقة ${direction} (Signal: ${sigId}, المصدر: ${source})...`, "color:#10b981;font-weight:bold;font-size:12px;");

    // محاولة فورية أولى
    const firstAttempt = triggerBrokerTrade(direction, false);
    if (firstAttempt && firstAttempt.success) {
      setTimeout(() => { isTradeExecuting = false; }, 2500);
      return true;
    }
    if (firstAttempt && firstAttempt.reason === "locked") {
      setTimeout(() => { isTradeExecuting = false; }, 1000);
      return false;
    }

    // إذا لم يُكتشف الزر مؤقتاً أثناء إعادة رسم الشارت، إعادة المحاولة كل 150 ملي ثانية حتى 5 مرات
    let retryCount = 0;
    const maxRetries = 5;
    const retryInterval = addTrackedInterval(() => {
      retryCount++;
      console.warn(`[روبوت ZAD FX] 🔄 إعادة محاولة النقر على زر الصفقة (${retryCount}/${maxRetries})...`);
      const retryRes = triggerBrokerTrade(direction, false);
      if (retryRes && (retryRes.success || retryRes.reason === "locked")) {
        clearInterval(retryInterval);
        setTimeout(() => { isTradeExecuting = false; }, 2500);
        if (retryRes.success) {
          console.log(`%c[روبوت ZAD FX] ✅ تم تنفيذ الصفقة بنجاح بعد ${retryCount} محاولة إعادة!`, "color:#10b981;font-weight:bold;font-size:12px;");
        }
      } else if (retryCount >= maxRetries) {
        clearInterval(retryInterval);
        console.error(`[روبوت ZAD FX] ❌ تعذر العثور على زر الصفقة بعد ${maxRetries} محاولات إعادة.`);
        isTradeExecuting = false;
      }
    }, 150);

    return false;
  }

  // مؤقت فائق الدقة (40ms) للعد التنازلي التفاعلي المباشر والتنفيذ اللحظي قبل :00.00 بأجزاء الثانية
  let robotTickCounter = 0;
  addTrackedInterval(() => {
    robotTickCounter++;
    const now = new Date();
    const currentSec = now.getSeconds();
    const currentMs = now.getMilliseconds();

    // 0. إذا كانت هناك صفقة جارية حالياً: استمرار ظهور "الصفقة جارية الآن" طوال الـ 60 ثانية كاملة دون أي وميض
    if (currentActiveTrade) {
      if (Date.now() < currentActiveTrade.expireTime) {
        renderInTradeState();
        return;
      } else {
        // انتهت مدة الصفقة (60 ثانية كاملة) - إغلاق الصفقة والعودة السلسة لوضع الانتظار
        currentActiveTrade = null;
        currentRobotUiState = "";
        activeSignalObj = null;
        currentActiveSignalId = null;
        currentTargetEntryEpoch = null;
        const cdContainer = document.getElementById("zad-robot-countdown");
        if (cdContainer) cdContainer.style.display = "none";
        renderWaitingState();
        return;
      }
    }

    const cdContainer = document.getElementById("zad-robot-countdown");
    const cdVal = document.getElementById("zad-countdown-val");
    const cdBar = document.getElementById("zad-countdown-bar");
    const cdTip = document.getElementById("zad-countdown-tip");
    const cdLabel = document.getElementById("zad-countdown-label");
    const actElem = document.getElementById("zad-robot-action");

    // 1. إذا لم تكن هناك إشارة نشطة: البقاء في الحالة المعتمدة (إما قفل خارج الجلسة أو وضع الانتظار WAIT المستقر)
    if (!activeSignalObj || activeSignalObj.status !== "PENDING" || !currentTargetEntryEpoch) {
      if (cdContainer) cdContainer.style.display = "none";
      const manContainer = document.getElementById("zad-manual-trigger-container");
      if (manContainer) manContainer.style.display = "none";
      if (serverLockedInfo && serverLockedInfo.isLockedOutsideHours === true) {
        renderLockedState(serverLockedInfo);
      } else {
        renderWaitingState();
      }
      return;
    }

    // 2. تحديث العداد التنازلي والتنفيذ الصارم عند ثانية :00.00 بدقة الملي ثانية المعايرة بالسيرفر الحي
    const currentNowMs = Date.now() + (typeof serverClockOffsetMs === "number" ? serverClockOffsetMs : 0);
    const remainingMs = (currentTargetEntryEpoch * 1000) - currentNowMs;
    const remainingSec = remainingMs / 1000;

    // إذا فات وقت دخول هذه الإشارة بأكثر من 4 ثوانٍ دون تنفيذها: إلغاء فوري دون ترحيلها للدقيقة التالية!
    if (remainingMs < -4000 || remainingSec > 180) {
      if (activeSignalObj && activeSignalObj.id && remainingMs < -4000) {
        LAST_EXPIRED_SIG_ID = activeSignalObj.id;
      }
      activeSignalObj = null;
      currentActiveSignalId = null;
      currentTargetEntryEpoch = null;
      if (cdContainer) cdContainer.style.display = "none";
      renderWaitingState();
      return;
    }

    // طلب فتح الصفقة قبل ثانية :00.00 بأجزاء من الثانية (680 ملي ثانية، أي عند :59.32)
    // لتعويض زمن النقرة واستجابة شبكة كيوتكس بحيث تصل وتُفتح مع افتتاح الشمعة الجديدة دون تأخير!
    const PRE_OPEN_LEAD_MS = 680;
    const isEntryWindow = (remainingMs <= PRE_OPEN_LEAD_MS && remainingMs >= -2500);

    // جدولة مؤقت مجهري عالي الدقة (setTimeout) عندما يتبقى أقل من 2 ثانية للقضاء على أي تأخير دوري للحلقة
    if (remainingMs > PRE_OPEN_LEAD_MS && remainingMs <= 2000 && activeSignalObj && activeSignalObj.id !== window.__zadScheduledSigId && ROBOT_MODE === "AUTO") {
      window.__zadScheduledSigId = activeSignalObj.id;
      if (window.__zadScheduledTimerId) {
        try { clearTimeout(window.__zadScheduledTimerId); } catch(e) {}
      }
      const scheduledSigId = activeSignalObj.id;
      const scheduledDir = activeSignalObj.direction;
      const scheduledAsset = activeSignalObj.asset;
      const delayUntilLeadMs = Math.max(0, Math.round(remainingMs - PRE_OPEN_LEAD_MS));
      window.__zadScheduledTimerId = setTimeout(() => {
        try {
          window.__zadScheduledTimerId = null;
          if (!activeSignalObj || activeSignalObj.id !== scheduledSigId) return;
          executeSingleTrade(scheduledSigId, scheduledDir, "micro_00_00_lead");
          currentActiveTrade = {
            sigId: scheduledSigId,
            asset: scheduledAsset,
            direction: scheduledDir,
            startTime: Date.now(),
            expireTime: Date.now() + 60000
          };
          activeSignalObj = null;
          const cdEl = document.getElementById("zad-robot-countdown");
          if (cdEl) cdEl.style.display = "none";
          renderInTradeState();
        } catch(_e) {}
      }, delayUntilLeadMs);
    }

    if (isEntryWindow) {
      if (cdVal) cdVal.textContent = ROBOT_MODE === "AUTO" ? "🤖 تنفيذ آلي فوري (:00.00)!" : "🚀 ادخل الآن (:00.00)!";
      if (cdLabel) cdLabel.textContent = ROBOT_MODE === "AUTO" ? "جاري تنفيذ الصفقة آلياً بالثانية:" : "نقطة الدخول الفورية:";

      // تنفيذ الصفقة حصرياً عند افتتاح الشمعة :00.00 وبدقة الملي ثانية (صفقة واحدة مؤمنة)
      if (ROBOT_MODE === "AUTO") {
        executeSingleTrade(activeSignalObj.id, activeSignalObj.direction, "strict_00_00_exact");
      }

      // بدء حالة "الصفقة جارية الآن" فوراً وتثبيتها طوال فترة فتحها (60 ثانية M1)
      currentActiveTrade = {
        sigId: activeSignalObj.id,
        asset: activeSignalObj.asset,
        direction: activeSignalObj.direction,
        startTime: Date.now(),
        expireTime: Date.now() + 60000
      };
      activeSignalObj = null;
      if (cdContainer) cdContainer.style.display = "none";
      renderInTradeState();
      return;
    }

    // فترة ما قبل الدخول (العد التنازلي التمهيدي الهادئ قبل ثانية :00)
    if (remainingMs > PRE_OPEN_LEAD_MS) {
      if (cdContainer) cdContainer.style.display = "block";
      const displaySec = Math.max(1, Math.ceil(remainingSec));
      const secStr = displaySec + " ثانية";
      if (cdVal && cdVal.textContent !== secStr) cdVal.textContent = secStr;
      if (cdLabel) {
        const targetLabel = ROBOT_MODE === "AUTO" ? "متبقي على التنفيذ الآلي (:00):" : "متبقي على افتتاح الشمعة (:00):";
        if (cdLabel.textContent !== targetLabel) cdLabel.textContent = targetLabel;
      }
      const maxBarSec = 5; // مؤقت 5 ثوانٍ دقيق للتنفيذ اللحظي
      if (cdBar) cdBar.style.width = Math.min(100, Math.max(5, (displaySec / maxBarSec) * 100)) + "%";

      if (ROBOT_MODE === "AUTO") {
        if (displaySec <= 5) {
          if (cdTip && cdTip.dataset.state !== "alert_auto") {
            cdTip.dataset.state = "alert_auto";
            cdTip.innerHTML = `<span style="color:#fde047;font-weight:900;">⚡ جاهزية التنفيذ الآلي (5 ثوانٍ) — سيقوم الروبوت بالنقر آلياً عند ثانية :00.00 بالضبط!</span>`;
          }
        } else {
          if (cdTip && cdTip.dataset.state !== "ready_auto") {
            cdTip.dataset.state = "ready_auto";
            cdTip.innerHTML = `<span style="color:#34d399;font-weight:bold;">🤖 تداول آلي مفعل — لا داعي للمس أي زر، سيتم الدخول آلياً عند :00.00</span>`;
          }
        }
      } else {
        if (displaySec <= 5) {
          if (cdTip && cdTip.dataset.state !== "alert") {
            cdTip.dataset.state = "alert";
            cdTip.innerHTML = `<span style="color:#fca5a5;font-weight:900;">⚡ تأكيد فوري (5 ثوانٍ)! اضغط الزر عند ثانية :00.00 تماماً</span>`;
          }
        } else {
          if (cdTip && cdTip.dataset.state !== "ready") {
            cdTip.dataset.state = "ready";
            cdTip.innerHTML = `<span>🎯 تأكيد الاتجاه — ادخل الصفقة بدقة عند ثانية :00 افتتاح الشمعة</span>`;
          }
        }
      }

      // تبديل الشارت للزوج مسبقاً بهدوء وتحضير الزر (فقط للإشارات المعلقة وقبل فوات ثانية الدخول :00)
      const nowEpochSec = Math.floor(currentNowMs / 1000);
      const isPendingSignal = activeSignalObj && activeSignalObj.status === "PENDING";
      const isBeforeCandleOpen = currentTargetEntryEpoch ? nowEpochSec < currentTargetEntryEpoch : true;
      if (isPendingSignal && isBeforeCandleOpen && activeSignalObj.asset && activeSignalObj.id !== LAST_SWITCHED_SIG_ID) {
        LAST_SWITCHED_SIG_ID = activeSignalObj.id;
        try {
          switchToBrokerAsset(activeSignalObj.asset, false);
          const preDir = activeSignalObj.direction;
          setTimeout(() => {
            try {
              const found = findBrokerTradeButton(preDir);
              if (found) cachedTradeButton = { dir: preDir, el: found, cachedAt: Date.now() };
            } catch(_e) {}
          }, 350);
        } catch(e) {}
      }

      if (actElem && activeSignalObj.id !== LAST_EXECUTED_SIG_ID) {
        const dirSymbol = activeSignalObj.direction === 'CALL' ? 'شراء صعود 🟢' : 'بيع هبوط 🔴';
        const targetAct = ROBOT_MODE === 'AUTO'
          ? `🤖 تداول آلي: جاري تجهيز صفقة (${activeSignalObj.asset} - ${dirSymbol}) للتنفيذ آلياً عند :00.00`
          : `🎯 إشارة مؤكدة: (${activeSignalObj.asset} - ${dirSymbol}) — اضغط للتنفيذ عند :00.00`;
        if (actElem.textContent !== targetAct) {
          actElem.textContent = targetAct;
        }
      }
    } else {
      if (!currentActiveTrade) {
        if (cdContainer) cdContainer.style.display = "none";
        const manContainer = document.getElementById("zad-manual-trigger-container");
        if (manContainer) manContainer.style.display = "none";
      }
    }

    // تحديث مؤشر الاتصال مرة كل ثانية (25 نبضة عند 40ms)
    if (robotTickCounter % 25 === 0) {
      const connBadge = document.getElementById("zad-conn-badge");
      const statusDot = document.getElementById("zad-status-dot");
      const isLive = Date.now() - lastDataReceivedTime < 25000;
      if (connBadge && statusDot) {
        if (isLive) {
          if (connBadge.dataset.live !== "1") {
            connBadge.dataset.live = "1";
            connBadge.innerHTML = '<span style="color:#34d399">🟢 متصل بسيرفر أبوسليم</span>';
            statusDot.style.background = '#10b981';
            statusDot.style.boxShadow = '0 0 8px #10b981';
          }
        } else {
          if (connBadge.dataset.live !== "0") {
            connBadge.dataset.live = "0";
            connBadge.innerHTML = '<span style="color:#fbbf24">🟡 جاري الاتصال بسيرفر أبوسليم...</span>';
            statusDot.style.background = '#fbbf24';
            statusDot.style.boxShadow = '0 0 8px #fbbf24';
          }
        }
      }
    }
  }, 40);

  // معالجة بيانات الـ Feed وتطبيقها على واجهة الروبوت
  function processRobotPayload(data, sourceLabel, reqStartMs) {
    if (!data || !data.ok) return;
    const nowRecvMs = Date.now();
    lastDataReceivedTime = nowRecvMs;
    const payloadEpochMs = typeof data.serverEpochMs === "number"
      ? data.serverEpochMs
      : (typeof data.serverEpochSeconds === "number" ? data.serverEpochSeconds * 1000 : 0);

    // تجاهل الحمولات القديمة المخبأة في الجسر أو الكاش لمنع تضارب الحالات ووميض الصندوق
    if (
      payloadEpochMs > 0 &&
      latestReceivedServerEpochMs > 0 &&
      (payloadEpochMs + 1500) < latestReceivedServerEpochMs &&
      (sourceLabel === "bridge_poll" || sourceLabel === "bridge_listener" || sourceLabel === "google_cloud_stream" || sourceLabel === "gm_cloud_stream")
    ) {
      return;
    }
    if (payloadEpochMs > latestReceivedServerEpochMs) {
      latestReceivedServerEpochMs = payloadEpochMs;
    }

    let sig = data.activeSignal || data.signal || null;

    // معايرة الساعة بدقة الملي ثانية حصرياً من استجابة API السيرفر الحية مع فلترة التذبذبات البطيئة وتثبيت الساعة قبل الدخول بـ 12 ثانية
    const isLiveApiSource = sourceLabel === "server_fetch" || sourceLabel === "server_gm";
    if (isLiveApiSource && (data.serverEpochMs || data.serverTimeIso || data.serverEpochSeconds)) {
      const rawRtt = typeof reqStartMs === "number" ? Math.max(0, nowRecvMs - reqStartMs) : 80;
      const rtt = Math.min(2000, rawRtt);
      const srvMs = typeof data.serverEpochMs === "number"
        ? data.serverEpochMs
        : (data.serverTimeIso ? Date.parse(data.serverTimeIso) : (data.serverEpochSeconds * 1000 + 500));
      if (srvMs && !isNaN(srvMs)) {
        const estimatedNowMs = Date.now() + (typeof serverClockOffsetMs === "number" ? serverClockOffsetMs : 0);
        const activeRemMs = (activeSignalObj && activeSignalObj.status === "PENDING" && currentTargetEntryEpoch)
          ? (currentTargetEntryEpoch * 1000) - estimatedNowMs
          : 999999;
        const isClockFrozenNearEntry = activeRemMs <= 12000 && activeRemMs >= -3000;
        const isAcceptableRtt = !hasLiveServerClock || rtt <= 450 || rtt <= (bestClockRttMs + 100);
        if (!isClockFrozenNearEntry && isAcceptableRtt) {
          const estimatedOffset = Math.round((srvMs + rtt / 2) - nowRecvMs);
          if (!hasLiveServerClock || rtt <= bestClockRttMs + 80) {
            serverClockOffsetMs = (!hasLiveServerClock || Math.abs(estimatedOffset - serverClockOffsetMs) > 400)
              ? estimatedOffset
              : Math.round(serverClockOffsetMs * 0.65 + estimatedOffset * 0.35);
          } else {
            serverClockOffsetMs = Math.round(serverClockOffsetMs * 0.85 + estimatedOffset * 0.15);
          }
          if (rtt < bestClockRttMs) bestClockRttMs = rtt;
          hasLiveServerClock = true;
        }
      }
    }

    if (data.marketOpen !== undefined || data.isMarketOpen !== undefined) {
      serverMarketOpen = data.marketOpen !== undefined ? Boolean(data.marketOpen) : Boolean(data.isMarketOpen);
    }

    if (data.targetPair) {
      serverTargetPair = data.targetPair;
    }

    const isAuth = data && data.ok === true && data.authorized === true;
    const memberElem = document.getElementById("zad-robot-member");
    const daysElem = document.getElementById("zad-robot-days");
    const errText = (data && (data.error || (data.member && data.member.error))) || "الحساب غير مفعل أو بانتظار مصادقة المشرف";
    if (memberElem) {
      const nextMemberHtml = isAuth && data.member
        ? `<span style="color:#fbbf24">${data.member.name}</span>`
        : `<span style="color:#ef4444">${(data && data.member && data.member.name) ? data.member.name : "غير مصرح"}</span>`;
      if (memberElem.innerHTML !== nextMemberHtml) memberElem.innerHTML = nextMemberHtml;
    }
    if (daysElem) {
      const nextDaysHtml = isAuth && data.member
        ? `<span style="color:#34d399">${data.member.daysLeft} يوم</span>`
        : `<span style="color:#ef4444">0 يوم</span>`;
      if (daysElem.innerHTML !== nextDaysHtml) daysElem.innerHTML = nextDaysHtml;
    }
    if (!isAuth) {
      serverLockedInfo = null;
      activeSignalObj = null;
      currentActiveSignalId = null;
      currentTargetEntryEpoch = null;
      currentRobotUiState = "UNAUTH_" + errText;
      const sigEl = document.getElementById("zad-robot-signal");
      if (sigEl) sigEl.innerHTML = `<span style="color:#ef4444;font-weight:bold;">🔒 ${errText}</span>`;
      const actEl = document.getElementById("zad-robot-action");
      if (actEl) actEl.innerText = "اضغط على زر 🔑 ID لإدخال مفتاح التفعيل أو رقم حسابك المعتمد من المشرف";
      const cdContainer = document.getElementById("zad-robot-countdown");
      if (cdContainer) cdContainer.style.display = "none";
      const manBtn = document.getElementById("zad-manual-trigger-container");
      if (manBtn) manBtn.style.display = "none";
      widget.style.borderColor = "#ef4444";
      return;
    }

    // إذا كانت هناك صفقة جارية حالياً: استمرار ظهور "الصفقة جارية الآن" طوال فترة فتحها وعدم مقاطعتها
    if (currentActiveTrade && Date.now() < currentActiveTrade.expireTime) {
      renderInTradeState();
      return;
    }

    // 1. فحص أمان صارم: إغلاق السوق العالمي (عطلة نهاية الأسبوع من الجمعة 21:00 UTC حتى الأحد 21:00 UTC)
    const isMarketOpenNow = isForexMarketOpen();
    if (!isMarketOpenNow || serverMarketOpen === false) {
      serverLockedInfo = null;
      activeSignalObj = null;
      currentActiveSignalId = null;
      currentTargetEntryEpoch = null;
      renderWaitingState();
      return;
    }

    window.__zadWarmupReason = (data.isWarmup && data.warmupReason) ? data.warmupReason : "";

    // 2. فحص قفل ساعات العمل الموحدة:
    // الجلسة الصباحية (10:30 ص - 01:00 م) + البث المباشر (04:30 م - 08:00 م) بتوقيت مصر، أو الإيقاف عند تحقق النسبة (60%+)
    const clockBaseMs = Date.now() + (typeof serverClockOffsetMs === "number" ? serverClockOffsetMs : 0);
    const cairoNow = new Date(clockBaseMs + 2 * 60 * 60 * 1000); // Egypt UTC+2
    const cairoMins = cairoNow.getUTCHours() * 60 + cairoNow.getUTCMinutes();
    const isUnifiedSessionHour =
      (cairoMins >= 10 * 60 + 30 && cairoMins < 13 * 60) ||
      (cairoMins >= 16 * 60 + 30 && cairoMins < 20 * 60);

    let shouldLock = false;
    if (data.isLockedOutsideHours === true || data.isTradingHours === false) {
      shouldLock = true;
    } else if (data.isTradingHours === true || data.isLockedOutsideHours === false) {
      shouldLock = false;
    } else {
      shouldLock = !isUnifiedSessionHour;
    }

    if (shouldLock) {
      serverLockedInfo = {
        isLockedOutsideHours: true,
        lockReason: data.lockReason || "",
        workingHoursText: data.workingHoursText || "",
        nextSessionText: data.nextSessionText || ""
      };
      activeSignalObj = null;
      currentActiveSignalId = null;
      currentTargetEntryEpoch = null;
      renderLockedState(serverLockedInfo);
      return;
    }
    serverLockedInfo = null;

    // 3. عزل الاستراتيجيات 100%:
    // عند اختيار الاستراتيجية الثانية (MPB): يتم إلغاء ومنع أي إشارة تخص الاستراتيجية العامة نهائياً
    if (sig) {
      // إشارات الروبوت المعتمدة كلها تنتمي إلى محرك MPB / VIP المباشر
      if (sig.instantExecution5s === undefined) {
        sig.instantExecution5s = true;
      }
      if (!sig.strategyType) {
        sig.strategyType = 'MOMENTUM_PAUSE_BREAKOUT';
      }
      // حظر وإلغاء زوج USD/JPY نهائياً لعدم وجود شارت عالمي له في كيوتكس
      if (sig.asset && (sig.asset.includes('USD/JPY') || sig.asset.includes('USDJPY'))) {
        sig = null;
      }
    }

    // 4. تحديث مؤشرات مسح الأزواج الستة في الواجهة (استبدال USD/JPY بـ GBP/JPY نهائياً)
    const ALL_6_PAIRS = ['EUR/USD', 'EUR/JPY', 'GBP/USD', 'AUD/USD', 'USD/CAD', 'GBP/JPY'];
    const activePairCode = (sig && sig.asset) ? sig.asset.toUpperCase().replace(/\s*OTC/i, '').trim() : '';
    ALL_6_PAIRS.forEach(p => {
      const chipId = 'chip-' + p.replace('/', '');
      const el = document.getElementById(chipId);
      if (el) {
        if (activePairCode && (activePairCode === p || activePairCode.replace('/', '') === p.replace('/', ''))) {
          el.style.background = '#065f46';
          el.style.borderColor = '#10b981';
          el.style.color = '#34d399';
          el.style.boxShadow = '0 0 8px rgba(16,185,129,0.5)';
        } else {
          el.style.background = '#0f172a';
          el.style.borderColor = '#334155';
          el.style.color = '#94a3b8';
          el.style.boxShadow = 'none';
        }
      }
    });

    // لا يتم استحداث أي إشارة محلية إطلاقاً - الروبوت يستقبل حصرياً الإشارات الرسمية المفلترة
    if (sig && sig.status === "PENDING") {
      // إذا كانت هذه الإشارة قد نُفذت أو فاتت نافذة دخولها سابقاً، لا يُعاد تفعيلها ولا تُرحَّل أبداً لدقيقة تالية!
      if (sig.id === LAST_EXECUTED_SIG_ID || sig.id === LAST_EXPIRED_SIG_ID) {
        if (currentActiveTrade && Date.now() < currentActiveTrade.expireTime) {
          renderInTradeState();
          return;
        }
        activeSignalObj = null;
        currentTargetEntryEpoch = null;
        renderWaitingState();
        return;
      }

      // إذا وصلت الإشارة عبر البث السحابي قبل معايرة ساعة السيرفر بالـ API، نطلب المعايرة فوراً في الخلفية
      if (!hasLiveServerClock && !window.__zadInstantClockSyncRequested) {
        window.__zadInstantClockSyncRequested = true;
        setTimeout(() => { window.__zadInstantClockSyncRequested = false; }, 1500);
        try { if (typeof checkDirectApi === "function") checkDirectApi(); } catch(_e) {}
      }

      // التزام مطلق بوقت الدخول الرسمي الصادر من السيرفر (نفس الدقيقة المرسلة على التليجرام تماماً)
      const clockOffsetNowMs = typeof serverClockOffsetMs === "number" ? serverClockOffsetMs : 0;
      const targetCalcEpochSec = Math.floor((Date.now() + clockOffsetNowMs) / 1000);
      if (sig.targetEntryTimestamp && sig.targetEntryTimestamp > 1000000000) {
        currentTargetEntryEpoch = sig.targetEntryTimestamp;
      } else {
        currentTargetEntryEpoch = Math.ceil(targetCalcEpochSec / 60) * 60;
      }

      const diffSec = currentTargetEntryEpoch - targetCalcEpochSec;

      // حماية حديدية لمنع فرق الدقيقة: إذا فات موعد دخول الإشارة بأكثر من 4 ثوانٍ، يتم تجاهلها فوراً دون ترحيلها للشمعة القادمة!
      if (diffSec < -4) {
        LAST_EXPIRED_SIG_ID = sig.id;
        activeSignalObj = null;
        currentTargetEntryEpoch = null;
        renderWaitingState();
        const actElem = document.getElementById("zad-robot-action");
        if (actElem) {
          actElem.innerHTML = `<span style="color:#fbbf24;">⌛ فات موعد دخول إشارة (${sig.asset} ${sig.entryTime || ''}) — بانتظار الإشارة القادمة لضمان التطابق 100%</span>`;
        }
        return;
      }

      // إتاحة استقبال وعرض الإشارة مسبقاً (حتى 180 ثانية لتبديل الزوج وتجهيز الدخول بدقة عند ثانية :00):
      if (diffSec > 180) {
        activeSignalObj = null;
        currentTargetEntryEpoch = null;
        renderWaitingState();
        return;
      }

      activeSignalObj = sig;
      const isCall = sig.direction === "CALL";
      const dirBadge = isCall ? "🟢 صعود (CALL)" : "🔴 هبوط (PUT)";

      // توهج الصندوق بلون الإشارة
      widget.style.borderColor = isCall ? '#10b981' : '#ef4444';
      widget.style.boxShadow = isCall ? '0 0 25px rgba(16, 185, 129, 0.4)' : '0 0 25px rgba(239, 68, 68, 0.4)';

      const isCandleAlreadyStarted = currentTargetEntryEpoch ? ((Date.now() + clockOffsetNowMs) >= currentTargetEntryEpoch * 1000) : false;

      // تشغيل التنبيه الصوتي وتحويل الشارت والتحقق منه قبل ثانية الدخول :00.00
      if (sig.id !== LAST_ALERTED_SIG_ID && !isCandleAlreadyStarted) {
        LAST_ALERTED_SIG_ID = sig.id;
        LAST_SWITCHED_SIG_ID = sig.id;
        playSignalChime(isCall);
        try {
          const cleanTarget = (sig.asset || "").toUpperCase().replace(/\s*OTC/i, "").replace(/[^A-Z]/g, "").slice(0, 6);
          const isChartOnTarget = () => {
            const cur = detectCurrentBrokerAsset();
            const cleanCur = (cur || "").toUpperCase().replace(/\s*OTC/i, "").replace(/[^A-Z]/g, "");
            return Boolean(cleanCur && cleanTarget && cleanCur.includes(cleanTarget));
          };

          if (!isChartOnTarget()) {
            switchToBrokerAsset(sig.asset, false);
          }

          const preDir = sig.direction;
          setTimeout(() => {
            try {
              const found = findBrokerTradeButton(preDir);
              if (found) cachedTradeButton = { dir: preDir, el: found, cachedAt: Date.now() };
            } catch(_e) {}
          }, 550);
        } catch(e) {}
      }

      currentActiveSignalId = sig.id;

      // منع إعادة كتابة innerHTML إذا كانت الإشارة معروضة بالفعل لتجنب الوميض نهائياً
      const sigKey = "SIGNAL_" + sig.id;
      if (currentRobotUiState !== sigKey) {
        currentRobotUiState = sigKey;
        document.getElementById("zad-robot-signal").innerHTML = `
          <div style="display:flex;align-items:center;justify-content:space-between;gap:4px;margin-bottom:3px;background:rgba(15,23,42,0.85);padding:4px 6px;border-radius:6px;border:1px solid #0284c7;">
            <span style="font-size:9.5px;color:#94a3b8;display:flex;align-items:center;gap:3px;">
              <span>🎯</span>
              <b id="zad-signal-pair-btn" style="color:#38bdf8;font-size:11.5px;font-family:monospace;background:#0c1a2e;padding:1px 6px;border-radius:4px;border:1px solid #0284c7;cursor:pointer;display:inline-flex;align-items:center;gap:2px;" title="انقر هنا لتحويل شارت المنصة فوراً إلى هذا الزوج">${sig.asset} <span style="font-size:9px;">🔄</span></b>
            </span>
            <span style="font-size:9.5px;color:${isCall ? '#34d399' : '#f87171'};font-weight:bold;background:${isCall ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)'};padding:1px 5px;border-radius:4px;border:1px solid ${isCall ? '#10b981' : '#ef4444'};">${dirBadge}</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:9px;color:#cbd5e1;padding:2px 5px;background:#09121f;border-radius:5px;margin-bottom:3px;">
            <span>⏰ الدخول: <b style="color:#fde047;">ثانية :00 (افتتاح الشمعة)</b></span>
            <span>⚡ <b>تنفيذ فوري 5 ثوانٍ (M1)</b></span>
          </div>
        `;

        const pairBtn = document.getElementById("zad-signal-pair-btn");
        if (pairBtn) {
          pairBtn.onclick = (e) => {
            e.stopPropagation();
            switchToBrokerAsset(sig.asset, true);
          };
        }

        // تجهيز زر التداول اليدوي إذا كان الوضع يدوياً
        const manContainer = document.getElementById("zad-manual-trigger-container");
        const manBtn = document.getElementById("zad-manual-trade-btn");
        if (ROBOT_MODE === "MANUAL" && manContainer && manBtn) {
          manContainer.style.display = "block";
          manBtn.innerText = `👉 اضغط لتنفيذ صفقة ${isCall ? 'شراء (CALL 🟢)' : 'بيع (PUT 🔴)'} الآن!`;
          manBtn.style.background = isCall ? '#10b981' : '#ef4444';
          manBtn.onclick = () => {
            try { switchToBrokerAsset(sig.asset); } catch(e) {}
            executeSingleTrade(sig.id, sig.direction, "manual_click");
            // بدء وتثبيت بطاقة "الصفقة جارية الآن" فوراً طوال فترة فتحها
            currentActiveTrade = {
              sigId: sig.id,
              asset: sig.asset,
              direction: sig.direction,
              startTime: Date.now(),
              expireTime: Date.now() + 60000
            };
            renderInTradeState();
          };
        } else if (manContainer) {
          manContainer.style.display = "none";
        }
      }

      if (sig.id !== LAST_EXECUTED_SIG_ID && !currentActiveTrade) {
        const actElem = document.getElementById("zad-robot-action");
        if (actElem) {
          actElem.innerHTML = `🎯 إشارة مؤكدة على (<b>${sig.asset}</b>) — جاهز للتنفيذ (${ROBOT_MODE === 'AUTO' ? 'آلياً' : 'يدوياً'}) عند ثانية :00`;
        }
      }
    } else {
      // إذا لم تكن هناك إشارة نشطة: التحقق أولاً من عدم وجود صفقة جارية
      if (currentActiveTrade && Date.now() < currentActiveTrade.expireTime) {
        renderInTradeState();
        return;
      }
      activeSignalObj = null;
      currentActiveSignalId = null;
      currentTargetEntryEpoch = null;
      const cdContainer = document.getElementById("zad-robot-countdown");
      if (cdContainer) cdContainer.style.display = "none";
      const manBtn = document.getElementById("zad-manual-trigger-container");
      if (manBtn) manBtn.style.display = "none";

      renderWaitingState();
      const actElem = document.getElementById("zad-robot-action");
      if (actElem && !window.__zadWarmupReason) {
        const nextAct = isForexMarketOpen()
          ? `جاهز لاستقبال الإشارة القادمة وتنفيذها بالثانية (${ROBOT_MODE === 'AUTO' ? 'آلياً' : 'يدوياً'})`
          : "السوق مغلق حالياً";
        if (actElem.textContent !== nextAct) {
          actElem.textContent = nextAct;
        }
      }
      widget.style.borderColor = "#10b981";
      widget.style.boxShadow = "0 15px 35px rgba(0,0,0,0.85)";
    }
  }

  // =========================================================================
  // الخيار أ (الأكثر أماناً): التحقق من صلاحية العضو واستلام الإشارات حصرياً من السيرفر
  // (/api/quotex-robot/feed?apiKey=...) دون أي اعتماد على ملفات مفتوحة في Firestore
  // =========================================================================

  function checkDirectApi() {
    if (!MEMBER_IDENTIFIER) {
      processRobotPayload({
        ok: false,
        authorized: false,
        error: "يرجى إدخال مفتاح الروبوت أو رقم حساب البروكر المفعّل من المشرف"
      }, "no_key");
      return;
    }

    const feedUrl = API_BASE + "/api/quotex-robot/feed?apiKey=" + encodeURIComponent(MEMBER_IDENTIFIER);

    if (typeof fetch === "function") {
      const reqStart = Date.now();
      fetch(feedUrl, { mode: "cors", cache: "no-store" })
        .then(function(r) { return r.json().catch(() => null); })
        .then(function(data) {
          if (data && (data.ok || data.authorized === false || data.error)) {
            processRobotPayload(data, "server_fetch", reqStart);
          }
        })
        .catch(function() {});
    }

    if (typeof GM_xmlhttpRequest === "function") {
      const gmStart = Date.now();
      GM_xmlhttpRequest({
        method: "GET",
        url: feedUrl,
        timeout: 8000,
        onload: function(response) {
          try {
            const data = JSON.parse(response.responseText);
            if (data && (data.ok || data.authorized === false || data.error)) {
              processRobotPayload(data, "server_gm", gmStart);
            }
          } catch(e) {}
        },
        onerror: function() {},
        ontimeout: function() {}
      });
    }
  }

  function scheduleNextApiPoll() {
    checkDirectApi();
    const serverSyncedSec = new Date(Date.now() + (typeof serverClockOffsetMs === "number" ? serverClockOffsetMs : 0)).getUTCSeconds();
    const isCritical = (activeSignalObj && activeSignalObj.status === "PENDING") || (serverSyncedSec >= 46 || serverSyncedSec <= 5);
    setTimeout(scheduleNextApiPoll, isCritical ? 450 : 1200);
  }
  scheduleNextApiPoll();

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
  addTrackedInterval(checkBridgeStorage, 2000);

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