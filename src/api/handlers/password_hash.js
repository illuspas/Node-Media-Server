// @ts-check
//
//  Password hashing utilities (scrypt, no external dependencies)
//

const crypto = require("crypto");

/** @type {number} scrypt cost parameter N */
const SCRYPT_N = 16384;

/** @type {number} scrypt block size parameter r */
const SCRYPT_R = 8;

/** @type {number} scrypt parallelization parameter p */
const SCRYPT_P = 1;

/** @type {number} Derived key length in bytes */
const KEY_LEN = 64;

/** @type {number} Salt length in bytes */
const SALT_LEN = 16;

/**
 * Check whether a stored password string is already in hashed format
 * @param {string} stored - Password string from configuration
 * @returns {boolean} True when the string is a scrypt$... hash
 */
function isHashed(stored) {
  return /^scrypt\$16384\$8\$1\$[0-9a-f]{32}\$[0-9a-f]{128}$/.test(String(stored));
}

/**
 * Hash a plaintext password with scrypt and a random salt
 * @param {string} plain - Plaintext password
 * @returns {string} Formatted string: scrypt$N$r$p$saltHex$hashHex
 */
function hashPassword(plain) {
  const salt = crypto.randomBytes(SALT_LEN);
  const hash = crypto.scryptSync(String(plain), salt, KEY_LEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("hex")}$${hash.toString("hex")}`;
}

/**
 * Verify a plaintext password against a stored scrypt hash.
 * Non-hash or malformed stored values verify as false.
 * @param {string} plain - Plaintext password to check
 * @param {string} stored - Stored password string (hash format)
 * @returns {boolean} True when the password matches
 */
function verifyPassword(plain, stored) {
  try {
    const parts = String(stored).split("$");
    if (parts.length !== 6 || parts[0] !== "scrypt") {
      return false;
    }
    const N = parseInt(parts[1], 10);
    const r = parseInt(parts[2], 10);
    const p = parseInt(parts[3], 10);
    const salt = Buffer.from(parts[4], "hex");
    const expected = Buffer.from(parts[5], "hex");
    const actual = crypto.scryptSync(String(plain), salt, expected.length, { N, r, p });
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

module.exports = { isHashed, hashPassword, verifyPassword };
