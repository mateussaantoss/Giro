"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");
const { createRequire } = require("node:module");
const { createInventory } = require("../inventory");
const owner = { id:"owner", name:"Owner", role:"OWNER", workshopId:"a", active:true, status:"ACTIVE" };
const manager = { ...owner, id:"manager", role:"MANAGER" };
const mechanic = { ...owner, id:"mechanic", role:"MECHANIC" };
const attendant = { ...owner, id:"attendant", role:"ATTENDANT" };
const foreign = { ...owner, id:"foreign", workshopId:"b" };
const order = { id:1, workshopId:"a", assignedUserId:"mechanic", closedAt:null };
function body(values) { return { operationId:crypto.randomUUID(), ...values }; }
function setup(t, io) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "giro-inventory-test-"));
  t.after(() => fs.rmSync(dir, { recursive:true, force:true }));
  return { dir, inventory:createInventory(dir, io) };
}
function status(code) { return error => error.status === code; }
function item(inventory, values = {}) { return inventory.create(owner, body({ name:"Oleo", unit:"L", tracked:true, ...values })).item; }
function movement(inventory, id, quantity, type = "ENTRY", user = owner) { return inventory.movement(user, body({ itemId:id, quantity, type, reason:"Ajuste" })); }

test("integer milli precision, zero initial balance and immutable tracking", t => {
  const { inventory, dir } = setup(t);
  const created = item(inventory, { quantity:900, minimumQuantity:0.001, costPrice:10.075 });
  assert.equal(created.quantity, 0);
  assert.equal(created.costPrice, 10.08);
  movement(inventory, created.id, 0.1);
  movement(inventory, created.id, 0.2);
  assert.equal(inventory.list(owner).items[0].quantity, 0.3);
  movement(inventory, created.id, 0.299, "EXIT");
  assert.equal(inventory.list(owner).items[0].quantity, 0.001);
  for (const quantity of [0, -1, 0.0001, 1.1234, Infinity, NaN, "1", null, Number.MAX_VALUE]) {
    assert.throws(() => movement(inventory, created.id, quantity), status(400));
  }
  assert.throws(() => movement(inventory, created.id, 0.002, "EXIT"), status(409));
  for (const metadata of [{ unit:"KG" }, { tracked:false }, { quantity:4 }]) assert.throws(() => inventory.patch(owner, created.id, metadata), status(400));
  assert.throws(() => inventory.movement(owner, body({ itemId:created.id, type:"EXIT", quantity:0.001, reason:" " })), status(400));
  assert.throws(() => item(inventory, { costPrice:-0.001 }), status(400));
  const stored = JSON.parse(fs.readFileSync(path.join(dir,"inventory.json"), "utf8"));
  assert.equal(stored.items[0].quantityMilli, 1);
  assert.equal(stored.items[0].minimumMilli, 1);
  assert.equal(stored.items[0].costCents, 1008);
  assert.equal(stored.movements.length, 3);
  for (const unit of ["UN","KIT","L","ML","KG","G","M"]) assert.equal(item(inventory,{ unit }).unit,unit);
  assert.throws(() => item(inventory,{ unit:"INVALID" }),status(400));
});

test("initial quantity creates one atomic entry and survives retries and restart", t => {
  let failWrite = true;
  const io = { ...fs, renameSync(...args) { if (failWrite) throw new Error("Injected failure"); return fs.renameSync(...args); } };
  const { inventory, dir } = setup(t, io);
  const request = body({ name:"Reparos", unit:"KIT", tracked:true, initialQuantity:10 });
  assert.throws(() => inventory.create(owner, request), /Injected failure/);
  assert.deepEqual(inventory.list(owner), { items:[], movements:[] });
  failWrite = false;
  const created = inventory.create(owner, request);
  assert.equal(created.item.quantity, 10);
  assert.deepEqual(inventory.create(owner, request), created);
  let saved = inventory.list(owner);
  assert.equal(saved.items.length, 1);
  assert.equal(saved.movements.length, 1);
  assert.equal(saved.movements[0].type, "ENTRY");
  assert.equal(saved.movements[0].quantity, 10);
  assert.equal(saved.movements[0].reason, "Estoque inicial");
  inventory.consume(owner, order, body({ source:"STOCK", itemId:created.item.id, quantity:1 }));
  const reloaded = createInventory(dir);
  assert.deepEqual(reloaded.create(owner, request), created);
  saved = reloaded.list(owner);
  assert.equal(saved.items[0].quantity, 9);
  assert.equal(saved.movements.length, 2);
  assert.throws(() => reloaded.create(owner, { ...request, initialQuantity:20 }), status(409));
  for (const initialQuantity of [-1, 0.0001, "10"]) assert.throws(() => item(reloaded, { initialQuantity }), status(400));
  assert.throws(() => item(reloaded, { tracked:false, initialQuantity:10 }), status(400));
  const catalog = item(reloaded, { tracked:false, initialQuantity:0 });
  assert.equal(catalog.quantity, 0);
  assert.equal(reloaded.list(owner).movements.length, 2);
});

