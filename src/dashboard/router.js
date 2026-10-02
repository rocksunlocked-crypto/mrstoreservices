/**
 * dashboard/router.js — Roteador principal do painel web MrStore
 * Rota base: /painel
 */
const express = require('express');
const router  = express.Router();
const auth    = require('./auth');
const dashDb  = require('./db');
const { layout, loginLayout, badge, fmtDate, fmtMoeda, pagination, CARGO_LABELS, ABAS_INFO } = require('./layout');

// ─── Helpers ────────────────────────────────────────────────
const GUILD_INVITE = process.env.DISCORD_INVITE || 'https://discord.com/invite';
const CARGOS       = ['cliente','revendedor','staff','resp_staff','sub_dono','dono'];

function getMainDb() { return require('../database/database'); }
function alert(type, msg) { return `<div class="alert alert-${type}">${msg}</div>`; }

// ─── LOGIN ───────────────────────────────────────────────────
router.get('/login', (req, res) => {
  const user = auth.getSessao(auth.getToken(req), dashDb.getIp(req));
  if (user && !user.__ipBloqueado) return res.redirect('/painel');
  const err = req.query.err || '';
  const msgs = {
    wrong: '❌ Usuário ou senha incorretos.',
    pending: '⏳ Sua conta aguarda aprovação do administrador.',
    ip: '🔒 Acesso bloqueado: seu IP mudou. Fale com o administrador para resetar.',
    banned: '⛔ Conta desativada.',
    noserver: '⚠️ Você precisa estar no servidor Discord para acessar o painel.',
  };
  res.send(loginLayout('Entrar', `
    <div class="auth-title">Bem-vindo de volta</div>
    <div class="auth-sub">Entre com sua conta do painel</div>
    ${err ? alert('error', msgs[err] || err) : ''}
    <form method="POST" action="/painel/login">
      <div class="form-group"><label>Usuário</label><input class="form-control" name="username" required autofocus></div>
      <div class="form-group"><label>Senha</label><input class="form-control" type="password" name="password" required></div>
      <button class="btn btn-primary" style="width:100%;margin-top:4px" type="submit">Entrar</button>
    </form>
    <div class="auth-switch">Não tem conta? <a href="/painel/cadastro">Cadastre-se</a></div>
  `));
});

router.post('/login', express.urlencoded({ extended: false }), async (req, res) => {
  const { username, password } = req.body;
  const ip   = dashDb.getIp(req);
  const user = dashDb.getUsuarioByUsername(username?.trim());

  if (!user || user.password !== auth.hashPass(password))
    return res.redirect('/painel/login?err=wrong');
  if (!user.aprovado)
    return res.redirect('/painel/login?err=pending');

  // Verificar se está no servidor Discord
  if (user.discord_id && user.discord_id !== '0') {
    try {
      const clientRef = require('../utils/clientRef');
      const client    = clientRef.getClient();
      if (client) {
        const guild  = client.guilds.cache.first();
        const member = guild ? await guild.members.fetch(user.discord_id).catch(() => null) : null;
        if (!member) return res.redirect(`/painel/login?err=noserver`);
      }
    } catch {}
  }

  // IP lock para cargos staff+
  if (dashDb.precisaIpLock(user.cargo)) {
    const ipSalvo = dashDb.getIpBloqueado(user.id);
    if (!ipSalvo) {
      // Primeiro login — registrar IP
      dashDb.definirIpBloqueado(user.id, ip);
    } else if (ipSalvo !== ip) {
      return res.redirect('/painel/login?err=ip');
    }
  }

  dashDb.atualizarAcesso(user.id);
  const token = auth.criarSessao(user.id, ip);
  res.setHeader('Set-Cookie', `dash_sess=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${86400 * 7}`);

  // Redirecionar para a primeira aba que o cargo tem acesso
  const ABAS_ORDEM = ['overview','loja','solicitar','solicitacoes','usuarios','produtos','pedidos','tickets','cupons','gerenciar'];
  let destino = '/painel/loja'; // fallback
  for (const aba of ABAS_ORDEM) {
    if (dashDb.podeVer(user.cargo, aba)) {
      destino = aba === 'overview' ? '/painel' : `/painel/${aba}`;
      break;
    }
  }
  res.redirect(destino);
});

// ─── CADASTRO ────────────────────────────────────────────────
router.get('/cadastro', (req, res) => {
  const err = req.query.err || '';
  const ref = req.query.ref || '';
  const msgs = {
    exists: '❌ Usuário ou Discord ID já cadastrado.',
    invalid: '❌ Preencha todos os campos corretamente.',
    discord: '❌ ID do Discord inválido (deve ser um número).',
    noserver: '⚠️ Você precisa estar no servidor Discord para se cadastrar. <a href="' + GUILD_INVITE + '" style="color:#a855f7">Entrar no servidor</a>',
  };
  res.send(loginLayout('Cadastro', `
    <div class="auth-title">Criar conta</div>
    <div class="auth-sub">Preencha os dados para solicitar acesso</div>
    ${ref === 'compra' ? `<div class="alert alert-info" style="margin-bottom:16px">🛒 Para comprar, crie sua conta e vincule com seu ID do Discord.<br><span style="font-size:12px;color:#7070a0">Com conta vinculada você acessa seu histórico de compras, produtos anteriores e saldo gasto.</span></div>` : ''}
    ${err ? alert('error', msgs[err] || err) : ''}
    <form method="POST" action="/painel/cadastro">
      <div class="form-group"><label>Usuário</label><input class="form-control" name="username" required autofocus minlength="3" maxlength="30"></div>
      <div class="form-group"><label>Senha</label><input class="form-control" type="password" name="password" required minlength="6"></div>
      <div class="form-group"><label>ID do Discord <span style="color:#7878a0;font-weight:400;text-transform:none">(Modo Desenvolvedor → copiar ID)</span></label><input class="form-control" name="discord_id" required pattern="[0-9]+" placeholder="Ex: 123456789012345678"></div>
      <button class="btn btn-primary" style="width:100%;margin-top:4px" type="submit">Criar Conta</button>
    </form>
    <div class="auth-switch">Já tem conta? <a href="/painel/login">Entrar</a></div>
  `));
});

router.post('/cadastro', express.urlencoded({ extended: false }), async (req, res) => {
  const { username, password, discord_id } = req.body;
  if (!username?.trim() || !password || !discord_id?.trim())
    return res.redirect('/painel/cadastro?err=invalid');
  // Verificar se o ID Discord é um snowflake válido (17-19 dígitos)
  if (!/^\d{17,19}$/.test(discord_id.trim()))
    return res.redirect('/painel/cadastro?err=discord');

  // Verificar se está no servidor — obrigatório
  try {
    const clientRef = require('../utils/clientRef');
    const client    = clientRef.getClient();
    if (client) {
      const guild  = client.guilds.cache.first();
      const member = guild ? await guild.members.fetch(discord_id.trim()).catch(() => null) : null;
      if (!member) return res.redirect('/painel/cadastro?err=noserver');
    }
  } catch {}

  const existe = dashDb.getUsuarioByUsername(username.trim()) || dashDb.getUsuarioByDiscord(discord_id.trim());
  if (existe) return res.redirect('/painel/cadastro?err=exists');

  const { db } = getMainDb();
  db.prepare('INSERT INTO dash_usuarios (username, password, discord_id, cargo, aprovado) VALUES (?,?,?,?,1)')
    .run(username.trim(), auth.hashPass(password), discord_id.trim(), 'cliente');

  // Auto-login após cadastro
  const novoUser = dashDb.getUsuarioByUsername(username.trim());
  const ip       = dashDb.getIp(req);
  const token    = auth.criarSessao(novoUser.id, ip);
  res.setHeader('Set-Cookie', `dash_sess=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${86400 * 7}`);
  // Clientes vão direto para a loja
  res.redirect('/painel/loja');
});

// ─── IP BLOQUEADO ────────────────────────────────────────────
router.get('/ip-bloqueado', (req, res) => {
  res.send(loginLayout('IP Bloqueado', `
    <div class="auth-title" style="color:#fca5a5">🔒 Acesso Bloqueado</div>
    <div class="auth-sub" style="margin-bottom:24px">Seu IP mudou. Por segurança, o acesso foi bloqueado.<br>Fale com o administrador para resetar seu IP.</div>
    <a href="/painel/login" class="btn btn-ghost" style="width:100%">← Voltar ao Login</a>
  `));
});

// ─── LOGOUT ──────────────────────────────────────────────────
router.get('/logout', (req, res) => {
  auth.deletarSessao(auth.getToken(req));
  res.setHeader('Set-Cookie', 'dash_sess=; Path=/; Max-Age=0');
  res.redirect('/painel/login');
});

// ─── VISÃO GERAL — redireciona para loja (não exige login) ──
router.get('/', (req, res) => {
  const user = auth.getSessao(auth.getToken(req), dashDb.getIp(req));
  if (user && !user.__ipBloqueado) {
    // Logado — vai para overview ou loja
    if (dashDb.podeVer(user.cargo, 'overview')) return res.redirect('/painel/overview');
    return res.redirect('/painel/loja');
  }
  // Não logado — vai direto para loja pública
  return res.redirect('/painel/loja');
});

// ─── VISÃO GERAL (overview) ───────────────────────────────────
router.get('/overview', auth.middlewareAba('overview'), (req, res) => {
  const { db } = getMainDb();
  const user   = req.dashUser;

  const totalVendas  = db.prepare("SELECT COALESCE(SUM(valor_total),0) as v FROM pedidos WHERE status IN ('pago','entregue')").get()?.v || 0;
  const vendasHoje   = db.prepare("SELECT COALESCE(SUM(valor_total),0) as v FROM pedidos WHERE status IN ('pago','entregue') AND pago_em >= strftime('%s','now','start of day')").get()?.v || 0;
  const pedPend      = db.prepare("SELECT COUNT(*) as c FROM pedidos WHERE status='pendente'").get()?.c || 0;
  const totalUsers   = db.prepare('SELECT COUNT(*) as c FROM usuarios').get()?.c || 0;
  const tickAbertos  = db.prepare("SELECT COUNT(*) as c FROM tickets WHERE status='aberto'").get()?.c || 0;
  const totalCoins   = db.prepare('SELECT COALESCE(SUM(coins),0) as v FROM usuarios').get()?.v || 0;
  const totalProd    = db.prepare('SELECT COUNT(*) as c FROM produtos WHERE ativo=1').get()?.c || 0;
  const pendentes    = dashDb.listarPendentes();

  const ultimasVendas = db.prepare(`
    SELECT p.*, pr.nome as produto_nome FROM pedidos p
    LEFT JOIN produtos pr ON p.produto_id = pr.id
    WHERE p.status IN ('pago','entregue')
    ORDER BY p.pago_em DESC LIMIT 8
  `).all();

  const body = `
    <div class="stats-grid">
      <div class="stat-card" style="--glow-a:#22c55e;--glow-b:#16a34a">
        <div class="stat-label">Faturamento Total</div>
        <div class="stat-value" style="color:#86efac">${fmtMoeda(totalVendas)}</div>
        <div class="stat-sub">Todas as vendas concluídas</div>
      </div>
      <div class="stat-card" style="--glow-a:#f59e0b;--glow-b:#d97706">
        <div class="stat-label">Vendas Hoje</div>
        <div class="stat-value" style="color:#fde68a">${fmtMoeda(vendasHoje)}</div>
        <div class="stat-sub">${pedPend} pendente(s)</div>
      </div>
      <div class="stat-card" style="--glow-a:#3b82f6;--glow-b:#2563eb">
        <div class="stat-label">Usuários</div>
        <div class="stat-value" style="color:#93c5fd">${totalUsers}</div>
        <div class="stat-sub">${totalProd} produtos ativos</div>
      </div>
      <div class="stat-card" style="--glow-a:#a855f7;--glow-b:#7c3aed">
        <div class="stat-label">Tickets Abertos</div>
        <div class="stat-value" style="color:#c4b5fd">${tickAbertos}</div>
        <div class="stat-sub">🪙 ${Number(totalCoins).toLocaleString('pt-BR')} coins</div>
      </div>
    </div>

    ${pendentes.length > 0 ? `
    <div class="table-card" style="border-color:#f59e0b40">
      <div class="table-head">
        <span class="table-title">⏳ Cadastros Pendentes (${pendentes.length})</span>
      </div>
      <table>
        <tr><th>Usuário</th><th>Discord ID</th><th>Solicitado em</th><th>Ações</th></tr>
        ${pendentes.map(u => `<tr>
          <td><strong>${u.username}</strong></td>
          <td><code>${u.discord_id}</code></td>
          <td>${fmtDate(u.criado_em)}</td>
          <td style="display:flex;gap:6px">
            <form method="POST" action="/painel/gerenciar/usuarios/${u.id}/aprovar" style="display:inline">
              <button class="btn btn-sm btn-success" type="submit">✅ Aprovar</button>
            </form>
            <form method="POST" action="/painel/gerenciar/usuarios/${u.id}/recusar" style="display:inline">
              <button class="btn btn-sm btn-danger" type="submit">❌ Recusar</button>
            </form>
          </td>
        </tr>`).join('')}
      </table>
    </div>` : ''}

    <div class="table-card">
      <div class="table-head">
        <span class="table-title">🛒 Últimas Vendas</span>
        <a href="/painel/pedidos" class="btn btn-sm btn-ghost">Ver todas →</a>
      </div>
      <table>
        <tr><th>Pedido</th><th>Produto</th><th>Valor</th><th>Data</th><th>Status</th></tr>
        ${ultimasVendas.length ? ultimasVendas.map(p => `<tr>
          <td><code style="font-size:11px">${p.id.slice(0,8).toUpperCase()}</code></td>
          <td>${p.produto_nome || '—'}</td>
          <td style="color:#86efac;font-weight:700">${fmtMoeda(p.valor_total)}</td>
          <td>${fmtDate(p.pago_em)}</td>
          <td>${badge(p.status)}</td>
        </tr>`).join('') : '<tr><td colspan="5" style="text-align:center;color:#7878a0;padding:24px">Nenhuma venda ainda</td></tr>'}
      </table>
    </div>`;

  res.send(layout(user, '📊 Visão Geral', body, 'overview'));
});

