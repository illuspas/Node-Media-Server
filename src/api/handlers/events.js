// @ts-check
//
//  Created by Chen Mingliang on 26/09/10.
//  illuspas@msn.com
//  Copyright (c) 2026 NodeMedia. All rights reserved.
//

const Context = require("../../core/context.js");
const logger = require("../../core/logger.js");
/** @typedef {import("express").Request} Request */
/** @typedef {import("express").Response} Response */
/** @typedef {import("../../session/base_session.js")} BaseSession */

/** Stream lifecycle events exposed over SSE; mirrors the notify webhook action list. */
const SSE_EVENTS = [
  "prePlay", "postPlay", "donePlay",
  "prePublish", "postPublish", "donePublish",
  "postRecord", "doneRecord"
];

/** Comment heartbeat so proxies stop buffering or closing the idle stream. */
const PING_INTERVAL_MS = 15 * 1000;

/**
 * Session fields safe to send to event subscribers.
 * @param {BaseSession} session
 * @returns {object}
 */
function toEventPayload(session) {
  return {
    id: session?.id,
    ip: session?.ip,
    app: session?.streamApp,
    name: session?.streamName,
    streamPath: session?.streamPath,
    protocol: session?.protocol,
    isPublisher: session?.isPublisher,
    createTime: session?.createTime,
    endTime: session?.endTime,
    inBytes: session?.inBytes,
    outBytes: session?.outBytes
  };
}

class EventsHandler {
  /**
   * Stream lifecycle events over Server-Sent Events.
   * Every SSE_EVENTS emission on Context.eventEmitter is forwarded as an
   * SSE event whose data is the session summary JSON. Listeners and the
   * heartbeat timer are removed when the client disconnects.
   * GET /api/v1/events
   * @param {Request} req
   * @param {Response} res
   */
  static streamEvents(req, res) {
    res.status(200);
    res.set({
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no"
    });
    res.flushHeaders?.();
    res.write("retry: 3000\n\n");

    /** @type {Array<[string, (session: BaseSession) => void]>} */
    const listeners = SSE_EVENTS.map(eventName => {
      const listener = session => {
        // writing to a half-closed socket throws; a dropped event is harmless
        try {
          res.write(`event: ${eventName}\ndata: ${JSON.stringify(toEventPayload(session))}\n\n`);
        } catch (error) {
          logger.debug(`SSE write for ${eventName} failed: ${error.message}`);
        }
      };
      Context.eventEmitter.on(eventName, listener);
      return [eventName, listener];
    });

    const ping = setInterval(() => {
      try {
        res.write(": ping\n\n");
      } catch (error) {
        logger.debug(`SSE ping failed: ${error.message}`);
      }
    }, PING_INTERVAL_MS);
    ping.unref();

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) {
        return;
      }
      cleaned = true;
      clearInterval(ping);
      for (const [eventName, listener] of listeners) {
        Context.eventEmitter.off(eventName, listener);
      }
    };
    req.on("close", cleanup);
    res.on("close", cleanup);
  }
}

module.exports = EventsHandler;
