// @ts-check
//
//  Created by Chen Mingliang on 26/08/22.
//  illuspas@msn.com
//  Copyright (c) 2026 NodeMedia. All rights reserved.
//

const net = require("node:net");
const crypto = require("node:crypto");
const Rtmp = require("./rtmp.js");
const AMF = require("./amf.js");
const logger = require("../core/logger.js");

const RTMP_VERSION = 3;
const RTMP_HANDSHAKE_SIZE = 1536;
const RTMP_DEFAULT_PORT = 1935;

const RTMP_HANDSHAKE_C0C1 = 0;
const RTMP_HANDSHAKE_S0S1 = 1;
const RTMP_HANDSHAKE_S2 = 2;
const RTMP_HANDSHAKE_DONE = 3;

/**
 * @typedef {object} RtmpUrl
 * @property {string} host - Remote host name
 * @property {number} port - Remote TCP port
 * @property {string} app - RTMP application name
 * @property {string} streamName - Stream name
 * @property {{[key: string]: string | string[]}} query - URL query parameters
 */

/**
 * RTMP client protocol implementation.
 * Handles active TCP connections and the simple RTMP handshake.
 * @class
 * @augments Rtmp
 */
class RtmpClient extends Rtmp {
  constructor() {
    super();

    /** @type {net.Socket|null} */
    this.socket = null;
    this.connected = false;
    this.baseUri = "";

    /** @type {RtmpUrl|null} */
    this.urlInfo = null;

    /** @type {Buffer} */
    this.handshakeBuffer = Buffer.alloc(0);
    this.clientHandshake = Buffer.alloc(0);
    this.handshakeState = RTMP_HANDSHAKE_C0C1;

    /** @type {((error: Error) => void)|null} */
    this.handshakeReject = null;

    /** @type {() => void} */
    this.onHandshakeCallback = () => {};

    /** @type {(hadError: boolean) => void} */
    this.onCloseCallback = () => {};

    /** @type {(error: Error) => void} */
    this.onErrorCallback = () => {};

    /** @type {(code: string, info: object) => void} */
    this.onStatusCallback = () => {};

    /** @type {Map<number, {cmd: string, resolve: (value: any) => void, reject: (error: Error) => void}>} */
    this.pendingCommands = new Map();
    this.nextTransId = 1;
    this.streamId = 0;
    this.lastActivityTime = 0;
    this.receivedBytes = 0;
    this.lastAckBytes = 0;
    this.ackSize = 0;
    this.pingSequence = 0;
    /** @type {ReturnType<typeof setInterval>|null} */
    this.heartbeatTimer = null;

    this.onOutputCallback = (buffer) => {
      this.write(buffer);
    };
  }

  /**
   * Parse an RTMP URL.
   * @param {string} rtmpUrl
   * @returns {RtmpUrl}
   */
  static parseUrl = (rtmpUrl) => {
    const url = new URL(rtmpUrl);
    if (url.protocol !== "rtmp:") {
      throw new Error(`Unsupported RTMP URL scheme: ${url.protocol}`);
    }

    const pathParts = url.pathname.split("/").filter(Boolean);
    if (pathParts.length < 2) {
      throw new Error("RTMP URL must include app and stream name");
    }

    const query = Object.fromEntries(url.searchParams.entries());
    if (url.username) {
      query.user = decodeURIComponent(url.username);
    }
    if (url.password) {
      query.pass = decodeURIComponent(url.password);
    }

    return {
      host: url.hostname,
      port: parseInt(url.port, 10) || RTMP_DEFAULT_PORT,
      app: decodeURIComponent(pathParts[0]),
      streamName: decodeURIComponent(pathParts.slice(1).join("/")),
      query
    };
  };

