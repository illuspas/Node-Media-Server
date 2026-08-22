// @ts-check
//
//  Created by Chen Mingliang on 26/08/22.
//  illuspas@msn.com
//  Copyright (c) 2026 NodeMedia. All rights reserved.
//

const logger = require("../core/logger.js");
const Context = require("../core/context.js");
const BaseSession = require("./base_session.js");
const BroadcastServer = require("../server/broadcast_server.js");
const RtmpClient = require("../protocol/rtmp_client.js");

const DEFAULT_RECONNECT_INTERVAL = 2000;
const MAX_RECONNECT_INTERVAL = 30000;

/**
 * RTMP client relay session.
 * @class
 * @augments BaseSession
 */
class RtmpClientSession extends BaseSession {
  /**
   * @param {object} config
   * @param {string} config.url - Remote RTMP URL
   * @param {"pull"|"push"} [config.mode]
   * @param {string} config.streamPath - Local output (pull) or source (push)
   * @param {boolean} [config.reconnect]
   * @param {number} [config.reconnectInterval]
   * @param {number} [config.maxReconnectAttempts]
   */
  constructor(config) {
    super();
    this.protocol = "rtmp";
    this.url = config.url;
    this.mode = config.mode || "pull";
    this.streamPath = config.streamPath;
    this.reconnectEnabled = config.reconnect !== false;
    this.reconnectInterval = config.reconnectInterval || DEFAULT_RECONNECT_INTERVAL;
    this.maxReconnectAttempts = config.maxReconnectAttempts || 0;
    this.reconnectAttempts = 0;
    this.currentReconnectInterval = this.reconnectInterval;

    /** @type {RtmpClient} */
    this.rtmpClient = this.createClient();
    /** @type {BroadcastServer|null} */
    this.broadcast = null;
    this.isRunning = false;
    this.isClosing = false;
    this.isRegistered = false;
    this.reconnectTimer = null;
    this.timeoutTimer = null;
    this.reconnectScheduled = false;
  }

  /**
   * Create a client and bind session callbacks.
   * @returns {RtmpClient}
   */
  createClient = () => {
    const client = new RtmpClient();
    client.onPacketCallback = this.onPacket;
    client.onCloseCallback = this.onConnectionClose;
    client.onErrorCallback = this.onConnectionError;
    client.onStatusCallback = this.onStatus;
    return client;
  };

  /**
   * Start the relay session.
   * @returns {Promise<void>}
   */
  run = async () => {
    if (this.isRunning) {
      return;
    }
    this.isRunning = true;
    this.createTime = Date.now();
    Context.sessions.set(this.id, this);
    try {
      await this.connectAndStart();
    } catch (error) {
      logger.error(`RTMP session ${this.id} start failed: ${error.message}`);
      this.handleReconnect();
    }
  };

  /**
   * Connect, negotiate and register the session.
   * @returns {Promise<void>}
   */
  connectAndStart = async () => {
    await this.rtmpClient.connect(this.url);
    await this.rtmpClient.sendConnect();
    await this.rtmpClient.sendCreateStream();
    if (this.mode === "pull") {
      await this.rtmpClient.sendPlay(this.rtmpClient.urlInfo.streamName);
      this.registerPull();
    } else {
      await this.rtmpClient.sendPublish(this.rtmpClient.urlInfo.streamName);
      this.registerPush();
    }
    this.rtmpClient.startHeartbeat();
    this.startTimeoutCheck();
    this.reconnectAttempts = 0;
    this.currentReconnectInterval = this.reconnectInterval;
  };

  /**
   * Register a pull session as the local stream publisher.
   */
  registerPull = () => {
    this.broadcast = Context.broadcasts.get(this.streamPath) ?? new BroadcastServer();
    Context.broadcasts.set(this.streamPath, this.broadcast);
    const error = this.broadcast.postPublish(this);
    if (error !== null) {
      throw new Error(error);
    }
    this.isPublisher = true;
    this.isRegistered = true;
  };

  /**
   * Register a push session as a subscriber of the local stream.
   */
  registerPush = () => {
    this.broadcast = Context.broadcasts.get(this.streamPath) ?? null;
    if (!this.broadcast) {
      throw new Error(`Local stream not found: ${this.streamPath}`);
    }
    const error = this.broadcast.postPlay(this);
    if (error !== null) {
      throw new Error(error);
    }
    this.isPublisher = false;
    this.isRegistered = true;
  };

