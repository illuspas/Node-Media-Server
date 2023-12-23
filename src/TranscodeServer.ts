import mkdirp from "mkdirp";
import NodeTransSession from "./node_trans_session";
import { IMediaServerOptions, IRunnable } from "./types";
import { accessSync, constants as FSConstants } from "fs";

const Logger = require("./node_core_logger");
const { getFFmpegVersion, getFFmpegUrl } = require("./node_core_utils");

export class TranscodeServer implements IRunnable {
  private _sessions: Map<string, NodeTransSession> = new Map();

  constructor(private _config: IMediaServerOptions) {}

  public async run(): Promise<void> {
    try {
      mkdirp.sync(this._config.http.mediaroot_path);
      accessSync(this._config.http.mediaroot_path, FSConstants.W_OK);
    } catch (error) {
      Logger.error(
        `Transcode server startup failed. MediaRoot:${this._config.http.mediaroot_path} cannot be written.`
      );
      return;
    }

    try {
      accessSync(this._config?.ffmpeg_path as string, FSConstants.X_OK);
    } catch (error) {
      Logger.error(
        `Transcode server  startup failed. ffmpeg:${this._config.ffmpeg_path} cannot be executed.`
      );
      return;
    }

    let version = await getFFmpegVersion(this._config.ffmpeg_path);
    if (version === "" || parseInt(version.split(".")[0]) < 4) {
      Logger.error(
        "Transcode server  startup failed. ffmpeg requires version 4.0.0 above"
      );
      Logger.error(
        "Download the latest ffmpeg static program:",
        getFFmpegUrl()
      );
      return;
    }

    let i = this._config.trans.tasks.length;
    let apps = "";
    while (i--) {
      apps += this._config.trans.tasks[i].app;
      apps += " ";
    }
    events.on("postPublish", this.onPostPublish.bind(this));
    events.on("donePublish", this.onDonePublish.bind(this));
    Logger.log(
      `Transcode server  started for apps: [ ${apps}] , MediaRoot: ${this._config.http.mediaroot_path}, ffmpeg version: ${version}`
    );
  }

  private onPostPublish(id: string, streamPath: string, ...args: any[]): void {
    const regRes = /\/(.*)\/(.*)/gi.exec(streamPath);
    const [app, name] = regRes?.slice(1) as string[];
    let i = this._config.trans.tasks.length;
    while (i--) {
      let conf = { ...this._config.trans.tasks[i] };
      conf.ffmpeg = this._config.trans.ffmpeg;
      conf.mediaroot = this._config.http.mediaroot_path;
      conf.rtmpPort = this._config.rtmp?.port as number;
      conf.streamPath = streamPath;
      conf.streamApp = app;
      conf.streamName = name;
      conf.args = args;
      if (app === conf.app) {
        let session = new NodeTransSession(conf);
        this._sessions.set(id, session);
        session.on("end", () => {
          this._sessions.delete(id);
        });
        session.run();
      }
    }
  }

  private onDonePublish(id: string, streamPath: string, ...args: any[]): void {
    this._sessions.get(id)?.end();
  }

  public async stop(): Promise<void> {}
}
