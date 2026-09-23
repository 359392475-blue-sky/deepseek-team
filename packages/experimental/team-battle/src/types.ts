/** Browser-safe Team Battle identities, requests, projections, and connector values. */

import type { Branded } from '@deepseek-ai/dsh-brand'
import type {} from '@deepseek-ai/dsh-typert-protocol'

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** The shared server refused authorization to create a team. */
    'team-battle/server-auth-required': { readonly httpStatus: 401 }
  }
}

/** Stable identity of the configured Team Battle project. */
export type TeamBattleProjectId = Branded<'TeamBattleProjectId'>

/**
 * Brand one validated project identity.
 * @param value - validated opaque project value.
 * @returns the branded project identity.
 */
export function TeamBattleProjectId(value: string): TeamBattleProjectId {
  return value as TeamBattleProjectId
}

/** Stable identity of one configured Team Battle member. */
export type TeamBattleMemberId = Branded<'TeamBattleMemberId'>

/**
 * Brand one validated member identity.
 * @param value - validated opaque member value.
 * @returns the branded member identity.
 */
export function TeamBattleMemberId(value: string): TeamBattleMemberId {
  return value as TeamBattleMemberId
}

/** Stable identity of one shared task. */
export type TeamBattleTaskId = Branded<'TeamBattleTaskId'>

/**
 * Brand one validated task identity.
 * @param value - validated opaque task value.
 * @returns the branded task identity.
 */
export function TeamBattleTaskId(value: string): TeamBattleTaskId {
  return value as TeamBattleTaskId
}

/** Stable identity of one published Context update. */
export type TeamBattleContextId = Branded<'TeamBattleContextId'>

/**
 * Brand one validated Context identity.
 * @param value - validated opaque Context value.
 * @returns the branded Context identity.
 */
export function TeamBattleContextId(value: string): TeamBattleContextId {
  return value as TeamBattleContextId
}

/** Stable identity of one immutable artifact metadata record. */
export type TeamBattleArtifactId = Branded<'TeamBattleArtifactId'>

/**
 * Brand one validated artifact identity.
 * @param value - validated opaque artifact value.
 * @returns the branded artifact identity.
 */
export function TeamBattleArtifactId(value: string): TeamBattleArtifactId {
  return value as TeamBattleArtifactId
}

/** Stable identity of one Query-derived weapon grant. */
export type TeamBattleWeaponId = Branded<'TeamBattleWeaponId'>

/**
 * Brand one validated weapon identity.
 * @param value - validated opaque weapon value.
 * @returns the branded weapon identity.
 */
export function TeamBattleWeaponId(value: string): TeamBattleWeaponId {
  return value as TeamBattleWeaponId
}

/** Stable identity of one retained activity item. */
export type TeamBattleActivityId = Branded<'TeamBattleActivityId'>

/**
 * Brand one validated activity identity.
 * @param value - validated opaque activity value.
 * @returns the branded activity identity.
 */
export function TeamBattleActivityId(value: string): TeamBattleActivityId {
  return value as TeamBattleActivityId
}

/** One member declared by deployment configuration. */
export interface TeamBattleMemberConfig {
  /** Stable member identity used by the local deployment and connector events. */
  readonly id: string
  /** Member display name in the shared roster. */
  readonly name: string
  /** Member role displayed beside the name. */
  readonly role: string
  /** Optional six-digit hexadecimal accent color, including the leading hash. */
  readonly color?: string
}

/** Live presence reported by a member heartbeat. */
export type TeamBattleMemberStatus = 'online' | 'idle' | 'offline'

/** Current member projection. */
export interface TeamBattleMemberView {
  readonly id: TeamBattleMemberId
  readonly name: string
  readonly role: string
  readonly color?: string
  readonly status: TeamBattleMemberStatus
  readonly lastSeenAt?: number
}

/** Durable task lifecycle. */
export type TeamBattleTaskStatus = 'open' | 'in_progress' | 'submitted' | 'completed'

/** Current shared task projection. */
export interface TeamBattleTaskView {
  readonly id: TeamBattleTaskId
  readonly revision: number
  readonly title: string
  readonly description: string
  readonly weight: number
  readonly status: TeamBattleTaskStatus
  readonly createdByMemberId: TeamBattleMemberId
  readonly ownerMemberId?: TeamBattleMemberId
  readonly createdAt: number
  readonly updatedAt: number
}

