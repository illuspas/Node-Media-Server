// @ts-check
//
//  Created by Chen Mingliang on 26/08/23.
//  illuspas@msn.com
//  Copyright (c) 2026 NodeMedia. All rights reserved.
//
//  Mongo-style query subset: implicit AND on fields, dot-notation paths,
//  comparison operators ($eq $ne $gt $gte $lt $lte $in $nin $exists $regex
//  $contains) and logical operators ($and $or $nor $not).

/**
 * Read a (possibly nested) field from a document using dot notation.
 * @param {object} doc - Document to read from.
 * @param {string} fieldPath - Field path such as "stream.name".
 * @returns {unknown} The field value, or undefined when any segment is missing.
 */
function getField(doc, fieldPath) {
  const parts = fieldPath.split(".");
  let current = doc;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

/**
 * Equality with array deep-compare (documents are plain JSON data).
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
function deepEqual(a, b) {
  if (a === b) {
    return true;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => deepEqual(item, b[index]));
  }
  return false;
}

/**
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
function isOrderedGreater(a, b) {
  if (typeof a === "number" && typeof b === "number") {
    return a > b;
  }
  if (typeof a === "string" && typeof b === "string") {
    return a > b;
  }
  return String(a) > String(b);
}

/**
 * Evaluate a single field condition (either an operator object or an equality value).
 * @param {unknown} condition - Operator object (e.g. { $gte: 1 }) or literal value.
 * @param {unknown} value - Actual field value.
 * @returns {boolean}
 */
function matchCondition(condition, value) {
  if (condition !== null && typeof condition === "object" && !Array.isArray(condition)) {
    const flags = typeof condition.$options === "string" ? condition.$options : "";
    for (const [operator, operand] of Object.entries(condition)) {
      if (!matchOperator(operator, operand, value, flags)) {
        return false;
      }
    }
    return true;
  }
  return deepEqual(condition, value);
}

/**
 * Evaluate one operator against a field value.
 * @param {string} operator - Operator name such as "$gte".
 * @param {unknown} operand - Operator operand.
 * @param {unknown} value - Actual field value.
 * @param {string} regexFlags - Flags from a sibling $options key.
 * @returns {boolean}
 */
function matchOperator(operator, operand, value, regexFlags) {
  switch (operator) {
  case "$eq":
    return deepEqual(operand, value);
  case "$ne":
    return !deepEqual(operand, value);
  case "$gt":
    return value !== undefined && value !== null && isOrderedGreater(value, operand);
  case "$gte":
    return value !== undefined && value !== null &&
        (deepEqual(value, operand) || isOrderedGreater(value, operand));
  case "$lt":
    return value !== undefined && value !== null && isOrderedGreater(operand, value);
  case "$lte":
    return value !== undefined && value !== null &&
        (deepEqual(value, operand) || isOrderedGreater(operand, value));
  case "$in":
    return Array.isArray(operand) && operand.some((item) => deepEqual(item, value));
  case "$nin":
    return !(Array.isArray(operand) && operand.some((item) => deepEqual(item, value)));
  case "$exists":
    return operand ? value !== undefined : value === undefined;
  case "$regex": {
    if (typeof value !== "string") {
      return false;
    }
    const flags = operand instanceof RegExp
      ? operand.flags
      : (typeof operand === "object" && operand !== null && typeof operand.flags === "string"
        ? operand.flags
        : regexFlags);
    const pattern = operand instanceof RegExp ? operand.source : String(operand);
    return new RegExp(pattern, flags).test(value);
  }
  case "$options":
    return true; // consumed by $regex
  case "$contains":
    if (typeof value === "string" && typeof operand === "string") {
      return value.includes(operand);
    }
    if (Array.isArray(value)) {
      return value.some((item) => deepEqual(item, operand));
    }
    return false;
  default:
    throw new TypeError(`Unsupported query operator: ${operator}`);
  }
}

/**
 * Check whether a document matches a filter.
 * @param {object} doc - Document to test.
 * @param {object} filter - Filter object; an empty object matches everything.
 * @returns {boolean}
 */
function matchesFilter(doc, filter) {
  for (const [key, condition] of Object.entries(filter)) {
    switch (key) {
    case "$and":
      if (!Array.isArray(condition) || !condition.every((sub) => matchesFilter(doc, sub))) {
        return false;
      }
      break;
    case "$or":
      if (!Array.isArray(condition) || !condition.some((sub) => matchesFilter(doc, sub))) {
        return false;
      }
      break;
    case "$nor":
      if (!Array.isArray(condition) || condition.some((sub) => matchesFilter(doc, sub))) {
        return false;
      }
      break;
    case "$not":
      if (matchesFilter(doc, condition)) {
        return false;
      }
      break;
    default:
      if (!matchCondition(condition, getField(doc, key))) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Compare two values for sorting (missing/null first when ascending).
 * @param {unknown} a
 * @param {unknown} b
 * @returns {number}
 */
function compareForSort(a, b) {
  if (a === b) {
    return 0;
  }
  if (a === undefined || a === null) {
    return -1;
  }
  if (b === undefined || b === null) {
    return 1;
  }
  if (isOrderedGreater(a, b)) {
    return 1;
  }
  return isOrderedGreater(b, a) ? -1 : 0;
}

/**
 * Sort documents in place by a sort spec.
 * @param {object[]} docs - Documents to sort.
 * @param {object|Array<[string, number]>} sort - Either { field: 1|-1 } or [["field", 1|-1]].
 * @returns {object[]} The same array, sorted.
 */
function sortDocs(docs, sort) {
  const entries = Array.isArray(sort)
    ? sort.map((entry) => Array.isArray(entry) ? entry : [entry, 1])
    : Object.entries(sort);
  docs.sort((a, b) => {
    for (const [field, direction] of entries) {
      const result = compareForSort(getField(a, field), getField(b, field));
      if (result !== 0) {
        return direction === -1 || direction === "desc" ? -result : result;
      }
    }
    return 0;
  });
  return docs;
}

module.exports = { matchesFilter, sortDocs };
