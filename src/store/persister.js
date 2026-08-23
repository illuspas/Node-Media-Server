// @ts-check
//
//  Created by Chen Mingliang on 26/08/23.
//  illuspas@msn.com
//  Copyright (c) 2026 NodeMedia. All rights reserved.
//
//  Disk layout and atomic-write primitives for LightweightStore.
//  A collection is stored either as a single `<name>.json` file or, when
//  partitioned, as `<name>_p000.json` ... `<name>_pNNN.json` (FNV-1a hash
//  of the document id). Every write is atomic: temp file + rename, with
//  optional fsync of file and directory.

const fsp = require("node:fs/promises");
const fsSync = require("node:fs");
const path = require("node:path");

/**
 * @param {string} value
 * @returns {number}
 */
function fnv1a(value) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Compute the partition file index for a document id.
 * @param {string} id - Document id.
 * @param {number} partitions - Partition count (>= 1).
 * @returns {number} Partition index in [0, partitions).
 */
function partitionIndexForId(id, partitions) {
  if (partitions <= 1) {
    return 0;
  }
  return fnv1a(id) % partitions;
}

/**
 * Build the file name for a collection partition.
 * @param {string} name - Collection name.
 * @param {number} index - Partition index.
 * @param {number} partitions - Partition count.
 * @returns {string} File name (not full path).
 */
function collectionFileName(name, index, partitions) {
  if (partitions <= 1) {
    return `${name}.json`;
  }
  return `${name}_p${String(index).padStart(3, "0")}.json`;
}

/**
 * Decide whether a directory entry belongs to a collection (single or partitioned layout).
 * @param {string} fileName - Directory entry name.
 * @param {string} name - Collection name.
 * @returns {boolean}
 */
function isCollectionFile(fileName, name) {
  if (fileName === `${name}.json`) {
    return true;
  }
  const prefix = `${name}_p`;
  return fileName.startsWith(prefix) && /^\d{3}\.json$/.test(fileName.slice(prefix.length));
}

/**
 * Create the data directory if missing.
 * @param {string} dir
 * @returns {Promise<void>}
 */
async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true });
}

/**
 * Remove leftover `.tmp` files from a previous crash.
 * @param {string} dir
 * @returns {Promise<string[]>} Removed file names.
 */
async function cleanupTmpFiles(dir) {
  const removed = [];
  let entries = [];
  try {
    entries = await fsp.readdir(dir);
  } catch {
    return removed;
  }
  for (const entry of entries) {
    if (entry.endsWith(".tmp")) {
      await fsp.unlink(path.join(dir, entry)).catch(() => { });
      removed.push(entry);
    }
  }
  return removed;
}

/**
 * Load one collection partition file from disk.
 * A corrupted file is moved aside to `<file>.corrupt` and reported, never thrown:
 * a media server should boot with partial data rather than die on one bad file.
 * @param {string} file - Full file path.
 * @returns {Promise<{docs: object[], corrupted: boolean}>}
 */
async function loadFile(file) {
  let raw;
  try {
    raw = await fsp.readFile(file, "utf8");
  } catch {
    return { docs: [], corrupted: false };
  }
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new TypeError("expected a JSON array");
    }
    return { docs: parsed, corrupted: false };
  } catch {
    await fsp.rename(file, `${file}.corrupt`).catch(() => { });
    return { docs: [], corrupted: true };
  }
}

/**
 * Atomically replace a file's content (temp + rename, optional fsync).
 * At any crash point the target is either the old or the new complete file.
 * @param {string} file - Target file path.
 * @param {string} content - Serialized content.
 * @param {boolean} fsyncFile - fsync temp file before rename and directory after.
 * @returns {Promise<void>}
 */
async function writeAtomic(file, content, fsyncFile) {
  const tmp = `${file}.tmp`;
  const handle = await fsp.open(tmp, "w");
  try {
    await handle.writeFile(content, "utf8");
    if (fsyncFile) {
      await handle.sync();
    }
  } finally {
    await handle.close();
  }
  await fsp.rename(tmp, file);
  if (fsyncFile) {
    const dirHandle = await fsp.open(path.dirname(file), "r");
    try {
      await dirHandle.sync();
    } finally {
      await dirHandle.close();
    }
  }
}

/**
 * Synchronous atomic write, used only by the process-exit safety net.
 * @param {string} file - Target file path.
 * @param {string} content - Serialized content.
 * @returns {void}
 */
function writeAtomicSync(file, content) {
  const tmp = `${file}.tmp`;
  fsSync.writeFileSync(tmp, content, "utf8");
  fsSync.renameSync(tmp, file);
}

/**
 * Run async workers over items with bounded concurrency.
 * @template T
 * @param {T[]} items
 * @param {number} limit - Max concurrent workers (>= 1).
 * @param {(item: T) => Promise<void>} worker
 * @returns {Promise<void>}
 */
async function parallelLimit(items, limit, worker) {
  const size = Math.max(1, limit);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      await worker(item);
    }
  });
  await Promise.all(runners);
}

/** Directories locked by this process (guards accidental double-open too). */
const lockedDirs = new Set();

/**
 * Acquire a best-effort single-process lock for a data directory.
 * @param {string} dir - Data directory.
 * @returns {Promise<void>} Rejects when another live process holds the lock.
 */
async function acquireLock(dir) {
  if (lockedDirs.has(dir)) {
    throw new Error(`data dir ${dir} is already opened by this process`);
  }
  const lockPath = path.join(dir, ".lock");
  const pid = String(process.pid);
  try {
    await fsp.writeFile(lockPath, pid, { flag: "wx" });
    lockedDirs.add(dir);
    return;
  } catch (error) {
    if (error.code !== "EEXIST") {
      throw error;
    }
  }
  let holder = "";
  try {
    holder = (await fsp.readFile(lockPath, "utf8")).trim();
  } catch {
    holder = "";
  }
  let alive = false;
  try {
    if (holder) {
      process.kill(Number(holder), 0);
      alive = true;
    }
  } catch (error) {
    alive = error.code === "EPERM";
  }
  if (alive && holder !== pid) {
    throw new Error(`data dir ${dir} is locked by live process pid ${holder}`);
  }
  await fsp.writeFile(lockPath, pid, { flag: "w" });
  lockedDirs.add(dir);
}

/**
 * Release the lock if it still belongs to this process.
 * @param {string} dir - Data directory.
 * @returns {Promise<void>}
 */
async function releaseLock(dir) {
  lockedDirs.delete(dir);
  const lockPath = path.join(dir, ".lock");
  try {
    const holder = (await fsp.readFile(lockPath, "utf8")).trim();
    if (holder === String(process.pid)) {
      await fsp.unlink(lockPath);
    }
  } catch {
    // missing or unreadable lock — nothing to release
  }
}

module.exports = {
  partitionIndexForId,
  collectionFileName,
  isCollectionFile,
  ensureDir,
  cleanupTmpFiles,
  loadFile,
  writeAtomic,
  writeAtomicSync,
  parallelLimit,
  acquireLock,
  releaseLock
};
