# Contributing

Thanks for contributing to Mica.

## Development setup

1. Install the prerequisites from [README.md](./README.md).
2. Install dependencies with `npm install`.
3. Copy `.env.example` to `.env` and fill in only the variables you need.
4. Start the app with `npm run tauri dev` or the frontend with `npm run dev`.

## Where to start

- `src/` for renderer changes
- `src-tauri/src/` for native commands and backend integrations
- `docs/` for architecture and contributor documentation

## Pull requests

Please keep pull requests focused and include:

- a short description of the problem and solution
- screenshots or a short recording for UI work
- manual verification steps
- notes on any new env vars, permissions, or platform assumptions

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

## Documentation expectations

Update docs when your change affects:

- setup steps
- environment variables
- architecture boundaries
- contributor workflow
- platform support or limitations

## Code of conduct

By participating in this project, you agree to follow [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).
