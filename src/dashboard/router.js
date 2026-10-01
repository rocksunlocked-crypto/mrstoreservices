/**
 * dashboard/router.js — Painel de controle web do MrStore
 *
 * Acessível em: https://SEU-DOMINIO.railway.app/dashboard
 * Protegido por: DASHBOARD_PASSWORD no .env (padrão: mrstore2024)
 * Sessão via cookie simples (sem JWT, sem OAuth2)
 */

const express  = require('express');
const crypto   = require('crypto');
const router   = express.Router();

// ── Helpers ──────────────────────────────────────────────────
const PASS     = process.env.DASHBOARD_PASSWORD || 'mrstore2024';
const SESSIONS = new Set(); // tokens de sessão em memória

function token() { return crypto.randomBytes(32).toString('hex'); }
function auth(req) {
  const t = req.cookies?.dash_token || req.headers['x-dash-token'];
  return t && SESSIONS.has(t);
}
function requireAuth(req, res, next) {
  if (auth(req)) return next();
  res.redirect('/dashboard/login');
}

// ── CSS e layout base ────────────────────────────────────────
function layout(title, body, activePage = '') {
  const nav = [
    { href: '/dashboard',          icon: '📊', label: 'Visão Geral',  id: 'overview'  },
    { href: '/dashboard/produtos', icon: '📦', label: 'Produtos',     id: 'produtos'  },
    { href: '/dashboard/pedidos',  icon: '🛒', label: 'Pedidos',      id: 'pedidos'   },
    { href: '/dashboard/tickets',  icon: '🎫', label: 'Tickets',      id: 'tickets'   },
    { href: '/dashboard/usuarios', icon: '👥', label: 'Usuários',     id: 'usuarios'  },
    { href: '/dashboard/cupons',   icon: '🎟️', label: 'Cupons',       id: 'cupons'    },
  ].map(n => `<a href="${n.href}" class="nav-item${activePage === n.id ? ' active' : ''}">${n.icon} ${n.label}</a>`).join('');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — MrStore Admin</title>
<style>
:root{--bg:#0f0f13;--sidebar:#16161e;--card:#1e1e2a;--card2:#252534;--border:#2a2a3a;--text:#e0e0f0;--text2:#9090b0;--accent:#7c3aed;--accent2:#9f5bf5;--green:#22c55e;--red:#ef4444;--yellow:#eab308;--blue:#3b82f6;--radius:10px}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',system-ui,sans-serif;background:var(--bg);color:var(--text);min-height:100vh;display:flex}
/* Sidebar */
.sidebar{width:220px;min-height:100vh;background:var(--sidebar);border-right:1px solid var(--border);display:flex;flex-direction:column;padding:20px 0;position:fixed;top:0;left:0;bottom:0;z-index:100}
.sidebar-logo{padding:0 20px 24px;border-bottom:1px solid var(--border);margin-bottom:12px}
.sidebar-logo .brand{font-size:20px;font-weight:800;color:#fff;letter-spacing:1px}
.sidebar-logo .sub{font-size:11px;color:var(--text2);margin-top:2px}
.nav-item{display:flex;align-items:center;gap:10px;padding:10px 20px;color:var(--text2);text-decoration:none;font-size:14px;border-radius:0;transition:all .15s;border-left:3px solid transparent}
.nav-item:hover{background:var(--card);color:var(--text)}
.nav-item.active{background:var(--card);color:var(--accent2);border-left-color:var(--accent2)}
.sidebar-footer{margin-top:auto;padding:16px 20px;border-top:1px solid var(--border)}
.sidebar-footer a{color:var(--text2);font-size:13px;text-decoration:none}
.sidebar-footer a:hover{color:var(--red)}
/* Main */
.main{margin-left:220px;flex:1;padding:32px;min-height:100vh}
.page-title{font-size:22px;font-weight:700;margin-bottom:24px;color:#fff}
/* Cards */
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px;margin-bottom:28px}
.card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:20px}
.card-label{font-size:12px;color:var(--text2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px}
.card-value{font-size:28px;font-weight:800;color:#fff}
.card-value.green{color:var(--green)}
.card-value.yellow{color:var(--yellow)}
.card-value.blue{color:var(--blue)}
.card-value.purple{color:var(--accent2)}
.card-sub{font-size:12px;color:var(--text2);margin-top:4px}
/* Table */
.table-wrap{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;margin-bottom:24px}
.table-header{padding:16px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between}
.table-title{font-size:15px;font-weight:600}
table{width:100%;border-collapse:collapse}
th{padding:10px 16px;text-align:left;font-size:12px;color:var(--text2);text-transform:uppercase;letter-spacing:.4px;border-bottom:1px solid var(--border);background:var(--card2)}
td{padding:10px 16px;font-size:13px;border-bottom:1px solid var(--border)}
tr:last-child td{border-bottom:none}
tr:hover td{background:var(--card2)}
/* Badges */
.badge{display:inline-flex;align-items:center;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:600}
.badge-green{background:#16401f;color:var(--green)}
.badge-red{background:#3b1111;color:var(--red)}
.badge-yellow{background:#3a2e00;color:var(--yellow)}
.badge-blue{background:#0f1e40;color:var(--blue)}
.badge-gray{background:#1e1e2a;color:var(--text2)}
/* Buttons */
.btn{display:inline-flex;align-items:center;gap:6px;padding:7px 16px;border-radius:7px;font-size:13px;font-weight:600;cursor:pointer;text-decoration:none;border:none;transition:all .15s}
.btn-primary{background:var(--accent);color:#fff}
.btn-primary:hover{background:var(--accent2)}
.btn-danger{background:#3b1111;color:var(--red)}
.btn-danger:hover{background:#5a1a1a}
.btn-success{background:#163a20;color:var(--green)}
.btn-success:hover{background:#1f5030}
.btn-sm{padding:4px 10px;font-size:12px}
/* Forms */
.form-group{margin-bottom:16px}
label{display:block;font-size:13px;color:var(--text2);margin-bottom:6px}
input,select,textarea{width:100%;padding:9px 12px;background:var(--card2);border:1px solid var(--border);border-radius:7px;color:var(--text);font-size:13px;outline:none}
input:focus,select:focus{border-color:var(--accent)}
/* Search */
.search-bar{display:flex;gap:10px;margin-bottom:20px}
.search-bar input{max-width:320px}
/* Alert */
.alert{padding:12px 16px;border-radius:7px;margin-bottom:16px;font-size:13px}
.alert-success{background:#163a20;border:1px solid #22c55e33;color:var(--green)}
.alert-error{background:#3b1111;border:1px solid #ef444433;color:var(--red)}
/* Login */
.login-wrap{min-height:100vh;display:grid;place-items:center;background:var(--bg)}
.login-box{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:40px;width:360px}
.login-title{font-size:22px;font-weight:700;margin-bottom:6px;text-align:center}
.login-sub{font-size:13px;color:var(--text2);text-align:center;margin-bottom:28px}
/* Responsive */
@media(max-width:768px){.sidebar{width:60px}.sidebar-logo .brand,.sidebar-logo .sub,.nav-item span{display:none}.main{margin-left:60px;padding:20px}}
</style>
</head>
<body>
<aside class="sidebar">
  <div class="sidebar-logo">
    <div class="brand">MrStore</div>
    <div class="sub">Admin Dashboard</div>
  </div>
  ${nav}
  <div class="sidebar-footer"><a href="/dashboard/logout">🚪 Sair</a></div>
</aside>
<main class="main">
  <div class="page-title">${title}</div>
  ${body}
</main>
</body>
</html>`;
}

function loginPage(error = '') {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Login — MrStore Admin</title>
<style>
:root{--bg:#0f0f13;--card:#1e1e2a;--border:#2a2a3a;--text:#e0e0f0;--text2:#9090b0;--accent:#7c3aed;--accent2:#9f5bf5;--red:#ef4444}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',system-ui,sans-serif;background:var(--bg);color:var(--text);min-height:100vh;display:grid;place-items:center}
.box{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:40px;width:360px;text-align:center}
h1{font-size:22px;font-weight:800;margin-bottom:6px}
p{color:var(--text2);font-size:13px;margin-bottom:28px}
input{width:100%;padding:11px 14px;background:#252534;border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;outline:none;margin-bottom:14px}
input:focus{border-color:var(--accent)}
button{width:100%;padding:11px;background:var(--accent);color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer}
button:hover{background:var(--accent2)}
.err{color:var(--red);font-size:13px;margin-bottom:14px}
</style>
</head>
<body>
<div class="box">
  <h1>🔐 MrStore Admin</h1>
  <p>Digite a senha para acessar o painel</p>
  ${error ? `<div class="err">❌ ${error}</div>` : ''}
  <form method="POST" action="/dashboard/login">
    <input type="password" name="password" placeholder="Senha" autofocus required>
    <button type="submit">Entrar</button>
  </form>
</div>
</body>
</html>`;
}

function badge(status) {
  const map = {
    pago: '<span class="badge badge-green">pago</span>',
    entregue: '<span class="badge badge-green">entregue</span>',
    pendente: '<span class="badge badge-yellow">pendente</span>',
    cancelado: '<span class="badge badge-red">cancelado</span>',
    aberto: '<span class="badge badge-blue">aberto</span>',
    open: '<span class="badge badge-blue">aberto</span>',
    fechado: '<span class="badge badge-gray">fechado</span>',
    closed: '<span class="badge badge-gray">fechado</span>',
    ativo: '<span class="badge badge-green">ativo</span>',
  };
  return map[status] || `<span class="badge badge-gray">${status}</span>`;
}

function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
}

function fmtMoeda(v) {
  return `R$ ${Number(v || 0).toFixed(2)}`;
}

function pagination(page, total, limit, base) {
  const pages = Math.ceil(total / limit);
  if (pages <= 1) return '';
  let html = `<div style="display:flex;gap:8px;margin-top:16px;align-items:center;font-size:13px">`;
  if (page > 1) html += `<a href="${base}?page=${page-1}" class="btn btn-sm" style="background:#252534;color:#e0e0f0">← Anterior</a>`;
  html += `<span style="color:#9090b0">Página ${page} de ${pages}</span>`;
  if (page < pages) html += `<a href="${base}?page=${page+1}" class="btn btn-sm" style="background:#252534;color:#e0e0f0">Próxima →</a>`;
  html += `</div>`;
  return html;
}

// ────────────────────────────────────────────────────────────────────────────
// LOGIN / LOGOUT
// ────────────────────────────────────────────────────────────────────────────

router.get('/login', (req, res) => {
  if (auth(req)) return res.redirect('/dashboard');
  res.send(loginPage());
});

router.post('/login', express.urlencoded({ extended: false }), (req, res) => {
  if (req.body.password === PASS) {
    const t = token();
    SESSIONS.add(t);
    res.setHeader('Set-Cookie', `dash_token=${t}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`);
    return res.redirect('/dashboard');
  }
  res.send(loginPage('Senha incorreta.'));
});

router.get('/logout', (req, res) => {
  const t = req.cookies?.dash_token;
  if (t) SESSIONS.delete(t);
  res.setHeader('Set-Cookie', 'dash_token=; Path=/; Max-Age=0');
  res.redirect('/dashboard/login');
});

// ────────────────────────────────────────────────────────────────────────────
// VISÃO GERAL
// ────────────────────────────────────────────────────────────────────────────

router.get('/', requireAuth, (req, res) => {
  const { db } = require('../database/database');

  const totalVendas   = db.prepare("SELECT COALESCE(SUM(valor_total),0) as v FROM pedidos WHERE status IN ('pago','entregue')").get()?.v || 0;
  const totalPedidos  = db.prepare("SELECT COUNT(*) as c FROM pedidos WHERE status IN ('pago','entregue')").get()?.c || 0;
  const pedidosPend   = db.prepare("SELECT COUNT(*) as c FROM pedidos WHERE status='pendente'").get()?.c || 0;
  const totalUsers    = db.prepare("SELECT COUNT(*) as c FROM usuarios").get()?.c || 0;
  const ticketsAbertos= db.prepare("SELECT COUNT(*) as c FROM tickets WHERE status='aberto'").get()?.c || 0;
  const totalCoins    = db.prepare("SELECT COALESCE(SUM(coins),0) as v FROM usuarios").get()?.v || 0;
  const totalProdutos = db.prepare("SELECT COUNT(*) as c FROM produtos WHERE ativo=1").get()?.c || 0;
  const vendasHoje    = db.prepare("SELECT COALESCE(SUM(valor_total),0) as v FROM pedidos WHERE status IN ('pago','entregue') AND pago_em >= strftime('%s','now','start of day')").get()?.v || 0;

  // Últimas 5 vendas
  const ultimasVendas = db.prepare(`
    SELECT p.*, pr.nome as produto_nome FROM pedidos p
    LEFT JOIN produtos pr ON p.produto_id = pr.id
    WHERE p.status IN ('pago','entregue')
    ORDER BY p.pago_em DESC LIMIT 5
  `).all();

  const body = `
    <div class="grid">
      <div class="card"><div class="card-label">Faturamento Total</div><div class="card-value green">${fmtMoeda(totalVendas)}</div><div class="card-sub">${totalPedidos} vendas concluídas</div></div>
      <div class="card"><div class="card-label">Vendas Hoje</div><div class="card-value yellow">${fmtMoeda(vendasHoje)}</div><div class="card-sub">Apenas hoje</div></div>
      <div class="card"><div class="card-label">Pedidos Pendentes</div><div class="card-value yellow">${pedidosPend}</div><div class="card-sub">Aguardando pagamento</div></div>
      <div class="card"><div class="card-label">Usuários</div><div class="card-value blue">${totalUsers}</div><div class="card-sub">Cadastrados</div></div>
      <div class="card"><div class="card-label">Tickets Abertos</div><div class="card-value ${ticketsAbertos > 0 ? 'yellow' : 'green'}">${ticketsAbertos}</div><div class="card-sub">Aguardando atendimento</div></div>
      <div class="card"><div class="card-label">Coins em Circulação</div><div class="card-value purple">${Number(totalCoins).toLocaleString('pt-BR')}</div><div class="card-sub">${totalProdutos} produtos ativos</div></div>
    </div>

    <div class="table-wrap">
      <div class="table-header"><span class="table-title">🛒 Últimas Vendas</span><a href="/dashboard/pedidos" class="btn btn-primary btn-sm">Ver todas</a></div>
      <table>
        <tr><th>Pedido</th><th>Produto</th><th>Usuário</th><th>Valor</th><th>Data</th><th>Status</th></tr>
        ${ultimasVendas.length ? ultimasVendas.map(p => `
          <tr>
            <td><code style="font-size:11px">${p.id.slice(0,8).toUpperCase()}</code></td>
            <td>${p.produto_nome || '—'}</td>
            <td><code style="font-size:11px">${p.usuario_id}</code></td>
            <td>${fmtMoeda(p.valor_total)}</td>
            <td>${fmtDate(p.pago_em)}</td>
            <td>${badge(p.status)}</td>
          </tr>`).join('') : '<tr><td colspan="6" style="text-align:center;color:#9090b0;padding:24px">Nenhuma venda ainda</td></tr>'}
      </table>
    </div>`;

  res.send(layout('📊 Visão Geral', body, 'overview'));
});

// ────────────────────────────────────────────────────────────────────────────
// PRODUTOS
// ────────────────────────────────────────────────────────────────────────────

router.get('/produtos', requireAuth, (req, res) => {
  const { db } = require('../database/database');
  const page   = parseInt(req.query.page) || 1;
  const limit  = 20;
  const offset = (page - 1) * limit;
  const search = req.query.q || '';
  const msg    = req.query.msg || '';

  const where  = search ? `WHERE p.nome LIKE '%${search.replace(/'/g,"''")}%'` : '';
  const total  = db.prepare(`SELECT COUNT(*) as c FROM produtos p ${where}`).get()?.c || 0;
  const rows   = db.prepare(`
    SELECT p.*, COUNT(v.id) as variantes
    FROM produtos p
    LEFT JOIN variantes_produto v ON v.produto_id = p.id AND v.ativo = 1
    ${where}
    GROUP BY p.id
    ORDER BY p.criado_em DESC
    LIMIT ${limit} OFFSET ${offset}
  `).all();

  const body = `
    ${msg === 'ok' ? '<div class="alert alert-success">✅ Ação realizada com sucesso!</div>' : ''}
    <div class="search-bar">
      <form method="GET">
        <input name="q" value="${search}" placeholder="Buscar produto..." style="width:280px">
      </form>
    </div>
    <div class="table-wrap">
      <div class="table-header"><span class="table-title">📦 Produtos (${total})</span></div>
      <table>
        <tr><th>Nome</th><th>Categoria</th><th>Preço</th><th>Estoque</th><th>Variantes</th><th>Vendas</th><th>Status</th><th>Ações</th></tr>
        ${rows.map(p => {
          const estoqueLabel = p.estoque === -1 ? '∞' : String(p.estoque);
          const statusLabel  = p.ativo ? badge('ativo') : badge('inativo');
          return `<tr>
            <td><strong>${p.nome}</strong></td>
            <td>${p.categoria || '—'}</td>
            <td>${fmtMoeda(p.preco)}</td>
            <td>${estoqueLabel}</td>
            <td>${p.variantes}</td>
            <td>${p.vendas || 0}</td>
            <td>${statusLabel}</td>
            <td style="display:flex;gap:6px">
              <a href="/dashboard/produtos/${p.id}" class="btn btn-sm btn-primary">Ver</a>
              <form method="POST" action="/dashboard/produtos/${p.id}/toggle" style="display:inline">
                <button class="btn btn-sm ${p.ativo ? 'btn-danger' : 'btn-success'}" type="submit">
                  ${p.ativo ? 'Desativar' : 'Ativar'}
                </button>
              </form>
            </td>
          </tr>`;
        }).join('') || '<tr><td colspan="8" style="text-align:center;color:#9090b0;padding:24px">Nenhum produto</td></tr>'}
      </table>
    </div>
    ${pagination(page, total, limit, '/dashboard/produtos')}`;

  res.send(layout('📦 Produtos', body, 'produtos'));
});

router.get('/produtos/:id', requireAuth, (req, res) => {
  const { db } = require('../database/database');
  const p = db.prepare('SELECT * FROM produtos WHERE id=?').get(req.params.id);
  if (!p) return res.redirect('/dashboard/produtos');

  const variantes = db.prepare('SELECT * FROM variantes_produto WHERE produto_id=? ORDER BY ordem ASC').all(p.id);
  const estoque   = variantes.map(v => {
    const disp = db.prepare('SELECT COUNT(*) as c FROM estoque_variante WHERE variante_id=? AND usado=0').get(v.id)?.c || 0;
    return `<tr><td>${v.nome}</td><td>${fmtMoeda(v.preco)}</td><td>${disp} disponível(is)</td><td>${v.ativo ? badge('ativo') : badge('inativo')}</td></tr>`;
  }).join('');

  const body = `
    <a href="/dashboard/produtos" class="btn btn-sm" style="background:#252534;color:#e0e0f0;margin-bottom:20px">← Voltar</a>
    <div class="grid" style="margin-top:16px">
      <div class="card"><div class="card-label">Nome</div><div style="font-size:18px;font-weight:700;margin-top:4px">${p.nome}</div></div>
      <div class="card"><div class="card-label">Preço Base</div><div class="card-value green">${fmtMoeda(p.preco)}</div></div>
      <div class="card"><div class="card-label">Vendas</div><div class="card-value blue">${p.vendas || 0}</div></div>
      <div class="card"><div class="card-label">Status</div><div style="margin-top:8px">${p.ativo ? badge('ativo') : badge('inativo')}</div></div>
    </div>
    <div class="table-wrap">
      <div class="table-header"><span class="table-title">Variantes / Planos</span></div>
      <table><tr><th>Nome</th><th>Preço</th><th>Estoque</th><th>Status</th></tr>
      ${estoque || '<tr><td colspan="4" style="text-align:center;color:#9090b0;padding:16px">Sem variantes</td></tr>'}
      </table>
    </div>`;

  res.send(layout(`📦 ${p.nome}`, body, 'produtos'));
});

router.post('/produtos/:id/toggle', requireAuth, (req, res) => {
  const { db } = require('../database/database');
  const p = db.prepare('SELECT ativo FROM produtos WHERE id=?').get(req.params.id);
  if (p) db.prepare('UPDATE produtos SET ativo=? WHERE id=?').run(p.ativo ? 0 : 1, req.params.id);
  res.redirect('/dashboard/produtos?msg=ok');
});

// ────────────────────────────────────────────────────────────────────────────
// PEDIDOS
// ────────────────────────────────────────────────────────────────────────────

router.get('/pedidos', requireAuth, (req, res) => {
  const { db } = require('../database/database');
  const page   = parseInt(req.query.page) || 1;
  const limit  = 25;
  const offset = (page - 1) * limit;
  const status = req.query.status || '';
  const search = req.query.q || '';

  let where = 'WHERE 1=1';
  if (status) where += ` AND p.status='${status.replace(/'/g,"''")}'`;
  if (search) where += ` AND (p.id LIKE '%${search.replace(/'/g,"''")}%' OR p.usuario_id LIKE '%${search.replace(/'/g,"''")}%')`;

  const total = db.prepare(`SELECT COUNT(*) as c FROM pedidos p ${where}`).get()?.c || 0;
  const rows  = db.prepare(`
    SELECT p.*, pr.nome as produto_nome
    FROM pedidos p
    LEFT JOIN produtos pr ON p.produto_id = pr.id
    ${where}
    ORDER BY p.criado_em DESC
    LIMIT ${limit} OFFSET ${offset}
  `).all();

  const statusOpts = ['','pendente','pago','entregue','cancelado'].map(s =>
    `<option value="${s}" ${status===s?'selected':''}>${s||'Todos os status'}</option>`).join('');

  const body = `
    <div class="search-bar">
      <form method="GET" style="display:flex;gap:10px">
        <input name="q" value="${search}" placeholder="Buscar por ID ou usuário..." style="width:260px">
        <select name="status" style="width:180px">${statusOpts}</select>
        <button class="btn btn-primary" type="submit">🔍 Filtrar</button>
      </form>
    </div>
    <div class="table-wrap">
      <div class="table-header"><span class="table-title">🛒 Pedidos (${total})</span></div>
      <table>
        <tr><th>Pedido</th><th>Produto</th><th>Usuário</th><th>Valor</th><th>Método</th><th>Data</th><th>Status</th></tr>
        ${rows.map(p => `<tr>
          <td><code style="font-size:11px">${p.id.slice(0,8).toUpperCase()}</code></td>
          <td>${p.produto_nome || '—'}</td>
          <td><code style="font-size:11px">${p.usuario_id}</code></td>
          <td>${fmtMoeda(p.valor_total)}</td>
          <td>${p.metodo_pag || '—'}</td>
          <td>${fmtDate(p.criado_em)}</td>
          <td>${badge(p.status)}</td>
        </tr>`).join('') || '<tr><td colspan="7" style="text-align:center;color:#9090b0;padding:24px">Nenhum pedido</td></tr>'}
      </table>
    </div>
    ${pagination(page, total, limit, `/dashboard/pedidos?status=${status}&q=${search}`)}`;

  res.send(layout('🛒 Pedidos', body, 'pedidos'));
});

// ────────────────────────────────────────────────────────────────────────────
// TICKETS
// ────────────────────────────────────────────────────────────────────────────

router.get('/tickets', requireAuth, (req, res) => {
  const { db } = require('../database/database');
  const page   = parseInt(req.query.page) || 1;
  const limit  = 25;
  const offset = (page - 1) * limit;
  const status = req.query.status || '';
  const search = req.query.q || '';

  let where = 'WHERE 1=1';
  if (status) where += ` AND status='${status.replace(/'/g,"''")}'`;
  if (search) where += ` AND (id LIKE '%${search.replace(/'/g,"''")}%' OR usuario_id LIKE '%${search.replace(/'/g,"''")}%')`;

  const total = db.prepare(`SELECT COUNT(*) as c FROM tickets ${where}`).get()?.c || 0;
  const rows  = db.prepare(`SELECT * FROM tickets ${where} ORDER BY criado_em DESC LIMIT ${limit} OFFSET ${offset}`).all();

  const statusOpts = ['','aberto','fechado'].map(s =>
    `<option value="${s}" ${status===s?'selected':''}>${s||'Todos'}</option>`).join('');

  const body = `
    <div class="search-bar">
      <form method="GET" style="display:flex;gap:10px">
        <input name="q" value="${search}" placeholder="Buscar por ID ou usuário..." style="width:260px">
        <select name="status" style="width:160px">${statusOpts}</select>
        <button class="btn btn-primary" type="submit">🔍 Filtrar</button>
      </form>
    </div>
    <div class="table-wrap">
      <div class="table-header"><span class="table-title">🎫 Tickets (${total})</span></div>
      <table>
        <tr><th>ID</th><th>Tipo</th><th>Usuário</th><th>Atendente</th><th>Aberto em</th><th>Status</th></tr>
        ${rows.map(t => `<tr>
          <td><code style="font-size:11px">${(t.id||'').slice(0,8).toUpperCase()}</code></td>
          <td>${t.tipo || '—'}</td>
          <td><code style="font-size:11px">${t.usuario_id || '—'}</code></td>
          <td>${t.atendente ? `<code style="font-size:11px">${t.atendente}</code>` : '<span style="color:#9090b0">—</span>'}</td>
          <td>${fmtDate(t.criado_em)}</td>
          <td>${badge(t.status)}</td>
        </tr>`).join('') || '<tr><td colspan="6" style="text-align:center;color:#9090b0;padding:24px">Nenhum ticket</td></tr>'}
      </table>
    </div>
    ${pagination(page, total, limit, `/dashboard/tickets?status=${status}&q=${search}`)}`;

  res.send(layout('🎫 Tickets', body, 'tickets'));
});

// ────────────────────────────────────────────────────────────────────────────
// USUÁRIOS
// ────────────────────────────────────────────────────────────────────────────

router.get('/usuarios', requireAuth, (req, res) => {
  const { db } = require('../database/database');
  const page   = parseInt(req.query.page) || 1;
  const limit  = 25;
  const offset = (page - 1) * limit;
  const search = req.query.q || '';
  const msg    = req.query.msg || '';

  const where  = search ? `WHERE discord_id LIKE '%${search.replace(/'/g,"''")}%' OR nome LIKE '%${search.replace(/'/g,"''")}%'` : '';
  const total  = db.prepare(`SELECT COUNT(*) as c FROM usuarios ${where}`).get()?.c || 0;
  const rows   = db.prepare(`SELECT * FROM usuarios ${where} ORDER BY total_gasto DESC LIMIT ${limit} OFFSET ${offset}`).all();

  const body = `
    ${msg === 'ok' ? '<div class="alert alert-success">✅ Ação realizada!</div>' : ''}
    <div class="search-bar">
      <form method="GET">
        <input name="q" value="${search}" placeholder="Buscar por ID ou nome..." style="width:280px">
      </form>
    </div>
    <div class="table-wrap">
      <div class="table-header"><span class="table-title">👥 Usuários (${total})</span></div>
      <table>
        <tr><th>ID Discord</th><th>Nome</th><th>Saldo</th><th>Coins</th><th>Gasto Total</th><th>Nível</th><th>Status</th><th>Ações</th></tr>
        ${rows.map(u => `<tr>
          <td><code style="font-size:11px">${u.discord_id}</code></td>
          <td>${u.nome || '—'}</td>
          <td>${fmtMoeda(u.saldo)}</td>
          <td>🪙 ${Number(u.coins||0).toLocaleString('pt-BR')}</td>
          <td>${fmtMoeda(u.total_gasto)}</td>
          <td>${u.nivel || 'Bronze'}</td>
          <td>${u.bloqueado ? badge('bloqueado') : badge('ativo')}</td>
          <td>
            <form method="POST" action="/dashboard/usuarios/${u.discord_id}/toggle" style="display:inline">
              <button class="btn btn-sm ${u.bloqueado ? 'btn-success' : 'btn-danger'}" type="submit">
                ${u.bloqueado ? 'Desbloquear' : 'Bloquear'}
              </button>
            </form>
          </td>
        </tr>`).join('') || '<tr><td colspan="8" style="text-align:center;color:#9090b0;padding:24px">Nenhum usuário</td></tr>'}
      </table>
    </div>
    ${pagination(page, total, limit, `/dashboard/usuarios?q=${search}`)}`;

  res.send(layout('👥 Usuários', body, 'usuarios'));
});

router.post('/usuarios/:id/toggle', requireAuth, (req, res) => {
  const { db } = require('../database/database');
  const u = db.prepare('SELECT bloqueado FROM usuarios WHERE discord_id=?').get(req.params.id);
  if (u) db.prepare('UPDATE usuarios SET bloqueado=? WHERE discord_id=?').run(u.bloqueado ? 0 : 1, req.params.id);
  res.redirect('/dashboard/usuarios?msg=ok');
});

// ────────────────────────────────────────────────────────────────────────────
// CUPONS
// ────────────────────────────────────────────────────────────────────────────

router.get('/cupons', requireAuth, (req, res) => {
  const { db } = require('../database/database');
  const msg    = req.query.msg || '';
  const rows   = db.prepare('SELECT * FROM cupons ORDER BY criado_em DESC').all();

  const body = `
    ${msg === 'ok' ? '<div class="alert alert-success">✅ Ação realizada!</div>' : ''}
    ${msg === 'err' ? '<div class="alert alert-error">❌ Erro ao criar cupom.</div>' : ''}

    <div class="table-wrap" style="margin-bottom:28px">
      <div class="table-header"><span class="table-title">➕ Novo Cupom</span></div>
      <div style="padding:20px">
        <form method="POST" action="/dashboard/cupons/criar" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px">
          <div class="form-group"><label>Código</label><input name="codigo" placeholder="Ex: PROMO10 (auto se vazio)"></div>
          <div class="form-group"><label>Tipo</label><select name="tipo"><option value="percentual">% Percentual</option><option value="fixo">R$ Fixo</option></select></div>
          <div class="form-group"><label>Valor</label><input name="valor" type="number" step="0.01" min="0.01" required placeholder="Ex: 10"></div>
          <div class="form-group"><label>Usos Máximos</label><input name="usos" type="number" min="1" value="100"></div>
          <div class="form-group"><label>Validade (dias)</label><input name="validade" type="number" min="1" value="30"></div>
          <div class="form-group"><label>Compra Mínima</label><input name="min_compra" type="number" step="0.01" value="0"></div>
          <div style="display:flex;align-items:flex-end"><button class="btn btn-primary" type="submit" style="height:38px;width:100%">Criar Cupom</button></div>
        </form>
      </div>
    </div>

    <div class="table-wrap">
      <div class="table-header"><span class="table-title">🎟️ Cupons (${rows.length})</span></div>
      <table>
        <tr><th>Código</th><th>Tipo</th><th>Valor</th><th>Usos</th><th>Validade</th><th>Status</th><th>Ações</th></tr>
        ${rows.map(c => {
          const exp = c.validade ? new Date(c.validade*1000).toLocaleDateString('pt-BR') : '∞';
          const expirado = c.validade && c.validade < Math.floor(Date.now()/1000);
          return `<tr>
            <td><strong>${c.codigo}</strong></td>
            <td>${c.tipo}</td>
            <td>${c.tipo==='percentual' ? c.valor+'%' : fmtMoeda(c.valor)}</td>
            <td>${c.usos_atual}/${c.usos_max}</td>
            <td>${exp}</td>
            <td>${expirado ? badge('expirado') : c.ativo ? badge('ativo') : badge('inativo')}</td>
            <td style="display:flex;gap:6px">
              <form method="POST" action="/dashboard/cupons/${c.codigo}/toggle" style="display:inline">
                <button class="btn btn-sm ${c.ativo ? 'btn-danger' : 'btn-success'}" type="submit">
                  ${c.ativo ? 'Desativar' : 'Ativar'}
                </button>
              </form>
              <form method="POST" action="/dashboard/cupons/${c.codigo}/deletar" style="display:inline" onsubmit="return confirm('Deletar cupom ${c.codigo}?')">
                <button class="btn btn-sm btn-danger" type="submit">🗑️</button>
              </form>
            </td>
          </tr>`;
        }).join('') || '<tr><td colspan="7" style="text-align:center;color:#9090b0;padding:24px">Nenhum cupom</td></tr>'}
      </table>
    </div>`;

  res.send(layout('🎟️ Cupons', body, 'cupons'));
});

router.post('/cupons/criar', requireAuth, express.urlencoded({ extended: false }), (req, res) => {
  try {
    const { criarCupom, gerarCodigoCupom } = require('../systems/cupons');
    const { codigo, tipo, valor, usos, validade, min_compra } = req.body;
    criarCupom({
      codigo:       codigo || gerarCodigoCupom(),
      tipo:         tipo || 'percentual',
      valor:        parseFloat(valor),
      usosMax:      parseInt(usos) || 100,
      validadeDias: parseInt(validade) || 30,
      minCompra:    parseFloat(min_compra) || 0,
      criadoPor:    'dashboard',
    });
    res.redirect('/dashboard/cupons?msg=ok');
  } catch (e) {
    console.error('[Dashboard Cupom]', e.message);
    res.redirect('/dashboard/cupons?msg=err');
  }
});

router.post('/cupons/:codigo/toggle', requireAuth, (req, res) => {
  const { db } = require('../database/database');
  const c = db.prepare('SELECT ativo FROM cupons WHERE codigo=?').get(req.params.codigo.toUpperCase());
  if (c) db.prepare('UPDATE cupons SET ativo=? WHERE codigo=?').run(c.ativo ? 0 : 1, req.params.codigo.toUpperCase());
  res.redirect('/dashboard/cupons?msg=ok');
});

router.post('/cupons/:codigo/deletar', requireAuth, (req, res) => {
  const { deletarCupom } = require('../systems/cupons');
  deletarCupom(req.params.codigo);
  res.redirect('/dashboard/cupons?msg=ok');
});

module.exports = router;
