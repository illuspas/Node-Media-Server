# Transcription Worker
# Alpine + FFmpeg + Node.js 20 for RTMP audio extraction and transcription orchestration

FROM node:20-alpine

# Install FFmpeg and curl for health checks
RUN apk add --no-cache ffmpeg curl

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Create data directory for audio storage
RUN mkdir -p /data/streams

# Expose webhook server port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD wget -q --spider http://localhost:3000/health || exit 1

# Start the worker
CMD ["node", "index.js"]
