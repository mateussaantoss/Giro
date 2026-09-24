"use strict";

require("dotenv").config();

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const util = require("util");
const express = require("express");
const nodemailer = require("nodemailer");

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_DIR = process.env.GIRO_DATA_DIR ? path.resolve(process.env.GIRO_DATA_DIR) : path.join(ROOT, "data");
const LEADS_FILE = path.join(DATA_DIR, "leads.json");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const PASSWORD_RESET_TOKENS_FILE = path.join(DATA_DIR, "password-reset-tokens.json");
const SESSION_COOKIE = "giro_session";
const SESSION_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const PASSWORD_RESET_MAX_AGE = Math.max(5,Number(process.env.PASSWORD_RESET_TOKEN_MINUTES || 60)) * 60 * 1000;
const PASSWORD_RESET_RATE_WINDOW = Math.max(1,Number(process.env.PASSWORD_RESET_RATE_WINDOW_MINUTES || 15)) * 60 * 1000;
const PASSWORD_RESET_RATE_MAX = Math.max(1,Number(process.env.PASSWORD_RESET_RATE_MAX || 5));
const VALID_UFS = new Set(["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"]);
const VALID_DDDS = new Set(["11","12","13","14","15","16","17","18","19","21","22","24","27","28","31","32","33","34","35","37","38","41","42","43","44","45","46","47","48","49","51","53","54","55","61","62","63","64","65","66","67","68","69","71","73","74","75","77","79","81","82","83","84","85","86","87","88","89","91","92","93","94","95","96","97","98","99"]);
const VALID_FOCUS = new Set(["Organizar ordens de serviço","Acompanhar a equipe","Melhorar o atendimento"]);
const scrypt = util.promisify(crypto.scrypt);
const sessions = new Map();
const cityCache = new Map();
let users = [];
let passwordResetTokens = [];
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
  ensureDataDir();
  fs.writeFileSync(USERS_FILE,JSON.stringify(users,null,2),"utf8");
}

function readPasswordResetTokens() {
  return readJsonArray(PASSWORD_RESET_TOKENS_FILE);
}

function savePasswordResetTokens() {
  ensureDataDir();
  fs.writeFileSync(PASSWORD_RESET_TOKENS_FILE,JSON.stringify(passwordResetTokens,null,2),"utf8");
}

function prunePasswordResetTokens() {
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  passwordResetTokens = passwordResetTokens.filter(token => new Date(token.expiresAt).getTime() > cutoff || !token.usedAt);
}

function publicUser(user) {
  return { id:user.id,name:user.name,email:user.email,phone:user.phone,workshop:user.workshop,state:user.state,city:user.city,address:user.address,focus:user.focus };
}

function parseCookies(req) {
  return Object.fromEntries(String(req.headers.cookie || "").split(";").map(cookie => cookie.trim().split("=")).filter(parts => parts.length === 2).map(([key,value]) => [key,decodeURIComponent(value)]));
}

function setSession(user,res,secure = false) {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token,{ userId:user.id,expiresAt:Date.now() + SESSION_MAX_AGE });
  res.setHeader("Set-Cookie",`${SESSION_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${Math.floor(SESSION_MAX_AGE / 1000)}${secure ? "; Secure" : ""}`);
}

function clearSession(req,res) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (token) sessions.delete(token);
  res.setHeader("Set-Cookie",`${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`);
}

function clearUserSessions(userId) {
  for (const [token,session] of sessions.entries()) {
    if (session.userId === userId) sessions.delete(token);
  }
}

