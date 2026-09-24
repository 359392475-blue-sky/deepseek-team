---
description: "Use and develop the experimental Team Battle project space and conversation flight sidecar."
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-client-ui-team-battle

English | [中文](README.zh.md)

## Summary

Create a shared project, invite colleagues, publish selected files, and move tasks through handoff and independent review. Team Space shares the application sidebar and light or dark theme; associated local conversations show the project’s active members. Personal conversations remain on each device. An optional flight game provides a break while AI works without changing project progress.

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

Select **Team Space** near New Session and Plugins in the main sidebar, or open the application with `#team` (also accepts `?team=1`). Joined server projects appear above personal workspaces in the same sidebar. The selected project opens in the main column with its goal and active collaborators; no second sidebar is drawn. No private session is required, and the conversation view retains a Team entry. The page polls Team and file projections and sends a presence heartbeat. It provides:

- a shared project list, focused creation and joining dialogs, one-use invitation links, membership management, and current presence;
- a file table with folders, breadcrumbs, sorting, selection, and version and source details;
- explicit byte uploads, safe image/text previews, downloads, renaming, and deletion;
- downloads for personal AI work, plus a legacy local Codex delivery queue whose status changes only after receiver acknowledgment;
- create, edit, claim, hand off, release, submit, reopen, and delete task actions with displayed revisions;
- explicit Context publication with decisions, blockers, next steps, and source references;
- artifact metadata publication with task, URI, media type, byte count, and SHA-256 digest;
- terminal human review as accepted or changes requested; and
- current activity, project revision, and accepted-weight progress.

The Files tab is the default. Publishing requires a selected local file and explicit confirmation; private chat is never imported. A file can be submitted to a claimed task for review. The Review tab starts with artifact cards, their task titles, and the uploaded file version labels; manual external-link submission is collapsed below the list. A queued delivery means that the connector has not acknowledged receipt, and does not imply that a Codex prompt has run. This page does not start a receiver or a Codex process.

When the Host enables `allowSimulation`, the page displays **Local simulation** and an acting-member selector. The selection belongs to this page only; every read, heartbeat, and mutation carries that member without changing other browser tabs. With simulation disabled, the page keeps the configured member and hides this control. The author cannot review their own artifact; another member can request changes, after which the author uploads and submits a revised file for a new review.

An accepted artifact may complete its task. Completed tasks therefore have no reopen control. The task counter shows only the current count because the deployment limit is not part of the browser projection.

### Start or join a server project

Use **Start a team project** from the home composer or team sidebar to enter the project name and goal and your name and role. The focused form contains no management tabs, server address, or authorization-code field. The Host uses the configured shared server and resolves its creation credential locally. It stores the returned member credential; browser storage holds only the selected project ID. If the service rejects authorization, the form asks the administrator to check the service configuration and retains the project fields for retry.

After creation, **Invite a colleague** generates an expiring, one-use HTTPS invitation link with a specified name and role. Copy the link and paste it into **Join with an invitation** in the colleague’s app; successful joining opens the project. Failed joining retains the link and explains incomplete, expired, revoked, used, or offline recovery; technical details are collapsed with invitation credentials removed. The owner can revoke pending invitations and remove members while retaining published work for remaining members. **What is shared?** explains publication and displays the shared data location.

Use **Open project conversation** beside a sidebar project to choose an existing local workspace or another local folder. The Host saves this device’s project association without uploading the directory. The home composer and conversation header then show only active members of that associated project. Unlinked personal workspaces show no team roster.

Members keep their model configuration, sessions, and unpublished working directories on their own devices. **Copy task for my AI** includes the project goal, the member's role, published notes in chronological order, shared file paths, version labels and IDs, and the task's review feedback. **Copy shared context for my AI** on Meeting notes includes all tasks and reviews. Clipboard failure exposes selectable text; unpublished form drafts are excluded. File contents must be downloaded separately into the member's project folder. The shared space does not synchronize source directories or start another member's agent. Tasks, entered meeting notes, explicitly selected complete files, review decisions, and member presence are shared. The upload dialog names the destination and explains publication before sending bytes. Published file contents are immutable: version labels do not overwrite files. A sibling file or folder with the same name blocks publication; local checks and server conflict responses retain the selected file and form input for renaming. Publish revisions under new names or in separate version folders. Hosted and joined spaces do not offer the legacy Codex queue because their local connector cannot consume that server queue.

