#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const config = require("./config.json");
const NodeMediaServer = require("..");

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

const nms = new NodeMediaServer(config);


nms.on("prePlay", (session) => {
  console.log("prePlay", session.id, session.streamApp, session.streamName, session.streamQuery);
});

nms.on("postPlay", (session) => {
  console.log("postPlay", session.id);
});

nms.on("donePlay", (session) => {
  console.log("donePlay", session.id, session.createTime, session.outBytes);
});

nms.on("prePush", (session) => {
  console.log("prePush", session.id, session.streamApp, session.streamName, session.streamQuery);

  // fetch("http://127.0.0.1:8008/notify", {
  //   method: "POST",
  //   body: JSON.stringify({
  //     id: session.id,
  //     ip: session.ip,
  //     app: session.streamApp,
  //     name: session.streamName,
  //     query: session.streamQuery,
  //     protocol: session.protocol,
  //     action: "prePush"
  //   }),
  // }
  // ).then((res) => {
  //   if (res.status !== 200) {
  //     session.close();
  //   }
  // });

});
nms.on("postPush", (session) => {
  console.log("postPush", session.id);
});
nms.on("donePush", (session) => {
  console.log("donePush", session.id, session.createTime, session.inBytes);
});
nms.run(); 