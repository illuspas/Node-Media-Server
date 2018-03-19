//
//  Created by Mingliang Chen on 18/3/16.
//  illuspas[a]gmail.com
//  Copyright (c) 2018 Nodemedia. All rights reserved.
//

const EventEmitter = require('events');
const { spawn } = require('child_process');
const dateFormat = require('dateformat');
const mkdirp = require('mkdirp');
const fs = require('fs');

class NodeRelaySession extends EventEmitter {
  constructor(conf) {
    super();
    this.conf = conf;
  }

  run() {

    let argv = ['-analyzeduration', '1000000', '-i', this.conf.inPath, '-c', 'copy', '-f', 'flv', this.conf.ouPath];
    if (this.conf.inPath[0] === '/' || this.conf.inPath[1] === ':') {
      argv.unshift('-re');
    }
    // console.log(argv.toString());
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
      console.log('[Relay end]',this.id);
      this.emit('end', this.id);
    });
  }

  end() {
    // this.ffmpeg_exec.kill('SIGINT');
    this.ffmpeg_exec.stdin.write('q');
  }
}

module.exports = NodeRelaySession;