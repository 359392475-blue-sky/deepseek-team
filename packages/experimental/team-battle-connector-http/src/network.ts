/** Isolated Team HTTP transport; private application routes never register on this listener. */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { networkInterfaces } from 'node:os'
import {
  TeamBattleError,
  TeamBattleNameConflictError,
  TeamBattleServerAuthError,
  TeamBattleProjectId,
  type TeamBattleHostingStatus,
  type TeamBattleNetworkTransport,
  type TeamBattleService,
} from '@deepseek-ai/dsh-experimental-team-battle'
import { readBoundedUtf8Body, TeamBattleHttpError } from './body.ts'
import { normalizeTeamServerUrl, validateTeamBindHost } from './network-url.ts'
import { renderTeamInvitationPage, teamInvitationPagePolicy } from './invitation-page.ts'

/** Independently configurable transfer limits for member-to-host operations. */
export interface TeamNetworkLimits {
  /** Maximum encoded request or response body in bytes. */
  readonly maxBodyBytes: number
  /** Maximum duration of each outbound request and inbound body transfer. */
  readonly requestTimeoutMs: number
}

type TeamNetworkDomain = Pick<TeamBattleService, 'acceptInvite' | 'dispatchAuthenticated' | 'createHostedTeam'>

function isNameConflict(value: unknown): boolean {
  return typeof value === 'object' && value !== null && 'code' in value
    && value.code === 'team-battle/name-conflict'
}

function jsonResponse(response: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(Buffer.byteLength(body)),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  response.end(body)
}

function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)
    || Object.keys(value).some(key => !keys.includes(key))) {
    throw new TeamBattleHttpError(400, 'invalid Team request fields')
  }
  return value as Record<string, unknown>
}

function textField(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TeamBattleHttpError(400, 'invalid Team request field')
  }
  return value
}

function bearer(request: IncomingMessage): string {
  const headers = request.headersDistinct.authorization
  if (headers?.length !== 1) throw new TeamBattleHttpError(401, 'member credential required')
  const token = /^Bearer ([A-Za-z0-9\-._~+/]+=*)$/.exec(headers[0] ?? '')?.[1]
  if (token === undefined) throw new TeamBattleHttpError(401, 'member credential required')
  return token
}

function decodeJson(body: string): unknown {
  try {
    return JSON.parse(body)
  } catch {
    // JSON.parse is the only operation in this try; request bodies may contain credentials.
    throw new TeamBattleHttpError(400, 'Team request is not valid JSON')
  }
}

function advertisedOrigins(host: string, port: number): string[] {
  const hosts = host === '0.0.0.0'
    ? Object.values(networkInterfaces()).flat()
      .filter((item): item is NonNullable<typeof item> => item !== undefined && item.family === 'IPv4' && !item.internal)
      .map(item => item.address)
    : [host]
  const origins = new Set<string>()
  for (const address of hosts) {
    try {
      const authority = address.includes(':') ? `[${address}]` : address
      origins.add(normalizeTeamServerUrl(`http://${authority}:${String(port)}`))
    } catch {
      // Only private interface addresses are invitation destinations; public interfaces are omitted.
    }
  }
  return [...origins]
}

/**
 * Team-only listener plus bounded outbound proxy owned by one connector activation.
 * No method retries a failed or interrupted domain operation.
 */
export class TeamNetwork implements TeamBattleNetworkTransport {
  private server: Server | undefined
  private hosting: TeamBattleHostingStatus = { running: false, origins: [] }
  private lifecycle: Promise<void> = Promise.resolve()
  private readonly inbound = new Set<Promise<void>>()
  private readonly outbound = new Map<AbortController, Promise<unknown>>()
  private disposed = false
  private readonly invitationPage: string

  /**
   * @param domain - authenticated Team operations without private application services.
   * @param limits - validated transfer and timeout limits.
   * @param authorizeCreation - deployment credential verifier; omission disables remote project creation.
   * @param invitationDownloadUrl - optional HTTPS page for obtaining a compatible Team client.
   */
  constructor(
    private readonly domain: TeamNetworkDomain,
    private readonly limits: TeamNetworkLimits,
    private readonly authorizeCreation?: (token: string) => Promise<boolean>,
    invitationDownloadUrl?: string,
  ) {
    this.invitationPage = renderTeamInvitationPage(invitationDownloadUrl)
  }

  /** @returns current listener addresses without member credentials. */
  status(): TeamBattleHostingStatus {
    return { ...this.hosting, origins: [...this.hosting.origins] }
  }

