# Agent Guidelines for Node-Media-Server

This document provides guidelines for agentic coding agents operating in this repository.

## Repository Purpose

Node-Media-Server is a Node.js implementation of an RTMP media server (v4.x), supporting RTMP publish/play, HTTP-FLV, WebSocket-FLV, RTSP/WHIP, recording, relay, and a REST admin API. Requires Node.js >= 20.

### Directory Layout
- `src/index.js` — library entry point; `bin/app.js` — CLI entry point
- `src/core/` — shared kernel: `context.js` (global `Context` singleton holding config and sessions), `logger.js`, `avpacket.js`, `avcodec.js`
- `src/protocol/` — wire-format codecs (rtmp, flv, amf, rtsp, rtp, rtcp, sdp)
- `src/session/` — per-connection sessions, all extending `base_session.js` (rtmp, flv, record, rtsp)
- `src/server/` — TCP/HTTP listeners and managers (rtmp_server, http_server, broadcast_server, record_server, relay_manager, notify_server)
- `src/api/` — express admin API handlers and middleware (JWT auth)
- `docs/` — protocol and design documentation; read before changing media/protocol code

### Architecture Rules
- Sessions are created by servers and registered in `Context.sessions`; servers look up/relay streams via `Context`.
- Protocol parsing (`src/protocol/`) is separate from session state machines (`src/session/`) — keep new wire-format code in `src/protocol/`.
- Config is loaded once into `Context.config`; never read config ad hoc from files at runtime.
- HTTP layer (v4.4.0+): one Express 5 app wrapped by npm `http2-express` (`http2Express(express)` in `src/server/http_server.js`) is shared by two listeners: `http.createServer` (HTTP/1.1 + ws) and `http2.createSecureServer({ allowHTTP1: true })` (h2/h1 + wss). The old vendored shim `src/vendor/http2-express/` is gone — never reintroduce it.
- Express 5 uses path-to-regexp v8: routes must avoid Express 4 legacy syntax (`*` wildcards, optional `:x?` params, regex routes). The FLV catch-all `app.all("/:app/:name.flv", ...)` and `test/http2.test.js` guard this wiring; run both when touching HTTP code.
- FLV sessions (`src/session/flv_session.js`) serve HTTP-FLV and WebSocket-FLV from the same class (`res instanceof WebSocket` branch); the write path is raw `res.write`/`res.end`, framework-independent.

## Build/Lint/Test Commands

### Available Scripts
```bash
# Development mode - runs eslint and starts server
npm run dev

# Production start (loads bin/config.json)
npm start

# Tests: node:test runner, ~72 tests over test/*.test.js
npm test

# Single test file
node --test test/http2.test.js

# Docker image (node:lts-alpine, multi-stage with webadmin build)
docker build -t nms .
```

### Linting
```bash
# Run eslint on all files (flat config, eslint 9; expects 0 errors, ~25 pre-existing jsdoc warnings)
npx eslint

# Fix auto-fixable eslint issues
npx eslint --fix

# Check specific file
npx eslint src/index.js
```

### Type Checking (informational, not wired into CI)
`@types/express` and `@types/node` are devDependencies. Spot-check with:
```bash
npx -y -p typescript tsc --noEmit --allowJs --checkJs --skipLibCheck src/api/handlers/records.js
```
There are known pre-existing findings (~73); do not treat new tsc output as a gate.

### Manual Testing
Automated tests cover the API middleware chain and HTTP wiring. For media-path changes, also smoke-test end to end:

1. **RTMP Stream Testing**:
   ```bash
   # Start server
   npm start

   # Test with ffmpeg
   ffmpeg -re -i input.mp4 -c copy -f flv rtmp://localhost:1935/live/stream
   ffmpeg -i rtmp://localhost:1935/live/stream -c copy output.mp4
   ```

2. **HTTP-FLV / HTTP2-FLV Testing**:
   ```bash
   # HTTP/1.1 pull
   curl http://localhost:8000/live/stream.flv
   # HTTP/2 pull (verify ver=2 in output)
   curl -k --http2 https://localhost:8443/live/stream.flv
   # WebSocket-FLV: ws://localhost:8000/live/stream.flv / wss://localhost:8443/live/stream.flv
   ```

3. **API Testing** (API rides on the HTTP ports, not a separate port):
   ```bash
   # Health check
   curl http://localhost:8000/api/v1/health

   # Login
   curl -X POST http://localhost:8000/api/v1/login \
     -H "Content-Type: application/json" \
     -d '{"username":"admin","password":"your_password"}'
   ```

## Runtime Gotchas

