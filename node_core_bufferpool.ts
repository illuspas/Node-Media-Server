//  Created by Mingliang Chen on 17/8/1.
//  illuspas[a]gmail.com
//  Copyright (c) 2017 Nodemedia. All rights reserved.

import { Readable } from 'stream';

export class BufferPool extends Readable {
  readBytes: number;
  poolBytes: number;
  needBytes: number;
  gFun: Generator;

  constructor(options = undefined) {
    super(options);
  }

  init(gFun) {
    this.readBytes = 0;
    this.poolBytes = 0;
    this.needBytes = 0;
    this.gFun = gFun;
    this.gFun.next(false);
  }

  stop() {
    this.gFun.next(true);
  }

  push(buf): any {
    super.push(buf);
    this.poolBytes += buf.length;
    this.readBytes += buf.length;
    if (this.needBytes > 0 && this.needBytes <= this.poolBytes) {
      this.gFun.next(false);
    }
  }

  _read(size) {}

  read(size) {
    this.poolBytes -= size;
    return super.read(size);
  }

  need(size) {
    const ret = this.poolBytes < size;
    if (ret) {
      this.needBytes = size;
    }
    return ret;
  }
}
