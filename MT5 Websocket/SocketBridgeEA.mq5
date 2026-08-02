//+------------------------------------------------------------------+
//| SocketBridgeEA.mq5 (Refactored + Working)                       |
//| Socket Bridge Expert Advisor for MT5 - Stable Refactor          |
//+------------------------------------------------------------------+
#property copyright "Betrix"
#property version   "1.0"
#property strict

#include <CommandHandler.mqh>
#include <Data.mqh>
#include <WebSocketLib.mqh>
#include <SocketManager.mqh>

#define HTTP_PORT 8890

#define SOCKET_BUFFER_SIZE 4096
#define TIMER_INTERVAL_MS 20

CSocketManager httpServer;

SOCKET64 httpClientSockets[];
SOCKET64 WebSocketClients[];

CCommandHandler* commandHandler = NULL;
CData* dataManager = NULL;
string symbols[];
string mbookSymbols[];

//+------------------------------------------------------------------+
int OnInit() {
   if (!InitializeWSA()) return INIT_FAILED;
   InitializeWebSocketServer();
   //EventSetTimer(1);
   EventSetMillisecondTimer(TIMER_INTERVAL_MS);
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason) {
   CleanupHandlers();
   CloseAllConnections();
}

void OnTradeTransaction(const MqlTradeTransaction &trans,
                        const MqlTradeRequest &request,
                        const MqlTradeResult &result)
{
    for (int i = ArraySize(WebSocketClients) - 1; i >= 0; i--) {
        SOCKET64 clientSocket = WebSocketClients[i];
        if (!IsSocketConnected(clientSocket)) {
            Print("WebSocket client ", i, " disconnected");
            closesocket(clientSocket);
            ArrayRemove(WebSocketClients, i);
            continue;
        }
        if (dataManager != NULL) {
        
            if(dataManager.isTrackingOrderEvent){
               dataManager.HandleTradeTransaction(trans, request, result, clientSocket);
            }
        }
    }
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
    if (!httpServer.CreateServer(HTTP_PORT)) {
        Print("Failed to create HTTP server on port ", HTTP_PORT);
        return;
    }

    if (commandHandler != NULL) delete commandHandler;
    commandHandler = new CCommandHandler();

    if (dataManager != NULL) delete dataManager;
    dataManager = new CData();
    dataManager.setSymbols(symbols);
    dataManager.setMbookSymbols(mbookSymbols);
    if (commandHandler != NULL)
        commandHandler.SetPriceSender(dataManager);

    Print("WebSocket server initialized on port ", HTTP_PORT);
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
    for (int i = ArraySize(WebSocketClients) - 1; i >= 0; i--) {
        SOCKET64 clientSocket = WebSocketClients[i];
        if (!IsSocketConnected(clientSocket)) {
            Print("WebSocket client ", i, " disconnected");
            closesocket(clientSocket);
            ArrayRemove(WebSocketClients, i);
            continue;
        }
        if (dataManager != NULL) {
        
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
                dataManager.SendCurrentCalendar(clientSocket);
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
