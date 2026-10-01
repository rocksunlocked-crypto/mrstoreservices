const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database/ticketsDb');
const { isStaff, errorEmbed, successEmbed } = require('../../utils/ticketHelpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('renomear')
    .setDescription('Renomeia o canal do ticket atual')
    .addStringOption(o => o.setName('nome').setDescription('Novo assunto/nome').setRequired(true)),

  async execute(interaction) {
    const ticket = db.getTicketByChannel(interaction.channel.id);
    if (!ticket) return interaction.reply({ embeds: [errorEmbed('Este canal não é um ticket.')], ephemeral: true });
    if (!isStaff(interaction.member)) return interaction.reply({ embeds: [errorEmbed('Sem permissão.')], ephemeral: true });

    const nome = interaction.options.getString('nome').toLowerCase().replace(/\s+/g, '-').slice(0, 90);
    const novoNome = `🎫│${ticket.ticket_id.toLowerCase()}-${nome}`;

    await interaction.channel.setName(novoNome);
    db.updateTicket(ticket.ticket_id, { subject: interaction.options.getString('nome') });
    db.addLog(ticket.ticket_id, 'RENOMEADO', interaction.user.id, interaction.user.tag, novoNome);

    await interaction.reply({ embeds: [successEmbed(`Canal renomeado para **${novoNome}**.`)] });
  },
};
