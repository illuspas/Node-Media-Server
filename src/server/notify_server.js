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
  }

  run() {
    if (!Context.config.notify?.url) {
      return;
    }
    Context.eventEmitter.on("prePlay", (session) => {
      this.notify("prePlay", session);
    });

    Context.eventEmitter.on("postPlay", (session) => {
      this.notify("postPlay", session);
    });

    Context.eventEmitter.on("donePlay", (session) => {
      this.notify("donePlay", session);
    });

    Context.eventEmitter.on("prePublish", (session) => {
      this.notify("postPublish", session);
    });

    Context.eventEmitter.on("postPublish", (session) => {
      this.notify("postPublish", session);
    });

    Context.eventEmitter.on("donePublish", (session) => {
      this.notify("donePublish", session);
    });

    Context.eventEmitter.on("postRecord", (session) => {
      this.notify("postRecord", session);
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
    const payload = {
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
    };

    // Include metadata fields in donePublish event (metadata available after stream starts)
    if (action === "donePublish") {
      payload.title = session.streamTitle || session.streamName;
      payload.description = session.streamDescription || "";
      payload.encoder = session.encoder || "";
      payload.metadata = session.metadata || {};
    }

    fetch(Context.config.notify.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
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