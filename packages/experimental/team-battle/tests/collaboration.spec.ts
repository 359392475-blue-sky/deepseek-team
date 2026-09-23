import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { CredentialKey, CredentialRecord } from '@deepseek-ai/dsh-credentials'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import TeamBattleService, {
  TeamBattleMemberId, type AcceptTeamInviteRequest, type AuthenticatedTeamRequest,
  type Config, type CreateHostedTeamRequest, type TeamBattleNetworkTransport,
  type TeamBattleProjectId, type TeamBattleSpaceView, type TeamBattleTeamSummary, type TeamBattleView,
} from '../src/index.ts'
import { MemoryMediaPool, MemoryStorageBackend } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'

const contexts: Context[] = []
afterEach(async () => { vi.restoreAllMocks(); vi.useRealTimers(); await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose())) })
const OWNER_TOKEN = 'o'.repeat(43)
const MEMBER_TOKEN = 'm'.repeat(43)
const TEAM = { name: 'Shared launch', goal: 'Ship reviewed bytes', memberName: 'Owner', memberRole: 'Product' }
const CONFIG: Config = { projectId: 'legacy', projectName: 'Original', projectGoal: 'Preserve old work', localMemberId: 'local', members: [{ id: 'local', name: 'Local', role: 'Product' }], maxMembers: 8 }

async function host(pool = new MemoryMediaPool(), records = new Map<CredentialKey, CredentialRecord>(), config = CONFIG) {
  const ctx = new Context()
  contexts.push(ctx)
  const noOp = (): void => {}
  ctx.provide('typert', { lookups: { configure: () => noOp, register: () => noOp }, contexts: { configureHost: () => noOp } } as never)
  ctx.provide('credentials', {
    readRecord: async (key: CredentialKey) => records.get(key),
    modifyRecord: async (key: CredentialKey, update: (previous: CredentialRecord | undefined) => Promise<CredentialRecord | undefined>) => {
      const value = await update(records.get(key)); if (value !== undefined) records.set(key, value); return value
    },
  } as never)
  await ctx.plugin(SessionStore)
  await ctx.plugin(Storage)
  ctx.storage.backend.register('memory', new MemoryStorageBackend(pool))
  const domains = new DomainFacility(ctx, { backend: 'memory', routes: {} })
  ctx.storage.mount('domain', domains)
  ctx.provide('storageDomain', domains)
  await ctx.plugin(TeamBattleService, config)
  return { ctx, service: ctx.teamBattle, pool, records }
}

function attachClient(client: TeamBattleService, server: TeamBattleService) {
  const lostResponses = { create: 0, join: 0, unavailableCalls: 0 }
  const transport: TeamBattleNetworkTransport = {
    status: () => ({ running: false, origins: [] }),
    start: async () => ({ running: true, host: '127.0.0.1', port: 2345, origins: ['http://127.0.0.1:2345'] }),
    stop: async () => {},
    request: async (request) => {
      expect(request.origin).toBe('https://team.example.test/shared')
      switch (request.path) {
        case 'create': {
          const response = await server.createHostedTeam(request.body as CreateHostedTeamRequest)
          if (lostResponses.create-- > 0) throw new Error('create response was lost')
          return response
        }
        case 'join': {
          const response = await server.acceptInvite(request.body as AcceptTeamInviteRequest)
          if (lostResponses.join-- > 0) throw new Error('join response was lost')
          return response
        }
        case 'call': {
          if (lostResponses.unavailableCalls-- > 0) throw new Error('Team server is unavailable')
          return server.dispatchAuthenticated({ ...request.body as Omit<AuthenticatedTeamRequest, 'memberToken'>, memberToken: request.bearer! })
        }
      }
    },
  }
  client.registerNetworkTransport(transport)
  return lostResponses
}

async function joinedMember(server: TeamBattleService, selected: TeamBattleProjectId) {
  const invitation = await server.createInvite({ teamId: selected, memberName: 'Engineer', memberRole: 'Engineering', origin: 'https://team.example.test/shared' })
  const member = await server.acceptInvite({ teamId: selected, inviteToken: invitation.token, memberToken: MEMBER_TOKEN })
  return { invitation, member }
}

