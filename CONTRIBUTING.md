# Contributing

Thanks for contributing to NoteLab. This guide explains how to get a local
environment running, how to prepare pull requests, and what maintainers look for
during review.

By participating, you agree to follow [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).

## Development setup

1. Install the prerequisites from [README.md](./README.md).
2. Install dependencies with `npm install`.
3. Copy `.env.example` to `.env` and fill in only the variables you need.
4. If you are working on the desktop app, build the macOS sidecars with `./src-tauri/build_sidecars.sh`.
5. Start the app with `npm run tauri dev` or the frontend with `npm run dev`.

## Where to start

- `src/` for renderer changes
- `src-tauri/src/` for native commands and backend integrations
- `docs/` for architecture and contributor documentation
- `.github/` for issue templates, pull request templates, and CI

For deeper setup notes, read [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md).

## Choosing an issue

Good first contributions are usually:

- documentation corrections
- small UI fixes with screenshots
- focused bug fixes with reproduction steps
- platform-support improvements with clear manual verification

For broad architecture changes, open an issue first so maintainers can confirm
scope before you invest heavily.

## Pull requests

Please keep pull requests focused and include:

- a short description of the problem and solution
- screenshots or a short recording for UI work
- manual verification steps
- notes on any new env vars, permissions, or platform assumptions
- linked issues when applicable

Draft pull requests are welcome when you want early design or architecture
feedback.

## Code expectations

- Prefer existing project patterns over new abstractions
- Keep filesystem and Git behavior conservative
- Make platform-specific assumptions explicit
- Update docs when setup, environment variables, architecture boundaries, or
  user-visible behavior changes
- Avoid broad formatting churn in behavior-focused pull requests

## Commit hygiene

- Avoid committing `.env` or other secret-bearing files
- Avoid mixing formatting-only changes with behavior changes unless necessary
- Do not include generated binaries unless the change specifically requires them

## Tests and verification

There is no mature automated test suite in this repo yet. For now, contributors should:

- run the relevant build path they touched
- manually verify the affected feature
- mention any gaps they could not test

Helpful commands:

```bash
npm run build
npm run tauri build
```

Rust-only backend checks can be run from `src-tauri/`:

```bash
cargo check
```

## Documentation expectations

Update docs when your change affects:

- setup steps
- environment variables
- architecture boundaries
- contributor workflow
- platform support or limitations

## Code of conduct

By participating in this project, you agree to follow [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).

## License

By contributing, you agree that your contributions are provided under the
project's [MIT License](./LICENSE).
