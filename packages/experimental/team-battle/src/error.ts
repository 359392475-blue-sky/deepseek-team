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

/** A sibling already has this file or folder name; published bytes remain unchanged. */
export class TeamBattleNameConflictError extends RemoteError<'team-battle/name-conflict'> {
  constructor() {
    super('team-battle/name-conflict',
      'An item with this name already exists in the folder. Choose another name or create a version folder before publishing.',
      { httpStatus: 409 })
  }
}

/** Creation authorization failed; diagnostics contain no credentials or server response content. */
export class TeamBattleServerAuthError extends RemoteError<'team-battle/server-auth-required'> {
  constructor() {
    super('team-battle/server-auth-required',
      'Team project creation is unavailable. Ask the administrator to restore the configured Team service connection.',
      { httpStatus: 401 })
  }
}
