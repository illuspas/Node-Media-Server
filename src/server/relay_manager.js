// @ts-check
//
//  Created by Chen Mingliang on 25/04/24.
//  illuspas@msn.com
//  Copyright (c) 2025 NodeMedia. All rights reserved.
//

const logger = require("../core/logger.js");
const Context = require("../core/context.js");
const RtspSession = require("../session/rtsp_session.js");
const RtmpClientSession = require("../session/rtmp_client_session.js");

/**
 * Relay Manager — manages RTSP and RTMP relay tasks.
 * Tasks created via API are persisted in the store ("relay_tasks" collection)
 * and restored automatically on restart.
 * @class
 */
class RelayManager {
  constructor() {
    /** @type {Map<string, (RtspSession|RtmpClientSession)>} taskKey -> session */
    this.tasks = new Map();

    /** @type {boolean} */
    this.isRunning = false;
  }

  // ─────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────

  /**
   * Start the relay manager and restore persisted tasks.
   * All tasks are managed via API — no config-driven static tasks.
   */
  run = () => {
    if (this.isRunning) {
      logger.warn("RelayManager already running");
      return;
    }

    this.isRunning = true;
    this._restoreTasks();
    logger.info("RelayManager started (API-driven mode)");
  };

  /**
   * Re-create relay tasks persisted by a previous run.
   * @returns {void}
   */
  _restoreTasks = () => {
    const store = Context.store;
    if (!store?.opened) {
      return;
    }
    const persisted = store.collection("relay_tasks").all();
    if (persisted.length === 0) {
      return;
    }
    logger.info(`RelayManager restoring ${persisted.length} persisted task(s)`);
    for (const doc of persisted) {
      try {
        this.addTask(doc.config);
      } catch (error) {
        logger.error(`RelayManager restore task ${doc.id} failed: ${error.message}`);
      }
    }
  };

  /**
   * Persist or drop a task config so task state survives restarts.
   * @param {string} taskKey
   * @param {object|null} config - Null removes the persisted task.
   * @returns {void}
   */
  _persistTask = (taskKey, config) => {
    const store = Context.store;
    if (!store?.opened) {
      return;
    }
    const relayTasks = store.collection("relay_tasks");
    if (config === null) {
      relayTasks.delete(taskKey);
    } else {
      relayTasks.set(taskKey, { config });
    }
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
   * Add a new RTSP or RTMP relay task.
   * @param {object} config
   * @param {string} [config.rtspUrl] - Legacy RTSP URL field
   * @param {string} [config.url] - Remote RTSP/RTMP URL
   * @param {"pull"|"push"} [config.mode] - Relay direction
   * @param {string} config.streamPath - Stream path (e.g. "/live/camera1")
   * @param {boolean} [config.reconnect] - Enable auto-reconnect (default true)
   * @param {number} [config.reconnectInterval] - Initial reconnect interval ms
   * @param {number} [config.maxReconnectAttempts] - Max reconnect attempts (0 = unlimited)
   * @returns {(RtspSession|RtmpClientSession)} The created session
   */
  addTask = (config) => {
    const url = config.url || config.rtspUrl;
    const { streamPath } = config;

    if (!url || !streamPath) {
      throw new Error("url and streamPath are required");
    }
    const parsedUrl = new URL(url);
    const mode = config.mode || "pull";
    if (mode !== "pull" && mode !== "push") {
      throw new Error(`Unsupported relay mode: ${mode}`);
    }
    if (parsedUrl.protocol !== "rtsp:" && parsedUrl.protocol !== "rtmp:") {
      throw new Error(`Unsupported relay URL scheme: ${parsedUrl.protocol}`);
    }
    if (parsedUrl.protocol === "rtsp:" && mode === "push") {
      throw new Error("RTSP push relay is not supported");
    }

    const taskKey = parsedUrl.protocol === "rtmp:" && mode === "push"
      ? `push:${url}`
      : streamPath;
    // Check if task already exists
    if (this.tasks.has(taskKey)) {
      logger.warn(`RelayManager task already exists: ${taskKey}`);
      return this.tasks.get(taskKey);
    }

    logger.info(`RelayManager adding task: ${url} → ${streamPath} (${mode})`);

    const sessionConfig = { ...config, url, mode, rtspUrl: url };
    const session = parsedUrl.protocol === "rtsp:"
      ? new RtspSession(sessionConfig)
      : new RtmpClientSession(sessionConfig);
    session.taskKey = taskKey;
    this.tasks.set(taskKey, session);
    this._persistTask(taskKey, sessionConfig);

    // Start the session
    session.run().catch((error) => {
      logger.error(`RelayManager task ${taskKey} start failed: ${error.message}`);
    });

    return session;
  };

  /**
   * Remove a relay task by its task key.
   * @param {string} taskKey - Stream path or push URL key
   * @returns {boolean} True if task was found and removed
   */
  removeTask = (taskKey) => {
    const session = this.tasks.get(taskKey);
    if (!session) {
      logger.warn(`RelayManager task not found: ${taskKey}`);
      return false;
    }

    logger.info(`RelayManager removing task: ${taskKey}`);
    session.close();
    this.tasks.delete(taskKey);
    this._persistTask(taskKey, null);
    return true;
  };

  /**
   * List all relay tasks.
   * @returns {object[]} Array of task status objects
   */
  listTasks = () => {
    const result = [];
    for (const [taskKey, session] of this.tasks) {
      result.push({ taskKey, ...session.getStatus() });
    }
    return result;
  };

  /**
   * Get status of a specific task.
   * @param {string} taskKey - Stream path or push URL key
   * @returns {object|null} Task status or null if not found
   */
  getTaskStatus = (taskKey) => {
    const session = this.tasks.get(taskKey);
    if (!session) {
      return null;
    }
    return { taskKey, ...session.getStatus() };
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
