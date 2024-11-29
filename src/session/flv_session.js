// @ts-check
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
import Context from "../core/context.js";
import AVPacket from "../core/avpacket.js";

/**
 * @class
 * @augments BaseSession
 */
export default class FlvSession extends BaseSession {
  /**
   * @param {Context} ctx
   * @param {express.Request} req
   * @param {express.Response} res
   */
  constructor(ctx, req, res) {
    super();
    this.ctx = ctx;
    this.req = req;
    this.res = res;
    this.ip = req.ip ?? "0.0.0.0";
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

    this.broadcast = this.ctx.broadcasts.get(this.streamPath) ?? new BroadcastServer();
    this.ctx.broadcasts.set(this.streamPath, this.broadcast);
  }

  doPlay = () => {
    logger.info(`FLV session ${this.id} ${this.ip} start play ${this.streamPath}`);
    this.isPublisher = false;
    this.broadcast.postPlay(this);
  };

  doPush = () => {
    logger.info(`FLV session ${this.id} ${this.ip} start push ${this.streamPath}`);
    this.isPublisher = true;
    this.flv.onPacketCallback = this.onPacket;
    const err = this.broadcast.postPush(this);
    if (err != null) {
      logger.error(`FLV session ${this.id} ${this.ip} push ${this.streamPath} error, ${err}`);
      this.res.end();
    }
  };

  /**
   * @param {Buffer} data
   */
  onData = (data) => {
    let err = this.flv.parserData(data);
    if (err != null) {
      logger.error(`FLV session ${this.id} ${this.ip} parserData error, ${err}`);
      this.res.end();
    }
  };

  onClose = () => {
    logger.info(`FLV session ${this.id} close`);
    if (this.isPublisher) {
      this.broadcast.donePush(this);
    } else {
      this.broadcast.donePlay(this);
    }
  };

  /**
   * 
   * @param {string} err 
   */
  onError = (err) => {
    logger.error(`FLV session ${this.id} ${this.ip} socket error, ${err}`);
  };

  /**
   * @param {AVPacket} packet 
   */
  onPacket = (packet) => {
    if (packet.codec_type === 18) {
      const metadata = AMF.parseScriptData(packet.data.buffer, 0, packet.size);
      if (metadata !== null) {
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
    this.broadcast.broadcastMessage(packet);
  };

  /**
   * @override
   * @param {Buffer} buffer
   */
  sendBuffer = (buffer) => {
    this.res.write(buffer);
  };
}
