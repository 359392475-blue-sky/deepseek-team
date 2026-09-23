/** Bearer-authenticated Query ingress and published-file delivery dispatch. */

import { createHash, timingSafeEqual } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type { CredentialRef } from '@deepseek-ai/dsh-credentials'
import {
  TeamBattleError,
  teamBattleIngressEventSchema,
  teamBattlePullDeliverySchema,
  teamBattleAcknowledgeDeliverySchema,
} from '@deepseek-ai/dsh-experimental-team-battle'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { readBoundedUtf8Body, TeamBattleHttpError } from './body.ts'

/** Handler values validated once at plugin load. */
export interface TeamBattleConnectorHandlerConfig {
  readonly secretEnv: CredentialRef
  readonly maxBodyBytes: number
  /** Query ingress by default; delivery operations use dedicated exact routes. */
  readonly operation?: 'query' | 'pull' | 'acknowledge'
}

function isJsonContentType(value: string | undefined): boolean {
  if (value === undefined) return false
  const parts = value.split(';').map(part => part.trim())
  const [mediaType, parameter, ...extra] = parts
  if (mediaType?.toLowerCase() !== 'application/json') return false
  if (parameter === undefined) return true
  return extra.length === 0 && /^charset=(?:utf-8|"utf-8")$/i.test(parameter)
}

function presentedBearer(request: Parameters<WebRoute['handler']>[0]): string {
  const values = request.headersDistinct.authorization
  const value = values?.[0]
  if (values?.length !== 1 || value === undefined) {
    throw new TeamBattleHttpError(401, 'invalid bearer token')
  }
  const match = /^Bearer ([A-Za-z0-9\-._~+/]+=*)$/.exec(value)
  if (match?.[1] === undefined) throw new TeamBattleHttpError(401, 'invalid bearer token')
  return match[1]
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest()
}

function bearerMatches(presented: string, expected: string): boolean {
  return timingSafeEqual(digest(presented), digest(expected))
}

function parseBody(body: string): unknown {
  let decoded: unknown
  try {
    decoded = JSON.parse(body)
  } catch {
    // JSON.parse is the only statement in the try; request content is never reflected.
    throw new TeamBattleHttpError(400, 'request body is not valid JSON')
  }
  return decoded
}

function parseEvent(decoded: unknown) {
  const parsed = teamBattleIngressEventSchema.safeParse(decoded)
  if (!parsed.success) {
    throw new TeamBattleHttpError(400, 'request body is not a valid Team Battle query event')
  }
  return parsed.data
}

function respondJson(
  response: Parameters<WebRoute['handler']>[1],
  status: number,
  value: unknown,
): void {
  const body = JSON.stringify(value)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(Buffer.byteLength(body)),
  })
  response.end(body)
}

function respondText(response: Parameters<WebRoute['handler']>[1], status: number, message: string): void {
  response.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' })
  response.end(message)
}

function mapDomainError(error: TeamBattleError): TeamBattleHttpError {
  switch (error.code) {
    case 'TEAM_BATTLE_NOT_FOUND':
    case 'TEAM_BATTLE_CONFLICT':
    case 'TEAM_BATTLE_REJECTED':
    case 'TEAM_BATTLE_ACCESS_DENIED':
      return new TeamBattleHttpError(400, 'Team Battle request was rejected')
    case 'TEAM_BATTLE_CONFIG_INVALID':
    case 'TEAM_BATTLE_CAPACITY':
    case 'TEAM_BATTLE_CORRUPT':
      return new TeamBattleHttpError(503, 'Team Battle ingress is unavailable')
    default:
      return assertNever(error.code)
  }
}

function assertNever(value: never): never {
  throw new Error(`unknown Team Battle error code: ${String(value)}`)
}

/**
 * Create one Bearer-authenticated, exact-route Team Battle handler.
 * @param ctx - connector context carrying credentials and the Team Battle service.
 * @param config - credential reference and raw body ceiling.
 * @returns an HTTP handler that reads queued bytes or commits a mutation before responding.
 */
export function createTeamBattleConnectorHandler(
  ctx: Context,
  config: TeamBattleConnectorHandlerConfig,
): WebRoute['handler'] {
  return async (request, response) => {
    try {
      if (request.method !== 'POST') {
        response.setHeader('allow', 'POST')
        throw new TeamBattleHttpError(405, 'method not allowed')
      }
      if (!isJsonContentType(request.headers['content-type'])) {
        throw new TeamBattleHttpError(415, 'content type must be application/json')
      }
      const credential = await ctx.credentials.resolve(config.secretEnv)
      if (credential === undefined || credential.value === '') {
        throw new TeamBattleHttpError(503, 'Team Battle connector secret is unavailable')
      }
      if (!bearerMatches(presentedBearer(request), credential.value)) {
        throw new TeamBattleHttpError(401, 'invalid bearer token')
      }
      const body = await readBoundedUtf8Body(request, config.maxBodyBytes)
      const decoded = parseBody(body)
      const operation = config.operation ?? 'query'
      switch (operation) {
        case 'query': {
          const receipt = await ctx.teamBattle.ingest(parseEvent(decoded))
          respondJson(response, receipt.duplicate ? 200 : 202, receipt)
          break
        }
        case 'pull': {
          const parsed = teamBattlePullDeliverySchema.safeParse(decoded)
          if (!parsed.success) throw new TeamBattleHttpError(400, 'invalid delivery pull request')
          respondJson(response, 200, ctx.teamBattle.pullDelivery(parsed.data))
          break
        }
        case 'acknowledge': {
          const parsed = teamBattleAcknowledgeDeliverySchema.safeParse(decoded)
          if (!parsed.success) throw new TeamBattleHttpError(400, 'invalid delivery acknowledgement')
          respondJson(response, 200, await ctx.teamBattle.acknowledgeDelivery(parsed.data))
          break
        }
        default:
          assertNever(operation)
      }
    } catch (caught: unknown) {
      const error = caught instanceof TeamBattleError ? mapDomainError(caught) : caught
      if (error instanceof TeamBattleHttpError) {
        respondText(response, error.status, error.message)
        return
      }
      ctx.logger.warn('team-battle-connector-http: request failed')
      respondText(response, 503, 'Team Battle ingress is unavailable')
    }
  }
}
