// @ts-check
//
//  Created by Chen Mingliang on 23/11/30.
//  illuspas@msn.com
//  Copyright (c) 2023 Nodemedia. All rights reserved.
//

import { customAlphabet } from "nanoid";

const nanoid = customAlphabet("1234567890abcdefghijklmnopqrstuvwxyz", 16);


export default class BaseSession {
  constructor() {
    this.id = nanoid();
    this.ip = "";
    this.protocol = "";
    this.streamHost = "";
    this.streamApp = "";
    this.streamName = "";
    this.streamPath = "";

    this.videoCodec = 0;
    this.videoWidth = 0;
    this.videoHeight = 0;
    this.videoFramerate = 0;
    this.videoDatarate = 0;
    this.audioCodec = 0;
    this.audioChannels = 0;
    this.audioSamplerate = 0;
    this.audioDatarate = 0;
  }

  /**
   * @abstract
   * @param {Buffer} buffer
   */
  sendBuffer = (buffer) => {
  };
}
