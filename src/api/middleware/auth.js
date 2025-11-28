// @ts-check
//
// JWT Authentication Middleware
// Protects API routes with JWT authentication
//

const { expressjwt: jwt } = require("express-jwt");
const crypto = require("crypto");
const Context = require("../../core/context.js");

/**
 * Create JWT middleware configuration on-demand
 */
const getJwtConfig = () => {
  const jwtConfig = Context.config.auth.jwt;
  
  // If no JWT config is provided, use password hash of first user as secret
  let secret = "default-secret-change-me";
  if (jwtConfig?.users?.length > 0) {
    const firstUser = jwtConfig.users[0];
    secret = crypto.createHash("sha256").update(firstUser.password).digest("hex");
  }

  return {
    secret: secret,
    algorithms: [jwtConfig?.algorithm || "HS256"],
    requestProperty: "auth",
    getToken: function fromHeaderOrQuerystring(req) {
      if (req.headers.authorization && req.headers.authorization.split(" ")[0] === "Bearer") {
        return req.headers.authorization.split(" ")[1];
      }
      if (req.query && req.query.token) {
        return req.query.token;
      }
      return null;
    }
  };
};

/**
 * JWT authentication middleware with path exclusions
 * @param req
 * @param res
 * @param next
 */
const jwtAuthMiddleware = (req, res, next) => {
  // Skip authentication for health check and login endpoints
  const skipPaths = ["/health", "/login"];
  if (skipPaths.includes(req.path)) {
    return next();
  }

  const jwtConfig = getJwtConfig();
  const jwtAuth = jwt(jwtConfig);
  return jwtAuth(req, res, next);
};

/**
 * Error handling middleware for JWT errors
 * @param err
 * @param req
 * @param res
 * @param next
 */
const jwtErrorHandler = (err, req, res, next) => {
  if (err.name === "UnauthorizedError") {
    return res.status(401).json({
      success: false,
      error: "Invalid or missing authentication token",
      code: "UNAUTHORIZED"
    });
  }
  next(err);
};

module.exports = {
  jwtAuth: jwtAuthMiddleware,
  jwtErrorHandler
};