// ─── LOJA ────────────────────────────────────────────────────
// Loja é pública — aceita visitantes não logados
router.get('/loja', (req, res, next) => {
  const user = auth.getSessao(auth.getToken(req), dashDb.getIp(req));
  if (user && !user.__ipBloqueado) { req.dashUser = user; return next(); }
  // Visitante — criar user temporário para renderização
  req.dashUser = { cargo: 'cliente', username: 'Visitante', discord_id: null, __visitante: true };
  next();
}, (req, res) => {
  const { db } = getMainDb();
  const user   = req.dashUser;
  const search = req.query.q   || '';
  let catFiltro = req.query.cat || '';
  const msg    = req.query.msg || '';

  // Ordem fixa das categorias
  const ORDEM_CATS = ['Loja Free Fire','Spoofer','Mod Menu FiveM','External','Combos','Contas FiveM','Loja Fluxo','Loja Extra'];

  // Buscar categorias disponíveis e ordenar conforme ORDEM_CATS
  const catsNoDb = db.prepare("SELECT DISTINCT categoria FROM produtos WHERE ativo=1 AND categoria IS NOT NULL").all().map(r => r.categoria).filter(Boolean);
  const categorias = [...ORDEM_CATS.filter(c => catsNoDb.includes(c)), ...catsNoDb.filter(c => !ORDEM_CATS.includes(c)).sort()];

  // Se não tiver filtro de categoria e não for busca, redireciona para a primeira categoria
  if (!catFiltro && !search && categorias.length > 0) {
    return res.redirect(`/painel/loja?cat=${encodeURIComponent(categorias[0])}`);
  }

  // Query com filtro de categoria e busca
  let whereParts = ['p.ativo=1'];
  // Admin+ podem ver produtos desativados com visual de fechado
  const isAdmin = ['sub_dono','dono'].includes(user.cargo);
  if (isAdmin) whereParts = ['1=1']; // mostra todos, ativos e inativos
  if (search)    whereParts.push(`p.nome LIKE '%${search.replace(/'/g,"''")}%'`);
  if (catFiltro) whereParts.push(`p.categoria='${catFiltro.replace(/'/g,"''")}'`);
  const where = 'WHERE ' + whereParts.join(' AND ');

  const prods = db.prepare(`
    SELECT p.*, COUNT(v.id) as variantes
    FROM produtos p
    LEFT JOIN variantes_produto v ON v.produto_id=p.id AND v.ativo=1
    ${where} GROUP BY p.id ORDER BY p.categoria ASC, p.nome ASC
  `).all();

  // Agrupar por categoria
  const grupos = {};
  for (const p of prods) {
    const cat = p.categoria || 'Geral';
    if (!grupos[cat]) grupos[cat] = [];
    grupos[cat].push(p);
  }

  function imgTag(url, nome) {
    if (!url) return '<div style="width:100%;height:150px;background:linear-gradient(135deg,#12122a,#1a1a35);display:flex;align-items:center;justify-content:center;font-size:48px">📦</div>';
    // Tenta URL direta primeiro. Se falhar, tenta proxy weserv. Se falhar de novo, mostra ícone.
    const proxy = `https://images.weserv.nl/?url=${encodeURIComponent(url)}&w=400&output=webp&maxage=1d`;
    const fallbackIcon = `<div style='width:100%;height:150px;background:linear-gradient(135deg,#12122a,#1a1a35);display:flex;align-items:center;justify-content:center;font-size:48px'>📦</div>`;
    return `<img src="${url}" alt="${nome}" loading="lazy" style="width:100%;height:150px;object-fit:cover"
      onerror="if(!this.dataset.tried){this.dataset.tried=1;this.src='${proxy.replace(/'/g,"\\'")}'}else{this.parentElement.innerHTML='${fallbackIcon.replace(/'/g,"\\'")}'}">`;
  }

  const catTabs = categorias.map(c =>
    `<a href="/painel/loja?cat=${encodeURIComponent(c)}&q=${encodeURIComponent(search)}" class="btn btn-sm ${catFiltro===c?'btn-primary':'btn-ghost'}">${c}</a>`
  ).join('');

  let lojaHtml = '';
  for (const [cat, catProds] of Object.entries(grupos)) {
    const cards = catProds.map(p => {
      const variantes = db.prepare('SELECT * FROM variantes_produto WHERE produto_id=? AND ativo=1 ORDER BY ordem ASC').all(p.id);
      const precoMin  = variantes.length ? Math.min(...variantes.map(v => v.preco)) : p.preco;
      const fechado   = !p.ativo;
      const toggleBtn = isAdmin ? `
        <form method="POST" action="/painel/produtos/${p.id}/toggle" style="margin-top:6px">
          <button class="btn btn-sm ${fechado?'btn-success':'btn-danger'}" type="submit" onclick="event.stopPropagation();return confirm('${fechado?'Reativar':'Desativar'} produto?')" style="width:100%;font-size:11px">
            ${fechado ? '🟢 Reativar' : '🔴 Desligar'}
          </button>
        </form>` : '';
      if (fechado) {
        return `<div class="produto-card" style="border-color:#ff445540;opacity:0.7;cursor:default;position:relative">
          <div style="position:absolute;top:10px;right:10px;background:#ff4455;color:#fff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;z-index:2">🔴 FECHADO</div>
          <div class="produto-img" style="filter:grayscale(0.6)">${imgTag(p.imagem_url, p.nome)}</div>
          <div class="produto-body">
            <div class="produto-nome" style="color:#7070a0">${p.nome}</div>
            <div class="produto-preco" style="color:#ff4455">${fmtMoeda(precoMin)}</div>
            <div class="produto-desc">${p.descricao || ''}</div>
            <button class="btn btn-danger" style="width:100%;font-size:12px;cursor:not-allowed;opacity:0.5" disabled>🚫 Indisponível</button>
            ${toggleBtn}
          </div>
        </div>`;
      }
      return `<div class="produto-card" onclick="window.location='/painel/loja/comprar/${p.id}'">
        <div class="produto-img">${imgTag(p.imagem_url, p.nome)}</div>
        <div class="produto-body">
          <div class="produto-nome">${p.nome}</div>
          <div class="produto-preco">${fmtMoeda(precoMin)}${variantes.length > 1 ? '<span style="font-size:11px;color:#7070a0"> em diante</span>' : ''}</div>
          <div class="produto-desc">${p.descricao || ''}</div>
          <a href="/painel/loja/comprar/${p.id}" class="btn btn-primary" style="width:100%;font-size:12px" onclick="event.stopPropagation()">🛒 Comprar</a>
          ${toggleBtn}
        </div>
      </div>`;
    }).join('');
    lojaHtml += `
      <div style="margin-bottom:32px">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
          <div style="height:2px;flex:0 0 24px;background:linear-gradient(90deg,#7c3aed,transparent)"></div>
          <span style="font-size:16px;font-weight:800;color:#fff;text-transform:uppercase;letter-spacing:1px">${cat}</span>
          <div style="height:2px;flex:1;background:linear-gradient(90deg,#7c3aed20,transparent)"></div>
        </div>
        <div class="produtos-grid">${cards}</div>
      </div>`;
  }

  const msgAlerts = {
    ok: alert('success', '✅ Pedido realizado! Acompanhe em Perfil.'),
    pixerr: alert('error', '❌ Erro ao gerar PIX. Tente novamente.'),
  };

  const body = `
    ${msgAlerts[msg] || ''}
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:20px">
      <form method="GET" style="display:flex;gap:8px">
        <input class="form-control" name="q" value="${search}" placeholder="Buscar produto..." style="max-width:280px">
        <input type="hidden" name="cat" value="${catFiltro}">
      </form>
      <div style="display:flex;gap:6px;flex-wrap:wrap">${catTabs}</div>
    </div>
    ${lojaHtml || '<div style="text-align:center;color:#7070a0;padding:64px;font-size:18px">📦 Nenhum produto disponível</div>'}`;

  res.send(layout(user, '🛍️ Loja', body, 'loja'));
});

router.get('/loja/comprar/:produtoId', (req, res, next) => {
  const user = auth.getSessao(auth.getToken(req), dashDb.getIp(req));
  if (user && !user.__ipBloqueado) { req.dashUser = user; return next(); }
  // Visitante tentando comprar — redirecionar para cadastro com aviso
  return res.redirect('/painel/cadastro?ref=compra');
}, auth.middlewareAba('loja'), (req, res) => {
  const { db } = getMainDb();
  const user   = req.dashUser;
  const prod   = db.prepare('SELECT * FROM produtos WHERE id=? AND ativo=1').get(req.params.produtoId);
  if (!prod) return res.redirect('/painel/loja');

  const dashDb   = require('./db');
  const isRevend = user.cargo === 'revendedor';

  const variantes = db.prepare('SELECT * FROM variantes_produto WHERE produto_id=? AND ativo=1 ORDER BY ordem ASC').all(prod.id);
  const varOptions = variantes.map(v => {
    const disp   = db.prepare('SELECT COUNT(*) as c FROM estoque_variante WHERE variante_id=? AND usado=0').get(v.id)?.c || 0;
    const precoR = isRevend ? dashDb.getPrecoRevendedor(prod.id, v.id) : null;
    const precoEx = precoR ? ` [Rev: ${fmtMoeda(precoR.preco)}]` : '';
    return `<option value="${v.id}" ${disp===0?'disabled':''}>${v.nome} — ${fmtMoeda(v.preco)}${precoEx} ${disp===0?'(sem estoque)':'('+disp+' disp.)'}</option>`;
  }).join('');

  // Badge preço revendedor (sem variante)
  let badgeRevend = '';
  if (isRevend && variantes.length === 0) {
    const precoR = dashDb.getPrecoRevendedor(prod.id, null);
    if (precoR) badgeRevend = `<div style="display:inline-flex;align-items:center;gap:8px;background:#f9731618;border:1px solid #f9731640;border-radius:8px;padding:8px 14px;margin-bottom:16px;font-size:13px"><span style="color:#f97316;font-weight:700">🏪 Preço Revendedor: ${fmtMoeda(precoR.preco)}</span> <span style="color:#7070a0;text-decoration:line-through">${fmtMoeda(prod.preco)}</span></div>`;
  }

  // Stripe disponível?
  const stripeOk = !!process.env.STRIPE_SECRET_KEY;

  // Todas as moedas do Stripe
  const TODAS_MOEDAS = stripeOk ? (() => {
    try { return require('../systems/stripe').MOEDAS || {}; } catch { return {}; }
  })() : {};

  const imgSrc = prod.imagem_url
    ? (prod.imagem_url.includes('cdn.discordapp.com/attachments')
        ? `https://images.weserv.nl/?url=${encodeURIComponent(prod.imagem_url)}&w=600&output=webp`
        : prod.imagem_url)
    : null;

  const body = `
    <a href="/painel/loja" class="btn btn-ghost btn-sm" style="margin-bottom:20px">← Voltar</a>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:28px;margin-top:16px">
      <div>
        ${imgSrc
          ? `<img src="${imgSrc}" style="width:100%;border-radius:14px;border:1px solid var(--border2)" onerror="this.style.display='none'">`
          : `<div style="width:100%;height:220px;background:linear-gradient(135deg,#12122a,#1a1a35);border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:64px">📦</div>`}
        <div style="margin-top:16px;padding:16px;background:var(--card2);border:1px solid var(--border);border-radius:12px">
          <div style="font-size:12px;color:#7070a0;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Categoria</div>
          <div style="font-weight:600">${prod.categoria || 'Geral'}</div>
        </div>
      </div>
      <div>
        <h2 style="font-size:24px;font-weight:900;margin-bottom:8px;background:linear-gradient(135deg,#fff,#c4b5fd);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">${prod.nome}</h2>
        <p style="color:#7070a0;margin-bottom:20px;line-height:1.6">${prod.descricao || ''}</p>
        ${badgeRevend}

        <!-- Formulário PIX (padrão) -->
        <form method="POST" action="/painel/loja/finalizar" id="form-pix">
          <input type="hidden" name="produto_id" value="${prod.id}">
          <input type="hidden" name="metodo_pag" value="pix">
          ${variantes.length ? `<div class="form-group"><label>Variante / Plano</label><select class="form-control" name="variante_id" id="var-pix" required>${varOptions}</select></div>` : ''}
          <div class="form-group">
            <label>Quantidade</label>
            <div style="display:flex;align-items:center;gap:10px">
              <button type="button" onclick="ajustarQtd(-1)" class="btn btn-ghost btn-sm" style="width:36px;height:36px;padding:0;font-size:18px">−</button>
              <input class="form-control" type="number" name="quantidade" id="inp-qtd" value="1" min="1" max="99" style="width:80px;text-align:center">
              <button type="button" onclick="ajustarQtd(1)" class="btn btn-ghost btn-sm" style="width:36px;height:36px;padding:0;font-size:18px">+</button>
            </div>
          </div>
          <div class="form-group">
            <label>Cupom (opcional)</label>
            <input class="form-control" name="cupom" id="cupom-pix" placeholder="Código do cupom">
          </div>
          <div style="display:grid;grid-template-columns:1fr ${stripeOk ? '1fr' : ''};gap:10px;margin-top:8px">
            <button class="btn btn-success" style="padding:12px;font-size:15px;font-weight:800" type="submit">💠 Pagar com PIX</button>
            ${stripeOk ? `<button type="button" onclick="abrirModalMoeda()" class="btn btn-primary" style="padding:12px;font-size:15px;font-weight:800">💳 Outra Moeda</button>` : ''}
          </div>
        </form>
      </div>
    </div>

    ${stripeOk ? `
    <!-- Modal de seleção de moeda -->
    <div id="modal-moeda" style="display:none;position:fixed;inset:0;z-index:9999;background:#00000090;backdrop-filter:blur(4px);align-items:center;justify-content:center">
      <div style="background:#0d0d20;border:1px solid #7c3aed40;border-radius:16px;padding:28px;width:min(520px,94vw);max-height:85vh;overflow-y:auto;box-shadow:0 24px 60px #00000080">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
          <div style="font-size:17px;font-weight:800;color:#fff">💳 Escolher Moeda</div>
          <button onclick="fecharModalMoeda()" style="background:none;border:none;color:#7070a0;font-size:22px;cursor:pointer">✕</button>
        </div>
        <input id="busca-moeda" oninput="filtrarMoedas()" class="form-control" placeholder="🔍 Pesquisar moeda..." style="margin-bottom:14px">
        <div id="lista-moedas" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px">
          ${Object.entries(TODAS_MOEDAS).map(([code, m]) => `
            <button onclick="selecionarMoeda('${code}')" data-nome="${m.nome.toLowerCase()} ${code.toLowerCase()}" class="btn btn-ghost moeda-btn" style="justify-content:flex-start;gap:10px;padding:10px 12px;font-size:13px;text-align:left">
              <span style="font-size:20px">${m.emoji}</span>
              <div>
                <div style="font-weight:700;color:#fff">${code}</div>
                <div style="font-size:11px;color:#7070a0">${m.nome}</div>
              </div>
            </button>
          `).join('')}
        </div>
      </div>
    </div>

    <!-- Formulário Stripe (submete ao escolher moeda) -->
    <form method="POST" action="/painel/loja/finalizar" id="form-stripe" style="display:none">
      <input type="hidden" name="produto_id" value="${prod.id}">
      <input type="hidden" name="metodo_pag" id="stripe-metodo" value="">
      <input type="hidden" name="variante_id" id="stripe-variante" value="">
      <input type="hidden" name="quantidade" id="stripe-qtd" value="1">
      <input type="hidden" name="cupom" id="stripe-cupom" value="">
    </form>` : ''}

    <script>
    function ajustarQtd(delta) {
      const inp = document.getElementById('inp-qtd');
      let v = parseInt(inp.value) + delta;
      inp.value = Math.max(1, Math.min(99, v));
    }
    function abrirModalMoeda() {
      document.getElementById('modal-moeda').style.display='flex';
      document.getElementById('busca-moeda').focus();
    }
    function fecharModalMoeda() {
      document.getElementById('modal-moeda').style.display='none';
    }
    function filtrarMoedas() {
      const q = document.getElementById('busca-moeda').value.toLowerCase();
      document.querySelectorAll('.moeda-btn').forEach(btn => {
        btn.style.display = btn.dataset.nome.includes(q) ? '' : 'none';
      });
    }
    function selecionarMoeda(code) {
      // Copiar dados do form PIX para o form Stripe
      const varEl = document.getElementById('var-pix');
      document.getElementById('stripe-metodo').value = 'stripe_' + code.toLowerCase();
      document.getElementById('stripe-variante').value = varEl ? varEl.value : '';
      document.getElementById('stripe-qtd').value = document.getElementById('inp-qtd').value;
      document.getElementById('stripe-cupom').value = document.getElementById('cupom-pix').value;
      fecharModalMoeda();
      document.getElementById('form-stripe').submit();
    }
    // Fechar modal clicando fora
    document.getElementById('modal-moeda')?.addEventListener('click', function(e) {
      if(e.target===this) fecharModalMoeda();
    });
    </script>`;

  res.send(layout(user, `🛍️ ${prod.nome}`, body, 'loja'));
});

