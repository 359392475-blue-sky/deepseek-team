/** Durable project state, shared files, and the generated Team Battle Remote namespace. */

import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import type { DomainGlobal } from '@deepseek-ai/dsh-storage-domain'
import type { Config } from './index.ts'
import { defaults } from './defaults.ts'
import { TeamBattleError } from './error.ts'
import { TeamBattleSpace } from './space.ts'
import { authenticatedMember, type InternalActorRequest } from './principal.ts'
import {
  teamBattleDomainSpec,
  teamBattleIngressEventSchema,
  validateTeamBattleState,
  type TeamBattleActiveState,
  type TeamBattleStoredState,
} from './spec.ts'
import {
  TeamBattleActivityId,
  TeamBattleArtifactId,
  TeamBattleContextId,
  TeamBattleMemberId,
  TeamBattleProjectId,
  TeamBattleTaskId,
  TeamBattleWeaponId,
  type AcknowledgeDeliveryRequest,
  type CreateFolderRequest,
  type PublishFileRequest,
  type PullDeliveryRequest,
  type ReadFileRequest,
  type SendFileRequest,
  type SubmitFileRequest,
  type TeamBattleDeliveryPull,
  type TeamBattleDeliveryView,
  type TeamBattleFileContent,
  type TeamBattleSpaceView,
  type UpdateSpaceItemRequest,
  type ConsumeWeaponRequest,
  type CreateTaskRequest,
  type HeartbeatRequest,
  type PublishArtifactRequest,
  type PublishContextRequest,
  type ReviewArtifactRequest,
  type TeamBattleActorRequest,
  type TeamBattleActivityType,
  type TeamBattleActivityView,
  type TeamBattleArtifactView,
  type TeamBattleIngressEvent,
  type TeamBattleIngressReceipt,
  type TeamBattleMemberConfig,
  type TeamBattleMemberId as TeamBattleMemberIdType,
  type TeamBattleMemberView,
  type TeamBattleProgressView,
  type TeamBattleProjectId as TeamBattleProjectIdType,
  type TeamBattleTaskView,
  type TeamBattleView,
  type TeamBattleWeaponGrantView,
  type UpdateTaskRequest,
} from './types.ts'

interface ResolvedConfig {
  readonly projectId: TeamBattleProjectIdType
  readonly projectName: string
  readonly projectGoal: string
  readonly localMemberId: TeamBattleMemberIdType
  readonly members: {
    readonly id: TeamBattleMemberIdType
    readonly name: string
    readonly role: string
    readonly color?: string
  }[]
  readonly capacities: {
    readonly maxMembers: number
    readonly maxTasks: number
    readonly maxContexts: number
    readonly maxArtifacts: number
    readonly maxActivity: number
    readonly maxProcessedEventIds: number
    readonly maxWeaponGrants: number
  }
  readonly combatShieldMax: number
  readonly shieldDamagePerQuery: number
  readonly memberOfflineAfterMs: number
}

interface MutationResult<T> {
  readonly next?: TeamBattleActiveState
  readonly value: T
}

type StoredActivity = TeamBattleActiveState['activity'][number]
type StoredArtifact = TeamBattleActiveState['artifacts'][number]
type StoredContext = TeamBattleActiveState['contexts'][number]
type StoredMember = TeamBattleActiveState['members'][number]
type StoredTask = TeamBattleActiveState['tasks'][number]
type StoredWeaponGrant = TeamBattleActiveState['weaponGrants'][number]

function trimmed(value: string, field: string, maxBytes: number): string {
  const result = value.trim()
  if (result === '') throw new TeamBattleError(`${field} must be non-empty`, 'TEAM_BATTLE_REJECTED')
  if (Buffer.byteLength(result) > maxBytes) {
    throw new TeamBattleError(`${field} exceeds ${maxBytes} UTF-8 bytes`, 'TEAM_BATTLE_REJECTED')
  }
  return result
}

function positive(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TeamBattleError(`${field} must be a positive safe integer`, 'TEAM_BATTLE_REJECTED')
  }
  return value
}

function nonNegative(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TeamBattleError(`${field} must be a non-negative safe integer`, 'TEAM_BATTLE_REJECTED')
  }
  return value
}

function assertNever(value: never): never {
  throw new TeamBattleError(`unsupported value ${String(value)}`, 'TEAM_BATTLE_REJECTED')
}

function textList(values: readonly string[] | undefined, field: string): string[] {
  const source = values ?? []
  if (source.length > 64) throw new TeamBattleError(`${field} exceeds 64 entries`, 'TEAM_BATTLE_REJECTED')
  return source.map((value, index) => trimmed(value, `${field}[${index}]`, 4096))
}

function memberColor(value: string, index: number): string {
  const color = value.trim().toLowerCase()
  if (!/^#[0-9a-f]{6}$/.test(color)) {
    throw new TeamBattleError(
      `members[${String(index)}].color must be a six-digit hexadecimal color`,
      'TEAM_BATTLE_CONFIG_INVALID',
    )
  }
  return color
}

