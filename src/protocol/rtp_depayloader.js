// @ts-check
//
//  Created by Chen Mingliang on 25/04/24.
//  illuspas@msn.com
//  Copyright (c) 2025 NodeMedia. All rights reserved.
//

const logger = require("../core/logger.js");
const AVPacket = require("../core/avpacket.js");

// ─────────────────────────────────────────
// H.264 NAL Unit Types (RFC 6184)
// ─────────────────────────────────────────
const H264_NAL_TYPE_NON_IDR = 1;
const H264_NAL_TYPE_IDR = 5;
const H264_NAL_TYPE_SEI = 6;
const H264_NAL_TYPE_SPS = 7;
const H264_NAL_TYPE_PPS = 8;
const H264_NAL_TYPE_STAP_A = 24;
const H264_NAL_TYPE_STAP_B = 25;
const H264_NAL_TYPE_FU_A = 28;
const H264_NAL_TYPE_FU_B = 29;

// ─────────────────────────────────────────
// H.265 NAL Unit Types (RFC 7798)
// ─────────────────────────────────────────
const H265_NAL_TYPE_TRAIL_N = 0;
const H265_NAL_TYPE_TRAIL_R = 1;
const H265_NAL_TYPE_IDR_W_RADL = 19;
const H265_NAL_TYPE_IDR_N_LP = 20;
const H265_NAL_TYPE_VPS = 32;
const H265_NAL_TYPE_SPS = 33;
const H265_NAL_TYPE_PPS = 34;
const H265_NAL_TYPE_AP = 48;
const H265_NAL_TYPE_FU = 49;

// ─────────────────────────────────────────
// FLV Constants
// ─────────────────────────────────────────
const FLV_AUDIO_TYPE = 8;
const FLV_VIDEO_TYPE = 9;

const FLV_SOUND_FORMAT_AAC = 10;
const FLV_SOUND_FORMAT_PCMA = 7;
const FLV_SOUND_FORMAT_PCMU = 8;

const FLV_CODEC_ID_H264 = 7;
const FLV_CODEC_ID_H265 = 12; // Enhanced FLV fourcc hvc1

const FLV_AVC_SEQUENCE_HEADER = 0;
const FLV_AVC_NALU = 1;

const FLV_FRAME_KEY = 1;
const FLV_FRAME_INTER = 2;

/**
 * RTP Depayloader — converts RTP payloads into AVPackets.
 * Supports H.264, H.265, AAC, PCMA, PCMU codecs.
 * Outputs data in FLV tag body format for direct integration with BroadcastServer.
 * @class
 */
class RtpDepayloader {
  constructor() {
    /** @type {Map<number, TrackDepayloader>} payloadType -> depayloader */
    this.tracks = new Map();
  }

  /**
   * Add a media track for depayloading.
   * @param {number} payloadType - RTP payload type from SDP
   * @param {string} codec - Codec name (H264, H265, MPEG4-GENERIC, PCMA, PCMU)
   * @param {number} clockRate - Clock rate in Hz
   * @param {{[key: string]: string}} [fmtp] - Format parameters from SDP
   */
  addTrack = (payloadType, codec, clockRate, fmtp) => {
    const upper = codec.toUpperCase();
    let depayloader;

    switch (upper) {
    case "H264":
      depayloader = new H264Depayloader(payloadType, clockRate, fmtp);
      break;
    case "H265":
    case "HEVC":
      depayloader = new H265Depayloader(payloadType, clockRate, fmtp);
      break;
    case "MPEG4-GENERIC":
    case "AAC":
      depayloader = new AacDepayloader(payloadType, clockRate, fmtp);
      break;
    case "PCMA":
      depayloader = new PcmaDepayloader(payloadType, clockRate, FLV_SOUND_FORMAT_PCMA);
      break;
    case "PCMU":
      depayloader = new PcmaDepayloader(payloadType, clockRate, FLV_SOUND_FORMAT_PCMU);
      break;
    default:
      logger.warn(`RtpDepayloader: unsupported codec ${codec}, using passthrough`);
      depayloader = new PassthroughDepayloader(payloadType, clockRate);
      break;
    }

    this.tracks.set(payloadType, depayloader);
    logger.debug(`RtpDepayloader: added track pt=${payloadType} codec=${upper}`);
  };

  /**
   * Feed an RTP packet. May return 0 or more AVPackets.
   * @param {import("./rtp.js").RtpPacket} rtpPacket - Parsed RTP packet
   * @returns {AVPacket[]} Zero or more complete AVPackets
   */
  feed = (rtpPacket) => {
    const track = this.tracks.get(rtpPacket.payloadType);
    if (!track) {
      logger.trace(`RtpDepayloader: no track for pt=${rtpPacket.payloadType}`);
      return [];
    }
    return track.feed(rtpPacket);
  };
}

// ═══════════════════════════════════════════
// Base Track Depayloader
// ═══════════════════════════════════════════

