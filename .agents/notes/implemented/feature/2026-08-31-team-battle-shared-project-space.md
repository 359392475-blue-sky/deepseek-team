# Agent Note: Team Battle shared project space and flight game

Status: implemented

English | [中文](2026-08-31-team-battle-shared-project-space.zh.md)

## Problem

People working with independent local Agents need shared project decisions, files, and delivery evidence without sharing their private conversations. Model activity and leisure-game scores cannot establish project completion.

## Decision

Team Battle keeps an independent directory of hosted and joined spaces, each with its own members and durable project records. The fixed deployment roster remains a separate legacy space. The [domain package](../../../../packages/experimental/team-battle/README.md) owns membership, invitations, revision checks, task handoff, file publication, and human review.

Shared servers retain only explicitly published collaboration data. Each person's local Host holds their member credential and proxies selected Team operations; private conversations, directory access, and local tools remain on that person's machine. The server derives the acting member from the credential and checks space membership before dispatch. Owner invitations and revocation manage access without changing attribution on retained work.

Project progress comes only from weighted tasks with accepted artifact reviews. Authors cannot review their own artifacts. Query-derived weapons affect only the repeatable game shield. Automatic content-free Query events belong to the legacy space; they do not publish private activity to joined teams.

The [Team client](../../../../packages/experimental/client-ui-team-battle/README.md) provides a dedicated coordination view and a separate conversation game sidecar. Private Host and Web profile layers compose the edition without changing the official bundles.

## Security and deployment boundary

The [HTTP connector](../../../../packages/experimental/team-battle-connector-http/README.md) exposes a separate, bounded Team listener with exact creation, invitation-join, and authenticated-call routes. It never mounts the private application API. A deployment credential authorizes project creation; member credentials authorize only their associated space. Public HTTPS belongs to the reverse proxy. Local simulation identities cannot cross the shared-server transport.

A queued file does not prove Codex execution. Legacy delivery acknowledgement is a connector's attestation, and shared-team files require explicit local download or use. Interrupted network operations are not replayed automatically.

## Alternatives considered

**Store full private conversations.** Explicit publication gives members control over what becomes shared project evidence.

**Use message volume or game score as completion.** Human-reviewed artifacts distinguish activity from accepted delivery.

**Extend Agent Teams.** Agent Teams coordinates subagents within one root Session; Team Battle coordinates people with independent local Agents and separately authenticated membership.

## Testing

Domain and connector tests cover persistence, invitation and credential checks, revoked access, revision-checked collaboration, review-derived progress, isolated listeners, bounded transfers, and non-replayed mutations. Real Loader tests cover optional hosting and server restart with retained project data. The assembled Web snapshot exercises the task and review flow through generated Remote methods.

## Consequences

A shared server can keep project records available independently of a participant's computer. Local credential storage and server-side membership checks keep private application access separate from team collaboration. TLS termination, server operation, and deployment-wide abuse controls remain operator responsibilities.
