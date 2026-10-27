"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { hasPermission, normalizeRole } = require("./permissions");
const UNITS = new Set(["UN", "KIT", "L", "ML", "KG", "G", "M"]);
function fail(status, message) { throw Object.assign(new Error(message), { status }); }
function text(value, required = false) {
  if (value === undefined && !required) return "";
  if (typeof value !== "string" || value.trim().length > 2000 || required && !value.trim()) fail(400, "Texto invalido.");
  return value.trim();
}
function milli(value, positive = false) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || positive && value === 0 || !/^\d+(?:\.\d{1,3})?$/.test(String(value))) fail(400, "Quantidade deve ter ate tres casas decimais.");
  const [whole, fraction = ""] = String(value).split(".");
  const result = BigInt(whole + fraction.padEnd(3, "0"));
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) fail(400, "Quantidade fora do limite.");
  return Number(result);
}
function cents(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) fail(400, "Custo invalido.");
  // Round the decimal representation, not an imprecise binary product.
  const [mantissa, exponent = "0"] = String(value).split("e");
  const [whole, fraction = ""] = mantissa.split(".");
  const digits = BigInt(whole + fraction);
  const scale = fraction.length - Number(exponent) - 2;
  const divisor = 10n ** BigInt(Math.max(0, scale));
  const result = scale > 0 ? (digits + divisor / 2n) / divisor : digits * 10n ** BigInt(-scale);
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) fail(400, "Custo fora do limite.");
  return Number(result);
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}

