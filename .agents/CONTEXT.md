# Betrix Project Context & State

**Last Updated**: 2026-08-11
**Purpose**: This document provides full context on the current state of the Betrix Node.js Backend and MT5 Bridge EA to ensure seamless continuation across development sessions.

## 1. Architecture Overview
- **Backend**: Node.js (TypeScript) communicating with MT5 EA via HTTP (for sending commands) and WebSockets (for receiving real-time streams).
- **MT5 EA**: A custom `SocketBridgeEA` running in MetaTrader 5 that listens for HTTP commands and streams requested data back over a WebSocket connection.
- **Caching**: Redis is used heavily on the backend to cache live prices and OHLC data.

## 2. What Was Accomplished & Fixed (The "Beautiful Night" Session)
- **12 Major Symbols Setup**: Tracking is now strictly optimized to 12 high-liquidity assets (EURUSD, GBPUSD, USDJPY, USDCAD, AUDUSD, NZDUSD, USDCHF, XAUUSD, XAGUSD, XTIUSD, BTCUSD, ETHUSD) instead of blindly pulling 100+ random active symbols.
- **D1 OHLC for Daily % Change**: 
  - Switched from `M5` to `D1` tracking with `depth: 2`.
  - **Why it matters**: MT5 natively skips weekends and holidays. `bars[0]` is the live candle, and `bars[1]` is universally the last completed trading day. The backend now caches `prev_close` natively to make frontend % change math effortless.
- **The MBOOK 4903 Spam Fix**: 
  - The retail broker does not support Level 2 Market Book data (Error 4903).
  - The EA is stateful. Simply removing the backend API call caused the EA to keep looping over old memory and spamming logs. 
  - **The Fix**: The backend now explicitly sends `trackMarketBook([])` on boot to aggressively flush the EA's memory.
- **Bulletproof Startup Sequence**: 
  - The tracking initialization in `index.ts` is now individually wrapped in `try/catch` blocks. If `trackOHLC` ever drops, it will no longer crash the sequence and prevent `trackMarketBook([])` or `trackCalendar()` from firing.
- **Logger Format Fixed**: 
  - A bug in `core/logging/logger.ts` caused the Winston console formatter to endlessly print `{ "pid": 1234 }` on new lines. The filtering logic was corrected by explicitly building a new `metaObj`, resulting in perfectly clean, single-line console output.

## 3. Current State of the Codebase
- **Backend Startup**: 100% stable. Automatically warms up the cache, skips full symbol syncs if unchanged, successfully subscribes to Prices, D1 OHLC, and Calendar, and safely disabled MBOOK.
- **EA Status**: 100% stable. No log spam, cleanly handles HTTP commands, streams via WebSocket seamlessly.

## 4. Next Steps
- Implement frontend UI components to consume the clean `prev_close` data from Redis for rendering live Daily % Change metrics.
- Build out any further trading execution logic relying on this rock-solid data stream.
