const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const db = require('../../database/ticketsDb');
const { isStaff, errorEmbed } = require('../../utils/ticketHelpers');
const config = require('../../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('prioridade')
    .setDescription('Define a prioridade do ticket atual')
    .addStringOption(o =>
      o.setName('nivel')
        .setDescription('Nível de prioridade')
        .setRequired(true)
        .addChoices(
          { name: '🟢 Baixa', value: 'baixa' },
          { name: '🟡 Média', value: 'media' },
          { name: '🔴 Alta', value: 'alta' },
          { name: '🚨 Urgente', value: 'urgente' },
        )
    ),

  async execute(interaction) {
    const ticket = db.getTicketByChannel(interaction.channel.id);
    if (!ticket) return interaction.reply({ embeds: [errorEmbed('Este canal não é um ticket.')], ephemeral: true });
    if (!isStaff(interaction.member)) return interaction.reply({ embeds: [errorEmbed('Sem permissão.')], ephemeral: true });

    const nivel = interaction.options.getString('nivel');
    const priorityInfo = config.priorities[nivel];

    db.updateTicket(ticket.ticket_id, { priority: nivel });
    db.addLog(ticket.ticket_id, 'PRIORIDADE ALTERADA', interaction.user.id, interaction.user.tag, `→ ${priorityInfo.label}`);

    const embed = new EmbedBuilder()
      .setColor(priorityInfo.color)
      .setDescription(`🎯 Prioridade do ticket definida como **${priorityInfo.label}** por ${interaction.user}!`)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
