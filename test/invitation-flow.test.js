"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const { spawn } = require("node:child_process");

test("activation endpoints enforce pending, one-time token, tenant isolation and deactivation", async t => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "giro-invite-test-"));
  const portServer = net.createServer();
  await new Promise(resolve => portServer.listen(0, "127.0.0.1", resolve));
  const port = portServer.address().port;
  await new Promise(resolve => portServer.close(resolve));

  const workshopId = "workshop-owner-test", otherWorkshopId = "other-workshop-test";
  const ownerSalt = "a1b2c3d4e5f607182930aabbccddeeff";
  const ownerPassword = "OwnerPass123";
  const ownerHash = crypto.scryptSync(ownerPassword,ownerSalt,64).toString("hex");
  const secondSalt = "11223344556677889900aabbccddeeff";
  const secondPassword = "MechanicPass123";
  const secondHash = crypto.scryptSync(secondPassword,secondSalt,64).toString("hex");
  const users = [
    { id:"owner-id", name:"Oficina Teste", email:"owner@example.com", passwordHash:`${ownerSalt}:${ownerHash}`, workshop:"Oficina Teste", workshopId, role:"OWNER", status:"ACTIVE", active:true },
    { id:"pending-id", name:"Mecânico Pendente", email:"pending@example.com", passwordHash:null, workshop:"Oficina Teste", workshopId, role:"MECHANIC", status:"PENDING", active:false },
    { id:"second-mechanic", name:"Carlos Mecânico", email:"carlos@example.com", passwordHash:`${secondSalt}:${secondHash}`, workshop:"Oficina Teste", workshopId, role:"MECHANIC", status:"ACTIVE", active:true },
    { id:"expired-id", name:"Convite Expirado", email:"expired@example.com", passwordHash:null, workshop:"Oficina Teste", workshopId, role:"ATTENDANT", status:"PENDING", active:false },
    { id:"other-id", name:"Outra Oficina", email:"other@example.com", passwordHash:null, workshop:"Outra", workshopId:otherWorkshopId, role:"MECHANIC", status:"PENDING", active:false }
  ];
  const rawToken = "safe-activation-token-value";
  const tokenHash = value => crypto.createHash("sha256").update(value,"utf8").digest("hex");
  fs.writeFileSync(path.join(dataDir,"users.json"),JSON.stringify(users));
  fs.writeFileSync(path.join(dataDir,"password-reset-tokens.json"),"[]");
  fs.writeFileSync(path.join(dataDir,"invitation-tokens.json"),JSON.stringify([
    { id:"invite-one",userId:"pending-id",workshopId,tokenHash:tokenHash(rawToken),expiresAt:new Date(Date.now()+60000).toISOString(),usedAt:null,createdAt:new Date().toISOString() },
    { id:"invite-expired",userId:"expired-id",workshopId,tokenHash:tokenHash("expired-token"),expiresAt:new Date(Date.now()-1000).toISOString(),usedAt:null,createdAt:new Date().toISOString() }
  ]));
  fs.writeFileSync(path.join(dataDir,"service-orders.json"),JSON.stringify([
    { id:900,workshopId:otherWorkshopId,clientId:null,vehicleId:null,createdBy:"other-id",assignedUserId:"other-id",status:3,entryAt:new Date().toISOString(),history:[] },
    { id:901,workshopId:otherWorkshopId,clientId:null,vehicleId:null,createdBy:"other-id",assignedUserId:"other-id",status:6,entryAt:new Date().toISOString(),history:[] }
  ]));

  const child = spawn(process.execPath,[path.join(__dirname,"..","server.js")],{
    cwd:path.join(__dirname,".."),
    env:{ ...process.env, PORT:String(port), GIRO_DATA_DIR:dataDir, SMTP_HOST:"", SMTP_FROM:"" },
    stdio:"ignore"
  });
  t.after(async () => {
    child.kill();
    await new Promise(resolve => setTimeout(resolve,100));
    fs.rmSync(dataDir,{ recursive:true,force:true });
  });

  const base = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let attempt=0; attempt<60; attempt++) {
    try { if ((await fetch(`${base}/api/health`)).ok) { ready=true; break; } } catch (_) {}
    await new Promise(resolve => setTimeout(resolve,100));
  }
  assert.equal(ready,true,"server should become ready");

  const login = await fetch(`${base}/api/auth/login`,{ method:"POST",headers:{ "content-type":"application/json" },body:JSON.stringify({ email:"owner@example.com",password:ownerPassword }) });
  assert.equal(login.status,200);
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const authHeaders = { cookie,"content-type":"application/json" };

  const teamResponse = await fetch(`${base}/api/team`,{ headers:authHeaders });
  const team = await teamResponse.json();
  assert.equal(teamResponse.status,200);
  assert.deepEqual(team.users.map(user => user.id).sort(),["expired-id","owner-id","pending-id","second-mechanic"]);
  assert.equal(team.users.find(user => user.id === "pending-id").status,"PENDING");

  const pendingLogin = await fetch(`${base}/api/auth/login`,{ method:"POST",headers:{ "content-type":"application/json" },body:JSON.stringify({ email:"pending@example.com",password:"anything" }) });
  assert.equal(pendingLogin.status,403);
  assert.equal((await pendingLogin.json()).code,"ACCOUNT_PENDING");

  const expired = await fetch(`${base}/api/auth/activate?token=expired-token`);
  assert.equal(expired.status,400);

  const activate = await fetch(`${base}/api/auth/activate`,{ method:"POST",headers:{ "content-type":"application/json" },body:JSON.stringify({ token:rawToken,password:"NewPassword123",confirmPassword:"NewPassword123" }) });
  assert.equal(activate.status,200);
  assert.equal((await activate.json()).message,"Conta ativada com sucesso.");
  const replay = await fetch(`${base}/api/auth/activate`,{ method:"POST",headers:{ "content-type":"application/json" },body:JSON.stringify({ token:rawToken,password:"NewPassword123",confirmPassword:"NewPassword123" }) });
  assert.equal(replay.status,400);

  const employeeLogin = await fetch(`${base}/api/auth/login`,{ method:"POST",headers:{ "content-type":"application/json" },body:JSON.stringify({ email:"pending@example.com",password:"NewPassword123" }) });
  assert.equal(employeeLogin.status,200);
  const employeeSession = await employeeLogin.json();
  assert.equal(employeeSession.user.role,"MECHANIC");
  const employeeCookie = employeeLogin.headers.get("set-cookie").split(";")[0];
  const mechanicHeaders = { cookie:employeeCookie,"content-type":"application/json" };
  const secondLogin = await fetch(`${base}/api/auth/login`,{ method:"POST",headers:{ "content-type":"application/json" },body:JSON.stringify({ email:"carlos@example.com",password:secondPassword }) });
  assert.equal(secondLogin.status,200);
  const secondCookie = secondLogin.headers.get("set-cookie").split(";")[0];
  const secondMechanicHeaders = { cookie:secondCookie,"content-type":"application/json" };

  const quickCreate = await fetch(`${base}/api/orders/quick`,{ method:"POST",headers:mechanicHeaders,body:JSON.stringify({ plate:"abc1d23",issue:"Ruído na suspensão",estimatedValue:99999,assignedUserId:"other-id" }) });
  assert.equal(quickCreate.status,201);
  const createdOrder = (await quickCreate.json()).order;
  assert.equal(createdOrder.plate,"ABC1D23");
  assert.equal(createdOrder.issue,"Ruído na suspensão");
  assert.equal(createdOrder.assignedUserId,"pending-id");
  assert.equal(createdOrder.createdBy,"pending-id");
  assert.equal(createdOrder.vehicleId,null);
  assert.equal(createdOrder.clientId,null);
  assert.equal(createdOrder.incomplete,true);
  assert.equal(Object.hasOwn(createdOrder,"estimatedValue"),false);
  const issueOnly = await fetch(`${base}/api/orders/quick`,{ method:"POST",headers:mechanicHeaders,body:JSON.stringify({ issue:"Barulho no motor" }) });
  assert.equal(issueOnly.status,201);
  assert.equal((await issueOnly.json()).order.incomplete,true);
  const clientOnly = await fetch(`${base}/api/orders/quick`,{ method:"POST",headers:mechanicHeaders,body:JSON.stringify({ clientName:"João",phone:"51999990000" }) });
  assert.equal(clientOnly.status,201);
  assert.equal((await clientOnly.json()).order.clientName,"João");
  const emptyQuick = await fetch(`${base}/api/orders/quick`,{ method:"POST",headers:mechanicHeaders,body:JSON.stringify({}) });
  assert.equal(emptyQuick.status,201);
  assert.equal((await emptyQuick.json()).order.incomplete,true);
  const ownList = await fetch(`${base}/api/orders`,{ headers:mechanicHeaders });
  assert.equal((await ownList.json()).orders.length,4);
  const hiddenOtherOfficeOrder = await fetch(`${base}/api/orders/900`,{ headers:mechanicHeaders });
  assert.equal(hiddenOtherOfficeOrder.status,404);
  const waitingStatus = await fetch(`${base}/api/orders/${createdOrder.id}`,{ method:"PATCH",headers:mechanicHeaders,body:JSON.stringify({ status:1 }) });
  assert.equal(waitingStatus.status,200);
  const waitingOrder = (await waitingStatus.json()).order;
  assert.equal(waitingOrder.status,1);
  assert.equal(waitingOrder.history.at(-1).action,"marked_waiting_parts");
  const finishedStatus = await fetch(`${base}/api/orders/${createdOrder.id}`,{ method:"PATCH",headers:mechanicHeaders,body:JSON.stringify({ status:2 }) });
  assert.equal(finishedStatus.status,200);
  const finishedOrder = (await finishedStatus.json()).order;
  assert.equal(finishedOrder.status,2);
  assert.equal(finishedOrder.history.at(-1).action,"service_finished");
  assert.equal(JSON.parse(fs.readFileSync(path.join(dataDir,"service-orders.json"),"utf8")).find(order => order.id === 900).status,1);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dataDir,"service-orders.json"),"utf8")).find(order => order.id === 901).status,2);
  const ownTeamDenied = await fetch(`${base}/api/team`,{ headers:mechanicHeaders });
  assert.equal(ownTeamDenied.status,403);
  const completeQuick = await fetch(`${base}/api/orders/${createdOrder.id}`,{ method:"PATCH",headers:mechanicHeaders,body:JSON.stringify({ clientName:"João Silva",phone:"51999990000",vehicleBrand:"Chevrolet",vehicleModel:"Onix",issue:"Barulho dianteiro ao passar em irregularidades" }) });
  assert.equal(completeQuick.status,200);
  assert.equal((await completeQuick.json()).order.clientName,"João Silva");
  const secondBeforeAssignment = await fetch(`${base}/api/orders`,{ headers:secondMechanicHeaders });
  assert.equal((await secondBeforeAssignment.json()).orders.length,0);
  const secondDirectBeforeAssignment = await fetch(`${base}/api/orders/${createdOrder.id}`,{ headers:secondMechanicHeaders });
  assert.equal(secondDirectBeforeAssignment.status,404);
  const reassign = await fetch(`${base}/api/orders/${createdOrder.id}`,{ method:"PATCH",headers:authHeaders,body:JSON.stringify({ assignedUserId:"second-mechanic" }) });
  assert.equal(reassign.status,200);
  const oldMechanicDirect = await fetch(`${base}/api/orders/${createdOrder.id}`,{ headers:mechanicHeaders });
  assert.equal(oldMechanicDirect.status,404);
  const secondAfterAssignment = await fetch(`${base}/api/orders`,{ headers:secondMechanicHeaders });
  assert.deepEqual((await secondAfterAssignment.json()).orders.map(order => order.id),[createdOrder.id]);
  const ownerOrders = await fetch(`${base}/api/orders`,{ headers:authHeaders });
  assert.equal((await ownerOrders.json()).orders.length,4);
   const mechanicDelivered = await fetch(`${base}/api/orders/${createdOrder.id}/deliver`,{ method:"POST",headers:secondMechanicHeaders });
   assert.equal(mechanicDelivered.status,200);
   const mechanicDeliveredOrder = (await mechanicDelivered.json()).order;
   assert.equal(mechanicDeliveredOrder.closedBy,"second-mechanic");
   const ownerCannotDeliver = await fetch(`${base}/api/orders/${createdOrder.id}/deliver`,{ method:"POST",headers:authHeaders });
   assert.equal(ownerCannotDeliver.status,409);
   const reopenedForOwner = await fetch(`${base}/api/orders/${createdOrder.id}`,{ method:"PATCH",headers:authHeaders,body:JSON.stringify({ reopen:true }) });
   assert.equal(reopenedForOwner.status,200);
   const delivered = await fetch(`${base}/api/orders/${createdOrder.id}/deliver`,{ method:"POST",headers:authHeaders });
  assert.equal(delivered.status,200);
  const deliveredOrder = (await delivered.json()).order;
  assert.equal(deliveredOrder.status,3);
  assert.ok(deliveredOrder.closedAt);
  assert.equal(deliveredOrder.closedBy,"owner-id");
  assert.equal((await (await fetch(`${base}/api/orders`,{ headers:authHeaders })).json()).orders.length,3);
  assert.equal((await (await fetch(`${base}/api/history/orders`,{ headers:authHeaders })).json()).orders.length,1);
  const editClosed = await fetch(`${base}/api/orders/${createdOrder.id}`,{ method:"PATCH",headers:authHeaders,body:JSON.stringify({ issue:"Edição indevida" }) });
  assert.equal(editClosed.status,409);
  const reopened = await fetch(`${base}/api/orders/${createdOrder.id}`,{ method:"PATCH",headers:authHeaders,body:JSON.stringify({ reopen:true }) });
  assert.equal(reopened.status,200);
  assert.equal((await reopened.json()).order.status,2);
  const deliveredAgain = await fetch(`${base}/api/orders/${createdOrder.id}/deliver`,{ method:"POST",headers:authHeaders });
  assert.equal(deliveredAgain.status,200);
  assert.equal((await (await fetch(`${base}/api/history/orders`,{ headers:authHeaders })).json()).orders.length,1);

  const crossTenant = await fetch(`${base}/api/team/other-id`,{ method:"PATCH",headers:authHeaders,body:JSON.stringify({ active:false }) });
  assert.equal(crossTenant.status,404);
  const deactivate = await fetch(`${base}/api/team/pending-id`,{ method:"PATCH",headers:authHeaders,body:JSON.stringify({ active:false }) });
  assert.equal(deactivate.status,200);
  const disabledLogin = await fetch(`${base}/api/auth/login`,{ method:"POST",headers:{ "content-type":"application/json" },body:JSON.stringify({ email:"pending@example.com",password:"NewPassword123" }) });
  assert.equal(disabledLogin.status,401);

  const noSmtpCreate = await fetch(`${base}/api/team`,{ method:"POST",headers:authHeaders,body:JSON.stringify({ name:"Novo Funcionário",email:"new@example.com",role:"MECHANIC" }) });
  assert.equal(noSmtpCreate.status,503);
  const noSmtpData = await noSmtpCreate.json();
  assert.equal(noSmtpData.code,"INVITATION_SEND_FAILED");
  assert.equal(noSmtpData.user.status,"PENDING");
  const createdUser = JSON.parse(fs.readFileSync(path.join(dataDir,"users.json"),"utf8")).find(user => user.email === "new@example.com");
  assert.equal(createdUser.status,"PENDING");
  assert.equal(createdUser.workshopId,workshopId);
  assert.equal(createdUser.passwordHash,null);

  const duplicate = await fetch(`${base}/api/team`,{ method:"POST",headers:authHeaders,body:JSON.stringify({ name:"Nome Duplicado",email:"pending@example.com",role:"MECHANIC" }) });
  assert.equal(duplicate.status,409);
  const roleTamper = await fetch(`${base}/api/team`,{ method:"POST",headers:authHeaders,body:JSON.stringify({ name:"Tentativa Owner",email:"tamper@example.com",role:"OWNER" }) });
  assert.equal(roleTamper.status,400);
});
