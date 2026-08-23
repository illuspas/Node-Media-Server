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
    sendBuffer: () => { }
  };
}

test("broadcast stays registered while a player waits for the next publisher", () => {
  const streamPath = "/live/wait";
  const broadcast = new BroadcastServer(streamPath);
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

  broadcast.donePublish(publisher2);
  assert.equal(Context.broadcasts.get(streamPath), broadcast, "player is still attached");

  broadcast.donePlay(player);
  assert.equal(Context.broadcasts.has(streamPath), false, "last participant left removes the broadcast");
});

test("broadcast is removed once the last participant leaves", () => {
  const streamPath = "/live/gone";
  const broadcast = new BroadcastServer(streamPath);
  Context.broadcasts.set(streamPath, broadcast);

  const publisher = fakeSession("pub", streamPath);
  broadcast.postPublish(publisher);
  broadcast.donePublish(publisher);
  assert.equal(Context.broadcasts.has(streamPath), false);
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

test("donePublish from a session that is not the publisher changes nothing", () => {
  const streamPath = "/live/mismatch";
  const broadcast = new BroadcastServer(streamPath);
  Context.broadcasts.set(streamPath, broadcast);

  const publisher = fakeSession("pub", streamPath);
  broadcast.postPublish(publisher);
  broadcast.donePublish(fakeSession("other", streamPath));
  assert.equal(Context.broadcasts.get(streamPath), broadcast, "active broadcast must survive");
  assert.equal(broadcast.publisher, publisher);

  broadcast.donePublish(publisher);
  assert.equal(Context.broadcasts.has(streamPath), false);
});
