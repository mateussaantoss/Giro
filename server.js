"use strict";

require("dotenv").config();

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const util = require("util");
const express = require("express");
const nodemailer = require("nodemailer");
const { ROLE_PERMISSIONS, normalizeRole, hasPermission } = require("./permissions");
const { createInventory } = require("./inventory");
const { isDatabaseConfigured } = require("./db");
const { createStore } = require("./database/store");
const { createInventoryStore } = require("./database/inventory-store");

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_DIR = process.env.GIRO_DATA_DIR ? path.resolve(process.env.GIRO_DATA_DIR) : path.join(ROOT, "data");
// Isolated test runs provide GIRO_DATA_DIR; production without it uses MySQL when configured.
const DATABASE_MODE = isDatabaseConfigured() && !process.env.GIRO_DATA_DIR;
const store = DATABASE_MODE ? createStore() : null;
let inventory = DATABASE_MODE ? null : createInventory(DATA_DIR);
const LEADS_FILE = path.join(DATA_DIR, "leads.json");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const PASSWORD_RESET_TOKENS_FILE = path.join(DATA_DIR, "password-reset-tokens.json");
const INVITATION_TOKENS_FILE = path.join(DATA_DIR, "invitation-tokens.json");
const SERVICE_ORDERS_FILE = path.join(DATA_DIR, "service-orders.json");
const SERVICE_TEMPLATES_FILE = path.join(DATA_DIR, "service-templates.json");
const WORKSHOP_RECORDS_FILE = path.join(DATA_DIR, "workshop-records.json");
const SESSION_COOKIE = "giro_session";
const SESSION_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const PASSWORD_RESET_MAX_AGE = Math.max(5,Number(process.env.PASSWORD_RESET_TOKEN_MINUTES || 60)) * 60 * 1000;
const PASSWORD_RESET_RATE_WINDOW = Math.max(1,Number(process.env.PASSWORD_RESET_RATE_WINDOW_MINUTES || 15)) * 60 * 1000;
const PASSWORD_RESET_RATE_MAX = Math.max(1,Number(process.env.PASSWORD_RESET_RATE_MAX || 5));
const INVITATION_TOKEN_MAX_AGE = Math.max(1, Number(process.env.INVITATION_TOKEN_HOURS || 48)) * 60 * 60 * 1000;
const INVITATION_RESEND_WINDOW = 60 * 60 * 1000;
const INVITATION_RESEND_MAX = 3;
const N8N_API_TOKEN = typeof process.env.N8N_API_TOKEN === "string" ? process.env.N8N_API_TOKEN : "";
const N8N_WORKSHOP_ID = typeof process.env.N8N_WORKSHOP_ID === "string" ? process.env.N8N_WORKSHOP_ID.trim() : "";
const N8N_TEST_PHONE = normalizeN8nPhone(process.env.N8N_TEST_PHONE || "");
const N8N_TEST_PREFIX = String(process.env.N8N_TEST_PREFIX || "#giro").trim();
const VALID_UFS = new Set(["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"]);
const VALID_DDDS = new Set(["11","12","13","14","15","16","17","18","19","21","22","24","27","28","31","32","33","34","35","37","38","41","42","43","44","45","46","47","48","49","51","53","54","55","61","62","63","64","65","66","67","68","69","71","73","74","75","77","79","81","82","83","84","85","86","87","88","89","91","92","93","94","95","96","97","98","99"]);
const VALID_FOCUS = new Set(["Organizar ordens de serviço","Acompanhar a equipe","Melhorar o atendimento"]);
const scrypt = util.promisify(crypto.scrypt);
const sessions = new Map();
const cityCache = new Map();
let users = [];
let passwordResetTokens = [];
let invitationTokens = [];
let serviceOrders = [];
let serviceTemplates = [];
let workshopRecords = [];
let dummyPasswordHash;
const passwordResetAttempts = new Map();

const PLANS = [
  {
    id: "essencial",
    name: "Essencial",
    tagline: "Para oficinas que estão começando a se organizar.",
    priceMonthly: 79,
    priceYearly: 66,
    priceYearlyTotal: 790,
    featured: false,
    features: [
      "Cadastro ilimitado de clientes e veículos",
      "Ordens de serviço",
      "Histórico de serviços por veículo",
      "Painel de acompanhamento básico",
      "Até 3 usuários",
      "Suporte por WhatsApp"
    ]
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "Para oficinas que querem controle total do fluxo.",
    priceMonthly: 149,
    priceYearly: 124,
    priceYearlyTotal: 1490,
    featured: true,
    features: [
      "Tudo do plano Essencial",
      "Painel Kanban completo",
      "Usuários e permissões ilimitados",
      "Notificações para a equipe",
      "Integração com o WhatsApp da oficina",
      "Até 10 usuários",
      "Atendimento prioritário"
    ]
  },
  {
    id: "total",
    name: "Total",
    tagline: "Para oficinas que querem automatizar o atendimento.",
    priceMonthly: 249,
    priceYearly: 208,
    priceYearlyTotal: 2490,
    featured: false,
    features: [
      "Tudo do plano Pro",
      "Bot de atendimento automatizado no WhatsApp",
      "Usuários ilimitados",
      "Relatórios e métricas da oficina",
      "Onboarding personalizado",
      "Suporte dedicado"
    ]
  }
];

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function normalizeSpaces(value) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function isValidEmail(value) {
  if (!value || value.length > 254 || /\s/.test(value)) return false;
  const parts = value.split("@");
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  if (!local || local.length > 64 || local.startsWith(".") || local.endsWith(".") || local.includes("..")) return false;
  if (!/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local)) return false;
  const labels = domain.split(".");
  return labels.length >= 2 && labels.every(label => label && label.length <= 63 && /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(label)) && /^[A-Za-z]{2,}$/.test(labels.at(-1));
}

function isValidName(value) {
  return value.length >= 3 && value.length <= 80 && (value.match(/\p{L}/gu) || []).length >= 2 && /^[\p{L}\p{M}][\p{L}\p{M}' -]*$/u.test(value);
}

function isValidWorkshop(value) {
  return value.length >= 3 && value.length <= 70 && /[\p{L}\p{N}]/u.test(value);
}

function isValidMobile(value) {
  const digits = typeof value === "string" ? value.replace(/\D/g, "") : "";
  return digits.length === 11 && VALID_DDDS.has(digits.slice(0,2)) && digits[2] === "9";
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = await scrypt(password,salt,64);
  return `${salt}:${hash.toString("hex")}`;
}

function hashResetToken(token) {
  return crypto.createHash("sha256").update(String(token),"utf8").digest("hex");
}

function readJsonArray(file) {
  ensureDataDir();
  if (!fs.existsSync(file)) return [];
  const parsed = JSON.parse(fs.readFileSync(file,"utf8"));
  if (!Array.isArray(parsed)) throw new Error(`Arquivo inválido: ${file}`);
  return parsed;
}

async function verifyPassword(password,storedHash) {
  const [salt,hex] = String(storedHash || "").split(":");
  if (!salt || !hex) return false;
  const expected = Buffer.from(hex,"hex");
  const actual = await scrypt(password,salt,expected.length);
  return expected.length === actual.length && crypto.timingSafeEqual(expected,actual);
}

function readUsers() {
  return readJsonArray(USERS_FILE);
}

function saveUsers() {
  if (DATABASE_MODE) return;
  ensureDataDir();
  fs.writeFileSync(USERS_FILE,JSON.stringify(users,null,2),"utf8");
}

function readPasswordResetTokens() {
  return readJsonArray(PASSWORD_RESET_TOKENS_FILE);
}

function savePasswordResetTokens() {
  if (DATABASE_MODE) return;
  ensureDataDir();
  fs.writeFileSync(PASSWORD_RESET_TOKENS_FILE,JSON.stringify(passwordResetTokens,null,2),"utf8");
}

function saveInvitationTokens() {
  if (DATABASE_MODE) return;
  ensureDataDir();
  fs.writeFileSync(INVITATION_TOKENS_FILE, JSON.stringify(invitationTokens, null, 2), "utf8");
}

function saveServiceOrders() {
  if (DATABASE_MODE) return;
  ensureDataDir();
  fs.writeFileSync(SERVICE_ORDERS_FILE, JSON.stringify(serviceOrders, null, 2), "utf8");
}
function saveServiceTemplates() { if (DATABASE_MODE) return; ensureDataDir(); fs.writeFileSync(SERVICE_TEMPLATES_FILE,JSON.stringify(serviceTemplates,null,2),"utf8"); }

function saveWorkshopRecords() {
  if (DATABASE_MODE) return;
  ensureDataDir();
  fs.writeFileSync(WORKSHOP_RECORDS_FILE, JSON.stringify(workshopRecords, null, 2), "utf8");
}

function n8nToken(req, res, next) {
  const supplied = typeof req.get("X-N8N-Token") === "string" ? req.get("X-N8N-Token") : "";
  if (N8N_API_TOKEN) {
    const expected = Buffer.from(N8N_API_TOKEN);
    const actual = Buffer.from(supplied);
    if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return res.status(401).json({ error:"Token n8n inválido." });
  }
  if (!N8N_API_TOKEN) console.warn("N8N_API_TOKEN não definido: rotas n8n liberadas somente para desenvolvimento.");
  next();
}

function normalizeN8nPhone(value) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/@s\.whatsapp\.net$/i, "").replace(/:\d+$/, "").replace(/\D/g, "");
}

function n8nMessage(body) {
  const data = body?.data;
  const key = data?.key || {};
  const message = data?.message || {};
  const text = typeof message.conversation === "string" ? message.conversation : message.extendedTextMessage?.text;
  const phone = normalizeN8nPhone(data ? key.remoteJid : body?.phone);
  const normalizedText = typeof text === "string" ? text.trim() : typeof body?.text === "string" ? body.text.trim() : "";
  const fromMe = data ? key.fromMe === true : body?.fromMe === true;
  const selfTest = fromMe && N8N_TEST_PHONE && phone === N8N_TEST_PHONE && N8N_TEST_PREFIX && normalizedText.startsWith(N8N_TEST_PREFIX);
  if (fromMe && !selfTest) return { ignored:true, reason:"from_me" };
  if (data && text !== undefined) return { phone, name:typeof data.pushName === "string" ? data.pushName : "", text:normalizedText };
  return { phone, name:typeof body?.name === "string" ? body.name : "", text:normalizedText };
}

function n8nWorkshopRecords() {
  return workshopRecords.find(item => item.workshopId === N8N_WORKSHOP_ID);
}

function n8nRequiredWorkshop(res, mutation = true) {
  if (!N8N_WORKSHOP_ID) { res.status(503).json({ error:"N8N_WORKSHOP_ID não configurado." }); return false; }
  return true;
}

function n8nPlate(value) {
  return typeof value === "string" ? value.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 10) : "";
}

function n8nClient(records, phone) {
  return records?.clients.find(item => normalizeN8nPhone(item.phone) === phone) || null;
}

function templateInput(body, partial = false) {
  const name = normalizeSpaces(body.name);
  const price = Number(body.defaultPrice);
  if ((!partial || Object.hasOwn(body,'name')) && (!name || name.length > 160)) return { error:'name é obrigatório e deve ter até 160 caracteres.' };
  if ((!partial || Object.hasOwn(body,'defaultPrice')) && (!Number.isFinite(price) || price < 0 || price > 1000000)) return { error:'defaultPrice deve ser finito, não negativo e de até 1.000.000.' };
  if ((!partial || Object.hasOwn(body,'active')) && typeof body.active !== 'boolean') return { error:'active deve ser booleano.' };
  return { name, defaultPrice:Math.round(price * 100) / 100, active:body.active === undefined ? true : body.active };
}
function jsonTemplate(actor,id, includeInactive = true) { return serviceTemplates.find(item => item.id === id && item.workshopId === actor.workshopId && (includeInactive || item.active)); }
function normalizeLaborItems(items, actor, allowInactive = false) {
  if (!Array.isArray(items) || items.length > 100) return null;
  const result = items.map(item => {
    if (!item || typeof item.description !== 'string' || typeof item.value !== 'number' || !Number.isFinite(item.value) || item.value < 0 || item.value > 1000000) return null;
    const template = item.templateId ? jsonTemplate(actor,item.templateId,allowInactive) : null;
    if (item.templateId && !template) return null;
    if (item.assignedUserId !== undefined && item.assignedUserId !== null && typeof item.assignedUserId !== 'string') return null;
    return { ...(item.templateId ? { templateId:template.id } : {}), description:normalizeSpaces(item.description).slice(0,2000), value:Math.round(item.value * 100) / 100, ...(item.assignedUserId ? { assignedUserId:item.assignedUserId } : {}) };
  });
  return result.includes(null) || result.some(item => !item.description) ? null : result;
}

function hashInvitationToken(token) {
  return crypto.createHash("sha256").update(String(token), "utf8").digest("hex");
}

function prunePasswordResetTokens() {
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  passwordResetTokens = passwordResetTokens.filter(token => new Date(token.expiresAt).getTime() > cutoff || !token.usedAt);
}

