//
//  Created by Mingliang Chen on 17/8/1.
//  illuspas[a]gmail.com
//  Copyright (c) 2017 Nodemedia. All rights reserved.
//

const Readable = require('stream').Readable;

class BufferPool extends Readable {
  constructor(gfun, options) {
    super(options);
    this.gFun = gfun;
  }

  _read(size) {

  }

  init(gFun) {
    this.readBytes = 0;
    this.poolBytes = 0;
    this.needBytes = 0;
    this.gFun.next(false);
  }

  stop() {
    try {
      this.gFun.next(true);
    } catch (e) {
      // console.log(e);
    }
  }

  push(buf) {
    super.push(buf);
    this.poolBytes += buf.length;
    this.readBytes += buf.length;
    if (this.needBytes > 0 && this.needBytes <= this.poolBytes) {
      this.gFun.next(false);
    }
  }

  read(size) {
    this.poolBytes -= size;
    return super.read(size);
  }

  need(size) {
    let ret = this.poolBytes < size;
    if (ret) {
      this.needBytes = size;
    } else {
      this.needBytes = 0;
    }
    return ret;
  }
}

module.exports = BufferPool
