//
//  Created by Steve Roberts (Go Media Ltd) on 2020/2/4.
//  steve[a]gomedia.co
//  Copyright (c) 2019 Go Media Ltd. All rights reserved.
//
const Fs = require('fs');
const URL = require("url");
const AMF = require("./node_core_amf");
const Logger = require("./node_core_logger");
const context = require("./node_core_ctx");
const NodeCoreUtils = require("./node_core_utils");

class NodeHlsSession {
  constructor(config, req, res) {
    this.config = config;
    this.req = req;
    this.res = res;
    this.id = req.params.key;
    this.ip = this.req.socket.remoteAddress;

    this.playStreamPath = '/' + req.params.app + '/' + req.params.key;
    this.playArgs = null;

    this.isStarting = false;
    this.isPlaying = false;
    this.isIdling = false;

    this.res.cork = this.res.socket.cork.bind(this.res.socket);
    this.res.uncork = this.res.socket.uncork.bind(this.res.socket);
    this.req.socket.on("close", this.onReqClose.bind(this));
    this.req.on("close", this.onReqClose.bind(this));
    this.req.on("error", this.onReqError.bind(this));
    req.on('end', () => {
      Logger.debug(`[HLS Session] Request Ended`)
    });

    this.TAG = "http-hls";

    // this.numPlayCache = 0;
    context.sessions.set(this.id, this);
  }

  play(url) {
    let index = (this.config.http.hlsroot || this.config.http.mediaroot) + this.playStreamPath + (url === '/' ? '/index.m3u8' : url);
    Logger.log(`[${this.TAG} play] Loading stream. id=${this.id} Index=${index}, Path=${this.playStreamPath} `);

    if (this.playCheck) {
      clearTimeout(this.playCheck);
    }
    this.playCheck = setTimeout(() => {
      this.stop()
    }, 20000);

    if (Fs.existsSync(index)) {
      Logger.log(`[${this.TAG} play] Sending stream. id=${this.id} Index=${index} `);
      this.isPlaying = true;
      return index;
    } else {
      Logger.log(`[${this.TAG} play] Error Loading stream. id=${this.id} Index=${index} `);
      this.res.status(404);
      this.stop()
      return null;
    }
  }

  run() {
    // let method = this.req.method;
    // let urlInfo = URL.parse(this.req.url, true);
    // let streamPath = '/' + this.req.params.app + '/' + this.req.params.key;

    // if (method === "GET") {
    //   this.playStreamPath = streamPath;
    //   this.playArgs = urlInfo.query;

    //   this.connectCmdObj = { ip: this.ip, method, streamPath, query: urlInfo.query, data: this.req.params };
    //   this.connectTime = new Date();
    //   this.isStarting = true;
    //   Logger.log(`[${this.TAG} connect] id=${this.id} ip=${this.ip} args=${JSON.stringify(urlInfo.query)}`);
    //   context.nodeEvent.emit("preConnect", this.id, this.connectCmdObj);
    //   if (!this.isStarting) {
    //     this.stop();
    //     return;
    //   }
    //   context.nodeEvent.emit("postConnect", this.id, this.connectCmdObj);
    //   this.onPlay();

    // } else {
    //   this.stop();
    // }

  }

  async start() {
    let prePlay = await context.nodeCheck.run("prePlay", {
      id: this.id,
      eventName: "prePlay",
      stream: {
        app: this.req.params.app,
        key: this.req.params.key,
        type: 'hls'
      },
      data: this.req.params
    });

    if (prePlay && typeof prePlay === 'object') {
      this.playStreamPath = '/' + prePlay.app + '/' + prePlay.key;
    }

    return prePlay ? (prePlay.error ? false : true) : true;
  }

  async stop() {
    this.isStarting = false;
    if (this.isPlaying) {
      context.nodeEvent.emit("donePlay", this.id, this.playStreamPath, this.playArgs);

      context.nodeCheck.run("donePlay", {
        id: this.id,
        eventName: "donePlay",
        stream: {
          app: this.req.params.app,
          key: this.req.params.key,
          type: 'hls'
        },
        data: this.req.params
      });

      Logger.log(`[${this.TAG} play] Close stream. id=${this.id} streamPath=${this.playStreamPath}`);
      Logger.log(`[${this.TAG} disconnect] id=${this.id}`);
      context.nodeEvent.emit("doneConnect", this.id, {});

      if (this.res) {
        this.res.end();
      }
      this.isPlaying = false;
    }

    context.sessions.delete(this.id);
  }

  onReqClose() {
    Logger.log(`[${this.TAG} play] Close stream. id=${this.id} streamPath=${this.playStreamPath}`);
  }

  onReqError(e) {
    Logger.log(`[${this.TAG} play] Error stream. id=${this.id} streamPath=${this.playStreamPath}`);
    this.res.status(500);
    this.stop();
  }

  reject() {
    Logger.log(`[${this.TAG} reject] id=${this.id}`);
    this.stop();
  }

  onPlay() {
    context.nodeEvent.emit("prePlay", this.id, this.playStreamPath, this.playArgs);
    if (!this.isStarting) {
      return;
    }
    // let prePlay = await context.nodeCheck.run("prePlay", {
    //   id: this.id,
    //   eventName: "prePlay",
    //   type: 'hls',
    //   stream: {
    //     path: streamPath,
    //     app: this.appname,
    //     key: invokeMessage.streamName.split("?")[0]
    //   },
    //   data: this.playArgs
    // });


    if (this.config.auth !== undefined && this.config.auth.play) {
      let results = NodeCoreUtils.verifyAuth(this.playArgs.sign, this.playStreamPath, this.config.auth.secret);
      if (!results) {
        Logger.log(`[${this.TAG} play] Unauthorized. id=${this.id} streamPath=${this.playStreamPath} sign=${this.playArgs.sign}`);
        this.res.statusCode = 403;
        this.res.end();
        return;
      }
    }

    if (!context.publishers.has(this.playStreamPath)) {
      Logger.log(`[${this.TAG} play] Stream not found. id=${this.id} streamPath=${this.playStreamPath} `);
      context.idlePlayers.add(this.id);
      this.isIdling = true;
      this.res.statusCode = 404;
      this.res.end();
      return;
    }

    this.onStartPlay();
  }

  onStartPlay() {
    let publisherId = context.publishers.get(this.playStreamPath);
    let publisher = context.sessions.get(publisherId);
    let players = publisher.players;
    players.add(this.id);

    //send HLS index
    let index = (this.config.http.hlsroot || this.config.http.mediaroot) + this.playStreamPath + (this.req.url === '/' ? '/index.m3u8' : this.req.url);
    // console.log('index', index);
    if (Fs.existsSync(index)) {
      Logger.log(`[${this.TAG} play] Loading stream. id=${this.id} Index=${index} `);
      this.res.sendFile(index);
    } else {
      Logger.log(`[${this.TAG} play] Error Loading stream. id=${this.id} Index=${index} `);
    }

    this.isIdling = false;
    this.isPlaying = true;
    Logger.log(`[${this.TAG} play] Join stream. id=${this.id} streamPath=${this.playStreamPath} file=${index}`);
    context.nodeEvent.emit("postPlay", this.id, this.playStreamPath, this.playArgs);
  }
}

module.exports = NodeHlsSession;