router.post('/loja/finalizar', auth.middlewareAba('loja'), express.urlencoded({ extended: false }), async (req, res) => {
  const { produto_id, variante_id, cupom, metodo_pag, quantidade } = req.body;
  const user = req.dashUser;
  const { db, Usuarios, Pedidos, Cupons } = getMainDb();
  const qtd = Math.max(1, Math.min(99, parseInt(quantidade) || 1));

  try {
    Usuarios.garantir(user.discord_id, user.username);
    // Garantir que o discord_id está correto no banco
    const discordIdUser = user.discord_id && user.discord_id !== '0' ? user.discord_id : null;
    if (!discordIdUser) return res.redirect('/painel/loja?msg=pixerr');
    const variante = variante_id ? db.prepare('SELECT * FROM variantes_produto WHERE id=?').get(variante_id) : null;
    const produto  = db.prepare('SELECT * FROM produtos WHERE id=?').get(produto_id);
    if (!produto) return res.redirect('/painel/loja');
    if (!produto.ativo) return res.redirect('/painel/loja?msg=pixerr');

    let valor    = variante?.preco || produto.preco;
    // Aplicar preço revendedor se o usuário for revendedor
    if (user.cargo === 'revendedor') {
      const dashDb = require('./db');
      const precoR = dashDb.getPrecoRevendedor(produto_id, variante_id || null);
      if (precoR) valor = precoR.preco;
    }
    let desconto = 0;
    let cupomUsado = null;
    let cupomObj   = null;

    if (cupom?.trim()) {
      const valCupom = Cupons.validar(cupom.trim(), user.discord_id, valor);
      if (valCupom.valido) {
        desconto   = Cupons.calcDesconto(valCupom.cupom, valor);
        cupomUsado = valCupom.cupom.codigo;
        cupomObj   = valCupom.cupom;
      }
    }

    const isStripe = metodo_pag?.startsWith('stripe_');
    const moeda    = isStripe ? metodo_pag.replace('stripe_', '').toUpperCase() : 'BRL';
    const metodoDB = isStripe ? `stripe_${moeda.toLowerCase()}` : 'pix';

    const valorFinal = Math.max(0.01, (valor * qtd) - desconto);
    const notaFiscal = JSON.stringify({ varianteId: variante_id || null, via: 'dashboard', qtd });
    const pedidoId = Pedidos.criar({
      usuarioId: discordIdUser,
      produtoId: produto_id,
      quantidade: qtd,
      valorUnit:  valor,
      valorTotal: valorFinal,
      desconto,
      cupomUsado,
      metodoPag: metodoDB,
    });
    // Salvar nota_fiscal com varianteId para processarEntrega encontrar o estoque
    db.prepare("UPDATE pedidos SET nota_fiscal=? WHERE id=?").run(notaFiscal, pedidoId);

    if (cupomObj) Cupons.usar(cupomObj.id, user.discord_id, pedidoId);

    if (isStripe) {
      const stripe = require('../systems/stripe');
      const sess   = await stripe.criarCheckout({
        valorBrl:  valorFinal,
        descricao: `${produto.nome}${variante ? ' — ' + variante.nome : ''} | MrStore`,
        pedidoId,
        moeda,
        metodo:    'card',
      });
      db.prepare("UPDATE pedidos SET tx_id=? WHERE id=?").run(sess.sessionId, pedidoId);
      iniciarPollingPedidoDash(pedidoId, null, user, produto, variante_id, sess.sessionId);
      return res.redirect(sess.linkPagar);
    }

    // PIX EFI
    const efi  = require('../systems/efi');
    const cobr = await efi.criarCobrancaPix({
      valor:       valorFinal,
      descricao:   `${produto.nome} — MrStore`,
      pedidoId,
      nomeCliente: user.username,
    });
    const qr = await efi.gerarQRCode(cobr.locId);
    db.prepare("UPDATE pedidos SET tx_id=?, qr_code=? WHERE id=?").run(cobr.txid, qr.qrcode, pedidoId);
    iniciarPollingPedidoDash(pedidoId, cobr.txid, user, produto, variante_id, null);
    res.redirect(`/painel/loja/pagar/${pedidoId}`);
  } catch (e) {
    console.error('[Dashboard Loja]', e.message);
    res.redirect('/painel/loja?msg=pixerr');
  }
});

router.get('/loja/pagar/:pedidoId', auth.middlewareAba('loja'), (req, res) => {
  const { db } = getMainDb();
  const user   = req.dashUser;
  const pedido = db.prepare('SELECT p.*, pr.nome as produto_nome, pr.imagem_url as produto_img FROM pedidos p LEFT JOIN produtos pr ON p.produto_id=pr.id WHERE p.id=?').get(req.params.pedidoId);
  if (!pedido || pedido.usuario_id !== user.discord_id) return res.redirect('/painel/loja');

  const expiraPix = Math.floor(Date.now() / 1000) + 1800;

  const body = `
    <a href="/painel/loja" class="btn btn-ghost btn-sm" style="margin-bottom:20px">← Voltar à Loja</a>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;max-width:900px">
      <div class="stat-card" style="--glow-a:7c3aed;--glow-b:3b82f6;text-align:center">
        <div style="font-size:13px;color:#7878a0;margin-bottom:16px">📱 Escaneie o QR Code ou copie o Pix</div>
        <div id="qr-status" style="margin-bottom:16px">
          <div style="display:inline-flex;align-items:center;gap:8px;background:#78350f;color:#fde68a;padding:8px 16px;border-radius:8px;font-size:13px;font-weight:600">
            ⏳ Aguardando pagamento... <span id="expira-counter"></span>
          </div>
        </div>
        <div style="background:#fff;border-radius:12px;padding:12px;display:inline-block;margin-bottom:16px">
          <img id="qr-img" src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(pedido.qr_code || '')}" style="width:200px;height:200px;display:block">
        </div>
        <div style="background:var(--card2);border:1px solid var(--border2);border-radius:8px;padding:10px;margin-bottom:14px;font-size:11px;color:#7878a0;word-break:break-all">${pedido.qr_code || 'QR Code não disponível'}</div>
        <button onclick="copiarPix()" class="btn btn-primary" style="width:100%">📋 Copiar Pix Copia e Cola</button>
        <div id="copy-ok" style="display:none;color:#00ff88;font-size:12px;margin-top:8px">✅ Copiado!</div>
        <a id="ticket-btn" href="https://discord.gg/eTDSq9Hhth" target="_blank" rel="noopener"
           class="btn btn-ghost" style="width:100%;margin-top:10px;display:none;border-color:#7c3aed50">
          🎫 Abrir Ticket no Discord
        </a>
      </div>
      <div>
        <div class="stat-card" style="--glow-a:22c55e;--glow-b:16a34a;margin-bottom:16px">
          <div class="stat-label">Resumo do Pedido</div>
          <div style="display:flex;align-items:center;gap:12px;margin-top:10px">
            ${pedido.produto_img ? `<img src="${pedido.produto_img}" style="width:56px;height:56px;border-radius:8px;object-fit:cover">` : '<div style="width:56px;height:56px;background:var(--card2);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:24px">📦</div>'}
            <div>
              <div style="font-weight:700;color:#fff">${pedido.produto_nome}</div>
              <div style="font-size:22px;font-weight:800;color:#86efac">R$ ${Number(pedido.valor_total).toFixed(2)}</div>
            </div>
          </div>
          <div style="margin-top:14px;font-size:12px;color:#7878a0">
            <div>🆔 Pedido: <code>${pedido.id.slice(0,8).toUpperCase()}</code></div>
            <div style="margin-top:4px">⏰ Expira em: <span id="expira-txt">${new Date(expiraPix*1000).toLocaleTimeString('pt-BR')}</span></div>
          </div>
        </div>
        <div class="stat-card" style="--glow-a:3b82f6;--glow-b:2563eb">
          <div class="stat-label">Status do Pagamento</div>
          <div id="status-box" style="margin-top:10px;display:flex;align-items:center;gap:10px">
            <div style="width:12px;height:12px;border-radius:50%;background:#f59e0b;animation:pulse 1.5s infinite"></div>
            <span id="status-txt" style="color:#fde68a;font-weight:600">Aguardando pagamento...</span>
          </div>
          <div style="margin-top:14px;font-size:12px;color:#7878a0">O produto será entregue automaticamente após a confirmação do PIX.</div>
        </div>
        <button onclick="verificarManual()" class="btn btn-ghost" style="width:100%;margin-top:12px">🔍 Verificar pagamento manualmente</button>
        <div id="conteudo-entregue" style="display:none;margin-top:16px">
          <div style="background:#00ff8808;border:1px solid #00ff8830;border-radius:10px;padding:16px">
            <div style="font-size:12px;color:#00ff88;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">📦 Produto Entregue</div>
            <pre id="conteudo-texto" style="background:#0a0a1e;border:1px solid #00ff8820;border-radius:8px;padding:12px;font-size:13px;color:#e8e8ff;white-space:pre-wrap;word-break:break-all;max-height:200px;overflow-y:auto"></pre>
            <button onclick="copiarConteudo()" class="btn btn-success" style="width:100%;margin-top:10px">📋 Copiar Produto</button>
          </div>
        </div>
      </div>
    </div>
    <style>
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
    </style>
    <script>
    const pedidoId = '${pedido.id}';
    const pixCode  = ${JSON.stringify(pedido.qr_code || '')};
    let pago = false;

    function copiarPix() {
      navigator.clipboard.writeText(pixCode).then(() => {
        document.getElementById('copy-ok').style.display = 'block';
        setTimeout(() => document.getElementById('copy-ok').style.display = 'none', 2000);
      });
    }

    function copiarConteudo() {
      const txt = document.getElementById('conteudo-texto')?.textContent || '';
      navigator.clipboard.writeText(txt).then(() => alert('✅ Produto copiado!'));
    }

    async function verificarStatus() {
      if (pago) return;
      try {
        const r = await fetch('/painel/loja/status/' + pedidoId);
        const d = await r.json();
        if (d.pago) {
          pago = true;
          document.getElementById('status-box').innerHTML = '<div style="width:12px;height:12px;border-radius:50%;background:#00ff88"></div><span style="color:#00ff88;font-weight:600">✅ Pagamento confirmado!</span>';
          document.getElementById('qr-status').innerHTML = '<div style="display:inline-flex;align-items:center;gap:8px;background:#00ff8810;border:1px solid #00ff8830;color:#00ff88;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600">✅ Pagamento confirmado!</div>';
          // Mostrar conteúdo entregue no site
          if (d.conteudo) {
            document.getElementById('conteudo-entregue').style.display = 'block';
            document.getElementById('conteudo-texto').textContent = d.conteudo;
          }
          // Mostrar botão de ticket
          document.getElementById('ticket-btn').style.display = 'flex';
          setTimeout(() => window.location.href = '/painel/perfil', 8000);
        }
      } catch {}
    }

    function verificarManual() { verificarStatus(); }

    // Polling a cada 5 segundos na página
    setInterval(verificarStatus, 5000);
    verificarStatus();
    </script>`;

  res.send(layout(user, '💳 Pagamento PIX', body, 'loja'));
});

// Endpoint de status do pedido (polling do front)
router.get('/loja/status/:pedidoId', auth.requireAuth, async (req, res) => {
  const { db } = getMainDb();
  const row = db.prepare('SELECT status, tx_id, conteudo_entregue FROM pedidos WHERE id=?').get(req.params.pedidoId);
  if (!row) return res.json({ pago: false });
  const pago = ['pago','entregue'].includes(row.status);

  if (pago) {
    // Retornar conteúdo entregue para exibir no site
    return res.json({ pago: true, conteudo: row.conteudo_entregue || null });
  }

  // Se não pago, consultar EFI
  if (row.tx_id) {
    try {
      const efi    = require('../systems/efi');
      const status = await efi.consultarCobranca(row.tx_id);
      if (status.pago) {
        await confirmarPedidoDash(req.params.pedidoId, db);
        const atualizado = db.prepare('SELECT conteudo_entregue FROM pedidos WHERE id=?').get(req.params.pedidoId);
        return res.json({ pago: true, conteudo: atualizado?.conteudo_entregue || null });
      }
    } catch {}
  }
  res.json({ pago: false });
});

// Helper: confirmar pagamento e entregar produto
async function confirmarPedidoDash(pedidoId, dbIn) {
  const { db, Pedidos, Usuarios, Produtos } = getMainDb();
  try {
    const pedido = db.prepare('SELECT * FROM pedidos WHERE id=?').get(pedidoId);
    if (!pedido || pedido.status !== 'pendente') return;

    db.prepare("UPDATE pedidos SET status='pago', pago_em=strftime('%s','now') WHERE id=?").run(pedidoId);

    const produto = Produtos.get(pedido.produto_id);
    if (!produto) return;

    let conteudo = null;
    const qtd     = Math.max(1, parseInt(pedido.quantidade) || 1);

    // Tentar pegar varianteId da nota_fiscal
    let varianteId = null;
    try { varianteId = pedido.nota_fiscal ? JSON.parse(pedido.nota_fiscal)?.varianteId : null; } catch {}

    // Se não tem varianteId, pegar a primeira variante ativa do produto
    if (!varianteId) {
      const v = db.prepare('SELECT id FROM variantes_produto WHERE produto_id=? AND ativo=1 ORDER BY ordem ASC LIMIT 1').get(pedido.produto_id);
      if (v) varianteId = v.id;
    }

    if (produto.tipo === 'digital') {
      if (varianteId) {
        // Estoque por variante
        const itens = [];
        for (let i = 0; i < qtd; i++) {
          const item = db.prepare('SELECT * FROM estoque_variante WHERE variante_id=? AND usado=0 LIMIT 1').get(varianteId);
          if (item) {
            db.prepare("UPDATE estoque_variante SET usado=1, usado_por=?, pedido_id=?, usado_em=strftime('%s','now') WHERE id=?").run(pedido.usuario_id, pedidoId, item.id);
            itens.push(item.conteudo);
          } else break;
        }
        conteudo = itens.length > 0 ? itens.join('\n---\n') : null;
      }
      if (!conteudo) {
        // Fallback: estoque digital global
        const itens = [];
        for (let i = 0; i < qtd; i++) {
          const item = db.prepare('SELECT * FROM estoque_digital WHERE produto_id=? AND usado=0 LIMIT 1').get(pedido.produto_id);
          if (item) {
            db.prepare("UPDATE estoque_digital SET usado=1, usado_por=?, pedido_id=?, usado_em=strftime('%s','now') WHERE id=?").run(pedido.usuario_id, pedidoId, item.id);
            itens.push(item.conteudo);
          } else break;
        }
        conteudo = itens.length > 0 ? itens.join('\n---\n') : '⚠️ Sem estoque — equipe entrará em contato.';
      }
    } else {
      conteudo = 'Produto físico — entrega combinada via suporte.';
    }

    // Salvar conteúdo entregue no pedido
    db.prepare("UPDATE pedidos SET status='entregue', conteudo_entregue=?, entregue_em=strftime('%s','now') WHERE id=?").run(conteudo, pedidoId);
    db.prepare('UPDATE produtos SET vendas=vendas+? WHERE id=?').run(qtd, pedido.produto_id);

    // Atualizar stats do usuário
    const u = Usuarios.get(pedido.usuario_id);
    if (u) {
      Usuarios.atualizar(pedido.usuario_id, {
        total_gasto:   (u.total_gasto   || 0) + pedido.valor_total,
        total_compras: (u.total_compras || 0) + 1,
      });
      Usuarios.addPontos(pedido.usuario_id, Math.floor(pedido.valor_total));
    }

    // Enviar DM e log no Discord
    const clientRef = require('../utils/clientRef');
    const client    = clientRef.getClient();
    console.log(`[DashDM] client=${!!client} usuario_id=${pedido.usuario_id}`);
    if (client && pedido.usuario_id && pedido.usuario_id !== '0') {
      // DM para o usuário — busca no guild principal primeiro, depois tenta direto
      try {
        const GUILD_PRINCIPAL = process.env.GUILD_ID || '1522456699082903572';
        const guild  = client.guilds.cache.get(GUILD_PRINCIPAL) || client.guilds.cache.first();
        console.log(`[DashDM] guild=${guild?.id} name=${guild?.name}`);
        let discordUser = null;
        if (guild) {
          const member = await guild.members.fetch(pedido.usuario_id).catch(e => { console.warn('[DashDM] fetch member error:', e.message); return null; });
          discordUser = member?.user || null;
          console.log(`[DashDM] member=${!!member} discordUser=${!!discordUser}`);
        }
        if (!discordUser) {
          discordUser = await client.users.fetch(pedido.usuario_id).catch(e => { console.warn('[DashDM] fetch user error:', e.message); return null; });
          console.log(`[DashDM] fallback fetch user=${!!discordUser}`);
        }
        if (discordUser) {
          const { EmbedBuilder } = require('discord.js');
          const embed = new EmbedBuilder()
            .setColor(0x00ff88)
            .setTitle('✅ Produto Entregue!')
            .setDescription(
              `Sua compra foi confirmada!\n\n` +
              `**Produto:** ${produto.nome}\n` +
              `**Valor:** R$ ${Number(pedido.valor_total).toFixed(2)}\n\n` +
              `> 📋 Você também pode ver este produto na aba **Perfil** do site.`
            )
            .addFields({ name: '📦 Conteúdo', value: `\`\`\`${conteudo.slice(0, 1000)}\`\`\`` })
            .setTimestamp()
            .setFooter({ text: 'MrStore • Obrigado pela compra! 🛍️' });
          await discordUser.send({ embeds: [embed] }).catch(e => console.warn('[DashDM] DMs fechadas:', e.message));
        }
      } catch (e) { console.error('[DashDM]', e.message); }
    }

    // Log de vendas — chamado sempre, independente do discord_id
    const clientRefLog = require('../utils/clientRef');
    const clientLog    = clientRefLog.getClient();
    if (clientLog) {
      try {
        const { logVenda } = require('../utils/canalVendas');
        const pedidoFinal  = db.prepare('SELECT * FROM pedidos WHERE id=?').get(pedidoId);
        await logVenda(clientLog, pedidoFinal, { vendidoPorCustom: '🌐 Site (dashboard)' });
        console.log('[Dashboard] Log de venda enviado para canal', pedidoFinal?.id?.slice(0,8));
      } catch (e) { console.error('[DashLogVenda]', e.message); }
    } else {
      console.warn('[Dashboard] client null — log de venda não enviado');
    }

  } catch (e) { console.error('[Dashboard confirmarPedido]', e.message); }
}

