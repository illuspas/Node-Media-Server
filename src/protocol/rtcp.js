// @ts-check
//
//  Created by Chen Mingliang on 25/04/24.
//  illuspas@msn.com
//  Copyright (c) 2025 NodeMedia. All rights reserved.
//

const logger = require("../core/logger.js");

/** RTCP version (always 2 per RFC 3550) */
const RTCP_VERSION = 2;

/** RTCP packet types */
const RTCP_TYPE_SR = 200;    // Sender Report
const RTCP_TYPE_RR = 201;    // Receiver Report
const RTCP_TYPE_SDES = 202;  // Source Description
const RTCP_TYPE_BYE = 203;   // Bye
const RTCP_TYPE_APP = 204;   // Application-Defined

/** SDES item types */
const SDES_TYPE_END = 0;
const SDES_TYPE_CNAME = 1;
const SDES_TYPE_NAME = 2;
const SDES_TYPE_EMAIL = 3;
const SDES_TYPE_PHONE = 4;
const SDES_TYPE_LOC = 5;
const SDES_TYPE_TOOL = 6;
const SDES_TYPE_NOTE = 7;
const SDES_TYPE_PRIV = 8;

/**
 * RTCP protocol parser and builder (RFC 3550).
 * Handles Sender Report, Receiver Report, SDES, BYE, and compound RTCP packets.
 * @class
 */
class RtcpParser {
  /**
   * Parse a compound RTCP packet buffer into an array of individual RTCP packets.
   * A single buffer may contain multiple RTCP packets back-to-back.
   * @param {Buffer} buffer - Raw RTCP data (from TCP interleaved or UDP)
   * @returns {RtcpPacket[]} Array of parsed RTCP packets
   */
  static parseCompound = (buffer) => {
    /** @type {RtcpPacket[]} */
    const packets = [];

    if (!buffer || buffer.length < 4) {
      return packets;
    }

    let offset = 0;
    while (offset < buffer.length - 3) {
      // Read common header
      const byte0 = buffer[offset];
      const version = (byte0 >> 6) & 0x03;

      if (version !== RTCP_VERSION) {
        logger.trace(`RTCP: invalid version ${version} at offset ${offset}`);
        break;
      }

      const padding = ((byte0 >> 5) & 0x01) === 1;
      const receptionReportCount = byte0 & 0x1F;
      const packetType = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      // Length is in 32-bit words, not including the 4-byte header
      const packetSize = (length + 1) * 4;

      if (offset + packetSize > buffer.length) {
        logger.trace(`RTCP: packet extends beyond buffer (need ${packetSize}, have ${buffer.length - offset})`);
        break;
      }

      const packetData = buffer.subarray(offset, offset + packetSize);

      /** @type {RtcpPacket} */
      let packet = {
        type: packetType,
        padding: padding,
        count: receptionReportCount,
        length: packetSize,
        raw: packetData
      };

      // Parse type-specific data
      switch (packetType) {
      case RTCP_TYPE_SR:
        packet = RtcpParser.parseSenderReport(packetData, receptionReportCount);
        break;
      case RTCP_TYPE_RR:
        packet = RtcpParser.parseReceiverReport(packetData, receptionReportCount);
        break;
      case RTCP_TYPE_SDES:
        packet = RtcpParser.parseSDES(packetData, receptionReportCount);
        break;
      case RTCP_TYPE_BYE:
        packet = RtcpParser.parseBye(packetData, receptionReportCount);
        break;
      case RTCP_TYPE_APP:
        packet = RtcpParser.parseApp(packetData);
        break;
      default:
        logger.trace(`RTCP: unknown packet type ${packetType}`);
        break;
      }

      packets.push(packet);
      offset += packetSize;
    }

    return packets;
  };

  /**
   * Parse a single RTP/RTCP packet — determines if buffer is RTP or RTCP.
   * RTCP packet type is 200-204 (SR/RR/SDES/BYE/APP), RTP payload type is typically 0-127.
   * @param {Buffer} buffer - Raw packet data
   * @returns {boolean} True if buffer appears to be RTCP
   */
  static isRtcp = (buffer) => {
    if (!buffer || buffer.length < 2) {
      return false;
    }
    const version = (buffer[0] >> 6) & 0x03;
    const type = buffer[1];
    return version === RTCP_VERSION && type >= 200 && type <= 204;
  };

  // ─────────────────────────────────────────
  // Sender Report (SR) — RTCP Type 200
  // ─────────────────────────────────────────

