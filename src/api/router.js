// @ts-check
//
//  Created by Chen Mingliang on 24/11/27.
//  illuspas@msn.com
//  Copyright (c) 2024 NodeMedia. All rights reserved.
//

const express = require("express");
const logger = require("../core/logger.js");
const Context = require("../core/context.js");

class ApiRouter {
  constructor() {
    this.router = express.Router();
    this.setupRoutes();
  }

  /**
   * Setup API routes
   */
  setupRoutes() {
    // Health check endpoint
    this.router.get("/health", this.healthCheck.bind(this));

    // Server info endpoint
    this.router.get("/info", this.getServerInfo.bind(this));

    // Stream management endpoints
    this.router.get("/streams", this.getStreams.bind(this));
    this.router.get("/streams/:app/:name", this.getStreamInfo.bind(this));

    // Session management endpoints
    this.router.get("/sessions", this.getSessions.bind(this));

    // Statistics endpoint
    this.router.get("/stats", this.getStats.bind(this));
  }

  /**
   * Health check endpoint
   * @param {express.Request} req
   * @param {express.Response} res
   */
  healthCheck(req, res) {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      version: require("../../package.json").version
    });
  }

  /**
   * Get server information
   * @param {express.Request} req
   * @param {express.Response} res
   */
  getServerInfo(req, res) {
    try {
      const config = Context.config;
      const packageInfo = require("../../package.json");

      res.json({
        server: {
          name: packageInfo.name,
          version: packageInfo.version,
          homepage: packageInfo.homepage,
          license: packageInfo.license,
          author: packageInfo.author
        },
        config: {
          bind: config.bind || "0.0.0.0",
          rtmp_port: config.rtmp?.port,
          rtmps_port: config.rtmps?.port,
          http_port: config.http?.port,
          https_port: config.https?.port,
          static_enabled: !!(config.static?.router && config.static?.root),
          record_enabled: !!config.record?.path,
          auth_enabled: !!(config.auth?.play || config.auth?.publish)
        },
        uptime: process.uptime(),
        node_version: process.version
      });
    } catch (error) {
      logger.error("Error getting server info:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  /**
   * Get all active streams
   * @param {express.Request} req
   * @param {express.Response} res
   */
  getStreams(req, res) {
    try {
      const streams = [];

      Context.broadcasts.forEach((broadcast, key) => {
        const [_,app, name] = key.split("/");
        streams.push({
          key,
          app,
          name,
          publisher: {
            id: broadcast.publisher?.id,
            ip: broadcast.publisher?.ip,
            protocol: broadcast.publisher?.protocol,
            createTime: broadcast.publisher?.createTime,
            videoCodec: broadcast.publisher?.videoCodec,
            videoWidth: broadcast.publisher?.videoWidth,
            videoHeight: broadcast.publisher?.videoHeight,
            videoFramerate: broadcast.publisher?.videoFramerate,
            audioCodec: broadcast.publisher?.audioCodec,
            audioChannels: broadcast.publisher?.audioChannels,
            audioSamplerate: broadcast.publisher?.audioSamplerate,
            inBytes: broadcast.publisher?.inBytes,
          },
          subscribers: broadcast.subscribers?.size || 0
        });
      });

      res.json({
        streams,
        total: streams.length
      });
    } catch (error) {
      logger.error("Error getting streams:"+ error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  /**
   * Get specific stream information
   * @param {express.Request} req
   * @param {express.Response} res
   * @returns
   */
  getStreamInfo(req, res) {
    try {
      const { app, name } = req.params;
      const key = `/${app}/${name}`;

      const broadcast = Context.broadcasts.get(key);

      if (!broadcast) {
        return res.status(404).json({ error: "Stream not found" });
      }

      const streamInfo = {
        key,
        app,
        name,
        publisher: broadcast.publisher ? {
          id: broadcast.publisher.id,
          ip: broadcast.publisher.ip,
          protocol: broadcast.publisher?.protocol,
          createTime: broadcast.publisher?.createTime,
          videoCodec: broadcast.publisher?.videoCodec,
          videoWidth: broadcast.publisher?.videoWidth,
          videoHeight: broadcast.publisher?.videoHeight,
          videoFramerate: broadcast.publisher?.videoFramerate,
          audioCodec: broadcast.publisher?.audioCodec,
          audioChannels: broadcast.publisher?.audioChannels,
          audioSamplerate: broadcast.publisher?.audioSamplerate,
          inBytes: broadcast.publisher?.inBytes,
        } : null,
        subscribers: broadcast.subscribers?.size || 0,
      };

      res.json(streamInfo);
    } catch (error) {
      logger.error("Error getting stream info:"+ error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  /**
   * Get all active sessions
   * @param {express.Request} req
   * @param {express.Response} res
   */
  getSessions(req, res) {
    try {
      const sessions = [];

      Context.sessions.forEach((session, id) => {
        sessions.push({
          id,
          ip: session.ip,
          isPublisher: session.isPublisher,
          protocol: session.protocol,
          app: session.app,
          name: session.name,
          type: session.type,
          inBytes: session.inBytes,
          outBytes: session.outBytes,
          createTime: session.createTime
        });
      });

      res.json({
        sessions,
        total: sessions.length
      });
    } catch (error) {
      logger.error("Error getting sessions:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  /**
   * Get server statistics
   * @param {express.Request} req
   * @param {express.Response} res
   */
  getStats(req, res) {
    try {
      const memoryUsage = process.memoryUsage();
      const cpuUsage = process.cpuUsage();

      const stats = {
        server: {
          uptime: process.uptime(),
          nodeVersion: process.version,
          platform: process.platform
        },
        memory: {
          rss: memoryUsage.rss,
          heapTotal: memoryUsage.heapTotal,
          heapUsed: memoryUsage.heapUsed,
          external: memoryUsage.external
        },
        sessions: {
          total: Context.sessions.size,
          publishers: Array.from(Context.sessions.values()).filter(s => s.isPublisher).length,
          players: Array.from(Context.sessions.values()).filter(s => !s.isPublisher).length
        },
        streams: {
          total: Context.broadcasts.size,
        },
        timestamp: new Date().toISOString()
      };

      res.json(stats);
    } catch (error) {
      logger.error("Error getting stats:"+ error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
}

module.exports = ApiRouter;