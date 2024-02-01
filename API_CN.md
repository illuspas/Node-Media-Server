
- [中继服务](#中继服务)
  - [获取全部任务接口](#获取全部任务接口)
    - [请求URL](#请求url)
    - [请求方式](#请求方式)
    - [返回参数](#返回参数)
    - [返回示例](#返回示例)
  - [根据sessionID获取单个任务接口](#根据sessionid获取单个任务接口)
    - [请求URL](#请求url-1)
    - [请求方式](#请求方式-1)
    - [返回参数](#返回参数-1)
    - [返回示例](#返回示例-1)
  - [根据应用名称和媒体流名称获取中继任务接口](#根据应用名称和媒体流名称获取中继任务接口)
    - [请求URL](#请求url-2)
    - [请求方式](#请求方式-2)
    - [返回参数](#返回参数-2)
    - [返回示例](#返回示例-2)
  - [创建中继任务](#创建中继任务)
    - [请求URL](#请求url-3)
    - [请求方式](#请求方式-3)
    - [提交参数](#提交参数)
    - [返回参数](#返回参数-3)
    - [返回示例](#返回示例-3)
  - [创建拉流任务](#创建拉流任务)
    - [请求URL](#请求url-4)
    - [请求方式](#请求方式-4)
    - [提交参数](#提交参数-1)
    - [返回参数](#返回参数-4)
    - [返回示例](#返回示例-4)
  - [创建推流任务](#创建推流任务)
    - [请求URL](#请求url-5)
    - [请求方式](#请求方式-5)
    - [提交参数](#提交参数-2)
    - [返回参数](#返回参数-5)
    - [返回示例](#返回示例-5)
  - [删除任务](#删除任务)
    - [请求URL](#请求url-6)
    - [请求方式](#请求方式-6)
    - [返回参数](#返回参数-6)
    - [返回示例](#返回示例-6)
- [服务器](#服务器)
  - [获取服务器信息](#获取服务器信息)
    - [请求URL](#请求url-7)
    - [请求方式](#请求方式-7)
    - [返回参数](#返回参数-7)
    - [返回示例](#返回示例-7)
- [媒体流](#媒体流)
  - [新增转换任务接口(我觉得这个接口未完成)](#新增转换任务接口我觉得这个接口未完成)
    - [请求URL](#请求url-8)
    - [请求方式](#请求方式-8)
    - [提交参数](#提交参数-3)
    - [返回参数](#返回参数-8)
    - [返回示例](#返回示例-8)
  - [获取当前全部媒体流](#获取当前全部媒体流)
    - [请求URL](#请求url-9)
    - [请求方式](#请求方式-9)
    - [返回参数](#返回参数-9)
    - [返回示例](#返回示例-9)
  - [根据应用名称和媒体名称获取媒体流](#根据应用名称和媒体名称获取媒体流)
    - [请求URL](#请求url-10)
    - [请求方式](#请求方式-10)
    - [返回参数](#返回参数-10)
    - [返回示例](#返回示例-10)
  - [根据应用名称和媒体名称获取媒体流](#根据应用名称和媒体名称获取媒体流-1)
    - [请求URL](#请求url-11)
    - [请求方式](#请求方式-11)
    - [返回示例](#返回示例-11)

### 全局请求头
| 参数名  | 参数值 | 说明 |
| :- | :-: | :-: |
| Content-Type | application/json | 传输内容类型 |

## 中继服务

### 获取全部任务接口

#### 请求URL
- /api/relay

#### 请求方式
- GET

#### 返回参数
| 参数名  | 参数类型 | 说明 |
| :- | :-: | :-: |
| app | Object | 应用的名称 |  
| stream | Object | 流的名称 |  
| relays | Object | 中继列表 |  
| relays[].app | String | 应用名称 |  
| relays[].name | String | 中继任务名称 |  
| relays[].path | String | 中继任务源地址 |  
| relays[].url | String | 中继任务目标地址 |  
| relays[].mode | String | 中继任务模式 |  
| relays[].ts | Number | 中继任务开始时间 |  
| relays[].id | String | 中继任务ID |

#### 返回示例
```JSON
{
    "app": {
        "stream": {
            "relays": [
                {
                    "app": "xxx",
                    "name": "xxx",
                    "path": "",
                    "url": "xxx",
                    "mode": "xxx",
                    "ts": ,
                    "id": "xxx"
                }
            ]
        }
    }
}
```

### 根据sessionID获取单个任务接口

#### 请求URL
- /api/relay/:sessionID

#### 请求方式
- GET

#### 返回参数
| 参数名 | 数据类型 | 说明 |
| :- | :-: | :-: |
| app | String | 应用名 |
| name | String | 媒体流名称 |
| path | String | 中继任务源地址 |
| url | String | 中继任务目标地址 |
| mode | String | 中继任务模式(pull, push, relay) |
| ts | Number | 中继任务开始时间 |
| id | String | 中继任务ID |

#### 返回示例
```JSON
[
    "app": "xxx",
    "name": "xxx",
    "path": "",
    "url": "xxx",
    "mode": "xxx",
    "ts": "xxx",
    "id": "xxx"
]
```

### 根据应用名称和媒体流名称获取中继任务接口

#### 请求URL
- /api/relay/:app/:stream

#### 请求方式
- GET

#### 返回参数
| 参数名 | 数据类型 | 说明 |
| :- | :-: | :-: |
| app | String | 应用名 |
| name | String | 媒体流名称 |
| path | String | 中继任务源地址 |
| url | String | 中继任务目标地址 |
| mode | String | 中继任务模式(pull, push, relay) |
| ts | Number | 中继任务开始时间 |
| id | String | 中继任务ID |

#### 返回示例
```JSON
[
    "app": "xxx",
    "name": "xxx",
    "path": "",
    "url": "xxx",
    "mode": "xxx",
    "ts": "xxx",
    "id": "xxx"
]
```

### 创建中继任务

#### 请求URL
- /api/relay/task

#### 请求方式
- POST

#### 提交参数
| 参数名  | 参数类型 | 说明 |
| :- | :-: | :-: |
| path | String | 源地址 |
| url | String | 目标地址 |

#### 返回参数
任务id

#### 返回示例
```text
abcdefg0
```

### 创建拉流任务

#### 请求URL
- /api/relay/pull

#### 请求方式
- POST

#### 提交参数
| 参数名  | 参数类型 | 说明 |
| :- | :-: | :-: |
| url | String | 输入路径 |
| app | String | 应用名称 |
| name | String | 媒体流名称 |
| rtsp_transport | String | rtsp流传输方式(udp，tcp， udp_multicast，http，https ) |

#### 返回参数
任务id

#### 返回示例
```text
abcdefg0
```

### 创建推流任务

#### 请求URL
- /api/relay/push

#### 请求方式
- POST

#### 提交参数
| 参数名  | 参数类型 | 说明 |
| :- | :-: | :-: |
| url | String | 输入路径 |
| app | String | 应用名称 |
| name | String | 媒体流名称 |

#### 返回参数
任务id

#### 返回示例
```text
abcdefg0
```

### 删除任务

#### 请求URL
- /api/relay/:sessionID

#### 请求方式
- DELETE

#### 返回参数
OK 或者 Not found

#### 返回示例
HTTP status 200
```text
OK
```

## 服务器

### 获取服务器信息

#### 请求URL
- /api/server

#### 请求方式
- GET

#### 返回参数
| 参数名  | 参数类型 | 说明 |
| :- | :-: | :-: |
| os.arch | String | 系统类型 |
| os.platform | String | 系统平台 |
| os.release | String | 系统版本 |
| cpu.num | Number | 处理器数量 |
| cpu.load | Number | 处理器负载 |
| cpu.model | String | 处理器型号 |
| cpu.speed | Number | 处理器主频 |
| cpu.num | Number | 处理器数量 |
| mem.totle | Number | 内存总量 |
| men.free | String | 剩余内存 |
| net.inbytes | Number | 当前入站流量 |
| net.outbytes | Number | 当前出站流量 |
| nodejs.uptime | Number | nodejs更新时间 |
| nodejs.version | String | nodejs版本 |
| client.accepted | Number | 当前连接数量 |
| client.active | Number | 活跃数 |
| client.idle | Number | 闲置播放器数量 |
| client.rtmp | Number | rtmp客户端数量 |
| client.http | Number | http客户端数量 |
| client.ws | Number | websocket客户端数量 |

#### 返回示例
```JSON
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

## 媒体流

### 新增转换任务接口(我觉得这个接口未完成)

#### 请求URL
- /api/streams/trans

#### 请求方式
- POST

#### 提交参数
| 参数名  | 参数类型 | 说明 |
| - | :-: | :-: |
| app | String | 服务名 |
| hls | 是否启动hls |
| hlsFlags | String | hls配置 |
| ac | Array | 中转任务列表 |
| vc | String | 应用名称 |
| dash | String | 是否启动dash |
| dashFlags | String | dash配置 |

#### 返回参数
| 参数名  | 参数类型 | 说明 |
| - | :-: | :-: |
| message | String | 消息 |

#### 返回示例
```JSON
{
  "message": "OK Success"
}
```

### 获取当前全部媒体流

#### 请求URL
- /api/streams

#### 请求方式
- GET

#### 返回参数
| 参数名 | 数据类型 | 说明 |
| :- | :-: | :-: |
| app | Object | 应用的名称。 |  
| stream | Object | 流的名称。 |  
| publisher.app | String | 发布者应用的名称。 |  
| publisher.stream | String | 发布者流的名称。 |  
| publisher.clientId | String | 发布者的客户端ID。 |  
| publisher.connectCreated | Date/Time | 发布者连接创建的时间戳。 |  
| publisher.bytes | Number | 发布者发送的数据量（字节）。 |  
| publisher.ip | String | 发布者的IP地址。 |  
| publisher.audio.codec | String | 音频编码格式。 |  
| publisher.audio.profile | String | 音频编码配置。 |  
| publisher.audio.samplerate | Number | 音频采样率。 |  
| publisher.audio.channels | Number | 音频通道数。 |  
| publisher.video.codec | String | 视频编码格式。 |  
| publisher.video.width | Number | 视频宽度。 |  
| publisher.video.height | Number | 视频高度。 |  
| publisher.video.profile | String | 视频编码配置。 |  
| publisher.video.level | Number | 视频编码级别。 |  
| publisher.video.fps | Number | 视频帧率。 |
| subscribers[].app | String | 订阅者应用的名称。 |  
| subscribers[].stream | String | 订阅者流的名称。 |  
| subscribers[].clientId | String | 订阅者的客户端ID。 |  
| subscribers[].connectCreated | Date/Time | 订阅者连接创建的时间戳。 |  
| subscribers[].bytes | Number | 订阅者接收的数据量（字节）。 |  
| subscribers[].ip | String | 订阅者的IP地址。 |  
| subscribers[].protocol | String | 订阅者使用的协议（如http、ws、rtmp等）。 |

#### 返回示例
```JSON
{
  "app": {
    "stream": {
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
    "stream2": {
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

### 根据应用名称和媒体名称获取媒体流

#### 请求URL
- /api/streams/:app/:stream

#### 请求方式
- GET

#### 返回参数
| 参数名 | 数据类型 | 说明 |
| :- | :-: | :-: |
| isLive | Boolean | 是否是还开着 |
| viewers | Number | 观看者数量 |
| duration | Number | 持续时长 |
| bitrate | Number | 比特率 |
| startTime | Number | 开始时间 |
| arguments | Object | 参数 |

#### 返回示例
```JSON
{
  isLive: false,
  viewers: 0,
  duration: 0,
  bitrate: 0,
  startTime: null,
  arguments: {}
}
```

### 根据应用名称和媒体名称获取媒体流

#### 请求URL
- /api/streams/:app/:stream

#### 请求方式
- DELETE

#### 返回示例
HTTP status 200
```JSON
ok
```