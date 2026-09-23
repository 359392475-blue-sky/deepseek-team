/** Stable Team Battle business failures and actionable browser Remote failures. */

import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'

/** Failure codes returned by direct service calls and mapped by the Gateway. */
export type TeamBattleErrorCode =
  | 'TEAM_BATTLE_CONFIG_INVALID'
  | 'TEAM_BATTLE_CAPACITY'
  | 'TEAM_BATTLE_NOT_FOUND'
  | 'TEAM_BATTLE_CONFLICT'
  | 'TEAM_BATTLE_REJECTED'
  | 'TEAM_BATTLE_ACCESS_DENIED'
  | 'TEAM_BATTLE_CORRUPT'

/** Expected Team Battle domain rejection. */
export class TeamBattleError extends Error {
  override readonly name = 'TeamBattleError'

  /**
   * @param message - safe business failure detail.
   * @param code - stable machine-readable failure code.
   */
  constructor(message: string, readonly code: TeamBattleErrorCode) {
    super(message)
  }
}

/** Creation authorization failed; diagnostics contain no credentials or server response content. */
export class TeamBattleServerAuthError extends RemoteError<'team-battle/server-auth-required'> {
  constructor() {
    super('team-battle/server-auth-required',
      'Team server refused project creation. Check the server address and ask its administrator for the current creation code.',
      { httpStatus: 401 })
  }
}
