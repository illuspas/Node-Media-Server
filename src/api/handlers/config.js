// @ts-check
//
//  Created by Chen Mingliang on 26/08/24.
//  illuspas@msn.com
//  Copyright (c) 2026 NodeMedia. All rights reserved.
//

const fs = require("fs");
const logger = require("../../core/logger.js");
const Context = require("../../core/context.js");

// Config paths the API is allowed to read and write. auth.jwt.* (users,
// secrets, token expiry) is managed by /login and /password and is excluded.
const EDITABLE_PATHS = [
  ["bind"],
  ["notify", "url"],
  ["store", "path"],
  ["store", "maxHistory"],
  ["record", "path"],
  ["auth", "play"],
  ["auth", "publish"],
  ["auth", "secret"],
  ["rtmp", "port"],
  ["rtmps", "port"], ["rtmps", "key"], ["rtmps", "cert"],
  ["http", "port"],
  ["https", "port"], ["https", "key"], ["https", "cert"]
];

/**
 * Config API Handler — read and update config.json from the admin console.
 * Changes are written back to the config file when the server was started
 * from the CLI; port / path changes take effect after a restart.
 * @class
 */
class ConfigHandler {
  /**
   * Get the current configuration (editable subset only).
   * GET /api/v1/config
   * @param {express.Request} req
   * @param {express.Response} res
   */
  static getConfig = (req, res) => {
    const data = {};
    for (const path of EDITABLE_PATHS) {
      let node = Context.config;
      let target = data;
      let ok = true;
      for (let i = 0; i < path.length - 1; i++) {
        const key = path[i];
        if (node[key] === undefined) { ok = false; break; }
        node = node[key];
        target[key] = target[key] || {};
        target = target[key];
      }
      const leaf = path[path.length - 1];
      if (ok && node[leaf] !== undefined) {
        target[leaf] = node[leaf];
      }
    }
    res.json({ success: true, data });
  };

  /**
   * Update configuration fields and persist to the config file.
   * PUT /api/v1/config
   * Body: partial config object, e.g. { rtmp: { port: 1936 } }
   * @param {express.Request} req
   * @param {express.Response} res
   */
  static updateConfig = (req, res) => {
    try {
      const patch = req.body;
      if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
        res.status(400).json({ success: false, error: "Request body must be a config object" });
        return;
      }

      const applied = [];
      for (const path of EDITABLE_PATHS) {
        let source = patch;
        let ok = true;
        for (const key of path) {
          if (source === undefined || source === null || typeof source !== "object") { ok = false; break; }
          source = source[key];
        }
        if (!ok || source === undefined) continue;

        const value = source;
        const leaf = path[path.length - 1];
        let node = Context.config;
        for (let i = 0; i < path.length - 1; i++) {
          if (typeof node[path[i]] !== "object" || node[path[i]] === null) {
            node[path[i]] = {};
          }
          node = node[path[i]];
        }
        node[leaf] = value;
        applied.push(path.join("."));
      }

      if (applied.length === 0) {
        res.status(400).json({ success: false, error: "No editable config fields in request body" });
        return;
      }

      if (Context.configFile) {
        try {
          fs.writeFileSync(Context.configFile, JSON.stringify(Context.config, null, 4));
        } catch (error) {
          logger.error(`API: Write config file failed: ${error.message}`);
          res.status(500).json({ success: false, error: "Failed to write config file" });
          return;
        }
      } else {
        logger.warn("API: configFile not set; config update is in-memory only and will be lost on restart");
      }

      res.json({
        success: true,
        data: { updated: applied },
        message: "Config saved. Port and path changes take effect after restart."
      });
      logger.info(`API: Updated config fields: ${applied.join(", ")}`);
    } catch (error) {
      logger.error(`API: Update config failed: ${error.message}`);
      res.status(500).json({ success: false, error: error.message });
    }
  };
}

module.exports = ConfigHandler;
