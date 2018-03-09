//
//  Created by Mingliang Chen on 18/3/9.
//  illuspas[a]gmail.com
//  Copyright (c) 2018 Nodemedia. All rights reserved.
//

const EventEmitter = require('events');
const { spawn } = require('child_process');
const dateFormat = require('dateformat');
const mkdirp = require('mkdirp');

class NodeTransSession extends EventEmitter {
  constructor(conf) {
    super();
    this.conf = conf;
  }

  run() {
    // console.log('[TransTask run]', this.conf);
    let vc = 'copy';
    let ac = this.conf.args.ac == 10 ? 'copy' : this.conf.ac ? this.conf.ac : 'aac';
    let inPath = 'rtmp://localhost:' + this.conf.port + this.conf.streamPath;

    let mapStr = '';
    if (this.conf.mp4Path) {
      this.conf.mp4Flags = this.conf.mp4Flags ? this.conf.mp4Flags : '';
      let now = new Date();
      let mp4FullPath = this.conf.mp4Path + '/' + this.conf.stream;
      let mp4FileName = dateFormat('yyyy-mm-dd-HH-MM') + '.mp4';
      let mapMp4 = `${this.conf.mp4Flags}${mp4FullPath}/${mp4FileName}|`;
      mkdirp(mp4FullPath);
      mapStr += mapMp4;
      console.log('[Transmuxing MP4] ' + this.conf.streamPath + ' to ' + mp4FullPath + '/' + mp4FileName);
    }
    if (this.conf.hlsPath) {
      this.conf.hlsFlags = this.conf.hlsFlags ? this.conf.hlsFlags : '';
      let hlsFullPath = this.conf.hlsPath + '/' + this.conf.stream;
      let hlsFileName = 'index.m3u8';
      let mapHls = `${this.conf.hlsFlags}${hlsFullPath}/${hlsFileName}|`;
      mkdirp(hlsFullPath);
      mapStr += mapHls;
      console.log('[Transmuxing HLS] ' + this.conf.streamPath + ' to ' + hlsFullPath + '/' + hlsFileName);
    }
    if (this.conf.dashPath) {
      this.conf.dashFlags = this.conf.dashFlags ? this.conf.dashFlags : '';
      let dashFullPath = this.conf.dashPath + '/' + this.conf.stream;
      let dashFileName = 'index.mpd';
      let mapDash = `${this.conf.dashFlags}${dashFullPath}/${dashFileName}`;
      mkdirp(dashFullPath);
      mapStr += mapDash;
      console.log('[Transmuxing DASH] ' + this.conf.streamPath + ' to ' + dashFullPath + '/' + dashFileName);
    }
    let argv = ['-y', '-analyzeduration', '1000000', '-i', inPath, '-c:v', vc, '-c:a', ac, '-f', 'tee', '-map', '0:a?', '-map', '0:v?', mapStr];
    this.ffmpeg_exec = spawn(this.conf.ffmpeg, argv);
    this.ffmpeg_exec.on('error', (e) => {
      // console.log(e);
    });

    this.ffmpeg_exec.stdout.on('data', (data) => {
      // console.log(`输出：${data}`);
    });

    this.ffmpeg_exec.stderr.on('data', (data) => {
      // console.log(`错误：${data}`);
    });

    this.ffmpeg_exec.on('close', (code) => {
      this.emit('end');
    });
  }

  end() {
    // console.log('[TransTask end]', this.conf);
    // this.ffmpeg_exec.kill('SIGINT');
    this.ffmpeg_exec.stdin.write('q');
  }
}

module.exports = NodeTransSession;