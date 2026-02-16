# API Contract: Care Moments

**Base Path**: `/api/v1/care`
**Auth**: `requireHuman()` for all endpoints

---

## POST /care/cheer

Send a cheer to a participant (e.g., when their streak is at risk).

**Request Body**:
```json
{
  "targetHumanId": "uuid",
  "notificationId": "uuid",
  "includeGift": false
}
```

**Zod Schema**:
- `targetHumanId`: UUID, required
- `notificationId`: UUID, optional — the notification that prompted this cheer
- `includeGift`: boolean, default false — whether to include a 1-token gift

**Processing**:
1. Validate target human exists
2. If `includeGift: true`, execute double-entry token transfer (1 token from sender to receiver) with `spend_cheer` transaction type and idempotency key
3. Create notification for target: "X is cheering for you!" or aggregate into existing cheer notification
4. Push via WebSocket

**Response** (201):
```json
{
  "ok": true,
  "data": {
    "cheerId": "uuid",
    "targetHumanId": "uuid",
    "giftSent": false,
    "transactionId": null
  },
  "requestId": "uuid"
}
```

**Errors**:
- 400 `INSUFFICIENT_BALANCE` — Token balance too low for gift (returns option to cheer without gift)
- 400 `SELF_CHEER` — Cannot cheer yourself
- 404 `NOT_FOUND` — Target human not found

---

## POST /care/celebrate

Send a celebration to a participant (e.g., when they hit a milestone).

**Request Body**:
```json
{
  "targetHumanId": "uuid",
  "milestoneType": "tier_promotion",
  "notificationId": "uuid",
  "includeGift": true
}
```

**Zod Schema**:
- `targetHumanId`: UUID, required
- `milestoneType`: enum("mission_count", "tier_promotion", "streak_record"), required
- `notificationId`: UUID, optional — the notification that prompted this celebration
- `includeGift`: boolean, default false

**Processing**:
1. Validate target human exists
2. If `includeGift: true`, execute double-entry token transfer (1 token) with `spend_celebrate` transaction type and idempotency key
3. Create notification for target: "X celebrated your milestone!" or aggregate
4. Push via WebSocket

**Response** (201):
```json
{
  "ok": true,
  "data": {
    "celebrationId": "uuid",
    "targetHumanId": "uuid",
    "milestoneType": "tier_promotion",
    "giftSent": true,
    "transactionId": "uuid"
  },
  "requestId": "uuid"
}
```

**Errors**:
- 400 `INSUFFICIENT_BALANCE` — Token balance too low for gift
- 400 `SELF_CELEBRATE` — Cannot celebrate yourself
- 404 `NOT_FOUND` — Target human not found
