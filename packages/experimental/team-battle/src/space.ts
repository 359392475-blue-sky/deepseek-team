/** Independently versioned shared files and acknowledged connector deliveries. */

import { createHash, randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { defineDomain, type DomainGlobal } from '@deepseek-ai/dsh-storage-domain'
import { z } from 'zod'
import { TeamBattleError } from './error.ts'
import type { TeamBattleActiveState } from './spec.ts'
import {
  TeamBattleDeliveryId, TeamBattleFileId, TeamBattleFolderId, TeamBattleMemberId, TeamBattleProjectId,
  type AcknowledgeDeliveryRequest, type CreateFolderRequest, type PublishFileRequest, type TeamBattleActorRequest,
  type PullDeliveryRequest, type ReadFileRequest, type SendFileRequest,
  type TeamBattleDeliveryPull, type TeamBattleDeliveryView, type TeamBattleFileContent,
  type TeamBattleFileView, type TeamBattleSpaceLimits, type TeamBattleSpaceView, type UpdateSpaceItemRequest,
} from './types.ts'

const natural = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const positive = natural.min(1)
const folderId = z.string().min(1).transform(TeamBattleFolderId)
const fileId = z.string().min(1).transform(TeamBattleFileId)
const memberId = z.string().min(1).transform(TeamBattleMemberId)
const metadata = {
  parentId: folderId.optional(), revision: positive, name: z.string().min(1),
  createdByMemberId: memberId, createdAt: natural, updatedAt: natural,
}
const folderSchema = z.object({ ...metadata, id: folderId }).strict()
const fileSchema = z.object({
  ...metadata, id: fileId, mediaType: z.string().min(1), bytes: natural, sha256: z.string().regex(/^[a-f0-9]{64}$/),
  versionLabel: z.string().min(1), note: z.string(), source: z.string().min(1), contentBase64: z.string(),
}).strict()
const deliverySchema = z.object({
  id: z.string().min(1).transform(TeamBattleDeliveryId), fileId, fileRevision: positive, memberId,
  createdAt: natural, status: z.enum(['queued', 'delivered', 'failed']),
  acknowledgedAt: natural.optional(), note: z.string().optional(),
}).strict()
const limitsSchema = z.object({
  maxFileBytes: positive, maxTotalFileBytes: positive, maxItems: positive, maxDeliveries: positive,
}).strict()
const stateSchema = z.object({
  version: z.literal(1), initialized: z.literal(true),
  projectId: z.string().min(1).transform(TeamBattleProjectId), revision: natural,
  limits: limitsSchema, folders: z.array(folderSchema), files: z.array(fileSchema),
  deliveries: z.array(deliverySchema),
}).strict()
const storedSchema = z.discriminatedUnion('initialized', [
  z.object({ version: z.literal(1), initialized: z.literal(false) }).strict(), stateSchema,
])
type SpaceState = z.infer<typeof stateSchema>
type StoredSpace = z.infer<typeof storedSchema>
type StoredFile = SpaceState['files'][number]

const domainSpec = defineDomain({
  name: 'team_battle_space', version: 1,
  global: { schema: storedSchema, initial: { version: 1, initialized: false } as const }, tables: {},
})

/** Strict authenticated connector pull body. */
export const teamBattlePullDeliverySchema: z.ZodType<PullDeliveryRequest> = z.object({ memberId }).strict()

/** Strict authenticated connector terminal acknowledgement body. */
export const teamBattleAcknowledgeDeliverySchema: z.ZodType<AcknowledgeDeliveryRequest> = z.object({
  memberId, deliveryId: z.string().min(1).transform(TeamBattleDeliveryId),
  outcome: z.enum(['delivered', 'failed']), note: z.string().max(4096).optional(),
}).strict().transform(({ note, ...value }) => ({
  ...value, ...note === undefined ? {} : { note },
}))

function reject(message: string): never {
  throw new TeamBattleError(message, 'TEAM_BATTLE_REJECTED')
}

function text(value: string, field: string, max: number, empty = false): string {
  const result = value.trim()
  if ((!empty && result === '') || Buffer.byteLength(result) > max) reject(`${field} is empty or too long`)
  return result
}

function name(value: string): string {
  const result = text(value, 'name', 512)
  if (/[\u0000-\u001f/\\]/.test(result) || result === '.' || result === '..') reject('name contains path characters')
  return result
}

function decode(value: string, maxBytes: number): Buffer {
  if (value.length > Math.ceil(maxBytes / 3) * 4) reject('file exceeds maxFileBytes')
  if (value.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(value)) {
    reject('file content must be canonical base64')
  }
  const bytes = Buffer.from(value, 'base64')
  if (bytes.length > maxBytes) reject('file exceeds maxFileBytes')
  if (bytes.toString('base64') !== value) reject('file content must be canonical base64')
  return bytes
}

function checksum(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function uri(fileId: TeamBattleFileId): string {
  return `team-battle-file:${fileId}`
}

function deliveryView(delivery: SpaceState['deliveries'][number]): TeamBattleDeliveryView {
  const { acknowledgedAt, note, ...value } = delivery
  return { ...value, ...acknowledgedAt === undefined ? {} : { acknowledgedAt }, ...note === undefined ? {} : { note } }
}

/** File aggregate using the service's shared operation queue for cross-domain references. */
export class TeamBattleSpace {
  private global?: DomainGlobal<StoredSpace>

  /**
   * @param ctx - storage owner.
   * @param core - current durable task and roster aggregate.
   * @param serialize - shared lifecycle-aware project mutation queue.
   * @param limits - resolved upload and retention ceilings.
   * @param beforeClose - stop admission and drain project operations before closing storage.
   * @param actor - resolve and validate the request-local member.
   * @param allowSimulation - permit known connector members during local exercises.
   */
  constructor(
    private readonly ctx: Context,
    private readonly core: () => TeamBattleActiveState,
    private readonly serialize: <T>(operation: () => Promise<T>) => Promise<T>,
    private readonly limits: TeamBattleSpaceLimits,
    private readonly beforeClose: () => Promise<void>,
    private readonly actor: (request: TeamBattleActorRequest) => TeamBattleMemberId,
    private readonly allowSimulation: boolean,
  ) {}

  /**
   * Open the independent file domain without rewriting project state.
   * @param domainName - optional isolated hosted-team domain.
   */
  async open(domainName?: string): Promise<void> {
    const domain = await this.ctx.storageDomain.open({ ...domainSpec, name: domainName ?? domainSpec.name })
    this.ctx.effect(() => async () => {
      await this.beforeClose()
      await domain.close()
    }, 'teamBattle.spaceDomainClose()')
    this.global = domain.global
    const state = domain.global.get()
    if (!state.initialized) {
      await domain.global.set({
        version: 1, initialized: true, projectId: this.core().deployment.projectId, revision: 0,
        limits: this.limits, folders: [], files: [], deliveries: [],
      })
    } else {
      if (state.projectId !== this.core().deployment.projectId || JSON.stringify(state.limits) !== JSON.stringify(this.limits)) {
        throw new TeamBattleError('persisted file-space configuration differs', 'TEAM_BATTLE_CONFIG_INVALID')
      }
      this.validate(state)
    }
  }

  /** Read detached metadata without uploaded bytes.
   * @returns complete file-space projection.
   */
  view(): TeamBattleSpaceView {
    const state = this.state()
    return {
      revision: state.revision, limits: { ...state.limits }, folders: state.folders.map(({ parentId, ...value }) => ({
        ...value, ...parentId === undefined ? {} : { parentId },
      })),
      files: state.files.map(value => this.fileView(value)), deliveries: state.deliveries.map(deliveryView),
    }
  }

  /** Create a unique sibling folder.
   * @param request - name and optional parent.
   * @returns committed metadata.
   */
  createFolder(request: CreateFolderRequest): Promise<TeamBattleSpaceView> {
    return this.mutate((state) => {
      const actor = this.actor(request)
      this.assertCapacity(state)
      this.assertParent(state, request.parentId)
      const folderName = name(request.name)
      this.assertUniqueName(state, folderName, request.parentId)
      const now = Date.now()
      return { ...state, folders: [...state.folders, {
        id: TeamBattleFolderId(`folder-${randomUUID()}`), name: folderName, revision: 1,
        ...request.parentId === undefined ? {} : { parentId: request.parentId },
        createdByMemberId: actor, createdAt: now, updatedAt: now,
      }] }
    })
  }

  /** Store bounded actual bytes and server-computed integrity metadata.
   * @param request - explicitly published file bytes and descriptive metadata.
   * @returns committed metadata without bytes.
   */
  publishFile(request: PublishFileRequest): Promise<TeamBattleSpaceView> {
    return this.mutate((state) => {
      const actor = this.actor(request)
      this.assertCapacity(state)
      this.assertParent(state, request.parentId)
      const fileName = name(request.name)
      this.assertUniqueName(state, fileName, request.parentId)
      const bytes = decode(request.contentBase64, state.limits.maxFileBytes)
      if (state.files.reduce((total, value) => total + value.bytes, bytes.length) > state.limits.maxTotalFileBytes) {
        throw new TeamBattleError('total file storage capacity reached', 'TEAM_BATTLE_CAPACITY')
      }
      const mediaType = text(request.mediaType, 'mediaType', 256).toLowerCase()
      if (!/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(mediaType)) reject('mediaType must be a MIME type without parameters')
      const now = Date.now()
      return { ...state, files: [...state.files, {
        id: TeamBattleFileId(`file-${randomUUID()}`), name: fileName, revision: 1, mediaType,
        ...request.parentId === undefined ? {} : { parentId: request.parentId },
        bytes: bytes.length, sha256: checksum(bytes), contentBase64: request.contentBase64,
        versionLabel: text(request.versionLabel, 'versionLabel', 128), note: text(request.note, 'note', 4096, true),
        source: text(request.source, 'source', 512), createdByMemberId: actor,
        createdAt: now, updatedAt: now,
      }] }
    })
  }

  /** Rename or delete with revision and retained-reference checks.
   * @param request - item identity and optimistic action.
   * @returns committed metadata.
   */
  updateItem(request: UpdateSpaceItemRequest): Promise<TeamBattleSpaceView> {
    return this.mutate((state) => {
      this.actor(request)
      const current = (request.kind === 'folder' ? state.folders : state.files).find(value => value.id === request.id)
      if (current === undefined) throw new TeamBattleError('item not found', 'TEAM_BATTLE_NOT_FOUND')
      if (current.revision !== request.expectedRevision) throw new TeamBattleError('stale item revision', 'TEAM_BATTLE_CONFLICT')
      if (request.action === 'delete') {
        if (request.kind === 'folder') {
          if ([...state.folders, ...state.files].some(value => value.parentId === current.id)) reject('folder is not empty')
          return { ...state, folders: state.folders.filter(value => value.id !== current.id) }
        }
        if (state.deliveries.some(value => value.fileId === current.id)) reject('file has retained delivery records')
        if (this.core().artifacts.some(value => value.uri === uri(current.id as TeamBattleFileId))) reject('file is linked to task review')
        return { ...state, files: state.files.filter(value => value.id !== current.id) }
      }
      if (request.name === undefined) reject('rename requires name')
      const nextName = name(request.name)
      this.assertUniqueName(state, nextName, current.parentId, current.id)
      const renamed = { name: nextName, revision: current.revision + 1, updatedAt: Date.now() }
      return request.kind === 'folder'
        ? { ...state, folders: state.folders.map(value => value.id === current.id ? { ...value, ...renamed } : value) }
        : { ...state, files: state.files.map(value => value.id === current.id ? { ...value, ...renamed } : value) }
    })
  }

  /** Read one retained file; callers choose a safe renderer for its media type.
   * @param request - file identity.
   * @returns detached metadata and canonical base64 bytes.
   */
  readFile(request: ReadFileRequest): TeamBattleFileContent {
    const file = this.requireFile(request.fileId)
    return { file: this.fileView(file), contentBase64: file.contentBase64 }
  }

  /** Obtain immutable artifact fields inside the shared project operation queue.
   * @param fileId - file identity.
   * @returns artifact metadata backed by retained bytes.
   */
  artifactFields(fileId: TeamBattleFileId): { name: string; mediaType: string; uri: string; sha256: string; bytes: number } {
    const file = this.requireFile(fileId)
    return { name: file.name, mediaType: file.mediaType, uri: uri(file.id), sha256: file.sha256, bytes: file.bytes }
  }

  /** Persist a request for local Codex delivery without claiming receipt.
   * @param request - current file identity and revision.
   * @returns committed metadata with a queued delivery.
   */
  sendFile(request: SendFileRequest): Promise<TeamBattleSpaceView> {
    return this.mutate((state) => {
      const actor = this.actor(request)
      const file = this.requireFile(request.fileId)
      if (file.revision !== request.expectedRevision) throw new TeamBattleError('stale file revision', 'TEAM_BATTLE_CONFLICT')
      const memberId = actor
      if (state.deliveries.some(value => value.fileId === file.id && value.fileRevision === file.revision
        && value.memberId === memberId && value.status === 'queued')) return state
      if (state.deliveries.length >= state.limits.maxDeliveries) {
        throw new TeamBattleError('delivery capacity reached', 'TEAM_BATTLE_CAPACITY')
      }
      return { ...state, deliveries: [...state.deliveries, {
        id: TeamBattleDeliveryId(`delivery-${randomUUID()}`), fileId: file.id, fileRevision: file.revision,
        memberId, createdAt: Date.now(), status: 'queued' as const,
      }] }
    })
  }

  /** Pull the oldest pending local-member delivery without changing its status.
   * @param request - authenticated connector member.
   * @returns at most one queued delivery and its retained bytes.
   */
  pull(request: PullDeliveryRequest): TeamBattleDeliveryPull {
    this.assertLocalMember(request.memberId)
    const delivery = this.state().deliveries.find(value => value.memberId === request.memberId && value.status === 'queued')
    return delivery === undefined ? {} : { delivery: deliveryView(delivery), content: this.readFile({ fileId: delivery.fileId }) }
  }

  /** Commit the connector's terminal acknowledgement with idempotent retries.
   * @param request - same-member delivery and attested result.
   * @returns the retained acknowledgement.
   */
  async acknowledge(request: AcknowledgeDeliveryRequest): Promise<TeamBattleDeliveryView> {
    await this.mutate((state) => {
      this.assertLocalMember(request.memberId)
      const delivery = state.deliveries.find(value => value.id === request.deliveryId)
      if (delivery === undefined) throw new TeamBattleError('delivery not found', 'TEAM_BATTLE_NOT_FOUND')
      if (delivery.memberId !== request.memberId) reject('delivery belongs to another member')
      if (delivery.status === request.outcome) return state
      if (delivery.status !== 'queued') reject('delivery already has a terminal acknowledgement')
      return { ...state, deliveries: state.deliveries.map(value => value.id === delivery.id ? {
        ...value, status: request.outcome, acknowledgedAt: Date.now(),
        ...request.note === undefined ? {} : { note: text(request.note, 'note', 4096, true) },
      } : value) }
    })
    const committed = this.state().deliveries.find(value => value.id === request.deliveryId)
    if (committed === undefined) throw new TeamBattleError('committed delivery not found', 'TEAM_BATTLE_CORRUPT')
    return deliveryView(committed)
  }

  private state(): SpaceState {
    const state = this.global?.get()
    if (state === undefined || !state.initialized) throw new TeamBattleError('file space is not initialized', 'TEAM_BATTLE_CORRUPT')
    return state
  }

  private requireFile(id: TeamBattleFileId): StoredFile {
    const file = this.state().files.find(value => value.id === id)
    if (file === undefined) throw new TeamBattleError('file not found', 'TEAM_BATTLE_NOT_FOUND')
    return file
  }

  private fileView(file: StoredFile): TeamBattleFileView {
    const { contentBase64: _bytes, parentId, ...value } = file
    const metadata = { ...value, ...parentId === undefined ? {} : { parentId } }
    const artifact = this.core().artifacts.find(value => value.uri === uri(file.id))
    return artifact === undefined ? metadata : {
      ...metadata, artifactId: artifact.id, taskId: artifact.taskId, review: {
        status: artifact.review.status,
        ...artifact.review.reviewedByMemberId === undefined ? {} : { reviewedByMemberId: artifact.review.reviewedByMemberId },
        ...artifact.review.reviewedAt === undefined ? {} : { reviewedAt: artifact.review.reviewedAt },
        ...artifact.review.note === undefined ? {} : { note: artifact.review.note },
      },
    }
  }

  private mutate(operation: (state: SpaceState) => SpaceState): Promise<TeamBattleSpaceView> {
    const global = this.global
    if (global === undefined) return Promise.reject(new TeamBattleError('file space is not initialized', 'TEAM_BATTLE_CORRUPT'))
    return this.serialize(async () => {
      const state = this.state()
      const updated = operation(state)
      if (updated === state) return this.view()
      const next = { ...updated, revision: state.revision + 1 }
      this.validate(next)
      await global.set(next)
      return this.view()
    })
  }

  private assertCapacity(state: SpaceState): void {
    if (state.files.length + state.folders.length >= state.limits.maxItems) {
      throw new TeamBattleError('file-space item capacity reached', 'TEAM_BATTLE_CAPACITY')
    }
  }

  private assertParent(state: SpaceState, parentId: TeamBattleFolderId | undefined): void {
    if (parentId !== undefined && !state.folders.some(value => value.id === parentId)) {
      throw new TeamBattleError('parent folder not found', 'TEAM_BATTLE_NOT_FOUND')
    }
  }

  private assertUniqueName(state: SpaceState, value: string, parentId?: TeamBattleFolderId, excludeId?: string): void {
    if ([...state.folders, ...state.files].some(item => item.id !== excludeId && item.parentId === parentId && item.name === value)) {
      throw new TeamBattleError('an item with this name already exists in the folder', 'TEAM_BATTLE_CONFLICT')
    }
  }

  private assertLocalMember(memberId: TeamBattleMemberId): void {
    const core = this.core()
    if (!core.members.some(member => member.id === memberId)) reject('delivery connector member must exist')
    if (!this.allowSimulation && memberId !== core.deployment.localMemberId) reject('delivery connector must address the local member')
  }

  private validate(state: SpaceState): void {
    const members = new Set(this.core().members.map(value => value.id))
    const items = [...state.folders, ...state.files]
    if (new Set(items.map(value => value.id)).size !== items.length) reject('file-space item ids must be unique')
    if (items.length > state.limits.maxItems || state.deliveries.length > state.limits.maxDeliveries) reject('file-space capacity exceeded')
    let total = 0
    for (const item of items) {
      if (!members.has(item.createdByMemberId)) reject('file-space item has unknown creator')
      this.assertParent(state, item.parentId)
      this.assertUniqueName(state, item.name, item.parentId, item.id)
    }
    for (const folder of state.folders) {
      const seen = new Set<string>([folder.id])
      let parent = folder.parentId
      while (parent !== undefined) {
        if (seen.has(parent)) reject('folder ancestry contains a cycle')
        seen.add(parent)
        parent = state.folders.find(value => value.id === parent)?.parentId
      }
    }
    for (const file of state.files) {
      const bytes = decode(file.contentBase64, state.limits.maxFileBytes)
      if (bytes.length !== file.bytes || checksum(bytes) !== file.sha256) reject('stored file integrity check failed')
      total += bytes.length
    }
    if (total > state.limits.maxTotalFileBytes) reject('total file storage capacity exceeded')
    if (new Set(state.deliveries.map(value => value.id)).size !== state.deliveries.length) reject('delivery ids must be unique')
    for (const delivery of state.deliveries) {
      if (!members.has(delivery.memberId) || !state.files.some(value => value.id === delivery.fileId)) reject('delivery has unknown member or file')
      if ((delivery.status === 'queued') !== (delivery.acknowledgedAt === undefined)) reject('delivery status must match acknowledgement')
    }
  }
}

const projectedFileSchema = fileSchema.omit({ contentBase64: true }).extend({
  artifactId: z.string().min(1).optional(), taskId: z.string().min(1).optional(),
  review: z.object({ status: z.enum(['pending', 'accepted', 'rejected']), reviewedByMemberId: memberId.optional(), reviewedAt: natural.optional(), note: z.string().optional() }).strict().optional(),
})
/** Validate remote metadata without accepting embedded file bytes. */
export const teamBattleSpaceViewSchema = z.object({ revision: natural, limits: limitsSchema,
  folders: z.array(folderSchema), files: z.array(projectedFileSchema), deliveries: z.array(deliverySchema),
}).strict()
/** Validate remote file reads before the UI receives selected bytes. */
export const teamBattleFileContentSchema = z.object({
  file: projectedFileSchema, contentBase64: z.string(),
}).strict().superRefine((value, ctx) => {
  const decoded = Buffer.from(value.contentBase64, 'base64')
  if (decoded.toString('base64') !== value.contentBase64 || decoded.byteLength !== value.file.bytes || checksum(decoded) !== value.file.sha256) {
    ctx.addIssue({ code: 'custom', message: 'remote file bytes do not match their metadata' })
  }
})