function sessionUser(req) {
  const token = parseCookies(req)[SESSION_COOKIE], session = token && sessions.get(token);
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
  const transporter = nodemailer.createTransport({
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
    html:`<!doctype html><html lang="pt-BR"><body style="margin:0;background:#0b0f14;font-family:Inter,Arial,sans-serif;color:#f5f7fa"><div style="max-width:560px;margin:0 auto;padding:32px 20px"><div style="background:#151b23;border:1px solid #2b3036;border-radius:10px;padding:28px"><div style="font-size:28px;font-weight:900;font-style:italic;letter-spacing:1px;color:#38bdf8;margin-bottom:24px">GIRO</div><h1 style="font-size:24px;line-height:1.25;margin:0 0 12px;color:#fff">Redefina sua senha</h1><p style="font-size:15px;line-height:1.7;color:#cbd5e1;margin:0 0 18px">Olá${name ? `, ${name}` : ""}. Recebemos uma solicitação para redefinir a senha da sua conta no GIRO.</p><p style="font-size:15px;line-height:1.7;color:#cbd5e1;margin:0 0 24px">Este link é válido por ${minutes} minutos e pode ser usado apenas uma vez.</p><a href="${safeUrl}" style="display:inline-block;background:#0ea5e9;color:#fff;text-decoration:none;font-weight:700;border-radius:7px;padding:13px 18px">Redefinir minha senha</a><p style="font-size:13px;line-height:1.7;color:#94a3b8;margin:24px 0 0">Se o botão não funcionar, copie e cole este endereço no navegador:<br><span style="word-break:break-all;color:#bae6fd">${safeUrl}</span></p><p style="font-size:13px;line-height:1.7;color:#94a3b8;margin:18px 0 0">Se você não solicitou essa alteração, ignore este e-mail. Sua senha atual continuará válida.</p></div></div></body></html>`
  });
}

async function bootstrapUsers() {
  users = readUsers();
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
    typeof body.cidade === "string" && body.cidade.trim().length >= 3 &&
    typeof body.mensagem === "string" && body.mensagem.trim().length >= 10
  );
}

app.set("trust proxy", 1);

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

app.use(express.json({ limit: "100kb" }));

app.use("/data",(req,res) => res.status(404).json({ error:"Rota não encontrada." }));

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
    const user = { id:crypto.randomUUID(),name:values.name,email:values.email,passwordHash,phone:values.phone.replace(/\D/g,""),workshop:values.workshop,state:values.state,city,address:`${city}, ${values.state}`,focus:values.focus,createdAt:new Date().toISOString() };
    users.push(user); saveUsers(); setSession(user,res,req.secure || process.env.NODE_ENV === "production");
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
    const valid = await verifyPassword(password,user?.passwordHash || dummyPasswordHash);
    if (!user || !valid) return res.status(401).json({ error:"E-mail ou senha incorretos." });
    setSession(user,res,req.secure || process.env.NODE_ENV === "production");
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
    const user = users.find(item => item.email === email);
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

    const user = users.find(item => item.id === record.userId);
    if (!user) return res.status(400).json({ error:"Link de redefinição inválido.",fields:{ token:"Token inválido." } });
    user.passwordHash = await hashPassword(password);
    user.passwordUpdatedAt = new Date().toISOString();
    record.usedAt = user.passwordUpdatedAt;
    saveUsers();
    savePasswordResetTokens();
    clearUserSessions(user.id);
    res.json({ ok:true,message:"Senha alterada com sucesso." });
  } catch (err) { next(err); }
});

app.get("/api/auth/session",(req,res) => {
  const user = sessionUser(req);
  if (!user) return res.status(401).json({ error:"Sessão inválida ou expirada." });
  res.json({ ok:true,user:publicUser(user) });
});

app.post("/api/auth/logout",(req,res) => {
  clearSession(req,res);
  res.json({ ok:true });
});

app.post("/api/leads", (req, res) => {
  const body = req.body || {};
  if (!isValidLead(body)) {
    return res.status(400).json({ error: "Dados inválidos. Verifique os campos e tente novamente." });
  }

  const lead = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    nome: body.nome.trim(),
    oficina: body.oficina.trim(),
    whats: body.whats.replace(/\D/g, ""),
    email: body.email.trim(),
    cidade: body.cidade.trim(),
    tamanho: body.tamanho || "Não informado",
    plano: body.plano || "Não informado",
    mensagem: body.mensagem.trim(),
    origem: body.origem || "landing",
    criadoEm: new Date().toISOString()
  };

  const leads = readLeads();
  leads.push(lead);

  try {
    ensureDataDir();
    fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2), "utf8");
  } catch (err) {
    console.error("Falha ao salvar lead:", err);
    return res.status(500).json({ error: "Não foi possível registrar a solicitação." });
  }

  res.status(201).json({ ok: true, id: lead.id });
});

app.get("/api/leads", (req, res) => {
  res.json({ leads: readLeads() });
});

app.use((req, res) => {
  res.status(404).json({ error: "Rota não encontrada." });
});

app.use((err, req, res, next) => {
  console.error(err);
  if (req.path.startsWith("/api/")) {
    return res.status(500).json({ error: "Erro interno do servidor." });
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
