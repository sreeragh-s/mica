# Dependency Security

This project uses npm and Cargo dependency lockfiles. Keep both lockfiles
reviewed in pull requests.

## JavaScript audit posture

Run:

```bash
npm audit --audit-level=moderate
```

Current status after non-breaking remediation:

- critical vulnerabilities: 0
- remaining vulnerabilities: 17
- remaining severities: moderate and high

The remaining npm audit findings currently involve upstream packages or
breaking upgrade paths:

- Excalidraw and Mermaid dependencies through Plate editor packages
- DOMPurify through Mermaid integrations
- `js-video-url-parser` through media embeds
- `js-yaml` through `xmlbuilder2` and `@platejs/docx-io`
- `mime`, `request`, and `uuid` through the legacy `force` package

Do not run `npm audit fix --force` without reviewing the resulting dependency
changes and manually testing editor, drawing, media, upload, and export flows.

## Overrides

`package.json` uses npm overrides for transitive fixes that do not require a
known breaking top-level package change:

- `effect`
- `request` transitive `form-data`
- `request` transitive `qs`
- `request` transitive `tough-cookie`

Review these overrides when the affected top-level packages are upgraded.

## Cargo

Run Rust dependency checks from `src-tauri/`:

```bash
cargo check
```

If a Rust advisory tool is added later, document it here and wire it into CI.
