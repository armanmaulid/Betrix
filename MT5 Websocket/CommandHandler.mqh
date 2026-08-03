//+------------------------------------------------------------------+
//| CommandHandler.mqh - Refactored Version                         |
//| Command handling functionality for MT5 socket communication     |
//+------------------------------------------------------------------+
#include <JAson.mqh>
#include <Trade/Trade.mqh>
#include <socketlib.mqh>
#include <Data.mqh>
#include <HistoryManager.mqh>
#include <HttpLib.mqh>
#include <WebSocketLib.mqh>
#include <CommandCore.mqh>
#include <ValidationUtils.mqh>

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
    void HandleGetAccount(HttpRequest &request);
    void HandleGetQuote(HttpRequest &request);
    void HandleGetCalendar(HttpRequest &request);
    void HandleGetSymbolInfo(HttpRequest &request);
    void HandleGetSymbolList(HttpRequest &request);
    void HandleGetSymbolCount(HttpRequest &request);
    void HandleGetHistoryOrders(HttpRequest &request);
    void HandleGetHistoryPrices(HttpRequest &request);
    void HandleGetOrderInformation(HttpRequest &request);
    void HandleGetOrderList(HttpRequest &request);
    
    // POST endpoint handlers
    void HandlePostOrder(CJAVal &json);
    void HandlePostCloseOrder(CJAVal &json);
    void HandleModifyOrder(CJAVal &json);
    
    void HandlePostTrackPrices(CJAVal &json);
    void HandlePostTrackOhlc(CJAVal &json);
    void HandlePostTrackOrderEvents(CJAVal &json);
    void HandlePostTrackMbook(CJAVal &json);
    void HandlePostTrackCalendar(CJAVal &json);
    
    // Utility methods
    string GetQueryParam(HttpRequest &request, const string &key);
    void ParseQueryParams(HttpRequest &request, string &keys[], string &values[], int &count);
    
public:
    CCommandHandler::CCommandHandler(CData *ps) : dataSender(ps) {Core = new CCommandCore(ps);}
    CCommandHandler() : dataSender(NULL) {}
    void Destroy(){
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
    void SetOhlcRequests(OhlcRequest &symbols[]);
    void SetTrackOrderEvent(bool enabled);
    void SetMbookSymbols(string &symbols[]);
    void SetCalendarFilter(string &countries[], string &currencies[], string minImportance);
    void RetriveHistoricalData(string symbol, string timeFrame, string from_date_str, string to_date_str);
    void PlaceOrder(Order &order);
    void CloseOrder(ulong ticket, double volume, bool async);
    void GetHistoryByMode(string mode, string from_date_str, string to_date_str);
    void GetAccountInformation();
    void GetSymbolInfo(string symbol);
    void GetSymbolList();
    void GetSymbolCount();
    void WarmSymbolCache();
    void GetQuote(string symbol);
    void GetCalendar(string countryCode, string currency, int days);
    void GetOrderList();
    void ModifyOrder(Order &order);
};

