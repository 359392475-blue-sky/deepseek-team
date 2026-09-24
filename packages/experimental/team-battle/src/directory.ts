/** Hosted teams, member-bound invitation exchange, and private local connection records. */
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { credentialKey, credentialRef, type CredentialRef } from '@deepseek-ai/dsh-credentials'
import { defineDomain, type DomainGlobal } from '@deepseek-ai/dsh-storage-domain'
import { z } from 'zod'
import { TeamBattleError, TeamBattleServerAuthError } from './error.ts'
import { normalizeTeamServerUrl } from './network-url.ts'
import { parseTeamInvitation, teamInvitationLink } from './invitation.ts'
import { TeamBattleProject } from './project.ts'
import type { Config } from './index.ts'
import { executeSharedOperation } from './shared-operations.ts'
import { teamBattleViewSchema } from './spec.ts'
import { teamBattleSpaceViewSchema, teamBattleFileContentSchema } from './space.ts'
import {
  TeamBattleMemberId, TeamBattleProjectId,
  type AcceptTeamInviteRequest, type AuthenticatedTeamRequest, type CreatedTeamInvite,
  type CreateHostedTeamRequest, type CreateTeamInviteRequest, type CreateTeamRequest,
  type JoinRemoteTeamRequest, type RevokeTeamInviteRequest, type RevokeTeamMemberRequest,
  type TeamBattleActorRequest, type TeamBattleDirectoryView, type TeamBattleHostingStatus,
  type TeamBattleInviteView, type TeamBattleNetworkTransport, type TeamBattleTeamSummary,
} from './types.ts'

const id = z.string().min(1).max(128)
const memberId = id.transform(TeamBattleMemberId)
const teamId = id.transform(TeamBattleProjectId)
const timestamp = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const tokenHash = z.string().regex(/^[a-f0-9]{64}$/)
const membershipSchema = z.object({ memberId, tokenHash, expiresAt: timestamp, revoked: z.boolean() }).strict()
const inviteSchema = z.object({
  id, memberId, memberName: z.string(), memberRole: z.string(), tokenHash,
  expiresAt: timestamp, revoked: z.boolean(), consumedTokenHash: tokenHash.optional(),
}).strict()
const hostedSchema = z.object({
  id: teamId, name: z.string(), goal: z.string(), ownerMemberId: memberId,
  ownerName: z.string(), ownerRole: z.string(), domainSuffix: z.string().regex(/^[a-f0-9]{32}$/),
  createdAt: timestamp, invitations: z.array(inviteSchema), memberships: z.array(membershipSchema),
}).strict()
const joinedSchema = z.object({
  id: teamId, name: z.string(), goal: z.string(), localMemberId: memberId, ownerMemberId: memberId,
  origin: z.string(), credentialId: id,
}).strict()
const directorySchema = z.object({ version: z.literal(1), hosted: z.array(hostedSchema), joined: z.array(joinedSchema) }).strict()
  .superRefine((state, ctx) => {
    const unique = (values: readonly string[]): boolean => new Set(values).size === values.length
    const invalid = (): void => { ctx.addIssue({ code: 'custom', message: 'team directory identities are inconsistent' }) }
    if (!unique([...state.hosted, ...state.joined].map(team => team.id))
      || !unique(state.hosted.map(team => team.domainSuffix))) invalid()
    for (const team of state.hosted) {
      if (!team.memberships.some(member => member.memberId === team.ownerMemberId && !member.revoked)
        || !unique(team.memberships.map(member => member.memberId))
        || !unique(team.memberships.map(member => member.tokenHash))
        || !unique(team.invitations.map(invite => invite.id))
        || !unique(team.invitations.map(invite => invite.memberId))) invalid()
      for (const invite of team.invitations) {
        if (invite.consumedTokenHash !== undefined && !team.memberships.some(member =>
          member.memberId === invite.memberId && member.tokenHash === invite.consumedTokenHash)) invalid()
      }
    }
  })
