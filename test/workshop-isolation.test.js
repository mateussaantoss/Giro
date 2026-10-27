"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const util = require("node:util");

const scrypt = util.promisify(crypto.scrypt);
const password = "Integration-test-2026!";
const port = 43187 + Math.floor(Math.random() * 300);
const baseUrl = `http://127.0.0.1:${port}`;

async function user(id, email, role, workshopId) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = await scrypt(password, salt, 64);
  return { id, name:id, email, passwordHash:`${salt}:${hash.toString("hex")}`, workshop:"Teste de integração", workshopId, role, status:"ACTIVE", active:true };
}

async function login(email) {
  const response = await fetch(`${baseUrl}/api/auth/login`, { method:"POST", headers:{ "content-type":"application/json" }, body:JSON.stringify({ email, password }) });
  const data = await response.json();
  assert.equal(response.status, 200, data.error);
  return { cookie:response.headers.get("set-cookie").split(";")[0], user:data.user };
}

async function request(session, route, options = {}) {
  const response = await fetch(`${baseUrl}${route}`, { ...options, headers:{ cookie:session.cookie, ...(options.body ? { "content-type":"application/json" } : {}), ...(options.headers || {}) }, body:options.body ? JSON.stringify(options.body) : undefined });
  return { response, data:await response.json() };
}

