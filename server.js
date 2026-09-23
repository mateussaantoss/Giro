"use strict";

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const util = require("util");
const express = require("express");
const nodemailer = require("nodemailer");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_DIR = process.env.GIRO_DATA_DIR ? path.resolve(process.env.GIRO_DATA_DIR) : path.join(ROOT, "data");
const LEADS_FILE = path.join(DATA_DIR, "leads.json");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const PASSWORD_RESETS_FILE = path.join(DATA_DIR, "password-resets.json");
const SESSION_COOKIE = "giro_session";
const SESSION_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const VALID_UFS = new Set(["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"]);
const VALID_DDDS = new Set(["11","12","13","14","15","16","17","18","19","21","22","24","27","28","31","32","33","34","35","37","38","41","42","43","44","45","46","47","48","49","51","53","54","55","61","62","63","64","65","66","67","68","69","71","73","74","75","77","79","81","82","83","84","85","86","87","88","89","91","92","93","94","95","96","97","98","99"]);
const VALID_FOCUS = new Set(["Organizar ordens de serviço","Acompanhar a equipe","Melhorar o atendimento"]);
const scrypt = util.promisify(crypto.scrypt);
const sessions = new Map();
const cityCache = new Map();
let users = [];
let dummyPasswordHash;
let mailer;

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

async function verifyPassword(password,storedHash) {
  const [salt,hex] = String(storedHash || "").split(":");
  if (!salt || !hex) return false;
  const expected = Buffer.from(hex,"hex");
  const actual = await scrypt(password,salt,expected.length);
  return expected.length === actual.length && crypto.timingSafeEqual(expected,actual);
}

function readUsers() {
  ensureDataDir();
  if (!fs.existsSync(USERS_FILE)) return [];
  const parsed = JSON.parse(fs.readFileSync(USERS_FILE,"utf8"));
  if (!Array.isArray(parsed)) throw new Error("Arquivo de usuários inválido.");
  return parsed;
}

function saveUsers() {
  ensureDataDir();
  fs.writeFileSync(USERS_FILE,JSON.stringify(users,null,2),"utf8");
}

