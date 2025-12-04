# Node-Media-Server 系统架构时序图

## 1. 服务器启动时序图

```mermaid
sequenceDiagram
    participant User as 用户
    participant App as bin/app.js
    participant NMS as NodeMediaServer
    participant Context as Context
    participant RtmpServer as RTMP Server
    participant HttpServer as HTTP Server
    participant RecordServer as Record Server
    participant NotifyServer as Notify Server

    User->>+App: 启动 node bin/app.js
    App->>App: 加载配置文件 config.json
    App->>App: 生成随机管理员密码
    App->>App: 解析SSL证书路径
    App->>+NMS: new NodeMediaServer(config)
    NMS->>NMS: 初始化日志系统
    NMS->>+Context: 设置全局上下文
    Context->>Context: 创建 sessions Map
    Context->>Context: 创建 broadcasts Map
    Context->>Context: 创建 eventEmitter
    NMS->>+RtmpServer: 创建 RTMP 服务器
    RtmpServer->>RtmpServer: 创建TCP监听器 (端口1935)
    RtmpServer->>RtmpServer: 创建TLS监听器 (端口1936)
    NMS->>+HttpServer: 创建 HTTP 服务器
    HttpServer->>HttpServer: 设置Express路由
    HttpServer->>HttpServer: 配置JWT中间件
    HttpServer->>HttpServer: 设置WebSocket服务器
    NMS->>+RecordServer: 创建录制服务器
    NMS->>+NotifyServer: 创建通知服务器
    NMS->>NMS: 注册事件监听器
    NMS->>NMS: 启动所有服务器
    NMS-->>-App: 服务器启动完成
    App-->>-User: Node-Media-Server 运行中
```

## 2. RTMP 推流时序图

```mermaid
sequenceDiagram
    participant Publisher as 推流客户端
    participant RtmpServer as RTMP Server
    participant RtmpSession as RTMP Session
    participant RtmpProtocol as RTMP Protocol
    participant Context as Context
    participant BroadcastServer as Broadcast Server
    participant Logger as 日志系统

    Publisher->>+RtmpServer: TCP连接请求
    RtmpServer->>+RtmpSession: 创建会话
    RtmpSession->>RtmpSession: 生成唯一ID
    RtmpSession->>RtmpSession: 初始化RTMP协议
    RtmpSession->>Context: 注册会话到全局Map
    RtmpSession->>RtmpProtocol: 绑定事件回调
    RtmpSession-->>-RtmpServer: 会话创建完成
    RtmpServer-->>Publisher: 连接建立

    Publisher->>RtmpSession: RTMP握手 C0+C1
    RtmpSession->>RtmpProtocol: 处理握手
    RtmpProtocol-->>RtmpSession: S0+S1响应
    Publisher->>RtmpSession: RTMP握手 C2
    RtmpSession->>RtmpProtocol: 完成握手
    RtmpProtocol-->>RtmpSession: S2响应

    Publisher->>RtmpSession: connect命令
    RtmpSession->>RtmpProtocol: 解析connect命令
    RtmpProtocol->>RtmpProtocol: 验证连接参数
    RtmpProtocol-->>RtmpSession: _result响应
    RtmpSession-->>Publisher: 连接成功

    Publisher->>RtmpSession: createStream命令
    RtmpSession->>RtmpProtocol: 处理createStream
    RtmpProtocol-->>RtmpSession: 流创建响应
    RtmpSession-->>Publisher: _result响应

    Publisher->>RtmpSession: publish命令
    RtmpSession->>RtmpProtocol: 解析publish命令
    RtmpProtocol->>RtmpSession: 触发onConnect回调
    RtmpSession->>RtmpSession: 解析流路径 /app/stream
    RtmpSession->>BroadcastServer: 获取或创建广播服务器
    BroadcastServer->>Context: 注册到broadcasts Map
    RtmpSession->>BroadcastServer: 执行postPublish
    BroadcastServer->>BroadcastServer: 验证发布权限
    BroadcastServer->>Context: 触发prePublish事件
    BroadcastServer->>Context: 触发postPublish事件
    BroadcastServer-->>RtmpSession: 发布成功
    RtmpSession-->>Publisher: publish成功响应

    Publisher->>RtmpSession: 音频数据包
    RtmpSession->>RtmpProtocol: 解析RTMP包
    RtmpProtocol->>RtmpProtocol: 转换为AVPacket
    RtmpProtocol-->>RtmpSession: AVPacket数据
    RtmpSession->>BroadcastServer: broadcastMessage
    BroadcastServer->>BroadcastServer: 缓存GOP帧
    BroadcastServer->>BroadcastServer: 转换为FLV/RTMP格式
    BroadcastServer->>BroadcastServer: 广播给所有订阅者

    Publisher->>RtmpSession: 视频数据包
    RtmpSession->>RtmpProtocol: 解析RTMP包
    RtmpProtocol->>RtmpProtocol: 解析视频帧类型
    RtmpProtocol-->>RtmpSession: AVPacket数据
    RtmpSession->>BroadcastServer: broadcastMessage
    BroadcastServer->>BroadcastServer: 处理关键帧
    BroadcastServer->>BroadcastServer: 更新GOP缓存
    BroadcastServer->>BroadcastServer: 分发给播放器

    Publisher->>RtmpSession: 元数据包
    RtmpSession->>RtmpProtocol: 解析AMF数据
    RtmpProtocol-->>RtmpSession: 元数据信息
    RtmpSession->>BroadcastServer: 更新流信息
    BroadcastServer->>BroadcastServer: 缓存FLV元数据
```

