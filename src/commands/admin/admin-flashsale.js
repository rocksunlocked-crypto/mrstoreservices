const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { iniciarFlashSale, encerrarFlashSale, listarAtivas } = require('../../systems/flashsale');
const { isAdmin } = require('../../utils/permissions');
const config = require('../../config');
const moment = require('moment-timezone');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('flashsale')
    .setDescription('⚡ Gerenciar ofertas relâmpago')
    .addSubcommand(sub =>
      sub.setName('iniciar')
         .setDescription('⚡ Iniciar uma flash sale')
         .addStringOption(o => o.setName('produto_id').setDescription('ID do produto').setRequired(true))
         .addIntegerOption(o => o.setName('desconto').setDescription('Desconto em % (ex: 30)').setRequired(true).setMinValue(1).setMaxValue(90))
         .addIntegerOption(o => o.setName('duracao').setDescription('Duração em minutos').setRequired(true).setMinValue(5).setMaxValue(1440))
    )
    .addSubcommand(sub =>
      sub.setName('encerrar')
         .setDescription('⏹️ Encerrar flash sale ativa')
         .addStringOption(o => o.setName('produto_id').setDescription('ID do produto').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('listar').setDescription('📋 Ver flash sales ativas')
    ),
  cooldown: 5,
  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
    }
    await interaction.deferReply({ ephemeral: true });
    const sub = interaction.options.getSubcommand();

    if (sub === 'iniciar') {
      const produtoId  = interaction.options.getString('produto_id');
      const desconto   = interaction.options.getInteger('desconto');
      const duracao    = interaction.options.getInteger('duracao');

      const { ok, erro, precoPromo, expira } = await iniciarFlashSale({
        produtoId, desconto, duracaoMin: duracao,
        guild: interaction.guild, executorId: interaction.user.id,
      });

      if (!ok) return interaction.editReply({ content: `❌ ${erro}` });

      return interaction.editReply({
        content: [
          `✅ **Flash Sale iniciada!**`,
          `💵 Novo preço: **R$ ${precoPromo.toFixed(2)}** (${desconto}% OFF)`,
          `⏰ Encerra: <t:${Math.floor(expira / 1000)}:R>`,
        ].join('\n'),
      });
    }

    if (sub === 'encerrar') {
      const produtoId = interaction.options.getString('produto_id');
      await encerrarFlashSale(produtoId, interaction.guild);
      return interaction.editReply({ content: '✅ Flash Sale encerrada.' });
    }

    if (sub === 'listar') {
      const ativas = listarAtivas();
      if (!ativas.length) return interaction.editReply({ content: '⚡ Nenhuma flash sale ativa.' });

      const embed = new EmbedBuilder()
        .setColor(config.colors.error)
        .setTitle('⚡ Flash Sales Ativas')
        .setTimestamp();

      for (const s of ativas) {
        embed.addFields({
          name: `⚡ ${s.produto?.nome || 'Produto'}`,
          value: [
            `💵 ~~R$ ${s.precoOriginal.toFixed(2)}~~ → **R$ ${s.precoPromo.toFixed(2)}** (${s.desconto}% OFF)`,
            `⏰ Encerra: <t:${Math.floor(s.expira / 1000)}:R>`,
          ].join('\n'),
          inline: false,
        });
      }

      return interaction.editReply({ embeds: [embed] });
    }
  },
};
