# DeepSeek Harness · Team Battle

English | [中文](README.zh.md)

Work with your own AI, and collaborate through a shared project space. Team Battle lets colleagues publish decisions, files, tasks, and review feedback so the next person can continue with their own DeepSeek conversation.

This independent, open-source edition is based on [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) `0.1.7-alpha.2`. It is not an official DeepSeek team product. The project is an early preview; APIs and stored data formats may change.

[Download and installation guide](https://lowpower.me/team-battle-downloads/) · [GitHub releases](https://github.com/359392475-blue-sky/deepseek-team/releases) · [Play the collaboration example](https://lowpower.me/team-battle-demo/) · [MIT license](LICENSE)

## Contents

- [Team collaboration](#team-collaboration)
- [Start collaborating](#start-team-battle)
- [Snake collaboration example](#collaboration-example)
- [Develop from source](#run-from-source)
- [Upstream and license](#upstream-deepseek-harness)

<a id="team-collaboration"></a>
## Team collaboration

Each colleague runs a separate client with their own model credentials and private conversations. A shared HTTPS server stores only the project information members explicitly publish.

| Shared in Team Space | Kept on each member's device |
| --- | --- |
| Project goal, members, tasks, and handoffs | Model credentials and settings |
| Published context: decisions, blockers, and next steps | Private AI conversations and unsent drafts |
| Selected files, version labels, and review feedback | Unpublished files and the working directory |

Members copy published context into their own AI conversation and download the files they need. The space does not synchronize working directories or automatically run another member's AI. The [Team Space guide](packages/experimental/client-ui-team-battle/README.md) explains publication, handoff, and review.

<a id="start-team-battle"></a>
## Start collaborating

The downloadable app supports **Apple Silicon Macs running macOS 15 or later**. The distributed ZIP contains a Developer ID signed and Apple-notarized app; see the [installation guide](https://lowpower.me/team-battle-downloads/). Intel Mac and Windows installers are not provided.

1. Each colleague installs the app, selects a local project folder, and configures their own [model provider](docs/user/guide/providers.md).
2. The project initiator first configures the [shared server and creation credential](packages/experimental/team-battle-connector-http/README.md#shared-team-server), then chooses **Start a team project**, enters the goal, and invites a colleague. The creation credential comes from the server administrator; invited colleagues do not need it.
3. The colleague opens the invitation link to see installation and joining instructions, copies the complete link, and pastes it into **Join with an invitation** in their own app. Successful joining opens the shared project.
4. The initiator works with their AI and publishes useful context and selected files. The colleague uses **Copy task for my AI** or **Copy shared context for my AI**, downloads the referenced files, and continues in their own conversation.
5. The colleague publishes the result and submits it for review. Another member accepts it or requests changes; the author revises and submits again until the task is accepted.

If an invitation has expired or been revoked, ask the initiator for a new link. If copying is unavailable, use the selectable text shown by the app. Revised files need a new name or version folder; a name conflict preserves the selected file and draft so you can rename and retry.

<a id="collaboration-example"></a>
## Snake collaboration example

[Play the resulting Snake game](https://lowpower.me/team-battle-demo/). The example follows a product manager and developer through market research, a product requirements document, implementation, independent product review, corrections, and acceptance. Both roles work with their own DeepSeek; shared context, files, tasks, and review decisions carry the work between them.

The exercise used two isolated DeepSeek instances and member identities on one Mac, connected through the public Team server. It validates that collaboration path; it does not establish coverage on two physical computers or real mobile devices. Sound is outside the delivered game's scope.

<a id="run"></a>

<a id="run-from-source"></a>
## Develop from source

Use this repository to build the Team Battle edition. The official npm package starts standard DeepSeek Harness and does not include these customizations. The [development guide](docs/development.md) owns environment setup; this checkout requires Node.js `^22.19.0 || >=24.0.0` and pnpm `11.7.0`.

From the repository root:

```sh
pnpm install
pnpm run build
```

Next, follow the [Team Battle profile setup](packages/experimental/team-battle-profile/README.md#use-this-package) to launch the Web client, or the [macOS build guide](apps/macos/README.md) to build the native app. Review the [safety notice](SAFETY.md) before running the agent.

<a id="source-map"></a>
### Source map

| Area | Documentation |
| --- | --- |
| Team interface and collaboration flow | [Client](packages/experimental/client-ui-team-battle/README.md) |
| Projects, members, tasks, files, and reviews | [Team service](packages/experimental/team-battle/README.md) |
| Shared server and HTTP transport | [Server deployment](packages/experimental/team-battle-connector-http/README.md) |
| Native macOS application | [App wrapper](apps/macos/README.md) |

For contributions, read [CONTRIBUTING.md](CONTRIBUTING.md), the [architecture guide](docs/architecture.md), and [AGENTS.md](AGENTS.md). Report Team Battle issues in [this repository](https://github.com/359392475-blue-sky/deepseek-team/issues). The earlier browser prototype remains in [`legacy-prototype/`](legacy-prototype/).

<a id="upstream-deepseek-harness"></a>
## Upstream and license

[DeepSeek AI](https://deepseek.com) develops the upstream DeepSeek Harness agent framework, built on [Cordis](https://github.com/cordiverse/cordis). See the [upstream documentation](https://deepseek-harness.github.io/deepseek-harness/) for its plugin architecture and general capabilities.

<a id="license"></a>

This project is released under the [MIT license](LICENSE), with the upstream copyright notice retained. Third-party components retain their own licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
