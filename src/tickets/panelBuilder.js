const {
  EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder,
  ButtonBuilder, ButtonStyle,
} = require('discord.js');
const config = require('../config');

// Constrói o painel de abertura de ticket com menu de seleção
function buildTicketPanel(customTitle, customDesc) {
  const embed = new EmbedBuilder()
    .setTitle(customTitle || 'CENTRAL DE ATENDIMENTO')
    .setColor(config.colors.primary)
    .setDescription(
      customDesc ||
      `Precisa falar com a equipe? Escolha uma categoria abaixo e responda algumas perguntas rápidas.\n\n` +
      `**${config.emojis.denuncia} Denúncia**\nReporte uma situação com segurança e sigilo.\n\n` +
      `**${config.emojis.suporte} Suporte**\nResolva dúvidas, problemas ou solicitações.\n\n` +
      `**${config.emojis.parceria} Parceria**\nEnvie uma proposta para o nosso time.\n\n` +
      `> Use uma categoria por assunto para agilizar o atendimento.`
    )
    .addFields({ name: '⏱️ Atendimento', value: 'Nossa equipe responderá assim que possível.', inline: true }, { name: '🔒 Privacidade', value: 'Seus tickets são visíveis apenas para você e a equipe.', inline: true })
    .setFooter({ text: 'Selecione uma categoria para começar' })
    .setTimestamp();

  const menu = new StringSelectMenuBuilder()
    .setCustomId('ticket_open_menu')
    .setPlaceholder('📋 Selecione o tipo de ticket...')
    .addOptions([
      {
        label: 'Denúncia',
        description: 'Reporte uma situação ou usuário',
        value: 'denuncia',
        emoji: '🚨',
      },
      {
        label: 'Suporte',
        description: 'Precisa de ajuda? Fale conosco!',
        value: 'suporte',
        emoji: '🛠️',
      },
      {
        label: 'Suporte AnyDesk',
        description: 'Atendimento remoto via AnyDesk',
        value: 'anydesk',
        emoji: '🖥️',
      },
      {
        label: 'Parceria',
        description: 'Proposta de parceria com o servidor',
        value: 'parceria',
        emoji: '🤝',
      },
    ]);

  const row = new ActionRowBuilder().addComponents(menu);
  return { embeds: [embed], components: [row] };
}

// Constrói embed de informações de um ticket para o painel admin
function buildTicketInfoEmbed(ticket, tags = [], notes = []) {
  const { getCategoryName, formatDate, getDuration } = require('../utils/ticketHelpers');
  const priorityInfo = config.priorities[ticket.priority] || config.priorities.media;

  const embed = new EmbedBuilder()
    .setTitle(`${config.emojis.ticket} ${ticket.ticket_id}`)
    .setColor(priorityInfo.color)
    .addFields(
      { name: '👤 Usuário', value: `<@${ticket.user_id}> (${ticket.username})`, inline: true },
      { name: '📂 Categoria', value: getCategoryName(ticket.category), inline: true },
      { name: '📌 Status', value: ticket.status === 'open' ? '🟢 Aberto' : '🔴 Fechado', inline: true },
      { name: '🎯 Prioridade', value: priorityInfo.label, inline: true },
      { name: '🏷️ Assunto', value: ticket.subject || 'Sem assunto', inline: true },
      { name: '✋ Atendente', value: ticket.claimed_by || 'Não atribuído', inline: true },
      { name: '📅 Aberto em', value: formatDate(ticket.created_at), inline: true },
      { name: '⏱️ Duração', value: getDuration(ticket.created_at, ticket.closed_at), inline: true },
      { name: '💬 Mensagens', value: String(ticket.message_count || 0), inline: true },
    )
    .setFooter({ text: `Canal: ${ticket.channel_id}` })
    .setTimestamp();

  if (tags.length > 0) embed.addFields({ name: `${config.emojis.tag} Tags`, value: tags.map(t => `\`${t}\``).join(' '), inline: false });
  if (notes.length > 0) embed.addFields({ name: `${config.emojis.note} Notas`, value: `${notes.length} nota(s) interna(s)`, inline: false });
  if (ticket.rating) embed.addFields({ name: '⭐ Avaliação', value: `${'⭐'.repeat(ticket.rating)} (${ticket.rating}/5)`, inline: true });
  if (ticket.close_reason) embed.addFields({ name: '📋 Motivo do fechamento', value: ticket.close_reason });

  return embed;
}

module.exports = { buildTicketPanel, buildTicketInfoEmbed };