  /**
   * Handle packets received from the remote RTMP server.
   * @param {import("../core/avpacket.js")} packet
   */
  onPacket = (packet) => {
    this.inBytes += packet.size;
    if (this.mode === "pull" && this.broadcast) {
      this.broadcast.broadcastMessage(packet);
    }
  };

  /**
   * Handle remote status notifications.
   * @param {string} code
   * @param {object} info
   */
  onStatus = (code, info) => {
    logger.debug(`RTMP session ${this.id} status ${code}: ${info.description || ""}`);
  };

  /**
   * Send a cached/local RTMP message to the remote server.
   * @param {Buffer} buffer
   */
  sendBuffer = (buffer) => {
    if (this.mode !== "push" || !this.rtmpClient.connected) {
      return;
    }
    this.outBytes += buffer.length;
    this.rtmpClient.onOutputCallback(buffer);
  };

  /**
   * Start periodic remote activity checks.
   */
  startTimeoutCheck = () => {
    this.stopTimeoutCheck();
    this.timeoutTimer = setInterval(() => {
      if (this.rtmpClient.isTimedOut()) {
        logger.warn(`RTMP session ${this.id} timed out`);
        this.rtmpClient.disconnect();
      }
    }, 10000);
  };

  /**
   * Stop periodic remote activity checks.
   */
  stopTimeoutCheck = () => {
    if (this.timeoutTimer !== null) {
      clearInterval(this.timeoutTimer);
      this.timeoutTimer = null;
    }
  };

  /**
   * Handle a remote connection close.
   * @param {boolean} hadError
   */
  onConnectionClose = (hadError) => {
    logger.info(`RTMP session ${this.id} connection closed (hadError=${hadError})`);
    this.stopTimeoutCheck();
    this.unregisterBroadcast();
    this.handleReconnect();
  };

  /**
   * Handle a remote connection error.
   * @param {Error} error
   */
  onConnectionError = (error) => {
    logger.error(`RTMP session ${this.id} connection error: ${error.message}`);
  };

  /**
   * Schedule reconnect with exponential backoff.
   */
  handleReconnect = () => {
    if (this.isClosing || this.reconnectScheduled) {
      return;
    }
    const sourceBroadcast = Context.broadcasts.get(this.streamPath);
    if (this.mode === "push" && (!sourceBroadcast || sourceBroadcast.publisher === null)) {
      this.cleanup();
      return;
    }
    if (!this.reconnectEnabled ||
        (this.maxReconnectAttempts > 0 && this.reconnectAttempts >= this.maxReconnectAttempts)) {
      this.cleanup();
      return;
    }

    this.reconnectAttempts++;
    this.reconnectScheduled = true;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectScheduled = false;
      this.reconnectTimer = null;
      if (this.isClosing) {
        return;
      }
      this.rtmpClient = this.createClient();
      this.connectAndStart().catch((error) => {
        logger.error(`RTMP session ${this.id} reconnect failed: ${error.message}`);
        this.currentReconnectInterval = Math.min(
          this.currentReconnectInterval * 2,
          MAX_RECONNECT_INTERVAL
        );
        this.handleReconnect();
      });
    }, this.currentReconnectInterval);
  };

  /**
   * Unregister the session from its broadcast.
   */
  unregisterBroadcast = () => {
    if (!this.isRegistered || !this.broadcast) {
      return;
    }
    if (this.mode === "pull") {
      this.broadcast.donePublish(this);
    } else {
      this.broadcast.donePlay(this);
    }
    this.isRegistered = false;
  };

  /**
   * Close the session and release all resources.
   */
  close = () => {
    if (this.isClosing) {
      return;
    }
    this.isClosing = true;
    this.isRunning = false;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopTimeoutCheck();
    this.unregisterBroadcast();
    this.rtmpClient.disconnect();
    this.cleanup();
  };

  /**
   * Remove this session from the global context.
   */
  cleanup = () => {
    this.isRunning = false;
    Context.sessions.delete(this.id);
    this.endTime = Date.now();
  };

  /**
   * Return relay status.
   * @returns {object}
   */
  getStatus = () => {
    return {
      id: this.id,
      protocol: this.protocol,
      mode: this.mode,
      url: this.url,
      streamPath: this.streamPath,
      isRunning: this.isRunning,
      isClosing: this.isClosing,
      reconnectAttempts: this.reconnectAttempts,
      inBytes: this.inBytes,
      outBytes: this.outBytes,
      createTime: this.createTime,
      endTime: this.endTime
    };
  };
}

module.exports = RtmpClientSession;
