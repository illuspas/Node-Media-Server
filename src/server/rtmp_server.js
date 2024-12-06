// @ts-check
//
//  Created by Chen Mingliang on 23/12/01.
//  illuspas@msn.com
//  Copyright (c) 2023 Nodemedia. All rights reserved.
//

const fs = require("fs");
const net = require("net");
const tls = require('tls');
const logger = require("../core/logger.js");
const Context = require("../core/context.js");
const RtmpSession = require("../session/rtmp_session.js");

class NodeRtmpServer {
  /**
   * @param {Context} ctx 
   */
  constructor(ctx) {
    this.ctx = ctx;
    if (ctx.config.rtmp?.port) {
      this.tcpServer = net.createServer(this.handleRequest);
    }
    if (ctx.config.rtmps?.port) {
      const opt = {
        key: fs.readFileSync(ctx.config.rtmps.key),
        cert: fs.readFileSync(ctx.config.rtmps.cert),
      };
      this.tlsServer = tls.createServer(opt, this.handleRequest);
    }
  }

  run = () => {
    this.tcpServer?.listen(this.ctx.config.rtmp.port, this.ctx.config.rtmp.bind, () => {
      logger.log(`Rtmp Server listening on port ${this.ctx.config.rtmp.bind}:${this.ctx.config.rtmp.port}`);
    });
    this.tlsServer?.listen(this.ctx.config.rtmps.port, this.ctx.config.rtmps.bind, () => {
      logger.log(`Rtmps Server listening on port ${this.ctx.config.rtmps.bind}:${this.ctx.config.rtmps.port}`);
    });
  };

  /**
   * @param {net.Socket} socket 
   */
  handleRequest = (socket) => {
    const session = new RtmpSession(this.ctx, socket);
    session.run();
  };
}

module.exports = NodeRtmpServer;
