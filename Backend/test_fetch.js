const url = "http://127.0.0.1:8890/v1/symbol/list";

async function testFetch() {
  try {
    const start = Date.now();
    console.log("Fetching...", url);
    const res = await fetch(url);
    console.log("Headers received after", Date.now() - start, "ms. Status:", res.status);
    
    if (!res.ok) {
      console.log("Error status:", res.status, await res.text());
      return;
    }
    const text = await res.text();
    console.log("Body received. Length:", text.length);
    console.log("First 100 chars:", text.slice(0, 100));
    console.log("Last 100 chars:", text.slice(-100));
    try {
      // Fix unescaped backslashes in JSON (MT5 EA bug)
      // We replace \ with \\ unless it's a valid JSON escape sequence
      const sanitizedText = text.replace(/\\(?!["\\/bfnrtu])/g, '\\\\');
      const json = JSON.parse(sanitizedText);
      console.log("JSON parsed successfully. Length:", (json.symbols || json).length);
    } catch (e) {
      console.log("JSON Parse Error:", e.message);
    }
  } catch (e) {
    console.log("Fetch Error:", e.message, e.cause);
  }
}

testFetch();
