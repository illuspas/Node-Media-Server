class BufferWriter {
    constructor() {
        this.buffer = Buffer.allocUnsafe(1024)
        this.offset = 0
        this.start = 0
        this.end = 0
    }
    need(size) {
        if (this.buffer.length - this.end < size) {
            this.expand(size)
        }
    }
    expand(size) {
        if (size > 1024) size += 1024
        else size = 1024
        this.buffer = Buffer.concat(this.buffer, Buffer.allocUnsafe(size))
    }
    valid() {
        return this.buffer.slice(this.start, this.end)
    }
    clone() {
        return Buffer.from(this.valid)
    }
    write(str) {
        this.end += Buffer.from.apply(null, arguments).copy(this.buffer, this.end)
        return this
    }
    writeBuffer(b) {
        this.end += b.copy(this.buffer, this.end)
        return this
    }
    reset() {
        this.end = 0
        return this
    }
}
const writeSize = {
    writeUInt8: 1,
    writeUInt16LE: 2,
    writeUInt16BE: 2,
    writeUInt32LE: 4,
    writeUInt32BE: 4,
    writeInt8: 1,
    writeInt16LE: 2,
    writeInt16BE: 2,
    writeInt32LE: 4,
    writeInt32BE: 4,
    writeFloatLE: 4,
    writeFloatBE: 4,
    writeDoubleLE: 8,
    writeDoubleBE: 8
}
for (let name in writeSize) {
    BufferWriter.prototype[name] = function(value) {
        let size = writeSize[name]
        this.need(size)
        this.buffer[name].call(this.buffer, value, this.end)
        this.end += size
        return this
    }
}
module.exports = BufferWriter