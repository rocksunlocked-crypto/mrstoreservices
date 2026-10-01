/**
 * ticketTranscript.js — Transcript unificado
 *
 * Usa o mesmo sistema do bot de vendas:
 *  - Gera HTML estilizado igual ao Discord
 *  - Envia o arquivo .html no TICKET_HTML_CHANNEL
 *  - Envia embed de log no TICKET_TRANSCRIPT_CHANNEL
 *  - Salva HTML no banco (tabela transcripts) para acesso via Express
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const config  = require('../config');
const moment  = require('moment-timezone');

// ── Gerar HTML estilizado ─────────────────────────────────────
async function gerarHtml(canal, ticket) {
  const msgs = await canal.messages.fetch({ limit: 100 }).catch(() => null);
  if (!msgs) return null;

  const lista     = [...msgs.values()].reverse();
  const tz        = config.timezone;
  const abertura  = ticket.created_at
    ? moment.unix(ticket.created_at).tz(tz).format('DD/MM/YYYY HH:mm')
    : moment().tz(tz).format('DD/MM/YYYY HH:mm');
  const fechamento = moment().tz(tz).format('DD/MM/YYYY HH:mm');
  const duracao    = ticket.created_at ? Math.floor((Date.now() / 1000 - ticket.created_at) / 60) : 0;
  const ticketId   = ticket.ticket_id || ticket.id || 'TICKET';

  const catLabels = {
    denuncia: '🚨 Denúncia', suporte: '🛠️ Suporte', parceria: '🤝 Parceria',
    compra: '🛒 Compra', reembolso: '↩️ Reembolso', entrega: '📦 Entrega',
    afiliado: '🤝 Afiliado', reclamacao: '⚠️ Reclamação', saque: '💸 Saque',
  };
  const catLabel = catLabels[ticket.category || ticket.tipo] || (ticket.category || ticket.tipo || 'Suporte').toUpperCase();

  let html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Transcript — #${ticketId.toUpperCase()}</title>
<style>
  :root { --bg:#313338;--sb:#2b2d31;--hd:#1e1f22;--hov:#2e3035;--tx:#dbdee1;--mt:#949ba4;--lk:#00a8fc;--br:#5865f2;--gn:#23a55a; }
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:var(--bg);color:var(--tx);font-family:'Segoe UI','Helvetica Neue',Arial,sans-serif;font-size:16px;line-height:1.375}
  .hdr{background:var(--hd);padding:16px 24px;border-bottom:1px solid #1a1b1e;display:flex;gap:16px;align-items:flex-start}
  .hdr .ico{font-size:2em;flex-shrink:0}
  .hdr h1{font-size:1.2rem;font-weight:700}
  .hdr .meta{color:var(--mt);font-size:.85rem;margin-top:3px}
  .stats{display:flex;gap:12px;margin-top:8px;flex-wrap:wrap}
  .stat{background:var(--sb);border-radius:6px;padding:5px 12px;font-size:.8rem}
  .stat span{color:var(--br);font-weight:700}
  .msgs{padding:8px 0}
  .div{display:flex;align-items:center;gap:12px;padding:14px 24px;color:var(--mt);font-size:.75rem;font-weight:600}
  .div::before,.div::after{content:'';flex:1;height:1px;background:#3f4147}
  .grp{display:flex;gap:16px;padding:3px 24px;border-radius:4px;transition:background .1s}
  .grp:hover,.cont:hover{background:var(--hov)}
  .av{flex-shrink:0;width:40px;height:40px;border-radius:50%;overflow:hidden;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:1rem;color:#fff;margin-top:2px}
  .av img{width:100%;height:100%;object-fit:cover;border-radius:50%}
  .mc{flex:1;min-width:0}
  .mm{display:flex;align-items:baseline;gap:8px;margin-bottom:2px}
  .un{font-weight:600;font-size:1rem}
  .bt{background:var(--br);color:#fff;font-size:.65rem;font-weight:700;padding:1px 5px;border-radius:3px;text-transform:uppercase;letter-spacing:.3px}
  .ts{color:var(--mt);font-size:.75rem}
  .mt{color:var(--tx);word-break:break-word;white-space:pre-wrap}
  .emb{border-left:4px solid var(--br);background:var(--sb);border-radius:0 4px 4px 0;padding:8px 12px;margin-top:4px;font-size:.88rem;color:var(--mt)}
  .cont{padding:1px 24px 1px 80px}
  .ftr{background:var(--hd);border-top:1px solid #1a1b1e;padding:14px 24px;text-align:center;color:var(--mt);font-size:.8rem}
  .ftr strong{color:var(--br)}
</style>
</head>
<body>
<div class="hdr">
  <div class="ico">🎫</div>
  <div>
    <h1>Transcript — #${ticketId.toUpperCase()}</h1>
    <div class="meta">${catLabel} • Aberto: ${abertura} • Fechado: ${fechamento}</div>
    <div class="stats">
      <div class="stat">Mensagens: <span>${lista.length}</span></div>
      <div class="stat">Duração: <span>${duracao} min</span></div>
      <div class="stat">ID: <span>${ticketId.toUpperCase()}</span></div>
      <div class="stat">Servidor: <span>MrStore</span></div>
    </div>
  </div>
</div>
<div class="msgs">
<div class="div">${abertura}</div>
`;

  let lastAuthor = null, lastDay = null;

  function hsl(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
    return `hsl(${Math.abs(h) % 360},50%,40%)`;
  }

  for (const msg of lista) {
    if (!msg.content && !msg.embeds?.length && !msg.attachments?.size) continue;
    const isBot   = msg.author.bot;
    const tempo   = moment(msg.createdAt).tz(tz);
    const dia     = tempo.format('DD/MM/YYYY');
    const hora    = tempo.format('HH:mm');
    const nome    = msg.author.username;
    const isSame  = lastAuthor === msg.author.id && lastDay === dia;
    const avatarUrl = msg.author.displayAvatarURL?.({ size: 64, format: 'png' }) || '';
    const letra   = nome[0]?.toUpperCase() || '?';

    if (dia !== lastDay) {
      if (lastDay) html += `<div class="div">${dia}</div>\n`;
      lastDay = dia;
    }

    const texto  = (msg.content || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
    const embeds = msg.embeds?.length  ? `<div class="emb">[Embed: ${msg.embeds[0]?.title || 'mensagem do bot'}]</div>` : '';
    const anexos = msg.attachments?.size ? `<div class="emb">📎 ${msg.attachments.size} anexo(s)</div>` : '';

    if (isSame) {
      html += `<div class="cont"><span class="mt">${texto}${embeds}${anexos}</span></div>\n`;
    } else {
      html += `
<div class="grp">
  <div class="av" style="background:${hsl(nome)}">
    ${avatarUrl ? `<img src="${avatarUrl}" alt="" onerror="this.style.display='none'">` : letra}
  </div>
  <div class="mc">
    <div class="mm">
      <span class="un" style="color:${isBot ? 'var(--gn)' : ''}">${nome}</span>
      ${isBot ? '<span class="bt">APP</span>' : ''}
      <span class="ts">${hora}</span>
    </div>
    <div class="mt">${texto}${embeds}${anexos}</div>
  </div>
</div>\n`;
      lastAuthor = msg.author.id;
    }
  }

  html += `</div>
<div class="ftr">
  Gerado por <strong>MrStore</strong> • ${fechamento} • Ticket <strong>#${ticketId.toUpperCase()}</strong>
</div>
</body></html>`;

  return Buffer.from(html, 'utf-8');
}

// ── Enviar transcript completo (arquivo HTML + embed de log) ──
async function sendTranscript(canal, ticket, canalTranscript, fechadoPor = 'Sistema') {
  const guild    = canal.guild;
  const ticketId = ticket.ticket_id || ticket.id || 'TICKET';

  const buffer = await gerarHtml(canal, ticket);
  if (!buffer) return null;

  let linkTranscript = null;

  // 1) Salvar no banco para acesso via Express
  try {
    const { db } = require('../database/database');
    const { v4: uuidv4 } = require('uuid');
    const transcriptId = uuidv4();
    db.prepare('INSERT OR REPLACE INTO transcripts (id, ticket_id, html) VALUES (?,?,?)')
      .run(transcriptId, ticketId, buffer.toString('utf-8'));

    // Fallback URL via Express
    const base = process.env.BOT_URL
      || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : null);
    if (base) linkTranscript = `${base}/transcript/${transcriptId}`;
  } catch (e) {
    console.error('[Transcript] Erro ao salvar no banco:', e.message);
  }

  // 2) Enviar arquivo HTML no canal dedicado
  try {
    const canalHtml = await guild.client.channels.fetch(config.channels.ticketHtml).catch(() => null);
    if (canalHtml) {
      const att = new AttachmentBuilder(buffer, { name: `transcript-${ticketId.toUpperCase()}.html` });
      const msg = await canalHtml.send({
        content: `📄 \`${ticketId.toUpperCase()}\` — <@${ticket.user_id || ticket.usuario_id}>`,
        files:   [att],
      }).catch(e => { console.error('[Transcript HTML]', e.message); return null; });
      if (msg?.attachments?.first()?.url) linkTranscript = msg.attachments.first().url;
    }
  } catch (e) {
    console.error('[Transcript] Erro ao enviar arquivo:', e.message);
  }

  // 3) Enviar embed de log no canal de transcript
  try {
    const abertura  = ticket.created_at
      ? moment.unix(ticket.created_at).tz(config.timezone).format('DD/MM/YYYY HH:mm')
      : '—';
    const duracao   = ticket.created_at
      ? Math.floor((Date.now() / 1000 - ticket.created_at) / 60)
      : 0;
    const atendente = ticket.claimed_by || ticket.atendente || 'Não assumido';
    const usuarioId = ticket.user_id    || ticket.usuario_id || '0';
    const fechadoPorId = ticket.closed_by || ticket.fechado_por || null;
    const motivo    = ticket.close_reason || ticket.motivo || '—';

    const embed = new EmbedBuilder()
      .setColor(config.colors.dark)
      .setTitle('📄 Transcript — Ticket Encerrado')
      .addFields(
        { name: '👤 Aberto por',  value: `<@${usuarioId}>`,                                    inline: true },
        { name: '🔒 Fechado por', value: fechadoPorId ? `<@${fechadoPorId}>` : fechadoPor,     inline: true },
        { name: '✋ Atendente',   value: atendente,                                             inline: true },
        { name: '🆔 Ticket',      value: `\`${ticketId.toUpperCase()}\``,                      inline: true },
        { name: '📋 Categoria',   value: (ticket.category || ticket.tipo || 'suporte').toUpperCase(), inline: true },
        { name: '⏱️ Duração',     value: `${duracao} min`,                                     inline: true },
        { name: '📅 Aberto em',   value: abertura,                                             inline: false },
        { name: '📝 Motivo',      value: motivo,                                               inline: false },
      )
      .setTimestamp()
      .setFooter({ text: 'MrStore • Transcript' });

    const components = linkTranscript ? [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel('📂 Abrir Transcript').setStyle(ButtonStyle.Link).setURL(linkTranscript),
      ),
    ] : [];

    const logCh = canalTranscript || await guild.client.channels.fetch(config.channels.ticketTranscript).catch(() => null);
    if (logCh) await logCh.send({ embeds: [embed], components }).catch(e => console.error('[Transcript LOG]', e.message));
  } catch (e) {
    console.error('[Transcript] Erro ao enviar embed:', e.message);
  }

  return linkTranscript;
}

module.exports = { sendTranscript, gerarHtml };
