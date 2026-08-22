# RTMP Client 实施方案与 Todo

## 1. 目标与范围

依据 `docs/rtmp-client-design.md`，新增主动 RTMP 客户端能力：

- `rtmp://` 拉流：连接远端、完成握手和 RTMP 信令，将远端音视频/metadata 注入本地 `BroadcastServer`。
- `rtmp://` 推流：订阅本地广播，将 metadata 和 AVPacket 转发到远端 RTMP 服务。
- RelayManager 统一管理 RTSP 拉流、RTMP 拉流和 RTMP 推流，保留现有 RTSP API 兼容性。
- 提供重连、心跳、超时、状态统计和完整资源清理。

不在本次范围内：RTMPS/TLS、AMF3 命令、复杂握手校验和新的第三方依赖。

## 2. 当前架构分析与约束

1. `src/protocol/rtmp.js` 已包含 chunk 解析/打包、控制消息、AMF0 invoke、媒体到 `AVPacket` 的转换；服务端握手和服务端方向 invoke 需要由客户端子类覆盖。
2. `RtspClient` 已提供可参考的 Promise 信令、回调、心跳、pending 请求清理和连接生命周期模式。
3. `RtspSession` 已体现 Relay 会话的重连、`Context.sessions` 注册和 `BroadcastServer.postPublish` 接入方式。
4. `BroadcastServer.postPlay()` 会向订阅者发送缓存的 metadata、编码头和 GOP；RTMP 推流会话应在远端 publish 成功后调用它，并实现 `sendBuffer()`。
5. 当前 `RelayManager` 和 API 仅命名为 RTSP 拉流：`addTask` 读取 `rtspUrl`，API `POST /relay` 固定调用 `addPull`。实施时使用兼容配置归一化：
   - 拉流旧格式：`{ rtspUrl, streamPath, ... }`；
   - 通用格式：`{ url, streamPath, mode: "pull", ... }`；
   - 推流格式：`{ url: "rtmp://...", mode: "push", streamPath: "/live/src", ... }`，其中 `streamPath` 表示本地源；
   - RTMP 推流任务键使用 `push:${url}`，避免与本地拉流输出路径冲突。
6. `Context` 当前未声明 `relayManager` 属性，需延续现有运行时注入方式，并补充 JSDoc 类型即可。

## 3. 目标结构

```text
src/protocol/rtmp_client.js
  RtmpClient extends Rtmp
  ├─ TCP 连接与 C0/C1/S0/S1/S2/C2 握手
  ├─ transId pending command Promise
  ├─ connect/createStream/play/publish/deleteStream
  ├─ RTMP data/control/media 收发
  └─ heartbeat/timeout/callback/error cleanup

src/session/rtmp_client_session.js
  RtmpClientSession extends BaseSession
  ├─ pull: remote play -> local BroadcastServer publisher
  └─ push: local BroadcastServer subscriber -> remote publish

src/server/relay_manager.js
  URL scheme + mode -> RtspSession / RtmpClientSession

src/api/handlers/relay.js
  兼容 RTSP pull，并校验/转发 RTMP pull/push 配置
```

## 4. 分阶段实施方案

### 阶段 A：协议层骨架和连接握手

1. 从 `Rtmp` 继承，复用 `parserData` 之后的 chunk parser、`RtmpPacket`、静态 chunk/message 创建方法和 ACK/control 发送方法。
2. 实现 `parseUrl()`：校验 `rtmp:` scheme，默认端口 1935，解析 `host/port/app/streamName/query`；用户名/密码按设计转为 stream query，不将凭据放入 connect 对象。
3. 实现 socket 连接和状态重置；连接后发送版本 3、时间戳/随机数 C1。
4. 分离客户端握手状态：接收并校验 S0 version，缓存 S1 后立即回显 C2，接收 S2 后才进入 chunk 解析。
5. socket `data` 必须按握手剩余字节和 chunk 剩余字节正确切分，避免粘包/半包。

### 阶段 B：RTMP 信令、媒体和保活