## 3. RTMP 播放时序图

```mermaid
sequenceDiagram
    participant Player as 播放客户端
    participant RtmpServer as RTMP Server
    participant RtmpSession as RTMP Session
    participant RtmpProtocol as RTMP Protocol
    participant Context as Context
    participant BroadcastServer as Broadcast Server

    Player->>+RtmpServer: TCP连接请求
    RtmpServer->>+RtmpSession: 创建会话
    RtmpSession->>Context: 注册会话
    RtmpSession-->>-RtmpServer: 会话就绪
    RtmpServer-->>Player: 连接建立

    Player->>RtmpSession: RTMP握手
    RtmpSession->>RtmpProtocol: 处理握手
    RtmpProtocol-->>RtmpSession: 握手完成
    RtmpSession-->>Player: 握手响应

    Player->>RtmpSession: connect命令
    RtmpSession->>RtmpProtocol: 解析connect
    RtmpProtocol-->>RtmpSession: 连接参数
    RtmpSession-->>Player: _result响应

    Player->>RtmpSession: createStream命令
    RtmpSession->>RtmpProtocol: 处理createStream
    RtmpProtocol-->>RtmpSession: 流创建完成
    RtmpSession-->>Player: _result响应

    Player->>RtmpSession: play命令
    RtmpSession->>RtmpProtocol: 解析play命令
    RtmpProtocol->>RtmpSession: 触发onConnect回调
    RtmpSession->>RtmpSession: 解析流路径 /app/stream
    RtmpSession->>BroadcastServer: 获取广播服务器
    BroadcastServer->>Context: 从broadcasts Map获取
    RtmpSession->>BroadcastServer: 执行postPlay
    BroadcastServer->>BroadcastServer: 验证播放权限
    BroadcastServer->>Context: 触发prePlay事件
    BroadcastServer->>Context: 触发postPlay事件
    BroadcastServer-->>RtmpSession: 播放成功

    BroadcastServer->>RtmpSession: 发送FLV头部
    RtmpSession->>RtmpProtocol: 转换为RTMP格式
    RtmpProtocol-->>RtmpSession: RTMP数据包
    RtmpSession-->>Player: 流开始响应

    BroadcastServer->>RtmpSession: 发送元数据
    RtmpSession->>RtmpProtocol: 转换格式
    RtmpSession-->>Player: 元数据包

    BroadcastServer->>RtmpSession: 发送音频头部
    RtmpSession->>RtmpProtocol: 转换格式
    RtmpSession-->>Player: 音频配置

    BroadcastServer->>RtmpSession: 发送视频头部
    RtmpSession->>RtmpProtocol: 转换格式
    RtmpSession-->>Player: 视频配置

    BroadcastServer->>RtmpSession: 发送GOP缓存
    RtmpSession->>RtmpProtocol: 转换为RTMP包
    RtmpSession-->>Player: 关键帧序列

    loop 媒体数据传输
        BroadcastServer->>RtmpSession: 实时音视频包
        RtmpSession->>RtmpProtocol: 转换为RTMP格式
        RtmpSession-->>Player: 媒体数据包
    end
```

## 4. FLV 播放时序图 (HTTP/WebSocket)

