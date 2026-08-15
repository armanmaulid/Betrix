//+------------------------------------------------------------------+
//|                         WebSocketLib.mqh                         |
//|       Simple WebSocket handshake & send text frame for MT5       |
//+------------------------------------------------------------------+
#property copyright "Betrix MT5 Bridge"

#include "JAson.mqh"
#include "socketlib.mqh"
#include "Logger.mqh"

#import "kernel32.dll"
void RtlMoveMemory(char &dest[], uchar &src[], int length);
#import

// Compute Sec-WebSocket-Accept header value from Sec-WebSocket-Key
string GetWebSocketAcceptKey(string secKey)
{
    string magicGUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
    string keyWithGUID = secKey + magicGUID;

    uchar inputs[], sha1Result[], base64acceptkey[], dummy_key[];

    // Convert to byte array
    StringToCharArray(keyWithGUID, inputs, 0, StringLen(keyWithGUID), CP_UTF8);

    // SHA1 hash
    int res = CryptEncode(CRYPT_HASH_SHA1, inputs, dummy_key, sha1Result);
    if (res <= 0)
    {
        Print("SHA-1 hashing failed. Error: ", GetLastError());
        return "";
    }

    // Base64 encode
    res = CryptEncode(CRYPT_BASE64, sha1Result, dummy_key, base64acceptkey);
    if (res <= 0)
    {
        Print("Base64 encoding failed. Error: ", GetLastError());
        return "";
    }

    return CharArrayToString(base64acceptkey);
}

// Perform WebSocket handshake
bool PerformWebSocketHandshake(SOCKET64 sock, string request)
{
    string secKey = "";
    string lines[];
    StringReplace(request, "\r\n", "\n");  // Normalize line endings
    int lineCount = StringSplit(request, '\n', lines);

    for (int i = 0; i < lineCount; i++)
    {
        string line = lines[i];
        StringTrimLeft(line);
        StringTrimRight(line);
    
        LogDebug(" line: " + line);
    
        string lowerLine = line;
        StringToLower(lowerLine);
        
        if (StringFind(lowerLine, "sec-websocket-key:", 0) == 0)
        {
            // Extract from original line to preserve case of the key itself
            secKey = StringSubstr(line, StringLen("Sec-WebSocket-Key:"));
            if (secKey == line) {
               // if it wasn't camelCase, try lowercase substring
               secKey = StringSubstr(line, StringLen("sec-websocket-key:"));
            }
            StringTrimLeft(secKey);
            StringTrimRight(secKey);
            break;
        }
    }

    if (secKey == "")
    {
        Print("WebSocket handshake: No Sec-WebSocket-Key found!");
        return false;
    }

    string acceptKey = GetWebSocketAcceptKey(secKey);
    LogDebug("handshake: secKey=" + secKey + " acceptKey=" + acceptKey);

    string response =
        "HTTP/1.1 101 Switching Protocols\r\n"
        "Upgrade: websocket\r\n"
        "Connection: Upgrade\r\n"
        "Sec-WebSocket-Accept: " + acceptKey + "\r\n\r\n";

    char out[];
    StringToCharArray(response, out, 0, StringLen(response), CP_UTF8);

    int sent = send(sock, out, StringLen(response), 0);  // Use StringLen instead of ArraySize
    if (sent < 0) {
        Print("WebSocket handshake: send failed with error ", WSAGetLastError());
        return false;
    }
    else {
        Print("WebSocket handshake: done, sent ", sent, " bytes");
        return true;
    }
}

// Send text data framed in WebSocket format
bool SendWebSocketTextFrame(SOCKET64 sock, string payload)
{
    // Convert payload to UTF-8 bytes
    uchar payloadBytes[];
    int payloadLen = StringToCharArray(payload, payloadBytes, 0, -1, CP_UTF8) - 1; // -1 to exclude null terminator
    
    if (payloadLen <= 0) {
        return false;
    }

    uchar frame[2048];
    int pos = 0;

    // First byte: FIN=1, RSV=0, Opcode=1 (text frame)
    frame[pos++] = 0x81;  // 10000001 binary

    // Second byte: MASK=0 (server to client), Length
    if (payloadLen <= 125)
    {
        frame[pos++] = (uchar)payloadLen;
    }
    else if (payloadLen <= 65535)
    {
        frame[pos++] = 126;
        frame[pos++] = (uchar)(payloadLen >> 8);
        frame[pos++] = (uchar)(payloadLen & 0xFF);
    }
    else
    {
        return false;
    }

    // Copy payload bytes into frame
    for (int i = 0; i < payloadLen; i++)
        frame[pos++] = payloadBytes[i];

    // Convert to char array for sending
    char frameToSend[];
    ArrayResize(frameToSend, pos);
    RtlMoveMemory(frameToSend, frame, pos);

    // Send the frame
    int sent = send(sock, frameToSend, pos, 0);
    if (sent < 0) {
        return false;
    }
    else {
        return true;
    }
}

// Send a WebSocket ping frame
bool SendWebSocketPing(SOCKET64 sock)
{
    uchar frame[2];
    frame[0] = 0x89;  // FIN=1, opcode=9 (ping)
    frame[1] = 0x00;  // No payload
    
    char frameToSend[2];
    RtlMoveMemory(frameToSend, frame, 2);
    
    int sent = send(sock, frameToSend, 2, 0);
    if (sent < 0) {
        return false;
    }
    
    return true;
}

// Check if socket is still connected
bool IsSocketConnected(SOCKET64 sock)
{
    if (sock == INVALID_SOCKET64)
        return false;
        
    // Simple check - try to send 0 bytes
    char dummy[1];
    int result = send(sock, dummy, 0, 0);
    
    if (result == SOCKET_ERROR) {
        int error = WSAGetLastError();
        if (error == WSAEWOULDBLOCK || error == WSAENOTCONN || error == WSAECONNRESET) {
            return false;
        }
    }
    
    return true;
}
