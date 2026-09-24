/** Live shared-file metadata, independent of project workflow revisions. */

import { useCallback } from 'react'
import type { RemoteFailure } from '@deepseek-ai/dsh-api-remotes/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { TeamBattleSpaceView } from '@deepseek-ai/dsh-experimental-team-battle/client'
import { failureText, type TeamBattleInjected } from './actions.ts'
import type { NS } from './locales.ts'
import { useLiveProjection, type LiveProjectionState } from './useLiveProjection.ts'

/**
 * Poll the shared-file projection and contain Remote mutation failures.
 * @param actions - file operations injected by the browser plugin.
 * @param identity - mounted member or Session identity.
 * @param t - localized recovery instructions for shared-file errors.
 * @returns shared-file projection and serialized mutation helpers.
 */
export function useTeamSpaceLive(actions: TeamBattleInjected, identity: string, t: PropsLocale<typeof NS>['t']): LiveProjectionState<TeamBattleSpaceView> {
  const formatFailure = useCallback((error: RemoteFailure): string => error.code === 'team-battle/name-conflict' ? t('files.nameConflict') : failureText(error), [t])
  return useLiveProjection(actions.space, identity, formatFailure)
}
