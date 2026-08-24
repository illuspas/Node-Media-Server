// @ts-check
//
//  Created by Chen Mingliang on 26/08/23.
//  illuspas@msn.com
//  Copyright (c) 2026 NodeMedia. All rights reserved.
//

const crypto = require("node:crypto");

/**
 * Generate a 24-char lowercase hex id (96 random bits).
 * Same shape as a BSON ObjectId string, zero dependencies.
 * @returns {string}
 */
function generateId() {
  return crypto.randomBytes(12).toString("hex");
}

/**
 * Check whether a value looks like a 24-char hex id.
 * @param {string} value
 * @returns {boolean}
 */
function isValid24Hex(value) {
  return /^[0-9a-f]{24}$/i.test(value);
}

module.exports = { generateId, isValid24Hex };
