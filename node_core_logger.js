const chalk = require('chalk');

LOG_TYPES = {
  NONE: 0,
  ERROR: 1,
  NORMAL: 2,
  DEBUG: 3,
  FFDEBUG: 4
};

let logType = LOG_TYPES.NORMAL;
let output = (...args) => console.log(...args);

const setLogType = (type) => {
  if (typeof type !== 'number') return;

  logType = type;
};

const setOutputFunction = (func) => {
  if (typeof func !== 'function') return;

  output = func;
};

const logTime = () => {
  let nowDate = new Date();
  return nowDate.toLocaleDateString() + ' ' + nowDate.toLocaleTimeString([], { hour12: false });
};

const log = (...args) => {
  if (logType < LOG_TYPES.NORMAL) return;

  output(logTime(), process.pid, chalk.bold.green('[INFO]'), ...args);
};

const error = (...args) => {
  if (logType < LOG_TYPES.ERROR) return;

  output(logTime(), process.pid, chalk.bold.red('[ERROR]'), ...args);
};

const debug = (...args) => {
  if (logType < LOG_TYPES.DEBUG) return;

  output(logTime(), process.pid, chalk.bold.blue('[DEBUG]'), ...args);
};

const ffdebug = (...args) => {
  if (logType < LOG_TYPES.FFDEBUG) return;

  output(logTime(), process.pid, chalk.bold.blue('[FFDEBUG]'), ...args);
};

module.exports = {
  LOG_TYPES,
  setLogType,
  setOutputFunction,
  log, error, debug, ffdebug
}