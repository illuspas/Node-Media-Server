const express = require('express');

const authCheck = require('../middleware/auth');

const { getClients } = require('../controllers/clients');

const router = express.Router();

module.exports = nms => {
  router.use(authCheck.bind(nms));

  router.get('/', getClients.bind(nms));

  return router;
};
