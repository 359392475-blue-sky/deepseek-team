# Agent Note: Team Battle multi-user collaboration edition

Status: proposed

English | [中文](2026-08-21-team-battle-collaboration-edition.zh.md)

## Problem

DeepSeek Harness currently centers one person working with one agent runtime: the person explains the objective, constraints, and judgments, and the agent implements the work. When that efficient personal loop enters a multi-person project, it still falls back to meetings, voice calls, chat software, and manual handoffs. Product, engineering, testing, and UI contributors each own conversations and outputs from Codex or another agent, but a downstream role cannot directly inherit the full project context behind earlier work and instead depends on another person to restate, filter, and explain it.

Copying complete private conversations into a shared chat would expose unrelated or sensitive information and still would not create accountable tasks, reviews, or project progress. A conventional project dashboard can record status, but it does not connect that state bidirectionally to each contributor's personal agent and does not make cross-role progress emotionally legible.

Team Battle needs to extend “one person working with one agent” into “a group of people working with their separately owned agents around one project.” Each person keeps working in their own agent, while user-confirmed conversation digests, human judgments, and original artifacts enter one project space. Team members and their agents can see a traceable view of the whole project, continue from earlier results, and write new judgments and artifacts back into the same project context. The game depicts the shared effort as a cooperative boss battle and provides a genuinely playable diversion while people wait for agent responses, but it does not replace the project space.

## Proposal

Build Team Battle as a publicly reachable cross-agent project space under a dedicated `lowpower.me` subdomain. The first deployment serves an invitation-only team workspace rather than anonymous access, public project discovery, or self-service multi-tenancy. It is not a shared agent group chat, a conventional project dashboard, or a remote skin over the current single-process Agent Teams experiment. Its core product is project context that people and agents can jointly consume, continue, and trace to its sources.

The product has three layers:

| Layer | Authority | Responsibility |
|---|---|---|
| Project fact layer | Authoritative for shared project state | Owns projects, victory criteria, tasks, dependencies, context packets, artifacts, reviews, decisions, permissions, and audit events. |
| Agent relay layer | Authoritative for message delivery records | Exchanges approved structured updates, tasks, context, artifacts, and receipts with each participant's personal agent without claiming ownership of private conversation history. |
| Game projection layer | Derived only | Converts accepted project events into authoritative boss health and phases, and each de-duplicated query into one special-weapon grant that affects only the leisure game; it never changes project truth by itself. |

The Team Board manages shared work, project context, and acceptance state. When a user publishes an artifact for collaboration, the project space stores an immutable, verifiable, access-controlled version copy with provenance so later people and agents can continue without requiring the original author to be online. Git, pull requests, CI, design systems, or document systems may remain the artifact's origin and full-history owner. Human users remain accountable for what their agents publish or execute.

## Product principles

- **Share continuable project context, not raw private conversation by default.** Personal transcripts stay local unless a user explicitly selects excerpts for sharing. The normal outbound unit is a reviewed Collaboration Update, Context Packet, task update, decision, blocker, change log, or original artifact.
- **Conversation curation must not beautify facts.** A connector turns a selected conversation into a collaboration digest that distinguishes confirmed facts, human judgment, agent suggestions, disagreement, failed attempts, and unresolved questions. Curation may improve readability, but it must not erase conflict, change conclusions, or present speculation as a decision.
- **Preserve human judgment and original artifacts separately.** Human acceptance, rejection, trade-offs, and non-overridable constraints are recorded on their own. Documents, designs, code, test reports, and logs remain unchanged with provenance, version, and verification information rather than being replaced by a summary.
- **A complete project view is navigable, not one unconditional prompt injection.** Team members and agents can browse the full provenance graph, versions, and upstream or downstream relationships. Delivery to a personal agent assembles a task-scoped subset and links to the complete retrievable project space, avoiding overlong, stale, or unauthorized context.
- **Bidirectional does not mean silent remote control.** The board can deliver tasks and context to a personal agent, but waking or instructing that agent requires a separate, visible permission and receipt.
- **Evidence advances the project.** Conversation volume, token usage, code lines, and time online never determine progress. Accepted weighted deliverables and victory criteria do.
- **Queries reward the game without claiming progress.** Each successfully sent, de-duplicated user query grants exactly one special weapon, such as a screen-clearing bomb or temporary enhanced fire. Ordinary movement, automatic fire, kills, score, and task starts never grant these weapons, and special weapons never change project completion or project-boss health.
- **Every authoritative effect traces to a fact.** Boss health, phases, and accepted-work skills open the task, artifact, review, and actor that caused them. A special-weapon grant traces only to a stable event id, source member, and connector, without retaining query text.
- **Game presentation must preserve a serious work view.** The same data remains usable with reduced motion or in a non-game board view.
- **Roles are project configuration.** Product, engineering, testing, and UI form the first template, not a hardcoded limit or permission model.

