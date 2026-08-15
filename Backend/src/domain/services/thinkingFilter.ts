export function stripThinkingTags(text: string): string {
  return text
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
    .replace(/<thinking>[\s\S]*$/gi, "")
    .trim();
}

export function createThinkingStreamFilter(onClean: (text: string) => void) {
  let buffer = "";
  let inThinking = false;

  const OPEN = "<thinking>";
  const CLOSE = "</thinking>";

  // Simpan beberapa karakter terakhir supaya tag yang terpotong antar chunk
  // (umum pada SSE streaming) tetap terdeteksi tanpa bocor ke output.
  const KEEP_TAIL = Math.max(OPEN.length - 1, CLOSE.length - 1); // 10

  return {
    feed(chunk: string): void {
      buffer += chunk;
      const lower = buffer.toLowerCase();

      if (inThinking) {
        const closeIdx = lower.indexOf(CLOSE);
        if (closeIdx === -1) {
          // Masih di dalam blok thinking: buang, simpan tail untuk deteksi penutup.
          buffer = buffer.slice(-KEEP_TAIL);
          return;
        }
        buffer = buffer.slice(closeIdx + CLOSE.length);
        inThinking = false;
        return this.feed("");
      }

      const openIdx = lower.indexOf(OPEN);
      if (openIdx !== -1) {
        const before = buffer.slice(0, openIdx);
        if (before) onClean(before);
        buffer = buffer.slice(openIdx + OPEN.length);
        inThinking = true;
        return this.feed("");
      }

      // Tidak ada tag lengkap: keluarkan teks aman, sisakan tail yang mungkin
      // menjadi awal tag pada chunk berikutnya.
      if (buffer.length > KEEP_TAIL) {
        onClean(buffer.slice(0, buffer.length - KEEP_TAIL));
        buffer = buffer.slice(-KEEP_TAIL);
      }
    },
    flush() {
      if (!inThinking && buffer) {
        onClean(buffer);
      }
      buffer = "";
      inThinking = false;
    },
  };
}