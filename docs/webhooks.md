# Webhooks

Webhooks create runs from incoming HTTP payloads.

v1 exposes delivery and listing endpoints. Registration is an internal service seam so custom APIs can define webhook ids, agents, secrets, and idempotency headers.

## Delivery

```http
POST /webhooks/:id
content-type: application/json
x-iclaw-webhook-secret: <secret>
x-idempotency-key: <optional-key>
```

Example:

```bash
curl -sS http://127.0.0.1:32768/webhooks/ingest \
  -H 'content-type: application/json' \
  -H 'x-iclaw-webhook-secret: local-secret' \
  -H 'x-idempotency-key: evt-123' \
  -d '{"text":"hello"}'
```

Accepted response:

```json
{
  "runId": "run-id",
  "deliveryId": "delivery-id",
  "duplicate": false
}
```

Duplicate idempotency response:

```json
{
  "runId": "same-run-id",
  "deliveryId": "delivery-id",
  "duplicate": true
}
```

## Auth

Every webhook requires `x-iclaw-webhook-secret`. Missing, empty, or wrong secrets return `401`.

## Idempotency

The default idempotency header is `x-idempotency-key`. A webhook can be registered with a different header name.

When a duplicate key is received for the same webhook, iclaw returns the original run instead of creating another one.

## Listing

```http
GET /webhooks
```

The list response redacts webhook secrets.