function publicUser(user) {
  const status = user.status || (user.active === false ? "INACTIVE" : "ACTIVE");
  return { id:user.id,name:user.name,email:user.email,phone:user.phone,workshop:user.workshop,workshopId:user.workshopId,role:normalizeRole(user.role),active:status === "ACTIVE",status,state:user.state,city:user.city,address:user.address,focus:user.focus };
}

async function requireAuth(req, res, next) {
  try {
    const user = await sessionUser(req);
    if (!user || user.active === false || user.status === "INACTIVE" || user.status === "PENDING" || !user.workshopId) return res.status(401).json({ error: "Sessão inválida ou expirada." });
    req.user = user;
    next();
  } catch (error) { next(error); }
}

function requirePermission(permission) {
  return (req, res, next) => hasPermission(req.user, permission)
    ? next()
    : res.status(403).json({ error: "Você não possui permissão para esta ação." });
}

function audit(user, action, targetId, details = {}) {
  if (DATABASE_MODE) return store.audit({ workshopId:user.workshopId, userId:user.id, action, targetId, details });
  ensureDataDir();
  const file = path.join(DATA_DIR, "activity-logs.json");
  const entries = readJsonArray(file);
  entries.push({ id: crypto.randomUUID(), workshopId: user.workshopId, userId: user.id, action, targetId, details, createdAt: new Date().toISOString() });
  fs.writeFileSync(file, JSON.stringify(entries, null, 2), "utf8");
}

function parseCookies(req) {
  return Object.fromEntries(String(req.headers.cookie || "").split(";").map(cookie => cookie.trim().split("=")).filter(parts => parts.length === 2).map(([key,value]) => [key,decodeURIComponent(value)]));
}

async function setSession(user,res,secure = false) {
  const token = crypto.randomBytes(32).toString("hex");
  if (DATABASE_MODE) await store.createSession(user.id, Date.now() + SESSION_MAX_AGE, token);
  else sessions.set(token,{ userId:user.id,expiresAt:Date.now() + SESSION_MAX_AGE });
  res.setHeader("Set-Cookie",`${SESSION_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${Math.floor(SESSION_MAX_AGE / 1000)}${secure ? "; Secure" : ""}`);
}

async function clearSession(req,res) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (token) DATABASE_MODE ? await store.deleteSession(token) : sessions.delete(token);
  res.setHeader("Set-Cookie",`${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`);
}

async function clearUserSessions(userId) {
  if (DATABASE_MODE) { await store.deleteUserSessions(userId); return; }
  for (const [token,session] of sessions.entries()) {
    if (session.userId === userId) sessions.delete(token);
  }
}

async function sessionUser(req) {
  const token = parseCookies(req)[SESSION_COOKIE], session = token && sessions.get(token);
  if (DATABASE_MODE) {
    const row = token && await store.session(token);
    return row ? { id:row.id, workshopId:row.workshop_id, name:row.name, email:row.email, phone:row.phone || '', passwordHash:row.password_hash, role:normalizeRole(row.role), status:row.status, active:Boolean(row.active), state:row.state, city:row.city, address:row.address } : null;
  }
  if (!session || session.expiresAt <= Date.now()) { if (token) sessions.delete(token); return null; }
  return users.find(user => user.id === session.userId) || null;
}

async function citiesForState(uf) {
  if (cityCache.has(uf)) return cityCache.get(uf);
  const response = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${encodeURIComponent(uf)}/municipios`,{ signal:AbortSignal.timeout(7000) });
  if (!response.ok) throw new Error("Falha ao validar cidades no IBGE.");
  const data = await response.json();
  const cities = data.map(city => city.nome).filter(Boolean);
  if (!cities.length) throw new Error("Lista de cidades vazia.");
  cityCache.set(uf,cities);
  return cities;
}

function validateRegistration(body) {
  const values = {
    name:normalizeSpaces(body.name), phone:typeof body.phone === "string" ? body.phone : "", workshop:normalizeSpaces(body.workshop),
    state:typeof body.state === "string" ? body.state.trim().toUpperCase() : "", city:normalizeSpaces(body.city), email:normalizeEmail(body.email),
    password:typeof body.password === "string" ? body.password : "", passwordConfirmation:typeof body.passwordConfirmation === "string" ? body.passwordConfirmation : "",
    focus:normalizeSpaces(body.focus), terms:body.terms === true
  };
  const selectedTemplate = body.serviceTemplateId ? jsonTemplate(req.user,body.serviceTemplateId,false) : null;
  if (body.serviceTemplateId && !selectedTemplate) return res.status(400).json({ error:'Serviço cadastrado inválido ou inativo.' });
  if (selectedTemplate && !values.service) values.service = selectedTemplate.name;
  const errors = {};
  if (!isValidName(values.name)) errors.name = "Informe um nome válido.";
  if (!isValidMobile(values.phone)) errors.phone = "Informe um número de WhatsApp válido.";
  if (!isValidWorkshop(values.workshop)) errors.workshop = "Informe o nome da oficina.";
  if (!VALID_UFS.has(values.state)) errors.state = "Selecione um estado válido.";
  if (values.city.length < 2 || values.city.length > 100) errors.city = "Selecione uma cidade válida.";
  if (!isValidEmail(values.email)) errors.email = "E-mail inválido.";
  if (!values.password.trim() || values.password.length < 8 || values.password.length > 128) errors.password = "A senha deve ter entre 8 e 128 caracteres.";
  if (values.passwordConfirmation !== values.password) errors.passwordConfirmation = "As senhas não coincidem.";
  if (!VALID_FOCUS.has(values.focus)) errors.focus = "Selecione um foco inicial válido.";
  if (!values.terms) errors.terms = "Confirme o aceite para continuar.";
  return { values,errors };
}

function validateNewPassword(body) {
  const password = typeof body.password === "string" ? body.password : "";
  const confirmPassword = typeof body.confirmPassword === "string" ? body.confirmPassword : "";
  const errors = {};
  if (!password.trim() || password.length < 8 || password.length > 128) errors.password = "A senha deve ter entre 8 e 128 caracteres.";
  if (confirmPassword !== password) errors.confirmPassword = "As senhas não coincidem.";
  return { password,confirmPassword,errors };
}

function inviteRoleLabel(role) {
  return ({ MANAGER:"Gerente", ATTENDANT:"Atendente", MECHANIC:"Mecânico" })[normalizeRole(role)];
}

function clientKey(req,email = "") {
  return `${req.ip || req.socket.remoteAddress || "unknown"}:${normalizeEmail(email)}`;
}

function checkPasswordResetRateLimit(req,email) {
  const key = clientKey(req,email), now = Date.now();
  const record = passwordResetAttempts.get(key);
  if (!record || record.resetAt <= now) {
    passwordResetAttempts.set(key,{ count:1,resetAt:now + PASSWORD_RESET_RATE_WINDOW });
    return true;
  }
  if (record.count >= PASSWORD_RESET_RATE_MAX) return false;
  record.count++;
  return true;
}

function smtpConfig() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const from = process.env.SMTP_FROM;
  if (!host || !from) return null;
  const auth = process.env.SMTP_USER || process.env.SMTP_PASS ? { user:process.env.SMTP_USER,pass:process.env.SMTP_PASS } : undefined;
  const secure = String(process.env.SMTP_SECURE || "").toLowerCase() === "true" || port === 465;
  const requireTLS = String(process.env.SMTP_REQUIRE_TLS ?? (!secure && port === 587)).toLowerCase() === "true";
  return { host,port,secure,requireTLS,auth,from };
}

function smtpTransporter(config) {
  return nodemailer.createTransport({
    host:config.host,
    port:config.port,
    secure:config.secure,
    requireTLS:config.requireTLS,
    auth:config.auth,
    tls:{ servername:config.host },
    connectionTimeout:15000,
    greetingTimeout:15000,
    socketTimeout:30000
  });
}

function resetAppUrl(req) {
  const configured = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
  return configured.replace(/\/+$/,"");
}

function htmlEscape(value) {
  return String(value ?? "").replace(/[&<>"]/g,char => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[char]));
}

async function sendPasswordResetEmail(user,resetUrl) {
  const config = smtpConfig();
  if (!config) throw new Error("SMTP não configurado.");
  const transporter = smtpTransporter(config);
  const minutes = Math.round(PASSWORD_RESET_MAX_AGE / 60000);
  const name = htmlEscape(user.name || "");
  const safeUrl = htmlEscape(resetUrl);
  await transporter.sendMail({
    from:config.from,
    to:user.email,
    subject:"Redefinição de senha do GIRO",
    text:[
      `Olá${user.name ? `, ${user.name}` : ""}.`,
      "Recebemos uma solicitação para redefinir sua senha no GIRO.",
      `Acesse o link abaixo para criar uma nova senha. O link vale por ${minutes} minutos e só pode ser usado uma vez:`,
      resetUrl,
      "Se você não solicitou essa alteração, ignore este e-mail. Sua senha atual continuará válida."
    ].join("\n\n"),
    html:`<!doctype html><html lang="pt-BR"><body style="margin:0;background:#0b0f14;font-family:Inter,Arial,sans-serif;color:#f5f7fa"><div style="max-width:560px;margin:0 auto;padding:32px 20px"><div style="background:#151b23;border:1px solid #2b3036;border-radius:10px;padding:28px"><div style="font-size:28px;font-weight:900;font-style:italic;letter-spacing:1px;color:#38bdf8;margin-bottom:24px">GIRO</div><h1 style="font-size:24px;line-height:1.25;margin:0 0 12px;color:#fff">Redefina sua senha</h1><p style="font-size:15px;line-height:1.7;color:#cbd5e1;margin:0 0 18px">Olá${name ? `, ${name}` : ""}. Recebemos uma solicitação para redefinir a senha da sua conta no GIRO.</p><p style="font-size:15px;line-height:1.7;color:#cbd5e1;margin:0 0 24px">Este link é válido por ${minutes} minutos e pode ser usado apenas uma vez.</p><a href="${safeUrl}" style="display:inline-block;background:#0ea5e9;color:#fff;text-decoration:none;font-weight:700;border-radius:7px;padding:13px 18px">Redefinir minha senha</a><p style="font-size:13px;line-height:1.7;color:#94a3b8;margin:18px 0 0">Se você não solicitou essa alteração, ignore este e-mail. Sua senha atual continuará válida.</p></div></div></body></html>`
  });
}

async function sendInvitationEmail(user, token, req) {
  const config = smtpConfig();
  if (!config) throw new Error("SMTP não configurado.");
  const url = `${resetAppUrl(req)}/app/#/ativar-conta?token=${encodeURIComponent(token)}`;
  const safeUrl = htmlEscape(url), name = htmlEscape(user.name), workshop = htmlEscape(user.workshop), role = inviteRoleLabel(user.role);
  const hours = Math.round(INVITATION_TOKEN_MAX_AGE / 3600000);
  await smtpTransporter(config).sendMail({
    from:config.from,
    to:user.email,
    subject:"Você foi convidado para o GIRO",
    text:[`Olá, ${user.name}.`, `A oficina ${user.workshop} adicionou você à equipe como ${role}.`, "Para acessar sua conta, crie sua senha no link abaixo:", url, `Este convite expira em ${hours} horas, pode ser utilizado uma vez e deverá ser solicitado novamente caso expire.`, "Caso não reconheça este convite, ignore este e-mail."].join("\n\n"),
    html:`<!doctype html><html lang="pt-BR"><body style="margin:0;background:#0b0f14;font-family:Inter,Arial,sans-serif;color:#f5f7fa"><div style="max-width:560px;margin:0 auto;padding:32px 20px"><div style="background:#151b23;border:1px solid #2b3036;border-radius:10px;padding:28px"><div style="font-size:28px;font-weight:900;font-style:italic;letter-spacing:1px;color:#38bdf8;margin-bottom:24px">GIRO</div><h1 style="font-size:24px;line-height:1.25;margin:0 0 12px;color:#fff">Você foi convidado para o GIRO</h1><p style="font-size:15px;line-height:1.7;color:#cbd5e1">Olá, ${name}. A oficina <strong>${workshop}</strong> adicionou você à equipe como <strong>${role}</strong>.</p><p style="font-size:15px;line-height:1.7;color:#cbd5e1;margin:0 0 24px">Crie sua senha para acessar sua conta. Este convite expira em ${hours} horas e só pode ser utilizado uma vez.</p><a href="${safeUrl}" style="display:inline-block;background:#0ea5e9;color:#fff;text-decoration:none;font-weight:700;border-radius:7px;padding:13px 18px">Criar minha senha</a><p style="font-size:13px;line-height:1.7;color:#94a3b8;margin:18px 0 0">Caso você não reconheça este convite, ignore este e-mail.</p></div></div></body></html>`
  });
}

async function issueInvitation(user, req) {
  if (!smtpConfig()) throw Object.assign(new Error("Serviço de e-mail indisponível."), { code:"SMTP_UNAVAILABLE" });
  const now = new Date().toISOString();
  invitationTokens = invitationTokens.map(record => record.userId === user.id && !record.usedAt ? { ...record, usedAt:now } : record);
  const token = crypto.randomBytes(32).toString("base64url");
  const record = { id:crypto.randomUUID(), userId:user.id, workshopId:user.workshopId, tokenHash:hashInvitationToken(token), expiresAt:new Date(Date.now() + INVITATION_TOKEN_MAX_AGE).toISOString(), usedAt:null, createdAt:now };
    invitationTokens.push(record);
    if (DATABASE_MODE) await store.saveToken("invitation_tokens", record); else saveInvitationTokens();
  try {
    await sendInvitationEmail(user, token, req);
    return record;
  } catch (error) {
     record.usedAt = new Date().toISOString();
     if (DATABASE_MODE) await store.saveToken("invitation_tokens", record); else saveInvitationTokens();
    throw error;
  }
}