function call(
  server: TeamBattleService, selected: TeamBattleProjectId, method: string, input: unknown, memberToken = MEMBER_TOKEN,
): Promise<unknown> {
  return server.dispatchAuthenticated({ teamId: selected, memberToken, method, input })
}

describe('authenticated multi-team collaboration', () => {
  it('preserves legacy state and independently reopens hosted teams', async () => {
    const first = await host()
    await first.service.createTask({ title: 'Legacy task', description: 'Keep', weight: 1 })
    const legacyBefore = first.pool.media.get('team_battle')!.global
    const alpha = await first.service.createTeam(TEAM)
    const beta = await first.service.createTeam({ ...TEAM, name: 'Separate team' })
    expect((await first.service.view({ teamId: alpha.id })).members).toHaveLength(1)
    await first.service.createTask({ teamId: alpha.id, title: 'Alpha task', description: 'Scoped', weight: 2 })
    expect((await first.service.view({ teamId: beta.id })).tasks).toHaveLength(0)
    expect(first.pool.media.get('team_battle')!.global).toEqual(legacyBefore)
    await expect(first.service.view({ teamId: alpha.id, actingMemberId: TeamBattleMemberId('local') })).rejects.toThrow('simulated identities')
    await first.ctx.fiber.dispose()
    const second = await host(first.pool)
    expect((await second.service.teams()).teams.map(team => team.mode)).toEqual(['legacy', 'hosted', 'hosted'])
    expect((await second.service.view()).tasks[0]!.title).toBe('Legacy task')
    expect((await second.service.view({ teamId: alpha.id })).tasks[0]!.title).toBe('Alpha task')
  })

  it('binds invitations to one member credential and rejects identity overrides, other teams, expiry, and revocation', async () => {
    const { service, pool } = await host()
    const team = await service.createHostedTeam({ ...TEAM, ownerMemberToken: OWNER_TOKEN })
    const { invitation, member } = await joinedMember(service, team.id)
    expect(member.localMemberId).toBe(invitation.memberId)
    expect(await service.acceptInvite({ teamId: team.id, inviteToken: invitation.token, memberToken: MEMBER_TOKEN })).toEqual(member)
    await expect(service.acceptInvite({ teamId: team.id, inviteToken: invitation.token, memberToken: 'x'.repeat(43) })).rejects.toThrow('already been used')
    await expect(call(service, team.id, 'view', { actingMemberId: team.ownerMemberId })).rejects.toThrow('command fields')
    await expect(call(service, team.id, 'createInvite', { memberName: 'Forged', memberRole: 'Owner' })).rejects.toThrow('only the team owner')
    await expect(call(service, team.id, 'privateSession', {})).rejects.toThrow('not allowed')
    const revoked = await service.createInvite({ teamId: team.id, memberName: 'Revoked', memberRole: 'Test', origin: 'https://team.example.test/shared' })
    await service.revokeInvite({ teamId: team.id, inviteId: revoked.id })
    await expect(service.acceptInvite({ teamId: team.id, inviteToken: revoked.token, memberToken: 'r'.repeat(43) })).rejects.toThrow('revoked')
    const duplicate = await service.createInvite({ teamId: team.id, memberName: 'Another identity', memberRole: 'Test', origin: 'https://team.example.test/shared' })
    await expect(service.acceptInvite({ teamId: team.id, inviteToken: duplicate.token, memberToken: MEMBER_TOKEN })).rejects.toThrow('already bound')
    const other = await service.createTeam({ ...TEAM, name: 'Other' })
    await expect(call(service, other.id, 'view', {})).rejects.toThrow('credential')
    const expired = await service.createInvite({ teamId: team.id, memberName: 'Later', memberRole: 'Test', expiresInHours: 1, origin: 'https://team.example.test/shared' })
    vi.spyOn(Date, 'now').mockReturnValue(expired.expiresAt + 1)
    await expect(service.acceptInvite({ teamId: team.id, inviteToken: expired.token, memberToken: 'e'.repeat(43) })).rejects.toThrow('expired')
    vi.restoreAllMocks()
    await service.revokeMember({ teamId: team.id, memberId: member.localMemberId })
    await expect(call(service, team.id, 'view', {})).rejects.toThrow('revoked')
    const directory = JSON.stringify(pool.media.get('team_battle_directory')!.global)
    for (const secret of [OWNER_TOKEN, MEMBER_TOKEN, invitation.token, expired.token]) expect(directory).not.toContain(secret)
  })

  it('completes authenticated handoff, return, revised-byte submission, and independent review', async () => {
    const { service } = await host()
    const team = await service.createHostedTeam({ ...TEAM, ownerMemberToken: OWNER_TOKEN })
    const { member } = await joinedMember(service, team.id)
    let view = await service.createTask({ teamId: team.id, title: 'Deliver UI', description: 'Implement', weight: 3 })
    let task = view.tasks[0]!
    view = await service.updateTask({ teamId: team.id, taskId: task.id, expectedRevision: task.revision, action: 'handoff', targetMemberId: member.localMemberId, note: 'Please implement and attach proof.' })
    task = view.tasks[0]!
    expect(task).toMatchObject({ ownerMemberId: member.localMemberId, status: 'in_progress' })
    await expect(call(service, team.id, 'updateTask', { taskId: task.id, expectedRevision: task.revision, action: 'submit' })).rejects.toThrow('published artifact')
    const publish = (name: string, content: string) => call(service, team.id, 'publishFile', { name, mediaType: 'text/plain', contentBase64: Buffer.from(content).toString('base64'), versionLabel: name, note: 'Reviewed independently', source: 'My private DeepSeek' }) as Promise<TeamBattleSpaceView>
    const firstFile = (await publish('v1.txt', 'initial')).files[0]!
    view = await call(service, team.id, 'submitFile', { fileId: firstFile.id, taskId: task.id, expectedTaskRevision: task.revision }) as TeamBattleView
    const firstArtifact = view.artifacts[0]!
    await expect(call(service, team.id, 'reviewArtifact', { artifactId: firstArtifact.id, expectedRevision: firstArtifact.revision, decision: 'accepted' })).rejects.toThrow('authors cannot review')
    view = await service.reviewArtifact({ teamId: team.id, artifactId: firstArtifact.id, expectedRevision: firstArtifact.revision, decision: 'rejected', note: 'Fix the issue' })
    const secondFile = (await publish('v2.txt', 'corrected')).files[1]!
    view = await call(service, team.id, 'submitFile', { fileId: secondFile.id, taskId: task.id, expectedTaskRevision: view.tasks[0]!.revision }) as TeamBattleView
    const secondArtifact = view.artifacts[1]!
    view = await service.reviewArtifact({ teamId: team.id, artifactId: secondArtifact.id, expectedRevision: secondArtifact.revision, decision: 'accepted' })
    expect(view.tasks[0]!.status).toBe('completed')
    expect(view.artifacts.map(value => value.review.status)).toEqual(['rejected', 'accepted'])
    await expect(call(service, team.id, 'sendFile', { fileId: secondFile.id, expectedRevision: secondFile.revision })).rejects.toThrow('downloaded to this device')
    expect((await service.space({ teamId: team.id })).deliveries).toEqual([])
  })

  it('shows active handoff recipients to an ordinary assignee while restricting invitation management to the owner', async () => {
    const { service } = await host()
    const team = await service.createHostedTeam({ ...TEAM, ownerMemberToken: OWNER_TOKEN })
    const { member } = await joinedMember(service, team.id)
    const invitation = await service.createInvite({ teamId: team.id, memberName: 'QA', memberRole: 'Quality', origin: 'https://team.example.test/shared' })
    const qa = await service.acceptInvite({ teamId: team.id, inviteToken: invitation.token, memberToken: 'q'.repeat(43) })
    const summary = await call(service, team.id, 'summary', {}) as TeamBattleTeamSummary
    expect(summary.invites).toEqual([])
    expect(summary.memberAccess.filter(value => value.status === 'active').map(value => value.memberId))
      .toEqual([team.ownerMemberId, member.localMemberId, qa.localMemberId])
    expect(summary.memberAccess.every(value => value.expiresAt === undefined)).toBe(true)
    let view = await service.createTask({ teamId: team.id, title: 'Ready for QA', description: 'Hand off implemented work', weight: 1 })
    view = await service.updateTask({ teamId: team.id, taskId: view.tasks[0]!.id, expectedRevision: view.tasks[0]!.revision, action: 'handoff', targetMemberId: member.localMemberId })
    view = await call(service, team.id, 'updateTask', { taskId: view.tasks[0]!.id, expectedRevision: view.tasks[0]!.revision, action: 'handoff', targetMemberId: qa.localMemberId }) as TeamBattleView
    expect(view.tasks[0]!.ownerMemberId).toBe(qa.localMemberId)
    await service.revokeMember({ teamId: team.id, memberId: qa.localMemberId })
    const after = await call(service, team.id, 'summary', {}) as TeamBattleTeamSummary
    expect(after.memberAccess.find(value => value.memberId === qa.localMemberId)?.status).toBe('revoked')
    expect(after.memberAccess.filter(value => value.status === 'active').map(value => value.memberId)).not.toContain(qa.localMemberId)
  })

  it('keeps all shared bytes on the server while two client homes keep only credentials and private conversations', async () => {
    const server = await host(); const owner = await host(); const colleague = await host()
    attachClient(owner.service, server.service); attachClient(colleague.service, server.service)
    const team = await owner.service.createTeam({ ...TEAM, serverUrl: 'https://team.example.test/shared', serverAccessToken: 'server-create-permission' })
    expect(team).toMatchObject({ mode: 'joined', storageLocation: 'https://team.example.test/shared' })
    const invitation = await owner.service.createInvite({ teamId: team.id, memberName: 'Peer', memberRole: 'Test' })
    const peer = await colleague.service.joinRemote({ inviteCode: invitation.inviteCode })
    await owner.service.createTask({ teamId: team.id, title: 'Shared', description: 'Team task', weight: 1 })
    expect((await colleague.service.view({ teamId: team.id })).tasks[0]!.title).toBe('Shared')
    const bytes = 'Only explicitly published bytes'
    await colleague.service.publishFile({ teamId: team.id, name: 'proof.txt', mediaType: 'text/plain', contentBase64: Buffer.from(bytes).toString('base64'), versionLabel: 'v1', note: 'Confirmed', source: 'DeepSeek local session' })
    const file = (await owner.service.space({ teamId: team.id })).files[0]!
    expect(file.createdByMemberId).toBe(peer.localMemberId)
    expect((await owner.service.readFile({ teamId: team.id, fileId: file.id })).contentBase64).toBe(Buffer.from(bytes).toString('base64'))
    const privateSession = colleague.ctx.sessions.create(SessionId('private-colleague'))
    privateSession.append('user/message', createUserMessage({ content: [{ type: 'text', text: 'PRIVATE_LOCAL_QUERY' }], source: { kind: 'user' } }), { surfaceOp: 'append' })
    await vi.waitFor(async () => { expect((await colleague.service.view()).weaponGrants).toHaveLength(1) })
    expect(JSON.stringify([...server.pool.media.values()])).not.toContain('PRIVATE_LOCAL_QUERY')
    expect(JSON.stringify([...colleague.pool.media.values()])).not.toContain(Buffer.from(bytes).toString('base64'))
    expect((await server.service.view({ teamId: team.id })).weaponGrants).toHaveLength(0)
    expect(JSON.stringify(await owner.service.teams())).not.toContain('server-create-permission')
    await owner.service.revokeMember({ teamId: team.id, memberId: peer.localMemberId })
    await expect(colleague.service.readFile({ teamId: team.id, fileId: file.id })).rejects.toThrow('revoked')
  })

  it('recovers lost creation and join responses without duplicate teams or member identities', async () => {
    const server = await host(); const owner = await host(); const colleague = await host()
    const ownerReplies = attachClient(owner.service, server.service)
    const peerReplies = attachClient(colleague.service, server.service)
    ownerReplies.create = 1
    const request = { ...TEAM, serverUrl: 'https://team.example.test/shared', serverAccessToken: 'server-create-permission' }
    await expect(owner.service.createTeam(request)).rejects.toThrow('response was lost')
    const team = await owner.service.createTeam(request)
    expect((await server.service.teams()).teams.filter(value => value.mode === 'hosted')).toHaveLength(1)
    const invitation = await owner.service.createInvite({ teamId: team.id, memberName: 'Peer', memberRole: 'Test' })
    peerReplies.join = 1
    await expect(colleague.service.joinRemote({ inviteCode: invitation.inviteCode })).rejects.toThrow('response was lost')
    const peer = await colleague.service.joinRemote({ inviteCode: invitation.inviteCode })
    expect(peer.localMemberId).toBe(invitation.memberId)
    expect((await server.service.view({ teamId: team.id })).members).toHaveLength(2)
    expect(colleague.records.size).toBe(1)
  })

  it('retains owner management after the issued lifetime and restart without admitting expired peers', async () => {
    const first = await host()
    const team = await first.service.createHostedTeam({ ...TEAM, ownerMemberToken: OWNER_TOKEN })
    const { member } = await joinedMember(first.service, team.id)
    const future = Date.now() + 721 * 3_600_000
    await first.ctx.fiber.dispose()
    vi.spyOn(Date, 'now').mockReturnValue(future)
    const reopened = await host(first.pool)
    const summary = await call(reopened.service, team.id, 'summary', {}, OWNER_TOKEN)
    expect(summary).toMatchObject({ ownerMemberId: team.ownerMemberId, memberAccess: [
      { memberId: team.ownerMemberId, status: 'active' },
      { memberId: member.localMemberId, status: 'expired' },
    ] })
    expect((await reopened.service.summary({ teamId: team.id })).memberAccess[0]).not.toHaveProperty('expiresAt')
    await expect(call(reopened.service, team.id, 'view', {})).rejects.toMatchObject({ code: 'TEAM_BATTLE_ACCESS_DENIED' })
    await expect(call(reopened.service, team.id, 'view', {}, 'forged'.repeat(8))).rejects.toMatchObject({ code: 'TEAM_BATTLE_ACCESS_DENIED' })
    await expect(call(reopened.service, team.id, 'revokeMember', { memberId: team.ownerMemberId }, OWNER_TOKEN)).rejects.toThrow('owner cannot revoke')
    const view = await call(reopened.service, team.id, 'createTask', { title: 'Owner after expiry', description: 'Retained access', weight: 1 }, OWNER_TOKEN) as TeamBattleView
    const handed = await call(reopened.service, team.id, 'updateTask', { taskId: view.tasks[0]!.id, expectedRevision: view.tasks[0]!.revision, action: 'handoff', targetMemberId: team.ownerMemberId }, OWNER_TOKEN) as TeamBattleView
    expect(handed.tasks[0]!.ownerMemberId).toBe(team.ownerMemberId)
    await expect(call(reopened.service, team.id, 'createInvite', { memberName: 'Replacement', memberRole: 'Engineering', origin: 'https://team.example.test/shared' }, OWNER_TOKEN)).resolves.toMatchObject({ teamId: team.id })
  })

  it.each(['expired', 'revoked'] as const)('rejoins a %s member on the same device only with a new invitation and retains old attribution', async (reason) => {
    const server = await host(); const owner = await host()
    const colleague = await host(new MemoryMediaPool(), new Map(), Object.assign({}, CONFIG, { maxTeams: 1 }))
    attachClient(owner.service, server.service)
    const replies = attachClient(colleague.service, server.service)
    const team = await owner.service.createTeam({ ...TEAM, serverUrl: 'https://team.example.test/shared', serverAccessToken: 'create' })
    const firstInvite = await owner.service.createInvite({ teamId: team.id, memberName: 'Peer', memberRole: 'Test' })
    const previous = await colleague.service.joinRemote({ inviteCode: firstInvite.inviteCode })
    const files = await colleague.service.publishFile({ teamId: team.id, name: 'original.txt', contentBase64: Buffer.from('original author').toString('base64'), mediaType: 'text/plain', versionLabel: 'v1', note: 'History', source: 'Peer' })
    if (reason === 'expired') vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 721 * 3_600_000)
    else await owner.service.revokeMember({ teamId: team.id, memberId: previous.localMemberId })
    await expect(colleague.service.view({ teamId: team.id })).rejects.toMatchObject({ code: 'TEAM_BATTLE_ACCESS_DENIED' })
    await expect(colleague.service.joinRemote({ inviteCode: firstInvite.inviteCode })).rejects.toMatchObject({ code: 'TEAM_BATTLE_ACCESS_DENIED' })
    const replacement = await owner.service.createInvite({ teamId: team.id, memberName: 'Peer returns', memberRole: 'Test' })
    replies.join = 1
    await expect(colleague.service.joinRemote({ inviteCode: replacement.inviteCode })).rejects.toThrow('response was lost')
    expect((await colleague.service.teams()).teams.find(value => value.id === team.id)!.localMemberId).toBe(previous.localMemberId)
    const recovered = await colleague.service.joinRemote({ inviteCode: replacement.inviteCode })
    expect(recovered.localMemberId).toBe(replacement.memberId)
    expect(recovered.localMemberId).not.toBe(previous.localMemberId)
    expect((await colleague.service.teams()).teams.filter(value => value.id === team.id)).toHaveLength(1)
    expect((await colleague.service.view({ teamId: team.id })).members).toHaveLength(3)
    const retained = await colleague.service.readFile({ teamId: team.id, fileId: files.files[0]!.id })
    expect(retained.file.createdByMemberId).toBe(previous.localMemberId)
    await colleague.ctx.fiber.dispose()
    const reopened = await host(colleague.pool, colleague.records, Object.assign({}, CONFIG, { maxTeams: 1 }))
    attachClient(reopened.service, server.service)
    expect((await reopened.service.view({ teamId: team.id })).localMemberId).toBe(replacement.memberId)
  })

  it('does not replace active access, owner identity, another server, or an unreachable connection', async () => {
    const server = await host(); const owner = await host(); const colleague = await host()
    attachClient(owner.service, server.service)
    const replies = attachClient(colleague.service, server.service)
    const team = await owner.service.createTeam({ ...TEAM, serverUrl: 'https://team.example.test/shared', serverAccessToken: 'create' })
    const firstInvite = await owner.service.createInvite({ teamId: team.id, memberName: 'Peer', memberRole: 'Test' })
    const previous = await colleague.service.joinRemote({ inviteCode: firstInvite.inviteCode })
    const replacement = await owner.service.createInvite({ teamId: team.id, memberName: 'Other', memberRole: 'Test' })
    await expect(colleague.service.joinRemote({ inviteCode: replacement.inviteCode })).rejects.toThrow('active access')
    await expect(owner.service.joinRemote({ inviteCode: replacement.inviteCode })).rejects.toThrow('owner cannot replace')
    const anotherServer = new URL(replacement.inviteCode)
    anotherServer.searchParams.set('server', 'https://other.example.test')
    await expect(colleague.service.joinRemote({ inviteCode: anotherServer.href })).rejects.toThrow('different server')
    await owner.service.revokeMember({ teamId: team.id, memberId: previous.localMemberId })
    replies.unavailableCalls = 1
    await expect(colleague.service.joinRemote({ inviteCode: replacement.inviteCode })).rejects.toThrow('server is unavailable')
    expect((await colleague.service.teams()).teams.find(value => value.id === team.id)!.localMemberId).toBe(previous.localMemberId)
    expect((await owner.service.summary({ teamId: team.id })).invites.find(value => value.id === replacement.id)!.status).toBe('pending')
    expect(colleague.records.size).toBe(1)
  })

  it('drains an admitted authenticated write before disposal and preserves revocation on reopen', async () => {
    const first = await host()
    const team = await first.service.createHostedTeam({ ...TEAM, ownerMemberToken: OWNER_TOKEN })
    const { member } = await joinedMember(first.service, team.id)
    const mutation = call(first.service, team.id, 'createTask', { title: 'Accepted before close', description: 'Durable', weight: 1 })
    const disposed = first.ctx.fiber.dispose()
    await mutation; await disposed
    const second = await host(first.pool)
    expect((await second.service.view({ teamId: team.id })).tasks[0]!.title).toBe('Accepted before close')
    await second.service.revokeMember({ teamId: team.id, memberId: member.localMemberId })
    await second.ctx.fiber.dispose()
    const third = await host(first.pool)
    await expect(call(third.service, team.id, 'view', {})).rejects.toThrow('revoked')
  })
})
