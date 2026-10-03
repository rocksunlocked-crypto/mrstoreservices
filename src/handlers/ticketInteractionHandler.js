/**
 * ticketInteractionHandler.js — Roteador de interações do sistema de tickets avançado
 *
 * Botões do painel fixado:
 *   tmenu_usuario_   → abre submenu ephemeral para o usuário
 *   tmenu_admin_     → abre submenu ephemeral para staff
 *   ticket_close_    → fecha o ticket (qualquer um: dono ou staff)
 *
 * Submenu Usuário:
 *   tchamar_staff_   → gera PIX R$1; ao pagar notifica todos os staffs no privado
 *   tver_ticket_     → mostra info do ticket para o usuário
 *   ticket_transcript_ → gera transcript (só staff; usuário vê mensagem explicando)
 *
 * Submenu Admin:
 *   ticket_claim_    → assumir
 *   ticket_priority_ → prioridade
 *   ticket_tags_     → tags
 *   ticket_addnote_  → nota interna
 *   ticket_transfer_ → transferir
 *   ticket_rename_   → renomear
 *   tgerar_pix_      → gera QR PIX ephemeral false no canal (preenche produto/valor/qtd via modal)
 */

const {
  ModalBuilder, TextInputBuilder, TextInputStyle,
  ActionRowBuilder, EmbedBuilder, StringSelectMenuBuilder,
  ButtonBuilder, ButtonStyle, AttachmentBuilder,
} = require('discord.js');
const db     = require('../database/ticketsDb');
const config = require('../config');
const { openTicket, closeTicket, reopenTicket, deleteTicketChannel } = require('../tickets/ticketManager');
const { getModalForCategory, extractModalData, buildMenuUsuario, buildMenuAdmin } = require('../tickets/categoryForms');
const { sendTranscript } = require('../utils/ticketTranscript');
const { isStaff, isAdmin, errorEmbed, successEmbed, getCategoryName, getDuration, formatDate } = require('../utils/ticketHelpers');
const { handleKeepOpen } = require('../systems/ticket_autoClose');
const { isOnCooldown, getCooldownRemaining } = require('../systems/ticket_cooldown');

// ────────────────────────────────────────────────────────────────────────────
// ROTEADOR PRINCIPAL
// ────────────────────────────────────────────────────────────────────────────

async function handleInteraction(interaction) {
  try {
    if (interaction.isChatInputCommand()) return handleCommand(interaction);
    if (interaction.isAutocomplete())     return handleAutocomplete(interaction);
    if (interaction.isStringSelectMenu()) return handleSelectMenu(interaction);
    if (interaction.isButton())           return handleButton(interaction);
    if (interaction.isModalSubmit())      return handleModal(interaction);
  } catch (err) {
    console.error('[TICKET INTERACTION]', err);
    const msg = { embeds: [errorEmbed('Ocorreu um erro inesperado.')], ephemeral: true };
    if (interaction.replied || interaction.deferred) interaction.followUp(msg).catch(() => {});
    else interaction.reply(msg).catch(() => {});
  }
}

// ────────────────────────────────────────────────────────────────────────────
// SLASH COMMANDS
// ────────────────────────────────────────────────────────────────────────────

async function handleCommand(interaction) {
  const command = interaction.client.commands.get(interaction.commandName);
  if (command) await command.execute(interaction);
}

async function handleAutocomplete(interaction) {
  const command = interaction.client.commands.get(interaction.commandName);
  if (command?.autocomplete) await command.autocomplete(interaction);
}

// ────────────────────────────────────────────────────────────────────────────
// SELECT MENUS
// ────────────────────────────────────────────────────────────────────────────