function resolvedConfig(config: Config): ResolvedConfig {
  const members = config.members.map((member, index) => ({
    id: TeamBattleMemberId(trimmed(member.id, `members[${index}].id`, 128)),
    name: trimmed(member.name, `members[${index}].name`, 256),
    role: trimmed(member.role, `members[${index}].role`, 256),
    ...member.color === undefined ? {} : { color: memberColor(member.color, index) },
  }))
  const memberIds = new Set(members.map(member => member.id))
  if (memberIds.size !== members.length) {
    throw new TeamBattleError('members must have unique ids', 'TEAM_BATTLE_CONFIG_INVALID')
  }
  const localMemberId = TeamBattleMemberId(trimmed(config.localMemberId, 'localMemberId', 128))
  if (!memberIds.has(localMemberId)) {
    throw new TeamBattleError('localMemberId must name one configured member', 'TEAM_BATTLE_CONFIG_INVALID')
  }
  const capacities = {
    maxMembers: positive(config.maxMembers ?? defaults.max_members, 'maxMembers'),
    maxTasks: positive(config.maxTasks ?? defaults.max_tasks, 'maxTasks'),
    maxContexts: positive(config.maxContextEntries ?? defaults.max_contexts, 'maxContextEntries'),
    maxArtifacts: positive(config.maxArtifacts ?? defaults.max_artifacts, 'maxArtifacts'),
    maxActivity: positive(config.maxActivityEntries ?? defaults.max_activity, 'maxActivityEntries'),
    maxProcessedEventIds: positive(
      config.maxProcessedEventIds ?? defaults.max_processed_event_ids,
      'maxProcessedEventIds',
    ),
    maxWeaponGrants: positive(config.maxWeaponGrants ?? defaults.max_weapon_grants, 'maxWeaponGrants'),
  }
  if (members.length > capacities.maxMembers) {
    throw new TeamBattleError('configured members exceed maxMembers', 'TEAM_BATTLE_CONFIG_INVALID')
  }
  if (capacities.maxProcessedEventIds < capacities.maxWeaponGrants) {
    throw new TeamBattleError(
      'maxProcessedEventIds cannot be less than maxWeaponGrants',
      'TEAM_BATTLE_CONFIG_INVALID',
    )
  }
  const combatShieldMax = positive(config.combatShieldMax ?? defaults.combat_shield_max, 'combatShieldMax')
  const shieldDamagePerQuery = positive(
    config.shieldDamagePerQuery ?? defaults.query_shield_damage,
    'shieldDamagePerQuery',
  )
  if (shieldDamagePerQuery > combatShieldMax) {
    throw new TeamBattleError('shieldDamagePerQuery cannot exceed combatShieldMax', 'TEAM_BATTLE_CONFIG_INVALID')
  }
  return {
    projectId: TeamBattleProjectId(trimmed(config.projectId, 'projectId', 128)),
    projectName: trimmed(config.projectName, 'projectName', 512),
    projectGoal: trimmed(config.projectGoal, 'projectGoal', 16_384),
    localMemberId,
    members,
    capacities,
    combatShieldMax,
    shieldDamagePerQuery,
    memberOfflineAfterMs: positive(
      config.memberOfflineAfterMs ?? defaults.member_offline_after_ms,
      'memberOfflineAfterMs',
    ),
  }
}

function initialState(config: ResolvedConfig): TeamBattleActiveState {
  return {
    version: 1,
    initialized: true,
    revision: 0,
    deployment: config,
    members: config.members.map(member => ({ ...member, status: 'offline' as const })),
    tasks: [],
    contexts: [],
    artifacts: [],
    activity: [],
    weaponGrants: [],
    processedEventIds: [],
    combatShield: config.combatShieldMax,
  }
}

function deploymentsEqual(left: TeamBattleActiveState['deployment'], right: ResolvedConfig): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function appendActivity(
  state: TeamBattleActiveState,
  type: TeamBattleActivityType,
  memberId: TeamBattleMemberIdType,
  createdAt: number,
  related: Pick<TeamBattleActivityView, 'taskId' | 'artifactId' | 'weaponId' | 'eventId'> = {},
): StoredActivity[] {
  const next: StoredActivity = {
    id: TeamBattleActivityId(`activity-${randomUUID()}`),
    type,
    memberId,
    createdAt,
    ...related.taskId === undefined ? {} : { taskId: related.taskId },
    ...related.artifactId === undefined ? {} : { artifactId: related.artifactId },
    ...related.weaponId === undefined ? {} : { weaponId: related.weaponId },
    ...related.eventId === undefined ? {} : { eventId: related.eventId },
  }
  return [...state.activity, next].slice(-state.deployment.capacities.maxActivity)
}

function progressOf(state: TeamBattleActiveState): TeamBattleProgressView {
  const acceptedTaskIds = new Set(
    state.artifacts.filter(artifact => artifact.review.status === 'accepted').map(artifact => artifact.taskId),
  )
  const totalWeight = state.tasks.reduce((total, task) => total + task.weight, 0)
  const acceptedWeight = state.tasks.reduce(
    (total, task) => total + (acceptedTaskIds.has(task.id) ? task.weight : 0),
    0,
  )
  return {
    acceptedWeight,
    totalWeight,
    percent: totalWeight === 0 ? 0 : Math.round((acceptedWeight / totalWeight) * 100),
    coreHp: totalWeight - acceptedWeight,
    coreMaxHp: totalWeight,
  }
}

function projectedMemberStatus(
  member: StoredMember,
  state: TeamBattleActiveState,
  now: number,
): TeamBattleActiveState['members'][number]['status'] {
  if (member.status === 'offline') return 'offline'
  if (member.lastSeenAt === undefined || now - member.lastSeenAt > state.deployment.memberOfflineAfterMs) {
    return 'offline'
  }
  return member.status
}

function memberView(member: StoredMember, state: TeamBattleActiveState, now: number): TeamBattleMemberView {
  return {
    id: member.id,
    name: member.name,
    role: member.role,
    status: projectedMemberStatus(member, state, now),
    ...member.color === undefined ? {} : { color: member.color },
    ...member.lastSeenAt === undefined ? {} : { lastSeenAt: member.lastSeenAt },
  }
}

