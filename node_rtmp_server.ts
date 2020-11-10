//  Created by Mingliang Chen on 17/8/1.
//  illuspas[a]gmail.com
//  Copyright (c) 2017 Nodemedia. All rights reserved.

import * as net from 'net';

import { generateNewSessionID } from './node_core_utils';
import { NodeRtmpSession } from './node_rtmp_session';

const RTMP_PORT = 1935;

export class NodeRtmpServer {
  port: number;
  tcpServer: net.Server;

  constructor(config, sessions, publishers, idlePlayers) {
    this.port = config.rtmp.port ? config.rtmp.port : RTMP_PORT;

    this.tcpServer = net.createServer(socket => {
      const id = generateNewSessionID();
      const session = new NodeRtmpSession(config, socket);
      sessions.set(id, session);
      session.id = id;
      session.sessions = sessions;
      session.publishers = publishers;
      session.idlePlayers = idlePlayers;
      session.run();
    });
  }

  run() {
    this.tcpServer.listen(this.port, () => {
      console.log(`Node Media Rtmp Server started on port: ${this.port}`);
    });

    this.tcpServer.on('error', e => {
      console.error(`Node Media Rtmp Server ${e}`);
    });
  }
}
