// @ts-check
//
//  Created by Chen Mingliang on 23/12/01.
//  illuspas@msn.com
//  Copyright (c) 2023 NodeMedia. All rights reserved.
//

class AVPacket {
  /** Audio sequence header, e.g. AAC AudioSpecificConfig or enhanced-RTMP AudioPacketTypeSequenceStart */
  static FLAG_AUDIO_SEQUENCE_HEADER = 0;
  /** Coded audio frame */
  static FLAG_AUDIO_FRAME = 1;
  /** Video sequence header, e.g. AVC/HEVC decoder configuration record */
  static FLAG_VIDEO_SEQUENCE_HEADER = 2;
  /** Video key frame (seekable) */
  static FLAG_VIDEO_KEYFRAME = 3;
  /** Video inter frame (non-seekable) */
  static FLAG_VIDEO_INTER_FRAME = 4;
  /** AMF script data, e.g. onMetaData */
  static FLAG_METADATA = 5;
  /** Video metadata, e.g. enhanced-RTMP VideoPacketTypeMetadata (HDR) */
  static FLAG_VIDEO_METADATA = 6;

  constructor() {
    this.codec_id = 0;
    this.codec_type = 0;
    this.duration = 0;
    this.flags = 0;
    this.pts = 0;
    this.dts = 0;
    this.size = 0;
    this.offset = 0;
    this.data = Buffer.alloc(0);
  }
}

module.exports = AVPacket;
