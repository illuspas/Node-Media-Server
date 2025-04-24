// @ts-check
//
//  Created by Chen Mingliang on 24/11/30.
//  illuspas@msn.com
//  Copyright (c) 2024 Nodemedia. All rights reserved.
//

const AMF = require("./amf.js");
const Flv = require("./flv.js");
const crypto = require("node:crypto");
const logger = require("../core/logger.js");
const AVPacket = require("../core/avpacket.js");
const querystring= require("node:querystring");

const N_CHUNK_STREAM = 8;
const RTMP_VERSION = 3;
const RTMP_HANDSHAKE_SIZE = 1536;
const RTMP_HANDSHAKE_UNINIT = 0;
const RTMP_HANDSHAKE_0 = 1;
const RTMP_HANDSHAKE_1 = 2;
const RTMP_HANDSHAKE_2 = 3;

const RTMP_PARSE_INIT = 0;
const RTMP_PARSE_BASIC_HEADER = 1;
const RTMP_PARSE_MESSAGE_HEADER = 2;
const RTMP_PARSE_EXTENDED_TIMESTAMP = 3;
const RTMP_PARSE_PAYLOAD = 4;

const MAX_CHUNK_HEADER = 18;

const RTMP_CHUNK_TYPE_0 = 0; // 11-bytes: timestamp(3) + length(3) + stream type(1) + stream id(4)
const RTMP_CHUNK_TYPE_1 = 1; // 7-bytes: delta(3) + length(3) + stream type(1)
const RTMP_CHUNK_TYPE_2 = 2; // 3-bytes: delta(3)
const RTMP_CHUNK_TYPE_3 = 3; // 0-byte

const RTMP_CHANNEL_PROTOCOL = 2;
const RTMP_CHANNEL_INVOKE = 3;
const RTMP_CHANNEL_AUDIO = 4;
const RTMP_CHANNEL_VIDEO = 5;
const RTMP_CHANNEL_DATA = 6;

const rtmpHeaderSize = [11, 7, 3, 0];

/* Protocol Control Messages */
const RTMP_TYPE_SET_CHUNK_SIZE = 1;
const RTMP_TYPE_ABORT = 2;
const RTMP_TYPE_ACKNOWLEDGEMENT = 3; // bytes read report
const RTMP_TYPE_WINDOW_ACKNOWLEDGEMENT_SIZE = 5; // server bandwidth
const RTMP_TYPE_SET_PEER_BANDWIDTH = 6; // client bandwidth

/* User Control Messages Event (4) */
const RTMP_TYPE_EVENT = 4;


const RTMP_TYPE_AUDIO = 8;
const RTMP_TYPE_VIDEO = 9;

/* Data Message */
const RTMP_TYPE_FLEX_STREAM = 15; // AMF3
const RTMP_TYPE_DATA = 18; // AMF0

/* Shared Object Message */
const RTMP_TYPE_FLEX_OBJECT = 16; // AMF3
const RTMP_TYPE_SHARED_OBJECT = 19; // AMF0

/* Command Message */
const RTMP_TYPE_FLEX_MESSAGE = 17; // AMF3
const RTMP_TYPE_INVOKE = 20; // AMF0

/* Aggregate Message */
const RTMP_TYPE_METADATA = 22;

const RTMP_CHUNK_SIZE = 128;
const RTMP_MAX_CHUNK_SIZE = 0xffff;
const RTMP_PING_TIME = 60000;
const RTMP_PING_TIMEOUT = 30000;

const STREAM_BEGIN = 0x00;
const STREAM_EOF = 0x01;
const STREAM_DRY = 0x02;
const STREAM_EMPTY = 0x1f;
const STREAM_READY = 0x20;

const MESSAGE_FORMAT_0 = 0;
const MESSAGE_FORMAT_1 = 1;
const MESSAGE_FORMAT_2 = 2;

const RTMP_SIG_SIZE = 1536;
const SHA256DL = 32;

