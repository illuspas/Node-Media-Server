// @ts-check
//
//  Created by Chen Mingliang on 25/04/24.
//  illuspas@msn.com
//  Copyright (c) 2025 NodeMedia. All rights reserved.
//

const logger = require("../core/logger.js");

/**
 * SDP Session Description Parser (RFC 4566).
 * Parses SDP text into a structured object with session and media descriptions.
 * @class
 */
class SdpParser {
  /**
   * Parse an SDP string into a structured object.
   * @param {string|Buffer} sdp - Raw SDP content (from DESCRIBE response body)
   * @returns {SdpSession|null} Parsed SDP session object, or null on failure
   */
  static parse = (sdp) => {
    const text = Buffer.isBuffer(sdp) ? sdp.toString("utf8") : sdp;
    if (!text || text.trim().length === 0) {
      logger.warn("SDP: empty input");
      return null;
    }

    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);

    if (lines.length === 0) {
      logger.warn("SDP: no valid lines");
      return null;
    }

    /** @type {SdpSession} */
    const session = {
      version: 0,
      origin: "",
      name: "",
      info: "",
      uri: "",
      email: "",
      phone: "",
      connection: { address: "", ttl: 0, addressType: "IP4" },
      bandwidth: [],
      timing: { start: 0, stop: 0 },
      attributes: {},
      media: []
    };

    /** @type {SdpMedia|null} */
    let currentMedia = null;

    for (const line of lines) {
      const type = line[0];
      const value = line.substring(2);

      // When we hit m= line, switch to media-level parsing
      if (type === "m") {
        currentMedia = SdpParser.parseMediaLine(value);
        if (currentMedia) {
          session.media.push(currentMedia);
        }
        continue;
      }

      // If inside a media block, attributes belong to media
      if (currentMedia) {
        SdpParser.parseMediaLevelLine(type, value, currentMedia);
      } else {
        SdpParser.parseSessionLevelLine(type, value, session);
      }
    }

    // Post-process: resolve codec info from rtpmap/fmtp
    for (const media of session.media) {
      SdpParser.resolveMediaCodec(media);
    }

