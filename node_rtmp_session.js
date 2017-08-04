//
//  Created by Mingliang Chen on 17/8/1.
//  illuspas[a]gmail.com
//  Copyright (c) 2017 Nodemedia. All rights reserved.
//
const EventEmitter = require('events');

const AMF = require('./node_core_amf');
const Handshake = require('./node_rtmp_handshake');
const BufferPool = require('./node_core_bufferpool');

const EXTENDED_TIMESTAMP_TYPE_NOT_USED = 'not-used';
const EXTENDED_TIMESTAMP_TYPE_ABSOLUTE = 'absolute';
const EXTENDED_TIMESTAMP_TYPE_DELTA = 'delta';
const TIMESTAMP_ROUNDOFF = 4294967296;

class NodeRtmpSession extends EventEmitter {
  constructor(config, id, sessions, publishers) {
    super();
    this.bp = new BufferPool();
    this.bp.on('error', (e) => {
    })
    this.id = id;
    this.sessions = sessions;
    this.publishers = publishers;
    this.players = new Set();
    this.streamId = '';
    this.inChunkSize = 128;
    this.outChunkSize = config.chunk_size;
    this.previousChunkMessage = {};

    this.isStarting = false;
    this.isPublisher = false;
    this.isFirstAudioReceived = false;
    this.isFirstVideoReceived = false;
    this.metaData = null;
    this.aacSequenceHeader = null;
    this.avcSequenceHeader = null;
    this.audioCodec = 0;
    this.videoCodec = 0;

    this.gopCacheQueue = null;

    this.on('connect', this.onConnect);
    this.on('publish', this.onPublish);
    this.on('play', this.onPlay);
  }

  run() {
    this.isStarting = true;
    this.bp.init(this.handleData())
  }

  stop() {
    this.isStarting = false;
    this.bp.stop();
  }

  push(data) {
    this.bp.push(data);
  }

