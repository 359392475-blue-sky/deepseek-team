/** Exact-route HTTP ingress for content-free Team Battle Query events. */

import type { Context } from '@deepseek-ai/cordis'
import { createHash, timingSafeEqual } from 'node:crypto'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-experimental-team-battle'
import type {} from '@deepseek-ai/dsh-host-webserver'
import z from '@deepseek-ai/schemastery'
import { createTeamBattleConnectorHandler } from './handler.ts'
import { TeamBattleHttpError } from './body.ts'
import { TeamNetwork } from './network.ts'
import { validateTeamBindHost } from './network-url.ts'

export { createTeamBattleConnectorHandler } from './handler.ts'
export type { TeamBattleConnectorHandlerConfig } from './handler.ts'
export { TeamNetwork } from './network.ts'
export { normalizeTeamServerUrl } from './network-url.ts'

/** Cordis function-plugin name. */
export const name = 'team-battle-connector-http'
/** Services required before the exact route can register. */
export const inject = ['webServer', 'credentials', 'teamBattle']

/** Required HTTP connector configuration. */
export interface Config {
  /** Exact absolute route path. */
  readonly path: string
  /** Credential reference containing the shared Bearer token. */
  readonly secretEnv: string
  /** Positive raw body ceiling in bytes. */
  readonly maxBodyBytes: number
  /** Maximum encoded body for the isolated Team listener and outbound proxy. @default 8388608 */
  readonly maxNetworkBodyBytes?: number
  /** Maximum duration of a Team network request in milliseconds. @default 15000 */
  readonly networkRequestTimeoutMs?: number
  /** Explicit dedicated-server startup; omission keeps hosting off until a local command. */
  readonly hostedServer?: {
    /** Private bind address, usually 127.0.0.1 behind HTTPS reverse proxying. */
    readonly host: string
    /** Dedicated Team port, independent of the private application WebServer. */
    readonly port: number
    /** Deployment credential required to create a project through /create. */
    readonly accessTokenRef: string
  } | undefined
}

/** Schemastery configuration parsed by Cordis before activation. */
export const Config: z<Config> = z.object({
  path: z.string().required(),
  secretEnv: z.string().role('credential-ref').required(),
  maxBodyBytes: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).required(),
  maxNetworkBodyBytes: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(8 * 1024 * 1024),
  networkRequestTimeoutMs: z.number().step(1).min(1).max(2_147_483_647).default(15_000),
  hostedServer: z.union([z.object({
    host: z.string().required(),
    port: z.natural().max(65535).required(),
    accessTokenRef: z.string().role('credential-ref').required(),
  }), z.const(undefined)]),
})

function assertPath(path: string): void {
  if (!path.startsWith('/') || path === '/' || path.endsWith('/')
    || path.includes('?') || path.includes('#')) {
    throw new Error(
      'team-battle-connector-http path must be an absolute non-root pathname '
      + 'without a trailing slash, query, or fragment',
    )
  }
}

/**
 * Register one authenticated Team Battle endpoint.
 * @param ctx - host context carrying WebServer, credentials, and Team Battle.
 * @param config - exact route, credential reference, and body ceiling.
 * @returns after optional dedicated hosting has bound its configured port.
 */
export async function apply(ctx: Context, config: Config): Promise<void> {
  assertPath(config.path)
  const maxBodyBytes = config.maxNetworkBodyBytes ?? 8 * 1024 * 1024
  const requestTimeoutMs = config.networkRequestTimeoutMs ?? 15_000
  const hosted = config.hostedServer
  if (hosted !== undefined) validateTeamBindHost(hosted.host)
  const creationRef = hosted === undefined ? undefined : credentialRef(hosted.accessTokenRef)
  await ctx.effect(async () => {
    const network = new TeamNetwork(ctx.teamBattle, { maxBodyBytes, requestTimeoutMs }, async (token) => {
      if (creationRef === undefined) return false
      const secret = await ctx.credentials.resolve(creationRef)
      if (secret === undefined || secret.value === '') {
        throw new TeamBattleHttpError(503, 'Team server creation credential is unavailable')
      }
      return timingSafeEqual(createHash('sha256').update(token).digest(), createHash('sha256').update(secret.value).digest())
    })
    const unregister = ctx.teamBattle.registerNetworkTransport(network)
    try {
      if (hosted !== undefined) {
        const status = await network.start(hosted)
        console.log(`Team collaboration listener: ${status.origins.join(', ')}`)
      }
    } catch (error) {
      unregister()
      await network.dispose()
      throw error
    }
    return async () => {
      unregister()
      await network.dispose()
    }
  }, 'team-battle-connector-http: isolated Team network')
  const endpoints = [
    { path: config.path, operation: 'query' as const },
    { path: `${config.path}/deliveries/pull`, operation: 'pull' as const },
    { path: `${config.path}/deliveries/ack`, operation: 'acknowledge' as const },
  ]
  for (const endpoint of endpoints) {
    ctx.effect(() => ctx.webServer.register({
      kind: 'exact',
      path: endpoint.path,
      handler: createTeamBattleConnectorHandler(ctx, {
        secretEnv: credentialRef(config.secretEnv),
        maxBodyBytes: config.maxBodyBytes,
        operation: endpoint.operation,
      }),
    }), `team-battle-connector-http: ${endpoint.path}`)
  }
}
