# SocketBridge EA — MT5 WebSocket & REST API Gateway

> **Turn MetaTrader 5 into a programmable trading server.**  
> SocketBridge EA exposes MT5's trading engine, market data, and account information through a local REST API and real-time WebSocket streaming — no Manager API required.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Requirements](#requirements)
- [Installation](#installation)
- [Configuration](#configuration)
- [REST API Reference](#rest-api-reference)
  - [Account](#account)
  - [Quotes & Symbols](#quotes--symbols)
  - [Trading](#trading)
  - [Order Management](#order-management)
  - [History](#history)
  - [Calendar](#calendar)
- [WebSocket Streaming](#websocket-streaming)
  - [Subscribing to Streams](#subscribing-to-streams)
  - [Stream Types](#stream-types)
- [Error Handling](#error-handling)
- [Project Structure](#project-structure)
- [How It Works](#how-it-works)
- [Security Notes](#security-notes)
- [License](#license)

---

## Overview

SocketBridge EA is a MetaTrader 5 Expert Advisor that runs a **non-blocking TCP server** directly inside the MT5 terminal. It allows any external application — Python, Node.js, C#, web dashboards, mobile apps — to:

- **Place, modify, and close trades** via simple HTTP POST requests
- **Query account info, positions, symbols, and trade history** via HTTP GET
- **Receive real-time price ticks, OHLC bars, order book depth, trade events, and economic calendar** via persistent WebSocket connections

All communication uses **JSON** over standard HTTP/WebSocket protocols.

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    MetaTrader 5 Terminal                  │
│  ┌────────────────────────────────────────────────────┐  │
│  │              SocketBridgeEA.mq5                    │  │
│  │         (Main EA — Event Loop @ 20ms)              │  │
│  │                                                    │  │
│  │  OnInit() ──► Start TCP Server (port 8890)         │  │
│  │  OnTimer() ─► Accept ► Parse ► Route ► Respond     │  │
│  │  OnTradeTransaction() ──► Broadcast trade events   │  │
│  └──────────┬─────────────────────┬───────────────────┘  │
│             │                     │                       │
│    ┌────────▼────────┐   ┌───────▼────────┐              │
│    │  SocketManager  │   │ CommandHandler  │              │
│    │  (TCP/Accept)   │   │ (HTTP Router)   │              │
│    └────────┬────────┘   └───────┬────────┘              │
│             │                    │                        │
│    ┌────────▼────────────────────▼────────┐               │
│    │           CommandCore.mqh            │               │
│    │    (Business Logic / MT5 API Calls)  │               │
│    └──────┬──────────┬──────────┬─────────┘               │
│           │          │          │                         │
│    ┌──────▼──┐ ┌─────▼────┐ ┌──▼───────────┐            │
│    │ Data.mqh│ │ History  │ │ Validation   │            │
│    │(Streams)│ │ Manager  │ │ Utils        │            │
│    └─────────┘ └──────────┘ └──────────────┘            │
│                                                          │
│    ┌─────────────────────────────────────────┐           │
│    │  Libraries: socketlib / HttpLib /       │           │
│    │  WebSocketLib / JAson                   │           │
│    └─────────────────────────────────────────┘           │
└──────────────────────────────────────────────────────────┘
          ▲                           ▲
          │  HTTP (REST)              │  WebSocket (Streaming)
          ▼                           ▼
┌──────────────────────────────────────────────────────────┐
│            External Applications                         │
│  Python · Node.js · C# · Web Dashboard · Mobile App     │
└──────────────────────────────────────────────────────────┘
```

---

## Requirements

| Requirement          | Detail                                                    |
|----------------------|-----------------------------------------------------------|
| **MetaTrader 5**     | Any build with MQL5 support                               |
| **DLL Imports**      | Must be **enabled** in MT5 (`Tools > Options > Expert Advisors > Allow DLL imports`) |
| **Port 8890**        | Must be free and allowed through the local firewall       |
| **Operating System** | Windows (uses `ws2_32.dll` / `kernel32.dll`)              |

---

## Installation

1. **Copy all files** into your MT5 `Experts` directory:
   ```
   <MT5 Data Folder>\MQL5\Experts\SocketBridgeEA\
   └── SocketBridgeEA.mq5

   <MT5 Data Folder>\MQL5\Include\
   ├── CommandCore.mqh
   ├── CommandHandler.mqh
   ├── Data.mqh
   ├── HistoryManager.mqh
   ├── HttpLib.mqh
   ├── JAson.mqh
   ├── SocketManager.mqh
   ├── ValidationUtils.mqh
   ├── WebSocketLib.mqh
   └── socketlib.mqh
   ```

2. **Compile** `SocketBridgeEA.mq5` in MetaEditor (F7).

3. **Attach** the EA to any chart in MT5.

4. **Enable DLL imports** when prompted, or set it globally in `Tools > Options > Expert Advisors`.

5. The EA will start listening on `http://localhost:8890`. You should see initialization messages in the Experts tab.

---

## Configuration

Configuration is set via `#define` macros in `SocketBridgeEA.mq5`:

| Macro                 | Default | Description                                    |
|-----------------------|---------|------------------------------------------------|
| `HTTP_PORT`           | `8890`  | TCP port the server listens on                 |
| `SOCKET_BUFFER_SIZE`  | `4096`  | Receive buffer size in bytes                   |
| `TIMER_INTERVAL_MS`   | `20`    | Event loop interval (ms) — controls latency    |

> To change these values, edit the `#define` lines in `SocketBridgeEA.mq5` and recompile.

---

## REST API Reference

**Base URL:** `http://localhost:8890`

All responses are JSON. All POST requests accept a JSON body with `Content-Type: application/json`.

---

### Account

#### `GET /v1/account`

Returns account information.

**Response:**
```json
{
  "balance": 10000.00,
  "equity": 10250.50,
  "margin": 500.00,
  "free_margin": 9750.50,
  "margin_level": 2050.10,
  "leverage": 100,
  "currency": "USD",
  "server": "MetaQuotes-Demo",
  "name": "John Doe",
  "login": 12345678,
  "company": "MetaQuotes"
}
```

---

### Quotes & Symbols

#### `GET /v1/quote?symbol=EURUSD`

Returns the current bid/ask price for a symbol.

**Query Parameters:**

| Parameter | Required | Description          |
|-----------|----------|----------------------|
| `symbol`  | Yes      | Symbol name          |

---

#### `GET /v1/symbol/info?symbol=EURUSD`

Returns detailed symbol configuration (spread, lot sizes, trade modes, etc.).

**Query Parameters:**

| Parameter | Required | Description          |
|-----------|----------|----------------------|
| `symbol`  | Yes      | Symbol name          |

---

#### `GET /v1/symbol/list`

Returns a list of all available symbols in the Market Watch.

---

### Trading

#### `POST /v1/order`

Place a new trade order.

**Request Body:**
```json
{
  "symbol": "EURUSD",
  "volume": 0.1,
  "order_type": "buy",
  "sl": 1.0800,
  "tp": 1.1200,
  "price": 1.1000,
  "magic": 12345,
  "comment": "API trade"
}
```

| Field        | Required | Description                                                                 |
|--------------|----------|-----------------------------------------------------------------------------|
| `symbol`     | Yes      | Trading symbol                                                              |
| `volume`     | Yes      | Lot size                                                                    |
| `order_type` | Yes      | `buy`, `sell`, `buy_limit`, `sell_limit`, `buy_stop`, `sell_stop`           |
| `sl`         | No       | Stop Loss price                                                             |
| `tp`         | No       | Take Profit price                                                           |
| `price`      | No       | Entry price (required for pending orders)                                   |
| `magic`      | No       | Magic number for EA identification                                          |
| `comment`    | No       | Order comment                                                               |

> **Filling Modes:** The EA automatically tries FOK → IOC → RETURN to find a supported filling mode.

---

#### `POST /v1/order/modify`

Modify an existing order or position (SL, TP, or pending price).

**Request Body:**
```json
{
  "ticket": 123456789,
  "sl": 1.0850,
  "tp": 1.1150,
  "price": 1.0950
}
```

---

#### `POST /v1/order/close`

Close an open position. Supports partial close.

**Request Body:**
```json
{
  "ticket": 123456789,
  "volume": 0.05
}
```

| Field    | Required | Description                                          |
|----------|----------|------------------------------------------------------|
| `ticket` | Yes      | Position ticket number                               |
| `volume` | No       | Partial close volume (omit to close full position)   |

---

### Order Management

#### `GET /v1/order/list`

Returns all active positions and pending orders.

---

#### `GET /v1/order/info?ticket=123456789`

Returns details for a specific order/position.

**Query Parameters:**

| Parameter | Required | Description          |
|-----------|----------|----------------------|
| `ticket`  | Yes      | Ticket number        |

---

### History

#### `GET /v1/history/orders`

Returns historical order records with advanced deal-linking. Reconstructs the full lifecycle of each trade including entry, exit, pip profit, and whether it was triggered by a pending order.

**Query Parameters:**

| Parameter    | Required | Description                               |
|--------------|----------|-------------------------------------------|
| `from`       | No       | Start date (ISO 8601: `2024-01-01T00:00:00Z`) |
| `to`         | No       | End date (ISO 8601)                       |

---

#### `GET /v1/history/prices`

Returns historical OHLC bar data.

**Query Parameters:**

| Parameter   | Required | Description                                      |
|-------------|----------|--------------------------------------------------|
| `symbol`    | Yes      | Symbol name                                      |
| `timeframe` | Yes      | Timeframe (`M1`, `M5`, `M15`, `H1`, `H4`, `D1`, etc.) |
| `from`      | Yes      | Start date (ISO 8601)                            |
| `to`        | Yes      | End date (ISO 8601)                              |

---

### Calendar

#### `GET /v1/calendar`

Returns upcoming economic calendar events.

**Query Parameters:**

| Parameter  | Required | Description                                |
|------------|----------|--------------------------------------------|
| `country`  | No       | Country code filter (e.g., `US`, `EU`)     |
| `currency` | No       | Currency filter (e.g., `USD`, `EUR`)       |
| `days`     | No       | Number of days to look ahead               |

---

## WebSocket Streaming

Connect to `ws://localhost:8890` to receive real-time data streams. After the WebSocket handshake, subscribe to specific data streams using POST-style subscription messages.

### Subscribing to Streams

Send HTTP POST requests to the subscription endpoints. Once subscribed, the EA will push JSON updates through the WebSocket connection whenever data changes.

---

### Stream Types

#### Price Ticks — `POST /v1/track/prices`

Subscribe to real-time bid/ask price updates.

```json
{ "symbols": ["EURUSD", "GBPUSD", "USDJPY"] }
```

**Push Update:**
```json
{
  "type": "price",
  "symbol": "EURUSD",
  "bid": 1.1050,
  "ask": 1.1052,
  "time": "2024-01-15T10:30:00Z"
}
```

---

#### OHLC Bars — `POST /v1/track/ohlc`

Subscribe to bar close events on specific symbols and timeframes.

```json
{ "symbol": "EURUSD", "timeframe": "M1" }
```

---

#### Market Depth (Level 2) — `POST /v1/track/mbook`

Subscribe to order book changes.

```json
{ "symbol": "EURUSD" }
```

> **Optimization:** Uses an XOR-based hash function over the entire order book. Updates are only pushed when the hash changes, minimizing bandwidth usage.

---

#### Trade Events — `POST /v1/track/orders`

Subscribe to trade execution events (fills, TP/SL hits, manual closes).

```json
{}
```

**Push Update (example — SL hit):**
```json
{
  "type": "trade_event",
  "ticket": 123456789,
  "symbol": "EURUSD",
  "reason": "sl",
  "profit": -25.30
}
```

---

#### Economic Calendar — `POST /v1/track/calendar`

Subscribe to upcoming economic calendar event notifications.

```json
{ "country": "US", "currency": "USD" }
```

---

## Error Handling

All errors are returned as JSON with an appropriate HTTP status code:

```json
{
  "error": true,
  "code": 400,
  "message": "Invalid symbol: INVALIDPAIR"
}
```

| Code | Meaning                                          |
|------|--------------------------------------------------|
| 400  | Bad Request — invalid parameters or missing fields |
| 404  | Not Found — unknown endpoint or symbol           |
| 500  | Server Error — MT5 trade execution failure       |

Trade execution errors include MT5's native retcode description for easy debugging.

---

## Project Structure

```
SocketBridgeEA/
│
├── SocketBridgeEA.mq5      # Main EA — event loop, initialization, trade events
│
├── SocketManager.mqh        # TCP server socket management (bind, accept, non-blocking I/O)
├── CommandHandler.mqh       # HTTP router — parses requests, routes to handlers
├── CommandCore.mqh          # Business logic — executes MT5 API calls, builds responses
├── Data.mqh                 # Real-time streaming engine — subscriptions & change detection
├── HistoryManager.mqh       # Trade history reconstruction — deal/order/position linking
├── ValidationUtils.mqh      # Input validation — symbols, dates, JSON structure checks
│
├── socketlib.mqh            # Low-level Winsock2 API bindings for MQL5
├── HttpLib.mqh              # HTTP request/response parsing
├── WebSocketLib.mqh         # WebSocket handshake & frame encoding/decoding
└── JAson.mqh                # JSON serialization/deserialization library
```

---

## How It Works

```
1. OnInit()
   └── WSAStartup → Create TCP Socket → Bind to port 8890 → Listen → Start 20ms Timer

2. OnTimer() (every 20ms)
   ├── AcceptNewClients()      → Accept incoming TCP connections
   ├── ProcessHttpClients()    → Read data from HTTP sockets
   │   ├── Standard HTTP?      → Route → Execute → JSON Response → Close socket
   │   └── WebSocket Upgrade?  → Handshake → Move to WebSocket client list
   └── SendUpdateToClients()   → For each WS client:
       ├── Check price changes    → Push tick updates
       ├── Check OHLC changes     → Push bar close events
       ├── Check book hash        → Push market depth updates
       └── Check calendar         → Push calendar events

3. OnTradeTransaction()        → Triggered by MT5 on trade fills
   └── Evaluate deal reason (TP/SL/manual) → Broadcast to all WS clients
```

**Key Design Decisions:**

- **Non-blocking I/O**: All sockets use `FIONBIO` mode. The EA never blocks MT5's thread — critical since EAs share a single thread per symbol.
- **State Hashing**: Market book updates use XOR hashing to detect changes efficiently, avoiding unnecessary JSON serialization and network I/O.
- **Smart Deal Linking**: HistoryManager correlates MT5's fragmented deals, orders, and positions by `POSITION_ID` and chronological order to reconstruct complete trade lifecycles.
- **UTC Normalization**: All timestamps are normalized to UTC (ISO 8601), correcting MT5's server time offset using `TimeTradeServer() - TimeGMT()`.

---

## Usage Examples

### Python
```python
import requests

# Get account info
account = requests.get("http://localhost:8890/v1/account").json()
print(f"Balance: {account['balance']}")

# Place a trade
trade = requests.post("http://localhost:8890/v1/order", json={
    "symbol": "EURUSD",
    "volume": 0.1,
    "order_type": "buy",
    "sl": 1.0800,
    "tp": 1.1200
}).json()
print(f"Order placed: {trade}")
```

### JavaScript (Node.js)
```javascript
const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:8890');

ws.on('open', () => {
  console.log('Connected to SocketBridge EA');
});

ws.on('message', (data) => {
  const update = JSON.parse(data);
  console.log('Received:', update);
});
```

### cURL
```bash
# Get current quote
curl http://localhost:8890/v1/quote?symbol=EURUSD

# Close a position
curl -X POST http://localhost:8890/v1/order/close \
  -H "Content-Type: application/json" \
  -d '{"ticket": 123456789}'
```

---

## Security Notes

> ⚠️ **This EA is designed for local use only.**

- The server binds to `localhost` — it is **not** exposed to the internet by default.
- There is **no authentication** mechanism. Do not expose port 8890 to untrusted networks.
- If remote access is needed, use a reverse proxy (e.g., Nginx) with TLS and authentication in front of the EA.
- Always run on a **firewall-protected** machine.

---

## License

This project is proprietary software developed by **Betrix**. All rights reserved.