type DirectoryState = z.infer<typeof directorySchema>
type HostedTeam = z.infer<typeof hostedSchema>
type JoinedTeam = z.infer<typeof joinedSchema>
type Invitation = z.infer<typeof inviteSchema>
const directorySpec = defineDomain({
  name: 'team_battle_directory', version: 1,
  global: { schema: directorySchema, initial: { version: 1 as const, hosted: [], joined: [] } }, tables: {},
})
const summarySchema = z.object({
  id: teamId, name: z.string(), goal: z.string(), mode: z.enum(['hosted', 'joined', 'legacy']),
  localMemberId: memberId, ownerMemberId: memberId, storageLocation: z.string(), hostUrl: z.string().optional(),
  invites: z.array(z.object({ id, memberId, memberName: z.string(), memberRole: z.string(), expiresAt: timestamp, status: z.enum(['pending', 'used', 'revoked', 'expired']) }).strict()),
  memberAccess: z.array(z.object({ memberId, status: z.enum(['active', 'revoked', 'expired']), expiresAt: timestamp.optional() }).strict()),
}).strict()
const createSchema = z.object({
  name: z.string().trim().min(1).max(256), goal: z.string().trim().min(1).max(4096),
  memberName: z.string().trim().min(1).max(128), memberRole: z.string().trim().min(1).max(128),
  ownerMemberToken: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/),
}).strict()
const inviteRequestSchema = z.object({
  memberName: z.string().trim().min(1).max(128), memberRole: z.string().trim().min(1).max(128),
  expiresInHours: z.number().int().min(1).max(168).optional(), origin: z.string().optional(),
}).strict()
const revokeInviteSchema = z.object({ inviteId: id }).strict()
const revokeMemberSchema = z.object({ memberId }).strict()
const emptySchema = z.object({}).strict()

function reject(message: string): never { throw new TeamBattleError(message, 'TEAM_BATTLE_REJECTED') }
function digest(token: string): string { return createHash('sha256').update(token).digest('hex') }
function matches(token: string, hash: string): boolean { return timingSafeEqual(Buffer.from(digest(token), 'hex'), Buffer.from(hash, 'hex')) }
function secret(): string { return randomBytes(32).toString('base64url') }
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success) reject('invalid team directory request or response')
  return result.data
}

function remoteSummary(value: unknown): TeamBattleTeamSummary {
  return parse(summarySchema, value) as TeamBattleTeamSummary
}

/** Single-writer directory coordinating membership revocation with accepted team operations. */
export class TeamBattleDirectory {
  private global?: DomainGlobal<DirectoryState>
  private readonly projects = new Map<TeamBattleProjectId, TeamBattleProject>()
  private tail: Promise<void> = Promise.resolve()
  private accepting = true
  private transport: TeamBattleNetworkTransport | undefined
  private readonly sharedServer: { readonly url: string; readonly accessTokenRef: CredentialRef } | undefined
  private readonly limits: { readonly teams: number; readonly invitations: number; readonly membershipHours: number }

  /**
   * @param ctx - lifecycle and storage owner.
   * @param config - local limits and legacy deployment.
   * @param legacy - preserved original project.
   */
  constructor(private readonly ctx: Context, private readonly config: Config, private readonly legacy: TeamBattleProject) {
    this.sharedServer = config.sharedServer === undefined ? undefined : {
      url: normalizeTeamServerUrl(config.sharedServer.url), accessTokenRef: credentialRef(config.sharedServer.accessTokenRef),
    }
    this.limits = { teams: config.maxTeams ?? 16, invitations: config.maxInvitesPerTeam ?? 64,
      membershipHours: config.membershipLifetimeHours ?? 720,
    }
    for (const [name, value] of Object.entries(this.limits)) {
      if (!Number.isSafeInteger(value) || value < 1 || (name === 'membershipHours' && value > 876_000)) {
        throw new TeamBattleError(`team directory ${name} must be a positive bounded integer`, 'TEAM_BATTLE_CONFIG_INVALID')
      }
    }
  }

  /** Open the new directory and hosted domains without altering legacy data. */
  async open(): Promise<void> {
    const domain = await this.ctx.storageDomain.open(directorySpec)
    this.global = domain.global
    this.ctx.effect(() => async () => { await this.drain(); await domain.close() }, 'teamBattle.directoryClose()')
    for (const team of domain.global.get().hosted) await this.openProject(team)
  }

