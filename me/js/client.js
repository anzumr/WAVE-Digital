/* WAVE Portal for clients: home, requests and account (later phases add stats, meetings, billing, files). */
(function () {
  'use strict';
  var W = window.W, html = W.html;

  // Shown when a login isn't linked to any business yet.
  function noBusiness() {
    var s = W.state.signup;
    var msg = s && s.kind === 'existing' && s.status === 'pending'
      ? html`<p>Thanks for signing up! WAVE will confirm you're a client of <strong>${s.business_name}</strong> and connect your account, usually within one business day. You'll get an email when it's ready.</p>`
      : s && s.status === 'declined'
        ? html`<p>WAVE couldn't match your account to a client. If you think this is a mistake, please get in touch.</p>`
        : html`<p>Your account isn't linked to a business yet. WAVE will connect it shortly.</p>`;
    W.page(html`${W.head('Almost there', '')}<div class="card">${msg}
      <p class="muted" style="margin-top:10px">Questions? Email <a href="mailto:${W.state.settings.support_email}">${W.state.settings.support_email}</a>.</p>
      <p style="margin-top:16px"><a class="btn" href="${W.state.settings.calendly_url}" target="_blank" rel="noopener noreferrer">${W.icon('calendar')}Book a call with WAVE</a></p></div>`);
  }
  // Runs a client page only when a business is selected.
  W.clientRoute = function (path, handler) {
    W.route(path, 'client', function (params, query) {
      var c = W.currentClient();
      if (!c) { noBusiness(); return; }
      return handler(c, params, query);
    });
  };

  // Home sections are registered so later modules can add theirs (stats, meetings, files).
  W.homeSections = [];
  W.addHomeSection = function (order, render) {
    W.homeSections.push({ order: order, render: render });
    W.homeSections.sort(function (a, b) { return a.order - b.order; });
  };

  W.clientRoute('/home', function (c) {
    W.loading();
    return W.q(W.sb.from('clients').select('*').eq('id', c.id).single()).then(function (client) {
      var first = ((W.state.profile.full_name || '').split(' ')[0]) || '';
      var el = W.page(html`
        ${W.head(first ? 'Hi ' + first : 'Welcome', client.business_name, html`
          <a class="btn primary" href="#/requests/new">${W.icon('plus')}New request</a>
          <a class="btn" href="#/meetings">${W.icon('calendar')}Book a meeting</a>`)}
        <div data-sections style="display:grid;gap:22px"></div>`);
      var box = el.querySelector('[data-sections]');
      // Each section renders into its own slot so a slow one doesn't hold up the rest.
      return Promise.all(W.homeSections.map(function (s) {
        var slot = document.createElement('div');
        box.appendChild(slot);
        return Promise.resolve(s.render(client, slot)).catch(function (e) {
          console.error(e);
          W.mount(slot, html`<div class="notice err">${e.message}</div>`);
        });
      }));
    });
  });

  W.addHomeSection(10, function (client, slot) {
    return W.q(W.sb.from('requests').select('*').eq('client_id', client.id).in('status', W.OPEN_STATUSES).order('updated_at', { ascending: false }).limit(5))
      .then(function (rows) {
        W.mount(slot, html`<div class="card"><div class="card-head"><div><h2>Open requests</h2><p>What WAVE is working on for you.</p></div>
          <a class="btn small" href="#/requests">All requests</a></div>
          ${W.requestTable(rows, { emptyTitle: 'No open requests', emptyText: 'Need a change? Send a request and WAVE will get on it.' })}</div>`);
        W.wireRowLinks(slot);
      });
  });

  W.addHomeSection(90, function (client, slot) {
    if (client.status === 'lead') {
      W.mount(slot, html`<div class="card"><div class="card-head"><h2>Next steps</h2></div>
        <p>Thanks for reaching out! WAVE will review your project and get back to you. The fastest way to get started is a free call.</p>
        <div class="form-actions" style="justify-content:flex-start;margin-top:14px"><a class="btn primary" href="#/meetings">${W.icon('calendar')}Book a free call</a>
          <a class="btn" href="#/files">${W.icon('upload')}Share files</a></div></div>`);
      return;
    }
    var cycle = { monthly: '/mo', yearly: '/mo, billed yearly', one_time: ' one-time', none: '' }[client.billing_cycle] || '';
    W.mount(slot, html`<div class="card"><div class="card-head"><h2>Your plan</h2><a class="btn small" href="#/billing">Billing</a></div>
      <dl class="kv"><dt>Plan</dt><dd>${client.plan || 'No plan yet'}</dd>
      ${client.monthly_amount > 0 ? html`<dt>Price</dt><dd>${W.money(client.monthly_amount)}${cycle}</dd>` : ''}
      ${client.website_url ? html`<dt>Website</dt><dd><a href="${client.website_url}" target="_blank" rel="noopener noreferrer">${client.website_url.replace(/^https?:\/\//, '')}</a></dd>` : ''}
      ${client.start_date ? html`<dt>Client since</dt><dd>${W.date(client.start_date)}</dd>` : ''}</dl></div>`);
  });

  // ---------- requests ----------
  W.clientRoute('/requests', function (c, _, query) {
    W.loading();
    var show = query.show === 'closed' ? 'closed' : (query.show === 'all' ? 'all' : 'open');
    var q = W.sb.from('requests').select('*').eq('client_id', c.id).order('created_at', { ascending: false });
    if (show === 'open') q = q.in('status', W.OPEN_STATUSES);
    if (show === 'closed') q = q.in('status', ['done', 'declined']);
    return W.q(q).then(function (rows) {
      var el = W.page(html`
        ${W.head('Requests', 'Ask WAVE for changes to your website, social media, ads or branding.', html`<a class="btn primary" href="#/requests/new">${W.icon('plus')}New request</a>`)}
        ${W.tabs([['/requests', 'Open'], ['/requests?show=closed', 'Closed'], ['/requests?show=all', 'All']], show === 'open' ? '/requests' : '/requests?show=' + show)}
        <div class="card">${W.requestTable(rows, { emptyTitle: show === 'open' ? 'No open requests' : 'Nothing here yet', emptyText: show === 'open' ? 'Send a request whenever you need something changed.' : '' })}</div>`);
      W.wireRowLinks(el);
    });
  });
  W.clientRoute('/requests/new', function (c, _, query) {
    var type = W.REQ_TYPES.some(function (t) { return t[0] === query.type; }) ? query.type : 'website';
    var el = W.page(html`${W.head('New request', 'Tell WAVE what you need. You\'ll get an email when there\'s an update.', null, ['/requests', 'Requests'])}
      ${W.requestForm({ cancel: '/requests', type: type })}`);
    W.wireRequestForm(el.querySelector('form'), c.id, function (req) { W.go('/requests/' + req.id); });
  });
  W.clientRoute('/requests/:id', function (c, p) { return W.requestPage(p.id, false); });

  // ---------- account ----------
  W.clientRoute('/account', function () {
    var p = W.state.profile;
    var el = W.page(html`${W.head('Account', p.email)}
      <div class="grid-2">
        <form class="card" data-name novalidate><div class="card-head"><h2>Your details</h2></div>
          <div style="display:grid;gap:14px"><label class="field"><span>Name</span><input type="text" name="full_name" value="${p.full_name}" maxlength="120" required></label>
          <div class="field"><span>Email</span><p class="muted">${p.email} <span class="hint">· to change it, ask WAVE</span></p></div></div>
          <p class="form-error" role="alert"></p><div class="form-actions"><button class="btn primary" type="submit">Save</button></div></form>
        <form class="card" data-pass novalidate><div class="card-head"><h2>Change your password</h2></div>
          <div style="display:grid;gap:14px">
            <label class="field"><span>New password <span class="hint">At least 10 characters, letters and numbers</span></span><input type="password" name="password" autocomplete="new-password" minlength="10" required></label>
            <label class="field"><span>Confirm</span><input type="password" name="confirm" autocomplete="new-password" minlength="10" required></label>
          </div><p class="form-error" role="alert"></p><div class="form-actions"><button class="btn" type="submit">Update password</button></div></form>
      </div>`);
    W.onSubmit(el.querySelector('[data-name]'), function (v) {
      return W.q(W.sb.from('profiles').update({ full_name: v.full_name }).eq('id', p.id)).then(function () {
        p.full_name = v.full_name; W.resetShell(); W.toast('Saved.'); W.render();
      });
    });
    W.wirePasswordForm(el.querySelector('[data-pass]'));
  });
})();
