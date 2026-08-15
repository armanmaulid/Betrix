//+------------------------------------------------------------------+
//| Data.mqh                                                        |
//| Real-time data streaming for MT5 socket communication           |
//| Handles: Price tracking, OHLC bar tracking, Market Book (DOM)   |
//+------------------------------------------------------------------+
#ifndef DATA_MQH
#define DATA_MQH

#include "JAson.mqh"
#include "socketlib.mqh"
#include "WebSocketLib.mqh"
#include "Logger.mqh"

//+------------------------------------------------------------------+
//| Structs                                                          |
//+------------------------------------------------------------------+

// Input struct: what the client requests for OHLC tracking
struct OhlcRequest {
   string symbol;
   ENUM_TIMEFRAMES timeframe;
   int depth;
};

// Internal struct: tracks price change detection per symbol
struct SymbolPriceData {
    string symbol;
    double lastBid;
    double lastAsk;
    bool   initialized;
};

// Internal struct: tracks OHLC new-bar detection per symbol/timeframe
struct OhlcData {
    string          symbol;
    ENUM_TIMEFRAMES timeframe;
    int             depth;
    datetime        lastBarTime;
    bool            initialized;
};


//+------------------------------------------------------------------+
//| CData Class Declaration                                          |
//+------------------------------------------------------------------+
class CData {
private:
    SOCKET64 client_socket;

    // ── Price tracking state ──
    string          symbols[];
    SymbolPriceData symbolData[];

    // ── OHLC tracking state ──
    OhlcData ohlcRequests[];

    // ── Market Book tracking state ──
    string mbookSymbols[];
    ulong  lastBookHashes[];
    bool   mbookFirstRun;

    // ── Calendar tracking state ──
    ulong  calendarChangeId;
    string calendarCountry;
    string calendarCurrency;

    // ── Core helpers ──
    void   Init();
    void   SendData(string jsonData);
    string TimeframeToString(ENUM_TIMEFRAMES tf);

    // ── Price helpers ──
    void   SendSymbolPrice(string symbol);
    bool   HasPriceChanged(string symbol, double currentBid, double currentAsk);
    void   UpdateStoredPrice(string symbol, double bid, double ask);
    int    FindSymbolIndex(string symbol);
    double GetSymbolBid(string symbol);
    double GetSymbolAsk(string symbol);
    double GetSymbolSpread(string symbol);

    // ── OHLC helpers ──
    void   SendSymbolOhlc(string symbol, ENUM_TIMEFRAMES timeframe, int depth);
    bool   HasNewBar(string symbol, ENUM_TIMEFRAMES timeframe);
    void   UpdateLastBarTime(string symbol, ENUM_TIMEFRAMES timeframe, datetime barTime);
    int    FindOhlcIndex(string symbol, ENUM_TIMEFRAMES timeframe);

    // ── Market Book helpers ──
    ulong  CalculateBookHash(MqlBookInfo &bookInfo[]);

public:
    bool isTrackingPrice;
    bool isTrackingOhlc;
    bool isTrackingMbook;
    bool isTrackingCalendar;

    // ── Constructors ──
    CData();
    CData(SOCKET64 socket);

    // ── Configuration (called by CommandCore) ──
    void SetSymbols(const string &inputSymbols[]);
    void SetOhlcRequests(const OhlcRequest &requests[]);
    void SetMbookSymbols(const string &inputSymbols[]);
    void SetCalendarTracking(string country, string currency);

    // ── Streaming (called by EA timer loop) ──
    void SendCurrentPrices(SOCKET64 sock);
    void SendCurrentOhlcs(SOCKET64 sock);
    void SendCurrentMbook(SOCKET64 sock);
    void SendCalendarUpdates(SOCKET64 sock);

    // ── Status heartbeat (called by EA timer loop, throttled) ──
    // Lets the backend detect "EA restarted / tracking config wiped" without
    // relying solely on WS onclose - covers non-graceful EA death too (crash,
    // kill, terminal shutdown), where onclose can be delayed or never fire.
    void SendTrackingStatus(SOCKET64 sock, datetime eaStartTime);
};


//+------------------------------------------------------------------+
//|                                                                  |
//|   ███  SECTION: Core                                             |
//|                                                                  |
//+------------------------------------------------------------------+

