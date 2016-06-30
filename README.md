# Node-Media-Server
A Node.js implementation of RTMP Server 
 - Supports only RTMP protocol.
 - Supports only H.264 video and AAC audio.
 
# Usage 
  node app.js

# Todo
本项目写着玩的，用以学习rtmp协议，不保证实现。
 - 优化发送队列
 - 支持更多协议  RTMPT/HTTP-FLV/HLS
 - 支持更多编码 speex/nellymoser
 - 流状态监控
 - 流状态回调
 - 实时录制

# Thanks
RTSP, RTMP, and HTTP server implementation in Node.js  
https://github.com/iizukanao/node-rtsp-rtmp-server

Node.JS module that provides an API for encoding and decoding of AMF0 and AMF3 protocols  
https://github.com/delian/node-amfutils

SRS is industrial-strength live streaming cluster, for the best conceptual integrity and the simplest implementation.  
https://github.com/winlinvip/simple-rtmp-server
