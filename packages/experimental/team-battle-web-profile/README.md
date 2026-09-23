---
description: "Private Web profile layer for Team Battle browser UI and authenticated Codex event ingress."
kind: "package-bundle"
---

# @deepseek-ai/dsh-experimental-team-battle-web-profile

English | [中文](README.zh.md)

## Summary

`dsh-experimental-team-battle-web-profile` adds the real Team Battle browser surfaces and the authenticated Codex HTTP connector to a Web profile that already mounts the Team Battle project service. The browser keeps the private Harness conversation beside a playable airplane game and provides a separate Team view for members, tasks, published context, artifacts, reviews, provenance, and activity.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Add this layer after `dsh-web-app` and `dsh-experimental-team-battle-profile`. Set `TEAM_BATTLE_CODEX_TOKEN` before sending connector events; a missing credential leaves the UI usable but makes the connector answer unavailable instead of accepting unauthenticated input.

This layer disables the Trajectory UI in Team Battle only. The standard Web profile retains it. The optional flight game starts collapsed and can be expanded for a short break without replacing Chat.

Adding a workspace opens the directory browser inside the Team Battle window, including the macOS application. It browses the Host machine; selecting a workspace does not publish its files to Team Space.

The first connector accepts only content-free Query pulses. Browser Remote calls handle user-confirmed status, Context, artifact, task, and review changes; they do not pass through the Codex connector. Query retries reuse one event id, and the connector never receives the raw private conversation.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals</summary>

[`cordis.patch.yml`](cordis.patch.yml) inserts the credential-protected HTTP adapter and the browser plugin, and disables `ui-trajectory` in this composition. It replaces the automatic directory picker with the Host and UI browse plugins so workspace selection remains visible in the application. The browser plugin mounts the generated `teamBattle` Remote contribution, provides a collapsible Chat game, and contributes the full Team page as a Conversation view. The connector authenticates independently of browser cookies because personal Codex processes do not share a browser session.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Team Battle browser UI](../client-ui-team-battle/README.md) — playable game and shared Team page.
- [Team Battle HTTP connector](../team-battle-connector-http/README.md) — Codex event envelope and authentication.
- [Team Battle Host profile](../team-battle-profile/README.md) — project configuration and durable domain.

-----

<a id="model-experience"></a>
## Model Experience

### Codex relay

#### What the model sees

Nothing is injected automatically. Published Team context remains a project fact until a user explicitly chooses delivery through a future `teamBattle` connector operation to a personal agent; Query pulses contain no text.

#### Token effect

Zero direct tokens in this first Web layer.

#### KV Cache effect

None until a future connector performs a user-approved context injection.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Connector token is profile-wide** — the first adapter authenticates one trusted Codex connector secret; per-member rotating tokens are deferred.
- **No silent wake-and-run** — the board records shared facts but does not turn inbound text into commands or tool calls.
- **Public account auth remains separate** — browser process authentication is suitable for a private preview, not production human identity or tenant isolation.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers</summary>

This profile already inserts the browse picker plugins. Do not also apply `apps/web/tests/pin-browse-picker.overlay.yml`: that standalone Web test overlay inserts the same plugin IDs.

</details>
