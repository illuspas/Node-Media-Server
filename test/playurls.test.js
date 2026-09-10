// @ts-check
//
//  Created by Chen Mingliang on 26/09/10.
//  illuspas@msn.com
//  Copyright (c) 2026 NodeMedia. All rights reserved.
//

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");

const express = require("express");
const ApiRouter = require("../src/routers/api.js");
const BroadcastServer = require("../src/server/broadcast_server.js");
const Context = require("../src/core/context.js");

/**
 * Point Context at a fresh listener/auth config (no JWT middleware needed;
 * routes themselves are auth-free, auth comes from the mounting server).
 * @param {object} config
 * @returns {void}
 */
function setupConfig(config) {
  Context.config = config;
  Context.broadcasts = new Map();
  Context.recordServer = null;
}

/**
 * Start a bare API app on an ephemeral port.
 * @returns {Promise<{server: import("http").Server, baseUrl: string}>}
 */
async function startApp() {
  const app = express();
  app.use("/api/v1", new ApiRouter().router);
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}` };
}

/**
 * GET a JSON API response.
 * @param {string} url
 * @returns {Promise<{status: number, body: any}>}
 */
async function getJson(url) {
  const res = await fetch(url);
  return { status: res.status, body: await res.json() };
}

/**
 * Extract the sign query value from any generated URL.
 * @param {string} url
 * @returns {string}
 */
function signOf(url) {
  return url.split("?sign=")[1];
}

test("generates unsigned play urls for every configured listener", async () => {
  setupConfig({
    rtmp: { port: 1935 },
    rtmps: { port: 1936 },
    http: { port: 8000 },
    https: { port: 8443 }
  });
  const { server, baseUrl } = await startApp();
  try {
    const { status, body } = await getJson(`${baseUrl}/api/v1/streams/live/stream/urls`);
    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.equal(body.data.signed, false);
    assert.equal(body.data.expiresAt, null);
    assert.equal(body.data.status, "idle");
    assert.equal(body.data.streamPath, "/live/stream");
    assert.deepEqual(body.data.urls.map(u => [u.protocol, u.url]), [
      ["rtmp", "rtmp://127.0.0.1/live/stream"],
      ["rtmps", "rtmps://127.0.0.1:1936/live/stream"],
      ["http-flv", "http://127.0.0.1:8000/live/stream.flv"],
      ["ws-flv", "ws://127.0.0.1:8000/live/stream.flv"],
      ["https-flv", "https://127.0.0.1:8443/live/stream.flv"],
      ["wss-flv", "wss://127.0.0.1:8443/live/stream.flv"]
    ]);
  } finally {
    server.close();
  }
});

test("omits unconfigured listeners and elides default ports", async () => {
  setupConfig({ rtmp: { port: 1935 }, http: { port: 80 } });
  const { server, baseUrl } = await startApp();
  try {
    const { body } = await getJson(`${baseUrl}/api/v1/streams/live/stream/urls`);
    const urls = Object.fromEntries(body.data.urls.map(u => [u.protocol, u.url]));
    assert.equal(urls["rtmp"], "rtmp://127.0.0.1/live/stream");
    assert.equal(urls["http-flv"], "http://127.0.0.1/live/stream.flv");
    assert.equal(urls["ws-flv"], "ws://127.0.0.1/live/stream.flv");
    assert.equal(urls["rtmps"], undefined);
    assert.equal(urls["https-flv"], undefined);
    assert.equal(urls["wss-flv"], undefined);
  } finally {
    server.close();
  }
});

test("reports the live status of an existing broadcast", async () => {
  setupConfig({ rtmp: { port: 1935 } });
  Context.broadcasts.set("/live/stream", {
    publisher: { id: 1, ip: "1.2.3.4:5", protocol: "rtmp", createTime: 1, inBytes: 0 },
    subscribers: new Map(),
    getPublishStatus: () => "publishing"
  });
  const { server, baseUrl } = await startApp();
  try {
    const { body } = await getJson(`${baseUrl}/api/v1/streams/live/stream/urls`);
    assert.equal(body.data.status, "publishing");
  } finally {
    server.close();
  }
});

test("signs urls when auth.play is enabled and the sign passes verifyAuth", async () => {
  const secret = "s3cret";
  setupConfig({ rtmp: { port: 1935 }, http: { port: 8000 }, auth: { play: true, publish: false, secret } });
  const { server, baseUrl } = await startApp();
  try {
    const now = Math.floor(Date.now() / 1000);
    const { body } = await getJson(`${baseUrl}/api/v1/streams/live/stream/urls?ttl=120`);
    assert.equal(body.data.signed, true);
    assert.ok(new Date(body.data.expiresAt).getTime() > Date.now());

    // every URL carries the same "<exp>-<md5hex>" sign
    const sign = signOf(body.data.urls.find(u => u.protocol === "http-flv").url);
    for (const u of body.data.urls) {
      assert.equal(signOf(u.url), sign, u.url);
    }
    assert.equal(sign.split("-").length, 2);
    const [exp, hash] = sign.split("-");
    assert.ok(Number(exp) >= now + 118, `expiry ${exp} should respect ttl=120`);
    assert.ok(Number(exp) <= now + 122, `expiry ${exp} should respect ttl=120`);
    assert.equal(hash, crypto.createHash("md5").update(`/live/stream-${exp}-${secret}`).digest("hex"));

    // alignment with the real play verification path in BroadcastServer
    const broadcast = new BroadcastServer("/live/stream");
    const session = { streamPath: "/live/stream", streamQuery: { sign } };
    assert.equal(broadcast.verifyAuth(secret, session), true);
    assert.equal(broadcast.verifyAuth("wrong-secret", session), false);
    const expired = { streamPath: "/live/stream", streamQuery: { sign: `1-${hash}` } };
    assert.equal(broadcast.verifyAuth(secret, expired), false);
  } finally {
    server.close();
  }
});

test("clamps the ttl parameter into [60, 86400] and falls back to 3600", async () => {
  setupConfig({ rtmp: { port: 1935 }, auth: { play: true, secret: "s" } });
  const { server, baseUrl } = await startApp();
  try {
    const now = Math.floor(Date.now() / 1000);
    const low = signOf((await getJson(`${baseUrl}/api/v1/streams/live/stream/urls?ttl=1`))
      .body.data.urls.find(u => u.protocol === "rtmp").url);
    assert.ok(Number(low.split("-")[0]) >= now + 58 && Number(low.split("-")[0]) <= now + 62,
      `ttl=1 should clamp to 60, got ${low.split("-")[0]} at ${now}`);

    const high = signOf((await getJson(`${baseUrl}/api/v1/streams/live/stream/urls?ttl=99999999`))
      .body.data.urls.find(u => u.protocol === "rtmp").url);
    assert.ok(Number(high.split("-")[0]) >= now + 86398 && Number(high.split("-")[0]) <= now + 86402,
      `ttl=99999999 should clamp to 86400, got ${high.split("-")[0]} at ${now}`);

    const invalid = signOf((await getJson(`${baseUrl}/api/v1/streams/live/stream/urls?ttl=abc`))
      .body.data.urls.find(u => u.protocol === "rtmp").url);
    assert.ok(Number(invalid.split("-")[0]) >= now + 3598 && Number(invalid.split("-")[0]) <= now + 3602,
      `ttl=abc should fall back to 3600, got ${invalid.split("-")[0]} at ${now}`);
  } finally {
    server.close();
  }
});
