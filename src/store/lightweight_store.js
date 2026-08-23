// @ts-check
//
//  Created by Chen Mingliang on 26/08/23.
//  illuspas@msn.com
//  Copyright (c) 2026 NodeMedia. All rights reserved.
//
//  LightweightStore — zero-dependency JSON document store.
//
//  Design (see docs/lightweight-store.md):
//  - reads and writes hit an in-memory Map (read-your-writes, zero read IO);
//  - mutations only mark the touched collection partitions dirty;
//  - a scheduler flushes dirty partitions to disk, so N writes within one
//    window collapse into a single atomic rewrite per partition file
//    (temp + rename, optional fsync);
//  - flushes are serialized through a promise chain (no spin-lock races);
//  - process exit is covered by a synchronous writeback hook.

const { EventEmitter } = require("node:events");
const path = require("node:path");
const fsp = require("node:fs/promises");

const Collection = require("./collection.js");
const { generateId } = require("./id.js");
const {
  partitionIndexForId,
  collectionFileName,
  ensureDir,
  cleanupTmpFiles,
  loadFile,
  writeAtomic,
  writeAtomicSync,
  parallelLimit,
  acquireLock,
  releaseLock
} = require("./persister.js");

const DEFAULTS = {
  dir: "./data",
  flushInterval: 200,
  maxOps: 1000,
  pretty: false,
  durability: "none",
  partitions: 1,
  maxConcurrentIO: 4,
  signals: true,
  lock: true
};

/**
 * @typedef {object} StoreOptions
 * @property {string} [dir] Data directory, default "./data".
 * @property {number} [flushInterval] Max ms between the first dirty mark and flush, default 200.
 * @property {number} [maxOps] Mutation count that triggers an immediate flush, default 1000.
 * @property {boolean} [pretty] Pretty-print JSON files, default false.
 * @property {"none"|"fsync"} [durability] fsync file+dir on every write, default "none".
 * @property {number} [partitions] Partition files per collection, default 1.
 * @property {number} [maxConcurrentIO] Max parallel file writes during a flush, default 4.
 * @property {boolean} [signals] Flush+exit on SIGINT/SIGTERM, default true.
 * @property {boolean} [lock] Write a pid lockfile to guard multi-process use, default true.
 */

/**
 * Document store holding named collections of JSON documents.
 *
 * Events: "write" ({file, docs, bytes}) after each partition file is
 * persisted; "flush" ({files, bytes, durationMs}) after each flush round;
 * "error" (Error) when a flush fails — dirty data is kept for retry.
 * @class
 * @augments EventEmitter
 */
class LightweightStore extends EventEmitter {
  /**
   * @param {StoreOptions} [options]
   */
  constructor(options = {}) {
    super();
    // explicit undefined must not shadow defaults
    /** @type {StoreOptions & typeof DEFAULTS} */
    this.options = { ...DEFAULTS };
    for (const [key, value] of Object.entries(options)) {
      if (value !== undefined) {
        this.options[key] = value;
      }
    }
    if (this.options.partitions < 1 || !Number.isInteger(this.options.partitions)) {
      throw new TypeError("partitions must be an integer >= 1");
    }
    if (this.options.durability !== "none" && this.options.durability !== "fsync") {
      throw new TypeError(`unsupported durability: ${this.options.durability}`);
    }

    /** @type {Map<string, Collection>} */
    this._collections = new Map();
    /** @type {Map<string, Set<number>>} collection name -> dirty partition indexes */
    this._dirty = new Map();
    this._ops = 0;
    this._timer = null;
    this._retryTimer = null;
    this._flushChain = Promise.resolve();
    this._opened = false;
    this._closed = false;

    this._onExit = () => {
      if (this._closed) {
        return;
      }
      try {
        this.flushSync();
      } catch {
        // best-effort writeback while the process is dying
      }
    };
    this._onSignal = (signal) => {
      try {
        this.flushSync();
      } catch {
        // best-effort writeback while the process is dying
      }
      this._removeExitHooks();
      process.kill(process.pid, signal);
    };
  }

