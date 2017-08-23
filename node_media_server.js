//
//  Created by Mingliang Chen on 17/8/1.
//  illuspas[a]gmail.com
//  Copyright (c) 2017 Nodemedia. All rights reserved.
//

const NodeRtmpServer = require('./node_rtmp_server');
const NodeHttpServer = require('./node_http_server');

class NodeMediaServer {
    constructor(config) {
        this.sessions = new Map();
        this.publishers = new Map();
        this.idlePlayers = new Set();
        this.nrs = new NodeRtmpServer(config, this.sessions, this.publishers, this.idlePlayers);
        this.nhs = new NodeHttpServer(config, this.sessions, this.publishers, this.idlePlayers);
    }

    run() {
        this.nrs.run();
        this.nhs.run();
    }
}

module.exports = NodeMediaServer