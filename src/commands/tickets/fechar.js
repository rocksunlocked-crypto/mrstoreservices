const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const db = require('../database/ticketsDb');
const { isStaff, errorEmbed } = require('../utils/ticketHelpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('fechar')
    .setDescription('Fecha o ticket atual')
    .addStringOption(o => o.setName('motivo').setDescription('Motivo do fechamento').setRequired(false)),

  async execute(interaction) {
    const ticket = db.getTicketByChannel(interaction.channel.id);
    if (!ticket) return interaction.reply({ embeds: [errorEmbed('Este canal não é um ticket.')], ephemeral: true });
    if (ticket.status === 'closed') return interaction.reply({ embeds: [errorEmbed('Este ticket já está fechado.')], ephemeral: true });

    const isOwner = ticket.user_id === interaction.user.id;
    if (!isStaff(interaction.member) && !isOwner) {
      return interaction.reply({ embeds: [errorEmbed('Sem permissão para fechar este ticket.')], ephemeral: true });
    }

    const motivo = interaction.options.getString('motivo') || 'Fechado via comando';
    const { closeTicket } = require('../tickets/ticketManager');
    await closeTicket(interaction, ticket, motivo);
  },
};
