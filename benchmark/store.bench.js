// @ts-check
//
//  Created by Chen Mingliang on 26/08/23.
//  illuspas@msn.com
//  Copyright (c) 2026 NodeMedia. All rights reserved.
//
//
//  Run with: node benchmark/store.bench.js [quick]

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const LightweightStore = require("../src/store/lightweight_store.js");

const DOC_SIZE_BYTES = 150; // id + value + timestamp + ~100 chars payload (same as reference bench)
const quick = process.argv.includes("quick");

/**
 * @typedef {object} BenchResult
 * @property {string} label - Scenario label.
 * @property {string} operation - Operation kind (write/read/mixed).
 * @property {number} count - Number of documents.
 * @property {number} durationMs - Wall time in ms.
 * @property {number} docsPerSecond - Throughput.
 * @property {number} throughputMBps - Payload throughput.
 * @property {number} fileWrites - Disk writes observed.
 * @property {number} memoryUsedMB - Heap delta in MB.
 */

/**
 * Make benchmark documents with the same shape as the reference benchmark.
 * @param {number} count
 * @returns {object[]}
 */
function makeDocs(count) {
  return Array.from({ length: count }, (_, i) => ({
    value: i,
    timestamp: Date.now(),
    data: `benchmark-data-${i}-${"x".repeat(100)}`
  }));
}

/**
 * @param {string} label
 * @param {string} operation
 * @param {number} count
 * @param {number} durationMs
 * @param {number} fileWrites
 * @param {number} memBefore
 * @returns {BenchResult}
 */
function result(label, operation, count, durationMs, fileWrites, memBefore) {
  const memoryUsedMB = (process.memoryUsage().heapUsed - memBefore) / (1024 * 1024);
  return {
    label,
    operation,
    count,
    durationMs: Math.round(durationMs),
    docsPerSecond: Math.round((count / durationMs) * 1000),
    throughputMBps: Math.round((count * DOC_SIZE_BYTES / 1024 / 1024) / (durationMs / 1000) * 100) / 100,
    fileWrites,
    memoryUsedMB: Math.round(memoryUsedMB * 100) / 100
  };
}

/**
 * @param {BenchResult} r
 * @returns {void}
 */
function print(r) {
  const speed = `${r.docsPerSecond.toLocaleString()} docs/s | ${r.throughputMBps} MB/s`;
  console.log(`  ${r.label.padEnd(34)} ${String(r.count).padStart(8)} ops  ${speed.padEnd(28)} diskWrites=${r.fileWrites}  mem=${r.memoryUsedMB}MB`);
}

/**
 * Write benchmark: bulk insert + final flush (same shape as reference insertMany).
 * @param {string} label
 * @param {number} count
 * @param {object} storeOptions
 * @returns {Promise<BenchResult>}
 */
async function benchWrite(label, count, storeOptions) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nms-bench-"));
  const store = new LightweightStore({ dir, signals: false, ...storeOptions });
  let fileWrites = 0;
  store.on("write", () => fileWrites++);
  await store.open();
  const collection = store.collection("benchmark");
  const docs = makeDocs(count);

  const memBefore = process.memoryUsage().heapUsed;
  const startedAt = performance.now();
  collection.insertMany(docs);
  await store.flush();
  const durationMs = performance.now() - startedAt;

  if (collection.count() !== count) {
    throw new Error(`integrity check failed: ${collection.count()} != ${count}`);
  }
  const r = result(label, "write", count, durationMs, fileWrites, memBefore);
  await store.close();
  fs.rmSync(dir, { recursive: true, force: true });
  return r;
}

/**
 * Read benchmark: find with a range filter over the whole collection.
 * @param {string} label
 * @param {number} count
 * @param {object} storeOptions
 * @returns {Promise<BenchResult>}
 */
async function benchRead(label, count, storeOptions) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nms-bench-"));
  const store = new LightweightStore({ dir, signals: false, ...storeOptions });
  await store.open();
  const collection = store.collection("benchmark");
  collection.insertMany(makeDocs(count));
  await store.flush();

  const memBefore = process.memoryUsage().heapUsed;
  const startedAt = performance.now();
  const results = collection.find({ value: { $gte: 0 } });
  const durationMs = performance.now() - startedAt;
  if (results.length !== count) {
    throw new Error(`read check failed: ${results.length} != ${count}`);
  }
  const r = result(label, "read", count, durationMs, 0, memBefore);
  await store.close();
  fs.rmSync(dir, { recursive: true, force: true });
  return r;
}

