//
//  Created by Mingliang Chen on 18/6/19.
//  illuspas[a]gmail.com
//  Copyright (c) 2018 Nodemedia. All rights reserved.
//
const Logger = require('./node_core_logger');
const NodeRtmpClient = require('./node_rtmp_client');

class NodeIpcSession {

  constructor(streamPath, pullPath, pushPath) {
    this.streamPath = streamPath;
    this.app = streamPath.split('/')[1];
    this.stream = streamPath.split('/')[2];

    this.pullPath = pullPath;
    this.pullRtmp = new NodeRtmpClient(`rtmp://127.0.0.1:${pullPath}${streamPath}`);

    this.pushPath = pushPath;
    this.pushRtmp = new NodeRtmpClient(`rtmp://127.0.0.1:${pushPath}${streamPath}`);

    this.isStart = false;

    Logger.debug(`[rtmp ipc] Create new ipc stream ${streamPath}`);
  }

  run() {
    this.isStart = true;
    this.pushRtmp.on('status', (info) => {
      if (info.code === 'NetStream.Publish.Start') {
        this.pullRtmp.startPull();
      }
    });

    this.pullRtmp.on('audio', (audioData, timestamp) => {
      this.pushRtmp.pushAudio(audioData, timestamp);
    });

    this.pullRtmp.on('video', (videoData, timestamp) => {
      this.pushRtmp.pushVideo(videoData, timestamp);
    });

    this.pullRtmp.on('script', (scriptData, timestamp) => {
      this.pushRtmp.pushScript(scriptData, timestamp);
    });

    this.pushRtmp.startPush();
  }

  stop() {
    this.isStart = false;

    this.pullRtmp.stop();
    this.pushRtmp.stop();

    Logger.debug(`[rtmp ipc] Stop ipc stream ${this.streamPath}`);
  }

}

module.exports = NodeIpcSession
