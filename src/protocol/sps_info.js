// @ts-check
//
//  Created by Chen Mingliang on 26/08/24.
//  illuspas@msn.com
//  Copyright (c) 2026 NodeMedia. All rights reserved.
//

/**
 * SPS bitstream reader over an RBSP buffer (emulation prevention removed).
 * Supports unsigned/exp-golomb (ue/se) reads per ITU-T H.264/H.265.
 * @class
 */
class BitReader {
  /**
   * @param {Buffer} rbsp
   */
  constructor(rbsp) {
    this.rbsp = rbsp;
    this.bitPos = 0;
  }

  /**
   * Read n unsigned bits.
   * @param {number} n - Bit count (max 32)
   * @returns {number}
   */
  readBits = (n) => {
    let value = 0;
    for (let i = 0; i < n; i++) {
      const byteIdx = this.bitPos >> 3;
      if (byteIdx >= this.rbsp.length) {
        this.bitPos += n - i;
        return value;
      }
      const bit = (this.rbsp[byteIdx] >> (7 - (this.bitPos & 7))) & 1;
      value = (value << 1) | bit;
      this.bitPos++;
    }
    return value;
  };

  /**
   * Read one flag bit.
   * @returns {number} 0 or 1
   */
  readFlag = () => {
    return this.readBits(1);
  };

  /**
   * Read unsigned exp-golomb code.
   * @returns {number}
   */
  readUE = () => {
    let leadingZeroBits = 0;
    while (this.readFlag() === 0 && leadingZeroBits < 32) {
      leadingZeroBits++;
    }
    return (1 << leadingZeroBits) - 1 + this.readBits(leadingZeroBits);
  };

  /**
   * Read signed exp-golomb code.
   * @returns {number}
   */
  readSE = () => {
    const codeNum = this.readUE();
    return codeNum % 2 === 0 ? -(codeNum / 2) : (codeNum + 1) / 2;
  };
}

/**
 * Remove emulation prevention bytes (0x000003) from a NAL unit.
 * @param {Buffer} nalu
 * @returns {Buffer}
 */
function nalToRbsp(nalu) {
  const rbsp = Buffer.alloc(nalu.length);
  let len = 0;
  for (let i = 0; i < nalu.length; i++) {
    if (i >= 2 && nalu[i - 2] === 0 && nalu[i - 1] === 0 && nalu[i] === 3) {
      continue;
    }
    rbsp[len++] = nalu[i];
  }
  return rbsp.subarray(0, len);
}

/**
 * Skip an H.264 scaling list (spec subclause 7.3.2.1.1.1).
 * @param {BitReader} reader
 * @param {number} size
 */
function skipScalingList(reader, size) {
  let lastScale = 8;
  let nextScale = 8;
  for (let j = 0; j < size; j++) {
    if (nextScale !== 0) {
      const deltaScale = reader.readSE();
      nextScale = (lastScale + deltaScale + 256) % 256;
    }
    lastScale = nextScale === 0 ? lastScale : nextScale;
  }
}

/**
 * Parse H.264 SPS for pixel dimensions (ITU-T H.264, 7.3.2.1.1).
 * @param {Buffer} sps - Raw SPS NAL unit (no start code, with NAL header byte)
 * @returns {{width: number, height: number}|null} Null if parsing fails
 */
