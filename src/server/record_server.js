// @ts-check
//
//  Created by Chen Mingliang on 25/04/24.
//  illuspas@msn.com
//  Copyright (c) 2025 Nodemedia. All rights reserved.
//

const fs = require("node:fs");
const path = require("node:path");
const logger = require("../core/logger.js");
const Context = require("../core/context.js");
const NodeRecordSession = require("../session/record_session.js");

class NodeRecordServer {
  constructor() {
    /** @type {Map<string, NodeRecordSession>} streamPath -> active record session */
    this._activeRecords = new Map();
    this._running = false;
    this._onPostPublish = (session) => {
      // record.auto=false keeps the record service available (metadata tracking,
      // manual record API) without auto-recording every published stream
      if (Context.config.record.auto === false) {
        return;
      }
      const active = this._activeRecords.get(session.streamPath);
      if (active) {
        // the same client resumed within the publish grace window: keep appending
        // to the same file instead of starting a new record
        active.publisherId = session.id;
        logger.info(`Record session ${active.id} ${active.streamPath} resumed by publisher ${session.id}`);
        return;
      }
      const filePath = path.join(Context.config.record.path, session.streamPath, Date.now() + ".flv");
      const sess = new NodeRecordSession(session, filePath);
      sess.run();
      Context.sessions.set(sess.id, sess);
      this._activeRecords.set(session.streamPath, sess);
    };
  }

  run() {
    if (Context.config.record?.path) {
      try {
        fs.mkdirSync(Context.config.record.path, { recursive: true });
        fs.accessSync(Context.config.record.path, fs.constants.W_OK);
      } catch (error) {
        logger.error(`record path ${Context.config.record.path} has no write permission. ${error}`);
        return;
      }
      logger.info(`Record server start on the path ${Context.config.record.path}`);
      this._running = true;
      if (Context.config.record.auto === false) {
        logger.info("Auto record disabled, recording only via the manual record API");
      }
      Context.eventEmitter.on("postPublish", this._onPostPublish);
      this._trackRecords();
      this._recoverStaleRecords();
    }
  }

  /**
   * Whether the given stream currently has an active record session.
   * @param {string} streamPath - Stream path like "/live/stream"
   * @returns {boolean}
   */
  isRecording(streamPath) {
    return this._activeRecords.has(streamPath);
  }

  /**
   * Get the active record session of the given stream, if any.
   * @param {string} streamPath - Stream path like "/live/stream"
   * @returns {NodeRecordSession|undefined}
   */
  getActiveRecord(streamPath) {
    return this._activeRecords.get(streamPath);
  }

  /**
   * Manually start recording a publishing stream (webadmin record button).
   * @param {string} streamPath - Stream path like "/live/stream"
   * @returns {{ok: boolean, error?: string, recordId?: string, filePath?: string}}
   */
  startRecord(streamPath) {
    if (!this._running) {
      return { ok: false, error: "Record path is not configured or not writable" };
    }
    if (this._activeRecords.has(streamPath)) {
      return { ok: false, error: "Stream is already recording" };
    }
    const broadcast = Context.broadcasts.get(streamPath);
    if (!broadcast?.publisher) {
      return { ok: false, error: "Stream is not publishing" };
    }
    const filePath = path.join(Context.config.record.path, streamPath, Date.now() + ".flv");
    const sess = new NodeRecordSession(broadcast.publisher, filePath);
    sess.run();
    Context.sessions.set(sess.id, sess);
    this._activeRecords.set(streamPath, sess);
    return { ok: true, recordId: sess.id, filePath };
  }

  /**
   * Manually stop the active record session of the given stream.
   * @param {string} streamPath - Stream path like "/live/stream"
   * @returns {{ok: boolean, error?: string}}
   */
  stopRecord(streamPath) {
    const sess = this._activeRecords.get(streamPath);
    if (!sess) {
      return { ok: false, error: "Stream is not recording" };
    }
    sess.stop();
    this._activeRecords.delete(streamPath);
    return { ok: true };
  }

  /**
   * Stop accepting new recordings and finalize all active record sessions.
   * @returns {void}
   */
  stop() {
    this._running = false;
    Context.eventEmitter.off("postPublish", this._onPostPublish);
    for (const session of this._activeRecords.values()) {
      session.stop();
    }
    this._activeRecords.clear();
    logger.info("Record server stopped");
  }

  /**
   * Persist recording metadata (files, duration, size) into the store's
   * "records" collection so the webadmin can list and delete recordings.
   * @returns {void}
   */
  _trackRecords() {
    const store = Context.store;
    if (!store) {
      return;
    }
    Context.eventEmitter.on("postRecord", (session) => {
      const records = store.collection("records");
      records.set(session.id, {
        streamPath: session.streamPath,
        app: session.streamApp,
        name: session.streamName,
        filePath: session.filePath,
        publisherId: session.publisherId,
        startTime: session.createTime,
        endTime: 0,
        duration: 0,
        size: 0,
        status: "recording"
      });
    });
    Context.eventEmitter.on("doneRecord", (session) => {
      this._activeRecords.delete(session.streamPath);
      const records = store.collection("records");
      const doc = records.get(session.id);
      if (!doc || doc.status === "done") {
        return;
      }
      const endTime = session.endTime || Date.now();
      records.update(session.id, {
        status: "done",
        endTime,
        duration: Math.max(0, endTime - session.createTime),
        size: session.outBytes
      });
    });
  }

  /**
   * Mark records left in "recording" state by a previous unclean shutdown
   * as done, using the actual file size and modification time when available.
   * Must be called after the store has finished loading persisted collections.
   * @returns {void}
   */
  _recoverStaleRecords() {
    const records = Context.store.collection("records");
    for (const doc of records.find({ status: "recording" })) {
      let size = doc.size;
      let endTime = Date.now();
      try {
        const stat = fs.statSync(doc.filePath);
        size = stat.size;
        endTime = stat.mtimeMs;
      } catch (error) {
        logger.warn(`Recovering record ${doc.id}: file ${doc.filePath} not accessible, using fallback values`);
      }
      records.update(doc.id, {
        status: "done",
        endTime,
        duration: Math.max(0, endTime - doc.startTime),
        size
      });
      logger.info(`Recovered stale record ${doc.id} ${doc.streamPath}, marked as done`);
    }
  }

};

module.exports = NodeRecordServer;
