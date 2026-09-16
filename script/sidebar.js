// sidebar.js 末尾，IIFE 之外
(function () {
  const prefetched = new Set();
  let hoverTimer = null;

  function prefetch(url) {
    if (prefetched.has(url)) return;
    prefetched.add(url);
    fetch(url, { priority: 'low' }).catch(() => {});
  }

  document.addEventListener('mouseover', (e) => {
    const a = e.target.closest('a');
    if (!a) return;
    const href = a.getAttribute('href');
    if (!href) return;
    if (a.target && a.target !== '_self') return;
    if (a.hasAttribute('download')) return;
    let url;
    try { url = new URL(href, location.href); } catch { return; }
    if (url.origin !== location.origin) return;
    if (url.pathname === location.pathname) return;
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => prefetch(url.href), 100);
  });

  document.addEventListener('mouseout', () => clearTimeout(hoverTimer));

  document.addEventListener('touchstart', (e) => {
    const a = e.target.closest('a');
    if (!a) return;
    try {
      const url = new URL(a.href, location.href);
      if (url.origin === location.origin) prefetch(url.href);
    } catch {}
  }, { passive: true });
})();
