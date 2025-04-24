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
* RTMP/RTMPS Push/Play
* GOP cache
* Notification
* Authentication
* Static file server
* Record to flv file

## Roadmap
* HTTP-API
* Rtmp Relay

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

## License
Apache 2.0
