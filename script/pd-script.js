if (!isLoggedIn()) window.location.href = '/index.html';

const pathMatch = window.location.pathname.match(/^\/problems\/([^/]+)$/);
if (!pathMatch) {
  document.getElementById('mainContent').innerHTML = '<div class="error-msg">Invalid problem URL.</div>';
  throw new Error('No problem ID');
}
const problemId = decodeURIComponent(pathMatch[1]);
document.title = `Problem ${problemId} - WYK Maths Team`;

const mainContainer = document.getElementById('mainContent');
let userStates = {};
let imageData = '';
let cooldown = false;
let pollTimer = null;
let currentMode = 'numeric';
let timerInterval = null;
let timerSeconds = 0;
let timerRunning = false;
let currentProblemName = '';

// ============ Timer 持久化 ============
const TIMER_KEY = `timer_${problemId}`;
const saveTimer = () => localStorage.setItem(TIMER_KEY, timerSeconds.toString());
const clearTimer = () => localStorage.removeItem(TIMER_KEY);
function loadTimer() {
  const saved = localStorage.getItem(TIMER_KEY);
  const val = saved !== null ? parseInt(saved, 10) : 0;
  timerSeconds = (!isNaN(val) && val >= 0) ? val : 0;
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[m]);
}

// ============ 狀態徽章 CSS（動態注入一次）============
(function injectFeedbackBoxCSS() {
  if (document.getElementById('feedback-box-style')) return;
  const s = document.createElement('style');
  s.id = 'feedback-box-style';
  s.textContent = `
    .feedback-box {
      display: inline-block;
      padding: 0.3rem 0.9rem;
      border-radius: 4px;
      border: 1px solid;
      font-weight: 600;
      text-decoration: none;
      cursor: pointer;
      font-size: 0.9rem;
      transition: filter 0.15s, transform 0.1s;
    }
    .feedback-box:hover { filter: brightness(0.94); transform: translateY(-1px); }
    .feedback-box:active { transform: translateY(0); }
    .feedback-box.status-accepted { background: #d4edda; color: #155724; border-color: #c3e6cb; }
    .feedback-box.status-wrong    { background: #f8d7da; color: #721c24; border-color: #f5c6cb; }
    .feedback-box.status-partial  { background: #fff3cd; color: #856404; border-color: #ffeeba; }
    .feedback-box.status-system   { background: #e2e3e5; color: #383d41; border-color: #d6d8db; }
    .feedback-box.status-pending  { background: #eee;    color: #666;    border-color: #d6d8db; }
    [data-theme="dark"] .feedback-box.status-accepted { background: #1b4d2e; color: #8fdf8f; border-color: #2e6b3e; }
    [data-theme="dark"] .feedback-box.status-wrong    { background: #4d1b1b; color: #df8f8f; border-color: #6b2e2e; }
    [data-theme="dark"] .feedback-box.status-partial  { background: #4d3e1b; color: #dfc88f; border-color: #6b562e; }
    [data-theme="dark"] .feedback-box.status-system   { background: #2d2d2d; color: #bbb;    border-color: #444; }
    [data-theme="dark"] .feedback-box.status-pending  { background: #2d2d2d; color: #999;    border-color: #444; }
  `;
  document.head.appendChild(s);
})();

function statusBoxHtml(subid, text, cls) {
  if (!subid) return text;
  const url = `/submissions/${encodeURIComponent(subid)}/detail`;
  return `<a href="${url}" class="feedback-box ${cls}">${escapeHtml(text)}</a>`;
}

// ============ 題目載入 ============
async function loadProblem() {
  try {
    const cdnUrl = `https://cdn.jsdelivr.net/gh/wyk-math-team/resources/static/_problems/${problemId}.json`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1000);
    const res = await fetch(cdnUrl, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (res.ok) {
      const data = await res.json();
      return {
        success: true,
        problem: {
          id: problemId,
          name: data.name || problemId,
          statement: data.statement || '',
          difficulty: data.difficulty ?? 0,
          tags: data.tags || [],
          ...data
        }
      };
    }
  } catch (e) { /* 走 API 回退 */ }

  try {
    const data = await apiCall(`/api/problem?id=${encodeURIComponent(problemId)}`);
    if (data.success && data.problem) {
      return {
        success: true,
        problem: {
          id: problemId,
          name: data.problem.name || problemId,
          statement: data.problem.statement || '',
          difficulty: data.problem.difficulty ?? 0,
          tags: data.problem.tags || [],
          ...data.problem
        }
      };
    }
  } catch (e) { /* ignore */ }

  return { success: false, problem: null };
}

const domPurifyConfig = {
  ALLOWED_TAGS: ['b', 'i', 'u', 'strong', 'em', 'a', 'p', 'br', 'ul', 'ol', 'li', 'span', 'div', 'code', 'pre', 'svg', 'g', 'defs', 'clipPath', 'foreignObject', 'path', 'circle', 'line', 'polyline', 'polygon', 'rect', 'text', 'tspan', 'linearGradient', 'radialGradient', 'stop', 'image', 'use', 'img'],
  ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'id', 'style', 'xmlns', 'viewBox', 'width', 'height', 'd', 'cx', 'cy', 'r', 'x', 'y', 'x1', 'x2', 'y1', 'y2', 'points', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'fill-opacity', 'stroke-opacity', 'opacity', 'font-size', 'text-anchor', 'dominant-baseline', 'transform', 'src'],
  ALLOW_DATA_ATTR: true
};

// ============ 狀態圖標 ============
function updateProblemDetailIcon(pid, pname) {
  const state = userStates[pid] || 'not_started';
  const iconEl = document.getElementById('detailStatusIcon');
  if (iconEl) {
    if (state === 'passed') iconEl.innerHTML = '<i class="fa fa-check-circle fa-green"></i>';
    else if (state === 'failed') iconEl.innerHTML = '<i class="fa fa-times-circle fa-red"></i>';
    else iconEl.innerHTML = '';
  }
  if (pname) document.title = pname + ' - WYK Maths Team';
}

