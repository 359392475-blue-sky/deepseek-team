/** Private browser Remote facade routing independently authenticated team spaces. */
import { Context, Service } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { TeamBattleDirectory } from './directory.ts'
import { TeamBattleProject } from './project.ts'
import { TeamWorkspaceLinks } from './workspace-links.ts'
import z from '@deepseek-ai/schemastery'
import { defaults } from './defaults.ts'
import type { BindTeamWorkspaceRequest, TeamBattleWorkspaceLink, AcceptTeamInviteRequest, AcknowledgeDeliveryRequest, AuthenticatedTeamRequest, ConsumeWeaponRequest, CreateFolderRequest, CreateHostedTeamRequest, CreateTaskRequest, CreateTeamInviteRequest, CreateTeamRequest, CreatedTeamInvite, HeartbeatRequest, JoinRemoteTeamRequest, PublishArtifactRequest, PublishContextRequest, PublishFileRequest, PullDeliveryRequest, ReadFileRequest, ReviewArtifactRequest, RevokeTeamInviteRequest, RevokeTeamMemberRequest, SendFileRequest, SubmitFileRequest, TeamBattleActorRequest, TeamBattleDeliveryPull, TeamBattleDeliveryView, TeamBattleDirectoryView, TeamBattleFileContent, TeamBattleHostingStatus, TeamBattleIngressEvent, TeamBattleIngressReceipt, TeamBattleNetworkTransport, TeamBattleMemberConfig, TeamBattleSpaceView, TeamBattleTeamSummary, TeamBattleView, UpdateSpaceItemRequest, UpdateTaskRequest } from './types.ts'

export * from './types.ts'
export { normalizeTeamServerUrl, validateTeamBindHost } from './network-url.ts'
export { TeamBattleError, TeamBattleNameConflictError, TeamBattleServerAuthError } from './error.ts'
export { teamBattleIngressEventSchema } from './spec.ts'
export { teamBattlePullDeliverySchema, teamBattleAcknowledgeDeliverySchema } from './space.ts'

/** Team Battle deployment configuration. */
export interface Config {
  /** Fixed shared server used for project creation and invitation admission on this local Host. */
  readonly sharedServer?: {
    /** HTTPS server base, or private HTTP address for local tests and deployments. */
    readonly url: string
    /** Host credential reference authorizing creation; never returned to the browser. */
    readonly accessTokenRef: string
  } | undefined
  /** Maximum hosted and joined teams retained on this device. */
  readonly maxTeams?: number
  /** Maximum retained invitations per hosted team. */
  readonly maxInvitesPerTeam?: number
  /** Absolute lifetime of invited member credentials; the owner does not expire. */
  readonly membershipLifetimeHours?: number
  /** Operator-supplied data location shown for locally hosted teams. */
  readonly storageLocation?: string
  /** Stable legacy project identity. */
  readonly projectId: string
  /** Fixed project display name. */
  readonly projectName: string
  /** Fixed project outcome statement. */
  readonly projectGoal: string
  /** Member identity used by browser Remote mutations and local Session events. */
  readonly localMemberId: string
  /** Allow request-local roster identities for loopback-only collaboration exercises. */
  readonly allowSimulation?: boolean
  /** Configured legacy project roster. */
  readonly members: TeamBattleMemberConfig[]
  /** Maximum configured members. */
  readonly maxMembers?: number
  /** Maximum bytes in one published file. */
  readonly maxFileBytes?: number
  /** Maximum total retained file bytes. */
  readonly maxTotalFileBytes?: number
  /** Maximum folders and files combined. */
  readonly maxSpaceItems?: number
  /** Maximum retained delivery records. */
  readonly maxDeliveries?: number
  /** Maximum retained tasks. */
  readonly maxTasks?: number
  /** Maximum retained Context updates. */
  readonly maxContextEntries?: number
  /** Maximum retained artifact records. */
  readonly maxArtifacts?: number
  /** Maximum retained activity rows; oldest rows are discarded after this bound. */
  readonly maxActivityEntries?: number
  /** Maximum retained exact-once connector event ids. */
  readonly maxProcessedEventIds?: number
  /** Maximum retained Query weapon grants. */
  readonly maxWeaponGrants?: number
  /** Maximum repeatable combat-shield hit points. */
  readonly combatShieldMax?: number
  /** Shield damage applied when one Query weapon is consumed. */
  readonly shieldDamagePerQuery?: number
  /** Presence age after which a non-offline member projects as offline. */
  readonly memberOfflineAfterMs?: number
}

