const express = require('express');
const relayController = require('../controllers/relay');

module.exports = (context) => {
  let router = express.Router();
  router.get('/', relayController.getStreams.bind(context));
  router.get('/:app/:name', relayController.getStream.bind(context));
  router.post('/pull', relayController.pullStream.bind(context));
  router.post('/push', relayController.pushStream.bind(context));
  router.delete('/:app/:name', relayController.delStream.bind(context));
  return router;
};
