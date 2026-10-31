/* 贪吃蛇 · 状态机（02 §6）
 * 所有状态写入都必须经过 transition()，非法转移被静默忽略。
 */
(function (S) {
  'use strict';

  var STATE = {
    READY: 'READY',
    PLAYING: 'PLAYING',
    PAUSED: 'PAUSED',
    OVER: 'OVER',
    WIN: 'WIN'
  };

  /* 02 §6.2 状态转移表：当前态 -> 允许到达的态 */
  var ALLOWED = {};
  ALLOWED[STATE.READY]   = [STATE.PLAYING];
  ALLOWED[STATE.PLAYING] = [STATE.PAUSED, STATE.OVER, STATE.WIN];
  ALLOWED[STATE.PAUSED]  = [STATE.PLAYING];
  ALLOWED[STATE.OVER]    = [STATE.PLAYING];
  ALLOWED[STATE.WIN]     = [STATE.PLAYING];

  S.STATE = STATE;

  S.createStateMachine = function (onChange) {
    var current = STATE.READY;
    return {
      get: function () { return current; },
      /* 返回 true 表示转移生效 */
      transition: function (next) {
        if (next === current) return false;
        if (ALLOWED[current].indexOf(next) === -1) return false;
        current = next;
        if (onChange) onChange(current);
        return true;
      },
      /* 重开对局：任何状态都允许回到 READY（内部使用，等价于重置） */
      reset: function () {
        current = STATE.READY;
        if (onChange) onChange(current);
        return true;
      }
    };
  };
})(window.Snake = window.Snake || {});
