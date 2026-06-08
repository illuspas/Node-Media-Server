# Node-Media-Server v4
[![npm](https://img.shields.io/node/v/node-media-server.svg)](https://nodejs.org/en/)
[![npm](https://img.shields.io/npm/v/node-media-server.svg)](https://npmjs.org/package/node-media-server)
[![npm](https://img.shields.io/npm/dm/node-media-server.svg)](https://npmjs.org/package/node-media-server)
[![npm](https://img.shields.io/npm/l/node-media-server.svg)](LICENSE) 

## Introduction
Node-Media-Server is a high-performance/low-latency/open-source Live Streaming Server developed based on Nodejs.  
v4 is design to implement enhanced RTMP FLV v1 support for native HEVC, VP9, AV1.  
v4 is no longer compatible with the cn_cdn extension id flv_265 standard.  
v4 is no longer compatible with flashplayer's rtmp protocol.  
v4 is incompatible with v2. Do not upgrade across major versions.

## Installation
```
npm install node-media-server -g
```

or run directly

```
npx node-media-server
```

## Features
* HTTP/HTTP2-flv Push/Play
* WS/WSS-flv Push/Play
* RTMP/RTMPS Push/Play
* GOP cache
* Notification
* Authentication
* Static file server
* Record to flv file
* REST API System (New in v4.2.0)
* JWT-based Authentication (New in v4.2.0)
* Real-time Monitoring & Statistics (New in v4.2.0)
* Session Management (New in v4.2.0)
* Session Deletion (New in v4.2.0)
* Advanced Health Monitoring (New in v4.2.0)

## Static file services
Node-Media-Server can provide static file services for a directory.
```
"static": {
    "router": "/",
    "root": "./html"
}
```

## Record to flv file
Node-Media-Server can record live streams as FLV files.  
When the static file server is enabled and recordings are saved in its directory.  
It can provide video-on-demand services.

```
"record": {
    "path": "./html/record"
}
```

```
http://server_ip:8000/record/live/stream/unix_time.flv
or
https://server_ip:8443/record/live/stream/unix_time.flv
```

## REST API System (New in v4.2.0)

Node-Media-Server v4.2.0 introduces a comprehensive REST API system for server management and monitoring.

### Authentication
The API system uses JWT-based authentication with the following endpoints:

#### Login (Challenge-Response)

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

Compute `response = HMAC-SHA256(password, challenge)` and submit:
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

#### Using the API
Include the JWT token in your requests:
```bash
Authorization: Bearer your_jwt_token
```

### API Endpoints

#### Health Check
```bash
GET /api/v1/health
```
Returns server health status, including CPU usage, memory consumption, and uptime.

#### Server Information
```bash
GET /api/v1/info
```
Returns server configuration, version information, and system details.

#### Stream Management
```bash
GET /api/v1/streams
```
List all active streams with detailed information including codecs, bitrate, and connected clients.

#### Session Management
```bash
GET /api/v1/sessions
```
Monitor all connected clients (publishers and players) with session details.

```bash
DELETE /api/v1/sessions/{sessionId}
```
Terminate a specific session by ID. This will disconnect the associated client and stop their stream or playback.

Response:
```json
{
  "success": true,
  "data": {
    "id": "sessionId",
  }
  "message": "Session deleted successfully",
}
```

#### Server Statistics
```bash
GET /api/v1/stats
```
Real-time server performance metrics including:
- CPU usage percentage
- Memory consumption (RSS, heap total, heap used)
- Process uptime
- Active stream count
- Connected client count

### Configuration

The API system is configured through the `bin/config.json` file:

```json
"auth": {
    "play": false,
    "publish": false,
    "secret": "nodemedia2017privatekey",
    "jwt": {
        "expiresIn": "24h",
        "refreshExpiresIn": "7d",
        "algorithm": "HS256",
        "users": [
            {
                "username": "admin",
                "password": "admin123"
            }
        ]
    }
},
```

### Security Features

#### Challenge-Response Authentication
Login uses a challenge-response protocol (HMAC-SHA256) to prevent credential replay attacks. Passwords never cross the network — even on plain HTTP. Each challenge is single-use and expires after 60 seconds.

#### JWT Configuration
- Configurable secret key for token signing
- Support for different algorithms (HS256, HS384, HS512)
- Configurable token expiration times
- Refresh token support for extended sessions

### Example Usage

#### Using curl
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
```

#### Using JavaScript
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
if (sessions.data.length > 0) {
  const sessionIdToDelete = sessions.data[0].id;
  const deleteResponse = await fetch(`http://localhost:8000/api/v1/sessions/${sessionIdToDelete}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` }
  });

  const deleteResult = await deleteResponse.json();
  console.log('Session deletion result:', deleteResult);
}
```

## Supported clients
|Client   | H.264  | HEVC | VP9 | AV1|
| ------------ | ------------ |------------ |------------ |------------ |
|  OBS_29.1+|  ✅   | ✅ |  ❌|  ✅ |
|  FFmpeg/FFplay_6.1+ |   ✅  |  ✅ |  ✅ |  ✅ |
|  NodePlayer.js_1.0+ |   ✅  |  ✅ |  ❌ |  ❌ |
|  NodeMediaClient_3.0+ |   ✅  |  ✅ |  ❌ |  ❌ |

### [QLive](https://play.google.com/store/apps/details?id=cn.nodemedia.qlive) 
Free Android Live Streaming App

### [NodePlayer.js](https://www.nodemedia.cn/product/nodeplayer-js/) pure javascript implementation live streaming player
[Online Demo](http://demo.nodemedia.cn/)
- ASM.js, WASM, SIMD, WebWorker, WebCodecs, MediaSource multiple technical implementations
- H.264/H.265+AAC/G711 software and hardware decoder
- Ultra-low latency, Under extreme conditions less than 100 milliseconds
- Enhanced HTTP/WS-FLV Protocol, Natively support h.265
- Android/iOS/HarmonyOS/Chrome/Edge/Firefox/Safari, All modern browsers or platforms

### [NodePublisher.js](https://www.nodemedia.cn/demo/nodepublisher/) pure javascript implementation live streaming publisher
- WebSocket-FLV Protocol
- H.264+AAC hardware encoder
- Only chrome or chromium based browsers are supported at the moment
- wss is required

### [NodeMediaClient-iOS](https://github.com/NodeMedia/NodeMediaClient-iOS)  iOS live streaming player and publisher SDK
- Objective-C/Swift
- RTMP/HTTP-FLV/RTSP
- H.264/H.265+AAC/OPUS/G711
- Ultra-low latency, Under extreme conditions less than 100 milliseconds
- Enhanced RTMP/FLV Protocol, Natively support H.265/OPUS
- Built-in beauty filter

### [NodeMediaClient-Android](https://github.com/NodeMedia/NodeMediaClient-Android)  Android live streaming player and publisher SDK
- JAVA/Kotlin
- armv7/arm64/x86/x86_64
- RTMP/HTTP-FLV/RTSP
- H.264/H.265+AAC/OPUS/G711
- Ultra-low latency, Under extreme conditions less than 100 milliseconds
- Enhanced RTMP/FLV Protocol, Natively support H.265/OPUS
- Built-in beauty filter

### [expo-nodemediaclient](https://github.com/NodeMedia/expo-nodemediaclient)  Expo module for NodeMediaClient
- iOS and Android
- player and publisher

## License
Apache 2.0
