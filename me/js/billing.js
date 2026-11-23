/* WAVE Portal billing: plan and payment status, Stripe's customer portal for card and invoices. */
(function () {
  'use strict';
  var W = window.W, html = W.html;
  var CYCLE = { monthly: 'Billed monthly', yearly: 'Billed yearly', one_time: 'One-time payment', none: 'No recurring billing' };

  function stripeLink() {
    var raw = W.state.settings.stripe_portal_url;
    if (!raw) return null;
    try {
      var u = new URL(raw);
      if (u.protocol !== 'https:' || !/(^|\.)stripe\.com$/.test(u.hostname)) return null;
      if (W.state.profile && W.state.profile.email) u.searchParams.set('prefilled_email', W.state.profile.email);
      return u.toString();
    } catch (e) { return null; }
  }

  W.clientRoute('/billing', function (c) {
    W.loading();
    return W.q(W.sb.from('clients').select('plan, billing_cycle, monthly_amount, billing_status, next_payment_date, start_date').eq('id', c.id).single()).then(function (b) {
      var link = stripeLink();
      var support = W.state.settings.support_email;
      var price = b.billing_cycle === 'yearly' ? W.money(b.monthly_amount * 12) + '/yr' : (b.monthly_amount > 0 ? W.money(b.monthly_amount) + (b.billing_cycle === 'monthly' ? '/mo' : '') : '');
      W.page(html`
        ${W.head('Billing', 'Your plan, payments and invoices.')}
        ${b.billing_status === 'overdue' ? html`<div class="notice warn"><strong>Your latest payment didn't go through.</strong> Please update your card in Manage billing, or contact WAVE if you think this is a mistake.</div>` : ''}
        <div class="grid-2">
          <div class="card"><div class="card-head"><h2>Your plan</h2>${W.billingPill(b.billing_status)}</div>
            <dl class="kv"><dt>Plan</dt><dd>${b.plan || 'No plan yet'}</dd>
              ${price ? html`<dt>Price</dt><dd>${price}</dd>` : ''}
              <dt>Billing</dt><dd>${CYCLE[b.billing_cycle] || ''}</dd>
              ${b.next_payment_date ? html`<dt>Next payment</dt><dd>${W.date(b.next_payment_date)}</dd>` : ''}
              ${b.start_date ? html`<dt>Client since</dt><dd>${W.date(b.start_date)}</dd>` : ''}</dl>
            <p class="muted" style="font-size:14px;margin-top:16px">Want to change your plan? <a href="#/requests/new?type=other">Send WAVE a request</a>.</p></div>
          <div class="card"><div class="card-head"><h2>Card and invoices</h2></div>
            ${link ? html`<p>Update your card, download past invoices and receipts, or cancel, in Stripe's secure billing portal. Stripe emails you a sign-in link.</p>
              <div style="margin-top:16px"><a class="btn primary" href="${link}" target="_blank" rel="noopener noreferrer">${W.icon('card')}Manage billing</a></div>`
              : html`<p>Online billing is being set up. For invoices or changes to your payment, email <a href="mailto:${support}">${support}</a>.</p>`}
            <p class="muted" style="font-size:13.5px;margin-top:16px">Payments are processed securely by Stripe. WAVE never sees your full card number.</p></div>
        </div>`);
    });
  });

  // ---------- admin ----------
  function nextDate(from, cycle) {
    var d = from ? new Date(from + 'T12:00:00') : new Date();
    if (cycle === 'yearly') d.setFullYear(d.getFullYear() + 1); else d.setMonth(d.getMonth() + 1);
    return W.isoDay(d);
  }

  W.addClientTab('billing', 'Billing', function (c, el) {
    var cus = c.private.stripe_customer_id;
    W.mount(el, html`<div class="grid-2">
      <div class="card"><div class="card-head"><h2>Payment status</h2>${W.billingPill(c.billing_status)}</div>
        <dl class="kv"><dt>Plan</dt><dd>${c.plan || 'None'}</dd><dt>Monthly value</dt><dd>${W.money(c.monthly_amount)}</dd>
          <dt>Billing</dt><dd>${CYCLE[c.billing_cycle] || ''}</dd><dt>Next payment</dt><dd>${c.next_payment_date ? W.date(c.next_payment_date) : 'Not set'}</dd></dl>
        <div class="form-actions" style="justify-content:flex-start;margin-top:18px">
          <button type="button" class="btn primary small" data-paid>${W.icon('check')}Mark paid</button>
          <button type="button" class="btn small danger" data-overdue${c.billing_status === 'overdue' ? W.raw(' disabled') : ''}>Mark overdue</button></div>
        <p class="muted" style="font-size:13px;margin-top:12px">"Mark paid" sets the status to current and moves the next payment date ${c.billing_cycle === 'yearly' ? 'a year' : 'a month'} ahead.</p></div>
      <div class="card"><div class="card-head"><h2>Stripe</h2></div>
        ${cus ? html`<p>Customer <span class="mono">${cus}</span></p><div style="margin-top:14px"><a class="btn small" href="https://dashboard.stripe.com/customers/${encodeURIComponent(cus)}" target="_blank" rel="noopener noreferrer">${W.icon('link')}Open in Stripe</a></div>`
          : html`<p class="muted">Add the client's Stripe customer ID on the Summary tab to link straight to them in Stripe.</p>`}
        <p class="muted" style="font-size:13px;margin-top:14px">Clients manage their card and invoices through the Stripe customer portal link in Settings.</p></div>
    </div>`);
    el.querySelector('[data-paid]').addEventListener('click', function () {
      var upd = { billing_status: 'current' };
      if (c.billing_cycle === 'monthly' || c.billing_cycle === 'yearly') upd.next_payment_date = nextDate(c.next_payment_date, c.billing_cycle);
      W.q(W.sb.from('clients').update(upd).eq('id', c.id)).then(function () { W.toast('Marked as paid.'); W.render(); }, function (e) { W.toast(e.message, true); });
    });
    el.querySelector('[data-overdue]').addEventListener('click', function () {
      W.q(W.sb.from('clients').update({ billing_status: 'overdue' }).eq('id', c.id)).then(function () { W.toast('Marked as overdue.'); W.render(); }, function (e) { W.toast(e.message, true); });
    });
  }, 50);
})();
