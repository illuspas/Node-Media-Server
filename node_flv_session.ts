//  Created by Mingliang Chen on 17/8/4.
//  illuspas[a]gmail.com
//  Copyright (c) 2017 Nodemedia. All rights reserved.

import { EventEmitter } from 'events';
import { ParsedUrlQuery } from 'querystring';
import * as url from 'url';

import { BufferPool } from './node_core_bufferpool';
import { nodeEvent } from './node_core_utils';

export class NodeFlvSession extends EventEmitter {
  config: any;

  req: any;
  res: any;
  bp: BufferPool;
  allow_origin: string;
  isPublisher: boolean;
  playStreamPath: string;
  playArgs: ParsedUrlQuery;
  nodeEvent: EventEmitter;
  TAG: string;
  connectCmdObj: any;
  isStarting: boolean;
  connectTime: Date;
  sessions: Map<string, any>;
  publishers: Map<string, string>;
  idlePlayers: Set<string>;
  id: string;

  constructor(config, req, res) {
    super();

    this.config = config;

    this.req = req;
    this.res = res;
    this.bp = new BufferPool();
    this.bp.on('error', e => {});
    this.allow_origin = config.http.allow_origin || '*';
    this.isPublisher = false;
    this.playStreamPath = '';
    this.playArgs = null;
    this.nodeEvent = nodeEvent;

    this.on('connect', this.onConnect);
    this.on('play', this.onPlay);
    this.on('publish', this.onPublish);

    if (req.nmsConnectionType === 'ws') {
      this.res.on('message', this.onReqData.bind(this));
      this.res.on('close', this.onReqClose.bind(this));
      this.res.on('error', this.onReqError.bind(this));
      this.res.write = this.res.send;
      this.res.end = this.res.close;
      this.TAG = 'websocket-flv';
    } else {
      this.req.on('data', this.onReqData.bind(this));
      this.req.socket.on('close', this.onReqClose.bind(this));
      this.req.on('error', this.onReqError.bind(this));
      this.TAG = 'http-flv';
    }
  }

  run() {
    const method = this.req.method;
    const urlInfo = url.parse(this.req.url, true);
    const streamPath = urlInfo.pathname.split('.')[0];
    const format = urlInfo.pathname.split('.')[1];
    this.connectCmdObj = { method, streamPath, query: urlInfo.query };
    this.nodeEvent.emit('preConnect', this.id, this.connectCmdObj);

    this.isStarting = true;
    this.bp.init(this.handleData());

    this.connectTime = new Date();

    if (format !== 'flv') {
      console.log(`[${this.TAG}] Unsupported format=${format}`);
      this.res.statusCode = 403;
      this.res.end();
      return;
    }

    this.nodeEvent.emit('postConnect', this.id, this.connectCmdObj);

    switch (method) {
      case 'GET': {
        //Play
        this.playStreamPath = streamPath;
        this.playArgs = urlInfo.query;
        console.log(`[${this.TAG} play] play stream ` + this.playStreamPath);
        this.emit('play');
        return;
      }
      case 'POST': {
        //Publish
        console.log(`[${this.TAG}] Unsupported method=` + method);
        this.res.statusCode = 405;
        this.res.end();
        return;
      }
      default: {
        console.log(`[${this.TAG}] Unsupported method=` + method);
        this.res.statusCode = 405;
        this.res.end();
        return;
      }
    }
  }

  onReqData(data) {
    this.bp.push(data);
  }

  onReqClose() {
    this.stop();
  }

  onReqError(e) {
    this.stop();
  }

  stop() {
    if (this.isStarting) {
      this.isStarting = false;
      this.bp.stop();
    }
  }

  reject() {
    this.stop();
  }

  *handleData() {
    console.log(`[${this.TAG} message parser] start`);
    while (this.isStarting) {
      if (this.bp.need(9)) {
        if (yield) {
          break;
        }
      }
    }

    console.log(`[${this.TAG} message parser] done`);
    if (!this.isPublisher) {
      const publisherId = this.publishers.get(this.playStreamPath);

      if (publisherId) {
        this.sessions.get(publisherId).players.delete(this.id);
        this.nodeEvent.emit(
          'donePlay',
          this.id,
          this.playStreamPath,
          this.playArgs,
        );
      }
    }

    this.nodeEvent.emit('doneConnect', this.id, this.connectCmdObj);
    this.res.end();
    this.idlePlayers.delete(this.id);
    this.sessions.delete(this.id);
    this.idlePlayers = null;
    this.publishers = null;
    this.sessions = null;
    this.bp = null;
    this.req = null;
    this.res = null;
  }

