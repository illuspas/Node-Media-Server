// @ts-check
//
//  Created by Chen Mingliang on 26/09/10.
//  illuspas@msn.com
//  Copyright (c) 2026 NodeMedia. All rights reserved.
//

const assert = require("node:assert/strict");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const test = require("node:test");
const Context = require("../src/core/context.js");
const NodeHttpServer = require("../src/server/http_server.js");

// webadmin/dist is gitignored and only present after `npm run build:webadmin`
const hasWebadminDist = fs.existsSync(path.resolve(__dirname, "../webadmin/dist"));

/**
 * Reserve a free TCP port (the server skips listeners whose port is 0/unset).
 * @returns {Promise<number>} an unused port on 127.0.0.1
 */
function getFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const port = probe.address().port;
      probe.close(() => resolve(port));
    });
  });
}

/**
 * Boot a real NodeHttpServer on an ephemeral port with the given webadmin config.
 * @param {object | null} webadmin - webadmin config section, or null to omit it entirely
 * @returns {Promise<{server: NodeHttpServer, baseUrl: string}>} the running server
 */
async function startHttpServer(webadmin) {
  Context.config = {
    bind: "127.0.0.1",
    http: { port: await getFreePort() },
    ...(webadmin ? { webadmin } : {})
  };
  const server = new NodeHttpServer();
  const listening = new Promise(resolve => server.httpServer.once("listening", resolve));
  server.run();
  await listening;
  return { server, baseUrl: `http://127.0.0.1:${server.httpServer.address().port}` };
}

test.describe("webadmin console mount", () => {
  /** @type {NodeHttpServer[]} */
  const servers = [];

  test.after(() => {
    for (const server of servers) {
      server.stop();
    }
  });

  test.it("served at /admin by default", async t => {
    if (!hasWebadminDist) return t.skip("webadmin/dist not built");
    const { server, baseUrl } = await startHttpServer(null);
    servers.push(server);
    const res = await fetch(`${baseUrl}/admin`);
    assert.equal(res.status, 200);
  });

  test.it("served at /admin when webadmin.enable is true", async t => {
    if (!hasWebadminDist) return t.skip("webadmin/dist not built");
    const { server, baseUrl } = await startHttpServer({ enable: true });
    servers.push(server);
    const res = await fetch(`${baseUrl}/admin`);
    assert.equal(res.status, 200);
  });

  test.it("not served (404) when webadmin.enable is false", async () => {
    // Must hold even when webadmin/dist is absent (CI)
    const { server, baseUrl } = await startHttpServer({ enable: false });
    servers.push(server);
    const res = await fetch(`${baseUrl}/admin`);
    assert.equal(res.status, 404);
  });
});
