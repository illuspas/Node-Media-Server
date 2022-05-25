#!/usr/bin/env node

const NodeMediaServer = require('..');
const config = {
  rtmp: {
    port: 1935,
  },
  http: {
    port: 8000,
  },
};

let nms = new NodeMediaServer(config);

setTimeout(() => {
  nms.stop();
}, 3000);

nms.run();