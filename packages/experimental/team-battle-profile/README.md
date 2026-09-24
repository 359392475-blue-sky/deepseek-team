---
description: "Private profile layer enabling the durable Team Battle project domain over dsh-base."
kind: "package-bundle"
---

# @deepseek-ai/dsh-experimental-team-battle-profile

English | [中文](README.zh.md)

## Summary

`dsh-experimental-team-battle-profile` adds the Team Battle shared-project service to a source-checkout profile. Its patch supplies one four-role starter raid with configurable members, storage limits, and Query shield damage. Project facts remain durable through the storage-domain stack already mounted by `dsh-base`; the browser and Codex HTTP adapter belong to the separate Web layer.

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

Initialize a private Team Battle profile from the source checkout by adding the Web application and both Team Battle layers:

```sh
pnpm dsh plugin --profile team-battle add ./packages/bundle/web-app
pnpm dsh plugin --profile team-battle add ./packages/experimental/team-battle-profile
pnpm dsh plugin --profile team-battle add ./packages/experimental/team-battle-web-profile
pnpm dsh --profile team-battle
```

Edit the patch before deployment to replace the starter member names, project objective, limits, local member identity, and presence timeout. `memberOfflineAfterMs` prevents a disconnected member from remaining visibly online; the starter layer uses 60 seconds. The default four roles are Product, Engineering, Quality, and UI; they are configuration, not a fixed permission model. The preserved local space displays the JSON storage directory resolved from `DSH_HOME`; server projects display their connected server address.

Project creation uses this Host layer’s `sharedServer` configuration, defaulting to `https://lowpower.me/team-battle` and credential reference `TEAM_BATTLE_SERVER_ACCESS_TOKEN`. Keep the value in the creating Host’s credential provider. Cordis replaces an entry’s `config` object when a later patch supplies one; an override must retain the required project fields and roster, not supply only `sharedServer`. The Web layer leaves the Host entry unchanged.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals</summary>

The package contains no runtime plugin body. [`cordis.patch.yml`](cordis.patch.yml) inserts `@deepseek-ai/dsh-experimental-team-battle` after `dsh-base`, whose storage hub, JSON backend, and domain form provide durable project state. The Team Battle service owns member, task, context, artifact, review, activity, Query-grant, and project-progress semantics.

No runtime invariant companion is published because this bundle contains only static composition and owns no runtime state; the configured services own their live relationships.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Team Battle service](../team-battle/README.md) — durable project facts and generated Remote methods.
- [Team Battle Web profile](../team-battle-web-profile/README.md) — browser UI and authenticated Codex ingress.
- [Team Battle product decision](../../../.agents/notes/proposed/feature/2026-08-21-team-battle-collaboration-edition.md) — product scope and privacy rules.

-----

<a id="model-experience"></a>
## Model Experience

### Shared project facts

#### What the model sees

Nothing from this static bundle by itself. The inserted Team Battle service records project facts and exposes the `teamBattle` Host Remote methods; a connector or UI must explicitly publish selected context.

#### Token effect

Zero direct request tokens.

#### KV Cache effect

None; the bundle does not alter model request prefixes.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Source-checkout only** — the package is private and excluded from official releases.
- **One configured project** — the first implementation owns one raid aggregate per profile rather than public multi-tenancy.
- **Deployment identity is not human account authentication** — a production `lowpower.me` deployment still needs an account and project-ACL carrier beyond the local Harness browser token.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers</summary>

None.

</details>
