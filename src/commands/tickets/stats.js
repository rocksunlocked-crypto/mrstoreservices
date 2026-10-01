const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const db = require('../../database/ticketsDb');
const { isStaff, formatDate, getCategoryName } = require('../../utils/ticketHelpers');
const { getSLAStatus, progressBar, formatMinutes } = require('../../systems/ticket_slaSystem');
const config = require('../../config');

// ── Gráfico de barras ASCII ──────────────────────────────────
function asciiBar(value, max, width = 16) {
  if (max === 0) return '░'.repeat(width) + ' 0';
  const filled = Math.round((value / max) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled) + ` ${value}`;
}

// ── Gera dados dos últimos N dias ─────────────────────────────
function getLast7DaysData(guildId) {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const start = Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 1000);
    const end   = start + 86400;

    const opened = db.db.prepare('SELECT COUNT(*) as c FROM tickets WHERE guild_id=? AND created_at>=? AND created_at<?').get(guildId, start, end).c;
    const closed = db.db.prepare("SELECT COUNT(*) as c FROM tickets WHERE guild_id=? AND closed_at>=? AND closed_at<? AND status='closed'").get(guildId, start, end).c;

    days.push({
      label: d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }),
      opened, closed,
    });
  }
  return days;
}

// ── Tempo médio de resolução (em horas) ──────────────────────
function getAvgResolutionTime(guildId) {
  const result = db.db.prepare(`
    SELECT AVG(closed_at - created_at) as avg_seconds
    FROM tickets WHERE guild_id=? AND status='closed' AND closed_at IS NOT NULL AND closed_by != 'Sistema (Auto-close)'
  `).get(guildId);
  if (!result?.avg_seconds) return null;
  return result.avg_seconds / 3600; // em horas
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Estatísticas avançadas do sistema de tickets')
    .addSubcommand(sub => sub.setName('geral').setDescription('Visão geral completa'))
    .addSubcommand(sub => sub.setName('grafico').setDescription('Gráfico de tickets dos últimos 7 dias'))
    .addSubcommand(sub => sub.setName('staff').setDescription('Ranking da staff com avaliações'))
    .addSubcommand(sub => sub.setName('sla').setDescription('Resumo do status de SLA'))
    .addSubcommand(sub =>
      sub.setName('usuario')
        .setDescription('Histórico completo de um usuário')
        .addUserOption(o => o.setName('usuario').setDescription('Usuário').setRequired(false))
    )
    .addSubcommand(sub => sub.setName('categorias').setDescription('Stats detalhados por categoria')),

  async execute(interaction) {
    if (!isStaff(interaction.member)) {
      return interaction.reply({ embeds: [{ color: config.colors.danger, description: '❌ Sem permissão.' }], ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    // ── Geral ─────────────────────────────────────────────────
    if (sub === 'geral') {
      const all    = db.getAllTickets(guildId);
      const open   = all.filter(t => t.status === 'open');
      const closed = all.filter(t => t.status === 'closed');
      const today  = db.getTodayStats(guildId);
      const avgRes = getAvgResolutionTime(guildId);
      const rated  = closed.filter(t => t.rating);
      const avgRating = rated.length > 0
        ? rated.reduce((a, t) => a + t.rating, 0) / rated.length
        : 0;
      const noAttendant = open.filter(t => !t.claimed_by);

      const embed = new EmbedBuilder()
        .setTitle('📊 Estatísticas Gerais — Sistema de Tickets')
        .setColor(config.colors.primary)
        .addFields(
          { name: '📈 Total de Tickets', value: String(all.length), inline: true },
          { name: '🟢 Abertos Agora',    value: String(open.length), inline: true },
          { name: '🔴 Fechados Total',   value: String(closed.length), inline: true },
          { name: '📅 Abertos Hoje',     value: String(today?.total_opened || 0), inline: true },
          { name: '✅ Fechados Hoje',    value: String(today?.total_closed || 0), inline: true },
          { name: '⚠️ Sem Atendente',    value: String(noAttendant.length), inline: true },
          { name: '⭐ Avaliação Média',  value: avgRating > 0 ? `${avgRating.toFixed(2)}/5 (${rated.length} avaliações)` : 'Sem dados', inline: true },
          { name: '⏱️ Tempo Médio Res.', value: avgRes ? `${avgRes.toFixed(1)}h` : 'Sem dados', inline: true },
          { name: '\u200b',              value: '\u200b', inline: true },
        )
        .setTimestamp();

      // Linha de progresso de avaliação
      if (avgRating > 0) {
        const stars = Math.round(avgRating);
        embed.addFields({
          name: '⭐ Distribuição de Avaliações',
          value: [5,4,3,2,1].map(n => {
            const count = rated.filter(t => t.rating === n).length;
            return `${n}⭐ ${asciiBar(count, rated.length, 12)}`;
          }).join('\n'),
        });
      }

      return interaction.editReply({ embeds: [embed] });
    }

    // ── Gráfico 7 dias ────────────────────────────────────────
    if (sub === 'grafico') {
      const days = getLast7DaysData(guildId);
      const maxVal = Math.max(...days.map(d => Math.max(d.opened, d.closed)), 1);

      const chartLines = days.map(d => {
        const openBar  = asciiBar(d.opened, maxVal, 14);
        const closeBar = asciiBar(d.closed, maxVal, 14);
        return `\`${d.label}\`\n🟢 ${openBar}\n🔴 ${closeBar}`;
      });

      const totalOpened = days.reduce((a, d) => a + d.opened, 0);
      const totalClosed = days.reduce((a, d) => a + d.closed, 0);
      const trend = totalOpened > totalClosed ? '📈 Crescendo' : totalClosed > totalOpened ? '📉 Reduzindo' : '➡️ Estável';

      const embed = new EmbedBuilder()
        .setTitle('📊 Gráfico — Últimos 7 Dias')
        .setColor(config.colors.primary)
        .setDescription(chartLines.join('\n\n'))
        .addFields(
          { name: '🟢 Total Abertos (7d)', value: String(totalOpened), inline: true },
          { name: '🔴 Total Fechados (7d)', value: String(totalClosed), inline: true },
          { name: '📈 Tendência', value: trend, inline: true },
        )
        .setFooter({ text: 'Cada barra representa 1 dia' })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }

    // ── Staff ─────────────────────────────────────────────────
    if (sub === 'staff') {
      const top = db.getTopStaff(guildId, 15);
      if (top.length === 0) {
        return interaction.editReply({ content: '⚠️ Nenhum dado de staff ainda.' });
      }

      const medals = ['🥇','🥈','🥉'];
      const maxClosed = Math.max(...top.map(s => s.tickets_closed), 1);

      const embed = new EmbedBuilder()
        .setTitle('🏆 Ranking da Staff')
        .setColor(config.colors.primary)
        .setDescription(top.map((s, i) => {
          const medal = medals[i] || `**${i+1}.**`;
          const bar = asciiBar(s.tickets_closed, maxClosed, 10);
          const avgStars = s.avg_rating > 0 ? '⭐'.repeat(Math.round(s.avg_rating)) + ` (${s.avg_rating.toFixed(1)})` : '—';
          return (
            `${medal} **${s.username}**\n` +
            `┣ Fechados: \`${bar}\`\n` +
            `┣ Assumidos: **${s.tickets_claimed}** | Avaliação: ${avgStars}\n` +
            `┗ Total de avaliações: **${s.total_ratings}**`
          );
        }).join('\n\n'))
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }

    // ── SLA ───────────────────────────────────────────────────
    if (sub === 'sla') {
      const open = db.getAllTickets(guildId, 'open');
      if (open.length === 0) return interaction.editReply({ content: '✅ Nenhum ticket aberto.' });

      let ok = 0, warn = 0, breach = 0;
      const lines = open.map(t => {
        const s = getSLAStatus(t);
        let icon;
        if (s.firstResponseBreached || s.resolveBreached) { icon = '🔴'; breach++; }
        else if (s.firstResponseWarning || s.resolveWarning) { icon = '🟡'; warn++; }
        else { icon = '🟢'; ok++; }
        return `${icon} \`${t.ticket_id}\` ${config.priorities[t.priority]?.label || ''} — ${formatMinutes(s.ageMinutes)} aberto`;
      });

      const embed = new EmbedBuilder()
        .setTitle('📊 Relatório SLA')
        .setColor(breach > 0 ? config.colors.danger : warn > 0 ? config.colors.warning : config.colors.success)
        .addFields(
          { name: '🔴 Violados', value: String(breach), inline: true },
          { name: '🟡 Em Alerta', value: String(warn), inline: true },
          { name: '🟢 No Prazo', value: String(ok), inline: true },
        )
        .setDescription(lines.slice(0, 20).join('\n'))
        .setTimestamp();

      if (open.length > 20) embed.setFooter({ text: `Mostrando 20 de ${open.length}` });

      return interaction.editReply({ embeds: [embed] });
    }

    // ── Usuário ───────────────────────────────────────────────
    if (sub === 'usuario') {
      const target = interaction.options.getUser('usuario') || interaction.user;
      const tickets = db.getAllTickets(guildId).filter(t => t.user_id === target.id);
      const open    = tickets.filter(t => t.status === 'open');
      const closed  = tickets.filter(t => t.status === 'closed');
      const rated   = closed.filter(t => t.rating);
      const avgR    = rated.length > 0 ? rated.reduce((a, t) => a + t.rating, 0) / rated.length : 0;

      const embed = new EmbedBuilder()
        .setTitle(`👤 Histórico — ${target.tag}`)
        .setColor(config.colors.info)
        .setThumbnail(target.displayAvatarURL({ dynamic: true }))
        .addFields(
          { name: '🎫 Total', value: String(tickets.length), inline: true },
          { name: '🟢 Abertos', value: String(open.length), inline: true },
          { name: '🔴 Fechados', value: String(closed.length), inline: true },
          { name: '⭐ Avaliação Média Dada', value: avgR > 0 ? `${avgR.toFixed(1)}/5` : '—', inline: true },
        );

      if (open.length > 0) {
        embed.addFields({
          name: '🟢 Tickets Abertos',
          value: open.map(t =>
            `• [\`${t.ticket_id}\`](<#${t.channel_id}>) — ${getCategoryName(t.category)} — ${config.priorities[t.priority]?.label || t.priority}`
          ).join('\n'),
        });
      }

      if (closed.length > 0) {
        embed.addFields({
          name: '🔴 Últimos 5 Fechados',
          value: closed.slice(0, 5).map(t => {
            const rating = t.rating ? '⭐'.repeat(t.rating) : '—';
            return `• \`${t.ticket_id}\` — ${getCategoryName(t.category)} — ${rating} — ${formatDate(t.closed_at)}`;
          }).join('\n'),
        });
      }

      embed.setTimestamp();
      return interaction.editReply({ embeds: [embed] });
    }

    // ── Categorias ────────────────────────────────────────────
    if (sub === 'categorias') {
      const byCat = db.countTicketsByCategory(guildId);

      if (byCat.length === 0) {
        return interaction.editReply({ content: '⚠️ Nenhum dado ainda.' });
      }

      const maxTotal = Math.max(...byCat.map(c => c.total), 1);

      const embed = new EmbedBuilder()
        .setTitle('📂 Stats por Categoria')
        .setColor(config.colors.primary)
        .setDescription(byCat.map(c => {
          const pct = ((c.total / (db.getAllTickets(guildId).length || 1)) * 100).toFixed(1);
          const bar = asciiBar(c.total, maxTotal, 14);
          return (
            `**${getCategoryName(c.category)}** (${pct}%)\n` +
            `Total: \`${bar}\`\n` +
            `🟢 Abertos: **${c.open}** | 🔴 Fechados: **${c.closed}**`
          );
        }).join('\n\n'))
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }
  },
};