/**
 * Mixed benchmark: interleaved point reads and writes with a short flush
 * interval — the workload where read-flush designs fall apart.
 * @param {string} label
 * @param {number} count
 * @param {object} storeOptions
 * @returns {Promise<BenchResult>}
 */
async function benchMixed(label, count, storeOptions) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nms-bench-"));
  const store = new LightweightStore({
    dir, signals: false, flushInterval: 50, maxOps: 5000, ...storeOptions
  });
  let fileWrites = 0;
  store.on("write", () => fileWrites++);
  await store.open();
  const collection = store.collection("benchmark");
  const docs = makeDocs(count);

  const memBefore = process.memoryUsage().heapUsed;
  const startedAt = performance.now();
  for (let i = 0; i < count; i++) {
    const stored = collection.insert(docs[i]);
    const fetched = collection.get(stored.id);
    if (fetched === null || fetched.value !== i) {
      throw new Error("read-your-writes violated");
    }
    if (i % 2500 === 0) {
      collection.find({ value: { $gte: 0 } });
    }
  }
  await store.flush();
  const durationMs = performance.now() - startedAt;

  const r = result(label, "mixed 1:1", count, durationMs, fileWrites, memBefore);
  await store.close();
  fs.rmSync(dir, { recursive: true, force: true });
  return r;
}

/**
 * IO-merging check: 10k sequential mutations must collapse into a handful of
 * disk writes (acceptance: disk writes <= number of flush windows).
 * @returns {Promise<BenchResult>}
 */
async function benchMerge() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nms-bench-"));
  const store = new LightweightStore({ dir, signals: false, flushInterval: 200, maxOps: 1000 });
  let fileWrites = 0;
  store.on("write", () => fileWrites++);
  await store.open();
  const collection = store.collection("benchmark");

  const memBefore = process.memoryUsage().heapUsed;
  const startedAt = performance.now();
  const MUTATIONS = 10000;
  for (let i = 0; i < MUTATIONS; i++) {
    collection.set(`key-${i}`, { value: i, data: "x".repeat(100) });
  }
  await store.flush();
  const durationMs = performance.now() - startedAt;

  const r = result("io-merge 10k sets", "write", MUTATIONS, durationMs, fileWrites, memBefore);
  await store.close();
  fs.rmSync(dir, { recursive: true, force: true });
  return r;
}

/**
 * @returns {void}
 */
function settleHeap() {
  global.gc?.();
}

/**
 * @returns {Promise<void>}
 */
async function main() {
  console.log("\n🚀 LightweightStore benchmark (node " + process.version + ")\n");
  const writeCounts = quick ? [10000, 100000] : [1000, 10000, 100000, 500000];
  const readCounts = quick ? [100000] : [100000, 500000];

  console.log("📝 WRITE (insertMany + flush)");
  for (const count of writeCounts) {
    settleHeap();
    print(await benchWrite("single file", count, {}));
    settleHeap();
    print(await benchWrite("16 partitions", count, { partitions: 16 }));
    settleHeap();
    print(await benchWrite("16 partitions + fsync", count, { partitions: 16, durability: "fsync" }));
    console.log("");
  }

  console.log("📖 READ (find $gte over all docs)");
  for (const count of readCounts) {
    settleHeap();
    print(await benchRead("single file", count, {}));
    settleHeap();
    print(await benchRead("16 partitions", count, { partitions: 16 }));
    console.log("");
  }

  console.log("🔀 MIXED (1:1 insert/get + periodic find, flushInterval=50ms)");
  print(await benchMixed("single file", 50000, {}));
  print(await benchMixed("16 partitions", 50000, { partitions: 16 }));
  console.log("");

  console.log("💾 IO MERGE (10k mutations, flushInterval=200ms, maxOps=1000)");
  const merged = await benchMerge();
  print(merged);
  console.log(`   → ${merged.count} mutations produced ${merged.fileWrites} disk writes ` +
    `(amplification 1:${Math.round(merged.count / merged.fileWrites)})`);
  console.log("");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
