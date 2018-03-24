const chalk = require('chalk');

LOG_TYPES = {
    NONE: 0,
    ERROR: 1,
    NORMAL: 2,
    DEBUG: 3
};

let logType = LOG_TYPES.NORMAL;

const setLogType = (type) => {
    if (!(type in Object.values(LOG_TYPES))) return;

    logType = type;
};

const log = (...args) => {
    if (logType < LOG_TYPES.NORMAL) return;

    console.log(chalk.bold.green('[INFO]'), ...args);  
};

const error = (...args) => {
    if (logType < LOG_TYPES.ERROR) return;

    console.log(chalk.bold.red('[ERROR]'), ...args);  
};

const debug = (...args) => {
    if (logType < LOG_TYPES.DEBUG) return;

    console.log(chalk.bold.blue('[DEBUG]'), ...args);
};

module.exports = {
    LOG_TYPES,
    setLogType,

    log, error, debug
}