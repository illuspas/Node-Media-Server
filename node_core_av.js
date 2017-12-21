//
//  Created by Mingliang Chen on 17/12/21.
//  illuspas[a]gmail.com
//  Copyright (c) 2017 Nodemedia. All rights reserved.
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
  "MP3",
  "LinearLE",
  "Nellymoser16",
  "Nellymoser8",
  "Nellymoser",
  "G711A",
  "G711U",
  "",
  "AAC",
  "Speex",
  "",
  "",
  "MP3-8K",
  "DeviceSpecific",
  "Uncompressed"
];

const AUDIO_SOUND_RATE = [
  5512, 11025, 22050, 44100
];

const VIDEO_CODEC_NAME = [
  "",
  "Jpeg",
  "Sorenson-H263",
  "ScreenVideo",
  "On2-VP6",
  "On2-VP6-Alpha",
  "ScreenVideo2",
  "H264",
  "",
  "",
  "",
  "",
  "H265"
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
      return "Main";
    case 2:
      if (info.ps > 0) {
        return "HEv2";
      }
      if (info.sbr > 0) {
        return "HE";
      }
      return "LC";
    case 3:
      return "SSR";
    case 4:
      return "LTP";
    case 5:
      return "SBR";
    default:
      return "";
  }
}

function readAVCSpecificConfig(avcSequenceHeader) {
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

        for (n = 0; n < (cf_idc != 3 ? u8 : u12); n++) {

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

    info.width = (width + 1) * 16 - (crop_left + crop_right) * 2;
    info.height = (2 - frame_mbs_only) * (height + 1) * 16 - (crop_top + crop_bottom) * 2;

  } while (0);

  return info;
}

function getAVCProfileName(info) {
  switch (info.profile) {
      case 66:
          return "Baseline";
      case 77:
          return "Main";
      case 100:
          return "High";
      default:
          return "";
  }
}

function readHEVCSpecificConfig(hevcSequenceHeader) {
  let info = {};
  info.width = 0;
  info.height = 0;
  info.profile = 0;
  info.compat = 0;
  info.level = 0;
  return info;
}

module.exports = {
  AUDIO_SOUND_RATE,
  AUDIO_CODEC_NAME,
  VIDEO_CODEC_NAME,
  readAACSpecificConfig,
  getAACProfileName,
  readAVCSpecificConfig,
  getAVCProfileName
};