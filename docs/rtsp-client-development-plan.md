# RTSP 客户端拉流模块 — 开发计划

## 一、项目背景与目标

当前 Node-Media-Server 支持 **RTMP 推流 → 多协议分发（RTMP/FLV）** 的架构。本次开发目标是新增一个 **RTSP 拉流客户端**，将远程 RTSP/RTSPS 源（如 IPC 摄像头、NVR、其他流媒体服务器）拉取到 Node-Media-Server 中，作为 Publisher 接入现有的 `BroadcastServer` 体系，从而实现：

```
RTSP 源 (IP摄像头/NVR)
    │
    ▼ RTSP Client (拉流)
Node-Media-Server
    │
    ├── RTMP 分发
    ├── HTTP-FLV 分发
    ├── WebSocket-FLV 分发
    └── 录制
```

## 二、技术范围

| 模块 | 功能点 | 优先级 |
|------|--------|--------|
| **RTSP 信令** | OPTIONS / DESCRIBE / SETUP / PLAY / PAUSE / TEARDOWN / GET_PARAMETER | P0 |
| **认证** | Basic / Digest（MD5）认证，处理 401 重试 | P0 |
| **SDP 解析** | 解析 m= / a=rtpmap / a=fmtp / a=control 等属性 | P0 |
| **RTP 解包** | RTP 头解析、序列号排序、时间戳处理 | P0 |
| **H.264 负载** | Single NAL / STAP-A / FU-A 分片重组 (RFC 6184) | P0 |
| **H.265 负载** | Single NAL / FU 分片重组 (RFC 7798) | P1 |
| **AAC 负载** | AAC-LATM / MPEG4-GENERIC 解析 (RFC 3640) | P0 |
| **TCP 交织传输** | `$` 标识 + channel + length 格式解析 | P0 |
| **UDP 传输** | UDP RTP/RTCP 收发、NAT 穿越、超时处理 | P0 |
| **RTCP 反馈** | Receiver Report (RR)、Sender Report (SR) 解析 | P1 |
| **RTSPS** | TLS 加密 RTSP 连接 | P2 |
| **自动重连** | 断线检测、指数退避重连 | P1 |
| **API 管理** | 通过 REST API 动态添加/删除 RTSP 拉流任务 | P1 |

## 三、文件结构规划

与现有项目架构保持一致：

```
src/
├── protocol/
│   ├── rtmp.js          # 现有
│   ├── amf.js           # 现有
│   ├── flv.js           # 现有
│   ├── rtsp.js          # [新增] RTSP 信令协议解析（请求构建/响应解析）
│   ├── sdp.js           # [新增] SDP 会话描述解析器
│   ├── rtp.js           # [新增] RTP 协议解析（头部解包、负载提取）
│   ├── rtcp.js          # [新增] RTCP 协议解析
│   └── rtp_depayloader.js  # [新增] RTP 负载解包（H.264/H.265/AAC）
│
├── session/
│   ├── base_session.js   # 现有
│   ├── rtmp_session.js   # 现有
│   ├── flv_session.js    # 现有
│   ├── rtsp_client_session.js  # [新增] RTSP 客户端会话（继承 BaseSession）
│   └── record_session.js # 现有
│
├── server/
│   ├── rtmp_server.js    # 现有
│   ├── http_server.js    # 现有
│   ├── record_server.js  # 现有
│   ├── broadcast_server.js  # 现有（需要小改，兼容 rtsp publisher）
│   └── rtsp_client_manager.js  # [新增] RTSP 拉流任务管理器
│
├── core/
│   ├── avcodec.js        # 现有（需补充 RTSP 相关编解码常量）
│   ├── avpacket.js       # 现有（无需改动）
│   ├── context.js        # 现有（无需改动）
│   └── logger.js         # 现有
│
└── index.js              # 现有（注册 RTSP Client Manager）
```

## 四、分阶段开发计划

### 阶段一：RTSP 信令层（预计 3-4 天）

**目标**：完成 RTSP 协议的完整信令交互能力

| 步骤 | 内容 | 产出文件 |
|------|------|----------|
| 1.1 | `src/protocol/rtsp.js` — RTSP 请求构建器 | `rtsp.js` |
| | - 请求格式：`METHOD uri RTSP/1.0\r\n` + headers + body | |
| | - CSeq 自增管理 | |
| | - Session 头自动携带 | |
| | - 支持方法：OPTIONS/DESCRIBE/SETUP/PLAY/PAUSE/TEARDOWN | |
| 1.2 | RTSP 响应解析器 | `rtsp.js` |
| | - 状态行解析 `RTSP/1.0 200 OK` | |
| | - 头部字段解析（键值对） | |
| | - Content-Length 边界处理 | |
| | - 响应体提取 | |
| 1.3 | TCP 连接管理 | `rtsp.js` |
| | - 基于 `net.createConnection` 的 TCP 连接 | |
| | - 基于流的缓冲区管理（处理粘包/拆包） | |
| | - 区分 RTSP 响应 vs TCP 交织 RTP 数据 | |
| | - Keep-Alive（GET_PARAMETER 心跳） | |
| 1.4 | Basic & Digest 认证 | `rtsp.js` |
| | - 解析 `WWW-Authenticate` 头 | |
| | - Basic：`base64(user:pass)` | |
| | - Digest：realm / nonce / opaque / response 计算（MD5） | |
| | - 401 响应自动重试机制 | |