/**
 * @abstract
 */
class TrackDepayloader {
  /**
   * @param {number} payloadType
   * @param {number} clockRate
   */
  constructor(payloadType, clockRate) {
    this.payloadType = payloadType;
    this.clockRate = clockRate;
    /** @type {number} Last received RTP sequence number */
    this.lastSeq = -1;
  }

  /**
   * Check for sequence gap and update tracking.
   * @param {number} seq - Current sequence number
   * @returns {boolean} True if there is a gap
   */
  checkSeqGap = (seq) => {
    if (this.lastSeq >= 0) {
      const diff = (seq - this.lastSeq) & 0xFFFF;
      if (diff > 1 && diff < 30000) {
        return true;
      }
    }
    this.lastSeq = seq;
    return false;
  };
}

// ═══════════════════════════════════════════
// H.264 Depayloader (RFC 6184)
// ═══════════════════════════════════════════

class H264Depayloader extends TrackDepayloader {
  /**
   * @param {number} payloadType
   * @param {number} clockRate
   * @param {{[key: string]: string}} [fmtp]
   */
  constructor(payloadType, clockRate, fmtp) {
    super(payloadType, clockRate);
    this.fmtp = fmtp || {};

    // SPS/PPS from SDP sprop-parameter-sets
    /** @type {Buffer|null} */
    this.sps = null;
    /** @type {Buffer|null} */
    this.pps = null;
    /** @type {Buffer|null} */
    this.avcConfigRecord = null;

    // FU-A reassembly state
    this.fuStarted = false;
    /** @type {Buffer[]} */
    this.fuBuffers = [];
    this.fuTimestamp = 0;
    this.fuNalRefIdc = 0;
    this.fuNalType = 0;

    // Track if we have emitted the video header
    this.headerEmitted = false;

    // Parse SPS/PPS from sprop-parameter-sets if available
    this._initFromFmtp();
  }

  _initFromFmtp = () => {
    const sprop = this.fmtp["sprop-parameter-sets"];
    if (sprop) {
      const nalus = sprop.split(",").map((s) => Buffer.from(s.trim(), "base64"));
      if (nalus.length >= 2) {
        this.sps = nalus[0];
        this.pps = nalus[1];
        this.avcConfigRecord = this._buildAvcConfigRecord(this.sps, this.pps);
        logger.debug(`H264: SPS (${this.sps.length}B) PPS (${this.pps.length}B) from fmtp`);
      }
    }
  };

  /**
   * @param {import("./rtp.js").RtpPacket} rtpPacket
   * @returns {AVPacket[]}
   */
  feed = (rtpPacket) => {
    /** @type {AVPacket[]} */
    const packets = [];
    const payload = rtpPacket.payload;

    if (payload.length === 0) {
      return packets;
    }

    // Emit video header (SPS+PPS) on first feed if available
    if (!this.headerEmitted && this.avcConfigRecord) {
      packets.push(this._createVideoHeaderPacket(this.avcConfigRecord, rtpPacket.timestamp));
      this.headerEmitted = true;
    }

    // Check sequence gap — abort any in-progress FU-A
    if (this.checkSeqGap(rtpPacket.sequenceNumber) && this.fuStarted) {
      logger.debug("H264: seq gap during FU-A, discarding partial frame");
      this.fuStarted = false;
      this.fuBuffers = [];
    }

    const nalType = payload[0] & 0x1F;

    if (nalType >= 1 && nalType <= 23) {
      // Single NAL Unit Packet
      packets.push(...this._handleSingleNal(payload, rtpPacket));
    } else if (nalType === H264_NAL_TYPE_STAP_A) {
      // STAP-A: Aggregation Packet
      packets.push(...this._handleStapA(payload, rtpPacket));
    } else if (nalType === H264_NAL_TYPE_FU_A) {
      // FU-A: Fragmentation Unit
      const fuResult = this._handleFuA(payload, rtpPacket);
      if (fuResult) {
        packets.push(...fuResult);
      }
    } else {
      logger.trace(`H264: unsupported NAL type ${nalType}`);
    }

    return packets;
  };

  /**
   * Handle single NAL unit packet
   * @param {Buffer} payload
   * @param {import("./rtp.js").RtpPacket} rtpPacket
   * @returns {AVPacket[]}
   */
  _handleSingleNal = (payload, rtpPacket) => {
    /** @type {AVPacket[]} */
    const packets = [];
    const nalType = payload[0] & 0x1F;

    if (nalType === H264_NAL_TYPE_SPS) {
      this.sps = Buffer.from(payload);
      this._tryBuildConfig();
      return packets;
    }

    if (nalType === H264_NAL_TYPE_PPS) {
      this.pps = Buffer.from(payload);
      this._tryBuildConfig();
      return packets;
    }

    // Emit config record if we have it and have not yet
    if (!this.headerEmitted && this.avcConfigRecord) {
      packets.push(this._createVideoHeaderPacket(this.avcConfigRecord, rtpPacket.timestamp));
      this.headerEmitted = true;
    }

    // Create video NALU packet
    const isKeyframe = (nalType === H264_NAL_TYPE_IDR);
    const data = this._buildVideoNaluPayload(payload, isKeyframe, 0);
    packets.push(this._createVideoNalPacket(data, isKeyframe, rtpPacket.timestamp));

    return packets;
  };

