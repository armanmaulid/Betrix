export function stripThinkingTags(text: string): string {
  return text
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
    .replace(/<thinking>[\s\S]*$/gi, "")
    .trim();
}

export function createThinkingStreamFilter(onClean: (text: string) => void) {
  let buffer = "";
  let inThinking = false;

  return {
    feed(chunk: string) {
      buffer += chunk;
      let processed = "";
      
      for (let i = 0; i < buffer.length; i++) {
        if (!inThinking && buffer.slice(i, i + 10).toLowerCase() === "<thinking>") {
          inThinking = true;
          i += 9;
          continue;
        }
        if (inThinking && buffer.slice(i, i + 11).toLowerCase() === "</thinking>") {
          inThinking = false;
          i += 10;
          continue;
        }
        if (!inThinking) {
          processed += buffer[i];
        }
      }
      
      buffer = inThinking ? buffer.slice(buffer.lastIndexOf("<thinking>")) : "";
      
      if (processed) {
        onClean(processed);
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