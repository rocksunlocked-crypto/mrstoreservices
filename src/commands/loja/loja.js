const { SlashCommandBuilder } = require('discord.js');
const { mostrarLoja } = require('../../systems/loja');
const { Config } = require('../../database/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('loja')
    .setDescription('🛍️ Abre a loja e mostra os produtos disponíveis'),
  cooldown: 5,
  async execute(interaction) {
    if (!Config.get('loja_aberta')) {
      return interaction.reply({ content: '🔒 A loja está fechada no momento. Tente mais tarde!', ephemeral: true });
    }
    if (Config.get('manutencao')) {
      return interaction.reply({ content: '🔧 Bot em manutenção. Voltamos em breve!', ephemeral: true });
    }
    await mostrarLoja(interaction);
  },
};
