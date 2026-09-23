# 团队空间

[English](team-battle.md) | 中文

团队空间 API 提供独立团队空间、邀请、成员、任务、已确认纪要、文件与验收状态。操作权限、存储上限与连接器投递约定由[包说明](../../packages/experimental/team-battle/README.zh.md)维护；目录、邀请、网络与协作的请求和结果类型定义在 [`types.ts`](../../packages/experimental/team-battle/src/types.ts)。本页收录从服务源码生成的 Cordis 方法和事件。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxteambattle--teambattleservice"></a>

### `ctx.teamBattle` — `TeamBattleService`

Team collaboration Remote namespace; shared member tokens never authorize private Host APIs.

```ts cordis-catalog
/**
 * Register the dedicated connector.
 * @param transport - team-only transport provider.
 * @returns registration disposer.
 */
registerNetworkTransport(transport: TeamBattleNetworkTransport): () => void

/**
 * List spaces without sharing private conversations or credentials.
 * @returns local directory.
 */
@Remote('teams') teams(): Promise<TeamBattleDirectoryView>

/**
 * Read current member access states and owner-only invitation details.
 * @param request - selected team.
 * @returns authenticated team summary.
 */
@Remote('summary') summary(request: TeamBattleActorRequest): Promise<TeamBattleTeamSummary>

/**
 * Create an owner-only team locally or on a shared server.
 * @param request - metadata and optional shared server credential.
 * @returns created team.
 */
@Remote('createTeam') createTeam(request: CreateTeamRequest): Promise<TeamBattleTeamSummary>

/**
 * Create one member-bound invitation.
 * @param request - selected team and invited identity.
 * @returns secret invitation shown once.
 */
@Remote('createInvite') createInvite(request: CreateTeamInviteRequest): Promise<CreatedTeamInvite>

/**
 * Revoke an unused or retained invitation.
 * @param request - team and invitation.
 * @returns updated owner summary.
 */
@Remote('revokeInvite') revokeInvite(request: RevokeTeamInviteRequest): Promise<TeamBattleTeamSummary>

/**
 * Revoke one member's access while retaining attribution.
 * @param request - team and member.
 * @returns updated owner summary.
 */
@Remote('revokeMember') revokeMember(request: RevokeTeamMemberRequest): Promise<TeamBattleTeamSummary>

/**
 * Join with an invitation; expired or revoked same-server membership can be replaced.
 * @param request - invitation code.
 * @returns joined team.
 */
@Remote('joinRemote') joinRemote(request: JoinRemoteTeamRequest): Promise<TeamBattleTeamSummary>

/**
 * Read the separate listener state.
 * @returns hosting status.
 */
@Remote('networkStatus') networkStatus(): Promise<TeamBattleHostingStatus>

/**
 * Explicitly start the independent team listener.
 * @param request - network interface and port.
 * @returns bound addresses.
 */
@Remote('startHosting') startHosting(request: { readonly host: string; readonly port: number }): Promise<TeamBattleHostingStatus>

/**
 * Stop the independent listener.
 * @returns stopped status.
 */
@Remote('stopHosting') stopHosting(): Promise<TeamBattleHostingStatus>

/**
 * Create server-owned state after connector deployment authorization.
 * @param request - initial owner and credential.
 * @returns created metadata.
 */
createHostedTeam(request: CreateHostedTeamRequest): Promise<TeamBattleTeamSummary>

/**
 * Bind a credential to the identity reserved by an invitation.
 * @param request - invitation exchange.
 * @returns joined member metadata.
 */
acceptInvite(request: AcceptTeamInviteRequest): Promise<TeamBattleTeamSummary>

/**
 * Authorize and execute one dedicated-listener operation.
 * @param request - member credential and untrusted command.
 * @returns bounded team result.
 */
dispatchAuthenticated(request: AuthenticatedTeamRequest): Promise<unknown>

/**
 * Execute view in the request's selected team.
 * @param request - team selector and operation fields.
 * @returns selected team result after durability.
 */
@Remote('view') async view(request?: TeamBattleActorRequest): Promise<TeamBattleView>

/**
 * Execute space in the request's selected team.
 * @param request - team selector and operation fields.
 * @returns selected team result after durability.
 */
@Remote('space') async space(request?: TeamBattleActorRequest): Promise<TeamBattleSpaceView>

/**
 * Execute createFolder in the request's selected team.
 * @param request - team selector and operation fields.
 * @returns selected team result after durability.
 */
@Remote('createFolder') async createFolder(request: CreateFolderRequest): Promise<TeamBattleSpaceView>

/**
 * Execute publishFile in the request's selected team.
 * @param request - team selector and operation fields.
 * @returns selected team result after durability.
 */
@Remote('publishFile') async publishFile(request: PublishFileRequest): Promise<TeamBattleSpaceView>

/**
 * Execute updateSpaceItem in the request's selected team.
 * @param request - team selector and operation fields.
 * @returns selected team result after durability.
 */
@Remote('updateSpaceItem') async updateSpaceItem(request: UpdateSpaceItemRequest): Promise<TeamBattleSpaceView>

/**
 * Execute readFile in the request's selected team.
 * @param request - team selector and operation fields.
 * @returns selected team result after durability.
 */
@Remote('readFile') async readFile(request: ReadFileRequest): Promise<TeamBattleFileContent>

/**
 * Execute sendFile in the request's selected team.
 * @param request - team selector and operation fields.
 * @returns selected team result after durability.
 */
@Remote('sendFile') async sendFile(request: SendFileRequest): Promise<TeamBattleSpaceView>

/**
 * Execute submitFile in the request's selected team.
 * @param request - team selector and operation fields.
 * @returns selected team result after durability.
 */
@Remote('submitFile') async submitFile(request: SubmitFileRequest): Promise<TeamBattleView>

/**
 * Execute createTask in the request's selected team.
 * @param request - team selector and operation fields.
 * @returns selected team result after durability.
 */
@Remote('createTask') async createTask(request: CreateTaskRequest): Promise<TeamBattleView>

/**
 * Execute updateTask in the request's selected team.
 * @param request - team selector and operation fields.
 * @returns selected team result after durability.
 */
@Remote('updateTask') async updateTask(request: UpdateTaskRequest): Promise<TeamBattleView>

/**
 * Execute publishContext in the request's selected team.
 * @param request - team selector and operation fields.
 * @returns selected team result after durability.
 */
@Remote('publishContext') async publishContext(request: PublishContextRequest): Promise<TeamBattleView>

/**
 * Execute publishArtifact in the request's selected team.
 * @param request - team selector and operation fields.
 * @returns selected team result after durability.
 */
@Remote('publishArtifact') async publishArtifact(request: PublishArtifactRequest): Promise<TeamBattleView>

/**
 * Execute reviewArtifact in the request's selected team.
 * @param request - team selector and operation fields.
 * @returns selected team result after durability.
 */
@Remote('reviewArtifact') async reviewArtifact(request: ReviewArtifactRequest): Promise<TeamBattleView>

/**
 * Execute consumeWeapon in the request's selected team.
 * @param request - team selector and operation fields.
 * @returns selected team result after durability.
 */
@Remote('consumeWeapon') async consumeWeapon(request: ConsumeWeaponRequest): Promise<TeamBattleView>

/**
 * Execute heartbeat in the request's selected team.
 * @param request - team selector and operation fields.
 * @returns selected team result after durability.
 */
@Remote('heartbeat') async heartbeat(request: HeartbeatRequest): Promise<TeamBattleView>

/**
 * Admit a content-free local connector event to the legacy space.
 * @param event - strict Query identity.
 * @returns durable idempotent receipt.
 */
ingest(event: TeamBattleIngressEvent): Promise<TeamBattleIngressReceipt>

/**
 * Read a legacy connector's pending delivery.
 * @param request - configured local member.
 * @returns oldest queued bytes.
 */
pullDelivery(request: PullDeliveryRequest): TeamBattleDeliveryPull

/**
 * Record a legacy connector receipt.
 * @param request - terminal delivery acknowledgement.
 * @returns durable delivery.
 */
acknowledgeDelivery(request: AcknowledgeDeliveryRequest): Promise<TeamBattleDeliveryView>
```

Source: [`packages/experimental/team-battle/src/index.ts`](../../packages/experimental/team-battle/src/index.ts)

<a id="team-battle-events"></a>

### `team-battle/*` events

<a id="team-battlechanged--emit"></a>

#### `team-battle/changed` — emit

A project mutation reached durable storage.

```ts cordis-catalog
/**
 * A project mutation reached durable storage.
 * @param view - committed project projection.
 * @mode emit
 */
'team-battle/changed'(view: TeamBattleView): void
```

Source: [`packages/experimental/team-battle/src/index.ts`](../../packages/experimental/team-battle/src/index.ts)
<!-- END GENERATED cordis-surface -->
