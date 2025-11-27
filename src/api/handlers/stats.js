// @ts-check
//
//  Created by Chen Mingliang on 24/11/27.
//  illuspas@msn.com
//  Copyright (c) 2024 NodeMedia. All rights reserved.
//

const logger = require("../../core/logger.js");
const Context = require("../../core/context.js");

class StatsHandler {
  /**
   * Get server statistics
   * @param {express.Request} req
   * @param {express.Response} res
   */
  static getStats(req, res) {
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
      logger.error("Error getting stats:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
}

module.exports = StatsHandler;