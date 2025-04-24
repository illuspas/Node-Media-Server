// @ts-check
//
//  Created by Chen Mingliang on 25/04/24.
//  illuspas@msn.com
//  Copyright (c) 2025 Nodemedia. All rights reserved.
//

const fs = require("node:fs");
const path = require("node:path");
const logger = require("../core/logger.js");
const Context = require("../core/context.js");
const NodeRecordSession = require("../session/record_session.js");

class NodeRecordServer {
  constructor(config) {
    this.config = config;
  }

  run() {
    if (this.config.record?.path) {
      try {
        fs.mkdirSync(this.config.record.path, { recursive: true });
        fs.accessSync(this.config.record.path, fs.constants.W_OK);
      } catch (error) {
        logger.error(`record path ${this.config.record.path} has no write permission. ${error}`);
        return;
      }
      logger.info(`Record server start on the path ${this.config.record.path}`);
      Context.eventEmitter.on("postPublish", (session) => {
        let filePath = path.join(this.config.record.path, session.streamPath, Date.now() + ".flv");
        let sess = new NodeRecordSession(session, filePath);
        sess.run();
      });
    }
  }

};

module.exports = NodeRecordServer;