function validateState(state) {
  function check(valid) { if (!valid) throw new Error("Invalid inventory file: inconsistent schema or ledger"); }
  function record(value, required, optional = []) {
    check(value !== null && typeof value === "object" && !Array.isArray(value));
    check(required.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => required.includes(key) || optional.includes(key)));
  }
  const string = value => typeof value === "string" && value.trim().length > 0 && value.length <= 2000;
  const integer = value => Number.isSafeInteger(value) && value >= 0;
  const orderId = value => string(value) || Number.isSafeInteger(value) && value > 0;
  const date = value => typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
  function quantity(value, positive = false) {
    check(integer(value) && (!positive || value > 0) && milli(value / 1000) === value);
  }
  function unique(records) {
    const ids = new Set();
    for (const value of records) {
      check(value && string(value.id) && string(value.workshopId) && !ids.has(value.id));
      ids.add(value.id);
    }
  }
  record(state, ["items", "movements", "materials", "operations"], ["reservations"]);
  for (const key of Object.keys(state)) check(Array.isArray(state[key]));
  state.reservations ||= [];
  unique(state.items); unique(state.movements); unique(state.materials);
  const items = new Map();
  const balances = new Map();
  const movementTotals = new Map(), materialTotals = new Map();
  function total(map, itemId, workshopId, orderId, reversed, amount) {
    const key = JSON.stringify([workshopId, itemId, String(orderId)]);
    const values = map.get(key) || [0n, 0n, 0n, 0n];
    const offset = reversed ? 2 : 0;
    values[offset] += BigInt(amount); values[offset + 1]++;
    map.set(key, values);
  }
  for (const item of state.items) {
    record(item, ["id", "workshopId", "name", "sku", "category", "unit", "tracked", "quantityMilli", "minimumMilli", "costCents", "active"]);
    check(string(item.name) && typeof item.sku === "string" && item.sku.length <= 2000 && typeof item.category === "string" && item.category.length <= 2000 && UNITS.has(item.unit) && typeof item.tracked === "boolean" && typeof item.active === "boolean");
    quantity(item.quantityMilli); quantity(item.minimumMilli);
    check(integer(item.costCents) && cents(item.costCents / 100) === item.costCents);
    items.set(item.id, item); balances.set(item.id, 0);
  }
  for (const movement of state.movements) {
    record(movement, ["id", "workshopId", "itemId", "itemName", "type", "quantityMilli", "balanceMilli", "reason", "orderId", "userName", "createdAt"]);
    const item = items.get(movement.itemId);
    check(item && item.workshopId === movement.workshopId && item.tracked && string(movement.itemName) && string(movement.reason) && string(movement.userName) && date(movement.createdAt));
    check(["ENTRY", "EXIT", "CONSUMPTION", "REVERSAL"].includes(movement.type));
    check(["ENTRY", "EXIT"].includes(movement.type) ? movement.orderId === null : orderId(movement.orderId));
    quantity(movement.quantityMilli, true); quantity(movement.balanceMilli);
    const balance = balances.get(item.id) + (["ENTRY", "REVERSAL"].includes(movement.type) ? movement.quantityMilli : -movement.quantityMilli);
    check(integer(balance) && balance === movement.balanceMilli);
    balances.set(item.id, balance);
    if (movement.orderId !== null) total(movementTotals,item.id,movement.workshopId,movement.orderId,movement.type === "REVERSAL",movement.quantityMilli);
  }
  for (const item of state.items) check(item.quantityMilli === balances.get(item.id));
  for (const material of state.materials) {
    record(material, ["id", "workshopId", "orderId", "source", "itemId", "name", "unit", "quantityMilli", "status", "userName", "createdAt"], ["reversedAt", "reason"]);
    check(orderId(material.orderId) && ["STOCK", "ORDER_PURCHASE", "UNTRACKED"].includes(material.source) && string(material.name) && UNITS.has(material.unit) && string(material.userName) && date(material.createdAt));
    quantity(material.quantityMilli, true);
    const item = items.get(material.itemId);
    check(material.itemId === null || item && item.workshopId === material.workshopId && item.unit === material.unit);
    check(material.source === "STOCK" ? item && item.tracked : material.source === "ORDER_PURCHASE" ? material.itemId === null : !item || !item.tracked);
    check(material.status === "CONSUMED" || material.status === "REVERSED");
    check(material.status === "REVERSED" ? date(material.reversedAt) && material.reversedAt >= material.createdAt && string(material.reason) : !Object.hasOwn(material, "reversedAt") && !Object.hasOwn(material, "reason"));
    if (material.source === "STOCK") {
      total(materialTotals,item.id,material.workshopId,material.orderId,false,material.quantityMilli);
      if (material.status === "REVERSED") total(materialTotals,item.id,material.workshopId,material.orderId,true,material.quantityMilli);
    }
  }
  const reservationIds = new Set();
  for (const reservation of state.reservations) {
    record(reservation, ["id", "workshopId", "orderId", "itemId", "itemName", "unit", "quantityMilli", "status", "createdBy", "userName", "createdAt", "updatedAt"], ["operationId"]);
    check(string(reservation.id) && string(reservation.workshopId) && orderId(reservation.orderId) && string(reservation.itemId) && string(reservation.itemName) && UNITS.has(reservation.unit));
    quantity(reservation.quantityMilli, true);
    check(["ACTIVE", "COMMITTED", "RELEASED", "CANCELLED"].includes(reservation.status));
    check(string(reservation.createdBy) && string(reservation.userName) && date(reservation.createdAt) && date(reservation.updatedAt));
    check(!reservationIds.has(reservation.id)); reservationIds.add(reservation.id);
    const item = items.get(reservation.itemId);
    check(item && item.workshopId === reservation.workshopId && item.unit === reservation.unit && item.tracked);
  }
  check(movementTotals.size === materialTotals.size);
  for (const [key, totals] of movementTotals) check(materialTotals.has(key) && totals.every((value,index) => materialTotals.get(key)[index] === value));
  const movements = new Map(state.movements.map(m => [m.id,m]));
  const materials = new Map(state.materials.map(m => [m.id,m]));
  const keys = new Set();
  for (const operation of state.operations) {
    record(operation, ["key", "payload", "result"]);
    check(typeof operation.key === "string" && typeof operation.payload === "string" && !keys.has(operation.key));
    keys.add(operation.key);
    const key = JSON.parse(operation.key), payload = JSON.parse(operation.payload);
    check(Array.isArray(key) && key.length === 4 && key.every(string) && key[3].length <= 200);
    check(payload && typeof payload === "object" && !Array.isArray(payload) && payload.operationId === key[3] && JSON.stringify(canonical(payload)) === operation.payload);
    const result = operation.result;
    if (key[2] === "/api/inventory/items" || key[2] === "/api/inventory/movements") {
      record(result, key[2].endsWith("/items") ? ["item"] : ["item", "movement"]);
      record(result.item, ["id", "name", "sku", "category", "unit", "tracked", "quantity", "minimumQuantity", "active"], ["costPrice", "onHand", "reserved", "available"]);
      const item = items.get(result.item.id);
      check(item && item.workshopId === key[0] && item.unit === result.item.unit && item.tracked === result.item.tracked && string(result.item.name) && typeof result.item.sku === "string" && typeof result.item.category === "string" && typeof result.item.active === "boolean");
      milli(result.item.quantity); milli(result.item.minimumQuantity);
      if (key[2].endsWith("/items")) check(result.item.quantity === milli(payload.initialQuantity ?? 0) / 1000);
      if (Object.hasOwn(result.item,"costPrice")) check(cents(result.item.costPrice) / 100 === result.item.costPrice);
      if (result.movement) {
        const movement = movements.get(result.movement.id);
        check(movement && movement.workshopId === key[0] && movement.itemId === item.id && ["ENTRY", "EXIT"].includes(movement.type));
        check(result.item.quantity === movement.balanceMilli / 1000 && payload.itemId === movement.itemId && payload.type === movement.type && milli(payload.quantity,true) === movement.quantityMilli && text(payload.reason,true) === movement.reason);
        const { workshopId, quantityMilli, balanceMilli, ...publicMovement } = movement;
        check(JSON.stringify(canonical(result.movement)) === JSON.stringify(canonical({ ...publicMovement, quantity:quantityMilli / 1000, balanceAfter:balanceMilli / 1000 })));
      }
    } else {
      const route = key[2].match(/^\/api\/orders\/([^/]+)\/materials(?:\/([^/]+)\/reverse)?$/);
      const reservationRoute = key[2].match(/^\/api\/orders\/([^/]+)\/reservations(?:\/([^/]+))?$/);
      const commitRoute = key[2].match(/^\/api\/orders\/([^/]+)\/commit-materials$/);
      const cancelRoute = key[2].match(/^\/api\/orders\/([^/]+)\/cancel$/);
      check(route || reservationRoute || commitRoute || cancelRoute);
      if (reservationRoute || commitRoute || cancelRoute) {
        record(result, ["reservations"], ["reservation", "item", "materials"]);
        check(Array.isArray(result.reservations));
        for (const value of result.reservations) {
          record(value, ["id", "orderId", "itemId", "itemName", "unit", "quantity", "status", "createdBy", "userName", "createdAt", "updatedAt"], ["workshopId", "operationId"]);
          check(reservationIds.has(value.id) && (commitRoute || cancelRoute || String(value.orderId) === reservationRoute[1]));
        }
        if (result.reservation) check(result.reservation.id && reservationIds.has(result.reservation.id));
        continue;
      }
      record(result, ["materials", "material"]);
      check(Array.isArray(result.materials));
      check(new Set(result.materials.map(m => m?.id)).size === result.materials.length);
      for (const publicMaterial of [...result.materials, result.material]) {
        record(publicMaterial, ["id", "source", "itemId", "name", "unit", "quantity", "status", "userName", "createdAt"], ["reversedAt", "reason"]);
        const material = materials.get(publicMaterial.id);
        check(material && material.workshopId === key[0] && String(material.orderId) === route[1] && (publicMaterial.status === "CONSUMED" || publicMaterial.status === "REVERSED" && material.status === "REVERSED"));
        const { workshopId, orderId, quantityMilli, status, reversedAt, reason, ...fields } = material;
        const expected = { ...fields, quantity:quantityMilli / 1000, status:publicMaterial.status, ...(publicMaterial.status === "REVERSED" ? { reversedAt, reason } : {}) };
        check(JSON.stringify(canonical(publicMaterial)) === JSON.stringify(canonical(expected)));
      }
      check(route[2] ? result.material.id === route[2] && result.material.status === "REVERSED" : result.material.status === "CONSUMED");
      check(result.materials.some(m => JSON.stringify(canonical(m)) === JSON.stringify(canonical(result.material))));
    }
  }
}

