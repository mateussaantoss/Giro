"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

test("API n8n/Evolution JSON isolada normaliza e é idempotente", async t => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "giro-n8n-test-"));
  const port = 44000 + Math.floor(Math.random() * 500);
  const base = `http://127.0.0.1:${port}`;
  const token = "test-n8n-token";
  const workshopId = "workshop-n8n-test";
  const templateId = "10000000-0000-4000-8000-000000000001";
  const passwordHash = `test-salt:${crypto.scryptSync("Test-password-123", "test-salt", 64).toString("hex")}`;
  const fixtures = [
    { id:"mechanic", name:"Mecânico Ativo", role:"mechanic", status:"active" },
    { id:"inactive", name:"Inativo", role:"MECHANIC", status:"INACTIVE" },
    { id:"disabled", name:"Desativado", role:"MECHANIC", status:"ACTIVE", active:false },
    { id:"pending", name:"Pendente", role:"MECHANIC", status:"PENDING" },
    { id:"foreign", name:"Outra oficina", role:"MECHANIC", status:"ACTIVE", workshopId:"other" },
    { id:"owner", name:"Proprietário", role:"OWNER", status:"ACTIVE" }
  ].map(user => ({ workshopId, active:true, passwordHash, email:`${user.id}@example.invalid`, phone:"private", ...user }));
  fs.writeFileSync(path.join(dataDir, "users.json"), JSON.stringify(fixtures));
  fs.writeFileSync(path.join(dataDir, "service-templates.json"), JSON.stringify([
    { id:templateId, workshopId, name:"Revisão d'óleo 100%_", defaultPrice:123.456, active:true },
    { id:"inactive-service", workshopId, name:"Inativo", defaultPrice:10, active:false },
    { id:"foreign-service", workshopId:"other", name:"Outra oficina", defaultPrice:20, active:true }
  ]));
  fs.writeFileSync(path.join(dataDir, "service-orders.json"), JSON.stringify([
    { id:90, workshopId, statusVersion:2, status:0, laborItems:[], history:[], n8nMessageId:"legacy-no-hash" }
  ]));
  const child = spawn(process.execPath, [path.resolve(__dirname, "..", "server.js")], {
    cwd:path.resolve(__dirname, ".."),
    env:{ ...process.env, PORT:String(port), GIRO_DATA_DIR:dataDir, N8N_API_TOKEN:token, N8N_WORKSHOP_ID:workshopId, SMTP_HOST:"", SMTP_FROM:"" },
    stdio:"ignore"
  });
  t.after(() => { child.kill(); fs.rmSync(dataDir, { recursive:true, force:true }); });
  for (let attempt = 0; attempt < 50; attempt++) {
    try { if ((await fetch(`${base}/api/health`)).ok) break; } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal((await fetch(`${base}/api/health`)).status, 200);
  const request = async (route, options = {}) => {
    const response = await fetch(`${base}${route}`, { ...options, headers:{ "content-type":"application/json", "X-N8N-Token":token, ...(options.headers || {}) }, body:options.body ? JSON.stringify(options.body) : undefined });
    return { response, data:await response.json() };
  };
  assert.equal((await fetch(`${base}/api/whatsapp/messages`, { method:"POST", headers:{ "content-type":"application/json", "X-N8N-Token":"wrong" }, body:"{}" })).status, 401);
  for (const route of ["/api/ai/mechanics", "/api/ai/services"]) {
    assert.equal((await fetch(`${base}${route}`)).status, 401);
    assert.equal((await fetch(`${base}${route}`, { headers:{ "X-N8N-Token":"wrong" } })).status, 401);
  }
  assert.deepEqual((await request("/api/ai/mechanics")).data, { mechanics:[{ id:"mechanic", name:"Mecânico Ativo" }] });
  const services = [{ id:templateId, name:"Revisão d'óleo 100%_", defaultPrice:123.456 }];
  assert.deepEqual((await request("/api/ai/services")).data, { services });
  assert.deepEqual((await request(`/api/ai/services?q=${encodeURIComponent("D'ÓLEO 100%_")}`)).data, { services });
  assert.deepEqual((await request("/api/ai/services?q=missing")).data, { services:[] });
  assert.equal((await request("/api/ai/services?q[x]=bad")).response.status, 400);
  let result = await request("/api/whatsapp/messages", { method:"POST", body:{ phone:"+55 (11) 99999-9999@s.whatsapp.net:1", name:" Cliente ", text:" Olá " } });
  assert.deepEqual(result.data, { message:{ phone:"5511999999999", name:"Cliente", text:"Olá" } });
  result = await request("/api/whatsapp/messages", { method:"POST", body:{ data:{ key:{ remoteJid:"5511999999999@s.whatsapp.net", fromMe:false }, pushName:"Evolution", message:{ extendedTextMessage:{ text:"Oi" } } } } });
  assert.equal(result.data.message.phone, "5511999999999");
  assert.equal((await request("/api/whatsapp/messages", { method:"POST", body:{ data:{ key:{ remoteJid:"5511999999999@s.whatsapp.net", fromMe:true }, message:{ conversation:"não processar" } } } })).data.reason, "from_me");
  assert.equal((await request("/api/whatsapp/messages", { method:"POST", body:{ data:{ key:{ remoteJid:"5511999999999@s.whatsapp.net" }, message:{ imageMessage:{} } } } })).data.reason, "unsupported_event");

  result = await request("/api/ai/customers", { method:"POST", body:{ name:"Cliente AI", phone:"5511999999999" } });
  assert.equal(result.response.status, 201); assert.equal(result.data.created, true);
  const customer = result.data.customer;
  result = await request("/api/ai/customers", { method:"POST", body:{ name:"Outro nome", phone:"5511999999999" } });
  assert.equal(result.response.status, 200); assert.equal(result.data.created, false); assert.equal(result.data.customer.id, customer.id);
  assert.equal((await request("/api/ai/customers?phone=5511999999999")).data.customer.id, customer.id);
  result = await request("/api/ai/vehicles", { method:"POST", body:{ plate:"ABC1D23", model:"Civic", year:2022, customerPhone:"5511999999999" } });
  assert.equal(result.response.status, 201); assert.equal(result.data.created, true);
  const vehicle = result.data.vehicle;
  result = await request("/api/ai/vehicles", { method:"POST", body:{ plate:"ABC1D23", model:"Civic", year:2022, customerPhone:"5511999999999" } });
  assert.equal(result.data.created, false); assert.equal(result.data.vehicle.id, vehicle.id);
  assert.equal((await request("/api/ai/vehicles?plate=ABC1D23")).data.vehicle.id, vehicle.id);
  result = await request("/api/ai/service-orders", { method:"POST", headers:{ "X-Message-Id":"evo-1" }, body:{ plate:"ABC1D23", description:" Revisar freios ", customerPhone:"5511999999999" } });
  assert.equal(result.response.status, 201); assert.equal(result.data.created, true); assert.equal(result.data.order.history[0].action, "created_by_ai");
  const orderId = result.data.order.id;
  result = await request("/api/ai/service-orders", { method:"POST", headers:{ "X-Message-Id":"evo-1" }, body:{ plate:"ABC1D23", description:"Repetida", customerPhone:"5511999999999" } });
  assert.equal(result.response.status, 200); assert.equal(result.data.created, false); assert.equal(result.data.order.id, orderId);
  assert.equal(result.data.order.estimatedValue, null);
  assert.equal(result.data.order.assignedUserId, null);
  assert.deepEqual(result.data.order.laborItems, []);
  const selected = { plate:"ABC1D23", description:"Ruído informado pelo cliente", customerPhone:"5511999999999", assignedUserId:"mechanic", serviceTemplateId:templateId, messageId:"selected-1", estimatedValue:0.01, price:0.01, defaultPrice:0.01, discount:99, laborItems:[{ description:"Inventado", value:0.01 }] };
  result = await request("/api/ai/service-orders", { method:"POST", body:{ ...selected, messageId:"legacy-no-hash" } });
  assert.equal(result.response.status, 200);
  assert.equal(result.data.order.id, 90);
  for (const assignedUserId of ["foreign", "inactive", "disabled", "pending", "owner", "missing"]) {
    assert.equal((await request("/api/ai/service-orders", { method:"POST", body:{ ...selected, assignedUserId } })).response.status, 400);
  }
  for (const serviceTemplateId of ["foreign-service", "inactive-service", "missing"]) {
    assert.equal((await request("/api/ai/service-orders", { method:"POST", body:{ ...selected, serviceTemplateId } })).response.status, 400);
  }
  for (const field of ["assignedUserId", "serviceTemplateId"]) {
    assert.equal((await request("/api/ai/service-orders", { method:"POST", body:{ ...selected, [field]:{} } })).response.status, 400);
  }
  result = await request("/api/ai/service-orders", { method:"POST", body:selected });
  assert.equal(result.response.status, 201);
  const snapshot = result.data.order;
  assert.equal(snapshot.assignedUserId, "mechanic");
  assert.equal(snapshot.service, services[0].name);
  assert.equal(snapshot.issue, selected.description);
  assert.equal(snapshot.estimatedValue, 123.46);
  assert.equal(snapshot.discount, 0);
  assert.deepEqual(snapshot.laborItems, [{ templateId, description:services[0].name, value:123.46 }]);
  assert.match(snapshot.history[0].text, /estimado/);
  const unassigned = await request("/api/ai/service-orders", { method:"POST", body:{ ...selected, assignedUserId:"", messageId:"no-preference" } });
  assert.equal(unassigned.response.status, 201);
  assert.equal(unassigned.data.order.assignedUserId, null);
  assert.equal(unassigned.data.order.estimatedValue, 123.46);
  const noTemplate = await request("/api/ai/service-orders", { method:"POST", body:{ ...selected, serviceTemplateId:"", messageId:"no-template" } });
  assert.equal(noTemplate.response.status, 201);
  assert.equal(noTemplate.data.order.assignedUserId, "mechanic");
  assert.equal(noTemplate.data.order.estimatedValue, null);
  assert.deepEqual(noTemplate.data.order.laborItems, []);
  const login = await request("/api/auth/login", { method:"POST", body:{ email:"owner@example.invalid", password:"Test-password-123" } });
  assert.equal(login.response.status, 200);
  const cookie = login.response.headers.get("set-cookie").split(";")[0];
  assert.equal((await request(`/api/service-templates/${templateId}`, { method:"PATCH", headers:{ cookie }, body:{ name:"Nome atualizado", defaultPrice:999, active:false } })).response.status, 200);
  result = await request("/api/ai/service-orders", { method:"POST", body:selected });
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.data.order, snapshot);
  for (const change of [{ assignedUserId:"" }, { serviceTemplateId:"" }]) {
    assert.equal((await request("/api/ai/service-orders", { method:"POST", body:{ ...selected, ...change } })).response.status, 409);
  }
  assert.equal((await request("/api/ai/service-orders", { method:"POST", body:{ ...selected, messageId:"new-inactive" } })).response.status, 400);
  const saved = JSON.parse(fs.readFileSync(path.join(dataDir, "service-orders.json"), "utf8"));
  assert.equal(saved.length, 5);
  assert.deepEqual(saved.find(order => order.id === snapshot.id).laborItems, snapshot.laborItems);
});

