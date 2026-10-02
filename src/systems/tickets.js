const {
  ChannelType, PermissionFlagsBits, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
} = require('discord.js');
const config  = require('../config');
const { Tickets, Usuarios, Pedidos, Produtos, db } = require('../database/database');
const { log }  = require('../utils/logger');
const { podeVerTickets, podeAssumirTicket, isOwner } = require('../utils/permissions');
const { sendTranscript: sendTranscriptUnificado } = require('../utils/ticketTranscript');
const { v4: uuidv4 } = require('uuid');
const moment = require('moment-timezone');

// ─── Permissões por canal de ticket ───────────────────────────────────────────
function gerarPermissoes(guild, member) {
  const r = config.roles;
  const negar = PermissionFlagsBits.ViewChannel;
  const allow = PermissionFlagsBits.ViewChannel
    | PermissionFlagsBits.SendMessages
    | PermissionFlagsBits.ReadMessageHistory
    | PermissionFlagsBits.AttachFiles;

  return [
    { id: guild.id, deny: [negar] },
    { id: member.id, allow: [allow] },
    { id: r.suporte,       allow: [allow] },
    { id: r.mod,           allow: [allow] },
    { id: r.aceitarCompra, allow: [allow] },
    { id: r.loja,          allow: [allow] },
    { id: r.admin,         allow: [allow] },
    { id: r.owner,         allow: [allow] },
    { id: r.bots,          allow: [allow] },
  ];
}

