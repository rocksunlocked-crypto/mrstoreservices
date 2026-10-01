const {
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, StringSelectMenuBuilder,
  PermissionFlagsBits,
} = require('discord.js');
const db = require('../../database/ticketsDb');
const { isAdmin, isStaff, getCategoryName, formatDate, getDuration } = require('../../utils/ticketHelpers');
const { getSLAStatus, progressBar, formatMinutes } = require('../../systems/ticket_slaSystem');
const config = require('../../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('admin')
    .setDescription('Painel de administração do sistema de tickets')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
      sub.setName('painel').setDescription('Painel em tempo real de todos os tickets abertos')
    )
    .addSubcommand(sub =>
      sub.setName('listar')
        .setDescription('Lista tickets com filtros avançados')
        .addStringOption(o =>
          o.setName('status').setDescription('Filtrar por status').setRequired(false)
           .addChoices({ name: '🟢 Abertos', value: 'open' }, { name: '🔴 Fechados', value: 'closed' }, { name: 'Todos', value: 'all' })
        )
        .addStringOption(o =>
          o.setName('categoria').setDescription('Filtrar por categoria').setRequired(false)
           .addChoices(
             { name: '🚨 Denúncia', value: 'denuncia' },
             { name: '🛠️ Suporte', value: 'suporte' },
             { name: '🤝 Parceria', value: 'parceria' },
           )
        )
        .addStringOption(o =>
          o.setName('prioridade').setDescription('Filtrar por prioridade').setRequired(false)
           .addChoices(
             { name: '🚨 Urgente', value: 'urgente' },
             { name: '🔴 Alta', value: 'alta' },
             { name: '🟡 Média', value: 'media' },
             { name: '🟢 Baixa', value: 'baixa' },
           )
        )
        .addUserOption(o => o.setName('usuario').setDescription('Filtrar por usuário').setRequired(false))
        .addUserOption(o => o.setName('atendente').setDescription('Filtrar por atendente').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('fechar-todos')
        .setDescription('⚠️ Fecha todos os tickets abertos de uma categoria')
        .addStringOption(o =>
          o.setName('categoria').setDescription('Categoria').setRequired(true)
           .addChoices(
             { name: '🚨 Denúncia', value: 'denuncia' },
             { name: '🛠️ Suporte', value: 'suporte' },
             { name: '🤝 Parceria', value: 'parceria' },
           )
        )
        .addStringOption(o => o.setName('motivo').setDescription('Motivo').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('sla')
        .setDescription('Relatório SLA de todos os tickets abertos')
    )
    .addSubcommand(sub =>
      sub.setName('limpar-bloqueados')
        .setDescription('Lista todos os usuários bloqueados de abrir tickets')
    ),

  async execute(interaction) {
    if (!isStaff(interaction.member)) {
      return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    // ── Painel em tempo real ──────────────────────────────────
    if (sub === 'painel') {
      const openTickets = db.getAllTickets(guildId, 'open');

      if (openTickets.length === 0) {
        return interaction.editReply({
          embeds: [new EmbedBuilder()
            .setColor(config.colors.success)
            .setTitle('✅ Nenhum Ticket Aberto')
            .setDescription('Não há tickets em aberto no momento.')
            .setTimestamp()],
        });
      }

      // Agrupa por categoria e prioridade
      const byPriority = { urgente: [], alta: [], media: [], baixa: [] };
      for (const t of openTickets) {
        (byPriority[t.priority] || byPriority.media).push(t);
      }

      const byCat = { denuncia: 0, suporte: 0, parceria: 0 };
      const noAtendente = openTickets.filter(t => !t.claimed_by);
      openTickets.forEach(t => { if (byCat[t.category] !== undefined) byCat[t.category]++; });

      // Resumo
      const embed = new EmbedBuilder()
        .setTitle('📊 Painel de Tickets — Tempo Real')
        .setColor(config.colors.primary)
        .addFields(
          { name: '📈 Total Abertos', value: String(openTickets.length), inline: true },
          { name: '⚠️ Sem Atendente', value: String(noAtendente.length), inline: true },
          { name: '\u200b', value: '\u200b', inline: true },
          { name: '🚨 Denúncias', value: String(byCat.denuncia), inline: true },
          { name: '🛠️ Suporte', value: String(byCat.suporte), inline: true },
          { name: '🤝 Parceria', value: String(byCat.parceria), inline: true },
        )
        .setTimestamp();

      // Campos por prioridade (máx 5 tickets por prioridade para caber no embed)
      for (const [prio, tickets] of Object.entries(byPriority)) {
        if (tickets.length === 0) continue;
        const label = config.priorities[prio]?.label || prio;
        const lines = tickets.slice(0, 5).map(t => {
          const age = getDuration(t.created_at);
          const att = t.claimed_by ? `✋ ${t.claimed_by.split('#')[0]}` : '❌ Sem atendente';
          return `• [\`${t.ticket_id}\`](<#${t.channel_id}>) — <@${t.user_id}> — ${age} — ${att}`;
        });
        if (tickets.length > 5) lines.push(`*...e mais ${tickets.length - 5} tickets*`);
        embed.addFields({ name: `${label} (${tickets.length})`, value: lines.join('\n') });
      }

      // Botões de ação rápida
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('admin_refresh_panel').setLabel('Atualizar').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('admin_sla_report').setLabel('Relatório SLA').setEmoji('📊').setStyle(ButtonStyle.Primary),
      );

      return interaction.editReply({ embeds: [embed], components: [row] });
    }

    // ── Listar com filtros ────────────────────────────────────
    if (sub === 'listar') {
      const status = interaction.options.getString('status') || 'open';
      const categoria = interaction.options.getString('categoria');
      const prioridade = interaction.options.getString('prioridade');
      const usuario = interaction.options.getUser('usuario');
      const atendente = interaction.options.getUser('atendente');

      let tickets = status === 'all'
        ? db.getAllTickets(guildId)
        : db.getAllTickets(guildId, status);

      if (categoria) tickets = tickets.filter(t => t.category === categoria);
      if (prioridade) tickets = tickets.filter(t => t.priority === prioridade);
      if (usuario) tickets = tickets.filter(t => t.user_id === usuario.id);
      if (atendente) tickets = tickets.filter(t => t.claimed_by?.includes(atendente.username));

      if (tickets.length === 0) {
        return interaction.editReply({
          embeds: [new EmbedBuilder().setColor(config.colors.warning).setDescription('⚠️ Nenhum ticket encontrado com esses filtros.')],
        });
      }

      // Pagina em grupos de 10
      const page = tickets.slice(0, 10);
      const embed = new EmbedBuilder()
        .setTitle(`🔍 Tickets — ${tickets.length} resultado(s)`)
        .setColor(config.colors.primary)
        .setDescription(page.map(t => {
          const icon = t.status === 'open' ? '🟢' : '🔴';
          const prio = config.priorities[t.priority]?.label || t.priority;
          return `${icon} \`${t.ticket_id}\` — ${getCategoryName(t.category)} — ${prio} — <@${t.user_id}> — <#${t.channel_id}>`;
        }).join('\n'))
        .setFooter({ text: `Mostrando ${page.length} de ${tickets.length}` })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }

    // ── Fechar todos ──────────────────────────────────────────
    if (sub === 'fechar-todos') {
      if (!isAdmin(interaction.member)) {
        return interaction.editReply({ content: '❌ Apenas administradores podem usar este comando.' });
      }

      const categoria = interaction.options.getString('categoria');
      const motivo = interaction.options.getString('motivo');
      const tickets = db.getAllTickets(guildId, 'open').filter(t => t.category === categoria);

      if (tickets.length === 0) {
        return interaction.editReply({ content: `⚠️ Nenhum ticket aberto na categoria ${categoria}.` });
      }

      let fechados = 0;
      for (const ticket of tickets) {
        db.closeTicket(ticket.ticket_id, interaction.user.tag, motivo);
        db.addLog(ticket.ticket_id, 'FECHAMENTO EM MASSA', interaction.user.id, interaction.user.tag, motivo);
        const ch = interaction.guild.channels.cache.get(ticket.channel_id);
        if (ch) {
          await ch.send({
            embeds: [new EmbedBuilder()
              .setColor(config.colors.danger)
              .setDescription(`🔒 Ticket fechado em massa por **${interaction.user.tag}**.\n**Motivo:** ${motivo}`)
              .setTimestamp()],
          }).catch(() => {});
        }
        fechados++;
      }

      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(config.colors.success)
          .setDescription(`✅ **${fechados}** ticket(s) da categoria **${getCategoryName(categoria)}** foram fechados.\n**Motivo:** ${motivo}`)
          .setTimestamp()],
      });
    }

    // ── Relatório SLA ─────────────────────────────────────────
    if (sub === 'sla') {
      const openTickets = db.getAllTickets(guildId, 'open');
      if (openTickets.length === 0) {
        return interaction.editReply({ content: '✅ Nenhum ticket aberto.' });
      }

      const embed = new EmbedBuilder()
        .setTitle('📊 Relatório SLA — Tickets Abertos')
        .setColor(config.colors.primary)
        .setTimestamp();

      let breached = 0, warning = 0, ok = 0;

      const lines = openTickets.slice(0, 15).map(t => {
        const s = getSLAStatus(t);
        let status = '🟢';
        if (s.firstResponseBreached || s.resolveBreached) { status = '🔴'; breached++; }
        else if (s.firstResponseWarning || s.resolveWarning) { status = '🟡'; warning++; }
        else ok++;
        const age = formatMinutes(s.ageMinutes);
        return `${status} \`${t.ticket_id}\` — ${formatMinutes(s.ageMinutes)} — Resp: ${progressBar(s.percentFirst, 6)} — Res: ${progressBar(s.percentResolve, 6)}`;
      });

      embed.setDescription(lines.join('\n'));
      embed.addFields(
        { name: '🔴 Violados', value: String(breached), inline: true },
        { name: '🟡 Em alerta', value: String(warning), inline: true },
        { name: '🟢 No prazo', value: String(ok), inline: true },
      );

      if (openTickets.length > 15) embed.setFooter({ text: `Mostrando 15 de ${openTickets.length} tickets` });

      return interaction.editReply({ embeds: [embed] });
    }

    // ── Listar bloqueados ─────────────────────────────────────
    if (sub === 'limpar-bloqueados') {
      const blocked = db.db.prepare('SELECT * FROM blocked_users WHERE guild_id = ?').all(guildId);
      if (blocked.length === 0) {
        return interaction.editReply({ content: '✅ Nenhum usuário bloqueado.' });
      }
      const embed = new EmbedBuilder()
        .setTitle('🔐 Usuários Bloqueados')
        .setColor(config.colors.danger)
        .setDescription(blocked.map(b =>
          `• <@${b.user_id}> — Motivo: ${b.reason || 'N/A'} — Por: ${b.blocked_by} — ${formatDate(b.created_at)}`
        ).join('\n'))
        .setTimestamp();
      return interaction.editReply({ embeds: [embed] });
    }
  },
};
