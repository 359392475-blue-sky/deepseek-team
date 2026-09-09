import { useEffect, useRef } from "react";

const ASSETS = {
  player: "/assets/player-fighter.png",
  enemy: "/assets/enemy-drone.png",
  boss: "/assets/unified-flight-boss.png",
  bolt: "/assets/player-bolt.png",
  impact: "/assets/impact-burst.png",
};

function loadAssets() {
  return Promise.all(
    Object.entries(ASSETS).map(([key, source]) => new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve([key, image]);
      image.onerror = reject;
      image.src = source;
    })),
  ).then((entries) => Object.fromEntries(entries));
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function overlaps(a, b) {
  return a.x < b.x + b.width
    && a.x + a.width > b.x
    && a.y < b.y + b.height
    && a.y + a.height > b.y;
}

function createGame(width, height) {
  const playerY = Math.max(300, height - 86);
  return {
    width,
    height,
    player: { x: width / 2, targetX: width / 2, y: playerY },
    bullets: [],
    enemies: [
      { x: width * 0.22, y: height * 0.34, width: 50, height: 42, speed: 34, hp: 1, sway: 0.4 },
      { x: width * 0.78, y: height * 0.34, width: 50, height: 42, speed: 32, hp: 1, sway: 2.1 },
      { x: width * 0.25, y: height * 0.60, width: 47, height: 40, speed: 28, hp: 1, sway: 3.4 },
      { x: width * 0.73, y: height * 0.60, width: 47, height: 40, speed: 30, hp: 1, sway: 5.2 },
    ],
    impacts: [],
    score: 3120,
    lives: 3,
    lastShot: 0,
    lastSpawn: performance.now(),
    lastMetrics: 0,
    enhancedUntil: 0,
    flashUntil: 0,
    message: "",
    messageUntil: 0,
    keys: new Set(),
  };
}

function addImpact(game, x, y, size = 60, duration = 430) {
  game.impacts.push({ x, y, size, bornAt: performance.now(), duration });
}

function addVolley(game, enhanced = false) {
  const offsets = enhanced ? [-17, 0, 17] : [0];
  offsets.forEach((offset) => {
    game.bullets.push({
      x: game.player.x + offset,
      y: game.player.y - 40,
      vx: offset * 1.8,
      vy: -680,
      width: enhanced ? 13 : 10,
      height: enhanced ? 34 : 28,
      enhanced,
    });
  });
}

function drawSprite(context, image, x, y, width, height, alpha = 1) {
  context.save();
  context.globalAlpha = alpha;
  context.drawImage(image, x - width / 2, y - height / 2, width, height);
  context.restore();
}

function resizeCanvas(canvas, game) {
  const bounds = canvas.getBoundingClientRect();
  const density = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(bounds.width * density);
  canvas.height = Math.round(bounds.height * density);
  const oldWidth = game.width || bounds.width;
  game.player.x = (game.player.x / oldWidth) * bounds.width;
  game.player.targetX = game.player.x;
  game.player.y = Math.max(300, bounds.height - 86);
  game.width = bounds.width;
  game.height = bounds.height;
  return { density };
}

