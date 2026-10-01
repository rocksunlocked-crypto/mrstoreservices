/**
 * dashboard/layout.js — Layout base e CSS compartilhado
 */

const CARGO_LABELS = {
  cliente:    { label: 'Cliente',       color: '#60a5fa', icon: '👤' },
  staff:      { label: 'Staff',         color: '#34d399', icon: '🛡️' },
  resp_staff: { label: 'Resp. Staff',   color: '#a78bfa', icon: '⭐' },
  sub_dono:   { label: 'Sub-Dono',      color: '#f59e0b', icon: '👑' },
  dono:       { label: 'Dono',          color: '#f43f5e', icon: '💎' },
};

const ABAS_INFO = {
  overview:     { icon: '📊', label: 'Visão Geral'   },
  loja:         { icon: '🛍️', label: 'Loja'          },
  solicitar:    { icon: '📋', label: 'Solicitar Item' },
  solicitacoes: { icon: '📥', label: 'Solicitações'  },
  usuarios:     { icon: '👥', label: 'Usuários'      },
  produtos:     { icon: '📦', label: 'Produtos'      },
  pedidos:      { icon: '🛒', label: 'Pedidos'       },
  tickets:      { icon: '🎫', label: 'Tickets'       },
  cupons:       { icon: '🎟️', label: 'Cupons'        },
  gerenciar:    { icon: '⚙️', label: 'Gerenciar'     },
};

