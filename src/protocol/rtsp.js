// @ts-check
//
//  Created by Chen Mingliang on 25/04/24.
//  illuspas@msn.com
//  Copyright (c) 2025 NodeMedia. All rights reserved.
//

const net = require("net");
const tls = require("tls");
const crypto = require("crypto");
const logger = require("../core/logger.js");

/** RTSP parser states */
const RTSP_PARSE_IDLE = 0;
const RTSP_PARSE_RESPONSE_LINE = 1;
const RTSP_PARSE_RESPONSE_HEADERS = 2;
const RTSP_PARSE_RESPONSE_BODY = 3;
const RTSP_PARSE_INTERLEAVED = 4;

/** RTSP default port */
const RTSP_DEFAULT_PORT = 554;

/** TCP interleaved marker byte */
const RTSP_INTERLEAVED_MARKER = 0x24; // '$'

/** RTSP methods */
const RTSP_METHOD_OPTIONS = "OPTIONS";
const RTSP_METHOD_DESCRIBE = "DESCRIBE";
const RTSP_METHOD_SETUP = "SETUP";
const RTSP_METHOD_PLAY = "PLAY";
const RTSP_METHOD_PAUSE = "PAUSE";
const RTSP_METHOD_TEARDOWN = "TEARDOWN";
const RTSP_METHOD_GET_PARAMETER = "GET_PARAMETER";

/**
 * @typedef {object} RtspResponse
 * @property {number} statusCode - HTTP-style status code (e.g. 200, 401, 461)
 * @property {string} reasonPhrase - Status reason text (e.g. "OK", "Unauthorized")
 * @property {{[key: string]: string}} headers - Response headers as key-value map
 * @property {Buffer} body - Response body (e.g. SDP content)
 */

/**
 * @typedef {object} RtspAuthParams
 * @property {string} type - "basic" | "digest"
 * @property {string} [realm] - Digest auth realm
 * @property {string} [nonce] - Digest auth nonce
 * @property {string} [opaque] - Digest auth opaque
 * @property {string} [qop] - Digest auth quality of protection
 * @property {string} [algorithm] - Digest auth algorithm (MD5 default)
 * @property {boolean} [stale] - Whether nonce is stale
 */

/**
 * @typedef {object} RtspPendingRequest
 * @property {string} method - RTSP method name
 * @property {string} uri - Full RTSP URI
 * @property {{[key: string]: string}} headers - Original request headers
 * @property {function(RtspResponse): void} resolve - Promise resolve
 * @property {function(Error): void} reject - Promise reject
 * @property {boolean} retryOn401 - Whether to retry on 401 with credentials
 */

/**
 * RTSP Client protocol implementation.
 * Handles RTSP signaling, TCP interleaved transport, and authentication.
 * @class
 */
class RtspClient {
  constructor() {
    /** @type {net.Socket|null} */
    this.socket = null;
    this.connected = false;
    this.useTLS = false;

    // RTSP session state
    /** @type {number} */
    this.cSeq = 0;
    /** @type {string} */
    this.sessionId = "";
    /** @type {string} */
    this.baseUri = "";
    /** @type {string} */
    this.username = "";
    /** @type {string} */
    this.password = "";

    // Authentication
    /** @type {RtspAuthParams|null} */
    this.authParams = null;

    // TCP interleaved channel tracking
    /** @type {number} */
    this.nextChannel = 0;
    /** @type {Map<number, {rtpPort: number, rtcpPort: number}>} */
    this.channelMap = new Map();

    // Buffer management for stream parsing
    this.parseState = RTSP_PARSE_IDLE;
    /** @type {Buffer} */
    this.recvBuffer = Buffer.alloc(0);

    // Response parsing state
    /** @type {number} */
    this.responseStatusCode = 0;
    /** @type {string} */
    this.responseReasonPhrase = "";
    /** @type {{[key: string]: string}} */
    this.responseHeaders = {};
    /** @type {number} */
    this.responseContentLength = 0;
    /** @type {Buffer} */
    this.responseBody = Buffer.alloc(0);
    /** @type {string} */
    this.responseLineBuffer = "";

    // Interleaved parsing state
    /** @type {number} */
    this.interleavedChannel = 0;
    /** @type {number} */
    this.interleavedLength = 0;
    /** @type {Buffer} */
    this.interleavedData = Buffer.alloc(0);

    // Pending request tracking (CSeq -> pending info)
    /** @type {Map<number, RtspPendingRequest>} */
    this.pendingRequests = new Map();

    // Heartbeat / keep-alive
    /** @type {ReturnType<typeof setInterval>|null} */
    this.heartbeatTimer = null;
    /** @type {number} */
    this.heartbeatInterval = 30000; // 30 seconds

    // Reconnection
    /** @type {number} */
    this.lastActivityTime = 0;
    /** @type {number} */
    this.timeoutMs = 60000; // 60 seconds RTP timeout

    // Callbacks
    /**
     * Called when interleaved RTP/RTCP data is received
     * @param {number} channel - The interleaved channel number
     * @param {Buffer} data - The raw RTP/RTCP data
     */
    this.onRtpDataCallback = (channel, data) => {};

    /**
     * Called when the connection is closed
     * @param {boolean} hadError - Whether the close was due to an error
     */
    this.onCloseCallback = (hadError) => {};

    /**
     * Called on connection error
     * @param {Error} error - The error object
     */
    this.onErrorCallback = (error) => {};
  }

