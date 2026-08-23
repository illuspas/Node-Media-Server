// @ts-check
//
//  Created by Chen Mingliang on 26/08/23.
//  illuspas@msn.com
//  Copyright (c) 2026 NodeMedia. All rights reserved.
//
//  Integration tests for NMS persistence: relay task restore, recording
//  metadata, session history, and the records/history API handlers.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const LightweightStore = require("../src/store/lightweight_store.js");
const RelayManager = require("../src/server/relay_manager.js");
const NodeRecordServer = require("../src/server/record_server.js");
const NodeHistoryServer = require("../src/server/history_server.js");
const RecordsHandler = require("../src/api/handlers/records.js");
const HistoryHandler = require("../src/api/handlers/history.js");
const Context = require("../src/core/context.js");

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fresh store + Context wiring.
 * @param {object} [storeOptions]
 * @returns {Promise<LightweightStore>}
 */
async function openStore(storeOptions = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nms-persist-"));
  const store = new LightweightStore({ dir, signals: false, ...storeOptions });
  await store.open();
  Context.store = store;
  return store;
}

/**
 * Reset Context singletons between tests.
 * @returns {void}
 */
function resetContext() {
  Context.eventEmitter.removeAllListeners();
  Context.broadcasts.clear();
  Context.sessions.clear();
  Context.store = null;
  Context.config = {};
  Context.relayManager = null;
}

test("relay tasks persist across manager restart and delete is persisted too", async () => {
  resetContext();
  const store = await openStore();

  const first = new RelayManager();
  first.run();
  first.addTask({ url: "rtmp://127.0.0.1:1/live/x", streamPath: "/live/x", mode: "pull", reconnect: false });
  first.addTask({ url: "rtmp://127.0.0.1:1/out", streamPath: "/live/x", mode: "push", reconnect: false });
  assert.equal(first.getTaskCount(), 2);
  assert.equal(store.collection("relay_tasks").count(), 2);
  await sleep(50); // let failed connections settle
  first.stop();
  await store.close();

  // simulate a restart: new store instance on the same dir, new manager
  const store2 = new LightweightStore({ dir: store.options.dir, signals: false });
  await store2.open();
  Context.store = store2;
  const second = new RelayManager();
  second.run();
  assert.equal(second.getTaskCount(), 2, "tasks restored from disk");
  assert.ok(second.getTaskStatus("/live/x"), "pull task restored");
  assert.ok(second.getTaskStatus("push:rtmp://127.0.0.1:1/out"), "push task restored");

  // removing a task drops it from persistence
  second.removeTask("/live/x");
  await store2.flush();
  second.stop();
  await store2.close();

  const store3 = new LightweightStore({ dir: store.options.dir, signals: false });
  await store3.open();
  Context.store = store3;
  const third = new RelayManager();
  third.run();
  assert.equal(third.getTaskCount(), 1, "only the surviving task is restored");
  third.stop();
  await store3.close();
  resetContext();
});

test("recording metadata lifecycle: recording -> done, persisted with size and duration", async () => {
  resetContext();
  const recordPath = fs.mkdtempSync(path.join(os.tmpdir(), "nms-records-"));
  Context.config = { record: { path: recordPath } };
  const store = await openStore();

  const recordServer = new NodeRecordServer();
  recordServer.run();

  const publisher = {
    id: "pub-1",
    ip: "9.9.9.9",
    isPublisher: true,
    protocol: "rtmp",
    streamApp: "live",
    streamName: "test",
    streamPath: "/live/test",
    streamQuery: {},
    createTime: Date.now(),
    endTime: 0,
    inBytes: 0,
    outBytes: 0
  };
  Context.eventEmitter.emit("postPublish", publisher);
  await sleep(100); // let the write stream open the file

  const records = store.collection("records");
  let doc = records.findOne({ status: "recording" });
  assert.ok(doc, "recording doc created on postRecord");
  assert.equal(doc.streamPath, "/live/test");
  assert.ok(doc.filePath.endsWith(".flv"));
  assert.ok(fs.existsSync(doc.filePath), "record file created");

  await sleep(20);
  publisher.endTime = Date.now();
  Context.eventEmitter.emit("donePublish", publisher);

  doc = records.get(doc.id);
  assert.equal(doc.status, "done");
  assert.ok(doc.endTime >= doc.startTime);
  assert.equal(typeof doc.size, "number");

  // second publish cycle on the same path must not corrupt the first record
  const publisher2 = { ...publisher, id: "pub-2" };
  Context.eventEmitter.emit("postPublish", publisher2);
  Context.eventEmitter.emit("donePublish", publisher2);
  assert.equal(records.count(), 2);
  for (const entry of records.all()) {
    assert.equal(entry.status, "done");
  }

  await store.flush();
  await store.close();

  const reopened = new LightweightStore({ dir: store.options.dir, signals: false });
  await reopened.open();
  assert.equal(reopened.collection("records").count(), 2);
  await reopened.close();
  resetContext();
});

