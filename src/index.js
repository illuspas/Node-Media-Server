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
  }

  /**
   * 
   * @param {string} eventName 
   * @param {(session:BaseSession)=>void} listener 
   */
  on(eventName, listener) {
    Context.eventEmitter.on(eventName, listener);
  }

  /**
   * Gracefully shutdown the server and release all resources
   * @param {() => void} [callback]
   */
  stop(callback) {
    logger.info("NodeMediaServer is shutting down...");

    // Close all active sessions
    for (const [id, session] of Context.sessions) {
      try {
        session.close();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error(`Error closing session ${id}: ${message}`);
      }
    }
    Context.sessions.clear();

    // Clear all broadcasts
    for (const [path, broadcast] of Context.broadcasts) {
      broadcast.publisher = null;
      broadcast.subscribers.clear();
      broadcast.flvGopCache?.clear();
      broadcast.rtmpGopCache?.clear();
    }
    Context.broadcasts.clear();

    // Remove all event listeners
    Context.eventEmitter.removeAllListeners();

    // Stop all servers
    Promise.all([
      new Promise(resolve => this.httpServer.stop(resolve)),
      new Promise(resolve => this.rtmpServer.stop(resolve)),
    ]).then(() => {
      logger.info("NodeMediaServer shutdown complete");
      callback?.();
    });
  }

  run() {

    this.httpServer.run();
    this.rtmpServer.run();
    this.recordServer.run(); 
    this.notifyServer.run();
    
  }
}

module.exports = NodeMediaServer;