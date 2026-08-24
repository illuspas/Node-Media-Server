// @ts-check
//
//  Login rate limiting middleware (per IP)
//

const { rateLimit } = require("express-rate-limit");

/**
 * Limit POST /api/v1/login attempts per IP to slow brute-force attacks,
 * including distributed ones that rotate target accounts.
 */
const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    data: {},
    message: "Too many login requests, please try again later"
  }
});

module.exports = { loginLimiter };
