// @ts-check
//
//  Created by Chen Mingliang on 24/11/28.
//  illuspas@msn.com
//  Copyright (c) 2024 NodeMedia. All rights reserved.
//

import { EventEmitter } from "node:events";
import { Server, Socket as NetSocket } from "node:net";
import { Server as TlsServer } from "node:tls";
import { Server as HttpServer, IncomingMessage } from "node:http";
import { Http2Server, Http2SecureServer } from "node:http2";
import { WriteStream } from "node:fs";
import WebSocket from "ws";
import { Express, Request, Response, Router } from "express";

// ==================== Core Types ====================

/**
 * Configuration for HTTP/HTTPS server
 */
export interface HttpConfig {
  port: number;
}

export interface HttpsConfig {
  port: number;
  key: string;
  cert: string;
}

/**
 * Configuration for RTMP/RTMPS server
 */
export interface RtmpConfig {
  port: number;
  chunk_size?: number;
  gop_cache?: boolean;
  ping?: number;
  ping_timeout?: number;
}

export interface RtmpsConfig {
  port: number;
  key: string;
  cert: string;
}

/**
 * Configuration for static file serving
 */
export interface StaticConfig {
  router: string;
  root: string;
}

/**
 * Configuration for authentication
 */
export interface AuthConfig {
  play?: boolean;
  publish?: boolean;
  secret?: string;
  jwt?: {
    secret: string;
    expiresIn?: string | number;
  };
}

/**
 * Configuration for stream recording
 */
export interface RecordConfig {
  path: string;
}

/**
 * Configuration for event notifications
 */
export interface NotifyConfig {
  url: string;
}

/**
 * Main server configuration
 */
export interface NodeMediaServerConfig {
  bind?: string;
  http?: HttpConfig;
  https?: HttpsConfig;
  rtmp?: RtmpConfig;
  rtmps?: RtmpsConfig;
  static?: StaticConfig;
  auth?: AuthConfig;
  record?: RecordConfig;
  notify?: NotifyConfig;
}

// ==================== Event Types ====================

/**
 * Event names that can be emitted by the server
 */
export type ServerEventName =
  | "prePlay"
  | "postPlay"
  | "donePlay"
  | "prePublish"
  | "postPublish"
  | "donePublish"
  | "postRecord"
  | "doneRecord"
  | "serverError"
  | "sessionError";

/**
 * Server error event payload
 */
export interface ServerErrorEvent {
  server: "http" | "https" | "ws" | "wss" | "rtmp" | "rtmps";
  error: Error;
}

/**
 * Session error event payload
 */
export interface SessionErrorEvent {
  session: BaseSession;
  error: Error | string;
}

// ==================== Packet Types ====================

/**
 * Audio/Video packet codec identifiers
 */
export enum AVCodecID {
  AUDIO_NONE = 0,
  AUDIO_AAC = 10,
  AUDIO_MP3 = 2,
  AUDIO_PCM = 1,
  VIDEO_H264 = 7,
  VIDEO_H265 = 12,
  VIDEO_AV1 = 13,
  VIDEO_VP8 = 8,
  VIDEO_VP9 = 9,
}

/**
 * Audio/Video packet codec type
 */
export enum AVCodecType {
  AUDIO = 0,
  VIDEO = 1,
}

/**
 * Packet flags for broadcast processing
 */
export enum AVPacketFlags {
  AUDIO_HEADER = 0,
  VIDEO_NON_KEYFRAME = 1,
  VIDEO_HEADER = 2,
  GOP_START_KEYFRAME = 3,
  VIDEO_KEYFRAME = 4,
  METADATA = 5,
}

/**
 * Audio/Video packet data structure
 */
export interface AVPacket {
  codec_id: number;
  codec_type: number;
  duration: number;
  flags: number;
  pts: number;
  dts: number;
  size: number;
  offset: number;
  data: Buffer;
}

// ==================== Session Types ====================

/**
 * Base session class for all connection types
 */
export class BaseSession {
  id: string;
  ip: string;
  isPublisher: boolean;
  protocol: string;
  streamHost: string;
  streamApp: string;
  streamName: string;
  streamPath: string;
  streamQuery: Record<string, any>;
  createTime: number;
  endTime: number;

