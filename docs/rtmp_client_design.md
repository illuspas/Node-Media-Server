# RTMP Client 设计(拉流 + 推流)

> 参考 `src/protocol/rtsp_client.js` 的 `RtspClient` 设计,为 RTMP 协议设计一个对称的客户端实现,
> 支持**拉流**(RTMP pull,作为播放器把远端流引入本机广播)和**推流**(RTMP push,把本机流转发到远端服务器)。

## 1. 现状与动机

| 组件 | 现状 | 问题 |
|------|------|------|
| `src/protocol/rtmp.js` (`Rtmp`) | 服务端实现:被动完成 C0/C1/C2 握手,应答 `connect/createStream/publish/play` | 无法主动连接远端 RTMP 服务器 |
| `src/protocol/rtsp_client.js` (`RtspClient`) | 客户端实现:Promise 化信令、认证、interleaved 数据解析、心跳、超时检测 | 仅支持 RTSP |
| `src/server/relay_manager.js` | 管理 RTSP 拉流任务(`RtspSession`) | 只支持 `rtsp://` 源 |

目标:新增 `RtmpClient` 协议类 + `RtmpClientSession` 会话类,使 Relay 任务同时支持 `rtmp://` 拉流与推流(转推)。

## 2. 文件布局

```
src/protocol/rtmp_client.js        # RTMP 客户端协议:握手、信令、chunk 收发(复用 rtmp.js)
src/session/rtmp_client_session.js # 会话封装:拉流→BroadcastServer 发布 / 推流→订阅转发
src/server/relay_manager.js        # 扩展:根据 URL scheme 分发到 RtspSession / RtmpClientSession
```

## 3. 协议层:`RtmpClient`(src/protocol/rtmp_client.js)

### 3.1 与 `Rtmp` 的关系:继承 + 复用

`Rtmp` 的 chunk 层(解析状态机、`chunksCreate`、`RtmpPacket`)与视角无关,直接复用;
差异只在**握手方向**和**信令方向**,通过继承 override:

```
Rtmp (服务端)                    RtmpClient extends Rtmp (客户端)
─────────────                    ─────────────────────────────
等待 C0C1 → 回 S0S1S2    │       主动发 C0C1 → 收 S0S1S2 → 发 C2
parserData() 状态机       │       重写 handshake 状态机(见 3.2)
invokeHandler: 收命令并应答 │       invokeHandler: 收 _result/onStatus 并派发 Promise
respondConnect/respondPlay │       sendConnect/sendCreateStream/sendPlay/sendPublish
```

复用点(均为 `Rtmp` 已有成员):
- `chunkRead / packetParse / packetHandler / controlHandler`:入向 chunk 解析,原样可用;
- `Rtmp.chunksCreate / chunkBasicHeaderCreate / chunkMessageHeaderCreate`:出向打包,静态方法直接用;
- `sendInvokeMessage / sendDataMessage / sendACK / sendWindowACK`:出向信令,直接用。

### 3.2 握手(客户端方向)

参考 `RtspClient` 的状态机风格,握手阶段独立于 chunk 解析:

```
RTMP_HANDSHAKE_C0C1: 连接建立后立即发送 C0(version=3) + C1(1536B,时间戳+零+随机数)
RTMP_HANDSHAKE_S0S1: 收 S0(1B 校验 version) + S1(1536B)后立即回 C2(= S1 内容回显)
RTMP_HANDSHAKE_S2:   收 S2(1536B,与 C1 比对,宽松处理不校验)→ 进入 chunk 阶段
```

> 简单握手即可满足绝大多数服务器(nginx-rtmp、SRS、本服务)。复杂握手的
> `generateS1/generateS2` 已在 rtmp.js 中实现,若后续需要对接 FMS 级校验的服务器再扩展。

### 3.3 信令:Promise 化 + transId 匹配(对标 RtspClient 的 CSeq 机制)

RTMP 用 `transId` 匹配请求/响应,与 RTSP 的 `CSeq` 完全同构:

```javascript
/** @type {Map<number, RtmpPendingCommand>} transId -> pending */
this.pendingCommands = new Map();

/**
 * @typedef {object} RtmpPendingCommand
 * @property {string} cmd - "connect" | "createStream"
 * @property {function(RtspResponseLike): void} resolve
 * @property {function(Error): void} reject
 */
```

`invokeHandler` 重写后的派发逻辑:

