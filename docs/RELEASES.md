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
3. Build the Tauri app on the target release platform.
4. Review bundled files for secrets, machine-specific paths, and stale assets.
5. Update release notes with user-facing changes, migration notes, and known issues.
6. Create a signed tag when signing infrastructure is available.
7. Publish GitHub release artifacts.

## Release notes

Release notes should include:

- highlights
- fixes
- platform support notes
- security or privacy changes
- known issues
- contributor acknowledgements when applicable
