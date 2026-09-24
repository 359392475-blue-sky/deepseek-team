/** Canvas engine for the browser-local Team Battle flight game. */

import { useEffect, useRef } from 'react'
import bossUrl from '../assets/project-boss.png'
import boltUrl from '../assets/player-bolt.png'
import droneUrl from '../assets/enemy-drone.png'
import impactUrl from '../assets/impact-burst.png'
import playerUrl from '../assets/player-fighter.png'

interface Point { x: number; y: number }
interface Box extends Point { width: number; height: number }
interface Bullet extends Box { vx: number; vy: number; dead?: boolean }
interface Enemy extends Box { speed: number; hp: number; sway: number; dead?: boolean }
interface Impact extends Point { size: number; bornAt: number; duration: number }

interface Game {
  width: number
  height: number
  player: Point & { targetX: number }
  bullets: Bullet[]
  enemies: Enemy[]
  impacts: Impact[]
  score: number
  lives: number
  lastShot: number
  lastSpawn: number
  lastMetrics: number
  flashUntil: number
  gameOver: boolean
  keys: Set<string>
}

interface Assets {
  player: HTMLImageElement
  enemy: HTMLImageElement
  boss: HTMLImageElement
  bolt: HTMLImageElement
  impact: HTMLImageElement
}

/** Browser-local score and life counters emitted at a bounded cadence. */
export interface FlightMetrics {
  readonly score: number
  readonly lives: number
  readonly gameOver: boolean
}

/** Props for the reusable flight canvas. */
export interface FlightCanvasProps {
  readonly active: boolean
  readonly paused: boolean
  readonly restartToken: number
  readonly weaponSerial: number
  readonly memberCount: number
  readonly reducedMotion: boolean
  readonly label: string
  readonly onMetrics: (metrics: FlightMetrics) => void
}

const ASSETS = {
  player: playerUrl,
  enemy: droneUrl,
  boss: bossUrl,
  bolt: boltUrl,
  impact: impactUrl,
} as const

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum)
}

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.width
    && a.x + a.width > b.x
    && a.y < b.y + b.height
    && a.y + a.height > b.y
}

function createGame(width: number, height: number): Game {
  const playerY = Math.max(80, height - 68)
  return {
    width,
    height,
    player: { x: width / 2, targetX: width / 2, y: playerY },
    bullets: [],
    enemies: [],
    impacts: [],
    score: 0,
    lives: 3,
    lastShot: 0,
    lastSpawn: performance.now(),
    lastMetrics: 0,
    flashUntil: 0,
    gameOver: false,
    keys: new Set(),
  }
}

function addImpact(game: Game, x: number, y: number, size = 60, duration = 430): void {
  game.impacts.push({ x, y, size, bornAt: performance.now(), duration })
}

function addVolley(game: Game): void {
  game.bullets.push({
    x: game.player.x - 5,
    y: game.player.y - 35,
    vx: 0,
    vy: -610,
    width: 10,
    height: 28,
  })
}

function drawSprite(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
  alpha = 1,
): void {
  context.save()
  context.globalAlpha = alpha
  context.drawImage(image, x - width / 2, y - height / 2, width, height)
  context.restore()
}

async function loadImage(source: string): Promise<HTMLImageElement> {
  const image = new Image()
  await new Promise<void>((resolve, reject) => {
    image.onload = () => { resolve() }
    image.onerror = reject
    image.src = source
  })
  return image
}

function loadAssets(): Promise<Assets> {
  return Promise.all([
    loadImage(ASSETS.player), loadImage(ASSETS.enemy), loadImage(ASSETS.boss),
    loadImage(ASSETS.bolt), loadImage(ASSETS.impact),
  ]).then(([player, enemy, boss, bolt, impact]) => ({ player, enemy, boss, bolt, impact }))
}

function resizeCanvas(canvas: HTMLCanvasElement, game: Game): number {
  const bounds = canvas.getBoundingClientRect()
  const density = Math.min(window.devicePixelRatio || 1, 2)
  if (bounds.width === 0 || bounds.height === 0) return density
  canvas.width = Math.round(bounds.width * density)
  canvas.height = Math.round(bounds.height * density)
  const oldWidth = game.width || bounds.width
  game.player.x = (game.player.x / oldWidth) * bounds.width
  game.player.targetX = game.player.x
  game.player.y = Math.max(80, bounds.height - 68)
  game.width = bounds.width
  game.height = bounds.height
  return density
}

