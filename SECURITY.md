# Security Policy

## Supported versions

This project is pre-1.0. Security fixes are handled on the default branch unless
a public release branch is explicitly documented.

## Reporting a vulnerability

Please do not report security vulnerabilities through public GitHub issues.

Use GitHub private vulnerability reporting if it is enabled for this repository.
If it is not enabled yet, contact the maintainers privately through the channel
listed in the repository profile or release notes.

Include:

- a clear description of the issue
- affected area or file paths if known
- reproduction steps or proof of concept
- impact assessment
- whether the issue is already public anywhere

Maintainers should acknowledge valid reports as soon as practical and coordinate
fix timing with the reporter.

## Scope

Areas that deserve extra scrutiny in this project:

- local filesystem access
- Git command execution
- auth and session flows
- native sidecars and capture permissions
- API key handling and external AI integrations
- update, build, and release workflows

## Secret handling

- Never commit real API keys, tokens, or credentials
- Use `.env.example` for documented placeholders only
- Rotate any credential immediately if it is ever committed or exposed in logs

## Disclosure

Please allow maintainers time to investigate and release a fix before publishing
details. Public advisories should include affected versions or commits,
mitigation guidance, and fixed versions when available.

## Supported release posture

This project is still evolving. Treat all contributions that affect security-sensitive behavior as requiring careful maintainer review before release.
