// @ts-check
//
//  Created by Chen Mingliang on 23/12/01.
//  illuspas@msn.com
//  Copyright (c) 2023 Nodemedia. All rights reserved.
//

const fs = require("fs");
const http = require("http");
const http2 = require("http2");
const express = require("express");
const logger = require("../core/logger.js");
const Context = require("../core/context.js");
const http2Express = require("http2-express");
const FlvSession = require("../session/flv_session.js");

class NodeHttpServer {
  /**
   * @param {Context} ctx 
   */
  constructor(ctx) {
    this.ctx = ctx;
    const app = http2Express(express);

    app.all("*", (req, res, next) => {
      res.header("Access-Control-Allow-Origin", "*");
      req.method === "OPTIONS" ? res.sendStatus(200) : next();
    });

    app.all("/:app/:name.flv", this.handleFlv);

    if (ctx.config.http?.port) {
      this.httpServer = http.createServer(app);
    }
    if (ctx.config.https?.port) {
      const opt = {
        key: fs.readFileSync(ctx.config.https.key),
        cert: fs.readFileSync(ctx.config.https.cert),
        allowHTTP1: true
      };
      this.httpsServer = http2.createSecureServer(opt, app);
    }

  }

  run = () => {
    this.httpServer?.listen(this.ctx.config.http.port, this.ctx.config.http.bind, () => {
      logger.info(`HTTP server listening on port ${this.ctx.config.http.bind}:${this.ctx.config.http.port}`);
    });
    this.httpsServer?.listen(this.ctx.config.https.port, this.ctx.config.https.bind, () => {
      logger.info(`HTTPS server listening on port ${this.ctx.config.https.bind}:${this.ctx.config.https.port}`);
    });
  };

  /**
   * @param {express.Request} req
   * @param {express.Response} res
   */
  handleFlv = (req, res) => {
    const session = new FlvSession(this.ctx, req, res);
    session.run();
  };
}

module.exports = NodeHttpServer;
