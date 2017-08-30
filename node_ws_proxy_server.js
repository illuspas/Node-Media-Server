//
//  Created by GodKA Chen on 17/8/30.
//  me@mythkast.net
//

const Http = require('http');
const websocket = require('./websocket-utils');
const NodeCoreUtils = require('./node_core_utils');

class NodeWsProxyServer {
    constructor(config, sessions, publishers, idlePlayers) {
        this.port = config.rtmp.port;
        this.websocket_port = config.websocket.port;
    }

    run() {
        websocket.listen(this.websocket_port, '0.0.0.0', function (websocket) {
            // set up backend TCP connection
            var tcpsocket = new net.Socket();
            tcpsocket.connect('127.0.0.1', this.port);
            // TCP handler functions
            //tcpsocket.on("connect", function () {
            //    console.log("TCP connection open");
            //var httpget = "GET " + websocket.uri + "&protocol=tcp";
            //tcpsocket.write(httpget);
            //});
            tcpsocket.on("data", function (data) {
                websocket.send(data);
            });
            tcpsocket.on("error", function () {
                console.log(`Node Media Websocket Server`, arguments);
            });
            // WebSocket handler functions
            websocket.on("data", function (opcode, data) {
                tcpsocket.write(data);
            });
            websocket.on("close", function (code, reason) {
                console.log("WebSocket closed")
                // close backend connection
                tcpsocket.end();
            });
            console.log("WebSocket connection open");
        });
        console.log(`Node Media Websocket Server started on port: ${this.websocket_port}`);
    }
}

module.exports = NodeWsProxyServer