//
//  Created by Mingliang Chen on 19/4/11.
//  illuspas[a]gmail.com
//  Copyright (c) 2019 Nodemedia. All rights reserved.
//
const { get, set } = require('lodash');

function getStreams(req, res, next) {
  let stats = {};
  this.sessions.forEach(function (session, id) {
    if (session.constructor.name !== 'NodeRelaySession') {
      return;
    }

    let { app, name } = session.conf;

    if (!get(stats, [app, name])) {
      set(stats, [app, name], {
        relays: []
      });
    }

    stats[app][name]['relays'].push({
      app: app,
      name: name,
      url: session.conf.ouPath,
      mode: session.conf.mode,
      id: session.id,
    })
  });

  res.json(stats);
}

function pullStream(req, res, next) {
  let url = req.body.url;
  let app = req.body.app;
  let name = req.body.name;
  let rtsp_transport = req.body.rtsp_transport ? req.body.rtsp_transport : null;
  if (url && app && name) {
    this.nodeEvent.emit('relayPull', url, app, name, rtsp_transport);
    res.sendStatus(200);
  } else {
    res.sendStatus(400);
  }
}

function pushStream(req, res, next) {
  let url = req.body.url;
  let app = req.body.app;
  let name = req.body.name;
  if (url && app && name) {
    this.nodeEvent.emit('relayPush', url, app, name);
    res.sendStatus(200);
  } else {
    res.sendStatus(400);
  }
}

function delStream(req, res, next) {
  let relaySession = this.sessions.get(req.params.id);
  if (relaySession) {
    relaySession.end();
    res.json('Ok');
  } else {
    res.json({ error: 'relay not found' }, 404);
  }
}

module.exports = {
  getStreams,
  pullStream,
  pushStream,
  delStream
};
