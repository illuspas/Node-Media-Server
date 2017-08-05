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
    this.sessions = sessions;

    this.tcpServer = Net.createServer((socket) => {
      const id = this.generateNewSessionID();
      let session = new NodeRtmpSession(config, id, sessions, publishers);
      sessions.set(id, session);

      session.on('data', (data) => {
        socket.write(data);
      });

      session.on('end', () => {
        socket.end();
      });

      socket.on('error', (e) => {
        // console.error(`ID:${id} socket error:`);
        session.stop();
      });

      socket.on('data', (data) => {
        session.push(data);
      });

      socket.on('end', () => {
        // console.log(`ID:${id} socket end`);
        session.stop();
      });

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

  generateNewSessionID() {
    let SessionID = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWKYZ0123456789';
    const numPossible = possible.length;
    do {
      for (var i = 0; i < 8; i++) {
        SessionID += possible.charAt((Math.random() * numPossible) | 0);
      }
    } while (this.sessions.has(SessionID))
    return SessionID;
  }
}

module.exports = NodeRtmpServer
