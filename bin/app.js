import NodeMediaServer from "../src/index.js";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const config = require("./config.json");

const nms = new NodeMediaServer(config);
nms.run(); 