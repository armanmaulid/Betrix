//+------------------------------------------------------------------+
//|                                                  CommandCore.mqh |
//|                                  Copyright 2025, MetaQuotes Ltd. |
//|                                             https://www.mql5.com |
//+------------------------------------------------------------------+
#property copyright "Copyright 2025, MetaQuotes Ltd."
#property link      "https://www.mql5.com"

#include "Data.mqh"
#include "HttpLib.mqh"
#include "ValidationUtils.mqh"
#include "JAson.mqh"

struct JsonResponse {
    string jsonContent;
    int status;
};

//+------------------------------------------------------------------+
//| CCommandCore Class Declaration                                   |
//+------------------------------------------------------------------+
class CCommandCore {
private:
    CData *dataSender;

    // Response helpers
    JsonResponse SendError(int status, string details = "");
    JsonResponse SendJson(string jsonContent, int status = 200);

    // Shared tracking helpers (dedupe SetSymbols / SetMbook logic)
    void ValidateSymbolsArray(string &symbols[], string &validSymbols[], string &invalidSymbols[]);
    JsonResponse BuildTrackResponse(string &validSymbols[], string &invalidSymbols[]);

public:
    CCommandCore(CData *ps = NULL) {
        dataSender = ps;
    }

    // Tracking commands
    JsonResponse SetSymbols(string &symbols[]);
    JsonResponse SetOhlcRequests(OhlcRequest &requests[], string &rejected[]);
    JsonResponse SetMbook(string &symbols[]);
    JsonResponse SetCalendarTracking(string country, string currency);

    // Read commands
    JsonResponse GetQuote(string symbol);
    // from_date/to_date already validated+parsed by the caller (ValidateDateRange),
    // so this only does the CopyRates + JSON build; no re-parsing of raw strings here.
    JsonResponse RetriveHistoricalData(string symbol, ENUM_TIMEFRAMES tf, datetime from_date, datetime to_date);
    JsonResponse GetSymbolList();
    // Cheap fingerprint for backend cache-invalidation - just the count, no
    // per-symbol serialization. See GetSymbolList() for the full payload.
    JsonResponse GetSymbolCount();
    // from_date/to_date are only used when period == ""; caller already
    // validated+parsed them via ValidateDateRange in that case.
    JsonResponse GetCalendar(datetime from_date, datetime to_date, string period = "");
};


