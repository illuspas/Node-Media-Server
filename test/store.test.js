// @ts-check
//
//  Created by Chen Mingliang on 26/08/23.
//  illuspas@msn.com
//  Copyright (c) 2026 NodeMedia. All rights reserved.
//

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const LightweightStore = require("../src/store/lightweight_store.js");
const { generateId, isValid24Hex } = require("../src/store/id.js");
const { matchesFilter, sortDocs } = require("../src/store/query.js");

/**
 * Create a fresh temp data dir.
 * @returns {string}
 */
function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "nms-store-"));
}

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Open a store with test-friendly defaults (no signal handlers).
 * @param {string} dir
 * @param {object} [options]
 * @returns {Promise<import("../src/store/lightweight_store.js")>}
 */
async function openStore(dir, options = {}) {
  const store = new LightweightStore({ dir, signals: false, ...options });
  await store.open();
  return store;
}

test("generateId produces unique 24-char hex ids", () => {
  const seen = new Set();
  for (let i = 0; i < 1000; i++) {
    const id = generateId();
    assert.match(id, /^[0-9a-f]{24}$/);
    assert.ok(isValid24Hex(id));
    assert.ok(!seen.has(id));
    seen.add(id);
  }
  assert.ok(!isValid24Hex("xyz"));
  assert.ok(!isValid24Hex("0".repeat(23)));
});

test("query operators match documents", () => {
  const docs = [
    { id: "1", name: "alice", age: 30, tags: ["a", "b"], nested: { city: "sz" } },
    { id: "2", name: "bob", age: 40, tags: ["b"], nested: { city: "sh" } },
    { id: "3", name: "carol", age: null, tags: [] }
  ];
  const pick = (filter) => docs.filter((doc) => matchesFilter(doc, filter)).map((doc) => doc.id);

  assert.deepEqual(pick({ name: "alice" }), ["1"]);
  assert.deepEqual(pick({ age: { $gte: 30, $lte: 35 } }), ["1"]);
  assert.deepEqual(pick({ age: { $gt: 30 } }), ["2"]);
  assert.deepEqual(pick({ age: { $ne: 30 } }), ["2", "3"]);
  assert.deepEqual(pick({ name: { $in: ["alice", "bob"] } }), ["1", "2"]);
  assert.deepEqual(pick({ name: { $nin: ["alice", "bob"] } }), ["3"]);
  assert.deepEqual(pick({ age: { $exists: true } }), ["1", "2", "3"]);
  assert.deepEqual(pick({ missing: { $exists: false } }), ["1", "2", "3"]);
  assert.deepEqual(pick({ name: { $regex: "^a" } }), ["1"]);
  assert.deepEqual(pick({ name: { $regex: "AROL", $options: "i" } }), ["3"]);
  assert.deepEqual(pick({ tags: { $contains: "a" } }), ["1"]);
  assert.deepEqual(pick({ "nested.city": "sz" }), ["1"]);
  assert.deepEqual(pick({ $or: [{ name: "alice" }, { age: { $gte: 40 } }] }), ["1", "2"]);
  assert.deepEqual(pick({ $and: [{ age: { $gte: 30 } }, { name: { $ne: "alice" } }] }), ["2"]);
  assert.deepEqual(pick({ $not: { name: "alice" } }), ["2", "3"]);
  assert.deepEqual(pick({ $nor: [{ name: "alice" }, { name: "bob" }] }), ["3"]);
  assert.deepEqual(pick({}), ["1", "2", "3"]);

  assert.throws(() => matchesFilter(docs[0], { age: { $bogus: 1 } }), /Unsupported query operator/);
});

test("sortDocs orders by field and direction with skip/limit handled by caller", () => {
  const docs = [
    { id: "1", n: 3 },
    { id: "2", n: 1 },
    { id: "3", n: 2 },
    { id: "4", n: null }
  ];
  const ascending = sortDocs([...docs], { n: 1 }).map((d) => d.id);
  assert.deepEqual(ascending, ["4", "2", "3", "1"]);
  const descending = sortDocs([...docs], [["n", -1]]).map((d) => d.id);
  assert.deepEqual(descending, ["1", "3", "2", "4"]);
});

test("collection CRUD basics", async () => {
  const store = await openStore(tmpDir());
  const users = store.collection("users");

  const alice = users.insert({ name: "alice" });
  assert.match(alice.id, /^[0-9a-f]{24}$/);
  assert.equal(users.get(alice.id).name, "alice");
  assert.equal(users.get("missing"), null);

  const named = users.insert({ id: "custom-id", name: "bob" });
  assert.equal(named.id, "custom-id");
  assert.throws(() => users.insert({ id: "custom-id" }), /duplicate id/);

  const updated = users.update("custom-id", { age: 1, id: "hacked" });
  assert.equal(updated.age, 1);
  assert.equal(updated.id, "custom-id"); // id immutable
  assert.equal(users.update("nope", {}), null);

  users.set(alice.id, { name: "alice2" });
  assert.equal(users.get(alice.id).name, "alice2");
  users.set("brand-new", { name: "carol" });
  assert.equal(users.get("brand-new").name, "carol");

  assert.equal(users.delete("brand-new"), true);
  assert.equal(users.delete("brand-new"), false);
  assert.equal(users.count(), 2);

  assert.throws(() => store.collection("bad/name"), /invalid collection name/);
  await store.close();
});

