const BACKEND_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

export async function streamChat(
  message: string,
  history: any[],
  taskType: string,
  sessionId: string,
  onToken: (token: string) => void,
  onDone: (result: any) => void,
  onError: (error: string) => void
) {
  const token = localStorage.getItem("eaconsole.sessionToken");
  try {
    const res = await fetch(`${BACKEND_URL}/api/chat/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ message, history, taskType, sessionId })
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
                await new Promise(r => setTimeout(r, 20)); // 20ms per char for pronounced terminal effect
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
  const res = await fetch(`${BACKEND_URL}/api/chat/session/${sessionId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || "Failed to delete chat session");
  }
  return res.json();
}

export async function getChatHistory(limit = 10, offset = 0) {
  const token = localStorage.getItem("eaconsole.sessionToken");
  const res = await fetch(`${BACKEND_URL}/api/chat/history?limit=${limit}&offset=${offset}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store" // Prevent browser from caching empty state
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || "Failed to load chat history");
  }
  return res.json();
}