  * handleData() {
    console.log('rtmp handshake [start]');
    if (this.bp.need(1537)) {
      if (yield) return;
    }
    let c0c1 = this.bp.read(1537);
    let s0s1s2 = Handshake.generateS0S1S2(c0c1);
    this.emit('data', s0s1s2);

    if (this.bp.need(1536)) {
      if (yield) return;
    }
    let c2 = this.bp.read(1536);
    console.log('rtmp handshake [done]');
    console.log('rtmp parse message [start]');
    while (this.isStarting) {
      let message = {};
      let chunkMessageHeader = null;
      let previousChunk = null;

      if (this.bp.need(1)) {
        if (yield) break;
      }
      let chunkBasicHeader = this.bp.read(1);

      message.formatType = chunkBasicHeader[0] >> 6;
      message.chunkStreamID = chunkBasicHeader[0] & 0x3F;
      if (message.chunkStreamID === 0) {
        // Chunk basic header 2
        if (this.bp.need(1)) {
          if (yield) break;
        }
        let exStreamID = this.bp.read(1);
        message.chunkStreamID = exStreamID[0] + 64;
      } else if (message.chunkStreamID === 1) {
        // Chunk basic header 3
        if (this.bp.need(2)) {
          if (yield) break;
        }
        let exStreamID = this.bp.read(2);
        message.chunkStreamID = (exStreamID[0] << 8) + exStreamID[1] + 64;
      } else {
        // Chunk basic header 1
      }
      previousChunk = this.previousChunkMessage[message.chunkStreamID];
      if (message.formatType === 0) {
        //Type 0 (11 bytes)
        if (this.bp.need(11)) {
          if (yield) break;
        }
        chunkMessageHeader = this.bp.read(11);
        message.timestamp = chunkMessageHeader.readUIntBE(0, 3);
        if (message.timestamp === 0xffffff) {
          message.extendedTimestampType = EXTENDED_TIMESTAMP_TYPE_ABSOLUTE;
        } else {
          message.extendedTimestampType = EXTENDED_TIMESTAMP_TYPE_NOT_USED;
        }
        message.timestampDelta = 0;
        message.messageLength = chunkMessageHeader.readUIntBE(3, 3);
        message.messageTypeID = chunkMessageHeader[6];
        message.messageStreamID = chunkMessageHeader.readUInt32LE(7);
        message.receivedLength = 0;
        message.chunks = [];
      } else if (message.formatType === 1) {
        //Type 1 (7 bytes)
        if (this.bp.need(7)) {
          if (yield) break;
        }
        chunkMessageHeader = this.bp.read(7);
        message.timestampDelta = chunkMessageHeader.readUIntBE(0, 3);
        if (message.timestampDelta === 0xffffff) {
          message.extendedTimestampType = EXTENDED_TIMESTAMP_TYPE_DELTA;
        } else {
          message.extendedTimestampType = EXTENDED_TIMESTAMP_TYPE_NOT_USED;
        }
        message.messageLength = chunkMessageHeader.readUIntBE(3, 3);
        message.messageTypeID = chunkMessageHeader[6];
        if (previousChunk != null) {
          message.timestamp = previousChunk.timestamp;
          message.messageStreamID = previousChunk.messageStreamID;
          message.receivedLength = previousChunk.receivedLength;
          message.chunks = previousChunk.chunks;
        } else {
          console.error(`Chunk reference error for type ${message.formatType}: previous chunk for id ${message.chunkStreamID} is not found`);
          break;
        }
      } else if (message.formatType === 2) {
        // Type 2 (3 bytes)
        if (this.bp.need(3)) {
          if (yield) break;
        }
        chunkMessageHeader = this.bp.read(3);
        message.timestampDelta = chunkMessageHeader.readUIntBE(0, 3);
        if (message.timestampDelta === 0xffffff) {
          message.extendedTimestampType = EXTENDED_TIMESTAMP_TYPE_DELTA;
        } else {
          message.extendedTimestampType = EXTENDED_TIMESTAMP_TYPE_NOT_USED;
        }
        if (previousChunk != null) {
          message.timestamp = previousChunk.timestamp;
          message.messageStreamID = previousChunk.messageStreamID;
          message.messageLength = previousChunk.messageLength;
          message.messageTypeID = previousChunk.messageTypeID;
          message.receivedLength = previousChunk.receivedLength;
          message.chunks = previousChunk.chunks;
        } else {
          console.error(`Chunk reference error for type ${message.formatType}: previous chunk for id ${message.chunkStreamID} is not found`);
          break;
        }
      } else if (message.formatType == 3) {
        // Type 3 (0 byte)
        if (previousChunk != null) {
          message.timestamp = previousChunk.timestamp;
          message.messageStreamID = previousChunk.messageStreamID;
          message.messageLength = previousChunk.messageLength;
          message.timestampDelta = previousChunk.timestampDelta;
          message.messageTypeID = previousChunk.messageTypeID;
          message.receivedLength = previousChunk.receivedLength;
          message.chunks = previousChunk.chunks;
        } else {
          console.error(`Chunk reference error for type ${message.formatType}: previous chunk for id ${message.chunkStreamID} is not found`);
          break;
        }
      } else {
        console.error("Unknown format type: " + message.formatType);
        break;
      }

      if (message.extendedTimestampType === EXTENDED_TIMESTAMP_TYPE_ABSOLUTE) {
        if (this.bp.need(4)) {
          if (yield) break;
        }
        let extTimestamp = this.bp.read(4);
        message.timestamp = extTimestamp.readUInt32BE();
      } else if (message.extendedTimestampType === EXTENDED_TIMESTAMP_TYPE_DELTA) {
        let extTimestamp = this.bp.read(4);
        message.timestampDelta = extTimestamp.readUInt32BE();
      }


      let chunkBodySize = message.messageLength;
      chunkBodySize -= message.receivedLength;
      chunkBodySize = Math.min(chunkBodySize, this.inChunkSize);

      if (this.bp.need(chunkBodySize)) {
        if (yield) break;
      }
      let chunkBody = this.bp.read(chunkBodySize);
      message.receivedLength += chunkBodySize;
      message.chunks.push(chunkBody);
      if (message.receivedLength == message.messageLength) {
        if (message.timestampDelta != null) {
          message.timestamp += message.timestampDelta;
          if (message.timestamp > TIMESTAMP_ROUNDOFF) {
            message.timestamp %= TIMESTAMP_ROUNDOFF;
          }
        }
        let rtmpBody = Buffer.concat(message.chunks);
        this.handleRTMPMessage(message, rtmpBody);
        message.receivedLength = 0;
        message.chunks = [];
        rtmpBody = null;
      }
      this.previousChunkMessage[message.chunkStreamID] = message;
    }
    console.log('rtmp parse message [stop]');
    if (this.isPublisher) {
      this.publishers.delete(this.streamId);
    } else {
      let publisherId = this.publishers.get(this.streamId);
      if (publisherId != null) {
        this.sessions.get(publisherId).players.delete(this.id);
      }
    }
    this.emit('end');
  }

