// sidebar.js
(function() {
  console.log('sidebar.js executing...');
  const sidebar = document.getElementById('sidebarContainer');
  if (!sidebar) {
    console.warn('sidebarContainer not found');
    return;
  }

  const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  const isAdmin = user && (user.role === 'admin' || user.role === 'root');
  const currentUser = getCurrentUser();
  const ownSubmissionsUrl = currentUser ? `/submissions/user/${encodeURIComponent(currentUser.username)}` : '/submissions';

  const sidebarHTML = `
    <nav class="sidebar-nav">
      <ul>
        <li><a href="/problems" class="sidebar-link require-login" data-page="problems">Problems</a></li>
        <li><a href="${ownSubmissionsUrl}" class="sidebar-link require-login" data-page="submissions">Your submissions</a></li>
        <li><a href="/submissions" class="sidebar-link require-login" data-page="all-submissions">All submissions</a></li>
        <li><a href="/ranklist.html" class="sidebar-link require-login" data-page="ranklist">Leaderboard</a></li>
        <li><a href="/resources" class="sidebar-link require-login" data-page="resources">Resources</a></li>
        <li><a href="/contest" class="sidebar-link require-login" data-page="contest">Contests</a></li>
        ${isAdmin ? `
          <li><hr style="margin:8px 0; border-color:rgba(255,255,255,0.2);"></li>
          <li><a href="/admin/problems" class="sidebar-link require-login" data-page="admin-problems">Add Problems</a></li>
          <li><a href="/admin/ssubmissions" class="sidebar-link require-login" data-page="admin-ssubmissions">All Submissions</a></li>
          <li><a href="/admin/users" class="sidebar-link require-login" data-page="admin-users">Manage Users</a></li>
          <li><a href="/admin/updates" class="sidebar-link require-login" data-page="admin-updates">Manage Updates</a></li>
          <li><a href="/admin/contest" class="sidebar-link require-login" data-page="contest">Contests</a></li>
          <li><a href="/admin/terminal" class="sidebar-link require-login" data-page="admin-terminal">SQL Terminal</a></li>
          <li><a href="/admin/log" class="sidebar-link require-login" data-page="admin-log">Server Log</a></li>
          <li><a href="/admin/cmd" class="sidebar-link require-login" data-page="admin-cmd">CMD</a></li>
          <li><hr style="margin:8px 0; border-color:rgba(255,255,255,0.2);"></li>
        ` : ''}
        <li><a href="/status" class="sidebar-link require-login" data-page="status">Judge Status</a></li>
        <li><a href="/settings" class="sidebar-link require-login" data-page="template">Settings</a></li>
        <li><a href="/credits" class="sidebar-link" data-page="credits">Credits</a></li>
        <li><a href="/guide" class="sidebar-link" data-page="guide">Guides</a></li>
      </ul>
    </nav>
  `;

  sidebar.innerHTML = sidebarHTML;

  // ---- 判断宽屏 ----
  const isWide = window.innerWidth > 768;
  let isOpen;

  if (isWide) {
    isOpen = true;
  } else {
    const saved = localStorage.getItem('sidebarOpen');
    isOpen = saved === null ? false : saved === 'true';
  }

  // ---- 移动端样式：从顶部滑出 ----
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
    sidebar.style.display = isOpen ? 'block' : 'none'; // 初始状态决定是否显示
  }

  // ---- 应用初始状态（无过渡，避免闪烁） ----
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

  // ---- 保存状态（仅窄屏） ----
  function saveSidebarState(open) {
    if (!isWide) {
      localStorage.setItem('sidebarOpen', open);
    }
  }

  // ---- 切换函数（供按钮调用） ----
  function toggleSidebar() {
    if (isWide) return;
    const nowOpen = sidebar.classList.contains('open');
    if (nowOpen) {
      // 关闭
      sidebar.classList.remove('open');
      sidebar.style.transform = 'translateY(-100%)';
      document.body.classList.add('sidebar-closed');
      // 监听动画结束，然后隐藏
      const onTransitionEnd = () => {
        sidebar.removeEventListener('transitionend', onTransitionEnd);
        if (!sidebar.classList.contains('open')) {
          sidebar.style.display = 'none';
        }
      };
      sidebar.addEventListener('transitionend', onTransitionEnd);
      saveSidebarState(false);
    } else {
      // 打开
      sidebar.style.display = 'block';
      // 强制回流以重启动画
      void sidebar.offsetHeight;
      sidebar.classList.add('open');
      sidebar.style.transform = 'translateY(0)';
      document.body.classList.remove('sidebar-closed');
      saveSidebarState(true);
    }
  }
  window.toggleSidebar = toggleSidebar;

  // ---- 浮动开关按钮（备选） ----
  const toggleBtn = document.getElementById('sidebarToggle');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', toggleSidebar);
    if (isWide) toggleBtn.style.display = 'none';
  }

  // ---- 响应式窗口变化 ----
  let currentIsWide = isWide;
  window.addEventListener('resize', () => {
    const nowWide = window.innerWidth > 768;
    if (nowWide !== currentIsWide) {
      currentIsWide = nowWide;
      if (nowWide) {
        // 切换到宽屏：恢复默认样式，强制打开
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
        // 切换到窄屏：设置移动端样式
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

  // ---- Active 状态高亮 ----
  const path = window.location.pathname;
  const links = sidebar.querySelectorAll('.sidebar-link');
  links.forEach(link => {
    const page = link.getAttribute('data-page');
    if (page === 'problems' && path.startsWith('/problems')) link.classList.add('active');
    else if (page === 'admin-problems' && path.startsWith('/admin/problems')) link.classList.add('active');
    else if (page === 'admin-ssubmissions' && path.startsWith('/admin/ssubmissions')) link.classList.add('active');
    else if (page === 'admin-users' && path.startsWith('/admin/users')) link.classList.add('active');
    else if (page === 'admin-updates' && path.startsWith('/admin/updates')) link.classList.add('active');
    else if (page === 'admin-resources' && path.startsWith('/admin/resources')) link.classList.add('active');
    else if (page === 'admin-terminal' && path.startsWith('/admin/terminal')) link.classList.add('active');
    else if (page === 'resources' && path.startsWith('/resources')) link.classList.add('active');
    else if (page === 'submissions' && (path.startsWith('/submissions/user') || path === '/submissions')) link.classList.add('active');
    else if (page === 'all-submissions' && path === '/submissions') link.classList.add('active');
    else if (page === 'ranklist' && path.startsWith('/ranklist')) link.classList.add('active');
    else if (page === 'template' && path.startsWith('/settings')) link.classList.add('active');
    else if (page === 'credits' && path.startsWith('/credits')) link.classList.add('active');
    else if (page === 'contest' && path.startsWith('/contest')) link.classList.add('active');
    else if (page === 'guide' && path.startsWith('/guide')) link.classList.add('active');
    else if (page === 'status' && path.startsWith('/status')) link.classList.add('active');
    else if (page === 'admin-log' && path.startsWith('/log'))link.classList.add('active');
    else if (page === 'admin-cmd' && path.startsWith('/admin/cmd'))link.classList.add('active');
    else if (path.includes(page) && !path.startsWith('/admin')) link.classList.add('active');
  });

  // ---- 点击侧边栏链接后关闭（移动端） ----
  links.forEach(link => {
    link.addEventListener('click', function(e) {
      if (!isWide) {
        // 关闭侧边栏
        if (sidebar.classList.contains('open')) {
          sidebar.classList.remove('open');
          sidebar.style.transform = 'translateY(-100%)';
          document.body.classList.add('sidebar-closed');
          const onEnd = () => {
            sidebar.removeEventListener('transitionend', onEnd);
            if (!sidebar.classList.contains('open')) {
              sidebar.style.display = 'none';
            }
          };
          sidebar.addEventListener('transitionend', onEnd);
          saveSidebarState(false);
        }
      }
    });
  });

  // ---- 未登录拦截 ----
  document.addEventListener('click', (e) => {
    const link = e.target.closest('.require-login');
    if (link && typeof isLoggedIn === 'function' && !isLoggedIn()) {
      e.preventDefault();
      const currentPath = window.location.pathname + window.location.search;
      window.location.href = `/login?redirect=${encodeURIComponent(currentPath)}`;
    }
  });
})();