**验证方式**：用 `rtsp://wowzaec2demo.streamlock.net/vod/mp4:BigBuckBunny_115k.mp4` 等公开测试流验证 DESCRIBE → SETUP → PLAY 完整流程。

### 阶段二：SDP 解析（预计 1-2 天）

**目标**：从 DESCRIBE 响应中提取完整的媒体描述信息

| 步骤 | 内容 | 产出文件 |
|------|------|----------|
| 2.1 | `src/protocol/sdp.js` — SDP 解析器 | `sdp.js` |
| | - Session 级别：`v=` / `o=` / `s=` / `c=` | |
| | - Media 级别：`m=video` / `m=audio` | |
| | - 属性解析：`a=rtpmap`（编码格式/时钟频率） | |
| | - 属性解析：`a=fmtp`（编码参数，如 H.264 profile-level-id、sprop-parameter-sets） | |
| | - 属性解析：`a=control`（track 路径） | |
| | - 输出结构化对象 | |

**SDP 输出数据结构示例**：

```javascript
{
  session: { version: 0, origin: "...", name: "..." },
  media: [
    {
      type: "video",
      port: 0,
      protocol: "RTP/AVP",
      payloadType: 96,
      codec: "H264",
      clockRate: 90000,
      trackId: "trackID=1",
      fmtp: { "profile-level-id": "42001f", "sprop-parameter-sets": "..." }
    },
    {
      type: "audio",
      port: 0,
      protocol: "RTP/AVP",
      payloadType: 97,
      codec: "MPEG4-GENERIC",
      clockRate: 8000,
      channels: 1,
      trackId: "trackID=2"
    }
  ]
}
```

### 阶段三：RTP/RTCP 协议层（预计 3-4 天）

**目标**：完整的 RTP 包解析与负载提取能力

| 步骤 | 内容 | 产出文件 |
|------|------|----------|
| 3.1 | `src/protocol/rtp.js` — RTP 包解析 | `rtp.js` |
| | - RTP 头部解析（V/P/X/CC/M/PT/Seq/Timestamp/SSRC） | |
| | - CSRC 列表处理 | |
| | - RTP 扩展头处理（Header Extension） | |
| | - Padding 处理 | |
| | - 输出结构化 RTP 包对象 | |
| 3.2 | `src/protocol/rtcp.js` — RTCP 协议 | `rtcp.js` |
| | - SR (Sender Report) 解析 | |
| | - RR (Receiver Report) 解析与构建发送 | |
| | - SDES / BYE 处理 | |
| | - Compound RTCP 处理 | |
| 3.3 | UDP 传输模式 | `rtp.js` + `rtsp_client_session.js` |
| | - `dgram.createSocket` 创建 UDP 收发 | |
| | - RTP/RTCP 端口对管理（client_port 协商） | |
| | - NAT 穿越支持 | |
| | - 超时检测（RTP timeout → 重连） | |
| 3.4 | TCP 交织传输模式 | `rtsp_client_session.js` |
| | - `$` (0x24) 标识字节识别 | |
| | - channel (1 byte) + length (2 bytes) 解析 | |
| | - 大帧 TCP 粘包/拆包处理 | |
| | - 缓冲区状态管理 | |

**RTP 包解析数据结构**：

```javascript
{
  version: 2,
  padding: false,
  extension: false,
  csrcCount: 0,
  marker: true,
  payloadType: 96,
  sequenceNumber: 12345,
  timestamp: 90000,
  ssrc: 0x12345678,
  csrcList: [],
  payload: Buffer  // 原始负载（未解包）
}
```

### 阶段四：RTP 负载解包 Depayloader（预计 4-5 天）

**目标**：将 RTP 负载还原为完整的音视频编码帧

