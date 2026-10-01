const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../database/ticketsDb');
const { isStaff, errorEmbed } = require('../utils/ticketHelpers');
const config = require('../../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('transferir')
    .setDescription('Transfere o ticket para outro membro da staff')
    .addUserOption(o => o.setName('staff').setDescription('Membro da staff que irá assumir').setRequired(true)),

  async execute(interaction) {
    const ticket = db.getTicketByChannel(interaction.channel.id);
    if (!ticket) return interaction.reply({ embeds: [errorEmbed('Este canal não é um ticket.')], ephemeral: true });
    if (!isStaff(interaction.member)) return interaction.reply({ embeds: [errorEmbed('Sem permissão.')], ephemeral: true });

    const target = interaction.options.getMember('staff');
    if (!isStaff(target)) {
      return interaction.reply({ embeds: [errorEmbed('O usuário selecionado não é staff.')], ephemeral: true });
    }

    const anterior = ticket.claimed_by || 'Nenhum';
    db.updateTicket(ticket.ticket_id, { claimed_by: target.user.tag });
    db.addLog(ticket.ticket_id, 'TRANSFERIDO', interaction.user.id, interaction.user.tag, `${anterior} → ${target.user.tag}`);
    db.upsertStaffStat(target.id, target.user.tag, 'tickets_claimed');

    const embed = new EmbedBuilder()
      .setColor(config.colors.info)
      .setDescription(`↔️ Ticket transferido de **${anterior}** para ${target}!`)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
