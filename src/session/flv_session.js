// @ts-check
//
//  Created by Chen Mingliang on 23/11/30.
//  illuspas@msn.com
//  Copyright (c) 2023 NodeMedia. All rights reserved.
//

const express = require("express");
const Flv = require("../protocol/flv.js");
const logger = require("../core/logger.js");
const Context = require("../core/context.js");
const AVPacket = require("../core/avpacket.js");
const BaseSession = require("./base_session.js");
const BroadcastServer = require("../server/broadcast_server.js");

/**
 * @class
 * @augments BaseSession
 */
class FlvSession extends BaseSession {
  /**
   * @param {express.Request} req
   * @param {express.Response} res
   */
  constructor(req, res) {
    super();
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
    /**@type {BroadcastServer} */
    this.broadcast = Context.broadcasts.get(this.streamPath) ?? new BroadcastServer();
    Context.broadcasts.set(this.streamPath, this.broadcast);
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
    const err = this.broadcast.postPlay(this);
    if (err != null) {
      logger.error(`FLV session ${this.id} ${this.ip} play ${this.streamPath} error, ${err}`);
      this.res.end();
      return;
    }
    this.isPublisher = false;
    logger.info(`FLV session ${this.id} ${this.ip} start play ${this.streamPath}`);
  };

  onPush = () => {
    const err = this.broadcast.postPublish(this);
    if (err != null) {
      logger.error(`FLV session ${this.id} ${this.ip} push ${this.streamPath} error, ${err}`);
      this.res.end();
      return;
    }
    this.isPublisher = true;
    this.flv.onPacketCallback = this.onPacket;
    logger.info(`FLV session ${this.id} ${this.ip} start push ${this.streamPath}`);
  };

  /**
   * @param {Buffer} data
   */
  onData = (data) => {
    this.inBytes += data.length;
    let err = this.flv.parserData(data);
    if (err != null) {
      logger.error(`FLV session ${this.id} ${this.ip} parserData error, ${err}`);
      this.res.end();
    }
  };

  onClose = () => {
    logger.info(`FLV session ${this.id} close`);
    if (this.isPublisher) {
      this.broadcast.donePublish(this);
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
    if (this.res.writableEnded) {
      return;
    }
    this.outBytes += buffer.length;
    this.res.write(buffer);
  };

  /**
   * @override
   */
  close = () => {
    this.res.end();
  };
}

module.exports = FlvSession;