test("stock consumption vs purchase/untracked, full reversal retains history", t => {
  const { inventory } = setup(t);
  const stock = item(inventory);
  const untracked = item(inventory, { name:"Peca", unit:"UN", tracked:false });
  movement(inventory, stock.id, 2);
  const consumed = inventory.consume(mechanic, order, body({ source:"STOCK", itemId:stock.id, quantity:0.125 }));
  const purchase = inventory.consume(manager, order, body({ source:"ORDER_PURCHASE", name:"Filtro comprado", quantity:1 }));
  assert.equal(purchase.material.unit,"UN");
  const other = inventory.consume(owner, order, body({ source:"UNTRACKED", itemId:untracked.id, quantity:2 }));
  inventory.consume(mechanic, order, body({ source:"UNTRACKED", name:"Peca livre", unit:"KIT", quantity:1 }));
  assert.equal(inventory.list(owner).items[0].quantity, 1.875);
  assert.equal(inventory.list(owner).movements.length, 2);
  for (const invalid of [{ source:"STOCK", itemId:untracked.id }, { source:"UNTRACKED", itemId:stock.id }, { source:"ORDER_PURCHASE", itemId:stock.id }, { source:"STOCK" }]) {
    assert.throws(() => inventory.consume(owner, order, body({ quantity:1, ...invalid })), error => [400,404].includes(error.status));
  }
  inventory.patch(owner, stock.id, { active:false });
  assert.throws(() => inventory.consume(owner, order, body({ source:"STOCK", itemId:stock.id, quantity:1 })), status(400));
  const reversed = inventory.reverse(manager, order, consumed.material.id, body({ reason:"Devolucao integral" }));
  assert.equal(reversed.material.status, "REVERSED");
  assert.equal(reversed.material.quantity, 0.125);
  assert.ok(reversed.material.reversedAt);
  inventory.reverse(owner, order, purchase.material.id, body({ reason:"Compra devolvida" }));
  inventory.reverse(owner, order, other.material.id, body({ reason:"Nao usado" }));
  assert.equal(inventory.list(owner).items[0].quantity, 2);
  assert.deepEqual(inventory.list(owner).movements.map(m => m.type), ["ENTRY", "CONSUMPTION", "REVERSAL"]);
  assert.equal(inventory.materials(owner,1).length, 4);
  assert.throws(() => inventory.reverse(owner, order, consumed.material.id, body({ reason:"Outra" })), status(409));
});

test("persisted idempotency, payload conflicts, route/user/tenant scoping and restart", t => {
  const { inventory, dir } = setup(t);
  const createBody = body({ name:"Oleo", unit:"L", tracked:true });
  const first = inventory.create(owner, createBody);
  assert.deepEqual(inventory.create(owner, { tracked:true, unit:"L", name:"Oleo", operationId:createBody.operationId }), first);
  assert.throws(() => inventory.create(owner, { ...createBody, name:"Outro" }), status(409));
  assert.throws(() => inventory.create(owner, { name:"Oleo", unit:"L", tracked:true }), status(400));
  const entry = body({ itemId:first.item.id, type:"ENTRY", quantity:1, reason:"Compra" });
  const entered = inventory.movement(owner, entry);
  assert.deepEqual(inventory.movement(owner, entry), entered);
  const consumeBody = body({ source:"STOCK", itemId:first.item.id, quantity:0.75 });
  const consumed = inventory.consume(mechanic, order, consumeBody);
  assert.deepEqual(inventory.consume(mechanic, order, consumeBody), consumed);
  assert.throws(() => inventory.consume(mechanic, order, { ...consumeBody, quantity:0.5 }), status(409));
  const reverseBody = body({ reason:"Estorno" });
  const reversed = inventory.reverse(owner, order, consumed.material.id, reverseBody);
  assert.deepEqual(inventory.reverse(owner, order, consumed.material.id, reverseBody), reversed);
  assert.throws(() => inventory.reverse(owner, order, consumed.material.id, { ...reverseBody, reason:"Diferente" }), status(409));
  const restarted = createInventory(dir);
  assert.deepEqual(restarted.create(owner, createBody), first);
  assert.deepEqual(restarted.movement(owner, entry), entered);
  assert.deepEqual(restarted.consume(mechanic, order, consumeBody), consumed);
  assert.deepEqual(restarted.reverse(owner, order, consumed.material.id, reverseBody), reversed);
  assert.equal(restarted.list(owner).items[0].quantity, 1);
  assert.equal(restarted.list(owner).movements.length, 3);
  assert.equal(restarted.list(owner).items.length, 1);
  restarted.create(manager, createBody);
  restarted.create(foreign, createBody);
  assert.equal(restarted.list(owner).items.length, 2);
  assert.equal(restarted.list(foreign).items.length, 1);
  const downgraded = { ...owner, role:"MANAGER" };
  assert.equal(Object.hasOwn(restarted.movement(downgraded, entry).item, "costPrice"), false);
});