  /**
   * Register one transport provider.
   * @param transport - dedicated team transport.
   * @returns registration disposer.
   */
  registerTransport(transport: TeamBattleNetworkTransport): () => void {
    if (this.transport !== undefined) reject('team network transport is already registered')
    this.transport = transport
    return () => { if (this.transport === transport) this.transport = undefined }
  }

  /**
   * Read the independent listener status.
   * @returns bound addresses, or stopped when absent.
   */
  networkStatus(): TeamBattleHostingStatus { return this.transport?.status() ?? { running: false, origins: [] } }

  /**
   * Explicitly start hosting.
   * @param request - interface and port.
   * @returns actual listener addresses.
   */
  startHosting(request: { readonly host: string; readonly port: number }): Promise<TeamBattleHostingStatus> {
    return this.network().start(request)
  }

  /**
   * Stop admitting remote collaborators.
   * @returns stopped listener status.
   */
  async stopHosting(): Promise<TeamBattleHostingStatus> { await this.network().stop(); return this.networkStatus() }

  /**
   * List local directory entries; no network request or credential is included.
   * @returns spaces and hosting addresses.
   */
  teams(): TeamBattleDirectoryView {
    const state = this.state()
    const legacy = this.legacy.view()
    return { hosting: this.networkStatus(), teams: [{
      id: legacy.project.id, name: legacy.project.name, goal: legacy.project.goal, mode: 'legacy',
      localMemberId: legacy.localMemberId, ownerMemberId: legacy.localMemberId,
      storageLocation: this.config.storageLocation ?? 'Local host: team_battle / team_battle_space storage domains',
      invites: [], memberAccess: [],
    }, ...state.hosted.map(team => this.summary(team, team.ownerMemberId)), ...state.joined.map(team => this.joinedSummary(team))] }
  }

  /**
   * Read fresh membership management details for the selected space.
   * @param request - team identity.
   * @returns current authenticated summary.
   */
  async summaryFor(request: TeamBattleActorRequest): Promise<TeamBattleTeamSummary> {
    const selected = this.selected(request)
    if (selected === undefined) {
      const legacy = this.teams().teams.find(team => team.mode === 'legacy')
      if (legacy === undefined) reject('legacy team is unavailable')
      return legacy
    }
    if (request.actingMemberId !== undefined) reject('real team spaces do not allow simulated identities')
    const joined = this.state().joined.find(team => team.id === selected)
    if (joined !== undefined) return this.asJoined(remoteSummary(await this.remote(joined, 'summary', {})), joined)
    return this.summary(this.hosted(selected), this.hosted(selected).ownerMemberId)
  }

  /**
   * Create with the configured Host credential, or an explicit operator destination when unconfigured.
   * @param request - team and owner metadata; fixed deployments reject server overrides.
   * @returns the created space.
   */
  async createTeam(request: CreateTeamRequest): Promise<TeamBattleTeamSummary> {
    const { serverUrl, serverAccessToken, ...fields } = request
    const ownerMemberToken = secret()
    const input = parse(createSchema, { ...fields, ownerMemberToken })
    const configured = this.sharedServer
    if (configured !== undefined && (serverUrl !== undefined || serverAccessToken !== undefined)) reject('configured team server cannot be overridden by a project request')
    const destination = configured?.url ?? serverUrl
    if (destination === undefined) {
      if (serverAccessToken !== undefined) reject('server access token requires an explicit server')
      return this.createHostedTeam(input)
    }
    const base = normalizeTeamServerUrl(destination)
    const accessToken = configured === undefined ? serverAccessToken
      : (await this.ctx.get('credentials')?.resolve(configured.accessTokenRef))?.value
    if (accessToken === undefined || accessToken.trim() === '') throw new TeamBattleServerAuthError()
    return this.serialize(async () => {
      const credentialId = `create-${digest(JSON.stringify([base, input.name, input.goal, input.memberName, input.memberRole]))}`
      if (!this.state().joined.some(team => team.credentialId === credentialId && team.origin === base)) this.assertCapacity()
      const retainedToken = await this.readCredential(credentialId) ?? ownerMemberToken
      await this.saveCredential(credentialId, retainedToken)
      const result = remoteSummary(await this.network().request({ origin: base, path: 'create', body: { ...input, ownerMemberToken: retainedToken }, bearer: accessToken }))
      return this.rememberConnection(result, base, credentialId)
    })
  }

