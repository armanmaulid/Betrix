//+------------------------------------------------------------------+
//| CommandHandler.mqh - Refactored Version                         |
//| Command handling functionality for MT5 socket communication     |
//+------------------------------------------------------------------+
#include "JAson.mqh"
#include <Trade/Trade.mqh>
#include "socketlib.mqh"
#include "Data.mqh"
#include "HttpLib.mqh"
#include "WebSocketLib.mqh"
#include "CommandCore.mqh"
#include "ValidationUtils.mqh"
#include "Logger.mqh"

// Forward declaration
class CData;

//+------------------------------------------------------------------+
//| Command Handler Class                                            |
//+------------------------------------------------------------------+
class CCommandHandler {
private:
    CTrade trade;
    CData *dataSender;
    CCommandCore *Core;
    SOCKET64 ClientSocket;


    // Route handlers
    void HandleWebSocketRequest(HttpRequest &request);
    void HandleGetRequest(HttpRequest &request);
    void HandlePostRequest(HttpRequest &request);

    // GET endpoint handlers
    void HandleGetQuote(HttpRequest &request);
    void HandleGetCalendar(HttpRequest &request);
    void HandleGetSymbolList(HttpRequest &request);
    void HandleGetSymbolCount(HttpRequest &request);
    void HandleGetHistoryPrices(HttpRequest &request);

    // POST endpoint handlers
    void HandlePostTrackPrices(CJAVal &json);
    void HandlePostTrackOhlc(CJAVal &json);
    void HandlePostTrackMbook(CJAVal &json);
    void HandlePostTrackCalendar(CJAVal &json);

    // Shared parsing/validation helpers (avoid duplicating the same
    // "read symbols[] from json" logic in every track/* handler)
    bool ExtractSymbolsArray(CJAVal &json, string &symbols[]);
    void AppendOhlcRequest(OhlcRequest &requests[], string symbol, ENUM_TIMEFRAMES tf, int depth);
    bool IsDuplicateOhlcRequest(OhlcRequest &requests[], string symbol, ENUM_TIMEFRAMES tf);
    void AppendRejected(string &rejected[], string reason);

    // Utility methods
    string GetQueryParam(HttpRequest &request, const string &key);

public:
    CCommandHandler(CData *ps) : dataSender(ps) { Core = new CCommandCore(ps); }
    CCommandHandler() : dataSender(NULL), Core(NULL) {}

    // Frees Core automatically so callers don't have to remember to call
    // Destroy() before every delete (that call was missed in the EA's
    // reconnect path, which used to leak a CCommandCore each time).
    ~CCommandHandler() { Destroy(); }

    void Destroy() {
        if (Core != NULL) {
            delete Core;
            Core = NULL;
        }
    }

    void HandleCommand(SOCKET64 ClientSocket, HttpRequest &request);
    void SetPriceSender(CData *ps);

    void SendError(int status, string details = "");
    void SendJson(JsonResponse &jsonRes);

    void SetSymbols(string &symbols[]);
    void SetOhlcRequests(OhlcRequest &requests[], string &rejected[]);
    void SetMbookSymbols(string &symbols[]);
    void SetCalendarTracking(string country, string currency);
    void RetriveHistoricalData(string symbol, ENUM_TIMEFRAMES tf, datetime from_date, datetime to_date);
    void GetSymbolList();
    void GetSymbolCount();
    void GetQuote(string symbol);
    void GetCalendar(datetime from_date, datetime to_date, string period);
};

//+------------------------------------------------------------------+
//| Main command handler                                             |
//+------------------------------------------------------------------+
void CCommandHandler::HandleCommand(SOCKET64 clientSocketParam, HttpRequest &request) {
    Print(">>Command: " + request.method + " " + request.path);
    this.ClientSocket = clientSocketParam;

    // Handle WebSocket requests
    if (request.isWebSocket) {
        HandleWebSocketRequest(request);
        return;
    }

    // Route based on HTTP method
    if (request.method == "GET") {
        HandleGetRequest(request);
    }
    else if (request.method == "POST") {
        HandlePostRequest(request);
    }
    else {
        SendError(405, "Method not allowed: " + request.method);
    }
}

