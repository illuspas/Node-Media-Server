//
//  Created by Mingliang Chen on 18/3/2.
//  illuspas[a]gmail.com
//  Copyright (c) 2017 Nodemedia. All rights reserved.
//
const EventEmitter = require('events');

let sessions = new Map();
let publishers = new Map();
let idlePlayers = new Set();
let nodeEvent = new EventEmitter();

module.exports = { sessions, publishers, idlePlayers, nodeEvent };