/* 贪吃蛇 · 棋盘数据模型（05 §3.4 / §3.5 / §3.12）
 * 蛇身用 Int16Array 环形缓冲 + Uint8Array 占位表，逐 tick 零内存分配（NFR-08）。
 */
(function (S) {
  'use strict';

  var DIRS = {
    up:    { dx: 0, dy: -1 },
    down:  { dx: 0, dy: 1 },
    left:  { dx: -1, dy: 0 },
    right: { dx: 1, dy: 0 }
  };
  var OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };

  S.DIRS = DIRS;
  S.opposite = function (dir) { return OPPOSITE[dir] || null; };

  S.createBoard = function (cfg) {
    var g = cfg.GRID;
    var cells = g * g;
    var b = {
      grid: g,
      cells: cells,
      body: new Int16Array(cells),
      occupy: new Uint8Array(cells),
      scratch: new Int16Array(cells),
      start: 0,
      size: 0,
      food: -1
    };

    b.cellOf = function (x, y) { return y * g + x; };
    b.xOf = function (c) { return c % g; };
    b.yOf = function (c) { return (c / g) | 0; };
    b.inBounds = function (x, y) { return x >= 0 && y >= 0 && x < g && y < g; };

    b.tailCell = function () { return b.size ? b.body[b.start] : -1; };
    b.headCell = function () { return b.size ? b.body[(b.start + b.size - 1) % cells] : -1; };
    /* i = 0 为尾，size-1 为头 */
    b.cellAt = function (i) { return b.body[(b.start + i) % cells]; };
    b.has = function (c) { return b.occupy[c] === 1; };

    b.push = function (c) {
      b.body[(b.start + b.size) % cells] = c;
      b.size += 1;
      b.occupy[c] = 1;
    };

    b.pop = function () {
      var c = b.body[b.start];
      b.start = (b.start + 1) % cells;
      b.size -= 1;
      b.occupy[c] = 0;
      return c;
    };

    b.reset = function (initialLength, dirName) {
      b.occupy.fill(0);
      b.start = 0;
      b.size = 0;
      b.food = -1;
      var cy = Math.floor(g / 2);
      var cx = Math.floor(g / 2);
      for (var i = initialLength - 1; i >= 0; i--) {
        var x = dirName === 'left' ? cx + i : cx - i;
        b.push(b.cellOf(x, cy));
      }
      return b;
    };

    /* 用显式蛇身（尾 -> 头）替换当前状态，供调试与验收构造（TC-14 / TC-25） */
    b.setBody = function (listTailToHead) {
      if (!listTailToHead || listTailToHead.length === 0) return false;
      var seen = {};
      for (var i = 0; i < listTailToHead.length; i++) {
        var c = listTailToHead[i];
        if (!(c >= 0 && c < cells)) return false;
        if (seen[c]) return false;
        seen[c] = 1;
      }
      b.occupy.fill(0);
      b.start = 0;
      b.size = 0;
      for (var j = 0; j < listTailToHead.length; j++) b.push(listTailToHead[j]);
      return true;
    };

    /* 自由格全量扫描（O(400) 常数级），选中即写入 b.food —— 同一 tick 内同步完成 */
    b.spawnFood = function (rng) {
      var n = 0;
      for (var i = 0; i < cells; i++) if (b.occupy[i] === 0) b.scratch[n++] = i;
      if (n === 0) { b.food = -1; return -1; }
      var k = Math.floor(rng() * n);
      if (k >= n) k = n - 1;
      if (k < 0) k = 0;
      b.food = b.scratch[k];
      return b.food;
    };

    b.freeCellCount = function () {
      var n = 0;
      for (var i = 0; i < cells; i++) if (b.occupy[i] === 0) n++;
      return n;
    };

    b.reset(3, 'right');
    return b;
  };
})(window.Snake = window.Snake || {});