    logger.debug(`SDP parsed: ${session.media.length} media track(s)`);
    return session;
  };

  // ─────────────────────────────────────────
  // Session-Level Parsing
  // ─────────────────────────────────────────

  /**
   * Parse a session-level SDP line
   * @param {string} type - Single character line type (v/o/s/i/u/e/p/c/b/t/a)
   * @param {string} value - Line value after "x="
   * @param {SdpSession} session - Session object to populate
   */
  static parseSessionLevelLine = (type, value, session) => {
    switch (type) {
    case "v":
      session.version = parseInt(value) || 0;
      break;
    case "o":
      session.origin = value;
      break;
    case "s":
      session.name = value;
      break;
    case "i":
      session.info = value;
      break;
    case "u":
      session.uri = value;
      break;
    case "e":
      session.email = value;
      break;
    case "p":
      session.phone = value;
      break;
    case "c":
      session.connection = SdpParser.parseConnection(value);
      break;
    case "b":
      session.bandwidth.push(SdpParser.parseBandwidth(value));
      break;
    case "t":
      session.timing = SdpParser.parseTiming(value);
      break;
    case "a":
      SdpParser.parseAttribute(value, session.attributes);
      break;
    default:
      break;
    }
  };

  // ─────────────────────────────────────────
  // Media-Level Parsing
  // ─────────────────────────────────────────

  /**
   * Parse m= line: `m=<type> <port> <proto> <fmt> ...`
   * @param {string} value - The value part of m= line
   * @returns {SdpMedia|null}
   */
  static parseMediaLine = (value) => {
    const parts = value.split(/\s+/);
    if (parts.length < 4) {
      logger.warn(`SDP: invalid m= line: ${value}`);
      return null;
    }

    const type = parts[0].toLowerCase();
    const port = parseInt(parts[1]) || 0;
    const protocol = parts[2];
    // Payload types: may be a single number or a list
    const payloadTypes = parts.slice(3).map((p) => parseInt(p)).filter((n) => !isNaN(n));

    /** @type {SdpMedia} */
    const media = {
      type: type,
      port: port,
      protocol: protocol,
      payloadTypes: payloadTypes,
      payloadType: payloadTypes[0] || 0,
      connection: null,
      bandwidth: [],
      attributes: {},
      // Resolved codec info
      codec: "",
      clockRate: 0,
      encodingParams: 0,
      channels: 0,
      fmtp: {},
      trackId: "",
      control: "",
      direction: "sendrecv"
    };
    return media;
  };

  /**
   * Parse a media-level SDP line
   * @param {string} type - Single character line type
   * @param {string} value - Line value after "x="
   * @param {SdpMedia} media - Media object to populate
   */
  static parseMediaLevelLine = (type, value, media) => {
    switch (type) {
    case "c":
      media.connection = SdpParser.parseConnection(value);
      break;
    case "b":
      media.bandwidth.push(SdpParser.parseBandwidth(value));
      break;
    case "a":
      SdpParser.parseMediaAttribute(value, media);
      break;
    default:
      break;
    }
  };

  // ─────────────────────────────────────────
  // Attribute Parsing
  // ─────────────────────────────────────────

  /**
   * Parse a= line into key-value attribute
   * @param {string} value - The value part of a= line
   * @param {{[key: string]: string}} attributes - Attributes map to populate
   */
  static parseAttribute = (value, attributes) => {
    const colonIdx = value.indexOf(":");
    if (colonIdx > 0) {
      const key = value.substring(0, colonIdx);
      const val = value.substring(colonIdx + 1);
      attributes[key] = val;
    } else {
      // Flag attribute (e.g. recvonly, sendonly)
      attributes[value] = "";
    }
  };

  /**
   * Parse media-specific a= line
   * @param {string} value - The value part of a= line
   * @param {SdpMedia} media - Media object to populate
   */
  static parseMediaAttribute = (value, media) => {
    const colonIdx = value.indexOf(":");

    if (colonIdx < 0) {
      // Flag attributes: recvonly, sendonly, sendrecv, inactive
      switch (value) {
      case "recvonly":
        media.direction = "recvonly";
        break;
      case "sendonly":
        media.direction = "sendonly";
        break;
      case "sendrecv":
        media.direction = "sendrecv";
        break;
      case "inactive":
        media.direction = "inactive";
        break;
      default:
        media.attributes[value] = "";
        break;
      }
      return;
    }

    const key = value.substring(0, colonIdx);
    const val = value.substring(colonIdx + 1);

    switch (key) {
    case "rtpmap":
      SdpParser.parseRtpmap(val, media);
      break;
    case "fmtp":
      SdpParser.parseFmtp(val, media);
      break;
    case "control":
      media.control = val;
      SdpParser.extractTrackId(val, media);
      break;
    default:
      media.attributes[key] = val;
      break;
    }
  };

  /**
   * Extract trackID from control URL and set on media object.
   * @param {string} controlUrl - Control URL or path
   * @param {SdpMedia} media - Media object to update
   */
  static extractTrackId = (controlUrl, media) => {
    const trackMatch = controlUrl.match(/trackID=(\d+)/i);
    if (trackMatch) {
      media.trackId = `trackID=${trackMatch[1]}`;
    }
  };

  /**
   * Parse a=rtpmap value: `<pt> <codec>/<clockRate>[/<encodingParams>]`
   * Example: "96 H264/90000", "97 MPEG4-GENERIC/48000/2"
   * @param {string} value - rtpmap attribute value
   * @param {SdpMedia} media - Media object to populate
   */
  static parseRtpmap = (value, media) => {
    const spaceIdx = value.indexOf(" ");
    if (spaceIdx < 0) {
      logger.warn(`SDP: invalid rtpmap: ${value}`);
      return;
    }

    const pt = parseInt(value.substring(0, spaceIdx));
    const codecStr = value.substring(spaceIdx + 1);
    const parts = codecStr.split("/");

    if (pt === media.payloadType) {
      media.codec = parts[0] || "";
      media.clockRate = parseInt(parts[1]) || 0;
      media.encodingParams = parseInt(parts[2]) || 0;

      // For audio, encodingParams typically represents channels
      if (media.type === "audio" && media.encodingParams > 0) {
        media.channels = media.encodingParams;
      }
    }

    // Also store as attribute for reference
    media.attributes[`rtpmap:${pt}`] = codecStr;
  };

  /**
   * Parse a=fmtp value: `<pt> <key>=<value>;<key>=<value>;...`
   * Example: "96 profile-level-id=420029; packetization-mode=1; sprop-parameter-sets=Z00AKp..."
   * @param {string} value - fmtp attribute value
   * @param {SdpMedia} media - Media object to populate
   */
  static parseFmtp = (value, media) => {
    const spaceIdx = value.indexOf(" ");
    if (spaceIdx < 0) {
      logger.warn(`SDP: invalid fmtp: ${value}`);
      return;
    }

    const pt = parseInt(value.substring(0, spaceIdx));
    const paramsStr = value.substring(spaceIdx + 1);

    if (pt === media.payloadType) {
      media.fmtp = SdpParser.parseFmtpParams(paramsStr);
    }

    // Store raw as attribute
    media.attributes[`fmtp:${pt}`] = paramsStr;
  };

  /**
   * Parse fmtp parameters string into key-value map
   * @param {string} paramsStr - Semicolon-separated key=value pairs
   * @returns {{[key: string]: string}}
   */
  static parseFmtpParams = (paramsStr) => {
    /** @type {{[key: string]: string}} */
    const params = {};
    const pairs = paramsStr.split(";");

    for (const pair of pairs) {
      const trimmed = pair.trim();
      if (!trimmed) {
        continue;
      }
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx > 0) {
        const key = trimmed.substring(0, eqIdx).trim();
        const val = trimmed.substring(eqIdx + 1).trim();
        params[key] = val;
      } else {
        // Flag-style parameter
        params[trimmed] = "";
      }
    }
    return params;
  };

  // ─────────────────────────────────────────
  // Connection & Bandwidth Parsing
  // ─────────────────────────────────────────

  /**
   * Parse c= line: `c=IN IP4 <address>[/<ttl>][/<num>]`
   * @param {string} value - Connection line value
   * @returns {SdpConnection}
   */
  static parseConnection = (value) => {
    const parts = value.split(/\s+/);
    /** @type {SdpConnection} */
    const conn = { address: "", ttl: 0, addressType: "IP4" };

    if (parts.length >= 3) {
      conn.addressType = parts[1]; // IP4 or IP6
      const addrParts = parts[2].split("/");
      conn.address = addrParts[0] || "";
      conn.ttl = parseInt(addrParts[1]) || 0;
    }
    return conn;
  };

  /**
   * Parse b= line: `b=<type>:<value>`
   * @param {string} value - Bandwidth line value
   * @returns {SdpBandwidth}
   */
  static parseBandwidth = (value) => {
    const colonIdx = value.indexOf(":");
    if (colonIdx > 0) {
      return {
        type: value.substring(0, colonIdx),
        value: parseInt(value.substring(colonIdx + 1)) || 0
      };
    }
    return { type: value, value: 0 };
  };

  /**
   * Parse t= line: `t=<start> <stop>`
   * @param {string} value - Timing line value
   * @returns {SdpTiming}
   */
  static parseTiming = (value) => {
    const parts = value.split(/\s+/);
    return {
      start: parseInt(parts[0]) || 0,
      stop: parseInt(parts[1]) || 0
    };
  };

  // ─────────────────────────────────────────
  // Post-Processing
  // ─────────────────────────────────────────

  /**
   * Resolve and normalize codec info for a media track.
   * Sets default channels for audio, normalizes codec names.
   * @param {SdpMedia} media - Media object to resolve
   */
  static resolveMediaCodec = (media) => {
    // Default audio channels to 1 if not specified
    if (media.type === "audio" && media.channels === 0) {
      // PCMA/PCMU typically mono at 8000Hz
      if (media.codec === "PCMA" || media.codec === "PCMU" || media.codec === "GSM") {
        media.channels = 1;
      } else if (media.clockRate > 0) {
        media.channels = 1;
      }
    }

    // Normalize common codec names to standard identifiers
    if (media.codec) {
      media.codec = SdpParser.normalizeCodecName(media.codec);
    }
  };

  /**
   * Normalize codec name from SDP to a standard identifier
   * @param {string} codec - Raw codec name from rtpmap
   * @returns {string} Normalized codec name
   */
  static normalizeCodecName = (codec) => {
    const upper = codec.toUpperCase();
    switch (upper) {
    case "H264":
    case "AVC":
      return "H264";
    case "H265":
    case "HEVC":
    case "H265/90000":
      return "H265";
    case "MPEG4-GENERIC":
    case "AAC":
      return "MPEG4-GENERIC";
    case "PCMA":
    case "PCMA/8000":
      return "PCMA";
    case "PCMU":
    case "PCMU/8000":
      return "PCMU";
    case "VP8":
      return "VP8";
    case "VP9":
      return "VP9";
    case "OPUS":
      return "OPUS";
    case "G722":
      return "G722";
    case "MPA":
    case "MP4A-LATM":
      return upper;
    default:
      return upper;
    }
  };

  // ─────────────────────────────────────────
  // Utility Methods
  // ─────────────────────────────────────────

  /**
   * Get video media tracks from parsed SDP
   * @param {SdpSession} session - Parsed SDP session
   * @returns {SdpMedia[]}
   */
  static getVideoTracks = (session) => {
    return session ? session.media.filter((m) => m.type === "video") : [];
  };

  /**
   * Get audio media tracks from parsed SDP
   * @param {SdpSession} session - Parsed SDP session
   * @returns {SdpMedia[]}
   */
  static getAudioTracks = (session) => {
    return session ? session.media.filter((m) => m.type === "audio") : [];
  };

  /**
   * Check if SDP contains H.264 video
   * @param {SdpSession} session - Parsed SDP session
   * @returns {boolean}
   */
  static hasH264 = (session) => {
    return SdpParser.getVideoTracks(session).some((m) => m.codec === "H264");
  };

  /**
   * Check if SDP contains H.265/HEVC video
   * @param {SdpSession} session - Parsed SDP session
   * @returns {boolean}
   */
  static hasH265 = (session) => {
    return SdpParser.getVideoTracks(session).some((m) => m.codec === "H265");
  };

  /**
   * Extract SPS and PPS from H.264 fmtp sprop-parameter-sets
   * @param {SdpMedia} videoTrack - Video media track with H264 codec
   * @returns {{sps: Buffer|null, pps: Buffer|null}}
   */
  static extractH264SpsPps = (videoTrack) => {
    if (!videoTrack || videoTrack.codec !== "H264") {
      return { sps: null, pps: null };
    }

    const spropStr = videoTrack.fmtp["sprop-parameter-sets"];
    if (!spropStr) {
      return { sps: null, pps: null };
    }

    const nalus = spropStr.split(",").map((s) => Buffer.from(s.trim(), "base64"));
    return {
      sps: nalus[0] || null,
      pps: nalus[1] || null
    };
  };

  /**
   * Extract profile-level-id from H.264 fmtp
   * @param {SdpMedia} videoTrack - Video media track with H264 codec
   * @returns {string} profile-level-id hex string (e.g. "420029")
   */
  static extractProfileLevelId = (videoTrack) => {
    if (!videoTrack || videoTrack.codec !== "H264") {
      return "";
    }
    return videoTrack.fmtp["profile-level-id"] || "";
  };
}

