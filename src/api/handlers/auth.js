// @ts-check
//
//  Authentication handlers
//  Username/password login and JWT token management
//

const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const fs = require("fs");
const Context = require("../../core/context.js");
const logger = require("../../core/logger.js");
const { isHashed, hashPassword, verifyPassword } = require("./password_hash.js");

/** @type {number} Consecutive failures before an account+IP pair is locked */
const MAX_FAILED_ATTEMPTS = 5;

/** @type {number} Lock duration in milliseconds */
const LOCKOUT_MS = 15 * 60 * 1000;

/** @type {number} Cleanup interval in milliseconds */
const CLEANUP_INTERVAL = 300000;

class AuthHandler {
  /**
   * Failed login attempts: `${username}|${ip}` → { count, lockedUntil }
   * @type {Map<string, {count: number, lockedUntil: number}>}
   */
  static failedAttempts = new Map();

  /**
   * Whether login attempts from this IP for this username are locked out
   * @param {string} username - Account name
   * @param {string} ip - Client IP
   * @returns {boolean} True while locked out
   */
  static isLocked(username, ip) {
    const entry = AuthHandler.failedAttempts.get(`${username}|${ip}`);
    return Boolean(entry?.lockedUntil && Date.now() < entry.lockedUntil);
  }

  /**
   * Record a failed attempt; lock the pair after MAX_FAILED_ATTEMPTS
   * @param {string} username - Account name
   * @param {string} ip - Client IP
   * @returns {void}
   */
  static recordFailure(username, ip) {
    const key = `${username}|${ip}`;
    const entry = AuthHandler.failedAttempts.get(key) ?? { count: 0, lockedUntil: 0 };
    entry.count += 1;
    if (entry.count >= MAX_FAILED_ATTEMPTS) {
      entry.lockedUntil = Date.now() + LOCKOUT_MS;
      entry.count = 0;
      logger.warn(`API: Login for user ${username} from ${ip} locked for 15 minutes after repeated failures`);
    }
    AuthHandler.failedAttempts.set(key, entry);
  }

  /**
   * Clear failure state after a successful login
   * @param {string} username - Account name
   * @param {string} ip - Client IP
   * @returns {void}
   */
  static clearFailures(username, ip) {
    AuthHandler.failedAttempts.delete(`${username}|${ip}`);
  }

  /**
   * Purge expired lockout entries from memory
   * @returns {void}
   */
  static cleanupFailures() {
    const now = Date.now();
    for (const [key, entry] of AuthHandler.failedAttempts) {
      if (entry.lockedUntil && now > entry.lockedUntil) {
        AuthHandler.failedAttempts.delete(key);
      }
    }
  }
  /**
   * Single-step username/password login.
   * body: { username, password } => { success, data: { token } }
   * Passwords are stored as scrypt hashes; legacy plaintext entries are
   * migrated transparently on successful login.
   * @param {import('express').Request} req - Express request
   * @param {import('express').Response} res - Express response
   * @returns {import('express').Response<any, Record<string, any>>}
   */
  static login(req, res) {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        return res.status(400).json({
          success: false,
          data: {},
          message: "Username and password are required"
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

      const ip = req.ip || req.socket?.remoteAddress || "unknown";
      if (AuthHandler.isLocked(username, ip)) {
        return res.status(429).json({
          success: false,
          data: {},
          message: "Too many failed login attempts, please try again later"
        });
      }

      const user = jwtConfig.users.find(u => u.username === username);
      if (!user) {
        AuthHandler.recordFailure(username, ip);
        return res.status(401).json({
          success: false,
          data: {},
          message: "Invalid username or password"
        });
      }

      if (!isHashed(user.password)) {
        // Legacy plaintext entry: compare directly, then upgrade to a hash
        const expected = Buffer.from(String(user.password));
        const given = Buffer.from(String(password));
        const match = expected.length === given.length && crypto.timingSafeEqual(expected, given);
        if (!match) {
          AuthHandler.recordFailure(username, ip);
          return res.status(401).json({
            success: false,
            data: {},
            message: "Invalid username or password"
          });
        }
        AuthHandler.migratePassword(user);
      } else if (!verifyPassword(password, user.password)) {
        AuthHandler.recordFailure(username, ip);
        return res.status(401).json({
          success: false,
          data: {},
          message: "Invalid username or password"
        });
      }

      AuthHandler.clearFailures(username, ip);

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
   * Upgrade a user's plaintext password to a scrypt hash and persist it
   * when Context.configFile is set (CLI mode).
   * @param {{username: string, password: string}} user - Config user entry
   */
  static migratePassword(user) {
    const plain = String(user.password);
    user.password = hashPassword(plain);
    logger.info(`API: Password storage for user ${user.username} upgraded to scrypt hash`);
    if (Context.configFile) {
      try {
        fs.writeFileSync(Context.configFile, JSON.stringify(Context.config, null, 4));
      } catch (error) {
        logger.error(`Persist config failed: ${error.message}`);
      }
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

      // 400 (not 401): the JWT is valid; a wrong old password is a body
      // validation error, and 401 would trigger the client's global
      // session-expiry handling and kick the user to the login page.
      const oldMatches = isHashed(user.password)
        ? verifyPassword(oldPassword, user.password)
        : String(oldPassword) === String(user.password);
      if (!oldMatches) {
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

      user.password = hashPassword(newPassword);

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

// Periodically purge expired lockouts
setInterval(() => AuthHandler.cleanupFailures(), CLEANUP_INTERVAL).unref();

module.exports = AuthHandler;