function readPasswordResets() {
  ensureDataDir();
  if (!fs.existsSync(PASSWORD_RESETS_FILE)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(PASSWORD_RESETS_FILE,"utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) { return []; }
}

function savePasswordResets(resets) {
  ensureDataDir();
  fs.writeFileSync(PASSWORD_RESETS_FILE,JSON.stringify(resets,null,2),"utf8");
}

function getMailer() {
  if (mailer) return mailer;
  if (!process.env.SMTP_HOST) return null;
  mailer = nodemailer.createTransport({ host:process.env.SMTP_HOST, port:Number(process.env.SMTP_PORT || 587), secure:process.env.SMTP_SECURE === "true", auth:process.env.SMTP_USER ? { user:process.env.SMTP_USER,pass:process.env.SMTP_PASS || "" } : undefined });
  return mailer;
}

function htmlEscape(value) {
  return String(value).replace(/[&<>"']/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[char]));
}

function publicBaseUrl(req) {
  return (process.env.APP_URL || `${req.protocol}://${req.get("host")}`).replace(/\/$/,"");
}

async function sendPasswordResetEmail(user,token,req) {
  const transport = getMailer();
  if (!transport) throw new Error("SMTP não configurado.");
  const baseUrl = publicBaseUrl(req);
  const resetUrl = `${baseUrl}/app/#/redefinir?token=${encodeURIComponent(token)}`;
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  if (!from) throw new Error("SMTP_FROM não configurado.");
  await transport.sendMail({ from,to:user.email,subject:"Redefina sua senha do GIRO",text:`Olá, ${user.name}. Acesse este link para criar uma nova senha (válido por 1 hora): ${resetUrl}`,html:`<p>Olá, ${htmlEscape(user.name)}.</p><p>Recebemos uma solicitação para redefinir sua senha do GIRO.</p><p><a href="${resetUrl}">Criar nova senha</a></p><p>Este link expira em 1 hora e só pode ser usado uma vez. Se você não fez esta solicitação, ignore este e-mail.</p>` });
}

async function sendLeadEmail(lead,req) {
  const transport = getMailer();
  if (!transport) throw new Error("SMTP não configurado.");
  const recipient = process.env.LEAD_EMAIL_TO || process.env.SMTP_FROM || process.env.SMTP_USER;
  if (!recipient) throw new Error("LEAD_EMAIL_TO não configurado.");
  const baseUrl = publicBaseUrl(req);
  const submittedAt = new Date(lead.criadoEm).toLocaleString("pt-BR",{ dateStyle:"full",timeStyle:"short",timeZone:"America/Sao_Paulo" });
  const rows = [
    ["Responsável",lead.nome], ["Oficina / empresa",lead.oficina], ["E-mail",lead.email],
    ["WhatsApp / telefone",lead.whats], ["UF",lead.uf], ["Cidade",lead.cidade],
    ["Tamanho da oficina",lead.tamanho], ["Plano de interesse",lead.plano || "Não informado"],
    ["Origem",lead.origem], ["Mensagem",lead.mensagem]
  ];
  const rowHtml = rows.map(([label,value]) => `<tr><td style="padding:13px 16px;border-bottom:1px solid #e7edf3;color:#64748b;font-size:12px;width:34%;vertical-align:top">${htmlEscape(label)}</td><td style="padding:13px 16px;border-bottom:1px solid #e7edf3;color:#17212b;font-size:14px;vertical-align:top;white-space:pre-line">${htmlEscape(value || "Não informado")}</td></tr>`).join("");
  await transport.sendMail({
    from:process.env.SMTP_FROM || process.env.SMTP_USER,
    to:recipient,
    replyTo:lead.email,
    subject:`Nova solicitação de demonstração · ${lead.oficina}`,
    text:`Nova solicitação de demonstração\n\n${rows.map(([label,value]) => `${label}: ${value || "Não informado"}`).join("\n")}\n\nRecebida em: ${submittedAt}`,
    html:`<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f2f5f8;font-family:Arial,Helvetica,sans-serif;color:#17212b"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f2f5f8;padding:34px 16px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 8px 30px rgba(22,38,54,.08)"><tr><td style="background:#101820;padding:28px 34px"><img src="${htmlEscape(`${baseUrl}/app/mark.svg`)}" width="42" height="42" alt="GIRO" style="display:block;margin-bottom:22px"><div style="color:#7dd3fc;font-size:11px;font-weight:bold;letter-spacing:2px;text-transform:uppercase">GIRO · NOVO CONTATO</div><h1 style="margin:10px 0 0;color:#fff;font-size:26px;line-height:1.2">Nova solicitação de demonstração</h1></td></tr><tr><td style="padding:30px 34px 10px"><p style="margin:0 0 6px;color:#17212b;font-size:16px;font-weight:bold">Uma nova oficina quer conhecer o GIRO.</p><p style="margin:0 0 22px;color:#64748b;font-size:13px;line-height:1.6">Os dados abaixo foram enviados pelo formulário de demonstração.</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e7edf3;border-radius:10px;overflow:hidden">${rowHtml}</table></td></tr><tr><td style="padding:22px 34px 30px;color:#64748b;font-size:12px;border-top:1px solid #eef2f6">Solicitação recebida em ${htmlEscape(submittedAt)}<br><span style="color:#94a3b8">Responda este e-mail para falar diretamente com ${htmlEscape(lead.nome)}.</span></td></tr></table></td></tr></table></body></html>`
  });
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

async function bootstrapUsers() {
  users = readUsers();
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
    typeof body.email === "string" && isValidEmail(normalizeEmail(body.email)) &&
    typeof body.uf === "string" && VALID_UFS.has(body.uf.trim().toUpperCase()) &&
    typeof body.cidade === "string" && body.cidade.trim().length >= 2 &&
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

app.post("/api/auth/request-password-reset", async (req,res,next) => {
  try {
    const email = normalizeEmail(req.body?.email);
    if (!isValidEmail(email)) return res.status(400).json({ error:"Informe um e-mail válido.",fields:{ email:"E-mail inválido." } });
    if (!getMailer()) return res.status(503).json({ error:"O envio de e-mails ainda não foi configurado no servidor." });

    const now = Date.now();
    let resets = readPasswordResets().filter(item => item.expiresAt > now);
    const user = users.find(item => item.email === email);
    if (user) {
      const token = crypto.randomBytes(32).toString("hex");
      resets = resets.filter(item => item.userId !== user.id);
      resets.push({ tokenHash:crypto.createHash("sha256").update(token).digest("hex"),userId:user.id,expiresAt:now + 60 * 60 * 1000 });
      savePasswordResets(resets);
      try { await sendPasswordResetEmail(user,token,req); }
      catch (err) {
        savePasswordResets(resets.filter(item => item.userId !== user.id));
        console.error("Falha ao enviar recuperação de senha:",err.message);
        return res.status(502).json({ error:"Não foi possível enviar o e-mail. Confira as configurações SMTP do servidor." });
      }
    }
    res.json({ ok:true,message:"Se o e-mail estiver cadastrado, as instruções de recuperação serão enviadas." });
  } catch (err) { next(err); }
});

app.post("/api/auth/reset-password", async (req,res,next) => {
  try {
    const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const passwordConfirmation = typeof req.body?.passwordConfirmation === "string" ? req.body.passwordConfirmation : "";
    if (!/^[a-f0-9]{64}$/.test(token)) return res.status(400).json({ error:"Link de recuperação inválido ou expirado." });
    if (password.length < 8 || password.length > 128) return res.status(400).json({ error:"A senha deve ter entre 8 e 128 caracteres.",fields:{ password:"A senha deve ter entre 8 e 128 caracteres." } });
    if (password !== passwordConfirmation) return res.status(400).json({ error:"As senhas não coincidem.",fields:{ passwordConfirmation:"As senhas não coincidem." } });
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex"), now = Date.now();
    const resets = readPasswordResets();
    const reset = resets.find(item => item.tokenHash === tokenHash && item.expiresAt > now);
    if (!reset) return res.status(400).json({ error:"Link de recuperação inválido ou expirado." });
    const user = users.find(item => item.id === reset.userId);
    if (!user) return res.status(400).json({ error:"Link de recuperação inválido ou expirado." });
    user.passwordHash = await hashPassword(password);
    saveUsers();
    savePasswordResets(resets.filter(item => item !== reset));
    res.json({ ok:true,message:"Senha alterada com sucesso. Você já pode entrar no GIRO." });
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

app.post("/api/leads", async (req, res) => {
  const body = req.body || {};
  if (!isValidLead(body)) {
    return res.status(400).json({ error: "Dados inválidos. Verifique os campos e tente novamente." });
  }

  const lead = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    nome: body.nome.trim(),
    oficina: body.oficina.trim(),
    whats: body.whats.replace(/\D/g, ""),
    email: normalizeEmail(body.email),
    uf: body.uf.trim().toUpperCase(),
    cidade: body.cidade.trim(),
    tamanho: body.tamanho || "Não informado",
    plano: body.plano || "Não informado",
    mensagem: body.mensagem.trim(),
    origem: body.origem || "landing",
    criadoEm: new Date().toISOString()
  };

  let cities;
  try { cities = await citiesForState(lead.uf); }
  catch (_) { return res.status(503).json({ error:"Não foi possível validar a cidade agora. Tente novamente." }); }
  const validCity = cities.find(city => normalizeSpaces(city).localeCompare(lead.cidade,"pt-BR",{ sensitivity:"base" }) === 0);
  if (!validCity) return res.status(400).json({ error:"A cidade não pertence ao estado selecionado." });
  lead.cidade = validCity;

  const leads = readLeads();
  leads.push(lead);

  try {
    ensureDataDir();
    fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2), "utf8");
  } catch (err) {
    console.error("Falha ao salvar lead:", err);
    return res.status(500).json({ error: "Não foi possível registrar a solicitação." });
  }

  try { await sendLeadEmail(lead,req); }
  catch (err) {
    console.error("Falha ao enviar solicitação de demonstração:",err.message);
    return res.status(502).json({ error:"Solicitação registrada, mas não foi possível enviar o e-mail. Confira as configurações SMTP." });
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
