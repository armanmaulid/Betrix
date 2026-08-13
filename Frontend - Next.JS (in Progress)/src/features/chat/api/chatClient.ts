"use client";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

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
  onError: (error: string) => void
) {
  const token = localStorage.getItem("eaconsole.sessionToken");
  try {
    const res = await fetch(`${BACKEND_URL}/api/v1/chat/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ message, displayMessage, history, taskType, sessionId, tier, image })
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || "Failed to start chat stream");
    }

    const reader = res.body?.getReader();
    const decoder = new TextDecoder();
    if (!reader) throw new Error("No readable stream");

    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      let isDoneEvent = false;

      for (const line of lines) {
        if (line.trim() === "") continue;
        
        if (line.startsWith("event: done")) {
          isDoneEvent = true;
        } else if (line.startsWith("event: error")) {
          // Will be handled in the next data line usually
        } else if (line.startsWith("data: ")) {
          const dataStr = line.substring(6);
          if (dataStr.trim() === "[DONE]") continue; // Standard OpenAI SSE termination
          
          try {
            const data = JSON.parse(dataStr);
            if (isDoneEvent) {
              onDone(data);
              isDoneEvent = false;
            } else if (data.token) {
              // Guarantee typewriter effect even if backend or proxy sends huge chunks at once
              const chars = data.token.split('');
              for (const char of chars) {
                onToken(char);
                await new Promise(r => setTimeout(r, 5)); // 5ms per char for faster terminal effect
              }
            } else if (data.error) {
              onError(data.error);
            }
          } catch (e) {
            // Ignore parse errors for incomplete chunks
          }
        }
      }
    }
  } catch (err: any) {
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
