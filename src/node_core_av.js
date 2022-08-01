//
//  Created by Mingliang Chen on 17/12/21.
//  illuspas[a]gmail.com
//  Copyright (c) 2018 Nodemedia. All rights reserved.
//

const Bitop = require('./node_core_bitop');
const AAC_SAMPLE_RATE = [
  96000, 88200, 64000, 48000,
  44100, 32000, 24000, 22050,
  16000, 12000, 11025, 8000,
  7350, 0, 0, 0
];

const AAC_CHANNELS = [
  0, 1, 2, 3, 4, 5, 6, 8
];

const AUDIO_CODEC_NAME = [
  '',
  'ADPCM',
  'MP3',
  'LinearLE',
  'Nellymoser16',
  'Nellymoser8',
  'Nellymoser',
  'G711A',
  'G711U',
  '',
  'AAC',
  'Speex',
  '',
  'OPUS',
  'MP3-8K',
  'DeviceSpecific',
  'Uncompressed'
];

const AUDIO_SOUND_RATE = [
  5512, 11025, 22050, 44100
];

const VIDEO_CODEC_NAME = [
  '',
  'Jpeg',
  'Sorenson-H263',
  'ScreenVideo',
  'On2-VP6',
  'On2-VP6-Alpha',
  'ScreenVideo2',
  'H264',
  '',
  '',
  'VP8',
  'VP9',
  'H265'
];

function getObjectType(bitop) {
  let audioObjectType = bitop.read(5);
  if (audioObjectType === 31) {
    audioObjectType = bitop.read(6) + 32;
  }
  return audioObjectType;
}

function getSampleRate(bitop, info) {
  info.sampling_index = bitop.read(4);
  return info.sampling_index == 0x0f ? bitop.read(24) : AAC_SAMPLE_RATE[info.sampling_index];
}

function readAACSpecificConfig(aacSequenceHeader) {
  let info = {};
  let bitop = new Bitop(aacSequenceHeader);
  bitop.read(16);
  info.object_type = getObjectType(bitop);
  info.sample_rate = getSampleRate(bitop, info);
  info.chan_config = bitop.read(4);
  if (info.chan_config < AAC_CHANNELS.length) {
    info.channels = AAC_CHANNELS[info.chan_config];
  }
  info.sbr = -1;
  info.ps = -1;
  if (info.object_type == 5 || info.object_type == 29) {
    if (info.object_type == 29) {
      info.ps = 1;
    }
    info.ext_object_type = 5;
    info.sbr = 1;
    info.sample_rate = getSampleRate(bitop, info);
    info.object_type = getObjectType(bitop);
  }

  return info;
}

function getAACProfileName(info) {
  switch (info.object_type) {
    case 1:
      return 'Main';
    case 2:
      if (info.ps > 0) {
        return 'HEv2';
      }
      if (info.sbr > 0) {
        return 'HE';
      }
      return 'LC';
    case 3:
      return 'SSR';
    case 4:
      return 'LTP';
    case 5:
      return 'SBR';
    default:
      return '';
  }
}

