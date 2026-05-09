# Release Runbook

NoteLab ships as a macOS desktop app for both **Apple Silicon (arm64)** and **Intel (x86_64)**, built locally and published to GitHub Releases. The installed app uses Tauri's auto-updater to discover new releases from this repo.

## One-time setup

### 1. Install Rust + macOS targets

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"
rustup target add aarch64-apple-darwin x86_64-apple-darwin
```

The release script will also run `rustup target add` defensively, so this is mostly a one-time hint.

### 2. Generate updater signing keys

The Tauri updater refuses to apply unsigned bundles. Generate a keypair **once** and store it safely:

```bash
npx tauri signer generate -w ~/.tauri/notelab.key
```

You'll get two pieces:

- A **private key** at `~/.tauri/notelab.key` — keep secret, never commit.
- A **public key** printed to the terminal (base64 string).

Paste the public key into `src-tauri/tauri.conf.json` under `plugins.updater.pubkey`, replacing the placeholder.

### 3. Set signing env vars in your shell profile

```bash
export TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/notelab.key)"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="<the password you chose>"
```

Add these to `~/.zshrc` (or load them ad-hoc before running `npm run release`). The release script fails fast if either is missing.

### 4. GitHub CLI

`gh` is used to create releases. You already have it on this machine; verify with `gh auth status`.

## Cutting a release

From a clean working tree on `main`:

```bash
npm run release           # patch bump (0.1.0 -> 0.1.1)
npm run release:minor     # minor bump
npm run release:major     # major bump
```

The script:

1. Bumps the version in `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml` (kept in sync).
2. Builds both `aarch64-apple-darwin` and `x86_64-apple-darwin`.
3. Stages artifacts under `dist/releases/<version>/{arm64,x86_64}/`:
   - `*.dmg` — first-time installer
   - `*.app.tar.gz` + `*.app.tar.gz.sig` — auto-updater payload + signature
4. Writes `dist/releases/<version>/latest.json` — the manifest the updater reads.
5. Prints the exact `git`/`gh` commands to publish the release.

Then run the printed commands to push the tag and create the GitHub Release with all the artifacts attached.

## How the updater finds releases

`src-tauri/tauri.conf.json` points at:

```
https://github.com/sreeragh-s/notelab/releases/latest/download/latest.json
```

GitHub auto-redirects `/releases/latest/download/<asset>` to the newest non-draft, non-pre-release release. As long as you upload `latest.json` to each Release and don't mark it as a draft, the URL never changes.

## Update check behavior in the app

The installed app checks for updates **once per launch**, gated by connectivity:

- **Online at launch** → check immediately.
- **Offline at launch** → check the moment connectivity returns, exactly once.
- Quitting and relaunching re-arms the check.

Status surfaces in the title bar as a chip:

- "Update available" → click to download & install.
- "Downloading update… N%" → in progress.
- "Restarting to update…" → install finished, app relaunching.

## First-install on macOS (no notarization)

We don't notarize with Apple, so when a user downloads the DMG from GitHub their browser tags it with `com.apple.quarantine` and macOS shows **"app is damaged and can't be opened."** This affects only the first install — Tauri's auto-updater bypasses Gatekeeper on subsequent updates because it extracts the tarball without quarantine.

The release script bakes the unblock command into every GitHub release's notes, so users see this on the release page:

> **Mac users:** macOS will say the app is "damaged" because we don't notarize. After dragging to /Applications, run this once in Terminal:
> ```
> xattr -cr /Applications/notelab-tauri.app
> ```

If you ever want to switch on notarization later, set `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_TEAM_ID`, `APPLE_PASSWORD` in `.env` — Tauri picks them up automatically and the "damaged" warning disappears for end users.

## Troubleshooting

- **`✗ Release failed: TAURI_SIGNING_PRIVATE_KEY ... must be set`** — see step 3 above.
- **`Missing .app.tar.gz under .../macos/`** — `createUpdaterArtifacts` may be off in `tauri.conf.json`, or signing env isn't loaded.
- **Updater says "no update"** when there should be one — check that the new release is marked latest, that `latest.json` is attached as an asset, and that the `version` field inside `latest.json` is greater than the installed version.
- **Updater errors on signature** — the `pubkey` in `tauri.conf.json` doesn't match the private key used to sign. Regenerate or correct.
- **"App is damaged and can't be opened"** on a downloaded DMG — see Apple notarization section above. For local testing: `sudo xattr -cr /Applications/notelab-tauri.app`.
