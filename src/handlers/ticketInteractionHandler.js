const {
  ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder,
  EmbedBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle,
} = require('discord.js');
const db = require('../database/ticketsDb');
const config = require('../config');
const { openTicket, closeTicket, reopenTicket, deleteTicketChannel } = require('../tickets/ticketManager');
const { getModalForCategory, extractModalData } = require('../tickets/categoryForms');
const { sendTranscript } = require('../utils/ticketTranscript');
const { isStaff, isAdmin, errorEmbed, successEmbed } = require('../utils/ticketHelpers');
const { handleKeepOpen } = require('../systems/ticket_autoClose');
const { isOnCooldown, getCooldownRemaining } = require('../systems/ticket_cooldown');

// ── Roteador principal ───────────────────────────────────────
async function handleInteraction(interaction) {
  try {
    if (interaction.isChatInputCommand()) return handleCommand(interaction);
    if (interaction.isAutocomplete())     return handleAutocomplete(interaction);
    if (interaction.isStringSelectMenu()) return handleSelectMenu(interaction);
    if (interaction.isButton())           return handleButton(interaction);
    if (interaction.isModalSubmit())      return handleModal(interaction);
  } catch (err) {
    console.error('[INTERACTION] Erro:', err);
    const msg = { embeds: [errorEmbed('Ocorreu um erro inesperado.')], ephemeral: true };
    if (interaction.replied || interaction.deferred) interaction.followUp(msg).catch(() => {});
    else interaction.reply(msg).catch(() => {});
  }
}

// ── Slash Commands ───────────────────────────────────────────
async function handleCommand(interaction) {
  const command = interaction.client.commands.get(interaction.commandName);
  if (command) await command.execute(interaction);
}

// ── Autocomplete ─────────────────────────────────────────────
async function handleAutocomplete(interaction) {
  const command = interaction.client.commands.get(interaction.commandName);
  if (command?.autocomplete) await command.autocomplete(interaction);
}

