import { createServer, type Server } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TeamBattleError, TeamBattleMemberId, TeamBattleProjectId, type TeamBattleTeamSummary, type TeamBattleService } from '@deepseek-ai/dsh-experimental-team-battle'
import { TeamNetwork } from '../src/network.ts'
import { normalizeTeamServerUrl } from '../src/network-url.ts'

const networks: TeamNetwork[] = []
const servers: Server[] = []
afterEach(async () => {
  await Promise.all(networks.splice(0).map(network => network.dispose()))
  await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve) => {
    server.close(() => { resolve() })
    server.closeAllConnections()
  })))
})

const summary: TeamBattleTeamSummary = {
  id: TeamBattleProjectId('project-a'), name: 'Shared project', goal: 'Deliver a page',
  mode: 'hosted', localMemberId: TeamBattleMemberId('member-a'), ownerMemberId: TeamBattleMemberId('member-a'),
  storageLocation: 'shared server', invites: [], memberAccess: [],
}

function fixture(maxBodyBytes = 4096) {
  const domain: Pick<TeamBattleService, 'acceptInvite' | 'dispatchAuthenticated' | 'createHostedTeam'> = {
    acceptInvite: vi.fn(async () => summary),
    dispatchAuthenticated: vi.fn(async () => ({ shared: true })),
    createHostedTeam: vi.fn(async () => summary),
  }
  const authorize = vi.fn(async (token: string) => token === 'deployment-token')
  const network = new TeamNetwork(domain, { maxBodyBytes, requestTimeoutMs: 2000 }, authorize)
  networks.push(network)
  return { domain, network, authorize }
}

async function serving(network: TeamNetwork): Promise<string> {
  const status = await network.start({ host: '127.0.0.1', port: 0 })
  const origin = status.origins[0]
  if (origin === undefined) throw new Error('fixture did not start')
  return origin
}

