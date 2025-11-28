#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// Load and process config
const configPath = path.join(__dirname, "./config.json");
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

// Check and replace default admin password
let passwordChanged = false;
if (config.auth?.jwt?.users) {
  config.auth.jwt.users = config.auth.jwt.users.map(user => {
    if (user.username === "admin" && user.password === "admin-default-password-change-me") {
      const newPassword = generateRandomPassword(16);
      console.log(`🔒 Security: Replacing default admin password with: ${newPassword}`);
      user.password = newPassword;
      passwordChanged = true;
    }
    return user;
  });

  // Write updated config back to file if password was changed
  if (passwordChanged) {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 4));
    console.log("✅ Config updated with new admin password");
  }
}

const NodeMediaServer = require("..");

if (config.rtmps?.key && !fs.existsSync(config.rtmps.key)) {
  config.rtmps.key = path.join(__dirname, config.rtmps.key);

}
if (config.rtmps?.cert && !fs.existsSync(config.rtmps.cert)) {
  config.rtmps.cert = path.join(__dirname, config.rtmps.cert);
}

if (config.https?.key && !fs.existsSync(config.https.key)) {
  config.https.key = path.join(__dirname, config.https.key);

}
if (config.https?.cert && !fs.existsSync(config.https.cert)) {
  config.https.cert = path.join(__dirname, config.https.cert);
}

const nms = new NodeMediaServer(config);
nms.run(); 