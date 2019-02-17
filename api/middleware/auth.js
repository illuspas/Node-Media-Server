const _ = require('lodash');

function authCheck(req, res, next) {
  if (!_.get(this, ['config', 'api'], null)) {
    return next();
  }

  if (_.get(this, ['config', 'api', 'key'], null) !== req.headers.apiKey) {
    return res.status(401).json({ error: 'Not authorized.' });
  }

  next();
}

module.exports = authCheck;
