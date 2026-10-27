"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");
const { createRequire } = require("node:module");

test("new registration supports login and password recovery without restarting", async t => {
  const serverFile = path.join(__dirname, "..", "server.js");
  const serverRequire = createRequire(serverFile);
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "giro-password-reset-test-"));
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  const app = serverRequire("express")();
  let started = false;
  app.listen = () => { started = true; };
  const mail = [];
  const express = Object.assign(() => app, serverRequire("express"));

  // Load the unchanged server once; no real .env, network or application data is used.
  await vm.runInNewContext(fs.readFileSync(serverFile, "utf8"), {
    __dirname: path.dirname(serverFile),
    Buffer, AbortSignal, console,
    process: { env: {
      GIRO_DATA_DIR: dataDir,
      SMTP_HOST: "smtp.example.invalid",
      SMTP_FROM: "giro@example.invalid",
      APP_URL: "https://giro.example.invalid"
    } },
    require: name => {
      if (name === "dotenv") return { config() {} };
      if (name === "express") return express;
      if (name === "nodemailer") return {
        createTransport: () => ({ sendMail: async message => { mail.push(message); } })
      };
      return serverRequire(name);
    },
    fetch: async url => {
      assert.equal(url, "https://servicodados.ibge.gov.br/api/v1/localidades/estados/SP/municipios");
      return { ok: true, json: async () => [{ nome: "Cidade Teste" }] };
    }
  }, { filename: serverFile });
  assert.equal(started, true, "authentication bootstrap must complete before registration");

  async function post(route, body) {
    const handler = app._router.stack.find(layer => layer.route?.path === route && layer.route.methods.post).route.stack[0].handle;
    const response = {
      statusCode: 200,
      headers: {},
      status(code) { this.statusCode = code; return this; },
      setHeader(name, value) { this.headers[name] = value; },
      json(value) { this.body = value; return this; }
    };
    await handler({ body, headers: {}, ip: "127.0.0.1", secure: false }, response, error => { throw error; });
    return response;
  }

  const email = "owner@example.invalid";
  const password = "RegressionPass123";
  const registration = await post("/api/auth/register", {
    name: "Owner Test", phone: "11999990000", workshop: "Oficina Teste",
    state: "SP", city: "Cidade Teste", email, password,
    passwordConfirmation: password, focus: "Acompanhar a equipe", terms: true
  });
  assert.equal(registration.statusCode, 201, JSON.stringify(registration.body));

  await t.test("registered owner can log in immediately", async () => {
    const login = await post("/api/auth/login", { email, password });
    assert.equal(login.statusCode, 200, "newly registered owner must be ACTIVE without bootstrap migration");
    assert.equal(login.body.user.id, registration.body.user.id);
    assert.match(login.headers["Set-Cookie"], /^giro_session=/);
  });

  await t.test("password recovery actually sends mail and persists its token", async () => {
    const recovery = await post("/api/auth/forgot-password", { email });
    assert.equal(recovery.statusCode, 200);
    assert.equal(recovery.body.ok, true);
    // A generic 200 alone also occurs when the new account is silently ignored.
    assert.equal(mail.length, 1, "newly registered owner must receive a reset email");
    assert.equal(mail[0].to, email);
    const rawToken = mail[0].text.match(/token=([A-Za-z0-9_-]+)/)?.[1];
    assert.ok(rawToken, "reset email must contain a token");
    const tokens = JSON.parse(fs.readFileSync(path.join(dataDir, "password-reset-tokens.json"), "utf8"));
    assert.equal(tokens.length, 1);
    assert.equal(tokens[0].userId, registration.body.user.id);
    assert.equal(tokens[0].usedAt, null);
    assert.equal(tokens[0].tokenHash, crypto.createHash("sha256").update(rawToken).digest("hex"));
  });
});