  videoCodec: number;
  videoWidth: number;
  videoHeight: number;
  videoFramerate: number;
  videoDatarate: number;
  audioCodec: number;
  audioChannels: number;
  audioSamplerate: number;
  audioDatarate: number;

  inBytes: number;
  outBytes: number;

  filePath: string;

  sendBuffer(buffer: Buffer): void;
  close(): void;
}

/**
 * RTMP session for RTMP/RTMPS connections
 */
export class RtmpSession extends BaseSession {
  socket: NetSocket;
  protocol: "rtmp";

  sendBuffer(buffer: Buffer): void;
  close(): void;
}

/**
 * FLV session for HTTP-FLV/WebSocket-FLV connections
 */
export class FlvSession extends BaseSession {
  req: Request | IncomingMessage;
  res: Response | WebSocket;
  protocol: "flv";

  sendBuffer(buffer: Buffer): void;
  close(): void;
}

/**
 * Record session for stream recording
 */
export class RecordSession extends BaseSession {
  fileStream: WriteStream;
  protocol: "flv";

  sendBuffer(buffer: Buffer): void;
  close(): void;
}

// ==================== Broadcast Types ====================

/**
 * Broadcast server for managing stream distribution
 */
export class BroadcastServer {
  publisher: BaseSession | null;
  subscribers: Map<string, BaseSession>;
  flvHeader: Buffer;
  flvMetaData: Buffer | null;
  flvAudioHeader: Buffer | null;
  flvVideoHeader: Buffer | null;
  rtmpMetaData: Buffer | null;
  rtmpAudioHeader: Buffer | null;
  rtmpVideoHeader: Buffer | null;
  flvGopCache: Set<Buffer> | null;
  rtmpGopCache: Set<Buffer> | null;

  verifyAuth(authKey: string, session: BaseSession): boolean;
  postPlay(session: BaseSession): string | null;
  donePlay(session: BaseSession): void;
  postPublish(session: BaseSession): string | null;
  donePublish(session: BaseSession): void;
  broadcastMessage(packet: AVPacket): void;
}

// ==================== Server Types ====================

/**
 * HTTP/HTTPS server component
 */
export class NodeHttpServer {
  httpServer?: HttpServer;
  httpsServer?: Http2SecureServer;
  wsServer?: WebSocket.Server;
  wssServer?: WebSocket.Server;

  run(): void;
  stop(callback?: () => void): void;
}

/**
 * RTMP/RTMPS server component
 */
export class NodeRtmpServer {
  tcpServer?: Server;
  tlsServer?: TlsServer;

  run(): void;
  stop(callback?: () => void): void;
}

/**
 * Record server component
 */
export class NodeRecordServer {
  run(): void;
}

/**
 * Notification server component
 */
export class NodeNotifyServer {
  run(): void;
  notify(action: string, session: BaseSession): void;
}

// ==================== Context Types ====================

/**
 * Global context object holding server state
 */
export interface NodeMediaContext {
  config: NodeMediaServerConfig;
  sessions: Map<string, BaseSession>;
  broadcasts: Map<string, BroadcastServer>;
  eventEmitter: EventEmitter;
}

// ==================== Logger Types ====================

/**
 * Log levels supported by the logger
 */
export type LogLevel = "trace" | "debug" | "info" | "warn" | "error";

/**
 * Logger interface for server logging
 */
export interface NodeMediaLogger {
  level: LogLevel;
  trace(message: string): void;
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  log(message: string, logLevel?: LogLevel): void;
}

// ==================== API Types ====================

/**
 * Standard API response format
 */
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

/**
 * Stream information returned by API
 */
export interface StreamInfo {
  path: string;
  app: string;
  name: string;
  publisher: SessionInfo | null;
  subscribers: SessionInfo[];
}

/**
 * Session information returned by API
 */
