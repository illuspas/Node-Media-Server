// @ts-check
//
//  Created by Chen Mingliang on 25/04/26.
//  illuspas@msn.com
//  Copyright (c) 2025 NodeMedia. All rights reserved.
//
const Context = require("../core/context.js");
const BaseSession = require("../session/base_session");

class NodeNotifyServer {
  constructor() {
    /** @type {Array<[string, (session: BaseSession) => void]>} */
    this._listeners = [];
  }

  run() {
    if (!Context.config.notify?.url) {
      return;
    }
    const actions = ["prePlay", "postPlay", "donePlay", "prePublish", "postPublish", "donePublish", "postRecord", "doneRecord"];
    for (const action of actions) {
      const listener = (session) => {
        this.notify(action, session);
      };
      this._listeners.push([action, listener]);
      Context.eventEmitter.on(action, listener);
    }
  }

  /**
   * Remove all registered event listeners.
   * @returns {void}
   */
  stop() {
    for (const [action, listener] of this._listeners) {
      Context.eventEmitter.off(action, listener);
    }
    this._listeners = [];
  }

  /**
   * 
   * @param {string} action 
   * @param {BaseSession} session 
   */
  notify(action, session) {
    fetch(Context.config.notify.url, {
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