//
//  Created by Mingliang Chen on 17/8/1.
//  illuspas[a]gmail.com
//  Copyright (c) 2017 Nodemedia. All rights reserved.
//

const Http = require('http');
const NodeHttpSession = require('./node_http_session');

class NodeHttpServer {
  constructor(config, sessions, publishers) {
    this.port = config.port;


    this.httpServer = Http.createServer((req, res) => {
      let id = this.generateNewSessionID(sessions);
      let session = new NodeHttpSession(config, req, res);
      sessions.set(id, session);
      session.id = id;
      session.sessions = sessions;
      session.publishers = publishers;
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

  generateNewSessionID(sessions) {
    let SessionID = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWKYZ0123456789';
    const numPossible = possible.length;
    do {
      for (var i = 0; i < 8; i++) {
        SessionID += possible.charAt((Math.random() * numPossible) | 0);
      }
    } while (sessions.has(SessionID))
    return SessionID;
  }
}

module.exports = NodeHttpServer