function readH264SpecificConfig(avcSequenceHeader) {
  let info = {};
  let profile_idc, width, height, crop_left, crop_right,
    crop_top, crop_bottom, frame_mbs_only, n, cf_idc,
    num_ref_frames;
  let bitop = new Bitop(avcSequenceHeader);
  bitop.read(48);
  info.width = 0;
  info.height = 0;

  do {
    info.profile = bitop.read(8);
    info.compat = bitop.read(8);
    info.level = bitop.read(8);
    info.nalu = (bitop.read(8) & 0x03) + 1;
    info.nb_sps = bitop.read(8) & 0x1F;
    if (info.nb_sps == 0) {
      break;
    }
    /* nal size */
    bitop.read(16);

    /* nal type */
    if (bitop.read(8) != 0x67) {
      break;
    }
    /* SPS */
    profile_idc = bitop.read(8);

    /* flags */
    bitop.read(8);

    /* level idc */
    bitop.read(8);

    /* SPS id */
    bitop.read_golomb();

    if (profile_idc == 100 || profile_idc == 110 ||
      profile_idc == 122 || profile_idc == 244 || profile_idc == 44 ||
      profile_idc == 83 || profile_idc == 86 || profile_idc == 118) {
      /* chroma format idc */
      cf_idc = bitop.read_golomb();

      if (cf_idc == 3) {

        /* separate color plane */
        bitop.read(1);
      }

      /* bit depth luma - 8 */
      bitop.read_golomb();

      /* bit depth chroma - 8 */
      bitop.read_golomb();

      /* qpprime y zero transform bypass */
      bitop.read(1);

      /* seq scaling matrix present */
      if (bitop.read(1)) {

        for (n = 0; n < (cf_idc != 3 ? 8 : 12); n++) {

          /* seq scaling list present */
          if (bitop.read(1)) {

            /* TODO: scaling_list()
            if (n < 6) {
            } else {
            }
            */
          }
        }
      }
    }

    /* log2 max frame num */
    bitop.read_golomb();

    /* pic order cnt type */
    switch (bitop.read_golomb()) {
      case 0:

        /* max pic order cnt */
        bitop.read_golomb();
        break;

      case 1:

        /* delta pic order alwys zero */
        bitop.read(1);

        /* offset for non-ref pic */
        bitop.read_golomb();

        /* offset for top to bottom field */
        bitop.read_golomb();

        /* num ref frames in pic order */
        num_ref_frames = bitop.read_golomb();

        for (n = 0; n < num_ref_frames; n++) {

          /* offset for ref frame */
          bitop.read_golomb();
        }
    }

    /* num ref frames */
    info.avc_ref_frames = bitop.read_golomb();

    /* gaps in frame num allowed */
    bitop.read(1);

    /* pic width in mbs - 1 */
    width = bitop.read_golomb();

    /* pic height in map units - 1 */
    height = bitop.read_golomb();

    /* frame mbs only flag */
    frame_mbs_only = bitop.read(1);

    if (!frame_mbs_only) {

      /* mbs adaprive frame field */
      bitop.read(1);
    }

    /* direct 8x8 inference flag */
    bitop.read(1);

    /* frame cropping */
    if (bitop.read(1)) {

      crop_left = bitop.read_golomb();
      crop_right = bitop.read_golomb();
      crop_top = bitop.read_golomb();
      crop_bottom = bitop.read_golomb();

    } else {
      crop_left = 0;
      crop_right = 0;
      crop_top = 0;
      crop_bottom = 0;
    }
    info.level = info.level / 10.0;
    info.width = (width + 1) * 16 - (crop_left + crop_right) * 2;
    info.height = (2 - frame_mbs_only) * (height + 1) * 16 - (crop_top + crop_bottom) * 2;

  } while (0);

  return info;
}

function HEVCParsePtl(bitop, hevc, max_sub_layers_minus1) {
  let general_ptl = {};

  general_ptl.profile_space = bitop.read(2);
  general_ptl.tier_flag = bitop.read(1);
  general_ptl.profile_idc = bitop.read(5);
  general_ptl.profile_compatibility_flags = bitop.read(32);
  general_ptl.general_progressive_source_flag = bitop.read(1);
  general_ptl.general_interlaced_source_flag = bitop.read(1);
  general_ptl.general_non_packed_constraint_flag = bitop.read(1);
  general_ptl.general_frame_only_constraint_flag = bitop.read(1);
  bitop.read(32);
  bitop.read(12);
  general_ptl.level_idc = bitop.read(8);

  general_ptl.sub_layer_profile_present_flag = [];
  general_ptl.sub_layer_level_present_flag = [];

  for (let i = 0; i < max_sub_layers_minus1; i++) {
    general_ptl.sub_layer_profile_present_flag[i] = bitop.read(1);
    general_ptl.sub_layer_level_present_flag[i] = bitop.read(1);
  }

  if (max_sub_layers_minus1 > 0) {
    for (let i = max_sub_layers_minus1; i < 8; i++) {
      bitop.read(2);
    }
  }

  general_ptl.sub_layer_profile_space = [];
  general_ptl.sub_layer_tier_flag = [];
  general_ptl.sub_layer_profile_idc = [];
  general_ptl.sub_layer_profile_compatibility_flag = [];
  general_ptl.sub_layer_progressive_source_flag = [];
  general_ptl.sub_layer_interlaced_source_flag = [];
  general_ptl.sub_layer_non_packed_constraint_flag = [];
  general_ptl.sub_layer_frame_only_constraint_flag = [];
  general_ptl.sub_layer_level_idc = [];

  for (let i = 0; i < max_sub_layers_minus1; i++) {
    if (general_ptl.sub_layer_profile_present_flag[i]) {
      general_ptl.sub_layer_profile_space[i] = bitop.read(2);
      general_ptl.sub_layer_tier_flag[i] = bitop.read(1);
      general_ptl.sub_layer_profile_idc[i] = bitop.read(5);
      general_ptl.sub_layer_profile_compatibility_flag[i] = bitop.read(32);
      general_ptl.sub_layer_progressive_source_flag[i] = bitop.read(1);
      general_ptl.sub_layer_interlaced_source_flag[i] = bitop.read(1);
      general_ptl.sub_layer_non_packed_constraint_flag[i] = bitop.read(1);
      general_ptl.sub_layer_frame_only_constraint_flag[i] = bitop.read(1);
      bitop.read(32);
      bitop.read(12);
    }
    if (general_ptl.sub_layer_level_present_flag[i]) {
      general_ptl.sub_layer_level_idc[i] = bitop.read(8);
    }
    else {
      general_ptl.sub_layer_level_idc[i] = 1;
    }
  }
  return general_ptl;
}

