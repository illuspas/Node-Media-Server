# Node-Media-Server v4
[![npm](https://img.shields.io/node/v/node-media-server.svg)](https://nodejs.org/en/)
[![npm](https://img.shields.io/npm/v/node-media-server.svg)](https://npmjs.org/package/node-media-server)
[![npm](https://img.shields.io/npm/dm/node-media-server.svg)](https://npmjs.org/package/node-media-server)
[![npm](https://img.shields.io/npm/l/node-media-server.svg)](LICENSE) 

## **If you like this project you can support me.**  
[![](https://img.buymeacoffee.com/button-api/?text=Buy%20me%20a%20coffee&emoji=&slug=illuspas&button_colour=5F7FFF&font_colour=ffffff&font_family=Cookie&outline_colour=000000&coffee_colour=FFDD00)](https://www.buymeacoffee.com/illuspas)

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

## Supported clients
|Client   | H.264  | HEVC | VP9 | AV1|
| ------------ | ------------ |------------ |------------ |------------ |
|  OBS_29.1+|  ✅   | ✅ |  ❌|  ✅ |
|  FFmpeg/FFplay_6.1+ |   ✅  |  ✅ |  ✅ |  ✅ |
|  NodePlayer.js_1.0+ |   ✅  |  ✅ |  ❌ |  ❌ |
|  NodeMediaClient_3.0+ |   ✅  |  ✅ |  ❌ |  ❌ |

## Usage
* obs_29.1 or above is required
* ffmpeg_6.1 or above is required

### Push Streaming

```
ffmpeg -re -i test_265.mp4 -c copy -f flv rtmp://localhost/live/test_265
```

```
ffmpeg -re -i test_av1.mp4 -c copy -f flv http://localhost:8000/live/test_av1.flv
```

### Play Streaming
```
ffplay http://localhost:8000/live/test_265.flv
```

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

#### Login
```bash
POST /api/v1/login
Content-Type: application/json

{
  "username": "your_username",
  "password": "your_password"
}
```

Response:
```json
{
  "success": true,
  "data": {
    "token": "your_jwt_token",
    "expiresIn": "24h"
  },
  "message": "Login successful"
}
```

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

#### Password Hashing
Passwords are securely stored using MD5 hashing. To generate a hashed password:
```javascript
const crypto = require('crypto');
const hashedPassword = crypto.createHash('md5').update('your_password').digest('hex');
```

#### JWT Configuration
- Configurable secret key for token signing
- Support for different algorithms (HS256, HS384, HS512)
- Configurable token expiration times
- Refresh token support for extended sessions

### Example Usage

#### Using curl
```bash
# Login
curl -X POST http://localhost:8001/api/v1/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password": md5("password")}'

# Get server stats
curl -X GET http://localhost:8001/api/v1/stats \
  -H "Authorization: Bearer your_jwt_token"

# Get active streams
curl -X GET http://localhost:8001/api/v1/streams \
  -H "Authorization: Bearer your_jwt_token"

# Get all sessions
curl -X GET http://localhost:8001/api/v1/sessions \
  -H "Authorization: Bearer your_jwt_token"

# Delete a specific session
curl -X DELETE http://localhost:8001/api/v1/sessions/abc123-def456-ghi789 \
  -H "Authorization: Bearer your_jwt_token"
```

#### Using JavaScript
```javascript
// Login and get streams
const response = await fetch('http://localhost:8001/api/v1/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'admin', password: md5('password') })
});

const { token } = await response.json();

// Get streams
const streamsResponse = await fetch('http://localhost:8001/api/v1/streams', {
  headers: { 'Authorization': `Bearer ${token}` }
});

const streams = await streamsResponse.json();
console.log('Active streams:', streams);

// Get all sessions
const sessionsResponse = await fetch('http://localhost:8001/api/v1/sessions', {
  headers: { 'Authorization': `Bearer ${token}` }
});

const sessions = await sessionsResponse.json();
console.log('Active sessions:', sessions);

// Delete a specific session
if (sessions.length > 0) {
  const sessionIdToDelete = sessions[0].id; // Get first session ID
  const deleteResponse = await fetch(`http://localhost:8001/api/v1/sessions/${sessionIdToDelete}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` }
  });

  const deleteResult = await deleteResponse.json();
  console.log('Session deletion result:', deleteResult);
}
```

## License
Apache 2.0
