/** Durable single-aggregate Team Battle schema and owned relationship checks. */

import { z } from 'zod'
import { defineDomain } from '@deepseek-ai/dsh-storage-domain'
import {
  TeamBattleActivityId,
  TeamBattleArtifactId,
  TeamBattleContextId,
  TeamBattleMemberId,
  TeamBattleProjectId,
  TeamBattleTaskId,
  TeamBattleWeaponId,
  type TeamBattleIngressEvent,
} from './types.ts'

const nonNegativeSafeInteger = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const positiveSafeInteger = nonNegativeSafeInteger.min(1)
const memberId = z.string().min(1).transform(TeamBattleMemberId)
const projectId = z.string().min(1).transform(TeamBattleProjectId)
const taskId = z.string().min(1).transform(TeamBattleTaskId)
const contextId = z.string().min(1).transform(TeamBattleContextId)
const artifactId = z.string().min(1).transform(TeamBattleArtifactId)
const weaponId = z.string().min(1).transform(TeamBattleWeaponId)
const activityId = z.string().min(1).transform(TeamBattleActivityId)

const member = z.object({
  id: memberId,
  name: z.string(),
  role: z.string(),
  color: z.string().optional(),
  status: z.enum(['online', 'idle', 'offline']),
  lastSeenAt: nonNegativeSafeInteger.optional(),
}).strict()

const task = z.object({
  id: taskId,
  revision: positiveSafeInteger,
  title: z.string(),
  description: z.string(),
  weight: positiveSafeInteger,
  status: z.enum(['open', 'in_progress', 'submitted', 'completed']),
  createdByMemberId: memberId,
  ownerMemberId: memberId.optional(),
  createdAt: nonNegativeSafeInteger,
  updatedAt: nonNegativeSafeInteger,
}).strict()

const context = z.object({
  id: contextId,
  summary: z.string(),
  decisions: z.array(z.string()),
  blockers: z.array(z.string()),
  nextSteps: z.array(z.string()),
  sourceRefs: z.array(z.string()),
  createdByMemberId: memberId,
  createdAt: nonNegativeSafeInteger,
}).strict()

const review = z.object({
  status: z.enum(['pending', 'accepted', 'rejected']),
  reviewedByMemberId: memberId.optional(),
  reviewedAt: nonNegativeSafeInteger.optional(),
  note: z.string().optional(),
}).strict()

const artifact = z.object({
  id: artifactId,
  revision: positiveSafeInteger,
  taskId,
  name: z.string(),
  mediaType: z.string(),
  uri: z.string(),
  sha256: z.string(),
  bytes: nonNegativeSafeInteger,
  createdByMemberId: memberId,
  createdAt: nonNegativeSafeInteger,
  review,
}).strict()

const activity = z.object({
  id: activityId,
  type: z.enum([
    'task_created',
    'task_updated',
    'context_published',
    'artifact_published',
    'artifact_reviewed',
    'weapon_granted',
    'weapon_consumed',
    'member_heartbeat',
  ]),
  memberId,
  createdAt: nonNegativeSafeInteger,
  taskId: taskId.optional(),
  artifactId: artifactId.optional(),
  weaponId: weaponId.optional(),
  eventId: z.string().optional(),
}).strict()

const weaponGrant = z.object({
  id: weaponId,
  eventId: z.string(),
  memberId,
  kind: z.literal('query'),
  shieldDamage: positiveSafeInteger,
  createdAt: nonNegativeSafeInteger,
  consumedAt: nonNegativeSafeInteger.optional(),
}).strict()

const capacities = z.object({
  maxMembers: positiveSafeInteger,
  maxTasks: positiveSafeInteger,
  maxContexts: positiveSafeInteger,
  maxArtifacts: positiveSafeInteger,
  maxActivity: positiveSafeInteger,
  maxProcessedEventIds: positiveSafeInteger,
  maxWeaponGrants: positiveSafeInteger,
}).strict()

const deployment = z.object({
  projectId,
  projectName: z.string(),
  projectGoal: z.string(),
  localMemberId: memberId,
  members: z.array(z.object({
    id: memberId,
    name: z.string(),
    role: z.string(),
    color: z.string().optional(),
  }).strict()),
  capacities,
  combatShieldMax: positiveSafeInteger,
  shieldDamagePerQuery: positiveSafeInteger,
  memberOfflineAfterMs: positiveSafeInteger,
}).strict()

/** Fully initialized durable Team Battle aggregate. */
export const teamBattleActiveStateSchema = z.object({
  version: z.literal(1),
  initialized: z.literal(true),
  revision: nonNegativeSafeInteger,
  deployment,
  members: z.array(member),
  tasks: z.array(task),
  contexts: z.array(context),
  artifacts: z.array(artifact),
  activity: z.array(activity),
  weaponGrants: z.array(weaponGrant),
  processedEventIds: z.array(z.string()),
  combatShield: nonNegativeSafeInteger,
}).strict()

/** Inferred durable aggregate type. */
export type TeamBattleActiveState = z.infer<typeof teamBattleActiveStateSchema>

/** First-open marker before deployment configuration initializes the aggregate. */
export const teamBattleUninitializedStateSchema = z.object({
  version: z.literal(1),
  initialized: z.literal(false),
}).strict()

/** Durable Team Battle global value. */
export const teamBattleStoredStateSchema = z.discriminatedUnion('initialized', [
  teamBattleUninitializedStateSchema,
  teamBattleActiveStateSchema,
])

/** Inferred stored state, including the first-open marker. */
export type TeamBattleStoredState = z.infer<typeof teamBattleStoredStateSchema>

