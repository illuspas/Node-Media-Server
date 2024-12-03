# Node-Media-Server v4

## Introduction
Node-Media-Server is a high-performance/low-latency/open-source Live Streaming Server developed based on Nodejs.  
v4 is design to implement enhanced RTMP FLV v1 support for native HEVC, VP9, AV1.  
v4 is no longer compatible with the cn_cdn extension id flv_265 standard.  
v4 is no longer compatible with flashplayer's rtmp protocol.

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
* RTMP Push

## Roadmap
* RTMP Play
* HTTP-API
* Authentication
* Notification
* Record and Playback
* GOP cache
* Rtmp Proxy

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

## License
Apache 2.0
