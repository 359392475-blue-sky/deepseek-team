---
description: "Bearer-authenticated exact-route HTTP ingress and a content-free Codex UserPromptSubmit helper for Team Battle Query events."
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-team-battle-connector-http

English | [中文](README.zh.md)

## Summary

Colleagues can share explicitly published projects, tasks, and files through a fixed HTTPS Team server while private conversations stay in each local DeepSeek. The separate Team port accepts only project creation, invitation exchange, and authenticated Team operations; the existing Codex helper sends Query identity metadata without prompt text.

## Table of Contents

- [Plugin configuration](#plugin-configuration)
- [Shared Team server](#shared-team-server)
- [HTTP contract](#http-contract)
- [File delivery HTTP routes](#file-delivery-http-routes)
- [Codex UserPromptSubmit helper](#codex-userpromptsubmit-helper)
- [Security and operation](#security-and-operation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

<a id="plugin-configuration"></a>
## Plugin configuration

| Field | Meaning |
|---|---|
| `path` | Exact absolute non-root pathname without trailing slash, query, or fragment. |
| `secretEnv` | Credential reference containing the expected Bearer token. |
| `maxBodyBytes` | Positive safe-integer ceiling for the raw request body. |
| `maxNetworkBodyBytes` | Isolated Team request and response byte limit; defaults to 8388608. |
| `networkRequestTimeoutMs` | Team network request timeout in milliseconds; defaults to 15000. |
| `invitationDownloadUrl` | Optional HTTPS client download or installation page linked from invitation guidance. |
| `hostedServer` | Optional startup hosting: `host`, `port`, and `accessTokenRef`; omission leaves the shared listener stopped. |

`path`, `secretEnv`, and `maxBodyBytes` are required. An invalid route or credential-reference name fails at load. The credential value is resolved for every request, so rotation affects the next request; a currently missing value returns `503` without admitting an event.

<a id="shared-team-server"></a>
## Shared Team server

The separate listener accepts mutations only through exact `POST /create`, `POST /join`, and `POST /call` routes. `/create` requires the deployment Bearer creation code, `/join` exchanges an invitation and a device-generated member token, and `/call` requires a member Bearer token. The Team domain derives project membership and permissions from that token; requests cannot use role simulation to change identity. `GET /` and `HEAD /` expose invitation guidance; the page checks the fragment format locally and explains how to obtain a compatible client, paste the full link into “Join by invitation link”, and begin a task handoff. The copy button preserves the complete URL; same-tab fragment navigation refreshes validity and resets copy feedback, and a pending clipboard result cannot overwrite another invitation’s guidance. Clipboard denial offers manual-copy guidance. `invitationDownloadUrl` adds an administrator-provided HTTPS installation link and fails at load for invalid URLs, credentials, or fragments. Invitation expiry and membership are checked only when joining in the local app. Fragments are not sent to the server; the page never joins automatically, performs network requests, or loads third-party resources. Other paths, including `/api`, return `404`, and mutation requests carrying a browser `Origin` are rejected.

Each app proxies Team requests through its own local Host. Addresses allow HTTPS servers and reverse-proxy prefixes, such as `https://lowpower.me/team-battle`; HTTP requires a private literal IP. Addresses cannot contain credentials, query, fragment, or ambiguous paths. The proxy bounds request and response bytes, refuses redirects, and never retries business operations automatically. `POST /create` returning HTTP 401 becomes the browser Remote error `team-battle/server-auth-required`, with `{ httpStatus: 401 }`; an administrator should restore the local Host service connection configuration before the user explicitly retries. The response body and supplied code are never included in that error. A sibling file or folder name collision returns HTTP 409 with the allowlisted code `team-battle/name-conflict`; the local Host reconstructs that Remote error with fixed safe guidance and `{ httpStatus: 409 }`, ignoring server messages and details. Only an HTTP 403 carrying `TEAM_BATTLE_ACCESS_DENIED` becomes a typed member-credential rejection; other server diagnostics stay private. After an interrupted request, users should read the Team state before deciding whether to retry.

The [standalone profile](deploy/profile/cordis.patch.yml) starts through `dsh --profile team-server`; place its [manifest](deploy/profile/package.json) and configuration in `profiles/team-server` under a dedicated `DSH_HOME`. It loads JSON storage, credentials, the Typert registry, and Team services without model, browser, terminal, Session, or directory APIs. The deployment environment supplies `TEAM_BATTLE_SERVER_ACCESS_TOKEN`; ordinary invited members must not receive this creation code. The Team listener binds `127.0.0.1:18864`; the reverse proxy supplies HTTPS and strips the public `/team-battle` prefix. Data lives in that `DSH_HOME` under `storages` and needs separate backups. Restarting an app or process does not resubmit business operations.

Artifact packaging uses [pack.mjs](deploy/pack.mjs) with an already built workspace to copy the real `dsh` CLI, this profile, and the minimal runtime dependencies; the server does not install or build the repository. Arguments are a new output directory followed by `linux-x64-gnu` or `darwin-arm64`. The Linux native-loader prebuild must match the workspace lockfile integrity value. The packaged [smoke.mjs](deploy/smoke.mjs) runs the original CLI with temporary data and checks the invitation landing page, creation, distinct owner/member credentials, single-recipient invitation redemption, shared-context readback after restart, and private API refusal; run `node smoke.mjs /absolute/runtime/path` on the matching platform.

The legacy Codex routes use another loopback-only, OS-assigned port; the standalone server leaves their credential unconfigured. Team file downloads read published bytes only and cannot browse member workspaces; private conversations, model credentials, and terminals are outside the separate listener's service set.

<a id="http-contract"></a>
## HTTP contract

The request must carry exactly one `Authorization: Bearer <token>` header and a JSON media type. After authentication, the connector reads bounded strict UTF-8 and accepts only this object:

```json
{"version":1,"type":"query","eventId":"codex:9:session-1:turn-2","memberId":"engineering","occurredAt":1788134400000}
```

Unknown fields are invalid. A sender cannot attach `prompt`, `query`, a transcript, or arbitrary metadata. The response body is the service receipt `{ eventId, duplicate, weaponId }` and never contains request content.

| Status | Meaning |
|---|---|
| `202` | A new Query event and its weapon grant were durably committed. |
| `200` | The event id was already committed; the original weapon id is returned. |
| `400` | JSON, event fields, or the addressed member were invalid. |
| `401` | The Bearer header or token was invalid. |
| `405` | Method was not `POST`. |
| `413` | Declared or streamed body exceeded `maxBodyBytes`. |
| `415` | Media type was not `application/json`. |
| `503` | Credential resolution, capacity, storage, or Team Battle was unavailable. |

<a id="file-delivery-http-routes"></a>
## File delivery HTTP routes

The same Bearer credential protects two additional exact `POST application/json` routes: `<path>/deliveries/pull` accepts `{ memberId }` and returns the oldest `{ delivery, content: { file, contentBase64 } }` or an empty object; `<path>/deliveries/ack` accepts `{ memberId, deliveryId, outcome: "delivered" | "failed", note? }` and returns the delivery record after persistence. Both return `200` on success and reject unknown fields. They require the service's configured local member by default; explicit `allowSimulation` permits any known roster member for a local exercise. The shared Bearer credential does not authenticate individual members.

Pull remains `queued` and is safe to retry; identical terminal acknowledgements are idempotent, while conflicting acknowledgements fail. Consumers must acknowledge `delivered` only after handing the bytes to local Codex; this is a connector attestation, not independently verified by the server. Installing the `UserPromptSubmit` helper alone does not consume file deliveries. Responses contain at most one file, bounded by the team space's per-file limit. Delivery creates no model message and changes no member presence.

<a id="codex-userpromptsubmit-helper"></a>
## Codex UserPromptSubmit helper

The `./codex-hook` export and `dsh-team-battle-codex-hook` binary use the bundled Node command entry at `lib/bin.js`. Configure these environment values in the process that starts Codex:

| Environment value | Meaning |
|---|---|
| `TEAM_BATTLE_URL` | Full connector URL, without credentials, query, or fragment. |
| `TEAM_BATTLE_TOKEN` | Bearer token matching the credential behind `secretEnv`. |
| `TEAM_BATTLE_MEMBER_ID` | Team Battle member receiving Query weapons from this Codex. |

Use this `hooks.json` entry from a project where the package is installed:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node ./node_modules/@deepseek-ai/dsh-experimental-team-battle-connector-http/lib/bin.js"
          }
        ]
      }
    ]
  }
}
```

The helper reads bounded JSON stdin but selects only `session_id` and `turn_id`. It constructs `eventId` as `codex:<session-id-byte-length>:<session-id>:<turn-id>`, sends the strict five-field event, writes no successful stdout, and exits nonzero with a content-free diagnostic when configuration, input, the network, or the endpoint fails. Retrying the same Codex turn constructs the same event id, so the service returns the original weapon instead of granting another one.

<a id="security-and-operation"></a>
## Security and operation

Use high-entropy credentials and expose the separate Team listener through HTTPS. This package does not terminate TLS or rate-limit requests; the reverse proxy owns those deployment controls. The legacy Codex routes use a shared token and do not replace Team membership authentication. This package never logs bodies, tokens, or prompt text.

No runtime invariant companion is published: request admission checks authentication and input, while the Team service owns project state and WebServer owns route registrations. The connector keeps no separate project projection to compare with those owners.

<a id="model-experience"></a>
## Model Experience

### Query signal transport

#### What the model sees

Nothing. The connector and `UserPromptSubmit` command helper run outside model request assembly and emit no hook stdout on success.

#### Token effect

Zero. The command helper discards prompt content and sends only Query identity metadata to Team Battle storage.

#### KV Cache effect

Independent. HTTP authentication and Query ingestion do not alter a model request or its reusable prefix.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Legacy Codex authority** — the Query and delivery routes retain a shared Bearer credential; only the separate Team listener uses member authentication.
- **No transport retry loop** — the helper exits nonzero on failure; the caller or user reruns the same turn-safe command when retry is appropriate.
- **No TLS or rate limiting** — deployment must provide these outside the package before exposing the route beyond a trusted loopback or private network.
- **Codex ids are required** — hook stdin without non-empty `session_id` and `turn_id`, or with either id over 200 UTF-8 bytes, fails without sending a request.

<a id="dev-note"></a>
### Dev Note

None.
