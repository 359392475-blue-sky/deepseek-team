---
description: "Use and develop the experimental Team Battle project space and conversation flight sidecar."
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-client-ui-team-battle

English | [中文](README.zh.md)

## Summary

This private Web package presents the authoritative Team Battle project as a root-level `Team Space` page and adds an optional flight game beside ordinary Chat. Both surfaces call the generated `ctx.remote.teamBattle` service; neither stores a second project model. The Team view manages members, weighted tasks, published Context, artifact provenance, human review, and activity. The game uses browser-local score and lives, while Query-derived weapon grants, the leisure combat shield, project progress, and core HP remain Host projections.

Use this package through the experimental Team Battle Web profile. It is not a stable public extension point.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

## Use this package

Apply [`@deepseek-ai/dsh-experimental-team-battle-web-profile`](../team-battle-web-profile/README.md) after the stable Web profile and the Host-side Team Battle profile. The Client loader mounts this package's `/client` export and the generated [`@deepseek-ai/dsh-experimental-team-battle/remote`](../team-battle/README.md) contribution. The root Host export is inert, and the package has no configuration fields.

### Work in Team Space

Select **Team Space** in the sidebar, or open the application with `#team` (also accepts `?team=1`). No private session is required. The conversation view also retains a Team entry. The page polls the Team and file projections and sends a presence heartbeat. It provides:

- a project selector, server-space creation, one-use invitations, membership management, and current presence;
- a file table with folders, breadcrumbs, sorting, selection, and version/provenance details;
- explicit byte uploads, safe image/text previews, downloads, renaming, and deletion;
- downloads for personal AI work, plus a legacy local Codex delivery queue whose status changes only after receiver acknowledgment;
- create, edit, claim, hand off, release, submit, reopen, and delete task actions with displayed revisions;
- explicit Context publication with decisions, blockers, next steps, and source references;
- artifact metadata publication with task, URI, media type, byte count, and SHA-256 provenance;
- terminal human review as accepted or changes requested; and
- current activity, project revision, and accepted-weight progress.

The Files tab is the default. Publishing requires a selected local file and explicit confirmation; private chat is never imported. A file can be submitted to a claimed task for review. The Review tab starts with artifact cards, their task titles, and the uploaded file version labels; manual external-link submission is collapsed below the list. A queued delivery means that the connector has not acknowledged receipt, and does not imply that a Codex prompt has run. This page does not start a receiver or a Codex process.

When the Host enables `allowSimulation`, the page displays **Local simulation** and an acting-member selector. The selection belongs to this page only; every read, heartbeat, and mutation carries that member without changing other browser tabs. With simulation disabled, the page keeps the configured member and hides this control. The author cannot review their own artifact; another member can request changes, after which the author uploads and submits a revised file for a new review.

An accepted artifact may complete its task. Completed tasks therefore have no reopen control. The task counter shows only the current count because the deployment limit is not part of the browser projection.

### Start or join a server project

Use **Start a project** to enter the shared HTTPS server address, its administrator-provided creation authorization code, the project name and goal, and your name and role. The local Host stores your member credential; browser storage holds only the selected project ID. **Invite a colleague** generates an expiring, one-use invitation with a specified name and role. The colleague pastes it into **Join with an invitation** in their own app. The owner can revoke pending invitations and remove members; previously published work remains available to remaining members. The selected space displays its shared data location. The existing configured project remains explicitly labeled as local simulation.

Get the complete creation authorization code from the server's deployment administrator. It is not a new project password or a personal model API key. If the server rejects it, the form explains how to check the server address and code while retaining the project and member fields for retry. Successful creation clears the code; it is never saved in browser storage.

Members keep their model configuration, sessions, and unpublished working directories on their own devices. Tasks can be copied into a personal AI conversation, and shared files can be downloaded. The shared space does not synchronize source directories or start another member's agent. Tasks, entered meeting notes, explicitly selected complete files, review decisions, and member presence are shared. The upload dialog names the destination and explains publication before sending bytes. Hosted and joined spaces do not offer the legacy Codex queue because their local connector cannot consume that server queue.

