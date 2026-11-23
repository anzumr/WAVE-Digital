/* WAVE Portal files: deliverables from WAVE, client uploads, and requested-file checklists. */
(function () {
  'use strict';
  var W = window.W, html = W.html;
  var MAX_BYTES = 10 * 1024 * 1024;

  function picked(input) {
    var files = Array.prototype.slice.call(input.files || []);
    if (!files.length) throw new Error('Choose a file first.');
    if (files.length > 10) throw new Error('Upload up to 10 files at a time.');
    files.forEach(function (f) { if (f.size > MAX_BYTES) throw new Error('"' + f.name + '" is larger than 10 MB.'); });
    return files;
  }
  function afterUpload(failed, total, ok) {
    if (failed) W.toast(failed + ' of ' + total + ' file(s) failed to upload. Try again.', true);
    else W.toast(ok);
    W.render();
  }
  W.deleteFile = function (id) {
    return W.q(W.sb.from('files').select('bucket_path, file_name').eq('id', id).single()).then(function (f) {
      return W.confirm('Delete ' + f.file_name + '?', 'This removes the file for everyone.', 'Delete', true).then(function (ok) {
        if (!ok) return;
        return W.sb.storage.from('client-files').remove([f.bucket_path]).then(function (r) {
          if (r.error) throw W.friendlyError(r.error);
          return W.q(W.sb.from('files').delete().eq('id', id));
        }).then(function () { W.toast('File deleted.'); W.render(); });
      });
    }).catch(function (e) { W.toast(e.message, true); });
  };

  function requestedList(reqs, admin) {
    if (!reqs.length) return '';
    return html`<div class="list">${reqs.map(function (r) {
      var done = r.status === 'received', cancelled = r.status === 'cancelled';
      return html`<div class="list-item" style="align-items:flex-start">
        <div style="padding-top:2px;color:${done ? 'var(--green)' : 'var(--muted)'}">${W.icon(done ? 'check' : 'upload')}</div>
        <div class="grow"><div class="cell-title"${cancelled ? W.raw(' style="text-decoration:line-through;color:var(--muted)"') : ''}>${r.title}</div>
          ${r.description ? html`<div class="cell-sub prewrap">${r.description}</div>` : ''}
          <div class="cell-sub">${done ? 'Received ' + W.date(r.received_at) : (cancelled ? 'No longer needed' : 'Asked ' + W.ago(r.created_at))}</div></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">
          ${!admin && r.status === 'open' ? html`<label class="btn small primary" style="cursor:pointer">${W.icon('upload')}Upload<input type="file" class="sr-only" data-answer="${r.id}" multiple></label>` : ''}
          ${admin && r.status === 'open' ? html`<button type="button" class="btn small" data-fr-status="cancelled" data-fr="${r.id}">Not needed</button>` : ''}
          ${admin && r.status !== 'open' ? html`<button type="button" class="btn small" data-fr-status="open" data-fr="${r.id}">Ask again</button>` : ''}
        </div></div>`;
    })}</div>`;
  }

  // ---------- client ----------
  W.clientRoute('/files', function (c) {
    W.loading();
    return Promise.all([
      W.q(W.sb.from('files').select('*').eq('client_id', c.id).in('category', ['deliverable', 'upload']).order('created_at', { ascending: false })),
      W.q(W.sb.from('file_requests').select('*').eq('client_id', c.id).neq('status', 'cancelled').order('created_at', { ascending: false }))
    ]).then(function (res) {
      var files = res[0], reqs = res[1];
      var open = reqs.filter(function (r) { return r.status === 'open'; });
      var me = W.state.profile.id;
      var el = W.page(html`
        ${W.head('Files', 'Files from WAVE, and anything you want to send us: photos, menus, logos, documents.')}
        ${open.length ? html`<div class="card" style="border-color:var(--line-2)"><div class="card-head"><div><h2>WAVE needs from you</h2>
          <p>${open.length} file${open.length === 1 ? '' : 's'} to send. Upload straight from here.</p></div></div>${requestedList(reqs, false)}</div>` : ''}
        <div class="grid-2">
          <div class="card"><div class="card-head"><div><h2>From WAVE</h2><p>Logos, brand assets and finished work.</p></div></div>
            ${W.fileList(files.filter(function (f) { return f.category === 'deliverable'; }), { emptyText: 'Nothing here yet. Finished work from WAVE will appear here.' })}</div>
          <div class="card"><div class="card-head"><div><h2>Your uploads</h2><p>Up to 10 MB per file.</p></div></div>
            <form data-upload novalidate style="display:grid;gap:12px;margin-bottom:18px">
              <input type="file" name="files" multiple aria-label="Choose files to upload">
              <div class="form-actions" style="margin:0"><button class="btn primary small" type="submit" data-busy="Uploading…">${W.icon('upload')}Upload</button></div></form>
            ${W.fileList(files.filter(function (f) { return f.category === 'upload'; }), { emptyText: 'You haven\'t uploaded anything yet.', canDelete: function (f) { return f.uploaded_by === me; } })}</div>
        </div>
        ${reqs.length > open.length ? html`<details class="card table-view"><summary>Files WAVE asked for earlier</summary><div style="margin-top:8px">${requestedList(reqs.filter(function (r) { return r.status !== 'open'; }), false)}</div></details>` : ''}`);
      W.wireFileButtons(el, W.deleteFile);
      W.onSubmit(el.querySelector('[data-upload]'), function () {
        var files2 = picked(el.querySelector('[data-upload] input[type=file]'));
        return W.uploadFiles(c.id, 'upload', files2, {}).then(function (failed) { afterUpload(failed, files2.length, 'Uploaded. WAVE has been told.'); });
      });
      el.addEventListener('change', function (e) {
        var input = e.target.closest('[data-answer]');
        if (!input) return;
        var list;
        try { list = picked(input); } catch (err) { W.toast(err.message, true); return; }
        W.toast('Uploading…');
        W.uploadFiles(c.id, 'upload', list, { file_request_id: input.getAttribute('data-answer') })
          .then(function (failed) { afterUpload(failed, list.length, 'Thanks! WAVE has your file.'); });
      });
    });
  });

  W.addHomeSection(3, function (client, slot) {
    return W.q(W.sb.from('file_requests').select('id, title').eq('client_id', client.id).eq('status', 'open')).then(function (rows) {
      if (!rows.length) return;
      W.mount(slot, html`<div class="notice warn"><strong>WAVE needs ${rows.length === 1 ? 'a file' : rows.length + ' files'} from you:</strong>
        ${rows.map(function (r, i) { return (i ? ', ' : ' ') + r.title; }).join('')}. <a href="#/files">Upload on the Files page</a>.</div>`);
    });
  });

  // ---------- admin ----------
  W.addClientTab('files', 'Files', function (c, el) {
    return Promise.all([
      W.q(W.sb.from('files').select('*, file_requests(title)').eq('client_id', c.id).order('created_at', { ascending: false })),
      W.q(W.sb.from('file_requests').select('*').eq('client_id', c.id).order('created_at', { ascending: false }))
    ]).then(function (res) {
      var files = res[0], reqs = res[1];
      var by = function (cat) { return files.filter(function (f) { return f.category === cat; }); };
      W.mount(el, html`<div style="display:grid;gap:22px"><div class="grid-2">
        <form class="card" data-ask novalidate><div class="card-head"><div><h2>Ask for a file</h2><p>The client gets an email and a checklist item on their Files page.</p></div></div>
          <div style="display:grid;gap:14px"><label class="field"><span>What do you need?</span><input type="text" name="title" maxlength="140" required placeholder="High-resolution logo"></label>
          <label class="field"><span>Details <span class="hint">Optional</span></span><textarea name="description" maxlength="2000" style="min-height:80px" placeholder="PNG or SVG, at least 1000 px wide."></textarea></label></div>
          <p class="form-error" role="alert"></p><div class="form-actions"><button class="btn primary" type="submit">Ask the client</button></div></form>
        <form class="card" data-deliver novalidate><div class="card-head"><div><h2>Share a file with the client</h2><p>Finished work, logos, brand assets. The client gets an email.</p></div></div>
          <div style="display:grid;gap:14px"><input type="file" name="files" multiple aria-label="Choose files to share">
          <label class="field"><span>Message <span class="hint">Optional, shown in the email</span></span><input type="text" name="note" maxlength="500" placeholder="Your new logo in every format."></label></div>
          <p class="form-error" role="alert"></p><div class="form-actions"><button class="btn primary" type="submit" data-busy="Uploading…">${W.icon('upload')}Share</button></div></form>
      </div>
      <div class="card"><div class="card-head"><h2>Requested files</h2></div>${reqs.length ? requestedList(reqs, true) : html`<p class="muted">You haven't asked ${c.business_name} for any files.</p>`}</div>
      <div class="grid-2">
        <div class="card"><h2 style="margin-bottom:14px">Shared by WAVE</h2>${W.fileList(by('deliverable'), { emptyText: 'Nothing shared yet.', canDelete: function () { return true; } })}</div>
        <div class="card"><h2 style="margin-bottom:14px">Uploaded by the client</h2>${W.fileList(by('upload'), { emptyText: 'Nothing uploaded yet.', canDelete: function () { return true; } })}</div>
      </div>
      ${by('request').length ? html`<div class="card"><h2 style="margin-bottom:14px">Attached to requests</h2>${W.fileList(by('request'), { canDelete: function () { return true; } })}</div>` : ''}
      </div>`);
      W.wireFileButtons(el, W.deleteFile);
      W.onSubmit(el.querySelector('[data-ask]'), function (v) {
        return W.q(W.sb.from('file_requests').insert({ client_id: c.id, title: v.title, description: v.description || '' }))
          .then(function () { W.toast('Asked. The client has been emailed.'); W.render(); });
      });
      W.onSubmit(el.querySelector('[data-deliver]'), function (v) {
        var list = picked(el.querySelector('[data-deliver] input[type=file]'));
        return W.uploadFiles(c.id, 'deliverable', list, { note: v.note || '' }).then(function (failed) { afterUpload(failed, list.length, 'Shared with ' + c.business_name + '.'); });
      });
      el.addEventListener('click', function (e) {
        var b = e.target.closest('[data-fr]');
        if (!b) return;
        var status = b.getAttribute('data-fr-status');
        W.q(W.sb.from('file_requests').update({ status: status, received_at: null }).eq('id', b.getAttribute('data-fr')))
          .then(function () { W.render(); }, function (err) { W.toast(err.message, true); });
      });
    });
  }, 45);
})();
