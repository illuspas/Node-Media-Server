//
//  Created by Mingliang Chen on 19/4/11.
//  illuspas[a]gmail.com
//  Copyright (c) 2019 Nodemedia. All rights reserved.
//
const _ = require('lodash');

function getStreams(req, res, next) {
  let stats = {};

  this.sessions.forEach(function (session, id) {
    if (session.constructor.name !== 'NodeRelaySession') {
      return;
    }

    let { app, name } = session.conf;

    if (!_.get(stats, [app, name])) {
      _.set(stats, [app, name], {
        relays: [],
      });
    }

    stats[app][name]['relays'].push({
      app: app,
      name: name,
      url: session.conf.ouPath,
      mode: session.conf.mode,
      id: session.id,
    });
  });

  res.json(stats);
}

function getStream(req, res, next) {
  let relay = {};
  let relayPath = `${req.params.app}/${req.params.name}`;

  this.sessions.forEach(function (session, id) {
    if (session.constructor.name !== 'NodeRelaySession') {
      return;
    }

    let { app, name } = session.conf;
    if (relayPath === `${app}/${name}`) {
      relay = {
        app: app,
        name: name,
        url: session.conf.ouPath,
        mode: session.conf.mode,
        id: session.id,
      };
      return;
    }
  });

  res.json(relay);
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
  let relay = {};
  let relayExists = false;
  let relayPath = `${req.params.app}/${req.params.name}`;

  this.sessions.forEach(function (session, id) {
    if (session.constructor.name !== 'NodeRelaySession') {
      return;
    }

    let { app, name } = session.conf;
    if (relayPath === `${app}/${name}`) {
      session.end();
      relay = {
        app: app,
        name: name,
        url: session.conf.ouPath,
        mode: session.conf.mode,
        id: session.id,
      };
      relayExists = true;
      return;
    }
  });

  if (relayExists) {
    res.json(relay);
  } else {
    res.sendStatus(400);
  }
}

module.exports = {
  getStreams,
  getStream,
  pullStream,
  pushStream,
  delStream,
};
