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
const Os = require('os');

const IPC_NAME_SPACE = '/nms-ipc-sock-';

class NodeIpcServer {
  constructor(config) {
    this.config = config;
    this.sessions = new Map();
    this.isWin = true;// Os.platform() === 'win32';

    // if (this.isWin) {
    //   // On windows, using tcp socket for ipc :(
    //   // windows named pipe doesn't work on cluster mode
    //   // this.ipcRootPath = path.join('\\\\?\\pipe', Os.tmpdir());
    this.ipcPath = 0;
    // } else {
    //   // On Unix like, using unix domain socket for ipc :)
    //   this.ipcRootPath = Os.tmpdir();
    //   this.ipcPath = this.ipcRootPath + IPC_NAME_SPACE + process.pid;
    // }

    this.ipcServer = Net.createServer((socket) => {
      let session = new NodeRtmpSession(config, socket);
      session.isIPC = true;
      session.run();
    })
  }

  run() {
    if (this.isWin) {
      this.ipcServer.listen({ port: 0, host: '127.0.0.1', exclusive: true }, () => {
        this.ipcPath = this.ipcServer.address().port;
        Logger.log(`Node Media IPC Server started at`, this.ipcPath);
      });
    } else {
      this.ipcServer.listen(this.ipcPath, () => {
        Logger.log(`Node Media IPC Server started at`, this.ipcPath);
      });
    }

    context.nodeEvent.on('postPublish', this.onPostPublish.bind(this));
    context.nodeEvent.on('donePublish', this.onDonePublish.bind(this));

    process.on('message', (msg) => {
      if (this.isWin) {
        if (this.ipcPath === msg.pid) {
          Logger.debug('[rtmp ipc] Current process, ignore');
          return;
        }
      } else {
        if (process.pid === msg.pid) {
          Logger.debug('[rtmp ipc] Current process, ignore');
          return;
        }
      }

      if (this.isWin) {
        Logger.debug(`[rtmp ipc] receive message cmd=${msg.cmd} port=${msg.pid} path=${msg.streamPath}`);
      } else {
        Logger.debug(`[rtmp ipc] receive message cmd=${msg.cmd} pid=${msg.pid} path=${msg.streamPath}`);
      }

      if (msg.cmd === 'postPublish') {
        let pullPath = this.isWin ? msg.pid : this.ipcRootPath + IPC_NAME_SPACE + msg.pid;
        let ipcSession = new NodeIpcSession(msg.streamPath, pullPath, this.ipcPath);
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
    let pid = this.isWin ? this.ipcPath : process.pid;
    process.send({ cmd: 'postPublish', pid, streamPath });
  }

  onDonePublish(id, streamPath, args) {
    let pid = this.isWin ? this.ipcPath : process.pid;
    process.send({ cmd: 'donePublish', pid, streamPath });
  }

}

module.exports = NodeIpcServer