// Polling automático no servidor (30 min)
function iniciarPollingPedidoDash(pedidoId, txid, user, produto, varianteId, stripeSessionId) {
  const { db } = getMainDb();
  let tentativas = 0;
  const timer = setInterval(async () => {
    tentativas++;
    try {
      let pago = false;
      if (txid) {
        // PIX EFI
        const efi    = require('../systems/efi');
        const status = await efi.consultarCobranca(txid);
        pago = status.pago;
      } else if (stripeSessionId) {
        // Stripe
        const stripe = require('../systems/stripe');
        const sess   = await stripe.consultarSessao(stripeSessionId);
        pago = sess?.payment_status === 'paid';
      }
      if (pago) {
        clearInterval(timer);
        await confirmarPedidoDash(pedidoId, db);
      }
    } catch {}
    if (tentativas >= 36) clearInterval(timer);
  }, 50_000);
}

// ─── SOLICITAR ITEM (staff+) ─────────────────────────────────
router.get('/solicitar', auth.middlewareAba('solicitar'), (req, res) => {
  const { db } = getMainDb();
  const user   = req.dashUser;
  const msg    = req.query.msg || '';

  const prods = db.prepare('SELECT * FROM produtos WHERE ativo=1 ORDER BY nome ASC').all();
  const minhasSols = dashDb.listarSolicitacoes().filter(s => s.usuario_id === user.id).slice(0, 10);

  const body = `
    ${msg === 'ok' ? alert('success', '✅ Solicitação enviada!') : ''}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px">
      <div>
        <div class="table-card">
          <div class="table-head"><span class="table-title">📋 Nova Solicitação</span></div>
          <div style="padding:20px">
            <form method="POST" action="/painel/solicitar">
              <div class="form-group">
                <label>Produto</label>
                <select class="form-control" name="produto_id" id="sel-prod" required onchange="carregarVariantes(this.value)">
                  <option value="">Selecione...</option>
                  ${prods.map(p => `<option value="${p.id}">${p.nome}</option>`).join('')}
                </select>
              </div>
              <div class="form-group" id="grp-variante" style="display:none">
                <label>Variante</label>
                <select class="form-control" name="variante_id" id="sel-var"></select>
              </div>
              <div class="form-group">
                <label>Quantidade</label>
                <input class="form-control" type="number" name="quantidade" value="1" min="1" max="100">
              </div>
              <div class="form-group">
                <label>Observação</label>
                <textarea class="form-control" name="observacao" rows="3" placeholder="Motivo, destino, etc..."></textarea>
              </div>
              <button class="btn btn-primary" style="width:100%" type="submit">Enviar Solicitação</button>
            </form>
          </div>
        </div>
      </div>
      <div>
        <div class="table-card">
          <div class="table-head"><span class="table-title">Minhas Solicitações</span></div>
          <table>
            <tr><th>Produto</th><th>Qtd</th><th>Status</th><th>Data</th></tr>
            ${minhasSols.length ? minhasSols.map(s => {
              const p = db.prepare('SELECT nome FROM produtos WHERE id=?').get(s.produto_id);
              return `<tr>
                <td>${p?.nome || '—'}</td>
                <td>${s.quantidade}</td>
                <td>${badge(s.status)}</td>
                <td>${fmtDate(s.criado_em)}</td>
              </tr>`;
            }).join('') : '<tr><td colspan="4" style="text-align:center;color:#7878a0;padding:20px">Nenhuma</td></tr>'}
          </table>
        </div>
      </div>
    </div>
    <script>
    const varData = {};
    ${prods.map(p => {
      const vars = require('../database/database').db.prepare('SELECT id,nome,preco FROM variantes_produto WHERE produto_id=? AND ativo=1').all(p.id);
      return `varData['${p.id}'] = ${JSON.stringify(vars)};`;
    }).join('')}
    function carregarVariantes(pid) {
      const grp = document.getElementById('grp-variante');
      const sel = document.getElementById('sel-var');
      const vars = varData[pid] || [];
      if (!vars.length) { grp.style.display='none'; return; }
      sel.innerHTML = vars.map(v => '<option value="'+v.id+'">'+v.nome+' — R$ '+Number(v.preco).toFixed(2)+'</option>').join('');
      grp.style.display = 'block';
    }
    </script>`;

  res.send(layout(user, '📋 Solicitar Item', body, 'solicitar'));
});

router.post('/solicitar', auth.middlewareAba('solicitar'), express.urlencoded({ extended: false }), (req, res) => {
  const { produto_id, variante_id, quantidade, observacao } = req.body;
  const user = req.dashUser;
  if (!produto_id) return res.redirect('/painel/solicitar?msg=err');
  dashDb.criarSolicitacao({ usuario_id: user.id, username: user.username, produto_id, variante_id, quantidade: parseInt(quantidade)||1, observacao });
  res.redirect('/painel/solicitar?msg=ok');
});

// ─── SOLICITAÇÕES (resp_staff+) ───────────────────────────────
router.get('/solicitacoes', auth.middlewareAba('solicitacoes'), (req, res) => {
  const { db } = getMainDb();
  const user   = req.dashUser;
  const status = req.query.status || 'pendente';
  const msg    = req.query.msg || '';

  const solic = dashDb.listarSolicitacoes(status || null);
  const tabs = ['pendente','aprovado','recusado'].map(s =>
    `<a href="/painel/solicitacoes?status=${s}" class="btn btn-sm ${status===s?'btn-primary':'btn-ghost'}">${s}</a>`
  ).join('');

  const body = `
    ${msg === 'ok' ? alert('success', '✅ Solicitação respondida!') : ''}
    <div style="display:flex;gap:8px;margin-bottom:18px">${tabs}</div>
    <div class="table-card">
      <div class="table-head"><span class="table-title">📥 Solicitações — ${status}</span></div>
      <table>
        <tr><th>Staff</th><th>Produto</th><th>Variante</th><th>Qtd</th><th>Obs</th><th>Data</th><th>Ações</th></tr>
        ${solic.length ? solic.map(s => {
          const p = db.prepare('SELECT nome FROM produtos WHERE id=?').get(s.produto_id);
          const v = s.variante_id ? db.prepare('SELECT nome FROM variantes_produto WHERE id=?').get(s.variante_id) : null;
          return `<tr>
            <td><strong>${s.username}</strong></td>
            <td>${p?.nome || '—'}</td>
            <td>${v?.nome || '—'}</td>
            <td>${s.quantidade}</td>
            <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${s.observacao || '—'}</td>
            <td>${fmtDate(s.criado_em)}</td>
            <td style="display:flex;gap:4px">
              ${s.status === 'pendente' ? `
              <form method="POST" action="/painel/solicitacoes/${s.id}/aprovar" style="display:inline">
                <button class="btn btn-sm btn-success">✅</button>
              </form>
              <form method="POST" action="/painel/solicitacoes/${s.id}/recusar" style="display:inline">
                <button class="btn btn-sm btn-danger">❌</button>
              </form>` : badge(s.status)}
            </td>
          </tr>`;
        }).join('') : `<tr><td colspan="7" style="text-align:center;color:#7878a0;padding:24px">Nenhuma solicitação ${status}</td></tr>`}
      </table>
    </div>`;

  res.send(layout(user, '📥 Solicitações', body, 'solicitacoes'));
});

router.post('/solicitacoes/:id/aprovar', auth.middlewareAba('solicitacoes'), async (req, res) => {
  const { db, Usuarios } = getMainDb();
  const user  = req.dashUser;
  const sol   = dashDb.listarSolicitacoes().find(s => s.id == req.params.id);

  if (sol) {
    dashDb.responderSolicitacao(sol.id, 'aprovado', user.username);

    // Entregar produto para quem solicitou
    try {
      // Buscar o usuário do painel que fez a solicitação
      const solicitante = dashDb.getUsuario(sol.usuario_id);
      if (solicitante && sol.produto_id) {
        // Garantir usuário no banco principal
        Usuarios.garantir(solicitante.discord_id, solicitante.username);

        // Pegar variante e estoque
        const variante = sol.variante_id
          ? db.prepare('SELECT * FROM variantes_produto WHERE id=?').get(sol.variante_id) : null;
        const produto  = db.prepare('SELECT * FROM produtos WHERE id=?').get(sol.produto_id);

        if (produto) {
          let conteudos = [];
          const qtd = sol.quantidade || 1;

          // Pegar itens do estoque
          const tabEstoque = sol.variante_id ? 'estoque_variante' : 'estoque_digital';
          const colProd    = sol.variante_id ? 'variante_id'      : 'produto_id';
          const colId      = sol.variante_id ? sol.variante_id    : sol.produto_id;

          for (let i = 0; i < qtd; i++) {
            const item = db.prepare(`SELECT * FROM ${tabEstoque} WHERE ${colProd}=? AND usado=0 LIMIT 1`).get(colId);
            if (item) {
              db.prepare(`UPDATE ${tabEstoque} SET usado=1, usado_por=? WHERE id=?`).run(solicitante.discord_id, item.id);
              conteudos.push(item.conteudo);
            }
          }

          const conteudoFinal = conteudos.join('\n---\n');

          // Salvar conteúdo no banco para mostrar no site
          const { v4: uuidv4 } = require('uuid');
          const pedidoId = uuidv4();
          db.prepare("INSERT INTO pedidos (id, usuario_id, produto_id, quantidade, valor_unit, valor_total, status, metodo_pag, conteudo_entregue, pago_em) VALUES (?,?,?,?,0,0,'entregue','solicitacao',?,strftime('%s','now'))")
            .run(pedidoId, solicitante.discord_id, sol.produto_id, qtd, conteudoFinal || '(sem estoque digital)');

          // Notificar no Discord via DM
          const clientRef = require('../utils/clientRef');
          const client    = clientRef.getClient();
          console.log(`[SolicDM] client=${!!client} discord_id=${solicitante.discord_id} conteudo=${!!conteudoFinal}`);
          if (client && solicitante.discord_id && solicitante.discord_id !== '0') {
            try {
              // Buscar usuário pelo ID direto — mais confiável que guild.members
              const discordUser = await client.users.fetch(solicitante.discord_id).catch(e => { console.warn('[SolicDM] fetch error:', e.message); return null; });
              console.log(`[SolicDM] discordUser=${!!discordUser}`);
              if (discordUser) {
                const { EmbedBuilder } = require('discord.js');
                const embedContent = conteudoFinal || '(produto entregue — veja na aba Perfil do site)';
                await discordUser.send({ embeds: [new EmbedBuilder()
                  .setColor(0x00ff88)
                  .setTitle('✅ Solicitação Aprovada!')
                  .setDescription(`Sua solicitação de **${qtd}x ${produto.nome}** foi aprovada.\n\n**Produto:**\n\`\`\`${embedContent.slice(0, 1500)}\`\`\``)
                  .setTimestamp()] }).catch(e => console.warn('[SolicDM] send error:', e.message));
              }
            } catch (e) { console.error('[SolicDM]', e.message); }
          }
        }
      }
    } catch (e) { console.error('[Solicitacao Entrega]', e.message); }
  }

  res.redirect('/painel/solicitacoes?status=pendente&msg=ok');
});

router.post('/solicitacoes/:id/recusar', auth.middlewareAba('solicitacoes'), (req, res) => {
  dashDb.responderSolicitacao(req.params.id, 'recusado', req.dashUser.username, 'Recusado pelo responsável');
  res.redirect('/painel/solicitacoes?status=pendente&msg=ok');
});

// ─── USUÁRIOS ────────────────────────────────────────────────
router.get('/usuarios', auth.middlewareAba('usuarios'), (req, res) => {
  const { db } = getMainDb();
  const user   = req.dashUser;
  const search = req.query.q || '';
  const page   = parseInt(req.query.page) || 1;
  const limit  = 20;
  const offset = (page - 1) * limit;

  const where = search ? `WHERE discord_id LIKE '%${search.replace(/'/g,"''")}%' OR nome LIKE '%${search.replace(/'/g,"''")}%'` : '';
  const total = db.prepare(`SELECT COUNT(*) as c FROM usuarios ${where}`).get()?.c || 0;
  const rows  = db.prepare(`SELECT * FROM usuarios ${where} ORDER BY total_gasto DESC LIMIT ${limit} OFFSET ${offset}`).all();

  const body = `
    <div class="search-row">
      <form method="GET"><input class="form-control" name="q" value="${search}" placeholder="Buscar por ID ou nome..."></form>
    </div>
    <div class="table-card">
      <div class="table-head"><span class="table-title">👥 Usuários do Servidor (${total})</span></div>
      <table>
        <tr><th>Discord ID</th><th>Nome</th><th>Saldo</th><th>Coins</th><th>Total Gasto</th><th>Nível</th><th>Status</th></tr>
        ${rows.map(u => `<tr>
          <td><code style="font-size:11px">${u.discord_id}</code></td>
          <td>${u.nome || '—'}</td>
          <td>${fmtMoeda(u.saldo)}</td>
          <td>🪙 ${Number(u.coins||0).toLocaleString('pt-BR')}</td>
          <td style="color:#86efac;font-weight:700">${fmtMoeda(u.total_gasto)}</td>
          <td>${u.nivel || 'Bronze'}</td>
          <td>${u.bloqueado ? badge('bloqueado') : badge('ativo')}</td>
        </tr>`).join('') || '<tr><td colspan="7" style="text-align:center;color:#7878a0;padding:24px">Nenhum</td></tr>'}
      </table>
    </div>
    ${pagination(page, total, limit, `/painel/usuarios?q=${search}`)}`;

  res.send(layout(user, '👥 Usuários', body, 'usuarios'));
});

// ─── PRODUTOS ────────────────────────────────────────────────
router.get('/produtos', auth.middlewareAba('produtos'), (req, res) => {
  const { db } = getMainDb();
  const user   = req.dashUser;
  const search = req.query.q || '';
  const page   = parseInt(req.query.page) || 1;
  const limit  = 20; const offset = (page-1)*limit;
  const where  = search ? `WHERE p.nome LIKE '%${search.replace(/'/g,"''")}%'` : '';
  const total  = db.prepare(`SELECT COUNT(*) as c FROM produtos p ${where}`).get()?.c || 0;
  const rows   = db.prepare(`SELECT p.*, COUNT(v.id) as variantes FROM produtos p LEFT JOIN variantes_produto v ON v.produto_id=p.id AND v.ativo=1 ${where} GROUP BY p.id ORDER BY p.criado_em DESC LIMIT ${limit} OFFSET ${offset}`).all();
  const podeDeletar = ['sub_dono','dono'].includes(user.cargo);

  const body = `
    <div class="search-row"><form method="GET"><input class="form-control" name="q" value="${search}" placeholder="Buscar..."></form></div>
    <div class="table-card">
      <div class="table-head">
        <span class="table-title">📦 Produtos (${total})</span>
        ${podeDeletar ? `<form method="POST" action="/painel/produtos/deletar-desativados" onsubmit="return confirm('Deletar TODOS os produtos desativados permanentemente?')">
          <button class="btn btn-sm btn-danger" type="submit">🗑️ Deletar Desativados</button>
        </form>` : ''}
      </div>
      <table>
        <tr><th>Nome</th><th>Categoria</th><th>Preço</th><th>Variantes</th><th>Vendas</th><th>Status</th><th>Ações</th></tr>
        ${rows.map(p => `<tr>
          <td><strong>${p.nome}</strong></td>
          <td>${p.categoria||'—'}</td>
          <td>${fmtMoeda(p.preco)}</td>
          <td>${p.variantes}</td>
          <td>${p.vendas||0}</td>
          <td>${badge(p.ativo?'ativo':'inativo')}</td>
          <td style="display:flex;gap:4px;flex-wrap:wrap">
            <form method="POST" action="/painel/produtos/${p.id}/toggle" style="display:inline">
              <button class="btn btn-sm ${p.ativo?'btn-danger':'btn-success'}" type="submit">${p.ativo?'Desativar':'Ativar'}</button>
            </form>
            ${podeDeletar && !p.ativo ? `<form method="POST" action="/painel/produtos/${p.id}/deletar" style="display:inline" onsubmit="return confirm('Deletar permanentemente ${p.nome.replace(/'/g,"\\'")}?')">
              <button class="btn btn-sm btn-danger" type="submit">🗑️</button>
            </form>` : ''}
          </td>
        </tr>`).join('')||'<tr><td colspan="7" style="text-align:center;color:#7878a0;padding:24px">Nenhum</td></tr>'}
      </table>
    </div>
    ${pagination(page,total,limit,`/painel/produtos?q=${search}`)}`;
  res.send(layout(user, '📦 Produtos', body, 'produtos'));
});