function taskView(task: StoredTask): TeamBattleTaskView {
  return {
    id: task.id,
    revision: task.revision,
    title: task.title,
    description: task.description,
    weight: task.weight,
    status: task.status,
    createdByMemberId: task.createdByMemberId,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    ...task.ownerMemberId === undefined ? {} : { ownerMemberId: task.ownerMemberId },
  }
}

function artifactView(artifact: StoredArtifact): TeamBattleArtifactView {
  return {
    id: artifact.id,
    revision: artifact.revision,
    taskId: artifact.taskId,
    name: artifact.name,
    mediaType: artifact.mediaType,
    uri: artifact.uri,
    sha256: artifact.sha256,
    bytes: artifact.bytes,
    createdByMemberId: artifact.createdByMemberId,
    createdAt: artifact.createdAt,
    review: {
      status: artifact.review.status,
      ...artifact.review.reviewedByMemberId === undefined
        ? {}
        : { reviewedByMemberId: artifact.review.reviewedByMemberId },
      ...artifact.review.reviewedAt === undefined ? {} : { reviewedAt: artifact.review.reviewedAt },
      ...artifact.review.note === undefined ? {} : { note: artifact.review.note },
    },
  }
}

function activityView(activity: StoredActivity): TeamBattleActivityView {
  return {
    id: activity.id,
    type: activity.type,
    memberId: activity.memberId,
    createdAt: activity.createdAt,
    ...activity.taskId === undefined ? {} : { taskId: activity.taskId },
    ...activity.artifactId === undefined ? {} : { artifactId: activity.artifactId },
    ...activity.weaponId === undefined ? {} : { weaponId: activity.weaponId },
    ...activity.eventId === undefined ? {} : { eventId: activity.eventId },
  }
}

function weaponGrantView(grant: StoredWeaponGrant): TeamBattleWeaponGrantView {
  return {
    id: grant.id,
    eventId: grant.eventId,
    memberId: grant.memberId,
    kind: grant.kind,
    shieldDamage: grant.shieldDamage,
    createdAt: grant.createdAt,
    ...grant.consumedAt === undefined ? {} : { consumedAt: grant.consumedAt },
  }
}

function viewOf(state: TeamBattleActiveState, actor: TeamBattleMemberIdType, simulationEnabled: boolean, now = Date.now()): TeamBattleView {
  return {
    revision: state.revision,
    localMemberId: actor,
    simulationEnabled,
    project: {
      id: state.deployment.projectId,
      name: state.deployment.projectName,
      goal: state.deployment.projectGoal,
    },
    members: state.members.map(member => memberView(member, state, now)),
    tasks: state.tasks.map(taskView),
    contexts: state.contexts.map(context => ({
      ...context,
      decisions: [...context.decisions],
      blockers: [...context.blockers],
      nextSteps: [...context.nextSteps],
      sourceRefs: [...context.sourceRefs],
    })),
    artifacts: state.artifacts.map(artifactView),
    activity: state.activity.map(activityView),
    weaponGrants: state.weaponGrants.map(weaponGrantView),
    progress: progressOf(state),
    combatShield: { hp: state.combatShield, maxHp: state.deployment.combatShieldMax },
  }
}

/** One independently serialized project, accessed through the private browser or member-authenticated facade. */
export class TeamBattleProject {
  private readonly config: ResolvedConfig
  private readonly simulationEnabled: boolean
  private readonly fileSpace: TeamBattleSpace
  private global?: DomainGlobal<TeamBattleStoredState>
  private operationTail: Promise<void> = Promise.resolve()
  private accepting = true

  /**
   * @param ctx - Host context with Typert and domain storage.
   * @param config - fixed invitation-MVP project, roster, limits, and combat tuning.
   */
  constructor(
    private readonly ctx: Context, config: Config,
    private readonly options: { readonly domainSuffix?: string; readonly beforeClose?: () => Promise<void> } = {},
  ) {
    this.config = resolvedConfig(config)
    this.simulationEnabled = config.allowSimulation ?? false
    this.fileSpace = new TeamBattleSpace(ctx, () => this.state(), operation => this.enqueue(operation), {
      maxFileBytes: positive(config.maxFileBytes ?? 2 * 1024 * 1024, 'maxFileBytes'),
      maxTotalFileBytes: positive(config.maxTotalFileBytes ?? 32 * 1024 * 1024, 'maxTotalFileBytes'),
      maxItems: positive(config.maxSpaceItems ?? 512, 'maxSpaceItems'),
      maxDeliveries: positive(config.maxDeliveries ?? 512, 'maxDeliveries'),
    }, () => this.closeAdmission(), request => this.actor(request), this.simulationEnabled || this.options.domainSuffix !== undefined)
  }

  /** Open or initialize the aggregate, then observe human Session prompts. */
  async open(): Promise<void> {
    const domain = await this.ctx.storageDomain.open({ ...teamBattleDomainSpec, name: this.options.domainSuffix === undefined ? teamBattleDomainSpec.name : `team_battle_${this.options.domainSuffix}` })
    this.ctx.effect(() => async () => {
      await this.closeAdmission()
      await domain.close()
    }, 'teamBattle.domainClose()')
    this.global = domain.global
    const stored = domain.global.get()
    if (!stored.initialized) {
      const initial = initialState(this.config)
      await domain.global.set(initial)
    } else {
      const failure = validateTeamBattleState(stored)
      if (failure !== undefined) throw new TeamBattleError(failure, 'TEAM_BATTLE_CORRUPT')
      const configured = this.options.domainSuffix === undefined
        ? stored.deployment : { ...stored.deployment, members: this.config.members }
      if (!deploymentsEqual(configured, this.config)) {
        throw new TeamBattleError(
          'persisted Team Battle deployment does not match current configuration',
          'TEAM_BATTLE_CONFIG_INVALID',
        )
      }
    }

    await this.fileSpace.open(this.options.domainSuffix === undefined ? undefined : `team_battle_space_${this.options.domainSuffix}`)

    if (this.options.domainSuffix === undefined) this.ctx.on('session/event', (session, event) => { this.observeSessionEvent(session, event) })
  }

