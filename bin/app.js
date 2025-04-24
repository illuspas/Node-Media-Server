#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const config = require("./config.json");
const NodeMediaServer = require("..");
const BaseSession = require("../src/session/base_session");

if (config.rtmps?.key && !fs.existsSync(config.rtmps.key)) {
  config.rtmps.key = path.join(__dirname, config.rtmps.key);

}
if (config.rtmps?.cert && !fs.existsSync(config.rtmps.cert)) {
  config.rtmps.cert = path.join(__dirname, config.rtmps.cert);
}

if (config.https?.key && !fs.existsSync(config.https.key)) {
  config.https.key = path.join(__dirname, config.https.key);

}
if (config.https?.cert && !fs.existsSync(config.https.cert)) {
  config.https.cert = path.join(__dirname, config.https.cert);
}

/**
 * 
 * @param {string} action 
 * @param {BaseSession} session 
 */
const notify = (action, session) => {
  fetch(config.notify.url, {
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

const nms = new NodeMediaServer(config);

if (config.notify.url !== "") {

  nms.on("postPlay", (session) => {
    notify("postPlay", session);
  });

  nms.on("donePlay", (session) => {
    notify("donePlay", session);
  });

  nms.on("postPublish", (session) => {
    notify("postPublish", session);
  });

  nms.on("donePublish", (session) => {
    notify("donePublish", session);
  });

  nms.on("doneRecord", (session) => {
    notify("doneRecord", session);
  });
}

nms.run(); 