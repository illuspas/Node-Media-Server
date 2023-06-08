//
//  Created by Chen Mingliang on 20/7/16.
//  illuspas[a]msn.com
//  Copyright (c) 2020 Nodemedia. All rights reserved.
//
const Logger = require('./node_core_logger');

const EventEmitter = require('events');
const { spawn } = require('child_process');

class NodeFissionSession extends EventEmitter {
  constructor(conf) {
    super();
    this.conf = conf;
  }

  run() {
    let inPath = 'rtmp://127.0.0.1:' + this.conf.rtmpPort + this.conf.streamPath;
    let argv = ['-i', inPath];
    for (let m of this.conf.model) {
      let x264 = ['-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency', '-maxrate', m.vb, '-bufsize', m.vb, '-g', parseInt(m.vf) * 2, '-r', m.vf, '-s', m.vs];
      let aac = ['-c:a', 'aac', '-b:a', m.ab];
      let outPath = ['-f', 'flv', 'rtmp://127.0.0.1:' + this.conf.rtmpPort + '/' + this.conf.streamApp + '/' + this.conf.streamName + '_' + m.vs.split('x')[1]];
      argv.splice(argv.length, 0, ...x264);
      argv.splice(argv.length, 0, ...aac);
      argv.splice(argv.length, 0, ...outPath);
    }

    argv = argv.filter((n) => { return n; });
    this.ffmpeg_exec = spawn(this.conf.ffmpeg, argv);
    this.ffmpeg_exec.on('error', (e) => {
      Logger.ffdebug(e);
    });

    this.ffmpeg_exec.stdout.on('data', (data) => {
      Logger.ffdebug(`FF_LOG:${data}`);
    });

    this.ffmpeg_exec.stderr.on('data', (data) => {
      Logger.ffdebug(`FF_LOG:${data}`);
    });

    this.ffmpeg_exec.on('close', (code) => {
      Logger.log('[Fission end] ' + this.conf.streamPath);
      this.emit('end');
    });
  }

  end() {
    this.ffmpeg_exec.kill();
  }
}

module.exports = NodeFissionSession;