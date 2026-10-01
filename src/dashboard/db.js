/**
 * dashboard/db.js — Tabelas e helpers do dashboard
 */
const { db } = require('../database/database');

// Criar tabelas do dashboard
function initDashDB() {
  // Usuários do dashboard
  db.exec(`
    CREATE TABLE IF NOT EXISTS dash_usuarios (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      username    TEXT UNIQUE NOT NULL,
      password    TEXT NOT NULL,
      discord_id  TEXT NOT NULL,
      cargo       TEXT DEFAULT 'cliente',
      aprovado    INTEGER DEFAULT 0,
      ip_bloqueado TEXT,
      criado_em   INTEGER DEFAULT (strftime('%s','now')),
      ultimo_acesso INTEGER
    );

    CREATE TABLE IF NOT EXISTS dash_sessoes (
      token       TEXT PRIMARY KEY,
      usuario_id  INTEGER NOT NULL,
      ip          TEXT,
      criado_em   INTEGER DEFAULT (strftime('%s','now')),
      expira_em   INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS dash_permissoes_cargo (
      cargo       TEXT NOT NULL,
      aba         TEXT NOT NULL,
      permitido   INTEGER DEFAULT 1,
      PRIMARY KEY (cargo, aba)
    );

    CREATE TABLE IF NOT EXISTS dash_solicitacoes (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id  INTEGER NOT NULL,
      username    TEXT NOT NULL,
      produto_id  TEXT NOT NULL,
      variante_id TEXT,
      quantidade  INTEGER DEFAULT 1,
      observacao  TEXT,
      status      TEXT DEFAULT 'pendente',
      respondido_por TEXT,
      motivo      TEXT,
      criado_em   INTEGER DEFAULT (strftime('%s','now')),
      respondido_em INTEGER
    );
  `);

  // Permissões padrão por cargo (dono pode mudar)
  const ABAS = ['overview','loja','perfil','solicitar','solicitacoes','usuarios','produtos','pedidos','tickets','cupons','gerenciar','config_mr'];
  const DEFAULTS = {
    cliente:    ['loja','perfil'],
    staff:      ['loja','perfil','solicitar','usuarios'],
    resp_staff: ['loja','perfil','solicitar','solicitacoes','usuarios'],
    sub_dono:   ABAS,
    dono:       ABAS,
  };

  const ins = db.prepare('INSERT OR IGNORE INTO dash_permissoes_cargo (cargo, aba, permitido) VALUES (?,?,?)');
  for (const [cargo, abas] of Object.entries(DEFAULTS)) {
    for (const aba of ABAS) {
      ins.run(cargo, aba, abas.includes(aba) ? 1 : 0);
    }
  }

  // Criar conta dono padrão se não existir
  const OWNER = process.env.DASHBOARD_OWNER_USER || 'admin';
  const PASS  = process.env.DASHBOARD_PASSWORD    || 'mrstore2024';
  const { hashPass } = require('./auth');
  const existe = db.prepare('SELECT id FROM dash_usuarios WHERE cargo=?').get('dono');
  if (!existe) {
    db.prepare('INSERT OR IGNORE INTO dash_usuarios (username, password, discord_id, cargo, aprovado) VALUES (?,?,?,?,1)')
      .run(OWNER, hashPass(PASS), process.env.OWNER_DISCORD_ID || '0', 'dono');
    console.log(`[Dashboard] Conta dono criada: ${OWNER} / ${PASS}`);
  }

  console.log('[Dashboard] ✅ Banco do dashboard inicializado.');
}

