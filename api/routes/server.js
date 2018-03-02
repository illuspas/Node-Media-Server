const express = require('express');
const serverController = require('../controllers/server');

module.exports = (context) => {
  let router = express.Router();
  router.get('/', serverController.getInfo.bind(context));
  return router;
};
