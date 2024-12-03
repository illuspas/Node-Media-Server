// @ts-check
//
//  Created by Chen Mingliang on 23/12/01.
//  illuspas@msn.com
//  Copyright (c) 2023 NodeMedia. All rights reserved.
//

class Logger {
  constructor(level = "info") {
    this.levels = ["trace", "debug", "info", "warn", "error"];
    this.level = this.levels.includes(level) ? level : "info";
  }

  log(message, logLevel = "info") {
    const messageLevel = this.levels.indexOf(logLevel);
    const currentLevel = this.levels.indexOf(this.level);

    if (messageLevel >= currentLevel) {
      console.log(`[${this.getTime()}] [${logLevel.toUpperCase()}] ${message}`);
    }
  }

  getTime() {
    const now = new Date();
    return now.toLocaleString();
  }

  /**
   * @param {string} message 
   */
  trace(message) {
    this.log(message, "trace");
  }

  /**
   * @param {string} message 
   */
  debug(message) {
    this.log(message, "debug");
  }

  /**
   * @param {string} message 
   */
  info(message) {
    this.log(message, "info");
  }

  /**
   * @param {string} message 
   */
  warn(message) {
    this.log(message, "warn");
  }

  /**
   * @param {string} message 
   */
  error(message) {
    this.log(message, "error");
  }
}

module.exports = new Logger("debug");
