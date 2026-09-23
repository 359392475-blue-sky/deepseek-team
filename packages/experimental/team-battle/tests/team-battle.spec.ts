import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import TeamBattleService, {
  TeamBattleMemberId,
  type Config,
  type TeamBattleTaskId,
} from '../src/index.ts'
import {
  MemoryMediaPool,
  MemoryStorageBackend,
} from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'

const contexts: Context[] = []

afterEach(async () => {
  vi.useRealTimers()
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
})

const CONFIG: Config = {
  projectId: 'team-project',
  projectName: 'Team Project',
  projectGoal: 'Ship the Team Battle MVP',
  localMemberId: 'product',
  members: [
    { id: 'product', name: 'Product', role: 'PM', color: '#4176E6' },
    { id: 'engineering', name: 'Engineering', role: 'Developer', color: '#27a276' },
  ],
  maxMembers: 4,
  maxTasks: 16,
  maxContextEntries: 16,
  maxArtifacts: 16,
  maxActivityEntries: 64,
  maxProcessedEventIds: 64,
  maxWeaponGrants: 64,
  combatShieldMax: 6,
  shieldDamagePerQuery: 3,
  memberOfflineAfterMs: 1_000,
}

async function harness(pool = new MemoryMediaPool(), config: Config = CONFIG) {
  const ctx = new Context()
  contexts.push(ctx)
  const dispose = (): void => {}
  ctx.provide('typert', {
    lookups: { configure: () => dispose, register: () => dispose },
    contexts: { configureHost: () => dispose },
  } as never)
  await ctx.plugin(SessionStore)
  await ctx.plugin(Storage)
  ctx.storage.backend.register('memory', new MemoryStorageBackend(pool))
  const storageDomain = new DomainFacility(ctx, { backend: 'memory', routes: {} })
  ctx.storage.mount('domain', storageDomain)
  ctx.provide('storageDomain', storageDomain)
  const teamBattleFiber = await ctx.plugin(TeamBattleService, config)
  return { ctx, pool, teamBattleFiber }
}

function artifactRequest(taskId: TeamBattleTaskId, name: string) {
  return {
    taskId,
    name,
    mediaType: 'text/plain',
    uri: `file:///tmp/${name}.txt`,
    sha256: 'a'.repeat(64),
    bytes: 12,
  }
}

