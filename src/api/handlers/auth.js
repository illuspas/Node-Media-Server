// @ts-check
//
//  Authentication handlers
//  Challenge-response login and JWT token management
//

const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const fs = require("fs");
const Context = require("../../core/context.js");
const logger = require("../../core/logger.js");

/** @type {number} Challenge validity window in milliseconds */
const CHALLENGE_TTL = 60000;

/** @type {number} Cleanup interval in milliseconds */
const CLEANUP_INTERVAL = 120000;

class AuthHandler {
  /**
   * Pending challenges: username → { challenge, expiresAt }
   * @type {Map<string, {challenge: string, expiresAt: number}>}
   */
  static pendingChallenges = new Map();

  /**
   * Compute HMAC-SHA256 of challenge using password as key
   * @param {string} password - User's plaintext password
   * @param {string} challenge - Random nonce from server
   * @returns {string} Hex-encoded HMAC digest
   */
  static computeHmac(password, challenge) {
    return crypto.createHmac("sha256", password).update(challenge).digest("hex");
  }

  /**
   * Remove expired challenges from memory
   */
  static cleanupChallenges() {
    const now = Date.now();
    for (const [key, entry] of AuthHandler.pendingChallenges) {
      if (now > entry.expiresAt) {
        AuthHandler.pendingChallenges.delete(key);
      }
    }
  }

  /**
   * Two-step challenge-response login.
   * Step 1 - body: { username } => { success, data: { challenge } }
   * Step 2 - body: { username, challenge, response } => { success, data: { token } }
   * response = HMAC-SHA256(password, challenge)
   * @param {import('express').Request} req - Express request
   * @param {import('express').Response} res - Express response
   * @returns {import('express').Response<any, Record<string, any>>}
   */
  static login(req, res) {
    try {
      const { username, challenge, response } = req.body;

      if (!username) {
        return res.status(400).json({
          success: false,
          data: {},
          message: "Username is required"
        });
      }

      const jwtConfig = Context.config.auth.jwt;
      if (!jwtConfig || !jwtConfig.users) {
        return res.status(500).json({
          success: false,
          data: {},
          message: "JWT configuration not found"
        });
      }

      const user = jwtConfig.users.find(u => u.username === username);
      if (!user) {
        return res.status(401).json({
          success: false,
          data: {},
          message: "Invalid username or password"
        });
      }

      // Step 1: no challenge provided -> issue one
      if (!challenge && !response) {
        const nonce = crypto.randomBytes(32).toString("hex");
        AuthHandler.pendingChallenges.set(username, {
          challenge: nonce,
          expiresAt: Date.now() + CHALLENGE_TTL
        });

        return res.json({
          success: true,
          data: { challenge: nonce },
          message: "Challenge issued"
        });
      }

      // Step 2: verify challenge-response
      if (!challenge || !response) {
        return res.status(400).json({
          success: false,
          data: {},
          message: "Challenge and response are required"
        });
      }

      const pending = AuthHandler.pendingChallenges.get(username);

      if (!pending || pending.challenge !== challenge) {
        return res.status(401).json({
          success: false,
          data: {},
          message: "Invalid or expired challenge"
        });
      }

      if (Date.now() > pending.expiresAt) {
        AuthHandler.pendingChallenges.delete(username);
        return res.status(401).json({
          success: false,
          data: {},
          message: "Challenge expired"
        });
      }

      // Consume the challenge (one-time use)
      AuthHandler.pendingChallenges.delete(username);

      const expected = AuthHandler.computeHmac(user.password, challenge);
      if (!crypto.timingSafeEqual(
        Buffer.from(expected, "hex"),
        Buffer.from(response, "hex")
      )) {
        return res.status(401).json({
          success: false,
          data: {},
          message: "Invalid username or password"
        });
      }

      // Issue JWT
      const jwtSecret = jwtConfig.secret;
      if (!jwtSecret) {
        logger.error("JWT secret not configured");
        return res.status(500).json({
          success: false,
          data: {},
          message: "JWT secret not configured"
        });
      }

      const token = jwt.sign(
        { username: user.username },
        jwtSecret,
        {
          expiresIn: jwtConfig.expiresIn || "24h",
          algorithm: jwtConfig.algorithm || "HS256"
        }
      );

      return res.json({
        success: true,
        data: {
          token,
          user: { username: user.username },
          expiresIn: jwtConfig.expiresIn || "24h"
        },
        message: "Login successful"
      });

    } catch (error) {
      logger.error(`Login error: ${error.message}`);
      return res.status(500).json({
        success: false,
        data: {},
        message: "Internal server error during login"
      });
    }
  }

  /**
   * Change the password of the JWT-authenticated user.
   * POST /api/v1/password — body: { oldPassword, newPassword }
   * Updates the in-memory config and persists it back to the config file
   * when Context.configFile is set (CLI mode).
   * @param {import('express').Request} req - Express request
   * @param {import('express').Response} res - Express response
   * @returns {import('express').Response<any, Record<string, any>>}
   */
  static changePassword(req, res) {
    try {
      const { oldPassword, newPassword } = req.body;

      if (!oldPassword || !newPassword) {
        return res.status(400).json({
          success: false,
          data: {},
          message: "oldPassword and newPassword are required"
        });
      }
      if (String(newPassword).length < 6) {
        return res.status(400).json({
          success: false,
          data: {},
          message: "New password must be at least 6 characters"
        });
      }

      const username = req.auth?.username;
      const jwtConfig = Context.config.auth?.jwt;
      const user = username ? jwtConfig?.users?.find(u => u.username === username) : null;
      if (!user) {
        return res.status(401).json({
          success: false,
          data: {},
          message: "Current user not found"
        });
      }

      // timing-safe compare against the configured password.
      // 400 (not 401): the JWT is valid; a wrong old password is a body
      // validation error, and 401 would trigger the client's global
      // session-expiry handling and kick the user to the login page.
      const expected = Buffer.from(String(user.password));
      const given = Buffer.from(String(oldPassword));
      if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) {
        return res.status(400).json({
          success: false,
          data: {},
          message: "Old password is incorrect"
        });
      }
      if (oldPassword === newPassword) {
        return res.status(400).json({
          success: false,
          data: {},
          message: "New password must be different from the old one"
        });
      }

      user.password = newPassword;

      if (Context.configFile) {
        try {
          fs.writeFileSync(Context.configFile, JSON.stringify(Context.config, null, 4));
        } catch (error) {
          logger.error(`Persist config failed: ${error.message}`);
          return res.status(500).json({
            success: false,
            data: {},
            message: "Password updated in memory but failed to write config file"
          });
        }
      } else {
        logger.warn("configFile not set; password change is in-memory only and will be lost on restart");
      }

      logger.info(`API: Password changed for user ${username}`);
      return res.json({
        success: true,
        data: {},
        message: "Password changed successfully, please log in again"
      });
    } catch (error) {
      logger.error(`Change password error: ${error.message}`);
      return res.status(500).json({
        success: false,
        data: {},
        message: "Internal server error during password change"
      });
    }
  }
}

// Periodically purge expired challenges
setInterval(() => AuthHandler.cleanupChallenges(), CLEANUP_INTERVAL).unref();

module.exports = AuthHandler;
