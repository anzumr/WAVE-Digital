/* WAVE Portal meetings: Calendly booking for clients, meeting log for WAVE. */
(function () {
  'use strict';
  var W = window.W, html = W.html;

  function meetingState(m) {
    if (m.status === 'cancelled') return ['Cancelled', 'muted'];
    if (m.status === 'completed') return ['Completed', 'green'];
    if (m.starts_at && new Date(m.starts_at).getTime() + m.duration_min * 60000 < Date.now()) return ['Past', 'muted'];
    return ['Upcoming', 'cyan'];
  }
  function isUpcoming(m) { return meetingState(m)[0] === 'Upcoming'; }
  function when(m) {
    if (!m.starts_at) return 'Time in your Calendly confirmation email';
    var d = new Date(m.starts_at);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) + ' · ' +
      d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) + ' (' + m.duration_min + ' min)';
  }
  function sortMeetings(rows) {
    var up = rows.filter(isUpcoming).sort(function (a, b) { return String(a.starts_at || '9').localeCompare(String(b.starts_at || '9')); });
    var rest = rows.filter(function (m) { return !isUpcoming(m); }).sort(function (a, b) { return String(b.starts_at || '').localeCompare(String(a.starts_at || '')); });
    return up.concat(rest);
  }
  W.meetingList = function (rows, admin) {
    if (!rows.length) return W.empty('No meetings yet', admin ? 'Log a call, or sync bookings from Calendly.' : 'Book a call with WAVE whenever you like.');
    return html`<div class="list">${sortMeetings(rows).map(function (m) {
      var s = meetingState(m);
      return html`<div class="list-item" style="align-items:flex-start"><div style="color:var(--muted);padding-top:2px">${W.icon('calendar')}</div>
        <div class="grow"><div class="cell-title">${m.topic || 'Meeting with WAVE Digital'}</div>
          <div class="cell-sub">${when(m)}</div>
          ${m.meeting_url && isUpcoming(m) ? html`<div style="margin-top:8px"><a class="btn small" href="${m.meeting_url}" target="_blank" rel="noopener noreferrer">${W.icon('link')}Join the call</a></div>` : ''}
          ${m.notes ? html`<div class="tl-body muted" style="font-size:14px">${m.notes}</div>` : ''}</div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px">${W.pill(s[0], s[1])}
          ${admin ? html`<button type="button" class="btn small" data-edit-meeting="${m.id}">Edit</button>` : ''}</div></div>`;
    })}</div>`;
  };

  // ---------- client: book and list ----------
  function calendlySrc() {
    var base = W.state.settings.calendly_url || 'https://calendly.com/anzum2225/wave';
    var url;
    try { url = new URL(base); } catch (e) { return null; }
    if (url.hostname !== 'calendly.com') return null;
    var p = W.state.profile || {};
    url.searchParams.set('embed_domain', location.host);
    url.searchParams.set('embed_type', 'Inline');
    url.searchParams.set('hide_gdpr_banner', '1');
    if (p.full_name) url.searchParams.set('name', p.full_name);
    if (p.email) url.searchParams.set('email', p.email);
    return url.toString();
  }

  var listening = false;
  W.clientRoute('/meetings', function (c) {
    W.loading();
    return W.q(W.sb.from('meetings').select('*').eq('client_id', c.id)).then(function (rows) {
      var src = calendlySrc();
      var el = W.page(html`
        ${W.head('Meetings', 'Book a call with WAVE. You\'ll get a confirmation email from Calendly with the meeting link.')}
        <div class="split">
          <div class="card" style="padding:0;overflow:hidden">
            ${src ? html`<iframe title="Book a meeting with WAVE Digital" src="${src}" style="display:block;width:100%;height:720px;border:0;background:#fff" loading="lazy"></iframe>`
              : html`<div style="padding:22px">${W.empty('Booking is not available right now', 'Email WAVE to set up a call.')}</div>`}
          </div>
          <div class="card"><div class="card-head"><h2>Your meetings</h2></div><div data-list>${W.meetingList(rows, false)}</div></div>
        </div>`);
      if (!listening) {
        listening = true;
        // Calendly tells the page when a booking is made; record it under the business.
        window.addEventListener('message', function (e) {
          if (e.origin !== 'https://calendly.com' || !e.data || e.data.event !== 'calendly.event_scheduled') return;
          var payload = e.data.payload || {};
          var client = W.currentClient();
          if (!client || !payload.event || !payload.event.uri) return;
          W.fn('meetings', { action: 'booked', client_id: client.id, event_uri: payload.event.uri, invitee_uri: payload.invitee && payload.invitee.uri })
            .then(function () {
              W.toast('Meeting booked. Check your email for the details.');
              return W.q(W.sb.from('meetings').select('*').eq('client_id', client.id));
            })
            .then(function (fresh) { var box = document.querySelector('[data-list]'); if (box && fresh) W.mount(box, W.meetingList(fresh, false)); })
            .catch(function (err) { W.toast('Your booking is confirmed by Calendly, but the portal could not record it: ' + err.message, true); });
        });
      }
      return el;
    });
  });

  W.addHomeSection(20, function (client, slot) {
    return W.q(W.sb.from('meetings').select('*').eq('client_id', client.id).eq('status', 'scheduled').order('starts_at', { ascending: true })).then(function (rows) {
      var next = rows.filter(isUpcoming)[0];
      W.mount(slot, html`<div class="card"><div class="card-head"><h2>Next meeting</h2><a class="btn small" href="#/meetings">Meetings</a></div>
        ${next ? html`<div class="cell-title">${next.topic || 'Meeting with WAVE Digital'}</div><div class="cell-sub" style="margin-top:4px">${when(next)}</div>
          ${next.meeting_url ? html`<div style="margin-top:12px"><a class="btn small" href="${next.meeting_url}" target="_blank" rel="noopener noreferrer">${W.icon('link')}Join the call</a></div>` : ''}`
          : html`<p class="muted">Nothing booked. <a href="#/meetings">Book a call</a> whenever you want to talk.</p>`}</div>`);
    });
  });

  // ---------- admin: meeting log per client ----------
  function pad(n) { return String(n).padStart(2, '0'); }
  function meetingDialog(client, m, done) {
    m = m || {};
    var d = m.starts_at ? new Date(m.starts_at) : null;
    W.modal(m.id ? 'Edit meeting' : 'Log a meeting', html`<form novalidate><div class="form-grid">
        <label class="field wide"><span>Topic</span><input type="text" name="topic" maxlength="200" value="${m.topic || ''}" required placeholder="Monthly check-in"></label>
        <label class="field"><span>Date</span><input type="date" name="date" value="${d ? W.isoDay(d) : ''}" required></label>
        <label class="field"><span>Time</span><input type="time" name="time" value="${d ? pad(d.getHours()) + ':' + pad(d.getMinutes()) : ''}" required></label>
        <label class="field"><span>Length</span><select name="duration_min">${W.options([[15, '15 min'], [30, '30 min'], [45, '45 min'], [60, '1 hour'], [90, '1.5 hours'], [120, '2 hours']], m.duration_min || 30)}</select></label>
        <label class="field"><span>Status</span><select name="status">${W.options([['scheduled', 'Scheduled'], ['completed', 'Completed'], ['cancelled', 'Cancelled']], m.status || 'scheduled')}</select></label>
        <label class="field wide"><span>Meeting link <span class="hint">Optional, e.g. Google Meet</span></span><input type="url" name="meeting_url" maxlength="500" value="${m.meeting_url || ''}" placeholder="https://meet.google.com/…"></label>
        <label class="field wide"><span>Notes <span class="hint">The client can see these</span></span><textarea name="notes" maxlength="10000">${m.notes || ''}</textarea></label>
      </div><p class="form-error" role="alert"></p>
      <div class="form-actions">${m.id ? html`<button type="button" class="btn danger" data-del style="margin-right:auto">Delete</button>` : ''}
        <button type="button" class="btn" data-close>Cancel</button><button class="btn primary" type="submit">Save</button></div></form>`,
    function (dlg, close) {
      var form = dlg.querySelector('form');
      W.onSubmit(form, function (v) {
        var starts = new Date(v.date + 'T' + v.time);
        if (isNaN(starts)) throw new Error('Check the date and time.');
        var row = { client_id: client.id, topic: v.topic, starts_at: starts.toISOString(), duration_min: Number(v.duration_min),
          status: v.status, meeting_url: v.meeting_url || '', notes: v.notes || '' };
        var op = m.id ? W.sb.from('meetings').update(row).eq('id', m.id) : W.sb.from('meetings').insert(row);
        return W.q(op).then(function () { close(); W.toast('Meeting saved.'); done(); });
      });
      var del = dlg.querySelector('[data-del]');
      if (del) del.addEventListener('click', function () {
        W.q(W.sb.from('meetings').delete().eq('id', m.id)).then(function () { close(); W.toast('Meeting deleted.'); done(); }, function (e) { W.toast(e.message, true); });
      });
    });
  }

  W.addClientTab('meetings', 'Meetings', function (c, el) {
    return W.q(W.sb.from('meetings').select('*').eq('client_id', c.id)).then(function (rows) {
      W.mount(el, html`<div class="card"><div class="card-head"><div><h2>Meetings</h2><p>Bookings from the portal show up here automatically.</p></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn small" data-sync>Sync from Calendly</button><button type="button" class="btn small primary" data-add>${W.icon('plus')}Log a meeting</button></div></div>
        ${W.meetingList(rows, true)}</div>`);
      var refresh = function () { W.render(); };
      el.querySelector('[data-add]').addEventListener('click', function () { meetingDialog(c, null, refresh); });
      el.querySelector('[data-sync]').addEventListener('click', function (e) {
        var b = e.currentTarget; b.disabled = true; b.textContent = 'Syncing…';
        W.fn('meetings', { action: 'sync', client_id: c.id }).then(function (r) {
          W.toast('Calendly: ' + r.added + ' new, ' + r.updated + ' updated.'); refresh();
        }, function (err) { W.toast(err.message, true); b.disabled = false; b.textContent = 'Sync from Calendly'; });
      });
      el.addEventListener('click', function (e) {
        var b = e.target.closest('[data-edit-meeting]');
        if (!b) return;
        var m = rows.filter(function (r) { return r.id === b.getAttribute('data-edit-meeting'); })[0];
        if (m) meetingDialog(c, m, refresh);
      });
    });
  }, 40);
})();