  /**
   * Read the complete current project projection.
   * @param request - optional simulation identity; the configured member remains the default.
   * @returns a detached Team Battle view.
   */
  view(request?: TeamBattleActorRequest): TeamBattleView {
    return this.project(this.state(), this.actor(request))
  }

  /** Read shared-file metadata without file bytes.
   * @param request - optional simulation identity validated without changing other callers.
   * @returns current folder, file, and delivery projection.
   */
  space(request?: TeamBattleActorRequest): TeamBattleSpaceView {
    this.actor(request)
    return this.fileSpace.view()
  }

  /** Create a folder in the project space.
   * @param request - folder name and optional parent.
   * @returns committed file-space projection.
   */
  createFolder(request: CreateFolderRequest): Promise<TeamBattleSpaceView> {
    return this.fileSpace.createFolder(request)
  }

  /** Publish explicitly selected bytes into durable project storage.
   * @param request - bounded base64 bytes and file metadata.
   * @returns committed file-space projection.
   */
  publishFile(request: PublishFileRequest): Promise<TeamBattleSpaceView> {
    return this.fileSpace.publishFile(request)
  }

  /** Rename or safely delete one item using its current revision.
   * @param request - item identity, revision, and action.
   * @returns committed file-space projection.
   */
  updateSpaceItem(request: UpdateSpaceItemRequest): Promise<TeamBattleSpaceView> {
    return this.fileSpace.updateItem(request)
  }

  /** Read actual persisted file bytes.
   * @param request - uploaded file identity.
   * @returns metadata and canonical base64 bytes.
   */
  readFile(request: ReadFileRequest): TeamBattleFileContent {
    this.actor(request)
    return this.fileSpace.readFile(request)
  }

  /** Queue one file for the local member without claiming Codex receipt.
   * @param request - uploaded file identity and revision.
   * @returns committed file-space projection.
   */
  sendFile(request: SendFileRequest): Promise<TeamBattleSpaceView> {
    return this.fileSpace.sendFile(request)
  }

  /** Submit retained bytes to the existing task review workflow atomically.
   * @param request - file, locally owned task, and expected task revision.
   * @returns committed task-domain view.
   */
  submitFile(request: SubmitFileRequest): Promise<TeamBattleView> {
    return this.mutate((state) => {
      const actor = this.actor(request)
      const fields = this.fileSpace.artifactFields(request.fileId)
      const taskIndex = state.tasks.findIndex(value => value.id === request.taskId)
      const task = state.tasks[taskIndex]
      if (task === undefined) throw new TeamBattleError('task not found', 'TEAM_BATTLE_NOT_FOUND')
      this.assertOwner(task, actor)
      const existing = state.artifacts.find(value => value.uri === fields.uri)
      if (existing !== undefined) {
        if (existing.taskId !== request.taskId) throw new TeamBattleError('file is already linked to another task', 'TEAM_BATTLE_REJECTED')
        return { value: this.project(state, actor) }
      }
      if (task.revision !== request.expectedTaskRevision) throw new TeamBattleError('stale task revision', 'TEAM_BATTLE_CONFLICT')
      if (task.status !== 'in_progress' && task.status !== 'submitted') {
        throw new TeamBattleError('file task must be in progress or submitted', 'TEAM_BATTLE_REJECTED')
      }
      if (state.artifacts.length >= state.deployment.capacities.maxArtifacts) {
        throw new TeamBattleError('artifact capacity reached', 'TEAM_BATTLE_CAPACITY')
      }
      const now = Date.now()
      const artifact: StoredArtifact = {
        ...fields, id: TeamBattleArtifactId(`artifact-${randomUUID()}`), taskId: task.id, revision: 1,
        createdByMemberId: actor, createdAt: now, review: { status: 'pending' },
      }
      const next: TeamBattleActiveState = {
        ...state, revision: state.revision + 1, artifacts: [...state.artifacts, artifact],
        tasks: state.tasks.map(value => value.id === task.id
          ? { ...value, status: 'submitted', revision: value.revision + 1, updatedAt: now } : value),
        activity: appendActivity(state, 'artifact_published', actor, now, {
          taskId: task.id, artifactId: artifact.id,
        }),
      }
      return { next, value: this.project(next, actor) }
    })
  }

  /** Read the oldest queued file for an authenticated local-member connector.
   * @param request - connector member identity.
   * @returns at most one delivery and its actual file bytes; status stays queued.
   */
  pullDelivery(request: PullDeliveryRequest): TeamBattleDeliveryPull {
    return this.fileSpace.pull(request)
  }

  /** Record an authenticated connector's terminal receipt or failure.
   * @param request - delivery identity and connector-attested outcome.
   * @returns durable acknowledgement.
   */
  acknowledgeDelivery(request: AcknowledgeDeliveryRequest): Promise<TeamBattleDeliveryView> {
    return this.fileSpace.acknowledge(request)
  }

