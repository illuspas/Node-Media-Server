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
const ConfigHandler = require("../src/api/handlers/config.js");
const Context = require("../src/core/context.js");

const BASE_CONFIG = {
  bind: "0.0.0.0",
  notify: { url: "" },
  store: { path: "./data", maxHistory: 10000 },
  record: { path: "./record" },
  auth: { play: false, publish: false, secret: "s3cret" },
  rtmp: { port: 1935 },
  rtmps: { port: 1936, key: "./key.pem", cert: "./cert.pem" },
  http: { port: 8000 },
  https: { port: 8443, key: "./key.pem", cert: "./cert.pem" }
};

/** Reset Context.config (clone) and configFile before each group of calls. */
function reset(configFile = null) {
  Context.config = structuredClone(BASE_CONFIG);
  Context.configFile = configFile;
}

/** Build a fake express response capturing status + body. */
function mockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
  return res;
}

function put(body) {
  const res = mockRes();
  ConfigHandler.updateConfig({ body }, res);
  return res;
}

function get() {
  const res = mockRes();
  ConfigHandler.getConfig({}, res);
  return res;
}

test("GET returns only the editable subset", () => {
  reset();
  Context.config.auth.jwt = { secret: "nope", users: [{ username: "admin", password: "pw" }] };
  const res = get();
  assert.equal(res.statusCode, 200);
  assert.ok(res.body.success);
  assert.deepEqual(res.body.data.rtmp, { port: 1935 });
  assert.equal(res.body.data.auth.jwt, undefined);
  assert.equal(res.body.data.jwt, undefined);
});

test("PUT applies a valid patch and trims strings", () => {
  reset();
  const res = put({ rtmp: { port: 2935 }, bind: " 127.0.0.1 ", notify: { url: " https://example.com/hook " } });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.data.updated, ["bind", "notify.url", "rtmp.port"]);
  assert.equal(Context.config.bind, "127.0.0.1");
  assert.equal(Context.config.rtmp.port, 2935);
  assert.equal(Context.config.notify.url, "https://example.com/hook");
});

test("PUT persists to the config file when set", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nms-config-"));
  const file = path.join(dir, "config.json");
  fs.writeFileSync(file, JSON.stringify(BASE_CONFIG, null, 4));
  reset(file);
  const res = put({ http: { port: 8001 } });
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(fs.readFileSync(file, "utf8")).http.port, 8001);
  fs.rmSync(dir, { recursive: true, force: true });
  Context.configFile = null;
});

test("PUT rejects non-object bodies", () => {
  reset();
  for (const body of [null, "rtmp", 42, [1, 2]]) {
    const res = put(body);
    assert.equal(res.statusCode, 400);
    assert.ok(!res.body.success);
  }
});

test("PUT rejects patches without any editable field", () => {
  reset();
  const res = put({ foo: "bar", rtmp: { chunkSize: 999 } });
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /No editable config fields/);
  assert.equal(Context.config.rtmp.port, 1935);
});

test("PUT rejects invalid ports", () => {
  reset();
  for (const port of [0, -1, 65536, 1935.5, "1935", null]) {
    const res = put({ rtmp: { port } });
    assert.equal(res.statusCode, 400, `port ${port} should be rejected`);
    assert.match(res.body.error, /rtmp\.port/);
  }
  assert.equal(Context.config.rtmp.port, 1935);
});

test("PUT rejects invalid bind addresses", () => {
  reset();
  for (const bind of ["", "   ", "not valid!", 123, null]) {
    const res = put({ bind });
    assert.equal(res.statusCode, 400, `bind ${bind} should be rejected`);
    assert.match(res.body.error, /bind/);
  }
  // valid forms
  for (const bind of ["0.0.0.0", "127.0.0.1", "::1", "localhost", "media.internal-1"]) {
    const res = put({ bind });
    assert.equal(res.statusCode, 200, `bind ${bind} should be accepted`);
  }
});

test("PUT rejects invalid notify URLs", () => {
  reset();
  for (const url of ["ftp://example.com", "not a url", 123]) {
    const res = put({ notify: { url } });
    assert.equal(res.statusCode, 400, `notify.url ${url} should be rejected`);
  }
  // empty disables notifications and must stay valid
  const ok = put({ notify: { url: "" } });
  assert.equal(ok.statusCode, 200);
  assert.equal(Context.config.notify.url, "");
});

test("PUT rejects empty or wrong-type storage paths", () => {
  reset();
  for (const bad of ["", "   ", 42, null]) {
    for (const section of ["store", "record"]) {
      const res = put({ [section]: { path: bad } });
      assert.equal(res.statusCode, 400, `${section}.path ${bad} should be rejected`);
    }
  }
  assert.equal(Context.config.store.path, "./data");
});

test("PUT rejects invalid maxHistory", () => {
  reset();
  for (const maxHistory of [0, -5, 1.5, "100", null]) {
    const res = put({ store: { maxHistory } });
    assert.equal(res.statusCode, 400, `maxHistory ${maxHistory} should be rejected`);
  }
});

test("PUT rejects non-boolean auth flags", () => {
  reset();
  for (const flag of ["true", 1, null]) {
    const res = put({ auth: { play: flag } });
    assert.equal(res.statusCode, 400, `auth.play ${flag} should be rejected`);
  }
});

test("PUT rejects secret containing whitespace and non-strings", () => {
  reset();
  for (const secret of ["a b", "a\tb", "a\nb", 42, null]) {
    const res = put({ auth: { secret } });
    assert.equal(res.statusCode, 400, `secret ${JSON.stringify(secret)} should be rejected`);
  }
});

test("PUT rejects enabling auth with an empty secret", () => {
  reset();
  Context.config.auth.secret = "";
  const res = put({ auth: { publish: true } });
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /auth\.secret/);
  assert.equal(Context.config.auth.publish, false);

  // clearing the secret while auth is enabled is also rejected
  reset();
  Context.config.auth.publish = true;
  const res2 = put({ auth: { secret: "" } });
  assert.equal(res2.statusCode, 400);

  // clearing is fine when auth is disabled
  reset();
  const res3 = put({ auth: { secret: "" } });
  assert.equal(res3.statusCode, 200);
});

test("PUT rejects TLS port without key/cert", () => {
  reset();
  Context.config.https = { port: 8443, key: "", cert: "./cert.pem" };
  const res = put({ http: { port: 8001 } });
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /https\.key/);

  // clearing the port is the correct way to disable TLS
  reset();
  Context.config.https = { port: 8443, key: "", cert: "" };
  const res2 = put({ https: { port: 8443, key: "./k.pem", cert: "./c.pem" } });
  assert.equal(res2.statusCode, 200);
});

test("PUT leaves Context.config untouched on any validation failure", () => {
  reset();
  const before = JSON.stringify(Context.config);
  // second field invalid — the first must not be partially applied
  const res = put({ rtmp: { port: 9999 }, bind: "" });
  assert.equal(res.statusCode, 400);
  assert.equal(JSON.stringify(Context.config), before);
});

test("PUT ignores non-editable fields such as auth.jwt", () => {
  reset();
  Context.config.auth.jwt = { secret: "real-secret" };
  const res = put({ auth: { jwt: { secret: "hacked" } }, rtmp: { port: 1995 } });
  assert.equal(res.statusCode, 200);
  assert.equal(Context.config.auth.jwt.secret, "real-secret");
  assert.equal(Context.config.rtmp.port, 1995);
});
