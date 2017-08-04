const NodeMediaServer = require('./node_media_server')

const config = {
  rtmp: {
    port: 1935,
    chunk_size: 128
  },
  http: {
    port: 8000
  }
}

var nms = new NodeMediaServer(config)
nms.run()


