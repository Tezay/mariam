// Reloads the TV display every five minutes while its application has not started, so a
// browser too old to run it still shows the menu the server rendered, kept current.
setTimeout(function () {
  if (!window.__mariamTv) window.location.reload();
}, 300000);