// Helpers
function getUsuario(id)               { return db.prepare('SELECT * FROM dash_usuarios WHERE id=?').get(id); }
function getUsuarioByUsername(u)      { return db.prepare('SELECT * FROM dash_usuarios WHERE username=?').get(u); }
function getUsuarioByDiscord(did)     { return db.prepare('SELECT * FROM dash_usuarios WHERE discord_id=?').get(did); }
function listarUsuarios()             { return db.prepare('SELECT * FROM dash_usuarios ORDER BY criado_em DESC').all(); }
function listarPendentes()            { return db.prepare("SELECT * FROM dash_usuarios WHERE aprovado=0 ORDER BY criado_em DESC").all(); }
function aprovarUsuario(id)           { db.prepare('UPDATE dash_usuarios SET aprovado=1 WHERE id=?').run(id); }
function recusarUsuario(id)           { db.prepare('DELETE FROM dash_usuarios WHERE id=?').run(id); }
function mudarCargo(id, cargo)        { db.prepare('UPDATE dash_usuarios SET cargo=? WHERE id=?').run(cargo, id); }
function atualizarAcesso(id)          { db.prepare("UPDATE dash_usuarios SET ultimo_acesso=strftime('%s','now') WHERE id=?").run(id); }

// ── IP lock — só para cargos staff+ ──────────────────────────
const CARGOS_COM_IP_LOCK = ['staff','resp_staff','sub_dono','dono'];
function precisaIpLock(cargo) { return CARGOS_COM_IP_LOCK.includes(cargo); }

function getIpBloqueado(id) {
  const u = db.prepare('SELECT ip_bloqueado FROM dash_usuarios WHERE id=?').get(id);
  return u?.ip_bloqueado || null;
}
function definirIpBloqueado(id, ip) {
  db.prepare('UPDATE dash_usuarios SET ip_bloqueado=? WHERE id=?').run(ip, id);
}
function resetarIp(id) {
  db.prepare('UPDATE dash_usuarios SET ip_bloqueado=NULL WHERE id=?').run(id);
  // Invalidar todas as sessões existentes do usuário
  db.prepare('DELETE FROM dash_sessoes WHERE usuario_id=?').run(id);
}

// Retorna IP real considerando proxies/Railway
function getIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.headers['x-real-ip']
    || req.socket?.remoteAddress
    || 'unknown';
}

function getPermissoes(cargo) {
  const rows = db.prepare('SELECT aba, permitido FROM dash_permissoes_cargo WHERE cargo=?').all(cargo);
  const map = {};
  rows.forEach(r => map[r.aba] = r.permitido === 1);
  return map;
}
function setPermissao(cargo, aba, val) {
  db.prepare('INSERT OR REPLACE INTO dash_permissoes_cargo (cargo, aba, permitido) VALUES (?,?,?)').run(cargo, aba, val ? 1 : 0);
}
function podeVer(cargo, aba) {
  const r = db.prepare('SELECT permitido FROM dash_permissoes_cargo WHERE cargo=? AND aba=?').get(cargo, aba);
  return r?.permitido === 1;
}

function criarSolicitacao(dados) {
  return db.prepare('INSERT INTO dash_solicitacoes (usuario_id, username, produto_id, variante_id, quantidade, observacao) VALUES (?,?,?,?,?,?)')
    .run(dados.usuario_id, dados.username, dados.produto_id, dados.variante_id || null, dados.quantidade || 1, dados.observacao || null);
}
function listarSolicitacoes(status = null) {
  if (status) return db.prepare('SELECT * FROM dash_solicitacoes WHERE status=? ORDER BY criado_em DESC').all(status);
  return db.prepare('SELECT * FROM dash_solicitacoes ORDER BY criado_em DESC').all();
}
function responderSolicitacao(id, status, respondidoPor, motivo = null) {
  db.prepare("UPDATE dash_solicitacoes SET status=?, respondido_por=?, motivo=?, respondido_em=strftime('%s','now') WHERE id=?")
    .run(status, respondidoPor, motivo, id);
}

module.exports = {
  initDashDB,
  getUsuario, getUsuarioByUsername, getUsuarioByDiscord,
  listarUsuarios, listarPendentes,
  aprovarUsuario, recusarUsuario, mudarCargo, atualizarAcesso,
  getPermissoes, setPermissao, podeVer,
  criarSolicitacao, listarSolicitacoes, responderSolicitacao,
  precisaIpLock, getIpBloqueado, definirIpBloqueado, resetarIp, getIp,
};
