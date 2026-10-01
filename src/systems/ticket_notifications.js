/**
 * Sistema de Notificações e Alertas de Atividade
 * - Notifica staff quando usuário responde após inatividade
 * - DM de confirmação ao usuário quando ticket é aberto
 * - Alerta quando ticket urgente não tem atendente
 * - Ping ao staff quando usuário menciona palavras-chave críticas
 */

const { EmbedBuilder } = require('discord.js');
const config = require('../config');
const db = require('../database/ticketsDb');

// Palavras-chave que disparam alerta imediato
const URGENT_KEYWORDS = [
  'urgente', 'urgente!', 'emergência', 'emergencia', 'crítico', 'critico',
  'imediato', 'socorro', 'ajuda urgente', 'grave', 'sério', 'serio',
];

// Rastreia quais tickets tiveram notificação de resposta enviada
const lastNotifiedTs = new Map(); // ticketId -> timestamp da última notificação

const NOTIFICATION_COOLDOWN = 30 * 60; // 30 min entre notificações de atividade

// ── Notifica staff sobre resposta do usuário ─────────────────
async function notifyStaffActivity(message, ticket) {
  if (message.author.bot) return;

  const now = Math.floor(Date.now() / 1000);
  const lastNotif = lastNotifiedTs.get(ticket.ticket_id) || 0;

  if ((now - lastNotif) < NOTIFICATION_COOLDOWN) return;

  // Só notifica se o último a falar NÃO foi o usuário (evita spam)
  try {
    const messages = await message.channel.messages.fetch({ limit: 5, before: message.id });
    const prevMsgs = [...messages.values()];
    const lastNonBotMsg = prevMsgs.find(m => !m.author.bot);

    // Se a mensagem anterior já era do usuário, não notifica
    if (lastNonBotMsg && lastNonBotMsg.author.id === ticket.user_id) return;

    // Se não tem atendente, pinga suporte
    if (!ticket.claimed_by) {
      lastNotifiedTs.set(ticket.ticket_id, now);
      return; // Quem cuida disso é o SLA
    }

    lastNotifiedTs.set(ticket.ticket_id, now);

    const embed = new EmbedBuilder()
      .setColor(config.colors.info)
      .setDescription(`💬 **${message.author.tag}** respondeu no ticket **${ticket.ticket_id}**\n${message.channel}`)
      .setTimestamp();

    // Notifica o atendente que assumiu
    // (a notificação vai no próprio canal, para não spammar DMs)
    await message.channel.send({ embeds: [embed] }).catch(() => {});

  } catch {}
}

// ── Verifica palavras-chave críticas ─────────────────────────
async function checkUrgentKeywords(message, ticket) {
  if (message.author.bot || message.author.id !== ticket.user_id) return;

  const content = message.content.toLowerCase();
  const hasUrgentKeyword = URGENT_KEYWORDS.some(kw => content.includes(kw));

  if (!hasUrgentKeyword) return;
  if (wasKeywordAlerted(ticket.ticket_id)) return;

  markKeywordAlerted(ticket.ticket_id);

  const embed = new EmbedBuilder()
    .setColor(0xFF0000)
    .setTitle('🚨 Palavra-chave Crítica Detectada')
    .setDescription(
      `O usuário <@${ticket.user_id}> usou uma palavra de urgência no ticket **${ticket.ticket_id}**.\n\n` +
      `> Mensagem: *"${message.content.slice(0, 200)}"*`
    )
    .addFields({ name: '🔗 Canal', value: `${message.channel}`, inline: true })
    .setTimestamp();

  await message.channel.send({
    content: `<@&${config.roles.admin}> <@&${config.roles.moderador}>`,
    embeds: [embed],
  }).catch(() => {});
}

// ── DM de confirmação ao abrir ticket ───────────────────────
async function sendOpenConfirmDM(member, ticket) {
  const { getCategoryName } = require('../utils/ticketHelpers');
  try {
    const embed = new EmbedBuilder()
      .setTitle('🎫 Seu ticket foi aberto!')
      .setColor(config.colors[ticket.category] || config.colors.primary)
      .setDescription(
        `Seu ticket foi criado com sucesso e nossa equipe irá te atender em breve.\n\n` +
        `**Por favor, não abra múltiplos tickets** para o mesmo assunto.`
      )
      .addFields(
        { name: '🎫 ID', value: `\`${ticket.ticket_id}\``, inline: true },
        { name: '📂 Categoria', value: getCategoryName(ticket.category), inline: true },
        { name: '🏷️ Assunto', value: ticket.subject, inline: false },
        { name: '⏰ Previsão de Resposta', value: getCategoryResponseTime(ticket.category), inline: false },
      )
      .setFooter({ text: 'Não feche o ticket até ter seu problema resolvido!' })
      .setTimestamp();

    await member.send({ embeds: [embed] });
  } catch {}
}

function getCategoryResponseTime(category) {
  const times = {
    denuncia: '🕐 Até 24 horas',
    suporte:  '🕐 Até 12 horas',
    parceria: '🕐 Até 48 horas',
  };
  return times[category] || '🕐 Em breve';
}

// Controle de alerta de keyword por ticket
const keywordAlerted = new Set();
function wasKeywordAlerted(ticketId) { return keywordAlerted.has(ticketId); }
function markKeywordAlerted(ticketId) { keywordAlerted.add(ticketId); }

module.exports = {
  notifyStaffActivity,
  checkUrgentKeywords,
  sendOpenConfirmDM,
};