## Shared project context

Each personal collaboration loop enters the project space as one continuable `CollaborationUpdate`. It is not a chat screenshot or decorated chat bubble. It is a sourced, versioned, audience-scoped, user-confirmed project contribution with three peer parts:

1. **Structured conversation digest.** Records the objective, constraints, confirmed facts, changed approaches, failed attempts, unresolved questions, and proposed next step, with a source anchor for each material conclusion.
2. **Human judgment.** States what the person accepted, rejected, changed, or reserved, why the decision was made, and which constraints a downstream agent must not rewrite on its own.
3. **Original artifacts and evidence.** Preserves original references, versions, authors, times, and verification state for files, designs, code commits, test reports, documents, or logs. A summary aids discovery but never replaces the artifact.

The connector first creates a `ShareDraft` on the member's device from a user-selected conversation range, checks for sensitive information, and anchors claims to sources. The user can edit, remove, redact, choose recipients, set sensitivity and expiry, and then publish to the project space. The interface must distinguish “AI-organized draft,” “confirmed by the person,” and “edited by the person before publication.” A project owner or administrator cannot bypass the member to read the complete private conversation.

The project space organizes Collaboration Updates, tasks, decisions, artifacts, reviews, and corrections as a versioned provenance graph and derives a current `ProjectContextSnapshot`. The snapshot answers the project objective, current state, confirmed judgments, reusable results, active work, unresolved questions, blockers, next recipient, and recent changes. A downstream role can inspect sources, take over one item, send task-scoped context to a personal agent, and write the result back as a derived version.

A published Collaboration Update cannot be silently rewritten. A correction creates a new version, marks the old version as superseded, and notifies members who received or continued from the old version. Missing provenance, stale content, version conflicts, unauthorized references, and inaccessible artifacts appear as explicit breaks rather than masquerading as synchronized current facts.

## Users and roles

- **Project owner.** Creates the project boss, defines victory criteria and milestone weights, configures project roles, and names final approvers.
- **Contributor.** Claims or receives work, uses a personal agent, publishes collaboration facts and artifacts, and responds to review or dependency requests.
- **Reviewer.** Examines evidence, accepts or rejects deliverables, and thereby authorizes formal progress.
- **Observer.** Reads progress, risks, decisions, and outcomes without changing project state.
- **Workspace administrator.** Invites members, manages agent connections, permissions, retention, export, and revocation.
- **Coordination agent.** Summarizes updates, routes dependencies, and reminds owners about blockers; by default it cannot approve work, merge code, deploy, publish, or declare victory.

Business roles and permission roles are separate. A contributor may be labeled Product or UI while permission grants decide whether that person may assign tasks, publish restricted context, review work, or administer connectors.

## Product model

The first model contains these durable entities:

