const rtmpCmdDecode = {
    "_result": ["transId", "cmdObj", "info"],
    "_error": ["transId", "cmdObj", "info", "streamId"], // Info / Streamid are optional
    "onStatus": ["transId", "cmdObj", "info"],
    "releaseStream": ["transId", "cmdObj", "streamId"],
    "getStreamLength": ["transId", "cmdObj", "streamId"],
    "getMovLen": ["transId", "cmdObj", "streamId"],
    "FCPublish": ["transId", "cmdObj", "streamId"],
    "FCUnpublish": ["transId", "cmdObj", "streamId"],
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

const rtmpDataDecode = {
    "@setDataFrame": ["method", "dataObj"],
    "onMetaData": ["cmdObj"],
    "|RtmpSampleAccess": ["bool1", "bool2"],
};

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
    0x11: amf0decSwitchAmf3
};
const amf3dRules = {
    0x00: amf0decUndefined,
    0x01: amf0decNull,
    0x02: amf3decFalse,
    0x03: amf3decTrue,
    0x04: amf3decInteger,
    0x05: amf0decNumber,
    0x06: amf3decString,
    0x07: amf3decString,
    0x08: amf3decDate,
    0x09: amf3decArray,
    0x0A: amf3decObject,
    0x0B: amf3decString,
    0x0C: amf3decByteArray //,
        //    0x0D: amf3decVecInt,
        //    0x0E: amf3decVecUInt,
        //    0x0F: amf3decVecDouble,
        //    0x10: amf3decVecObject,
        //    0x11: amf3decDict // No dictionary support for the moment!
};

function amf3decObject(offset) {
    var obj = {};
    let pos = 0;
    return obj;
}

function amf3decByteArray(buf) {
    let sLen = amf3decUI29.call(this, offset);
    let s = sLen & 1;
    sLen = sLen >> 1; // The real length without the lowest bit
    offset = this.offset
    this.offset = offset + sLen
    if (s) return this.buffer.slice(offset, this.offset)
    throw new Error("Error, we have a need to decode a String that is a Reference"); // TODO: Implement references!
}

function amf3decArray(offset) {
    let count = amf3decUI29.call(this, offset);
    if (count % 2 == 1) throw new Error("This is a reference to another array, which currently we don't support!");
    return amf3decObject.call(this, this.offset)
}

function amf3decDate(offset) { // The UI29 should be 1
    let uTz = amf3decUI29.call(this, offset);
    this.offset += 8
    return this.buffer.readDoubleBE(this.offset - 8);
}

function amf3decString(offset) {
    let sLen = amf3decUI29.call(this, offset);
    let s = sLen & 1;
    sLen = sLen >> 1; // The real length without the lowest bit
    offset = this.offset
    this.offset = offset + sLen
    if (s) return this.buffer.toString('utf8', offset, this.offset);
    throw new Error("Error, we have a need to decode a String that is a Reference"); // TODO: Implement references!
}

function amf3decUI29(offset) {
    let val = 0;
    let b;
    do {
        b = this.buffer.readUInt8(offset++);
        val = (val << 7) + (b & 0x7F);
    } while (offset < 5 || b > 0x7F);

    if (offset == 5) val = val | b; // Preserve the major bit of the last byte
    this.offset = offset
    return val
}

function amf3decInteger(offset) { // Invert the integer
    let resp = amf3decUI29.call(this, offset);
    return resp > 0x0FFFFFFF ? (resp & 0x0FFFFFFF) - 0x10000000 : resp;
}

function amf3decFalse(offset) {
    this.offset = offset
    return false
}

function amf3decTrue(offset) {
    this.offset = offset
    return true
}

function amf0decSwitchAmf3(offset) {
    return amf3DecodeOne(this);
}

function amf0decTypedObj(offset) {
    let className = amf0decString.call(this, offset);
    let obj = amf0decObject.call(this, this.offset);
    obj.__className__ = className;
    return obj
}

function amf0decXmlDoc(offset) {
    let sLen = this.buffer.readUInt16BE(offset);
    this.offset = offset + sLen + 2
    return this.buffer.toString('utf8', offset + 2, this.offset)
}

function amf0decDate(offset) {
    this.offset = offset + 10
        //    var s16 = buf.readInt16BE(1);
    return this.buffer.readDoubleBE(offset + 2);
}

function amf0decLongString(offset) {
    let sLen = this.buffer.readUInt32BE(offset);
    this.offset = offset + sLen + 4
    return this.buffer.toString('utf8', offset + 4, this.offset)
}

function amf0decNull(offset) {
    this.offset = offset
    return null
}

function amf0decUndefined(offset) {
    this.offset = offset
    return undefined
}

function amf0decRef(offset) {
    this.offset = offset + 1
    return 'ref' + this.buffer.readUInt16BE(offset);
}

function amf0decNumber(offset) {
    this.offset = offset + 8
    return this.buffer.readDoubleBE(offset)
}

