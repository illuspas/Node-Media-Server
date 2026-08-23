# Build stage: compile the webadmin console
FROM --platform=$TARGETPLATFORM node:lts-alpine AS webadmin-builder
WORKDIR /app/webadmin
COPY webadmin/package.json webadmin/package-lock.json ./
RUN npm ci
COPY webadmin ./
RUN npm run build

# Runtime image: production deps, server code and the built console
FROM --platform=$TARGETPLATFORM node:lts-alpine
WORKDIR /node-media-server
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY bin ./bin
COPY src ./src
COPY --from=webadmin-builder /app/webadmin/dist ./webadmin/dist
EXPOSE 1935 8000 8443
CMD ["node", "bin/app.js"]
