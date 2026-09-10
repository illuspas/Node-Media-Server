// @ts-check
//
//  Created by Chen Mingliang on 26/09/10.
//  illuspas@msn.com
//  Copyright (c) 2026 NodeMedia. All rights reserved.
//

const assert = require("node:assert/strict");
const test = require("node:test");

const express = require("express");
const ApiRouter = require("../src/routers/api.js");
const Context = require("../src/core/context.js");
const { RateSampler } = require("../src/core/rate_sampler.js");

/**
 * Reset the shared Context counters/maps and return a sampler on a fake clock.
 * @param {() => number} clock
 * @returns {RateSampler}
 */
function freshSampler(clock) {
  Context.config = {};
  Context.networkStats = { inBytes: 0, outBytes: 0 };
  Context.broadcasts = new Map();
  Context.sessions = new Map();
  Context.recordServer = null;
  return new RateSampler(1000, 5, clock);
}

test("computes network and per-stream rates over the sliding window", () => {
  let t = 10_000;
  const publisher = { inBytes: 0 };
  const player = { outBytes: 0 };
  const sampler = freshSampler(() => t);
  Context.broadcasts.set("/live/s", {
    publisher,
    subscribers: new Map([["p1", player]]),
    getPublishStatus: () => "publishing"
  });
  Context.broadcasts.set("/live/idle", { publisher: null, subscribers: new Map() });

  sampler.sample();
  assert.deepEqual(sampler.getStreamRates("/live/s"), { inBps: 0, outBps: 0 });
  assert.deepEqual(sampler.getNetworkRates(), { inBps: 0, outBps: 0 });

  t += 1000;
  publisher.inBytes += 3000;
  player.outBytes += 1000;
  Context.networkStats.inBytes += 3000;
  Context.networkStats.outBytes += 1000;
  sampler.sample();
  assert.deepEqual(sampler.getStreamRates("/live/s"), { inBps: 3000, outBps: 1000 });
  assert.deepEqual(sampler.getNetworkRates(), { inBps: 3000, outBps: 1000 });
  // a publisher-less broadcast still samples without crashing
  assert.deepEqual(sampler.getStreamRates("/live/idle"), { inBps: 0, outBps: 0 });

  // rates average over the whole window: one idle second halves the rate
  t += 1000;
  sampler.sample();
  assert.deepEqual(sampler.getStreamRates("/live/s"), { inBps: 1500, outBps: 500 });
  assert.deepEqual(sampler.getNetworkRates(), { inBps: 1500, outBps: 500 });
});

test("a publisher swap (counter reset) rebases instead of going negative", () => {
  let t = 10_000;
  const publisher = { inBytes: 5000 };
  const sampler = freshSampler(() => t);
  Context.broadcasts.set("/live/s", { publisher, subscribers: new Map() });

  sampler.sample();
  t += 1000;
  publisher.inBytes += 1000;
  sampler.sample();
  assert.equal(sampler.getStreamRates("/live/s").inBps, 1000);

  // the publisher session is replaced: inBytes restarts near zero
  const replacement = { inBytes: 10 };
  Context.broadcasts.set("/live/s", { publisher: replacement, subscribers: new Map() });
  t += 1000;
  sampler.sample();
  assert.deepEqual(sampler.getStreamRates("/live/s"), { inBps: 0, outBps: 0 });

  t += 1000;
  replacement.inBytes += 2000;
  sampler.sample();
  assert.deepEqual(sampler.getStreamRates("/live/s"), { inBps: 2000, outBps: 0 });
});

test("drops stream state once the broadcast is gone", () => {
  let t = 10_000;
  const sampler = freshSampler(() => t);
  Context.broadcasts.set("/live/s", { publisher: { inBytes: 0 }, subscribers: new Map() });
  sampler.sample();

  Context.broadcasts.delete("/live/s");
  t += 1000;
  sampler.sample();
  assert.deepEqual(sampler.getStreamRates("/live/s"), { inBps: 0, outBps: 0 });
});

test("/streams and /stats expose outBytes and real-time rates", async () => {
  freshSampler(Date.now);
  Context.broadcasts.set("/live/s", {
    publisher: { id: 7, ip: "1.2.3.4:9", protocol: "rtmp", createTime: 1, inBytes: 12345 },
    subscribers: new Map([["p1", { outBytes: 999 }]]),
    getPublishStatus: () => "publishing"
  });

  const app = express();
  app.use("/api/v1", new ApiRouter().router);
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  try {
    const streams = (await (await fetch(`${base}/streams`)).json()).data.streams;
    assert.equal(streams.length, 1);
    assert.equal(streams[0].key, "/live/s");
    assert.equal(streams[0].publisher.inBytes, 12345);
    assert.equal(streams[0].outBytes, 999);
    assert.equal(typeof streams[0].inBps, "number");
    assert.equal(typeof streams[0].outBps, "number");

    const info = (await (await fetch(`${base}/streams/live/s`)).json()).data;
    assert.equal(info.outBytes, 999);
    assert.equal(typeof info.inBps, "number");
    assert.equal(typeof info.outBps, "number");

    const network = (await (await fetch(`${base}/stats`)).json()).data.network;
    assert.equal(typeof network.inBps, "number");
    assert.equal(typeof network.outBps, "number");
    assert.ok(network.inBytes >= 0);
    assert.ok(network.outBytes >= 0);
  } finally {
    server.close();
    Context.broadcasts = new Map();
  }
});