/** One immutable, user-published project Context update. */
export interface TeamBattleContextView {
  readonly id: TeamBattleContextId
  readonly summary: string
  readonly decisions: readonly string[]
  readonly blockers: readonly string[]
  readonly nextSteps: readonly string[]
  readonly sourceRefs: readonly string[]
  readonly createdByMemberId: TeamBattleMemberId
  readonly createdAt: number
}

/** Human review state of one artifact. */
export type TeamBattleArtifactReviewStatus = 'pending' | 'accepted' | 'rejected'

/** Review metadata retained beside an artifact. */
export interface TeamBattleArtifactReview {
  readonly status: TeamBattleArtifactReviewStatus
  readonly reviewedByMemberId?: TeamBattleMemberId
  readonly reviewedAt?: number
  readonly note?: string
}

/** Immutable artifact metadata plus its separately versioned review. */
export interface TeamBattleArtifactView {
  readonly id: TeamBattleArtifactId
  readonly revision: number
  readonly taskId: TeamBattleTaskId
  readonly name: string
  readonly mediaType: string
  readonly uri: string
  readonly sha256: string
  readonly bytes: number
  readonly createdByMemberId: TeamBattleMemberId
  readonly createdAt: number
  readonly review: TeamBattleArtifactReview
}

/** Retained activity kinds exposed to the Team Battle UI. */
export type TeamBattleActivityType =
  | 'task_created'
  | 'task_updated'
  | 'context_published'
  | 'artifact_published'
  | 'artifact_reviewed'
  | 'weapon_granted'
  | 'weapon_consumed'
  | 'member_heartbeat'

/** One bounded, content-safe project activity item. */
export interface TeamBattleActivityView {
  readonly id: TeamBattleActivityId
  readonly type: TeamBattleActivityType
  readonly memberId: TeamBattleMemberId
  readonly createdAt: number
  readonly taskId?: TeamBattleTaskId
  readonly artifactId?: TeamBattleArtifactId
  readonly weaponId?: TeamBattleWeaponId
  readonly eventId?: string
}

/** One weapon granted by a distinct human Query event. */
export interface TeamBattleWeaponGrantView {
  readonly id: TeamBattleWeaponId
  readonly eventId: string
  readonly memberId: TeamBattleMemberId
  readonly kind: 'query'
  readonly shieldDamage: number
  readonly createdAt: number
  readonly consumedAt?: number
}

/** Project-core progress derived only from task weights and accepted artifact reviews. */
export interface TeamBattleProgressView {
  readonly acceptedWeight: number
  readonly totalWeight: number
  readonly percent: number
  readonly coreHp: number
  readonly coreMaxHp: number
}

/** Current repeatable combat shield, independent of project progress. */
export interface TeamBattleCombatShieldView {
  readonly hp: number
  readonly maxHp: number
}

/** Request-local identity override, accepted only in explicit local collaboration simulation. */
export interface TeamBattleActorRequest {
  /** Selected shared team; omission addresses the preserved legacy space. */
  readonly teamId?: TeamBattleProjectId
  /** Known roster member; omission uses the configured local member. */
  readonly actingMemberId?: TeamBattleMemberId
}

/** Complete current Team Battle projection returned by every mutation. */
export interface TeamBattleView {
  /** Whether this host explicitly permits request-local simulated identities. */
  readonly simulationEnabled: boolean
  readonly revision: number
  readonly localMemberId: TeamBattleMemberId
  readonly project: {
    readonly id: TeamBattleProjectId
    readonly name: string
    readonly goal: string
  }
  readonly members: readonly TeamBattleMemberView[]
  readonly tasks: readonly TeamBattleTaskView[]
  readonly contexts: readonly TeamBattleContextView[]
  readonly artifacts: readonly TeamBattleArtifactView[]
  readonly activity: readonly TeamBattleActivityView[]
  readonly weaponGrants: readonly TeamBattleWeaponGrantView[]
  readonly progress: TeamBattleProgressView
  readonly combatShield: TeamBattleCombatShieldView
}

/** Input for one weighted shared task. */
export interface CreateTaskRequest extends TeamBattleActorRequest {
  readonly title: string
  readonly description: string
  readonly weight: number
}

