//
//  Created by Mingliang Chen on 18/3/16.
//  illuspas[a]gmail.com
//  Copyright (c) 2018 Nodemedia. All rights reserved.
//
const Logger = require('./logger');

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

    let argv = ['-fflags', 'nobuffer', '-analyzeduration', '1000000', '-i', this.conf.inPath, '-c', 'copy', '-f', 'flv', this.conf.ouPath];
    if (this.conf.inPath[0] === '/' || this.conf.inPath[1] === ':') {
      argv.unshift('-re');
    }
    // Logger.debug(argv.toString());
    this.ffmpeg_exec = spawn(this.conf.ffmpeg, argv);
    this.ffmpeg_exec.on('error', (e) => {
      // Logger.debug(e);
    });

    this.ffmpeg_exec.stdout.on('data', (data) => {
      // Logger.debug(`输出：${data}`);
    });

    this.ffmpeg_exec.stderr.on('data', (data) => {
      // Logger.debug(`错误：${data}`);
    });

    this.ffmpeg_exec.on('close', (code) => {
      Logger.log('[Relay end] id=', this.id);
      this.emit('end', this.id);
    });
  }

  end() {
    // this.ffmpeg_exec.kill('SIGINT');
    this.ffmpeg_exec.stdin.write('q');
  }
}

module.exports = NodeRelaySession;