const RandomCrud = Buffer.from([
  0xf0, 0xee, 0xc2, 0x4a, 0x80, 0x68, 0xbe, 0xe8,
  0x2e, 0x00, 0xd0, 0xd1, 0x02, 0x9e, 0x7e, 0x57,
  0x6e, 0xec, 0x5d, 0x2d, 0x29, 0x80, 0x6f, 0xab,
  0x93, 0xb8, 0xe6, 0x36, 0xcf, 0xeb, 0x31, 0xae
]);

const GenuineFMSConst = "Genuine Adobe Flash Media Server 001";
const GenuineFMSConstCrud = Buffer.concat([Buffer.from(GenuineFMSConst, "utf8"), RandomCrud]);

const GenuineFPConst = "Genuine Adobe Flash Player 001";
const GenuineFPConstCrud = Buffer.concat([Buffer.from(GenuineFPConst, "utf8"), RandomCrud]);

/**
 *
 * @param {Buffer} data
 * @param {Buffer | string} key
 * @returns {Buffer}
 */
function calcHmac(data, key) {
  let hmac = crypto.createHmac("sha256", key);
  hmac.update(data);
  return hmac.digest();
}

/**
 *
 * @param {Buffer} buf
 * @returns {number}
 */
function GetClientGenuineConstDigestOffset(buf) {
  let offset = buf[0] + buf[1] + buf[2] + buf[3];
  offset = (offset % 728) + 12;
  return offset;
}

/**
 *
 * @param {Buffer} buf
 * @returns {number}
 */
function GetServerGenuineConstDigestOffset(buf) {
  let offset = buf[0] + buf[1] + buf[2] + buf[3];
  offset = (offset % 728) + 776;
  return offset;
}

/**
 *
 * @param {Buffer} clientsig
 * @returns {number}
 */
function detectClientMessageFormat(clientsig) {
  let computedSignature, msg, providedSignature, sdl;
  sdl = GetServerGenuineConstDigestOffset(clientsig.slice(772, 776));
  msg = Buffer.concat([clientsig.slice(0, sdl), clientsig.slice(sdl + SHA256DL)], 1504);
  computedSignature = calcHmac(msg, GenuineFPConst);
  providedSignature = clientsig.slice(sdl, sdl + SHA256DL);
  if (computedSignature.equals(providedSignature)) {
    return MESSAGE_FORMAT_2;
  }
  sdl = GetClientGenuineConstDigestOffset(clientsig.slice(8, 12));
  msg = Buffer.concat([clientsig.slice(0, sdl), clientsig.slice(sdl + SHA256DL)], 1504);
  computedSignature = calcHmac(msg, GenuineFPConst);
  providedSignature = clientsig.slice(sdl, sdl + SHA256DL);
  if (computedSignature.equals(providedSignature)) {
    return MESSAGE_FORMAT_1;
  }
  return MESSAGE_FORMAT_0;
}

/**
 *
 * @param {number} messageFormat
 * @returns {Buffer}
 */
function generateS1(messageFormat) {
  let randomBytes = crypto.randomBytes(RTMP_SIG_SIZE - 8);
  let handshakeBytes = Buffer.concat([Buffer.from([0, 0, 0, 0, 1, 2, 3, 4]), randomBytes], RTMP_SIG_SIZE);

  let serverDigestOffset;
  if (messageFormat === 1) {
    serverDigestOffset = GetClientGenuineConstDigestOffset(handshakeBytes.slice(8, 12));
  } else {
    serverDigestOffset = GetServerGenuineConstDigestOffset(handshakeBytes.slice(772, 776));
  }

  let msg = Buffer.concat([handshakeBytes.slice(0, serverDigestOffset), handshakeBytes.slice(serverDigestOffset + SHA256DL)], RTMP_SIG_SIZE - SHA256DL);
  let hash = calcHmac(msg, GenuineFMSConst);
  hash.copy(handshakeBytes, serverDigestOffset, 0, 32);
  return handshakeBytes;
}

/**
 *
 * @param {number} messageFormat
 * @param {Buffer} clientsig
 * @returns {Buffer}
 */