test("insert copies the input; caller mutations do not leak into the store", async () => {
  const store = await openStore(tmpDir());
  const users = store.collection("users");
  const input = { name: "alice" };
  const doc = users.insert(input);
  assert.notEqual(doc, input); // the store keeps its own copy
  input.name = "bob";
  assert.equal(users.get(doc.id).name, "alice");
  await store.close();
});

test("maxDocs evicts the oldest inserted documents", async () => {
  const store = await openStore(tmpDir());
  const events = store.collection("events", { maxDocs: 3 });
  events.insertMany([{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }, { id: "e" }]);
  assert.deepEqual(events.all().map((doc) => doc.id), ["c", "d", "e"]);
  events.insert({ id: "f" });
  assert.deepEqual(events.all().map((doc) => doc.id), ["d", "e", "f"]);
  await store.close();
});

test("data persists across reopen, including deletes and clears", async () => {
  const dir = tmpDir();
  const store = await openStore(dir);
  const users = store.collection("users");
  users.insert({ id: "keep", name: "alice" });
  users.insert({ id: "drop", name: "bob" });
  users.insert({ id: "gone", name: "carol" });
  users.delete("gone");
  await store.close();

  const reopened = await openStore(dir);
  const users2 = reopened.collection("users");
  assert.equal(users2.count(), 2);
  assert.equal(users2.get("keep").name, "alice");
  assert.equal(users2.get("drop").name, "bob");

  users2.clear();
  await reopened.close();
  const reopened2 = await openStore(dir);
  assert.equal(reopened2.collection("users").count(), 0);
  await reopened2.close();
});

test("N writes within one flush window collapse into a single disk write", async () => {
  const store = await openStore(tmpDir(), { flushInterval: 150, maxOps: 100000 });
  let writeEvents = 0;
  store.on("write", () => writeEvents++);

  const users = store.collection("users");
  for (let i = 0; i < 500; i++) {
    users.set(`user-${i}`, { i });
  }
  assert.equal(writeEvents, 0); // nothing flushed yet
  await sleep(400);
  assert.equal(writeEvents, 1); // exactly one file write for 500 mutations
  assert.equal(users.count(), 500);

  // a second burst produces exactly one more write
  users.set("another", { i: -1 });
  await sleep(400);
  assert.equal(writeEvents, 2);
  await store.close();
});

test("maxOps triggers a flush before the interval elapses", async () => {
  const store = await openStore(tmpDir(), { flushInterval: 60000, maxOps: 10 });
  let writeEvents = 0;
  store.on("write", () => writeEvents++);

  const users = store.collection("users");
  for (let i = 0; i < 25; i++) {
    users.set(`u${i}`, { i });
  }
  await sleep(150);
  assert.equal(writeEvents, 1);
  await store.close();
});

test("reads are read-your-writes without any flush", async () => {
  const store = await openStore(tmpDir(), { flushInterval: 60000, maxOps: 1000000 });
  const users = store.collection("users");
  users.set("u1", { v: 1 });
  assert.equal(users.get("u1").v, 1);
  users.update("u1", { v: 2 });
  assert.equal(users.get("u1").v, 2);
  users.delete("u1");
  assert.equal(users.get("u1"), null);
  await store.close();
});

test("partitions rewrite only the partitions they hit", async () => {
  const dir = tmpDir();
  const store = await openStore(dir, { partitions: 16, flushInterval: 60000, maxOps: 1000000 });
  const files = [];
  store.on("write", (info) => files.push(path.basename(info.file)));

  const users = store.collection("users");
  const docs = users.insertMany(
    Array.from({ length: 400 }, (_, i) => ({ id: `u${i}`, i }))
  );
  await store.flush();
  assert.equal(files.length, 16);
  files.length = 0;

  // touch one document: only its partition file is rewritten
  const touched = docs[7];
  users.update(touched.id, { i: -1 });
  await store.flush();
  assert.equal(files.length, 1);

  // reopening merges all partitions back together
  await store.close();
  const reopened = await openStore(dir, { partitions: 16, signals: false });
  const users2 = reopened.collection("users");
  assert.equal(users2.count(), 400);
  assert.equal(users2.get(touched.id).i, -1);
  await reopened.close();
});