The task page explains the sequence from creation through claim or handoff, explicit file publication and submission, independent review, and completion or revision. Handoff selects an active next assignee and can publish a note. No private transcript is attached. The space owner can reassign unfinished work; the current assignee can pass on their own work. The Team profile hides the Trajectory view.

### Play beside Chat

The Chat view keeps the ordinary transcript and composer intact. The game starts as a collapsed **Expand game** row for breaks while AI works; it never opens automatically. The expanded panel uses at most 280 pixels and 28% of a wide Chat viewport, while narrow screens cap it at half the viewport height. The composer stays centered with the transcript in every game state: the full Chat column when collapsed or stacked, and the remaining column beside the expanded game. Collapsing stops animation and retains the current score, lives, and pause state until the Chat surface unmounts. Move with the pointer or focus the canvas and use Left/Right Arrow; the formation fires ordinary shots automatically. Pause and restart affect only browser-local game state.

A distinct human Query grants one durable weapon. The inventory refreshes from `weaponGrants`; click its control or focus the canvas and press Space to call `teamBattle/consumeWeapon`. A successful consumption clears current enemies and damages only `combatShield`. Ordinary shots, collisions, score, lives, pause, and restart never call a project-progress mutation. `progress`, `coreHp`, and `combatShield` are displayed as separate values.

The canvas uses the original assets in [`src/assets`](src/assets), copied from the repository's Team Battle flight prototype. Reduced-motion preferences remove decorative movement and flash while preserving controls and game state.

## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

[`src/client/mount.ts`](src/client/mount.ts) mounts the generated Remote contribution, bilingual dictionaries, a keyed `main` panel, navigation in `sidebar.panellist`, and the shared project list in `sidebar.sections`. It also contributes home actions, the Team Edition badge, workspace-associated members in the conversation header, the `team` conversation view, and the single flight sidecar. The application shell owns navigation and conversation state. Actions return typed Remote results.

[`src/client/useTeamBattleLive.ts`](src/client/useTeamBattleLive.ts) performs latest-wins polling, suppresses poll commits while a mutation is in flight, and reports presence. Every successful mutation replaces the complete projection. [`src/client/TeamSpaceView.tsx`](src/client/TeamSpaceView.tsx) owns transient forms and tab selection. [`src/client/FlightCanvas.tsx`](src/client/FlightCanvas.tsx) owns only non-durable movement, enemies, collisions, score, and lives.

No runtime invariant companion is published: the package renders Host projections and keeps disposable browser game state, with no independently observed runtime relationship to compare.

</details>

## Further Exploration

- [Team Battle service](../team-battle/README.md) — durable aggregate, mutations, Query grants, and progress rules.
- [Team Battle Web profile](../team-battle-web-profile/README.md) — browser and connector composition.
- [Conversation Chat](../../client/ui-chat/README.md) — owner of the optional sidecar slot.
- [Conversation UI](../../client/ui-conversation/README.md) — owner of view navigation.

## Model Experience

### Browser-only Team controls

#### What the model sees

The package does not automatically add model input. Clipboard actions prepare localized text from published project data for the user to paste into a personal conversation. That text enters model history only when the user sends it through the normal composer. The package registers no model-facing tool or Session event; `ctx.remote.teamBattle` reads and mutations stay outside model history.

#### Token effect

Zero direct tokens. Polling, presence, form submissions, game frames, and weapon consumption do not enter a model request. A user-sent shared-context message consumes tokens according to the copied project content.

#### KV Cache effect

Independent. Browser-only reads and mutations do not alter the model request or its reusable prefix.

## Known Limitations and Deferred Work

- **Polling rather than push** — each mounted surface refreshes periodically; the first version does not consume a dedicated browser event stream.
- **Explicit file exchange** — server membership shares published artifacts, not a synchronized source checkout or remote control of colleagues’ AI.
- **Invitation link landing page** — pasting the link in the client joins the project. Opening it in a browser requires the shared server’s invitation page to be deployed; this client package does not deploy that page.
- **Receiver setup** — file delivery requires an authenticated Codex connector to pull and acknowledge the queue; this client does not install or run external agents.
- **Local leisure state** — refreshing the page resets flight score, lives, enemies, and pause state by design.

### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The flight composition follows `apps/web/prototypes/team-battle-flight/concepts/chat-game-v3/unified-flight-deck.png`. Team Space uses the application’s theme tokens and shared control primitives. Keep project progress and leisure combat state visibly and behaviorally separate; game callbacks must not mutate tasks, artifact review, or accepted-weight progress.

</details>
