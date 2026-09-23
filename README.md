# DeepSeek Harness · Team Battle

English | [中文](README.zh.md)

This repository contains the **Team Battle 0.1 collaboration edition**, based on upstream DeepSeek Harness `0.1.7-alpha.2`. It includes the frontend, backend, fixed shared-server implementation, and native macOS wrapper. The earlier browser prototype is preserved in [`legacy-prototype/`](legacy-prototype/).

## Team collaboration

- Create and select team projects, invite a named colleague, and join from another local client.
- Share tasks, entered collaboration notes, explicitly published files, and review decisions through a fixed HTTPS server.
- Claim or hand off work, submit an artifact, request changes, and accept a revised result.
- Keep model credentials, private AI conversations, and unpublished files on each member's own device.
- Use a compact, collapsible flight game while waiting for AI. The Team Battle profile hides the Trajectory view.

## Start Team Battle

Use this repository's source checkout. **The official npm package and the upstream commands below start standard DeepSeek Harness; they do not include these Team Battle customizations.**

1. Prepare Node.js and pnpm, install dependencies, and build the source following the [development setup](docs/development.md). The repository declares Node.js `^22.19.0 || >=24.0.0` and pnpm `11.7.0`.
2. For the Web client, follow the [Team Battle profile setup](packages/experimental/team-battle-profile/README.md#use-this-package) to add the Web and Team layers, then start the `team-battle` profile.
3. For the Apple Silicon macOS app, follow the [build and installation guide](apps/macos/README.md). This source release does not provide a notarized macOS download.
4. For collaboration across networks, deploy a [shared HTTPS Team server](packages/experimental/team-battle-connector-http/README.md#shared-team-server). The project creator obtains the complete creation authorization code from the server administrator; colleagues use individual invitations and keep their own model settings.

The shared server stores published project data. It does not synchronize working directories or run a colleague's AI automatically. See the [create, join, publish, and handoff guide](packages/experimental/client-ui-team-battle/README.md) for the complete product flow.

## Source map

| Component | Source and documentation |
| --- | --- |
| Team pages and optional game | [Frontend](packages/experimental/client-ui-team-battle/README.md) |
| Projects, members, tasks, files, and reviews | [Backend](packages/experimental/team-battle/README.md) |
| Shared server and HTTP transport | [Server deployment](packages/experimental/team-battle-connector-http/README.md) |
| Native macOS application | [Application wrapper](apps/macos/README.md) |

This is a source release. The repository retains upstream workflow files for source completeness; this personal showcase repository does not run the upstream automatic pipelines. The original MIT license and third-party notices are preserved. The following sections describe the upstream project.

## Upstream DeepSeek Harness

DeepSeek Harness (`dsh`) is an open-source agent harness developed by [DeepSeek AI](https://deepseek.com).

It is built on an **everything-is-a-plugin** architecture and powered by [Cordis](https://github.com/cordiverse/cordis), whose design is described in [_A Programming Paradigm for Spatiotemporal Composability_](https://arxiv.org/abs/2608.25512).

Documentation: [https://deepseek-harness.github.io/deepseek-harness/](https://deepseek-harness.github.io/deepseek-harness/)

### Developer preview

DeepSeek Harness is in _developer preview_ and iterating rapidly. **THERE WILL BE COMPATIBILITY-BREAKING CHANGES.**

Review the [safety notice](SAFETY.md) before running the project.

### Run

#### Run from `npm`

Install `Node.js`, then run:

```sh
npx @deepseek-ai/dsh web
```

The command starts the Web UI at `http://127.0.0.1:3080` by default and opens it in the default browser for a local launch. An SSH launch only prints the host URL because the SSH client or editor owns the local forwarded address. Pass `--no-open` to run the server without opening a browser. See [Web UI guide](docs/user/guide/index.md).

#### Run from source

To run from a repository checkout:

```sh
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
pnpm install
pnpm run build
pnpm dsh web
```

`pnpm run build` prepares the repository artifacts. `pnpm dsh web` uses those built artifacts without rebuilding.

### Community and support

- Submit feedback or bug reports through [GitHub Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions).
- Add the [`dsh-plugin`](https://github.com/topics/dsh-plugin) topic to your plugin repository for discoverability.
- Join <a href="https://discord.gg/Ycq5dCaS4">DeepSeek Harness Discord community</a>.

### Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

### Development

Start with the [development guide](docs/development.md) and [architecture documentation](docs/architecture.md).

`pnpm run dev:web` builds, serves, and rebuilds client bundles on source edits in one terminal, and `make help` lists the matching Make targets for Web and Desktop; the guide's application commands section owns the full table.

For agents, follow [AGENTS.md](AGENTS.md).

### Citation

```bibtex
@misc{deepseek-harness2026,
  title={DeepSeek Harness: Everything is a Plugin},
  author={DeepSeek-AI},
  year={2026},
  publisher={GitHub},
  howpublished={\url{https://github.com/deepseek-ai/deepseek-harness}},
}
```

### License

[MIT](LICENSE)

Third-party dependencies and their licenses are disclosed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
