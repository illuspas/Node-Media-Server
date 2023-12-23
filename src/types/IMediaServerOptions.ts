import { IAuthenticationStratergy } from "./IAuthenticationStratergy";

export interface IRTMPOptions {
  port: number;
  chunk_size: number;
  gop_cache: boolean;
  ping: number;
  ping_timeout: number;
  ssl?: {
    port: number;
    key_path: string;
    cert_path: string;
  };
}

export interface IHTTPOptions {
  port: number;
  mediaroot_path: string;
  webroot_path: string;
  allow_origin: string;
  api: boolean;
}

export interface IHTTPSOptions {
  port: number;
  key_patth: string;
  cert_path: string;
}

export interface IAuthOptions {
  api: boolean;
  api_user: string;
  api_pass: string;
  statergy: IAuthenticationStratergy;
  play: boolean;
  publish: boolean;
  secret: string;
}


export interface IMediaServerOptions {
    rtmp?: IRTMPOptions;
    http: IHTTPOptions;
    https?: IHTTPSOptions;
    auth?: IAuthOptions;
    ffmpeg_path?: string,
    trans?: any;
    relay?: any;
    fission?: any;
    cluster?: any;
    logType?: number;
  }