function generateS2(messageFormat, clientsig) {
  let randomBytes = crypto.randomBytes(RTMP_SIG_SIZE - 32);
  let challengeKeyOffset;
  if (messageFormat === 1) {
    challengeKeyOffset = GetClientGenuineConstDigestOffset(clientsig.slice(8, 12));
  } else {
    challengeKeyOffset = GetServerGenuineConstDigestOffset(clientsig.slice(772, 776));
  }
  let challengeKey = clientsig.slice(challengeKeyOffset, challengeKeyOffset + 32);
  let hash = calcHmac(challengeKey, GenuineFMSConstCrud);
  let signature = calcHmac(randomBytes, hash);
  let s2Bytes = Buffer.concat([randomBytes, signature], RTMP_SIG_SIZE);
  return s2Bytes;
}

/**
 *
 * @param {Buffer} clientsig
 * @returns {Buffer}
 */
function generateS0S1S2(clientsig) {
  let clientType = Buffer.alloc(1, 3);
  let messageFormat = detectClientMessageFormat(clientsig);
  let allBytes;
  if (messageFormat === MESSAGE_FORMAT_0) {
    //    logger.debug('[rtmp handshake] using simple handshake.');
    allBytes = Buffer.concat([clientType, clientsig, clientsig]);
  } else {
    //    logger.debug('[rtmp handshake] using complex handshake.');
    allBytes = Buffer.concat([clientType, generateS1(messageFormat), generateS2(messageFormat, clientsig)]);
  }
  return allBytes;
}

class RtmpPacket {
  constructor(fmt = 0, cid = 0) {
    this.header = {
      fmt: fmt,
      cid: cid,
      timestamp: 0,
      length: 0,
      type: 0,
      stream_id: 0
    };
    this.clock = 0;
    this.payload = Buffer.alloc(0);
    this.capacity = 0;
    this.bytes = 0;
  }
}

class Rtmp {
  constructor() {
    this.handshakePayload = Buffer.alloc(RTMP_HANDSHAKE_SIZE);
    this.handshakeState = RTMP_HANDSHAKE_UNINIT;
    this.handshakeBytes = 0;

    this.parserBuffer = Buffer.alloc(MAX_CHUNK_HEADER);
    this.parserState = RTMP_PARSE_INIT;
    this.parserBytes = 0;
    this.parserBasicBytes = 0;
    this.parserPacket = new RtmpPacket();
    this.inPackets = new Map();

    this.inChunkSize = RTMP_CHUNK_SIZE;
    this.outChunkSize = RTMP_MAX_CHUNK_SIZE;

    this.streams = 0;
    this.flv = new Flv();
  }

  /**
   * @param {object} req
   * @abstract
   */
  onConnectCallback = (req) => {

  };

  /**
   * @abstract
   */
  onPlayCallback = () => {

  };

  /**
   * @abstract
   */
  onPushCallback = () => {

  };

  /**
   * @abstract
   * @param {AVPacket} avpacket 
   */
  onPacketCallback = (avpacket) => {

  };

  /**
   * @abstract
   * @param {Buffer} buffer 
   */
  onOutputCallback = (buffer) => {

  };

