/**
 * Sistema de SLA (Service Level Agreement)
 * Monitora tickets e dispara alertas automáticos por inatividade,
 * falta de atendente, e violação de tempo de resposta.
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../config');
const db = require('../database/ticketsDb');

// ── Configurações de SLA por prioridade (em minutos) ─────────
const SLA_CONFIG = {
  urgente: { firstResponse: 30,   resolve: 120,  color: 0xFF0000 },
  alta:    { firstResponse: 120,  resolve: 480,  color: 0xED4245 },
  media:   { firstResponse: 480,  resolve: 1440, color: 0xFEE75C },
  baixa:   { firstResponse: 1440, resolve: 4320, color: 0x57F287 },
};

// ── Rastreia alertas já enviados (evita spam) ────────────────
const sentAlerts = new Set(); // `${ticketId}_${alertType}`

function markAlertSent(ticketId, alertType) {
  sentAlerts.add(`${ticketId}_${alertType}`);
}

function wasAlertSent(ticketId, alertType) {
  return sentAlerts.has(`${ticketId}_${alertType}`);
}

function clearAlerts(ticketId) {
  for (const key of sentAlerts) {
    if (key.startsWith(`${ticketId}_`)) sentAlerts.delete(key);
  }
}

// ── Calcula status do SLA ────────────────────────────────────
function getSLAStatus(ticket) {
  const sla = SLA_CONFIG[ticket.priority] || SLA_CONFIG.media;
  const now = Math.floor(Date.now() / 1000);
  const ageMinutes = (now - ticket.created_at) / 60;

  return {
    sla,
    ageMinutes,
    firstResponseBreached: ageMinutes > sla.firstResponse && !ticket.claimed_by,
    resolveBreached: ageMinutes > sla.resolve,
    firstResponseWarning: ageMinutes > sla.firstResponse * 0.75 && !ticket.claimed_by,
    resolveWarning: ageMinutes > sla.resolve * 0.75,
    percentFirst: Math.min(100, (ageMinutes / sla.firstResponse) * 100),
    percentResolve: Math.min(100, (ageMinutes / sla.resolve) * 100),
  };
}

// ── Barra de progresso ASCII ─────────────────────────────────
function progressBar(percent, length = 10) {
  const filled = Math.round((percent / 100) * length);
  const bar = '█'.repeat(filled) + '░'.repeat(length - filled);
  const color = percent >= 100 ? '🔴' : percent >= 75 ? '🟡' : '🟢';
  return `${color} \`${bar}\` ${Math.round(percent)}%`;
}

// ── Formata minutos em texto legível ─────────────────────────
function formatMinutes(minutes) {
  if (minutes < 60) return `${Math.round(minutes)}min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

// ── Embed de alerta SLA ──────────────────────────────────────
function buildSLAAlert(ticket, alertType) {
  const { getCategoryName } = require('../utils/ticketHelpers');
  const sla = SLA_CONFIG[ticket.priority] || SLA_CONFIG.media;
  const status = getSLAStatus(ticket);

  const alerts = {
    no_response_warning: {
      title: '⚠️ SLA — Aviso de Primeira Resposta',
      desc: `O ticket **${ticket.ticket_id}** está sem atendente e atingiu **75%** do tempo limite de primeira resposta.`,
      color: 0xFEE75C,
    },
    no_response_breach: {
      title: '🚨 SLA VIOLADO — Sem Primeira Resposta',
      desc: `O ticket **${ticket.ticket_id}** **ultrapassou o prazo** de primeira resposta!\n\n> Nenhum membro da staff assumiu este ticket ainda.`,
      color: 0xFF0000,
    },
    resolve_warning: {
      title: '⚠️ SLA — Aviso de Resolução',
      desc: `O ticket **${ticket.ticket_id}** atingiu **75%** do tempo limite de resolução.`,
      color: 0xFEE75C,
    },
    resolve_breach: {
      title: '🚨 SLA VIOLADO — Prazo de Resolução',
      desc: `O ticket **${ticket.ticket_id}** **ultrapassou o prazo máximo** de resolução!`,
      color: 0xFF0000,
    },
    inactive_user: {
      title: '💤 Ticket Inativo — Aguardando Usuário',
      desc: `O ticket **${ticket.ticket_id}** está aguardando resposta do usuário há muito tempo.`,
      color: 0x5865F2,
    },
  };

  const alert = alerts[alertType] || alerts.no_response_warning;

  return new EmbedBuilder()
    .setTitle(alert.title)
    .setColor(alert.color)
    .setDescription(alert.desc)
    .addFields(
      { name: '👤 Usuário', value: `<@${ticket.user_id}>`, inline: true },
      { name: '📂 Categoria', value: getCategoryName(ticket.category), inline: true },
      { name: '🎯 Prioridade', value: config.priorities[ticket.priority]?.label || ticket.priority, inline: true },
      { name: '✋ Atendente', value: ticket.claimed_by || '❌ Ninguém', inline: true },
      { name: '⏱️ Idade do Ticket', value: formatMinutes(status.ageMinutes), inline: true },
      { name: '📊 SLA Primeira Resposta', value: progressBar(status.percentFirst) + ` (limite: ${formatMinutes(sla.firstResponse)})` },
      { name: '📊 SLA Resolução', value: progressBar(status.percentResolve) + ` (limite: ${formatMinutes(sla.resolve)})` },
    )
    .setTimestamp();
}

// ── Monitor principal — executado periodicamente ─────────────
async function runSLAMonitor(client) {
  for (const [guildId, guild] of client.guilds.cache) {
    const openTickets = db.getAllTickets(guildId, 'open');

    for (const ticket of openTickets) {
      const channel = guild.channels.cache.get(ticket.channel_id);
      if (!channel) continue;

      const status = getSLAStatus(ticket);

      // Aviso de primeira resposta (75%)
      if (status.firstResponseWarning && !wasAlertSent(ticket.ticket_id, 'no_response_warning')) {
        markAlertSent(ticket.ticket_id, 'no_response_warning');
        await sendSLAAlert(channel, ticket, 'no_response_warning', guild);
      }

      // Violação de primeira resposta (100%)
      if (status.firstResponseBreached && !wasAlertSent(ticket.ticket_id, 'no_response_breach')) {
        markAlertSent(ticket.ticket_id, 'no_response_breach');
        await sendSLAAlert(channel, ticket, 'no_response_breach', guild);
      }

      // Aviso de resolução (75%)
      if (status.resolveWarning && !wasAlertSent(ticket.ticket_id, 'resolve_warning')) {
        markAlertSent(ticket.ticket_id, 'resolve_warning');
        await sendSLAAlert(channel, ticket, 'resolve_warning', guild);
      }

      // Violação de resolução (100%)
      if (status.resolveBreached && !wasAlertSent(ticket.ticket_id, 'resolve_breach')) {
        markAlertSent(ticket.ticket_id, 'resolve_breach');
        await sendSLAAlert(channel, ticket, 'resolve_breach', guild);
      }
    }
  }
}

async function sendSLAAlert(channel, ticket, alertType, guild) {
  try {
    const embed = buildSLAAlert(ticket, alertType);
    const isBreached = alertType.includes('breach');

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`ticket_claim_${ticket.ticket_id}`)
        .setLabel('Assumir Agora')
        .setEmoji('✋')
        .setStyle(ButtonStyle.Primary),
    );

    const mentionRoles = isBreached
      ? `<@&${config.roles.admin}> <@&${config.roles.moderador}>`
      : `<@&${config.roles.suporte}>`;

    await channel.send({
      content: mentionRoles,
      embeds: [embed],
      components: [row],
    });
  } catch (err) {
    console.error(`[SLA] Erro ao enviar alerta para ${ticket.ticket_id}:`, err.message);
  }
}

module.exports = {
  runSLAMonitor,
  getSLAStatus,
  progressBar,
  formatMinutes,
  SLA_CONFIG,
  clearAlerts,
};
