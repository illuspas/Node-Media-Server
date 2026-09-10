// @ts-check
//
//  Created by Chen Mingliang on 24/11/27.
//  illuspas@msn.com
//  Copyright (c) 2024 NodeMedia. All rights reserved.
//

const crypto = require("node:crypto");
const logger = require("../../core/logger.js");
const Context = require("../../core/context.js");
const { rateSampler } = require("../../core/rate_sampler.js");
/** @typedef {import("express").Request} Request */
/** @typedef {import("express").Response} Response */
/** @typedef {import("../../server/broadcast_server.js")} BroadcastServer */

/** Default lifetime of generated signed play URLs, in seconds. */
const DEFAULT_SIGN_TTL_SEC = 3600;
/** Lower/upper bound for the ttl parameter, in seconds. */
const MIN_SIGN_TTL_SEC = 60;
const MAX_SIGN_TTL_SEC = 24 * 3600;

/**
 * @param {string} ip
 * @returns {string}
 */
function displayIp(ip) {
  return ip || "127.0.0.1";
}

/**
 * Clamp the ttl query parameter to a sane range.
 * @param {any} raw - req.query.ttl (string, string[] or undefined)
 * @returns {number}
 */
function parseTtl(raw) {
  const first = Array.isArray(raw) ? raw[0] : raw;
  const parsed = parseInt(first, 10);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_SIGN_TTL_SEC;
  }
  return Math.min(MAX_SIGN_TTL_SEC, Math.max(MIN_SIGN_TTL_SEC, parsed));
}

/**
 * Build a play sign exactly as BroadcastServer.verifyAuth expects it:
 * "<expiryUnixSeconds>-<md5hex(streamPath-expiry-secret)>".
 * @param {string} streamPath
 * @param {string} secret
 * @param {number} expiresAtSec - Unix expiry in seconds
 * @returns {string}
 */
function buildPlaySign(streamPath, secret, expiresAtSec) {
  const hash = crypto.createHash("md5").update(`${streamPath}-${expiresAtSec}-${secret}`).digest("hex");
  return `${expiresAtSec}-${hash}`;
}

/**
 * ":port" suffix, empty when the port is the protocol default so URLs stay canonical.
 * @param {number} port
 * @param {number} defaultPort
 * @returns {string}
 */
function portSuffix(port, defaultPort) {
  return port === defaultPort ? "" : `:${port}`;
}

/**
 * Serialize one broadcast for /streams and /streams/:app/:name, including
 * real-time rates from the shared sampler (bytes per second).
 * @param {string} key
 * @param {BroadcastServer} broadcast
 * @returns {object}
 */
function buildStreamEntry(key, broadcast) {
  let outBytes = 0;
  broadcast.subscribers?.forEach(subscriber => {
    outBytes += subscriber.outBytes || 0;
  });
  const rates = rateSampler.getStreamRates(key);
  return {
    key,
    app: key.split("/")[1],
    name: key.split("/")[2],
    status: broadcast.getPublishStatus(),
    publisher: broadcast.publisher ? {
      id: broadcast.publisher.id,
      ip: displayIp(broadcast.publisher.ip),
      protocol: broadcast.publisher.protocol,
      createTime: broadcast.publisher.createTime,
      videoCodec: broadcast.publisher.videoCodec,
      videoWidth: broadcast.publisher.videoWidth,
      videoHeight: broadcast.publisher.videoHeight,
      videoFramerate: broadcast.publisher.videoFramerate,
      audioCodec: broadcast.publisher.audioCodec,
      audioChannels: broadcast.publisher.audioChannels,
      audioSamplerate: broadcast.publisher.audioSamplerate,
      inBytes: broadcast.publisher.inBytes,
    } : null,
    subscribers: broadcast.subscribers?.size || 0,
    outBytes,
    inBps: rates.inBps,
    outBps: rates.outBps,
    recording: Context.recordServer?.isRecording(key) ?? false
  };
}

class StreamsHandler {
  /**
   * Get all active streams
   * @param {Request} req
   * @param {Response} res
   */
  static getStreams(req, res) {
    try {
      const streams = [];
      Context.broadcasts.forEach((broadcast, key) => {
        streams.push(buildStreamEntry(key, broadcast));
      });

      res.json({
        success: true,
        data: {
          streams,
          total: streams.length
        },
        message: "Streams retrieved successfully"
      });
    } catch (error) {
      logger.error("Error getting streams:", error);
      res.status(500).json({
        success: false,
        data: {},
        message: "Internal server error"
      });
    }
  }

  /**
   * Get specific stream information
   * @param {Request} req
   * @param {Response} res
   */
  static getStreamInfo(req, res) {
    try {
      const { app, name } = req.params;
      const key = `/${app}/${name}`;

      const broadcast = Context.broadcasts.get(key);

      if (!broadcast) {
        return res.status(404).json({
          success: false,
          data: {},
          message: "Stream not found"
        });
      }

      const streamInfo = buildStreamEntry(key, broadcast);

      res.json({
        success: true,
        data: streamInfo,
        message: "Stream information retrieved successfully"
      });
    } catch (error) {
      logger.error("Error getting stream info:", error);
      res.status(500).json({
        success: false,
        data: {},
        message: "Internal server error"
      });
    }
  }