  /**
   * Create one weighted task owned by no member.
   * @param request - task text and positive project-core weight.
   * @returns the complete committed view.
   */
  createTask(request: CreateTaskRequest): Promise<TeamBattleView> {
    return this.mutate((state) => {
      const actor = this.actor(request)
      if (state.tasks.length >= state.deployment.capacities.maxTasks) {
        throw new TeamBattleError('task capacity reached', 'TEAM_BATTLE_CAPACITY')
      }
      const now = Date.now()
      const task: StoredTask = {
        id: TeamBattleTaskId(`task-${randomUUID()}`),
        revision: 1,
        title: trimmed(request.title, 'title', 512),
        description: trimmed(request.description, 'description', 16_384),
        weight: positive(request.weight, 'weight'),
        status: 'open',
        createdByMemberId: actor,
        createdAt: now,
        updatedAt: now,
      }
      const next: TeamBattleActiveState = {
        ...state,
        revision: state.revision + 1,
        tasks: [...state.tasks, task],
        activity: appendActivity(state, 'task_created', actor, now, { taskId: task.id }),
      }
      return { next, value: this.project(next, actor) }
    })
  }

  /**
   * Apply one compare-and-set task transition as the configured local member.
   * @param request - task identity, expected revision, action, and optional edit fields.
   * @returns the complete committed view.
   */
  updateTask(request: UpdateTaskRequest): Promise<TeamBattleView> {
    return this.mutate((state) => {
      const actor = this.actor(request)
      const index = state.tasks.findIndex(task => task.id === request.taskId)
      const current = state.tasks[index]
      if (current === undefined) throw new TeamBattleError('task not found', 'TEAM_BATTLE_NOT_FOUND')
      if (current.revision !== nonNegative(request.expectedRevision, 'expectedRevision')) {
        throw new TeamBattleError('stale task revision', 'TEAM_BATTLE_CONFLICT')
      }
      const now = Date.now()
      let nextTask: StoredTask
      switch (request.action) {
        case 'handoff': {
          if (actor !== state.deployment.localMemberId) this.assertOwner(current, actor)
          if (current.status === 'completed' || current.status === 'submitted') throw new TeamBattleError('only open or in-progress tasks can be handed off', 'TEAM_BATTLE_REJECTED')
          const target = request.targetMemberId
          if (target === undefined || !state.members.some(member => member.id === target)) throw new TeamBattleError('handoff requires a known team member', 'TEAM_BATTLE_REJECTED')
          nextTask = { ...current, ownerMemberId: target, status: 'in_progress', updatedAt: now,
            ...request.note === undefined ? {} : { description: `${current.description}\n\n${trimmed(request.note, 'note', 4096)}` },
          }
          break
        }
        case 'claim':
          if (current.status !== 'open' || current.ownerMemberId !== undefined) {
            throw new TeamBattleError('task is not available to claim', 'TEAM_BATTLE_REJECTED')
          }
          nextTask = { ...current, status: 'in_progress', ownerMemberId: actor, updatedAt: now }
          break
        case 'release':
          this.assertOwner(current, actor)
          if (current.status !== 'in_progress') {
            throw new TeamBattleError('only an in-progress task can be released', 'TEAM_BATTLE_REJECTED')
          }
          nextTask = this.withoutOwner({ ...current, status: 'open', updatedAt: now })
          break
        case 'edit':
          if (current.ownerMemberId !== undefined) this.assertOwner(current, actor)
          if (current.status === 'submitted' || current.status === 'completed') {
            throw new TeamBattleError('submitted or completed tasks cannot be edited', 'TEAM_BATTLE_REJECTED')
          }
          if (request.title === undefined && request.description === undefined && request.weight === undefined) {
            throw new TeamBattleError('edit requires title, description, or weight', 'TEAM_BATTLE_REJECTED')
          }
          nextTask = {
            ...current,
            ...request.title === undefined ? {} : { title: trimmed(request.title, 'title', 512) },
            ...request.description === undefined
              ? {}
              : { description: trimmed(request.description, 'description', 16_384) },
            ...request.weight === undefined ? {} : { weight: positive(request.weight, 'weight') },
            updatedAt: now,
          }
          break
        case 'submit':
          this.assertOwner(current, actor)
          if (current.status !== 'in_progress') {
            throw new TeamBattleError('only an in-progress task can be submitted', 'TEAM_BATTLE_REJECTED')
          }
          if (!state.artifacts.some(artifact => artifact.taskId === current.id && artifact.review.status === 'pending')) throw new TeamBattleError('submit requires a published artifact awaiting review', 'TEAM_BATTLE_REJECTED')
          nextTask = { ...current, status: 'submitted', updatedAt: now }
          break
        case 'reopen':
          this.assertOwner(current, actor)
          if (current.status !== 'submitted') {
            throw new TeamBattleError('only a submitted task can be reopened', 'TEAM_BATTLE_REJECTED')
          }
          nextTask = { ...current, status: 'in_progress', updatedAt: now }
          break
        case 'delete':
          if (current.ownerMemberId !== undefined) this.assertOwner(current, actor)
          if (state.artifacts.some(artifact => artifact.taskId === current.id)) {
            throw new TeamBattleError('tasks with artifacts cannot be deleted', 'TEAM_BATTLE_REJECTED')
          }
          {
            const next: TeamBattleActiveState = {
              ...state,
              revision: state.revision + 1,
              tasks: state.tasks.filter(task => task.id !== current.id),
              activity: appendActivity(state, 'task_updated', actor, now, { taskId: current.id }),
            }
            return { next, value: this.project(next, actor) }
          }
        default:
          return assertNever(request.action)
      }
      nextTask = { ...nextTask, revision: current.revision + 1 }
      const tasks = [...state.tasks]
      tasks[index] = nextTask
      const next: TeamBattleActiveState = {
        ...state,
        revision: state.revision + 1,
        tasks,
        activity: appendActivity(state, 'task_updated', actor, now, { taskId: current.id }),
      }
      return { next, value: this.project(next, actor) }
    })
  }

