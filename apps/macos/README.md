# `@deepseek-ai/dsh-macos-team-battle-app`

English | [中文](README.zh.md)

This private workspace builds the Apple Silicon `DeepSeek Harness 团战版.app` for version `0.1.7-alpha.2`. The native SwiftUI shell owns one bundled Node.js process and one `WKWebView` that displays the existing Team Battle Web product. It does not introduce another agent runtime, transport, or execution sandbox.

## Runtime behavior

Each fresh app process presents one native folder picker. The selected directory is the child process working directory, project `.env` location, default workspace, and instruction root. Opening the picker from a ready session leaves that session running until another directory is confirmed; cancellation preserves the current session. Closing the window leaves Harness running, while quitting the app supervises child-process shutdown.

The launcher invokes the bundled runtime as `dsh --profile team-battle --host 127.0.0.1 --port <port> --no-open`. Its private entry initializes the profile with these ordered layers before importing the real CLI:

1. `@deepseek-ai/dsh-base`
2. `@deepseek-ai/dsh-web-app`
3. `@deepseek-ai/dsh-experimental-team-battle-profile`
4. `@deepseek-ai/dsh-experimental-team-battle-web-profile`

Profile initialization creates missing files but never overwrites an existing profile manifest or user patch. The app sets `DSH_HOME` to `~/Library/Application Support/DeepSeek Harness Team Battle`, so Team Battle profiles, settings, credential references, sessions, and storage do not share `~/.dsh` with the personal app or CLI. The selected workspace remains the source of the project `.env`.

The launcher first uses its saved Team Battle port or `3080`. If that port is unavailable, it retries once with a system-selected port and never terminates the process that owns the requested port. It loads only the complete loopback readiness URL emitted by the current process, preserving its `/?token=...` authentication query and appending `#team` to open Team Space directly. The fragment survives the authentication redirect that removes the token query; the general authentication handler needs no Team Battle route exception. A streaming filter withholds incomplete readiness lines and replaces the token before stdout or stderr reaches the UI or rotating file log, including when the token is split across process-output chunks. The authenticated URL remains available only to the embedded browser and the explicit “Open in Browser” controls. Those controls read the current ready URL, so a restart replaces the prior port and token. Launcher output is stored with owner-only permissions at `~/Library/Logs/DeepSeek Harness Team Battle/launcher.log`, rotates at 5 MB with three retained files, and is bounded to 500 lines and 256 KB in the UI.

The process starts in a verified independent process group. The launcher samples descendant identities for best-effort cleanup of detached children and avoids signaling a reused PID. Stop and Quit allow the Node cleanup window before force-stopping only the verified group and still-matching observed descendants. Output pipes are nonblocking and bounded per drain, so inherited pipe handles and continuous output cannot indefinitely delay finalization.

The Web view installs fail-closed rules that restrict HTTP, WebSocket, blob, navigation, and download traffic to the exact readiness origin. External user-activated links open in the default browser. File input and download flows use native panels; downloads first use a Team Battle-specific hidden staging name and atomically replace the selected destination only after WebKit reports completion. Renderer or navigation failure receives one automatic reload before the app presents explicit reload, service restart, and log controls. The window toolbar also provides Reconnect and Open in Browser while ready; Reconnect replaces the Web view using the current authenticated Team Space URL, including when an in-page `Failed to fetch` error does not trigger a WebKit navigation failure.

An unexpected service exit after readiness triggers one automatic restart in the same workspace, after the old process group has stopped. A second exit stops automatic recovery and presents Retry, Change Project, and View Log. Explicit Start or Restart begins a fresh recovery allowance; Stop and Quit never restart the service. This recovery does not resubmit a user request or an unfinished mutation.

## Build, test, and install

The build requires Apple Silicon macOS 15 or later, Swift, Node.js `v22.22.3`, pnpm, and the standard macOS icon and signing tools. From the repository root:

```sh
pnpm run build:macos
pnpm run test:macos
pnpm run install:macos
```

`build:macos` cleans and builds Harness, packs the release families, deploys the locked production dependency closure, copies the private Team Battle runtime entry, embeds arm64 Node, isolates every regular runtime file from shared inodes, prunes only identified foreign or unsupported native payloads, and ad-hoc signs the result at `dist/macos/DeepSeek Harness 团战版.app`. The source manifest covers the CLI, Web app, macOS wrapper, packages, vendored sources, Python, native sources, patches, scripts, snapshots, website, and required root build and legal files while excluding generated outputs. Native sources, manifests, and build scripts remain covered; generated build directories and package `bin`/`lib` outputs under `native/system` and `native/landlock-run` are excluded.

`test:macos` validates source freshness, Swift behavior, token redaction, runtime inode isolation, CLI version, the four Team Battle profile layers, Team host and browser artifacts, an authenticated HTTP boot whose page includes the Team Battle client entry, native architectures, deployment targets, shutdown, pruning, and signatures.

`install:macos` targets only `/Applications/DeepSeek Harness 团战版.app` with bundle identifier `com.bluesky.deepseek-harness-team-battle`. It never replaces `/Applications/DeepSeek Harness.app`. Recoverable backups live under `~/Library/Application Support/DeepSeek Harness Team Battle/Backups` and use the `DeepSeek Harness Team Battle-*.app` namespace. The installer rejects a running target, unexpected identity, symlinks, invalid signatures, stale source, unsafe backup candidates, and writable installed resources; replacement failures restore and reseal the previous Team Battle app.

## Security and limitations

The embedded server binds only to `127.0.0.1`, and `NSAllowsLocalNetworking` is the only App Transport Security exception. App Sandbox remains disabled because the coding agent and its managed processes need the selected workspace and user-configured tools; Harness permission policy remains the execution control.

The default source build is arm64-only and ad-hoc signed for local use; it does not perform Developer ID signing or Apple notarization. The separately distributed Team Battle ZIP contains a Developer ID signed and Apple-notarized app; see the [download and installation entry](../../README.md#start-team-battle). Installed resources are read-only as a packaging guard, not a security sandbox. Rebuild and test the complete bundle before installing an updated version; never patch a built or running app in place.
