// The Definitive Guide to HTML5 WebSocket
// WebSocket server

// See The WebSocket Protocol for the official specification
// http://tools.ietf.org/html/rfc6455

var events = require("events");
var http = require("http");
var crypto = require("crypto");
var url = require('url');
var util = require("util");
// opcodes for WebSocket frames
// http://tools.ietf.org/html/rfc6455#section-5.2
var opcodes = {
  TEXT: 1
  , BINARY: 2
  , CLOSE: 8
  , PING: 9
  , PONG: 10
};

var WebSocketConnection = function (req, socket, upgradeHead) {
  var self = this;
  self.uri = req.url;
  var key = hashWebSocketKey(req.headers["sec-websocket-key"])
  // handshake response
  // http://tools.ietf.org/html/rfc6455#section-4.2.2
  socket.write('HTTP/1.1 101 Web Socket Protocol Handshake\r\n' +
    'Upgrade: WebSocket\r\n' +
    'Connection: Upgrade\r\n' +
    'sec-websocket-accept: ' + key +
    '\r\n\r\n');

  socket.on("data", function (buf) {
    self.buffer = Buffer.concat([self.buffer, buf]);
    while (self._processBuffer()) {
      // process buffer while it contains complete frames
    }
  });

  socket.on("close", function (had_error) {
    if (!self.closed) {
      self.emit("close", 1006);
      self.closed = true;
    }
  });

  // initialize connection state
  this.socket = socket;
  this.buffer = new Buffer(0);
  this.closed = false;
}
util.inherits(WebSocketConnection, events.EventEmitter);

// Send a text or binary message on the WebSocket connection
WebSocketConnection.prototype.send = function (obj) {
  var opcode;
  var payload;
  if (Buffer.isBuffer(obj)) {
    opcode = opcodes.BINARY;
    payload = obj;
  } else if (typeof obj == "string") {
    opcode = opcodes.TEXT;
    // create a new buffer containing the UTF-8 encoded string
    payload = new Buffer(obj, "utf8");
  } else {
    throw new Error("Cannot send object. Must be string or Buffer");
  }
  this._doSend(opcode, payload);
}

// Close the WebSocket connection
WebSocketConnection.prototype.close = function (code, reason) {
  var opcode = opcodes.CLOSE;
  var buffer;
  // encode close and reason
  if (code) {
    buffer = new Buffer(Buffer.byteLength(reason) + 2);
    buffer.writeUInt16BE(code, 0);
    buffer.write(reason, 2);
  } else {
    buffer = new Buffer(0);
  }
  this._doSend(opcode, buffer);
  this.closed = true;
}

// Process incoming bytes
WebSocketConnection.prototype._processBuffer = function () {
  var buf = this.buffer;

  if (buf.length < 2) {
    // insufficient data read
    return;
  }

  var idx = 2;

  var b1 = buf.readUInt8(0);
  var fin = b1 & 0x80;
  var opcode = b1 & 0x0f;      // low four bits
  var b2 = buf.readUInt8(1);
  var mask = b2 & 0x80;
  var length = b2 & 0x7f;       // low 7 bits

  if (length > 125) {
    if (buf.length < 8) {
      // insufficient data read
      return;
    }

    if (length == 126) {
      length = buf.readUInt16BE(2);
      idx += 2;
    } else if (length == 127) {
      // discard high 4 bits because this server cannot handle huge lengths
      var highBits = buf.readUInt32BE(2);
      if (highBits != 0) {
        this.close(1009, "");
      }
      length = buf.readUInt32BE(6);
      idx += 8;
    }
  }

  if (buf.length < idx + 4 + length) {
    // insufficient data read
    return;
  }

  maskBytes = buf.slice(idx, idx + 4);
  idx += 4;
  var payload = buf.slice(idx, idx + length);
  payload = unmask(maskBytes, payload);
  this._handleFrame(opcode, payload);

  this.buffer = buf.slice(idx + length);
  return true;
}

WebSocketConnection.prototype._handleFrame = function (opcode, buffer) {
  var payload;
  switch (opcode) {
    case opcodes.TEXT:
      payload = buffer.toString("utf8");
      this.emit("data", opcode, payload);
      break;
    case opcodes.BINARY:
      payload = buffer;
      this.emit("data", opcode, payload);
      break;
    case opcodes.PING:
      // respond to pings with pongs
      this._doSend(opcodes.PONG, buffer);
      break;
    case opcodes.PONG:
      // ignore pongs
      break;
    case opcodes.CLOSE:
      // parse close and reason
      var code, reason;
      if (buffer.length >= 2) {
        code = buffer.readUInt16BE(0);
        reason = buffer.toString("utf8", 2);
      }
      this.close(code, reason);
      this.emit("close", code, reason);
      break;
    default:
      this.close(1002, "unknown opcode");
  }
}

// Format and send a WebSocket message
WebSocketConnection.prototype._doSend = function (opcode, payload) {
  this.socket.write(encodeMessage(opcode, payload));
}

var KEY_SUFFIX = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
var hashWebSocketKey = function (key) {
  var sha1 = crypto.createHash("sha1");
  sha1.update(key + KEY_SUFFIX, "ascii");
  return sha1.digest("base64");
}

var unmask = function (maskBytes, data) {
  var payload = new Buffer(data.length);
  for (var i = 0; i < data.length; i++) {
    payload[i] = maskBytes[i % 4] ^ data[i];
  }
  return payload;
}

var encodeMessage = function (opcode, payload) {
  var buf;
  // first byte: fin and opcode
  var b1 = 0x80 | opcode;   // always send message as one frame (fin)

  // second byte: maks and length part 1
  // followed by 0, 2, or 4 additional bytes of continued length
  var b2 = 0; // server does not mask frames
  var length = payload.length;
  if (length < 126) {
    buf = new Buffer(payload.length + 2 + 0);     // zero extra bytes
    b2 |= length;
    buf.writeUInt8(b1, 0);
    buf.writeUInt8(b2, 1);
    payload.copy(buf, 2);
  } else if (length < (1 << 16)) {
    buf = new Buffer(payload.length + 2 + 2);     // two bytes extra
    b2 |= 126;
    buf.writeUInt8(b1, 0);
    buf.writeUInt8(b2, 1);
    // add two byte length
    buf.writeUInt16BE(length, 2);
    payload.copy(buf, 4);
  } else {
    buf = new Buffer(payload.length + 2 + 8);     // eight bytes extra
    b2 |= 127;
    buf.writeUInt8(b1, 0);
    buf.writeUInt8(b2, 1);
    // add eight byte length
    // note: this implementation cannot handle lengths greater than 2^32
    // the 32 bit length is prefixed with 0x0000
    buf.writeUInt32BE(0, 2);
    buf.writeUInt32BE(length, 6);
    payload.copy(buf, 10);
  }
  return buf;
}

exports.listen = function (port, host, connectionHandler) {
  var srv = http.createServer(function (req, res) {
    //console.log("hi,all");
    req.setEncoding('utf-8');
    var postData = "";
    // 数据块接收中
    req.addListener("data", function (postDataChunk) {
      console.log(postData);
      postData += postDataChunk;
    });
  });

  srv.on('upgrade', function (req, socket, upgradeHead) {
    console.log(req.url);
    req.setEncoding('utf-8');
    var postData = "";
    // 数据块接收中
    req.addListener("data", function (postDataChunk) {
      console.log(postData);
      postData += postDataChunk;
    });
    var ws = new WebSocketConnection(req, socket, upgradeHead);
    connectionHandler(ws);
  });

  srv.listen(port, host);
};