  /**
   * Publish one user-confirmed structured Context update.
   * @param request - summary, decisions, blockers, next steps, and source references.
   * @returns the complete committed view.
   */
  publishContext(request: PublishContextRequest): Promise<TeamBattleView> {
    return this.mutate((state) => {
      const actor = this.actor(request)
      if (state.contexts.length >= state.deployment.capacities.maxContexts) {
        throw new TeamBattleError('Context capacity reached', 'TEAM_BATTLE_CAPACITY')
      }
      const now = Date.now()
      const context: StoredContext = {
        id: TeamBattleContextId(`context-${randomUUID()}`),
        summary: trimmed(request.summary, 'summary', 16_384),
        decisions: textList(request.decisions, 'decisions'),
        blockers: textList(request.blockers, 'blockers'),
        nextSteps: textList(request.nextSteps, 'nextSteps'),
        sourceRefs: textList(request.sourceRefs, 'sourceRefs'),
        createdByMemberId: actor,
        createdAt: now,
      }
      const next: TeamBattleActiveState = {
        ...state,
        revision: state.revision + 1,
        contexts: [...state.contexts, context],
        activity: appendActivity(
          state,
          'context_published',
          actor,
          now,
        ),
      }
      return { next, value: this.project(next, actor) }
    })
  }

  /**
   * Publish immutable artifact metadata and move its claimed task to submitted.
   * @param request - task link, location, checksum, media type, and size.
   * @returns the complete committed view.
   */
  publishArtifact(request: PublishArtifactRequest): Promise<TeamBattleView> {
    return this.mutate((state) => {
      const actor = this.actor(request)
      if (state.artifacts.length >= state.deployment.capacities.maxArtifacts) {
        throw new TeamBattleError('artifact capacity reached', 'TEAM_BATTLE_CAPACITY')
      }
      const taskIndex = state.tasks.findIndex(task => task.id === request.taskId)
      const task = state.tasks[taskIndex]
      if (task === undefined) throw new TeamBattleError('artifact task not found', 'TEAM_BATTLE_NOT_FOUND')
      this.assertOwner(task, actor)
      if (task.status !== 'in_progress' && task.status !== 'submitted') {
        throw new TeamBattleError('artifact task must be in progress or submitted', 'TEAM_BATTLE_REJECTED')
      }
      if (request.uri.trim().startsWith('team-battle-file:')) {
        throw new TeamBattleError('uploaded files must use submitFile', 'TEAM_BATTLE_REJECTED')
      }
      const checksum = request.sha256.trim().toLowerCase()
      if (!/^[0-9a-f]{64}$/.test(checksum)) {
        throw new TeamBattleError('sha256 must be 64 lowercase hexadecimal characters', 'TEAM_BATTLE_REJECTED')
      }
      const now = Date.now()
      const artifact: StoredArtifact = {
        id: TeamBattleArtifactId(`artifact-${randomUUID()}`),
        revision: 1,
        taskId: task.id,
        name: trimmed(request.name, 'name', 512),
        mediaType: trimmed(request.mediaType, 'mediaType', 256),
        uri: trimmed(request.uri, 'uri', 8192),
        sha256: checksum,
        bytes: nonNegative(request.bytes, 'bytes'),
        createdByMemberId: actor,
        createdAt: now,
        review: { status: 'pending' },
      }
      const tasks = [...state.tasks]
      tasks[taskIndex] = {
        ...task,
        revision: task.revision + 1,
        status: 'submitted',
        updatedAt: now,
      }
      const next: TeamBattleActiveState = {
        ...state,
        revision: state.revision + 1,
        tasks,
        artifacts: [...state.artifacts, artifact],
        activity: appendActivity(state, 'artifact_published', actor, now, {
          taskId: task.id,
          artifactId: artifact.id,
        }),
      }
      return { next, value: this.project(next, actor) }
    })
  }

