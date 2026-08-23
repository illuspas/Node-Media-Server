// @ts-check
//
//  Created by Chen Mingliang on 26/08/23.
//  illuspas@msn.com
//  Copyright (c) 2026 NodeMedia. All rights reserved.
//

const crypto = require("node:crypto");

// Ids are random bytes; batching the syscall keeps insert-heavy paths fast.
const ID_POOL_SIZE = 12 * 1024;
/** @type {Buffer | null} */
let pool = null;
let poolOffset = 0;

/**
 * Generate a 24-char lowercase hex id (96 random bits).
 * Same shape as a BSON ObjectId string, zero dependencies.
 * @returns {string}
 */
function generateId() {
  if (pool === null || poolOffset + 12 > pool.length) {
    pool = crypto.randomBytes(ID_POOL_SIZE);
    poolOffset = 0;
  }
  const id = pool.subarray(poolOffset, poolOffset + 12).toString("hex");
  poolOffset += 12;
  return id;
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