  /**
   * @param {Buffer} buffer
   * @returns {string | null}
   */
  parserData = (buffer) => {
    let bytes = buffer.length;
    let p = 0;
    let n = 0;
    while (bytes > 0) {
      switch (this.handshakeState) {
      case RTMP_HANDSHAKE_UNINIT:
        // logger.log('RTMP_HANDSHAKE_UNINIT');
        this.handshakeState = RTMP_HANDSHAKE_0;
        this.handshakeBytes = 0;
        bytes -= 1;
        p += 1;
        break;
      case RTMP_HANDSHAKE_0:
        // logger.log('RTMP_HANDSHAKE_0');
        n = RTMP_HANDSHAKE_SIZE - this.handshakeBytes;
        n = n <= bytes ? n : bytes;
        buffer.copy(this.handshakePayload, this.handshakeBytes, p, p + n);
        this.handshakeBytes += n;
        bytes -= n;
        p += n;
        if (this.handshakeBytes === RTMP_HANDSHAKE_SIZE) {
          this.handshakeState = RTMP_HANDSHAKE_1;
          this.handshakeBytes = 0;
          let s0s1s2 = generateS0S1S2(this.handshakePayload);
          this.onOutputCallback(s0s1s2);
        }
        break;
      case RTMP_HANDSHAKE_1:
        // logger.log('RTMP_HANDSHAKE_1');
        n = RTMP_HANDSHAKE_SIZE - this.handshakeBytes;
        n = n <= bytes ? n : bytes;
        buffer.copy(this.handshakePayload, this.handshakeBytes, p, n);
        this.handshakeBytes += n;
        bytes -= n;
        p += n;
        if (this.handshakeBytes === RTMP_HANDSHAKE_SIZE) {
          this.handshakeState = RTMP_HANDSHAKE_2;
          this.handshakeBytes = 0;
        }
        break;
      case RTMP_HANDSHAKE_2:
      default:
        return this.chunkRead(buffer, p, bytes);
      }
    }
    return null;
  };

  /**
   * @param {AVPacket} avpacket
   * @returns {Buffer}
   */
  static createMessage = (avpacket) => {
    let rtmpPacket = new RtmpPacket();
    rtmpPacket.header.fmt = MESSAGE_FORMAT_0;
    switch (avpacket.codec_type) {
    case 8:
      rtmpPacket.header.cid = RTMP_CHANNEL_AUDIO;
      break;
    case 9:
      rtmpPacket.header.cid = RTMP_CHANNEL_VIDEO;
      break;
    case 18:
      rtmpPacket.header.cid = RTMP_CHANNEL_DATA;
      break;
    }
    rtmpPacket.header.length = avpacket.size;
    rtmpPacket.header.type = avpacket.codec_type;
    rtmpPacket.header.timestamp = avpacket.dts;
    rtmpPacket.clock = avpacket.dts;
    rtmpPacket.payload = avpacket.data;
    return Rtmp.chunksCreate(rtmpPacket);
  };

  static chunkBasicHeaderCreate = (fmt, cid) => {
    let out;
    if (cid >= 64 + 255) {
      out = Buffer.alloc(3);
      out[0] = (fmt << 6) | 1;
      out[1] = (cid - 64) & 0xff;
      out[2] = ((cid - 64) >> 8) & 0xff;
    } else if (cid >= 64) {
      out = Buffer.alloc(2);
      out[0] = (fmt << 6) | 0;
      out[1] = (cid - 64) & 0xff;
    } else {
      out = Buffer.alloc(1);
      out[0] = (fmt << 6) | cid;
    }
    return out;
  };

  static chunkMessageHeaderCreate = (header) => {
    let out = Buffer.alloc(rtmpHeaderSize[header.fmt % 4]);
    if (header.fmt <= RTMP_CHUNK_TYPE_2) {
      out.writeUIntBE(header.timestamp >= 0xffffff ? 0xffffff : header.timestamp, 0, 3);
    }

    if (header.fmt <= RTMP_CHUNK_TYPE_1) {
      out.writeUIntBE(header.length, 3, 3);
      out.writeUInt8(header.type, 6);
    }

    if (header.fmt === RTMP_CHUNK_TYPE_0) {
      out.writeUInt32LE(header.stream_id, 7);
    }
    return out;
  };

