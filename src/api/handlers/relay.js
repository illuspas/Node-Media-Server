// @ts-check
//
//  Created by Chen Mingliang on 25/04/24.
//  illuspas@msn.com
//  Copyright (c) 2025 NodeMedia. All rights reserved.
//

const logger = require("../../core/logger.js");
const Context = require("../../core/context.js");

/**
 * Relay API Handler — REST API for RTSP pull stream management.
 * @class
 */
class RelayHandler {
  /**
   * Add a new RTSP pull stream task.
   * POST /api/v1/relay
   * Body: { rtspUrl, streamPath, transport?, reconnect?, reconnectInterval?, maxReconnectAttempts? }
   * @param {express.Request} req
   * @param {express.Response} res
   */
  static addPull = (req, res) => {
    try {
      const { rtspUrl, streamPath, transport, reconnect, reconnectInterval, maxReconnectAttempts } = req.body;

      if (!rtspUrl || !streamPath) {
        res.status(400).json({
          success: false,
          error: "rtspUrl and streamPath are required"
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
        rtspUrl,
        streamPath,
        transport: transport || "tcp",
        reconnect: reconnect !== false,
        reconnectInterval,
        maxReconnectAttempts
      });

      res.json({
        success: true,
        data: session.getStatus(),
        message: `Pull stream added: ${streamPath}`
      });

      logger.info(`API: Added pull stream ${rtspUrl} → ${streamPath}`);
    } catch (error) {
      logger.error(`API: Add pull stream failed: ${error.message}`);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  };

  /**
   * Stop an RTSP pull stream task.
   * DELETE /api/v1/relay
   * Body: { streamPath }
   * @param {express.Request} req
   * @param {express.Response} res
   */
  static removePull = (req, res) => {
    try {
      const { streamPath } = req.body;

      if (!streamPath) {
        res.status(400).json({
          success: false,
          error: "streamPath is required"
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

      const removed = relayManager.removeTask(streamPath);

      if (removed) {
        res.json({
          success: true,
          message: `Pull stream removed: ${streamPath}`
        });
        logger.info(`API: Removed pull stream ${streamPath}`);
      } else {
        res.status(404).json({
          success: false,
          error: `Task not found: ${streamPath}`
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