  createRtmpMessage(rtmpHeader, rtmpBody) {
    let formatTypeID = 0;
    let useExtendedTimestamp = false;
    let timestamp;
    let rtmpBodySize = rtmpBody.length;
    let rtmpBodyPos = 0;
    let chunkBodys = [];
    let type3Header = new Buffer([(3 << 6) | rtmpHeader.chunkStreamID]);

    if (rtmpHeader.chunkStreamID == null) {
      //console.warn("[rtmp] warning: createRtmpMessage(): chunkStreamID is not set for RTMP message");
    }
    if (rtmpHeader.timestamp == null) {
      //console.warn("[rtmp] warning: createRtmpMessage(): timestamp is not set for RTMP message");
    }
    if (rtmpHeader.messageTypeID == null) {
      //console.warn("[rtmp] warning: createRtmpMessage(): messageTypeID is not set for RTMP message");
    }
    if (rtmpHeader.messageStreamID == null) {
      //console.warn("[rtmp] warning: createRtmpMessage(): messageStreamID is not set for RTMP message");
    }

    if (rtmpHeader.timestamp >= 0xffffff) {
      useExtendedTimestamp = true;
      timestamp = [0xff, 0xff, 0xff];
    } else {
      timestamp = [(rtmpHeader.timestamp >> 16) & 0xff, (rtmpHeader.timestamp >> 8) & 0xff, rtmpHeader.timestamp & 0xff];
    }

    let headerBufs = new Buffer([(formatTypeID << 6) | rtmpHeader.chunkStreamID, timestamp[0], timestamp[1], timestamp[2], (rtmpBodySize >> 16) & 0xff, (rtmpBodySize >> 8) & 0xff, rtmpBodySize & 0xff, rtmpHeader.messageTypeID, rtmpHeader.messageStreamID & 0xff, (rtmpHeader.messageStreamID >>> 8) & 0xff, (rtmpHeader.messageStreamID >>> 16) & 0xff, (rtmpHeader.messageStreamID >>> 24) & 0xff]);
    if (useExtendedTimestamp) {
      let extendedTimestamp = new Buffer([(rtmpHeader.timestamp >> 24) & 0xff, (rtmpHeader.timestamp >> 16) & 0xff, (rtmpHeader.timestamp >> 8) & 0xff, rtmpHeader.timestamp & 0xff]);
      headerBufs = Buffer.concat([headerBufs, extendedTimestamp]);
    }

    chunkBodys.push(headerBufs);
    do {
      if (rtmpBodySize > this.outChunkSize) {
        chunkBodys.push(rtmpBody.slice(rtmpBodyPos, rtmpBodyPos + this.outChunkSize));
        rtmpBodySize -= this.outChunkSize
        rtmpBodyPos += this.outChunkSize;
        chunkBodys.push(type3Header);
      } else {
        chunkBodys.push(rtmpBody.slice(rtmpBodyPos, rtmpBodyPos + rtmpBodySize));
        rtmpBodySize -= rtmpBodySize;
        rtmpBodyPos += rtmpBodySize;
      }
    } while (rtmpBodySize > 0)

    return Buffer.concat(chunkBodys);
  }

