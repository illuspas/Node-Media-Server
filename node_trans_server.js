//
//  Created by Mingliang Chen on 18/3/9.
//  illuspas[a]gmail.com
//  Copyright (c) 2018 Nodemedia. All rights reserved.
//

const NodeTransSession = require('./node_trans_session');
const context = require('./node_core_ctx');
const _ = require('lodash');


class NodeTransServer {
  constructor(config) {
    this.config = config;
    this.transSessions = new Map();
  }

  run() {
    let i = this.config.trans.tasks.length;
    let apps = '';
    while (i--) {
      apps += this.config.trans.tasks[i].app;
      apps += ' ';
    }
    console.log(`Node Media Trans Server started for apps:[ ${apps}]`);
    context.nodeEvent.on('postPublish', this.onPostPublish.bind(this));
    context.nodeEvent.on('donePublish', this.onDonePublish.bind(this));
  }

  onPostPublish(id, streamPath, args) {
    let regRes = /\/(.*)\/(.*)/gi.exec(streamPath);
    let [app, stream] = _.slice(regRes, 1);
    let i = this.config.trans.tasks.length;
    while (i--) {
      let conf = this.config.trans.tasks[i];
      conf.port = this.config.rtmp.port;
      conf.ffmpeg = this.config.trans.ffmpeg;
      conf.streamPath = streamPath;
      conf.stream = stream;
      conf.args = args;
      if (app === conf.app) {
        let session = new NodeTransSession(conf);
        this.transSessions.set(id, session);
        session.on('end', () => {
          this.transSessions.delete(streamPath);
        });
        session.run();
      }
    }
  }

  onDonePublish(id, streamPath, args) {
    let session =  this.transSessions.get(id);
    session.end();
  }
}

module.exports = NodeTransServer;
