# Architecture Guide

This document explains how notelab works under the hood.

## Technology Stack

- **Framework**: Electron with electron-vite
- **Frontend**: React 19 + TypeScript
- **Styling**: Tailwind CSS v4
- **Rich Text Editor**: Lexical
- **Database**: Dexie (IndexedDB wrapper)
- **AI**: Ollama integration via electron-ollama
- **Build**: electron-builder

## Project Structure

```
src/
├── main/           # Electron main process (Node.js)
│   ├── bootstrap/  # App initialization
│   ├── core/      # Window management, shortcuts
│   ├── ipc/       # IPC handlers (main <-> renderer)
│   ├── ai/        # Ollama & vectra embeddings
│   ├── auth/      # GitHub OAuth
│   ├── git/       # Git operations
│   ├── workspace/ # File system operations
│   └── chat/      # Chat history
├── preload/        # Bridge between main & renderer
│   └── api/       # Exposed APIs (window.api.*)
└── renderer/       # React frontend
    ├── app/       # App entry & root component
    ├── components/  # UI components (shadcn)
    ├── features/  # Feature modules (editor, notes, etc.)
    ├── lib/       # Utilities (AI, editor, theme)
    └── assets/    # Static assets
```

## Process Model

```
┌─────────────────┐      IPC       ┌─────────────────┐
│   Main Process  │◄───────────────►│  Renderer       │
│   (Node.js)     │                │  (Chromium)    │
│                 │                │                 │
│ - Window mgmt   │                │ - React UI     │
│ - File system   │                │ - Lexical      │
│ - Git ops       │                │ - Dexie DB     │
│ - AI models     │                │                 │
│ - OAuth         │                │                 │
└────────┬────────┘                └────────┬────────┘
         │                                  │
         │ contextBridge                   │
         ▼                                  │
┌─────────────────┐                         │
│    Preload      │◄─────────────────────────┘
│                 │   window.api.*
│ - Exposes IPC   │
│ - Type-safe    │
└─────────────────┘
```

## Main Process (`src/main/`)

### Bootstrap (`start-app.ts`)

1. Initializes logging (electron-log)
2. Sets up app security (permissions)
3. Registers all IPC handlers
4. Creates the main window

### IPC Architecture

- `core-ipc.ts` - Core app events (window, shortcuts, logs)
- `domain-ipc.ts` - Domain-specific handlers (workspace, notes, AI)
- Communication pattern: Main process exposes handlers → Preload calls them → Renderer uses them

### Key Modules

- **AI** (`ai/`) - Ollama chat & vectra embeddings
- **Auth** (`auth/`) - GitHub OAuth flow
- **Git** (`git/`) - Repository init, status, commit
- **Workspace** (`workspace/`) - File system operations
- **Chat** (`chat/`) - Chat history management

## Preload (`src/preload/`)

Exposes safe APIs to renderer via `contextBridge`:

```typescript
// Example: window.api.workspace.*
export interface WorkspaceAPI {
  ensureDataRoot: () => Promise<string>
  selectDirectory: () => Promise<string | null>
  readNote: (path: string) => Promise<string>
  writeNote: (path: string, content: string) => Promise<void>
  // ... more methods
}
```

## Renderer (`src/renderer/`)

### App Flow (`App.tsx`)

1. Check auth session
2. If no session → Login screen
3. If session but no setup → Setup screen
4. Otherwise → Notes app

### Features

- **Editor** - Lexical-based rich text editor with markdown
- **Notes** - Note management, file browser
- **AI** - Chat with retrieval-augmented generation
- **Appearance** - Theme system with presets

### Database (Dexie)

Notes are stored in IndexedDB via Dexie for offline capability.

The cache database (`notes-cache-db.ts`) stores:

- **noteRows** - Note metadata (path, title, plain text, tags, properties)
- **linkMentions** - Backlinks and internal links between notes

### AI Pipeline

1. User message → Chat
2. Retrieve relevant notes (vectra embeddings)
3. Build context from retrieved notes
4. Send to Ollama with context
5. Stream response

## Build & Distribution

```bash
npm run dev       # Development
npm run build     # Build for production
npm run build:mac # macOS .app
npm run build:win # Windows .exe
npm run build:linux # Linux AppImage
```

## Key Configuration

- `electron.vite.config.ts` - Build configuration
- `tsconfig.node.json` - Main process TypeScript
- `tsconfig.web.json` - Renderer TypeScript
- `package.json` - App metadata & scripts