test("tenants, owner-only costs and role permissions", t => {
  const { inventory } = setup(t);
  const stock = item(inventory, { costPrice:1.005 });
  movement(inventory, stock.id, 1);
  assert.equal(inventory.list(owner).items[0].costPrice, 1.01);
  for (const user of [manager, mechanic]) {
    assert.equal(Object.hasOwn(inventory.list(user).items[0], "costPrice"), false);
    assert.throws(() => inventory.create(user, body({ name:"X", unit:"UN", tracked:false, costPrice:0 })), status(403));
    assert.throws(() => inventory.patch(user, stock.id, { costPrice:0 }), status(403));
  }
  assert.equal(Object.hasOwn(movement(inventory, stock.id, 0.1, "ENTRY", manager).item, "costPrice"), false);
  const createdByManager = inventory.create(manager, body({ name:"Sem custo", unit:"UN", tracked:false }));
  assert.equal(Object.hasOwn(createdByManager.item, "costPrice"), false);
  assert.deepEqual(inventory.list(mechanic).movements, []);
  assert.throws(() => inventory.list(attendant), status(403));
  for (const user of [mechanic, attendant]) {
    assert.throws(() => movement(inventory, stock.id, 1, "ENTRY", user), status(403));
    assert.throws(() => inventory.reverse(user, order, "missing", body({ reason:"X" })), status(403));
  }
  assert.throws(() => inventory.consume(attendant, order, body({ source:"STOCK", itemId:stock.id, quantity:1 })), status(403));
  assert.throws(() => inventory.consume(mechanic, { ...order, assignedUserId:"other" }, body({ source:"STOCK", itemId:stock.id, quantity:1 })), status(403));
  assert.deepEqual(inventory.list(foreign), { items:[], movements:[] });
  assert.deepEqual(inventory.materials(foreign,1), []);
  assert.throws(() => movement(inventory, stock.id, 1, "ENTRY", foreign), status(404));
  assert.throws(() => inventory.patch(foreign, stock.id, { name:"X" }), status(404));
  assert.throws(() => inventory.consume(foreign, { ...order, workshopId:"b" }, body({ source:"STOCK", itemId:stock.id, quantity:1 })), status(404));
  const consumed = inventory.consume(owner, order, body({ source:"STOCK", itemId:stock.id, quantity:0.1 }));
  assert.throws(() => inventory.reverse(foreign, { ...order, workshopId:"b" }, consumed.material.id, body({ reason:"X" })), status(404));
  assert.throws(() => inventory.reverse(owner, { ...order, id:2 }, consumed.material.id, body({ reason:"X" })), status(404));
});

test("closed orders cannot consume/reverse; completion alone does not affect stock", t => {
  const { inventory } = setup(t);
  const stock = item(inventory);
  movement(inventory,stock.id,1);
  const consumed = inventory.consume(owner, { ...order, status:2 }, body({ source:"STOCK", itemId:stock.id, quantity:0.1 }));
  const closed = { ...order, closedAt:new Date().toISOString() };
  for (const source of ["STOCK", "ORDER_PURCHASE", "UNTRACKED"]) assert.throws(() => inventory.consume(owner, closed, body({ source, itemId:stock.id, quantity:1 })), status(409));
  assert.throws(() => inventory.reverse(owner, closed, consumed.material.id, body({ reason:"X" })), status(409));
  assert.equal(inventory.list(owner).items[0].quantity, 0.9);
});

test("write/fsync/rename failures never publish candidate or record operation; retry succeeds", t => {
  for (const method of ["writeFileSync", "fsyncSync", "renameSync"]) {
    let failing = false;
    const io = { ...fs, [method](...args) { if (failing) throw new Error(`Injected ${method} failure`); return fs[method](...args); } };
    const { inventory, dir } = setup(t,io);
    const stock = item(inventory);
    movement(inventory,stock.id,1);
    const before = fs.readFileSync(path.join(dir,"inventory.json"),"utf8");
    const consumeBody = body({ source:"STOCK", itemId:stock.id, quantity:0.5 });
    failing = true;
    assert.throws(() => item(inventory), /Injected/);
    assert.throws(() => inventory.patch(owner,stock.id,{ name:"Alterado" }), /Injected/);
    assert.throws(() => movement(inventory,stock.id,1), /Injected/);
    assert.throws(() => inventory.consume(owner,order,consumeBody), /Injected/);
    assert.equal(fs.readFileSync(path.join(dir,"inventory.json"),"utf8"), before);
    assert.equal(inventory.list(owner).items[0].quantity,1);
    assert.deepEqual(inventory.materials(owner,1),[]);
    assert.deepEqual(fs.readdirSync(dir),["inventory.json"]);
    failing = false;
    const consumed = inventory.consume(owner,order,consumeBody);
    const after = fs.readFileSync(path.join(dir,"inventory.json"),"utf8");
    const reverseBody = body({ reason:"X" });
    failing = true;
    assert.throws(() => inventory.reverse(owner,order,consumed.material.id,reverseBody), /Injected/);
    assert.equal(fs.readFileSync(path.join(dir,"inventory.json"),"utf8"), after);
    assert.equal(inventory.materials(owner,1)[0].status,"CONSUMED");
    assert.equal(inventory.list(owner).items[0].quantity,0.5);
    failing = false;
    inventory.reverse(owner,order,consumed.material.id,reverseBody);
    assert.equal(createInventory(dir).list(owner).items[0].quantity,1);
  }
});

