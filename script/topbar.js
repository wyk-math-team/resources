// topbar.js
(function() {
  console.log('topbar.js executing...');

  function getCurrentUserName() {
    try {
      if (typeof getCurrentUser === 'function') {
        const user = getCurrentUser();
        return user?.displayName || user?.username || 'guest';
      }
    } catch(e) { console.error('getCurrentUser error:', e); }
    return 'guest';
  }

  const container = document.getElementById('topbarContainer');
  if (!container) {
    console.error('topbarContainer not found!');
    return;
  }

  const username = getCurrentUserName();
  const loggedIn = (typeof isLoggedIn === 'function') && isLoggedIn();

  let realUsername = 'guest';
  if (typeof getCurrentUser === 'function') {
    const user = getCurrentUser();
    realUsername = user?.username || 'guest';
  }

  // 判断移动端
  const isMobile = window.innerWidth <= 768;

  // 移动端截断用户名
  let displayUsername = username;
  if (isMobile && username.length > 7) {
    displayUsername = username.substring(0, 4) + '...';
  }

  // ---------- 头像缓存 ----------
  let avatarCache = null;
  function getCachedAvatar() {
    if (avatarCache !== null) return avatarCache;
    const cached = sessionStorage.getItem('userAvatar_' + realUsername);
    if (cached) {
      try {
        const data = JSON.parse(cached);
        if (Date.now() - data.timestamp < 3600 * 1000) {
          avatarCache = data.url;
          return avatarCache;
        }
      } catch(e) {}
    }
    return null;
  }
  function setCachedAvatar(url) {
    avatarCache = url;
    try {
      sessionStorage.setItem('userAvatar_' + realUsername, JSON.stringify({ url, timestamp: Date.now() }));
    } catch(e) {}
  }

  // ---------- 加载头像 ----------
  async function loadUserAvatar() {
    const avatarImg = document.getElementById('userAvatar');
    if (!avatarImg) return;

    const cached = getCachedAvatar();
    if (cached) {
      avatarImg.src = cached;
      avatarImg.style.display = 'inline-block';
      return;
    }

    if (!loggedIn || !realUsername) return;

    try {
      const data = await apiCall(`/api/users?action=pfp&username=${encodeURIComponent(realUsername)}`);
      if (data.success && data.pfp) {
        avatarImg.src = data.pfp;
        avatarImg.style.display = 'inline-block';
        setCachedAvatar(data.pfp);
      } else {
        avatarImg.style.display = 'none';
      }
    } catch (err) {
      console.warn('Failed to load avatar:', err);
      avatarImg.style.display = 'none';
    }
  }

  // ---------- 下拉切换函数 ----------
  function toggleDropdown(e) {
    e.stopPropagation();
    if (!loggedIn) {
      const currentPath = window.location.pathname + window.location.search;
      window.location.href = `/login?redirect=${encodeURIComponent(currentPath)}`;
      return;
    }
    const dropdown = document.getElementById('userDropdown');
    if (!dropdown) return;
    const isVisible = dropdown.style.display === 'block';
    dropdown.style.display = isVisible ? 'none' : 'block';
  }

  // 点击页面其他地方关闭下拉
  function closeDropdown(e) {
    const dropdown = document.getElementById('userDropdown');
    const menu = document.getElementById('userMenu');
    if (!dropdown || !menu) return;
    if (menu.contains(e.target)) return;
    dropdown.style.display = 'none';
  }

  // ---------- 用户名点击事件 ----------
  function handleUsernameClick(e) {
    if (!loggedIn) {
      const currentPath = window.location.pathname + window.location.search;
      window.location.href = `/login?redirect=${encodeURIComponent(currentPath)}`;
      return;
    }
    window.location.href = `/users/${encodeURIComponent(realUsername)}`;
  }

  // ---------- 登出函数 ----------
  function performLogout() {
    if (typeof logout === 'function') {
      logout();
    }
    localStorage.removeItem('sidebarOpen');
    window.location.href = '/index.html';
  }

  // ---------- 侧边栏切换（移动端） ----------
  function toggleSidebarMobile(e) {
    e.stopPropagation();
    // 调用 sidebar.js 暴露的全局切换函数
    if (typeof window.toggleSidebar === 'function') {
      window.toggleSidebar();
    } else {
      // 备用：直接操作 sidebar
      const sidebar = document.getElementById('sidebarContainer');
      if (!sidebar) return;
      sidebar.classList.toggle('open');
      const isOpen = sidebar.classList.contains('open');
      // 移动端控制 transform
      if (isOpen) {
        sidebar.style.transform = 'translateY(0)';
        document.body.classList.remove('sidebar-closed');
        if (window.innerWidth <= 768) localStorage.setItem('sidebarOpen', 'true');
      } else {
        sidebar.style.transform = 'translateY(-100%)';
        document.body.classList.add('sidebar-closed');
        if (window.innerWidth <= 768) localStorage.setItem('sidebarOpen', 'false');
      }
    }
  }

  // ---------- 构建 Topbar HTML ----------
  let topbarHTML = `
    <div class="topbar-left">
      <span class="brand-name">
        <a href="/" style="display:flex; align-items:center; gap:8px; text-decoration:none; color:#ffffff; font-weight:800; letter-spacing:1px;">
          <img src="/favicon.svg" alt="Home" style="display:block; width:28px; height:28px; border-radius:50%; flex-shrink:0;" id="brandIcon">
          <span class="brand-text">WYK Maths Team</span>
        </a>
      </span>
    </div>
    <div class="topbar-right">
  `;

  if (loggedIn) {
    topbarHTML += `
      <div class="user-menu" id="userMenu" style="cursor: default; position: relative; z-index: 9999;">
        <span class="username-display" style="display: flex; align-items: center; gap: 6px; background: rgba(255,255,255,0.08); padding: 6px 14px; border-radius: 20px; transition: background 0.2s; cursor: default;">
          <img id="userAvatar" src="" alt="avatar" style="width:28px; height:28px; border-radius:50%; object-fit:cover; display:none; margin-right:4px;">
          <span class="user-icon"></span>
          <span id="currentUsername" onclick="handleUsernameClick(event);" style="cursor: pointer; font-weight: 500;">${escapeHtml(displayUsername)}</span>
          <span class="dropdown-arrow" onclick="toggleDropdown(event);" style="cursor: pointer; font-size: 0.7rem; margin-left: 4px; transition: transform 0.2s;">
            <i class="fa fa-caret-down"></i>
          </span>
        </span>
        <div id="userDropdown" style="display:none; position:absolute; top:calc(100% + 8px); right:0; background:#fff; border-radius:var(--radius-sm, 4px); box-shadow:var(--shadow-md, 0 4px 12px rgba(0,0,0,0.15)); min-width:140px; overflow:hidden; z-index:99999;">
          <a href="/settings" class="dropdown-item" style="display:block; padding:11px 18px; background:#fff; color:var(--text-primary, #212529); text-decoration:none; font-size:0.9rem; font-weight:500;">
            <i class="fa fa-pencil fa-fw"></i> Settings
          </a>
          <button class="logout-btn" onclick="performLogout(); event.stopPropagation();" style="display:block; width:100%; padding:11px 18px; background:#fff; border:none; cursor:pointer; font-size:0.9rem; font-weight:500; text-align:left; color:var(--danger, #dc3545);">
            <i class="fa fa-sign-out fa-fw"></i> Logout
          </button>
        </div>
      </div>
    `;
  } else {
    topbarHTML += `
      <div class="user-menu" id="userMenu" style="position: relative;">
        <a href="/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}" class="login-btn-header" style="display:inline-block; padding:6px 16px; background:var(--accent, #4a90d9); color:#fff; border-radius:20px; text-decoration:none; font-weight:600; font-size:0.9rem; transition:background 0.2s;">
          <i class="fa fa-sign-in-alt fa-fw"></i> Login
        </a>
      </div>
    `;
  }

  // 移动端添加汉堡按钮
  if (isMobile) {
    topbarHTML += `
      <button class="topbar-sidebar-toggle" id="mobileSidebarToggle" style="background:none; border:none; color:var(--topbar-text); font-size:1.6rem; cursor:pointer; padding:0 10px; line-height:1; display:flex; align-items:center; justify-content:center;">
        ☰
      </button>
    `;
  }

  topbarHTML += `
      <div class="clock">
        <span class="clock-time" id="clockTime">00:00:00</span>
      </div>
    </div>
  `;

  container.innerHTML = topbarHTML;

  // 绑定移动端汉堡按钮事件
  if (isMobile) {
    const mobileToggle = document.getElementById('mobileSidebarToggle');
    if (mobileToggle) {
      mobileToggle.addEventListener('click', toggleSidebarMobile);
    }
  }

  // 暴露全局函数
  window.toggleDropdown = toggleDropdown;
  window.handleUsernameClick = handleUsernameClick;
  window.performLogout = performLogout;

  // 点击页面其他区域关闭下拉
  document.addEventListener('click', closeDropdown);

  // 加载头像
  if (loggedIn && realUsername) {
    setTimeout(loadUserAvatar, 100);
  }

  // 时钟
  function updateClock() {
    const d=new Date();
    const pad=n=>String(n).padStart(2,'0');
    const timeStr=`${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    
    const el = document.getElementById('clockTime');
    if (el) el.textContent = timeStr;
  }
  setInterval(updateClock, 1000);
  updateClock();

  function escapeHtml(str) {
    return String(str).replace(/[&<>]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[m]));
  }

  // 样式
  const style = document.createElement('style');
  style.textContent = `
    .topbar { overflow-y: visible !important; z-index: 9998 !important; }
    .user-menu { position: relative; z-index: 9999 !important; }
    #userDropdown { z-index: 99999 !important; }
    .username-display { background: rgba(255,255,255,0.08); padding: 6px 14px; border-radius: 20px; transition: background 0.2s; }
    .username-display:hover { background: rgba(255,255,255,0.16); }
    .user-menu.open .dropdown-arrow i { transform: rotate(180deg); }
    .login-btn-header:hover { background: var(--accent-hover, #3a7bc8) !important; }
    [data-theme="dark"] #userDropdown { background: #1e1e1e; border: 1px solid #444; }
    [data-theme="dark"] .dropdown-item, [data-theme="dark"] .logout-btn { background: #1e1e1e; color: #e0e0e0; }
    [data-theme="dark"] .dropdown-item:hover, [data-theme="dark"] .logout-btn:hover { background: #2a2a2a; }
    [data-theme="dark"] .logout-btn { color: #f85149; }
    [data-theme="dark"] .logout-btn:hover { background: #3a1a1a; }

    .brand-name a { font-size: 1.6rem; }
    @media (max-width: 768px) {
      .clock { display: none !important; }
      .brand-name a { font-size: 14px !important; }
      #userAvatar { width: 22px !important; height: 22px !important; }
      .username-display { padding: 4px 10px; font-size: 0.82rem; }
      #userDropdown { right: 0; left: auto; min-width: 120px; }
      .login-btn-header { font-size: 0.8rem; padding: 4px 12px; }
      .topbar-sidebar-toggle { display: flex !important; align-items: center; justify-content: center; font-size: 1.6rem; padding: 0 10px; }
    }
    @media (min-width: 769px) {
      .topbar-sidebar-toggle { display: none !important; }
    }
  `;
  document.head.appendChild(style);

  if (!document.querySelector('link[href*="font-awesome"]')) {
    const faLink = document.createElement('link');
    faLink.rel = 'stylesheet';
    faLink.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css';
    document.head.appendChild(faLink);
  }
  
})();
