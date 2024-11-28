import NodeMediaServer from "../src/index.js";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const config = require("./config.json");
let nms = new NodeMediaServer(config);
nms.run(); 