- `Workspace`: membership, policies, connectors, and one or more projects.
- `Member`: a human identity, display profile, permission grants, and project-role assignments.
- `AgentConnection`: one member-owned connection to Codex or another agent tool, including capabilities, status, consent policy, and revocation state.
- `RaidProject`: the shared objective, lifecycle, participants, project roles, and completion state represented by one boss.
- `VictoryCriterion`: a required, reviewable condition with weight, evidence requirements, and named approvers.
- `QuestTask`: a task with status, owner, role, dependencies, priority, weight, acceptance criteria, and revision.
- `CollaborationUpdate`: a user-published, versioned project contribution that separately preserves a structured conversation digest, human judgment, original artifact references, and a requested next step.
- `SourceAnchor`: a reference to the originating tool, conversation, selected turns or time range, author, generation time, visibility, and digest version without requiring the central service to store the complete source text.
- `ContextPacket`: a curated summary with source references, audience, sensitivity, version, freshness, decisions, blockers, and requested collaboration.
- `ProjectContextSnapshot`: a navigable project-wide view derived from the current valid updates, tasks, decisions, artifacts, reviews, and corrections, with task- and role-scoped assembly for delivery.
- `Artifact`: an immutable content version of a file, commit snapshot, test report, design, document, or other deliverable, including provenance, content hash, media type, size, access controls, retention state, and derived previews while an external system may retain authoritative history.
- `ReviewDecision`: an acceptance, rejection, change request, or reopen action tied to evidence and an accountable actor.
- `RelayMessage` and `DeliveryReceipt`: outbound or inbound collaboration content with delivery, acknowledgement, retry, and expiry state.
- `AuditEvent`: an append-only record of human, agent, connector, and system actions with actor, origin, time, trace id, and idempotency key.
- `GameProjection`: authoritative boss state derived from accepted project events plus leisure-game state, special-weapon inventory, and presentation state, never used as the project fact source.

Every durable fact distinguishes a human action, an agent action on behalf of a human, a coordination-agent action, a connector delivery, and a system-derived projection. Display names never substitute for authenticated identities.

`QueryPulse` is a short-lived connector signal containing a stable query event id, authenticated member and connector, optional project or task ids, occurrence time, and no query text. Each distinct event id derives exactly one `SpecialWeaponGrant`; retries and reconnects reuse the same id and cannot grant the weapon again. The signal is not a progress fact, retained transcript, or performance metric.

A `ShareDraft` is a transient object that exists only in a personal connector. It is not part of the team project record before the user publishes it and cannot be displayed by the central service as a shared fact.

## Core journey

1. A project owner creates a raid, names the boss, defines the objective, victory criteria, milestone weights, reviewers, and initial project roles.
2. The owner invites members. Each member accepts a role, connects a personal agent, and chooses what the connector may read, publish, receive, or execute.
3. The team creates tasks with dependencies, evidence requirements, and weights. Members claim work or receive assignments.
4. After sign-in, a member lands on the Personal Workbench, where the private conversation with that member's Codex and the playable airplane game share the same first screen. The conversation remains private by default and does not enter the team space merely because it is shown beside the game.
5. The member opens the left-side **Team** tab to see other members and their agents' work status, then enters project context, tasks, artifacts, and reviews in the shared team cloud space. After selecting an earlier result, the Team Board assembles a task-scoped Context Packet and previews the task, digest, human judgment, original artifacts, source versions, and private content that will not be sent.
6. The member works privately with the personal agent. Each successfully sent new query emits a content-free Query Pulse that grants one special weapon in the current game. The member can keep playing while the agent replies; when the result arrives, the interface preserves the game state and shows a notification instead of forcing a pause or exit.
7. The connector creates a Share Draft from the user-selected conversation range and separately organizes the structured conversation digest, human judgment, and artifact references. The user checks sources, edits, redacts, chooses the audience, and publishes it. The project space stores it as a new version that cannot silently overwrite earlier content.
8. Cross-role requests and new Collaboration Updates route to the relevant members and their relay inboxes. Delivery receipts expose whether each target received, acknowledged, rejected, or missed the message, and a downstream agent can continue from that exact version with a derived relationship.
9. A contributor submits an original artifact reference and evidence for review. Submission may create a charge-up animation, but it does not reduce boss health.
10. A reviewer accepts or rejects the contribution. Acceptance advances the weighted victory criterion and triggers one idempotent attack; rejection returns the task to rework without false progress.
11. The boss reaches zero health only when all required criteria are accepted and the project owner confirms completion. The raid then becomes an archive of deliverables, judgments, Collaboration Updates, context, and audit events.