| 步骤 | 内容 | 产出文件 |
|------|------|----------|
| 4.1 | `src/protocol/rtp_depayloader.js` — H.264 解包 | `rtp_depayloader.js` |
| | - Single NAL Unit 模式：直接提取 NAL | |
| | - STAP-A 模式：多 NAL 解聚合 | |
| | - FU-A 模式：分片重组（start/mid/end marker） | |
| | - NAL 单元类型判断（SPS/PPS/IDR/P帧） | |
| | - 输出 Annex-B 格式（`00 00 00 01` + NAL） 或 AVCC 格式 | |
| 4.2 | H.265/HEVC 解包 | `rtp_depayloader.js` |
| | - Single NAL / FU / AP 模式 (RFC 7798) | |
| | - VPS/SPS/PPS 提取 | |
| 4.3 | AAC 音频解包 | `rtp_depayloader.js` |
| | - MPEG4-GENERIC / AAC-LATM 模式 | |
| | - 提取 AAC 原始帧 | |
| | - 处理 AU Header + AU Unit 布局 | |
| 4.4 | 丢包处理与序列管理 | `rtp_depayloader.js` |
| | - 序列号跳变检测（seq gap） | |
| | - FU-A 分片中间丢包 → 丢弃整帧 | |
| | - 时间戳回绕处理（32bit overflow） | |
| 4.5 | 转 AVPacket | `rtp_depayloader.js` |
| | - 将解析出的帧转换为现有 `AVPacket` 格式 | |
| | - flags 映射（与 RTMP 一致：0=audio_header, 1=audio, 2=video_header, 3=video_keyframe, 4=video_frame） | |

**Depayloader 核心流程（以 H.264 FU-A 为例）**：

```
RTP 包1 (FU-A start) ─┐
RTP 包2 (FU-A)       ├─→ FU-A 重组 ─→ 完整 NAL Unit ─→ AVPacket
RTP 包3 (FU-A end)   ─┘
```

### 阶段五：RTSP Client Session 集成（预计 2-3 天）

**目标**：将 RTSP 客户端封装为与现有架构兼容的 Session

| 步骤 | 内容 | 产出文件 |
|------|------|----------|
| 5.1 | `src/session/rtsp_client_session.js` | `rtsp_client_session.js` |
| | - 继承 `BaseSession` | |
| | - `protocol = "rtsp"` | |
| | - `isPublisher = true`（RTSP 拉流 = 作为 Publisher 接入广播体系） | |
| | - `run()` 方法：连接 → DESCRIBE → SETUP → PLAY → 接收循环 | |
| | - `close()` 方法：TEARDOWN → 清理资源 | |
| 5.2 | 与 BroadcastServer 集成 | `rtsp_client_session.js` |
| | - RTP 帧解包 → `AVPacket` → `BroadcastServer.broadcastMessage()` | |
| | - 自动发送 FLV/RTMP 格式的元数据和关键帧给订阅者 | |
| | - GOP 缓存：RTSP 拉流作为 Publisher，缓存关键帧 | |
| 5.3 | 与 Context 集成 | `rtsp_client_session.js` |
| | - 注册到 `Context.sessions` | |
| | - 注册到 `Context.broadcasts` | |
| | - 触发 `prePublish` / `postPublish` / `donePublish` 事件 | |
| | - 统计 `inBytes` / `outBytes` | |

**Session 生命周期**：

```
new RtspClientSession(config)
  │
  ├─ run()
  │   ├─ TCP Connect
  │   ├─ DESCRIBE (获取 SDP)
  │   ├─ SETUP (协商传输)
  │   ├─ PLAY (开始播放)
  │   ├─ 接收循环 → RTP → Depayloader → AVPacket
  │   │                                └→ BroadcastServer.broadcastMessage()
  │   └─ 心跳 (GET_PARAMETER)
  │
  └─ close()
      ├─ TEARDOWN
      ├─ 关闭 UDP/TCP 连接
      ├─ BroadcastServer.donePublish()
      └─ Context.sessions.delete()
```

### 阶段六：拉流任务管理器（预计 2 天）

**目标**：提供统一的 RTSP 拉流任务生命周期管理

| 步骤 | 内容 | 产出文件 |
|------|------|----------|
| 6.1 | `src/server/rtsp_client_manager.js` | `rtsp_client_manager.js` |
| | - 拉流任务列表管理（Map<streamPath, RtspClientSession>） | |
| | - 添加拉流任务 `addTask(rtspUrl, streamPath, options)` | |
| | - 删除拉流任务 `removeTask(streamPath)` | |
| | - 列出所有任务 `listTasks()` | |
| | - 任务状态查询 `getTaskStatus(streamPath)` | |
| 6.2 | 自动重连机制 | `rtsp_client_manager.js` |
| | - 断线检测（RTP 超时 / TCP close / error） | |
| | - 指数退避重连（1s → 2s → 4s → ... → 30s 上限） | |
| | - 最大重试次数配置 | |
| | - 重连事件通知 | |
| 6.3 | 注册到 NodeMediaServer | `src/index.js` |
| | - 配置入口：`config.rtspClient` | |
| | - 启动时自动拉取配置中的 RTSP 源 | |
| | - 生命周期管理（run/stop） | |
| 6.4 | REST API（可选） | `src/routers/api.js` |
| | - `POST /api/v1/rtsp/pull` — 添加拉流 | |
| | - `DELETE /api/v1/rtsp/pull` — 停止拉流 | |
| | - `GET /api/v1/rtsp/tasks` — 任务列表 | |

