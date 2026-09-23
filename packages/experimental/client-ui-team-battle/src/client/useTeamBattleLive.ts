/** Shared live-projection state for Team Battle browser surfaces. */

import { useEffect } from 'react'
import type { TeamBattleView } from '@deepseek-ai/dsh-experimental-team-battle/client'
import { useLiveProjection, type LiveProjectionState } from './useLiveProjection.ts'
import type { TeamBattleInjected } from './actions.ts'
import { failureText } from './actions.ts'

const HEARTBEAT_INTERVAL_MS = 15_000

/** Live Team view state and latest-wins mutation helpers. */
export type TeamBattleLiveState = LiveProjectionState<TeamBattleView>

/**
 * Poll the authoritative Team projection and suppress stale overlapping responses.
 * @param actions - generated Remote calls injected by the browser plugin.
 * @param identity - mounted Session identity used only to reset browser-local state.
 * @returns current projection plus refresh and mutation helpers.
 */
export function useTeamBattleLive(actions: TeamBattleInjected, identity: string): TeamBattleLiveState {
  const { heartbeat, load } = actions
  const live = useLiveProjection(load, identity)
  const { reportError } = live
  useEffect(() => {
    let active = true
    const reportPresence = async (): Promise<void> => {
      try {
        const result = await heartbeat({ status: document.hidden ? 'idle' : 'online' })
        if (active && !result.ok) reportError(failureText(result.error))
      } catch (cause) {
        if (active) reportError(cause instanceof Error ? cause.message : String(cause))
      }
    }
    void reportPresence()
    const timer = window.setInterval(() => { void reportPresence() }, HEARTBEAT_INTERVAL_MS)
    return () => { active = false; window.clearInterval(timer) }
  }, [heartbeat, identity, reportError])
  return live
}