test("novas consultas e criacao AI exigem oficina configurada", async t => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "giro-n8n-no-workshop-"));
  const port = 45000 + Math.floor(Math.random() * 400), base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [path.resolve(__dirname, "..", "server.js")], {
    cwd:path.resolve(__dirname, ".."), stdio:"ignore",
    env:{ ...process.env, PORT:String(port), GIRO_DATA_DIR:dataDir, N8N_WORKSHOP_ID:"", N8N_API_TOKEN:"test-only", SMTP_HOST:"", SMTP_FROM:"" }
  });
  t.after(async () => {
    if (child.exitCode === null) await new Promise(resolve => { child.once("exit", resolve); child.kill(); });
    fs.rmSync(dataDir, { recursive:true, force:true });
  });
  for (let attempt = 0; attempt < 50; attempt++) {
    try { if ((await fetch(`${base}/api/health`)).ok) break; } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  for (const route of ["mechanics", "services", "service-orders"]) {
    const response = await fetch(`${base}/api/ai/${route}`, { method:route === "service-orders" ? "POST" : "GET", headers:{ "X-N8N-Token":"test-only" } });
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /N8N_WORKSHOP_ID/);
  }
});

test("arquivo importavel contem apenas tres tools sem segredos ou conexoes main", () => {
  const workflow = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "integrations/n8n/giro-agent-tools.json"), "utf8"));
  assert.equal(workflow.nodes.length, 3);
  assert.equal(workflow.active, false);
  assert.deepEqual(workflow.nodes.map(node => node.name), ["Buscar Mecânicos", "Buscar Serviços", "Criar Ordem de Serviço"]);
  for (const node of workflow.nodes) {
    assert.equal(node.type, "n8n-nodes-base.httpRequestTool");
    assert.equal(node.typeVersion, 4.5);
    assert.equal(node.credentials, undefined);
    assert.deepEqual(node.parameters.headerParameters.parameters, [{ name:"X-N8N-Token", value:"CONFIGURE_N8N_API_TOKEN" }]);
    assert.deepEqual(workflow.connections[node.name], { ai_tool:[[{ node:"AI Agent", type:"ai_tool", index:0 }]] });
  }
  const body = workflow.nodes[2].parameters.jsonBody;
  assert.match(body, /customerPhone: \$\('HTTP Request1'\)\.item\.json\.message\.phone/);
  assert.match(body, /messageId: \$\('Webhook'\)\.item\.json\.body\.data\.key\.id/);
  assert.doesNotMatch(body, /\$fromAI\('(?:messageId|customerPhone|price|estimatedValue)'/);
});

