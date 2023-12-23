import NodeFissionServer from "./node_fission_server";
import NodeHttpServer from "./node_http_server";
import NodeRelayServer from "./node_relay_server";
import { RtmpServer } from "./RtmpServer";
import { TranscodeServer } from "./TranscodeServer";
import { IMediaServerOptions, IRunnable } from "@types";

const Logger = require("./node_core_logger");
const context = require("./node_core_ctx");
const Package = require("../package.json");

export class MediaServer implements IRunnable {
  private _rtmpServer?: IRunnable;
  private _httpServer?: NodeHttpServer;
  private _transcodeServer?: IRunnable;
  private _relayServer?: NodeRelayServer;
  private _fissionServer?: NodeFissionServer;

  constructor(private _config: IMediaServerOptions) {}

  public async run(): Promise<void> {
    Logger.setLogType(this._config.logType);
    Logger.log(`Media Server v${Package.version}`);

    if (this._config.rtmp) {
      this._rtmpServer = new RtmpServer(this._config);
      this._rtmpServer?.run();
    }

    if (this._config.http) {
      this._httpServer = new NodeHttpServer(this._config);
      this._httpServer?.run();
    }

    if (this._config.trans) {
      if (this._config.cluster) {
        Logger.log("Transcode server does not work in cluster mode");
      } else {
        this._transcodeServer = new TranscodeServer(this._config);
        this._transcodeServer?.run();
      }
    }

    if (this._config.relay) {
      if (this._config.cluster) {
        Logger.log("Relay server does not work in cluster mode");
      } else {
        this._relayServer = new NodeRelayServer(this._config);
        this._relayServer?.run();
      }
    }

    if (this._config.fission) {
      if (this._config.cluster) {
        Logger.log("Fission server does not work in cluster mode");
      } else {
        this._fissionServer = new NodeFissionServer(this._config);
        this._fissionServer?.run();
      }
    }

    process.on("uncaughtException", function (err) {
      Logger.error("uncaughtException", err);
    });

    process.on("SIGINT", function () {
      process.exit();
    });
  }

  public on(eventName: string, listener: () => void): void {
    context.nodeEvent.on(eventName, listener);
  }

  public async stop(): Promise<void> {
    this._relayServer?.stop();
    this._httpServer?.stop();
    this._transcodeServer?.stop();
    this._relayServer?.stop();
    this._fissionServer?.stop();
  }

  public getSession(id: string) {
    return context.sessions.get(id);
  }
}
