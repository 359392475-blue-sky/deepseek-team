# DeepSeek Team Edition prototype

English | [中文](README.zh.md)

BlueSky's exploration of a team collaboration interface, preserved as an independent early prototype of DeepSeek Harness Team Battle. For the current collaboration edition, see the [repository README](../README.md).

This snapshot runs a frontend prototype of personal conversations and the flight game. The Team entry displays the selected Team Space design. Member presence, team files, and task delivery are not connected to a real backend in this prototype.

## Run locally

Requires Node.js 20.19+ or 22.12+.

~~~sh
npm install
npm run dev
~~~

`npm run build` generates the static frontend, and `npm run preview` previews the build. This public snapshot excludes private conversations, service credentials, cloud site configuration, and runtime logs.

## Design direction

Personal conversations remain private; tasks, artifacts, and versions enter Team Space after the user's confirmation. A lightweight flight game is available while waiting for the agent. The cloud Team Space in this snapshot is a visual preview; real collaboration is outside this prototype's scope.

## Origin and license

Based on local prototype work related to [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness), with the upstream MIT license and third-party notices retained. The DeepSeek name and marks belong to their respective rights holders; this project is an independent community exploration.
