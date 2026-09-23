/** Browser entry binding the generated Team Battle Remote artifact to its Client UI. */

import teamBattleRemote from '@deepseek-ai/dsh-experimental-team-battle/remote'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { mountTeamBattleUi } from './mount.ts'

export { inject } from './mount.ts'
export type { TeamBattleInjected, TeamBattleResult } from './actions.ts'
export type { FlightGamePanelProps } from './FlightGamePanel.tsx'
export type { TeamSpaceViewProps } from './TeamSpaceView.tsx'
export type { TeamBattleKey } from './locales.ts'

/** Mount the generated Team Battle Remote contribution and both browser surfaces. */
export async function apply(ctx: ClientContext): Promise<() => Promise<void>> {
  return await mountTeamBattleUi(ctx, teamBattleRemote)
}