  /**
   * Handle STAP-A aggregation packet
   * @param {Buffer} payload
   * @param {import("./rtp.js").RtpPacket} rtpPacket
   * @returns {AVPacket[]}
   */
  _handleStapA = (payload, rtpPacket) => {
    /** @type {AVPacket[]} */
    const packets = [];
    let offset = 1; // Skip STAP-A NAL type byte

    /** @type {Buffer[]} */
    let naluBuffers = [];

    while (offset + 2 <= payload.length) {
      const naluSize = payload.readUInt16BE(offset);
      offset += 2;
      if (offset + naluSize > payload.length) {
        logger.trace("H264: STAP-A truncated");
        break;
      }

      const nalu = payload.subarray(offset, offset + naluSize);
      offset += naluSize;

      const nalType = nalu[0] & 0x1F;
      if (nalType === H264_NAL_TYPE_SPS) {
        this.sps = Buffer.from(nalu);
        this._tryBuildConfig();
      } else if (nalType === H264_NAL_TYPE_PPS) {
        this.pps = Buffer.from(nalu);
        this._tryBuildConfig();
      } else {
        naluBuffers.push(nalu);
      }
    }

    // Emit config if available
    if (!this.headerEmitted && this.avcConfigRecord) {
      packets.push(this._createVideoHeaderPacket(this.avcConfigRecord, rtpPacket.timestamp));
      this.headerEmitted = true;
    }

    // Emit video frame from remaining NALUs
    if (naluBuffers.length > 0) {
      const isKeyframe = naluBuffers.some((n) => (n[0] & 0x1F) === H264_NAL_TYPE_IDR);
      // Concatenate all NALUs with length prefix
      const data = this._buildVideoMultiNaluPayload(naluBuffers, isKeyframe, 0);
      packets.push(this._createVideoNalPacket(data, isKeyframe, rtpPacket.timestamp));
    }

    return packets;
  };

  /**
   * Handle FU-A fragmentation unit
   * @param {Buffer} payload
   * @param {import("./rtp.js").RtpPacket} rtpPacket
   * @returns {AVPacket[]|null} Null if frame incomplete, array when frame complete
   */
  _handleFuA = (payload, rtpPacket) => {
    if (payload.length < 3) {
      return null;
    }

    // FU Indicator: forbidden_zero_bit(1) | nal_ref_idc(2) | type(5)=28
    const fuIndicator = payload[0];
    // FU Header: start(1) | end(1) | reserved(1) | nalType(5)
    const fuHeader = payload[1];
    const startBit = (fuHeader >> 7) & 0x01;
    const endBit = (fuHeader >> 6) & 0x01;
    const nalType = fuHeader & 0x1F;

    const fuPayload = payload.subarray(2);

    if (startBit) {
      // Start of FU-A
      this.fuStarted = true;
      this.fuTimestamp = rtpPacket.timestamp;
      this.fuNalRefIdc = (fuIndicator >> 5) & 0x03;
      this.fuNalType = nalType;
      // Reconstructed NAL header
      const nalHeader = Buffer.from([(fuIndicator & 0xE0) | nalType]);
      this.fuBuffers = [nalHeader];
      if (fuPayload.length > 0) {
        this.fuBuffers.push(Buffer.from(fuPayload));
      }
      return null;
    }

    if (!this.fuStarted) {
      logger.trace("H264: FU-A continuation without start");
      return null;
    }

    // Check timestamp consistency
    if (rtpPacket.timestamp !== this.fuTimestamp) {
      logger.debug("H264: FU-A timestamp changed mid-frame, discarding");
      this.fuStarted = false;
      this.fuBuffers = [];
      return null;
    }

    if (endBit) {
      // End of FU-A — assemble complete NAL
      if (fuPayload.length > 0) {
        this.fuBuffers.push(Buffer.from(fuPayload));
      }

      const completeNal = Buffer.concat(this.fuBuffers);
      this.fuStarted = false;
      this.fuBuffers = [];

      /** @type {AVPacket[]} */
      const packets = [];

      // Emit config if available
      if (!this.headerEmitted && this.avcConfigRecord) {
        packets.push(this._createVideoHeaderPacket(this.avcConfigRecord, this.fuTimestamp));
        this.headerEmitted = true;
      }

      const isKeyframe = (this.fuNalType === H264_NAL_TYPE_IDR);
      const data = this._buildVideoNaluPayload(completeNal, isKeyframe, 0);
      packets.push(this._createVideoNalPacket(data, isKeyframe, this.fuTimestamp));

      return packets;
    }

    // Middle of FU-A
    if (fuPayload.length > 0) {
      this.fuBuffers.push(Buffer.from(fuPayload));
    }
    return null;
  };