// ============ 圖片提交狀態輪詢 ============
function startImageStatusPoll() {
  clearInterval(pollTimer);
  let attempts = 0;
  pollTimer = setInterval(async () => {
    attempts++;
    if (attempts > 120) {
      clearInterval(pollTimer);
      document.getElementById('detailSpinner').style.display = 'none';
      document.getElementById('detailStatusIcon').style.display = '';
      document.getElementById('detailStatusText').textContent = 'Timed out';
      return;
    }
    try {
      const data = await apiCall(`/api/submissions?problem_id=${encodeURIComponent(problemId)}`);
      if (!data.success) return;
      const sub = data.submissions[0];
      if (sub && sub.type === 'image' && sub.marked) {
        clearInterval(pollTimer);
        const status = sub.status;
        document.getElementById('detailSpinner').style.display = 'none';
        const iconEl = document.getElementById('detailStatusIcon');
        iconEl.style.display = 'inline';
        if (status === 'Accepted') {
          iconEl.innerHTML = '<i class="fa fa-check-circle fa-green"></i>';
          userStates[problemId] = 'passed';
        } else if (status === 'Wrong Answer') {
          iconEl.innerHTML = '<i class="fa fa-times-circle fa-red"></i>';
          if (userStates[problemId] !== 'passed') userStates[problemId] = 'failed';
        } else if (status.startsWith('Partial Score')) {
          iconEl.innerHTML = '<i class="fa fa-exclamation-triangle fa-yellow"></i>';
          if (userStates[problemId] !== 'passed') userStates[problemId] = 'failed';
        } else {
          iconEl.innerHTML = '<span style="color:#888;">-</span>';
        }
        document.getElementById('detailStatusText').textContent = status;
        updateProblemDetailIcon(problemId, currentProblemName);
      }
    } catch (e) { /* ignore */ }
  }, 5000);
}