  respondUnpublish() {
    this.res.end();
  }

  onConnect() {}

  onPlay() {
    this.nodeEvent.emit('prePlay', this.id, this.playStreamPath, this.playArgs);

    if (!this.isStarting) {
      return;
    }

    if (!this.publishers.has(this.playStreamPath)) {
      console.log(`[${this.TAG} play] stream not found ` + this.playStreamPath);
      this.idlePlayers.add(this.id);
      return;
    }

    const publisherId = this.publishers.get(this.playStreamPath);
    const publisher = this.sessions.get(publisherId);
    const players = publisher.players;
    players.add(this.id);

    if (this.res.setHeader) {
      this.res.setHeader('Content-Type', 'video/x-flv');
      this.res.setHeader('Access-Control-Allow-Origin', this.allow_origin);
    }

    //send FLV header
    const FLVHeader = Buffer.from([
      0x46,
      0x4c,
      0x56,
      0x01,
      0x00,
      0x00,
      0x00,
      0x00,
      0x09,
      0x00,
      0x00,
      0x00,
      0x00,
    ]);
    if (publisher.isFirstAudioReceived) {
      FLVHeader[4] |= 0b00000100;
    }

    if (publisher.isFirstVideoReceived) {
      FLVHeader[4] |= 0b00000001;
    }
    this.res.write(FLVHeader);
    if (publisher.metaData) {
      //send Metadata
      const rtmpHeader = {
        chunkStreamID: 5,
        timestamp: 0,
        messageTypeID: 0x12,
        messageStreamID: 1,
      };

      const metaDataFlvMessage = NodeFlvSession.createFlvMessage(
        rtmpHeader,
        publisher.metaData,
      );
      this.res.write(metaDataFlvMessage);
    }
    //send aacSequenceHeader
    if (publisher.audioCodec === 10) {
      const rtmpHeader = {
        chunkStreamID: 4,
        timestamp: 0,
        messageTypeID: 0x08,
        messageStreamID: 1,
      };
      const flvMessage = NodeFlvSession.createFlvMessage(
        rtmpHeader,
        publisher.aacSequenceHeader,
      );
      this.res.write(flvMessage);
    }
    //send avcSequenceHeader
    if (publisher.videoCodec === 7) {
      const rtmpHeader = {
        chunkStreamID: 6,
        timestamp: 0,
        messageTypeID: 0x09,
        messageStreamID: 1,
      };
      const flvMessage = NodeFlvSession.createFlvMessage(
        rtmpHeader,
        publisher.avcSequenceHeader,
      );
      this.res.write(flvMessage);
    }
    //send gop cache
    if (publisher.flvGopCacheQueue) {
      for (const flvMessage of publisher.flvGopCacheQueue) {
        this.res.write(flvMessage);
      }
    }
    console.log(`[${this.TAG} play] join stream ` + this.playStreamPath);
    this.nodeEvent.emit(
      'postPlay',
      this.id,
      this.playStreamPath,
      this.playArgs,
    );
  }

  onPublish() {}

  static createFlvMessage(rtmpHeader, rtmpBody) {
    const FLVTagHeader = Buffer.alloc(11);
    FLVTagHeader[0] = rtmpHeader.messageTypeID;
    FLVTagHeader.writeUIntBE(rtmpBody.length, 1, 3);
    FLVTagHeader[4] = (rtmpHeader.timestamp >> 16) & 0xff;
    FLVTagHeader[5] = (rtmpHeader.timestamp >> 8) & 0xff;
    FLVTagHeader[6] = rtmpHeader.timestamp & 0xff;
    FLVTagHeader[7] = (rtmpHeader.timestamp >> 24) & 0xff;
    FLVTagHeader.writeUIntBE(0, 8, 3);
    const PreviousTagSizeN = Buffer.alloc(4);
    PreviousTagSizeN.writeUInt32BE(11 + rtmpBody.length);
    return Buffer.concat([FLVTagHeader, rtmpBody, PreviousTagSizeN]);
  }
}
