// @ts-check
//
//  Created by Chen Mingliang on 23/12/01.
//  illuspas@msn.com
//  Copyright (c) 2023 Nodemedia. All rights reserved.
//

const fs = require("fs");
const http = require("http");
const http2 = require("http2");
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const logger = require("../core/logger.js");
const http2Express = require("http2-express");
const { expressjwt: jwtMiddleware } = require("express-jwt");
const jwt = require("jsonwebtoken");
const FlvSession = require("../session/flv_session.js");
const sessionController = require("../controller/sessionController.js");

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

    const apiRouter = express.Router();

    apiRouter.use(
      jwtMiddleware({
        secret: config.auth.secret,
        algorithms: ["HS256"],
      }).unless({ path: ["/api/login"] })
    );

    apiRouter.use(express.json());

    // @ts-ignore
    apiRouter.post("/login", (req, res) => {
      const { username, password } = req.body;
      const md5Password = crypto.createHash("md5").update(config.auth.password).digest("hex");
      if (username !== config.auth.username || password !== md5Password) {
        return res.status(401).json({ error: "用户名或密码错误" });
      }
      const token = jwt.sign({ username }, config.auth.secret);
      res.json({ data: { token } });
    });

    apiRouter.get("/sessions", sessionController.handleGetSessions);
    apiRouter.get("/sessions/:id", sessionController.handleGetSession);
    apiRouter.delete("/sessions/:id", sessionController.handleDeleteSession);
    
    // @ts-ignore 挂载 API 路由组 
    app.use("/api", apiRouter);

    // @ts-ignore 错误处理
    app.use((err, req, res, next) => {
      if (err.name === "UnauthorizedError") {
        return res.status(401).json({ error: "Token 无效或过期" });
      }
      next(err);
    });

    if (this.config.http?.port) {
      this.httpServer = http.createServer(app);
    }
    if (this.config.https?.port) {
      const opt = {
        key: fs.readFileSync(this.config.https.key),
        cert: fs.readFileSync(this.config.https.cert),
        allowHTTP1: true
      };
      this.httpsServer = http2.createSecureServer(opt, app);
    }

  }

  run = () => {
    this.httpServer?.listen(this.config.http.port, this.config.bind, () => {
      logger.info(`HTTP server listening on port ${this.config.bind}:${this.config.http.port}`);
    });
    this.httpsServer?.listen(this.config.https.port, this.config.bind, () => {
      logger.info(`HTTPS server listening on port ${this.config.bind}:${this.config.https.port}`);
    });
  };

  /**
   * @param {express.Request} req
   * @param {express.Response} res
   */
  handleFlv = (req, res) => {
    const session = new FlvSession(req, res);
    session.run();
  };
}

module.exports = NodeHttpServer;
