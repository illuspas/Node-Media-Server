// @ts-check
//
//  Created by Chen Mingliang on 26/08/23.
//  illuspas@msn.com
//  Copyright (c) 2026 NodeMedia. All rights reserved.
//

const logger = require("../../core/logger.js");
const Context = require("../../core/context.js");

/**
 * History API Handler — query persisted publish history (the store's
 * "stream_history" collection, capped by store.maxHistory). Each entry
 * carries the playCount the publisher counted during that publish.
 * @class
 */
class HistoryHandler {
  /**
   * List publish history entries, newest first by default. Each entry carries
   * the number of plays during that publish.
   * GET /api/v1/history?streamPath=&ip=&search=&page=1&pageSize=20
   * @param {express.Request} req
   * @param {express.Response} res
   */
  static listHistory = (req, res) => {
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
      if (typeof req.query.search === "string" && req.query.search) {
        // substring match across streamPath and ip for the console's search box
        filter.$or = [
          { streamPath: { $contains: req.query.search } },
          { ip: { $contains: req.query.search } }
        ];
      }
      if (typeof req.query.ip === "string" && req.query.ip) {
        filter.ip = req.query.ip;
      }
      if (typeof req.query.protocol === "string" && req.query.protocol) {
        filter.protocol = req.query.protocol;
      }

      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 20));
      const history = store.collection("stream_history");
      const total = history.count(filter);
      const items = history.find(filter, {
        sort: [["startTime", -1]],
        skip: (page - 1) * pageSize,
        limit: pageSize
      });
      res.json({ success: true, data: { items, count: total, page, pageSize } });
    } catch (error) {
      logger.error(`API: List history failed: ${error.message}`);
      res.status(500).json({ success: false, error: error.message });
    }
  };

  /**
   * Delete history entries. Without a streamPath the whole history is cleared.
   * DELETE /api/v1/history?streamPath=/live/x
   * @param {express.Request} req
   * @param {express.Response} res
   */
  static deleteHistory = (req, res) => {
    try {
      const store = Context.store;
      if (!store?.opened) {
        res.status(503).json({ success: false, error: "Store is not available" });
        return;
      }
      const history = store.collection("stream_history");
      const streamPath = req.query.streamPath;
      if (typeof streamPath === "string" && streamPath) {
        const removed = history.deleteMany({ streamPath });
        res.json({ success: true, message: `Removed ${removed} history record(s) for ${streamPath}` });
      } else {
        const removed = history.clear();
        res.json({ success: true, message: `Cleared ${removed} history record(s)` });
      }
      logger.info(`API: History cleanup (${streamPath ?? "all"})`);
    } catch (error) {
      logger.error(`API: Delete history failed: ${error.message}`);
      res.status(500).json({ success: false, error: error.message });
    }
  };
}

module.exports = HistoryHandler;
