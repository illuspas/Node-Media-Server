// @ts-check
//
//  Created by Chen Mingliang on 26/10/15.
//  illuspas@msn.com
//  Copyright (c) 2026 NodeMedia. All rights reserved.
//

const assert = require("node:assert/strict");
const test = require("node:test");
const Flv = require("../src/protocol/flv.js");
const BroadcastServer = require("../src/server/broadcast_server.js");

const FLV_MEDIA_TYPE_AUDIO = 8;

/**
 * Parse an audio tag body the way the ingest paths (RTMP message / FLV tag) do.
 * @param {Buffer} data - Audio tag body bytes
 * @returns {object} AVPacket produced by Flv.parserTag
 */
function parseAudio(data) {
  return Flv.parserTag(FLV_MEDIA_TYPE_AUDIO, 0, data.length, data);
}

test("legacy AAC sequence header is flagged as audio header", () => {
  // SoundFormat=10 (AAC), AACPacketType=0 (sequence header)
  const packet = parseAudio(Buffer.from([0xaf, 0x00, 0x12, 0x10]));
  assert.equal(packet.flags, 0);
});

test("legacy AAC raw frame is flagged as regular audio", () => {
  // SoundFormat=10 (AAC), AACPacketType=1 (raw)
  const packet = parseAudio(Buffer.from([0xaf, 0x01, 0x21, 0x00, 0x34]));
  assert.equal(packet.flags, 1);
});

test("enhanced RTMP audio sequence header is flagged as audio header", () => {
  // SoundFormat=9 (ExHeader), AudioPacketType=0 (SequenceStart), FourCC=mp4a
  const packet = parseAudio(Buffer.from([0x90, 0x6d, 0x70, 0x34, 0x61, 0x12, 0x10]));
  assert.equal(packet.flags, 0);
});

test("enhanced RTMP coded frames are flagged as regular audio", () => {
  // SoundFormat=9 (ExHeader), AudioPacketType=1 (CodedFrames), FourCC=mp4a
  const packet = parseAudio(Buffer.from([0x91, 0x6d, 0x70, 0x34, 0x61, 0x21, 0x00]));
  assert.equal(packet.flags, 1);
});

test("multitrack OneTrack sequence header is flagged as audio header (issue #707)", () => {
  // Real OBS capture: 0x95 (ExHeader|Multitrack), 0x00 (OneTrack|SequenceStart),
  // FourCC=mp4a, trackIndex=1, AAC AudioSpecificConfig (AAC-LC, 44.1kHz, stereo)
  const packet = parseAudio(Buffer.from([0x95, 0x00, 0x6d, 0x70, 0x34, 0x61, 0x01, 0x12, 0x10]));
  assert.equal(packet.flags, 0);
});

test("multitrack ManyTracksManyTracks sequence header is flagged as audio header", () => {
  // 0x95 (ExHeader|Multitrack), 0x10 (ManyTracksManyTracks|SequenceStart), FourCC=Opus,
  // then trackIndex=2, length=2, OpusHead
  const packet = parseAudio(Buffer.from([0x95, 0x10, 0x4f, 0x70, 0x75, 0x73, 0x02, 0x00, 0x02, 0x79, 0x0f]));
  assert.equal(packet.flags, 0);
});

test("multitrack ManyTracksOneTrack sequence header is flagged as audio header", () => {
  // 0x95 (ExHeader|Multitrack), 0x20 (ManyTracksOneTrack|SequenceStart), FourCC=mp4a,
  // then trackIndex=0, AAC AudioSpecificConfig
  const packet = parseAudio(Buffer.from([0x95, 0x20, 0x6d, 0x70, 0x34, 0x61, 0x00, 0x12, 0x10]));
  assert.equal(packet.flags, 0);
});

test("multitrack coded frames are still flagged as regular audio", () => {
  // 0x95 (ExHeader|Multitrack), 0x01 (OneTrack|CodedFrames), FourCC=mp4a, trackIndex=1, AAC frame
  const packet = parseAudio(Buffer.from([0x95, 0x01, 0x6d, 0x70, 0x34, 0x61, 0x01, 0x21, 0x00, 0x34]));
  assert.equal(packet.flags, 1);
});

test("multitrack sequence end is not flagged as audio header", () => {
  // 0x95 (ExHeader|Multitrack), 0x02 (OneTrack|SequenceEnd), FourCC=mp4a, trackIndex=1
  const packet = parseAudio(Buffer.from([0x95, 0x02, 0x6d, 0x70, 0x34, 0x61, 0x01]));
  assert.equal(packet.flags, 1);
});

test("truncated multitrack tag does not crash or mis-flag the packet", () => {
  // 0x95 alone is malformed; the parser must not read past the buffer
  const packet = parseAudio(Buffer.from([0x95]));
  assert.ok(Number.isInteger(packet.flags));
});

test("broadcast caches a multitrack sequence header for late subscribers (issue #707)", () => {
  const broadcast = new BroadcastServer("/live/multitrack");
  const packet = parseAudio(Buffer.from([0x95, 0x00, 0x6d, 0x70, 0x34, 0x61, 0x01, 0x12, 0x10]));
  broadcast.broadcastMessage(packet);
  assert.ok(broadcast.flvAudioHeaders.has("track:1"), "FLV multitrack header must be cached under its track key");
  assert.ok(broadcast.rtmpAudioHeaders.has("track:1"), "RTMP multitrack header must be cached under its track key");
  assert.equal(broadcast.flvGopCache, null, "sequence header must not pollute the GOP cache");
});

test("broadcast keeps one audio header per track for multitrack streams", () => {
  const broadcast = new BroadcastServer("/live/twotracks");
  // track 0: plain legacy AAC sequence header (44.1kHz)
  broadcast.broadcastMessage(parseAudio(Buffer.from([0xaf, 0x00, 0x12, 0x10])));
  // track 1: multitrack-wrapped AAC sequence header (48kHz)
  broadcast.broadcastMessage(parseAudio(Buffer.from([0x95, 0x00, 0x6d, 0x70, 0x34, 0x61, 0x01, 0x11, 0x90])));
  assert.equal(broadcast.flvAudioHeaders.size, 2, "both tracks' headers must be cached independently");
  assert.equal(broadcast.rtmpAudioHeaders.size, 2);

  // a late subscriber replay must receive both headers
  const replayed = [];
  broadcast.subscribers.set("player", {
    id: "player",
    ip: "9.9.9.9:1",
    protocol: "flv",
    streamPath: "/live/twotracks",
    streamQuery: {},
    sendBuffer: (buffer) => replayed.push(buffer)
  });
  broadcast.flvAudioHeaders.forEach((header) => broadcast.subscribers.get("player").sendBuffer(header));
  assert.equal(replayed.length, 2, "late joiner gets both audio track configs");

  // same-track re-sent headers replace the previous one instead of growing the cache
  broadcast.broadcastMessage(parseAudio(Buffer.from([0xaf, 0x00, 0x13, 0x10])));
  assert.equal(broadcast.flvAudioHeaders.size, 2, "same track overwrites its own slot");
});
