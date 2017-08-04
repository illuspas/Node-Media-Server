//
//  Created by Mingliang Chen on 17/8/4.
//  illuspas[a]gmail.com
//  Copyright (c) 2017 Nodemedia. All rights reserved.
//
const EventEmitter = require('events');

const AMF = require('./node_core_amf');
const BufferPool = require('./node_core_bufferpool');

class NodeHttpSession extends EventEmitter {
    constructor(config, id, sessions, publishers) {
        super();
        this.id = id;
        this.sessions = sessions;
        this.publishers = publishers;

        this.bp = new BufferPool();

    }

    run() {
        this.isStarting = true;
        this.bp.init(this.handleData())
    }

    stop() {
        this.isStarting = false;
        this.bp.stop();
    }

    push() {
        this.bp.push(data);
    }

    * handleData() {
        
    }
}

module.exports = NodeHttpSession;