async function handleSelectMenu(interaction) {
  const { customId, values } = interaction;

  // Abertura de ticket via painel
  if (customId === 'ticket_open_menu') {
    const category = values[0];
    if (isOnCooldown(interaction.user.id)) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(config.colors.warning)
          .setDescription(`⏱️ Aguarde **${getCooldownRemaining(interaction.user.id)}s** antes de abrir outro ticket.`)],
        ephemeral: true,
      });
    }
    if (db.isBlocked(interaction.user.id, interaction.guild.id)) {
      return interaction.reply({ embeds: [errorEmbed('🔐 Você está bloqueado de abrir tickets.')], ephemeral: true });
    }
    const open = db.getOpenTicketsByUser(interaction.user.id, interaction.guild.id);
    if (open.length >= config.tickets.maxTicketsPerUser) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(config.colors.warning)
          .setDescription(`⚠️ Você já tem um ticket aberto. Feche-o antes de abrir outro.`)],
        ephemeral: true,
      });
    }
    return interaction.showModal(getModalForCategory(category));
  }

  // Prioridade
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

  // Tags
  if (customId.startsWith('select_tags_')) {
    const ticketId = customId.replace('select_tags_', '');
    const added = [];
    for (const tag of values) { if (db.addTag(ticketId, tag)) added.push(tag); }
    if (added.length) db.addLog(ticketId, 'TAGS ADICIONADAS', interaction.user.id, interaction.user.tag, added.join(', '));
    return interaction.update({
      embeds: [successEmbed(`Tags adicionadas: ${(added.length ? added : values).map(t => `\`${t}\``).join(', ')}`)],
      components: [],
    });
  }

  // Transferência
  if (customId.startsWith('select_transfer_')) {
    const ticketId = customId.replace('select_transfer_', '');
    const ticket = db.getTicket(ticketId);
    if (!ticket) return interaction.update({ embeds: [errorEmbed('Ticket não encontrado.')], components: [] });
    const targetMember = await interaction.guild.members.fetch(values[0]).catch(() => null);
    if (!targetMember) return interaction.update({ embeds: [errorEmbed('Membro não encontrado.')], components: [] });
    const anterior = ticket.claimed_by || 'Nenhum';
    db.updateTicket(ticketId, { claimed_by: targetMember.user.tag });
    db.addLog(ticketId, 'TRANSFERIDO', interaction.user.id, interaction.user.tag, `${anterior} → ${targetMember.user.tag}`);
    db.upsertStaffStat(values[0], targetMember.user.tag, 'tickets_claimed');
    return interaction.update({
      embeds: [new EmbedBuilder().setColor(config.colors.info).setDescription(`↔️ Ticket transferido para ${targetMember}!`).setTimestamp()],
      components: [],
    });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// BOTÕES
// ────────────────────────────────────────────────────────────────────────────

async function handleButton(interaction) {
  const { customId } = interaction;

  // ── Auto-close keep open ─────────────────────────────────
  if (customId.startsWith('autoclose_keep_'))
    return handleKeepOpen(interaction, customId.replace('autoclose_keep_', ''));

  // ── Avaliação via DM ─────────────────────────────────────
  if (customId.startsWith('rating_')) {
    const parts    = customId.split('_');
    const rating   = parseInt(parts[parts.length - 1]);
    const ticketId = parts.slice(1, -1).join('_');
    const ticket   = db.getTicket(ticketId);
    if (!ticket) return interaction.reply({ embeds: [errorEmbed('Ticket não encontrado.')], ephemeral: true });
    if (ticket.rating) return interaction.reply({ embeds: [errorEmbed('Você já avaliou este ticket.')], ephemeral: true });
    if (ticket.user_id !== interaction.user.id) return interaction.reply({ embeds: [errorEmbed('Apenas o dono pode avaliar.')], ephemeral: true });
    db.updateTicket(ticketId, { rating });
    if (ticket.claimed_by) db.updateStaffRating(ticket.claimed_by, ticket.claimed_by, rating);
    const labels = { 1: 'Péssimo 😞', 2: 'Ruim 😕', 3: 'Regular 😐', 4: 'Bom 😊', 5: 'Excelente 🤩' };
    return interaction.update({
      embeds: [new EmbedBuilder()
        .setColor(rating >= 4 ? config.colors.success : rating === 3 ? config.colors.warning : config.colors.danger)
        .setTitle('⭐ Avaliação Registrada!')
        .setDescription(`Você avaliou com **${'⭐'.repeat(rating)}** — ${labels[rating]}\nObrigado pelo seu feedback!`)
        .setTimestamp()],
      components: [],
    });
  }

  // ── Reabrir ──────────────────────────────────────────────
  if (customId.startsWith('ticket_reopen_')) {
    const ticket = db.getTicket(customId.replace('ticket_reopen_', ''));
    if (!ticket) return interaction.reply({ embeds: [errorEmbed('Ticket não encontrado.')], ephemeral: true });
    if (!isStaff(interaction.member) && ticket.user_id !== interaction.user.id)
      return interaction.reply({ embeds: [errorEmbed('Sem permissão.')], ephemeral: true });
    return reopenTicket(interaction, ticket);
  }

  // ── Deletar canal ────────────────────────────────────────
  if (customId.startsWith('ticket_delete_')) {
    if (!isStaff(interaction.member)) return interaction.reply({ embeds: [errorEmbed('Sem permissão.')], ephemeral: true });
    const ticket = db.getTicket(customId.replace('ticket_delete_', ''));
    if (!ticket) return interaction.reply({ embeds: [errorEmbed('Ticket não encontrado.')], ephemeral: true });
    return deleteTicketChannel(interaction, ticket);
  }

  // ── Verificar PIX "Chamar Staff" ─────────────────────────
  if (customId.startsWith('tverificar_pix_chamada_')) {
    const [txid, ticketId] = customId.replace('tverificar_pix_chamada_', '').split('__');
    return verificarPixChamada(interaction, txid, ticketId);
  }

  // ── Verificar PIX "Admin QR" ─────────────────────────────
  if (customId.startsWith('tverificar_pix_admin_')) {
    const [txid, ticketId] = customId.replace('tverificar_pix_admin_', '').split('__');
    return verificarPagamentoAdminPix(interaction, txid, ticketId);
  }

  // Resolver ticket do canal para os próximos botões
  // Extrai ticketId do customId de forma robusta (evita split('_').pop() que quebra com IDs compostos)
  const TICKET_PREFIXES = ['tmenu_usuario_','tmenu_admin_','ticket_close_','tchamar_staff_','tver_ticket_','ticket_transcript_','ticket_claim_','ticket_priority_','ticket_tags_','ticket_addnote_','ticket_transfer_','ticket_rename_','tgerar_pix_','ticket_reopen_','ticket_delete_'];
  let resolvedTicketId = null;
  for (const p of TICKET_PREFIXES) { if (customId.startsWith(p)) { resolvedTicketId = customId.slice(p.length); break; } }
  const ticket = db.getTicketByChannel(interaction.channel.id)
    || (resolvedTicketId ? db.getTicket(resolvedTicketId) : null);

  // ── MENU USUÁRIO ─────────────────────────────────────────
  if (customId.startsWith('tmenu_usuario_')) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(config.colors.primary)
        .setTitle('👤 Menu do Usuário')
        .setDescription('Escolha uma opção abaixo:')],
      components: [buildMenuUsuario(customId.replace('tmenu_usuario_', ''))],
      ephemeral: true,
    });
  }

  // ── MENU ADMIN ───────────────────────────────────────────
  if (customId.startsWith('tmenu_admin_')) {
    if (!isStaff(interaction.member))
      return interaction.reply({ embeds: [errorEmbed('Apenas staff pode usar o Menu Admin.')], ephemeral: true });
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(config.colors.warning)
        .setTitle('⚙️ Menu Admin')
        .setDescription('Escolha uma ação de gerenciamento:')],
      components: buildMenuAdmin(customId.replace('tmenu_admin_', '')),
      ephemeral: true,
    });
  }

  // ── FECHAR ───────────────────────────────────────────────
  if (customId.startsWith('ticket_close_')) {
    if (!ticket) return interaction.reply({ embeds: [errorEmbed('Ticket não encontrado.')], ephemeral: true });
    if (!isStaff(interaction.member) && ticket.user_id !== interaction.user.id)
      return interaction.reply({ embeds: [errorEmbed('Sem permissão.')], ephemeral: true });
    if (ticket.status === 'closed')
      return interaction.reply({ embeds: [errorEmbed('Este ticket já está fechado.')], ephemeral: true });
    const modal = new ModalBuilder().setCustomId(`modal_close_ticket_${ticket.ticket_id}`).setTitle('❌ Fechar Ticket');
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('close_reason').setLabel('Motivo (opcional)')
        .setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(500)
        .setPlaceholder('Ex: Problema resolvido, dúvida esclarecida...'),
    ));
    return interaction.showModal(modal);
  }

  // ── CHAMAR STAFF (PIX R$1) ───────────────────────────────
  if (customId.startsWith('tchamar_staff_')) {
    const ticketId = customId.replace('tchamar_staff_', '');
    if (!ticket) return interaction.reply({ embeds: [errorEmbed('Ticket não encontrado.')], ephemeral: true });
    if (ticket.user_id !== interaction.user.id)
      return interaction.reply({ embeds: [errorEmbed('Apenas o dono do ticket pode chamar o staff.')], ephemeral: true });
    return chamarStaffViaPix(interaction, ticket, ticketId);
  }

  // ── VER MEU TICKET ───────────────────────────────────────
  if (customId.startsWith('tver_ticket_')) {
    if (!ticket) return interaction.reply({ embeds: [errorEmbed('Ticket não encontrado.')], ephemeral: true });
    const pInfo    = config.priorities[ticket.priority] || config.priorities.media;
    const embed    = new EmbedBuilder()
      .setColor(pInfo.color)
      .setTitle(`🎫 ${ticket.ticket_id}`)
      .addFields(
        { name: '📂 Categoria',  value: getCategoryName(ticket.category || ticket.tipo), inline: true },
        { name: '📌 Status',     value: ticket.status === 'open' || ticket.status === 'aberto' ? '🟢 Aberto' : '🔴 Fechado', inline: true },
        { name: '🎯 Prioridade', value: pInfo.label, inline: true },
        { name: '✋ Atendente',  value: ticket.claimed_by || ticket.atendente || 'Aguardando...', inline: true },
        { name: '📅 Aberto em',  value: formatDate(ticket.created_at || ticket.criado_em), inline: true },
        { name: '⏱️ Duração',    value: getDuration(ticket.created_at || ticket.criado_em), inline: true },
      )
      .setTimestamp();
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // ── TRANSCRIPT (submenu usuário) ─────────────────────────
  if (customId.startsWith('ticket_transcript_')) {
    // Usuário comum: orienta; staff: gera
    if (!isStaff(interaction.member)) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(config.colors.info)
          .setDescription('📄 O transcript é gerado automaticamente ao fechar o ticket e enviado para o canal de logs.')],
        ephemeral: true,
      });
    }
    if (!ticket) return interaction.reply({ embeds: [errorEmbed('Ticket não encontrado.')], ephemeral: true });
    await interaction.deferReply({ ephemeral: true });
    const logCh = interaction.guild.channels.cache.get(config.channels.ticketTranscript)
      || await interaction.guild.client.channels.fetch(config.channels.ticketTranscript).catch(() => null);
    await sendTranscript(interaction.channel, ticket, logCh, interaction.user.tag);
    db.addLog(ticket.ticket_id, 'TRANSCRIPT MANUAL', interaction.user.id, interaction.user.tag);
    return interaction.editReply({ embeds: [successEmbed('Transcript gerado e enviado!')] });
  }

  // ── ASSUMIR ──────────────────────────────────────────────
  if (customId.startsWith('ticket_claim_')) {
    if (!isStaff(interaction.member)) return interaction.reply({ embeds: [errorEmbed('Sem permissão.')], ephemeral: true });
    if (!ticket || ticket.status === 'closed') return interaction.reply({ embeds: [errorEmbed('Ticket fechado ou não encontrado.')], ephemeral: true });
    if (ticket.claimed_by) return interaction.reply({ embeds: [errorEmbed(`Já assumido por **${ticket.claimed_by}**.`)], ephemeral: true });
    db.updateTicket(ticket.ticket_id, { claimed_by: interaction.user.tag });
    db.addLog(ticket.ticket_id, 'ASSUMIDO', interaction.user.id, interaction.user.tag);
    db.upsertStaffStat(interaction.user.id, interaction.user.tag, 'tickets_claimed');
    // Notificar usuário no privado
    const usuarioId = ticket.user_id || ticket.usuario_id;
    const member    = await interaction.guild.members.fetch(usuarioId).catch(() => null);
    if (member) {
      member.send({ embeds: [new EmbedBuilder().setColor(config.colors.success)
        .setTitle('✋ Seu ticket foi assumido!')
        .setDescription(`**${interaction.user.tag}** assumiu seu ticket **${ticket.ticket_id}** e irá te atender em breve.`)
        .setTimestamp()] }).catch(() => {});
    }
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(config.colors.success)
        .setDescription(`✋ **${interaction.user}** assumiu este ticket!`).setTimestamp()],
    });
  }

  // ── PRIORIDADE ───────────────────────────────────────────
  if (customId.startsWith('ticket_priority_')) {
    if (!isStaff(interaction.member)) return interaction.reply({ embeds: [errorEmbed('Sem permissão.')], ephemeral: true });
    if (!ticket) return interaction.reply({ embeds: [errorEmbed('Ticket não encontrado.')], ephemeral: true });
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

  // ── TAGS ─────────────────────────────────────────────────
  if (customId.startsWith('ticket_tags_')) {
    if (!isStaff(interaction.member)) return interaction.reply({ embeds: [errorEmbed('Sem permissão.')], ephemeral: true });
    if (!ticket) return interaction.reply({ embeds: [errorEmbed('Ticket não encontrado.')], ephemeral: true });
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

  // ── NOTA INTERNA ─────────────────────────────────────────
  if (customId.startsWith('ticket_addnote_')) {
    if (!isStaff(interaction.member)) return interaction.reply({ embeds: [errorEmbed('Sem permissão.')], ephemeral: true });
    if (!ticket) return interaction.reply({ embeds: [errorEmbed('Ticket não encontrado.')], ephemeral: true });
    const modal = new ModalBuilder().setCustomId(`modal_note_${ticket.ticket_id}`).setTitle('📝 Nota Interna');
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('note_text').setLabel('Nota (só a staff vê)')
        .setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000),
    ));
    return interaction.showModal(modal);
  }

  // ── TRANSFERIR ───────────────────────────────────────────
  if (customId.startsWith('ticket_transfer_')) {
    if (!isStaff(interaction.member)) return interaction.reply({ embeds: [errorEmbed('Sem permissão.')], ephemeral: true });
    if (!ticket) return interaction.reply({ embeds: [errorEmbed('Ticket não encontrado.')], ephemeral: true });
    const staffList = [];
    for (const roleId of [config.roles.admin, config.roles.mod, config.roles.suporte, config.tickets.roles.admin, config.tickets.roles.moderador, config.tickets.roles.suporte]) {
      const role = roleId && interaction.guild.roles.cache.get(roleId);
      if (role) role.members.forEach(m => { if (!m.user.bot && !staffList.find(s => s.value === m.id)) staffList.push({ label: m.user.tag.slice(0, 100), value: m.id }); });
    }
    if (!staffList.length) return interaction.reply({ embeds: [errorEmbed('Nenhum staff encontrado.')], ephemeral: true });
    const menu = new StringSelectMenuBuilder().setCustomId(`select_transfer_${ticket.ticket_id}`).setPlaceholder('Selecione...').addOptions(staffList.slice(0, 25));
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(config.colors.info).setDescription('↔️ Para quem transferir?')],
      components: [new ActionRowBuilder().addComponents(menu)],
      ephemeral: true,
    });
  }

  // ── RENOMEAR ─────────────────────────────────────────────
  if (customId.startsWith('ticket_rename_')) {
    if (!isStaff(interaction.member)) return interaction.reply({ embeds: [errorEmbed('Sem permissão.')], ephemeral: true });
    if (!ticket) return interaction.reply({ embeds: [errorEmbed('Ticket não encontrado.')], ephemeral: true });
    const modal = new ModalBuilder().setCustomId(`modal_rename_${ticket.ticket_id}`).setTitle('✏️ Renomear Ticket');
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('rename_text').setLabel('Novo assunto').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80),
    ));
    return interaction.showModal(modal);
  }

  // ── GERAR PIX / QR (Admin) ───────────────────────────────
  if (customId.startsWith('tgerar_pix_')) {
    if (!isStaff(interaction.member)) return interaction.reply({ embeds: [errorEmbed('Apenas staff pode gerar PIX.')], ephemeral: true });
    if (!ticket) return interaction.reply({ embeds: [errorEmbed('Ticket não encontrado.')], ephemeral: true });
    const modal = new ModalBuilder().setCustomId(`modal_pix_admin_${ticket.ticket_id}`).setTitle('💸 Gerar QR Code PIX');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('pix_produto').setLabel('Nome do produto / serviço').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('pix_valor').setLabel('Valor total (R$)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: 29.90 ou 23').setMinLength(1).setMaxLength(12),
      ),
    );
    return interaction.showModal(modal);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// MODAIS
// ────────────────────────────────────────────────────────────────────────────

async function handleModal(interaction) {
  const { customId } = interaction;

  // Abrir ticket
  if (customId.startsWith('modal_open_ticket_')) {
    const category = customId.replace('modal_open_ticket_', '');
    const { subject, extraFields } = extractModalData(interaction, category);
    return openTicket(interaction, category, subject, extraFields);
  }

  // Fechar ticket
  if (customId.startsWith('modal_close_ticket_')) {
    const ticketId = customId.replace('modal_close_ticket_', '');
    const ticket   = db.getTicket(ticketId);
    if (!ticket) return interaction.reply({ embeds: [errorEmbed('Ticket não encontrado.')], ephemeral: true });
    if (ticket.status === 'closed') return interaction.reply({ embeds: [errorEmbed('Já fechado.')], ephemeral: true });
    if (!isStaff(interaction.member) && ticket.user_id !== interaction.user.id)
      return interaction.reply({ embeds: [errorEmbed('Sem permissão.')], ephemeral: true });
    const reason = interaction.fields.getTextInputValue('close_reason') || 'Sem motivo informado';
    return closeTicket(interaction, ticket, reason);
  }

  // Nota interna
  if (customId.startsWith('modal_note_')) {
    const ticketId = customId.replace('modal_note_', '');
    const note     = interaction.fields.getTextInputValue('note_text');
    db.addNote(ticketId, interaction.user.id, interaction.user.tag, note);
    db.addLog(ticketId, 'NOTA ADICIONADA', interaction.user.id, interaction.user.tag);
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(config.colors.warning).setTitle('📝 Nota Interna').setDescription(note)
        .setFooter({ text: `Por ${interaction.user.tag}` }).setTimestamp()],
      ephemeral: true,
    });
  }

  // Renomear
  if (customId.startsWith('modal_rename_')) {
    const ticketId   = customId.replace('modal_rename_', '');
    const ticket     = db.getTicket(ticketId);
    if (!ticket) return;
    const novoAssunto = interaction.fields.getTextInputValue('rename_text');
    const novoNome    = `🎫│${ticketId.toLowerCase()}-${novoAssunto.toLowerCase().replace(/\s+/g, '-').slice(0, 50)}`;
    await interaction.channel.setName(novoNome).catch(() => {});
    db.updateTicket(ticketId, { subject: novoAssunto });
    db.addLog(ticketId, 'RENOMEADO', interaction.user.id, interaction.user.tag, novoNome);
    return interaction.reply({ embeds: [successEmbed(`Canal renomeado para **${novoNome}**!`)], ephemeral: true });
  }

  // PIX Admin — gerar QR no canal
  if (customId.startsWith('modal_pix_admin_')) {
    const ticketId  = customId.replace('modal_pix_admin_', '');
    const produto   = interaction.fields.getTextInputValue('pix_produto');
    const valorStr  = interaction.fields.getTextInputValue('pix_valor').replace(',', '.');
    const valor     = parseFloat(valorStr);
    if (isNaN(valor) || valor <= 0)
      return interaction.reply({ embeds: [errorEmbed('Valor inválido. Use ex: 29.90')], ephemeral: true });
    return gerarPixAdmin(interaction, ticketId, produto, valor);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// HELPER — CHAMAR STAFF VIA PIX R$1
// ────────────────────────────────────────────────────────────────────────────

async function chamarStaffViaPix(interaction, ticket, ticketId) {
  await interaction.deferReply({ ephemeral: true });

  try {
    const efi    = require('../systems/efi');
    const { v4: uuidv4 } = require('uuid');
    const pedidoId = uuidv4();

    const cobr = await efi.criarCobrancaPix({
      valor:       1.00,
      descricao:   `Chamar Staff`,
      pedidoId,
      nomeCliente: interaction.user.username?.slice(0, 50) || 'Cliente',
    });
    console.log('[Chamar Staff PIX] cobr:', JSON.stringify(cobr));

    // Tentar gerar QR — se falhar, usa o location como fallback
    let qrcode = null, imagemQr = null;
    try {
      const qr = await efi.gerarQRCode(cobr.locId);
      qrcode   = qr.qrcode;
      imagemQr = qr.imagemQrcode || qr.linkVisualizacao || null;
      console.log('[Chamar Staff PIX] QR gerado com sucesso');
    } catch (qrErr) {
      console.warn('[Chamar Staff PIX] QR Code falhou:', qrErr.message, '— usando txid como fallback');
      // Usar o txid diretamente — o usuário pode copiar e colar no app do banco
      qrcode = cobr.txid;
      imagemQr = null;
    }

    // Se nem o txid veio, abortar
    if (!qrcode) throw new Error('Não foi possível gerar o código PIX.');

    const embed = new EmbedBuilder()
      .setColor(config.colors.pix)
      .setTitle('📞 Chamar Staff — PIX R$ 1,00')
      .setDescription([
        `Para chamar o staff com prioridade, pague **R$ 1,00** via PIX.`,
        `Assim que o pagamento for confirmado, **todos os membros da staff serão notificados no privado** para atender seu ticket.`,
        ``,
        `⏱️ QR Code válido por **30 minutos**.`,
        `📋 Pix Copia e Cola abaixo:`,
      ].join('\n'))
      .addFields({ name: '📋 Pix Copia e Cola', value: `\`\`\`${qrcode}\`\`\`` })
      .setImage(imagemQr)
      .setFooter({ text: `Ticket ${ticketId} • Gerado em ${new Date().toLocaleTimeString('pt-BR')}` })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`tverificar_pix_chamada_${cobr.txid}__${ticketId}`)
        .setLabel('✅ Já paguei — Verificar')
        .setStyle(ButtonStyle.Success),
    );

    // Salvar txid para polling no index
    if (!global._pixChamadas) global._pixChamadas = new Map();
    global._pixChamadas.set(cobr.txid, {
      ticketId,
      usuarioId: interaction.user.id,
      guild:     interaction.guild,
      canal:     interaction.channel,
      criado_em: Date.now(),
    });

    // Iniciar polling automático
    iniciarPollingChamada(cobr.txid, ticketId, interaction);

    return interaction.editReply({ embeds: [embed], components: [row] });
  } catch (err) {
    console.error('[Chamar Staff PIX]', err.message);
    console.error('[Chamar Staff PIX] stack:', err.stack?.split('\n')[0]);
    return interaction.editReply({ embeds: [errorEmbed(`Erro ao gerar PIX: ${err.message}`)] });
  }
}

