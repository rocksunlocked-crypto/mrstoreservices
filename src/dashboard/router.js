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
const CARGOS       = ['cliente','staff','resp_staff','sub_dono','dono'];

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
  // Clientes vão direto pra loja, outros pro overview
  const destino = user.cargo === 'cliente' ? '/painel/loja' : '/painel';
  res.redirect(destino);
});

// ─── CADASTRO ────────────────────────────────────────────────
router.get('/cadastro', (req, res) => {
  const err = req.query.err || '';
  const msgs = {
    exists: '❌ Usuário ou Discord ID já cadastrado.',
    invalid: '❌ Preencha todos os campos corretamente.',
    discord: '❌ ID do Discord inválido (deve ser um número).',
    noserver: '⚠️ Você precisa estar no servidor Discord para se cadastrar. <a href="' + GUILD_INVITE + '" style="color:#a855f7">Entrar no servidor</a>',
  };
  res.send(loginLayout('Cadastro', `
    <div class="auth-title">Criar conta</div>
    <div class="auth-sub">Preencha os dados para solicitar acesso</div>
    ${err ? alert('error', msgs[err] || err) : ''}
    <form method="POST" action="/painel/cadastro">
      <div class="form-group"><label>Usuário</label><input class="form-control" name="username" required autofocus minlength="3" maxlength="30"></div>
      <div class="form-group"><label>Senha</label><input class="form-control" type="password" name="password" required minlength="6"></div>
      <div class="form-group"><label>ID do Discord <span style="color:#7878a0;font-weight:400;text-transform:none">(Modo Desenvolvedor → copiar ID)</span></label><input class="form-control" name="discord_id" required pattern="[0-9]+" placeholder="Ex: 123456789012345678"></div>
      <button class="btn btn-primary" style="width:100%;margin-top:4px" type="submit">Solicitar Acesso</button>
    </form>
    <div class="auth-switch">Já tem conta? <a href="/painel/login">Entrar</a></div>
  `));
});

