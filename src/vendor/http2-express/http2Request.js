/* eslint-disable dot-notation */
const { Http2ServerRequest } = require('http2');

const createHttp2Request = (request) => {
  const http2Request = Object.create(Http2ServerRequest.prototype);

  // Copying properties and descriptors from request to http2Request.
  Object.getOwnPropertyNames(request).forEach((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(request, key);
    if (descriptor) {
      Object.defineProperty(http2Request, key, descriptor);
    }
  });

  // Retain symbols, if any, from request.
  Object.getOwnPropertySymbols(request).forEach((symbol) => {
    const descriptor = Object.getOwnPropertyDescriptor(request, symbol);
    if (descriptor) {
      Object.defineProperty(http2Request, symbol, descriptor);
    }
  });

  const requestHostName = Object.getOwnPropertyDescriptor(http2Request, 'hostname')?.get;

  // Redefine hostname property with custom getter.
  if (requestHostName) {
    Object.defineProperty(http2Request, 'hostname', {
      get() {
        if (!this.headers['host'] && this.authority) {
          this.headers['host'] = this.authority;
        }
        return requestHostName.call(this);
      }
    });
  }

  return http2Request;
};

module.exports = createHttp2Request;