## Relay content and channel behavior

The board accepts these collaboration payloads in the first protocol: task creation or update, task assignment or claim, Collaboration Update, human judgment, progress summary, blocker, collaboration request, decision, Context Packet, artifact reference, review request, review decision, correction and supersession, change log, mention, delivery receipt, and content-free Query Pulse.

Each relay envelope includes a stable event id, workspace and project ids, optional task, Collaboration Update, and artifact ids, authenticated actor, originating agent or connector, payload kind and version, concise human-readable summary, structured fields, source anchors, base version, derived version, intended recipients, sensitivity, trace id, idempotency key, occurrence time, and optional expiry. A Query Pulse omits summary and content fields and carries a short expiry. The interface may coalesce rapid visual notifications, but each distinct de-duplicated event id must grant its weapon independently.

Board-to-agent delivery supports an inbox message, an acknowledged context injection, and a separately authorized wake-and-run request. A connector must never convert ordinary shared text into a tool call or shell command merely because it arrived from the board. Remote content is untrusted input and remains subject to the personal agent's permissions and approval rules.

The board records queued, delivered, acknowledged, failed, rejected, and expired states. Retries reuse the same idempotency key so a reconnect cannot duplicate a task, review, or boss attack. A contributor can inspect and revoke pending delivery where the target tool permits it.

## Information architecture

1. **Personal Workbench** is the default first screen. The fixed left navigation needs only clear **Conversation** and **Team** entries. The main area fuses the current user's private Codex conversation with a genuinely playable airplane game. The first screen keeps only the transcript, composer, agent state, battlefield, lives and score, special-weapon slot, and necessary controls. It does not expand team cards, a task board, a Context graph, or a project dashboard.
2. The **Team** tab shows other members and their personal agents' work status and contains the shared team cloud space. That space then organizes the Project Lobby, project context, tasks, artifacts, reviews, decisions, blockers, provenance versions, and audit history. Private conversation does not appear there automatically; only Collaboration Updates, judgments, and artifacts that the user explicitly publishes are visible.
3. **My Relay Inbox** shows tasks and context sent to the user's agents, Share Drafts awaiting user approval, failed deliveries, receipts, stale-version warnings, and connector status.
4. **Connections and Permissions** manages agent bindings, capabilities, visibility rules, and separate grants for reading conversations, creating drafts, publishing updates, receiving tasks, waking an agent, executing work, revocation, and audit history.
5. **Raid Archive** preserves final artifacts, accepted criteria, key judgments, reusable Context Packets, the provenance graph, battle recap, and project export.

The first-version Personal Workbench uses the [Unified Flight Deck](../../../../apps/web/prototypes/team-battle-flight/concepts/chat-game-v3/unified-flight-deck.png) as its selected visual framework. The Team page uses the confirmed [Team Space direction](../../../../apps/web/prototypes/team-battle-flight/concepts/chat-game-v3/team-space-page.png): a member-and-agent status rail, task work area, shared Context and artifact library, review actions, activity, versions, and provenance. Neither direction may move these Team-space functions back onto the home screen.

## Game projection

