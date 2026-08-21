// @ts-check
//
//  Created by Chen Mingliang on 25/04/24.
//  illuspas@msn.com
//  Copyright (c) 2025 NodeMedia. All rights reserved.
//

const logger = require("../core/logger.js");
const Context = require("../core/context.js");
const AVPacket = require("../core/avpacket.js");
const BaseSession = require("./base_session.js");
const BroadcastServer = require("../server/broadcast_server.js");
const RtspClient = require("../protocol/rtsp.js");
const SdpParser = require("../protocol/sdp.js");
const RtpParser = require("../protocol/rtp.js");
const RtcpParser = require("../protocol/rtcp.js");
const RtpDepayloader = require("../protocol/rtp_depayloader.js");

/** Default reconnect interval (ms) */
const DEFAULT_RECONNECT_INTERVAL = 2000;

/** Max reconnect interval (ms) */
const MAX_RECONNECT_INTERVAL = 30000;

/**
 * RTSP Client Session — pulls remote RTSP stream and publishes to BroadcastServer.
 * @class
 * @augments BaseSession
 */
class RtspSession extends BaseSession {
  /**
   * @param {object} config
   * @param {string} config.rtspUrl - Full RTSP URL
   * @param {string} config.streamPath - Stream path (e.g. "/live/camera1")
   * @param {"tcp"|"udp"} [config.transport] - Transport mode (default "tcp")
   * @param {boolean} [config.reconnect] - Enable auto-reconnect (default true)
   * @param {number} [config.reconnectInterval] - Initial reconnect interval ms
   * @param {number} [config.maxReconnectAttempts] - Max reconnect attempts (0 = unlimited)
   */
  constructor(config) {
    super();
    this.protocol = "rtsp";
    this.isPublisher = true;

    // Stream info
    this.rtspUrl = config.rtspUrl;
    this.streamPath = config.streamPath;
    this.streamApp = config.streamPath.split("/")[1] || "live";
    this.streamName = config.streamPath.split("/")[2] || "stream";
    this.transport = config.transport || "tcp";

    // Reconnect config
    this.reconnectEnabled = config.reconnect !== false;
    this.reconnectInterval = config.reconnectInterval || DEFAULT_RECONNECT_INTERVAL;
    this.maxReconnectAttempts = config.maxReconnectAttempts || 0; // 0 = unlimited
    this.reconnectAttempts = 0;
    this.currentReconnectInterval = this.reconnectInterval;

    // RTSP client
    this.rtspClient = new RtspClient();

    // SDP & depayloader
    this.sdp = null;
    this.depayloader = new RtpDepayloader();

    // Broadcast
    this.broadcast = null;

    // State
    this.isRunning = false;
    this.isClosing = false;

    // UDP sockets (if UDP mode)
    this.rtpSocket = null;
    this.rtcpSocket = null;

    // Setup callbacks
    this.rtspClient.onRtpDataCallback = this.onRtpData;
    this.rtspClient.onCloseCallback = this.onConnectionClose;
    this.rtspClient.onErrorCallback = this.onConnectionError;

    // Stats
    this.inBytes = 0;
    this.outBytes = 0;
  }

  // ─────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────

  /**
   * Start the RTSP pull stream session.
   * @returns {Promise<void>}
   */
  run = async () => {
    if (this.isRunning) {
      logger.warn(`RTSP session already running: ${this.streamPath}`);
      return;
    }

    this.isRunning = true;
    this.createTime = Date.now();

    logger.info(`RTSP session ${this.id} starting pull from ${this.rtspUrl} → ${this.streamPath}`);

    try {
      await this.connectAndPlay();
    } catch (error) {
      logger.error(`RTSP session ${this.id} run error: ${error.message}`);
      this.handleReconnect();
    }
  };

  /**
   * Connect to RTSP server and start streaming.
   * @returns {Promise<void>}
   */
  connectAndPlay = async () => {
    // 1. Connect
    await this.rtspClient.connect(this.rtspUrl);

    // 2. DESCRIBE — get SDP
    const describeRes = await this.rtspClient.describe();
    if (describeRes.statusCode !== 200) {
      throw new Error(`DESCRIBE failed: ${describeRes.statusCode} ${describeRes.reasonPhrase}`);
    }

    // 3. Parse SDP
    this.sdp = SdpParser.parse(describeRes.body);
    if (!this.sdp || this.sdp.media.length === 0) {
      throw new Error("SDP parse failed or no media tracks");
    }

    logger.debug(`RTSP session ${this.id} SDP: ${this.sdp.media.length} track(s)`);

    // 4. SETUP each track
    for (const media of this.sdp.media) {
      await this.setupTrack(media);
    }

    // 5. PLAY
    const playRes = await this.rtspClient.play();
    if (playRes.statusCode !== 200) {
      throw new Error(`PLAY failed: ${playRes.statusCode} ${playRes.reasonPhrase}`);
    }

    // 6. Register to broadcast system
    this.registerBroadcast();

    // 7. Start heartbeat
    this.rtspClient.startHeartbeat();

    logger.info(`RTSP session ${this.id} playing ${this.streamPath} (${this.sdp.media.map((m) => m.codec).join(", ")})`);
  };

