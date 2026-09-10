// @ts-check
//
//  Created by Chen Mingliang on 26/09/10.
//  illuspas@msn.com
//  Copyright (c) 2026 NodeMedia. All rights reserved.
//

const assert = require("node:assert/strict");
const test = require("node:test");

const express = require("express");
const ApiRouter = require("../src/routers/api.js");
const Context = require("../src/core/context.js");

/**
 * Start a bare API app on an ephemeral port.
 * @returns {Promise<{server: import("http").Server, baseUrl: string}>}
 */
async function startApp() {
  Context.config = {};
  const app = express();
  app.use("/api/v1", new ApiRouter().router);
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}` };
}

/**
 * Accumulate chunks from an SSE response body until the text matches,
 * giving up after the timeout.
 * @param {ReadableStreamDefaultReader<Uint8Array>} reader
 * @param {(text: string) => boolean} predicate
 * @param {number} timeoutMs
 * @returns {Promise<string>} the accumulated text
 */
async function readUntil(reader, predicate, timeoutMs = 3000) {
  const decoder = new TextDecoder();
  const deadline = Date.now() + timeoutMs;
  let text = "";
  while (Date.now() < deadline) {
    if (predicate(text)) {
      return text;
    }
    const chunk = await Promise.race([
      reader.read(),
      new Promise(resolve => setTimeout(() => resolve("timeout"), deadline - Date.now()))
    ]);
    if (chunk === "timeout") {
      break;
    }
    if (chunk.done) {
      break;
    }
    text += decoder.decode(chunk.value, { stream: true });
  }
  return text;
}

test("GET /events streams lifecycle events over SSE", async () => {
  const { server, baseUrl } = await startApp();
  const controller = new AbortController();
  try {
    const res = await fetch(`${baseUrl}/api/v1/events`, {
      signal: controller.signal,
      headers: { Accept: "text/event-stream" }
    });
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /text\/event-stream/);
    const reader = res.body.getReader();

    const hello = await readUntil(reader, t => t.includes("retry: 3000"));
    assert.ok(hello.includes("retry: 3000"), `expected retry hint, got: ${hello}`);

    Context.eventEmitter.emit("postPublish", {
      id: 42,
      ip: "9.9.9.9:1",
      streamApp: "live",
      streamName: "s",
      streamPath: "/live/s",
      protocol: "rtmp",
      isPublisher: true,
      createTime: 123,
      inBytes: 5,
      outBytes: 0
    });
    const eventText = await readUntil(reader, t => t.includes("event: postPublish"));
    const dataLine = eventText.split("event: postPublish")[1].split("data: ")[1].split("\n")[0];
    const payload = JSON.parse(dataLine);
    assert.equal(payload.streamPath, "/live/s");
    assert.equal(payload.id, 42);
    assert.equal(payload.protocol, "rtmp");

    Context.eventEmitter.emit("donePlay", { id: 43, streamPath: "/live/s", protocol: "flv" });
    const doneText = await readUntil(reader, t => t.includes("event: donePlay"));
    assert.ok(doneText.includes("event: donePlay"), `expected donePlay event, got: ${doneText}`);
  } finally {
    controller.abort();
    server.closeAllConnections?.();
    server.close();
    await new Promise(resolve => setTimeout(resolve, 50));
    // disconnecting must detach the listeners so clients cannot leak
    for (const eventName of ["postPublish", "donePlay"]) {
      assert.equal(Context.eventEmitter.listenerCount(eventName), 0);
    }
  }
});