```mermaid
sequenceDiagram
    participant Player as 播放器
    participant HttpServer as HTTP Server
    participant FlvSession as FLV Session
    participant FlvProtocol as FLV Protocol
    participant Context as Context
    participant BroadcastServer as Broadcast Server

    Player->>+HttpServer: HTTP请求 /app/stream.flv
    HttpServer->>+FlvSession: 创建FLV会话
    FlvSession->>FlvSession: 解析URL路径
    FlvSession->>FlvSession: 提取app和name
    FlvSession->>BroadcastServer: 获取广播服务器
    BroadcastServer->>Context: 查找活跃流
    FlvSession->>Context: 注册会话
    FlvSession-->>-HttpServer: 会话就绪
    HttpServer-->>Player: HTTP 200 OK

    FlvSession->>BroadcastServer: 执行postPlay
    BroadcastServer->>BroadcastServer: 验证播放权限
    BroadcastServer->>Context: 触发prePlay事件
    BroadcastServer->>Context: 触发postPlay事件
    BroadcastServer-->>FlvSession: 播放授权成功

    BroadcastServer->>FlvSession: 发送FLV头部
    FlvSession->>Player: HTTP响应体开始

    BroadcastServer->>FlvSession: 发送FLV元数据
    FlvSession->>FlvProtocol: 创建FLV标签
    FlvSession->>Player: 元数据标签

    BroadcastServer->>FlvSession: 发送音频头部
    FlvSession->>FlvProtocol: 创建音频标签
    FlvSession->>Player: 音频配置标签

    BroadcastServer->>FlvSession: 发送视频头部
    FlvSession->>FlvProtocol: 创建视频标签
    FlvSession->>Player: 视频配置标签

    BroadcastServer->>FlvSession: 发送GOP缓存
    FlvSession->>FlvProtocol: 转换为FLV标签
    FlvSession->>Player: GOP缓存帧

    loop 实时流数据
        BroadcastServer->>FlvSession: 新的音视频包
        FlvSession->>FlvProtocol: 创建FLV消息
        FlvSession->>Player: FLV数据流
    end

    Player->>FlvSession: 连接关闭
    FlvSession->>BroadcastServer: 执行donePlay
    BroadcastServer->>Context: 移除订阅者
    BroadcastServer->>Context: 触发donePlay事件
    FlvSession->>Context: 删除会话
```

## 5. WebSocket-FLV 播放时序图

```mermaid
sequenceDiagram
    participant Player as 播放器
    participant HttpServer as HTTP Server
    participant WsServer as WebSocket Server
    participant FlvSession as FLV Session
    participant BroadcastServer as Broadcast Server

    Player->>+HttpServer: HTTP升级请求
    HttpServer->>WsServer: WebSocket连接
    WsServer->>+FlvSession: 创建FLV会话
    FlvSession->>FlvSession: 解析WebSocket URL
    FlvSession->>FlvSession: 提取流路径信息
    FlvSession->>BroadcastServer: 获取广播服务器
    FlvSession->>Context: 注册会话
    FlvSession-->>-WsServer: 会话就绪
    WsServer-->>Player: WebSocket连接建立

    FlvSession->>BroadcastServer: 执行postPlay
    BroadcastServer->>BroadcastServer: 验证播放权限
    BroadcastServer-->>FlvSession: 播放授权

    BroadcastServer->>FlvSession: 发送FLV头部
    FlvSession->>Player: WebSocket消息(FLV头)

    BroadcastServer->>FlvSession: 发送元数据
    FlvSession->>Player: WebSocket消息(元数据)

    BroadcastServer->>FlvSession: 发送音频头部
    FlvSession->>Player: WebSocket消息(音频头)

    BroadcastServer->>FlvSession: 发送视频头部
    FlvSession->>Player: WebSocket消息(视频头)

    BroadcastServer->>FlvSession: 发送GOP缓存
    FlvSession->>Player: WebSocket消息(GOP帧)

    loop 实时流传输
        BroadcastServer->>FlvSession: 新的媒体包
        FlvSession->>Player: WebSocket消息(FLV数据)
    end

    Player->>FlvSession: WebSocket关闭
    FlvSession->>BroadcastServer: 执行donePlay
    FlvSession->>Context: 删除会话
```

## 6. API 请求处理时序图