const CSS = `
<style>
:root {
  --bg: #08080f;
  --sidebar: #0e0e1a;
  --card: #13131f;
  --card2: #1a1a2a;
  --border: #ffffff0f;
  --border2: #ffffff18;
  --text: #e8e8f8;
  --text2: #7878a0;
  --accent: #7c3aed;
  --accent2: #a855f7;
  --accent-glow: rgba(124,58,237,0.25);
  --green: #22c55e;
  --red: #ef4444;
  --yellow: #f59e0b;
  --blue: #3b82f6;
  --pink: #ec4899;
  --radius: 12px;
  --sidebar-w: 240px;
}
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%}
body{font-family:'Segoe UI',system-ui,-apple-system,sans-serif;background:var(--bg);color:var(--text);line-height:1.5}

/* Scrollbar */
::-webkit-scrollbar{width:6px;height:6px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:#ffffff20;border-radius:3px}

/* Layout */
.layout{display:flex;min-height:100vh}

/* Sidebar */
.sidebar{
  width:var(--sidebar-w);
  background:var(--sidebar);
  border-right:1px solid var(--border);
  display:flex;flex-direction:column;
  position:fixed;top:0;left:0;bottom:0;
  z-index:200;overflow-y:auto;
  backdrop-filter:blur(20px);
}
.sidebar-logo{
  padding:24px 20px 20px;
  border-bottom:1px solid var(--border);
}
.sidebar-logo .brand{
  font-size:20px;font-weight:800;
  background:linear-gradient(135deg,#a855f7,#3b82f6);
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;
  background-clip:text;
}
.sidebar-logo .sub{font-size:11px;color:var(--text2);margin-top:2px}
.sidebar-nav{flex:1;padding:12px 10px}
.nav-section{font-size:10px;color:var(--text2);text-transform:uppercase;letter-spacing:1px;padding:14px 10px 6px;font-weight:600}
.nav-item{
  display:flex;align-items:center;gap:10px;
  padding:9px 12px;border-radius:9px;
  color:var(--text2);text-decoration:none;font-size:13px;
  transition:all .18s;cursor:pointer;margin-bottom:2px;
  border:1px solid transparent;
}
.nav-item:hover{background:var(--card2);color:var(--text);border-color:var(--border)}
.nav-item.active{
  background:linear-gradient(135deg,#7c3aed20,#3b82f620);
  color:#fff;border-color:#7c3aed40;
  box-shadow:0 0 20px var(--accent-glow);
}
.nav-item .icon{font-size:16px;width:20px;text-align:center}
.sidebar-footer{padding:16px;border-top:1px solid var(--border)}
.user-card{
  background:var(--card2);border:1px solid var(--border2);
  border-radius:10px;padding:12px;display:flex;align-items:center;gap:10px;
}
.user-avatar{
  width:36px;height:36px;border-radius:50%;
  background:linear-gradient(135deg,var(--accent),var(--blue));
  display:flex;align-items:center;justify-content:center;
  font-size:16px;font-weight:700;flex-shrink:0;
}
.user-info{flex:1;min-width:0}
.user-name{font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.user-cargo{font-size:11px;font-weight:600}
.logout-btn{display:block;text-align:center;margin-top:10px;color:var(--text2);font-size:12px;text-decoration:none;padding:6px;border-radius:7px;transition:all .15s}
.logout-btn:hover{background:#ef444420;color:var(--red)}

/* Main */
.main{margin-left:var(--sidebar-w);flex:1;padding:32px;max-width:1400px}

/* Header */
.page-header{margin-bottom:28px}
.page-title{font-size:26px;font-weight:800;color:#fff}
.page-sub{font-size:14px;color:var(--text2);margin-top:4px}

/* Cards grid */
.stats-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px;margin-bottom:28px}
.stat-card{
  background:var(--card);border:1px solid var(--border);border-radius:var(--radius);
  padding:20px;position:relative;overflow:hidden;transition:transform .2s,border-color .2s;
}
.stat-card:hover{transform:translateY(-2px);border-color:var(--border2)}
.stat-card::before{
  content:'';position:absolute;top:0;left:0;right:0;height:3px;
  background:linear-gradient(90deg,var(--glow-a,#7c3aed),var(--glow-b,#3b82f6));
}
.stat-label{font-size:11px;color:var(--text2);text-transform:uppercase;letter-spacing:.6px;font-weight:600;margin-bottom:10px}
.stat-value{font-size:30px;font-weight:800;color:#fff}
.stat-sub{font-size:12px;color:var(--text2);margin-top:6px}

/* Table */
.table-card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;margin-bottom:24px}
.table-head{padding:16px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.table-title{font-size:15px;font-weight:700;color:#fff}
table{width:100%;border-collapse:collapse}
th{padding:10px 16px;text-align:left;font-size:11px;color:var(--text2);text-transform:uppercase;letter-spacing:.5px;background:var(--card2);font-weight:600;border-bottom:1px solid var(--border)}
td{padding:11px 16px;font-size:13px;border-bottom:1px solid var(--border);color:var(--text)}
tr:last-child td{border-bottom:none}
tr:hover td{background:#ffffff03}

/* Badges */
.badge{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700}
.badge-green{background:#166534;color:#86efac}
.badge-red{background:#7f1d1d;color:#fca5a5}
.badge-yellow{background:#78350f;color:#fde68a}
.badge-blue{background:#1e3a5f;color:#93c5fd}
.badge-purple{background:#4c1d95;color:#c4b5fd}
.badge-gray{background:#1e1e2e;color:#6b6b8a}

/* Buttons */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:9px 18px;border-radius:9px;font-size:13px;font-weight:600;cursor:pointer;text-decoration:none;border:none;transition:all .18s;white-space:nowrap}
.btn-primary{background:linear-gradient(135deg,var(--accent),#6025cc);color:#fff;box-shadow:0 4px 15px var(--accent-glow)}
.btn-primary:hover{filter:brightness(1.15);transform:translateY(-1px)}
.btn-success{background:#166534;color:#86efac;border:1px solid #166534}
.btn-success:hover{background:#15803d}
.btn-danger{background:#7f1d1d;color:#fca5a5;border:1px solid #7f1d1d}
.btn-danger:hover{background:#991b1b}
.btn-ghost{background:transparent;color:var(--text2);border:1px solid var(--border2)}
.btn-ghost:hover{background:var(--card2);color:var(--text)}
.btn-sm{padding:5px 12px;font-size:12px;border-radius:7px}

/* Forms */
.form-group{margin-bottom:18px}
.form-group label{display:block;font-size:12px;color:var(--text2);font-weight:600;text-transform:uppercase;letter-spacing:.4px;margin-bottom:7px}
.form-control{
  width:100%;padding:10px 14px;
  background:var(--card2);border:1px solid var(--border2);
  border-radius:9px;color:var(--text);font-size:14px;outline:none;
  transition:border-color .18s,box-shadow .18s;
}
.form-control:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-glow)}
.form-control option{background:var(--card)}
.form-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px}

/* Alerts */
.alert{padding:13px 16px;border-radius:10px;margin-bottom:18px;font-size:13px;display:flex;align-items:center;gap:10px}
.alert-success{background:#166534;border:1px solid #22c55e40;color:#86efac}
.alert-error{background:#7f1d1d;border:1px solid #ef444440;color:#fca5a5}
.alert-info{background:#1e3a5f;border:1px solid #3b82f640;color:#93c5fd}

/* Search */
.search-row{display:flex;gap:10px;margin-bottom:18px;flex-wrap:wrap}
.search-row .form-control{max-width:280px}

/* Produto cards (loja) */
.produtos-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px;margin-bottom:24px}
.produto-card{
  background:var(--card);border:1px solid var(--border);border-radius:var(--radius);
  overflow:hidden;transition:transform .2s,border-color .2s;
}
.produto-card:hover{transform:translateY(-3px);border-color:var(--accent)40}
.produto-img{width:100%;height:140px;object-fit:cover;background:var(--card2);display:flex;align-items:center;justify-content:center;font-size:40px}
.produto-img img{width:100%;height:100%;object-fit:cover}
.produto-body{padding:14px}
.produto-nome{font-size:14px;font-weight:700;margin-bottom:6px;color:#fff}
.produto-preco{font-size:18px;font-weight:800;color:var(--accent2);margin-bottom:10px}
.produto-desc{font-size:12px;color:var(--text2);margin-bottom:12px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}

/* Paginação */
.pagination{display:flex;gap:8px;align-items:center;margin-top:16px}
.pagination a,.pagination span{padding:6px 14px;border-radius:8px;font-size:13px;text-decoration:none}
.pagination a{background:var(--card2);color:var(--text);border:1px solid var(--border2)}
.pagination a:hover{background:var(--accent);color:#fff}
.pagination .current{background:var(--accent);color:#fff;font-weight:700}

/* Responsive */
@media(max-width:900px){
  :root{--sidebar-w:64px}
  .sidebar-logo .brand,.sidebar-logo .sub,.nav-item span,.user-info{display:none}
  .nav-item{padding:12px;justify-content:center}
  .main{padding:20px}
}
</style>`;