async function verificarPixChamada(interaction, txid, ticketId) {
  await interaction.deferReply({ ephemeral: true });
  try {
    const efi    = require('../systems/efi');
    const status = await efi.consultarCobranca(txid);
    if (!status.pago) {
      return interaction.editReply({ embeds: [new EmbedBuilder().setColor(config.colors.warning)
        .setDescription('⏳ Pagamento ainda não identificado. Aguarde alguns segundos e tente novamente.')] });
    }
    // Log de vendas — Chamar Staff
    try {
      const { db: dbMain } = require('../database/database');
      const { logVenda }   = require('../utils/canalVendas');
      const pedido = dbMain.prepare("SELECT * FROM pedidos WHERE tx_id=?").get(txid);
      if (pedido) {
        dbMain.prepare("UPDATE pedidos SET status='pago', pago_em=strftime('%s','now') WHERE tx_id=? AND status='pendente'").run(txid);
        await logVenda(interaction.client, { ...pedido, status: 'pago', metodo_pag: 'pix' }, {
          vendidoPorCustom: `🎫 Ticket — Chamar Staff`,
        });
      }
    } catch (e) { console.error('[Chamar Staff logVenda]', e.message); }

    await notificarStaffChamada(interaction.client, ticketId, interaction.guild, interaction.channel, interaction.user.id);
    return interaction.editReply({ embeds: [successEmbed('✅ Pagamento confirmado! Staff notificado no privado.')] });
  } catch (err) {
    return interaction.editReply({ embeds: [errorEmbed(`Erro ao verificar: ${err.message}`)] });
  }
}