  // ─────────────────────────────────────────
  // Connection Management
  // ─────────────────────────────────────────

  /**
   * Connect to RTSP server
   * @param {string} rtspUrl - Full RTSP URL (rtsp:// or rtsp://user:pass@host:port/path)
   * @returns {Promise<void>}
   */
  connect = (rtspUrl) => {
    return new Promise((resolve, reject) => {
      try {
        const url = new URL(rtspUrl);
        this.baseUri = rtspUrl;
        this.useTLS = url.protocol === "rtsps:";
        const host = url.hostname;
        const port = parseInt(url.port) || RTSP_DEFAULT_PORT;
        this.username = decodeURIComponent(url.username || "");
        this.password = decodeURIComponent(url.password || "");

        // Reset state
        this.cSeq = 0;
        this.sessionId = "";
        this.authParams = null;
        this.parseState = RTSP_PARSE_IDLE;
        this.recvBuffer = Buffer.alloc(0);
        this.pendingRequests.clear();
        this.lastActivityTime = Date.now();

        const connectOptions = {
          host: host,
          port: port,
          // Allow self-signed certs for IPC cameras
          rejectUnauthorized: false
        };

        const onConnect = () => {
          this.connected = true;
          logger.info(`RTSP client connected to ${host}:${port}`);
          resolve();
        };

        const onError = (err) => {
          this.connected = false;
          logger.error(`RTSP client connection error: ${err.message}`);
          reject(err);
        };

        if (this.useTLS) {
          this.socket = tls.connect(connectOptions, onConnect);
        } else {
          this.socket = net.createConnection(connectOptions, onConnect);
        }

        this.socket.on("data", this.handleData);
        this.socket.on("close", (hadError) => {
          this.connected = false;
          this.stopHeartbeat();
          this.rejectAllPending(new Error("Connection closed"));
          this.onCloseCallback(hadError);
        });
        this.socket.on("error", (err) => {
          this.connected = false;
          logger.error(`RTSP client socket error: ${err.message}`);
          this.onErrorCallback(err);
          // Only reject if we haven't connected yet
          if (!this.connected) {
            onError(err);
          }
        });
      } catch (err) {
        reject(err);
      }
    });
  };

  /**
   * Disconnect from RTSP server and clean up
   */
  disconnect = () => {
    this.stopHeartbeat();
    this.rejectAllPending(new Error("Disconnecting"));
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    this.connected = false;
    this.recvBuffer = Buffer.alloc(0);
    this.parseState = RTSP_PARSE_IDLE;
  };

  // ─────────────────────────────────────────
  // RTSP Methods
  // ─────────────────────────────────────────

  /**
   * Send OPTIONS request
   * @param {string} [uri] - RTSP URI (defaults to baseUri)
   * @returns {Promise<RtspResponse>}
   */
  options = (uri) => {
    return this.sendRequest(RTSP_METHOD_OPTIONS, uri || this.baseUri);
  };