test("OS rápida do mecânico é compartilhada, vira cadastro de veículo e permanece isolada por oficina", async t => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "giro-tenant-test-"));
  const workshopA = crypto.randomUUID(), workshopB = crypto.randomUUID();
  const users = [
    await user("owner-a", "owner-a@test.invalid", "ADMIN", workshopA),
    await user("mechanic-a", "mechanic-a@test.invalid", "MECHANIC", workshopA),
    await user("owner-b", "owner-b@test.invalid", "OWNER", workshopB)
  ];
  fs.writeFileSync(path.join(dataDir, "users.json"), JSON.stringify(users));
  for (const file of ["service-orders.json", "invitation-tokens.json", "password-reset-tokens.json", "workshop-records.json"]) fs.writeFileSync(path.join(dataDir, file), "[]");

  const server = spawn(process.execPath, [path.resolve(__dirname, "..", "server.js")], { cwd:path.resolve(__dirname, ".."), env:{ ...process.env, PORT:String(port), GIRO_DATA_DIR:dataDir }, stdio:"ignore" });
  t.after(() => { server.kill(); fs.rmSync(dataDir, { recursive:true, force:true }); });

  let ready = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    try { if ((await fetch(`${baseUrl}/api/health`)).ok) { ready = true; break; } } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert.ok(ready, "API iniciou");

  const owner = await login("owner-a@test.invalid");
  const mechanic = await login("mechanic-a@test.invalid");
  const otherWorkshop = await login("owner-b@test.invalid");

  const created = await request(mechanic, "/api/orders/quick", { method:"POST", body:{ clientName:"Cliente compartilhado", phone:"51999998888", vehicleBrand:"Toyota", vehicleModel:"Corolla XEi", plate:"ABC1D23", issue:"Ruído na suspensão" } });
  assert.equal(created.response.status, 201, created.data.error);
  const orderId = created.data.order.id;
  assert.ok(created.data.order.vehicleId, "OS rápida completa já fica vinculada ao veículo cadastrado");

  let ownerOrders = await request(owner, "/api/orders");
  assert.equal(ownerOrders.response.status, 200);
  assert.equal(ownerOrders.data.orders.length, 1);
  assert.equal(ownerOrders.data.orders[0].id, orderId);

  const changedByMechanic = await request(mechanic, `/api/orders/${orderId}`, { method:"PATCH", body:{ status:1 } });
  assert.equal(changedByMechanic.response.status, 200, changedByMechanic.data.error);
  ownerOrders = await request(owner, "/api/orders");
  assert.equal(ownerOrders.data.orders[0].status, 1);
  const deniedMechanicRegistry = await request(mechanic, "/api/workshop/vehicles");
  assert.equal(deniedMechanicRegistry.response.status, 403);
  const deniedMechanicRegistration = await request(mechanic, `/api/orders/${orderId}/register-vehicle`, { method:"POST", body:{ year:2022, mileage:58400 } });
  assert.equal(deniedMechanicRegistration.response.status, 403);
  const registry = await request(owner, "/api/workshop/vehicles");
  assert.equal(registry.data.clients.length, 1);
  assert.equal(registry.data.vehicles[0].plate, "ABC1D23");

  const otherOrders = await request(otherWorkshop, "/api/orders");
  const otherRegistry = await request(otherWorkshop, "/api/workshop/vehicles");
  assert.equal(otherOrders.data.orders.length, 0);
  assert.equal(otherRegistry.data.vehicles.length, 0);
  const foreignDetail = await request(otherWorkshop, `/api/orders/${orderId}`);
  assert.equal(foreignDetail.response.status, 404);

  const duplicate = await request(owner, `/api/orders/${orderId}/register-vehicle`, { method:"POST", body:{ year:2022, mileage:58400 } });
  assert.equal(duplicate.response.status, 409);

  const finishedByMechanic = await request(mechanic, `/api/orders/${orderId}`, { method:"PATCH", body:{ status:2 } });
  assert.equal(finishedByMechanic.response.status, 200, finishedByMechanic.data.error);
  ownerOrders = await request(owner, "/api/orders");
  assert.equal(ownerOrders.data.orders[0].status, 2);
  const delivered = await request(owner, `/api/orders/${orderId}/deliver`, { method:"POST" });
  assert.equal(delivered.response.status, 200, delivered.data.error);
  const deliveredHistory = await request(owner, "/api/history/orders");
  assert.equal(deliveredHistory.data.orders[0].id, orderId);

  const repeatVehicle = await request(mechanic, "/api/orders/quick", { method:"POST", body:{ clientName:"Nome divergente", phone:"11999990000", vehicleBrand:"Marca divergente", vehicleModel:"Modelo divergente", plate:"ABC1D23", issue:"Retorno" } });
  assert.equal(repeatVehicle.response.status, 201);
  assert.equal(repeatVehicle.data.order.vehicleId, created.data.order.vehicleId, "placa existente reutiliza o registro do veículo");
  assert.equal(repeatVehicle.data.order.clientName, "Cliente compartilhado");
  const registryAfterRepeat = await request(owner, "/api/workshop/vehicles");
  assert.equal(registryAfterRepeat.data.vehicles.length, 1);
  assert.equal(registryAfterRepeat.data.clients.length, 1);

  const incomplete = await request(mechanic, "/api/orders/quick", { method:"POST", body:{ clientName:"Cliente pendente", vehicleBrand:"Ford", issue:"Revisar freios" } });
  assert.equal(incomplete.response.status, 201);
  assert.equal(incomplete.data.order.vehicleId, null, "OS sem placa/modelo não inventa nem cria um veículo incompleto");
  assert.ok(incomplete.data.order.clientId, "cliente é cadastrado mesmo sem telefone ou veículo completo");
  const registryAfterIncomplete = await request(owner, "/api/workshop/vehicles");
  assert.equal(registryAfterIncomplete.data.vehicles.length, 1);
  assert.equal(registryAfterIncomplete.data.clients.find(item => item.id === incomplete.data.order.clientId).name, "Cliente pendente");
  const clientOnly = await request(mechanic, "/api/orders/quick", { method:"POST", body:{ clientName:"Cliente sem carro", phone:"(51) 98888-7766" } });
  const repeatClient = await request(mechanic, "/api/orders/quick", { method:"POST", body:{ clientName:"Cliente sem carro", phone:"51988887766", issue:"Retorno" } });
  assert.equal(clientOnly.response.status, 201);
  assert.equal(repeatClient.response.status, 201);
  assert.ok(clientOnly.data.order.clientId);
  assert.equal(repeatClient.data.order.clientId, clientOnly.data.order.clientId, "nome e telefone reutilizam cliente dentro da oficina");
  assert.equal(repeatClient.data.order.vehicleId, null);
  const emptyOrder = await request(mechanic, "/api/orders/quick", { method:"POST", body:{ issue:"Avaliação" } });
  assert.equal(emptyOrder.data.order.clientId, null, "não inventar cliente sem nome");
  const otherRegistryAfter = await request(otherWorkshop, "/api/workshop/vehicles");
  assert.deepEqual(otherRegistryAfter.data.clients, [], "novos clientes continuam isolados da outra oficina");
});
