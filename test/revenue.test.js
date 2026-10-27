"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const util = require("node:util");

const password = "Revenue-test-2026!";
const scrypt = util.promisify(crypto.scrypt);

async function makeUser(id, email, role, workshopId) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = await scrypt(password, salt, 64);
  return { id, name:id, email, passwordHash:`${salt}:${hash.toString("hex")}`, workshop:"Oficina de teste", workshopId, role, status:"ACTIVE", active:true };
}

test("relatório de receita no fallback respeita fechamento, oficina e permissão", async t => {
  if (process.env.MYSQL_TEST_URL) t.skip("Teste de integração MySQL é executado pelo ambiente de banco.");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "giro-revenue-test-"));
  const workshop = crypto.randomUUID(), otherWorkshop = crypto.randomUUID();
  const owner = await makeUser("owner", "owner@revenue.test", "OWNER", workshop);
  const mechanic = await makeUser("mechanic", "mechanic@revenue.test", "MECHANIC", workshop);
  const attendant = await makeUser("attendant", "attendant@revenue.test", "ATTENDANT", workshop);
  const foreignOwner = await makeUser("foreign", "foreign@revenue.test", "OWNER", otherWorkshop);
  const orders = [
    { id:1, workshopId:workshop, statusVersion:2, status:3, closedAt:"2026-10-10T12:00:00.000Z", clientName:"Snapshot", vehicleBrand:"Ford", vehicleModel:"Ka", plate:"AAA0001", assignedUserId:mechanic.id, estimatedValue:200, discount:20, laborItems:[{ value:50 }] },
    { id:2, workshopId:workshop, statusVersion:2, status:3, closedAt:"2026-10-31T23:59:59.999Z", clientName:"Fallback", vehicleBrand:"Fiat", vehicleModel:"Uno", plate:"BBB0002", assignedUserId:mechanic.id, estimatedValue:null, discount:10, laborItems:[{ value:80 }] },
    { id:3, workshopId:workshop, statusVersion:2, status:2, clientName:"Pronta", assignedUserId:mechanic.id },
    { id:4, workshopId:workshop, statusVersion:2, status:4, cancelledAt:"2026-10-15T10:00:00.000Z", clientName:"Cancelada", assignedUserId:mechanic.id },
    { id:5, workshopId:workshop, statusVersion:2, status:3, closedAt:"2026-11-01T00:00:00.000Z", clientName:"Fora", assignedUserId:mechanic.id, estimatedValue:999, laborItems:[] },
    { id:6, workshopId:otherWorkshop, statusVersion:2, status:3, closedAt:"2026-10-10T12:00:00.000Z", estimatedValue:500 }
  ];
  fs.writeFileSync(path.join(dir, "users.json"), JSON.stringify([owner, mechanic, attendant, foreignOwner]));
  fs.writeFileSync(path.join(dir, "service-orders.json"), JSON.stringify(orders));
  for (const file of ["invitation-tokens.json", "password-reset-tokens.json", "workshop-records.json", "service-templates.json"]) fs.writeFileSync(path.join(dir, file), "[]");
  const port = 44000 + Math.floor(Math.random() * 500);
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [path.resolve(__dirname, "..", "server.js")], { cwd:path.resolve(__dirname, ".."), env:{ ...process.env, PORT:String(port), GIRO_DATA_DIR:dir }, stdio:"ignore" });
  t.after(() => { child.kill(); fs.rmSync(dir, { recursive:true, force:true }); });
  for (let attempt = 0; attempt < 50; attempt++) { try { if ((await fetch(`${base}/api/health`)).ok) break; } catch (_) {} await new Promise(resolve => setTimeout(resolve, 100)); }
  async function login(email) {
    const response = await fetch(`${base}/api/auth/login`, { method:"POST", headers:{ "content-type":"application/json" }, body:JSON.stringify({ email, password }) });
    assert.equal(response.status, 200);
    return response.headers.get("set-cookie").split(";")[0];
  }
  async function get(cookie, url) {
    const response = await fetch(`${base}${url}`, { headers:{ cookie } });
    return { response, data:await response.json() };
  }
  const ownerCookie = await login(owner.email);
  const attendantCookie = await login(attendant.email);
  const foreignCookie = await login(foreignOwner.email);
  const report = await get(ownerCookie, "/api/reports/revenue?from=2026-10-01&to=2026-11-01");
  assert.equal(report.response.status, 200);
  assert.equal(report.data.summary.orders, 2);
  assert.equal(report.data.summary.netRevenue, 270);
  assert.equal(report.data.summary.readyOrders, 1);
  assert.equal(report.data.summary.cancelledOrders, 1);
  assert.equal(report.data.orders[1].total, 70);
  assert.equal(report.data.byPeriod.find(item => item.date === "2026-10-31").orders, 1);
  assert.equal((await get(ownerCookie, "/api/reports/revenue?from=2026-11-01&to=2026-10-01")).response.status, 400);
  assert.equal((await get(attendantCookie, "/api/reports/revenue?from=2026-10-01&to=2026-11-01")).response.status, 403);
  assert.equal((await get(foreignCookie, "/api/reports/revenue?from=2026-10-01&to=2026-11-01")).data.summary.orders, 1);
  assert.equal((await get(ownerCookie, `/api/reports/revenue?from=2026-10-01&to=2026-11-01&assignedUserId=${mechanic.id}`)).data.byMechanic[0].userId, mechanic.id);
});