router.post('/produtos/:id/toggle', auth.middlewareAba('produtos'), (req, res) => {
  const { db } = getMainDb();
  const p = db.prepare('SELECT ativo FROM produtos WHERE id=?').get(req.params.id);
  if (p) db.prepare('UPDATE produtos SET ativo=? WHERE id=?').run(p.ativo?0:1, req.params.id);
  res.redirect('/painel/produtos');
});

router.post('/produtos/:id/deletar', auth.middlewareAba('produtos'), (req, res) => {
  const user = req.dashUser;
  if (!['sub_dono','dono'].includes(user.cargo)) return res.status(403).send('Sem permissão');
  const { db } = getMainDb();
  const prod = db.prepare('SELECT * FROM produtos WHERE id=? AND ativo=0').get(req.params.id);
  if (!prod) return res.redirect('/painel/produtos?msg=err');
  try {
    // Deletar dados dependentes antes, preservando pedidos (histórico)
    db.prepare('DELETE FROM estoque_digital WHERE produto_id=?').run(prod.id);
    db.prepare('DELETE FROM estoque_variante WHERE variante_id IN (SELECT id FROM variantes_produto WHERE produto_id=?)').run(prod.id);
    db.prepare('DELETE FROM variantes_produto WHERE produto_id=?').run(prod.id);
    db.prepare('DELETE FROM paineis_canal WHERE produto_id=?').run(prod.id);
    db.prepare("DELETE FROM caixa_itens_config WHERE produto_id=?").run(prod.id);
    // Remover favoritos se existir
    try { db.prepare('DELETE FROM favoritos WHERE produto_id=?').run(prod.id); } catch {}
    // Remover histórico de preços se existir
    try { db.prepare('DELETE FROM historico_precos WHERE produto_id=?').run(prod.id); } catch {}
    // Preços revendedor
    try { db.prepare('DELETE FROM dash_precos_revendedor WHERE produto_id=?').run(prod.id); } catch {}
    // Nullificar produto_id nos pedidos para preservar histórico financeiro
    db.prepare('UPDATE pedidos SET produto_id=NULL WHERE produto_id=?').run(prod.id);
    // Agora deletar o produto com FK desabilitada temporariamente
    db.pragma('foreign_keys = OFF');
    db.prepare('DELETE FROM produtos WHERE id=?').run(prod.id);
    db.pragma('foreign_keys = ON');
    res.redirect('/painel/produtos');
  } catch (e) {
    db.pragma('foreign_keys = ON');
    console.error('[Deletar Produto]', e.message);
    res.redirect('/painel/produtos?msg=err');
  }
});

router.post('/produtos/deletar-desativados', auth.middlewareAba('produtos'), (req, res) => {
  const user = req.dashUser;
  if (!['sub_dono','dono'].includes(user.cargo)) return res.status(403).send('Sem permissão');
  const { db } = getMainDb();
  const desativados = db.prepare('SELECT id FROM produtos WHERE ativo=0').all();
  try {
    db.pragma('foreign_keys = OFF');
    for (const p of desativados) {
      db.prepare('DELETE FROM estoque_digital WHERE produto_id=?').run(p.id);
      db.prepare('DELETE FROM estoque_variante WHERE variante_id IN (SELECT id FROM variantes_produto WHERE produto_id=?)').run(p.id);
      db.prepare('DELETE FROM variantes_produto WHERE produto_id=?').run(p.id);
      db.prepare('DELETE FROM paineis_canal WHERE produto_id=?').run(p.id);
      try { db.prepare('DELETE FROM caixa_itens_config WHERE produto_id=?').run(p.id); } catch {}
      try { db.prepare('DELETE FROM favoritos WHERE produto_id=?').run(p.id); } catch {}
      try { db.prepare('DELETE FROM historico_precos WHERE produto_id=?').run(p.id); } catch {}
      try { db.prepare('DELETE FROM dash_precos_revendedor WHERE produto_id=?').run(p.id); } catch {}
      db.prepare('UPDATE pedidos SET produto_id=NULL WHERE produto_id=?').run(p.id);
      db.prepare('DELETE FROM produtos WHERE id=?').run(p.id);
    }
    db.pragma('foreign_keys = ON');
    res.redirect('/painel/produtos');
  } catch (e) {
    db.pragma('foreign_keys = ON');
    console.error('[Deletar Desativados]', e.message);
    res.redirect('/painel/produtos?msg=err');
  }
});

// ─── PEDIDOS ─────────────────────────────────────────────────
router.get('/pedidos', auth.middlewareAba('pedidos'), (req, res) => {
  const { db } = getMainDb();
  const user   = req.dashUser;
  const status = req.query.status || '';
  const search = req.query.q || '';
  const page   = parseInt(req.query.page) || 1;
  const limit  = 25; const offset = (page-1)*limit;
  let where = 'WHERE 1=1';
  if (status) where += ` AND p.status='${status.replace(/'/g,"''")}'`;
  if (search) where += ` AND (p.id LIKE '%${search.replace(/'/g,"''")}%' OR p.usuario_id LIKE '%${search.replace(/'/g,"''")}%')`;
  const total = db.prepare(`SELECT COUNT(*) as c FROM pedidos p ${where}`).get()?.c || 0;
  const rows  = db.prepare(`SELECT p.*, pr.nome as produto_nome FROM pedidos p LEFT JOIN produtos pr ON p.produto_id=pr.id ${where} ORDER BY p.criado_em DESC LIMIT ${limit} OFFSET ${offset}`).all();
  const statusOpts = ['','pendente','pago','entregue','cancelado'].map(s=>`<option value="${s}" ${status===s?'selected':''}>${s||'Todos'}</option>`).join('');

  const body = `
    <div class="search-row">
      <form method="GET" style="display:flex;gap:10px;flex-wrap:wrap">
        <input class="form-control" name="q" value="${search}" placeholder="ID ou usuário..." style="width:220px">
        <select class="form-control" name="status" style="width:160px">${statusOpts}</select>
        <button class="btn btn-primary" type="submit">🔍</button>
      </form>
    </div>
    <div class="table-card">
      <div class="table-head"><span class="table-title">🛒 Pedidos (${total})</span></div>
      <table>
        <tr><th>Pedido</th><th>Produto</th><th>Usuário</th><th>Valor</th><th>Data</th><th>Status</th></tr>
        ${rows.map(p=>`<tr>
          <td><code style="font-size:11px">${p.id.slice(0,8).toUpperCase()}</code></td>
          <td>${p.produto_nome||'—'}</td>
          <td><code style="font-size:11px">${p.usuario_id}</code></td>
          <td style="color:#86efac;font-weight:700">${fmtMoeda(p.valor_total)}</td>
          <td>${fmtDate(p.criado_em)}</td>
          <td>${badge(p.status)}</td>
        </tr>`).join('')||'<tr><td colspan="6" style="text-align:center;color:#7878a0;padding:24px">Nenhum</td></tr>'}
      </table>
    </div>
    ${pagination(page,total,limit,`/painel/pedidos?status=${status}&q=${search}`)}`;
  res.send(layout(user, '🛒 Pedidos', body, 'pedidos'));
});

// ─── TICKETS ─────────────────────────────────────────────────
router.get('/tickets', auth.middlewareAba('tickets'), (req, res) => {
  const { db } = getMainDb();
  const user   = req.dashUser;
  const status = req.query.status || '';
  const page   = parseInt(req.query.page) || 1;
  const limit  = 25; const offset = (page-1)*limit;
  let where = 'WHERE 1=1';
  if (status) where += ` AND status='${status.replace(/'/g,"''")}'`;
  const total = db.prepare(`SELECT COUNT(*) as c FROM tickets ${where}`).get()?.c || 0;
  const rows  = db.prepare(`SELECT * FROM tickets ${where} ORDER BY criado_em DESC LIMIT ${limit} OFFSET ${offset}`).all();
  const statusOpts = ['','aberto','fechado'].map(s=>`<option value="${s}" ${status===s?'selected':''}>${s||'Todos'}</option>`).join('');

  const body = `
    <div class="search-row">
      <form method="GET" style="display:flex;gap:10px">
        <select class="form-control" name="status" style="width:160px">${statusOpts}</select>
        <button class="btn btn-primary" type="submit">🔍</button>
      </form>
    </div>
    <div class="table-card">
      <div class="table-head"><span class="table-title">🎫 Tickets (${total})</span></div>
      <table>
        <tr><th>ID</th><th>Tipo</th><th>Usuário</th><th>Atendente</th><th>Aberto em</th><th>Status</th></tr>
        ${rows.map(t=>`<tr>
          <td><code style="font-size:11px">${(t.id||'').slice(0,8).toUpperCase()}</code></td>
          <td>${t.tipo||'—'}</td>
          <td><code style="font-size:11px">${t.usuario_id||'—'}</code></td>
          <td>${t.atendente||'<span style="color:#7878a0">—</span>'}</td>
          <td>${fmtDate(t.criado_em)}</td>
          <td>${badge(t.status)}</td>
        </tr>`).join('')||'<tr><td colspan="6" style="text-align:center;color:#7878a0;padding:24px">Nenhum</td></tr>'}
      </table>
    </div>
    ${pagination(page,total,limit,`/painel/tickets?status=${status}`)}`;
  res.send(layout(user, '🎫 Tickets', body, 'tickets'));
});

// ─── CUPONS ──────────────────────────────────────────────────
router.get('/cupons', auth.middlewareAba('cupons'), (req, res) => {
  const { db } = getMainDb();
  const user   = req.dashUser;
  const msg    = req.query.msg || '';
  const rows   = db.prepare('SELECT * FROM cupons ORDER BY criado_em DESC').all();
  const podeEditar = ['sub_dono','dono'].includes(user.cargo) || dashDb.podeVer(user.cargo,'gerenciar');

  const body = `
    ${msg==='ok'?alert('success','✅ Feito!'):msg==='err'?alert('error','❌ Erro.'):''}
    ${podeEditar ? `
    <div style="margin-bottom:24px">
      <button onclick="document.getElementById('modal-cupom').style.display='flex'" class="btn btn-primary">➕ Novo Cupom</button>
    </div>
    <!-- Modal criar cupom -->
    <div id="modal-cupom" style="display:none;position:fixed;inset:0;z-index:9999;background:#00000090;backdrop-filter:blur(4px);align-items:center;justify-content:center">
      <div style="background:#0d0d20;border:1px solid #7c3aed40;border-radius:16px;padding:28px;width:min(600px,94vw);max-height:90vh;overflow-y:auto;box-shadow:0 24px 60px #00000080">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
          <div style="font-size:17px;font-weight:800;color:#fff">🎟️ Criar Cupom</div>
          <button onclick="document.getElementById('modal-cupom').style.display='none'" style="background:none;border:none;color:#7070a0;font-size:22px;cursor:pointer">✕</button>
        </div>
        <form method="POST" action="/painel/cupons/criar">
          <div class="form-grid">
            <div class="form-group"><label>Código</label><input class="form-control" name="codigo" placeholder="Gerado automaticamente se vazio"></div>
            <div class="form-group"><label>Tipo</label><select class="form-control" name="tipo"><option value="percentual">% Percentual</option><option value="fixo">R$ Fixo</option></select></div>
            <div class="form-group"><label>Valor</label><input class="form-control" type="number" step="0.01" name="valor" required placeholder="Ex: 10"></div>
            <div class="form-group"><label>Usos Máximos</label><input class="form-control" type="number" name="usos" value="100" min="1"></div>
          </div>
          <div class="form-group"><label>Validade</label>
            <div style="display:flex;gap:8px">
              <input class="form-control" type="number" name="validade_valor" value="30" min="1" style="width:100px">
              <select class="form-control" name="validade_unidade" style="flex:1">
                <option value="dias">Dias</option>
                <option value="horas">Horas</option>
                <option value="minutos">Minutos</option>
              </select>
            </div>
          </div>
          <div class="form-group"><label>Lojas (IDs de painéis, separados por vírgula — vazio = todas)</label><input class="form-control" name="lojas" placeholder="Ex: abc123,def456"></div>
          <div class="form-group">
            <label>Restringir a um cargo?</label>
            <div style="display:flex;gap:10px;align-items:center;margin-top:6px">
              <label style="display:flex;align-items:center;gap:6px;text-transform:none;font-size:13px;cursor:pointer"><input type="checkbox" id="chk-cargo" onchange="document.getElementById('grp-cargo').style.display=this.checked?'block':'none'"> Sim, restringir a cargo</label>
            </div>
          </div>
          <div class="form-group" id="grp-cargo" style="display:none">
            <label>ID do Cargo Discord</label>
            <input class="form-control" name="cargo_id" placeholder="Ex: 1522459532469469225">
          </div>
          <div class="form-group">
            <label>Restringir a uma pessoa específica?</label>
            <div style="display:flex;gap:10px;align-items:center;margin-top:6px">
              <label style="display:flex;align-items:center;gap:6px;text-transform:none;font-size:13px;cursor:pointer"><input type="checkbox" id="chk-pessoa" onchange="document.getElementById('grp-pessoa').style.display=this.checked?'block':'none'"> Sim, restringir a uma pessoa</label>
            </div>
          </div>
          <div class="form-group" id="grp-pessoa" style="display:none">
            <label>ID Discord da Pessoa</label>
            <input class="form-control" name="usuario_id_restrito" placeholder="ID do Discord da pessoa">
          </div>
          <div style="display:flex;gap:10px;margin-top:8px">
            <button class="btn btn-primary" style="flex:1" type="submit">✅ Criar Cupom</button>
            <button type="button" onclick="document.getElementById('modal-cupom').style.display='none'" class="btn btn-ghost">Cancelar</button>
          </div>
        </form>
      </div>
    </div>` : ''}
    <div class="table-card">
      <div class="table-head"><span class="table-title">🎟️ Cupons (${rows.length})</span></div>
      <table>
        <tr><th>Código</th><th>Tipo</th><th>Valor</th><th>Usos</th><th>Validade</th><th>Status</th>${podeEditar?'<th>Ações</th>':''}</tr>
        ${rows.map(c=>{
          const exp=c.validade?new Date(c.validade*1000).toLocaleDateString('pt-BR'):'∞';
          const expirado=c.validade&&c.validade<Math.floor(Date.now()/1000);
          return `<tr>
            <td><strong>${c.codigo}</strong></td>
            <td>${c.tipo}</td>
            <td>${c.tipo==='percentual'?c.valor+'%':fmtMoeda(c.valor)}</td>
            <td>${c.usos_atual}/${c.usos_max}</td>
            <td>${exp}</td>
            <td>${expirado?badge('expirado'):c.ativo?badge('ativo'):badge('inativo')}</td>
            ${podeEditar?`<td style="display:flex;gap:4px">
              <form method="POST" action="/painel/cupons/${c.codigo}/toggle" style="display:inline"><button class="btn btn-sm ${c.ativo?'btn-danger':'btn-success'}" type="submit">${c.ativo?'Off':'On'}</button></form>
              <form method="POST" action="/painel/cupons/${c.codigo}/deletar" style="display:inline" onsubmit="return confirm('Deletar?')"><button class="btn btn-sm btn-danger" type="submit">🗑️</button></form>
            </td>`:''}
          </tr>`;
        }).join('')||'<tr><td colspan="7" style="text-align:center;color:#7878a0;padding:24px">Nenhum</td></tr>'}
      </table>
    </div>`;
  res.send(layout(user, '🎟️ Cupons', body, 'cupons'));
});