/** Schemastery configuration parsed by Cordis before activation. */
export const Config: z<Config> = z.object({
  sharedServer: z.union([z.object({
    url: z.string().required(),
    accessTokenRef: z.string().role('credential-ref').required(),
  }), z.const(undefined)]),
  maxTeams: z.number().step(1).min(1).default(16),
  maxInvitesPerTeam: z.number().step(1).min(1).default(64),
  membershipLifetimeHours: z.number().step(1).min(1).default(720),
  storageLocation: z.string(),
  projectId: z.string().required(),
  projectName: z.string().required(),
  projectGoal: z.string().required(),
  localMemberId: z.string().required(),
  allowSimulation: z.boolean().default(false),
  members: z.array(z.object({
    id: z.string().required(),
    name: z.string().required(),
    role: z.string().required(),
    color: z.string(),
  })).min(1).required(),
  maxMembers: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(defaults.max_members),
  maxFileBytes: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(2 * 1024 * 1024),
  maxTotalFileBytes: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(32 * 1024 * 1024),
  maxSpaceItems: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(512),
  maxDeliveries: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(512),
  maxTasks: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(defaults.max_tasks),
  maxContextEntries: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(defaults.max_contexts),
  maxArtifacts: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(defaults.max_artifacts),
  maxActivityEntries: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(defaults.max_activity),
  maxProcessedEventIds: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER)
    .default(defaults.max_processed_event_ids),
  maxWeaponGrants: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(defaults.max_weapon_grants),
  combatShieldMax: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(defaults.combat_shield_max),
  shieldDamagePerQuery: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER)
    .default(defaults.query_shield_damage),
  memberOfflineAfterMs: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER)
    .default(defaults.member_offline_after_ms),
})

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Durable legacy, hosted, and joined team spaces. */
    teamBattle: TeamBattleService
  }
  interface Events {
    /**
     * A project mutation reached durable storage.
     * @param view - committed project projection.
     * @mode emit
     */
    'team-battle/changed'(view: TeamBattleView): void
  }
}

/** Team collaboration Remote namespace; shared member tokens never authorize private Host APIs. */
export class TeamBattleService extends TypertRemoteService {
  static inject = ['typert', 'storageDomain']
  static Config = Config
  private readonly legacy: TeamBattleProject
  private readonly directory: TeamBattleDirectory
  private readonly links: TeamWorkspaceLinks

  /**
   * @param ctx - plugin lifecycle and storage owner.
   * @param config - preserved legacy deployment and team limits.
   */
  constructor(ctx: Context, config: Config) {
    super(ctx, 'teamBattle')
    this.legacy = new TeamBattleProject(ctx, config)
    this.directory = new TeamBattleDirectory(ctx, config, this.legacy)
    this.links = new TeamWorkspaceLinks(ctx)
  }

  /** Open the preserved legacy records and separate multi-team directory. */
  protected async [Service.init](): Promise<void> { await this.legacy.open(); await this.directory.open(); await this.links.open() }

  /**
   * Register the dedicated connector.
   * @param transport - team-only transport provider.
   * @returns registration disposer.
   */
  registerNetworkTransport(transport: TeamBattleNetworkTransport): () => void { return this.directory.registerTransport(transport) }

