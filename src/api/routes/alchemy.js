const express = require('express');
const relayController = require('../controllers/alchemy');

module.exports = (context) => {
  let router = express.Router();
  router.get('/', alchemyController.getStreams.bind(context));
  router.post('/app/add/camera/ip', alchemyController.addIPCam.bind(context));
  router.post('/app/add/camera/onvif', alchemyController.addONVIFCam.bind(context));
  return router;
};