router.post('/cupons/criar', auth.middlewareAba('cupons'), express.urlencoded({extended:false}), (req,res)=>{
  try{
    const { criarCupom, gerarCodigoCupom } = require('../systems/cupons');
    const { codigo, tipo, valor, usos, validade_valor, validade_unidade, lojas, cargo_id, usuario_id_restrito } = req.body;

    // Calcular validade em dias
    const vVal  = parseInt(validade_valor) || 30;
    const vUnit = validade_unidade || 'dias';
    const validadeDias = vUnit === 'horas' ? vVal / 24 : vUnit === 'minutos' ? vVal / 1440 : vVal;

    // lojas_validas: array de IDs de painéis
    const lojasArr = lojas ? lojas.split(',').map(s=>s.trim()).filter(Boolean) : [];

    criarCupom({
      codigo:       codigo || gerarCodigoCupom(),
      tipo:         tipo   || 'percentual',
      valor:        parseFloat(valor),
      usosMax:      parseInt(usos) || 100,
      validadeDias: validadeDias,
      cargoId:      cargo_id?.trim()            || null,
      criadoPor:    req.dashUser.username,
    });

    // Salvar campos extras (lojas_validas, usuario_id_restrito) se precisar
    if (lojasArr.length || usuario_id_restrito?.trim()) {
      const { db } = getMainDb();
      const c = db.prepare('SELECT id FROM cupons WHERE codigo=?').get((codigo || '').toUpperCase());
      if (c) {
        if (lojasArr.length) db.prepare('UPDATE cupons SET lojas_validas=? WHERE id=?').run(JSON.stringify(lojasArr), c.id);
        if (usuario_id_restrito?.trim()) db.prepare('UPDATE cupons SET usuario_id_restrito=? WHERE id=?').run(usuario_id_restrito.trim(), c.id).catch?.(()=>{});
      }
    }

    res.redirect('/painel/cupons?msg=ok');
  }catch(e){console.error(e.message);res.redirect('/painel/cupons?msg=err');}
});
router.post('/cupons/:cod/toggle',auth.middlewareAba('cupons'),(_,res,next)=>next(),(req,res)=>{
  const{db}=getMainDb();const c=db.prepare('SELECT ativo FROM cupons WHERE codigo=?').get(req.params.cod.toUpperCase());
  if(c)db.prepare('UPDATE cupons SET ativo=? WHERE codigo=?').run(c.ativo?0:1,req.params.cod.toUpperCase());
  res.redirect('/painel/cupons?msg=ok');
});
router.post('/cupons/:cod/deletar',auth.middlewareAba('cupons'),(req,res)=>{
  require('../systems/cupons').deletarCupom(req.params.cod);res.redirect('/painel/cupons?msg=ok');
});

// ─── GERENCIAR (dono/sub_dono) ───────────────────────────────
router.get('/gerenciar', auth.middlewareAba('gerenciar'), (req, res) => {
  const user  = req.dashUser;
  const users = dashDb.listarUsuarios();
  const msg   = req.query.msg || '';
  const podeEditar = ['sub_dono','dono'].includes(user.cargo);

  const usersRows = users.map(u => {
    const ci = CARGO_LABELS[u.cargo] || CARGO_LABELS.cliente;
    return `<tr>
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,${ci.color}40,${ci.color}20);border:1px solid ${ci.color}50;display:flex;align-items:center;justify-content:center;font-size:14px">${ci.icon}</div>
          <div>
            <div style="font-weight:700;color:#fff">${u.username}</div>
            ${!u.aprovado?'<span class="badge badge-yellow" style="font-size:9px">pendente</span>':''}
          </div>
        </div>
      </td>
      <td><code style="font-size:10.5px;color:#a78bfa">${u.discord_id}</code></td>
      <td><span style="color:${ci.color};font-weight:600">${ci.label}</span></td>
      <td style="font-size:11px;color:#5a5a90">${u.ip_bloqueado ? `<code style="font-size:10px;color:#f59e0b">${u.ip_bloqueado}</code>` : '—'}</td>
      <td style="font-size:11px;color:#5a5a90">${fmtDate(u.ultimo_acesso)}</td>
      <td>
        <div style="display:flex;gap:4px;flex-wrap:wrap">
          ${!u.aprovado && podeEditar ? `
            <form method="POST" action="/painel/gerenciar/usuarios/${u.id}/aprovar" style="display:inline">
              <button class="btn btn-sm btn-success" title="Aprovar">✅</button>
            </form>
            <form method="POST" action="/painel/gerenciar/usuarios/${u.id}/recusar" style="display:inline">
              <button class="btn btn-sm btn-danger" title="Recusar">❌</button>
            </form>` : ''}
          ${podeEditar ? `
          <form method="POST" action="/painel/gerenciar/usuarios/${u.id}/cargo" style="display:flex;gap:4px">
            <select class="form-control" name="cargo" style="width:115px;height:28px;font-size:11px;padding:2px 8px">
              ${CARGOS.map(c=>`<option value="${c}" ${u.cargo===c?'selected':''}>${c}</option>`).join('')}
            </select>
            <button class="btn btn-sm btn-ghost" type="submit" title="Salvar cargo">💾</button>
          </form>` : `<span class="badge badge-gray" style="font-size:10px">${ci.label}</span>`}
          ${u.ip_bloqueado && podeEditar ? `
            <form method="POST" action="/painel/gerenciar/usuarios/${u.id}/reset-ip" style="display:inline">
              <button class="btn btn-sm btn-ghost" title="Reset IP">🔄</button>
            </form>` : ''}
          ${podeEditar ? `<a href="/painel/gerenciar/usuarios/${u.id}/senha" class="btn btn-sm btn-ghost" title="Senha">🔑</a>` : ''}
          ${user.cargo === 'dono' && u.cargo !== 'dono' ? `
            <form method="POST" action="/painel/gerenciar/usuarios/${u.id}/deletar" style="display:inline" onsubmit="return confirm('Deletar ${u.username}?')">
              <button class="btn btn-sm btn-danger" title="Deletar">🗑️</button>
            </form>` : ''}
        </div>
      </td>
    </tr>`;
  }).join('');

  // ── Tabela de permissões — cards coloridos por cargo ──────────
  const ABAS_LISTA = Object.keys(ABAS_INFO);
  const CARGO_ORDER = ['cliente','revendedor','staff','resp_staff','sub_dono'];

  const permCards = CARGO_ORDER.map(cargo => {
    const perms = dashDb.getPermissoes(cargo);
    const ci    = CARGO_LABELS[cargo];
    const chips = ABAS_LISTA.map(aba => {
      const tem = perms[aba];
      if (podeEditar) {
        return `<form method="POST" action="/painel/gerenciar/permissoes" style="display:inline;margin:3px">
          <input type="hidden" name="cargo" value="${cargo}">
          <input type="hidden" name="aba" value="${aba}">
          <input type="hidden" name="val" value="${tem?'0':'1'}">
          <button type="submit" title="${tem?'Remover permissão de ':'Conceder '}${aba}"
            style="display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:600;cursor:pointer;border:1px solid ${tem?ci.color+'50':'#ffffff15'};background:${tem?ci.color+'18':'rgba(0,0,0,0.2)'};color:${tem?ci.color:'#5a5a90'};transition:all .15s">
            ${ABAS_INFO[aba].icon} ${ABAS_INFO[aba].label}
          </button>
        </form>`;
      } else {
        return `<span style="display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:600;margin:3px;border:1px solid ${tem?ci.color+'50':'#ffffff10'};background:${tem?ci.color+'15':'rgba(0,0,0,0.15)'};color:${tem?ci.color:'#3a3a60'}">
          ${ABAS_INFO[aba].icon} ${ABAS_INFO[aba].label}
        </span>`;
      }
    }).join('');

    return `
      <div style="background:linear-gradient(135deg,var(--card),var(--card2));border:1px solid ${ci.color}25;border-radius:14px;padding:18px;border-left:3px solid ${ci.color}">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
          <div style="width:36px;height:36px;border-radius:50%;background:${ci.color}20;border:1px solid ${ci.color}50;display:flex;align-items:center;justify-content:center;font-size:18px">${ci.icon}</div>
          <div>
            <div style="font-size:15px;font-weight:800;color:${ci.color}">${ci.label}</div>
            <div style="font-size:11px;color:#5a5a90">Clique para ${podeEditar?'conceder/remover':'ver'} permissões</div>
          </div>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:4px">${chips}</div>
      </div>`;
  }).join('');

  const body = `
    ${msg==='ok'?alert('success','✅ Feito!'):msg==='err'?alert('error','❌ Erro.'):''}
    ${!podeEditar ? `<div class="alert alert-info">👁️ Você tem acesso somente visualização. Apenas Dono e Sub-Dono podem editar.</div>` : ''}

    <div class="table-card" style="margin-bottom:28px">
      <div class="table-head">
        <span class="table-title">👥 Usuários do Painel <span class="badge badge-blue" style="font-size:11px">${users.length}</span></span>
      </div>
      <table>
        <tr><th>Usuário</th><th>Discord ID</th><th>Cargo</th><th>IP Registrado</th><th>Último acesso</th><th>Ações</th></tr>
        ${usersRows || '<tr><td colspan="6" style="text-align:center;color:#5a5a90;padding:24px">Nenhum usuário</td></tr>'}
      </table>
    </div>

    <div style="margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
      <div>
        <div style="font-size:16px;font-weight:800;color:#fff;margin-bottom:4px">🔐 Permissões por Cargo</div>
        <div style="font-size:12px;color:#5a5a90">${podeEditar?'Clique em uma aba para conceder ou remover acesso.':'Visualização das permissões. Apenas Dono/Sub-Dono podem editar.'}</div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:16px">
      ${permCards}
    </div>`;

  res.send(layout(user, '⚙️ Gerenciar', body, 'gerenciar'));
});

router.post('/gerenciar/usuarios/:id/aprovar', auth.middlewareAba('gerenciar'), (req, res) => {
  dashDb.aprovarUsuario(req.params.id); res.redirect('/painel/gerenciar?msg=ok');
});
router.post('/gerenciar/usuarios/:id/recusar', auth.middlewareAba('gerenciar'), (req, res) => {
  dashDb.recusarUsuario(req.params.id); res.redirect('/painel/gerenciar?msg=ok');
});
router.post('/gerenciar/usuarios/:id/cargo', auth.middlewareAba('gerenciar'), express.urlencoded({extended:false}), (req, res) => {
  const cargo = req.body.cargo;
  if (CARGOS.includes(cargo)) dashDb.mudarCargo(req.params.id, cargo);
  res.redirect('/painel/gerenciar?msg=ok');
});
router.post('/gerenciar/usuarios/:id/reset-ip', auth.middlewareAba('gerenciar'), (req, res) => {
  dashDb.resetarIp(req.params.id); res.redirect('/painel/gerenciar?msg=ok');
});

router.post('/gerenciar/usuarios/:id/deletar', auth.middlewareAba('gerenciar'), (req, res) => {
  const user = req.dashUser;
  if (user.cargo !== 'dono') return res.redirect('/painel/gerenciar?msg=err');
  const alvo = dashDb.getUsuario(req.params.id);
  // Não pode deletar o próprio dono
  if (!alvo || alvo.cargo === 'dono') return res.redirect('/painel/gerenciar?msg=err');
  dashDb.recusarUsuario(req.params.id); // deleta do banco
  res.redirect('/painel/gerenciar?msg=ok');
});
router.post('/gerenciar/permissoes', auth.middlewareAba('gerenciar'), express.urlencoded({extended:false}), (req, res) => {
  if (!['sub_dono','dono'].includes(req.dashUser.cargo)) return res.redirect('/painel/gerenciar?msg=err');
  const { cargo, aba, val } = req.body;
  if (cargo && aba) dashDb.setPermissao(cargo, aba, val === '1');
  res.redirect('/painel/gerenciar?msg=ok');
});

// ─── SENHA — redefinir por admin (só dono vê) ─────────────────
router.get('/gerenciar/usuarios/:id/senha', auth.middlewareAba('gerenciar'), (req, res) => {
  const user    = req.dashUser;
  if (user.cargo !== 'dono' && user.cargo !== 'sub_dono') return res.redirect('/painel/gerenciar');
  const alvo    = dashDb.getUsuario(req.params.id);
  if (!alvo) return res.redirect('/painel/gerenciar');
  const senhaHash = user.cargo === 'dono' ? alvo.password : null;
  const body = `
    <a href="/painel/gerenciar" class="btn btn-ghost btn-sm" style="margin-bottom:20px">← Voltar</a>
    <div class="table-card" style="max-width:500px">
      <div class="table-head"><span class="table-title">🔑 Redefinir Senha — ${alvo.username}</span></div>
      <div style="padding:20px">
        ${senhaHash ? `<div class="form-group"><label>Hash atual (somente dono)</label><code style="font-size:11px;word-break:break-all;color:#a855f7">${senhaHash}</code></div>` : ''}
        <form method="POST" action="/painel/gerenciar/usuarios/${alvo.id}/senha">
          <div class="form-group"><label>Nova senha</label><input class="form-control" type="password" name="nova_senha" required minlength="6"></div>
          <button class="btn btn-primary" type="submit">💾 Redefinir Senha</button>
        </form>
      </div>
    </div>`;
  res.send(layout(user, `🔑 Senha — ${alvo.username}`, body, 'gerenciar'));
});

router.post('/gerenciar/usuarios/:id/senha', auth.middlewareAba('gerenciar'), express.urlencoded({extended:false}), (req, res) => {
  const user = req.dashUser;
  if (user.cargo !== 'dono' && user.cargo !== 'sub_dono') return res.redirect('/painel/gerenciar');
  const { nova_senha } = req.body;
  if (!nova_senha || nova_senha.length < 6) return res.redirect(`/painel/gerenciar/usuarios/${req.params.id}/senha?err=short`);
  const { db } = getMainDb();
  db.prepare('UPDATE dash_usuarios SET password=? WHERE id=?').run(auth.hashPass(nova_senha), req.params.id);
  dashDb.resetarIp(req.params.id); // Invalida sessões antigas
  res.redirect('/painel/gerenciar?msg=ok');
});