  /**
   * Send DESCRIBE request to get SDP
   * @param {string} [uri] - RTSP URI (defaults to baseUri)
   * @returns {Promise<RtspResponse>}
   */
  describe = (uri) => {
    const targetUri = uri || this.baseUri;
    return this.sendRequest(
      RTSP_METHOD_DESCRIBE,
      targetUri,
      { "Accept": "application/sdp" },
      null,
      true // retry on 401
    );
  };

  /**
   * Send SETUP request to configure transport
   * @param {string} trackUri - Full track URI from SDP control attribute
   * @param {string} transport - Transport header value (e.g. "RTP/AVP/TCP;unicast;interleaved=0-1")
   * @returns {Promise<RtspResponse>}
   */
  setup = (trackUri, transport) => {
    const headers = { "Transport": transport };
    return this.sendRequest(RTSP_METHOD_SETUP, trackUri, headers, null, true);
  };

  /**
   * Send PLAY request
   * @param {string} [uri] - RTSP URI (defaults to baseUri)
   * @param {string} [range] - Range header (e.g. "npt=0.000-")
   * @returns {Promise<RtspResponse>}
   */
  play = (uri, range) => {
    const headers = {};
    if (range) {
      headers["Range"] = range;
    }
    return this.sendRequest(RTSP_METHOD_PLAY, uri || this.baseUri, headers);
  };

  /**
   * Send PAUSE request
   * @param {string} [uri] - RTSP URI (defaults to baseUri)
   * @returns {Promise<RtspResponse>}
   */
  pause = (uri) => {
    return this.sendRequest(RTSP_METHOD_PAUSE, uri || this.baseUri);
  };

  /**
   * Send TEARDOWN request
   * @param {string} [uri] - RTSP URI (defaults to baseUri)
   * @returns {Promise<RtspResponse>}
   */
  teardown = (uri) => {
    return this.sendRequest(RTSP_METHOD_TEARDOWN, uri || this.baseUri);
  };

  /**
   * Send GET_PARAMETER request (keep-alive / probe)
   * @param {string} [uri] - RTSP URI (defaults to baseUri)
   * @returns {Promise<RtspResponse>}
   */
  getParameter = (uri) => {
    return this.sendRequest(RTSP_METHOD_GET_PARAMETER, uri || this.baseUri);
  };

  // ─────────────────────────────────────────
  // Request Building
  // ─────────────────────────────────────────

  /**
   * Send an RTSP request and return a promise for the response.
   * Automatically adds CSeq, Session (if set), and Authorization (if credentials available).
   * @param {string} method - RTSP method
   * @param {string} uri - Full request URI
   * @param {{[key: string]: string}} [extraHeaders] - Additional headers
   * @param {Buffer|string|null} [body] - Request body
   * @param {boolean} [retryOn401] - Whether to retry with auth on 401
   * @returns {Promise<RtspResponse>}
   */
  sendRequest = (method, uri, extraHeaders, body, retryOn401 = false) => {
    return new Promise((resolve, reject) => {
      if (!this.connected || !this.socket) {
        reject(new Error("Not connected"));
        return;
      }

      const cSeq = ++this.cSeq;

      // Build headers
      /** @type {{[key: string]: string}} */
      const headers = {
        "CSeq": String(cSeq),
        "User-Agent": "NodeMediaServer RTSP Client"
      };

      // Add Session header if established
      if (this.sessionId) {
        headers["Session"] = this.sessionId;
      }

      // Add Authorization header if we have auth params
      const authHeader = this.buildAuthorizationHeader(method, uri);
      if (authHeader) {
        headers["Authorization"] = authHeader;
      }

      // Merge extra headers
      if (extraHeaders) {
        Object.assign(headers, extraHeaders);
      }

      // Handle body and Content-Length
      let bodyBuf = null;
      if (body) {
        bodyBuf = Buffer.isBuffer(body) ? body : Buffer.from(body);
        headers["Content-Length"] = String(bodyBuf.length);
      }

      // Store pending request
      /** @type {RtspPendingRequest} */
      const pending = {
        method,
        uri,
        headers: { ...headers },
        resolve,
        reject,
        retryOn401
      };
      this.pendingRequests.set(cSeq, pending);

      // Build and send request
      const requestStr = this.buildRequestString(method, uri, headers);
      const requestBuf = bodyBuf
        ? Buffer.concat([Buffer.from(requestStr), bodyBuf])
        : Buffer.from(requestStr);

      logger.debug(`RTSP >> ${method} ${uri} CSeq=${cSeq}`);
      this.socket.write(requestBuf);
      this.lastActivityTime = Date.now();
    });
  };