  /**
   * Try to build AVCDecoderConfigurationRecord from SPS+PPS.
   * Only rebuilds if SPS or PPS content actually changed.
   */
  _tryBuildConfig = () => {
    if (this.sps && this.pps) {
      const newRecord = this._buildAvcConfigRecord(this.sps, this.pps);
      if (!this.avcConfigRecord || !this.avcConfigRecord.equals(newRecord)) {
        this.avcConfigRecord = newRecord;
        this.headerEmitted = false; // Re-emit header on config change
        logger.debug(`H264: AVC config record built (SPS ${this.sps.length}B + PPS ${this.pps.length}B)`);
      }
    }
  };

  /**
   * Build AVCDecoderConfigurationRecord (FLV AVC sequence header body)
   * @param {Buffer} sps
   * @param {Buffer} pps
   * @returns {Buffer}
   */
  _buildAvcConfigRecord = (sps, pps) => {
    const spsBody = sps.subarray(4); // Skip NAL header (start code or raw)
    const ppsBody = pps.subarray(4);

    // Check if SPS starts with NAL header bytes or start code
    const spsNoHdr = sps[0] === 0 ? sps.subarray(4) : sps;
    const ppsNoHdr = pps[0] === 0 ? pps.subarray(4) : pps;

    const configSize = 6 + 2 + spsNoHdr.length + 1 + 2 + ppsNoHdr.length;
    const buf = Buffer.alloc(configSize);
    let offset = 0;

    buf[offset++] = 0x01; // configurationVersion
    buf[offset++] = spsNoHdr[1]; // AVCProfileIndication (from SPS[1])
    buf[offset++] = spsNoHdr[2]; // profile_compatibility
    buf[offset++] = spsNoHdr[3]; // AVCLevelIndication (from SPS[3])
    buf[offset++] = 0xFF; // lengthSizeMinusOne = 3 (4-byte NAL length) + reserved bits
    buf[offset++] = 0xE1; // numOfSequenceParameterSets = 1 + reserved bits
    buf.writeUInt16BE(spsNoHdr.length, offset); offset += 2;
    spsNoHdr.copy(buf, offset); offset += spsNoHdr.length;
    buf[offset++] = 0x01; // numOfPictureParameterSets = 1
    buf.writeUInt16BE(ppsNoHdr.length, offset); offset += 2;
    ppsNoHdr.copy(buf, offset);

    return buf;
  };

  /**
   * Build FLV video tag body for a single NAL unit
   * @param {Buffer} nalu - Raw NAL unit (with NAL header byte)
   * @param {boolean} isKeyframe
   * @param {number} compositionTime
   * @returns {Buffer}
   */
  _buildVideoNaluPayload = (nalu, isKeyframe, compositionTime) => {
    // FLV video tag body:
    // [0]: frameType(4) | codecId(4)
    // [1]: AVCPacketType (0=seq header, 1=NALU)
    // [2-4]: compositionTime (3 bytes, big-endian signed)
    // [5-8]: NAL length (4 bytes)
    // [9..]: NAL data

    const headerSize = 5 + 4;
    const buf = Buffer.alloc(headerSize + nalu.length);

    buf[0] = (isKeyframe ? FLV_FRAME_KEY : FLV_FRAME_INTER) << 4 | FLV_CODEC_ID_H264;
    buf[1] = FLV_AVC_NALU;
    buf[2] = (compositionTime >> 16) & 0xFF;
    buf[3] = (compositionTime >> 8) & 0xFF;
    buf[4] = compositionTime & 0xFF;
    buf.writeUInt32BE(nalu.length, 5);
    nalu.copy(buf, 9);

    return buf;
  };

  /**
   * Build FLV video tag body for multiple NAL units
   * @param {Buffer[]} nalus
   * @param {boolean} isKeyframe
   * @param {number} compositionTime
   * @returns {Buffer}
   */
  _buildVideoMultiNaluPayload = (nalus, isKeyframe, compositionTime) => {
    let totalNaluSize = 0;
    for (const nalu of nalus) {
      totalNaluSize += 4 + nalu.length;
    }

    const buf = Buffer.alloc(5 + totalNaluSize);
    buf[0] = (isKeyframe ? FLV_FRAME_KEY : FLV_FRAME_INTER) << 4 | FLV_CODEC_ID_H264;
    buf[1] = FLV_AVC_NALU;
    buf[2] = (compositionTime >> 16) & 0xFF;
    buf[3] = (compositionTime >> 8) & 0xFF;
    buf[4] = compositionTime & 0xFF;

    let offset = 5;
    for (const nalu of nalus) {
      buf.writeUInt32BE(nalu.length, offset);
      offset += 4;
      nalu.copy(buf, offset);
      offset += nalu.length;
    }

    return buf;
  };

