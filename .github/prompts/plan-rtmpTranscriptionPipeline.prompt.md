## Plan: Docker-Compose RTMP Transcription Pipeline for Coolify (Final)

A batch-transcription pipeline that receives RTMP streams from StreamYard, captures stream title from RTMP metadata (with stream name fallback), records audio with 5-minute checkpointing, includes startup recovery, and sends the complete transcript + title to n8n after the livestream ends. Uses faster-whisper-server with small.en model.

### Steps

1. **Modify [src/session/base_session.js](src/session/base_session.js)** — add `streamTitle`, `streamDescription`, `encoder`, `metadata` properties to constructor

2. **Modify [src/server/broadcast_server.js](src/server/broadcast_server.js)** — in `@setDataFrame onMetaData` handler, capture `title` (fallback to stream name), `description`, `encoder` from `metadata.dataObj`

3. **Modify [src/server/notify_server.js](src/server/notify_server.js)** — include `title`, `description`, `encoder` in `donePublish` webhook payload only (metadata not available at `postPublish` time)

4. **Create [docker-compose.yml](docker-compose.yml)** — 3 services (node-media-server, faster-whisper-server, transcription-worker), persistent volume, port 1935 exposed

5. **Create [transcription-worker/Dockerfile](transcription-worker/Dockerfile)** — Alpine + FFmpeg + Node.js 20

6. **Create [transcription-worker/package.json](transcription-worker/package.json)** — express, axios dependencies

7. **Create [transcription-worker/index.js](transcription-worker/index.js)** — webhook server with: startup recovery scan, FFmpeg audio recording, 5-min checkpointing, faster-whisper transcription, n8n webhook delivery

### All Files Summary

| Action | Path | Description |
|--------|------|-------------|
| Modify | [src/session/base_session.js](src/session/base_session.js) | Add metadata properties |
| Modify | [src/server/broadcast_server.js](src/server/broadcast_server.js) | Capture title from RTMP metadata |
| Modify | [src/server/notify_server.js](src/server/notify_server.js) | Include metadata in donePublish webhook |
| Create | [docker-compose.yml](docker-compose.yml) | 3 services + volume |
| Create | [transcription-worker/Dockerfile](transcription-worker/Dockerfile) | Container image |
| Create | [transcription-worker/package.json](transcription-worker/package.json) | Dependencies |
| Create | [transcription-worker/index.js](transcription-worker/index.js) | ~150 lines webhook + transcription logic |

### Final Architecture

```
┌─────────────┐    RTMP:1935    ┌───────────────────┐
│  StreamYard │────────────────▶│ node-media-server │
└─────────────┘                 └─────────┬─────────┘
                                          │ webhooks
                    ┌─────────────────────┴─────────────────────┐
                    ↓ postPublish                               ↓ donePublish (+title)
          ┌─────────────────────┐                     ┌─────────────────────┐
          │ transcription-worker │                     │ transcription-worker │
          │ (start FFmpeg)       │                     │ (stop + transcribe)  │
          └──────────┬──────────┘                     └──────────┬──────────┘
                     ↓                                           ↓
          /data/streams/{id}/                         faster-whisper-server
          ├── audio.wav                                          │
          └── checkpoint-*.wav                                   ↓
                                                      n8n Webhook (POST)
```

### Final n8n Payload

```json
{
  "event": "stream_transcription_complete",
  "timestamp": "2026-01-30T15:30:00Z",
  "stream": {
    "app": "live",
    "name": "streamyard",
    "session_id": "abc123",
    "title": "Episode 42: Building with AI",
    "description": "",
    "encoder": "StreamYard",
    "start_time": "2026-01-30T15:00:00Z",
    "end_time": "2026-01-30T15:30:00Z",
    "duration_seconds": 1800
  },
  "transcript": {
    "text": "Full transcript of the entire stream...",
    "language": "en",
    "segments": [
      { "start": 0.0, "end": 5.2, "text": "Hello everyone..." }
    ]
  }
}
```

### Environment Variables (Coolify)

| Variable | Example | Required |
|----------|---------|----------|
| `N8N_WEBHOOK_URL` | `https://n8n.example.com/webhook/transcription` | Yes |