//+------------------------------------------------------------------+
//| WebSocket Request Handler                                        |
//+------------------------------------------------------------------+
void CCommandHandler::HandleWebSocketRequest(HttpRequest &request) {
    LogDebug(">>>> WebSocket detected <<<< \n >>Raw request: {" + request.rawRequest + "}");
    PerformWebSocketHandshake(ClientSocket, request.rawRequest);
}

//+------------------------------------------------------------------+
//| GET Request Handler                                              |
//+------------------------------------------------------------------+
void CCommandHandler::HandleGetRequest(HttpRequest &request) {
    // Validate path segments
    if (ArraySize(request.pathSegments) < 2) {
        SendError(404, "Path not found");
        return;
    }

    if (request.pathSegments[0] != "v1") {
        SendError(400, "Invalid API version. Expected 'v1'");
        return;
    }

    string endpoint = request.pathSegments[1];

    // Route to specific handlers
    if (endpoint == "quote") {
        HandleGetQuote(request);
    }

    else if (endpoint == "calendar") {
        HandleGetCalendar(request);
    }

    else if (endpoint == "terminal") {
        SendError(501, "Endpoint is not yet implemented."); //TODO
    }

    else if (endpoint == "symbol") {
        if (ArraySize(request.pathSegments) >= 3) {
            if (request.pathSegments[2] == "list") {
                HandleGetSymbolList(request);
            }
            else if (request.pathSegments[2] == "count") {
                HandleGetSymbolCount(request);
            }
            else {
                SendError(404, "Unknown symbol endpoint: " + request.pathSegments[2]);
            }
        } else {
            SendError(400, "Missing symbol endpoint");
        }
    }

    else if (endpoint == "history") {
        if (ArraySize(request.pathSegments) >= 3) {
            if (request.pathSegments[2] == "prices") {
                HandleGetHistoryPrices(request);
            }
            else {
                SendError(404, "Unknown history endpoint: " + request.pathSegments[2]);
            }
        } else {
            SendError(400, "Missing history endpoint");
        }
    }

    else if (endpoint == "indicator") {
        if (ArraySize(request.pathSegments) >= 3) {
            if (request.pathSegments[2] == "atr") {
                SendError(501, "Endpoint is not yet implemented."); //TODO
            }
            else if (request.pathSegments[2] == "custom") {
                SendError(501, "Endpoint is not yet implemented."); //TODO
            }
            else if (request.pathSegments[2] == "ma") {
                SendError(501, "Endpoint is not yet implemented."); //TODO
            }
            else {
                SendError(404, "Unknown history endpoint: " + request.pathSegments[2]);
            }
        } else {
            SendError(400, "Missing history endpoint");
        }
    }

    else {
        SendError(404, "endpoint not found pleas check URL.");
    }
}

//+------------------------------------------------------------------+
//| POST Request Handler                                             |
//+------------------------------------------------------------------+
void CCommandHandler::HandlePostRequest(HttpRequest &request) {
    CJAVal json(NULL, jtUNDEF);

    ValidationResponse res = ValidateJson(json, request.body);
    if (res.code != 0) {
        SendError(res.code, res.message);
        return;
    }

    // Route based on path
    if (request.path == "/v1/track/prices") {
        HandlePostTrackPrices(json);
    }
    else if (request.path == "/v1/track/ohlc") {
        HandlePostTrackOhlc(json);
    }
    else if (request.path == "/v1/track/mbook") {
        HandlePostTrackMbook(json);
    }
    else if (request.path == "/v1/track/calendar") {
        HandlePostTrackCalendar(json);
    }
    else {
        SendError(404, "Unknown POST endpoint: " + request.path);
    }
}


//+------------------------------------------------------------------+
//| GET /v1/quote Handler                                            |
//+------------------------------------------------------------------+
void CCommandHandler::HandleGetQuote(HttpRequest &request) {
    string symbol = GetQueryParam(request, "symbol");

    if (symbol == "") {
        SendError(400, "Missing required parameter: symbol");
        return;
    }

    ValidationResponse res = ValidateSymbol(symbol);
    if (res.code != 0) {
        SendError(res.code, res.message);
        return;
    }

    GetQuote(symbol);
}


