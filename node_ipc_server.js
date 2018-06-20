//
//  Created by Mingliang Chen on 18/6/19.
//  illuspas[a]gmail.com
//  Copyright (c) 2017 Nodemedia. All rights reserved.
//

const NodeRtmpSession = require('./node_rtmp_session');
const NodeIpcSession = require('./node_ipc_session');
const context = require('./node_core_ctx');
const Logger = require('./node_core_logger');
const path = require('path');
const Net = require('net');
const Os = require('os');

const IPC_NAME_SPACE = '/nms-ipc-sock-';

class NodeIpcServer {
  constructor(config) {
    this.config = config;
    this.sessions = new Map();

    if (Os.platform() === 'win32') {
      this.ipcRootPath = path.join('\\\\?\\pipe', Os.tmpdir());
    } else {
      this.ipcRootPath = Os.tmpdir();
    }
    this.ipcPath = this.ipcRootPath + IPC_NAME_SPACE + process.pid;

    this.ipcServer = Net.createServer((socket) => {
      let session = new NodeRtmpSession(config, socket);
      session.isIPC = true;
      session.run();
    })
  }

  run() {
    this.ipcServer.listen(this.ipcPath, () => {
      Logger.log(`Node Media IPC Server started`, this.ipcPath);
    });

    context.nodeEvent.on('postPublish', this.onPostPublish.bind(this));
    context.nodeEvent.on('donePublish', this.onDonePublish.bind(this));

    process.on('message', (msg) => {
      if (process.pid === msg.pid) {
        Logger.debug('[rtmp ipc] Current process, ignore');
        return;
      }

      if (msg.cmd === 'postPublish') {
        let ipcSession = new NodeIpcSession(msg.streamPath, this.ipcRootPath + IPC_NAME_SPACE + msg.pid, this.ipcPath);
        this.sessions.set(msg.streamPath, ipcSession);
        ipcSession.run();
      } else if (msg.cmd === 'donePublish') {
        let ipcSession = this.sessions.get(msg.streamPath);
        ipcSession.stop();
        this.sessions.delete(msg.streamPath);
      }

      Logger.debug(`[rtmp ipc] receive message cmd=${msg.cmd} pid=${msg.pid} path=${msg.streamPath}`);
    });
  }

  stop() {

  }

  onPostPublish(id, streamPath, args) {
    process.send({ cmd: 'postPublish', pid: process.pid, streamPath });
  }

  onDonePublish(id, streamPath, args) {
    console.log(streamPath);
    process.send({ cmd: 'donePublish', pid: process.pid, streamPath });
  }

}

module.exports = NodeIpcServer