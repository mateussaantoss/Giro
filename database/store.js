'use strict';

const crypto = require('node:crypto');
const { createPool, withTransaction, close, isDatabaseConfigured } = require('../db');
const { normalizeRole } = require('../permissions');

const json = value => {
  if (value == null) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch (_) { return {}; }
};
const iso = value => value ? new Date(value).toISOString() : null;
const metadata = (row, known) => ({ ...json(row.metadata), ...Object.fromEntries(Object.entries(row).filter(([key]) => !known.has(key) && row[key] !== undefined)) });
const normalizedPhoneSql = "REGEXP_REPLACE(phone, '[^0-9]', '')";
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const operationHash = body => crypto.createHash('sha256').update(JSON.stringify(Object.keys(body || {}).sort().map(key => [key, body[key]]))).digest('hex');

function user(row) {
  return { id:row.id, workshopId:row.workshop_id, name:row.name, email:row.email, passwordHash:row.password_hash,
    phone:row.phone || '', role:normalizeRole(row.role), status:row.status || (row.active ? 'ACTIVE' : 'INACTIVE'), active:Boolean(row.active),
    state:row.state, city:row.city, address:row.address, specialty:row.specialty, passwordUpdatedAt:iso(row.password_updated_at),
    activatedAt:iso(row.activated_at), lastLoginAt:iso(row.last_login_at), createdAt:iso(row.created_at), ...metadata(row, new Set(['id','workshop_id','name','email','password_hash','phone','role','status','active','state','city','address','specialty','password_updated_at','activated_at','last_login_at','created_at','metadata'])) };
}
function order(row, history) {
  return { id:Number(row.id), workshopId:row.workshop_id, clientId:row.client_id, vehicleId:row.vehicle_id, assignedUserId:row.assigned_user_id,
    createdBy:row.created_by, closedBy:row.closed_by, clientName:row.client_name || '', phone:row.client_phone || '', vehicleBrand:row.vehicle_brand || '',
    vehicleModel:row.vehicle_model || '', plate:row.plate || '', year:row.year, mileage:row.mileage || 0, service:row.service || '', issue:row.issue || '',
    diagnosis:row.diagnosis || '', status:Number(row.status), statusBeforeClose:row.status_before_close, cancelledAt:iso(row.cancelled_at), priority:row.priority,
    estimatedValue:row.estimated_value == null ? null : Number(row.estimated_value), discount:Number(row.discount || 0), laborItems:json(row.labor_items) || [], pendingItems:json(row.pending_items) || [],
    entryAt:iso(row.entry_at), dueAt:iso(row.due_at), startedAt:iso(row.started_at), finishedAt:iso(row.finished_at), closedAt:iso(row.closed_at),
    paused:Boolean(row.paused), late:Boolean(row.late), incomplete:Boolean(row.incomplete), createdAt:iso(row.created_at), history:history || [],
    ...(json(row.metadata)) };
}
function serviceTemplate(row) {
  return { id:row.id, workshopId:row.workshop_id, name:row.name, defaultPrice:Number(row.default_price), active:Boolean(row.active), createdAt:iso(row.created_at), updatedAt:iso(row.updated_at) };
}

function orderQuery(where = '') {
  return `SELECT o.*, cb.name AS closed_by_name, au.name AS assigned_user_name FROM service_orders o LEFT JOIN users cb ON cb.id=o.closed_by LEFT JOIN users au ON au.id=o.assigned_user_id ${where}`;
}

async function orderHistory(connection, id) {
  const [rows] = await connection.execute('SELECT h.*,u.name AS user_name FROM order_status_history h LEFT JOIN users u ON u.id=h.user_id WHERE h.order_id=? ORDER BY h.created_at', [id]);
  return rows.map(row => ({ userId:row.user_id, userName:row.user_name || '', action:row.action, text:row.note, oldStatus:row.old_status, newStatus:row.new_status, at:iso(row.created_at), ...json(row.metadata) }));
}

function publicDbOrder(row, history) {
  const value = order(row, history);
  const labor = (value.laborItems || []).reduce((sum, item) => sum + Number(item.value || 0), 0);
  return { id:value.id, workshopId:value.workshopId, clientId:value.clientId ?? null, vehicleId:value.vehicleId ?? null, clientName:value.clientName, phone:value.phone, vehicleBrand:value.vehicleBrand, vehicleModel:value.vehicleModel, plate:value.plate, year:value.year || null, mileage:value.mileage || 0, service:value.service, issue:value.issue, dueAt:value.dueAt, laborItems:value.laborItems || [], pendingItems:value.pendingItems || [], discount:value.discount, totals:{ parts:0, labor, discount:value.discount, total:Math.max(0,labor-value.discount) }, ...(value.closedAt ? { estimatedValue:value.estimatedValue } : {}), status:value.cancelledAt ? 4 : value.closedAt ? 3 : value.status, priority:value.priority, entryAt:value.entryAt, finishedAt:value.finishedAt || null, closedAt:value.closedAt || null, cancelledAt:value.cancelledAt || null, closedBy:value.closedBy || null, closedByName:row.closed_by_name || '', createdBy:value.createdBy, assignedUserId:value.assignedUserId, assignedUserName:row.assigned_user_name || '', incomplete:value.incomplete, history:value.history || [] };
}