describe('Team Battle durable aggregate', () => {
  it('requires event-id capacity to cover every retained weapon grant', async () => {
    const invalidConfig: Config = Object.assign({}, CONFIG, {
      maxProcessedEventIds: 1,
      maxWeaponGrants: 2,
    })
    await expect(harness(new MemoryMediaPool(), invalidConfig))
      .rejects.toThrow('maxProcessedEventIds cannot be less than maxWeaponGrants')
  })

  it('reopens the same project state from durable storage', async () => {
    const first = await harness()
    const created = await first.ctx.teamBattle.createTask({
      title: 'Persist me', description: 'Survive a reopen', weight: 4,
    })
    const taskId = created.tasks[0]!.id
    const event = {
      version: 1 as const,
      type: 'query' as const,
      eventId: 'durable-query',
      memberId: TeamBattleMemberId('engineering'),
      occurredAt: 10,
    }
    const receipt = await first.ctx.teamBattle.ingest(event)
    await first.ctx.teamBattle.consumeWeapon({ weaponId: receipt.weaponId })
    await first.ctx.fiber.dispose()

    const second = await harness(first.pool)
    expect((await second.ctx.teamBattle.view())).toMatchObject({
      revision: 3,
      project: { id: 'team-project', name: 'Team Project' },
      members: [{ id: 'product', color: '#4176e6' }, { id: 'engineering', color: '#27a276' }],
      tasks: [{ id: taskId, title: 'Persist me', weight: 4 }],
      weaponGrants: [{ id: receipt.weaponId, eventId: event.eventId }],
      progress: { coreHp: 4, coreMaxHp: 4 },
      combatShield: { hp: 3, maxHp: 6 },
    })
    expect(await second.ctx.teamBattle.ingest(event)).toEqual({ ...receipt, duplicate: true })
    expect((await second.ctx.teamBattle.view()).revision).toBe(3)
  })

  it('grants exactly one weapon per strict Query event without retaining prompt text', async () => {
    const { ctx } = await harness()
    const event = {
      version: 1 as const,
      type: 'query' as const,
      eventId: 'codex:session:turn',
      memberId: TeamBattleMemberId('engineering'),
      occurredAt: 10,
    }
    const first = await ctx.teamBattle.ingest(event)
    const duplicate = await ctx.teamBattle.ingest(event)
    expect(first).toMatchObject({ duplicate: false })
    expect(duplicate).toEqual({ ...first, duplicate: true })
    expect((await ctx.teamBattle.view())).toMatchObject({
      revision: 1,
      members: [{ id: 'product' }, { id: 'engineering', status: 'online' }],
      weaponGrants: [{ eventId: event.eventId, memberId: 'engineering' }],
    })
    await expect(ctx.teamBattle.ingest({ ...event, eventId: 'bad', prompt: 'never persist me' } as never))
      .rejects.toThrow()
    expect(JSON.stringify((await ctx.teamBattle.view()))).not.toContain('never persist me')
  })

  it('observes each human Session message through the same idempotent content-free path', async () => {
    const { ctx } = await harness()
    const session = ctx.sessions.create(SessionId('human-session'))
    const appended = session.append('user/message', createUserMessage({
      content: [{ type: 'text', text: 'private prompt body' }],
      source: { kind: 'user' },
    }), { surfaceOp: 'append' })
    await vi.waitFor(async () => {
      expect((await ctx.teamBattle.view()).weaponGrants).toHaveLength(1)
    })
    const view = (await ctx.teamBattle.view())
    expect(view.weaponGrants[0]).toMatchObject({
      eventId: `human-session:${String(appended.seq)}`,
      memberId: 'product',
    })
    expect(JSON.stringify(view)).not.toContain('private prompt body')
  })

  it('derives core damage only from accepted artifact reviews and keeps duplicate review idempotent', async () => {
    const { ctx } = await harness(new MemoryMediaPool(), Object.assign({}, CONFIG, { allowSimulation: true }))
    let view = await ctx.teamBattle.createTask({ title: 'Core task', description: 'Weighted work', weight: 10 })
    const task = view.tasks[0]!
    view = await ctx.teamBattle.updateTask({ taskId: task.id, expectedRevision: task.revision, action: 'claim' })
    const claimed = view.tasks[0]!
    view = await ctx.teamBattle.publishArtifact(artifactRequest(claimed.id, 'first'))
    const firstArtifact = view.artifacts[0]!
    view = await ctx.teamBattle.publishArtifact(artifactRequest(claimed.id, 'second'))
    const secondArtifact = view.artifacts[1]!
    expect(view.progress).toMatchObject({ acceptedWeight: 0, coreHp: 10, coreMaxHp: 10 })

    view = await ctx.teamBattle.reviewArtifact({ actingMemberId: TeamBattleMemberId('engineering'),
      artifactId: firstArtifact.id, expectedRevision: firstArtifact.revision, decision: 'accepted',
    })
    expect(view.progress).toMatchObject({ acceptedWeight: 10, coreHp: 0, coreMaxHp: 10 })
    expect(view.tasks[0]!.status).toBe('completed')
    const acceptedRevision = view.revision
    view = await ctx.teamBattle.reviewArtifact({ actingMemberId: TeamBattleMemberId('engineering'),
      artifactId: firstArtifact.id, expectedRevision: firstArtifact.revision, decision: 'accepted',
    })
    expect(view.revision).toBe(acceptedRevision)

    view = await ctx.teamBattle.reviewArtifact({ actingMemberId: TeamBattleMemberId('engineering'),
      artifactId: secondArtifact.id, expectedRevision: secondArtifact.revision, decision: 'rejected',
    })
    expect(view.tasks[0]!.status).toBe('completed')
    expect(view.progress.coreHp).toBe(0)
  })

  it('supports deletion before artifacts and refreshes an exhausted combat shield on the next hit', async () => {
    const { ctx } = await harness()
    let view = await ctx.teamBattle.createTask({ title: 'Delete me', description: 'No artifact', weight: 2 })
    view = await ctx.teamBattle.updateTask({
      taskId: view.tasks[0]!.id,
      expectedRevision: view.tasks[0]!.revision,
      action: 'delete',
    })
    expect(view.tasks).toEqual([])

    for (const id of ['q1', 'q2', 'q3']) {
      const receipt = await ctx.teamBattle.ingest({
        version: 1,
        type: 'query',
        eventId: id,
        memberId: TeamBattleMemberId('product'),
        occurredAt: Date.now(),
      })
      view = await ctx.teamBattle.consumeWeapon({ weaponId: receipt.weaponId })
    }
    expect(view.combatShield).toEqual({ hp: 3, maxHp: 6 })
  })

  it('expires presence in the view and avoids duplicate heartbeat activity', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
    const { ctx } = await harness()
    let view = await ctx.teamBattle.heartbeat({ status: 'online' })
    const firstActivityCount = view.activity.length
    vi.setSystemTime(1_500)
    view = await ctx.teamBattle.heartbeat({ status: 'online' })
    expect(view.activity).toHaveLength(firstActivityCount)
    vi.setSystemTime(2_501)
    expect((await ctx.teamBattle.view()).members[0]!.status).toBe('offline')
  })
})

