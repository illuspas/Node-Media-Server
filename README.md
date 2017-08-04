# Node-Media-Server
A Node.js implementation of RTMP Server 
 
# Usage 
  node app.js

# Features
 - 无第三方库依赖
 - 支持H.264/AAC/SPEEX/NELLYMOSER
 - 基于Generator实现的高性能解析器
 - 跨平台 Windows/Linux/Unix
 - 支持GOP cache，FlashPlayer/NodeMediaClient 毫秒级首屏打开速度

# Todo
 - 优化发送队列
 - 支持更多协议  RTMPT/RTMPE/HTTP-FLV/HLS
 - 流状态监控
 - 流事件回调
 - 实时录制
 - 多进程支持

# Thanks
RTSP, RTMP, and HTTP server implementation in Node.js  
https://github.com/iizukanao/node-rtsp-rtmp-server

Node.JS module that provides an API for encoding and decoding of AMF0 and AMF3 protocols  
https://github.com/delian/node-amfutils
