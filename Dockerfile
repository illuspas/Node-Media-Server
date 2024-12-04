FROM --platform=$TARGETPLATFORM node:lts-alpine

WORKDIR /node-media-server

COPY . .

RUN npm install --production

EXPOSE 1935 8000 8443

CMD ["node", "bin/app.js"]