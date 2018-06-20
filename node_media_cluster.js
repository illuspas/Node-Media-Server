//
//  Created by Mingliang Chen on 18/6/20.
//  illuspas[a]gmail.com
//  Copyright (c) 2017 Nodemedia. All rights reserved.
//

const NodeMediaServer = require('./node_media_server');
const cluster = require('cluster');
const context = require('./node_core_ctx');
const Logger = require('./node_core_logger');

class NodeMediaCluster {
  constructor(config) {
    this.config = config;
  }

  run() {
    if (cluster.isMaster) {
      Logger.log(`主进程 ${process.pid} 正在运行`);

      const messageHandler = (msg) => {
        //broadcast to all worker
        for (let id in cluster.workers) {
          cluster.workers[id].send(msg);
        }
      }

      const newWorker = () => {
        let worker = cluster.fork();
        worker.on('message', messageHandler);
      }

      // 衍生工作进程。
      for (let i = 0; i < this.config.cluster.num; i++) {
        newWorker();
      }

      // 工作进程退出,重启一个
      cluster.on('exit', (worker, code, signal) => {
        Logger.log(`工作进程 ${worker.process.pid} 已退出`);
        newWorker();
      });

    } else {
      // 工作进程可以共享任何 TCP 连接。
      // 在本例子中，共享的是一个 HTTP 服务器。
      this.nms = new NodeMediaServer(this.config);
      this.nms.run();
      Logger.log(`工作进程 ${process.pid} 已启动`);
    }
  }

  on(eventName, listener) {
    if (cluster.isWorker) {
      context.nodeEvent.on(eventName, listener);
    }
  }

  stop() {
    if (cluster.isWorker) {
      this.nms.stop();
    }
  }

}


module.exports = NodeMediaCluster