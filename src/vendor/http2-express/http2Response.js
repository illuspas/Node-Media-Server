const { Http2ServerResponse } = require('http2');

const createHttp2Response = (response) => {
  const http2Response = Object.create(Http2ServerResponse.prototype);

  // Copying properties and descriptors from response to http2Response.
  Object.getOwnPropertyNames(response).forEach((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(response, key);
    if (descriptor) {
      Object.defineProperty(http2Response, key, descriptor);
    }
  });

  // Copy symbols from response to http2Response.
  Object.getOwnPropertySymbols(response).forEach((symbol) => {
    const descriptor = Object.getOwnPropertyDescriptor(response, symbol);
    if (descriptor) {
      Object.defineProperty(http2Response, symbol, descriptor);
    }
  });

  return http2Response;
};

module.exports = createHttp2Response;
