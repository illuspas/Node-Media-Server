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
    if (Context.config.rtmp?.port) {
      this.tcpServer = net.createServer(this.handleRequest);
      this.tcpServer.on("error", (err) => {
        Context.eventEmitter.emit("serverError", { server: "rtmp", error: err });
      });
    }
    if (Context.config.rtmps?.port) {
      const opt = {
        key: fs.readFileSync(Context.config.rtmps.key),
        cert: fs.readFileSync(Context.config.rtmps.cert),
      };
      this.tlsServer = tls.createServer(opt, this.handleRequest);
      this.tlsServer.on("error", (err) => {
        Context.eventEmitter.emit("serverError", { server: "rtmps", error: err });
      });
    }
  }

  /**
   * Gracefully stop all RTMP and RTMPS servers
   * @param {() => void} [callback]
   */
  stop(callback) {
    const closeServer = (server, cb) => {
      if (server) {
        server.close(cb);
      } else {
        cb();
      }
    };

    Promise.all([
      new Promise(resolve => closeServer(this.tcpServer, resolve)),
      new Promise(resolve => closeServer(this.tlsServer, resolve)),
    ]).then(() => callback?.());
  }

  run = () => {
    this.tcpServer?.listen(Context.config.rtmp.port, Context.config.bind, () => {
      logger.log(`Rtmp Server listening on port ${Context.config.bind}:${Context.config.rtmp.port}`);
    }).on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        logger.error(`RTMP Server failed to listen on port ${Context.config.bind}:${Context.config.rtmp.port} - Address already in use`);
      } else {
        logger.error(`RTMP Server failed to listen: ${err.message}`);
      }
      Context.eventEmitter.emit("serverError", { server: "rtmp", error: err });
    });
    this.tlsServer?.listen(Context.config.rtmps.port, Context.config.bind, () => {
      logger.log(`Rtmps Server listening on port ${Context.config.bind}:${Context.config.rtmps.port}`);
    }).on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        logger.error(`RTMPS Server failed to listen on port ${Context.config.bind}:${Context.config.rtmps.port} - Address already in use`);
      } else {
        logger.error(`RTMPS Server failed to listen: ${err.message}`);
      }
      Context.eventEmitter.emit("serverError", { server: "rtmps", error: err });
    });
  };

  /**
   * @param {net.Socket} socket 
   */
  handleRequest = (socket) => {
    const session = new RtmpSession(socket);
    session.run();
    Context.sessions.set(session.id, session);
  };
}

module.exports = NodeRtmpServer;
