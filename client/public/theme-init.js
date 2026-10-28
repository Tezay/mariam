// Loaded as a blocking script before the first paint, so dark mode never flashes. It lives
// outside index.html so the Content-Security-Policy can allow scripts from 'self' only.
// The dashboard keeps its saved choice, the public pages follow the system, the TV stays light.
(function () {
  try {
    var path = location.pathname;
    var dashboard = /^\/(admin|org|login|activate|reset-password|notifications|unsubscribe)(\/|$)/;
    var tv = /^\/([^/]+\/)?tv\/?$/;
    var system = window.matchMedia('(prefers-color-scheme: dark)');
    var root = document.documentElement;
    if (dashboard.test(path)) {
      var t = localStorage.getItem('mariam-theme') || 'system';
      if (t === 'dark' || (t === 'system' && system.matches)) root.classList.add('dark');
    } else if (!tv.test(path)) {
      if (system.matches) root.classList.add('dark');
      system.addEventListener('change', function (event) {
        if (!dashboard.test(location.pathname)) root.classList.toggle('dark', event.matches);
      });
    }
  } catch (e) {}
})();
