// @ts-check
//
//  Created by Chen Mingliang on 25/04/24.
//  illuspas@msn.com
//  Copyright (c) 2025 NodeMedia. All rights reserved.
//

const logger = require("../core/logger.js");
const RtspSession = require("../session/rtsp_session.js");

/**
 * Relay Manager — manages RTSP pull stream tasks.
 * Provides lifecycle management for RTSP pull sessions.
 * @class
 */
class RelayManager {
  constructor() {
    /** @type {Map<string, RtspSession>} streamPath -> RtspSession */
    this.tasks = new Map();

    /** @type {boolean} */
    this.isRunning = false;
  }

  // ─────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────

  /**
   * Start the relay manager.
   * All tasks are managed via API — no config-driven static tasks.
   */
  run = () => {
    if (this.isRunning) {
      logger.warn("RelayManager already running");
      return;
    }

    this.isRunning = true;
    logger.info("RelayManager started (API-driven mode)");
  };

  /**
   * Stop all relay tasks.
   */
  stop = () => {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    logger.info("RelayManager stopping all tasks");

    // Close all sessions
    for (const [streamPath, session] of this.tasks) {
      logger.info(`RelayManager stopping task: ${streamPath}`);
      session.close();
    }

    this.tasks.clear();
    logger.info("RelayManager stopped");
  };

  // ─────────────────────────────────────────
  // Task Management
  // ─────────────────────────────────────────

  /**
   * Add a new RTSP pull stream task.
   * @param {object} config
   * @param {string} config.rtspUrl - Full RTSP URL
   * @param {string} config.streamPath - Stream path (e.g. "/live/camera1")
   * @param {"tcp"|"udp"} [config.transport] - Transport mode (default "tcp")
   * @param {boolean} [config.reconnect] - Enable auto-reconnect (default true)
   * @param {number} [config.reconnectInterval] - Initial reconnect interval ms
   * @param {number} [config.maxReconnectAttempts] - Max reconnect attempts (0 = unlimited)
   * @returns {RtspSession} The created session
   */
  addTask = (config) => {
    const { rtspUrl, streamPath } = config;

    if (!rtspUrl || !streamPath) {
      throw new Error("rtspUrl and streamPath are required");
    }

    // Check if task already exists
    if (this.tasks.has(streamPath)) {
      logger.warn(`RelayManager task already exists: ${streamPath}`);
      return this.tasks.get(streamPath);
    }

    logger.info(`RelayManager adding task: ${rtspUrl} → ${streamPath}`);

    const session = new RtspSession(config);
    this.tasks.set(streamPath, session);

    // Start the session
    session.run().catch((error) => {
      logger.error(`RelayManager task ${streamPath} start failed: ${error.message}`);
    });

    return session;
  };

  /**
   * Remove an RTSP pull stream task.
   * @param {string} streamPath - Stream path to remove
   * @returns {boolean} True if task was found and removed
   */
  removeTask = (streamPath) => {
    const session = this.tasks.get(streamPath);
    if (!session) {
      logger.warn(`RelayManager task not found: ${streamPath}`);
      return false;
    }

    logger.info(`RelayManager removing task: ${streamPath}`);
    session.close();
    this.tasks.delete(streamPath);
    return true;
  };

  /**
   * List all relay tasks.
   * @returns {object[]} Array of task status objects
   */
  listTasks = () => {
    const result = [];
    for (const [streamPath, session] of this.tasks) {
      result.push(session.getStatus());
    }
    return result;
  };

  /**
   * Get status of a specific task.
   * @param {string} streamPath - Stream path
   * @returns {object|null} Task status or null if not found
   */
  getTaskStatus = (streamPath) => {
    const session = this.tasks.get(streamPath);
    if (!session) {
      return null;
    }
    return session.getStatus();
  };

  /**
   * Get task count.
   * @returns {number}
   */
  getTaskCount = () => {
    return this.tasks.size;
  };
}

module.exports = RelayManager;
