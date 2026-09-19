# Security policy

Shipyard is an open-source project maintained by a single maintainer on a best-effort basis. If you
find a security problem, reporting it privately is the fastest path to a fix — and the only way to
avoid exposing other people's workspaces while it is unfixed.

## Reporting a vulnerability

**Do not** open a public issue, discussion, or pull request describing the problem.

Report it privately through **GitHub's private vulnerability reporting**: open the repository's
**Security** tab and choose **Report a vulnerability**. That channel is visible only to the
maintainer until an advisory is published.

If that option is not available to you, open a public issue that says _only_ that you have a
security report and ask for a private channel. Never include reproduction steps, the affected
endpoint, or any payload in that issue.

## What to include

- The affected version, tag, or commit (`git rev-parse HEAD` if you run from source).
- What an attacker can achieve, and what access they need to start.
- Reproduction steps, minimal and complete.
- Anything you already know about the cause, and a suggested fix if you have one.

## What to expect

- An acknowledgement that the report arrived.
- An assessment: whether it is a real issue, its severity, and the intended fix.
- Credit in the published advisory if you want it — otherwise you stay anonymous.

There is no bug bounty and no guaranteed response time. This is a single-maintainer project, so
please allow a reasonable window before disclosing publicly.

## Supported versions

Only the current `main` branch and the latest tagged release are supported. Fixes are not
backported to older releases.

## In scope

- Authentication and session handling.
- Authorization: workspace isolation, roles, and every guard between one workspace's data and
  another's.
- Credential handling: passwords, reset tokens, verification tokens, agent tokens.
- Injection, request forgery, and unsafe deserialization reachable from the API or the web app.
- Data exposure through an API response or a rendered page.

## Out of scope

- Misconfiguration of a self-hosted instance (open database ports, missing environment secrets,
  an instance served over plain HTTP).
- Vulnerabilities in third-party dependencies or services — report those upstream, though a heads-up
  is welcome if Shipyard is affected.
- Denial of service by sheer traffic volume.
- Social engineering, and physical access to a machine.
- Findings that require an already-compromised account or an already-administered workspace.