export interface SessionInfo {
  id: string;
  ip: string;
  protocol: string;
  streamPath: string;
  streamApp: string;
  streamName: string;
  isPublisher: boolean;
  createTime: number;
  endTime: number;
  videoCodec: number;
  videoWidth: number;
  videoHeight: number;
  videoFramerate: number;
  videoDatarate: number;
  audioCodec: number;
  audioChannels: number;
  audioSamplerate: number;
  audioDatarate: number;
  inBytes: number;
  outBytes: number;
}

/**
 * Server statistics
 */
export interface ServerStats {
  startedAt: number;
  uptime: number;
  sessionCount: number;
  streamCount: number;
  inBytes: number;
  outBytes: number;
}

/**
 * Server information
 */
export interface ServerInfo {
  version: string;
  description: string;
  homepage: string;
  license: string;
  author: string;
  nodeVersion: string;
  platform: string;
  stats: ServerStats;
}

/**
 * Login request payload
 */
export interface LoginRequest {
  username: string;
  password: string;
}

/**
 * Login response with JWT token
 */
export interface LoginResponse extends ApiResponse {
  token?: string;
  expiresIn?: string | number;
}

// ==================== Main Server Class ====================

/**
 * Node Media Server - A Node.js implementation of RTMP/HTTP-FLV streaming server
 *
 * @example
 * ```typescript
 * import NodeMediaServer, { NodeMediaServerConfig } from "node-media-server";
 *
 * const config: NodeMediaServerConfig = {
 *   rtmp: { port: 1935 },
 *   http: { port: 8000 },
 * };
 *
 * const nms = new NodeMediaServer(config);
 * nms.on("postPublish", (session) => {
 *   console.log(`Stream published: ${session.streamPath}`);
 * });
 * nms.run();
 * ```
 */
export default class NodeMediaServer {
  /**
   * Create a new NodeMediaServer instance
   * @param config - Server configuration object
   */
  constructor(config: NodeMediaServerConfig);

  /**
   * HTTP/HTTPS server component
   */
  httpServer: NodeHttpServer;

  /**
   * RTMP/RTMPS server component
   */
  rtmpServer: NodeRtmpServer;

  /**
   * Record server component
   */
  recordServer: NodeRecordServer;

  /**
   * Notification server component
   */
  notifyServer: NodeNotifyServer;

  /**
   * Register an event listener for server events
   *
   * @param eventName - The event name to listen for
   * @param listener - The callback function receiving the event payload
   *
   * @example
   * ```typescript
   * nms.on("postPublish", (session) => {
   *   console.log(`New stream: ${session.streamPath}`);
   * });
   *
   * nms.on("donePublish", (session) => {
   *   console.log(`Stream ended: ${session.streamPath}`);
   * });
   *
   * nms.on("serverError", ({ server, error }) => {
   *   console.error(`${server} error:`, error.message);
   * });
   * ```
   */
  on(eventName: "prePlay" | "postPlay" | "donePlay", listener: (session: BaseSession) => void): void;
  on(eventName: "prePublish" | "postPublish" | "donePublish", listener: (session: BaseSession) => void): void;
  on(eventName: "postRecord" | "doneRecord", listener: (session: RecordSession) => void): void;
  on(eventName: "serverError", listener: (event: ServerErrorEvent) => void): void;
  on(eventName: "sessionError", listener: (event: SessionErrorEvent) => void): void;

  /**
   * Start the media server and all configured components
   *
   * @example
   * ```typescript
   * nms.run();
   * console.log("Server started");
   * ```
   */
  run(): void;

  /**
   * Gracefully shutdown the server and release all resources
   *
   * @param callback - Optional callback invoked after shutdown completes
   *
   * @example
   * ```typescript
   * process.on("SIGINT", () => {
   *   nms.stop(() => {
   *     console.log("Server stopped");
   *     process.exit(0);
   *   });
   * });
   * ```
   */
  stop(callback?: () => void): void;
}

// ==================== Utility Exports ====================

/**
 * Global context object for accessing server state
 */
export const Context: NodeMediaContext;

/**
 * Logger instance for consistent logging
 */
export const logger: NodeMediaLogger;

/**
 * Package information
 */
export const Package: {
  name: string;
  version: string;
  description: string;
  homepage: string;
  license: string;
  author: string;
};
