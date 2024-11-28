//
//  Created by Chen Mingliang on 23/11/30.
//  illuspas@msn.com
//  Copyright (c) 2023 NodeMedia. All rights reserved.
//

import express from "express";
import BaseSession from "./base_session.js";
import BroadcastServer from "../server/broadcast_server.js";
import Flv from "../protocol/flv.js";
import AMF from "../protocol/amf.js";
import logger from "../core/logger.js";

export default class FlvSession extends BaseSession {
  /**
   * @param {*} ctx
   * @param {express.Request} req
   * @param {express.Response} res
   */
  constructor(ctx, req, res) {
    super(ctx);
    this.ctx = ctx;
    this.req = req;
    this.res = res;
    this.ip = req.ip;
    this.protocol = "flv";
    this.streamHost = req.hostname;
    this.streamApp = req.params.app;
    this.streamName = req.params.name;
    this.streamPath = "/" + this.streamApp + "/" + this.streamName;
    this.streamQuery = req.query;
    this.flv = new Flv();

    req.on("data", this.onData);
    req.on("error", this.onError);
    req.socket.on("close", this.onClose);

    /** @type {Map<string, BaseSession>} */
    this.sessions = this.ctx.sessions;
    this.sessions.set(this.id, this);

    /** @type {Map<string, BaseSession>} */
    this.broadcasts = this.ctx.broadcasts;

    /** @type {BroadcastServer} */
    this.broadcast = this.broadcasts.has(this.streamPath) ? this.broadcasts.get(this.streamPath) : new BroadcastServer();
    this.broadcasts.set(this.streamPath, this.broadcast);
  }

  doPlay = () => {
    logger.info(`FLV session ${this.id} ${this.ip} start play ${this.streamPath}`);
    this.isPublisher = false;
    this.broadcast.postPlay(this);
  };

  doPush = () => {
    logger.info(`FLV session ${this.id} ${this.ip} start push ${this.streamPath}`);
    this.isPublisher = true;
    this.flv.on("flvtag", this.onFlvTag);
    const err = this.broadcast.postPush(this);
    if (err != null) {
      logger.error(`FLV session ${this.id} ${this.ip} error push ${this.streamPath}, ${err}`);
      this.res.end();
    }
  };

  /**
   * @param {Buffer} data
   */
  onData = (data) => {
    this.flv.parserData(data);
  };

  onClose = () => {
    logger.info(`FLV session ${this.id} close`);
    if (this.isPublisher) {
      this.broadcast.donePush(this);
    } else {
      this.broadcast.donePlay(this);
    }
  };

  onError = (err) => {
    logger.info(`FLV session ${this.id} ${this.ip} error, ${err}`);
  };

  /**
   * @param {number} type
   * @param {number} size
   * @param {number} time
   * @param {Buffer} data
   */
  onFlvTag = (type, size, time, data) => {
    if (type === 18) {
      const metadata = AMF.parseScriptData(data.buffer, 0, size);
      if (metadata != null) {
        this.videoCodec = metadata.videocodecid;
        this.videoWidth = metadata.width;
        this.videoHeight = metadata.height;
        this.videoFramerate = metadata.framerate;
        this.videoDatarate = metadata.videodatarate;
        this.audioCodec = metadata.audiocodecid;
        this.audioChannels = metadata.stereo ? 2 : 1;
        this.audioSamplerate = metadata.audiosamplerate;
        this.audioDatarate = metadata.audiodatarate;
      }
    }
    let packet = Flv.parserTag(type, time, size, data);
    // if (packet.codec_type == 9) {
    //   logger.debug(`flv parser get packet time:${time} type:${packet.codec_type} pts:${packet.pts} dts:${packet.dts} size:${packet.size}`);
    // }
    this.broadcast.broadcastMessage(packet);
  };

  /**
   * @param {Buffer} buffer
   */
  sendBuffer = (buffer) => {
    this.res.write(buffer);
  };
}
