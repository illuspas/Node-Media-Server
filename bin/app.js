#!/usr/bin/env node
// @ts-check
//
//  Created by Chen Mingliang on 24/11/28.
//  illuspas@msn.com
//  Copyright (c) 2024 NodeMedia. All rights reserved.
//

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { parseArgs } = require("util");
const NodeMediaServer = require("..");

/**
 * Print command line usage
 * @returns {void}
 */
function printUsage() {
  console.log(`Usage: node bin/app.js [options]

Options:
  -c, --config <path>    Path to the config file (default: bin/config.json)
  -b, --bind <addr>      Bind address, overrides the "bind" config value
      --rtmp-port <n>    RTMP port, overrides rtmp.port
      --rtmps-port <n>   RTMPS port, overrides rtmps.port
      --http-port <n>    HTTP/WebSocket port, overrides http.port
      --https-port <n>   HTTPS/WSS port, overrides https.port
      --data-path <path> Runtime data directory, overrides store.path
      --record-path <p>  Record output directory, overrides record.path
      --record-auto      Enable auto recording, forces record.auto on
      --notify-url <url> Event webhook URL, overrides notify.url
      --auth-play        Enable play authentication, forces auth.play on
      --auth-publish     Enable publish authentication, forces auth.publish on
      --no-admin         Disable the webadmin console (/admin), media only
  -h, --help             Show this help

Command line values take precedence over config file values and are
never written back to the config file.`);
}

/**
 * Convert a command line port value to a validated port number
 * @param {string} name - Option name, used in error messages
 * @param {string} value - Raw value from the command line
 * @returns {number} - The validated port number
 */
function parsePort(name, value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error(`Invalid ${name}: "${value}" (expected an integer between 1 and 65535)`);
    process.exit(1);
  }
  return port;
}

let cli;
try {
  ({ values: cli } = parseArgs({
    options: {
      config: { type: "string", short: "c" },
      bind: { type: "string", short: "b" },
      "rtmp-port": { type: "string" },
      "rtmps-port": { type: "string" },
      "http-port": { type: "string" },
      "https-port": { type: "string" },
      "data-path": { type: "string" },
      "record-path": { type: "string" },
      "record-auto": { type: "boolean" },
      "notify-url": { type: "string" },
      "auth-play": { type: "boolean" },
      "auth-publish": { type: "boolean" },
      "no-admin": { type: "boolean" },
      help: { type: "boolean", short: "h" }
    },
    strict: true
  }));
} catch (error) {
  console.error(`Invalid command line arguments: ${error.message}`);
  printUsage();
  process.exit(1);
}

if (cli.help) {
  printUsage();
  process.exit(0);
}

// Validate CLI values before loading the config so that invalid arguments
// can never trigger the first-run password/JWT migration write-back.
if (cli["rtmp-port"]) {
  parsePort("--rtmp-port", cli["rtmp-port"]);
}
if (cli["rtmps-port"]) {
  parsePort("--rtmps-port", cli["rtmps-port"]);
}
if (cli["http-port"]) {
  parsePort("--http-port", cli["http-port"]);
}
if (cli["https-port"]) {
  parsePort("--https-port", cli["https-port"]);
}
if (cli["notify-url"]) {
  try {
    new URL(cli["notify-url"]);
  } catch {
    console.error(`Invalid --notify-url: "${cli["notify-url"]}" (expected an absolute URL, e.g. http://127.0.0.1:3000/on_event)`);
    process.exit(1);
  }
}

// Load and process config
const configPath = path.resolve(cli.config ?? path.join(__dirname, "./config.json"));
const configDir = path.dirname(configPath);
let config = JSON.parse(fs.readFileSync(configPath, "utf8"));

// Function to generate random 8-character password
/**
 * Generate a random password
 * @param {number} length - The length of the password to generate. Defaults to 16.
 * @returns {string} - The generated password.
 */
function generateRandomPassword(length = 16) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

let configChanged = false;

const { isHashed, hashPassword } = require("../src/api/handlers/password_hash.js");

