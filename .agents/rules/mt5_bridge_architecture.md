# Betrix & MT5-Bridge Architecture Guidelines

This rule file dictates how to interact with the MT5 EA and Betrix Node.js backend to respect their unique statefulness and quirks.

## 1. MT5 EA Statefulness (The Empty Array Rule)
**Constraint**: The MT5 EA is a persistent, stateful background process. It does not automatically wipe its subscriptions when the Node.js backend disconnects or restarts.
**Action**: If you need to stop tracking a feature (e.g., `MBOOK`, `OHLC`, `Prices`) or clear a list of symbols, you **MUST explicitly send an empty array** to the EA (e.g., `await mt5Client.trackMarketBook([])`). 
**Anti-Pattern**: Do NOT just comment out or remove the tracking code in `index.ts`. If the Node backend omits the command entirely, the EA will retain its old memory and continue executing those background subscriptions endlessly.

## 2. Daily % Change & Holiday Handling
**Constraint**: Financial markets have weekends and holidays, meaning "yesterday" is not always a valid trading day.
**Action**: To calculate a reliable daily percentage change, use MT5's native `CopyRates` behavior which automatically skips non-trading days.
- Request OHLC tracking with `timeframe: "D1"` and `depth: 2`.
- `bars[0]` represents the live current day.
- `bars[1]` consistently represents the last valid completed trading day (e.g., Friday, if today is Monday).

## 3. Market Book (Level 2) Broker Limitations
**Constraint**: Error `4903` (`ERR_MARKETBOOK_ADD_FAILED`) on major Forex pairs.
**Action**: This implies the retail broker does not support Level 2 Market Depth for those specific symbols. You should disable MBOOK tracking for those assets (using the Empty Array Rule) to prevent continuous log spam on the EA side.

## 4. Winston Logger Metadata Filtering
**Constraint**: When writing custom Winston formatters in `core/logging/logger.ts`, attempting to filter out default keys (like `pid`) can lead to infinite JSON spam if not handled correctly.
**Action**: You must explicitly construct a **new** metadata object (e.g., `metaObj`) containing only the desired keys, and call `JSON.stringify(metaObj)`. Mutating or stringifying the original `meta` object will leak the default keys (like `pid`) into the console output.
