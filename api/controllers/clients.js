const _ = require('lodash');

function getClients(req, res, next) {
  const nms = this;

  let clients = {};

  nms.sessions.forEach((session, id) => {
    clients[id] = {
      userId: session.userId
    };
  });

  res.json(clients);
}

exports.getClients = getClients;
