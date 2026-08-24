// @ts-check
//
//  Created by Chen Mingliang on 24/11/28.
//  illuspas@msn.com
//  Copyright (c) 2024 NodeMedia. All rights reserved.
//

const logger = require("./core/logger.js");
const Package = require("../package.json");
const Context = require("./core/context.js");
const BaseSession = require("./session/base_session.js");
const NodeHttpServer = require("./server/http_server.js");
const NodeRtmpServer = require("./server/rtmp_server.js");
const NodeRecordServer = require("./server/record_server.js");
const NodeNotifyServer = require("./server/notify_server.js");
const NodeHistoryServer = require("./server/history_server.js");
const RelayManager = require("./server/relay_manager.js");
const LightweightStore = require("./store/lightweight_store.js");

class NodeMediaServer {
  constructor(config) {
    logger.level = "debug";
    logger.info(`Node-Media-Server v${Package.version}`);
    logger.info(`Homepage: ${Package.homepage}`);
    logger.info(`License: ${Package.license}`);
    logger.info(`Author: ${Package.author}`);

    Context.config = config;
    this.httpServer = new NodeHttpServer();
    this.rtmpServer = new NodeRtmpServer();
    this.recordServer = new NodeRecordServer();
    this.notifyServer = new NodeNotifyServer();
    this.historyServer = new NodeHistoryServer();
    this.relayManager = new RelayManager();

    // Lightweight JSON store: relay tasks, record metadata, stream history
    const storeConfig = config.store ?? {};
    this.store = new LightweightStore({
      dir: storeConfig.path || "./data",
      flushInterval: storeConfig.flushInterval,
      maxOps: storeConfig.maxOps,
      pretty: storeConfig.pretty,
      durability: storeConfig.durability,
      // Partition layout is fixed by the system: changing it after data exists
      // strands stale shard files that resurrect deleted docs on reload.
      partitions: 1
    });
    Context.store = this.store;

    // Expose relay manager to context for API access
    Context.relayManager = this.relayManager;
  }

  /**
   *
   * @param {string} eventName
   * @param {(session:BaseSession)=>void} listener
   */
  on(eventName, listener) {
    Context.eventEmitter.on(eventName, listener);
  }

  run() {
    this.httpServer.run();
    this.rtmpServer.run();
    this.recordServer.run();
    this.notifyServer.run();

    // Open the store first, then restore persisted state (relay tasks).
    // Servers that only append data (records/history) queue in memory and
    // flush once the store is open, so they don't need to wait.
    this.storeReady = this.store.open().then(() => {
      this.historyServer.run();
      this.relayManager.run();
      logger.info(`Store ready at ${this.store.options.dir}`);
    }).catch((error) => {
      logger.error(`Store open failed, persistence disabled: ${error.message}`);
      this.relayManager.run();
    });

    return this.storeReady;
  }

  /**
   * Flush the store and stop all relay tasks. Call before exit for a clean shutdown.
   * @returns {Promise<void>}
   */
  async stop() {
    this.relayManager.stop();
    if (this.store.opened) {
      await this.store.close();
    }
  }
}

module.exports = NodeMediaServer;