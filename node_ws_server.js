//
//  Created by Mingliang Chen on 17/9/1.
//  illuspas[a]gmail.com
//  Copyright (c) 2017 Nodemedia. All rights reserved.
//

const WebSocket = require('ws');
const NodeHttpSession = require('./node_http_session');
const NodeCoreUtils = require('./node_core_utils');

class NodeWebsocketServer {
  constructor(config, sessions, publishers, idlePlayers) {
    this.port = config.websocket.port;
    this.config = config;
    this.sessions = sessions;
    this.publishers = publishers;
    this.idlePlayers = idlePlayers;
  }

  run() {
    this.wsServer = new WebSocket.Server({ port: this.port });
    this.wsServer.on('connection', (ws, req) => {
      let id = NodeCoreUtils.generateNewSessionID(this.sessions);
      let session = new NodeHttpSession(this.config, req, ws);
      this.sessions.set(id, session);
      session.id = id;
      session.sessions = this.sessions;
      session.publishers = this.publishers;
      session.idlePlayers = this.idlePlayers;
      session.run();
    });
    this.wsServer.on('listening', () => {
      console.log(`Node Media WebSocket Server started on port: ${this.port}`);
    });
    this.wsServer.on('error', (e) => {
      console.log(`Node Media WebSocket Server ${e}`);
    });
  }
}

module.exports = NodeWebsocketServer;