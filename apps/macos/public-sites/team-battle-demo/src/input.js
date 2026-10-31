/* 贪吃蛇 · 输入（05 §3.7 / §3.8 / FR-02 ~ FR-06 / E6 ~ E9）
 * 三条通道：键盘（方向键 + WASD + 空格）、棋盘滑动（Pointer Events）、屏幕方向键。
 * 滑动与方向键通过"事件域隔离 + 一次手势一次转向"共存，互不污染。
 */
(function (S) {
  'use strict';

  var KEY_TO_DIR = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    w: 'up', s: 'down', a: 'left', d: 'right'
  };

  function isButtonLike(el) {
    if (!el || !el.tagName) return false;
    var t = el.tagName.toUpperCase();
    return t === 'BUTTON' || t === 'SELECT' || el.getAttribute('role') === 'button';
  }

  S.createInput = function (opts) {
    var boardBox = opts.boardBox;
    var overlay = opts.overlay;

    /* —— 键盘 —— */
    function onKeyDown(e) {
      if (e.repeat) return; /* E8 / TC-04：忽略按键自动重复，长按不加速、不灌队列 */

      var key = e.key;
      if (key === ' ' || key === 'Spacebar' || key === 'Space') {
        if (isButtonLike(document.activeElement)) return; /* 让聚焦控件自己响应（TC-23） */
        e.preventDefault();
        opts.onToggle();
        return;
      }

      var dir = KEY_TO_DIR[key];
      if (!dir && typeof key === 'string') dir = KEY_TO_DIR[key.toLowerCase()];
      if (!dir) return;

      e.preventDefault(); /* NFR-07：方向键不得滚动页面 */
      opts.onDirection(dir);
    }

    /* —— 棋盘滑动 —— */
    var activeId = null;
    var startX = 0;
    var startY = 0;
    var moved = 0;
    var consumed = false;

    function onPointerDown(e) {
      /* 遮罩/结果面板覆盖棋盘时不参与滑动捕获（否则 setPointerCapture 会把 click 重定向到容器，
         导致"点击遮罩恢复"失效，自测 TC-13 发现） */
      var ov = (e.target && e.target.closest) ? e.target.closest('.overlay') : null;
      if (ov && ov.getAttribute('data-mode') !== 'hint') return;
      if (e.target && e.target.closest && e.target.closest('button, select, .dpad')) return;
      if (activeId !== null) return; /* 只跟踪第一个指针，忽略多指 */
      activeId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      moved = 0;
      consumed = false;
      try { boardBox.setPointerCapture(e.pointerId); } catch (err) { /* 环境不支持则忽略 */ }
    }

    function onPointerMove(e) {
      if (e.pointerId !== activeId || consumed) return;
      var dx = e.clientX - startX;
      var dy = e.clientY - startY;
      var ax = Math.abs(dx);
      var ay = Math.abs(dy);
      if (Math.max(ax, ay) > moved) moved = Math.max(ax, ay);
      var th = opts.getSwipeThreshold();
      if (Math.max(ax, ay) < th) return;
      var dir = (ax >= ay) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      consumed = true; /* 一次手势只产生一次转向 */
      if (e.cancelable) e.preventDefault();
      opts.onDirection(dir);
    }

    function onPointerEnd(e) {
      if (e.pointerId !== activeId) return;
      activeId = null;
      consumed = false;
      moved = 0;
    }

    /* —— 屏幕方向键 —— */
    function bindPad(btn) {
      var dir = btn.getAttribute('data-dir');
      btn.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        e.stopPropagation();
        opts.onDirection(dir);
        if (btn.blur) btn.blur(); /* 指针点击后交还焦点，保证空格始终是"暂停" */
      });
      btn.addEventListener('click', function (e) {
        if (e.detail !== 0) return; /* 仅键盘激活（Enter/Space）走这里，避免与 pointerdown 重复 */
        e.preventDefault();
        opts.onDirection(dir);
      });
    }

    /* —— 点击棋盘/暂停遮罩恢复（06 P-06）：绑在棋盘容器上，兼容指针捕获后的 click 重定向 —— */
    function onBoardClick(e) {
      if (e.target && e.target.closest && e.target.closest('button')) return;
      if (opts.getState() !== S.STATE.PAUSED) return;
      opts.onToggle();
    }

    window.addEventListener('keydown', onKeyDown, { passive: false });
    boardBox.addEventListener('pointerdown', onPointerDown, { passive: true });
    boardBox.addEventListener('pointermove', onPointerMove, { passive: false });
    boardBox.addEventListener('pointerup', onPointerEnd, { passive: true });
    boardBox.addEventListener('pointercancel', onPointerEnd, { passive: true });
    boardBox.addEventListener('click', onBoardClick);

    for (var i = 0; i < opts.padButtons.length; i++) bindPad(opts.padButtons[i]);

    if (opts.btnPause) opts.btnPause.addEventListener('click', function () { opts.onToggle(); });
    if (opts.btnRestart) opts.btnRestart.addEventListener('click', function () { opts.onRestart(); });
    if (opts.overlayBtn) opts.overlayBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      opts.onRestart();
    });
    if (opts.difficulty) opts.difficulty.addEventListener('change', function () {
      opts.onDifficulty(opts.difficulty.value);
    });

    return {
      threshold: opts.getSwipeThreshold
    };
  };
})(window.Snake = window.Snake || {});
