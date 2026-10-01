const {
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require('discord.js');
const { isLoja } = require('../../utils/permissions');
const { abrirPainelBuilder } = require('../../systems/painelProduto');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('painel')
    .setDescription('🖼️ Criar painel de produto fixo num canal')
    .addChannelOption(o =>
      o.setName('canal')
       .setDescription('Canal onde o painel será postado')
       .setRequired(false)
    ),
  cooldown: 5,
  async execute(interaction) {
    if (!isLoja(interaction.member)) {
      return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
    }
    const canal = interaction.options.getChannel('canal') || interaction.channel;
    await abrirPainelBuilder(interaction, canal);
  },
};
