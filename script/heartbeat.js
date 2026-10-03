// resources/script/heartbeat.js
// 实时在线状态上报：用户有活动时，每 N 分钟向服务器打一次卡
(function () {
  'use strict';

  // ⭐ 可调整参数（也可从 window.__HB_CONFIG__ 覆盖）
  const CFG = Object.assign({
    intervalMs:   5 * 60 * 1000,   // 每 5 分钟上报一次
    activityMs:   60 * 1000,       // 60 秒内有活动才算"活跃"
    minMovePx:    5,               // 鼠标移动超过 5px 才算
    initialDelay: 5000,            // 页面加载 5 秒后首次上报
  }, window.__HB_CONFIG__ || {});

  let lastActivityAt = Date.now();
  let lastMouseX = null, lastMouseY = null;

  function markActivity() { lastActivityAt = Date.now(); }
  function hasRecentActivity() { return Date.now() - lastActivityAt < CFG.activityMs; }

  // 鼠标移动（带阈值）
  document.addEventListener('mousemove', (e) => {
    if (lastMouseX === null) {
      lastMouseX = e.clientX; lastMouseY = e.clientY;
      markActivity();
      return;
    }
    if (Math.abs(e.clientX - lastMouseX) > CFG.minMovePx ||
        Math.abs(e.clientY - lastMouseY) > CFG.minMovePx) {
      lastMouseX = e.clientX; lastMouseY = e.clientY;
      markActivity();
    }
  }, { passive: true });

  // 其他活动
  ['keydown', 'click', 'touchstart', 'scroll', 'wheel'].forEach(evt =>
    document.addEventListener(evt, markActivity, { passive: true }));

  // 从后台切回前台
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') markActivity();
  });

  async function tick() {
    if (!hasRecentActivity()) return;                 // 没活动 → 不发
    const token = localStorage.getItem('auth_token');
    if (!token) return;                               // 没登录 → 不发
    try {
      await fetch('/api/heartbeat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token,
        },
      });
    } catch (e) { /* 静默 */ }
  }

  // 启动
  setTimeout(tick, CFG.initialDelay);
  setInterval(tick, CFG.intervalMs);

  // 对外暴露（调试用）
  window.__heartbeat = { tick, markActivity, getLastActivity: () => lastActivityAt };
})();
