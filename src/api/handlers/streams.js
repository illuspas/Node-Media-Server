// @ts-check
//
//  Created by Chen Mingliang on 24/11/27.
//  illuspas@msn.com
//  Copyright (c) 2024 NodeMedia. All rights reserved.
//

const logger = require("../../core/logger.js");
const Context = require("../../core/context.js");

/**
 * @param {string} ip
 * @returns {string}
 */
function displayIp(ip) {
  return ip || "127.0.0.1";
}

class StreamsHandler {
  /**
   * Get all active streams
   * @param {express.Request} req
   * @param {express.Response} res
   */
  static getStreams(req, res) {
    try {
      const streams = [];

      Context.broadcasts.forEach((broadcast, key) => {
        const [_, app, name] = key.split("/");
        streams.push({
          key,
          app,
          name,
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
          recording: Context.recordServer?.isRecording(key) ?? false
        });
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
   * @param {express.Request} req
   * @param {express.Response} res
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

      const streamInfo = {
        key,
        app,
        name,
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
        recording: Context.recordServer?.isRecording(key) ?? false,
      };

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
   * Manually start recording a publishing stream
   * POST /api/v1/streams/:app/:name/record
   * @param {express.Request} req
   * @param {express.Response} res
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
   * Manually stop the active recording of a stream
   * DELETE /api/v1/streams/:app/:name/record
   * @param {express.Request} req
   * @param {express.Response} res
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