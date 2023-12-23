import { IMediaServerOptions } from "./types";
import { APIKeyAuthentication } from "./auth/APIKeyAuthentication";
import minimist from "minimist";
import { MediaServer } from "./MediaServer";
import { EventEmitter } from "stream";

global.sessions = new Map();
global.publishers = new Map();
global.idlePlayers = new Set();
global.stat = {
    inbytes: 0,
    outbytes: 0,
    accepted: 0
}
global.events = new EventEmitter();

const argv = minimist(process.argv.slice(2), {
  string: ["rtmp_port", "http_port", "https_port"],
  alias: {
    rtmp_port: "r",
    http_port: "h",
    https_port: "s",
  },
  default: {
    rtmp_port: 1935,
    http_port: 8000,
    https_port: 8443,
  },
});

if (argv.help) {
  console.log("Usage:");
  console.log("  node-media-server --help // print help information");
  console.log("  node-media-server --rtmp_port 1935 or -r 1935");
  console.log("  node-media-server --http_port 8000 or -h 8000");
  console.log("  node-media-server --https_port 8443 or -s 8443");
  process.exit(0);
}

const config: IMediaServerOptions = {
  rtmp: {
    port: argv.rtmp_port,
    chunk_size: 60000,
    gop_cache: true,
    ping: 30,
    ping_timeout: 60,
  },
  http: {
    port: argv.http_port,
    mediaroot_path: __dirname + "/media",
    webroot_path: __dirname + "/www",
    allow_origin: "*",
    api: true,
  },
  auth: {
    api: true,
    api_user: "admin",
    api_pass: "admin",
    statergy: new APIKeyAuthentication(["test"]),
    play: false,
    publish: false,
    secret: "nodemedia2017privatekey",
  }
};

(async () => {
    const media_server = new MediaServer(config);
    await media_server.run();
})();