  /**
   * Open the data directory: clean stale tmp files, take the lock, load
   * every collection file found on disk, and install exit hooks.
   * @returns {Promise<void>}
   */
  async open() {
    if (this._opened) {
      throw new Error("store is already open");
    }
    await ensureDir(this.options.dir);
    const removed = await cleanupTmpFiles(this.options.dir);
    for (const file of removed) {
      this._safeEmitError(new Error(`removed stale tmp file ${file}`), false);
    }
    if (this.options.lock) {
      await acquireLock(this.options.dir);
    }

    let entries = [];
    try {
      entries = await fsp.readdir(this.options.dir);
    } catch {
      entries = [];
    }
    /** @type {Map<string, string[]>} */
    const filesByCollection = new Map();
    for (const entry of entries) {
      if (!entry.endsWith(".json")) {
        continue;
      }
      const name = collectionNameFromFile(entry);
      if (name === null) {
        continue;
      }
      if (!filesByCollection.has(name)) {
        filesByCollection.set(name, []);
      }
      filesByCollection.get(name).push(path.join(this.options.dir, entry));
    }

    const files = Array.from(filesByCollection.values()).flat();
    await parallelLimit(files, this.options.maxConcurrentIO, async (file) => {
      const { docs, corrupted } = await loadFile(file);
      if (corrupted) {
        this._safeEmitError(new Error(`corrupt store file moved aside: ${file}.corrupt`), false);
      }
      if (docs.length === 0) {
        return;
      }
      const name = collectionNameFromFile(path.basename(file));
      if (name === null) {
        return;
      }
      const collection = this._getOrCreateCollection(name, {});
      for (const doc of docs) {
        if (doc && typeof doc.id === "string" && !collection.docs.has(doc.id)) {
          collection.docs.set(doc.id, doc);
        } else if (doc && typeof doc.id !== "string") {
          // tolerate legacy rows without an id: give them one
          collection.docs.set(generateId(), doc);
        }
      }
    });

    this._opened = true;
    process.on("exit", this._onExit);
    if (this.options.signals) {
      process.on("SIGINT", this._onSignal);
      process.on("SIGTERM", this._onSignal);
    }
    // writes that queued while opening can be flushed now
    if (this._dirty.size > 0) {
      this._scheduleFlush();
    }
  }

  /**
   * Get (or create) a collection.
   * @param {string} name - Collection name ([A-Za-z0-9_-], <= 64 chars).
   * @param {object} [options] Collection options ({@link Collection}).
   * @returns {Collection}
   */
  collection(name, options = {}) {
    return this._getOrCreateCollection(name, options);
  }

  /**
   * Whether open() has completed successfully.
   * @returns {boolean}
   */
  get opened() {
    return this._opened;
  }

  /**
   * Names of all collections known to the store.
   * @returns {string[]}
   */
  collectionNames() {
    return Array.from(this._collections.keys());
  }

  /**
   * Flush all pending changes to disk and resolve when durable per options.
   * @returns {Promise<void>}
   */
  flush() {
    this._assertUsable();
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    const task = this._flushChain.then(() => this._drainDirty(3));
    this._flushChain = task.then(() => { }, () => { });
    return task;
  }

  /**
   * Final flush, timer shutdown, lock release. The store must not be used after.
   * @returns {Promise<void>}
   */
  async close() {
    this._assertUsable();
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    if (this._retryTimer) {
      clearTimeout(this._retryTimer);
      this._retryTimer = null;
    }
    await this.flush().catch((error) => {
      this._safeEmitError(error, true);
    });
    this._closed = true;
    this._removeExitHooks();
    if (this.options.lock) {
      await releaseLock(this.options.dir);
    }
  }