//+------------------------------------------------------------------+
//| CALENDAR                                                          |
//+------------------------------------------------------------------+
JsonResponse CCommandCore::GetCalendar(datetime from_date, datetime to_date, string period) {
    if (period != "") {
        MqlDateTime dt;
        // Fix: TimeTradeServer() instead of TimeCurrent(). TimeCurrent()
        // freezes at the last received tick and goes stale whenever the
        // market is closed (weekends, illiquid symbols). TimeTradeServer()
        // keeps counting regardless of tick flow.
        TimeToStruct(TimeTradeServer(), dt);
        dt.hour = 0; dt.min = 0; dt.sec = 0;
        datetime start_of_today = StructToTime(dt);

        if (period == "today") {
            from_date = start_of_today;
            to_date = start_of_today + 86400 - 1;
        } else if (period == "yesterday") {
            from_date = start_of_today - 86400;
            to_date = start_of_today - 1;
        } else if (period == "tomorrow") {
            from_date = start_of_today + 86400;
            to_date = start_of_today + 2 * 86400 - 1;
        } else if (period == "this_week" || period == "last_week" || period == "next_week") {
            int days_from_monday = dt.day_of_week - 1;
            if(days_from_monday < 0) days_from_monday = 6;
            datetime start_of_week = start_of_today - (days_from_monday * 86400);

            if (period == "this_week") {
                from_date = start_of_week;
            } else if (period == "last_week") {
                from_date = start_of_week - 7 * 86400;
            } else if (period == "next_week") {
                from_date = start_of_week + 7 * 86400;
            }
            to_date = from_date + 7 * 86400 - 1;
        } else if (period == "this_month" || period == "last_month" || period == "next_month") {
            if (period == "last_month") {
                dt.mon -= 1;
                if(dt.mon < 1) { dt.mon = 12; dt.year -= 1; }
            } else if (period == "next_month") {
                dt.mon += 1;
                if(dt.mon > 12) { dt.mon = 1; dt.year += 1; }
            }
            dt.day = 1;
            from_date = StructToTime(dt);

            dt.mon += 1;
            if(dt.mon > 12) { dt.mon = 1; dt.year += 1; }
            to_date = StructToTime(dt) - 1;
        } else {
            return SendError(400, "Invalid period value: " + period);
        }
    }
    // else: from_date/to_date passed in as-is (already validated by the caller)

    MqlCalendarValue values[];
    if(!CalendarValueHistory(values, from_date, to_date)) {
        return SendError(500, "Failed to retrieve calendar history or no data available");
    }

    CJAVal jData;
    jData.Clear(jtARRAY);

    int count = ArraySize(values);
    for(int i = 0; i < count; i++) {
        CJAVal row;

        MqlCalendarEvent eventInfo;
        MqlCalendarCountry countryInfo;
        string eventName = "Unknown";
        int importance = 0;
        string currency = "";
        string country_code = "";

        if (CalendarEventById(values[i].event_id, eventInfo)) {
            eventName = eventInfo.name;
            importance = eventInfo.importance;
            if (CalendarCountryById(eventInfo.country_id, countryInfo)) {
                currency = countryInfo.currency;
                country_code = countryInfo.code;
            }
        }

        row["value_id"] = (long)values[i].id;
        row["event_id"] = (long)values[i].event_id;
        row["name"] = eventName;
        row["country_code"] = country_code;
        row["currency"] = currency;
        row["importance"] = (long)importance;

        string t = TimeToString(values[i].time, TIME_DATE | TIME_MINUTES | TIME_SECONDS);
        StringReplace(t, ".", "-");
        StringReplace(t, " ", "T");
        row["time"] = t;

        if (values[i].actual_value != LONG_MIN) row["actual"] = (double)values[i].actual_value / 1000000.0;
        else row["actual"].Clear();

        if (values[i].forecast_value != LONG_MIN) row["forecast"] = (double)values[i].forecast_value / 1000000.0;
        else row["forecast"].Clear();

        if (values[i].prev_value != LONG_MIN) row["previous"] = (double)values[i].prev_value / 1000000.0;
        else row["previous"].Clear();

        jData.Add(row);
    }

    CJAVal jRes;
    jRes["count"] = (long)count;
    jRes["data"].Set(jData);

    return SendJson(jRes.Serialize());
}


//+------------------------------------------------------------------+
//| HISTORICAL DATA                                                   |
//+------------------------------------------------------------------+
JsonResponse CCommandCore::RetriveHistoricalData(string symbol, ENUM_TIMEFRAMES tf, datetime from_date, datetime to_date) {
    if(!SymbolSelect(symbol, true)) {
        return SendError(400, "Symbol not found: '" + symbol +"'");
    }

    MqlRates rates[];
    int bars = CopyRates(symbol, tf, from_date, to_date, rates);
    if(bars <= 0) {
        return SendError(500, "Failed to retrieve data for " + symbol);
    }

    string norm_from = TimeToString(from_date, TIME_DATE | TIME_SECONDS);
    string norm_to   = TimeToString(to_date, TIME_DATE | TIME_SECONDS);
    StringReplace(norm_from, ".", "-");
    StringReplace(norm_from, " ", "T");
    StringReplace(norm_to, ".", "-");
    StringReplace(norm_to, " ", "T");

    CJAVal jData;
    jData.Clear(jtARRAY);

    for(int i = 0; i < bars; i++) {
        string t = TimeToString(rates[i].time, TIME_DATE | TIME_SECONDS);
        StringReplace(t, ".", "-");
        StringReplace(t, " ", "T");

        CJAVal jBar;
        jBar["time"] = t;
        jBar["open"] = rates[i].open;
        jBar["high"] = rates[i].high;
        jBar["low"] = rates[i].low;
        jBar["close"] = rates[i].close;
        jBar["volume"] = (long)rates[i].tick_volume;

        jData.Add(jBar);
    }

    CJAVal jRes;
    jRes["from_date"] = norm_from;
    jRes["to_date"] = norm_to;
    jRes["data"].Set(jData);

    return SendJson(jRes.Serialize());
}


