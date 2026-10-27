"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const chromePath = process.env.GIRO_CHROME_PATH || "/opt/google/chrome/chrome";
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

class DevTools {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 0;
    this.pending = new Map();
    this.exceptions = [];
    this.consoleErrors = [];
    this.requests = [];
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once:true });
      this.socket.addEventListener("error", reject, { once:true });
    });
    this.socket.addEventListener("message", event => {
      const message = JSON.parse(event.data);
      if (message.method === "Runtime.exceptionThrown") {
        const details = message.params.exceptionDetails;
        this.exceptions.push(details.exception?.description || details.text);
      }
      if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
        this.consoleErrors.push(message.params.args.map(arg => arg.description || arg.value || "").join(" "));
      }
      if (message.method === "Network.requestWillBeSent") this.requests.push(message.params.request);
      const pending = this.pending.get(message.id);
      if (pending) {
        this.pending.delete(message.id); clearTimeout(pending.timer);
        if (message.error) pending.reject(new Error(message.error.message)); else pending.resolve(message.result);
      }
    });
    this.socket.addEventListener("close", () => {
      for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error("Chrome CDP connection closed")); }
      this.pending.clear();
    });
  }

  async send(method, params = {}) {
    await this.ready;
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 10000);
      this.pending.set(id, { resolve,reject,timer });
      this.socket.send(JSON.stringify({ id,method,params }));
    });
  }

  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", { expression,returnByValue:true,awaitPromise:true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result?.value;
  }

  close() { this.socket.close(); }
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise(resolve => child.once("exit", resolve));
  child.kill("SIGTERM");
  await Promise.race([exited, delay(3000)]);
  if (child.exitCode === null && child.signalCode === null) { child.kill("SIGKILL"); await exited; }
}

