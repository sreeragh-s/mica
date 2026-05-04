# Development

## Local setup

Install prerequisites:

- Node.js 20+
- npm 10+
- Rust stable
- Xcode Command Line Tools on macOS
- Tauri system dependencies for your platform

Install dependencies:

```bash
npm install
cp .env.example .env
```

Run the frontend-only app:

```bash
npm run dev
```

Run the desktop app:

```bash
./src-tauri/build_sidecars.sh
npm run tauri dev
```

Build:

```bash
npm run build
npm run tauri build
```

## Environment

Use `.env.example` as the source of truth for supported variables. Never commit
real credentials. Meeting transcription requires `OPENAI_API_KEY`; authenticated
flows require a compatible external auth service.

## Rust backend

Native commands live in `src-tauri/src/`. Run Rust checks from `src-tauri/`:

```bash
cargo check
```

## Sidecars

macOS audio capture sidecars live in `src-tauri/native/` and compile into
`src-tauri/binaries/` with:

```bash
./src-tauri/build_sidecars.sh
```

Only update generated binaries when the native sidecar behavior intentionally
changes.

## Manual verification

There is not yet a comprehensive automated test suite. For now, verify the
flows you touched and include notes in the pull request:

- app startup
- workspace open/switch
- file tree updates
- note open/edit/save
- source-control operations
- CLI chat provider detection and streaming
- meeting recorder setup and transcription
