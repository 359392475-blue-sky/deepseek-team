/* 贪吃蛇 · 参数集中配置（D14 / NFR-09）
 * 本文件是全部可调参数的唯一来源。数值基线来自《02》v1.1 §4.1；
 * G0 裁决（《06》）批准的开关与阈值一并落入此处。
 */
(function (S) {
  'use strict';

  S.CONFIG = {
    /* —— 棋盘与初始状态（02 §4.1，维持原值） —— */
    GRID: 20,
    INITIAL_LENGTH: 3,
    INITIAL_DIR: 'right',

    /* —— 速度（02 §4.1 + 06 §2.5 难度只改 BASE_STEP_MS） —— */
    BASE_STEP_MS: 200,
    SPEEDUP_EVERY_FOODS: 5,
    SPEEDUP_STEP_MS: 10,
    MIN_STEP_MS: 100,
    DIFFICULTY: { slow: 260, normal: 200, fast: 150 },
    DEFAULT_DIFFICULTY: 'normal',

    /* —— 食物与计分（02 §4.1） —— */
    FOOD_COUNT: 1,
    SCORE_PER_FOOD: 10,

    /* —— 输入（02 §4.1 + 06 S-1） —— */
    INPUT_BUFFER_MAX: 2,
    SWIPE_MIN_KEY_MOVE_PX: 6,
    SWIPE_THRESHOLD_RATIO: 0.08,
    SWIPE_THRESHOLD_MIN: 16,
    SWIPE_THRESHOLD_MAX: 32,

    /* —— 布局与视口（06 P-04） —— */
    MIN_CELL_PX: 8,
    MIN_VIEWPORT_PX: 250,
    /* 紧凑档只按视口判定：避免"隐藏方向键 -> 棋盘变大 -> 又显示方向键"的振荡 */
    COMPACT_VIEWPORT_W: 300,
    COMPACT_VIEWPORT_H: 520,
    DPR_MAX: 3,

    /* —— 主循环（05 §3.3） —— */
    MAX_FRAME_DT_MS: 250,
    MAX_TICKS_PER_FRAME: 4,

    /* —— 碰撞规则（06 P-01） —— */
    TAIL_CELL_BLOCKS: false,

    /* —— 存储（C9 / 06 P-12） —— */
    STORAGE_KEY: 'snake.v1',

    /* —— 文案（06 §4 定稿，研发照抄） —— */
    COPY: {
      HINT: '方向键 / WASD 移动 · 手机滑动屏幕 · 空格暂停',
      READY_REVERSE: '蛇朝右出发，按 ↑ / ↓ 也可以开始',
      STATUS_READY: '待开始',
      STATUS_PLAYING: '进行中',
      STATUS_PAUSED: '已暂停',
      STATUS_OVER: '已结束',
      STATUS_WIN: '通关',
      PAUSED_MASK: '已暂停 · 按空格或点击继续',
      DEATH_WALL: '撞到墙',
      DEATH_SELF: '撞到自己',
      WIN_TITLE: '通关',
      LABEL_SCORE: '本局得分',
      LABEL_BEST: '最高分',
      BTN_AGAIN: '再来一局',
      SESSION_BEST: '最高分：本次会话',
      VIEWPORT_TOO_SMALL: '窗口过小，建议放大窗口（宽 ≥ 250 px）',
      BTN_PAUSE: '暂停',
      BTN_RESUME: '继续'
    },

    TOAST_MS: 2000
  };
})(window.Snake = window.Snake || {});
