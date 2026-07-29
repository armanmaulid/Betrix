import { routeAndStream } from "./src/services/modelRouter.js";

async function test() {
  try {
    const res = await routeAndStream({
      taskType: "faq",
      messages: [{ role: "user", content: "hello" }],
      onToken: (token) => {
        process.stdout.write(token);
      },
      signal: new AbortController().signal
    });
    console.log("\n\nResult:", res);
  } catch(e) {
    console.error(e);
  }
}
test();
