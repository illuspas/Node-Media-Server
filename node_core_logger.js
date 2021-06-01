const chalk = require('chalk');
const mkdirp = require('mkdirp');
const fs = require('fs')

LOG_TYPES = {
  NONE: 0,
  ERROR: 1,
  NORMAL: 2,
  DEBUG: 3,
  FFDEBUG: 4
};

let logType = LOG_TYPES.NORMAL;
let logFile = {
  output: LOG_TYPES.NONE,
  path: './logs'
}

const setLogType = (type) => {
  if (typeof type === 'number') {
    logType = type;
  } else if (typeof type === 'string' && typeof LOG_TYPES[type] === 'number') {
    logType = LOG_TYPES[type];
  }
  return;
};

const setLogFile = async (log) => {
  if (typeof log !== 'object') return;
  if (log.path && typeof log.path === 'string') {
    logFile.path = log.path;
    await mkdirp(logFile.path);
  }
  if (log.output && typeof log.output === 'number') {
    logFile.output = log.output;
  } else if (log.output && typeof log.output === 'string' && typeof LOG_TYPES[log.output] === 'number') {
    logFile.output = LOG_TYPES[log.output];
  }
}

const logTime = () => {
  let nowDate = new Date();
  return nowDate.toLocaleDateString() + ' ' + nowDate.toLocaleTimeString([], { hour12: false });
};

const log = (...args) => {
  if (logFile.output >= LOG_TYPES.NORMAL) {
    writeLog({
      type: '[INFO]',
      time: logTime(),
      pid: process.pid,
      data: [...args]
    });
  }
  if (logType < LOG_TYPES.NORMAL) return;

  console.log(logTime(), process.pid, chalk.bold.green('[INFO]'), ...args);
};

const error = (...args) => {
  if (logFile.output >= LOG_TYPES.ERROR) {
    writeLog({
      type: '[ERROR]',
      time: logTime(),
      pid: process.pid,
      data: [...args]
    });
  }
  if (logType < LOG_TYPES.ERROR) return;

  console.log(logTime(), process.pid, chalk.bold.red('[ERROR]'), ...args);
};

const debug = (...args) => {
  if (logFile.output >= LOG_TYPES.DEBUG) {
    writeLog({
      type: '[DEBUG]',
      time: logTime(),
      pid: process.pid,
      data: [...args]
    });
  }
  if (logType < LOG_TYPES.DEBUG) return;

  console.log(logTime(), process.pid, chalk.bold.blue('[DEBUG]'), ...args);
};

const ffdebug = (...args) => {
  if (logFile.output >= LOG_TYPES.FFDEBUG) {
    writeLog({
      type: '[FFDEBUG]',
      time: logTime(),
      pid: process.pid,
      data: [...args]
    });
  }
  if (logType < LOG_TYPES.FFDEBUG) return;

  console.log(logTime(), process.pid, chalk.bold.blue('[FFDEBUG]'), ...args);
};

const writeLog = (log) => {
  let date = new Date();
  let mm = date.getMonth() + 1;
  let dd = date.getDate();
  let file = logFile.path + "/" + [date.getFullYear(), (mm > 9 ? '' : '0') + mm, (dd > 9 ? '' : '0') + dd].join('-') + '.log';
  fs.appendFileSync(file, JSON.stringify(log, null, 2) + ',\n', function (err) { });

}

module.exports = {
  LOG_TYPES,
  setLogType,
  setLogFile,

  log, error, debug, ffdebug
}