// @ts-check
//
//  Created by Chen Mingliang on 26/08/24.
//  illuspas@msn.com
//  Copyright (c) 2026 NodeMedia. All rights reserved.
//

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const express = require("express");
const ApiRouter = require("../src/routers/api.js");
const AuthHandler = require("../src/api/handlers/auth.js");
const { createLoginLimiter } = require("../src/api/middleware/login_rate_limit.js");
const { jwtAuth, jwtErrorHandler } = require("../src/api/middleware/auth.js");
const { isHashed, hashPassword, verifyPassword } = require("../src/api/handlers/password_hash.js");
const Context = require("../src/core/context.js");

/**
 * Point Context at a fresh config (optionally with a temp config file) and
 * reset the in-memory lockout state.
 * @param {object=} options - { persist: boolean, password: string }
 * @returns {string|null} the config file path when persisting
 */
function setupConfig(options = {}) {
  const persist = options.persist === true;
  const cfgFile = persist ? path.join(fs.mkdtempSync(path.join(os.tmpdir(), "nms-auth-")), "config.json") : null;
  Context.config = {
    auth: {
      jwt: {
        secret: "test-secret",
        expiresIn: "1h",
        algorithm: "HS256",
        users: [{ username: "admin", password: options.password ?? hashPassword("right-password"), role: "admin" }]
      }
    }
  };
  Context.configFile = cfgFile;
  if (persist) {
    fs.writeFileSync(cfgFile, JSON.stringify(Context.config, null, 4));
  }
  AuthHandler.failedAttempts.clear();
  return cfgFile;
}

/**
 * Start an API app (with a fresh rate limiter) on an ephemeral port.
 * @param {object=} options - passed to setupConfig
 * @returns {Promise<{server: import("http").Server, baseUrl: string}>}
 */
async function startApp(options = {}) {
  const cfgFile = setupConfig(options);
  const app = express();
  app.use(express.json());
  app.use("/api/v1/login", createLoginLimiter());
  app.use("/api/v1", jwtAuth, jwtErrorHandler);
  app.use("/api/v1", new ApiRouter().router);
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}`, cfgFile };
}

/**
 * POST to the login endpoint.
 * @param {string} baseUrl
 * @param {object} body
 * @returns {Promise<{status: number, body: any}>}
 */
async function login(baseUrl, body) {
  const res = await fetch(`${baseUrl}/api/v1/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return { status: res.status, body: await res.json() };
}

test("hashPassword produces a verifiable scrypt hash", () => {
  const stored = hashPassword("right-password");
  assert.ok(isHashed(stored));
  assert.ok(verifyPassword("right-password", stored));
  assert.equal(verifyPassword("wrong-password", stored), false);
  assert.equal(isHashed("plain"), false);
  assert.equal(verifyPassword("x", "not-a-hash"), false);
});

test("login succeeds with correct credentials and returns a JWT", async () => {
  const { server, baseUrl } = await startApp();
  try {
    const { status, body } = await login(baseUrl, { username: "admin", password: "right-password" });
    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.equal(typeof body.data.token, "string");
    assert.equal(body.data.user.username, "admin");
  } finally {
    server.close();
  }
});

test("login rejects wrong password, unknown user and missing fields", async () => {
  const { server, baseUrl } = await startApp();
  try {
    assert.equal((await login(baseUrl, { username: "admin", password: "nope" })).status, 401);
    assert.equal((await login(baseUrl, { username: "ghost", password: "x" })).status, 401);
    assert.equal((await login(baseUrl, { username: "admin" })).status, 400);
    assert.equal((await login(baseUrl, {})).status, 400);
  } finally {
    server.close();
  }
});

test("legacy plaintext password is migrated to a hash on successful login", async () => {
  const { server, baseUrl, cfgFile } = await startApp({ persist: true, password: "legacy-plain" });
  try {
    const { status, body } = await login(baseUrl, { username: "admin", password: "legacy-plain" });
    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.ok(isHashed(Context.config.auth.jwt.users[0].password));
    const onDisk = JSON.parse(fs.readFileSync(cfgFile, "utf8"));
    assert.ok(isHashed(onDisk.auth.jwt.users[0].password));
    // the same password still logs in against the migrated hash
    assert.equal((await login(baseUrl, { username: "admin", password: "legacy-plain" })).status, 200);
  } finally {
    server.close();
  }
});

test("account is locked after 5 consecutive failures from one IP", async () => {
  setupConfig();
  // Call the handler directly: the HTTP rate limiter would otherwise
  // interfere with the request count in this test.
  const call = (password, ip) => new Promise(resolve => {
    const res = {
      status(c) { this._c = c; return this; },
      json(j) { resolve({ status: this._c || 200, ok: j.success }); return this; }
    };
    AuthHandler.login({ body: { username: "admin", password }, ip, socket: { remoteAddress: ip } }, res);
  });

  for (let i = 0; i < 5; i++) {
    assert.equal((await call("bad", "1.1.1.1")).status, 401);
  }
  // correct password is rejected while locked, from the same IP only
  assert.equal((await call("right-password", "1.1.1.1")).status, 429);
  assert.equal((await call("right-password", "2.2.2.2")).status, 200);

  // a successful login resets the counter before the lock triggers
  AuthHandler.failedAttempts.clear();
  for (let i = 0; i < 3; i++) {
    await call("bad", "1.1.1.1");
  }
  assert.equal((await call("right-password", "1.1.1.1")).status, 200);
  for (let i = 0; i < 4; i++) {
    await call("bad", "1.1.1.1");
  }
  assert.equal((await call("right-password", "1.1.1.1")).status, 200);
});

test("rate limiter returns 429 after 10 login requests per minute", async () => {
  const { server, baseUrl } = await startApp();
  try {
    let status = 0;
    for (let i = 0; i < 10; i++) {
      status = (await login(baseUrl, { username: "admin", password: "right-password" })).status;
    }
    assert.equal(status, 200); // 10 allowed
    assert.equal((await login(baseUrl, { username: "admin", password: "right-password" })).status, 429);
  } finally {
    server.close();
  }
});

test("changePassword updates, persists and re-verifies with hashes", async () => {
  const { server, baseUrl, cfgFile } = await startApp({ persist: true });
  try {
    const loginRes = await login(baseUrl, { username: "admin", password: "right-password" });
    const headers = { "Content-Type": "application/json", Authorization: `Bearer ${loginRes.body.data.token}` };

    const call = async body => {
      const res = await fetch(`${baseUrl}/api/v1/password`, { method: "POST", headers, body: JSON.stringify(body) });
      return { status: res.status, body: await res.json() };
    };

    assert.equal((await call({ oldPassword: "bad", newPassword: "newpass123" })).status, 400);
    assert.equal((await call({ oldPassword: "right-password", newPassword: "short" })).status, 400);
    assert.equal((await call({ oldPassword: "right-password", newPassword: "right-password" })).status, 400);

    const ok = await call({ oldPassword: "right-password", newPassword: "newpass123" });
    assert.equal(ok.status, 200);
    assert.ok(verifyPassword("newpass123", Context.config.auth.jwt.users[0].password));
    const onDisk = JSON.parse(fs.readFileSync(cfgFile, "utf8"));
    assert.ok(verifyPassword("newpass123", onDisk.auth.jwt.users[0].password));

    // old password no longer works, the new one does
    AuthHandler.failedAttempts.clear();
    assert.equal((await login(baseUrl, { username: "admin", password: "right-password" })).status, 401);
    assert.equal((await login(baseUrl, { username: "admin", password: "newpass123" })).status, 200);
  } finally {
    server.close();
  }
});
