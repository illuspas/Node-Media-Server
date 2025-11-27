// @ts-check
//
//  Created by Chen Mingliang on 24/11/27.
//  illuspas@msn.com
//  Copyright (c) 2024 NodeMedia. All rights reserved.
//

const express = require("express");

// Import handlers
const HealthHandler = require("./handlers/health.js");
const InfoHandler = require("./handlers/info.js");
const StreamsHandler = require("./handlers/streams.js");
const SessionsHandler = require("./handlers/sessions.js");
const StatsHandler = require("./handlers/stats.js");

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
    this.router.get("/health", HealthHandler.check);

    // Server info endpoint
    this.router.get("/info", InfoHandler.getServerInfo);

    // Stream management endpoints
    this.router.get("/streams", StreamsHandler.getStreams);
    this.router.get("/streams/:app/:name", StreamsHandler.getStreamInfo);

    // Session management endpoints
    this.router.get("/sessions", SessionsHandler.getSessions);

    // Statistics endpoint
    this.router.get("/stats", StatsHandler.getStats);
  }
}

module.exports = ApiRouter;