  /**
   * 
   * @param {RtmpPacket} packet 
   * @returns {Buffer}
   */
  static chunksCreate = (packet) => {
    let header = packet.header;
    let payload = packet.payload;
    let payloadSize = header.length;
    let chunkSize = RTMP_MAX_CHUNK_SIZE;
    let chunksOffset = 0;
    let payloadOffset = 0;
    let chunkBasicHeader = Rtmp.chunkBasicHeaderCreate(header.fmt, header.cid);
    let chunkBasicHeader3 = Rtmp.chunkBasicHeaderCreate(RTMP_CHUNK_TYPE_3, header.cid);
    let chunkMessageHeader = Rtmp.chunkMessageHeaderCreate(header);
    let useExtendedTimestamp = header.timestamp >= 0xffffff;
    let headerSize = chunkBasicHeader.length + chunkMessageHeader.length + (useExtendedTimestamp ? 4 : 0);
    let n = headerSize + payloadSize + Math.floor(payloadSize / chunkSize);

    if (useExtendedTimestamp) {
      n += Math.floor(payloadSize / chunkSize) * 4;
    }
    if (!(payloadSize % chunkSize)) {
      n -= 1;
      if (useExtendedTimestamp) {
        //TODO CHECK
        n -= 4;
      }
    }

    let chunks = Buffer.alloc(n);
    chunkBasicHeader.copy(chunks, chunksOffset);
    chunksOffset += chunkBasicHeader.length;
    chunkMessageHeader.copy(chunks, chunksOffset);
    chunksOffset += chunkMessageHeader.length;
    if (useExtendedTimestamp) {
      chunks.writeUInt32BE(header.timestamp, chunksOffset);
      chunksOffset += 4;
    }
    while (payloadSize > 0) {
      if (payloadSize > chunkSize) {
        payload.copy(chunks, chunksOffset, payloadOffset, payloadOffset + chunkSize);
        payloadSize -= chunkSize;
        chunksOffset += chunkSize;
        payloadOffset += chunkSize;
        chunkBasicHeader3.copy(chunks, chunksOffset);
        chunksOffset += chunkBasicHeader3.length;
        if (useExtendedTimestamp) {
          chunks.writeUInt32BE(header.timestamp, chunksOffset);
          chunksOffset += 4;
        }
      } else {
        payload.copy(chunks, chunksOffset, payloadOffset, payloadOffset + payloadSize);
        payloadSize -= payloadSize;
        chunksOffset += payloadSize;
        payloadOffset += payloadSize;
      }
    }
    return chunks;
  };

  /**
   * 
   * @param {Buffer} data 
   * @param {number} p 
   * @param {number} bytes 
   * @returns {string | null}
   */
  chunkRead = (data, p, bytes) => {
    let size = 0;
    let offset = 0;
    let extended_timestamp = 0;

    while (offset < bytes) {
      switch (this.parserState) {
      case RTMP_PARSE_INIT:
        this.parserBytes = 1;
        this.parserBuffer[0] = data[p + offset++];
        if (0 === (this.parserBuffer[0] & 0x3f)) {
          this.parserBasicBytes = 2;
        } else if (1 === (this.parserBuffer[0] & 0x3f)) {
          this.parserBasicBytes = 3;
        } else {
          this.parserBasicBytes = 1;
        }
        this.parserState = RTMP_PARSE_BASIC_HEADER;
        break;
      case RTMP_PARSE_BASIC_HEADER:
        while (this.parserBytes < this.parserBasicBytes && offset < bytes) {
          this.parserBuffer[this.parserBytes++] = data[p + offset++];
        }
        if (this.parserBytes >= this.parserBasicBytes) {
          this.parserState = RTMP_PARSE_MESSAGE_HEADER;
        }
        break;
      case RTMP_PARSE_MESSAGE_HEADER:
        size = rtmpHeaderSize[this.parserBuffer[0] >> 6] + this.parserBasicBytes;
        while (this.parserBytes < size && offset < bytes) {
          this.parserBuffer[this.parserBytes++] = data[p + offset++];
        }
        if (this.parserBytes >= size) {
          this.packetParse();
          this.parserState = RTMP_PARSE_EXTENDED_TIMESTAMP;
        }
        break;
      case RTMP_PARSE_EXTENDED_TIMESTAMP:
        size = rtmpHeaderSize[this.parserPacket.header.fmt] + this.parserBasicBytes;
        if (this.parserPacket.header.timestamp === 0xffffff) {
          size += 4;
        }
        while (this.parserBytes < size && offset < bytes) {
          this.parserBuffer[this.parserBytes++] = data[p + offset++];
        }
        if (this.parserBytes >= size) {
          if (this.parserPacket.header.timestamp === 0xffffff) {
            extended_timestamp = this.parserBuffer.readUInt32BE(rtmpHeaderSize[this.parserPacket.header.fmt] + this.parserBasicBytes);
          } else {
            extended_timestamp = this.parserPacket.header.timestamp;
          }

          if (this.parserPacket.bytes === 0) {
            if (RTMP_CHUNK_TYPE_0 === this.parserPacket.header.fmt) {
              this.parserPacket.clock = extended_timestamp;
            } else {
              this.parserPacket.clock += extended_timestamp;
            }
            this.packetAlloc();
          }
          this.parserState = RTMP_PARSE_PAYLOAD;
        }
        break;
      case RTMP_PARSE_PAYLOAD:
        size = Math.min(this.inChunkSize - (this.parserPacket.bytes % this.inChunkSize), this.parserPacket.header.length - this.parserPacket.bytes);
        size = Math.min(size, bytes - offset);
        if (size > 0) {
          data.copy(this.parserPacket.payload, this.parserPacket.bytes, p + offset, p + offset + size);
        }
        this.parserPacket.bytes += size;
        offset += size;

        if (this.parserPacket.bytes >= this.parserPacket.header.length) {
          this.parserState = RTMP_PARSE_INIT;
          this.parserPacket.bytes = 0;
          if (this.parserPacket.clock > 0xffffffff) {
            break;
          }
          this.packetHandler();
        } else if (0 === this.parserPacket.bytes % this.inChunkSize) {
          this.parserState = RTMP_PARSE_INIT;
        }
        break;
      }
    }
    return null;
  };