  /**
   * Create AVPacket for video header (AVCDecoderConfigurationRecord)
   * @param {Buffer} configRecord
   * @param {number} timestamp
   * @returns {AVPacket}
   */
  _createVideoHeaderPacket = (configRecord, timestamp) => {
    const pkt = new AVPacket();
    pkt.codec_type = FLV_VIDEO_TYPE;
    pkt.codec_id = FLV_CODEC_ID_H264;
    pkt.flags = 2; // video header
    pkt.pts = timestamp;
    pkt.dts = timestamp;

    // FLV body: [0x17][0x00][0x00 0x00 0x00][configRecord]
    pkt.data = Buffer.alloc(5 + configRecord.length);
    pkt.data[0] = (FLV_FRAME_KEY << 4) | FLV_CODEC_ID_H264;
    pkt.data[1] = FLV_AVC_SEQUENCE_HEADER;
    pkt.data[2] = 0;
    pkt.data[3] = 0;
    pkt.data[4] = 0;
    configRecord.copy(pkt.data, 5);
    pkt.size = pkt.data.length;

    return pkt;
  };

  /**
   * Create AVPacket for video NALU
   * @param {Buffer} flvBody - FLV video tag body
   * @param {boolean} isKeyframe
   * @param {number} timestamp
   * @returns {AVPacket}
   */
  _createVideoNalPacket = (flvBody, isKeyframe, timestamp) => {
    const pkt = new AVPacket();
    pkt.codec_type = FLV_VIDEO_TYPE;
    pkt.codec_id = FLV_CODEC_ID_H264;
    pkt.flags = isKeyframe ? 3 : 4; // 3=keyframe, 4=inter frame
    pkt.pts = timestamp;
    pkt.dts = timestamp;
    pkt.data = flvBody;
    pkt.size = flvBody.length;
    return pkt;
  };
}

// ═══════════════════════════════════════════
// H.265/HEVC Depayloader (RFC 7798)
// ═══════════════════════════════════════════

class H265Depayloader extends TrackDepayloader {
  /**
   * @param {number} payloadType
   * @param {number} clockRate
   * @param {{[key: string]: string}} [fmtp]
   */
  constructor(payloadType, clockRate, fmtp) {
    super(payloadType, clockRate);
    this.fmtp = fmtp || {};
    this.vps = null;
    this.sps = null;
    this.pps = null;
    this.hevcConfigRecord = null;
    this.headerEmitted = false;

    // FU reassembly state
    this.fuStarted = false;
    /** @type {Buffer[]} */
    this.fuBuffers = [];
    this.fuTimestamp = 0;

    this._initFromFmtp();
  }

  _initFromFmtp = () => {
    const sprop = this.fmtp["sprop-vps"];
    // H.265 params may come as sprop-vps, sprop-sps, sprop-pps
    if (this.fmtp["sprop-sps"]) {
      this.sps = Buffer.from(this.fmtp["sprop-sps"], "base64");
    }
    if (this.fmtp["sprop-pps"]) {
      this.pps = Buffer.from(this.fmtp["sprop-pps"], "base64");
    }
    if (this.fmtp["sprop-vps"]) {
      this.vps = Buffer.from(this.fmtp["sprop-vps"], "base64");
    }
  };

  /**
   * Get H.265 NAL unit type from 2-byte payload header.
   * Type is in bits 1-6 of first byte.
   * @param {Buffer} payload
   * @returns {number}
   */
  static getH265NalType = (payload) => {
    return (payload[0] >> 1) & 0x3F;
  };

  /**
   * Check if H.265 NAL type is a keyframe (IRAP)
   * @param {number} nalType
   * @returns {boolean}
   */
  static isKeyframe = (nalType) => {
    return nalType >= H265_NAL_TYPE_IDR_W_RADL && nalType <= H265_NAL_TYPE_IDR_N_LP;
  };

  /**
   * Check if H.265 NAL type is VCL (actual video data)
   * @param {number} nalType
   * @returns {boolean}
   */
  static isVcl = (nalType) => {
    return nalType <= 31;
  };

  /**
   * @param {import("./rtp.js").RtpPacket} rtpPacket
   * @returns {AVPacket[]}
   */
  feed = (rtpPacket) => {
    /** @type {AVPacket[]} */
    const packets = [];
    const payload = rtpPacket.payload;

    if (payload.length < 2) {
      return packets;
    }

    if (this.checkSeqGap(rtpPacket.sequenceNumber) && this.fuStarted) {
      logger.debug("H265: seq gap during FU, discarding partial frame");
      this.fuStarted = false;
      this.fuBuffers = [];
    }

    const nalType = H265Depayloader.getH265NalType(payload);

    if (nalType < H265_NAL_TYPE_AP) {
      // Single NAL Unit
      packets.push(...this._handleSingleNal(payload, rtpPacket));
    } else if (nalType === H265_NAL_TYPE_AP) {
      // Aggregation Packet
      packets.push(...this._handleAp(payload, rtpPacket));
    } else if (nalType === H265_NAL_TYPE_FU) {
      const fuResult = this._handleFu(payload, rtpPacket);
      if (fuResult) {
        packets.push(...fuResult);
      }
    }

    return packets;
  };