  /**
   * Connect to an RTMP server and complete the simple handshake.
   * @param {string} rtmpUrl
   * @returns {Promise<void>}
   */
  connect = (rtmpUrl) => {
    return new Promise((resolve, reject) => {
      if (this.socket || this.connected) {
        reject(new Error("RTMP client is already connected"));
        return;
      }

      try {
        this.urlInfo = RtmpClient.parseUrl(rtmpUrl);
      } catch (error) {
        reject(error);
        return;
      }

      this.baseUri = rtmpUrl;
      this.resetProtocolState();
      this.handshakeReject = reject;

      const socket = net.createConnection({
        host: this.urlInfo.host,
        port: this.urlInfo.port
      });
      this.socket = socket;

      socket.on("connect", () => {
        this.connected = true;
        this.sendClientHandshake();
      });
      socket.on("data", this.handleData);
      socket.on("close", (hadError) => {
        this.connected = false;
        this.socket = null;
        this.stopHeartbeat();
        this.rejectAllPending(new Error("RTMP connection closed"));
        this.rejectHandshake(new Error("RTMP connection closed during handshake"));
        this.onCloseCallback(hadError);
      });
      socket.on("error", (error) => {
        this.connected = false;
        this.onErrorCallback(error);
        this.rejectHandshake(error);
      });

      this.onHandshakeCallback = resolve;
    });
  };

  /**
   * Reset parser and handshake state before a new connection.
   */
  resetProtocolState = () => {
    this.handshakeBuffer = Buffer.alloc(0);
    this.clientHandshake = Buffer.alloc(0);
    this.handshakeState = RTMP_HANDSHAKE_C0C1;
    this.handshakeReject = null;
    this.parserState = 0;
    this.parserBytes = 0;
    this.parserBasicBytes = 0;
    this.inPackets.clear();
    this.inChunkSize = 128;
    this.outChunkSize = 0xffff;
    this.nextTransId = 1;
    this.streamId = 0;
    this.receivedBytes = 0;
    this.lastAckBytes = 0;
    this.ackSize = 0;
    this.lastActivityTime = Date.now();
    this.pendingCommands.clear();
  };

  /**
   * Send C0 and C1.
   */
  sendClientHandshake = () => {
    const c1 = Buffer.alloc(RTMP_HANDSHAKE_SIZE);
    c1.writeUInt32BE(Math.floor(Date.now() / 1000), 0);
    crypto.randomBytes(RTMP_HANDSHAKE_SIZE - 8).copy(c1, 8);
    this.clientHandshake = c1;
    this.write(Buffer.concat([Buffer.from([RTMP_VERSION]), c1]));
    this.handshakeState = RTMP_HANDSHAKE_S0S1;
  };

  /**
   * Handle data while consuming the handshake, then pass remaining bytes to
   * the inherited chunk parser.
   * @param {Buffer} data
   */
  handleData = (data) => {
    this.lastActivityTime = Date.now();
    this.receivedBytes += data.length;
    if (this.handshakeState === RTMP_HANDSHAKE_DONE) {
      const error = this.chunkRead(data, 0, data.length);
      if (error !== null) {
        this.onErrorCallback(new Error(error));
      }
      return;
    }

    this.handshakeBuffer = Buffer.concat([this.handshakeBuffer, data]);
    let offset = 0;

    if (this.handshakeState === RTMP_HANDSHAKE_S0S1 &&
        this.handshakeBuffer.length >= RTMP_HANDSHAKE_SIZE + 1) {
      if (this.handshakeBuffer[0] !== RTMP_VERSION) {
        this.failHandshake(new Error(`Unsupported RTMP version: ${this.handshakeBuffer[0]}`));
        return;
      }

      const s1 = this.handshakeBuffer.subarray(1, RTMP_HANDSHAKE_SIZE + 1);
      this.write(Buffer.from(s1));
      this.handshakeState = RTMP_HANDSHAKE_S2;
      offset = RTMP_HANDSHAKE_SIZE + 1;
    }

    if (this.handshakeState === RTMP_HANDSHAKE_S2 &&
        this.handshakeBuffer.length - offset >= RTMP_HANDSHAKE_SIZE) {
      this.handshakeState = RTMP_HANDSHAKE_DONE;
      offset += RTMP_HANDSHAKE_SIZE;
      this.handshakeBuffer = this.handshakeBuffer.subarray(offset);
      this.handshakeReject = null;
      this.onHandshakeCallback();
      this.onHandshakeCallback = () => {};
      if (this.handshakeBuffer.length > 0) {
        const error = this.chunkRead(this.handshakeBuffer, 0, this.handshakeBuffer.length);
        if (error !== null) {
          this.onErrorCallback(new Error(error));
        }
      }
      this.handshakeBuffer = Buffer.alloc(0);
      return;
    }

    if (offset > 0) {
      this.handshakeBuffer = this.handshakeBuffer.subarray(offset);
    }
  };