  /**
   * SETUP a single media track.
   * @param {import("../protocol/sdp.js").SdpMedia} media
   */
  setupTrack = async (media) => {
    const trackUrl = RtspClient.buildTrackUrl(this.rtspUrl, media.control);

    if (this.transport === "tcp") {
      // TCP interleaved mode
      const { rtpChannel, rtcpChannel } = this.rtspClient.allocateChannel();
      const transportHeader = RtspClient.buildTCPInterleavedTransport(rtpChannel, rtcpChannel);

      logger.debug(`RTSP session ${this.id} SETUP ${media.type} TCP interleaved=${rtpChannel}-${rtcpChannel}`);

      const setupRes = await this.rtspClient.setup(trackUrl, transportHeader);
      if (setupRes.statusCode !== 200) {
        logger.warn(`RTSP session ${this.id} SETUP ${media.type} failed: ${setupRes.statusCode}`);
        return;
      }

      // Register track with depayloader
      this.depayloader.addTrack(media.payloadType, media.codec, media.clockRate, media.fmtp);

    } else {
      // UDP mode — create UDP sockets
      await this.setupUDPTrack(media, trackUrl);
    }
  };

  /**
   * SETUP a track in UDP mode.
   * @param {import("../protocol/sdp.js").SdpMedia} media
   * @param {string} trackUrl
   */
  setupUDPTrack = async (media, trackUrl) => {
    const dgram = require("dgram");

    // Create UDP sockets for RTP and RTCP
    const rtpSocket = dgram.createSocket("udp4");
    const rtcpSocket = dgram.createSocket("udp4");

    return new Promise((resolve, reject) => {
      rtpSocket.on("error", (err) => {
        logger.error(`RTSP UDP RTP socket error: ${err.message}`);
        reject(err);
      });

      rtpSocket.on("message", (msg) => {
        this.inBytes += msg.length;
        this.onRtpData(0, msg);
      });

      rtpSocket.bind(0, () => {
        const rtpPort = rtpSocket.address().port;

        rtcpSocket.on("error", (err) => {
          logger.error(`RTSP UDP RTCP socket error: ${err.message}`);
        });

        rtcpSocket.bind(0, () => {
          const rtcpPort = rtcpSocket.address().port;

          const transportHeader = RtspClient.buildUDPTransport(rtpPort, rtcpPort);

          this.rtspClient.setup(trackUrl, transportHeader).then((setupRes) => {
            if (setupRes.statusCode === 200) {
              this.rtpSocket = rtpSocket;
              this.rtcpSocket = rtcpSocket;
              this.depayloader.addTrack(media.payloadType, media.codec, media.clockRate, media.fmtp);
              logger.debug(`RTSP session ${this.id} SETUP ${media.type} UDP client_port=${rtpPort}-${rtcpPort}`);
              resolve();
            } else {
              rtpSocket.close();
              rtcpSocket.close();
              logger.warn(`RTSP session ${this.id} SETUP ${media.type} UDP failed: ${setupRes.statusCode}`);
              resolve();
            }
          }).catch(reject);
        });
      });
    });
  };

  /**
   * Register this session to the broadcast system.
   */
  registerBroadcast = () => {
    this.broadcast = Context.broadcasts.get(this.streamPath) ?? new BroadcastServer();
    Context.broadcasts.set(this.streamPath, this.broadcast);
    Context.sessions.set(this.id, this);

    const err = this.broadcast.postPublish(this);
    if (err != null) {
      logger.error(`RTSP session ${this.id} publish ${this.streamPath} error: ${err}`);
      throw new Error(err);
    }

    logger.info(`RTSP session ${this.id} registered as publisher for ${this.streamPath}`);
  };

  // ─────────────────────────────────────────
  // Data Handling
  // ─────────────────────────────────────────

  /**
   * Handle incoming RTP/RTCP data from TCP interleaved or UDP.
   * @param {number} channel - Interleaved channel number
   * @param {Buffer} data - Raw RTP/RTCP data
   */
  onRtpData = (channel, data) => {
    this.inBytes += data.length;

    // Check if RTCP
    if (RtcpParser.isRtcp(data)) {
      const rtcpPackets = RtcpParser.parseCompound(data);
      for (const pkt of rtcpPackets) {
        logger.trace(`RTCP packet type=${RtcpParser.getTypeName(pkt.type)}`);
      }
      return;
    }

    // Parse RTP
    const rtpPacket = RtpParser.parse(data);
    if (!rtpPacket) {
      logger.trace("RTP parse failed");
      return;
    }

    // Feed to depayloader
    const avPackets = this.depayloader.feed(rtpPacket);
    for (const avPacket of avPackets) {
      this.broadcast.broadcastMessage(avPacket);
    }
  };

