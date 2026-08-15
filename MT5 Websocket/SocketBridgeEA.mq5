//+------------------------------------------------------------------+
//| SocketBridgeEA.mq5 (Refactored + Working)                       |
//| Socket Bridge Expert Advisor for MT5 - Stable Refactor          |
//+------------------------------------------------------------------+
#property copyright "Betrix MT5 Websocket"
#property version   "1.0"
#property strict

#include "CommandHandler.mqh"
#include "Data.mqh"
#include "WebSocketLib.mqh"
#include "SocketManager.mqh"

// Was #define HTTP_PORT 8890 - moved to an input so the port can be changed
// per-chart/per-instance without recompiling (useful for running several EA
// instances on different ports, or for the backend's .env to just match
// whatever the person set here).
input int InpPort = 8890;

#define SOCKET_BUFFER_SIZE 4096
#define TIMER_INTERVAL_MS 20

CSocketManager httpServer;

SOCKET64 httpClientSockets[];
SOCKET64 WebSocketClients[];

CCommandHandler* commandHandler = NULL;
CData* dataManager = NULL;
string symbols[];
string mbookSymbols[];

// Status heartbeat state (see Data.mqh::SendTrackingStatus).
// g_eaStartTime resets every time dataManager is (re)created - i.e. every
// time tracking config is wiped - so uptime_sec sent to the backend always
// reflects "time since tracking was last reset", not raw process uptime.
datetime g_eaStartTime         = 0;
datetime g_lastStatusBroadcast = 0;
#define STATUS_BROADCAST_INTERVAL_SEC 5

//+------------------------------------------------------------------+
int OnInit() {
   if (!InitializeWSA()) return INIT_FAILED;
   CalendarWarmup();
   InitializeWebSocketServer();
   //EventSetTimer(1);
   EventSetMillisecondTimer(TIMER_INTERVAL_MS);
   return INIT_SUCCEEDED;
}

// MQL5 has no API to force-download the terminal's calendar database - it
// only reads whatever the terminal already synced (which requires a live
// connection to a broker server, handled entirely by the terminal itself).
// This just verifies + reports that state right when the EA mounts, instead
// of the backend discovering an empty calendar later via GET /v1/calendar.
void CalendarWarmup() {
   datetime from = TimeTradeServer() - 86400;
   datetime to   = TimeTradeServer() + 86400;
   MqlCalendarValue values[];

   if (!CalendarValueHistory(values, from, to)) {
      Print("Calendar warm-up: CalendarValueHistory failed, error ", GetLastError(),
            " - /v1/calendar and /v1/track/calendar will stay empty until the terminal's calendar feed is available");
      return;
   }

   Print("Calendar warm-up: ", ArraySize(values), " event(s) found in terminal calendar cache (window: yesterday-tomorrow)");
}

void OnDeinit(const int reason) {
   CleanupHandlers();
   CloseAllConnections();
}




void OnTimer() {
    if (!httpServer.IsValid()) {
        InitializeWebSocketServer();
        return;
    }

    AcceptNewClients();
    ProcessHttpClients();

    if (ArraySize(WebSocketClients) > 0) {
        SendUpdateToClients();
    }
}


bool InitializeWSA() {
    char wsaData[]; 
    ArrayResize(wsaData, sizeof(WSAData));
    int res = WSAStartup(MAKEWORD(2, 2), wsaData);
    if (res != 0) {
        Print("WSAStartup failed with error: ", string(res));
        return false;
    }
    return true;
}

void CleanupHandlers() {
    if (commandHandler != NULL) {
        commandHandler.Destroy();
        delete commandHandler;
        commandHandler = NULL;
    }
    if (dataManager != NULL) {
        delete dataManager;
        dataManager = NULL;
    }
}

void InitializeWebSocketServer() {
    if (!httpServer.CreateServer(InpPort)) {
        Print("Failed to create HTTP server on port ", InpPort);
        return;
    }

    if (commandHandler != NULL) delete commandHandler;
    commandHandler = new CCommandHandler();

    if (dataManager != NULL) delete dataManager;
    dataManager = new CData();
    dataManager.SetSymbols(symbols);
    dataManager.SetMbookSymbols(mbookSymbols);
    if (commandHandler != NULL)
        commandHandler.SetPriceSender(dataManager);

    g_eaStartTime = TimeTradeServer();

    Print("WebSocket server initialized on port ", InpPort);
}