test("invalid saved JSON/schema/ledger fails closed and never rewrites the file", t => {
  const { inventory, dir } = setup(t);
  const stock = item(inventory);
  const untracked = item(inventory,{ tracked:false });
  movement(inventory,stock.id,2);
  const consumed = inventory.consume(owner,order,body({ source:"STOCK",itemId:stock.id,quantity:0.5 }));
  inventory.reverse(owner,order,consumed.material.id,body({ reason:"Return" }));
  inventory.consume(owner,order,body({ source:"UNTRACKED",itemId:untracked.id,quantity:1 }));
  const file = path.join(dir,"inventory.json");
  const original = fs.readFileSync(file,"utf8");
  const changes = [
    s => { s.items[0].quantityMilli = -1; },
    s => { s.items[0].quantityMilli = 1.5; },
    s => { s.items[0].quantityMilli = Number.MAX_SAFE_INTEGER + 1; },
    s => { s.items[0].quantityMilli++; },
    s => { s.items[0].costCents = -1; },
    s => { s.items[0].unit = "INVALID"; },
    s => { s.items[0].tracked = "true"; },
    s => { s.items[0].active = 1; },
    s => { s.items.push(s.items[0]); },
    s => { s.items[0] = null; },
    s => { delete s.items[0].name; },
    s => { s.items[0].extra = "unexpected"; },
    s => { s.movements[0].itemId = "missing"; },
    s => { s.movements[0].workshopId = "b"; },
    s => { s.movements[0].balanceMilli++; },
    s => { s.movements[0].type = "OTHER"; },
    s => { s.movements[0].createdAt = "not a date"; },
    s => { s.movements.push(s.movements[0]); },
    s => { s.materials[0].workshopId = "b"; },
    s => { s.materials[0].quantityMilli++; },
    s => { s.materials[0].source = "UNTRACKED"; },
    s => { s.materials[0].itemId = null; },
    s => { s.materials[0].status = "OTHER"; },
    s => { delete s.materials[0].reason; },
    s => { s.materials[0].reversedAt = "2000-01-01T00:00:00.000Z"; },
    s => { s.materials[1].reversedAt = new Date().toISOString(); },
    s => { s.materials.push(s.materials[0]); },
    s => { s.operations.push(s.operations[0]); },
    s => { s.operations[0].key = "not json"; },
    s => { s.operations[0].payload = "null"; },
    s => { s.operations[0].result.item.unit = "INVALID"; },
    s => { s.operations[0].result.item.costCents = 123; },
    s => { s.operations[0].result.item.costPrice = -1; },
    s => { s.operations[0].result.item.quantity = 1; },
    s => { s.operations[2].result.movement.balanceAfter++; },
    s => { s.operations[3].result.material.quantity++; },
    s => { s.operations[3].result.materials[0].costPrice = 10; }
  ];
  const invalid = ["{", "null", "[]", "{}", '{"items":[],"movements":[],"materials":[],"operations":null}', ...changes.map(change => {
    const snapshot = JSON.parse(original); change(snapshot); return JSON.stringify(snapshot);
  })];
  for (const content of invalid) {
    fs.writeFileSync(file,content);
    assert.throws(() => createInventory(dir), /Invalid inventory file|JSON|Unexpected/);
    assert.equal(fs.readFileSync(file,"utf8"),content);
    assert.deepEqual(fs.readdirSync(dir),["inventory.json"]);
  }
  fs.writeFileSync(file,original);
  assert.equal(createInventory(dir).list(owner).items[0].quantity,2);
  // Old CONSUMED operation snapshots remain valid after the material is reversed.
  assert.equal(createInventory(dir).materials(owner,order.id)[0].status,"REVERSED");
});