  /**
   * Send a command and track its response by transaction id.
   * @param {string} cmd
   * @param {object} options
   * @param {number} [sid]
   * @returns {Promise<any>}
   */
  sendCommand = (cmd, options, sid = 0) => {
    return new Promise((resolve, reject) => {
      const transId = this.nextTransId++;
      this.pendingCommands.set(transId, { cmd, resolve, reject });
      this.sendInvokeMessage(sid, {
        cmd,
        transId,
        ...options
      });
    });
  };

  /**
   * Send NetConnection.connect.
   * @returns {Promise<any>}
   */
  sendConnect = () => {
    if (!this.urlInfo) {
      return Promise.reject(new Error("RTMP URL is not initialized"));
    }
    this.setChunkSize(this.outChunkSize);
    return this.sendCommand("connect", {
      cmdObj: {
        app: this.urlInfo.app,
        tcUrl: this.baseUri,
        flashVer: "FMLE/3.0",
        capabilities: 15,
        audioCodecs: 4071,
        videoCodecs: 252,
        objectEncoding: 0
      },
      args: []
    });
  };

  /**
   * Send createStream and return the allocated stream id.
   * @returns {Promise<number>}
   */
  sendCreateStream = async () => {
    const response = await this.sendCommand("createStream", { cmdObj: null });
    if (typeof response?.info !== "number") {
      throw new Error("RTMP createStream response did not contain a stream id");
    }
    this.streamId = response.info;
    return this.streamId;
  };

  /**
   * Send play for the configured stream.
   * @param {string} streamName
   * @returns {Promise<any>}
   */
  sendPlay = (streamName) => {
    return this.sendCommand("play", {
      cmdObj: null,
      streamName,
      start: -2,
      duration: -1,
      reset: true
    }, this.streamId);
  };

  /**
   * Send publish for the configured stream.
   * @param {string} streamName
   * @param {string} [type]
   * @returns {Promise<any>}
   */
  sendPublish = (streamName, type = "live") => {
    return this.sendCommand("publish", {
      cmdObj: null,
      streamName,
      type
    }, this.streamId);
  };

  /**
   * Send metadata using the standard RTMP data frame.
   * @param {object} metaData
   * @returns {void}
   */
  sendMetaData = (metaData) => {
    this.sendDataMessage({
      cmd: "@setDataFrame",
      method: "onMetaData",
      dataObj: metaData
    }, this.streamId);
  };

  /**
   * Send an AV packet to the remote server.
   * @param {import("../core/avpacket.js")} avpacket
   * @returns {void}
   */
  sendPacket = (avpacket) => {
    this.onOutputCallback(Rtmp.createMessage(avpacket));
  };

  /**
   * Handle incoming server commands and resolve pending requests.
   * @returns {void}
   */
  invokeHandler = () => {
    const offset = this.parserPacket.header.type === 17 ? 1 : 0;
    const payload = this.parserPacket.payload.subarray(offset, this.parserPacket.header.length);
    const message = AMF.decodeAmf0Cmd(payload);
    const transId = typeof message.transId === "number" ? message.transId : 0;

    if (message.cmd === "_result" || message.cmd === "_error") {
      const pending = this.pendingCommands.get(transId);
      if (!pending) {
        logger.warn(`RTMP client received ${message.cmd} for unknown transaction ${transId}`);
        return;
      }
      this.pendingCommands.delete(transId);
      if (message.cmd === "_error") {
        pending.reject(new Error(message.info?.description || "RTMP command failed"));
      } else {
        pending.resolve(message);
      }
      return;
    }

    if (message.cmd === "onStatus") {
      const code = message.info?.code || "";
      this.onStatusCallback(code, message.info || {});
      const pending = [...this.pendingCommands.entries()].find(([, value]) => (
        (value.cmd === "play" && code === "NetStream.Play.Start") ||
        (value.cmd === "publish" && code === "NetStream.Publish.Start") ||
        ((value.cmd === "play" || value.cmd === "publish") && /Failed|BadName|Rejected|Error/.test(code))
      ));
      if (!pending) {
        return;
      }
      this.pendingCommands.delete(pending[0]);
      if (/Failed|BadName|Rejected|Error/.test(code)) {
        pending[1].reject(new Error(message.info?.description || code));
      } else {
        pending[1].resolve(message);
      }
      return;
    }

    if (message.cmd === "close" || message.cmd === "deleteStream") {
      this.onCloseCallback(false);
    }
  };