  packetParse = () => {
    let fmt = this.parserBuffer[0] >> 6;
    let cid = 0;
    if (this.parserBasicBytes === 2) {
      cid = 64 + this.parserBuffer[1];
    } else if (this.parserBasicBytes === 3) {
      cid = (64 + this.parserBuffer[1] + this.parserBuffer[2]) << 8;
    } else {
      cid = this.parserBuffer[0] & 0x3f;
    }
    this.parserPacket = this.inPackets.get(cid) ?? new RtmpPacket(fmt, cid);
    this.inPackets.set(cid, this.parserPacket);
    this.parserPacket.header.fmt = fmt;
    this.parserPacket.header.cid = cid;
    this.chunkMessageHeaderRead();
  };

  chunkMessageHeaderRead = () => {
    let offset = this.parserBasicBytes;

    // timestamp / delta
    if (this.parserPacket.header.fmt <= RTMP_CHUNK_TYPE_2) {
      this.parserPacket.header.timestamp = this.parserBuffer.readUIntBE(offset, 3);
      offset += 3;
    }

    // message length + type
    if (this.parserPacket.header.fmt <= RTMP_CHUNK_TYPE_1) {
      this.parserPacket.header.length = this.parserBuffer.readUIntBE(offset, 3);
      this.parserPacket.header.type = this.parserBuffer[offset + 3];
      offset += 4;
    }

    if (this.parserPacket.header.fmt === RTMP_CHUNK_TYPE_0) {
      this.parserPacket.header.stream_id = this.parserBuffer.readUInt32LE(offset);
      offset += 4;
    }
    return offset;
  };

  packetAlloc = () => {
    if (this.parserPacket.capacity < this.parserPacket.header.length) {
      this.parserPacket.payload = Buffer.alloc(this.parserPacket.header.length + 1024);
      this.parserPacket.capacity = this.parserPacket.header.length + 1024;
    }
  };

  packetHandler = () => {
    switch (this.parserPacket.header.type) {
    case RTMP_TYPE_SET_CHUNK_SIZE:
    case RTMP_TYPE_ABORT:
    case RTMP_TYPE_ACKNOWLEDGEMENT:
    case RTMP_TYPE_WINDOW_ACKNOWLEDGEMENT_SIZE:
    case RTMP_TYPE_SET_PEER_BANDWIDTH:
      return this.controlHandler();
    case RTMP_TYPE_EVENT:
      return this.eventHandler();
    case RTMP_TYPE_FLEX_MESSAGE:
    case RTMP_TYPE_INVOKE:
      return this.invokeHandler();
    case RTMP_TYPE_AUDIO:
    case RTMP_TYPE_VIDEO:
    case RTMP_TYPE_FLEX_STREAM: // AMF3
    case RTMP_TYPE_DATA: // AMF0
      return this.dataHandler();
    }
  };