  _handleSingleNal = (payload, rtpPacket) => {
    /** @type {AVPacket[]} */
    const packets = [];
    const nalType = H265Depayloader.getH265NalType(payload);

    if (nalType === H265_NAL_TYPE_VPS) {
      this.vps = Buffer.from(payload);
      return packets;
    }
    if (nalType === H265_NAL_TYPE_SPS) {
      this.sps = Buffer.from(payload);
      return packets;
    }
    if (nalType === H265_NAL_TYPE_PPS) {
      this.pps = Buffer.from(payload);
      return packets;
    }

    if (H265Depayloader.isVcl(nalType)) {
      const isKeyframe = H265Depayloader.isKeyframe(nalType);
      const data = this._buildH265VideoNaluPayload(payload, isKeyframe, 0);
      packets.push(this._createVideoNalPacket(data, isKeyframe, rtpPacket.timestamp));
    }

    return packets;
  };

  _handleAp = (payload, rtpPacket) => {
    /** @type {AVPacket[]} */
    const packets = [];
    let offset = 2; // Skip payload header
    /** @type {Buffer[]} */
    const vclNalus = [];

    while (offset + 2 <= payload.length) {
      const naluSize = payload.readUInt16BE(offset);
      offset += 2;
      if (offset + naluSize > payload.length) {
        break;
      }
      const nalu = payload.subarray(offset, offset + naluSize);
      offset += naluSize;

      const nalType = H265Depayloader.getH265NalType(nalu);
      if (nalType === H265_NAL_TYPE_VPS) {
        this.vps = Buffer.from(nalu);
      } else if (nalType === H265_NAL_TYPE_SPS) {
        this.sps = Buffer.from(nalu);
      } else if (nalType === H265_NAL_TYPE_PPS) {
        this.pps = Buffer.from(nalu);
      } else if (H265Depayloader.isVcl(nalType)) {
        vclNalus.push(nalu);
      }
    }

    if (vclNalus.length > 0) {
      const isKeyframe = vclNalus.some((n) => H265Depayloader.isKeyframe(H265Depayloader.getH265NalType(n)));
      const data = this._buildH265MultiNaluPayload(vclNalus, isKeyframe, 0);
      packets.push(this._createVideoNalPacket(data, isKeyframe, rtpPacket.timestamp));
    }

    return packets;
  };

  _handleFu = (payload, rtpPacket) => {
    if (payload.length < 3) {
      return null;
    }

    const fuHeader = payload[2];
    const startBit = (fuHeader >> 7) & 0x01;
    const endBit = (fuHeader >> 6) & 0x01;
    const fuType = fuHeader & 0x3F;

    const fuPayload = payload.subarray(3);

    if (startBit) {
      this.fuStarted = true;
      this.fuTimestamp = rtpPacket.timestamp;
      // Reconstruct NAL header: replace type in payload header with fuType
      const nalHeader = Buffer.alloc(2);
      // F(1) | Type(6) | LayerId(6) | TID(3)
      nalHeader[0] = (payload[0] & 0x81) | (fuType << 1);
      nalHeader[1] = payload[1];
      this.fuBuffers = [nalHeader];
      if (fuPayload.length > 0) {
        this.fuBuffers.push(Buffer.from(fuPayload));
      }
      return null;
    }

    if (!this.fuStarted) {
      return null;
    }

    if (rtpPacket.timestamp !== this.fuTimestamp) {
      this.fuStarted = false;
      this.fuBuffers = [];
      return null;
    }

    if (endBit) {
      if (fuPayload.length > 0) {
        this.fuBuffers.push(Buffer.from(fuPayload));
      }
      const completeNal = Buffer.concat(this.fuBuffers);
      this.fuStarted = false;
      this.fuBuffers = [];

      const isKeyframe = H265Depayloader.isKeyframe(fuType);
      const data = this._buildH265VideoNaluPayload(completeNal, isKeyframe, 0);
      return [this._createVideoNalPacket(data, isKeyframe, this.fuTimestamp)];
    }

    if (fuPayload.length > 0) {
      this.fuBuffers.push(Buffer.from(fuPayload));
    }
    return null;
  };

