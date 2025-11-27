// @ts-check
//
//  Created by Chen Mingliang on 24/11/27.
//  illuspas@msn.com
//  Copyright (c) 2024 NodeMedia. All rights reserved.
//

const logger = require("../../core/logger.js");

class HealthHandler {
  /**
   * Health check endpoint
   * @param {express.Request} req
   * @param {express.Response} res
   */
  static check(req, res) {
    try {
      res.json({
        status: "ok",
        timestamp: new Date().toISOString(),
        version: require("../../../package.json").version
      });
    } catch (error) {
      logger.error("Health check error:", error);
      res.status(500).json({
        status: "error",
        message: "Health check failed"
      });
    }
  }
}

module.exports = HealthHandler;