  handleRTMPMessage(rtmpHeader, rtmpBody) {
    // console.log(`[rtmp handleRtmpMessage] rtmpHeader.messageTypeID=${rtmpHeader.messageTypeID}`);
    switch (rtmpHeader.messageTypeID) {
      case 1:
        this.inChunkSize = rtmpBody.readUInt32BE();
        console.log('[rtmp handleRtmpMessage] Set In chunkSize:' + this.inChunkSize);
        break;
      case 3:
        console.log('[rtmp handleRtmpMessage] Ack:' + rtmpBody.readUInt32BE());
        break;
      case 4:
        let userControlMessage = {};
        userControlMessage.eventType = rtmpBody.readUInt16BE();
        userControlMessage.eventData = rtmpBody.slice(2);
        this.handleUserControlMessage(userControlMessage);
        break;
      case 5:
        let windowAckSize = rtmpBody.readUInt32BE();
        console.log(`[rtmp handleRtmpMessage] WindowAck: ${windowAckSize}`);
        break;
      case 8:
        //Audio Data
        this.handleAudioMessage(rtmpHeader, rtmpBody);
        break;
      case 9:
        //Video Data
        this.handleVideoMessage(rtmpHeader, rtmpBody);
        break;
      case 15:
        //AMF3 DataMessage
        let amf3Data = AMF.decodeAmf0Data(rtmpBody.slice(1));
        this.handleAMFDataMessage(amf3Data);
        break;
      case 17:
        //AMF3 CommandMessage
        let amf3Cmd = AMF.decodeAmf0Cmd(rtmpBody.slice(1));
        this.handleAMFCommandMessage(amf3Cmd);
        break;
      case 18:
        //AMF0 DataMessage
        let amf0Data = AMF.decodeAmf0Data(rtmpBody);
        this.handleAMFDataMessage(amf0Data);
        break;
      case 20:
        //AMF0 CommandMessage
        let amf0Cmd = AMF.decodeAmf0Cmd(rtmpBody);
        this.handleAMFCommandMessage(amf0Cmd);
        break;
    }
  }

  handleAudioMessage(rtmpHeader, rtmpBody) {
    if (!this.isFirstAudioReceived) {
      let sound_format = rtmpBody[0];
      let sound_type = sound_format & 0x01;
      let sound_size = (sound_format >> 1) & 0x01;
      let sound_rate = (sound_format >> 2) & 0x03;
      sound_format = (sound_format >> 4) & 0x0f;
      console.log(`Parse AudioTagHeader sound_format=${sound_format} sound_type=${sound_type} sound_size=${sound_size} sound_rate=${sound_rate}`);
      this.audioCodec = sound_format;
      if (sound_format == 10) {
        //cache aac sequence header
        if (rtmpBody[1] == 0) {
          this.aacSequenceHeader = Buffer.from(rtmpBody);
          this.isFirstAudioReceived = true;
        }
      } else {
        this.isFirstAudioReceived = true;
      }

    }
    let rtmpMessage = this.createRtmpMessage(rtmpHeader, rtmpBody);

    if(this.gopCacheQueue != null) {
      if(this.aacSequenceHeader != null &&rtmpBody[1]==0) {
        //skip aac sequence header
      } else {
        this.gopCacheQueue.add(rtmpMessage);
      }
    }

    for (let player of this.players) {
      this.sessions.get(player).emit('data', rtmpMessage);
    }

  }

