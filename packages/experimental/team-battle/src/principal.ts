/** Process-local authenticated identity; JSON callers cannot supply this symbol. */
import type { TeamBattleActorRequest, TeamBattleMemberId } from './types.ts'
/** Identity installed only after membership credential verification. */
export const authenticatedMember = Symbol('team-battle-authenticated-member')
/** Internal request carrying a verified principal. */
export interface InternalActorRequest extends TeamBattleActorRequest {
  readonly [authenticatedMember]?: TeamBattleMemberId
}
