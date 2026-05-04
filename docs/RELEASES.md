# Releases

## Versioning

NoteLab uses semantic versioning once public releases begin:

- patch: bug fixes and documentation corrections
- minor: backwards-compatible features and UI improvements
- major: breaking workspace, configuration, plugin, or platform changes

Until `1.0.0`, minor versions may still include larger product changes.

## Release checklist

1. Confirm `npm run build` passes.
2. Confirm `cargo check` passes from `src-tauri/`.
3. For a local signed release build, set `TAURI_SIGNING_PRIVATE_KEY` or `TAURI_SIGNING_PRIVATE_KEY_PATH`, then run `npm run release:build`.
4. Merges to `main` run the Release workflow. It bumps `0.1.0` to `0.1.1`, rolls `0.1.9` to `0.2.0`, commits the version, tags `vX.Y.Z`, builds the macOS app, publishes GitHub release assets, and uploads `latest.json` for the Tauri updater.
5. The workflow requires `TAURI_SIGNING_PRIVATE_KEY` as a GitHub Actions secret. `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` is optional when the key has no password.

## Release notes

Release notes should include:

- highlights
- fixes
- platform support notes
- security or privacy changes
- known issues
- contributor acknowledgements when applicable
