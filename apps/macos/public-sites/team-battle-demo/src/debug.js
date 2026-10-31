/* 贪吃蛇 · 调试钩子（05 §3.12 / 03 TC-14、TC-25 明确允许使用）
 * 仅当 URL 带 ?debug=1 时挂载；默认不注册任何全局对象、不输出任何 console。
 */
(function (S) {
  'use strict';

  var cfg = S.CONFIG;

  function attach(game) {
    var board = game.board;
    var G = game.G;

    function cellOf(p) {
      if (typeof p === 'number') return p;
      if (p && typeof p.x === 'number' && typeof p.y === 'number') return board.cellOf(p.x, p.y);
      if (Object.prototype.toString.call(p) === '[object Array]') return board.cellOf(p[0], p[1]);
      return -1;
    }

    function xy(c) {
      if (c < 0) return null;
      return { x: board.xOf(c), y: board.yOf(c) };
    }

    function firstFree() {
      for (var i = 0; i < board.cells; i++) if (!board.occupy[i]) return i;
      return -1;
    }

    function dirBetween(from, to) {
      var dx = board.xOf(to) - board.xOf(from);
      var dy = board.yOf(to) - board.yOf(from);
      if (dx === 1 && dy === 0) return 'right';
      if (dx === -1 && dy === 0) return 'left';
      if (dx === 0 && dy === 1) return 'down';
      if (dx === 0 && dy === -1) return 'up';
      return null;
    }

    function snapshot() {
      var last = game.layout() && game.layout().last ? game.layout().last() : null;
      var els = game.els;
      return {
        state: game.sm.get(),
        statusText: game.statusText(),
        dir: G.dir,
        score: G.score,
        best: G.best,
        size: board.size,
        foodsEaten: G.foodsEaten,
        stepMs: G.stepMs,
        tickCount: G.tickCount,
        difficulty: G.difficulty,
        deadReason: G.deadReason,
        queue: G.queue.slice(),
        trace: G.trace.slice(),
        head: xy(board.headCell()),
        tail: xy(board.tailCell()),
        food: xy(board.food),
        foodIndex: board.food,
        storageAvailable: game.storage.isAvailable(),
        overlayMode: els.overlay ? els.overlay.getAttribute('data-mode') : null,
        overlayHidden: els.overlay ? !!els.overlay.hidden : null,
        overlayText: els.overlayText ? els.overlayText.textContent : '',
        overlayTitle: els.overlayTitle ? els.overlayTitle.textContent : '',
        overlayLines: els.overlayLines ? els.overlayLines.textContent : '',
        overlayBtnText: els.overlayBtn ? els.overlayBtn.textContent : '',
        toastHidden: els.toast ? !!els.toast.hidden : null,
        toastText: els.toast ? els.toast.textContent : '',
        noticeHidden: els.notice ? !!els.notice.hidden : null,
        noticeText: els.notice ? els.notice.textContent : '',
        hintVisible: !!(els.overlay && !els.overlay.hidden && els.overlay.getAttribute('data-mode') === 'hint'),
        pauseLabel: els.btnPause ? els.btnPause.textContent : '',
        pauseDisabled: els.btnPause ? !!els.btnPause.disabled : null,
        bestNoteHidden: els.bestNote ? !!els.bestNote.hidden : null,
        geometry: last ? {
          boardCss: last.boardCss, cellCss: last.cellCss, cellDev: last.cellDev,
          boardDev: last.boardDev, dpr: last.dpr, compact: last.compact, tooSmall: last.tooSmall
        } : null,
        bodyCells: (function () {
          var out = [];
          for (var i = 0; i < board.size; i++) out.push(board.cellAt(i));
          return out;
        })()
      };
    }

    var Debug = {
      version: S.version,
      snapshot: snapshot,
      trace: function () { return G.trace.slice(); },
      setAutoTick: function (on) { game.setAutoTick(on); return snapshot(); },
      tickNow: function () { game.tickNow(); return snapshot(); },
      setDir: function (dir) {
        if (!S.DIRS[dir]) return false;
        G.dir = dir;
        G.queue.length = 0;
        G.turnApplied = false;
        game.render();
        return true;
      },
      setBody: function (list) {
        var cells = [];
        for (var i = 0; i < list.length; i++) {
          var c = cellOf(list[i]);
          if (c < 0) return false;
          cells.push(c);
        }
        var ok = board.setBody(cells);
        if (!ok) return false;
        G.queue.length = 0;
        game.render();
        return true;
      },
      /* 允许把食物摆到蛇身上：仅调试用，用于构造 TC-14"长身那一 tick 的尾格"局面 */
      setFood: function (p) {
        if (p === null || p === undefined) { board.food = -1; game.render(); return true; }
        var c = cellOf(p);
        if (c < 0) return false;
        board.food = c;
        game.render();
        return true;
      },
      setStep: function (ms) {
        if (!(ms > 0)) return false;
        G.stepMs = ms;
        return true;
      },
      setFoodsEaten: function (v) {
        G.foodsEaten = v;
        game.updateStep();
        return true;
      },
      /* 把蛇身填成蛇形路径的前 n 格（尾 -> 头），用于 TC-25 通关构造 */
      fillTo: function (n) {
        var g = cfg.GRID;
        var total = g * g;
        if (!(n >= 1 && n <= total)) return false;
        var path = [];
        for (var y = 0; y < g; y++) {
          for (var k = 0; k < g; k++) {
            var x = (y % 2 === 0) ? k : (g - 1 - k);
            path.push(board.cellOf(x, y));
          }
        }
        if (!board.setBody(path.slice(0, n))) return false;
        /* 让分数/食物计数与蛇长自洽，便于断言 WIN 时的最高分更新（P-05） */
        var grown = Math.max(0, n - cfg.INITIAL_LENGTH);
        G.score = grown * cfg.SCORE_PER_FOOD;
        G.foodsEaten = grown;
        game.updateStep();
        G.queue.length = 0;
        G.turnApplied = false;
        var free = firstFree();
        board.food = free;
        game.updateBest();
        game.render();
        return true;
      },
      /* 走真实 WIN 分支：填到 399 格 + 把最后一个空格放在头前 + 推进一 tick */
      forceWin: function () {
        var total = cfg.GRID * cfg.GRID;
        if (!Debug.fillTo(total - 1)) return false;
        var free = firstFree();
        if (free < 0) return false;
        var dir = dirBetween(board.headCell(), free);
        if (!dir) return false;
        board.food = free;
        G.dir = dir;
        G.turnApplied = false;
        game.tickNow();
        return game.sm.get() === S.STATE.WIN;
      },
      /* 在蛇头正前方放一个食物并推进一个 tick（用于吃食物相关断言） */
      eatNext: function () {
        var vec = S.DIRS[G.dir];
        var head = board.headCell();
        var x = board.xOf(head) + vec.dx;
        var y = board.yOf(head) + vec.dy;
        if (!board.inBounds(x, y)) return false;
        var c = board.cellOf(x, y);
        if (board.has(c)) return false;
        board.food = c;
        game.tickNow();
        return true;
      },
      freeCount: function () { return board.freeCellCount(); },
      /* 读 canvas 指定格中心的像素（canvas 自身像素，不含 DOM 遮罩） */
      pixelAt: function (col, row) {
        var ctx = game.els.ctx;
        var info = game.layout().last();
        if (!ctx || !info) return null;
        var cx = Math.floor((col + 0.5) * info.cellDev);
        var cy = Math.floor((row + 0.5) * info.cellDev);
        var d = ctx.getImageData(cx, cy, 1, 1).data;
        return { r: d[0], g: d[1], b: d[2], a: d[3] };
      },
      gridInfo: function () { return game.layout().last(); }
    };

    window.SnakeDebug = Debug;
  }

  S.enableDebug = attach;
})(window.Snake = window.Snake || {});
