// resources/script/pageload.js
// 全站页面过渡：防闪白 + 揭幕 + 淡出
// localStorage.pageTransition = 'off' 时全部禁用
(function () {
  'use strict';

  var KEY        = '__pt';
  var TOGGLE_KEY = 'pageTransition';

  // ⚠️ 颜色与 styles.css 的 --content-bg 一致
  var BG_LIGHT = '#f0f2f5';
  var BG_DARK  = '#0d1117';

  var COVER_MS  = 380;
  var REVEAL_MS = 500;

  function isEnabled() {
    try { return localStorage.getItem(TOGGLE_KEY) !== 'off'; } catch (e) { return true; }
  }

  function themeBg() {
    try { return localStorage.getItem('theme') === 'dark' ? BG_DARK : BG_LIGHT; }
    catch (e) { return BG_LIGHT; }
  }

  function makeVeil(startOpen) {
    var v = document.createElement('div');
    v.id = '__pt-veil';
    v.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:2147483647',
      'pointer-events:none',
      'background:' + themeBg(),
      'clip-path:circle(' + (startOpen ? '160%' : '0%') + ' at 50% 50%)',
      'will-change:clip-path'
    ].join(';');
    document.documentElement.appendChild(v);
    return v;
  }

  function playReveal() {
    var v = makeVeil(true);
    void v.offsetWidth;
    requestAnimationFrame(function () {
      v.style.transition = 'clip-path ' + REVEAL_MS + 'ms cubic-bezier(.4,0,.2,1)';
      v.style.clipPath = 'circle(0% at 50% 50%)';
      setTimeout(function () {
        v.remove();
        // 只清 inline；CSS 兜底还在
        document.documentElement.style.background = '';
      }, REVEAL_MS + 60);
    });
  }

  function playCover(url, x, y) {
    var v = makeVeil(false);
    if (x != null) v.style.clipPath = 'circle(0% at ' + x + 'px ' + y + 'px)';
    void v.offsetWidth;
    requestAnimationFrame(function () {
      v.style.transition = 'clip-path ' + COVER_MS + 'ms cubic-bezier(.4,0,.2,1)';
      v.style.clipPath = 'circle(160% at ' +
        (x != null ? x + 'px ' + y + 'px' : '50% 50%') + ')';
      setTimeout(function () {
        try { sessionStorage.setItem(KEY, 'in'); } catch (e) {}
        window.location.href = url;
      }, COVER_MS + 20);
    });
  }

  function installLinkInterceptor() {
    document.addEventListener('click', function (e) {
      if (!isEnabled()) return;
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      var a = e.target.closest && e.target.closest('a');
      if (!a) return;

      var href = a.getAttribute('href');
      if (!href) return;
      if (href.startsWith('#') ||
          href.startsWith('javascript:') ||
          href.startsWith('mailto:') ||
          href.startsWith('tel:') ||
          a.target === '_blank' ||
          a.hasAttribute('download') ||
          a.dataset.noTransition === '1') return;

      var url;
      try { url = new URL(href, location.href); } catch (err) { return; }
      if (url.host !== location.host) return;
      if (url.pathname === location.pathname && url.search === location.search) return;

      e.preventDefault();
      playCover(url.pathname + url.search + url.hash, e.clientX, e.clientY);
    }, true);
  }

  function onReady() {
    // ⭐ 关闭状态：清理一切残留，不播任何动画
    if (!isEnabled()) {
      try { sessionStorage.removeItem(KEY); } catch (e) {}
      document.documentElement.style.background = '';
      installLinkInterceptor();
      return;
    }

    var came = false;
    try {
      came = sessionStorage.getItem(KEY) === 'in';
      if (came) sessionStorage.removeItem(KEY);
    } catch (e) {}

    if (came) playReveal();
    installLinkInterceptor();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady);
  } else {
    onReady();
  }

  // ── 对外 API ──
  window.navigate = function (url) {
    if (!isEnabled()) { window.location.href = url; return; }
    playCover(url);
  };

  // ⭐ 运行时开关
  window.setPageTransition = function (enable) {
    try { localStorage.setItem(TOGGLE_KEY, enable ? 'on' : 'off'); } catch (e) {}
    if (!enable) {
      try { sessionStorage.removeItem(KEY); } catch (e) {}
      document.documentElement.style.background = '';
    }
  };

  window.isPageTransitionEnabled = isEnabled;
})();
