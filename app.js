const { NodeMediaServer } = require('./index');
require('dotenv').config();

const MD5 = require('md5');
const moment = require('moment');

const config = {
  rtmp: {
    port: process.env.RTMP_PORT,
    chunk_size: 60000,
    gop_cache: true,
    ping: 60,
    ping_timeout: 30
  },
  http: {
    port: process.env.HTTP_PORT,
    webroot: './public',
    mediaroot: './media',
    allow_origin: '*'
  },
  https: {
    port: process.env.HTTPS_PORT,
    key: './privatekey.pem',
    cert: './certificate.pem',
  },
  auth: {
    api: true,
    api_user: 'admin',
    api_pass: 'admin',
    play: false,
    publish: false,
    secret: 'radiantNodeMediaServer2019'
  },
  trans: {
    ffmpeg: '/usr/local/bin/ffmpeg',
    tasks: [
        // {
        //   app: 'live',
        //   mp4: true,
        //   mp4Flags: '[movflags=faststart]',
        // },
        {
          app: 'live',
          hls: true,
          hlsFlags: '[hls_time=1.5:hls_list_size=0]',
        },
        {
          app: 'radiant',
          hls: true,
          hlsFlags: '[hls_time=1:hls_list_size=0]',
        },
    ],
  },
};
//local
const expiration = moment().add(3, 'minutes').unix();
const HashValue = MD5(`/live/local-${expiration}-${config.auth.secret}`);
console.log('localhost url');
console.log(`Expiration Value = ${expiration} = ${moment.unix(expiration)}`);
console.log(`Hash Value = ${HashValue.toString()}`);
console.log(`Request Address looks like = rtmp://localhost/live/local?sign=${expiration}-${HashValue}`);
// server
const expiration2 = moment().add(5, 'minutes').unix();
const HashValue2 = MD5(`/live/tacos-${expiration2}-${config.auth.secret}`);
console.log('server signed url');
console.log(`Expiration Value = ${expiration2} = ${moment.unix(expiration2)}`);
console.log(`Hash Value = ${HashValue2.toString()}`);
console.log('server url');
console.log(`Request Address looks like = rtmp://ec2-34-211-234-98.us-west-2.compute.amazonaws.com/live/tacos?sign=${expiration2}-${HashValue2}`);


let nms = new NodeMediaServer(config);
nms.run();

nms.on('preConnect', (id, args) => {
  console.log('[NodeEvent on preConnect]', `id=${id} args=${JSON.stringify(args)}`);
  // let session = nms.getSession(id);
  // session.reject();
});

nms.on('postConnect', (id, args) => {
  console.log('[NodeEvent on postConnect]', `id=${id} args=${JSON.stringify(args)}`);
});

nms.on('doneConnect', (id, args) => {
  console.log('[NodeEvent on doneConnect]', `id=${id} args=${JSON.stringify(args)}`);
});

nms.on('prePublish', (id, StreamPath, args) => {
  console.log('[NodeEvent on prePublish]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);
  // let session = nms.getSession(id);
  // session.reject();
});

nms.on('postPublish', (id, StreamPath, args) => {
  console.log('[NodeEvent on postPublish]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);
});

nms.on('donePublish', (id, StreamPath, args) => {
  console.log('[NodeEvent on donePublish]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);
});

nms.on('prePlay', (id, StreamPath, args) => {
  console.log('[NodeEvent on prePlay]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);
  // let session = nms.getSession(id);
  // session.reject();
});

nms.on('postPlay', (id, StreamPath, args) => {
  console.log('[NodeEvent on postPlay]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);
});

nms.on('donePlay', (id, StreamPath, args) => {
  console.log('[NodeEvent on donePlay]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);
});

