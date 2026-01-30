// @ts-check
//
//  Transcription Worker for Node-Media-Server
//  Handles RTMP audio extraction, checkpointing, and transcription
//  Copyright (c) 2026 NodeMedia. All rights reserved.
//

const express = require("express");
const axios = require("axios");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const FormData = require("form-data");

// Configuration from environment
const config = {
  port: Number.parseInt(process.env.PORT || "3000"),
  n8nWebhookUrl: process.env.N8N_WEBHOOK_URL,
  rtmpHost: process.env.RTMP_HOST || "node-media-server",
  rtmpPort: process.env.RTMP_PORT || "1935",
  whisperUrl: process.env.WHISPER_URL || "http://faster-whisper:8000",
  checkpointIntervalMinutes: Number.parseInt(process.env.CHECKPOINT_INTERVAL_MINUTES || "5"),
  dataDir: "/data/streams",
};

/**
 * @typedef {object} ActiveSession
 * @property {string} id
 * @property {string} streamApp
 * @property {string} name
 * @property {number} createtime
 * @property {string} sessionDir
 * @property {string} audioFile
 * @property {number} checkpointCount
 */

/**
 * @typedef {object} SessionMetadata
 * @property {string} id
 * @property {string} streamApp
 * @property {string} name
 * @property {number} createtime
 * @property {number} [endtime]
 * @property {string} [title]
 * @property {string} [description]
 * @property {string} [encoder]
 */

/** @type {ActiveSession | null} */
let activeSession = null;

/** @type {import("node:child_process").ChildProcess | null} */
let ffmpegProcess = null;

/** @type {NodeJS.Timeout | null} */
let checkpointTimer = null;

const app = express();
app.use(express.json());

/**
 * Health check endpoint
 */
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    activeSession: activeSession?.id || null,
    timestamp: new Date().toISOString(),
  });
});

/**
 * Webhook endpoint for Node-Media-Server events
 */