  /**
   * Build a raw RTSP request string
   * @param {string} method - RTSP method
   * @param {string} uri - Request URI
   * @param {{[key: string]: string}} headers - Headers map
   * @returns {string} Complete RTSP request string with \r\n terminators
   */
  buildRequestString = (method, uri, headers) => {
    let lines = [];
    lines.push(`${method} ${uri} RTSP/1.0`);
    for (const [key, value] of Object.entries(headers)) {
      lines.push(`${key}: ${value}`);
    }
    lines.push("");
    lines.push("");
    return lines.join("\r\n");
  };

  // ─────────────────────────────────────────
  // Response Parsing
  // ─────────────────────────────────────────

  /**
   * Handle incoming data from socket — dispatches to RTSP response parser or interleaved RTP handler
   * @param {Buffer} data - Incoming data chunk
   */
  handleData = (data) => {
    this.lastActivityTime = Date.now();

    // Append to buffer
    this.recvBuffer = Buffer.concat([this.recvBuffer, data]);

    // Process buffer
    let keepParsing = true;
    while (keepParsing && this.recvBuffer.length > 0) {
      switch (this.parseState) {
      case RTSP_PARSE_IDLE:
        keepParsing = this.parseIdle();
        break;
      case RTSP_PARSE_RESPONSE_HEADERS:
        keepParsing = this.parseResponseHeaders();
        break;
      case RTSP_PARSE_RESPONSE_BODY:
        keepParsing = this.parseResponseBody();
        break;
      case RTSP_PARSE_INTERLEAVED:
        keepParsing = this.parseInterleaved();
        break;
      default:
        keepParsing = false;
        break;
      }
    }
  };

  /**
   * Parse idle state — determine if next data is RTSP response or interleaved RTP
   * @returns {boolean} Whether to continue parsing
   */
  parseIdle = () => {
    if (this.recvBuffer.length === 0) {
      return false;
    }

    const firstByte = this.recvBuffer[0];

    // Check for TCP interleaved RTP data ($ marker)
    if (firstByte === RTSP_INTERLEAVED_MARKER) {
      if (this.recvBuffer.length < 4) {
        return false; // Need more data for interleaved header
      }
      this.interleavedChannel = this.recvBuffer[1];
      this.interleavedLength = this.recvBuffer.readUInt16BE(2);
      this.interleavedData = Buffer.alloc(0);
      this.recvBuffer = this.recvBuffer.subarray(4);
      this.parseState = RTSP_PARSE_INTERLEAVED;
      logger.trace(`RTSP interleaved start: channel=${this.interleavedChannel} length=${this.interleavedLength}`);
      return true;
    }

    // Otherwise it's an RTSP response — look for header terminator
    this.parseState = RTSP_PARSE_RESPONSE_HEADERS;
    this.responseHeaders = {};
    this.responseBody = Buffer.alloc(0);
    this.responseContentLength = 0;
    this.responseStatusCode = 0;
    this.responseReasonPhrase = "";
    return true;
  };

