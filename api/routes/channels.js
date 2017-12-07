const express = require('express');

const channelController = require('../controllers/channels');

let router = express.Router();

module.exports = function (nms) {
    router.get('/', channelController.getChannels.bind(nms));
    router.get('/:app/:channel', channelController.getChannel.bind(nms));

    return router;
};