//+------------------------------------------------------------------+
//| Shared field initialization                                      |
//+------------------------------------------------------------------+
void CData::Init() {
    client_socket      = INVALID_SOCKET64;
    isTrackingPrice    = false;
    isTrackingOhlc     = false;
    isTrackingMbook    = false;
    isTrackingCalendar = false;
    mbookFirstRun      = true;
    calendarChangeId   = 0;
    calendarCountry    = "";
    calendarCurrency   = "";
    ArrayResize(symbols, 0);
    ArrayResize(symbolData, 0);
    ArrayResize(ohlcRequests, 0);
    ArrayResize(mbookSymbols, 0);
    ArrayResize(lastBookHashes, 0);
}

//+------------------------------------------------------------------+
//| Default constructor                                              |
//+------------------------------------------------------------------+
CData::CData() {
    Init();
}

//+------------------------------------------------------------------+
//| Constructor with pre-connected socket                            |
//+------------------------------------------------------------------+
CData::CData(SOCKET64 socket) : client_socket(socket) {
    Init();
}

//+------------------------------------------------------------------+
//| Send JSON data over the active WebSocket connection              |
//+------------------------------------------------------------------+
void CData::SendData(string jsonData) {
    if (client_socket == INVALID_SOCKET64) {
        Print("Socket not connected - cannot send data");
        return;
    }
    SendWebSocketTextFrame(client_socket, jsonData);
}

//+------------------------------------------------------------------+
//| Convert timeframe enum to human-readable string                  |
//+------------------------------------------------------------------+
string CData::TimeframeToString(ENUM_TIMEFRAMES tf) {
    switch(tf) {
        case PERIOD_M1:  return "M1";
        case PERIOD_M5:  return "M5";
        case PERIOD_M15: return "M15";
        case PERIOD_M30: return "M30";
        case PERIOD_H1:  return "H1";
        case PERIOD_H4:  return "H4";
        case PERIOD_D1:  return "D1";
        case PERIOD_W1:  return "W1";
        case PERIOD_MN1: return "MN1";
        default:         return "UNKNOWN";
    }
}


//+------------------------------------------------------------------+
//|                                                                  |
//|   ███  SECTION: Configuration                                    |
//|                                                                  |
//+------------------------------------------------------------------+

//+------------------------------------------------------------------+
//| Set symbols for price tracking                                   |
//+------------------------------------------------------------------+
void CData::SetSymbols(const string &inputSymbols[]) {
    ArrayResize(symbols, 0);
    ArrayResize(symbolData, 0);

    int count = ArraySize(inputSymbols);
    string summary = "";

    if(count > 0) {
        ArrayResize(symbols, count);
        ArrayResize(symbolData, count);

        for(int i = 0; i < count; i++) {
            symbols[i] = inputSymbols[i];

            symbolData[i].symbol      = inputSymbols[i];
            symbolData[i].lastBid     = 0.0;
            symbolData[i].lastAsk     = 0.0;
            symbolData[i].initialized = false;

            if(i > 0) summary += ", ";
            summary += symbols[i];
        }
    }

    Print("Symbols set for price tracking: ", count, " symbols",
          (count > 0 ? " -> " + summary : ""));

    isTrackingPrice = (count > 0);
}

//+------------------------------------------------------------------+
//| Set OHLC tracking requests                                       |
//+------------------------------------------------------------------+
void CData::SetOhlcRequests(const OhlcRequest &requests[]) {
    ArrayResize(ohlcRequests, 0);

    int count = ArraySize(requests);
    string summary = "";

    if(count > 0) {
        ArrayResize(ohlcRequests, count);

        for(int i = 0; i < count; i++) {
            ohlcRequests[i].symbol      = requests[i].symbol;
            ohlcRequests[i].timeframe   = requests[i].timeframe;
            ohlcRequests[i].depth       = requests[i].depth;
            ohlcRequests[i].lastBarTime = 0;
            ohlcRequests[i].initialized = false;

            if(i > 0) summary += ", ";
            summary += requests[i].symbol + " " + TimeframeToString(requests[i].timeframe) +
                       " depth=" + IntegerToString(requests[i].depth);
        }
    }

    Print("OHLC requests set for tracking: ", count, " requests",
          (count > 0 ? " -> " + summary : ""));

    isTrackingOhlc = (count > 0);
}

