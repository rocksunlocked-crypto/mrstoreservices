const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database/ticketsDb');
const { errorEmbed } = require('../../utils/ticketHelpers');
const { buildTicketInfoEmbed } = require('../../tickets/panelBuilder');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('info')
    .setDescription('Exibe informações detalhadas do ticket atual'),

  async execute(interaction) {
    const ticket = db.getTicketByChannel(interaction.channel.id);
    if (!ticket) return interaction.reply({ embeds: [errorEmbed('Este canal não é um ticket.')], ephemeral: true });

    const tags = db.getTags(ticket.ticket_id);
    const notes = db.getNotes(ticket.ticket_id);
    const embed = buildTicketInfoEmbed(ticket, tags, notes);

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
