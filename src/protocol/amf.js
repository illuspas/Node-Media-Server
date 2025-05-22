/**
 * Created by delian on 3/12/14.
 * This module provides encoding and decoding of the AMF0 format
 */

const logger = require("../core/logger.js");

const amf0dRules = {
  0x00: amf0decNumber,
  0x01: amf0decBool,
  0x02: amf0decString,
  0x03: amf0decObject,
  //    0x04: amf0decMovie, // Reserved
  0x05: amf0decNull,
  0x06: amf0decUndefined,
  0x07: amf0decRef,
  0x08: amf0decArray,
  // 0x09: amf0decObjEnd, // Should never happen normally
  0x0A: amf0decSArray,
  0x0B: amf0decDate,
  0x0C: amf0decLongString,
  //    0x0D: amf0decUnsupported, // Has been never originally implemented by Adobe!
  //    0x0E: amf0decRecSet, // Has been never originally implemented by Adobe!
  0x0F: amf0decXmlDoc,
  0x10: amf0decTypedObj,
};

const amf0eRules = {
  "string": amf0encString,
  "integer": amf0encNumber,
  "double": amf0encNumber,
  "xml": amf0encXmlDoc,
  "object": amf0encObject,
  "array": amf0encArray,
  "sarray": amf0encSArray,
  "binary": amf0encString,
  "true": amf0encBool,
  "false": amf0encBool,
  "undefined": amf0encUndefined,
  "null": amf0encNull
};

/**
 *
 * @param {any} o
 * @returns {string}
 */
function amfType(o) {
  let jsType = typeof o;

  if (o === null) return "null";
  if (jsType == "undefined") return "undefined";
  if (jsType == "number") {
    if (parseInt(o) == o) return "integer";
    return "double";
  }
  if (jsType == "boolean") return o ? "true" : "false";
  if (jsType == "string") return "string";
  if (jsType == "object") {
    if (o instanceof Array) {
      if (o.sarray) return "sarray";
      return "array";
    }
    return "object";
  }
  throw new Error("Unsupported type!");
}

// AMF0 Implementation

/**
 * AMF0 Decode Number
 * @param {Buffer} buf
 * @returns {{len: number, value: (* | number)}}
 */
function amf0decNumber(buf) {
  return { len: 9, value: buf.readDoubleBE(1) };
}

/**
 * AMF0 Encode Number
 * @param {number} num
 * @returns {Buffer}
 */
function amf0encNumber(num) {
  let buf = Buffer.alloc(9);
  buf.writeUInt8(0x00, 0);
  buf.writeDoubleBE(num, 1);
  return buf;
}

/**
 * AMF0 Decode Boolean
 * @param {Buffer} buf
 * @returns {{len: number, value: boolean}}
 */
function amf0decBool(buf) {
  return { len: 2, value: (buf.readUInt8(1) != 0) };
}

/**
 * AMF0 Encode Boolean
 * @param {number} num
 * @returns {Buffer}
 */
function amf0encBool(num) {
  let buf = Buffer.alloc(2);
  buf.writeUInt8(0x01, 0);
  buf.writeUInt8((num ? 1 : 0), 1);
  return buf;
}

/**
 * AMF0 Decode Null
 * @returns {{len: number, value: null}}
 */
function amf0decNull() {
  return { len: 1, value: null };
}

/**
 * AMF0 Encode Null
 * @returns {Buffer}
 */
function amf0encNull() {
  let buf = Buffer.alloc(1);
  buf.writeUInt8(0x05, 0);
  return buf;
}

/**
 * AMF0 Decode Undefined
 * @returns {{len: number, value: undefined}}
 */
function amf0decUndefined() {
  return { len: 1, value: undefined };
}

/**
 * AMF0 Encode Undefined
 * @returns {Buffer}
 */
function amf0encUndefined() {
  let buf = Buffer.alloc(1);
  buf.writeUInt8(0x06, 0);
  return buf;
}

/**
 * AMF0 Decode Date
 * @param {Buffer} buf
 * @returns {{len: number, value: (* | number)}}
 */
