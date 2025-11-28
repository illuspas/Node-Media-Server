// Authentication handlers
// Login and JWT token management
//

const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const Context = require("../../core/context.js");

/**
 * Create MD5 hash of password
 * @param password
 */
const createMD5Hash = (password) => {
  return crypto.createHash("md5").update(password).digest("hex");
};

/**
 * Handle user login
 * Returns JWT token for authenticated users
 * Supports password or MD5 hash for security
 * @param req
 * @param res
 */
const login = async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validate input
    if (!username || !password ) {
      return res.status(400).json({
        success: false,
        error: "Username and password are required",
        code: "INVALID_CREDENTIALS"
      });
    }

    // Find user in configuration
    const jwtConfig = Context.config.jwt;
    if (!jwtConfig || !jwtConfig.users) {
      return res.status(500).json({
        success: false,
        error: "JWT configuration not found",
        code: "CONFIG_ERROR"
      });
    }

    const user = jwtConfig.users.find(u => u.username === username);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: "Invalid username or password",
        code: "INVALID_CREDENTIALS"
      });
    }

    // Support both plain password and MD5 hash verification
    const storedPasswordHash = createMD5Hash(user.password);

    // Client provided plain password, direct comparison
    if (storedPasswordHash !== password) {
      return res.status(401).json({
        success: false,
        error: "Invalid username or password",
        code: "INVALID_CREDENTIALS"
      });
    }
    
    // For security, recommend using HTTPS for password transmission
    if (req.protocol === "http" && process.env.NODE_ENV === "production") {
      console.warn(`[SECURITY WARNING] Password transmitted over HTTP for user ${username}`);
    }

    // Generate JWT secret from user password hash
    const jwtSecret = crypto.createHash("sha256").update(user.password).digest("hex");

    // Generate JWT token
    const token = jwt.sign(
      {
        username: user.username
      },
      jwtSecret, // Use password hash as JWT secret
      {
        expiresIn: jwtConfig.expiresIn || "24h",
        algorithm: jwtConfig.algorithm || "HS256"
      }
    );

    // Return success response with token
    res.json({
      success: true,
      data: {
        token,
        user: {
          username: user.username
        },
        expiresIn: jwtConfig.expiresIn || "24h"
      },
      message: "Login successful"
    });

  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error during login",
      code: "SERVER_ERROR"
    });
  }
};

module.exports = {
  login
};