// @ts-check
//
//  Created by Chen Mingliang on 23/12/01.
//  illuspas@msn.com
//  Copyright (c) 2023 Nodemedia. All rights reserved.
//

import Context from "../core/context.js";
import net from "node:net";
import logger from "../core/logger.js";
import RtmpSession from "../session/rtmp_session.js";

export default class NodeRtmpServer {
  /**
   * @param {Context} ctx 
   */
  constructor(ctx) {
    this.ctx = ctx;
    this.tcpServer = net.createServer(this.handleRequest);
  }

  run = () => {
    this.tcpServer.listen(this.ctx.config.rtmp.port, this.ctx.config.rtmp.bind, () => {
      logger.log(`Rtmp Server listening on port ${this.ctx.config.rtmp.bind}:${this.ctx.config.rtmp.port}`);
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