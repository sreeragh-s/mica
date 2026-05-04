# NoteLab

NoteLab is a local-first desktop notes workspace built with Tauri, React, and Rust. It combines a rich editor, workspace file tree, wiki-style linking, CLI AI chat, Git/source control flows, and a meeting transcription pipeline for turning live conversations into notes.

This repository contains the open-source desktop client. It is optimized for personal knowledge work on macOS today, with some features already structured to support broader platform coverage over time.

## Project status

NoteLab is early open-source software. The app is usable for local development, but contributors should expect some rough edges:

- macOS is the primary supported platform today
- meeting recording sidecars are macOS-focused
- there is not yet a comprehensive automated test suite
- auth and some API route helpers expect companion services outside this repo

## What it does

- Rich note editing with Plate-based blocks, media, tables, slash commands, comments, and export helpers
- Local workspace browsing with file-tree watching and persisted tabs
- Wiki-link indexing and graph views for note relationships
- Built-in Git flows for status, staging, branching, commits, and publish helpers
- AI chat through local Codex, OpenCode, or Claude Code CLI installations
- Meeting transcription through OpenAI Realtime plus native macOS capture sidecars
- Optional sign-in flow through a Better Auth-compatible backend

## License

NoteLab is released under the [MIT License](./LICENSE).

## Tech stack

- Frontend: React 19, TypeScript, Vite
- Desktop shell: Tauri 2
- Native backend: Rust
- Editor: Plate
- State and UI: Zustand, Radix, custom UI primitives
- AI chat: Codex, OpenCode, or Claude Code CLI
- Meeting transcription: OpenAI Realtime API

## Repository layout

```text
.
├── src/                 # React app, editor UI, workspace UX, frontend helpers
├── src-tauri/           # Tauri app, Rust commands, native sidecars, bundle config
├── public/              # Static assets
├── docs/                # Project, architecture, and collaboration documentation
├── .github/             # Issue, pull-request, and CI configuration
└── LICENSE              # MIT license
```

## Getting started

### Prerequisites

- Node.js 20+
- npm 10+
- Rust stable toolchain
- Xcode Command Line Tools on macOS
- Tauri system prerequisites for your platform

For Tauri setup, follow the official guide:
[Tauri prerequisites](https://tauri.app/start/prerequisites/)

### Install

```bash
npm install
cp .env.example .env
```

### Development

Frontend only:

```bash
npm run dev
```

Desktop app:

```bash
./src-tauri/build_sidecars.sh
npm run tauri dev
```

Production build:

```bash
npm run build
npm run tauri build
```

## Environment variables

The checked-in `.env.example` documents the expected shape.

### Common

- `VITE_BETTER_AUTH_URL`: optional auth service origin. Defaults to `http://localhost:8787`
- `VITE_APP_ORIGIN`: optional app origin override for auth callback generation

### AI and transcription

- `OPENAI_API_KEY`: required for the meeting recorder flow
- `VITE_OPENAI_API_KEY`: supported as a fallback by the Rust transcription pipeline, but `OPENAI_API_KEY` is preferred
- `AI_GATEWAY_API_KEY`: used by the companion AI route handlers under `src/app/api`

## Platform notes

- Meeting recording sidecars are currently macOS-focused
- System audio capture requires macOS 14.4+
- The desktop app itself is Tauri-based and the codebase is structured for broader support, but some advanced flows are not yet cross-platform

## Project docs

- [Architecture](./docs/ARCHITECTURE.md)
- [Development guide](./docs/DEVELOPMENT.md)
- [Dependency security](./docs/DEPENDENCY_SECURITY.md)
- [Collaboration guide](./docs/COLLABORATION.md)
- [Contributing](./CONTRIBUTING.md)
- [Governance](./GOVERNANCE.md)
- [Maintainers](./MAINTAINERS.md)
- [Privacy](./docs/PRIVACY.md)
- [Release process](./docs/RELEASES.md)
- [Security policy](./SECURITY.md)
- [Support](./SUPPORT.md)
- [Changelog](./CHANGELOG.md)
- [Open-source release checklist](./docs/OPEN_SOURCE_CHECKLIST.md)

## Contributing

Contributions are welcome. Start with [CONTRIBUTING.md](./CONTRIBUTING.md) and [docs/COLLABORATION.md](./docs/COLLABORATION.md) for workflow and review expectations.

## Security

Please do not open public issues for sensitive vulnerabilities. Follow [SECURITY.md](./SECURITY.md).
