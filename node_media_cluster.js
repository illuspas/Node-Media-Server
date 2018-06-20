//
//  Created by Mingliang Chen on 18/6/20.
//  illuspas[a]gmail.com
//  Copyright (c) 2018 Nodemedia. All rights reserved.
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
      Logger.log(`Master ${process.pid} is running`);

      const messageHandler = (msg) => {
        for (let id in cluster.workers) {
          cluster.workers[id].send(msg);
        }
      }

      const newWorker = () => {
        let worker = cluster.fork();
        worker.on('message', messageHandler);
      }

      for (let i = 0; i < this.config.cluster.num; i++) {
        newWorker();
      }

      cluster.on('exit', (worker, code, signal) => {
        Logger.log(`worker ${worker.process.pid} died`);
        newWorker();
      });

    } else {
      this.nms = new NodeMediaServer(this.config);
      this.nms.run();
      Logger.log(`worker ${process.pid} started`);
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