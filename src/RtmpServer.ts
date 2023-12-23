import { readFileSync } from "fs";
import { Socket, Server as TCPServer, createServer as createTCPServer } from "net";
import { Server as TLSServer, TLSSocket, createServer as createTLSServer } from "tls";
import { IMediaServerOptions, IRunnable } from "./types";
import Logger from "./node_core_logger";
import NodeRtmpSession from "./node_rtmp_session";
import { RtmpSession } from "./RtmpSession";
//import { RtmpSession } from "./RtmpSession";

const RTMP_PORT = 1935;
const RTMPS_PORT = 443;

export class RtmpServer implements IRunnable {
  private _port?: number;
  private _sslPort?: number;

  private _tcpServer?: TCPServer;
  private _tlsServer?: TLSServer;

  constructor(private _config: IMediaServerOptions) {
    const { rtmp: options } = this._config;

    if(options == undefined) return;

    options.port = this._port = options?.port || RTMP_PORT;
    this._tcpServer = createTCPServer((socket: Socket) => {
      new RtmpSession(this._config, socket).run();
    });

    if (options.ssl) {
      this._sslPort = options.ssl.port || RTMPS_PORT;

      try {
        const ssl_options = {
          key: readFileSync(options.ssl.key_path),
          cert: readFileSync(options.ssl.cert_path),
        };
        this._tlsServer = createTLSServer(ssl_options, (socket: TLSSocket) => {
          new RtmpSession(this._config, socket).run();
        });
      } catch (e) {
        Logger.error(
          `Rtmp server error while reading ssl certs: <${e}>`
        );
      }
    }
  }

  public async run(): Promise<void> {
    this._tcpServer?.listen(this._port, () => {
      Logger.log(`Rtmp server started on port: ${this._port}`);
    });

    this._tcpServer?.on("error", (e) => {
      Logger.error(`Rtmp server ${e}`);
    });

    this._tcpServer?.on("close", () => {
      Logger.log("Rtmp server Close.");
    });

    this._tlsServer?.listen(this._sslPort, () => {
      Logger.log(`Rtmps server started on port: ${this._sslPort}`);
    });

    this._tlsServer?.on("error", (e) => {
      Logger.error(`Rtmps server ${e}`);
    });

    this._tlsServer?.on("close", () => {
      Logger.log("Rtmps server Close.");
    });
  }

  public async stop(): Promise<void> {
    this._tcpServer?.close();
    this._tlsServer?.close();

    sessions.forEach((session: NodeRtmpSession) => {
      session.stop();
    });
  }
}
