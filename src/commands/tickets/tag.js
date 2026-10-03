const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database/ticketsDb');
const { isStaff, errorEmbed, successEmbed } = require('../../utils/ticketHelpers');
const config = require('../../config');

const TAGS_DISPONIVEIS = [
  'bug', 'urgente', 'aguardando-usuario', 'aguardando-staff',
  'em-andamento', 'resolvido', 'duplicado', 'invalido',
  'vip', 'reincidente', 'verificado',
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('tag')
    .setDescription('Gerencia as tags do ticket atual')
    .setDefaultMemberPermissions('0')
    .addSubcommand(sub =>
      sub.setName('adicionar')
        .setDescription('Adiciona uma tag ao ticket')
        .addStringOption(o =>
          o.setName('nome').setDescription('Nome da tag').setRequired(true)
           .addChoices(...TAGS_DISPONIVEIS.map(t => ({ name: t, value: t })))
        )
    )
    .addSubcommand(sub =>
      sub.setName('remover')
        .setDescription('Remove uma tag do ticket')
        .addStringOption(o =>
          o.setName('nome').setDescription('Nome da tag').setRequired(true)
           .addChoices(...TAGS_DISPONIVEIS.map(t => ({ name: t, value: t })))
        )
    )
    .addSubcommand(sub =>
      sub.setName('listar')
        .setDescription('Lista as tags do ticket')
    ),

  async execute(interaction) {
    const ticket = db.getTicketByChannel(interaction.channel.id);
    if (!ticket) return interaction.reply({ embeds: [errorEmbed('Este canal não é um ticket.')], ephemeral: true });
    if (!isStaff(interaction.member)) return interaction.reply({ embeds: [errorEmbed('Sem permissão.')], ephemeral: true });

    const sub = interaction.options.getSubcommand();
    const nome = interaction.options.getString('nome');

    if (sub === 'adicionar') {
      const result = db.addTag(ticket.ticket_id, nome);
      if (!result) return interaction.reply({ embeds: [errorEmbed(`A tag \`${nome}\` já existe neste ticket.`)], ephemeral: true });
      db.addLog(ticket.ticket_id, 'TAG ADICIONADA', interaction.user.id, interaction.user.tag, nome);
      await interaction.reply({ embeds: [successEmbed(`Tag \`${nome}\` adicionada ao ticket!`)] });
    }

    if (sub === 'remover') {
      const result = db.removeTag(ticket.ticket_id, nome);
      if (!result.changes) return interaction.reply({ embeds: [errorEmbed(`A tag \`${nome}\` não existe neste ticket.`)], ephemeral: true });
      db.addLog(ticket.ticket_id, 'TAG REMOVIDA', interaction.user.id, interaction.user.tag, nome);
      await interaction.reply({ embeds: [successEmbed(`Tag \`${nome}\` removida do ticket!`)] });
    }

    if (sub === 'listar') {
      const tags = db.getTags(ticket.ticket_id);
      const embed = new EmbedBuilder()
        .setColor(config.colors.primary)
        .setTitle(`🏷️ Tags — ${ticket.ticket_id}`)
        .setDescription(tags.length > 0 ? tags.map(t => `\`${t}\``).join(' ') : 'Nenhuma tag adicionada.');
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },
};