module.exports = SdpParser;

// ─────────────────────────────────────────
// Type Definitions
// ─────────────────────────────────────────

/**
 * @typedef {object} SdpConnection
 * @property {string} address - IP address
 * @property {number} ttl - Time-to-live for multicast
 * @property {string} addressType - Address type (IP4 or IP6)
 */

/**
 * @typedef {object} SdpBandwidth
 * @property {string} type - Bandwidth type (AS, CT, etc.)
 * @property {number} value - Bandwidth value in kbps
 */

/**
 * @typedef {object} SdpTiming
 * @property {number} start - Start time (NTP timestamp or 0)
 * @property {number} stop - Stop time (NTP timestamp or 0)
 */

/**
 * @typedef {object} SdpMedia
 * @property {string} type - Media type: "video" | "audio" | "application" | "text"
 * @property {number} port - Transport port
 * @property {string} protocol - Transport protocol (e.g. "RTP/AVP")
 * @property {number[]} payloadTypes - List of payload type numbers
 * @property {number} payloadType - Primary payload type
 * @property {SdpConnection|null} connection - Media-level connection info
 * @property {SdpBandwidth[]} bandwidth - Media-level bandwidth info
 * @property {{[key: string]: string}} attributes - Raw attributes map
 * @property {string} codec - Codec name (e.g. "H264", "MPEG4-GENERIC", "PCMA")
 * @property {number} clockRate - Clock rate in Hz (e.g. 90000 for video, 48000 for audio)
 * @property {number} encodingParams - Encoding parameters from rtpmap
 * @property {number} channels - Audio channel count
 * @property {{[key: string]: string}} fmtp - Format parameters from fmtp attribute
 * @property {string} trackId - Track ID (e.g. "trackID=1")
 * @property {string} control - Control URL or path
 * @property {string} direction - Media direction: "sendrecv" | "sendonly" | "recvonly" | "inactive"
 */

/**
 * @typedef {object} SdpSession
 * @property {number} version - SDP version (always 0)
 * @property {string} origin - Origin field (o=)
 * @property {string} name - Session name (s=)
 * @property {string} info - Session information (i=)
 * @property {string} uri - Session URI (u=)
 * @property {string} email - Email address (e=)
 * @property {string} phone - Phone number (p=)
 * @property {SdpConnection} connection - Session-level connection info
 * @property {SdpBandwidth[]} bandwidth - Session-level bandwidth info
 * @property {SdpTiming} timing - Session timing
 * @property {{[key: string]: string}} attributes - Session-level attributes
 * @property {SdpMedia[]} media - Media track descriptions
 */
