# REST API (New in v4.2.0)

Node-Media-Server v4.2.0 provides a REST API for server management and monitoring: stream/session management, relay task control, real-time statistics, and health checks, protected by JWT authentication.

## Overview

- **Base URL**: `http://server_ip:8000/api/v1` (or `https://server_ip:8443/api/v1`)
- The API service is activated automatically when the `auth.jwt` section is present in the configuration file (see [Configuration](#configuration)).
- All endpoints require a JWT token, **except** `POST /login` and `GET /health`.
- All responses use a consistent format:

```json
{
  "success": true,
  "data": {},
  "message": "Optional message"
}
```

## Authentication

### Login (Challenge-Response)

Login is a two-step process that prevents credential replay attacks without requiring HTTPS.

**Step 1: Request a challenge**

```bash
POST /api/v1/login
Content-Type: application/json

{
  "username": "your_username"
}
```

Response:

```json
{
  "success": true,
  "data": {
    "challenge": "a_random_nonce_string"
  },
  "message": "Challenge issued"
}
```

**Step 2: Submit challenge response**

Compute `response = HMAC-SHA256(password, challenge)` (hex-encoded digest, password used as the HMAC key) and submit:

```bash
POST /api/v1/login
Content-Type: application/json

{
  "username": "your_username",
  "challenge": "a_random_nonce_string",
  "response": "hmac_sha256_hex_digest"
}
```

Response:

```json
{
  "success": true,
  "data": {
    "token": "your_jwt_token",
    "user": {
      "username": "your_username"
    },
    "expiresIn": "24h"
  },
  "message": "Login successful"
}
```

Each challenge is single-use and expires after 60 seconds.

### Using the API

Include the JWT token in your requests:

```bash
Authorization: Bearer your_jwt_token
```

The token is also accepted as a query parameter: `?token=your_jwt_token`.

Requests with a missing or invalid token receive:

```json
{
  "success": false,
  "error": "Invalid or missing authentication token",
  "code": "UNAUTHORIZED"
}
```

## Endpoints

| Method   | Path                      | Description                                   | Auth |
| -------- | ------------------------- | --------------------------------------------- | ---- |
| POST     | /api/v1/login             | Two-step challenge-response login             | No   |
| GET      | /api/v1/health            | Server health check                           | No   |
| GET      | /api/v1/info              | Server version and configuration information  | Yes  |
| GET      | /api/v1/streams           | List all active streams                       | Yes  |
| GET      | /api/v1/streams/:app/:name | Get details of a specific stream             | Yes  |
| GET      | /api/v1/sessions          | List all connected sessions                   | Yes  |
| DELETE   | /api/v1/sessions/:id      | Terminate a specific session                  | Yes  |
| GET      | /api/v1/stats             | Real-time server performance statistics       | Yes  |
| GET      | /api/v1/relay             | List all relay tasks                          | Yes  |
| GET      | /api/v1/relay/:streamPath | Get status of a specific relay task           | Yes  |
| POST     | /api/v1/relay             | Add a relay (pull/push) task                  | Yes  |
| DELETE   | /api/v1/relay             | Remove a relay task                           | Yes  |

### Health Check

```bash
GET /api/v1/health
```

Returns the server health status and version.

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "timestamp": "2026-08-22T00:00:00.000Z",
    "version": "4.0.0"
  },
  "message": "Server is healthy"
}
```

### Server Information

```bash
GET /api/v1/info
```

Returns server metadata, an overview of the active configuration (ports, static/record/auth switches), and uptime.

```json
{
  "success": true,
  "data": {
    "server": {
      "name": "node-media-server",
      "version": "4.0.0",
      "homepage": "https://github.com/illuspas/Node-Media-Server",
      "license": "Apache-2.0",
      "author": {}
    },
    "config": {
      "bind": "0.0.0.0",
      "rtmp_port": 1935,
      "rtmps_port": 1936,
      "http_port": 8000,
      "https_port": 8443,
      "static_enabled": false,
      "record_enabled": false,
      "auth_enabled": false
    },
    "uptime": 3600,
    "node_version": "v18.0.0"
  },
  "message": "Server information retrieved successfully"
}
```

### Stream Management

```bash
GET /api/v1/streams
```

List all active streams with detailed information including codecs, resolution, framerate, and subscriber count.

```json
{
  "success": true,
  "data": {
    "streams": [
      {
        "key": "/live/stream",
        "app": "live",
        "name": "stream",
        "publisher": {
          "id": "session_id",
          "ip": "192.168.1.100",
          "protocol": "rtmp",
          "createTime": 1724280000000,
          "videoCodec": "h264",
          "videoWidth": 1920,
          "videoHeight": 1080,
          "videoFramerate": 30,
          "audioCodec": "aac",
          "audioChannels": 2,
          "audioSamplerate": 44100,
          "inBytes": 1048576
        },
        "subscribers": 3
      }
    ],
    "total": 1
  },
  "message": "Streams retrieved successfully"
}
```

Get a single stream (404 if the stream does not exist):

```bash
GET /api/v1/streams/live/stream
```

The response `data` contains the same stream object shown above.

### Session Management

```bash
GET /api/v1/sessions
```

Monitor all connected clients (publishers and players) with session details: protocol, stream app/name, type, bytes in/out, and creation time. The response `data` contains `{ sessions: [...], total }`.

```bash
DELETE /api/v1/sessions/{sessionId}
```

Terminate a specific session by ID. This disconnects the associated client and stops their stream or playback. Returns 404 if the session does not exist.

Response:

```json
{
  "success": true,
  "data": {
    "id": "sessionId"
  },
  "message": "Session deleted successfully"
}
```

### Server Statistics

```bash
GET /api/v1/stats
```

Real-time server performance metrics including:

- CPU usage (`process.cpuUsage()`)
- Memory consumption (RSS, heap total, heap used)
- Process uptime, Node.js version, platform, and PID
- Active stream count and connected client count, split into publishers and players

```json
{
  "success": true,
  "data": {
    "server": {
      "uptime": 3600,
      "nodeVersion": "v18.0.0",
      "platform": "darwin",
      "arch": "arm64",
      "pid": 12345
    },
    "cpu": { "user": 1200000, "system": 300000 },
    "memory": { "rss": 104857600, "heapTotal": 52428800, "heapUsed": 31457280 },
    "sessions": { "total": 4, "publishers": 1, "players": 3 },
    "streams": { "total": 1 },
    "timestamp": "2026-08-22T00:00:00.000Z"
  },
  "message": "Server statistics retrieved successfully"
}
```

### Relay Management

Relay tasks pull an RTSP/RTMP source into the server, or push a local stream out to an RTMP destination.

**List relay tasks**

```bash
GET /api/v1/relay
```

Returns `{ tasks: [...], count }` with the status of every relay task.

**Get a task's status**

```bash
GET /api/v1/relay/live/stream
```

Returns the status of the pull task bound to `/live/stream` (URL-encoded stream path). Returns 404 if the task does not exist.

**Add a relay task**

```bash
POST /api/v1/relay
Content-Type: application/json

