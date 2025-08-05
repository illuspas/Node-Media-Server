# http2-express
This package adds HTTP/2 support to express.js applications.

**NOTICE**: This package is fully compatible with the old [http2-express-bridge](https://www.npmjs.com/package/http2-express-bridge). You should be able to replace the old package [http2-express-bridge](https://www.npmjs.com/package/http2-express-bridge) with this new one ("**http2-express**") without changing anything in your code, except the package name in the import (see usage below).

**Version 1.0.1** fixes an issue with h2c (running HTTP/2 without TLS) as reported by rickardkarlsson. You should now be able to create a non https server (http2.createServer.....) without any issues.

## Installation
```bash
npm i http2-express
```

**Notice**: It is recommended to use Node.js **version 19** or higher.

    
## Usage
```javascript
const express = require('express');
const http2 = require('http2');
const http2Express = require('http2-express');
const fs = require('fs');

const app = http2Express(express);

app.get('/', (req, res) => {
  res.send('Hello World!');
});

const options = {
  key: fs.readFileSync('path to your certificate key'),
  cert: fs.readFileSync('path to your certificate'),
  passphrase: 'your certificate passphrase',
  allowHTTP1: false
};

const server = http2.createSecureServer(options, app);

server.listen(44320, () => {
  console.info('Listening on port 44320...');
});

```
The code above creates an HTTP/2 server. An HTTP/2 server performs better than the older HTTP/1.1.

**Notice**: If option property "allowHTTP1" is set to true, then your server will be backward compatible with HTTP/1.1. If false, then only the new HTTP/2 is supported. Browsers and HTTP Clients that don't support HTTP/2 will error out if "allowHTTP1" is false.

ESModule "import" syntax is also supported.

**NOTICE**: While the old [http2-express-bridge](https://www.npmjs.com/package/http2-express-bridge) provided support for Server Push, this package does not support Server Push because all major browsers and HTTP/2 Clients no longer support it. For example, Server Push has been disable in Chrome since version 106. The reason behind it is that Server Push did not provide significant performance gains, and in many cases, the performance actually decreased.

