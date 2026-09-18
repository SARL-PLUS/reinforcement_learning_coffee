// Runs before first paint so a stored theme choice never flashes.
try {
  var t = localStorage.getItem('rlc-theme');
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
} catch (e) { /* storage blocked: follow the system setting */ }