  /**
   * List spaces without sharing private conversations or credentials.
   * @returns local directory.
   */
  @Remote('teams')
  teams(): Promise<TeamBattleDirectoryView> { return Promise.resolve(this.directory.teams()) }

  /**
   * Read explicitly selected local workspace associations without publishing them.
   * @returns team-to-workspace links on this device.
   */
  @Remote('workspaceLinks')
  workspaceLinks(): Promise<readonly TeamBattleWorkspaceLink[]> { return Promise.resolve(this.links.list()) }

  /**
   * Associate a registered local workspace with an accessible team; replace any prior association.
   * @param request - selected team and local workspace.
   * @returns durable device-local links without workspace paths or Session content.
   */
  @Remote('bindWorkspace')
  async bindWorkspace(request: BindTeamWorkspaceRequest): Promise<readonly TeamBattleWorkspaceLink[]> {
    await this.directory.summaryFor({ teamId: request.teamId })
    return this.links.bind(request)
  }

  /**
   * Read current member access states and owner-only invitation details.
   * @param request - selected team.
   * @returns authenticated team summary.
   */
  @Remote('summary')
  summary(request: TeamBattleActorRequest): Promise<TeamBattleTeamSummary> { return this.directory.summaryFor(request) }

  /**
   * Create an owner-only team using configured Host authorization when available.
   * @param request - project metadata; configured Hosts reject server overrides.
   * @returns created team.
   */
  @Remote('createTeam')
  createTeam(request: CreateTeamRequest): Promise<TeamBattleTeamSummary> { return this.directory.createTeam(request) }

  /**
   * Create one member-bound invitation.
   * @param request - selected team and invited identity.
   * @returns secret invitation shown once.
   */
  @Remote('createInvite')
  createInvite(request: CreateTeamInviteRequest): Promise<CreatedTeamInvite> { return this.directory.createInvite(request) }

  /**
   * Revoke an unused or retained invitation.
   * @param request - team and invitation.
   * @returns updated owner summary.
   */
  @Remote('revokeInvite')
  revokeInvite(request: RevokeTeamInviteRequest): Promise<TeamBattleTeamSummary> { return this.directory.revokeInvite(request) }

  /**
   * Revoke one member's access while retaining attribution.
   * @param request - team and member.
   * @returns updated owner summary.
   */
  @Remote('revokeMember')
  revokeMember(request: RevokeTeamMemberRequest): Promise<TeamBattleTeamSummary> { return this.directory.revokeMember(request) }

  /**
   * Open existing active access or join with an invitation; expired or revoked same-server membership can be replaced.
   * @param request - invitation code.
   * @returns the existing or newly joined team, without consuming an invitation for active access.
   */
  @Remote('joinRemote')
  joinRemote(request: JoinRemoteTeamRequest): Promise<TeamBattleTeamSummary> { return this.directory.joinRemote(request) }

  /**
   * Read the separate listener state.
   * @returns hosting status.
   */
  @Remote('networkStatus')
  networkStatus(): Promise<TeamBattleHostingStatus> { return Promise.resolve(this.directory.networkStatus()) }

  /**
   * Explicitly start the independent team listener.
   * @param request - network interface and port.
   * @returns bound addresses.
   */
  @Remote('startHosting')
  startHosting(request: { readonly host: string; readonly port: number }): Promise<TeamBattleHostingStatus> {
    return this.directory.startHosting(request)
  }

  /**
   * Stop the independent listener.
   * @returns stopped status.
   */
  @Remote('stopHosting')
  stopHosting(): Promise<TeamBattleHostingStatus> { return this.directory.stopHosting() }

  /**
   * Create server-owned state after connector deployment authorization.
   * @param request - initial owner and credential.
   * @returns created metadata.
   */
  createHostedTeam(request: CreateHostedTeamRequest): Promise<TeamBattleTeamSummary> { return this.directory.createHostedTeam(request) }

