import { TLSSocket } from "tls";
import { IMediaServerOptions } from "./types/IMediaServerOptions";
import { IRunnable } from "./types/IRunnable";
import { Socket } from "net";

const QueryString = require("querystring");
const AV = require("./node_core_av");
const {
  AUDIO_SOUND_RATE,
  AUDIO_CODEC_NAME,
  VIDEO_CODEC_NAME,
} = require("./node_core_av");

const AMF = require("./node_core_amf");
const Handshake = require("./node_rtmp_handshake");
const NodeCoreUtils = require("./node_core_utils");
const NodeFlvSession = require("./node_flv_session");
const Logger = require("./node_core_logger");

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
const RTMP_PING_TIME = 60000;
const RTMP_PING_TIMEOUT = 30000;

const STREAM_BEGIN = 0x00;
const STREAM_EOF = 0x01;
const STREAM_DRY = 0x02;
const STREAM_EMPTY = 0x1f;
const STREAM_READY = 0x20;

// Enhancing RTMP, FLV  2023-03-v1.0.0-B.9
// https://github.com/veovera/enhanced-rtmp
const FourCC_AV1 = Buffer.from("av01");
const FourCC_VP9 = Buffer.from("vp09");
const FourCC_HEVC = Buffer.from("hvc1");

const PacketTypeSequenceStart = 0;
const PacketTypeCodedFrames = 1;
const PacketTypeSequenceEnd = 2;
const PacketTypeCodedFramesX = 3;
const PacketTypeMetadata = 4;
const PacketTypeMPEG2TSSequenceStart = 5;

class RtmpPacketHeader {
  public timestamp: number = 0;
  public length: number = 0;
  public type: number = 0;
  public stream_id: number = 0;

  constructor(public fmt: number = 0, public cid: number = 0) {}
}

class RtmpPacket {
  public header: RtmpPacketHeader;
  public clock: number = 0;
  public payload: any;
  public capacity: number = 0;
  public bytes: number = 0;

  constructor(fmt: number = 0, cid: number = 0) {
    this.header = new RtmpPacketHeader(fmt, cid);
  }
}

const TAG: string = "rtmp";

export class RtmpSession implements IRunnable {
  private _id?: string;
  private _ip?: string;

  private _handshakePayload: Buffer = Buffer.alloc(RTMP_HANDSHAKE_SIZE);
  private _handshakeState: number = RTMP_HANDSHAKE_UNINIT;
  private _handshakeBytes: number = 0;

  private _parserBuffer: Buffer = Buffer.alloc(MAX_CHUNK_HEADER);
  private _parserState: number = RTMP_PARSE_INIT;
  private _parserBytes: number = 0;
  private _parserBasicBytes: number = 0;
  private _parserPacket: any;
  private _inPackets: Map<any, any> = new Map();

  private _inChunkSize: number = RTMP_CHUNK_SIZE;
  private _outChunkSize: number;
  private _pingTime: number;
  private _pingTimeout: number;
  private _pingInterval: any;

  private _starting: boolean = false;
  private _publishing: boolean = false;
  private _playing: boolean = false;
  private _idling: boolean = false;
  private _paused: boolean = false;
  private _receiveAudio: boolean = true;
  private _receiveVideo: boolean = true;
  private _metaData: any;

  private _aacSequenceHeader?: Buffer;
  private _avcSequenceHeader?: Buffer;
  private _audioCodec: number = 0;
  private _audioSamplerate: number = 0;
  private _isFirstAudioReceived: boolean = false;
  private _audioCodecName: string = "";
  private _audioProfileName: string = "";
  private _audioChannels: number = 1;

  private _videoCodec: number = 0;
  private _videoCodecName: string = "";
  private _videoProfileName: string = "";
  private _videoWidth: number = 0;
  private _videoHeight: number = 0;
  private _videoFPS: number = 0;
  private _videoCount: number = 0;
  private _videoLevel: number = 0;

  private _bitrate: number = 0;
  private _ackSize: number = 0;
  private _inAckSize: number = 0;
  private _inLastAck: number = 0;

  private _appName: string = "";
  private _streams: number = 0;

  private _playStreamId: number = 0;
  private _playStreamPath: string = "";
  private _playArgs: any = {};

  private _publishStreamId: number = 0;
  private _publishStreamPath: string = "";
  private _publishArgs: any = {};

  private _players: Set<any> = new Set();
  private _numPlayCache: number = 0;
  private _bitrateCache: any = {};

  private _rtmpGopCacheQueue?: Set<any>;
  private _flvGopCacheQueue?: Set<any>;

  private _connectCmdObj?: any;
  private _objectEncoding?: any;

  private _connectTimestamp: number = 0;
  private _startTimestamp: number = 0;

  private get isLocal() {
    return (
      this._ip === "127.0.0.1" ||
      this._ip === "::1" ||
      this._ip == "::ffff:127.0.0.1"
    );
  }

  constructor(
    private _config: IMediaServerOptions,
    private _socket: Socket | TLSSocket
  ) {
    this._id = NodeCoreUtils.generateNewSessionID();
    this._ip = this._socket.remoteAddress;
    this._outChunkSize = this._config.rtmp?.chunk_size ? this._config.rtmp?.chunk_size : RTMP_CHUNK_SIZE;
    this._pingTime = this._config.rtmp?.ping ? this._config.rtmp?.ping * 1000 : RTMP_PING_TIME;
    this._pingTimeout = this._config.rtmp?.ping_timeout ? this._config.rtmp?.ping_timeout * 1000 : RTMP_PING_TIMEOUT;

    if (this._config.rtmp?.gop_cache) {
      this._rtmpGopCacheQueue = new Set();
      this._flvGopCacheQueue = new Set();
    }

    sessions.set(this._id, this);
  }

  public async run(): Promise<void> {
    this._socket.on("data", this.onSocketData.bind(this));
    this._socket.on("close", this.onSocketClose.bind(this));
    this._socket.on("error", this.onSocketError.bind(this));
    this._socket.on("timeout", this.onSocketTimeout.bind(this));
    this._socket.setTimeout(this._pingTimeout);
    this._starting = true;
  }

  public async stop(): Promise<void> {
    if (this._starting) {
      this._starting = false;

      if (this._playStreamId > 0) {
        this.onDeleteStream({ streamId: this._playStreamId });
      }

      if (this._publishStreamId > 0) {
        this.onDeleteStream({ streamId: this._publishStreamId });
      }

      if (this._pingInterval != null) {
        clearInterval(this._pingInterval);
        this._pingInterval = null;
      }

      Logger.log(`[rtmp disconnect] id=${this._id}`);

      this._connectCmdObj.bytesWritten = this._socket.bytesWritten;
      this._connectCmdObj.bytesRead = this._socket.bytesRead;
      events.emit("doneConnect", this._id, this._connectCmdObj);

      sessions.delete(this._id);
      this._socket.destroy();
    }
  }

