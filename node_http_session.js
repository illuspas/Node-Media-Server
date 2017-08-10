//
//  Created by Mingliang Chen on 17/8/4.
//  illuspas[a]gmail.com
//  Copyright (c) 2017 Nodemedia. All rights reserved.
//
const EventEmitter = require('events');
const URL = require('url');

const AMF = require('./node_core_amf');
const BufferPool = require('./node_core_bufferpool');

class NodeHttpSession extends EventEmitter {
  constructor(config, req, res) {
    super();
    this.req = req;
    this.res = res;
    this.bp = new BufferPool();
    this.bp.on('error', (e) => {

    });
    this.allow_origin = config.allow_origin == undefined ? '*' : config.allow_origin;
    this.isPublisher = false;

    this.on('connect', this.onConnect);
    this.on('play', this.onPlay);
    this.on('publish', this.onPublish);

    this.req.on('data', this.onReqData.bind(this));
    this.req.socket.on('end', this.onReqClose.bind(this));
    this.req.on('error', this.onReqError.bind(this));

  }

  run() {
    let method = this.req.method;
    let urlInfo = URL.parse(this.req.url, true);
    let streamId = urlInfo.pathname.split('.')[0].slice(1);
    let format = urlInfo.pathname.split('.')[1];

    if (format != 'flv') {
      console.log('Unsupported format=' + format);
      this.res.statusCode = 403;
      this.res.end();
      return;
    }
    this.streamId = streamId;
    if (method == 'GET') {
      //Play 
      console.log("[http-flv play] play stream " + this.streamId);
      this.emit('play');

    } else if (method == 'POST') {
      //Publish

      console.log('Unsupported method=' + method);
      this.res.statusCode = 405;
      this.res.end();
      return;
    } else {
      console.log('Unsupported method=' + method);
      this.res.statusCode = 405;
      this.res.end();
      return;
    }

    this.isStarting = true;
    this.bp.init(this.handleData())
  }

  onReqData(data) {
    this.bp.push(data);
  }

  onReqClose() {
    this.stop();
  }

  onReqError(e) {
    console.log('on req error', e);
  }

  stop() {
    this.isStarting = false;
    this.bp.stop();
  }

  * handleData() {

    console.log('http-flv parse message [start]');
    while (this.isStarting) {
      if (this.bp.need(9)) {
        if (yield) break;

      }
    }

    console.log('http-flv parse message [stop]');
    if (this.isPublisher) {

    } else {
      let publisherId = this.publishers.get(this.streamId);
      if (publisherId != null) {
        this.sessions.get(publisherId).players.delete(this.id);
      }
    }
    this.sessions.delete(this.id);
    this.publishers = null;
    this.sessions = null;
    this.bp = null;
    this.req = null;
    this.res = null;
  }

  respondUnpublish() {
    this.res.end();
  }

  onConnect() {

  }

  onPlay() {
    if (this.publishers.has(this.streamId)) {
      let publisherId = this.publishers.get(this.streamId);
      let publisher = this.sessions.get(publisherId);
      let players = publisher.players;
      players.add(this.id);

      this.res.setHeader('Content-Type', 'video/x-flv');
      this.res.setHeader('Access-Control-Allow-Origin', this.allow_origin);
      //send FLV header 
      let FLVHeader = Buffer.from([0x46, 0x4C, 0x56, 0x01, 0x00, 0x00, 0x00, 0x00, 0x09, 0x00, 0x00, 0x00, 0x00]);
      if (publisher.isFirstAudioReceived) {
        FLVHeader[4] |= 0b00000100;
      }

      if (publisher.isFirstVideoReceived) {
        FLVHeader[4] |= 0b00000001;
      }
      this.res.write(FLVHeader);
      if (publisher.metaData != null) {
        //send Metadata 
        let rtmpHeader = {
          chunkStreamID: 5,
          timestamp: 0,
          messageTypeID: 0x12,
          messageStreamID: 1
        };

        let metaDataFlvMessage = NodeHttpSession.createFlvMessage(rtmpHeader, publisher.metaData);
        this.res.write(metaDataFlvMessage);
      }
      //send aacSequenceHeader
      if (publisher.audioCodec == 10) {
        let rtmpHeader = {
          chunkStreamID: 4,
          timestamp: 0,
          messageTypeID: 0x08,
          messageStreamID: 1
        };
        let flvMessage = NodeHttpSession.createFlvMessage(rtmpHeader, publisher.aacSequenceHeader);
        this.res.write(flvMessage);
      }
      //send avcSequenceHeader
      if (publisher.videoCodec == 7) {
        let rtmpHeader = {
          chunkStreamID: 6,
          timestamp: 0,
          messageTypeID: 0x09,
          messageStreamID: 1
        };
        let flvMessage = NodeHttpSession.createFlvMessage(rtmpHeader, publisher.avcSequenceHeader);
        this.res.write(flvMessage);
      }
      //send gop cache
      if (publisher.flvGopCacheQueue != null) {
        for (let flvMessage of publisher.flvGopCacheQueue) {
          this.res.write(flvMessage);
        }
      }
    } else {
      this.res.statusCode = 404;
      this.res.end();
      return
    }

    console.log("[http-flv play] join stream " + this.streamId);
  }

  onPublish() {

  }

  static createFlvMessage(rtmpHeader, rtmpBody) {
    let FLVTagHeader = Buffer.alloc(11);
    FLVTagHeader[0] = rtmpHeader.messageTypeID;
    FLVTagHeader.writeUIntBE(rtmpBody.length, 1, 3);
    FLVTagHeader[4] = (rtmpHeader.timestamp >> 16) & 0xFF;
    FLVTagHeader[5] = (rtmpHeader.timestamp >> 8) & 0xFF;
    FLVTagHeader[6] = rtmpHeader.timestamp & 0xFF;
    FLVTagHeader[7] = (rtmpHeader.timestamp >> 24) & 0xFF;
    FLVTagHeader.writeUIntBE(0, 8, 3);
    let PreviousTagSizeN = Buffer.alloc(4);
    PreviousTagSizeN.writeUInt32BE(11 + rtmpBody.length);
    return Buffer.concat([FLVTagHeader, rtmpBody, PreviousTagSizeN]);
  }

}

module.exports = NodeHttpSession;