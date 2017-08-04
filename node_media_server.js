const NodeRtmpServer = require('./node_rtmp_server')

class NodeMediaServer {
    constructor(config) {
        this.sessions = new Map();
        this.publishers = new Map();
        this.nrs = new NodeRtmpServer(config.rtmp, this.sessions, this.publishers);
    }

    run() {
        this.nrs.run();
    }
}

module.exports = NodeMediaServer