function HEVCParseSPS(SPS, hevc) {
  let psps = {};
  let NumBytesInNALunit = SPS.length;
  let NumBytesInRBSP = 0;
  let rbsp_array = [];
  let bitop = new Bitop(SPS);

  bitop.read(1);//forbidden_zero_bit
  bitop.read(6);//nal_unit_type
  bitop.read(6);//nuh_reserved_zero_6bits
  bitop.read(3);//nuh_temporal_id_plus1

  for (let i = 2; i < NumBytesInNALunit; i++) {
    if (i + 2 < NumBytesInNALunit && bitop.look(24) == 0x000003) {
      rbsp_array.push(bitop.read(8));
      rbsp_array.push(bitop.read(8));
      i += 2;
      let emulation_prevention_three_byte = bitop.read(8); /* equal to 0x03 */
    } else {
      rbsp_array.push(bitop.read(8));
    }
  }
  let rbsp = Buffer.from(rbsp_array);
  let rbspBitop = new Bitop(rbsp);
  psps.sps_video_parameter_set_id = rbspBitop.read(4);
  psps.sps_max_sub_layers_minus1 = rbspBitop.read(3);
  psps.sps_temporal_id_nesting_flag = rbspBitop.read(1);
  psps.profile_tier_level = HEVCParsePtl(rbspBitop, hevc, psps.sps_max_sub_layers_minus1);
  psps.sps_seq_parameter_set_id = rbspBitop.read_golomb();
  psps.chroma_format_idc = rbspBitop.read_golomb();
  if (psps.chroma_format_idc == 3) {
    psps.separate_colour_plane_flag = rbspBitop.read(1);
  } else {
    psps.separate_colour_plane_flag = 0;
  }
  psps.pic_width_in_luma_samples = rbspBitop.read_golomb();
  psps.pic_height_in_luma_samples = rbspBitop.read_golomb();
  psps.conformance_window_flag = rbspBitop.read(1);
  psps.conf_win_left_offset = 0;
  psps.conf_win_right_offset = 0;
  psps.conf_win_top_offset = 0;
  psps.conf_win_bottom_offset = 0;
  if (psps.conformance_window_flag) {
    let vert_mult = 1 + (psps.chroma_format_idc < 2);
    let horiz_mult = 1 + (psps.chroma_format_idc < 3);
    psps.conf_win_left_offset = rbspBitop.read_golomb() * horiz_mult;
    psps.conf_win_right_offset = rbspBitop.read_golomb() * horiz_mult;
    psps.conf_win_top_offset = rbspBitop.read_golomb() * vert_mult;
    psps.conf_win_bottom_offset = rbspBitop.read_golomb() * vert_mult;
  }
  // Logger.debug(psps);
  return psps;
}

