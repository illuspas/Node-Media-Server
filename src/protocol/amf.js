/**
 * Copyright (C) 2016 Bilibili. All Rights Reserved.
 * @author zheng qian &lt;xqq@xqq.im>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import logger from "../core/logger.js";
import decodeUTF8 from "./utf8-conv.js";
import { IllegalStateException } from "./exception.js";

const le = (function () {
  const buf = new ArrayBuffer(2);
  (new DataView(buf)).setInt16(0, 256, true); // little-endian write
  return (new Int16Array(buf))[0] === 256; // platform-spec read, if equal then LE
})();

export default class AMF {
  static parseScriptData(arrayBuffer, dataOffset, dataSize) {
    const data = {};

    try {
      const name = AMF.parseValue(arrayBuffer, dataOffset, dataSize);
      const value = AMF.parseValue(arrayBuffer, dataOffset + name.size, dataSize - name.size);

      data[name.data] = value.data;
    } catch (e) {
      logger.error("AMF", e.toString());
    }

    return data;
  }

  static parseObject(arrayBuffer, dataOffset, dataSize) {
    if (dataSize < 3) {
      throw new IllegalStateException("Data not enough when parse ScriptDataObject");
    }
    const name = AMF.parseString(arrayBuffer, dataOffset, dataSize);
    const value = AMF.parseValue(arrayBuffer, dataOffset + name.size, dataSize - name.size);
    const isObjectEnd = value.objectEnd;

    return {
      data: {
        name: name.data,
        value: value.data
      },
      size: name.size + value.size,
      objectEnd: isObjectEnd
    };
  }

  static parseVariable(arrayBuffer, dataOffset, dataSize) {
    return AMF.parseObject(arrayBuffer, dataOffset, dataSize);
  }

  static parseString(arrayBuffer, dataOffset, dataSize) {
    if (dataSize < 2) {
      throw new IllegalStateException("Data not enough when parse String");
    }
    const v = new DataView(arrayBuffer, dataOffset, dataSize);
    const length = v.getUint16(0, !le);

    let str;
    if (length > 0) {
      str = decodeUTF8(new Uint8Array(arrayBuffer, dataOffset + 2, length));
    } else {
      str = "";
    }

    return {
      data: str,
      size: 2 + length
    };
  }

  static parseLongString(arrayBuffer, dataOffset, dataSize) {
    if (dataSize < 4) {
      throw new IllegalStateException("Data not enough when parse LongString");
    }
    const v = new DataView(arrayBuffer, dataOffset, dataSize);
    const length = v.getUint32(0, !le);

    let str;
    if (length > 0) {
      str = decodeUTF8(new Uint8Array(arrayBuffer, dataOffset + 4, length));
    } else {
      str = "";
    }

    return {
      data: str,
      size: 4 + length
    };
  }

  static parseDate(arrayBuffer, dataOffset, dataSize) {
    if (dataSize < 10) {
      throw new IllegalStateException("Data size invalid when parse Date");
    }
    const v = new DataView(arrayBuffer, dataOffset, dataSize);
    let timestamp = v.getFloat64(0, !le);
    const localTimeOffset = v.getInt16(8, !le);
    timestamp += localTimeOffset * 60 * 1000; // get UTC time

    return {
      data: new Date(timestamp),
      size: 8 + 2
    };
  }

  static parseValue(arrayBuffer, dataOffset, dataSize) {
    if (dataSize < 1) {
      throw new IllegalStateException("Data not enough when parse Value");
    }

    const v = new DataView(arrayBuffer, dataOffset, dataSize);

    let offset = 1;
    const type = v.getUint8(0);
    let value;
    let objectEnd = false;

    try {
      switch (type) {
        case 0: // Number(Double) type
          value = v.getFloat64(1, !le);
          offset += 8;
          break;
        case 1: { // Boolean type
          const b = v.getUint8(1);
          value = !!b;
          offset += 1;
          break;
        }
        case 2: { // String type
          const amfstr = AMF.parseString(arrayBuffer, dataOffset + 1, dataSize - 1);
          value = amfstr.data;
          offset += amfstr.size;
          break;
        }
        case 3: { // Object(s) type
          value = {};
          let terminal = 0; // workaround for malformed Objects which has missing ScriptDataObjectEnd
          if ((v.getUint32(dataSize - 4, !le) & 0x00FFFFFF) === 9) {
            terminal = 3;
          }
          while (offset < dataSize - 4) { // 4 === type(UI8) + ScriptDataObjectEnd(UI24)
            const amfobj = AMF.parseObject(arrayBuffer, dataOffset + offset, dataSize - offset - terminal);
            if (amfobj.objectEnd) { break; }
            value[amfobj.data.name] = amfobj.data.value;
            offset += amfobj.size;
          }
          if (offset <= dataSize - 3) {
            const marker = v.getUint32(offset - 1, !le) & 0x00FFFFFF;
            if (marker === 9) {
              offset += 3;
            }
          }
          break;
        }
        case 8: { // ECMA array type (Mixed array)
          value = {};
          offset += 4; // ECMAArrayLength(UI32)
          let terminal = 0; // workaround for malformed MixedArrays which has missing ScriptDataObjectEnd
          if ((v.getUint32(dataSize - 4, !le) & 0x00FFFFFF) === 9) {
            terminal = 3;
          }
          while (offset < dataSize - 8) { // 8 === type(UI8) + ECMAArrayLength(UI32) + ScriptDataVariableEnd(UI24)
            const amfvar = AMF.parseVariable(arrayBuffer, dataOffset + offset, dataSize - offset - terminal);
            if (amfvar.objectEnd) { break; }
            value[amfvar.data.name] = amfvar.data.value;
            offset += amfvar.size;
          }
          if (offset <= dataSize - 3) {
            const marker = v.getUint32(offset - 1, !le) & 0x00FFFFFF;
            if (marker === 9) {
              offset += 3;
            }
          }
          break;
        }
        case 9: // ScriptDataObjectEnd
          value = undefined;
          offset = 1;
          objectEnd = true;
          break;
        case 10: { // Strict array type
          // ScriptDataValue[n]. NOTE: according to video_file_format_spec_v10_1.pdf
          value = [];
          const strictArrayLength = v.getUint32(1, !le);
          offset += 4;
          for (let i = 0; i < strictArrayLength; i++) {
            const val = AMF.parseValue(arrayBuffer, dataOffset + offset, dataSize - offset);
            value.push(val.data);
            offset += val.size;
          }
          break;
        }
        case 11: { // Date type
          const date = AMF.parseDate(arrayBuffer, dataOffset + 1, dataSize - 1);
          value = date.data;
          offset += date.size;
          break;
        }
        case 12: { // Long string type
          const amfLongStr = AMF.parseString(arrayBuffer, dataOffset + 1, dataSize - 1);
          value = amfLongStr.data;
          offset += amfLongStr.size;
          break;
        }
        default:
          // ignore and skip
          offset = dataSize;
          logger.warn("AMF", "Unsupported AMF value type " + type);
      }
    } catch (e) {
      logger.error("AMF", e.toString());
    }

    return {
      data: value,
      size: offset,
      objectEnd
    };
  }
}