//+------------------------------------------------------------------+
//| Set symbols for Market Book (DOM) tracking                       |
//+------------------------------------------------------------------+
void CData::SetMbookSymbols(const string &inputSymbols[]) {
    // Unsubscribe from previous symbols - only the failures are worth a
    // line, a clean unsubscribe of N symbols isn't news.
    string unsubFailed = "";
    for (int i = 0; i < ArraySize(mbookSymbols); i++) {
        if (!MarketBookRelease(mbookSymbols[i])) {
            if (unsubFailed != "") unsubFailed += ", ";
            unsubFailed += mbookSymbols[i];
        }
    }
    if (unsubFailed != "")
        Print("Mbook unsubscribe failed: ", unsubFailed, " (", GetLastError(), ")");

    ArrayResize(mbookSymbols, 0);

    // Subscribe to new symbols
    int count = ArraySize(inputSymbols);
    string subscribed = "", subFailed = "";

    if(count > 0) {
        ArrayResize(mbookSymbols, count);

        for(int i = 0; i < count; i++) {
            mbookSymbols[i] = inputSymbols[i];

            if (MarketBookAdd(mbookSymbols[i])) {
                if (subscribed != "") subscribed += ", ";
                subscribed += mbookSymbols[i];
            } else {
                if (subFailed != "") subFailed += ", ";
                subFailed += mbookSymbols[i];
            }
        }
    }

    Print("Symbols set for mbook tracking: ", count, " symbols",
          (subscribed != "" ? " -> subscribed: " + subscribed : ""));
    if (subFailed != "")
        Print("Mbook subscribe failed: ", subFailed, " (", GetLastError(), ")");

    // Reset change-detection state so new symbols always send on first tick
    ArrayResize(lastBookHashes, 0);
    mbookFirstRun = true;

    isTrackingMbook = (count > 0);
}


//+------------------------------------------------------------------+
//|                                                                  |
//|   ███  SECTION: Price Tracking                                   |
//|                                                                  |
//+------------------------------------------------------------------+

//+------------------------------------------------------------------+
//| Stream price updates for all tracked symbols (change-detect)     |
//+------------------------------------------------------------------+
void CData::SendCurrentPrices(SOCKET64 sock) {
    client_socket = sock;

    for (int i = 0; i < ArraySize(symbols); i++) {
        string symbol     = symbols[i];
        double currentBid = GetSymbolBid(symbol);
        double currentAsk = GetSymbolAsk(symbol);

        if (HasPriceChanged(symbol, currentBid, currentAsk)) {
            SendSymbolPrice(symbol);
            UpdateStoredPrice(symbol, currentBid, currentAsk);
        }
    }
}

//+------------------------------------------------------------------+
//| Build and send JSON for a single symbol's price                  |
//+------------------------------------------------------------------+
void CData::SendSymbolPrice(string symbol) {
    double   bid    = GetSymbolBid(symbol);
    double   ask    = GetSymbolAsk(symbol);
    double   spread = GetSymbolSpread(symbol);
    int      digits = (int)SymbolInfoInteger(symbol, SYMBOL_DIGITS);
    datetime ts     = TimeTradeServer();

    MqlTick tick;
    long realVolume = 0;
    if(SymbolInfoTick(symbol, tick))
        realVolume = (long)(tick.volume_real > 0 ? tick.volume_real : tick.volume);

    CJAVal jRes;
    jRes["type"]      = "price_update";
    jRes["timestamp"] = (long)ts;
    jRes["symbol"]    = symbol;
    jRes["volume"]    = (long)realVolume;
    jRes["bid"]       = bid;
    jRes["ask"]       = ask;
    jRes["spread"]    = spread;
    jRes["digits"]    = (long)digits;

    SendData(jRes.Serialize());
}

//+------------------------------------------------------------------+
//| Check if bid or ask has changed since last send                  |
//+------------------------------------------------------------------+
bool CData::HasPriceChanged(string symbol, double currentBid, double currentAsk) {
    int index = FindSymbolIndex(symbol);
    if(index < 0) return false;

    // First price for a newly-tracked symbol is always sent - not worth a
    // log line, "Symbols set for price tracking: ..." already announced it.
    if(!symbolData[index].initialized) return true;

    return (symbolData[index].lastBid != currentBid ||
            symbolData[index].lastAsk != currentAsk);
}

//+------------------------------------------------------------------+
//| Store latest bid/ask for change detection                        |
//+------------------------------------------------------------------+
void CData::UpdateStoredPrice(string symbol, double bid, double ask) {
    int index = FindSymbolIndex(symbol);
    if(index >= 0) {
        symbolData[index].lastBid     = bid;
        symbolData[index].lastAsk     = ask;
        symbolData[index].initialized = true;
    }
}

