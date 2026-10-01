/**
 * ticketsDb.js — Camada de compatibilidade
 *
 * O sistema avançado de tickets (ticketInteractionHandler, panelBuilder, etc.)
 * usa esta interface. Ela delega tudo ao banco unificado (database.js).
 *
 * A tabela "tickets" do banco unificado armazena todos os tickets.
 * Aqui traduzimos entre o formato do bot-tickets (ticket_id, channel_id, user_id...)
 * e o formato do bot de vendas (id, canal_id, usuario_id...).
 */

const { db, Tickets } = require('./database');

// ── Helpers de mapeamento ─────────────────────────────────────
// Converte registro do banco de vendas para formato esperado pelo bot tickets
function mapTicket(t) {
  if (!t) return null;
  return {
    ticket_id:    t.ticket_id || t.id,
    id:           t.id,
    channel_id:   t.canal_id  || t.channel_id,
    canal_id:     t.canal_id  || t.channel_id,
    guild_id:     t.guild_id  || process.env.GUILD_ID,
    user_id:      t.usuario_id || t.user_id,
    usuario_id:   t.usuario_id || t.user_id,
    username:     t.username   || '',
    category:     t.tipo       || t.category || 'suporte',
    tipo:         t.tipo       || t.category || 'suporte',
    subject:      t.subject    || t.tipo     || 'Sem assunto',
    status:       t.status === 'aberto' ? 'open' : (t.status === 'fechado' ? 'closed' : t.status),
    priority:     t.priority   || 'media',
    claimed_by:   t.atendente  || t.claimed_by || null,
    atendente:    t.atendente  || t.claimed_by || null,
    panel_msg_id: t.panel_msg_id || null,
    created_at:   t.criado_em  || t.created_at,
    criado_em:    t.criado_em  || t.created_at,
    closed_at:    t.fechado_em || t.closed_at  || null,
    close_reason: t.motivo     || t.close_reason || null,
    closed_by:    t.fechado_por || t.closed_by   || null,
    rating:       t.avaliacao  || t.rating       || null,
    message_count: t.mensagens || t.message_count || 0,
  };
}

// ── Tickets ───────────────────────────────────────────────────
function getTicket(ticketId) {
  const t = db.prepare('SELECT * FROM tickets WHERE id = ? OR canal_id = ?').get(ticketId, ticketId);
  return mapTicket(t);
}

function getTicketByChannel(channelId) {
  const t = db.prepare("SELECT * FROM tickets WHERE canal_id = ? AND status != 'fechado'").get(channelId);
  return mapTicket(t);
}

function getOpenTicketsByUser(userId, guildId) {
  const rows = db.prepare("SELECT * FROM tickets WHERE usuario_id = ? AND status = 'aberto'").all(userId);
  return rows.map(mapTicket);
}

function getAllTickets(guildId, status = null) {
  let rows;
  if (status === 'open') {
    rows = db.prepare("SELECT * FROM tickets WHERE status = 'aberto'").all();
  } else if (status === 'closed') {
    rows = db.prepare("SELECT * FROM tickets WHERE status = 'fechado'").all();
  } else {
    rows = db.prepare('SELECT * FROM tickets').all();
  }
  return rows.map(mapTicket);
}

function updateTicket(ticketId, data) {
  // Traduzir campos do formato tickets para o formato do banco de vendas
  const fieldMap = {
    status:       v => ({ status: v === 'open' ? 'aberto' : v === 'closed' ? 'fechado' : v }),
    claimed_by:   v => ({ atendente: v }),
    close_reason: v => ({ motivo: v }),
    closed_by:    v => ({ fechado_por: v }),
    closed_at:    v => ({ fechado_em: v }),
    rating:       v => ({ avaliacao: v }),
    message_count:v => ({ mensagens: v }),
    subject:      v => ({ tipo: v }),
  };

  const translated = {};
  for (const [k, v] of Object.entries(data)) {
    if (fieldMap[k]) Object.assign(translated, fieldMap[k](v));
    else translated[k] = v;
  }

  const campos = Object.keys(translated).map(k => `${k} = ?`).join(', ');
  if (!campos) return;

  // Tentar por id
  const t = db.prepare('SELECT id FROM tickets WHERE id = ?').get(ticketId);
  if (t) {
    db.prepare(`UPDATE tickets SET ${campos} WHERE id = ?`).run(...Object.values(translated), ticketId);
  } else {
    // Tentar por canal_id
    db.prepare(`UPDATE tickets SET ${campos} WHERE canal_id = ?`).run(...Object.values(translated), ticketId);
  }
}