  /**
   * Parse Sender Report packet.
   * Format (RFC 3550 Section 6.4.1):
   *   0                   1                   2                   3
   *   0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
   *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
   *  |V=2|P|    RC   |   PT=SR=200   |       length                  |
   *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
   *  |                         SSRC of sender                        |
   *  +=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+
   *  |              NTP timestamp, most significant word             |
   *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
   *  |             NTP timestamp, least significant word             |
   *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
   *  |                         RTP timestamp                         |
   *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
   *  |                     sender's packet count                     |
   *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
   *  |                      sender's octet count                     |
   *  +=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+
   *  |                 report block 1 (optional)                     |
   *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
   * @param {Buffer} data - Raw SR packet data
   * @param {number} reportCount - Number of receiver report blocks
   * @returns {RtcpSenderReport}
   */
  static parseSenderReport = (data, reportCount) => {
    const ssrc = data.readUInt32BE(4);
    const ntpTimestampMsw = data.readUInt32BE(8);
    const ntpTimestampLsw = data.readUInt32BE(12);
    const rtpTimestamp = data.readUInt32BE(16);
    const senderPacketCount = data.readUInt32BE(20);
    const senderOctetCount = data.readUInt32BE(24);

    // NTP timestamp as seconds since Jan 1, 1900
    const ntpTimestamp = ntpTimestampMsw + (ntpTimestampLsw / 4294967296);

    // Parse report blocks
    const reports = RtcpParser.parseReportBlocks(data, 28, reportCount);

    return {
      type: RTCP_TYPE_SR,
      padding: false,
      count: reportCount,
      length: data.length,
      raw: data,
      ssrc: ssrc,
      ntpTimestamp: ntpTimestamp,
      ntpTimestampMsw: ntpTimestampMsw,
      ntpTimestampLsw: ntpTimestampLsw,
      rtpTimestamp: rtpTimestamp,
      senderPacketCount: senderPacketCount,
      senderOctetCount: senderOctetCount,
      reports: reports
    };
  };

  // ─────────────────────────────────────────
  // Receiver Report (RR) — RTCP Type 201
  // ─────────────────────────────────────────

  /**
   * Parse Receiver Report packet.
   * @param {Buffer} data - Raw RR packet data
   * @param {number} reportCount - Number of report blocks
   * @returns {RtcpReceiverReport}
   */
  static parseReceiverReport = (data, reportCount) => {
    const ssrc = data.readUInt32BE(4);
    const reports = RtcpParser.parseReportBlocks(data, 8, reportCount);

    return {
      type: RTCP_TYPE_RR,
      padding: false,
      count: reportCount,
      length: data.length,
      raw: data,
      ssrc: ssrc,
      reports: reports
    };
  };

  /**
   * Parse receiver report blocks from SR or RR packet.
   * Each block is 24 bytes (RFC 3550 Section 6.4.2).
   * @param {Buffer} data - Packet data
   * @param {number} offset - Start offset of first report block
   * @param {number} count - Number of report blocks
   * @returns {RtcpReportBlock[]}
   */
  static parseReportBlocks = (data, offset, count) => {
    /** @type {RtcpReportBlock[]} */
    const blocks = [];

    for (let i = 0; i < count; i++) {
      const blockOffset = offset + i * 24;
      if (blockOffset + 24 > data.length) {
        break;
      }

      blocks.push({
        ssrc: data.readUInt32BE(blockOffset),
        fractionLost: data[blockOffset + 4],
        cumulativeLost: (data[blockOffset + 5] << 16) | (data[blockOffset + 6] << 8) | data[blockOffset + 7],
        highestSeq: data.readUInt32BE(blockOffset + 8),
        jitter: data.readUInt32BE(blockOffset + 12),
        lastSR: data.readUInt32BE(blockOffset + 16),
        delaySinceLastSR: data.readUInt32BE(blockOffset + 20)
      });
    }

    return blocks;
  };

  // ─────────────────────────────────────────
  // Source Description (SDES) — RTCP Type 202
  // ─────────────────────────────────────────

  /**
   * Parse SDES packet.
   * @param {Buffer} data - Raw SDES packet data
   * @param {number} chunkCount - Number of SSRC/CSRC chunks
   * @returns {RtcpSDES}
   */
  static parseSDES = (data, chunkCount) => {
    /** @type {RtcpSDESChunk[]} */
    const chunks = [];
    let offset = 4;

    for (let c = 0; c < chunkCount && offset < data.length; c++) {
      if (offset + 4 > data.length) {
        break;
      }

      const ssrc = data.readUInt32BE(offset);
      offset += 4;

      /** @type {RtcpSDESItem[]} */
      const items = [];

      while (offset + 2 <= data.length) {
        const itemType = data[offset];
        if (itemType === SDES_TYPE_END) {
          offset++;
          // Pad to 32-bit boundary
          offset = Math.ceil(offset / 4) * 4;
          break;
        }

        const itemLength = data[offset + 1];
        if (offset + 2 + itemLength > data.length) {
          break;
        }

        items.push({
          type: itemType,
          value: data.subarray(offset + 2, offset + 2 + itemLength).toString("utf8")
        });
        offset += 2 + itemLength;
      }

      chunks.push({ ssrc, items });
    }

    return {
      type: RTCP_TYPE_SDES,
      padding: false,
      count: chunkCount,
      length: data.length,
      raw: data,
      chunks: chunks
    };
  };