1. 用递增 `transId` 建立 `pendingCommands`，所有 pending 在 close/disconnect/error 时 reject。
2. 实现 `sendConnect()`、`sendCreateStream()`、`sendPlay()`、`sendPublish()`、`sendMetaData()` 和 `sendPacket()`；所有 play/publish 命令使用 createStream 返回的 stream id。
3. 重写 `invokeHandler()`：
   - `_result` 按 transId 分派 connect/createStream；
   - `onStatus` 根据 `NetStream.Play.Start`、`NetStream.Publish.Start` resolve；
   - 失败状态 reject 并调用 `onStatusCallback`；
   - `onMetaData`/`@setDataFrame` 继续走已有 data-to-AVPacket 路径；
   - `close`/`deleteStream` 触发关闭回调。
4. 确认 incoming audio/video/data 经过现有 FLV parser 后调用 `onPacketCallback`；发送方向使用 `Rtmp.createMessage()`。
5. 设置 30 秒 PingRequest 心跳，维护 `lastActivityTime` 和 60 秒超时判断；按窗口 ACK 周期回 ACK。
6. `disconnect()` 停止心跳、清空 pending、销毁 socket、重置 parser，确保重复 close 安全。

### 阶段 C：会话层

1. 新建 `RtmpClientSession`，统一保存 `url`、`mode`、远端解析字段、本地 `streamPath`、重连参数和字节统计。
2. Pull：
   - `connect -> sendConnect -> sendCreateStream -> sendPlay`；
   - 注册 `Context.broadcasts.get(streamPath)` 或新建广播，并 `postPublish(this)`；
   - 收到 AVPacket 后 `broadcast.broadcastMessage(packet)`；
   - 断开时 `donePublish`，删除 `Context.sessions`。
3. Push：
   - `connect -> sendConnect -> sendCreateStream -> sendPublish`；
   - 发布成功后查找本地 `Context.broadcasts.get(streamPath)`，调用 `postPlay(this)`；
   - `sendBuffer(buffer)` 将广播的 RTMP FLV message 转发到客户端；若广播实现传入 AVPacket，则统一转换后发送，不能重复编码；
   - 断开时 `donePlay(this)`。
4. metadata 处理必须保证远端 publish 成功后、首帧前发送一次；复用广播缓存，避免丢失编码参数。
5. 实现指数退避重连并设置上限；pull 按配置重连，push 仅在本地源广播仍存在时重连；每次重连重新握手、信令和状态注册。
6. `getStatus()` 返回 id、protocol、mode、url、streamPath、连接状态、重连次数、收发字节和时间信息。

### 阶段 D：Relay/API 集成

1. `RelayManager.tasks` 类型改为 `Map<string, RtspSession | RtmpClientSession>`，`addTask()` 根据 `new URL(url).protocol` 和 `mode` 选择会话类。
2. 对 RTSP 保留 `rtspUrl` 输入和原 streamPath 任务键；对 RTMP pull 使用输出 streamPath；对 RTMP push 使用 `push:${url}`。
3. `removeTask()`、`getTaskStatus()`、`listTasks()` 统一使用任务键，并在 API 层明确返回实际 status 中的 key/mode。
4. 扩展 `RelayHandler.addPull` 的输入归一化和校验，支持通用 `url`、`mode`，同时兼容旧 `rtspUrl`；push 必须要求本地 `streamPath`，pull 必须要求输出 `streamPath`。
5. 更新 handler 注释、错误信息和接口示例；路由保持 `/api/v1/relay` 不变，避免破坏现有客户端。

### 阶段 E：验证与文档

1. 运行 ESLint，重点检查新增协议/会话文件和修改的 Relay 文件。
2. 用两个本服务实例或 nginx-rtmp/SRS 验证 pull、push、metadata、GOP 缓存和异常重连。
3. 验证远端拒绝、重复 publish、断网、超时、鉴权 query 透传、删除任务和 RelayManager.stop。
4. 将 API 请求样例、RTMP pull/push 配置和限制补充到相关文档（如项目已有 Relay API 文档，则更新该文档；否则保持本设计文档作为实现依据）。

