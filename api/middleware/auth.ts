import * as _ from 'lodash';

export function authCheck(req, res, next) {
  if (!_.get(req.nms, ['config', 'api'], null)) {
    return next();
  }

  if (_.get(req.nms, ['config', 'api', 'token'], null) !== req.headers.token) {
    return res.status(401).json({ error: 'Not authorized.' });
  }

  next();
}