**配置示例**：

```javascript
const config = {
  // ...existing config...
  rtspClient: {
    tasks: [
      {
        rtspUrl: "rtsp://admin:password@192.168.1.100:554/stream1",
        streamPath: "/live/camera1",
        transport: "tcp",  // "tcp" | "udp"
        reconnect: true,
        reconnectInterval: 2000,
        maxReconnectAttempts: 10
      }
    ]
  }
};
```

### 阶段七：测试与优化（预计 3-4 天）

| 步骤 | 内容 |
|------|------|
| 7.1 | 单元测试：SDP 解析器、RTP 解包、H.264 FU-A 重组 |
| 7.2 | 集成测试：公开 RTSP 流拉取 → FLV 分发播放 |
| 7.3 | 边界测试：断网重连、TCP 粘包、RTP 乱序/丢包 |
| 7.4 | 性能测试：多路 RTSP 同时拉流、内存占用、CPU 占用 |
| 7.5 | 兼容性测试：海康/大华摄像头、FFmpeg RTSP Server、VLC、Wowza |

## 五、依赖关系图

```
阶段一: RTSP 信令 ──────┐
                        ├──→ 阶段五: Session 集成 ──→ 阶段六: 管理器 ──→ 阶段七: 测试
阶段二: SDP 解析  ──────┤
                        │
阶段三: RTP/RTCP  ──────┤
                        │
阶段四: 负载解包  ───────┘
```

**可并行的开发**：阶段一/二/三/四之间相互独立，可由多人并行开发。阶段五依赖前四个阶段全部完成。

## 六、关键技术决策点

| 决策项 | 选项 | 建议 |
|--------|------|------|
| **RTP 负载输出格式** | Annex-B vs AVCC | Annex-B（与 FLV 转码兼容），但保留 AVCC 转换能力 |
| **UDP 端口分配策略** | 固定范围 vs 动态分配 | 动态分配（避免端口冲突），范围 10000-60000 |
| **TCP vs UDP 默认传输** | - | 默认 TCP（NAT 友好，防火墙穿透），UDP 可选 |
| **零依赖 vs 引入库** | 纯 Node.js vs 依赖 | 零外部依赖（仅用 `net`/`dgram`/`crypto`），与现有风格一致 |
| **AVPacket flags 映射** | 自定义 vs 复用 | 复用现有 flags 体系（0-5），确保与 BroadcastServer 完全兼容 |

## 七、风险与挑战

| 风险 | 影响 | 应对策略 |
|------|------|----------|
| 不同厂商 IPC 的 RTSP 实现差异 | SETUP/DESCRIBE 响应格式不标准 | 做容错解析，关键字段缺失时给合理默认值 |
| H.264 FU-A 重组复杂度 | 丢包/乱序导致花屏 | 严格序列号检查，中间丢包丢弃整帧 |
| TCP 交织模式粘包处理 | 数据损坏 | 状态机式缓冲区管理，逐字节/逐包解析 |
| UDP NAT 穿越失败 | 收不到 RTP 数据 | 优先 TCP 模式，UDP 模式做超时检测 |
| Digest 认证兼容性 | 部分设备 MD5 算法变体 | 支持 MD5 和 MD5-sess，参考 RFC 2617 |

## 八、预估工期

| 阶段 | 工期 | 累计 |
|------|------|------|
| 阶段一：RTSP 信令 | 3-4 天 | 4 天 |
| 阶段二：SDP 解析 | 1-2 天 | 6 天 |
| 阶段三：RTP/RTCP | 3-4 天 | 10 天 |
| 阶段四：负载解包 | 4-5 天 | 15 天 |
| 阶段五：Session 集成 | 2-3 天 | 18 天 |
| 阶段六：管理器 | 2 天 | 20 天 |
| 阶段七：测试 | 3-4 天 | **~24 天** |

若阶段一至四可并行开发（多人协作），总工期可压缩至 **~15 天**。

## 九、参考规范

| 规范 | 说明 |
|------|------|
| RFC 2326 | RTSP 1.0 协议规范 |
| RFC 7826 | RTSP 2.0 协议规范 |
| RFC 3550 | RTP/RTCP 协议规范 |
| RFC 6184 | H.264 RTP Payload Format |
| RFC 7798 | H.265/HEVC RTP Payload Format |
| RFC 3640 | MPEG-4 Audio/Visual RTP Payload Format |
| RFC 2617 | HTTP Authentication (Basic/Digest) |
| RFC 4566 | SDP Session Description Protocol |
