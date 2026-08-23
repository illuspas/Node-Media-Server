// @ts-check
//
//  Created by Chen Mingliang on 26/08/23.
//  illuspas@msn.com
//  Copyright (c) 2026 NodeMedia. All rights reserved.
//

const logger = require("../core/logger.js");
const Context = require("../core/context.js");

/**
 * Persists finished publish sessions into the store's "stream_history"
 * collection, capped by store.maxHistory. Plays are not stored as separate
 * history rows; each play increments the stream's cumulative counter
 * ("play_stats" collection), and the publisher's history entry carries the
 * stream's historical play count. Internal sessions (record, relay pull)
 * have an empty ip and are skipped.
 * @class
 */
class NodeHistoryServer {
  constructor() {
    /** @type {boolean} */
    this.isRunning = false;
    /** @type {null | ((session: import("../session/base_session.js")) => void)} */
    this._onPostPlay = null;
    /** @type {null | ((session: import("../session/base_session.js")) => void)} */
    this._onDonePublish = null;
  }

  /**
   * Start listening for finished publishes and started plays.
   */
  run() {
    if (this.isRunning) {
      return;
    }
    const store = Context.store;
    if (!store?.opened) {
      logger.warn("History server disabled: store is not available");
      return;
    }
    const maxHistory = Context.config.store?.maxHistory ?? 10000;
    const history = store.collection("stream_history", { maxDocs: maxHistory });
    const playStats = store.collection("play_stats");

    // count plays per stream path; plays survive restarts in play_stats
    this._onPostPlay = (session) => {
      if (session.ip === "") {
        return;
      }
      const current = playStats.get(session.streamPath);
      playStats.set(session.streamPath, { count: (current?.count ?? 0) + 1 });
    };

    /**
     * @param {import("../session/base_session.js")} session
     */
    this._onDonePublish = (session) => {
      if (session.ip === "" || !session.endTime) {
        return;
      }
      try {
        history.insert({
          id: session.id,
          protocol: session.protocol,
          streamPath: session.streamPath,
          app: session.streamApp,
          name: session.streamName,
          ip: session.ip,
          startTime: session.createTime,
          endTime: session.endTime,
          duration: session.endTime - session.createTime,
          inBytes: session.inBytes,
          outBytes: session.outBytes,
          playCount: playStats.get(session.streamPath)?.count ?? 0
        });
      } catch (error) {
        logger.warn(`History server insert failed: ${error.message}`);
      }
    };

    Context.eventEmitter.on("postPlay", this._onPostPlay);
    Context.eventEmitter.on("donePublish", this._onDonePublish);
    this.isRunning = true;
    logger.info(`History server started (max ${maxHistory} publish records)`);
  }

  /**
   * Stop listening; registered handlers are removed.
   * @returns {void}
   */
  stop() {
    if (!this.isRunning) {
      return;
    }
    Context.eventEmitter.removeListener("postPlay", this._onPostPlay);
    Context.eventEmitter.removeListener("donePublish", this._onDonePublish);
    this.isRunning = false;
    logger.info("History server stopped");
  }
}

module.exports = NodeHistoryServer;
