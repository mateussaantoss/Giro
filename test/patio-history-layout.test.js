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
    this.socket = new WebSocket(url); this.id = 0; this.pending = new Map();
    this.ready = new Promise((resolve, reject) => { this.socket.addEventListener("open", resolve, { once:true }); this.socket.addEventListener("error", reject, { once:true }); });
    this.socket.addEventListener("message", event => { const message = JSON.parse(event.data); const pending = this.pending.get(message.id); if (!pending) return; this.pending.delete(message.id); message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result); });
  }
  async send(method, params = {}) { await this.ready; const id = ++this.id; return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.socket.send(JSON.stringify({ id, method, params })); }); }
  async eval(expression) { const result = await this.send("Runtime.evaluate", { expression, returnByValue:true, awaitPromise:true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.text); return result.result?.value; }
  close() { this.socket.close(); }
}

test("Pátio vazio e Histórico não criam scroll interno", { skip:!fs.existsSync(chromePath) || typeof WebSocket === "undefined" }, async t => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "giro-layout-data-"));
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "giro-layout-chrome-"));
  const port = await freePort(), debugPort = await freePort();
  const password = "LayoutTest-2026!", salt = crypto.randomBytes(16).toString("hex");
  const user = { id:"layout-owner", name:"Owner Layout", email:"layout-owner@example.invalid", passwordHash:`${salt}:${crypto.scryptSync(password, salt, 64).toString("hex")}`, workshop:"Oficina Layout", workshopId:"layout-workshop", role:"OWNER", status:"ACTIVE", active:true };
  const closedOrder = { id:91, workshopId:user.workshopId, clientName:"Cliente Histórico", vehicleBrand:"Toyota", vehicleModel:"Corolla", plate:"ABC1D23", issue:"Revisão", service:"Revisão concluída", status:3, estimatedValue:450, entryAt:"2026-09-01T10:00:00.000Z", finishedAt:"2026-09-02T10:00:00.000Z", closedAt:"2026-09-03T10:00:00.000Z", history:[{ action:"delivered", text:"Veículo entregue", at:"2026-09-03T10:00:00.000Z" }] };
  fs.writeFileSync(path.join(dataDir, "users.json"), JSON.stringify([user]));
  fs.writeFileSync(path.join(dataDir, "service-orders.json"), JSON.stringify([closedOrder]));
  for (const file of ["workshop-records.json", "invitation-tokens.json", "password-reset-tokens.json"]) fs.writeFileSync(path.join(dataDir, file), "[]");
  const server = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], { cwd:path.join(__dirname, ".."), env:{ ...process.env, PORT:String(port), GIRO_DATA_DIR:dataDir, SMTP_HOST:"", SMTP_FROM:"" }, stdio:"ignore" });
  const chrome = spawn(chromePath, ["--headless=new", "--no-first-run", "--disable-gpu", "--disable-background-networking", "--no-sandbox", "--remote-allow-origins=*", `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profileDir}`, "about:blank"], { stdio:"ignore" });
  let cdp;
  t.after(async () => { cdp?.close(); chrome.kill(); server.kill(); await delay(150); fs.rmSync(dataDir, { recursive:true, force:true }); fs.rmSync(profileDir, { recursive:true, force:true }); });
  const base = `http://127.0.0.1:${port}`;
  let target;
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`${base}/api/health`)).ok) { const response = await fetch(`http://127.0.0.1:${debugPort}/json`); if (response.ok) { target = await response.json(); break; } } } catch (_) {} await delay(100); }
  assert.ok(target, "isolated server and Chrome CDP become ready");
  const created = await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(`${base}/app/#/login`)}`, { method:"PUT" });
  cdp = new CDP((await created.json()).webSocketDebuggerUrl); await cdp.send("Runtime.enable"); await cdp.send("Page.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", { width:1440, height:900, deviceScaleFactor:1, mobile:false });
  const poll = async expression => { for (let i = 0; i < 80; i++) { if (await cdp.eval(expression)) return true; await delay(100); } return false; };
  const fill = (selector, value) => cdp.eval(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return false;e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
  await poll("document.querySelector('#login-form')"); await fill('[name=email]', user.email); await fill('[name=password]', password); await cdp.eval("document.querySelector('#login-form').requestSubmit()"); assert.ok(await poll("document.querySelector('.topbar')"), "owner login opens dashboard");
  await cdp.eval(`localStorage.setItem('giro-workshop-v1:${user.id}', ${JSON.stringify(JSON.stringify({ statusVersion:2, clients:[{id:1,name:"Cliente"}], vehicles:[{id:1,brand:"Toyota",model:"Corolla",plate:"ABC1D23",client:1}], team:[], orders:[], conversations:[], settings:{workshop:user.workshop,name:user.name}, readNotifications:false }))}); location.reload()`);
  assert.ok(await poll("document.querySelector('#patio-section') && document.querySelector('.empty-state-panel')"), "empty patio renders");
  const patio = await cdp.eval(`(()=>{const p=document.querySelector('.empty-state-panel'), i=p?.querySelector(':scope > .icon'), s=p?.querySelector(':scope > strong'), b=p?.querySelector(':scope > .btn'); const r=x=>x&&x.getBoundingClientRect(); return {icon:!!i,strong:!!s,button:!!b,centered:[i,s,b].every(x=>x && Math.abs(r(x).left+r(x).width/2-(r(p).left+r(p).width/2))<1),overflow:document.documentElement.scrollWidth<=document.documentElement.clientWidth&&document.body.scrollWidth<=document.body.clientWidth,controls:document.querySelectorAll('.patio-mode-controls [data-action]').length,viewControls:document.querySelectorAll('.patio-view-switch [data-action]').length}})()`);
  assert.deepEqual(patio, { icon:true, strong:true, button:true, centered:true, overflow:true, controls:2, viewControls:2 }, "desktop empty patio layout and controls");
  await cdp.eval("(()=>{const d=document.querySelector('#modal'); d.__showCalled=false; d.__showModalCalled=false; const show=d.show.bind(d), showModal=d.showModal.bind(d); d.show=()=>{d.__showCalled=true;show()}; d.showModal=()=>{d.__showModalCalled=true;showModal()}; document.querySelector('.nav a[href=\"#/historico\"]').focus(); document.querySelector('.nav a[href=\"#/historico\"]').click()})()");
  assert.ok(await poll("document.querySelector('dialog.history-modal[open]')"), "History opens as dialog");
  const history = await cdp.eval(`(()=>{const d=document.querySelector('dialog.history-modal'), b=document.body, h=d?.querySelector('.history-modal-body'); const style=x=>x&&getComputedStyle(x); return {route:location.hash,open:d?.open,overflow:[d,b,h].map(x=>style(x)?.overflow),noInternal:[d,b,h].every(x=>x && (x.scrollHeight<=x.clientHeight || style(x).overflow==='visible')),filters:!!d?.querySelector('.history-modal-toolbar'),cards:!!d?.querySelector('.history-order-card')}})()`);
  assert.equal(history.open, true); assert.equal(history.route, "#/dashboard"); assert.ok(history.filters && history.cards, "History keeps filters and cards"); assert.ok(history.noInternal, `History has internal overflow: ${JSON.stringify(history)}`); assert.deepEqual(await cdp.eval("({show:document.querySelector('#modal').__showCalled,showModal:document.querySelector('#modal').__showModalCalled})"), {show:true,showModal:false}, "History uses show(), not showModal()");
  const before = await cdp.eval("scrollY"); await cdp.eval("scrollTo(0, Math.min(500, document.documentElement.scrollHeight));"); await delay(50); assert.ok(await cdp.eval(`scrollY > ${before}`), "page scrollY changes while History is open");
   await cdp.eval("document.querySelector('.history-modal [aria-label=\\\"Fechar Histórico\\\"]').click()"); assert.equal(await cdp.eval("document.querySelector('dialog.history-modal')?.open || false"), false, "X closes History"); assert.equal(await cdp.eval("location.hash"), "#/dashboard", "closing History keeps the previous screen");
  await cdp.eval("document.querySelector('.nav a[href=\"#/historico\"]').click()"); await poll("document.querySelector('dialog.history-modal[open]')"); await cdp.eval("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))"); assert.equal(await cdp.eval("document.querySelector('dialog.history-modal')?.open || false"), false, "ESC closes History");
  await cdp.send("Emulation.setDeviceMetricsOverride", { width:390, height:844, deviceScaleFactor:1, mobile:true }); await cdp.eval("location.hash='#/dashboard'"); await delay(150);
  const mobile = await cdp.eval("(()=>{const offenders=[...document.querySelectorAll('body *')].map(e=>({tag:e.tagName,cls:e.className?.toString().slice(0,80),right:Math.round(e.getBoundingClientRect().right),width:Math.round(e.getBoundingClientRect().width)})).filter(e=>e.right>innerWidth+1).sort((a,b)=>b.right-a.right).slice(0,5); return {overflow:document.documentElement.scrollWidth<=innerWidth&&document.body.scrollWidth<=innerWidth&&offenders.length===0,viewport:innerWidth,documentWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth,offenders,patio:!!document.querySelector('#patio-section'),controls:document.querySelectorAll('.patio-mode-controls [data-action]').length}})()"); assert.equal(mobile.overflow, true, `mobile empty patio has horizontal overflow: ${JSON.stringify(mobile)}`); assert.equal(mobile.patio, true); assert.equal(mobile.controls, 2);
});