// ─── Abrir ticket ─────────────────────────────────────────────────────────────
async function abrirTicket(guild, member, tipo = 'compra', dadosExtra = {}) {
  if (!member) {
    if (guild && dadosExtra.usuarioId) {
      member = await guild.members.fetch(dadosExtra.usuarioId).catch(() => null);
    }
    if (!member) return { ok: false, erro: 'Membro não encontrado no servidor.' };
  }

  if (guild) {
    const ticketsOrfaos = db.prepare("SELECT * FROM tickets WHERE usuario_id=? AND status='aberto'").all(member.id);
    for (const t of ticketsOrfaos) {
      if (!guild.channels.cache.has(t.canal_id)) {
        db.prepare("UPDATE tickets SET status='fechado', motivo='Canal deletado automaticamente', fechado_em=strftime('%s','now') WHERE id=?").run(t.id);
      }
    }
  }

  const abertos = Tickets.abertosUsuario(member.id);
  if (abertos >= config.tickets.maxAbertos) {
    return { ok: false, erro: `Você já tem ${abertos} ticket(s) aberto(s). Feche-os antes de abrir um novo.` };
  }

  const categoria = guild.channels.cache.get(config.channels.categoryTickets);
  if (!categoria) return { ok: false, erro: 'Categoria de tickets não encontrada.' };

  const nomeCanal = `ticket-${member.user.username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0,16)}-${Date.now().toString(36)}`;

  let canal;
  try {
    canal = await guild.channels.create({
      name: nomeCanal,
      type: ChannelType.GuildText,
      parent: categoria.id,
      permissionOverwrites: gerarPermissoes(guild, member),
    });
  } catch (err) {
    return { ok: false, erro: `Erro ao criar canal de ticket: ${err.message}` };
  }

  const ticketId = Tickets.criar({
    canalId:   canal.id,
    usuarioId: member.id,
    tipo,
    pedidoId:  dadosExtra.pedidoId || null,
  });

  const tipoEmoji = { compra:'🛒', suporte:'🆘', reembolso:'↩️', entrega:'📦', afiliado:'🤝', reclamacao:'⚠️', saque:'💸' };

  if (tipo === 'compra' && dadosExtra.pedidoId) {
    const coins      = db.prepare('SELECT coins FROM usuarios WHERE discord_id=?').get(member.id)?.coins || 0;
    const valorCoins = coins * 0.01;
    const podeCoins  = dadosExtra.valor ? valorCoins >= Number(dadosExtra.valor) : false;
    const valor      = Number(dadosExtra.valor || 0);
    const posicaoFila = db.prepare("SELECT COUNT(*) as c FROM tickets WHERE status='aberto' AND tipo='compra'").get().c;
    const filaLabel  = posicaoFila <= 1 ? '🟢 Você é o próximo!' : `🟡 Posição na fila: **${posicaoFila}**`;
    const expiraPix  = Math.floor(Date.now() / 1000) + 1800;
    const cashbackCoins = Math.floor(valor * 5);

    const embedCompra = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle(`🛒 Pedido — ${dadosExtra.produto || 'Produto'}`)
      .setDescription([
        `> <@${member.id}> abriu um pedido de compra.`,
        `> Escolha a forma de pagamento abaixo para prosseguir.`,
      ].join('\n'))
      .addFields(
        { name: '📦 Produto',   value: dadosExtra.produto || '—',                               inline: true },
        { name: '💵 Valor',     value: `**R$ ${valor.toFixed(2)}**`,                            inline: true },
        { name: '🆔 Pedido',    value: `\`${dadosExtra.pedidoId.slice(0,8).toUpperCase()}\``,   inline: true },
        { name: '🪙 Coins',     value: `${coins.toLocaleString('pt-BR')} (≈ R$ ${valorCoins.toFixed(2)})`, inline: true },
        { name: '🎫 Ticket',    value: `\`${ticketId.slice(0,8).toUpperCase()}\``,              inline: true },
        { name: '⏰ PIX expira', value: `<t:${expiraPix}:R>`,                                   inline: true },
        { name: '🎁 Cashback',  value: `+**${cashbackCoins} coins** ao pagar sem cupom`,        inline: true },
        { name: '🎯 Fila',      value: filaLabel,                                               inline: true },
        { name: '✋ Atendente', value: `*Ninguém assumiu ainda*`,                              inline: true },
      )
      .setTimestamp()
      .setFooter({ text: `Máximo Store • Aberto por ${member.user.username}` });

    const pedidoAtual = db.prepare('SELECT afiliado_id FROM pedidos WHERE id=?').get(dadosExtra.pedidoId);
    if (pedidoAtual?.afiliado_id) {
      const vendedor = db.prepare('SELECT codigo_afil FROM usuarios WHERE discord_id=?').get(pedidoAtual.afiliado_id);
      embedCompra.addFields({
        name: '🤝 Vendedor',
        value: `<@${pedidoAtual.afiliado_id}>${vendedor?.codigo_afil ? ` (\`${vendedor.codigo_afil}\`)` : ''}`,
        inline: true,
      });
    }

    const rowPag = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`escolher_moeda_${dadosExtra.pedidoId}`).setLabel('Gerar Pagamento').setEmoji('💳').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`tmenu_compra_usuario_${dadosExtra.pedidoId}`).setLabel('Menu Usuário').setEmoji('👤').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`tmenu_compra_admin_${dadosExtra.pedidoId}`).setLabel('Menu Admin').setEmoji('⚙️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`cancelar_pedido_${dadosExtra.pedidoId}`).setLabel('Cancelar').setEmoji('❌').setStyle(ButtonStyle.Danger),
    );
    const rowStaff = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket_assumir').setLabel('✋ Assumir').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`ticket_aceitar_sem_pag_${dadosExtra.pedidoId}`).setLabel('✅ Liberar').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ticket_fechar').setLabel('🔒 Fechar').setStyle(ButtonStyle.Secondary),
    );

    await canal.send({ content: `<@&${config.roles.suporte}> <@${member.id}>`, embeds: [embedCompra], components: [rowPag, rowStaff] });
    await log('ticket_aberto', { usuario: member.id, ticketId: ticketId.slice(0,8).toUpperCase(), descricao: `Ticket compra aberto por ${member.user.tag}` });
    return { ok: true, canal, ticketId };
  }

  // Outros tipos
  const embed = new EmbedBuilder()
    .setColor(config.colors.primary)
    .setTitle(`${tipoEmoji[tipo] || '🎫'} Ticket — ${tipo.toUpperCase()}`)
    .setDescription([
      `Olá, <@${member.id}>! 👋`, '',
      tipo === 'reembolso' ? '> Sua solicitação foi registrada. Aguarde análise.' : '> Descreva sua necessidade. Nossa equipe irá atendê-lo em breve.',
      '',
      dadosExtra.produto ? `📦 **Produto:** ${dadosExtra.produto}` : '',
      dadosExtra.valor   ? `💵 **Valor:** R$ ${Number(dadosExtra.valor).toFixed(2)}` : '',
    ].filter(Boolean).join('\n'))
    .addFields(
      { name: '🆔 Ticket',  value: `\`${ticketId.slice(0,8).toUpperCase()}\``, inline: true },
      { name: '👤 Usuário', value: `<@${member.id}>`,                           inline: true },
      { name: '📋 Tipo',    value: tipo.toUpperCase(),                           inline: true },
    )
    .setTimestamp()
    .setFooter({ text: 'Máximo Store • Sistema de Tickets' });

  const rowStaff2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket_assumir').setLabel('✋ Assumir').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('ticket_fechar').setLabel('🔒 Fechar').setStyle(ButtonStyle.Secondary),
  );

  await canal.send({ content: `<@&${config.roles.suporte}> <@${member.id}>`, embeds: [embed], components: [rowStaff2] });
  await log('ticket_aberto', { usuario: member.id, ticketId: ticketId.slice(0,8).toUpperCase(), descricao: `Ticket ${tipo} aberto por ${member.user.tag}` });
  return { ok: true, canal, ticketId };
}

// ─── Fechar ticket ────────────────────────────────────────────────────────────
async function fecharTicket(interaction, motivo = null) {
  const ticket = Tickets.get(interaction.channel.id);
  if (!ticket) return interaction.reply({ content: '❌ Este canal não é um ticket.', ephemeral: true });
  if (ticket.status === 'fechado') return interaction.reply({ content: '⚠️ Ticket já fechado.', ephemeral: true });

  const ehDono  = interaction.user.id === ticket.usuario_id;
  const ehStaff = podeVerTickets(interaction.member);
  if (!ehDono && !ehStaff) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });

  if (!motivo) {
    const { ModalBuilder, ActionRowBuilder: AR, TextInputBuilder, TextInputStyle } = require('discord.js');
    const modal = new ModalBuilder().setCustomId(`modal_fechar_ticket_${interaction.channel.id}`).setTitle('🔒 Fechar Ticket');
    modal.addComponents(new AR().addComponents(
      new TextInputBuilder().setCustomId('motivo').setLabel('Motivo do fechamento')
        .setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: Atendimento concluído'),
    ));
    return interaction.showModal(modal);
  }

  await interaction.deferReply();

  Tickets.atualizar(interaction.channel.id, {
    status: 'fechado', fechado_por: interaction.user.id, motivo, fechado_em: Math.floor(Date.now() / 1000),
  });

  const ticketAtualizado = Tickets.get(interaction.channel.id) || { ...ticket, fechado_por: interaction.user.id, motivo };
  const linkTranscript = await sendTranscriptUnificado(
    interaction.channel,
    { ...ticketAtualizado, fechado_por: interaction.user.id, motivo },
    null,
    interaction.user.tag,
  );

  const duracao  = Math.floor((Date.now()/1000 - ticket.criado_em) / 60);
  const abertura = moment.unix(ticket.criado_em).tz(config.timezone).format('DD/MM/YYYY HH:mm');
  const fechamento = moment().tz(config.timezone).format('DD/MM/YYYY HH:mm');

  const embedLog = new EmbedBuilder()
    .setColor(config.colors.dark)
    .setTitle('🗂️ LOG DE ATENDIMENTO')
    .addFields(
      { name: '🔒 Aberto por',    value: `<@${ticket.usuario_id}>`,   inline: true },
      { name: '🔒 Fechado por',   value: `<@${interaction.user.id}>`, inline: true },
      { name: '🆔 ID do Ticket',  value: ticket.id,                   inline: false },
      { name: '🕐 Abertura',      value: abertura,                    inline: true },
      { name: '🕐 Fechamento',    value: fechamento,                  inline: true },
      { name: '⚠️ Tipo',          value: ticket.tipo.toUpperCase(),   inline: false },
      { name: '📝 Motivo',        value: motivo,                      inline: false },
    )
    .setFooter({ text: 'Ticket encerrado com transcript' })
    .setTimestamp();

  await interaction.editReply({ embeds: [embedLog] });

  try {
    const { enviarDmFechamento } = require('../utils/dmHelpers');
    await enviarDmFechamento(interaction.guild, ticketAtualizado, motivo, interaction.user.id, linkTranscript);
  } catch (err) { console.error('[Ticket DM]', err.message); }

  await log('ticket_fechado', { executor: interaction.user.id, usuario: ticket.usuario_id, ticketId: ticket.id.slice(0,8).toUpperCase(), motivo });
  setTimeout(() => interaction.channel.delete().catch(() => {}), 8000);
}

