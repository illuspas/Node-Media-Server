//
//  Created by Mingliang Chen on 17/8/23.
//  illuspas[a]gmail.com
//  Copyright (c) 2017 Nodemedia. All rights reserved.
//
const Crypto = require('crypto');
const EventEmitter = require('events');

function generateNewSessionID(sessions) {
    let SessionID = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWKYZ0123456789';
    const numPossible = possible.length;
    do {
        for (var i = 0; i < 8; i++) {
            SessionID += possible.charAt((Math.random() * numPossible) | 0);
        }
    } while (sessions.has(SessionID))
    return SessionID;
}

function verifyAuth(signStr, streamId, secretKey) {
    if (signStr === undefined) {
        return false;
    }
    let now = Date.now() / 1000 | 0;
    let exp = parseInt(signStr.split('-')[0]);
    let shv = signStr.split('-')[1];
    let str = streamId + '-' + exp + '-' + secretKey;
    if (exp < now) {
        return false;
    }
    let md5 = Crypto.createHash('md5');
    let ohv = md5.update(str).digest('hex');
    return shv === ohv;
}

module.exports.generateNewSessionID = generateNewSessionID;
module.exports.verifyAuth = verifyAuth;
module.exports.nodeEvent = new EventEmitter();