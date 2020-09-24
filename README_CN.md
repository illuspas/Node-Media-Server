# Node-Media-Server
[![npm](https://img.shields.io/node/v/node-media-server.svg)](https://nodejs.org/en/)
[![npm](https://img.shields.io/npm/v/node-media-server.svg)](https://npmjs.org/package/node-media-server)
[![npm](https://img.shields.io/npm/dm/node-media-server.svg)](https://npmjs.org/package/node-media-server)
[![npm](https://img.shields.io/npm/l/node-media-server.svg)](LICENSE)
[![Join the chat at https://gitter.im/Illuspas/Node-Media-Server](https://badges.gitter.im/Illuspas/Node-Media-Server.svg)](https://gitter.im/Illuspas/Node-Media-Server?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)

![logo](https://www.nodemedia.cn/uploads/site_logo.png)

一个 Node.js 实现的RTMP/HTTP/WebSocket/HLS/DASH流媒体服务器

## 微信赞赏码
![zan](https://nodemedia.oss-cn-hangzhou.aliyuncs.com/1531102579211.jpg)

# 特性
 - 跨平台支持 Windows/Linux/Unix
 - 支持的音视频编码 H.264/H.265/AAC/SPEEX/NELLYMOSER
 - 支持缓存最近一个关键帧间隔数据，实现RTMP协议秒开
 - 支持RTMP直播流转LIVE-HTTP/WS-FLV流,支持 [NodePlayer.js](https://www.nodemedia.cn/product/nodeplayer-js)  播放
 - 支持星域CDN风格的鉴权
 - 支持事件回调
 - 支持https/wss加密传输
 - 支持服务器和流媒体信息统计
 - 支持RTMP直播流转HLS,DASH直播流
 - 支持RTMP直播流录制为MP4文件并开启faststart
 - 支持RTMP/RTSP中继
 - 支持API控制中继
 - 支持实时多分辨率转码

# 用法 
## docker 版本
```bash
docker run --name nms -d -p 1935:1935 -p 8000:8000 illuspas/node-media-server
```

## git 版本
```bash
mkdir nms
cd nms
git clone https://github.com/illuspas/Node-Media-Server .
npm i
node app.js
```
>使用多核模式运行
```
node cluster.js
```
## npm 版本(推荐)
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

# 直播发布
## 使用 FFmpeg 推流
如果你有一个音视频编码为H.264+AAC的视频文件转为直播:
```bash
ffmpeg -re -i INPUT_FILE_NAME -c copy -f flv rtmp://localhost/live/STREAM_NAME
```

或者有个其他编码格式，需要转为h.264+AAC的编码再转直播:
```bash
ffmpeg -re -i INPUT_FILE_NAME -c:v libx264 -preset veryfast -tune zerolatency -c:a aac -ar 44100 -f flv rtmp://localhost/live/STREAM_NAME
```

## 使用 OBS 推流
>Settings -> Stream

Stream Type : Custom Streaming Server

URL : rtmp://localhost/live

Stream key : STREAM_NAME

# 播放直播流
## RTMP 流格式 
```bash
ffplay rtmp://localhost/live/STREAM_NAME
```

## http-flv 流格式
```bash
ffplay http://localhost:8000/live/STREAM_NAME.flv
```

## 使用 flv.js 播放 http-flv 流格式

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

## 使用 flv.js 播放 websocket-flv 流格式

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

# 鉴权验证
## 加密后的 URL 形式:
> rtmp://hostname:port/appname/stream?sign=expires-HashValue  
> http://hostname:port/appname/stream.flv?sign=expires-HashValue  
> ws://hostname:port/appname/stream.flv?sign=expires-HashValue  

1.原始推流或播放地址:
>rtmp://192.168.0.10/live/stream

2.配置验证秘钥为: 'nodemedia2017privatekey'，同时打开播放和发布的鉴权开关
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

3.请求过期时间为: 2017/8/23 11:25:21 ,则请求过期时间戳为:
>1503458721

4.md5计算结合“完整流地址-失效时间-密钥”的字符串:
>HashValue = md5("/live/stream-1503458721-nodemedia2017privatekey”)  
>HashValue = 80c1d1ad2e0c2ab63eebb50eed64201a

5.最终请求地址为
> rtmp://192.168.0.10/live/stream?sign=1503458721-80c1d1ad2e0c2ab63eebb50eed64201a  
> 注意：'sign' 关键字不能修改为其他的


# RTMP协议传输H.265视频
H.265并没有在Adobe的官方规范里实现，这里使用id 12作为标识，也是国内绝大多数云服务商使用的id号  
PC转码推流: [ffmpeg-hw-win32](#ffmpeg-hw-win32)  
手机播放:[NodeMediaClient-Android](#android) and [NodeMediaClient-iOS](#ios)  
纯JavaScrip 直播播放器: [NodePlayer.js](https://github.com/illuspas/NodePlayer.js)

# 事件回调
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

# Https/Wss 视频加密传输

## 生成证书
```bash
openssl genrsa -out privatekey.pem 1024
openssl req -new -key privatekey.pem -out certrequest.csr 
openssl x509 -req -in certrequest.csr -signkey privatekey.pem -out certificate.pem
```

## 配置 https支持
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
## 播放加密传输视频
```
https://localhost:8443/live/STREAM_NAME.flv
wss://localhost:8443/live/STREAM_NAME.flv
```
>Web浏览器播放自签名的证书需先添加信任才能访问

# API
## 保护API
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
>基于Basic auth提供验证，请注意修改密码，默认并未开启。

## 服务器信息统计
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

## 流信息统计
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


# 转 HLS/DASH 直播流

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
        dash: true,
        dashFlags: '[f=dash:window_size=3:extra_window_size=5]'
      }
    ]
  }
};

var nms = new NodeMediaServer(config)
nms.run();
```

# 直播录制为MP4文件

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


# Rtsp/Rtmp 中继
NodeMediaServer 使用ffmpeg实现RTMP/RTSP的中继服务。

## 静态拉流
静态拉流模式在服务启动时执行，当发生错误时自动重连。可以是一个直播流，也可以是一个本地文件。理论上并不限制是RTSP或RTMP协议

```
relay: {
  ffmpeg: '/usr/local/bin/ffmpeg',
  tasks: [
    {
      app: 'cctv',
      mode: 'static',
      edge: 'rtsp://admin:admin888@192.168.0.149:554/ISAPI/streaming/channels/101',
      name: '0_149_101'
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

## 动态拉流
当本地服务器收到一个播放请求，如果这个流不存在，则从配置的边缘服务器拉取这个流。当没有客户端播放这个流时，自动断开。

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

### 动态推流
当本地服务器收到一个发布请求，自动将这个流推送到边缘服务器。

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

# 实时多分辨率转码
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

# 推流与播放 App/SDK

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
* 使用 asm.js / wasm 实现
* http-flv/ws-flv 协议
* H.264/H.265 + AAC/Nellymoser/G.711 解码器
* 超低延迟，自动消累积延迟 (支持 iOS safari 浏览器)

## Windows 浏览器插件(ActiveX/NPAPI)
* H.264/H.265+AAC rtmp 推流器
* 摄像头/桌面 + 麦克风 捕获
* Nvidia/AMD/Intel 硬件加速的编解码器
* 超低延迟的 rtmp/rtsp/http 直播播放器
* 只有6M大小的安装包

http://www.nodemedia.cn/products/node-media-client/win/

# 感谢
Sorng Sothearith, standifer1023, floatflower, Christopher Thomas, strive, jaysonF, 匿名, 李勇, 巴草根, ZQL, 陈勇至, -Y, 高山流水, 老郭, 孙建, 不说本可以, Jacky, 人走茶凉，树根, 疯狂的台灯, 枫叶, lzq, 番茄, smicroz , kasra.shahram, 熊科辉, Ken Lee , Erik Herz, Javier Gomez, trustfarm, leeoxiang, Aaron Turner， Anonymous  

感谢你们的大力支持！

