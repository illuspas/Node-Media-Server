# Node-Media-Server
[![npm](https://img.shields.io/npm/v/node-media-server.svg)](https://npmjs.org/package/node-media-server)
[![npm](https://img.shields.io/npm/dm/node-media-server.svg)](https://npmjs.org/package/node-media-server)
[![npm](https://img.shields.io/npm/l/node-media-server.svg)](LICENSE)

A Node.js implementation of RTMP Server 

# Features
 - No third-party library dependencies
 - High performance RTMP parser based on ES6 Generator implementation
 - Cross platform support Windows/Linux/Unix
 - Support H.264/AAC/SPEEX/NELLYMOSER
 - Support GOP cache
 - Support remux to LIVE-HTTP-FLV,Support [flv.js](https://github.com/Bilibili/flv.js) playback

# Usage 
```bash
npm install node-media-server
```

```js
const NodeMediaServer = require('node-media-server')

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

# Publishing live streams
## From FFmpeg
>If you have a video file with H.264 video and AAC audio:
```bash
ffmpeg -re -i INPUT_FILE_NAME -c copy -f flv rtmp://localhost/live/STREAM_NAME
```

Or if you have a video file that is encoded in other audio/video format:
```bash
ffmpeg -re -i INPUT_FILE_NAME -c:v libx264 -preset superfast -tune zerolatency -c:a aac -ar 44100 -f flv rtmp://localhost/live/STREAM_NAME
```

## From OBS
>Settings -> Stream

Stream Type : Custom Streaming Server

URL : rtmp://localhost/live

Stream key : STREAM_NAME

# Accessing the live stream
## via RTMP 
```bash
ffplay rtmp://localhost/live/STREAM_NAME
```

## via http-flv
```bash
ffplay http://localhost:8000/live/STREAM_NAME.flv
```

## via flv.js

```html
<script src="https://cdn.bootcss.com/flv.js/1.3.2/flv.min.js"></script>
<video id="videoElement"></video>
<script>
    if (flvjs.isSupported()) {
        var videoElement = document.getElementById('videoElement');
        var flvPlayer = flvjs.createPlayer({
            type: 'flv',
            url: 'http://localhost:8000/live/STREAM_NAME.flv'
        });
        flvPlayer.attachMediaElement(videoElement);
        flvPlayer.load();
        flvPlayer.play();
    }
</script>
```

# Thanks
RTSP, RTMP, and HTTP server implementation in Node.js  
https://github.com/iizukanao/node-rtsp-rtmp-server

Node.JS module that provides an API for encoding and decoding of AMF0 and AMF3 protocols  
https://github.com/delian/node-amfutils