  /**
   * Create server-owned data after the connector authorizes server creation.
   * @param request - owner metadata and device credential.
   * @returns created team metadata without the credential.
   */
  createHostedTeam(request: CreateHostedTeamRequest): Promise<TeamBattleTeamSummary> {
    const input = parse(createSchema, request)
    return this.serialize(async () => {
      const existing = this.state().hosted.find(team => team.memberships.some(member =>
        member.memberId === team.ownerMemberId && matches(input.ownerMemberToken, member.tokenHash)))
      if (existing !== undefined) {
        this.authenticate(existing, input.ownerMemberToken)
        if (existing.name !== input.name || existing.goal !== input.goal || existing.ownerName !== input.memberName || existing.ownerRole !== input.memberRole) reject('creation retry changes the original team')
        return this.summary(existing, existing.ownerMemberId)
      }
      this.assertCapacity()
      const suffix = randomUUID().replaceAll('-', '')
      const team: HostedTeam = {
        id: TeamBattleProjectId(`team-${randomUUID()}`), name: input.name, goal: input.goal,
        ownerMemberId: TeamBattleMemberId(`member-${randomUUID()}`), ownerName: input.memberName, ownerRole: input.memberRole,
        domainSuffix: suffix, createdAt: Date.now(), invitations: [], memberships: [],
      }
      team.memberships.push({
        memberId: team.ownerMemberId, tokenHash: digest(input.ownerMemberToken), expiresAt: this.membershipExpiry(), revoked: false,
      })
      await this.openProject(team)
      await this.save({ ...this.state(), hosted: [...this.state().hosted, team] })
      return this.summary(team, team.ownerMemberId)
    })
  }

  /**
   * Create one expiring identity-bound invitation.
   * @param request - team and invited member.
   * @returns a secret invitation shown once.
   */
  async createInvite(request: CreateTeamInviteRequest): Promise<CreatedTeamInvite> {
    const { teamId: selected, ...input } = request
    const result = await this.manage(selected, 'createInvite', input) as CreatedTeamInvite
    const invitation = parseTeamInvitation(result.inviteCode)
    const joined = this.state().joined.find(team => team.id === selected)
    if (invitation.teamId !== selected || (joined !== undefined && invitation.server !== joined.origin)) reject('server returned an invitation for another team or destination')
    return { ...result, inviteCode: teamInvitationLink(invitation) }
  }

  /**
   * Revoke an invitation without revoking an already joined member.
   * @param request - invitation identity.
   * @returns updated owner summary.
   */
  async revokeInvite(request: RevokeTeamInviteRequest): Promise<TeamBattleTeamSummary> {
    return this.manage(request.teamId, 'revokeInvite', { inviteId: request.inviteId }) as Promise<TeamBattleTeamSummary>
  }

  /**
   * Revoke every credential held by one member.
   * @param request - selected member.
   * @returns updated owner summary.
   */
  async revokeMember(request: RevokeTeamMemberRequest): Promise<TeamBattleTeamSummary> {
    return this.manage(request.teamId, 'revokeMember', { memberId: request.memberId }) as Promise<TeamBattleTeamSummary>
  }