//+------------------------------------------------------------------+
//| QUOTE                                                             |
//+------------------------------------------------------------------+
JsonResponse CCommandCore::GetQuote(string symbol) {
    if(!SymbolSelect(symbol, true)) {
        return SendError(404, "Symbol not found : '" + symbol + "'");
    }

    MqlTick tick;
    if(!SymbolInfoTick(symbol, tick)) {
        return SendError(500, "Failed to get tick for: '" + symbol + "'");
    }

    datetime time = (datetime)(tick.time_msc / 1000);
    int ms        = (int)(tick.time_msc % 1000);

    // ISO 8601: "YYYY-MM-DDTHH:MM:SS.mmmZ"
    string isoTime = StringFormat(
        "%sT%s.%03dZ",
        TimeToString(time, TIME_DATE),
        TimeToString(time, TIME_MINUTES | TIME_SECONDS),
        ms
    );

    CJAVal jRes;
    jRes["symbol"] = symbol;
    jRes["ask"] = tick.ask;
    jRes["bid"] = tick.bid;
    jRes["flags"] = (long)tick.flags;
    jRes["time"] = isoTime;
    jRes["volume"] = (long)tick.volume;

    return SendJson(jRes.Serialize());
}


//+------------------------------------------------------------------+
//| SYMBOL LIST                                                       |
//+------------------------------------------------------------------+
JsonResponse CCommandCore::GetSymbolList() {
    int total = SymbolsTotal(false); // false = ALL broker symbols, not just Market Watch

    CJAVal jSymbols;
    jSymbols.Clear(jtARRAY);

    for(int i = 0; i < total; i++) {
        string symbol = SymbolName(i, false);

        int trade_mode = (int)SymbolInfoInteger(symbol, SYMBOL_TRADE_MODE);
        string description = SymbolInfoString(symbol, SYMBOL_DESCRIPTION);
        string path = SymbolInfoString(symbol, SYMBOL_PATH);

        CJAVal item;
        item["name"] = symbol;
        item["trade_mode"] = (long)trade_mode;
        item["description"] = description;
        item["path"] = path;

        jSymbols.Add(item);
    }

    CJAVal jRes;
    jRes["symbols"].Set(jSymbols);

    return SendJson(jRes.Serialize());
}

//+------------------------------------------------------------------+
//| SYMBOL COUNT                                                      |
//+------------------------------------------------------------------+
JsonResponse CCommandCore::GetSymbolCount() {
    int total = SymbolsTotal(false); // false = ALL broker symbols, same as GetSymbolList()

    CJAVal jRes;
    jRes["count"] = (long)total;

    return SendJson(jRes.Serialize());
}


//+------------------------------------------------------------------+
//| TRACKING — shared helpers                                         |
//+------------------------------------------------------------------+
void CCommandCore::ValidateSymbolsArray(string &symbolArray[], string &validSymbols[], string &invalidSymbols[]) {
    int count = ArraySize(symbolArray);

    for(int i = 0; i < count; i++) {
        string sym = symbolArray[i];

        if(SymbolSelect(sym, true)) {
            int n = ArraySize(validSymbols);
            ArrayResize(validSymbols, n + 1);
            validSymbols[n] = sym;
        } else {
            int n = ArraySize(invalidSymbols);
            ArrayResize(invalidSymbols, n + 1);
            invalidSymbols[n] = sym;
        }
    }
}

