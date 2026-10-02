/**
 * dashboard/clientes.js — Área de Clientes / Downloads
 * Todos os cargos veem. resp_staff, sub_dono e dono podem criar/editar/deletar.
 */
const express = require('express');
const router  = express.Router();
const auth    = require('./auth');
const { layout, fmtDate } = require('./layout');

const CARGOS_EDITOR = ['resp_staff', 'sub_dono', 'dono'];
function getDb()        { return require('../database/database').db; }
function podeEditar(c)  { return CARGOS_EDITOR.includes(c); }
function alertHtml(t,m) { return `<div class="alert alert-${t}">${m}</div>`; }
function parseLinks(p)  { try { return JSON.parse(p.links || '[]'); } catch { return []; } }

// ── GET principal ─────────────────────────────────────────────
router.get('/', auth.middlewareAba('clientes'), (req, res) => {
  const user   = req.dashUser;
  const db     = getDb();
  const msg    = req.query.msg || '';
  const editor = podeEditar(user.cargo);
  const paineis = db.prepare('SELECT * FROM dash_paineis_cliente WHERE ativo=1 ORDER BY ordem ASC, criado_em DESC').all();

  const cardsHtml = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:20px">` +
    paineis.map(p => {
    const links  = parseLinks(p);
    const cor    = p.cor || '7c3aed';
    const img    = p.imagem_url
      ? `<img src="${p.imagem_url}" style="width:100%;height:160px;object-fit:cover;border-radius:12px 12px 0 0" onerror="this.style.display='none'">`
      : '';
    const linksHtml = links.map(l => `
      <a href="${l.url}" target="_blank" rel="noopener"
         style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:#0a0a1e;border:1px solid #${cor}30;border-radius:9px;text-decoration:none;color:#fff;margin-bottom:8px;transition:all .2s"
         onmouseover="this.style.borderColor='#${cor}80';this.style.background='#${cor}12'"
         onmouseout="this.style.borderColor='#${cor}30';this.style.background='#0a0a1e'">
        <span style="font-size:20px">${l.icone || '🔗'}</span>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:13px">${l.titulo || l.url}</div>
          ${l.descricao ? `<div style="font-size:11px;color:#7070a0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${l.descricao}</div>` : ''}
        </div>
        <span style="color:#${cor};font-size:12px">↗</span>
      </a>`).join('');

    return `
      <div style="background:linear-gradient(135deg,#0d0d20,#12122a);border:1px solid #${cor}30;border-radius:14px;overflow:hidden;margin-bottom:20px">
        ${img}
        <div style="padding:18px 20px 14px;border-bottom:1px solid #${cor}20;display:flex;justify-content:space-between;align-items:center">
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
  }).join('') + `</div>`;

  const body = `
    ${msg === 'ok'  ? alertHtml('success', '✅ Painel salvo!') : ''}
    ${msg === 'del' ? alertHtml('success', '🗑️ Painel deletado.') : ''}
    ${msg === 'err' ? alertHtml('error',   '❌ Erro ao salvar.') : ''}
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;flex-wrap:wrap;gap:10px">
      <div style="color:#7070a0;font-size:13px">${paineis.length} painel(is)</div>
      ${editor ? `<a href="/painel/clientes/novo" class="btn btn-primary">➕ Novo Painel</a>` : ''}
    </div>
    ${paineis.length ? cardsHtml : `
      <div style="text-align:center;padding:64px;color:#7070a0">
        <div style="font-size:48px;margin-bottom:16px">📥</div>
        <div style="font-size:18px;font-weight:700;margin-bottom:8px">Nenhum painel criado</div>
        <div style="font-size:13px">${editor ? 'Clique em "Novo Painel" para criar.' : 'A equipe ainda não criou painéis.'}</div>
      </div>`}`;

  res.send(layout(user, '📥 Área de Clientes', body, 'clientes'));
});

// ── GET /novo e /editar/:id ───────────────────────────────────
router.get('/novo', auth.middlewareAba('clientes'), (req, res) => {
  const user = req.dashUser;
  if (!podeEditar(user.cargo)) return res.redirect('/painel/clientes');
  res.send(layout(user, '📥 Novo Painel', buildForm(null), 'clientes'));
});

router.get('/editar/:id', auth.middlewareAba('clientes'), (req, res) => {
  const user = req.dashUser;
  if (!podeEditar(user.cargo)) return res.redirect('/painel/clientes');
  const p = getDb().prepare('SELECT * FROM dash_paineis_cliente WHERE id=?').get(req.params.id);
  if (!p) return res.redirect('/painel/clientes');
  res.send(layout(user, `✏️ Editar — ${p.titulo}`, buildForm(p), 'clientes'));
});

// ── POST /salvar ──────────────────────────────────────────────
router.post('/salvar', auth.middlewareAba('clientes'), express.urlencoded({ extended: false }), (req, res) => {
  const user = req.dashUser;
  if (!podeEditar(user.cargo)) return res.redirect('/painel/clientes');

  const { id, titulo, descricao, icone, cor, ordem, imagem_url } = req.body;

  const links = [];
  for (let i = 1; i <= 10; i++) {
    const url = (req.body[`link_url_${i}`] || '').trim();
    if (url) links.push({
      url,
      titulo:    (req.body[`link_titulo_${i}`] || '').trim() || url,
      icone:     (req.body[`link_icone_${i}`]  || '').trim() || '🔗',
      descricao: (req.body[`link_desc_${i}`]   || '').trim(),
    });
  }

  const db = getDb();
  try {
    const vals = [
      (titulo || 'Painel').trim(),
      (descricao || '').trim(),
      (icone || '📥').trim(),
      (cor || '7c3aed').replace('#', ''),
      (imagem_url || '').trim() || null,
      JSON.stringify(links),
      parseInt(ordem) || 0,
    ];
    if (id) {
      db.prepare('UPDATE dash_paineis_cliente SET titulo=?,descricao=?,icone=?,cor=?,imagem_url=?,links=?,ordem=? WHERE id=?').run(...vals, id);
    } else {
      db.prepare('INSERT INTO dash_paineis_cliente (titulo,descricao,icone,cor,imagem_url,links,ordem,criado_por) VALUES (?,?,?,?,?,?,?,?)').run(...vals, user.username);
    }
    res.redirect('/painel/clientes?msg=ok');
  } catch (e) {
    console.error('[Clientes]', e.message);
    res.redirect('/painel/clientes?msg=err');
  }
});

// ── POST /:id/deletar ─────────────────────────────────────────
router.post('/:id/deletar', auth.middlewareAba('clientes'), (req, res) => {
  const user = req.dashUser;
  if (!podeEditar(user.cargo)) return res.redirect('/painel/clientes');
  getDb().prepare('DELETE FROM dash_paineis_cliente WHERE id=?').run(req.params.id);
  res.redirect('/painel/clientes?msg=del');
});

// ── Formulário ────────────────────────────────────────────────
function buildForm(p) {
  const links = p ? parseLinks(p) : [];
  while (links.length < 10) links.push({ url:'', titulo:'', icone:'', descricao:'' });

  const linksHtml = links.map((l, i) => `
    <div style="background:#0a0a1e;border:1px solid var(--border2);border-radius:10px;padding:14px;margin-bottom:10px">
      <div style="font-size:11px;color:#7070a0;font-weight:700;text-transform:uppercase;margin-bottom:10px">Link ${i+1}</div>
      <div class="form-grid">
        <div class="form-group"><label>URL</label><input class="form-control" name="link_url_${i+1}" value="${l.url||''}" placeholder="https://..."></div>
        <div class="form-group"><label>Título</label><input class="form-control" name="link_titulo_${i+1}" value="${l.titulo||''}" placeholder="Ex: Baixar v1.0"></div>
        <div class="form-group"><label>Ícone</label><input class="form-control" name="link_icone_${i+1}" value="${l.icone||''}" placeholder="🔗" style="width:80px"></div>
        <div class="form-group"><label>Descrição</label><input class="form-control" name="link_desc_${i+1}" value="${l.descricao||''}" placeholder="Opcional"></div>
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
            <div class="form-group"><label>Título</label><input class="form-control" name="titulo" value="${p?.titulo||''}" required placeholder="Ex: Downloads GTA V"></div>
            <div class="form-group"><label>Ícone (emoji)</label><input class="form-control" name="icone" value="${p?.icone||'📥'}" placeholder="📥" style="width:80px"></div>
            <div class="form-group"><label>Cor (hex)</label><input class="form-control" name="cor" value="${p?.cor||'7c3aed'}" placeholder="7c3aed"></div>
            <div class="form-group"><label>Ordem</label><input class="form-control" type="number" name="ordem" value="${p?.ordem||0}"></div>
            <div class="form-group" style="grid-column:1/-1"><label>Imagem de capa (URL)</label><input class="form-control" name="imagem_url" value="${p?.imagem_url||''}" placeholder="https://i.imgur.com/..."></div>
            <div class="form-group" style="grid-column:1/-1"><label>Descrição</label><input class="form-control" name="descricao" value="${p?.descricao||''}" placeholder="Opcional"></div>
          </div>
          ${p?.imagem_url ? `<div style="margin-top:12px"><img src="${p.imagem_url}" style="max-height:120px;border-radius:8px;border:1px solid var(--border2)" onerror="this.style.display='none'"></div>` : ''}
        </div>
      </div>
      <div class="table-card" style="margin-bottom:20px">
        <div class="table-head"><span class="table-title">🔗 Links (até 10)</span><span style="font-size:12px;color:#7070a0">URL vazia = não exibido</span></div>
        <div style="padding:20px">${linksHtml}</div>
      </div>
      <div style="display:flex;gap:10px">
        <button class="btn btn-primary" type="submit" style="flex:1;padding:12px;font-size:15px">💾 Salvar Painel</button>
        <a href="/painel/clientes" class="btn btn-ghost" style="padding:12px">Cancelar</a>
      </div>
    </form>`;
}

module.exports = router;