function layout(user, title, body, activePage = '') {
  const { podeVer } = require('./db');
  const cargo = user?.cargo || 'cliente';
  const ci    = CARGO_LABELS[cargo] || CARGO_LABELS.cliente;

  const navItems = Object.entries(ABAS_INFO)
    .filter(([aba]) => podeVer(cargo, aba))
    .map(([aba, info]) => `
      <a href="/painel/${aba === 'overview' ? '' : aba}" class="nav-item${activePage === aba ? ' active' : ''}">
        <span class="icon">${info.icon}</span>
        <span>${info.label}</span>
      </a>
    `).join('');

  const inicial = (user?.username || 'U')[0].toUpperCase();

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — MrStore</title>
${CSS}
</head>
<body>
<div class="layout">
  <aside class="sidebar">
    <div class="sidebar-logo">
      <div class="brand">MrStore</div>
      <div class="sub">Painel de Controle</div>
    </div>
    <nav class="sidebar-nav">
      ${navItems}
    </nav>
    <div class="sidebar-footer">
      <div class="user-card">
        <div class="user-avatar">${inicial}</div>
        <div class="user-info">
          <div class="user-name">${user?.username || 'Usuário'}</div>
          <div class="user-cargo" style="color:${ci.color}">${ci.icon} ${ci.label}</div>
        </div>
      </div>
      <a href="/painel/logout" class="logout-btn">🚪 Sair da conta</a>
    </div>
  </aside>
  <main class="main">
    <div class="page-header">
      <div class="page-title">${title}</div>
    </div>
    ${body}
  </main>
</div>
</body>
</html>`;
}

function loginLayout(title, body) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — MrStore</title>
${CSS}
<style>
.auth-bg{
  min-height:100vh;display:grid;place-items:center;
  background:radial-gradient(ellipse at 20% 50%,#7c3aed15 0%,transparent 50%),
             radial-gradient(ellipse at 80% 20%,#3b82f615 0%,transparent 50%),
             var(--bg);
}
.auth-card{
  background:var(--card);border:1px solid var(--border2);border-radius:20px;
  padding:44px;width:min(440px,95vw);
  box-shadow:0 25px 60px #00000060,0 0 60px var(--accent-glow);
}
.auth-logo{text-align:center;margin-bottom:32px}
.auth-logo .brand{
  font-size:32px;font-weight:900;
  background:linear-gradient(135deg,#a855f7,#3b82f6);
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;
  background-clip:text;
}
.auth-logo .sub{font-size:13px;color:var(--text2);margin-top:4px}
.auth-title{font-size:20px;font-weight:700;margin-bottom:6px;color:#fff}
.auth-sub{font-size:13px;color:var(--text2);margin-bottom:24px}
.auth-switch{text-align:center;margin-top:20px;font-size:13px;color:var(--text2)}
.auth-switch a{color:var(--accent2);text-decoration:none;font-weight:600}
.auth-switch a:hover{text-decoration:underline}
</style>
</head>
<body>
<div class="auth-bg">
  <div class="auth-card">
    <div class="auth-logo">
      <div class="brand">MrStore</div>
      <div class="sub">Painel de Controle</div>
    </div>
    ${body}
  </div>
</div>
</body>
</html>`;
}

function badge(status) {
  const map = {
    pago:'badge-green',entregue:'badge-green',pendente:'badge-yellow',
    cancelado:'badge-red',aberto:'badge-blue',open:'badge-blue',
    fechado:'badge-gray',closed:'badge-gray',ativo:'badge-green',
    aprovado:'badge-green',recusado:'badge-red',cliente:'badge-blue',
    staff:'badge-green',resp_staff:'badge-purple',sub_dono:'badge-yellow',
    dono:'badge-red',
  };
  const cls = map[status] || 'badge-gray';
  return `<span class="badge ${cls}">${status}</span>`;
}

function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleString('pt-BR', { timeZone:'America/Sao_Paulo', day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
}

function fmtMoeda(v) { return `R$ ${Number(v||0).toFixed(2)}`; }

function pagination(page, total, limit, base) {
  const pages = Math.ceil(total / limit);
  if (pages <= 1) return '';
  let html = `<div class="pagination">`;
  if (page > 1) html += `<a href="${base}${base.includes('?')?'&':'?'}page=${page-1}">← Anterior</a>`;
  html += `<span class="current">Página ${page} de ${pages}</span>`;
  if (page < pages) html += `<a href="${base}${base.includes('?')?'&':'?'}page=${page+1}">Próxima →</a>`;
  html += `</div>`;
  return html;
}

module.exports = { layout, loginLayout, badge, fmtDate, fmtMoeda, pagination, CARGO_LABELS, ABAS_INFO };