/** Supported optimistic task transitions. */
export type UpdateTaskAction = 'claim' | 'release' | 'edit' | 'submit' | 'reopen' | 'delete' | 'handoff'

/** Compare-and-set task mutation made by the configured local member. */
export interface UpdateTaskRequest extends TeamBattleActorRequest {
  readonly taskId: TeamBattleTaskId
  readonly expectedRevision: number
  readonly action: UpdateTaskAction
  /** Active team member receiving an explicit handoff. */
  readonly targetMemberId?: TeamBattleMemberId
  /** Handoff explanation retained in the task description. */
  readonly note?: string
  readonly title?: string
  readonly description?: string
  readonly weight?: number
}

/** Input for one user-confirmed project Context update. */
export interface PublishContextRequest extends TeamBattleActorRequest {
  readonly summary: string
  readonly decisions?: readonly string[]
  readonly blockers?: readonly string[]
  readonly nextSteps?: readonly string[]
  readonly sourceRefs?: readonly string[]
}

/** Input for immutable artifact metadata linked to one task. */
export interface PublishArtifactRequest extends TeamBattleActorRequest {
  readonly taskId: TeamBattleTaskId
  readonly name: string
  readonly mediaType: string
  readonly uri: string
  readonly sha256: string
  readonly bytes: number
}

/** Input for the first terminal human review of one artifact. */
export interface ReviewArtifactRequest extends TeamBattleActorRequest {
  readonly artifactId: TeamBattleArtifactId
  readonly expectedRevision: number
  readonly decision: 'accepted' | 'rejected'
  readonly note?: string
}

/** Idempotent request to apply one available weapon to the combat shield. */
export interface ConsumeWeaponRequest extends TeamBattleActorRequest {
  readonly weaponId: TeamBattleWeaponId
}

/** Presence update for the configured local member. */
export interface HeartbeatRequest extends TeamBattleActorRequest {
  readonly status: TeamBattleMemberStatus
}

/** Content-free connector event representing one distinct human Query. */
export interface TeamBattleIngressEvent {
  readonly version: 1
  readonly type: 'query'
  readonly eventId: string
  readonly memberId: TeamBattleMemberId
  readonly occurredAt: number
}

/** Idempotent receipt returned to connector transports. */
export interface TeamBattleIngressReceipt {
  readonly eventId: string
  readonly duplicate: boolean
  readonly weaponId: TeamBattleWeaponId
}

/** Stable identity of one shared folder. */
export type TeamBattleFolderId = Branded<'TeamBattleFolderId'>

/** Brand a validated folder identity.
 * @param value - opaque folder value.
 * @returns branded folder identity.
 */
export function TeamBattleFolderId(value: string): TeamBattleFolderId {
  return value as TeamBattleFolderId
}

/** Stable identity of one durably uploaded file. */
export type TeamBattleFileId = Branded<'TeamBattleFileId'>

/** Brand a validated file identity.
 * @param value - opaque file value.
 * @returns branded file identity.
 */
export function TeamBattleFileId(value: string): TeamBattleFileId {
  return value as TeamBattleFileId
}

/** Stable identity of one member delivery request. */
export type TeamBattleDeliveryId = Branded<'TeamBattleDeliveryId'>

/** Brand a validated delivery identity.
 * @param value - opaque delivery value.
 * @returns branded delivery identity.
 */
export function TeamBattleDeliveryId(value: string): TeamBattleDeliveryId {
  return value as TeamBattleDeliveryId
}

/** Shared folder; omission of parentId places it at the project root. */
export interface TeamBattleFolderView {
  readonly id: TeamBattleFolderId
  readonly parentId?: TeamBattleFolderId
  readonly revision: number
  readonly name: string
  readonly createdByMemberId: TeamBattleMemberId
  readonly createdAt: number
  readonly updatedAt: number
}

/** File metadata; linked task review is projected from the task domain. */
export interface TeamBattleFileView {
  readonly id: TeamBattleFileId
  readonly parentId?: TeamBattleFolderId
  readonly revision: number
  readonly name: string
  readonly mediaType: string
  readonly bytes: number
  readonly sha256: string
  readonly versionLabel: string
  readonly note: string
  readonly source: string
  readonly createdByMemberId: TeamBattleMemberId
  readonly createdAt: number
  readonly updatedAt: number
  readonly artifactId?: TeamBattleArtifactId
  readonly taskId?: TeamBattleTaskId
  readonly review?: TeamBattleArtifactReview
}

