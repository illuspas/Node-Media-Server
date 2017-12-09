const express = require('express');

const channelController = require('../controllers/channels');
const auth = require('../middleware/auth');

let router = express.Router();

module.exports = function (nms) {
  router.get('/', auth.bind(nms), channelController.getChannels.bind(nms));
  router.get('/:app/:channel', channelController.getChannel.bind(nms));

  return router;
};
