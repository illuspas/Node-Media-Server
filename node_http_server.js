//
//  Created by Mingliang Chen on 17/8/1.
//  illuspas[a]gmail.com
//  Copyright (c) 2017 Nodemedia. All rights reserved.
//

const Fs = require('fs');
const Http = require('http');
const Https = require('https');
const WebSocket = require('ws');
const Express = require('express');
const NodeCoreUtils = require('./node_core_utils');
const NodeFlvSession = require('./node_flv_session');

class NodeHttpServer {
  constructor(config, sessions, publishers, idlePlayers) {
    this.port = config.http.port;
    this.sport = config.https && config.https.port;
    this.config = config;
    this.sessions = sessions;
    this.publishers = publishers;
    this.idlePlayers = idlePlayers;

    this.expressApp = Express();


    this.expressApp.all('*.flv', (req, res, next) => {
      if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Origin', this.config.http.allow_origin);
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'range');
        res.end();
      } else {
        if (Fs.existsSync(__dirname + '/public' + req.url)) {
          res.setHeader('Content-Type', 'video/x-flv');
          res.setHeader('Access-Control-Allow-Origin', this.config.http.allow_origin);
          next();
        } else {
          req.nmsConnectionType = 'http';
          this.onConnect(req, res);
        }
      }
    });

    this.expressApp.use(Express.static(__dirname + '/public'));
    this.httpServer = Http.createServer(this.expressApp);

    /**
     * ~ openssl genrsa -out privatekey.pem 1024
     * ~ openssl req -new -key privatekey.pem -out certrequest.csr 
     * ~ openssl x509 -req -in certrequest.csr -signkey privatekey.pem -out certificate.pem
     */
	if (this.config.https) {
		let options = {
		  key: Fs.readFileSync(this.config.https.key),
		  cert: Fs.readFileSync(this.config.https.cert)
		};
	
		this.httpsServer = Https.createServer(options, this.expressApp);
	}
  }

  run() {
    this.httpServer.listen(this.port, () => {
      console.log(`Node Media Http Server started on port: ${this.port}`);
    });

    this.httpServer.on('error', (e) => {
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
	this.wsServer.on('error', (e) => {
	  console.error(`Node Media WebSocket Server ${e}`);
	});

	if (this.httpsServer) {
		this.httpsServer.listen(this.sport, () => {
		  console.log(`Node Media Https Server started on port: ${this.sport}`);
		});
	
		this.httpsServer.on('error', (e) => {
		  console.error(`Node Media Https Server ${e}`);
		});
	
		this.wssServer = new WebSocket.Server({ server: this.httpsServer });
	
		this.wssServer.on('connection', (ws, req) => {
		  req.nmsConnectionType = 'ws';
		  this.onConnect(req, ws);
		});
	
		this.wssServer.on('listening', () => {
		  console.log(`Node Media WebSocketSecure Server started on port: ${this.sport}`);
		});
		this.wssServer.on('error', (e) => {
		  console.error(`Node Media WebSocketSecure Server ${e}`);
		});
	}
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

module.exports = NodeHttpServer