```mermaid
sequenceDiagram
    participant Client as API客户端
    participant HttpServer as HTTP Server
    participant Express as Express路由
    participant JsonParser as JSON解析器
    participant JwtAuth as JWT认证中间件
    participant ErrorHandler as 错误处理中间件
    participant ApiRouter as API路由器
    participant AuthHandler as 认证处理器
    participant StreamsHandler as 流处理器
    participant Context as Context

    Client->>+HttpServer: HTTP请求 /api/v1/login
    HttpServer->>Express: 路由匹配
    Express->>JsonParser: 解析请求体
    JsonParser-->>Express: JSON数据
    Express->>ApiRouter: 路由分发
    ApiRouter->>AuthHandler: 处理登录请求
    AuthHandler->>AuthHandler: 验证用户凭据
    AuthHandler->>AuthHandler: 生成JWT令牌
    AuthHandler-->>ApiRouter: 登录响应
    ApiRouter-->>Express: JSON响应
    Express-->>HttpServer: HTTP响应
    HttpServer-->>Client: 访问令牌

    Client->>+HttpServer: HTTP请求 /api/v1/streams
    HttpServer->>Express: 路由匹配
    Express->>JsonParser: 解析请求体(可选)
    Express->>JwtAuth: JWT认证中间件
    JwtAuth->>JwtAuth: 提取访问令牌
    JwtAuth->>JwtAuth: 验证令牌签名
    JwtAuth->>JwtAuth: 检查令牌过期
    JwtAuth-->>Express: 认证成功
    Express->>ErrorHandler: 错误处理(备选)
    Express->>ApiRouter: 路由分发
    ApiRouter->>StreamsHandler: 处理流列表请求
    StreamsHandler->>Context: 获取广播服务器列表
    Context-->>StreamsHandler: 返回活跃流信息
    StreamsHandler->>StreamsHandler: 格式化响应数据
    StreamsHandler-->>ApiRouter: 流列表响应
    ApiRouter-->>Express: JSON响应
    Express-->>HttpServer: HTTP响应
    HttpServer-->>Client: 流数据列表

    Note over JwtAuth,ErrorHandler: 令牌验证失败流程
    JwtAuth->>ErrorHandler: 令牌无效/过期
    ErrorHandler->>ErrorHandler: 记录错误日志
    ErrorHandler-->>Express: 401未授权响应
    Express-->>HttpServer: 错误响应
    HttpServer-->>Client: 401 Unauthorized
```

## 7. 多协议流分发时序图

```mermaid
sequenceDiagram
    participant Publisher as RTMP推流端
    participant BroadcastServer as 广播服务器
    participant RtmpPlayer as RTMP播放器
    participant HttpFlvPlayer as HTTP-FLV播放器
    participant WsFlvPlayer as WebSocket-FLV播放器

    Publisher->>+BroadcastServer: 推送RTMP流
    BroadcastServer->>BroadcastServer: 解析媒体包
    BroadcastServer->>BroadcastServer: 生成AVPacket
    BroadcastServer->>BroadcastServer: 缓存GOP帧
    BroadcastServer->>BroadcastServer: 创建FLV格式包
    BroadcastServer->>BroadcastServer: 创建RTMP格式包

    par RTMP播放
        RtmpPlayer->>+BroadcastServer: 请求RTMP播放
        BroadcastServer->>RtmpPlayer: 发送RTMP头部
        BroadcastServer->>RtmpPlayer: 发送RTMP元数据
        loop 实时传输
            BroadcastServer->>RtmpPlayer: RTMP媒体包
        end
        RtmpPlayer-->>-BroadcastServer: 断开连接
    and HTTP-FLV播放
        HttpFlvPlayer->>+BroadcastServer: 请求HTTP-FLV
        BroadcastServer->>HttpFlvPlayer: 发送FLV头部
        BroadcastServer->>HttpFlvPlayer: 发送FLV元数据
        loop 实时传输
            BroadcastServer->>HttpFlvPlayer: FLV媒体包
        end
        HttpFlvPlayer-->>-BroadcastServer: 连接关闭
    and WebSocket-FLV播放
        WsFlvPlayer->>+BroadcastServer: 连接WebSocket-FLV
        BroadcastServer->>WsFlvPlayer: 发送FLV头部
        BroadcastServer->>WsFlvPlayer: 发送FLV元数据
        loop 实时传输
            BroadcastServer->>WsFlvPlayer: FLV媒体包
        end
        WsFlvPlayer-->>-BroadcastServer: WebSocket关闭
    end

    Publisher-->>-BroadcastServer: 停止推流
    BroadcastServer->>BroadcastServer: 清理流数据
    BroadcastServer->>BroadcastServer: 通知所有播放器
```

## 8. 会话生命周期管理时序图

```mermaid
sequenceDiagram
    participant Session as Session会话
    participant Context as 全局上下文
    participant BroadcastServer as 广播服务器
    participant EventEmitter as 事件发射器
    participant Logger as 日志系统

    Note over Session,Logger: 会话创建阶段
    Session->>Session: 生成唯一会话ID
    Session->>Context: 注册到sessions Map
    Session->>Logger: 记录会话创建日志
    Session->>EventEmitter: 触发会话事件(可选)

    Note over Session,Logger: 运行阶段
    Session->>BroadcastServer: 建立流连接
    BroadcastServer->>Session: 返回流数据
    Session->>Session: 更新统计信息(字节计数等)
    Session->>Logger: 定期记录会话状态

    Note over Session,Logger: 会话结束阶段
    Session->>Session: 检测连接断开
    Session->>BroadcastServer: 通知会话结束
    BroadcastServer->>BroadcastServer: 清理订阅者/发布者
    BroadcastServer->>EventEmitter: 触发donePlay/donePublish事件
    Session->>Context: 从sessions Map移除
    Session->>Logger: 记录会话结束日志
    Session->>Session: 释放资源
```