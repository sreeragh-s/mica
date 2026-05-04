# Open-Source Release Checklist

Use this checklist before making a public release or broad announcement.

## Repository metadata

- [x] README explains project scope, setup, platform support, and status
- [x] LICENSE is present
- [x] package metadata includes license, repository, bugs, and keywords
- [x] `.env.example` documents supported environment variables
- [x] `.gitignore` excludes secrets, dependencies, and build output

## Community health

- [x] CONTRIBUTING guide is present
- [x] CODE_OF_CONDUCT is present
- [x] SECURITY policy is present
- [x] SUPPORT guide is present
- [x] MAINTAINERS guide is present
- [x] Issue and pull request templates are present

## Engineering readiness

- [x] Architecture documentation is present
- [x] Development workflow is documented
- [x] Dependency security posture is documented
- [x] Basic CI workflow is present
- [ ] Comprehensive automated test suite exists
- [ ] Release artifacts are reproducible on all supported platforms

## Security and privacy

- [x] Secret handling expectations are documented
- [x] Security reporting process is documented
- [x] Privacy posture is documented
- [ ] Dedicated private security contact is configured in repository settings
- [ ] Public release build has been reviewed for bundled secrets or local paths

## Release management

- [x] Release process is documented
- [ ] First public tag is created
- [ ] GitHub release notes are published
- [ ] Distribution channels are documented after they exist
