// @ts-check
//
//  Created by Chen Mingliang on 23/11/30.
//  illuspas@msn.com
//  Copyright (c) 2023 NodeMedia. All rights reserved.
//

const crypto = require("node:crypto");
const Flv = require("../protocol/flv.js");
const Rtmp = require("../protocol/rtmp.js");
const AVPacket = require("../core/avpacket.js");
const BaseSession = require("../session/base_session.js");
const Context = require("../core/context.js");
const logger = require("../core/logger.js");
const { decodeAmf0Data } = require("../protocol/amf.js");

/** Grace window after a publisher disconnects during which the same client may resume */
const PUBLISH_GRACE_MS = 30 * 1000;

/** Publisher stats carried over when the same client resumes within the grace window */
const RESUMABLE_FIELDS = [
  "createTime", "inBytes", "outBytes", "playCount",
  "videoCodec", "videoWidth", "videoHeight", "videoFramerate", "videoDatarate",
  "audioCodec", "audioChannels", "audioSamplerate", "audioDatarate"
];

/**
 * Session ips are "address:port"; two connections of the same client differ in port only.
 * @param {string} ip
 * @returns {string}
 */
function addressOf(ip) {
  return ip.replace(/:\d+$/, "");
}

class BroadcastServer {
  /**
   * @param {string} streamPath - Stream path this broadcast serves
   */
  constructor(streamPath) {
    /** @type {string} */
    this.streamPath = streamPath;

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

    /** @type {number} */
    this.publishGraceMs = PUBLISH_GRACE_MS;

    /** @type {object | null} */
    this._publishGraceTimer = null;
  }

  /**
   * 
   * @param {string} authKey 
   * @param {BaseSession} session 
   * @returns {boolean}
   */
  verifyAuth = (authKey, session) => {
    if (authKey === "") {
      return true;
    }
    let signStr = session.streamQuery?.sign;
    if (signStr?.split("-")?.length !== 2) {
      return false;
    }
    let now = Date.now() / 1000 | 0;
    let exp = parseInt(signStr.split("-")[0]);
    let shv = signStr.split("-")[1];
    let str = session.streamPath + "-" + exp + "-" + authKey;
    if (exp < now) {
      return false;
    }
    let md5 = crypto.createHash("md5");
    let ohv = md5.update(str).digest("hex");
    return shv === ohv;
  };

  /**
   * @param {BaseSession} session
   * @returns {string | null}
   */
  postPlay = (session) => {
    if (session.ip !== "") {
      Context.eventEmitter.emit("prePlay", session);
    }

    if (Context.config.auth?.play && session.ip !== "") {
      if (!this.verifyAuth(Context.config.auth?.secret, session)) {
        return `play stream ${session.streamPath} authentication verification failed`;
      }
    }
    if (session.ip !== "") {
      Context.eventEmitter.emit("postPlay", session);
      // count external plays on the publisher; internal sessions (record, relay push) have an empty ip
      if (this.publisher !== null) {
        this.publisher.playCount += 1;
      }
    }
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
    return null;
  };

  /**
   * @param {BaseSession} session
   */
  donePlay = (session) => {
    session.endTime = Date.now();
    if (session.ip !== "") {
      Context.eventEmitter.emit("donePlay", session);
    }
    this.subscribers.delete(session.id);
    this._destroyIfEmpty();
  };

  /**
   * @param {BaseSession} session
   * @returns {string | null}
   */
  postPublish = (session) => {
    Context.eventEmitter.emit("prePublish", session);

    if (Context.config.auth?.publish) {
      if (!this.verifyAuth(Context.config.auth?.secret, session)) {
        return `publish stream ${session.streamPath} authentication verification failed`;
      }
    }

    if (this._publishGraceTimer !== null) {
      if (this.publisher !== null && addressOf(session.ip) === addressOf(this.publisher.ip)) {
        this._resumePublish(session);
      } else {
        // a different client takes over the path; close the pending publish record first
        this._finishPublish();
      }
    }

    Context.eventEmitter.emit("postPublish", session);
    if (this.publisher == null) {
      this.publisher = session;
    } else {
      return `streamPath=${session.streamPath} already has a publisher`;
    }
    return null;
  };