// Check and replace default admin password, and migrate plaintext
// passwords to scrypt hashes
if (config.auth?.jwt?.users) {
  config.auth.jwt.users = config.auth.jwt.users.map(user => {
    if (user.username === "admin" && (user.password === "admin-default-password-change-me" || user.password === "")) {
      const newPassword = generateRandomPassword(16);
      console.log("\n============================================================");
      console.log("IMPORTANT: A new admin password has been generated.");
      console.log("Username: admin");
      console.log(`Password: ${newPassword}`);
      console.log("Save this password now. It will not be shown again.");
      console.log("============================================================\n");
      user.password = hashPassword(newPassword);
      configChanged = true;
    } else if (user.password && !isHashed(user.password)) {
      console.log(`🔒 Security: Upgrading password storage for user ${user.username} to scrypt hash`);
      user.password = hashPassword(user.password);
      configChanged = true;
    }
    return user;
  });
}

// Generate an auth secret only when left empty; an explicit value, including
// the legacy default, is respected and left untouched
if (config.auth && !config.auth.secret) {
  config.auth.secret = crypto.randomBytes(16).toString("hex");
  console.log("🔒 Security: Generated new auth secret for signed play/publish URLs:");
  console.log(`   Auth Secret: ${config.auth.secret}`);
  console.log("   It is also stored in the config file, share it with streaming clients.");
  configChanged = true;
}

// Auto-generate JWT secret if not configured
if (config.auth?.jwt) {
  if (!config.auth.jwt.secret) {
    config.auth.jwt.secret = crypto.randomBytes(32).toString("hex");
    console.log("🔒 Security: Generated new JWT secret");
    configChanged = true;
  }
}

// Write updated config back to file if changed
if (configChanged) {
  fs.writeFileSync(configPath, JSON.stringify(config, null, 4));
  console.log("✅ Config updated");
}

// Apply command line overrides after the config write-back so that CLI
// values stay ephemeral and are never persisted to the config file.
if (cli.bind) {
  config.bind = cli.bind;
}
if (cli["rtmp-port"]) {
  config.rtmp = config.rtmp ?? {};
  config.rtmp.port = parsePort("--rtmp-port", cli["rtmp-port"]);
}
if (cli["rtmps-port"]) {
  config.rtmps = config.rtmps ?? {};
  config.rtmps.port = parsePort("--rtmps-port", cli["rtmps-port"]);
}
if (cli["http-port"]) {
  config.http = config.http ?? {};
  config.http.port = parsePort("--http-port", cli["http-port"]);
}
if (cli["https-port"]) {
  config.https = config.https ?? {};
  config.https.port = parsePort("--https-port", cli["https-port"]);
}
// CLI path values resolve against the current working directory, unlike
// config file values which resolve against the config file's directory.
if (cli["data-path"]) {
  config.store = config.store ?? {};
  config.store.path = path.resolve(cli["data-path"]);
}
if (cli["record-path"]) {
  config.record = config.record ?? {};
  config.record.path = path.resolve(cli["record-path"]);
}
if (cli["record-auto"]) {
  config.record = config.record ?? {};
  config.record.auto = true;
}
if (cli["notify-url"]) {
  config.notify = config.notify ?? {};
  config.notify.url = cli["notify-url"];
}
if (cli["auth-play"] || cli["auth-publish"]) {
  config.auth = config.auth ?? {};
  if (cli["auth-play"]) {
    config.auth.play = true;
  }
  if (cli["auth-publish"]) {
    config.auth.publish = true;
  }
  if (!config.auth.secret) {
    console.warn("⚠️  auth.play/auth.publish enabled but auth.secret is empty, signed URL authentication will reject requests");
  }
}
if (cli["no-admin"]) {
  config.webadmin = config.webadmin ?? {};
  config.webadmin.enable = false;
}

// Resolve runtime data paths relative to the directory containing the config.
// Keep the configured values relative so config.json remains portable.
if (config.store?.path) {
  config.store.path = path.resolve(configDir, config.store.path);
}
if (config.record?.path) {
  config.record.path = path.resolve(configDir, config.record.path);
}

if (config.rtmps?.key && !fs.existsSync(config.rtmps.key)) {
  config.rtmps.key = path.join(configDir, config.rtmps.key);

}
if (config.rtmps?.cert && !fs.existsSync(config.rtmps.cert)) {
  config.rtmps.cert = path.join(configDir, config.rtmps.cert);
}

if (config.https?.key && !fs.existsSync(config.https.key)) {
  config.https.key = path.join(configDir, config.https.key);

}
if (config.https?.cert && !fs.existsSync(config.https.cert)) {
  config.https.cert = path.join(configDir, config.https.cert);
}

const nms = new NodeMediaServer(config, configPath);
nms.run();