  private reject(): void {
    Logger.log(`[rtmp reject] id=${this._id}`);
    this.stop();
  }

  private flush(): void {
    if (this._numPlayCache > 0) {
      this._socket.uncork();
    }
  }

  private onSocketClose(): void {
    Logger.log('RTMP socket closed');
    this.stop();
  }

  private onSocketError(e: Error): void {
    Logger.log('RTMP socket errored', e);
    this.stop();
  }

  private onSocketTimeout(): void {
    Logger.log('RTMP socket timed out');
    this.stop();
  }

  /**
   * onSocketData
   * @param {Buffer} data
   * @returns
   */
  private onSocketData(data: Buffer): void {
    let bytes = data.length;
    let p = 0;
    let n = 0;
    while (bytes > 0) {
      switch (this._handshakeState) {
        case RTMP_HANDSHAKE_UNINIT:
          //Logger.log('RTMP_HANDSHAKE_UNINIT');
          this._handshakeState = RTMP_HANDSHAKE_0;
          this._handshakeBytes = 0;
          bytes -= 1;
          p += 1;
          break;
        case RTMP_HANDSHAKE_0:
          //Logger.log('RTMP_HANDSHAKE_0');
          n = RTMP_HANDSHAKE_SIZE - this._handshakeBytes;
          n = n <= bytes ? n : bytes;
          data.copy(this._handshakePayload, this._handshakeBytes, p, p + n);
          this._handshakeBytes += n;
          bytes -= n;
          p += n;
          if (this._handshakeBytes === RTMP_HANDSHAKE_SIZE) {
            this._handshakeState = RTMP_HANDSHAKE_1;
            this._handshakeBytes = 0;
            let s0s1s2 = Handshake.generateS0S1S2(this._handshakePayload);
            this._socket.write(s0s1s2);
          }
          break;
        case RTMP_HANDSHAKE_1:
          //Logger.log('RTMP_HANDSHAKE_1');
          n = RTMP_HANDSHAKE_SIZE - this._handshakeBytes;
          n = n <= bytes ? n : bytes;
          data.copy(this._handshakePayload, this._handshakeBytes, p, n);
          this._handshakeBytes += n;
          bytes -= n;
          p += n;
          if (this._handshakeBytes === RTMP_HANDSHAKE_SIZE) {
            this._handshakeState = RTMP_HANDSHAKE_2;
            this._handshakeBytes = 0;
          }
          break;
        case RTMP_HANDSHAKE_2:
        default:
          //Logger.log('RTMP_HANDSHAKE_2');
          return this.rtmpChunkRead(data, p, bytes);
      }
    }
  }

  private rtmpChunkBasicHeaderCreate(fmt: number, cid: number): Buffer {
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
  }

  private rtmpChunkMessageHeaderCreate(header: any): Buffer {
    let out = Buffer.alloc(rtmpHeaderSize[header.fmt % 4]);
    if (header.fmt <= RTMP_CHUNK_TYPE_2) {
      out.writeUIntBE(
        header.timestamp >= 0xffffff ? 0xffffff : header.timestamp,
        0,
        3
      );
    }

    if (header.fmt <= RTMP_CHUNK_TYPE_1) {
      out.writeUIntBE(header.length, 3, 3);
      out.writeUInt8(header.type, 6);
    }

    if (header.fmt === RTMP_CHUNK_TYPE_0) {
      out.writeUInt32LE(header.stream_id, 7);
    }
    return out;
  }