  handleVideoMessage(rtmpHeader, rtmpBody) {
    let frame_type = rtmpBody[0];
    let codec_id = frame_type & 0x0f;
    frame_type = (frame_type >> 4) & 0x0f;

    if (!this.isFirstVideoReceived) {
      this.videoCodec = codec_id;
      console.log(`Parse VideoTagHeader frame_type=${frame_type} codec_id=${codec_id}`);

      if (codec_id == 7) {
        //cache avc sequence header
        if (frame_type == 1 && rtmpBody[1] == 0) {
          this.avcSequenceHeader = Buffer.from(rtmpBody);
          this.isFirstVideoReceived = true;
          this.gopCacheQueue = new Set();
        }
      } else {
        this.isFirstVideoReceived = true;
      }
    }

    let rtmpMessage = this.createRtmpMessage(rtmpHeader, rtmpBody);

    if (codec_id == 7) {
      if (frame_type == 1 && rtmpBody[1] == 1) {
        this.gopCacheQueue.clear();
      }

      if (frame_type == 1 && rtmpBody[1] == 0) {
        //skip avc sequence header
      } else {
        this.gopCacheQueue.add(rtmpMessage);
      }

      for (let player of this.players) {
        this.sessions.get(player).emit('data', rtmpMessage);
      }
    }
  }

  handleUserControlMessage(userControlMessage) {
    switch (userControlMessage.eventType) {
      case 3:
        let streamID = userControlMessage.eventData.readUInt32BE();
        let bufferLength = userControlMessage.eventData.readUInt32BE(4);
        console.log(`[handleUserControlMessage] SetBufferLength: streamID=${streamID} bufferLength=${bufferLength}`);
        break;
      case 7:
        let timestamp = userControlMessage.eventData.readUInt32BE();
        console.log(`[handleUserControlMessage] PingResponse: timestamp=${timestamp}`);
        break;
    }
  }

  handleAMFDataMessage(dataMessage) {
    // console.log('handleAMFDataMessage', dataMessage);
    switch (dataMessage.cmd) {
      case '@setDataFrame':
        if (dataMessage.dataObj != null) {
          this.metaData = dataMessage.dataObj;
        }
        break;
      default:

        break;
    }
  }

  handleAMFCommandMessage(commandMessage) {
    // console.log('handleAMFCommandMessage:', commandMessage);
    switch (commandMessage.cmd) {
      case 'connect':
        this.emit('connect', commandMessage.cmdObj);
        break;
      case 'createStream':
        this.respondCreateStream(commandMessage);
        break;
      case 'FCPublish':
        // this.respondFCPublish();
        break;
      case 'publish':
        this.emit('publish', commandMessage.streamName);
        break;
      case 'play':
        this.emit('play', commandMessage.streamName);
        break;
      case 'closeStream':
        // this.closeStream();
        break;
      case 'deleteStream':
        // this.deleteStream();
        break;
      case 'pause':
        // this.pauseOrUnpauseStream();
        break;
      case 'releaseStream':
        // this.respondReleaseStream();
        break;
      case 'FCUnpublish':
        // this.respondFCUnpublish();
        break;
      default:
        console.warn("[rtmp:receive] unknown AMF command: " + commandMessage.cmd);
        break;

    }
  }

  windowACK(size) {
    var rtmpBuffer = new Buffer('02000000000004050000000000000000', 'hex');
    rtmpBuffer.writeUInt32BE(size, 12);
    // //console.log('windowACK: '+rtmpBuffer.hex());
    this.emit('data', rtmpBuffer);
  };

  setPeerBandwidth(size, type) {
    var rtmpBuffer = new Buffer('0200000000000506000000000000000000', 'hex');
    rtmpBuffer.writeUInt32BE(size, 12);
    rtmpBuffer[16] = type;
    // //console.log('setPeerBandwidth: '+rtmpBuffer.hex());
    this.emit('data', rtmpBuffer);
  };