test("history records publishers only; plays accumulate as per-stream playCount", async () => {
  resetContext();
  Context.config = { store: { maxHistory: 5 } };
  const store = await openStore();

  const historyServer = new NodeHistoryServer();
  historyServer.run();

  const base = {
    ip: "1.2.3.4",
    protocol: "rtmp",
    streamApp: "live",
    streamName: "a",
    streamPath: "/live/a",
    createTime: Date.now() - 60000,
    endTime: Date.now(),
    inBytes: 100,
    outBytes: 200
  };

  // plays do not create history rows, they bump the stream's counter
  Context.eventEmitter.emit("postPlay", { ...base, id: "p1" });
  Context.eventEmitter.emit("postPlay", { ...base, id: "p2", protocol: "flv" });
  Context.eventEmitter.emit("postPlay", { ...base, id: "internal", ip: "" }); // record/relay: ignored

  const history = store.collection("stream_history");
  assert.equal(history.count(), 0, "plays are not stored as history rows");
  assert.equal(store.collection("play_stats").get("/live/a").count, 2);

  // first publish entry snapshots the cumulative play count
  Context.eventEmitter.emit("donePublish", { ...base, id: "s1", isPublisher: true });
  const entry = history.get("s1");
  assert.equal(entry.playCount, 2);
  assert.equal(entry.duration, 60000);

  // plays between publishes keep accumulating; relay pulls (ip "") are not recorded
  Context.eventEmitter.emit("postPlay", { ...base, id: "p3" });
  Context.eventEmitter.emit("donePublish", { ...base, id: "relay", ip: "" });
  Context.eventEmitter.emit("donePublish", { ...base, id: "s2", isPublisher: true });
  assert.equal(history.count(), 2);
  assert.equal(history.get("s2").playCount, 3);

  // cap applies to publisher entries only
  for (let i = 0; i < 10; i++) {
    Context.eventEmitter.emit("donePublish", { ...base, id: `bulk-${i}`, isPublisher: true });
  }
  assert.equal(history.count(), 5);

  // the counter persists across restarts
  historyServer.stop();
  await store.close();
  const store2 = new LightweightStore({ dir: store.options.dir, signals: false });
  await store2.open();
  Context.store = store2;
  const server2 = new NodeHistoryServer();
  server2.run();
  Context.eventEmitter.emit("postPlay", { ...base, id: "p4" });
  assert.equal(store2.collection("play_stats").get("/live/a").count, 4);
  server2.stop();
  await store2.close();
  resetContext();
});

/**
 * Minimal express-like response capture.
 * @returns {{statusCode: number, body: object | null, res: object}}
 */
function mockRes() {
  const state = { statusCode: 200, body: null };
  const res = {
    status(code) {
      state.statusCode = code;
      return res;
    },
    json(body) {
      state.body = body;
      return res;
    }
  };
  return { state, res };
}

