import NodeHttpServer from "./server/http_server.js";
import NodeRtmpServer from "./server/rtmp_server.js";
import { createRequire } from "module";
import logger from "./core/logger.js";

const require = createRequire(import.meta.url);
const Package = require("../package.json");


export default class NodeMediaServer {
    constructor(config) {
        logger.level = "debug";
        logger.info(`Node-Media-Server v${Package.version}`);
        logger.info(`Homepage: ${Package.homepage}`);
        logger.info(`License: ${Package.license}`);
        logger.info(`Author: ${Package.author}`);
        this.ctx = {
            config,
            sessions: new Map(),
            broadcasts: new Map()
        };
        this.httpServer = new NodeHttpServer(this.ctx);
        this.rtmpServer = new NodeRtmpServer(this.ctx);
    }

    run() {
        this.httpServer.run();
        this.rtmpServer.run();
    }
}