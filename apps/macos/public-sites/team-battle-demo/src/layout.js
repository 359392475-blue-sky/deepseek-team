/* 贪吃蛇 · 布局 / DPR / 极窄视口（05 §3.9 / FR-13 / E3 / E4 / 06 P-04）
 * 关键设计：尺寸变化一律不触发状态转移；棋盘按外层容器的实测尺寸取正方形。
 */
(function (S) {
  'use strict';

  var cfg = S.CONFIG;

  S.createLayout = function (els, onApply) {
    var last = null;

    function measure() {
      var wrapRect = els.wrap.getBoundingClientRect();
      var availW = Math.max(0, Math.floor(wrapRect.width));
      var availH = Math.max(0, Math.floor(wrapRect.height));
      if (availW < 1 || availH < 1) return null;

      var viewportW = window.innerWidth || availW;
      var dpr = Math.min(window.devicePixelRatio || 1, cfg.DPR_MAX);
      var cssSize = Math.max(1, Math.min(availW, availH));

      /* 单格取设备像素整数 -> 格线不模糊、无半像素接缝（TC-15） */
      var cellDev = Math.floor((cssSize * dpr) / cfg.GRID);
      if (cellDev < 1) cellDev = 1;
      var boardDev = cellDev * cfg.GRID;
      var boardCss = boardDev / dpr;
      var cellCss = boardCss / cfg.GRID;

      var tooSmall = (viewportW <= cfg.MIN_VIEWPORT_PX) || (cellCss < cfg.MIN_CELL_PX);
      var compact = (viewportW < cfg.COMPACT_VIEWPORT_W) || ((window.innerHeight || 0) < cfg.COMPACT_VIEWPORT_H);

      return {
        boardCss: boardCss,
        boardDev: boardDev,
        cellCss: cellCss,
        cellDev: cellDev,
        dpr: dpr,
        viewportW: viewportW,
        compact: compact,
        tooSmall: tooSmall
      };
    }

    function apply(force) {
      var info = measure();
      if (!info) return null;
      var key = info.boardDev + 'x' + info.cellDev + '@' + info.dpr + '|' + info.compact + '|' + info.tooSmall;
      if (!force && last && last.key === key) return last.info;

      els.box.style.width = info.boardCss + 'px';
      els.box.style.height = info.boardCss + 'px';
      els.canvas.style.width = info.boardCss + 'px';
      els.canvas.style.height = info.boardCss + 'px';
      if (els.canvas.width !== info.boardDev) els.canvas.width = info.boardDev;
      if (els.canvas.height !== info.boardDev) els.canvas.height = info.boardDev;

      if (els.app) {
        els.app.classList.toggle('compact', info.compact);
        els.app.classList.toggle('tiny', info.tooSmall);
      }
      if (els.notice) els.notice.hidden = !info.tooSmall;

      info.key = key;
      last = { key: key, info: info };
      if (onApply) onApply(info);
      return info;
    }

    return { apply: apply, measure: measure, last: function () { return last ? last.info : null; } };
  };
})(window.Snake = window.Snake || {});