test("racing scheduled consumers serialize; replay keeps original status and current authorization", async t => {
  const { inventory, dir } = setup(t);
  const stock = item(inventory);
  movement(inventory,stock.id,1);
  const requests = [body({ source:"STOCK",itemId:stock.id,quantity:0.75 }),body({ source:"STOCK",itemId:stock.id,quantity:0.75 })];
  const outcomes = await Promise.allSettled(requests.map(payload => Promise.resolve().then(() => inventory.consume(mechanic,order,payload))));
  assert.equal(outcomes.filter(o => o.status === "fulfilled").length,1);
  assert.equal(outcomes.find(o => o.status === "rejected").reason.status,409);
  const success = outcomes.findIndex(o => o.status === "fulfilled");
  const consumed = outcomes[success].value;
  assert.equal(inventory.list(owner).items[0].quantity,0.25);
  assert.equal(inventory.list(owner).movements.length,2);
  const reverseBody = body({ reason:"Return" });
  const reversed = inventory.reverse(owner,order,consumed.material.id,reverseBody);
  const closed = { ...order, closedAt:new Date().toISOString() };
  const restarted = createInventory(dir);
  const before = fs.readFileSync(path.join(dir,"inventory.json"),"utf8");
  assert.deepEqual(restarted.consume(mechanic,closed,requests[success]),consumed);
  assert.equal(restarted.consume(mechanic,closed,requests[success]).material.status,"CONSUMED");
  assert.deepEqual(restarted.reverse(owner,closed,consumed.material.id,reverseBody),reversed);
  assert.equal(restarted.materials(owner,order.id)[0].status,"REVERSED");
  assert.throws(() => restarted.consume(mechanic,{ ...order, assignedUserId:"other" },requests[success]),status(403));
  assert.throws(() => restarted.consume({ ...mechanic, active:false },order,requests[success]),status(403));
  assert.throws(() => restarted.reverse({ ...owner, role:"MECHANIC" },order,consumed.material.id,reverseBody),status(403));
  assert.equal(fs.readFileSync(path.join(dir,"inventory.json"),"utf8"),before);
});

test("large quantities use exact decimal parsing and reject overflow or unrepresentable balances", t => {
  const { inventory, dir } = setup(t);
  const stock = item(inventory);
  const large = 9007199254740.99;
  movement(inventory,stock.id,large);
  const before = fs.readFileSync(path.join(dir,"inventory.json"),"utf8");
  assert.equal(JSON.parse(before).items[0].quantityMilli,9007199254740990);
  assert.throws(() => movement(inventory,stock.id,0.001),status(400));
  assert.throws(() => movement(inventory,stock.id,0.002),status(400));
  assert.throws(() => item(inventory,{ minimumQuantity:9007199254741 }),status(400));
  assert.throws(() => inventory.patch(owner,stock.id,{ costPrice:Number.MAX_VALUE }),status(400));
  assert.equal(fs.readFileSync(path.join(dir,"inventory.json"),"utf8"),before);
  assert.equal(createInventory(dir).list(owner).items[0].quantity,large);
  movement(inventory,stock.id,large,"EXIT");
  assert.equal(inventory.list(owner).items[0].quantity,0);
});

test("a successful rename publishes without fallible post-commit cleanup", t => {
  let committed = false;
  const io = {
    ...fs,
    renameSync(...args) { fs.renameSync(...args); committed = true; },
    existsSync(...args) { if (committed) throw new Error("Post-commit existsSync forbidden"); return fs.existsSync(...args); },
    unlinkSync() { throw new Error("Post-commit unlinkSync forbidden"); }
  };
  const { inventory, dir } = setup(t,io);
  const stock = item(inventory);
  assert.equal(inventory.list(owner).items[0].id,stock.id);
  movement(inventory,stock.id,1);
  assert.equal(inventory.list(owner).items[0].quantity,1);
  assert.equal(createInventory(dir).list(owner).items[0].quantity,1);
});

test("reservations hold available stock, release without movement and commit once", t => {
  const { inventory } = setup(t);
  const stock = item(inventory, { initialQuantity:10 });
  const reservationBody = body({ itemId:stock.id, quantity:2 });
  const reserved = inventory.reserve(mechanic, order, reservationBody);
  assert.equal(reserved.reservation.status, "ACTIVE");
  assert.deepEqual(inventory.list(owner).items[0], { ...inventory.list(owner).items[0], quantity:10, onHand:10, reserved:2, available:8 });
  assert.equal(inventory.list(owner).movements.length, 1);
  assert.throws(() => inventory.reserve(mechanic, order, body({ itemId:stock.id, quantity:9 })), status(409));
  const released = inventory.release(mechanic, order, reserved.reservation.id, body({ reason:"Nao utilizado" }));
  assert.equal(released.reservation.status, "RELEASED");
  assert.equal(inventory.list(owner).items[0].available,10);
  const second = inventory.reserve(mechanic, order, body({ itemId:stock.id, quantity:2 }));
  const committed = inventory.commit(mechanic, order);
  assert.equal(committed.reservations.find(r => r.id === second.reservation.id).status, "COMMITTED");
  assert.equal(inventory.list(owner).items[0].onHand,8);
  assert.equal(inventory.list(owner).movements.filter(m => m.type === "CONSUMPTION").length,1);
  assert.deepEqual(inventory.commit(mechanic, order), committed);
  assert.equal(inventory.list(owner).movements.filter(m => m.type === "CONSUMPTION").length,1);
});

