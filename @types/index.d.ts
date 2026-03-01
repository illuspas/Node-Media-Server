/**
 * Full type definitions for Node-Media-Server v4
 * Based on the architecture of Context, Sessions, and Servers (RTMP/HTTP/HTTPS/Auth/Record/Notify)
 */
import { Socket } from "net";

export interface SslConfig {
  port?: number;
  key: string;
  cert: string;
}

export interface JwtUser {
  username: string;
  password?: string;
  role?: string;
}

export interface JwtConfig {
  expiresIn?: string;
  refreshExpiresIn?: string;
  algorithm?: "HS256" | "HS384" | "HS512";
  users: JwtUser[];
}

export interface AuthConfig {
  play?: boolean;
  publish?: boolean;
  secret?: string;
  jwt?: JwtConfig;
}

export interface RtmpConfig {
  port?: number;
  chunk_size?: number;
  gop_cache?: boolean;
  ping?: number;
  ping_timeout?: number;
}

export interface HttpConfig {
  port?: number;
  mediaroot?: string;
  allow_origin?: string;
}

export interface StaticConfig {
  router?: string;
  root?: string;
}

export interface RecordConfig {
  path?: string;
}

export interface NotifyConfig {
  url?: string;
}

export interface TransTaskConfig {
  app: string;
  hls?: boolean;
  hlsFlags?: string;
  dash?: boolean;
  dashFlags?: string;
  vc?: string;
  vcParam?: string[];
  ac?: string;
  acParam?: string[];
  rtmp?: boolean;
  rtmpApp?: string;
  mp4?: boolean;
  mp4Flags?: string;
}

export interface TransConfig {
  ffmpeg: string;
  tasks: TransTaskConfig[];
}

export interface RelayTaskConfig {
  app: string;
  name?: string;
  mode: "static" | "pull" | "push";
  edge: string;
  rtsp_transport?: "tcp" | "udp";
  appendName?: boolean;
}

export interface RelayConfig {
  ffmpeg: string;
  tasks: RelayTaskConfig[];
}

/**
 * Main Node-Media-Server configuration
 */
export interface NodeMediaServerConfig {
  bind?: string;
  rtmp?: RtmpConfig;
  rtmps?: SslConfig;
  http?: HttpConfig;
  https?: SslConfig;
  auth?: AuthConfig;
  static?: StaticConfig;
  record?: RecordConfig;
  notify?: NotifyConfig;
  trans?: TransConfig;
  relay?: RelayConfig;
}

/**
 * Common properties for all session types
 */
export interface BaseSession {
  id: string;
  ip: string;
  isPublisher: boolean;
  protocol: "rtmp" | "flv" | "record";
  streamHost: string;
  streamApp: string;
  streamName: string;
  streamPath: string;
  streamQuery: Record<string, string | string[] | undefined>;
  createTime: number;
  endTime: number;

  // Media Statistics
  videoCodec: number;
  videoWidth: number;
  videoHeight: number;
  videoFramerate: number;
  videoDatarate: number;
  audioCodec: number;
  audioChannels: number;
  audioSamplerate: number;
  audioDatarate: number;

  // Data Flow
  inBytes: number;
  outBytes: number;

  // Recording Metadata
  filePath?: string;

  // Methods
  close(): void;
  /**
   * Note: In some versions or custom logic, reject() is used to terminate 
   * unauthorized sessions during "pre" events.
   */
  reject?(): void;
  sendBuffer(buffer: Buffer): void;
}

/**
 * Specific properties for RTMP sessions
 */
export interface RtmpSession extends BaseSession {
  protocol: "rtmp";
  socket: Socket;
  // Internal RTMP protocol state
  rtmp: any;
}

/**
 * Specific properties for HTTP-FLV sessions
 */
export interface FlvSession extends BaseSession {
  protocol: "flv";
  req: any; // Express/HTTP Request
  res: any; // Express/HTTP Response or WebSocket
}

/**
 * Events returning 3 arguments: (session, streamPath, args)
 */
export type NodeMediaServerDataEvents =
  | "prePublish"
  | "postPublish"
  | "donePublish"
  | "prePlay"
  | "postPlay"
  | "donePlay";

/**
 * Events returning 1 argument: (session)
 */
export type NodeMediaServerSessionEvents =
  | "preConnect"
  | "postConnect"
  | "postRecord"
  | "doneRecord";

/**
 * Main Node-Media-Server Class
 */
export default class NodeMediaServer {
  constructor(config: NodeMediaServerConfig);

  /**
   * Internal server instances
   */
  httpServer: any;
  rtmpServer: any;
  recordServer: any;
  notifyServer: any;

  /**
   * Starts all server instances
   */
  run(): void;

  /**
   * Signature for data/stream events (3 parameters).
   * Using 'any' for the session allows the user to define the specific type (RtmpSession, etc.)
   * in their implementation without contravariance errors.
   */
  on(
    event: NodeMediaServerDataEvents,
    listener: (session: any, streamPath: string, args: Record<string, any>) => void
  ): void;

  /**
   * Signature for connection lifecycle events (1 parameter).
   */
  on(
    event: NodeMediaServerSessionEvents,
    listener: (session: any) => void
  ): void;
}