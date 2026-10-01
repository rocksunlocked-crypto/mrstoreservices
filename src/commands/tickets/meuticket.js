const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../../database/ticketsDb');
const { getCategoryName, formatDate, getDuration } = require('../../utils/ticketHelpers');
const config = require('../../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('meuticket')
    .setDescription('Veja seus tickets abertos e o histórico de fechados'),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const userId = interaction.user.id;
    const guildId = interaction.guild.id;
    const allTickets = db.getAllTickets(guildId).filter(t => t.user_id === userId);

    if (allTickets.length === 0) {
      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(config.colors.info)
          .setDescription('📭 Você não tem nenhum ticket neste servidor.')],
      });
    }

    const open   = allTickets.filter(t => t.status === 'open');
    const closed = allTickets.filter(t => t.status === 'closed').slice(0, 5); // últimos 5

    const embed = new EmbedBuilder()
      .setTitle(`🎫 Meus Tickets — ${interaction.user.username}`)
      .setColor(config.colors.primary)
      .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: '📈 Total de Tickets', value: String(allTickets.length), inline: true },
        { name: '🟢 Abertos', value: String(open.length), inline: true },
        { name: '🔴 Fechados', value: String(allTickets.filter(t => t.status === 'closed').length), inline: true },
      );

    if (open.length > 0) {
      embed.addFields({
        name: '🟢 Tickets Abertos',
        value: open.map(t => {
          const prio = config.priorities[t.priority]?.label || t.priority;
          const att = t.claimed_by ? `✋ ${t.claimed_by.split('#')[0]}` : '⏳ Aguardando';
          return `• [\`${t.ticket_id}\`](<#${t.channel_id}>) — ${getCategoryName(t.category)}\n  ${prio} — ${att} — Aberto: ${formatDate(t.created_at)}`;
        }).join('\n'),
      });
    }

    if (closed.length > 0) {
      embed.addFields({
        name: '🔴 Últimos Fechados',
        value: closed.map(t => {
          const duration = getDuration(t.created_at, t.closed_at);
          const rating = t.rating ? `${'⭐'.repeat(t.rating)}` : '—';
          return `• \`${t.ticket_id}\` — ${getCategoryName(t.category)} — ${duration} — Avaliação: ${rating}`;
        }).join('\n'),
      });
    }

    const avgRating = allTickets.filter(t => t.rating).reduce((acc, t, _, arr) => acc + t.rating / arr.length, 0);
    if (avgRating > 0) {
      embed.addFields({ name: '⭐ Avaliação Média que Você Deu', value: `${avgRating.toFixed(1)}/5`, inline: true });
    }

    embed.setTimestamp();

    // Botão de abrir novo ticket (redireciona para o painel)
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('goto_panel_hint')
        .setLabel('Abrir Novo Ticket')
        .setEmoji('🎫')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(open.length >= config.maxTicketsPerUser),
    );

    await interaction.editReply({ embeds: [embed], components: [row] });
  },
};