// ── Select Menus ─────────────────────────────────────────────
async function handleSelectMenu(interaction) {
  const { customId, values } = interaction;

  // ── Abertura de ticket (painel) ──────────────────────────
  if (customId === 'ticket_open_menu') {
    const category = values[0];

    // Verifica cooldown
    if (isOnCooldown(interaction.user.id)) {
      const remaining = getCooldownRemaining(interaction.user.id);
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(config.colors.warning)
          .setDescription(`⏱️ Aguarde **${remaining}s** antes de abrir outro ticket.`)],
        ephemeral: true,
      });
    }

    // Verifica bloqueio
    if (db.isBlocked(interaction.user.id, interaction.guild.id)) {
      return interaction.reply({
        embeds: [errorEmbed('🔐 Você está bloqueado de abrir tickets.')],
        ephemeral: true,
      });
    }

    // Verifica limite
    const open = db.getOpenTicketsByUser(interaction.user.id, interaction.guild.id);
    if (open.length >= config.maxTicketsPerUser) {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(config.colors.warning)
          .setDescription(`⚠️ Você já tem **${open.length}** ticket(s) aberto(s).\nFeche um antes de abrir outro.`)],
        ephemeral: true,
      });
    }

    // Mostra modal personalizado por categoria
    await interaction.showModal(getModalForCategory(category));
    return;
  }

  // ── Prioridade ──────────────────────────────────────────
  if (customId.startsWith('select_priority_')) {
    const ticketId = customId.replace('select_priority_', '');
    const nivel = values[0];
    const pInfo = config.priorities[nivel];
    db.updateTicket(ticketId, { priority: nivel });
    db.addLog(ticketId, 'PRIORIDADE ALTERADA', interaction.user.id, interaction.user.tag, pInfo.label);
    return interaction.update({
      embeds: [new EmbedBuilder().setColor(pInfo.color).setDescription(`🎯 Prioridade definida: **${pInfo.label}**`).setTimestamp()],
      components: [],
    });
  }

  // ── Tags ────────────────────────────────────────────────
  if (customId.startsWith('select_tags_')) {
    const ticketId = customId.replace('select_tags_', '');
    const added = [];
    for (const tag of values) {
      const r = db.addTag(ticketId, tag);
      if (r) added.push(tag);
    }
    if (added.length > 0) db.addLog(ticketId, 'TAGS ADICIONADAS', interaction.user.id, interaction.user.tag, added.join(', '));
    return interaction.update({
      embeds: [successEmbed(`Tags adicionadas: ${(added.length ? added : values).map(t => `\`${t}\``).join(', ')}`)],
      components: [],
    });
  }

  // ── Transferência ────────────────────────────────────────
  if (customId.startsWith('select_transfer_')) {
    const ticketId = customId.replace('select_transfer_', '');
    const ticket = db.getTicket(ticketId);
    if (!ticket) return interaction.update({ embeds: [errorEmbed('Ticket não encontrado.')], components: [] });

    const targetId = values[0];
    const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);
    if (!targetMember) return interaction.update({ embeds: [errorEmbed('Membro não encontrado.')], components: [] });

    const anterior = ticket.claimed_by || 'Nenhum';
    db.updateTicket(ticketId, { claimed_by: targetMember.user.tag });
    db.addLog(ticketId, 'TRANSFERIDO', interaction.user.id, interaction.user.tag, `${anterior} → ${targetMember.user.tag}`);
    db.upsertStaffStat(targetId, targetMember.user.tag, 'tickets_claimed');

    return interaction.update({
      embeds: [new EmbedBuilder()
        .setColor(config.colors.info)
        .setDescription(`↔️ Ticket transferido para ${targetMember}!`)
        .setTimestamp()],
      components: [],
    });
  }
}

// ── Botões ────────────────────────────────────────────────────
async function handleButton(interaction) {
  const { customId } = interaction;

  // ── Manter aberto (auto-close) ──────────────────────────
  if (customId.startsWith('autoclose_keep_')) {
    const ticketId = customId.replace('autoclose_keep_', '');
    return handleKeepOpen(interaction, ticketId);
  }

  // ── Painel admin refresh ────────────────────────────────
  if (customId === 'admin_refresh_panel' || customId === 'admin_sla_report') {
    const cmd = interaction.client.commands.get('admin');
    if (cmd) {
      // Simula subcomando
      const fakeSub = customId === 'admin_sla_report' ? 'sla' : 'painel';
      return interaction.reply({ content: `Use \`/admin ${fakeSub}\` para atualizar.`, ephemeral: true });
    }
    return;
  }

  // ── Hint de abrir ticket ─────────────────────────────────
  if (customId === 'goto_panel_hint') {
    return interaction.reply({ content: '🎫 Vá até o canal de tickets e use o menu para abrir um novo ticket!', ephemeral: true });
  }

  // ── Avaliação (via DM ou canal) ──────────────────────────
  if (customId.startsWith('rating_')) {
    const parts = customId.split('_');
    const rating = parseInt(parts[parts.length - 1]);
    const ticketId = parts.slice(1, -1).join('_');
    const ticket = db.getTicket(ticketId);
    if (!ticket) return interaction.reply({ embeds: [errorEmbed('Ticket não encontrado.')], ephemeral: true });
    if (ticket.rating) return interaction.reply({ embeds: [errorEmbed('Você já avaliou este ticket.')], ephemeral: true });
    if (ticket.user_id !== interaction.user.id) return interaction.reply({ embeds: [errorEmbed('Apenas o dono do ticket pode avaliar.')], ephemeral: true });

    db.updateTicket(ticketId, { rating });
    if (ticket.claimed_by) db.updateStaffRating(ticket.claimed_by, ticket.claimed_by, rating);

    const labels = { 1: 'Péssimo 😞', 2: 'Ruim 😕', 3: 'Regular 😐', 4: 'Bom 😊', 5: 'Excelente 🤩' };
    return interaction.update({
      embeds: [new EmbedBuilder()
        .setColor(rating >= 4 ? config.colors.success : rating === 3 ? config.colors.warning : config.colors.danger)
        .setTitle('⭐ Avaliação Registrada!')
        .setDescription(`Você avaliou o ticket **${ticketId}** com **${'⭐'.repeat(rating)}** — ${labels[rating]}\n\nObrigado pelo seu feedback!`)
        .setTimestamp()],
      components: [],
    });
  }

  // Para todos os outros botões, precisa do ticket pelo canal
  const buttonTicketId = customId.match(/^ticket_(?:close|reopen|delete|claim|priority|tags|addnote|transfer|transcript|rename)_(.+)$/)?.[1];
  const ticket = db.getTicketByChannel(interaction.channel.id) || (buttonTicketId ? db.getTicket(buttonTicketId) : null);

  // ── Fechar ───────────────────────────────────────────────
  if (customId.startsWith('ticket_close_')) {
    if (!ticket) {
      return interaction.reply({ embeds: [errorEmbed('Ticket não encontrado.')], ephemeral: true });
    }
    const isOwner = ticket?.user_id === interaction.user.id;
    if (!isStaff(interaction.member) && !isOwner) {
      return interaction.reply({ embeds: [errorEmbed('Sem permissão.')], ephemeral: true });
    }
    if (ticket.status === 'closed') {
      return interaction.reply({ embeds: [errorEmbed('Ticket não encontrado ou já fechado.')], ephemeral: true });
    }

    const modal = new ModalBuilder()
      .setCustomId(`modal_close_ticket_${ticket.ticket_id}`)
      .setTitle('🔒 Fechar Ticket');

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('close_reason')
          .setLabel('Motivo do fechamento (opcional)')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Ex: Problema resolvido, usuário satisfeito...')
          .setRequired(false)
          .setMaxLength(500)
      )
    );
    return interaction.showModal(modal);
  }

  // ── Reabrir ──────────────────────────────────────────────
  if (customId.startsWith('ticket_reopen_')) {
    if (!isStaff(interaction.member) && ticket?.user_id !== interaction.user.id) {
      return interaction.reply({ embeds: [errorEmbed('Sem permissão.')], ephemeral: true });
    }
    if (!ticket) return interaction.reply({ embeds: [errorEmbed('Ticket não encontrado.')], ephemeral: true });
    return reopenTicket(interaction, ticket);
  }

  // ── Deletar canal ────────────────────────────────────────
  if (customId.startsWith('ticket_delete_')) {
    if (!isStaff(interaction.member)) return interaction.reply({ embeds: [errorEmbed('Sem permissão.')], ephemeral: true });
    if (!ticket) return interaction.reply({ embeds: [errorEmbed('Ticket não encontrado.')], ephemeral: true });
    return deleteTicketChannel(interaction, ticket);
  }

  // ── Assumir ──────────────────────────────────────────────
  if (customId.startsWith('ticket_claim_')) {
    if (!isStaff(interaction.member)) return interaction.reply({ embeds: [errorEmbed('Sem permissão.')], ephemeral: true });
    if (!ticket) return interaction.reply({ embeds: [errorEmbed('Ticket não encontrado.')], ephemeral: true });
    if (ticket.status === 'closed') return interaction.reply({ embeds: [errorEmbed('Ticket fechado.')], ephemeral: true });

    if (ticket.claimed_by) {
      return interaction.reply({ embeds: [errorEmbed(`Já assumido por **${ticket.claimed_by}**. Use \`/transferir\`.`)], ephemeral: true });
    }

    db.updateTicket(ticket.ticket_id, { claimed_by: interaction.user.tag });
    db.addLog(ticket.ticket_id, 'ASSUMIDO', interaction.user.id, interaction.user.tag);
    db.upsertStaffStat(interaction.user.id, interaction.user.tag, 'tickets_claimed');

    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(config.colors.success)
        .setDescription(`✋ **${interaction.user}** assumiu este ticket e irá te atender!`)
        .setTimestamp()],
    });
  }

  // ── Prioridade ───────────────────────────────────────────
  if (customId.startsWith('ticket_priority_')) {
    if (!isStaff(interaction.member)) return interaction.reply({ embeds: [errorEmbed('Sem permissão.')], ephemeral: true });
    if (!ticket) return;

    const menu = new StringSelectMenuBuilder()
      .setCustomId(`select_priority_${ticket.ticket_id}`)
      .setPlaceholder('Selecione a prioridade...')
      .addOptions(Object.entries(config.priorities).map(([k, v]) => ({ label: v.label, value: k })));

    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(config.colors.primary).setDescription('🎯 Selecione a prioridade:')],
      components: [new ActionRowBuilder().addComponents(menu)],
      ephemeral: true,
    });
  }

  // ── Tags ─────────────────────────────────────────────────
  if (customId.startsWith('ticket_tags_')) {
    if (!isStaff(interaction.member)) return interaction.reply({ embeds: [errorEmbed('Sem permissão.')], ephemeral: true });
    if (!ticket) return;

    const TAGS = ['bug','urgente','aguardando-usuario','aguardando-staff','em-andamento','resolvido','duplicado','invalido','vip','reincidente','verificado'];
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`select_tags_${ticket.ticket_id}`)
      .setPlaceholder('Selecione as tags...')
      .setMinValues(1).setMaxValues(5)
      .addOptions(TAGS.map(t => ({ label: t, value: t })));

    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(config.colors.primary).setDescription('🏷️ Selecione as tags:')],
      components: [new ActionRowBuilder().addComponents(menu)],
      ephemeral: true,
    });
  }

  // ── Nota interna ─────────────────────────────────────────
  if (customId.startsWith('ticket_addnote_')) {
    if (!isStaff(interaction.member)) return interaction.reply({ embeds: [errorEmbed('Sem permissão.')], ephemeral: true });
    if (!ticket) return;

    const modal = new ModalBuilder()
      .setCustomId(`modal_note_${ticket.ticket_id}`)
      .setTitle('📝 Nota Interna');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('note_text')
          .setLabel('Nota (apenas a staff pode ver)')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true).setMaxLength(1000)
      )
    );
    return interaction.showModal(modal);
  }

  // ── Transferir ───────────────────────────────────────────
  if (customId.startsWith('ticket_transfer_')) {
    if (!isStaff(interaction.member)) return interaction.reply({ embeds: [errorEmbed('Sem permissão.')], ephemeral: true });
    if (!ticket) return;

    const staffMembers = [];
    for (const roleId of [config.roles.admin, config.roles.moderador, config.roles.suporte]) {
      const role = interaction.guild.roles.cache.get(roleId);
      if (role) {
        role.members.forEach(m => {
          if (!m.user.bot && !staffMembers.find(s => s.value === m.id)) {
            staffMembers.push({ label: m.user.tag.slice(0, 100), value: m.id });
          }
        });
      }
    }

    if (staffMembers.length === 0) return interaction.reply({ embeds: [errorEmbed('Nenhum staff encontrado.')], ephemeral: true });

    const menu = new StringSelectMenuBuilder()
      .setCustomId(`select_transfer_${ticket.ticket_id}`)
      .setPlaceholder('Selecione um membro...')
      .addOptions(staffMembers.slice(0, 25));

    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(config.colors.info).setDescription('↔️ Para quem transferir?')],
      components: [new ActionRowBuilder().addComponents(menu)],
      ephemeral: true,
    });
  }

  // ── Renomear ─────────────────────────────────────────────
  if (customId.startsWith('ticket_rename_')) {
    if (!isStaff(interaction.member)) return interaction.reply({ embeds: [errorEmbed('Sem permissão.')], ephemeral: true });
    if (!ticket) return;

    const modal = new ModalBuilder()
      .setCustomId(`modal_rename_${ticket.ticket_id}`)
      .setTitle('✏️ Renomear Ticket');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('rename_text')
          .setLabel('Novo assunto')
          .setStyle(TextInputStyle.Short)
          .setRequired(true).setMaxLength(80)
      )
    );
    return interaction.showModal(modal);
  }

  // ── Transcript manual ────────────────────────────────────
  if (customId.startsWith('ticket_transcript_')) {
    if (!isStaff(interaction.member)) return interaction.reply({ embeds: [errorEmbed('Sem permissão.')], ephemeral: true });
    if (!ticket) return;

    await interaction.deferReply({ ephemeral: true });
    const transcriptCh = interaction.guild.channels.cache.get(config.channels.transcript);
    if (!transcriptCh) return interaction.editReply({ embeds: [errorEmbed('Canal de transcript não encontrado.')] });

    await sendTranscript(interaction.channel, ticket, transcriptCh, interaction.user.tag);
    db.addLog(ticket.ticket_id, 'TRANSCRIPT GERADO', interaction.user.id, interaction.user.tag);
    return interaction.editReply({ embeds: [successEmbed(`Transcript gerado e enviado para ${transcriptCh}!`)] });
  }
}

