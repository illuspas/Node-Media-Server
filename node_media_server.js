//
//  Created by Mingliang Chen on 17/8/1.
//  illuspas[a]gmail.com
//  Copyright (c) 2017 Nodemedia. All rights reserved.
//

const NodeRtmpServer = require('./node_rtmp_server');
const NodeHttpServer = require('./node_http_server');
const NodeWsProxyServer = require('./node_ws_proxy_server');

class NodeMediaServer {
    constructor(config) {
        this.sessions = new Map();
        this.publishers = new Map();
        this.idlePlayers = new Set();
        this.nrs = new NodeRtmpServer(config, this.sessions, this.publishers, this.idlePlayers);
        this.nhs = new NodeHttpServer(config, this.sessions, this.publishers, this.idlePlayers);
        this.nws = new NodeWsProxyServer(config, this.sessions, this.publishers, this.idlePlayers);
    }

    run() {
        this.nrs.run();
        this.nhs.run();
        this.nws.run();
    }
}

module.exports = NodeMediaServer