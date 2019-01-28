//
//  Created by Mingliang Chen on 18/3/9.
//  illuspas[a]gmail.com
//  Copyright (c) 2018 Nodemedia. All rights reserved.
//
const Logger = require('./node_core_logger');

const EventEmitter = require('events');
const { spawn } = require('child_process');
const dateFormat = require('dateformat');
const mkdirp = require('mkdirp');
const fs = require('fs');

const chokidar = require('chokidar');

const AWS = require('./aws_util/aws-util');

class NodeTransSession extends EventEmitter {
  constructor(conf) {
    super();
    this.conf = conf;
  }

  run() {
    let watcher;
    let vc = this.conf.args.vc == 7 ? 'copy' : 'libx264';
    let ac = this.conf.args.ac == 10 ? 'copy' : 'aac';
    let inPath = 'rtmp://127.0.0.1:' + this.conf.port + this.conf.streamPath;
    let ouPath = `${this.conf.mediaroot}/${this.conf.app}/${this.conf.stream}`;
    let mapStr = '';
    if (this.conf.mp4) {
      this.conf.mp4Flags = this.conf.mp4Flags ? this.conf.mp4Flags : '';
      let now = new Date();
      let mp4FileName = dateFormat('yyyy-mm-dd-HH-MM') + '.mp4';
      let mapMp4 = `${this.conf.mp4Flags}${ouPath}/${mp4FileName}|`;
      mapStr += mapMp4;
      Logger.log('[Transmuxing MP4] ' + this.conf.streamPath + ' to ' + ouPath + '/' + mp4FileName);
    }
    if (this.conf.hls) {
      this.conf.hlsFlags = this.conf.hlsFlags ? this.conf.hlsFlags : '';
      let hlsFileName = 'index.m3u8';
      let mapHls = `${this.conf.hlsFlags}${ouPath}/${hlsFileName}|`;
      mapStr += mapHls;
      Logger.log('[Transmuxing HLS] ' + this.conf.streamPath + ' to ' + ouPath + '/' + hlsFileName);
      watcher = chokidar.watch(ouPath);
    }
    if (this.conf.dash) {
      this.conf.dashFlags = this.conf.dashFlags ? this.conf.dashFlags : '';
      let dashFileName = 'index.mpd';
      let mapDash = `${this.conf.dashFlags}${ouPath}/${dashFileName}`;
      mapStr += mapDash;
      Logger.log('[Transmuxing DASH] ' + this.conf.streamPath + ' to ' + ouPath + '/' + dashFileName);
    }
    mkdirp.sync(ouPath);
    let argv = ['-y', '-fflags', 'nobuffer', '-analyzeduration', '1000000', '-i', inPath, '-c:v', vc, '-c:a', ac, '-f', 'tee', '-map', '0:a?', '-map', '0:v?', mapStr];
    Logger.ffdebug(argv.toString());
    this.ffmpeg_exec = spawn(this.conf.ffmpeg, argv);
    this.ffmpeg_exec.on('error', (e) => {
      Logger.ffdebug(e);
    });

    this.ffmpeg_exec.stdout.on('data', (data) => {
      Logger.ffdebug(`FF输出：${data}`);
    });

    this.ffmpeg_exec.stderr.on('data', (data) => {
      Logger.ffdebug(`FF输出：${data}`);
    });

    // watching path for files being added
    watcher.on('add', function (path) {
      //check file
      checkFile(path);
    });

    this.ffmpeg_exec.on('close', (code) => {
      Logger.log('[Transmuxing end] ' + this.conf.streamPath);
      this.emit('end');
    });
  }

  end() {
    // this.ffmpeg_exec.kill('SIGINT');
    this.ffmpeg_exec.stdin.write('q');
  }
}

/**
 * fileStat
 * @param path
 * @returns {Promise<any>}
 */
const fileStat = function(path){
  return new Promise((resolve, reject) => {
    fs.stat(path, (err, info) => {
      if(err) {
        reject(err);
      }
      resolve(info);
    });
  });
};

/**
 * checkFileAgain
 * @param path
 * @param fileInfo
 */
const checkFile = function (path){
  setTimeout((args) => {
    fileStat(args[0].path).then((fileInfo) => {
      if(fileInfo.size === 0) {
        checkFile(path);
      } else {
        uploadFile(path);
        console.log(`uploading file: ${path} with size: ${fileInfo.size}`);
      }

    }).catch((err)=>{
      console.log(err);
    })
  }, 1000, [{
    path
  }]);
};

/**
 * uploadFile
 * @param path
 */
const uploadFile = function (path){
  //upload ts files
  let params = {
    Bucket: process.env.S3_BUCKET,
    Key: path.substring(18,path.length),
    Body: fs.createReadStream(path),
    ACL: 'public-read',
  };

  AWS.getS3().upload(params, (err, data) => {
    if(err){
      console.log(err);
    }
    console.log(`${data.Key} uploaded to: ${data.Bucket}`);
    fs.unlink(path, (err, data) => {
      if(err){
        console.log(err);
      }
    });
  });
  // if(path !== 'media/live/stream/index.m3u8'){
  //   checkFile('media/live/stream/index.m3u8');
  // }
};

module.exports = NodeTransSession;