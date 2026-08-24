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
      Context.eventEmitter.on("postPublish", (session) => {
        let filePath = path.join(Context.config.record.path, session.streamPath, Date.now() + ".flv");
        let sess = new NodeRecordSession(session, filePath);
        sess.run();
      });
      this._trackRecords();
      this._recoverStaleRecords();
    }
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