/** Content-free connector event schema; strict parsing rejects Query text or other fields. */
export const teamBattleIngressEventSchema: z.ZodType<TeamBattleIngressEvent> = z.object({
  version: z.literal(1),
  type: z.literal('query'),
  eventId: z.string().min(1).max(512),
  memberId,
  occurredAt: nonNegativeSafeInteger,
}).strict()

/** Single-global-record storage domain for the invitation MVP. */
export const teamBattleDomainSpec = defineDomain({
  name: 'team_battle',
  version: 1,
  global: {
    schema: teamBattleStoredStateSchema,
    initial: { version: 1, initialized: false } as const,
  },
  tables: {},
})

/**
 * Validate all relationships owned by the aggregate.
 * @param state - candidate initialized aggregate.
 * @returns an invariant failure message, or undefined when valid.
 */
export function validateTeamBattleState(state: TeamBattleActiveState): string | undefined {
  const memberIds = new Set(state.members.map(value => value.id))
  if (memberIds.size !== state.members.length) return 'member ids must be unique'
  if (!memberIds.has(state.deployment.localMemberId)) return 'local member must exist in the roster'
  if (state.members.length > state.deployment.capacities.maxMembers) return 'member capacity exceeded'

  const taskIds = new Set(state.tasks.map(value => value.id))
  if (taskIds.size !== state.tasks.length) return 'task ids must be unique'
  if (state.tasks.length > state.deployment.capacities.maxTasks) return 'task capacity exceeded'
  for (const value of state.tasks) {
    if (!memberIds.has(value.createdByMemberId)) return `task '${value.id}' has an unknown creator`
    if (value.ownerMemberId !== undefined && !memberIds.has(value.ownerMemberId)) {
      return `task '${value.id}' has an unknown owner`
    }
  }

  if (new Set(state.contexts.map(value => value.id)).size !== state.contexts.length) {
    return 'Context ids must be unique'
  }
  if (state.contexts.length > state.deployment.capacities.maxContexts) return 'Context capacity exceeded'
  for (const value of state.contexts) {
    if (!memberIds.has(value.createdByMemberId)) return `Context '${value.id}' has an unknown creator`
  }

  const artifactIds = new Set(state.artifacts.map(value => value.id))
  if (artifactIds.size !== state.artifacts.length) return 'artifact ids must be unique'
  if (state.artifacts.length > state.deployment.capacities.maxArtifacts) return 'artifact capacity exceeded'
  const acceptedTasks = new Set<string>()
  for (const value of state.artifacts) {
    if (!taskIds.has(value.taskId)) return `artifact '${value.id}' has an unknown task`
    if (!memberIds.has(value.createdByMemberId)) return `artifact '${value.id}' has an unknown creator`
    if (value.review.status !== 'pending') {
      if (value.review.reviewedByMemberId === undefined || value.review.reviewedAt === undefined) {
        return `artifact '${value.id}' terminal review lacks reviewer metadata`
      }
      if (!memberIds.has(value.review.reviewedByMemberId)) return `artifact '${value.id}' has an unknown reviewer`
    }
    if (value.review.status === 'accepted') acceptedTasks.add(value.taskId)
  }
  for (const value of state.tasks) {
    if ((value.status === 'completed') !== acceptedTasks.has(value.id)) {
      return `task '${value.id}' completion must match an accepted artifact review`
    }
  }

  if (state.activity.length > state.deployment.capacities.maxActivity) return 'activity capacity exceeded'
  if (new Set(state.activity.map(value => value.id)).size !== state.activity.length) {
    return 'activity ids must be unique'
  }
  if (new Set(state.processedEventIds).size !== state.processedEventIds.length) {
    return 'processed connector event ids must be unique'
  }
  if (state.processedEventIds.length > state.deployment.capacities.maxProcessedEventIds) {
    return 'processed connector event capacity exceeded'
  }
  if (state.deployment.capacities.maxProcessedEventIds
    < state.deployment.capacities.maxWeaponGrants) {
    return 'processed connector event capacity must cover weapon capacity'
  }

  const weaponIds = new Set(state.weaponGrants.map(value => value.id))
  if (weaponIds.size !== state.weaponGrants.length) return 'weapon ids must be unique'
  if (state.weaponGrants.length > state.deployment.capacities.maxWeaponGrants) {
    return 'weapon capacity exceeded'
  }
  const weaponEvents = new Set<string>()
  for (const value of state.weaponGrants) {
    if (weaponEvents.has(value.eventId)) return `connector event '${value.eventId}' granted more than one weapon`
    weaponEvents.add(value.eventId)
    if (!state.processedEventIds.includes(value.eventId)) {
      return `weapon '${value.id}' lacks its processed connector event`
    }
    if (!memberIds.has(value.memberId)) return `weapon '${value.id}' has an unknown member`
  }
  if (state.combatShield > state.deployment.combatShieldMax) return 'combat shield exceeds its configured maximum'
  return undefined
}

/** Validated shared-server project response, excluding private storage and Session content. */
export const teamBattleViewSchema = z.object({
  simulationEnabled: z.boolean(), revision: nonNegativeSafeInteger, localMemberId: memberId,
  project: z.object({ id: projectId, name: z.string(), goal: z.string() }).strict(),
  members: z.array(member), tasks: z.array(task), contexts: z.array(context), artifacts: z.array(artifact),
  activity: z.array(activity), weaponGrants: z.array(weaponGrant),
  progress: z.object({ acceptedWeight: nonNegativeSafeInteger, totalWeight: nonNegativeSafeInteger, percent: nonNegativeSafeInteger,
    coreHp: nonNegativeSafeInteger, coreMaxHp: nonNegativeSafeInteger }).strict(),
  combatShield: z.object({ hp: nonNegativeSafeInteger, maxHp: positiveSafeInteger }).strict(),
}).strict()