  /**
   * The publisher disconnected: freeze its stats and keep the publish alive for
   * the grace window so the same client can resume without losing its record.
   * @param {BaseSession} session
   */
  donePublish = (session) => {
    if (session !== this.publisher || this._publishGraceTimer !== null) {
      return;
    }
    session.endTime = Date.now();
    this._publishGraceTimer = setTimeout(this._finishPublish, this.publishGraceMs);
    this._publishGraceTimer.unref();
  };

  /**
   * The same client reconnected within the grace window: carry the accumulated
   * stats over to the new session and free the publisher slot for it.
   * @param {BaseSession} session
   */
  _resumePublish = (session) => {
    const prev = this.publisher;
    clearTimeout(this._publishGraceTimer);
    this._publishGraceTimer = null;
    this.publisher = null;
    for (const field of RESUMABLE_FIELDS) {
      session[field] = prev[field];
    }
  };

  /**
   * End the publish for real: emit donePublish with the stats frozen at
   * disconnect time, drop caches and unregister the broadcast if empty.
   */
  _finishPublish = () => {
    if (this._publishGraceTimer !== null) {
      clearTimeout(this._publishGraceTimer);
      this._publishGraceTimer = null;
    }
    if (this.publisher === null) {
      return;
    }
    const session = this.publisher;
    this.publisher = null;
    Context.eventEmitter.emit("donePublish", session);
    this.flvMetaData = null;
    this.flvAudioHeader = null;
    this.flvVideoHeader = null;
    this.rtmpMetaData = null;
    this.rtmpAudioHeader = null;
    this.rtmpVideoHeader = null;
    this.flvGopCache?.clear();
    this.rtmpGopCache?.clear();
    this._destroyIfEmpty();
  };

  /**
   * Real publish state: the publisher object is held through the grace window,
   * so a non-null publisher alone does not mean the stream is live.
   * @returns {"publishing" | "reconnecting" | "idle"}
   */
  getPublishStatus = () => {
    if (this._publishGraceTimer !== null) {
      return "reconnecting";
    }
    return this.publisher !== null ? "publishing" : "idle";
  };

  /**
   * Subscribers may stay attached across publish gaps waiting for a new publisher,
   * so the broadcast is removed from Context.broadcasts only once it is fully empty.
   */
  _destroyIfEmpty = () => {
    if (this.publisher === null && this.subscribers.size === 0 &&
      Context.broadcasts.get(this.streamPath) === this) {
      Context.broadcasts.delete(this.streamPath);
    }
  };

  /**
   * @param {AVPacket} packet 
   */
  broadcastMessage = (packet) => {
    if (packet.flags == 5) {
      let metadata = decodeAmf0Data(packet.data);
      // RTMP publishers send "@setDataFrame onMetaData {...}"; our RTSP pull
      // sessions and FLV script tags start directly with "onMetaData {...}".
      if (this.publisher && metadata.dataObj !== null &&
          (metadata.cmd === "@setDataFrame" || metadata.cmd === "onMetaData")) {
        this.publisher.audioCodec = metadata.dataObj.audiocodecid;
        this.publisher.audioChannels = metadata.dataObj.stereo ? 2 : 1;
        this.publisher.audioSamplerate = metadata.dataObj.audiosamplerate;
        this.publisher.audioDatarate = metadata.dataObj.audiodatarate;
        this.publisher.videoCodec = metadata.dataObj.videocodecid;
        this.publisher.videoWidth = metadata.dataObj.width;
        this.publisher.videoHeight = metadata.dataObj.height;
        this.publisher.videoFramerate = metadata.dataObj.framerate;
        this.publisher.videoDatarate = metadata.dataObj.videodatarate;
      }
    }
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