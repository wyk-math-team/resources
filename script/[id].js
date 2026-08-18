
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

    const TIMER_KEY = `timer_${problemId}`;
    function saveTimer() { localStorage.setItem(TIMER_KEY, timerSeconds.toString()); }
    function loadTimer() {
      const saved = localStorage.getItem(TIMER_KEY);
      if (saved !== null) {
        const val = parseInt(saved, 10);
        if (!isNaN(val) && val >= 0) timerSeconds = val;
        else timerSeconds = 0;
      } else {
        timerSeconds = 0;
      }
    }
    function clearTimer() { localStorage.removeItem(TIMER_KEY); }

    function escapeHtml(str) {
      return String(str).replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[m]);
    }

    function tryRenderNameFromCache() {
      const cacheKey = `problemListCache_id_asc`;
      const cached = localStorage.getItem(cacheKey);
      if (!cached) {
        document.getElementById('detailProblemName').textContent = problemId;
        return;
      }
      try {
        const data = JSON.parse(cached);
        if (data.problems) {
          const found = data.problems.find(p => p.id === problemId);
          if (found) {
            document.getElementById('detailProblemName').textContent = found.name;
            if (found.tags) document.getElementById('detailTags').textContent = found.tags.join(', ');
            if (found.difficulty !== undefined) {
              document.getElementById('detailDifficulty').textContent = `Lv.${found.difficulty === 0 ? '∞' : found.difficulty.toFixed(2)}`;
            }
            currentProblemName = found.name;
          } else {
            document.getElementById('detailProblemName').textContent = problemId;
          }
        } else {
          document.getElementById('detailProblemName').textContent = problemId;
        }
      } catch (e) {
        document.getElementById('detailProblemName').textContent = problemId;
      }
    }

    async function loadUserStates() {
      try {
        const data = await apiCall('/api/users?action=stats');
        if (data.success) userStates = data.states;
      } catch (err) { userStates = {}; }
    }

    async function loadProblem() {
      try {
        const data = await apiCall(`/api/problem?id=${encodeURIComponent(problemId)}`);
        return data.success ? data.problem : null;
      } catch (err) { return null; }
    }

    async function loadFavorites() {
      try {
        const res = await apiCall('/api/users?action=favorites');
        return new Set(res.success ? res.favorites : []);
      } catch (e) { return new Set(); }
    }

    const domPurifyConfig = {
      ALLOWED_TAGS: ['b', 'i', 'u', 'strong', 'em', 'a', 'p', 'br', 'ul', 'ol', 'li', 'span', 'div', 'code', 'pre', 'svg', 'g', 'defs', 'clipPath', 'foreignObject', 'path', 'circle', 'line', 'polyline', 'polygon', 'rect', 'text', 'tspan', 'linearGradient', 'radialGradient', 'stop', 'image', 'use'],
      ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'id', 'style', 'xmlns', 'viewBox', 'width', 'height', 'd', 'cx', 'cy', 'r', 'x', 'y', 'x1', 'x2', 'y1', 'y2', 'points', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'fill-opacity', 'stroke-opacity', 'opacity', 'font-size', 'text-anchor', 'dominant-baseline', 'transform']
    };

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
        } catch (e) {}
      }, 5000);
    }

    function updateTimerDisplay() {
      const display = document.getElementById('timerDisplay');
      if (!display) return;
      const hrs = Math.floor(timerSeconds / 3600);
      const mins = Math.floor((timerSeconds % 3600) / 60);
      const secs = timerSeconds % 60;
      display.textContent = `${String(hrs).padStart(2,'0')}:${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
    }

    function startTimer() {
      if (!timerRunning) {
        timerRunning = true;
        timerInterval = setInterval(() => {
          timerSeconds++;
          updateTimerDisplay();
        }, 1000);
      }
    }

    function pauseTimer() {
      if (timerRunning) {
        timerRunning = false;
        clearInterval(timerInterval);
      }
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

    // ---------- 导航：上一题/下一题 ----------
    async function setupNavigation(currentProblem) {
      const navContainer = document.getElementById('navButtons');
      if (!navContainer) return;
      try {
        const res = await apiCall('/api/problem?ids=1');
        if (!res.success || !res.ids || res.ids.length === 0) {
          navContainer.innerHTML = '';
          return;
        }
        let ids = res.ids;
        ids.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        const idx = ids.indexOf(currentProblem.id);
        if (idx === -1) {
          navContainer.innerHTML = '';
          return;
        }
        let html = '';
        if (idx > 0) {
          const prevId = ids[idx - 1];
          html += `<a href="/problems/${encodeURIComponent(prevId)}" class="back-btn" title="Previous Problem">← Prev</a>`;
        }
        if (idx < ids.length - 1) {
          const nextId = ids[idx + 1];
          html += `<a href="/problems/${encodeURIComponent(nextId)}" class="back-btn" title="Next Problem">Next →</a>`;
        }
        navContainer.innerHTML = html;
      } catch (e) {
        console.error('Navigation setup error:', e);
        navContainer.innerHTML = '';
      }
    }

    async function initPage() {
      mainContainer.innerHTML = '';

      const userPromise = loadUserStates();
      const problemPromise = loadProblem();
      const favPromise = loadFavorites();

      const problem = await problemPromise;
      if (!problem) {
        mainContainer.innerHTML = '<div class="error-msg">Problem not found.</div>';
        return;
      }

      currentProblemName = problem.name || problemId;
      const isAdmin = (getCurrentUser()?.role === 'admin' || getCurrentUser()?.role === 'root');

      let detailHtml = `
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
              <span id="detailDifficulty">Lv.${problem.difficulty === 0 ? '∞' : problem.difficulty.toFixed(2)}</span>
            </span>
            <span style="font-size:0.8rem" id="detailTags">${(problem.tags || []).join(', ')}</span>
            <span id="navButtons" style="margin-left:auto;display:flex;gap:0.5rem;"></span>
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
        </div>
      `;

      mainContainer.innerHTML = detailHtml;

      const statementContent = document.getElementById('statementContent');
      const statementHtml = problem.statement ? DOMPurify.sanitize(problem.statement, domPurifyConfig) : '';
      statementContent.innerHTML = statementHtml;
      if (typeof renderMathInElement !== 'undefined') {
        renderMathInElement(statementContent, {
          delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }]
        });
      }

      await userPromise;
      const favorites = await favPromise;
      const isFav = favorites.has(problemId);
      const currentState = userStates[problemId] || 'not_started';

      if (isAdmin) {
        document.getElementById('detailEditBtn').innerHTML = `<a href="/admin/problems/${encodeURIComponent(problemId)}" class="back-btn" style="margin-left:0.5rem;" title="Edit problem">edit</a>`;
      }

      updateProblemDetailIcon(problemId, currentProblemName);

      const starIcon = document.querySelector('#detailFavorite i');
      if (starIcon) {
        starIcon.className = isFav ? 'fas fa-star' : 'far fa-star';
        starIcon.style.color = isFav ? '#f1c40f' : '#aaa';
      }

      const hasAccess = isAdmin || currentState === 'passed';
      const toggleArea = document.getElementById('discussionToggleArea');
      if (hasAccess) {
        toggleArea.style.display = 'block';
        document.getElementById('expandDiscussionsBtn').addEventListener('click', function() {
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

      document.getElementById('detailFavorite').addEventListener('click', async function() {
        const icon = this.querySelector('i');
        if (!icon) return;
        const wasFav = icon.classList.contains('fas');
        if (wasFav) {
          icon.className = 'far fa-star';
          icon.style.color = '#aaa';
        } else {
          icon.className = 'fas fa-star';
          icon.style.color = '#f1c40f';
        }
        try {
          const res = await apiCall('/api/users?action=favorite', 'POST', { problemId });
          if (!res.success) {
            if (wasFav) {
              icon.className = 'fas fa-star';
              icon.style.color = '#f1c40f';
            } else {
              icon.className = 'far fa-star';
              icon.style.color = '#aaa';
            }
          }
        } catch (e) {
          if (wasFav) {
            icon.className = 'fas fa-star';
            icon.style.color = '#f1c40f';
          } else {
            icon.className = 'far fa-star';
            icon.style.color = '#aaa';
          }
        }
      });

      bindSubmitEvent();
      bindStaticEvents();

      // 设置导航（上一题/下一题）
      await setupNavigation(problem);
    }

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
      modeButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const mode = btn.dataset.mode;
    currentMode = mode;
    modeButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    // 显示/隐藏各组
    const textGroup = document.getElementById('textAnswerGroup');
    const imageGroup = document.getElementById('imageAnswerGroup');
    const exprGroup = document.getElementById('expressionAnswerGroup');
    const answerInput = document.getElementById('answerInput');
    const exprInput = document.getElementById('exprInput');

    textGroup.style.display = mode === 'numeric' ? 'block' : 'none';
    imageGroup.style.display = mode === 'photo' ? 'block' : 'none';
    exprGroup.style.display = mode === 'expression' ? 'block' : 'none';

    if (mode === 'numeric') {
      answerInput.setAttribute('inputmode', 'decimal');
      answerInput.setAttribute('type', 'text');
      answerInput.placeholder = 'Enter a number';
      // 聚焦到 answerInput
      setTimeout(() => answerInput.focus(), 100);
    } else if (mode === 'expression') {
      // 聚焦到 exprInput，并确保它使用文本键盘
      exprInput.setAttribute('inputmode', 'text');
      setTimeout(() => exprInput.focus(), 100);
    } else {
      // photo 模式不需要聚焦输入框
    }

    // 清理 imageData（如果离开 photo 模式）
    if (mode !== 'photo') {
      imageData = '';
      document.getElementById('imagePreview').style.display = 'none';
      document.getElementById('removeImageBtn').style.display = 'none';
      document.getElementById('imageFileInput').value = '';
    }

    if (mode === 'expression') {
      updateExprPreview();
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
            if (w > maxWidth) {
              h = Math.round((h * maxWidth) / w);
              w = maxWidth;
            }
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            imageData = canvas.toDataURL('image/jpeg', 0.95);
            document.getElementById('imagePreview').src = imageData;
            document.getElementById('imagePreview').style.display = 'inline-block';
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

      const exprInput = document.getElementById('exprInput');
      const exprPreview = document.getElementById('exprPreview');
      function updateExprPreview() {
        const rawExpr = exprInput.value.trim();
        if (!rawExpr) { exprPreview.innerHTML = ''; return; }
        try {
          const node = math.parse(rawExpr);
          const result = node.evaluate();
          let numResult = (typeof result === 'object' && result.isBigNumber) ? result.toNumber() : result;
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
        const x = e.clientX - rect.left;
        const percentLeft = (x / rect.width) * 100;
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
            fb.textContent = "Please select an image";
            fb.className = "feedback wrong";
            return;
          }
        } else if (currentMode === 'expression') {
          const rawExpr = document.getElementById('exprInput').value.trim();
          if (!rawExpr) {
            fb.textContent = "Enter an expression";
            fb.className = "feedback wrong";
            return;
          }
          try {
            const node = math.parse(rawExpr);
            const result = node.evaluate();
            let numResult = (typeof result === 'object' && result.isBigNumber) ? result.toNumber() : result;
            answer = String(numResult.toFixed(9));
            type = 'text';
          } catch (err) {
            fb.textContent = "Invalid expression";
            fb.className = "feedback wrong";
            return;
          }
        } else {
          type = 'text';
          const val = document.getElementById('answerInput').value.trim();
          if (!val) {
            fb.textContent = "Enter answer";
            fb.className = "feedback wrong";
            return;
          }
          answer = val;
        }

        cooldown = true;
        checkBtn.disabled = true;
        spinner.style.display = 'inline-block';
        fb.textContent = '';
        fb.className = '';
        let remaining = 5;
        checkBtn.textContent = `Wait ${remaining.toFixed(1)}s`;
        const countdown = setInterval(() => {
          remaining -= 0.1;
          if (remaining <= 0) {
            clearInterval(countdown);
            checkBtn.disabled = false;
            checkBtn.textContent = "Submit";
            cooldown = false;
          } else {
            checkBtn.textContent = `Wait ${remaining.toFixed(1)}s`;
          }
        }, 100);

        try {
          const result = await apiCall('/api/submit', 'POST', { problemId, answer, type, image: image || '' });
          spinner.style.display = 'none';
          if (result.success) {
            if (result.message && result.message.includes('Image submitted')) {
              fb.textContent = 'Image submitted for marking';
              fb.className = 'feedback pending';
              document.getElementById('detailStatusIcon').style.display = 'none';
              document.getElementById('detailSpinner').style.display = 'inline-block';
              document.getElementById('detailStatusText').textContent = 'Pending';
              startImageStatusPoll();
            } 
            else if (result.systemError) {
              fb.textContent = "System Error";
              fb.className = "feedback system-error";
            } 
            else {
              if (result.score !== undefined) {
                if (result.score === 100) {
                  fb.textContent = "Accepted";
                  fb.className = "feedback correct";
                } else if (result.score === 0) {
                  fb.textContent = "Wrong Answer";
                  fb.className = "feedback wrong";
                } else {
                  fb.textContent = `Partial Score (${result.score}%)`;
                  fb.className = "feedback partial";
                }
              }
              else{
                fb.textContent = result.correct ? "Accepted" : "Wrong Answer";
                fb.className = result.correct ? "feedback correct" : "feedback wrong";
                if (result.correct) {
                userStates[problemId] = 'passed';
                if (localStorage.getItem('nekoModeUnlocked') === 'true' &&
                    localStorage.getItem('showNekos') === 'true') {
                  fetchNekoAndShow();
                }
              }
              else if (userStates[problemId] !== 'passed') {
                userStates[problemId] = 'failed';
              }
              updateProblemDetailIcon(problemId, currentProblemName);
              }
            }
          }
        } catch (err) {
          spinner.style.display = 'none';
          fb.textContent = "Network error";
          fb.className = "feedback wrong";
        }
      });
      checkBtn.addEventListener('click', (e) => e.preventDefault());
    }

    function fetchNekoAndShow() {
      const container = document.getElementById('nekoContainer');
      const img = document.getElementById('nekoImage');
      const status = document.getElementById('nekoStatus');
      if (!container || !img || !status) {
        console.warn('Neko container elements missing');
        return;
      }

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
            console.log('✅ Neko loaded:', data.results[0].url);
          } else {
            throw new Error('No neko results returned');
          }
        })
        .catch(err => {
          clearTimeout(timeoutId);
          console.error('❌ Neko fetch error:', err);
          let msg = err.message;
          if (err.name === 'AbortError') msg = 'Request timed out';
          status.textContent = ` Load failed: ${msg}`;
          status.style.color = 'var(--danger)';
          img.style.display = 'none';
        });
    }

    async function loadDiscussions(problemId) {
      const listDiv = document.getElementById('discussionList');
      try {
        const data = await apiCall(`/api/problem?action=discussions&problemId=${encodeURIComponent(problemId)}`);
        if (!data.success) { listDiv.innerHTML = '<p>Failed to load discussions.</p>'; return; }
        const discussions = data.discussions;
        let html = '';
        const currentUsername = getCurrentUser()?.username;
        discussions.forEach(d => {
          const liked = d.likedBy && d.likedBy.includes(currentUsername);
          const likeBtnClass = liked ? 'liked' : '';
          html += `
            <div class="discussion-post" data-id="${d._id}">
              <div class="post-header">
                <span class="post-user">${escapeHtml(d.username)}</span>
                <span class="post-time">${new Date(d.createdAt).toLocaleString('zh-HK', { timeZone: 'Asia/Hong_Kong' })}</span>
              </div>
              <div class="post-content">${DOMPurify.sanitize(d.content, domPurifyConfig)}</div>
              <div class="post-actions">
                <button class="like-btn ${likeBtnClass}" data-id="${d._id}">
                  ${liked ? '❤️' : '🤍'} <span class="likes-count">${d.likes || 0}</span>
                </button>
              </div>
            </div>`;
        });
        listDiv.innerHTML = html || '<p>No discussions yet.</p>';
        if (typeof renderMathInElement !== 'undefined') {
          renderMathInElement(listDiv, {
            delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }]
          });
        }
        document.querySelectorAll('.like-btn').forEach(btn => {
          btn.addEventListener('click', async () => {
            const discussionId = btn.dataset.id;
            const res = await apiCall('/api/problem?action=discussions', 'PUT', { action: 'like', discussionId });
            if (res.success) {
              const newLikes = res.discussion.likes;
              const isLiked = res.discussion.likedBy && res.discussion.likedBy.includes(currentUsername);
              btn.querySelector('.likes-count').textContent = newLikes;
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
    window.addEventListener('beforeunload', () => {
      const timerRow = document.getElementById('timerRow');
      if (timerRow) {
        pauseTimer();
        saveTimer();
      }
    });
  
