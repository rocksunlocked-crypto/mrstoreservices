const { SlashCommandBuilder } = require('discord.js');
const { mostrarCarrinho } = require('../../systems/carrinho');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('carrinho')
    .setDescription('🛒 Veja e gerencie seu carrinho de compras')
    .setDefaultMemberPermissions('0'),
  cooldown: 3,
  async execute(interaction) {
    await mostrarCarrinho(interaction);
  },
};