// Synchronous single-process writer: publish only after the atomic rename.
function createInventory(dataDir, io = fs) {
  const file = path.join(dataDir, "inventory.json");
  let state = io.existsSync(file) ? JSON.parse(io.readFileSync(file, "utf8")) : { items:[], movements:[], materials:[], operations:[] };
  try { validateState(state); }
  catch (error) { throw new Error("Invalid inventory file: inconsistent schema or ledger", { cause:error }); }
  function persist(candidate) {
    io.mkdirSync(dataDir, { recursive:true });
    const tmp = `${file}.${crypto.randomUUID()}.tmp`;
    let fd;
    try {
      fd = io.openSync(tmp, "wx", 0o600);
      io.writeFileSync(fd, JSON.stringify(candidate));
      io.fsyncSync(fd);
      io.closeSync(fd); fd = undefined;
      io.renameSync(tmp, file);
    } catch (error) {
      // Cleanup is best-effort; preserve the original error and do no I/O after rename.
      if (fd !== undefined) { try { io.closeSync(fd); } catch (_) {} }
      try { io.unlinkSync(tmp); } catch (_) {}
      throw error;
    }
  }
  function itemView(item, user, source = state) {
    const { id, name, sku, category, unit, tracked, active } = item;
    const reservedMilli = (source.reservations || []).filter(r => r.workshopId === item.workshopId && r.itemId === item.id && r.status === "ACTIVE").reduce((sum, r) => sum + r.quantityMilli, 0);
    return { id, name, sku, category, unit, tracked, quantity:item.quantityMilli / 1000, onHand:item.quantityMilli / 1000, reserved:reservedMilli / 1000, available:(item.quantityMilli - reservedMilli) / 1000, minimumQuantity:item.minimumMilli / 1000, ...(normalizeRole(user.role) === "OWNER" ? { costPrice:item.costCents / 100 } : {}), active };
  }
  function materialView(material) {
    const { id, source, itemId, name, unit, status, userName, createdAt, reversedAt, reason } = material;
    return { id, source, itemId, name, unit, quantity:material.quantityMilli / 1000, status, userName, createdAt, ...(reversedAt ? { reversedAt, reason } : {}) };
  }
  function materials(user, orderId, source = state) {
    return source.materials.filter(m => m.workshopId === user.workshopId && String(m.orderId) === String(orderId)).map(materialView);
  }
  function movementView(m) {
    const { id, itemId, itemName, type, reason, orderId, userName, createdAt } = m;
    return { id, itemId, itemName, type, quantity:m.quantityMilli / 1000, balanceAfter:m.balanceMilli / 1000, reason, orderId, userName, createdAt };
  }
  function reservationView(reservation) {
    const { id, workshopId, orderId, itemId, itemName, unit, quantityMilli, status, createdBy, userName, createdAt, updatedAt, operationId } = reservation;
    return { id, workshopId, orderId, itemId, itemName, unit, quantity:quantityMilli / 1000, status, createdBy, userName, createdAt, updatedAt, ...(operationId ? { operationId } : {}) };
  }
  function thisReservations(source, user, orderId) {
    return (source.reservations || []).filter(r => r.workshopId === user.workshopId && String(r.orderId) === String(orderId)).map(reservationView);
  }
  function reservedMilli(s, itemId, statuses = ["ACTIVE"]) {
    return (s.reservations || []).filter(r => r.itemId === itemId && statuses.includes(r.status)).reduce((sum, r) => sum + r.quantityMilli, 0);
  }
  function authorize(user, permission) { if (!hasPermission(user, permission)) fail(403, "Sem permissao para esta acao."); }
  function findItem(s, user, id) {
    const item = s.items.find(i => i.id === id && i.workshopId === user.workshopId);
    if (!item) fail(404, "Item nao encontrado.");
    return item;
  }
  function mutate(user, route, body, action, idempotent = true) {
    const operationId = body.operationId;
    if (idempotent && (typeof operationId !== "string" || !operationId.trim() || operationId.length > 200)) fail(400, "operationId obrigatorio.");
    const key = JSON.stringify([user.workshopId, user.id, route, operationId]);
    const payload = JSON.stringify(canonical(body));
    const old = idempotent && state.operations.find(o => o.key === key);
    if (old) {
      if (old.payload !== payload) fail(409, "operationId reutilizado com outro payload.");
      const result = JSON.parse(JSON.stringify(old.result));
      if (result.item && normalizeRole(user.role) !== "OWNER") delete result.item.costPrice;
      return result;
    }
    const candidate = JSON.parse(JSON.stringify(state));
    const result = action(candidate);
    if (idempotent) candidate.operations.push({ key, payload, result });
    persist(candidate);
    state = candidate;
    return JSON.parse(JSON.stringify(result));
  }
  function move(s, user, item, type, quantityMilli, reason, orderId = null) {
    const next = item.quantityMilli + (["ENTRY", "REVERSAL"].includes(type) ? quantityMilli : -quantityMilli);
    if (next < 0) fail(409, "Saldo insuficiente.");
    if (type === "EXIT" && next < reservedMilli(s, item.id)) fail(409, "Saldo disponível insuficiente.");
    if (!Number.isSafeInteger(next) || milli(next / 1000) !== next) fail(400, "Saldo fora do limite.");
    item.quantityMilli = next;
    const m = { id:crypto.randomUUID(), workshopId:user.workshopId, itemId:item.id, itemName:item.name, type, quantityMilli, balanceMilli:next, reason, orderId, userName:user.name, createdAt:new Date().toISOString() };
    s.movements.push(m);
    return movementView(m);
  }
  function costPermission(user, body) { if (Object.hasOwn(body, "costPrice") && normalizeRole(user.role) !== "OWNER") fail(403, "Somente o proprietario pode editar custos."); }
  function metadata(item, body) {
    for (const key of ["name", "sku", "category"]) if (Object.hasOwn(body, key)) item[key] = text(body[key], key === "name");
    if (Object.hasOwn(body, "minimumQuantity")) item.minimumMilli = milli(body.minimumQuantity);
    if (Object.hasOwn(body, "costPrice")) item.costCents = cents(body.costPrice);
    if (Object.hasOwn(body, "active")) {
      if (typeof body.active !== "boolean") fail(400, "active deve ser booleano.");
      item.active = body.active;
    }
  }
  return {
    materials,
    reservations(user, orderId, source = state) {
      if (!hasPermission(user, "os.view") && !hasPermission(user, "assigned_services.view")) fail(403, "Sem permissao para consultar OS.");
      return (source.reservations || []).filter(r => r.workshopId === user.workshopId && String(r.orderId) === String(orderId)).map(reservationView);
    },
    list(user) {
      authorize(user, "inventory.view");
      return { items:state.items.filter(i => i.workshopId === user.workshopId).map(i => itemView(i, user)), movements:normalizeRole(user.role) === "MECHANIC" ? [] : state.movements.filter(m => m.workshopId === user.workshopId).map(movementView) };
    },
    create(user, body) {
      authorize(user, "inventory.manage"); costPermission(user, body);
      return mutate(user, "/api/inventory/items", body, s => {
        if (!UNITS.has(body.unit) || typeof body.tracked !== "boolean") fail(400, "Unidade ou controle de estoque invalido.");
        const item = { id:crypto.randomUUID(), workshopId:user.workshopId, name:text(body.name, true), sku:"", category:"", unit:body.unit, tracked:body.tracked, quantityMilli:0, minimumMilli:0, costCents:0, active:true };
        metadata(item, body); item.active = true;
        const initialQuantity = milli(body.initialQuantity ?? 0);
        if (!item.tracked && initialQuantity > 0) fail(400, "Item sem controle de estoque nao pode ter quantidade inicial.");
        s.items.push(item);
        if (initialQuantity > 0) move(s, user, item, "ENTRY", initialQuantity, "Estoque inicial");
        return { item:itemView(item, user, s) };
      });
    },
    patch(user, id, body) {
      authorize(user, "inventory.manage"); costPermission(user, body);
      if (Object.keys(body).some(k => !["name", "sku", "category", "minimumQuantity", "costPrice", "active"].includes(k))) fail(400, "Somente metadados podem ser editados.");
      return mutate(user, `/api/inventory/items/${id}`, body, s => { const item = findItem(s, user, id); metadata(item, body); return { item:itemView(item, user, s) }; }, false);
    },
    movement(user, body) {
      authorize(user, "inventory.move");
      return mutate(user, "/api/inventory/movements", body, s => {
        const item = findItem(s, user, body.itemId);
        if (!item.active || !item.tracked || !["ENTRY", "EXIT"].includes(body.type)) fail(400, "Movimento invalido para este item.");
        const movement = move(s, user, item, body.type, milli(body.quantity, true), text(body.reason, true));
        return { item:itemView(item, user, s), movement };
      });
    },
    consume(user, order, body) {
      authorize(user, "materials.add");
      if (normalizeRole(user.role) === "MECHANIC" && order.assignedUserId !== user.id) fail(403, "OS nao atribuida.");
      if (order.workshopId !== user.workshopId) fail(404, "OS nao encontrada.");
      return mutate(user, `/api/orders/${order.id}/materials`, body, s => {
        if (order.closedAt) fail(409, "OS encerrada.");
        if (!["STOCK", "ORDER_PURCHASE", "UNTRACKED"].includes(body.source)) fail(400, "Origem invalida.");
        const quantityMilli = milli(body.quantity, true);
        let item = null;
        if (body.source === "STOCK" || body.itemId) item = findItem(s, user, body.itemId);
        if (item && (!item.active || body.source === "STOCK" && !item.tracked || body.source === "UNTRACKED" && item.tracked)) fail(400, "Item incompativel com a origem.");
        if (body.source === "ORDER_PURCHASE" && body.itemId) fail(400, "Compra avulsa nao referencia estoque.");
        const name = item ? item.name : text(body.name, true);
        const unit = item ? item.unit : body.unit === undefined ? "UN" : body.unit;
        if (!UNITS.has(unit)) fail(400, "Unidade invalida.");
        const material = { id:crypto.randomUUID(), workshopId:user.workshopId, orderId:order.id, source:body.source, itemId:item?.id || null, name, unit, quantityMilli, status:"CONSUMED", userName:user.name, createdAt:new Date().toISOString() };
        if (body.source === "STOCK") move(s, user, item, "CONSUMPTION", quantityMilli, `Material OS #${order.id}`, order.id);
        s.materials.push(material);
        return { materials:materials(user, order.id, s), material:materialView(material) };
      });
    },
    reserve(user, order, body) {
      authorize(user, "materials.reserve");
      if (normalizeRole(user.role) === "MECHANIC" && order.assignedUserId !== user.id) fail(403, "OS nao atribuida.");
      if (order.workshopId !== user.workshopId) fail(404, "OS nao encontrada.");
      return mutate(user, `/api/orders/${order.id}/reservations`, body, s => {
        if (order.closedAt || order.cancelledAt || order.status >= 3) fail(409, "OS encerrada.");
        const item = findItem(s, user, body.itemId);
        if (!item.active || !item.tracked) fail(400, "Item incompativel com reserva.");
        const quantityMilli = milli(body.quantity, true);
        if (item.quantityMilli - reservedMilli(s, item.id) < quantityMilli) fail(409, "Saldo disponível insuficiente.");
        const now = new Date().toISOString();
        const reservation = { id:crypto.randomUUID(), workshopId:user.workshopId, orderId:order.id, itemId:item.id, itemName:item.name, unit:item.unit, quantityMilli, status:"ACTIVE", createdBy:user.id, userName:user.name, createdAt:now, updatedAt:now, ...(body.operationId ? { operationId:body.operationId } : {}) };
        s.reservations ||= []; s.reservations.push(reservation);
        return { reservation:reservationView(reservation), reservations:thisReservations(s, user, order.id), item:itemView(item, user, s) };
      });
    },
    release(user, order, reservationId, body) {
      authorize(user, "materials.reserve");
      if (normalizeRole(user.role) === "MECHANIC" && order.assignedUserId !== user.id) fail(403, "OS nao atribuida.");
      if (order.workshopId !== user.workshopId) fail(404, "OS nao encontrada.");
      return mutate(user, `/api/orders/${order.id}/reservations/${reservationId}`, body, s => {
        const reservation = (s.reservations || []).find(r => r.id === reservationId && r.workshopId === user.workshopId && String(r.orderId) === String(order.id));
        if (!reservation) fail(404, "Reserva nao encontrada.");
        if (reservation.status !== "ACTIVE") fail(409, "Reserva nao esta ativa.");
        reservation.status = order.cancelledAt ? "CANCELLED" : "RELEASED"; reservation.updatedAt = new Date().toISOString();
        return { reservation:reservationView(reservation), reservations:thisReservations(s, user, order.id) };
      });
    },
    releaseOrder(user, order, status = "CANCELLED") {
      authorize(user, "orders.cancel");
      if (order.workshopId !== user.workshopId) fail(404, "OS nao encontrada.");
      return mutate(user, `/api/orders/${order.id}/cancel`, { operationId:`cancel:${order.id}` }, s => {
        for (const reservation of s.reservations || []) if (reservation.workshopId === user.workshopId && String(reservation.orderId) === String(order.id) && reservation.status === "ACTIVE") {
          reservation.status = status === "CANCELLED" ? "CANCELLED" : "RELEASED"; reservation.updatedAt = new Date().toISOString();
        }
        return { reservations:thisReservations(s, user, order.id) };
      });
    },
    commit(user, order, body = {}) {
      authorize(user, "materials.commit");
      if (normalizeRole(user.role) === "MECHANIC" && order.assignedUserId !== user.id) fail(403, "OS nao atribuida.");
      if (order.workshopId !== user.workshopId) fail(404, "OS nao encontrada.");
      const payload = { operationId:body.operationId || `commit:${order.id}` };
      return mutate(user, `/api/orders/${order.id}/commit-materials`, payload, s => {
        if (order.closedAt || order.cancelledAt || order.status >= 3) fail(409, "OS encerrada.");
        const committed = (s.reservations || []).filter(r => r.workshopId === user.workshopId && String(r.orderId) === String(order.id) && r.status === "ACTIVE");
        const now = new Date().toISOString();
        for (const reservation of committed) {
          reservation.status = "COMMITTED"; reservation.updatedAt = now;
          const item = findItem(s, user, reservation.itemId);
          move(s, user, item, "CONSUMPTION", reservation.quantityMilli, `Material OS #${order.id}`, order.id);
          s.materials.push({ id:crypto.randomUUID(), workshopId:user.workshopId, orderId:order.id, source:"STOCK", itemId:item.id, name:item.name, unit:item.unit, quantityMilli:reservation.quantityMilli, status:"CONSUMED", userName:user.name, createdAt:now });
        }
        return { materials:materials(user, order.id, s), reservations:thisReservations(s, user, order.id) };
      });
    },
    reverse(user, order, id, body) {
      authorize(user, "inventory.reverse");
      if (order.workshopId !== user.workshopId) fail(404, "OS nao encontrada.");
      return mutate(user, `/api/orders/${order.id}/materials/${id}/reverse`, body, s => {
        if (order.closedAt) fail(409, "OS encerrada.");
        const material = s.materials.find(m => m.id === id && m.workshopId === user.workshopId && String(m.orderId) === String(order.id));
        if (!material) fail(404, "Material nao encontrado.");
        if (material.status === "REVERSED") fail(409, "Material ja estornado.");
        const reason = text(body.reason, true);
        if (material.source === "STOCK") move(s, user, findItem(s, user, material.itemId), "REVERSAL", material.quantityMilli, reason, order.id);
        material.status = "REVERSED"; material.reversedAt = new Date().toISOString(); material.reason = reason;
        return { materials:materials(user, order.id, s), material:materialView(material) };
      });
    }
  };
}
module.exports = { createInventory };
