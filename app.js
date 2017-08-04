const NodeMediaServer = require('./node_media_server')

const config = {
  rtmp: {
    port: 1935,
    chunk_size: 60000,
    gop_cache: true
  },
  http: {
    port: 8000
  }
}

var nms = new NodeMediaServer(config)
nms.run()


