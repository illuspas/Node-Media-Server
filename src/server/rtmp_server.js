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
const RtmpSession = require("../session/rtmp_session.js");

class NodeRtmpServer {

  constructor(config) {
    this.config = config;
    if (this.config.rtmp?.port) {
      this.tcpServer = net.createServer(this.handleRequest);
    }
    if (this.config.rtmps?.port) {
      const opt = {
        key: fs.readFileSync(this.config.rtmps.key),
        cert: fs.readFileSync(this.config.rtmps.cert),
      };
      this.tlsServer = tls.createServer(opt, this.handleRequest);
    }
  }

  run = () => {
    this.tcpServer?.listen(this.config.rtmp.port, this.config.bind, () => {
      logger.log(`Rtmp Server listening on port ${this.config.bind}:${this.config.rtmp.port}`);
    });
    this.tlsServer?.listen(this.config.rtmps.port, this.config.bind, () => {
      logger.log(`Rtmps Server listening on port ${this.config.bind}:${this.config.rtmps.port}`);
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
