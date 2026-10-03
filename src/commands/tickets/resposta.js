const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../../database/ticketsDb');
const { isStaff, isAdmin, errorEmbed, successEmbed } = require('../../utils/ticketHelpers');
const config = require('../../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('resposta')
    .setDescription('Gerencia respostas rápidas pré-definidas')
    .setDefaultMemberPermissions('0')
    .addSubcommand(sub =>
      sub.setName('criar')
        .setDescription('Cria uma resposta rápida')
        .addStringOption(o => o.setName('nome').setDescription('Nome da resposta').setRequired(true))
        .addStringOption(o => o.setName('conteudo').setDescription('Conteúdo da resposta').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('usar')
        .setDescription('Envia uma resposta rápida no ticket')
        .addStringOption(o => o.setName('nome').setDescription('Nome da resposta').setRequired(true).setAutocomplete(true))
    )
    .addSubcommand(sub =>
      sub.setName('listar')
        .setDescription('Lista todas as respostas rápidas')
    )
    .addSubcommand(sub =>
      sub.setName('deletar')
        .setDescription('Deleta uma resposta rápida')
        .addIntegerOption(o => o.setName('id').setDescription('ID da resposta').setRequired(true))
    ),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused();
    const respostas = db.getSavedResponses(interaction.guild.id);
    const filtered = respostas.filter(r => r.name.toLowerCase().includes(focused.toLowerCase())).slice(0, 25);
    await interaction.respond(filtered.map(r => ({ name: r.name, value: r.name })));
  },

  async execute(interaction) {
    if (!isStaff(interaction.member)) {
      return interaction.reply({ embeds: [errorEmbed('Sem permissão.')], ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'criar') {
      if (!isAdmin(interaction.member)) {
        return interaction.reply({ embeds: [errorEmbed('Apenas admins podem criar respostas rápidas.')], ephemeral: true });
      }
      const nome = interaction.options.getString('nome');
      const conteudo = interaction.options.getString('conteudo');
      db.saveResponse(interaction.guild.id, nome, conteudo, interaction.user.tag);
      await interaction.reply({ embeds: [successEmbed(`Resposta rápida \`${nome}\` criada!`)], ephemeral: true });
    }

    if (sub === 'usar') {
      const nome = interaction.options.getString('nome');
      const resposta = db.getSavedResponse(interaction.guild.id, nome);
      if (!resposta) return interaction.reply({ embeds: [errorEmbed(`Resposta \`${nome}\` não encontrada.`)], ephemeral: true });

      const ticket = db.getTicketByChannel(interaction.channel.id);

      const embed = new EmbedBuilder()
        .setColor(config.colors.primary)
        .setDescription(resposta.content)
        .setFooter({ text: `Resposta enviada por ${interaction.user.tag}` })
        .setTimestamp();

      await interaction.channel.send({ embeds: [embed] });
      await interaction.reply({ content: '✅ Resposta enviada!', ephemeral: true });
    }

    if (sub === 'listar') {
      const respostas = db.getSavedResponses(interaction.guild.id);
      if (respostas.length === 0) {
        return interaction.reply({ embeds: [errorEmbed('Nenhuma resposta rápida cadastrada.')], ephemeral: true });
      }
      const embed = new EmbedBuilder()
        .setTitle('💾 Respostas Rápidas')
        .setColor(config.colors.primary)
        .setDescription(respostas.map(r => `**ID ${r.id}** • \`${r.name}\` — por ${r.created_by}`).join('\n'));
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === 'deletar') {
      if (!isAdmin(interaction.member)) {
        return interaction.reply({ embeds: [errorEmbed('Apenas admins podem deletar respostas.')], ephemeral: true });
      }
      const id = interaction.options.getInteger('id');
      const result = db.deleteSavedResponse(id, interaction.guild.id);
      if (!result.changes) return interaction.reply({ embeds: [errorEmbed(`Resposta ID ${id} não encontrada.`)], ephemeral: true });
      await interaction.reply({ embeds: [successEmbed(`Resposta ID ${id} deletada.`)], ephemeral: true });
    }
  },
};