The task page explains the sequence from creation through claim or handoff, explicit file publication and submission, independent review, and completion or revision. Handoff selects an active next assignee and can publish a note. No private transcript is attached. The space owner can reassign unfinished work; the current assignee can pass on their own work. The Team profile hides the Trajectory view.

### Play beside Chat

The Chat view keeps the ordinary transcript and composer intact. The game starts as a collapsed **Expand game** row for breaks while AI works; it never opens automatically. The expanded panel uses at most 280 pixels and 28% of a wide Chat viewport, while narrow screens cap it at half the viewport height. Collapsing stops animation and retains the current score, lives, and pause state until the Chat surface unmounts. Move with the pointer or focus the canvas and use Left/Right Arrow; the formation fires ordinary shots automatically. Pause and restart affect only browser-local game state.

A distinct human Query grants one durable weapon. The inventory refreshes from `weaponGrants`; click its control or focus the canvas and press Space to call `teamBattle/consumeWeapon`. A successful consumption clears current enemies and damages only `combatShield`. Ordinary shots, collisions, score, lives, pause, and restart never call a project-progress mutation. `progress`, `coreHp`, and `combatShield` are displayed as separate values.

The canvas uses the original assets in [`src/assets`](src/assets), copied from the repository's Team Battle flight prototype. Reduced-motion preferences remove decorative movement and flash while preserving controls and game state.

## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

[`src/client/mount.ts`](src/client/mount.ts) mounts the generated Remote contribution, registers bilingual dictionaries, and contributes disposable root navigation and `shell.overlay` entries, list entry `team` in `conversation.view`, and the single `conversation.chat.sidecar` flight panel. The root page preserves private conversation state beneath it. Actions return typed Remote carriers for the project, file-space, or file-content projection.

[`src/client/useTeamBattleLive.ts`](src/client/useTeamBattleLive.ts) performs latest-wins polling, suppresses poll commits while a mutation is in flight, and reports presence. Every successful mutation replaces the complete projection. [`src/client/TeamSpaceView.tsx`](src/client/TeamSpaceView.tsx) owns transient forms and tab selection. [`src/client/FlightCanvas.tsx`](src/client/FlightCanvas.tsx) owns only non-durable movement, enemies, collisions, score, and lives.

</details>

## Further Exploration

- [Team Battle service](../team-battle/README.md) — durable aggregate, mutations, Query grants, and progress rules.
- [Team Battle Web profile](../team-battle-web-profile/README.md) — browser and connector composition.
- [Conversation Chat](../../client/ui-chat/README.md) — owner of the optional sidecar slot.
- [Conversation UI](../../client/ui-conversation/README.md) — owner of view navigation.

## Model Experience

### Browser-only Team controls

#### What the model sees

Nothing from this package. It registers no model-facing prompt, tool, or Session event; `ctx.remote.teamBattle` reads and mutations stay outside model history.

#### Token effect

Zero direct tokens. Polling, presence, form submissions, game frames, and weapon consumption do not enter a model request.

#### KV Cache effect

Independent. Browser-only reads and mutations do not alter the model request or its reusable prefix.

## Known Limitations and Deferred Work

- **Polling rather than push** — each mounted surface refreshes periodically; the first version does not consume a dedicated browser event stream.
- **Explicit file exchange** — server membership shares published artifacts, not a synchronized source checkout or remote control of colleagues’ AI.
- **Receiver setup** — file delivery requires an authenticated Codex connector to pull and acknowledge the queue; this client does not install or run external agents.
- **Local leisure state** — refreshing the page resets flight score, lives, enemies, and pause state by design.

### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The flight composition follows `apps/web/prototypes/team-battle-flight/concepts/chat-game-v3/unified-flight-deck.png`; Team Space follows `team-space-page.png`. Keep project progress and leisure combat state visibly and behaviorally separate. Do not add game callbacks that mutate tasks, artifact review, or accepted-weight progress.

</details>
