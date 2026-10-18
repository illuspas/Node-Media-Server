# Enhanced RTMP v2 多轨音频：OBS 补丁与测试指南

本文档记录如何让 OBS 通过 RTMP 推送多轨音频（Enhanced RTMP v2 multitrack audio），
以及如何在 Node-Media-Server（NMS）侧验证该功能。

相关背景：[GitHub Issue #707](https://github.com/illuspas/Node-Media-Server/issues/707)
（multitrack 封装内的音频 sequence header 未被识别，导致迟到订阅者丢失音轨配置）。
协议规范全文见 [enhanced-rtmp-v2.md](enhanced-rtmp-v2.md)。

## 1. 多轨音频的线上格式速览

OBS / FFmpeg 推流时，多轨音频按 Enhanced RTMP v2 规则封装为 FLV audio tag：

- **轨 0（首轨）**：传统 legacy 封装，保持对旧播放器的兼容
  - sequence header：`af 00 <AudioSpecificConfig>`
  - 音频帧：`af 01 <AAC frame>`
- **轨 N（N ≥ 1）**：multitrack 封装（OneTrack 布局）
  - sequence header：`95 00 <FourCC> <trackIndex> <AudioSpecificConfig>`
  - 音频帧：`95 01 <FourCC> <trackIndex> <AAC frame>`
  - 字节 0 低 4 位恒为 `AudioPacketTypeMultitrack`(5)；字节 1 低 4 位才是
    内层包类型（0=SequenceStart, 1=CodedFrames）；字节 2-5 为 FourCC（如
    `mp4a`）；字节 6 为 trackIndex

实测抓包（OBS 三音轨推流，迟到订阅者收到的头部）：

```
轨0 legacy AAC header ASC=1190                        (AAC-LC, 48kHz, 立体声)
轨1 multitrack header fourcc=mp4a trackIdx=1 ASC=1190
轨2 multitrack header fourcc=mp4a trackIdx=2 ASC=1190
```

## 2. OBS 补丁

### 2.1 背景：为什么原版 OBS 找不到多轨设置

OBS 的推流输出层（`plugins/obs-outputs`）**已完整实现** multitrack 音频封装：

- `rtmp-stream.c` `send_audio_header()` / 音频帧发送路径：
  `idx == 0` 走 legacy plain 封装，`idx > 0` 走 `send_audio_packet_ex()`
  （multitrack 封装）
- `flv-mux.c`：`AUDIO_PACKET_TYPE_MULTITRACK = 5`、
  `MULTITRACKTYPE_ONE_TRACK`、FourCC + trackIndex 布局，全部就绪

但前端在两处把多轨音频限制为 SRT / RIST 协议，RTMP 服务下设置界面
（设置 → 输出 → 推流 → 音频）只显示单轨单选框：

- `frontend/settings/OBSBasicSettings_Stream.cpp` 约 L250 `AllowsMultiTrack()`
- `frontend/utility/AdvancedOutput.cpp` 约 L281 `allowsMultiTrack()`

### 2.2 补丁内容

两个函数做相同修改，放行 RTMP 协议（基于 OBS 33.0.0-rc1，commit `1ad611018`）：

```diff
--- a/frontend/settings/OBSBasicSettings_Stream.cpp
+++ b/frontend/settings/OBSBasicSettings_Stream.cpp
@@ -250,7 +250,8 @@
 bool OBSBasicSettings::AllowsMultiTrack(const char *protocol)
 {
 	return astrcmpi_n(protocol, SRT_PROTOCOL, strlen(SRT_PROTOCOL)) == 0 ||
-	       astrcmpi_n(protocol, RIST_PROTOCOL, strlen(RIST_PROTOCOL)) == 0;
+	       astrcmpi_n(protocol, RIST_PROTOCOL, strlen(RIST_PROTOCOL)) == 0 ||
+	       astrcmpi_n(protocol, "RTMP", 4) == 0;
 }

--- a/frontend/utility/AdvancedOutput.cpp
+++ b/frontend/utility/AdvancedOutput.cpp
@@ -281,7 +281,8 @@
 inline bool AdvancedOutput::allowsMultiTrack()
 {
 	...
 	return astrcmpi_n(protocol, SRT_PROTOCOL, strlen(SRT_PROTOCOL)) == 0 ||
-	       astrcmpi_n(protocol, RIST_PROTOCOL, strlen(RIST_PROTOCOL)) == 0;
+	       astrcmpi_n(protocol, RIST_PROTOCOL, strlen(RIST_PROTOCOL)) == 0 ||
+	       astrcmpi_n(protocol, "RTMP", 4) == 0;
 }
```

补丁生效后，RTMP 服务下推流音频区从单选框变为 Track 1~6 复选框，
`AdvOut/StreamMultiTrackAudioMixes` 位掩码配置对 RTMP 输出生效。

### 2.3 编译（macOS）

前置条件：Xcode（含命令行工具）、CMake ≥ 3.28。OBS 的 macOS 构建强制使用
Xcode 生成器，且会自动下载预编译依赖（obs-deps、Qt6 macOS-universal、CEF、Sparkle）。

```bash
cd obs-studio
cmake --preset macos          # 配置 + 下载依赖（约 1.5GB）
cmake --build build_macos --config Release --parallel 8
# 产物: build_macos/frontend/Release/OBS.app
```

注意事项（弱网/代理环境实测经验）：

1. **CMake 内置下载器不认代理环境变量**。若需走代理，先用 curl 手动把依赖包
   下载到源码根的 `.deps/` 目录（文件存在即跳过下载）。文件名与 SHA256 以
   `CMakePresets.json` 的 `dependencies` 段为准，例如：
   - `macos-deps-<version>-universal.tar.xz`
   - `macos-deps-qt6-<version>-universal.tar.xz`
   - `cef_binary_<version>_macos_arm64.tar.xz`（单架构构建取宿主架构）
2. **Apple Git 走 HTTP 代理可能被 macOS 本地网络权限拒绝**（curl 正常、git 报
   `No route to host`）。子模块可用 curl 下载 tarball 解压替代：
   `https://codeload.github.com/obsproject/<repo>/tar.gz/<commit>`，所需子模块为
   `plugins/obs-browser`、`plugins/obs-websocket`、`deps/libdshowcapture/src`
   （commit 见 `git submodule status`；CMake 只检查目录存在性）。
3. 构建产物与正式版 OBS 共用 `~/Library/Application Support/obs-studio`
   配置目录，注意备份。

## 3. OBS 多轨推流配置

1. 启动补丁版：`open build_macos/frontend/Release/OBS.app`
2. 设置 → 推流：服务选**自定义**，服务器 `rtmp://<nms-host>:1935/live`，
   推流码任选（如 `obs`）
3. 设置 → 输出：输出模式改为**高级** → 推流页签 → 音频区 →
   勾选 Track 1 + Track 2（补丁后为复选框）
4. 混音器 → 高级音频属性：把不同音源分配到不同轨道
   （如桌面音频 → 轨道 1，麦克风 → 轨道 2）
5. 音频编码保持 AAC，开始推流

## 4. 测试验证方法

### 4.1 不改 OBS 的快速验证（FFmpeg 8.0+）

FFmpeg 8.0 的 flv 封装器原生支持多轨音频输出（轨 0 legacy、后续轨
multitrack），可直接合成推流：

```bash
ffmpeg -re -i video_with_audio.mp4 -i music.mp4 \
  -map 0:v:0 -map 1:a:0 -map 0:a:0 \
  -c copy -f flv rtmp://localhost:1935/live/mt
```

### 4.2 NMS 侧验证（含 #707 迟到订阅者场景）

```bash
# 1) 流列表：应看到 N 路音频 + 1 路视频（在推流开始数秒后执行，
#    即为"迟到订阅者"，等价于 issue #707 的复现条件）
ffprobe -show_entries stream=index,codec_type,codec_name,sample_rate \
  rtmp://localhost:1935/live/mt

# 2) -c copy 逐轨拉取（修复前此处报 "sample rate not set"）
ffmpeg -i rtmp://localhost:1935/live/mt \
  -map 0:a:0 -c copy -f adts track0.aac \
  -map 0:a:1 -c copy -f adts track1.aac

# 3) 解码完整性：0 错误为通过
ffmpeg -v error -i track0.aac -f null -
ffmpeg -v error -i track1.aac -f null -

# 4) 试听指定音轨
ffplay -ast 1 rtmp://localhost:1935/live/mt

# 5) 转封装给通用播放器（VLC 等可切换音轨）
ffmpeg -i rtmp://localhost:1935/live/mt \
  -map 0:v -map 0:a -c copy -f mpegts out.ts
```

HTTP-FLV / WS-FLV 拉流同样有效（NMS 原样透传 multitrack tag）：
`http://<nms-host>:8000/live/mt.flv`

### 4.3 播放器支持矩阵（RTMP/HTTP-FLV 直连）

| 播放器 | 多轨支持 | 说明 |
| --- | --- | --- |
| ffplay（FFmpeg ≥ 8.0） | ✅ | `-ast N` 选轨 |
| mpv（链接 FFmpeg ≥ 8.0 编译） | ✅ | `#` 键切换音轨 |
| FFmpeg 转封装 HLS/TS 后 | ✅ | VLC / hls.js / ExoPlayer 等通用播放器 |
| VLC 直连 RTMP | ❌ | RTMP access 与 FLV demuxer 均不识别 v2 multitrack |
| flv.js / mpegts.js | ❌ | Web 端 FLV 解复用仅支持单音轨 |

### 4.4 迟到订阅者收到的头部抓取（深度验证）

抓取 HTTP-FLV 并解析音频 sequence header，多轨场景应收到每轨各一条：

```bash
curl -sN --max-time 4 http://localhost:8000/live/mt.flv -o late.flv
```

解析规则：audio tag 中 `af 00` 开头为轨 0 legacy header；
`95 00` 开头且字节 1 低 4 位为 0 的为轨 N multitrack header
（字节 6 = trackIndex，其后 2 字节为 AudioSpecificConfig）。

## 5. NMS 侧实现要点

- `src/protocol/flv.js`：`Flv.parserTag` 对 `AudioPacketTypeMultitrack`
  包检查字节 1 低 4 位的内层类型，正确识别 multitrack 封装内的
  sequence header（issue #707 修复）
- `src/server/broadcast_server.js`：音频 sequence header 按轨道缓存
  （以 multitrack trackIndex 为 key 的 Map），订阅者接入时重放全部轨道
  的 codec config；同轨道重发 header 时覆盖旧值
- 回归测试：`test/flv.test.js`
