// @ts-check
//
//  Created by Chen Mingliang on 24/11/28.
//  illuspas@msn.com
//  Copyright (c) 2023 NodeMedia. All rights reserved.
//

const EventEmitter = require("node:events");

/**
 * @typedef {import("../store/lightweight_store.js")} LightweightStore
 */

/**
 * @typedef {import("../server/relay_server.js")} NodeRelayServer
 */

const Context = {
  config: {},

  /**
   * Optional path of the config file the running instance was loaded from
   * (set by the CLI entry). When present, password changes are persisted to it.
   * @type {string|null}
   */
  configFile: null,

  sessions: new Map(),

  broadcasts: new Map(),

  /**
   * Persistent JSON store (relay tasks, record metadata, stream history).
   * Assigned by the NodeMediaServer constructor once the store is created.
   * @type {LightweightStore | null}
   */
  store: null,

  /**
   * Relay task manager, exposed for API access.
   * Assigned by the NodeMediaServer constructor.
   * @type {NodeRelayServer | null}
   */
  relayServer: null,

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
