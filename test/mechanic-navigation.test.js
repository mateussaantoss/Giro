"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const chromePath = process.env.GIRO_CHROME_PATH || "/usr/bin/google-chrome";
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function freePort() {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

class CDP {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.id = 0;
    this.pending = new Map();
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once:true });
      this.socket.addEventListener("error", reject, { once:true });
    });
    this.socket.addEventListener("message", event => {
      const message = JSON.parse(event.data), pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result);
    });
  }
  async send(method, params = {}) {
    await this.ready;
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expression) {
    const result = await this.send("Runtime.evaluate", { expression, returnByValue:true, awaitPromise:true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result?.value;
  }
  close() { this.socket.close(); }
}

test("navegação do mecânico mantém Serviços como tela e Histórico como overlay", { skip:!fs.existsSync(chromePath) || typeof WebSocket === "undefined" }, async t => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "giro-mechanic-navigation-data-"));
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "giro-mechanic-navigation-chrome-"));
  const port = await freePort(), debugPort = await freePort();
  const workshopId = "mechanic-navigation-workshop";
  const password = "MechanicNavigation-2026!";
  const ownerSalt = crypto.randomBytes(16).toString("hex");
  const mechanicSalt = crypto.randomBytes(16).toString("hex");
  const owner = { id:"navigation-owner", name:"Owner Navegação", email:"navigation-owner@example.invalid", passwordHash:`${ownerSalt}:${crypto.scryptSync(password, ownerSalt, 64).toString("hex")}`, workshop:"Oficina Navegação", workshopId, role:"OWNER", status:"ACTIVE", active:true };
  const mechanic = { id:"navigation-mechanic", name:"Mecânico Navegação", email:"navigation-mechanic@example.invalid", passwordHash:`${mechanicSalt}:${crypto.scryptSync(password, mechanicSalt, 64).toString("hex")}`, workshop:owner.workshop, workshopId, role:"MECHANIC", status:"ACTIVE", active:true };
  const activeOrder = { id:701, workshopId, clientName:"Cliente Ativo", phone:"51999990001", vehicleBrand:"Toyota", vehicleModel:"Corolla", plate:"NAV1A23", issue:"Revisão ativa", service:"Troca de óleo", status:1, priority:"Normal", entryAt:"2026-10-06T10:00:00.000Z", assignedUserId:mechanic.id, createdBy:owner.id, history:[] };
  const closedOrder = { id:702, workshopId, clientName:"Cliente Encerrado", phone:"51999990002", vehicleBrand:"Honda", vehicleModel:"Civic", plate:"NAV2B34", issue:"Revisão concluída", service:"Freios concluídos", status:2, priority:"Normal", entryAt:"2026-10-01T10:00:00.000Z", finishedAt:"2026-10-02T10:00:00.000Z", closedAt:"2026-10-03T10:00:00.000Z", assignedUserId:mechanic.id, createdBy:owner.id, closedBy:owner.id, history:[] };
  fs.writeFileSync(path.join(dataDir, "users.json"), JSON.stringify([owner, mechanic]));
  fs.writeFileSync(path.join(dataDir, "service-orders.json"), JSON.stringify([activeOrder, closedOrder]));
  for (const file of ["workshop-records.json", "invitation-tokens.json", "password-reset-tokens.json"]) fs.writeFileSync(path.join(dataDir, file), "[]");

  const server = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], { cwd:path.join(__dirname, ".."), env:{ ...process.env, PORT:String(port), GIRO_DATA_DIR:dataDir, SMTP_HOST:"", SMTP_FROM:"" }, stdio:"ignore" });
  const chrome = spawn(chromePath, ["--headless=new", "--no-first-run", "--disable-gpu", "--disable-background-networking", "--no-sandbox", "--remote-allow-origins=*", `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profileDir}`, "about:blank"], { stdio:"ignore" });
  let cdp;
  t.after(async () => { cdp?.close(); chrome.kill(); server.kill(); await delay(150); fs.rmSync(dataDir, { recursive:true, force:true }); fs.rmSync(profileDir, { recursive:true, force:true }); });

  const base = `http://127.0.0.1:${port}`;
  let target;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) {
        const response = await fetch(`http://127.0.0.1:${debugPort}/json`);
        if (response.ok) { target = await response.json(); break; }
      }
    } catch (_) {}
    await delay(100);
  }
  assert.ok(target, "servidor isolado e Chrome CDP ficam disponíveis");
  const created = await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(`${base}/app/#/login`)}`, { method:"PUT" });
  cdp = new CDP((await created.json()).webSocketDebuggerUrl);
  await cdp.send("Runtime.enable");
  await cdp.send("Page.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", { width:1440, height:900, deviceScaleFactor:1, mobile:false });

  const poll = async expression => { for (let attempt = 0; attempt < 100; attempt++) { if (await cdp.eval(expression)) return true; await delay(100); } return false; };
  const fill = (selector, value) => cdp.eval(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return false;e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);
  const click = selector => cdp.eval(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return false;e.click();return true})()`);

  assert.ok(await poll("document.querySelector('#login-form')"), "login renderiza");
  await fill("[name=email]", mechanic.email);
  await fill("[name=password]", password);
  await cdp.eval("document.querySelector('#login-form').requestSubmit()");
   assert.ok(await poll("document.querySelector('.topbar') && location.hash==='#/dashboard'"), "login do mecânico abre o painel");
   assert.ok(await poll("document.querySelector('.workshop-card .user-info small')?.innerText === 'Mecânico'"), "sidebar mostra a role real do mecânico");
  assert.ok(await poll("document.querySelector('.nav a[href=\\\"#/servicos\\\"]')"), "menu do mecânico contém Meus Serviços");

  await click('.nav a[href="#/servicos"]');
  assert.ok(await poll("location.hash==='#/servicos' && document.querySelector('#results')?.innerText.includes('Cliente Ativo')"), "Serviços mostra a OS ativa atribuída");
  const services = await cdp.eval("({ hash:location.hash, title:document.querySelector('h1')?.innerText, body:document.body.innerText, historyOpen:!!document.querySelector('dialog.history-modal[open]') })");
  assert.equal(services.hash, "#/servicos");
  assert.match(services.title, /Meus Serviços/i);
  assert.equal(services.historyOpen, false);
  assert.equal(services.body.includes("Cliente Encerrado"), false, "a OS encerrada não aparece na tela de serviços");
  assert.equal(services.body.includes("Ordens finalizadas"), false, "o conteúdo do Histórico não é renderizado sob Serviços");

  await click('.nav a[href="#/historico"]');
  assert.ok(await poll("document.querySelector('dialog.history-modal[open]')"), "Histórico abre como overlay");
  const overlay = await cdp.eval("(()=>{const d=document.querySelector('dialog.history-modal'),s=document.querySelector('.sidebar'),m=document.querySelector('#main');const z=e=>Number.parseInt(getComputedStyle(e).zIndex,10)||0;const dr=d.getBoundingClientRect(),sr=s.getBoundingClientRect(),mr=m.getBoundingClientRect();return {hash:location.hash,closed:d.innerText.includes('Cliente Encerrado'),open:d.open,overlayZ:z(d),sidebarZ:z(s),mainLeft:mr.left,sidebarRight:sr.right,dialogTop:dr.top}})()");
  assert.equal(overlay.hash, "#/servicos", "abrir Histórico preserva o hash de Serviços");
  assert.equal(overlay.open, true);
  assert.equal(overlay.closed, true, "Histórico contém a OS encerrada");
  assert.ok(overlay.overlayZ > overlay.sidebarZ, `overlay deve ficar acima da sidebar: ${JSON.stringify(overlay)}`);
  assert.ok(overlay.mainLeft >= overlay.sidebarRight, `layout principal não deve começar sob a sidebar: ${JSON.stringify(overlay)}`);

  await click('.history-modal [aria-label="Fechar Histórico"]');
  assert.ok(await poll("!document.querySelector('dialog.history-modal')?.open"), "X fecha o overlay");
  assert.equal(await cdp.eval("location.hash"), "#/servicos");
  assert.match(await cdp.eval("document.querySelector('h1')?.innerText || ''"), /Meus Serviços/i);

  await cdp.eval("location.reload()");
  assert.ok(await poll("location.hash==='#/servicos' && document.querySelector('#results')"), "refresh mantém Serviços");
  assert.equal(await cdp.eval("!!document.querySelector('dialog.history-modal[open]')"), false, "refresh em Serviços não abre Histórico");
  assert.equal(await cdp.eval("document.body.innerText.includes('Cliente Ativo')"), true, "OS ativa permanece após refresh");
});