{
  "url": "rtsp://192.168.1.100:554/camera/1",
  "mode": "pull",
  "streamPath": "/live/camera1",
  "transport": "tcp",
  "reconnect": true,
  "reconnectInterval": 5000,
  "maxReconnectAttempts": 10
}
```

| Field                 | Required | Description                                                                                       |
| --------------------- | -------- | ------------------------------------------------------------------------------------------------- |
| url                   | Yes      | RTSP or RTMP source/destination URL. `rtspUrl` is accepted as a legacy alias                        |
| mode                  | No       | `pull` (default) or `push`. RTSP only supports pull; RTMP supports both pull and push              |
| streamPath            | Yes      | Local stream path, must start with `/` (e.g. `/live/camera1`)                                      |
| transport             | No       | RTSP transport, default `tcp`                                                                     |
| reconnect             | No       | Reconnect on failure, default `true`                                                              |
| reconnectInterval     | No       | Reconnect interval in milliseconds                                                                |
| maxReconnectAttempts  | No       | Maximum reconnect attempts                                                                        |

Response contains the new task's status in `data`.

**Remove a relay task**

```bash
DELETE /api/v1/relay
Content-Type: application/json

{
  "streamPath": "/live/camera1"
}
```

For push tasks, pass either the full task key (`taskKey: "push:rtmp://dest/live/stream"`) or `mode: "push"` together with `url`. Returns 404 if the task does not exist.

## Configuration

The API system is configured through the `auth.jwt` section of the configuration file (e.g. `bin/config.json`):

```json
"auth": {
    "play": false,
    "publish": false,
    "secret": "nodemedia2017privatekey",
    "jwt": {
        "secret": "3e64abe6a00088e5039452d1ea1c854af7e4cc6ec30c129547b44f89604a6164",
        "expiresIn": "24h",
        "refreshExpiresIn": "7d",
        "algorithm": "HS256",
        "users": [
            {
                "username": "admin",
                "password": "your_password",
                "role": "admin"
            }
        ]
    }
}
```

## Security Features

### Challenge-Response Authentication

Login uses a challenge-response protocol (HMAC-SHA256) to prevent credential replay attacks. Passwords never cross the network — even on plain HTTP. Each challenge is single-use and expires after 60 seconds. The digest comparison uses `crypto.timingSafeEqual` to prevent timing attacks.

### JWT Configuration

- Configurable secret key for token signing
- Support for different algorithms (HS256, HS384, HS512)
- Configurable token expiration times
- Refresh token support for extended sessions

## Example Usage

### Using curl

```bash
# Step 1: Request challenge
CHALLENGE=$(curl -s -X POST http://localhost:8000/api/v1/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['challenge'])")

# Step 2: Compute response and login
RESPONSE=$(echo -n "$CHALLENGE" | openssl dgst -sha256 -hmac "your_password" | awk '{print $NF}')

curl -X POST http://localhost:8000/api/v1/login \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"admin\",\"challenge\":\"$CHALLENGE\",\"response\":\"$RESPONSE\"}"

# Get server stats
curl -X GET http://localhost:8000/api/v1/stats \
  -H "Authorization: Bearer your_jwt_token"

# Get active streams
curl -X GET http://localhost:8000/api/v1/streams \
  -H "Authorization: Bearer your_jwt_token"

# Get all sessions
curl -X GET http://localhost:8000/api/v1/sessions \
  -H "Authorization: Bearer your_jwt_token"

# Delete a specific session
curl -X DELETE http://localhost:8000/api/v1/sessions/abc123-def456-ghi789 \
  -H "Authorization: Bearer your_jwt_token"

# Add an RTSP pull relay task
curl -X POST http://localhost:8000/api/v1/relay \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_jwt_token" \
  -d '{"url":"rtsp://192.168.1.100:554/camera/1","streamPath":"/live/camera1"}'

# Remove a relay task
curl -X DELETE http://localhost:8000/api/v1/relay \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_jwt_token" \
  -d '{"streamPath":"/live/camera1"}'
```

### Using JavaScript

```javascript
const crypto = require('crypto');

// Step 1: Request challenge
const challengeRes = await fetch('http://localhost:8000/api/v1/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'admin' })
});
const { data: { challenge } } = await challengeRes.json();

// Step 2: Compute response and login
const response = crypto.createHmac('sha256', 'your_password').update(challenge).digest('hex');
const loginRes = await fetch('http://localhost:8000/api/v1/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'admin', challenge, response })
});
const { data: { token } } = await loginRes.json();

// Get streams
const streamsResponse = await fetch('http://localhost:8000/api/v1/streams', {
  headers: { 'Authorization': `Bearer ${token}` }
});

const streams = await streamsResponse.json();
console.log('Active streams:', streams);

// Get all sessions
const sessionsResponse = await fetch('http://localhost:8000/api/v1/sessions', {
  headers: { 'Authorization': `Bearer ${token}` }
});

const sessions = await sessionsResponse.json();
console.log('Active sessions:', sessions);

// Delete a specific session
if (sessions.data.sessions.length > 0) {
  const sessionIdToDelete = sessions.data.sessions[0].id;
  const deleteResponse = await fetch(`http://localhost:8000/api/v1/sessions/${sessionIdToDelete}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` }
  });

  const deleteResult = await deleteResponse.json();
  console.log('Session deletion result:', deleteResult);
}
```
