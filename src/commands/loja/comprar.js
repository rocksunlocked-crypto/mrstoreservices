const { SlashCommandBuilder } = require('discord.js');
const { Produtos } = require('../../database/database');
const { iniciarCompra } = require('../../systems/loja');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('comprar')
    .setDescription('💰 Compra um produto diretamente pelo ID')
    .addStringOption(o => o.setName('produto_id').setDescription('ID do produto').setRequired(true))
    .addStringOption(o => o.setName('cupom').setDescription('Código de cupom de desconto').setRequired(false)),
  cooldown: 5,
  async execute(interaction) {
    const produtoId = interaction.options.getString('produto_id');
    const cupom = interaction.options.getString('cupom');
    await iniciarCompra(interaction, produtoId, cupom);
  },
};