function closeTicket(ticketId, closedBy, reason) {
  const now = Math.floor(Date.now() / 1000);
  updateTicket(ticketId, {
    status:       'fechado',
    closed_by:    closedBy,
    close_reason: reason,
    closed_at:    now,
  });
}

function countTicketsByCategory(guildId) {
  const rows = db.prepare('SELECT tipo, COUNT(*) as total, SUM(CASE WHEN status="aberto" THEN 1 ELSE 0 END) as open, SUM(CASE WHEN status="fechado" THEN 1 ELSE 0 END) as closed FROM tickets GROUP BY tipo').all();
  return rows.map(r => ({ category: r.tipo, total: r.total, open: r.open, closed: r.closed }));
}

function getTodayStats(guildId) {
  const today = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);
  const total_opened = db.prepare('SELECT COUNT(*) as c FROM tickets WHERE criado_em >= ?').get(today)?.c || 0;
  const total_closed = db.prepare("SELECT COUNT(*) as c FROM tickets WHERE fechado_em >= ? AND status='fechado'").get(today)?.c || 0;
  return { total_opened, total_closed };
}

// ── Notas (tabela separada — criar se não existir) ────────────
try {
  db.exec(`CREATE TABLE IF NOT EXISTS ticket_notes_adv (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id TEXT NOT NULL,
    author_id TEXT NOT NULL,
    author_tag TEXT NOT NULL,
    note TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  )`);
} catch {}

function addNote(ticketId, authorId, authorTag, note) {
  db.prepare('INSERT INTO ticket_notes_adv (ticket_id, author_id, author_tag, note) VALUES (?,?,?,?)').run(ticketId, authorId, authorTag, note);
}

function getNotes(ticketId) {
  try { return db.prepare('SELECT * FROM ticket_notes_adv WHERE ticket_id = ?').all(ticketId); } catch { return []; }
}

// ── Tags (usar logs_acoes como fallback) ──────────────────────
try {
  db.exec(`CREATE TABLE IF NOT EXISTS ticket_tags_adv (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id TEXT NOT NULL,
    tag TEXT NOT NULL,
    UNIQUE(ticket_id, tag)
  )`);
} catch {}

function addTag(ticketId, tag) {
  try {
    db.prepare('INSERT OR IGNORE INTO ticket_tags_adv (ticket_id, tag) VALUES (?,?)').run(ticketId, tag);
    return true;
  } catch { return null; }
}

function removeTag(ticketId, tag) {
  try {
    const r = db.prepare('DELETE FROM ticket_tags_adv WHERE ticket_id=? AND tag=?').run(ticketId, tag);
    return { changes: r.changes };
  } catch { return { changes: 0 }; }
}

function getTags(ticketId) {
  try { return db.prepare('SELECT tag FROM ticket_tags_adv WHERE ticket_id=?').all(ticketId).map(r => r.tag); } catch { return []; }
}

// ── Logs ──────────────────────────────────────────────────────
function addLog(ticketId, action, actorId, actorTag, details = null) {
  const { v4: uuidv4 } = require('uuid');
  try {
    db.prepare(`INSERT INTO logs_acoes (id, tipo, executor_id, alvo_id, descricao, dados) VALUES (?,?,?,?,?,?)`)
      .run(uuidv4(), `ticket_${action.toLowerCase()}`, actorId, ticketId, `${action}: ${details || ''}`, JSON.stringify({ actorTag, details }));
  } catch {}
}

function getLogs(ticketId) {
  try {
    return db.prepare("SELECT * FROM logs_acoes WHERE alvo_id = ? ORDER BY criado_em ASC").all(ticketId)
      .map(l => ({ ticket_id: ticketId, action: l.tipo, actor_id: l.executor_id, details: l.descricao, created_at: l.criado_em }));
  } catch { return []; }
}