//+------------------------------------------------------------------+
//| Find symbol in the symbolData tracking array                     |
//+------------------------------------------------------------------+
int CData::FindSymbolIndex(string symbol) {
    for(int i = 0; i < ArraySize(symbolData); i++) {
        if(symbolData[i].symbol == symbol)
            return i;
    }
    return -1;
}

//+------------------------------------------------------------------+
//| Symbol info wrappers                                             |
//+------------------------------------------------------------------+
double CData::GetSymbolBid(string symbol) {
    return SymbolInfoDouble(symbol, SYMBOL_BID);
}

double CData::GetSymbolAsk(string symbol) {
    return SymbolInfoDouble(symbol, SYMBOL_ASK);
}

double CData::GetSymbolSpread(string symbol) {
    return SymbolInfoInteger(symbol, SYMBOL_SPREAD) * SymbolInfoDouble(symbol, SYMBOL_POINT);
}


//+------------------------------------------------------------------+
//|                                                                  |
//|   ███  SECTION: OHLC Tracking                                   |
//|                                                                  |
//+------------------------------------------------------------------+

//+------------------------------------------------------------------+
//| Stream OHLC bar updates for all tracked requests (new-bar detect)|
//+------------------------------------------------------------------+
void CData::SendCurrentOhlcs(SOCKET64 sock) {
    client_socket = sock;

    for(int i = 0; i < ArraySize(ohlcRequests); i++) {
        string symbol           = ohlcRequests[i].symbol;
        ENUM_TIMEFRAMES tf      = ohlcRequests[i].timeframe;

        if(HasNewBar(symbol, tf)) {
            SendSymbolOhlc(symbol, tf, ohlcRequests[i].depth);

            // Update tracking state
            MqlRates rates[];
            if(CopyRates(symbol, tf, 0, 1, rates) > 0) {
                UpdateLastBarTime(symbol, tf, rates[0].time);
                ohlcRequests[i].initialized = true;
            }
        }
    }
}

//+------------------------------------------------------------------+
//| Build and send JSON for OHLC bars of one symbol/timeframe        |
//+------------------------------------------------------------------+
void CData::SendSymbolOhlc(string symbol, ENUM_TIMEFRAMES timeframe, int depth) {
    MqlRates rates[];

    int copied = CopyRates(symbol, timeframe, 0, depth, rates);
    if(copied <= 0) {
        Print("Failed to copy rates for ", symbol, " ", TimeframeToString(timeframe));
        return;
    }

    // Per-bar, per-symbol/timeframe - fires continuously all day with several
    // tracked symbols, so it's debug-level, not something worth always showing.
    LogDebug("OHLC update for " + symbol + " " + TimeframeToString(timeframe) + " - " + IntegerToString(copied) + " bars");

    CJAVal jRes;
    jRes["type"]      = "ohlc_update";
    jRes["symbol"]    = symbol;
    jRes["timeframe"] = TimeframeToString(timeframe);

    CJAVal jBars;
    jBars.Clear(jtARRAY);

    for(int i = 0; i < copied; i++) {
        CJAVal jBar;
        jBar["time"]   = TimeToString(rates[i].time, TIME_DATE|TIME_MINUTES|TIME_SECONDS);
        jBar["open"]   = rates[i].open;
        jBar["high"]   = rates[i].high;
        jBar["low"]    = rates[i].low;
        jBar["close"]  = rates[i].close;
        jBar["volume"] = (long)rates[i].tick_volume;

        jBars.Add(jBar);
    }

    jRes["bars"].Set(jBars);

    SendData(jRes.Serialize());
}

//+------------------------------------------------------------------+
//| Check if a new bar has formed since last send                    |
//+------------------------------------------------------------------+
bool CData::HasNewBar(string symbol, ENUM_TIMEFRAMES timeframe) {
    int index = FindOhlcIndex(symbol, timeframe);
    if(index < 0) return false;

    if(!ohlcRequests[index].initialized)
        return true;

    MqlRates rates[];
    if(CopyRates(symbol, timeframe, 0, 1, rates) <= 0)
        return false;

    return (rates[0].time > ohlcRequests[index].lastBarTime);
}

