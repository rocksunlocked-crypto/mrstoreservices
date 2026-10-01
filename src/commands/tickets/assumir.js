const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database/ticketsDb');
const { isStaff, errorEmbed } = require('../../utils/ticketHelpers');
const config = require('../../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('assumir')
    .setDescription('Assume (claim) o ticket atual como atendente'),

  async execute(interaction) {
    const ticket = db.getTicketByChannel(interaction.channel.id);
    if (!ticket) return interaction.reply({ embeds: [errorEmbed('Este canal não é um ticket.')], ephemeral: true });
    if (!isStaff(interaction.member)) return interaction.reply({ embeds: [errorEmbed('Sem permissão.')], ephemeral: true });
    if (ticket.status === 'closed') return interaction.reply({ embeds: [errorEmbed('Este ticket está fechado.')], ephemeral: true });

    if (ticket.claimed_by) {
      return interaction.reply({
        embeds: [errorEmbed(`Este ticket já está sendo atendido por **${ticket.claimed_by}**.\nUse \`/transferir\` para transferir.`)],
        ephemeral: true,
      });
    }

    db.updateTicket(ticket.ticket_id, { claimed_by: interaction.user.tag });
    db.addLog(ticket.ticket_id, 'ASSUMIDO', interaction.user.id, interaction.user.tag);
    db.upsertStaffStat(interaction.user.id, interaction.user.tag, 'tickets_claimed');

    const embed = new EmbedBuilder()
      .setColor(config.colors.success)
      .setDescription(`✋ **${interaction.user}** assumiu este ticket e irá te atender!`)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