/** Render a pointer/keyboard-controlled shooter whose score never leaves the browser. */
export function FlightCanvas({
  active, paused, restartToken, weaponSerial, memberCount, reducedMotion, label, onMetrics,
}: FlightCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gameRef = useRef<Game | null>(null)
  const pausedRef = useRef(paused)
  const activeRef = useRef(active)
  const animationRef = useRef<{ resume: () => void; stop: () => void } | null>(null)
  const memberCountRef = useRef(memberCount)
  const reducedMotionRef = useRef(reducedMotion)
  const metricsRef = useRef(onMetrics)

  pausedRef.current = paused
  activeRef.current = active
  memberCountRef.current = memberCount
  reducedMotionRef.current = reducedMotion
  metricsRef.current = onMetrics

  useEffect(() => {
    const game = gameRef.current
    if (game === null || weaponSerial === 0) return
    const now = performance.now()
    for (const enemy of game.enemies) addImpact(game, enemy.x, enemy.y, enemy.width * 2.2, 520)
    game.score += game.enemies.length * 100
    game.enemies = []
    game.flashUntil = reducedMotion ? 0 : now + 320
    addImpact(game, game.width / 2, game.height * 0.42, Math.min(game.width, game.height) * 0.72, 560)
  }, [reducedMotion, weaponSerial])

  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas === null) return
    const context = canvas.getContext('2d', { alpha: true })
    if (context === null) return
    let frame = 0
    let previous = performance.now()
    let density = 1
    let cancelled = false
    let assets: Assets | null = null
    const game = createGame(canvas.getBoundingClientRect().width, canvas.getBoundingClientRect().height)
    gameRef.current = game
    density = resizeCanvas(canvas, game)
    metricsRef.current({ score: game.score, lives: game.lives, gameOver: false })

    const observer = new ResizeObserver(() => { density = resizeCanvas(canvas, game) })
    observer.observe(canvas)

    const move = (clientX: number): void => {
      const bounds = canvas.getBoundingClientRect()
      game.player.targetX = clamp(clientX - bounds.left, 30, bounds.width - 30)
    }
    const pointerMove = (event: PointerEvent): void => { move(event.clientX) }
    const keyDown = (event: KeyboardEvent): void => {
      if (!activeRef.current || pausedRef.current) return
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      event.preventDefault()
      game.keys.add(event.key.toLowerCase())
    }
    const keyUp = (event: KeyboardEvent): void => { game.keys.delete(event.key.toLowerCase()) }
    const clearKeys = (): void => { game.keys.clear() }
    canvas.addEventListener('pointermove', pointerMove)
    canvas.addEventListener('pointerdown', pointerMove)
    canvas.addEventListener('keydown', keyDown)
    canvas.addEventListener('keyup', keyUp)
    canvas.addEventListener('blur', clearKeys)

    const render = (now: number): void => {
      frame = 0
      if (cancelled || assets === null || !activeRef.current) return
      const delta = Math.min((now - previous) / 1000, 0.033)
      previous = now
      if (!pausedRef.current && !game.gameOver) {
        const horizontal = (game.keys.has('arrowright') ? 1 : 0) - (game.keys.has('arrowleft') ? 1 : 0)
        game.player.targetX = clamp(game.player.targetX + horizontal * 340 * delta, 30, game.width - 30)
        game.player.x += (game.player.targetX - game.player.x) * Math.min(1, delta * 15)
        game.player.y = Math.max(80, game.height - 68)

        if (now - game.lastShot > 210) {
          addVolley(game)
          game.lastShot = now
        }
        if (now - game.lastSpawn > 830 && game.enemies.length < 7) {
          const size = 35 + Math.random() * 13
          game.enemies.push({
            x: 34 + Math.random() * Math.max(40, game.width - 68),
            y: game.height * 0.38,
            width: size,
            height: size * 0.84,
            speed: 48 + Math.random() * 42,
            hp: Math.random() > 0.84 ? 2 : 1,
            sway: Math.random() * Math.PI * 2,
          })
          game.lastSpawn = now
        }

        for (const bullet of game.bullets) {
          bullet.x += bullet.vx * delta
          bullet.y += bullet.vy * delta
        }
        for (const enemy of game.enemies) {
          enemy.y += enemy.speed * delta
          if (!reducedMotionRef.current) enemy.x += Math.sin(now / 520 + enemy.sway) * 14 * delta
        }

        const playerBox = { x: game.player.x - 14, y: game.player.y - 22, width: 28, height: 44 }
        for (const enemy of game.enemies) {
          if (enemy.dead === true) continue
          const enemyBox = {
            x: enemy.x - enemy.width * 0.34,
            y: enemy.y - enemy.height * 0.34,
            width: enemy.width * 0.68,
            height: enemy.height * 0.68,
          }
          if (!overlaps(playerBox, enemyBox)) continue
          enemy.dead = true
          game.lives = Math.max(0, game.lives - 1)
          addImpact(game, game.player.x, game.player.y, 92, 520)
          game.gameOver = game.lives === 0
        }

        for (const bullet of game.bullets) {
          if (bullet.dead === true) continue
          for (const enemy of game.enemies) {
            if (enemy.dead === true || bullet.dead === true) continue
            const enemyBox = {
              x: enemy.x - enemy.width / 2,
              y: enemy.y - enemy.height / 2,
              width: enemy.width,
              height: enemy.height,
            }
            const bulletBox = { x: bullet.x - 5, y: bullet.y - 14, width: 10, height: 28 }
            if (!overlaps(enemyBox, bulletBox)) continue
            bullet.dead = true
            enemy.hp -= 1
            if (!reducedMotionRef.current) addImpact(game, bullet.x, bullet.y, 28)
            if (enemy.hp <= 0) {
              enemy.dead = true
              game.score += 100
              addImpact(game, enemy.x, enemy.y, enemy.width * 1.7, 450)
            }
          }
        }
        game.bullets = game.bullets.filter(bullet => bullet.dead !== true && bullet.y > -40)
        game.enemies = game.enemies.filter(enemy => enemy.dead !== true && enemy.y < game.height + 60)
        game.impacts = game.impacts.filter(impact => now - impact.bornAt < impact.duration)
      }

      context.setTransform(density, 0, 0, density, 0, 0)
      context.clearRect(0, 0, game.width, game.height)
      const bossBob = reducedMotionRef.current ? 0 : Math.sin(now / 760) * 3
      drawSprite(
        context,
        assets.boss,
        game.width / 2,
        game.height * 0.2 + bossBob,
        Math.min(100, game.width * 0.32),
        Math.min(120, game.height * 0.35),
        0.93,
      )
      for (const enemy of game.enemies) drawSprite(context, assets.enemy, enemy.x, enemy.y, enemy.width, enemy.height, 0.9)
      for (const bullet of game.bullets) drawSprite(context, assets.bolt, bullet.x, bullet.y, bullet.width, bullet.height, 0.88)

      const formation = memberCountRef.current >= 4
        ? [{ x: -52, y: 25 }, { x: 52, y: 25 }, { x: 0, y: 42 }]
        : [{ x: -44, y: 28 }, { x: 44, y: 28 }]
      for (const offset of formation) {
        drawSprite(context, assets.player, game.player.x + offset.x, game.player.y + offset.y, 25, 39, 0.34)
      }
      drawSprite(context, assets.player, game.player.x, game.player.y, 43, 65)
      if (!reducedMotionRef.current) {
        for (const impact of game.impacts) {
          const progress = (now - impact.bornAt) / impact.duration
          const size = impact.size * (0.72 + progress * 0.4)
          drawSprite(context, assets.impact, impact.x, impact.y, size, size, 1 - progress)
        }
      }
      if (game.flashUntil > now) {
        context.save()
        context.fillStyle = `rgba(226, 239, 255, ${0.62 * ((game.flashUntil - now) / 320)})`
        context.fillRect(0, 0, game.width, game.height)
        context.restore()
      }
      if (now - game.lastMetrics > 160) {
        metricsRef.current({ score: game.score, lives: game.lives, gameOver: game.gameOver })
        game.lastMetrics = now
      }
      frame = requestAnimationFrame(render)
    }

    const resume = (): void => {
      if (frame !== 0 || assets === null || cancelled || !activeRef.current) return
      density = resizeCanvas(canvas, game)
      previous = performance.now()
      frame = requestAnimationFrame(render)
    }
    animationRef.current = {
      resume,
      stop: () => { cancelAnimationFrame(frame); frame = 0; game.keys.clear() },
    }

    void loadAssets().then((loaded) => {
      if (cancelled) return
      assets = loaded
      resume()
    })

    return () => {
      cancelled = true
      gameRef.current = null
      animationRef.current = null
      cancelAnimationFrame(frame)
      observer.disconnect()
      canvas.removeEventListener('pointermove', pointerMove)
      canvas.removeEventListener('pointerdown', pointerMove)
      canvas.removeEventListener('keydown', keyDown)
      canvas.removeEventListener('keyup', keyUp)
      canvas.removeEventListener('blur', clearKeys)
    }
  }, [restartToken])

  useEffect(() => {
    if (active) animationRef.current?.resume()
    else animationRef.current?.stop()
  }, [active])

  return <canvas ref={canvasRef} className="team-battle-flight-canvas" role="img" tabIndex={0} aria-label={label} />
}