//+------------------------------------------------------------------+
//| Store the latest bar time for new-bar detection                  |
//+------------------------------------------------------------------+
void CData::UpdateLastBarTime(string symbol, ENUM_TIMEFRAMES timeframe, datetime barTime) {
    int index = FindOhlcIndex(symbol, timeframe);
    if(index >= 0)
        ohlcRequests[index].lastBarTime = barTime;
}

//+------------------------------------------------------------------+
//| Find OHLC request index for a symbol/timeframe pair              |
//+------------------------------------------------------------------+
int CData::FindOhlcIndex(string symbol, ENUM_TIMEFRAMES timeframe) {
    for(int i = 0; i < ArraySize(ohlcRequests); i++) {
        if(ohlcRequests[i].symbol == symbol && ohlcRequests[i].timeframe == timeframe)
            return i;
    }
    return -1;
}


//+------------------------------------------------------------------+
//|                                                                  |
//|   ███  SECTION: Market Book (DOM) Tracking                       |
//|                                                                  |
//+------------------------------------------------------------------+

//+------------------------------------------------------------------+
//| Stream market book updates (hash-based change detection)         |
//+------------------------------------------------------------------+
void CData::SendCurrentMbook(SOCKET64 sock) {
    client_socket = sock;

    for (int i = 0; i < ArraySize(mbookSymbols); i++) {
        string symbol = mbookSymbols[i];
        MqlBookInfo bookInfo[];

        if (!MarketBookGet(symbol, bookInfo)) {
            Print("Failed to get market book for ", symbol, " error: ", GetLastError());
            continue;
        }

        // Ensure hash array is large enough
        if (i >= ArraySize(lastBookHashes)) {
            ArrayResize(lastBookHashes, i + 1);
            lastBookHashes[i] = 0;
        }

        // Calculate current hash
        ulong currentHash = CalculateBookHash(bookInfo);

        // Skip if no change (except first run)
        if (currentHash == lastBookHashes[i] && !mbookFirstRun)
            continue;

        // Store new hash
        lastBookHashes[i] = currentHash;

        // Build and send JSON
        CJAVal jRes;
        jRes["type"]   = "track_mbook";
        jRes["symbol"] = symbol;

        CJAVal jBook;
        jBook.Clear(jtARRAY);

        string timeStr = TimeToString(TimeCurrent(), TIME_DATE | TIME_MINUTES | TIME_SECONDS);
        for (int j = 0; j < ArraySize(bookInfo); j++) {
            CJAVal jItem;
            jItem["time"]       = timeStr;
            jItem["price"]      = bookInfo[j].price;
            jItem["volume"]     = (long)bookInfo[j].volume;
            jItem["volumereal"] = bookInfo[j].volume_real;
            jItem["type"]       = (bookInfo[j].type == BOOK_TYPE_BUY) ? "BOOK_TYPE_BUY" : "BOOK_TYPE_SELL";
            jBook.Add(jItem);
        }

        jRes["market_book"].Set(jBook);
        SendData(jRes.Serialize());
    }

    mbookFirstRun = false;
}

//+------------------------------------------------------------------+
//| Hash the entire book snapshot for change detection                |
//+------------------------------------------------------------------+
ulong CData::CalculateBookHash(MqlBookInfo &bookInfo[]) {
    ulong hash = 0;
    int size = ArraySize(bookInfo);

    for (int i = 0; i < size; i++) {
        ulong priceHash      = (ulong)(bookInfo[i].price * 100000);
        ulong volumeHash     = (ulong)bookInfo[i].volume;
        ulong volumeRealHash = (ulong)(bookInfo[i].volume_real * 100);
        ulong typeHash       = (ulong)bookInfo[i].type;

        hash ^= priceHash      + 0x9e3779b9 + (hash << 6) + (hash >> 2);
        hash ^= volumeHash     + 0x9e3779b9 + (hash << 6) + (hash >> 2);
        hash ^= volumeRealHash + 0x9e3779b9 + (hash << 6) + (hash >> 2);
        hash ^= typeHash       + 0x9e3779b9 + (hash << 6) + (hash >> 2);
    }

    return hash;
}


//+------------------------------------------------------------------+
//|                                                                  |
//|   ███  SECTION: Calendar Tracking                                |
//|                                                                  |
//+------------------------------------------------------------------+