- The airplane game shares the screen with the personal Codex conversation and is genuinely playable. The aircraft fires automatically. The user moves it horizontally with the mouse or the `Left Arrow` / `Right Arrow` keys. The game supports enemies, collisions, lives, leisure score, pause, and restart. When the personal agent returns a result, the interface preserves the game and only notifies the user.
- A project maps to one boss; milestones map to boss phases.
- Configured project roles map to the party formation while their business names remain visible.
- Each successfully sent, de-duplicated new query grants exactly one special weapon. The first release includes at least a **screen-clearing bomb** and **temporary enhanced fire**. The user activates the current weapon by clicking its slot or pressing `Space`.
- Ordinary fire, special weapons, screen clears, enhancements, kills, lives, waves, leisure score, and restarts change only the current leisure game. They do not represent project progress or personal performance and cannot modify tasks, project context, completion, or the project core.
- Submitting an artifact launches a skill attempt or enters a charge state.
- Accepting evidence makes the skill hit and reduces boss health by the criterion's accepted weight.
- Rejecting evidence makes the attempt miss and returns the affected work to rework.
- A blocker appears as a debuff with an owner and a linked resolution task.
- Completing a cross-role dependency chain may trigger a combo animation without counting the same weight twice.
- Reopening accepted work recalculates progress and may restore boss health.
- Reusable deliverables and confirmed Context Packets become post-battle loot without creating personal performance scores.
- Zero boss health means every required weighted criterion is accepted; final human confirmation closes the raid.
- Restarting the airplane game resets only the current wave, lives, power-ups, and leisure score. It never restores the project core, rolls back tasks, or removes project context.

The projection separates `completionPercent` from `bossHealthPercent`, with boss health derived as the complement of accepted completion. The leisure game separately maintains waves, enemies, a local game boss, lives, score, and `specialWeaponInventory`. Only accepted project facts can change the authoritative project boss; no leisure-game state can be written back into project facts.

## MVP scope

### In scope

- A publicly reachable deployment under a dedicated `lowpower.me` subdomain, initially serving one invitation-only team workspace on different computers.
- Configurable project roles with a Product, Engineering, Testing, and UI starter template.
- Authenticated human accounts, project membership, and read, contribute, review, owner, and administrator permissions.
- Projects, victory criteria, weighted tasks, dependencies, claims, assignments, blockers, review, rejection, reopen, completion, and archive.
- A Codex-first connector plus a versioned generic connector protocol for future agent tools.
- Bidirectional structured relay with user preview, acknowledgement, retry, expiry, and de-duplication.
- Share Drafts generated from selected personal conversations, structured conversation digests, human judgments, source anchors, corrections, supersession, and a current Project Context Snapshot.
- Context Packets, immutable and verifiable artifact versions, provenance, access controls, derived previews, evidence, review decisions, change logs, and an append-only audit history.
- Task- and role-scoped Context assembly with a pre-delivery preview of content, provenance, versions, and private information that will not be sent to a personal Codex.
- Near-real-time Raid Room updates without manual refresh.
- A default first screen that places the personal Codex conversation beside the airplane game, with a left-side **Team** tab for member status and the shared team cloud space.
- Content-free, de-duplicated Query Pulses from Codex, with each distinct event id granting one screen-clearing bomb or temporary enhanced-fire weapon without storing query text or changing progress.
- Boss, health bar, role formation, charge, attack, combo, blocker, phase, and victory feedback whose authoritative damage remains derived from accepted project facts.
- A genuinely playable airplane game with horizontal mouse movement, `Left Arrow` / `Right Arrow` movement, automatic fire, enemies, collisions, lives, leisure score, a special-weapon slot, pause, and restart.
- Reduced-motion behavior and a non-game board view carrying the same tasks, evidence, and progress.

### Out of scope

- Automatic upload or centralized full-text indexing of complete private agent transcripts, or merger of personal agent memory.
- Silent remote command execution, unrestricted agent wakeup, or a connector with one all-powerful permission.
- Support for every agent product in the first release.
- Replacement of the complete history and original workflows of Git, pull requests, CI, design tools, or document systems. The project space stores only collaboration copies and provenance that a user deliberately publishes.
- Progress or performance scoring based on messages, tokens, code lines, online time, or individual damage rankings.
- Autonomous agent approval, code merge, deployment, publication, payment, or final project acceptance.
- A full game economy with equipment, currency, levels, competitive rankings, or pay-to-progress mechanics.
- Public project discovery, cross-organization federation, or an agent marketplace.