  /**
   * Bind a credential to the identity reserved by an invitation.
   * @param request - invitation exchange.
   * @returns joined member metadata.
   */
  acceptInvite(request: AcceptTeamInviteRequest): Promise<TeamBattleTeamSummary> { return this.directory.acceptInvite(request) }

  /**
   * Authorize and execute one dedicated-listener operation.
   * @param request - member credential and untrusted command.
   * @returns bounded team result.
   */
  dispatchAuthenticated(request: AuthenticatedTeamRequest): Promise<unknown> { return this.directory.dispatchAuthenticated(request) }

  /**
   * Execute view in the request's selected team.
   * @param request - team selector and operation fields.
   * @returns selected team result after durability.
   */
  @Remote('view')
  async view(request?: TeamBattleActorRequest): Promise<TeamBattleView> {
    if (this.directory.selected(request) !== undefined) return await this.directory.call('view', request ?? {}) as TeamBattleView
    return this.legacy.view(request)
  }

  /**
   * Execute space in the request's selected team.
   * @param request - team selector and operation fields.
   * @returns selected team result after durability.
   */
  @Remote('space')
  async space(request?: TeamBattleActorRequest): Promise<TeamBattleSpaceView> {
    if (this.directory.selected(request) !== undefined) return await this.directory.call('space', request ?? {}) as TeamBattleSpaceView
    return this.legacy.space(request)
  }

  /**
   * Execute createFolder in the request's selected team.
   * @param request - team selector and operation fields.
   * @returns selected team result after durability.
   */
  @Remote('createFolder')
  async createFolder(request: CreateFolderRequest): Promise<TeamBattleSpaceView> {
    if (this.directory.selected(request) !== undefined) return await this.directory.call('createFolder', request) as TeamBattleSpaceView
    return this.legacy.createFolder(request)
  }

  /**
   * Execute publishFile in the request's selected team.
   * @param request - team selector and operation fields.
   * @returns selected team result after durability.
   */
  @Remote('publishFile')
  async publishFile(request: PublishFileRequest): Promise<TeamBattleSpaceView> {
    if (this.directory.selected(request) !== undefined) return await this.directory.call('publishFile', request) as TeamBattleSpaceView
    return this.legacy.publishFile(request)
  }

  /**
   * Execute updateSpaceItem in the request's selected team.
   * @param request - team selector and operation fields.
   * @returns selected team result after durability.
   */
  @Remote('updateSpaceItem')
  async updateSpaceItem(request: UpdateSpaceItemRequest): Promise<TeamBattleSpaceView> {
    if (this.directory.selected(request) !== undefined) return await this.directory.call('updateSpaceItem', request) as TeamBattleSpaceView
    return this.legacy.updateSpaceItem(request)
  }

  /**
   * Execute readFile in the request's selected team.
   * @param request - team selector and operation fields.
   * @returns selected team result after durability.
   */
  @Remote('readFile')
  async readFile(request: ReadFileRequest): Promise<TeamBattleFileContent> {
    if (this.directory.selected(request) !== undefined) return await this.directory.call('readFile', request) as TeamBattleFileContent
    return this.legacy.readFile(request)
  }

  /**
   * Execute sendFile in the request's selected team.
   * @param request - team selector and operation fields.
   * @returns selected team result after durability.
   */
  @Remote('sendFile')
  async sendFile(request: SendFileRequest): Promise<TeamBattleSpaceView> {
    if (this.directory.selected(request) !== undefined) return await this.directory.call('sendFile', request) as TeamBattleSpaceView
    return this.legacy.sendFile(request)
  }

  /**
   * Execute submitFile in the request's selected team.
   * @param request - team selector and operation fields.
   * @returns selected team result after durability.
   */
  @Remote('submitFile')
  async submitFile(request: SubmitFileRequest): Promise<TeamBattleView> {
    if (this.directory.selected(request) !== undefined) return await this.directory.call('submitFile', request) as TeamBattleView
    return this.legacy.submitFile(request)
  }

