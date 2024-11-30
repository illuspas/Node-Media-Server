// @ts-check
//
//  Created by Chen Mingliang on 24/11/28.
//  illuspas@msn.com
//  Copyright (c) 2024 NodeMedia. All rights reserved.
//

import NodeHttpServer from "./server/http_server.js";
import NodeRtmpServer from "./server/rtmp_server.js";
import { createRequire } from "module";
import logger from "./core/logger.js";
import Context from "./core/context.js";

const require = createRequire(import.meta.url);
const Package = require("../package.json");

export default class NodeMediaServer {
  constructor(config) {
    logger.level = "debug";
    logger.info(`Node-Media-Server v${Package.version}`);
    logger.info(`Homepage: ${Package.homepage}`);
    logger.info(`License: ${Package.license}`);
    logger.info(`Author: ${Package.author}`);
    this.ctx = new Context(config);
    this.httpServer = new NodeHttpServer(this.ctx);
    this.rtmpServer = new NodeRtmpServer(this.ctx);
  }

  run() {
    this.httpServer.run();
    this.rtmpServer.run();
  }
}