## MVP success signals

- Three or four members can complete one “task → person-and-agent work → publish Collaboration Update and artifact → downstream handoff → human review” loop without another meeting or verbal restatement of context that the project already records.
- A member returning after time away can recover the project-wide view from key changes, provenance, and versions, and send the selected task context to a personal Codex to continue.
- Every published material judgment has a confirming person and source anchor, every stored artifact version has a content hash, and the count of complete private conversations uploaded without user confirmation is zero.
- The system can measure Share Draft-to-publication time, delivery success, receipt acknowledgement, requests for more context, digest correction rate, and stale Context count to improve collaboration quality rather than evaluate individual performance.
- Users can correctly distinguish query rewards, leisure-game state, and project progress: only a new de-duplicated query grants a special weapon, game score remains recreation, and only accepted work advances real progress.

## Current Harness foundation

The existing experimental [Agent Teams](../../implemented/feature/2026-08-05-agent-teams.md) capability already provides a durable named roster, point-to-point mailbox, task dependency graph, optimistic task revisions, delivery acknowledgement, and event replay. Those semantics are useful references for Team Battle tasks and relay behavior.

Its authority model cannot serve the proposed multi-user product unchanged. A Team member is a continuable direct child agent inside one Harness process, every member shares one working directory and checkout, and operations authorize a live in-process agent object rather than a human account or remote connector. The package has no remote member, multi-user permission, cross-process mailbox, shared artifact service, or Web Team controls. Its own [package reference](../../../../packages/experimental/agent-team/README.md) documents the same-process boundary.

The [experimental package decision](../../implemented/architecture/2026-08-18-experimental-agent-teams-packages.md) also keeps Agent Teams private and outside official release packages. Team Battle should therefore add a central authenticated project service and connector protocol, then adapt current Agent Teams as one local connector or reference implementation. It should not make stable Web packages depend directly on the experimental package.

The current Harness Web host is a single-user local service. Session logs, projections, typed remotes, browser push streams, attachments, and SDK or ACP process adapters are useful implementation materials, but authenticated principals, tenancy, project ACLs, TLS deployment, subscriber-specific event filtering, general artifact storage, and authenticated remote-agent ownership remain new product work.

## Confirmed decisions

