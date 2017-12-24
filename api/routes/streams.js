const express = require('express');

const streamController = require('../controllers/streams');
const auth = require('../middleware/auth');

let router = express.Router();

module.exports = function (nhs) {
  router.get('/', auth.bind(nhs), streamController.getStreams.bind(nhs));
  router.get('/:app/:stream', streamController.getStream.bind(nhs));

  return router;
};