test("inventory and order materials work in Chrome with isolated data and responsive layouts", {
  timeout:180000,
  skip:!fs.existsSync(chromePath) || typeof WebSocket === "undefined"
}, async t => {
  const root = path.join(__dirname, "..");
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "giro-inventory-ui-data-"));
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "giro-inventory-ui-chrome-"));
  const artifactRoot = fs.existsSync("/tmp/opencode") ? "/tmp/opencode" : os.tmpdir();
  const screenshots = fs.mkdtempSync(path.join(artifactRoot, "giro-inventory-ui-"));
  const port = await freePort();
  let debugPort = await freePort();
  while (debugPort === port) debugPort = await freePort();
  const password = "InventoryUITest-2026!";
  const fixtureUser = (id, role, name) => {
    const salt = crypto.randomBytes(16).toString("hex");
    return { id,role,name,email:`${id}@example.invalid`,passwordHash:`${salt}:${crypto.scryptSync(password, salt, 64).toString("hex")}`,workshop:"Oficina Inventory UI",workshopId:"inventory-ui-workshop",status:"ACTIVE",active:true };
  };
  const owner = fixtureUser("inventory-ui-owner", "OWNER", "Owner UI");
  const mechanic = fixtureUser("inventory-ui-mechanic", "MECHANIC", "Mechanic UI");
  fs.writeFileSync(path.join(dataDir, "users.json"), JSON.stringify([owner,mechanic]));
  for (const file of ["service-orders.json","workshop-records.json","invitation-tokens.json","password-reset-tokens.json","leads.json"]) fs.writeFileSync(path.join(dataDir, file), "[]");

  let server, chrome, devtools, completed = false, processError = "", serverLog = "";
  const screenshot = async name => {
    await delay(250);
    const image = await devtools.send("Page.captureScreenshot", { format:"png",captureBeyondViewport:false });
    const file = path.join(screenshots, `${name}.png`);
    fs.writeFileSync(file, Buffer.from(image.data, "base64"));
    return file;
  };
  t.after(async () => {
    if (devtools && !completed) {
      try {
        t.diagnostic(`Failure screenshot: ${await screenshot("failure")}`);
        t.diagnostic(await devtools.evaluate("document.body.innerText.slice(-5000)"));
      } catch (_) {}
    }
    if (devtools) {
      try { await devtools.send("Browser.close"); } catch (_) {}
      devtools.close();
    }
    await Promise.all([stopProcess(chrome),stopProcess(server)]);
    fs.rmSync(dataDir, { recursive:true,force:true });
    fs.rmSync(profileDir, { recursive:true,force:true });
    t.diagnostic(`Screenshots retained in ${screenshots}`);
    if (!completed && serverLog) t.diagnostic(`Isolated server output: ${serverLog}`);
  });

  server = spawn(process.execPath, [path.join(root, "server.js")], {
    cwd:root,
    env:{ ...process.env,PORT:String(port),GIRO_DATA_DIR:dataDir,SMTP_HOST:"",SMTP_FROM:"" },
    stdio:["ignore","pipe","pipe"]
  });
  server.on("error", error => { processError = error.message; });
  for (const stream of [server.stdout,server.stderr]) stream.on("data", data => { serverLog = (serverLog + data).slice(-6000); });
  chrome = spawn(chromePath, ["--headless=new","--no-first-run","--no-default-browser-check","--disable-gpu","--disable-dev-shm-usage","--disable-background-networking","--no-sandbox","--remote-debugging-address=127.0.0.1",`--remote-debugging-port=${debugPort}`,`--user-data-dir=${profileDir}`,"about:blank"], { stdio:"ignore" });
  chrome.on("error", error => { processError = error.message; });
  const baseUrl = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (processError) throw new Error(processError);
    if (server.exitCode !== null || chrome.exitCode !== null) throw new Error(`Test process exited early: ${serverLog}`);
    try {
      const health = await fetch(`${baseUrl}/api/health`, { signal:AbortSignal.timeout(1000) });
      const browser = await fetch(`http://127.0.0.1:${debugPort}/json/version`, { signal:AbortSignal.timeout(1000) });
      if (health.ok && browser.ok) { ready = true; break; }
    } catch (_) {}
    await delay(100);
  }
  assert.ok(ready, "isolated backend and Chrome become ready");
  const targetResponse = await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method:"PUT" });
  assert.equal(targetResponse.status, 200);
  devtools = new DevTools((await targetResponse.json()).webSocketDebuggerUrl);
  await devtools.send("Page.enable"); await devtools.send("Runtime.enable"); await devtools.send("Network.enable");
  const viewport = async width => {
    await devtools.send("Emulation.setDeviceMetricsOverride", { width,height:1000,deviceScaleFactor:1,mobile:width < 1000 });
    await devtools.send("Emulation.setTouchEmulationEnabled", { enabled:width < 1000 });
    await delay(150);
  };
  await viewport(1440);
  await devtools.send("Page.navigate", { url:`${baseUrl}/app/#/login` });

  const wait = async (expression, message) => {
    for (let attempt = 0; attempt < 120; attempt++) {
      if (await devtools.evaluate(`Boolean(${expression})`)) return;
      await delay(100);
    }
    assert.fail(`Timed out: ${message}`);
  };
  const fill = async (selector, value) => {
    assert.ok(await devtools.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e || e.disabled) return false; e.value = ${JSON.stringify(value)}; e.dispatchEvent(new Event('input', { bubbles:true })); e.dispatchEvent(new Event('change', { bubbles:true })); return true; })()`), `fill enabled control ${selector}`);
  };
  const click = async selector => {
    let point;
    for (let attempt = 0; attempt < 50; attempt++) {
      point = await devtools.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e || e.disabled) return null; e.scrollIntoView({ block:'center',inline:'center' }); const r = e.getBoundingClientRect(); if (!r.width || !r.height) return null; const x = r.x + r.width / 2, y = r.y + r.height / 2; if (!e.contains(document.elementFromPoint(x,y))) return null; return { x,y }; })()`);
      if (point) break;
      await delay(100);
    }
    assert.ok(point, `visible, unobstructed clickable control ${selector}`);
    await devtools.send("Input.dispatchMouseEvent", { type:"mousePressed",button:"left",clickCount:1,...point });
    await devtools.send("Input.dispatchMouseEvent", { type:"mouseReleased",button:"left",clickCount:1,...point });
  };
  const submit = async form => {
    assert.ok(await devtools.evaluate(`document.querySelector(${JSON.stringify(form)})?.checkValidity()`), `valid form ${form}`);
    await click(`button[type="submit"][form="${form.slice(1)}"], ${form} button[type="submit"]`);
  };
  const api = async endpoint => {
    const result = await devtools.evaluate(`fetch(${JSON.stringify(endpoint)}, { credentials:'same-origin' }).then(async response => ({ status:response.status,data:await response.json() }))`);
    assert.equal(result.status, 200, `authenticated GET ${endpoint}`);
    return result.data;
  };
  const secondLogin = await fetch(`${baseUrl}/api/auth/login`, { method:"POST",headers:{ "Content-Type":"application/json" },body:JSON.stringify({ email:owner.email,password }) });
  assert.equal(secondLogin.status, 200, "independent owner API session logs in");
  const secondCookie = secondLogin.headers.get("set-cookie").split(";")[0];
  const externalMutation = async (endpoint, body, method = "POST") => {
    const response = await fetch(`${baseUrl}${endpoint}`, { method,headers:{ "Content-Type":"application/json",Cookie:secondCookie },body:JSON.stringify(body) });
    const data = await response.json();
    assert.ok(response.ok, `second-session ${method} ${endpoint}: ${JSON.stringify(data)}`);
    return data;
  };
  const navigate = async route => {
    await devtools.evaluate(`location.hash = ${JSON.stringify(`/${route}`)}`);
    await wait(`location.hash === ${JSON.stringify(`#/${route}`)} && document.querySelector('#main')`, `navigate to ${route}`);
  };
  const login = async user => {
    await wait("document.querySelector('#login-form')", "login form");
    await fill('#login-form [name="email"]', user.email); await fill('#login-form [name="password"]', password);
    await submit("#login-form");
    await wait("document.querySelector('.topbar')", `${user.role} app shell`);
  };
  const logout = async () => {
    await click('[data-action="logout"]');
    await wait("document.querySelector('#login-form')", "logout clears session");
  };
  const noOverflow = async label => {
    const layout = await devtools.evaluate(`({ width:innerWidth,scroll:document.documentElement.scrollWidth,body:document.body.scrollWidth,outliers:[...document.querySelectorAll('#main *')].filter(e => { const r=e.getBoundingClientRect(); return r.width && (r.right > innerWidth + 1 || r.left < -1) && !e.closest('.table-wrap'); }).slice(0,8).map(e => ({ tag:e.tagName,class:e.className,width:e.getBoundingClientRect().width })) })`);
    assert.ok(layout.scroll <= layout.width + 1 && layout.body <= layout.width + 1, `${label}: no document overflow ${JSON.stringify(layout)}`);
    const dialog = await devtools.evaluate("document.querySelector('#modal').open ? { width:document.querySelector('#modal').clientWidth,scroll:document.querySelector('#modal').scrollWidth } : null");
    if (dialog) assert.ok(dialog.scroll <= dialog.width + 1, `${label}: no horizontal dialog overflow ${JSON.stringify(dialog)}`);
    const inventoryLayout = await devtools.evaluate("innerWidth <= 1000 && document.querySelector('#inventory-results') ? { width:document.querySelector('#inventory-results').clientWidth,scroll:document.querySelector('#inventory-results').scrollWidth } : null");
    if (inventoryLayout) assert.ok(inventoryLayout.scroll <= inventoryLayout.width + 1, `${label}: stock actions do not require sideways scrolling ${JSON.stringify(inventoryLayout)}`);
  };

  await login(owner);
  assert.equal(await devtools.evaluate("document.querySelectorAll('.nav a[href=\"#/estoque\"]').length"), 1, "owner has exactly one inventory menu link");
  await click('.nav a[href="#/estoque"]');
  await wait("document.querySelector('#inventory-search')", "inventory finishes loading");
  assert.ok(await devtools.evaluate("document.body.innerText.includes('Seu cat\u00e1logo come\u00e7a aqui')"), "empty stock has useful instructions without demo items");
  await click('[data-action="inventory-new"]');
  assert.equal(await devtools.evaluate("document.querySelector('#inventory-item-form [name=tracked]').checked"), true);
  await fill('#inventory-item-form [name="name"]', "Filtro UI <estoque>");
  assert.equal(await devtools.evaluate("document.querySelector('#inventory-item-form [name=sku]')"), null, "creation has no SKU field");
  assert.deepEqual(await devtools.evaluate("(() => { const field = document.querySelector('#inventory-item-form [name=initialQuantity]'); return { value:field.value,min:field.min,step:field.step }; })()"), { value:"0",min:"0",step:"0.001" });
  await fill('#inventory-item-form [name="category"]', "Filtros");
  await fill('#inventory-item-form [name="minimumQuantity"]', "2");
  await fill('#inventory-item-form [name="costPrice"]', "25.50");
  await devtools.send("Network.emulateNetworkConditions", { offline:false,latency:250,downloadThroughput:-1,uploadThroughput:-1 });
  await submit("#inventory-item-form");
  await wait("document.querySelector('#inventory-item-form')?.dataset.sending === 'true'", "item form has an in-flight submit state");
  assert.equal(await devtools.evaluate("document.querySelector('button[form=inventory-item-form]').disabled"), true, "submit is disabled during the request");
  await devtools.evaluate("document.querySelector('#inventory-item-form').requestSubmit()");
  await wait("!document.querySelector('#modal').open && document.querySelector('.inventory-table')", "stock item creation");
  await devtools.send("Network.emulateNetworkConditions", { offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1 });
  assert.equal(devtools.requests.filter(request => request.method === "POST" && request.url.endsWith("/api/inventory/items")).length, 1, "duplicate submit sends only one item creation request");
  let inventory = await api("/api/inventory");
  const itemId = inventory.items[0].id;
  assert.equal(inventory.items[0].quantity, 0); assert.equal(inventory.items[0].costPrice, 25.5);
  assert.equal(await devtools.evaluate("document.querySelectorAll('estoque').length"), 0, "item name is escaped, not parsed as HTML");
  assert.ok(await devtools.evaluate("document.querySelector('#inventory-results').innerText.includes('Registre uma entrada')"));
  await click(`[data-action="inventory-entry"][data-id="${itemId}"]`);
  await fill('#inventory-movement-form [name="quantity"]', "10");
  await fill('#inventory-movement-form [name="reason"]', "Recebimento UI");
  await submit("#inventory-movement-form");
  await wait("!document.querySelector('#modal').open && document.querySelector('#inventory-search')", "entry completes and stock refreshes");
  const balance = async expected => {
    const snapshot = await api("/api/inventory");
    assert.equal(snapshot.items.find(item => item.id === itemId).quantity, expected, `persisted balance is ${expected}`);
    return snapshot;
  };
  await balance(10);

  await click('[data-action="inventory-new"]');
  await fill('#inventory-item-form [name="name"]', "Reparos");
  await fill('#inventory-item-form [name="initialQuantity"]', "10");
  await devtools.evaluate(`(() => {
    const originalFetch = window.fetch;
    window.initialStockResponseLoss = { originalFetch,requests:[],lost:false };
    window.fetch = async (url,options) => {
      if (url === '/api/inventory/items' && options?.method === 'POST') {
        window.initialStockResponseLoss.requests.push(JSON.parse(options.body));
        const response = await originalFetch(url,options);
        if (!window.initialStockResponseLoss.lost && response.ok) {
          await response.clone().json(); window.initialStockResponseLoss.lost = true;
          throw new TypeError('Simulated initial-stock response loss after commit');
        }
        return response;
      }
      return originalFetch(url,options);
    };
  })()`);
  await devtools.send("Network.emulateNetworkConditions", { offline:false,latency:250,downloadThroughput:-1,uploadThroughput:-1 });
  await submit("#inventory-item-form");
  await wait("document.querySelector('#inventory-item-form')?.dataset.sending === 'true'", "initial stock submit is in flight");
  await devtools.evaluate("document.querySelector('#inventory-item-form').requestSubmit()");
  await wait("document.querySelector('#inventory-item-form')?.dataset.outcomeUnknown === 'true'", "lost initial-stock response allows identical retry");
  assert.equal(await devtools.evaluate("document.querySelector('#inventory-item-form [name=initialQuantity]').disabled"), true);
  assert.equal((await devtools.evaluate("window.initialStockResponseLoss.requests")).length, 1, "guard blocks duplicate initial-stock submission");
  await devtools.send("Network.emulateNetworkConditions", { offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1 });
  await submit("#inventory-item-form");
  await wait("!document.querySelector('#modal').open && document.querySelector('#inventory-search')", "initial-stock retry completes");
  const initialStockRequests = await devtools.evaluate("window.initialStockResponseLoss.requests");
  assert.equal(initialStockRequests.length, 2);
  assert.deepEqual(initialStockRequests[1], initialStockRequests[0], "initial-stock retry preserves payload and operationId");
  assert.equal(initialStockRequests[0].initialQuantity, 10);
  assert.equal(Object.hasOwn(initialStockRequests[0], "sku"), false);
  await devtools.evaluate("window.fetch = window.initialStockResponseLoss.originalFetch");
  inventory = await api("/api/inventory");
  const repairs = inventory.items.filter(item => item.name === "Reparos");
  assert.equal(repairs.length, 1, "retry creates only one Reparos item");
  assert.equal(repairs[0].quantity, 10);
  const initialMovements = inventory.movements.filter(movement => movement.itemId === repairs[0].id);
  assert.equal(initialMovements.length, 1, "initial stock creates a single ledger entry");
  assert.equal(initialMovements[0].type, "ENTRY");
  assert.equal(initialMovements[0].reason, "Estoque inicial");
  assert.equal(initialMovements[0].quantity, 10);
  assert.equal(initialMovements[0].balanceAfter, 10);
  await wait("[...document.querySelectorAll('#inventory-results tbody tr')].some(row => row.innerText.includes('Reparos') && row.querySelector('[data-label=Saldo]').innerText.includes('10')) && document.querySelector('.inventory-history').innerText.includes('Estoque inicial')", "initial balance and entry appear in the UI");
  assert.ok(await devtools.evaluate("document.querySelector('#toasts').innerText.includes('Item cadastrado.') && !document.querySelector('#toasts').innerText.includes('primeira entrada')"));
  await externalMutation(`/api/inventory/items/${repairs[0].id}`, { sku:"PERSISTED-REPAIR" }, "PATCH");
  await click(`[data-action="inventory-edit"][data-id="${repairs[0].id}"]`);
  assert.equal(await devtools.evaluate("document.querySelector('#inventory-item-form [name=sku], #inventory-item-form [name=initialQuantity]')"), null, "editing has neither SKU nor initial quantity");
  assert.equal(await devtools.evaluate("document.querySelector('#inventory-item-form input[readonly]').value"), "10");
  assert.ok(await devtools.evaluate("document.querySelector('#modal').innerText.includes('Use Entrada ou Sa\u00edda para ajustar o saldo')"));
  await fill('#inventory-item-form [name="category"]', "Materiais");
  await submit("#inventory-item-form");
  await wait("!document.querySelector('#modal').open && document.querySelector('#inventory-search')", "metadata edit completes");
  const repairsPatch = devtools.requests.findLast(request => request.method === "PATCH" && request.url.endsWith(`/api/inventory/items/${repairs[0].id}`));
  const repairsPatchBody = JSON.parse(repairsPatch.postData);
  assert.equal(Object.hasOwn(repairsPatchBody, "sku"), false, "UI PATCH does not clear persisted SKU");
  assert.equal(Object.hasOwn(repairsPatchBody, "initialQuantity"), false, "UI PATCH cannot overwrite balance");
  const editedRepairs = (await api("/api/inventory")).items.find(item => item.id === repairs[0].id);
  assert.equal(editedRepairs.sku, "PERSISTED-REPAIR");
  assert.equal(editedRepairs.quantity, 10);

  await click('[data-action="inventory-new"]');
  await fill('#inventory-item-form [name="name"]', "Abracadeira catalogo");
  await fill('#inventory-item-form [name="initialQuantity"]', "10");
  await click('#inventory-item-form [name="tracked"]');
  assert.deepEqual(await devtools.evaluate("(() => { const field = document.querySelector('#inventory-item-form [name=initialQuantity]'); return { value:field.value,disabled:field.disabled }; })()"), { value:"0",disabled:true }, "unchecking tracking disables and clears initial stock");
  await submit("#inventory-item-form");
  await wait("!document.querySelector('#modal').open && document.querySelector('#inventory-search')", "untracked catalogue creation");
  const cataloguePost = devtools.requests.findLast(request => request.method === "POST" && request.url.endsWith("/api/inventory/items"));
  assert.equal(JSON.parse(cataloguePost.postData).initialQuantity, 0, "untracked creation sends zero initial stock");
  assert.ok(await devtools.evaluate("!document.querySelector('#inventory-results').innerText.includes('SKU') && !document.querySelector('#inventory-results').innerText.includes('PERSISTED-REPAIR') && !document.querySelector('#inventory-search').placeholder.includes('SKU')"));
  await fill("#inventory-search", "PERSISTED-REPAIR");
  assert.equal(await devtools.evaluate("document.querySelectorAll('#inventory-results tbody tr').length"), 0, "search does not match persisted SKU");
  await fill("#inventory-search", "Filtro UI");
  assert.equal(await devtools.evaluate("document.querySelectorAll('#inventory-results tbody tr').length"), 1, "search filters by name");
  await fill("#inventory-search", "Filtros");
  assert.equal(await devtools.evaluate("document.querySelectorAll('#inventory-results tbody tr').length"), 1, "search filters by category");
  await fill("#inventory-search", "absent item");
  assert.ok(await devtools.evaluate("document.querySelector('#inventory-results').innerText.includes('Nenhum item')"));
  await fill("#inventory-search", ""); await fill("#inventory-filter", "catalog");
  assert.ok(await devtools.evaluate("document.querySelector('#inventory-results').innerText.includes('Abracadeira catalogo') && !document.querySelector('#inventory-results').innerText.includes('Filtro UI') && !document.querySelector('#inventory-results').innerText.includes('Reparos')"));
  await fill("#inventory-filter", "low");
  assert.equal(await devtools.evaluate("document.querySelectorAll('#inventory-results tbody tr').length"), 0, "balance above minimum is not low stock");
  await fill("#inventory-filter", "active");

  await navigate("ordens");
  await wait(`document.querySelector('.nav') && document.body.innerText.includes('Ordens')`, "orders page");
  // The optional assignment must come from the remote team, not legacy local IDs.
  await wait(`fetch('/api/team').then(r => r.json()).then(data => data.users.some(user => user.id === ${JSON.stringify(mechanic.id)}))`, "mechanic fixture is available");
  await click('[data-action="new-order"]');
  await wait(`document.querySelector('#quick-order-form [name=assignedUserId] option[value=${JSON.stringify(mechanic.id)}]')`, "remote mechanic choice is loaded");
  const orderFields = { clientName:"Cliente Inventory UI",phone:"51999998877",vehicleBrand:"Fiat",vehicleModel:"Argo",plate:"UIA1B23",year:"2022",mileage:"42000",issue:"Troca do filtro" };
  for (const [name,value] of Object.entries(orderFields)) await fill(`#quick-order-form [name="${name}"]`, value);
  await fill('#quick-order-form [name="assignedUserId"]', mechanic.id);
  const quickOperationId = await devtools.evaluate("document.querySelector('#quick-order-form').dataset.operationId");
  await devtools.evaluate(`(() => {
    const originalFetch = window.fetch;
    window.quickResponseLoss = { originalFetch,requests:[],lost:false,committedOrderId:null };
    window.fetch = async (url,options) => {
      if (url === '/api/orders/quick' && options?.method === 'POST') {
        window.quickResponseLoss.requests.push(JSON.parse(options.body));
        const response = await originalFetch(url,options);
        if (!window.quickResponseLoss.lost && response.ok) {
          const result = await response.clone().json();
          window.quickResponseLoss.committedOrderId = result.order.id;
          window.quickResponseLoss.lost = true;
          throw new TypeError('Simulated quick-order response loss after commit');
        }
        return response;
      }
      return originalFetch(url,options);
    };
  })()`);
  await submit("#quick-order-form");
  await wait("document.querySelector('#quick-order-form')?.dataset.outcomeUnknown === 'true' && document.querySelector('#quick-order-form [data-quick-error]')?.innerText.includes('Envio n\u00e3o confirmado')", "lost quick-order response locks the form after server commit");
  assert.equal(await devtools.evaluate("[...document.querySelectorAll('#quick-order-form input,#quick-order-form select,#quick-order-form textarea')].every(field => field.disabled)"), true, "all quick-order inputs are locked after an unknown outcome");
  assert.equal(await devtools.evaluate("document.querySelector('button[form=quick-order-form][type=submit]').disabled"), false, "quick-order retry remains enabled");
  assert.equal(await devtools.evaluate("[...document.querySelectorAll('#modal .modal-header button,#modal .modal-footer [data-action=close-modal]')].every(button => button.disabled)"), true, "quick-order close and cancel controls are locked");
  await devtools.evaluate("document.querySelector('#modal .modal-header [data-action=close-modal]').click(); document.querySelector('#modal .modal-footer [data-action=close-modal]').click()");
  await devtools.send("Input.dispatchKeyEvent", { type:"keyDown",key:"Escape",code:"Escape",windowsVirtualKeyCode:27 });
  await devtools.send("Input.dispatchKeyEvent", { type:"keyUp",key:"Escape",code:"Escape",windowsVirtualKeyCode:27 });
  await devtools.send("Input.dispatchMouseEvent", { type:"mousePressed",button:"left",clickCount:1,x:1,y:1 });
  await devtools.send("Input.dispatchMouseEvent", { type:"mouseReleased",button:"left",clickCount:1,x:1,y:1 });
  assert.equal(await devtools.evaluate("document.querySelector('#modal').open && document.querySelector('#quick-order-form').dataset.outcomeUnknown === 'true'"), true, "unknown quick creation cannot be abandoned by close, cancel, Escape or backdrop");
  const committedQuickId = await devtools.evaluate("window.quickResponseLoss.committedOrderId");
  const ordersBeforeRetry = (await api("/api/orders")).orders;
  assert.equal(ordersBeforeRetry.length, 1, "one order was already committed before retry");
  assert.equal(ordersBeforeRetry[0].id, committedQuickId);
  assert.equal(await devtools.evaluate("document.querySelector('#quick-order-form').dataset.operationId"), quickOperationId, "unknown quick creation retains its operationId");
  // Disabled fields are not authoritative: retry must use the captured payload.
  await devtools.evaluate("document.querySelector('#quick-order-form [name=clientName]').value = 'Must not replace original client'; document.querySelector('#quick-order-form [name=plate]').value = 'UIZ9Z99'");
  await submit("#quick-order-form");
  await wait("document.querySelector('[data-action=quick-order-created-open]')", "admin creates a remote quick order");
  const quickRetryRequests = await devtools.evaluate("window.quickResponseLoss.requests");
  assert.equal(quickRetryRequests.length, 2); assert.deepEqual(quickRetryRequests[1], quickRetryRequests[0], "quick-order retry sends exactly the same payload");
  assert.equal(quickRetryRequests[0].operationId, quickOperationId);
  const ordersAfterRetry = (await api("/api/orders")).orders;
  assert.equal(ordersAfterRetry.length, 1, "identical quick-order retry creates no duplicate order");
  assert.equal(ordersAfterRetry[0].id, committedQuickId);
  assert.equal(ordersAfterRetry[0].clientName, orderFields.clientName);
  assert.equal(ordersAfterRetry[0].plate, orderFields.plate);
  await devtools.evaluate("window.fetch = window.quickResponseLoss.originalFetch");
  const orderId = await devtools.evaluate("document.querySelector('[data-action=quick-order-created-open]').dataset.id");
  assert.equal(orderId, String(committedQuickId), "success action opens the originally committed order");
  await click('[data-action="quick-order-created-open"]');
  await wait("document.querySelector('[data-action=material-new]') && document.body.innerText.includes('Nenhum material utilizado')", "remote order material section");
  const createdOrder = (await api("/api/orders")).orders.find(order => String(order.id) === orderId);
  assert.equal(createdOrder.assignedUserId, mechanic.id); assert.equal(createdOrder.vehicleBrand, "Fiat");
  assert.equal(createdOrder.vehicleModel, "Argo"); assert.equal(createdOrder.year, 2022); assert.equal(createdOrder.mileage, 42000);
  await externalMutation("/api/orders/quick", { clientName:"Cliente extra UI",phone:"51999997766",vehicleBrand:"Ford",vehicleModel:"Focus",plate:"UIB1C24",year:2021,mileage:50000,issue:"Veiculo fora do cache parcial" });
  const registrationOrder = (await externalMutation("/api/orders/quick", { clientName:"Cliente registro UI",vehicleBrand:"Chevrolet",vehicleModel:"Onix",plate:"UIC1D25",issue:"Cadastro incompleto para registrar veiculo" })).order;
  await navigate("clientes");
  await wait("document.querySelector('#workshop-client-results')?.innerText.includes('Cliente extra UI')", "quick-order append does not mark the vehicle catalogue complete");
  assert.ok(devtools.requests.some(request => request.url.endsWith("/api/workshop/vehicles")), "client page loads the complete remote catalogue");
  await navigate(`ordens/${orderId}`);
  const orderReady = async () => wait(`location.hash === '#/ordens/${orderId}' && document.querySelector('#quick-order-edit-form')?.dataset.id === '${orderId}' && document.querySelector('[data-action=material-new]')?.dataset.id === '${orderId}' && !document.body.innerText.includes('Carregando materiais') && !document.querySelector('#modal').open`, "correct remote order is loaded and ready for material actions");
  await orderReady();

  const stockUse = async quantity => {
    await orderReady();
    await click('[data-action="material-new"]');
    await wait(`document.querySelector('#material-form [name=itemId] option[value="${itemId}"]')`, "stock catalogue preloaded for detailed order");
    await fill('#material-form [name="itemId"]', String(itemId));
    await fill('#material-form [name="quantity"]', String(quantity));
    await submit("#material-form");
    await wait("!document.querySelector('#modal').open", "stock use finishes");
    await orderReady();
  };
  await devtools.evaluate(`(() => {
    const originalFetch = window.fetch;
    window.inventoryResponseLoss = { requests:[],lost:false };
    window.fetch = async (url,options) => {
      if (url === '/api/orders/${orderId}/materials' && options?.method === 'POST') {
        window.inventoryResponseLoss.requests.push(JSON.parse(options.body));
        if (window.inventoryResponseLoss.rejectNext) {
          window.inventoryResponseLoss.rejectNext = false;
          return new Response(JSON.stringify({ error:'Rejeicao HTTP UI: revise o nome' }), { status:400,headers:{ 'Content-Type':'application/json' } });
        }
        const response = await originalFetch(url,options);
        if (!window.inventoryResponseLoss.lost && response.ok) {
          await response.clone().json(); window.inventoryResponseLoss.lost = true;
          throw new TypeError('Simulated response loss after commit');
        }
        return response;
      }
      return originalFetch(url,options);
    };
  })()`);
  await click('[data-action="material-new"]');
  await wait(`document.querySelector('#material-form [name=itemId] option[value="${itemId}"]')`, "stock choices are loaded before simulating response loss");
  await fill('#material-form [name="itemId"]', String(itemId)); await fill('#material-form [name="quantity"]', "1");
  await submit("#material-form");
  await wait("document.querySelector('#material-form')?.dataset.outcomeUnknown === 'true' && document.querySelector('#material-form [data-inventory-error]').innerText.includes('Envio n\u00e3o confirmado')", "lost response locks an outcome-unknown form");
  assert.equal(await devtools.evaluate("document.querySelector('#material-form [name=quantity]').disabled"), true);
  assert.equal(await devtools.evaluate("document.querySelector('#material-form [name=itemId]').disabled"), true);
  assert.equal(await devtools.evaluate("document.querySelector('button[form=material-form][type=submit]').disabled"), false, "same-operation retry stays enabled");
  await devtools.evaluate("document.querySelector('#modal [data-action=close-modal]').click()");
  await devtools.send("Input.dispatchKeyEvent", { type:"keyDown",key:"Escape",code:"Escape",windowsVirtualKeyCode:27 });
  await devtools.send("Input.dispatchKeyEvent", { type:"keyUp",key:"Escape",code:"Escape",windowsVirtualKeyCode:27 });
  assert.equal(await devtools.evaluate("document.querySelector('#modal').open"), true, "unknown outcome cannot be abandoned by close or Escape");
  await balance(9);
  // Even a programmatic value change cannot replace the captured request body.
  await devtools.evaluate("document.querySelector('#material-form [name=quantity]').value = '2'; window.dispatchEvent(new Event('focus'))");
  await submit("#material-form");
  await wait("!document.querySelector('#modal').open", "identical retry recovers the committed operation");
  await orderReady(); await balance(9);
  const retryRequests = await devtools.evaluate("window.inventoryResponseLoss.requests");
  assert.equal(retryRequests.length, 2); assert.deepEqual(retryRequests[1], retryRequests[0], "retry keeps the original payload and operationId");
  let materials = (await api(`/api/orders/${orderId}/materials`)).materials;
  assert.equal(materials.length, 1); assert.equal(materials[0].status, "CONSUMED"); assert.equal(materials[0].userName, owner.name);
  await click(`[data-action="material-reverse"][data-material-id="${materials[0].id}"]`);
  await fill('#material-reverse-form [name="reason"]', "Devolucao UI"); await submit("#material-reverse-form");
  await wait("!document.querySelector('#modal').open && document.querySelector('.material-reversed')", "reversal remains visible");
  await balance(10);

  await orderReady(); await click('[data-action="material-new"]'); await fill("#material-source", "ORDER_PURCHASE");
  await fill('#material-form [name="name"]', "Compra ainda nao validada UI");
  await fill('#material-form [name="unit"]', "UN"); await fill('#material-form [name="quantity"]', "1");
  const purchaseOperation = await devtools.evaluate("document.querySelector('#material-form').dataset.operationId");
  await devtools.evaluate("window.inventoryResponseLoss.rejectNext = true");
  await submit("#material-form");
  await wait("document.querySelector('#material-form [data-inventory-error]')?.innerText.includes('Rejeicao HTTP UI')", "definite HTTP rejection permits correction");
  assert.equal(await devtools.evaluate("document.querySelector('#material-form [name=name]').disabled"), false);
  assert.equal(await devtools.evaluate("document.querySelector('#modal [data-action=close-modal]').disabled"), false);
  assert.equal(await devtools.evaluate("document.querySelector('#material-form').dataset.outcomeUnknown"), "false");
  await fill('#material-form [name="name"]', "Filtro comprado para esta OS");
  assert.equal(await devtools.evaluate("document.querySelector('#material-form').dataset.operationId"), purchaseOperation);
  await submit("#material-form"); await wait("!document.querySelector('#modal').open", "order-specific purchase completes");
  inventory = await balance(10);
  assert.deepEqual(inventory.movements.filter(movement => movement.itemId === itemId).map(movement => movement.type).sort(), ["CONSUMPTION","ENTRY","REVERSAL"], "purchase does not create a stock movement for Filtro");
  assert.ok(await devtools.evaluate("document.querySelector('.inventory-history').innerText.includes('Compra para esta OS')"));

  await orderReady();
  await fill('#quick-order-edit-form [name="issue"]', "Rascunho de problema UI");
  await fill('#quick-order-edit-form [name="clientName"]', "Cliente editado UI");
  await devtools.evaluate("window.formBeforeRefresh = document.querySelector('#quick-order-edit-form')");
  const externalMaterial = (await externalMutation(`/api/orders/${orderId}/materials`, { source:"ORDER_PURCHASE",name:"Material externo UI",unit:"UN",quantity:1,operationId:crypto.randomUUID() })).material;
  await externalMutation(`/api/orders/${orderId}`, { status:1,vehicleBrand:"Ford",issue:"Problema atualizado por outra sessao" }, "PATCH");
  await devtools.evaluate("window.dispatchEvent(new Event('focus'))");
  await wait("document.querySelector('.inventory-history')?.innerText.includes('Material externo UI') && document.querySelector('#quick-order-edit-form') !== window.formBeforeRefresh", "focus reconciles publicOrder materials despite previously loaded cache");
  assert.equal(await devtools.evaluate("document.querySelector('#quick-order-edit-form [name=issue]').value"), "Rascunho de problema UI", "dirty problem survives background render");
  assert.equal(await devtools.evaluate("document.querySelector('#quick-order-edit-form [name=clientName]').value"), "Cliente editado UI", "only dirty client name is restored");
  assert.equal(await devtools.evaluate("document.querySelector('#quick-order-edit-form [name=status]').value"), "1", "unedited status receives the authoritative update");
  assert.equal(await devtools.evaluate("document.querySelector('#quick-order-edit-form [name=vehicleBrand]').value"), "Ford", "unedited metadata receives the authoritative update");
  await externalMutation(`/api/orders/${orderId}/materials/${externalMaterial.id}/reverse`, { reason:"Estorno externo UI",operationId:crypto.randomUUID() });
  await devtools.evaluate("window.dispatchEvent(new Event('focus'))");
  await wait("document.querySelector('.inventory-history')?.innerText.includes('Estorno externo UI')", "polling also updates material reversal status");
  assert.equal(await devtools.evaluate("document.querySelector('#quick-order-edit-form [name=issue]').value"), "Rascunho de problema UI");
  await submit("#quick-order-edit-form");
  await wait("document.querySelectorAll('#quick-order-edit-form [data-dirty]').length === 0 && !document.querySelector('#quick-order-edit-form button[type=submit]').disabled", "successful explicit save clears draft markers");
  assert.equal((await api("/api/orders")).orders.find(order => String(order.id) === orderId).issue, "Rascunho de problema UI");

  await orderReady(); await click('[data-action="material-new"]');
  await fill('#material-form [name="itemId"]', String(itemId)); await fill('#material-form [name="quantity"]', "11");
  const operationId = await devtools.evaluate("document.querySelector('#material-form').dataset.operationId");
  const materialPosts = () => devtools.requests.filter(request => request.method === "POST" && request.url.endsWith(`/api/orders/${orderId}/materials`)).length;
  const postsBefore = materialPosts();
  await submit("#material-form");
  await wait("document.querySelector('#material-form [data-inventory-error]').innerText.includes('saldo')", "insufficient balance error is displayed");
  assert.equal(materialPosts(), postsBefore, "known insufficient balance is rejected before sending");
  assert.equal(await devtools.evaluate("document.querySelector('#material-form').dataset.operationId"), operationId, "failed form retains operationId");
  assert.equal(await devtools.evaluate("document.querySelector('button[form=material-form]').disabled"), false, "failed form can be corrected");
  await balance(10); await click('[data-action="close-modal"]');

  await logout(); await login(mechanic);
  assert.equal(await devtools.evaluate("document.querySelectorAll('a[href=\"#/estoque\"]').length"), 0, "mechanic has no stock menu");
  await navigate("estoque"); await wait("document.body.innerText.includes('Acesso n\u00e3o permitido')", "mechanic cannot access stock route directly");
  await navigate(`ordens/${orderId}`);
  await wait("document.querySelector('[data-action=material-new]') && !document.body.innerText.includes('Carregando materiais')", "mechanic can add to assigned order");
  assert.equal(await devtools.evaluate("document.querySelectorAll('[data-action=material-reverse]').length"), 0, "mechanic cannot reverse any material");
  const mechanicInventory = await api("/api/inventory");
  assert.equal(Object.hasOwn(mechanicInventory.items[0], "costPrice"), false); assert.deepEqual(mechanicInventory.movements, []);
  await stockUse(1); await balance(9);
  materials = (await api(`/api/orders/${orderId}/materials`)).materials;
  const mechanicMaterial = materials.find(material => material.userName === mechanic.name);
  assert.ok(mechanicMaterial); assert.equal(mechanicMaterial.source, "STOCK");

  await logout(); await login(owner);
  await navigate(`ordens/${registrationOrder.id}`);
  await wait(`document.querySelector('#quick-order-edit-form')?.dataset.id === '${registrationOrder.id}' && document.querySelector('#register-vehicle-form')`, "incomplete remote order exposes vehicle registration");
  await fill('#quick-order-edit-form [name="phone"]', "51999996655"); await submit("#quick-order-edit-form");
  await wait("document.querySelector('#quick-order-edit-form [name=phone]')?.value === '51999996655' && document.querySelectorAll('#quick-order-edit-form [data-dirty]').length === 0", "registration phone is saved");
  await fill('#register-vehicle-form [name="year"]', "2020"); await fill('#register-vehicle-form [name="mileage"]', "40000");
  await submit("#register-vehicle-form");
  await wait("!document.querySelector('#register-vehicle-form') && document.querySelector('#quick-order-edit-form')", "vehicle is registered from the order");
  await navigate("clientes");
  await wait("document.querySelector('#workshop-client-results')?.innerText.includes('Cliente extra UI') && document.querySelector('#workshop-client-results')?.innerText.includes('Cliente registro UI')", "register-vehicle append also leaves a partial catalogue eligible for full loading");
  await navigate(`ordens/${orderId}`);
  await wait(`document.querySelector('[data-action="material-reverse"][data-material-id="${mechanicMaterial.id}"]')`, "owner sees mechanic use for reversal");
  await click(`[data-action="material-reverse"][data-material-id="${mechanicMaterial.id}"]`);
  await fill('#material-reverse-form [name="reason"]', "Devolucao do mecanico UI"); await submit("#material-reverse-form");
  await wait("!document.querySelector('#modal').open", "owner reverses mechanic consumption"); await balance(10);
  await orderReady(); await fill('#quick-order-edit-form [name="status"]', "2"); await submit("#quick-order-edit-form");
  await wait("document.querySelector('[data-action=deliver-order]')", "ready order can be delivered");
  await fill('#quick-order-edit-form [name="issue"]', "Nao restaurar este rascunho na OS encerrada");
  await click('[data-action="deliver-order"]'); await click('[data-action="confirm-delivery"]');
  await wait("document.body.innerText.includes('Entregue / Encerrada')", "order is closed");
  assert.equal(await devtools.evaluate("document.querySelectorAll('[data-action=material-new],[data-action=material-reverse]').length"), 0, "closed order has no material actions");
  assert.equal((await api("/api/history/orders")).orders.find(order => String(order.id) === orderId).materials.length, 4, "closed order retains all material records");
  assert.equal(await devtools.evaluate("document.querySelector('#quick-order-edit-form [name=issue]').value"), "Rascunho de problema UI", "closed fields do not restore an unsaved draft");
  assert.equal(await devtools.evaluate("document.querySelector('#quick-order-edit-form [name=issue]').disabled"), true);
  assert.ok(await devtools.evaluate("document.querySelector('#toasts').children.length <= 3"), "notifications never grow into a page-sized stack");
  await wait("document.querySelector('#toasts').children.length === 0", "notifications expire before visual captures");
  await noOverflow("closed order desktop"); await screenshot("closed-order-desktop-1440");

  for (const width of [1440,390,768]) {
    await viewport(width); await navigate("dashboard");
    if (width === 390) {
      await click('.mobile-menu[data-action="menu"]');
      await wait("document.querySelector('#layout').classList.contains('menu-visible')", "mobile menu opens");
      await click('.nav a[href="#/estoque"]');
      await wait("location.hash === '#/estoque' && document.querySelector('#inventory-search')", "inventory is reachable from mobile menu");
      assert.equal(await devtools.evaluate("document.querySelector('#layout').classList.contains('menu-visible')"), false, "mobile menu closes after navigation");
    } else {
      await click('.nav a[href="#/estoque"]');
      await wait("document.querySelector('#inventory-search')", `${width}px stock page`);
    }
    await noOverflow(`inventory ${width}px`); await screenshot(`inventory-${width}`);
    await click(`[data-action="inventory-entry"][data-id="${itemId}"]`);
    await noOverflow(`movement dialog ${width}px`); await screenshot(`movement-dialog-${width}`);
    await click('[data-action="close-modal"]');
    await navigate(`ordens/${orderId}`); await wait("document.body.innerText.includes('Entregue / Encerrada')", "closed detail at resized viewport");
    await noOverflow(`closed order ${width}px`); await screenshot(`closed-order-${width}`);
    await navigate("ordens"); await click('[data-action="new-order"]');
    await wait("document.querySelector('#quick-order-form')", "inline new order dialog at resized viewport");
    await noOverflow(`new order dialog ${width}px`); await screenshot(`new-order-dialog-${width}`);
    await click('[data-action="close-modal"]');
  }
  assert.deepEqual(devtools.exceptions, [], "no uncaught JavaScript exceptions");
  assert.deepEqual(devtools.consoleErrors, [], "no JavaScript console errors");
  completed = true;
});
