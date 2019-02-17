//
//  Created by Mingliang Chen on 17/8/1.
//  illuspas[a]gmail.com
//  Copyright (c) 2017 Nodemedia. All rights reserved.
//

const NodeRtmpServer = require('./node_rtmp_server');
const NodeHttpServer = require('./node_http_server');
const NodeCoreUtils = require('./node_core_utils');

const streams = require('./api/routes/streams');
const clients = require('./api/routes/clients');

class NodeMediaServer {
  constructor(config) {
    this.config = config;
    this.sessions = new Map();
    this.publishers = new Map();
    this.idlePlayers = new Set();
    this.nodeEvent = NodeCoreUtils.nodeEvent;
  }

  run() {
    if (this.config.rtmp) {
      this.nrs = new NodeRtmpServer(this.config, this.sessions, this.publishers, this.idlePlayers);

      this.nrs.run();
    }

    if (this.config.http) {
      this.nhs = new NodeHttpServer(this.config, this.sessions, this.publishers, this.idlePlayers);

      this.nhs.expressApp.use('/api/streams', streams(this));
      this.nhs.expressApp.use('/api/clients', clients(this));

      this.nhs.run();
    }
  }

  on(eventName, listener) {
    this.nodeEvent.on(eventName, listener);
  }

  getSession(id) {
    return this.sessions.get(id);
  }
}

module.exports = NodeMediaServer;