- **`bin/config.json` is mutated at runtime**: on first start, `bin/app.js` generates a random admin password (printed once to stdout) and a JWT secret, then writes them back — running the server dirties the working tree. Back it up before and restore after test runs.
- Login lockout is in-memory (`AuthHandler.failedAttempts`): 5 consecutive failures lock the user+IP pair for 15 minutes; login rate limit is 10/min. Both reset on restart — do lockout/rate-limit tests last in a test session.
- `data/`, `record/`, `logs/`, `.tmp/`, `webadmin/dist` are gitignored runtime/build artifacts; `.tmp/` is the conventional scratch space for agent work.
- The API layer (routes, JWT, rate limit) only activates when `auth.jwt` is configured in `bin/config.json`; TLS needs `key.pem`/`cert.pem` next to it.
- CI (`.github/workflows/npm.yml`) runs on Node 24: `npm ci`, `npm test`; npm publish triggers on `v*` tags via `prepublishOnly` (rebuilds webadmin).

## Code Style Guidelines

### File Headers
All files must include copyright header:
```javascript
// @ts-check
//
//  Created by Chen Mingliang on 24/11/28.
//  illuspas@msn.com
//  Copyright (c) 2024 NodeMedia. All rights reserved.
//
```

### TypeScript Checking
- Use `// @ts-check` at the top of all JavaScript files
- Add JSDoc comments for function parameters and return types
- Use JSDoc types: `{string}`, `{number}`, `{boolean}`, `{object}`, `{Array<string>}`
- For express types, use typedef imports (not `{express.Request}`):
  ```javascript
  /** @typedef {import("express").Request} Request */
  /** @typedef {import("express").Response} Response */
  ```
  `jsdoc/no-undefined-types` flags bare `express.*` types. Closure-style function types (`{function(a): b}`) are not parseable by TypeScript — use the arrow form `{(v: any) => string | null}`.

### Code Formatting
- Use **double quotes** for strings
- Use **semicolons** at end of statements
- Use **2 spaces** for indentation
- Use **camelCase** for variables and functions
- Use **PascalCase** for classes

### Import/Require Guidelines
```javascript
// Node.js modules
const fs = require("fs");
const net = require("net");

// Relative imports (use .js extension)
const logger = require("./core/logger.js");
const Context = require("../core/context.js");
const BaseSession = require("./base_session.js");

// Express and web modules
const express = require("express");
const cors = require("cors");
```

### Function Documentation
```javascript
/**
 * Brief description of function
 * @param {string} paramName - Description of parameter
 * @param {number} paramName2 - Description of parameter
 * @returns {boolean} Description of return value
 */
function exampleFunction(paramName, paramName2) {
  return true;
}

/**
 * @class
 * @augments BaseClass
 */
class ExampleClass extends BaseClass {
  /**
   * @param {net.Socket} socket - The socket connection
   */
  constructor(socket) {
    super();
    this.socket = socket;
  }
}
```

### Variable Naming Conventions
- **Constants**: `UPPER_SNAKE_CASE`
- **Classes**: `PascalCase`
- **Functions/Variables**: `camelCase`
- **Private properties**: `_prefixWithUnderscore`

```javascript
// Constants
const MAX_BUFFER_SIZE = 1024 * 1024;
const DEFAULT_TIMEOUT = 5000;

// Classes
class RtmpSession extends BaseSession {
  constructor(socket) {
    super();
    this._privateProperty = value;
    this.publicProperty = value;
  }
}
```

### Error Handling
```javascript
// Use try-catch for async operations
try {
  const result = await someAsyncOperation();
  res.json({ success: true, data: result });
} catch (error) {
  logger.error(`Operation failed: ${error.message}`);
  res.status(500).json({
    success: false,
    error: "Internal server error"
  });
}

// Use logger for different log levels
logger.trace("Detailed trace message");
logger.debug("Debug information");
logger.info("General information");
logger.warn("Warning message");
logger.error("Error message");
```

### Protocol and Session Patterns
- Each protocol extends `BaseSession`
- Use composition over inheritance for protocol-specific features
- Follow established patterns in existing session classes

### JWT and Authentication
- Use the middleware pattern for authentication
- Handle JWT errors with proper error handling middleware
- Always validate token expiration and validity

### Configuration Management
- Access configuration through `Context.config`
- Use optional chaining for safe property access
- Provide sensible defaults for missing configuration

### Security Considerations
- Never log sensitive information (passwords, tokens)
- Use scrypt hashing for password storage in the API (`src/api/handlers/password_hash.js`; plaintext is migrated to scrypt on startup)
- Validate all input parameters
- Use CORS appropriately for cross-origin requests

### Performance Guidelines
- Use Maps for session management (not arrays)
- Implement proper cleanup in close/error handlers
- Minimize blocking operations in event handlers
- Use efficient data structures for broadcast management

### API Design
- Follow REST conventions for API endpoints
- Use consistent response format:
  ```javascript
  {
    success: true|false,
    data: {},
    message: "Optional message",
    error: "Error details if success=false"
  }
  ```
- Implement proper HTTP status codes
- Add comprehensive error handling

### File Organization
- Keep related functionality in same directory
- Use clear, descriptive file names
- Group API handlers by functionality
- Separate protocol implementations

This codebase follows a professional Node.js server architecture with emphasis on performance, security, and maintainability. Always test thoroughly after making changes.