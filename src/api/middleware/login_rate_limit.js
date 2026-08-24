// @ts-check
//
//  Login rate limiting middleware factory (per IP)
//

const { rateLimit } = require("express-rate-limit");

/**
 * Create a limiter for POST /api/v1/login attempts per IP to slow
 * brute-force attacks, including distributed ones that rotate target
 * accounts. A factory keeps each server instance (and each test) isolated.
 * @returns {import("express-rate-limit").RateLimitRequestHandler}
 */
function createLoginLimiter() {
  return rateLimit({
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
}

module.exports = { createLoginLimiter };
