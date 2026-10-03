/**
 * ticketManager.js — Sistema avançado de tickets
 *
 * Usa o banco de dados unificado (database.js / Tickets helper),
 * o transcript do bot de vendas (ticketTranscript.js),
 * e as categorias/cargos configurados no config.js unificado.
 */

const {
  ChannelType, PermissionFlagsBits, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
} = require('discord.js');
const config  = require('../config');
const { Tickets, db } = require('../database/database');
const { generateTicketId, getCategoryName } = require('../utils/ticketHelpers');
const { buildWelcomeEmbed, buildTicketButtons } = require('./categoryForms');
const { sendTranscript } = require('../utils/ticketTranscript');
const { sendOpenConfirmDM } = require('../systems/ticket_notifications');
const { setCooldown, setReopenWindow } = require('../systems/ticket_cooldown');
const { clearAlerts } = require('../systems/ticket_slaSystem');
const { clearWarnings } = require('../systems/ticket_autoClose');

// Mapa categoria -> pasta do Discord (do config unificado)
function getCategoryId(category) {
  return config.tickets.categories[category] || config.channels.categoryTickets;
}

// ── Abre um novo ticket avançado ──────────────────────────────
async function openTicket(interaction, category, subject, extraFields = []) {
  const { guild, user } = interaction;

  // Verificar bloqueio no banco de vendas
  const usuarioDB = db.prepare('SELECT bloqueado FROM usuarios WHERE discord_id = ?').get(user.id);
  if (usuarioDB?.bloqueado) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(config.colors.danger).setDescription('🔐 Você está bloqueado de abrir tickets.')],
      ephemeral: true,
    });
  }

  // Verificar limite de tickets abertos (tabela tickets do banco de vendas)
  const abertos = Tickets.abertosUsuario(user.id);
  if (abertos >= config.tickets.maxTicketsPerUser) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(config.colors.warning)
        .setDescription(`⚠️ Você já tem um ticket aberto. Feche-o antes de abrir outro.`)],
      ephemeral: true,
    });
  }

  await interaction.deferReply({ ephemeral: true });

  const parentId = getCategoryId(category);
  const parent = await guild.channels.fetch(parentId).catch(() => null);
  if (!parent || parent.type !== ChannelType.GuildCategory) {
    return interaction.editReply({
      embeds: [new EmbedBuilder().setColor(config.colors.danger)
        .setDescription('❌ Categoria de tickets não encontrada. Verifique o `.env`.')],
    });
  }

  // Gerar ID único no mesmo formato dos tickets de compra
  const ticketId = generateTicketId();
  const channelName = `🎫│${ticketId.toLowerCase()}`;
  const r = config.roles;

  let channel;
  try {
    channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: parent.id,
      topic: `${ticketId} | ${user.tag} | ${getCategoryName(category)}`,
      permissionOverwrites: [
        { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        {
          id: user.id,
          allow: [
            PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.EmbedLinks,
          ],
        },
        ...[r.admin, r.mod, r.loja, r.aceitarCompra, r.owner, r.suporte, r.bots].map(id => ({
          id,
          allow: [
            PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles,
          ],
        })),
      ],
    });
  } catch (err) {
    console.error('[Ticket] Erro ao criar canal:', err.message);
    return interaction.editReply({
      embeds: [new EmbedBuilder().setColor(config.colors.danger)
        .setDescription(`❌ Erro ao criar canal: ${err.message}`)],
    });
  }

  // Salvar no banco de dados do bot de vendas (tabela tickets)
  const ticketDbId = Tickets.criar({
    canalId:   channel.id,
    usuarioId: user.id,
    tipo:      category,
  });

  // Registrar também no formato do banco de tickets para compatibilidade
  try {
    db.prepare(`
      INSERT OR IGNORE INTO tickets (id, canal_id, usuario_id, tipo, status)
      VALUES (?, ?, ?, ?, 'aberto')
    `).run(ticketDbId, channel.id, user.id, category);
  } catch {}

  // Montar ticket object para os builders
  const ticketObj = {
    ticket_id:  ticketId,
    id:         ticketDbId,
    channel_id: channel.id,
    user_id:    user.id,
    username:   user.tag,
    category,
    subject,
    priority: 'media',
    status:   'open',
    created_at: Math.floor(Date.now() / 1000),
  };

  const welcomeEmbed = buildWelcomeEmbed(ticketObj, user, extraFields);
  const buttons = buildTicketButtons(ticketId);

  const panelMsg = await channel.send({
    content: `${user} | <@&${r.suporte}> <@&${r.mod}>`,
    embeds:  [welcomeEmbed],
    components: buttons,
  });
  await panelMsg.pin().catch(() => {});

  // Cooldown de abertura
  setCooldown(user.id);

  // DM de confirmação
  const member = await guild.members.fetch(user.id).catch(() => null);
  if (member) sendOpenConfirmDM(member, ticketObj);

  const { ActionRowBuilder: AR, ButtonBuilder: BB, ButtonStyle: BS } = require('discord.js');
  await interaction.editReply({
    embeds: [new EmbedBuilder()
      .setColor(config.colors.success)
      .setTitle('🎫 Ticket Aberto!')
      .setDescription([
        `> Seu ticket foi criado com sucesso em ${channel}!`,
        `> Nossa equipe irá te atender em breve.`,
        ``,
        `> ⚠️ **Não abra múltiplos tickets** para o mesmo assunto.`,
      ].join('\n'))
      .addFields(
        { name: '🆔 ID',        value: `\`${ticketId.slice(0,8).toUpperCase()}\``, inline: true },
        { name: '📂 Categoria', value: getCategoryName(category),                  inline: true },
        { name: '📋 Assunto',   value: subject || 'Sem assunto',                   inline: false },
      )
      .setFooter({ text: 'Máximo Store • Sistema de Tickets' })
      .setTimestamp()],
    components: [new AR().addComponents(
      new BB()
        .setLabel('🎫 Ir para o Ticket')
        .setStyle(BS.Link)
        .setURL(`https://discord.com/channels/${guild.id}/${channel.id}`),
    )],
  });
}

