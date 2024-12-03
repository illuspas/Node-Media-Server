const NodeMediaServer = require("..");
const config = require("./config.json");

const nms = new NodeMediaServer(config);
nms.run(); 