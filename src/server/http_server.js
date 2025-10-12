// @ts-check
//
//  Created by Chen Mingliang on 23/12/01.
//  illuspas@msn.com
//  Copyright (c) 2023 Nodemedia. All rights reserved.
//

const fs = require("fs");
const cors = require("cors");
const http = require("http");
const http2 = require("http2");
const WebSocket = require("ws");

const express = require("express");
const logger = require("../core/logger.js");
const Context = require("../core/context.js");
const FlvSession = require("../session/flv_session.js");
const http2Express = require("../vendor/http2-express");

class NodeHttpServer {
  constructor() {
    const app = http2Express(express);

    if (Context.config.static?.router && Context.config.static?.root) {
      // @ts-ignore
      app.use(Context.config.static.router, express.static(Context.config.static.root));
    }

    // @ts-ignore
    app.use(cors());

    // @ts-ignore
    app.all("/:app/:name.flv", this.handleFlv);


    if (Context.config.http?.port) {
      this.httpServer = http.createServer(app);
      this.wsServer = new WebSocket.Server({ server: this.httpServer });
      this.wsServer.on("connection", (ws, req) => {
        this.handleFlv(req, ws);
      });
    }
    if (Context.config.https?.port) {
      const opt = {
        key: fs.readFileSync(Context.config.https.key),
        cert: fs.readFileSync(Context.config.https.cert),
        allowHTTP1: true
      };
      this.httpsServer = http2.createSecureServer(opt, app);
      this.wssServer = new WebSocket.Server({ server: this.httpsServer });
      this.wssServer.on("connection", (ws, req) => {
        this.handleFlv(req, ws);
      });
    }

  }

  run = () => {
    this.httpServer?.listen(Context.config.http.port, Context.config.bind, () => {
      logger.info(`HTTP server listening on port ${Context.config.bind}:${Context.config.http.port}`);
    });
    this.wsServer?.on("listening", () => {
      logger.info(`WebSocket server listening on port ${Context.config.bind}:${Context.config.http.port}`);
    });
    this.httpsServer?.listen(Context.config.https.port, Context.config.bind, () => {
      logger.info(`HTTPS server listening on port ${Context.config.bind}:${Context.config.https.port}`);
    });
    this.wssServer?.on("listening", () => {
      logger.info(`WebSocket server listening on port ${Context.config.bind}:${Context.config.https.port}`);
    });
  };

  /**
   * @param {express.Request | http.IncomingMessage} req
   * @param {express.Response | WebSocket} res
   */
  handleFlv = (req, res) => {
    const session = new FlvSession(req, res);
    session.run();
  };
}

module.exports = NodeHttpServer;