  // ─────────────────────────────────────────
  // Connection Events
  // ─────────────────────────────────────────

  /**
   * Handle connection close.
   * @param {boolean} hadError
   */
  onConnectionClose = (hadError) => {
    logger.info(`RTSP session ${this.id} connection closed (hadError=${hadError})`);
    this.handleReconnect();
  };

  /**
   * Handle connection error.
   * @param {Error} error
   */
  onConnectionError = (error) => {
    logger.error(`RTSP session ${this.id} connection error: ${error.message}`);
    this.handleReconnect();
  };

  // ─────────────────────────────────────────
  // Reconnect Logic
  // ─────────────────────────────────────────

  /**
   * Handle reconnect with exponential backoff.
   */
  handleReconnect = () => {
    if (this.isClosing) {
      return;
    }

    if (!this.reconnectEnabled) {
      logger.info(`RTSP session ${this.id} reconnect disabled, stopping`);
      this.cleanup();
      return;
    }

    if (this.maxReconnectAttempts > 0 && this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.warn(`RTSP session ${this.id} max reconnect attempts (${this.maxReconnectAttempts}) reached`);
      this.cleanup();
      return;
    }

    this.reconnectAttempts++;
    logger.info(`RTSP session ${this.id} reconnect attempt ${this.reconnectAttempts} in ${this.currentReconnectInterval}ms`);

    setTimeout(() => {
      if (this.isClosing) {
        return;
      }

      // Reset RTSP client state
      this.rtspClient = new RtspClient();
      this.rtspClient.onRtpDataCallback = this.onRtpData;
      this.rtspClient.onCloseCallback = this.onConnectionClose;
      this.rtspClient.onErrorCallback = this.onConnectionError;
      this.depayloader = new RtpDepayloader();

      // Re-setup tracks from SDP
      if (this.sdp) {
        for (const media of this.sdp.media) {
          this.depayloader.addTrack(media.payloadType, media.codec, media.clockRate, media.fmtp);
        }
      }

      this.connectAndPlay().catch((error) => {
        logger.error(`RTSP session ${this.id} reconnect failed: ${error.message}`);
        // Exponential backoff: double interval, cap at max
        this.currentReconnectInterval = Math.min(this.currentReconnectInterval * 2, MAX_RECONNECT_INTERVAL);
        this.handleReconnect();
      });
    }, this.currentReconnectInterval);
  };

  // ─────────────────────────────────────────
  // Cleanup
  // ─────────────────────────────────────────

  /**
   * Close the session and clean up resources.
   */
  close = () => {
    if (this.isClosing) {
      return;
    }

    this.isClosing = true;
    this.isRunning = false;

    logger.info(`RTSP session ${this.id} closing ${this.streamPath}`);

    // TEARDOWN
    if (this.rtspClient.connected) {
      this.rtspClient.stopHeartbeat();
      this.rtspClient.teardown().catch(() => {});
    }

    this.cleanup();
  };

  /**
   * Internal cleanup.
   */
  cleanup = () => {
    this.isRunning = false;

    // Disconnect RTSP client
    this.rtspClient.disconnect();

    // Close UDP sockets
    if (this.rtpSocket) {
      this.rtpSocket.close();
      this.rtpSocket = null;
    }
    if (this.rtcpSocket) {
      this.rtcpSocket.close();
      this.rtcpSocket = null;
    }

    // Remove from broadcast
    if (this.broadcast) {
      this.broadcast.donePublish(this);
    }

    // Remove from context
    Context.sessions.delete(this.id);

    this.endTime = Date.now();
    logger.info(`RTSP session ${this.id} closed ${this.streamPath} (inBytes=${this.inBytes})`);
  };

  /**
   * Send buffer (not used for RTSP pull, but required by BaseSession).
   * @param {Buffer} buffer
   */
  sendBuffer = (buffer) => {
    // RTSP pull session doesn't send data to remote
    this.outBytes += buffer.length;
  };

  /**
   * Get session status info.
   * @returns {object}
   */
  getStatus = () => {
    return {
      id: this.id,
      protocol: this.protocol,
      rtspUrl: this.rtspUrl,
      streamPath: this.streamPath,
      transport: this.transport,
      isRunning: this.isRunning,
      isClosing: this.isClosing,
      reconnectAttempts: this.reconnectAttempts,
      inBytes: this.inBytes,
      outBytes: this.outBytes,
      createTime: this.createTime,
      endTime: this.endTime,
      tracks: this.sdp ? this.sdp.media.map((m) => ({
        type: m.type,
        codec: m.codec,
        payloadType: m.payloadType,
        clockRate: m.clockRate
      })) : []
    };
  };
}

module.exports = RtspSession;
