//
//  Created by Mingliang Chen on 17/8/1.
//  illuspas[a]gmail.com
//  Copyright (c) 2018 Nodemedia. All rights reserved.
//

const Logger = require('./node_core_logger');

const NodeRtmpServer = require('./node_rtmp_server');
const NodeHttpServer = require('./node_http_server');
const NodeTransServer = require('./node_trans_server');
const NodeRelayServer = require('./node_relay_server');
const NodeIpcServer = require('./node_ipc_server');
const context = require('./node_core_ctx');

class NodeMediaServer {
  constructor(config) {
    this.config = config;
  }

  run() {
    if (this.config.hasOwnProperty('logType')) {
      Logger.setLogType(this.config.logType);
    }

    if (this.config.hasOwnProperty('logOutput')) {
      Logger.setOutputFunction(this.config.logOutput);
    }

    if (this.config.rtmp) {
      this.nrs = new NodeRtmpServer(this.config);
      this.nrs.run();
    }

    if (this.config.http) {
      this.nhs = new NodeHttpServer(this.config);
      this.nhs.run();
    }

    if (this.config.trans) {
      this.nts = new NodeTransServer(this.config);
      this.nts.run();
    }

    if (this.config.relay) {
      this.nls = new NodeRelayServer(this.config);
      this.nls.run();
    }
    
    if (this.config.cluster) {
      this.nis = new NodeIpcServer(this.config);
      this.nis.run();
    }

    process.on('uncaughtException', function (err) {
      Logger.error('uncaughtException', err);
    });
  }

  on(eventName, listener) {
    context.nodeEvent.on(eventName, listener);
  }

  stop() {
    if (this.nrs) {
      this.nrs.stop();
    }
    if (this.nhs) {
      this.nhs.stop();
    }
    if (this.nls) {
      this.nls.stop();
    }
    if (this.nis) {
      this.nis.stop();
    }
  }

  getSession(id) {
    return context.sessions.get(id);
  }
}

module.exports = NodeMediaServer