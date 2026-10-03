// Loaded as a blocking script before the first paint, so dark mode never flashes. It lives
// outside index.html so the Content-Security-Policy can allow scripts from 'self' only.
(function () {
  try {
    var t = localStorage.getItem('mariam-theme') || 'system';
    var dark =
      t === 'dark' ||
      (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (dark) document.documentElement.classList.add('dark');
  } catch (e) {}
})();