async function notificarStaffChamada(client, ticketId, guild, canal, usuarioId) {
  const { db: dbMain } = require('../database/database');
  const embed = new EmbedBuilder()
    .setColor(config.colors.danger)
    .setTitle('🚨 Chamada de Staff Confirmada!')
    .setDescription([
      `O usuário <@${usuarioId}> pagou **R$ 1,00** para solicitar atendimento urgente.`,
      ``,
      `📍 Ticket: <#${canal.id}>`,
      `🎫 ID: \`${ticketId}\``,
    ].join('\n'))
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setLabel('🎫 Ir para o Ticket').setStyle(ButtonStyle.Link).setURL(`https://discord.com/channels/${guild.id}/${canal.id}`),
  );

  // Notificar todos os staffs no privado
  const staffRoles = [config.roles.owner, config.roles.admin, config.roles.mod, config.roles.suporte, config.tickets.roles.admin, config.tickets.roles.moderador, config.tickets.roles.suporte].filter(Boolean);
  const notificados = new Set();

  for (const roleId of staffRoles) {
    const role = guild.roles.cache.get(roleId);
    if (!role) continue;
    for (const [, member] of role.members) {
      if (member.user.bot || notificados.has(member.id)) continue;
      notificados.add(member.id);
      member.send({ embeds: [embed], components: [row] }).catch(() => {});
    }
  }

  // Avisar no canal do ticket
  await canal.send({
    content: `<@${usuarioId}>`,
    embeds: [new EmbedBuilder().setColor(config.colors.success)
      .setDescription('✅ **Pagamento confirmado!** A staff foi notificada no privado e irá atender em breve.')
      .setTimestamp()],
  }).catch(() => {});
}