  /**
   * Parse RTSP response headers
   * @returns {boolean} Whether to continue parsing
   */
  parseResponseHeaders = () => {
    // Find the header/body boundary (\r\n\r\n)
    const headerEnd = this.findHeaderEnd(this.recvBuffer);
    if (headerEnd === -1) {
      return false; // Need more data
    }

    // Extract header block
    const headerBlock = this.recvBuffer.subarray(0, headerEnd).toString("utf8");
    this.recvBuffer = this.recvBuffer.subarray(headerEnd + 4); // Skip \r\n\r\n

    // Parse header block
    const lines = headerBlock.split("\r\n");
    if (lines.length === 0) {
      logger.error("RTSP response: empty header block");
      this.parseState = RTSP_PARSE_IDLE;
      return true;
    }

    // Parse status line: RTSP/1.0 <code> <reason>
    const statusLine = lines[0];
    const statusMatch = statusLine.match(/^RTSP\/1\.0\s+(\d+)\s+(.*)$/);
    if (!statusMatch) {
      logger.error(`RTSP response: invalid status line: ${statusLine}`);
      this.parseState = RTSP_PARSE_IDLE;
      return true;
    }
    this.responseStatusCode = parseInt(statusMatch[1]);
    this.responseReasonPhrase = statusMatch[2];

    // Parse headers
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const colonIdx = line.indexOf(":");
      if (colonIdx > 0) {
        const key = line.substring(0, colonIdx).trim();
        const value = line.substring(colonIdx + 1).trim();
        this.responseHeaders[key] = value;
      }
    }

    logger.debug(`RTSP << ${this.responseStatusCode} ${this.responseReasonPhrase}`);

    // Determine body handling
    const contentLengthStr = this.responseHeaders["Content-Length"];
    this.responseContentLength = contentLengthStr ? parseInt(contentLengthStr) : 0;