// ─── Assumir ticket ───────────────────────────────────────────────────────────
async function assumirTicket(interaction) {
  if (!podeAssumirTicket(interaction.member)) {
    return interaction.reply({ content: '❌ Apenas administradores podem assumir tickets.', ephemeral: true });
  }

  const ticket = Tickets.get(interaction.channel.id);
  if (!ticket) return interaction.reply({ content: '❌ Não é um ticket.', ephemeral: true });
  if (ticket.atendente) return interaction.reply({ content: `⚠️ Ticket já assumido por <@${ticket.atendente}>.`, ephemeral: true });

  Tickets.atualizar(interaction.channel.id, { atendente: interaction.user.id });

  try {
    const msgs = await interaction.channel.messages.fetch({ limit: 10 });
    const msgBot = msgs.find(m => m.author.bot && m.embeds.length > 0);
    if (msgBot) {
      const novoEmbed = EmbedBuilder.from(msgBot.embeds[0].toJSON());
      const fields = novoEmbed.data.fields || [];
      const idx = fields.findIndex(f => f.name.includes('Atendente'));
      if (idx >= 0) { fields[idx] = { name: '✋ Atendente', value: `<@${interaction.user.id}>`, inline: true }; novoEmbed.data.fields = fields; }
      await msgBot.edit({ embeds: [novoEmbed] }).catch(() => {});
    }
  } catch {}

  await interaction.reply({
    embeds: [new EmbedBuilder()
      .setColor(config.colors.success)
      .setTitle('✋ Ticket Assumido')
      .setDescription(`> <@${interaction.user.id}> assumiu este ticket.\n> Nossa equipe já está ciente.`)
      .setTimestamp()
      .setFooter({ text: `Máximo Store • Atendente: ${interaction.user.username}` })],
  });
}

