const chalk = require('chalk');

LOG_TYPES = {
  NONE: 0,
  ERROR: 1,
  NORMAL: 2,
  DEBUG: 3,
  FFDEBUG: 4
};

let logType = LOG_TYPES.NORMAL;
const logsContainer = []

const setLogType = (type) => {
  if (typeof type !== 'number') return;

  logType = type;
};

const logTime = () => {
  let nowDate = new Date();
  return nowDate.toLocaleDateString() + ' ' + nowDate.toLocaleTimeString([], { hour12: false });
};

const unshiftLogContainer = (timestamp, pid, type, ...args) => {
  logsContainer.unshift({ timestamp: timestamp, type: type, pid: pid, message: [...args] })
}

const log = (...args) => {
  if (logType < LOG_TYPES.NORMAL) return;

  unshiftLogContainer(logTime(), process.pid, 'info', ...args)
  console.log(logTime(), process.pid, chalk.bold.green('[INFO]'), ...args);
};

const error = (...args) => {
  if (logType < LOG_TYPES.ERROR) return;

  unshiftLogContainer(logTime(), process.pid, 'error', ...args)
  console.log(logTime(), process.pid, chalk.bold.red('[ERROR]'), ...args);
};

const debug = (...args) => {
  if (logType < LOG_TYPES.DEBUG) return;

  unshiftLogContainer(logTime(), process.pid, 'debug', ...args)
  console.log(logTime(), process.pid, chalk.bold.blue('[DEBUG]'), ...args);
};

const ffdebug = (...args) => {
  if (logType < LOG_TYPES.FFDEBUG) return;

  unshiftLogContainer(logTime(), process.pid, 'ffdebug', ...args)
  console.log(logTime(), process.pid, chalk.bold.blue('[FFDEBUG]'), ...args);
};

module.exports = {
  LOG_TYPES,
  setLogType,
  logsContainer,

  log, error, debug, ffdebug
}