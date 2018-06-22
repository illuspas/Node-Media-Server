const NodeRtmpClient = require('./node_rtmp_client');

let rc = new NodeRtmpClient('rtmp://192.168.0.10/live/stream');
let rp = new NodeRtmpClient('rtmp://192.168.0.20/live/stream1');
rc.on('audio', (audioData, timestamp) => {
  rp.pushAudio(audioData, timestamp);
});

rc.on('video', (videoData, timestamp) => {
  rp.pushVideo(videoData, timestamp);
});

rc.on('script', (scriptData, timestamp) => {
  rp.pushScript(scriptData, timestamp);
});

rp.on('status', (info) => {
  console.log('publisher on status', info);
  if(info.code === 'NetStream.Publish.Start') {
    rc.startPull();
  }
});

rp.startPush();