//+------------------------------------------------------------------+
//| GET /v1/calendar Handler                                         |
//+------------------------------------------------------------------+
void CCommandHandler::HandleGetCalendar(HttpRequest &request) {
    string period    = GetQueryParam(request, "period");
    string from_date = GetQueryParam(request, "from_date");
    string to_date   = GetQueryParam(request, "to_date");

    if (period == "" && (from_date == "" || to_date == "")) {
        SendError(400, "Missing required query parameters: period OR (from_date and to_date)");
        return;
    }

    // period is a shorthand ("today", "this_week", ...) resolved server-side,
    // so date-range validation only applies to the explicit from_date/to_date form.
    datetime from_dt = 0, to_dt = 0;
    if (period == "") {
        ValidationResponse dateRes = ValidateDateRange(from_date, to_date, from_dt, to_dt);
        if (dateRes.code != 0) {
            SendError(dateRes.code, dateRes.message);
            return;
        }
    }

    GetCalendar(from_dt, to_dt, period);
}


//+------------------------------------------------------------------+
//| GET /v1/symbol/list Handler                                      |
//+------------------------------------------------------------------+
void CCommandHandler::HandleGetSymbolList(HttpRequest &request) {
    GetSymbolList();
}


//+------------------------------------------------------------------+
//| GET /v1/symbol/count Handler                                     |
//+------------------------------------------------------------------+
void CCommandHandler::HandleGetSymbolCount(HttpRequest &request) {
    GetSymbolCount();
}


//+------------------------------------------------------------------+
//| GET /v1/history/prices Handler                                   |
//+------------------------------------------------------------------+
void CCommandHandler::HandleGetHistoryPrices(HttpRequest &request) {
    string symbol    = GetQueryParam(request, "symbol");
    string timeFrame = GetQueryParam(request, "time_frame");
    string from_date = GetQueryParam(request, "from_date");
    string to_date   = GetQueryParam(request, "to_date");

    if (symbol == "") {
        SendError(400, "Missing required parameter: symbol");
        return;
    }

    if (timeFrame == "") {
        SendError(400, "Missing required parameter: time_frame");
        return;
    }

    if (from_date == "" || to_date == "") {
        SendError(400, "Missing required parameters: from_date and to_date");
        return;
    }

    ValidationResponse symbolRes = ValidateSymbol(symbol);
    if (symbolRes.code != 0) {
        SendError(symbolRes.code, symbolRes.message);
        return;
    }

    ENUM_TIMEFRAMES tf;
    ValidationResponse tfRes = ValidateTimeFrame(timeFrame, tf);
    if (tfRes.code != 0) {
        SendError(tfRes.code, tfRes.message);
        return;
    }

    datetime from_dt, to_dt;
    ValidationResponse dateRes = ValidateDateRange(from_date, to_date, from_dt, to_dt);
    if (dateRes.code != 0) {
        SendError(dateRes.code, dateRes.message);
        return;
    }

    Print("Retrieving historical data");
    // from_dt/to_dt/tf already parsed above - pass them straight through
    // instead of handing Core the raw strings to re-parse.
    RetriveHistoricalData(symbol, tf, from_dt, to_dt);
}


//+------------------------------------------------------------------+
//| POST /v1/track/prices Handler                                    |
//+------------------------------------------------------------------+
void CCommandHandler::HandlePostTrackPrices(CJAVal &json) {
    string symbolArray[];
    if (!ExtractSymbolsArray(json, symbolArray)) return; // error already sent

    SetSymbols(symbolArray);
}


//+------------------------------------------------------------------+
//| POST /v1/track/mbook Handler                                     |
//+------------------------------------------------------------------+
void CCommandHandler::HandlePostTrackMbook(CJAVal &json) {
    string symbolArray[];
    if (!ExtractSymbolsArray(json, symbolArray)) return; // error already sent

    SetMbookSymbols(symbolArray);
}


