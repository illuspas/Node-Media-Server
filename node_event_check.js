//
//  Created by Steve Roberts (Go Media Ltd) on 2020/2/4.
//  steve[a]gomedia.co
//  Copyright (c) 2019 Go Media Ltd. All rights reserved.
//
const Logger = require('./node_core_logger');

var func = {};

function on(eventName, listener) {
    if (typeof listener === 'function') {
        func[eventName] = listener;
    }
}

async function run(eventName, args) {
    if (typeof func[eventName] === 'function') {
        Logger.log(`[${eventName}] args=${JSON.stringify(args)}`);
        return await func[eventName](args);
    } else {
        return true;
    }
}

module.exports = {
    on,
    run
}