  /**
   * Generate ready-to-use play URLs for one stream across every configured
   * listener (rtmp/rtmps/http-flv/ws-flv/https-flv/wss-flv). When auth.play
   * is enabled with a secret, every URL carries a sign query parameter that
   * BroadcastServer.verifyAuth accepts; optional ?ttl=<seconds> bounds the
   * signature lifetime (60..86400, default 3600).
   * GET /api/v1/streams/:app/:name/urls
   * @param {Request} req
   * @param {Response} res
   */
  static getPlayUrls(req, res) {
    try {
      const { app, name } = req.params;
      const streamPath = `/${app}/${name}`;
      const host = req.hostname || "127.0.0.1";

      const auth = Context.config.auth ?? {};
      const secret = typeof auth.secret === "string" ? auth.secret : "";
      const signEnabled = auth.play === true && secret !== "";

      let expiresAtSec = null;
      let query = "";
      if (signEnabled) {
        expiresAtSec = Math.floor(Date.now() / 1000) + parseTtl(req.query.ttl);
        query = `?sign=${buildPlaySign(streamPath, secret, expiresAtSec)}`;
      }

      /** @type {Array<{protocol: string, url: string}>} */
      const urls = [];
      const rtmpPort = Context.config.rtmp?.port;
      if (rtmpPort) {
        urls.push({ protocol: "rtmp", url: `rtmp://${host}${portSuffix(rtmpPort, 1935)}${streamPath}${query}` });
      }
      const rtmpsPort = Context.config.rtmps?.port;
      if (rtmpsPort) {
        urls.push({ protocol: "rtmps", url: `rtmps://${host}${portSuffix(rtmpsPort, 1935)}${streamPath}${query}` });
      }
      const httpPort = Context.config.http?.port;
      if (httpPort) {
        urls.push({ protocol: "http-flv", url: `http://${host}${portSuffix(httpPort, 80)}${streamPath}.flv${query}` });
        urls.push({ protocol: "ws-flv", url: `ws://${host}${portSuffix(httpPort, 80)}${streamPath}.flv${query}` });
      }
      const httpsPort = Context.config.https?.port;
      if (httpsPort) {
        urls.push({ protocol: "https-flv", url: `https://${host}${portSuffix(httpsPort, 443)}${streamPath}.flv${query}` });
        urls.push({ protocol: "wss-flv", url: `wss://${host}${portSuffix(httpsPort, 443)}${streamPath}.flv${query}` });
      }

      const broadcast = Context.broadcasts.get(streamPath);
      res.json({
        success: true,
        data: {
          app,
          name,
          streamPath,
          status: broadcast ? broadcast.getPublishStatus() : "idle",
          signed: signEnabled,
          expiresAt: expiresAtSec === null ? null : new Date(expiresAtSec * 1000).toISOString(),
          urls
        },
        message: "Play URLs generated successfully"
      });
    } catch (error) {
      logger.error("Error generating play URLs:", error);
      res.status(500).json({
        success: false,
        data: {},
        message: "Internal server error"
      });
    }
  }

  /**
   * Manually start recording a publishing stream
   * POST /api/v1/streams/:app/:name/record
   * @param {Request} req
   * @param {Response} res
   */
  static startRecord(req, res) {
    const streamPath = `/${req.params.app}/${req.params.name}`;
    const result = Context.recordServer?.startRecord(streamPath);
    if (!result?.ok) {
      return res.status(400).json({
        success: false,
        data: {},
        message: result?.error ?? "Record server is not available"
      });
    }
    res.json({
      success: true,
      data: { recordId: result.recordId, filePath: result.filePath },
      message: "Recording started"
    });
  }

  /**
   * Get the recording status of a stream
   * GET /api/v1/streams/:app/:name/record
   * @param {Request} req
   * @param {Response} res
   */
  static getRecord(req, res) {
    const streamPath = `/${req.params.app}/${req.params.name}`;
    const recordServer = Context.recordServer;
    if (!recordServer) {
      return res.status(400).json({
        success: false,
        data: {},
        message: "Record server is not available"
      });
    }
    const session = recordServer.getActiveRecord(streamPath);
    res.json({
      success: true,
      data: {
        recording: !!session,
        recordId: session?.id,
        filePath: session?.filePath,
        startTime: session?.createTime
      },
      message: session ? "Recording in progress" : "No active recording"
    });
  }

  /**
   * Manually stop the active recording of a stream
   * DELETE /api/v1/streams/:app/:name/record
   * @param {Request} req
   * @param {Response} res
   */
  static stopRecord(req, res) {
    const streamPath = `/${req.params.app}/${req.params.name}`;
    const result = Context.recordServer?.stopRecord(streamPath);
    if (!result?.ok) {
      return res.status(400).json({
        success: false,
        data: {},
        message: result?.error ?? "Record server is not available"
      });
    }
    res.json({
      success: true,
      data: {},
      message: "Recording stopped"
    });
  }
}

module.exports = StreamsHandler;