  controlHandler = () => {
    let payload = this.parserPacket.payload;
    switch (this.parserPacket.header.type) {
    case RTMP_TYPE_SET_CHUNK_SIZE:
      this.inChunkSize = payload.readUInt32BE();
      // logger.debug('set inChunkSize', this.inChunkSize);
      break;
    case RTMP_TYPE_ABORT:
      break;
    case RTMP_TYPE_ACKNOWLEDGEMENT:
      break;
    case RTMP_TYPE_WINDOW_ACKNOWLEDGEMENT_SIZE:
      this.ackSize = payload.readUInt32BE();
      // logger.debug('set ack Size', this.ackSize);
      break;
    case RTMP_TYPE_SET_PEER_BANDWIDTH:
      break;
    }
  };

  eventHandler = () => {

  };

  invokeHandler() {
    let offset = this.parserPacket.header.type === RTMP_TYPE_FLEX_MESSAGE ? 1 : 0;
    let payload = this.parserPacket.payload.subarray(offset, this.parserPacket.header.length);

    let invokeMessage = AMF.decodeAmf0Cmd(payload);
    switch (invokeMessage.cmd) {
    case "connect":
      this.onConnect(invokeMessage);
      break;
    case "createStream":
      this.onCreateStream(invokeMessage);
      break;
    case "publish":
      this.onPublish(invokeMessage);
      break;
    case "play":
      this.onPlay(invokeMessage);
      break;
    case "deleteStream":
      this.onDeleteStream(invokeMessage);
      break;
    default:
      logger.trace(`unhandle invoke message ${invokeMessage.cmd}`);
      break;
    }
  }

  dataHandler = () => {
    let parcket = Flv.parserTag(this.parserPacket.header.type, this.parserPacket.clock, this.parserPacket.header.length, this.parserPacket.payload);
    this.onPacketCallback(parcket);
  };

  onConnect = (invokeMessage) => {
    const url = new URL(invokeMessage.cmdObj.tcUrl);
    this.connectCmdObj = invokeMessage.cmdObj;
    this.streamApp = invokeMessage.cmdObj.app;
    this.streamHost = url.hostname;
    this.objectEncoding = invokeMessage.cmdObj.objectEncoding != null ? invokeMessage.cmdObj.objectEncoding : 0;
    this.connectTime = new Date();
    this.startTimestamp = Date.now();
    this.sendWindowACK(5000000);
    this.setPeerBandwidth(5000000, 2);
    this.setChunkSize(this.outChunkSize);
    this.respondConnect(invokeMessage.transId);
  };

  onCreateStream = (invokeMessage) => {
    this.respondCreateStream(invokeMessage.transId);
  };

  onPublish = (invokeMessage) => {
    this.streamName = invokeMessage.streamName.split("?")[0];
    this.streamQuery = querystring.parse(invokeMessage.streamName.split("?")[1]);
    this.streamId = this.parserPacket.header.stream_id;
    this.respondPublish();
    this.onConnectCallback({
      app: this.streamApp,
      name: this.streamName,
      host:this.streamHost,
      query:this.streamQuery
    });
    this.onPushCallback();
  };

  onPlay = (invokeMessage) => {
    this.streamName = invokeMessage.streamName.split("?")[0];
    this.streamQuery = querystring.parse(invokeMessage.streamName.split("?")[1]);
    this.streamId = this.parserPacket.header.stream_id;
    this.respondPlay();
    this.onConnectCallback({
      app: this.streamApp,
      name: this.streamName,
      host: this.streamHost,
      query:this.streamQuery
    });
    this.onPlayCallback();
  };

  onDeleteStream = (invokeMessage) => {

  };

