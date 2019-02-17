const express = require('express');

const { getStreams, getStream } = require('../controllers/streams');

const router = express.Router();

router.get('/', getStreams);
router.get('/:app/:stream', getStream);

module.exports = router;
