const _ = require('lodash');

function getChannels(req, res, next) {
    const nms = this;

    let stats = {};

    nms.sessions.forEach(function (session, id) {
        if (session.isStarting) {
            let regRes = /\/(.*)\/(.*)/gi.exec(session.publishStreamPath || session.playStreamPath);

            if (regRes === null) return;

            let [app, channel] = _.slice(regRes, 1);

            if (!_.get(stats, [app, channel])) {
                _.set(stats, [app, channel], {
                    publisher: null,
                    subscribers: []
                });
            }

            switch (true) {
                case session.isPublishing: {
                    _.set(stats, [app, channel, 'publisher'], {
                        app: app,
                        channel: channel,
                        serverId: session.id,
                        connectCreated: session.connectTime,
                        bytes: session.socket.bytesRead,
                        ip: session.socket.remoteAddress
                    });

                    break;
                }
                case !!session.playStreamPath: {
                    switch (session.constructor.name) {
                        case 'NodeRtmpSession': {
                            stats[app][channel]['subscribers'].push({
                                app: app,
                                channel: channel,
                                serverId: session.id,
                                connectCreated: session.connectTime,
                                bytes: session.socket.bytesWritten,
                                ip: session.socket.remoteAddress,
                                protocol: 'rtmp'
                            });

                            break;
                        }
                        case 'NodeFlvSession': {
                            stats[app][channel]['subscribers'].push({
                                app: app,
                                channel: channel,
                                serverId: session.id,
                                connectCreated: session.connectTime,
                                bytes: session.req.connection.bytesWritten,
                                ip: session.req.connection.remoteAddress,
                                protocol: session.TAG === 'websocket-flv' ? 'ws' : 'http'
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

function getChannel(req, res, next) {
    const nms = this;

    let channelStats = {
        isLive: false,
        viewers: 0,
        duration: 0,
        bitrate: 0,
        startTime: null
    };

    let publishStreamPath = `/${req.params.app}/${req.params.channel}`;

    let publisherSession = nms.sessions.get(nms.publishers.get(publishStreamPath));

    channelStats.isLive = !!publisherSession;
    channelStats.viewers = _.filter(Array.from(nms.sessions.values()), (session) => {
        return session.playStreamPath === publishStreamPath;
    }).length;
    channelStats.duration = channelStats.isLive ? Math.ceil((Date.now() - publisherSession.startTimestamp) / 1000) : 0;
    channelStats.bitrate = channelStats.duration > 0 ? Math.ceil(_.get(publisherSession, ['socket', 'bytesRead'], 0) * 8 / channelStats.duration / 1024) : 0;
    channelStats.startTime = channelStats.isLive ? publisherSession.connectTime : null;

    res.json(channelStats);
}

exports.getChannels = getChannels;
exports.getChannel = getChannel;
