const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../database/ticketsDb');
const { isStaff, errorEmbed, formatDate, getCategoryName } = require('../utils/ticketHelpers');
const config = require('../../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('historico')
    .setDescription('Exibe o histórico de ações do ticket atual'),

  async execute(interaction) {
    const ticket = db.getTicketByChannel(interaction.channel.id);
    if (!ticket) return interaction.reply({ embeds: [errorEmbed('Este canal não é um ticket.')], ephemeral: true });
    if (!isStaff(interaction.member)) return interaction.reply({ embeds: [errorEmbed('Sem permissão.')], ephemeral: true });

    const logs = db.getLogs(ticket.ticket_id);
    if (logs.length === 0) {
      return interaction.reply({ embeds: [errorEmbed('Nenhum registro de ações.')], ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setTitle(`📋 Histórico — ${ticket.ticket_id}`)
      .setColor(config.colors.info)
      .setDescription(logs.map(l =>
        `\`${formatDate(l.created_at)}\` **${l.action}** — ${l.actor_tag}${l.details ? `\n↳ ${l.details}` : ''}`
      ).join('\n'))
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
