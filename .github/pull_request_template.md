## Summary

- Explain the problem
- Explain the change
- Link related issues

## Validation

- [ ] `npm run build`
- [ ] `cargo check` from `src-tauri/` if Rust/Tauri behavior changed
- [ ] `npm run tauri build` or `npm run tauri dev` for the affected path
- [ ] Manual QA notes included below

## Manual QA

- Describe what you tested
- Note anything you could not verify

## Docs and setup

- [ ] Updated docs if setup, env vars, or contributor workflow changed
- [ ] No secrets or machine-specific paths included
- [ ] Platform assumptions are documented

## Risk

- Note filesystem, Git, auth, networking, sidecar, or API-key behavior touched by this PR
