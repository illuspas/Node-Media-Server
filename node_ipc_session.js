//
//  Created by Mingliang Chen on 18/6/19.
//  illuspas[a]gmail.com
//  Copyright (c) 2018 Nodemedia. All rights reserved.
//

const Net = require('net');
const Logger = require('./node_core_logger');
const { RtmpClient } = require('node-media-streamer');

class NodeIpcSession {

  constructor(streamPath, pullPath, pushPath) {
    this.streamPath = streamPath;
    this.app = streamPath.split('/')[1];
    this.stream = streamPath.split('/')[2];

    this.pullPath = pullPath;
    this.pullRtmp = new RtmpClient(this.app, this.stream, '');
    this.pullSocket = null;

    this.pushPath = pushPath;
    this.pushRtmp = new RtmpClient(this.app, this.stream, '');
    this.pushSocket = null;
    this.isStart = false;

    Logger.debug(`[rtmp ipc] Create new ipc stream ${streamPath}`);
  }

  run() {
    this.isStart = true;
    this.pullSocket = Net.createConnection(this.pullPath, () => {
      this.pullRtmp.startPull();
    });
    this.pushSocket = Net.createConnection(this.pushPath, () => {
      this.pushRtmp.startPush();
    });

    this.pullSocket.on('data', (data) => {
      this.pullRtmp.inputData(data, data.length);
    });

    this.pullSocket.on('error', (e) => {
      this.isStart = false;
    });

    this.pullRtmp.on('send', (header, payload) => {
      if (this.isStart) {
        this.pullSocket.write(Buffer.from(header));
        this.pullSocket.write(Buffer.from(payload));
      }

    });

    this.pushSocket.on('data', (data) => {
      this.pushRtmp.inputData(data, data.length);
    });

    this.pushSocket.on('error', (e) => {
      this.isStart = false;
    });

    this.pushRtmp.on('send', (header, payload) => {
      if (this.isStart) {
        this.pushSocket.write(Buffer.from(header));
        this.pushSocket.write(Buffer.from(payload));
      }
    });

    this.pullRtmp.on('audio', (audio, time) => {
      this.pushRtmp.pushAudio(audio, audio.length, time);
    });
    this.pullRtmp.on('video', (video, time) => {
      this.pushRtmp.pushVideo(video, video.length, time);
    });
    this.pullRtmp.on('script', (script, time) => {
      this.pushRtmp.pushScript(script, script.length, time);
    });

    this.pullRtmp.on('status', (code, level, description) => {
      // console.log('[pull]', code, level, description);
      if (level === 'NetStream.Play.UnpublishNotify') {
        this.isStart = false;
      }
    });

    this.pushRtmp.on('status', (code, level, description) => {
      // console.log('[push]', code, level, description);
    });
  }

  stop() {
    this.isStart = false;
    this.pullRtmp.stop();
    this.pushRtmp.stop();

    this.pullSocket.end();
    this.pushSocket.end();
    Logger.debug(`[rtmp ipc] Stop ipc stream ${this.streamPath}`);
  }

}

module.exports = NodeIpcSession