function iniciarPollingChamada(txid, ticketId, interaction) {
  let tentativas = 0;
  const maxTentativas = 36;
  const timer = setInterval(async () => {
    tentativas++;
    try {
      const efi    = require('../systems/efi');
      const status = await efi.consultarCobranca(txid);
      if (status.pago) {
        clearInterval(timer);
        global._pixChamadas?.delete(txid);
        await notificarStaffChamada(interaction.client, ticketId, interaction.guild, interaction.channel, interaction.user.id);
      }
    } catch {}
    if (tentativas >= maxTentativas) {
      clearInterval(timer);
      global._pixChamadas?.delete(txid);
    }
  }, 50_000);
}

// ────────────────────────────────────────────────────────────────────────────
// HELPER — GERAR PIX ADMIN (QR no canal, visível para todos)
// ────────────────────────────────────────────────────────────────────────────

async function gerarPixAdmin(interaction, ticketId, produto, valorTotal) {
  await interaction.deferReply({ ephemeral: true });

  try {
    const efi    = require('../systems/efi');
    const { v4: uuidv4 } = require('uuid');
    const { Usuarios, Pedidos, Produtos, db: dbMain } = require('../database/database');

    // Garantir perfil do usuário do ticket no banco
    const ticket      = db.getTicketByChannel(interaction.channel.id) || db.getTicket(ticketId);
    const usuarioId   = ticket?.user_id || ticket?.usuario_id;
    if (usuarioId) Usuarios.garantir(usuarioId, '');

    // Criar pedido real no banco para rastrear no log de vendas
    const pedidoId = uuidv4();
    const atendente = interaction.user.id; // quem gerou o QR

    // Criar produto temporário se não existir (produto avulso do ticket)
    let produtoDb = dbMain.prepare("SELECT * FROM produtos WHERE nome=? AND tipo='ticket_avulso'").get(produto);
    if (!produtoDb) {
      const pid = uuidv4();
      dbMain.prepare("INSERT INTO produtos (id, nome, descricao, preco, tipo, criado_por) VALUES (?,?,?,?,?,?)")
        .run(pid, produto, 'Produto gerado via ticket', valorTotal, 'ticket_avulso', atendente);
      produtoDb = { id: pid, nome: produto };
    }

    // Registrar pedido
    dbMain.prepare(`
      INSERT INTO pedidos (id, usuario_id, produto_id, quantidade, valor_unit, valor_total, status, metodo_pag, ticket_id, nota_fiscal)
      VALUES (?,?,?,1,?,?,?,?,?,?)
    `).run(
      pedidoId,
      usuarioId || 'desconhecido',
      produtoDb.id,
      valorTotal, valorTotal,
      'pendente', 'pix',
      ticketId,
      JSON.stringify({ geradoPor: atendente, via: 'ticket_admin_qr' }),
    );

    // Gerar PIX
    const cobr = await efi.criarCobrancaPix({
      valor:     valorTotal,
      descricao: `${produto} — Ticket ${ticketId}`,
      pedidoId,
    });
    const qr        = await efi.gerarQRCode(cobr.locId);
    const expiraPix = Math.floor(Date.now() / 1000) + 1800;

    // Salvar txid no pedido
    dbMain.prepare("UPDATE pedidos SET tx_id=? WHERE id=?").run(cobr.txid, pedidoId);

    const embed = new EmbedBuilder()
      .setColor(config.colors.pix)
      .setTitle('💸 Cobrança PIX')
      .setDescription('Realize o pagamento abaixo para concluir.')
      .addFields(
        { name: '📦 Produto',    value: produto,                             inline: true  },
        { name: '💵 Valor',      value: `**R$ ${valorTotal.toFixed(2)}**`,   inline: true  },
        { name: '⏰ Expira em',  value: `<t:${expiraPix}:R>`,                inline: true  },
        { name: '🎫 Ticket',     value: `\`${ticketId}\``,                   inline: true  },
        { name: '🆔 Pedido',     value: `\`${pedidoId.slice(0,8).toUpperCase()}\``, inline: true },
        { name: '✋ Gerado por', value: `<@${atendente}>`,                   inline: true  },
        { name: '📋 Pix Copia e Cola', value: `\`\`\`${qr.qrcode}\`\`\`` },
      )
      .setImage(qr.imagemQrcode || qr.linkVisualizacao || null)
      .setFooter({ text: 'MrStore • Aguardando pagamento...' })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`tverificar_pix_admin_${cobr.txid}__${ticketId}`)
        .setLabel('✅ Verificar Pagamento')
        .setStyle(ButtonStyle.Success),
    );

    await interaction.channel.send({ embeds: [embed], components: [row] });
    await interaction.editReply({ embeds: [successEmbed('✅ QR Code PIX gerado no canal!')] });

    // Polling automático — ao confirmar, marca pago e dispara log de vendas
    iniciarPollingAdminPix(cobr.txid, ticketId, interaction, produto, valorTotal, pedidoId, atendente);
  } catch (err) {
    console.error('[PIX Admin]', err.message);
    return interaction.editReply({ embeds: [errorEmbed(`Erro ao gerar PIX: ${err.message}`)] });
  }
}

