const { SlashCommandBuilder } = require('discord.js');
const { menuCaixas, historicoCaixas } = require('../../systems/caixaMisteriosa');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('caixa')
    .setDescription('🎁 Sistema de caixas misteriosas')
    .addSubcommand(sub => sub.setName('abrir').setDescription('🎁 Ver caixas disponíveis para abrir'))
    .addSubcommand(sub => sub.setName('historico').setDescription('📜 Ver histórico de caixas abertas')),
  cooldown: 5,
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'abrir') return menuCaixas(interaction);
    if (sub === 'historico') return historicoCaixas(interaction);
  },
};
