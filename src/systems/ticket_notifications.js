/**
 * ticket_notifications.js
 *
 * Regras:
 * 1. Ao abrir ticket → DM de confirmação para o usuário (1x)
 * 2. Quando staff responde → DM para o usuário avisando (cooldown 5 min por ticket)
 * 3. Palavras-chave urgentes → pinga staff no canal (1x por ticket)
 * 4. NÃO marca staff repetidamente — só 1 menção ao abrir o ticket
 */

const { EmbedBuilder } = require('discord.js');
const config = require('../config');
const { getCategoryName } = require('../utils/ticketHelpers');

// Cooldown de notificação por ticket (5 min)
const lastNotifiedTs  = new Map(); // ticketId → timestamp
const NOTIFY_COOLDOWN = 5 * 60;   // segundos

// Palavras-chave urgentes (alerta 1x por ticket)
const URGENT_KEYWORDS   = ['urgente','emergência','emergencia','crítico','critico','socorro','imediato','grave'];
const keywordAlerted    = new Set();

// ── Notificar usuário no privado quando staff responde ────────
async function notifyStaffActivity(message, ticket) {
  if (message.author.bot) return;

  const isStaffMessage = isStaffMember(message.member);
  const usuarioId = ticket.user_id || ticket.usuario_id;

  // Só notifica o usuário quando é staff respondendo
  if (!isStaffMessage || message.author.id === usuarioId) return;

  const now      = Math.floor(Date.now() / 1000);
  const ticketId = ticket.ticket_id || ticket.id;
  const lastNotif = lastNotifiedTs.get(ticketId) || 0;

  // Cooldown — não spamma DM a cada mensagem do staff
  if ((now - lastNotif) < NOTIFY_COOLDOWN) return;
  lastNotifiedTs.set(ticketId, now);

  try {
    const guild  = message.guild;
    const member = await guild.members.fetch(usuarioId).catch(() => null);
    if (!member) return;

    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle('💬 Seu ticket recebeu uma resposta!')
      .setDescription([
        `**${message.author.tag}** respondeu no seu ticket **${ticketId}**.`,
        ``,
        `📍 Acesse o ticket para ver a mensagem:`,
      ].join('\n'))
      .addFields(
        { name: '🎫 Ticket',    value: `\`${ticketId}\``, inline: true },
        { name: '📂 Categoria', value: getCategoryName(ticket.category || ticket.tipo), inline: true },
      )
      .setFooter({ text: 'MrStore • Clique no link abaixo para acessar' })
      .setTimestamp();

    const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('🎫 Ver Ticket')
        .setStyle(ButtonStyle.Link)
        .setURL(`https://discord.com/channels/${guild.id}/${ticket.channel_id || ticket.canal_id}`),
    );

    await member.send({ embeds: [embed], components: [row] }).catch(() => {});
  } catch (e) {
    console.error('[Notifications] Erro ao notificar usuário:', e.message);
  }
}

// ── Verificar palavras-chave urgentes ─────────────────────────
async function checkUrgentKeywords(message, ticket) {
  if (message.author.bot) return;
  const usuarioId = ticket.user_id || ticket.usuario_id;
  if (message.author.id !== usuarioId) return;

  const content   = message.content.toLowerCase();
  const hasUrgent = URGENT_KEYWORDS.some(kw => content.includes(kw));
  if (!hasUrgent) return;

  const ticketId = ticket.ticket_id || ticket.id;
  if (keywordAlerted.has(ticketId)) return;
  keywordAlerted.add(ticketId);

  const embed = new EmbedBuilder()
    .setColor(0xFF0000)
    .setTitle('🚨 Palavra-chave Urgente Detectada')
    .setDescription(
      `O usuário <@${usuarioId}> usou uma palavra de urgência no ticket **${ticketId}**.\n\n` +
      `> *"${message.content.slice(0, 200)}"*`
    )
    .addFields({ name: '🔗 Canal', value: `${message.channel}`, inline: true })
    .setTimestamp();

  await message.channel.send({
    content: `<@&${config.roles.admin}> <@&${config.roles.mod}>`,
    embeds:  [embed],
  }).catch(() => {});
}

// ── DM de confirmação ao abrir ticket ─────────────────────────
async function sendOpenConfirmDM(member, ticket) {
  const ticketId   = ticket.ticket_id || ticket.id;
  const categoryId = ticket.category || ticket.tipo || 'suporte';

  const tempos = {
    denuncia: '⏱️ Até 24 horas',
    suporte:  '⏱️ Até 12 horas',
    parceria: '⏱️ Até 48 horas',
  };

  try {
    const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
    const embed = new EmbedBuilder()
      .setTitle('🎫 Seu ticket foi aberto!')
      .setColor(config.colors[categoryId] || config.colors.primary)
      .setDescription(
        `Seu ticket foi criado com sucesso.\n\n` +
        `Nossa equipe irá te atender em breve.\n` +
        `**Não abra múltiplos tickets** para o mesmo assunto.`
      )
      .addFields(
        { name: '🎫 ID',           value: `\`${ticketId}\``,                      inline: true },
        { name: '📂 Categoria',    value: getCategoryName(categoryId),             inline: true },
        { name: '🏷️ Assunto',      value: ticket.subject || 'Sem assunto',         inline: false },
        { name: '⏰ Previsão',      value: tempos[categoryId] || '⏱️ Em breve',    inline: false },
      )
      .setFooter({ text: 'Não feche o ticket até resolver seu problema!' })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('🎫 Ir para o Ticket')
        .setStyle(ButtonStyle.Link)
        .setURL(`https://discord.com/channels/${member.guild.id}/${ticket.channel_id || ticket.canal_id}`),
    );

    await member.send({ embeds: [embed], components: [row] });
  } catch {}
}

// ── Helper interno ─────────────────────────────────────────────
function isStaffMember(member) {
  if (!member) return false;
  if (member.permissions.has('Administrator')) return true;
  const staffRoles = [
    config.roles.owner, config.roles.chefe, config.roles.admin,
    config.roles.mod, config.roles.suporte, config.roles.loja,
    config.roles.aceitarCompra,
    config.tickets?.roles?.admin, config.tickets?.roles?.moderador, config.tickets?.roles?.suporte,
  ].filter(Boolean);
  return staffRoles.some(r => member.roles.cache.has(r));
}

module.exports = { notifyStaffActivity, checkUrgentKeywords, sendOpenConfirmDM };
