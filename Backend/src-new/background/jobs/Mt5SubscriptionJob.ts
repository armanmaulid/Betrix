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
        logger.debug(`Price update: ${tick.symbol} bid=${tick.bid} ask=${tick.ask}`, { context: "Broker" });
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
        logger.debug(`Calendar update: event ${update.event_id}`, { context: "Broker" });
        const calendarService = container.resolve(CalendarService);
        await calendarService.handleLiveUpdate(update);
      }
    });

    // Connect to Broker WebSocket (non-blocking - HTTP works for all operations)
    brokerClient.connect().catch(err => 
      logger.warn("Broker WebSocket connection failed (HTTP API still works)", { context: "Broker", error: err.message })
    );
    logger.info("Broker Client initialized (HTTP mode)", { context: "Broker" });
  }

  static async setupSubscriptions(): Promise<void> {
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