test("API n8n MySQL persiste e deduplica as três mutações", async t => {
  const configured = process.env.MYSQL_TEST_HOST && process.env.MYSQL_TEST_NAME && process.env.MYSQL_TEST_USER && process.env.MYSQL_TEST_WORKSHOP_ID;
  if (!configured) return t.skip("Configure MYSQL_TEST_HOST, MYSQL_TEST_NAME, MYSQL_TEST_USER e MYSQL_TEST_WORKSHOP_ID para o teste MySQL.");
  const port = 44500 + Math.floor(Math.random() * 400), base = `http://127.0.0.1:${port}`;
  const token = process.env.MYSQL_TEST_N8N_TOKEN || "mysql-n8n-test-token";
  const suffix = Date.now().toString().slice(-8), phone = `5511${suffix}`, plate = `N8N${suffix}`.slice(0, 10);
  const workshopId = crypto.randomUUID(), otherWorkshopId = crypto.randomUUID();
  const dbEnv = { DB_HOST:process.env.MYSQL_TEST_HOST, DB_PORT:process.env.MYSQL_TEST_PORT || "3306", DB_NAME:process.env.MYSQL_TEST_NAME, DB_USER:process.env.MYSQL_TEST_USER, DB_PASSWORD:process.env.MYSQL_TEST_PASSWORD || "" };
  const pool = require("../db").createPool(dbEnv);
  let child;
  t.after(async () => {
    if (child && child.exitCode === null) await new Promise(resolve => { child.once("exit", resolve); child.kill(); });
    try {
      for (const id of [workshopId, otherWorkshopId]) {
        await pool.execute("DELETE FROM service_orders WHERE workshop_id=?", [id]);
        await pool.execute("DELETE FROM vehicles WHERE workshop_id=?", [id]);
        await pool.execute("DELETE FROM clients WHERE workshop_id=?", [id]);
        await pool.execute("DELETE FROM users WHERE workshop_id=?", [id]);
        await pool.execute("DELETE FROM workshops WHERE id=?", [id]);
      }
    } finally { await pool.end(); }
  });
  const mechanics = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
  const templates = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
  for (const id of [workshopId, otherWorkshopId]) await pool.execute("INSERT INTO workshops (id,name) VALUES (?,?)", [id, "Isolated n8n test"]);
  for (let i = 0; i < 3; i++) {
    const tenant = i === 2 ? otherWorkshopId : workshopId;
    await pool.execute("INSERT INTO users (id,workshop_id,name,email,password_hash,role,status,active) VALUES (?,?,?,?,?,?,?,?)", [mechanics[i], tenant, `Mechanic ${i}`, `${mechanics[i]}@example.invalid`, "unused", "mechanic", i === 1 ? "INACTIVE" : "active", i !== 1]);
    await pool.execute("INSERT INTO service_templates (id,workshop_id,name,default_price,active) VALUES (?,?,?,?,?)", [templates[i], tenant, `Revisão d'óleo 100%_ ${i}`, 123.45, i !== 1]);
  }
  child = spawn(process.execPath, [path.resolve(__dirname, "..", "server.js")], {
    cwd:path.resolve(__dirname, ".."),
    env:{ ...process.env, ...dbEnv, PORT:String(port), GIRO_DATA_DIR:"", N8N_API_TOKEN:token, N8N_WORKSHOP_ID:workshopId, SMTP_HOST:"", SMTP_FROM:"" },
    stdio:"ignore"
  });
  for (let attempt = 0; attempt < 50; attempt++) {
    try { if ((await fetch(`${base}/api/health`)).ok) break; } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const request = async (route, options = {}) => {
    const response = await fetch(`${base}${route}`, { ...options, headers:{ "content-type":"application/json", "X-N8N-Token":token, ...(options.headers || {}) }, body:options.body ? JSON.stringify(options.body) : undefined });
    return { response, data:await response.json() };
  };
  for (const route of ["/api/ai/mechanics", "/api/ai/services"]) assert.equal((await fetch(`${base}${route}`)).status, 401);
  assert.deepEqual((await request("/api/ai/mechanics")).data, { mechanics:[{ id:mechanics[0], name:"Mechanic 0" }] });
  assert.deepEqual((await request(`/api/ai/services?q=${encodeURIComponent("D'ÓLEO 100%_")}`)).data, { services:[{ id:templates[0], name:"Revisão d'óleo 100%_ 0", defaultPrice:123.45 }] });
  let result = await request("/api/ai/customers", { method:"POST", body:{ name:"Cliente MySQL AI", phone } });
  assert.equal(result.response.status, 201); assert.equal(result.data.created, true);
  result = await request("/api/ai/customers", { method:"POST", body:{ name:"Outro nome", phone } });
  assert.equal(result.response.status, 200); assert.equal(result.data.created, false);
  result = await request("/api/ai/vehicles", { method:"POST", body:{ plate, model:"Modelo AI", year:2024, customerPhone:phone } });
  assert.equal(result.response.status, 201); assert.equal(result.data.created, true);
  result = await request("/api/ai/service-orders", { method:"POST", headers:{ "X-Message-Id":`mysql-evo-${suffix}` }, body:{ plate, description:"Revisar freios", customerPhone:phone } });
  assert.equal(result.response.status, 201); assert.equal(result.data.created, true);
  const orderId = result.data.order.id;
  result = await request("/api/ai/service-orders", { method:"POST", headers:{ "X-Message-Id":`mysql-evo-${suffix}` }, body:{ plate, description:"Duplicada", customerPhone:phone } });
  assert.equal(result.response.status, 200); assert.equal(result.data.created, false); assert.equal(result.data.order.id, orderId);
  const selected = { plate, description:"Ruído do cliente", customerPhone:phone, assignedUserId:mechanics[0], serviceTemplateId:templates[0], messageId:`selected-${suffix}`, estimatedValue:1, discount:99, laborItems:[{ value:1 }] };
  for (const i of [1, 2]) {
    assert.equal((await request("/api/ai/service-orders", { method:"POST", body:{ ...selected, assignedUserId:mechanics[i] } })).response.status, 400);
    assert.equal((await request("/api/ai/service-orders", { method:"POST", body:{ ...selected, serviceTemplateId:templates[i] } })).response.status, 400);
  }
  result = await request("/api/ai/service-orders", { method:"POST", body:selected });
  assert.equal(result.response.status, 201);
  const snapshot = result.data.order;
  assert.equal(snapshot.assignedUserId, mechanics[0]);
  assert.equal(snapshot.estimatedValue, 123.45);
  assert.equal(snapshot.discount, 0);
  assert.equal(snapshot.issue, selected.description);
  assert.equal(snapshot.createdBy, null);
  assert.equal(snapshot.history[0].userId, null);
  assert.deepEqual(snapshot.laborItems, [{ templateId:templates[0], description:"Revisão d'óleo 100%_ 0", value:123.45 }]);
  await pool.execute("UPDATE service_templates SET name=?,default_price=?,active=FALSE WHERE id=? AND workshop_id=?", ["Edited", 999, templates[0], workshopId]);
  result = await request("/api/ai/service-orders", { method:"POST", body:selected });
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.data.order, snapshot);
  assert.equal((await request("/api/ai/service-orders", { method:"POST", body:{ ...selected, assignedUserId:"" } })).response.status, 409);
  assert.equal((await request("/api/ai/service-orders", { method:"POST", body:{ ...selected, serviceTemplateId:"" } })).response.status, 409);
  const [rows] = await pool.execute("SELECT assigned_user_id,estimated_value,created_by,labor_items FROM service_orders WHERE id=? AND workshop_id=?", [snapshot.id, workshopId]);
  assert.equal(rows[0].assigned_user_id, mechanics[0]);
  assert.equal(Number(rows[0].estimated_value), 123.45);
  assert.equal(rows[0].created_by, null);
});
