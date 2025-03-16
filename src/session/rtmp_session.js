// @ts-check
//
//  Created by Chen Mingliang on 24/11/30.
//  illuspas@msn.com
//  Copyright (c) 2024 Nodemedia. All rights reserved.
//

const net = require("net");
const Rtmp = require("../protocol/rtmp.js");
const logger = require("../core/logger.js");
const Context = require("../core/context.js");
const AVPacket = require("../core/avpacket.js");
const BaseSession = require("./base_session.js");
const BroadcastServer = require("../server/broadcast_server.js");
const querystring = require("node:querystring");

/**
 * @class
 * @augments BaseSession
 */
class RtmpSession extends BaseSession {
  /**
   * 
   * @param {net.Socket} socket 
   */
  constructor(socket) {
    super();
    this.socket = socket;
    this.ip = socket.remoteAddress + ":" + socket.remotePort;
    this.protocol = "rtmp";
    this.rtmp = new Rtmp();
    this.broadcast = new BroadcastServer();
  }

  run = () => {
    this.rtmp.onConnectCallback = this.onConnect;
    this.rtmp.onPlayCallback = this.onPlay;
    this.rtmp.onPushCallback = this.onPush;
    this.rtmp.onOutputCallback = this.onOutput;
    this.rtmp.onPacketCallback = this.onPacket;
    this.socket.on("data", this.onData);
    this.socket.on("close", this.onClose);
    this.socket.on("error", this.onError);
  };

  /**
   * 
   * @param {object} req 
   * @param {string} req.app 
   * @param {string} req.name
   * @param {string} req.host 
   * @param {object} req.query 
   */
  onConnect = (req) => {
    this.streamApp = req.app;
    this.streamName = req.name;
    this.streamHost = req.host;
    this.streamPath = "/" + req.app + "/" + req.name;
    this.streamQuery = req.query;
    this.broadcast = Context.broadcasts.get(this.streamPath) ?? new BroadcastServer();
    Context.broadcasts.set(this.streamPath, this.broadcast);
  };


  onPlay = () => {
    const err = this.broadcast.postPlay(this);
    if (err != null) {
      logger.error(`RTMP session ${this.id} ${this.ip} play ${this.streamPath} error, ${err}`);
      this.socket.end();
      return;
    }
    this.isPublisher = false;
    logger.info(`RTMP session ${this.id} ${this.ip} start play ${this.streamPath}`);
  };

  onPush = () => {
    const err = this.broadcast.postPublish(this);
    if (err != null) {
      logger.error(`RTMP session ${this.id} ${this.ip} push ${this.streamPath} error, ${err}`);
      this.socket.end();
      return;
    }
    this.isPublisher = true;
    logger.info(`RTMP session ${this.id} ${this.ip} start push ${this.streamPath}`);
  };

  /**
   * rtmp protocol need output buffer
   * @param {Buffer} buffer 
   */
  onOutput = (buffer) => {
    this.socket.write(buffer);
  };

  /**
   * 
   * @param {AVPacket} packet 
   */
  onPacket = (packet) => {
    this.broadcast.broadcastMessage(packet);
  };

  /**
   * 
   * @param {Buffer} data 
   */
  onData = (data) => {
    this.inBytes += data.length;
    let err = this.rtmp.parserData(data);
    if (err != null) {
      logger.error(`RTMP session ${this.id} ${this.ip} parserData error, ${err}`);
      this.socket.end();
    }
  };

  onClose = () => {
    logger.info(`RTMP session ${this.id} close`);
    if (this.isPublisher) {
      this.broadcast.donePublish(this);
    } else {
      this.broadcast.donePlay(this);
    }
  };

  /**
   * 
   * @param {Error} error 
   */
  onError = (error) => {
    logger.info(`RTMP session ${this.id} socket error, ${error.name}: ${error.message}`);
  };

  /**
   * @abstract
   * @param {Buffer} buffer
   */
  sendBuffer = (buffer) => {
    this.outBytes += buffer.length;
    this.socket.write(buffer);
  };

  /**
   * @override
   */
  close = () => {
    this.socket.end();
  };
}

module.exports = RtmpSession;
