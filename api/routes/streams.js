const express = require('express');

const authCheck = require('../middleware/auth');

const { getStreams, getStream } = require('../controllers/streams');

const router = express.Router();

router.use(authCheck);

router.get('/', getStreams);
router.get('/:app/:stream', getStream);

module.exports = router;