test("records and history API handlers serve the store data", async () => {
  resetContext();
  Context.config = { record: { path: "/tmp/nms-records-api" } };
  const store = await openStore();
  const records = store.collection("records");
  records.set("rec-1", {
    streamPath: "/live/a", app: "live", name: "a", filePath: "/tmp/nms-records-api/live/a/1.flv",
    startTime: 2000, endTime: 9000, duration: 7000, size: 12345, status: "done"
  });
  records.set("rec-2", {
    streamPath: "/live/b", app: "live", name: "b", filePath: "/tmp/nms-records-api/live/b/2.flv",
    startTime: 5000, endTime: 0, duration: 0, size: 0, status: "recording"
  });
  records.set("rec-evil", {
    streamPath: "/live/c", app: "live", name: "c", filePath: "/etc/hostname",
    startTime: 1000, endTime: 2000, duration: 1000, size: 1, status: "done"
  });
  const history = store.collection("stream_history");
  history.set("h1", { id: "h1", streamPath: "/live/a", ip: "1.1.1.1", startTime: 1, protocol: "rtmp", playCount: 7 });
  history.set("h2", { id: "h2", streamPath: "/live/a", ip: "2.2.2.2", startTime: 2, protocol: "rtmp", playCount: 9 });
  store.collection("play_stats").set("/live/a", { count: 9 });

  // list: newest first, filters, pagination
  let mock = mockRes();
  RecordsHandler.listRecords({ query: {} }, mock.res);
  assert.equal(mock.state.body.data.items[0].id, "rec-2"); // startTime desc
  assert.equal(mock.state.body.data.count, 3);
  assert.equal(mock.state.body.data.totalSize, 12346); // 12345 + 1 (rec-evil)

  mock = mockRes();
  RecordsHandler.listRecords({ query: { status: "done", page: "1", pageSize: "1" } }, mock.res);
  assert.equal(mock.state.body.data.count, 2);
  assert.equal(mock.state.body.data.items.length, 1);
  assert.equal(mock.state.body.data.items[0].id, "rec-1");

  // get one + 404
  mock = mockRes();
  RecordsHandler.getRecord({ params: { id: "rec-1" } }, mock.res);
  assert.equal(mock.state.body.data.size, 12345);
  assert.equal(mock.state.body.data.filePath.includes("/tmp/nms-records-api/"), true);
  mock = mockRes();
  RecordsHandler.getRecord({ params: { id: "nope" } }, mock.res);
  assert.equal(mock.state.statusCode, 404);

  // delete: recording in progress is protected
  mock = mockRes();
  RecordsHandler.deleteRecord({ params: { id: "rec-2" }, query: {} }, mock.res);
  assert.equal(mock.state.statusCode, 409);

  // delete: refuses files outside the record path
  mock = mockRes();
  RecordsHandler.deleteRecord({ params: { id: "rec-evil" }, query: { file: "true" } }, mock.res);
  assert.equal(mock.state.statusCode, 400);
  assert.equal(records.count(), 3, "rejected delete keeps the metadata");

  // delete: inside the record root tolerates a missing file
  mock = mockRes();
  RecordsHandler.deleteRecord({ params: { id: "rec-1" }, query: { file: "true" } }, mock.res);
  assert.equal(mock.state.body.success, true);
  assert.equal(mock.state.body.fileDeleted, true);
  assert.equal(records.count(), 2);

  // history list (publisher entries with playCount) + deleteMany resets play stats
  mock = mockRes();
  HistoryHandler.listHistory({ query: {} }, mock.res);
  assert.equal(mock.state.body.data.count, 2);
  assert.equal(mock.state.body.data.items[0].id, "h2"); // startTime desc
  assert.equal(mock.state.body.data.items[0].playCount, 9);

  mock = mockRes();
  HistoryHandler.listHistory({ query: { streamPath: "/live/a", page: "1", pageSize: "1" } }, mock.res);
  assert.equal(mock.state.body.data.count, 2);
  assert.equal(mock.state.body.data.items.length, 1);

  mock = mockRes();
  HistoryHandler.deleteHistory({ query: { streamPath: "/live/a" } }, mock.res);
  assert.ok(mock.state.body.message.includes("Removed 2"));
  assert.equal(history.count(), 0);
  assert.equal(store.collection("play_stats").count(), 0, "play counter reset with the history");

  await store.close();
  resetContext();
});

test("API handlers report 503 when the store is unavailable", async () => {
  resetContext();
  Context.store = null;
  let mock = mockRes();
  RecordsHandler.listRecords({ query: {} }, mock.res);
  assert.equal(mock.state.statusCode, 503);
  mock = mockRes();
  HistoryHandler.listHistory({ query: {} }, mock.res);
  assert.equal(mock.state.statusCode, 503);
  resetContext();
});
