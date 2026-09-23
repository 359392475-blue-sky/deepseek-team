/** Request-local simulation identity; no service or browser-global identity is changed. */

import type { TeamBattleMemberId, TeamBattleProjectId } from '@deepseek-ai/dsh-experimental-team-battle/client'
import type { TeamBattleInjected } from './actions.ts'

/**
 * Bind browser actions to one explicitly selected simulation member.
 * @param actions - unchanged authenticated Remote methods.
 * @param actingMemberId - selected member, absent for the configured identity.
 * @param teamId - selected real space, absent for the original local project.
 * @returns methods that carry the member on every request.
 */
export function scopeTeamBattleActions(
  actions: TeamBattleInjected, actingMemberId: TeamBattleMemberId | undefined, teamId?: TeamBattleProjectId,
): TeamBattleInjected {
  if (actingMemberId === undefined && teamId === undefined) return actions
  const actor = {
    ...(actingMemberId === undefined ? {} : { actingMemberId }),
    ...(teamId === undefined ? {} : { teamId }),
  }
  return {
    load: () => actions.load(actor),
    space: () => actions.space(actor),
    createTask: input => actions.createTask({ ...input, ...actor }),
    updateTask: input => actions.updateTask({ ...input, ...actor }),
    publishContext: input => actions.publishContext({ ...input, ...actor }),
    publishArtifact: input => actions.publishArtifact({ ...input, ...actor }),
    reviewArtifact: input => actions.reviewArtifact({ ...input, ...actor }),
    consumeWeapon: input => actions.consumeWeapon({ ...input, ...actor }),
    heartbeat: input => actions.heartbeat({ ...input, ...actor }),
    createFolder: input => actions.createFolder({ ...input, ...actor }),
    publishFile: input => actions.publishFile({ ...input, ...actor }),
    updateSpaceItem: input => actions.updateSpaceItem({ ...input, ...actor }),
    readFile: input => actions.readFile({ ...input, ...actor }),
    sendFile: input => actions.sendFile({ ...input, ...actor }),
    submitFile: input => actions.submitFile({ ...input, ...actor }),
  }
}