function amf0decDate(buf) {
  //    let s16 = buf.readInt16BE(1);
  let ts = buf.readDoubleBE(3);
  return { len: 11, value: ts };
}

/**
 * AMF0 Encode Date
 * @param {number} ts
 * @returns {Buffer}
 */
function amf0encDate(ts) {
  let buf = Buffer.alloc(11);
  buf.writeUInt8(0x0B, 0);
  buf.writeInt16BE(0, 1);
  buf.writeDoubleBE(ts, 3);
  return buf;
}

/**
 * AMF0 Decode Object
 * @param {Buffer} buf
 * @returns {{len: number, value: {}}}
 */
function amf0decObject(buf) { // TODO: Implement references!
  let obj = {};
  let iBuf = buf.slice(1);
  let len = 1;
  //    logger.debug('ODec',iBuf.readUInt8(0));
  while (iBuf.readUInt8(0) != 0x09) {
    // logger.debug('Field', iBuf.readUInt8(0), iBuf);
    let prop = amf0decUString(iBuf);
    // logger.debug('Got field for property', prop);
    len += prop.len;
    if (iBuf.length < prop.len) {
      break;
    }
    if (iBuf.slice(prop.len).readUInt8(0) == 0x09) {
      len++;
      // logger.debug('Found the end property');
      break;
    } // END Object as value, we shall leave
    if (prop.value == "") break;
    let val = amf0DecodeOne(iBuf.slice(prop.len));
    // logger.debug('Got field for value', val);
    obj[prop.value] = val.value;
    len += val.len;
    iBuf = iBuf.slice(prop.len + val.len);
  }
  return { len: len, value: obj };
}

/**
 * AMF0 Encode Object
 * @param {object} o
 * @returns {Buffer} 
 */
function amf0encObject(o) {
  if (typeof o !== "object") return null;

  let data = Buffer.alloc(1);
  data.writeUInt8(0x03, 0); // Type object
  let k;
  for (k in o) {
    data = Buffer.concat([data, amf0encUString(k), amf0EncodeOne(o[k])]);
  }
  let termCode = Buffer.alloc(1);
  termCode.writeUInt8(0x09, 0);
  return Buffer.concat([data, amf0encUString(""), termCode]);
}

/**
 * AMF0 Decode Reference
 * @param {Buffer} buf
 * @returns {{len: number, value: string}}
 */
function amf0decRef(buf) {
  let index = buf.readUInt16BE(1);
  return { len: 3, value: "ref" + index };
}

/**
 * AMF0 Encode Reference
 * @param {number} index
 * @returns {Buffer}
 */
function amf0encRef(index) {
  let buf = Buffer.alloc(3);
  buf.writeUInt8(0x07, 0);
  buf.writeUInt16BE(index, 1);
  return buf;
}

/**
 * AMF0 Decode String
 * @param {Buffer} buf
 * @returns {{len: *, value: (* | string | string)}}
 */
function amf0decString(buf) {
  let sLen = buf.readUInt16BE(1);
  return { len: 3 + sLen, value: buf.toString("utf8", 3, 3 + sLen) };
}

/**
 * AMF0 Decode Untyped (without the type byte) String
 * @param {Buffer} buf
 * @returns {{len: *, value: (* | string | string)}}
 */
function amf0decUString(buf) {
  let sLen = buf.readUInt16BE(0);
  return { len: 2 + sLen, value: buf.toString("utf8", 2, 2 + sLen) };
}

/**
 * Do AMD0 Encode of Untyped String
 * @param {string} str
 * @returns {Buffer}
 */
function amf0encUString(str) {
  let data = Buffer.from(str, "utf8");
  let sLen = Buffer.alloc(2);
  sLen.writeUInt16BE(data.length, 0);
  return Buffer.concat([sLen, data]);
}

/**
 * AMF0 Encode String
 * @param {string} str
 * @returns {Buffer}
 */
