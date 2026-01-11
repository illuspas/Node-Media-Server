# Agent Guidelines for Node-Media-Server

This document provides guidelines for agentic coding agents operating in this repository.

## Build/Lint/Test Commands

### Available Scripts
```bash
# Development mode - runs eslint and starts server
npm run dev

# Production start
npm start

# Test (currently just exits 0 - no tests implemented)
npm test
```

### Linting
```bash
# Run eslint on all files
npx eslint

# Fix auto-fixable eslint issues
npx eslint --fix

# Check specific file
npx eslint src/index.js
```

### Single File Analysis
```bash
# Check a single file with eslint
npx eslint --no-eslintrc --config ../eslint.config.js file.js

# Analyze TypeScript-style checking
npx eslint --ext .js src/ --rule '@typescript-eslint/no-unused-vars: error'
```

### Manual Testing
Since there are no automated tests, manual testing approaches:

1. **RTMP Stream Testing**:
   ```bash
   # Start server
   npm start
   
   # Test with ffmpeg
   ffmpeg -i input.mp4 -c:v libx264 -f flv rtmp://localhost:1935/live/stream
   ffmpeg -i rtmp://localhost:1935/live/stream -c copy output.mp4
   ```

2. **HTTP-FLV Testing**:
   ```bash
   # Play stream in browser
   http://localhost:8000/live/stream.flv
   ```

3. **API Testing**:
   ```bash
   # Health check
   curl http://localhost:8001/health
   
   # Login
   curl -X POST http://localhost:8001/api/v1/login \
     -H "Content-Type: application/json" \
     -d '{"username":"admin","password":"your_password"}'
   ```

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
- Use MD5 hashing for password storage in API
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