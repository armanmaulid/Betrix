const OPEN_TAG = "<thinking>";
const CLOSE_TAG = "</thinking>";

export function stripThinkingTags(text) {
  return text.replace(/<thinking>[\s\S]*?(?:<\/thinking>|$)/gi, "").trim();
}

export function createThinkingStreamFilter(onClean) {
  let buffer = "";
  let insideThinking = false;

  function partialTagSuffixLength(str, tag) {
    const maxLen = Math.min(str.length, tag.length - 1);
    for (let len = maxLen; len > 0; len--) {
      if (str.slice(-len).toLowerCase() === tag.slice(0, len).toLowerCase()) {
        return len;
      }
    }
    return 0;
  }

  function feed(chunk) {
    buffer += chunk;
    let progress = true;

    while (progress) {
      progress = false;

      if (!insideThinking) {
        const idx = buffer.toLowerCase().indexOf(OPEN_TAG);
        if (idx !== -1) {
          const clean = buffer.slice(0, idx);
          if (clean) onClean(clean);
          buffer = buffer.slice(idx + OPEN_TAG.length);
          insideThinking = true;
          progress = true;
        } else {
          const holdLen = partialTagSuffixLength(buffer, OPEN_TAG);
          const emitLen = buffer.length - holdLen;
          if (emitLen > 0) {
            onClean(buffer.slice(0, emitLen));
            buffer = buffer.slice(emitLen);
          }
        }
      } else {
        const idx = buffer.toLowerCase().indexOf(CLOSE_TAG);
        if (idx !== -1) {
          buffer = buffer.slice(idx + CLOSE_TAG.length);
          insideThinking = false;
          progress = true;
        } else {
          const holdLen = partialTagSuffixLength(buffer, CLOSE_TAG);
          buffer = buffer.slice(buffer.length - holdLen);
        }
      }
    }
  }

  function flush() {
    if (!insideThinking && buffer) {
      onClean(buffer);
      buffer = "";
    }
  }

  return { feed, flush };
}