  sendACK = (size) => {
    let rtmpBuffer = Buffer.from("02000000000004030000000000000000", "hex");
    rtmpBuffer.writeUInt32BE(size, 12);
    this.onOutputCallback(rtmpBuffer);
  };

  sendWindowACK = (size) => {
    let rtmpBuffer = Buffer.from("02000000000004050000000000000000", "hex");
    rtmpBuffer.writeUInt32BE(size, 12);
    this.onOutputCallback(rtmpBuffer);
  };

  setPeerBandwidth = (size, type) => {
    let rtmpBuffer = Buffer.from("0200000000000506000000000000000000", "hex");
    rtmpBuffer.writeUInt32BE(size, 12);
    rtmpBuffer[16] = type;
    this.onOutputCallback(rtmpBuffer);
  };

  setChunkSize = (size) => {
    let rtmpBuffer = Buffer.from("02000000000004010000000000000000", "hex");
    rtmpBuffer.writeUInt32BE(size, 12);
    this.onOutputCallback(rtmpBuffer);
  };

  sendStreamStatus = (st, id) => {
    let rtmpBuffer = Buffer.from("020000000000060400000000000000000000", "hex");
    rtmpBuffer.writeUInt16BE(st, 12);
    rtmpBuffer.writeUInt32BE(id, 14);
    this.onOutputCallback(rtmpBuffer);
  };

  sendInvokeMessage = (sid, opt) => {
    let packet = new RtmpPacket();
    packet.header.fmt = RTMP_CHUNK_TYPE_0;
    packet.header.cid = RTMP_CHANNEL_INVOKE;
    packet.header.type = RTMP_TYPE_INVOKE;
    packet.header.stream_id = sid;
    packet.payload = AMF.encodeAmf0Cmd(opt);
    packet.header.length = packet.payload.length;
    let chunks = Rtmp.chunksCreate(packet);
    this.onOutputCallback(chunks);
  };

  sendDataMessage(opt, sid) {
    let packet = new RtmpPacket();
    packet.header.fmt = RTMP_CHUNK_TYPE_0;
    packet.header.cid = RTMP_CHANNEL_DATA;
    packet.header.type = RTMP_TYPE_DATA;
    packet.payload = AMF.encodeAmf0Data(opt);
    packet.header.length = packet.payload.length;
    packet.header.stream_id = sid;
    let chunks = Rtmp.chunksCreate(packet);
    this.onOutputCallback(chunks);
  }

  sendStatusMessage(sid, level, code, description) {
    let opt = {
      cmd: "onStatus",
      transId: 0,
      cmdObj: null,
      info: {
        level: level,
        code: code,
        description: description
      }
    };
    this.sendInvokeMessage(sid, opt);
  }

  sendRtmpSampleAccess(sid) {
    let opt = {
      cmd: "|RtmpSampleAccess",
      bool1: false,
      bool2: false
    };
    this.sendDataMessage(opt, sid);
  }

  respondConnect(tid) {
    let opt = {
      cmd: "_result",
      transId: tid,
      cmdObj: {
        fmsVer: "FMS/3,0,1,123",
        capabilities: 31
      },
      info: {
        level: "status",
        code: "NetConnection.Connect.Success",
        description: "Connection succeeded.",
        objectEncoding: this.objectEncoding
      }
    };
    this.sendInvokeMessage(0, opt);
  }

  respondCreateStream(tid) {
    this.streams++;
    let opt = {
      cmd: "_result",
      transId: tid,
      cmdObj: null,
      info: this.streams
    };
    this.sendInvokeMessage(0, opt);
  }

  respondPublish() {
    this.sendStatusMessage(this.streamId, "status", "NetStream.Publish.Start", `/${this.streamApp}/${this.streamName} is now published.`);
  }

  respondPlay() {
    this.sendStreamStatus(STREAM_BEGIN, this.streamId);
    this.sendStatusMessage(this.streamId, "status", "NetStream.Play.Reset", "Playing and resetting stream.");
    this.sendStatusMessage(this.streamId, "status", "NetStream.Play.Start", "Started playing stream.");
    this.sendRtmpSampleAccess();
  }
}

module.exports = Rtmp;