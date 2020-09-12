//
//  Created by Mingliang Chen on 17/8/1.
//  illuspas[a]gmail.com
//  Copyright (c) 2018 Nodemedia. All rights reserved.
//
const Logger = require('./node_core_logger');

const Tls = require('tls');
const Fs = require('fs');
const Net = require('net');
const NodeRtmpSession = require('./node_rtmp_session');
const NodeCoreUtils = require('./node_core_utils');

const context = require('./node_core_ctx');

const RTMP_PORT = 1935;

class NodeRtmpServer {
  constructor(config) {
    config.rtmp.port = this.port = config.rtmp.port ? config.rtmp.port : RTMP_PORT;
	
    if (config.rtmp.SSL){
      this.protocol = 'Rtmps';
      try {
        const options = {
          key: Fs.readFileSync(config.rtmp.SSL.key),
          cert: Fs.readFileSync(config.rtmp.SSL.cert)
        }
        this.tcpServer = Tls.createServer(options, (socket) => {
          let session = new NodeRtmpSession(config, socket);
          session.run();
        });
      }
      catch (e) {
        Logger.error(`Node Media Rtmps Server error while reading SSL certs: <${e}>`);
      }
    } else {
      this.protocol = 'Rtmp';
      this.tcpServer = Net.createServer((socket) => {
        let session = new NodeRtmpSession(config, socket);
        session.run();
      })
    }
  }

  run() {
    this.tcpServer.listen(this.port, () => {
      Logger.log(`Node Media ${this.protocol} Server started on port: ${this.port}`);
    });

    this.tcpServer.on('error', (e) => {
      Logger.error(`Node Media ${this.protocol} Server ${e}`);
    });

    this.tcpServer.on('close', () => {
      Logger.log(`Node Media ${this.protocol} Server Close.`);
    });
  }

  stop() {
    this.tcpServer.close();
    context.sessions.forEach((session, id) => {
      if (session instanceof NodeRtmpSession)
        session.stop();
    });
  }
}

module.exports = NodeRtmpServer