async function sendLeadEmail(lead) {
  const config = smtpConfig();
  if (!config) throw new Error("SMTP não configurado.");
  const recipient = process.env.LEADS_TO_EMAIL || config.auth?.user || config.from;
  const state = htmlEscape(lead.stateName ? `${lead.stateName} - ${lead.state}` : lead.state);
  const name = htmlEscape(lead.nome);
  const workshop = htmlEscape(lead.oficina);
  const city = htmlEscape(lead.city);
  const phone = htmlEscape(lead.whats);
  const email = htmlEscape(lead.email);
  const message = htmlEscape(lead.mensagem);
  await smtpTransporter(config).sendMail({
    from:config.from,
    to:recipient,
    replyTo:lead.email,
    subject:`Nova solicitação de demonstração · ${lead.oficina}`,
    text:[
      "Nova solicitação de demonstração do GIRO.",
      `Nome: ${lead.nome}`,
      `Oficina: ${lead.oficina}`,
      `WhatsApp: ${lead.whats}`,
      `E-mail: ${lead.email}`,
      `Estado: ${lead.stateName ? `${lead.stateName} - ${lead.state}` : lead.state}`,
      `Cidade: ${lead.city}`,
      `Mensagem: ${lead.mensagem}`
    ].join("\n"),
    html:`<!doctype html><html lang="pt-BR"><body style="margin:0;background:#0b0f14;font-family:Inter,Arial,sans-serif;color:#f5f7fa"><div style="max-width:560px;margin:0 auto;padding:32px 20px"><div style="background:#151b23;border:1px solid #2b3036;border-radius:10px;padding:28px"><div style="font-size:28px;font-weight:900;font-style:italic;letter-spacing:1px;color:#38bdf8;margin-bottom:24px">GIRO</div><h1 style="font-size:24px;line-height:1.25;margin:0 0 20px;color:#fff">Nova solicitação de demonstração</h1><p style="font-size:15px;line-height:1.7;color:#cbd5e1;margin:0 0 8px"><strong>Nome:</strong> ${name}</p><p style="font-size:15px;line-height:1.7;color:#cbd5e1;margin:0 0 8px"><strong>Oficina:</strong> ${workshop}</p><p style="font-size:15px;line-height:1.7;color:#cbd5e1;margin:0 0 8px"><strong>WhatsApp:</strong> ${phone}</p><p style="font-size:15px;line-height:1.7;color:#cbd5e1;margin:0 0 8px"><strong>E-mail:</strong> ${email}</p><p style="font-size:15px;line-height:1.7;color:#cbd5e1;margin:0 0 8px"><strong>Estado:</strong> ${state}</p><p style="font-size:15px;line-height:1.7;color:#cbd5e1;margin:0 0 18px"><strong>Cidade:</strong> ${city}</p><div style="border-top:1px solid #2b3036;padding-top:18px;font-size:15px;line-height:1.7;color:#cbd5e1"><strong>Mensagem:</strong><br>${message}</div></div></div></body></html>`
  });
}

async function bootstrapUsers() {
  if (DATABASE_MODE) {
    const loaded = await store.bootstrap();
    users = loaded.users;
    serviceOrders = loaded.serviceOrders;
    serviceTemplates = [];
    workshopRecords = loaded.workshopRecords;
    passwordResetTokens = loaded.passwordResetTokens;
    invitationTokens = loaded.invitationTokens;
    globalThis.__giroDbLeads = loaded.leads;
    inventory = createInventoryStore(store.pool);
    dummyPasswordHash = await hashPassword(crypto.randomBytes(20).toString("hex"));
    return;
  }
  users = readUsers();
  invitationTokens = readJsonArray(INVITATION_TOKENS_FILE);
  serviceOrders = readJsonArray(SERVICE_ORDERS_FILE);
  serviceTemplates = readJsonArray(SERVICE_TEMPLATES_FILE);
  workshopRecords = readJsonArray(WORKSHOP_RECORDS_FILE);
  let migratedOrderStatuses = false;
  const oldToNewStatus = { 0:0, 1:0, 2:0, 3:1, 4:0, 5:0, 6:2 };
  for (const order of serviceOrders) {
    if (order.statusVersion === 2) continue;
    order.status = oldToNewStatus[order.status] ?? 0;
    order.statusVersion = 2;
    migratedOrderStatuses = true;
  }
  if (migratedOrderStatuses) saveServiceOrders();
  users.forEach(user => {
    user.role = normalizeRole(user.role || "OWNER");
    user.status = String(user.status || (user.active === false ? "INACTIVE" : "ACTIVE")).toUpperCase();
    user.active = user.active !== false && user.status === "ACTIVE";
    if (!user.workshopId) {
      // Legacy account ownership cannot safely be inferred from a workshop name.
      // Give each legacy account its own tenant rather than accidentally merging offices.
      user.workshopId = crypto.randomUUID();
    }
  });
  saveUsers();
  passwordResetTokens = readPasswordResetTokens();
  prunePasswordResetTokens();
  savePasswordResetTokens();
  dummyPasswordHash = await hashPassword(crypto.randomBytes(20).toString("hex"));
}

function readLeads() {
  ensureDataDir();
  if (!fs.existsSync(LEADS_FILE)) {
    return [];
  }
  try {
    return JSON.parse(fs.readFileSync(LEADS_FILE, "utf8"));
  } catch (err) {
    return [];
  }
}

function isValidLead(body) {
  return (
    body &&
    typeof body.nome === "string" && body.nome.trim().length >= 2 &&
    typeof body.oficina === "string" && body.oficina.trim().length >= 2 &&
    typeof body.whats === "string" && body.whats.replace(/\D/g, "").length >= 10 &&
    typeof body.email === "string" && /.+@.+\..+/.test(body.email) &&
    typeof body.state === "string" && VALID_UFS.has(body.state.trim().toUpperCase()) &&
    typeof body.city === "string" && body.city.trim().length >= 3 &&
    typeof body.mensagem === "string"
  );
}

function reportBoundary(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const source = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(source)) {
    const [year, month, day] = source.split("-").map(Number);
    const start = new Date(Date.UTC(year, month - 1, day));
    if (start.getUTCFullYear() !== year || start.getUTCMonth() !== month - 1 || start.getUTCDate() !== day) return null;
    return start;
  }
  const date = new Date(source);
  return Number.isNaN(date.getTime()) ? null : date;
}

function defaultReportPeriod(now = new Date()) {
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { from, to };
}

function reportPeriod(query) {
  const defaults = defaultReportPeriod();
  const from = query.from === undefined ? defaults.from : reportBoundary(query.from);
  const to = query.to === undefined ? defaults.to : reportBoundary(query.to);
  if (!from || !to || from >= to) throw Object.assign(new Error("Período inválido: informe from menor que to."), { status:400 });
  return { from, to };
}

function revenueValue(order) {
  const labor = (Array.isArray(order.laborItems) ? order.laborItems : []).reduce((sum, item) => sum + Number(item?.value || 0), 0);
  const discount = Number(order.discount || 0);
  const estimated = Number(order.estimatedValue);
  const total = order.closedAt && Number.isFinite(estimated) && estimated > 0 ? estimated : Math.max(0, labor - discount);
  return { labor, discount, total };
}

function reportMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function buildRevenueReport(rows, users, actor, period, assignedUserId) {
  const scoped = rows.filter(order => order.workshopId === actor.workshopId && (!assignedUserId || order.assignedUserId === assignedUserId));
  const from = period.from.getTime(), to = period.to.getTime();
  const inPeriod = date => { const time = new Date(date || 0).getTime(); return Number.isFinite(time) && time >= from && time < to; };
  const realized = scoped.filter(order => order.closedAt && !order.cancelledAt && inPeriod(order.closedAt));
  const cancelled = scoped.filter(order => order.cancelledAt && inPeriod(order.cancelledAt));
  const active = scoped.filter(order => !order.closedAt && !order.cancelledAt);
  const status = { ENTRY:0, WAITING_PARTS:0, READY:0, DELIVERED:0, CANCELLED:cancelled.length };
  for (const order of active) {
    const key = ({ 0:"ENTRY", 1:"WAITING_PARTS", 2:"READY" })[Number(order.status)];
    if (key) status[key]++;
  }
  status.DELIVERED = realized.length;
  const summary = realized.reduce((result, order) => {
    const value = revenueValue(order);
    result.grossLabor += value.labor;
    result.discount += value.discount;
    result.netRevenue += value.total;
    return result;
  }, { grossLabor:0, discount:0, netRevenue:0 });
  const byPeriod = new Map();
  const byMechanic = new Map();
  for (const order of realized) {
    const value = revenueValue(order);
    const date = new Date(order.closedAt).toISOString().slice(0, 10);
    const day = byPeriod.get(date) || { date, orders:0, grossLabor:0, discount:0, netRevenue:0 };
    day.orders++; day.grossLabor += value.labor; day.discount += value.discount; day.netRevenue += value.total;
    byPeriod.set(date, day);
    const user = users.find(item => item.id === order.assignedUserId && item.workshopId === actor.workshopId);
    const mechanic = byMechanic.get(order.assignedUserId || "") || { userId:order.assignedUserId || null, name:order.assignedUserName || user?.name || "", orders:0, netRevenue:0 };
    mechanic.orders++; mechanic.netRevenue += value.total;
    byMechanic.set(order.assignedUserId || "", mechanic);
  }
  const orders = realized.map(order => {
    const value = revenueValue(order);
    const user = users.find(item => item.id === order.assignedUserId && item.workshopId === actor.workshopId);
    return { id:order.id, closedAt:order.closedAt, clientName:order.clientName || "", vehicleBrand:order.vehicleBrand || "", vehicleModel:order.vehicleModel || "", plate:order.plate || "", assignedUserName:order.assignedUserName || user?.name || "", estimatedValue:order.estimatedValue ?? null, laborTotal:reportMoney(value.labor), discount:reportMoney(value.discount), total:reportMoney(value.total) };
  });
  return { period:{ from:period.from.toISOString(), to:period.to.toISOString(), dateField:"closedAt" }, summary:{ orders:realized.length, deliveredOrders:realized.length, readyOrders:active.filter(order => Number(order.status) === 2).length, cancelledOrders:cancelled.length, grossParts:0, grossLabor:reportMoney(summary.grossLabor), discount:reportMoney(summary.discount), netRevenue:reportMoney(summary.netRevenue), averageTicket:realized.length ? reportMoney(summary.netRevenue / realized.length) : 0 }, byPeriod:[...byPeriod.values()].map(day => ({ ...day, grossLabor:reportMoney(day.grossLabor), discount:reportMoney(day.discount), netRevenue:reportMoney(day.netRevenue) })).sort((a,b) => a.date.localeCompare(b.date)), byStatus:status, byMechanic:[...byMechanic.values()].map(mechanic => ({ ...mechanic, netRevenue:reportMoney(mechanic.netRevenue) })).sort((a,b) => a.name.localeCompare(b.name,"pt-BR")), orders };
}