  /**
   * Open an existing active membership, or join with a copied invitation after explicit access denial.
   * @param request - copied invitation link.
   * @returns live metadata for the existing or newly joined team; active membership leaves the invitation unused.
   */
  async joinRemote(request: JoinRemoteTeamRequest): Promise<TeamBattleTeamSummary> {
    const { server: base, teamId: selected, token: inviteToken } = parseTeamInvitation(request.inviteCode)
    if (this.sharedServer !== undefined && base !== this.sharedServer.url) reject('invitation belongs to a different configured team server')
    return this.serialize(async () => {
      const existing = this.state().joined.find(team => team.id === selected)
      if (existing === undefined) this.assertCapacity()
      else {
        if (existing.origin !== base) reject('an existing team cannot be replaced from a different server')
        try { return await this.remote(existing, 'summary', {}) as TeamBattleTeamSummary } catch (error) {
          if (!(error instanceof TeamBattleError) || error.code !== 'TEAM_BATTLE_ACCESS_DENIED') throw error
        }
        if (existing.localMemberId === existing.ownerMemberId) reject('the team owner cannot replace their membership with an invitation')
      }
      // A stable credential address makes a lost join response retry with the same device identity.
      const credentialId = `join-${digest(new URL(request.inviteCode.trim()).protocol === 'dsh-team:' ? request.inviteCode : this.legacyInviteCode(base, selected, inviteToken))}`
      const existingToken = await this.readCredential(credentialId)
      const memberToken = existingToken ?? secret()
      if (existingToken === undefined) await this.saveCredential(credentialId, memberToken)
      const result = remoteSummary(await this.network().request({ origin: base, path: 'join', body: { teamId: selected, inviteToken, memberToken } }))
      if (result.id !== selected) reject('joined server returned a different team')
      return this.rememberConnection(result, base, credentialId, existing)
    })
  }

  /**
   * Redeem a single-use invitation into its reserved identity.
   * @param request - invitation and device credential.
   * @returns the member projection, after durability.
   */
  acceptInvite(request: AcceptTeamInviteRequest): Promise<TeamBattleTeamSummary> {
    if (!/^[A-Za-z0-9_-]{43,128}$/.test(request.memberToken) || !/^[A-Za-z0-9_-]{43,128}$/.test(request.inviteToken)) reject('invalid invitation credentials')
    return this.serialize(async () => {
      const team = this.hosted(request.teamId)
      const invite = team.invitations.find(value => matches(request.inviteToken, value.tokenHash))
      if (invite === undefined || invite.revoked) reject('invitation is invalid or revoked')
      if (invite.consumedTokenHash !== undefined) {
        if (!matches(request.memberToken, invite.consumedTokenHash)) reject('invitation has already been used')
        this.authenticate(team, request.memberToken)
        return this.summary(team, invite.memberId)
      }
      if (invite.expiresAt <= Date.now()) reject('invitation has expired')
      if (team.memberships.some(value => matches(request.memberToken, value.tokenHash))) reject('member credential is already bound to another identity')
      await this.project(team.id).addMember({ id: invite.memberId, name: invite.memberName, role: invite.memberRole })
      const next: HostedTeam = { ...team,
        invitations: team.invitations.map(value =>
          value.id === invite.id ? { ...value, consumedTokenHash: digest(request.memberToken) } : value),
        memberships: [...team.memberships, {
          memberId: invite.memberId, tokenHash: digest(request.memberToken), expiresAt: this.membershipExpiry(), revoked: false,
        }],
      }
      await this.saveHosted(next)
      return this.summary(next, invite.memberId)
    })
  }

  /**
   * Authenticate one dedicated-listener operation without accepting identity overrides.
   * @param request - token and untrusted team command.
   * @returns the command result.
   */
  dispatchAuthenticated(request: AuthenticatedTeamRequest): Promise<unknown> {
    return this.serialize(async () => {
      const team = this.hosted(request.teamId)
      const actor = this.authenticate(team, request.memberToken)
      return this.execute(team, actor, request.method, request.input)
    })
  }

  /**
   * Route an already authenticated local browser request by team, without global selection.
   * @param method - project operation.
   * @param request - request-local selected team.
   * @returns selected project result.
   */
  async call(method: string, request: TeamBattleActorRequest): Promise<unknown> {
    const selected = this.selected(request)
    if (selected === undefined) reject('legacy operations are owned by the service facade')
    if (request.actingMemberId !== undefined) reject('real team spaces do not allow simulated identities')
    const { teamId: _teamId, actingMemberId: _actingMemberId, ...input } = request
    const joined = this.state().joined.find(team => team.id === selected)
    if (joined !== undefined) return this.remote(joined, method, input)
    return this.serialize(async () => {
      const team = this.hosted(selected)
      return this.execute(team, team.ownerMemberId, method, input)
    })
  }

