//
//  Created by Mingliang Chen on 17/8/1.
//  illuspas[a]gmail.com
//  Copyright (c) 2017 Nodemedia. All rights reserved.
//

const Http = require('http');
const WebSocket = require('ws');
const Express = require('express');
const NodeCoreUtils = require('./node_core_utils');
const NodeFlvSession = require('./node_flv_session');

const HTTP_PORT = 80;

class NodeHttpServer {
  constructor(config, sessions, publishers, idlePlayers) {
    this.port = config.http.port ? config.http.port : HTTP_PORT;
    this.config = config;
    this.sessions = sessions;
    this.publishers = publishers;
    this.idlePlayers = idlePlayers;

    this.expressApp = Express();

    this.expressApp.options('*.flv', (req, res, next) => {
      res.setHeader('Access-Control-Allow-Origin', this.config.http.allow_origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'range');

      res.end();
    });

    this.expressApp.get('*.flv', (req, res, next) => {
      req.nmsConnectionType = 'http';

      this.onConnect(req, res);
    });

    this.httpServer = Http.createServer(this.expressApp);
  }

  run() {
    this.httpServer.listen(this.port, () => {
      console.log(`Node Media Http Server started on port: ${this.port}`);
    });

    this.httpServer.on('error', e => {
      console.error(`Node Media Http Server ${e}`);
    });

    this.wsServer = new WebSocket.Server({ server: this.httpServer });

    this.wsServer.on('connection', (ws, req) => {
      req.nmsConnectionType = 'ws';

      this.onConnect(req, ws);
    });

    this.wsServer.on('listening', () => {
      console.log(`Node Media WebSocket Server started on port: ${this.port}`);
    });

    this.wsServer.on('error', e => {
      console.error(`Node Media WebSocket Server ${e}`);
    });
  }

  onConnect(req, res) {
    let id = NodeCoreUtils.generateNewSessionID(this.sessions);
    let session = new NodeFlvSession(this.config, req, res);
    this.sessions.set(id, session);
    session.id = id;
    session.sessions = this.sessions;
    session.publishers = this.publishers;
    session.idlePlayers = this.idlePlayers;
    session.run();
  }
}

module.exports = NodeHttpServer;
