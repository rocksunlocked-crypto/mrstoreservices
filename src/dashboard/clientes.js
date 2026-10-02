/**
 * dashboard/clientes.js — Área de Clientes / Downloads
 *
 * Todos os cargos veem os painéis.
 * resp_staff, sub_dono e dono podem criar, editar e deletar painéis.
 */
const express = require('express');
const router  = express.Router();
const auth    = require('./auth');
const { layout, badge, fmtDate } = require('./layout');

const CARGOS_EDITOR = ['resp_staff', 'sub_dono', 'dono'];

function getDb() { return require('../database/database').db; }
function podeEditar(cargo) { return CARGOS_EDITOR.includes(cargo); }
function alert(type, msg) { return `<div class="alert alert-${type}">${msg}</div>`; }

// ── GET /clientes ─────────────────────────────────────────────
router.get('/', auth.middlewareAba('clientes'), (req, res) => {
  const user  = req.dashUser;
  const db    = getDb();
  const msg   = req.query.msg || '';
  const editor = podeEditar(user.cargo);

  const paineis = db.prepare('SELECT * FROM dash_paineis_cliente WHERE ativo=1 ORDER BY ordem ASC, criado_em DESC').all();

  const parseLinks = (p) => { try { return JSON.parse(p.links || '[]'); } catch { return []; } };

  const cardsHtml = paineis.map(p => {
    const links  = parseLinks(p);
    const corHex = p.cor || '7c3aed';
    const linksHtml = links.map(l => `
      <a href="${l.url}" target="_blank" rel="noopener"
         style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:#0a0a1e;border:1px solid #${corHex}30;border-radius:9px;text-decoration:none;color:#fff;transition:all .2s;margin-bottom:8px"
         onmouseover="this.style.borderColor='#${corHex}80';this.style.background='#${corHex}12'"
         onmouseout="this.style.borderColor='#${corHex}30';this.style.background='#0a0a1e'">
        <span style="font-size:20px">${l.icone || '🔗'}</span>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:13px">${l.titulo || l.url}</div>
          ${l.descricao ? `<div style="font-size:11px;color:#7070a0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${l.descricao}</div>` : ''}
        </div>
        <span style="color:#${corHex};font-size:12px">↗</span>
      </a>`).join('');

    return `
      <div style="background:linear-gradient(135deg,#0d0d20,#12122a);border:1px solid #${corHex}30;border-radius:14px;overflow:hidden;margin-bottom:20px">
        <div style="padding:18px 20px 14px;border-bottom:1px solid #${corHex}20;display:flex;justify-content:space-between;align-items:center">
          <div style="display:flex;align-items:center;gap:12px">
            <span style="font-size:28px">${p.icone || '📥'}</span>
            <div>
              <div style="font-size:17px;font-weight:800;color:#fff">${p.titulo}</div>
              ${p.descricao ? `<div style="font-size:12px;color:#7070a0;margin-top:2px">${p.descricao}</div>` : ''}
            </div>
          </div>
          ${editor ? `
          <div style="display:flex;gap:6px">
            <a href="/painel/clientes/editar/${p.id}" class="btn btn-ghost btn-sm">✏️</a>
            <form method="POST" action="/painel/clientes/${p.id}/deletar" onsubmit="return confirm('Deletar painel?')" style="display:inline">
              <button class="btn btn-danger btn-sm" type="submit">🗑️</button>
            </form>
          </div>` : ''}
        </div>
        <div style="padding:16px 20px">
          ${links.length ? linksHtml : '<div style="color:#7070a0;font-size:13px;text-align:center;padding:12px">Nenhum link configurado.</div>'}
        </div>
      </div>`;
  }).join('');

  const body = `
    ${msg === 'ok'  ? alert('success', '✅ Painel salvo com sucesso!') : ''}
    ${msg === 'del' ? alert('success', '🗑️ Painel deletado.') : ''}
    ${msg === 'err' ? alert('error',   '❌ Erro ao salvar.') : ''}

    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;flex-wrap:wrap;gap:10px">
      <div style="color:#7070a0;font-size:13px">${paineis.length} painel(is) disponível(is)</div>
      ${editor ? `<a href="/painel/clientes/novo" class="btn btn-primary">➕ Novo Painel</a>` : ''}
    </div>

    ${paineis.length ? cardsHtml : `
      <div style="text-align:center;padding:64px;color:#7070a0">
        <div style="font-size:48px;margin-bottom:16px">📥</div>
        <div style="font-size:18px;font-weight:700;margin-bottom:8px">Nenhum painel criado</div>
        <div style="font-size:13px">${editor ? 'Clique em "Novo Painel" para criar a área de downloads dos clientes.' : 'A equipe ainda não criou painéis de download.'}</div>
      </div>
    `}`;

  res.send(layout(user, '📥 Área de Clientes', body, 'clientes'));
});

// ── GET /clientes/novo ────────────────────────────────────────
router.get('/novo', (req, res) => {
  const user = auth.getSessao(auth.getToken(req), require('./db').getIp(req));
  if (!user || !podeEditar(user.cargo)) return res.redirect('/painel/clientes');
  res.send(layout(user, '📥 Novo Painel', formPainel(null), 'clientes'));
});

// ── GET /clientes/editar/:id ──────────────────────────────────
router.get('/editar/:id', (req, res) => {
  const user = auth.getSessao(auth.getToken(req), require('./db').getIp(req));
  if (!user || !podeEditar(user.cargo)) return res.redirect('/painel/clientes');
  const db = getDb();
  const p  = db.prepare('SELECT * FROM dash_paineis_cliente WHERE id=?').get(req.params.id);
  if (!p) return res.redirect('/painel/clientes');
  res.send(layout(user, `✏️ Editar — ${p.titulo}`, formPainel(p), 'clientes'));
});

// ── POST /clientes/salvar ─────────────────────────────────────
router.post('/salvar', express.urlencoded({ extended: false }), (req, res) => {
  const user = auth.getSessao(auth.getToken(req), require('./db').getIp(req));
  if (!user || !podeEditar(user.cargo)) return res.redirect('/painel/clientes');

  const { id, titulo, descricao, icone, cor, ordem,
    link_url_1, link_titulo_1, link_icone_1, link_desc_1,
    link_url_2, link_titulo_2, link_icone_2, link_desc_2,
    link_url_3, link_titulo_3, link_icone_3, link_desc_3,
    link_url_4, link_titulo_4, link_icone_4, link_desc_4,
    link_url_5, link_titulo_5, link_icone_5, link_desc_5,
    link_url_6, link_titulo_6, link_icone_6, link_desc_6,
    link_url_7, link_titulo_7, link_icone_7, link_desc_7,
    link_url_8, link_titulo_8, link_icone_8, link_desc_8,
    link_url_9, link_titulo_9, link_icone_9, link_desc_9,
    link_url_10, link_titulo_10, link_icone_10, link_desc_10,
  } = req.body;

  // Montar array de links (só os que têm URL)
  const links = [];
  for (let i = 1; i <= 10; i++) {
    const url = req.body[`link_url_${i}`]?.trim();
    if (url) {
      links.push({
        url,
        titulo:    req.body[`link_titulo_${i}`]?.trim() || url,
        icone:     req.body[`link_icone_${i}`]?.trim()  || '🔗',
        descricao: req.body[`link_desc_${i}`]?.trim()   || '',
      });
    }
  }

  const db    = getDb();
  const linksJson = JSON.stringify(links);
  const corVal    = (cor || '7c3aed').replace('#', '');
  const ordemVal  = parseInt(ordem) || 0;

  try {
    if (id) {
      db.prepare('UPDATE dash_paineis_cliente SET titulo=?,descricao=?,icone=?,cor=?,links=?,ordem=? WHERE id=?')
        .run(titulo?.trim() || 'Painel', descricao?.trim() || '', icone?.trim() || '📥', corVal, linksJson, ordemVal, id);
    } else {
      db.prepare('INSERT INTO dash_paineis_cliente (titulo,descricao,icone,cor,links,ordem,criado_por) VALUES (?,?,?,?,?,?,?)')
        .run(titulo?.trim() || 'Painel', descricao?.trim() || '', icone?.trim() || '📥', corVal, linksJson, ordemVal, user.username);
    }
    res.redirect('/painel/clientes?msg=ok');
  } catch (e) {
    console.error('[Clientes]', e.message);
    res.redirect('/painel/clientes?msg=err');
  }
});

// ── POST /clientes/:id/deletar ────────────────────────────────
router.post('/:id/deletar', (req, res) => {
  const user = auth.getSessao(auth.getToken(req), require('./db').getIp(req));
  if (!user || !podeEditar(user.cargo)) return res.redirect('/painel/clientes');
  getDb().prepare('DELETE FROM dash_paineis_cliente WHERE id=?').run(req.params.id);
  res.redirect('/painel/clientes?msg=del');
});

// ── Formulário reutilizável ───────────────────────────────────
function formPainel(p) {
  const links = p ? (() => { try { return JSON.parse(p.links || '[]'); } catch { return []; } })() : [];
  // Garantir 10 slots
  while (links.length < 10) links.push({ url:'', titulo:'', icone:'', descricao:'' });

  const linksHtml = links.map((l, i) => `
    <div style="background:#0a0a1e;border:1px solid var(--border2);border-radius:10px;padding:14px;margin-bottom:10px">
      <div style="font-size:11px;color:#7070a0;font-weight:700;text-transform:uppercase;margin-bottom:10px">Link ${i+1}</div>
      <div class="form-grid">
        <div class="form-group"><label>URL</label><input class="form-control" name="link_url_${i+1}" value="${l.url || ''}" placeholder="https://..."></div>
        <div class="form-group"><label>Título</label><input class="form-control" name="link_titulo_${i+1}" value="${l.titulo || ''}" placeholder="Ex: Baixar v1.0"></div>
        <div class="form-group"><label>Ícone (emoji)</label><input class="form-control" name="link_icone_${i+1}" value="${l.icone || ''}" placeholder="🔗" style="width:80px"></div>
        <div class="form-group"><label>Descrição</label><input class="form-control" name="link_desc_${i+1}" value="${l.descricao || ''}" placeholder="Opcional"></div>
      </div>
    </div>`).join('');

  return `
    <a href="/painel/clientes" class="btn btn-ghost btn-sm" style="margin-bottom:20px">← Voltar</a>
    <form method="POST" action="/painel/clientes/salvar">
      ${p ? `<input type="hidden" name="id" value="${p.id}">` : ''}
      <div class="table-card" style="margin-bottom:20px">
        <div class="table-head"><span class="table-title">⚙️ Configuração do Painel</span></div>
        <div style="padding:20px">
          <div class="form-grid">
            <div class="form-group"><label>Título</label><input class="form-control" name="titulo" value="${p?.titulo || ''}" required placeholder="Ex: Downloads GTA V"></div>
            <div class="form-group"><label>Ícone (emoji)</label><input class="form-control" name="icone" value="${p?.icone || '📥'}" placeholder="📥" style="width:80px"></div>
            <div class="form-group"><label>Cor (hex sem #)</label><input class="form-control" name="cor" value="${p?.cor || '7c3aed'}" placeholder="7c3aed"></div>
            <div class="form-group"><label>Ordem (menor = primeiro)</label><input class="form-control" type="number" name="ordem" value="${p?.ordem || 0}"></div>
            <div class="form-group" style="grid-column:1/-1"><label>Descrição</label><input class="form-control" name="descricao" value="${p?.descricao || ''}" placeholder="Opcional"></div>
          </div>
        </div>
      </div>

      <div class="table-card" style="margin-bottom:20px">
        <div class="table-head"><span class="table-title">🔗 Links (até 10)</span><span style="font-size:12px;color:#7070a0">Deixe a URL vazia para não exibir o link</span></div>
        <div style="padding:20px">${linksHtml}</div>
      </div>

      <div style="display:flex;gap:10px">
        <button class="btn btn-primary" type="submit" style="flex:1;padding:12px;font-size:15px">💾 Salvar Painel</button>
        <a href="/painel/clientes" class="btn btn-ghost" style="padding:12px">Cancelar</a>
      </div>
    </form>`;
}

module.exports = router;
