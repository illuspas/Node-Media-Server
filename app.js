const { NodeMediaServer } = require('./index');
require('dotenv').config();

const MD5 = require('md5');
const moment = require('moment');
const randomName = require('node-random-name');

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
    publish: process.env.SECURE_PUBLISH, // enables sign parameter to be used for server
    secret: process.env.SHARED_SECRET,
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
const token = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI3N2YzMjQ3MC1jYjIyLTExZTgtYjY0NC04OWIzMzlmNzY3YjE6VXNlcnMiLCJpYXQiOjE1MzkwMjExMzAsImV4cCI6MzA3ODY0NzA2MH0.n_Gy9L78Nu0_npbgdco0FM5RG9B8Ay6-nxcYJPczp0o';
const userId2 = '9f7d3ab0-0eb3-11e9-8ec7-99c86bfb1fff:Users';
// const userId = '77f32470-cb22-11e8-b644-89b339f767b1:Users';
const user = randomName({first: true, gender: 'female'});

const conversationTopicId = '05bdf610-fe34-11e8-870f-2b591aa8f78f:ConversationTopics';
const expiration = moment().add(20, 'minutes').unix();
const HashValue = MD5(`/radiant/${user}-${expiration}-${process.env.SHARED_SECRET}`);
console.log('localhost url');
console.log(`Expiration Value = ${expiration} = ${moment.unix(expiration)}`);
console.log(`Hash Value = ${HashValue.toString()}`);
console.log('localhost url:');
console.log('----');
console.log(`rtmp://localhost/radiant/${user}?sign=${expiration}-${HashValue}&token=${token}&conversationTopicId=${conversationTopicId}`);
console.log('----');

// server Dev
const expiration2 = moment().add(10, 'minutes').unix();
const HashValue2 = MD5(`/radiant/${user}-${expiration2}-${process.env.SHARED_SECRET}`);
console.log('Dev Server signed url');
console.log(`Expiration Value = ${expiration2} = ${moment.unix(expiration2)}`);
console.log(`Hash Value = ${HashValue2.toString()}`);
console.log('server url:');
console.log('----');
console.log(`rtmp://ec2-34-220-71-189.us-west-2.compute.amazonaws.com/radiant/${user}?sign=${expiration2}-${HashValue2}&token=${token}&conversationTopicId=${conversationTopicId}`);
console.log('----');

// Stage Dev
const conversationTopicId3 = '1f881130-d967-11e8-b793-4b1a63886a0b:ConversationTopics';
const expiration3 = moment().add(10, 'minutes').unix();
const HashValue3 = MD5(`/radiant/${user}-${expiration3}-${process.env.SHARED_SECRET}`);
console.log('Stage Server signed url');
console.log(`Expiration Value = ${expiration3} = ${moment.unix(expiration3)}`);
console.log(`Hash Value = ${HashValue3.toString()}`);
console.log('server url:');
console.log('----');
console.log(`rtmp://ec2-54-213-162-104.us-west-2.compute.amazonaws.com/radiant/${user}?sign=${expiration3}-${HashValue3}&token=${token}&conversationTopicId=${conversationTopicId3}`);
console.log('----');

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

