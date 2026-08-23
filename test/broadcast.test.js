// @ts-check
//
//  Created by Chen Mingliang on 26/08/23.
//  illuspas@msn.com
//  Copyright (c) 2026 NodeMedia. All rights reserved.
//

const assert = require("node:assert/strict");
const test = require("node:test");
const BroadcastServer = require("../src/server/broadcast_server.js");
const Context = require("../src/core/context.js");

/**
 * Build a minimal session-like object for broadcast lifecycle tests.
 * @param {string} id
 * @param {string} streamPath
 * @returns {object}
 */
function fakeSession(id, streamPath) {
  return {
    id,
    ip: "9.9.9.9:1234",
    protocol: "rtmp",
    streamPath,
    streamQuery: {},
    createTime: Date.now(),
    sendBuffer: () => { }
  };
}

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Capture donePublish emissions on the shared event emitter.
 * @returns {{events: object[], dispose: () => void}}
 */
function captureDonePublish() {
  const events = [];
  const listener = (session) => events.push(session);
  Context.eventEmitter.on("donePublish", listener);
  return { events, dispose: () => Context.eventEmitter.removeListener("donePublish", listener) };
}

test("broadcast stays registered while a player waits for the next publisher", async () => {
  const streamPath = "/live/wait";
  const broadcast = new BroadcastServer(streamPath);
  broadcast.publishGraceMs = 1;
  Context.broadcasts.set(streamPath, broadcast);

  const publisher = fakeSession("pub", streamPath);
  const player = fakeSession("p1", streamPath);
  assert.equal(broadcast.postPublish(publisher), null);
  assert.equal(broadcast.postPlay(player), null);

  broadcast.donePublish(publisher);
  assert.equal(Context.broadcasts.get(streamPath), broadcast, "waiting player keeps the broadcast alive");

  // the next publish cycle reuses the same broadcast, so the player keeps receiving
  const publisher2 = fakeSession("pub2", streamPath);
  assert.equal(broadcast.postPublish(publisher2), null);
  assert.equal(publisher2.createTime, publisher.createTime, "same-client publish continues the record");

  broadcast.donePublish(publisher2);
  assert.equal(Context.broadcasts.get(streamPath), broadcast, "player is still attached");

  broadcast.donePlay(player);
  await sleep(20);
  assert.equal(Context.broadcasts.has(streamPath), false, "last participant left removes the broadcast");
});

test("broadcast is removed once the grace window expires", async () => {
  const streamPath = "/live/gone";
  const broadcast = new BroadcastServer(streamPath);
  broadcast.publishGraceMs = 1;
  Context.broadcasts.set(streamPath, broadcast);
  const capture = captureDonePublish();

  try {
    const publisher = fakeSession("pub", streamPath);
    broadcast.postPublish(publisher);
    broadcast.donePublish(publisher);
    assert.equal(Context.broadcasts.has(streamPath), true, "publish is held during the grace window");
    await sleep(20);
    assert.equal(Context.broadcasts.has(streamPath), false);
    assert.equal(capture.events.length, 1);
    assert.equal(capture.events[0], publisher);
  } finally {
    capture.dispose();
  }
});

test("player-only broadcast is removed when the player leaves", () => {
  const streamPath = "/live/phantom";
  const broadcast = new BroadcastServer(streamPath);
  Context.broadcasts.set(streamPath, broadcast);

  const player = fakeSession("p1", streamPath);
  broadcast.postPlay(player);
  broadcast.donePlay(player);
  assert.equal(Context.broadcasts.has(streamPath), false);
});

test("donePublish from a session that is not the publisher changes nothing", async () => {
  const streamPath = "/live/mismatch";
  const broadcast = new BroadcastServer(streamPath);
  broadcast.publishGraceMs = 1;
  Context.broadcasts.set(streamPath, broadcast);
  const capture = captureDonePublish();

  try {
    const publisher = fakeSession("pub", streamPath);
    broadcast.postPublish(publisher);
    broadcast.donePublish(fakeSession("other", streamPath));
    assert.equal(Context.broadcasts.get(streamPath), broadcast, "active broadcast must survive");
    assert.equal(broadcast.publisher, publisher);

    broadcast.donePublish(publisher);
    await sleep(20);
    assert.equal(Context.broadcasts.has(streamPath), false);
    assert.equal(capture.events.length, 1, "only the real publisher is finalized");
  } finally {
    capture.dispose();
  }
});

