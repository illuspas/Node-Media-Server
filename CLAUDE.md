# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Node-Media-Server is a high-performance Node.js implementation of an RTMP/FLV live streaming server. It supports RTMP push/play, HTTP/HTTP2-FLV push/play, WS/WSS-FLV push/play, and modern codecs including H.264/H.265, VP9, and AV1. This is version 4, which breaks compatibility with v2 and implements enhanced RTMP FLV v1 support for native HEVC, VP9, and AV1.

## Common Development Commands

- **Development with linting**: `npm run dev` - Runs ESLint and starts the server
- **Start server**: `npm start` or `node bin/app.js` - Starts the server normally
- **Run ESLint**: `npx eslint` - Lints the codebase using the configuration in `eslint.config.js`

## Architecture

### Core Structure
- **Entry point**: `src/index.js` - Main NodeMediaServer class
- **Application entry**: `bin/app.js` - CLI wrapper that loads config and starts the server
- **Configuration**: `bin/config.json` - Server configuration including ports, auth, and SSL certificates

### Key Components

**Core (`src/core/`)**:
- `context.js` - Global context for sessions, broadcasts, and event management
- `logger.js` - Logging utility
- `avpacket.js` - Audio/video packet handling
- `avcodec.js` - Codec operations

**Servers (`src/server/`)**:
- `rtmp_server.js` - RTMP/RTMPS server implementation
- `http_server.js` - HTTP/HTTPS server for FLV streaming
- `broadcast_server.js` - Broadcast management
- `record_server.js` - Recording functionality
- `notify_server.js` - Notification system

**API System (`src/api/`)** - (New in v4.2.0):
- `middleware/auth.js` - JWT authentication middleware
- `handlers/` - API endpoint handlers for streams, sessions, stats, health, auth
- `routers/api.js` - Main API router configuration

**Sessions (`src/session/`)**:
- `rtmp_session.js` - RTMP session handling
- `flv_session.js` - FLV session handling
- `base_session.js` - Base session class

**Protocol (`src/protocol/`)**:
- `rtmp.js` - RTMP protocol implementation
- `flv.js` - FLV format handling
- `amf.js` - Action Message Format support

### Event System
The server uses an event-driven architecture with `Context.eventEmitter` for handling:
- Session lifecycle events
- Stream publishing/playback
- Notifications

### Configuration System
Configuration is loaded through `Context.config` from `bin/config.json` and includes:
- **Network Settings**: Bind address, RTMP/RTMPS ports and SSL settings, HTTP/HTTPS ports
- **Authentication**: Play/publish authentication, JWT configuration with user accounts
- **Security**: SSL certificate paths, authentication secrets, JWT expiration settings
- **Features**: Notification URLs, static file serving, recording paths
- **JWT Options**: User credentials, token lifetimes, algorithm selection

### Dependencies
Main dependencies include:
- `express` - HTTP server framework
- `ws` - WebSocket support for FLV streaming
- `cors` - Cross-origin resource sharing
- `express-jwt` - JWT authentication middleware
- `jsonwebtoken` - JWT token handling

Development dependencies:
- `eslint` with configuration in `eslint.config.js`
- ESLint plugins for JSDoc validation

### API System (New in v4.2.0)
The server now includes a comprehensive REST API system with the following endpoints:
- **Authentication**: `/api/login` - JWT-based authentication with refresh tokens
- **Health Check**: `/api/health` - Server health monitoring
- **Server Info**: `/api/info` - Server configuration and version information
- **Stream Management**: `/api/streams` - List and monitor active streams
- **Session Management**: `/api/sessions` - Monitor connected clients
- **Statistics**: `/api/stats` - Real-time server performance metrics

### Enhanced Authentication System (New in v4.2.0)
- **JWT Authentication**: Token-based API access with configurable expiration
- **MD5 Password Hashing**: Secure password storage using crypto module
- **Flexible Token Sources**: Bearer tokens and query parameter support

### Advanced Monitoring (New in v4.2.0)
The server now provides comprehensive monitoring capabilities:
- **Real-time Statistics**: CPU usage, memory consumption, and process metrics
- **Session Tracking**: Live monitoring of publishers and players
- **Stream Analytics**: Active stream counts and detailed stream information
- **System Information**: Node.js version, platform details, and uptime monitoring

## Testing with FFmpeg/OBS
The server supports modern streaming tools:
- **OBS 29.1+** required for enhanced codec support
- **FFmpeg 6.1+** required for latest codec compatibility

Example FFmpeg commands for testing streaming are available in README.md.