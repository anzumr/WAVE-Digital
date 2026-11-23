/* WAVE Portal admin: overview, clients, client pages, request inbox, settings. */
(function () {
  'use strict';
  var W = window.W, html = W.html;

  W.PLANS = [
    ['Website Creation', 'monthly', 100], ['Social Media Maintenance', 'monthly', 100], ['Advertising', 'monthly', 150],
    ['Full WAVE Package', 'monthly', 350], ['Website Creation (yearly)', 'yearly', 83.33], ['Full WAVE Package (yearly)', 'yearly', 250],
    ['Logo / Rebranding', 'one_time', 0], ['Business Advice', 'none', 0]
  ];
  var CYCLES = [['monthly', 'Monthly'], ['yearly', 'Yearly'], ['one_time', 'One-time'], ['none', 'No billing']];
  var CLIENT_STATUS = { lead: ['Lead', 'cyan'], active: ['Active', 'green'], paused: ['Paused', 'amber'], cancelled: ['Cancelled', 'muted'] };
  W.clientStatusPill = function (s) { var m = CLIENT_STATUS[s] || [s, 'muted']; return W.pill(m[0], m[1]); };
  W.billingPill = function (s) { return s === 'overdue' ? W.pill('Overdue', 'red') : W.pill('Current', 'green'); };

  // Updates the "new requests" count in the admin menu.
  W.refreshBadges = function () {
    if (!W.isAdmin()) return Promise.resolve();
    return W.sb.from('requests').select('id', { count: 'exact', head: true }).eq('status', 'new').then(function (r) {
      W.navBadges['/admin/requests'] = r.count || 0;
      var a = document.querySelector('.nav a[href="#/admin/requests"]');
      if (!a) return;
      var c = a.querySelector('.count');
      if (r.count) { if (!c) { c = document.createElement('span'); c.className = 'count'; a.appendChild(c); } c.textContent = r.count; }
      else if (c) c.remove();
    });
  };

  // ---------- overview ----------
  W.route('/admin', 'admin', function () {
    W.loading();
    var monthStart = W.isoDay(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
    var weekAhead = W.isoDay(new Date(Date.now() + 7 * 86400000));
    return Promise.all([
      W.q(W.sb.from('clients').select('id, business_name, status, billing_status, monthly_amount, next_payment_date, plan')),
      W.q(W.sb.from('requests').select('id, ref_no, title, type, status, priority, updated_at, created_at, wanted_by, client_id, clients(business_name)').in('status', W.OPEN_STATUSES).order('created_at', { ascending: false })),
      W.q(W.sb.from('activity_log').select('id, summary, created_at, client_id, clients(business_name)').order('created_at', { ascending: false }).limit(10)),
      W.sb.from('requests').select('id', { count: 'exact', head: true }).eq('status', 'done').gte('closed_at', monthStart),
      W.q(W.sb.from('meetings').select('id, topic, starts_at, client_id, clients(business_name)').eq('status', 'scheduled').gte('starts_at', new Date().toISOString()).order('starts_at').limit(5)),
      W.q(W.sb.from('file_requests').select('id, title, created_at, client_id, clients(business_name)').eq('status', 'open').order('created_at')),
      W.q(W.sb.from('monthly_summaries').select('id, status, last_error, month').eq('status', 'draft'))
    ]).then(function (res) {
      var clients = res[0], open = res[1], activity = res[2], doneThisMonth = res[3].count || 0;
      var meetings = res[4], waitingFiles = res[5], drafts = res[6];
      var active = clients.filter(function (c) { return c.status === 'active'; });
      var mrr = active.reduce(function (s, c) { return s + Number(c.monthly_amount || 0); }, 0);
      var overdue = clients.filter(function (c) { return c.billing_status === 'overdue' && c.status !== 'cancelled'; });
      var dueSoon = active.filter(function (c) { return c.next_payment_date && c.next_payment_date <= weekAhead && c.billing_status !== 'overdue'; })
        .sort(function (a, b) { return a.next_payment_date < b.next_payment_date ? -1 : 1; });
      var fresh = open.filter(function (r) { return r.status === 'new'; });
      open.sort(function (a, b) { return (b.priority === 'urgent') - (a.priority === 'urgent') || (b.created_at > a.created_at ? 1 : -1); });
      var byPlan = {};
      active.forEach(function (c) { var k = c.plan || 'No plan'; byPlan[k] = (byPlan[k] || 0) + Number(c.monthly_amount || 0); });
      var planRows = Object.keys(byPlan).map(function (k) { return { label: k, value: byPlan[k] }; })
        .filter(function (r) { return r.value > 0; }).sort(function (a, b) { return b.value - a.value; });
      var failedDrafts = drafts.filter(function (d) { return d.last_error; });
      var name = ((W.state.profile.full_name || '').split(' ')[0]) || 'there';
      var todo = [];
      if (fresh.length) todo.push(html`<a class="list-item" href="#/admin/requests?status=new"><div class="grow"><div class="cell-title">${fresh.length} new request${fresh.length === 1 ? '' : 's'}</div><div class="cell-sub">Waiting for your first reply</div></div>${W.pill('Requests', 'cyan')}</a>`);
      if (overdue.length) todo.push(html`<a class="list-item" href="#/admin/clients?billing=overdue"><div class="grow"><div class="cell-title">${overdue.length} overdue payment${overdue.length === 1 ? '' : 's'}</div><div class="cell-sub">${overdue.map(function (c) { return c.business_name; }).join(', ')}</div></div>${W.pill('Billing', 'red')}</a>`);
      if (drafts.length) todo.push(html`<a class="list-item" href="#/admin/summaries?month=${drafts[0].month.slice(0, 7)}"><div class="grow"><div class="cell-title">${drafts.length} summar${drafts.length === 1 ? 'y' : 'ies'} waiting to go out</div><div class="cell-sub">${failedDrafts.length ? failedDrafts.length + ' could not be sent: ' + failedDrafts[0].last_error : 'Add a note or send early'}</div></div>${W.pill('Summaries', failedDrafts.length ? 'red' : 'amber')}</a>`);
      if (waitingFiles.length) todo.push(html`<div class="list-item"><div class="grow"><div class="cell-title">Waiting on ${waitingFiles.length} file${waitingFiles.length === 1 ? '' : 's'} from clients</div><div class="cell-sub">${waitingFiles.slice(0, 3).map(function (f) { return (f.clients && f.clients.business_name) + ': ' + f.title; }).join(' · ')}</div></div>${W.pill('Files', 'muted')}</div>`);
      W.page(html`
        ${W.head('Hi ' + name, 'Here is how WAVE Digital is doing today.', html`<a class="btn primary" href="#/admin/clients?add=1">${W.icon('plus')}Add client</a>`)}
        <div class="tiles">
          <div class="tile"><div class="label">Monthly recurring revenue</div><div class="value">${W.money(mrr)}</div><div class="sub">${W.money(mrr * 12)} a year · ${active.length} active client${active.length === 1 ? '' : 's'}</div></div>
          <a class="tile" href="#/admin/clients"><div class="label">Active clients</div><div class="value">${active.length}</div><div class="sub">${clients.length} in total</div></a>
          <a class="tile" href="#/admin/requests"><div class="label">Open requests</div><div class="value">${open.length}</div><div class="sub">${fresh.length} new, waiting on you</div></a>
          <a class="tile" href="#/admin/clients?billing=overdue"><div class="label">Overdue payments</div><div class="value${overdue.length ? ' delta-down' : ''}">${overdue.length}</div><div class="sub">${overdue.length ? W.money(overdue.reduce(function (s, c) { return s + Number(c.monthly_amount || 0); }, 0)) + ' a month at risk' : 'Everyone is paid up'}</div></a>
          <div class="tile"><div class="label">Requests done this month</div><div class="value">${doneThisMonth}</div><div class="sub">since ${W.date(monthStart)}</div></div>
        </div>
        ${todo.length ? html`<div class="card"><div class="card-head"><h2>Needs your attention</h2></div><div class="list">${todo}</div></div>` : ''}
        <div class="split">
          <div class="card"><div class="card-head"><div><h2>Open requests</h2><p>Urgent first, then newest.</p></div><a class="btn small" href="#/admin/requests">All requests</a></div>
            ${W.requestTable(open.slice(0, 8), { admin: true, showClient: true, emptyTitle: 'Nothing open', emptyText: 'New client requests will show up here.' })}</div>
          <div style="display:grid;gap:22px">
            <div class="card"><div class="card-head"><h2>Coming up</h2></div>
              ${meetings.length || dueSoon.length ? html`<div class="list">
                ${meetings.map(function (m) { return html`<a class="list-item" href="#/admin/clients/${m.client_id}/meetings"><div style="color:var(--muted)">${W.icon('calendar')}</div><div class="grow"><div class="cell-title">${m.clients && m.clients.business_name}</div><div class="cell-sub">${m.topic || 'Meeting'} · ${W.dateTime(m.starts_at)}</div></div></a>`; })}
                ${dueSoon.map(function (c) { return html`<a class="list-item" href="#/admin/clients/${c.id}/billing"><div style="color:var(--muted)">${W.icon('card')}</div><div class="grow"><div class="cell-title">${c.business_name}</div><div class="cell-sub">${W.money(c.monthly_amount)} due ${W.date(c.next_payment_date)}</div></div></a>`; })}
              </div>` : html`<p class="muted">No meetings or payments in the next week.</p>`}</div>
            <div class="card"><div class="card-head"><div><h2>Revenue by plan</h2><p>Monthly value of active clients</p></div></div>
              ${W.rankedBars(planRows, { format: W.money, empty: 'Add plans to your clients to see this.' })}</div>
          </div>
        </div>
        <div class="card"><div class="card-head"><h2>Recent activity</h2><a class="btn small" href="#/admin/activity">All activity</a></div>
          ${activity.length ? html`<div class="list">${activity.map(function (a) {
            return html`<div class="list-item"><div class="grow"><div>${a.summary}</div>
              <div class="cell-sub">${a.clients ? a.clients.business_name + ' · ' : ''}${W.ago(a.created_at)}</div></div></div>`;
          })}</div>` : W.empty('No activity yet', 'Adding clients and handling requests will show up here.')}</div>`);
      W.wireRowLinks(W.$('#main'));
      W.refreshBadges();
    });
  });

  // ---------- activity log ----------
  W.route('/admin/activity', 'admin', function (_, query) {
    W.loading();
    var limit = Math.min(1000, Number(query.limit) || 100);
    var q = W.sb.from('activity_log').select('id, summary, created_at, client_id, clients(business_name), actor:profiles(full_name, email)')
      .order('created_at', { ascending: false }).limit(limit + 1);
    if (query.client) q = q.eq('client_id', query.client);
    return Promise.all([W.q(q), W.q(W.sb.from('clients').select('id, business_name').order('business_name'))]).then(function (res) {
      var rows = res[0], more = rows.length > limit;
      rows = rows.slice(0, limit);
      var el = W.page(html`
        ${W.head('Activity', 'Everything that happened across your clients, newest first.')}
        <div class="filters"><label class="field" style="min-width:240px"><span>Client</span><select data-client><option value="">All clients</option>${W.options(res[1].map(function (c) { return [c.id, c.business_name]; }), query.client || '')}</select></label></div>
        <div class="card">${rows.length ? html`<div class="list">${rows.map(function (a) {
          var who = a.actor ? (a.actor.full_name || a.actor.email) : 'System';
          return html`<div class="list-item"><div class="grow"><div>${a.summary}</div>
            <div class="cell-sub">${a.clients ? html`<a href="#/admin/clients/${a.client_id}">${a.clients.business_name}</a> · ` : ''}${who} · ${W.dateTime(a.created_at)}</div></div></div>`;
        })}</div>` : W.empty('No activity yet', '')}
        ${more ? html`<div style="margin-top:16px;text-align:center"><button type="button" class="btn small" data-more>Show more</button></div>` : ''}</div>`);
      el.querySelector('[data-client]').addEventListener('change', function (e) { W.go('/admin/activity' + (e.target.value ? '?client=' + e.target.value : '')); });
      var m = el.querySelector('[data-more]');
      if (m) m.addEventListener('click', function () {
        var qs = new URLSearchParams(); if (query.client) qs.set('client', query.client); qs.set('limit', String(limit + 100));
        W.go('/admin/activity?' + qs);
      });
    });
  });

  // ---------- clients ----------
  function clientForm(c, isNew) {
    c = c || {};
    var planNames = W.PLANS.map(function (p) { return [p[0], p[0]]; });
    if (c.plan && !W.PLANS.some(function (p) { return p[0] === c.plan; })) planNames.push([c.plan, c.plan]);
    return html`<div class="form-grid">
      <label class="field wide"><span>Business name</span><input type="text" name="business_name" value="${c.business_name || ''}" maxlength="120" required></label>
      <label class="field"><span>Contact name</span><input type="text" name="contact_name" value="${c.contact_name || ''}" maxlength="120"></label>
      <label class="field"><span>Contact email</span><input type="email" name="contact_email" value="${c.contact_email || ''}" maxlength="200"${isNew ? W.raw(' autocomplete="off"') : ''}></label>
      <label class="field"><span>Phone</span><input type="tel" name="contact_phone" value="${c.contact_phone || ''}" maxlength="40"></label>
      <label class="field"><span>Status</span><select name="status">${W.options(Object.keys(CLIENT_STATUS).map(function (k) { return [k, CLIENT_STATUS[k][0]]; }), c.status || 'active')}</select></label>
      <label class="field"><span>Plan</span><select name="plan" data-plan><option value="">No plan yet</option>${W.options(planNames, c.plan || '')}</select></label>
      <label class="field"><span>Billing</span><select name="billing_cycle">${W.options(CYCLES, c.billing_cycle || 'monthly')}</select></label>
      <label class="field"><span>Monthly value ($) <span class="hint">Yearly plans: yearly price ÷ 12</span></span><input type="number" name="monthly_amount" min="0" step="0.01" value="${c.monthly_amount != null ? c.monthly_amount : 0}"></label>
      <label class="field"><span>Payment status</span><select name="billing_status">${W.options([['current', 'Current'], ['overdue', 'Overdue']], c.billing_status || 'current')}</select></label>
      <label class="field"><span>Next payment date <span class="hint">Optional</span></span><input type="date" name="next_payment_date" value="${c.next_payment_date || ''}"></label>
      <label class="field"><span>Start date</span><input type="date" name="start_date" value="${c.start_date || W.isoDay()}"></label>
      <label class="field"><span>Website</span><input type="text" name="website_url" value="${c.website_url || ''}" maxlength="300" placeholder="https://…"></label>
      <label class="field"><span>Domain</span><input type="text" name="domain" value="${c.domain || ''}" maxlength="200" placeholder="example.com"></label>
    </div>`;
  }
  function wirePlanPreset(form) {
    var plan = form.querySelector('[data-plan]');
    plan.addEventListener('change', function () {
      var p = W.PLANS.filter(function (x) { return x[0] === plan.value; })[0];
      if (!p) return;
      form.querySelector('[name=billing_cycle]').value = p[1];
      form.querySelector('[name=monthly_amount]').value = p[2];
    });
  }
  function clientRow(v) {
    return {
      business_name: v.business_name, contact_name: v.contact_name || '', contact_email: (v.contact_email || '').toLowerCase(),
      contact_phone: v.contact_phone || '', status: v.status, plan: v.plan || '', billing_cycle: v.billing_cycle,
      monthly_amount: Number(v.monthly_amount || 0), billing_status: v.billing_status, next_payment_date: v.next_payment_date || null,
      start_date: v.start_date || null, website_url: v.website_url || '', domain: v.domain || ''
    };
  }

  // Sends a portal invite and shows the result (with the link to copy if email isn't set up).
  W.inviteResult = function (r, email) {
    if (r.existing && !r.action_link) {
      W.toast(r.emailed ? email + ' already had an account; they now have access and were emailed.' : email + ' already had an account and now has access.');
      return;
    }
    W.linkDialog(r.emailed ? 'Invite sent' : 'Invite created',
      r.emailed ? 'We emailed ' + email + ' a link to set their password. You can also copy it here.'
        : 'Send this link to ' + email + ' yourself (text or email). It works once and expires in 24 hours.',
      r.action_link,
      r.emailed ? '' : (r.email_note || ''));
  };

  function addClientDialog() {
    W.modal('Add a client', html`<form novalidate>
      ${clientForm({}, true)}
      <label class="check" style="margin-top:16px"><input type="checkbox" name="invite" checked> <span>Invite the contact to the portal now<br><span class="muted" style="font-size:13px">They get an email with a link to set their password.</span></span></label>
      <p class="form-error" role="alert"></p>
      <div class="form-actions"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary" type="submit">Add client</button></div>
    </form>`, function (d, close) {
      var form = d.querySelector('form');
      wirePlanPreset(form);
      W.onSubmit(form, function (v) {
        if (v.invite && !v.contact_email) throw new Error('Add the contact email to send an invite, or untick the invite box.');
        return W.q(W.sb.from('clients').insert(clientRow(v)).select('id').single()).then(function (c) {
          close();
          if (!v.invite) { W.toast('Client added.'); W.go('/admin/clients/' + c.id); return; }
          return W.fn('admin-users', { action: 'invite', client_id: c.id, email: v.contact_email, full_name: v.contact_name, member_role: 'owner' })
            .then(function (r) { W.go('/admin/clients/' + c.id + '/people'); setTimeout(function () { W.inviteResult(r, v.contact_email); }, 300); },
              function (e) { W.go('/admin/clients/' + c.id + '/people'); W.toast('Client added, but the invite failed: ' + e.message, true); });
        });
      });
    });
  }

  W.route('/admin/clients', 'admin', function (_, query) {
    W.loading();
    return Promise.all([
      W.q(W.sb.from('clients').select('*').order('business_name')),
      W.q(W.sb.from('requests').select('client_id, status').in('status', W.OPEN_STATUSES))
    ]).then(function (res) {
      var all = res[0], openCount = {};
      res[1].forEach(function (r) { openCount[r.client_id] = (openCount[r.client_id] || 0) + 1; });
      var filter = query.billing === 'overdue' ? 'overdue' : (query.status || 'current');
      var rows = all.filter(function (c) {
        if (filter === 'overdue') return c.billing_status === 'overdue' && c.status !== 'cancelled';
        if (filter === 'current') return c.status !== 'cancelled';
        if (filter === 'all') return true;
        return c.status === filter;
      });
      var el = W.page(html`
        ${W.head('Clients', all.length + ' client' + (all.length === 1 ? '' : 's'), html`<button type="button" class="btn primary" data-add>${W.icon('plus')}Add client</button>`)}
        <div class="card">
          <div class="card-head"><label class="field" style="min-width:220px"><span class="sr-only">Show</span>
            <select data-filter>${W.options([['current', 'Current clients'], ['active', 'Active'], ['lead', 'Leads'], ['paused', 'Paused'], ['cancelled', 'Cancelled'], ['overdue', 'Overdue payments'], ['all', 'All clients']], filter)}</select></label></div>
          ${rows.length ? html`<div class="table-wrap"><table class="data stack"><thead><tr><th>Business</th><th>Plan</th><th class="num">Monthly</th><th>Status</th><th class="hide-sm">Payment</th><th class="num hide-sm">Open requests</th></tr></thead><tbody>
            ${rows.map(function (c) {
              return html`<tr class="clickable" data-href="#/admin/clients/${c.id}">
                <td><a class="cell-title" href="#/admin/clients/${c.id}">${c.business_name}</a><div class="cell-sub">${c.contact_name || c.contact_email || ''}</div></td>
                <td>${c.plan || html`<span class="faint">None</span>`}</td>
                <td class="num">${W.money(c.monthly_amount)}</td>
                <td>${W.clientStatusPill(c.status)}</td>
                <td class="hide-sm">${W.billingPill(c.billing_status)}</td>
                <td class="num hide-sm">${openCount[c.id] || 0}</td></tr>`;
            })}</tbody></table></div>` : W.empty(all.length ? 'No clients match' : 'No clients yet', all.length ? 'Try another filter.' : 'Add your first client to give them portal access.',
              all.length ? '' : html`<button type="button" class="btn primary" data-add>Add client</button>`)}
        </div>`);
      W.wireRowLinks(el);
      W.$$('[data-add]', el).forEach(function (b) { b.addEventListener('click', addClientDialog); });
      el.querySelector('[data-filter]').addEventListener('change', function (e) {
        W.go('/admin/clients' + (e.target.value === 'overdue' ? '?billing=overdue' : '?status=' + e.target.value));
      });
      if (query.add) { history.replaceState(null, '', '#/admin/clients'); addClientDialog(); }
    });
  });

  // ---------- client page (tabs are registered so later modules can add theirs) ----------
  W.clientTabs = [];
  W.addClientTab = function (key, label, render, order) {
    W.clientTabs.push({ key: key, label: label, render: render, order: order });
    W.clientTabs.sort(function (a, b) { return a.order - b.order; });
  };

  function clientPage(params) {
    var tab = params.tab || 'summary';
    var def = W.clientTabs.filter(function (t) { return t.key === tab; })[0];
    if (!def) { W.go('/admin/clients/' + params.id); return; }
    W.loading();
    return W.q(W.sb.from('clients').select('*, client_private(*)').eq('id', params.id).maybeSingle()).then(function (c) {
      if (!c) { W.page(W.head('Client not found', 'It may have been deleted.', null, ['/admin/clients', 'Clients'])); return; }
      c.private = (Array.isArray(c.client_private) ? c.client_private[0] : c.client_private) || {};
      var page = W.page(html`
        ${W.head(c.business_name, html`${W.clientStatusPill(c.status)} <span style="margin-left:8px">${c.plan || 'No plan'} · ${W.money(c.monthly_amount)}/mo</span>`, null, ['/admin/clients', 'Clients'])}
        ${W.tabs(W.clientTabs.map(function (t) { return ['/admin/clients/' + c.id + (t.key === 'summary' ? '' : '/' + t.key), t.label]; }),
          '/admin/clients/' + c.id + (tab === 'summary' ? '' : '/' + tab))}
        <div data-tab></div>`);
      return def.render(c, page.querySelector('[data-tab]'));
    });
  }
  W.route('/admin/clients/:id', 'admin', clientPage);
  W.route('/admin/clients/:id/:tab', 'admin', clientPage);

  // Every stored object that belongs to a client (later phases add their own sources).
  W.storageSources = [function (clientId) {
    return W.q(W.sb.from('files').select('bucket_path').eq('client_id', clientId)).then(function (rows) {
      return rows.map(function (r) { return r.bucket_path; });
    });
  }];
  W.clientStoragePaths = function (clientId) {
    return Promise.all(W.storageSources.map(function (f) { return f(clientId); })).then(function (lists) {
      return [].concat.apply([], lists).filter(Boolean);
    });
  };

  W.addClientTab('summary', 'Summary', function (c, el) {
    W.mount(el, html`<div class="split">
      <form class="card" data-client novalidate><div class="card-head"><h2>Details</h2></div>${clientForm(c, false)}
        <p class="form-error" role="alert"></p><div class="form-actions"><button class="btn primary" type="submit">Save changes</button></div></form>
      <div style="display:grid;gap:22px">
        <form class="card" data-private novalidate><div class="card-head"><div><h2>Private notes</h2><p>Only you can see these.</p></div></div>
          <label class="field"><span class="sr-only">Notes</span><textarea name="notes" maxlength="20000" style="min-height:160px">${c.private.notes || ''}</textarea></label>
          <label class="field" style="margin-top:14px"><span>Stripe customer ID <span class="hint">Optional, e.g. cus_…</span></span><input type="text" name="stripe_customer_id" value="${c.private.stripe_customer_id || ''}" maxlength="100"></label>
          <p class="form-error" role="alert"></p><div class="form-actions"><button class="btn" type="submit">Save notes</button></div></form>
        <div class="card"><h2 style="margin-bottom:8px">Delete client</h2><p class="muted" style="font-size:14px;margin-bottom:14px">Removes the client with all their requests, files, stats and meetings. Their logins stay, but lose access.</p>
          <button type="button" class="btn danger" data-delete>Delete ${c.business_name}</button></div>
      </div></div>`);
    var form = el.querySelector('[data-client]');
    wirePlanPreset(form);
    W.onSubmit(form, function (v) {
      return W.q(W.sb.from('clients').update(clientRow(v)).eq('id', c.id)).then(function () { W.toast('Saved.'); W.render(); });
    });
    W.onSubmit(el.querySelector('[data-private]'), function (v) {
      return W.q(W.sb.from('client_private').upsert({ client_id: c.id, notes: v.notes || '', stripe_customer_id: v.stripe_customer_id || '' }))
        .then(function () { W.toast('Notes saved.'); });
    });
    el.querySelector('[data-delete]').addEventListener('click', function () {
      W.modal('Delete ' + c.business_name + '?', html`<form novalidate><p>This permanently deletes the client and everything in their portal. Type the business name to confirm.</p>
        <label class="field"><span class="sr-only">Business name</span><input type="text" name="confirm" autocomplete="off" required></label>
        <p class="form-error" role="alert"></p><div class="form-actions"><button type="button" class="btn" data-close>Cancel</button><button class="btn danger" type="submit">Delete permanently</button></div></form>`,
      function (d, close) {
        W.onSubmit(d.querySelector('form'), function (v) {
          if (v.confirm !== c.business_name) throw new Error('The name doesn\'t match.');
          // Collect the stored files first, delete the client (its rows cascade), then remove the files.
          var paths;
          return W.clientStoragePaths(c.id).then(function (p) { paths = p; })
            .then(function () { return W.q(W.sb.from('clients').delete().eq('id', c.id)); })
            .then(function () { return paths.length ? W.sb.storage.from('client-files').remove(paths) : null; })
            .then(function () { close(); W.toast('Client deleted.'); W.go('/admin/clients'); });
        });
      });
    });
  }, 10);

  W.addClientTab('people', 'People', function (c, el) {
    W.mount(el, html`<p class="muted">Loading…</p>`);
    return W.fn('admin-users', { action: 'list_members', client_id: c.id }).then(function (r) {
      var members = r.members || [];
      W.mount(el, html`<div class="split">
        <div class="card"><div class="card-head"><div><h2>Portal access</h2><p>People who can sign in and see ${c.business_name}.</p></div></div>
          ${members.length ? html`<div class="list">${members.map(function (m) {
            var state = m.confirmed ? (m.last_sign_in_at ? 'Last signed in ' + W.ago(m.last_sign_in_at) : 'Account set up') : 'Invite sent ' + W.ago(m.invited_at || m.added_at) + ', not accepted yet';
            return html`<div class="list-item"><div class="grow"><div class="cell-title">${m.full_name || m.email}${m.role === 'owner' ? html` <span class="faint" style="font-weight:500">· owner</span>` : ''}</div>
              <div class="cell-sub">${m.full_name ? m.email + ' · ' : ''}${state}</div></div>
              <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">
                ${m.confirmed ? html`<button type="button" class="btn small" data-reset="${m.user_id}" data-email="${m.email}">Reset link</button>`
                  : html`<button type="button" class="btn small" data-resend="${m.user_id}" data-email="${m.email}">Resend invite</button>`}
                <button type="button" class="btn small danger" data-remove="${m.user_id}" data-email="${m.email}">Remove</button></div></div>`;
          })}</div>` : W.empty('Nobody has access yet', 'Invite the client\'s contact so they can sign in.')}</div>
        <form class="card" novalidate><div class="card-head"><div><h2>Invite someone</h2><p>They get an email with a link to set their password.</p></div></div>
          <div style="display:grid;gap:14px">
            <label class="field"><span>Name</span><input type="text" name="full_name" maxlength="120" value="${members.length ? '' : c.contact_name}"></label>
            <label class="field"><span>Email</span><input type="email" name="email" maxlength="200" required value="${members.length ? '' : c.contact_email}"></label>
            <label class="field"><span>Role</span><select name="member_role">${W.options([['owner', 'Owner'], ['member', 'Team member']], members.length ? 'member' : 'owner')}</select></label>
          </div>
          <p class="form-error" role="alert"></p><div class="form-actions"><button class="btn primary" type="submit" data-busy="Sending…">Send invite</button></div></form>
      </div>`);
      W.onSubmit(el.querySelector('form'), function (v) {
        return W.fn('admin-users', { action: 'invite', client_id: c.id, email: v.email, full_name: v.full_name, member_role: v.member_role })
          .then(function (res) { W.render(); setTimeout(function () { W.inviteResult(res, v.email); }, 300); });
      });
      el.addEventListener('click', function (e) {
        var b = e.target.closest('[data-resend],[data-reset],[data-remove]');
        if (!b) return;
        var uid = b.getAttribute('data-resend') || b.getAttribute('data-reset') || b.getAttribute('data-remove');
        var email = b.getAttribute('data-email');
        if (b.hasAttribute('data-remove')) {
          W.confirm('Remove ' + email + '?', 'They will no longer be able to see ' + c.business_name + ' in the portal.', 'Remove access', true).then(function (ok) {
            if (!ok) return;
            W.fn('admin-users', { action: 'remove_member', client_id: c.id, user_id: uid, delete_account: true })
              .then(function () { W.toast('Access removed.'); W.render(); }, function (err) { W.toast(err.message, true); });
          });
          return;
        }
        b.disabled = true;
        W.fn('admin-users', { action: b.hasAttribute('data-resend') ? 'resend_invite' : 'reset_link', client_id: c.id, user_id: uid })
          .then(function (res) {
            W.linkDialog(res.emailed ? 'Link sent' : 'Link created',
              res.emailed ? 'We emailed ' + email + ' a new link. You can also copy it here.' : 'Send this link to ' + email + ' yourself. It works once.',
              res.action_link, res.emailed ? '' : (res.email_note || ''));
          }, function (err) { W.toast(err.message, true); })
          .then(function () { b.disabled = false; });
      });
    });
  }, 20);

  W.addClientTab('requests', 'Requests', function (c, el) {
    return W.q(W.sb.from('requests').select('*').eq('client_id', c.id).order('created_at', { ascending: false })).then(function (rows) {
      W.mount(el, html`<div class="card">${W.requestTable(rows, { admin: true, emptyTitle: 'No requests yet', emptyText: c.business_name + ' hasn\'t sent any requests.' })}</div>`);
      W.wireRowLinks(el);
    });
  }, 30);

  W.addClientTab('activity', 'Activity', function (c, el) {
    return W.q(W.sb.from('activity_log').select('*, actor:profiles(full_name, email)').eq('client_id', c.id).order('created_at', { ascending: false }).limit(100)).then(function (rows) {
      W.mount(el, html`<div class="card">${rows.length ? html`<div class="list">${rows.map(function (a) {
        var who = a.actor ? (a.actor.full_name || a.actor.email) : 'System';
        return html`<div class="list-item"><div class="grow"><div>${a.summary}</div><div class="cell-sub">${who} · ${W.dateTime(a.created_at)}</div></div></div>`;
      })}</div>` : W.empty('No activity yet', '')}</div>`);
    });
  }, 90);

  // ---------- request inbox ----------
  W.route('/admin/requests', 'admin', function (_, query) {
    W.loading();
    var status = query.status || 'open';
    var q = W.sb.from('requests').select('*, clients(business_name)').order('created_at', { ascending: false }).limit(300);
    if (status === 'open') q = q.in('status', W.OPEN_STATUSES);
    else if (status !== 'all') q = q.eq('status', status);
    if (query.client) q = q.eq('client_id', query.client);
    if (query.type) q = q.eq('type', query.type);
    return Promise.all([W.q(q), W.q(W.sb.from('clients').select('id, business_name').order('business_name'))]).then(function (res) {
      var rows = res[0], clients = res[1];
      if (status === 'open') rows.sort(function (a, b) { return (b.priority === 'urgent') - (a.priority === 'urgent') || (b.created_at > a.created_at ? 1 : -1); });
      var el = W.page(html`
        ${W.head('Requests', 'Every request from every client.')}
        <div class="card"><form class="form-grid" data-filters style="grid-template-columns:repeat(3,minmax(0,1fr));margin-bottom:18px">
          <label class="field"><span>Status</span><select name="status">${W.options([['open', 'Open'], ['new', 'New'], ['in_progress', 'In progress'], ['waiting_on_client', 'Waiting on client'], ['done', 'Done'], ['declined', 'Declined'], ['all', 'All']], status)}</select></label>
          <label class="field"><span>Client</span><select name="client"><option value="">All clients</option>${W.options(clients.map(function (c) { return [c.id, c.business_name]; }), query.client || '')}</select></label>
          <label class="field"><span>Type</span><select name="type"><option value="">All types</option>${W.options(W.REQ_TYPES, query.type || '')}</select></label>
        </form>
        ${W.requestTable(rows, { admin: true, showClient: !query.client, emptyTitle: 'No requests here', emptyText: status === 'open' ? 'You are all caught up.' : 'Try another filter.' })}</div>`);
      W.wireRowLinks(el);
      el.querySelector('[data-filters]').addEventListener('change', function (e) {
        var v = W.formData(e.currentTarget), qs = new URLSearchParams();
        Object.keys(v).forEach(function (k) { if (v[k] && !(k === 'status' && v[k] === 'open')) qs.set(k, v[k]); });
        W.go('/admin/requests' + (qs.toString() ? '?' + qs : ''));
      });
      W.refreshBadges();
    });
  });
  W.route('/admin/requests/:id', 'admin', function (p) { return W.requestPage(p.id, true); });

  // ---------- settings ----------
  W.route('/admin/settings', 'admin', function () {
    W.loading();
    return Promise.all([
      W.q(W.sb.from('app_settings').select('*').single()),
      W.q(W.sb.from('admin_settings').select('*').single()),
      W.sb.auth.mfa.listFactors()
    ]).then(function (res) {
      var app = res[0], adm = res[1];
      var factors = ((res[2].data && res[2].data.totp) || []).filter(function (f) { return f.status === 'verified'; });
      var el = W.page(html`
        ${W.head('Settings', 'Portal-wide settings and your admin account.')}
        <div class="grid-2">
          <form class="card" data-app novalidate><div class="card-head"><div><h2>Client-facing links</h2><p>What clients see in the portal.</p></div></div>
            <div style="display:grid;gap:14px">
              <label class="field"><span>Calendly booking link</span><input type="url" name="calendly_url" value="${app.calendly_url}" maxlength="300" required></label>
              <label class="field"><span>Stripe customer portal link <span class="hint">From Stripe → Settings → Billing → Customer portal</span></span><input type="url" name="stripe_portal_url" value="${app.stripe_portal_url}" maxlength="300" placeholder="https://billing.stripe.com/p/login/…"></label>
              <label class="field"><span>Support email</span><input type="email" name="support_email" value="${app.support_email}" maxlength="200" required></label>
            </div><p class="form-error" role="alert"></p><div class="form-actions"><button class="btn primary" type="submit">Save</button></div></form>
          <form class="card" data-adm novalidate><div class="card-head"><div><h2>Notifications</h2><p>Where your alerts go, and how summaries are sent.</p></div></div>
            <div style="display:grid;gap:14px">
              <label class="field"><span>Send my alerts to <span class="hint">Leave empty to use your login email</span></span><input type="email" name="admin_notify_email" value="${adm.admin_notify_email}" maxlength="200"></label>
              <label class="field"><span>Monthly summaries go out <span class="hint">Days after the month ends, so you can add a note first</span></span>
                <select name="summary_send_delay_days">${W.options([[0, 'Right away (the 1st)'], [1, '1 day later'], [2, '2 days later'], [3, '3 days later'], [5, '5 days later'], [7, '7 days later']], adm.summary_send_delay_days)}</select></label>
            </div><p class="form-error" role="alert"></p><div class="form-actions"><button class="btn primary" type="submit">Save</button></div></form>
          <form class="card" data-pass novalidate><div class="card-head"><div><h2>Change your password</h2></div></div>
            <div style="display:grid;gap:14px">
              <label class="field"><span>New password <span class="hint">At least 10 characters, letters and numbers</span></span><input type="password" name="password" autocomplete="new-password" minlength="10" required></label>
              <label class="field"><span>Confirm</span><input type="password" name="confirm" autocomplete="new-password" minlength="10" required></label>
            </div><p class="form-error" role="alert"></p><div class="form-actions"><button class="btn" type="submit">Update password</button></div></form>
          <div class="card"><h2 style="margin-bottom:10px">Two-step verification</h2>
            <p class="muted" style="font-size:14px">${factors.length ? 'On. Your authenticator app is required each time you sign in as admin.' : 'Not set up.'}</p>
            <p class="muted" style="font-size:14px;margin-top:10px">Lost your phone? In Supabase, open Authentication → Users, select your user and remove the authenticator, then sign in again to set it up anew.</p></div>
        </div>`);
      W.onSubmit(el.querySelector('[data-app]'), function (v) {
        return W.q(W.sb.from('app_settings').update({ calendly_url: v.calendly_url, stripe_portal_url: v.stripe_portal_url || '', support_email: v.support_email }).eq('id', true))
          .then(function () { W.state.settings = Object.assign({}, W.state.settings, v); W.toast('Saved.'); });
      });
      W.onSubmit(el.querySelector('[data-adm]'), function (v) {
        return W.q(W.sb.from('admin_settings').update({ admin_notify_email: (v.admin_notify_email || '').toLowerCase(), summary_send_delay_days: Number(v.summary_send_delay_days) }).eq('id', true))
          .then(function () { W.toast('Saved.'); });
      });
      W.wirePasswordForm(el.querySelector('[data-pass]'));
    });
  });

  W.wirePasswordForm = function (form) {
    W.onSubmit(form, function (v) {
      if (v.password !== v.confirm) throw new Error("The two passwords don't match.");
      if (!/[a-z]/i.test(v.password) || !/[0-9]/.test(v.password)) throw new Error('Use both letters and numbers.');
      return W.sb.auth.updateUser({ password: v.password }).then(function (r) {
        if (r.error) throw W.friendlyError(r.error);
        form.reset();
        W.toast('Password updated.');
      });
    });
  };
})();
