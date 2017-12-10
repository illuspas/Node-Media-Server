const express = require('express');

const streamController = require('../controllers/streams');
const auth = require('../middleware/auth');

let router = express.Router();

module.exports = function (nms) {
  router.get('/', auth.bind(nms), streamController.getStreams.bind(nms));
  router.get('/:app/:stream', streamController.getStream.bind(nms));

  return router;
};