//+------------------------------------------------------------------+
//| Main command handler                                             |
//+------------------------------------------------------------------+
void CCommandHandler::HandleCommand(SOCKET64 ClientSocket, HttpRequest &request) {
    Print(">>Command: " + request.method + " " + request.path);
    this.ClientSocket = ClientSocket;
    
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
    Print(">>>> WebSocket detected <<<< \n >>Raw request: {" + request.rawRequest + "}");
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
    if (endpoint == "account") {
        HandleGetAccount(request);
    }
    
    else if (endpoint == "quote") {
        HandleGetQuote(request);
    }
    
    else if (endpoint == "calendar"){
        HandleGetCalendar(request);
    }
    
    else if (endpoint == "terminal"){
        SendError(501, "Endpoint is not yet implemented.");//TODO
    }
    
    else if (endpoint == "symbol") {
        if (ArraySize(request.pathSegments) >= 3) {
            if (request.pathSegments[2] == "info") {
                HandleGetSymbolInfo(request);
            }
            else if (request.pathSegments[2] == "list") {
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
            if (request.pathSegments[2] == "orders") {
                HandleGetHistoryOrders(request);
            }
            else if (request.pathSegments[2] == "prices") {
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
                SendError(501, "Endpoint is not yet implemented.");//TODO
            }
            else if (request.pathSegments[2] == "custom") {
                SendError(501, "Endpoint is not yet implemented.");//TODO
            }
            else if (request.pathSegments[2] == "ma"){
                SendError(501, "Endpoint is not yet implemented.");//TODO
            }
            else {
                SendError(404, "Unknown history endpoint: " + request.pathSegments[2]);
            }
        } else {
            SendError(400, "Missing history endpoint");
        }
    }
    
   else if (endpoint == "order") {
       if (ArraySize(request.pathSegments) >= 3) {
           if (request.pathSegments[2] == "info") {
               HandleGetOrderInformation(request);
           }
           else if (request.pathSegments[2] == "list") {
               HandleGetOrderList(request);
           }
           else {
               SendError(404, "Unknown order endpoint: " + request.pathSegments[2]);
           }
       }
       else {
           SendError(400, "Missing order endpoint.");
       }
   }
   else{
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
    if (request.path == "/v1/order") {
        HandlePostOrder(json);
    }
    else if (request.path == "/v1/order/modify"){
        HandleModifyOrder(json);
    }
    else if (request.path == "/v1/order/close"){
        HandlePostCloseOrder(json);
    }
    
    else if (request.path == "/v1/track/prices") {
        HandlePostTrackPrices(json);
    }
    else if (request.path == "/v1/track/ohlc"){
        HandlePostTrackOhlc(json);
    }
        else if (request.path == "/v1/track/mbook"){
        HandlePostTrackMbook(json);
    }
    else if (request.path == "/v1/track/orders"){
        HandlePostTrackOrderEvents(json);
    }
    else if (request.path == "/v1/track/calendar"){
        HandlePostTrackCalendar(json);
    }

   
    else {
        SendError(404, "Unknown POST endpoint: " + request.path);
    }
}

//+------------------------------------------------------------------+
//| GET /v1/account Handler                                          |
//+------------------------------------------------------------------+
void CCommandHandler::HandleGetAccount(HttpRequest &request) {
    if (ArraySize(request.pathSegments) != 2) {
        SendError(400, "Invalid account endpoint path");
        return;
    }
    GetAccountInformation();
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
//| Query params (all optional): country, currency, days (1-30)      |
//+------------------------------------------------------------------+
void CCommandHandler::HandleGetCalendar(HttpRequest &request) {
    string country  = GetQueryParam(request, "country");
    string currency = GetQueryParam(request, "currency");
    string daysStr  = GetQueryParam(request, "days");

    // Default (days tidak dikirim / 0): mode kalender bulan penuh -
    // awal bulan lalu s/d akhir bulan depan, lihat CCommandCore::GetCalendar.
    // ?days=N tetap tersedia buat override window presisi N hari (1-90).
    int days = (daysStr == "") ? 0 : (int)StringToInteger(daysStr);
    if (days < 0) days = 0;
    if (days > 90) days = 90;

    GetCalendar(country, currency, days);
}


//+------------------------------------------------------------------+
//| GET /v1/symbol/info Handler                                      |
//+------------------------------------------------------------------+
void CCommandHandler::HandleGetSymbolInfo(HttpRequest &request) {
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

    GetSymbolInfo(symbol);
}


//+------------------------------------------------------------------+
//| GET /v1/symbol/list Handler                                      |
//+------------------------------------------------------------------+
void CCommandHandler::HandleGetSymbolList(HttpRequest &request) {
    GetSymbolList();
}

void CCommandHandler::HandleGetSymbolCount(HttpRequest &request) {
    GetSymbolCount();
}

//+------------------------------------------------------------------+
//| GET /v1/order/info Handler                                       |
//+------------------------------------------------------------------+
void CCommandHandler::HandleGetOrderInformation(HttpRequest &request) {
    string ticketStr = GetQueryParam(request, "ticket");

    if (ticketStr == "") {
        SendError(400, "Missing required parameter: ticket");
        return;
    }
    //check ticket is int
    for (int i = 0; i < StringLen(ticketStr); i++) {
        ushort ch = StringGetCharacter(ticketStr, i);
        if (ch < '0' || ch > '9')
            SendError(400, "ticket must be an integer: " + ticketStr);
    }

    ulong ticket = (ulong)StringToInteger(ticketStr);

    JsonResponse response = Core.OrderInformation(ticket);
    SendJson(response);
}

//+------------------------------------------------------------------+
//| GET /v1/order/list Handler                                       |
//+------------------------------------------------------------------+
void CCommandHandler::HandleGetOrderList(HttpRequest &request) {
    GetOrderList();
}

//+------------------------------------------------------------------+
//| GET /v1/history/orders Handler                                   |
//+------------------------------------------------------------------+
void CCommandHandler::HandleGetHistoryOrders(HttpRequest &request) {
    string mode = GetQueryParam(request, "mode");
    string from_date = GetQueryParam(request, "from_date");
    string to_date = GetQueryParam(request, "to_date");

    if (mode == "") {
        SendError(400, "Missing required parameter: mode");
        return;
    }

    if (from_date == "" || to_date == "") {
        SendError(400, "Missing required parameters: from_date and to_date");
        return;
    }

    ValidationResponse modeRes = ValidateHistoryMode(mode);
    if (modeRes.code != 0) {
        SendError(modeRes.code, modeRes.message);
        return;
    }

    datetime from_dt, to_dt;
    ValidationResponse dateRes = ValidateDateRange(from_date, to_date, from_dt, to_dt);
    if (dateRes.code != 0) {
        SendError(dateRes.code, dateRes.message);
        return;
    }

    GetHistoryByMode(mode, from_date, to_date);
}


//+------------------------------------------------------------------+
//| GET /v1/history/prices Handler                                   |
//+------------------------------------------------------------------+
void CCommandHandler::HandleGetHistoryPrices(HttpRequest &request) {
    string symbol = GetQueryParam(request, "symbol");
    string timeFrame = GetQueryParam(request, "time_frame");
    string from_date = GetQueryParam(request, "from_date");
    string to_date = GetQueryParam(request, "to_date");

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
    RetriveHistoricalData(symbol, timeFrame, from_date, to_date);
}


//+------------------------------------------------------------------+
//| POST /v1/order Handler                                           |
//+------------------------------------------------------------------+
void CCommandHandler::HandlePostOrder(CJAVal &json) {
    // Required fields
    if (!json.HasKey("symbol") || !json.HasKey("volume") || !json.HasKey("order_type")) {
        SendError(400, "Missing required fields: symbol, volume, order_type");
        return;
    }

    Order order;
    order.Init();

    order.symbol     = json["symbol"].ToStr();
    order.volume     = json["volume"].ToDbl();
    order.order_type = json["order_type"].ToStr();

    // Validate symbol
    ValidationResponse symbolRes = ValidateSymbol(order.symbol);
    if (symbolRes.code != 0) {
        SendError(symbolRes.code, symbolRes.message);
        return;
    }

    // Validate volume
    if (order.volume <= 0) {
        SendError(400, "Volume must be greater than 0");
        return;
    }

    // Validate order type
    ValidationResponse typeRes = ValidateOrderType(order.order_type);
    if (typeRes.code != 0) {
        SendError(typeRes.code, typeRes.message);
        return;
    }

    // Optional fields
    if (json.HasKey("sl"))        order.sl = json["sl"].ToDbl();
    if (json.HasKey("tp"))        order.tp = json["tp"].ToDbl();
    if (json.HasKey("price"))     order.price = json["price"].ToDbl();
    if (json.HasKey("magic"))     order.magic = (ulong)json["magic"].ToInt();
    if (json.HasKey("comment"))   order.comment = json["comment"].ToStr();
    if (json.HasKey("type_filling")) order.type_filling = json["type_filling"].ToStr();
    if (json.HasKey("expiration")) {
        string isoStr = json["expiration"].ToStr();
        order.expiration = StringToTime(isoStr);
    }
    if (json.HasKey("async"))     order.async = json["async"].ToBool();

    // Place the order
    PlaceOrder(order);
}


//+------------------------------------------------------------------+
//| POST /v1/order/modify Handler                                    |
//+------------------------------------------------------------------+
void CCommandHandler::HandleModifyOrder(CJAVal &json) {
    // Required field
    if (!json.HasKey("ticket")) {
        SendError(400, "Missing required field: ticket");
        return;
    }

    ulong ticket = (ulong)json["ticket"].ToDbl();

    if (ticket <= 0) {
        SendError(400, "Invalid ticket number: " + IntegerToString(ticket));
        return;
    }
    

    Order order;
    order.Init();
    order.ticket = ticket;

    // Optional fields
    if (json.HasKey("sl"))         order.sl = json["sl"].ToDbl();
    if (json.HasKey("tp"))         order.tp = json["tp"].ToDbl();
    if (json.HasKey("price"))      order.price = json["price"].ToDbl();
    
    ModifyOrder(order);
}

//+------------------------------------------------------------------+
//| POST /v1/order/close Handler                                     |
//+------------------------------------------------------------------+
void CCommandHandler::HandlePostCloseOrder(CJAVal &json) {
    // Required field
    if (!json.HasKey("ticket")) {
        SendError(400, "Missing required field: ticket");
        return;
    }

    ulong ticket = (ulong)json["ticket"].ToDbl();
    double volume = 0.0;
    bool async = false;

    // Optional fields
    if (json.HasKey("volume"))
        volume = json["volume"].ToDbl();

    if (json.HasKey("async"))
        async = json["async"].ToBool();

    CloseOrder(ticket, volume, async);
}



//+------------------------------------------------------------------+
//| POST /v1/track/prices Handler                                    |
//+------------------------------------------------------------------+
void CCommandHandler::HandlePostTrackPrices(CJAVal &json) {
    if (!json.HasKey("symbols")) {
        SendError(400, "Missing required field: symbols");
        return;
    }
    
    CJAVal jsonSymbols = json["symbols"];
    if (jsonSymbols.m_type != jtARRAY) {
        SendError(400, "symbols must be an array");
        return;
    }
    
    int size = jsonSymbols.Size();
    
    string symbols[];
    ArrayResize(symbols, size);
    for (int i = 0; i < size; i++) {
        symbols[i] = jsonSymbols[i].ToStr();
        if (symbols[i] == "") {
            SendError(400, "Symbol at index " + IntegerToString(i) + " is empty");
            return;
        }
    }
    
    SetSymbols(symbols);
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
    if (jsonOhlcs.m_type != jtARRAY) {
        SendError(400, "ohlc must be an array");
        return;
    }

    OhlcRequest requests[];

    for (int i = 0; i < jsonOhlcs.Size(); i++) {
        CJAVal item = jsonOhlcs[i];

        if (!item.HasKey("symbol") || !item.HasKey("time_frame") || !item.HasKey("depth"))
            continue;

        string symbol = item["symbol"].ToStr();
        string tfStr  = item["time_frame"].ToStr();
        int depth     = (int)item["depth"].ToInt();

        // Validate symbol
        ValidationResponse symRes = ValidateSymbol(symbol);
        if (symRes.code != 0)
            continue;

        // Validate timeframe
        ENUM_TIMEFRAMES timeframe;
        ValidationResponse tfRes = ValidateTimeFrame(tfStr, timeframe);
        if (tfRes.code != 0)
            continue;

        // Validate depth range
        if (depth < 1 || depth > 10)
            continue;

        // Check for duplicates
        bool isDuplicate = false;
        for (int j = 0; j < ArraySize(requests); j++) {
            if (requests[j].symbol == symbol && requests[j].timeframe == timeframe) {
                isDuplicate = true;
                break;
            }
        }
        if (isDuplicate)
            continue;

        // Add valid + unique request
        int n = ArraySize(requests);
        ArrayResize(requests, n + 1);
        requests[n].symbol    = symbol;
        requests[n].timeframe = timeframe;
        requests[n].depth     = depth;
    }

    SetOhlcRequests(requests);
}


//+------------------------------------------------------------------+
//| POST /v1/track/order Handler                                     |
//+------------------------------------------------------------------+
void CCommandHandler::HandlePostTrackOrderEvents(CJAVal &json) {
    if (!json.HasKey("enabled")) {
        SendError(400, "Missing required field: enabled");
        return;
    }
    
    string val = json["enabled"].ToStr();

    bool enabled;
    if (val == "true" || val == "1")
        enabled = true;
    else if (val == "false" || val == "0")
        enabled = false;
    else {
        SendError(400, "Field 'enabled' must be true, false, 1, or 0");
        return;
    }
    Print("seting order event " + val);
    SetTrackOrderEvent(enabled);
}

//+------------------------------------------------------------------+
//| POST /v1/track/mbook Handler                                     |
//+------------------------------------------------------------------+
void CCommandHandler::HandlePostTrackMbook(CJAVal &json) {
    if (!json.HasKey("symbols")) {
        SendError(400, "Missing required field: symbols");
        return;
    }
    
    CJAVal jsonSymbols = json["symbols"];
    if (jsonSymbols.m_type != jtARRAY) {
        SendError(400, "symbols must be an array");
        return;
    }
    
    int size = jsonSymbols.Size();
    
    string symbols[];
    ArrayResize(symbols, size);
    for (int i = 0; i < size; i++) {
        symbols[i] = jsonSymbols[i].ToStr();
        if (symbols[i] == "") {
            SendError(400, "Symbol at index " + IntegerToString(i) + " is empty");
            return;
        }
    }
    
    SetMbookSymbols(symbols);
}


//+------------------------------------------------------------------+
//| POST /v1/track/calendar Handler                                  |
//| Body: {"countries": ["US","EU"], "currencies": ["USD"],           |
//|        "min_importance": "high"}                                  |
//| All fields optional. countries = ISO 3166-1 alpha-2 (e.g. "US").  |
//| If both countries and currencies are given, an event must match   |
//| both (AND). Default min_importance is "low" (everything).         |
//+------------------------------------------------------------------+
void CCommandHandler::HandlePostTrackCalendar(CJAVal &json) {
    string countries[];
    if (json.HasKey("countries")) {
        CJAVal jsonCountries = json["countries"];
        if (jsonCountries.m_type != jtARRAY) {
            SendError(400, "countries must be an array");
            return;
        }

        int size = jsonCountries.Size();
        ArrayResize(countries, size);
        for (int i = 0; i < size; i++) {
            countries[i] = jsonCountries[i].ToStr();
            if (countries[i] == "") {
                SendError(400, "Country at index " + IntegerToString(i) + " is empty");
                return;
            }
        }
    }

    string currencies[];
    if (json.HasKey("currencies")) {
        CJAVal jsonCurrencies = json["currencies"];
        if (jsonCurrencies.m_type != jtARRAY) {
            SendError(400, "currencies must be an array");
            return;
        }

        int size = jsonCurrencies.Size();
        ArrayResize(currencies, size);
        for (int i = 0; i < size; i++) {
            currencies[i] = jsonCurrencies[i].ToStr();
            if (currencies[i] == "") {
                SendError(400, "Currency at index " + IntegerToString(i) + " is empty");
                return;
            }
        }
    }

    string minImportance = json.HasKey("min_importance") ? json["min_importance"].ToStr() : "low";
    if (minImportance != "low" && minImportance != "medium" && minImportance != "high") {
        SendError(400, "Field 'min_importance' must be one of: low, medium, high");
        return;
    }

    SetCalendarFilter(countries, currencies, minImportance);
}


//+------------------------------------------------------------------+
//| Utility Methods                                                  |
//+------------------------------------------------------------------+
string CCommandHandler::GetQueryParam(HttpRequest &request, const string &key) {
    string keys[];
    string values[];
    int count;
    
    ParseQueryParams(request, keys, values, count);
    
    for (int i = 0; i < count; i++) {
        if (keys[i] == key) {
            return values[i];
        }
    }
    return "";
}

void CCommandHandler::ParseQueryParams(HttpRequest &request, string &keys[], string &values[], int &count) {
    count = ArraySize(request.queryParams) / 2;
    ArrayResize(keys, count);
    ArrayResize(values, count);
    
    for (int i = 0; i < count; i++) {
        keys[i] = request.queryParams[i][0];
        values[i] = request.queryParams[i][1];
        Print("Query param: " + keys[i] + "=" + values[i]);
    }
}

// Helper function to get query parameter by key
string GetParam(string &keys[], string &values[], int count, string key) {
    for (int i = 0; i < count; i++) {
        if (keys[i] == key)
            return values[i];
    }
    return "";
}


//+------------------------------------------------------------------+
//| Commands logic                                                   |
//+------------------------------------------------------------------+

//+------------------------------------------------------------------+
//| Place Order Command                                              |
//+------------------------------------------------------------------+
void CCommandHandler::PlaceOrder(Order &order) {
    
    JsonResponse res = Core.PlaceOrder(order);
    SendJson(res);
}


//+------------------------------------------------------------------+
//| Close Order Command                                              |
//+------------------------------------------------------------------+
void CCommandHandler::CloseOrder(ulong ticket, double volume, bool async) {

    JsonResponse res = Core.CloseOrder(ticket, volume, async);
    SendJson(res);
}

//+------------------------------------------------------------------+
//| modify Order Command                                             |
//+------------------------------------------------------------------+
void CCommandHandler::ModifyOrder(Order &order) {

    JsonResponse res = Core.ModifyOrder(order);
    SendJson(res);
}

//+------------------------------------------------------------------+
//| Order list Command                                               |
//+------------------------------------------------------------------+
void CCommandHandler::GetOrderList(){

    JsonResponse res = Core.GetOrderList();
    SendJson(res);
}

//+------------------------------------------------------------------+
//| Retrieve historical data Command                                 |
//+------------------------------------------------------------------+
void CCommandHandler::RetriveHistoricalData(string symbol, string timeFrame, string from_date_str, string to_date_str)
{
    JsonResponse res = Core.RetriveHistoricalData(symbol, timeFrame, from_date_str, to_date_str);
    SendJson(res);
}

//+------------------------------------------------------------------+
//| Get Account Command                                              |
//+------------------------------------------------------------------+
void CCommandHandler::GetAccountInformation() {
    JsonResponse res = Core.GetAccountInformation();
    SendJson(res);
}

//+------------------------------------------------------------------+
//| get History positions / orders / deal                            |
//+------------------------------------------------------------------+
void CCommandHandler::GetHistoryByMode(string mode, string from_date_str, string to_date_str)
{
    JsonResponse res = Core.GetHistoryByMode(mode, from_date_str, to_date_str);
    SendJson(res);
}

//+------------------------------------------------------------------+
//| Set Tracking for symbols                                         |
//+------------------------------------------------------------------+
void CCommandHandler::SetSymbols(string &symbols[])
{
    JsonResponse res = Core.SetSymbols(symbols);
    SendJson(res);
}


//+------------------------------------------------------------------+
//| Set Tracking for symbols                                         |
//+------------------------------------------------------------------+
void CCommandHandler::SetMbookSymbols(string &symbols[])
{
    JsonResponse res = Core.SetMbook(symbols);
    SendJson(res);
}
//+------------------------------------------------------------------+
//| Set Tracking for economic calendar streaming                    |
//+------------------------------------------------------------------+
void CCommandHandler::SetCalendarFilter(string &countries[], string &currencies[], string minImportance)
{
    JsonResponse res = Core.SetCalendarFilter(countries, currencies, minImportance);
    SendJson(res);
}
//+------------------------------------------------------------------+
//| Set Tracking for ohlc                                            |
//+------------------------------------------------------------------+
void CCommandHandler::SetOhlcRequests(OhlcRequest &requests[]) {

    JsonResponse res = Core.SetOhlcRequests(requests);
    SendJson(res);
}

//+------------------------------------------------------------------+
//| Set Tracking for order events                                    |
//+------------------------------------------------------------------+
void CCommandHandler::SetTrackOrderEvent(bool enabled) {

    JsonResponse res = Core.SetOrderEvents(enabled);
    SendJson(res);
}
//+------------------------------------------------------------------+
//| Get symbol quote                                                 |
//+------------------------------------------------------------------+
void CCommandHandler::GetQuote(string symbol){

    JsonResponse res = Core.GetQuote(symbol);
    SendJson(res);
}

//+------------------------------------------------------------------+
//| Get economic calendar events                                     |
//+------------------------------------------------------------------+
void CCommandHandler::GetCalendar(string countryCode, string currency, int days){

    JsonResponse res = Core.GetCalendar(countryCode, currency, days);
    SendJson(res);
}

//+------------------------------------------------------------------+
//| Get symbol List                                                  |
//+------------------------------------------------------------------+
void CCommandHandler::GetSymbolList() {

    JsonResponse res = Core.GetSymbolList();
    SendJson(res);
}

void CCommandHandler::GetSymbolCount() {

    JsonResponse res = Core.GetSymbolCount();
    SendJson(res);
}

void CCommandHandler::WarmSymbolCache() {
    if (Core != NULL) Core.WarmSymbolCache();
}

//+------------------------------------------------------------------+
//| Get symbol Info                                                  |
//+------------------------------------------------------------------+
void CCommandHandler::GetSymbolInfo(string symbol) {

    JsonResponse res = Core.GetSymbolInfo(symbol);
    SendJson(res);
}



//+------------------------------------------------------------------+
//| Set PriceSender reference                                        |
//+------------------------------------------------------------------+
void CCommandHandler::SetPriceSender(CData *data)
{
    dataSender = data;
    Core = new CCommandCore(data);
}
//+------------------------------------------------------------------+
//| Send HTTP Response                                               |
//+------------------------------------------------------------------+
void CCommandHandler::SendError(int status, string details = "") {
    Print("Sending ACK -Status: ", status, ", details: ", details);
    JsonResponse jsonRes;
  
    string jsonStr = "";
    if(details != "")
        jsonStr += "\"details\":\"" + details + "\"";
    
    jsonRes.jsonContent = "{" + jsonStr + "}";
    jsonRes.status = status;
    
    SendJson(jsonRes);
}

void CCommandHandler::SendJson(JsonResponse &jsonRes)
{
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