  /**
   * Distinguish the preserved legacy space from hosted and joined identifiers.
   * @param request - optional team selector.
   * @returns selected non-legacy identity, or undefined.
   */
  selected(request?: TeamBattleActorRequest): TeamBattleProjectId | undefined {
    return request?.teamId === undefined || request.teamId === this.legacy.view().project.id ? undefined : request.teamId
  }

  private async execute(team: HostedTeam, actor: TeamBattleMemberId, method: string, input: unknown): Promise<unknown> {
    switch (method) {
      case 'sendFile': reject('shared-team files must be downloaded to this device; local Codex delivery is not configured')
      case 'summary': parse(emptySchema, input); return this.summary(team, actor)
      case 'createInvite': {
        this.assertOwner(team, actor)
        const fields = parse(inviteRequestSchema, input)
        if (team.invitations.length >= this.limits.invitations) reject('team invitation capacity reached')
        const chosenOrigin = fields.origin ?? this.networkStatus().origins[0]
        if (chosenOrigin === undefined) reject('start team hosting or supply the shared server URL before creating an invitation')
        const base = normalizeTeamServerUrl(chosenOrigin)
        const token = secret()
        const invite: Invitation = { id: `invite-${randomUUID()}`, memberId: TeamBattleMemberId(`member-${randomUUID()}`),
          memberName: fields.memberName, memberRole: fields.memberRole, tokenHash: digest(token),
          expiresAt: Date.now() + (fields.expiresInHours ?? 24) * 3_600_000, revoked: false,
        }
        await this.saveHosted({ ...team, invitations: [...team.invitations, invite] })
        return { ...this.inviteView(invite), teamId: team.id, token,
          inviteCode: teamInvitationLink({ server: base, teamId: team.id, token }) }
      }
      case 'revokeInvite': {
        this.assertOwner(team, actor)
        const fields = parse(revokeInviteSchema, input)
        if (!team.invitations.some(value => value.id === fields.inviteId)) reject('invitation not found')
        const next = { ...team,
          invitations: team.invitations.map(value => value.id === fields.inviteId ? { ...value, revoked: true } : value) }
        await this.saveHosted(next)
        return this.summary(next, actor)
      }
      case 'revokeMember': {
        this.assertOwner(team, actor)
        const fields = parse(revokeMemberSchema, input)
        if (fields.memberId === team.ownerMemberId) reject('the team owner cannot revoke their own membership')
        if (!team.memberships.some(value => value.memberId === fields.memberId)) reject('member not found')
        const next = { ...team,
          memberships: team.memberships.map(value => value.memberId === fields.memberId ? { ...value, revoked: true } : value) }
        await this.saveHosted(next)
        return this.summary(next, actor)
      }
      default: return executeSharedOperation(this.project(team.id), method, input, actor, (target) => {
        this.assertActiveMember(team, target)
      })
    }
  }

  private legacyInviteCode(server: string, teamId: TeamBattleProjectId, token: string): string {
    const code = new URL('dsh-team://join')
    code.searchParams.set('server', server); code.searchParams.set('team', teamId); code.searchParams.set('token', token)
    return code.href
  }

  private async manage(selected: TeamBattleProjectId, method: string, input: Record<string, unknown>): Promise<unknown> {
    const joined = this.state().joined.find(team => team.id === selected)
    if (joined !== undefined) {
      const args = method === 'createInvite' && input.origin === undefined ? { ...input, origin: joined.origin } : input
      return this.remote(joined, method, args)
    }
    return this.serialize(async () => { const team = this.hosted(selected); return this.execute(team, team.ownerMemberId, method, input) })
  }

  private summary(team: HostedTeam, actor: TeamBattleMemberId): TeamBattleTeamSummary {
    return { id: team.id, name: team.name, goal: team.goal, mode: 'hosted', localMemberId: actor, ownerMemberId: team.ownerMemberId,
      storageLocation: this.config.storageLocation ?? `Hosting device: team_battle_${team.domainSuffix} / team_battle_space_${team.domainSuffix}`,
      invites: actor === team.ownerMemberId ? team.invitations.map(value => this.inviteView(value)) : [],
      memberAccess: team.memberships.map(value => ({ memberId: value.memberId,
        ...(actor === team.ownerMemberId && value.memberId !== team.ownerMemberId ? { expiresAt: value.expiresAt } : {}),
        status: value.revoked ? 'revoked' : this.activeMembership(team, value) ? 'active' : 'expired',
      })),
    }
  }

