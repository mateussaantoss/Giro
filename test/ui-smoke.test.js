"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const edgeCandidates = [
  process.env.GIRO_EDGE_PATH,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  path.join(process.env.LOCALAPPDATA || "", "Microsoft\\Edge\\Application\\msedge.exe")
].filter(Boolean);
const edgePath = edgeCandidates.find(candidate => fs.existsSync(candidate));

async function freePort() {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

class DevTools {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 0;
    this.pending = new Map();
    this.exceptions = [];
    this.ready = new Promise((resolve,reject) => {
      this.socket.addEventListener("open",resolve,{ once:true });
      this.socket.addEventListener("error",reject,{ once:true });
    });
    this.socket.addEventListener("message",event => {
      const message = JSON.parse(event.data);
      if (message.method === "Runtime.exceptionThrown") this.exceptions.push(message.params.exceptionDetails.text);
      if (message.id && this.pending.has(message.id)) {
        const { resolve,reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message)); else resolve(message.result);
      }
    });
  }

  async send(method,params = {}) {
    await this.ready;
    const id = ++this.nextId;
    return new Promise((resolve,reject) => {
      this.pending.set(id,{ resolve,reject });
      this.socket.send(JSON.stringify({ id,method,params }));
    });
  }

  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate",{ expression,returnByValue:true,awaitPromise:true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result?.value;
  }

  close() { this.socket.close(); }
}