JsonResponse CCommandCore::BuildTrackResponse(string &validSymbols[], string &invalidSymbols[]) {
    CJAVal jValid, jInvalid;
    jValid.Clear(jtARRAY);
    jInvalid.Clear(jtARRAY);

    for(int i = 0; i < ArraySize(validSymbols); i++) jValid.Add(validSymbols[i]);
    for(int i = 0; i < ArraySize(invalidSymbols); i++) jInvalid.Add(invalidSymbols[i]);

    CJAVal jRes;
    jRes["response"] = "track_prices";
    jRes["status"] = "success";
    jRes["accepted"].Set(jValid);
    jRes["rejected"].Set(jInvalid);

    return SendJson(jRes.Serialize());
}


//+------------------------------------------------------------------+
//| TRACKING — prices                                                 |
//+------------------------------------------------------------------+
JsonResponse CCommandCore::SetSymbols(string &symbolArray[]) {
    string validSymbols[], invalidSymbols[];
    ValidateSymbolsArray(symbolArray, validSymbols, invalidSymbols);

    // Empty array is a valid, intentional way for the client to clear tracking
    if(dataSender != NULL)
        dataSender.SetSymbols(validSymbols);

    return BuildTrackResponse(validSymbols, invalidSymbols);
}


//+------------------------------------------------------------------+
//| TRACKING — market book                                            |
//+------------------------------------------------------------------+
JsonResponse CCommandCore::SetMbook(string &symbolArray[]) {
    string validSymbols[], invalidSymbols[];
    ValidateSymbolsArray(symbolArray, validSymbols, invalidSymbols);

    if(dataSender != NULL)
        dataSender.SetMbookSymbols(validSymbols);

    return BuildTrackResponse(validSymbols, invalidSymbols);
}


//+------------------------------------------------------------------+
//| TRACKING — OHLC                                                   |
//+------------------------------------------------------------------+
JsonResponse CCommandCore::SetOhlcRequests(OhlcRequest &requests[], string &rejected[]) {
    // Always call SetOhlcRequests, even with an empty array, so this endpoint can
    // clear tracking the same way SetSymbols/SetMbook already do.
    if(dataSender != NULL)
        dataSender.SetOhlcRequests(requests);

    CJAVal jValid;
    jValid.Clear(jtARRAY);

    for (int i = 0; i < ArraySize(requests); i++) {
        CJAVal item;
        item["symbol"] = requests[i].symbol;
        item["time_frame"] = timeframeToString(requests[i].timeframe);

        jValid.Add(item);
    }

    CJAVal jInvalid;
    jInvalid.Clear(jtARRAY);
    for (int i = 0; i < ArraySize(rejected); i++) jInvalid.Add(rejected[i]);

    CJAVal jRes;
    jRes["response"] = "ohlc_update";
    jRes["accepted"].Set(jValid);
    jRes["rejected"].Set(jInvalid);

    return SendJson(jRes.Serialize());
}


//+------------------------------------------------------------------+
//| TRACKING — calendar                                               |
//+------------------------------------------------------------------+
JsonResponse CCommandCore::SetCalendarTracking(string country, string currency) {
    if(dataSender != NULL)
        dataSender.SetCalendarTracking(country, currency);

    CJAVal jRes;
    jRes["response"] = "calendar_tracking";
    jRes["status"]   = "success";
    jRes["country"]  = (country != "" ? country : "ALL");
    jRes["currency"] = (currency != "" ? currency : "ALL");
    jRes["enabled"]  = (country != "" || currency != "");

    return SendJson(jRes.Serialize());
}


//+------------------------------------------------------------------+
//| RESPONSE HELPERS                                                  |
//+------------------------------------------------------------------+
JsonResponse CCommandCore::SendError(int status, string details) {
    Print("Sending ACK -Status: ", status, ", details: ", details);

    CJAVal jError;
    if(details != "")
        jError["details"] = details;

    return SendJson(jError.Serialize(), status);
}

JsonResponse CCommandCore::SendJson(string jsonContent, int status) {
    JsonResponse jsonRes;

    if(jsonContent == "") {
        jsonRes.jsonContent = "{}";
    } else {
        jsonRes.jsonContent = jsonContent;
    }
    jsonRes.status = status;

    return jsonRes;
}
