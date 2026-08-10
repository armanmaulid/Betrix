# MT5 Bridge Integration Guide

## Overview
The MT5 Bridge is an external service that provides real-time market data from MetaTrader 5. The backend connects to it via WebSocket for real-time streaming and REST API for historical data.

## REST API Endpoints

### Quote Data
```
GET /v1/quote?symbol=EURUSD
```
Response:
```json
{
  "symbol": "EURUSD",
  "ask": 1.0851,
  "bid": 1.0849,
  "spread": 20,
  "digits": 5,
  "volume": 12,
  "time": "2026-08-09T10:15:23.412Z"
}
```

### Historical Prices
```
GET /v1/history/prices?symbol=EURUSD&time_frame=H1&from_date=2026-08-01&to_date=2026-08-08
```
Time frames: `M1 M5 M15 M30 H1 H4 D1 W1 MN1`
Date format: `YYYY-MM-DD` or `YYYY-MM-DDTHH:MM:SS`

Response:
```json
{
  "from_date": "...",
  "to_date": "...",
  "data": [
    { "time": "...", "open": 1.085, "high": 1.086, "low": 1.084, "close": 1.0855, "volume": 1523 }
  ]
}
```

### Economic Calendar
```
GET /v1/calendar?period=today
```
Period options: `today | yesterday | tomorrow | this_week | last_week | next_week | this_month | last_month | next_month`
Or use `from_date`/`to_date` directly.

### Symbol Management
```
GET /v1/symbol/list          # All broker symbols (large payload)
GET /v1/symbol/count         # Quick fingerprint: { "count": 20000 }
```

### Tracking Subscriptions (POST)

**Price Tracking:**
```
POST /v1/track/prices
{ "symbols": ["EURUSD", "GBPUSD"] }
```
Send `symbols: []` to STOP tracking.

**OHLC Tracking:**
```
POST /v1/track/ohlc
{ "ohlc": [{ "symbol": "EURUSD", "time_frame": "M5", "depth": 3 }] }
```
Depth: 1-10. Returns "accepted" and "rejected" per item.

**Market Book (DOM):**
```
POST /v1/track/mbook
{ "symbols": ["EURUSD"] }
```

**Calendar Tracking:**
```
POST /v1/track/calendar
{ "country": "US", "currency": "" }
```
Both fields optional. Send `{}` to stop.

---

## WebSocket Streaming

**Connection:** `ws://<host>:8890` (standard WebSocket handshake)

### Message Types
| Type | Trigger |
|------|---------|
| `price_update` | Bid/ask changed for tracked symbol |
| `ohlc_update` | New bar formed for tracked OHLC |
| `track_mbook` | Order book/DOM changed |
| `calendar_update` | Calendar event updated |

### Example price_update:
```json
{
  "type": "price_update",
  "timestamp": 1754732345,
  "symbol": "EURUSD",
  "volume": 12,
  "bid": 1.0849,
  "ask": 1.0851,
  "spread": 20,
  "digits": 5
}
```

---

## Backend Integration (Node.js)

```javascript
import WebSocket from "ws";

// 1. Set what to track (at startup or when changed)
await fetch("http://mt5-host:8890/v1/track/prices", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ symbols: ["EURUSD", "XAUUSD"] }),
});

// 2. Listen to stream
const ws = new WebSocket("ws://mt5-host:8890");
ws.on("message", (raw) => {
  const msg = JSON.parse(raw.toString());
  switch (msg.type) {
    case "price_update":
      console.log(msg.symbol, msg.bid, msg.ask);
      break;
    case "ohlc_update":
    case "track_mbook":
    case "calendar_update":
      // handle as needed
      break;
  }
});

ws.on("close", () => {
  // Reconnect - tracking state lives in EA, not connection
  // Plain reconnect usually enough unless tracking needs change
});
```

---

## Backend Implementation Details

### Connection Flow
1. **Startup**: `Mt5Client.connect()` called in `runStartupJobs()`
2. **WebSocket**: Connects to `ws://${MT5_BRIDGE_URL}` or `MT5_WS_URL`
3. **Auto-subscribe**: Sends `{ "action": "subscribe", "symbols": [] }` on connect
4. **Auto-reconnect**: 10 attempts, 5s delay with exponential backoff

### Message Handling
- `symbols` → Updates `broker_symbols` table via `SymbolService`
- `calendar` → Updates `calendar_events` table via `CalendarService`
- `tick` → Real-time price updates (currently logged only)

### Scheduled Sync
| Job | Schedule | Action |
|-----|----------|--------|
| Startup | Server start | Connect + auto-sync symbols & calendar |
| Daily 02:00 | Cron | `SymbolService.syncBrokerSymbols()` |
| Daily 03:00 | Cron | `CalendarService.syncIfNeeded()` |
| Broker midnight | Calculated | D1 cache warmup |

---

## Configuration

```env
# MT5 Bridge
MT5_WS_URL=ws://your-mt5-bridge:8890
MT5_BRIDGE_URL=127.0.0.1:8890
MT5_BROKER_UTC_OFFSET=3
```

---

## Current Backend Usage

### Real-time Prices
Not yet consumed by backend services. The `tick` message type is received but only logged.

### Symbols & Calendar
Synced to PostgreSQL via `SymbolService` and `CalendarService`. Used by:
- `GET /api/v1/market/symbols`
- `GET /api/v1/market/calendar`

### OHLC/Market Book/Calendar Tracking
Not currently subscribed. Would need to POST to `/v1/track/*` endpoints.

---

## Next Steps for Full Integration

1. **Consume real-time ticks** in a price service
2. **Subscribe to OHLC** for chart data
3. **Track market book** for DOM data
4. **Track calendar** for economic events
5. **Implement price cache** (Redis) for low-latency reads