function csvCell(value) {
  let text = String(value ?? "");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function revenueCsv(report) {
  const header = ["id","closedAt","clientName","vehicleBrand","vehicleModel","plate","assignedUserName","estimatedValue","laborTotal","discount","total"];
  return [header, ...report.orders.map(order => header.map(key => order[key]))].map(row => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

app.set("trust proxy", 1);

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

app.use(express.json({ limit: "100kb" }));

app.use("/data",(req,res) => res.status(404).json({ error:"Rota não encontrada." }));

// Integração n8n/Evolution: não usa sessão de navegador nem persiste mensagens recebidas.
app.post("/api/whatsapp/messages", n8nToken, (req, res) => {
  const value = n8nMessage(req.body || {});
  if (value.ignored) return res.json(value);
  if (!value.text) return res.json({ ignored:true, reason:"unsupported_event" });
  const phone = normalizeN8nPhone(value.phone);
  if (phone.length < 10 || phone.length > 15) return res.status(400).json({ error:"phone deve conter de 10 a 15 dígitos." });
  const name = String(value.name || "").trim().slice(0, 120);
  const text = String(value.text).trim().slice(0, 2000);
  if (!text) return res.json({ ignored:true, reason:"unsupported_event" });
  console.info("n8n whatsapp message accepted", { workshopId:N8N_WORKSHOP_ID || null, phoneDigits:phone.length });
  res.json({ message:{ phone, name, text } });
});

app.get("/api/ai/customers", n8nToken, async (req, res, next) => {
  if (!n8nRequiredWorkshop(res, false)) return;
  const phone = normalizeN8nPhone(req.query.phone);
  if (phone.length < 10 || phone.length > 15) return res.status(400).json({ error:"phone deve conter de 10 a 15 dígitos." });
  try {
    const customer = DATABASE_MODE ? await store.findClientByPhone({ workshopId:N8N_WORKSHOP_ID }, phone) : n8nClient(n8nWorkshopRecords(), phone);
    if (!customer) return res.status(404).json({ error:"Cliente não encontrado." });
    res.json({ customer });
  } catch (error) { next(error); }
});

app.post("/api/ai/customers", n8nToken, async (req, res, next) => {
  if (!n8nRequiredWorkshop(res)) return;
  const phone = normalizeN8nPhone(req.body?.phone), name = typeof req.body?.name === "string" ? req.body.name.trim().slice(0, 120) : "";
  if (phone.length < 10 || phone.length > 15 || !name) return res.status(400).json({ error:"name e phone válidos são obrigatórios." });
  if (DATABASE_MODE) {
    try { const result = await store.createAiCustomer({ workshopId:N8N_WORKSHOP_ID }, { name, phone }); return res.status(result.created ? 201 : 200).json({ ok:true, ...result }); }
    catch (error) { return next(error); }
  }
  let records = n8nWorkshopRecords();
  if (!records) { records = { workshopId:N8N_WORKSHOP_ID, clients:[], vehicles:[] }; workshopRecords.push(records); }
  const existing = n8nClient(records, phone);
  if (existing) return res.json({ ok:true, created:false, customer:existing });
  const customer = { id:crypto.randomUUID(), workshopId:N8N_WORKSHOP_ID, name, phone, createdAt:new Date().toISOString() };
  records.clients.push(customer); saveWorkshopRecords();
  console.info("n8n customer created", { workshopId:N8N_WORKSHOP_ID });
  res.status(201).json({ ok:true, created:true, customer });
});

app.get("/api/ai/vehicles", n8nToken, async (req, res, next) => {
  if (!n8nRequiredWorkshop(res, false)) return;
  const plate = n8nPlate(req.query.plate), records = n8nWorkshopRecords();
  if (!plate) return res.status(400).json({ error:"plate é obrigatória." });
  try {
    const vehicle = DATABASE_MODE ? await store.findVehicleByPlate({ workshopId:N8N_WORKSHOP_ID }, plate) : records?.vehicles.find(item => item.plate === plate);
    if (!vehicle) return res.status(404).json({ error:"Veículo não encontrado." });
    res.json({ vehicle });
  } catch (error) { next(error); }
});

app.post("/api/ai/vehicles", n8nToken, async (req, res, next) => {
  if (!n8nRequiredWorkshop(res)) return;
  const plate = n8nPlate(req.body?.plate), model = typeof req.body?.model === "string" ? req.body.model.trim().slice(0, 120) : "";
  const customerPhone = normalizeN8nPhone(req.body?.customerPhone), year = Number(req.body?.year);
  if (!plate || !model || !Number.isInteger(year) || year < 1950 || year > new Date().getFullYear() + 1 || customerPhone.length < 10 || customerPhone.length > 15) return res.status(400).json({ error:"plate, model, year e customerPhone válidos são obrigatórios." });
  if (DATABASE_MODE) {
    try { const result = await store.createAiVehicle({ workshopId:N8N_WORKSHOP_ID }, { plate, model, year, customerPhone }); return res.status(result.created ? 201 : 200).json({ ok:true, ...result }); }
    catch (error) { return next(error); }
  }
  const records = n8nWorkshopRecords();
  const customer = n8nClient(records, customerPhone);
  if (!customer) return res.status(404).json({ error:"Cliente não encontrado." });
  const existing = records.vehicles.find(item => item.plate === plate);
  if (existing) {
    if (existing.clientId !== customer.id) return res.status(409).json({ error:"A placa já está vinculada a outro cliente." });
    return res.json({ ok:true, created:false, vehicle:existing });
  }
  const vehicle = { id:crypto.randomUUID(), workshopId:N8N_WORKSHOP_ID, clientId:customer.id, brand:"", model, plate, year, mileage:0, createdAt:new Date().toISOString() };
  records.vehicles.push(vehicle); saveWorkshopRecords();
  console.info("n8n vehicle created", { workshopId:N8N_WORKSHOP_ID, plate });
  res.status(201).json({ ok:true, created:true, vehicle });
});

app.get("/api/ai/mechanics", n8nToken, async (req, res, next) => {
  if (!n8nRequiredWorkshop(res, false)) return;
  try {
    const mechanics = DATABASE_MODE ? await store.listAiMechanics({ workshopId:N8N_WORKSHOP_ID }) : users.filter(user => user.workshopId === N8N_WORKSHOP_ID && normalizeRole(user.role) === "MECHANIC" && user.status === "ACTIVE" && user.active !== false).map(({ id, name }) => ({ id, name }));
    res.json({ mechanics });
  } catch (error) { next(error); }
});

app.get("/api/ai/services", n8nToken, async (req, res, next) => {
  if (!n8nRequiredWorkshop(res, false)) return;
  if (req.query.q !== undefined && typeof req.query.q !== "string") return res.status(400).json({ error:"q deve ser texto." });
  const q = (req.query.q || "").trim().toLocaleLowerCase("pt-BR");
  try {
    const templates = DATABASE_MODE ? await store.listServiceTemplates({ workshopId:N8N_WORKSHOP_ID }) : serviceTemplates.filter(item => item.workshopId === N8N_WORKSHOP_ID && item.active === true);
    res.json({ services:templates.filter(item => item.name.toLocaleLowerCase("pt-BR").includes(q)).map(({ id, name, defaultPrice }) => ({ id, name, defaultPrice })) });
  } catch (error) { next(error); }
});

app.post("/api/ai/service-orders", n8nToken, async (req, res, next) => {
  if (!n8nRequiredWorkshop(res)) return;
  const plate = n8nPlate(req.body?.plate), description = typeof req.body?.description === "string" ? req.body.description.trim().slice(0, 2000) : "";
  const customerPhone = normalizeN8nPhone(req.body?.customerPhone);
  const messageId = typeof req.get("X-Message-Id") === "string" && req.get("X-Message-Id").trim() ? req.get("X-Message-Id").trim().slice(0, 200) : (typeof req.body?.messageId === "string" ? req.body.messageId.trim().slice(0, 200) : "");
  if (!plate || !description || customerPhone.length < 10 || customerPhone.length > 15) return res.status(400).json({ error:"plate, description e customerPhone válidos são obrigatórios." });
  for (const field of ["assignedUserId", "serviceTemplateId"]) {
    if (req.body?.[field] != null && typeof req.body[field] !== "string") return res.status(400).json({ error:`${field} deve ser um ID textual.` });
  }
  const assignedUserId = req.body?.assignedUserId?.trim() || null, serviceTemplateId = req.body?.serviceTemplateId?.trim() || null;
  const selectionHash = crypto.createHash("sha256").update(JSON.stringify([assignedUserId, serviceTemplateId])).digest("hex");
  if (DATABASE_MODE) {
    try { const result = await store.createAiOrder({ workshopId:N8N_WORKSHOP_ID }, { plate, description, customerPhone, messageId, assignedUserId, serviceTemplateId, selectionHash }); return res.status(result.created ? 201 : 200).json({ ok:true, ...result }); }
    catch (error) { return next(error); }
  }
  const duplicate = messageId && serviceOrders.find(item => item.workshopId === N8N_WORKSHOP_ID && item.n8nMessageId === messageId);
  if (duplicate) {
    if (duplicate.n8nSelectionHash && duplicate.n8nSelectionHash !== selectionHash) return res.status(409).json({ error:"messageId reutilizado com outro mecânico ou serviço." });
    return res.json({ ok:true, created:false, order:{ ...publicOrder(duplicate), estimatedValue:duplicate.estimatedValue ?? null } });
  }
  if (assignedUserId && !users.some(user => user.id === assignedUserId && user.workshopId === N8N_WORKSHOP_ID && normalizeRole(user.role) === "MECHANIC" && user.status === "ACTIVE" && user.active !== false)) return res.status(400).json({ error:"Mecânico inválido para esta oficina." });
  const template = serviceTemplateId ? serviceTemplates.find(item => item.id === serviceTemplateId && item.workshopId === N8N_WORKSHOP_ID && item.active === true) : null;
  if (serviceTemplateId && !template) return res.status(400).json({ error:"Serviço cadastrado inválido ou inativo." });
  const price = template ? Math.round((Number(template.defaultPrice) + Number.EPSILON) * 100) / 100 : null;
  if (template && (!Number.isFinite(price) || price < 0 || price > 1000000)) return res.status(400).json({ error:"Preço do catálogo inválido." });
  const records = n8nWorkshopRecords(), customer = n8nClient(records, customerPhone), vehicle = records?.vehicles.find(item => item.plate === plate);
  if (!customer) return res.status(404).json({ error:"Cliente não encontrado." });
  if (!vehicle) return res.status(404).json({ error:"Veículo não encontrado." });
  if (vehicle.clientId !== customer.id) return res.status(409).json({ error:"Veículo não pertence ao cliente informado." });
  const now = new Date().toISOString(), id = Math.max(0, ...serviceOrders.map(item => Number(item.id) || 0)) + 1;
  const order = {
    id, statusVersion:2, workshopId:N8N_WORKSHOP_ID, clientId:customer.id, vehicleId:vehicle.id,
    clientName:customer.name, phone:customer.phone, vehicleBrand:vehicle.brand || "", vehicleModel:vehicle.model,
    plate:vehicle.plate, year:vehicle.year, mileage:vehicle.mileage || 0, issue:description,
    service:template ? template.name : description, status:0, priority:"Normal", estimatedValue:price, discount:0,
    laborItems:template ? [{ templateId:template.id, description:template.name, value:price }] : [], pendingItems:[],
    entryAt:now, startedAt:null, finishedAt:null, paused:false, late:false, createdBy:`n8n:${N8N_WORKSHOP_ID}`,
    assignedUserId, incomplete:false, history:[{ userId:null, action:"created_by_ai", at:now }],
    n8nSelectionHash:selectionHash, ...(messageId ? { n8nMessageId:messageId } : {})
  };
  if (template) order.history[0].text = "Preço estimado do catálogo; sujeito a avaliação. Não confirma agendamento.";
  serviceOrders.push(order);
  try { saveServiceOrders(); } catch (error) { serviceOrders.pop(); console.error("Falha ao salvar OS n8n", { workshopId:N8N_WORKSHOP_ID, error:error.message }); return res.status(500).json({ error:"Não foi possível salvar a ordem de serviço." }); }
  console.info("n8n service order created", { workshopId:N8N_WORKSHOP_ID, orderId:id });
  res.status(201).json({ ok:true, created:true, order:{ ...publicOrder(order), estimatedValue:order.estimatedValue } });
});

async function revenueReportForRequest(req) {
  const period = reportPeriod(req.query || {});
  const assignedUserId = typeof req.query.assignedUserId === "string" && req.query.assignedUserId.trim() ? req.query.assignedUserId.trim() : null;
  const rows = DATABASE_MODE ? await store.revenueReport(req.user, period.from, period.to, assignedUserId) : serviceOrders;
  return buildRevenueReport(rows, users, req.user, period, assignedUserId);
}

app.get("/api/reports/revenue.csv", requireAuth, requirePermission("reports.view"), async (req,res,next) => {
  try {
    const report = await revenueReportForRequest(req);
    res.type("text/csv; charset=utf-8").set("Content-Disposition", "attachment; filename=relatorio-receita.csv").send("\uFEFF" + revenueCsv(report));
  } catch (error) { next(error); }
});

app.get("/api/reports/revenue", requireAuth, requirePermission("reports.view"), async (req,res,next) => {
  try { res.json(await revenueReportForRequest(req)); }
  catch (error) { next(error); }
});

app.use(express.static(ROOT, {
  index: "index.html",
  extensions: ["html"]
}));

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "giro", uptime: process.uptime() });
});

app.get("/api/plans", (req, res) => {
  res.json({ plans: PLANS });
});

app.post("/api/auth/register", async (req,res,next) => {
  try {
    const { values,errors } = validateRegistration(req.body || {});
    if (Object.keys(errors).length) return res.status(400).json({ error:"Revise os campos informados.",fields:errors });
    if (users.some(user => user.email === values.email)) return res.status(409).json({ error:"Este e-mail já está cadastrado.",fields:{ email:"Este e-mail já está cadastrado." } });

    let cities;
    try { cities = await citiesForState(values.state); }
    catch (_) { return res.status(503).json({ error:"Não foi possível validar a cidade agora. Tente novamente." }); }
    const city = cities.find(item => normalizeSpaces(item).localeCompare(values.city,"pt-BR",{ sensitivity:"base" }) === 0);
    if (!city) return res.status(400).json({ error:"Revise os campos informados.",fields:{ city:"Selecione uma cidade pertencente ao estado informado." } });

    const passwordHash = await hashPassword(values.password);
    if (users.some(user => user.email === values.email)) return res.status(409).json({ error:"Este e-mail já está cadastrado.",fields:{ email:"Este e-mail já está cadastrado." } });
    const user = { id:crypto.randomUUID(),name:values.name,email:values.email,passwordHash,phone:values.phone.replace(/\D/g,""),workshop:values.workshop,workshopId:crypto.randomUUID(),role:"OWNER",status:"ACTIVE",active:true,state:values.state,city,address:`${city}, ${values.state}`,focus:values.focus,createdAt:new Date().toISOString() };
     if (DATABASE_MODE) await store.createAccount(user);
     users.push(user); if (!DATABASE_MODE) saveUsers(); await setSession(user,res,req.secure || process.env.NODE_ENV === "production");
    res.status(201).json({ ok:true,user:publicUser(user) });
  } catch (err) { next(err); }
});