  /**
   * Record the first terminal artifact review; repeated identical decisions are idempotent.
   * @param request - artifact identity, expected revision, decision, and optional note.
   * @returns the complete committed or already-equivalent view.
   */
  reviewArtifact(request: ReviewArtifactRequest): Promise<TeamBattleView> {
    return this.mutate((state) => {
      const actor = this.actor(request)
      const artifactIndex = state.artifacts.findIndex(artifact => artifact.id === request.artifactId)
      const artifact = state.artifacts[artifactIndex]
      if (artifact === undefined) throw new TeamBattleError('artifact not found', 'TEAM_BATTLE_NOT_FOUND')
      if (artifact.createdByMemberId === actor) {
        throw new TeamBattleError('artifact authors cannot review their own work; choose another member', 'TEAM_BATTLE_REJECTED')
      }
      if (artifact.review.status === request.decision) return { value: this.project(state, actor) }
      if (artifact.review.status !== 'pending') {
        throw new TeamBattleError('artifact review is already terminal', 'TEAM_BATTLE_REJECTED')
      }
      if (artifact.revision !== nonNegative(request.expectedRevision, 'expectedRevision')) {
        throw new TeamBattleError('stale artifact revision', 'TEAM_BATTLE_CONFLICT')
      }
      const taskIndex = state.tasks.findIndex(task => task.id === artifact.taskId)
      const task = state.tasks[taskIndex]
      if (task === undefined) throw new TeamBattleError('artifact task not found', 'TEAM_BATTLE_CORRUPT')
      const now = Date.now()
      const reviewed: StoredArtifact = {
        ...artifact,
        revision: artifact.revision + 1,
        review: {
          status: request.decision,
          reviewedByMemberId: actor,
          reviewedAt: now,
          ...request.note === undefined ? {} : { note: trimmed(request.note, 'note', 4096) },
        },
      }
      const artifacts = [...state.artifacts]
      artifacts[artifactIndex] = reviewed
      const tasks = [...state.tasks]
      const taskArtifacts = artifacts.filter(candidate => candidate.taskId === task.id)
      const hasAcceptedArtifact = taskArtifacts.some(candidate => candidate.review.status === 'accepted')
      const hasPendingArtifact = taskArtifacts.some(candidate => candidate.review.status === 'pending')
      tasks[taskIndex] = {
        ...task,
        revision: task.revision + 1,
        status: hasAcceptedArtifact ? 'completed' : hasPendingArtifact ? 'submitted' : 'in_progress',
        updatedAt: now,
      }
      const next: TeamBattleActiveState = {
        ...state,
        revision: state.revision + 1,
        tasks,
        artifacts,
        activity: appendActivity(state, 'artifact_reviewed', actor, now, {
          taskId: task.id,
          artifactId: artifact.id,
        }),
      }
      return { next, value: this.project(next, actor) }
    })
  }

  /**
   * Consume one Query weapon exactly once against the repeatable combat shield.
   * @param request - weapon identity.
   * @returns the complete committed or already-consumed view.
   */
  consumeWeapon(request: ConsumeWeaponRequest): Promise<TeamBattleView> {
    return this.mutate((state) => {
      const actor = this.actor(request)
      const index = state.weaponGrants.findIndex(grant => grant.id === request.weaponId)
      const current = state.weaponGrants[index]
      if (current === undefined) throw new TeamBattleError('weapon not found', 'TEAM_BATTLE_NOT_FOUND')
      if (current.consumedAt !== undefined) return { value: this.project(state, actor) }
      const now = Date.now()
      const grants = [...state.weaponGrants]
      grants[index] = { ...current, consumedAt: now }
      const shieldBeforeHit = state.combatShield === 0
        ? state.deployment.combatShieldMax
        : state.combatShield
      const next: TeamBattleActiveState = {
        ...state,
        revision: state.revision + 1,
        weaponGrants: grants,
        combatShield: Math.max(0, shieldBeforeHit - current.shieldDamage),
        activity: appendActivity(state, 'weapon_consumed', current.memberId, now, {
          weaponId: current.id,
          eventId: current.eventId,
        }),
      }
      return { next, value: this.project(next, actor) }
    })
  }

  /**
   * Update the configured local member's presence.
   * @param request - current presence value.
   * @returns the complete committed view.
   */
  heartbeat(request: HeartbeatRequest): Promise<TeamBattleView> {
    return this.mutate((state) => {
      const actor = this.actor(request)
      const index = state.members.findIndex(member => member.id === actor)
      const current = state.members[index]
      if (current === undefined) throw new TeamBattleError('local member not found', 'TEAM_BATTLE_CORRUPT')
      const now = Date.now()
      const members = [...state.members]
      members[index] = { ...current, status: request.status, lastSeenAt: now }
      const activity = projectedMemberStatus(current, state, now) === request.status
        ? state.activity
        : appendActivity(state, 'member_heartbeat', current.id, now)
      const next: TeamBattleActiveState = {
        ...state,
        revision: state.revision + 1,
        members,
        activity,
      }
      return { next, value: this.project(next, actor) }
    })
  }

  /**
   * Admit one authenticated, content-free connector event with durable idempotency.
   * @param event - strict version-one Query signal containing no Query text.
   * @returns a stable receipt and exactly one weapon identity per event id.
   */
  async ingest(event: TeamBattleIngressEvent): Promise<TeamBattleIngressReceipt> {
    const parsed = teamBattleIngressEventSchema.parse(event)
    return this.mutate<TeamBattleIngressReceipt>((state) => {
      const member = state.members.find(candidate => candidate.id === parsed.memberId)
      if (member === undefined) throw new TeamBattleError('connector member not found', 'TEAM_BATTLE_REJECTED')
      if (state.processedEventIds.includes(parsed.eventId)) {
        const existing = state.weaponGrants.find(grant => grant.eventId === parsed.eventId)
        if (existing === undefined) {
          throw new TeamBattleError('processed Query lacks its weapon grant', 'TEAM_BATTLE_CORRUPT')
        }
        return {
          value: { eventId: parsed.eventId, duplicate: true, weaponId: existing.id },
        }
      }
      if (state.processedEventIds.length >= state.deployment.capacities.maxProcessedEventIds) {
        throw new TeamBattleError('processed connector event capacity reached', 'TEAM_BATTLE_CAPACITY')
      }
      if (state.weaponGrants.length >= state.deployment.capacities.maxWeaponGrants) {
        throw new TeamBattleError('weapon capacity reached', 'TEAM_BATTLE_CAPACITY')
      }
      const weapon: StoredWeaponGrant = {
        id: TeamBattleWeaponId(`weapon-${randomUUID()}`),
        eventId: parsed.eventId,
        memberId: parsed.memberId,
        kind: 'query',
        shieldDamage: state.deployment.shieldDamagePerQuery,
        createdAt: parsed.occurredAt,
      }
      const memberIndex = state.members.indexOf(member)
      const members = [...state.members]
      members[memberIndex] = { ...member, status: 'online', lastSeenAt: Date.now() }
      const next: TeamBattleActiveState = {
        ...state,
        revision: state.revision + 1,
        members,
        weaponGrants: [...state.weaponGrants, weapon],
        processedEventIds: [...state.processedEventIds, parsed.eventId],
        activity: appendActivity(state, 'weapon_granted', parsed.memberId, parsed.occurredAt, {
          weaponId: weapon.id,
          eventId: parsed.eventId,
        }),
      }
      return {
        next,
        value: { eventId: parsed.eventId, duplicate: false, weaponId: weapon.id },
      }
    })
  }

