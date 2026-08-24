// @ts-check
//
//  Created by Chen Mingliang on 25/04/24.
//  illuspas@msn.com
//  Copyright (c) 2025 NodeMedia. All rights reserved.
//

const logger = require("../../core/logger.js");
const Context = require("../../core/context.js");

/**
 * Relay API Handler — REST API for RTSP/RTMP relay management.
 * @class
 */
class RelayHandler {
  /**
   * Add a new RTSP/RTMP relay task.
   * POST /api/v1/relay
   * Body: { url, mode?, streamPath, reconnect?, reconnectInterval?, maxReconnectAttempts? }
   * @param {express.Request} req
   * @param {express.Response} res
   */
  static addPull = (req, res) => {
    try {
      const {
        url: requestUrl,
        rtspUrl,
        mode = "pull",
        streamPath,
        reconnect,
        reconnectInterval,
        maxReconnectAttempts
      } = req.body;
      const url = requestUrl || rtspUrl;

      if (!url || !streamPath) {
        res.status(400).json({
          success: false,
          error: "url (or legacy rtspUrl) and streamPath are required"
        });
        return;
      }
      if (mode !== "pull" && mode !== "push") {
        res.status(400).json({ success: false, error: "mode must be pull or push" });
        return;
      }
      let parsedUrl;
      try {
        parsedUrl = new URL(url);
      } catch (error) {
        res.status(400).json({ success: false, error: "url must be a valid RTSP or RTMP URL" });
        return;
      }
      if (!["rtsp:", "rtmp:"].includes(parsedUrl.protocol) ||
          (parsedUrl.protocol === "rtsp:" && mode === "push")) {
        res.status(400).json({
          success: false,
          error: "url/mode must be RTSP pull or RTMP pull/push"
        });
        return;
      }

      // Validate streamPath format
      if (!streamPath.startsWith("/")) {
        res.status(400).json({
          success: false,
          error: "streamPath must start with /"
        });
        return;
      }

      const relayManager = Context.relayManager;
      if (!relayManager) {
        res.status(500).json({
          success: false,
          error: "RelayManager not initialized"
        });
        return;
      }

      const session = relayManager.addTask({
        url,
        rtspUrl,
        streamPath,
        mode,
        reconnect: reconnect !== false,
        reconnectInterval,
        maxReconnectAttempts
      });

      res.json({
        success: true,
        data: session.getStatus(),
        message: `${mode === "push" ? "Push" : "Pull"} relay added: ${streamPath}`
      });

      logger.info(`API: Added ${mode} relay ${url} → ${streamPath}`);
    } catch (error) {
      logger.error(`API: Add pull stream failed: ${error.message}`);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  };

  /**
   * Stop a relay task.
   * DELETE /api/v1/relay
   * Body: { streamPath } or { taskKey }
   * @param {express.Request} req
   * @param {express.Response} res
   */
  static removePull = (req, res) => {
    try {
      const { streamPath, taskKey, url, mode = "pull" } = req.body;
      const removeKey = taskKey || (mode === "push" && url ? `push:${url}` : streamPath);

      if (!removeKey) {
        res.status(400).json({
          success: false,
          error: "streamPath or taskKey is required"
        });
        return;
      }

      const relayManager = Context.relayManager;
      if (!relayManager) {
        res.status(500).json({
          success: false,
          error: "RelayManager not initialized"
        });
        return;
      }

      const removed = relayManager.removeTask(removeKey);

      if (removed) {
        res.json({
          success: true,
          message: `Relay task removed: ${removeKey}`
        });
        logger.info(`API: Removed relay task ${removeKey}`);
      } else {
        res.status(404).json({
          success: false,
          error: `Task not found: ${removeKey}`
        });
      }
    } catch (error) {
      logger.error(`API: Remove pull stream failed: ${error.message}`);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  };

  /**
   * List all RTSP pull stream tasks.
   * GET /api/v1/relay
   * @param {express.Request} req
   * @param {express.Response} res
   */
  static listTasks = (req, res) => {
    try {
      const relayManager = Context.relayManager;
      if (!relayManager) {
        res.status(500).json({
          success: false,
          error: "RelayManager not initialized"
        });
        return;
      }

      const tasks = relayManager.listTasks();

      res.json({
        success: true,
        data: tasks,
        count: tasks.length
      });
    } catch (error) {
      logger.error(`API: List tasks failed: ${error.message}`);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  };

  /**
   * Get status of a specific pull stream task.
   * GET /api/v1/relay/:streamPath
   * @param {express.Request} req
   * @param {express.Response} res
   */
  static getTaskStatus = (req, res) => {
    try {
      const streamPath = decodeURIComponent(req.params.streamPath);

      const relayManager = Context.relayManager;
      if (!relayManager) {
        res.status(500).json({
          success: false,
          error: "RelayManager not initialized"
        });
        return;
      }

      const status = relayManager.getTaskStatus(streamPath);

      if (status) {
        res.json({
          success: true,
          data: status
        });
      } else {
        res.status(404).json({
          success: false,
          error: `Task not found: ${streamPath}`
        });
      }
    } catch (error) {
      logger.error(`API: Get task status failed: ${error.message}`);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  };
}

module.exports = RelayHandler;