app.post("/webhook", async (req, res) => {
  const { action, id, app: streamApp, name, createtime, endtime, title, description, encoder } = req.body;

  console.log(`[Webhook] Received action: ${action}, session: ${id}, stream: ${streamApp}/${name}`);

  try {
    switch (action) {
    case "postPublish":
      await handlePostPublish({ id, streamApp, name, createtime });
      break;
    case "donePublish":
      await handleDonePublish({ id, streamApp, name, createtime, endtime, title, description, encoder });
      break;
    default:
      console.log(`[Webhook] Ignoring action: ${action}`);
    }
    res.status(200).json({ success: true });
  } catch (err) {
    const error = /** @type {Error} */ (err);
    console.error(`[Webhook] Error handling ${action}:`, error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Handle postPublish - start recording audio
 * @param {SessionMetadata} session
 */
async function handlePostPublish(session) {
  const { id, streamApp, name, createtime } = session;

  if (activeSession) {
    console.warn(`[Recording] Already recording session ${activeSession.id}, ignoring new stream`);
    return;
  }

  const sessionDir = path.join(config.dataDir, id);
  fs.mkdirSync(sessionDir, { recursive: true });

  activeSession = {
    id,
    streamApp,
    name,
    createtime,
    sessionDir,
    audioFile: path.join(sessionDir, "audio.wav"),
    checkpointCount: 0,
  };

  console.log(`[Recording] Starting audio recording for session ${id}`);
  console.log(`[Recording] RTMP source: rtmp://${config.rtmpHost}:${config.rtmpPort}/${streamApp}/${name}`);

  // Start FFmpeg to extract audio from RTMP stream
  const rtmpUrl = `rtmp://${config.rtmpHost}:${config.rtmpPort}/${streamApp}/${name}`;

  ffmpegProcess = spawn("ffmpeg", [
    "-i", rtmpUrl,
    "-vn",                    // No video
    "-acodec", "pcm_s16le",   // 16-bit PCM (required for Whisper)
    "-ar", "16000",           // 16kHz sample rate (Whisper requirement)
    "-ac", "1",               // Mono
    "-y",                     // Overwrite output
    activeSession.audioFile,
  ]);

  ffmpegProcess.stderr.on("data", (data) => {
    // FFmpeg outputs to stderr, only log errors
    const msg = data.toString();
    if (msg.includes("Error") || msg.includes("error")) {
      console.error(`[FFmpeg] ${msg}`);
    }
  });

  ffmpegProcess.on("close", (code) => {
    console.log(`[FFmpeg] Process exited with code ${code}`);
    ffmpegProcess = null;
  });

  ffmpegProcess.on("error", (error) => {
    console.error(`[FFmpeg] Error:`, error.message);
    ffmpegProcess = null;
  });

  // Start checkpoint timer
  startCheckpointTimer();
}

/**
 * Handle donePublish - stop recording, transcribe, send to n8n
 * @param {SessionMetadata} session
 */
async function handleDonePublish(session) {
  const { id, streamApp, name, createtime, endtime, title, description, encoder } = session;

  if (!activeSession || activeSession.id !== id) {
    console.warn(`[Recording] No active session matching ${id}`);
    // Check for orphaned session directory and try recovery
    const sessionDir = path.join(config.dataDir, id);
    if (fs.existsSync(sessionDir)) {
      console.log(`[Recovery] Found orphaned session directory, attempting recovery`);
      await recoverAndTranscribe(sessionDir, { id, streamApp, name, createtime, endtime, title, description, encoder });
    }
    return;
  }

  // Stop checkpoint timer
  stopCheckpointTimer();

  // Stop FFmpeg gracefully
  if (ffmpegProcess) {
    console.log(`[Recording] Stopping FFmpeg for session ${id}`);
    ffmpegProcess.stdin.write("q");
    await new Promise((resolve) => setTimeout(resolve, 2000));
    if (ffmpegProcess) {
      ffmpegProcess.kill("SIGTERM");
    }
  }

  // Wait for file to be finalized
  await new Promise((resolve) => setTimeout(resolve, 1000));

  const audioFile = activeSession.audioFile;
  const sessionDir = activeSession.sessionDir;

  // Clear active session
  activeSession = null;
  ffmpegProcess = null;

  // Transcribe and send to n8n
  await transcribeAndSend(audioFile, {
    id,
    streamApp,
    name,
    createtime,
    endtime,
    title: title || name,  // Fallback to stream name
    description: description || "",
    encoder: encoder || "",
  });

  // Cleanup session directory
  cleanupSession(sessionDir);
}

/**
 * Start checkpoint timer
 */
function startCheckpointTimer() {
  const intervalMs = config.checkpointIntervalMinutes * 60 * 1000;

  checkpointTimer = setInterval(() => {
    if (activeSession && fs.existsSync(activeSession.audioFile)) {
      activeSession.checkpointCount++;
      const checkpointFile = path.join(
        activeSession.sessionDir,
        `checkpoint-${String(activeSession.checkpointCount * config.checkpointIntervalMinutes).padStart(2, "0")}.wav`
      );

      try {
        fs.copyFileSync(activeSession.audioFile, checkpointFile);
        console.log(`[Checkpoint] Created ${checkpointFile}`);
      } catch (err) {
        const error = /** @type {Error} */ (err);
        console.error(`[Checkpoint] Error creating checkpoint:`, error.message);
      }
    }
  }, intervalMs);

  console.log(`[Checkpoint] Timer started, interval: ${config.checkpointIntervalMinutes} minutes`);
}

/**
 * Stop checkpoint timer
 */
function stopCheckpointTimer() {
  if (checkpointTimer) {
    clearInterval(checkpointTimer);
    checkpointTimer = null;
    console.log(`[Checkpoint] Timer stopped`);
  }
}

/**
 * Transcribe audio file and send to n8n
 * @param {string} audioFile
 * @param {SessionMetadata} metadata
 */
async function transcribeAndSend(audioFile, metadata) {
  const { id, streamApp, name, createtime, endtime, title, description, encoder } = metadata;

  if (!fs.existsSync(audioFile)) {
    console.error(`[Transcribe] Audio file not found: ${audioFile}`);
    return;
  }

  const stats = fs.statSync(audioFile);
  console.log(`[Transcribe] Processing ${audioFile} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);

  try {
    // Send audio to faster-whisper for transcription
    const formData = new FormData();
    formData.append("file", fs.createReadStream(audioFile), {
      filename: "audio.wav",
      contentType: "audio/wav",
    });
    formData.append("model", "Systran/faster-whisper-small.en");
    formData.append("response_format", "verbose_json");

    console.log(`[Transcribe] Sending to ${config.whisperUrl}/v1/audio/transcriptions`);

    const whisperResponse = await axios.post(
      `${config.whisperUrl}/v1/audio/transcriptions`,
      formData,
      {
        headers: formData.getHeaders(),
        maxBodyLength: Infinity,
        timeout: 600000, // 10 minutes for long audio
      }
    );

    const transcription = whisperResponse.data;
    console.log(`[Transcribe] Received transcription, length: ${transcription.text?.length || 0} chars`);

    // Calculate duration
    const durationSeconds = endtime && createtime ? Math.round((endtime - createtime) / 1000) : 0;

    // Build n8n payload
    const n8nPayload = {
      event: "stream_transcription_complete",
      timestamp: new Date().toISOString(),
      stream: {
        app: streamApp,
        name: name,
        session_id: id,
        title: title,
        description: description,
        encoder: encoder,
        start_time: new Date(createtime).toISOString(),
        end_time: endtime ? new Date(endtime).toISOString() : new Date().toISOString(),
        duration_seconds: durationSeconds,
      },
      transcript: {
        text: transcription.text || "",
        language: transcription.language || "en",
        segments: transcription.segments || [],
      },
    };

    // Send to n8n webhook
    console.log(`[n8n] Sending transcript to ${config.n8nWebhookUrl}`);

    await axios.post(config.n8nWebhookUrl, n8nPayload, {
      headers: { "Content-Type": "application/json" },
      timeout: 30000,
    });

    console.log(`[n8n] Successfully sent transcript for session ${id}`);

  } catch (err) {
    const error = /** @type {Error & {response?: {status: number, data: unknown}}} */ (err);
    console.error(`[Transcribe] Error:`, error.message);
    if (error.response) {
      console.error(`[Transcribe] Response status:`, error.response.status);
      console.error(`[Transcribe] Response data:`, error.response.data);
    }
  }
}

/**
 * Recover orphaned session and transcribe
 * @param {string} sessionDir
 * @param {SessionMetadata} metadata
 */
async function recoverAndTranscribe(sessionDir, metadata) {
  // Find the best audio file (latest checkpoint or main audio)
  const files = fs.readdirSync(sessionDir);
  let audioFile = null;

  // Prefer main audio file
  const mainAudio = path.join(sessionDir, "audio.wav");
  if (fs.existsSync(mainAudio) && fs.statSync(mainAudio).size > 0) {
    audioFile = mainAudio;
  } else {
    // Fall back to latest checkpoint
    const checkpoints = files
      .filter((f) => f.startsWith("checkpoint-") && f.endsWith(".wav"))
      .sort()
      .reverse();

    if (checkpoints.length > 0) {
      audioFile = path.join(sessionDir, checkpoints[0]);
    }
  }

  if (audioFile) {
    console.log(`[Recovery] Using audio file: ${audioFile}`);
    await transcribeAndSend(audioFile, metadata);
  } else {
    console.log(`[Recovery] No valid audio files found in ${sessionDir}`);
  }

  cleanupSession(sessionDir);
}

/**
 * Cleanup session directory
 * @param {string} sessionDir
 */
function cleanupSession(sessionDir) {
  try {
    fs.rmSync(sessionDir, { recursive: true, force: true });
    console.log(`[Cleanup] Removed session directory: ${sessionDir}`);
  } catch (error) {
    console.error(`[Cleanup] Error removing directory:`, error.message);
  }
}

/**
 * Startup recovery - scan for incomplete sessions
 */
async function startupRecovery() {
  console.log(`[Recovery] Scanning for incomplete sessions in ${config.dataDir}`);

  if (!fs.existsSync(config.dataDir)) {
    fs.mkdirSync(config.dataDir, { recursive: true });
    return;
  }

  const sessions = fs.readdirSync(config.dataDir);

  for (const sessionId of sessions) {
    const sessionDir = path.join(config.dataDir, sessionId);
    const stat = fs.statSync(sessionDir);

    if (!stat.isDirectory()) continue;

    console.log(`[Recovery] Found incomplete session: ${sessionId}`);

    // Create minimal metadata for recovery
    const metadata = {
      id: sessionId,
      streamApp: "live",
      name: "recovered",
      createtime: stat.birthtime.getTime(),
      endtime: stat.mtime.getTime(),
      title: "Recovered Stream",
      description: "",
      encoder: "",
    };

    await recoverAndTranscribe(sessionDir, metadata);
  }
}

// Start server
app.listen(config.port, async () => {
  console.log(`[Worker] Transcription worker listening on port ${config.port}`);
  console.log(`[Worker] N8N Webhook URL: ${config.n8nWebhookUrl}`);
  console.log(`[Worker] Whisper URL: ${config.whisperUrl}`);
  console.log(`[Worker] Checkpoint interval: ${config.checkpointIntervalMinutes} minutes`);

  // Run startup recovery
  await startupRecovery();
});