async function bootstrap(pool) {
  const required = ['workshops','users','sessions','clients','vehicles','service_templates','service_orders','order_status_history','inventory_items','inventory_movements','inventory_reservations','order_parts','activity_logs','password_reset_tokens','invitation_tokens','leads'];
  for (const table of required) await pool.query(`SELECT 1 FROM \`${table}\` LIMIT 1`);
  const [workshops, users, clients, vehicles, rows, history, logs, resets, invitations, leads] = await Promise.all([
    pool.query('SELECT * FROM workshops'), pool.query('SELECT * FROM users'), pool.query('SELECT * FROM clients'), pool.query('SELECT * FROM vehicles'),
    pool.query('SELECT * FROM service_orders'), pool.query('SELECT * FROM order_status_history ORDER BY created_at'), pool.query('SELECT * FROM activity_logs ORDER BY created_at'),
    pool.query('SELECT * FROM password_reset_tokens'), pool.query('SELECT * FROM invitation_tokens'), pool.query('SELECT * FROM leads ORDER BY created_at')
  ]).then(values => values.map(value => value[0]));
  const historyByOrder = new Map();
  for (const row of history) { const list = historyByOrder.get(String(row.order_id)) || []; list.push({ userId:row.user_id, action:row.action, text:row.note, oldStatus:row.old_status, newStatus:row.new_status, at:iso(row.created_at), ...json(row.metadata) }); historyByOrder.set(String(row.order_id), list); }
  const records = new Map();
  for (const row of clients) { const value = { id:row.id, workshopId:row.workshop_id, name:row.name, phone:row.phone || '', createdAt:iso(row.created_at), ...json(row.metadata) }; const record = records.get(row.workshop_id) || { workshopId:row.workshop_id, clients:[], vehicles:[] }; record.clients.push(value); records.set(row.workshop_id, record); }
  for (const row of vehicles) { const value = { id:row.id, workshopId:row.workshop_id, clientId:row.client_id, brand:row.brand, model:row.model, year:row.year, plate:row.plate || '', mileage:row.mileage || 0, createdAt:iso(row.created_at), ...json(row.metadata) }; const record = records.get(row.workshop_id) || { workshopId:row.workshop_id, clients:[], vehicles:[] }; record.vehicles.push(value); records.set(row.workshop_id, record); }
  return { users:users.map(user), serviceOrders:rows.map(row => order(row, historyByOrder.get(String(row.id)) || [])), workshopRecords:[...records.values()], passwordResetTokens:resets.map(row => ({ id:row.id,userId:row.user_id,tokenHash:row.token_hash,expiresAt:iso(row.expires_at),usedAt:iso(row.used_at),createdAt:iso(row.created_at) })), invitationTokens:invitations.map(row => ({ id:row.id,userId:row.user_id,workshopId:row.workshop_id,tokenHash:row.token_hash,expiresAt:iso(row.expires_at),usedAt:iso(row.used_at),createdAt:iso(row.created_at) })), leads:leads.map(row => ({ id:row.id,nome:row.name,oficina:row.workshop_name,whats:row.whatsapp,email:row.email,state:row.state,stateName:row.state_name,city:row.city,tamanho:row.workshop_size,plano:row.plan,mensagem:row.message,origem:row.source,status:row.status,criadoEm:iso(row.created_at) })), activityLogs:logs };
}

