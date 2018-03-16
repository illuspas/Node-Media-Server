//
//  Created by Mingliang Chen on 18/3/16.
//  illuspas[a]gmail.com
//  Copyright (c) 2018 Nodemedia. All rights reserved.
//

const NodeCoreUtils = require('./node_core_utils');
const NodeRelaySession = require('./node_relay_session');
const context = require('./node_core_ctx');
const fs = require('fs');
const _ = require('lodash');

class NodeRelayServer {
  constructor(config) {
    this.config = config;
    this.relaySessions = new Map();
  }

  run() {
    context.nodeEvent.on('prePlay', this.onPrePlay.bind(this));
    context.nodeEvent.on('postPublish', this.onPostPublish.bind(this));
    context.nodeEvent.on('donePublish', this.onDonePublish.bind(this));
    setTimeout(this.onStatic.bind(this), 100);
    console.log(`Node Media Relay Server started`);
  }

  onStatic() {
    let i = this.config.relay.tasks.length;
    while (i--) {
      let conf = this.config.relay.tasks[i];
      let isStatic = conf.mode === 'static';
      if (isStatic) {
        conf.name = conf.name ? conf.name : NodeCoreUtils.genRandomName();
        conf.ffmpeg = this.config.relay.ffmpeg;
        conf.inPath = conf.edge;
        conf.ouPath = `rtmp://localhost:${this.config.rtmp.port}/${conf.app}/${conf.name}`;
        let session = new NodeRelaySession(conf);
        // this.relaySessions.set();
        session.on('end', () => {

        });
        session.run();
        console.log('static pull', conf);
      }
    }
  }

  onPrePlay(id, streamPath, args) {

  }

  onPostPublish(id, streamPath, args) {

  }

  onDonePublish(id, streamPath, args) {

  }

  stop() {

  }
}

module.exports = NodeRelayServer;