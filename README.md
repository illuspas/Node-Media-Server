# Node-Media-Server
[![npm](https://img.shields.io/node/v/node-media-server.svg)](https://nodejs.org/en/)
[![npm](https://img.shields.io/npm/v/node-media-server.svg)](https://npmjs.org/package/node-media-server)
[![npm](https://img.shields.io/npm/dm/node-media-server.svg)](https://npmjs.org/package/node-media-server)
[![npm](https://img.shields.io/npm/l/node-media-server.svg)](LICENSE) 
[![Join the chat at https://gitter.im/Illuspas/Node-Media-Server](https://badges.gitter.im/Illuspas/Node-Media-Server.svg)](https://gitter.im/Illuspas/Node-Media-Server?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)


A Node.js implementation of RTMP/HTTP-FLV/WS-FLV/HLS/DASH Media Server  
[中文介绍](https://github.com/illuspas/Node-Media-Server/blob/master/README_CN.md)  

# NodeMediaServer V3 
[https://www.nodemedia.cn/product/node-media-server/](https://www.nodemedia.cn/product/node-media-server/)

# Web Admin Panel Source
[https://github.com/illuspas/Node-Media-Server-Admin](https://github.com/illuspas/Node-Media-Server-Admin)

# Web Admin Panel Screenshot
[http://server_ip:8000/admin](http://server_ip:8000/admin)

![admin](https://raw.githubusercontent.com/illuspas/resources/master/img/admin_panel_dashboard.png)
![preview](https://raw.githubusercontent.com/illuspas/resources/master/img/admin_panel_streams_preview.png)

# Features
 - Cross platform support Windows/Linux/Unix
 - Support H.264/AAC/MP3/SPEEX/NELLYMOSER/G.711
 - Extension support H.265(flv_id=12)/OPUS(flv_id=13)
 - Support GOP cache
 - Support remux to LIVE-HTTP/WS-FLV, Support [NodePlayer.js](https://www.nodemedia.cn/product/nodeplayer-js) playback
 - Support remux to HLS/DASH/MP4
 - Support xycdn style authentication
 - Support event callback
 - Support https/wss
 - Support Server Monitor
 - Support Rtsp/Rtmp relay
 - Support api control relay
 - Support real-time multi-resolution transcoding
 - Support Enhancing RTMP, FLV (HEVC/AV1 encoding using OBS)

# Usage 

## npx 
```bash
npx node-media-server
```

## install as a global program
```bash
npm i node-media-server -g
node-media-server
```

## docker version
```bash
docker run --name nms -d -p 1935:1935 -p 8000:8000 -p 8443:8443 illuspas/node-media-server
```

## npm version (recommended)

```bash
mkdir nms
cd nms
npm install node-media-server
vi app.js
```

```js
const NodeMediaServer = require('node-media-server');

const config = {
  rtmp: {
    port: 1935,
    chunk_size: 60000,
    gop_cache: true,
    ping: 30,
    ping_timeout: 60
  },
  http: {
    port: 8000,
    allow_origin: '*'
  }
};

var nms = new NodeMediaServer(config)
nms.run();
```

```bash
node app.js
```

# Publishing live streams
## From FFmpeg
>If you have a video file with H.264 video and AAC audio:
```bash
ffmpeg -re -i INPUT_FILE_NAME -c copy -f flv rtmp://localhost/live/STREAM_NAME
```

Or if you have a video file that is encoded in other audio/video format:
```bash
ffmpeg -re -i INPUT_FILE_NAME -c:v libx264 -preset veryfast -tune zerolatency -c:a aac -ar 44100 -f flv rtmp://localhost/live/STREAM_NAME
```

## From OBS
>Settings -> Stream

Stream Type : Custom Streaming Server

URL : rtmp://localhost/live

Stream key : STREAM_NAME?sign=expires-HashValue (sign parameter required only if publish auth is enabled)

# Accessing the live stream
## RTMP 
```
rtmp://localhost/live/STREAM_NAME
```

## http-flv
```
http://localhost:8000/live/STREAM_NAME.flv
```

## websocket-flv
```
ws://localhost:8000/live/STREAM_NAME.flv
```

## HLS
```
http://localhost:8000/live/STREAM_NAME/index.m3u8
```

## DASH
```
http://localhost:8000/live/STREAM_NAME/index.mpd
```

## via flv.js over http-flv

```html
<script src="https://cdn.bootcss.com/flv.js/1.5.0/flv.min.js"></script>
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

## via flv.js over websocket-flv

```html
<script src="https://cdn.bootcss.com/flv.js/1.5.0/flv.min.js"></script>
<video id="videoElement"></video>
<script>
    if (flvjs.isSupported()) {
        var videoElement = document.getElementById('videoElement');
        var flvPlayer = flvjs.createPlayer({
            type: 'flv',
            url: 'ws://localhost:8000/live/STREAM_NAME.flv'
        });
        flvPlayer.attachMediaElement(videoElement);
        flvPlayer.load();
        flvPlayer.play();
    }
</script>
```

# Logging
## Modify the logging type
It is now possible to modify the logging type which determines which console outputs are shown.

There are a total of 4 possible options:
- 0 - Don't log anything
- 1 - Log errors
- 2 - Log errors and generic info
- 3 - Log everything (debug)

Modifying the logging type is easy - just add a new value `logType` in the config and set it to a value between 0 and 4.
By default, this is set to show errors and generic info internally (setting 2).

```js
const NodeMediaServer = require('node-media-server');

const config = {
  logType: 3,

  rtmp: {
    port: 1935,
    chunk_size: 60000,
    gop_cache: true,
    ping: 30,
    ping_timeout: 60
  },
  http: {
    port: 8000,
    allow_origin: '*'
  }
};

var nms = new NodeMediaServer(config)
nms.run();

```

# Authentication
## Encryption URL consists of:
> rtmp://hostname:port/appname/stream?sign=expires-HashValue  
> http://hostname:port/appname/stream.flv?sign=expires-HashValue  
> ws://hostname:port/appname/stream.flv?sign=expires-HashValue  

1.Publish or play address:
>rtmp://192.168.0.10/live/stream

2.Config set auth->secret: 'nodemedia2017privatekey'
```js
const config = {
  rtmp: {
    port: 1935,
    chunk_size: 60000,
    gop_cache: true,
    ping: 30,
    ping_timeout: 60
  },
  http: {
    port: 8000,
    allow_origin: '*'
  },
  auth: {
    play: true,
    publish: true,
    secret: 'nodemedia2017privatekey'
  }
}
```
3.expiration time: 2017/8/23 11:25:21 ,The calculated expiration timestamp is
>1503458721

4.The combination HashValue is:
>HashValue = md5("/live/stream-1503458721-nodemedia2017privatekey”)  
>HashValue = 80c1d1ad2e0c2ab63eebb50eed64201a

5.Final request address
> rtmp://192.168.0.10/live/stream?sign=1503458721-80c1d1ad2e0c2ab63eebb50eed64201a  
> The 'sign' keyword can not be modified

# H.265 over RTMP
- Play:[NodeMediaClient-Android](#android) and [NodeMediaClient-iOS](#ios)  
- Commercial Pure JavaScrip live stream player: [NodePlayer.js](https://www.nodemedia.cn/product/nodeplayer-js)
- OpenSource Pure JavaScrip live stream player: [pro-flv.js](https://github.com/illuspas/pro-fiv.js)
- OBS 29.1+

# AV1 over RTMP
- OBS 29.1+

# Event callback
```js
......
nms.run();
nms.on('preConnect', (id, args) => {
  console.log('[NodeEvent on preConnect]', `id=${id} args=${JSON.stringify(args)}`);
  // let session = nms.getSession(id);
  // session.reject();
});

nms.on('postConnect', (id, args) => {
  console.log('[NodeEvent on postConnect]', `id=${id} args=${JSON.stringify(args)}`);
});

nms.on('doneConnect', (id, args) => {
  console.log('[NodeEvent on doneConnect]', `id=${id} args=${JSON.stringify(args)}`);
});

nms.on('prePublish', (id, StreamPath, args) => {
  console.log('[NodeEvent on prePublish]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);
  // let session = nms.getSession(id);
  // session.reject();
});

nms.on('postPublish', (id, StreamPath, args) => {
  console.log('[NodeEvent on postPublish]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);
});

nms.on('donePublish', (id, StreamPath, args) => {
  console.log('[NodeEvent on donePublish]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);
});

nms.on('prePlay', (id, StreamPath, args) => {
  console.log('[NodeEvent on prePlay]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);
  // let session = nms.getSession(id);
  // session.reject();
});

nms.on('postPlay', (id, StreamPath, args) => {
  console.log('[NodeEvent on postPlay]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);
});

nms.on('donePlay', (id, StreamPath, args) => {
  console.log('[NodeEvent on donePlay]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);
});
```
# Https/Wss

## Generate certificate
```bash
openssl genrsa -out privatekey.pem 1024
openssl req -new -key privatekey.pem -out certrequest.csr 
openssl x509 -req -in certrequest.csr -signkey privatekey.pem -out certificate.pem
```

## Config https
```js
const NodeMediaServer = require('node-media-server');

const config = {
  rtmp: {
    port: 1935,
    chunk_size: 60000,
    gop_cache: true,
    ping: 30,
    ping_timeout: 60
  },
  http: {
    port: 8000,
    allow_origin: '*'
  },
  https: {
    port: 8443,
    key:'./privatekey.pem',
    cert:'./certificate.pem',
  }
};


var nms = new NodeMediaServer(config)
nms.run();
```
## Accessing
```
https://localhost:8443/live/STREAM_NAME.flv
wss://localhost:8443/live/STREAM_NAME.flv
```
>In the browser environment, Self-signed certificates need to be added with trust before they can be accessed.

# API 
## Protected API 
```
const config = {
 .......
   auth: {
    api : true,
    api_user: 'admin',
    api_pass: 'nms2018',
  },
 
 ......
}
```
>Based on the basic auth，Please change your password.
>The default is not turned on

## Server stats
http://localhost:8000/api/server

```json
{
  "os": {
    "arch": "x64",
    "platform": "darwin",
    "release": "16.7.0"
  },
  "cpu": {
    "num": 8,
    "load": 12,
    "model": "Intel(R) Core(TM) i7-4790 CPU @ 3.60GHz",
    "speed": 3592
  },
  "mem": {
    "totle": 8589934592,
    "free": 754126848
  },
  "net": {
    "inbytes": 6402345,
    "outbytes": 6901489
  },
  "nodejs": {
    "uptime": 109,
    "version": "v8.9.0",
    "mem": {
      "rss": 59998208,
      "heapTotal": 23478272,
      "heapUsed": 15818096,
      "external": 3556366
    }
  },
  "clients": {
    "accepted": 207,
    "active": 204,
    "idle": 0,
    "rtmp": 203,
    "http": 1,
    "ws": 0
  }
}
```

## Streams stats
http://localhost:8000/api/streams

```json
{
  "live": {
    "s": {
      "publisher": {
        "app": "live",
        "stream": "s",
        "clientId": "U3UYQ02P",
        "connectCreated": "2017-12-21T02:29:13.594Z",
        "bytes": 190279524,
        "ip": "::1",
        "audio": {
          "codec": "AAC",
          "profile": "LC",
          "samplerate": 48000,
          "channels": 6
        },
        "video": {
          "codec": "H264",
          "width": 1920,
          "height": 1080,
          "profile": "Main",
          "level": 4.1,
          "fps": 24
        }
      },
      "subscribers": [
        {
          "app": "live",
          "stream": "s",
          "clientId": "H227P4IR",
          "connectCreated": "2017-12-21T02:31:35.278Z",
          "bytes": 18591846,
          "ip": "::ffff:127.0.0.1",
          "protocol": "http"
        },
        {
          "app": "live",
          "stream": "s",
          "clientId": "ZNULPE9K",
          "connectCreated": "2017-12-21T02:31:45.394Z",
          "bytes": 8744478,
          "ip": "::ffff:127.0.0.1",
          "protocol": "ws"
        },
        {
          "app": "live",
          "stream": "s",
          "clientId": "C5G8NJ30",
          "connectCreated": "2017-12-21T02:31:51.736Z",
          "bytes": 2046073,
          "ip": "::ffff:192.168.0.91",
          "protocol": "rtmp"
        }
      ]
    },
    "stream": {
      "publisher": null,
      "subscribers": [
        {
          "app": "live",
          "stream": "stream",
          "clientId": "KBH4PCWB",
          "connectCreated": "2017-12-21T02:31:30.245Z",
          "bytes": 0,
          "ip": "::ffff:127.0.0.1",
          "protocol": "http"
        }
      ]
    }
  }
}
```

# Remux to HLS/DASH live stream
```js
const NodeMediaServer = require('node-media-server');

const config = {
  rtmp: {
    port: 1935,
    chunk_size: 60000,
    gop_cache: true,
    ping: 30,
    ping_timeout: 60
  },
  http: {
    port: 8000,
    mediaroot: './media',
    allow_origin: '*'
  },
  trans: {
    ffmpeg: '/usr/local/bin/ffmpeg',
    tasks: [
      {
        app: 'live',
        hls: true,
        hlsFlags: '[hls_time=2:hls_list_size=3:hls_flags=delete_segments]',
        hlsKeep: true, // to prevent hls file delete after end the stream
        dash: true,
        dashFlags: '[f=dash:window_size=3:extra_window_size=5]',
        dashKeep: true // to prevent dash file delete after end the stream
      }
    ]
  }
};

var nms = new NodeMediaServer(config)
nms.run();
```

# Remux to RTMP/HLS/DASH live stream with audio transcode
```js
const NodeMediaServer = require('node-media-server');

const config = {
  rtmp: {
    port: 1935,
    chunk_size: 60000,
    gop_cache: true,
    ping: 30,
    ping_timeout: 60
  },
  http: {
    port: 8000,
    mediaroot: './media',
    allow_origin: '*'
  },
  trans: {
    ffmpeg: '/usr/local/bin/ffmpeg',
    tasks: [
      {
        app: 'live',
        vc: "copy",
        vcParam: [],
        ac: "aac",
        acParam: ['-ab', '64k', '-ac', '1', '-ar', '44100'],
        rtmp:true,
        rtmpApp:'live2',
        hls: true,
        hlsFlags: '[hls_time=2:hls_list_size=3:hls_flags=delete_segments]',
        dash: true,
        dashFlags: '[f=dash:window_size=3:extra_window_size=5]'
      }
    ]
  }
};

var nms = new NodeMediaServer(config)
nms.run();
```
>Remux to RTMP cannot use the same app name


# Record to MP4
```JS
const NodeMediaServer = require('node-media-server');

const config = {
  rtmp: {
    port: 1935,
    chunk_size: 60000,
    gop_cache: true,
    ping: 30,
    ping_timeout: 60
  },
  http: {
    port: 8000,
    mediaroot: './media',
    allow_origin: '*'
  },
  trans: {
    ffmpeg: '/usr/local/bin/ffmpeg',
    tasks: [
      {
        app: 'live',
        mp4: true,
        mp4Flags: '[movflags=frag_keyframe+empty_moov]',
      }
    ]
  }
};

var nms = new NodeMediaServer(config)
nms.run();
```

# Rtsp/Rtmp Relay
NodeMediaServer implement RTSP and RTMP relay with ffmpeg.

## Static pull
The static pull mode is executed at service startup and reconnect after failure.
It could be a live stream or a file. In theory, it is not limited to RTSP or RTMP protocol.

```
relay: {
  ffmpeg: '/usr/local/bin/ffmpeg',
  tasks: [
    {
      app: 'cctv',
      mode: 'static',
      edge: 'rtsp://admin:admin888@192.168.0.149:554/ISAPI/streaming/channels/101',
      name: '0_149_101',
      rtsp_transport : 'tcp' //['udp', 'tcp', 'udp_multicast', 'http']
    }, {
        app: 'iptv',
        mode: 'static',
        edge: 'rtmp://live.hkstv.hk.lxdns.com/live/hks',
        name: 'hks'
      }, {
        app: 'mv',
        mode: 'static',
        edge: '/Volumes/ExtData/Movies/Dancing.Queen-SD.mp4',
        name: 'dq'
      }
  ]
}
```

## Dynamic pull 
When the local server receives a play request.
If the stream does not exist, pull the stream from the configured edge server to local.
When the stream is not played by the client, it automatically disconnects.

```
relay: {
  ffmpeg: '/usr/local/bin/ffmpeg',
  tasks: [
    {
      app: 'live',
      mode: 'pull',
      edge: 'rtmp://192.168.0.20',
    }
  ]
}
```

## Dynamic push
When the local server receives a publish request.
Automatically push the stream to the edge server.

```
relay: {
  ffmpeg: '/usr/local/bin/ffmpeg',
  tasks: [
    {
      app: 'live',
      mode: 'push',
      edge: 'rtmp://192.168.0.10',
    }
  ]
}
```

# Fission
Real-time transcoding multi-resolution output
![fission](https://raw.githubusercontent.com/illuspas/resources/master/img/admin_panel_fission.png)
```
fission: {
  ffmpeg: '/usr/local/bin/ffmpeg',
  tasks: [
    {
      rule: "game/*",
      model: [
        {
          ab: "128k",
          vb: "1500k",
          vs: "1280x720",
          vf: "30",
        },
        {
          ab: "96k",
          vb: "1000k",
          vs: "854x480",
          vf: "24",
        },
        {
          ab: "96k",
          vb: "600k",
          vs: "640x360",
          vf: "20",
        },
      ]
    },
    {
      rule: "show/*",
      model: [
        {
          ab: "128k",
          vb: "1500k",
          vs: "720x1280",
          vf: "30",
        },
        {
          ab: "96k",
          vb: "1000k",
          vs: "480x854",
          vf: "24",
        },
        {
          ab: "64k",
          vb: "600k",
          vs: "360x640",
          vf: "20",
        },
      ]
    },
  ]
}
```

# Publisher and Player App/SDK

## Android Livestream App
https://play.google.com/store/apps/details?id=cn.nodemedia.qlive  
http://www.nodemedia.cn/uploads/qlive-release.apk  

## Android SDK
https://github.com/NodeMedia/NodeMediaClient-Android

## iOS SDK
https://github.com/NodeMedia/NodeMediaClient-iOS

## React-Native SDK
https://github.com/NodeMedia/react-native-nodemediaclient

## NodePlayer.js HTML5 live player
* Implemented with asm.js / wasm
* http-flv/ws-flv
* H.264/H.265 + AAC/Nellymoser/G.711 decoder
* Ultra low latency
* All modern browsers are supported

https://www.nodemedia.cn/product/nodeplayer-js/
