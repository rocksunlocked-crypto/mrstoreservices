const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { buildTicketPanel } = require('../../tickets/panelBuilder');
const { savePanel } = require('../../database/ticketsDb');
const { isAdmin } = require('../../utils/ticketHelpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('painel')
    .setDescription('Envia o painel de abertura de tickets no canal atual')
    .setDefaultMemberPermissions('0')
    .addStringOption(o => o.setName('titulo').setDescription('Título personalizado do painel').setRequired(false))
    .addStringOption(o => o.setName('descricao').setDescription('Descrição personalizada do painel').setRequired(false)),

  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({ content: '❌ Apenas administradores podem usar este comando.', ephemeral: true });
    }

    const titulo = interaction.options.getString('titulo');
    const descricao = interaction.options.getString('descricao');

    const panel = buildTicketPanel(titulo, descricao);
    const msg = await interaction.channel.send(panel);
    savePanel(interaction.channel.id, msg.id, interaction.guild.id);

    await interaction.reply({ content: '✅ Painel enviado com sucesso!', ephemeral: true });
  },
};
