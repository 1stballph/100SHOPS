/* 100 - SHOPS · shared client code (API, sessions, UI helpers, PWA) */
(function () {
  const S = {};
  window.S = S;

  // ---------- API ----------
  S.role = document.body.dataset.role;
  const TOKEN_KEY = '100shops_token_' + S.role;
  S.token = () => { try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; } };
  S.setToken = t => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch (e) {} };

  S.api = async function (action, data) {
    const url = (window.APP_CONFIG && window.APP_CONFIG.API_URL) || '';
    if (!url || url.indexOf('PASTE') === 0) throw new Error('The app is not connected yet. Put your Apps Script URL in config.js.');
    let res;
    try {
      res = await fetch(url, {
        method: 'POST', redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // avoids CORS preflight on Apps Script
        body: JSON.stringify({ action, data: data || {}, token: S.token() }),
      });
    } catch (e) {
      throw new Error('No internet connection. Check your signal and try again.');
    }
    let out;
    try { out = await res.json(); } catch (e) { throw new Error('The server did not respond properly. Try again in a moment.'); }
    if (!out.ok) {
      if (out.code === 'AUTH' && S.token()) { S.setToken(null); setTimeout(() => location.reload(), 1200); }
      throw new Error(out.error || 'Something went wrong.');
    }
    return out.data;
  };

  // ---------- Formatting ----------
  S.esc = v => String(v === null || v === undefined ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  S.peso = n => (Number(n) < 0 ? '−₱' : '₱') + Math.abs(Number(n || 0)).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  S.peso0 = n => (Number(n) < 0 ? '−₱' : '₱') + Math.abs(Number(n || 0)).toLocaleString('en-PH', { maximumFractionDigits: 2 });
  S.when = iso => {
    if (!iso) return '';
    const d = new Date(iso), now = new Date();
    const time = d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
    if (d.toDateString() === now.toDateString()) return 'Today, ' + time;
    const y = new Date(now); y.setDate(now.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return 'Yesterday, ' + time;
    return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined }) + ', ' + time;
  };
  S.dateOnly = iso => iso ? new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
  S.initial = name => S.esc(String(name || '?').trim().charAt(0).toUpperCase());
  S.$ = (sel, root) => (root || document).querySelector(sel);
  S.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  S.form = el => Object.fromEntries(new FormData(el).entries());

  // ---------- Toasts ----------
  S.toast = function (msg, type) {
    let wrap = S.$('.toast-wrap');
    if (!wrap) { wrap = document.createElement('div'); wrap.className = 'toast-wrap'; wrap.setAttribute('aria-live', 'polite'); document.body.appendChild(wrap); }
    const t = document.createElement('div');
    t.className = 'toast' + (type === 'error' ? ' error' : '');
    t.textContent = msg;
    wrap.appendChild(t);
    while (wrap.children.length > 2) wrap.firstChild.remove();
    setTimeout(() => t.remove(), type === 'error' ? 5200 : 3200);
  };
  S.error = e => S.toast(e && e.message ? e.message : String(e), 'error');

  // ---------- Button busy state ----------
  S.busy = async function (btn, fn) {
    if (!btn || btn.disabled) return;
    const html = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spin"></span>';
    try { return await fn(); }
    catch (e) { S.error(e); }
    finally { btn.disabled = false; btn.innerHTML = html; }
  };

  // ---------- Sheets (bottom modals) ----------
  S.sheet = function (title, html, opts) {
    opts = opts || {};
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${S.esc(title)}">
      <div class="sheet-grab"></div>
      <div class="sheet-head"><h2>${S.esc(title)}</h2>
        <button class="btn icon" data-close aria-label="Close">${S.icon('x')}</button></div>
      <div class="sheet-body">${html}</div></div>`;
    const close = () => { ov.remove(); document.removeEventListener('keydown', onKey); opts.onClose && opts.onClose(); };
    const onKey = e => { if (e.key === 'Escape') close(); };
    ov.addEventListener('click', e => { if (e.target === ov || e.target.closest('[data-close]')) close(); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(ov);
    const first = ov.querySelector('input, select, textarea');
    if (first && window.innerWidth > 700) first.focus();
    return { el: ov.querySelector('.sheet-body'), close, root: ov };
  };

  S.confirm = function (title, message, okLabel, danger) {
    return new Promise(resolve => {
      const sh = S.sheet(title, `<p class="muted">${S.esc(message)}</p>
        <div class="row" style="margin-top:18px"><button class="btn ghost grow" data-no>Keep it</button>
        <button class="btn grow ${danger ? 'danger' : ''}" data-yes>${S.esc(okLabel || 'Confirm')}</button></div>`,
      { onClose: () => resolve(false) });
      sh.el.querySelector('[data-no]').onclick = () => sh.close();
      sh.el.querySelector('[data-yes]').onclick = () => { resolve(true); sh.root.remove(); };
    });
  };

  S.prompt = function (title, label, opts) {
    opts = opts || {};
    return new Promise(resolve => {
      const sh = S.sheet(title, `<form class="stack">
        ${opts.message ? `<p class="muted">${S.esc(opts.message)}</p>` : ''}
        <label class="field"><span>${S.esc(label)}</span>
        <input class="input" name="v" type="${opts.type || 'text'}" ${opts.required === false ? '' : 'required'} value="${S.esc(opts.value || '')}" placeholder="${S.esc(opts.placeholder || '')}"></label>
        <button class="btn block ${opts.danger ? 'danger' : ''}">${S.esc(opts.ok || 'Save')}</button></form>`, { onClose: () => resolve(null) });
      sh.el.querySelector('form').onsubmit = e => { e.preventDefault(); const v = e.target.v.value; sh.root.remove(); resolve(v); };
    });
  };

  // ---------- Icons (inline SVG, stroke style) ----------
  const P = {
    home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
    orders: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/>',
    wallet: '<rect x="3" y="6" width="18" height="14" rx="3"/><path d="M3 10h18"/><circle cx="16.5" cy="15" r="1.2"/>',
    star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
    chat: '<path d="M4 5h16v11H9l-5 4z"/>',
    phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a1 1 0 01-1 1A16 16 0 014 5a1 1 0 011-1z"/>',
    box: '<path d="M3 7l9-4 9 4-9 4z"/><path d="M3 7v10l9 4 9-4V7"/><path d="M12 11v10"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    store: '<path d="M4 9l1.5-5h13L20 9"/><path d="M4 9a2.7 2.7 0 005.3 0 2.7 2.7 0 005.4 0 2.7 2.7 0 005.3 0"/><path d="M5 11v9h14v-9"/>',
    bike: '<circle cx="6" cy="17" r="3"/><circle cx="18" cy="17" r="3"/><path d="M6 17l4-7h5l3 7M10 10l-1-3H7M15 10l1-3h2"/>',
    route: '<circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18h7a3 3 0 000-6H9a3 3 0 010-6h7"/>',
    coins: '<ellipse cx="9" cy="7" rx="6" ry="3"/><path d="M3 7v4c0 1.7 2.7 3 6 3s6-1.3 6-3V7"/><path d="M9 14v3c0 1.7 2.7 3 6 3s6-1.3 6-3v-4c0-1.7-2.7-3-6-3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    refresh: '<path d="M20 11a8 8 0 10-2.3 5.7M20 5v6h-6"/>',
  };
  S.icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" stroke="currentColor" aria-hidden="true">${P[name] || ''}</svg>`;

  // ---------- Tabs ----------
  S.tabbar = function (tabs, current, onPick) {
    let bar = S.$('.tabbar');
    if (!bar) { bar = document.createElement('nav'); bar.className = 'tabbar'; bar.setAttribute('aria-label', 'Main'); document.body.appendChild(bar); }
    bar.innerHTML = '<div class="tabbar-inner">' + tabs.map(t =>
      `<button class="tab ${t.id === current ? 'active' : ''}" data-tab="${t.id}" aria-current="${t.id === current ? 'page' : 'false'}">
        ${S.icon(t.icon)}<span>${S.esc(t.label)}</span>${t.badge ? `<b class="badge">${t.badge}</b>` : ''}</button>`).join('') + '</div>';
    bar.onclick = e => { const b = e.target.closest('[data-tab]'); if (b) onPick(b.dataset.tab); };
  };

  // ---------- Order status helpers ----------
  S.STEPS = { Delivery: ['Pending', 'Preparing', 'Ready', 'On the way', 'Completed'], Pickup: ['Pending', 'Preparing', 'Ready', 'Completed'] };
  S.statusText = o => ({
    Pending: 'Waiting for the shop to accept', Preparing: 'The shop is preparing your order',
    Ready: o.OrderType === 'Pickup' ? 'Ready for pickup' : (o.RiderName ? 'Ready — rider ' + o.RiderName + ' is on the way to the shop' : 'Ready — looking for a rider'),
    'On the way': 'Rider ' + (o.RiderName || '') + ' is on the way to you', Completed: 'Completed', Cancelled: 'Cancelled',
  }[o.Status] || o.Status);
  S.statusPill = s => {
    const cls = { Pending: 'coral', Preparing: 'mango', Ready: 'mango', 'On the way': 'mango', Completed: '', Cancelled: 'grey' }[s];
    return `<span class="pill ${cls === undefined ? 'grey' : cls}">${S.esc(s)}</span>`;
  };
  S.steps = o => {
    if (o.Status === 'Cancelled') return '';
    const steps = S.STEPS[o.OrderType] || S.STEPS.Delivery;
    const i = steps.indexOf(o.Status);
    return '<div class="steps">' + steps.map((s, j) => `<i class="${j < i || o.Status === 'Completed' ? 'done' : j === i ? 'now' : ''}"></i>`).join('') + '</div>';
  };
  S.itemsText = o => (o.items || []).map(i => `${i.qty}× ${S.esc(i.name)}`).join(', ');

  S.orderSummary = o => `<table class="sum">
    ${(o.items || []).map(i => `<tr><td>${i.qty}× ${S.esc(i.name)}</td><td>${S.peso(i.total)}</td></tr>`).join('')}
    <tr><td class="muted">Service charge</td><td>${S.peso(o.ServiceFee)}</td></tr>
    ${o.DeliveryFee ? `<tr><td class="muted">Delivery fee</td><td>${S.peso(o.DeliveryFee)}</td></tr>` : ''}
    ${o.PointsUsed ? `<tr class="minus"><td>${o.PointsUsed} points used</td><td>−${S.peso(o.PointsDiscount)}</td></tr>` : ''}
    <tr class="total"><td>Total (${S.esc(o.PaymentMethod === 'Wallet' ? 'Wallet' : 'Cash')})</td><td>${S.peso(o.AmountDue)}</td></tr></table>`;

  // ---------- Order chat ----------
  S.openChat = function (orderId, title) {
    const myType = { customer: 'Customer', merchant: 'Merchant', rider: 'Rider', admin: 'Admin' }[S.role];
    const sh = S.sheet(title || 'Order chat', `
      <p class="small muted" style="margin-bottom:8px">Everyone on this order can read these messages: customer, shop and rider.</p>
      <div class="chat-log" id="chatLog"><p class="muted small center">Loading messages…</p></div>
      <form class="row" id="chatForm"><input class="input grow" name="m" maxlength="500" autocomplete="off" placeholder="Type a message" aria-label="Message">
      <button class="btn">Send</button></form>`, { onClose: () => clearInterval(timer) });
    const log = sh.el.querySelector('#chatLog');
    let last = '';
    const render = msgs => {
      const sig = msgs.map(m => m.MessageID).join();
      if (sig === last) return; last = sig;
      log.innerHTML = msgs.length ? msgs.map(m => `<div class="msg ${m.SenderType === myType ? 'me' : ''}">
        <small>${S.esc(m.SenderType === myType ? 'You' : m.SenderName + ' · ' + m.SenderType)} · ${S.when(m.CreatedAt)}</small>${S.esc(m.Message)}</div>`).join('')
        : '<p class="muted small center">No messages yet. Say hello!</p>';
      log.scrollTop = log.scrollHeight;
    };
    const load = () => S.api('getChat', { orderId }).then(render).catch(() => {});
    load();
    const timer = setInterval(load, 5000);
    sh.el.querySelector('#chatForm').onsubmit = async e => {
      e.preventDefault();
      const input = e.target.m, text = input.value.trim();
      if (!text) return;
      input.value = '';
      try { render(await S.api('sendChat', { orderId, message: text })); } catch (err) { input.value = text; S.error(err); }
    };
  };

  // ---------- Change password (all roles) ----------
  S.changePassword = function () {
    const sh = S.sheet('Change password', `<form class="stack">
      <label class="field"><span>Current password</span><input class="input" type="password" name="oldPassword" required autocomplete="current-password"></label>
      <label class="field"><span>New password</span><input class="input" type="password" name="newPassword" minlength="6" required autocomplete="new-password"></label>
      <button class="btn block">Change password</button></form>`);
    const f = sh.el.querySelector('form');
    f.onsubmit = e => { e.preventDefault(); S.busy(f.querySelector('button'), async () => { await S.api('changePassword', S.form(f)); sh.close(); S.toast('Password changed.'); }); };
  };

  S.logout = async function () {
    try { await S.api('logout'); } catch (e) {}
    S.setToken(null);
    location.reload();
  };

  // ---------- Images: shrink before upload ----------
  S.pickImage = function () {
    return new Promise((resolve, reject) => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'image/*';
      inp.onchange = () => {
        const file = inp.files[0];
        if (!file) return resolve(null);
        const img = new Image();
        img.onload = () => {
          const max = 900, scale = Math.min(1, max / Math.max(img.width, img.height));
          const c = document.createElement('canvas');
          c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          URL.revokeObjectURL(img.src);
          resolve(c.toDataURL('image/jpeg', 0.82));
        };
        img.onerror = () => reject(new Error('That file is not an image we can read.'));
        img.src = URL.createObjectURL(file);
      };
      inp.click();
    });
  };

  // ---------- PWA install ----------
  let deferredPrompt = null;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  S.isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  S.canInstall = () => !!deferredPrompt;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault(); deferredPrompt = e;
    document.dispatchEvent(new Event('installable'));
    S.showInstallBanner();
  });
  window.addEventListener('appinstalled', () => { deferredPrompt = null; hideBanner(); S.toast('Installed! Open 100 - SHOPS from your home screen.'); });

  S.install = async function () {
    hideBanner();
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      return;
    }
    S.sheet('Install the app', isIOS
      ? `<ol class="stack" style="padding-left:20px"><li>Open this page in <b>Safari</b>.</li><li>Tap the <b>Share</b> button (square with an arrow).</li><li>Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b>.</li></ol>`
      : `<ol class="stack" style="padding-left:20px"><li>Open this page in <b>Chrome</b>.</li><li>Tap the <b>⋮</b> menu at the top right.</li><li>Tap <b>Install app</b> or <b>Add to Home screen</b>.</li></ol>`);
  };

  // Install banner: shows on phones that can install, once the intro is done.
  const BANNER_KEY = '100shops_banner_hidden_until';
  const BANNER_TEXT = {
    customer: 'Order faster, get order updates and see your points in one tap.',
    merchant: 'Hear new orders right away and open your shop in one tap.',
    rider: 'Get new delivery jobs faster, right from your home screen.',
    admin: 'Open the admin portal in one tap.',
  };
  function hideBanner() {
    const b = document.querySelector('.install-banner');
    if (b) { b.classList.add('bye'); setTimeout(() => b.remove(), 300); }
  }
  S.showInstallBanner = function () {
    if (S.isStandalone() || document.querySelector('.install-banner')) return;
    if (!deferredPrompt && !isIOS) return;              // this browser can't install; don't nag
    try { if (Number(localStorage.getItem(BANNER_KEY)) > Date.now()) return; } catch (e) {}
    if (document.querySelector('.intro')) { setTimeout(S.showInstallBanner, 800); return; }
    const b = document.createElement('div');
    b.className = 'install-banner';
    b.setAttribute('role', 'dialog'); b.setAttribute('aria-label', 'Install the app');
    b.innerHTML = `<img src="img/logo-96.png" alt="">
      <div><b>Install the 100&nbsp;-&nbsp;SHOPS app</b><div class="small muted">${S.esc(BANNER_TEXT[S.role] || BANNER_TEXT.customer)}</div></div>
      <button class="x" data-dismiss aria-label="Not now">${S.icon('x')}</button>
      <button class="btn mango" data-install>${S.icon('download')} ${isIOS && !deferredPrompt ? 'Show me how to install' : 'Install app'}</button>`;
    const place = () => { const bar = document.querySelector('.tabbar'); b.style.bottom = bar ? `calc(${bar.offsetHeight + 10}px)` : 'calc(14px + env(safe-area-inset-bottom, 0px))'; };
    place();
    document.body.appendChild(b);
    const obs = new MutationObserver(place); obs.observe(document.body, { childList: true });
    b.querySelector('[data-install]').onclick = () => { obs.disconnect(); S.install(); };
    b.querySelector('[data-dismiss]').onclick = () => {
      obs.disconnect();
      try { localStorage.setItem(BANNER_KEY, String(Date.now() + 3 * 864e5)); } catch (e) {}  // ask again in 3 days
      hideBanner();
    };
  };
  if (isIOS) setTimeout(S.showInstallBanner, 2500);

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }

  // ---------- Opening intro (once per app launch) ----------
  (function intro() {
    if (document.body.hasAttribute('data-no-intro')) return;
    try { if (sessionStorage.getItem('100shops_intro')) return; sessionStorage.setItem('100shops_intro', '1'); } catch (e) {}
    const roleLabel = { merchant: 'Merchant app', rider: 'Rider app', admin: 'Admin' }[S.role];
    const colors = ['#FF4D4F', '#1E90FF', '#22C55E', '#A855F7', '#F59E0B', '#06B6D4', '#EC4899', '#FFFFFF'];
    const dots = colors.map((c, i) => {
      const a = (i / colors.length) * Math.PI * 2 - Math.PI / 2, r = 150 + (i % 2) * 40;
      return `<i style="background:${c};--x:${Math.round(Math.cos(a) * r)}px;--y:${Math.round(Math.sin(a) * r)}px;--d:${(i * 0.04).toFixed(2)}s"></i>`;
    }).join('');
    const el = document.createElement('div');
    el.className = 'intro';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = `<div class="intro-stage">
        <div class="intro-burst">${dots}</div>
        <svg class="intro-orbit" viewBox="0 0 400 400"><ellipse class="back" cx="200" cy="200" rx="190" ry="72"/><ellipse cx="200" cy="200" rx="190" ry="72"/></svg>
        <img class="intro-logo" src="img/logo-512.png" alt="">
      </div>
      <div class="intro-count"><b>0</b> local shops</div>
      <div class="intro-tag">Together We Grow</div>
      ${roleLabel ? `<div class="intro-role">${roleLabel}</div>` : ''}`;
    document.body.appendChild(el);
    const num = el.querySelector('.intro-count b');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let done = false;
    const finish = () => {
      if (done) return; done = true;
      el.classList.add('out');
      setTimeout(() => el.remove(), reduce ? 320 : 680);
    };
    if (reduce) { num.textContent = '100'; setTimeout(finish, 700); }
    else {
      const t0 = performance.now() + 700, dur = 900;
      const tick = now => {
        const p = Math.max(0, Math.min(1, (now - t0) / dur));
        num.textContent = Math.round(100 * (1 - Math.pow(1 - p, 3)));
        if (p < 1 && !done) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      setTimeout(finish, 2500);
    }
    el.addEventListener('click', finish);
  })();

  // ---------- Misc ----------
  S.vibrate = ms => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} };
  S.beep = function () {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination); o.frequency.value = 880; g.gain.value = 0.15;
      o.start(); o.stop(ctx.currentTime + 0.25);
    } catch (e) {}
  };
  S.info = null;
  S.loadInfo = async () => (S.info = await S.api('publicInfo'));
})();
