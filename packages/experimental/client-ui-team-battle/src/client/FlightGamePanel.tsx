/** Optional Team Battle flight game rendered beside the ordinary chat. */

import { useCallback, useEffect, useId, useMemo, useState, type CSSProperties, type KeyboardEvent } from 'react'
import {
  IconChevronDownOutlineRegular,
  IconChevronUpOutlineRegular,
  IconPauseOutlineRegular,
  IconPlayOutlineRegular,
  IconRefreshOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type { TeamBattleInjected } from './actions.ts'
import { FlightCanvas, type FlightMetrics } from './FlightCanvas.tsx'
import { NS } from './locales.ts'
import { useTeamBattleLive } from './useTeamBattleLive.ts'
import capsuleUrl from '../assets/special-weapon-capsule.png'
import fighterUrl from '../assets/player-fighter.png'
import paperSkyUrl from '../assets/paper-sky.webp'
import css from './FlightGamePanel.module.css'

/** Full props of the registered conversation flight sidecar. */
export type FlightGamePanelProps =
  PropsRuntime<'conversation.chat.sidecar'> & TeamBattleInjected & PropsLocale<typeof NS>

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = (): void => { setReduced(query.matches) }
    update()
    query.addEventListener('change', update)
    return () => { query.removeEventListener('change', update) }
  }, [])
  return reduced
}

/** Render the browser-local flight game while consuming only durable Query weapon grants. */
export function FlightGamePanel({ sessionId, t, ...actions }: FlightGamePanelProps) {
  const live = useTeamBattleLive(actions, sessionId)
  const [expanded, setExpanded] = useState(false)
  const [started, setStarted] = useState(false)
  const bodyId = useId()
  const [paused, setPaused] = useState(false)
  const [restartToken, setRestartToken] = useState(0)
  const [weaponSerial, setWeaponSerial] = useState(0)
  const [metrics, setMetrics] = useState<FlightMetrics>({ score: 0, lives: 3, gameOver: false })
  const reducedMotion = useReducedMotion()
  const view = live.view
  const weapons = useMemo(() => view?.weaponGrants.filter(weapon => weapon.consumedAt === undefined) ?? [], [view])
  const available = weapons[0]

  const consume = useCallback(async (): Promise<void> => {
    if (available === undefined || live.pending) return
    const consumed = await live.mutate(() => actions.consumeWeapon({ weaponId: available.id }))
    if (consumed !== undefined) setWeaponSerial(serial => serial + 1)
  }, [actions, available, live])

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (!expanded || event.code !== 'Space' || !(event.target instanceof HTMLCanvasElement)) return
    event.preventDefault()
    void consume()
  }

  const restart = (): void => {
    setPaused(false)
    setMetrics({ score: 0, lives: 3, gameOver: false })
    setRestartToken(token => token + 1)
  }

  return (
    <aside className={css.root} data-flight-game-panel="" data-expanded={expanded} style={{ '--flight-paper': `url("${paperSkyUrl}")` } as CSSProperties} onKeyDown={handleKeyDown}>
      <header className={css.header}>
        <div>
          <span className={css.eyebrow}>{t('game.waiting')}</span>
          <h2>{t('game.title')}</h2>
        </div>
        <div className={css.headerActions}>
          {expanded && <>
            <button type="button" aria-label={paused ? t('game.resume') : t('game.pause')} onClick={() => { setPaused(value => !value) }}>{paused ? <IconPlayOutlineRegular size={14} /> : <IconPauseOutlineRegular size={14} />}</button>
            <button type="button" aria-label={t('game.restart')} onClick={restart}><IconRefreshOutlineRegular /></button>
          </>}
          <button type="button" className={css.toggle} aria-expanded={expanded} aria-controls={bodyId} onClick={() => {
            setStarted(true)
            setExpanded(value => !value)
          }}>{expanded ? <IconChevronUpOutlineRegular /> : <IconChevronDownOutlineRegular />}{t(expanded ? 'game.collapse' : 'game.expand')}</button>
        </div>
      </header>
      <div id={bodyId} className={css.body} hidden={!expanded}>
        {started && <>
          <div className={css.projectStrip}>
            <strong>{view?.project.name ?? t('common.loading')}</strong>
            <div className={css.dualMeters}>
              <div><span>{t('project.combatShield')}</span><b>{view?.combatShield.hp ?? '—'} / {view?.combatShield.maxHp ?? '—'}</b><meter min="0" max={view?.combatShield.maxHp ?? 100} value={view?.combatShield.hp ?? 0} /></div>
              <div><span>{t('project.coreHp')}</span><b>{view?.progress.coreHp ?? '—'} / {view?.progress.coreMaxHp ?? '—'}</b><meter className={css.coreMeter} min="0" max={view?.progress.coreMaxHp ?? 100} value={view?.progress.coreHp ?? 0} /></div>
            </div>
            <div className={css.progress}><span>{t('project.progress')}</span><strong>{view?.progress.percent ?? 0}%</strong></div>
          </div>
          <div className={css.formation} aria-label={t('members.title')}>
            {(view?.members ?? []).slice(0, 4).map(member => <span key={member.id} data-status={member.status} style={{ '--member-color': member.color ?? '#5c6b82' } as CSSProperties} title={`${member.name} · ${member.role}`}>{member.name.slice(0, 1)}</span>)}
            <b>{Math.min(view?.members.length ?? 0, 4)}/4</b>
          </div>
          <div className={css.gameStage}>
            <FlightCanvas
              active={expanded}
              paused={paused || metrics.gameOver || !expanded}
              restartToken={restartToken}
              weaponSerial={weaponSerial}
              memberCount={Math.max(3, Math.min(view?.members.length ?? 3, 4))}
              reducedMotion={reducedMotion}
              label={t('game.controls')}
              onMetrics={setMetrics}
            />
            <div className={css.gameHud}>
              <span>{t('game.score')} <b>{metrics.score.toLocaleString()}</b></span>
              <span className={css.lives} aria-label={t('game.livesValue', { current: metrics.lives })}>
                <span>{t('game.lives')}</span>
                {[0, 1, 2].map(index => <img key={index} src={fighterUrl} alt="" data-lost={index >= metrics.lives ? '' : undefined} />)}
              </span>
            </div>
            {(paused || metrics.gameOver) && <div className={css.overlay}><strong>{metrics.gameOver ? t('game.over') : t('game.pause')}</strong><button type="button" onClick={metrics.gameOver ? restart : () => { setPaused(false) }}>{metrics.gameOver ? t('game.restart') : t('game.resume')}</button></div>}
          </div>
          <section className={css.inventory}>
            <div><span className={css.eyebrow}>{t('game.inventory')}</span><b>{weapons.length}</b></div>
            <button type="button" disabled={available === undefined || live.pending} onClick={() => { void consume() }} aria-label={t('game.useWeapon')}>
              <img src={capsuleUrl} alt="" />
              <span>{available === undefined ? t('game.noWeapon') : `${t('game.useWeapon')} · ${available.shieldDamage}`}</span>
              <kbd>{t('game.spaceKey')}</kbd>
            </button>
          </section>
          {live.error !== null && <p className={css.error} role="alert">{live.error}</p>}
          <footer><span>{t('game.controls')}</span><small>{t('game.localOnly')}</small></footer>
        </>}
      </div>
    </aside>
  )
}
