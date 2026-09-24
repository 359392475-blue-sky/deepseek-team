import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { TeamBattleError, TeamBattleWeaponId, type TeamBattleIngressEvent } from '@deepseek-ai/dsh-experimental-team-battle'
import { createTeamBattleConnectorHandler, type TeamBattleConnectorHandlerConfig } from '../src/handler.ts'
import { apply } from '../src/index.ts'

const servers: Server[] = []
const contexts: Context[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve) => {
    server.close(() => { resolve() })
  })))
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
})

function fakeContext(...secrets: [] | [string | undefined]) {
  const secret = secrets.length === 0 ? 'fixture-token' : secrets[0]
  const receipts = new Map<string, ReturnType<typeof TeamBattleWeaponId>>()
  const ingest = vi.fn(async (event: TeamBattleIngressEvent) => {
    const existing = receipts.get(event.eventId)
    if (existing !== undefined) return { eventId: event.eventId, duplicate: true, weaponId: existing }
    const weaponId = TeamBattleWeaponId(`weapon-${String(receipts.size + 1)}`)
    receipts.set(event.eventId, weaponId)
    return { eventId: event.eventId, duplicate: false, weaponId }
  })
  const ctx = new Context()
  contexts.push(ctx)
  Object.defineProperties(ctx, {
    credentials: { value: {
      resolve: async () => secret === undefined ? undefined : { value: secret, source: 'test' },
    } satisfies Pick<Context['credentials'], 'resolve'> },
    teamBattle: { value: { ingest } satisfies Pick<Context['teamBattle'], 'ingest'> },
    logger: { value: { warn: vi.fn() } satisfies Pick<Context['logger'], 'warn'> },
  })
  return {
    ctx,
    ingest,
  }
}

async function serve(ctx: Context, maxBodyBytes = 1024, operation: TeamBattleConnectorHandlerConfig['operation'] = 'query'): Promise<string> {
  const handler = createTeamBattleConnectorHandler(ctx, {
    secretEnv: credentialRef('TEAM_BATTLE_CODEX_TOKEN'),
    maxBodyBytes,
    operation,
  })
  const server = createServer((request, response) => { void handler(request, response) })
  servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`
}

function eventBody(extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    version: 1,
    type: 'query',
    eventId: 'codex:1:s:t',
    memberId: 'engineering',
    occurredAt: 1,
    ...extra,
  })
}

function post(url: string, body: string, token = 'fixture-token'): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: {
      'authorization': `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body,
  })
}

describe('Team Battle HTTP connector', () => {
  it('authenticates and returns stable new then duplicate receipts', async () => {
    const fake = fakeContext()
    const url = await serve(fake.ctx)
    const first = await post(url, eventBody())
    const duplicate = await post(url, eventBody())
    expect(first.status).toBe(202)
    expect(duplicate.status).toBe(200)
    expect(await first.json()).toEqual({
      eventId: 'codex:1:s:t', duplicate: false, weaponId: 'weapon-1',
    })
    expect(await duplicate.json()).toEqual({
      eventId: 'codex:1:s:t', duplicate: true, weaponId: 'weapon-1',
    })
    expect(fake.ingest).toHaveBeenCalledTimes(2)
  })

  it('rejects invalid auth, missing credentials, and oversized bodies before ingest', async () => {
    const fake = fakeContext()
    const url = await serve(fake.ctx, 32)
    expect((await post(url, eventBody(), 'wrong')).status).toBe(401)
    expect((await post(url, eventBody())).status).toBe(413)
    expect(fake.ingest).not.toHaveBeenCalled()

    const missing = fakeContext(undefined)
    const missingUrl = await serve(missing.ctx)
    expect((await post(missingUrl, eventBody())).status).toBe(503)
    expect(missing.ingest).not.toHaveBeenCalled()
  })

  it('strictly rejects a Query body containing prompt text', async () => {
    const fake = fakeContext()
    const url = await serve(fake.ctx)
    const response = await post(url, eventBody({ prompt: 'must not cross ingress' }))
    expect(response.status).toBe(400)
    expect(await response.text()).not.toContain('must not cross ingress')
    expect(fake.ingest).not.toHaveBeenCalled()
  })
})