test("fluxos visíveis do painel funcionam no navegador e nas larguras principais",{ skip:!edgePath || typeof WebSocket === "undefined" },async t => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(),"giro-ui-audit-data-"));
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(),"giro-ui-audit-edge-"));
  const port = await freePort(), debugPort = await freePort();
  const salt = crypto.randomBytes(16).toString("hex"), password = "UITestPass-2026!";
  const hash = crypto.scryptSync(password,salt,64).toString("hex");
  const user = { id:"ui-owner",name:"Usuário Teste",email:"ui-owner@example.invalid",passwordHash:`${salt}:${hash}`,workshop:"Oficina UI",workshopId:"ui-workshop",role:"OWNER",status:"ACTIVE",active:true };
  const mechanicSalt = crypto.randomBytes(16).toString("hex"), mechanicPassword = "MechanicUITest-2026!";
  const mechanicHash = crypto.scryptSync(mechanicPassword,mechanicSalt,64).toString("hex");
  const mechanic = { id:"ui-mechanic",name:"Mecânico UI",email:"ui-mechanic@example.invalid",passwordHash:`${mechanicSalt}:${mechanicHash}`,workshop:user.workshop,workshopId:user.workshopId,role:"MECHANIC",status:"ACTIVE",active:true };
  fs.writeFileSync(path.join(dataDir,"users.json"),JSON.stringify([user,mechanic]));
  for (const file of ["service-orders.json","workshop-records.json","invitation-tokens.json","password-reset-tokens.json"]) fs.writeFileSync(path.join(dataDir,file),"[]");

  const server = spawn(process.execPath,[path.join(__dirname,"..","server.js")],{ cwd:path.join(__dirname,".."),env:{ ...process.env,PORT:String(port),GIRO_DATA_DIR:dataDir,SMTP_HOST:"",SMTP_FROM:"" },stdio:"ignore" });
  const edge = spawn(edgePath,["--headless=new","--no-first-run","--disable-gpu","--disable-background-networking","--no-sandbox","--remote-allow-origins=*",`--remote-debugging-port=${debugPort}`,`--user-data-dir=${profileDir}`,"about:blank"],{ stdio:"ignore" });
  let devtools;
  t.after(async () => {
    devtools?.close(); edge.kill(); server.kill();
    await new Promise(resolve => setTimeout(resolve,150));
    fs.rmSync(dataDir,{ recursive:true,force:true }); fs.rmSync(profileDir,{ recursive:true,force:true });
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  let ready = false, target;
  for (let attempt=0;attempt<100;attempt++) {
    try {
      if ((await fetch(`${baseUrl}/api/health`)).ok) {
        const response = await fetch(`http://127.0.0.1:${debugPort}/json`);
        if (response.ok) { ready=true; break; }
      }
    } catch (_) {}
    await new Promise(resolve => setTimeout(resolve,100));
  }
  assert.ok(ready,"backend and Edge DevTools become ready");
  const createTarget = await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(`${baseUrl}/app/#/login`)}`,{ method:"PUT" });
  assert.equal(createTarget.status,200);
  target = await createTarget.json();
  devtools = new DevTools(target.webSocketDebuggerUrl);
  await devtools.send("Page.enable"); await devtools.send("Runtime.enable");
  await devtools.send("Emulation.setDeviceMetricsOverride",{ width:1440,height:1000,deviceScaleFactor:1,mobile:false });

  const poll = async expression => {
    for (let attempt=0;attempt<80;attempt++) {
      try { if (await devtools.evaluate(expression)) return true; } catch (_) {}
      await new Promise(resolve => setTimeout(resolve,100));
    }
    return false;
  };
  const fill = async (selector,value) => devtools.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return false;e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);
  const clickedActions = new Set();
  const click = async selector => {
    const action=await devtools.evaluate(`document.querySelector(${JSON.stringify(selector)})?.dataset?.action || null`);
    if (action) clickedActions.add(action);
    return devtools.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return false;e.click();return true})()`);
  };
  const submit = async selector => devtools.evaluate(`(()=>{const f=document.querySelector(${JSON.stringify(selector)});if(!f)return false;f.requestSubmit();return true})()`);
  const setHash = async route => { await devtools.evaluate(`location.hash=${JSON.stringify(`/${route}`)}`); assert.ok(await poll(`location.hash===${JSON.stringify(`#/${route}`)}`),`route ${route} navigates`); await new Promise(resolve => setTimeout(resolve,150)); };

  assert.ok(await poll("document.querySelector('#login-form')"),"login page renders");
  await fill('[name="email"]',user.email); await fill('[name="password"]',password);
  await click('[data-action="toggle-password"]');
  assert.equal(await devtools.evaluate("document.querySelector('#password').type"),"text","show-password button works");
  await click('[data-action="toggle-password"]');
  await submit("#login-form");
  assert.ok(await poll("document.querySelector('.topbar')"),"login opens the app shell");
  if (await devtools.evaluate("!!document.querySelector('[data-action=\"new-client\"]')")) {
    await click('[data-action="new-client"]');
    await fill('#client-form [name="name"]',"Cliente do primeiro atendimento");
    await fill('#client-form [name="phone"]',"(51) 99999-7766");
    await fill('#client-form [name="email"]',"primeiro@example.invalid");
    await submit('#client-form');
    assert.ok(await poll("document.querySelector('[data-action=\"new-order\"]')"),"dashboard offers a first order after the first client");
    await click('[data-action="new-order"]');
    const vehicleChoices = await devtools.evaluate("document.querySelectorAll('#new-order-form [name=vehicle] option').length");
    if (vehicleChoices === 0) t.diagnostic("FUNCTIONAL GAP: conta vazia consegue criar o primeiro cliente, mas o formulário Nova OS não tem veículo selecionável e não oferece cadastro de cliente/veículo no fluxo.");
    await click('[data-action="close-modal"]');
  }
  const initialState = { statusVersion:2,clients:[{ id:1,name:"Cliente UI",phone:"(51) 99999-8877",email:"cliente@example.invalid" }],vehicles:[{ id:1,brand:"Toyota",model:"Corolla XEi",year:2021,plate:"ABC1D23",km:58000,client:1,next:"Revisão" }],team:[{ id:1,name:"Mecânico Local",role:"Mecânico",specialty:"Geral",color:"blue" }],orders:[],conversations:[],settings:{ workshop:user.workshop,name:user.name,email:user.email,phone:"51999990000",address:"RS",notifications:true },readNotifications:false };
  await devtools.evaluate(`localStorage.setItem('giro-workshop-v1:${user.id}',${JSON.stringify(JSON.stringify(initialState))});location.reload()`);
  assert.ok(await poll("document.querySelector('.topbar') && document.body.innerText.includes('Pátio da Oficina')"),"seeded empty dashboard reloads");
  assert.equal(await devtools.evaluate("document.querySelectorAll('.nav a').length > 0"),true);
  assert.equal(await devtools.evaluate("document.body.innerText.includes('DEMONSTRAÇÃO')"),false);
  const firstTheme = await devtools.evaluate("document.documentElement.getAttribute('data-theme')");
  await click('[data-action="theme"]');
  assert.notEqual(await devtools.evaluate("document.documentElement.getAttribute('data-theme')"),firstTheme,"theme toggle changes the theme");
  await click('[data-action="theme"]');
  await click('[data-action="collapse"]');
  assert.equal(await devtools.evaluate("document.querySelector('#layout').classList.contains('sidebar-collapsed')"),true,"desktop sidebar collapse works");
  await click('[data-action="collapse"]');

  const navRoutes = await devtools.evaluate("[...document.querySelectorAll('.nav a[href^=\"#/\"]')].map(a=>a.getAttribute('href').slice(2))");
  for (const route of navRoutes) {
    await click(`.nav a[href="#/${route}"]`);
    if (route === 'historico') {
      assert.ok(await poll("document.querySelector('dialog.history-modal[open]')"),"history opens as an overlay");
      await click('[data-action="close-modal"]');
      assert.ok(await poll("!document.querySelector('dialog.history-modal')?.open"),"history overlay closes");
      continue;
    }
    assert.ok(await poll(`location.hash===${JSON.stringify(`#/${route}`)}`),`navigation button opens ${route}`);
    assert.ok(await devtools.evaluate("document.querySelector('#main') !== null"),`${route} page has main content`);
  }

  await setHash("dashboard"); await click('[data-action="view-board"]');
  await click('[data-action="patio-maximize"]');
  assert.equal(await devtools.evaluate("document.body.classList.contains('patio-expanded')"),true,"patio maximize works");
  await click('[data-action="patio-restore"]');
  await click('[data-action="patio-minimize"]');
  assert.equal(await devtools.evaluate("document.querySelector('#patio-section').classList.contains('is-minimized')"),true,"patio minimize works");
  await click('[data-action="patio-restore"]');
  await click('[data-action="view-list"]');
  assert.ok(await devtools.evaluate("document.querySelector('.patio-view-switch [data-action=\"view-list\"]').classList.contains('active')"),"Kanban list toggle works");
  await click('[data-action="view-board"]');
  await click('[data-action="new-order"]');
  assert.ok(await poll("document.querySelector('#new-order-form')"),"new order button opens a form");
  await fill('#new-order-form [name="service"]',"Troca de óleo");
  await fill('#new-order-form [name="issue"]',"Manutenção preventiva");
  await fill('#new-order-form [name="due"]',"2028-10-20T17:00");
  await submit('#new-order-form');
  assert.ok(await poll("location.hash.startsWith('#/ordens/')"),"new OS submit opens its detail page");
  const orderId = await devtools.evaluate("location.hash.split('/').at(-1)");
  assert.ok(await devtools.evaluate("document.body.innerText.includes('Troca de óleo')"),"created OS details appear");
  await click('[data-action="order-chat"]');
  assert.ok(await devtools.evaluate("location.hash.startsWith('#/ordens/') && document.querySelector('#toasts').innerText.includes('Nenhuma mensagem foi enviada')"),"unavailable WhatsApp action explains that nothing was sent");

  await click('[data-action="diagnosis"]'); await fill('#diagnosis-form [name="diagnosis"]',"Filtro verificado"); await submit('#diagnosis-form');
  assert.ok(await poll("document.body.innerText.includes('Filtro verificado')"),"diagnosis saves and displays");
  await click('[data-action="note"]'); await fill('#note-form [name="text"]',"Nota de teste"); await submit('#note-form');
  assert.ok(await poll("document.body.innerText.includes('Nota de teste')"),"note action saves");
  await click('[data-action="problem"]'); await fill('#note-form [name="text"]',"Problema de teste"); await submit('#note-form');
  assert.ok(await poll("document.body.innerText.includes('Problema de teste')"),"problem action saves");
  await click('[data-action="add-service"]'); await fill('#service-form [name="name"]',"Alinhamento"); await fill('#service-form [name="value"]',"120.50"); await submit('#service-form');
  assert.ok(await poll("document.body.innerText.includes('Alinhamento')"),"additional service saves");
  await click('[data-action="add-part"]'); await fill('#part-form [name="name"]',"Filtro de óleo"); await fill('#part-form [name="qty"]',"1"); await submit('#part-form');
  assert.ok(await poll("document.body.innerText.includes('Filtro de óleo')"),"part action saves");

  await click('[data-action="change-status"]');
  assert.ok(await poll("document.querySelector('#status-form')"),"status button opens a form");
  await fill('#status-form [name="status"]',"2"); await submit('#status-form');
  assert.ok(await poll("document.body.innerText.includes('Pronto') && document.querySelector('[data-action=\"deliver-local-order\"]')"),"setting Ready exposes delivery action");
  await click('[data-action="deliver-local-order"]'); await click('[data-action="confirm-delivery"]');
  assert.ok(await poll("document.body.innerText.includes('Entregue')"),"confirm delivery closes the order");

  await setHash("dashboard");
  assert.ok(await click('[data-action="global-search"]'),"global search button is present");
  await fill('#modal-search',"ABC1D23");
  assert.ok(await poll("document.querySelector('#global-results')"),"global search renders results");
  assert.ok(await devtools.evaluate("document.querySelector('#global-results').innerText.includes('ABC1D23')"),"global search finds local OS by plate");
  await click('[data-action="close-modal"]');
  await click('[data-action="notifications"]');
  assert.ok(await poll("document.querySelector('#modal').open"),"notification button opens a panel");
  assert.equal(await devtools.evaluate("!!document.querySelector('.notification-dot')"),false,"an empty notifications panel does not show a false unread badge");
  await click('[data-action="close-modal"]');

  await setHash("clientes"); await click('[data-action="new-client"]');
  await fill('#client-form [name="name"]',"Novo Cliente UI"); await fill('#client-form [name="phone"]',"(51) 99999-1122"); await fill('#client-form [name="email"]',"novo@example.invalid"); await submit('#client-form');
  assert.ok(await poll("document.body.innerText.includes('Novo Cliente UI')"),"client creation appears in the client list");
  await setHash("clientes/1"); await click('[data-action="client-chat"]');
  assert.ok(await devtools.evaluate("location.hash==='#/clientes/1' && document.querySelector('#toasts').innerText.includes('Nenhuma mensagem foi enviada')"),"client WhatsApp action does not navigate to an inaccessible or simulated chat");

  await setHash("relatorios");
  assert.ok(await click('[data-action="export-report"]'),"report export button is clickable");
  await setHash("configuracoes");
  for (const tab of ["Oficina","Notificações","Integrações","Demonstração"]) {
    await click(`[data-action="settings-tab"][data-tab="${tab}"]`);
    assert.ok(await devtools.evaluate(`document.body.innerText.includes(${JSON.stringify(tab)})`),`settings tab ${tab} displays`);
    if (tab === "Integrações") assert.equal(await devtools.evaluate("!!document.querySelector('.page-enter a[href=\"#/whatsapp\"]')"),false,"unavailable WhatsApp integration has no broken open link");
  }
  await click('[data-action="settings-tab"][data-tab="Oficina"]');
  await fill('#settings-form [name="workshop"]',"Oficina UI Atualizada"); await submit('#settings-form');
  assert.ok(await poll("document.querySelector('.workshop-name')?.innerText==='Oficina UI Atualizada'"),"workshop settings save locally");
  await click('[data-action="settings-tab"][data-tab="Notificações"]');
  await click('#notification-setting');
  assert.equal(await devtools.evaluate("JSON.parse(localStorage.getItem('giro-workshop-v1:ui-owner')).settings.notifications"),false,"notification preference is persisted");

  await setHash("equipe"); await click('[data-action="new-member"]');
  await fill('#member-form [name="name"]',"Funcionário UI"); await fill('#member-form [name="email"]',"employee-ui@example.invalid");
  await fill('#member-form [name="phone"]',"51988886666"); await submit('#member-form');
  assert.ok(await poll("document.body.innerText.includes('Funcionário UI')"),"team invite failure still reports the created pending member");
  const inviteUserId = await devtools.evaluate("[...document.querySelectorAll('.panel')].find(e=>e.innerText.includes('employee-ui@example.invalid'))?.querySelector('[data-action=\"resend-invitation\"]')?.dataset.id");
  assert.ok(inviteUserId,"pending invite exposes resend action");
  await click(`[data-action="resend-invitation"][data-id="${inviteUserId}"]`);
  assert.ok(await poll("document.querySelector('#toasts').innerText.includes('convite')"),"resend invitation reports the unavailable mail service");
  await click(`[data-action="deactivate-member"][data-id="${inviteUserId}"]`);
  assert.ok(await poll("document.body.innerText.includes('Inativo')"),"deactivation button updates team state");

  await click('[data-action="logout"]');
  assert.ok(await poll("document.querySelector('#login-form')"),"logout returns to login");
  await fill('[name="email"]',mechanic.email); await fill('[name="password"]',mechanicPassword); await submit('#login-form');
  assert.ok(await poll("document.querySelector('[data-action=\"new-quick-order\"]')"),"mechanic has the quick OS action");
  await click('[data-action="new-quick-order"]');
  await fill('#quick-order-form [name="clientName"]',"Cliente do Mecânico UI");
  await fill('#quick-order-form [name="phone"]',"51988887777");
  await fill('#quick-order-form [name="vehicle"]',"Honda Civic");
  await fill('#quick-order-form [name="plate"]',"UIA1B23");
  await fill('#quick-order-form [name="year"]',"2022");
  await fill('#quick-order-form [name="mileage"]',"42000");
  await fill('#quick-order-form [name="issue"]',"Revisar freios");
  await submit('#quick-order-form');
  assert.ok(await poll("document.querySelector('[data-action=\"quick-order-created-open\"]')"),"mechanic quick OS creation returns a success action");
  await click('[data-action="quick-order-created-open"]');
  assert.ok(await poll("location.hash.startsWith('#/ordens/')"),"mechanic can open the created OS");
  const mechanicEditability = await devtools.evaluate("({ fields:[...document.querySelectorAll('#quick-order-edit-form input:not([type=hidden]),#quick-order-edit-form textarea')].map(e=>e.disabled),save:!!document.querySelector('#quick-order-edit-form button[type=submit]') })");
  assert.ok(mechanicEditability.fields.every(Boolean) && !mechanicEditability.save,"mechanic OS detail does not offer edits that backend rejects");
  await setHash("servicos");
  assert.ok(await devtools.evaluate("document.body.innerText.includes('Cliente do Mecânico UI')"),"new quick OS appears in the mechanic's assigned services");
  assert.ok(await click('[data-action="quick-order-status"][data-status="1"]'),"mechanic can mark the OS as waiting for parts");
  assert.ok(await poll("document.body.innerText.includes('Aguardando peças')"),"mechanic status update appears in the list");
  const quickId = await devtools.evaluate("JSON.parse(localStorage.getItem('giro-workshop-v1:ui-mechanic')||'null')?.orders.length || 0");
  assert.equal(quickId,0,"quick OS is stored server-side, not in the user's private local OS collection");
  await setHash("dashboard"); await click('[data-action="new-quick-order"]');
  await fill('#quick-order-form [name="clientName"]',"Cliente sem veículo UI");
  await fill('#quick-order-form [name="issue"]',"Dados incompletos para completar depois"); await submit('#quick-order-form');
  assert.ok(await poll("document.querySelector('[data-action=\"quick-order-created-continue\"]')"),"quick OS incomplete state still offers a continue action");
  await click('[data-action="quick-order-created-continue"]');
  assert.equal(await devtools.evaluate("document.querySelector('#modal').open"),false,"continue action closes the success dialog");
  await setHash("servicos");
  assert.ok(await devtools.evaluate("document.body.innerText.includes('Dados incompletos para completar depois')"),"incomplete quick OS remains available to its creator");
  await click('[data-action="logout"]');
  assert.ok(await poll("document.querySelector('#login-form')"),"mechanic logout returns to login");
  await fill('[name="email"]',user.email); await fill('[name="password"]',password); await submit('#login-form');
  assert.ok(await poll("document.querySelector('.topbar') && document.body.innerText.includes('Cliente do Mecânico UI')"),"administrator sees the mechanic's shared OS");
  await setHash("clientes");
  assert.ok(await poll("document.body.innerText.includes('Clientes cadastrados pelas OS') && document.body.innerText.includes('Cliente do Mecânico UI')"),"client and vehicle created from the mechanic's OS appear to the administrator");
  assert.ok(await poll("document.body.innerText.includes('Cliente sem veículo UI')"),"cliente da OS incompleta do mecânico aparece em Clientes para o administrador");
  await devtools.evaluate("location.hash='/veiculos'");
  assert.ok(await poll("location.hash==='#/clientes'"),"retired vehicles route redirects to the client list");
  await setHash("dashboard");
  await fill('#global-search-input',"UIA1B23");
  assert.ok(await poll("document.querySelector('#modal-search')"),"top global search opens the search dialog");
  assert.ok(await fill('#modal-search',"UIA1B23"),"global search field accepts the mechanic's vehicle plate");
  assert.ok(await poll("document.querySelector('#global-results')"),"global search results render");
  assert.ok(await devtools.evaluate("document.querySelector('#global-results').innerText.includes('UIA1B23')"),"global search finds server-backed mechanic OS");
  await click('[data-action="close-modal"]');
  await setHash("ordens");
  assert.ok(await devtools.evaluate("document.body.innerText.includes('Cliente do Mecânico UI')"),"administrator's order list includes the mechanic's OS");
  await click('[data-action="export-orders"]');
  assert.ok(await poll("document.querySelector('#toasts').innerText.includes('Exportação preparada')"),"order export action prepares a CSV");
  await setHash("dashboard"); await click('[data-action="view-list"]');
  assert.ok(await poll("document.querySelector('#quick-orders-results')?.innerText.includes('Cliente do Mecânico UI')"),"list view shows the shared OS");
  const mechanicOptions = await devtools.evaluate("[...document.querySelectorAll('#mechanic-filter option')].map(o=>[o.value,o.textContent])");
  const localMechanic = mechanicOptions.find(option => option[1] === "Mecânico Local");
  const serverMechanic = mechanicOptions.find(option => option[1] === "Mecânico UI");
  assert.ok(localMechanic && serverMechanic,"mechanic filter lists local and server team members");
  await fill('#mechanic-filter',localMechanic[0]);
  assert.equal(await devtools.evaluate("document.querySelector('#quick-orders-results').innerText.includes('UIA1B23')"),false,"mechanic filter removes OS assigned to another mechanic");
  await fill('#mechanic-filter',serverMechanic[0]);
  assert.equal(await devtools.evaluate("document.querySelector('#quick-orders-results').innerText.includes('UIA1B23')"),true,"mechanic filter returns OS assigned to the selected mechanic");
  await fill('#status-filter',"1");
  assert.equal(await devtools.evaluate("document.querySelector('#quick-orders-results').innerText.includes('UIA1B23')"),true,"status filter keeps matching server OS");
  await fill('#status-filter',"2");
  assert.equal(await devtools.evaluate("document.querySelector('#quick-orders-results').innerText.includes('UIA1B23')"),false,"status filter removes non-matching server OS");
  await click('[data-action="reset-filters"]');
  await setHash("dashboard"); await click('[data-action="view-board"]');
  await click('[data-action="toggle-kanban-card"]');
  assert.equal(await devtools.evaluate("document.querySelector('[data-action=\"toggle-kanban-card\"]').getAttribute('aria-expanded')"),"true","Kanban card expansion works");
  await click('[data-action="toggle-kanban-all"]');
  assert.ok(await poll("document.querySelector('[data-action=\"toggle-kanban-all\"]').innerText.includes('Recolher todos')"),"bulk expand cards works");
  await click('[data-action="toggle-kanban-all"]');
  assert.ok(await poll("document.querySelector('[data-action=\"toggle-kanban-all\"]').innerText.includes('Expandir todos')"),"bulk collapse cards works");
  assert.equal(await devtools.evaluate("document.querySelector('[data-card-key^=\"server:\"]').draggable"),true,"Kanban cards support drag and drop");
  const draggedOrderKey = await devtools.evaluate("document.querySelector('[data-card-key^=\"server:\"]').dataset.cardKey");
  const serverOrderId = draggedOrderKey.slice(7);
  await devtools.evaluate(`(()=>{const card=document.querySelector('[data-card-key="${draggedOrderKey}"]'),column=document.querySelector('[data-drop-status="2"]'),transfer=new DataTransfer();card.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:transfer}));column.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:transfer}));column.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer}));return true})()`);
  assert.ok(await poll(`(async()=>((await (await fetch('/api/orders')).json()).orders.find(order=>String(order.id)===${JSON.stringify(serverOrderId)})?.status===2))()`),"dropping a shared OS into Pronto persists the status");
  const serverOrderHash = `#/ordens/${serverOrderId}`;
  await setHash(`ordens/${serverOrderId}`);
  assert.ok(await devtools.evaluate("!!document.querySelector('[data-action=\"deliver-order\"]')"),"administrator has a delivery button for a server-backed ready OS");
  await click('[data-action="deliver-order"]'); await click('[data-action="confirm-delivery"]');
  assert.ok(await poll(`location.hash===${JSON.stringify(serverOrderHash)} && document.body.innerText.includes('Entregue')`),"administrator can deliver the ready shared OS from its detail page");
  assert.ok(await devtools.evaluate("!!document.querySelector('[data-action=\"reopen-order\"]')"),"owner can reopen a delivered OS from its detail page");
  await click('[data-action="reopen-order"]');
  assert.ok(await poll(`location.hash===${JSON.stringify(serverOrderHash)} && document.body.innerText.includes('Entrada')`),"reopen action restores the delivered OS to the active board");

  for (const width of [1440,1024,768,390]) {
    await devtools.send("Emulation.setDeviceMetricsOverride",{ width,height:900,deviceScaleFactor:1,mobile:width<600 });
    await setHash("dashboard");
    const sizes = await devtools.evaluate("({width:innerWidth,scroll:document.documentElement.scrollWidth})");
    assert.ok(sizes.scroll <= sizes.width + 2,`dashboard has no page-level horizontal overflow at ${width}px`);
    if (width === 390) {
      await click('[data-action="menu"]');
      assert.ok(await devtools.evaluate("document.querySelector('#layout').classList.contains('menu-visible')"),"mobile navigation menu opens");
      await click('.nav a[href="#/clientes"]');
      assert.ok(await poll("location.hash==='#/clientes'"),"mobile navigation link works");
    }
  }
  assert.deepEqual(devtools.exceptions,[],"no uncaught JavaScript exceptions during the tested flows");
  assert.ok(orderId,"an OS id was produced by the UI flow");

  await devtools.send("Page.navigate",{ url:`${baseUrl}/` });
  assert.ok(await poll("document.querySelector('#contactForm') && document.querySelector('#navToggle')"),"landing page and lead form load");
  await click('#navToggle');
  assert.equal(await devtools.evaluate("document.querySelector('#nav').classList.contains('open')"),true,"landing mobile navigation opens");
  const firstLandingLink = await devtools.evaluate("document.querySelector('#nav a[href^=\"#\"]')?.getAttribute('href')");
  assert.ok(firstLandingLink,"landing navigation contains a section link");
  await click(`#nav a[href="${firstLandingLink}"]`);
  assert.equal(await devtools.evaluate("document.querySelector('#nav').classList.contains('open')"),false,"landing navigation closes after choosing a section");
  const monthlyPrice = await devtools.evaluate("document.querySelector('.price-value')?.textContent");
  await click('.billing-option[data-billing="yearly"]');
  assert.notEqual(await devtools.evaluate("document.querySelector('.price-value')?.textContent"),monthlyPrice,"annual billing toggle updates prices");
  await click('.billing-option[data-billing="monthly"]');
  await click('.faq-q');
  assert.equal(await devtools.evaluate("document.querySelector('.faq-q').getAttribute('aria-expanded')"),"true","FAQ button expands its answer");
  await submit('#contactForm');
  assert.equal(await devtools.evaluate("document.querySelector('#formMsg').hidden"),false,"empty contact form displays validation feedback");
  assert.deepEqual(devtools.exceptions,[],"app and landing navigation produce no uncaught JavaScript exceptions");
  const source=fs.readFileSync(path.join(__dirname,"..","app","app.js"),"utf8"), cases=new Set([...source.matchAll(/case ['\"]([^'\"]+)['\"]:/g)].map(match => match[1]));
  assert.deepEqual([...clickedActions].filter(action => !cases.has(action)),[],"every clicked app action maps to an event handler");
  t.diagnostic(`Exercised ${clickedActions.size} distinct app button actions in Edge.`);
});
