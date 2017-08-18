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
    this.readBytes = 0;
    this.poolBytes = 0;
    this.needBytes = 0;
    this.gFun = gFun;
    this.gFun.next(false);
  }

  stop() {
    this.gFun.next(true);
  }

  push (buf) {
    super.push(buf);
    this.poolBytes += buf.length;
    this.readBytes += buf.length;
    if (this.needBytes > 0 && this.needBytes <= this.poolBytes) {
      this.gFun.next(false);
    }
  }

  _read(size) {

  }

  read (size) {
    this.poolBytes -= size;
    return super.read(size);
  }

  need (size) {
    let ret = this.poolBytes < size;
    if (ret) {
      this.needBytes = size;
    }
    return ret;
  }
}

module.exports = BufferPool
