import { EventEmitter } from "events";

declare global {
    var sessions: Map;
    var publishers: Map;
    var idlePlayers: Set;
    var events; EventEmitter;
    var stat: {
        inbytes: number,
        outbytes: number,
        accepted: 
        number
    }
}

export {};