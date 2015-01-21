//  Created by Mingliang Chen on 15/1/16.
//  Copyright (c) 2015 Nodemedia. All rights reserved.

var net = require('net');
var NMRtmpConn = require('./nm_rtmp_conn');

function NMServer() {
    var self = this;
    this.port = 1935;
    this.conns = {};
    this.producers = {};

    this.rtmpServer = net.createServer(function(socket) {
        var id = self.generateNewSessionID();
        var rtmpClient = new NMRtmpConn(id, socket, self.conns, self.producers);

        socket.on('data', function(data) {
            rtmpClient.qb.push(data);
        });

        socket.on('end', function() {
            rtmpClient.stop();
            console.log('client disconnected id=' + rtmpClient.id);
        });

        socket.on('error', function() {
            console.log('client error id=' + rtmpClient.id);
            rtmpClient.stop();
        });

        rtmpClient.run();
        console.log('client connect id=' + id);
    });

    NMServer.prototype.run = function() {

        this.rtmpServer.listen(this.port, function() {
            console.log('Node Media Server bound on port:' + self.port);
        });

        this.rtmpServer.on('error', function(e) {
            console.error('rtmpServer listen error:'+e);
        });
    };

    NMServer.prototype.generateNewSessionID = function() {
        do {
            var possible = "abcdefghijklmnopqrstuvwxyz0123456789";
            var numPossible = possible.length;
            var SessionID = '';
            for (var i = 0; i < 12; i++) {
                SessionID += possible.charAt((Math.random() * numPossible) | 0);
            }
        } while (this.conns[SessionID])
        return SessionID;
    };

};

module.exports = NMServer;