function readHEVCSpecificConfig(hevcSequenceHeader) {
  let info = {};
  info.width = 0;
  info.height = 0;
  info.profile = 0;
  info.level = 0;
  // let bitop = new Bitop(hevcSequenceHeader);
  // bitop.read(48);
  hevcSequenceHeader = hevcSequenceHeader.slice(5);

  do {
    let hevc = {};
    if (hevcSequenceHeader.length < 23) {
      break;
    }

    hevc.configurationVersion = hevcSequenceHeader[0];
    if (hevc.configurationVersion != 1) {
      break;
    }
    hevc.general_profile_space = (hevcSequenceHeader[1] >> 6) & 0x03;
    hevc.general_tier_flag = (hevcSequenceHeader[1] >> 5) & 0x01;
    hevc.general_profile_idc = hevcSequenceHeader[1] & 0x1F;
    hevc.general_profile_compatibility_flags = (hevcSequenceHeader[2] << 24) | (hevcSequenceHeader[3] << 16) | (hevcSequenceHeader[4] << 8) | hevcSequenceHeader[5];
    hevc.general_constraint_indicator_flags = ((hevcSequenceHeader[6] << 24) | (hevcSequenceHeader[7] << 16) | (hevcSequenceHeader[8] << 8) | hevcSequenceHeader[9]);
    hevc.general_constraint_indicator_flags = (hevc.general_constraint_indicator_flags << 16) | (hevcSequenceHeader[10] << 8) | hevcSequenceHeader[11];
    hevc.general_level_idc = hevcSequenceHeader[12];
    hevc.min_spatial_segmentation_idc = ((hevcSequenceHeader[13] & 0x0F) << 8) | hevcSequenceHeader[14];
    hevc.parallelismType = hevcSequenceHeader[15] & 0x03;
    hevc.chromaFormat = hevcSequenceHeader[16] & 0x03;
    hevc.bitDepthLumaMinus8 = hevcSequenceHeader[17] & 0x07;
    hevc.bitDepthChromaMinus8 = hevcSequenceHeader[18] & 0x07;
    hevc.avgFrameRate = (hevcSequenceHeader[19] << 8) | hevcSequenceHeader[20];
    hevc.constantFrameRate = (hevcSequenceHeader[21] >> 6) & 0x03;
    hevc.numTemporalLayers = (hevcSequenceHeader[21] >> 3) & 0x07;
    hevc.temporalIdNested = (hevcSequenceHeader[21] >> 2) & 0x01;
    hevc.lengthSizeMinusOne = hevcSequenceHeader[21] & 0x03;
    let numOfArrays = hevcSequenceHeader[22];
    let p = hevcSequenceHeader.slice(23);
    for (let i = 0; i < numOfArrays; i++) {
      if (p.length < 3) {
        brak;
      }
      let nalutype = p[0];
      let n = (p[1]) << 8 | p[2];
      // Logger.debug(nalutype, n);
      p = p.slice(3);
      for (let j = 0; j < n; j++) {
        if (p.length < 2) {
          break;
        }
        let k = (p[0] << 8) | p[1];
        // Logger.debug('k', k);
        if (p.length < 2 + k) {
          break;
        }
        p = p.slice(2);
        if (nalutype == 33) {
          //SPS
          let sps = Buffer.alloc(k);
          p.copy(sps, 0, 0, k);
          // Logger.debug(sps, sps.length);
          hevc.psps = HEVCParseSPS(sps, hevc);
          info.profile = hevc.general_profile_idc;
          info.level = hevc.general_level_idc / 30.0;
          info.width = hevc.psps.pic_width_in_luma_samples - (hevc.psps.conf_win_left_offset + hevc.psps.conf_win_right_offset);
          info.height = hevc.psps.pic_height_in_luma_samples - (hevc.psps.conf_win_top_offset + hevc.psps.conf_win_bottom_offset);
        }
        p = p.slice(k);
      }
    }
  } while (0);

  return info;
}

function readAVCSpecificConfig(avcSequenceHeader) {
  let codec_id = avcSequenceHeader[0] & 0x0f;
  if (codec_id == 7) {
    return readH264SpecificConfig(avcSequenceHeader);
  } else if (codec_id == 12) {
    return readHEVCSpecificConfig(avcSequenceHeader);
  }
}


function getAVCProfileName(info) {
  switch (info.profile) {
    case 1:
      return 'Main';
    case 2:
      return 'Main 10';
    case 3:
      return 'Main Still Picture';
    case 66:
      return 'Baseline';
    case 77:
      return 'Main';
    case 100:
      return 'High';
    default:
      return '';
  }
}

module.exports = {
  AUDIO_SOUND_RATE,
  AUDIO_CODEC_NAME,
  VIDEO_CODEC_NAME,
  readAACSpecificConfig,
  getAACProfileName,
  readAVCSpecificConfig,
  getAVCProfileName,
};
