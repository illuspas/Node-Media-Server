import * as express from 'express';
import { getStream, getStreams } from '../controllers/streams';

export const router = express.Router();

router.get('/', getStreams);
router.get('/:app/:stream', getStream);