  /**
   * Add the identity reserved by an invitation.
   * @param member - reserved member identity.
   * @returns completion after durable roster insertion.
   */
  async addMember(member: TeamBattleMemberConfig): Promise<void> {
    await this.mutate((state) => {
      const existing = state.members.find(value => value.id === member.id)
      if (existing !== undefined) {
        if (existing.name !== member.name || existing.role !== member.role) throw new TeamBattleError('invitation member identity conflicts', 'TEAM_BATTLE_CONFLICT')
        return { value: undefined }
      }
      if (state.members.length >= state.deployment.capacities.maxMembers) throw new TeamBattleError('member capacity reached', 'TEAM_BATTLE_CAPACITY')
      const value = { ...member, id: TeamBattleMemberId(member.id) }
      return { next: { ...state, revision: state.revision + 1,
        deployment: { ...state.deployment, members: [...state.deployment.members, value] },
        members: [...state.members, { ...value, status: 'offline' as const }],
      }, value: undefined }
    })
  }

  private actor(request?: InternalActorRequest): TeamBattleMemberIdType {
    const authenticated = (request)?.[authenticatedMember]
    if (authenticated !== undefined) {
      if (!this.state().members.some(member => member.id === authenticated)) throw new TeamBattleError('unknown authenticated member', 'TEAM_BATTLE_REJECTED')
      return authenticated
    }
    if (request?.actingMemberId === undefined) return this.config.localMemberId
    if (!this.simulationEnabled) {
      throw new TeamBattleError('actingMemberId requires allowSimulation to be enabled', 'TEAM_BATTLE_REJECTED')
    }
    if (!this.config.members.some(member => member.id === request.actingMemberId)) {
      throw new TeamBattleError('actingMemberId must name a configured member', 'TEAM_BATTLE_REJECTED')
    }
    return request.actingMemberId
  }

  private project(state: TeamBattleActiveState, actor = this.config.localMemberId): TeamBattleView {
    return viewOf(state, actor, this.simulationEnabled)
  }

  private state(): TeamBattleActiveState {
    const stored = this.global?.get()
    if (stored === undefined || !stored.initialized) {
      throw new TeamBattleError('Team Battle is not initialized', 'TEAM_BATTLE_CORRUPT')
    }
    return stored
  }

  private mutate<T>(operation: (state: TeamBattleActiveState) => MutationResult<T>): Promise<T> {
    const global = this.global
    if (global === undefined) {
      return Promise.reject(new TeamBattleError('Team Battle is not initialized', 'TEAM_BATTLE_CORRUPT'))
    }
    const perform = async (): Promise<T> => {
      const result = operation(this.state())
      if (result.next === undefined) return result.value
      const failure = validateTeamBattleState(result.next)
      if (failure !== undefined) throw new TeamBattleError(failure, 'TEAM_BATTLE_CORRUPT')
      await global.set(result.next)
      try {
        this.ctx.emit('team-battle/changed', this.project(result.next))
      } catch (error: unknown) {
        this.ctx.logger.warn(`team-battle: changed listener failed after commit: ${String(error)}`)
      }
      return result.value
    }
    return this.enqueue(perform)
  }

  private async closeAdmission(): Promise<void> {
    await this.options.beforeClose?.()
    await this.drain()
  }

  private async drain(): Promise<void> {
    this.accepting = false
    await this.operationTail
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    if (!this.accepting) return Promise.reject(new TeamBattleError('Team Battle is closing', 'TEAM_BATTLE_REJECTED'))
    const run = this.operationTail.then(operation, operation)
    const tail = run.then(() => undefined, () => undefined)
    this.operationTail = tail
    return run
  }

  private assertOwner(task: StoredTask, memberId: TeamBattleMemberIdType): void {
    if (task.ownerMemberId !== memberId) {
      throw new TeamBattleError('task mutation requires the current owner', 'TEAM_BATTLE_REJECTED')
    }
  }

  private withoutOwner(task: StoredTask): StoredTask {
    return {
      id: task.id,
      revision: task.revision,
      title: task.title,
      description: task.description,
      weight: task.weight,
      status: task.status,
      createdByMemberId: task.createdByMemberId,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    }
  }

  private observeSessionEvent(session: Session, event: SessionEvent): void {
    if (event.type !== 'user/message' || event.data.source.kind !== 'user') return
    const ingress: TeamBattleIngressEvent = {
      version: 1,
      type: 'query',
      eventId: `${session.id}:${String(event.seq)}`,
      memberId: this.config.localMemberId,
      occurredAt: event.time,
    }
    void this.ingest(ingress).catch((error: unknown) => {
      this.ctx.logger.warn(`team-battle: Query event '${ingress.eventId}' was not admitted: ${String(error)}`)
    })
  }
}
