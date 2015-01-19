//  Created by Mingliang Chen on 15/1/16.
//  Copyright (c) 2015 Nodemedia. All rights reserved.

var Readable = require('stream').Readable;

function QueueBuffer() {
    this.readStream = new Readable();
    this.queueBuffer = [];

    this.readStream.on('error', function() {

    });

    QueueBuffer.prototype.push = function(data) {
        this.readStream.push(data);
    };

    QueueBuffer.prototype.read = function(length, enQueue) {
        var tmpBuffer = this.readStream.read(length);
        if (tmpBuffer == null) {
            this.rollback();
            return null;
        } else {
            this.queueBuffer.push(tmpBuffer);
            if (enQueue) {
                this.commit();
            }
            return tmpBuffer;
        }
    };

    QueueBuffer.prototype.rollback = function() {
        var length = this.queueBuffer.length;
        for (var i = 0; i < length; i++) {
            this.readStream.unshift(this.queueBuffer.pop());
        }
    };

    QueueBuffer.prototype.commit = function() {
        var length = this.queueBuffer.length;
        for (var i = 0; i < length; i++) {
            this.queueBuffer.pop();
        }
    };

    QueueBuffer.prototype.end = function() {
        this.readStream.read();
        this.commit();
    };
}

module.exports = QueueBuffer;