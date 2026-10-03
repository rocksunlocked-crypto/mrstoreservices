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

    CREATE TABLE IF NOT EXISTS dash_paineis_cliente (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      titulo      TEXT NOT NULL,
      descricao   TEXT,
      icone       TEXT DEFAULT '📥',
      cor         TEXT DEFAULT '7c3aed',
      imagem_url  TEXT,
      links       TEXT NOT NULL DEFAULT '[]',
      ordem       INTEGER DEFAULT 0,
      ativo       INTEGER DEFAULT 1,
      criado_por  TEXT,
      criado_em   INTEGER DEFAULT (strftime('%s','now'))
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

    CREATE TABLE IF NOT EXISTS dash_precos_revendedor (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      produto_id  TEXT NOT NULL,
      variante_id TEXT,
      preco       REAL NOT NULL,
      ativo       INTEGER DEFAULT 1,
      criado_por  TEXT,
      criado_em   INTEGER DEFAULT (strftime('%s','now')),
      UNIQUE(produto_id, variante_id)
    );

    CREATE TABLE IF NOT EXISTS dash_assinaturas_premium (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id  INTEGER NOT NULL UNIQUE,
      discord_id  TEXT,
      pedido_id   TEXT,
      inicio_em   INTEGER DEFAULT (strftime('%s','now')),
      expira_em   INTEGER NOT NULL,
      ativo       INTEGER DEFAULT 1,
      criado_em   INTEGER DEFAULT (strftime('%s','now'))
    );
  `);

  // Permissões padrão por cargo (dono pode mudar)
  const ABAS = ['overview','loja','perfil','solicitar','solicitacoes','usuarios','produtos','pedidos','tickets','cupons','gerenciar','config_mr','clientes','meus_pedidos','revendedor','carrinhos'];
  const DEFAULTS = {
    cliente:     ['loja','perfil','clientes','meus_pedidos'],
    revendedor:  ['loja','perfil','clientes','meus_pedidos','revendedor'],
    staff:       ['loja','perfil','solicitar','usuarios','clientes','meus_pedidos','carrinhos'],
    resp_staff:  ['loja','perfil','solicitar','solicitacoes','usuarios','clientes','meus_pedidos','carrinhos'],
    sub_dono:    ABAS,
    dono:        ABAS,
  };

  const ins = db.prepare('INSERT OR IGNORE INTO dash_permissoes_cargo (cargo, aba, permitido) VALUES (?,?,?)');
  for (const [cargo, abas] of Object.entries(DEFAULTS)) {
    for (const aba of ABAS) {
      ins.run(cargo, aba, abas.includes(aba) ? 1 : 0);
    }
  }

  // Migração segura — adicionar imagem_url se não existir
  try { db.exec('ALTER TABLE dash_paineis_cliente ADD COLUMN imagem_url TEXT'); } catch {}

  // Garantir novas abas em bancos existentes
  for (const cargo of ['sub_dono', 'dono']) {
    for (const aba of ['config_mr','clientes','meus_pedidos','revendedor','overview','loja','perfil','solicitar','solicitacoes','usuarios','produtos','pedidos','tickets','cupons','gerenciar']) {
      db.prepare('INSERT OR REPLACE INTO dash_permissoes_cargo (cargo, aba, permitido) VALUES (?,?,1)').run(cargo, aba);
    }
  }
  for (const cargo of ['resp_staff']) {
    for (const aba of ['clientes','meus_pedidos','solicitar','solicitacoes','loja','perfil','usuarios','carrinhos']) {
      db.prepare('INSERT OR REPLACE INTO dash_permissoes_cargo (cargo, aba, permitido) VALUES (?,?,1)').run(cargo, aba);
    }
  }
  for (const cargo of ['staff']) {
    for (const aba of ['clientes','meus_pedidos','loja','perfil','solicitar','usuarios','carrinhos']) {
      db.prepare('INSERT OR REPLACE INTO dash_permissoes_cargo (cargo, aba, permitido) VALUES (?,?,1)').run(cargo, aba);
    }
  }
  for (const cargo of ['revendedor']) {
    for (const aba of ['loja','perfil','clientes','meus_pedidos','revendedor']) {
      db.prepare('INSERT OR REPLACE INTO dash_permissoes_cargo (cargo, aba, permitido) VALUES (?,?,1)').run(cargo, aba);
    }
  }
  for (const cargo of ['cliente']) {
    for (const aba of ['loja','perfil','clientes','meus_pedidos']) {
      db.prepare('INSERT OR REPLACE INTO dash_permissoes_cargo (cargo, aba, permitido) VALUES (?,?,1)').run(cargo, aba);
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
  // Garantir que o usuário dono sempre tem cargo=dono (proteção contra alteração indevida)
  db.prepare("UPDATE dash_usuarios SET cargo='dono' WHERE username=?").run(OWNER);

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
const CARGOS_COM_IP_LOCK = ['staff','revendedor','resp_staff','sub_dono','dono'];
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

// ── Preços revendedor ──────────────────────────────────────────
function getPrecoRevendedor(produtoId, varianteId) {
  return db.prepare('SELECT preco FROM dash_precos_revendedor WHERE produto_id=? AND (variante_id=? OR (variante_id IS NULL AND ? IS NULL)) AND ativo=1 LIMIT 1')
    .get(produtoId, varianteId || null, varianteId || null);
}
function listarPrecosRevendedor() {
  const { db: mainDb } = require('../database/database');
  return mainDb.prepare(`
    SELECT r.*, p.nome as produto_nome, v.nome as variante_nome, p.preco as preco_normal
    FROM dash_precos_revendedor r
    LEFT JOIN produtos p ON p.id = r.produto_id
    LEFT JOIN variantes_produto v ON v.id = r.variante_id
    ORDER BY p.nome, v.nome
  `).all();
}
function salvarPrecoRevendedor(produtoId, varianteId, preco, criadoPor) {
  db.prepare('INSERT OR REPLACE INTO dash_precos_revendedor (produto_id, variante_id, preco, ativo, criado_por) VALUES (?,?,?,1,?)')
    .run(produtoId, varianteId || null, preco, criadoPor);
}
function removerPrecoRevendedor(id) {
  db.prepare('DELETE FROM dash_precos_revendedor WHERE id=?').run(id);
}

// ── Assinatura Premium ──────────────────────────────────────────────────────
function isPremium(usuarioId) {
  const agora = Math.floor(Date.now() / 1000);
  const r = db.prepare('SELECT * FROM dash_assinaturas_premium WHERE usuario_id=? AND ativo=1 AND expira_em > ?').get(usuarioId, agora);
  return !!r;
}
function getAssinatura(usuarioId) {
  return db.prepare('SELECT * FROM dash_assinaturas_premium WHERE usuario_id=?').get(usuarioId);
}
function ativarPremium(usuarioId, discordId, pedidoId) {
  const agora   = Math.floor(Date.now() / 1000);
  const expira  = agora + 30 * 24 * 60 * 60; // 30 dias
  const existe  = db.prepare('SELECT id FROM dash_assinaturas_premium WHERE usuario_id=?').get(usuarioId);
  if (existe) {
    db.prepare('UPDATE dash_assinaturas_premium SET ativo=1, expira_em=?, pedido_id=?, inicio_em=? WHERE usuario_id=?')
      .run(expira, pedidoId, agora, usuarioId);
  } else {
    db.prepare('INSERT INTO dash_assinaturas_premium (usuario_id, discord_id, pedido_id, expira_em) VALUES (?,?,?,?)')
      .run(usuarioId, discordId || null, pedidoId, expira);
  }
}
function cancelarPremium(usuarioId) {
  db.prepare('UPDATE dash_assinaturas_premium SET ativo=0 WHERE usuario_id=?').run(usuarioId);
}
function listarAssinaturas() {
  return db.prepare(`
    SELECT a.*, u.username, u.discord_id as discord
    FROM dash_assinaturas_premium a
    LEFT JOIN dash_usuarios u ON u.id = a.usuario_id
    ORDER BY a.criado_em DESC
  `).all();
}

module.exports = {
  initDashDB,
  getUsuario, getUsuarioByUsername, getUsuarioByDiscord,
  listarUsuarios, listarPendentes,
  aprovarUsuario, recusarUsuario, mudarCargo, atualizarAcesso,
  getPermissoes, setPermissao, podeVer,
  criarSolicitacao, listarSolicitacoes, responderSolicitacao,
  precisaIpLock, getIpBloqueado, definirIpBloqueado, resetarIp, getIp,
  getPrecoRevendedor, listarPrecosRevendedor, salvarPrecoRevendedor, removerPrecoRevendedor,
  isPremium, getAssinatura, ativarPremium, cancelarPremium, listarAssinaturas,
};
