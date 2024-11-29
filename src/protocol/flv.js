// @ts-check
//
//  Created by Chen Mingliang on 23/12/01.
//  illuspas@msn.com
//  Copyright (c) 2023 Nodemedia. All rights reserved.
//

import EventEmitter from "events";
import logger from "../core/logger.js";
import AVPacket from "../core/avpacket.js";

const FLV_MEDIA_TYPE_AUDIO = 8;
const FLV_MEDIA_TYPE_VIDEO = 9;
const FLV_MEDIA_TYPE_SCRIPT = 18;

const FLV_PARSE_INIT = 0;
const FLV_PARSE_HEAD = 1;
const FLV_PARSE_TAGS = 2;
const FLV_PARSE_PREV = 3;

const FOURCC_AV1 = Buffer.from("av01");
const FOURCC_VP9 = Buffer.from("vp09");
const FOURCC_HEVC = Buffer.from("hvc1");

const PacketTypeSequenceStart = 0;
const PacketTypeCodedFrames = 1;
const PacketTypeSequenceEnd = 2;
const PacketTypeCodedFramesX = 3;
const PacketTypeMetadata = 4;
const PacketTypeMPEG2TSSequenceStart = 5;

/**
 * @class
 */
export default class Flv {
  constructor() {
    this.parserBuffer = Buffer.alloc(13);
    this.parserState = FLV_PARSE_INIT;
    this.parserHeaderBytes = 0;
    this.parserTagBytes = 0;
    this.parserTagType = 0;
    this.parserTagSize = 0;
    this.parserTagTime = 0;
    this.parserTagCapacity = 1024 * 1024;
    this.parserTagData = Buffer.alloc(this.parserTagCapacity);
    this.parserPreviousBytes = 0;
  }

  /**
   * @abstract
   * @param {AVPacket} avpacket 
   */
  onPacketCallback = (avpacket) => {

  };

  /**
   * @param {Buffer} buffer
   * @returns {string | null} error
   */
  parserData = (buffer) => {
    let s = buffer.length;
    let n = 0;
    let p = 0;
    while (s > 0) {
      switch (this.parserState) {
        case FLV_PARSE_INIT:
          n = 13 - this.parserHeaderBytes;
          n = n <= s ? n : s;
          buffer.copy(this.parserBuffer, this.parserHeaderBytes, p, p + n);
          this.parserHeaderBytes += n;
          s -= n;
          p += n;
          if (this.parserHeaderBytes === 13) {
            this.parserState = FLV_PARSE_HEAD;
            this.parserHeaderBytes = 0;
          }
          break;
        case FLV_PARSE_HEAD:
          n = 11 - this.parserHeaderBytes;
          n = n <= s ? n : s;
          buffer.copy(this.parserBuffer, this.parserHeaderBytes, p, p + n);
          this.parserHeaderBytes += n;
          s -= n;
          p += n;
          if (this.parserHeaderBytes === 11) {
            this.parserState = FLV_PARSE_TAGS;
            this.parserHeaderBytes = 0;
            this.parserTagType = this.parserBuffer[0];
            this.parserTagSize = this.parserBuffer.readUintBE(1, 3);
            this.parserTagTime = (this.parserBuffer[4] << 16) | (this.parserBuffer[5] << 8) | this.parserBuffer[6] | (this.parserBuffer[7] << 24);
            logger.trace(`parser tag type=${this.parserTagType} time=${this.parserTagTime} size=${this.parserTagSize} `);
          }
          break;
        case FLV_PARSE_TAGS:
          this.parserTagAlloc(this.parserTagSize);
          n = this.parserTagSize - this.parserTagBytes;
          n = n <= s ? n : s;
          buffer.copy(this.parserTagData, this.parserTagBytes, p, p + n);
          this.parserTagBytes += n;
          s -= n;
          p += n;
          if (this.parserTagBytes === this.parserTagSize) {
            this.parserState = FLV_PARSE_PREV;
            this.parserTagBytes = 0;
          }
          break;
        case FLV_PARSE_PREV:
          n = 4 - this.parserPreviousBytes;
          n = n <= s ? n : s;
          buffer.copy(this.parserBuffer, this.parserPreviousBytes, p, p + n);
          this.parserPreviousBytes += n;
          s -= n;
          p += n;
          if (this.parserPreviousBytes === 4) {
            this.parserState = FLV_PARSE_HEAD;
            this.parserPreviousBytes = 0;
            const parserPreviousNSize = this.parserBuffer.readUint32BE();
            if (parserPreviousNSize === this.parserTagSize + 11) {
              let packet = Flv.parserTag(this.parserTagType, this.parserTagTime, this.parserTagSize, this.parserTagData);
              this.onPacketCallback(packet);
            } else {
              return "flv tag parser error";
            }
          }
          break;
      }
    }
    return null;
  };

