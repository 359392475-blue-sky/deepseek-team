# Agent Note: Team Battle native macOS application

Status: implemented

English | [中文](2026-08-31-team-battle-native-macos-application.zh.md)

## Problem

The Team Battle project space needs a double-clickable desktop product that owns its runtime and remains available after a development preview process ends. A loopback browser link does not launch Harness, cannot select the working directory before boot, and becomes unreachable when its temporary server exits. Reusing the personal `DeepSeek Harness.app` name or home would also overwrite that application or let two products contend over the same settings, sessions, and storage files.

DeepSeek Harness authenticates a new Web process with a token-bearing loopback readiness URL. The native carrier must give that complete URL to its private `WKWebView` while preventing the token from entering launcher UI or durable logs.

## Decision

**`DeepSeek Harness 团战版.app` is a separate SwiftUI application with its own process, bundle identity, state home, logs, installation target, and backups.** It installs beside the personal application under `/Applications`, uses `com.bluesky.deepseek-harness-team-battle`, and stores Harness state under `~/Library/Application Support/DeepSeek Harness Team Battle`. The selected project remains the child process working directory, so its `.env`, instructions, and workspace files stay available without copying credentials into the application bundle.

**A private runtime entry initializes the Team Battle profile without changing the public CLI profile templates.** Before handing control to the normal `dsh` entry, it creates the `team-battle` profile when absent with `@deepseek-ai/dsh-base`, `@deepseek-ai/dsh-web-app`, `@deepseek-ai/dsh-experimental-team-battle-profile`, and `@deepseek-ai/dsh-experimental-team-battle-web-profile`. The application launches `dsh --profile team-battle` on an exact `127.0.0.1` origin with `--no-open`; the two Team Battle bundles therefore participate as real profile layers and their dependency fallback contains the backend, connector, and browser client packages. This private deployment root may depend on experimental packages, but release-family discovery and official runtime dependency checks continue to reject them from published applications.

**The launcher treats the authenticated readiness URL as an ephemeral secret.** Its incremental parser waits for and returns the complete token-bearing URL even when process output splits it across chunks. The Web view loads that URL once so the server can exchange the token for its cookie. Process output reaches in-memory and file logs only after a stateful line filter replaces the token value with a fixed redacted value while retaining the loopback origin and port for diagnostics; neither a complete token nor a token suffix from a later chunk is retained. Browser navigation and subresources remain restricted to the emitted loopback origin, not to the query-bearing URL.

**The application remains a self-contained local build.** The bundle includes the fixed arm64 Node runtime, the locked production dependency closure, built Client and Host artifacts, the Team Battle packages, license notices, and the native shell. Build, test, and installation each verify the source manifest, and installation replaces only the distinct Team Battle application after confirming that its native executable and bundled Node process are stopped. Application resources remain sealed instead of being updated in place.

The shared project behavior remains owned by the [Team Battle project-space decision](2026-08-31-team-battle-shared-project-space.md). The native application changes launch, packaging, and local state ownership; it does not give entertainment damage authority over project progress.

## Verification

Swift tests cover profile launch arguments, complete and split readiness URLs, token redaction, dedicated state paths, process lifecycle, exact-origin WebKit policy, renderer recovery, file panels, downloads, and installation preflight. The packaged-runtime test boots the real `team-battle` profile in a temporary home, verifies its four bundle layers and embedded Team Battle client, receives authenticated HTTP content, and shuts down without leaving the listener or child processes alive. Bundle checks also verify source freshness, dependency-file isolation, arm64 and macOS 14 targets, native pruning, and the complete ad-hoc signature before installation.

## Alternatives considered

**Keep the browser preview as the product.** Rejected because a preview URL depends on an external process and does not provide a double-clickable desktop lifecycle.

**Overwrite the personal `DeepSeek Harness.app` or share `~/.dsh`.** Rejected because the products must coexist and concurrent processes must not write the same global state files. Separate state requires Team Battle credentials to come from its selected project `.env` or be configured again.

**Add `team-battle` to the public CLI's shipped profile templates.** Rejected because official npm artifacts intentionally exclude private experimental packages. A public template that names unavailable bundles would initialize successfully and then fail during module resolution.

**Pass two loose patch files over the stock `web` profile.** Rejected because profile layers own module-fallback healing. Naming Team Battle plugins only from an external overlay would not reliably make their private packages resolvable from the installed profile.

**Copy credentials into the bundle.** Rejected because application resources are distributable artifacts and credentials remain user state.

## Consequences

The user receives a native Team Battle application that survives terminal and preview shutdown, opens directly into the intended profile, and coexists with the personal application. The authenticated startup path works in a fresh WebKit data store without persisting its token.

The application is Apple Silicon-only, large because it embeds Node and the production dependency closure, and ad-hoc signed for this Mac. It is a Local Beta rather than a notarized redistributable build. A newer Harness or Team Battle implementation enters the application only through a complete rebuild, test, and installation. The dedicated state home prevents file contention but does not automatically inherit settings, sessions, or credential references from the personal application.
