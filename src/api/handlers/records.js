// @ts-check
//
//  Created by Chen Mingliang on 26/08/23.
//  illuspas@msn.com
//  Copyright (c) 2026 NodeMedia. All rights reserved.
//

const fs = require("node:fs");
const path = require("node:path");
const logger = require("../../core/logger.js");
const Context = require("../../core/context.js");

/**
 * Records API Handler — list/inspect/delete recording metadata persisted
 * by the record server in the store's "records" collection.
 * @class
 */
class RecordsHandler {
  /**
   * Parse pagination and filter params shared by list endpoints.
   * @param {express.Request} req
   * @param {object} defaults
   * @returns {{page: number, pageSize: number, sort: Array<[string, number]>}}
   */
  static _pagination(req, defaults = {}) {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || defaults.pageSize || 20));
    const sort = defaults.sort ?? [["startTime", -1]];
    return { page, pageSize, sort };
  }

  /**
   * List recordings, newest first by default.
   * GET /api/v1/records?streamPath=&status=&page=1&pageSize=20
   * @param {express.Request} req
   * @param {express.Response} res
   */
  static listRecords = (req, res) => {
    try {
      const store = Context.store;
      if (!store?.opened) {
        res.status(503).json({ success: false, error: "Store is not available" });
        return;
      }
      const filter = {};
      if (typeof req.query.streamPath === "string" && req.query.streamPath) {
        filter.streamPath = req.query.streamPath;
      }
      if (req.query.status === "recording" || req.query.status === "done") {
        filter.status = req.query.status;
      }
      const { page, pageSize, sort } = RecordsHandler._pagination(req);
      const records = store.collection("records");
      const total = records.count(filter);
      const items = records.find(filter, { sort, skip: (page - 1) * pageSize, limit: pageSize });
      // aggregates for the whole filter, not just this page
      let totalDuration = 0;
      let totalSize = 0;
      for (const doc of records.find(filter)) {
        totalDuration += doc.duration ?? 0;
        totalSize += doc.size ?? 0;
      }
      res.json({
        success: true,
        data: { items, count: total, page, pageSize, totalDuration, totalSize }
      });
    } catch (error) {
      logger.error(`API: List records failed: ${error.message}`);
      res.status(500).json({ success: false, error: error.message });
    }
  };

  /**
   * Get one recording by id.
   * GET /api/v1/records/:id
   * @param {express.Request} req
   * @param {express.Response} res
   */
  static getRecord = (req, res) => {
    try {
      const store = Context.store;
      if (!store?.opened) {
        res.status(503).json({ success: false, error: "Store is not available" });
        return;
      }
      const doc = store.collection("records").get(req.params.id);
      if (!doc) {
        res.status(404).json({ success: false, error: `Record not found: ${req.params.id}` });
        return;
      }
      res.json({ success: true, data: doc });
    } catch (error) {
      logger.error(`API: Get record failed: ${error.message}`);
      res.status(500).json({ success: false, error: error.message });
    }
  };

  /**
   * Delete a recording entry; pass ?file=true to also delete the flv file
   * (only allowed inside the configured record path).
   * DELETE /api/v1/records/:id?file=true
   * @param {express.Request} req
   * @param {express.Response} res
   */
  static deleteRecord = (req, res) => {
    try {
      const store = Context.store;
      if (!store?.opened) {
        res.status(503).json({ success: false, error: "Store is not available" });
        return;
      }
      const records = store.collection("records");
      const doc = records.get(req.params.id);
      if (!doc) {
        res.status(404).json({ success: false, error: `Record not found: ${req.params.id}` });
        return;
      }
      if (doc.status === "recording") {
        res.status(409).json({ success: false, error: "Recording in progress; stop the stream first" });
        return;
      }

      let fileDeleted = false;
      if (req.query.file === "true") {
        const recordRoot = path.resolve(Context.config.record?.path ?? "");
        const target = path.resolve(doc.filePath ?? "");
        if (!recordRoot || !target.startsWith(recordRoot + path.sep)) {
          res.status(400).json({ success: false, error: "Refusing to delete a file outside the record path" });
          return;
        }
        try {
          fs.unlinkSync(target);
        } catch (error) {
          if (error.code !== "ENOENT") {
            throw error;
          }
          // already gone — the metadata entry is still removed below
        }
        fileDeleted = true;
      }

      records.delete(req.params.id);
      res.json({
        success: true,
        message: `Record removed: ${req.params.id}${fileDeleted ? " (file deleted)" : ""}`,
        fileDeleted
      });
      logger.info(`API: Deleted record ${req.params.id} (${doc.filePath})`);
    } catch (error) {
      logger.error(`API: Delete record failed: ${error.message}`);
      res.status(500).json({ success: false, error: error.message });
    }
  };
}

module.exports = RecordsHandler;
