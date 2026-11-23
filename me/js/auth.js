/* WAVE Portal sign-in: login, forgot password, set password (invite and reset links),
   two-step verification for the admin, and the route guard. */
(function () {
  'use strict';
  var W = window.W, html = W.html;
  var LOGO = '../wave-logo-sm.png';

  function authPage(title, lead, body, links) {
    W.resetShell();
    W.mount(W.app(), html`<div class="auth"><div class="auth-card">
      <div class="auth-brand"><img src="${LOGO}" alt="" width="40" height="36"><div><b>WAVE DIGITAL</b><span>Client portal</span></div></div>
      <h1>${title}</h1>${lead ? html`<p class="lead">${lead}</p>` : ''}
      ${body}
      ${links ? html`<div class="auth-links">${links}</div>` : ''}
    </div></div>`);
    var first = W.app().querySelector('input');
    if (first) first.focus();
    return W.app();
  }

  // ---------- links from emails (invite / password reset) ----------
  // Our emails link to /me/?flow=welcome&type=invite&token_hash=... and the token is exchanged here,
  // only when the page actually runs (email scanners that pre-open links don't use it up).
  // Supabase's built-in emails instead put the session in the fragment: #access_token=...&type=...
  W.consumeAuthRedirect = function () {
    var search = new URLSearchParams(location.search);
    var tokenHash = search.get('token_hash');
    if (tokenHash && search.get('type') === 'signup') {
      // Sign-up confirmation: verify the email, then finish setting up the account.
      return W.sb.auth.verifyOtp({ token_hash: tokenHash, type: 'signup' }).then(function (r) {
        history.replaceState(null, '', location.pathname + (r.error ? '#/login' : '#/home'));
        if (r.error) return { error: 'That confirmation link has expired or was already used. Try signing in; if that fails, sign up again.' };
        return W.fn('signup', { action: 'complete' }).then(function () { return { ok: true, welcome: true }; },
          function () { return { ok: true, welcome: true }; });
      });
    }
    if (tokenHash) {
      var type = search.get('type') === 'invite' ? 'invite' : 'recovery';
      var mode = type === 'invite' ? 'welcome' : 'recovery';
      return W.sb.auth.verifyOtp({ token_hash: tokenHash, type: type }).then(function (r) {
        if (r.error) {
          history.replaceState(null, '', location.pathname + '#/login');
          return { error: type === 'invite'
            ? 'That invite link has expired or was already used. Ask WAVE to send a new one.'
            : 'That reset link has expired or was already used. Request a new one below.' };
        }
        history.replaceState(null, '', location.pathname + '#/set-password?mode=' + mode);
        return { ok: true };
      });
    }
    var h = location.hash.replace(/^#/, '');
    if (!/(^|&)(access_token|error)=/.test(h)) return Promise.resolve(null);
    var p = new URLSearchParams(h);
    var flow = new URLSearchParams(location.search).get('flow') || p.get('type') || '';
    var clean = location.pathname;
    if (p.get('error')) {
      var expired = /expired|invalid/i.test(p.get('error_description') || '') || p.get('error_code') === 'otp_expired';
      history.replaceState(null, '', clean + '#/login');
      return Promise.resolve({ error: expired
        ? 'That link has expired or was already used. Ask WAVE for a new invite, or use "Forgot password".'
        : 'That link could not be used. Please ask WAVE for a new one.' });
    }
    return W.sb.auth.setSession({ access_token: p.get('access_token'), refresh_token: p.get('refresh_token') }).then(function (r) {
      if (r.error) {
        history.replaceState(null, '', clean + '#/login');
        return { error: 'That link could not be used. Please ask WAVE for a new one.' };
      }
      var mode = /invite|welcome|signup/.test(flow) ? 'welcome' : 'recovery';
      history.replaceState(null, '', clean + '#/set-password?mode=' + mode);
      return { ok: true };
    });
  };

  // ---------- guard ----------
  var contextLoaded = false;
  W.guard = function (route, loc) {
    return W.sb.auth.getSession().then(function (r) {
      var session = r.data.session;
      W.state.session = session;
      if (route.area === 'public') {
        if (session && loc.path === '/login') { W.go(W.home()); return false; }
        return true;
      }
      if (!session) {
        var next = loc.path !== '/' ? '?next=' + encodeURIComponent(location.hash.slice(1)) : '';
        W.go('/login' + next);
        return false;
      }
      var ready = contextLoaded ? Promise.resolve() : W.loadContext().then(function () { contextLoaded = true; });
      return ready.then(function () {
        if (!W.state.profile) { W.signOut('Your account could not be loaded. Please sign in again.'); return false; }
        if (W.isAdmin()) {
          return W.sb.auth.mfa.getAuthenticatorAssuranceLevel().then(function (a) {
            var level = a.data && a.data.currentLevel;
            if (level !== 'aal2' && route.area !== 'mfa' && loc.path !== '/set-password') { W.go('/mfa'); return false; }
            if (route.area === 'client') { W.go('/admin'); return false; }
            return true;
          });
        }
        if (route.area === 'admin' || route.area === 'mfa') { W.go('/home'); return false; }
        return true;
      });
    });
  };
  W.forgetContext = function () { contextLoaded = false; };

  W.signOut = function (message) {
    return W.sb.auth.signOut({ scope: 'local' }).catch(function () {}).then(function () {
      contextLoaded = false;
      W.state.profile = null; W.state.clients = []; W.state.session = null;
      W.go('/login');
      if (message) setTimeout(function () { W.toast(message, true); }, 50);
    });
  };

  // ---------- pages ----------
  W.route('/login', 'public', function (_, query) {
    var el = authPage('Sign in', 'Welcome back. Sign in to your WAVE Digital portal.', html`
      ${W.pendingAuthError ? html`<div class="notice err">${W.pendingAuthError}</div>` : ''}
      <form novalidate>
        <label class="field"><span>Email</span><input type="email" name="email" autocomplete="username" required></label>
        <label class="field"><span>Password</span><input type="password" name="password" autocomplete="current-password" required></label>
        <p class="form-error" role="alert"></p>
        <button class="btn primary full" type="submit" data-busy="Signing in…">Sign in</button>
      </form>`, html`<a href="#/forgot">Forgot password?</a><a href="#/signup">Create an account</a><a href="${window.WAVE_CONFIG.siteUrl}">Back to wavedigital.biz</a>`);
    W.pendingAuthError = null;
    W.onSubmit(el.querySelector('form'), function (v) {
      return W.sb.auth.signInWithPassword({ email: v.email, password: v.password }).then(function (r) {
        if (r.error) {
          if (/not confirmed/i.test(r.error.message)) throw new Error('Please confirm your email first: open the link we emailed you when you signed up.');
          throw new Error(/invalid login/i.test(r.error.message) ? 'That email and password don\'t match. Try again or reset your password.' : W.friendlyError(r.error).message);
        }
        contextLoaded = false;
        var next = query.next && query.next.charAt(0) === '/' && query.next.indexOf('/login') !== 0 ? query.next : null;
        return W.loadContext().then(function () {
          contextLoaded = true;
          W.go(next || W.home());
        });
      });
    });
  });

  var SIGNUP_SERVICES = [['website', 'A website'], ['social', 'Social media'], ['advertising', 'Advertising'],
    ['branding', 'Logo / branding'], ['broken', 'Fixing something'], ['other', 'Something else']];
  W.route('/signup', 'public', function (_, query) {
    var kind = query.kind === 'existing' ? 'existing' : (query.kind === 'prospect' ? 'prospect' : null);
    if (!kind) {
      var el0 = authPage('Create an account', 'Which describes you?', html`
        <div style="display:grid;gap:12px">
          <a class="btn full" style="justify-content:flex-start;min-height:72px;padding:12px 16px;text-align:left;white-space:normal" href="#/signup?kind=existing">
            <span><strong style="display:block">I'm a current WAVE client</strong><span class="muted" style="font-weight:400;font-size:13.5px">See your stats, send requests and manage billing. WAVE confirms your account.</span></span></a>
          <a class="btn full" style="justify-content:flex-start;min-height:72px;padding:12px 16px;text-align:left;white-space:normal" href="#/signup?kind=prospect">
            <span><strong style="display:block">I'd like to work with WAVE</strong><span class="muted" style="font-weight:400;font-size:13.5px">Tell us about your project, book a free call and share files.</span></span></a>
        </div>`, html`<a href="#/login">I already have an account</a>`);
      return el0;
    }
    var existing = kind === 'existing';
    var el = authPage(existing ? 'Sign up as a WAVE client' : 'Start a project with WAVE',
      existing ? 'Create your login. WAVE will confirm you and connect your business.' : 'Tell us about your business and what you need. You\'ll get your own portal to follow along.', html`
      <form novalidate>
        <label class="field"><span>Your name</span><input type="text" name="full_name" autocomplete="name" maxlength="120" required></label>
        <label class="field"><span>Business name</span><input type="text" name="business_name" autocomplete="organization" maxlength="120" required></label>
        <label class="field"><span>Email</span><input type="email" name="email" autocomplete="email" maxlength="200" required></label>
        ${existing ? '' : html`<label class="field"><span>Phone <span class="hint">Optional</span></span><input type="tel" name="phone" autocomplete="tel" maxlength="40"></label>
          <label class="field"><span>What do you need help with?</span><select name="service" required>${W.options(SIGNUP_SERVICES, 'website')}</select></label>
          <label class="field"><span>Tell us about it</span><textarea name="details" maxlength="5000" required placeholder="What's your business, what do you want to achieve, and any timing or budget in mind?"></textarea></label>`}
        <label class="field"><span>Password <span class="hint">At least 10 characters, letters and numbers</span></span><input type="password" name="password" autocomplete="new-password" minlength="10" required></label>
        <label class="field"><span>Confirm password</span><input type="password" name="confirm" autocomplete="new-password" minlength="10" required></label>
        <div aria-hidden="true" style="position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden"><label>Website<input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>
        <p class="form-error" role="alert"></p>
        <button class="btn primary full" type="submit" data-busy="Creating your account…">Create account</button>
      </form>`, html`<a href="#/signup">Back</a><a href="#/login">I already have an account</a>`);
    W.onSubmit(el.querySelector('form'), function (v) {
      if (v.password !== v.confirm) throw new Error("The two passwords don't match.");
      if (!/[a-z]/i.test(v.password) || !/[0-9]/.test(v.password)) throw new Error('Use both letters and numbers in your password.');
      return W.fn('signup', { action: 'register', kind: kind, full_name: v.full_name, business_name: v.business_name, email: v.email,
        phone: v.phone || '', service: v.service || '', details: v.details || '', password: v.password, website: v.website || '' }).then(function () {
        authPage('Check your email', '', html`<p>We sent a confirmation link to <strong>${v.email}</strong>. Open it to activate your account. It expires in 24 hours.</p>
          <p class="muted" style="margin-top:12px">Nothing after a few minutes? Check your spam folder. Already had an account with this email? We sent a reminder to sign in instead.</p>`,
          html`<a href="#/login">Go to sign in</a>`);
      });
    });
  });

  W.route('/forgot', 'public', function () {
    var el = authPage('Reset your password', "Enter your email and we'll send you a link to choose a new password.", html`
      <form novalidate>
        <label class="field"><span>Email</span><input type="email" name="email" autocomplete="username" required></label>
        <p class="form-error" role="alert"></p>
        <button class="btn primary full" type="submit" data-busy="Sending…">Send reset link</button>
      </form>`, html`<a href="#/login">Back to sign in</a>`);
    W.onSubmit(el.querySelector('form'), function (v) {
      return W.fn('password-reset', { email: v.email }).then(function () {
        authPage('Check your email', '', html`<p>If <strong>${v.email}</strong> has a portal account, a reset link is on its way. It works once and expires in 24 hours.</p>
          <p class="muted" style="margin-top:12px">Nothing arrived after a few minutes? Check your spam folder, or contact WAVE at <a href="mailto:${W.state.settings.support_email || 'clientsupport@wavedigital.biz'}">${W.state.settings.support_email || 'clientsupport@wavedigital.biz'}</a>.</p>`,
        html`<a href="#/login">Back to sign in</a>`);
      });
    });
  });

  W.route('/set-password', 'any', function (_, query) {
    var welcome = query.mode === 'welcome';
    var name = (W.state.profile && W.state.profile.full_name) || '';
    var el = authPage(welcome ? 'Welcome to your WAVE portal' : 'Choose a new password',
      welcome ? 'Set a password to finish setting up your account.' : 'Pick a new password for your account.', html`
      <form novalidate>
        ${welcome ? html`<label class="field"><span>Your name</span><input type="text" name="full_name" value="${name}" autocomplete="name" maxlength="120" required></label>` : ''}
        <label class="field"><span>New password <span class="hint">At least 10 characters, with letters and numbers</span></span>
          <input type="password" name="password" autocomplete="new-password" minlength="10" required></label>
        <label class="field"><span>Confirm password</span><input type="password" name="confirm" autocomplete="new-password" minlength="10" required></label>
        <p class="form-error" role="alert"></p>
        <button class="btn primary full" type="submit">${welcome ? 'Save and continue' : 'Save new password'}</button>
      </form>`);
    W.onSubmit(el.querySelector('form'), function (v) {
      if (v.password !== v.confirm) throw new Error("The two passwords don't match.");
      if (!/[a-z]/i.test(v.password) || !/[0-9]/.test(v.password)) throw new Error('Use both letters and numbers.');
      return W.sb.auth.updateUser({ password: v.password }).then(function (r) {
        if (r.error) throw new Error(/same|different/i.test(r.error.message) ? 'Choose a password you haven\'t used here before.' : W.friendlyError(r.error).message);
        if (welcome && v.full_name) return W.q(W.sb.from('profiles').update({ full_name: v.full_name }).eq('id', W.state.profile.id));
      }).then(function () {
        contextLoaded = false;
        W.toast(welcome ? 'You\'re all set.' : 'Password updated.');
        W.go(W.isAdmin() ? '/mfa' : '/home');
      });
    });
  });

  // Admin two-step verification: set up an authenticator app once, then confirm a code each sign-in.
  W.route('/mfa', 'mfa', function () {
    return W.sb.auth.mfa.listFactors().then(function (r) {
      if (r.error) throw W.friendlyError(r.error);
      var verified = (r.data.totp || []).filter(function (f) { return f.status === 'verified'; });
      return verified.length ? challenge(verified[0]) : enroll(r.data.all || []);
    });
  });
  function challenge(factor) {
    var el = authPage('Two-step verification', 'Enter the 6-digit code from your authenticator app.', html`
      <form novalidate>
        <label class="field"><span>Code</span><input type="text" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required></label>
        <p class="form-error" role="alert"></p>
        <button class="btn primary full" type="submit" data-busy="Checking…">Verify</button>
      </form>`, html`<button type="button" class="btn link" data-signout>Sign out</button>`);
    el.querySelector('[data-signout]').addEventListener('click', function () { W.signOut(); });
    W.onSubmit(el.querySelector('form'), function (v) {
      return W.sb.auth.mfa.challengeAndVerify({ factorId: factor.id, code: v.code }).then(function (r) {
        if (r.error) throw new Error("That code didn't work. Check the time on your phone and try the newest code.");
        return W.sb.auth.refreshSession().then(function () { W.go('/admin'); });
      });
    });
  }

  function enroll(existing) {
    // Remove half-finished setups from earlier attempts first.
    var stale = existing.filter(function (f) { return f.status !== 'verified'; });
    return Promise.all(stale.map(function (f) { return W.sb.auth.mfa.unenroll({ factorId: f.id }); })).then(function () {
      return W.sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'WAVE admin ' + new Date().toISOString().slice(0, 10) });
    }).then(function (r) {
      if (r.error) throw W.friendlyError(r.error);
      var f = r.data;
      var el = authPage('Protect your admin account', 'Admin access needs two-step verification. Scan this QR code with an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…), then enter the code it shows.', html`
        <div class="qr"><img src="${f.totp.qr_code}" alt="QR code for your authenticator app" width="176" height="176"></div>
        <details><summary class="muted" style="cursor:pointer;font-size:14px">Can't scan? Enter this key instead</summary><p class="secret" style="margin-top:8px">${f.totp.secret}</p></details>
        <form novalidate>
          <label class="field"><span>6-digit code</span><input type="text" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required></label>
          <p class="form-error" role="alert"></p>
          <button class="btn primary full" type="submit" data-busy="Checking…">Turn on and continue</button>
        </form>`, html`<button type="button" class="btn link" data-signout>Sign out</button>`);
      el.querySelector('[data-signout]').addEventListener('click', function () { W.signOut(); });
      W.onSubmit(el.querySelector('form'), function (v) {
        return W.sb.auth.mfa.challengeAndVerify({ factorId: f.id, code: v.code }).then(function (res) {
          if (res.error) throw new Error("That code didn't work. Try the newest code from the app.");
          return W.sb.auth.refreshSession().then(function () { W.toast('Two-step verification is on.'); W.go('/admin'); });
        });
      });
    });
  }

  // Keep the app in step with sign-outs in other tabs and expired sessions.
  W.sb.auth.onAuthStateChange(function (event) {
    if (event === 'SIGNED_OUT') {
      contextLoaded = false;
      var p = W.parseHash().path;
      if (['/login', '/forgot'].indexOf(p) < 0) W.go('/login');
    }
  });
})();
