// @ts-check
//
//  Created by Chen Mingliang on 23/11/30.
//  illuspas@msn.com
//  Copyright (c) 2023 NodeMedia. All rights reserved.
//

const Flv = require("../protocol/flv.js");
const Rtmp = require("../protocol/rtmp.js");
const AVPacket = require("../core/avpacket.js");
const BaseSession = require("../session/base_session.js");

class BroadcastServer {
  constructor() {
    /** @type {BaseSession | null} */
    this.publisher = null;

    /** @type {Map<string, BaseSession>} */
    this.subscribers = new Map();

    /** @type {Buffer} */
    this.flvHeader = Flv.createHeader(true, true);

    /** @type {Buffer | null} */
    this.flvMetaData = null;

    /** @type {Buffer | null} */
    this.flvAudioHeader = null;

    /** @type {Buffer | null} */
    this.flvVideoHeader = null;

    /** @type {Buffer | null} */
    this.rtmpMetaData = null;

    /** @type {Buffer | null} */
    this.rtmpAudioHeader = null;

    /** @type {Buffer | null} */
    this.rtmpVideoHeader = null;

    /**@type {Set<Buffer> | null} */
    this.flvGopCache = null;

    /**@type {Set<Buffer> | null} */
    this.rtmpGopCache = null;
  }

  /**
   * @param {BaseSession} session
   */
  postPlay = (session) => {
    switch (session.protocol) {
    case "flv":
      session.sendBuffer(this.flvHeader);
      if (this.flvMetaData !== null) {
        session.sendBuffer(this.flvMetaData);
      }
      if (this.flvAudioHeader !== null) {
        session.sendBuffer(this.flvAudioHeader);
      }
      if (this.flvVideoHeader !== null) {
        session.sendBuffer(this.flvVideoHeader);
      }
      if (this.flvGopCache !== null) {
        this.flvGopCache.forEach((v) => {
          session.sendBuffer(v);
        });
      }
      break;
    case "rtmp":
      if (this.rtmpMetaData != null) {
        session.sendBuffer(this.rtmpMetaData);
      }
      if (this.rtmpAudioHeader != null) {
        session.sendBuffer(this.rtmpAudioHeader);
      }
      if (this.rtmpVideoHeader != null) {
        session.sendBuffer(this.rtmpVideoHeader);
      }
      if (this.rtmpGopCache !== null) {
        this.rtmpGopCache.forEach((v) => {
          session.sendBuffer(v);
        });
      }
    }

    this.subscribers.set(session.id, session);
  };

  /**
   * @param {BaseSession} session
   */
  donePlay = (session) => {
    this.subscribers.delete(session.id);
  };

  /**
   * @param {BaseSession} session
   * @returns {string | null}
   */
  postPush = (session) => {
    if (this.publisher == null) {
      this.publisher = session;
    } else {
      return `streamPath=${session.streamPath} already has a publisher`;
    }
    return null;
  };

  /**
   * @param {BaseSession} session
   */
  donePush = (session) => {
    if (session === this.publisher) {
      this.publisher = null;
      this.flvMetaData = null;
      this.flvAudioHeader = null;
      this.flvVideoHeader = null;
      this.rtmpMetaData = null;
      this.rtmpAudioHeader = null;
      this.rtmpVideoHeader = null;
      this.flvGopCache?.clear();
      this.rtmpGopCache?.clear();
    }
  };

  /**
   * @param {AVPacket} packet 
   */
  broadcastMessage = (packet) => {
    const flvMessage = Flv.createMessage(packet);
    const rtmpMessage = Rtmp.createMessage(packet);
    switch (packet.flags) {
    case 0:
      this.flvAudioHeader = Buffer.from(flvMessage);
      this.rtmpAudioHeader = Buffer.from(rtmpMessage);
      break;
    case 1:
      this.flvGopCache?.add(flvMessage);
      this.rtmpGopCache?.add(rtmpMessage);
      break;
    case 2:
      this.flvVideoHeader = Buffer.from(flvMessage);
      this.rtmpVideoHeader = Buffer.from(rtmpMessage);
      break;
    case 3:
      this.flvGopCache?.clear();
      this.rtmpGopCache?.clear();
      this.flvGopCache = new Set();
      this.rtmpGopCache = new Set();
      this.flvGopCache.add(flvMessage);
      this.rtmpGopCache.add(rtmpMessage);
      break;
    case 4:
      this.flvGopCache?.add(flvMessage);
      this.rtmpGopCache?.add(rtmpMessage);
      break;
    case 5:
      this.flvMetaData = Buffer.from(flvMessage);
      this.rtmpMetaData = Buffer.from(rtmpMessage);
      break;
    }
    if (this.flvGopCache && this.flvGopCache.size > 4096) {
      this.flvGopCache.clear();
    }
    if (this.rtmpGopCache && this.rtmpGopCache.size > 4096) {
      this.rtmpGopCache.clear();
    }
    this.subscribers.forEach((v, k) => {
      switch (v.protocol) {
      case "flv":
        v.sendBuffer(flvMessage);
        break;
      case "rtmp":
        v.sendBuffer(rtmpMessage);
      }
    });
  };
}

module.exports = BroadcastServer;