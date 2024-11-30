// @ts-check
//
//  Created by Chen Mingliang on 23/12/01.
//  illuspas@msn.com
//  Copyright (c) 2023 Nodemedia. All rights reserved.
//

import fs from "node:fs";
import http from "node:http";
import http2 from "node:http2";
import express from "express";
import http2Express from "http2-express-bridge";
import FlvSession from "../session/flv_session.js";
import logger from "../core/logger.js";
import Context from "../core/context.js";

export default class NodeHttpServer {
  /**
   * @param {Context} ctx 
   */
  constructor(ctx) {
    this.ctx = ctx;
    const app = http2Express(express);
    const opt = {
      key: fs.readFileSync(ctx.config.https.key),
      cert: fs.readFileSync(ctx.config.https.cert),
      allowHTTP1: true
    };

    app.get("/:app/:name.flv", this.handleFlvPlay);
    app.post("/:app/:name.flv", this.handleFlvPush);

    this.server1 = http.createServer(app);
    this.server2 = http2.createSecureServer(opt, app);
  }

  run = () => {
    this.server1.listen(this.ctx.config.http.port, this.ctx.config.http.bind, () => {
      logger.info(`HTTP server listening on port ${this.ctx.config.http.bind}:${this.ctx.config.http.port}`);
    });
    this.server2.listen(this.ctx.config.https.port, this.ctx.config.https.bind, () => {
      logger.info(`HTTPS server listening on port ${this.ctx.config.https.bind}:${this.ctx.config.https.port}`);
    });
  };

  /**
   * @param {express.Request} req
   * @param {express.Response} res
   */
  handleFlvPlay = (req, res) => {
    const session = new FlvSession(this.ctx, req, res);
    session.doPlay();
  };

  /**
   * @param {express.Request} req
   * @param {express.Response} res
   */
  handleFlvPush = (req, res) => {
    const session = new FlvSession(this.ctx, req, res);
    session.doPush();
  };
}
