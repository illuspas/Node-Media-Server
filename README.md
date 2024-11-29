# Node-Media-Server v4

## Introduction
Node-Media-Server is a high-performance open-source live broadcast server developed based on Nodejs.  
v4 is design to implement enhanced RTMP FLV v1 support for native HEVC, VP9, AV1.  
v4 is no longer compatible with the cn_cdn extension id flv_265 standard.

## Installation
```
npm install node-media-server -g
```

or run directly

```
npx node-media-server
```

## Features
* HTTP/HTTP2-flv

## Roadmap
* WS/WSS-flv 
* RTMP
* HTTP-API
* Authentication
* Notification


## Usage
ffmpeg6.1 or above is required

### Push Streaming
```
ffmpeg -re -i test_265.mp4 -c copy -f flv http://localhost:8000/live/test_265.flv
```

```
ffmpeg -re -i test_av1.mp4 -c copy -f flv http://localhost:8000/live/test_av1.flv
```

### Play Streaming
```
ffplay http://localhost:8000/live/test_265.flv
```

## License
Apache 2.0
