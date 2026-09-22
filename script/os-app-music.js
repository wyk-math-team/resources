// os-app-music.js
// 從 GitHub CDN 拉取 /music/genshin/ 目錄下的音樂，讓使用者勾選並循環播放
(function () {
  'use strict';

  const CDN_BASE   = 'https://cdn.jsdelivr.net/gh/wyk-math-team/resources/';
  const MUSIC_DIR  = 'music/genshin/';
  const GITHUB_API = 'https://api.github.com/repos/wyk-math-team/resources/contents/' + MUSIC_DIR;

  const CACHE_KEY    = 'osMusicTracksCache_v1';
  const CACHE_TTL    = 60 * 60 * 1000;        // 目錄快取 1 小時
  const SELECTED_KEY = 'osMusicSelected_v1';
  const VOLUME_KEY   = 'osMusicVolume_v1';
  const MODE_KEY     = 'osMusicMode_v1';

  const AUDIO_EXT_RE = /\.(mp3|m4a|ogg|oga|wav|flac|aac)$/i;

  // ⭐ 單例 Audio（同一時間只播一首）
  let _audio = null;
  let _audioBound = false;

  const _state = {
    tracks: [],            // [{ name, fileName, url, size }]
    selected: new Set(),   // 勾選的 fileName
    currentIdx: -1,        // 在「已勾選清單」中的索引
    playing: false,
    mode: 'sequence',      // sequence | shuffle | single
    volume: 0.7,
    refreshing: false,
  };

  // ═══════════ 工具 ═══════════
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, m =>
      ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[m]));
  }
  function fmtSize(b) {
    if (!b || b < 0) return '';
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(0) + ' KB';
    return (b / 1048576).toFixed(1) + ' MB';
  }
  function fmtTime(sec) {
    if (!Number.isFinite(sec) || sec < 0) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return m + ':' + String(s).padStart(2, '0');
  }

  // ═══════════ localStorage ═══════════
  function loadSelected() {
    try {
      const raw = localStorage.getItem(SELECTED_KEY);
      if (!raw) return null;
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? new Set(arr) : null;
    } catch { return null; }
  }
  function saveSelected() {
    try { localStorage.setItem(SELECTED_KEY, JSON.stringify(Array.from(_state.selected))); } catch {}
  }
  function loadCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || !Array.isArray(data.tracks)) return null;
      if (Date.now() - (data.ts || 0) > CACHE_TTL) return null;
      return data.tracks;
    } catch { return null; }
  }
  function loadStaleCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || !Array.isArray(data.tracks)) return null;
      return data.tracks;
    } catch { return null; }
  }
  function saveCache(tracks) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), tracks })); } catch {}
  }

  // ═══════════ 從 GitHub API 拉目錄 ═══════════
  async function fetchTracks(force) {
    if (!force) {
      const cached = loadCache();
      if (cached) return cached;
    }
    try {
      const res = await fetch(GITHUB_API, {
        headers: { 'Accept': 'application/vnd.github+json' },
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error('Invalid response');

      const tracks = data
        .filter(f => f.type === 'file' && AUDIO_EXT_RE.test(f.name))
        .map(f => ({
          name: f.name
            .replace(/\.[^.]+$/, '')
            .replace(/[._-]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim() || f.name,
          fileName: f.name,
          url: CDN_BASE + MUSIC_DIR + encodeURIComponent(f.name),
          size: f.size || 0,
        }))
        .sort((a, b) => a.fileName.localeCompare(b.fileName, undefined, { numeric: true }));

      saveCache(tracks);
      return tracks;
    } catch (e) {
      // 失敗 → 退回舊快取（忽略 TTL）
      const stale = loadStaleCache();
      if (stale) return stale;
      throw e;
    }
  }

  // ═══════════ Audio 單例 ═══════════
  function ensureAudio() {
    if (_audio) return _audio;
    _audio = new Audio();
    _audio.preload = 'metadata';
    _audio.volume = _state.volume;
    _audio.addEventListener('ended', onEnded);
    _audio.addEventListener('timeupdate', onTimeUpdate);
    _audio.addEventListener('loadedmetadata', onTimeUpdate);
    _audio.addEventListener('play',  () => { _state.playing = true;  updatePlayerUI(); });
    _audio.addEventListener('pause', () => { _state.playing = false; updatePlayerUI(); });
    _audio.addEventListener('error', () => {
      // 該檔載入失敗 → 跳下一首（避免卡死）
      if (_state.playing) setTimeout(nextTrack, 300);
    });
    _audioBound = true;
    return _audio;
  }

  function getSelectedTracks() {
    return _state.tracks.filter(t => _state.selected.has(t.fileName));
  }

  function playByIndex(idx) {
    const list = getSelectedTracks();
    if (!list.length) return;
    if (idx < 0 || idx >= list.length) return;

    _state.currentIdx = idx;
    const track = list[idx];
    const a = ensureAudio();

    // 只有換歌才重新設 src（避免重新載入）
    if (a.dataset.fileName !== track.fileName) {
      a.dataset.fileName = track.fileName;
      a.src = track.url;
    }
    a.play().catch(err => {
      console.warn('Play failed:', err);
      _state.playing = false;
      updatePlayerUI();
    });
  }

  function togglePlay() {
    const a = _audio;
    if (!a || !a.src) {
      // 尚未載入任何曲目 → 從第一首開始
      if (getSelectedTracks().length > 0) playByIndex(0);
      return;
    }
    if (a.paused) {
      a.play().catch(() => {});
    } else {
      a.pause();
    }
  }

  function nextTrack() {
    const list = getSelectedTracks();
    if (!list.length) return;
    if (_state.mode === 'single') {
      if (_audio) { _audio.currentTime = 0; _audio.play().catch(() => {}); }
      return;
    }
    if (_state.mode === 'shuffle') {
      // 避免只播同一首
      if (list.length === 1) { playByIndex(0); return; }
      let n;
      do { n = Math.floor(Math.random() * list.length); } while (n === _state.currentIdx);
      playByIndex(n);
      return;
    }
    // sequence
    playByIndex((_state.currentIdx + 1) % list.length);
  }

  function prevTrack() {
    const list = getSelectedTracks();
    if (!list.length) return;
    // 播超過 3 秒 → 回開頭
    if (_audio && _audio.currentTime > 3) {
      _audio.currentTime = 0;
      return;
    }
    if (_state.mode === 'shuffle') {
      if (list.length === 1) { playByIndex(0); return; }
      let n;
      do { n = Math.floor(Math.random() * list.length); } while (n === _state.currentIdx);
      playByIndex(n);
      return;
    }
    playByIndex((_state.currentIdx - 1 + list.length) % list.length);
  }

  function onEnded() {
    if (_state.mode === 'single') {
      if (_audio) { _audio.currentTime = 0; _audio.play().catch(() => {}); }
      return;
    }
    nextTrack();
  }

  function onTimeUpdate() {
    if (!_audio) return;
    const cur = _audio.currentTime || 0;
    const dur = Number.isFinite(_audio.duration) ? _audio.duration : 0;

    const bar = document.getElementById('osm-progress-fill');
    if (bar) bar.style.width = (dur > 0 ? (cur / dur) * 100 : 0) + '%';

    const curEl = document.getElementById('osm-time-cur');
    if (curEl) curEl.textContent = fmtTime(cur);
    const durEl = document.getElementById('osm-time-dur');
    if (durEl) durEl.textContent = dur > 0 ? fmtTime(dur) : '--:--';
  }

  // ═══════════ UI ═══════════
  function shellHTML() {
    return `
      <style>
        .osm-wrap { width:100%; height:100%; display:flex; flex-direction:column;
          background:#0f1420; color:#d6e4ff;
          font-family:'Segoe UI',system-ui,sans-serif; overflow:hidden; }
        .osm-header { padding:11px 14px; border-bottom:1px solid rgba(100,150,220,.2);
          display:flex; align-items:center; justify-content:space-between; gap:10px; flex-shrink:0; }
        .osm-title { font-size:13.5px; font-weight:700; letter-spacing:.3px; }
        .osm-title i { color:#5da8ff; margin-right:6px; }
        .osm-refresh { background:transparent; border:1px solid rgba(100,150,220,.3);
          color:#9ab; border-radius:6px; padding:4px 10px; font-size:11px;
          cursor:pointer; font-family:inherit; display:inline-flex; align-items:center; gap:4px; }
        .osm-refresh:hover { border-color:#5da8ff; color:#d6e4ff; }
        .osm-refresh:disabled { opacity:.4; cursor:not-allowed; }

        .osm-controls { display:flex; gap:4px; padding:9px 12px 4px; flex-wrap:wrap; flex-shrink:0; }
        .osm-ctrl-btn { background:rgba(100,150,220,.1); border:1px solid rgba(100,150,220,.25);
          color:#d6e4ff; border-radius:6px; padding:4px 9px; font-size:11px;
          cursor:pointer; font-family:inherit; display:inline-flex;
          align-items:center; gap:4px; white-space:nowrap; }
        .osm-ctrl-btn:hover { background:rgba(100,150,220,.2); border-color:#5da8ff; }
        .osm-ctrl-btn.active { background:linear-gradient(135deg,#5da8ff,#3a7bc8);
          border-color:#5da8ff; color:#fff;
          box-shadow:0 2px 8px rgba(93,168,255,.4); }

        .osm-list { flex:1; overflow-y:auto; padding:6px 8px 8px; min-height:0; }
        .osm-list::-webkit-scrollbar { width:8px; }
        .osm-list::-webkit-scrollbar-thumb { background:rgba(100,150,220,.3); border-radius:4px; }
        .osm-list::-webkit-scrollbar-track { background:transparent; }

        .osm-track { display:flex; align-items:center; gap:9px;
          padding:7px 10px; border-radius:6px; cursor:pointer; font-size:12.5px;
          transition:background .12s; border:1px solid transparent; }
        .osm-track:hover { background:rgba(100,150,220,.1); }
        .osm-track.playing {
          background:linear-gradient(90deg,rgba(93,168,255,.25),rgba(93,168,255,.05));
          border-color:rgba(93,168,255,.4); }
        .osm-track.paused { background:rgba(93,168,255,.1); }
        .osm-track.playing .osm-track-icon { color:#8fe8a5; }
        .osm-track-check { width:15px; height:15px; flex-shrink:0;
          cursor:pointer; accent-color:#5da8ff; }
        .osm-track-icon { width:16px; text-align:center; color:#5da8ff;
          flex-shrink:0; font-size:12px; }
        .osm-track-name { flex:1; min-width:0;
          overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .osm-track-size { color:#6b7d9a; font-size:10.5px;
          font-family:'Consolas',monospace; flex-shrink:0; }

        .osm-player { padding:11px 14px 13px; border-top:1px solid rgba(100,150,220,.2);
          background:rgba(20,30,55,.5); flex-shrink:0; }
        .osm-current { font-size:12px; margin-bottom:7px; color:#a8bce0;
          overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .osm-current b { color:#fff; }
        .osm-progress { height:4px; background:rgba(100,150,220,.2);
          border-radius:2px; margin-bottom:6px; cursor:pointer; position:relative; }
        .osm-progress-fill { height:100%;
          background:linear-gradient(90deg,#5da8ff,#8fe8a5);
          border-radius:2px; width:0%; transition:width .15s linear; }
        .osm-time-row { display:flex; justify-content:space-between; font-size:10.5px;
          color:#6b7d9a; font-family:'Consolas',monospace; margin-bottom:9px; }
        .osm-buttons { display:flex; align-items:center; justify-content:center; gap:12px; }
        .osm-btn { width:34px; height:34px; border-radius:50%;
          background:rgba(100,150,220,.15); border:1px solid rgba(100,150,220,.3);
          color:#d6e4ff; font-size:13px; cursor:pointer; font-family:inherit;
          display:inline-flex; align-items:center; justify-content:center;
          transition:all .15s; }
        .osm-btn:hover:not(:disabled) { background:rgba(100,150,220,.3); border-color:#5da8ff; }
        .osm-btn:disabled { opacity:.35; cursor:not-allowed; }
        .osm-btn.main { width:42px; height:42px; font-size:16px;
          background:linear-gradient(135deg,#5da8ff,#3a7bc8);
          border-color:#5da8ff; color:#fff;
          box-shadow:0 2px 12px rgba(93,168,255,.5); }
        .osm-btn.main:hover:not(:disabled) { transform:scale(1.06); }

        .osm-volume { display:flex; align-items:center; gap:8px;
          margin-top:9px; font-size:11px; color:#9ab; }
        .osm-volume input[type=range] { flex:1; accent-color:#5da8ff; height:3px; }

        .osm-empty, .osm-loading, .osm-error {
          text-align:center; padding:36px 20px; color:#6b7d9a; font-size:12.5px; }
        .osm-empty i, .osm-loading i, .osm-error i {
          font-size:30px; display:block; margin-bottom:10px; opacity:.55; }
        .osm-error { color:#e88; }
        .osm-retry { margin-top:10px; }
      </style>

      <div class="osm-wrap">
        <div class="osm-header">
          <div class="osm-title"><i class="fas fa-music"></i>Genshin Music</div>
          <button class="osm-refresh" id="osm-refresh-btn">
            <i class="fas fa-sync-alt"></i> Refresh
          </button>
        </div>

        <div class="osm-controls">
          <button class="osm-ctrl-btn" id="osm-all-btn"><i class="fas fa-check-double"></i> All</button>
          <button class="osm-ctrl-btn" id="osm-none-btn"><i class="fas fa-xmark"></i> Clear</button>
          <button class="osm-ctrl-btn" data-mode="sequence"><i class="fas fa-arrow-right"></i> Seq</button>
          <button class="osm-ctrl-btn" data-mode="shuffle"><i class="fas fa-shuffle"></i> Shuffle</button>
          <button class="osm-ctrl-btn" data-mode="single"><i class="fas fa-repeat"></i> Single</button>
        </div>

        <div class="osm-list" id="osm-list">
          <div class="osm-loading"><i class="fas fa-spinner fa-spin"></i>Loading tracks…</div>
        </div>

        <div class="osm-player">
          <div class="osm-current">Now: <b id="osm-current">—</b></div>
          <div class="osm-progress" id="osm-progress">
            <div class="osm-progress-fill" id="osm-progress-fill"></div>
          </div>
          <div class="osm-time-row">
            <span id="osm-time-cur">0:00</span>
            <span id="osm-time-dur">--:--</span>
          </div>
          <div class="osm-buttons">
            <button class="osm-btn" id="osm-prev-btn"><i class="fas fa-backward-step"></i></button>
            <button class="osm-btn main" id="osm-play-btn"><i class="fas fa-play"></i></button>
            <button class="osm-btn" id="osm-next-btn"><i class="fas fa-forward-step"></i></button>
          </div>
          <div class="osm-volume">
            <i class="fas fa-volume-low"></i>
            <input type="range" id="osm-volume" min="0" max="100" value="70">
            <i class="fas fa-volume-high"></i>
          </div>
        </div>
      </div>
    `;
  }

  function renderList() {
    const listEl = document.getElementById('osm-list');
    if (!listEl) return;

    if (!_state.tracks.length) {
      listEl.innerHTML = `<div class="osm-empty">
        <i class="fas fa-music"></i>
        No audio files found in <b>music/genshin/</b><br>
        <span style="font-size:11px;opacity:.7;margin-top:6px;display:inline-block;">
          Supported: mp3, m4a, ogg, wav, flac, aac
        </span>
      </div>`;
      return;
    }

    listEl.innerHTML = _state.tracks.map(t => {
      const checked = _state.selected.has(t.fileName);
      return `
        <div class="osm-track" data-file="${esc(t.fileName)}" title="${esc(t.name)}">
          <input type="checkbox" class="osm-track-check" ${checked ? 'checked' : ''}>
          <i class="fas fa-music osm-track-icon"></i>
          <span class="osm-track-name">${esc(t.name)}</span>
          <span class="osm-track-size">${fmtSize(t.size)}</span>
        </div>`;
    }).join('');

    listEl.querySelectorAll('.osm-track').forEach(el => {
      const fileName = el.dataset.file;
      const cb = el.querySelector('.osm-track-check');

      // 點 row 就 toggle checkbox（除非點 checkbox 自己）
      el.addEventListener('click', (e) => {
        if (e.target === cb) return;
        cb.checked = !cb.checked;
        onToggle(fileName, cb.checked);
      });
      cb.addEventListener('change', (e) => {
        e.stopPropagation();
        onToggle(fileName, e.target.checked);
      });
    });

    refreshPlayerUI();
  }

  function onToggle(fileName, checked) {
    if (checked) _state.selected.add(fileName);
    else _state.selected.delete(fileName);
    saveSelected();

    // 若已選清單變動導致 currentIdx 越界 → 重設
    const list = getSelectedTracks();
    if (_state.currentIdx >= list.length) _state.currentIdx = list.length - 1;
    if (!list.length) {
      _state.currentIdx = -1;
      if (_audio) { _audio.pause(); _audio.removeAttribute('src'); _audio.load(); }
    }
    refreshPlayerUI();
  }

  function refreshPlayerUI() {
    const list = getSelectedTracks();
    const cur = list[_state.currentIdx];

    const curEl = document.getElementById('osm-current');
    if (curEl) curEl.textContent = cur ? cur.name : '—';

    const playBtn = document.getElementById('osm-play-btn');
    if (playBtn) {
      const disabled = list.length === 0;
      playBtn.disabled = disabled;
      playBtn.innerHTML = _state.playing
        ? '<i class="fas fa-pause"></i>'
        : '<i class="fas fa-play"></i>';
    }
    const prevBtn = document.getElementById('osm-prev-btn');
    const nextBtn = document.getElementById('osm-next-btn');
    if (prevBtn) prevBtn.disabled = list.length === 0;
    if (nextBtn) nextBtn.disabled = list.length === 0;

    // 高亮當前曲目
    document.querySelectorAll('.osm-track').forEach(el => {
      const fileName = el.dataset.file;
      const isCur = cur && fileName === cur.fileName;
      el.classList.toggle('playing', isCur && _state.playing);
      el.classList.toggle('paused', isCur && !_state.playing);
    });

    // 進度重置（若沒在播）
    if (!_audio || !_audio.src) {
      const bar = document.getElementById('osm-progress-fill');
      if (bar) bar.style.width = '0%';
      const durEl = document.getElementById('osm-time-dur');
      if (durEl) durEl.textContent = '--:--';
      const curEl2 = document.getElementById('osm-time-cur');
      if (curEl2) curEl2.textContent = '0:00';
    }
  }

  function setMode(mode) {
    if (!['sequence','shuffle','single'].includes(mode)) return;
    _state.mode = mode;
    try { localStorage.setItem(MODE_KEY, mode); } catch {}
    document.querySelectorAll('.osm-ctrl-btn[data-mode]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });
  }

  function bindEvents() {
    document.getElementById('osm-refresh-btn')?.addEventListener('click', () => refresh(true));

    document.getElementById('osm-all-btn')?.addEventListener('click', () => {
      _state.tracks.forEach(t => _state.selected.add(t.fileName));
      saveSelected();
      document.querySelectorAll('.osm-track-check').forEach(cb => cb.checked = true);
      refreshPlayerUI();
    });
    document.getElementById('osm-none-btn')?.addEventListener('click', () => {
      _state.selected.clear();
      saveSelected();
      document.querySelectorAll('.osm-track-check').forEach(cb => cb.checked = false);
      if (_audio) { _audio.pause(); _audio.removeAttribute('src'); _audio.load(); }
      _state.currentIdx = -1;
      refreshPlayerUI();
    });

    document.querySelectorAll('.osm-ctrl-btn[data-mode]').forEach(btn => {
      btn.addEventListener('click', () => setMode(btn.dataset.mode));
    });

    document.getElementById('osm-play-btn')?.addEventListener('click', togglePlay);
    document.getElementById('osm-prev-btn')?.addEventListener('click', prevTrack);
    document.getElementById('osm-next-btn')?.addEventListener('click', nextTrack);

    const vol = document.getElementById('osm-volume');
    if (vol) {
      vol.value = String(Math.round(_state.volume * 100));
      vol.addEventListener('input', () => {
        _state.volume = vol.value / 100;
        if (_audio) _audio.volume = _state.volume;
        try { localStorage.setItem(VOLUME_KEY, String(_state.volume)); } catch {}
      });
    }

    // 點進度條跳轉
    const prog = document.getElementById('osm-progress');
    if (prog) {
      prog.addEventListener('click', (e) => {
        if (!_audio || !Number.isFinite(_audio.duration)) return;
        const rect = prog.getBoundingClientRect();
        const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        _audio.currentTime = pct * _audio.duration;
      });
    }
  }

  async function refresh(force) {
    if (_state.refreshing) return;
    _state.refreshing = true;

    const btn = document.getElementById('osm-refresh-btn');
    const listEl = document.getElementById('osm-list');
    if (btn) btn.disabled = true;
    if (listEl) listEl.innerHTML = `<div class="osm-loading"><i class="fas fa-spinner fa-spin"></i>Loading tracks…</div>`;

    try {
      const tracks = await fetchTracks(force);
      _state.tracks = tracks;

      // 首次開啟 → 若沒任何選取紀錄，自動全選
      if (loadSelected() === null) {
        tracks.forEach(t => _state.selected.add(t.fileName));
        saveSelected();
      } else {
        // 移除已不存在的檔案的選取
        const valid = new Set(tracks.map(t => t.fileName));
        Array.from(_state.selected).forEach(f => { if (!valid.has(f)) _state.selected.delete(f); });
        saveSelected();
      }

      renderList();
    } catch (e) {
      if (listEl) listEl.innerHTML = `<div class="osm-error">
        <i class="fas fa-triangle-exclamation"></i>
        Failed to load: ${esc(e.message)}
        <div class="osm-retry">
          <button class="osm-ctrl-btn" id="osm-retry-btn">
            <i class="fas fa-rotate"></i> Retry
          </button>
        </div>
      </div>`;
      document.getElementById('osm-retry-btn')?.addEventListener('click', () => refresh(true));
    } finally {
      _state.refreshing = false;
      if (btn) btn.disabled = false;
    }
  }

  // ═══════════ 註冊應用 ═══════════
  window.OSApps = window.OSApps || {};
  window.OSApps.music = {
    mount(hostEl, { win, OS, flashToast }) {
      // 從 localStorage 讀偏好
      const savedSel = loadSelected();
      if (savedSel) _state.selected = savedSel;

      try {
        const v = parseFloat(localStorage.getItem(VOLUME_KEY));
        if (Number.isFinite(v) && v >= 0 && v <= 1) _state.volume = v;
      } catch {}
      try {
        const m = localStorage.getItem(MODE_KEY);
        if (['sequence','shuffle','single'].includes(m)) _state.mode = m;
      } catch {}

      hostEl.innerHTML = shellHTML();
      bindEvents();
      setMode(_state.mode);
      refresh(false);

      // ⭐ 關窗時暫停音樂
      if (win && typeof win.close === 'function') {
        const origClose = win.close.bind(win);
        win.close = function () {
          try {
            if (_audio) _audio.pause();
            _state.playing = false;
          } catch {}
          return origClose();
        };
      }

      // ⭐ 若同個 OS 實例已經有 audio 在播放，UI 要同步
      if (_audio && _audio.src) {
        _state.playing = !_audio.paused;
        // 找回 currentIdx
        const list = getSelectedTracks();
        const curFile = _audio.dataset.fileName;
        _state.currentIdx = list.findIndex(t => t.fileName === curFile);
        refreshPlayerUI();
      }
    },
  };
})();
