import * as _ from 'lodash';

export function getStreams(req, res, next) {
  const nms = req.nms;

  const stats: any = {};

  nms.sessions.forEach((session, id) => {
    if (session.isStarting) {
      const regRes = /\/(.*)\/(.*)/gi.exec(
        session.publishStreamPath || session.playStreamPath,
      );

      if (regRes === null) {
        return;
      }

      const [app, stream] = _.slice(regRes, 1);

      if (!_.get(stats, [app, stream])) {
        _.set(stats, [app, stream], {
          publisher: null,
          subscribers: [],
        });
      }

      switch (true) {
        case session.isPublishing: {
          _.set(stats, [app, stream, 'publisher'], {
            app: app,
            stream: stream,
            clientId: session.id,
            connectCreated: session.connectTime,
            bytes: session.socket.bytesRead,
            ip: session.socket.remoteAddress,
            audio:
              session.audioCodec > 0
                ? {
                    codec: session.audioCodecName,
                    profile: session.audioProfileName,
                    samplerate: session.audioSamplerate,
                    channels: session.audioChannels,
                  }
                : null,
            video:
              session.videoCodec > 0
                ? {
                    codec: session.videoCodecName,
                    size: session.videoSize,
                    fps: session.videoFps,
                  }
                : null,
            userId: session.userId || null,
          });

          break;
        }
        case !!session.playStreamPath: {
          switch (session.constructor.name) {
            case 'NodeRtmpSession': {
              stats[app][stream]['subscribers'].push({
                app: app,
                stream: stream,
                clientId: session.id,
                connectCreated: session.connectTime,
                bytes: session.socket.bytesWritten,
                ip: session.socket.remoteAddress,
                protocol: 'rtmp',
                userId: session.userId || null,
              });

              break;
            }
            case 'NodeFlvSession': {
              stats[app][stream]['subscribers'].push({
                app: app,
                stream: stream,
                clientId: session.id,
                connectCreated: session.connectTime,
                bytes: session.req.connection.bytesWritten,
                ip: session.req.connection.remoteAddress,
                protocol: session.TAG === 'websocket-flv' ? 'ws' : 'http',
                userId: session.userId || null,
              });

              break;
            }
          }

          break;
        }
      }
    }
  });

  res.json(stats);
}

export function getStream(req, res, next) {
  const nms = req.nms;

  const publishStreamPath = `/${req.params.app}/${req.params.stream}`;

  const publisherSession = nms.sessions.get(
    nms.publishers.get(publishStreamPath),
  );

  const isLive = !!publisherSession;

  const viewers = _.filter(Array.from(nms.sessions.values()), session => {
    return (session as any).playStreamPath === publishStreamPath;
  }).length;

  const duration = isLive
    ? Math.ceil((Date.now() - publisherSession.startTimestamp) / 1000)
    : 0;

  const bitrate =
    duration > 0
      ? Math.ceil(
          (_.get(publisherSession, ['socket', 'bytesRead'], 0) * 8) /
            duration /
            1024,
        )
      : 0;

  const streamStats = {
    isLive,
    viewers,
    duration,
    bitrate,
    startTime: isLive ? publisherSession.connectTime : null,
  };

  res.json(streamStats);
}
