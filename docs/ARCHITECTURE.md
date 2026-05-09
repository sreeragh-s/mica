# Architecture

## Overview

Mica is a Tauri desktop application with a React renderer and a Rust native backend. The app is designed around a local workspace on disk, with the frontend handling editing and interaction while the Tauri layer exposes native commands for filesystem-heavy work, Git operations, and streaming model integrations.

## High-level layers

### Renderer: `src/`

The React app owns:

- workspace selection and persisted UI state
- tab management and file viewers
- editor composition and slash-command UX
- source-control UI
- settings, onboarding, and auth UX
- orchestration for wiki-link indexing and CLI provider chat

Key areas:

- `src/App.tsx`: top-level shell, workspace/session orchestration, tabs, sidebars
- `src/components/editor/`: editor composition, plugins, toolbars, transforms
- `src/components/source-control-sidebar.tsx`: Git UX backed by Tauri commands
- `src/lib/`: shared client-side helpers for auth, workspace state, shortcuts, indexing, and CLI chat integration

### Native backend: `src-tauri/src/`

The Rust backend exposes Tauri commands for native capabilities that would be awkward or impossible to implement solely in the webview.

Modules:

- `git.rs`: Git status, staging, commits, branches, sync helpers
- `github_cli.rs`: GitHub CLI detection, auth, and publish flows
- `workspace_tree.rs`: workspace snapshots and filesystem watchers
- `workspace_index.rs`: wiki-link indexing and note connection data
- `cli_chat.rs`: local Codex, OpenCode, and Claude CLI status plus streaming chat

## Core flows

### Workspace flow

1. The user picks a local workspace folder.
2. The renderer stores the active workspace path in local storage.
3. The file tree loads a snapshot and starts a native watcher.
4. Note tabs and the active file are restored per workspace.
5. Wiki-link indexing can rebuild incrementally as files change.

### Editing flow

1. A file is opened from the tree or another navigation surface.
2. The renderer selects a viewer/editor based on file type.
3. Plate powers rich note editing for markdown-like document content.
4. Save events and file mutations can trigger index refreshes and UI updates.

### Source control flow

1. The renderer invokes Git commands through Tauri.
2. Rust shells out to Git and emits progress updates where needed.
3. The source-control sidebar reflects staged, unstaged, branch, and commit state.
4. GitHub publish flows optionally use the local `gh` CLI.

### Local AI flow

1. The frontend checks CLI provider availability through Tauri commands.
2. Model search and pull are handled natively.
3. Chat requests stream back to the renderer through Tauri event channels.

## State boundaries

- Persistent workspace UI state is stored in browser local storage
- Files and note content live in the user-selected workspace on disk
- Native processes and long-running watchers are owned by the Tauri backend
- Auth is handled through a Better Auth-compatible external service when enabled

## External dependencies

- Git and optionally GitHub CLI for source-control publishing flows
- Codex, OpenCode, or Claude Code CLI for sidebar chat
- Better Auth-compatible backend for authenticated flows

## Open architecture considerations

- The `src/app/api/` routes act like companion server handlers and are not the primary runtime entry point for the Tauri renderer
- The app currently favors direct module organization over a strict domain-package split, which keeps iteration fast but means contributors should read flow boundaries before large refactors
