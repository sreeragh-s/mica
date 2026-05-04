# Privacy

NoteLab is designed as a local-first desktop notes workspace. User workspace
files live on disk in folders selected by the user.

## Local data

The app may read and write files inside selected workspaces, store UI state in
local browser storage, and run local native commands through Tauri.

## External services

Some features contact external services when enabled or configured:

- OpenAI Realtime API for meeting transcription
- local AI CLIs selected by the user for chat workflows
- a Better Auth-compatible service for optional sign-in flows
- GitHub CLI for optional repository publishing flows

## Secrets

API keys and credentials should be provided through local environment variables
or external tools. They must not be committed to the repository or stored in
workspace notes.

## Contributor expectations

Changes that add telemetry, network calls, authentication behavior, data export,
or filesystem access must document the behavior and receive careful review.
