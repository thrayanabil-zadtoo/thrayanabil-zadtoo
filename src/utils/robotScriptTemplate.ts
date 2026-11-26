export interface RobotScriptBuildOptions {
  serverOrigin?: string;
  apiKey?: string;
  defaultStake?: number;
  defaultMode?: 'AUTO' | 'MANUAL';
  soundDefault?: boolean;
  autoPairDefault?: boolean;
  autoM1Default?: boolean;
  strategyDefault?: 'VIP_WITH_MPB';
}

export function buildFloatingQuotexRobotScript(opts: RobotScriptBuildOptions): string {
  const safeOrigin = String(opts.serverOrigin || 'https://fx.zadtoo.com')
    .trim()
    .replace(/\/+$/, '')
    .replace(/^(https?:\/\/)ais-dev-/i, '$1ais-pre-')
    .replace(/['"\\]/g, '') || 'https://fx.zadtoo.com';
  const escapedApiKey = String(opts.apiKey || '').trim().replace(/['"\\]/g, '');
  const defaultStake = Math.max(1, Number(opts.defaultStake) || 5);
  const defaultMode = opts.defaultMode === 'AUTO' ? 'AUTO' : 'MANUAL';
  const soundDefault = opts.soundDefault !== false;
  const autoPairDefault = opts.autoPairDefault !== false;
  const autoM1Default = opts.autoM1Default !== false;
  const strategyDefault = 'VIP_WITH_MPB';

  return `// ==UserScript==
// @name         ZAD FX Floating Quotex Robot v5.1 (Server Verified)
// @namespace    https://fx.zadtoo.com
// @version      5.1.0
// @description  روبوت ZAD FX العائم المتصل بسيرفر fx.zadtoo.com — التحقق من العضوية يتم داخل السيرفر فقط وبدون مضاعفات
// @author       ZAD FX
// @match        *://qxbroker.com/*
// @match        *://*.qxbroker.com/*
// @match        *://quotex.io/*
// @match        *://*.quotex.io/*
// @match        *://quotex.com/*
// @match        *://*.quotex.com/*
// @match        *://broker-qx.pro/*
// @match        *://*.broker-qx.pro/*
// @match        *://market-qx.pro/*
// @match        *://*.market-qx.pro/*
// @match        *://market-qx.com/*
// @match        *://*.market-qx.com/*
// @match        *://*.zadtoo.com/*
// @match        *://zadtoo.com/*
// @match        *://*.run.app/*
// @match        *://localhost:*/*
// @match        *://127.0.0.1:*/*
// @grant        GM_xmlhttpRequest
// @grant        GM.xmlHttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      *.zadtoo.com
// @connect      zadtoo.com
// @connect      *.run.app
// @connect      localhost
// @connect      127.0.0.1
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';
  if (window.__ZAD_FX_ROBOT_LOADED__) return;
  window.__ZAD_FX_ROBOT_LOADED__ = true;

  const SERVER_URL = '${safeOrigin}'.replace(/^(https?:\\/\\/)ais-dev-/i, '$1ais-pre-').replace(/\\/+$/, '');
  const DEFAULT_MEMBER_KEY = '${escapedApiKey}';
  const DEFAULT_MODE = '${defaultMode}';
  const DEFAULT_STAKE = ${defaultStake};
  const DEFAULT_SOUND = ${soundDefault};
  const AUTO_SELECT_PAIR = ${autoPairDefault};
  const AUTO_SET_EXPIRY_M1 = ${autoM1Default};
  const STRATEGY_MODE = '${strategyDefault}';

  function readStore(key, fallback) {
    try {
      if (typeof GM_getValue === 'function') {
        const v = GM_getValue(key, undefined);
        if (v !== undefined && v !== null && v !== '') return v;
      }
    } catch (_) {}
    try {
      const v = localStorage.getItem('zad_robot_' + key);
      if (v !== null && v !== '') return JSON.parse(v);
    } catch (_) {}
    return fallback;
  }

  function writeStore(key, val) {
    try {
      if (typeof GM_setValue === 'function') GM_setValue(key, val);
    } catch (_) {}
    try {
      localStorage.setItem('zad_robot_' + key, JSON.stringify(val));
    } catch (_) {}
  }

  const rawStoredKey = String(readStore('apiKey', DEFAULT_MEMBER_KEY) || '').trim();
  let apiKey = /^(QX-ADMIN-MASTER-TEST|ADMIN-MASTER-TEST|DEMO)$/i.test(rawStoredKey)
    ? DEFAULT_MEMBER_KEY
    : (rawStoredKey || DEFAULT_MEMBER_KEY);
  if (apiKey && apiKey !== rawStoredKey) writeStore('apiKey', apiKey);
  if (SERVER_URL) writeStore('serverUrl', SERVER_URL);

  let tradeMode = readStore('tradeMode', DEFAULT_MODE) === 'AUTO' ? 'AUTO' : 'MANUAL';
  let stakeUsd = Math.max(1, Number(readStore('stakeUsd', DEFAULT_STAKE)) || DEFAULT_STAKE);
  let soundOn = readStore('soundOn', DEFAULT_SOUND) !== false;
  let minimized = Boolean(readStore('minimized', false));
  let hidden = false;
  let winsCount = Math.max(0, Number(readStore('winsCount', 0)) || 0);
  let lossesCount = Math.max(0, Number(readStore('lossesCount', 0)) || 0);

  let pinnedCallSelector = String(readStore('pinnedCallSel', '') || '');
  let pinnedPutSelector = String(readStore('pinnedPutSel', '') || '');
  let pinStep = 0;

  let serverOffsetMs = 0;
  let lastFeed = null;
  let lastConnError = '';
  let lastAlertedId = null;
  const executedSignals = new Set();
  const reportedOutcomes = new Set();
  let showKeyPanel = !apiKey;
  let showInfoPanel = false;
  let showQuranBar = false;
  let isQuranPlaying = false;
  let quranAudio = null;
  let testFeedback = '';

  function playTone(type) {
    if (!soundOn) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type === 'open' ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(
        type === 'open' ? 880 : type === 'win' ? 1040 : type === 'loss' ? 320 : 660,
        ctx.currentTime
      );
      gain.gain.setValueAtTime(0.14, ctx.currentTime);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + (type === 'open' ? 0.3 : 0.2));
    } catch (_) {}
  }

  function toggleQuran() {
    if (!quranAudio) {
      quranAudio = new Audio('https://backup.qurango.net/radio/maher');
      quranAudio.preload = 'none';
      quranAudio.onplay = () => { isQuranPlaying = true; renderHud(); };
      quranAudio.onpause = () => { isQuranPlaying = false; renderHud(); };
      quranAudio.onerror = () => {
        try {
          quranAudio.src = 'https://qurango.net/radio/maher';
          quranAudio.play().catch(() => {});
        } catch (_) {}
      };
    }
    if (!showQuranBar) {
      showQuranBar = true;
      quranAudio.play().then(() => { isQuranPlaying = true; renderHud(); }).catch(() => { renderHud(); });
    } else if (isQuranPlaying) {
      quranAudio.pause();
    } else {
      quranAudio.play().catch(() => {});
    }
    renderHud();
  }

  function requestJson(url, method, body) {
    return new Promise((resolve) => {
      const parseSafe = (status, rawText) => {
        const text = String(rawText || '').trim();
        if (!text) {
          return { ok: false, status, data: null, error: status ? ('HTTP ' + status) : 'استجابة فارغة من السيرفر' };
        }
        if (text.startsWith('<')) {
          return { ok: false, status, isHtmlRedirect: true, data: null, error: 'HTML_REDIRECT' };
        }
        try {
          const parsed = JSON.parse(text);
          return { ok: status >= 200 && status < 300, status, data: parsed, error: parsed?.error?.message || parsed?.error || '' };
        } catch (_) {
          return { ok: false, status, data: null, error: 'استجابة غير صالحة من السيرفر (' + status + ')' };
        }
      };

      const hasGmSync = typeof GM_xmlhttpRequest === 'function';
      const hasGmAsync = typeof GM !== 'undefined' && typeof GM.xmlHttpRequest === 'function';

      if (hasGmSync) {
        GM_xmlhttpRequest({
          method: method || 'GET',
          url,
          headers: Object.assign({ Accept: 'application/json' }, body ? { 'Content-Type': 'application/json' } : {}),
          data: body ? JSON.stringify(body) : undefined,
          timeout: 8000,
          onload: (resp) => resolve(parseSafe(resp.status, resp.responseText)),
          onerror: () => resolve({ ok: false, status: 0, data: null, error: 'تعذر الوصول للخادم' }),
          ontimeout: () => resolve({ ok: false, status: 0, data: null, error: 'انتهت مهلة الاتصال بالسيرفر' })
        });
      } else if (hasGmAsync) {
        GM.xmlHttpRequest({
          method: method || 'GET',
          url,
          headers: Object.assign({ Accept: 'application/json' }, body ? { 'Content-Type': 'application/json' } : {}),
          data: body ? JSON.stringify(body) : undefined,
          timeout: 8000,
          onload: (resp) => resolve(parseSafe(resp.status, resp.responseText)),
          onerror: () => resolve({ ok: false, status: 0, data: null, error: 'تعذر الوصول للخادم' }),
          ontimeout: () => resolve({ ok: false, status: 0, data: null, error: 'انتهت مهلة الاتصال بالسيرفر' })
        });
      } else {
        fetch(url, {
          method: method || 'GET',
          headers: body ? { 'Content-Type': 'application/json' } : undefined,
          body: body ? JSON.stringify(body) : undefined
        })
          .then(async (r) => parseSafe(r.status, await r.text()))
          .then(resolve)
          .catch(() => resolve({ ok: false, status: 0, data: null, error: 'تعذر الاتصال بالشبكة' }));
      }
    });
  }

  // Server-only license & signal verification (Option A — no member keys exposed in Firestore)

  function buildUniqueSelector(el) {
    if (!el || el === document.body) return '';
    if (el.id) return '#' + CSS.escape(el.id);
    const parts = [];
    let cur = el;
    let depth = 0;
    while (cur && cur.nodeType === 1 && depth < 5) {
      let part = cur.tagName.toLowerCase();
      if (cur.classList && cur.classList.length > 0) {
        const cls = Array.from(cur.classList).filter(c => !c.startsWith('hover') && !c.startsWith('active')).slice(0, 2);
        if (cls.length) part += '.' + cls.map(c => CSS.escape(c)).join('.');
      }
      const parent = cur.parentElement;
      if (parent) {
        const sameTag = Array.from(parent.children).filter(ch => ch.tagName === cur.tagName);
        if (sameTag.length > 1) {
          part += ':nth-of-type(' + (sameTag.indexOf(cur) + 1) + ')';
        }
      }
      parts.unshift(part);
      cur = cur.parentElement;
      depth++;
    }
    return parts.join(' > ');
  }

  function findTradeButton(direction) {
    const isCall = direction === 'CALL';
    const pinnedSel = isCall ? pinnedCallSelector : pinnedPutSelector;
    if (pinnedSel) {
      try {
        const pinnedEl = document.querySelector(pinnedSel);
        if (pinnedEl && !pinnedEl.closest('#zad-fx-floating-hud')) return pinnedEl;
      } catch (_) {}
    }
    const selectors = isCall
      ? ['.call-btn', '.deal-button--up', '[data-test="deal-up"]', 'button[class*="call"]', 'button[class*="up"]', '.button-call-wrap button', '.section-deal__button--up']
      : ['.put-btn', '.deal-button--down', '[data-test="deal-down"]', 'button[class*="put"]', 'button[class*="down"]', '.button-put-wrap button', '.section-deal__button--down'];

    for (const sel of selectors) {
      const candidates = Array.from(document.querySelectorAll(sel));
      for (const btn of candidates) {
        if (!btn.closest('#zad-fx-floating-hud') && btn.offsetParent !== null) {
          return btn;
        }
      }
    }
    const allBtns = Array.from(document.querySelectorAll('button'));
    const labelRe = isCall ? /^(up|call|higher|شراء|صعود)/i : /^(down|put|lower|بيع|هبوط)/i;
    for (const b of allBtns) {
      if (b.closest('#zad-fx-floating-hud') || b.offsetParent === null) continue;
      const t = (b.textContent || '').trim();
      if (labelRe.test(t)) return b;
    }
    return null;
  }

  function clickPairOnQuotex(assetName) {
    if (!AUTO_SELECT_PAIR || !assetName) return;
    const cleanPair = assetName.replace(/\\s*\\(OTC\\)/gi, '').trim().toUpperCase();
    const compactPair = cleanPair.replace('/', '');
    const tabs = Array.from(document.querySelectorAll('.asset-select__button, .tab, .pairs-list__item, [class*="asset"], [class*="pair"]'));
    for (const el of tabs) {
      if (el.closest('#zad-fx-floating-hud')) continue;
      const txt = (el.textContent || '').toUpperCase();
      if (!txt || txt.includes('OTC')) continue;
      if (txt.includes(cleanPair) || txt.includes(compactPair)) {
        if (!el.classList.contains('active') && el.getAttribute('aria-selected') !== 'true') {
          el.click();
        }
        return;
      }
    }
  }

  function ensureM1ExpiryOnQuotex() {
    if (!AUTO_SET_EXPIRY_M1) return;
    const timeCandidates = Array.from(document.querySelectorAll('[class*="expiration"], [class*="time-select"], .input-control__dropdown button'));
    for (const el of timeCandidates) {
      if (el.closest('#zad-fx-floating-hud')) continue;
      const txt = (el.textContent || '').trim();
      if (/^(00:01:00|01:00|1m|1\\s*min)$/i.test(txt)) {
        el.click();
        break;
      }
    }
  }

  function clickTradeButton(direction) {
    const btn = findTradeButton(direction);
    if (btn && typeof btn.click === 'function') {
      btn.click();
      return true;
    }
    return false;
  }

  document.addEventListener('click', (e) => {
    if (pinStep === 0) return;
    const target = e.target;
    if (!target || (target.closest && target.closest('#zad-fx-floating-hud'))) return;
    const btn = (target.closest && target.closest('button, [role="button"]')) || target;
    e.preventDefault();
    e.stopPropagation();
    const sel = buildUniqueSelector(btn);
    if (pinStep === 1) {
      pinnedCallSelector = sel;
      writeStore('pinnedCallSel', sel);
      pinStep = 2;
      testFeedback = '✅ تم حفظ زر الشراء (CALL) — اضغط الآن على زر الهبوط الأحمر (PUT) في كيوتكس';
    } else if (pinStep === 2) {
      pinnedPutSelector = sel;
      writeStore('pinnedPutSel', sel);
      pinStep = 0;
      testFeedback = '✅ تم تثبيت أزرار المنصة بنجاح!';
      setTimeout(() => { testFeedback = ''; renderHud(); }, 4500);
    }
    renderHud();
  }, true);

  const root = document.createElement('div');
  root.id = 'zad-fx-floating-hud';
  root.dir = 'rtl';
  root.style.cssText = 'position:fixed;bottom:22px;left:22px;z-index:2147483647;width:266px;background:rgba(11,15,23,0.96);backdrop-filter:blur(10px);color:#f8fafc;border:1.5px solid rgba(16,185,129,0.88);border-radius:14px;box-shadow:0 20px 50px rgba(0,0,0,0.88),0 0 24px rgba(16,185,129,0.28);font-family:system-ui,-apple-system,Segoe UI,Tahoma,sans-serif;font-size:11px;user-select:none;overflow:hidden;';
  document.body.appendChild(root);

  const restorePill = document.createElement('button');
  restorePill.textContent = '🤖 إظهار روبوت ZAD FX';
  restorePill.style.cssText = 'display:none;position:fixed;bottom:22px;left:22px;z-index:2147483647;padding:9px 16px;background:#0b0f17;color:#34d399;border:2px solid #10b981;border-radius:999px;font-weight:800;font-size:12px;cursor:pointer;box-shadow:0 10px 30px rgba(0,0,0,0.75);';
  restorePill.onclick = () => {
    hidden = false;
    restorePill.style.display = 'none';
    root.style.display = 'block';
    renderHud();
  };
  document.body.appendChild(restorePill);

  let dragPos = { x: 0, y: 0 };
  function attachDrag(headerEl) {
    headerEl.onmousedown = (e) => {
      if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
      const startX = e.clientX;
      const startY = e.clientY;
      const initX = dragPos.x;
      const initY = dragPos.y;
      const onMove = (ev) => {
        dragPos = { x: initX + (ev.clientX - startX), y: initY + (ev.clientY - startY) };
        root.style.transform = \`translate(\${dragPos.x}px, \${dragPos.y}px)\`;
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    };
  }

  function esc(str) {
    return String(str || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function renderHud() {
    const feed = lastFeed;
    const isAuth = Boolean(feed && feed.ok && feed.authorized);
    const sig = isAuth ? feed.activeSignal : null;
    const nowServerSec = Math.floor((Date.now() + serverOffsetMs) / 1000);
    const secsToEntry = sig && sig.targetEntryTimestamp
      ? (sig.targetEntryTimestamp - nowServerSec)
      : (sig?.secondsUntilEntry ?? 0);

    const callBtnDetected = Boolean(findTradeButton('CALL'));
    const putBtnDetected = Boolean(findTradeButton('PUT'));

    let statusLineHtml = '';
    if (!apiKey) {
      statusLineHtml = '<span style="color:#fbbf24;">🟡 أدخل مفتاح العضو لتفعيل الربط</span>';
    } else if (lastConnError && !isAuth) {
      statusLineHtml = \`<span style="color:#f87171;">🔴 \${esc(lastConnError)}</span>\`;
    } else if (!feed) {
      statusLineHtml = '<span style="color:#fbbf24;">📡 جاري الاتصال بـ fx.zadtoo.com...</span>';
    } else if (!isAuth) {
      statusLineHtml = \`<span style="color:#f87171;">🔴 \${esc(feed.error || 'غير مصرح له')}</span>\`;
    } else {
      statusLineHtml = '<span style="color:#34d399;">🟢 متصل بسيرفر fx.zadtoo.com</span>';
    }

    let signalHtml = '';
    if (!apiKey) {
      signalHtml = '<div style="padding:10px;background:#09121d;border:1px solid #6366f1;border-radius:10px;text-align:center;color:#c7d2fe;font-size:10.5px;">🔑 اضغط زر <b>🔑 ID</b> وأدخل مفتاح العضو (API Key) للبدء</div>';
    } else if (!feed && lastConnError) {
      signalHtml = \`
        <div style="padding:9px;background:#450a0a;border:1px solid #ef4444;border-radius:10px;text-align:center;color:#fecaca;font-size:10px;line-height:1.5;">
          <div>❌ \${esc(lastConnError)}</div>
        </div>\`;
    } else if (!feed) {
      signalHtml = '<div style="padding:10px;background:#09121d;border:1px solid #334155;border-radius:10px;text-align:center;color:#94a3b8;font-size:10.5px;">📡 جاري الاتصال والمزامنة مع السيرفر...</div>';
    } else if (!isAuth) {
      signalHtml = \`<div style="padding:10px;background:#450a0a;border:1px solid #ef4444;border-radius:10px;text-align:center;color:#fecaca;font-size:10.5px;">❌ \${esc(feed.error || 'مفتاح العضو غير مصرح له')}</div>\`;
    } else if (!feed.marketOpen) {
      signalHtml = \`
        <div style="padding:10px;background:#09121d;border:1px solid rgba(239,68,68,0.5);border-radius:10px;text-align:center;">
          <div style="color:#fca5a5;font-weight:900;font-size:11px;">⏸️ السوق مغلق (عطلة أسبوعية)</div>
          <div style="color:#94a3b8;font-size:9.5px;margin-top:3px;">يُستأنف التداول مع افتتاح الأسواق العالمية</div>
        </div>\`;
    } else if (sig && (sig.status === 'WIN' || sig.status === 'LOSS')) {
      const isWin = sig.status === 'WIN';
      signalHtml = \`
        <div style="padding:10px;background:\${isWin ? 'linear-gradient(135deg,#064e3b,#022c22)' : 'linear-gradient(135deg,#7f1d1d,#450a0a)'};border:1.5px solid \${isWin ? '#34d399' : '#f87171'};border-radius:10px;text-align:center;box-shadow:0 0 16px \${isWin ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'};">
          <div style="font-size:13px;font-weight:900;color:#fff;">\${isWin ? '✅ ربح مباشر (WIN)' : '❌ خسارة (LOSS)'}</div>
          <div style="font-size:10.5px;color:#e2e8f0;margin-top:3px;font-family:monospace;">\${esc(sig.asset)} • \${esc(sig.entryTime)} (\${sig.direction === 'CALL' ? 'صعود 🟢' : 'هبوط 🔴'})</div>
          <div style="margin-top:5px;font-size:9.5px;color:\${isWin ? '#6ee7b7' : '#fca5a5'};">اكتملت الصفقة — العودة للمسح خلال ثوانٍ</div>
        </div>\`;
    } else if (sig && sig.status === 'PENDING' && secsToEntry <= 0 && secsToEntry >= -65) {
      const isCall = sig.direction === 'CALL';
      const elapsedSec = Math.min(60, Math.max(0, -secsToEntry));
      const remainingSec = Math.max(0, 60 - elapsedSec);
      const progressPct = Math.round((elapsedSec / 60) * 100);
      const wasExecuted = executedSignals.has(sig.id);
      signalHtml = \`
        <div style="padding:9px;background:linear-gradient(145deg,#022c22,#071324);border:1.5px solid \${isCall ? '#10b981' : '#ef4444'};border-radius:10px;box-shadow:0 0 16px \${isCall ? 'rgba(16,185,129,0.32)' : 'rgba(239,68,68,0.28)'};">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">
            <span style="color:#6ee7b7;font-weight:900;font-size:10.5px;">⚡ الصفقة جارية بالمنصة</span>
            <span style="padding:1px 6px;border-radius:5px;background:rgba(16,185,129,0.2);border:1px solid rgba(16,185,129,0.5);color:#34d399;font-size:9px;font-weight:800;">M1 (60ث)</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;background:rgba(0,0,0,0.45);padding:5px 7px;border-radius:7px;margin-bottom:6px;">
            <span style="font-size:12px;font-weight:900;color:#38bdf8;font-family:monospace;">\${esc(sig.asset)}</span>
            <span style="padding:2px 7px;border-radius:5px;font-weight:900;background:\${isCall ? '#10b981' : '#ef4444'};color:#020617;font-size:10px;">\${isCall ? 'صعود CALL 🟢' : 'هبوط PUT 🔴'}</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:9px;color:#94a3b8;margin-bottom:4px;">
            <span style="color:#34d399;font-weight:700;">① دخول (\${esc(sig.entryTime)}) ✓</span>
            <span style="color:#fbbf24;font-weight:800;">② سريان الصفقة ⏳</span>
            <span>③ الإغلاق</span>
          </div>
          <div style="width:100%;height:7px;background:#0f172a;border-radius:999px;overflow:hidden;border:1px solid #1e293b;margin-bottom:6px;">
            <div style="width:\${progressPct}%;height:100%;background:\${isCall ? 'linear-gradient(90deg,#10b981,#34d399)' : 'linear-gradient(90deg,#ef4444,#fb7185)'};transition:width 0.4s linear;"></div>
          </div>
          <div style="padding:5px;background:#041e18;border:1px solid rgba(16,185,129,0.5);border-radius:7px;text-align:center;">
            <div style="font-size:9.5px;color:#a7f3d0;">⏳ متبقي على إغلاق الشمعة:</div>
            <div style="font-size:14px;font-weight:900;color:#fbbf24;font-family:monospace;">\${remainingSec} ثانية</div>
          </div>
          <div style="margin-top:4px;text-align:center;font-size:9px;color:#94a3b8;">\${wasExecuted ? '✅ تم فتح الصفقة آلياً بقيمة $' + stakeUsd : '📊 راقب نتيجة الصفقة على الشارت'}</div>
        </div>\`;
    } else if (sig && sig.status === 'PENDING') {
      const isCall = sig.direction === 'CALL';
      const prepPct = Math.min(100, Math.max(8, Math.round(((60 - Math.min(60, Math.max(0, secsToEntry))) / 60) * 100)));
      signalHtml = \`
        <div style="padding:9px;background:\${isCall ? 'rgba(6,78,59,0.48)' : 'rgba(127,29,29,0.48)'};border:1.5px solid \${isCall ? '#10b981' : '#ef4444'};border-radius:10px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">
            <div style="display:flex;align-items:center;gap:4px;">
              <strong style="font-size:13px;color:#fff;font-family:monospace;">\${esc(sig.asset)}</strong>
              <span style="padding:1px 5px;border-radius:4px;background:#022c22;border:1px solid #065f46;color:#6ee7b7;font-size:8.5px;font-weight:700;">مؤكدة 🎯</span>
            </div>
            <span style="padding:2px 7px;border-radius:5px;font-weight:900;background:\${isCall ? '#10b981' : '#ef4444'};color:#020617;font-size:10px;">\${isCall ? 'صعود CALL 🟢' : 'هبوط PUT 🔴'}</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:9px;color:#cbd5e1;margin-bottom:4px;">
            <span style="color:#34d399;">① رصد ✓</span>
            <span style="color:#38bdf8;">② تجهيز الزوج/M1 ✓</span>
            <span style="color:#fbbf24;font-weight:800;">③ الدخول :00 ⏳</span>
          </div>
          <div style="width:100%;height:6px;background:#0f172a;border-radius:999px;overflow:hidden;border:1px solid #1e293b;margin-bottom:5px;">
            <div style="width:\${prepPct}%;height:100%;background:#fbbf24;transition:width 0.4s linear;"></div>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:10px;color:#e2e8f0;margin-bottom:4px;">
            <span>الدخول: <b style="color:#fbbf24;font-family:monospace;">\${esc(sig.entryTime)}</b></span>
            <span>⏳ بدء بعد <b style="color:#38bdf8;font-family:monospace;">\${Math.max(0, secsToEntry)}ث</b></span>
          </div>
          <div style="padding:4px;background:rgba(2,44,34,0.6);border:1px solid rgba(16,185,129,0.35);border-radius:6px;text-align:center;font-size:9.5px;color:#6ee7b7;font-weight:700;">
            🎯 جاهز للتنفيذ (\${tradeMode === 'AUTO' ? 'آلياً' : 'يدوياً'}) عند ثانية :00
          </div>
        </div>\`;
    } else if (feed.isLockedOutsideHours || feed.isWarmup) {
      signalHtml = \`
        <div style="padding:10px;background:#09121d;border:1px solid rgba(245,158,11,0.5);border-radius:10px;text-align:center;color:#fde68a;font-size:10.5px;line-height:1.45;">
          ⏸️ \${esc(feed.tradingHoursMessage || feed.lockReason || 'الروبوت في فترة استراحة مجدولة')}
        </div>\`;
    } else {
      const candleLeft = 60 - new Date(Date.now() + serverOffsetMs).getSeconds();
      signalHtml = \`
        <div style="padding:9px;background:#09121d;border:1px solid rgba(245,158,11,0.48);border-radius:10px;text-align:center;">
          <div style="color:#fbbf24;font-weight:900;font-size:11px;">⏸️ وضع الانتظار (WAIT)</div>
          <div style="color:#cbd5e1;font-size:9.5px;margin-top:3px;">جاري مسح السوق في الأزواج الستة المفتوحة — لن يتم التكرار</div>
          <div style="display:inline-flex;align-items:center;gap:4px;margin-top:6px;padding:3px 9px;background:#061b2d;border:1px solid rgba(56,189,248,0.45);border-radius:6px;font-size:10px;color:#7dd3fc;">
            <span>⏳ اكتمال الشمعة:</span>
            <b style="color:#38bdf8;font-family:monospace;">\${candleLeft} ثانية</b>
          </div>
          <div style="color:#64748b;font-size:9px;margin-top:5px;">جاهز لاستقبال الإشارة القادمة وتنفيذها بالثانية (\${tradeMode === 'AUTO' ? 'آلياً' : 'يدوياً'})</div>
        </div>\`;
    }

    const total = winsCount + lossesCount;
    const rate = total > 0 ? Math.round((winsCount / total) * 100) : 100;
    const memberName = feed?.member?.name || (apiKey ? 'جاري التحقق...' : 'غير مربوط');
    const validityLabel = isAuth
      ? (feed.member?.daysLeft >= 3650 ? 'دائم ✓' : \`\${feed.member?.daysLeft ?? 30} يوم\`)
      : 'غير متصل';

    root.innerHTML = \`
      <div id="zad-hud-hdr" style="padding:7px 9px;background:linear-gradient(90deg,#022c22,#0f172a);border-bottom:1px solid #1e293b;display:flex;justify-content:space-between;align-items:center;cursor:move;gap:4px;">
        <div style="display:flex;align-items:center;gap:5px;min-width:0;">
          <span style="width:7px;height:7px;border-radius:999px;background:\${isAuth ? '#10b981' : (lastConnError ? '#ef4444' : '#f59e0b')};flex-shrink:0;box-shadow:0 0 6px \${isAuth ? '#10b981' : '#f59e0b'};"></span>
          <strong style="font-size:11px;color:#fff;white-space:nowrap;">روبوت ZAD FX</strong>
          <span style="padding:1px 4px;border-radius:4px;background:#78350f;border:1px solid #b45309;color:#fde68a;font-size:8.5px;font-weight:800;">v5.0</span>
          <span style="padding:1px 4px;border-radius:4px;background:#0c4a6e;border:1px solid #0369a1;color:#7dd3fc;font-size:8.5px;font-weight:700;">Quotex</span>
        </div>
        <div style="display:flex;align-items:center;gap:3px;flex-shrink:0;">
          <button id="zad-btn-info" title="معلومات" style="padding:2px 5px;border-radius:4px;border:1px solid #334155;background:\${showInfoPanel ? '#0ea5e9' : '#1e293b'};color:\${showInfoPanel ? '#020617' : '#7dd3fc'};font-size:9px;font-weight:700;cursor:pointer;">ℹ️ info</button>
          <button id="zad-btn-quran" title="القرآن الكريم — ماهر المعيقلي" style="padding:2px 5px;border-radius:4px;border:1px solid #065f46;background:\${showQuranBar ? '#10b981' : '#022c22'};color:\${showQuranBar ? '#020617' : '#6ee7b7'};font-size:9px;font-weight:700;cursor:pointer;">🎧 قرآن</button>
          <button id="zad-btn-min" style="padding:2px 5px;border-radius:4px;border:1px solid #334155;background:#1e293b;color:#cbd5e1;font-size:9px;font-weight:700;cursor:pointer;">\${minimized ? '+' : '−'}</button>
          <button id="zad-btn-close" style="padding:1px 4px;border:none;background:transparent;color:#94a3b8;font-size:12px;font-weight:700;cursor:pointer;">✕</button>
        </div>
      </div>
      \${minimized ? \`
        <div style="padding:7px 10px;display:flex;justify-content:space-between;font-size:10.5px;">
          <span>\${tradeMode === 'AUTO' ? '🤖 آلي' : '🖐️ يدوي'}</span>
          <span style="color:#34d399;font-family:monospace;">✅ \${winsCount} | ❌ \${lossesCount} (\${rate}%)</span>
        </div>\` : \`
        <div style="padding:8px;display:flex;flex-direction:column;gap:7px;">
          \${showInfoPanel ? \`
            <div style="padding:7px 8px;background:#0f172a;border:1px solid rgba(14,165,233,0.45);border-radius:8px;font-size:9.5px;color:#cbd5e1;display:flex;flex-direction:column;gap:3px;">
              <div style="display:flex;justify-content:space-between;"><span>🌐 الموقع:</span><a href="https://fx.zadtoo.com" target="_blank" style="color:#34d399;font-weight:700;text-decoration:none;">fx.zadtoo.com</a></div>
              <div style="display:flex;justify-content:space-between;"><span>📢 القناة:</span><a href="https://t.me/ZadNBFX" target="_blank" style="color:#38bdf8;font-weight:700;text-decoration:none;">@ZadNBFX</a></div>
              <div style="display:flex;justify-content:space-between;border-top:1px solid #1e293b;padding-top:3px;"><span>👨‍💻 برمجة:</span><strong style="color:#fbbf24;">Nabil Barakat</strong></div>
            </div>\` : ''}

          \${showQuranBar ? \`
            <div style="padding:5px 7px;background:linear-gradient(90deg,#022c22,#0f172a);border:1px solid rgba(16,185,129,0.5);border-radius:7px;display:flex;justify-content:space-between;align-items:center;font-size:9.5px;">
              <span style="color:#a7f3d0;font-weight:800;">📖 الشيخ ماهر المعيقلي</span>
              <div style="display:flex;gap:4px;">
                <button id="zad-quran-play" style="padding:1px 6px;border-radius:4px;border:none;background:#059669;color:#fff;font-size:9px;cursor:pointer;">\${isQuranPlaying ? '⏸️' : '▶️'}</button>
                <button id="zad-quran-stop" style="border:none;background:transparent;color:#94a3b8;font-size:10px;cursor:pointer;">✕</button>
              </div>
            </div>\` : ''}

          <div style="padding:6px 8px;background:#0f172a;border:1px solid #1e293b;border-radius:8px;display:flex;justify-content:space-between;align-items:center;gap:4px;font-size:10px;">
            <div style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
              <span style="color:#94a3b8;">العضو: </span>
              <strong style="color:#fbbf24;">\${esc(memberName)}</strong>
            </div>
            <div style="display:flex;align-items:center;gap:5px;flex-shrink:0;">
              <span style="color:\${isAuth ? '#34d399' : '#f87171'};font-weight:800;font-size:9.5px;">\${esc(validityLabel)}</span>
              <button id="zad-btn-key" style="padding:2px 6px;border-radius:5px;border:1px solid #334155;background:#1e293b;color:#38bdf8;font-size:9.5px;font-weight:800;cursor:pointer;">🔑 ID</button>
            </div>
          </div>

          \${showKeyPanel ? \`
            <div style="padding:8px;background:#0f172a;border:1px solid #334155;border-radius:8px;display:flex;flex-direction:column;gap:6px;">
              <label style="font-size:9.5px;color:#cbd5e1;font-weight:700;">مفتاح العضو (API Key):</label>
              <input id="zad-inp-key" dir="ltr" value="\${esc(apiKey)}" placeholder="QX-ZAD-XXXX-XXXX-XXXX" style="width:100%;box-sizing:border-box;padding:5px 7px;background:#020617;border:1px solid #475569;border-radius:6px;color:#fbbf24;font-family:monospace;font-size:11px;outline:none;" />
              <button id="zad-btn-savekey" style="padding:6px;background:#10b981;color:#020617;font-weight:800;border:none;border-radius:6px;cursor:pointer;font-size:10.5px;">💾 حفظ وتفعيل الاشتراك</button>
            </div>\` : ''}

          <div style="text-align:center;font-size:10px;font-weight:800;">\${statusLineHtml}</div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;background:#0f172a;padding:3px;border-radius:8px;border:1px solid #1e293b;">
            <button id="zad-mode-auto" style="padding:5px;border-radius:6px;border:none;font-weight:800;font-size:10px;cursor:pointer;background:\${tradeMode === 'AUTO' ? '#10b981' : 'transparent'};color:\${tradeMode === 'AUTO' ? '#020617' : '#94a3b8'};">🤖 تداول آلي</button>
            <button id="zad-mode-manual" style="padding:5px;border-radius:6px;border:none;font-weight:800;font-size:10px;cursor:pointer;background:\${tradeMode === 'MANUAL' ? '#fbbf24' : 'transparent'};color:\${tradeMode === 'MANUAL' ? '#020617' : '#94a3b8'};">🖐️ تداول يدوي</button>
          </div>

          \${signalHtml}

          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px;text-align:center;font-size:9.5px;">
            <div id="zad-stat-win" title="اضغط لزيادة عداد الربح" style="padding:5px;background:rgba(16,185,129,0.12);border:1px solid rgba(16,185,129,0.65);border-radius:7px;cursor:pointer;">✅ ربح<br><b style="font-size:13px;color:#fff;font-family:monospace;">\${winsCount}</b></div>
            <div id="zad-stat-loss" title="اضغط لزيادة عداد الخسارة" style="padding:5px;background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.65);border-radius:7px;cursor:pointer;">❌ خسارة<br><b style="font-size:13px;color:#fff;font-family:monospace;">\${lossesCount}</b></div>
            <div style="padding:5px;background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.65);border-radius:7px;">🎯 النسبة<br><b style="font-size:13px;color:#fbbf24;font-family:monospace;">\${rate}%</b></div>
          </div>

          <div style="display:flex;justify-content:space-between;align-items:center;padding-top:4px;border-top:1px solid #1e293b;font-size:9.5px;">
            <div style="display:flex;gap:3px;">
              \${[1, 5, 10, 20].map(a => \`<button class="zad-stake-btn" data-amt="\${a}" style="padding:2px 6px;border-radius:4px;border:none;font-weight:800;cursor:pointer;font-family:monospace;background:\${stakeUsd === a ? '#34d399' : '#1e293b'};color:\${stakeUsd === a ? '#020617' : '#cbd5e1'};">$\${a}</button>\`).join('')}
            </div>
            <button id="zad-btn-sound" style="padding:2px 6px;border-radius:4px;border:none;cursor:pointer;background:#1e293b;color:\${soundOn ? '#38bdf8' : '#64748b'};font-weight:700;font-size:9.5px;">\${soundOn ? '🔔 تنبيه' : '🔕 صامت'}</button>
          </div>

          <div style="padding:7px;background:#090d16;border:1px solid #1e293b;border-radius:8px;display:flex;flex-direction:column;gap:5px;">
            <div style="display:flex;justify-content:space-between;align-items:center;font-size:9.5px;">
              <span style="color:#38bdf8;font-weight:800;">🛠️ اختبار أزرار المنصة:</span>
              <button id="zad-btn-pin" style="padding:2px 6px;border-radius:5px;border:1px solid rgba(245,158,11,0.55);background:\${pinStep > 0 ? '#f59e0b' : 'rgba(120,53,15,0.45)'};color:\${pinStep > 0 ? '#020617' : '#fbbf24'};font-size:8.5px;font-weight:800;cursor:pointer;">\${pinStep > 0 ? '⏳ اختر من الشاشة...' : '📌 تثبيت يدوي'}</button>
            </div>
            <div style="display:flex;justify-content:space-around;font-size:9px;color:#cbd5e1;">
              <span>🟢 شراء: <b style="color:\${callBtnDetected ? '#34d399' : '#fbbf24'};">\${callBtnDetected ? 'مكتشف ✓' : 'غير مكتشف ⚠️'}</b></span>
              <span>🔴 بيع: <b style="color:\${putBtnDetected ? '#34d399' : '#fbbf24'};">\${putBtnDetected ? 'مكتشف ✓' : 'غير مكتشف ⚠️'}</b></span>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;">
              <button id="zad-test-call" style="padding:4px;border-radius:5px;border:1px solid #10b981;background:#022c22;color:#6ee7b7;font-weight:800;font-size:9.5px;cursor:pointer;">🟢 شراء (CALL)</button>
              <button id="zad-test-put" style="padding:4px;border-radius:5px;border:1px solid #ef4444;background:#450a0a;color:#fca5a5;font-weight:800;font-size:9.5px;cursor:pointer;">🔴 بيع (PUT)</button>
            </div>
            \${testFeedback ? \`<div style="padding:4px;border-radius:5px;background:rgba(16,185,129,0.14);border:1px solid rgba(16,185,129,0.4);color:#6ee7b7;font-size:8.5px;text-align:center;font-weight:700;">\${esc(testFeedback)}</div>\` : ''}
          </div>
        </div>\`}
    \`;

    const hdr = root.querySelector('#zad-hud-hdr');
    if (hdr) attachDrag(hdr);
    const bInfo = root.querySelector('#zad-btn-info');
    if (bInfo) bInfo.onclick = () => { showInfoPanel = !showInfoPanel; renderHud(); };
    const bQuran = root.querySelector('#zad-btn-quran');
    if (bQuran) bQuran.onclick = toggleQuran;
    const bQuranPlay = root.querySelector('#zad-quran-play');
    if (bQuranPlay) bQuranPlay.onclick = () => { if (quranAudio) { isQuranPlaying ? quranAudio.pause() : quranAudio.play().catch(() => {}); } };
    const bQuranStop = root.querySelector('#zad-quran-stop');
    if (bQuranStop) bQuranStop.onclick = () => { if (quranAudio) { quranAudio.pause(); } isQuranPlaying = false; showQuranBar = false; renderHud(); };
    const bKey = root.querySelector('#zad-btn-key');
    if (bKey) bKey.onclick = () => { showKeyPanel = !showKeyPanel; renderHud(); };
    const bMin = root.querySelector('#zad-btn-min');
    if (bMin) bMin.onclick = () => { minimized = !minimized; writeStore('minimized', minimized); renderHud(); };
    const bClose = root.querySelector('#zad-btn-close');
    if (bClose) bClose.onclick = () => { hidden = true; root.style.display = 'none'; restorePill.style.display = 'block'; };
    const bSaveKey = root.querySelector('#zad-btn-savekey');
    if (bSaveKey) {
      bSaveKey.onclick = () => {
        const kInp = root.querySelector('#zad-inp-key');
        apiKey = String(kInp?.value || '').trim();
        writeStore('apiKey', apiKey);
        showKeyPanel = false;
        lastFeed = null;
        lastConnError = '';
        renderHud();
        pollFeed();
      };
    }
    const bAuto = root.querySelector('#zad-mode-auto');
    if (bAuto) bAuto.onclick = () => { tradeMode = 'AUTO'; writeStore('tradeMode', 'AUTO'); renderHud(); };
    const bManual = root.querySelector('#zad-mode-manual');
    if (bManual) bManual.onclick = () => { tradeMode = 'MANUAL'; writeStore('tradeMode', 'MANUAL'); renderHud(); };
    const bSound = root.querySelector('#zad-btn-sound');
    if (bSound) bSound.onclick = () => { soundOn = !soundOn; writeStore('soundOn', soundOn); renderHud(); };
    const bStatW = root.querySelector('#zad-stat-win');
    if (bStatW) bStatW.onclick = () => { winsCount += 1; writeStore('winsCount', winsCount); renderHud(); };
    const bStatL = root.querySelector('#zad-stat-loss');
    if (bStatL) bStatL.onclick = () => { lossesCount += 1; writeStore('lossesCount', lossesCount); renderHud(); };
    root.querySelectorAll('.zad-stake-btn').forEach(btn => {
      btn.onclick = () => { stakeUsd = Number(btn.getAttribute('data-amt')) || 5; writeStore('stakeUsd', stakeUsd); renderHud(); };
    });
    const bPin = root.querySelector('#zad-btn-pin');
    if (bPin) {
      bPin.onclick = () => {
        pinStep = 1;
        testFeedback = '📌 الخطوة 1/2: اضغط الآن على زر الصعود الأخضر (CALL) في منصة كيوتكس';
        renderHud();
      };
    }
    const bTestCall = root.querySelector('#zad-test-call');
    if (bTestCall) {
      bTestCall.onclick = () => {
        const ok = clickTradeButton('CALL');
        testFeedback = ok ? '✅ تم النقر على زر الشراء (CALL) بنجاح!' : '⚠️ لم يتم العثور على زر CALL — اضغط "📌 تثبيت يدوي"';
        renderHud();
        setTimeout(() => { testFeedback = ''; renderHud(); }, 4000);
      };
    }
    const bTestPut = root.querySelector('#zad-test-put');
    if (bTestPut) {
      bTestPut.onclick = () => {
        const ok = clickTradeButton('PUT');
        testFeedback = ok ? '✅ تم النقر على زر البيع (PUT) بنجاح!' : '⚠️ لم يتم العثور على زر PUT — اضغط "📌 تثبيت يدوي"';
        renderHud();
        setTimeout(() => { testFeedback = ''; renderHud(); }, 4000);
      };
    }
  }

  async function pollFeed() {
    if (!apiKey) {
      renderHud();
      return;
    }

    let data = null;
    const baseUrl = SERVER_URL || 'https://fx.zadtoo.com';
    const feedUrl = \`\${baseUrl}/api/quotex-robot/feed?apiKey=\${encodeURIComponent(apiKey)}\`;
    const resp = await requestJson(feedUrl, 'GET');
    if (resp && resp.data && typeof resp.data.authorized === 'boolean') {
      data = resp.data;
    }

    if (data && (data.ok || data.authorized === false)) {
      lastFeed = data;
      lastConnError = data.authorized ? '' : (data.error || 'الحساب غير مصرح له بتشغيل الروبوت');

      if (typeof data.serverEpochMs === 'number') {
        serverOffsetMs = data.serverEpochMs - Date.now();
      }

      if (data.ok && data.authorized && data.activeSignal) {
        const sig = data.activeSignal;
        if (sig.status === 'PENDING') {
          if (lastAlertedId !== sig.id) {
            lastAlertedId = sig.id;
            playTone('signal');
            clickPairOnQuotex(sig.asset);
            ensureM1ExpiryOnQuotex();
          }
          const nowSec = Math.floor((Date.now() + serverOffsetMs) / 1000);
          const diffSec = sig.targetEntryTimestamp ? (sig.targetEntryTimestamp - nowSec) : (sig.secondsUntilEntry ?? 0);
          if (tradeMode === 'AUTO' && !executedSignals.has(sig.id) && diffSec <= 0 && diffSec >= -4) {
            executedSignals.add(sig.id);
            clickPairOnQuotex(sig.asset);
            ensureM1ExpiryOnQuotex();
            setTimeout(() => {
              const clicked = clickTradeButton(sig.direction);
              if (clicked) playTone('open');
            }, 120);
          }
        } else if ((sig.status === 'WIN' || sig.status === 'LOSS') && !reportedOutcomes.has(sig.id)) {
          reportedOutcomes.add(sig.id);
          if (sig.status === 'WIN') {
            winsCount += 1;
            writeStore('winsCount', winsCount);
            playTone('win');
          } else {
            lossesCount += 1;
            writeStore('lossesCount', lossesCount);
            playTone('loss');
          }
          if (executedSignals.has(sig.id)) {
            requestJson(\`\${baseUrl}/api/quotex-robot/report-trade\`, 'POST', { apiKey, outcome: sig.status }).catch(() => {});
          }
        }
      }
    } else {
      lastConnError = (resp && resp.error) || 'تعذر الاتصال بالسيرفر للتحقق من الصلاحية';
    }

    const activeEl = document.activeElement;
    const isTypingKey = showKeyPanel && activeEl && activeEl.id === 'zad-inp-key';
    if (!hidden && !isTypingKey) renderHud();
  }

  renderHud();
  pollFeed();
  setInterval(pollFeed, 2000);
  setInterval(() => {
    const activeEl = document.activeElement;
    const isTypingKey = showKeyPanel && activeEl && activeEl.id === 'zad-inp-key';
    if (!hidden && !isTypingKey) renderHud();
  }, 1000);
})();
`;
}
