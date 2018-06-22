//
//  Created by Mingliang Chen on 18/6/19.
//  illuspas[a]gmail.com
//  Copyright (c) 2018 Nodemedia. All rights reserved.
//

const NodeRtmpSession = require('./node_rtmp_session');
const NodeIpcSession = require('./node_ipc_session');
const context = require('./node_core_ctx');
const Logger = require('./node_core_logger');
const Net = require('net');

class NodeIpcServer {
  constructor(config) {
    this.config = config;
    this.sessions = new Map();
    this.ipcPort = 0;
    this.ipcServer = Net.createServer((socket) => {
      let session = new NodeRtmpSession(config, socket);
      session.isIPC = true;
      session.run();
    })
  }

  run() {
    this.ipcServer.listen({ port: 0, host: '127.0.0.1', exclusive: true }, () => {
      this.ipcPort = this.ipcServer.address().port;
      Logger.log(`Node Media IPC Server started at`, this.ipcPort);
    });

    context.nodeEvent.on('postPublish', this.onPostPublish.bind(this));
    context.nodeEvent.on('donePublish', this.onDonePublish.bind(this));

    process.on('message', (msg) => {
      if (this.ipcPort === msg.port) {
        Logger.debug('[rtmp ipc] Current process, ignore');
        return;
      }

      Logger.debug(`[rtmp ipc] receive message from pid=${msg.pid} cmd=${msg.cmd} port=${msg.port} streamPath=${msg.streamPath}`);

      if (msg.cmd === 'postPublish') {
        let ipcSession = new NodeIpcSession(msg.streamPath, msg.port, this.ipcPort);
        this.sessions.set(msg.streamPath, ipcSession);
        ipcSession.run();
      } else if (msg.cmd === 'donePublish') {
        let ipcSession = this.sessions.get(msg.streamPath);
        ipcSession.stop();
        this.sessions.delete(msg.streamPath);
      }

    });
  }

  stop() {
    this.ipcServer.close();
  }

  onPostPublish(id, streamPath, args) {
    process.send({ cmd: 'postPublish', pid: process.pid, port: this.ipcPort, streamPath });
  }

  onDonePublish(id, streamPath, args) {
    process.send({ cmd: 'donePublish', pid: process.pid, port: this.ipcPort, streamPath });
  }

}

module.exports = NodeIpcServer