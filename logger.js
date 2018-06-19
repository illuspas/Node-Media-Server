const chalk = require('chalk');

LOG_TYPES = {
  NONE: 0,
  ERROR: 1,
  NORMAL: 2,
  DEBUG: 3
};

Logger = {LOG_TYPES};

let logType = LOG_TYPES.NORMAL;

Logger.setLogType = (type) => {
  if (typeof type !== 'number') return;

  logType = type;
};

Logger.logTime = () => {
  let nowDate = new Date();
  return nowDate.toLocaleDateString() + ' ' + nowDate.toLocaleTimeString([], { hour12: false });
};

Logger.log = (...args) => {
  if (logType < LOG_TYPES.NORMAL) return;

  console.log(logTime(), chalk.bold.green('[INFO]'), ...args);
};

Logger.error = (...args) => {
  if (logType < LOG_TYPES.ERROR) return;

  console.log(logTime(), chalk.bold.red('[ERROR]'), ...args);
};

Logger.debug = (...args) => {
  if (logType < LOG_TYPES.DEBUG) return;

  console.log(logTime(), chalk.bold.blue('[DEBUG]'), ...args);
};

const logger_methods = ['setLogType', 'logTime', 'log', 'error', 'debug'];
logger_methods.forEach(func_name => {
    Logger[func_name + '_default'] = Logger[func_name];
});
Logger.setConfig = (config) => {
    logger_methods.forEach(func_name => {
        if (config[func_name]) {
            Logger[func_name] = config[func_name];
        }
    });
};
module.exports = Logger;
