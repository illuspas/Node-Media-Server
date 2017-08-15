# Node-Media-Server
A Node.js implementation of RTMP Server 

# Features
 - No third-party library dependencies
 - High performance RTMP parser based on ES6 Generator implementation
 - Cross platform support Windows/Linux/Unix
 - Support H.264/AAC/SPEEX/NELLYMOSER
 - Support GOP cache
 - Support remux to LIVE-HTTP-FLV,Support [flv.js](https://github.com/Bilibili/flv.js) playback

# Usage 
```
const NodeMediaServer = require('./node_media_server')

const config = {
  rtmp: {
    port: 1935,
    chunk_size: 60000,
    gop_cache: true,
    ping: 60,
    ping_timeout: 30
  },
  http: {
    port: 8000,
    allow_origin: '*'
  }
}

var nms = new NodeMediaServer(config)
nms.run()
```

# Todo 
- support record stream 
- support transcode
- support cluster
- support low latency hls
- server and streams status
- on_connect/on_publish/on_play/on_done event callback

# Thanks
RTSP, RTMP, and HTTP server implementation in Node.js  
https://github.com/iizukanao/node-rtsp-rtmp-server

Node.JS module that provides an API for encoding and decoding of AMF0 and AMF3 protocols  
https://github.com/delian/node-amfutils
