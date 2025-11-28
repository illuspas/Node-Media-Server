// @ts-check
//
// Authentication handlers
// Login and JWT token management
//

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const Context = require('../../core/context.js');

/**
 * Handle user login
 * Returns JWT token for authenticated users
 */
const login = async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validate input
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Username and password are required',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Find user in configuration
    const jwtConfig = Context.config.jwt;
    if (!jwtConfig || !jwtConfig.users) {
      return res.status(500).json({
        success: false,
        error: 'JWT configuration not found',
        code: 'CONFIG_ERROR'
      });
    }

    const user = jwtConfig.users.find(u => u.username === username);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid username or password',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // For security, recommend using HTTPS for password transmission
    // In production, passwords should be transmitted over encrypted connections

    // Verify password (direct comparison for now, can be enhanced to use bcrypt)
    if (user.password !== password) {
      return res.status(401).json({
        success: false,
        error: 'Invalid username or password',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Generate JWT secret from user password hash
    const passwordHash = crypto.createHash('sha256').update(user.password).digest('hex');

    // Generate JWT token
    const token = jwt.sign(
      {
        username: user.username
      },
      passwordHash, // Use password hash as JWT secret
      {
        expiresIn: jwtConfig.expiresIn || '24h',
        algorithm: jwtConfig.algorithm || 'HS256'
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
        expiresIn: jwtConfig.expiresIn || '24h'
      },
      message: 'Login successful'
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error during login',
      code: 'SERVER_ERROR'
    });
  }
};

module.exports = {
  login
};