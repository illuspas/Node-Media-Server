// @ts-check
//
//  Created by Chen Mingliang on 26/09/10.
//  illuspas@msn.com
//  Copyright (c) 2026 NodeMedia. All rights reserved.
//

const Context = require("./context.js");

/** Period between two counter samples taken by the running sampler. */
const DEFAULT_INTERVAL_MS = 1000;

/** Samples kept per counter; rates are averaged over the whole window. */
const DEFAULT_WINDOW = 5;

/**
 * Sliding-window byte-rate sampler.
 *
 * Traffic counters (network totals, per-stream publisher in / subscribers out)
 * only ever grow, so rates are derived from a small ring of periodic samples:
 * byte delta divided by the time span of the window. A counter reset (a
 * publisher session replaced by a new one) rebases the history instead of
 * producing negative rates.
 * @class
 */
class RateSampler {
  /**
   * @param {number} intervalMs - Ms between samples of the periodic sampler
   * @param {number} window - Number of samples kept per counter
   * @param {() => number} [nowFn] - Clock in ms, injectable for tests
   */
  constructor(intervalMs = DEFAULT_INTERVAL_MS, window = DEFAULT_WINDOW, nowFn = Date.now) {
    /** @type {number} */
    this.intervalMs = intervalMs;
    /** @type {number} */
    this.window = Math.max(2, window);
    /** @type {() => number} */
    this._nowFn = nowFn;
    /** @type {Array<{t: number, inBytes: number, outBytes: number}>} */
    this._networkSamples = [];
    /** @type {Map<string, {samples: Array<{t: number, inBytes: number, outBytes: number}>, inBps: number, outBps: number}>} */
    this._streamStates = new Map();
    /** @type {{inBps: number, outBps: number}} */
    this._networkRates = { inBps: 0, outBps: 0 };
    /** @type {ReturnType<typeof setInterval> | null} */
    this._timer = null;
    /** @type {number | null} */
    this._lastSampleMs = null;
  }

  /**
   * Start the periodic sampler. Idempotent; the timer does not keep the
   * process alive. An immediate first sample is taken so rates exist before
   * the second tick.
   * @returns {RateSampler}
   */
  start() {
    if (this._timer === null) {
      this._timer = setInterval(() => this.sample(), this.intervalMs);
      this._timer.unref();
      this.sample();
    }
    return this;
  }

  /**
   * Stop the periodic sampler. Samples already taken are kept.
   * @returns {void}
   */
  stop() {
    if (this._timer !== null) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  /**
   * Take one sample of every counter. Runs on the timer, and may also be
   * called on demand by readers (see _ensureFresh) or directly by tests.
   * @returns {void}
   */
  sample() {
    const now = this._nowFn();
    this._lastSampleMs = now;
    this._networkSamples = this._pushSample(
      this._networkSamples, Context.networkStats.inBytes, Context.networkStats.outBytes, now);
    this._networkRates = this._ratesOf(this._networkSamples);

    /** @type {Set<string>} */
    const liveKeys = new Set();
    Context.broadcasts.forEach((broadcast, key) => {
      liveKeys.add(key);
      let inBytes = 0;
      let outBytes = 0;
      if (broadcast.publisher !== null && broadcast.publisher !== undefined) {
        inBytes = broadcast.publisher.inBytes || 0;
      }
      broadcast.subscribers?.forEach(subscriber => {
        outBytes += subscriber.outBytes || 0;
      });
      let state = this._streamStates.get(key);
      if (state === undefined) {
        state = { samples: [], inBps: 0, outBps: 0 };
        this._streamStates.set(key, state);
      }
      state.samples = this._pushSample(state.samples, inBytes, outBytes, now);
      const rates = this._ratesOf(state.samples);
      state.inBps = rates.inBps;
      state.outBps = rates.outBps;
    });
    // streams that disappeared (broadcast destroyed) stop accumulating history
    for (const key of this._streamStates.keys()) {
      if (!liveKeys.has(key)) {
        this._streamStates.delete(key);
      }
    }
  }

  /**
   * Network-wide rates right now, in bytes per second.
   * @returns {{inBps: number, outBps: number}}
   */
  getNetworkRates() {
    this._ensureFresh();
    return { inBps: this._networkRates.inBps, outBps: this._networkRates.outBps };
  }

  /**
   * Rates of one stream right now, in bytes per second; zeros when unknown.
   * @param {string} streamPath - Stream path, e.g. "/live/stream"
   * @returns {{inBps: number, outBps: number}}
   */
  getStreamRates(streamPath) {
    this._ensureFresh();
    const state = this._streamStates.get(streamPath);
    return state === undefined ? { inBps: 0, outBps: 0 } : { inBps: state.inBps, outBps: state.outBps };
  }

  /**
   * Append one sample to a window, dropping the oldest when full. A decrease
   * of either counter means the underlying session was replaced: rebase the
   * history so the next rate is computed from a fresh baseline.
   * @param {Array<{t: number, inBytes: number, outBytes: number}>} samples
   * @param {number} inBytes
   * @param {number} outBytes
   * @param {number} now
   * @returns {Array<{t: number, inBytes: number, outBytes: number}>}
   */
  _pushSample(samples, inBytes, outBytes, now) {
    const prev = samples[samples.length - 1];
    if (prev !== undefined && (inBytes < prev.inBytes || outBytes < prev.outBytes)) {
      samples = [];
    }
    samples.push({ t: now, inBytes, outBytes });
    if (samples.length > this.window) {
      samples.splice(0, samples.length - this.window);
    }
    return samples;
  }

  /**
   * Average rate over the whole window, in bytes per second.
   * @param {Array<{t: number, inBytes: number, outBytes: number}>} samples
   * @returns {{inBps: number, outBps: number}}
   */
  _ratesOf(samples) {
    if (samples.length < 2) {
      return { inBps: 0, outBps: 0 };
    }
    const first = samples[0];
    const last = samples[samples.length - 1];
    const seconds = (last.t - first.t) / 1000;
    if (seconds <= 0) {
      return { inBps: 0, outBps: 0 };
    }
    return {
      inBps: Math.round((last.inBytes - first.inBytes) / seconds),
      outBps: Math.round((last.outBytes - first.outBytes) / seconds)
    };
  }

  /**
   * Reads can outpace the periodic sampler (the API may be mounted without
   * the full server), so sample on demand when the last sample went stale.
   * @returns {void}
   */
  _ensureFresh() {
    if (this._lastSampleMs === null || this._nowFn() - this._lastSampleMs >= this.intervalMs) {
      this.sample();
    }
  }
}

/** Shared instance: started by the NodeMediaServer constructor, read by the API handlers. */
const rateSampler = new RateSampler();

module.exports = { RateSampler, rateSampler };
