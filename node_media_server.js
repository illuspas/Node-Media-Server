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
        this.nrs = new NodeRtmpServer(config.rtmp, this.sessions, this.publishers);
        this.nhs = new NodeHttpServer(config.http, this.sessions, this.publishers);
    }

    run() {
        this.nrs.run();
        this.nhs.run();
    }
}

module.exports = NodeMediaServer