test("same client resuming within the grace window continues the existing record", async () => {
  const streamPath = "/live/reconnect";
  const broadcast = new BroadcastServer(streamPath);
  broadcast.publishGraceMs = 60;
  Context.broadcasts.set(streamPath, broadcast);
  const capture = captureDonePublish();

  try {
    const publisher = fakeSession("pub", streamPath);
    publisher.ip = "10.0.0.5:40001";
    publisher.createTime = 1000;
    publisher.inBytes = 500;
    publisher.playCount = 2;
    broadcast.postPublish(publisher);

    broadcast.donePublish(publisher);
    await sleep(20);
    assert.equal(capture.events.length, 0, "donePublish is withheld during the grace window");

    // a new TCP connection from the same client has a different port
    const resumer = fakeSession("pub2", streamPath);
    resumer.ip = "10.0.0.5:54321";
    resumer.createTime = 2000;
    assert.equal(broadcast.postPublish(resumer), null);
    assert.equal(broadcast.publisher, resumer);
    assert.equal(resumer.createTime, 1000, "original start time is kept");
    assert.equal(resumer.inBytes, 500, "byte counter continues");
    assert.equal(resumer.playCount, 2, "play count continues");

    broadcast.donePublish(resumer);
    await sleep(120);
    assert.equal(capture.events.length, 1, "the whole chain yields exactly one record");
    assert.equal(capture.events[0], resumer);
    assert.equal(capture.events[0].createTime, 1000, "emitted record carries the merged stats");
    assert.equal(Context.broadcasts.has(streamPath), false);
  } finally {
    capture.dispose();
  }
});

test("publish status reflects the grace window", async () => {
  const streamPath = "/live/status";
  const broadcast = new BroadcastServer(streamPath);
  broadcast.publishGraceMs = 60;
  Context.broadcasts.set(streamPath, broadcast);

  const player = fakeSession("p1", streamPath);
  broadcast.postPlay(player);
  assert.equal(broadcast.getPublishStatus(), "idle");

  const publisher = fakeSession("pub", streamPath);
  publisher.ip = "10.0.0.5:40001";
  broadcast.postPublish(publisher);
  assert.equal(broadcast.getPublishStatus(), "publishing");

  broadcast.donePublish(publisher);
  assert.equal(broadcast.getPublishStatus(), "reconnecting", "held entry reports the wait state");

  const resumer = fakeSession("pub2", streamPath);
  resumer.ip = "10.0.0.5:54321";
  broadcast.postPublish(resumer);
  assert.equal(broadcast.getPublishStatus(), "publishing");

  broadcast.donePlay(player);
  broadcast.publishGraceMs = 1;
  broadcast.donePublish(resumer);
  await sleep(20);
  assert.equal(Context.broadcasts.has(streamPath), false, "expiry removes the broadcast entirely");
});

test("a different client during the grace window finalizes the previous publish at once", async () => {
  const streamPath = "/live/takeover";
  const broadcast = new BroadcastServer(streamPath);
  broadcast.publishGraceMs = 60000;
  Context.broadcasts.set(streamPath, broadcast);
  const capture = captureDonePublish();

  try {
    const publisher = fakeSession("pub", streamPath);
    publisher.ip = "10.0.0.5:40001";
    broadcast.postPublish(publisher);
    broadcast.donePublish(publisher);

    const newcomer = fakeSession("pub2", streamPath);
    newcomer.ip = "10.0.0.9:40002";
    assert.equal(broadcast.postPublish(newcomer), null);
    assert.equal(capture.events.length, 1, "old publish ends immediately on takeover");
    assert.equal(capture.events[0], publisher);
    assert.equal(broadcast.publisher, newcomer);

    broadcast.publishGraceMs = 1;
    broadcast.donePublish(newcomer);
    await sleep(20);
    assert.equal(Context.broadcasts.has(streamPath), false);
    assert.equal(capture.events.length, 2);
  } finally {
    capture.dispose();
  }
});
