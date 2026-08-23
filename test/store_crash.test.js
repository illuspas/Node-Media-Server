// @ts-check
//
//  Created by Chen Mingliang on 26/08/23.
//  illuspas@msn.com
//  Copyright (c) 2026 NodeMedia. All rights reserved.
//
//  Crash-safety tests. These spawn child processes because SIGKILL and
//  process.exit() can only be exercised for real in a separate process.

const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const LightweightStore = require("../src/store/lightweight_store.js");

/**
 * Create a fresh temp data dir.
 * @returns {string}
 */
function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "nms-store-crash-"));
}

/**
 * Wait for a child to print a sentinel line, then resolve.
 * @param {import("node:child_process").ChildProcess} child
 * @param {string} sentinel
 * @returns {Promise<void>}
 */
function waitForSentinel(child, sentinel) {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const onData = (chunk) => {
      buffer += chunk.toString();
      if (buffer.includes(sentinel)) {
        child.stdout?.off("data", onData);
        resolve();
      }
    };
    child.stdout?.on("data", onData);
    child.on("error", reject);
  });
}

/**
 * Run a child node script and resolve when it exits.
 * @param {string} script
 * @returns {Promise<{code: number | null, signal: string | null}>}
 */
function runChild(script) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["-e", script]);
    child.on("exit", (code, signal) => resolve({ code, signal }));
  });
}

test("SIGKILL during unflushed writes leaves a valid file and no partial data", async () => {
  const dir = tmpDir();
  const script = `
    const Store = require(${JSON.stringify(path.join(__dirname, "..", "src", "store", "lightweight_store.js"))});
    (async () => {
      const store = new Store({ dir: ${JSON.stringify(dir)}, signals: false });
      await store.open();
      const users = store.collection("users");
      for (let i = 0; i < 100; i++) {
        users.set("batch-a-" + i, { i });
      }
      await store.flush();
      // second batch is memory-only: the flush interval is far in the future
      for (let i = 0; i < 100; i++) {
        users.set("batch-b-" + i, { i });
      }
      console.log("READY");
      setInterval(() => {}, 10000);
    })().catch((e) => { console.error(e); process.exit(1); });
  `;

  const child = spawn(process.execPath, ["-e", script]);
  await waitForSentinel(child, "READY");
  child.kill("SIGKILL");
  await new Promise((resolve) => child.on("exit", resolve));

  const store = new LightweightStore({ dir, signals: false });
  await store.open();
  const users = store.collection("users");
  assert.equal(users.count(), 100); // batch A durable, batch B lost with the process
  for (let i = 0; i < 100; i++) {
    assert.ok(users.get(`batch-a-${i}`), `batch-a-${i} survived`);
    assert.equal(users.get(`batch-b-${i}`), null);
  }
  await store.close();
});

test("process.exit(0) right after writes is covered by the exit-hook writeback", async () => {
  const dir = tmpDir();
  const script = `
    const Store = require(${JSON.stringify(path.join(__dirname, "..", "src", "store", "lightweight_store.js"))});
    const store = new Store({ dir: ${JSON.stringify(dir)}, flushInterval: 60000, maxOps: 10000000, signals: false });
    store.open().then(() => {
      const users = store.collection("users");
      for (let i = 0; i < 50; i++) {
        users.set("exit-" + i, { i });
      }
      process.exit(0); // no explicit flush on purpose
    });
  `;

  const { code } = await runChild(script);
  assert.equal(code, 0);

  const store = new LightweightStore({ dir, signals: false });
  await store.open();
  const users = store.collection("users");
  assert.equal(users.count(), 50);
  await store.close();
});

test("SIGTERM triggers the signal hook: pending data is flushed before exit", async () => {
  const dir = tmpDir();
  const script = `
    const Store = require(${JSON.stringify(path.join(__dirname, "..", "src", "store", "lightweight_store.js"))});
    (async () => {
      const store = new Store({ dir: ${JSON.stringify(dir)}, flushInterval: 60000, maxOps: 10000000 });
      await store.open();
      store.collection("users").set("term-1", { v: 1 });
      console.log("READY");
      setInterval(() => {}, 10000);
    })().catch((e) => { console.error(e); process.exit(1); });
  `;

  const child = spawn(process.execPath, ["-e", script]);
  await waitForSentinel(child, "READY");
  child.kill("SIGTERM");
  const { signal } = await new Promise((resolve) => child.on("exit", (c, s) => resolve({ code: c, signal: s })));
  assert.equal(signal, "SIGTERM");

  const store = new LightweightStore({ dir, signals: false });
  await store.open();
  assert.equal(store.collection("users").get("term-1").v, 1);
  await store.close();
});