function parseH264Sps(sps) {
  try {
    const r = new BitReader(nalToRbsp(sps));
    r.readBits(8); // nal_unit_header
    const profileIdc = r.readBits(8);
    r.readBits(8); // constraint flags + reserved
    r.readBits(8); // level_idc
    r.readUE(); // seq_parameter_set_id

    let chromaFormatIdc = 1;
    if ([100, 110, 122, 244, 44, 83, 86, 118, 128, 138, 139, 134, 135].includes(profileIdc)) {
      chromaFormatIdc = r.readUE();
      if (chromaFormatIdc === 3) {
        r.readFlag(); // separate_colour_plane_flag
      }
      r.readUE(); // bit_depth_luma_minus8
      r.readUE(); // bit_depth_chroma_minus8
      r.readFlag(); // qpprime_y_zero_transform_bypass_flag
      if (r.readFlag()) { // seq_scaling_matrix_present_flag
        const listCount = chromaFormatIdc !== 3 ? 8 : 12;
        for (let i = 0; i < listCount; i++) {
          if (r.readFlag()) { // seq_scaling_list_present_flag[i]
            skipScalingList(r, i < 6 ? 16 : 64);
          }
        }
      }
    }

    r.readUE(); // log2_max_frame_num_minus4
    const picOrderCntType = r.readUE();
    if (picOrderCntType === 0) {
      r.readUE(); // log2_max_pic_order_cnt_lsb_minus4
    } else if (picOrderCntType === 1) {
      r.readFlag(); // delta_pic_order_always_zero_flag
      r.readSE(); // offset_for_non_ref_pic
      r.readSE(); // offset_for_top_to_bottom_field
      const cycleCount = r.readUE();
      for (let i = 0; i < cycleCount; i++) {
        r.readSE();
      }
    }
    r.readUE(); // max_num_ref_frames
    r.readFlag(); // gaps_in_frame_num_value_allowed_flag
    const picWidthInMbs = r.readUE() + 1;
    const picHeightInMapUnits = r.readUE() + 1;
    const frameMbsOnlyFlag = r.readFlag();
    if (!frameMbsOnlyFlag) {
      r.readFlag(); // mb_adaptive_frame_field_flag
    }
    r.readFlag(); // direct_8x8_inference_flag

    let cropLeft = 0;
    let cropRight = 0;
    let cropTop = 0;
    let cropBottom = 0;
    if (r.readFlag()) { // frame_cropping_flag
      cropLeft = r.readUE();
      cropRight = r.readUE();
      cropTop = r.readUE();
      cropBottom = r.readUE();
    }

    const separatePlane = chromaFormatIdc === 3;
    let subWidthC = 1;
    let cropUnitX = 1;
    let cropUnitY = 2 - frameMbsOnlyFlag;
    if (chromaFormatIdc === 1 || chromaFormatIdc === 2) {
      subWidthC = 2;
      cropUnitX = 2;
      cropUnitY = 2 * (2 - frameMbsOnlyFlag);
    } else if (chromaFormatIdc === 3 && !separatePlane) {
      subWidthC = 1;
      cropUnitX = 1;
      cropUnitY = 1 * (2 - frameMbsOnlyFlag);
    }

    const width = picWidthInMbs * 16 - cropUnitX * (cropLeft + cropRight);
    const height = (2 - frameMbsOnlyFlag) * picHeightInMapUnits * 16 - cropUnitY * (cropTop + cropBottom);
    if (width <= 0 || height <= 0) {
      return null;
    }
    return { width, height };
  } catch {
    return null;
  }
}

/**
 * Skip an H.265 profile_tier_level structure (ITU-T H.265, 7.3.3).
 * @param {BitReader} r
 * @param {number} maxSubLayersMinus1
 */
function skipProfileTierLevel(r, maxSubLayersMinus1) {
  r.readBits(96); // general profile_space/tier/idc + compat flags + constraint flags + level_idc
  const subLayerPresent = [];
  for (let i = 0; i < maxSubLayersMinus1; i++) {
    subLayerPresent.push([r.readFlag(), r.readFlag()]); // profile_present, level_present
  }
  if (maxSubLayersMinus1 > 0) {
    r.readBits(2 * (8 - maxSubLayersMinus1)); // reserved_zero_2bits
  }
  for (let i = 0; i < maxSubLayersMinus1; i++) {
    if (subLayerPresent[i][0]) {
      r.readBits(88); // sub-layer profile (2+1+5+32+48 bits)
    }
    if (subLayerPresent[i][1]) {
      r.readBits(8); // sub-layer level_idc
    }
  }
}

/**
 * Parse H.265 SPS for pixel dimensions (ITU-T H.265, 7.3.2.2.1).
 * @param {Buffer} sps - Raw SPS NAL unit (no start code, with 2-byte NAL header)
 * @returns {{width: number, height: number}|null} Null if parsing fails
 */
function parseH265Sps(sps) {
  try {
    const r = new BitReader(nalToRbsp(sps));
    r.readBits(16); // nal_unit_header
    r.readBits(4); // sps_video_parameter_set_id
    const maxSubLayersMinus1 = r.readBits(3);
    r.readFlag(); // sps_temporal_id_nested_flag
    skipProfileTierLevel(r, maxSubLayersMinus1);

    r.readUE(); // sps_seq_parameter_set_id
    const chromaFormatIdc = r.readUE();
    if (chromaFormatIdc === 3) {
      r.readFlag(); // separate_colour_plane_flag
    }
    const picWidthInLumaSamples = r.readUE();
    const picHeightInLumaSamples = r.readUE();

    let confWinLeft = 0;
    let confWinRight = 0;
    let confWinTop = 0;
    let confWinBottom = 0;
    if (r.readFlag()) { // conformance_window_flag
      confWinLeft = r.readUE();
      confWinRight = r.readUE();
      confWinTop = r.readUE();
      confWinBottom = r.readUE();
    }

    let subWidthC = 1;
    let subHeightC = 1;
    if (chromaFormatIdc === 1) { // 4:2:0
      subWidthC = 2;
      subHeightC = 2;
    } else if (chromaFormatIdc === 2) { // 4:2:2
      subWidthC = 2;
      subHeightC = 1;
    }

    const width = picWidthInLumaSamples - subWidthC * (confWinLeft + confWinRight);
    const height = picHeightInLumaSamples - subHeightC * (confWinTop + confWinBottom);
    if (width <= 0 || height <= 0) {
      return null;
    }
    return { width, height };
  } catch {
    return null;
  }
}

module.exports = { parseH264Sps, parseH265Sps };