//+------------------------------------------------------------------+
//| POST /v1/track/ohlc Handler                                      |
//+------------------------------------------------------------------+
void CCommandHandler::HandlePostTrackOhlc(CJAVal &json) {
    if (!json.HasKey("ohlc")) {
        SendError(400, "Missing required field: ohlc");
        return;
    }

    CJAVal jsonOhlcs = json["ohlc"];
    if (jsonOhlcs.type != jtARRAY) {
        SendError(400, "ohlc must be an array");
        return;
    }

    OhlcRequest requests[];
    string rejected[];

    for (int i = 0; i < jsonOhlcs.Size(); i++) {
        CJAVal item = jsonOhlcs[i];

        if (!item.HasKey("symbol") || !item.HasKey("time_frame") || !item.HasKey("depth")) {
            AppendRejected(rejected, "item[" + IntegerToString(i) + "]: missing symbol/time_frame/depth");
            continue;
        }

        string symbol = item["symbol"].ToStr();
        string tfStr  = item["time_frame"].ToStr();
        int depth     = (int)item["depth"].ToInt();

        ValidationResponse symRes = ValidateSymbol(symbol);
        if (symRes.code != 0) {
            AppendRejected(rejected, symbol + ": " + symRes.message);
            continue;
        }

        ENUM_TIMEFRAMES timeframe;
        ValidationResponse tfRes = ValidateTimeFrame(tfStr, timeframe);
        if (tfRes.code != 0) {
            AppendRejected(rejected, symbol + " " + tfStr + ": " + tfRes.message);
            continue;
        }

        if (depth < 1 || depth > 10) {
            AppendRejected(rejected, symbol + " " + tfStr + ": depth must be between 1 and 10");
            continue;
        }

        // Duplicate entries are merged silently, not rejected - not an error.
        if (IsDuplicateOhlcRequest(requests, symbol, timeframe)) continue;

        AppendOhlcRequest(requests, symbol, timeframe, depth);
    }

    SetOhlcRequests(requests, rejected);
}


//+------------------------------------------------------------------+
//| Shared helper: read json["symbols"] into a string[] array         |
//| Used by both track/prices and track/mbook (previously duplicated) |
//+------------------------------------------------------------------+
bool CCommandHandler::ExtractSymbolsArray(CJAVal &json, string &symbolArray[]) {
    if (!json.HasKey("symbols")) {
        SendError(400, "Missing required field: symbols");
        return false;
    }

    CJAVal jsonSymbols = json["symbols"];
    if (jsonSymbols.type != jtARRAY) {
        SendError(400, "symbols must be an array");
        return false;
    }

    int size = jsonSymbols.Size();
    ArrayResize(symbolArray, size);

    for (int i = 0; i < size; i++) {
        symbolArray[i] = jsonSymbols[i].ToStr();
        if (symbolArray[i] == "") {
            SendError(400, "Symbol at index " + IntegerToString(i) + " is empty");
            return false;
        }
    }

    return true;
}


//+------------------------------------------------------------------+
//| Shared helpers: OHLC tracking-request array management            |
//+------------------------------------------------------------------+
void CCommandHandler::AppendOhlcRequest(OhlcRequest &requests[], string symbol, ENUM_TIMEFRAMES tf, int depth) {
    int n = ArraySize(requests);
    ArrayResize(requests, n + 1);
    requests[n].symbol    = symbol;
    requests[n].timeframe = tf;
    requests[n].depth     = depth;
}

bool CCommandHandler::IsDuplicateOhlcRequest(OhlcRequest &requests[], string symbol, ENUM_TIMEFRAMES tf) {
    for (int j = 0; j < ArraySize(requests); j++) {
        if (requests[j].symbol == symbol && requests[j].timeframe == tf) return true;
    }
    return false;
}

void CCommandHandler::AppendRejected(string &rejected[], string reason) {
    int n = ArraySize(rejected);
    ArrayResize(rejected, n + 1);
    rejected[n] = reason;
}