  /**
   * Open only the Team listener; a concurrent start waits for the previous lifecycle operation.
   * @param request - explicit bind address and port; zero selects an available port.
   * @returns actual bound port and shareable private interface addresses.
   */
  start(request: { readonly host: string; readonly port: number }): Promise<TeamBattleHostingStatus> {
    return this.serialize(async () => {
      if (this.disposed) throw new Error('Team network is closed')
      const host = validateTeamBindHost(request.host)
      if (!Number.isInteger(request.port) || request.port < 0 || request.port > 65535) {
        throw new Error('Team listener port must be an integer from 0 to 65535')
      }
      if (this.server !== undefined) return this.status()
      const server = createServer((incoming, response) => {
        const operation = this.handle(incoming, response)
        this.inbound.add(operation)
        void operation.then(
          () => { this.inbound.delete(operation) },
          () => { this.inbound.delete(operation) },
        )
      })
      server.requestTimeout = this.limits.requestTimeoutMs
      server.headersTimeout = this.limits.requestTimeoutMs
      try {
        await new Promise<void>((resolve, reject) => {
          const fail = (error: Error): void => { reject(error) }
          server.once('error', fail)
          server.listen(request.port, host, () => {
            server.removeListener('error', fail)
            resolve()
          })
        })
      } catch (error) {
        server.close()
        throw error
      }
      const address = server.address()
      if (address === null || typeof address === 'string') {
        await new Promise<void>((resolve) => { server.close(() => { resolve() }) })
        throw new Error('Team listener did not bind a TCP address')
      }
      this.server = server
      this.hosting = { running: true, host, port: address.port, origins: advertisedOrigins(host, address.port) }
      return this.status()
    })
  }

  /** Stop accepting requests and wait for already admitted domain operations. */
  stop(): Promise<void> {
    return this.serialize(async () => {
      const server = this.server
      this.server = undefined
      this.hosting = { running: false, origins: [] }
      if (server === undefined) return
      const closed = new Promise<void>((resolve) => { server.close(() => { resolve() }) })
      server.closeAllConnections()
      await Promise.allSettled([...this.inbound])
      await closed
    })
  }

  /**
   * Send one Team operation to an explicit server; redirects and automatic retries are disabled.
   * @param request - server origin, exact operation, body, and optional member credential.
   * @returns parsed JSON for validation by the Team domain owner.
   */
  request(request: Parameters<TeamBattleNetworkTransport['request']>[0]): Promise<unknown> {
    if (this.disposed) return Promise.reject(new Error('Team network is closed'))
    const controller = new AbortController()
    const operation = this.send(request, controller)
    this.outbound.set(controller, operation)
    void operation.then(
      () => { this.outbound.delete(controller) },
      () => { this.outbound.delete(controller) },
    )
    return operation
  }

