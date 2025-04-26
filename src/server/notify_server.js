// @ts-check
//
//  Created by Chen Mingliang on 25/04/26.
//  illuspas@msn.com
//  Copyright (c) 2025 NodeMedia. All rights reserved.
//
const Context = require("../core/context.js");
const BaseSession = require("../session/base_session");

class NodeNotifyServer {
  constructor(config) {
    this.config = config;
  }

  run() {
    if(!this.config.notify?.url ) {
      return;
    }

    Context.eventEmitter.on("postPlay", (session) => {
      this.notify("postPlay", session);
    });
  
    Context.eventEmitter.on("donePlay", (session) => {
      this.notify("donePlay", session);
    });
  
    Context.eventEmitter.on("postPublish", (session) => {
      this.notify("postPublish", session);
    });
  
    Context.eventEmitter.on("donePublish", (session) => {
      this.notify("donePublish", session);
    });
  
    Context.eventEmitter.on("doneRecord", (session) => {
      this.notify("doneRecord", session);
    });
  }

  /**
   * 
   * @param {string} action 
   * @param {BaseSession} session 
   */
  notify(action, session) {
    fetch(this.config.notify.url, {
      method: "POST",
      body: JSON.stringify({
        id: session.id,
        ip: session.ip,
        app: session.streamApp,
        name: session.streamName,
        query: session.streamQuery,
        protocol: session.protocol,
        createtime: session.createTime,
        endtime: session.endTime,
        inbytes: session.inBytes,
        outbytes: session.outBytes,
        filePath: session.filePath,
        action: action,
      }),
    }
    ).then((res) => {
      if (res.status !== 200) {
        session.close();
      }
    }).catch((err) => {
  
    });
  };
}

module.exports = NodeNotifyServer;