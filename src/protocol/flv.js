// @ts-check
//
//  Created by Chen Mingliang on 23/12/01.
//  illuspas@msn.com
//  Copyright (c) 2023 Nodemedia. All rights reserved.
//

const AMF = require("./amf.js");
const logger = require("../core/logger.js");
const AVPacket = require("../core/avpacket.js");

const FLV_MEDIA_TYPE_AUDIO = 8;
const FLV_MEDIA_TYPE_VIDEO = 9;
const FLV_MEDIA_TYPE_SCRIPT = 18;

const FLV_PARSE_INIT = 0;
const FLV_PARSE_HEAD = 1;
const FLV_PARSE_TAGS = 2;
const FLV_PARSE_PREV = 3;

const FLV_FRAME_KEY = 1;///< key frame (for AVC, a seekable frame)
const FLV_FRAME_INTER = 2; ///< inter frame (for AVC, a non-seekable frame)
const FLV_FRAME_DISP_INTER = 3; ///< disposable inter frame (H.263 only)
const FLV_FRAME_GENERATED_KEY = 4;///< generated key frame (reserved for server use only)
const FLV_FRAME_VIDEO_INFO_CMD = 5; ///< video info/command frame

const FLV_AVC_SEQUENCE_HEADER = 0;
const FLV_AVC_NALU = 1;
const FLV_AVC_END_OF_SEQUENCE = 2;

const FLV_CODECID_PCM = 0;
const FLV_CODECID_ADPCM = 1;
const FLV_CODECID_MP3 = 2;
const FLV_CODECID_PCM_LE = 3;
const FLV_CODECID_NELLYMOSER_16KHZ_MONO = 4;
const FLV_CODECID_NELLYMOSER_8KHZ_MONO = 5;
const FLV_CODECID_NELLYMOSER = 6;
const FLV_CODECID_PCM_ALAW = 7;
const FLV_CODECID_PCM_MULAW = 8;
const FLV_CODECID_AAC = 10;
const FLV_CODECID_SPEEX = 11;

const FLV_CODECID_H263 = 2;
const FLV_CODECID_SCREEN = 3;
const FLV_CODECID_VP6 = 4;
const FLV_CODECID_VP6A = 5;
const FLV_CODECID_SCREEN2 = 6;
const FLV_CODECID_H264 = 7;
const FLV_CODECID_REALH263 = 8;
const FLV_CODECID_MPEG4 = 9;

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
class Flv {
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
   * @param {AVPacket} avpacket
   * @returns {Buffer}
   */
  static createMessage = (avpacket) => {
    const buffer = Buffer.alloc(11 + avpacket.size + 4);
    buffer[0] = avpacket.codec_type;
    buffer.writeUintBE(avpacket.size, 1, 3);
    buffer[4] = (avpacket.dts >> 16) & 0xFF;
    buffer[5] = (avpacket.dts >> 8) & 0xFF;
    buffer[6] = avpacket.dts & 0xFF;
    buffer[7] = (avpacket.dts >> 24) & 0xFF;
    avpacket.data.copy(buffer, 11, 0, avpacket.size);
    buffer.writeUint32BE(11 + avpacket.size, 11 + avpacket.size);
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
    packet.pts = time;
    packet.dts = time;
    packet.size = size;
    packet.data = data;
    if (type === FLV_MEDIA_TYPE_AUDIO) {
      const codecID = data[0] >> 4;
      packet.codec_id = codecID;
      packet.flags = 1;
      if (codecID === FLV_CODECID_AAC) {
        if (data[1] === 0) {
          packet.flags = 0;
        }
      }
    } else if (type === FLV_MEDIA_TYPE_VIDEO) {
      const frameType = data[0] >> 4 & 0b0111;
      const codecID = data[0] & 0x0f;
      const isExHeader = (data[0] >> 4 & 0b1000) !== 0;

      if (isExHeader) {
        const packetType = data[0] & 0x0f;
        const fourCC = data.subarray(1, 5);
        if (fourCC.compare(FOURCC_AV1) === 0 || fourCC.compare(FOURCC_VP9) === 0 || fourCC.compare(FOURCC_HEVC) === 0) {
          packet.codec_id = fourCC.readUint32BE();
          if (packetType === PacketTypeSequenceStart) {
            packet.flags = 2;
          } else if (packetType === PacketTypeCodedFrames || packetType === PacketTypeCodedFramesX) {
            if (frameType === FLV_FRAME_KEY) {
              packet.flags = 3;
            } else {
              packet.flags = 4;
            }
          } else if (packetType === PacketTypeMetadata) {
            // const hdrMetadata = AMF.parseScriptData(packet.data.buffer, 5, packet.size);
            // logger.debug(`hdrMetadata:${JSON.stringify(hdrMetadata)}`);
            packet.flags = 6;
          }

          if (fourCC.compare(FOURCC_HEVC) === 0) {
            if (packetType === PacketTypeCodedFrames) {
              const cts = data.readUintBE(5, 3);
              packet.pts = packet.dts + cts;
            }
          }
        }
      } else {
        const cts = data.readUintBE(2, 3);
        const packetType = data[1];
        packet.codec_id = codecID;
        packet.pts = packet.dts + cts;
        packet.flags = 4;
        if (codecID === FLV_CODECID_H264) {
          if (packetType === FLV_AVC_SEQUENCE_HEADER) {
            packet.flags = 2;
          } else {
            if (frameType === FLV_FRAME_KEY) {
              packet.flags = 3;
            } else {
              packet.flags = 4;
            }
          }
        }
      }
    } else if (type === FLV_MEDIA_TYPE_SCRIPT) {
      packet.flags = 5;
    }
    return packet;
  };
}

module.exports = Flv;
