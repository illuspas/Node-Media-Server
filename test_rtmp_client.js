const NodeRtmpClient = require('./node_rtmp_client');

let rc = new NodeRtmpClient('rtmp://192.168.0.10/live/stream');
let rp = new NodeRtmpClient('rtmp://192.168.0.20/live/stream');
rc.on('audio', (audioData, timestamp) => {
  rp.pushAudio(audioData, timestamp);
});

rc.on('video', (videoData, timestamp) => {
  rp.pushVideo(videoData, timestamp);
});

rc.on('script', (scriptData, timestamp) => {
  rp.pushScript(scriptData, timestamp);
});

rp.startPush();

setTimeout(() => {
  rc.startPull();
}, 1000);