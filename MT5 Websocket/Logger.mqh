//+------------------------------------------------------------------+
//|                                                       Logger.mqh |
//|             Shared debug-log gate - avoids spamming the Experts  |
//|             log with per-request/per-line trace output.          |
//+------------------------------------------------------------------+
#ifndef LOGGER_MQH
#define LOGGER_MQH

// ERROR/INFO-level Print() calls elsewhere (failures, connect/disconnect,
// tracking config changes) are NOT gated by this - those should always be
// visible. Only high-frequency or low-value trace output (raw request dumps,
// per-header-line parsing, handshake key values) goes through LogDebug().
input bool InpDebugLog = false;

void LogDebug(string msg) {
    if (InpDebugLog) Print(msg);
}

#endif // LOGGER_MQH
