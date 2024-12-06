// @ts-check
//
//  Created by Chen Mingliang on 24/11/30.
//  illuspas@msn.com
//  Copyright (c) 2024 Nodemedia. All rights reserved.
//

const net = require( "net");
const Rtmp = require( "../protocol/rtmp.js");
const logger = require( "../core/logger.js");
const Context = require( "../core/context.js");
const AVPacket = require( "../core/avpacket.js");
const BaseSession = require( "./base_session.js");
const BroadcastServer = require( "../server/broadcast_server.js");

/**
 * @class
 * @augments BaseSession
 */
class RtmpSession extends BaseSession {
  /**
   * 
   * @param {Context} ctx 
   * @param {net.Socket} socket 
   */
  constructor(ctx, socket) {
    super();
    this.ctx = ctx;
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
   * @param {string} streamApp 
   * @param {string} streamName 
   */
  onConnect = (streamApp, streamName) => {
    this.streamApp = streamApp;
    this.streamName = streamName;
    this.streamPath = "/" + streamApp + "/" + streamName;
    this.broadcast = this.ctx.broadcasts.get(this.streamPath) ?? new BroadcastServer();
    this.ctx.broadcasts.set(this.streamPath, this.broadcast);
  };


  onPlay = () => {
    logger.info(`RTMP session ${this.id} ${this.ip} start play ${this.streamPath}`);
    this.isPublisher = false;
    this.broadcast.postPlay(this);
  };

  onPush = () => {
    logger.info(`RTMP session ${this.id} ${this.ip} start push ${this.streamPath}`);
    this.isPublisher = true;
    const err = this.broadcast.postPush(this);
    if (err != null) {
      logger.error(`RTMP session ${this.id} ${this.ip} push ${this.streamPath} error, ${err}`);
      this.socket.end();
    }
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
    let err = this.rtmp.parserData(data);
    if (err != null) {
      logger.error(`RTMP session ${this.id} ${this.ip} parserData error, ${err}`);
      this.socket.end();
    }
  };

  onClose = () => {
    logger.info(`RTMP session ${this.id} close`);
    if (this.isPublisher) {
      this.broadcast.donePush(this);
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
    this.socket.write(buffer);
  };
}

module.exports = RtmpSession;
