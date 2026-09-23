/** Live shared-file metadata, independent of project workflow revisions. */

import type { TeamBattleSpaceView } from '@deepseek-ai/dsh-experimental-team-battle/client'
import type { TeamBattleInjected } from './actions.ts'
import { useLiveProjection, type LiveProjectionState } from './useLiveProjection.ts'

/**
 * Poll the shared-file projection and contain Remote mutation failures.
 * @param actions - file operations injected by the browser plugin.
 * @param identity - mounted member or Session identity.
 * @returns shared-file projection and serialized mutation helpers.
 */
export function useTeamSpaceLive(actions: TeamBattleInjected, identity: string): LiveProjectionState<TeamBattleSpaceView> {
  return useLiveProjection(actions.space, identity)
}
