//
//  Created by Mingliang Chen on 17/8/1.
//  illuspas[a]gmail.com
//  Copyright (c) 2017 Nodemedia. All rights reserved.
//

const Readable = require('stream').Readable;

class BufferPool extends Readable {
    constructor(options) {
        super(options);
    }

    init(gFun) {
        this.readBytes = 0;
        this.poolBytes = 0;
        this.needBytes = 0;
        this.gFun = gFun;
        this.need(this.gFun.next(false).value);
    }

    stop() {
        this.gFun.return(true)
    }

    push(buf) {
        super.push(buf);
        this.poolBytes += buf.length;
        this.readBytes += buf.length;
        let enough = this.needBytes > 0 && this.needBytes <= this.poolBytes
        while (enough) {
            enough = this.need(this.gFun.next(this.read(this.needBytes)).value);
        }
    }

    _read(size) {

    }

    read(size) {
        this.poolBytes -= size;
        return super.read(size);
    }

    need(size) {
        this.needBytes = size;
        return this.poolBytes >= size;
    }
}

module.exports = BufferPool