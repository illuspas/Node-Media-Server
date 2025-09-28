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
const FlvSession = require("../session/flv_session.js");
const http2Express = require("../vendor/http2-express");

class NodeHttpServer {
  constructor(config) {
    this.config = config;
    const app = http2Express(express);

    if (config.static?.router && config.static?.root) {
      // @ts-ignore
      app.use(config.static.router, express.static(config.static.root));
    }

    // @ts-ignore
    app.use(cors());

    // @ts-ignore
    app.all("/:app/:name.flv", this.handleFlv);


    if (this.config.http?.port) {
      this.httpServer = http.createServer(app);
      this.wsServer = new WebSocket.Server({ server: this.httpServer });
      this.wsServer.on("connection", (ws, req) => {
        this.handleFlv(req, ws);
      });
    }
    if (this.config.https?.port) {
      const opt = {
        key: fs.readFileSync(this.config.https.key),
        cert: fs.readFileSync(this.config.https.cert),
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
    this.httpServer?.listen(this.config.http.port, this.config.bind, () => {
      logger.info(`HTTP server listening on port ${this.config.bind}:${this.config.http.port}`);
    });
    this.wsServer?.on("listening", () => {
      logger.info(`WebSocket server listening on port ${this.config.bind}:${this.config.http.port}`);
    });
    this.httpsServer?.listen(this.config.https.port, this.config.bind, () => {
      logger.info(`HTTPS server listening on port ${this.config.bind}:${this.config.https.port}`);
    });
    this.wssServer?.on("listening", () => {
      logger.info(`WebSocket server listening on port ${this.config.bind}:${this.config.https.port}`);
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
