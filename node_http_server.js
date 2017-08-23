//
//  Created by Mingliang Chen on 17/8/1.
//  illuspas[a]gmail.com
//  Copyright (c) 2017 Nodemedia. All rights reserved.
//

const Http = require('http');
const NodeHttpSession = require('./node_http_session');
const NodeCoreUtils = require('./node_core_utils');

class NodeHttpServer {
  constructor(config, sessions, publishers, idlePlayers) {
    this.port = config.http.port;


    this.httpServer = Http.createServer((req, res) => {
      let id = NodeCoreUtils.generateNewSessionID(sessions);
      let session = new NodeHttpSession(config, req, res);
      sessions.set(id, session);
      session.id = id;
      session.sessions = sessions;
      session.publishers = publishers;
      session.idlePlayers = idlePlayers;
      session.run();
    });
  }

  run() {
    this.httpServer.listen(this.port, () => {
      console.log(`Node Media Http Server started on port: ${this.port}`);
    })
    this.httpServer.on('error', (e) => {
      console.log(`Node Media Http Server ${e}`);
    });
  }
}

module.exports = NodeHttpServer