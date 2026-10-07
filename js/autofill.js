// Auto-fill login credentials from URL fragment: #u=<username>&p=<password>
var AF = window.AF || {};
AF.u = null; AF.p = null;
if (location.hash) {
  var h = location.hash.replace(/^#/, '');
  if (h.indexOf('=') !== -1) {
    var params = new URLSearchParams(h);
    var u = params.get('u');
    var p = params.get('p');
    if (u && p) {
      AF.u = u; AF.p = p;
      history.replaceState(null, '', location.pathname + location.search);
      var tries = 0, maxTries = 100;
      var pollFill = function() {
        var userEl = document.getElementById('login-username');
        var passEl = document.getElementById('login-password');
        if (userEl && passEl) {
          userEl.value = AF.u;
          passEl.value = AF.p;
          userEl.dispatchEvent(new Event('input', { bubbles: true }));
          passEl.dispatchEvent(new Event('input', { bubbles: true }));
          AF.u = AF.p = null;
          var hint = document.createElement('div');
          hint.id = 'autofill-hint';
          hint.dir = 'rtl';
          hint.textContent = 'یوزر نیم اور پاس ورڈ خود بخود بھر دیے گئے ہیں۔ بس لاگ ان دبائیں';
          hint.style.cssText = 'background:#e8f5e9;border:1px solid #a5d6a7;border-radius:6px;padding:8px 12px;margin-bottom:12px;font-size:.875rem;color:#1b5e20;text-align:center;';
          var btn = document.getElementById('login-btn');
          if (btn && btn.parentNode) btn.parentNode.insertBefore(hint, btn);
          var style = document.createElement('style');
          style.textContent = '@keyframes af-pulse{0%,100%{box-shadow:0 0 0 0 rgba(46,125,50,.5)}60%{box-shadow:0 0 0 10px rgba(46,125,50,0)}}#login-btn:not(:disabled){animation:af-pulse 1.1s ease-in-out 4;background:#1b5e20!important;border-color:#1b5e20!important;}';
          document.head.appendChild(style);
        } else if (++tries < maxTries) {
          setTimeout(pollFill, 100);
        }
      };
      pollFill();
    }
  }
}
window.AF = AF;
