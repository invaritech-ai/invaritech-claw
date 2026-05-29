# Schedules

Schedules create runs for an agent. They replace separate heartbeat and cron concepts with one model.

## Create

```http
POST /schedules
content-type: application/json
```

```json
{
  "id": "morning-check",
  "agentId": "main",
  "schedule": {
    "cron": "0 9 * * *",
    "timezone": "Asia/Kolkata"
  },
  "input": {
    "task": "daily check"
  },
  "approvalMode": "fail",
  "enabled": true
}
```

`id` is optional. If omitted, iclaw creates one.

## Schedule Syntax

Run once at an absolute time:

```json
{ "at": "2026-05-30T09:00:00+05:30" }
```

Run after each interval:

```json
{ "every": "30m" }
```

Supported interval units:

- `ms`
- `s`
- `m`
- `h`
- `d`

Run by cron:

```json
{ "cron": "*/15 * * * *", "timezone": "UTC" }
```

## Approval Mode

`approvalMode` controls what unattended approval requirements do:

- `fail`: fail closed
- `pause`: leave the run paused for operator decision

The default is `fail`.

## Manage

```bash
curl -sS http://127.0.0.1:32768/schedules
curl -sS http://127.0.0.1:32768/schedules/morning-check
curl -sS -X POST http://127.0.0.1:32768/schedules/morning-check/run
```

Patch accepts the same editable fields as create: `agentId`, `schedule`, `input`, `approvalMode`, and `enabled`.