// ── Fecha um ticket ───────────────────────────────────────────
async function closeTicket(interaction, ticket, reason = 'Sem motivo informado') {
  const { guild, user, channel } = interaction;

  await interaction.deferReply();

  try {
    // Torna canal somente-leitura
    await channel.permissionOverwrites.edit(ticket.user_id, { SendMessages: false }).catch(() => {});

    // Atualizar no banco de vendas
    Tickets.atualizar(channel.id, {
      status:      'fechado',
      fechado_por: user.id,
      motivo:      reason,
      fechado_em:  Math.floor(Date.now() / 1000),
    });

    // Limpar rastreadores
    clearAlerts(ticket.ticket_id);
    clearWarnings(ticket.ticket_id);
    setReopenWindow(ticket.ticket_id, Math.floor(Date.now() / 1000));

    // Atualizar objeto do ticket com fechamento
    const ticketFechado = {
      ...ticket,
      status:      'fechado',
      closed_by:   user.id,
      fechado_por: user.id,
      close_reason: reason,
      motivo:      reason,
      closed_at:   Math.floor(Date.now() / 1000),
      fechado_em:  Math.floor(Date.now() / 1000),
    };

    // Gerar e enviar transcript
    const canalLog = guild.channels.cache.get(config.channels.ticketTranscript)
      || await guild.client.channels.fetch(config.channels.ticketTranscript).catch(() => null);
    await sendTranscript(channel, ticketFechado, canalLog, user.tag);

    // Embed de fechamento no canal
    const closeEmbed = new EmbedBuilder()
      .setTitle('🔒 Ticket Fechado')
      .setColor(config.colors.danger)
      .setDescription(`Este ticket foi fechado por ${user}.\n**Motivo:** ${reason}`)
      .addFields(
        { name: '✋ Atendente', value: ticket.claimed_by || ticket.atendente || 'Não atribuído', inline: true },
      )
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`ticket_reopen_${ticket.ticket_id}`).setLabel('Reabrir').setEmoji('🔓').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`ticket_delete_${ticket.ticket_id}`).setLabel('Deletar Canal').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
    );

    await interaction.editReply({ embeds: [closeEmbed], components: [row] });

    // DM de avaliação
    const usuarioId = ticket.user_id || ticket.usuario_id;
    const member = await guild.members.fetch(usuarioId).catch(() => null);
    if (member) {
      const ratingEmbed = new EmbedBuilder()
        .setTitle('⭐ Como foi o atendimento?')
        .setColor(config.colors.primary)
        .setDescription(`Seu ticket **${ticket.ticket_id}** foi fechado!\n\nAvalie o atendimento para nos ajudar a melhorar.`)
        .setFooter({ text: 'Clique em uma das estrelas para avaliar' });

      const ratingRow = new ActionRowBuilder().addComponents(
        ...[1, 2, 3, 4, 5].map(n =>
          new ButtonBuilder()
            .setCustomId(`rating_${ticket.ticket_id}_${n}`)
            .setLabel(`${n}`)
            .setEmoji('⭐')
            .setStyle(n <= 2 ? ButtonStyle.Danger : n === 3 ? ButtonStyle.Secondary : ButtonStyle.Success)
        )
      );
      member.send({ embeds: [ratingEmbed], components: [ratingRow] }).catch(() => {});
    }

  } catch (err) {
    console.error('[Ticket] Erro ao fechar:', err);
    const msg = { embeds: [new EmbedBuilder().setColor(config.colors.danger).setDescription(`❌ Erro ao fechar: ${err.message}`)], ephemeral: true };
    if (interaction.deferred) await interaction.editReply(msg);
    else await interaction.reply(msg).catch(() => {});
  }
}

// ── Reabre um ticket ──────────────────────────────────────────
async function reopenTicket(interaction, ticket) {
  const { guild, user, channel } = interaction;
  const { canReopen } = require('../systems/ticket_cooldown');

  if (interaction.user.id === (ticket.user_id || ticket.usuario_id)) {
    if (!canReopen(ticket.ticket_id)) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(config.colors.warning)
          .setDescription('⚠️ A janela de reabertura expirou. Abra um novo ticket.')],
        ephemeral: true,
      });
    }
  }

  Tickets.atualizar(channel.id, { status: 'aberto', fechado_por: null, motivo: null, fechado_em: null });

  const usuarioId = ticket.user_id || ticket.usuario_id;
  await channel.permissionOverwrites.edit(usuarioId, {
    ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true,
  }).catch(() => {});

  await interaction.reply({
    embeds: [new EmbedBuilder()
      .setColor(config.colors.success)
      .setDescription(`🔓 Ticket reaberto por ${user}!`)
      .setTimestamp()],
  });
}

// ── Deleta o canal ────────────────────────────────────────────
async function deleteTicketChannel(interaction, ticket) {
  await interaction.reply({
    embeds: [new EmbedBuilder().setColor(config.colors.danger).setDescription('🗑️ Canal será deletado em **5 segundos**...')],
  });
  setTimeout(() => interaction.channel.delete('Ticket deletado pela staff').catch(() => {}), 5000);
}

module.exports = { openTicket, closeTicket, reopenTicket, deleteTicketChannel };
