FROM node:10.15.0-alpine

ARG BUILD_DATE
ARG VCS_REF

WORKDIR     /tmp/ffmpeg

LABEL org.label-schema.build-date="${BUILD_DATE}" \
      org.label-schema.name="ffmpeg" \
      org.label-schema.description="Small ffmpeg Docker images for Alpine Linux, Ubuntu with VMAF option" \
      org.label-schema.url="https://hub.docker.com/r/sitkevij/ffmpeg/" \
      org.label-schema.usage="https://github.com/sitkevij/ffmpeg/blob/master/README.md" \
      org.label-schema.vcs-ref="${VCS_REF}" \
      org.label-schema.vcs-url="https://github.com/sitkevij/ffmpeg" \
      org.label-schema.vendor="sitkevij" \
      org.label-schema.version="4.0" \
      maintainer="https://github.com/sitkevij"

ENV SOFTWARE_VERSION="4.0"
ENV SOFTWARE_VERSION_URL="http://ffmpeg.org/releases/ffmpeg-${SOFTWARE_VERSION}.tar.bz2"
ENV BIN="/usr/bin"

RUN cd && \
apk update && \
apk upgrade && \
apk add \
  freetype-dev \
  gnutls-dev \
  lame-dev \
  libass-dev \
  libogg-dev \
  libtheora-dev \
  libvorbis-dev \
  libvpx-dev \
  libwebp-dev \
  libssh2 \
  opus-dev \
  rtmpdump-dev \
  x264-dev \
  x265-dev \
  yasm-dev && \
apk add --no-cache --virtual \
  .build-dependencies \
  build-base \
  bzip2 \
  coreutils \
  gnutls \
  nasm \
  tar \
  x264 && \
DIR=$(mktemp -d) && \
cd "${DIR}" && \
wget "${SOFTWARE_VERSION_URL}" && \
tar xjvf "ffmpeg-${SOFTWARE_VERSION}.tar.bz2" && \
cd ffmpeg* && \
PATH="$BIN:$PATH" && \
./configure --help && \
./configure --bindir="$BIN" --disable-debug \
  --disable-doc \
  --disable-ffplay \
  --enable-avresample \
  --enable-gnutls \
  --enable-gpl \
  --enable-libass \
  --enable-libfreetype \
  --enable-libmp3lame \
  --enable-libopus \
  --enable-librtmp \
  --enable-libtheora \
  --enable-libvorbis \
  --enable-libvpx \
  --enable-libwebp \
  --enable-libx264 \
  --enable-libx265 \
  --enable-nonfree \
  --enable-postproc \
  --enable-small \
  --enable-version3 && \
make -j4 && \
make install && \
make distclean && \
rm -rf "${DIR}"  && \
apk del --purge .build-dependencies && \
rm -rf /var/cache/apk/*

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm i

COPY . .

EXPOSE 1935 8000

CMD ["node","app.js"]