//+------------------------------------------------------------------+
//| Utility Methods                                                  |
//+------------------------------------------------------------------+
// request.queryParams is already parsed once by ParseHttpRequest (HttpLib.mqh).
// Read it directly instead of re-copying it into temp arrays on every lookup -
// GetQueryParam can be called several times per request (calendar, history/prices).
string CCommandHandler::GetQueryParam(HttpRequest &request, const string &key) {
    int count = ArraySize(request.queryParams) / 2;
    for (int i = 0; i < count; i++) {
        if (request.queryParams[i][0] == key) {
            return request.queryParams[i][1];
        }
    }
    return "";
}


//+------------------------------------------------------------------+
//| Commands logic                                                   |
//+------------------------------------------------------------------+

void CCommandHandler::RetriveHistoricalData(string symbol, ENUM_TIMEFRAMES tf, datetime from_date, datetime to_date) {
    JsonResponse res = Core.RetriveHistoricalData(symbol, tf, from_date, to_date);
    SendJson(res);
}

void CCommandHandler::GetCalendar(datetime from_date, datetime to_date, string period) {
    JsonResponse res = Core.GetCalendar(from_date, to_date, period);
    SendJson(res);
}

void CCommandHandler::SetSymbols(string &symbolArray[]) {
    JsonResponse res = Core.SetSymbols(symbolArray);
    SendJson(res);
}

void CCommandHandler::SetMbookSymbols(string &symbolArray[]) {
    JsonResponse res = Core.SetMbook(symbolArray);
    SendJson(res);
}

void CCommandHandler::SetOhlcRequests(OhlcRequest &requests[], string &rejected[]) {
    JsonResponse res = Core.SetOhlcRequests(requests, rejected);
    SendJson(res);
}

void CCommandHandler::SetCalendarTracking(string country, string currency) {
    JsonResponse res = Core.SetCalendarTracking(country, currency);
    SendJson(res);
}

//+------------------------------------------------------------------+
//| POST /v1/track/calendar Handler                                   |
//+------------------------------------------------------------------+
void CCommandHandler::HandlePostTrackCalendar(CJAVal &json) {
    // Both fields are optional — empty string means "all"
    string country  = json.HasKey("country")  ? json["country"].ToStr()  : "";
    string currency = json.HasKey("currency") ? json["currency"].ToStr() : "";

    SetCalendarTracking(country, currency);
}

void CCommandHandler::GetQuote(string symbol) {
    JsonResponse res = Core.GetQuote(symbol);
    SendJson(res);
}

void CCommandHandler::GetSymbolList() {
    JsonResponse res = Core.GetSymbolList();
    SendJson(res);
}

void CCommandHandler::GetSymbolCount() {
    JsonResponse res = Core.GetSymbolCount();
    SendJson(res);
}


//+------------------------------------------------------------------+
//| Set PriceSender reference                                        |
//+------------------------------------------------------------------+
void CCommandHandler::SetPriceSender(CData *data) {
    dataSender = data;

    // Replace any previously-allocated Core instead of leaking it.
    if (Core != NULL) delete Core;
    Core = new CCommandCore(data);
}

//+------------------------------------------------------------------+
//| Send HTTP Response                                               |
//+------------------------------------------------------------------+
void CCommandHandler::SendError(int status, string details = "") {
    Print("Sending ACK -Status: ", status, ", details: ", details);
    JsonResponse jsonRes;

    CJAVal jError;
    if (details != "")
        jError["details"] = details;

    // Empty details will result in "{}"
    jsonRes.jsonContent = jError.Serialize();
    jsonRes.status = status;

    SendJson(jsonRes);
}

void CCommandHandler::SendJson(JsonResponse &jsonRes) {
    HttpResponse res;
    res.ClientSocket = this.ClientSocket;
    res.status_code = jsonRes.status;
    res.status_text = GetStatusText(jsonRes.status);
    res.content_type = "application/json";

    if (jsonRes.jsonContent != "")
        res.body = jsonRes.jsonContent;
    else
        res.body = "";

    res.keep_alive = true;

    SendHttpResponse(res);
}
