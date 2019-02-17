const _ = require('lodash');

function authCheck(req, res, next) {
  if (!_.get(this, ['config', 'apiAuth', 'access'], false)) return next();

  if (_.get(this, ['config', 'apiAuth', 'secret'], null) !== req.query.apiKey)
    return res.status(401).json({ error: 'Not authorized.' });

  next();
}

module.exports = authCheck;