  setChunkSize(size) {
    var rtmpBuffer = new Buffer('02000000000004010000000000000000', 'hex');
    rtmpBuffer.writeUInt32BE(size, 12);
    // //console.log('setChunkSize: '+rtmpBuffer.hex());
    this.emit('data', rtmpBuffer);
  };

  streamBegin() {
    var rtmpBuffer = new Buffer('020000000000060400000000000000000001', 'hex');
    this.emit('data', rtmpBuffer);
  }

  respondConnect() {
    var rtmpHeader = {
      chunkStreamID: 3,
      timestamp: 0,
      messageTypeID: 0x14,
      messageStreamID: 0
    };
    var opt = {
      cmd: '_result',
      transId: 1,
      cmdObj: {
        fmsVer: 'FMS/3,0,1,123',
        capabilities: 31
      },
      info: {
        level: 'status',
        code: 'NetConnection.Connect.Success',
        description: 'Connection succeeded.',
        objectEncoding: this.objectEncoding
      }
    };
    var rtmpBody = AMF.encodeAmf0Cmd(opt);
    var rtmpMessage = this.createRtmpMessage(rtmpHeader, rtmpBody);
    this.emit('data', rtmpMessage);
  }

  respondCreateStream(cmd) {
    // //console.log(cmd);
    var rtmpHeader = {
      chunkStreamID: 3,
      timestamp: 0,
      messageTypeID: 0x14,
      messageStreamID: 0
    };
    var opt = {
      cmd: "_result",
      transId: cmd.transId,
      cmdObj: null,
      info: 1

    };
    var rtmpBody = AMF.encodeAmf0Cmd(opt);
    var rtmpMessage = this.createRtmpMessage(rtmpHeader, rtmpBody);
    this.emit('data', rtmpMessage);
  }

  respondPublishError() {
    const rtmpHeader = {
      chunkStreamID: 5,
      timestamp: 0,
      messageTypeID: 0x14,
      messageStreamID: 1
    };
    const opt = {
      cmd: 'onStatus',
      transId: 0,
      cmdObj: null,
      info: {
        level: 'error',
        code: 'NetStream.Publish.BadName',
        description: 'Already publishing'
      }
    };
    let rtmpBody = AMF.encodeAmf0Cmd(opt);
    let rtmpMessage = this.createRtmpMessage(rtmpHeader, rtmpBody);
    this.emit('data', rtmpMessage);
  };

  respondPublish() {
    const rtmpHeader = {
      chunkStreamID: 5,
      timestamp: 0,
      messageTypeID: 0x14,
      messageStreamID: 1
    };
    const opt = {
      cmd: 'onStatus',
      transId: 0,
      cmdObj: null,
      info: {
        level: 'status',
        code: 'NetStream.Publish.Start',
        description: 'Start publishing'
      }
    };
    let rtmpBody = AMF.encodeAmf0Cmd(opt);
    let rtmpMessage = this.createRtmpMessage(rtmpHeader, rtmpBody);
    this.emit('data', rtmpMessage);
  }

  respondPlay() {
    let rtmpHeader = {
      chunkStreamID: 3,
      timestamp: 0,
      messageTypeID: 0x14,
      messageStreamID: 1
    };
    let opt = {
      cmd: 'onStatus',
      transId: 0,
      cmdObj: null,
      info: {
        level: 'status',
        code: 'NetStream.Play.Start',
        description: 'Start live'
      }
    };
    let rtmpBody = AMF.encodeAmf0Cmd(opt);
    let rtmpMessage = this.createRtmpMessage(rtmpHeader, rtmpBody);

    this.emit('data', rtmpMessage);

    rtmpHeader = {
      chunkStreamID: 5,
      timestamp: 0,
      messageTypeID: 0x12,
      messageStreamID: 1
    };

    opt = {
      cmd: '|RtmpSampleAccess',
      bool1: true,
      bool2: true
    };

    rtmpBody = AMF.encodeAmf0Data(opt);
    rtmpMessage = this.createRtmpMessage(rtmpHeader, rtmpBody);
    this.emit('data', rtmpMessage);
  }

