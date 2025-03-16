// @ts-check
//
//  Created by Chen Mingliang on 24/11/28.
//  illuspas@msn.com
//  Copyright (c) 2023 NodeMedia. All rights reserved.
//

const EventEmitter = require("node:events");

const Context = {
  config: {},

  sessions: new Map(),

  broadcasts: new Map(),

  eventEmitter: new EventEmitter()
};

module.exports = Context;