  /**
   * @param {number} size
   */
  parserTagAlloc = (size) => {
    if (this.parserTagCapacity < size) {
      this.parserTagCapacity = size * 2;
      const newBuffer = Buffer.alloc(this.parserTagCapacity);
      this.parserTagData.copy(newBuffer);
      this.parserTagData = newBuffer;
    }
  };

  /**
   * @param {boolean} hasAudio
   * @param {boolean} hasVideo
   * @returns {Buffer} 
   */
  static createHeader = (hasAudio, hasVideo) => {
    const buffer = Buffer.from([0x46, 0x4c, 0x56, 0x01, 0x00, 0x00, 0x00, 0x00, 0x09, 0x00, 0x00, 0x00, 0x00]);
    if (hasAudio) {
      buffer[4] |= 4;
    }

    if (hasVideo) {
      buffer[4] |= 1;
    }
    return buffer;
  };

  /**
   * @param {number} type
   * @param {number} time
   * @param {number} size
   * @param {Buffer} data
   * @returns {Buffer}
   */
  static createMessage = (type, time, size, data) => {
    const buffer = Buffer.alloc(11 + size + 4);
    buffer[0] = type;
    buffer.writeUintBE(size, 1, 3);
    buffer[4] = (time >> 16) & 0xFF;
    buffer[5] = (time >> 8) & 0xFF;
    buffer[6] = time & 0xFF;
    buffer[7] = (time >> 24) & 0xFF;
    data.copy(buffer, 11, 0, size);
    buffer.writeUint32BE(11 + size, 11 + size);
    return buffer;
  };

  /**
   * @param {number} type
   * @param {number} time
   * @param {number} size
   * @param {Buffer} data
   * @returns {AVPacket}
   */
  static parserTag = (type, time, size, data) => {
    let packet = new AVPacket();
    packet.codec_type = type;
    packet.flags = 1;
    packet.pts = time;
    packet.dts = time;
    packet.size = size;
    packet.data = data;
    if (type === FLV_MEDIA_TYPE_AUDIO) {
      const codecID = data[0] >> 4;
      if (codecID === 10 && data[1] === 0) {
        packet.flags = 0;
      }
      packet.codec_id = codecID;
    } else if (type === FLV_MEDIA_TYPE_VIDEO) {
      const frameType = data[0] >> 4 & 0b0111;
      const codecID = data[0] & 0x0f;
      const isExHeader = (data[0] >> 4 & 0b1000) !== 0;
      packet.codec_id = codecID;
      if (isExHeader) {
        const packetType = data[0] & 0x0f;
        const fourCC = data.subarray(1, 5);
        if (fourCC.compare(FOURCC_HEVC) === 0) {
          const cts = data[5] << 16 | data[6] << 8 | data[7];
          // console.log(data[0], data[1], data[2], data[3], data[4], data[5], data[6], data[7]);
          packet.pts = packet.dts + cts;
        }
        if (fourCC.compare(FOURCC_AV1) === 0 || fourCC.compare(FOURCC_VP9) === 0 || fourCC.compare(FOURCC_HEVC) === 0) {
          if (frameType === 1 && packetType === PacketTypeSequenceStart) {
            packet.flags = 2;
          } else if (frameType === 1) {
            packet.flags = 3;
          } else {
            packet.flags = 4;
          }
        }
      } else {
        const cts = data[2] << 16 | data[3] << 8 | data[4];
        packet.pts = packet.dts + cts;
        if (codecID === 7) {
          if (frameType === 1 && data[1] === 0) {
            packet.flags = 2;
          } else if (frameType === 1 && data[1] === 1) {
            packet.flags = 3;
          } else {
            packet.flags = 4;
          }
        }
      }
    } else if (type === FLV_MEDIA_TYPE_SCRIPT) {
      packet.flags = 5;
    }
    return packet;
  };
}

