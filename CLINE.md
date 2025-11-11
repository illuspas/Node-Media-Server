# Node-Media-Server 项目分析报告

## 项目概述
Node-Media-Server 是一个基于 Node.js 开发的高性能低延迟直播流媒体服务器，支持 RTMP、HTTP-FLV、WebSocket-FLV 等多种协议。该项目是 v4 版本，增强了对 H.265、VP9、AV1 等编解码器的支持。

## 项目架构

### 核心模块结构
1. **主入口模块** (`src/index.js`) - 项目入口，负责初始化服务器组件
2. **核心模块** (`src/core/`) - 包含基础类和工具
3. **协议模块** (`src/protocol/`) - RTMP、FLV、AMF 协议处理
4. **服务器模块** (`src/server/`) - RTMP、HTTP、广播服务器实现
5. **会话模块** (`src/session/`) - RTMP、FLV 会话处理
6. **配置文件** - `bin/config.json` 默认配置

### 主要功能组件

#### 1. 服务器组件
- **RTMP服务器** (`src/server/rtmp_server.js`) - 处理 RTMP 流媒体连接
- **HTTP服务器** (`src/server/http_server.js`) - 处理 HTTP-FLV 流媒体
- **广播服务器** (`src/server/broadcast_server.js`) - 流媒体广播和管理
- **通知服务器** (`src/server/notify_server.js`) - 事件通知处理

#### 2. 会话处理
- **RTMP会话** (`src/session/rtmp_session.js`) - RTMP流处理
- **FLV会话** (`src/session/flv_session.js`) - HTTP-FLV流处理
- **基础会话** (`src/session/base_session.js`) - 会话基类

#### 3. 协议处理
- **RTMP协议** (`src/protocol/rtmp.js`) - RTMP协议解析和处理
- **FLV协议** (`src/protocol/flv.js`) - FLV格式解析
- **AMF协议** (`src/protocol/amf.js`) - Action Message Format 序列化处理

#### 4. 核心工具
- **AVPacket** (`src/core/avpacket.js`) - 媒体数据包结构
- **Logger** (`src/core/logger.js`) - 日志记录系统
- **Context** (`src/core/context.js`) - 全局上下文管理

## 技术特点

### 支持的编解码器
- H.264: ✅ (支持)
- H.265/HEVC: ✅ (支持)
- VP9: ✅ (支持)
- AV1: ✅ (支持)
- AAC: ✅ (支持)
- MP3: ✅ (支持)

### 支持的协议
- RTMP/RTMPS: ✅ (支持)
- HTTP-FLV/HTTP2-FLV: ✅ (支持)
- WebSocket-FLV: ✅ (支持)
- HTTP/HTTPS 静态文件服务: ✅ (支持)

### 主要特性
- GOP 缓存机制
- 认证和授权机制
- 通知系统
- 录制功能 (FLV文件录制)
- 流媒体播放和推送

## 配置说明
默认配置文件 `bin/config.json` 包含：
- RTMP端口: 1935
- RTMPS端口: 1936
- HTTP端口: 8000
- HTTPS端口: 8443
- 认证配置
- 静态文件服务配置
- 录制配置

## 项目依赖
- Node.js >= 18.0.0
- Express.js - Web框架
- ws - WebSocket 实现
- cors - 跨域支持

## 数据流处理流程
1. 客户端建立连接 (RTMP/HTTP/WebSocket)
2. 会话创建和验证
3. 流媒体数据解析 (RTMP/FLV)
4. 数据包处理和缓存
5. 广播到订阅者
6. 连接管理

这个项目是一个完整的直播流媒体服务器实现，具有良好的模块化设计和清晰的架构。
