//
//  Created by Mingliang Chen on 17/8/23.
//  illuspas[a]gmail.com
//  Copyright (c) 2018 Nodemedia. All rights reserved.
//
const Crypto = require('crypto');
const { spawn } = require('child_process');
const context = require('./node_core_ctx');

function generateNewSessionID() {
  let sessionID = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWKYZ0123456789';
  const numPossible = possible.length;
  do {
    for (let i = 0; i < 8; i++) {
      sessionID += possible.charAt((Math.random() * numPossible) | 0);
    }
  } while (context.sessions.has(sessionID));
  return sessionID;
}

function genRandomName() {
  let name = '';
  const possible = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const numPossible = possible.length;
  for (let i = 0; i < 4; i++) {
    name += possible.charAt((Math.random() * numPossible) | 0);
  }

  return name;
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

module.exports = {
  generateNewSessionID,
  verifyAuth,
  genRandomName,
};