| 收到的命令 | 处理 |
|-----------|------|
| `_result`(transId 匹配 connect) | 解析 `info.code`,resolve;缓存 msid(`info` 即 stream id) |
| `_result`(transId 匹配 createStream) | 缓存服务器分配的 `streamId`(`info` 字段),resolve |
| `onStatus` | 按 `info.code` 派发:`NetStream.Play.Start` / `NetStream.Publish.Start` → resolve 播放/发布 Promise;`NetStream.Play.Failed` / `NetStream.Publish.BadName` 等 → reject 并回调 `onStatusCallback` |
| `onMetaData` / `@setDataFrame` | 经 `dataHandler` 走 AVPacket,不需信令处理 |
| `close` / `deleteStream` | 服务器主动断开的通知,触发 `onCloseCallback` |

音视频数据路径完全复用:`RTMP_TYPE_AUDIO/VIDEO/DATA` → `Flv.parserTag` → `onPacketCallback(AVPacket)`,与现有 `Rtmp` 一致。

### 3.4 对外接口(对标 RtspClient 的方法族)

```javascript
class RtmpClient extends Rtmp {
  /** 连接并完成握手 @param {string} rtmpUrl @returns {Promise<void>} */
  connect = (rtmpUrl) => {};
  /** 断开并清理 @returns {Promise<void>} 发送 deleteStream 后 destroy */
  disconnect = () => {};

  // ── 信令(内部自动串 transId) ──
  /** connect(app, tcUrl) → 期望 _result(NetConnection.Connect.Success) */
  sendConnect = () => {};
  /** createStream() → 期望 _result,返回 streamId */
  sendCreateStream = () => {};
  /** play(streamName) → 期望 onStatus(NetStream.Play.Start) */
  sendPlay = (streamName) => {};
  /** publish(streamName, type="live") → 期望 onStatus(NetStream.Publish.Start) */
  sendPublish = (streamName) => {};
  /** 发送 |setDataFrame(onMetaData) 预发元数据(推流时) */
  sendMetaData = (metaData) => {};

  // ── 媒体(推流方向;拉流方向复用 onPacketCallback) ──
  /** AVPacket → Rtmp.createMessage → onOutputCallback(由 socket 写出) */
  sendPacket = (avpacket) => {};

  // ── 回调(与 RtspClient 命名对齐) ──
  onPacketCallback(avpacket);   // 拉流:收到远端媒体数据
  onStatusCallback(code, info); // 双向:onStatus 事件
  onCloseCallback(hadError);
  onErrorCallback(error);
}
```

### 3.5 URL 解析与鉴权(对标 `RtspClient.parseUrl`)

```
rtmp://user:pass@host:1935/app/streamName?param=value
```

RTMP 无 401 挑战机制。约定:
- `user:pass` 不放进 `connect` 命令(多数服务器不支持),而是以 `?user=xx&password=xx`
  追加到 `streamName`(本服务端 `rtmp.js onPublish` 已按 `streamName.split("?")` 解析 query,天然兼容);
- 提供 `static parseUrl(rtmpUrl)` 返回 `{host, port, app, streamName, query}`。

### 3.6 保活与超时(对标 RtspClient 的 heartbeat)

- **心跳**:发送 User Control `PingRequest`(event type 6,payload = 4 字节递增序列号),间隔 30s;
- **超时判定**:`lastActivityTime` 超过 60s 无任何数据(`isTimedOut()`),由会话层触发重连;
- **窗口应答**:收到服务端 `WindowACK` 后按 `ackSize` 周期回 `sendACK`(复用现有方法)。

## 4. 会话层:`RtmpClientSession`(src/session/rtmp_client_session.js)

参考 `RtmpSession`(服务端会话)与 `RtspSession`(拉流会话)的组合方式,`extends BaseSession`,两种模式:

### 4.1 拉流模式(pull,`mode: "pull"`)

```
run():
  1. rtmpClient.connect(url)                    # TCP + 握手
  2. sendConnect() → sendCreateStream() → sendPlay(streamName)
  3. onStatus(NetStream.Play.Start) 后:
     - 注册为该 streamPath 的发布者:broadcast.postPublish(this)
     - isPublisher = true(对本服务而言,它是输入源)
  4. onPacketCallback(avpacket):
     - 首包若为 metadata → 先广播(转推场景需要 gop 前置)
     - broadcast.broadcastMessage(avpacket)      # 与 RtmpSession.onPacket 相同
```

### 4.2 推流模式(push,`mode: "push"`)

```
run():
  1. rtmpClient.connect(url)
  2. sendConnect() → sendCreateStream() → sendPublish(streamName)
  3. onStatus(NetStream.Publish.Start) 后:
     - broadcast = Context.broadcasts.get(localStreamPath)
     - broadcast.postPlay(this)                  # 作为订阅者挂到本地广播组
  4. sendBuffer(metadata/avpacket):              # BaseSession 钩子,BroadcastServer 会调用
     - rtmpClient.sendPacket(avpacket)
  5. 断开时:broadcast.donePlay(this)
```

