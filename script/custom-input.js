// custom-input.js — 通用自定义输入库
// 用法：在 statement 里写 <div data-input="..." ...></div>
// 库会自动挂载到 .wb-pane[data-pane="text"]，隐藏 #answerInput
//
// 支持的 data-input 类型：
//   number    — N 个数字输入框
//   grid      — R×C 网格（每格 1 字符）
//   table     — N 行 × C 列，每格任意文本
//   textarea  — N 个多行文本框
//   multi     — 混合类型（进阶）
//
// 通用属性：
//   data-sep      分隔符（默认 "|"）
//   data-empty    空值占位（默认 "X"）
//   data-hint     输入框下方提示文字

(function () {
  'use strict';

  // ═══════════════ 工具 ═══════════════
  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, m => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[m]));
  }

  function splitCsv(s) {
    return String(s || '').split(',').map(x => x.trim());
  }

  // ═══════════════ 各类型 UI 构建 ═══════════════

  // number: N 个单行数字输入
  function buildNumber(el, ctx) {
    const count = Math.max(1, Math.min(20, parseInt(el.dataset.count) || 1));
    const labels = splitCsv(el.dataset.labels || '');
    const sep = el.dataset.sep || '|';
    const empty = el.dataset.empty || 'X';
    const hint = el.dataset.hint || '';

    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:10px;margin:.6rem 0;';

    const inputStyle =
      'flex:1;padding:8px 12px;border:1px solid var(--border-color);' +
      'border-radius:6px;background:var(--card-bg);color:var(--text-primary);' +
      'font:inherit;font-size:1rem;box-sizing:border-box;';
    const labelStyle =
      'min-width:80px;font-weight:600;color:var(--text-primary);flex-shrink:0;';

    const inputs = [];
    for (let i = 0; i < count; i++) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:10px;';
      const lab = labels[i] || ('Value ' + (i + 1));
      row.innerHTML =
        `<label style="${labelStyle}">${esc(lab)}:</label>` +
        `<input type="text" inputmode="numeric" data-idx="${i}" style="${inputStyle}">`;
      wrap.appendChild(row);
      inputs.push(row.querySelector('input'));
    }

    if (hint) {
      const h = document.createElement('div');
      h.style.cssText = 'font-size:.8rem;color:var(--text-secondary);margin-top:2px;';
      h.textContent = hint;
      wrap.appendChild(h);
    }

    return {
      el: wrap,
      inputs,
      sync: () => inputs.map(inp => (inp.value || '').trim() || empty).join(sep),
      focus: () => inputs[0] && inputs[0].focus(),
    };
  }

  // grid: R×C 网格
  function buildGrid(el, ctx) {
    const rows = Math.max(1, Math.min(10, parseInt(el.dataset.rows) || 2));
    const cols = Math.max(1, Math.min(10, parseInt(el.dataset.cols) || 3));
    const sep = el.dataset.sep || '|';
    const rowSep = el.dataset.rowSep || ',';
    const empty = el.dataset.empty || 'X';
    const cellMax = parseInt(el.dataset.cellMax) || 1;
    const pattern = el.dataset.pattern || '';   // 例如 "[0-9]" 只允許數字
    const hint = el.dataset.hint || '';

    const wrap = document.createElement('div');
    wrap.style.cssText = 'margin:.6rem 0;';

    const inputStyle =
      'width:42px;height:42px;text-align:center;' +
      'font-size:18px;font-family:Consolas,monospace;' +
      'border:2px solid var(--border-color);border-radius:4px;' +
      'background:var(--card-bg);color:var(--text-primary);outline:none;';

    let html = '<table style="border-collapse:separate;border-spacing:4px;margin:0 auto;">';
    for (let r = 0; r < rows; r++) {
      html += '<tr>';
      for (let c = 0; c < cols; c++) {
        html += `<td style="padding:0;"><input type="text" maxlength="${cellMax}" ` +
                `data-r="${r}" data-c="${c}" style="${inputStyle}"></td>`;
      }
      html += '</tr>';
    }
    html += '</table>';
    if (hint) html += `<div style="text-align:center;font-size:.8rem;color:var(--text-secondary);margin-top:6px;">${esc(hint)}</div>`;

    wrap.innerHTML = html;

    const inputs = Array.from(wrap.querySelectorAll('input'));

    // 輸入過濾
    inputs.forEach(inp => {
      inp.addEventListener('input', () => {
        if (pattern) {
          const re = new RegExp(pattern, 'g');
          inp.value = (inp.value.match(re) || []).join('').slice(-cellMax);
        } else if (cellMax === 1) {
          inp.value = inp.value.slice(-1);
        }
      });
      // 方向鍵導航
      inp.addEventListener('keydown', (e) => {
        const r = +inp.dataset.r, c = +inp.dataset.c;
        let nr = r, nc = c;
        if (e.key === 'ArrowUp') nr--;
        else if (e.key === 'ArrowDown') nr++;
        else if (e.key === 'ArrowLeft') nc--;
        else if (e.key === 'ArrowRight') nc++;
        else return;
        e.preventDefault();
        const t = wrap.querySelector(
          `input[data-r="${Math.max(0, Math.min(rows-1, nr))}"][data-c="${Math.max(0, Math.min(cols-1, nc))}"]`
        );
        if (t) { t.focus(); t.select(); }
      });
    });

    return {
      el: wrap,
      inputs,
      sync: () => {
        const rowsArr = [];
        for (let r = 0; r < rows; r++) {
          const cells = [];
          for (let c = 0; c < cols; c++) {
            const inp = wrap.querySelector(`input[data-r="${r}"][data-c="${c}"]`);
            cells.push((inp.value || '').trim() || empty);
          }
          rowsArr.push(cells.join(sep));
        }
        return rowsArr.join(rowSep);
      },
      focus: () => inputs[0] && inputs[0].focus(),
    };
  }

  // table: N 行 × C 列，每格可自訂寬度
  function buildTable(el, ctx) {
    const rows = Math.max(1, Math.min(20, parseInt(el.dataset.rows) || 2));
    const cols = Math.max(1, Math.min(10, parseInt(el.dataset.cols) || 3));
    const colWidth = parseInt(el.dataset.colWidth) || 80;
    const cellMax = parseInt(el.dataset.cellMax) || 20;
    const sep = el.dataset.sep || ',';
    const rowSep = el.dataset.rowSep || ';';
    const empty = el.dataset.empty || 'X';
    const hint = el.dataset.hint || '';

    const wrap = document.createElement('div');
    wrap.style.cssText = 'margin:.6rem 0;';

    let html = '<table style="border-collapse:separate;border-spacing:4px;margin:0 auto;">';
    for (let r = 0; r < rows; r++) {
      html += '<tr>';
      for (let c = 0; c < cols; c++) {
        html += `<td style="padding:0;">` +
                `<input type="text" maxlength="${cellMax}" data-r="${r}" data-c="${c}" ` +
                `style="width:${colWidth}px;padding:6px 8px;font-size:.9rem;` +
                `border:1px solid var(--border-color);border-radius:4px;` +
                `background:var(--card-bg);color:var(--text-primary);outline:none;">` +
                `</td>`;
      }
      html += '</tr>';
    }
    html += '</table>';
    if (hint) html += `<div style="text-align:center;font-size:.8rem;color:var(--text-secondary);margin-top:6px;">${esc(hint)}</div>`;

    wrap.innerHTML = html;

    const inputs = Array.from(wrap.querySelectorAll('input'));

    return {
      el: wrap,
      inputs,
      sync: () => {
        const rowsArr = [];
        for (let r = 0; r < rows; r++) {
          const cells = [];
          for (let c = 0; c < cols; c++) {
            const inp = wrap.querySelector(`input[data-r="${r}"][data-c="${c}"]`);
            cells.push((inp.value || '').trim() || empty);
          }
          rowsArr.push(cells.join(sep));
        }
        return rowsArr.join(rowSep);
      },
      focus: () => inputs[0] && inputs[0].focus(),
    };
  }

  // textarea: N 个多行文本框
  function buildTextarea(el, ctx) {
    const count = Math.max(1, Math.min(10, parseInt(el.dataset.count) || 1));
    const labels = splitCsv(el.dataset.labels || '');
    const sep = el.dataset.sep || '|||';   // 多行用 ||| 分隔，避免跟换行冲突
    const rows = parseInt(el.dataset.rows) || 4;
    const hint = el.dataset.hint || '';

    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:12px;margin:.6rem 0;';

    const labelStyle = 'font-weight:600;color:var(--text-primary);margin-bottom:4px;display:block;';
    const taStyle =
      'width:100%;padding:8px 12px;border:1px solid var(--border-color);' +
      'border-radius:6px;background:var(--card-bg);color:var(--text-primary);' +
      'font:inherit;font-size:.95rem;box-sizing:border-box;resize:vertical;';

    const inputs = [];
    for (let i = 0; i < count; i++) {
      const div = document.createElement('div');
      const lab = labels[i] || '';
      div.innerHTML =
        (lab ? `<label style="${labelStyle}">${esc(lab)}</label>` : '') +
        `<textarea rows="${rows}" data-idx="${i}" style="${taStyle}"></textarea>`;
      wrap.appendChild(div);
      inputs.push(div.querySelector('textarea'));
    }

    if (hint) {
      const h = document.createElement('div');
      h.style.cssText = 'font-size:.8rem;color:var(--text-secondary);';
      h.textContent = hint;
      wrap.appendChild(h);
    }

    return {
      el: wrap,
      inputs,
      sync: () => inputs.map(t => (t.value || '').trim()).join(sep),
      focus: () => inputs[0] && inputs[0].focus(),
    };
  }

  // ═══════════════ 路由器 ═══════════════
  const BUILDERS = {
    number: buildNumber,
    grid: buildGrid,
    table: buildTable,
    textarea: buildTextarea,
  };

  // ═══════════════ 主掛載流程 ═══════════════
  function mountAll() {
    const inp = document.getElementById('answerInput');
    const btn = document.getElementById('checkAnswerBtn');
    if (!inp || !btn) return false;

    const pane = inp.closest('.wb-pane[data-pane="text"]') || inp.parentElement;
    if (!pane) return false;

    const targets = document.querySelectorAll('[data-input]');
    if (targets.length === 0) return false;

    let firstFocus = null;
    const mounted = [];

    targets.forEach(el => {
      if (el.dataset.mounted === '1') return;

      const type = el.dataset.input;
      const builder = BUILDERS[type];
      if (!builder) {
        console.warn('[custom-input] unknown type:', type);
        return;
      }

      let ui;
      try {
        ui = builder(el, { pane });
      } catch (e) {
        console.error('[custom-input] build failed:', type, e);
        return;
      }

      // 清空原 div，放入新 UI
      el.innerHTML = '';
      el.appendChild(ui.el);
      el.dataset.mounted = '1';

      // 收集 inputs，稍後統一同步
      mounted.push(ui);
      if (!firstFocus && ui.focus) firstFocus = ui.focus;

      // 每個 input 的 input 事件都觸發 sync
      ui.inputs.forEach(i => {
        i.addEventListener('input', () => syncAll(mounted, inp));
        i.addEventListener('change', () => syncAll(mounted, inp));
      });
    });

    if (mounted.length === 0) return false;

    // 隱藏原生 input
    inp.style.display = 'none';

    // 隱藏 live preview（若存在）
    const preview = document.getElementById('wbExprPreview');
    if (preview) preview.hidden = true;

    // 同步函式（全域）
    window.__customInputSync = () => syncAll(mounted, inp);

    // capture 階段同步，確保在 pd-extras 的 submit handler 之前
    btn.addEventListener('click', window.__customInputSync, true);

    // Enter 快速提交（在最後一個 input 上）
    const lastUI = mounted[mounted.length - 1];
    lastUI.inputs.forEach(i => {
      i.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey && i.tagName !== 'TEXTAREA') {
          e.preventDefault();
          window.__customInputSync();
          btn.click();
        }
      });
    });

    // 首次同步 + 聚焦
    syncAll(mounted, inp);
    if (firstFocus) setTimeout(firstFocus, 80);

    console.log(`[custom-input] mounted ${mounted.length} widget(s)`);
    return true;
  }

  function syncAll(mounted, inp) {
    const parts = mounted.map(ui => ui.sync());
    inp.value = parts.join(';;');   // 多個 widget 之間用 ;;
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // ═══════════════ 輪詢啟動 ═══════════════
  // statement 渲染完才會有 [data-input] 元素，所以需要輪詢
  let tries = 0;
  function tryMount() {
    if (mountAll()) return;
    if (++tries > 60) {
      // 6 秒後放棄（statement 沒有自訂輸入）
      return;
    }
    setTimeout(tryMount, 100);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryMount, { once: true });
  } else {
    tryMount();
  }
})();
