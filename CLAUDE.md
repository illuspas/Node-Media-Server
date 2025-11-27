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
Configuration is loaded through `Context.config` and includes:
- RTMP/RTMPS ports and SSL settings
- HTTP/HTTPS ports and SSL settings
- Authentication options (play/publish)
- Notification URLs
- Static file serving
- Recording paths

### Dependencies
Main dependencies include:
- `express` - HTTP server framework
- `ws` - WebSocket support for FLV streaming
- `cors` - Cross-origin resource sharing

Development dependencies:
- `eslint` with configuration in `eslint.config.js`
- ESLint plugins for JSDoc validation

## Testing with FFmpeg/OBS
The server supports modern streaming tools:
- **OBS 29.1+** required for enhanced codec support
- **FFmpeg 6.1+** required for latest codec compatibility

Example FFmpeg commands for testing streaming are available in README.md.