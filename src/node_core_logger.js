const chalk = require('chalk');
const {nodeEvent} = require('./node_core_ctx')

const LOG_TYPES = {
  NONE: 0,
  ERROR: 1,
  NORMAL: 2,
  DEBUG: 3,
  FFDEBUG: 4
};

let logType = LOG_TYPES.NORMAL;

const setLogType = (type) => {
  if (typeof type !== 'number') return;

  logType = type;
};

const logTime = () => {
  let nowDate = new Date();
  return nowDate.toLocaleDateString() + ' ' + nowDate.toLocaleTimeString([], { hour12: false });
};

const log = (...args) => {
  nodeEvent.emit('logMessage', ...args)
  if (logType < LOG_TYPES.NORMAL) return;

  console.log(logTime(), process.pid, chalk.bold.green('[INFO]'), ...args);
};

const error = (...args) => {
  nodeEvent.emit('errorMessage', ...args)
  if (logType < LOG_TYPES.ERROR) return;

  console.log(logTime(), process.pid, chalk.bold.red('[ERROR]'), ...args);
};

const debug = (...args) => {
  nodeEvent.emit('debugMessage', ...args)
  if (logType < LOG_TYPES.DEBUG) return;

  console.log(logTime(), process.pid, chalk.bold.blue('[DEBUG]'), ...args);
};

const ffdebug = (...args) => {
  nodeEvent.emit('ffDebugMessage', ...args)
  if (logType < LOG_TYPES.FFDEBUG) return;

  console.log(logTime(), process.pid, chalk.bold.blue('[FFDEBUG]'), ...args);
};

module.exports = {
  LOG_TYPES,
  setLogType,

  log, error, debug, ffdebug
};