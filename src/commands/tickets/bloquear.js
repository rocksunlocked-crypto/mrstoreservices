const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../database/ticketsDb');
const { isAdmin, errorEmbed, successEmbed } = require('../utils/ticketHelpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bloquear')
    .setDescription('Bloqueia ou desbloqueia um usuário de abrir tickets')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
      sub.setName('usuario')
        .setDescription('Bloqueia um usuário de abrir tickets')
        .addUserOption(o => o.setName('usuario').setDescription('Usuário a bloquear').setRequired(true))
        .addStringOption(o => o.setName('motivo').setDescription('Motivo do bloqueio').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('remover')
        .setDescription('Remove o bloqueio de um usuário')
        .addUserOption(o => o.setName('usuario').setDescription('Usuário a desbloquear').setRequired(true))
    ),

  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({ embeds: [errorEmbed('Apenas administradores podem usar este comando.')], ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();
    const target = interaction.options.getUser('usuario');

    if (sub === 'usuario') {
      const motivo = interaction.options.getString('motivo') || 'Sem motivo informado';
      db.blockUser(target.id, interaction.guild.id, motivo, interaction.user.tag);
      await interaction.reply({
        embeds: [successEmbed(`🔐 **${target.tag}** foi **bloqueado** de abrir tickets.\n**Motivo:** ${motivo}`)],
      });
    }

    if (sub === 'remover') {
      const result = db.unblockUser(target.id, interaction.guild.id);
      if (!result.changes) return interaction.reply({ embeds: [errorEmbed(`${target.tag} não está bloqueado.`)], ephemeral: true });
      await interaction.reply({ embeds: [successEmbed(`🔓 **${target.tag}** foi **desbloqueado** com sucesso.`)] });
    }
  },
};