  respondPlayError() {
    const rtmpHeader = {
      chunkStreamID: 5,
      timestamp: 0,
      messageTypeID: 0x14,
      messageStreamID: 1
    };
    const opt = {
      cmd: 'onStatus',
      transId: 0,
      cmdObj: null,
      info: {
        level: 'error',
        code: 'NetStream.Play.StreamNotFound',
        description: `Stream ${this.streamId} Not Found`
      }
    };
    let rtmpBody = AMF.encodeAmf0Cmd(opt);
    let rtmpMessage = this.createRtmpMessage(rtmpHeader, rtmpBody);
    this.emit('data', rtmpMessage);
  }


  onConnect(cmdObj) {
    this.connectCmdObj = cmdObj;
    this.objectEncoding = cmdObj.objectEncoding != null ? cmdObj.objectEncoding : 0;
    this.windowACK(5000000);
    this.setPeerBandwidth(5000000, 2);
    this.setChunkSize(this.outChunkSize);
    this.respondConnect();
    console.log('rtmp connect app: ' + cmdObj.app);
  }

  onPublish(streamName) {
    let app = this.connectCmdObj.app;
    this.streamId = app + '/' + streamName;

    if (this.publishers.has(this.streamId)) {
      console.warn("[rtmp publish] Already has a stream id " + this.streamId);
      this.respondPublishError();
    } else {
      console.log("[rtmp publish] new stream id " + this.streamId);
      this.publishers.set(this.streamId, this.id);
      this.isPublisher = true;
      this.respondPublish();
    }

  }

  onPlay(streamName) {
    let app = this.connectCmdObj.app;
    this.streamId = app + '/' + streamName;

    if (this.publishers.has(this.streamId)) {
      console.log("[rtmp play] join stream " + this.streamId);
      let publisherId = this.publishers.get(this.streamId);
      let publisher = this.sessions.get(publisherId);
      let players = publisher.players;
      players.add(this.id);
      this.respondPlay();
      this.streamBegin();
      //metaData
      if (publisher.metaData != null) {
        let rtmpHeader = {
          chunkStreamID: 5,
          timestamp: 0,
          messageTypeID: 0x12,
          messageStreamID: 1
        };

        let opt = {
          cmd: 'onMetaData',
          cmdObj: publisher.metaData
        };

        let rtmpBody = AMF.encodeAmf0Data(opt);
        let metaDataRtmpMessage = this.createRtmpMessage(rtmpHeader, rtmpBody);
        this.emit('data', metaDataRtmpMessage);
      }

      //send aacSequenceHeader
      if (publisher.audioCodec == 10) {
        let rtmpHeader = {
          chunkStreamID: 4,
          timestamp: 0,
          messageTypeID: 0x08,
          messageStreamID: 1
        };
        let rtmpMessage = this.createRtmpMessage(rtmpHeader, publisher.aacSequenceHeader);
        this.emit('data', rtmpMessage);
      }
      //send avcSequenceHeader
      if (publisher.videoCodec == 7) {
        let rtmpHeader = {
          chunkStreamID: 6,
          timestamp: 0,
          messageTypeID: 0x09,
          messageStreamID: 1
        };
        let rtmpMessage = this.createRtmpMessage(rtmpHeader, publisher.avcSequenceHeader);
        this.emit('data', rtmpMessage);
      }
      //send gop cache
      if(publisher.gopCacheQueue != null) {
        for(let rtmpMessage of publisher.gopCacheQueue) {
          this.emit('data', rtmpMessage);
        }
      }

    } else {
      this.respondPlayError();
      console.warn("[rtmp play] stream not found " + this.streamId);
    }
  }

}

module.exports = NodeRtmpSession
