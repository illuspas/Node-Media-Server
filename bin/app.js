#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const config = require("./config.json");
const NodeMediaServer = require("..");

if (!fs.existsSync(config.rtmps.key)) {
  config.rtmps.key = path.join(__dirname, config.rtmps.key);

}
if (!fs.existsSync(config.rtmps.cert)) {
  config.rtmps.cert = path.join(__dirname, config.rtmps.cert);
}

if (!fs.existsSync(config.https.key)) {
  config.https.key = path.join(__dirname, config.https.key);

}
if (!fs.existsSync(config.https.cert)) {
  config.https.cert = path.join(__dirname, config.https.cert);
}

const nms = new NodeMediaServer(config);
nms.run(); 