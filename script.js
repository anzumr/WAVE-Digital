// SETUP: Replace the blank values with your real links (step by step in README.txt).
// This one file is shared by index.html and thank-you.html, so every link is set here once.
//
// formspreeEndpoint: your Formspree form URL (https://formspree.io/f/...). The <form> tag in
//   index.html posts to the same address when JavaScript is off, so if you ever change it, change both.
// bookingUrl: your scheduling page for "Schedule a Free Consultation": a Calendly link (set the event
//   type's location to Google Meet) or a Google Calendar appointment-schedule booking page.
//
// SECURITY: this site never collects card details: every payment happens on Stripe's own
// hosted checkout page. It needs NO Stripe API keys. Never paste a secret key (sk_...) or a
// restricted key (rk_...) into any of these files: anyone can read a website's code.
const CONFIG = {
  formspreeEndpoint: "https://formspree.io/f/xpqkaybj",
  bookingUrl: "https://calendly.com/anzum2225/wave",
  // Paste each button's Stripe Payment Link (Stripe Dashboard > Payment Links), e.g.
  // "https://buy.stripe.com/xxxxxxxx". Use a recurring (subscription) link for the monthly
  // and yearly plans, and a one-time link for the signup/setup fees and the logo.
  // Test-mode links ("https://buy.stripe.com/test_...") work too, for trying it out first.
  // Leave a value empty ("") and that button asks the visitor to contact you instead.
  payments: {
    websiteMonthly: "",   // Website Creation, $100–$150/mo   (recurring, monthly)
    socialMonthly: "",    // Social Media Maintenance, $100/mo (recurring, monthly)
    adsMonthly: "",       // Advertising, $150/mo              (recurring, monthly)
    bundleMonthly: "",    // Full WAVE Package, $350/mo        (recurring, monthly)
    websiteYearly: "",    // Website Creation, $1,000/yr       (recurring, yearly)
    bundleYearly: "",     // Full WAVE Package, $3,000/yr      (recurring, yearly)
    websiteSignup: "",    // Website Signup, $100              (one-time)
    socialSetup: "",      // Social Media Creation, $350       (one-time)
    logo: ""              // Logo / Rebranding, $250           (one-time)
  },
  stripe: {
    // The login link of Stripe's customer portal (Settings > Billing > Customer portal), e.g.
    // "https://billing.stripe.com/p/login/xxxxxxxx". When it is set, a "Manage subscription"
    // link appears in the footer and on the thank-you page so clients can update their card,
    // download invoices or cancel. Leave it empty to hide that link.
    customerPortalUrl: "",
    // Only if you set up a custom checkout domain in Stripe (e.g. pay.yourdomain.com): list its
    // host name here, like ["pay.example.com"] (no https://, no slashes). Otherwise leave [].
    extraHosts: []
  }
};

