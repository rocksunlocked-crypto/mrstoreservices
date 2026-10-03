const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database/ticketsDb');
const { isStaff, errorEmbed, successEmbed } = require('../../utils/ticketHelpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('adicionar')
    .setDescription('Adiciona um usuário ao ticket atual')
    .setDefaultMemberPermissions('0')
    .addUserOption(o => o.setName('usuario').setDescription('Usuário a ser adicionado').setRequired(true)),

  async execute(interaction) {
    const ticket = db.getTicketByChannel(interaction.channel.id);
    if (!ticket) return interaction.reply({ embeds: [errorEmbed('Este canal não é um ticket.')], ephemeral: true });
    if (!isStaff(interaction.member)) return interaction.reply({ embeds: [errorEmbed('Sem permissão.')], ephemeral: true });

    const target = interaction.options.getUser('usuario');
    await interaction.channel.permissionOverwrites.edit(target.id, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
      AttachFiles: true,
    });

    db.addLog(ticket.ticket_id, 'USUÁRIO ADICIONADO', interaction.user.id, interaction.user.tag, target.tag);

    await interaction.reply({
      embeds: [successEmbed(`${target} foi adicionado ao ticket.`)],
    });
  },
};