function amf0decBool(offset) {
    this.offset = offset + 1
    return this.buffer.readUInt8(offset) != 0
}

function amf0decString(offset) {
    this.offset = offset + 2 + this.buffer.readUInt16BE(offset);
    return this.buffer.toString('utf8', 2 + offset, this.offset)
}

function amf0decUString(offset) {
    this.offset = offset + 2 + this.buffer.readUInt16BE(offset);
    return this.buffer.toString('utf8', 2 + offset, this.offset)
}

function amf0decArray(offset) {
    this.offset = offset + 4
    return amf0decObject.call(this, this.offset)
}

function amf0decSArray(offset) {
    let a = [];
    Object.defineProperty(a, 'sarray', { value: true });
    for (var count = buf.readUInt32BE(offset); count; count--) {
        this.offset = offset + 4
        a.push(amf0DecodeOne(this));
        offset = this.offset
    }
    return a
}

function amf0decObject(offset) { // TODO: Implement references!
    let obj = {};
    this.offset = offset;
    //    console.log('ODec',iBuf.readUInt8(0));
    while (this.buffer.readUInt8(this.offset) != 0x09) {
        // console.log('Field', iBuf.readUInt8(0), iBuf);
        let prop = amf0decUString.call(this, this.offset);
        // console.log('Got field for property', prop);
        if (this.buffer.readUInt8(this.offset) == 0x09) {
            this.offset++
                // console.log('Found the end property');
                break;
        } // END Object as value, we shall leave
        if (prop == '') break;
        obj[prop] = amf0DecodeOne(this);
    }
    return obj
}

function amf0DecodeOne(context) {
    return amfXDecodeOne(amf0dRules, context);
}

function amfXDecodeOne(rules, context) {
    let type = context.buffer.readUInt8(context.offset)
    if (!rules[type]) {
        console.error('Unknown field', type);
        return null;
    }
    return rules[type].call(context, context.offset + 1);
}

function decodeAmf0Cmd(buffer) {
    let context = { offset: 0, buffer }
    let resp = { cmd: amf0DecodeOne(context) };
    if (rtmpCmdDecode[resp.cmd]) {
        rtmpCmdDecode[resp.cmd].forEach(n => {
            if (context.offset < buffer.length) {
                resp[n] = amf0DecodeOne(context);
            }
        });
    } else {
        console.log('Unknown command', resp);
    }
    return resp
}

function amf3DecodeOne(context) {
    return amfXDecodeOne(amf3dRules, context);
}

function decodeAmf3Cmd(buffer) {
    let context = { offset: 0, buffer }
    let resp = { cmd: amf3DecodeOne(context) };
    if (rtmpCmdDecode[resp.cmd]) {
        rtmpCmdDecode[resp.cmd].forEach(n => {
            if (context.offset < buffer.length) {
                resp[n] = amf3DecodeOne(context);
            }
        });
    } else {
        console.log('Unknown command', resp);
    }
    return resp
}

function decodeAmf0Data(buffer) {
    let context = { offset: 0, buffer }
    let resp = { cmd: amf0DecodeOne(context) };
    if (rtmpDataDecode[resp.cmd]) {
        rtmpDataDecode[resp.cmd].forEach(n => {
            if (context.offset < buffer.length) {
                resp[n] = amf0DecodeOne(context);
            }
        });
    } else {
        console.log('Unknown command', resp);
    }
    return resp
}

function amfType(o) {
    var jsType = typeof o;

    if (o === null) return 'null';
    if (jsType == 'undefined') return 'undefined';
    if (jsType == 'number') {
        if (parseInt(o) == o) return 'integer';
        return 'double';
    }
    if (jsType == 'boolean') return o ? 'true' : 'false';
    if (jsType == 'string') return 'string';
    if (jsType == 'object') {
        if (o instanceof Array) {
            if (o.sarray) return 'sarray';
            return 'array';
        }
        return 'object';
    }
    throw new Error('Unsupported type!')
}