function amf0encString(str) {
  let buf = Buffer.alloc(3);
  buf.writeUInt8(0x02, 0);
  buf.writeUInt16BE(str.length, 1);
  return Buffer.concat([buf, Buffer.from(str, "utf8")]);
}

/**
 * AMF0 Decode Long String
 * @param {Buffer} buf
 * @returns {{len: *, value: (* | string | string)}}
 */
function amf0decLongString(buf) {
  let sLen = buf.readUInt32BE(1);
  return { len: 5 + sLen, value: buf.toString("utf8", 5, 5 + sLen) };
}

/**
 * AMF0 Encode Long String
 * @param {string} str
 * @returns {Buffer}
 */
function amf0encLongString(str) {
  let buf = Buffer.alloc(5);
  buf.writeUInt8(0x0C, 0);
  buf.writeUInt32BE(str.length, 1);
  return Buffer.concat([buf, Buffer.from(str, "utf8")]);
}

/**
 * AMF0 Decode Array
 * @param {Buffer} buf
 * @returns {{len: *, value: ({}|*)}}
 */
function amf0decArray(buf) {
  //    let count = buf.readUInt32BE(1);
  let obj = amf0decObject(buf.slice(4));
  return { len: 5 + obj.len, value: obj.value };
}

/**
 * AMF0 Encode Array
 * @param {Array} a
 * @returns {Buffer}
 */
function amf0encArray(a) {
  let l = 0;
  if (a instanceof Array) l = a.length; else l = Object.keys(a).length;
  logger.debug("Array encode", l, a);
  let buf = Buffer.alloc(5);
  buf.writeUInt8(8, 0);
  buf.writeUInt32BE(l, 1);
  let data = amf0encObject(a);
  return Buffer.concat([buf, data.subarray(1)]);
}

/**
 * AMF0 Encode Binary Array into binary Object
 * @param {Buffer} aData
 * @returns {Buffer}
 */
function amf0cnletray2Object(aData) {
  let buf = Buffer.alloc(1);
  buf.writeUInt8(0x3, 0); // Object id
  return Buffer.concat([buf, aData.slice(5)]);
}

/**
 * AMF0 Encode Binary Object into binary Array
 * @param {Buffer} oData
 * @returns {Buffer}
 */
function amf0cnvObject2Array(oData) {
  let buf = Buffer.alloc(5);
  let o = amf0decObject(oData);
  let l = Object.keys(o).length;
  buf.writeUInt32BE(l, 1);
  return Buffer.concat([buf, oData.slice(1)]);
}

/**
 * AMF0 Decode XMLDoc
 * @param {Buffer} buf
 * @returns {{len: *, value: (* | string | string)}}
 */
function amf0decXmlDoc(buf) {
  let sLen = buf.readUInt16BE(1);
  return { len: 3 + sLen, value: buf.toString("utf8", 3, 3 + sLen) };
}

/**
 * AMF0 Encode XMLDoc
 * @param {string} str
 * @returns {Buffer}
 */
function amf0encXmlDoc(str) { // Essentially it is the same as string
  let buf = Buffer.alloc(3);
  buf.writeUInt8(0x0F, 0);
  buf.writeUInt16BE(str.length, 1);
  return Buffer.concat([buf, Buffer.from(str, "utf8")]);
}

/**
 * AMF0 Decode Strict Array
 * @param {Buffer} buf
 * @returns {{len: number, value: Array}}
 */
function amf0decSArray(buf) {
  let a = [];
  let len = 5;
  let ret;
  for (let count = buf.readUInt32BE(1); count; count--) {
    ret = amf0DecodeOne(buf.slice(len));
    a.push(ret.value);
    len += ret.len;
  }
  return { len: len, value: amf0markSArray(a) };
}

/**
 * AMF0 Encode Strict Array
 * @param {Array} a Array
 * @returns {Buffer}
 */
function amf0encSArray(a) {
  logger.debug("Do strict array!");
  let buf = Buffer.alloc(5);
  buf.writeUInt8(0x0A, 0);
  buf.writeUInt32BE(a.length, 1);
  let i;
  for (i = 0; i < a.length; i++) {
    buf = Buffer.concat([buf, amf0EncodeOne(a[i])]);
  }
  return buf;
}