function fileRequest(name = 'notes.txt', content = 'Confirmed team notes') {
  return { name, contentBase64: Buffer.from(content).toString('base64'), mediaType: 'text/plain',
    versionLabel: 'v1.0', note: 'Explicitly published', source: 'Local file' }
}

describe('Team Battle shared files and delivery', () => {
  it('persists nested folders and exact bytes independently of pre-existing task state', async () => {
    const first = await harness()
    await first.ctx.teamBattle.createTask({ title: 'Existing work', description: 'Keep me', weight: 1 })
    const before = first.pool.media.get('team_battle')!.global
    const space = await first.ctx.teamBattle.createFolder({ name: 'Launch' })
    const folder = space.folders[0]!
    const published = await first.ctx.teamBattle.publishFile({ ...fileRequest(), parentId: folder.id })
    const file = published.files[0]!
    expect(file.bytes).toBe(Buffer.byteLength('Confirmed team notes'))
    expect(file.sha256).toMatch(/^[a-f0-9]{64}$/)
    expect(JSON.stringify(published)).not.toContain('contentBase64')
    expect(first.pool.media.get('team_battle')!.global).toBe(before)
    await first.ctx.fiber.dispose()
    const reopened = await harness(first.pool)
    expect((await reopened.ctx.teamBattle.view()).tasks[0]!.title).toBe('Existing work')
    expect((await reopened.ctx.teamBattle.space())).toEqual(published)
    expect((await reopened.ctx.teamBattle.readFile({ fileId: file.id })).contentBase64).toBe(fileRequest().contentBase64)
  })

  it('rejects nonempty folder deletion, sibling collisions and stale renames', async () => {
    const { ctx } = await harness()
    const folder = (await ctx.teamBattle.createFolder({ name: 'Design' })).folders[0]!
    const file = (await ctx.teamBattle.publishFile({ ...fileRequest(), parentId: folder.id })).files[0]!
    await expect(ctx.teamBattle.updateSpaceItem({ kind: 'folder', id: folder.id, expectedRevision: 1, action: 'delete' }))
      .rejects.toThrow('folder is not empty')
    await expect(ctx.teamBattle.createFolder({ name: file.name, parentId: folder.id }))
      .rejects.toThrow('already exists')
    await ctx.teamBattle.updateSpaceItem({ kind: 'file', id: file.id, expectedRevision: 1, action: 'rename', name: 'renamed.txt' })
    await expect(ctx.teamBattle.updateSpaceItem({ kind: 'file', id: file.id, expectedRevision: 1, action: 'delete' }))
      .rejects.toThrow('stale item revision')
    await ctx.teamBattle.updateSpaceItem({ kind: 'file', id: file.id, expectedRevision: 2, action: 'delete' })
    expect((await ctx.teamBattle.updateSpaceItem({ kind: 'folder', id: folder.id, expectedRevision: 1, action: 'delete' })).folders)
      .toEqual([])
  })

  it('bounds actual decoded bytes and rejects malformed payloads without mutating storage', async () => {
    const { ctx } = await harness(new MemoryMediaPool(), Object.assign({}, CONFIG, { maxFileBytes: 4, maxTotalFileBytes: 6 }))
    await expect(ctx.teamBattle.publishFile(fileRequest('too-big.txt', '12345'))).rejects.toThrow('maxFileBytes')
    await expect(ctx.teamBattle.publishFile({ ...fileRequest(), contentBase64: '!!!!' })).rejects.toThrow('base64')
    await expect(ctx.teamBattle.publishFile(fileRequest('../escape.txt', '1'))).rejects.toThrow('path characters')
    await ctx.teamBattle.publishFile(fileRequest('one.txt', '1234'))
    await expect(ctx.teamBattle.publishFile(fileRequest('two.txt', '1234'))).rejects.toThrow('storage capacity')
    expect((await ctx.teamBattle.space()).files).toHaveLength(1)
  })

  it('accepts a file at the configured byte ceiling and serializes conflicting edits', async () => {
    const { ctx } = await harness()
    const contentBase64 = Buffer.alloc(2 * 1024 * 1024, 65).toString('base64')
    const file = (await ctx.teamBattle.publishFile({ ...fileRequest(), contentBase64 })).files[0]!
    expect((await ctx.teamBattle.readFile({ fileId: file.id })).contentBase64).toBe(contentBase64)
    const results = await Promise.allSettled([
      ctx.teamBattle.updateSpaceItem({ kind: 'file', id: file.id, expectedRevision: 1, action: 'rename', name: 'winner.txt' }),
      ctx.teamBattle.updateSpaceItem({ kind: 'file', id: file.id, expectedRevision: 1, action: 'delete' }),
    ])
    expect(results.map(result => result.status)).toEqual(['fulfilled', 'rejected'])
    expect((await ctx.teamBattle.space()).files[0]!.name).toBe('winner.txt')
  })

  it('does not publish a successful upload when its durable write fails', async () => {
    const { ctx, pool } = await harness()
    pool.failNextWrites = 1
    await expect(ctx.teamBattle.publishFile(fileRequest())).rejects.toThrow('injected write failure')
    expect((await ctx.teamBattle.space())).toMatchObject({ revision: 0, files: [] })
    await ctx.teamBattle.publishFile(fileRequest())
    expect((await ctx.teamBattle.space()).files).toHaveLength(1)
  })

  it('reuses human artifact review for explicitly submitted uploaded files', async () => {
    const { ctx } = await harness(new MemoryMediaPool(), Object.assign({}, CONFIG, { allowSimulation: true }))
    let view = await ctx.teamBattle.createTask({ title: 'Accept me', description: 'File review', weight: 2 })
    const task = view.tasks[0]!
    const file = (await ctx.teamBattle.publishFile(fileRequest())).files[0]!
    await expect(ctx.teamBattle.submitFile({ fileId: file.id, taskId: task.id, expectedTaskRevision: 1 }))
      .rejects.toThrow('current owner')
    view = await ctx.teamBattle.updateTask({ taskId: task.id, expectedRevision: 1, action: 'claim' })
    await expect(ctx.teamBattle.submitFile({ fileId: file.id, taskId: task.id, expectedTaskRevision: 1 }))
      .rejects.toThrow('stale task revision')
    view = await ctx.teamBattle.submitFile({ fileId: file.id, taskId: task.id, expectedTaskRevision: view.tasks[0]!.revision })
    const artifact = view.artifacts[0]!
    expect(artifact).toMatchObject({ uri: `team-battle-file:${file.id}`, sha256: file.sha256, bytes: file.bytes })
    expect((await ctx.teamBattle.submitFile({ fileId: file.id, taskId: task.id, expectedTaskRevision: 2 })).artifacts).toHaveLength(1)
    await ctx.teamBattle.reviewArtifact({ actingMemberId: TeamBattleMemberId('engineering'), artifactId: artifact.id, expectedRevision: 1, decision: 'accepted' })
    expect((await ctx.teamBattle.space()).files[0]).toMatchObject({ taskId: task.id, artifactId: artifact.id, review: { status: 'accepted' } })
    expect((await ctx.teamBattle.view()).progress.percent).toBe(100)
    await expect(ctx.teamBattle.updateSpaceItem({ kind: 'file', id: file.id, expectedRevision: 1, action: 'delete' }))
      .rejects.toThrow('linked to task review')
    await expect(ctx.teamBattle.publishArtifact({ ...artifactRequest(task.id, 'fake'), uri: `team-battle-file:${file.id}` }))
      .rejects.toThrow()
  })

  it('serializes file deletion against task submission across the two domains', async () => {
    const { ctx } = await harness()
    const task = (await ctx.teamBattle.createTask({ title: 'Race', description: 'Keep bytes', weight: 1 })).tasks[0]!
    await ctx.teamBattle.updateTask({ taskId: task.id, expectedRevision: 1, action: 'claim' })
    const file = (await ctx.teamBattle.publishFile(fileRequest())).files[0]!
    const outcomes = await Promise.allSettled([
      ctx.teamBattle.submitFile({ fileId: file.id, taskId: task.id, expectedTaskRevision: 2 }),
      ctx.teamBattle.updateSpaceItem({ kind: 'file', id: file.id, expectedRevision: 1, action: 'delete' }),
    ])
    expect(outcomes.map(outcome => outcome.status)).toEqual(['fulfilled', 'rejected'])
    expect((await ctx.teamBattle.space()).files[0]!.taskId).toBe(task.id)
    expect((await ctx.teamBattle.readFile({ fileId: file.id })).contentBase64).toBe(fileRequest().contentBase64)
  })

  it('keeps repeated pulls queued until the same-member connector acknowledges durable delivery', async () => {
    const first = await harness()
    const file = (await first.ctx.teamBattle.publishFile(fileRequest())).files[0]!
    const queued = await first.ctx.teamBattle.sendFile({ fileId: file.id, expectedRevision: 1 })
    const delivery = queued.deliveries[0]!
    expect((await first.ctx.teamBattle.sendFile({ fileId: file.id, expectedRevision: 1 })).deliveries).toHaveLength(1)
    const request = { memberId: TeamBattleMemberId('product') }
    expect(first.ctx.teamBattle.pullDelivery(request)).toEqual(first.ctx.teamBattle.pullDelivery(request))
    expect(first.ctx.teamBattle.pullDelivery(request)).toMatchObject({ delivery: { status: 'queued' }, content: { contentBase64: fileRequest().contentBase64 } })
    expect((await first.ctx.teamBattle.view()).members[0]!.status).toBe('offline')
    expect(() => first.ctx.teamBattle.pullDelivery({ memberId: TeamBattleMemberId('engineering') })).toThrow('local member')
    await expect(first.ctx.teamBattle.acknowledgeDelivery({ memberId: TeamBattleMemberId('engineering'), deliveryId: delivery.id, outcome: 'delivered' }))
      .rejects.toThrow('local member')
    await first.ctx.teamBattle.updateSpaceItem({ kind: 'file', id: file.id, expectedRevision: 1, action: 'rename', name: 'after-send.txt' })
    expect(first.ctx.teamBattle.pullDelivery(request).content?.contentBase64).toBe(fileRequest().contentBase64)
    await expect(first.ctx.teamBattle.updateSpaceItem({ kind: 'file', id: file.id, expectedRevision: 2, action: 'delete' }))
      .rejects.toThrow('delivery records')
    await first.ctx.fiber.dispose()
    const second = await harness(first.pool)
    expect(second.ctx.teamBattle.pullDelivery(request).delivery?.id).toBe(delivery.id)
    const acknowledgement = { ...request, deliveryId: delivery.id, outcome: 'delivered' as const, note: 'Connector confirmed local receipt' }
    const receipt = await second.ctx.teamBattle.acknowledgeDelivery(acknowledgement)
    expect(receipt.status).toBe('delivered')
    expect(typeof receipt.acknowledgedAt).toBe('number')
    expect(await second.ctx.teamBattle.acknowledgeDelivery(acknowledgement)).toEqual(receipt)
    expect(second.ctx.teamBattle.pullDelivery(request)).toEqual({})
    await expect(second.ctx.teamBattle.acknowledgeDelivery({ ...acknowledgement, outcome: 'failed' })).rejects.toThrow('terminal')
  })

  it('retains queued status after acknowledgement storage failure and permits a failed receipt', async () => {
    const { ctx, pool } = await harness()
    const file = (await ctx.teamBattle.publishFile(fileRequest())).files[0]!
    const delivery = (await ctx.teamBattle.sendFile({ fileId: file.id, expectedRevision: 1 })).deliveries[0]!
    const request = { memberId: TeamBattleMemberId('product'), deliveryId: delivery.id, outcome: 'failed' as const }
    pool.failNextWrites = 1
    await expect(ctx.teamBattle.acknowledgeDelivery(request)).rejects.toThrow('injected write failure')
    expect((await ctx.teamBattle.space()).deliveries[0]!.status).toBe('queued')
    expect(await ctx.teamBattle.acknowledgeDelivery(request)).toMatchObject({ status: 'failed' })
  })

  it('drains accepted project and file operations before disposing either domain', async () => {
    const first = await harness()
    const service = first.ctx.teamBattle
    const pendingFolder = service.createFolder({ name: 'Before close' })
    const pendingFile = service.publishFile(fileRequest())
    const pendingTask = service.createTask({ title: 'Before close', description: 'Queued task', weight: 1 })
    await first.teamBattleFiber.dispose()
    await Promise.all([pendingFolder, pendingFile, pendingTask])
    await expect(service.createFolder({ name: 'Too late' })).rejects.toThrow('closing')
    await first.ctx.fiber.dispose()
    const reopened = await harness(first.pool)
    expect((await reopened.ctx.teamBattle.space()).folders).toHaveLength(1)
    expect((await reopened.ctx.teamBattle.space()).files).toHaveLength(1)
    expect((await reopened.ctx.teamBattle.view()).tasks).toHaveLength(1)
  })

  it('rejects reopened bytes whose stored checksum no longer matches', async () => {
    const first = await harness()
    await first.ctx.teamBattle.publishFile(fileRequest())
    await first.ctx.fiber.dispose()
    const medium = first.pool.media.get('team_battle_space')!
    const stored = medium.global as { files: { contentBase64: string }[] }
    stored.files[0]!.contentBase64 = Buffer.from('tampered bytes').toString('base64')
    await expect(harness(first.pool)).rejects.toThrow('integrity check failed')
  })
})