const amf0Type = {
    'string': 0x02,
    'integer': 0x00,
    'double': 0x00,
    'xml': 0x0F,
    'object': 0x03,
    'array': 0x08,
    'sarray': 0x0A,
    'true': 0x01,
    'false': 0x01,
    'undefined': 0x06,
    'null': 0x05
};
const amf3Type = {
    'string': 0x06,
    'integer': 0x04,
    'double': 0x05,
    'xml': 0x07,
    'object': 0x0A,
    'array': 0x09,
    'binary': 0x0C,
    'true': 0x03,
    'false': 0x02,
    'undefined': 0x00,
    'null': 0x01
};
const amf0eRules = {
    _string(str) {
        return this.amf0encUString(str)
    },
    _integer(num) {
        return this.writeDoubleBE(num)
    },
    _double: this._integer,
    _xml(str) {
        return this.writeUInt16BE(str.length).write(str, 'utf8')
    },
    _object(o) {
        for (let k in o) {
            this.amf0encUString(k).amf0EncodeOne(o[k])
        }
        return this.writeUInt16BE(0).writeUInt8(0x09)
    },
    _array(a) {
        this.writeUInt32BE(a.length);
        this.amf0eRules._object(a)
    },
    _sarray(a) {
        this.writeUInt8(0x0A).writeUInt32BE(a.length);
        a.forEach(o => this.amf0EncodeOne(o))
        return this
    },
    _true() {
        return this.writeUInt8(1);
    },
    _false() {
        return this.writeUInt8(0);
    },
    _undefined() {
        return this
    },
    _null() {
        return this
    }
};
const amf3eRules = {
    _string(str) {
        return this.amf3encUI29(str.length << 1).write(str, 'utf8')
    },
    _integer(num) {
        return this.amf3encUI29(num & 0x3FFFFFFF)
    },
    _double(num) {
        return this.writeDoubleBE(num)
    },
    _xml(str) {
        return this.amf3encUI29(str.length << 1).write(str, 'utf8')
    },
    _object(o) {
        for (let k in o) {
            this.amf0encUString(k).amf0EncodeOne(o[k])
        }
        return this.writeUInt16BE(0).writeUInt8(0x09)
    },
    _binary(b) {
        this.amf3encUI29(str.length << 1)
        if (typeof b == "string")
            return this.write(str, 'binary')
        else return this.writeBuffer(str)
    },
    _array(a) {
        this.writeUInt32BE(a.length);
        this.amf0eRules._object(a)
    },
    _true() {
        return this
    },
    _false() {
        return this
    },
    _undefined() {
        return this
    },
    _null() {
        return this
    }
}
const BufferWriter = require('./bufferwriter')
class AMFWriter extends BufferWriter {
    constructor() {
        super()

    }
    amf0encUString(s) {
        let b = Buffer.from(s, 'utf8')
        return this.writeUInt16BE(b.length).writeBuffer(b)
    }
    amf3encUI29(num) {
        var len = 0;
        if (num < 0x80) len = 1;
        if (num < 0x4000) len = 2;
        if (num < 0x200000) len = 3;
        if (num >= 0x200000) len = 4;
        switch (len) {
            case 1:
                return this.writeUInt8(num);
            case 2:
                return this.writeUInt8(num & 0x7F)
                    .writeUInt8((num >> 7) | 0x80);

            case 3:
                return this.writeUInt8(num & 0x7F)
                    .writeUInt8((num >> 7) & 0x7F)
                    .writeUInt8((num >> 14) | 0x80);

            case 4:
                return this.writeUInt8(num & 0xFF)
                    .writeUInt8((num >> 8) & 0x7F)
                    .writeUInt8((num >> 15) | 0x7F)
                    .writeUInt8((num >> 22) | 0x7F);
        }
    }
    amf0EncodeOne(o) {
        let type = amfType(o)
        let f = amf0eRules["_" + type];
        if (f) return f.call(this.writeUInt8(amf0Type[type]), o);
        throw new Error('Unsupported type for encoding!');
    }
    amf3EncodeOne(o) {
        let type = amfType(o)
        let f = amf3eRules["_" + type];
        if (f) return f.call(this.writeUInt8(amf3Type[type]), o);
        throw new Error('Unsupported type for encoding!');
    }
    encodeAmf3Cmd(opt) {
        this.reset().amf0EncodeOne(opt.cmd);

        if (rtmpCmdDecode[opt.cmd]) {
            rtmpCmdDecode[opt.cmd].forEach(n => {
                if (opt.hasOwnProperty(n))
                    this.amf3EncodeOne(opt[n]);
            });
        } else {
            console.log('Unknown command', opt);
        }
        return this
    }
    encodeAmf0Cmd(opt) {
        this.reset().amf0EncodeOne(opt.cmd);
        if (rtmpCmdDecode[opt.cmd]) {
            rtmpCmdDecode[opt.cmd].forEach(n => {
                if (opt.hasOwnProperty(n))
                    this.amf0EncodeOne(opt[n]);
            });
        } else {
            console.log('Unknown command', opt);
        }
        // console.log('Encoded as',data.toString('hex'));
        return this
    }
    encodeAmf0Data(opt) {
        this.reset().amf0EncodeOne(opt.cmd);

        if (rtmpDataDecode[opt.cmd]) {
            rtmpDataDecode[opt.cmd].forEach(n => {
                if (opt.hasOwnProperty(n))
                    this.amf0EncodeOne(opt[n]);
            });
        } else {
            console.log('Unknown data', opt);
        }
        // console.log('Encoded as',data.toString('hex'));
        return this
    }
}
module.exports = {
    AMFWriter,
    decodeAmf3Cmd,
    decodeAmf0Cmd,
    decodeAmf0Data,
}