function post(origin: string, path: string, value: unknown, token?: string) {
  return fetch(`${origin}${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...(token === undefined ? {} : { authorization: `Bearer ${token}` }) },
    body: JSON.stringify(value),
  })
}

describe('Team-only network', () => {
  it('keeps hosting off until requested and never exposes private application routes', async () => {
    const { network, domain } = fixture()
    expect(network.status()).toEqual({ running: false, origins: [] })
    const origin = await serving(network)
    for (const path of ['/api', '/api/sessions/list', '/api/directoryPicker/list', '/api/terminal/create', '/call?private=1', '/join/']) {
      expect((await post(origin, path, {})).status).toBe(404)
    }
    expect(domain.dispatchAuthenticated).not.toHaveBeenCalled()
    await network.stop()
    expect(network.status()).toEqual({ running: false, origins: [] })
    await expect(fetch(`${origin}/call`)).rejects.toThrow()
  })

  it('requires the deployment code before creating a project and rejects forged fields', async () => {
    const { network, domain } = fixture()
    const origin = await serving(network)
    const body = { name: 'Shared project', goal: 'Deliver', memberName: 'Owner', memberRole: 'Product', ownerMemberToken: 'device-token' }
    expect((await post(origin, '/create', body)).status).toBe(401)
    expect((await post(origin, '/create', body, 'wrong')).status).toBe(401)
    expect(domain.createHostedTeam).not.toHaveBeenCalled()
    expect((await post(origin, '/create', { ...body, actingMemberId: 'other' }, 'deployment-token')).status).toBe(400)
    const response = await post(origin, '/create', body, 'deployment-token')
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ id: 'project-a' })
    expect(domain.createHostedTeam).toHaveBeenCalledWith(body)
  })

  it('returns actionable creation authorization failures and accepts a corrected code only on explicit retry', async () => {
    const { network, domain, authorize } = fixture()
    const origin = await serving(network)
    const body = { name: 'Shared project', goal: 'Deliver', memberName: 'Owner', memberRole: 'Product', ownerMemberToken: 'device-token' }
    await expect(network.request({ origin, path: 'create', body, bearer: 'invalid-code' })).rejects.toMatchObject({
      isDSHRemoteError: true, code: 'team-battle/server-auth-required', details: { httpStatus: 401 },
      message: 'Team server refused project creation. Check the server address and ask its administrator for the current creation code.',
    })
    expect(authorize).toHaveBeenCalledTimes(1)
    expect(domain.createHostedTeam).not.toHaveBeenCalled()
    expect(await network.request({ origin, path: 'create', body, bearer: 'deployment-token' })).toEqual(summary)
    expect(authorize).toHaveBeenCalledTimes(2)
    expect(domain.createHostedTeam).toHaveBeenCalledExactlyOnceWith(body)
  })

  it('hides unauthorized response content and does not classify member-route 401 as a creation failure', async () => {
    const { network } = fixture()
    const requests = vi.fn()
    const server = createServer((_request, response) => {
      requests()
      response.writeHead(401, { 'content-type': 'text/plain' }).end('PRIVATE_SERVER_DETAIL invalid-code')
    })
    servers.push(server)
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('fixture did not bind')
    const origin = `http://127.0.0.1:${String(address.port)}`
    await expect(network.request({ origin, path: 'create', body: {}, bearer: 'invalid-code' })).rejects.toMatchObject({
      code: 'team-battle/server-auth-required', details: { httpStatus: 401 },
      message: 'Team server refused project creation. Check the server address and ask its administrator for the current creation code.',
    })
    await expect(network.request({ origin, path: 'call', body: {}, bearer: 'invalid-code' })).rejects.toThrow(
      'Team server rejected the request (HTTP 401)',
    )
    expect(requests).toHaveBeenCalledTimes(2)
  })

  it('exchanges only invite credentials and delegates the authenticated member token separately', async () => {
    const { network, domain } = fixture()
    const origin = await serving(network)
    const join = { teamId: 'project-a', inviteToken: 'invitation', memberToken: 'device-token' }
    expect((await post(origin, '/join', { ...join, prompt: 'private conversation' })).status).toBe(400)
    expect(domain.acceptInvite).not.toHaveBeenCalled()
    expect((await post(origin, '/join', join)).status).toBe(200)
    expect(domain.acceptInvite).toHaveBeenCalledWith(join)
    expect((await post(origin, '/call', { teamId: 'project-a', method: 'view', input: {} })).status).toBe(401)
    const call = { teamId: 'project-a', method: 'view', input: {} }
    expect((await post(origin, '/call', { ...call, memberToken: 'forged' }, 'device-token')).status).toBe(400)
    expect((await post(origin, '/call', call, 'device-token')).status).toBe(200)
    expect(domain.dispatchAuthenticated).toHaveBeenCalledWith({ ...call, memberToken: 'device-token' })
  })

  it('rejects cross-origin browsers and oversized bodies before dispatch', async () => {
    const { network, domain } = fixture(128)
    const origin = await serving(network)
    const response = await fetch(`${origin}/call`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer device-token', origin: 'https://other.example' }, body: '{}',
    })
    expect(response.status).toBe(403)
    expect((await post(origin, '/call', { bytes: 'x'.repeat(129) }, 'device-token')).status).toBe(413)
    expect(domain.dispatchAuthenticated).not.toHaveBeenCalled()
  })

  it('makes one proxy call and does not replay a rejected mutation', async () => {
    const { network, domain } = fixture()
    const origin = await serving(network)
    expect(await network.request({ origin, path: 'call', body: { teamId: 'project-a', method: 'view', input: {} }, bearer: 'device-token' })).toEqual({ shared: true })
    vi.mocked(domain.dispatchAuthenticated).mockRejectedValueOnce(new Error('storage unavailable'))
    await expect(network.request({ origin, path: 'call', body: { teamId: 'project-a', method: 'submitFile', input: {} }, bearer: 'device-token' })).rejects.toThrow('HTTP 503')
    expect(domain.dispatchAuthenticated).toHaveBeenCalledTimes(2)
  })

  it('refuses redirects instead of forwarding member credentials to another destination', async () => {
    const { network } = fixture()
    const redirected = vi.fn()
    const server = createServer((request, response) => {
      if (request.url === '/other') redirected()
      response.writeHead(307, { location: '/other' }).end()
    })
    servers.push(server)
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('fixture did not bind')
    await expect(network.request({ origin: `http://127.0.0.1:${String(address.port)}`, path: 'call', body: {}, bearer: 'secret' })).rejects.toThrow('Unable to reach')
    expect(redirected).not.toHaveBeenCalled()
  })

  it('preserves only the member-access rejection code without exposing server diagnostics', async () => {
    const { network, domain } = fixture()
    const origin = await serving(network)
    const request = { origin, path: 'call' as const, body: { teamId: 'project-a', method: 'summary', input: {} }, bearer: 'device-token' }
    vi.mocked(domain.dispatchAuthenticated).mockRejectedValueOnce(new TeamBattleError('private server diagnostic', 'TEAM_BATTLE_ACCESS_DENIED'))
    await expect(network.request(request)).rejects.toMatchObject({
      name: 'TeamBattleError', code: 'TEAM_BATTLE_ACCESS_DENIED', message: 'member credential is invalid, revoked, or expired',
    })
    vi.mocked(domain.dispatchAuthenticated).mockRejectedValueOnce(new TeamBattleError('private server diagnostic', 'TEAM_BATTLE_REJECTED'))
    await expect(network.request(request)).rejects.toThrow('Team server rejected the request (HTTP 403)')
    expect(domain.dispatchAuthenticated).toHaveBeenCalledTimes(2)
  })
})

describe('Team server address validation', () => {
  it.each([
    ['https://lowpower.me/team-battle/', 'https://lowpower.me/team-battle'],
    ['http://192.168.1.5:3083/', 'http://192.168.1.5:3083'],
    ['http://127.0.0.1:3083', 'http://127.0.0.1:3083'],
    ['http://[::1]:3083', 'http://[::1]:3083'],
  ])('accepts explicit HTTPS or private HTTP: %s', (input, expected) => {
    expect(normalizeTeamServerUrl(input)).toBe(expected)
  })

  it.each([
    'http://example.com', 'http://169.254.169.254', 'file:///tmp/private', 'https://name:password@example.com',
    'https://example.com/?token=secret', 'https://example.com/#token', 'https://example.com/team/../api',
    'https://example.com/team/%2fapi', 'https://example.com/team//api', 'https://example.com\\private',
  ])('rejects unsafe or ambiguous address: %s', (input) => {
    expect(() => normalizeTeamServerUrl(input)).toThrow()
  })
})
