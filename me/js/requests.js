/* WAVE Portal requests: the request form, lists, and the request page (shared by admin and clients). */
(function () {
  'use strict';
  var W = window.W, html = W.html;

  W.REQ_TYPES = [['website', 'Website change'], ['social', 'Social media'], ['advertising', 'Advertising'],
    ['branding', 'Logo / branding'], ['broken', "Something's broken"], ['other', 'Other']];
  var STATUS = {
    new: ['New', 'cyan'], in_progress: ['In progress', 'blue'], waiting_on_client: ['Waiting on client', 'amber'],
    done: ['Done', 'green'], declined: ['Declined', 'muted']
  };
  W.OPEN_STATUSES = ['new', 'in_progress', 'waiting_on_client'];
  W.reqTypeLabel = function (t) { var f = W.REQ_TYPES.filter(function (x) { return x[0] === t; })[0]; return f ? f[1] : t; };
  W.reqStatusLabel = function (s, forClient) {
    if (s === 'waiting_on_client' && forClient) return 'Waiting on you';
    return (STATUS[s] || [s])[0];
  };
  W.reqStatusPill = function (s, forClient) { return W.pill(W.reqStatusLabel(s, forClient), (STATUS[s] || [s, 'muted'])[1]); };

  var MAX_FILES = 5, MAX_BYTES = 10 * 1024 * 1024;
  var ACCEPT = 'image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.ai,.eps,.svg,.psd';

  function checkFiles(input, already) {
    var files = Array.prototype.slice.call(input.files || []);
    if (files.length + (already || 0) > MAX_FILES) throw new Error('You can attach up to ' + MAX_FILES + ' files to a request.');
    files.forEach(function (f) { if (f.size > MAX_BYTES) throw new Error('"' + f.name + '" is larger than 10 MB.'); });
    return files;
  }

  // Uploads files into the client's folder and records them. Returns the number that failed.
  W.uploadFiles = function (clientId, category, files, extra) {
    var failed = 0;
    return files.reduce(function (chain, file) {
      return chain.then(function () {
        var folder = category === 'request' ? 'request/' + extra.request_id : category;
        var path = clientId + '/' + folder + '/' + W.uuid().slice(0, 8) + '-' + W.safeFileName(file.name);
        return W.sb.storage.from('client-files').upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false })
          .then(function (r) {
            if (r.error) throw r.error;
            return W.q(W.sb.from('files').insert(Object.assign({
              client_id: clientId, bucket_path: path, file_name: file.name.slice(0, 200), size_bytes: file.size,
              mime_type: (file.type || '').slice(0, 120), category: category
            }, extra || {})));
          }).catch(function (e) { console.error(e); failed++; });
      });
    }, Promise.resolve()).then(function () { return failed; });
  };

  W.openFile = function (path, fileName) {
    // Open the tab first (inside the click) so pop-up blockers allow it, then point it at the signed link.
    var win = window.open('', '_blank');
    return W.sb.storage.from('client-files').createSignedUrl(path, 120, { download: fileName || true }).then(function (r) {
      if (r.error) { if (win) win.close(); throw W.friendlyError(r.error); }
      if (win) { win.opener = null; win.location = r.data.signedUrl; } else { location.href = r.data.signedUrl; }
    }).catch(function (e) { W.toast(e.message, true); });
  };

  W.fileList = function (files, opts) {
    opts = opts || {};
    if (!files.length) return opts.emptyText ? html`<p class="muted">${opts.emptyText}</p>` : '';
    return html`<div class="files">${files.map(function (f) {
      return html`<div class="file">${W.icon('file')}<span class="grow" title="${f.file_name}">${f.file_name}</span>
        <span class="faint mono" style="font-size:13px">${W.bytes(f.size_bytes)}</span>
        <button type="button" class="btn small" data-open-file="${f.bucket_path}" data-name="${f.file_name}">${W.icon('download')}Open</button>
        ${opts.canDelete && opts.canDelete(f) ? html`<button type="button" class="btn small danger" data-delete-file="${f.id}" aria-label="Delete ${f.file_name}">Delete</button>` : ''}
      </div>`;
    })}</div>`;
  };
  W.wireFileButtons = function (root, onDelete) {
    root.addEventListener('click', function (e) {
      var open = e.target.closest('[data-open-file]');
      if (open) { W.openFile(open.getAttribute('data-open-file'), open.getAttribute('data-name')); return; }
      var del = e.target.closest('[data-delete-file]');
      if (del && onDelete) onDelete(del.getAttribute('data-delete-file'));
    });
  };

  // ---------- list ----------
  W.requestTable = function (rows, opts) {
    opts = opts || {};
    if (!rows.length) return W.empty(opts.emptyTitle || 'No requests yet', opts.emptyText || '');
    var base = opts.admin ? '/admin/requests/' : '/requests/';
    return html`<div class="table-wrap"><table class="data stack"><thead><tr>
      <th>Request</th>${opts.showClient ? html`<th>Client</th>` : ''}<th>Status</th><th class="hide-sm">Updated</th></tr></thead><tbody>
      ${rows.map(function (r) {
        return html`<tr class="clickable" data-href="#${base}${r.id}">
          <td><a class="cell-title" href="#${base}${r.id}">#${r.ref_no} · ${r.title}</a>
            <div class="cell-sub">${W.reqTypeLabel(r.type)}${r.priority === 'urgent' ? html` · <span class="tag-urgent">Urgent</span>` : ''}${r.wanted_by ? ' · wanted by ' + W.date(r.wanted_by) : ''}</div></td>
          ${opts.showClient ? html`<td>${(r.clients && r.clients.business_name) || ''}</td>` : ''}
          <td>${W.reqStatusPill(r.status, !opts.admin)}</td>
          <td class="hide-sm muted">${W.ago(r.updated_at)}</td></tr>`;
      })}</tbody></table></div>`;
  };
  W.wireRowLinks = function (root) {
    root.addEventListener('click', function (e) {
      if (e.target.closest('a,button')) return;
      var tr = e.target.closest('tr[data-href]');
      if (tr) location.hash = tr.getAttribute('data-href');
    });
  };

  // ---------- new request form ----------
  W.requestForm = function (opts) {
    return html`<form class="card" novalidate>
      <div class="form-grid">
        <label class="field"><span>What is it about?</span><select name="type" required>${W.options(W.REQ_TYPES, opts.type || 'website')}</select></label>
        <div class="field"><span>Priority</span><div class="radio-row">
          <label><input type="radio" name="priority" value="normal" checked> Normal</label>
          <label><input type="radio" name="priority" value="urgent"> Urgent</label></div></div>
        <label class="field wide"><span>Title</span><input type="text" name="title" maxlength="140" required placeholder="For example: Update our lunch menu"></label>
        <label class="field wide"><span>Details</span><textarea name="details" maxlength="5000" required placeholder="What should change? Include any text, prices or wording you want used."></textarea></label>
        <label class="field"><span>Page or link <span class="hint">Optional</span></span><input type="text" name="page_url" maxlength="500" placeholder="https://…"></label>
        <label class="field"><span>Wanted by <span class="hint">Optional</span></span><input type="date" name="wanted_by" min="${W.isoDay()}"></label>
        <label class="field wide"><span>Attachments <span class="hint">Up to 5 files, 10 MB each (screenshots, photos, documents)</span></span>
          <input type="file" name="files" multiple accept="${ACCEPT}"></label>
      </div>
      <p class="form-error" role="alert"></p>
      <div class="form-actions"><a class="btn" href="#${opts.cancel}">Cancel</a><button class="btn primary" type="submit" data-busy="Sending…">Send request</button></div>
    </form>`;
  };
  W.wireRequestForm = function (form, clientId, done) {
    W.onSubmit(form, function (v) {
      var files = checkFiles(form.querySelector('input[type=file]'), 0);
      var row = { client_id: clientId, type: v.type, title: v.title, details: v.details, page_url: v.page_url || '',
        priority: v.priority === 'urgent' ? 'urgent' : 'normal', wanted_by: v.wanted_by || null };
      return W.q(W.sb.from('requests').insert(row).select('id, ref_no').single()).then(function (req) {
        return W.uploadFiles(clientId, 'request', files, { request_id: req.id }).then(function (failed) {
          W.toast(failed ? 'Request sent, but ' + failed + ' attachment(s) failed to upload.' : 'Request #' + req.ref_no + ' sent.', !!failed);
          done(req);
        });
      });
    });
  };

  // ---------- request page ----------
  function timeline(req, updates, admin) {
    var creator = (req.creator && (req.creator.full_name || req.creator.email)) || (admin ? 'Client' : 'Your team');
    var items = [html`<div class="tl-item"><div class="tl-meta"><strong>${creator}</strong> sent this request · ${W.dateTime(req.created_at)}</div></div>`];
    updates.forEach(function (u) {
      var wave = u.kind !== 'client_note';
      var who = wave ? (admin && u.author ? (u.author.full_name || u.author.email) + ' (WAVE)' : 'WAVE Digital')
        : ((u.author && (u.author.full_name || u.author.email)) || (admin ? 'Client' : 'Your team'));
      var what = u.kind === 'status' ? html` changed the status to ${W.reqStatusPill(u.to_status, !admin)}`
        : (u.kind === 'admin_note' ? ' added an update' : ' added details');
      items.push(html`<div class="tl-item${wave ? ' wave' : ''}"><div class="tl-meta"><strong>${who}</strong>${what} · ${W.dateTime(u.created_at)}</div>
        ${u.message ? html`<div class="tl-body">${u.message}</div>` : ''}</div>`);
    });
    return html`<div class="timeline">${items}</div>`;
  }

  W.requestPage = function (id, admin) {
    var seqPage = W.loading();
    return Promise.all([
      W.q(W.sb.from('requests').select('*, clients(business_name), creator:profiles!requests_created_by_fkey(full_name, email)').eq('id', id).maybeSingle()),
      W.q(W.sb.from('request_updates').select('*, author:profiles(full_name, email)').eq('request_id', id).order('created_at')),
      W.q(W.sb.from('files').select('*').eq('request_id', id).order('created_at'))
    ]).then(function (res) {
      var req = res[0], updates = res[1], files = res[2];
      if (!req) {
        W.page(html`${W.head('Request not found', "It may have been removed, or you don't have access to it.", null, admin ? ['/admin/requests', 'Requests'] : ['/requests', 'Requests'])}`);
        return;
      }
      var open = W.OPEN_STATUSES.indexOf(req.status) >= 0;
      var info = html`<div class="card"><dl class="kv">
        ${admin ? html`<dt>Client</dt><dd><a href="#/admin/clients/${req.client_id}">${req.clients && req.clients.business_name}</a></dd>` : ''}
        <dt>Status</dt><dd>${W.reqStatusPill(req.status, !admin)}</dd>
        <dt>Type</dt><dd>${W.reqTypeLabel(req.type)}</dd>
        <dt>Priority</dt><dd>${req.priority === 'urgent' ? html`<span class="tag-urgent">Urgent</span>` : 'Normal'}</dd>
        ${req.wanted_by ? html`<dt>Wanted by</dt><dd>${W.date(req.wanted_by)}</dd>` : ''}
        ${req.page_url ? html`<dt>Page or link</dt><dd>${/^https?:\/\//i.test(req.page_url) ? html`<a href="${req.page_url}" target="_blank" rel="noopener noreferrer">${req.page_url}</a>` : req.page_url}</dd>` : ''}
        <dt>Sent</dt><dd>${W.dateTime(req.created_at)}</dd>
        ${req.closed_at ? html`<dt>Closed</dt><dd>${W.dateTime(req.closed_at)}</dd>` : ''}
      </dl></div>`;

      var action;
      if (admin) {
        action = html`<form class="card" id="status-form" novalidate><div class="card-head"><div><h2>Update the client</h2>
          <p>Change the status, add a message, or both. The client gets an email.</p></div></div>
          <div style="display:grid;gap:14px"><label class="field"><span>Status</span><select name="status">${W.options(Object.keys(STATUS).map(function (k) { return [k, STATUS[k][0]]; }), req.status)}</select></label>
          <label class="field"><span>Message to the client <span class="hint">Optional</span></span><textarea name="message" maxlength="5000" placeholder="What you did, or what you need from them."></textarea></label></div>
          <p class="form-error" role="alert"></p>
          <div class="form-actions"><button type="button" class="btn small" data-toggle-priority>${req.priority === 'urgent' ? 'Mark as normal' : 'Mark as urgent'}</button>
          <button class="btn primary" type="submit">Save update</button></div></form>`;
      } else if (open) {
        action = html`<form class="card" id="note-form" novalidate><div class="card-head"><div><h2>Add more details</h2>
          <p>Anything you forgot, or answers to WAVE's questions.</p></div></div>
          <label class="field"><span class="sr-only">Details</span><textarea name="message" maxlength="5000" required></textarea></label>
          <label class="field" style="margin-top:14px"><span>Add files <span class="hint">Optional · ${MAX_FILES - files.length} more allowed</span></span><input type="file" name="files" multiple accept="${ACCEPT}"${files.length >= MAX_FILES ? W.raw(' disabled') : ''}></label>
          <p class="form-error" role="alert"></p>
          <div class="form-actions"><button class="btn primary" type="submit" data-busy="Sending…">Send details</button></div></form>`;
      } else {
        action = html`<div class="notice">This request is closed. Need something else? <a href="#/requests/new">Start a new request</a>.</div>`;
      }

      var el = W.page(html`
        ${W.head('#' + req.ref_no + ' · ' + req.title, W.reqTypeLabel(req.type), null, admin ? ['/admin/requests', 'Requests'] : ['/requests', 'Requests'])}
        <div class="split">
          <div style="display:grid;gap:22px">
            <div class="card"><h2 style="margin-bottom:12px">Details</h2><div class="prewrap">${req.details}</div>
              ${files.length ? html`<h3 style="margin:20px 0 10px">Attachments</h3>${W.fileList(files)}` : ''}</div>
            <div class="card"><h2 style="margin-bottom:16px">History</h2>${timeline(req, updates, admin)}</div>
          </div>
          <div style="display:grid;gap:22px">${info}${action}</div>
        </div>`);
      W.wireFileButtons(el);

      var statusForm = el.querySelector('#status-form');
      if (statusForm) {
        W.onSubmit(statusForm, function (v) {
          if (v.status === req.status && !v.message) throw new Error('Change the status or write a message.');
          return W.q(W.sb.rpc('set_request_status', { p_request: req.id, p_status: v.status, p_message: v.message || '' })).then(function () {
            W.toast('Update saved. The client will get an email.');
            W.refreshBadges();
            W.render();
          });
        });
        statusForm.querySelector('[data-toggle-priority]').addEventListener('click', function () {
          W.q(W.sb.from('requests').update({ priority: req.priority === 'urgent' ? 'normal' : 'urgent' }).eq('id', req.id))
            .then(function () { W.render(); }, function (e) { W.toast(e.message, true); });
        });
      }
      var noteForm = el.querySelector('#note-form');
      if (noteForm) {
        W.onSubmit(noteForm, function (v) {
          var picked = checkFiles(noteForm.querySelector('input[type=file]'), files.length);
          return W.q(W.sb.from('request_updates').insert({ request_id: req.id, client_id: req.client_id, kind: 'client_note', message: v.message }))
            .then(function () { return W.uploadFiles(req.client_id, 'request', picked, { request_id: req.id }); })
            .then(function (failed) {
              W.toast(failed ? 'Details sent, but ' + failed + ' file(s) failed to upload.' : 'Details sent to WAVE.', !!failed);
              W.render();
            });
        });
      }
      return seqPage;
    });
  };
})();