| Decision | Confirmed choice | Product consequence |
|---|---|---|
| Initial deployment | Publicly reachable under a dedicated `lowpower.me` subdomain, with invitation-only access for the first team | Internet deployment, authentication, TLS, tenant isolation, operations, abuse controls, and recovery are release requirements even before public signup exists. The exact hostname remains to be selected. |
| Project authority | The board owns tasks, criteria, reviews, and progress; external systems own original evidence | The board can route work and decide completion without replacing Git, pull requests, CI, design tools, or documents. |
| Context contribution unit | Publish a structured conversation digest, human judgment, and original artifact as three peer layers; raw conversation stays local by default | The team inherits both process and judgment while retaining the unchanged artifact for verification. Connectors need local curation, source anchoring, and redaction. |
| Sharing consent | Preview the Collaboration Update, audience, provenance, and artifacts before publication; pre-approval must be scoped to a project, payload, and sensitivity | A connector cannot mirror complete conversations automatically, and a project owner cannot bypass a member to read private conversations. |
| Artifact handling | The project space stores a deliberately published immutable version copy, hash, provenance, and access rules while external tools retain full history | Later people and agents can consume the project artifact directly and still trace it to Git, CI, design, or document origins. |
| Board-to-agent authority | Inbox delivery is normal; wake-and-run is a separate opt-in permission with confirmation | The first connector cannot silently convert shared content into remote execution. |
| First connector | Implement Codex first while versioning a provider-neutral protocol | The first playable release targets friends who already use Codex while preserving a later path to other agent tools. |
| Query rewards and boss damage | One de-duplicated query grants one special weapon; only accepted weighted evidence creates authoritative project-boss damage | The user gets a clear game reward while waiting for the agent, while message volume still cannot falsify project completion. |
| Default first screen | A fused personal Codex conversation and playable airplane game is the default; team context, member status, and the shared team cloud space live under the left-side **Team** tab | The product idea becomes understandable pages and actions instead of placing every context, state, and function on one screen. |
| First-screen visual layout | Use the integrated [Unified Flight Deck](../../../../apps/web/prototypes/team-battle-flight/concepts/chat-game-v3/unified-flight-deck.png) direction: a 101 px navigation rail, private conversation panel, and playable game field on one continuous white and blue-gray paper canvas | The first implementation has a stable spatial hierarchy while Team data remains off the home screen. |
| Team-tab information architecture | Implement the [Team Space visual direction](../../../../apps/web/prototypes/team-battle-flight/concepts/chat-game-v3/team-space-page.png) as a functional member-status, task, Context, artifact, review, activity, version, and provenance view | The selected page separates shared project operations from the private Conversation-and-game home screen while making handoff and review executable. |

## Remaining decisions

| Decision | Proposed default | Why it changes the product |
|---|---|---|
| Artifact limits | Initial formats, per-file size, project quota, malware scanning, retention, and deletion periods | Immutable collaboration copies require explicit cost, security, and lifecycle rules. |
| Automatic publication | Confirm every item by default; later allow only narrow user pre-approval for a named project, payload kind, audience, and sensitivity | Full manual review creates friction, while broad automation can expose private content or incorrect judgments. |
| Roles | Use configurable roles with a four-role starter template; allow later discussion of multi-role membership | Fixed lanes make the product unusable for differently shaped teams. |

## Alternatives considered

**One central agent for the whole team.** Rejected because it collapses human accountability, private working context, tool permissions, and role ownership into one conversation. Team Battle instead coordinates independently owned agents.

**Mirror every personal transcript into a shared chat.** Rejected because raw conversation contains unrelated and sensitive material, creates excessive context, and still lacks explicit tasks, decisions, reviews, and artifact provenance.

**Share only the final artifact without process or judgment.** Rejected because a downstream role would see the result without its objective, constraints, trade-offs, failed attempts, or unresolved questions and would still need a meeting or the original author to continue.

**Concatenate every digest into one ever-growing project prompt.** Rejected because complete visibility does not mean injecting all history on every turn. An unbounded prompt mixes stale, conflicting, unauthorized, and irrelevant material. Team Battle keeps a navigable project provenance graph and assembles versioned, task-scoped Context.

**Use a conventional dashboard without game feedback.** Rejected because cooperative battle feedback is part of the requested product identity. The factual board remains available, while game state is a traceable projection rather than a replacement.

**Turn the current Agent Teams service directly into the multi-user server.** Rejected because its authority depends on live child-agent objects, one process, one Lead Session, and one shared checkout. Reusing its task and mailbox semantics behind a new connector is safer than weakening those existing assumptions.

**Calculate progress from activity volume.** Rejected because messages and self-reported progress reward noise and can be gamed. Each de-duplicated query may grant one leisure-game weapon, but only accepted weighted evidence advances completion and reduces authoritative boss health.

## Acceptance criteria