export function FlightRaidCanvas({ onMetrics, paused, weaponEvent }) {
  const canvasRef = useRef(null);
  const gameRef = useRef(null);
  const assetsRef = useRef(null);
  const pausedRef = useRef(paused);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    const game = gameRef.current;
    if (!game || weaponEvent.type === "idle") return;
    const now = performance.now();

    if (weaponEvent.type === "nuke") {
      game.enemies.forEach((enemy) => addImpact(game, enemy.x, enemy.y, enemy.width * 2.4, 620));
      game.score += game.enemies.length * 100;
      game.enemies = [];
      game.flashUntil = now + 430;
      game.message = "清屏核弹 · 全屏净空";
      game.messageUntil = now + 1500;
      addImpact(game, game.width / 2, game.height * 0.45, Math.min(game.width, game.height) * 0.74, 650);
    }

    if (weaponEvent.type === "enhanced") {
      game.enhancedUntil = now + 8000;
      game.message = "强化火力 · 三向散射 8 秒";
      game.messageUntil = now + 1500;
      addImpact(game, game.player.x, game.player.y - 42, 92, 540);
    }
  }, [weaponEvent]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d", { alpha: true });
    let animationFrame = 0;
    let previous = performance.now();
    let dimensions;
    let cancelled = false;

    const initialBounds = canvas.getBoundingClientRect();
    gameRef.current = createGame(initialBounds.width, initialBounds.height);
    dimensions = resizeCanvas(canvas, gameRef.current);

    const observer = new ResizeObserver(() => {
      if (gameRef.current) dimensions = resizeCanvas(canvas, gameRef.current);
    });
    observer.observe(canvas);

    const moveHorizontally = (clientX) => {
      const game = gameRef.current;
      const bounds = canvas.getBoundingClientRect();
      game.player.targetX = clamp(clientX - bounds.left, 34, bounds.width - 34);
    };

    const pointerMove = (event) => moveHorizontally(event.clientX);
    const keyDown = (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      gameRef.current?.keys.add(event.key.toLowerCase());
    };
    const keyUp = (event) => gameRef.current?.keys.delete(event.key.toLowerCase());

    canvas.addEventListener("pointermove", pointerMove);
    canvas.addEventListener("pointerdown", pointerMove);
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);

    const render = (now) => {
      if (cancelled || !assetsRef.current || !gameRef.current) return;
      const game = gameRef.current;
      const assets = assetsRef.current;
      const delta = Math.min((now - previous) / 1000, 0.033);
      previous = now;

      if (!pausedRef.current) {
        const left = game.keys.has("arrowleft");
        const right = game.keys.has("arrowright");
        game.player.targetX += ((right ? 1 : 0) - (left ? 1 : 0)) * 360 * delta;
        game.player.targetX = clamp(game.player.targetX, 34, game.width - 34);
        game.player.x += (game.player.targetX - game.player.x) * Math.min(1, delta * 15);
        game.player.y = Math.max(300, game.height - 86);

        const enhanced = game.enhancedUntil > now;
        if (now - game.lastShot > (enhanced ? 112 : 205)) {
          addVolley(game, enhanced);
          game.lastShot = now;
        }

        if (now - game.lastSpawn > 900 && game.enemies.length < 7) {
          const size = 39 + Math.random() * 15;
          game.enemies.push({
            x: 44 + Math.random() * Math.max(40, game.width - 88),
            y: 215,
            width: size,
            height: size * 0.84,
            speed: 56 + Math.random() * 45,
            hp: Math.random() > 0.82 ? 2 : 1,
            sway: Math.random() * Math.PI * 2,
          });
          game.lastSpawn = now;
        }

        game.bullets.forEach((bullet) => {
          bullet.x += bullet.vx * delta;
          bullet.y += bullet.vy * delta;
        });
        game.bullets = game.bullets.filter((bullet) => bullet.y > -50 && bullet.x > -40 && bullet.x < game.width + 40);

        game.enemies.forEach((enemy) => {
          enemy.y += enemy.speed * delta;
          enemy.x += Math.sin(now / 520 + enemy.sway) * 15 * delta;
        });

        const playerBox = { x: game.player.x - 15, y: game.player.y - 24, width: 30, height: 48 };
        game.enemies.forEach((enemy) => {
          if (enemy.dead) return;
          const enemyBox = {
            x: enemy.x - enemy.width * 0.34,
            y: enemy.y - enemy.height * 0.34,
            width: enemy.width * 0.68,
            height: enemy.height * 0.68,
          };
          if (!overlaps(playerBox, enemyBox)) return;
          enemy.dead = true;
          game.lives = Math.max(0, game.lives - 1);
          addImpact(game, game.player.x, game.player.y, 106, 620);
          game.message = game.lives ? "战机受损 · 继续作战" : "重新集结";
          game.messageUntil = now + 1400;
          if (game.lives === 0) {
            game.lives = 3;
            game.score = Math.max(0, game.score - 300);
          }
        });

        game.bullets.forEach((bullet) => {
          if (bullet.dead) return;
          if (bullet.y < 190 && Math.abs(bullet.x - game.width / 2) < Math.min(96, game.width * 0.18)) {
            bullet.dead = true;
            if (Math.random() > 0.72) addImpact(game, bullet.x, bullet.y, bullet.enhanced ? 42 : 26);
            return;
          }

          for (const enemy of game.enemies) {
            if (enemy.dead || bullet.dead) continue;
            const enemyBox = {
              x: enemy.x - enemy.width / 2,
              y: enemy.y - enemy.height / 2,
              width: enemy.width,
              height: enemy.height,
            };
            const bulletBox = { x: bullet.x - 5, y: bullet.y - 14, width: 10, height: 28 };
            if (!overlaps(enemyBox, bulletBox)) continue;
            bullet.dead = true;
            enemy.hp -= bullet.enhanced ? 2 : 1;
            addImpact(game, bullet.x, bullet.y, 34);
            if (enemy.hp <= 0) {
              enemy.dead = true;
              game.score += 100;
              addImpact(game, enemy.x, enemy.y, enemy.width * 1.9, 520);
            }
          }
        });

        game.bullets = game.bullets.filter((bullet) => !bullet.dead);
        game.enemies = game.enemies.filter((enemy) => !enemy.dead && enemy.y < game.height + 70);
        game.impacts = game.impacts.filter((impact) => now - impact.bornAt < impact.duration);
      }

      context.setTransform(dimensions.density, 0, 0, dimensions.density, 0, 0);
      context.clearRect(0, 0, game.width, game.height);

      const bossBob = Math.sin(now / 760) * 3;
      drawSprite(context, assets.boss, game.width / 2, 150 + bossBob, Math.min(222, game.width * 0.32), Math.min(310, game.width * 0.45), 0.96);

      game.enemies.forEach((enemy) => {
        drawSprite(context, assets.enemy, enemy.x, enemy.y, enemy.width, enemy.height, 0.92);
      });

      game.bullets.forEach((bullet) => {
        drawSprite(context, assets.bolt, bullet.x, bullet.y, bullet.width, bullet.height, bullet.enhanced ? 1 : 0.84);
      });

      [{ x: -66, y: 30 }, { x: 66, y: 30 }, { x: 0, y: 53 }].forEach((offset, index) => {
        drawSprite(context, assets.player, game.player.x + offset.x, game.player.y + offset.y, 27, 42, 0.27 + index * 0.04);
      });
      drawSprite(context, assets.player, game.player.x, game.player.y, 49, 74, 1);

      game.impacts.forEach((impact) => {
        const elapsed = now - impact.bornAt;
        const progress = elapsed / impact.duration;
        const size = impact.size * (0.7 + progress * 0.5);
        drawSprite(context, assets.impact, impact.x, impact.y, size, size, 1 - progress);
      });

      if (game.flashUntil > now) {
        context.save();
        context.fillStyle = `rgba(235, 244, 255, ${0.72 * ((game.flashUntil - now) / 430)})`;
        context.fillRect(0, 0, game.width, game.height);
        context.restore();
      }

      if (game.messageUntil > now) {
        context.save();
        context.textAlign = "center";
        context.fillStyle = "rgba(255, 255, 255, 0.9)";
        context.beginPath();
        context.roundRect(game.width / 2 - 116, Math.min(250, game.height * 0.3), 232, 38, 19);
        context.fill();
        context.fillStyle = "#253142";
        context.font = "600 13px -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif";
        context.fillText(game.message, game.width / 2, Math.min(274, game.height * 0.3 + 24));
        context.restore();
      }

      if (now - game.lastMetrics > 160) {
        onMetrics({ score: game.score, lives: game.lives, enhanced: game.enhancedUntil > now });
        game.lastMetrics = now;
      }

      animationFrame = requestAnimationFrame(render);
    };

    loadAssets().then((assets) => {
      if (cancelled) return;
      assetsRef.current = assets;
      previous = performance.now();
      animationFrame = requestAnimationFrame(render);
    }).catch(() => {
      const game = gameRef.current;
      if (game) {
        game.message = "游戏素材加载失败，请刷新重试";
        game.messageUntil = Number.POSITIVE_INFINITY;
      }
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(animationFrame);
      observer.disconnect();
      canvas.removeEventListener("pointermove", pointerMove);
      canvas.removeEventListener("pointerdown", pointerMove);
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
    };
  }, [onMetrics]);

  return (
    <canvas
      aria-label="协作飞机大战。左右移动鼠标或使用左右方向键控制战机，战机会自动开火。"
      className="flight-canvas"
      ref={canvasRef}
      role="img"
      tabIndex={0}
    />
  );
}
