import { BACKEND_URL } from "../../../shared/lib/config";

const historyCache = new Map<string, { data: any; timestamp: number }>();

export async function streamChat(
  message: string,
  displayMessage: string,
  history: any[],
  taskType: string,
  sessionId: string,
  tier: string | undefined,
  image: string | null,
  onToken: (token: string) => void,
  onDone: (result: any) => void,
  onError: (error: string) => void,
  signal?: AbortSignal
) {
  const token = localStorage.getItem("eaconsole.sessionToken");
  try {
    const res = await fetch(`${BACKEND_URL}/api/v1/chat/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ message, displayMessage, history, taskType, sessionId, tier, image }),
      signal
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || "Failed to start chat stream");
    }

    const reader = res.body?.getReader();
    const decoder = new TextDecoder();
    if (!reader) throw new Error("No readable stream");

    let buffer = "";
    // Hoisted outside the read loop so the flag survives chunk boundaries —
    // `event: done` and its `data:` line can land in separate network chunks.
    let isDoneEvent = false;
    let isErrorEvent = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (signal?.aborted) break; // Caller navigated away / unmounted — stop reading
      
      buffer += decoder.decode(value, { stream: true });
      // Some proxies normalize line endings to CRLF — normalize to LF first
      // so frame-boundary splitting below handles both.
      buffer = buffer.replace(/\r\n/g, "\n");

      // Parse on `\n\n` frame boundaries per the SSE spec; keep any trailing
      // partial frame buffered for the next read.
      const frames = buffer.split("\n\n");
      buffer = frames.pop() || "";

      for (const frame of frames) {
        isDoneEvent = false;
        isErrorEvent = false;
        const dataLines: string[] = [];

        for (const line of frame.split("\n")) {
          if (line.trim() === "") continue;
          if (line.startsWith(":")) continue; // SSE comment / keep-alive
          if (line.startsWith("event:")) {
            const eventName = line.substring(6).trim();
            if (eventName === "done") isDoneEvent = true;
            else if (eventName === "error") isErrorEvent = true;
          } else if (line.startsWith("data:")) {
            // "data:" optionally followed by a single space, per the spec
            dataLines.push(line.substring(5).replace(/^ /, ""));
          }
        }

        if (dataLines.length === 0) continue;

        const dataStr = dataLines.join("\n");
        if (dataStr.trim() === "[DONE]") continue; // Standard OpenAI SSE termination

        try {
          const data = JSON.parse(dataStr);
          if (isDoneEvent) {
            onDone(data);
          } else if (isErrorEvent || data.error) {
            onError(data.error || "Stream error");
          } else if (data.token) {
            onToken(data.token);
          }
        } catch (e) {
          // Ignore parse errors for incomplete frames
        }
      }
    }
  } catch (err: any) {
    // Abort is not an error worth surfacing — the caller chose to cancel.
    if (signal?.aborted || err?.name === "AbortError") return;
    onError(err.message);
  }
}

export async function deleteChatSession(sessionId: string) {
  const token = localStorage.getItem("eaconsole.sessionToken");
  const res = await fetch(`${BACKEND_URL}/api/v1/chat/session/${sessionId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || "Failed to delete chat session");
  }
  historyCache.clear();
  return res.json();
}

export async function getChatHistory(limit = 10, offset = 0) {
  const cacheKey = `${limit}_${offset}`;
  const cached = historyCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < 15000) {
    return cached.data;
  }

  const token = localStorage.getItem("eaconsole.sessionToken");
  const res = await fetch(`${BACKEND_URL}/api/v1/chat/history?limit=${limit}&offset=${offset}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || "Failed to load chat history");
  }
  
  const data = await res.json();
  historyCache.set(cacheKey, { data, timestamp: Date.now() });
  return data;
}
