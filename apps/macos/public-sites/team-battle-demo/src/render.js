/* 贪吃蛇 · 渲染（05 §3.2 / §3.9 / NFR-06 / 06 S-3）
 * 棋盘与蛇用 Canvas 2D（设备像素整数坐标，DPR 下不模糊）；
 * 状态栏、遮罩、按钮用 DOM（可 Tab 聚焦、可访问性由浏览器保证）。
 */
(function (S) {
  'use strict';

  var COLORS = {
    boardBg: '#171C22',
    grid: '#232A32',
    body: '#3DDC84',
    head: '#B9F6CA',
    eye: '#0F1216',
    food: '#FF5C5C',
    foodRing: '#0F1216'
  };

  function roundRect(ctx, x, y, w, h, r) {
    if (typeof ctx.roundRect === 'function') {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
      return;
    }
    var rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    ctx.lineTo(x + rr, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
    ctx.lineTo(x, y + rr);
    ctx.quadraticCurveTo(x, y, x + rr, y);
    ctx.closePath();
  }

  S.createRenderer = function (els, cfg, board) {
    var geo = { boardDev: cfg.GRID, cellDev: 1, dpr: 1 };

    function setGeometry(info) {
      geo = info;
    }

    function draw() {
      var ctx = els.ctx;
      if (!ctx) return;
      var n = cfg.GRID;
      var cell = geo.cellDev;
      var size = geo.boardDev;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, size, size);
      ctx.fillStyle = COLORS.boardBg;
      ctx.fillRect(0, 0, size, size);

      /* 网格线：1 设备像素，落在半像素上保证清晰 */
      ctx.strokeStyle = COLORS.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (var i = 1; i < n; i++) {
        var p = Math.round(i * cell) + 0.5;
        ctx.moveTo(p, 0); ctx.lineTo(p, size);
        ctx.moveTo(0, p); ctx.lineTo(size, p);
      }
      ctx.stroke();

      /* 食物：圆形 + 深色描边（与蛇身对比度不足，靠形状与描边区分，06 S-3） */
      if (board.food >= 0) {
        var fx = board.xOf(board.food);
        var fy = board.yOf(board.food);
        var fcx = (fx + 0.5) * cell;
        var fcy = (fy + 0.5) * cell;
        var fr = Math.max(2, cell * 0.3);
        ctx.beginPath();
        ctx.arc(fcx, fcy, fr, 0, Math.PI * 2);
        ctx.fillStyle = COLORS.food;
        ctx.fill();
        ctx.lineWidth = Math.max(1, Math.round(cell * 0.09));
        ctx.strokeStyle = COLORS.foodRing;
        ctx.stroke();
      }

      /* 蛇身：尾 -> 头 */
      var inset = Math.max(1, Math.round(cell * 0.06));
      var radius = Math.max(2, cell * 0.28);
      var headCell = board.headCell();
      for (var k = 0; k < board.size; k++) {
        var c = board.cellAt(k);
        var x = board.xOf(c) * cell;
        var y = board.yOf(c) * cell;
        ctx.fillStyle = COLORS.body;
        roundRect(ctx, x + inset, y + inset, cell - inset * 2, cell - inset * 2, radius);
        ctx.fill();
      }

      /* 蛇头：更亮填充 + 描边 + 朝向眼睛（暂停遮罩下仍需看出朝向，TC-07/P-07） */
      if (headCell >= 0) {
        var hx = board.xOf(headCell) * cell;
        var hy = board.yOf(headCell) * cell;
        ctx.fillStyle = COLORS.head;
        roundRect(ctx, hx + inset, hy + inset, cell - inset * 2, cell - inset * 2, radius);
        ctx.fill();
        ctx.lineWidth = Math.max(1, Math.round(cell * 0.08));
        ctx.strokeStyle = COLORS.eye;
        ctx.stroke();

        var dir = S.DIRS[els.getDirection()] || S.DIRS.right;
        var px = -dir.dy;
        var py = dir.dx;
        var ccx = hx + cell / 2;
        var ccy = hy + cell / 2;
        var eyeR = Math.max(1, cell * 0.09);
        var fwd = cell * 0.16;
        var side = cell * 0.19;
        ctx.fillStyle = COLORS.eye;
        for (var e = -1; e <= 1; e += 2) {
          ctx.beginPath();
          ctx.arc(ccx + dir.dx * fwd + px * side * e, ccy + dir.dy * fwd + py * side * e, eyeR, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    function syncHud(m) {
      if (els.score) els.score.textContent = String(m.score);
      if (els.best) els.best.textContent = String(m.best);
      if (els.status) els.status.textContent = m.statusText;
      if (els.bestNote) els.bestNote.hidden = m.storageAvailable;
      if (els.btnPause) {
        var canPause = (m.state === S.STATE.PLAYING || m.state === S.STATE.PAUSED);
        els.btnPause.disabled = !canPause;
        els.btnPause.textContent = (m.state === S.STATE.PAUSED) ? cfg.COPY.BTN_RESUME : cfg.COPY.BTN_PAUSE;
      }
    }

    function hideOverlay() {
      els.overlay.hidden = true;
      els.overlay.setAttribute('data-mode', 'none');
    }

    function showHint() {
      els.overlay.setAttribute('data-mode', 'hint');
      els.overlayTitle.hidden = true;
      els.overlayTitle.textContent = '';
      els.overlayText.hidden = false;
      els.overlayText.textContent = cfg.COPY.HINT;
      els.overlayLines.hidden = true;
      els.overlayLines.textContent = '';
      els.overlayBtn.hidden = true;
      els.overlay.hidden = false;
    }

    function showMask(text) {
      els.overlay.setAttribute('data-mode', 'mask');
      els.overlayTitle.hidden = true;
      els.overlayTitle.textContent = '';
      els.overlayText.hidden = false;
      els.overlayText.textContent = text;
      els.overlayLines.hidden = true;
      els.overlayLines.textContent = '';
      els.overlayBtn.hidden = true;
      els.overlay.hidden = false;
    }

    function showResult(title, lines, buttonText) {
      els.overlay.setAttribute('data-mode', 'result');
      els.overlayTitle.hidden = false;
      els.overlayTitle.textContent = title;
      els.overlayText.hidden = true;
      els.overlayText.textContent = '';
      els.overlayLines.hidden = false;
      els.overlayLines.textContent = '';
      for (var i = 0; i < lines.length; i++) {
        var row = document.createElement('span');
        row.className = 'overlay-line';
        row.textContent = lines[i];
        els.overlayLines.appendChild(row);
      }
      els.overlayBtn.hidden = false;
      els.overlayBtn.textContent = buttonText;
      els.overlay.hidden = false;
    }

    var toastTimer = null;
    function toast(text) {
      if (!els.toast) return;
      els.toast.textContent = text;
      els.toast.hidden = false;
      if (toastTimer !== null) window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(function () {
        els.toast.hidden = true;
        toastTimer = null;
      }, cfg.TOAST_MS);
    }

    return {
      draw: draw,
      setGeometry: setGeometry,
      syncHud: syncHud,
      hideOverlay: hideOverlay,
      showHint: showHint,
      showMask: showMask,
      showResult: showResult,
      toast: toast
    };
  };
})(window.Snake = window.Snake || {});
