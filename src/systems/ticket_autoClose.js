/**
 * Sistema de Auto-Close aprimorado
 * - Aviso com botão "Manter Aberto"
 * - Múltiplos estágios de aviso (25%, 50%, 75%, 100%)
 * - Tracking de quem clicou em manter aberto
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../config');
const db = require('../database/ticketsDb');

// Limite de inatividade em horas por prioridade
const INACTIVITY_LIMITS = {
  urgente: 12,
  alta:    24,
  media:   48,
  baixa:   72,
};

// Rastreia avisos já enviados
const warningSent = new Map(); // ticketId -> Set de estágios

function getWarningStages(ticketId) {
  if (!warningSent.has(ticketId)) warningSent.set(ticketId, new Set());
  return warningSent.get(ticketId);
}

function wasWarningSent(ticketId, stage) {
  return getWarningStages(ticketId).has(stage);
}

function markWarningSent(ticketId, stage) {
  getWarningStages(ticketId).add(stage);
}

function clearWarnings(ticketId) {
  warningSent.delete(ticketId);
}

// ── Verifica última mensagem do usuário no canal ─────────────
async function getLastUserMessageTime(channel, userId) {
  try {
    const messages = await channel.messages.fetch({ limit: 100 });
    const userMessages = messages.filter(m => m.author.id === userId && !m.author.bot);
    if (userMessages.size === 0) return null;
    const sorted = [...userMessages.values()].sort((a, b) => b.createdTimestamp - a.createdTimestamp);
    return Math.floor(sorted[0].createdTimestamp / 1000);
  } catch {
    return null;
  }
}

// ── Embed de aviso de inatividade ────────────────────────────
function buildInactivityWarning(ticket, hoursLimit, hoursInactive, stage) {
  const hoursLeft = hoursLimit - hoursInactive;
  const isLast = stage === 'final';

  const stageColors = { early: 0x57F287, mid: 0xFEE75C, late: 0xED4245, final: 0xFF0000 };
  const stageEmojis = { early: '💤', mid: '⚠️', late: '🔴', final: '🚨' };

  return new EmbedBuilder()
    .setTitle(`${stageEmojis[stage]} Ticket Inativo — ${isLast ? 'Fechamento Iminente' : 'Aviso de Inatividade'}`)
    .setColor(stageColors[stage])
    .setDescription(
      isLast
        ? `**Este ticket será fechado em 30 minutos** por inatividade.\n\n> O usuário não respondeu há **${Math.round(hoursInactive)}h**.\n> Clique em **"Manter Aberto"** para cancelar o fechamento.`
        : `**Aviso de inatividade** — sem resposta do usuário há **${Math.round(hoursInactive)}h**.\n\n> O ticket será fechado automaticamente em **${Math.round(hoursLeft)}h** se não houver atividade.\n> Clique em **"Manter Aberto"** para reiniciar o contador.`
    )
    .addFields(
      { name: '🎫 Ticket', value: `\`${ticket.ticket_id}\``, inline: true },
      { name: '👤 Usuário', value: `<@${ticket.user_id}>`, inline: true },
      { name: '⏱️ Inativo há', value: `${Math.round(hoursInactive)}h`, inline: true },
      { name: '🔒 Fecha em', value: isLast ? '30 minutos' : `${Math.round(hoursLeft)}h`, inline: true },
    )
    .setTimestamp();
}

// ── Botões de ação do aviso ───────────────────────────────────
function buildInactivityButtons(ticketId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`autoclose_keep_${ticketId}`)
      .setLabel('Manter Aberto')
      .setEmoji('🔓')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`ticket_close_${ticketId}`)
      .setLabel('Fechar Agora')
      .setEmoji('🔒')
      .setStyle(ButtonStyle.Danger),
  );
}

// ── Monitor principal ────────────────────────────────────────
async function runAutoCloseMonitor(client) {
  for (const [guildId, guild] of client.guilds.cache) {
    const openTickets = db.getAllTickets(guildId, 'open');

    for (const ticket of openTickets) {
      const channel = guild.channels.cache.get(ticket.channel_id);
      if (!channel) continue;

      const hoursLimit = INACTIVITY_LIMITS[ticket.priority] || INACTIVITY_LIMITS.media;
      const lastUserMsg = await getLastUserMessageTime(channel, ticket.user_id);
      const referenceTs = lastUserMsg || ticket.created_at;
      const now = Math.floor(Date.now() / 1000);
      const hoursInactive = (now - referenceTs) / 3600;
      const ratio = hoursInactive / hoursLimit;

      // Estágio 1 — aviso inicial (50%)
      if (ratio >= 0.5 && !wasWarningSent(ticket.ticket_id, 'early')) {
        markWarningSent(ticket.ticket_id, 'early');
        const member = await guild.members.fetch(ticket.user_id).catch(() => null);
        await channel.send({
          content: member ? `${member}` : '',
          embeds: [buildInactivityWarning(ticket, hoursLimit, hoursInactive, 'early')],
          components: [buildInactivityButtons(ticket.ticket_id)],
        }).catch(() => {});
      }

      // Estágio 2 — aviso intermediário (75%)
      if (ratio >= 0.75 && !wasWarningSent(ticket.ticket_id, 'mid')) {
        markWarningSent(ticket.ticket_id, 'mid');
        const member = await guild.members.fetch(ticket.user_id).catch(() => null);
        await channel.send({
          content: member ? `${member}` : '',
          embeds: [buildInactivityWarning(ticket, hoursLimit, hoursInactive, 'mid')],
          components: [buildInactivityButtons(ticket.ticket_id)],
        }).catch(() => {});
      }

      // Estágio 3 — aviso tardio (90%)
      if (ratio >= 0.9 && !wasWarningSent(ticket.ticket_id, 'late')) {
        markWarningSent(ticket.ticket_id, 'late');
        const member = await guild.members.fetch(ticket.user_id).catch(() => null);
        await channel.send({
          content: member ? `${member} <@&${config.roles.suporte}>` : `<@&${config.roles.suporte}>`,
          embeds: [buildInactivityWarning(ticket, hoursLimit, hoursInactive, 'late')],
          components: [buildInactivityButtons(ticket.ticket_id)],
        }).catch(() => {});
      }

      // Estágio 4 — fechamento iminente (95%)
      if (ratio >= 0.95 && !wasWarningSent(ticket.ticket_id, 'final')) {
        markWarningSent(ticket.ticket_id, 'final');
        const member = await guild.members.fetch(ticket.user_id).catch(() => null);
        await channel.send({
          content: member ? `${member}` : '',
          embeds: [buildInactivityWarning(ticket, hoursLimit, hoursInactive, 'final')],
          components: [buildInactivityButtons(ticket.ticket_id)],
        }).catch(() => {});
      }

      // Fecha automaticamente (100%)
      if (ratio >= 1.0 && !wasWarningSent(ticket.ticket_id, 'closed')) {
        markWarningSent(ticket.ticket_id, 'closed');
        await executeAutoClose(channel, ticket, guild, client);
      }
    }
  }
}

// ── Executa o fechamento automático ─────────────────────────
async function executeAutoClose(channel, ticket, guild, client) {
  const { sendTranscript } = require('../utils/ticketTranscript');

  try {
    db.closeTicket(ticket.ticket_id, 'Auto-close', `Inatividade de ${INACTIVITY_LIMITS[ticket.priority] || 48}h`);
    db.addLog(ticket.ticket_id, 'AUTO-FECHADO', 'SISTEMA', 'Bot', `Inatividade`);

    // Transcript automático
    const transcriptCh = guild.channels.cache.get(config.channels.transcript);
    if (transcriptCh) {
      const updatedTicket = db.getTicket(ticket.ticket_id);
      await sendTranscript(channel, updatedTicket, transcriptCh, 'Sistema (Auto-close)');
    }

    // DM para o usuário
    const member = await guild.members.fetch(ticket.user_id).catch(() => null);
    if (member) {
      const dmEmbed = new EmbedBuilder()
        .setTitle('🔒 Ticket Fechado por Inatividade')
        .setColor(config.colors.warning)
        .setDescription(`Seu ticket **${ticket.ticket_id}** foi fechado automaticamente por inatividade.\n\nSe ainda precisar de ajuda, abra um novo ticket.`)
        .setTimestamp();
      member.send({ embeds: [dmEmbed] }).catch(() => {});
    }

    await channel.send({
      embeds: [new EmbedBuilder()
        .setColor(config.colors.danger)
        .setTitle('🔒 Ticket Fechado Automaticamente')
        .setDescription('Este ticket foi fechado por inatividade prolongada.')
        .setTimestamp()],
    }).catch(() => {});

    // Deleta o canal após 1 minuto
    setTimeout(() => channel.delete('Auto-close por inatividade').catch(() => {}), 60_000);

  } catch (err) {
    console.error(`[AUTO-CLOSE] Erro ao fechar ${ticket.ticket_id}:`, err.message);
  }
}

// ── Handler do botão "Manter Aberto" ────────────────────────
async function handleKeepOpen(interaction, ticketId) {
  const ticket = db.getTicket(ticketId);
  if (!ticket) return interaction.reply({ content: '❌ Ticket não encontrado.', ephemeral: true });

  // Reseta os avisos para recomeçar o ciclo
  clearWarnings(ticketId);
  db.addLog(ticketId, 'AUTO-CLOSE CANCELADO', interaction.user.id, interaction.user.tag);

  await interaction.update({
    embeds: [new EmbedBuilder()
      .setColor(config.colors.success)
      .setDescription(`✅ **${interaction.user}** manteve o ticket aberto! O contador de inatividade foi reiniciado.`)
      .setTimestamp()],
    components: [],
  });
}

module.exports = {
  runAutoCloseMonitor,
  handleKeepOpen,
  clearWarnings,
  INACTIVITY_LIMITS,
};
