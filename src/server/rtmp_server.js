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
    }
    if (Context.config.rtmps?.port) {
      const opt = {
        key: fs.readFileSync(Context.config.rtmps.key),
        cert: fs.readFileSync(Context.config.rtmps.cert),
      };
      this.tlsServer = tls.createServer(opt, this.handleRequest);
    }
  }

  run = () => {
    this.tcpServer?.listen(Context.config.rtmp.port, Context.config.bind, () => {
      logger.log(`Rtmp Server listening on port ${Context.config.bind}:${Context.config.rtmp.port}`);
    });
    this.tlsServer?.listen(Context.config.rtmps.port, Context.config.bind, () => {
      logger.log(`Rtmps Server listening on port ${Context.config.bind}:${Context.config.rtmps.port}`);
    });
  };

  /**
   * @param {net.Socket} socket 
   */
  handleRequest = (socket) => {
    const session = new RtmpSession(socket);
    session.run();
  };
}

module.exports = NodeRtmpServer;
