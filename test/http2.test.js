// @ts-check
//
//  Created by Chen Mingliang on 26/09/09.
//  illuspas@msn.com
//  Copyright (c) 2026 NodeMedia. All rights reserved.
//

const assert = require("node:assert/strict");
const { execFileSync, execSync } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const http2 = require("node:http2");
const https = require("node:https");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const express = require("express");
const http2Express = require("http2-express");

/**
 * Whether the openssl CLI is available (used to mint an ephemeral test certificate).
 * @type {boolean}
 */
const hasOpenSSL = (() => {
  try {
    execSync("openssl version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

/**
 * Generate an ephemeral self-signed certificate for the HTTPS/2 listener.
 * @returns {{key: string, cert: string}} PEM file paths in a temp directory
 */
function makeCertificate() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nms-h2-"));
  const key = path.join(dir, "key.pem");
  const cert = path.join(dir, "cert.pem");
  execFileSync("openssl", [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes",
    "-keyout", key, "-out", cert, "-days", "2", "-subj", "/CN=localhost"
  ], { stdio: "ignore" });
  return { key, cert };
}

/**
 * Build an app wired the same way as src/server/http_server.js:
 * one http2Express(express) app shared by the plain HTTP and the
 * HTTP/2 secure listeners, with the FLV catch-all route.
 * @param {string} downloadFile - file served by the download endpoint
 * @returns {object} the express app
 */
function buildApp(downloadFile) {
  const app = http2Express(express);
  app.use(express.json());
  app.all("/:app/:name.flv", (req, res) => {
    res.status(200).json({
      matched: true,
      app: req.params.app,
      name: req.params.name,
      hostname: req.hostname,
      query: req.query,
      method: req.method,
      httpVersion: req.httpVersion
    });
  });
  app.post("/api/echo", (req, res) => {
    res.status(200).json({ body: req.body, httpVersion: req.httpVersion });
  });
  app.get("/api/download", (req, res) => {
    res.download(downloadFile);
  });
  app.use((req, res) => {
    res.status(404).json({ matched: false, path: req.path });
  });
  return app;
}

/**
 * Perform a single request over an HTTP/2 session and collect the response.
 * @param {http2.ClientHttp2Session} session
 * @param {{method: string, path: string, body?: string, headers?: object}} options
 * @returns {Promise<{status: number, headers: object, body: string}>}
 */
function h2Request(session, options) {
  return new Promise((resolve, reject) => {
    const stream = session.request({
      ":method": options.method,
      ":path": options.path,
      ...(options.body
        ? { "content-type": "application/json", "content-length": String(Buffer.byteLength(options.body)) }
        : {}),
      ...options.headers
    });
    const chunks = [];
    stream.on("response", (headers) => {
      stream.on("data", c => chunks.push(c));
      stream.on("end", () => {
        resolve({
          status: Number(headers[":status"]),
          headers,
          body: Buffer.concat(chunks).toString("utf8")
        });
      });
    });
    stream.on("error", reject);
    if (options.body) {
      stream.write(options.body);
    }
    stream.end();
  });
}

/**
 * Perform a plain HTTP/1.1 request against a TLS listener (allowHTTP1 fallback).
 * @param {string} url
 * @param {{headers?: object}=} options
 * @returns {Promise<{status: number, headers: object, body: string}>}
 */
function https1Request(url, options = {}) {
  return new Promise((resolve, reject) => {
    https.get(url, { rejectUnauthorized: false, headers: options.headers ?? {} }, res => {
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => {
        resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") });
      });
    }).on("error", reject);
  });
}

test.describe("Express 5 + http2-express wiring", () => {
  let httpServer;
  let httpsServer;
  let httpUrl;
  let httpsUrl;
  let downloadFile;

  test.before(async () => {
    if (!hasOpenSSL) {
      return;
    }
    const dlDir = fs.mkdtempSync(path.join(os.tmpdir(), "nms-h2-dl-"));
    downloadFile = path.join(dlDir, "sample.txt");
    fs.writeFileSync(downloadFile, "hello-nms\n");
    const { key, cert } = makeCertificate();
    const app = buildApp(downloadFile);

    httpServer = http.createServer(app);
    httpsServer = http2.createSecureServer(
      { key: fs.readFileSync(key), cert: fs.readFileSync(cert), allowHTTP1: true },
      app
    );
    await new Promise(resolve => httpServer.listen(0, "127.0.0.1", resolve));
    await new Promise(resolve => httpsServer.listen(0, "127.0.0.1", resolve));
    httpUrl = `http://127.0.0.1:${httpServer.address().port}`;
    httpsUrl = `https://127.0.0.1:${httpsServer.address().port}`;
  });

  test.after(() => {
    if (!hasOpenSSL) {
      return;
    }
    httpServer?.close();
    httpsServer?.close();
  });

  test.it("h1: FLV catch-all /:app/:name.flv matches with correct params", async t => {
    if (!hasOpenSSL) return t.skip("openssl not available");
    const res = await fetch(`${httpUrl}/live/stream.flv`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.matched, true);
    assert.equal(body.app, "live");
    assert.equal(body.name, "stream");
    assert.equal(body.httpVersion, "1.1");
  });

  test.it("h1: non-.flv paths fall through to 404", async t => {
    if (!hasOpenSSL) return t.skip("openssl not available");
    const res = await fetch(`${httpUrl}/live/stream.mp4`);
    assert.equal(res.status, 404);
  });

  test.it("h1: query scalars stay strings, repeated params become arrays (Express 4 parity)", async t => {
    if (!hasOpenSSL) return t.skip("openssl not available");
    const res = await fetch(`${httpUrl}/live/stream.flv?a=1&a=2&tok=x`);
    const body = await res.json();
    assert.equal(body.query.tok, "x");
    assert.deepEqual(body.query.a, ["1", "2"]);
  });

  test.it("h1: req.hostname strips the port", async t => {
    if (!hasOpenSSL) return t.skip("openssl not available");
    const res = await new Promise((resolve, reject) => {
      http.get(`${httpUrl}/live/stream.flv`, { headers: { host: "example.com:8000" } }, r => {
        const chunks = [];
        r.on("data", c => chunks.push(c));
        r.on("end", () => resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))));
      }).on("error", reject);
    });
    assert.equal(res.hostname, "example.com");
  });

  test.it("h1 over TLS: allowHTTP1 fallback serves the FLV route", async t => {
    if (!hasOpenSSL) return t.skip("openssl not available");
    const res = await https1Request(`${httpsUrl}/live/stream.flv`);
    const body = JSON.parse(res.body);
    assert.equal(res.status, 200);
    assert.equal(body.httpVersion, "1.1");
    assert.equal(body.app, "live");
  });

  test.it("h2: negotiates HTTP/2 and matches the FLV route", async t => {
    if (!hasOpenSSL) return t.skip("openssl not available");
    const session = http2.connect(httpsUrl, { rejectUnauthorized: false });
    try {
      const res = await h2Request(session, { method: "GET", path: "/live/stream.flv?q=1" });
      const body = JSON.parse(res.body);
      assert.equal(res.status, 200);
      assert.equal(body.httpVersion, "2.0");
      assert.equal(body.app, "live");
      assert.equal(body.name, "stream");
      assert.equal(body.query.q, "1");
    } finally {
      session.close();
    }
  });

  test.it("h2: express.json parses POST bodies", async t => {
    if (!hasOpenSSL) return t.skip("openssl not available");
    const session = http2.connect(httpsUrl, { rejectUnauthorized: false });
    try {
      const res = await h2Request(session, { method: "POST", path: "/api/echo", body: JSON.stringify({ x: 1 }) });
      const body = JSON.parse(res.body);
      assert.equal(res.status, 200);
      assert.equal(body.httpVersion, "2.0");
      assert.deepEqual(body.body, { x: 1 });
    } finally {
      session.close();
    }
  });

  test.it("h2: res.download sends the file as an attachment", async t => {
    if (!hasOpenSSL) return t.skip("openssl not available");
    const session = http2.connect(httpsUrl, { rejectUnauthorized: false });
    try {
      const res = await h2Request(session, { method: "GET", path: "/api/download" });
      assert.equal(res.status, 200);
      assert.match(String(res.headers["content-disposition"]), /attachment; filename="sample\.txt"/);
      assert.equal(res.body, "hello-nms\n");
    } finally {
      session.close();
    }
  });

  test.it("h1: res.download works without TLS", async t => {
    if (!hasOpenSSL) return t.skip("openssl not available");
    const res = await fetch(`${httpUrl}/api/download`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-disposition") ?? "", /attachment; filename="sample\.txt"/);
    assert.equal(await res.text(), "hello-nms\n");
  });
});