function createStore(env = process.env) {
  if (!isDatabaseConfigured(env)) return null;
  const pool = createPool(env);
  const hasFullOrderAccess = actor => ['OWNER','MANAGER','ATTENDANT'].includes(normalizeRole(actor.role));
  const normalizeOrderBody = body => ({
    clientName:String(body.clientName || '').trim().replace(/\s+/g,' ').slice(0,120), phone:typeof body.phone === 'string' ? body.phone.replace(/[^\d+() -]/g,'').slice(0,30) : '',
    vehicleBrand:String(body.vehicleBrand || '').trim().replace(/\s+/g,' ').slice(0,60), vehicleModel:String(body.vehicleModel || '').trim().replace(/\s+/g,' ').slice(0,120), plate:typeof body.plate === 'string' ? body.plate.trim().toUpperCase().replace(/[^A-Z0-9-]/g,'').slice(0,10) : '', issue:String(body.issue || '').trim().slice(0,2000), service:String(body.service || '').trim().slice(0,2000), priority:['Baixa','Normal','Alta'].includes(body.priority) ? body.priority : 'Normal', year:body.year == null || body.year === '' ? null : Number(body.year), mileage:body.mileage == null || body.mileage === '' ? 0 : Number(body.mileage), dueAt:body.dueAt ? new Date(body.dueAt) : null, estimatedValue:body.estimatedValue == null ? null : Number(body.estimatedValue), discount:Number(body.discount || 0), laborItems:Array.isArray(body.laborItems) ? body.laborItems : [], pendingItems:Array.isArray(body.pendingItems) ? body.pendingItems : []
  });
  const validMechanic = async (connection, actor, id) => { const [rows]=await connection.execute("SELECT id FROM users WHERE id=? AND workshop_id=? AND active=TRUE AND status='ACTIVE' AND role='MECHANIC'",[id,actor.workshopId]); if(!rows[0]) fail(400,'Mecânico inválido para esta oficina.'); return id; };
  const normalizeLaborItems = async (connection, actor, items, allowInactive = false) => { if(!Array.isArray(items) || items.length > 100) fail(400,'laborItems inválido.'); const result=[]; for(const item of items) { if(!item || typeof item.description!=='string' || typeof item.value!=='number' || !Number.isFinite(item.value) || item.value<0 || item.value>1000000) fail(400,'laborItems inválido.'); if(item.assignedUserId) await validMechanic(connection,actor,item.assignedUserId); let template=null; if(item.templateId) { const [rows]=await connection.execute(`SELECT * FROM service_templates WHERE id=? AND workshop_id=?${allowInactive?'':' AND active=TRUE'} LIMIT 1`,[item.templateId,actor.workshopId]); template=rows[0]; if(!template) fail(400,'Serviço cadastrado inválido ou inativo.'); } result.push({...template?{templateId:template.id}:{},description:item.description.trim().replace(/\s+/g,' ').slice(0,2000),value:Math.round(item.value*100)/100,...item.assignedUserId?{assignedUserId:item.assignedUserId}:{}}); } return result; };
  const nextOrderId = async connection => { const [rows]=await connection.execute('SELECT COALESCE(MAX(id),0)+1 AS id FROM service_orders'); return Number(rows[0].id); };
  const findLocked = async (connection, actor, id) => { const [rows]=await connection.execute(orderQuery('WHERE o.id=? AND o.workshop_id=? LIMIT 1 FOR UPDATE'),[id,actor.workshopId]); return rows[0] || null; };
  const addOrderEvent = async (connection,id,actor,action,oldStatus,newStatus,note,metadataValue={}) => connection.execute('INSERT INTO order_status_history (order_id,user_id,old_status,new_status,action,note,metadata) VALUES (?,?,?,?,?,?,?)',[id,actor.id,oldStatus,newStatus,action,note,JSON.stringify(metadataValue)]);
  const log = async (connection,actor,action,targetId,details={}) => connection.execute('INSERT INTO activity_logs (id,workshop_id,user_id,entity_type,entity_id,action,details) VALUES (?,?,?,?,?,?,?)',[crypto.randomUUID(),actor.workshopId,actor.id,'service_order',String(targetId),action,JSON.stringify(details)]);
   const resultForOrder = async (connection,actor,id,extra={}) => { const found=await methods.findOrder(actor,id,false,connection); return { order:{ ...found.public, estimatedValue:found.estimatedValue }, ...extra }; };
  const ensureClientVehicle = async (connection,actor,values,now) => {
    let clientId=null,vehicleId=null,vehicle=null;
    if (values.plate) { const [rows]=await connection.execute('SELECT v.*,c.name AS client_name,c.phone AS client_phone,c.id AS cid FROM vehicles v JOIN clients c ON c.id=v.client_id WHERE v.workshop_id=? AND v.plate=? LIMIT 1',[actor.workshopId,values.plate]); if(rows[0]) { clientId=rows[0].cid; vehicleId=rows[0].id; vehicle=rows[0]; values.clientName=rows[0].client_name; values.phone=rows[0].client_phone; values.vehicleBrand=rows[0].brand; values.vehicleModel=rows[0].model; values.year=rows[0].year ?? values.year; values.mileage=rows[0].mileage ?? values.mileage; } }
    if (!clientId && values.clientName) { const [rows]=await connection.execute('SELECT id FROM clients WHERE workshop_id=? AND name=? AND phone=? LIMIT 1',[actor.workshopId,values.clientName,values.phone]); clientId=rows[0]?.id || null; }
    if (!clientId && values.clientName) { clientId=crypto.randomUUID(); await connection.execute('INSERT INTO clients (id,workshop_id,name,phone,created_at) VALUES (?,?,?,?,?)',[clientId,actor.workshopId,values.clientName,values.phone,now]); }
    if (!vehicleId && values.clientName && values.phone && values.vehicleBrand && values.vehicleModel && values.plate) { vehicleId=crypto.randomUUID(); await connection.execute('INSERT INTO vehicles (id,workshop_id,client_id,brand,model,plate,year,mileage,created_at) VALUES (?,?,?,?,?,?,?,?,?)',[vehicleId,actor.workshopId,clientId,values.vehicleBrand,values.vehicleModel,values.plate,values.year,values.mileage,now]); vehicle={ id:vehicleId,plate:values.plate }; }
    return { clientId, vehicleId, vehicle };
  };
  const mutateOrder = async (actor,id,body,action) => withTransaction(pool, async connection => {
    const found=await findLocked(connection,actor,id); if(!found || !(hasFullOrderAccess(actor)||found.assigned_user_id===actor.id)) fail(404,'Ordem de serviço não encontrada.');
    if (action==='deliver') { if(found.closed_at||found.cancelled_at) fail(409,'Esta OS já foi encerrada.'); if(Number(found.status)!==2) fail(409,'O veículo só pode ser entregue quando a OS estiver Pronta.'); await connection.execute('UPDATE service_orders SET status=3,status_before_close=?,closed_at=?,closed_by=? WHERE id=?',[found.status,new Date(),actor.id,id]); await addOrderEvent(connection,id,actor,'delivered',found.status,3,`Veículo da OS #${id} entregue; OS encerrada.`); await log(connection,actor,'service_order.delivered',id); return resultForOrder(connection,actor,id); }
    if (action==='cancel') { if(found.closed_at||found.cancelled_at) fail(409,'Esta OS já foi encerrada.'); await connection.execute("UPDATE inventory_reservations SET status='CANCELLED' WHERE order_id=? AND workshop_id=? AND status='ACTIVE'",[id,actor.workshopId]); await connection.execute('UPDATE service_orders SET status=4,cancelled_at=?,closed_by=? WHERE id=?',[new Date(),actor.id,id]); await addOrderEvent(connection,id,actor,'cancelled',found.status,4,`OS #${id} cancelada.`); await log(connection,actor,'service_order.cancelled',id); return resultForOrder(connection,actor,id); }
    if (found.cancelled_at) fail(409,'Esta OS foi cancelada e não pode ser reaberta.');
    if (found.closed_at) { if(body.reopen!==true) fail(409,'Esta OS está encerrada e disponível somente para consulta.'); await connection.execute('UPDATE service_orders SET status=COALESCE(status_before_close,2),closed_at=NULL,closed_by=NULL,status_before_close=NULL WHERE id=?',[id]); await addOrderEvent(connection,id,actor,'reopened',found.status_before_close,found.status_before_close,`OS #${id} reaberta pelo administrador.`); return resultForOrder(connection,actor,id); }
    const values=normalizeOrderBody({...found,clientName:body.clientName ?? found.client_name,phone:body.phone ?? found.client_phone,vehicleBrand:body.vehicleBrand ?? found.vehicle_brand,vehicleModel:body.vehicleModel ?? found.vehicle_model,plate:body.plate ?? found.plate,issue:body.issue ?? found.issue,service:body.service ?? found.service,priority:body.priority ?? found.priority,year:body.year ?? found.year,mileage:body.mileage ?? found.mileage});
    if(Object.hasOwn(body,'laborItems')) values.laborItems=await normalizeLaborItems(connection,actor,body.laborItems,true);
    const updates=[]; const params=[]; const fields={client_name:values.clientName,client_phone:values.phone,vehicle_brand:values.vehicleBrand,vehicle_model:values.vehicleModel,plate:values.plate,issue:values.issue,service:values.service,priority:values.priority,year:values.year,mileage:values.mileage}; if(Object.hasOwn(body,'laborItems')) fields.labor_items=JSON.stringify(values.laborItems);
    for(const [field,value] of Object.entries(fields)) if(field==='labor_items' || Object.hasOwn(body,field.replace('_','')) || ['client_name','client_phone','vehicle_brand','vehicle_model','plate','issue','service','priority','year','mileage'].includes(field)&&Object.hasOwn(body,{client_name:'clientName',client_phone:'phone',vehicle_brand:'vehicleBrand',vehicle_model:'vehicleModel',plate:'plate',issue:'issue',service:'service',priority:'priority',year:'year',mileage:'mileage'}[field])) { updates.push(`${field}=?`); params.push(value); }
    if(Object.hasOwn(body,'assignedUserId')) { params.push(body.assignedUserId||null); updates.push('assigned_user_id=?'); }
    if(Object.hasOwn(body,'status')) { const status=Number(body.status); if(!Number.isInteger(status)||status<0||status>2) fail(400,'Status inválido para esta função.'); params.push(status); updates.push('status=?'); }
    updates.push('incomplete=?'); params.push(!(values.clientName&&values.vehicleBrand&&values.vehicleModel&&values.plate&&values.issue)); params.push(id); if(updates.length) await connection.execute(`UPDATE service_orders SET ${updates.join(',')} WHERE id=?`,params);
    const newStatus=Object.hasOwn(body,'status')?Number(body.status):Number(found.status); if(newStatus!==Number(found.status)) await addOrderEvent(connection,id,actor,newStatus===1?'marked_waiting_parts':newStatus===2?'service_finished':'moved_to_entry',found.status,newStatus,`OS #${id} atualizada.`); else await addOrderEvent(connection,id,actor,Object.hasOwn(body,'laborItems')?'labor_updated':'updated',found.status,newStatus,`OS #${id} atualizada.`); await log(connection,actor,'service_order.updated',id); return resultForOrder(connection,actor,id);
  });
  const methods = {
    pool,
    bootstrap: () => bootstrap(pool),
    transaction: callback => withTransaction(pool, callback),
    async close() { await close(pool); },
    async createSession(userId, expiresAt, id = crypto.randomBytes(32).toString('hex')) { await pool.execute('INSERT INTO sessions (id,user_id,expires_at,last_seen_at) VALUES (?,?,?,CURRENT_TIMESTAMP(3))', [id,userId,new Date(expiresAt)]); return id; },
    async session(id) { const [rows] = await pool.execute('SELECT s.*,u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.expires_at>? LIMIT 1', [id,new Date()]); return rows[0] || null; },
    async deleteSession(id) { if (id) await pool.execute('DELETE FROM sessions WHERE id=?', [id]); },
    async deleteUserSessions(userId) { await pool.execute('DELETE FROM sessions WHERE user_id=?', [userId]); },
    async saveUser(row) { await pool.execute('UPDATE users SET name=?,email=?,password_hash=?,phone=?,role=?,status=?,active=?,password_updated_at=?,activated_at=?,last_login_at=?,metadata=? WHERE id=?', [row.name,row.email,row.passwordHash,row.phone,row.role,row.status,row.active,row.passwordUpdatedAt ? new Date(row.passwordUpdatedAt) : null,row.activatedAt ? new Date(row.activatedAt) : null,row.lastLoginAt ? new Date(row.lastLoginAt) : null,JSON.stringify(row.metadata || {}),row.id]); },
    async updateRoleStatus(row) { await pool.execute('UPDATE users SET role=?,status=?,active=? WHERE id=?', [row.role,row.status,row.active,row.id]); },
    async insertUser(row, connection = pool) { await connection.execute('INSERT INTO users (id,workshop_id,name,email,password_hash,phone,role,status,active,state,city,address,created_at,metadata) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [row.id,row.workshopId,row.name,row.email,row.passwordHash || '',row.phone || null,row.role,row.status,row.active,row.state || null,row.city || null,row.address || null,new Date(row.createdAt || Date.now()),JSON.stringify(row.metadata || {})]); },
    async createAccount(row) { await withTransaction(pool, async connection => { await connection.execute('INSERT INTO workshops (id,name,email,phone,city,state,address,focus) VALUES (?,?,?,?,?,?,?,?)', [row.workshopId,row.workshop,row.email,row.phone || null,row.city,row.state,row.address,row.focus || null]); await this.insertUser(row, connection); }); },
    async audit(row) { await pool.execute('INSERT INTO activity_logs (id,workshop_id,user_id,entity_type,entity_id,action,details) VALUES (?,?,?,?,?,?,?)', [row.id || crypto.randomUUID(),row.workshopId || null,row.userId || null,row.entityType || 'legacy',String(row.targetId || ''),row.action,JSON.stringify(row.details || {})]); },
     async listServiceTemplates(actor, includeInactive = false) { const [rows] = await pool.execute(`SELECT * FROM service_templates WHERE workshop_id=?${includeInactive ? '' : ' AND active=TRUE'} ORDER BY name`, [actor.workshopId]); return rows.map(serviceTemplate); },
     async listAiMechanics(actor) {
       const [rows] = await pool.execute("SELECT id,name FROM users WHERE workshop_id=? AND active=TRUE AND UPPER(status)='ACTIVE' AND UPPER(role)='MECHANIC' ORDER BY name", [actor.workshopId]);
       return rows.map(({ id, name }) => ({ id, name }));
     },
    async findServiceTemplate(actor, id) { const [rows] = await pool.execute('SELECT * FROM service_templates WHERE id=? AND workshop_id=? LIMIT 1',[id,actor.workshopId]); return rows[0] ? serviceTemplate(rows[0]) : null; },
    async createServiceTemplate(actor, value) { const id=crypto.randomUUID(); try { await pool.execute('INSERT INTO service_templates (id,workshop_id,name,default_price,active) VALUES (?,?,?,?,?)',[id,actor.workshopId,value.name,value.defaultPrice,value.active]); } catch(error) { if(error.code==='ER_DUP_ENTRY') fail(409,'Já existe um serviço ativo com este nome nesta oficina.'); throw error; } return this.findServiceTemplate(actor,id); },
    async patchServiceTemplate(actor, id, value) { const current=await this.findServiceTemplate(actor,id); if(!current) fail(404,'Serviço não encontrado.'); try { await pool.execute('UPDATE service_templates SET name=?,default_price=?,active=? WHERE id=? AND workshop_id=?',[value.name,value.defaultPrice,value.active,id,actor.workshopId]); } catch(error) { if(error.code==='ER_DUP_ENTRY') fail(409,'Já existe um serviço ativo com este nome nesta oficina.'); throw error; } return this.findServiceTemplate(actor,id); },
    async saveToken(table, row) { const columns = table === 'password_reset_tokens' ? ['id','user_id','token_hash','expires_at','used_at','created_at'] : ['id','user_id','workshop_id','token_hash','expires_at','used_at','created_at']; const values = table === 'password_reset_tokens' ? [row.id,row.userId,row.tokenHash,new Date(row.expiresAt),row.usedAt ? new Date(row.usedAt) : null,new Date(row.createdAt)] : [row.id,row.userId,row.workshopId,row.tokenHash,new Date(row.expiresAt),row.usedAt ? new Date(row.usedAt) : null,new Date(row.createdAt)]; await pool.execute(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')}) ON DUPLICATE KEY UPDATE used_at=VALUES(used_at),expires_at=VALUES(expires_at)`, values); },
     async listOrders(actor, closed = false) {
      const visibility = actor.role && ['OWNER','MANAGER','ATTENDANT'].includes(normalizeRole(actor.role)) ? '' : ' AND o.assigned_user_id=?';
      const params = [actor.workshopId, closed ? 1 : 0]; if (visibility) params.push(actor.id);
      const [rows] = await pool.execute(orderQuery(`WHERE o.workshop_id=? AND (o.closed_at IS NOT NULL OR o.cancelled_at IS NOT NULL)=?${visibility} ORDER BY o.entry_at DESC`), params);
       return Promise.all(rows.map(async row => publicDbOrder(row, await orderHistory(pool, row.id))));
     },
     async revenueReport(actor, from, to, assignedUserId) {
       const params = [actor.workshopId];
       let where = 'WHERE o.workshop_id=?';
       if (assignedUserId) { where += ' AND o.assigned_user_id=?'; params.push(assignedUserId); }
       const [rows] = await pool.execute(`SELECT o.*, u.name AS assigned_user_name
         FROM service_orders o
         LEFT JOIN users u ON u.id=o.assigned_user_id AND u.workshop_id=o.workshop_id
         ${where} ORDER BY o.closed_at ASC, o.id ASC`, params);
       return rows.map(row => {
         const value = order(row);
         return { ...value, assignedUserName:row.assigned_user_name || '', estimatedValue:row.estimated_value == null ? null : Number(row.estimated_value) };
       });
     },
     async findOrder(actor, id, visible = true, connection = pool) {
      const [rows] = await connection.execute(orderQuery('WHERE o.id=? AND o.workshop_id=? LIMIT 1'), [id, actor.workshopId]);
      const row = rows[0];
      if (!row || visible && !(hasFullOrderAccess(actor) || row.assigned_user_id === actor.id)) return null;
       return { ...order(row, await orderHistory(connection, row.id)), _row:row, public:publicDbOrder(row, await orderHistory(connection, row.id)) };
     },
      async findClientByPhone(actor, phone) {
        const [rows] = await pool.execute(`SELECT id,workshop_id,name,phone,created_at FROM clients WHERE workshop_id=? AND ${normalizedPhoneSql}=? LIMIT 1`, [actor.workshopId, phone]);
       return rows[0] ? { id:rows[0].id, workshopId:rows[0].workshop_id, name:rows[0].name, phone:rows[0].phone || '', createdAt:iso(rows[0].created_at) } : null;
     },
      async findVehicleByPlate(actor, plate) {
        const [rows] = await pool.execute('SELECT id,workshop_id,client_id,brand,model,plate,year,mileage,created_at FROM vehicles WHERE workshop_id=? AND plate=? LIMIT 1', [actor.workshopId, plate]);
        return rows[0] ? { id:rows[0].id, workshopId:rows[0].workshop_id, clientId:rows[0].client_id, brand:rows[0].brand, model:rows[0].model, plate:rows[0].plate, year:rows[0].year, mileage:rows[0].mileage || 0, createdAt:iso(rows[0].created_at) } : null;
      },
      async createAiCustomer(actor, value) {
        return withTransaction(pool, async connection => {
          const [workshops] = await connection.execute('SELECT id FROM workshops WHERE id=? FOR UPDATE', [actor.workshopId]);
          if (!workshops[0]) fail(404, 'Oficina não encontrada.');
          const [existing] = await connection.execute(`SELECT id,workshop_id,name,phone,created_at FROM clients WHERE workshop_id=? AND ${normalizedPhoneSql}=? LIMIT 1 FOR UPDATE`, [actor.workshopId, value.phone]);
          if (existing[0]) return { created:false, customer:{ id:existing[0].id, workshopId:existing[0].workshop_id, name:existing[0].name, phone:existing[0].phone || '', createdAt:iso(existing[0].created_at) } };
          const id = crypto.randomUUID(), now = new Date();
          await connection.execute('INSERT INTO clients (id,workshop_id,name,phone,created_at) VALUES (?,?,?,?,?)', [id, actor.workshopId, value.name, value.phone, now]);
          return { created:true, customer:{ id, workshopId:actor.workshopId, name:value.name, phone:value.phone, createdAt:now.toISOString() } };
        });
      },
      async createAiVehicle(actor, value) {
        return withTransaction(pool, async connection => {
          const [workshops] = await connection.execute('SELECT id FROM workshops WHERE id=? FOR UPDATE', [actor.workshopId]);
          if (!workshops[0]) fail(404, 'Oficina não encontrada.');
          const [clients] = await connection.execute(`SELECT id,name,phone FROM clients WHERE workshop_id=? AND ${normalizedPhoneSql}=? LIMIT 1 FOR UPDATE`, [actor.workshopId, value.customerPhone]);
          if (!clients[0]) fail(404, 'Cliente não encontrado.');
          const [existing] = await connection.execute('SELECT id,workshop_id,client_id,brand,model,plate,year,mileage,created_at FROM vehicles WHERE workshop_id=? AND plate=? LIMIT 1 FOR UPDATE', [actor.workshopId, value.plate]);
          if (existing[0]) {
            if (existing[0].client_id !== clients[0].id) fail(409, 'A placa já está vinculada a outro cliente.');
            const row = existing[0];
            return { created:false, vehicle:{ id:row.id, workshopId:row.workshop_id, clientId:row.client_id, brand:row.brand, model:row.model, plate:row.plate, year:row.year, mileage:row.mileage || 0, createdAt:iso(row.created_at) } };
          }
          const id = crypto.randomUUID(), now = new Date();
          await connection.execute('INSERT INTO vehicles (id,workshop_id,client_id,brand,model,plate,year,mileage,created_at) VALUES (?,?,?,?,?,?,?,?,?)', [id, actor.workshopId, clients[0].id, '', value.model, value.plate, value.year, 0, now]);
          return { created:true, vehicle:{ id, workshopId:actor.workshopId, clientId:clients[0].id, brand:'', model:value.model, plate:value.plate, year:value.year, mileage:0, createdAt:now.toISOString() } };
        });
      },
      async createAiOrder(actor, value) {
        return withTransaction(pool, async connection => {
          const [workshops] = await connection.execute('SELECT id FROM workshops WHERE id=? FOR UPDATE', [actor.workshopId]);
          if (!workshops[0]) fail(404, 'Oficina não encontrada.');
          if (value.messageId) {
            const [duplicate] = await connection.execute("SELECT id,metadata FROM service_orders WHERE workshop_id=? AND JSON_UNQUOTE(JSON_EXTRACT(metadata,'$.n8nMessageId'))=? LIMIT 1 FOR UPDATE", [actor.workshopId, value.messageId]);
            if (duplicate[0]) {
              const previousHash = json(duplicate[0].metadata).n8nSelectionHash;
              if (previousHash && previousHash !== value.selectionHash) fail(409, 'messageId reutilizado com outro mecânico ou serviço.');
              return { created:false, ...(await resultForOrder(connection, actor, duplicate[0].id)) };
            }
          }
          if (value.assignedUserId) {
            const [mechanics] = await connection.execute("SELECT id FROM users WHERE id=? AND workshop_id=? AND active=TRUE AND UPPER(status)='ACTIVE' AND UPPER(role)='MECHANIC' LIMIT 1 FOR UPDATE", [value.assignedUserId, actor.workshopId]);
            if (!mechanics[0]) fail(400, 'Mecânico inválido para esta oficina.');
          }
          let template = null, price = null;
          if (value.serviceTemplateId) {
            const [templates] = await connection.execute('SELECT id,name,default_price FROM service_templates WHERE id=? AND workshop_id=? AND active=TRUE LIMIT 1 FOR UPDATE', [value.serviceTemplateId, actor.workshopId]);
            template = templates[0];
            if (!template) fail(400, 'Serviço cadastrado inválido ou inativo.');
            price = Math.round((Number(template.default_price) + Number.EPSILON) * 100) / 100;
            if (!Number.isFinite(price) || price < 0 || price > 1000000) fail(400, 'Preço do catálogo inválido.');
          }
          const [clients] = await connection.execute(`SELECT id,name,phone FROM clients WHERE workshop_id=? AND ${normalizedPhoneSql}=? LIMIT 1 FOR UPDATE`, [actor.workshopId, value.customerPhone]);
          if (!clients[0]) fail(404, 'Cliente não encontrado.');
          const [vehicles] = await connection.execute('SELECT id,client_id,brand,model,plate,year,mileage FROM vehicles WHERE workshop_id=? AND plate=? LIMIT 1 FOR UPDATE', [actor.workshopId, value.plate]);
          if (!vehicles[0]) fail(404, 'Veículo não encontrado.');
          if (vehicles[0].client_id !== clients[0].id) fail(409, 'Veículo não pertence ao cliente informado.');
          const id = await nextOrderId(connection), now = new Date();
          const vehicle = vehicles[0], metadataValue = { ...(value.messageId ? { n8nMessageId:value.messageId } : {}), n8nSelectionHash:value.selectionHash };
          const laborItems = template ? [{ templateId:template.id, description:template.name, value:price }] : [];
          await connection.execute(`INSERT INTO service_orders (id,workshop_id,client_id,vehicle_id,assigned_user_id,created_by,client_name,client_phone,vehicle_brand,vehicle_model,plate,year,mileage,service,issue,status,priority,estimated_value,discount,labor_items,pending_items,entry_at,incomplete,metadata) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [id,actor.workshopId,clients[0].id,vehicle.id,value.assignedUserId || null,null,clients[0].name,clients[0].phone,vehicle.brand || '',vehicle.model,vehicle.plate,vehicle.year,vehicle.mileage || 0,template ? template.name : value.description.slice(0,160),value.description,0,'Normal',price,0,JSON.stringify(laborItems),JSON.stringify([]),now,false,JSON.stringify(metadataValue)]);
          await connection.execute("INSERT INTO order_status_history (order_id,user_id,old_status,new_status,action,note,metadata) VALUES (?,?,?,?,?,?,?)", [id,null,null,0,'created_by_ai',`OS #${id} criada pela integração AI.${template ? ' Preço estimado do catálogo; sujeito a avaliação. Não confirma agendamento.' : ''}`,JSON.stringify({})]);
          await connection.execute('INSERT INTO activity_logs (id,workshop_id,user_id,entity_type,entity_id,action,details) VALUES (?,?,?,?,?,?,?)', [crypto.randomUUID(),actor.workshopId,null,'service_order',String(id),'service_order.created',JSON.stringify({ source:'n8n' })]);
          return { created:true, ...(await resultForOrder(connection, actor, id)) };
        });
      },
      async createQuickOrder(actor, body) {
      return withTransaction(pool, async connection => {
         const values = normalizeOrderBody(body);
         if(body.serviceTemplateId) { const [rows]=await connection.execute('SELECT * FROM service_templates WHERE id=? AND workshop_id=? AND active=TRUE LIMIT 1',[body.serviceTemplateId,actor.workshopId]); if(!rows[0]) fail(400,'Serviço cadastrado inválido ou inativo.'); if(!values.service) values.service=rows[0].name; if(body.laborItems===undefined) values.laborItems=[{templateId:rows[0].id,description:rows[0].name,value:Number(rows[0].default_price)}]; }
         if(body.laborItems!==undefined) values.laborItems=await normalizeLaborItems(connection,actor,body.laborItems,false);
        let assigned = normalizeRole(actor.role) === 'MECHANIC' ? actor.id : null;
        if (normalizeRole(actor.role) !== 'MECHANIC' && body.assignedUserId) assigned = await validMechanic(connection, actor, body.assignedUserId);
        const operationId = body.operationId || null;
        if (operationId) {
          const [old] = await connection.execute('SELECT * FROM service_orders WHERE workshop_id=? AND created_by=? AND creation_operation_id=? LIMIT 1 FOR UPDATE', [actor.workshopId,actor.id,operationId]);
          if (old[0]) { if (old[0].creation_operation_hash !== operationHash(body)) fail(409,'operationId reutilizado com outro conteúdo.'); return resultForOrder(connection, actor, old[0].id); }
        }
        const now = new Date(), id = await nextOrderId(connection);
        const client = await ensureClientVehicle(connection, actor, values, now);
        const incomplete = !(values.clientName && values.phone && values.vehicleBrand && values.vehicleModel && values.plate && values.issue);
        await connection.execute(`INSERT INTO service_orders (id,workshop_id,client_id,vehicle_id,assigned_user_id,created_by,client_name,client_phone,vehicle_brand,vehicle_model,plate,year,mileage,service,issue,status,priority,estimated_value,discount,labor_items,pending_items,creation_operation_id,creation_operation_hash,entry_at,incomplete,metadata) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [id,actor.workshopId,client.clientId,client.vehicleId,assigned,actor.id,values.clientName,values.phone,values.vehicleBrand,values.vehicleModel,values.plate,values.year,values.mileage,values.service,values.issue,0,values.priority,values.estimatedValue,values.discount,JSON.stringify(values.laborItems),JSON.stringify(values.pendingItems),operationId,operationId ? operationHash(body) : null,now,incomplete,JSON.stringify({})]);
        await addOrderEvent(connection,id,actor,'created',null,0,`OS #${id} criada.${client.vehicle?.plate ? ` Veículo ${client.vehicle.plate} vinculado.` : ''}`);
        await log(connection,actor,'service_order.created',id,{ assignedUserId:assigned });
        return resultForOrder(connection, actor, id, client);
      });
    },
    async updateOrder(actor, id, body) { return mutateOrder(actor,id,body,'update'); },
    async deliverOrder(actor, id) { return mutateOrder(actor,id,{},'deliver'); },
    async cancelOrder(actor, id) { return mutateOrder(actor,id,{},'cancel'); },
    async registerVehicle(actor, id, body) {
      return withTransaction(pool, async connection => {
        const found = await findLocked(connection,actor,id); if (!found) fail(404,'Ordem de serviço não encontrada.');
        if (found.vehicle_id) fail(409,'Esta OS já está vinculada a um veículo cadastrado.');
        const name=String(found.client_name||'').trim(), phone=String(found.client_phone||'').trim(), brand=String(found.vehicle_brand||'').trim(), model=String(found.vehicle_model||'').trim(), plate=String(found.plate||'').trim().toUpperCase(), year=Number(body.year), mileage=Number(body.mileage||0);
        if (!name||!phone||!brand||!model||!plate||!Number.isInteger(year)||!Number.isInteger(mileage)||mileage<0) fail(400,'Complete cliente, telefone, marca, modelo, placa, ano e quilometragem antes de cadastrar o veículo.');
        const clientId=crypto.randomUUID(), vehicleId=crypto.randomUUID();
        await connection.execute('INSERT INTO clients (id,workshop_id,name,phone) VALUES (?,?,?,?)',[clientId,actor.workshopId,name,phone]);
        try { await connection.execute('INSERT INTO vehicles (id,workshop_id,client_id,brand,model,plate,year,mileage) VALUES (?,?,?,?,?,?,?,?)',[vehicleId,actor.workshopId,clientId,brand,model,plate,year,mileage]); }
        catch (error) { if (error.code === 'ER_DUP_ENTRY') fail(409,'Esta placa já está cadastrada nesta oficina.'); throw error; }
        await connection.execute('UPDATE service_orders SET client_id=?,vehicle_id=?,year=?,mileage=?,incomplete=? WHERE id=?',[clientId,vehicleId,year,mileage,!(name&&phone&&brand&&model&&plate&&found.issue),id]);
        await addOrderEvent(connection,id,actor,'vehicle_registered',found.status,found.status,`Veículo ${plate} cadastrado e vinculado à OS #${id}.`); await log(connection,actor,'vehicle.registered_from_order',vehicleId,{orderId:id,plate});
        return { order:(await resultForOrder(connection,actor,id)).order, client:{id:clientId,workshopId:actor.workshopId,name,phone,createdAt:new Date().toISOString()}, vehicle:{id:vehicleId,workshopId:actor.workshopId,clientId:clientId,brand,model,plate,year,mileage,createdAt:new Date().toISOString()} };
      });
    },
    history: async actor => methods.listOrders(actor,true)
  };
  return { ...methods };
}

module.exports = { createStore, bootstrap };
