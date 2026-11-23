/* WAVE Portal connections: link a client's Instagram, Facebook, Google Business Profile and Google Ads
   accounts so their monthly numbers fill in automatically. */
(function () {
  'use strict';
  var W = window.W, html = W.html;

  var PROVIDERS = [
    { key: 'instagram', name: 'Instagram', fills: 'followers, accounts reached, interactions', cred: 'meta',
      idLabel: 'Instagram business account ID', idHint: 'Numbers only. In Meta Business Suite: Settings → Instagram accounts.', pattern: '[0-9]{5,30}' },
    { key: 'facebook', name: 'Facebook', fills: 'page followers', cred: 'meta',
      idLabel: 'Facebook Page ID', idHint: 'Numbers only. On the Page: About → Page transparency, or Meta Business Suite → Settings → Pages.', pattern: '[0-9]{5,30}' },
    { key: 'google_business', name: 'Google reviews', fills: 'rating and number of reviews', cred: 'google_business',
      idLabel: 'Google Business Profile location', idHint: 'Looks like accounts/123…/locations/456… (WAVE\'s setup guide shows how to find it).', pattern: 'accounts/[0-9]+/locations/[0-9]+' },
    { key: 'google_ads', name: 'Google Ads', fills: 'spend, impressions, clicks, leads', cred: 'google_ads',
      idLabel: 'Google Ads customer ID', idHint: 'The 10-digit ID at the top of their Google Ads account, e.g. 123-456-7890.', pattern: '[0-9]{3}-?[0-9]{3}-?[0-9]{4}' }
  ];
  var STATUS = { not_synced: ['Not synced yet', 'muted'], ok: ['Working', 'green'], error: ['Problem', 'red'] };

  W.addClientTab('connections', 'Connections', function (c, el) {
    W.mount(el, html`<p class="muted">Loading…</p>`);
    return Promise.all([
      W.q(W.sb.from('integrations').select('*').eq('client_id', c.id)),
      W.fn('sync-integrations', { action: 'status' }).catch(function () { return {}; })
    ]).then(function (res) {
      var rows = res[0], creds = res[1] || {};
      var byKey = {};
      rows.forEach(function (r) { byKey[r.provider] = r; });
      var missing = PROVIDERS.filter(function (p) { return byKey[p.key] && !creds[p.cred]; });
      W.mount(el, html`<div style="display:grid;gap:22px">
        <div class="notice">Connect ${c.business_name}'s accounts and their monthly numbers fill in automatically on the 1st of each month (marked "auto" in Monthly stats). Anything not connected can still be typed in by hand.</div>
        ${missing.length ? html`<div class="notice warn">WAVE's ${[].concat.apply([], missing.map(function (p) { return p.cred === 'meta' ? ['Meta'] : (p.cred === 'google_ads' ? ['Google Ads'] : ['Google Business Profile']); })).filter(function (v, i, a) { return a.indexOf(v) === i; }).join(' and ')} access isn't set up yet, so these won't sync until it is. The setup guide (docs/PORTAL-SETUP.md) walks through it.</div>` : ''}
        <div class="grid-2">${PROVIDERS.map(function (p) {
          var r = byKey[p.key];
          var st = r ? STATUS[r.status] : null;
          return html`<form class="card" data-provider="${p.key}" novalidate><div class="card-head"><div><h2>${p.name}</h2><p>Fills in ${p.fills}.</p></div>${st ? W.pill(st[0], st[1]) : W.pill('Not connected', 'muted')}</div>
            <div style="display:grid;gap:14px">
              <label class="field"><span>${p.idLabel} <span class="hint">${p.idHint}</span></span><input type="text" name="external_id" value="${r ? r.external_id : ''}" pattern="${p.pattern}" maxlength="200" required></label>
              <label class="field"><span>Name <span class="hint">Optional, for your reference</span></span><input type="text" name="account_label" value="${r ? r.account_label : ''}" maxlength="200" placeholder="@ensonosato"></label>
              ${r && r.last_synced_at ? html`<p class="cell-sub">Last synced ${W.dateTime(r.last_synced_at)}</p>` : ''}
              ${r && r.last_error ? html`<div class="notice err" style="font-size:13.5px">${r.last_error}</div>` : ''}
              ${!creds[p.cred] ? html`<p class="cell-sub">WAVE's ${p.cred === 'meta' ? 'Meta' : (p.cred === 'google_ads' ? 'Google Ads' : 'Google Business Profile')} access isn't set up yet.</p>` : ''}
            </div>
            <p class="form-error" role="alert"></p>
            <div class="form-actions">${r ? html`<button type="button" class="btn small danger" data-remove="${r.id}" style="margin-right:auto">Disconnect</button>` : ''}
              <button class="btn small${r ? '' : ' primary'}" type="submit">${r ? 'Save' : 'Connect'}</button></div></form>`;
        })}</div>
        ${rows.length ? html`<div class="card"><div class="card-head"><div><h2>Sync now</h2><p>Pull a month's numbers from every connected account.</p></div></div>
          <div class="filters"><label class="field"><span>Month</span><input type="month" data-sync-month value="${W.lastMonth().slice(0, 7)}" max="${W.isoDay().slice(0, 7)}"></label>
          <button type="button" class="btn primary" data-sync>Sync ${c.business_name}</button></div></div>` : ''}
      </div>`);

      W.$$('form[data-provider]', el).forEach(function (form) {
        var key = form.getAttribute('data-provider');
        W.onSubmit(form, function (v) {
          var id = v.external_id.trim();
          if (key === 'google_ads') id = id.replace(/-/g, '');
          var row = { client_id: c.id, provider: key, external_id: id, account_label: v.account_label || '', status: 'not_synced', last_error: '' };
          return W.q(W.sb.from('integrations').upsert(row, { onConflict: 'client_id,provider' })).then(function () { W.toast('Saved.'); W.render(); });
        });
      });
      el.addEventListener('click', function (e) {
        var rm = e.target.closest('[data-remove]');
        if (rm) {
          W.q(W.sb.from('integrations').delete().eq('id', rm.getAttribute('data-remove'))).then(function () { W.toast('Disconnected. Numbers already synced stay.'); W.render(); }, function (err) { W.toast(err.message, true); });
          return;
        }
        var sync = e.target.closest('[data-sync]');
        if (sync) {
          sync.disabled = true; sync.textContent = 'Syncing…';
          var month = el.querySelector('[data-sync-month]').value;
          W.fn('sync-integrations', { action: 'sync_client', client_id: c.id, month: month }).then(function (r) {
            var res2 = (r.results && r.results[c.id]) || {};
            var ok = Object.keys(res2).filter(function (k) { return res2[k] && res2[k].ok; }).length;
            var bad = Object.keys(res2).length - ok;
            W.toast(bad ? ok + ' synced, ' + bad + ' had a problem (see below).' : 'Synced ' + ok + ' account' + (ok === 1 ? '' : 's') + '.', !!bad);
            W.render();
          }, function (err) { W.toast(err.message, true); sync.disabled = false; sync.textContent = 'Sync ' + c.business_name; });
        }
      });
    });
  }, 38);
})();