test("cancellation releases active reservations without changing stock", t => {
  const { inventory } = setup(t);
  const stock = item(inventory, { initialQuantity:10 });
  const cancelledOrder = { ...order, id:2 };
  const reserved = inventory.reserve(owner, cancelledOrder, body({ itemId:stock.id, quantity:3 }));
  const result = inventory.releaseOrder(owner, cancelledOrder);
  assert.equal(result.reservations.find(r => r.id === reserved.reservation.id).status, "CANCELLED");
  assert.equal(inventory.list(owner).items[0].onHand,10);
  assert.equal(inventory.list(owner).items[0].available,10);
});

test("thirteen units become twelve after one use and never double-debit", t => {
  const { inventory, dir } = setup(t);
  const stock = item(inventory, { name:"Kit X", unit:"UN", initialQuantity:13 });
  const trackedOrder = { ...order, id:13 };
  const reservation = inventory.reserve(mechanic, trackedOrder, body({ itemId:stock.id, quantity:1 }));
  assert.equal(inventory.list(owner).items[0].onHand,13);
  assert.equal(inventory.list(owner).items[0].available,12);
  const committed = inventory.commit(mechanic, trackedOrder);
  assert.equal(committed.reservations.find(item => item.id === reservation.reservation.id).status,"COMMITTED");
  assert.equal(inventory.list(owner).items[0].onHand,12);
  assert.equal(inventory.list(owner).movements.filter(item => item.type === "CONSUMPTION").length,1);
  assert.deepEqual(inventory.commit(mechanic, trackedOrder), committed);
  const reloaded = createInventory(dir);
  assert.equal(reloaded.list(owner).items[0].quantity,12);
  assert.equal(reloaded.list(owner).movements.filter(item => item.type === "CONSUMPTION").length,1);
});

