const express = require('express');

const serverController = require('../controllers/server');

let router = express.Router();

module.exports = function (nhs) {
  router.get('/',  serverController.getInfo.bind(nhs));

  return router;
};