  /**
   * Synchronous writeback of all dirty partitions (process-exit safety net).
   * @returns {number} Number of files written.
   */
  flushSync() {
    const jobs = this._snapshotJobs();
    let written = 0;
    for (const job of jobs) {
      const fileName = collectionFileName(job.name, job.index, job.collection._partitions);
      const file = path.join(this.options.dir, fileName);
      writeAtomicSync(file, JSON.stringify(job.docs, null, this.options.pretty ? 2 : 0));
      job.collection.dirtyPartitions.delete(job.index);
      written++;
    }
    this._dirty.clear();
    this._ops = 0;
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    return written;
  }

  /**
   * @param {string} name
   * @param {object} options
   * @returns {Collection}
   */
  _getOrCreateCollection(name, options) {
    let collection = this._collections.get(name);
    if (!collection) {
      collection = new Collection(name, options);
      collection._partitions = this.options.partitions;
      collection.onDirty = (ids) => this._onCollectionDirty(name, ids.length);
    }
    this._collections.set(name, collection);
    return collection;
  }

  /**
   * Dirty-mark callback from collections; arms the flush scheduler.
   * @param {string} name - Collection name.
   * @param {number} opCount - Number of mutations reported.
   * @returns {void}
   */
  _onCollectionDirty(name, opCount) {
    if (this._closed) {
      throw new Error("store is closed");
    }
    let partitions = this._dirty.get(name);
    if (!partitions) {
      partitions = new Set();
      this._dirty.set(name, partitions);
    }
    const collection = this._collections.get(name);
    for (const index of collection?.dirtyPartitions ?? []) {
      partitions.add(index);
    }
    this._ops += Math.max(1, opCount);
    this._scheduleFlush();
  }

  /**
   * Arm the flush timer, or trigger an immediate flush once maxOps is reached.
   * @returns {void}
   */
  _scheduleFlush() {
    if (this._closed) {
      return;
    }
    const urgent = this._ops >= this.options.maxOps;
    if (this._timer) {
      if (!urgent) {
        return;
      }
      // promote a pending interval flush to an immediate one
      clearTimeout(this._timer);
      this._timer = null;
    }
    // a zero delay still lets the rest of the current tick batch into the same flush
    const timer = setTimeout(() => {
      this._timer = null;
      this._autoFlush();
    }, urgent ? 0 : this.options.flushInterval);
    timer.unref?.();
    this._timer = timer;
  }

  /**
   * Fire-and-forget flush used by the scheduler; retries on failure.
   * @returns {void}
   */
  _autoFlush() {
    this._timer = null;
    if (this._dirty.size === 0 || this._closed || !this._opened) {
      return;
    }
    const task = this._flushChain.then(() => this._drainDirty(1));
    this._flushChain = task.then(() => {
      this._retryTimer = null;
    }, () => {
      this._scheduleRetry();
    });
  }

  /**
   * Back off and retry a failed automatic flush.
   * @returns {void}
   */
  _scheduleRetry() {
    if (this._retryTimer || this._closed) {
      return;
    }
    const timer = setTimeout(() => {
      this._retryTimer = null;
      this._autoFlush();
    }, this.options.flushInterval * 2);
    timer.unref?.();
    this._retryTimer = timer;
  }

  /**
   * Flush rounds until nothing is dirty, bounded by attempts.
   * @param {number} attempts - Max flush rounds before giving up.
   * @returns {Promise<void>}
   */
  async _drainDirty(attempts) {
    for (let round = 0; round < attempts && this._dirty.size > 0; round++) {
      await this._runFlushOnce();
    }
    if (this._dirty.size > 0) {
      throw new Error(`flush gave up after ${attempts} rounds; ${this._dirty.size} collection(s) still dirty`);
    }
  }

