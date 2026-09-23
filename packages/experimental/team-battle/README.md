---
description: "Durable team spaces, member-bound invitations, shared-server collaboration, and private browser Remote access."
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-team-battle

English | [中文](README.zh.md)

## Summary

`dsh-experimental-team-battle` preserves the configured legacy project and manages independently stored hosted teams and joined server connections. The `teamBattle` Typert namespace routes each request by `teamId`; private Sessions stay on each member's device. Shared data includes explicitly published files, task handoffs, confirmed Context, and independent artifact reviews.

## Table of Contents

- [Configuration](#configuration)
- [Domain behavior](#domain-behavior)
- [Remote API and updates](#remote-api-and-updates)
- [Shared file space](#shared-file-space)
- [Query ingress](#query-ingress)
- [Persistence and capacity](#persistence-and-capacity)
- [Shared-server teams](#shared-server-teams)
- [Local collaboration simulation](#local-collaboration-simulation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

<a id="configuration"></a>
## Configuration

The legacy project identity and roster are fixed deployment facts. Reopening stored state with different resolved configuration fails instead of silently migrating or replacing the project.

| Field | Default | Meaning |
|---|---:|---|
| `projectId` | required | Stable project identity. |
| `projectName` | required | Project display name. |
| `projectGoal` | required | Shared outcome statement. |
| `localMemberId` | required | Default member used for browser mutations and local Session Queries. |
| `allowSimulation` | `false` | Explicitly permit known request-local member identities for local collaboration exercises. |
| `members` | required | Non-empty roster of `{ id, name, role, color? }`; color is an optional six-digit hex value. |
| `maxTeams` | `16` | Hosted and joined team limit, excluding legacy. |
| `maxInvitesPerTeam` | `64` | Retained invitations per hosted team. |
| `membershipLifetimeHours` | `720` | Absolute lifetime of invited-member credentials; the owner does not expire. |
| `storageLocation` | unset | Operator-supplied local data path; remote connections display their server URL. |
| `maxMembers` | `8` | Maximum retained roster size, including historical member identities. |
| `maxFileBytes` | `2097152` | Actual byte ceiling for one uploaded file. |
| `maxTotalFileBytes` | `33554432` | Total retained file-byte ceiling. |
| `maxSpaceItems` | `512` | Combined folder and file count ceiling. |
| `maxDeliveries` | `512` | Retained delivery record ceiling. |
| `maxTasks` | `256` | Maximum retained tasks. |
| `maxContextEntries` | `512` | Maximum retained confirmed Context entries. |
| `maxArtifacts` | `512` | Maximum retained artifact metadata records. |
| `maxActivityEntries` | `512` | Activity retention; oldest rows are removed at the bound. |
| `maxProcessedEventIds` | `4096` | Exact-once Query event-id slots. Exhaustion fails loud. |
| `maxWeaponGrants` | `4096` | Maximum retained Query weapon grants; may not exceed event-id slots. |
| `combatShieldMax` | `100` | Repeatable combat-shield hit points. |
| `shieldDamagePerQuery` | `2` | Damage dealt when a Query weapon is consumed. |
| `memberOfflineAfterMs` | `60000` | Age after which a non-offline member projects as offline. |

All ids, limits, text bounds, roster relationships, colors, and combat values are validated before the service activates or commits a mutation.

<a id="domain-behavior"></a>
## Domain behavior

Tasks use `expectedRevision` compare-and-set updates. A task may be claimed, released, edited, handed to another active member, submitted with a pending published artifact, reopened from `submitted`, or deleted before it has artifacts. The current task owner or team owner may use `handoff` with `targetMemberId` and an optional `note`; it assigns the recipient and sets `in_progress`. Publishing artifact metadata requires the request member to own its task and moves the task to `submitted`; the artifact bytes remain at the supplied URI and are not copied into this domain.

Project progress and core HP are derived only from current task weights and accepted artifact reviews. A pending or rejected artifact does no core damage. A task remains `completed` while any linked artifact is accepted, including when another linked artifact is later rejected; an author cannot review their own artifact, and repeated identical reviews by another member return the unchanged view.

`publishContext` stores only an explicit structured update: summary, decisions, blockers, next steps, and source references. Query text never becomes Context automatically. Presence heartbeats refresh `lastSeenAt`; repeated heartbeats with no effective status change do not add activity rows. Query ingress marks its member online using server time, while `view()` projects stale members offline without a timer or background write.

Each distinct Query grants one weapon. Consuming it is idempotent and damages only the combat shield, never project core HP. When a shield at zero receives the next unconsumed weapon, it first resets to `combatShieldMax` and then applies that hit, creating a repeatable loop without a timer.

<a id="remote-api-and-updates"></a>
## Remote API and updates

All browser methods are asynchronous. `teamId` selects one hosted or joined space; omission addresses legacy. Task-domain mutations return a complete `TeamBattleView`; file-domain mutations return `TeamBattleSpaceView`; Typert still wraps the call in its standard transport `RemoteResult`.

| Method | Request | Result |
|---|---|---|
| `teamBattle.view(request?)` | optional simulation identity | Current detached view with request-local member and `simulationEnabled`. |
| `teamBattle.createTask(request)` | title, description, weight | Committed view. |
| `teamBattle.updateTask(request)` | task id, expected revision, action and edit fields | Committed view. |
| `teamBattle.publishContext(request)` | confirmed structured Context | Committed view. |
| `teamBattle.publishArtifact(request)` | task link and artifact metadata | Committed view. |
| `teamBattle.reviewArtifact(request)` | artifact id, expected revision, decision, optional note | Committed or already-equivalent view. |
| `teamBattle.consumeWeapon(request)` | weapon id | Committed or already-consumed view. |
| `teamBattle.heartbeat(request)` | `online`, `idle`, or `offline` | Committed view. |

Each durable task-domain mutation emits the Host event `team-battle/changed` with the post-commit view. The browser polls `view()` as its cross-process update path; the Host event is available to same-process consumers.

<a id="shared-file-space"></a>
## Shared file space

The independently versioned `team_battle_space` domain stores folders, actual file bytes, metadata, and deliveries; opening it does not rewrite existing `team_battle` data. `space()` returns metadata only; `readFile({ fileId })` returns `{ file, contentBase64 }`. `publishFile` accepts canonical base64, name, media type, version label, note, source, and optional parent folder; the server computes byte length and SHA-256. Publication is explicit; private conversations never enter the file space automatically. Clients must select safe media renderers and must not execute uploaded HTML as the current application.

`createFolder` and `updateSpaceItem` support nested folders, revision-checked rename, and deletion. Duplicate sibling names, nonempty folders, files linked to task review, and files with retained deliveries cannot be deleted. File bytes cannot be overwritten. `submitFile({ fileId, taskId, expectedTaskRevision })` links a file to the request member's claimed task and reuses `reviewArtifact`; the task domain references retained bytes through an internal URI, and file views project its review state. Both domains share one process-local operation queue so task submission cannot race file deletion.

In legacy only, `sendFile({ fileId, expectedRevision })` creates a `queued` delivery for the request member; duplicate pending requests for the same file revision return the existing record. An authenticated connector pulls the oldest item through `pullDelivery` without changing its status; only `acknowledgeDelivery` durably records `delivered` or `failed`. `delivered` is the connector's attestation of local Codex receipt, which the server does not independently verify. Delivery does not change member presence. File bytes and identity remain retained; rename is allowed, and subsequent pulls return the current name. File and review pages should refresh both `space()` and `view()`.

<a id="query-ingress"></a>
## Query ingress

The legacy project observes `user/message` Session events only when `source.kind` is `user`. It calls the same public `ingest()` method with event id `<session.id>:<event.seq>`, the configured `localMemberId`, and the Session event time. It does not read or retain the message content.

External connectors call `ingest()` with the strict object `{ version: 1, type: "query", eventId, memberId, occurredAt }`. Unknown fields are rejected, so a body containing `prompt`, `query`, or other text cannot cross this API. Every admitted event id is paired with exactly one weapon id; retrying it returns a duplicate receipt without another grant.

<a id="persistence-and-capacity"></a>
## Persistence and capacity

The aggregate is validated before every write and on reopen. Service disposal stops new mutations, drains accepted operations across both domains, and then closes storage. Relationship failures, a changed deployment, stale task or artifact revisions, missing owners, invalid review transitions, and exhausted exact-once capacity fail visibly. Activity alone is rolling; processed event ids and weapon grants are never evicted because eviction would allow a delayed retry to mint a second weapon. Event-id capacity must cover weapon capacity.

<a id="shared-server-teams"></a>
## Shared-server teams

`teams()` lists locally known spaces and hosting status without making network requests; `summary({ teamId })` fetches current member access states for handoff and roster filtering. Only the owner sees invitation details and invited-member expiry times. Historical identities remain in `view().members` for attribution; current rosters and online counts must filter them with the summary’s active member ids. `createTeam({ serverUrl, serverAccessToken, name, goal, memberName, memberRole })` creates server-owned state and keeps only connection metadata and a member credential on this device. Omitting `serverUrl` creates a local owner-only team. New teams contain no simulated colleagues. The connector separately authorizes server creation; its deployment credential is not retained by this package.

The owner creates a member-bound invitation with `createInvite`, naming the invited person and role. The returned `dsh-team://join` code includes the server URL, team id, and one random secret. `joinRemote({ inviteCode })` generates a device credential, redeems the invitation, and stores the credential through `ctx.credentials`. The server stores only credential and invitation digests. Invitations expire after 24 hours by default (request range: 1–168 hours), are single-use, and can be revoked; retrying the same redemption with the same credential is idempotent. `revokeMember` blocks subsequent member operations and preserves historical attribution. Revoking an invitation alone does not revoke an already joined member. An expired or removed member can use the existing join entry with a fresh invitation on the same device: the previous credential must first receive an explicit access rejection from the same server. An active identity, an owner identity, or a failed network request prevents replacement. The invitation assigns a new member identity; old task and file attribution remains unchanged, and the owner can hand unfinished tasks to the new member.

Only the dedicated connector calls `createHostedTeam`, `acceptInvite`, and `dispatchAuthenticated`; none is a browser Remote method. Each shared command validates a strict allowlist and derives its actor from an active member credential. Owner credentials do not automatically expire, including existing stored owners, and the sole owner cannot revoke their own membership. Invited-member credentials expire after `membershipLifetimeHours`; revoked credentials remain rejected. Real teams reject `actingMemberId`. Team ownership governs invitation and membership administration; task ownership and independent review rules still apply. The original browser launch credential grants private Host access and must never be shared as a team invitation.

`team_battle_directory` records hosted metadata, invitations, credential digests, and local connection references. Each hosted team has separate `team_battle_<id>` and `team_battle_space_<id>` domains; existing legacy formats remain unchanged. A server is the single writer for its teams. Member devices do not cache shared file bytes or copy their private Session logs to the server. A local credential is saved before joining so a lost response can be retried with the same identity. Server creation is idempotent for the same owner credential and unchanged metadata.

The connector provides `registerNetworkTransport`; `networkStatus`, `startHosting({ host, port })`, and `stopHosting` control its separate listener. An HTTPS server URL may include a deployment path. Hosted and joined spaces reject `sendFile`: download selected bytes to the member device for personal AI work until a local delivery consumer exists. They never queue those files for the server's Codex connector.

<a id="local-collaboration-simulation"></a>
## Local collaboration simulation

For legacy only, `allowSimulation` defaults to `false`; every browser request that supplies `actingMemberId` is rejected while it is disabled. When enabled, `TeamBattleActorRequest.actingMemberId` must name a configured member. `view(request?)`, `space(request?)`, and every browser mutation or file read accept this request-local identity; omission uses `localMemberId`. Returned project views identify the request member and expose `simulationEnabled`. Clients keep role selection within one page and must forward it on reads, writes, and heartbeats. Concurrent callers never change a service-wide current member. Query hooks and local Session events retain their configured identities.

Use one loopback Host and one durable project for the exercise. This mode impersonates roster members for product testing; it is not member authentication and must not be exposed as a public collaboration service. The option is runtime-only: toggling it does not rewrite or invalidate the existing deployment record. Separate Host processes must not share writable storage.

A task's owner submits files. Another member accepts or returns the artifact; both decisions reject the author. A task remains `completed` when any artifact was accepted, stays `submitted` while any artifact awaits review, and returns to `in_progress` only when all artifacts were returned. Publish a new file with a distinct sibling name and submit it to the same task after a correction. The earlier bytes and terminal review remain retained. A completed task requires a new task for separate follow-up work.

<a id="model-experience"></a>
## Model Experience

### Project coordination state

#### What the model sees

Nothing directly. Team Battle records are storage-domain and browser Remote state; the package registers no prompt section, tool schema, or model-visible Session event.

#### Token effect

Zero direct tokens. Observing a human `user/message` records only a content-free Query idempotency key and weapon grant outside model history.

#### KV Cache effect

Independent. Team Battle mutations and browser reads do not alter a model request or its reusable prefix.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Credential lifecycle** — invited members need a fresh invitation after expiry or removal; automatic renewal, lost-credential recovery, ownership transfer, and multi-device membership are not provided. Owner credentials have no automatic expiry and must be kept private. Each rejoin retains the old identity and consumes another roster slot; configured roster and invitation limits still apply. A retained invitation cannot be redeemed by another device.
- **Explicit publication** — personal AI conversations and generated files are not automatically published. Shared-team Codex delivery is unavailable; users download files to their own device.
- **Single-writer process assumption** — operation serialization is process-local; multiple Harness processes must not open and mutate the same Team Battle aggregate concurrently.
- **Bounded file storage and connector responsibility** — uploaded bytes live in the aggregate for small, bounded files; connectors must hand them to Codex before acknowledging. The Query hook does not consume deliveries. External-URI artifacts remain metadata only.
- **Polling browser updates** — the Host emits `team-battle/changed`, but this MVP browser refreshes through repeated `view()` calls rather than a selected Gateway Remote event.
- **Finite Query history** — reaching `maxProcessedEventIds` or `maxWeaponGrants` stops new grants until an explicit future retention design exists.

<a id="dev-note"></a>
### Dev Note

None.