/** Durable connector acknowledgement; queued never implies Codex receipt. */
export interface TeamBattleDeliveryView {
  readonly id: TeamBattleDeliveryId
  readonly fileId: TeamBattleFileId
  readonly fileRevision: number
  readonly memberId: TeamBattleMemberId
  readonly createdAt: number
  readonly status: 'queued' | 'delivered' | 'failed'
  readonly acknowledgedAt?: number
  readonly note?: string
}

/** Configured upload and retention ceilings. */
export interface TeamBattleSpaceLimits {
  readonly maxFileBytes: number
  readonly maxTotalFileBytes: number
  readonly maxItems: number
  readonly maxDeliveries: number
}

/** Detached shared-file metadata without file bytes. */
export interface TeamBattleSpaceView {
  readonly revision: number
  readonly folders: readonly TeamBattleFolderView[]
  readonly files: readonly TeamBattleFileView[]
  readonly deliveries: readonly TeamBattleDeliveryView[]
  readonly limits: TeamBattleSpaceLimits
}

/** Create a folder within the project or an existing folder. */
export interface CreateFolderRequest extends TeamBattleActorRequest {
  readonly name: string
  readonly parentId?: TeamBattleFolderId
}

/** Publish explicitly selected bytes; the server computes size and checksum. */
export interface PublishFileRequest extends TeamBattleActorRequest {
  readonly name: string
  readonly parentId?: TeamBattleFolderId
  readonly mediaType: string
  readonly contentBase64: string
  readonly versionLabel: string
  readonly note: string
  readonly source: string
}

/** Optimistic rename or safe deletion of a folder or file. */
export interface UpdateSpaceItemRequest extends TeamBattleActorRequest {
  readonly kind: 'folder' | 'file'
  readonly id: TeamBattleFolderId | TeamBattleFileId
  readonly expectedRevision: number
  readonly action: 'rename' | 'delete'
  readonly name?: string
}

/** Address one uploaded file. */
export interface ReadFileRequest extends TeamBattleActorRequest {
  readonly fileId: TeamBattleFileId
}

/** Actual persisted bytes and their current metadata. */
export interface TeamBattleFileContent {
  readonly file: TeamBattleFileView
  readonly contentBase64: string
}

/** Reuse an uploaded file as the owned task's reviewable artifact. */
export interface SubmitFileRequest extends TeamBattleActorRequest {
  readonly fileId: TeamBattleFileId
  readonly taskId: TeamBattleTaskId
  readonly expectedTaskRevision: number
}

/** Queue a file for the configured local member's authenticated connector. */
export interface SendFileRequest extends TeamBattleActorRequest {
  readonly fileId: TeamBattleFileId
  readonly expectedRevision: number
}

/** Authenticated connector member requesting its oldest queued file. */
export interface PullDeliveryRequest {
  readonly memberId: TeamBattleMemberId
}

/** Pulling a delivery is read-only and retryable until acknowledged. */
export interface TeamBattleDeliveryPull {
  readonly delivery?: TeamBattleDeliveryView
  readonly content?: TeamBattleFileContent
}

/** Connector attestation after handing bytes to its local Codex or failing. */
export interface AcknowledgeDeliveryRequest {
  readonly memberId: TeamBattleMemberId
  readonly deliveryId: TeamBattleDeliveryId
  readonly outcome: 'delivered' | 'failed'
  readonly note?: string
}

/** Independent collaboration listener state; origins never contain browser credentials. */
export interface TeamBattleHostingStatus {
  readonly running: boolean
  readonly host?: string
  readonly port?: number
  readonly origins: readonly string[]
}

/** One bounded transport request addressed to the dedicated collaboration listener. */
export interface TeamBattleNetworkRequest {
  readonly origin: string
  readonly path: 'join' | 'call' | 'create'
  readonly body: unknown
  readonly bearer?: string
}

