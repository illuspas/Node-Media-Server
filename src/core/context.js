// @ts-check
//
//  Created by Chen Mingliang on 24/11/28.
//  illuspas@msn.com
//  Copyright (c) 2023 NodeMedia. All rights reserved.
//

const BaseSession = require("../session/base_session.js");
const BroadcastServer = require( "../server/broadcast_server.js");

class Context {
  constructor(config) {
    this.config = config;

    /** @type {Map<string, BaseSession>} */
    this.sessions = new Map();

    /** @type {Map<string, BroadcastServer>} */
    this.broadcasts = new Map();
  }
}

module.exports = Context;