  /** Abort pending network transfers and wait until the listener and transfers have stopped. */
  async dispose(): Promise<void> {
    this.disposed = true
    for (const controller of this.outbound.keys()) controller.abort()
    await this.stop()
    await Promise.allSettled([...this.outbound.values()])
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.lifecycle.then(operation)
    this.lifecycle = result.then(() => {}, () => {})
    return result
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      if (request.url === '/' && (request.method === 'GET' || request.method === 'HEAD')) {
        response.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          'content-length': String(Buffer.byteLength(this.invitationPage)),
          'cache-control': 'no-store',
          'content-security-policy': teamInvitationPagePolicy,
          'referrer-policy': 'no-referrer',
          'x-content-type-options': 'nosniff',
        })
        response.end(request.method === 'HEAD' ? undefined : this.invitationPage)
        return
      }
      if (request.url !== '/create' && request.url !== '/join' && request.url !== '/call') {
        jsonResponse(response, 404, { error: 'not found' })
        return
      }
      if (request.method !== 'POST') {
        response.setHeader('allow', 'POST')
        throw new TeamBattleHttpError(405, 'method not allowed')
      }
      if (request.headers.origin !== undefined) {
        jsonResponse(response, 403, { error: 'Team requests must come from a local DeepSeek host' })
        return
      }
      if (!/^application\/json(?:\s*;\s*charset=(?:utf-8|"utf-8"))?$/i.test(request.headers['content-type'] ?? '')) {
        throw new TeamBattleHttpError(415, 'content type must be application/json')
      }
      const memberToken = request.url === '/call' || request.url === '/create' ? bearer(request) : undefined
      if (request.url === '/create'
        && (this.authorizeCreation === undefined || !await this.authorizeCreation(textField(memberToken)))) {
        throw new TeamBattleHttpError(401, 'server creation credential required')
      }
      const value = decodeJson(await readBoundedUtf8Body(request, this.limits.maxBodyBytes))
      let result: unknown
      if (request.url === '/create') {
        const body = record(value, ['name', 'goal', 'memberName', 'memberRole', 'ownerMemberToken'])
        result = await this.domain.createHostedTeam({
          name: textField(body.name),
          goal: textField(body.goal),
          memberName: textField(body.memberName),
          memberRole: textField(body.memberRole),
          ownerMemberToken: textField(body.ownerMemberToken),
        })
      } else if (request.url === '/join') {
        const body = record(value, ['teamId', 'inviteToken', 'memberToken'])
        result = await this.domain.acceptInvite({
          teamId: TeamBattleProjectId(textField(body.teamId)),
          inviteToken: textField(body.inviteToken),
          memberToken: textField(body.memberToken),
        })
      } else {
        const body = record(value, ['teamId', 'method', 'input'])
        result = await this.domain.dispatchAuthenticated({
          teamId: TeamBattleProjectId(textField(body.teamId)),
          memberToken: textField(memberToken),
          method: textField(body.method),
          input: body.input,
        })
      }
      const encoded = JSON.stringify(result)
      if (Buffer.byteLength(encoded) > this.limits.maxBodyBytes) {
        throw new TeamBattleHttpError(503, 'Team response exceeds the configured transfer limit')
      }
      jsonResponse(response, 200, result)
    } catch (error) {
      if (response.destroyed || response.writableEnded) return
      if (error instanceof TeamBattleHttpError) {
        jsonResponse(response, error.status, { error: error.message })
      } else if (isNameConflict(error)) {
        jsonResponse(response, 409, { error: 'Team file-space name conflict', code: 'team-battle/name-conflict' })
      } else if (error instanceof TeamBattleError) {
        jsonResponse(response, 403, { error: 'Team request rejected', code: error.code })
      } else {
        jsonResponse(response, 503, { error: 'Team service is unavailable' })
      }
    }
  }

  private async send(
    request: Parameters<TeamBattleNetworkTransport['request']>[0],
    controller: AbortController,
  ): Promise<unknown> {
    const origin = normalizeTeamServerUrl(request.origin)
    const body = JSON.stringify(request.body)
    if (Buffer.byteLength(body) > this.limits.maxBodyBytes) {
      throw new Error('Team request exceeds the configured transfer limit')
    }
    const timeout = setTimeout(() => { controller.abort() }, this.limits.requestTimeoutMs)
    try {
      const response = await fetch(`${origin}/${request.path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(request.bearer === undefined ? {} : { authorization: `Bearer ${request.bearer}` }),
        },
        body,
        redirect: 'error',
        signal: controller.signal,
      })
      if (!response.ok && response.status !== 403 && response.status !== 409) {
        await response.body?.cancel()
        if (request.path === 'create' && response.status === 401) throw new TeamBattleServerAuthError()
        throw new Error(`Team server rejected the request (HTTP ${String(response.status)})`)
      }
      const reader = response.body?.getReader()
      if (reader === undefined) throw new Error('Team server returned an empty response')
      const chunks: Uint8Array[] = []
      let size = 0
      try {
        while (true) {
          const next = await reader.read()
          if (next.done) break
          size += next.value.byteLength
          if (size > this.limits.maxBodyBytes) throw new Error('Team response exceeds the configured transfer limit')
          chunks.push(next.value)
        }
      } finally {
        await reader.cancel()
      }
      const result = decodeJson(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, size)))
      if (!response.ok) {
        if (response.status === 409 && isNameConflict(result)) throw new TeamBattleNameConflictError()
        if (response.status === 403 && typeof result === 'object' && result !== null && 'code' in result
          && result.code === 'TEAM_BATTLE_ACCESS_DENIED') {
          throw new TeamBattleError('member credential is invalid, revoked, or expired', 'TEAM_BATTLE_ACCESS_DENIED')
        }
        throw new Error(`Team server rejected the request (HTTP ${String(response.status)})`)
      }
      return result
    } catch (error) {
      if (controller.signal.aborted) throw new Error('Team request was interrupted; check the team state before retrying')
      if (isNameConflict(error)) throw new TeamBattleNameConflictError()
      if (error instanceof TeamBattleServerAuthError) throw error
      if (error instanceof TeamBattleError && error.code === 'TEAM_BATTLE_ACCESS_DENIED') throw error
      if (error instanceof Error && /^Team (server|request|response)/.test(error.message)) throw error
      throw new Error('Unable to reach the Team server; check its address and hosting status')
    } finally {
      clearTimeout(timeout)
    }
  }
}