//+------------------------------------------------------------------+
//| Configure calendar event streaming filters                       |
//+------------------------------------------------------------------+
void CData::SetCalendarTracking(string country, string currency) {
    // Treat "ALL" as NULL (no filter in MQL5)
    calendarCountry  = (country == "ALL" ? NULL : country);
    calendarCurrency = (currency == "ALL" ? NULL : currency);
    calendarChangeId = 0;

    // Empty filters = disable tracking
    bool enabled = (country != "" || currency != "");
    isTrackingCalendar = enabled;

    if (enabled) {
        // Initialize change_id to current database state
        // First call with change_id=0 returns 0 events but sets the cursor
        MqlCalendarValue values[];
        CalendarValueLast(calendarChangeId, values, calendarCountry, calendarCurrency);
        Print("Calendar tracking enabled — country: ",
              (country != "" ? country : "ALL"),
              ", currency: ",
              (currency != "" ? currency : "ALL"),
              ", change_id: ", calendarChangeId);
    } else {
        Print("Calendar tracking disabled");
    }
}

//+------------------------------------------------------------------+
//| Stream calendar event updates (change_id-based detection)        |
//+------------------------------------------------------------------+
void CData::SendCalendarUpdates(SOCKET64 sock) {
    client_socket = sock;

    MqlCalendarValue values[];
    int count = CalendarValueLast(calendarChangeId, values,
                                  calendarCountry, calendarCurrency);

    if (count <= 0)
        return;

    Print("Calendar update: ", count, " event(s) changed");

    CJAVal jRes;
    jRes["type"] = "calendar_update";

    CJAVal jEvents;
    jEvents.Clear(jtARRAY);

    for (int i = 0; i < count; i++) {
        CJAVal row;

        // Enrich with event metadata
        MqlCalendarEvent eventInfo;
        MqlCalendarCountry countryInfo;
        string eventName    = "Unknown";
        int    importance   = 0;
        string currency     = "";
        string country_code = "";

        if (CalendarEventById(values[i].event_id, eventInfo)) {
            eventName    = eventInfo.name;
            importance   = eventInfo.importance;
            if (CalendarCountryById(eventInfo.country_id, countryInfo)) {
                currency     = countryInfo.currency;
                country_code = countryInfo.code;
            }
        }

        row["value_id"]     = (long)values[i].id;
        row["event_id"]     = (long)values[i].event_id;
        row["name"]         = eventName;
        row["country_code"] = country_code;
        row["currency"]     = currency;
        row["importance"]   = (long)importance;

        // Format time as ISO 8601
        string t = TimeToString(values[i].time, TIME_DATE | TIME_MINUTES | TIME_SECONDS);
        StringReplace(t, ".", "-");
        StringReplace(t, " ", "T");
        row["time"] = t;

        // Values are stored × 1,000,000; LONG_MIN means not yet available
        if (values[i].actual_value != LONG_MIN)
            row["actual"] = (double)values[i].actual_value / 1000000.0;
        else
            row["actual"].Clear();

        if (values[i].forecast_value != LONG_MIN)
            row["forecast"] = (double)values[i].forecast_value / 1000000.0;
        else
            row["forecast"].Clear();

        if (values[i].prev_value != LONG_MIN)
            row["previous"] = (double)values[i].prev_value / 1000000.0;
        else
            row["previous"].Clear();

        jEvents.Add(row);
    }

    jRes["events"].Set(jEvents);
    SendData(jRes.Serialize());
}


//+------------------------------------------------------------------+
//|                                                                  |
//|   ███  SECTION: Status Heartbeat                                 |
//|                                                                  |
//+------------------------------------------------------------------+

//+------------------------------------------------------------------+
//| Broadcast current tracking flags + EA uptime (throttled by       |
//| caller to ~every 5s, not every timer tick). Backend compares     |
//| this against what it expects from its own .env config, and uses  |
//| the absence of this message (staleness) to detect a dead EA.     |
//+------------------------------------------------------------------+
void CData::SendTrackingStatus(SOCKET64 sock, datetime eaStartTime) {
    client_socket = sock;

    CJAVal jRes;
    jRes["type"]       = "tracking_status";
    jRes["price"]      = isTrackingPrice;
    jRes["ohlc"]       = isTrackingOhlc;
    jRes["mbook"]      = isTrackingMbook;
    jRes["calendar"]   = isTrackingCalendar;
    jRes["uptime_sec"] = (long)(TimeTradeServer() - eaStartTime);

    SendData(jRes.Serialize());
}


#endif // DATA_MQH