  private joinedSummary(team: JoinedTeam): TeamBattleTeamSummary {
    return { id: team.id, name: team.name, goal: team.goal, localMemberId: team.localMemberId, ownerMemberId: team.ownerMemberId, mode: 'joined', hostUrl: team.origin, storageLocation: team.origin, invites: [], memberAccess: [] }
  }

  private asJoined(summary: TeamBattleTeamSummary, team: JoinedTeam): TeamBattleTeamSummary {
    if (summary.id !== team.id || summary.localMemberId !== team.localMemberId) reject('shared server returned another team identity')
    return { ...summary, mode: 'joined', hostUrl: team.origin, storageLocation: team.origin }
  }

  private inviteView(invite: Invitation): TeamBattleInviteView {
    return { id: invite.id, memberId: invite.memberId, memberName: invite.memberName,
      memberRole: invite.memberRole, expiresAt: invite.expiresAt,
      status: invite.revoked ? 'revoked' : invite.consumedTokenHash !== undefined ? 'used' : invite.expiresAt <= Date.now() ? 'expired' : 'pending',
    }
  }

  private authenticate(team: HostedTeam, token: string): TeamBattleMemberId {
    if (token.length > 128 || token.length < 43) throw new TeamBattleError('invalid member credential', 'TEAM_BATTLE_ACCESS_DENIED')
    const member = team.memberships.find(value => matches(token, value.tokenHash))
    if (member === undefined || !this.activeMembership(team, member)) throw new TeamBattleError('member credential is invalid, revoked, or expired', 'TEAM_BATTLE_ACCESS_DENIED')
    return member.memberId
  }

  /** Stored owner deadlines are ignored; the sole owner retains management access. */
  private activeMembership(team: HostedTeam, member: HostedTeam['memberships'][number]): boolean {
    return !member.revoked && (member.memberId === team.ownerMemberId || member.expiresAt > Date.now())
  }

  private assertActiveMember(team: HostedTeam, target: TeamBattleMemberId): void {
    if (!team.memberships.some(value => value.memberId === target && this.activeMembership(team, value))) reject('handoff recipient must have active team access')
  }

  private assertOwner(team: HostedTeam, actor: TeamBattleMemberId): void { if (actor !== team.ownerMemberId) reject('only the team owner can manage invitations and membership') }
  private membershipExpiry(): number { return Date.now() + this.limits.membershipHours * 3_600_000 }
  private network(): TeamBattleNetworkTransport { if (this.transport === undefined) reject('team network connector is not loaded'); return this.transport }
  private state(): DirectoryState { if (this.global === undefined) reject('team directory is not initialized'); return this.global.get() }
  private async save(state: DirectoryState): Promise<void> { if (this.global === undefined) reject('team directory is not initialized'); await this.global.set(parse(directorySchema, state)) }
  private async saveHosted(team: HostedTeam): Promise<void> {
    await this.save({ ...this.state(), hosted: this.state().hosted.map(value => value.id === team.id ? team : value) })
  }
  private hosted(selected: TeamBattleProjectId): HostedTeam { const team = this.state().hosted.find(value => value.id === selected); if (team === undefined) reject('hosted team not found'); return team }
  private project(selected: TeamBattleProjectId): TeamBattleProject { const project = this.projects.get(selected); if (project === undefined) reject('hosted team is unavailable'); return project }
  private assertCapacity(): void { if (this.state().hosted.length + this.state().joined.length >= this.limits.teams) reject('team capacity reached') }

