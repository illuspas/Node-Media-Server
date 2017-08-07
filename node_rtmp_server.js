//
//  Created by Mingliang Chen on 17/8/1.
//  illuspas[a]gmail.com
//  Copyright (c) 2017 Nodemedia. All rights reserved.
//
const Net = require('net');
const NodeRtmpSession = require('./node_rtmp_session');

class NodeRtmpServer {
  constructor(config, sessions, publishers) {
    this.port = config.port;

    this.tcpServer = Net.createServer((socket) => {
      let id = this.generateNewSessionID(sessions);
      let session = new NodeRtmpSession(config, socket);
      sessions.set(id, session);
      session.id = id;
      session.sessions = sessions;
      session.publishers = publishers;
      session.run();
    })
  }

  run() {
    this.tcpServer.listen(this.port, () => {
      console.log(`Node Media Rtmp Server started on port: ${this.port}`);
    })

    this.tcpServer.on('error', (e) => {
      console.log(`Node Media Rtmp Server ${e}`);
    })
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

module.exports = NodeRtmpServer