  // ─────────────────────────────────────────
  // Bye — RTCP Type 203
  // ─────────────────────────────────────────

  /**
   * Parse BYE packet.
   * @param {Buffer} data - Raw BYE packet data
   * @param {number} sourceCount - Number of SSRC/CSRC identifiers
   * @returns {RtcpBye}
   */
  static parseBye = (data, sourceCount) => {
    /** @type {number[]} */
    const sources = [];
    let offset = 4;

    for (let i = 0; i < sourceCount && offset + 4 <= data.length; i++) {
      sources.push(data.readUInt32BE(offset));
      offset += 4;
    }

    // Optional reason string
    let reason = "";
    if (offset < data.length) {
      const reasonLength = data[offset];
      if (offset + 1 + reasonLength <= data.length) {
        reason = data.subarray(offset + 1, offset + 1 + reasonLength).toString("utf8");
      }
    }

    return {
      type: RTCP_TYPE_BYE,
      padding: false,
      count: sourceCount,
      length: data.length,
      raw: data,
      sources: sources,
      reason: reason
    };
  };

  // ─────────────────────────────────────────
  // Application-Defined (APP) — RTCP Type 204
  // ─────────────────────────────────────────

  /**
   * Parse APP packet.
   * @param {Buffer} data - Raw APP packet data
   * @returns {RtcpApp}
   */
  static parseApp = (data) => {
    const ssrc = data.readUInt32BE(4);
    const name = data.subarray(8, 12).toString("ascii");
    const identifier = data.readUInt32BE(12);

    return {
      type: RTCP_TYPE_APP,
      padding: false,
      count: 0,
      length: data.length,
      raw: data,
      ssrc: ssrc,
      name: name,
      identifier: identifier,
      data: data.subarray(16)
    };
  };

  // ─────────────────────────────────────────
  // RR Builder (for sending receiver reports)
  // ─────────────────────────────────────────

  /**
   * Build a Receiver Report (RR) packet for sending back to server.
   * @param {number} senderSsrc - Our SSRC (receiver)
   * @param {RtcpReportBlock[]} [reportBlocks] - Optional report blocks
   * @returns {Buffer} RR packet buffer
   */
  static buildReceiverReport = (senderSsrc, reportBlocks) => {
    const blockCount = reportBlocks ? reportBlocks.length : 0;
    // Header(4) + SSRC(4) + blocks(24 each)
    const size = 8 + (blockCount * 24);
    const buf = Buffer.alloc(size);

    // Header: V=2, P=0, RC=blockCount, PT=201
    buf[0] = (RTCP_VERSION << 6) | blockCount;
    buf[1] = RTCP_TYPE_RR;
    // Length in 32-bit words minus 1
    buf.writeUInt16BE((size / 4) - 1, 2);

    // Sender SSRC
    buf.writeUInt32BE(senderSsrc, 4);

    // Report blocks
    for (let i = 0; i < blockCount; i++) {
      const block = reportBlocks[i];
      const offset = 8 + i * 24;

      buf.writeUInt32BE(block.ssrc, offset);
      buf[offset + 4] = block.fractionLost;
      // Cumulative packets lost (24-bit)
      buf[offset + 5] = (block.cumulativeLost >> 16) & 0xFF;
      buf[offset + 6] = (block.cumulativeLost >> 8) & 0xFF;
      buf[offset + 7] = block.cumulativeLost & 0xFF;
      buf.writeUInt32BE(block.highestSeq, offset + 8);
      buf.writeUInt32BE(block.jitter, offset + 12);
      buf.writeUInt32BE(block.lastSR, offset + 16);
      buf.writeUInt32BE(block.delaySinceLastSR, offset + 20);
    }

    return buf;
  };

  /**
   * Build a simple empty Receiver Report (no report blocks).
   * Useful for keep-alive in RTCP channel.
   * @param {number} senderSsrc - Our SSRC
   * @returns {Buffer}
   */
  static buildEmptyReceiverReport = (senderSsrc) => {
    return RtcpParser.buildReceiverReport(senderSsrc, []);
  };

  // ─────────────────────────────────────────
  // Utility
  // ─────────────────────────────────────────

