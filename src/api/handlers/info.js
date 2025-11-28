// @ts-check
//
//  Created by Chen Mingliang on 24/11/27.
//  illuspas@msn.com
//  Copyright (c) 2024 NodeMedia. All rights reserved.
//

const logger = require("../../core/logger.js");
const Context = require("../../core/context.js");
const packageInfo = require("../../../package.json");
      
class InfoHandler {
  /**
   * Get server information
   * @param {express.Request} req
   * @param {express.Response} res
   */
  static getServerInfo(req, res) {
    try {
      const config = Context.config;


      const serverInfo = {
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
      };

      res.json({
        success: true,
        data: serverInfo,
        message: "Server information retrieved successfully"
      });
    } catch (error) {
      logger.error("Error getting server info:", error);
      res.status(500).json({
        success: false,
        data: {},
        message: "Internal server error"
      });
    }
  }
}

module.exports = InfoHandler;