- Three or four invited participants on distinct computers can reach the public service, join one project under different configured roles, and connect separately owned agents.
- A participant can claim or receive a task, approve its delivery, and observe that the intended personal agent received the exact task and selected context.
- A personal agent can prepare a Share Draft from a user-selected conversation range that distinguishes the structured conversation digest, human judgment, and original artifacts for the user to check against sources, edit, redact, and publish.
- Every material judgment retains a confirming person, source anchor, base version, and derived version. Corrections preserve history and notify members who consumed the old version.
- A deliberately published artifact is stored as an immutable content version. Its hash is identical after authorized upload and download, and a derived preview cannot replace the original content.
- A member returning after time away can review key changes and the current Project Context Snapshot, take over from an earlier result, and send task-scoped Context to a personal agent without reading every private conversation.
- A published cross-role request reaches the intended members and exposes queued, delivered, acknowledged, failed, or expired state.
- A reviewer can accept or reject an artifact against named criteria, and the decision remains linked to actor, evidence, task, and source.
- One accepted contribution changes weighted completion and boss health exactly once even after retries, reconnects, or duplicate delivery.
- The default first screen shows the current user's private Codex conversation beside the playable airplane game. The left-side **Team** tab opens other members' and agents' status and the shared team cloud space, while the home screen does not expand that team content.
- Each distinct Codex query event id produces exactly one special-weapon grant. Duplicate delivery of the same id does not grant it again, send query text, or change weighted completion or boss health.
- Reloading or reconnecting reconstructs tasks, receipts, reviews, audit history, and game state without relying on animation state.
- Unauthorized members and connectors cannot read, publish, review, wake agents, or administer resources outside their grants.
- Every authoritative damage or health change opens the accepted project fact that caused it. A special-weapon grant identifies only its source member and stable query event id without pretending to be progress, while Team view preserves the complete workflow without game interaction.
- Default operation shares no complete private transcript and executes no remote agent command without the configured human approval.
- A participant can move the aircraft horizontally with the mouse or the `Left Arrow` / `Right Arrow` keys, rely on automatic ordinary fire, and activate a query-granted special weapon by clicking or pressing `Space`.
- Pausing, restarting, clearing the screen, enhancing fire, making kills, scoring, or damaging a local game boss can change only the leisure game, never tasks, Project Context, weighted completion, or the project core.

## Risks

- Structured digests can omit nuance, erase disagreement, or misstate human judgment. Facts, judgments, agent suggestions, and failed attempts must remain distinct, and every digest needs provenance, version, freshness, and a correction path.
- Personal conversations can contain secrets, personal data, unreleased code, or unrelated material; preview, sensitivity, recipient, redaction, retention, export, and deletion controls are required.
- Board-to-agent content can carry prompt injection or malicious artifact links; connectors must treat it as untrusted input and preserve local permission checks.
- Human, agent, connector, and system identities can be confused; audit events must distinguish them and forbid agent actions from appearing as human actions.
- Agent products expose different continuation, push, attachment, and approval capabilities; the generic protocol may need capability negotiation and polling fallbacks.
- Reconnect and retries can duplicate tasks, reviews, or damage; stable ids, idempotency, acknowledgement, and replay rules are required.
- Central context can become stale or unmanageably large; packets need audience, expiry, supersession, and task-scoped retrieval.
- Original artifact copies can contain malicious files, secrets, personal information, unauthorized code, or copyrighted material. Uploads need permissions, type and size limits, scanning, hashing, retention, deletion, and access audits.
- Task-scoped Context assembly can leak information across projects or create recursive summary drift. Retrieval must enforce project and audience permissions, retain the provenance chain, and prevent summaries with no new source from being treated repeatedly as new facts.
- Game feedback can trivialize serious work or become performance surveillance; individual damage rankings stay out of scope and evidence remains primary.
- Query weapon rewards can encourage message spam or expose work patterns. Query Pulses contain no content or performance score, use short retention, and support per-user opt-out. The interface may coalesce visual notices but must not merge the weapon entitlement of distinct event ids.
- Weighted criteria can be badly configured or manipulated; project owners need transparent totals, review ownership, reopen behavior, and change history.
- A public deployment introduces authentication, tenant isolation, encryption, operations, abuse, and compliance obligations beyond the current local Harness trust model.
