const express = require('express');

const authCheck = require('../middleware/auth');

const { getClients } = require('../controllers/clients');

const router = express.Router();

router.use(authCheck);

router.get('/', getClients);

module.exports = router;
