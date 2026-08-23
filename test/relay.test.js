// @ts-check
//
//  Created by Chen Mingliang on 26/08/22.
//  illuspas@msn.com
//  Copyright (c) 2026 NodeMedia. All rights reserved.
//

const assert = require("node:assert/strict");
const net = require("node:net");
const test = require("node:test");
const Rtmp = require("../src/protocol/rtmp.js");
const RtmpClient = require("../src/protocol/rtmp_client.js");
const RtmpClientSession = require("../src/session/rtmp_client_session.js");
const RelayManager = require("../src/server/relay_manager.js");
const BroadcastServer = require("../src/server/broadcast_server.js");
const Context = require("../src/core/context.js");

/**
 * Start a minimal RTMP server backed by the existing server protocol.
 * @param {boolean} [sendVideo]
 * @returns {Promise<{server: net.Server, url: string}>}
 */
function createFakeRtmpServer(sendVideo = false) {
  return new Promise((resolve) => {
    const server = net.createServer((socket) => {
      const protocol = new Rtmp();
      protocol.onOutputCallback = (buffer) => socket.write(buffer);
      protocol.onPlayCallback = () => {
        if (sendVideo) {
          const packet = {
            codec_id: 7,
            codec_type: 9,
            duration: 0,
            flags: 2,
            pts: 0,
            dts: 0,
            size: 5,
            offset: 0,
            data: Buffer.from([0x17, 0x00, 0x00, 0x00, 0x00])
          };
          socket.write(Rtmp.createMessage(packet));
        }
      };
      socket.on("data", (data) => {
        protocol.parserData(data);
      });
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({
        server,
        url: `rtmp://127.0.0.1:${address.port}/live/test`
      });
    });
  });
}

/**
 * Close a test server.
 * @param {net.Server} server
 * @returns {Promise<void>}
 */
function closeServer(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

test("parses RTMP URL and preserves credentials as query parameters", () => {
  const result = RtmpClient.parseUrl("rtmp://user:pass@example.com:1936/live/camera?token=abc");
  assert.deepEqual(result, {
    host: "example.com",
    port: 1936,
    app: "live",
    streamName: "camera",
    query: { token: "abc", user: "user", pass: "pass" }
  });
});

test("completes RTMP handshake and play signaling", async () => {
  const { server, url } = await createFakeRtmpServer();
  const client = new RtmpClient();
  try {
    await client.connect(url);
    const connectResult = await client.sendConnect();
    assert.equal(connectResult.info.code, "NetConnection.Connect.Success");
    assert.equal(await client.sendCreateStream(), 1);
    const status = await client.sendPlay("test");
    assert.equal(status.info.code, "NetStream.Play.Start");
  } finally {
    client.disconnect();
    await closeServer(server);
  }
});

test("pull session registers as publisher and broadcasts remote packets", async () => {
  const { server, url } = await createFakeRtmpServer(true);
  const streamPath = "/test/pull";
  const session = new RtmpClientSession({ url, mode: "pull", streamPath, reconnect: false });
  try {
    await session.run();
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(session.isPublisher, true);
    assert.equal(Context.broadcasts.get(streamPath).publisher, session);
  } finally {
    session.close();
    Context.broadcasts.delete(streamPath);
    await closeServer(server);
  }
});

test("push session subscribes to an existing local broadcast", async () => {
  const { server, url } = await createFakeRtmpServer();
  const streamPath = "/test/source";
  const broadcast = new BroadcastServer(streamPath);
  const publisher = { id: "local-publisher" };
  broadcast.publisher = publisher;
  Context.broadcasts.set(streamPath, broadcast);
  const session = new RtmpClientSession({ url, mode: "push", streamPath, reconnect: false });
  try {
    await session.run();
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(broadcast.subscribers.has(session.id), true);
  } finally {
    session.close();
    Context.broadcasts.delete(streamPath);
    await closeServer(server);
  }
});

test("RelayManager routes RTMP pull and push tasks to distinct keys", () => {
  const manager = new RelayManager();
  const pull = manager.addTask({
    url: "rtmp://example.com/live/input",
    mode: "pull",
    streamPath: "/live/output",
    reconnect: false
  });
  const push = manager.addTask({
    url: "rtmp://example.com/live/forward",
    mode: "push",
    streamPath: "/live/input",
    reconnect: false
  });
  assert.equal(manager.getTaskStatus("/live/output").mode, "pull");
  assert.equal(manager.getTaskStatus("push:rtmp://example.com/live/forward").mode, "push");
  pull.close();
  push.close();
  manager.tasks.clear();
});
