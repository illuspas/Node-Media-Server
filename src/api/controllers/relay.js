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
        relays: [],
      });
    }

    stats[app][name]['relays'].push({
      app: app,
      name: name,
      path: session.conf.inPath,
      url: session.conf.ouPath,
      mode: session.conf.mode,
      id: id,
    });
  });

  res.json(stats);
}

function getStreamByID(req, res, next) {
  const relaySession = Array.from(this.sessions.values()).filter(
    (session) =>
      session.constructor.name === 'NodeRelaySession' &&
      req.params.id === session.id
  );
  const relays = relaySession.map((item) => ({
    app: item.conf.app,
    name: item.conf.name,
    path: item.conf.inPath,
    url: item.conf.ouPath,
    mode: item.conf.mode,
    id: item.id,
  }));
  res.json(relays);
}

function getStreamByName(req, res, next) {
  const relaySession = Array.from(this.sessions.values()).filter(
    (session) =>
      session.constructor.name === 'NodeRelaySession' &&
      req.params.app === session.conf.app &&
      req.params.name === session.conf.name
  );
  const relays = relaySession.map((item) => ({
    app: item.conf.app,
    name: item.conf.name,
    url: item.conf.ouPath,
    mode: item.conf.mode,
    id: item.id,
  }));
  res.json(relays);
}

function relayStream(req, res, next) {
  let path = req.body.path;
  let url = req.body.url;
  if (path && url) {
    this.nodeEvent.emit('relayTask', path, url);
    res.sendStatus(200);
  } else {
    res.sendStatus(400);
  }
}

function pullStream(req, res, next) {
  let url = req.body.url;
  let app = req.body.app;
  let name = req.body.name;
  if (url && app && name) {
    this.nodeEvent.emit('relayPull', url, app, name);
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
  getStreamByID,
  getStreamByName,
  relayStream,
  pullStream,
  pushStream,
  delStream,
};