  /**
   * rtmpChunksCreate
   * @param {RtmpPacket} packet
   * @returns
   */
  private rtmpChunksCreate(packet: RtmpPacket): Buffer {
    let header = packet.header;
    let payload = packet.payload;
    let payloadSize = header.length;
    let chunkSize = this._outChunkSize;
    let chunksOffset = 0;
    let payloadOffset = 0;
    let chunkBasicHeader = this.rtmpChunkBasicHeaderCreate(
      header.fmt,
      header.cid
    );
    let chunkBasicHeader3 = this.rtmpChunkBasicHeaderCreate(
      RTMP_CHUNK_TYPE_3,
      header.cid
    );
    let chunkMessageHeader = this.rtmpChunkMessageHeaderCreate(header);
    let useExtendedTimestamp = header.timestamp >= 0xffffff;
    let headerSize =
      chunkBasicHeader.length +
      chunkMessageHeader.length +
      (useExtendedTimestamp ? 4 : 0);
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
        payload.copy(
          chunks,
          chunksOffset,
          payloadOffset,
          payloadOffset + chunkSize
        );
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
        payload.copy(
          chunks,
          chunksOffset,
          payloadOffset,
          payloadOffset + payloadSize
        );
        payloadSize -= payloadSize;
        chunksOffset += payloadSize;
        payloadOffset += payloadSize;
      }
    }
    return chunks;
  }

  /**
   * rtmpChunkRead
   * @param {Buffer} data
   * @param {Number} p
   * @param {Number} bytes
   */
  private rtmpChunkRead(data: Buffer, p: number, bytes: number): void {
    //Logger.log('rtmpChunkRead', p, bytes);
    let size = 0;
    let offset = 0;
    let extended_timestamp = 0;

    while (offset < bytes) {
      switch (this._parserState) {
        case RTMP_PARSE_INIT:
          this._parserBytes = 1;
          this._parserBuffer[0] = data[p + offset++];
          if (0 === (this._parserBuffer[0] & 0x3f)) {
            this._parserBasicBytes = 2;
          } else if (1 === (this._parserBuffer[0] & 0x3f)) {
            this._parserBasicBytes = 3;
          } else {
            this._parserBasicBytes = 1;
          }
          this._parserState = RTMP_PARSE_BASIC_HEADER;
          break;
        case RTMP_PARSE_BASIC_HEADER:
          while (this._parserBytes < this._parserBasicBytes && offset < bytes) {
            this._parserBuffer[this._parserBytes++] = data[p + offset++];
          }
          if (this._parserBytes >= this._parserBasicBytes) {
            this._parserState = RTMP_PARSE_MESSAGE_HEADER;
          }
          break;
        case RTMP_PARSE_MESSAGE_HEADER:
          size =
            rtmpHeaderSize[this._parserBuffer[0] >> 6] + this._parserBasicBytes;
          while (this._parserBytes < size && offset < bytes) {
            this._parserBuffer[this._parserBytes++] = data[p + offset++];
          }
          if (this._parserBytes >= size) {
            this.rtmpPacketParse();
            this._parserState = RTMP_PARSE_EXTENDED_TIMESTAMP;
          }
          break;
        case RTMP_PARSE_EXTENDED_TIMESTAMP:
          size =
            rtmpHeaderSize[this._parserPacket.header.fmt] +
            this._parserBasicBytes;
          if (this._parserPacket.header.timestamp === 0xffffff) size += 4;
          while (this._parserBytes < size && offset < bytes) {
            this._parserBuffer[this._parserBytes++] = data[p + offset++];
          }
          if (this._parserBytes >= size) {
            if (this._parserPacket.header.timestamp === 0xffffff) {
              extended_timestamp = this._parserBuffer.readUInt32BE(
                rtmpHeaderSize[this._parserPacket.header.fmt] +
                  this._parserBasicBytes
              );
            } else {
              extended_timestamp = this._parserPacket.header.timestamp;
            }

            if (this._parserPacket.bytes === 0) {
              if (RTMP_CHUNK_TYPE_0 === this._parserPacket.header.fmt) {
                this._parserPacket.clock = extended_timestamp;
              } else {
                this._parserPacket.clock += extended_timestamp;
              }
              this.rtmpPacketAlloc();
            }
            this._parserState = RTMP_PARSE_PAYLOAD;
          }
          break;
        case RTMP_PARSE_PAYLOAD:
          size = Math.min(
            this._inChunkSize - (this._parserPacket.bytes % this._inChunkSize),
            this._parserPacket.header.length - this._parserPacket.bytes
          );
          size = Math.min(size, bytes - offset);
          if (size > 0) {
            data.copy(
              this._parserPacket.payload,
              this._parserPacket.bytes,
              p + offset,
              p + offset + size
            );
          }
          this._parserPacket.bytes += size;
          offset += size;

          if (this._parserPacket.bytes >= this._parserPacket.header.length) {
            this._parserState = RTMP_PARSE_INIT;
            this._parserPacket.bytes = 0;
            if (this._parserPacket.clock > 0xffffffff) {
              break;
            }
            this.rtmpHandler();
          } else if (0 === this._parserPacket.bytes % this._inChunkSize) {
            this._parserState = RTMP_PARSE_INIT;
          }
          break;
      }
    }

    this._inAckSize += data.length;
    if (this._inAckSize >= 0xf0000000) {
      this._inAckSize = 0;
      this._inLastAck = 0;
    }
    if (
      this._ackSize > 0 &&
      this._inAckSize - this._inLastAck >= this._ackSize
    ) {
      this._inLastAck = this._inAckSize;
      this.sendACK(this._inAckSize);
    }

    this._bitrateCache.bytes += bytes;
    let current_time = Date.now();
    let diff = current_time - this._bitrateCache.last_update;
    if (diff >= this._bitrateCache.intervalMs) {
      this._bitrate = Math.round((this._bitrateCache.bytes * 8) / diff);
      this._bitrateCache.bytes = 0;
      this._bitrateCache.last_update = current_time;
    }
  }

  private rtmpPacketParse(): void {
    let fmt = this._parserBuffer[0] >> 6;
    let cid = 0;
    if (this._parserBasicBytes === 2) {
      cid = 64 + this._parserBuffer[1];
    } else if (this._parserBasicBytes === 3) {
      cid = (64 + this._parserBuffer[1] + this._parserBuffer[2]) << 8;
    } else {
      cid = this._parserBuffer[0] & 0x3f;
    }
    let hasp = this._inPackets.has(cid);
    if (!hasp) {
      this._parserPacket = new RtmpPacket(fmt, cid);
      this._inPackets.set(cid, this._parserPacket);
    } else {
      this._parserPacket = this._inPackets.get(cid);
    }
    this._parserPacket.header.fmt = fmt;
    this._parserPacket.header.cid = cid;
    this.rtmpChunkMessageHeaderRead();

    if (this._parserPacket.header.type > RTMP_TYPE_METADATA) {
      Logger.error("rtmp packet parse error.", this._parserPacket);
      this.stop();
    }
  }

  private rtmpChunkMessageHeaderRead(): number {
    let offset = this._parserBasicBytes;

    // timestamp / delta
    if (this._parserPacket.header.fmt <= RTMP_CHUNK_TYPE_2) {
      this._parserPacket.header.timestamp = this._parserBuffer.readUIntBE(
        offset,
        3
      );
      offset += 3;
    }

    // message length + type
    if (this._parserPacket.header.fmt <= RTMP_CHUNK_TYPE_1) {
      this._parserPacket.header.length = this._parserBuffer.readUIntBE(
        offset,
        3
      );
      this._parserPacket.header.type = this._parserBuffer[offset + 3];
      offset += 4;
    }

    if (this._parserPacket.header.fmt === RTMP_CHUNK_TYPE_0) {
      this._parserPacket.header.stream_id =
        this._parserBuffer.readUInt32LE(offset);
      offset += 4;
    }
    return offset;
  }

  private rtmpPacketAlloc() {
    if (this._parserPacket.capacity < this._parserPacket.header.length) {
      this._parserPacket.payload = Buffer.alloc(
        this._parserPacket.header.length + 1024
      );
      this._parserPacket.capacity = this._parserPacket.header.length + 1024;
    }
  }

  private rtmpHandler(): number | void {
    switch (this._parserPacket.header.type) {
      case RTMP_TYPE_SET_CHUNK_SIZE:
      case RTMP_TYPE_ABORT:
      case RTMP_TYPE_ACKNOWLEDGEMENT:
      case RTMP_TYPE_WINDOW_ACKNOWLEDGEMENT_SIZE:
      case RTMP_TYPE_SET_PEER_BANDWIDTH:
        //@ts-ignore;
        return this.rtmpControlHandler() === 0 ? -1 : 0;
      case RTMP_TYPE_EVENT:
        //@ts-ignore;
        return this.rtmpEventHandler() === 0 ? -1 : 0;
      case RTMP_TYPE_AUDIO:
        return this.rtmpAudioHandler();
      case RTMP_TYPE_VIDEO:
        return this.rtmpVideoHandler();
      case RTMP_TYPE_FLEX_MESSAGE:
      case RTMP_TYPE_INVOKE:
        return this.rtmpInvokeHandler();
      case RTMP_TYPE_FLEX_STREAM: // AMF3
      case RTMP_TYPE_DATA: // AMF0
        return this.rtmpDataHandler();
    }
  }

  private rtmpControlHandler(): void {
    let payload = this._parserPacket.payload;
    switch (this._parserPacket.header.type) {
      case RTMP_TYPE_SET_CHUNK_SIZE:
        this._inChunkSize = payload.readUInt32BE();
        // Logger.debug('set inChunkSize', this.inChunkSize);
        break;
      case RTMP_TYPE_ABORT:
        break;
      case RTMP_TYPE_ACKNOWLEDGEMENT:
        break;
      case RTMP_TYPE_WINDOW_ACKNOWLEDGEMENT_SIZE:
        this._ackSize = payload.readUInt32BE();
        // Logger.debug('set ack Size', this.ackSize);
        break;
      case RTMP_TYPE_SET_PEER_BANDWIDTH:
        break;
    }
  }

  private rtmpEventHandler(): void {}

  private rtmpAudioHandler(): void {
    let payload = this._parserPacket.payload.slice(
      0,
      this._parserPacket.header.length
    );
    let sound_format = (payload[0] >> 4) & 0x0f;
    let sound_type = payload[0] & 0x01;
    let sound_size = (payload[0] >> 1) & 0x01;
    let sound_rate = (payload[0] >> 2) & 0x03;

    if (this._audioCodec == 0) {
      this._audioCodec = sound_format;
      this._audioCodecName = AUDIO_CODEC_NAME[sound_format];
      this._audioSamplerate = AUDIO_SOUND_RATE[sound_rate];
      this._audioChannels = ++sound_type;

      if (sound_format == 4) {
        //Nellymoser 16 kHz
        this._audioSamplerate = 16000;
      } else if (sound_format == 5 || sound_format == 7 || sound_format == 8) {
        //Nellymoser 8 kHz | G.711 A-law | G.711 mu-law
        this._audioSamplerate = 8000;
      } else if (sound_format == 11) {
        // Speex
        this._audioSamplerate = 16000;
      } else if (sound_format == 14) {
        //  MP3 8 kHz
        this._audioSamplerate = 8000;
      }

      if (sound_format != 10 && sound_format != 13) {
        Logger.log(
          `[rtmp publish] Handle audio. id=${this._id} streamPath=${this._publishStreamPath} sound_format=${sound_format} sound_type=${sound_type} sound_size=${sound_size} sound_rate=${sound_rate} codec_name=${this._audioCodecName} ${this._audioSamplerate} ${this._audioChannels}ch`
        );
      }
    }

    if ((sound_format == 10 || sound_format == 13) && payload[1] == 0) {
      //cache aac sequence header
      this._isFirstAudioReceived = true;
      this._aacSequenceHeader = Buffer.alloc(payload.length);
      payload.copy(this._aacSequenceHeader);
      if (sound_format == 10) {
        let info = AV.readAACSpecificConfig(this._aacSequenceHeader);
        this._audioProfileName = AV.getAACProfileName(info);
        this._audioSamplerate = info.sample_rate;
        this._audioChannels = info.channels;
      } else {
        this._audioSamplerate = 48000;
        this._audioChannels = payload[11];
      }

      Logger.log(
        `[rtmp publish] Handle audio. id=${this._id} streamPath=${this._publishStreamPath} sound_format=${sound_format} sound_type=${sound_type} sound_size=${sound_size} sound_rate=${sound_rate} codec_name=${this._audioCodecName} ${this._audioSamplerate} ${this._audioChannels}ch`
      );
    }

    let packet = new RtmpPacket();
    packet.header.fmt = RTMP_CHUNK_TYPE_0;
    packet.header.cid = RTMP_CHANNEL_AUDIO;
    packet.header.type = RTMP_TYPE_AUDIO;
    packet.payload = payload;
    packet.header.length = packet.payload.length;
    packet.header.timestamp = this._parserPacket.clock;
    let rtmpChunks = this.rtmpChunksCreate(packet);
    let flvTag = NodeFlvSession.createFlvTag(packet);

    //cache gop
    if (this._rtmpGopCacheQueue != null) {
      if (this._aacSequenceHeader != null && payload[1] === 0) {
        //skip aac sequence header
      } else {
        this._rtmpGopCacheQueue.add(rtmpChunks);
        this._flvGopCacheQueue?.add(flvTag);
      }
    }

    for (let playerId of this._players) {
      let playerSession = sessions.get(playerId);

      if (playerSession.numPlayCache === 0) {
        playerSession.res.cork();
      }

      if (playerSession instanceof RtmpSession) {
        if (
          playerSession._starting &&
          playerSession._playing &&
          !playerSession._paused &&
          playerSession._receiveAudio
        ) {
          rtmpChunks.writeUInt32LE(playerSession._playStreamId, 8);
          playerSession._socket.write(rtmpChunks);
        }
      } else if (playerSession instanceof NodeFlvSession) {
        playerSession.res.write(flvTag, null, (e: Error) => {
          //websocket will throw a error if not set the cb when closed
        });
      }

      playerSession.numPlayCache++;

      if (playerSession.numPlayCache === 10) {
        process.nextTick(() => playerSession.res.uncork());
        playerSession.numPlayCache = 0;
      }
    }
  }

  private rtmpVideoHandler(): void {
    let payload = this._parserPacket.payload.slice(
      0,
      this._parserPacket.header.length
    );
    let isExHeader = ((payload[0] >> 4) & 0b1000) !== 0;
    let frame_type = (payload[0] >> 4) & 0b0111;
    let codec_id = payload[0] & 0x0f;
    let packetType = payload[0] & 0x0f;
    if (isExHeader) {
      if (packetType == PacketTypeMetadata) {
      } else if (packetType == PacketTypeSequenceEnd) {
      }
      let FourCC = payload.subarray(1, 5);
      if (FourCC.compare(FourCC_HEVC) == 0) {
        codec_id = 12;
        if (packetType == PacketTypeSequenceStart) {
          payload[0] = 0x1c;
          payload[1] = 0;
          payload[2] = 0;
          payload[3] = 0;
          payload[4] = 0;
        } else if (
          packetType == PacketTypeCodedFrames ||
          packetType == PacketTypeCodedFramesX
        ) {
          if (packetType == PacketTypeCodedFrames) {
            payload = payload.subarray(3);
          } else {
            payload[2] = 0;
            payload[3] = 0;
            payload[4] = 0;
          }
          payload[0] = (frame_type << 4) | 0x0c;
          payload[1] = 1;
        }
      } else if (FourCC.compare(FourCC_AV1) == 0) {
        codec_id = 13;
        if (packetType == PacketTypeSequenceStart) {
          payload[0] = 0x1d;
          payload[1] = 0;
          payload[2] = 0;
          payload[3] = 0;
          payload[4] = 0;
          // Logger.log("PacketTypeSequenceStart", payload.subarray(0, 16));
        } else if (packetType == PacketTypeMPEG2TSSequenceStart) {
          // Logger.log("PacketTypeMPEG2TSSequenceStart", payload.subarray(0, 16));
        } else if (packetType == PacketTypeCodedFrames) {
          // Logger.log("PacketTypeCodedFrames", payload.subarray(0, 16));
          payload[0] = (frame_type << 4) | 0x0d;
          payload[1] = 1;
          payload[2] = 0;
          payload[3] = 0;
          payload[4] = 0;
        }
      } else {
        Logger.log(`unsupported extension header`);
        return;
      }
    }

    if (this._videoFPS === 0) {
      if (this._videoCount++ === 0) {
        setTimeout(() => {
          this._videoFPS = Math.ceil(this._videoCount / 5);
        }, 5000);
      }
    }

    if (codec_id == 7 || codec_id == 12 || codec_id == 13) {
      //cache avc sequence header
      if (frame_type == 1 && payload[1] == 0) {
        this._avcSequenceHeader = Buffer.alloc(payload.length);
        payload.copy(this._avcSequenceHeader);
        let info = AV.readAVCSpecificConfig(this._avcSequenceHeader);
        this._videoWidth = info.width;
        this._videoHeight = info.height;
        this._videoProfileName = AV.getAVCProfileName(info);
        this._videoLevel = info.level;
        //Logger.log(`[rtmp publish] avc sequence header`,this.avcSequenceHeader);
      }
    }

    if (this._videoCodec == 0) {
      this._videoCodec = codec_id;
      this._videoCodecName = VIDEO_CODEC_NAME[codec_id];
      Logger.log(
        `[rtmp publish] Handle video. id=${this._id} streamPath=${this._publishStreamPath} frame_type=${frame_type} codec_id=${codec_id} codec_name=${this._videoCodecName} ${this._videoWidth}x${this._videoHeight}`
      );
    }

    let packet = new RtmpPacket();
    packet.header.fmt = RTMP_CHUNK_TYPE_0;
    packet.header.cid = RTMP_CHANNEL_VIDEO;
    packet.header.type = RTMP_TYPE_VIDEO;
    packet.payload = payload;
    packet.header.length = packet.payload.length;
    packet.header.timestamp = this._parserPacket.clock;
    let rtmpChunks = this.rtmpChunksCreate(packet);
    let flvTag = NodeFlvSession.createFlvTag(packet);

    //cache gop
    if (this._rtmpGopCacheQueue != null) {
      if (frame_type == 1) {
        this._rtmpGopCacheQueue.clear();
        this._flvGopCacheQueue?.clear();
      }
      if (
        (codec_id == 7 || codec_id == 12 || codec_id == 13) &&
        frame_type == 1 &&
        payload[1] == 0
      ) {
        //skip avc sequence header
      } else {
        this._rtmpGopCacheQueue.add(rtmpChunks);
        this._flvGopCacheQueue?.add(flvTag);
      }
    }

    // Logger.log(rtmpChunks);
    for (let playerId of this._players) {
      let playerSession = sessions.get(playerId);

      if (playerSession.numPlayCache === 0) {
        playerSession.res.cork();
      }

      if (playerSession instanceof RtmpSession) {
        if (
          playerSession._starting &&
          playerSession._playing &&
          !playerSession._paused &&
          playerSession._receiveVideo
        ) {
          rtmpChunks.writeUInt32LE(playerSession._playStreamId, 8);
          playerSession._socket.write(rtmpChunks);
        }
      } else if (playerSession instanceof NodeFlvSession) {
        playerSession.res.write(flvTag, null, (e: Error) => {
          //websocket will throw a error if not set the cb when closed
        });
      }

      playerSession.numPlayCache++;

      if (playerSession.numPlayCache === 10) {
        process.nextTick(() => playerSession.res.uncork());
        playerSession.numPlayCache = 0;
      }
    }
  }

  private rtmpDataHandler(): void {
    let offset =
      this._parserPacket.header.type === RTMP_TYPE_FLEX_STREAM ? 1 : 0;
    let payload = this._parserPacket.payload.slice(
      offset,
      this._parserPacket.header.length
    );
    let dataMessage = AMF.decodeAmf0Data(payload);
    switch (dataMessage.cmd) {
      case "@setDataFrame":
        if (dataMessage.dataObj) {
          this._audioSamplerate = dataMessage.dataObj.audiosamplerate;
          this._audioChannels = dataMessage.dataObj.stereo ? 2 : 1;
          this._videoWidth = dataMessage.dataObj.width;
          this._videoHeight = dataMessage.dataObj.height;
          this._videoFPS = dataMessage.dataObj.framerate;
        }

        let opt = {
          cmd: "onMetaData",
          dataObj: dataMessage.dataObj,
        };
        this._metaData = AMF.encodeAmf0Data(opt);

        let packet = new RtmpPacket();
        packet.header.fmt = RTMP_CHUNK_TYPE_0;
        packet.header.cid = RTMP_CHANNEL_DATA;
        packet.header.type = RTMP_TYPE_DATA;
        packet.payload = this._metaData;
        packet.header.length = packet.payload.length;
        let rtmpChunks = this.rtmpChunksCreate(packet);
        let flvTag = NodeFlvSession.createFlvTag(packet);

        for (let playerId of this._players) {
          let playerSession = sessions.get(playerId);
          if (playerSession instanceof RtmpSession) {
            if (
              playerSession._starting &&
              playerSession._playing &&
              !playerSession._paused
            ) {
              rtmpChunks.writeUInt32LE(playerSession._playStreamId, 8);
              playerSession._socket.write(rtmpChunks);
            }
          } else if (playerSession instanceof NodeFlvSession) {
            playerSession.res.write(flvTag, null, (e: Error) => {
              //websocket will throw a error if not set the cb when closed
            });
          }
        }
        break;
    }
  }

  private rtmpInvokeHandler(): void {
    let offset =
      this._parserPacket.header.type === RTMP_TYPE_FLEX_MESSAGE ? 1 : 0;
    let payload = this._parserPacket.payload.slice(
      offset,
      this._parserPacket.header.length
    );
    let invokeMessage = AMF.decodeAmf0Cmd(payload);
    // Logger.log(invokeMessage);
    switch (invokeMessage.cmd) {
      case "connect":
        this.onConnect(invokeMessage);
        break;
      case "releaseStream":
        break;
      case "FCPublish":
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
      case "pause":
        this.onPause(invokeMessage);
        break;
      case "FCUnpublish":
        break;
      case "deleteStream":
        this.onDeleteStream(invokeMessage);
        break;
      case "closeStream":
        this.onCloseStream();
        break;
      case "receiveAudio":
        this.onReceiveAudio(invokeMessage);
        break;
      case "receiveVideo":
        this.onReceiveVideo(invokeMessage);
        break;
    }
  }

  private sendACK(size: number): void {
    let rtmpBuffer = Buffer.from("02000000000004030000000000000000", "hex");
    rtmpBuffer.writeUInt32BE(size, 12);
    this._socket.write(rtmpBuffer);
  }

  private sendWindowACK(size: number): void {
    let rtmpBuffer = Buffer.from("02000000000004050000000000000000", "hex");
    rtmpBuffer.writeUInt32BE(size, 12);
    this._socket.write(rtmpBuffer);
  }

  private setPeerBandwidth(size: number, type: number): void {
    let rtmpBuffer = Buffer.from("0200000000000506000000000000000000", "hex");
    rtmpBuffer.writeUInt32BE(size, 12);
    rtmpBuffer[16] = type;
    this._socket.write(rtmpBuffer);
  }

  private setChunkSize(size: number): void {
    let rtmpBuffer = Buffer.from("02000000000004010000000000000000", "hex");
    rtmpBuffer.writeUInt32BE(size, 12);
    this._socket.write(rtmpBuffer);
  }

  private sendStreamStatus(st: number, id: number): void {
    let rtmpBuffer = Buffer.from("020000000000060400000000000000000000", "hex");
    rtmpBuffer.writeUInt16BE(st, 12);
    rtmpBuffer.writeUInt32BE(id, 14);
    this._socket.write(rtmpBuffer);
  }

  private sendInvokeMessage(sid: number, opt: any): void {
    let packet = new RtmpPacket();
    packet.header.fmt = RTMP_CHUNK_TYPE_0;
    packet.header.cid = RTMP_CHANNEL_INVOKE;
    packet.header.type = RTMP_TYPE_INVOKE;
    packet.header.stream_id = sid;
    packet.payload = AMF.encodeAmf0Cmd(opt);
    packet.header.length = packet.payload.length;
    let chunks = this.rtmpChunksCreate(packet);
    this._socket.write(chunks);
  }

  private sendDataMessage(opt: any, sid: number): void {
    let packet = new RtmpPacket();
    packet.header.fmt = RTMP_CHUNK_TYPE_0;
    packet.header.cid = RTMP_CHANNEL_DATA;
    packet.header.type = RTMP_TYPE_DATA;
    packet.payload = AMF.encodeAmf0Data(opt);
    packet.header.length = packet.payload.length;
    packet.header.stream_id = sid;
    let chunks = this.rtmpChunksCreate(packet);
    this._socket.write(chunks);
  }

  private sendStatusMessage(
    sid: number,
    level: string,
    code: string,
    description: string = ""
  ): void {
    let opt = {
      cmd: "onStatus",
      transId: 0,
      cmdObj: null,
      info: {
        level: level,
        code: code,
        description: description,
      },
    };
    this.sendInvokeMessage(sid, opt);
  }

  private sendRtmpSampleAccess(sid: number) {
    let opt = {
      cmd: "|RtmpSampleAccess",
      bool1: false,
      bool2: false,
    };
    this.sendDataMessage(opt, sid);
  }

  private sendPingRequest(): void {
    let currentTimestamp = Date.now() - this._startTimestamp;
    let packet = new RtmpPacket();
    packet.header.fmt = RTMP_CHUNK_TYPE_0;
    packet.header.cid = RTMP_CHANNEL_PROTOCOL;
    packet.header.type = RTMP_TYPE_EVENT;
    packet.header.timestamp = currentTimestamp;
    packet.payload = Buffer.from([
      0,
      6,
      (currentTimestamp >> 24) & 0xff,
      (currentTimestamp >> 16) & 0xff,
      (currentTimestamp >> 8) & 0xff,
      currentTimestamp & 0xff,
    ]);
    packet.header.length = packet.payload.length;
    let chunks = this.rtmpChunksCreate(packet);
    this._socket.write(chunks);
  }

  private respondConnect(tid: number) {
    let opt = {
      cmd: "_result",
      transId: tid,
      cmdObj: {
        fmsVer: "FMS/3,0,1,123",
        capabilities: 31,
      },
      info: {
        level: "status",
        code: "NetConnection.Connect.Success",
        description: "Connection succeeded.",
        objectEncoding: this._objectEncoding,
      },
    };
    this.sendInvokeMessage(0, opt);
  }

  private respondCreateStream(tid: number): void {
    this._streams++;
    let opt = {
      cmd: "_result",
      transId: tid,
      cmdObj: null,
      info: this._streams,
    };
    this.sendInvokeMessage(0, opt);
  }

  private respondPlay(): void {
    this.sendStreamStatus(STREAM_BEGIN, this._playStreamId);
    this.sendStatusMessage(
      this._playStreamId,
      "status",
      "NetStream.Play.Reset",
      "Playing and resetting stream."
    );
    this.sendStatusMessage(
      this._playStreamId,
      "status",
      "NetStream.Play.Start",
      "Started playing stream."
    );
    this.sendRtmpSampleAccess(0);
  }

  private onConnect(invokeMessage: any): void {

    console.log("Connected!");

    invokeMessage.cmdObj.app = invokeMessage.cmdObj.app.replace("/", ""); //fix jwplayer
    events.emit("preConnect", this._id, invokeMessage.cmdObj);
    if (!this._starting) {
      return;
    }
    this._connectCmdObj = invokeMessage.cmdObj;
    this._appName = invokeMessage.cmdObj.app;
    this._objectEncoding =
      invokeMessage.cmdObj.objectEncoding != null
        ? invokeMessage.cmdObj.objectEncoding
        : 0;
    this._startTimestamp = Date.now();
    this._pingInterval = setInterval(() => {
      this.sendPingRequest();
    }, this._pingTime);
    this.sendWindowACK(5000000);
    this.setPeerBandwidth(5000000, 2);
    this.setChunkSize(this._outChunkSize);
    this.respondConnect(invokeMessage.transId);
    this._bitrateCache = {
      intervalMs: 1000,
      last_update: this._startTimestamp,
      bytes: 0,
    };
    Logger.log(
      `[rtmp connect] id=${this._id} ip=${this._ip} app=${
        this._appName
      } args=${JSON.stringify(invokeMessage.cmdObj)}`
    );
    events.emit("postConnect", this._id, invokeMessage.cmdObj);
  }

  private onCreateStream(invokeMessage: any): void {
    this.respondCreateStream(invokeMessage.transId);
  }

  private onPublish(invokeMessage: any): void {
    if (typeof invokeMessage.streamName !== "string") {
      return;
    }
    this._publishStreamPath =
      "/" + this._appName + "/" + invokeMessage.streamName.split("?")[0];
    this._publishArgs = QueryString.parse(
      invokeMessage.streamName.split("?")[1]
    );
    this._publishStreamId = this._parserPacket.header.stream_id;
    events.emit(
      "prePublish",
      this._id,
      this._publishStreamPath,
      this._publishArgs
    );
    if (!this._starting) {
      return;
    }

    if (this._config.auth && this._config.auth.publish && !this.isLocal) {
      let results = NodeCoreUtils.verifyAuth(
        this._publishArgs.sign,
        this._publishStreamPath,
        this._config.auth.secret
      );
      if (!results) {
        Logger.log(
          `[rtmp publish] Unauthorized. id=${this._id} streamPath=${this._publishStreamPath} streamId=${this._publishStreamId} sign=${this._publishArgs.sign} `
        );
        this.sendStatusMessage(
          this._publishStreamId,
          "error",
          "NetStream.publish.Unauthorized",
          "Authorization required."
        );
        return;
      }
    }

    if (publishers.has(this._publishStreamPath)) {
      this.reject();
      Logger.log(
        `[rtmp publish] Already has a stream. id=${this._id} streamPath=${this._publishStreamPath} streamId=${this._publishStreamId}`
      );
      this.sendStatusMessage(
        this._publishStreamId,
        "error",
        "NetStream.Publish.BadName",
        "Stream already publishing"
      );
    } else if (this._publishing) {
      Logger.log(
        `[rtmp publish] NetConnection is publishing. id=${this._id} streamPath=${this._publishStreamPath} streamId=${this._publishStreamId}`
      );
      this.sendStatusMessage(
        this._publishStreamId,
        "error",
        "NetStream.Publish.BadConnection",
        "Connection already publishing"
      );
    } else {
      Logger.log(
        `[rtmp publish] New stream. id=${this._id} streamPath=${this._publishStreamPath} streamId=${this._publishStreamId}`
      );

      publishers.set(this._publishStreamPath, this._id);
      this._publishing = true;

      this.sendStatusMessage(
        this._publishStreamId,
        "status",
        "NetStream.Publish.Start",
        `${this._publishStreamPath} is now published.`
      );
      for (let idlePlayerId of idlePlayers) {
        let idlePlayer = sessions.get(idlePlayerId);
        if (
          idlePlayer &&
          idlePlayer.playStreamPath === this._publishStreamPath
        ) {
          idlePlayer.onStartPlay();
          idlePlayers.delete(idlePlayerId);
        }
      }
      events.emit(
        "postPublish",
        this._id,
        this._publishStreamPath,
        this._publishArgs
      );
    }
  }

  private onPlay(invokeMessage: any): void {
    if (typeof invokeMessage.streamName !== "string") {
      return;
    }
    this._playStreamPath =
      "/" + this._appName + "/" + invokeMessage.streamName.split("?")[0];
    this._playArgs = QueryString.parse(invokeMessage.streamName.split("?")[1]);
    this._playStreamId = this._parserPacket.header.stream_id;
    events.emit("prePlay", this._id, this._playStreamPath, this._playArgs);

    if (!this._starting) {
      return;
    }

    if (this._config.auth && this._config.auth.play && !this.isLocal) {
      let results = NodeCoreUtils.verifyAuth(
        this._playArgs.sign,
        this._playStreamPath,
        this._config.auth.secret
      );
      if (!results) {
        Logger.log(
          `[rtmp play] Unauthorized. id=${this._id} streamPath=${this._playStreamPath}  streamId=${this._playStreamId} sign=${this._playArgs.sign}`
        );
        this.sendStatusMessage(
          this._playStreamId,
          "error",
          "NetStream.play.Unauthorized",
          "Authorization required."
        );
        return;
      }
    }

    if (this._playing) {
      Logger.log(
        `[rtmp play] NetConnection is playing. id=${this._id} streamPath=${this._playStreamPath}  streamId=${this._playStreamId} `
      );
      this.sendStatusMessage(
        this._playStreamId,
        "error",
        "NetStream.Play.BadConnection",
        "Connection already playing"
      );
    } else {
      this.respondPlay();
    }

    if (publishers.has(this._playStreamPath)) {
      this.onStartPlay();
    } else {
      Logger.log(
        `[rtmp play] Stream not found. id=${this._id} streamPath=${this._playStreamPath}  streamId=${this._playStreamId}`
      );
      this._idling = true;
      idlePlayers.add(this._id);
    }
  }

  private onStartPlay(): void {
    let publisherId = publishers.get(this._playStreamPath);
    let publisher = sessions.get(publisherId);
    let players = publisher.players;
    players.add(this._id);

    if (publisher.metaData != null) {
      let packet = new RtmpPacket();
      packet.header.fmt = RTMP_CHUNK_TYPE_0;
      packet.header.cid = RTMP_CHANNEL_DATA;
      packet.header.type = RTMP_TYPE_DATA;
      packet.payload = publisher.metaData;
      packet.header.length = packet.payload.length;
      packet.header.stream_id = this._playStreamId;
      let chunks = this.rtmpChunksCreate(packet);
      this._socket.write(chunks);
    }

    if (publisher.audioCodec === 10 || publisher.audioCodec === 13) {
      let packet = new RtmpPacket();
      packet.header.fmt = RTMP_CHUNK_TYPE_0;
      packet.header.cid = RTMP_CHANNEL_AUDIO;
      packet.header.type = RTMP_TYPE_AUDIO;
      packet.payload = publisher.aacSequenceHeader;
      packet.header.length = packet.payload.length;
      packet.header.stream_id = this._playStreamId;
      let chunks = this.rtmpChunksCreate(packet);
      this._socket.write(chunks);
    }

    if (
      publisher.videoCodec === 7 ||
      publisher.videoCodec === 12 ||
      publisher.videoCodec === 13
    ) {
      let packet = new RtmpPacket();
      packet.header.fmt = RTMP_CHUNK_TYPE_0;
      packet.header.cid = RTMP_CHANNEL_VIDEO;
      packet.header.type = RTMP_TYPE_VIDEO;
      packet.payload = publisher.avcSequenceHeader;
      packet.header.length = packet.payload.length;
      packet.header.stream_id = this._playStreamId;
      let chunks = this.rtmpChunksCreate(packet);
      this._socket.write(chunks);
    }

    if (publisher.rtmpGopCacheQueue != null) {
      for (let chunks of publisher.rtmpGopCacheQueue) {
        chunks.writeUInt32LE(this._playStreamId, 8);
        this._socket.write(chunks);
      }
    }

    this._idling = false;
    this._playing = true;
    events.emit("postPlay", this._id, this._playStreamPath, this._playArgs);
    Logger.log(
      `[rtmp play] Join stream. id=${this._id} streamPath=${this._playStreamPath}  streamId=${this._playStreamId} `
    );
  }

  private onPause(invokeMessage: any): void {
    this._paused = invokeMessage.pause;
    let c = this._paused
      ? "NetStream.Pause.Notify"
      : "NetStream.Unpause.Notify";
    let d = this._paused ? "Paused live" : "Unpaused live";
    Logger.log(
      `[rtmp play] ${d} stream. id=${this._id} streamPath=${this._playStreamPath}  streamId=${this._playStreamId} `
    );
    if (!this._paused) {
      this.sendStreamStatus(STREAM_BEGIN, this._playStreamId);
      if (publishers.has(this._playStreamPath)) {
        //fix ckplayer
        let publisherId = publishers.get(this._playStreamPath);
        let publisher = sessions.get(publisherId);
        if (publisher.audioCodec === 10 || publisher.audioCodec === 13) {
          let packet = new RtmpPacket();
          packet.header.fmt = RTMP_CHUNK_TYPE_0;
          packet.header.cid = RTMP_CHANNEL_AUDIO;
          packet.header.type = RTMP_TYPE_AUDIO;
          packet.payload = publisher.aacSequenceHeader;
          packet.header.length = packet.payload.length;
          packet.header.stream_id = this._playStreamId;
          packet.header.timestamp = publisher.parserPacket.clock; // ?? 0 or clock
          let chunks = this.rtmpChunksCreate(packet);
          this._socket.write(chunks);
        }
        if (
          publisher.videoCodec === 7 ||
          publisher.videoCodec === 12 ||
          publisher.videoCodec === 13
        ) {
          let packet = new RtmpPacket();
          packet.header.fmt = RTMP_CHUNK_TYPE_0;
          packet.header.cid = RTMP_CHANNEL_VIDEO;
          packet.header.type = RTMP_TYPE_VIDEO;
          packet.payload = publisher.avcSequenceHeader;
          packet.header.length = packet.payload.length;
          packet.header.stream_id = this._playStreamId;
          packet.header.timestamp = publisher.parserPacket.clock; // ?? 0 or clock
          let chunks = this.rtmpChunksCreate(packet);
          this._socket.write(chunks);
        }
      }
    } else {
      this.sendStreamStatus(STREAM_EOF, this._playStreamId);
    }
    this.sendStatusMessage(this._playStreamId, c, d);
  }

  private onReceiveAudio(invokeMessage: any): void {
    this._receiveAudio = invokeMessage.bool;
    Logger.log(
      `[rtmp play] receiveAudio=${this._receiveAudio} id=${this._id} `
    );
  }

  private onReceiveVideo(invokeMessage: any): void {
    this._receiveVideo = invokeMessage.bool;
    Logger.log(
      `[rtmp play] receiveVideo=${this._receiveVideo} id=${this._id} `
    );
  }

  private onCloseStream(): void {
    //red5-publisher
    let closeStream = { streamId: this._parserPacket.header.stream_id };
    this.onDeleteStream(closeStream);
  }

  private onDeleteStream(invokeMessage: any): void {
    if (invokeMessage.streamId == this._playStreamId) {
      if (this._idling) {
        idlePlayers.delete(this._id);
        this._idling = false;
      } else {
        let publisherId = publishers.get(this._playStreamPath);
        if (publisherId != null) {
          sessions.get(publisherId).players.delete(this._id);
        }
        events.emit("donePlay", this._id, this._playStreamPath, this._playArgs);
        this._playing = false;
      }
      Logger.log(
        `[rtmp play] Close stream. id=${this._id} streamPath=${this._playStreamPath} streamId=${this._playStreamId}`
      );
      if (this._starting) {
        this.sendStatusMessage(
          this._playStreamId,
          "status",
          "NetStream.Play.Stop",
          "Stopped playing stream."
        );
      }
      this._playStreamId = 0;
      this._playStreamPath = "";
    }

    if (invokeMessage.streamId == this._publishStreamId) {
      if (this._publishing) {
        Logger.log(
          `[rtmp publish] Close stream. id=${this._id} streamPath=${this._publishStreamPath} streamId=${this._publishStreamId}`
        );
        events.emit(
          "donePublish",
          this._id,
          this._publishStreamPath,
          this._publishArgs
        );
        if (this._starting) {
          this.sendStatusMessage(
            this._publishStreamId,
            "status",
            "NetStream.Unpublish.Success",
            `${this._publishStreamPath} is now unpublished.`
          );
        }

        for (let playerId of this._players) {
          let playerSession = sessions.get(playerId);
          if (playerSession instanceof RtmpSession) {
            playerSession.sendStatusMessage(
              playerSession._playStreamId,
              "status",
              "NetStream.Play.UnpublishNotify",
              "stream is now unpublished."
            );
            playerSession.flush();
          } else {
            playerSession.stop();
          }
        }

        //let the players to idlePlayers
        for (let playerId of this._players) {
          let playerSession = sessions.get(playerId);
          idlePlayers.add(playerId);
          playerSession.isPlaying = false;
          playerSession.isIdling = true;
          if (playerSession instanceof RtmpSession) {
            playerSession.sendStreamStatus(
              STREAM_EOF,
              playerSession._playStreamId
            );
          }
        }

        publishers.delete(this._publishStreamPath);
        if (this._rtmpGopCacheQueue) {
          this._rtmpGopCacheQueue.clear();
        }
        if (this._flvGopCacheQueue) {
          this._flvGopCacheQueue.clear();
        }
        this._players.clear();
        this._publishing = false;
      }
      this._publishStreamId = 0;
      this._publishStreamPath = "";
    }
  }
}