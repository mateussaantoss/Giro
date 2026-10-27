const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
require('dotenv').config();
const { createPool, withTransaction, close, isDatabaseConfigured } = require('../db');

const root = path.resolve(__dirname, '..');
const dataDir = path.resolve(process.env.GIRO_DATA_DIR || path.join(root, 'data'));
const files = name => path.join(dataDir, name);
const read = (name, fallback) => { try { return JSON.parse(fs.readFileSync(files(name), 'utf8')); } catch (error) { if (error.code === 'ENOENT') return fallback; throw error; } };
const arr = value => Array.isArray(value) ? value : [];
const now = value => value ? new Date(value) : null;
const json = value => JSON.stringify(value == null ? {} : value);
const milli = value => Number(value || 0) / 1000;
const cents = value => Number(value || 0) / 100;
const id = (value, fallback) => value == null || value === '' ? fallback : value;
const metadata = (object, known) => Object.fromEntries(Object.entries(object || {}).filter(([key]) => !known.has(key)));
const uuid = () => crypto.randomUUID();

function normalizeLead(item) {
  return { id: String(item.id), name: item.name || item.nome || '', workshopName: item.workshopName || item.oficina || '', whatsapp: item.whatsapp || item.whats || '', email: item.email || '', state: item.state || '', stateName: item.stateName || null, city: item.city || '', workshopSize: item.workshopSize || item.tamanho || null, plan: item.plan || item.plano || null, message: item.message || item.mensagem || null, source: item.source || item.origem || 'landing', status: item.status || 'new', createdAt: item.createdAt || item.criadoEm || null };
}

function normalizeQuantity(value) { return Number(milli(value).toFixed(3)); }

