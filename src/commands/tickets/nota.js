const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database/ticketsDb');
const { isStaff, errorEmbed, formatDate } = require('../../utils/ticketHelpers');
const config = require('../../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('nota')
    .setDescription('Gerencia notas internas do ticket')
    .addSubcommand(sub =>
      sub.setName('adicionar')
        .setDescription('Adiciona uma nota interna (apenas staff pode ver)')
        .addStringOption(o => o.setName('texto').setDescription('Conteúdo da nota').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('listar')
        .setDescription('Lista todas as notas do ticket')
    ),

  async execute(interaction) {
    const ticket = db.getTicketByChannel(interaction.channel.id);
    if (!ticket) return interaction.reply({ embeds: [errorEmbed('Este canal não é um ticket.')], ephemeral: true });
    if (!isStaff(interaction.member)) return interaction.reply({ embeds: [errorEmbed('Sem permissão.')], ephemeral: true });

    const sub = interaction.options.getSubcommand();

    if (sub === 'adicionar') {
      const texto = interaction.options.getString('texto');
      db.addNote(ticket.ticket_id, interaction.user.id, interaction.user.tag, texto);
      db.addLog(ticket.ticket_id, 'NOTA ADICIONADA', interaction.user.id, interaction.user.tag);

      const embed = new EmbedBuilder()
        .setColor(config.colors.warning)
        .setTitle('📝 Nota Interna Adicionada')
        .setDescription(texto)
        .setFooter({ text: `Por ${interaction.user.tag}` })
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === 'listar') {
      const notes = db.getNotes(ticket.ticket_id);
      if (notes.length === 0) {
        return interaction.reply({ embeds: [errorEmbed('Nenhuma nota encontrada.')], ephemeral: true });
      }

      const embed = new EmbedBuilder()
        .setColor(config.colors.warning)
        .setTitle(`📝 Notas — ${ticket.ticket_id}`)
        .setDescription(notes.map((n, i) =>
          `**${i + 1}.** \`${formatDate(n.created_at)}\` — **${n.author_tag}**\n${n.note}`
        ).join('\n\n'))
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },
};