  /**
   * Build Enhanced FLV video tag body for H.265 NAL unit
   * Uses ExHeader format: (0x80|frameType) << 4 | packetType, fourcc "hvc1"
   * @param {Buffer} nalu
   * @param {boolean} isKeyframe
   * @param {number} compositionTime
   * @returns {Buffer}
   */
  _buildH265VideoNaluPayload = (nalu, isKeyframe, compositionTime) => {
    const headerSize = 5 + 4; // exHeader(1) + packetType(1) + fourcc(4)... actually:
    // Enhanced FLV: [0]=isExHeader<<3|frameType<<4|packetType, [1-4]=fourcc, [5-7]=cts, [8-11]=naluLength, [12..]=nalu
    // Wait, let me use the standard enhanced FLV format
    // Byte 0: (frameType & 0x07) << 4 | (isExHeader << 3) | (packetType & 0x0F)
    // But actually: isExHeader is bit 3 of the upper nibble
    // Standard: first nibble = frameType|isExHeader, second nibble = packetType

    const buf = Buffer.alloc(8 + 4 + nalu.length);
    // Enhanced FLV ExHeader: byte0 bit3=1 means ex header
    buf[0] = ((isKeyframe ? FLV_FRAME_KEY : FLV_FRAME_INTER) << 4) | 0x80 | 0x01;
    // Wait this is getting confusing. Let me use the format from flv.js:
    // isExHeader = (data[0] >> 4 & 0b1000) !== 0
    // So bit 3 of upper nibble: byte0 = (1<<7) | (frameType<<4) | packetType
    buf[0] = 0x80 | ((isKeyframe ? 1 : 2) << 4) | 1; // isExHeader=1, frameType, CodedFrames=1
    buf.write("hvc1", 1, 4, "ascii"); // fourcc
    buf[5] = (compositionTime >> 16) & 0xFF;
    buf[6] = (compositionTime >> 8) & 0xFF;
    buf[7] = compositionTime & 0xFF;
    buf.writeUInt32BE(nalu.length, 8);
    nalu.copy(buf, 12);

    return buf.subarray(0, 12 + nalu.length);
  };

  _buildH265MultiNaluPayload = (nalus, isKeyframe, compositionTime) => {
    let totalSize = 0;
    for (const nalu of nalus) {
      totalSize += 4 + nalu.length;
    }

    const buf = Buffer.alloc(8 + totalSize);
    buf[0] = 0x80 | ((isKeyframe ? 1 : 2) << 4) | 1;
    buf.write("hvc1", 1, 4, "ascii");
    buf[5] = (compositionTime >> 16) & 0xFF;
    buf[6] = (compositionTime >> 8) & 0xFF;
    buf[7] = compositionTime & 0xFF;

    let offset = 8;
    for (const nalu of nalus) {
      buf.writeUInt32BE(nalu.length, offset);
      offset += 4;
      nalu.copy(buf, offset);
      offset += nalu.length;
    }

    return buf.subarray(0, offset);
  };

  _createVideoNalPacket = (flvBody, isKeyframe, timestamp) => {
    const pkt = new AVPacket();
    pkt.codec_type = FLV_VIDEO_TYPE;
    pkt.codec_id = 0x31637668; // fourcc "hvc1" as uint32
    pkt.flags = isKeyframe ? 3 : 4;
    pkt.pts = timestamp;
    pkt.dts = timestamp;
    pkt.data = flvBody;
    pkt.size = flvBody.length;
    return pkt;
  };
}

// ═══════════════════════════════════════════
// AAC Depayloader (RFC 3640 MPEG4-GENERIC)
// ═══════════════════════════════════════════

class AacDepayloader extends TrackDepayloader {
  /**
   * @param {number} payloadType
   * @param {number} clockRate
   * @param {{[key: string]: string}} [fmtp]
   */
  constructor(payloadType, clockRate, fmtp) {
    super(payloadType, clockRate);
    this.fmtp = fmtp || {};
    this.audioSpecificConfig = null;

    // Parse AudioSpecificConfig from fmtp if available
    if (this.fmtp["config"]) {
      this.audioSpecificConfig = Buffer.from(this.fmtp["config"], "hex");
    }

    this.sizeLength = parseInt(this.fmtp["sizelength"]) || 13;
    this.indexLength = parseInt(this.fmtp["indexlength"]) || 3;
    this.indexDeltaLength = parseInt(this.fmtp["indexdeltalength"]) || 3;
  }