router.post('/cadastro', express.urlencoded({ extended: false }), async (req, res) => {
  const { username, password, discord_id } = req.body;
  if (!username?.trim() || !password || !discord_id?.trim())
    return res.redirect('/painel/cadastro?err=invalid');
  if (!/^\d+$/.test(discord_id.trim()))
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

// ─── VISÃO GERAL ─────────────────────────────────────────────
router.get('/', auth.middlewareAba('overview'), (req, res) => {
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
router.get('/loja', auth.middlewareAba('loja'), (req, res) => {
  const { db } = getMainDb();
  const user   = req.dashUser;
  const search = req.query.q || '';
  const msg    = req.query.msg || '';

  const where = search ? `WHERE p.nome LIKE '%${search.replace(/'/g,"''")}%' AND p.ativo=1` : 'WHERE p.ativo=1';
  const prods = db.prepare(`
    SELECT p.*, COUNT(v.id) as variantes
    FROM produtos p
    LEFT JOIN variantes_produto v ON v.produto_id=p.id AND v.ativo=1
    ${where} GROUP BY p.id ORDER BY p.destaque DESC, p.vendas DESC
  `).all();

  const cards = prods.map(p => {
    const variantes = db.prepare('SELECT * FROM variantes_produto WHERE produto_id=? AND ativo=1 ORDER BY ordem ASC').all(p.id);
    const varOptions = variantes.length
      ? `<select class="form-control" name="variante_id" style="margin-bottom:10px;font-size:12px">
          ${variantes.map(v => `<option value="${v.id}">${v.nome} — ${fmtMoeda(v.preco)}</option>`).join('')}
         </select>`
      : '';
    const precoMin = variantes.length ? Math.min(...variantes.map(v => v.preco)) : p.preco;

    return `<div class="produto-card">
      <div class="produto-img">${p.imagem_url ? `<img src="${p.imagem_url}" alt="${p.nome}" loading="lazy">` : '📦'}</div>
      <div class="produto-body">
        <div class="produto-nome">${p.nome}</div>
        <div class="produto-preco">${fmtMoeda(precoMin)}${variantes.length > 1 ? '<span style="font-size:11px;color:#7878a0"> em diante</span>' : ''}</div>
        <div class="produto-desc">${p.descricao || ''}</div>
        ${varOptions}
        <a href="/painel/loja/comprar/${p.id}" class="btn btn-primary" style="width:100%;font-size:12px">🛒 Comprar</a>
      </div>
    </div>`;
  }).join('');

  const body = `
    ${msg === 'ok' ? alert('success', '✅ Pedido realizado! Acompanhe em Pedidos.') : ''}
    <div class="search-row">
      <form method="GET">
        <input class="form-control" name="q" value="${search}" placeholder="Buscar produto..." style="width:280px">
      </form>
    </div>
    ${prods.length ? `<div class="produtos-grid">${cards}</div>` : '<div style="text-align:center;color:#7878a0;padding:48px">Nenhum produto disponível</div>'}`;

  res.send(layout(user, '🛍️ Loja', body, 'loja'));
});

router.get('/loja/comprar/:produtoId', auth.middlewareAba('loja'), (req, res) => {
  const { db } = getMainDb();
  const user   = req.dashUser;
  const prod   = db.prepare('SELECT * FROM produtos WHERE id=? AND ativo=1').get(req.params.produtoId);
  if (!prod) return res.redirect('/painel/loja');

  const variantes = db.prepare('SELECT * FROM variantes_produto WHERE produto_id=? AND ativo=1 ORDER BY ordem ASC').all(prod.id);
  const varOptions = variantes.map(v => {
    const disp = db.prepare('SELECT COUNT(*) as c FROM estoque_variante WHERE variante_id=? AND usado=0').get(v.id)?.c || 0;
    return `<option value="${v.id}" ${disp===0?'disabled':''}>
      ${v.nome} — ${fmtMoeda(v.preco)} ${disp===0?'(sem estoque)':'('+disp+' disp.)'}
    </option>`;
  }).join('');

  const body = `
    <a href="/painel/loja" class="btn btn-ghost btn-sm" style="margin-bottom:20px">← Voltar</a>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:16px">
      <div>
        ${prod.imagem_url ? `<img src="${prod.imagem_url}" style="width:100%;border-radius:12px;border:1px solid var(--border)">` : `<div style="width:100%;height:200px;background:var(--card2);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:60px">📦</div>`}
      </div>
      <div>
        <h2 style="font-size:22px;font-weight:800;margin-bottom:8px">${prod.nome}</h2>
        <p style="color:#7878a0;margin-bottom:20px">${prod.descricao || ''}</p>
        <form method="POST" action="/painel/loja/finalizar">
          <input type="hidden" name="produto_id" value="${prod.id}">
          <div class="form-group">
            <label>Variante / Plano</label>
            <select class="form-control" name="variante_id" required>${varOptions || `<option value="">Sem variantes</option>`}</select>
          </div>
          <div class="form-group">
            <label>Cupom (opcional)</label>
            <input class="form-control" name="cupom" placeholder="Código do cupom">
          </div>
          <div class="form-group">
            <label>Observação</label>
            <textarea class="form-control" name="obs" rows="2" placeholder="Alguma observação?"></textarea>
          </div>
          <button class="btn btn-primary" style="width:100%" type="submit">💳 Finalizar Pedido</button>
        </form>
      </div>
    </div>`;

  res.send(layout(user, `🛍️ ${prod.nome}`, body, 'loja'));
});

router.post('/loja/finalizar', auth.middlewareAba('loja'), express.urlencoded({ extended: false }), async (req, res) => {
  const { produto_id, variante_id, cupom, obs } = req.body;
  const user = req.dashUser;
  const { db, Usuarios, Pedidos, Cupons } = getMainDb();

  try {
    Usuarios.garantir(user.discord_id, user.username);
    const variante = variante_id ? db.prepare('SELECT * FROM variantes_produto WHERE id=?').get(variante_id) : null;
    const produto  = db.prepare('SELECT * FROM produtos WHERE id=?').get(produto_id);
    if (!produto) return res.redirect('/painel/loja');

    let valor    = variante?.preco || produto.preco;
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

    const valorFinal = Math.max(0.01, valor - desconto);
    const pedidoId   = Pedidos.criar({
      usuarioId: user.discord_id,
      produtoId: produto_id,
      quantidade: 1,
      valorUnit:  valor,
      valorTotal: valorFinal,
      desconto,
      cupomUsado,
      metodoPag: 'pix',
    });

    if (cupomObj) Cupons.usar(cupomObj.id, user.discord_id, pedidoId);

    // Gerar cobrança PIX
    const efi  = require('../systems/efi');
    const cobr = await efi.criarCobrancaPix({
      valor:       valorFinal,
      descricao:   `${produto.nome} — MrStore`,
      pedidoId,
      nomeCliente: user.username,
    });
    const qr = await efi.gerarQRCode(cobr.locId);

    // Salvar txid no pedido
    db.prepare("UPDATE pedidos SET tx_id=?, qr_code=? WHERE id=?").run(cobr.txid, qr.qrcode, pedidoId);

    // Iniciar polling automático (50s, 36 tentativas = 30 min)
    iniciarPollingPedidoDash(pedidoId, cobr.txid, user, produto, variante_id);

    res.redirect(`/painel/loja/pagar/${pedidoId}`);
  } catch (e) {
    console.error('[Dashboard Loja PIX]', e.message);
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

// Helper: confirmar pagamento e entregar produto no Discord
async function confirmarPedidoDash(pedidoId, db) {
  try {
    const { Pedidos, Usuarios } = getMainDb();
    const pedido = Pedidos.get(pedidoId);
    if (!pedido || pedido.status !== 'pendente') return;

    db.prepare("UPDATE pedidos SET status='pago', pago_em=strftime('%s','now') WHERE id=?").run(pedidoId);
    const u = Usuarios.get(pedido.usuario_id);
    if (u) {
      const novoGasto = (u.total_gasto||0) + pedido.valor_total;
      Usuarios.atualizar(pedido.usuario_id, { total_gasto: novoGasto, total_compras: (u.total_compras||0)+1 });
      Usuarios.addPontos(pedido.usuario_id, Math.floor(pedido.valor_total));
    }

    const clientRef = require('../utils/clientRef');
    const client    = clientRef.getClient();
    if (client) {
      const { processarEntrega } = require('../systems/loja');
      await processarEntrega(Pedidos.get(pedidoId), client);
    }

    const { logVenda } = require('../utils/canalVendas');
    if (client) await logVenda(client, { ...Pedidos.get(pedidoId), status:'pago', metodo_pag:'pix' }, { atendente: null });
  } catch (e) { console.error('[Dashboard confirmarPedido]', e.message); }
}

// Polling automático no servidor (30 min)
function iniciarPollingPedidoDash(pedidoId, txid, user, produto, varianteId) {
  const { db } = getMainDb();
  let tentativas = 0;
  const timer = setInterval(async () => {
    tentativas++;
    try {
      const efi    = require('../systems/efi');
      const status = await efi.consultarCobranca(txid);
      if (status.pago) {
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

router.post('/solicitacoes/:id/aprovar', auth.middlewareAba('solicitacoes'), (req, res) => {
  dashDb.responderSolicitacao(req.params.id, 'aprovado', req.dashUser.username);
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

  const body = `
    <div class="search-row"><form method="GET"><input class="form-control" name="q" value="${search}" placeholder="Buscar..."></form></div>
    <div class="table-card">
      <div class="table-head"><span class="table-title">📦 Produtos (${total})</span></div>
      <table>
        <tr><th>Nome</th><th>Categoria</th><th>Preço</th><th>Variantes</th><th>Vendas</th><th>Status</th><th>Ações</th></tr>
        ${rows.map(p => `<tr>
          <td><strong>${p.nome}</strong></td>
          <td>${p.categoria||'—'}</td>
          <td>${fmtMoeda(p.preco)}</td>
          <td>${p.variantes}</td>
          <td>${p.vendas||0}</td>
          <td>${badge(p.ativo?'ativo':'inativo')}</td>
          <td>
            <form method="POST" action="/painel/produtos/${p.id}/toggle" style="display:inline">
              <button class="btn btn-sm ${p.ativo?'btn-danger':'btn-success'}" type="submit">${p.ativo?'Desativar':'Ativar'}</button>
            </form>
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
    <div class="table-card" style="margin-bottom:24px">
      <div class="table-head"><span class="table-title">➕ Novo Cupom</span></div>
      <div style="padding:20px">
        <form method="POST" action="/painel/cupons/criar" class="form-grid">
          <div class="form-group"><label>Código</label><input class="form-control" name="codigo" placeholder="Gerado auto se vazio"></div>
          <div class="form-group"><label>Tipo</label><select class="form-control" name="tipo"><option value="percentual">% Percentual</option><option value="fixo">R$ Fixo</option></select></div>
          <div class="form-group"><label>Valor</label><input class="form-control" type="number" step="0.01" name="valor" required></div>
          <div class="form-group"><label>Usos Máx.</label><input class="form-control" type="number" name="usos" value="100"></div>
          <div class="form-group"><label>Validade (dias)</label><input class="form-control" type="number" name="validade" value="30"></div>
          <div class="form-group" style="align-self:flex-end"><button class="btn btn-primary" style="width:100%" type="submit">Criar</button></div>
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
    const {criarCupom,gerarCodigoCupom}=require('../systems/cupons');
    const{codigo,tipo,valor,usos,validade}=req.body;
    criarCupom({codigo:codigo||gerarCodigoCupom(),tipo:tipo||'percentual',valor:parseFloat(valor),usosMax:parseInt(usos)||100,validadeDias:parseInt(validade)||30,criadoPor:req.dashUser.username});
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
  const user = req.dashUser;
  const users = dashDb.listarUsuarios();
  const msg   = req.query.msg || '';

  const usersRows = users.map(u => {
    const ci = CARGO_LABELS[u.cargo] || CARGO_LABELS.cliente;
    return `<tr>
      <td><strong>${u.username}</strong>${!u.aprovado?'<span class="badge badge-yellow" style="margin-left:6px;font-size:10px">pendente</span>':''}</td>
      <td><code style="font-size:11px">${u.discord_id}</code></td>
      <td><span style="color:${ci.color}">${ci.icon} ${ci.label}</span></td>
      <td>${u.ip_bloqueado ? `<code style="font-size:10px">${u.ip_bloqueado}</code>` : '<span style="color:#7878a0">—</span>'}</td>
      <td>${fmtDate(u.ultimo_acesso)}</td>
      <td>
        <div style="display:flex;gap:4px;flex-wrap:wrap">
          ${!u.aprovado ? `
            <form method="POST" action="/painel/gerenciar/usuarios/${u.id}/aprovar" style="display:inline">
              <button class="btn btn-sm btn-success">✅</button>
            </form>
            <form method="POST" action="/painel/gerenciar/usuarios/${u.id}/recusar" style="display:inline">
              <button class="btn btn-sm btn-danger">❌</button>
            </form>` : ''}
          <form method="POST" action="/painel/gerenciar/usuarios/${u.id}/cargo" style="display:inline;display:flex;gap:4px">
            <select class="form-control" name="cargo" style="width:120px;height:28px;font-size:11px;padding:2px 8px">
              ${CARGOS.map(c=>`<option value="${c}" ${u.cargo===c?'selected':''}>${c}</option>`).join('')}
            </select>
            <button class="btn btn-sm btn-ghost" type="submit">💾</button>
          </form>
          ${u.ip_bloqueado ? `
            <form method="POST" action="/painel/gerenciar/usuarios/${u.id}/reset-ip" style="display:inline">
              <button class="btn btn-sm btn-ghost" title="Reset IP">🔄 IP</button>
            </form>` : ''}
        </div>
      </td>
    </tr>`;
  }).join('');

  // Permissões por cargo
  const ABAS_LISTA = Object.keys(ABAS_INFO);
  const permTable = CARGOS.filter(c => c !== 'dono').map(cargo => {
    const perms = dashDb.getPermissoes(cargo);
    const checks = ABAS_LISTA.map(aba =>
      `<td style="text-align:center">
        <form method="POST" action="/painel/gerenciar/permissoes" style="display:inline">
          <input type="hidden" name="cargo" value="${cargo}">
          <input type="hidden" name="aba" value="${aba}">
          <input type="hidden" name="val" value="${perms[aba]?'0':'1'}">
          <button type="submit" style="background:none;border:none;cursor:pointer;font-size:16px" title="${perms[aba]?'Remover':'Conceder'}">${perms[aba]?'✅':'❌'}</button>
        </form>
      </td>`
    ).join('');
    const ci = CARGO_LABELS[cargo];
    return `<tr><td><span style="color:${ci.color}">${ci.icon} ${ci.label}</span></td>${checks}</tr>`;
  }).join('');

  const body = `
    ${msg==='ok'?alert('success','✅ Feito!'):msg==='err'?alert('error','❌ Erro.'):''}

    <div class="table-card" style="margin-bottom:28px">
      <div class="table-head"><span class="table-title">👥 Usuários do Painel (${users.length})</span></div>
      <table>
        <tr><th>Usuário</th><th>Discord ID</th><th>Cargo</th><th>IP Registrado</th><th>Último acesso</th><th>Ações</th></tr>
        ${usersRows || '<tr><td colspan="6" style="text-align:center;color:#7878a0;padding:24px">Nenhum</td></tr>'}
      </table>
    </div>

    <div class="table-card">
      <div class="table-head"><span class="table-title">🔐 Permissões por Cargo</span><span style="font-size:12px;color:#7878a0">Clique no ✅/❌ para alternar</span></div>
      <div style="overflow-x:auto">
        <table>
          <tr><th>Cargo</th>${ABAS_LISTA.map(a=>`<th style="text-align:center">${ABAS_INFO[a].icon}<br><span style="font-size:10px">${a}</span></th>`).join('')}</tr>
          ${permTable}
        </table>
      </div>
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
router.post('/gerenciar/permissoes', auth.middlewareAba('gerenciar'), express.urlencoded({extended:false}), (req, res) => {
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

    <div style="display:grid;grid-template-columns:300px 1fr;gap:24px;margin-bottom:28px">
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

    <div style="display:grid;grid-template-columns:1fr 340px;gap:24px">
      <div class="table-card">
        <div class="table-head"><span class="table-title">🛍️ Últimas Compras</span></div>
        <table>
          <tr><th>Produto</th><th>Valor</th><th>Data</th><th>Status</th><th></th></tr>
          ${pedidos.length ? pedidos.map(p => `<tr>
            <td style="display:flex;align-items:center;gap:10px">
              ${p.produto_img ? `<img src="${p.produto_img}" style="width:36px;height:36px;border-radius:6px;object-fit:cover">` : '<div style="width:36px;height:36px;border-radius:6px;background:var(--card2);display:flex;align-items:center;justify-content:center">📦</div>'}
              <span>${p.produto_nome || '—'}</span>
            </td>
            <td style="color:#86efac;font-weight:700">${fmtMoeda(p.valor_total)}</td>
            <td>${fmtDate(p.criado_em)}</td>
            <td>${badge(p.status)}</td>
            <td><a href="/painel/loja" class="btn btn-sm btn-ghost">Ver loja →</a></td>
          </tr>`).join('') : '<tr><td colspan="5" style="text-align:center;color:#7878a0;padding:24px">Nenhuma compra ainda</td></tr>'}
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
    </div>`;

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

module.exports = router;