// ============ Timer ============
function updateTimerDisplay() {
  const display = document.getElementById('timerDisplay');
  if (!display) return;
  const hrs = Math.floor(timerSeconds / 3600);
  const mins = Math.floor((timerSeconds % 3600) / 60);
  const secs = timerSeconds % 60;
  display.textContent = `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}
function startTimer() {
  if (timerRunning) return;
  timerRunning = true;
  timerInterval = setInterval(() => { timerSeconds++; updateTimerDisplay(); }, 1000);
}
function pauseTimer() {
  if (!timerRunning) return;
  timerRunning = false;
  clearInterval(timerInterval);
}
function resetTimer() {
  pauseTimer();
  timerSeconds = 0;
  updateTimerDisplay();
  clearTimer();
}
function toggleTimer() {
  const existing = document.getElementById('timerRow');
  if (existing) {
    pauseTimer();
    saveTimer();
    existing.remove();
    return;
  }
  const container = document.getElementById('splitContainer');
  if (!container) return;

  loadTimer();
  timerRunning = false;

  const div = document.createElement('div');
  div.id = 'timerRow';
  div.className = 'timer-row';
  div.innerHTML = `
    <span class="timer-display" id="timerDisplay">00:00:00</span>
    <button class="timer-btn" id="timerStartBtn">Start</button>
    <button class="timer-btn" id="timerPauseBtn">Pause</button>
    <button class="timer-btn" id="timerResetBtn">Reset</button>
    <button class="timer-btn" id="timerCloseBtn">✕</button>
  `;
  container.parentNode.insertBefore(div, container);
  updateTimerDisplay();

  document.getElementById('timerStartBtn').addEventListener('click', startTimer);
  document.getElementById('timerPauseBtn').addEventListener('click', pauseTimer);
  document.getElementById('timerResetBtn').addEventListener('click', resetTimer);
  document.getElementById('timerCloseBtn').addEventListener('click', () => {
    pauseTimer();
    saveTimer();
    div.remove();
  });
}

// ============ 導航 ============
async function setupNavigation(currentProblem) {
  const navContainer = document.getElementById('navButtons');
  if (!navContainer) return;
  let ids = [];
  try {
    const cached = localStorage.getItem('problemListCache_full');
    if (cached) {
      const data = JSON.parse(cached);
      if (data.timestamp && (Date.now() - data.timestamp < 24 * 60 * 60 * 1000)) {
        if (data.problems && data.problems.length) ids = data.problems.map(p => p.id);
      }
    }
    if (!ids.length) {
      const res = await apiCall('/api/problem?ids=1');
      if (res.success && res.ids) ids = res.ids;
      else { navContainer.innerHTML = ''; return; }
    }
    ids.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const idx = ids.indexOf(currentProblem.id);
    if (idx === -1) { navContainer.innerHTML = ''; return; }

    let html = '';
    if (idx > 0) html += `<a href="/problems/${encodeURIComponent(ids[idx - 1])}" class="back-btn" title="Previous Problem">← Prev</a>`;
    if (idx < ids.length - 1) html += `<a href="/problems/${encodeURIComponent(ids[idx + 1])}" class="back-btn" title="Next Problem">Next →</a>`;
    navContainer.innerHTML = html;
  } catch (e) {
    console.error('Navigation setup error:', e);
    navContainer.innerHTML = '';
  }
}

// ============ PDF.js 動態載入 ============
let _pdfjsLoadingPromise = null;
function loadPdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (_pdfjsLoadingPromise) return _pdfjsLoadingPromise;

  _pdfjsLoadingPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    s.onload = () => {
      if (!window.pdfjsLib) return reject(new Error('pdfjsLib not defined'));
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      resolve(window.pdfjsLib);
    };
    s.onerror = () => reject(new Error('Failed to load PDF.js'));
    document.head.appendChild(s);
  });

  return _pdfjsLoadingPromise;
}

// ============ PDF.js 渲染 ============
async function renderPdfWithPdfJs(container, pdfUrl) {
  container.innerHTML = `
    <div class="pdf-loading">
      <span class="spinner"></span> Loading PDF...
    </div>
  `;

  let pdfjsLib;
  try {
    pdfjsLib = await loadPdfJs();
  } catch (err) {
    console.error(err);
    container.innerHTML = `
      <div class="pdf-error">
        <i class="fas fa-exclamation-triangle"></i>
        <p>Failed to load PDF viewer</p>
        <a href="${escapeHtml(pdfUrl)}" target="_blank" rel="noopener">Open in new tab</a>
      </div>`;
    return;
  }

  try {
    const pdf = await pdfjsLib.getDocument({ url: pdfUrl }).promise;

    // 清空 loading，開始逐頁渲染
    container.innerHTML = '';

    const dpr = window.devicePixelRatio || 1;

    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const unscaledViewport = page.getViewport({ scale: 1 });

      // 依容器寬度縮放；如果容器寬度為 0（尚未 layout），退回到 800
      const containerWidth = (container.clientWidth || container.offsetWidth || 800) - 8;
      const scale = containerWidth / unscaledViewport.width;
      const viewport = page.getViewport({ scale: scale * dpr });

      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.width = Math.floor(viewport.width / dpr) + 'px';
      canvas.style.height = Math.floor(viewport.height / dpr) + 'px';
      canvas.className = 'pdf-page-canvas';
      container.appendChild(canvas);

      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport }).promise;
    }
  } catch (err) {
    console.error('PDF render error:', err);
    container.innerHTML = `
      <div class="pdf-error">
        <i class="fas fa-exclamation-triangle"></i>
        <p>Failed to load PDF</p>
        <a href="${escapeHtml(pdfUrl)}" target="_blank" rel="noopener">Open in new tab</a>
      </div>`;
  }
}

// ============ PDF + Quiz 左右分欄 ============
function mountPdfQuizSplit() {
  const pdfMount = document.getElementById('pdf-quiz-split');
  if (!pdfMount) return;

  const pdfUrl = pdfMount.dataset.pdf;
  if (!pdfUrl) return;

  let absolutePdfUrl;
  try {
    absolutePdfUrl = new URL(pdfUrl, location.href).href;
  } catch {
    absolutePdfUrl = pdfUrl;
  }

  // CSS 只注入一次
  if (!document.getElementById('pdf-quiz-split-style')) {
    const styleEl = document.createElement('style');
    styleEl.id = 'pdf-quiz-split-style';
    styleEl.textContent = `
      .pdf-quiz-split {
        display: flex;
        gap: 1rem;
        align-items: stretch;
        margin-top: 0.5rem;
      }
      .pdf-quiz-split > .pdf-quiz-left,
      .pdf-quiz-split > .pdf-quiz-right {
        flex: 1 1 50%;
        min-width: 0;
        display: flex;
        flex-direction: column;
        border: 1px solid var(--border-color);
        border-radius: 6px;
        overflow: hidden;
        background: var(--card-bg);
      }
      .pdf-quiz-split > .pdf-quiz-left {
        height: 85vh;
      }
      .pdf-quiz-split > .pdf-quiz-right {
        overflow-y: auto;
        max-height: 85vh;
        padding: 0.6rem;
      }
      .pdf-viewer-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 6px 12px;
        background: #f0f2f5;
        border-bottom: 1px solid var(--border-color);
        font-size: 0.85rem;
        flex-shrink: 0;
      }
      [data-theme="dark"] .pdf-viewer-header { background: #21262d; }
      .pdf-viewer-title { font-weight: 700; color: var(--text-primary); }
      .pdf-open-btn {
        color: var(--accent);
        text-decoration: none;
        font-weight: 600;
        display: inline-flex;
        align-items: center;
        gap: 5px;
      }
      .pdf-open-btn:hover { text-decoration: underline; }
      .pdf-pages-scroll {
        flex: 1 1 auto;
        overflow-y: auto;
        overflow-x: hidden;
        background: #525659;
        padding: 6px 0;
        -webkit-overflow-scrolling: touch;
        min-height: 0;
      }
      .pdf-page-canvas {
        display: block;
        margin: 0 auto 8px auto;
        box-shadow: 0 1px 4px rgba(0,0,0,0.3);
        background: #fff;
      }
      .pdf-loading, .pdf-error {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        color: var(--text-secondary);
        padding: 2rem 1rem;
        text-align: center;
        gap: 0.5rem;
      }
      .pdf-loading .spinner {
        width: 24px; height: 24px;
        border: 3px solid rgba(255,255,255,0.25);
        border-top-color: #fff;
        border-radius: 50%;
        animation: pdfSpin 0.8s linear infinite;
      }
      @keyframes pdfSpin { to { transform: rotate(360deg); } }
      .pdf-error i { font-size: 2rem; color: var(--danger); }
      .pdf-error a { color: var(--accent); font-weight: 600; }

      @media (max-width: 900px) {
        .pdf-quiz-split {
          flex-direction: column;
        }
        .pdf-quiz-split > .pdf-quiz-left {
          height: 60vh;
        }
        .pdf-quiz-split > .pdf-quiz-right {
          max-height: none;
        }
      }
    `;
    document.head.appendChild(styleEl);
  }

  // 把 PDF 與 quiz 包進同一個 flex 容器
  const quizMount = document.getElementById('mc-quiz-mount');
  if (quizMount && quizMount.parentNode === pdfMount.parentNode) {
    const wrapper = document.createElement('div');
    wrapper.className = 'pdf-quiz-split';
    pdfMount.parentNode.insertBefore(wrapper, pdfMount);

    pdfMount.classList.add('pdf-quiz-left');
    quizMount.classList.add('pdf-quiz-right');

    wrapper.appendChild(pdfMount);
    wrapper.appendChild(quizMount);
  } else {
    pdfMount.classList.add('pdf-quiz-left');
    pdfMount.style.maxWidth = '100%';
  }

  // 渲染 PDF viewer 外殼
  pdfMount.innerHTML = `
    <div class="pdf-viewer-header">
      <span class="pdf-viewer-title">📄 PDF</span>
      <a href="${escapeHtml(absolutePdfUrl)}" target="_blank" rel="noopener" class="pdf-open-btn">
        <i class="fas fa-external-link-alt"></i> Open in new tab
      </a>
    </div>
    <div class="pdf-pages-scroll" id="pdf-pages-scroll"></div>
  `;

  const scrollContainer = pdfMount.querySelector('.pdf-pages-scroll');
  renderPdfWithPdfJs(scrollContainer, absolutePdfUrl);

  // 讓 statementContent 佔滿寬度
  const stmtContent = document.getElementById('statementContent');
  if (stmtContent) {
    stmtContent.style.flex = '1 1 100%';
    stmtContent.style.maxWidth = '100%';
  }
  // 隱藏 drawpad 相關
  const splitDivider = document.getElementById('splitDivider');
  if (splitDivider) splitDivider.style.display = 'none';
  const drawpadWrapper = document.getElementById('drawpadWrapper');
  if (drawpadWrapper) drawpadWrapper.style.display = 'none';

  // 視窗尺寸變化時重新渲染（讓 canvas 寬度跟著更新）
  if (!window.__pdfResizeHandler) {
    let resizeTimer = null;
    window.__pdfResizeHandler = () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const sc = document.getElementById('pdf-pages-scroll');
        if (sc && sc.dataset.pdfUrl) {
          renderPdfWithPdfJs(sc, sc.dataset.pdfUrl);
        }
      }, 300);
    };
    window.addEventListener('resize', window.__pdfResizeHandler);
  }
  if (scrollContainer) scrollContainer.dataset.pdfUrl = absolutePdfUrl;
}

// ============ MC 表格掛載 ============
function mountMcQuiz() {
  const mount = document.getElementById('mc-quiz-mount');
  if (!mount) return;

  if (!document.getElementById('mc-quiz-style')) {
    const styleEl = document.createElement('style');
    styleEl.id = 'mc-quiz-style';
    styleEl.textContent = `
      .mc-table {
        width: 100%;
        max-width: 420px;
        border-collapse: collapse;
        margin: 0 auto 1rem;
        font-size: 0.95rem;
      }
      .mc-table th, .mc-table td {
        border: 1px solid var(--border-color);
        padding: 0.35rem 0.5rem;
        text-align: center;
        vertical-align: middle;
      }
      .mc-table th {
        background: #f0f2f5;
        font-weight: 700;
        font-size: 0.85rem;
      }
      [data-theme="dark"] .mc-table th { background: #2d2d2d; }
      .mc-table td:first-child {
        font-weight: 600;
        color: var(--text-secondary);
        background: #fafafa;
        width: 3em;
      }
      [data-theme="dark"] .mc-table td:first-child { background: #252525; }
      .mc-table input[type="radio"] {
        cursor: pointer;
        margin: 0;
        width: 16px;
        height: 16px;
        accent-color: var(--accent);
      }
      .mc-table tr.mc-sep td { border-bottom: 2px solid var(--accent); }
      .mc-submit-btn {
        display: block;
        margin: 0.8rem auto 1.5rem;
        padding: 0.65rem 3rem;
        background: #28a745;
        color: #fff;
        border: none;
        border-radius: 6px;
        font-size: 1rem;
        font-weight: 700;
        cursor: pointer;
        letter-spacing: 1px;
        transition: background 0.15s;
      }
      .mc-submit-btn:hover { background: #218838; }
      .mc-submit-btn:disabled { background: #6c757d; cursor: not-allowed; }
    `;
    document.head.appendChild(styleEl);
  }

  const rawTotal = parseInt(mount.dataset.total, 10);
  const TOTAL = (Number.isFinite(rawTotal) && rawTotal >= 1 && rawTotal <= 200) ? rawTotal : 45;
  const SEP_EVERY = 5;

  let html = `
    <p style="color:var(--text-secondary);font-size:.9rem;margin:.5rem 0 .8rem 0;">
      Select one option (A/B/C/D) for each question. Unanswered questions will be submitted as <code>X</code>.
    </p>
    <table class="mc-table">
      <thead>
        <tr><th>#</th><th>A</th><th>B</th><th>C</th><th>D</th></tr>
      </thead>
      <tbody>
  `;
  for (let i = 1; i <= TOTAL; i++) {
    const sep = (i % SEP_EVERY === 0 && i < TOTAL) ? ' class="mc-sep"' : '';
    html += `<tr${sep}>
      <td>${i}</td>
      <td><input type="radio" name="mcq-${i}" value="A"></td>
      <td><input type="radio" name="mcq-${i}" value="B"></td>
      <td><input type="radio" name="mcq-${i}" value="C"></td>
      <td><input type="radio" name="mcq-${i}" value="D"></td>
    </tr>`;
  }
  html += `
      </tbody>
    </table>
    <button id="mc-submit-btn" class="mc-submit-btn">submit</button>
  `;
  mount.innerHTML = html;

  const answerInputEl = document.getElementById('answerInput');

  function syncRadiosFromInput() {
    const str = (answerInputEl?.value || '').trim().toUpperCase();
    for (let i = 1; i <= TOTAL; i++) {
      const ch = str[i - 1];
      const radios = mount.querySelectorAll(`input[name="mcq-${i}"]`);
      radios.forEach(r => { r.checked = false; });
      if (ch && 'ABCD'.includes(ch)) {
        const radio = mount.querySelector(`input[name="mcq-${i}"][value="${ch}"]`);
        if (radio) radio.checked = true;
      }
    }
  }

  function syncInputFromRadios() {
    let ans = '';
    for (let i = 1; i <= TOTAL; i++) {
      const sel = mount.querySelector(`input[name="mcq-${i}"]:checked`);
      ans += sel ? sel.value : 'X';
    }
    ans = ans.replace(/X+$/, '');
    if (answerInputEl) answerInputEl.value = ans;
  }

  if (answerInputEl) {
    answerInputEl.addEventListener('input', syncRadiosFromInput);
  }

  mount.querySelectorAll('input[type="radio"]').forEach(r => {
    r.addEventListener('mousedown', function () {
      this.dataset.wasChecked = this.checked ? '1' : '0';
    });
    r.addEventListener('click', function () {
      if (this.dataset.wasChecked === '1') {
        this.checked = false;
        this.dataset.wasChecked = '0';
      }
      syncInputFromRadios();
    });
    r.addEventListener('change', syncInputFromRadios);
  });

  syncRadiosFromInput();

  const submitMcBtn = mount.querySelector('#mc-submit-btn');
  if (submitMcBtn) {
    submitMcBtn.addEventListener('click', () => {
      let answer = '';
      for (let i = 1; i <= TOTAL; i++) {
        const sel = mount.querySelector(`input[name="mcq-${i}"]:checked`);
        answer += sel ? sel.value : 'X';
      }

      currentMode = 'numeric';
      document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
      const numBtn = document.getElementById('modeNumeric');
      if (numBtn) numBtn.classList.add('active');
      document.getElementById('textAnswerGroup').style.display = 'block';
      document.getElementById('imageAnswerGroup').style.display = 'none';
      document.getElementById('expressionAnswerGroup').style.display = 'none';

      const input = document.getElementById('answerInput');
      if (input) input.value = answer;

      const submitBtn = document.getElementById('checkAnswerBtn');
      if (submitBtn && !submitBtn.disabled) {
        submitBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      }
    });
  }
}

// ============ 主流程 ============
async function initPage() {
  try {
    mainContainer.innerHTML = '';

    const preloadPromise = apiCall('/api/users?action=preload')
      .then(res => {
        if (res.success) {
          userStates = res.states || {};
          window.favorites = new Set(res.favorites || []);
        } else {
          userStates = {};
          window.favorites = new Set();
        }
      })
      .catch(() => { userStates = {}; window.favorites = new Set(); });

    const problemResult = await loadProblem();
    if (!problemResult.success || !problemResult.problem) {
      mainContainer.innerHTML = '<div class="error-msg">Problem not found. Please try again later.</div>';
      return;
    }

    const problem = problemResult.problem;
    const diff = problem.difficulty ?? 0;
    currentProblemName = problem.name || problemId;
    const isAdmin = (getCurrentUser()?.role === 'admin' || getCurrentUser()?.role === 'root');

    mainContainer.innerHTML = `
      <div class="problem-detail" id="problemDetailShell">
        <div class="detail-header">
          <button class="back-btn" id="backToListBtn">← Back</button>
          <span class="problem-name-detail">
            <span id="detailProblemName">${escapeHtml(currentProblemName)}</span>
            <span id="detailStatusIcon"></span>
            <span id="detailSpinner" class="spinner" style="display:none"></span>
            <span id="detailStatusText" style="margin-left:.5rem;font-size:.9rem"></span>
            <span id="detailFavorite" style="margin-left:8px;cursor:pointer">
              <i class="far fa-star" style="font-size:1.2rem;color:#aaa"></i>
            </span>
          </span>
          <span id="detailEditBtn"></span>
          <span style="margin-left:auto;font-size:.8rem">
            <span id="detailDifficulty">Lv.${diff === 0 ? '∞' : diff.toFixed(2)}</span>
          </span>
          <span style="font-size:0.8rem" id="detailTags">${(problem.tags || []).join(', ')}</span>
          <span style="display:flex;gap:0.5rem;align-items:center;">
            <span id="navButtons" style="display:flex;gap:0.5rem;"></span>
            <button id="reportBtn" class="back-btn" style="color:var(--danger);">Report</button>
          </span>
        </div>
        <div class="answer-area">
          <div class="mode-switch">
            <button id="modeNumeric" class="mode-btn active" data-mode="numeric">Numeric</button>
            <button id="modePhoto" class="mode-btn" data-mode="photo">Photo</button>
            <button id="modeExpression" class="mode-btn" data-mode="expression">Expression</button>
          </div>
          <div id="textAnswerGroup">
            <label>Your Answer:</label>
            <input type="text" id="answerInput" class="answer-input" placeholder="Enter answer">
          </div>
          <div id="imageAnswerGroup" style="display:none">
            <label>Upload Image (max 1):</label>
            <input type="file" id="imageFileInput" accept="image/*" style="display:none">
            <button id="pickImageBtn" class="check-btn">Choose / Take Photo</button>
            <img id="imagePreview" style="max-width:150px;display:none;margin-left:10px">
            <button id="removeImageBtn" style="display:none">✕</button>
          </div>
          <div id="expressionAnswerGroup" style="display:none">
            <label>Expression:</label>
            <input type="text" id="exprInput" placeholder="e.g. (1+2*sqrt(3))/4">
            <span id="exprPreview"></span>
          </div>
          <button id="checkAnswerBtn" class="check-btn">Submit</button>
          <button id="submissionsBtn" class="submissions-btn">Submissions</button>
          <button id="timerToggleBtn" class="submissions-btn">Timer</button>
          <span id="feedbackMsg" class="feedback"></span>
          <span id="loadingSpinner" class="spinner" style="display:none"></span>
        </div>
        <div class="split-container" id="splitContainer">
          <div class="statement-content" id="statementContent"></div>
          <div class="split-divider" id="splitDivider" style="display:none"></div>
          <div class="drawpad-wrapper" id="drawpadWrapper" style="display:none"></div>
        </div>
        <div id="nekoContainer" style="display:none; margin: 1rem 0; text-align: center;">
          <div id="nekoStatus" style="font-size: 0.9rem; color: var(--text-secondary); padding: 0.5rem;">Loading...</div>
          <img id="nekoImage" src="" alt="Neko" style="max-width: 100%; max-height: 300px; border-radius: 8px; box-shadow: 0 0 20px rgba(0,0,0,0.2); display: none;">
        </div>
        <div id="discussionToggleArea" style="margin-top:2rem;border-top:1px solid var(--border-color);padding-top:1rem;display:none">
          <button id="expandDiscussionsBtn">Expand Discussions</button>
          <div id="discussionSection" style="display:none">
            <h3>Discussion</h3>
            <div id="discussionList"></div>
            <div class="new-post">
              <textarea id="discussionContent" rows="3" placeholder="Write a comment... (LaTeX supported)"></textarea>
              <button id="postDiscussionBtn">Post</button>
            </div>
          </div>
        </div>

        <div id="reportModal" class="report-modal-overlay" style="display:none">
          <div class="report-modal">
            <h3>Report Problem</h3>
            <p class="report-modal-hint">Please describe the issue you found. Your username will be recorded.</p>
            <textarea id="reportReason" rows="4" maxlength="1000"
              placeholder="e.g. Typo in statement, wrong answer key, broken image, unclear wording..."></textarea>
            <div class="report-modal-actions">
              <button class="btn-secondary" id="reportCancelBtn">Cancel</button>
              <button class="btn-primary" id="reportSubmitBtn">Submit Report</button>
            </div>
          </div>
        </div>
      </div>
    `;

    const statementContent = document.getElementById('statementContent');
    if (statementContent) {
      const statementHtml = problem.statement ? DOMPurify.sanitize(problem.statement, domPurifyConfig) : '';
      statementContent.innerHTML = statementHtml;
      if (typeof renderMathInElement !== 'undefined') {
        renderMathInElement(statementContent, {
          delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }]
        });
      }
      mountPdfQuizSplit();
      mountMcQuiz();
    }

    await preloadPromise;

    const isFav = window.favorites.has(problemId);
    const currentState = userStates[problemId] || 'not_started';

    if (isAdmin) {
      document.getElementById('detailEditBtn').innerHTML =
        `<a href="/admin/problems/${encodeURIComponent(problemId)}" class="back-btn" style="margin-left:0.5rem;" title="Edit problem">edit</a>`;
    }

    updateProblemDetailIcon(problemId, currentProblemName);

    const starIcon = document.querySelector('#detailFavorite i');
    if (starIcon) {
      starIcon.className = isFav ? 'fas fa-star' : 'far fa-star';
      starIcon.style.color = isFav ? '#f1c40f' : '#aaa';
    }

    const hasAccess = isAdmin || currentState === 'passed';
    const toggleArea = document.getElementById('discussionToggleArea');
    if (hasAccess && toggleArea) {
      toggleArea.style.display = 'block';
      document.getElementById('expandDiscussionsBtn').addEventListener('click', function () {
        const section = document.getElementById('discussionSection');
        if (section.style.display === 'none' || !section.style.display) {
          section.style.display = 'block';
          this.innerHTML = 'Hide Discussions';
          if (!section.dataset.loaded) {
            loadDiscussions(problemId);
            section.dataset.loaded = 'true';
          }
        } else {
          section.style.display = 'none';
          this.innerHTML = 'Expand Discussions';
        }
      });
    }

    document.getElementById('reportBtn').addEventListener('click', function () {
      document.getElementById('reportReason').value = '';
      document.getElementById('reportModal').style.display = 'flex';
      setTimeout(() => document.getElementById('reportReason').focus(), 50);
    });

    document.getElementById('reportCancelBtn').addEventListener('click', function () {
      document.getElementById('reportModal').style.display = 'none';
    });

    document.getElementById('reportModal').addEventListener('click', function (e) {
      if (e.target === this) this.style.display = 'none';
    });

    document.getElementById('reportSubmitBtn').addEventListener('click', async function () {
      const reason = document.getElementById('reportReason').value.trim();
      if (!reason) {
        alert('Please describe the issue before submitting.');
        return;
      }
      this.disabled = true;
      this.textContent = 'Submitting...';
      try {
        const res = await apiCall('/api/problem?action=report', 'POST', { problemId, reason });
        if (res.success) {
          document.getElementById('reportModal').style.display = 'none';
          alert('Report submitted. Thank you!');
        } else {
          alert('Failed to submit report: ' + (res.message || 'Unknown error'));
        }
      } catch (err) {
        alert('Network error. Please try again.');
      } finally {
        this.disabled = false;
        this.textContent = 'Submit Report';
      }
    });

    document.getElementById('detailFavorite').addEventListener('click', async function () {
      const icon = this.querySelector('i');
      if (!icon) return;
      const wasFav = icon.classList.contains('fas');
      const revert = () => {
        if (wasFav) { icon.className = 'fas fa-star'; icon.style.color = '#f1c40f'; }
        else { icon.className = 'far fa-star'; icon.style.color = '#aaa'; }
      };
      if (wasFav) { icon.className = 'far fa-star'; icon.style.color = '#aaa'; }
      else { icon.className = 'fas fa-star'; icon.style.color = '#f1c40f'; }
      try {
        const res = await apiCall('/api/users?action=favorite', 'POST', { problemId });
        if (!res.success) revert();
      } catch (e) { revert(); }
    });

    bindSubmitEvent();
    bindStaticEvents();
    await setupNavigation(problem);
  } catch (err) {
    console.error('initPage error:', err);
    mainContainer.innerHTML = `<div class="error-msg">Failed to load problem: ${err.message}</div>`;
  }
}

// ============ 靜態事件綁定 ============
function bindStaticEvents() {
  document.getElementById('backToListBtn').addEventListener('click', () => history.back());
  document.getElementById('submissionsBtn').addEventListener('click', () => {
    window.location.href = `/submissions/problem/${problemId}`;
  });

  const modeButtons = document.querySelectorAll('.mode-btn');
  const textGroup = document.getElementById('textAnswerGroup');
  const imageGroup = document.getElementById('imageAnswerGroup');
  const exprGroup = document.getElementById('expressionAnswerGroup');
  const answerInput = document.getElementById('answerInput');
  const exprInput = document.getElementById('exprInput');

  modeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      currentMode = mode;
      modeButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      textGroup.style.display = mode === 'numeric' ? 'block' : 'none';
      imageGroup.style.display = mode === 'photo' ? 'block' : 'none';
      exprGroup.style.display = mode === 'expression' ? 'block' : 'none';

      if (mode === 'numeric') {
        answerInput.setAttribute('inputmode', 'decimal');
        answerInput.setAttribute('type', 'text');
        answerInput.placeholder = 'Enter a number';
        setTimeout(() => answerInput.focus(), 100);
      } else if (mode === 'expression') {
        exprInput.setAttribute('inputmode', 'text');
        setTimeout(() => exprInput.focus(), 100);
        updateExprPreview();
      }

      if (mode !== 'photo') {
        imageData = '';
        document.getElementById('imagePreview').style.display = 'none';
        document.getElementById('removeImageBtn').style.display = 'none';
        document.getElementById('imageFileInput').value = '';
      }
    });
  });

  const pickBtn = document.getElementById('pickImageBtn');
  const imageInput = document.getElementById('imageFileInput');
  pickBtn.addEventListener('click', () => {
    imageInput.removeAttribute('capture');
    imageInput.setAttribute('accept', 'image/*');
    imageInput.removeAttribute('multiple');
    imageInput.click();
  });
  imageInput.addEventListener('change', () => {
    const file = imageInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const maxWidth = 1500;
        let w = img.width, h = img.height;
        if (w > maxWidth) { h = Math.round((h * maxWidth) / w); w = maxWidth; }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        imageData = canvas.toDataURL('image/jpeg', 0.95);
        const preview = document.getElementById('imagePreview');
        preview.src = imageData;
        preview.style.display = 'inline-block';
        document.getElementById('removeImageBtn').style.display = 'inline-block';
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
  document.getElementById('removeImageBtn').addEventListener('click', () => {
    imageData = '';
    document.getElementById('imagePreview').style.display = 'none';
    document.getElementById('removeImageBtn').style.display = 'none';
    imageInput.value = '';
  });

  const exprPreview = document.getElementById('exprPreview');
  function updateExprPreview() {
    const rawExpr = exprInput.value.trim();
    if (!rawExpr) { exprPreview.innerHTML = ''; return; }
    try {
      const node = math.parse(rawExpr);
      const result = node.evaluate();
      const numResult = (typeof result === 'object' && result.isBigNumber) ? result.toNumber() : result;
      const latex = node.toTex();
      katex.render(latex, exprPreview, { throwOnError: false });
      exprPreview.innerHTML = `Result: ${numResult.toFixed(9)}&nbsp;` + exprPreview.innerHTML;
    } catch (e) {
      exprPreview.innerHTML = '<span style="color:red;">Invalid expression</span>';
    }
  }
  exprInput.addEventListener('input', updateExprPreview);

  document.getElementById('timerToggleBtn').addEventListener('click', toggleTimer);

  const dividerEl = document.getElementById('splitDivider');
  let splitDragging = false;
  dividerEl.addEventListener('mousedown', (e) => {
    e.preventDefault();
    splitDragging = true;
    document.getElementById('splitContainer').style.userSelect = 'none';
    document.addEventListener('mousemove', onSplitDrag);
    document.addEventListener('mouseup', onSplitDragEnd);
  });

  function onSplitDrag(e) {
    if (!splitDragging) return;
    const rect = document.getElementById('splitContainer').getBoundingClientRect();
    const percentLeft = ((e.clientX - rect.left) / rect.width) * 100;
    if (percentLeft >= 20 && percentLeft <= 80) {
      document.getElementById('statementContent').style.flex = `1 1 ${percentLeft}%`;
      document.getElementById('drawpadWrapper').style.flex = `1 1 ${100 - percentLeft}%`;
    }
  }
  function onSplitDragEnd() {
    splitDragging = false;
    document.getElementById('splitContainer').style.userSelect = '';
    document.removeEventListener('mousemove', onSplitDrag);
    document.removeEventListener('mouseup', onSplitDragEnd);
  }
}

// ============ 提交 ============
function bindSubmitEvent() {
  const checkBtn = document.getElementById('checkAnswerBtn');
  const fb = document.getElementById('feedbackMsg');

  checkBtn.addEventListener('mousedown', async (e) => {
    e.preventDefault();
    if (cooldown) return;
    const spinner = document.getElementById('loadingSpinner');
    let answer = '';
    let type = 'text';
    let image = '';

    if (currentMode === 'photo') {
      type = 'image';
      image = imageData;
      if (!image) {
        fb.textContent = 'Please select an image';
        fb.className = 'feedback wrong';
        return;
      }
    } else if (currentMode === 'expression') {
      const rawExpr = document.getElementById('exprInput').value.trim();
      if (!rawExpr) {
        fb.textContent = 'Enter an expression';
        fb.className = 'feedback wrong';
        return;
      }
      try {
        const node = math.parse(rawExpr);
        const result = node.evaluate();
        const numResult = (typeof result === 'object' && result.isBigNumber) ? result.toNumber() : result;
        answer = String(numResult.toFixed(9));
      } catch (err) {
        fb.textContent = 'Invalid expression';
        fb.className = 'feedback wrong';
        return;
      }
    } else {
      const val = document.getElementById('answerInput').value.trim();
      if (!val) {
        fb.textContent = 'Enter answer';
        fb.className = 'feedback wrong';
        return;
      }
      answer = val;
    }

    cooldown = true;
    checkBtn.disabled = true;
    spinner.style.display = 'inline-block';
    fb.innerHTML = '';
    fb.className = '';

    let remaining = 5;
    checkBtn.textContent = `Wait ${remaining.toFixed(1)}s`;
    const countdown = setInterval(() => {
      remaining -= 0.1;
      if (remaining <= 0) {
        clearInterval(countdown);
        checkBtn.disabled = false;
        checkBtn.textContent = 'Submit';
        cooldown = false;
      } else {
        checkBtn.textContent = `Wait ${remaining.toFixed(1)}s`;
      }
    }, 100);

    try {
      const result = await apiCall('/api/submit', 'POST', { problemId, answer, type, image: image || '' });
      spinner.style.display = 'none';
      if (!result.success) return;

      if (result.message && result.message.includes('Image submitted')) {
        fb.innerHTML = statusBoxHtml(result.subid, 'Image submitted for marking', 'status-pending');
        document.getElementById('detailStatusIcon').style.display = 'none';
        document.getElementById('detailSpinner').style.display = 'inline-block';
        document.getElementById('detailStatusText').textContent = 'Pending';
        startImageStatusPoll();
      } else if (result.systemError) {
        fb.innerHTML = statusBoxHtml(result.subid, 'System Error', 'status-system');
      } else if (result.score !== undefined) {
        let txt, cls;
        if (result.score === 100) { txt = 'Accepted'; cls = 'status-accepted'; }
        else if (result.score === 0) { txt = 'Wrong Answer'; cls = 'status-wrong'; }
        else { txt = `Partial Score (${result.score}%)`; cls = 'status-partial'; }
        fb.innerHTML = statusBoxHtml(result.subid, txt, cls);
      } else {
        const txt = result.correct ? 'Accepted' : 'Wrong Answer';
        const cls = result.correct ? 'status-accepted' : 'status-wrong';
        fb.innerHTML = statusBoxHtml(result.subid, txt, cls);
        if (result.correct) {
          userStates[problemId] = 'passed';
          if (localStorage.getItem('nekoModeUnlocked') === 'true' &&
              localStorage.getItem('showNekos') === 'true') {
            fetchNekoAndShow();
          }
        } else if (userStates[problemId] !== 'passed') {
          userStates[problemId] = 'failed';
        }
        updateProblemDetailIcon(problemId, currentProblemName);
      }
    } catch (err) {
      spinner.style.display = 'none';
      fb.textContent = 'Network error';
      fb.className = 'feedback wrong';
    }
  });

  checkBtn.addEventListener('click', (e) => e.preventDefault());
}

// ============ Neko（裝飾）============
function fetchNekoAndShow() {
  const container = document.getElementById('nekoContainer');
  const img = document.getElementById('nekoImage');
  const status = document.getElementById('nekoStatus');
  if (!container || !img || !status) return;

  container.style.display = 'block';
  status.textContent = 'Loading neko...';
  status.style.color = 'var(--text-secondary)';
  status.style.display = 'block';
  img.style.display = 'none';
  img.src = '';

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  fetch('https://nekos.best/api/v2/neko', { signal: controller.signal })
    .then(res => {
      clearTimeout(timeoutId);
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      return res.json();
    })
    .then(data => {
      if (data.results && data.results.length > 0) {
        img.src = data.results[0].url;
        img.style.display = 'block';
        status.style.display = 'none';
        container.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        throw new Error('No neko results returned');
      }
    })
    .catch(err => {
      clearTimeout(timeoutId);
      const msg = err.name === 'AbortError' ? 'Request timed out' : err.message;
      status.textContent = `Load failed: ${msg}`;
      status.style.color = 'var(--danger)';
      img.style.display = 'none';
    });
}

// ============ 討論區 ============
async function loadDiscussions(problemId) {
  const listDiv = document.getElementById('discussionList');
  try {
    const data = await apiCall(`/api/problem?action=discussions&problemId=${encodeURIComponent(problemId)}`);
    if (!data.success) { listDiv.innerHTML = '<p>Failed to load discussions.</p>'; return; }

    const currentUsername = getCurrentUser()?.username;
    listDiv.innerHTML = data.discussions.map(d => {
      const liked = d.likedBy && d.likedBy.includes(currentUsername);
      return `
        <div class="discussion-post" data-id="${d._id}">
          <div class="post-header">
            <span class="post-user">${escapeHtml(d.username)}</span>
            <span class="post-time">${new Date(d.createdAt).toLocaleString('zh-HK', { timeZone: 'Asia/Hong_Kong' })}</span>
          </div>
          <div class="post-content">${DOMPurify.sanitize(d.content, domPurifyConfig)}</div>
          <div class="post-actions">
            <button class="like-btn ${liked ? 'liked' : ''}" data-id="${d._id}">
              ${liked ? '❤️' : '🤍'} <span class="likes-count">${d.likes || 0}</span>
            </button>
          </div>
        </div>`;
    }).join('') || '<p>No discussions yet.</p>';

    if (typeof renderMathInElement !== 'undefined') {
      renderMathInElement(listDiv, {
        delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }]
      });
    }

    listDiv.querySelectorAll('.like-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const discussionId = btn.dataset.id;
        const res = await apiCall('/api/problem?action=discussions', 'PUT', { action: 'like', discussionId });
        if (res.success) {
          const newLikes = res.discussion.likes;
          const isLiked = res.discussion.likedBy && res.discussion.likedBy.includes(currentUsername);
          btn.className = `like-btn ${isLiked ? 'liked' : ''}`;
          btn.innerHTML = `${isLiked ? '❤️' : '🤍'} <span class="likes-count">${newLikes}</span>`;
        }
      });
    });

    document.getElementById('postDiscussionBtn').addEventListener('click', async () => {
      const content = document.getElementById('discussionContent').value.trim();
      if (!content) return alert('Content is empty');
      const res = await apiCall('/api/problem?action=discussions', 'POST', { problemId, content });
      if (res.success) {
        document.getElementById('discussionContent').value = '';
        loadDiscussions(problemId);
      } else {
        alert(res.message || 'Error');
      }
    });
  } catch (err) {
    listDiv.innerHTML = '<p>Error loading discussions.</p>';
  }
}

initPage();
window.addEventListener('pagehide', () => {
  if (document.getElementById('timerRow')) {
    pauseTimer();
    saveTimer();
  }
  if (pollTimer) clearInterval(pollTimer);
  cooldown = false;
});
