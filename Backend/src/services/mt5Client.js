import WebSocket from "ws";
import { logger } from "../utils/logger.js";

const MT5_URL = process.env.MT5_BRIDGE_URL || "127.0.0.1:8890";
export const latestPrices = {};

const trackedSymbols = new Set();
let wsConnection = null;

const priceListeners = new Set();

export function addPriceListener(fn) {
  priceListeners.add(fn);
}

export function removePriceListener(fn) {
  priceListeners.delete(fn);
}

async function sendTrackRequest() {
  if (trackedSymbols.size === 0) return;
  try {
    const res = await fetch(`http://${MT5_URL}/v1/track/prices`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbols: Array.from(trackedSymbols) })
    });
    if (!res.ok) {
      logger.error(`Failed to update tracking symbols: ${res.status}`, { context: "MT5" });
    } else {
      logger.debug(`Successfully requested live tracking for ${trackedSymbols.size} symbols`, { context: "MT5" });
    }
  } catch (e) {
    logger.error(`Error sending track request: ${e.message}`, { context: "MT5" });
  }
}

export async function subscribeToSymbol(symbol) {
  if (!trackedSymbols.has(symbol)) {
    trackedSymbols.add(symbol);
    // Send track request immediately if the WS is expected to be up
    if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
      await sendTrackRequest();
    }
  }
}

export function initializeMt5Client() {
  let reconnectTimer;
  let reconnectAttempt = 0;

  function getBackoffDelay() {
    const base = Math.min(1000 * Math.pow(2, reconnectAttempt), 30000);
    return base + Math.random() * 1000;
  }

  function connect() {
    // The MT5 EA upgrades the root endpoint to a WebSocket connection
    wsConnection = new WebSocket(`ws://${MT5_URL}/`);

    wsConnection.on("open", async () => {
      logger.info("Connected to WebSocket for Live Ticks", { context: "MT5" });
      reconnectAttempt = 0;
      
      // Tell the EA via HTTP POST which symbols we want to stream over this WebSocket
      await sendTrackRequest();
    });

    wsConnection.on("message", (data) => {
      try {
        const payload = JSON.parse(data.toString());
        if (payload.type === "price_update" && payload.symbol) {
           const priceObj = {
             price: payload.bid, // Default reference
             bid: payload.bid,
             ask: payload.ask,
             timestamp: Date.now() // Use Node.js local timestamp to avoid timezone issues
           };
           
           const oldPrice = latestPrices[payload.symbol];
           if (!oldPrice || oldPrice.price !== priceObj.price) {
             latestPrices[payload.symbol] = priceObj;
             priceListeners.forEach(fn => fn(payload.symbol, priceObj));
           }
        }
      } catch (e) {
        // Ignore parse errors
      }
    });

    wsConnection.on("close", () => {
      const delay = getBackoffDelay();
      reconnectAttempt++;
      logger.warn(`Live Ticks connection lost. Reconnecting in ${Math.round(delay / 1000)}s (attempt ${reconnectAttempt})...`, { context: "MT5" });
      wsConnection = null;
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connect, delay);
    });

    wsConnection.on("error", (err) => {
      logger.error(`WebSocket Error: ${err.message}`, { context: "MT5" });
      if (wsConnection) wsConnection.close();
    });
  }

  connect();
}

// REST API Helper for OHLC History
export async function fetchMt5History(symbol, timeframe, fromDate, toDate) {
  const url = `http://${MT5_URL}/v1/history/prices?symbol=${encodeURIComponent(symbol)}&time_frame=${encodeURIComponent(timeframe)}&from_date=${fromDate}&to_date=${toDate}`;
  const response = await fetch(url);
  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`MT5 Bridge responded with ${response.status}: ${errorText}`);
  }
  return await response.json();
}

// REST API Helper to get all available symbols from MT5
export async function fetchMt5Symbols() {
  const url = `http://${MT5_URL}/v1/symbol/list`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`MT5 Bridge responded with ${response.status}`);
  }
  return await response.json();
}
