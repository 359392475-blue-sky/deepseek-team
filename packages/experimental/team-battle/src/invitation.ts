/** Copyable Team links keep invitation credentials in fragments; legacy app links remain readable. */

import { TeamBattleError } from './error.ts'
import { normalizeTeamServerUrl } from './network-url.ts'
import { TeamBattleProjectId } from './types.ts'

/** Parsed invitation fields, admitted before any credential is generated or sent. */
export interface TeamInvitation {
  readonly server: string
  readonly teamId: TeamBattleProjectId
  readonly token: string
}

function reject(): never {
  throw new TeamBattleError('invalid team invitation link', 'TEAM_BATTLE_REJECTED')
}

function fields(params: URLSearchParams, allowed: readonly string[]): void {
  if ([...params.keys()].some(key => !allowed.includes(key))
    || allowed.some(key => params.getAll(key).length !== 1)) reject()
}

/**
 * Parse an HTTPS/private-HTTP fragment link or a previously issued dsh-team link.
 * @param input - copied invitation; query tokens are allowed only for the legacy app scheme.
 * @returns canonical server address and validated identity/token.
 */
export function parseTeamInvitation(input: string): TeamInvitation {
  const text = input.trim()
  let url: URL
  try { url = new URL(text) } catch { reject() }
  let server: string
  let params: URLSearchParams
  if (url.protocol === 'dsh-team:') {
    if (url.hostname !== 'join' || url.pathname !== '' || url.username !== '' || url.password !== '' || url.hash !== '') reject()
    params = url.searchParams
    fields(params, ['server', 'team', 'token'])
    server = normalizeTeamServerUrl(params.get('server') ?? '')
  } else {
    if (url.search !== '' || url.hash === '') reject()
    server = normalizeTeamServerUrl(text.slice(0, text.indexOf('#')))
    params = new URLSearchParams(url.hash.slice(1))
    fields(params, ['team', 'token'])
  }
  const teamId = params.get('team') ?? ''
  const token = params.get('token') ?? ''
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(teamId) || !/^[A-Za-z0-9_-]{43,128}$/.test(token)) reject()
  return { server, teamId: TeamBattleProjectId(teamId), token }
}

/**
 * Render an invitation without a credential-bearing HTTP request URL.
 * @param invitation - server address and member-bound invitation fields.
 * @returns copyable link for the local join form.
 */
export function teamInvitationLink(invitation: TeamInvitation): string {
  const url = new URL(`${normalizeTeamServerUrl(invitation.server)}/`)
  url.hash = new URLSearchParams({ team: invitation.teamId, token: invitation.token }).toString()
  return url.href
}
