# Mica

Mica is a local-first desktop notes workspace built with Tauri, React, and Rust. It combines a rich editor, workspace file tree, wiki-style linking, CLI AI chat, and Git/source control flows.

This repository is the desktop client. It is optimized for personal knowledge work on macOS today, with some features already structured to support broader platform coverage over time.

## What it does

- Rich note editing with Plate-based blocks, media, tables, slash commands, comments, and export helpers
- Local workspace browsing with file-tree watching and persisted tabs
- Wiki-link indexing and graph views for note relationships
- Built-in Git flows for status, staging, branching, commits, and publish helpers
- AI chat through local Codex, OpenCode, or Claude Code CLI installations
- Optional sign-in flow through a Better Auth-compatible backend

## Tech stack

- Frontend: React 19, TypeScript, Vite
- Desktop shell: Tauri 2
- Native backend: Rust
- Editor: Plate
- State and UI: Zustand, Radix, custom UI primitives
- AI chat: Codex, OpenCode, or Claude Code CLI

## Repository layout

```text
.
├── src/                 # React app, editor UI, workspace UX, frontend helpers
├── src-tauri/           # Tauri app, Rust commands, and bundle config
├── public/              # Static assets
├── docs/                # Project, architecture, and collaboration documentation
└── .github/             # Issue and pull-request templates
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

### AI

- `AI_GATEWAY_API_KEY`: used by the companion AI route handlers under `src/app/api`

## Platform notes

- The desktop app itself is Tauri-based and the codebase is structured for broader support, but some advanced flows are not yet cross-platform

## Project docs

- [Architecture](./docs/ARCHITECTURE.md)
- [Collaboration guide](./docs/COLLABORATION.md)
- [Contributing](./CONTRIBUTING.md)
- [Security policy](./SECURITY.md)
- [Open-source release checklist](./docs/OPEN_SOURCE_CHECKLIST.md)

## Current development status

This repo already contains substantial product code, but some edges are still evolving:

- There is no full CI or automated test suite yet
- Auth and some API helpers expect companion services outside this repo
- Open-source release ownership items such as license choice should be finalized before public publication

## Contributing

Contributions are welcome. Start with [CONTRIBUTING.md](./CONTRIBUTING.md) and [docs/COLLABORATION.md](./docs/COLLABORATION.md) for workflow and review expectations.

## Security

Please do not open public issues for sensitive vulnerabilities. Follow [SECURITY.md](./SECURITY.md).
