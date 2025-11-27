// @ts-check
//
//  Created by Chen Mingliang on 24/11/27.
//  illuspas@msn.com
//  Copyright (c) 2024 NodeMedia. All rights reserved.
//

const logger = require("../../core/logger.js");
const Context = require("../../core/context.js");

class SessionsHandler {
  /**
   * Get all active sessions
   * @param {express.Request} req
   * @param {express.Response} res
   */
  static getSessions(req, res) {
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
}

module.exports = SessionsHandler;