  /**
   * Get RTCP packet type name string
   * @param {number} type - RTCP packet type number
   * @returns {string}
   */
  static getTypeName = (type) => {
    switch (type) {
    case RTCP_TYPE_SR:
      return "SR";
    case RTCP_TYPE_RR:
      return "RR";
    case RTCP_TYPE_SDES:
      return "SDES";
    case RTCP_TYPE_BYE:
      return "BYE";
    case RTCP_TYPE_APP:
      return "APP";
    default:
      return `UNKNOWN(${type})`;
    }
  };

  /**
   * Get SDES item type name string
   * @param {number} type - SDES item type
   * @returns {string}
   */
  static getSdesTypeName = (type) => {
    switch (type) {
    case SDES_TYPE_CNAME:
      return "CNAME";
    case SDES_TYPE_NAME:
      return "NAME";
    case SDES_TYPE_EMAIL:
      return "EMAIL";
    case SDES_TYPE_PHONE:
      return "PHONE";
    case SDES_TYPE_LOC:
      return "LOC";
    case SDES_TYPE_TOOL:
      return "TOOL";
    case SDES_TYPE_NOTE:
      return "NOTE";
    case SDES_TYPE_PRIV:
      return "PRIV";
    default:
      return `UNKNOWN(${type})`;
    }
  };
}

module.exports = RtcpParser;

// Export constants for external use
module.exports.RTCP_TYPE_SR = RTCP_TYPE_SR;
module.exports.RTCP_TYPE_RR = RTCP_TYPE_RR;
module.exports.RTCP_TYPE_SDES = RTCP_TYPE_SDES;
module.exports.RTCP_TYPE_BYE = RTCP_TYPE_BYE;
module.exports.RTCP_TYPE_APP = RTCP_TYPE_APP;

// ─────────────────────────────────────────
// Type Definitions
// ─────────────────────────────────────────

/**
 * @typedef {object} RtcpPacket
 * @property {number} type - RTCP packet type (200-204)
 * @property {boolean} padding - Whether padding is present
 * @property {number} count - Reception/source report count or subtype
 * @property {number} length - Total packet length in bytes
 * @property {Buffer} raw - Raw packet data
 */

/**
 * @typedef {object} RtcpSenderReport
 * @augments RtcpPacket
 * @property {number} ssrc - Sender SSRC
 * @property {number} ntpTimestamp - NTP timestamp (seconds since 1900-01-01)
 * @property {number} ntpTimestampMsw - NTP timestamp most significant word
 * @property {number} ntpTimestampLsw - NTP timestamp least significant word
 * @property {number} rtpTimestamp - RTP timestamp corresponding to NTP timestamp
 * @property {number} senderPacketCount - Total RTP packets sent
 * @property {number} senderOctetCount - Total RTP octets sent
 * @property {RtcpReportBlock[]} reports - Receiver report blocks
 */

/**
 * @typedef {object} RtcpReceiverReport
 * @augments RtcpPacket
 * @property {number} ssrc - Receiver SSRC
 * @property {RtcpReportBlock[]} reports - Report blocks
 */

/**
 * @typedef {object} RtcpReportBlock
 * @property {number} ssrc - SSRC of source being reported
 * @property {number} fractionLost - Fraction lost (0-255, representing 0-100%)
 * @property {number} cumulativeLost - Cumulative number of packets lost
 * @property {number} highestSeq - Highest sequence number received
 * @property {number} jitter - Interarrival jitter
 * @property {number} lastSR - Last SR timestamp (middle 32 bits of NTP)
 * @property {number} delaySinceLastSR - Delay since last SR (in units of 1/65536 seconds)
 */

/**
 * @typedef {object} RtcpSDES
 * @augments RtcpPacket
 * @property {RtcpSDESChunk[]} chunks - SDES chunks
 */

/**
 * @typedef {object} RtcpSDESChunk
 * @property {number} ssrc - SSRC/CSRC identifier
 * @property {RtcpSDESItem[]} items - SDES items
 */

/**
 * @typedef {object} RtcpSDESItem
 * @property {number} type - SDES item type (1=CNAME, 2=NAME, etc.)
 * @property {string} value - Item value
 */

/**
 * @typedef {object} RtcpBye
 * @augments RtcpPacket
 * @property {number[]} sources - SSRC/CSRC identifiers that are leaving
 * @property {string} reason - Optional reason for leaving
 */

/**
 * @typedef {object} RtcpApp
 * @augments RtcpPacket
 * @property {number} ssrc - SSRC
 * @property {string} name - 4-character ASCII name
 * @property {number} identifier - Application-dependent identifier
 * @property {Buffer} data - Application-dependent data
 */
