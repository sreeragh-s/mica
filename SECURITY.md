# Security Policy

## Reporting a vulnerability

Please do not report security vulnerabilities through public GitHub issues.

Instead, share a private report with:

- a clear description of the issue
- affected area or file paths if known
- reproduction steps or proof of concept
- impact assessment

If a dedicated security contact is added later, this file should be updated with that address or process.

## Scope

Areas that deserve extra scrutiny in this project:

- local filesystem access
- Git command execution
- auth and session flows
- API key handling and external AI integrations

## Secret handling

- Never commit real API keys, tokens, or credentials
- Use `.env.example` for documented placeholders only
- Rotate any credential immediately if it is ever committed or exposed in logs

## Supported release posture

This project is still evolving. Treat all contributions that affect security-sensitive behavior as requiring careful maintainer review before release.