void AcceptNewClients() {
    SOCKET64 newSocket = httpServer.AcceptClient();
    if (newSocket != INVALID_SOCKET64) {
        Print("New client connected");

        int currentSize = ArraySize(httpClientSockets);
        ArrayResize(httpClientSockets, currentSize + 1);
        httpClientSockets[currentSize] = newSocket;
    }
}

void ProcessHttpClients() {
    for (int i = ArraySize(httpClientSockets) - 1; i >= 0; i--) {
        SOCKET64 sock = httpClientSockets[i];
        char buf[SOCKET_BUFFER_SIZE];
        int received = recv(sock, buf, ArraySize(buf), 0);

        if (received > 0) {
            string msg = CharArrayToString(buf, 0, received);
            HttpRequest request = ParseHttpRequest(msg);

            if (request.isWebSocket) {
                bool handshakeSuccess = PerformWebSocketHandshake(sock, msg);

                if (handshakeSuccess) {
                    int n = ArraySize(WebSocketClients);
                    ArrayResize(WebSocketClients, n + 1);
                    WebSocketClients[n] = sock;
                    Print("WebSocket client registered (total clients: ", n + 1, ")");
                    ArrayRemove(httpClientSockets, i); 
                }
                else {
                    Print("WebSocket handshake failed");
                    RemoveSocketFromArray(httpClientSockets, i);
                }
            } else {
                if (commandHandler != NULL)
                    commandHandler.HandleCommand(sock, request);
                RemoveSocketFromArray(httpClientSockets, i);
            }
        } else if (received == 0 || (received < 0 && WSAGetLastError() != WSAEWOULDBLOCK)) {
            RemoveSocketFromArray(httpClientSockets, i);
        }
    }
}

void SendUpdateToClients() {
    // Decided once per OnTimer tick, outside the per-client loop - same
    // "detect once, broadcast to all" principle already used elsewhere here
    // (see CData multi-client broadcast fix) to avoid re-detection bugs.
    bool sendStatus = false;
    if (TimeTradeServer() - g_lastStatusBroadcast >= STATUS_BROADCAST_INTERVAL_SEC) {
        sendStatus = true;
        g_lastStatusBroadcast = TimeTradeServer();
    }

    for (int i = ArraySize(WebSocketClients) - 1; i >= 0; i--) {
        SOCKET64 clientSocket = WebSocketClients[i];
        if (!IsSocketConnected(clientSocket)) {
            Print("WebSocket client ", i, " disconnected");
            closesocket(clientSocket);
            ArrayRemove(WebSocketClients, i);
            continue;
        }
        if (dataManager != NULL) {

            if (sendStatus) {
                dataManager.SendTrackingStatus(clientSocket, g_eaStartTime);
            }
            if(dataManager.isTrackingPrice){
               dataManager.SendCurrentPrices(clientSocket);
            }
            if(dataManager.isTrackingOhlc){
               dataManager.SendCurrentOhlcs(clientSocket);
            }
            if (dataManager.isTrackingMbook){
                dataManager.SendCurrentMbook(clientSocket);
            }
            if (dataManager.isTrackingCalendar){
                dataManager.SendCalendarUpdates(clientSocket);
            }
            
        }
    }
}

// Closes socket at index and removes it from the array
void RemoveSocketFromArray(SOCKET64 &socketArray[], int index)
{
    if (index >= 0 && index < ArraySize(socketArray))
    {
        if (socketArray[index] != INVALID_SOCKET64)
        {
            closesocket(socketArray[index]);
            socketArray[index] = INVALID_SOCKET64;
        }
        ArrayRemove(socketArray, index);
    }
}


void CloseAllConnections() {
    for (int i = 0; i < ArraySize(WebSocketClients); i++) closesocket(WebSocketClients[i]);
    ArrayResize(WebSocketClients, 0);

    for (int i = 0; i < ArraySize(httpClientSockets); i++) closesocket(httpClientSockets[i]);
    ArrayResize(httpClientSockets, 0);

    httpServer.Close();

    WSACleanup();
    Print("All connections closed");
}
