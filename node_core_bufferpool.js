//
//  Created by Mingliang Chen on 17/8/1.
//  illuspas[a]gmail.com
//  Copyright (c) 2017 Nodemedia. All rights reserved.
//

const Readable = require('stream').Readable;

class BufferPool extends Readable {
  constructor (options) {
    super(options);
  }

  init (gFun) {
    this.totalBufferLength = 0;
    this.needBufferLength = 0;
    this.gFun = gFun;
    this.gFun.next(false);
  }

  stop() {
    this.gFun.next(true);
  }

  push (buf) {
    super.push(buf);
    this.totalBufferLength += buf.length;
    if (this.needBufferLength > 0 && this.needBufferLength <= this.totalBufferLength) {
      this.gFun.next(false);
    }
  }

  read (size) {
    this.totalBufferLength -= size;
    return super.read(size);
  }

  need (size) {
    let ret = this.totalBufferLength < size;
    if (ret) {
      this.needBufferLength = size;
    }
    return ret;
  }
}

module.exports = BufferPool
