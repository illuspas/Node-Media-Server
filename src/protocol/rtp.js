// @ts-check
//
//  Created by Chen Mingliang on 25/04/24.
//  illuspas@msn.com
//  Copyright (c) 2025 NodeMedia. All rights reserved.
//

const logger = require("../core/logger.js");

/** RTP version (always 2 per RFC 3550) */
const RTP_VERSION = 2;

/** Minimum RTP header size in bytes */
const RTP_MIN_HEADER_SIZE = 12;

/**
 * RTP packet parser (RFC 3550).
 * Parses raw RTP binary data into structured objects.
 * @class
 */
class RtpParser {
  /**
   * Parse a raw RTP packet buffer into a structured object.
   * @param {Buffer} buffer - Raw RTP packet data (from TCP interleaved or UDP)
   * @returns {RtpPacket|null} Parsed RTP packet, or null on invalid data
   */
  static parse = (buffer) => {
    if (!buffer || buffer.length < RTP_MIN_HEADER_SIZE) {
      logger.trace(`RTP: packet too short (${buffer ? buffer.length : 0} bytes)`);
      return null;
    }

    const byte0 = buffer[0];
    const version = (byte0 >> 6) & 0x03;

    if (version !== RTP_VERSION) {
      logger.trace(`RTP: invalid version ${version}, expected ${RTP_VERSION}`);
      return null;
    }

    const padding = ((byte0 >> 5) & 0x01) === 1;
    const extension = ((byte0 >> 4) & 0x01) === 1;
    const csrcCount = byte0 & 0x0F;

    const byte1 = buffer[1];
    const marker = ((byte1 >> 7) & 0x01) === 1;
    const payloadType = byte1 & 0x7F;

    const sequenceNumber = buffer.readUInt16BE(2);
    const timestamp = buffer.readUInt32BE(4);
    const ssrc = buffer.readUInt32BE(8);

    // Validate header length
    const headerSize = RTP_MIN_HEADER_SIZE + (csrcCount * 4);
    if (buffer.length < headerSize) {
      logger.trace(`RTP: buffer too short for CSRC list (need ${headerSize}, have ${buffer.length})`);
      return null;
    }

    // Parse CSRC list
    /** @type {number[]} */
    const csrcList = [];
    for (let i = 0; i < csrcCount; i++) {
      csrcList.push(buffer.readUInt32BE(12 + i * 4));
    }

    let payloadOffset = headerSize;

    // Parse RTP header extension (if present)
    /** @type {RtpExtension|null} */
    let extensionData = null;
    if (extension) {
      if (buffer.length < payloadOffset + 4) {
        logger.trace("RTP: buffer too short for extension header");
        return null;
      }
      const extProfile = buffer.readUInt16BE(payloadOffset);
      const extLength = buffer.readUInt16BE(payloadOffset + 2);
      const extTotalSize = 4 + (extLength * 4);

      if (buffer.length < payloadOffset + extTotalSize) {
        logger.trace(`RTP: buffer too short for extension data (need ${extTotalSize})`);
        return null;
      }

      extensionData = {
        profile: extProfile,
        length: extLength,
        data: buffer.subarray(payloadOffset + 4, payloadOffset + extTotalSize)
      };
      payloadOffset += extTotalSize;
    }

    // Extract payload (strip padding if needed)
    let payloadEnd = buffer.length;
    if (padding && buffer.length > 0) {
      const paddingSize = buffer[buffer.length - 1];
      if (paddingSize > 0 && paddingSize <= (buffer.length - payloadOffset)) {
        payloadEnd = buffer.length - paddingSize;
      }
    }

    const payload = buffer.subarray(payloadOffset, payloadEnd);

    /** @type {RtpPacket} */
    const packet = {
      version: version,
      padding: padding,
      extension: extension,
      csrcCount: csrcCount,
      marker: marker,
      payloadType: payloadType,
      sequenceNumber: sequenceNumber,
      timestamp: timestamp,
      ssrc: ssrc,
      csrcList: csrcList,
      extensionData: extensionData,
      payload: payload,
      size: buffer.length
    };

    logger.trace(`RTP: pt=${payloadType} seq=${sequenceNumber} ts=${timestamp} marker=${marker} size=${payload.length}`);
    return packet;
  };

  // ─────────────────────────────────────────
  // RTP Sequence Analysis Utilities
  // ─────────────────────────────────────────

  /**
   * Calculate sequence number difference accounting for 16-bit wraparound.
   * Returns positive if b is newer than a.
   * @param {number} a - First sequence number (0-65535)
   * @param {number} b - Second sequence number (0-65535)
   * @returns {number} Signed difference (b - a with wraparound)
   */
  static seqDiff = (a, b) => {
    const diff = b - a;
    if (diff > 32768) {
      return diff - 65536;
    }
    if (diff < -32768) {
      return diff + 65536;
    }
    return diff;
  };

  /**
   * Check if sequence number b is newer than a (with wraparound).
   * @param {number} a - Previous sequence number
   * @param {number} b - Current sequence number
   * @returns {boolean}
   */
  static isNewer = (a, b) => {
    return RtpParser.seqDiff(a, b) > 0;
  };

  /**
   * Increment a 16-bit sequence number with wraparound.
   * @param {number} seq - Current sequence number
   * @param {number} [increment] - Amount to add
   * @returns {number} Result sequence number (0-65535)
   */
  static seqInc = (seq, increment = 1) => {
    return (seq + increment) & 0xFFFF;
  };

  /**
   * Calculate extended timestamp difference accounting for 32-bit wraparound.
   * @param {number} a - First timestamp
   * @param {number} b - Second timestamp
   * @returns {number} Signed difference (b - a with wraparound)
   */
  static timestampDiff = (a, b) => {
    const diff = b - a;
    if (diff > 2147483648) {
      return diff - 4294967296;
    }
    if (diff < -2147483648) {
      return diff + 4294967296;
    }
    return diff;
  };
}

module.exports = RtpParser;

// ─────────────────────────────────────────
// Type Definitions
// ─────────────────────────────────────────

/**
 * @typedef {object} RtpExtension
 * @property {number} profile - Extension profile (0x0001 = one-byte, 0x0002 = two-byte)
 * @property {number} length - Extension length in 32-bit words
 * @property {Buffer} data - Raw extension data
 */

/**
 * @typedef {object} RtpPacket
 * @property {number} version - RTP version (always 2)
 * @property {boolean} padding - Whether padding is present
 * @property {boolean} extension - Whether header extension is present
 * @property {number} csrcCount - Number of CSRC identifiers
 * @property {boolean} marker - Marker bit (frame boundary signal)
 * @property {number} payloadType - Payload type (e.g. 96 for dynamic)
 * @property {number} sequenceNumber - Sequence number (16-bit)
 * @property {number} timestamp - Timestamp (32-bit, clock-rate dependent)
 * @property {number} ssrc - Synchronization source identifier
 * @property {number[]} csrcList - Contributing source identifiers
 * @property {RtpExtension|null} extensionData - Header extension data
 * @property {Buffer} payload - Raw payload data (without padding)
 * @property {number} size - Total packet size in bytes
 */
