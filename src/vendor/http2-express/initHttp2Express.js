const initHttp2Express = (app) => (req, res, next) => {
  if (app.enabled('x-powered-by')) {
    res.setHeader('X-Powered-By', 'HTTP/2 Express (http2-express)');
  }
  req.res = res;
  res.req = req;
  req.next = next;

  const alpnProtocol = req.httpVersion === '2.0' ? req.stream.session.alpnProtocol : 'h1';

  if (alpnProtocol && (alpnProtocol === 'h2' || alpnProtocol === 'h2c')) {
    Object.setPrototypeOf(req, app.http2Request);
    Object.setPrototypeOf(res, app.http2Response);
  } else {
    Object.setPrototypeOf(req, app.request);
    Object.setPrototypeOf(res, app.response);
  }

  res.locals = res.locals || Object.create(null);
  next();
};

module.exports = initHttp2Express;
