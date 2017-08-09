//
//  Created by Mingliang Chen on 17/8/4.
//  illuspas[a]gmail.com
//  Copyright (c) 2017 Nodemedia. All rights reserved.
//
const EventEmitter = require('events');
const URL = require('url');

const AMF = require('./node_core_amf');
const BufferPool = require('./node_core_bufferpool');


class NodeHttpSession extends EventEmitter {
  constructor(config, req, res) {
    super();
    this.req = req;
    this.res = res;
    this.bp = new BufferPool();
    this.bp.on('error', (e) => {

    });

    this.isPublisher = false;

    this.on('connect',this.onConnect());
    this.on('play',this.onPlay());
    this.on('publish',this.onPublish());

    this.req.on('data', this.onReqData.bind(this));
    this.req.on('close', this.onReqClose.bind(this));
    this.req.on('error', this.onReqError.bind(this));
    
  }

  run() {
    let method = this.req.method;
    let urlInfo = URL.parse(this.req.url, true);
    let streamId = urlInfo.pathname.split('.')[0].slice(1);
    let format = urlInfo.pathname.split('.')[1];
    let publisherId = this.publishers.get(streamId);
    if (format != 'flv') {
      console.log('Unsupported format=' + format);
      this.res.statusCode = 403;
      this.res.end();
      return;
    }
    this.streamId = streamId;
    console.log("[http-flv play] play stream " + this.streamId);
    if (method == 'GET') {
      //Play 
      if (publisherId == null) {
        this.res.statusCode = 404;
        this.res.end();
        return
      }
      console.log("[http-flv play] join stream " + this.streamId);

      this.sessions.get(publisherId).players.add(this.id);
    } else if (method == 'POST') {
      //Publish

      console.log('Unsupported method=' + method);
      this.res.statusCode = 405;
      this.res.end();
      return;
    } else {
      console.log('Unsupported method=' + method);
      this.res.statusCode = 405;
      this.res.end();
      return;
    }

    this.isStarting = true;
    this.bp.init(this.handleData())
  }

  onReqData(data) {
    console.log(data);
    this.bp.push(data);
  }

  onReqClose() {
    this.stop();
  }

  onReqError(e) {

  }

  stop() {
    this.isStarting = false;
    this.bp.stop();
  }

  * handleData() {

    console.log('http-flv parse message [start]');
    while (this.isStarting) {
      if (this.bp.need(9)) {
        if (yield) break;
        
      }
    }

    console.log('http-flv parse message [stop]');
    if(this.isPublisher) {

    } else {
      let publisherId = this.publishers.get(this.streamId);
      if (publisherId != null) {
        this.sessions.get(publisherId).players.delete(this.id);
      }
    }
    this.sessions.delete(this.id);
    this.publishers = null;
    this.sessions = null;
    this.bp = null;
    this.req = null;
    this.res = null;
  }

    respondUnpublish() {
      this.res.end();
    }
}

module.exports = NodeHttpSession;