test("VM server integration: no real env/server, administrative OS assignment and material visibility", async t => {
  const { dir } = setup(t);
  const serverFile = path.join(__dirname,"..","server.js");
  const serverRequire = createRequire(serverFile);
  const fixtureUsers = [owner,manager,mechanic,attendant,foreign, { ...mechanic, id:"inactive", active:false, status:"INACTIVE" }];
  fs.writeFileSync(path.join(dir,"users.json"),JSON.stringify(fixtureUsers));
  let app, context;
  async function loadServer() {
    app = serverRequire("express")();
    let listenCalls = 0;
    app.listen = () => { listenCalls++; };
    const express = Object.assign(() => app,serverRequire("express"));
    context = vm.createContext({
    __dirname:path.dirname(serverFile), Buffer, AbortSignal, console,
    process:{ env:{ GIRO_DATA_DIR:dir, SMTP_HOST:"", SMTP_USER:"", SMTP_PASS:"", SMTP_FROM:"" } },
    require(name) {
      if (name === "dotenv") return { config() {} };
      if (name === "express") return express;
      if (name === "nodemailer") return { createTransport() { throw new Error("SMTP must not be used"); } };
      return serverRequire(name);
    }
    });
    await vm.runInContext(fs.readFileSync(serverFile,"utf8"),context,{ filename:serverFile });
    assert.equal(listenCalls,1,"only the stub was invoked");
    for (const user of fixtureUsers) vm.runInContext(`sessions.set(${JSON.stringify(user.id)}, { userId:${JSON.stringify(user.id)}, expiresAt:Date.now()+60000 });`,context);
  }
  await loadServer();
  async function request(user, method, route, params = {}, payload = {}) {
    const layer = app._router.stack.find(l => l.route?.path === route && l.route.methods[method]);
    assert.ok(layer,route);
    const req = { params, body:payload, headers:{ cookie:`giro_session=${user.id}` } };
    const res = { statusCode:200, status(code) { this.statusCode=code; return this; }, json(value) { this.body=JSON.parse(JSON.stringify(value)); return this; } };
    let index = 0;
    async function next(error) { if (error) throw error; const handler = layer.route.stack[index++]; if (handler) await handler.handle(req,res,next); }
    await next();
    return res;
  }
  for (const user of [owner,manager,attendant,mechanic]) {
    const result = await request(user,"post","/api/orders/quick",{}, { clientName:`Cliente ${user.id}` });
    assert.equal(result.statusCode,201);
    assert.equal(result.body.order.assignedUserId,user === mechanic ? mechanic.id : null);
  }
  assert.equal((await request(attendant,"post","/api/orders/quick",{}, { assignedUserId:mechanic.id })).statusCode,403);
  for (const assignedUserId of [owner.id,foreign.id,"inactive","missing",null,"",{}]) {
    const result = await request(mechanic,"post","/api/orders/quick",{}, { assignedUserId });
    assert.equal(result.statusCode,201);
    assert.equal(result.body.order.assignedUserId,mechanic.id);
  }
  for (const assignedUserId of [foreign.id,"inactive",owner.id,"missing"]) assert.equal((await request(owner,"post","/api/orders/quick",{}, { assignedUserId })).statusCode,400);
  await t.test("quick-create persisted dedup returns current OS/references, scopes actors and hashes raw fields", async () => {
    const orderFile = path.join(dir,"service-orders.json");
    const recordFile = path.join(dir,"workshop-records.json");
    const auditFile = path.join(dir,"activity-logs.json");
    const payload = body({ clientName:"Raw Client",phone:"11999990000",vehicleBrand:"Brand",vehicleModel:"Model",plate:"raw1d23",issue:"Original",year:"2020",estimatedValue:123 });
    const first = await request(owner,"post","/api/orders/quick",{},payload);
    assert.equal(first.statusCode,201);
    assert.ok(first.body.client);
    assert.ok(first.body.vehicle);
    assert.equal(Object.hasOwn(first.body.order,"creationOperation"),false);
    const stored = JSON.parse(fs.readFileSync(orderFile,"utf8")).find(o => o.id === first.body.order.id);
    assert.deepEqual(Object.keys(stored.creationOperation).sort(),["actorId","id","payloadHash"]);
    assert.equal(stored.creationOperation.id,payload.operationId);
    assert.equal(stored.creationOperation.actorId,owner.id);
    assert.match(stored.creationOperation.payloadHash,/^[a-f0-9]{64}$/);
    const before = [orderFile,recordFile,auditFile].map(file => fs.readFileSync(file,"utf8"));
    const reordered = Object.fromEntries(Object.entries(payload).reverse());
    const repeated = await request(owner,"post","/api/orders/quick",{},reordered);
    assert.equal(repeated.statusCode,201);
    assert.deepEqual(repeated.body.order,first.body.order);
    assert.deepEqual(repeated.body.client,first.body.client);
    assert.deepEqual(repeated.body.vehicle,first.body.vehicle);
    for (const changes of [{ issue:"Changed" },{ plate:"RAW1D23" },{ year:2020 },{ estimatedValue:456 },{ unused:"Raw extra" }]) {
      assert.equal((await request(owner,"post","/api/orders/quick",{}, { ...payload,...changes })).statusCode,409);
    }
    for (const operationId of [null,42,""," ","x".repeat(201)]) assert.equal((await request(owner,"post","/api/orders/quick",{}, { ...payload,operationId })).statusCode,400);
    assert.deepEqual([orderFile,recordFile,auditFile].map(file => fs.readFileSync(file,"utf8")),before);
    assert.equal(fs.existsSync(path.join(dir,"inventory.json")),false);
    assert.equal((await request(owner,"patch","/api/orders/:id",{ id:stored.id },{ status:1,issue:"Current issue" })).statusCode,200);
    await loadServer();
    const afterReload = [orderFile,recordFile,auditFile].map(file => fs.readFileSync(file,"utf8"));
    const replay = await request(owner,"post","/api/orders/quick",{},payload);
    assert.equal(replay.statusCode,201);
    assert.equal(replay.body.order.id,stored.id);
    assert.equal(replay.body.order.status,1);
    assert.equal(replay.body.order.issue,"Current issue");
    assert.deepEqual(replay.body.client,first.body.client);
    assert.deepEqual(replay.body.vehicle,first.body.vehicle);
    assert.equal(Object.hasOwn(replay.body.order,"creationOperation"),false);
    assert.equal((await request(owner,"post","/api/orders/quick",{}, { ...payload,phone:"21999990000" })).statusCode,409);
    assert.deepEqual([orderFile,recordFile,auditFile].map(file => fs.readFileSync(file,"utf8")),afterReload);
    for (const user of [manager,foreign]) {
      const scoped = await request(user,"post","/api/orders/quick",{},payload);
      assert.equal(scoped.statusCode,201);
      assert.notEqual(scoped.body.order.id,stored.id);
      assert.equal(scoped.body.order.workshopId,user.workshopId);
      assert.equal(scoped.body.order.createdBy,user.id);
    }
    const mechanicBody = body({ assignedUserId:foreign.id,issue:"Ignored raw assignment" });
    const mechanicCreated = await request(mechanic,"post","/api/orders/quick",{},mechanicBody);
    assert.equal(mechanicCreated.statusCode,201);
    assert.equal(mechanicCreated.body.order.assignedUserId,mechanic.id);
    assert.equal((await request(mechanic,"post","/api/orders/quick",{}, { ...mechanicBody,assignedUserId:owner.id })).statusCode,409);
    assert.equal((await request(owner,"patch","/api/orders/:id",{ id:mechanicCreated.body.order.id },{ assignedUserId:null })).statusCode,200);
    assert.equal((await request(mechanic,"post","/api/orders/quick",{},mechanicBody)).statusCode,404);
  });
  const assigned = await request(manager,"post","/api/orders/quick",{}, { assignedUserId:mechanic.id });
  assert.equal(assigned.statusCode,201);
  const id = assigned.body.order.id;
  await t.test("assigned mechanic cannot rewrite text or mix status and text; admin edits remain allowed", async () => {
    const file = path.join(dir,"service-orders.json");
    const before = fs.readFileSync(file,"utf8");
    for (const field of ["clientName","phone","vehicleBrand","vehicleModel","plate","issue"]) {
      assert.equal((await request(mechanic,"patch","/api/orders/:id",{ id },{ [field]:"Rewrite" })).statusCode,403);
      assert.equal((await request(mechanic,"patch","/api/orders/:id",{ id },{ status:2,[field]:"Rewrite" })).statusCode,403);
    }
    assert.equal(fs.readFileSync(file,"utf8"),before);
    assert.equal((await request(mechanic,"patch","/api/orders/:id",{ id },{ status:1 })).statusCode,200);
    assert.equal((await request(manager,"patch","/api/orders/:id",{ id },{ clientName:"Manager edit",plate:"MGR1D23" })).statusCode,200);
    assert.equal((await request(owner,"patch","/api/orders/:id",{ id },{ clientName:"Owner edit",plate:"OWN1D23" })).statusCode,200);
    const own = await request(mechanic,"post","/api/orders/quick",{}, { plate:"OLD1D23",issue:"Original" });
    const ownId = own.body.order.id;
    assert.equal((await request(mechanic,"patch","/api/orders/:id",{ id:ownId },{ clientName:"Completion",plate:"NEW1D23" })).statusCode,403);
    assert.equal((await request(mechanic,"patch","/api/orders/:id",{ id:ownId },{ clientName:"Completion",issue:"Refined" })).statusCode,200);
    assert.equal((await request(mechanic,"patch","/api/orders/:id",{ id:ownId },{ clientName:"Rewrite",phone:"11999990000" })).statusCode,403);
    assert.equal((await request(mechanic,"patch","/api/orders/:id",{ id:ownId },{ issue:"Issue-only rewrite" })).statusCode,403);
  });
  const created = await request(owner,"post","/api/inventory/items",{},body({ name:"Oleo",unit:"L",tracked:true,costPrice:100 }));
  assert.equal(created.statusCode,201);
  const itemId = created.body.item.id;
  await request(owner,"post","/api/inventory/movements",{},body({ itemId,type:"ENTRY",quantity:1,reason:"Compra" }));
  const consumed = await request(mechanic,"post","/api/orders/:id/materials",{ id },body({ source:"STOCK",itemId,quantity:0.5 }));
  assert.equal(consumed.statusCode,201);
  assert.equal((await request(mechanic,"get","/api/orders/:id/materials",{ id:1 })).statusCode,404);
  assert.equal((await request(foreign,"get","/api/orders/:id/materials",{ id })).statusCode,404);
  const visible = await request(attendant,"get","/api/orders/:id/materials",{ id });
  assert.equal(visible.statusCode,200);
  assert.equal(visible.body.materials.length,1);
  assert.deepEqual((await request(owner,"get","/api/orders/:id",{ id })).body.order.materials,visible.body.materials);
  assert.equal(JSON.stringify(visible.body).includes("cost"),false);
  assert.equal((await request(attendant,"post","/api/orders/:id/materials",{ id },body({ source:"STOCK",itemId,quantity:0.1 }))).statusCode,403);
  assert.equal((await request(attendant,"get","/api/inventory")).statusCode,403);
  const mechanicCatalog = await request(mechanic,"get","/api/inventory");
  assert.deepEqual(mechanicCatalog.body.movements,[]);
  assert.equal(Object.hasOwn(mechanicCatalog.body.items[0],"costPrice"),false);
  assert.equal((await request(mechanic,"post","/api/orders/:id/materials/:materialId/reverse",{ id,materialId:consumed.body.material.id },body({ reason:"X" }))).statusCode,403);
  const before = fs.readFileSync(path.join(dir,"inventory.json"),"utf8");
  assert.equal((await request(manager,"patch","/api/orders/:id",{ id },{ status:2 })).statusCode,200);
  assert.equal((await request(owner,"post","/api/orders/:id/deliver",{ id })).statusCode,200);
  assert.equal(fs.readFileSync(path.join(dir,"inventory.json"),"utf8"),before);
  assert.equal((await request(owner,"post","/api/orders/:id/materials",{ id },body({ source:"STOCK",itemId,quantity:0.1 }))).statusCode,409);
  assert.equal((await request(owner,"post","/api/orders/:id/materials/:materialId/reverse",{ id,materialId:consumed.body.material.id },body({ reason:"X" }))).statusCode,409);
  assert.equal((await request(owner,"patch","/api/orders/:id",{ id },{ reopen:true })).statusCode,200);
  assert.equal(fs.readFileSync(path.join(dir,"inventory.json"),"utf8"),before);
});