test("no tmp files remain after flush, and stale tmp files are cleaned on open", async () => {
  const dir = tmpDir();
  const store = await openStore(dir);
  const users = store.collection("users");
  users.insert({ id: "u1" });
  await store.flush();
  assert.deepEqual(fs.readdirSync(dir).filter((f) => f.endsWith(".tmp")), []);
  await store.close();

  fs.writeFileSync(path.join(dir, "users.json.tmp"), "garbage");
  const reopened = await openStore(dir);
  assert.deepEqual(fs.readdirSync(dir).filter((f) => f.endsWith(".tmp")), []);
  assert.equal(reopened.collection("users").count(), 1);
  await reopened.close();
});

test("a corrupt collection file is moved aside instead of crashing open()", async () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, "users.json"), "{ not valid json");
  const store = await openStore(dir);
  assert.equal(store.collection("users").count(), 0);
  assert.ok(fs.existsSync(path.join(dir, "users.json.corrupt")));
  await store.close();
});

test("durability fsync mode persists data", async () => {
  const dir = tmpDir();
  const store = await openStore(dir, { durability: "fsync" });
  const users = store.collection("users");
  users.insert({ id: "u1", name: "alice" });
  await store.flush();
  const raw = JSON.parse(fs.readFileSync(path.join(dir, "users.json"), "utf8"));
  assert.equal(raw.length, 1);
  await store.close();
});

test("pretty option writes indented JSON", async () => {
  const dir = tmpDir();
  const store = await openStore(dir, { pretty: true });
  store.collection("users").insert({ id: "u1", name: "alice" });
  await store.flush();
  const raw = fs.readFileSync(path.join(dir, "users.json"), "utf8");
  assert.ok(raw.includes("\n  "));
  await store.close();
});

test("lockfile blocks a second live process on the same dir", async () => {
  const dir = tmpDir();
  const store = await openStore(dir);
  await assert.rejects(() => openStore(dir), /locked by live process|already opened/);
  await store.close();
  // after close the lock is released
  const second = await openStore(dir);
  await second.close();
});

test("concurrent interleaved set/get keeps a consistent final state", async () => {
  const store = await openStore(tmpDir(), { flushInterval: 30, maxOps: 50 });
  const counters = store.collection("counters");

  const workers = Array.from({ length: 100 }, (_, workerIndex) =>
    (async () => {
      for (let round = 0; round < 20; round++) {
        const id = `counter-${workerIndex % 10}`;
        const current = counters.get(id) ?? { id, value: 0 };
        counters.set(id, { id, value: current.value + 1 });
        assert.ok(counters.get(id).value >= 1); // read-your-writes under concurrency
      }
    })()
  );
  await Promise.all(workers);

  await store.flush();
  assert.equal(counters.count(), 10);
  let total = 0;
  for (const doc of counters.all()) {
    total += doc.value;
  }
  assert.equal(total, 2000);
  const dir = store.options.dir;
  await store.close();

  const reopened = await openStore(dir);
  let reloaded = 0;
  for (const doc of reopened.collection("counters").all()) {
    reloaded += doc.value;
  }
  assert.equal(reloaded, 2000);
  await reopened.close();
});

test("failed flush keeps data dirty and retries after the error is fixed", async () => {
  const dir = tmpDir();
  const store = await openStore(dir, { flushInterval: 50 });
  const errors = [];
  store.on("error", (error) => errors.push(error));

  const users = store.collection("users");
  users.insert({ id: "u1", name: "alice" });

  fs.chmodSync(dir, 0o500); // rename into dir now fails
  try {
    await assert.rejects(() => store.flush(), /flush wrote 0\/1 files/);
  } finally {
    fs.chmodSync(dir, 0o755);
  }
  assert.ok(errors.length >= 1);

  // dirty data survived the failure and the retry persists it
  await store.flush();
  const raw = JSON.parse(fs.readFileSync(path.join(dir, "users.json"), "utf8"));
  assert.equal(raw.length, 1);
  await store.close();
});

test("close() flushes pending data, releases the lock, and rejects later mutations", async () => {
  const dir = tmpDir();
  const store = await openStore(dir, { flushInterval: 60000, maxOps: 1000000 });
  const users = store.collection("users");
  users.insert({ id: "u1", name: "alice" });
  await store.close();

  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "users.json"), "utf8")).length, 1);
  assert.throws(() => users.insert({ id: "u2" }), /store is closed/);
  assert.throws(() => store.flush(), /store is closed/);

  // lock released: a new store can take over the dir
  const second = await openStore(dir);
  assert.equal(second.collection("users").count(), 1);
  await second.close();
});

test("store validates constructor options", () => {
  assert.throws(() => new LightweightStore({ partitions: 0 }), /partitions/);
  assert.throws(() => new LightweightStore({ durability: "wal" }), /durability/);
  const unopened = new LightweightStore({ dir: tmpDir() });
  assert.throws(() => unopened.flush(), /not open/);
});