  /**
   * One flush round: snapshot dirty partitions, atomically rewrite each file
   * with bounded concurrency. Failures re-mark their partitions dirty.
   * @returns {Promise<void>}
   */
  async _runFlushOnce() {
    const jobs = this._snapshotJobs();
    this._dirty.clear();
    this._ops = 0;
    if (jobs.length === 0) {
      return;
    }

    const pretty = this.options.pretty ? 2 : 0;
    const fsync = this.options.durability === "fsync";
    const startedAt = Date.now();
    let bytes = 0;
    let files = 0;
    /** @type {Error[]} */
    const errors = [];

    await parallelLimit(jobs, this.options.maxConcurrentIO, async (job) => {
      const fileName = collectionFileName(job.name, job.index, job.collection._partitions);
      const file = path.join(this.options.dir, fileName);
      const content = JSON.stringify(job.docs, null, pretty);
      try {
        await writeAtomic(file, content, fsync);
        job.collection.dirtyPartitions.delete(job.index);
        bytes += content.length;
        files++;
        this.emit("write", { file, docs: job.docs.length, bytes: content.length });
      } catch (error) {
        // keep the data marked dirty so a later flush retries it
        let partitions = this._dirty.get(job.name);
        if (!partitions) {
          partitions = new Set();
          this._dirty.set(job.name, partitions);
        }
        partitions.add(job.index);
        errors.push(/** @type {Error} */ (error));
      }
    });

    if (errors.length > 0) {
      const error = new Error(`flush wrote ${files}/${jobs.length} files: ${errors[0].message}`);
      this._safeEmitError(error, true);
      throw error;
    }
    this.emit("flush", { files, bytes, durationMs: Date.now() - startedAt });
  }

  /**
   * Snapshot the dirty partitions with their documents. Partitioned
   * collections are bucketized in a single pass (one hash per document).
   * @returns {Array<{name: string, collection: Collection, index: number, docs: object[]}>}
   */
  _snapshotJobs() {
    /** @type {Array<{name: string, collection: Collection, index: number, docs: object[]}>} */
    const jobs = [];
    for (const [name, dirtyIndexes] of this._dirty) {
      const collection = this._collections.get(name);
      if (!collection || dirtyIndexes.size === 0) {
        continue;
      }
      if (collection._partitions <= 1) {
        jobs.push({ name, collection, index: 0, docs: Array.from(collection.docs.values()) });
        continue;
      }
      /** @type {Map<number, object[]>} */
      const buckets = new Map();
      for (const doc of collection.docs.values()) {
        const index = partitionIndexForId(String(doc.id), collection._partitions);
        let bucket = buckets.get(index);
        if (!bucket) {
          bucket = [];
          buckets.set(index, bucket);
        }
        bucket.push(doc);
      }
      for (const index of dirtyIndexes) {
        jobs.push({ name, collection, index, docs: buckets.get(index) ?? [] });
      }
    }
    return jobs;
  }

  /**
   * Emit "error" without crashing when no listener is attached.
   * @param {Error} error
   * @param {boolean} serious - Serious errors fall back to console output.
   * @returns {void}
   */
  _safeEmitError(error, serious) {
    if (this.listenerCount("error") > 0) {
      this.emit("error", error);
    } else if (serious) {
      console.error("[LightweightStore]", error.message);
    }
  }

  /**
   * @returns {void}
   */
  _removeExitHooks() {
    process.removeListener("exit", this._onExit);
    process.removeListener("SIGINT", this._onSignal);
    process.removeListener("SIGTERM", this._onSignal);
  }

  /**
   * @returns {void}
   */
  _assertUsable() {
    if (!this._opened) {
      throw new Error("store is not open; call open() first");
    }
    if (this._closed) {
      throw new Error("store is closed");
    }
  }
}

/**
 * Derive the collection name from a store file name, or null.
 * @param {string} fileName - File base name such as "users.json" or "users_p003.json".
 * @returns {string | null}
 */
function collectionNameFromFile(fileName) {
  if (!fileName.endsWith(".json")) {
    return null;
  }
  const base = fileName.slice(0, -5);
  const partitionMatch = base.match(/^(.*)_p\d{3}$/);
  const name = partitionMatch ? partitionMatch[1] : base;
  return /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(name) ? name : null;
}

module.exports = LightweightStore;