// ─── Liberar sem pagamento ────────────────────────────────────────────────────
async function liberarSemPagamento(interaction, pedidoId) {
  const { podeAceitarCompra } = require('../utils/permissions');
  if (!podeAceitarCompra(interaction.member)) {
    return interaction.reply({ content: '❌ Apenas quem tem o cargo **Aceitar Compra** pode liberar sem pagamento.', ephemeral: true });
  }

  const pedido = Pedidos.get(pedidoId);
  if (!pedido) return interaction.reply({ content: '❌ Pedido não encontrado.', ephemeral: true });
  if (pedido.status !== 'pendente') return interaction.reply({ content: '⚠️ Pedido não está pendente.', ephemeral: true });

  await interaction.deferReply();

  db.prepare("UPDATE pedidos SET status='pago', pago_em=strftime('%s','now'), nota_fiscal=? WHERE id=?")
    .run(JSON.stringify({ manual: true, autorizadoPor: interaction.user.id }), pedidoId);

  const { entregarProduto } = require('./loja');
  await entregarProduto(pedido, interaction.client);

  await interaction.editReply({
    embeds: [new EmbedBuilder()
      .setColor(config.colors.success)
      .setTitle('✅ Liberado Sem Pagamento')
      .setDescription(`Pedido \`${pedidoId.slice(0,8).toUpperCase()}\` liberado por <@${interaction.user.id}>.\nProduto entregue ao cliente.`)
      .setTimestamp()],
  });

  await log('pagamento', { executor: interaction.user.id, usuario: pedido.usuario_id, pedidoId, descricao: `Pedido liberado sem pagamento por ${interaction.user.tag}` });
}

// ─── Gerar transcrição manual (botão) ────────────────────────────────────────
async function gerarTranscript(interaction) {
  if (!podeVerTickets(interaction.member)) {
    return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
  }
  await interaction.deferReply({ ephemeral: true });

  const ticket = Tickets.get(interaction.channel.id);
  await sendTranscriptUnificado(
    interaction.channel,
    ticket || { id: 'manual', tipo: 'manual', criado_em: Math.floor(Date.now() / 1000), usuario_id: '' },
    null,
    interaction.user.tag,
  );
  await interaction.editReply({ content: '📄 Transcrição gerada e enviada!' });
}

// ─── Fechar ticket automaticamente após pagamento ─────────────────────────────
async function fecharTicketAutomatico(guild, canalId, ticketId, motivo = 'Pagamento confirmado e produto entregue', fechadoPorId = null) {
  try {
    const ticket = Tickets.get(canalId) || db.prepare('SELECT * FROM tickets WHERE id=?').get(ticketId);
    if (!ticket || ticket.status === 'fechado') return;

    const fechadoPor = fechadoPorId || guild.client.user.id;
    Tickets.atualizar(canalId, { status: 'fechado', fechado_por: fechadoPor, motivo, fechado_em: Math.floor(Date.now() / 1000) });

    const canal = guild.channels.cache.get(canalId);
    if (!canal) return;

    const ticketAtualizado = { ...ticket, status: 'fechado', fechado_por: fechadoPor, motivo, fechado_em: Math.floor(Date.now() / 1000) };
    await sendTranscriptUnificado(canal, ticketAtualizado, null, 'Sistema');

    await canal.send({
      embeds: [new EmbedBuilder()
        .setColor(config.colors.success)
        .setTitle('✅ Pagamento Confirmado!')
        .setDescription('> Produto entregue no seu privado.\n> Este ticket será encerrado automaticamente.')
        .setTimestamp()
        .setFooter({ text: 'Máximo Store • Obrigado pela compra!' })],
    }).catch(() => {});

    setTimeout(() => canal.delete().catch(() => {}), 8000);
  } catch (err) {
    console.error('[FecharTicketAuto]', err.message);
  }
}

module.exports = {
  abrirTicket, fecharTicket, assumirTicket,
  fecharTicketAutomatico, gerarTranscript,
};
