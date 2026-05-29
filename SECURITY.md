# Security Policy

iclaw v1 is a local-first headless automation framework. Treat the host running iclaw as a trusted operator boundary.

## Reporting

Report security issues privately through the repository owner or the private channel configured for your fork. Include:

- affected commit or package version
- vulnerable endpoint, file, function, or config path
- reproduction steps
- demonstrated impact
- suggested remediation

Scanner-only reports without a working reproduction are low priority.

## Trust Model

- The HTTP API is intended for loopback use by default.
- Anyone who can reach an unauthenticated iclaw HTTP server can create runs, inspect runs, trigger schedules, deliver webhooks, and approve or reject pending approvals.
- Anyone who can write the iclaw config or SQLite state is a trusted operator.
- Agents are not trusted principals. Prompt and webhook input should be treated as untrusted content.
- Tool execution is deny by default. Only explicitly enabled tools should be made available to an agent.
- Approval state is an operator guardrail, not a multi-tenant security boundary.

## Recommended Defaults

- Bind the server to `127.0.0.1`.
- Put remote access behind an authenticated reverse proxy or tunnel.
- Keep provider secrets in environment variables and reference them from config.
- Keep webhook secrets unique per webhook.
- Use idempotency headers for webhook senders that retry.
- Keep SQLite state on a local disk with user-only file permissions.
- Review every custom tool, webhook, and API extension as trusted code.

## Out of Scope for v1

- Multi-tenant authorization inside one iclaw server.
- Browser, media, voice, mobile, channel, or MCP surfaces.
- Compatibility endpoints for other AI APIs.
- Legacy config, state, or migration behavior.

## Dependency and Runtime Notes

iclaw requires Node 22.14.0 or newer and uses `node:sqlite`, which may print an experimental runtime warning on current Node releases. Keep Node and pnpm current, and review dependency changes before accepting them.
