// @ts-check
//
//  Created by Chen Mingliang on 23/11/30.
//  illuspas@msn.com
//  Copyright (c) 2023 NodeMedia. All rights reserved.
//

const express = require("express");
const url = require("url");
const http = require("http");
const WebSocket = require("ws");
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
   * @param {express.Request | http.IncomingMessage} req
   * @param {express.Response | WebSocket} res
   */
  constructor(req, res) {
    super();
    this.req = req;
    this.res = res;
    this.ip = req.socket.remoteAddress + ":" + req.socket.remotePort;
    this.flv = new Flv();
    this.protocol = "flv";
    if (this.res instanceof WebSocket) {
      const urlInfo = url.parse(req.url, true);
      this.streamHost = req.headers.host?.split(":")[0];
      this.streamPath = urlInfo.pathname.split(".")[0];
      this.streamApp = this.streamPath.split("/")[1];
      this.streamName = this.streamPath.split("/")[2];
      this.streamQuery = urlInfo.query;
      if (this.res.protocol.toLowerCase() === "post" || this.res.protocol.toLowerCase() === "publisher") {
        this.isPublisher = true;
      }
    } else {
      this.streamHost = req.hostname;
      this.streamApp = req.params.app;
      this.streamName = req.params.name;
      this.streamPath = "/" + this.streamApp + "/" + this.streamName;
      this.streamQuery = req.query;
      if (this.req.method === "POST") {
        this.isPublisher = true;
      }
    }

    /**@type {BroadcastServer} */
    this.broadcast = Context.broadcasts.get(this.streamPath) ?? new BroadcastServer();
    Context.broadcasts.set(this.streamPath, this.broadcast);
  }

  run = () => {
    if (this.res instanceof WebSocket) {
      this.res.on("message", this.onData);
      this.res.on("close", this.onClose);
      this.res.on("error", this.onError);
    } else {
      this.req.on("data", this.onData);
      this.req.on("error", this.onError);
      this.req.socket.on("close", this.onClose);
    }
    if (this.isPublisher) {
      this.onPush();
    } else {
      this.onPlay();
    }
  };

  onPlay = () => {
    const err = this.broadcast.postPlay(this);
    if (err != null) {
      logger.error(`FLV session ${this.id} ${this.ip} play ${this.streamPath} error, ${err}`);
      this.close();
      return;
    }
    this.isPublisher = false;
    logger.info(`FLV session ${this.id} ${this.ip} start play ${this.streamPath}`);
  };

  onPush = () => {
    const err = this.broadcast.postPublish(this);
    if (err != null) {
      logger.error(`FLV session ${this.id} ${this.ip} push ${this.streamPath} error, ${err}`);
      this.close();
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
      this.close();
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
    if (this.res instanceof WebSocket) {
      if (this.res.readyState !== WebSocket.OPEN) {
        return;
      }
      this.res.send(buffer);
    } else {
      if (this.res.writableEnded) {
        return;
      }
      this.res.write(buffer);
    }
    this.outBytes += buffer.length;
  };

  /**
   * @override
   */
  close = () => {
    if (this.res instanceof WebSocket) {
      this.res.close();
    } else {
      this.res.end();
    }
  };
}

module.exports = FlvSession;
