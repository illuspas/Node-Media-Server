// @ts-check
//
//  Created by Chen Mingliang on 24/11/27.
//  illuspas@msn.com
//  Copyright (c) 2024 NodeMedia. All rights reserved.
//

const express = require("express");

// Import handlers
const HealthHandler = require("../api/handlers/health.js");
const AuthHandler = require("../api/handlers/auth.js");
const InfoHandler = require("../api/handlers/info.js");
const StreamsHandler = require("../api/handlers/streams.js");
const SessionsHandler = require("../api/handlers/sessions.js");
const StatsHandler = require("../api/handlers/stats.js");
const RelayHandler = require("../api/handlers/relay.js");

class ApiRouter {
  constructor() {
    this.router = express.Router();
    this.setupRoutes();
  }

  /**
   * Setup API routes
   */
  setupRoutes() {
    // Authentication endpoints
    this.router.post("/login", AuthHandler.login);

    // Health check endpoint
    this.router.get("/health", HealthHandler.check);

    // Server info endpoint
    this.router.get("/info", InfoHandler.getServerInfo);

    // Stream management endpoints
    this.router.get("/streams", StreamsHandler.getStreams);
    this.router.get("/streams/:app/:name", StreamsHandler.getStreamInfo);

    // Session management endpoints
    this.router.get("/sessions", SessionsHandler.getSessions);
    this.router.delete("/sessions/:id", SessionsHandler.deleteSession);

    // Statistics endpoint
    this.router.get("/stats", StatsHandler.getStats);

    // Relay (RTSP pull) management — single endpoint, HTTP method distinguishes operation
    this.router.get("/relay", RelayHandler.listTasks);
    this.router.get("/relay/:streamPath", RelayHandler.getTaskStatus);
    this.router.post("/relay", RelayHandler.addPull);
    this.router.delete("/relay", RelayHandler.removePull);
  }
}

module.exports = ApiRouter;