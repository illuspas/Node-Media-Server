// @ts-check
//
//  Created by Chen Mingliang on 23/11/30.
//  illuspas@msn.com
//  Copyright (c) 2023 NodeMedia. All rights reserved.
//

import AVPacket from "../core/avpacket.js";
import Flv from "../protocol/flv.js";
import BaseSession from "../session/base_session.js";

export default class BroadcastServer {
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
  }

  /**
   * @param {BaseSession} session
   */
  postPlay = (session) => {
    switch (session.protocol) {
      case "flv":
        session.sendBuffer(this.flvHeader);
        if (this.flvMetaData != null) {
          session.sendBuffer(this.flvMetaData);
        }
        if (this.flvAudioHeader != null) {
          session.sendBuffer(this.flvAudioHeader);
        }
        if (this.flvVideoHeader != null) {
          session.sendBuffer(this.flvVideoHeader);
        }
        break;
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
    }
  };

  /**
   * @param {AVPacket} packet 
   */
  broadcastMessage = (packet) => {
    const flvMessage = Flv.createMessage(packet.codec_type, packet.dts, packet.size, packet.data);
    switch (packet.flags) {
      case 0:
        this.flvAudioHeader = Buffer.from(flvMessage);
        break;
      case 2:
        this.flvVideoHeader = Buffer.from(flvMessage);
        break;
      case 5:
        this.flvMetaData = Buffer.from(flvMessage);
        break;
    }

    this.subscribers.forEach((v, k) => {
      switch (v.protocol) {
        case "flv":
          v.sendBuffer(flvMessage);
          break;
      }
    });
  };
}