/**
 *
 * @param {Array} a
 * @returns {Array}
 */
function amf0markSArray(a) {
  Object.defineProperty(a, "sarray", { value: true });
  return a;
}

/**
 * AMF0 Decode Typed Object
 * @param {Buffer} buf
 * @returns {{len: number, value: ({}|*)}}
 */
function amf0decTypedObj(buf) {
  let className = amf0decString(buf);
  let obj = amf0decObject(buf.slice(className.len - 1));
  obj.value.__className__ = className.value;
  return { len: className.len + obj.len - 1, value: obj.value };
}


/**
 * AMF0 Encode Typed Object
 */
function amf0encTypedObj() {
  throw new Error("Error: SArray encoding is not yet implemented!"); // TODO: Error
}

/**
 * Decode one value from the Buffer according to the applied rules
 * @param {Array} rules
 * @param {Buffer} buffer
 * @returns {*}
 */
function amfXDecodeOne(rules, buffer) {
  if (!rules[buffer.readUInt8(0)]) {
    logger.error("Unknown field", buffer.readUInt8(0));
    return null;
  }
  return rules[buffer.readUInt8(0)](buffer);
}

/**
 * Decode one AMF0 value
 * @param {Buffer} buffer
 * @returns {*}
 */
function amf0DecodeOne(buffer) {
  return amfXDecodeOne(amf0dRules, buffer);
}


/**
 * Decode a whole buffer of AMF values according to rules and return in array
 * @param {Array} rules
 * @param {Buffer} buffer
 * @returns {Array}
 */
function amfXDecode(rules, buffer) {
  // We shall receive clean buffer and will respond with an array of values
  let resp = [];
  let res;
  for (let i = 0; i < buffer.length;) {
    res = amfXDecodeOne(rules, buffer.slice(i));
    i += res.len;
    resp.push(res.value); // Add the response
  }
  return resp;
}

/**
 * Decode a buffer of AMF0 values
 * @param {Buffer} buffer
 * @returns {Array}
 */
function amf0Decode(buffer) {
  return amfXDecode(amf0dRules, buffer);
}

/**
 * Encode one AMF value according to rules
 * @param {Array} rules
 * @param {object} o
 * @returns {*}
 */
function amfXEncodeOne(rules, o) {
  //    logger.debug('amfXEncodeOne type',o,amfType(o),rules[amfType(o)]);
  let f = rules[amfType(o)];
  if (f) return f(o);
  throw new Error("Unsupported type for encoding!");
}

/**
 * Encode one AMF0 value
 * @param {object} o
 * @returns {*}
 */
function amf0EncodeOne(o) {
  return amfXEncodeOne(amf0eRules, o);
}

/**
 * Encode an array of values into a buffer
 * @param {Array} a
 * @returns {Buffer}
 */
function amf0Encode(a) {
  let buf = Buffer.alloc(0);
  a.forEach(function (o) {
    buf = Buffer.concat([buf, amf0EncodeOne(o)]);
  });
  return buf;
}


const rtmpCmdCode = {
  "_result": ["transId", "cmdObj", "info"],
  "_error": ["transId", "cmdObj", "info", "streamId"], // Info / Streamid are optional
  "onStatus": ["transId", "cmdObj", "info"],
  "releaseStream": ["transId", "cmdObj", "streamName"],
  "getStreamLength": ["transId", "cmdObj", "streamId"],
  "getMovLen": ["transId", "cmdObj", "streamId"],
  "FCPublish": ["transId", "cmdObj", "streamName"],
  "FCUnpublish": ["transId", "cmdObj", "streamName"],
  "FCSubscribe": ["transId", "cmdObj", "streamName"],
  "onFCPublish": ["transId", "cmdObj", "info"],
  "connect": ["transId", "cmdObj", "args"],
  "call": ["transId", "cmdObj", "args"],
  "createStream": ["transId", "cmdObj"],
  "close": ["transId", "cmdObj"],
  "play": ["transId", "cmdObj", "streamName", "start", "duration", "reset"],
  "play2": ["transId", "cmdObj", "params"],
  "deleteStream": ["transId", "cmdObj", "streamId"],
  "closeStream": ["transId", "cmdObj"],
  "receiveAudio": ["transId", "cmdObj", "bool"],
  "receiveVideo": ["transId", "cmdObj", "bool"],
  "publish": ["transId", "cmdObj", "streamName", "type"],
  "seek": ["transId", "cmdObj", "ms"],
  "pause": ["transId", "cmdObj", "pause", "ms"]
};

