//+------------------------------------------------------------------+
//|                                                      HttpLib.mqh |
//|                                  Copyright 2025, MetaQuotes Ltd. |
//|                                             https://www.mql5.com |
//+------------------------------------------------------------------+
#property copyright "Copyright 2025, MetaQuotes Ltd."
#property link      "https://www.mql5.com"

#include "Logger.mqh"



struct HttpRequest {
    string method;          // GET, POST, PUT, DELETE
    string path;           // /v1/account, /v1/orders, etc.
    string body;           // Request body for POST/PUT
    string headers;        // HTTP headers
    
    string pathSegments[];  // path split by '/'
    string queryParams[][2]; // 2D array for query key-value pairs
    
    bool isWebSocket;
    string rawRequest;
};
struct HttpResponse {
   SOCKET64 ClientSocket;
    int status_code;       // 200, 404, etc.
    string status_text;    // OK, Not Found, etc.
    string content_type;   // application/json, text/plain, etc.
    string body;           // Response body
    bool keep_alive;       // Whether to keep connection open
};



HttpRequest ParseHttpRequest(string httpRequest) {
    HttpRequest request;
    request.isWebSocket = false;
    request.rawRequest = httpRequest;
    
    string lines[];
    StringReplace(httpRequest, "\r\n", "\n");
    int k = StringSplit(httpRequest, '\n', lines);
    LogDebug("HTTP parse: " + lines[0]);
    
    // Check if it's a websocket upgrade request
    for (int i = 0; i < k; i++) {
        if (StringFind(lines[i], "websocket", 0) != -1) {
            request.isWebSocket = true;
            break;
        }
    }

    string parts[];
    int partsCount = StringSplit(lines[0], ' ', parts);

    if(partsCount >= 3) {
        request.method = parts[0];
        
        // Separate path and query string
        int qpos = StringFind(parts[1], "?");
        if(qpos >= 0) {
            request.path = StringSubstr(parts[1], 0, qpos);
            string queryString = StringSubstr(parts[1], qpos + 1);

            // Parse query string into key-value pairs
            string pairs[];
            int pairCount = StringSplit(queryString, '&', pairs);

            ArrayResize(request.queryParams, pairCount);
            for(int i = 0; i < pairCount; i++) {
                string kv[];
                int kvCount = StringSplit(pairs[i], '=', kv);
                if(kvCount == 2) {
                    request.queryParams[i][0] = kv[0]; // key
                    request.queryParams[i][1] = kv[1]; // value
                }
                else if(kvCount == 1) {
                    request.queryParams[i][0] = kv[0];
                    request.queryParams[i][1] = "";
                }
                else {
                    request.queryParams[i][0] = "";
                    request.queryParams[i][1] = "";
                }
            }
        }
        else {
            request.path = parts[1];
        }

        // Split path by '/'
        string segments[];
        int segCount = StringSplit(request.path, '/', segments);

        // Filter out empty segments (like leading slash)
        ArrayResize(request.pathSegments, 0);
        for(int i = 0; i < segCount; i++) {
            if(StringLen(segments[i]) > 0) {
                int oldSize = ArraySize(request.pathSegments);
                ArrayResize(request.pathSegments, oldSize + 1);
                request.pathSegments[oldSize] = segments[i];
            }
        }

    } else {
        Print("Error: HTTP request line has less than 3 parts");
    }

    // Find empty line (separator between headers and body)
    int bodyStart = -1;
    for(int i = 1; i < ArraySize(lines); i++) {
        if(StringLen(lines[i]) == 0) {
            bodyStart = i + 1;
            break;
        }
    }

    // Extract body for POST/PUT requests
    if(bodyStart >= 0 && bodyStart < ArraySize(lines)) {
        request.body = "";
        for(int i = bodyStart; i < ArraySize(lines); i++) {
            if(i > bodyStart) request.body += "\r\n";
            request.body += lines[i];
        }
    }
   
    return request;
}



// Sends the full byte buffer to a socket, looping to handle partial sends.
// All client sockets in this project are non-blocking (see
// CSocketManager::AcceptClient), so a single send() call is NOT guaranteed to
// accept the whole buffer - its return value tells you how much it actually
// took, and the rest must be retried. Without this, a large response (e.g.
// GET /v1/symbol/list on a broker with tens of thousands of symbols, several
// MB of JSON) would silently truncate: send() takes what fits in the kernel's
// socket buffer, the rest is dropped, and the client is left waiting for
// bytes that never arrive.
//
// totalLen is passed explicitly (rather than using ArraySize(data)) because
// StringToCharArray appends a trailing null terminator the caller doesn't
// want counted or sent.
bool SendAll(SOCKET64 sock, char &data[], int totalLen) {
    int   sentTotal = 0;
    ulong startTick  = GetTickCount64();
    const ulong TIMEOUT_MS = 5000; // the EA is single-threaded (OnTimer) - a stuck
                                    // client must not be allowed to freeze everything
                                    // else (streaming, other clients) indefinitely.

    while (sentTotal < totalLen) {
        int remaining = totalLen - sentTotal;

        char chunk[];
        ArrayCopy(chunk, data, 0, sentTotal, remaining);

        int sent = send(sock, chunk, remaining, 0);

        if (sent > 0) {
            sentTotal += sent;
            continue;
        }

        int err = WSAGetLastError();
        if (sent == SOCKET_ERROR && err == WSAEWOULDBLOCK) {
            // Not a real error - kernel send buffer is full right now, wait
            // briefly and retry the remaining bytes.
            if (GetTickCount64() - startTick > TIMEOUT_MS) {
                Print("SendAll: timeout, only ", sentTotal, "/", totalLen, " bytes sent");
                return false;
            }
            Sleep(1);
            continue;
        }

        Print("SendAll: send failed - ", WSAErrorDescript(err));
        return false;
    }

    return true;
}

void SendHttpResponse(HttpResponse &res) {
    string connectionHeader = res.keep_alive ? "keep-alive" : "close";

    string response =
        "HTTP/1.1 " + IntegerToString(res.status_code) + " " + res.status_text + "\r\n" +
        "Content-Type: " + res.content_type + "\r\n" +
        "Content-Length: " + IntegerToString(StringLen(res.body)) + "\r\n" +
        "Connection: " + connectionHeader + "\r\n\r\n" +
        res.body;

    char out[];
    StringToCharArray(response, out);

    if (!SendAll(res.ClientSocket, out, StringLen(response)))
        Print("SendHttpResponse: response was not fully delivered to client");
}

string GetStatusText(int status_code)
{
    switch(status_code)
    {
        case 200: return "OK";
        case 201: return "Created";
        case 400: return "Bad Request";
        case 401: return "Unauthorized";
        case 403: return "Forbidden";
        case 404: return "Not Found";
        case 405: return "Method Not Allowed";
        case 500: return "Internal Server Error";
        case 503: return "Service Unavailable";
        default: return IntegerToString(status_code);  // fallback to code string
    }
}