describe('authenticated file delivery routes', () => {
  it('rejects unauthenticated pulls and returns bytes without acknowledging them', async () => {
    const fake = fakeContext()
    const pullDelivery = vi.fn(() => ({ delivery: { id: 'delivery-1', status: 'queued' }, content: { contentBase64: 'aGk=' } }))
    Object.assign(fake.ctx.teamBattle, { pullDelivery })
    const url = await serve(fake.ctx, 1024, 'pull')
    expect((await post(url, JSON.stringify({ memberId: 'product' }), 'wrong')).status).toBe(401)
    expect(pullDelivery).not.toHaveBeenCalled()
    expect((await post(url, JSON.stringify({ memberId: 'product', prompt: 'private' }))).status).toBe(400)
    expect(pullDelivery).not.toHaveBeenCalled()
    const response = await post(url, JSON.stringify({ memberId: 'product' }))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ delivery: { status: 'queued' }, content: { contentBase64: 'aGk=' } })
    expect(pullDelivery).toHaveBeenCalledWith({ memberId: 'product' })
    expect(fake.ingest).not.toHaveBeenCalled()
  })

  it('accepts terminal acknowledgements only after service persistence and maps member rejection', async () => {
    const fake = fakeContext()
    const acknowledgeDelivery = vi.fn(async (request: { memberId: string; outcome: string }) => {
      if (request.memberId !== 'product') throw new TeamBattleError('wrong member', 'TEAM_BATTLE_REJECTED')
      return { id: 'delivery-1', status: request.outcome, acknowledgedAt: 100 }
    })
    Object.assign(fake.ctx.teamBattle, { acknowledgeDelivery })
    const url = await serve(fake.ctx, 1024, 'acknowledge')
    const body = { memberId: 'product', deliveryId: 'delivery-1', outcome: 'delivered' }
    expect((await post(url, JSON.stringify({ ...body, outcome: 'queued' }))).status).toBe(400)
    expect(acknowledgeDelivery).not.toHaveBeenCalled()
    expect((await post(url, JSON.stringify({ ...body, memberId: 'engineering' }))).status).toBe(400)
    const response = await post(url, JSON.stringify(body))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ status: 'delivered', acknowledgedAt: 100 })
    acknowledgeDelivery.mockRejectedValueOnce(new Error('storage unavailable'))
    expect((await post(url, JSON.stringify(body))).status).toBe(503)
  })

  it('registers all delivery routes as exact, disposable routes under the configured path', async () => {
    const dispose = vi.fn()
    const register = vi.fn<Context['webServer']['register']>(() => dispose)
    const unregisterNetwork = vi.fn()
    const ctx = new Context()
    contexts.push(ctx)
    Object.defineProperties(ctx, {
      webServer: { value: { register } satisfies Pick<Context['webServer'], 'register'> },
      teamBattle: { value: {
        registerNetworkTransport: vi.fn(() => unregisterNetwork),
      } satisfies Pick<Context['teamBattle'], 'registerNetworkTransport'> },
    })
    await apply(ctx, { path: '/connector', secretEnv: 'TEAM_BATTLE_TOKEN', maxBodyBytes: 1024 })
    expect(register.mock.calls.map(([route]) => ({ kind: route.kind, path: route.path }))).toEqual([
      { kind: 'exact', path: '/connector' },
      { kind: 'exact', path: '/connector/deliveries/pull' },
      { kind: 'exact', path: '/connector/deliveries/ack' },
    ])
    await ctx.fiber.dispose()
    expect(dispose).toHaveBeenCalledTimes(3)
    expect(unregisterNetwork).toHaveBeenCalledOnce()
  })
})