const rtmpDataCode = {
  "@setDataFrame": ["method", "dataObj"],
  "onFI": ["info"],
  "onMetaData": ["dataObj"],
  "|RtmpSampleAccess": ["bool1", "bool2"],
};


/**
 * Decode a data!
 * @param {Buffer} dbuf
 * @returns {{cmd: (* | string | string | *), value: *}}
 */
function decodeAmf0Data(dbuf) {
  let buffer = dbuf;
  let resp = {};

  let cmd = amf0DecodeOne(buffer);
  if (cmd) {
    resp.cmd = cmd.value;
    buffer = buffer.slice(cmd.len);

    if (rtmpDataCode[cmd.value]) {
      rtmpDataCode[cmd.value].forEach(function (n) {
        if (buffer.length > 0) {
          let r = amf0DecodeOne(buffer);
          if (r) {
            buffer = buffer.slice(r.len);
            resp[n] = r.value;
          }
        }
      });
    } else {
      logger.error("Unknown command", resp);
    }
  }

  return resp;
}

/**
 * Decode a command!
 * @param {Buffer} dbuf
 * @returns {{cmd: (* | string | string | *), value: *}}
 */
function decodeAmf0Cmd(dbuf) {
  let buffer = dbuf;
  let resp = {};

  let cmd = amf0DecodeOne(buffer);
  if (!cmd) {
    logger.error("Failed to decode AMF0 command");
    return resp;
  }
  
  resp.cmd = cmd.value;
  buffer = buffer.slice(cmd.len);

  if (rtmpCmdCode[cmd.value]) {
    rtmpCmdCode[cmd.value].forEach(function (n) {
      if (buffer.length > 0) {
        let r = amf0DecodeOne(buffer);
        buffer = buffer.slice(r.len);
        resp[n] = r.value;
      }
    });
  } else {
    logger.error("Unknown command", resp);
  }
  return resp;
}

/**
 * Encode AMF0 Command
 * @param {object} opt
 * @returns {*}
 */
function encodeAmf0Cmd(opt) {
  let data = amf0EncodeOne(opt.cmd);

  if (rtmpCmdCode[opt.cmd]) {
    rtmpCmdCode[opt.cmd].forEach(function (n) {
      if (Object.prototype.hasOwnProperty.call(opt, n))
        data = Buffer.concat([data, amf0EncodeOne(opt[n])]);
    });
  } else {
    logger.error("Unknown command", opt);
  }
  // logger.debug('Encoded as',data.toString('hex'));
  return data;
}

/**
 *
 * @param {object} opt
 * @returns {Buffer}
 */
function encodeAmf0Data(opt) {
  let data = amf0EncodeOne(opt.cmd);

  if (rtmpDataCode[opt.cmd]) {
    rtmpDataCode[opt.cmd].forEach(function (n) {
      if (Object.prototype.hasOwnProperty.call(opt, n))
        data = Buffer.concat([data, amf0EncodeOne(opt[n])]);
    });
  } else {
    logger.error("Unknown data", opt);
  }
  // logger.debug('Encoded as',data.toString('hex'));
  return data;
}


module.exports = {
  decodeAmf0Cmd,
  encodeAmf0Cmd,
  decodeAmf0Data,
  encodeAmf0Data,
  amf0Encode,
  amf0EncodeOne,
  amf0Decode,
  amf0DecodeOne,
};
