// @ts-check
//
//  Created by Chen Mingliang on 26/08/24.
//  illuspas@msn.com
//  Copyright (c) 2026 NodeMedia. All rights reserved.
//
//
//  Partition comparison benchmark: 100k frequent inserts, one by one, with
//  periodic flushes. Each flush rewrites the dirty partition files in full,
//  so total IO = sum over flush windows of (docs in dirty partitions).
//  partitions=1 rewrites every doc on every flush; partitions=16 rewrites
//  only the ~1/16 of docs that landed in dirty shards.
//
//  Run with: node benchmark/store.partitions.bench.js [docs=100000]

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const LightweightStore = require("../src/store/lightweight_store.js");

const DOC_COUNT = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 100000);
const DOC_SIZE_BYTES = 150;

/**
 * @typedef {object} BenchResult
 * @property {string} label - Scenario label.
 * @property {number} flushes - Flush windows observed.
 * @property {number} fileWrites - Partition files written.
 * @property {number} bytesWritten - Serialized bytes pushed to disk (sum over writes).
 * @property {number} durationMs - Wall time in ms.
 * @property {number} docsPerSecond - Insert throughput.
 * @property {number} ioAmplification - bytesWritten / (DOC_COUNT * DOC_SIZE_BYTES).
 * @property {number} memoryUsedMB - Heap delta in MB.
 */

/**
 * @param {number} i
 * @returns {object}
 */
function makeDoc(i) {
  return { value: i, timestamp: Date.now(), data: `bench-${i}-${"x".repeat(100)}` };
}

/**
 * Frequent-insert benchmark: insert docs one by one while the auto-flush
 * scheduler (flushInterval/maxOps) fires in the background, forcing repeated
 * full rewrites of dirty partition files.
 * @param {string} label
 * @param {number} partitions
 * @returns {Promise<BenchResult>}
 */
async function benchFrequentInsert(label, partitions) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nms-bench-p-"));
  const store = new LightweightStore({
    dir,
    signals: false,
    partitions,
    flushInterval: 50,
    maxOps: 2000
  });
  /** @type {Map<string, number>} */
  const writeBytes = new Map();
  let flushes = 0;
  store.on("write", info => {
    const key = info.file ?? "unknown";
    writeBytes.set(key, (writeBytes.get(key) ?? 0) + (info.bytes ?? info.size ?? 0));
  });
  store.on("flush", () => flushes++);
  await store.open();
  const collection = store.collection("bench");

  const memBefore = process.memoryUsage().heapUsed;
  const startedAt = performance.now();
  // Rhythmic inserts with a small pause between batches so the auto-flush
  // scheduler fires repeatedly mid-run. A tight synchronous loop would starve
  // the event loop and collapse everything into one final flush.
  const BATCH = 500;
  for (let i = 0; i < DOC_COUNT; i++) {
    collection.insert(makeDoc(i));
    if (i % BATCH === BATCH - 1) {
      await new Promise(resolve => setTimeout(resolve, 5));
    }
  }
  await store.flush();
  const durationMs = performance.now() - startedAt;

  if (collection.count() !== DOC_COUNT) {
    throw new Error(`integrity check failed: ${collection.count()} != ${DOC_COUNT}`);
  }
  const bytesWritten = Array.from(writeBytes.values()).reduce((a, b) => a + b, 0);
  const fileWrites = writeBytes.size === 0 ? 0 : Array.from(writeBytes.keys()).length;
  const r = {
    label,
    flushes,
    fileWrites,
    bytesWritten,
    durationMs: Math.round(durationMs),
    docsPerSecond: Math.round((DOC_COUNT / durationMs) * 1000),
    ioAmplification: Math.round((bytesWritten / (DOC_COUNT * DOC_SIZE_BYTES)) * 10) / 10,
    memoryUsedMB: Math.round(((process.memoryUsage().heapUsed - memBefore) / 1048576) * 100) / 100
  };
  await store.close();
  fs.rmSync(dir, { recursive: true, force: true });
  return r;
}

/**
 * @param {BenchResult} r
 * @returns {void}
 */
function print(r) {
  const mb = (r.bytesWritten / 1048576).toFixed(1);
  console.log(`  ${r.label.padEnd(20)} ${r.docsPerSecond.toLocaleString().padStart(10)} docs/s` +
    `  ${r.durationMs}ms  flushes=${r.flushes}  files=${r.fileWrites}` +
    `  io=${mb}MB (x${r.ioAmplification})  mem=${r.memoryUsedMB}MB`);
}

/**
 * @returns {Promise<void>}
 */
async function main() {
  console.log(`\n🚀 Partition comparison: ${DOC_COUNT.toLocaleString()} frequent inserts ` +
    `(flushInterval=50ms, maxOps=2000, node ${process.version})\n`);

  global.gc?.();

  console.log("📝 insert one-by-one with background auto-flush");
  const p1 = await benchFrequentInsert("partitions=1", 1);
  print(p1);
  global.gc?.();
  const p16 = await benchFrequentInsert("partitions=16", 16);
  print(p16);

  console.log("\n📊 SUMMARY");
  const speedup = p1.durationMs / p16.durationMs;
  const ioReduction = p1.bytesWritten > 0 ? (1 - p16.bytesWritten / p1.bytesWritten) * 100 : 0;
  console.log(`  wall time  : ${p1.durationMs}ms vs ${p16.durationMs}ms  (partitions=16 is ${speedup.toFixed(2)}x)`);
  console.log(`  disk IO    : ${(p1.bytesWritten / 1048576).toFixed(1)}MB vs ${(p16.bytesWritten / 1048576).toFixed(1)}MB  (${ioReduction.toFixed(0)}% less with partitions=16)`);
  console.log("\n  Note: each flush rewrites dirty partition files in full. With partitions=1\n" +
    "  every flush rewrites ALL docs; with partitions=16 only docs in dirty shards\n" +
    "  (~maxOps docs spread over shards) get rewritten.\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
