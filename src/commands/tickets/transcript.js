const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database/ticketsDb');
const { isStaff, errorEmbed, successEmbed } = require('../../utils/ticketHelpers');
const { sendTranscript } = require('../../utils/ticketTranscript');
const config = require('../../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('transcript')
    .setDescription('Gera e salva o transcript do ticket atual')
    .setDefaultMemberPermissions('0'),

  async execute(interaction) {
    const ticket = db.getTicketByChannel(interaction.channel.id);
    if (!ticket) return interaction.reply({ embeds: [errorEmbed('Este canal não é um ticket.')], ephemeral: true });
    if (!isStaff(interaction.member)) return interaction.reply({ embeds: [errorEmbed('Sem permissão.')], ephemeral: true });

    await interaction.deferReply({ ephemeral: true });

    const transcriptCh = interaction.guild.channels.cache.get(config.channels.transcript);
    if (!transcriptCh) {
      return interaction.editReply({ embeds: [errorEmbed('Canal de transcript não encontrado.')] });
    }

    await sendTranscript(interaction.channel, ticket, transcriptCh, interaction.user.tag);
    db.addLog(ticket.ticket_id, 'TRANSCRIPT GERADO', interaction.user.id, interaction.user.tag);

    await interaction.editReply({ embeds: [successEmbed(`Transcript enviado para ${transcriptCh}!`)] });
  },
};