app.post("/api/auth/login", async (req,res,next) => {
  try {
    const email = normalizeEmail(req.body?.email), password = typeof req.body?.password === "string" ? req.body.password : "";
    const fields = {};
    if (!isValidEmail(email)) fields.email = "E-mail inválido.";
    if (!password) fields.password = "Informe sua senha.";
    if (Object.keys(fields).length) return res.status(400).json({ error:"Revise os campos informados.",fields });
    const user = users.find(item => item.email === email);
    if (user?.status === "PENDING") return res.status(403).json({ error:"Sua conta ainda não foi ativada. Verifique o convite enviado para seu e-mail.", code:"ACCOUNT_PENDING" });
    const valid = await verifyPassword(password,user?.passwordHash || dummyPasswordHash);
    if (!user || !valid || user.status !== "ACTIVE" || user.active === false || !user.workshopId) return res.status(401).json({ error:"E-mail ou senha incorretos." });
     await setSession(user,res,req.secure || process.env.NODE_ENV === "production");
    res.json({ ok:true,user:publicUser(user) });
  } catch (err) { next(err); }
});

app.post("/api/auth/forgot-password", async (req,res,next) => {
  try {
    const email = normalizeEmail(req.body?.email);
    if (!isValidEmail(email)) return res.status(400).json({ error:"Revise os campos informados.",fields:{ email:"E-mail inválido." } });
    if (!checkPasswordResetRateLimit(req,email)) return res.status(429).json({ error:"Muitas solicitações. Aguarde alguns minutos para tentar novamente." });
    if (!smtpConfig()) return res.status(503).json({ error:"Serviço de e-mail indisponível. Tente novamente mais tarde." });

    const genericMessage = "Se existir uma conta vinculada a este e-mail, enviaremos as instruções para redefinir sua senha.";
    const user = users.find(item => item.email === email && item.status === "ACTIVE");
    if (user) {
      const now = new Date().toISOString();
      const rawToken = crypto.randomBytes(32).toString("base64url");
      const expiresAt = new Date(Date.now() + PASSWORD_RESET_MAX_AGE).toISOString();
      passwordResetTokens = passwordResetTokens.map(token => token.userId === user.id && !token.usedAt ? { ...token,usedAt:now } : token);
      passwordResetTokens.push({ id:crypto.randomUUID(),userId:user.id,tokenHash:hashResetToken(rawToken),expiresAt,usedAt:null,createdAt:now });
      prunePasswordResetTokens();
      savePasswordResetTokens();
      const resetUrl = `${resetAppUrl(req)}/app/#/redefinir-senha?token=${encodeURIComponent(rawToken)}`;
      try {
        await sendPasswordResetEmail(user,resetUrl);
      } catch (err) {
        const current = passwordResetTokens.find(token => token.tokenHash === hashResetToken(rawToken));
        if (current) { current.usedAt = new Date().toISOString(); savePasswordResetTokens(); }
        console.error("Falha ao enviar e-mail de recuperação:",err);
        return res.status(503).json({ error:"Serviço de e-mail indisponível. Tente novamente mais tarde." });
      }
    }
    res.json({ ok:true,message:genericMessage });
  } catch (err) { next(err); }
});

app.post("/api/auth/reset-password", async (req,res,next) => {
  try {
    const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
    const { password,errors } = validateNewPassword(req.body || {});
    if (!token) errors.token = "Token obrigatório.";
    if (Object.keys(errors).length) return res.status(400).json({ error:"Revise os campos informados.",fields:errors });

    const tokenHash = hashResetToken(token);
    const record = passwordResetTokens.find(item => item.tokenHash === tokenHash);
    if (!record) return res.status(400).json({ error:"Link de redefinição inválido.",fields:{ token:"Token inválido." } });
    if (record.usedAt) return res.status(400).json({ error:"Este link de redefinição já foi utilizado.",fields:{ token:"Token já utilizado." } });
    if (new Date(record.expiresAt).getTime() <= Date.now()) return res.status(400).json({ error:"Este link de redefinição expirou.",fields:{ token:"Token expirado." } });

    const user = users.find(item => item.id === record.userId && item.status === "ACTIVE");
    if (!user) return res.status(400).json({ error:"Link de redefinição inválido.",fields:{ token:"Token inválido." } });
     const passwordHash = await hashPassword(password), changedAt = new Date().toISOString();
     if (DATABASE_MODE) {
       await store.transaction(async connection => {
         await connection.execute("UPDATE users SET password_hash=?,password_updated_at=? WHERE id=?", [passwordHash,new Date(changedAt),user.id]);
         await connection.execute("UPDATE password_reset_tokens SET used_at=? WHERE id=?", [new Date(changedAt),record.id]);
         await connection.execute("DELETE FROM sessions WHERE user_id=?", [user.id]);
       });
     }
     user.passwordHash = passwordHash; user.passwordUpdatedAt = changedAt; record.usedAt = changedAt;
     if (!DATABASE_MODE) { saveUsers(); savePasswordResetTokens(); await clearUserSessions(user.id); }
    res.json({ ok:true,message:"Senha alterada com sucesso." });
  } catch (err) { next(err); }
});

app.get("/api/auth/session",async (req,res,next) => {
  try { const user = await sessionUser(req);
  if (!user || user.active === false || !user.workshopId) return res.status(401).json({ error:"Sessão inválida ou expirada." });
  res.json({ ok:true,user:publicUser(user) });
  } catch (error) { next(error); }
});

app.get("/api/auth/permissions", requireAuth, (req,res) => {
  res.json({ role: normalizeRole(req.user.role), permissions: ROLE_PERMISSIONS[normalizeRole(req.user.role)] });
});

