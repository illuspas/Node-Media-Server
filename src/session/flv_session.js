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
    this.flv = new Flv();
    this.protocol = "flv";
    this.streamHost = req.hostname;
    this.streamApp = req.params.app;
    this.streamName = req.params.name;
    this.streamPath = "/" + this.streamApp + "/" + this.streamName;
    this.streamQuery = req.query;
    this.broadcast = this.ctx.broadcasts.get(this.streamPath) ?? new BroadcastServer();
    this.ctx.broadcasts.set(this.streamPath, this.broadcast);
  }

  run = ()=> {
    this.req.on("data", this.onData);
    this.req.on("error", this.onError);
    this.req.socket.on("close", this.onClose);
    if(this.req.method === "GET") {
      this.onPlay();
    }else if(this.req.method === "POST") {
      this.onPush();
    }
  };

  onPlay = () => {
    logger.info(`FLV session ${this.id} ${this.ip} start play ${this.streamPath}`);
    this.isPublisher = false;
    this.broadcast.postPlay(this);
  };

  onPush = () => {
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