async function migrate(connection) {
  const users = arr(read('users.json', []));
  const records = arr(read('workshop-records.json', []));
  const orders = arr(read('service-orders.json', []));
  const inventory = read('inventory.json', {});
  const leads = arr(read('leads.json', []));
  const logs = arr(read('activity-logs.json', []));
  const resetTokens = arr(read('password-reset-tokens.json', []));
  const invitationTokens = arr(read('invitation-tokens.json', []));
  const serviceTemplates = arr(read('service-templates.json', []));
  const workshops = new Map();
  const addWorkshop = (workshopId, source = {}) => {
    if (!workshopId) return;
    const current = workshops.get(workshopId) || { id: workshopId, name: source.name || source.workshop || `Oficina ${workshopId}`, ...source };
    workshops.set(workshopId, { ...current, ...source, id: workshopId });
  };
  users.forEach(user => addWorkshop(user.workshopId, { name: user.workshop || undefined, email: user.email, city: user.city, state: user.state, address: user.address, focus: user.focus }));
  records.forEach(record => addWorkshop(record.workshopId));
  [...orders, ...serviceTemplates, ...arr(inventory.items), ...arr(inventory.movements), ...arr(inventory.materials), ...arr(inventory.reservations)].forEach(item => addWorkshop(item.workshopId));
  for (const workshop of workshops.values()) await connection.execute(`INSERT INTO workshops (id,name,email,city,state,address,focus,metadata) VALUES (?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE name=COALESCE(NULLIF(VALUES(name),''),name), email=COALESCE(VALUES(email),email), city=COALESCE(VALUES(city),city), state=COALESCE(VALUES(state),state), address=COALESCE(VALUES(address),address), focus=COALESCE(VALUES(focus),focus), metadata=JSON_MERGE_PATCH(COALESCE(metadata,JSON_OBJECT()),VALUES(metadata))`, [workshop.id, workshop.name || `Oficina ${workshop.id}`, workshop.email || null, workshop.city || null, workshop.state || null, workshop.address || null, workshop.focus || null, json(metadata(workshop, new Set(['id','name','email','city','state','address','focus']))) ]);
  for (const user of users) {
    const known = new Set(['id','workshopId','name','email','passwordHash','phone','role','status','active','specialty','state','city','address','passwordUpdatedAt','activatedAt','lastLoginAt','createdAt']);
    await connection.execute(`INSERT INTO users (id,workshop_id,name,email,password_hash,phone,role,status,active,state,city,address,password_updated_at,activated_at,last_login_at,created_at,metadata) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE workshop_id=VALUES(workshop_id),name=VALUES(name),password_hash=VALUES(password_hash),phone=VALUES(phone),role=VALUES(role),status=VALUES(status),active=VALUES(active),metadata=JSON_MERGE_PATCH(COALESCE(metadata,JSON_OBJECT()),VALUES(metadata))`, [user.id,user.workshopId || null,user.name || '',user.email || `${user.id}@invalid.local`,user.passwordHash || '',user.phone || null,user.role || 'OWNER',user.status || (user.active === false ? 'INACTIVE' : 'ACTIVE'),user.active !== false,user.state || null,user.city || null,user.address || null,now(user.passwordUpdatedAt),now(user.activatedAt),now(user.lastLoginAt),now(user.createdAt),json(metadata(user, known))]);
  }
  for (const template of serviceTemplates) if (template.id && template.workshopId && template.name) await connection.execute('INSERT INTO service_templates (id,workshop_id,name,default_price,active,created_at) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name),default_price=VALUES(default_price),active=VALUES(active)', [template.id,template.workshopId,String(template.name).trim().slice(0,160),Number(template.defaultPrice || 0),template.active !== false,now(template.createdAt)]);
  const userIds = new Set(users.map(user => user.id));
  const userRef = value => value && userIds.has(value) ? value : null;
  const clients = new Map(), vehicles = new Map();
  for (const record of records) {
    for (const client of arr(record.clients)) { clients.set(client.id, client); await connection.execute(`INSERT INTO clients (id,workshop_id,name,phone,created_at,metadata) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name),phone=VALUES(phone),metadata=JSON_MERGE_PATCH(COALESCE(metadata,JSON_OBJECT()),VALUES(metadata))`, [client.id,client.workshopId || record.workshopId,client.name || '',client.phone || '',now(client.createdAt),json(metadata(client,new Set(['id','workshopId','name','phone','createdAt'])))]); }
    for (const vehicle of arr(record.vehicles)) { vehicles.set(vehicle.id, vehicle); await connection.execute(`INSERT INTO vehicles (id,workshop_id,client_id,brand,model,year,plate,mileage,created_at,metadata) VALUES (?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE metadata=JSON_MERGE_PATCH(COALESCE(metadata,JSON_OBJECT()),VALUES(metadata))`, [vehicle.id,vehicle.workshopId || record.workshopId,vehicle.clientId,vehicle.brand || '',vehicle.model || '',vehicle.year || null,vehicle.plate || '',vehicle.mileage || 0,now(vehicle.createdAt),json(metadata(vehicle,new Set(['id','workshopId','clientId','brand','model','year','plate','mileage','createdAt'])))]); }
  }
  for (const order of orders) {
    const known = new Set(['id','workshopId','clientId','vehicleId','assignedUserId','createdBy','closedBy','clientName','phone','vehicleBrand','vehicleModel','plate','year','mileage','service','issue','diagnosis','status','statusBeforeClose','cancelledAt','priority','estimatedValue','discount','laborItems','pendingItems','entryAt','dueAt','startedAt','finishedAt','closedAt','paused','late','incomplete','createdAt','creationOperation','history']);
    const operation = order.creationOperation || {};
    await connection.execute(`INSERT INTO service_orders (id,workshop_id,client_id,vehicle_id,assigned_user_id,created_by,closed_by,client_name,client_phone,vehicle_brand,vehicle_model,plate,year,mileage,service,issue,diagnosis,status,status_before_close,cancelled_at,priority,estimated_value,discount,labor_items,pending_items,creation_operation_id,creation_operation_hash,entry_at,due_at,started_at,finished_at,closed_at,paused,late,incomplete,created_at,metadata) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE workshop_id=VALUES(workshop_id),status=VALUES(status),metadata=JSON_MERGE_PATCH(COALESCE(metadata,JSON_OBJECT()),VALUES(metadata))`, [order.id,order.workshopId,order.clientId || null,order.vehicleId || null,userRef(order.assignedUserId),userRef(order.createdBy),userRef(order.closedBy),order.clientName || '',order.phone || '',order.vehicleBrand || '',order.vehicleModel || '',order.plate || '',order.year || null,order.mileage || 0,order.service || null,order.issue || null,order.diagnosis || null,Number(order.status || 0),order.statusBeforeClose || null,now(order.cancelledAt),order.priority || 'Normal',Number(order.estimatedValue || 0),Number(order.discount || 0),json(order.laborItems || []),json(order.pendingItems || []),operation.id || null,operation.payloadHash || null,now(order.entryAt),now(order.dueAt),now(order.startedAt),now(order.finishedAt),now(order.closedAt),Boolean(order.paused),Boolean(order.late),Boolean(order.incomplete),now(order.createdAt || order.entryAt),json(metadata(order,known))]);
    for (const event of arr(order.history)) await connection.execute(`INSERT IGNORE INTO order_status_history (order_id,user_id,new_status,action,note,metadata,created_at) VALUES (?,?,?,?,?,?,?)`, [order.id,userRef(event.userId),Number(event.status ?? order.status ?? 0),event.action || null,event.text || null,json(metadata(event,new Set(['userId','status','action','text','at']))),now(event.at)]);
  }
  for (const item of arr(inventory.items)) await connection.execute(`INSERT INTO inventory_items (id,workshop_id,name,sku,category,unit,tracked,quantity,minimum_quantity,cost_price,active,metadata) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE quantity=VALUES(quantity),active=VALUES(active),metadata=JSON_MERGE_PATCH(COALESCE(metadata,JSON_OBJECT()),VALUES(metadata))`, [item.id,item.workshopId,item.name || '',item.sku || null,item.category || null,item.unit || 'UN',item.tracked !== false,normalizeQuantity(item.quantityMilli),normalizeQuantity(item.minimumMilli),item.costCents == null ? null : cents(item.costCents),item.active !== false,json(metadata(item,new Set(['id','workshopId','name','sku','category','unit','tracked','quantityMilli','minimumMilli','costCents','active'])))]);
  for (const movement of arr(inventory.movements)) await connection.execute(`INSERT INTO inventory_movements (id,workshop_id,item_id,order_id,type,quantity,balance_after,reason,created_at,metadata) VALUES (?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE quantity=VALUES(quantity),balance_after=VALUES(balance_after),metadata=JSON_MERGE_PATCH(COALESCE(metadata,JSON_OBJECT()),VALUES(metadata))`, [movement.id,movement.workshopId,movement.itemId || null,movement.orderId || null,movement.type,normalizeQuantity(movement.quantityMilli),normalizeQuantity(movement.balanceMilli),movement.reason || null,now(movement.createdAt),json(metadata(movement,new Set(['id','workshopId','itemId','orderId','type','quantityMilli','balanceMilli','reason','createdAt'])))]);
  for (const material of arr(inventory.materials)) await connection.execute(`INSERT INTO order_parts (source_id,order_id,name,quantity,unit_value,metadata,created_at) VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE quantity=VALUES(quantity),metadata=VALUES(metadata)`, [material.id,material.orderId,material.name || 'Material',normalizeQuantity(material.quantityMilli),0,json(material),now(material.createdAt)]);
  for (const reservation of arr(inventory.reservations)) await connection.execute(`INSERT INTO inventory_reservations (id,workshop_id,item_id,order_id,quantity,status,created_at,updated_at,metadata) VALUES (?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE status=VALUES(status),metadata=JSON_MERGE_PATCH(COALESCE(metadata,JSON_OBJECT()),VALUES(metadata))`, [reservation.id,reservation.workshopId,reservation.itemId || null,reservation.orderId,normalizeQuantity(reservation.quantityMilli),reservation.status || 'ACTIVE',now(reservation.createdAt),now(reservation.updatedAt || reservation.createdAt),json(reservation)]);
  for (const operation of arr(inventory.operations)) {
    const payload = typeof operation.payload === 'string' ? (() => { try { return JSON.parse(operation.payload); } catch (_) { return {}; } })() : (operation.payload || {});
    let keyParts = []; try { keyParts = JSON.parse(operation.key); } catch (_) { /* old keys were not JSON */ }
    const operationWorkshop = operation.workshopId || payload.workshopId || keyParts[0] || [...workshops.keys()][0];
    if (operationWorkshop) await connection.execute(`INSERT INTO inventory_operations (id,workshop_id,operation_type,payload_hash,metadata) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE payload_hash=VALUES(payload_hash),metadata=VALUES(metadata)`, [operation.key, operationWorkshop, operation.type || null, operation.payloadHash || null, json(operation)]);
  }
  for (const lead of leads.map(normalizeLead)) await connection.execute(`INSERT INTO leads (id,name,workshop_name,whatsapp,email,state,state_name,city,workshop_size,plan,message,source,created_at,metadata) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE metadata=JSON_MERGE_PATCH(COALESCE(metadata,JSON_OBJECT()),VALUES(metadata))`, [lead.id,lead.name,lead.workshopName,lead.whatsapp,lead.email,lead.state,lead.stateName,lead.city,lead.workshopSize,lead.plan,lead.message,lead.source,now(lead.createdAt),json(lead)]);
  for (const log of logs) await connection.execute(`INSERT INTO activity_logs (id,workshop_id,user_id,entity_type,entity_id,action,details,created_at,metadata) VALUES (?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE details=VALUES(details),metadata=VALUES(metadata)`, [log.id,log.workshopId || null,userRef(log.userId),log.entityType || 'legacy',String(log.targetId || ''),log.action || 'legacy',json(log.details || {}),now(log.createdAt),json(log)]);
  for (const token of resetTokens) await connection.execute(`INSERT INTO password_reset_tokens (id,user_id,token_hash,expires_at,used_at,created_at) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE expires_at=VALUES(expires_at),used_at=VALUES(used_at)`, [token.id,userRef(token.userId),token.tokenHash,now(token.expiresAt),now(token.usedAt),now(token.createdAt)]);
  for (const token of invitationTokens) await connection.execute(`INSERT INTO invitation_tokens (id,user_id,workshop_id,token_hash,expires_at,used_at,created_at) VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE expires_at=VALUES(expires_at),used_at=VALUES(used_at)`, [token.id,userRef(token.userId),token.workshopId || null,token.tokenHash,now(token.expiresAt),now(token.usedAt),now(token.createdAt)]);
  return { workshops: workshops.size, users: users.length, clients: clients.size, vehicles: vehicles.size, orders: orders.length, serviceTemplates:serviceTemplates.length, inventoryItems: arr(inventory.items).length, movements: arr(inventory.movements).length, materials: arr(inventory.materials).length, reservations: arr(inventory.reservations).length, leads: leads.length, activityLogs: logs.length, resetTokens: resetTokens.length, invitationTokens: invitationTokens.length };
}

async function main() {
  if (!isDatabaseConfigured()) throw new Error('Banco de dados não configurado: defina DB_HOST, DB_NAME e DB_USER.');
  const pool = createPool();
  try { const counts = await withTransaction(pool, migrate); for (const [name,count] of Object.entries(counts)) console.log(`${name}: ${count}`); }
  finally { await close(pool); }
}

if (require.main === module) main().catch(error => { console.error(`Migração cancelada: ${error.message}`); process.exitCode = 1; });
module.exports = { normalizeLead, normalizeQuantity, metadata, migrate };