app.get('/api/service-templates', requireAuth, async (req,res,next) => {
  if (!hasPermission(req.user,'os.view') && !hasPermission(req.user,'assigned_services.view')) return res.status(403).json({ error:'Você não possui permissão para visualizar serviços.' });
  try { const includeInactive = req.query.includeInactive === 'true' && hasPermission(req.user,'template.manage'); res.json({ serviceTemplates:DATABASE_MODE ? await store.listServiceTemplates(req.user,includeInactive) : serviceTemplates.filter(item => item.workshopId === req.user.workshopId && (includeInactive || item.active)).sort((a,b) => a.name.localeCompare(b.name,'pt-BR')) }); } catch(error) { next(error); }
});
app.post('/api/service-templates', requireAuth, requirePermission('template.manage'), async (req,res,next) => {
  const value=templateInput(req.body || {}); if(value.error) return res.status(400).json({error:value.error});
  try { const duplicate = DATABASE_MODE ? (await store.listServiceTemplates(req.user,true)).some(item => item.name.toLocaleLowerCase('pt-BR') === value.name.toLocaleLowerCase('pt-BR') && item.active) : serviceTemplates.some(item => item.workshopId === req.user.workshopId && item.active && item.name.toLocaleLowerCase('pt-BR') === value.name.toLocaleLowerCase('pt-BR')); if(duplicate) return res.status(409).json({error:'Já existe um serviço ativo com este nome nesta oficina.'}); const item=DATABASE_MODE ? await store.createServiceTemplate(req.user,value) : {id:crypto.randomUUID(),workshopId:req.user.workshopId,...value,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}; if(!DATABASE_MODE) { serviceTemplates.push(item); saveServiceTemplates(); } res.status(201).json({serviceTemplate:item}); } catch(error) { next(error); }
});
app.patch('/api/service-templates/:id', requireAuth, requirePermission('template.manage'), async (req,res,next) => {
  if(!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.status(400).json({error:'id inválido.'});
  try { const current=DATABASE_MODE ? await store.findServiceTemplate(req.user,req.params.id) : jsonTemplate(req.user,req.params.id,true); if(!current) return res.status(404).json({error:'Serviço não encontrado.'}); const value=templateInput({...current,...req.body},true); if(value.error) return res.status(400).json({error:value.error}); const duplicate=DATABASE_MODE ? (await store.listServiceTemplates(req.user,true)).some(item => item.id!==current.id && item.name.toLocaleLowerCase('pt-BR')===value.name.toLocaleLowerCase('pt-BR') && item.active) : serviceTemplates.some(item => item.id!==current.id && item.workshopId===req.user.workshopId && item.active && item.name.toLocaleLowerCase('pt-BR')===value.name.toLocaleLowerCase('pt-BR')); if(duplicate) return res.status(409).json({error:'Já existe um serviço ativo com este nome nesta oficina.'}); const item=DATABASE_MODE ? await store.patchServiceTemplate(req.user,current.id,value) : Object.assign(current,value,{updatedAt:new Date().toISOString()}); if(!DATABASE_MODE) saveServiceTemplates(); res.json({serviceTemplate:item}); } catch(error) { next(error); }
});

function visibleOrders(user, closed = false) {
  return serviceOrders.filter(order => order.workshopId === user.workshopId && Boolean(order.closedAt || order.cancelledAt) === closed && (hasPermission(user,"os.view") || order.assignedUserId === user.id));
}

function publicOrder(order) {
  const assigned = users.find(user => user.id === order.assignedUserId && user.workshopId === order.workshopId);
  const closedBy = users.find(user => user.id === order.closedBy && user.workshopId === order.workshopId);
  const labor = (order.laborItems || []).reduce((sum, item) => sum + Number(item.value || 0), 0);
  const discount = Number(order.discount || 0);
  const total = Math.max(0, labor - discount);
  return { id:order.id, workshopId:order.workshopId, clientId:order.clientId ?? null, vehicleId:order.vehicleId ?? null, clientName:order.clientName || "", phone:order.phone || "", vehicleBrand:order.vehicleBrand || "", vehicleModel:order.vehicleModel || "", plate:order.plate || "", year:order.year || null, mileage:order.mileage || 0, service:order.service || "", issue:order.issue || "", dueAt:order.dueAt || null, laborItems:order.laborItems || [], pendingItems:order.pendingItems || [], discount, totals:{ parts:0, labor, discount, total }, ...(order.closedAt ? { estimatedValue:order.estimatedValue ?? null } : {}), status:order.cancelledAt ? 4 : order.closedAt ? 3 : order.status, priority:order.priority, entryAt:order.entryAt, finishedAt:order.finishedAt || null, closedAt:order.closedAt || null, cancelledAt:order.cancelledAt || null, closedBy:order.closedBy || null, closedByName:closedBy?.name || "", createdBy:order.createdBy, assignedUserId:order.assignedUserId, assignedUserName:assigned?.name || "", incomplete:order.incomplete, history:(order.history || []).map(item => ({ ...item })), materials:inventory.materials({ workshopId:order.workshopId },order.id), reservations:inventory.reservations({ workshopId:order.workshopId },order.id) };
}

async function publicOrderDb(order) {
  const value = order.public || order;
  const extra = inventory ? await Promise.all([inventory.materials({ ...order, active:true }, value.id), inventory.reservations({ ...order, active:true }, value.id)]) : [[],[]];
  return { ...value, materials:extra[0], reservations:extra[1] };
}

function findVisibleOrder(user,id) {
  const order = serviceOrders.find(item => String(item.id) === String(id) && item.workshopId === user.workshopId);
  if (!order || (!hasPermission(user,"os.view") && order.assignedUserId !== user.id)) return null;
  return order;
}

function inventoryRoute(action, status = 200) {
  return async (req,res,next) => {
    try { res.status(status).json(await action(req)); }
    catch (error) {
      if (!error.status) console.error("Falha ao persistir estoque:", error);
      res.status(error.status || 500).json({ error:error.status ? error.message : "Nao foi possivel salvar o estoque." });
    } finally { if (next) next; }
  };
}

async function inventoryOrder(req) {
  if (!hasPermission(req.user,"os.view") && !hasPermission(req.user,"assigned_services.view")) throw Object.assign(new Error("Sem permissao para consultar OS."), { status:403 });
  const order = DATABASE_MODE ? await store.findOrder(req.user,req.params.id,true) : findVisibleOrder(req.user,req.params.id);
  if (!order) throw Object.assign(new Error("Ordem de servico nao encontrada."), { status:404 });
  return order;
}

app.get("/api/inventory", requireAuth, inventoryRoute(req => inventory.list(req.user)));
app.post("/api/inventory/items", requireAuth, inventoryRoute(req => inventory.create(req.user,req.body || {}),201));
app.patch("/api/inventory/items/:id", requireAuth, inventoryRoute(req => inventory.patch(req.user,req.params.id,req.body || {})));
app.post("/api/inventory/movements", requireAuth, inventoryRoute(req => inventory.movement(req.user,req.body || {}),201));
app.get("/api/orders/:id/materials", requireAuth, inventoryRoute(async req => ({ materials:await inventory.materials(req.user,(await inventoryOrder(req)).id) })));
app.post("/api/orders/:id/materials", requireAuth, inventoryRoute(async req => inventory.consume(req.user,await inventoryOrder(req),req.body || {}),201));
app.post("/api/orders/:id/materials/:materialId/reverse", requireAuth, inventoryRoute(async req => inventory.reverse(req.user,await inventoryOrder(req),req.params.materialId,req.body || {})));
app.get("/api/orders/:id/reservations", requireAuth, inventoryRoute(async req => ({ reservations:await inventory.reservations(req.user,(await inventoryOrder(req)).id) })));
app.post("/api/orders/:id/reservations", requireAuth, inventoryRoute(async req => inventory.reserve(req.user,await inventoryOrder(req),req.body || {}),201));
app.delete("/api/orders/:id/reservations/:reservationId", requireAuth, inventoryRoute(async req => inventory.release(req.user,await inventoryOrder(req),req.params.reservationId,req.body || {})));
app.post("/api/orders/:id/commit-materials", requireAuth, inventoryRoute(async req => inventory.commit(req.user,await inventoryOrder(req),req.body || {})));

app.get("/api/orders", requireAuth, async (req,res,next) => {
  if (DATABASE_MODE) { try { if (!hasPermission(req.user,"os.view") && !hasPermission(req.user,"assigned_services.view")) return res.status(403).json({ error:"Você não possui permissão para visualizar ordens de serviço." }); const orders=await store.listOrders(req.user,false); return res.json({orders:await Promise.all(orders.map(order=>publicOrderDb(order)))}); } catch(error) { return next(error); } }
  if (!hasPermission(req.user,"os.view") && !hasPermission(req.user,"assigned_services.view")) return res.status(403).json({ error:"Você não possui permissão para visualizar ordens de serviço." });
  res.json({ orders:visibleOrders(req.user).sort((a,b) => new Date(b.entryAt) - new Date(a.entryAt)).map(publicOrder) });
});

app.get("/api/workshop/vehicles", requireAuth, requirePermission("vehicles.manage"), (req,res) => {
  const records = workshopRecords.find(item => item.workshopId === req.user.workshopId) || { clients:[], vehicles:[] };
  res.json({ clients:records.clients, vehicles:records.vehicles });
});

app.post("/api/orders/:id/register-vehicle", requireAuth, requirePermission("os.edit"), requirePermission("vehicles.manage"), async (req,res,next) => {
  if (DATABASE_MODE) { try { const result=await store.registerVehicle(req.user,req.params.id,req.body||{}); return res.status(201).json({ ...result, order:await publicOrderDb({public:result.order,id:result.order.id,workshopId:req.user.workshopId}) }); } catch(error) { return next(error); } }
  const order = findVisibleOrder(req.user,req.params.id);
  if (!order || !hasPermission(req.user,"os.edit")) return res.status(404).json({ error:"Ordem de serviço não encontrada." });
  if (order.vehicleId) return res.status(409).json({ error:"Esta OS já está vinculada a um veículo cadastrado." });
  const clientName = normalizeSpaces(order.clientName), phone = String(order.phone || "").trim();
  const brand = normalizeSpaces(order.vehicleBrand), model = normalizeSpaces(order.vehicleModel), plate = String(order.plate || "").trim().toUpperCase();
  const year = Number(req.body?.year), mileage = Number(req.body?.mileage || 0);
  if (!clientName || !phone || !brand || !model || !plate || !Number.isInteger(year) || year < 1950 || year > new Date().getFullYear() + 1 || !Number.isInteger(mileage) || mileage < 0) {
    return res.status(400).json({ error:"Complete cliente, telefone, marca, modelo, placa, ano e quilometragem antes de cadastrar o veículo." });
  }
  let records = workshopRecords.find(item => item.workshopId === req.user.workshopId);
  if (!records) { records = { workshopId:req.user.workshopId, clients:[], vehicles:[] }; workshopRecords.push(records); }
  if (records.vehicles.some(vehicle => vehicle.plate.toUpperCase() === plate)) return res.status(409).json({ error:"Esta placa já está cadastrada nesta oficina." });
  const now = new Date().toISOString();
  const client = { id:crypto.randomUUID(), workshopId:req.user.workshopId, name:clientName, phone, createdAt:now };
  const vehicle = { id:crypto.randomUUID(), workshopId:req.user.workshopId, clientId:client.id, brand, model, plate, year, mileage, createdAt:now };
  records.clients.push(client); records.vehicles.push(vehicle);
  const previous = { clientId:order.clientId, vehicleId:order.vehicleId, year:order.year, mileage:order.mileage, incomplete:order.incomplete };
  order.clientId = client.id; order.vehicleId = vehicle.id; order.year = year; order.mileage = mileage;
  order.incomplete = !(clientName && phone && brand && model && plate && order.issue);
  order.history ||= []; order.history.push({ userId:req.user.id, action:"vehicle_registered", text:`Veículo ${plate} cadastrado e vinculado à OS #${order.id}.`, at:now });
  try { fs.writeFileSync(WORKSHOP_RECORDS_FILE,JSON.stringify(workshopRecords,null,2),"utf8"); saveServiceOrders(); }
  catch (error) {
    records.clients = records.clients.filter(item => item !== client); records.vehicles = records.vehicles.filter(item => item !== vehicle); Object.assign(order,previous); order.history.pop();
    return res.status(500).json({ error:"Não foi possível salvar o cadastro do veículo." });
  }
  audit(req.user,"vehicle.registered_from_order",String(vehicle.id),{ orderId:order.id, plate });
  res.status(201).json({ order:publicOrder(order), client, vehicle });
});

app.get("/api/history/orders", requireAuth, requirePermission("history.view"), async (req,res,next) => {
  if (DATABASE_MODE) { try { const orders=await store.history(req.user); return res.json({orders:await Promise.all(orders.map(order=>publicOrderDb(order)))}); } catch(error) { return next(error); } }
  res.json({ orders:visibleOrders(req.user,true).sort((a,b) => new Date(b.closedAt) - new Date(a.closedAt)).map(publicOrder) });
});

app.post("/api/orders/quick", requireAuth, async (req,res,next) => {
  if (DATABASE_MODE) { try { if (!hasPermission(req.user,"os.create")&&!hasPermission(req.user,"os.quick.create")) return res.status(403).json({error:"Você não possui permissão para criar ordens."}); const result=await store.createQuickOrder(req.user,req.body||{}); return res.status(201).json({ ...result, order:await publicOrderDb(result.order) }); } catch(error) { return next(error); } }
  if (!hasPermission(req.user,"os.create") && !hasPermission(req.user,"os.quick.create")) return res.status(403).json({ error:"Você não possui permissão para criar ordens." });
  const body = req.body || {};
  let creationOperation;
  if (Object.hasOwn(body,"operationId")) {
    if (typeof body.operationId !== "string" || !body.operationId.trim() || body.operationId.length > 200) return res.status(400).json({ error:"operationId deve ser um texto não vazio de até 200 caracteres." });
    const payloadHash = crypto.createHash("sha256").update(JSON.stringify(Object.keys(body).sort().map(key => [key,body[key]]))).digest("hex");
    creationOperation = { id:body.operationId, actorId:req.user.id, payloadHash };
    const previous = serviceOrders.find(order => order.workshopId === req.user.workshopId && order.createdBy === req.user.id && order.creationOperation?.id === body.operationId && order.creationOperation.actorId === req.user.id);
    if (previous) {
      if (previous.creationOperation.payloadHash !== payloadHash) return res.status(409).json({ error:"operationId reutilizado com outro conteúdo." });
      if (!findVisibleOrder(req.user,previous.id)) return res.status(404).json({ error:"Ordem de serviço não encontrada." });
      const records = workshopRecords.find(item => item.workshopId === req.user.workshopId);
      const client = records?.clients.find(item => item.id === previous.clientId) || null;
      const vehicle = records?.vehicles.find(item => item.id === previous.vehicleId) || null;
      return res.status(201).json({ order:publicOrder(previous),client,vehicle,message:`OS #${previous.id} criada com sucesso.` });
    }
  }
  let assignedUserId = normalizeRole(req.user.role) === "MECHANIC" ? req.user.id : null;
  if (normalizeRole(req.user.role) !== "MECHANIC" && Object.hasOwn(body,"assignedUserId")) {
    if (!hasPermission(req.user,"os.assign")) return res.status(403).json({ error:"Você não possui permissão para atribuir ordens." });
    if (body.assignedUserId !== null && body.assignedUserId !== "") {
      const assigned = users.find(user => user.id === body.assignedUserId && user.workshopId === req.user.workshopId && user.status === "ACTIVE" && user.active !== false && normalizeRole(user.role) === "MECHANIC");
      if (!assigned) return res.status(400).json({ error:"Mecânico inválido para esta oficina." });
      assignedUserId = assigned.id;
    }
  }
  const values = {
    clientName:normalizeSpaces(body.clientName).slice(0,120), phone:typeof body.phone === "string" ? body.phone.replace(/[^\d+() -]/g,"").slice(0,30) : "",
    vehicleBrand:normalizeSpaces(body.vehicleBrand).slice(0,60), vehicleModel:normalizeSpaces(body.vehicleModel).slice(0,120),
    plate:typeof body.plate === "string" ? body.plate.trim().toUpperCase().replace(/[^A-Z0-9-]/g,"").slice(0,10) : "",
    issue:typeof body.issue === "string" ? body.issue.trim().slice(0,2000) : "",
    service:normalizeSpaces(body.service).slice(0,2000),
    priority:body.priority === undefined || ["Baixa","Normal","Alta"].includes(body.priority) ? (body.priority || "Normal") : null,
    dueAt:null,
    estimatedValue:null,
    discount:0,
    laborItems:[],
    pendingItems:[],
    year:body.year === "" || body.year === undefined || body.year === null ? null : Number(body.year),
    mileage:body.mileage === "" || body.mileage === undefined || body.mileage === null ? 0 : Number(body.mileage)
  };
  if (values.priority === null) return res.status(400).json({ error:"priority deve ser Baixa, Normal ou Alta." });
  if (body.dueAt !== undefined && body.dueAt !== null && body.dueAt !== "") {
    const due = new Date(body.dueAt);
    if (!Number.isFinite(due.getTime())) return res.status(400).json({ error:"dueAt deve ser uma data válida." });
    values.dueAt = due.toISOString();
  }
  for (const field of ["estimatedValue","discount"]) if (body[field] !== undefined) {
    if (typeof body[field] !== "number" || !Number.isFinite(body[field]) || body[field] < 0) return res.status(400).json({ error:`${field} deve ser um número não negativo.` });
    values[field] = Math.round(body[field] * 100) / 100;
  }
  if (body.laborItems !== undefined) {
    if (!Array.isArray(body.laborItems) || body.laborItems.length > 100) return res.status(400).json({ error:"laborItems inválido." });
    values.laborItems = normalizeLaborItems(body.laborItems,req.user,false);
    if (!values.laborItems) return res.status(400).json({ error:"laborItems inválido ou serviço cadastrado inativo." });
    if (values.laborItems.some(item => item.assignedUserId && !users.some(user => user.id === item.assignedUserId && user.workshopId === req.user.workshopId && user.status === "ACTIVE" && normalizeRole(user.role) === "MECHANIC"))) return res.status(400).json({ error:"Mecânico inválido em laborItems." });
  }
  if (body.serviceTemplateId && body.laborItems === undefined) values.laborItems = [{ templateId:selectedTemplate.id, description:selectedTemplate.name, value:selectedTemplate.defaultPrice }];
  if (body.pendingItems !== undefined) {
    if (!Array.isArray(body.pendingItems) || body.pendingItems.length > 100) return res.status(400).json({ error:"pendingItems inválido." });
    values.pendingItems = body.pendingItems.map(item => {
      if (!item || typeof item.name !== "string" || !Number.isInteger(item.quantity) || item.quantity <= 0 || item.quantity > 100000) return null;
      return { name:normalizeSpaces(item.name).slice(0,2000), quantity:item.quantity, unit:normalizeSpaces(item.unit || "UN").slice(0,30), ...(item.note ? { note:normalizeSpaces(item.note).slice(0,2000) } : {}) };
    });
    if (values.pendingItems.includes(null) || values.pendingItems.some(item => !item.name || !item.unit)) return res.status(400).json({ error:"pendingItems inválido." });
  }
  if (values.year !== null && (!Number.isInteger(values.year) || values.year < 1950 || values.year > new Date().getFullYear() + 1)) return res.status(400).json({ error:"Informe um ano válido ou deixe o campo em branco." });
  if (!Number.isInteger(values.mileage) || values.mileage < 0 || values.mileage > 2000000) return res.status(400).json({ error:"Informe uma quilometragem válida." });
  const now = new Date().toISOString();
  const id = Math.max(0,...serviceOrders.map(order => Number(order.id) || 0)) + 1;
  let records = workshopRecords.find(item => item.workshopId === req.user.workshopId);
  if (!records) { records = { workshopId:req.user.workshopId, clients:[], vehicles:[] }; workshopRecords.push(records); }
  const existingVehicle = values.plate ? records.vehicles.find(vehicle => vehicle.plate.toUpperCase() === values.plate) : null;
  const canRegisterVehicle = Boolean(values.clientName && values.phone && values.vehicleBrand && values.vehicleModel && values.plate);
  let client = existingVehicle ? records.clients.find(item => item.id === existingVehicle.clientId) : null;
  let vehicle = existingVehicle;
  if (existingVehicle) {
    values.clientName = client?.name || values.clientName;
    values.phone = client?.phone || values.phone;
    values.vehicleBrand = existingVehicle.brand;
    values.vehicleModel = existingVehicle.model;
    values.year = existingVehicle.year ?? values.year;
    values.mileage = existingVehicle.mileage ?? values.mileage;
  }
  let addedClient = false;
  // O cliente pertence à oficina e não depende de um veículo completo.
  // Sem telefone, não unir pessoas diferentes apenas por terem o mesmo nome.
  if (!client && values.clientName) {
    const phoneDigits = values.phone.replace(/\D/g,"");
    if (phoneDigits) client = records.clients.find(item => item.name.trim().toLocaleLowerCase("pt-BR") === values.clientName.toLocaleLowerCase("pt-BR") && String(item.phone || "").replace(/\D/g,"") === phoneDigits);
    if (!client) {
      client = { id:crypto.randomUUID(), workshopId:req.user.workshopId, name:values.clientName, phone:values.phone, createdAt:now };
      records.clients.push(client);
      addedClient = true;
    }
  }
  if (canRegisterVehicle && !existingVehicle) {
    vehicle = { id:crypto.randomUUID(), workshopId:req.user.workshopId, clientId:client.id, brand:values.vehicleBrand, model:values.vehicleModel, plate:values.plate, year:values.year, mileage:values.mileage, createdAt:now };
    records.vehicles.push(vehicle);
  }
  const order = { id, statusVersion:2, workshopId:req.user.workshopId, clientId:client?.id || null, vehicleId:vehicle?.id || null, ...values, status:0, entryAt:now, startedAt:null, finishedAt:null, paused:false, late:false, createdBy:req.user.id, assignedUserId:normalizeRole(req.user.role) === "MECHANIC" ? req.user.id : null, incomplete:!(values.clientName && values.phone && values.vehicleBrand && values.vehicleModel && values.plate && values.issue), history:[{ userId:req.user.id, action:"created", text:`OS #${id} criada.${vehicle ? ` Veículo ${vehicle.plate} vinculado.` : ""}`, at:now }] };
  order.assignedUserId = assignedUserId;
  if (creationOperation) order.creationOperation = creationOperation;
  serviceOrders.push(order);
  try { fs.writeFileSync(WORKSHOP_RECORDS_FILE,JSON.stringify(workshopRecords,null,2),"utf8"); saveServiceOrders(); }
  catch (error) {
    serviceOrders = serviceOrders.filter(item => item !== order);
    if (vehicle && !existingVehicle) records.vehicles = records.vehicles.filter(item => item !== vehicle);
    if (client && addedClient) records.clients = records.clients.filter(item => item !== client);
    console.error("Falha ao salvar ordem de serviço:",error); return res.status(500).json({ error:"Não foi possível salvar a ordem de serviço." });
  }
  audit(req.user,"service_order.created",String(id),{ assignedUserId:order.assignedUserId });
  res.status(201).json({ order:publicOrder(order),client:client || null,vehicle:vehicle || null,message:vehicle ? `OS #${id} criada e veículo ${vehicle.plate} vinculado ao cadastro da oficina.` : client ? `OS #${id} criada e cliente vinculado ao cadastro da oficina. Os dados do veículo podem ser completados depois.` : `OS #${id} criada com sucesso. Informe o nome do cliente para cadastrá-lo na oficina.` });
});

app.get("/api/orders/:id", requireAuth, async (req,res,next) => {
  if (DATABASE_MODE) { try { if (!hasPermission(req.user,"os.view")&&!hasPermission(req.user,"assigned_services.view")) return res.status(403).json({error:"Você não possui permissão para visualizar ordens de serviço."}); const found=await store.findOrder(req.user,req.params.id,true); if(!found) return res.status(404).json({error:"Ordem de serviço não encontrada."}); return res.json({order:await publicOrderDb(found)}); } catch(error) { return next(error); } }
  if (!hasPermission(req.user,"os.view") && !hasPermission(req.user,"assigned_services.view")) return res.status(403).json({ error:"Você não possui permissão para visualizar ordens de serviço." });
  const order = findVisibleOrder(req.user,req.params.id);
  if (!order) return res.status(404).json({ error:"Ordem de serviço não encontrada." });
  res.json({ order:publicOrder(order) });
});

app.patch("/api/orders/:id", requireAuth, async (req,res,next) => {
  if (DATABASE_MODE) { try { const body=req.body||{}, found=await store.findOrder(req.user,req.params.id,true); if(!found) return res.status(404).json({error:"Ordem de serviço não encontrada."}); const mechanic=normalizeRole(req.user.role)==='MECHANIC', quickCompletion=found.createdBy===req.user.id&&found.incomplete&&!found.vehicleId&&Object.keys(body).length>0&&Object.keys(body).every(field=>['clientName','phone','vehicleBrand','vehicleModel','plate','issue'].includes(field)); if(mechanic && found.assignedUserId!==req.user.id && !hasPermission(req.user,'os.edit')) return res.status(403).json({error:"Você não pode alterar esta ordem de serviço."}); if(mechanic && !quickCompletion && Object.keys(body).some(field=>!['status'].includes(field))) return res.status(403).json({error:"O mecânico pode alterar somente o status desta ordem de serviço."}); if(!mechanic&&!hasPermission(req.user,'os.edit')&&!hasPermission(req.user,'os.assign')) return res.status(403).json({error:"Você não possui permissão para alterar esta ordem de serviço."}); if(Object.hasOwn(body,'assignedUserId')&&!hasPermission(req.user,'os.assign')) return res.status(403).json({error:"Você não possui permissão para atribuir esta ordem."}); if(Object.hasOwn(body,'assignedUserId')&&body.assignedUserId&& !users.some(user=>user.id===body.assignedUserId&&user.workshopId===req.user.workshopId&&user.status==='ACTIVE'&&normalizeRole(user.role)==='MECHANIC')) return res.status(400).json({error:"Mecânico inválido para esta oficina."}); const result=await store.updateOrder(req.user,req.params.id,body); return res.json({order:await publicOrderDb(result.order || result)}); } catch(error) { return next(error); } }
  const order = findVisibleOrder(req.user,req.params.id);
  if (!order) return res.status(404).json({ error:"Ordem de serviço não encontrada." });
  const body = req.body || {};
  if (order.cancelledAt) return res.status(409).json({ error:"Esta OS foi cancelada e não pode ser reaberta." });
  if (order.closedAt) {
    if (body.reopen !== true || !hasPermission(req.user,"os.reopen")) return res.status(body.reopen ? 403 : 409).json({ error:"Esta OS está encerrada e disponível somente para consulta." });
    const at = new Date().toISOString();
    order.status = Number.isInteger(order.statusBeforeClose) ? order.statusBeforeClose : 2;
    order.closedAt = null; order.closedBy = null; order.statusBeforeClose = null;
    order.history ||= []; order.history.push({ userId:req.user.id, action:"reopened", text:`OS #${order.id} reaberta pelo administrador.`, at });
    saveServiceOrders(); audit(req.user,"service_order.reopened",String(order.id),{});
    return res.json({ order:publicOrder(order) });
  }
  const mechanic = normalizeRole(req.user.role) === "MECHANIC";
  const textFields = ["clientName","phone","vehicleBrand","vehicleModel","plate","issue"];
  let completingQuickOrder = false;
  if (mechanic) {
    if (order.assignedUserId !== req.user.id || !hasPermission(req.user,"assigned_services.update_status")) return res.status(403).json({ error:"Você não pode alterar esta ordem de serviço." });
    // Preserve legacy completion of an own, unregistered quick order, not general editing.
    completingQuickOrder = order.createdBy === req.user.id && order.incomplete === true && !order.vehicleId && order.history?.some(entry => ["created", "created_quick"].includes(entry.action))
      && Object.keys(body).length > 0 && Object.keys(body).every(field => textFields.includes(field))
      && textFields.some(field => field !== "issue" && !normalizeSpaces(order[field]) && normalizeSpaces(body[field]))
      && Object.keys(body).every(field => field === "issue" || !normalizeSpaces(order[field]));
    if (!completingQuickOrder && Object.keys(body).some(field => field !== "status")) return res.status(403).json({ error:"O mecânico pode alterar somente o status desta ordem." });
  } else if (!hasPermission(req.user,"os.edit") && !hasPermission(req.user,"os.assign")) return res.status(403).json({ error:"Você não possui permissão para alterar esta ordem de serviço." });
  if (Object.hasOwn(body,"assignedUserId") && !hasPermission(req.user,"os.assign")) return res.status(403).json({ error:"Você não possui permissão para atribuir esta ordem." });
  const previousAssignedUserId = order.assignedUserId ?? null;
  const hasAssignment = Object.hasOwn(body,"assignedUserId");
  const assignedUser = hasAssignment && body.assignedUserId !== null && body.assignedUserId !== ""
    ? users.find(user => user.id === body.assignedUserId && user.workshopId === req.user.workshopId && user.status === "ACTIVE" && normalizeRole(user.role) === "MECHANIC")
    : null;
  if (hasAssignment && body.assignedUserId && !assignedUser) return res.status(400).json({ error:"Mecânico inválido para esta oficina." });
  const editable = mechanic && !completingQuickOrder ? [] : textFields;
  if (hasPermission(req.user,"os.edit") || mechanic && hasPermission(req.user,"assigned_services.update_status")) editable.push("status");
  let laborChanged = false;
  if (Object.hasOwn(body,'laborItems')) {
    if (mechanic || !hasPermission(req.user,'os.edit')) return res.status(403).json({error:'Você não possui permissão para alterar a mão de obra.'});
    const normalized = normalizeLaborItems(body.laborItems,req.user,true);
    if (!normalized) return res.status(400).json({error:'laborItems inválido ou serviço cadastrado inexistente.'});
    laborChanged = JSON.stringify(order.laborItems || []) !== JSON.stringify(normalized); order.laborItems = normalized;
  }
  const previousStatus = order.status;
  let committedMaterials = null;
  for (const field of editable) if (Object.hasOwn(body,field)) {
    if (field === "status") {
      const status = Number(body.status);
      if (!Number.isInteger(status) || status < 0 || status > 2 || mechanic && ![1,2].includes(status)) return res.status(400).json({ error:"Status inválido para esta função." });
      order.status = status;
    } else if (field === "phone") order.phone = typeof body.phone === "string" ? body.phone.replace(/[^\d+() -]/g,"").slice(0,30) : "";
    else if (field === "plate") order.plate = typeof body.plate === "string" ? body.plate.trim().toUpperCase().replace(/[^A-Z0-9-]/g,"").slice(0,10) : "";
    else if (field === "issue") order.issue = typeof body.issue === "string" ? body.issue.trim().slice(0,2000) : "";
    else order[field] = normalizeSpaces(body[field]).slice(0,field === "clientName" ? 120 : field === "vehicleBrand" ? 60 : 120);
  }
  if (previousStatus !== 2 && order.status === 2) {
    const activeReservations = inventory.reservations(req.user, order.id).filter(item => item.status === "ACTIVE");
    if (activeReservations.length) {
      try { committedMaterials = inventory.commit(req.user, order, { operationId:`commit:${order.id}` }); }
      catch (error) { order.status = previousStatus; return res.status(error.status || 500).json({ error:error.status ? error.message : "Não foi possível reservar os materiais." }); }
    }
  }
  if (hasAssignment) order.assignedUserId = assignedUser ? assignedUser.id : null;
  if (order.status === 2) { order.finishedAt ||= new Date().toISOString(); order.paused = false; }
  else { order.finishedAt = null; order.paused = order.status === 1; }
  order.incomplete = !(order.clientName && order.vehicleBrand && order.vehicleModel && order.plate && order.issue);
  const at = new Date().toISOString();
  order.history ||= [];
  if (order.status !== previousStatus) {
    const action = order.status === 1 ? "marked_waiting_parts" : order.status === 2 ? "service_finished" : "moved_to_entry";
    const text = order.status === 1 ? `OS #${order.id} marcada como Aguardando peças.` : order.status === 2 ? `Serviço da OS #${order.id} finalizado.` : `OS #${order.id} movida para Entrada.`;
    order.history.push({ userId:req.user.id, action, text, oldStatus:previousStatus, newStatus:order.status, at });
  } else if (hasAssignment && previousAssignedUserId !== (order.assignedUserId ?? null)) {
    order.history.push({ userId:req.user.id, action:"mechanic_assigned", text:assignedUser ? `${assignedUser.name} atribuído à OS #${order.id}.` : `Atribuição removida da OS #${order.id}.`, assignedUserId:order.assignedUserId, at });
  } else if (laborChanged) order.history.push({ userId:req.user.id, action:"labor_updated", text:`Mão de obra da OS #${order.id} atualizada.`, at });
  else order.history.push({ userId:req.user.id, action:"updated", at });
  saveServiceOrders(); audit(req.user,"service_order.updated",String(order.id),{ assignedUserId:order.assignedUserId });
  res.json({ order:publicOrder(order), ...(committedMaterials ? { materials:committedMaterials.materials, reservations:committedMaterials.reservations } : {}) });
});

app.post("/api/orders/:id/deliver", requireAuth, requirePermission("os.close"), async (req,res,next) => {
  if (DATABASE_MODE) { try { const result=await store.deliverOrder(req.user,req.params.id); return res.json({order:await publicOrderDb(result.order || result),message:`OS #${req.params.id} encerrada como entregue.`}); } catch(error) { return next(error); } }
  const order = findVisibleOrder(req.user,req.params.id);
  if (!order) return res.status(404).json({ error:"Ordem de serviço não encontrada." });
  if (order.closedAt || order.cancelledAt) return res.status(409).json({ error:"Esta OS já foi encerrada." });
  if (order.status !== 2) return res.status(409).json({ error:"O veículo só pode ser entregue quando a OS estiver Pronta." });
  let committedMaterials = null;
  try {
    const activeReservations = inventory.reservations(req.user, order.id).filter(item => item.status === "ACTIVE");
    if (activeReservations.length) committedMaterials = inventory.commit(req.user, order, { operationId:`commit:${order.id}` });
  } catch (error) {
    return res.status(error.status || 500).json({ error:error.status ? error.message : "Não foi possível confirmar as peças utilizadas antes da entrega." });
  }
  const at = new Date().toISOString();
  order.statusBeforeClose = order.status;
  order.status = 3;
  order.closedAt = at;
  order.closedBy = req.user.id;
  order.history ||= [];
  order.history.push({ userId:req.user.id, action:"delivered", text:`Veículo da OS #${order.id} entregue; OS encerrada.`, at });
  saveServiceOrders(); audit(req.user,"service_order.delivered",String(order.id),{});
  res.json({ order:publicOrder(order), ...(committedMaterials ? { materials:committedMaterials.materials, reservations:committedMaterials.reservations } : {}), message:`OS #${order.id} encerrada como entregue.` });
});

app.post("/api/orders/:id/cancel", requireAuth, requirePermission("orders.cancel"), async (req,res,next) => {
  if (DATABASE_MODE) { try { const result=await store.cancelOrder(req.user,req.params.id); return res.json({order:await publicOrderDb(result.order || result),reservations:result.reservations || [],message:`OS #${req.params.id} cancelada.`}); } catch(error) { return next(error); } }
  const order = findVisibleOrder(req.user,req.params.id);
  if (!order) return res.status(404).json({ error:"Ordem de serviço não encontrada." });
  if (order.closedAt || order.cancelledAt) return res.status(409).json({ error:"Esta OS já foi encerrada." });
  try {
    const released = inventory.releaseOrder(req.user, order, "CANCELLED");
    const at = new Date().toISOString();
    order.cancelledAt = at; order.cancelledBy = req.user.id; order.statusBeforeCancel = order.status; order.status = 4;
    order.history ||= []; order.history.push({ userId:req.user.id, action:"cancelled", text:`OS #${order.id} cancelada.`, at });
    saveServiceOrders(); audit(req.user,"service_order.cancelled",String(order.id),{});
    res.json({ order:publicOrder(order), reservations:released.reservations });
  } catch (error) { res.status(error.status || 500).json({ error:error.status ? error.message : "Não foi possível cancelar a ordem de serviço." }); }
});

app.get("/api/auth/activate", (req,res) => {
  const token = typeof req.query.token === "string" ? req.query.token.trim() : "";
  const record = invitationTokens.find(item => item.tokenHash === hashInvitationToken(token));
  if (!token || !record || record.usedAt || new Date(record.expiresAt).getTime() <= Date.now()) return res.status(400).json({ error:"Convite inválido ou expirado." });
  const user = users.find(item => item.id === record.userId && item.workshopId === record.workshopId && item.status === "PENDING");
  if (!user) return res.status(400).json({ error:"Este convite não está mais disponível." });
  res.json({ name:user.name });
});

app.post("/api/auth/activate", async (req,res,next) => {
  try {
    const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
    const { password, confirmPassword, errors } = validateNewPassword(req.body || {});
    if (!token) errors.token = "Convite inválido.";
    if (Object.keys(errors).length) return res.status(400).json({ error:"Revise os campos informados.",fields:errors });
    const hash = hashInvitationToken(token);
    const record = invitationTokens.find(item => item.tokenHash === hash);
    if (!record) return res.status(400).json({ error:"Convite inválido." });
    if (record.usedAt) return res.status(400).json({ error:"Este convite já foi utilizado." });
    if (new Date(record.expiresAt).getTime() <= Date.now()) return res.status(400).json({ error:"Este convite expirou. Peça à oficina para enviar outro." });
    const user = users.find(item => item.id === record.userId && item.workshopId === record.workshopId);
    if (!user || user.status !== "PENDING") return res.status(400).json({ error:"Este convite não está mais disponível." });
     const passwordHash = await hashPassword(password), activatedAt = new Date().toISOString();
     if (DATABASE_MODE) await store.transaction(async connection => {
       await connection.execute("UPDATE users SET password_hash=?,password_updated_at=?,status='ACTIVE',active=TRUE,activated_at=? WHERE id=?", [passwordHash,new Date(activatedAt),new Date(activatedAt),user.id]);
       await connection.execute("UPDATE invitation_tokens SET used_at=? WHERE id=?", [new Date(activatedAt),record.id]);
     });
     user.passwordHash = passwordHash; user.passwordUpdatedAt = activatedAt;
     user.status = "ACTIVE"; user.active = true; user.activatedAt = activatedAt; record.usedAt = activatedAt;
     if (!DATABASE_MODE) { saveUsers(); saveInvitationTokens(); }
    audit(user,"account.activated",user.id,{ role:user.role });
    res.json({ ok:true,message:"Conta ativada com sucesso." });
  } catch (error) { next(error); }
});

app.get("/api/team", requireAuth, requirePermission("team.view"), (req,res) => {
  res.json({ users: users.filter(user => user.workshopId === req.user.workshopId).map(publicUser) });
});

app.post("/api/team", requireAuth, requirePermission("team.manage"), async (req,res,next) => {
  try {
    const name = normalizeSpaces(req.body?.name), email = normalizeEmail(req.body?.email);
    const role = String(req.body?.role || "").toUpperCase();
    if (!isValidName(name) || !isValidEmail(email) || !["MANAGER","ATTENDANT","MECHANIC"].includes(role)) return res.status(400).json({ error:"Informe nome, e-mail e uma função válida." });
    if (users.some(user => user.email === email)) return res.status(409).json({ error:"Este e-mail já está cadastrado." });
    const user = { id:crypto.randomUUID(), name, email, phone:String(req.body?.phone || "").replace(/\D/g,""), passwordHash:null, workshop:req.user.workshop, workshopId:req.user.workshopId, role, status:"PENDING", active:false, createdAt:new Date().toISOString() };
     if (DATABASE_MODE) await store.insertUser(user); else { users.push(user); saveUsers(); }
     if (DATABASE_MODE) users.push(user);
    try { await issueInvitation(user,req); }
    catch (error) { audit(req.user,"team.invitation_failed",user.id,{ role }); return res.status(503).json({ error:"Funcionário criado como pendente, mas não foi possível enviar o convite. Tente reenviar pela equipe.",code:"INVITATION_SEND_FAILED",user:publicUser(user) }); }
    audit(req.user,"team.user_created",user.id,{ role });
    res.status(201).json({ user:publicUser(user),message:`Convite enviado para ${email}.` });
  } catch (err) { next(err); }
});

app.post("/api/team/:id/resend-invitation", requireAuth, requirePermission("team.manage"), async (req,res,next) => {
  try {
    const user = users.find(item => item.id === req.params.id && item.workshopId === req.user.workshopId);
    if (!user) return res.status(404).json({ error:"Funcionário não encontrado." });
    if (user.status !== "PENDING") return res.status(409).json({ error:"Este funcionário não possui convite pendente." });
    const recentInvitations = invitationTokens.filter(item => item.userId === user.id && Date.now() - new Date(item.createdAt).getTime() < INVITATION_RESEND_WINDOW);
    if (recentInvitations.length >= INVITATION_RESEND_MAX) return res.status(429).json({ error:"Limite de convites atingido. Tente novamente mais tarde." });
    await issueInvitation(user,req);
    audit(req.user,"team.invitation_resent",user.id,{});
    res.json({ ok:true,message:`Convite reenviado para ${user.email}.` });
  } catch (error) {
    if (error.code === "SMTP_UNAVAILABLE") return res.status(503).json({ error:"Serviço de e-mail indisponível. Tente novamente mais tarde." });
    console.error("Falha ao reenviar convite:",error);
    res.status(503).json({ error:"Não foi possível enviar o convite. Tente novamente mais tarde." });
  }
});

app.patch("/api/team/:id", requireAuth, requirePermission("team.manage"), async (req,res,next) => {
 try {
  const user = users.find(item => item.id === req.params.id && item.workshopId === req.user.workshopId);
  if (!user || user.id === req.user.id) return res.status(404).json({ error:"Funcionário não encontrado." });
  const { role, active } = req.body || {};
  if (role !== undefined && !["MANAGER","ATTENDANT","MECHANIC"].includes(String(role).toUpperCase())) return res.status(400).json({ error:"Função inválida." });
   if (role !== undefined) {
    const nextRole = String(role).toUpperCase();
    if (nextRole !== user.role) clearUserSessions(user.id);
    user.role = nextRole;
  }
  if (active !== undefined) {
    if (typeof active !== "boolean") return res.status(400).json({ error:"Estado ativo inválido." });
    if (active && !user.passwordHash) return res.status(409).json({ error:"Este funcionário ainda precisa ativar a conta pelo convite." });
    user.active = active; user.status = active ? "ACTIVE" : "INACTIVE";
    if (!active) clearUserSessions(user.id);
  }
   if (DATABASE_MODE) await store.updateRoleStatus(user); else saveUsers();
   if (DATABASE_MODE && (role !== undefined || active === false)) await store.deleteUserSessions(user.id);
   audit(req.user,"team.user_updated",user.id,{ role:user.role, active:user.active });
   res.json({ user:publicUser(user) });
 } catch (error) { next(error); }
});

app.post("/api/auth/logout",async (req,res,next) => {
  try { await clearSession(req,res);
  res.json({ ok:true });
  } catch (error) { next(error); }
});

app.post("/api/leads", async (req, res) => {
  const body = req.body || {};
  if (!isValidLead(body)) {
    return res.status(400).json({ error: "Dados inválidos. Verifique os campos e tente novamente." });
  }
  let cities;
  try { cities = await citiesForState(body.state.trim().toUpperCase()); }
  catch (_) { return res.status(503).json({ error: "Não foi possível validar a cidade agora. Tente novamente." }); }
  const city = cities.find(item => normalizeSpaces(item).localeCompare(normalizeSpaces(body.city), "pt-BR", { sensitivity: "base" }) === 0);
  if (!city) return res.status(400).json({ error: "Selecione uma cidade pertencente ao estado informado." });

  const lead = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    nome: body.nome.trim(),
    oficina: body.oficina.trim(),
    whats: body.whats.replace(/\D/g, ""),
    email: body.email.trim(),
    state: body.state.trim().toUpperCase(),
    stateName: typeof body.stateName === "string" ? body.stateName.trim() : "",
    city,
    tamanho: body.tamanho || "Não informado",
    plano: body.plano || "Não informado",
    mensagem: body.mensagem.trim(),
    origem: body.origem || "landing",
    criadoEm: new Date().toISOString()
  };

   const leads = DATABASE_MODE ? (globalThis.__giroDbLeads || []) : readLeads();
  leads.push(lead);

  try {
     if (DATABASE_MODE) await store.pool.execute('INSERT INTO leads (id,name,workshop_name,whatsapp,email,state,state_name,city,workshop_size,plan,message,source,created_at,metadata) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [lead.id,lead.nome,lead.oficina,lead.whats,lead.email,lead.state,lead.stateName,lead.city,lead.tamanho,lead.plano,lead.mensagem,lead.origem,new Date(lead.criadoEm),JSON.stringify(lead)]);
     else { ensureDataDir(); fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2), "utf8"); }
  } catch (err) {
    console.error("Falha ao salvar lead:", err);
    return res.status(500).json({ error: "Não foi possível registrar a solicitação." });
  }

  try {
    await sendLeadEmail(lead);
  } catch (err) {
    console.error("Falha ao enviar solicitação por e-mail:", err);
    return res.status(503).json({ error: "Não foi possível enviar a solicitação por e-mail. Tente novamente mais tarde." });
  }

  res.status(201).json({ ok: true, id: lead.id });
});

app.get("/api/leads", (req, res) => {
  res.json({ leads: DATABASE_MODE ? (globalThis.__giroDbLeads || []) : readLeads() });
});

app.use((req, res) => {
  res.status(404).json({ error: "Rota não encontrada." });
});

app.use((err, req, res, next) => {
  console.error(err);
  if (req.path.startsWith("/api/")) {
    return res.status(err.status || 500).json({ error: err.status ? err.message : "Erro interno do servidor." });
  }
  res.status(500).send("Erro interno do servidor.");
  next();
});

bootstrapUsers().then(() => {
  app.listen(PORT, () => console.log(`Giro rodando em http://localhost:${PORT}`));
}).catch(err => {
  console.error("Falha ao inicializar autenticação:",err);
  process.exitCode = 1;
});
