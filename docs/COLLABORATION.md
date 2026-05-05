# Collaboration Guide

## Working style

This project moves best when changes are:

- local-first and respectful of user data
- incremental instead of sweeping
- explicit about platform assumptions
- documented when they add new commands, environment variables, or contributor workflow changes

## Before you start

- Read [README.md](../README.md) for setup
- Read [docs/ARCHITECTURE.md](./ARCHITECTURE.md) for system boundaries
- Check for existing issues or open branches touching the same area
- If the change affects platform-specific behavior, call that out early

## How we prefer contributions

- Small PRs are easier to review than broad mixed-purpose changes
- Separate refactors from behavior changes when possible
- Include screenshots or recordings for visible UI changes
- Include manual test notes for flows you exercised
- Update docs when setup, architecture, or UX expectations change

## Branching

Suggested branch names:

- `feat/<short-name>`
- `fix/<short-name>`
- `docs/<short-name>`
- `refactor/<short-name>`

## Review checklist

Before opening a pull request, make sure:

- the app still boots in the path you changed
- any new environment variables are documented in `.env.example`
- platform restrictions are documented in code or docs
- contributor-facing workflow changes are reflected in README or CONTRIBUTING
- there are no secrets, tokens, or machine-specific paths in the diff

## Manual QA expectations

There is not yet a strong automated safety net, so manual verification matters.

For UI changes, note which of these you tested:

- app startup
- workspace open/switch
- note create/open/save
- source-control sidebar behavior
- CLI provider chat flows if touched

## Communication norms

- Assume good intent
- Prefer concrete code or product observations over general taste debates
- Flag uncertainty directly when a behavior is platform-specific or under-documented
- Keep decisions discoverable by documenting them in the repo when they affect future contributors

## When touching sensitive areas

Take extra care around:

- filesystem mutation
- Git commands that can discard user work
- auth/session handling
- environment variable usage
