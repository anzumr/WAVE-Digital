/* WAVE Portal stats: website analytics, monthly social/ads/review numbers, monthly summaries. */
(function () {
  'use strict';
  var W = window.W, html = W.html;

  // Keep in step with supabase/functions/_shared/metrics.ts
  W.METRICS = [
    ['social.instagram.followers', 'Instagram', 'Followers', 'count', 'up'],
    ['social.instagram.reach', 'Instagram', 'Accounts reached', 'count', 'up'],
    ['social.instagram.engagement', 'Instagram', 'Interactions', 'count', 'up'],
    ['social.facebook.followers', 'Facebook', 'Followers', 'count', 'up'],
    ['social.facebook.reach', 'Facebook', 'Reach', 'count', 'up'],
    ['social.facebook.engagement', 'Facebook', 'Interactions', 'count', 'up'],
    ['social.tiktok.followers', 'TikTok', 'Followers', 'count', 'up'],
    ['social.tiktok.views', 'TikTok', 'Video views', 'count', 'up'],
    ['ads.spend', 'Advertising', 'Ad spend', 'money', 'neutral'],
    ['ads.impressions', 'Advertising', 'Impressions', 'count', 'up'],
    ['ads.clicks', 'Advertising', 'Clicks', 'count', 'up'],
    ['ads.leads', 'Advertising', 'Leads', 'count', 'up'],
    ['reviews.google.rating', 'Google reviews', 'Rating', 'rating', 'up'],
    ['reviews.google.count', 'Google reviews', 'Reviews', 'count', 'up']
  ].map(function (m) { return { key: m[0], group: m[1], label: m[2], kind: m[3], good: m[4] }; });
  var GROUPS = ['Instagram', 'Facebook', 'TikTok', 'Advertising', 'Google reviews'];
  W.fmtMetric = function (kind, v) {
    if (v == null || isNaN(v)) return '–';
    if (kind === 'money') return W.money(v);
    if (kind === 'rating') return Number(v).toFixed(1) + ' ★';
    return W.num(v);
  };
  function firstOfMonth(d) { return W.isoDay(new Date(d.getFullYear(), d.getMonth(), 1)); }
  W.lastMonth = function () { var d = new Date(); return firstOfMonth(new Date(d.getFullYear(), d.getMonth() - 1, 1)); };
  function daysAgo(n) { var d = new Date(); d.setDate(d.getDate() - n); return W.isoDay(d); }

  function sumBy(rows, key) { return rows.reduce(function (s, r) { return s + (r[key] || 0); }, 0); }
  function aggregate(rows) {
    var out = {};
    rows.forEach(function (r) { out[r.label] = (out[r.label] || 0) + r.pageviews; });
    return Object.keys(out).map(function (k) { return { label: k, value: out[k] }; }).sort(function (a, b) { return b.value - a.value; });
  }
  function fillDays(rows, from, days) {
    var by = {};
    rows.forEach(function (r) { by[r.day] = r.visits; });
    var out = [], d = new Date(from + 'T12:00:00');
    for (var i = 0; i < days; i++) { var k = W.isoDay(d); out.push({ x: k, y: by[k] || 0 }); d.setDate(d.getDate() + 1); }
    return out;
  }

  // ---------- the stats view (client page and admin tab) ----------
  W.renderStats = function (clientId, el, opts) {
    opts = opts || {};
    var range = opts.range || 30;
    var start = daysAgo(range - 1), prevStart = daysAgo(range * 2 - 1);
    W.mount(el, html`<p class="muted">Loading stats…</p>`);
    return Promise.all([
      W.q(W.sb.from('site_stats_daily').select('day, visits, pageviews').eq('client_id', clientId).gte('day', prevStart).order('day')),
      W.q(W.sb.from('site_stats_dims').select('dim, label, pageviews').eq('client_id', clientId).gte('day', start)),
      W.q(W.sb.from('monthly_metrics').select('month, metric, value').eq('client_id', clientId).order('month', { ascending: false }).limit(500)),
      W.q(W.sb.from('monthly_summaries').select('id, month, status, pdf_path, sent_at').eq('client_id', clientId).eq('status', 'sent').order('month', { ascending: false }))
    ]).then(function (res) {
      var all = res[0], dims = res[1], metrics = res[2], summaries = res[3];
      var cur = all.filter(function (r) { return r.day >= start; }), prev = all.filter(function (r) { return r.day < start; });
      var points = fillDays(cur, start, range);
      var byDim = function (d) { return aggregate(dims.filter(function (r) { return r.dim === d; })); };

      // monthly numbers: latest month with data, and the month before it
      var months = [];
      metrics.forEach(function (m) { if (months.indexOf(m.month) < 0) months.push(m.month); });
      months.sort().reverse();
      var val = function (month, key) {
        var r = metrics.filter(function (m) { return m.month === month && m.metric === key; })[0];
        return r ? Number(r.value) : null;
      };
      var latest = months[0], before = months[1];

      var website = cur.length || prev.length ? html`
        <div class="tiles">
          ${W.statTile('Visitors', W.num(sumBy(cur, 'visits')), sumBy(cur, 'visits'), prev.length ? sumBy(prev, 'visits') : null, 'up', 'vs previous ' + range + ' days')}
          ${W.statTile('Page views', W.num(sumBy(cur, 'pageviews')), sumBy(cur, 'pageviews'), prev.length ? sumBy(prev, 'pageviews') : null, 'up', 'vs previous ' + range + ' days')}
          ${W.statTile('Pages per visit', sumBy(cur, 'visits') ? (sumBy(cur, 'pageviews') / sumBy(cur, 'visits')).toFixed(1) : '–')}
        </div>
        <div class="card"><div class="card-head"><div><h2>Visitors per day</h2><p>Last ${range} days</p></div></div>
          <div data-chart></div>${W.chartTable(points, 'Visitors')}</div>
        <div class="grid-2">
          <div class="card"><h2 style="margin-bottom:14px">Most visited pages</h2>${W.rankedBars(byDim('page').slice(0, 8), { empty: 'No page data yet.' })}</div>
          <div class="card"><h2 style="margin-bottom:14px">Where visitors come from</h2>${W.rankedBars(byDim('referrer').slice(0, 8), { empty: 'No source data yet.' })}</div>
          <div class="card"><h2 style="margin-bottom:14px">Devices</h2>${W.segmentedBar(byDim('device').map(function (d) { return { label: d.label.charAt(0).toUpperCase() + d.label.slice(1), value: d.value }; }), 'Devices')}</div>
          <div class="card"><h2 style="margin-bottom:14px">Countries</h2>${W.rankedBars(byDim('country').slice(0, 6), { empty: 'No country data yet.' })}</div>
        </div>`
        : html`<div class="card">${W.empty('Website stats are on their way', opts.admin
          ? 'Add this client\'s Cloudflare site tag above, then sync. Stats update every night.'
          : 'Once your website is connected to WAVE\'s analytics, visitors and pages show up here. They update every night.')}</div>`;

      var groupsWithData = GROUPS.filter(function (g) { return W.METRICS.some(function (m) { return m.group === g && val(latest, m.key) != null; }); });
      var monthly = latest ? html`
        <p class="muted">${W.monthLabel(latest)}${before ? ', compared with ' + W.monthLabel(before) : ''}.</p>
        ${groupsWithData.map(function (g) {
          var defs = W.METRICS.filter(function (m) { return m.group === g && val(latest, m.key) != null; });
          var tiles = defs.map(function (m) { return W.statTile(m.label, W.fmtMetric(m.kind, val(latest, m.key)), val(latest, m.key), m.kind === 'rating' ? null : val(before, m.key), m.good, 'vs ' + (before ? W.monthLabel(before).split(' ')[0] : 'last month')); });
          if (g === 'Advertising' && val(latest, 'ads.spend') != null && val(latest, 'ads.leads')) {
            var cpl = val(latest, 'ads.spend') / val(latest, 'ads.leads');
            var prevCpl = val(before, 'ads.spend') != null && val(before, 'ads.leads') ? val(before, 'ads.spend') / val(before, 'ads.leads') : null;
            tiles.push(W.statTile('Cost per lead', W.money(Math.round(cpl * 100) / 100), cpl, prevCpl, 'down', 'vs ' + (before ? W.monthLabel(before).split(' ')[0] : 'last month')));
          }
          return html`<h3 style="margin:6px 0 -6px">${g}</h3><div class="tiles">${tiles}</div>`;
        })}
        ${months.length > 1 ? html`<details class="card table-view"><summary>History by month</summary><div class="table-wrap"><table class="data"><thead><tr><th>Month</th>
          ${W.METRICS.filter(function (m) { return months.some(function (mo) { return val(mo, m.key) != null; }); }).map(function (m) { return html`<th class="num">${m.group === 'Advertising' || m.group === 'Google reviews' ? m.label : m.group + ' ' + m.label.toLowerCase()}</th>`; })}
          </tr></thead><tbody>${months.slice(0, 12).map(function (mo) {
            return html`<tr><td>${W.monthLabel(mo)}</td>${W.METRICS.filter(function (m) { return months.some(function (x) { return val(x, m.key) != null; }); }).map(function (m) { return html`<td class="num">${W.fmtMetric(m.kind, val(mo, m.key))}</td>`; })}</tr>`;
          })}</tbody></table></div></details>` : ''}`
        : html`<div class="card">${W.empty('No social, ads or review numbers yet', opts.admin ? 'Enter this month\'s numbers in Monthly stats.' : 'WAVE adds these every month.')}</div>`;

      W.mount(el, html`<div style="display:grid;gap:22px">
        <div class="filters"><label class="field"><span>Website period</span><select data-range>${W.options([[30, 'Last 30 days'], [90, 'Last 90 days']], range)}</select></label></div>
        <div class="section-title"><h2>Website</h2></div>${website}
        <div class="section-title"><h2>Social media, ads and reviews</h2>${opts.admin ? html`<a class="btn small" href="#/admin/stats?client=${clientId}">Enter numbers</a>` : ''}</div>${monthly}
        <div class="section-title"><h2>Monthly summaries</h2></div>
        <div class="card">${summaries.length ? html`<div class="list">${summaries.map(function (s) {
          return html`<div class="list-item"><div style="color:var(--muted)">${W.icon('doc')}</div><div class="grow"><div class="cell-title">${W.monthLabel(s.month)}</div><div class="cell-sub">Sent ${W.date(s.sent_at)}</div></div>
            <button type="button" class="btn small" data-open-file="${s.pdf_path}" data-name="WAVE-summary-${s.month.slice(0, 7)}.pdf">${W.icon('download')}PDF</button></div>`;
        })}</div>` : W.empty('No summaries yet', 'A summary arrives by email at the start of each month.')}</div>
      </div>`);
      var chartBox = el.querySelector('[data-chart]');
      if (chartBox) W.lineChart(chartBox, points, { label: 'Visitors per day', unit: 'visitors' });
      W.wireFileButtons(el);
      el.querySelector('[data-range]').addEventListener('change', function (e) {
        W.renderStats(clientId, el, Object.assign({}, opts, { range: Number(e.target.value) }));
      });
    });
  };

  W.clientRoute('/stats', function (c) {
    var page = W.page(html`${W.head('Stats', 'How your website, social media and ads are doing.')}<div data-stats></div>`);
    return W.renderStats(c.id, page.querySelector('[data-stats]'), {});
  });

  // A quick look on the client's home page; hidden until there is something to show.
  W.addHomeSection(5, function (client, slot) {
    var start = daysAgo(29);
    return Promise.all([
      W.q(W.sb.from('site_stats_daily').select('visits').eq('client_id', client.id).gte('day', start)),
      W.q(W.sb.from('monthly_metrics').select('month, metric, value').eq('client_id', client.id).order('month', { ascending: false }).limit(60))
    ]).then(function (res) {
      var days = res[0], m = res[1];
      var latest = m.length ? m[0].month : null;
      var v = function (k) { var r = m.filter(function (x) { return x.month === latest && x.metric === k; })[0]; return r ? Number(r.value) : null; };
      var followers = ['social.instagram.followers', 'social.facebook.followers', 'social.tiktok.followers'].map(v).filter(function (x) { return x != null; });
      var tiles = [];
      if (days.length) tiles.push(html`<a class="tile" href="#/stats"><div class="label">Website visitors</div><div class="value">${W.num(sumBy(days, 'visits'))}</div><div class="sub">last 30 days</div></a>`);
      if (followers.length) tiles.push(html`<a class="tile" href="#/stats"><div class="label">Social followers</div><div class="value">${W.num(followers.reduce(function (a, b) { return a + b; }, 0))}</div><div class="sub">${W.monthLabel(latest)}</div></a>`);
      if (v('ads.leads') != null) tiles.push(html`<a class="tile" href="#/stats"><div class="label">Leads from ads</div><div class="value">${W.num(v('ads.leads'))}</div><div class="sub">${W.monthLabel(latest)}</div></a>`);
      if (v('reviews.google.rating') != null) tiles.push(html`<a class="tile" href="#/stats"><div class="label">Google rating</div><div class="value">${Number(v('reviews.google.rating')).toFixed(1)} ★</div><div class="sub">${v('reviews.google.count') != null ? W.num(v('reviews.google.count')) + ' reviews' : ''}</div></a>`);
      if (tiles.length) W.mount(slot, html`<div class="tiles">${tiles}</div>`);
    });
  });

  // ---------- admin: client stats tab ----------
  W.addClientTab('stats', 'Stats', function (c, el) {
    W.mount(el, html`<div style="display:grid;gap:22px">
      <form class="card" data-cf novalidate><div class="card-head"><div><h2>Website analytics</h2><p>The Cloudflare Web Analytics site tag for ${c.website_url || 'their website'}.</p></div></div>
        <div class="filters"><label class="field" style="flex:1;min-width:260px"><span>Site tag <span class="hint">32 letters and numbers, from Cloudflare → Web Analytics → the site → Manage site</span></span>
          <input type="text" name="cloudflare_site_tag" value="${c.private.cloudflare_site_tag || ''}" maxlength="100" pattern="[A-Fa-f0-9]{32}" placeholder="e.g. 3f2a…"></label>
          <button class="btn" type="submit">Save</button><button type="button" class="btn primary" data-sync>Sync now</button></div>
        <p class="form-error" role="alert"></p></form>
      <div data-stats></div></div>`);
    W.onSubmit(el.querySelector('[data-cf]'), function (v) {
      return W.q(W.sb.from('client_private').update({ cloudflare_site_tag: (v.cloudflare_site_tag || '').toLowerCase() }).eq('client_id', c.id))
        .then(function () { c.private.cloudflare_site_tag = v.cloudflare_site_tag; W.toast('Saved. Click "Sync now" to pull the last 90 days.'); });
    });
    el.querySelector('[data-sync]').addEventListener('click', function (e) {
      var b = e.currentTarget; b.disabled = true; b.textContent = 'Syncing…';
      W.fn('sync-site-stats', { action: 'sync_client', client_id: c.id }).then(function (r) {
        var x = r.results && r.results[c.id];
        W.toast('Synced ' + ((x && x.days) || 0) + ' days of website stats.');
        W.renderStats(c.id, el.querySelector('[data-stats]'), { admin: true });
      }, function (err) { W.toast(err.message, true); }).then(function () { b.disabled = false; b.textContent = 'Sync now'; });
    });
    return W.renderStats(c.id, el.querySelector('[data-stats]'), { admin: true });
  }, 35);

  // ---------- admin: monthly numbers ----------
  W.route('/admin/stats', 'admin', function (_, query) {
    W.loading();
    var month = /^\d{4}-\d{2}$/.test(query.month || '') ? query.month + '-01' : W.lastMonth();
    return Promise.all([
      W.q(W.sb.from('clients').select('id, business_name, status').neq('status', 'cancelled').order('business_name')),
      W.q(W.sb.from('monthly_metrics').select('client_id, metric, value, source').eq('month', month))
    ]).then(function (res) {
      var clients = res[0], rows = res[1];
      var clientId = query.client && clients.some(function (c) { return c.id === query.client; }) ? query.client : (clients[0] && clients[0].id);
      var mine = rows.filter(function (r) { return r.client_id === clientId; });
      var v = function (k) { var r = mine.filter(function (x) { return x.metric === k; })[0]; return r ? r.value : ''; };
      var auto = function (k) { var r = mine.filter(function (x) { return x.metric === k; })[0]; return r && r.source === 'auto'; };
      var counts = {};
      rows.forEach(function (r) { counts[r.client_id] = (counts[r.client_id] || 0) + 1; });
      var el = W.page(html`
        ${W.head('Monthly stats', 'Enter each client\'s social media, ads and review numbers once a month. Clients see them on their Stats page and in their summary.')}
        <div class="filters">
          <label class="field"><span>Month</span><input type="month" data-month value="${month.slice(0, 7)}" max="${W.isoDay().slice(0, 7)}"></label>
          <label class="field" style="min-width:240px"><span>Client</span><select data-client>${W.options(clients.map(function (c) { return [c.id, c.business_name + (counts[c.id] ? ' ✓' : '')]; }), clientId)}</select></label>
        </div>
        ${clientId ? html`<form class="card" novalidate><div class="card-head"><div><h2>${W.monthLabel(month)}</h2><p>Leave a box empty if it doesn't apply. Numbers marked "auto" come from a connected account.</p></div></div>
          <div style="display:grid;gap:16px">${GROUPS.map(function (g) {
            return html`<div class="metric-group"><h3>${g}</h3><div class="metric-grid">${W.METRICS.filter(function (m) { return m.group === g; }).map(function (m) {
              return html`<label class="field"><span>${m.label}${auto(m.key) ? html` <span class="hint">auto</span>` : ''}</span>
                <input type="number" name="${m.key}" value="${v(m.key)}" min="0" step="${m.kind === 'count' ? '1' : (m.kind === 'rating' ? '0.1' : '0.01')}"${m.kind === 'rating' ? W.raw(' max="5"') : ''} inputmode="decimal"></label>`;
            })}</div></div>`;
          })}</div>
          <p class="form-error" role="alert"></p><div class="form-actions"><button class="btn primary" type="submit">Save numbers</button></div></form>`
        : W.empty('No clients yet', 'Add a client first.')}`);
      var go = function (cid, mo) { W.go('/admin/stats?month=' + mo + '&client=' + cid); };
      el.querySelector('[data-month]').addEventListener('change', function (e) { if (e.target.value) go(clientId, e.target.value); });
      el.querySelector('[data-client]').addEventListener('change', function (e) { go(e.target.value, month.slice(0, 7)); });
      var form = el.querySelector('form');
      if (form) W.onSubmit(form, function (vals) {
        var upserts = [], removes = [];
        W.METRICS.forEach(function (m) {
          var raw = vals[m.key];
          if (raw === '' || raw == null) { if (v(m.key) !== '') removes.push(m.key); return; }
          var n = Number(raw);
          if (isNaN(n) || n < 0) throw new Error(m.group + ' ' + m.label.toLowerCase() + ' must be a positive number.');
          if (m.kind === 'rating' && n > 5) throw new Error('A Google rating is between 0 and 5.');
          // An unchanged synced number stays "auto" so the next sync can keep it up to date.
          if (auto(m.key) && Number(v(m.key)) === n) return;
          upserts.push({ client_id: clientId, month: month, metric: m.key, value: n, source: 'manual' });
        });
        return Promise.resolve()
          .then(function () { return upserts.length ? W.q(W.sb.from('monthly_metrics').upsert(upserts)) : null; })
          .then(function () { return removes.length ? W.q(W.sb.from('monthly_metrics').delete().eq('client_id', clientId).eq('month', month).in('metric', removes)) : null; })
          .then(function () { W.toast('Saved ' + upserts.length + ' number' + (upserts.length === 1 ? '' : 's') + ' for ' + W.monthLabel(month) + '.'); W.render(); });
      });
    });
  });

  // ---------- admin: monthly summaries ----------
  W.route('/admin/summaries', 'admin', function (_, query) {
    W.loading();
    var month = /^\d{4}-\d{2}$/.test(query.month || '') ? query.month + '-01' : W.lastMonth();
    return Promise.all([
      W.q(W.sb.from('clients').select('id, business_name, status').eq('status', 'active').order('business_name')),
      W.q(W.sb.from('monthly_summaries').select('*').eq('month', month)),
      W.q(W.sb.from('admin_settings').select('summary_send_delay_days').single())
    ]).then(function (res) {
      var clients = res[0], sums = res[1], delay = res[2].summary_send_delay_days;
      var byClient = {};
      sums.forEach(function (s) { byClient[s.client_id] = s; });
      var el = W.page(html`
        ${W.head('Monthly summaries', 'A PDF summary is drafted for every active client on the 1st and emailed ' + (delay ? delay + ' day' + (delay === 1 ? '' : 's') + ' later' : 'the same day') + '. Add a note or send early here.')}
        <div class="filters"><label class="field"><span>Month</span><input type="month" data-month value="${month.slice(0, 7)}" max="${W.isoDay().slice(0, 7)}"></label>
          <button type="button" class="btn" data-gen-all>Make drafts for every active client</button></div>
        <div class="card">${clients.length ? html`<div class="table-wrap"><table class="data stack"><thead><tr><th>Client</th><th>Summary</th><th class="hide-sm">Note</th><th></th></tr></thead><tbody>
          ${clients.map(function (c) {
            var s = byClient[c.id];
            var state = !s ? html`<span class="faint">Not made yet</span>`
              : s.status === 'sent' ? html`${W.pill('Sent', 'green')} <span class="cell-sub">${W.date(s.sent_at)}</span>`
              : s.status === 'skipped' ? W.pill('Skipped', 'muted')
              : html`${W.pill('Draft', 'amber')} <span class="cell-sub">sends ${W.dateTime(s.send_after)}</span>`;
            return html`<tr><td><span class="cell-title">${c.business_name}</span>${s && s.last_error ? html`<div class="cell-sub" style="color:#ffb4ac">${s.last_error}</div>` : ''}</td>
              <td>${state}</td><td class="hide-sm">${s && s.admin_note ? html`<span class="cell-sub">${s.admin_note.slice(0, 60)}${s.admin_note.length > 60 ? '…' : ''}</span>` : html`<span class="faint">–</span>`}</td>
              <td><div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">
                ${s ? html`<button type="button" class="btn small" data-open-file="${s.pdf_path}" data-name="${c.business_name}-${month.slice(0, 7)}.pdf">Preview</button>` : ''}
                ${s && s.status !== 'sent' ? html`<button type="button" class="btn small" data-note="${s.id}">Note</button>
                  <button type="button" class="btn small primary" data-send="${s.id}">Send now</button>
                  <button type="button" class="btn small" data-skip="${s.id}" data-status="${s.status}">${s.status === 'skipped' ? 'Unskip' : 'Skip'}</button>` : ''}
                ${!s ? html`<button type="button" class="btn small" data-gen="${c.id}">Make draft</button>` : ''}</div></td></tr>`;
          })}</tbody></table></div>` : W.empty('No active clients', '')}</div>`);
      W.wireFileButtons(el);
      el.querySelector('[data-month]').addEventListener('change', function (e) { if (e.target.value) W.go('/admin/summaries?month=' + e.target.value); });
      var busy = function (b, label) { b.disabled = true; b.textContent = label; };
      el.querySelector('[data-gen-all]').addEventListener('click', function (e) {
        busy(e.currentTarget, 'Making drafts…');
        W.fn('monthly-summary', { action: 'generate_all', month: month }).then(function () { W.toast('Drafts are ready.'); W.render(); }, function (err) { W.toast(err.message, true); W.render(); });
      });
      el.addEventListener('click', function (e) {
        var b = e.target.closest('[data-gen],[data-send],[data-note],[data-skip]');
        if (!b) return;
        if (b.hasAttribute('data-gen')) {
          busy(b, 'Making…');
          W.fn('monthly-summary', { action: 'generate', client_id: b.getAttribute('data-gen'), month: month }).then(function () { W.toast('Draft ready.'); W.render(); }, function (err) { W.toast(err.message, true); W.render(); });
        } else if (b.hasAttribute('data-send')) {
          busy(b, 'Sending…');
          W.fn('monthly-summary', { action: 'send', summary_id: b.getAttribute('data-send') }).then(function (r) {
            W.toast(r.sent ? 'Summary emailed.' : (r.reason || 'Not sent.'), !r.sent); W.render();
          }, function (err) { W.toast(err.message, true); W.render(); });
        } else if (b.hasAttribute('data-skip')) {
          W.q(W.sb.from('monthly_summaries').update({ status: b.getAttribute('data-status') === 'skipped' ? 'draft' : 'skipped' }).eq('id', b.getAttribute('data-skip')))
            .then(function () { W.render(); }, function (err) { W.toast(err.message, true); });
        } else {
          var s = sums.filter(function (x) { return x.id === b.getAttribute('data-note'); })[0];
          W.modal('Note for ' + W.monthLabel(month), html`<form novalidate><label class="field"><span>Shown at the end of the summary and in the email</span>
            <textarea name="admin_note" maxlength="4000" style="min-height:160px" placeholder="Great month! Your new menu page brought in…">${s.admin_note}</textarea></label>
            <p class="form-error" role="alert"></p><div class="form-actions"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary" type="submit" data-busy="Saving…">Save and update PDF</button></div></form>`,
          function (d, close) {
            W.onSubmit(d.querySelector('form'), function (vals) {
              return W.q(W.sb.from('monthly_summaries').update({ admin_note: vals.admin_note || '' }).eq('id', s.id))
                .then(function () { return W.fn('monthly-summary', { action: 'generate', client_id: s.client_id, month: month }); })
                .then(function () { close(); W.toast('Note saved and PDF updated.'); W.render(); });
            });
          });
        }
      });
    });
  });

  W.storageSources.push(function (clientId) {
    return W.q(W.sb.from('monthly_summaries').select('pdf_path').eq('client_id', clientId)).then(function (rows) {
      return rows.map(function (r) { return r.pdf_path; });
    });
  });
})();