(function () {
  "use strict";

  var NAV_BREAKPOINT = 900; // keep in sync with the 900px menu breakpoint in styles.css
  var motionQuery = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  function reducedMotion() { return !!(motionQuery && motionQuery.matches); }
  function scrollBehavior() { return reducedMotion() ? "auto" : "smooth"; }

  // Only accept absolute https:// links; returns the normalised URL or null.
  function safeHttpsUrl(value) {
    try {
      var parsed = new URL(value);
      return parsed.protocol === "https:" ? parsed.href : null;
    } catch (err) {
      return null;
    }
  }

  function isBlank(value) { return value == null || String(value).trim() === ""; }

  // Stripe links are only used when they point at Stripe itself (or at the owner's own custom
  // checkout domain listed in CONFIG.stripe.extraHosts): https only, exact host name match, no
  // user name/password or port. Anything else (http:, javascript:, data:, look-alike hosts such
  // as buy.stripe.com.example.net) is refused. Returns the normalised URL or null.
  var STRIPE = CONFIG.stripe || {};
  // a single host written as a plain string ("pay.example.com") is accepted as a one-item list
  var rawHosts = STRIPE.extraHosts;
  rawHosts = typeof rawHosts === "string" ? [rawHosts] : (Array.isArray(rawHosts) ? rawHosts : []);
  // each entry is reduced to a bare host name ("https://Pay.Example.com/", "//pay.example.com" or
  // "pay.example.com." -> "pay.example.com"); the links themselves are still matched exactly
  var EXTRA_HOSTS = rawHosts.map(function (host) {
    return typeof host === "string" ? host.trim().toLowerCase().replace(/^([a-z]+:)?\/\//, "").replace(/[\/?#].*$/, "").replace(/\.$/, "") : "";
  }).filter(function (host) { return host !== ""; });
  var CHECKOUT_HOSTS = ["buy.stripe.com", "checkout.stripe.com"].concat(EXTRA_HOSTS);
  var PORTAL_HOSTS = ["billing.stripe.com"].concat(EXTRA_HOSTS);

  function stripeUrl(value, hosts) {
    if (typeof value !== "string") return null;
    var parsed;
    try { parsed = new URL(value.trim()); } catch (err) { return null; }
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port) return null;
    return hosts.indexOf(parsed.hostname.toLowerCase()) > -1 ? parsed.href : null;
  }

  // Opens an already-vetted https link in a new tab that gets no access to this page (noopener)
  // and no referrer (noreferrer). If the browser blocks the new tab, the link opens in this tab.
  // Browsers return null for every "noopener" window, whether it opened or was blocked, so null
  // alone can't mean "blocked": when the new tab opens, this page loses focus / is hidden right
  // away; only if it is still visible and focused a moment later was the popup blocked.
  // A Ctrl/Cmd(/Shift)-click opens the tab in the background, so this page keeps focus even
  // though it worked: pass the click event in and modified clicks never fall back.
  function openExternal(url, evt) {
    var modified = !!(evt && (evt.ctrlKey || evt.metaKey || evt.shiftKey));
    var left = false;
    var markLeft = function () { left = true; };
    var stopWatching = function () {
      window.removeEventListener("blur", markLeft);
      window.removeEventListener("pagehide", markLeft);
      document.removeEventListener("visibilitychange", markLeft);
    };
    window.addEventListener("blur", markLeft);
    window.addEventListener("pagehide", markLeft);
    document.addEventListener("visibilitychange", markLeft);
    var opened = null;
    try { opened = window.open(url, "_blank", "noopener,noreferrer"); } catch (err) { opened = null; }
    if (opened || modified) { stopWatching(); return; }
    setTimeout(function () {
      stopWatching();
      var hasFocus = typeof document.hasFocus === "function" ? document.hasFocus() : true;
      if (!left && !document.hidden && hasFocus) window.location.assign(url);
    }, 800);
  }

  /* ------------------------------------------------------------------
     Hero background (wave-bg.js) — mounted per the hero contract
     ------------------------------------------------------------------ */
  var hero = document.getElementById("home");
  var brandLogo = document.querySelector(".brand-logo");
  var breakTimer = 0;
  var heroBroken = false; // the headline sheen plays once per visit, even if the background is re-mounted

  // Visitor's pause choice (WCAG 2.2.2): stops the hero water and every looping CSS animation.
  var MOTION_KEY = "waveDigital.motion";
  var motionPaused = false;
  try { motionPaused = window.localStorage.getItem(MOTION_KEY) === "paused"; } catch (err) { /* storage unavailable */ }

  function onBreak() {
    var first = !heroBroken;
    heroBroken = true;
    if (!first || motionPaused || reducedMotion() || !hero) return;
    hero.classList.remove("is-breaking");
    if (brandLogo) brandLogo.classList.remove("pulse");
    void hero.offsetWidth; // restart the CSS animations
    hero.classList.add("is-breaking");
    if (brandLogo) brandLogo.classList.add("pulse");
    clearTimeout(breakTimer);
    breakTimer = setTimeout(function () {
      hero.classList.remove("is-breaking");
      if (brandLogo) brandLogo.classList.remove("pulse");
    }, 2000);
  }

  var bg = null;
  function mountBackground(replay) {
    if (!hero || !window.WaveBackground) return;
    var opts = {
      logo: hero.querySelector(".hero-art"),
      textEl: hero.querySelector(".hero-inner"),
      onBreak: onBreak
    };
    if (motionPaused) opts.reducedMotion = true; // a composed still frame, whole logo
    if (!replay) opts.intro = false;              // resuming: no second tide-in
    try {
      bg = window.WaveBackground.mount(hero.querySelector(".wave-canvas"), opts);
    } catch (err) {
      bg = null; /* the static CSS backdrop and logo remain */
    }
  }

  var motionToggle = document.getElementById("motionToggle");
  var motionLabel = motionToggle ? motionToggle.querySelector(".motion-label") : null;
  function applyMotionState() {
    document.documentElement.classList.toggle("motion-paused", motionPaused);
    if (!motionToggle) return;
    motionToggle.classList.toggle("is-paused", motionPaused);
    if (motionLabel) motionLabel.textContent = motionPaused ? "Play animation" : "Pause animation";
  }
  applyMotionState();
  mountBackground(true);

  if (motionToggle) {
    motionToggle.hidden = false;
    motionToggle.addEventListener("click", function () {
      motionPaused = !motionPaused;
      try { window.localStorage.setItem(MOTION_KEY, motionPaused ? "paused" : "playing"); } catch (err) { /* storage unavailable */ }
      applyMotionState();
      if (bg) { try { bg.destroy(); } catch (err) { /* ignore */ } bg = null; }
      mountBackground(false);
    });
  }

  /* ------------------------------------------------------------------
     Smooth scrolling for in-page links only (native anchor behaviour and
     focus handling are kept; reduced motion jumps instantly)
     ------------------------------------------------------------------ */
  var smoothTimer = 0;
  document.addEventListener("click", function (e) {
    var link = e.target.closest ? e.target.closest('a[href^="#"]') : null;
    if (!link || reducedMotion() || link.getAttribute("href").length < 2) return;
    document.documentElement.classList.add("smooth-scroll");
    clearTimeout(smoothTimer);
    smoothTimer = setTimeout(function () { document.documentElement.classList.remove("smooth-scroll"); }, 2500);
  }, true);

  /* ------------------------------------------------------------------
     Header: mobile menu + scrolled state
     ------------------------------------------------------------------ */
  var header = document.querySelector(".header");
  var menuButton = document.getElementById("menuToggle");
  var menu = document.getElementById("mobileMenu");

  function isMenuOpen() { return menu.classList.contains("open"); }
  function setMenu(open) {
    menu.classList.toggle("open", open);
    menuButton.classList.toggle("active", open);
    menuButton.setAttribute("aria-expanded", String(open));
    menuButton.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
  }
  function closeMenu() { if (isMenuOpen()) setMenu(false); }

  if (menuButton && menu) {
    menuButton.addEventListener("click", function () { setMenu(!isMenuOpen()); });
    menu.querySelectorAll("a").forEach(function (link) { link.addEventListener("click", closeMenu); });
    document.addEventListener("click", function (e) {
      if (isMenuOpen() && !menu.contains(e.target) && !menuButton.contains(e.target)) closeMenu();
    });
    window.addEventListener("resize", function () { if (window.innerWidth > NAV_BREAKPOINT) closeMenu(); }, { passive: true });
    // keyboard focus leaving the open menu closes it, so the menu never hides the focused control
    document.addEventListener("focusin", function (e) {
      if (isMenuOpen() && !menu.contains(e.target) && !menuButton.contains(e.target)) closeMenu();
    });
  }

  if (header) {
    var onScroll = function () { header.classList.toggle("scrolled", window.scrollY > 8); };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  // while the page scrolls, decorative CSS loops that can't run on the compositor hold still
  var rootEl = document.documentElement, scrollIdle = 0;
  window.addEventListener("scroll", function () {
    if (scrollIdle) clearTimeout(scrollIdle); else rootEl.classList.add("is-scrolling");
    scrollIdle = setTimeout(function () { scrollIdle = 0; rootEl.classList.remove("is-scrolling"); }, 180);
  }, { passive: true });

  /* ------------------------------------------------------------------
     Logo ripple follows the pointer
     ------------------------------------------------------------------ */
  document.querySelectorAll(".brand-logo,.footer-logo").forEach(function (logo) {
    var last = 0;
    logo.addEventListener("pointermove", function (e) {
      var rect = logo.getBoundingClientRect();
      logo.style.setProperty("--ripple-x", (e.clientX - rect.left) + "px");
      logo.style.setProperty("--ripple-y", (e.clientY - rect.top) + "px");
      if (reducedMotion() || motionPaused) return;
      var now = Date.now();
      if (now - last < 650) return;
      last = now;
      logo.classList.remove("rippling");
      void logo.offsetWidth;
      logo.classList.add("rippling");
    });
    logo.addEventListener("animationend", function (e) {
      if (e.animationName === "ripple") logo.classList.remove("rippling");
    });
  });

  /* ------------------------------------------------------------------
     Toast (non-blocking, announced politely to screen readers)
     ------------------------------------------------------------------ */
  var toastBox = document.getElementById("toastBox");
  var toastMsg = document.getElementById("toast");
  var toastClose = document.getElementById("toastClose");
  var mainEl = document.getElementById("main");
  var toastTimer = 0, toastShowTimer = 0, toastSettleTimer = 0;
  var toastTrigger = null; // the control that raised the current notice

  function toastShown() { return !!toastBox && toastBox.classList.contains("show"); }

  // Where the toast sits: its usual spot (under the header) or, when that would cover the control
  // that raised it, the focused element or a button / form field, the other edge of the screen.
  function overlapArea(a, b) {
    var w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    var h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    return w > 0 && h > 0 ? w * h : 0;
  }
  // the toast's box at one spot, without its slide-in offset (a shown toast has no transform)
  function toastRectAt(alt) {
    toastBox.classList.toggle("toast-alt", alt);
    var r = toastBox.getBoundingClientRect();
    var dx = 0, dy = 0;
    try {
      var m = new DOMMatrixReadOnly(getComputedStyle(toastBox).transform);
      dx = m.m41; dy = m.m42;
    } catch (err) { /* no DOMMatrix: the offset is at most 18px */ }
    return { left: r.left - dx, top: r.top - dy, right: r.right - dx, bottom: r.bottom - dy };
  }
  var CONTROLS = "input,select,textarea,button,a[href],[tabindex]:not([tabindex='-1']),[contenteditable]";
  function toastCost(rect) {
    var cost = 0;
    var focused = document.activeElement;
    if (focused === document.body || focused === document.documentElement || focused === mainEl || (focused && toastBox.contains(focused))) focused = null;
    // the control that raised the notice and a focused control must stay clear...
    if (toastTrigger) cost += 1000 * overlapArea(rect, toastTrigger.getBoundingClientRect());
    if (focused) cost += (focused.matches && focused.matches(CONTROLS) ? 1000 : 1) * overlapArea(rect, focused.getBoundingClientRect());
    // ...and, where possible, every other button and form field
    (mainEl || document.body).querySelectorAll("input,select,textarea,button,a.btn").forEach(function (el) {
      cost += overlapArea(rect, el.getBoundingClientRect());
    });
    return cost;
  }
  // scrolls the page so that `el` sits just below the notice (box: the notice's box, if any);
  // measured from the layout (offsetTop), so a scroll-reveal slide still running can't skew it
  function scrollJustBelow(el, box) {
    var limit = box ? box.bottom : (header ? header.getBoundingClientRect().bottom : 0);
    var docTop = 0;
    for (var node = el; node; node = node.offsetParent) docTop += node.offsetTop;
    var top = Math.max(0, docTop - (limit + 14));
    try { window.scrollTo({ top: top, behavior: scrollBehavior() }); } catch (err) { window.scrollTo(0, top); }
  }
  // measure = false: the usual spot (the page is about to scroll; it is checked again once it stops)
  function placeToast(measure) {
    if (!toastBox) return;
    var shown = toastShown();
    var wasAlt = toastBox.classList.contains("toast-alt");
    var useAlt = false;
    // a hidden toast is placed without its slide, so it then slides in from its own edge (top or
    // bottom); a shown one has no transform at either spot, and top / bottom are not animated
    if (!shown) toastBox.style.transition = "none";
    if (measure) {
      var usual = toastCost(toastRectAt(false));
      var other = usual ? toastCost(toastRectAt(true)) : 0;
      // ties keep the current spot, so the notice never hops for nothing
      useAlt = usual > 0 && (wasAlt ? other <= usual : other < usual);
    }
    toastBox.classList.toggle("toast-alt", useAlt);
    if (!shown) {
      void toastBox.offsetWidth; // apply the spot before the transition comes back
      toastBox.style.transition = "";
    }
  }
  // checked again once scrolling / resizing has stopped
  function settleToast() {
    clearTimeout(toastSettleTimer);
    toastSettleTimer = setTimeout(function () { if (toastShown()) placeToast(true); }, 160);
  }

  function hideToast() {
    if (!toastBox) return;
    clearTimeout(toastTimer);
    clearTimeout(toastSettleTimer);
    toastBox.classList.remove("show");
    if (toastClose) toastClose.hidden = true;
    toastTrigger = null;
    toastTimer = setTimeout(function () { toastMsg.textContent = ""; }, 400);
  }
  function scheduleHide(ms) {
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, ms);
  }
  // opts.trigger: the control that raised the notice (it is never covered)
  // opts.onShow(box): runs once the notice is in place, with its box, to scroll the page; the
  //   notice then takes its usual spot and is checked again once the page has settled
  function showToast(message, tone, opts) {
    opts = opts || {};
    if (!toastBox || !toastMsg) { if (opts.onShow) opts.onShow(null); return; }
    clearTimeout(toastTimer);
    clearTimeout(toastShowTimer);
    toastBox.setAttribute("data-tone", tone || "info");
    toastMsg.textContent = "";
    // a short delay lets assistive tech register the change even for a repeated message
    toastShowTimer = setTimeout(function () {
      toastTrigger = opts.trigger || null;
      toastMsg.textContent = message;
      if (toastClose) toastClose.hidden = false;
      toastBox.classList.remove("toast-alt"); // a new notice starts from the usual spot
      placeToast(!opts.onShow);
      if (opts.onShow) opts.onShow(toastRectAt(toastBox.classList.contains("toast-alt")));
      toastBox.classList.add("show");
      scheduleHide(7000);
      settleToast();
    }, 60);
  }
  if (toastBox) {
    if (toastClose) toastClose.addEventListener("click", hideToast);
    toastBox.addEventListener("pointerenter", function () { clearTimeout(toastTimer); });
    toastBox.addEventListener("pointerleave", function () { if (toastShown()) scheduleHide(3500); });
    toastBox.addEventListener("focusin", function () { clearTimeout(toastTimer); });
    window.addEventListener("scroll", function () { if (toastShown()) settleToast(); }, { passive: true });
    window.addEventListener("resize", function () { if (toastShown()) settleToast(); }, { passive: true });
    // keyboard focus moving under the notice moves the notice; once focus leaves the trigger for
    // another control, protect the focused control instead (it is protected again if focus returns)
    document.addEventListener("focusin", function (e) {
      if (!toastShown() || toastBox.contains(e.target)) return;
      if (e.target !== toastTrigger && e.target.matches && e.target.matches(CONTROLS)) toastTrigger = null;
      placeToast(true);
    });
  }

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (menu && isMenuOpen()) {
      var focusWasInMenu = menu.contains(document.activeElement);
      closeMenu();
      if (focusWasInMenu && menuButton) menuButton.focus();
    }
    if (toastBox && toastBox.classList.contains("show")) hideToast();
  });

  /* ------------------------------------------------------------------
     Payments — Stripe Payment Links (Stripe's hosted checkout).
     Card details are never collected on this website, and no Stripe
     secret/restricted key (sk_... / rk_...) belongs anywhere in it.
     ------------------------------------------------------------------ */
  var contact = document.getElementById("contact");
  var contactTitle = document.getElementById("contact-title");
  var serviceSelect = document.getElementById("service");
  // pre-select the matching service in the contact form when checkout isn't set up yet
  var PAYMENT_SERVICE = {
    websiteMonthly: "Website Creation", websiteYearly: "Website Creation", websiteSignup: "Website Creation",
    socialMonthly: "Social Media", socialSetup: "Social Media",
    adsMonthly: "Advertising",
    bundleMonthly: "Full WAVE Package", bundleYearly: "Full WAVE Package",
    logo: "Logo / Rebranding"
  };

  var paymentLinks = CONFIG.payments || {};
  document.querySelectorAll(".pay").forEach(function (button) {
    button.addEventListener("click", function (e) {
      var key = button.getAttribute("data-payment");
      var link = Object.prototype.hasOwnProperty.call(paymentLinks, key) ? paymentLinks[key] : "";
      if (isBlank(link)) {
        if (serviceSelect && PAYMENT_SERVICE[key]) serviceSelect.value = PAYMENT_SERVICE[key];
        // go to the contact section, its content (heading / form) starting just below the notice
        var contactStart = contact ? contact.querySelector(".contact-grid") || contact : null;
        showToast("Online checkout is being set up. Please contact us to arrange payment for this service.", "info", {
          trigger: button,
          onShow: contactStart ? function (box) { scrollJustBelow(contactStart, box); } : null
        });
        // move keyboard / screen-reader focus along with the page (the heading, so no on-screen keyboard pops up)
        if (contactTitle) { try { contactTitle.focus({ preventScroll: true }); } catch (err) { contactTitle.focus(); } }
        return;
      }
      var checkout = stripeUrl(link, CHECKOUT_HOSTS);
      if (!checkout) {
        showToast("The checkout link needs to be a valid Stripe HTTPS link.", "error", { trigger: button });
        if (window.console && console.warn) console.warn("WAVE Digital: CONFIG.payments." + key + " is not a https://buy.stripe.com/ or https://checkout.stripe.com/ link (or a host listed in CONFIG.stripe.extraHosts), so it was not opened.");
        return;
      }
      openExternal(checkout, e);
    });
  });

  /* ------------------------------------------------------------------
     "Manage subscription" — Stripe customer portal (hidden until set)
     ------------------------------------------------------------------ */
  var portalUrl = isBlank(STRIPE.customerPortalUrl) ? null : stripeUrl(STRIPE.customerPortalUrl, PORTAL_HOSTS);
  // a hint for the site owner (only shown when a link was pasted but can't be used)
  if (!portalUrl && !isBlank(STRIPE.customerPortalUrl) && window.console && console.warn) {
    console.warn("WAVE Digital: CONFIG.stripe.customerPortalUrl is not a https://billing.stripe.com/ link (or a host listed in CONFIG.stripe.extraHosts), so the \"Manage subscription\" link stays hidden.");
  }
  document.querySelectorAll("[data-portal-link]").forEach(function (link) {
    if (!portalUrl) { link.hidden = true; return; }
    link.href = portalUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.hidden = false;
  });

  /* ------------------------------------------------------------------
     Booking (Google Calendar appointment schedule / Calendly)
     ------------------------------------------------------------------ */
  var booking = document.getElementById("scheduleLink");
  var form = document.getElementById("contactForm");
  if (booking) {
    var bookingUnset = isBlank(CONFIG.bookingUrl);
    var bookingHref = bookingUnset ? null : safeHttpsUrl(String(CONFIG.bookingUrl).trim());
    if (bookingHref) {
      // real link for middle-click / "open in new tab"
      booking.href = bookingHref;
      booking.target = "_blank";
      booking.rel = "noopener noreferrer";
    }
    // the contact form is "below" on the home page; the thank-you page has none, so point there
    var formHint = form ? "below" : "using the contact form on our home page";
    booking.addEventListener("click", function (e) {
      // Ctrl/Cmd/Shift-click on a real link: let the browser open it natively (new / background tab)
      if (bookingHref && (e.ctrlKey || e.metaKey || e.shiftKey)) return;
      e.preventDefault();
      if (bookingUnset) {
        // one-column layout (form under this button): bring the form up, keeping this button in
        // view just below the notice instead of half under it
        var bringFormUp = form && window.innerWidth <= NAV_BREAKPOINT;
        showToast("Online scheduling is being set up. Please send us a message " + formHint + ".", "info", {
          trigger: booking,
          onShow: bringFormUp ? function (box) { scrollJustBelow(booking, box); } : null
        });
        return;
      }
      if (!bookingHref) {
        showToast("Booking link is invalid. Please contact us " + (form ? "using the form" : formHint) + ".", "error", { trigger: booking });
        return;
      }
      openExternal(bookingHref);
    });
  }

  /* ------------------------------------------------------------------
     Contact form (Formspree)
     ------------------------------------------------------------------ */
  var formMessage = document.getElementById("formMessage");
  var submit = document.getElementById("submitBtn");
  var submitLabel = submit ? submit.querySelector(".btn-label") : null;

  function setMessage(text, state) {
    if (!formMessage) return;
    formMessage.textContent = text;
    if (state && text) formMessage.setAttribute("data-state", state);
    else formMessage.removeAttribute("data-state");
  }
  // The button is never `disabled` while sending: that would drop keyboard focus to <body>.
  var sending = false;
  function setSending(on) {
    sending = on;
    if (!submit) return;
    submit.setAttribute("aria-disabled", String(on));
    submit.classList.toggle("is-sending", on);
    submit.setAttribute("aria-busy", String(on));
    if (submitLabel) submitLabel.textContent = on ? "Sending…" : "Send Inquiry";
  }

  // Formspree explains a rejected submission as { errors: [{ field, message }] }; returns a readable
  // sentence (e.g. "Email should be an email.") and flags the fields it names, or "" if none.
  async function formspreeProblem(response) {
    var data = null;
    try { data = await response.json(); } catch (err) { return ""; }
    if (!data || !Array.isArray(data.errors)) return "";
    var parts = data.errors.map(function (problem) {
      if (!problem || !problem.message) return "";
      var field = problem.field && form.elements[problem.field];
      if (field && field.setAttribute) { field.classList.add("touched"); field.setAttribute("aria-invalid", "true"); }
      var label = field && field.labels && field.labels[0] ? field.labels[0].textContent.trim() : "";
      return (label ? label + " " : "") + problem.message;
    }).filter(Boolean);
    return parts.length ? parts.join("; ") + "." : "";
  }

  if (form) {
    var fields = form.querySelectorAll("input:not([type=hidden]):not([name=_gotcha]),select,textarea");
    var markField = function (field) {
      field.classList.add("touched");
      // validity.valid (not checkValidity) so no extra "invalid" events are fired
      if (field.willValidate) field.setAttribute("aria-invalid", String(!field.validity.valid));
    };
    fields.forEach(function (field) {
      field.addEventListener("blur", function () { if (field.value !== "" || field.classList.contains("touched")) markField(field); });
      field.addEventListener("input", function () { if (field.classList.contains("touched")) markField(field); });
      // fired by the browser's own validation (reportValidity / native submit)
      field.addEventListener("invalid", function () { markField(field); });
    });

    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      if (sending) return;
      if (!form.reportValidity()) return;
      if (!CONFIG.formspreeEndpoint) {
        setMessage("The contact form is not connected yet. Please configure the Formspree endpoint before accepting inquiries.", "info");
        return;
      }
      var endpoint = safeHttpsUrl(CONFIG.formspreeEndpoint);
      if (!endpoint) {
        setMessage("Message could not be delivered. Please try again later.", "error");
        return;
      }
      setSending(true);
      setMessage("");
      try {
        var response = await fetch(endpoint, {
          method: "POST",
          headers: { "Accept": "application/json" },
          body: new FormData(form)
        });
        if (!response.ok) {
          var problem = await formspreeProblem(response);
          setMessage(problem ? "Message could not be delivered. " + problem : "Message could not be delivered. Please try again later.", "error");
          return;
        }
        setMessage("Thank you! Your inquiry was sent successfully.", "success");
        form.reset();
        fields.forEach(function (field) { field.classList.remove("touched"); field.removeAttribute("aria-invalid"); });
      } catch (err) {
        setMessage("Message could not be delivered. Please try again later.", "error");
      } finally {
        setSending(false);
      }
    });
  }

  /* ------------------------------------------------------------------
     Scroll reveal — content stays visible if this never runs
     ------------------------------------------------------------------ */
  if (!reducedMotion() && document.querySelectorAll) {
    var pending = [];
    var revealFrame = 0;
    var reveal = function (el) {
      el.classList.add("is-visible");
      // hand the element back to its own hover/transition styles afterwards
      setTimeout(function () {
        el.classList.remove("reveal", "is-visible");
        el.style.removeProperty("--rd");
      }, 1100);
    };
    // Reveal everything whose top has reached the lower part of the viewport, including
    // anything scrolled past quickly (e.g. a jump to #contact), so nothing stays hidden.
    var checkReveals = function () {
      revealFrame = 0;
      var limit = (window.innerHeight || document.documentElement.clientHeight) * 0.9;
      pending = pending.filter(function (el) {
        if (el.getBoundingClientRect().top < limit) { if (revealIO) revealIO.unobserve(el); reveal(el); return false; }
        return true;
      });
      if (!pending.length) {
        window.removeEventListener("scroll", queueReveal);
        window.removeEventListener("resize", queueReveal);
      }
    };
    var queueReveal = function () { if (!revealFrame) revealFrame = requestAnimationFrame(checkReveals); };
    // primary trigger: IntersectionObserver; the scroll check above is the safety net
    var revealIO = "IntersectionObserver" in window ? new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        revealIO.unobserve(entry.target);
        var i = pending.indexOf(entry.target);
        if (i > -1) { pending.splice(i, 1); reveal(entry.target); }
      });
    }, { rootMargin: "0px 0px -10% 0px", threshold: 0 }) : null;

    var viewH = window.innerHeight || document.documentElement.clientHeight;
    document.querySelectorAll("[data-reveal]").forEach(function (el) {
      // anything already on screen stays as-is (no flash)
      if (el.getBoundingClientRect().top < viewH * 0.9) return;
      var siblings = el.parentElement ? Array.prototype.filter.call(el.parentElement.children, function (c) { return c.hasAttribute("data-reveal"); }) : [];
      var index = siblings.indexOf(el);
      el.style.setProperty("--rd", (Math.max(0, index) % 4) * 0.08 + "s");
      el.classList.add("reveal");
      pending.push(el);
      if (revealIO) revealIO.observe(el);
    });
    if (pending.length) {
      window.addEventListener("scroll", queueReveal, { passive: true });
      window.addEventListener("resize", queueReveal, { passive: true });
    }
  }

  /* ------------------------------------------------------------------
     Ambient animations (wave dividers, featured glow) only run on screen
     ------------------------------------------------------------------ */
  if ("IntersectionObserver" in window) {
    var ambientIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) { entry.target.classList.toggle("in-view", entry.isIntersecting); });
    }, { rootMargin: "80px 0px" });
    document.querySelectorAll(".wave-divider,.price-card.featured").forEach(function (el) { ambientIO.observe(el); });
  }

  /* ------------------------------------------------------------------
     Active nav link for the section in view
     ------------------------------------------------------------------ */
  if ("IntersectionObserver" in window && menu) {
    var navLinks = Array.prototype.filter.call(menu.querySelectorAll('a[href^="#"]'), function (a) { return !a.classList.contains("nav-cta"); });
    var setActive = function (id) {
      navLinks.forEach(function (a) {
        if (a.getAttribute("href") === "#" + id) a.setAttribute("aria-current", "true");
        else a.removeAttribute("aria-current");
      });
    };
    var sectionIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) { if (entry.isIntersecting) setActive(entry.target.id); });
    }, { rootMargin: "-42% 0px -56% 0px", threshold: 0 });
    document.querySelectorAll("main section[id]").forEach(function (section) { sectionIO.observe(section); });
  }
})();
