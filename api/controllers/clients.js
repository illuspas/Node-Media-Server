const _ = require('lodash');

function getClients(req, res, next) {
  const nms = req.nms;

  let clients = {};

  nms.sessions.forEach((session, id) => {
    clients[id] = {
      userId: session.userId
    };
  });

  res.json(clients);
}

exports.getClients = getClients;