  /**
   * @param {import("./rtp.js").RtpPacket} rtpPacket
   * @returns {AVPacket[]}
   */
  feed = (rtpPacket) => {
    /** @type {AVPacket[]} */
    const packets = [];
    const payload = rtpPacket.payload;

    if (payload.length < 4) {
      return packets;
    }

    // AU Header section
    const auHeadersLengthBits = payload.readUInt16BE(0);
    const auHeadersLengthBytes = Math.ceil(auHeadersLengthBits / 8);
    const auHeaderData = payload.subarray(2, 2 + auHeadersLengthBytes);
    const auDataOffset = 2 + auHeadersLengthBytes;

    // Parse AU headers
    let bitOffset = 0;
    const auSizes = [];
    const auHeadersTotalBits = auHeadersLengthBits;

    while (bitOffset + this.sizeLength <= auHeadersTotalBits) {
      const auSize = readBits(auHeaderData, bitOffset, this.sizeLength);
      auSizes.push(auSize);
      bitOffset += this.sizeLength;
      // Skip AU-index or AU-index-delta
      if (auSizes.length === 1) {
        bitOffset += this.indexLength;
      } else {
        bitOffset += this.indexDeltaLength;
      }
    }

    // Extract AAC frames
    let dataOffset = auDataOffset;
    for (const auSize of auSizes) {
      if (dataOffset + auSize > payload.length) {
        logger.trace("AAC: AU data truncated");
        break;
      }

      const aacFrame = payload.subarray(dataOffset, dataOffset + auSize);
      dataOffset += auSize;

      // Build FLV audio tag body: [soundHeader(1)] [aacPacketType(1)] [aacData]
      const flvBody = Buffer.alloc(2 + aacFrame.length);
      flvBody[0] = (FLV_SOUND_FORMAT_AAC << 4) | (3 << 2) | (1 << 1) | 1; // AAC, 44100, 16-bit, stereo
      flvBody[1] = 1; // AAC raw frame
      aacFrame.copy(flvBody, 2);

      const pkt = new AVPacket();
      pkt.codec_type = FLV_AUDIO_TYPE;
      pkt.codec_id = FLV_SOUND_FORMAT_AAC;
      pkt.flags = 1; // audio
      pkt.pts = rtpPacket.timestamp;
      pkt.dts = rtpPacket.timestamp;
      pkt.data = flvBody;
      pkt.size = flvBody.length;
      packets.push(pkt);
    }

    return packets;
  };
}

// ═══════════════════════════════════════════
// PCMA/PCMU Depayloader (simple pass-through)
// ═══════════════════════════════════════════

class PcmaDepayloader extends TrackDepayloader {
  /**
   * @param {number} payloadType
   * @param {number} clockRate
   * @param {number} soundFormat - FLV sound format (7=PCMA, 8=PCMU)
   */
  constructor(payloadType, clockRate, soundFormat) {
    super(payloadType, clockRate);
    this.soundFormat = soundFormat;
  }

  /**
   * @param {import("./rtp.js").RtpPacket} rtpPacket
   * @returns {AVPacket[]}
   */
  feed = (rtpPacket) => {
    const payload = rtpPacket.payload;
    if (payload.length === 0) {
      return [];
    }

    // FLV audio tag body: [soundHeader(1)] [raw audio data]
    const flvBody = Buffer.alloc(1 + payload.length);
    // soundFormat(4) | soundRate(2) | soundSize(1) | soundType(1)
    // PCMA/PCMU at 8000Hz: rate=0 (closest), size=1 (16-bit), type=0 (mono)
    flvBody[0] = (this.soundFormat << 4) | (0 << 2) | (1 << 1) | 0;
    payload.copy(flvBody, 1);

    const pkt = new AVPacket();
    pkt.codec_type = FLV_AUDIO_TYPE;
    pkt.codec_id = this.soundFormat;
    pkt.flags = 1; // audio
    pkt.pts = rtpPacket.timestamp;
    pkt.dts = rtpPacket.timestamp;
    pkt.data = flvBody;
    pkt.size = flvBody.length;

    return [pkt];
  };
}

// ═══════════════════════════════════════════
// Passthrough Depayloader (fallback)
// ═══════════════════════════════════════════

class PassthroughDepayloader extends TrackDepayloader {
  /**
   * @param {import("./rtp.js").RtpPacket} rtpPacket
   * @returns {AVPacket[]}
   */
  feed = (rtpPacket) => {
    const pkt = new AVPacket();
    pkt.codec_type = 0;
    pkt.flags = 0;
    pkt.pts = rtpPacket.timestamp;
    pkt.dts = rtpPacket.timestamp;
    pkt.data = Buffer.from(rtpPacket.payload);
    pkt.size = rtpPacket.payload.length;
    return [pkt];
  };
}

// ─────────────────────────────────────────
// Bit-reading utility
// ─────────────────────────────────────────

/**
 * Read N bits from a buffer starting at a bit offset.
 * @param {Buffer} buf
 * @param {number} bitOffset - Starting bit position
 * @param {number} bitCount - Number of bits to read (max 32)
 * @returns {number}
 */
function readBits(buf, bitOffset, bitCount) {
  let value = 0;
  for (let i = 0; i < bitCount; i++) {
    const byteIdx = Math.floor((bitOffset + i) / 8);
    const bitIdx = 7 - ((bitOffset + i) % 8);
    if (byteIdx < buf.length) {
      value = (value << 1) | ((buf[byteIdx] >> bitIdx) & 1);
    }
  }
  return value;
}

module.exports = RtpDepayloader;