  private async openProject(team: HostedTeam): Promise<void> {
    const project = new TeamBattleProject(this.ctx, Object.assign({}, this.config, {
      projectId: team.id, projectName: team.name, projectGoal: team.goal,
      localMemberId: team.ownerMemberId,
      members: [{ id: team.ownerMemberId, name: team.ownerName, role: team.ownerRole }], allowSimulation: false,
    }), { domainSuffix: team.domainSuffix, beforeClose: () => this.drain() })
    await project.open()
    const roster = new Set(project.view().members.map(member => member.id))
    if (team.memberships.some(member => !roster.has(member.memberId))) reject('stored membership has no project member')
    this.projects.set(team.id, project)
  }

  private async rememberConnection(
    summary: TeamBattleTeamSummary, base: string, credentialId: string, replaced?: JoinedTeam,
  ): Promise<TeamBattleTeamSummary> {
    const existing = this.state().joined.find(team => team.id === summary.id)
    if (existing !== undefined && replaced === undefined) {
      if (existing.credentialId !== credentialId || existing.origin !== base) reject('team identity already exists on this device')
      return this.asJoined(summary, existing)
    }
    if (replaced !== undefined && (replaced.id !== summary.id || replaced.ownerMemberId !== summary.ownerMemberId || replaced.localMemberId === summary.localMemberId)) reject('rejoining must bind a new identity within the same team')
    if (this.state().hosted.some(team => team.id === summary.id) || summary.id === this.legacy.view().project.id) reject('team identity already exists on this device')
    const joined: JoinedTeam = { id: summary.id, name: summary.name, goal: summary.goal, localMemberId: summary.localMemberId,
      ownerMemberId: summary.ownerMemberId, origin: base, credentialId,
    }
    const connections = replaced === undefined
      ? [...this.state().joined, joined]
      : this.state().joined.map(team => team.id === replaced.id ? joined : team)
    await this.save({ ...this.state(), joined: connections })
    return this.asJoined(summary, joined)
  }

  private async remote(team: JoinedTeam, method: string, input: unknown): Promise<unknown> {
    const token = await this.readCredential(team.credentialId)
    if (token === undefined) reject('local team membership credential is missing')
    const result = await this.network().request({ origin: team.origin, path: 'call', body: { teamId: team.id, method, input }, bearer: token })
    switch (method) {
      case 'view': case 'createTask': case 'updateTask': case 'publishContext': case 'publishArtifact': case 'reviewArtifact': case 'consumeWeapon': case 'heartbeat': case 'submitFile': {
        const view = parse(teamBattleViewSchema, result)
        if (view.project.id !== team.id || view.localMemberId !== team.localMemberId || view.simulationEnabled) reject('shared server returned another team or member identity')
        return view
      }
      case 'space': case 'createFolder': case 'publishFile': case 'updateSpaceItem': case 'sendFile': return parse(teamBattleSpaceViewSchema, result)
      case 'readFile': return parse(teamBattleFileContentSchema, result)
      case 'summary': case 'revokeInvite': case 'revokeMember': return this.asJoined(remoteSummary(result), team)
      case 'createInvite': return parse(z.object({ id, memberId, memberName: z.string(), memberRole: z.string(), expiresAt: timestamp, status: z.enum(['pending', 'used', 'revoked', 'expired']), teamId, token: z.string(), inviteCode: z.string() }).strict(), result)
      default: reject('unsupported remote team result')
    }
  }

  private async readCredential(id: string): Promise<string | undefined> {
    const provider = this.ctx.get('credentials')
    if (provider === undefined) reject('joining a remote team requires the credential provider')
    const record = await provider.readRecord(credentialKey('team-battle', id))
    if (record === undefined) return undefined
    if (record.kind !== 'api-key' || record.key === undefined) reject('local team credential record is invalid')
    return record.key
  }

  private async saveCredential(id: string, token: string): Promise<void> {
    const provider = this.ctx.get('credentials')
    if (provider === undefined) reject('joining a remote team requires the credential provider')
    await provider.modifyRecord(credentialKey('team-battle', id), () => Promise.resolve({ kind: 'api-key', key: token }))
  }

  private async drain(): Promise<void> { this.accepting = false; await this.tail }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    if (!this.accepting) return Promise.reject(new TeamBattleError('team directory is closing', 'TEAM_BATTLE_REJECTED'))
    const run = this.tail.then(operation, operation)
    this.tail = run.then(() => undefined, () => undefined)
    return run
  }
}
