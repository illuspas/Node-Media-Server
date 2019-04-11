const express = require('express');
const relayController = require('../controllers/relay');

module.exports = (context) => {
  let router = express.Router();
  router.post('/pull', relayController.pullStream.bind(context));
  router.post('/push', relayController.pushStream.bind(context));
  return router;
};
