// @ts-check
//
//  Created by Chen Mingliang on 23/11/30.
//  illuspas@msn.com
//  Copyright (c) 2023 NodeMedia. All rights reserved.
//

const express = require( "express");
const Flv = require( "../protocol/flv.js");
const logger = require( "../core/logger.js");
const Context = require( "../core/context.js");
const AVPacket = require( "../core/avpacket.js");
const BaseSession = require( "./base_session.js");
const BroadcastServer = require( "../server/broadcast_server.js");

/**
 * @class
 * @augments BaseSession
 */
class FlvSession extends BaseSession {
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
    this.ip = req.socket.remoteAddress + ":" + req.socket.remotePort;
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

  run = () => {
    this.req.on("data", this.onData);
    this.req.on("error", this.onError);
    this.req.socket.on("close", this.onClose);
    if (this.req.method === "GET") {
      this.onPlay();
    } else if (this.req.method === "POST") {
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

module.exports = FlvSession;
