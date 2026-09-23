/** Strict dedicated-listener commands; authenticated identity is supplied outside JSON. */
import { z } from 'zod'
import { TeamBattleError } from './error.ts'
import { authenticatedMember, type InternalActorRequest } from './principal.ts'
import type { TeamBattleProject } from './project.ts'
import {
  TeamBattleArtifactId, TeamBattleDeliveryId, TeamBattleFileId, TeamBattleFolderId,
  TeamBattleMemberId, TeamBattleTaskId, TeamBattleWeaponId,
} from './types.ts'

const text = z.string()
const revision = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const positive = revision.min(1)
const memberId = text.min(1).transform(TeamBattleMemberId)
const fileId = text.min(1).transform(TeamBattleFileId)
const taskId = text.min(1).transform(TeamBattleTaskId)
const folderId = text.min(1).transform(TeamBattleFolderId)
const empty = z.object({}).strict()
const schemas = {
  view: empty,
  space: empty,
  readFile: z.object({ fileId }).strict(),
  createFolder: z.object({ name: text, parentId: folderId.optional() }).strict(),
  publishFile: z.object({
    name: text, parentId: folderId.optional(), mediaType: text, contentBase64: text, versionLabel: text, note: text, source: text,
  }).strict(),
  updateSpaceItem: z.object({ kind: z.enum(['folder', 'file']), id: text.min(1).transform(TeamBattleFileId), expectedRevision: revision, action: z.enum(['rename', 'delete']), name: text.optional() }).strict(),
  sendFile: z.object({ fileId, expectedRevision: revision }).strict(),
  submitFile: z.object({ fileId, taskId, expectedTaskRevision: revision }).strict(),
  createTask: z.object({ title: text, description: text, weight: positive }).strict(),
  updateTask: z.object({ taskId, expectedRevision: revision, action: z.enum(['claim', 'release', 'edit', 'submit', 'reopen', 'delete', 'handoff']), title: text.optional(), description: text.optional(), weight: positive.optional(), targetMemberId: memberId.optional(), note: text.optional() }).strict(),
  publishContext: z.object({
    summary: text, decisions: z.array(text).optional(), blockers: z.array(text).optional(),
    nextSteps: z.array(text).optional(), sourceRefs: z.array(text).optional(),
  }).strict(),
  publishArtifact: z.object({ taskId, name: text, mediaType: text, uri: text, sha256: text, bytes: revision }).strict(),
  reviewArtifact: z.object({ artifactId: text.min(1).transform(TeamBattleArtifactId), expectedRevision: revision, decision: z.enum(['accepted', 'rejected']), note: text.optional() }).strict(),
  consumeWeapon: z.object({ weaponId: text.min(1).transform(TeamBattleWeaponId) }).strict(),
  heartbeat: z.object({ status: z.enum(['online', 'idle', 'offline']) }).strict(),
  pullDelivery: empty,
  acknowledgeDelivery: z.object({ deliveryId: text.min(1).transform(TeamBattleDeliveryId), outcome: z.enum(['delivered', 'failed']), note: text.optional() }).strict(),
  ingest: z.object({ version: z.literal(1), type: z.literal('query'), eventId: text.min(1).max(512), occurredAt: revision }).strict(),
}

type Present<T> = { [K in keyof T]: Exclude<T[K], undefined> }

function parse<T>(schema: z.ZodType<T>, input: unknown): Present<T> {
  const result = schema.safeParse(input)
  if (!result.success) throw new TeamBattleError('invalid shared-team command fields', 'TEAM_BATTLE_REJECTED')
  return result.data as Present<T>
}

/** Execute a strictly parsed shared command as one verified member.
 * @param project - selected hosted project.
 * @param method - allowlisted team method.
 * @param input - untrusted JSON request, excluding identity.
 * @param actor - credential-authenticated member.
 * @param activeMember - reject a revoked or expired handoff recipient.
 * @returns the selected method result after any durable mutation.
 */
export async function executeSharedOperation(
  project: TeamBattleProject, method: string, input: unknown, actor: TeamBattleMemberId,
  activeMember: (memberId: TeamBattleMemberId) => void,
): Promise<unknown> {
  const principal: InternalActorRequest = { [authenticatedMember]: actor }
  switch (method) {
    case 'view': parse(schemas.view, input); return project.view(principal)
    case 'space': parse(schemas.space, input); return project.space(principal)
    case 'readFile': return project.readFile({ ...parse(schemas.readFile, input), ...principal })
    case 'createFolder': return project.createFolder({ ...parse(schemas.createFolder, input), ...principal })
    case 'publishFile': return project.publishFile({ ...parse(schemas.publishFile, input), ...principal })
    case 'updateSpaceItem': return project.updateSpaceItem({ ...parse(schemas.updateSpaceItem, input), ...principal })
    case 'sendFile': return project.sendFile({ ...parse(schemas.sendFile, input), ...principal })
    case 'submitFile': return project.submitFile({ ...parse(schemas.submitFile, input), ...principal })
    case 'createTask': return project.createTask({ ...parse(schemas.createTask, input), ...principal })
    case 'updateTask': {
      const request = parse(schemas.updateTask, input)
      if (request.action === 'handoff' && request.targetMemberId !== undefined) activeMember(request.targetMemberId)
      return project.updateTask({ ...request, ...principal })
    }
    case 'publishContext': return project.publishContext({ ...parse(schemas.publishContext, input), ...principal })
    case 'publishArtifact': return project.publishArtifact({ ...parse(schemas.publishArtifact, input), ...principal })
    case 'reviewArtifact': return project.reviewArtifact({ ...parse(schemas.reviewArtifact, input), ...principal })
    case 'consumeWeapon': return project.consumeWeapon({ ...parse(schemas.consumeWeapon, input), ...principal })
    case 'heartbeat': return project.heartbeat({ ...parse(schemas.heartbeat, input), ...principal })
    case 'pullDelivery': parse(schemas.pullDelivery, input); return project.pullDelivery({ memberId: actor })
    case 'acknowledgeDelivery': return project.acknowledgeDelivery({ ...parse(schemas.acknowledgeDelivery, input), memberId: actor })
    case 'ingest': return project.ingest({ ...parse(schemas.ingest, input), memberId: actor })
    default: throw new TeamBattleError('shared-team method is not allowed', 'TEAM_BATTLE_REJECTED')
  }
}
