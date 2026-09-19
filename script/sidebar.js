// sidebar.js
// 全局開關：hover 預取。true = 啟用，false = 停用
window.__ENABLE_HOVER_PREFETCH = false;//
(function() {
  console.log('sidebar.js executing...');
  const sidebar = document.getElementById('sidebarContainer');
  if (!sidebar) {
    console.warn('sidebarContainer not found');
    return;
  }

  const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  const isRoot  = user && user.role === 'root';
  const isAdmin = user && (user.role === 'admin' || user.role === 'root');
  const currentUser = getCurrentUser();
  const ownSubmissionsUrl = currentUser
    ? `/submissions/user/${encodeURIComponent(currentUser.username)}`
    : '/submissions';

  // ---- 管理員共用項目（admin + root）----
  const adminMenuCommon = `
    <li><a href="/admin/problems" class="sidebar-link require-login" data-page="admin-problems"><i class="fa-solid fa-pen-to-square fa-fw"></i> Manage Problems</a></li>
    <li><a href="/admin/submissions" class="sidebar-link require-login" data-page="admin-submissions"><i class="fa-solid fa-pen-to-square fa-fw"></i> Manage Submissions</a></li>
    <li><a href="/admin/users" class="sidebar-link require-login" data-page="admin-users"><i class="fa-solid fa-users-gear fa-fw"></i> Manage Users</a></li>
    <li><a href="/admin/updates" class="sidebar-link require-login" data-page="admin-updates"><i class="fa-solid fa-bullhorn fa-fw"></i> Manage Updates</a></li>
    <li><a href="/admin/contests" class="sidebar-link require-login" data-page="admin-contests"><i class="fa-solid fa-pen-to-square fa-fw"></i> Manage Contests</a></li>
    <li><a href="/admin/reports" class="sidebar-link require-login" data-page="admin-reports"><i class="fa-solid fa-pen-to-square fa-fw"></i> Bug Reports</a></li>
    <li><a href="/admin/log" class="sidebar-link require-login" data-page="admin-log"><i class="fa-solid fa-scroll fa-fw"></i> Server Log</a></li>
  `;

  // ---- root 專屬 ----
  const adminMenuRootOnly = isRoot ? `
    <li><a href="/admin/sql" class="sidebar-link require-login" data-page="admin-sql"><i class="fa-solid fa-terminal fa-fw"></i> SQL Terminal</a></li>
    <li><a href="/admin/cmd" class="sidebar-link require-login" data-page="admin-cmd"><i class="fa-solid fa-code fa-fw"></i> CMD</a></li>
  ` : '';

  const sidebarHTML = `
    <nav class="sidebar-nav">
      <ul>
        <li><a href="/problems" class="sidebar-link require-login" data-page="problems"><i class="fa-solid fa-list-check fa-fw"></i> Problems</a></li>
        <li><a href="${ownSubmissionsUrl}" class="sidebar-link require-login" data-page="submissions"><i class="fa-solid fa-paper-plane fa-fw"></i> Your Submissions</a></li>
        <li><a href="/submissions" class="sidebar-link require-login" data-page="all-submissions"><i class="fa-solid fa-pen-to-square fa-fw"></i> All Submissions</a></li>
        <li><a href="/leaderboard" class="sidebar-link require-login" data-page="ranklist"><i class="fa-solid fa-ranking-star fa-fw"></i> Leaderboard</a></li>
        <li><a href="/resources" class="sidebar-link require-login" data-page="resources"><i class="fa-solid fa-folder-open fa-fw"></i> Resources</a></li>
        <li><a href="/contest" class="sidebar-link require-login" data-page="contest"><i class="fa-solid fa-trophy fa-fw"></i> Contests</a></li>
        ${isAdmin ? `
          <li><hr style="margin:8px 0; border-color:rgba(255,255,255,0.2);"></li>
          ${adminMenuCommon}
          ${adminMenuRootOnly}
          <li><hr style="margin:8px 0; border-color:rgba(255,255,255,0.2);"></li>
        ` : ''}
        <li><a href="/status" class="sidebar-link require-login" data-page="status"><i class="fa-solid fa-heart-pulse fa-fw"></i> Judge Status</a></li>
        <li><a href="/settings" class="sidebar-link require-login" data-page="template"><i class="fa-solid fa-gear fa-fw"></i> Settings</a></li>
        <li><a href="/credits" class="sidebar-link" data-page="credits"><i class="fa-solid fa-heart fa-fw"></i> Credits</a></li>
        <li><a href="/guide" class="sidebar-link" data-page="guide"><i class="fa-solid fa-book-open fa-fw"></i> Guides</a></li>
      </ul>
    </nav>
  `;

  sidebar.innerHTML = sidebarHTML;

  const isWide = window.innerWidth > 768;
  let isOpen;

  if (isWide) {
    isOpen = true;
  } else {
    const saved = localStorage.getItem('sidebarOpen');
    isOpen = saved === null ? false : saved === 'true';
  }

  if (!isWide) {
    sidebar.style.position = 'fixed';
    sidebar.style.top = 'var(--topbar-height)';
    sidebar.style.left = '0';
    sidebar.style.width = '100%';
    sidebar.style.height = 'calc(100vh - var(--topbar-height))';
    sidebar.style.transform = 'translateY(-100%)';
    sidebar.style.transition = 'transform 0.3s ease';
    sidebar.style.overflowY = 'auto';
    sidebar.style.zIndex = '9999';
    sidebar.style.display = isOpen ? 'block' : 'none';
  }

  sidebar.style.transition = 'none';
  if (isOpen) {
    sidebar.classList.add('open');
    document.body.classList.remove('sidebar-closed');
    if (!isWide) {
      sidebar.style.transform = 'translateY(0)';
      sidebar.style.display = 'block';
    }
  } else {
    sidebar.classList.remove('open');
    document.body.classList.add('sidebar-closed');
    if (!isWide) {
      sidebar.style.transform = 'translateY(-100%)';
      sidebar.style.display = 'none';
    }
  }
  void sidebar.offsetHeight;
  sidebar.style.transition = '';

  function saveSidebarState(open) {
    if (!isWide) localStorage.setItem('sidebarOpen', open);
  }

  function toggleSidebar() {
    if (isWide) return;
    const nowOpen = sidebar.classList.contains('open');
    if (nowOpen) {
      sidebar.classList.remove('open');
      sidebar.style.transform = 'translateY(-100%)';
      document.body.classList.add('sidebar-closed');
      const onTransitionEnd = () => {
        sidebar.removeEventListener('transitionend', onTransitionEnd);
        if (!sidebar.classList.contains('open')) sidebar.style.display = 'none';
      };
      sidebar.addEventListener('transitionend', onTransitionEnd);
      saveSidebarState(false);
    } else {
      sidebar.style.display = 'block';
      void sidebar.offsetHeight;
      sidebar.classList.add('open');
      sidebar.style.transform = 'translateY(0)';
      document.body.classList.remove('sidebar-closed');
      saveSidebarState(true);
    }
  }
  window.toggleSidebar = toggleSidebar;

  const toggleBtn = document.getElementById('sidebarToggle');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', toggleSidebar);
    if (isWide) toggleBtn.style.display = 'none';
  }

  let currentIsWide = isWide;
  window.addEventListener('resize', () => {
    const nowWide = window.innerWidth > 768;
    if (nowWide !== currentIsWide) {
      currentIsWide = nowWide;
      if (nowWide) {
        sidebar.style.position = '';
        sidebar.style.top = '';
        sidebar.style.left = '';
        sidebar.style.width = '';
        sidebar.style.height = '';
        sidebar.style.transform = '';
        sidebar.style.transition = '';
        sidebar.style.overflowY = '';
        sidebar.style.zIndex = '';
        sidebar.style.display = '';
        sidebar.classList.add('open');
        document.body.classList.remove('sidebar-closed');
        if (toggleBtn) toggleBtn.style.display = 'none';
      } else {
        sidebar.style.position = 'fixed';
        sidebar.style.top = 'var(--topbar-height)';
        sidebar.style.left = '0';
        sidebar.style.width = '100%';
        sidebar.style.height = 'calc(100vh - var(--topbar-height))';
        sidebar.style.transform = 'translateY(-100%)';
        sidebar.style.transition = 'transform 0.3s ease';
        sidebar.style.overflowY = 'auto';
        sidebar.style.zIndex = '9999';
        const saved = localStorage.getItem('sidebarOpen');
        const shouldOpen = saved === null ? false : saved === 'true';
        if (shouldOpen) {
          sidebar.style.display = 'block';
          sidebar.classList.add('open');
          sidebar.style.transform = 'translateY(0)';
          document.body.classList.remove('sidebar-closed');
        } else {
          sidebar.style.display = 'none';
          sidebar.classList.remove('open');
          sidebar.style.transform = 'translateY(-100%)';
          document.body.classList.add('sidebar-closed');
        }
        if (toggleBtn) toggleBtn.style.display = '';
      }
    }
  });

  // ---- Active 高亮（對應 vercel.json 路徑） ----
  const path = window.location.pathname;
  const links = sidebar.querySelectorAll('.sidebar-link');
  links.forEach(link => {
    const page = link.getAttribute('data-page');
    // 注意：/admin/submissions 必須放在 /submissions 之前判斷，否則會被誤標
    if (page === 'problems' && path.startsWith('/problems')) link.classList.add('active');
    else if (page === 'admin-problems' && path.startsWith('/admin/problems')) link.classList.add('active');
    else if (page === 'admin-submissions' && path.startsWith('/admin/submissions')) link.classList.add('active');
    else if (page === 'admin-users' && path.startsWith('/admin/users')) link.classList.add('active');
    else if (page === 'admin-updates' && path.startsWith('/admin/updates')) link.classList.add('active');
    else if (page === 'admin-contests' && path.startsWith('/admin/contests')) link.classList.add('active');
    else if (page === 'admin-reports' && path.startsWith('/admin/reports')) link.classList.add('active');
    else if (page === 'admin-log' && path.startsWith('/admin/log')) link.classList.add('active');
    else if (page === 'admin-sql' && path.startsWith('/admin/sql')) link.classList.add('active');
    else if (page === 'admin-cmd' && path.startsWith('/admin/cmd')) link.classList.add('active');
    else if (page === 'resources' && path.startsWith('/resources')) link.classList.add('active');
    else if (page === 'submissions' && (path.startsWith('/submissions/user') || path === '/submissions')) link.classList.add('active');
    else if (page === 'all-submissions' && path === '/submissions') link.classList.add('active');
    else if (page === 'ranklist' && path.startsWith('/leaderboard')) link.classList.add('active');
    else if (page === 'template' && path.startsWith('/settings')) link.classList.add('active');
    else if (page === 'credits' && path.startsWith('/credits')) link.classList.add('active');
    else if (page === 'contest' && path.startsWith('/contest')) link.classList.add('active');
    else if (page === 'guide' && path.startsWith('/guide')) link.classList.add('active');
    else if (page === 'status' && path.startsWith('/status')) link.classList.add('active');
  });

  links.forEach(link => {
    link.addEventListener('click', function() {
      if (!isWide && sidebar.classList.contains('open')) {
        sidebar.classList.remove('open');
        sidebar.style.transform = 'translateY(-100%)';
        document.body.classList.add('sidebar-closed');
        const onEnd = () => {
          sidebar.removeEventListener('transitionend', onEnd);
          if (!sidebar.classList.contains('open')) sidebar.style.display = 'none';
        };
        sidebar.addEventListener('transitionend', onEnd);
        saveSidebarState(false);
      }
    });
  });

  // ---- 未登入攔截 ----
  document.addEventListener('click', (e) => {
    const link = e.target.closest('.require-login');
    if (link && typeof isLoggedIn === 'function' && !isLoggedIn()) {
      e.preventDefault();
      const currentPath = window.location.pathname + window.location.search;
      window.location.href = `/login?redirect=${encodeURIComponent(currentPath)}`;
    }
  });
})();
// 預取（由 window.__ENABLE_HOVER_PREFETCH 控制）
(function () {
  if (!window.__ENABLE_HOVER_PREFETCH) return;

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
