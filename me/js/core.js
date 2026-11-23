/* WAVE Portal core: Supabase client, safe HTML templating, router, layout helpers. */
(function () {
  'use strict';
  var cfg = window.WAVE_CONFIG;
  var W = window.W = {};

  W.sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: 'implicit', storageKey: 'wave-portal-auth' }
  });

  // ---------- safe HTML ----------
  // html`...` escapes every interpolated value unless it is itself the result of html`` or W.raw().
  function Safe(s) { this.s = s; }
  Safe.prototype.toString = function () { return this.s; };
  function esc(v) {
    return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function fmt(v) {
    if (v == null || v === false) return '';
    if (v instanceof Safe) return v.s;
    if (Array.isArray(v)) return v.map(fmt).join('');
    return esc(v);
  }
  W.html = function (strings) {
    var out = '';
    for (var i = 0; i < strings.length; i++) {
      out += strings[i];
      if (i + 1 < arguments.length) out += fmt(arguments[i + 1]);
    }
    return new Safe(out);
  };
  W.raw = function (s) { return new Safe(String(s)); };
  W.esc = esc;
  W.mount = function (el, content) { el.innerHTML = fmt(content); return el; };
  W.$ = function (sel, root) { return (root || document).querySelector(sel); };
  W.$$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  // ---------- icons (inline, stroke uses currentColor) ----------
  var ICONS = {
    home: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    inbox: '<path d="M4 13h4l2 3h4l2-3h4"/><path d="M4 13 6.5 5h11L20 13v6H4z"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
    folder: '<path d="M3 6h6l2 2h10v11H3z"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c1-3.5 3.5-5.5 6.5-5.5s5.5 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c2 .8 3.2 2.5 3.8 5.2"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    logout: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v4h16v-4"/>',
    download: '<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 20h16"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    plug: '<path d="M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>',
    doc: '<path d="M6 3h12v18H6z"/><path d="M9 8h6M9 12h6M9 16h4"/>',
    check: '<path d="m5 12 5 5 9-10"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'
  };
  W.icon = function (name) {
    return W.raw('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || '') + '</svg>');
  };

  // ---------- formatting ----------
  var money0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  var money2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  W.money = function (n) { n = Number(n || 0); return (n % 1 === 0 ? money0 : money2).format(n); };
  W.num = function (n) { return new Intl.NumberFormat('en-US').format(Math.round(Number(n || 0))); };
  W.compact = function (n) { return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(n || 0)); };
  function toDate(d) { return d instanceof Date ? d : new Date(String(d).length === 10 ? d + 'T12:00:00' : d); }
  W.date = function (d) { return d ? toDate(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''; };
  W.dateTime = function (d) { return d ? toDate(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''; };
  W.monthLabel = function (d) { return d ? toDate(d).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : ''; };
  W.ago = function (d) {
    if (!d) return '';
    var s = (Date.now() - toDate(d).getTime()) / 1000;
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + ' min ago';
    if (s < 86400) return Math.floor(s / 3600) + ' h ago';
    if (s < 86400 * 7) { var n = Math.floor(s / 86400); return n + (n === 1 ? ' day ago' : ' days ago'); }
    return W.date(d);
  };
  W.bytes = function (n) {
    n = Number(n || 0);
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(0) + ' KB';
    return (n / 1048576).toFixed(1) + ' MB';
  };
  W.isoDay = function (d) {
    d = d || new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };

  // ---------- data ----------
  // Unwraps a Supabase response and turns errors into readable messages.
  W.q = function (promise) {
    return Promise.resolve(promise).then(function (r) {
      if (r.error) throw friendlyError(r.error);
      return r.data;
    });
  };
  function friendlyError(e) {
    var msg = (e && (e.message || e.error_description || e.error)) || 'Something went wrong.';
    if (/JWT expired|invalid JWT|refresh token/i.test(msg)) msg = 'Your session ended. Please sign in again.';
    else if (/row-level security|permission denied|not allowed/i.test(msg)) msg = "You don't have access to do that.";
    else if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) msg = 'Could not reach the server. Check your connection and try again.';
    var err = new Error(msg);
    err.cause = e;
    return err;
  }
  W.friendlyError = friendlyError;

  // Calls a portal edge function with the signed-in user's session.
  W.fn = function (name, body) {
    return W.sb.auth.getSession().then(function (r) {
      var session = r.data.session;
      var headers = { 'Content-Type': 'application/json', apikey: cfg.supabaseKey };
      if (session) headers.Authorization = 'Bearer ' + session.access_token;
      return fetch(cfg.supabaseUrl + '/functions/v1/' + name, { method: 'POST', headers: headers, body: JSON.stringify(body || {}) });
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
        return data;
      });
    }, function (e) { throw friendlyError(e); });
  };

  W.uuid = function () {
    if (crypto.randomUUID) return crypto.randomUUID();
    var b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    var h = Array.prototype.map.call(b, function (x) { return x.toString(16).padStart(2, '0'); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  };
  W.safeFileName = function (name) {
    var clean = String(name || 'file').normalize('NFKD').replace(/[^\w.\- ]+/g, '').replace(/\s+/g, '-').replace(/-+/g, '-');
    return (clean || 'file').slice(-80);
  };

  // ---------- state ----------
  W.state = { session: null, profile: null, clients: [], settings: {}, clientId: null };
  W.isAdmin = function () { return !!(W.state.profile && W.state.profile.role === 'admin'); };
  W.currentClient = function () {
    return W.state.clients.filter(function (c) { return c.id === W.state.clientId; })[0] || W.state.clients[0] || null;
  };
  W.loadContext = function () {
    return W.q(W.sb.rpc('portal_context')).then(function (ctx) {
      W.state.profile = ctx.profile;
      W.state.clients = ctx.clients || [];
      W.state.settings = ctx.settings || {};
      var saved = null;
      try { saved = localStorage.getItem('wave-portal-client'); } catch (e) { /* storage may be blocked */ }
      var ids = W.state.clients.map(function (c) { return c.id; });
      W.state.clientId = ids.indexOf(saved) >= 0 ? saved : (ids[0] || null);
      return ctx;
    });
  };
  W.setClient = function (id) {
    W.state.clientId = id;
    try { localStorage.setItem('wave-portal-client', id); } catch (e) { /* ignore */ }
  };

  // ---------- toast ----------
  var toastTimer;
  W.toast = function (msg, isError) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'show' + (isError ? ' err' : '');
    t.setAttribute('role', isError ? 'alert' : 'status');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = ''; }, isError ? 6000 : 3500);
  };

  // ---------- dialog ----------
  // Opens a modal <dialog>. Returns { el, close }. The body may contain a form; onMount wires it up.
  W.modal = function (title, body, onMount) {
    var d = document.createElement('dialog');
    d.className = 'modal';
    d.setAttribute('aria-labelledby', 'modal-title');
    W.mount(d, W.html`<div class="modal-head"><h2 id="modal-title">${title}</h2>
      <button type="button" class="icon-btn" data-close aria-label="Close">${W.icon('close')}</button></div>
      <div class="modal-body">${body}</div>`);
    document.body.appendChild(d);
    function close() { if (d.open) d.close(); }
    d.addEventListener('close', function () { d.remove(); });
    d.addEventListener('click', function (e) {
      if (e.target === d || e.target.closest('[data-close]')) close();
    });
    d.showModal();
    if (onMount) onMount(d, close);
    var first = d.querySelector('input:not([type=hidden]),select,textarea');
    if (first) first.focus();
    return { el: d, close: close };
  };
  W.confirm = function (title, message, confirmLabel, danger) {
    return new Promise(function (resolve) {
      var done = false;
      var m = W.modal(title, W.html`<p>${message}</p><div class="form-actions">
        <button type="button" class="btn" data-close>Cancel</button>
        <button type="button" class="btn ${danger ? 'danger' : 'primary'}" data-ok>${confirmLabel || 'Confirm'}</button></div>`,
      function (d, close) {
        d.querySelector('[data-ok]').addEventListener('click', function () { done = true; close(); resolve(true); });
        d.addEventListener('close', function () { if (!done) resolve(false); });
      });
      return m;
    });
  };
  // Shows a one-time link with a copy button (invites and reset links).
  W.linkDialog = function (title, intro, link, note) {
    W.modal(title, W.html`<p>${intro}</p>
      <div class="copy-row"><input type="text" readonly value="${link}" aria-label="Link"><button type="button" class="btn" data-copy>Copy</button></div>
      ${note ? W.html`<p class="muted" style="font-size:13.5px">${note}</p>` : ''}
      <div class="form-actions"><button type="button" class="btn primary" data-close>Done</button></div>`,
    function (d) {
      var input = d.querySelector('input');
      d.querySelector('[data-copy]').addEventListener('click', function () {
        input.select();
        (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject()).then(function () {
          W.toast('Link copied');
        }, function () { document.execCommand('copy'); W.toast('Link copied'); });
      });
    });
  };

  // ---------- forms ----------
  W.formData = function (form) {
    var out = {};
    new FormData(form).forEach(function (v, k) { if (typeof v === 'string') out[k] = v.trim(); });
    W.$$('input[type=checkbox][name]', form).forEach(function (c) { out[c.name] = c.checked; });
    return out;
  };
  // Disables the submit button while the action runs, and shows errors under the form.
  W.onSubmit = function (form, action) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!form.reportValidity()) return;
      var btn = form.querySelector('[type=submit]');
      var errBox = form.querySelector('.form-error');
      if (errBox) errBox.textContent = '';
      var label = btn && btn.textContent;
      if (btn) { btn.disabled = true; btn.textContent = btn.getAttribute('data-busy') || 'Saving…'; }
      Promise.resolve().then(function () { return action(W.formData(form), form); }).catch(function (err) {
        var msg = (err && err.message) || 'Something went wrong.';
        if (errBox) errBox.textContent = msg; else W.toast(msg, true);
      }).then(function () {
        if (btn && document.body.contains(btn)) { btn.disabled = false; btn.textContent = label; }
      });
    });
  };
  W.opt = function (value, label, selected) {
    return W.html`<option value="${value}"${selected ? W.raw(' selected') : ''}>${label}</option>`;
  };
  W.options = function (pairs, selected) {
    return pairs.map(function (p) { return W.opt(p[0], p[1], String(p[0]) === String(selected == null ? '' : selected)); });
  };

  // ---------- router ----------
  var routes = [];
  // area: 'public' (signed-out pages), 'any' (any signed-in user), 'admin', 'client'
  W.route = function (pattern, area, handler) {
    var keys = [];
    var re = new RegExp('^' + pattern.replace(/:(\w+)/g, function (_, k) { keys.push(k); return '([^/]+)'; }) + '$');
    routes.push({ re: re, keys: keys, area: area, handler: handler });
  };
  W.go = function (path) {
    if (location.hash === '#' + path) W.render();
    else location.hash = path;
  };
  W.parseHash = function () {
    var h = location.hash.replace(/^#/, '') || '/';
    var qi = h.indexOf('?');
    var path = qi >= 0 ? h.slice(0, qi) : h;
    var query = {};
    if (qi >= 0) new URLSearchParams(h.slice(qi + 1)).forEach(function (v, k) { query[k] = v; });
    return { path: path, query: query };
  };
  W.match = function (path) {
    for (var i = 0; i < routes.length; i++) {
      var m = routes[i].re.exec(path);
      if (m) {
        var params = {};
        routes[i].keys.forEach(function (k, j) { params[k] = decodeURIComponent(m[j + 1]); });
        return { route: routes[i], params: params };
      }
    }
    return null;
  };

  W.app = function () { return document.getElementById('app'); };
  var renderSeq = 0;
  // Guards are installed by auth.js (W.guard); this renders whichever route matches.
  W.render = function () {
    var seq = ++renderSeq;
    var loc = W.parseHash();
    var found = W.match(loc.path);
    if (!found) { W.go(W.home()); return; }
    return W.guard(found.route, loc).then(function (ok) {
      if (!ok || seq !== renderSeq) return;
      return Promise.resolve(found.route.handler(found.params, loc.query)).catch(function (err) {
        console.error(err);
        if (seq !== renderSeq) return;
        W.page(W.html`<div class="notice err">${(err && err.message) || 'Something went wrong.'}</div>`);
      });
    });
  };
  W.home = function () { return W.isAdmin() ? '/admin' : '/home'; };
  W.isStale = function (seq) { return seq !== renderSeq; };

  // ---------- layout ----------
  function navItems() {
    if (W.isAdmin()) {
      return [
        ['/admin', 'Overview', 'grid'],
        ['/admin/clients', 'Clients', 'users'],
        ['/admin/requests', 'Requests', 'inbox'],
        ['/admin/stats', 'Monthly stats', 'chart'],
        ['/admin/summaries', 'Summaries', 'doc'],
        ['/admin/settings', 'Settings', 'gear']
      ];
    }
    return [
      ['/home', 'Home', 'home'],
      ['/stats', 'Stats', 'chart'],
      ['/requests', 'Requests', 'inbox'],
      ['/meetings', 'Meetings', 'calendar'],
      ['/billing', 'Billing', 'card'],
      ['/files', 'Files', 'folder'],
      ['/account', 'Account', 'user']
    ];
  }
  W.navBadges = {};
  function navHtml(current) {
    return navItems().map(function (n) {
      var on = current === n[0] || (n[0] !== '/admin' && current.indexOf(n[0] + '/') === 0);
      var badge = W.navBadges[n[0]];
      return W.html`<a href="#${n[0]}"${on ? W.raw(' aria-current="page"') : ''}>${W.icon(n[2])}<span>${n[1]}</span>${badge ? W.html`<span class="count">${badge}</span>` : ''}</a>`;
    });
  }
  var BRAND_IMG = '../wave-logo-sm.png';
  // Renders the signed-in shell (once) and returns the main content element.
  W.page = function (content) {
    var app = W.app();
    var loc = W.parseHash();
    var shell = app.querySelector('.shell');
    if (!shell) {
      var p = W.state.profile || {};
      var clients = W.state.clients;
      W.mount(app, W.html`<div class="shell">
        <div class="topbar"><a class="brand" href="#${W.home()}"><img src="${BRAND_IMG}" alt="" width="34" height="30"><b>WAVE PORTAL</b></a>
          <button type="button" class="icon-btn" data-nav-toggle aria-label="Open menu" aria-expanded="false">${W.icon('menu')}</button></div>
        <aside class="side" aria-label="Portal">
          <a class="brand" href="#${W.home()}"><img src="${BRAND_IMG}" alt="" width="34" height="30"><div><b>WAVE PORTAL</b><span>${W.isAdmin() ? 'Admin' : 'Client area'}</span></div></a>
          ${!W.isAdmin() && clients.length > 1 ? W.html`<div class="switcher"><label for="client-switch">Business</label>
            <select id="client-switch">${clients.map(function (c) { return W.opt(c.id, c.business_name, c.id === W.state.clientId); })}</select></div>` : ''}
          <nav class="nav" aria-label="Main"></nav>
          <div class="side-foot"><div class="who" title="${p.email || ''}">${p.full_name || p.email || ''}</div>
            <a class="btn small" href="${window.WAVE_CONFIG.siteUrl}">${W.icon('home')}wavedigital.biz</a>
            <button type="button" class="btn small" data-signout>${W.icon('logout')}Sign out</button></div>
        </aside>
        <main class="main" id="main" tabindex="-1"></main></div>`);
      shell = app.querySelector('.shell');
      shell.querySelector('[data-signout]').addEventListener('click', function () { W.signOut(); });
      var toggle = shell.querySelector('[data-nav-toggle]');
      toggle.addEventListener('click', function () {
        var open = shell.classList.toggle('nav-open');
        toggle.setAttribute('aria-expanded', String(open));
      });
      shell.querySelector('.side').addEventListener('click', function (e) {
        if (e.target.closest('a')) { shell.classList.remove('nav-open'); toggle.setAttribute('aria-expanded', 'false'); }
      });
      var sw = shell.querySelector('#client-switch');
      if (sw) sw.addEventListener('change', function () { W.setClient(sw.value); W.render(); });
    }
    W.mount(shell.querySelector('.nav'), navHtml(loc.path));
    var main = shell.querySelector('#main');
    W.mount(main, W.html`<div class="page">${content}</div>`);
    window.scrollTo(0, 0);
    return main.firstElementChild;
  };
  W.loading = function () { return W.page(W.html`<p class="muted">Loading…</p>`); };
  W.resetShell = function () { var s = W.app().querySelector('.shell'); if (s) s.remove(); };

  // Renders a page header: title, optional intro line, optional actions and breadcrumb.
  W.head = function (title, intro, actions, crumb) {
    return W.html`<div class="page-head"><div>
      ${crumb ? W.html`<div class="crumb"><a href="#${crumb[0]}">${crumb[1]}</a><span aria-hidden="true">/</span></div>` : ''}
      <h1>${title}</h1>${intro ? W.html`<p>${intro}</p>` : ''}</div>
      ${actions ? W.html`<div class="actions">${actions}</div>` : ''}</div>`;
  };
  W.tabs = function (items, current) {
    return W.html`<nav class="tabs" aria-label="Sections">${items.map(function (t) {
      return W.html`<a href="#${t[0]}"${t[0] === current ? W.raw(' aria-current="page"') : ''}>${t[1]}</a>`;
    })}</nav>`;
  };
  W.pill = function (label, tone) { return W.html`<span class="pill tone-${tone}">${label}</span>`; };
  W.empty = function (title, text, action) {
    return W.html`<div class="empty"><b>${title}</b>${text ? W.html`<p>${text}</p>` : ''}${action ? W.html`<div style="margin-top:14px">${action}</div>` : ''}</div>`;
  };
})();
