// @ts-check
//
//  Created by Chen Mingliang on 25/04/24.
//  illuspas@msn.com
//  Copyright (c) 2025 NodeMedia. All rights reserved.
//

const RtspClient = require("./src/protocol/rtsp.js");
const SdpParser = require("./src/protocol/sdp.js");
const RtpParser = require("./src/protocol/rtp.js");
const RtcpParser = require("./src/protocol/rtcp.js");
const RtpDepayloader = require("./src/protocol/rtp_depayloader.js");

const RTSP_URL = "rtsp://192.168.0.2/live/bbb";

/**
 *
 */
async function main() {
  const client = new RtspClient();
  const depayloader = new RtpDepayloader();

  // Statistics
  let rtpPacketCount = 0;
  let avPacketCount = 0;
  let videoKeyframes = 0;
  let videoFrames = 0;
  let videoHeaderEmitted = false;
  let audioFrames = 0;

  // Channel -> (payloadType, trackInfo) mapping
  /** @type {Map<number, {pt: number, codec: string, type: string}>} */
  const channelMap = new Map();

  client.onRtpDataCallback = (channel, data) => {
    // RTCP?
    if (RtcpParser.isRtcp(data)) {
      const rtcpPackets = RtcpParser.parseCompound(data);
      for (const pkt of rtcpPackets) {
        if (pkt.type === 200) {
          const sr = /** @type {import("./src/protocol/rtcp.js").RtcpSenderReport} */ (pkt);
          console.log(`[RTCP] SR: ssrc=0x${sr.ssrc.toString(16)} rtpTs=${sr.rtpTimestamp} pktCount=${sr.senderPacketCount}`);
        }
      }
      return;
    }

    // Parse RTP
    const rtp = RtpParser.parse(data);
    if (!rtp) {
      return;
    }

    rtpPacketCount++;

    // Feed to depayloader
    const avPackets = depayloader.feed(rtp);

    for (const pkt of avPackets) {
      avPacketCount++;

      if (pkt.codec_type === 9) {
        // Video
        if (pkt.flags === 2) {
          videoHeaderEmitted = true;
          console.log(`[DEPAY] VIDEO HEADER: size=${pkt.size} bytes (AVCDecoderConfigurationRecord)`);
          // Parse SPS dimensions from config
          if (pkt.data.length > 13) {
            const numSPS = pkt.data[12] & 0x1F;
            if (numSPS > 0) {
              const spsLen = pkt.data.readUInt16BE(13);
              const spsData = pkt.data.subarray(15, 15 + spsLen);
              console.log(`          SPS: ${spsLen} bytes, profile=${spsData[1]}, level=${spsData[3]}`);
            }
          }
        } else if (pkt.flags === 3) {
          videoKeyframes++;
          console.log(`[DEPAY] VIDEO KEYFRAME: pts=${pkt.pts} dts=${pkt.dts} size=${pkt.size}`);
        } else if (pkt.flags === 4) {
          videoFrames++;
          // if (videoFrames <= 3 || videoFrames % 50 === 0) {
          console.log(`[DEPAY] VIDEO FRAME: pts=${pkt.pts} dts=${pkt.dts} size=${pkt.size} total=${videoFrames}`);
          // }
        }
      } else if (pkt.codec_type === 8) {
        // Audio
        audioFrames++;
        // if (audioFrames <= 3 || audioFrames % 100 === 0) {
        const codecName = pkt.codec_id === 7 ? "PCMA" : pkt.codec_id === 8 ? "PCMU" : pkt.codec_id === 10 ? "AAC" : `codec${pkt.codec_id}`;
        console.log(`[DEPAY] AUDIO ${codecName}: pts=${pkt.pts} size=${pkt.size} total=${audioFrames}`);
        // }
      }
    }
  };

  client.onCloseCallback = (hadError) => {
    console.log(`[EVENT] Connection closed, hadError=${hadError}`);
  };

  client.onErrorCallback = (error) => {
    console.log(`[EVENT] Error: ${error.message}`);
  };

  try {
    // ── Step 1: Connect ──
    console.log("\n=== Step 1: Connect ===");
    await client.connect(RTSP_URL);
    console.log("Connected OK");

    // ── Step 2: OPTIONS ──
    console.log("\n=== Step 2: OPTIONS ===");
    const optionsRes = await client.options();
    console.log(`Status: ${optionsRes.statusCode}`);

    // ── Step 3: DESCRIBE ──
    console.log("\n=== Step 3: DESCRIBE ===");
    const describeRes = await client.describe();
    console.log(`Status: ${describeRes.statusCode} (SDP ${describeRes.body.length} bytes)`);

    // ── Step 4: Parse SDP ──
    console.log("\n=== Step 4: Parse SDP ===");
    const sdp = SdpParser.parse(describeRes.body);
    if (!sdp) {
      throw new Error("Failed to parse SDP");
    }
    for (const m of sdp.media) {
      console.log(`  ${m.type}: ${m.codec} pt=${m.payloadType} clockRate=${m.clockRate}`);
      // Register track with depayloader
      depayloader.addTrack(m.payloadType, m.codec, m.clockRate, m.fmtp);
    }

    // ── Step 5: SETUP ──
    console.log("\n=== Step 5: SETUP ===");
    for (let i = 0; i < sdp.media.length; i++) {
      const m = sdp.media[i];
      const trackUrl = RtspClient.buildTrackUrl(RTSP_URL, m.control);
      const channel = client.allocateChannel();
      const transport = RtspClient.buildTCPInterleavedTransport(channel.rtpChannel, channel.rtcpChannel);
      console.log(`  SETUP [${i}] ${m.type}/${m.codec} -> ch${channel.rtpChannel}-${channel.rtcpChannel}`);
      const setupRes = await client.setup(trackUrl, transport);
      console.log(`  -> ${setupRes.statusCode}`);
      if (setupRes.statusCode !== 200) {
        throw new Error(`SETUP failed: ${setupRes.statusCode}`);
      }
      channelMap.set(channel.rtpChannel, { pt: m.payloadType, codec: m.codec, type: m.type });
      channelMap.set(channel.rtcpChannel, { pt: m.payloadType, codec: m.codec, type: m.type });
    }

    // ── Step 6: PLAY ──
    console.log("\n=== Step 6: PLAY ===");
    const playRes = await client.play();
    console.log(`Status: ${playRes.statusCode}`);

    // ── Step 7: Receive & Depayload (5 seconds) ──
    console.log("\n=== Step 7: Receiving & Depayloading (5 seconds) ===");
    await new Promise((resolve) => setTimeout(resolve, 50000));

    // ── Step 8: TEARDOWN ──
    console.log("\n=== Step 8: TEARDOWN ===");
    const teardownRes = await client.teardown();
    console.log(`Status: ${teardownRes.statusCode}`);

    // ── Step 9: Disconnect ──
    console.log("\n=== Step 9: Disconnect ===");
    client.disconnect();

    // ── Summary ──
    console.log("\n========== TEST SUMMARY ==========");
    console.log(`Signaling:      OPTIONS=${optionsRes.statusCode} DESCRIBE=${describeRes.statusCode} PLAY=${playRes.statusCode} TEARDOWN=${teardownRes.statusCode}`);
    console.log(`SDP tracks:     ${sdp.media.map((m) => `${m.type}/${m.codec}`).join(", ")}`);
    console.log(`RTP packets:    ${rtpPacketCount}`);
    console.log(`AVPackets:      ${avPacketCount}`);
    console.log(`Video header:   ${videoHeaderEmitted ? "emitted" : "NOT emitted"}`);
    console.log(`Video keyframes:${videoKeyframes}`);
    console.log(`Video frames:   ${videoFrames}`);
    console.log(`Audio frames:   ${audioFrames}`);
    console.log("==================================");

    if (videoHeaderEmitted && videoKeyframes > 0 && audioFrames > 0) {
      console.log("\n✅ Phase 1-4 all tests passed!");
    } else {
      console.log("\n⚠️  Some expected data not received:");
      if (!videoHeaderEmitted) {
        console.log("  - Video header (SPS/PPS) not emitted");
      }
      if (videoKeyframes === 0) {
        console.log("  - No video keyframes received");
      }
      if (audioFrames === 0) {
        console.log("  - No audio frames received");
      }
    }

  } catch (error) {
    console.error("\n❌ Test failed:", error.message);
    console.error(error.stack);
    client.disconnect();
    process.exit(1);
  }
}

main();
