// Chrome makes its install offer once the manifest checks out, often before React hydrates
// and PwaInstallProvider listens: the offer waits here.
window.addEventListener('beforeinstallprompt', function (event) {
  event.preventDefault();
  window.__installPrompt = event;
});
window.addEventListener('appinstalled', function () {
  window.__installPrompt = null;
});
