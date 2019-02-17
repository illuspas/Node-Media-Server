//
//  Created by Mingliang Chen on 17/8/23.
//  illuspas[a]gmail.com
//  Copyright (c) 2017 Nodemedia. All rights reserved.
//
const EventEmitter = require('events');

function generateNewSessionID(sessions) {
  let SessionID = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWKYZ0123456789';
  const numPossible = possible.length;
  do {
    for (var i = 0; i < 8; i++) {
      SessionID += possible.charAt((Math.random() * numPossible) | 0);
    }
  } while (sessions.has(SessionID));
  return SessionID;
}

module.exports.generateNewSessionID = generateNewSessionID;
module.exports.nodeEvent = new EventEmitter();
