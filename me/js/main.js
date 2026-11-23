/* WAVE Portal start-up: handle links from emails, then render the current page. */
(function () {
  'use strict';
  var W = window.W;
  W.route('/', 'any', function () { W.go(W.home()); });
  W.consumeAuthRedirect().then(function (r) {
    if (r && r.error) W.pendingAuthError = r.error;
    window.addEventListener('hashchange', W.render);
    return W.render();
  });
})();
