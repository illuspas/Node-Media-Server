// @ts-check
//
//  Created by Chen Mingliang on 23/12/01.
//  illuspas@msn.com
//  Copyright (c) 2023 Nodemedia. All rights reserved.
//

const fs = require("fs");
const net = require("net");
const tls = require("tls");
const logger = require("../core/logger.js");
const Context = require("../core/context.js");
const RtmpSession = require("../session/rtmp_session.js");

class NodeRtmpServer {

  constructor() {
    /** @type {Set<net.Socket>} */
    this._sockets = new Set();
    if (Context.config.rtmp?.port) {
      this.tcpServer = net.createServer(this.handleRequest);
    }
    if (Context.config.rtmps?.port) {
      const opt = {
        key: fs.readFileSync(Context.config.rtmps.key),
        cert: fs.readFileSync(Context.config.rtmps.cert),
      };
      this.tlsServer = tls.createServer(opt, this.handleRequest);
    }
  }

  run() {
    this.tcpServer?.listen(Context.config.rtmp.port, Context.config.bind, () => {
      logger.log(`Rtmp Server listening on port ${Context.config.bind}:${Context.config.rtmp.port}`);
    });
    this.tcpServer?.on("error", this.handleListenError("RTMP server", Context.config.rtmp.port));
    this.tlsServer?.listen(Context.config.rtmps.port, Context.config.bind, () => {
      logger.log(`Rtmps Server listening on port ${Context.config.bind}:${Context.config.rtmps.port}`);
    });
    this.tlsServer?.on("error", this.handleListenError("RTMPS server", Context.config.rtmps.port));
  }

  /**
   * Log a friendly message and exit when a listener fails (e.g. port already in use).
   * @param {string} name - Service name for log messages
   * @param {number} port - The port that failed to listen
   * @returns {(err: Error) => void}
   */
  handleListenError = (name, port) => {
    return (err) => {
      if (err.code === "EADDRINUSE") {
        logger.error(`${name} failed to start: port ${Context.config.bind}:${port} is already in use.`);
        logger.error("Another process (possibly a previous instance of this server) is using it. Stop it or change the port in bin/config.json.");
      } else {
        logger.error(`${name} failed to start: ${err.message}`);
      }
      process.exit(1);
    };
  };

  /**
   * Stop listeners and destroy all live RTMP/RTMPS connections.
   * @returns {void}
   */
  stop() {
    this.tcpServer?.close(() => {
      logger.log("Rtmp Server stopped");
    });
    this.tlsServer?.close(() => {
      logger.log("Rtmps Server stopped");
    });
    for (const socket of this._sockets) {
      socket.destroy();
    }
  }

  /**
   * @param {net.Socket} socket 
   */
  handleRequest = (socket) => {
    this._sockets.add(socket);
    socket.on("close", () => {
      this._sockets.delete(socket);
    });
    const session = new RtmpSession(socket);
    session.run();
    Context.sessions.set(session.id, session);
  };
}

module.exports = NodeRtmpServer;