    if (this.responseContentLength > 0) {
      this.responseBody = Buffer.alloc(0);
      this.parseState = RTSP_PARSE_RESPONSE_BODY;
      return true;
    } else {
      // No body — dispatch response immediately
      this.dispatchResponse();
      this.parseState = RTSP_PARSE_IDLE;
      return true;
    }
  };

  /**
   * Parse RTSP response body based on Content-Length
   * @returns {boolean} Whether to continue parsing
   */
  parseResponseBody = () => {
    const needed = this.responseContentLength - this.responseBody.length;
    if (needed <= 0) {
      this.dispatchResponse();
      this.parseState = RTSP_PARSE_IDLE;
      return true;
    }

    const available = Math.min(needed, this.recvBuffer.length);
    this.responseBody = Buffer.concat([
      this.responseBody,
      this.recvBuffer.subarray(0, available)
    ]);
    this.recvBuffer = this.recvBuffer.subarray(available);

    if (this.responseBody.length >= this.responseContentLength) {
      this.dispatchResponse();
      this.parseState = RTSP_PARSE_IDLE;
      return true;
    }

    return false; // Need more data
  };

  /**
   * Parse TCP interleaved RTP data
   * @returns {boolean} Whether to continue parsing
   */
  parseInterleaved = () => {
    const needed = this.interleavedLength - this.interleavedData.length;
    if (needed <= 0) {
      this.onRtpDataCallback(this.interleavedChannel, this.interleavedData);
      this.parseState = RTSP_PARSE_IDLE;
      return true;
    }

    const available = Math.min(needed, this.recvBuffer.length);
    this.interleavedData = Buffer.concat([
      this.interleavedData,
      this.recvBuffer.subarray(0, available)
    ]);
    this.recvBuffer = this.recvBuffer.subarray(available);

    if (this.interleavedData.length >= this.interleavedLength) {
      this.onRtpDataCallback(this.interleavedChannel, this.interleavedData);
      this.parseState = RTSP_PARSE_IDLE;
      return true;
    }

    return false; // Need more data
  };

  /**
   * Find the end of RTSP headers (\r\n\r\n sequence) in buffer
   * @param {Buffer} buf - Buffer to search
   * @returns {number} Index of the start of \r\n\r\n, or -1 if not found
   */
  findHeaderEnd = (buf) => {
    for (let i = 0; i < buf.length - 3; i++) {
      if (buf[i] === 0x0d && buf[i + 1] === 0x0a && buf[i + 2] === 0x0d && buf[i + 3] === 0x0a) {
        return i;
      }
    }
    return -1;
  };

  /**
   * Dispatch a fully parsed RTSP response to the matching pending request
   */
  dispatchResponse = () => {
    const cSeqStr = this.responseHeaders["CSeq"];
    if (!cSeqStr) {
      logger.warn("RTSP response missing CSeq header");
      return;
    }

    const cSeq = parseInt(cSeqStr);
    const pending = this.pendingRequests.get(cSeq);
    if (!pending) {
      logger.warn(`RTSP response with unknown CSeq=${cSeq}`);
      return;
    }
    this.pendingRequests.delete(cSeq);

    // Auto-capture Session ID
    const sessionHeader = this.responseHeaders["Session"];
    if (sessionHeader) {
      // Session header may include timeout: "session-id;timeout=60"
      this.sessionId = sessionHeader.split(";")[0].trim();
    }

    /** @type {RtspResponse} */
    const response = {
      statusCode: this.responseStatusCode,
      reasonPhrase: this.responseReasonPhrase,
      headers: { ...this.responseHeaders },
      body: this.responseBody
    };

    // Handle 401 Unauthorized — retry with credentials
    if (this.responseStatusCode === 401 && pending.retryOn401 && this.username) {
      const wwwAuth = this.responseHeaders["WWW-Authenticate"];
      if (wwwAuth) {
        this.handleAuthChallenge(wwwAuth, pending);
        return;
      }
    }

    pending.resolve(response);
  };

  // ─────────────────────────────────────────
  // Authentication
  // ─────────────────────────────────────────

  /**
   * Handle 401 WWW-Authenticate challenge
   * @param {string} wwwAuth - WWW-Authenticate header value
   * @param {RtspPendingRequest} pending - The original pending request to retry
   */
  handleAuthChallenge = (wwwAuth, pending) => {
    this.authParams = this.parseWwwAuthenticate(wwwAuth);

    if (!this.authParams) {
      pending.reject(new Error(`Unsupported auth scheme: ${wwwAuth}`));
      return;
    }

    logger.debug(`RTSP auth challenge: ${this.authParams.type} realm=${this.authParams.realm || ""}`);

    // Re-send the same request with auth
    const retryRequest = () => {
      const cSeq = ++this.cSeq;

      /** @type {{[key: string]: string}} */
      const headers = {
        "CSeq": String(cSeq),
        "User-Agent": "NodeMediaServer RTSP Client"
      };

      if (this.sessionId) {
        headers["Session"] = this.sessionId;
      }

      const authHeader = this.buildAuthorizationHeader(pending.method, pending.uri);
      if (authHeader) {
        headers["Authorization"] = authHeader;
      }

      // Copy original extra headers (excluding CSeq, User-Agent, Session, Authorization)
      for (const [key, value] of Object.entries(pending.headers)) {
        const lower = key.toLowerCase();
        if (lower !== "cseq" && lower !== "user-agent" && lower !== "session" && lower !== "authorization") {
          headers[key] = value;
        }
      }

      /** @type {RtspPendingRequest} */
      const retryPending = {
        method: pending.method,
        uri: pending.uri,
        headers: { ...headers },
        resolve: pending.resolve,
        reject: pending.reject,
        retryOn401: false // Don't retry again
      };
      this.pendingRequests.set(cSeq, retryPending);

      const requestStr = this.buildRequestString(pending.method, pending.uri, headers);
      logger.debug(`RTSP >> ${pending.method} ${pending.uri} CSeq=${cSeq} (auth retry)`);
      this.socket.write(Buffer.from(requestStr));
      this.lastActivityTime = Date.now();
    };

    retryRequest();
  };

  /**
   * Parse WWW-Authenticate header into auth params
   * @param {string} header - WWW-Authenticate header value
   * @returns {RtspAuthParams|null}
   */
  parseWwwAuthenticate = (header) => {
    const lower = header.trim().toLowerCase();

    if (lower.startsWith("basic")) {
      // Basic realm="xxx"
      return { type: "basic" };
    }

    if (lower.startsWith("digest")) {
      /** @type {RtspAuthParams} */
      const params = { type: "digest" };

      // Extract key=value pairs, handling quoted values
      const regex = /(\w+)=(?:"([^"]*)"|([\w/+=]+))/g;
      let match;
      while ((match = regex.exec(header)) !== null) {
        const key = match[1];
        const value = match[2] || match[3];
        switch (key.toLowerCase()) {
        case "realm":
          params.realm = value;
          break;
        case "nonce":
          params.nonce = value;
          break;
        case "opaque":
          params.opaque = value;
          break;
        case "qop":
          params.qop = value;
          break;
        case "algorithm":
          params.algorithm = value;
          break;
        case "stale":
          params.stale = value.toLowerCase() === "true";
          break;
        default:
          break;
        }
      }

      if (!params.realm || !params.nonce) {
        logger.warn("RTSP Digest auth missing realm or nonce");
        return null;
      }

      return params;
    }

    logger.warn(`RTSP unsupported auth scheme: ${header}`);
    return null;
  };

  /**
   * Build Authorization header value based on current auth params
   * @param {string} method - RTSP method
   * @param {string} uri - Request URI
   * @returns {string|null} Authorization header value, or null if no auth
   */
  buildAuthorizationHeader = (method, uri) => {
    if (!this.authParams || !this.username) {
      return null;
    }

    if (this.authParams.type === "basic") {
      return this.buildBasicAuth();
    }

    if (this.authParams.type === "digest") {
      return this.buildDigestAuth(method, uri);
    }

    return null;
  };

  /**
   * Build Basic auth header value
   * @returns {string}
   */
  buildBasicAuth = () => {
    const credentials = Buffer.from(`${this.username}:${this.password}`).toString("base64");
    return `Basic ${credentials}`;
  };

  /**
   * Build Digest auth header value (RFC 2617)
   * @param {string} method - RTSP method
   * @param {string} uri - Request URI
   * @returns {string}
   */
  buildDigestAuth = (method, uri) => {
    const params = this.authParams;
    const algorithm = (params.algorithm || "MD5").toUpperCase();
    const hashAlg = algorithm === "MD5-SESS" ? "md5" : "md5";

    /**
     * @param {string} data
     * @returns {string}
     */
    const md5Hex = (data) => crypto.createHash(hashAlg).update(data).digest("hex");

    // HA1 = MD5(username:realm:password) or MD5-sess variant
    let ha1 = md5Hex(`${this.username}:${params.realm}:${this.password}`);
    if (algorithm === "MD5-SESS") {
      ha1 = md5Hex(`${ha1}:${params.nonce}:nodeMediaCnonce`);
    }

    // HA2 = MD5(method:uri)
    const ha2 = md5Hex(`${method}:${uri}`);

    // Response digest
    let response;
    if (params.qop) {
      // With QOP: MD5(HA1:nonce:nc:cnonce:qop:HA2)
      const nc = "00000001";
      const cnonce = "nodeMediaCnonce";
      // Prefer "auth" qop over "auth-int"
      const qop = params.qop.includes("auth") ? "auth" : params.qop;
      response = md5Hex(`${ha1}:${params.nonce}:${nc}:${cnonce}:${qop}:${ha2}`);

      let header = `Digest username="${this.username}", realm="${params.realm}", nonce="${params.nonce}", uri="${uri}", response="${response}"`;
      header += `, qop=${qop}, nc=${nc}, cnonce="${cnonce}"`;
      if (params.algorithm && params.algorithm.toUpperCase() !== "MD5") {
        header += `, algorithm=${params.algorithm}`;
      }
      if (params.opaque) {
        header += `, opaque="${params.opaque}"`;
      }
      return header;
    } else {
      // Without QOP: MD5(HA1:nonce:HA2)
      response = md5Hex(`${ha1}:${params.nonce}:${ha2}`);

      let header = `Digest username="${this.username}", realm="${params.realm}", nonce="${params.nonce}", uri="${uri}", response="${response}"`;
      if (params.opaque) {
        header += `, opaque="${params.opaque}"`;
      }
      return header;
    }
  };

  // ─────────────────────────────────────────
  // Transport Header Helpers
  // ─────────────────────────────────────────

  /**
   * Build Transport header for TCP interleaved mode
   * @param {number} rtpChannel - RTP channel number
   * @param {number} rtcpChannel - RTCP channel number
   * @returns {string} Transport header value
   */
  static buildTCPInterleavedTransport = (rtpChannel, rtcpChannel) => {
    return `RTP/AVP/TCP;unicast;interleaved=${rtpChannel}-${rtcpChannel}`;
  };

  /**
   * Build Transport header for UDP unicast mode
   * @param {number} rtpPort - Client RTP port
   * @param {number} rtcpPort - Client RTCP port
   * @returns {string} Transport header value
   */
  static buildUDPTransport = (rtpPort, rtcpPort) => {
    return `RTP/AVP;unicast;client_port=${rtpPort}-${rtcpPort}`;
  };

  /**
   * Parse Transport response header to extract server-assigned values
   * @param {string} transportHeader - Transport header from SETUP response
   * @returns {{[key: string]: string}} Parsed transport parameters
   */
  static parseTransportHeader = (transportHeader) => {
    /** @type {{[key: string]: string}} */
    const params = {};
    if (!transportHeader) {
      return params;
    }

    const parts = transportHeader.split(";");
    for (const part of parts) {
      const eqIdx = part.indexOf("=");
      if (eqIdx > 0) {
        const key = part.substring(0, eqIdx).trim();
        const value = part.substring(eqIdx + 1).trim();
        params[key] = value;
      } else {
        params["protocol"] = part.trim();
      }
    }
    return params;
  };

  /**
   * Allocate next available interleaved channel pair
   * @returns {{rtpChannel: number, rtcpChannel: number}}
   */
  allocateChannel = () => {
    const rtpChannel = this.nextChannel;
    const rtcpChannel = this.nextChannel + 1;
    this.nextChannel += 2;
    return { rtpChannel, rtcpChannel };
  };

  // ─────────────────────────────────────────
  // Heartbeat / Keep-Alive
  // ─────────────────────────────────────────

  /**
   * Start periodic GET_PARAMETER heartbeat to keep session alive
   */
  startHeartbeat = () => {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.connected) {
        this.getParameter().catch((err) => {
          logger.warn(`RTSP heartbeat failed: ${err.message}`);
        });
      }
    }, this.heartbeatInterval);
    logger.debug(`RTSP heartbeat started (interval=${this.heartbeatInterval}ms)`);
  };

  /**
   * Stop heartbeat timer
   */
  stopHeartbeat = () => {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  };

  // ─────────────────────────────────────────
  // Timeout Detection
  // ─────────────────────────────────────────

  /**
   * Check if RTP timeout has occurred
   * @returns {boolean} True if timeout exceeded
   */
  isTimedOut = () => {
    return (Date.now() - this.lastActivityTime) > this.timeoutMs;
  };

  // ─────────────────────────────────────────
  // Utility
  // ─────────────────────────────────────────

  /**
   * Reject all pending requests (used on disconnect)
   * @param {Error} error - Error to reject with
   */
  rejectAllPending = (error) => {
    for (const [cSeq, pending] of this.pendingRequests) {
      pending.reject(error);
    }
    this.pendingRequests.clear();
  };

  /**
   * Build full track URL from SDP control attribute
   * @param {string} baseUrl - Base RTSP URL
   * @param {string} control - Control attribute from SDP (trackID=1 or full URL)
   * @returns {string} Full track URL
   */
  static buildTrackUrl = (baseUrl, control) => {
    if (!control || control === "*") {
      return baseUrl;
    }
    // If control is a full URL, use it directly
    if (control.startsWith("rtsp://") || control.startsWith("rtsps://")) {
      return control;
    }
    // Otherwise append to base URL
    const separator = baseUrl.endsWith("/") ? "" : "/";
    return baseUrl + separator + control;
  };

  /**
   * Parse RTSP URL into components
   * @param {string} rtspUrl - Full RTSP URL
   * @returns {{protocol: string, host: string, port: number, path: string, username: string, password: string}}
   */
  static parseUrl = (rtspUrl) => {
    const url = new URL(rtspUrl);
    return {
      protocol: url.protocol,
      host: url.hostname,
      port: parseInt(url.port) || RTSP_DEFAULT_PORT,
      path: url.pathname + url.search,
      username: decodeURIComponent(url.username || ""),
      password: decodeURIComponent(url.password || "")
    };
  };
}

module.exports = RtspClient;