// ── Staff Stats ───────────────────────────────────────────────
try {
  db.exec(`CREATE TABLE IF NOT EXISTS staff_stats_adv (
    user_id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    tickets_closed INTEGER DEFAULT 0,
    tickets_claimed INTEGER DEFAULT 0,
    avg_rating REAL DEFAULT 0,
    total_ratings INTEGER DEFAULT 0
  )`);
} catch {}

function upsertStaffStat(userId, username, field, value = 1) {
  try {
    db.prepare('INSERT OR IGNORE INTO staff_stats_adv (user_id, username) VALUES (?,?)').run(userId, username);
    db.prepare(`UPDATE staff_stats_adv SET ${field} = ${field} + ? WHERE user_id = ?`).run(value, userId);
  } catch {}
}

function updateStaffRating(userId, username, rating) {
  try {
    db.prepare('INSERT OR IGNORE INTO staff_stats_adv (user_id, username) VALUES (?,?)').run(userId, username);
    const s = db.prepare('SELECT avg_rating, total_ratings FROM staff_stats_adv WHERE user_id=?').get(userId);
    if (s) {
      const newTotal = (s.total_ratings || 0) + 1;
      const newAvg = (((s.avg_rating || 0) * (s.total_ratings || 0)) + rating) / newTotal;
      db.prepare('UPDATE staff_stats_adv SET avg_rating=?, total_ratings=? WHERE user_id=?').run(newAvg, newTotal, userId);
    }
  } catch {}
}

function getTopStaff(guildId, limit = 10) {
  try {
    return db.prepare('SELECT * FROM staff_stats_adv ORDER BY tickets_closed DESC LIMIT ?').all(limit);
  } catch { return []; }
}

// ── Bloqueados ────────────────────────────────────────────────
function isBlocked(userId, guildId) {
  const u = db.prepare('SELECT bloqueado FROM usuarios WHERE discord_id = ?').get(userId);
  return !!(u?.bloqueado);
}

// ── Respostas rápidas ─────────────────────────────────────────
try {
  db.exec(`CREATE TABLE IF NOT EXISTS saved_responses_adv (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    name TEXT NOT NULL,
    content TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  )`);
} catch {}

function saveResponse(guildId, name, content, createdBy) {
  db.prepare('INSERT INTO saved_responses_adv (guild_id, name, content, created_by) VALUES (?,?,?,?)').run(guildId, name, content, createdBy);
}

function getSavedResponses(guildId) {
  try { return db.prepare('SELECT * FROM saved_responses_adv WHERE guild_id=? ORDER BY name ASC').all(guildId); } catch { return []; }
}

function getSavedResponse(guildId, name) {
  try { return db.prepare('SELECT * FROM saved_responses_adv WHERE guild_id=? AND name=?').get(guildId, name) || null; } catch { return null; }
}

function deleteSavedResponse(id, guildId) {
  try {
    const r = db.prepare('DELETE FROM saved_responses_adv WHERE id=? AND guild_id=?').run(id, guildId);
    return { changes: r.changes };
  } catch { return { changes: 0 }; }
}

// ── Painéis ───────────────────────────────────────────────────
function savePanel(channelId, messageId, guildId) {
  // Painéis de tickets avançado — usar tabela de configurações
  try {
    const { v4: uuidv4 } = require('uuid');
    db.prepare('INSERT OR IGNORE INTO paineis_canal (id, canal_id, produto_id, mensagem_id, titulo, criado_por) VALUES (?,?,?,?,?,?)').run(uuidv4(), channelId, 'ticket_panel', messageId, 'Painel de Tickets', 'sistema');
  } catch {}
}

// ── Wrapper db para queries diretas ──────────────────────────
const dbWrapper = {
  prepare: (sql) => db.prepare(sql),
};

module.exports = {
  db: dbWrapper,
  // Tickets
  getTicket, getTicketByChannel, getOpenTicketsByUser, getAllTickets,
  updateTicket, closeTicket, countTicketsByCategory, getTodayStats,
  // Notas
  addNote, getNotes,
  // Tags
  addTag, removeTag, getTags,
  // Logs
  addLog, getLogs,
  // Staff
  upsertStaffStat, updateStaffRating, getTopStaff,
  // Bloqueados
  isBlocked,
  // Respostas
  saveResponse, getSavedResponses, getSavedResponse, deleteSavedResponse,
  // Painéis
  savePanel,
};
