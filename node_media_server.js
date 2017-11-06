//
//  Created by Mingliang Chen on 17/8/1.
//  illuspas[a]gmail.com
//  Copyright (c) 2017 Nodemedia. All rights reserved.
//

const NodeRtmpServer = require('./node_rtmp_server');
const NodeHttpServer = require('./node_http_server');
const NodeCoreUtils = require('./node_core_utils');

class NodeMediaServer {
    constructor(config) {
        this.sessions = new Map();
        this.publishers = new Map();
        this.idlePlayers = new Set();
        this.nrs = new NodeRtmpServer(config, this.sessions, this.publishers, this.idlePlayers);
        this.nhs = new NodeHttpServer(config, this.sessions, this.publishers, this.idlePlayers);
        this.nodeEvent = NodeCoreUtils.nodeEvent;
    }

    run() {
        this.nrs.run();
        this.nhs.run();
    }

    on(eventName, listener) {
        this.nodeEvent.on(eventName, listener);
    }

    getSession(id) {
        return this.sessions.get(id);
    }
}

module.exports = NodeMediaServer