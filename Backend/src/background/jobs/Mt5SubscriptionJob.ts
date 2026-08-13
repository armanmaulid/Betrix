import { container } from "tsyringe";
import { env } from "@config/env.js";
import { logger } from "@core/logging/logger.js";
import { IBrokerProvider } from "@application/ports/IBrokerProvider.js";
import { MarketDataService } from "@domain/services/MarketDataService.js";
import { CalendarService } from "@domain/services/CalendarService.js";

export class Mt5SubscriptionJob {
  static async setupAndConnect(): Promise<void> {
    const brokerClient = container.resolve<IBrokerProvider>("IBrokerProvider");
    const marketDataService = container.resolve(MarketDataService);
    
    // Set up broker callbacks to route real-time data to MarketDataService
    brokerClient.setCallbacks({
      onPriceTick: async (tick) => {
        // logger.debug(`Price update: ${tick.symbol} bid=${tick.bid} ask=${tick.ask}`, { context: "Broker" });
        await marketDataService.handlePriceTick(tick);
      },
      onOHLCUpdate: async (update) => {
        logger.debug(`OHLC update: ${update.symbol} ${update.timeframe}`, { context: "Broker" });
        await marketDataService.handleOHLCUpdate(update);
      },
      onMarketBookUpdate: async (update) => {
        logger.debug(`Market book update: ${update.symbol}`, { context: "Broker" });
        await marketDataService.handleMarketBookUpdate(update);
      },
      onCalendarUpdate: async (update) => {
        const calendarService = container.resolve(CalendarService);
        await calendarService.handleLiveUpdate(update);
      },

      // Layer 1 (reactive): every time the WS (re)connects - network blip OR
      // EA restart - re-apply tracking config from .env. Idempotent when the
      // EA is still alive with the same config; this is what actually fixes
      // the case where the EA restarted and lost its tracking state.
      onReconnect: () => {
        logger.info("MT5 WS (re)connected - re-applying tracking subscriptions", { context: "Broker" });
        Mt5SubscriptionJob.setupSubscriptions().catch(err =>
          logger.error("Resubscribe on reconnect failed", { context: "Broker", error: (err as Error).message })
        );
      },

      // Layer 2 (proactive): compare what the EA says is active right now
      // against what .env says should be active. Mismatch means the EA's
      // tracking config diverged from what we expect - resubscribe.
      onTrackingStatus: (status) => {
        const trackingSymbols = env.MT5_TRACKING_SYMBOLS;
        const expected = {
          price: env.MT5_TRACK_PRICES && trackingSymbols.length > 0,
          ohlc: env.MT5_TRACK_OHLC && trackingSymbols.length > 0,
          mbook: env.MT5_TRACK_MBOOK && trackingSymbols.length > 0,
          calendar: env.MT5_TRACK_CALENDAR,
        };

        const mismatch =
          status.price !== expected.price ||
          status.ohlc !== expected.ohlc ||
          status.mbook !== expected.mbook ||
          status.calendar !== expected.calendar;

        if (mismatch) {
          logger.warn("MT5 tracking status mismatch vs .env - resubscribing", {
            context: "Broker",
            expected,
            actual: { price: status.price, ohlc: status.ohlc, mbook: status.mbook, calendar: status.calendar },
            uptimeSec: status.uptimeSec,
          });
          Mt5SubscriptionJob.setupSubscriptions().catch(err =>
            logger.error("Resubscribe after status mismatch failed", { context: "Broker", error: (err as Error).message })
          );
        }
      },
    });

    // Connect to Broker WebSocket (non-blocking - HTTP works for all operations)
    brokerClient.connect().catch(err => 
      logger.warn("Broker WebSocket connection failed (HTTP API still works)", { context: "Broker", error: err.message })
    );
    logger.info("Broker Client initialized (HTTP mode)", { context: "Broker" });
  }

  // Guard against concurrent/rapid-fire calls. onReconnect and the first
  // onTrackingStatus mismatch can fire within milliseconds of each other,
  // causing duplicate POST /v1/track/* requests to the EA. This timestamp
  // lets us coalesce those into a single effective call.
  private static lastSubscriptionAt = 0;
  private static readonly SUBSCRIPTION_DEBOUNCE_MS = 5000;

  static async setupSubscriptions(): Promise<void> {
    const now = Date.now();
    if (now - Mt5SubscriptionJob.lastSubscriptionAt < Mt5SubscriptionJob.SUBSCRIPTION_DEBOUNCE_MS) {
      logger.debug("setupSubscriptions debounced (called too soon after last run)", { context: "Broker" });
      return;
    }
    Mt5SubscriptionJob.lastSubscriptionAt = now;

    const brokerClient = container.resolve<IBrokerProvider>("IBrokerProvider");
    
    try {
      const trackingSymbols = env.MT5_TRACKING_SYMBOLS;
      
      if (trackingSymbols.length > 0) {
        if (env.MT5_TRACK_PRICES) {
          try {
            await brokerClient.trackPrices(trackingSymbols);
            logger.info(`Subscribed to price tracking for ${trackingSymbols.length} major symbols`, { context: "Broker" });
          } catch (e) {
            logger.error(`Failed to track prices: ${(e as Error).message}`, { context: "Broker" });
          }
        }
        
        if (env.MT5_TRACK_OHLC) {
          try {
            const ohlcRequests = trackingSymbols.map(symbol => ({
              symbol,
              timeframe: "D1",
              depth: 2 // 0: Today (live), 1: Yesterday (completed)
            }));
            await brokerClient.trackOHLC(ohlcRequests);
            logger.info(`Subscribed to OHLC tracking for ${ohlcRequests.length} symbols`, { context: "Broker" });
          } catch (e) {
            logger.error(`Failed to track OHLC: ${(e as Error).message}`, { context: "Broker" });
          }
        }
        
        if (env.MT5_TRACK_MBOOK) {
          try {
            await brokerClient.trackMarketBook(trackingSymbols);
            logger.info(`Subscribed to market book tracking for ${trackingSymbols.length} symbols`, { context: "Broker" });
          } catch (e) {
            logger.error(`Failed to configure market book tracking: ${(e as Error).message}`, { context: "Broker" });
          }
        }
      }
      
      if (env.MT5_TRACK_CALENDAR) {
        try {
          await brokerClient.trackCalendar("ALL", "ALL");
          logger.info("Subscribed to calendar tracking", { context: "Broker" });
        } catch (e) {
          logger.error(`Failed to track calendar: ${(e as Error).message}`, { context: "Broker" });
        }
      }
    } catch (err) {
      logger.error("Failed to setup MT5 tracking subscriptions", { context: "MT5", error: (err as Error).message });
    }
  }
}