describe('Team Battle local collaboration simulation', () => {
  const engineering = { actingMemberId: TeamBattleMemberId('engineering') }
  const product = { actingMemberId: TeamBattleMemberId('product') }
  const quality = { actingMemberId: TeamBattleMemberId('quality') }
  const simulationConfig: Config = Object.assign({}, CONFIG, {
    allowSimulation: true,
    members: [...CONFIG.members, { id: 'quality', name: 'Quality', role: 'QA' }],
  })

  it('rejects identity overrides by default and unknown simulated members without changing state', async () => {
    const fixed = await harness()
    expect((await fixed.ctx.teamBattle.view())).toMatchObject({ localMemberId: 'product', simulationEnabled: false })
    await expect(fixed.ctx.teamBattle.view(engineering)).rejects.toThrow('allowSimulation')
    await expect(fixed.ctx.teamBattle.space(engineering)).rejects.toThrow('allowSimulation')
    await expect(fixed.ctx.teamBattle.createTask({ ...engineering, title: 'No', description: 'No', weight: 1 })).rejects.toThrow('allowSimulation')
    await expect(fixed.ctx.teamBattle.publishFile({ ...engineering, ...fileRequest() })).rejects.toThrow('allowSimulation')
    const simulated = await harness(new MemoryMediaPool(), simulationConfig)
    const unknown = { actingMemberId: TeamBattleMemberId('unknown') }
    await expect(simulated.ctx.teamBattle.view(unknown)).rejects.toThrow('configured member')
    await expect(simulated.ctx.teamBattle.heartbeat({ ...unknown, status: 'online' })).rejects.toThrow('configured member')
    await expect(simulated.ctx.teamBattle.createFolder({ ...unknown, name: 'No' })).rejects.toThrow('configured member')
    expect((await simulated.ctx.teamBattle.view()).revision).toBe(0)
    expect((await simulated.ctx.teamBattle.space()).revision).toBe(0)
  })

  it('keeps concurrent callers independent and enables simulation without changing durable deployment', async () => {
    const first = await harness()
    const deployment = structuredClone(first.pool.media.get('team_battle')!.global)
    await first.ctx.fiber.dispose()
    const simulated = await harness(first.pool, Object.assign({}, CONFIG, { allowSimulation: true }))
    expect(simulated.pool.media.get('team_battle')!.global).toEqual(deployment)
    const [engineerResult, productResult] = await Promise.all([
      simulated.ctx.teamBattle.createTask({ ...engineering, title: 'Engineer task', description: 'Implementation', weight: 1 }),
      simulated.ctx.teamBattle.createTask({ ...product, title: 'Product task', description: 'Requirements', weight: 1 }),
    ])
    expect(engineerResult.localMemberId).toBe('engineering')
    expect(productResult.localMemberId).toBe('product')
    expect((await simulated.ctx.teamBattle.view(engineering))).toMatchObject({ localMemberId: 'engineering', simulationEnabled: true })
    expect((await simulated.ctx.teamBattle.view()).localMemberId).toBe('product')
    expect((await simulated.ctx.teamBattle.view()).tasks.map(task => task.createdByMemberId)).toEqual(['engineering', 'product'])
    await simulated.ctx.fiber.dispose()
    const fixed = await harness(first.pool)
    expect((await fixed.ctx.teamBattle.view())).toMatchObject({ localMemberId: 'product', simulationEnabled: false })
    expect((await fixed.ctx.teamBattle.view()).tasks).toHaveLength(2)
  })

  it('runs product creation, engineer submission, QA return, corrected upload, and product acceptance', async () => {
    const { ctx, pool } = await harness(new MemoryMediaPool(), simulationConfig)
    let task = (await ctx.teamBattle.createTask({ ...product, title: 'Export CSV', description: 'Keep Chinese column names', weight: 3 })).tasks[0]!
    task = (await ctx.teamBattle.updateTask({ ...engineering, taskId: task.id, expectedRevision: task.revision, action: 'claim' })).tasks[0]!
    expect(task.ownerMemberId).toBe('engineering')
    await expect(ctx.teamBattle.updateTask({ ...product, taskId: task.id, expectedRevision: task.revision, action: 'submit' }))
      .rejects.toThrow('current owner')
    const folder = (await ctx.teamBattle.createFolder({ ...engineering, name: 'Exports' })).folders[0]!
    const firstFile = (await ctx.teamBattle.publishFile({ ...engineering, ...fileRequest('export-v1.csv', 'wrong'), parentId: folder.id })).files[0]!
    expect(firstFile.createdByMemberId).toBe('engineering')
    let view = await ctx.teamBattle.submitFile({
      ...engineering, fileId: firstFile.id, taskId: task.id, expectedTaskRevision: task.revision,
    })
    const firstArtifact = view.artifacts[0]!
    await expect(ctx.teamBattle.reviewArtifact({ ...engineering, artifactId: firstArtifact.id, expectedRevision: 1, decision: 'accepted' })).rejects.toThrow('authors cannot review')
    await expect(ctx.teamBattle.submitFile({ ...quality, fileId: firstFile.id, taskId: task.id, expectedTaskRevision: task.revision }))
      .rejects.toThrow('current owner')
    view = await ctx.teamBattle.reviewArtifact({ ...quality, artifactId: firstArtifact.id, expectedRevision: 1, decision: 'rejected', note: 'Column headers must remain Chinese' })
    expect(view.artifacts[0]!.review).toMatchObject({ reviewedByMemberId: 'quality', status: 'rejected' })
    expect(view.tasks[0]).toMatchObject({ status: 'in_progress', ownerMemberId: 'engineering' })
    expect(view.progress.percent).toBe(0)
    const secondFile = (await ctx.teamBattle.publishFile({ ...engineering, ...fileRequest('export-v2.csv', '姓名,状态'), parentId: folder.id })).files[1]!
    view = await ctx.teamBattle.submitFile({
      ...engineering, fileId: secondFile.id, taskId: task.id, expectedTaskRevision: view.tasks[0]!.revision,
    })
    const corrected = view.artifacts[1]!
    view = await ctx.teamBattle.reviewArtifact({ ...product, artifactId: corrected.id, expectedRevision: corrected.revision, decision: 'accepted', note: 'Headers verified' })
    expect(view.tasks[0]!.status).toBe('completed')
    expect(view.progress.percent).toBe(100)
    expect(view.artifacts.map(artifact => artifact.review.reviewedByMemberId)).toEqual(['quality', 'product'])
    expect((await ctx.teamBattle.readFile({ ...quality, fileId: secondFile.id })).contentBase64).toBe(Buffer.from('姓名,状态').toString('base64'))
    await ctx.teamBattle.publishContext({ ...quality, summary: 'Regression passed' })
    await ctx.teamBattle.heartbeat({ ...quality, status: 'online' })
    expect((await ctx.teamBattle.view()).contexts[0]!.createdByMemberId).toBe('quality')
    expect((await ctx.teamBattle.view()).members.find(member => member.id === 'quality')!.status).toBe('online')
    await ctx.fiber.dispose()
    const reopened = await harness(pool, simulationConfig)
    expect((await reopened.ctx.teamBattle.view()).artifacts).toHaveLength(2)
    expect((await reopened.ctx.teamBattle.view()).progress.percent).toBe(100)
  })

  it('keeps a task submitted while another artifact still awaits review', async () => {
    const { ctx } = await harness(new MemoryMediaPool(), simulationConfig)
    const task = (await ctx.teamBattle.createTask({ title: 'Two files', description: 'Review both', weight: 1 })).tasks[0]!
    await ctx.teamBattle.updateTask({ ...engineering, taskId: task.id, expectedRevision: task.revision, action: 'claim' })
    const first = (await ctx.teamBattle.publishArtifact({ ...engineering, ...artifactRequest(task.id, 'first') })).artifacts[0]!
    const second = (await ctx.teamBattle.publishArtifact({ ...engineering, ...artifactRequest(task.id, 'second') })).artifacts[1]!
    let view = await ctx.teamBattle.reviewArtifact({ ...quality, artifactId: first.id, expectedRevision: first.revision, decision: 'rejected' })
    expect(view.tasks[0]!.status).toBe('submitted')
    await expect(ctx.teamBattle.updateTask({
      ...engineering, taskId: task.id, expectedRevision: view.tasks[0]!.revision, action: 'release',
    })).rejects.toThrow('in-progress')
    view = await ctx.teamBattle.reviewArtifact({ ...product, artifactId: second.id, expectedRevision: second.revision, decision: 'rejected' })
    expect(view.tasks[0]).toMatchObject({ status: 'in_progress', ownerMemberId: 'engineering' })
  })

  it('queues files for the request member and requires an explicit matching connector acknowledgement', async () => {
    const { ctx } = await harness(new MemoryMediaPool(), simulationConfig)
    const file = (await ctx.teamBattle.publishFile({ ...engineering, ...fileRequest() })).files[0]!
    const queued = await ctx.teamBattle.sendFile({ ...quality, fileId: file.id, expectedRevision: file.revision })
    const delivery = queued.deliveries[0]!
    expect(delivery).toMatchObject({ memberId: 'quality', status: 'queued' })
    expect(ctx.teamBattle.pullDelivery({ memberId: TeamBattleMemberId('product') })).toEqual({})
    expect(ctx.teamBattle.pullDelivery({ memberId: TeamBattleMemberId('quality') }).content?.contentBase64).toBe(fileRequest().contentBase64)
    expect((await ctx.teamBattle.space()).deliveries[0]!.status).toBe('queued')
    await expect(ctx.teamBattle.acknowledgeDelivery({ memberId: TeamBattleMemberId('product'), deliveryId: delivery.id, outcome: 'delivered' })).rejects.toThrow('another member')
    await expect(ctx.teamBattle.acknowledgeDelivery({ memberId: TeamBattleMemberId('unknown'), deliveryId: delivery.id, outcome: 'delivered' })).rejects.toThrow('must exist')
    await ctx.teamBattle.acknowledgeDelivery({ memberId: TeamBattleMemberId('quality'), deliveryId: delivery.id, outcome: 'failed', note: 'No receiving Codex configured' })
    expect((await ctx.teamBattle.space()).deliveries[0]!.status).toBe('failed')
  })
})
