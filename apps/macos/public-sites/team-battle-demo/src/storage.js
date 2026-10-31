/* 贪吃蛇 · 本地存储与降级（05 §3.11 / FR-12 / E5 / C9 / 06 P-12）
 * 规则：读不到、读坏了、写不进 —— 一律静默降级为"仅本次会话有效"。
 * 全项目不使用 alert / confirm / prompt，不写 cookie，不发任何请求。
 */
(function (S) {
  'use strict';

  var cfg = S.CONFIG;

  S.createStorage = function () {
    var mem = { bestScore: 0, difficulty: cfg.DEFAULT_DIFFICULTY };
    var available = false;
    var ls = null;

    try {
      ls = window.localStorage;
    } catch (e) {
      ls = null;
    }

    if (ls) {
      try {
        var probeKey = cfg.STORAGE_KEY + '.probe';
        ls.setItem(probeKey, '1');
        ls.removeItem(probeKey);
        available = true;
      } catch (e2) {
        available = false;
      }
    }

    function isFiniteNonNegative(v) {
      return typeof v === 'number' && isFinite(v) && v >= 0;
    }

    function isDifficulty(v) {
      return typeof v === 'string' && Object.prototype.hasOwnProperty.call(cfg.DIFFICULTY, v);
    }

    function read() {
      if (!available || !ls) return mem;
      var raw;
      try {
        raw = ls.getItem(cfg.STORAGE_KEY);
      } catch (e) {
        return mem;
      }
      if (raw === null || raw === undefined || raw === '') return mem;
      var parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (e2) {
        return mem; /* 旧格式/损坏：不崩溃、不迁移，直接使用默认值 */
      }
      if (!parsed || typeof parsed !== 'object') return mem;
      var out = { bestScore: mem.bestScore, difficulty: mem.difficulty };
      if (isFiniteNonNegative(parsed.bestScore)) out.bestScore = Math.floor(parsed.bestScore);
      if (isDifficulty(parsed.difficulty)) out.difficulty = parsed.difficulty;
      return out;
    }

    function write(next) {
      mem = { bestScore: next.bestScore, difficulty: next.difficulty };
      if (!available || !ls) return false;
      try {
        ls.setItem(cfg.STORAGE_KEY, JSON.stringify(mem));
        return true;
      } catch (e) {
        available = false; /* 写失败后不再尝试，但游戏继续 */
        return false;
      }
    }

    var state = read();

    return {
      get bestScore() { return state.bestScore; },
      get difficulty() { return state.difficulty; },
      isAvailable: function () { return available; },
      setBestScore: function (v) {
        if (!isFiniteNonNegative(v)) return false;
        state.bestScore = Math.floor(v);
        return write(state);
      },
      setDifficulty: function (d) {
        if (!isDifficulty(d)) return false;
        state.difficulty = d;
        return write(state);
      }
    };
  };
})(window.Snake = window.Snake || {});