// ─── PERFIL ───────────────────────────────────────────────────
router.get('/perfil', auth.requireAuth, (req, res) => {
  const { db } = getMainDb();
  const user   = req.dashUser;

  // Dados do Discord
  const discordUser = db.prepare('SELECT * FROM usuarios WHERE discord_id=?').get(user.discord_id);
  const nivel       = discordUser?.nivel || 'Bronze';
  const saldo       = discordUser?.saldo || 0;
  const coins       = discordUser?.coins || 0;
  const totalGasto  = discordUser?.total_gasto || 0;
  const totalCompras= discordUser?.total_compras || 0;

  // Últimos 10 pedidos
  const pedidos = db.prepare(`
    SELECT p.*, pr.nome as produto_nome, pr.imagem_url as produto_img
    FROM pedidos p
    LEFT JOIN produtos pr ON p.produto_id = pr.id
    WHERE p.usuario_id = ?
    ORDER BY p.criado_em DESC LIMIT 10
  `).all(user.discord_id);

  const ci = CARGO_LABELS[user.cargo] || CARGO_LABELS.cliente;
  const msg = req.query.msg || '';

  const body = `
    ${msg === 'ok' ? `<div class="alert alert-success">✅ Senha alterada com sucesso!</div>` : ''}
    ${msg === 'err' ? `<div class="alert alert-error">❌ Senha atual incorreta.</div>` : ''}

    <div style="display:grid;grid-template-columns:min(300px,100%) 1fr;gap:24px;margin-bottom:28px;align-items:start">
      <div class="stat-card" style="--glow-a:${ci.color.replace('#','')};--glow-b:7c3aed">
        <div style="text-align:center;padding:10px 0">
          <div style="width:72px;height:72px;border-radius:50%;background:linear-gradient(135deg,var(--accent),var(--blue));display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:800;margin:0 auto 14px">${user.username[0].toUpperCase()}</div>
          <div style="font-size:20px;font-weight:800;color:#fff">${user.username}</div>
          <div style="color:${ci.color};font-size:13px;font-weight:600;margin-top:4px">${ci.icon} ${ci.label}</div>
          <div style="color:#7878a0;font-size:12px;margin-top:6px">Discord: <code>${user.discord_id}</code></div>
        </div>
      </div>
      <div class="stats-grid" style="margin-bottom:0;align-content:start">
        <div class="stat-card" style="--glow-a:22c55e;--glow-b:16a34a">
          <div class="stat-label">Total Gasto</div>
          <div class="stat-value" style="color:#86efac;font-size:22px">${fmtMoeda(totalGasto)}</div>
          <div class="stat-sub">${totalCompras} compra(s)</div>
        </div>
        <div class="stat-card" style="--glow-a:f59e0b;--glow-b:d97706">
          <div class="stat-label">Coins</div>
          <div class="stat-value" style="color:#fde68a;font-size:22px">🪙 ${Number(coins).toLocaleString('pt-BR')}</div>
          <div class="stat-sub">Saldo: ${fmtMoeda(saldo)}</div>
        </div>
        <div class="stat-card" style="--glow-a:a855f7;--glow-b:7c3aed">
          <div class="stat-label">Nível</div>
          <div class="stat-value" style="color:#c4b5fd;font-size:22px">${nivel}</div>
          <div class="stat-sub">Ranking de fidelidade</div>
        </div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr min(340px,100%);gap:24px">
      <div class="table-card">
        <div class="table-head"><span class="table-title">🛍️ Últimas Compras</span></div>
        <table>
          <tr><th>Produto</th><th>Valor</th><th>Data</th><th>Status</th><th></th></tr>
          ${pedidos.length ? pedidos.map(p => `<tr>
            <td style="display:flex;align-items:center;gap:10px">
              ${p.produto_img ? `<img src="${p.produto_img.includes('cdn.discordapp.com/attachments')?'https://images.weserv.nl/?url='+encodeURIComponent(p.produto_img)+'&w=72':p.produto_img}" style="width:36px;height:36px;border-radius:6px;object-fit:cover" onerror="this.style.display='none'">` : '<div style="width:36px;height:36px;border-radius:6px;background:var(--card2);display:flex;align-items:center;justify-content:center">📦</div>'}
              <span>${p.produto_nome || '—'}</span>
            </td>
            <td style="color:#00ff88;font-weight:700">${fmtMoeda(p.valor_total)}</td>
            <td>${fmtDate(p.criado_em)}</td>
            <td>${badge(p.status)}</td>
            <td>${p.conteudo_entregue
              ? `<button onclick="mostrarConteudo(this.dataset.c,this.dataset.n)" data-c="${p.conteudo_entregue.replace(/"/g,'&quot;').replace(/\n/g,'&#10;')}" data-n="${(p.produto_nome||'Produto').replace(/"/g,'&quot;')}" class="btn btn-sm btn-success">📋 Ver Produto</button>`
              : '<span style="color:#7070a0;font-size:12px">—</span>'}</td>
          </tr>`).join('') : '<tr><td colspan="5" style="text-align:center;color:#7070a0;padding:24px">Nenhuma compra ainda</td></tr>'}
        </table>
      </div>

      <div class="table-card">
        <div class="table-head"><span class="table-title">🔑 Alterar Senha</span></div>
        <div style="padding:20px">
          <form method="POST" action="/painel/perfil/senha">
            <div class="form-group">
              <label>Senha atual</label>
              <input class="form-control" type="password" name="senha_atual" required>
            </div>
            <div class="form-group">
              <label>Nova senha</label>
              <input class="form-control" type="password" name="nova_senha" required minlength="6">
            </div>
            <div class="form-group">
              <label>Confirmar nova senha</label>
              <input class="form-control" type="password" name="confirmar_senha" required minlength="6">
            </div>
            <button class="btn btn-primary" style="width:100%" type="submit">💾 Salvar Nova Senha</button>
          </form>
        </div>
      </div>
    </div>

    <!-- Modal de conteúdo do produto -->
    <div id="modal-conteudo" style="display:none;position:fixed;inset:0;z-index:9999;background:#00000090;backdrop-filter:blur(4px);display:none;align-items:center;justify-content:center">
      <div style="background:#0d0d20;border:1px solid #7c3aed40;border-radius:16px;padding:28px;width:min(560px,94vw);max-height:85vh;overflow-y:auto;box-shadow:0 24px 60px #00000080">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
          <div style="font-size:16px;font-weight:800;color:#fff" id="modal-titulo">📦 Produto</div>
          <button onclick="fecharModal()" style="background:none;border:none;color:#7070a0;font-size:22px;cursor:pointer;line-height:1">✕</button>
        </div>
        <div style="background:#07071a;border:1px solid #00ff8830;border-radius:10px;padding:14px;margin-bottom:14px">
          <pre id="modal-conteudo-texto" style="font-size:13px;color:#e8e8ff;white-space:pre-wrap;word-break:break-all;margin:0"></pre>
        </div>
        <div style="display:flex;gap:8px">
          <button onclick="copiarModal()" class="btn btn-success" style="flex:1">📋 Copiar</button>
          <button onclick="fecharModal()" class="btn btn-ghost">Fechar</button>
        </div>
        <div id="modal-copy-ok" style="display:none;text-align:center;color:#00ff88;margin-top:8px;font-size:13px">✅ Copiado!</div>
      </div>
    </div>
    <script>
    function mostrarConteudo(conteudo, nome) {
      document.getElementById('modal-titulo').textContent = '📦 ' + nome;
      document.getElementById('modal-conteudo-texto').textContent = conteudo;
      const m = document.getElementById('modal-conteudo');
      m.style.display = 'flex';
    }
    function fecharModal() {
      document.getElementById('modal-conteudo').style.display = 'none';
    }
    function copiarModal() {
      const txt = document.getElementById('modal-conteudo-texto').textContent;
      navigator.clipboard.writeText(txt).then(() => {
        document.getElementById('modal-copy-ok').style.display = 'block';
        setTimeout(() => document.getElementById('modal-copy-ok').style.display = 'none', 2000);
      });
    }
    document.getElementById('modal-conteudo').addEventListener('click', function(e) {
      if (e.target === this) fecharModal();
    });
    </script>`;

  res.send(layout(user, '👤 Meu Perfil', body, 'perfil'));
});

router.post('/perfil/senha', auth.requireAuth, express.urlencoded({extended:false}), (req, res) => {
  const user = req.dashUser;
  const { senha_atual, nova_senha, confirmar_senha } = req.body;
  const { db } = getMainDb();

  const u = dashDb.getUsuario(user.id);
  if (u.password !== auth.hashPass(senha_atual))
    return res.redirect('/painel/perfil?msg=err');
  if (nova_senha !== confirmar_senha)
    return res.redirect('/painel/perfil?msg=err');
  if (nova_senha.length < 6)
    return res.redirect('/painel/perfil?msg=err');

  db.prepare('UPDATE dash_usuarios SET password=? WHERE id=?').run(auth.hashPass(nova_senha), user.id);
  res.redirect('/painel/perfil?msg=ok');
});

// ─── CONFIG MR ───────────────────────────────────────────────
router.use('/config-mr', require('./configMr'));

// ─── CLIENTES ────────────────────────────────────────────────
router.use('/clientes', require('./clientes'));

// ─── MEUS PEDIDOS ────────────────────────────────────────────
router.get('/meus-pedidos', auth.middlewareAba('meus_pedidos'), (req, res) => {
  const { db } = getMainDb();
  const user   = req.dashUser;
  const page   = Math.max(1, parseInt(req.query.page) || 1);
  const limit  = 20;
  const offset = (page - 1) * limit;

  const total   = db.prepare("SELECT COUNT(*) as c FROM pedidos WHERE usuario_id=? AND status='pago'").get(user.discord_id)?.c || 0;
  const pedidos = db.prepare(`
    SELECT p.*, pr.nome as produto_nome, pr.imagem_url as produto_img, pr.categoria
    FROM pedidos p
    LEFT JOIN produtos pr ON p.produto_id = pr.id
    WHERE p.usuario_id=? AND p.status='pago'
    ORDER BY p.pago_em DESC LIMIT ? OFFSET ?
  `).all(user.discord_id, limit, offset);

  const rows = pedidos.map(p => `
    <tr>
      <td><code style="font-size:11px">${p.id.slice(0,8).toUpperCase()}</code></td>
      <td>${p.produto_nome || '—'} ${p.categoria ? `<span class="badge badge-purple" style="font-size:10px">${p.categoria}</span>` : ''}</td>
      <td style="color:#86efac;font-weight:700">${fmtMoeda(p.valor_total)}</td>
      <td>${fmtDate(p.pago_em)}</td>
      <td>
        ${p.conteudo_entregue
          ? `<details><summary class="btn btn-sm btn-ghost" style="cursor:pointer">📦 Ver conteúdo</summary>
              <div style="margin-top:8px;padding:10px;background:#0a0a1e;border-radius:8px;font-size:12px;white-space:pre-wrap;word-break:break-all;max-width:300px">${p.conteudo_entregue}</div>
             </details>`
          : '<span style="color:#7070a0;font-size:12px">—</span>'}
      </td>
    </tr>`).join('');

  const body = `
    <div class="table-card">
      <div class="table-head">
        <span class="table-title">📦 Meus Pedidos <span class="badge badge-blue">${total}</span></span>
      </div>
      ${total === 0 ? `
        <div style="text-align:center;padding:64px;color:#7070a0">
          <div style="font-size:48px;margin-bottom:16px">🛒</div>
          <div style="font-size:18px;font-weight:700;margin-bottom:8px">Nenhuma compra ainda</div>
          <div style="font-size:13px">Acesse a <a href="/painel/loja" style="color:#a855f7">Loja</a> para comprar.</div>
        </div>` : `
      <table>
        <tr><th>Pedido</th><th>Produto</th><th>Valor</th><th>Data</th><th>Conteúdo</th></tr>
        ${rows}
      </table>
      ${pagination(page, total, limit, '/painel/meus-pedidos')}`}
    </div>`;

  res.send(layout(user, '📦 Meus Pedidos', body, 'meus_pedidos'));
});

// ─── REVENDEDOR — Loja com preços especiais ───────────────────
router.get('/revendedor', auth.middlewareAba('revendedor'), (req, res) => {
  const { db } = getMainDb();
  const user   = req.dashUser;
  const dashDb = require('./db');
  const search    = req.query.q   || '';
  let catFiltro   = req.query.cat || '';
  const view      = req.query.view || 'loja'; // 'loja' | 'historico'

  const ORDEM_CATS = ['Loja Free Fire','Spoofer','Mod Menu FiveM','External','Combos','Contas FiveM','Loja Fluxo','Loja Extra'];
  const catsNoDb   = db.prepare("SELECT DISTINCT categoria FROM produtos WHERE ativo=1 AND categoria IS NOT NULL").all().map(r => r.categoria).filter(Boolean);
  const categorias = [...ORDEM_CATS.filter(c => catsNoDb.includes(c)), ...catsNoDb.filter(c => !ORDEM_CATS.includes(c)).sort()];

  // Redireciona para primeira categoria se não tiver filtro
  if (view === 'loja' && !catFiltro && !search && categorias.length > 0) {
    return res.redirect(`/painel/revendedor?cat=${encodeURIComponent(categorias[0])}`);
  }

  // Buscar todos os preços de revendedor em um map
  const precosRev = dashDb.listarPrecosRevendedor();
  const precoMap  = {};
  precosRev.forEach(p => { precoMap[`${p.produto_id}__${p.variante_id||''}`] = p.preco; });

  function getPrecoRev(prodId, varId) {
    return precoMap[`${prodId}__${varId||''}`] ?? precoMap[`${prodId}__`] ?? null;
  }

  // ── Aba Loja ──────────────────────────────────────────────────
  let lojaHtml = '';
  if (view !== 'historico') {
    let whereParts = ['p.ativo=1'];
    if (search)    whereParts.push(`p.nome LIKE '%${search.replace(/'/g,"''")}%'`);
    if (catFiltro) whereParts.push(`p.categoria='${catFiltro.replace(/'/g,"''")}'`);
    const where = 'WHERE ' + whereParts.join(' AND ');

    const prods = db.prepare(`
      SELECT p.*, COUNT(v.id) as variantes
      FROM produtos p
      LEFT JOIN variantes_produto v ON v.produto_id=p.id AND v.ativo=1
      ${where} GROUP BY p.id ORDER BY p.categoria ASC, p.nome ASC
    `).all();

    const grupos = {};
    for (const p of prods) {
      const cat = p.categoria || 'Geral';
      if (!grupos[cat]) grupos[cat] = [];
      grupos[cat].push(p);
    }

    const proxy = (url) => `https://images.weserv.nl/?url=${encodeURIComponent(url)}&w=400&output=webp&maxage=1d`;
    const imgTag = (url, nome) => {
      if (!url) return '<div style="width:100%;height:150px;background:linear-gradient(135deg,#12122a,#1a1a35);display:flex;align-items:center;justify-content:center;font-size:48px">📦</div>';
      const fi = `<div style='width:100%;height:150px;background:linear-gradient(135deg,#12122a,#1a1a35);display:flex;align-items:center;justify-content:center;font-size:48px'>📦</div>`;
      return `<img src="${url}" loading="lazy" style="width:100%;height:150px;object-fit:cover" onerror="if(!this.dataset.tried){this.dataset.tried=1;this.src='${proxy(url).replace(/'/g,"\\'")}'}else{this.parentElement.innerHTML='${fi.replace(/'/g,"\\'")}'}">`;
    };

    for (const [cat, catProds] of Object.entries(grupos)) {
      const cards = catProds.map(p => {
        const variantes = db.prepare('SELECT * FROM variantes_produto WHERE produto_id=? AND ativo=1 ORDER BY ordem ASC').all(p.id);
        const precoNormal = variantes.length ? Math.min(...variantes.map(v => v.preco)) : p.preco;
        const precoRev    = getPrecoRev(p.id, variantes.length === 1 ? variantes[0].id : null) ?? precoNormal;
        const temDesconto = precoRev < precoNormal;
        return `
          <div class="produto-card" onclick="window.location='/painel/revendedor/comprar/${p.id}'">
            <div class="produto-img">${imgTag(p.imagem_url, p.nome)}</div>
            <div class="produto-body">
              <div class="produto-nome">${p.nome}</div>
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap">
                <span class="produto-preco" style="margin-bottom:0">${fmtMoeda(precoRev)}</span>
                ${temDesconto ? `<span style="font-size:11px;color:#7070a0;text-decoration:line-through">${fmtMoeda(precoNormal)}</span>` : ''}
              </div>
              <div class="produto-desc">${p.descricao || ''}</div>
              <a href="/painel/revendedor/comprar/${p.id}" class="btn btn-primary" style="width:100%;font-size:12px;background:linear-gradient(135deg,#f97316,#ea580c)" onclick="event.stopPropagation()">🏪 Comprar</a>
            </div>
          </div>`;
      }).join('');
      lojaHtml += `
        <div style="margin-bottom:32px">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
            <div style="height:2px;flex:0 0 24px;background:linear-gradient(90deg,#f97316,transparent)"></div>
            <span style="font-size:16px;font-weight:800;color:#fff;text-transform:uppercase;letter-spacing:1px">${cat}</span>
            <div style="height:2px;flex:1;background:linear-gradient(90deg,#f9731620,transparent)"></div>
          </div>
          <div class="produtos-grid">${cards}</div>
        </div>`;
    }
  }

  // ── Aba Histórico ─────────────────────────────────────────────
  let historicoHtml = '';
  if (view === 'historico') {
    const pedidos = db.prepare(`
      SELECT p.*, pr.nome as produto_nome, pr.preco as preco_normal
      FROM pedidos p
      LEFT JOIN produtos pr ON p.produto_id = pr.id
      WHERE p.usuario_id=? AND p.status='pago'
      ORDER BY p.pago_em DESC
    `).all(user.discord_id);

    let totalPago = 0, totalEconomy = 0;
    const rows = pedidos.map(p => {
      const precoNormal = (p.preco_normal || p.valor_unit || p.valor_total) * (p.quantidade || 1);
      const economia    = Math.max(0, precoNormal - p.valor_total);
      totalPago      += p.valor_total;
      totalEconomy   += economia;
      return `<tr>
        <td><code style="font-size:11px">${p.id.slice(0,8).toUpperCase()}</code></td>
        <td>${p.produto_nome || '—'}</td>
        <td>${p.quantidade || 1}</td>
        <td style="color:#86efac;font-weight:700">${fmtMoeda(p.valor_total)}</td>
        <td style="color:#7070a0">${fmtMoeda(precoNormal)}</td>
        <td style="color:#00ff88;font-weight:700">${fmtMoeda(economia)}</td>
        <td>${fmtDate(p.pago_em)}</td>
      </tr>`;
    }).join('');

    historicoHtml = `
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:14px;margin-bottom:24px">
        <div class="stat-card" style="--glow-a:#f97316;--glow-b:#f59e0b">
          <div class="stat-label">Total Gasto</div>
          <div class="stat-value" style="color:#f97316">${fmtMoeda(totalPago)}</div>
        </div>
        <div class="stat-card" style="--glow-a:#00ff88;--glow-b:#34d399">
          <div class="stat-label">Economizado</div>
          <div class="stat-value" style="color:#00ff88">${fmtMoeda(totalEconomy)}</div>
        </div>
        <div class="stat-card" style="--glow-a:#7c3aed;--glow-b:#a855f7">
          <div class="stat-label">Compras</div>
          <div class="stat-value">${pedidos.length}</div>
        </div>
      </div>
      <div class="table-card">
        <div class="table-head"><span class="table-title">📋 Histórico de Compras</span></div>
        ${pedidos.length === 0 ? '<div style="text-align:center;padding:48px;color:#7070a0">Nenhuma compra ainda.</div>' : `
        <table>
          <tr><th>Pedido</th><th>Produto</th><th>Qtd</th><th>Pago</th><th>Preço Normal</th><th>Economia</th><th>Data</th></tr>
          ${rows}
        </table>`}
      </div>`;
  }

  const catTabs = categorias.map(c =>
    `<a href="/painel/revendedor?cat=${encodeURIComponent(c)}" class="btn btn-sm ${catFiltro===c?'btn-primary':'btn-ghost'}" style="${catFiltro===c?'background:linear-gradient(135deg,#f97316,#ea580c);border-color:#f97316':''}">${c}</a>`
  ).join('');

  const viewTabs = `
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:20px;align-items:center">
      <a href="/painel/revendedor?cat=${encodeURIComponent(categorias[0]||'')}" class="btn btn-sm ${view!=='historico'?'btn-primary':'btn-ghost'}">🛍️ Loja</a>
      <a href="/painel/revendedor?view=historico" class="btn btn-sm ${view==='historico'?'btn-primary':'btn-ghost'}">📋 Meu Histórico</a>
      ${['sub_dono','dono'].includes(user.cargo) ? `<a href="/painel/revendedor/precos" class="btn btn-sm btn-ghost" style="margin-left:auto;border-color:#f9731640;color:#f97316">🏷️ Editar Preços</a>` : ''}
    </div>`;

  const body = `
    ${viewTabs}
    ${view !== 'historico' ? `
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:20px">
      <form method="GET" style="display:flex;gap:8px">
        <input class="form-control" name="q" value="${search}" placeholder="Buscar produto..." style="max-width:260px">
      </form>
      <div style="display:flex;gap:6px;flex-wrap:wrap">${catTabs}</div>
    </div>
    ${lojaHtml || '<div style="text-align:center;color:#7070a0;padding:64px">📦 Nenhum produto disponível</div>'}` : historicoHtml}`;

  res.send(layout(user, '🏪 Revendedor', body, 'revendedor'));
});

