/**
 * dashboard/auth.js — Autenticação, sessões e controle de IP
 *
 * Cargos staff+ têm IP lock:
 * - Primeiro login registra o IP
 * - Logins subsequentes de outro IP são bloqueados
 * - Owner pode resetar o IP de qualquer usuário
 */
const crypto = require('crypto');
const { db }  = require('../database/database');
const dbDash  = require('./db');

function hashPass(password) {
  return crypto.createHash('sha256').update(password + 'mrstore_salt_2024').digest('hex');
}

function criarSessao(usuarioId, ip = null) {
  const token  = crypto.randomBytes(32).toString('hex');
  const expira = Math.floor(Date.now() / 1000) + 86400 * 7; // 7 dias
  db.prepare('INSERT INTO dash_sessoes (token, usuario_id, ip, expira_em) VALUES (?,?,?,?)').run(token, usuarioId, ip, expira);
  db.prepare("DELETE FROM dash_sessoes WHERE expira_em < strftime('%s','now')").run();
  return token;
}

function getSessao(token, ip = null) {
  if (!token) return null;
  const s = db.prepare("SELECT * FROM dash_sessoes WHERE token=? AND expira_em > strftime('%s','now')").get(token);
  if (!s) return null;
  const u = db.prepare('SELECT * FROM dash_usuarios WHERE id=?').get(s.usuario_id);
  if (!u || !u.aprovado) return null;

  // Verificar IP lock para cargos staff+
  if (dbDash.precisaIpLock(u.cargo) && ip) {
    const ipSalvo = dbDash.getIpBloqueado(u.id);
    if (ipSalvo && ipSalvo !== ip) {
      // IP diferente — sessão inválida, redirecionar para página de IP bloqueado
      return { __ipBloqueado: true, username: u.username, cargo: u.cargo };
    }
  }

  return u;
}

function deletarSessao(token) {
  if (token) db.prepare('DELETE FROM dash_sessoes WHERE token=?').run(token);
}

function getToken(req) {
  return req.cookies?.dash_sess;
}

function requireAuth(req, res, next) {
  const ip   = dbDash.getIp(req);
  const user = getSessao(getToken(req), ip);
  if (!user) return res.redirect('/painel/login');
  if (user.__ipBloqueado) return res.redirect('/painel/ip-bloqueado');
  req.dashUser = user;
  req.dashIp   = ip;
  next();
}

function requireCargo(...cargos) {
  return (req, res, next) => {
    const ip   = dbDash.getIp(req);
    const user = getSessao(getToken(req), ip);
    if (!user) return res.redirect('/painel/login');
    if (user.__ipBloqueado) return res.redirect('/painel/ip-bloqueado');
    if (!cargos.includes(user.cargo)) {
      req.dashUser = user;
      return res.status(403).send(errorPage('Acesso negado', `Seu cargo (${user.cargo}) não tem permissão para esta página.`));
    }
    req.dashUser = user;
    req.dashIp   = ip;
    next();
  };
}

function middlewareAba(aba) {
  return (req, res, next) => {
    const ip   = dbDash.getIp(req);
    const user = getSessao(getToken(req), ip);
    if (!user) return res.redirect('/painel/login');
    if (user.__ipBloqueado) return res.redirect('/painel/ip-bloqueado');
    if (!dbDash.podeVer(user.cargo, aba)) {
      req.dashUser = user;
      return res.status(403).send(errorPage('Sem acesso', `Seu cargo não tem acesso à aba "${aba}".`));
    }
    req.dashUser = user;
    req.dashIp   = ip;
    next();
  };
}

function errorPage(title, msg) {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>${title}</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Segoe UI',sans-serif;background:#08080f;color:#e0e0f0;min-height:100vh;display:grid;place-items:center;text-align:center}
.box{padding:48px;background:#13131f;border:1px solid #ffffff0f;border-radius:16px;max-width:480px;width:90%}
h1{font-size:24px;margin-bottom:12px;color:#f87171}p{color:#7878a0;margin-bottom:24px;line-height:1.6}
a{color:#a855f7;text-decoration:none;font-weight:600}a:hover{text-decoration:underline}</style></head>
<body><div class="box"><h1>⛔ ${title}</h1><p>${msg}</p><a href="/painel">← Voltar ao painel</a></div></body></html>`;
}

module.exports = { hashPass, criarSessao, getSessao, deletarSessao, getToken, requireAuth, requireCargo, middlewareAba, errorPage };