/** Transport capability installed by the HTTP connector; local browser APIs remain private. */
export interface TeamBattleNetworkTransport {
  /**
   * Read listener addresses without starting it.
   * @returns current listener status.
   */
  status(): TeamBattleHostingStatus
  /**
   * Start the explicitly requested listener.
   * @param request - interface and port.
   * @returns bound addresses.
   */
  start(request: { readonly host: string; readonly port: number }): Promise<TeamBattleHostingStatus>
  /** Stop the shared listener and drain requests. */
  stop(): Promise<void>
  /**
   * Make one bounded request without retrying mutations.
   * @param request - exact route and payload.
   * @returns decoded response.
   */
  request(request: TeamBattleNetworkRequest): Promise<unknown>
}

/** Owner-visible invitation metadata; secret tokens are returned only at creation. */
export interface TeamBattleInviteView {
  readonly id: string
  readonly memberId: TeamBattleMemberId
  readonly memberName: string
  readonly memberRole: string
  readonly expiresAt: number
  readonly status: 'pending' | 'used' | 'revoked' | 'expired'
}

/** Membership status shared with authenticated teammates; revocation preserves attribution. */
export interface TeamBattleMemberAccessView {
  readonly memberId: TeamBattleMemberId
  readonly status: 'active' | 'revoked' | 'expired'
  /** Invited-member deadline, visible only to the owner; owner access has no deadline. */
  readonly expiresAt?: number
}

/** One local or joined team, with no shared credential or private Session information. */
export interface TeamBattleTeamSummary {
  readonly id: TeamBattleProjectId
  readonly name: string
  readonly goal: string
  readonly mode: 'hosted' | 'joined' | 'legacy'
  readonly localMemberId: TeamBattleMemberId
  readonly ownerMemberId: TeamBattleMemberId
  readonly storageLocation: string
  readonly hostUrl?: string
  readonly invites: readonly TeamBattleInviteView[]
  /** Fresh access states from summary(); cached joined directory entries omit them. */
  readonly memberAccess: readonly TeamBattleMemberAccessView[]
}

/** Spaces known on this device and the separate collaboration listener status. */
export interface TeamBattleDirectoryView {
  readonly teams: readonly TeamBattleTeamSummary[]
  readonly hosting: TeamBattleHostingStatus
}

/** Start a real single-owner team without simulated colleagues. */
export interface CreateTeamRequest {
  /** Shared server origin; omission creates a locally hosted space. */
  readonly serverUrl?: string
  /** Server deployment credential authorizing creation; never retained in team views. */
  readonly serverAccessToken?: string
  readonly name: string
  readonly goal: string
  readonly memberName: string
  readonly memberRole: string
}

/** Reserve a single member identity for one expiring invitation. */
export interface CreateTeamInviteRequest {
  readonly teamId: TeamBattleProjectId
  readonly memberName: string
  readonly memberRole: string
  readonly expiresInHours?: number
  readonly origin?: string
}

/** Copyable invitation returned once; storage retains only its token digest. */
export interface CreatedTeamInvite extends TeamBattleInviteView {
  readonly teamId: TeamBattleProjectId
  readonly token: string
  readonly inviteCode: string
}

/** Owner-only invitation revocation. */
export interface RevokeTeamInviteRequest {
  readonly teamId: TeamBattleProjectId
  readonly inviteId: string
}

/** Owner-only member revocation; historical records remain readable to active members. */
export interface RevokeTeamMemberRequest {
  readonly teamId: TeamBattleProjectId
  readonly memberId: TeamBattleMemberId
}

/** Join through a copied dsh-team invitation; private Session state is never sent. */
export interface JoinRemoteTeamRequest {
  readonly inviteCode: string
}

/** Wire invitation exchange binding one device-generated credential to the reserved member. */
export interface AcceptTeamInviteRequest {
  readonly teamId: TeamBattleProjectId
  readonly inviteToken: string
  readonly memberToken: string
}

/** Dedicated listener command; the token supplies member identity, never input fields. */
export interface AuthenticatedTeamRequest {
  readonly teamId: TeamBattleProjectId
  readonly memberToken: string
  readonly method: string
  readonly input: unknown
}

/** Server-side creation after the transport verifies deployment-level permission. */
export interface CreateHostedTeamRequest {
  readonly name: string
  readonly goal: string
  readonly memberName: string
  readonly memberRole: string
  readonly ownerMemberToken: string
}
