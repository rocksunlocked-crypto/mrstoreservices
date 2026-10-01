/**
 * dashboard/configMr.js — Aba Configurações Mr
 * Todas as configurações do bot acessíveis via web
 */
const express = require('express');
const router  = express.Router();
const auth    = require('./auth');
const { layout, badge, fmtDate, fmtMoeda } = require('./layout');

function getMainDb() { return require('../database/database'); }
function getClient() { return require('../utils/clientRef').getClient(); }
function alert(type, msg) { return `<div class="alert alert-${type}">${msg}</div>`; }

const mid = auth.middlewareAba('config_mr');

// ─── GET principal ─────────────────────────────────────────────
router.get('/', mid, (req, res) => {
  const { db, Config } = getMainDb();
  const user = req.dashUser;
  const msg  = req.query.msg || '';
  const sec  = req.query.sec || 'geral';

  // Ler configs
  const lojaAberta  = Config.get('loja_aberta') !== false;
  const manutencao  = Config.get('manutencao')  === true || Config.get('manutencao') === '1';
  const nomeLoja    = Config.get('nome_loja')   || 'Máximo Store';
  const metaDia     = Config.get('meta_dia')    || '0';
  const cashback    = Config.get('cashback_pct') || '5';
  const msgBoasVindas = Config.get('msg_boas_vindas') || '';
  const canalVendas = Config.get('canal_vendas_id') || '';
  const canalCupons = Config.get('canal_cupons_id') || '';
  const taxaAfil    = Config.get('taxa_afiliado') || '5';
  const taxaN2      = Config.get('taxa_afil_n2')  || '2';
  const taxaBonus   = Config.get('taxa_afil_n1_bonus') || '1';
  const minSaque    = Config.get('min_saque_afiliado') || '20';
  const caixaCd     = Config.get('caixa_cooldown') || '6';

  // Produtos para flash sale e envio
  const produtos  = db.prepare('SELECT id,nome,preco,ativo FROM produtos ORDER BY nome ASC').all();
  const prods0    = produtos.filter(p => p.ativo);

  // Afiliados
  const afiliados = db.prepare(`
    SELECT u.discord_id, u.nome, a.codigo, a.nivel, a.ganhos_totais, a.saldo_pendente
    FROM usuarios u
    JOIN afiliados a ON a.discord_id = u.discord_id
    ORDER BY a.ganhos_totais DESC LIMIT 20
  `).all().catch ? [] : (() => { try { return db.prepare(`SELECT u.discord_id, u.nome, u.codigo_afil FROM usuarios u WHERE u.codigo_afil IS NOT NULL ORDER BY u.ganhos_afil DESC LIMIT 20`).all(); } catch { return []; } })();

  // Flash sales ativas
  let flashAtivas = [];
  try { const { getFlashSalesAtivas } = require('../systems/flashsale'); flashAtivas = getFlashSalesAtivas?.() || []; } catch {}

  const sections = [
    { id:'geral',    label:'⚙️ Geral'        },
    { id:'loja',     label:'🛒 Loja'          },
    { id:'produtos', label:'📦 Produtos'      },
    { id:'operacoes',label:'🔧 Operações'     },
    { id:'usuarios', label:'👥 Usuários'      },
    { id:'afiliados',label:'🤝 Afiliados'     },
    { id:'anuncios', label:'📣 Anúncios'      },
    { id:'caixas',   label:'🎁 Caixas'        },
  ];

  const tabs = sections.map(s =>
    `<a href="/painel/config-mr?sec=${s.id}" class="btn btn-sm ${sec===s.id?'btn-primary':'btn-ghost'}">${s.label}</a>`
  ).join('');

  const msgHtml = {
    ok:  alert('success','✅ Configuração salva com sucesso!'),
    err: alert('error',  '❌ Erro ao salvar. Verifique os dados.'),
    sent:alert('success','✅ Ação executada com sucesso!'),
  }[msg] || '';

  // ── Seções ──────────────────────────────────────────────────
  let content = '';

  if (sec === 'geral') {
    content = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div class="stat-card" style="--glow-a:${lojaAberta?'22c55e':'ef4444'};--glow-b:${lojaAberta?'16a34a':'dc2626'}">
          <div class="stat-label">Status da Loja</div>
          <div class="stat-value" style="color:${lojaAberta?'#00ff88':'#ff4455'};font-size:20px">${lojaAberta?'🟢 Aberta':'🔴 Fechada'}</div>
          <form method="POST" action="/painel/config-mr/toggle-loja" style="margin-top:12px">
            <button class="btn ${lojaAberta?'btn-danger':'btn-success'}" type="submit">${lojaAberta?'🔴 Fechar Loja':'🟢 Abrir Loja'}</button>
          </form>
        </div>
        <div class="stat-card" style="--glow-a:${manutencao?'f59e0b':'7c3aed'};--glow-b:${manutencao?'d97706':'5b21b6'}">
          <div class="stat-label">Manutenção</div>
          <div class="stat-value" style="color:${manutencao?'#fde68a':'#c4b5fd'};font-size:20px">${manutencao?'🔧 Ativa':'✅ Normal'}</div>
          <form method="POST" action="/painel/config-mr/toggle-manutencao" style="margin-top:12px">
            <button class="btn ${manutencao?'btn-success':'btn-danger'}" type="submit">${manutencao?'✅ Desativar':'🔧 Ativar'}</button>
          </form>
        </div>
      </div>

      <div class="table-card" style="margin-top:20px">
        <div class="table-head"><span class="table-title">⚙️ Configurações Gerais</span></div>
        <div style="padding:20px">
          <form method="POST" action="/painel/config-mr/salvar-geral" class="form-grid">
            <div class="form-group"><label>Nome da Loja</label><input class="form-control" name="nome_loja" value="${nomeLoja}" maxlength="50"></div>
            <div class="form-group"><label>Meta Diária (R$)</label><input class="form-control" type="number" step="0.01" name="meta_dia" value="${metaDia}" placeholder="0 = desativada"></div>
            <div class="form-group"><label>Cashback (%)</label><input class="form-control" type="number" name="cashback_pct" value="${cashback}" min="0" max="100"></div>
            <div class="form-group"><label>Cooldown Caixas (horas)</label><input class="form-control" type="number" name="caixa_cooldown" value="${caixaCd}" min="0"></div>
            <div class="form-group" style="grid-column:1/-1"><label>Mensagem de Boas-Vindas <span style="color:#7070a0;text-transform:none">(use {usuario})</span></label><input class="form-control" name="msg_boas_vindas" value="${msgBoasVindas}" placeholder="Bem-vindo, {usuario}!"></div>
            <div class="form-group"><label>Canal de Vendas (ID)</label><input class="form-control" name="canal_vendas_id" value="${canalVendas}" placeholder="Ex: 1546210832105340989"></div>
            <div class="form-group"><label>Canal de Cupons (ID)</label><input class="form-control" name="canal_cupons_id" value="${canalCupons}" placeholder="ID do canal"></div>
            <div style="grid-column:1/-1"><button class="btn btn-primary" type="submit">💾 Salvar Configurações</button></div>
          </form>
        </div>
      </div>`;
  }

  else if (sec === 'loja') {
    const stats = db.prepare("SELECT COUNT(*) as c FROM produtos WHERE ativo=1").get();
    const semEst= db.prepare("SELECT COUNT(DISTINCT vp.produto_id) as c FROM variantes_produto vp WHERE vp.ativo=1 AND (SELECT COUNT(*) FROM estoque_variante ev WHERE ev.variante_id=vp.id AND ev.usado=0)=0").get();
    const cupons= db.prepare("SELECT COUNT(*) as c FROM cupons WHERE ativo=1").get();
    const pedPend=db.prepare("SELECT COUNT(*) as c FROM pedidos WHERE status='pendente'").get();

    content = `
      <div class="stats-grid">
        <div class="stat-card" style="--glow-a:22c55e;--glow-b:16a34a"><div class="stat-label">Produtos Ativos</div><div class="stat-value" style="color:#00ff88">${stats.c}</div></div>
        <div class="stat-card" style="--glow-a:ef4444;--glow-b:dc2626"><div class="stat-label">Sem Estoque</div><div class="stat-value" style="color:#ff4455">${semEst.c}</div></div>
        <div class="stat-card" style="--glow-a:a855f7;--glow-b:7c3aed"><div class="stat-label">Cupons Ativos</div><div class="stat-value" style="color:#c4b5fd">${cupons.c}</div></div>
        <div class="stat-card" style="--glow-a:f59e0b;--glow-b:d97706"><div class="stat-label">Pedidos Pendentes</div><div class="stat-value" style="color:#fde68a">${pedPend.c}</div></div>
      </div>

      <div class="table-card">
        <div class="table-head"><span class="table-title">⚡ Flash Sale</span></div>
        <div style="padding:20px">
          <form method="POST" action="/painel/config-mr/flash-sale" class="form-grid">
            <div class="form-group"><label>Produto</label>
              <select class="form-control" name="produto_id" required>
                <option value="">Selecione...</option>
                ${prods0.map(p=>`<option value="${p.id}">${p.nome} — ${fmtMoeda(p.preco)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group"><label>Desconto (%)</label><input class="form-control" type="number" name="desconto" min="1" max="99" value="30" required></div>
            <div class="form-group"><label>Duração (minutos)</label><input class="form-control" type="number" name="duracao" min="1" value="60" required></div>
            <div style="align-self:flex-end"><button class="btn btn-danger" type="submit">⚡ Iniciar Flash Sale</button></div>
          </form>
        </div>
      </div>

      <div class="table-card" style="margin-top:16px">
        <div class="table-head"><span class="table-title">📤 Enviar Produto Manualmente</span></div>
        <div style="padding:20px">
          <form method="POST" action="/painel/config-mr/enviar-produto" class="form-grid">
            <div class="form-group"><label>Produto</label>
              <select class="form-control" name="produto_id" id="ep-prod" required onchange="carregarVarsEnvio(this.value)">
                <option value="">Selecione...</option>
                ${prods0.map(p=>`<option value="${p.id}">${p.nome}</option>`).join('')}
              </select>
            </div>
            <div class="form-group" id="ep-var-grp" style="display:none">
              <label>Variante</label><select class="form-control" name="variante_id" id="ep-var"></select>
            </div>
            <div class="form-group"><label>Discord ID do Destinatário</label><input class="form-control" name="discord_id" placeholder="ID Discord de quem vai receber" required></div>
            <div class="form-group"><label>Quantidade</label><input class="form-control" type="number" name="quantidade" value="1" min="1" max="99"></div>
            <div class="form-group"><label>Motivo</label><input class="form-control" name="motivo" placeholder="Ex: Brinde, Reenvio, Evento..."></div>
            <div style="align-self:flex-end"><button class="btn btn-primary" type="submit">📤 Enviar Produto</button></div>
          </form>
        </div>
      </div>
      <script>
      const varsData = {};
      ${prods0.map(p => {
        try {
          const vars = getMainDb().db.prepare('SELECT id,nome FROM variantes_produto WHERE produto_id=? AND ativo=1').all(p.id);
          return `varsData['${p.id}'] = ${JSON.stringify(vars)};`;
        } catch { return ''; }
      }).join('')}
      function carregarVarsEnvio(pid) {
        const grp=document.getElementById('ep-var-grp'),sel=document.getElementById('ep-var'),vars=varsData[pid]||[];
        if(!vars.length){grp.style.display='none';return;}
        sel.innerHTML=vars.map(v=>'<option value="'+v.id+'">'+v.nome+'</option>').join('');
        grp.style.display='block';
      }
      </script>`;
  }

  else if (sec === 'operacoes') {
    const reembolsos = db.prepare("SELECT COUNT(*) as c FROM reembolsos WHERE status='pendente'").get()?.c || 0;
    const tickets    = db.prepare("SELECT COUNT(*) as c FROM tickets WHERE status='aberto'").get()?.c || 0;

    content = `
      <div class="stats-grid">
        <div class="stat-card" style="--glow-a:ef4444;--glow-b:dc2626"><div class="stat-label">Reembolsos Pendentes</div><div class="stat-value" style="color:#ff4455">${reembolsos}</div></div>
        <div class="stat-card" style="--glow-a:3b82f6;--glow-b:2563eb"><div class="stat-label">Tickets Abertos</div><div class="stat-value" style="color:#93c5fd">${tickets}</div></div>
      </div>

      <div class="table-card">
        <div class="table-head"><span class="table-title">🔧 Ações de Operação</span></div>
        <div style="padding:20px;display:flex;flex-wrap:wrap;gap:10px">
          <form method="POST" action="/painel/config-mr/cancelar-pendentes">
            <button class="btn btn-danger" onclick="return confirm('Cancelar TODOS os pedidos pendentes?')" type="submit">❌ Cancelar Pedidos Pendentes</button>
          </form>
        </div>
      </div>

      <div class="table-card" style="margin-top:16px">
        <div class="table-head"><span class="table-title">🔍 Buscar Pedido</span></div>
        <div style="padding:20px">
          <form method="GET" action="/painel/pedidos" style="display:flex;gap:10px">
            <input class="form-control" name="q" placeholder="ID parcial ou Discord ID" style="max-width:320px">
            <button class="btn btn-primary" type="submit">🔍 Buscar</button>
          </form>
        </div>
      </div>

      <div class="table-card" style="margin-top:16px">
        <div class="table-head"><span class="table-title">📦 Forçar Reentrega</span></div>
        <div style="padding:20px">
          <form method="POST" action="/painel/config-mr/reentrega" class="form-grid">
            <div class="form-group"><label>ID do Pedido</label><input class="form-control" name="pedido_id" placeholder="ID parcial ou completo" required></div>
            <div style="align-self:flex-end"><button class="btn btn-primary" type="submit">🔄 Reenviar Produto</button></div>
          </form>
        </div>
      </div>`;
  }

  else if (sec === 'usuarios') {
    const topUsers = db.prepare('SELECT discord_id, nome, total_gasto, total_compras, coins, nivel FROM usuarios ORDER BY total_gasto DESC LIMIT 15').all();

    content = `
      <div class="table-card">
        <div class="table-head"><span class="table-title">🪙 Gerenciar Coins de Usuário</span></div>
        <div style="padding:20px">
          <form method="POST" action="/painel/config-mr/coins" class="form-grid">
            <div class="form-group"><label>Discord ID</label><input class="form-control" name="discord_id" placeholder="ID do usuário" required></div>
            <div class="form-group"><label>Operação</label>
              <select class="form-control" name="operacao">
                <option value="add">➕ Adicionar</option>
                <option value="remove">➖ Remover</option>
                <option value="set">= Definir</option>
              </select>
            </div>
            <div class="form-group"><label>Quantidade</label><input class="form-control" type="number" name="quantidade" min="1" required></div>
            <div class="form-group"><label>Motivo</label><input class="form-control" name="motivo" placeholder="Motivo" value="Ajuste manual"></div>
            <div style="align-self:flex-end"><button class="btn btn-primary" type="submit">💾 Aplicar</button></div>
          </form>
        </div>
      </div>

      <div class="table-card" style="margin-top:16px">
        <div class="table-head"><span class="table-title">🏆 Top Compradores</span></div>
        <table>
          <tr><th>#</th><th>Discord ID</th><th>Nome</th><th>Total Gasto</th><th>Compras</th><th>Coins</th><th>Nível</th></tr>
          ${topUsers.map((u,i)=>`<tr>
            <td style="color:#7070a0">${i+1}</td>
            <td><code style="font-size:11px">${u.discord_id}</code></td>
            <td>${u.nome||'—'}</td>
            <td style="color:#00ff88;font-weight:700">${fmtMoeda(u.total_gasto)}</td>
            <td>${u.total_compras||0}</td>
            <td>🪙 ${Number(u.coins||0).toLocaleString('pt-BR')}</td>
            <td>${u.nivel||'Bronze'}</td>
          </tr>`).join('')||'<tr><td colspan="7" style="text-align:center;color:#7070a0;padding:20px">Nenhum</td></tr>'}
        </table>
      </div>`;
  }

  else if (sec === 'afiliados') {
    content = `
      <div class="table-card">
        <div class="table-head"><span class="table-title">⚙️ Configurações de Afiliados</span></div>
        <div style="padding:20px">
          <form method="POST" action="/painel/config-mr/salvar-afiliados" class="form-grid">
            <div class="form-group"><label>Comissão N1 (%)</label><input class="form-control" type="number" step="0.1" name="taxa_afiliado" value="${taxaAfil}" min="0" max="100"></div>
            <div class="form-group"><label>Comissão N2 (%)</label><input class="form-control" type="number" step="0.1" name="taxa_afil_n2" value="${taxaN2}" min="0" max="100"></div>
            <div class="form-group"><label>Bônus N1 quando N2 vende (%)</label><input class="form-control" type="number" step="0.1" name="taxa_afil_n1_bonus" value="${taxaBonus}" min="0" max="100"></div>
            <div class="form-group"><label>Mínimo para Saque (R$)</label><input class="form-control" type="number" step="0.01" name="min_saque_afiliado" value="${minSaque}" min="0"></div>
            <div style="grid-column:1/-1"><button class="btn btn-primary" type="submit">💾 Salvar Configurações</button></div>
          </form>
        </div>
      </div>`;
  }

  else if (sec === 'anuncios') {
    const usuarios = db.prepare('SELECT discord_id, nome FROM usuarios ORDER BY nome ASC LIMIT 100').all();
    content = `
      <div class="table-card">
        <div class="table-head"><span class="table-title">📣 Enviar Anúncio</span></div>
        <div style="padding:20px">
          <form method="POST" action="/painel/config-mr/anuncio">
            <div class="form-group"><label>Destino</label>
              <select class="form-control" name="tipo" onchange="document.getElementById('canal-grp').style.display=this.value==='canal'?'block':'none'">
                <option value="dm_todos">📨 DM para todos os usuários</option>
                <option value="canal">📢 Canal específico</option>
              </select>
            </div>
            <div class="form-group" id="canal-grp" style="display:none"><label>ID do Canal</label><input class="form-control" name="canal_id" placeholder="ID do canal Discord"></div>
            <div class="form-group"><label>Título</label><input class="form-control" name="titulo" placeholder="Título do anúncio" required></div>
            <div class="form-group"><label>Mensagem</label><textarea class="form-control" name="mensagem" rows="4" required placeholder="Escreva o anúncio..."></textarea></div>
            <div class="form-group"><label>Imagem (URL, opcional)</label><input class="form-control" name="imagem" placeholder="https://..."></div>
            <div class="form-group"><label>Cor (hex, opcional)</label><input class="form-control" name="cor" placeholder="7c3aed" value="7c3aed"></div>
            <button class="btn btn-primary" type="submit" onclick="return confirm('Enviar anúncio para TODOS?')">📣 Enviar Anúncio</button>
          </form>
        </div>
      </div>`;
  }

  else if (sec === 'caixas') {
    let caixas = [];
    try { caixas = getMainDb().db.prepare('SELECT * FROM caixa_config ORDER BY criado_em DESC').all(); } catch {}
    content = `
      <div class="table-card">
        <div class="table-head"><span class="table-title">🎁 Caixas Misteriosas (${caixas.length})</span></div>
        ${caixas.length ? `<table>
          <tr><th>Nome</th><th>Preço</th><th>Canal</th><th>Aberturas</th><th>Status</th><th>Ações</th></tr>
          ${caixas.map(c=>`<tr>
            <td><strong>${c.nome}</strong></td>
            <td>${fmtMoeda(c.preco)}</td>
            <td>${c.canal_id?`<code style="font-size:11px">${c.canal_id}</code>`:'—'}</td>
            <td>${c.total_abertas||0}</td>
            <td>${badge(c.ativa?'ativo':'inativo')}</td>
            <td>
              <form method="POST" action="/painel/config-mr/caixa/${c.id}/toggle" style="display:inline">
                <button class="btn btn-sm ${c.ativa?'btn-danger':'btn-success'}" type="submit">${c.ativa?'Desativar':'Ativar'}</button>
              </form>
            </td>
          </tr>`).join('')}
        </table>` : '<div style="padding:24px;text-align:center;color:#7070a0">Nenhuma caixa criada. Use o painel do Discord para criar.</div>'}
      </div>`;
  }

  else if (sec === 'produtos') {
    const rows = db.prepare(`
      SELECT p.*, COUNT(DISTINCT vp.id) as variantes,
        (SELECT COUNT(*) FROM estoque_variante ev JOIN variantes_produto vp2 ON vp2.id=ev.variante_id WHERE vp2.produto_id=p.id AND ev.usado=0) as estoque_total
      FROM produtos p
      LEFT JOIN variantes_produto vp ON vp.produto_id=p.id AND vp.ativo=1
      GROUP BY p.id ORDER BY p.destaque DESC, p.vendas DESC
    `).all();

    content = `
      <div class="table-card">
        <div class="table-head"><span class="table-title">📦 Produtos (${rows.length})</span>
          <a href="/painel/produtos" class="btn btn-sm btn-ghost">Gerenciar →</a>
        </div>
        <table>
          <tr><th>Nome</th><th>Cat.</th><th>Preço</th><th>Variantes</th><th>Estoque</th><th>Vendas</th><th>Status</th><th>Ações</th></tr>
          ${rows.map(p=>`<tr>
            <td><strong>${p.nome}</strong></td>
            <td style="font-size:12px;color:#7070a0">${p.categoria||'—'}</td>
            <td>${fmtMoeda(p.preco)}</td>
            <td>${p.variantes}</td>
            <td>${p.estoque_total===0?'<span style="color:#ff4455">0</span>':p.estoque_total}</td>
            <td>${p.vendas||0}</td>
            <td>${badge(p.ativo?'ativo':'inativo')}</td>
            <td>
              <form method="POST" action="/painel/produtos/${p.id}/toggle" style="display:inline">
                <button class="btn btn-sm ${p.ativo?'btn-danger':'btn-success'}" type="submit">${p.ativo?'Desativar':'Ativar'}</button>
              </form>
            </td>
          </tr>`).join('')||'<tr><td colspan="8" style="text-align:center;color:#7070a0;padding:20px">Nenhum</td></tr>'}
        </table>
      </div>`;
  }

  const body = `
    ${msgHtml}
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:24px">${tabs}</div>
    ${content}`;

  res.send(layout(user, '🔧 Configurações Mr', body, 'config_mr'));
});

// ─── POST actions ──────────────────────────────────────────────
router.post('/toggle-loja', mid, (req, res) => {
  const { Config } = getMainDb();
  const atual = Config.get('loja_aberta') !== false;
  Config.set('loja_aberta', !atual);
  res.redirect('/painel/config-mr?sec=geral&msg=ok');
});

router.post('/toggle-manutencao', mid, (req, res) => {
  const { Config } = getMainDb();
  const atual = Config.get('manutencao') === true || Config.get('manutencao') === '1';
  Config.set('manutencao', !atual);
  res.redirect('/painel/config-mr?sec=geral&msg=ok');
});

router.post('/salvar-geral', mid, express.urlencoded({extended:false}), (req, res) => {
  const { Config } = getMainDb();
  const { nome_loja, meta_dia, cashback_pct, msg_boas_vindas, canal_vendas_id, canal_cupons_id, caixa_cooldown } = req.body;
  if (nome_loja)       Config.set('nome_loja',        nome_loja);
  if (meta_dia)        Config.set('meta_dia',          meta_dia);
  if (cashback_pct)    Config.set('cashback_pct',      cashback_pct);
  if (caixa_cooldown)  Config.set('caixa_cooldown',    caixa_cooldown);
  Config.set('msg_boas_vindas', msg_boas_vindas || '');
  Config.set('canal_vendas_id', canal_vendas_id || '');
  Config.set('canal_cupons_id', canal_cupons_id || '');
  res.redirect('/painel/config-mr?sec=geral&msg=ok');
});

router.post('/salvar-afiliados', mid, express.urlencoded({extended:false}), (req, res) => {
  const { Config } = getMainDb();
  const { taxa_afiliado, taxa_afil_n2, taxa_afil_n1_bonus, min_saque_afiliado } = req.body;
  if (taxa_afiliado)      Config.set('taxa_afiliado',      taxa_afiliado);
  if (taxa_afil_n2)       Config.set('taxa_afil_n2',       taxa_afil_n2);
  if (taxa_afil_n1_bonus) Config.set('taxa_afil_n1_bonus', taxa_afil_n1_bonus);
  if (min_saque_afiliado) Config.set('min_saque_afiliado', min_saque_afiliado);
  res.redirect('/painel/config-mr?sec=afiliados&msg=ok');
});

router.post('/flash-sale', mid, express.urlencoded({extended:false}), async (req, res) => {
  const { produto_id, desconto, duracao } = req.body;
  try {
    const client = getClient();
    if (!client) return res.redirect('/painel/config-mr?sec=loja&msg=err');
    const { iniciarFlashSale } = require('../systems/flashsale');
    const guild = client.guilds.cache.get(process.env.GUILD_ID) || client.guilds.cache.first();
    await iniciarFlashSale(produto_id, parseInt(desconto), parseInt(duracao), guild, req.dashUser.discord_id);
    res.redirect('/painel/config-mr?sec=loja&msg=sent');
  } catch (e) {
    console.error('[ConfigMr FlashSale]', e.message);
    res.redirect('/painel/config-mr?sec=loja&msg=err');
  }
});

router.post('/enviar-produto', mid, express.urlencoded({extended:false}), async (req, res) => {
  const { produto_id, variante_id, discord_id, quantidade, motivo } = req.body;
  try {
    const { db, Usuarios, Pedidos } = getMainDb();
    const { v4: uuidv4 } = require('uuid');
    const qtd = Math.max(1, parseInt(quantidade) || 1);

    Usuarios.garantir(discord_id, discord_id);

    const produto = db.prepare('SELECT * FROM produtos WHERE id=?').get(produto_id);
    if (!produto) return res.redirect('/painel/config-mr?sec=loja&msg=err');

    const varId = variante_id || db.prepare('SELECT id FROM variantes_produto WHERE produto_id=? AND ativo=1 ORDER BY ordem ASC LIMIT 1').get(produto_id)?.id;
    const nota  = JSON.stringify({ varianteId: varId, via: 'config_mr_manual', motivo: motivo || 'Envio manual', executorId: req.dashUser.discord_id });

    const pedidoId = Pedidos.criar({
      usuarioId: discord_id,
      produtoId: produto_id,
      quantidade: qtd,
      valorUnit:  0,
      valorTotal: 0,
      metodoPag: 'manual',
    });
    db.prepare("UPDATE pedidos SET nota_fiscal=?, status='pago', pago_em=strftime('%s','now') WHERE id=?").run(nota, pedidoId);

    const client = getClient();
    if (client) {
      const { processarEntrega } = require('../systems/loja');
      await processarEntrega(db.prepare('SELECT * FROM pedidos WHERE id=?').get(pedidoId), client);
    }
    res.redirect('/painel/config-mr?sec=loja&msg=sent');
  } catch (e) {
    console.error('[ConfigMr EnviarProduto]', e.message);
    res.redirect('/painel/config-mr?sec=loja&msg=err');
  }
});

router.post('/cancelar-pendentes', mid, (req, res) => {
  const { db } = getMainDb();
  db.prepare("UPDATE pedidos SET status='cancelado', cancelado_em=strftime('%s','now') WHERE status='pendente'").run();
  res.redirect('/painel/config-mr?sec=operacoes&msg=sent');
});

router.post('/reentrega', mid, express.urlencoded({extended:false}), async (req, res) => {
  const { pedido_id } = req.body;
  try {
    const { db, Pedidos } = getMainDb();
    const pedido = db.prepare('SELECT * FROM pedidos WHERE id LIKE ? OR id=?').get(`${pedido_id}%`, pedido_id);
    if (!pedido) return res.redirect('/painel/config-mr?sec=operacoes&msg=err');
    db.prepare("UPDATE pedidos SET status='pago' WHERE id=?").run(pedido.id);
    const client = getClient();
    if (client) {
      const { processarEntrega } = require('../systems/loja');
      await processarEntrega(db.prepare('SELECT * FROM pedidos WHERE id=?').get(pedido.id), client);
    }
    res.redirect('/painel/config-mr?sec=operacoes&msg=sent');
  } catch (e) {
    console.error('[ConfigMr Reentrega]', e.message);
    res.redirect('/painel/config-mr?sec=operacoes&msg=err');
  }
});

router.post('/coins', mid, express.urlencoded({extended:false}), (req, res) => {
  const { discord_id, operacao, quantidade, motivo } = req.body;
  try {
    const { db, Usuarios } = getMainDb();
    const qtd = parseInt(quantidade) || 0;
    const u   = Usuarios.get(discord_id);
    if (!u) return res.redirect('/painel/config-mr?sec=usuarios&msg=err');
    let novoCoins = u.coins || 0;
    if (operacao === 'add')    novoCoins += qtd;
    else if (operacao === 'remove') novoCoins = Math.max(0, novoCoins - qtd);
    else if (operacao === 'set')    novoCoins = qtd;
    Usuarios.atualizar(discord_id, { coins: novoCoins });
    res.redirect('/painel/config-mr?sec=usuarios&msg=ok');
  } catch (e) {
    console.error('[ConfigMr Coins]', e.message);
    res.redirect('/painel/config-mr?sec=usuarios&msg=err');
  }
});

router.post('/anuncio', mid, express.urlencoded({extended:false}), async (req, res) => {
  const { tipo, canal_id, titulo, mensagem, imagem, cor } = req.body;
  try {
    const client = getClient();
    if (!client) return res.redirect('/painel/config-mr?sec=anuncios&msg=err');

    const { EmbedBuilder } = require('discord.js');
    const corHex = parseInt((cor||'7c3aed').replace('#',''), 16);
    const embed  = new EmbedBuilder()
      .setColor(corHex)
      .setTitle(titulo)
      .setDescription(mensagem)
      .setTimestamp();
    if (imagem) embed.setImage(imagem);

    if (tipo === 'canal' && canal_id) {
      const ch = await client.channels.fetch(canal_id).catch(() => null);
      if (ch) await ch.send({ embeds: [embed] });
    } else {
      // DM para todos os usuários do banco
      const { db } = getMainDb();
      const users = db.prepare('SELECT discord_id FROM usuarios WHERE discord_id IS NOT NULL AND discord_id != "0"').all();
      let enviados = 0;
      for (const u of users) {
        try {
          const discordUser = await client.users.fetch(u.discord_id).catch(() => null);
          if (discordUser) {
            await discordUser.send({ embeds: [embed] }).catch(() => {});
            enviados++;
            await new Promise(r => setTimeout(r, 500));
          }
        } catch {}
      }
      console.log(`[ConfigMr Anuncio] DM enviada para ${enviados} usuários`);
    }
    res.redirect('/painel/config-mr?sec=anuncios&msg=sent');
  } catch (e) {
    console.error('[ConfigMr Anuncio]', e.message);
    res.redirect('/painel/config-mr?sec=anuncios&msg=err');
  }
});

router.post('/caixa/:id/toggle', mid, (req, res) => {
  const { db } = getMainDb();
  try {
    const c = db.prepare('SELECT ativa FROM caixa_config WHERE id=?').get(req.params.id);
    if (c) db.prepare('UPDATE caixa_config SET ativa=? WHERE id=?').run(c.ativa?0:1, req.params.id);
  } catch {}
  res.redirect('/painel/config-mr?sec=caixas&msg=ok');
});

module.exports = router;
