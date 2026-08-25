// @ts-check
//
//  Created by Chen Mingliang on 26/08/24.
//  illuspas@msn.com
//  Copyright (c) 2026 NodeMedia. All rights reserved.
//

const fs = require("fs");
const net = require("net");
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
  ["record", "auto"],
  ["auth", "play"],
  ["auth", "publish"],
  ["auth", "secret"],
  ["rtmp", "port"],
  ["rtmps", "port"], ["rtmps", "key"], ["rtmps", "cert"],
  ["http", "port"],
  ["https", "port"], ["https", "key"], ["https", "cert"]
];

/** @typedef {function(any, string): string|null} FieldValidator */

/**
 * Per-field validators. Each returns an error message, or null when valid.
 * Values are validated as-is; trimming happens only after validation passes.
 * @type {Record<string, FieldValidator>}
 */
const FIELD_VALIDATORS = {
  "bind": (v, p) => {
    if (typeof v !== "string" || v.trim() === "") return `${p} must be a non-empty IP or hostname`;
    if (net.isIP(v) === 0 && !/^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?$/.test(v.trim())) {
      return `${p} must be a valid IP address or hostname`;
    }
    return null;
  },
  "notify.url": (v, p) => {
    if (typeof v !== "string") return `${p} must be a string`;
    if (v.trim() === "") return null; // empty disables notifications
    try {
      const u = new URL(v.trim());
      if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("bad protocol");
    } catch {
      return `${p} must be a valid http(s) URL or empty`;
    }
    return null;
  },
  "store.path": (v, p) =>
    typeof v === "string" && v.trim() !== "" ? null : `${p} must be a non-empty path`,
  "record.path": (v, p) =>
    typeof v === "string" && v.trim() !== "" ? null : `${p} must be a non-empty path`,
  "record.auto": (v, p) =>
    typeof v === "boolean" ? null : `${p} must be a boolean (false = record manually only)`,
  "store.maxHistory": (v, p) =>
    Number.isInteger(v) && v >= 1 && v <= 100000000 ? null : `${p} must be an integer between 1 and 100000000`,
  "auth.play": v => (typeof v === "boolean" ? null : "auth.play must be a boolean"),
  "auth.publish": v => (typeof v === "boolean" ? null : "auth.publish must be a boolean"),
  "auth.secret": (v, p) => {
    if (typeof v !== "string") return `${p} must be a string`;
    if (v.includes(" ") || v.includes("\t") || v.includes("\n")) return `${p} must not contain whitespace`;
    return null;
  },
  "rtmp.port": null,
  "rtmps.port": null,
  "http.port": null,
  "https.port": null,
  "rtmps.key": null, "rtmps.cert": null,
  "https.key": null, "https.cert": null
};

// Port and TLS file-path fields share the same validators.
for (const key of ["rtmp.port", "rtmps.port", "http.port", "https.port"]) {
  FIELD_VALIDATORS[key] = (v, p) =>
    Number.isInteger(v) && v >= 1 && v <= 65535 ? null : `${p} must be an integer between 1 and 65535`;
}
for (const key of ["rtmps.key", "rtmps.cert", "https.key", "https.cert"]) {
  FIELD_VALIDATORS[key] = (v, p) =>
    typeof v === "string" ? null : `${p} must be a file path string`;
}

/** Read a dotted path ("rtmp.port") from a nested object. */
function getPath(obj, path) {
  let node = obj;
  for (const key of path) {
    if (node === undefined || node === null || typeof node !== "object") return undefined;
    node = node[key];
  }
  return node;
}

/** Write a dotted path into a nested object, creating intermediate objects. */
function setPath(obj, path, value) {
  let node = obj;
  for (let i = 0; i < path.length - 1; i++) {
    if (typeof node[path[i]] !== "object" || node[path[i]] === null) {
      node[path[i]] = {};
    }
    node = node[path[i]];
  }
  node[path[path.length - 1]] = value;
}

/**
 * Cross-field rules checked against the merged configuration after the
 * patch is applied. Returns a list of error messages.
 * @param {object} config - merged Context.config
 * @returns {Array<string>}
 */
function crossFieldErrors(config) {
  const errors = [];
  if ((config.auth?.play || config.auth?.publish) && !String(config.auth?.secret ?? "").trim()) {
    errors.push("auth.secret must be non-empty when auth.play or auth.publish is enabled");
  }
  for (const tls of ["rtmps", "https"]) {
    if (config[tls]?.port && (String(config[tls].key ?? "").trim() === "" || String(config[tls].cert ?? "").trim() === "")) {
      errors.push(`${tls}.key and ${tls}.cert must be non-empty when ${tls}.port is set`);
    }
  }
  return errors;
}

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
      const value = getPath(Context.config, path);
      if (value !== undefined) {
        setPath(data, path, value);
      }
    }
    res.json({ success: true, data });
  };

  /**
   * Validate and apply a configuration patch, then persist to the config file.
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

      // Collect the patch fields that fall inside the editable whitelist.
      const applied = [];
      for (const path of EDITABLE_PATHS) {
        const dotted = path.join(".");
        const value = getPath(patch, path);
        if (value === undefined) continue;

        const validator = FIELD_VALIDATORS[dotted];
        const error = typeof validator === "function" ? validator(value, dotted) : `Field ${dotted} is not editable`;
        if (error) {
          res.status(400).json({ success: false, error });
          return;
        }
        applied.push([path, typeof value === "string" ? value.trim() : value]);
      }

      if (applied.length === 0) {
        res.status(400).json({ success: false, error: "No editable config fields in request body" });
        return;
      }

      // Apply onto a clone first so cross-field validation can never leave a
      // half-written Context.config behind on rejection.
      const merged = structuredClone(Context.config);
      for (const [path, value] of applied) {
        setPath(merged, path, value);
      }

      const crossErrors = crossFieldErrors(merged);
      if (crossErrors.length > 0) {
        res.status(400).json({ success: false, error: crossErrors.join("; ") });
        return;
      }

      Context.config = merged;
      const appliedKeys = applied.map(([path]) => path.join("."));

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
        data: { updated: appliedKeys },
        message: "Config saved. Port and path changes take effect after restart."
      });
      logger.info(`API: Updated config fields: ${appliedKeys.join(", ")}`);
    } catch (error) {
      logger.error(`API: Update config failed: ${error.message}`);
      res.status(500).json({ success: false, error: error.message });
    }
  };
}

module.exports = ConfigHandler;
