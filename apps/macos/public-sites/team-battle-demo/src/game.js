/* 贪吃蛇 · 主循环与对局编排（05 §3.3 / §3.5 / §3.6 / §3.10 / §3.12）
 * 固定步长累加器：逻辑推进只由墙钟时间决定，与渲染帧率解耦（C5 / TC-21）。
 */
(function (S) {
  'use strict';

  var cfg = S.CONFIG;
  S.version = '1.0.0';

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function param(name) {
    try {
      return new URLSearchParams(window.location.search).get(name);
    } catch (e) {
      return null;
    }
  }

  S.boot = function () {
    var $ = function (id) { return document.getElementById(id); };
    var els = {
      app: $('app'),
      wrap: $('board-wrap'),
      box: $('board-box'),
      canvas: $('board'),
      score: $('score'),
      best: $('best'),
      bestNote: $('best-note'),
      status: $('status'),
      overlay: $('overlay'),
      overlayTitle: $('overlay-title'),
      overlayText: $('overlay-text'),
      overlayLines: $('overlay-lines'),
      overlayBtn: $('overlay-btn'),
      toast: $('toast'),
      notice: $('notice'),
      btnPause: $('btn-pause'),
      btnRestart: $('btn-restart'),
      difficulty: $('difficulty'),
      padButtons: document.querySelectorAll('.dpad .pad')
    };
    els.ctx = els.canvas && els.canvas.getContext ? els.canvas.getContext('2d') : null;

    var storage = S.createStorage();
    var board = S.createBoard(cfg);
    var renderer = S.createRenderer(els, cfg, board);
    var layout = null;
    var sm = S.createStateMachine();

    var seedRaw = param('seed');
    var seed = seedRaw === null ? 0 : (parseInt(seedRaw, 10) || 0);
    var rng = seed ? mulberry32(seed) : Math.random;

    var G = {
      dir: cfg.INITIAL_DIR,
      score: 0,
      best: storage.bestScore,
      foodsEaten: 0,
      stepMs: cfg.DIFFICULTY[storage.difficulty] || cfg.BASE_STEP_MS,
      difficulty: storage.difficulty,
      deadReason: null,
      queue: [],
      trace: [],
      acc: 0,
      lastTs: 0,
      rafId: null,
      autoTick: true,
      turnApplied: false,
      tickCount: 0,
      pauseReason: null
    };

    els.getDirection = function () { return G.dir; };

    function statusText() {
      switch (sm.get()) {
        case S.STATE.READY: return cfg.COPY.STATUS_READY;
        case S.STATE.PLAYING: return cfg.COPY.STATUS_PLAYING;
        case S.STATE.PAUSED: return cfg.COPY.STATUS_PAUSED;
        case S.STATE.WIN: return cfg.COPY.STATUS_WIN;
        default: return cfg.COPY.STATUS_OVER;
      }
    }

    function syncHud() {
      renderer.syncHud({
        score: G.score,
        best: G.best,
        statusText: statusText(),
        state: sm.get(),
        storageAvailable: storage.isAvailable()
      });
    }

    function render() { renderer.draw(); }

    function updateStep() {
      var base = cfg.DIFFICULTY[G.difficulty] || cfg.BASE_STEP_MS;
      var cut = Math.floor(G.foodsEaten / cfg.SPEEDUP_EVERY_FOODS) * cfg.SPEEDUP_STEP_MS;
      var next = base - cut;
      G.stepMs = next < cfg.MIN_STEP_MS ? cfg.MIN_STEP_MS : next;
    }

    function updateBest() {
      if (G.score > G.best) {
        G.best = G.score;
        storage.setBestScore(G.best);
      }
    }

    function pushTrace(dir) {
      G.trace.push(dir);
      if (G.trace.length > 32) G.trace.shift();
    }

    /* —— 主循环 —— */
    function frame(ts) {
      G.rafId = null;
      if (sm.get() !== S.STATE.PLAYING) return;
      if (!G.lastTs) G.lastTs = ts;
      var dt = ts - G.lastTs;
      G.lastTs = ts;
      if (!(dt > 0)) dt = 0;
      if (dt > cfg.MAX_FRAME_DT_MS) dt = cfg.MAX_FRAME_DT_MS;
      G.acc += dt;

      var n = 0;
      while (G.acc >= G.stepMs && n < cfg.MAX_TICKS_PER_FRAME) {
        var step = G.stepMs;
        var alive = tick();
        G.acc -= step;
        n += 1;
        if (!alive) break;
      }
      if (G.acc < 0) G.acc = 0;
      if (n >= cfg.MAX_TICKS_PER_FRAME) G.acc = 0; /* 丢弃积压，防死亡螺旋 */

      render();
      if (sm.get() === S.STATE.PLAYING) G.rafId = window.requestAnimationFrame(frame);
    }

    function startLoop() {
      if (G.rafId !== null) window.cancelAnimationFrame(G.rafId);
      G.rafId = null;
      G.acc = 0;
      G.lastTs = 0;
      if (!G.autoTick) return;
      G.rafId = window.requestAnimationFrame(frame);
    }

    function stopLoop() {
      if (G.rafId !== null) window.cancelAnimationFrame(G.rafId);
      G.rafId = null;
      G.acc = 0;
      G.lastTs = 0;
    }

    /* —— 一个逻辑 tick（05 §3.5 的严格顺序） —— */
    function tick() {
      if (sm.get() !== S.STATE.PLAYING) return false;

      /* 注意顺序：本 tick 先用"当前朝向"移动，移动之后再取出下一个待执行方向。
         若在移动前出队，会把"立即生效"的转向覆盖掉，导致转向顺序错乱（自测 TC-10 发现）。 */

      var vec = S.DIRS[G.dir];
      var head = board.headCell();
      var hx = board.xOf(head) + vec.dx;
      var hy = board.yOf(head) + vec.dy;

      /* 2. 撞墙：先判定，蛇头永不绘制到棋盘外 */
      if (!board.inBounds(hx, hy)) { gameOver('wall'); return false; }

      var next = board.cellOf(hx, hy);
      var willGrow = (next === board.food);
      var tail = board.tailCell();

      /* 3. 撞自身（含跟尾例外，06 P-01） */
      if (board.has(next)) {
        var tailException = (!cfg.TAIL_CELL_BLOCKS) && (!willGrow) && (next === tail);
        if (!tailException) { gameOver('self'); return false; }
      }

      /* 4. 移动：先腾尾格再占新头格（跟尾时目标格就是尾格，顺序不可颠倒） */
      if (!willGrow) board.pop();
      board.push(next);
      G.tickCount += 1;

      /* 5. 吃食物与成长（同一 tick 内同步完成，无空窗帧，FR-07） */
      if (willGrow) {
        G.score += cfg.SCORE_PER_FOOD;
        G.foodsEaten += 1;
        updateBest();
        updateStep();
        if (board.size >= cfg.GRID * cfg.GRID) { win(); return false; }
        board.spawnFood(rng);
      }

      /* 6. 取出下一个待执行方向（FR-03：出队时再次校验反向合法性） */
      if (G.queue.length) {
        var d = G.queue.shift();
        if (d && d !== S.opposite(G.dir)) {
          if (d !== G.dir) pushTrace(d);
          G.dir = d;
        }
        G.turnApplied = true;  /* 下一 tick 的朝向已确定 */
      } else {
        G.turnApplied = false; /* 本间隔内允许一个新的"立即转向" */
      }

      syncHud();
      return true;
    }

    function gameOver(reason) {
      G.deadReason = reason;
      updateBest();
      sm.transition(S.STATE.OVER);
      stopLoop();
      G.queue.length = 0;
      renderer.showResult(
        reason === 'wall' ? cfg.COPY.DEATH_WALL : cfg.COPY.DEATH_SELF,
        [cfg.COPY.LABEL_SCORE + ' ' + G.score, cfg.COPY.LABEL_BEST + ' ' + G.best],
        cfg.COPY.BTN_AGAIN
      );
      if (els.overlayBtn && els.overlayBtn.focus) els.overlayBtn.focus();
      syncHud();
      render();
    }

    function win() {
      updateBest();
      sm.transition(S.STATE.WIN);
      stopLoop();
      G.queue.length = 0;
      renderer.showResult(
        cfg.COPY.WIN_TITLE,
        [cfg.COPY.LABEL_SCORE + ' ' + G.score, cfg.COPY.LABEL_BEST + ' ' + G.best],
        cfg.COPY.BTN_AGAIN
      );
      if (els.overlayBtn && els.overlayBtn.focus) els.overlayBtn.focus();
      syncHud();
      render();
    }

    function resetMatch() {
      G.score = 0;
      G.foodsEaten = 0;
      G.deadReason = null;
      G.queue.length = 0;
      G.trace.length = 0;
      G.acc = 0;
      G.lastTs = 0;
      G.tickCount = 0;
      G.turnApplied = false;
      G.dir = cfg.INITIAL_DIR;
      board.reset(cfg.INITIAL_LENGTH, cfg.INITIAL_DIR);
      board.spawnFood(rng);
      updateStep();
      stopLoop();
      sm.reset();
      renderer.hideOverlay();
      renderer.showHint();
      syncHud();
      render();
    }

    function beginPlay(dir) {
      var turned = !!(dir && dir !== G.dir); /* 起始输入是否真的转了一次向（同向出发不算） */
      if (dir && dir !== S.opposite(G.dir)) G.dir = dir;
      if (!sm.transition(S.STATE.PLAYING)) return false;
      G.queue.length = 0;
      G.turnApplied = turned;
      renderer.hideOverlay();
      startLoop();
      syncHud();
      render();
      return true;
    }

    function pause(reason) {
      if (sm.get() !== S.STATE.PLAYING) return false; /* 幂等：重复触发天然被吸收 */
      G.pauseReason = reason || 'manual';
      sm.transition(S.STATE.PAUSED);
      stopLoop();
      renderer.showMask(cfg.COPY.PAUSED_MASK);
      syncHud();
      render();
      return true;
    }

    function resume() {
      if (sm.get() !== S.STATE.PAUSED) return false;
      G.queue.length = 0; /* 暂停期间的输入不入队，恢复后不产生突然转向（TC-09） */
      G.turnApplied = true;
      sm.transition(S.STATE.PLAYING);
      renderer.hideOverlay();
      startLoop();
      syncHud();
      render();
      return true;
    }

    function togglePause() {
      if (sm.get() === S.STATE.PLAYING) return pause('manual');
      if (sm.get() === S.STATE.PAUSED) return resume();
      return false;
    }

    /* 方向输入统一入口，返回处理结果字符串（供自测与调试观察） */
    function handleDirection(dir) {
      if (!S.DIRS[dir]) return 'invalid';
      var st = sm.get();
      if (st === S.STATE.PAUSED) return 'ignored-paused'; /* E9 */
      if (st === S.STATE.OVER || st === S.STATE.WIN) {
        resetMatch();
        return handleDirection(dir); /* 重开后按 READY 规则判定 */
      }
      if (st === S.STATE.READY) {
        if (dir === S.opposite(G.dir)) {
          renderer.toast(cfg.COPY.READY_REVERSE); /* P-02：反向必须给出可见提示 */
          return 'rejected-reverse';
        }
        beginPlay(dir);
        return dir === cfg.INITIAL_DIR ? 'started-same' : 'started-turn';
      }
      /* PLAYING：每个 tick 间隔内，第一个合法转向立即生效；
         其后的合法转向进入待执行队列，最多 2 个（FR-03）。
         这样即使 3 个方向在同一个 tick 间隔内到达，也不会被吞掉第三个（TC-10）。 */
      if (dir === G.dir) return 'same';
      if (!G.turnApplied) {
        if (dir === S.opposite(G.dir)) return 'reverse';
        G.dir = dir;
        G.turnApplied = true;
        pushTrace(dir);
        return 'applied';
      }
      var ref = G.queue.length ? G.queue[G.queue.length - 1] : G.dir;
      if (dir === ref) return 'same';
      if (dir === S.opposite(ref)) return 'reverse';
      if (G.queue.length >= cfg.INPUT_BUFFER_MAX) return 'dropped';
      G.queue.push(dir);
      return 'queued';
    }

    function restart() {
      resetMatch();
      beginPlay(G.dir);
      return true;
    }

    function setDifficulty(d) {
      if (!Object.prototype.hasOwnProperty.call(cfg.DIFFICULTY, d)) return false;
      G.difficulty = d;
      storage.setDifficulty(d);
      updateStep();
      syncHud();
      render();
      return true;
    }

    /* —— 生命周期：自动暂停（FR-08 / E1 / E2 / 06 RR-5） —— */
    function onHidden() {
      if (document.hidden) pause('hidden');
    }
    function onBlur() { pause('blur'); }
    function onPageHide() { pause('pagehide'); }

    function applyLayout() {
      var info = layout.apply(true);
      if (!info) return null;
      renderer.setGeometry(info);
      render();
      return info;
    }

    function init() {
      els.difficulty.value = G.difficulty;
      layout = S.createLayout(els, function (info) {
        renderer.setGeometry(info);
        render();
      });
      S.createInput({
        boardBox: els.box,
        overlay: els.overlay,
        overlayBtn: els.overlayBtn,
        btnPause: els.btnPause,
        btnRestart: els.btnRestart,
        difficulty: els.difficulty,
        padButtons: els.padButtons,
        getState: function () { return sm.get(); },
        getSwipeThreshold: function () {
          var last = layout.last();
          var boardCss = last ? last.cellCss * cfg.GRID : cfg.GRID * 20;
          var t = boardCss * cfg.SWIPE_THRESHOLD_RATIO;
          if (t < cfg.SWIPE_THRESHOLD_MIN) t = cfg.SWIPE_THRESHOLD_MIN;
          if (t > cfg.SWIPE_THRESHOLD_MAX) t = cfg.SWIPE_THRESHOLD_MAX;
          return t;
        },
        onDirection: handleDirection,
        onToggle: togglePause,
        onRestart: restart,
        onDifficulty: setDifficulty
      });

      window.addEventListener('resize', applyLayout);
      window.addEventListener('orientationchange', applyLayout);
      document.addEventListener('visibilitychange', onHidden);
      window.addEventListener('blur', onBlur);
      window.addEventListener('pagehide', onPageHide);
      if (typeof ResizeObserver === 'function') {
        var ro = new ResizeObserver(function () { applyLayout(); });
        ro.observe(els.wrap);
      }
      if (window.matchMedia) {
        try {
          var dpr = window.devicePixelRatio || 1;
          var mq = window.matchMedia('(resolution: ' + dpr + 'dppx)');
          var onDpr = function () { applyLayout(); };
          if (mq.addEventListener) mq.addEventListener('change', onDpr);
          else if (mq.addListener) mq.addListener(onDpr);
        } catch (e) { /* 不支持则忽略，不影响功能 */ }
      }

      applyLayout();
      resetMatch();
    }

    var api = {
      els: els,
      board: board,
      sm: sm,
      G: G,
      layout: function () { return layout; },
      tick: tick,
      tickNow: function () { var r = tick(); render(); return r; },
      render: render,
      applyLayout: applyLayout,
      handleDirection: handleDirection,
      restart: restart,
      resetMatch: resetMatch,
      beginPlay: beginPlay,
      pause: pause,
      resume: resume,
      togglePause: togglePause,
      setDifficulty: setDifficulty,
      updateStep: updateStep,
      updateBest: updateBest,
      setAutoTick: function (on) {
        G.autoTick = !!on;
        if (!G.autoTick) stopLoop();
        else if (sm.get() === S.STATE.PLAYING) startLoop();
      },
      spawnFood: function () { return board.spawnFood(rng); },
      statusText: statusText,
      renderer: renderer,
      storage: storage,
      difficulty: function () { return G.difficulty; }
    };

    init();
    return api;
  };

  S.ready = function (fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  };

  S.ready(function () {
    try {
      S.game = S.boot();
      if (param('debug') === '1' && S.enableDebug) S.enableDebug(S.game);
    } catch (e) {
      /* 启动失败也必须让用户看到可理解的提示，而不是白屏（E12 零报错原则：
         这里不做异常吞没式掩盖，而是把失败显式呈现在界面上，便于定位） */
      var el = document.getElementById('status');
      if (el) el.textContent = '启动失败';
      var notice = document.getElementById('notice');
      if (notice) {
        notice.hidden = false;
        notice.textContent = '启动失败：' + (e && e.message ? e.message : '未知错误');
      }
    }
  });
})(window.Snake = window.Snake || {});
