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

  /**
   * Cumulative streaming network traffic (bytes) over the process lifetime.
   * Accumulated by every publisher/player session next to its own counters;
   * record sessions (file writes) are excluded.
   * @type {{inBytes: number, outBytes: number}}
   */
  networkStats: { inBytes: 0, outBytes: 0 },

  eventEmitter: new EventEmitter()
};

module.exports = Context;
