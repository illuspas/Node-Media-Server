//
//  Created by Mingliang Chen on 17/8/1.
//  illuspas[a]gmail.com
//  Copyright (c) 2017 Nodemedia. All rights reserved.
//
const Net = require('net');
const NodeRtmpSession = require('./node_rtmp_session');
const NodeCoreUtils = require('./node_core_utils');
const RTMP_PORT = 1935;

class NodeRtmpServer {
  constructor(config, sessions, publishers, idlePlayers) {
    this.port = config.rtmp.port ? config.rtmp.port : RTMP_PORT;
    this.sessions = sessions;
    this.tcpServer = Net.createServer((socket) => {
      let id = NodeCoreUtils.generateNewSessionID(sessions);
      let session = new NodeRtmpSession(config, socket);
      sessions.set(id, session);
      session.id = id;
      session.sessions = sessions;
      session.publishers = publishers;
      session.idlePlayers = idlePlayers;
      session.run();
    })
  }

  run() {
    this.tcpServer.listen(this.port, () => {
      console.log(`Node Media Rtmp Server started on port: ${this.port}`);
    });

    this.tcpServer.on('error', (e) => {
      console.error(`Node Media Rtmp Server ${e}`);
    });

    this.tcpServer.on('close', () => {
      console.log('Node Media Rtmp Server Close.');
    });
  }

  stop() {
    this.tcpServer.close();
    this.sessions.forEach((session, id) => {
      if (session instanceof NodeRtmpSession) {
        session.socket.destroy();
        this.sessions.delete(id);
      }
    });
  }
}

module.exports = NodeRtmpServer