> 推流方向的兼容点:`BroadcastServer` 调度订阅者用的是 `session.sendBuffer()`
> (见 `RtmpSession.sendBuffer`),因此推流会话只需实现该方法即可接入现有广播体系,零改动。

### 4.3 重连策略(对标 RelayManager 的 reconnect 语义)

```
- 拉流:断开后按 reconnectInterval * 2^n 退避重试(maxReconnectAttempts=0 表示无限)
- 推流:源流还在(Context.broadcasts 中存在)时才重连,否则静默退出
- 每次重连完整走一遍 connect → 信令 → 状态同步
```

### 4.4 生命周期与 Context 注册

- 会话创建后仍注册进 `Context.sessions`,与现有统计/管理 API 兼容;
- 新增 `getStatus()`(URL、模式、重连次数、收发字节),供 RelayManager 汇总。

## 5. RelayManager 集成

`addTask(config)` 按 scheme 分发(保持现有 API 不变):

```javascript
const scheme = new URL(config.url).protocol;
const SessionCls = scheme === "rtsp:" ? RtspSession : RtmpClientSession;
// config.url 为 rtmp:// 时:pull 模式;config.mode === "push" 时:push 模式
```

推流任务的方向相反,登记 key 建议用 `push:${remoteUrl}` 避免与拉流的 `streamPath` 冲突。

## 6. 时序图

### 拉流(pull)

```
RtmpClientSession        RtmpClient                远端RTMP服务器
      │ run() ───────────▶ connect(url) ─────────▶ TCP connect
      │                    C0C1 ─────────────────▶
      │                    ◀───────────────────── S0S1
      │                    C2 ──────────────────▶
      │                    ◀───────────────────── S2
      │                    connect(app) ────────▶
      │                    ◀── _result(Connect.Success)
      │                    createStream ─────────▶
      │                    ◀── _result(streamId)
      │                    play(name) ──────────▶
      │                    ◀── onStatus(Play.Start)
      │ ◀─ onStatusCallback ┤
      │ broadcast.postPublish(this)
      │ ◀─ onPacketCallback(avpacket) ─┤ ◀── A/V/DATA chunks
      │ broadcast.broadcastMessage(pkt) │
```

### 推流(push)

```
本地BroadcastServer    RtmpClientSession      RtmpClient           远端RTMP服务器
      │ postPlay(subscriber) │                    │                     │
      │                      │ connect+握手+信令 ─▶│ publish(name) ────▶ │
      │                      │                    │ ◀─ onStatus(Publish.Start)
      │ sendBuffer(avpacket) │                    │                     │
      │ ───────────────────▶ │ sendPacket ──────▶ │ ── A/V chunks ────▶ │
```

## 7. 关键实现细节清单

1. **chunk size 协商**:客户端收发各自独立。发送侧先 `setChunkSize(RTMP_MAX_CHUNK_SIZE)`(在 connect 前发,与 `Rtmp.onConnect` 顺序一致);接收侧由 `controlHandler` 自动更新 `inChunkSize`,无需干预。
2. **streamId 使用**:所有 `play/publish/onStatus` 均带 `createStream` 返回的 msid(消息头 stream_id 字段),`sendInvokeMessage(sid, opt)` 已支持。
3. **时间戳**:拉流方向 `parserPacket.clock` 即绝对 dts,直接进 AVPacket;推流方向首包 timestamp 用 0 起步,后续沿用 AVPacket.dts 与源对齐(`Rtmp.createMessage` 已按 dts 写)。
4. **metadata 透传**:推流时若本地广播组已有 metadata AVPacket(codec_type=18),在 publish 成功后、首帧前重发一次 `|setDataFrame`,保证远端播放器可解码。
5. **GC 安全**:socket `close` 时必须 `pendingCommands` 全部 reject(参考 `rejectAllPending`),防止 Promise 泄漏;`disconnect()` 要 `stopHeartbeat()`。
6. **不做的事**:不实现 RTMPS(tls)以外的高级特性聚合消息拆分由现有 `packetHandler` 的 type 22 兜底即可;不支持 AMF3 命令(现有 `Rtmp` 同样只走 AMF0,保持一致)。

## 8. 测试方案(手动)

```bash
# 1. 拉流:本服务起一路源,用客户端拉到另一实例
ffmpeg -re -i input.mp4 -c copy -f flv rtmp://localhost:1935/live/src
# 通过 API 添加 pull 任务: rtmp://localhost:1935/live/src → /live/relay
ffplay rtmp://localhost:1935/live/relay

# 2. 推流:把本服务的 /live/src 转推到远端
# 通过 API 添加 push 任务: /live/src → rtmp://remote:1935/live/forward

# 3. 异常路径:远端拒绝(stream 已存在)、断网重连、鉴权 query 透传
```
