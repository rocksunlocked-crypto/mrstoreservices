const { SlashCommandBuilder } = require('discord.js');
const db = require('../database/ticketsDb');
const { isStaff, errorEmbed, successEmbed } = require('../utils/ticketHelpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('remover')
    .setDescription('Remove um usuário do ticket atual')
    .addUserOption(o => o.setName('usuario').setDescription('Usuário a ser removido').setRequired(true)),

  async execute(interaction) {
    const ticket = db.getTicketByChannel(interaction.channel.id);
    if (!ticket) return interaction.reply({ embeds: [errorEmbed('Este canal não é um ticket.')], ephemeral: true });
    if (!isStaff(interaction.member)) return interaction.reply({ embeds: [errorEmbed('Sem permissão.')], ephemeral: true });

    const target = interaction.options.getUser('usuario');
    if (target.id === ticket.user_id) {
      return interaction.reply({ embeds: [errorEmbed('Não é possível remover o dono do ticket.')], ephemeral: true });
    }

    await interaction.channel.permissionOverwrites.delete(target.id);
    db.addLog(ticket.ticket_id, 'USUÁRIO REMOVIDO', interaction.user.id, interaction.user.tag, target.tag);

    await interaction.reply({ embeds: [successEmbed(`${target} foi removido do ticket.`)] });
  },
};