async function verificarPagamentoAdminPix(interaction, txid, ticketId) {
  await interaction.deferReply({ ephemeral: true });
  try {
    const efi    = require('../systems/efi');
    const status = await efi.consultarCobranca(txid);
    if (!status.pago) {
      return interaction.editReply({ embeds: [new EmbedBuilder().setColor(config.colors.warning)
        .setDescription('⏳ Pagamento ainda não identificado. Tente em alguns segundos.')] });
    }
    await marcarPagoPainel(interaction.channel, txid, ticketId, interaction.client);
    return interaction.editReply({ embeds: [successEmbed('✅ Pagamento confirmado!')] });
  } catch (err) {
    return interaction.editReply({ embeds: [errorEmbed(`Erro: ${err.message}`)] });
  }
}

async function marcarPagoPainel(canal, txid, ticketId, client, atendenteId = null) {
  // Atualiza pedido no banco
  try {
    const { Pedidos, db: dbMain } = require('../database/database');
    const pedido = dbMain.prepare("SELECT * FROM pedidos WHERE tx_id=?").get(txid);
    if (pedido && pedido.status === 'pendente') {
      dbMain.prepare("UPDATE pedidos SET status='pago', pago_em=strftime('%s','now') WHERE tx_id=?").run(txid);
      // Disparar log de vendas com staff como "Vendido por"
      if (client) {
        try {
          const { logVenda } = require('../utils/canalVendas');
          const nota = pedido.nota_fiscal ? JSON.parse(pedido.nota_fiscal) : {};
          const atendente = atendenteId || nota.geradoPor || null;
          await logVenda(client, { ...pedido, status: 'pago', metodo_pag: 'pix' }, {
            atendente,
            vendidoPorCustom: atendente ? null : '🎫 Ticket (admin gerou QR)',
          });
        } catch (e) { console.error('[PIX Admin logVenda]', e.message); }
      }
    }
  } catch (e) { console.error('[marcarPagoPainel DB]', e.message); }

  // Atualiza a mensagem do QR no canal
  try {
    const msgs   = await canal.messages.fetch({ limit: 20 });
    const qrMsg  = msgs.find(m =>
      m.author.bot && m.embeds.length > 0 &&
      m.embeds[0]?.footer?.text?.includes('Aguardando pagamento') &&
      m.components?.length > 0 &&
      m.components[0]?.components?.[0]?.customId?.includes(txid)
    );
    if (qrMsg) {
      const embedPago = EmbedBuilder.from(qrMsg.embeds[0].toJSON())
        .setColor(config.colors.success)
        .setFooter({ text: '✅ PAGAMENTO CONFIRMADO — MrStore' });
      await qrMsg.edit({ embeds: [embedPago], components: [] });
    }
  } catch {}

  await canal.send({
    embeds: [new EmbedBuilder()
      .setColor(config.colors.success)
      .setTitle('✅ Pagamento Confirmado!')
      .setDescription('O pagamento via PIX foi identificado e confirmado.\nObrigado! Aguarde a entrega do produto.')
      .setTimestamp()
      .setFooter({ text: 'MrStore • Pagamento PIX' })],
  }).catch(() => {});
}

function iniciarPollingAdminPix(txid, ticketId, interaction, produto, valor, pedidoId, atendente) {
  let tentativas = 0;
  const timer = setInterval(async () => {
    tentativas++;
    try {
      const efi    = require('../systems/efi');
      const status = await efi.consultarCobranca(txid);
      if (status.pago) {
        clearInterval(timer);
        await marcarPagoPainel(interaction.channel, txid, ticketId, interaction.client, atendente);
      }
    } catch {}
    if (tentativas >= 36) clearInterval(timer);
  }, 50_000);
}

module.exports = { handleInteraction };