// ── Modais ────────────────────────────────────────────────────
async function handleModal(interaction) {
  const { customId } = interaction;

  // ── Abrir ticket com dados do formulário por categoria ───
  if (customId.startsWith('modal_open_ticket_')) {
    const category = customId.replace('modal_open_ticket_', '');
    const { subject, extraFields } = extractModalData(interaction, category);
    return openTicket(interaction, category, subject, extraFields);
  }

  // ── Fechar ticket ────────────────────────────────────────
  if (customId.startsWith('modal_close_ticket_')) {
    const ticketId = customId.replace('modal_close_ticket_', '');
    const ticket = db.getTicket(ticketId);
    if (!ticket) return interaction.reply({ embeds: [errorEmbed('Ticket não encontrado.')], ephemeral: true });
    if (ticket.status === 'closed') return interaction.reply({ embeds: [errorEmbed('Este ticket já está fechado.')], ephemeral: true });
    if (!isStaff(interaction.member) && ticket.user_id !== interaction.user.id) {
      return interaction.reply({ embeds: [errorEmbed('Sem permissão para fechar este ticket.')], ephemeral: true });
    }
    const reason = interaction.fields.getTextInputValue('close_reason') || 'Sem motivo informado';
    return closeTicket(interaction, ticket, reason);
  }

  // ── Nota interna ─────────────────────────────────────────
  if (customId.startsWith('modal_note_')) {
    const ticketId = customId.replace('modal_note_', '');
    const note = interaction.fields.getTextInputValue('note_text');
    db.addNote(ticketId, interaction.user.id, interaction.user.tag, note);
    db.addLog(ticketId, 'NOTA ADICIONADA', interaction.user.id, interaction.user.tag);
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(config.colors.warning)
        .setTitle('📝 Nota Interna')
        .setDescription(note)
        .setFooter({ text: `Por ${interaction.user.tag}` })
        .setTimestamp()],
      ephemeral: true,
    });
  }

  // ── Renomear ─────────────────────────────────────────────
  if (customId.startsWith('modal_rename_')) {
    const ticketId = customId.replace('modal_rename_', '');
    const ticket = db.getTicket(ticketId);
    if (!ticket) return;
    const novoAssunto = interaction.fields.getTextInputValue('rename_text');
    const novoNome = `🎫│${ticketId.toLowerCase()}-${novoAssunto.toLowerCase().replace(/\s+/g, '-').slice(0, 50)}`;
    await interaction.channel.setName(novoNome).catch(() => {});
    db.updateTicket(ticketId, { subject: novoAssunto });
    db.addLog(ticketId, 'RENOMEADO', interaction.user.id, interaction.user.tag, novoNome);
    return interaction.reply({ embeds: [successEmbed(`Canal renomeado para **${novoNome}**!`)], ephemeral: true });
  }
}

module.exports = { handleInteraction };