## 5. 风险与决策

| 风险 | 处理 |
|---|---|
| 握手与 chunk 数据粘包 | 独立握手 buffer/计数器，只把握手完成后的剩余 buffer 交给 `parserData`。 |
| 服务端响应顺序或缺少 `_result` | pending 必须按 transId 匹配；未知命令记录并按回调处理，不 resolve 错误 Promise。 |
| 推流缓存格式与 `sendBuffer` 不一致 | 明确 BroadcastServer 对 RTMP subscriber 输出的是已打包 Buffer，协议层只负责 socket 写出。 |
| 重连期间旧广播注册残留 | 每次失败/关闭先幂等清理 publisher/subscriber，再建立新连接。 |
| API 字段变更破坏旧调用方 | 保留 `rtspUrl`，新增 `url`/`mode`，拒绝 scheme 与 mode 不匹配的配置。 |
| 当前无自动化测试 | 先做可重复的协议单元级手工脚本/最小 fake socket 验证，再执行 ffmpeg/ffplay 集成验证。 |

## 6. 完成标准

- `rtmp_client.js` 可独立完成简单 RTMP 握手、connect/createStream 和 play/publish。
- Pull 远端媒体可被本服务的 FLV/RTMP 播放端消费，metadata 和首个 GOP 正常。
- Push 本地源可被远端播放器消费，metadata 在首帧前到达。
- Relay API 既能继续创建 RTSP pull，也能创建 RTMP pull/push；任务状态和删除行为一致。
- 连接关闭、错误、超时和手动删除均无 pending Promise、定时器、socket 或 Context 广播注册泄漏。
- ESLint 通过，且手动测试覆盖设计文档列出的正常和异常路径。

## 7. Todo List

- [ ] 建立 `RtmpClient` 状态模型、URL 解析和 socket 生命周期
- [ ] 实现 RTMP 客户端简单握手及半包/粘包处理
- [ ] 实现 transId pending 命令和 connect/createStream/play/publish 信令
- [ ] 接入 RTMP metadata、AVPacket 收发及控制消息/ACK
- [ ] 实现心跳、超时检测、错误回调和 pending 全量清理
- [ ] 创建 `RtmpClientSession` pull 模式并接入 BroadcastServer publisher
- [ ] 创建 `RtmpClientSession` push 模式并接入 BroadcastServer subscriber
- [ ] 实现 pull/push 重连、幂等清理和 `getStatus()`
- [ ] 扩展 RelayManager 的 scheme/mode 分发与任务键
- [ ] 扩展 Relay API 配置归一化，兼容 `rtspUrl` 并支持 `url`/`mode`
- [ ] 更新相关 API/设计文档中的 RTMP 示例和限制
- [ ] 执行 ESLint 与 RTMP pull/push、重连、拒绝场景手动验证

## 8. 建议实施顺序与依赖

```text
协议骨架/握手
      ↓
信令/媒体/保活
      ↓
会话 pull ───────┐
会话 push ───────┼→ RelayManager 集成 → API/文档 → 验证
```

## 9. Relay API 示例

### RTMP 拉流

```bash
curl -X POST http://localhost:8001/api/v1/relay \
  -H "Content-Type: application/json" \
  -d '{
    "url": "rtmp://192.168.0.2/live/bbb_264",
    "mode": "pull",
    "streamPath": "/live/bbb_264",
    "reconnect": true
  }'
```

### RTMP 推流

```bash
curl -X POST http://localhost:8001/api/v1/relay \
  -H "Content-Type: application/json" \
  -d '{
    "url": "rtmp://remote.example/live/forward",
    "mode": "push",
    "streamPath": "/live/source",
    "reconnect": true
  }'
```

删除 pull 任务时提交 `{"streamPath": "/live/bbb_264"}`；删除 push 任务时可提交
`{"taskKey": "push:rtmp://remote.example/live/forward"}`。
