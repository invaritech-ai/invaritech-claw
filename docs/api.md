# API

iclaw exposes a local JSON HTTP API. The default base URL is:

```text
http://127.0.0.1:32768
```

There is no built-in remote auth in v1. Keep the server on loopback or put it behind authenticated infrastructure.

## Health

```http
GET /health
```

Returns:

```json
{
  "ok": true,
  "databasePath": "/path/to/state.db",
  "serverTimeMs": 1770000000000
}
```

## Runs

Create a queued run:

```http
POST /runs
content-type: application/json
```

```json
{
  "agentId": "main",
  "triggerType": "api",
  "triggerId": "manual",
  "idempotencyKey": "optional-key",
  "input": {
    "text": "hello"
  }
}
```

`triggerType` must be one of `tui`, `api`, `webhook`, or `schedule`.

List runs for an agent:

```http
GET /runs?agentId=main&limit=100
```

Get one run:

```http
GET /runs/:id
```

Get run events:

```http
GET /runs/:id/events
```

Cancel a run:

```http
POST /runs/:id/cancel
```

## Schedules

```http
GET /schedules
POST /schedules
GET /schedules/:id
PATCH /schedules/:id
DELETE /schedules/:id
POST /schedules/:id/run
```

See [Schedules](schedules.md) for request bodies and schedule syntax.

## Webhooks

```http
GET /webhooks
POST /webhooks/:id
```

See [Webhooks](webhooks.md) for delivery headers and idempotency behavior.

## Approvals

```http
POST /approvals/:id/approve
POST /approvals/:id/reject
```

Optional body:

```json
{
  "decision": {
    "reason": "operator reviewed"
  }
}
```
