// @ts-check
//
//  Created by Chen Mingliang on 26/08/23.
//  illuspas@msn.com
//  Copyright (c) 2026 NodeMedia. All rights reserved.
//
//  In-memory collection. All CRUD is synchronous and reads always hit the
//  in-memory Map (read-your-writes, zero IO). Mutations only mark partitions
//  dirty in the owning store; persistence happens on the flush path.

const { generateId } = require("./id.js");
const { matchesFilter, sortDocs } = require("./query.js");
const { partitionIndexForId } = require("./persister.js");

const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

/**
 * A named set of JSON documents backed by one LightweightStore.
 * @class
 */
class Collection {
  /**
   * @param {string} name - Collection name.
   * @param {object} [options]
   * @param {number} [options.maxDocs] - Evict oldest-inserted docs beyond this count.
   */
  constructor(name, options = {}) {
    if (!NAME_PATTERN.test(name)) {
      throw new TypeError(`invalid collection name: ${name}`);
    }
    this.name = name;
    this.maxDocs = options.maxDocs ?? Infinity;
    /** @type {Map<string, object>} doc id -> doc */
    this.docs = new Map();
    /** @type {Set<number>} partition indexes with unsaved changes */
    this.dirtyPartitions = new Set();
    /** @type {null | ((ids: string[]) => void)} set by the owning store */
    this.onDirty = null;
    /**
     * Partition count, injected by the owning store.
     * @type {number}
     */
    this._partitions = 1;
  }

  /**
   * Number of documents in memory.
   * @returns {number}
   */
  get size() {
    return this.docs.size;
  }

  /**
   * Report changed ids to the owning store.
   * @param {string[]} ids
   * @returns {void}
   */
  _markDirty(ids) {
    if (ids.length === 0) {
      return;
    }
    const partitions = this._partitions;
    if (partitions <= 1) {
      this.dirtyPartitions.add(0);
    } else {
      for (const id of ids) {
        this.dirtyPartitions.add(partitionIndexForId(id, partitions));
      }
    }
    this.onDirty?.(ids);
  }

  /**
   * Insert a document. Generates an id when missing; rejects duplicate ids.
   * @param {object} doc
   * @returns {object} The stored document (with id).
   */
  insert(doc) {
    const id = doc.id ?? generateId();
    if (this.docs.has(id)) {
      throw new TypeError(`duplicate id ${id} in collection ${this.name}`);
    }
    const stored = { ...doc, id };
    this.docs.set(id, stored);
    this._trim();
    this._markDirty([id]);
    return stored;
  }

  /**
   * Insert many documents at once.
   * @param {object[]} docs
   * @returns {object[]} The stored documents.
   */
  insertMany(docs) {
    const stored = [];
    const ids = [];
    for (const doc of docs) {
      const id = doc.id ?? generateId();
      if (this.docs.has(id)) {
        throw new TypeError(`duplicate id ${id} in collection ${this.name}`);
      }
      const copy = { ...doc, id };
      this.docs.set(id, copy);
      stored.push(copy);
      ids.push(id);
    }
    this._trim();
    this._markDirty(ids);
    return stored;
  }

  /**
   * Get a document by id.
   * @param {string} id
   * @returns {object | null}
   */
  get(id) {
    return this.docs.get(id) ?? null;
  }

  /**
   * Replace (or insert) a document with an explicit id.
   * @param {string} id
   * @param {object} doc
   * @returns {object} The stored document.
   */
  set(id, doc) {
    const stored = { ...doc, id };
    this.docs.set(id, stored);
    this._trim();
    this._markDirty([id]);
    return stored;
  }

  /**
   * Shallow-merge changes into an existing document. The id is immutable.
   * @param {string} id
   * @param {object} changes
   * @returns {object | null} Updated document, or null when the id is unknown.
   */
  update(id, changes) {
    const current = this.docs.get(id);
    if (!current) {
      return null;
    }
    const { id: _ignored, ...rest } = changes;
    const stored = { ...current, ...rest };
    this.docs.set(id, stored);
    this._markDirty([id]);
    return stored;
  }

  /**
   * Delete a document by id.
   * @param {string} id
   * @returns {boolean} True when a document was removed.
   */
  delete(id) {
    const removed = this.docs.delete(id);
    if (removed) {
      this._markDirty([id]);
    }
    return removed;
  }

  /**
   * Delete all documents matching a filter.
   * @param {object} [filter] - Query filter; omitted deletes everything.
   * @returns {number} Number of removed documents.
   */
  deleteMany(filter = {}) {
    const ids = [];
    for (const [id, doc] of this.docs) {
      if (matchesFilter(doc, filter)) {
        ids.push(id);
      }
    }
    for (const id of ids) {
      this.docs.delete(id);
    }
    if (ids.length > 0) {
      this._markDirty(ids);
    }
    return ids.length;
  }

  /**
   * Find documents matching a filter.
   * @param {object} [filter] - Query filter (empty matches all).
   * @param {object} [options]
   * @param {object|Array<[string, number]>} [options.sort] - Sort spec.
   * @param {number} [options.skip] - Documents to skip.
   * @param {number} [options.limit] - Max documents to return.
   * @returns {object[]}
   */
  find(filter = {}, options = {}) {
    const results = [];
    for (const doc of this.docs.values()) {
      if (matchesFilter(doc, filter)) {
        results.push(doc);
      }
    }
    if (options.sort) {
      sortDocs(results, options.sort);
    }
    const skip = options.skip ?? 0;
    const sliced = skip > 0 ? results.slice(skip) : results;
    return options.limit !== undefined ? sliced.slice(0, options.limit) : sliced;
  }

  /**
   * Find the first document matching a filter.
   * @param {object} [filter]
   * @param {object} [options]
   * @returns {object | null}
   */
  findOne(filter = {}, options = {}) {
    const results = this.find(filter, { ...options, limit: 1 });
    return results.length > 0 ? results[0] : null;
  }

  /**
   * Count documents, optionally matching a filter.
   * @param {object} [filter]
   * @returns {number}
   */
  count(filter = {}) {
    if (Object.keys(filter).length === 0) {
      return this.docs.size;
    }
    let total = 0;
    for (const doc of this.docs.values()) {
      if (matchesFilter(doc, filter)) {
        total++;
      }
    }
    return total;
  }

  /**
   * Return all documents (insertion order).
   * @returns {object[]}
   */
  all() {
    return Array.from(this.docs.values());
  }

  /**
   * Remove all documents.
   * @returns {number} Number of removed documents.
   */
  clear() {
    const removed = this.docs.size;
    this.docs.clear();
    if (removed > 0) {
      for (const index of this._allPartitionIndexes()) {
        this.dirtyPartitions.add(index);
      }
      this.onDirty?.([]);
    }
    return removed;
  }

  /**
   * @returns {number[]}
   */
  _allPartitionIndexes() {
    return Array.from({ length: this._partitions }, (_, index) => index);
  }

  /**
   * Enforce maxDocs by evicting the oldest-inserted documents.
   * @returns {void}
   */
  _trim() {
    if (this.docs.size <= this.maxDocs) {
      return;
    }
    const excess = this.docs.size - this.maxDocs;
    const evicted = [];
    for (const id of this.docs.keys()) {
      if (evicted.length >= excess) {
        break;
      }
      evicted.push(id);
    }
    for (const id of evicted) {
      this.docs.delete(id);
    }
    if (evicted.length > 0) {
      const partitions = this._partitions;
      for (const id of evicted) {
        this.dirtyPartitions.add(partitionIndexForId(id, partitions));
      }
    }
  }
}

module.exports = Collection;