// ─── REVENDEDOR — Comprar produto ────────────────────────────
router.get('/revendedor/comprar/:produtoId', auth.middlewareAba('revendedor'), (req, res) => {
  const { db } = getMainDb();
  const user   = req.dashUser;
  const dashDb = require('./db');
  const prod   = db.prepare('SELECT * FROM produtos WHERE id=? AND ativo=1').get(req.params.produtoId);
  if (!prod) return res.redirect('/painel/revendedor');

  const precosRev = dashDb.listarPrecosRevendedor();
  const precoMap  = {};
  precosRev.forEach(p => { precoMap[`${p.produto_id}__${p.variante_id||''}`] = p.preco; });
  const getPrecoRev = (prodId, varId) => precoMap[`${prodId}__${varId||''}`] ?? precoMap[`${prodId}__`] ?? null;

  const variantes  = db.prepare('SELECT * FROM variantes_produto WHERE produto_id=? AND ativo=1 ORDER BY ordem ASC').all(prod.id);
  const varOptions = variantes.map(v => {
    const disp   = db.prepare('SELECT COUNT(*) as c FROM estoque_variante WHERE variante_id=? AND usado=0').get(v.id)?.c || 0;
    const pRev   = getPrecoRev(prod.id, v.id) ?? v.preco;
    return `<option value="${v.id}" ${disp===0?'disabled':''}>${v.nome} — ${fmtMoeda(pRev)} ${disp===0?'(sem estoque)':'('+disp+' disp.)'}</option>`;
  }).join('');

  const precoBase  = variantes.length ? Math.min(...variantes.map(v => getPrecoRev(prod.id,v.id)??v.preco)) : (getPrecoRev(prod.id,null)??prod.preco);
  const precoNorm  = variantes.length ? Math.min(...variantes.map(v => v.preco)) : prod.preco;
  const temDesconto = precoBase < precoNorm;

  const imgSrc = prod.imagem_url || null;

  const body = `
    <a href="/painel/revendedor" class="btn btn-ghost btn-sm" style="margin-bottom:20px">← Voltar</a>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:28px">
      <div>
        ${imgSrc ? `<img src="${imgSrc}" style="width:100%;border-radius:14px;border:1px solid var(--border2)" onerror="this.style.display='none'">` : `<div style="width:100%;height:220px;background:linear-gradient(135deg,#12122a,#1a1a35);border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:64px">📦</div>`}
        <div style="margin-top:16px;padding:16px;background:var(--card2);border:1px solid var(--border);border-radius:12px">
          <div style="font-size:12px;color:#7070a0;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Categoria</div>
          <div style="font-weight:600">${prod.categoria||'Geral'}</div>
        </div>
      </div>
      <div>
        <h2 style="font-size:24px;font-weight:900;margin-bottom:8px;background:linear-gradient(135deg,#fff,#fbd38d);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">${prod.nome}</h2>
        <p style="color:#7070a0;margin-bottom:16px;line-height:1.6">${prod.descricao||''}</p>
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;background:#f9731615;border:1px solid #f9731640;padding:12px 16px;border-radius:10px">
          <span style="font-size:22px;font-weight:900;color:#f97316">${fmtMoeda(precoBase)}</span>
          ${temDesconto ? `<div><div style="color:#7070a0;font-size:12px">Preço normal: <span style="text-decoration:line-through">${fmtMoeda(precoNorm)}</span></div><div style="color:#00ff88;font-size:11px;font-weight:700">🏪 Preço revendedor</div></div>` : '<span style="color:#7070a0;font-size:12px">Preço revendedor</span>'}
        </div>
        <form method="POST" action="/painel/revendedor/finalizar">
          <input type="hidden" name="produto_id" value="${prod.id}">
          ${variantes.length ? `<div class="form-group"><label>Variante / Plano</label><select class="form-control" name="variante_id" required>${varOptions}</select></div>` : ''}
          <div class="form-group">
            <label>Quantidade</label>
            <div style="display:flex;align-items:center;gap:10px">
              <button type="button" onclick="ajustarQtd(-1)" class="btn btn-ghost btn-sm" style="width:36px;height:36px;padding:0;font-size:18px">−</button>
              <input class="form-control" id="qtd" name="quantidade" type="number" value="1" min="1" max="99" style="width:70px;text-align:center">
              <button type="button" onclick="ajustarQtd(1)" class="btn btn-ghost btn-sm" style="width:36px;height:36px;padding:0;font-size:18px">+</button>
            </div>
          </div>
          <button class="btn btn-primary" type="submit" style="width:100%;padding:14px;font-size:16px;background:linear-gradient(135deg,#f97316,#ea580c);box-shadow:0 4px 15px #f9731640">
            🏪 Comprar como Revendedor
          </button>
        </form>
      </div>
    </div>
    <script>function ajustarQtd(d){const i=document.getElementById('qtd');i.value=Math.max(1,Math.min(99,parseInt(i.value||1)+d));}</script>`;

  res.send(layout(user, `🏪 ${prod.nome}`, body, 'revendedor'));
});

router.post('/revendedor/finalizar', auth.middlewareAba('revendedor'), express.urlencoded({extended:false}), async (req, res) => {
  const { produto_id, variante_id, quantidade } = req.body;
  const user    = req.dashUser;
  const { db, Usuarios, Pedidos, Cupons } = getMainDb();
  const dashDb  = require('./db');
  const qtd     = Math.max(1, Math.min(99, parseInt(quantidade) || 1));

  try {
    Usuarios.garantir(user.discord_id, user.username);
    if (!user.discord_id || user.discord_id === '0') return res.redirect('/painel/revendedor?msg=err');

    const variante = variante_id ? db.prepare('SELECT * FROM variantes_produto WHERE id=?').get(variante_id) : null;
    const produto  = db.prepare('SELECT * FROM produtos WHERE id=? AND ativo=1').get(produto_id);
    if (!produto) return res.redirect('/painel/revendedor');

    // Preço revendedor
    const precosRev = dashDb.listarPrecosRevendedor();
    const precoMap  = {};
    precosRev.forEach(p => { precoMap[`${p.produto_id}__${p.variante_id||''}`] = p.preco; });
    const getP = (prodId, varId) => precoMap[`${prodId}__${varId||''}`] ?? precoMap[`${prodId}__`] ?? null;

    const precoBase = variante?.preco || produto.preco;
    const precoRev  = getP(produto_id, variante_id || null) ?? precoBase;
    const valorFinal = Math.max(0.01, precoRev * qtd);

    const pedidoId = Pedidos.criar({
      usuarioId:  user.discord_id,
      produtoId:  produto_id,
      quantidade: qtd,
      valorUnit:  precoRev,
      valorTotal: valorFinal,
      desconto:   Math.max(0, (precoBase - precoRev) * qtd),
      cupomUsado: null,
      metodoPag:  'pix',
    });
    db.prepare("UPDATE pedidos SET nota_fiscal=? WHERE id=?").run(JSON.stringify({ varianteId: variante_id||null, via:'revendedor', qtd }), pedidoId);

    const efi  = require('../systems/efi');
    const cobr = await efi.criarCobrancaPix({ valor: valorFinal, descricao: `${produto.nome} — MrStore Rev`, pedidoId, nomeCliente: user.username });
    const qr   = await efi.gerarQRCode(cobr.locId);
    db.prepare("UPDATE pedidos SET tx_id=?, qr_code=? WHERE id=?").run(cobr.txid, qr.qrcode, pedidoId);

    const { iniciarPollingPedidoDash: _polling } = require('./router');
    iniciarPollingPedidoDash(pedidoId, cobr.txid, user, produto, variante_id, null);
    res.redirect(`/painel/loja/pagar/${pedidoId}`);
  } catch (e) {
    console.error('[Revendedor Finalizar]', e.message);
    res.redirect('/painel/revendedor?msg=err');
  }
});

// ─── PREÇOS REVENDEDOR — bulk save ────────────────────────────
router.get('/revendedor/precos', auth.middlewareAba('config_mr'), (req, res) => {
  const { db } = getMainDb();
  const user   = req.dashUser;
  const dashDb = require('./db');
  const msg    = req.query.msg || '';

  const produtos = db.prepare('SELECT * FROM produtos WHERE ativo=1 ORDER BY categoria, nome').all();
  const precos   = dashDb.listarPrecosRevendedor();
  const precoMap = {};
  precos.forEach(p => { precoMap[`${p.produto_id}__${p.variante_id||''}`] = p.preco; });

  // Agrupar por categoria
  const grupos = {};
  for (const p of produtos) {
    const cat = p.categoria || 'Geral';
    if (!grupos[cat]) grupos[cat] = [];
    grupos[cat].push(p);
  }

  let idx = 0;
  let hiddens = '';
  let tableRows = '';

  for (const [cat, catProds] of Object.entries(grupos)) {
    tableRows += `<tr><td colspan="4" style="background:rgba(109,40,217,0.1);color:#c4b5fd;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;padding:8px 16px">${cat}</td></tr>`;
    for (const p of catProds) {
      const variantes = db.prepare('SELECT * FROM variantes_produto WHERE produto_id=? AND ativo=1 ORDER BY ordem').all(p.id);
      if (variantes.length === 0) {
        const precoAtual = precoMap[`${p.id}__`] ?? '';
        hiddens += `<input type="hidden" name="pid_${idx}" value="${p.id}"><input type="hidden" name="vid_${idx}" value="">`;
        tableRows += `<tr>
          <td style="font-weight:600;color:#fff">${p.nome}</td>
          <td style="color:#5a5a90">—</td>
          <td style="color:#00e87a;font-weight:600">${fmtMoeda(p.preco)}</td>
          <td><input class="form-control" type="number" name="preco_${idx}" step="0.01" min="0" value="${precoAtual}" placeholder="Deixe em branco p/ desativar" style="width:180px;padding:7px 12px"></td>
        </tr>`;
        idx++;
      } else {
        for (const v of variantes) {
          const precoAtual = precoMap[`${p.id}__${v.id}`] ?? '';
          hiddens += `<input type="hidden" name="pid_${idx}" value="${p.id}"><input type="hidden" name="vid_${idx}" value="${v.id}">`;
          tableRows += `<tr>
            <td style="color:#e8e8ff">${p.nome}</td>
            <td style="color:#a78bfa;font-weight:500">${v.nome}</td>
            <td style="color:#00e87a;font-weight:600">${fmtMoeda(v.preco)}</td>
            <td><input class="form-control" type="number" name="preco_${idx}" step="0.01" min="0" value="${precoAtual}" placeholder="Deixe em branco p/ desativar" style="width:180px;padding:7px 12px"></td>
          </tr>`;
          idx++;
        }
      }
    }
  }

  const body = `
    <a href="/painel/revendedor" class="btn btn-ghost btn-sm" style="margin-bottom:20px">← Voltar</a>
    ${msg==='ok' ? `<div class="alert alert-success">✅ Preços salvos com sucesso!</div>` : ''}
    ${msg==='err' ? `<div class="alert alert-error">❌ Erro ao salvar.</div>` : ''}
    <form method="POST" action="/painel/revendedor/precos/bulk">
      ${hiddens}
      <input type="hidden" name="total" value="${idx}">
      <div class="table-card">
        <div class="table-head">
          <span class="table-title">🏷️ Preços Revendedor</span>
          <span style="font-size:12px;color:#5a5a90">Deixe em branco para usar o preço normal. Preencha para dar desconto.</span>
        </div>
        <table>
          <tr><th>Produto</th><th>Variante</th><th>Preço Normal</th><th>Preço Revendedor</th></tr>
          ${tableRows}
        </table>
      </div>
      <div style="position:sticky;bottom:20px;display:flex;justify-content:flex-end;padding:16px 0">
        <button class="btn btn-primary" type="submit" style="padding:14px 32px;font-size:15px;box-shadow:0 8px 30px rgba(109,40,217,0.5)">
          💾 Salvar Todos os Preços
        </button>
      </div>
    </form>`;

  res.send(layout(user, '🏷️ Preços Revendedor', body, 'config_mr'));
});

router.post('/revendedor/precos/bulk', auth.middlewareAba('config_mr'), express.urlencoded({extended:false}), (req, res) => {
  const dashDb = require('./db');
  const total  = parseInt(req.body.total) || 0;
  try {
    for (let i = 0; i < total; i++) {
      const prodId  = req.body[`pid_${i}`];
      const varId   = req.body[`vid_${i}`] || null;
      const precoStr = (req.body[`preco_${i}`] || '').trim();
      if (!prodId) continue;
      if (!precoStr) {
        // Campo vazio — remover preço se existia
        const { db } = getMainDb();
        db.prepare('DELETE FROM dash_precos_revendedor WHERE produto_id=? AND (variante_id=? OR (variante_id IS NULL AND ? IS NULL))')
          .run(prodId, varId, varId);
      } else {
        const p = parseFloat(precoStr);
        if (!isNaN(p) && p > 0) {
          dashDb.salvarPrecoRevendedor(prodId, varId, p, req.dashUser.username);
        }
      }
    }
    res.redirect('/painel/revendedor/precos?msg=ok');
  } catch (e) {
    console.error('[Preços Rev Bulk]', e.message);
    res.redirect('/painel/revendedor/precos?msg=err');
  }
});

// ─── DESLIGAR PRODUTO (toggle ativo no site) ──────────────────
router.post('/produtos/:id/toggle', auth.middlewareAba('config_mr'), (req, res) => {
  const { db } = getMainDb();
  const user   = req.dashUser;
  if (!['sub_dono','dono'].includes(user.cargo)) return res.status(403).send('Sem permissão');
  const prod = db.prepare('SELECT ativo FROM produtos WHERE id=?').get(req.params.id);
  if (!prod) return res.redirect('/painel/config-mr?sec=produtos&msg=err');
  db.prepare('UPDATE produtos SET ativo=? WHERE id=?').run(prod.ativo ? 0 : 1, req.params.id);
  res.redirect('/painel/config-mr?sec=produtos&msg=ok');
});

module.exports = router;