  /**
   * Handle RTMP control messages and acknowledge the receive window.
   * @returns {void}
   */
  controlHandler = () => {
    const payload = this.parserPacket.payload;
    switch (this.parserPacket.header.type) {
    case 1:
      this.inChunkSize = payload.readUInt32BE();
      break;
    case 5:
      this.ackSize = payload.readUInt32BE();
      break;
    default:
      break;
    }
    if (this.ackSize > 0 && this.receivedBytes - this.lastAckBytes >= this.ackSize) {
      this.sendACK(this.receivedBytes);
      this.lastAckBytes = this.receivedBytes;
    }
  };

  /**
   * Handle user control messages: answer server pings with a pong.
   * Event types follow both the nginx-rtmp convention (6=ping, 7=pong)
   * and the FMS convention (7=ping request, 8=pong).
   * @returns {void}
   */
  eventHandler = () => {
    const payload = this.parserPacket.payload;
    if (payload.length < 6) {
      return;
    }
    const eventType = payload.readUInt16BE(0);
    if (eventType === 6 || eventType === 7) {
      const pong = Buffer.alloc(18);
      pong[0] = 0x02;
      pong.writeUIntBE(0, 1, 3);
      pong.writeUIntBE(6, 4, 3);
      pong[7] = 0x04;
      pong.writeUInt16BE(eventType === 6 ? 7 : 8, 12);
      payload.copy(pong, 14, 2, 6);
      this.onOutputCallback(pong);
    }
  };

  /**
   * Start the RTMP ping heartbeat.
   * @param {number} [interval]
   * @returns {void}
   */
  startHeartbeat = (interval = 30000) => {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (!this.connected || this.handshakeState !== RTMP_HANDSHAKE_DONE) {
        return;
      }
      const packet = Buffer.alloc(18);
      packet[0] = 0x02;
      packet.writeUIntBE(0, 1, 3);
      packet.writeUIntBE(6, 4, 3);
      packet[7] = 0x04;
      packet.writeUInt16BE(6, 12);
      packet.writeUInt32BE(this.pingSequence++, 14);
      this.onOutputCallback(packet);
    }, interval);
  };

  /**
   * Stop the RTMP ping heartbeat.
   */
  stopHeartbeat = () => {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  };

  /**
   * Return whether no data has been received within the timeout window.
   * @param {number} [timeoutMs]
   * @returns {boolean}
   */
  isTimedOut = (timeoutMs = 60000) => {
    return this.connected && Date.now() - this.lastActivityTime > timeoutMs;
  };

  /**
   * Reject and clear every pending command.
   * @param {Error} error
   */
  rejectAllPending = (error) => {
    for (const pending of this.pendingCommands.values()) {
      pending.reject(error);
    }
    this.pendingCommands.clear();
  };

  /**
   * Write data to the connected socket.
   * @param {Buffer} buffer
   */
  write = (buffer) => {
    if (!this.socket || this.socket.destroyed) {
      throw new Error("RTMP client socket is not writable");
    }
    this.socket.write(buffer);
  };

  /**
   * Reject the connection Promise once.
   * @param {Error} error
   */
  rejectHandshake = (error) => {
    if (this.handshakeReject !== null) {
      const reject = this.handshakeReject;
      this.handshakeReject = null;
      reject(error);
    }
  };

  /**
   * Fail the handshake and close the socket.
   * @param {Error} error
   */
  failHandshake = (error) => {
    this.rejectHandshake(error);
    this.onErrorCallback(error);
    this.socket?.destroy();
  };

  /**
   * Disconnect and clear all protocol state.
   */
  disconnect = () => {
    this.stopHeartbeat();
    this.rejectAllPending(new Error("Disconnecting"));
    this.rejectHandshake(new Error("Disconnecting"));
    this.connected = false;
    this.onHandshakeCallback = () => {};
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    this.resetProtocolState();
  };
}

module.exports = RtmpClient;