  /**
   * Execute createTask in the request's selected team.
   * @param request - team selector and operation fields.
   * @returns selected team result after durability.
   */
  @Remote('createTask')
  async createTask(request: CreateTaskRequest): Promise<TeamBattleView> {
    if (this.directory.selected(request) !== undefined) return await this.directory.call('createTask', request) as TeamBattleView
    return this.legacy.createTask(request)
  }

  /**
   * Execute updateTask in the request's selected team.
   * @param request - team selector and operation fields.
   * @returns selected team result after durability.
   */
  @Remote('updateTask')
  async updateTask(request: UpdateTaskRequest): Promise<TeamBattleView> {
    if (this.directory.selected(request) !== undefined) return await this.directory.call('updateTask', request) as TeamBattleView
    return this.legacy.updateTask(request)
  }

  /**
   * Execute publishContext in the request's selected team.
   * @param request - team selector and operation fields.
   * @returns selected team result after durability.
   */
  @Remote('publishContext')
  async publishContext(request: PublishContextRequest): Promise<TeamBattleView> {
    if (this.directory.selected(request) !== undefined) return await this.directory.call('publishContext', request) as TeamBattleView
    return this.legacy.publishContext(request)
  }

  /**
   * Execute publishArtifact in the request's selected team.
   * @param request - team selector and operation fields.
   * @returns selected team result after durability.
   */
  @Remote('publishArtifact')
  async publishArtifact(request: PublishArtifactRequest): Promise<TeamBattleView> {
    if (this.directory.selected(request) !== undefined) return await this.directory.call('publishArtifact', request) as TeamBattleView
    return this.legacy.publishArtifact(request)
  }

  /**
   * Execute reviewArtifact in the request's selected team.
   * @param request - team selector and operation fields.
   * @returns selected team result after durability.
   */
  @Remote('reviewArtifact')
  async reviewArtifact(request: ReviewArtifactRequest): Promise<TeamBattleView> {
    if (this.directory.selected(request) !== undefined) return await this.directory.call('reviewArtifact', request) as TeamBattleView
    return this.legacy.reviewArtifact(request)
  }

  /**
   * Execute consumeWeapon in the request's selected team.
   * @param request - team selector and operation fields.
   * @returns selected team result after durability.
   */
  @Remote('consumeWeapon')
  async consumeWeapon(request: ConsumeWeaponRequest): Promise<TeamBattleView> {
    if (this.directory.selected(request) !== undefined) return await this.directory.call('consumeWeapon', request) as TeamBattleView
    return this.legacy.consumeWeapon(request)
  }

  /**
   * Execute heartbeat in the request's selected team.
   * @param request - team selector and operation fields.
   * @returns selected team result after durability.
   */
  @Remote('heartbeat')
  async heartbeat(request: HeartbeatRequest): Promise<TeamBattleView> {
    if (this.directory.selected(request) !== undefined) return await this.directory.call('heartbeat', request) as TeamBattleView
    return this.legacy.heartbeat(request)
  }

  /**
   * Admit a content-free local connector event to the legacy space.
   * @param event - strict Query identity.
   * @returns durable idempotent receipt.
   */
  ingest(event: TeamBattleIngressEvent): Promise<TeamBattleIngressReceipt> { return this.legacy.ingest(event) }

  /**
   * Read a legacy connector's pending delivery.
   * @param request - configured local member.
   * @returns oldest queued bytes.
   */
  pullDelivery(request: PullDeliveryRequest): TeamBattleDeliveryPull { return this.legacy.pullDelivery(request) }

  /**
   * Record a legacy connector receipt.
   * @param request - terminal delivery acknowledgement.
   * @returns durable delivery.
   */
  acknowledgeDelivery(request: AcknowledgeDeliveryRequest): Promise<TeamBattleDeliveryView> {
    return this.legacy.acknowledgeDelivery(request)
  }
}

export default TeamBattleService
