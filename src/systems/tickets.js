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
    // Ninguém vê por padrão
    { id: guild.id, deny: [negar] },
    // O dono do ticket
    { id: member.id, allow: [allow] },
    // Suporte e superiores podem ver todos
    { id: r.suporte,       allow: [allow] },
    { id: r.mod,           allow: [allow] },
    { id: r.aceitarCompra, allow: [allow] },
    { id: r.loja,          allow: [allow] },
    { id: r.admin,         allow: [allow] },
    { id: r.owner,         allow: [allow] },
    // Bots
    { id: r.bots,          allow: [allow] },
  ];
}

// ─── Abrir ticket ─────────────────────────────────────────────────────────────
async function abrirTicket(guild, member, tipo = 'compra', dadosExtra = {}) {
  // Verificar se member é válido
  if (!member) {
    console.error('[Ticket] member é null/undefined — tentando fetch...');
    if (guild && dadosExtra.usuarioId) {
      member = await guild.members.fetch(dadosExtra.usuarioId).catch(() => null);
    }
    if (!member) return { ok: false, erro: 'Membro não encontrado no servidor.' };
  }

  // Limpar automaticamente tickets "abertos" cujos canais não existem mais no Discord
  if (guild) {
    const ticketsOrfaos = db.prepare("SELECT * FROM tickets WHERE usuario_id=? AND status='aberto'").all(member.id);
    for (const t of ticketsOrfaos) {
      const canalExiste = guild.channels.cache.has(t.canal_id);
      if (!canalExiste) {
        db.prepare("UPDATE tickets SET status='fechado', motivo='Canal deletado automaticamente', fechado_em=strftime('%s','now') WHERE id=?").run(t.id);
        console.log(`[Ticket] Ticket órfão fechado: ${t.id.slice(0,8)}`);
      }
    }
  }

  // Limite de tickets abertos
  const abertos = Tickets.abertosUsuario(member.id);
  if (abertos >= config.tickets.maxAbertos) {
    return { ok: false, erro: `Você já tem ${abertos} ticket(s) aberto(s). Feche-os antes de abrir um novo.` };
  }

  const categoria = guild.channels.cache.get(config.channels.categoryTickets);
  if (!categoria) {
    console.error('[Ticket] Categoria não encontrada:', config.channels.categoryTickets);
    return { ok: false, erro: 'Categoria de tickets não encontrada.' };
  }

  const nomeCanal = `ticket-${member.user.username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0,16)}-${Date.now().toString(36)}`;

  let canal;
  try {
    canal = await guild.channels.create({
      name:               nomeCanal,
      type:               ChannelType.GuildText,
      parent:             categoria.id,
      permissionOverwrites: gerarPermissoes(guild, member),
    });
  } catch (err) {
    console.error('[Ticket] Erro ao criar canal:', err.message);
    return { ok: false, erro: `Erro ao criar canal de ticket: ${err.message}` };
  }

  const ticketId = Tickets.criar({
    canalId:   canal.id,
    usuarioId: member.id,
    tipo,
    pedidoId:  dadosExtra.pedidoId || null,
  });

  const tipoEmoji = { compra:'🛒', suporte:'🆘', reembolso:'↩️', entrega:'📦', afiliado:'🤝', reclamacao:'⚠️', saque:'💸' };

  // ── Se for compra com pedido, embed já inclui resumo + botões de pagamento ─
  if (tipo === 'compra' && dadosExtra.pedidoId) {
    const coins      = db.prepare('SELECT coins FROM usuarios WHERE discord_id=?').get(member.id)?.coins || 0;
    const valorCoins = coins * 0.01;
    const podeCoins  = dadosExtra.valor ? valorCoins >= Number(dadosExtra.valor) : false;
    const { t, getIdioma, btnIdioma } = require('./i18n');
    const idioma = getIdioma(member.id);
    const valor  = Number(dadosExtra.valor || 0);

    // Posição na fila (tickets de compra abertos antes deste)
    const posicaoFila = db.prepare("SELECT COUNT(*) as c FROM tickets WHERE status='aberto' AND tipo='compra'").get().c;
    const filaLabel   = posicaoFila <= 1 ? '🟢 Você é o próximo!' : `🟡 Posição na fila: **${posicaoFila}**`;

    // Temporizador PIX — expira em 30 minutos
    const expiraPix  = Math.floor(Date.now() / 1000) + 1800;
    // Cashback estimado (5% sem cupom)
    const cashbackCoins = Math.floor(valor * 5);

    const embedCompra = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle(`🛒 Pedido — ${dadosExtra.produto || 'Produto'}`)
      .setDescription([
        `> <@${member.id}> abriu um pedido de compra.`,
        `> Escolha a forma de pagamento abaixo para prosseguir.`,
      ].join('\n'))
      .addFields(
        { name: '📦 Produto',    value: dadosExtra.produto || '—',                               inline: true },
        { name: '💵 Valor',      value: `**R$ ${valor.toFixed(2)}**`,                            inline: true },
        { name: '🆔 Pedido',     value: `\`${dadosExtra.pedidoId.slice(0,8).toUpperCase()}\``,   inline: true },
        { name: '🪙 Coins',      value: `${coins.toLocaleString('pt-BR')} (≈ R$ ${valorCoins.toFixed(2)})`, inline: true },
        { name: '🎫 Ticket',     value: `\`${ticketId.slice(0,8).toUpperCase()}\``,              inline: true },
        { name: '⏰ PIX expira',  value: `<t:${expiraPix}:R>`,                                   inline: true },
        { name: '🎁 Cashback',   value: `+**${cashbackCoins} coins** ao pagar sem cupom`,        inline: true },
        { name: '🎯 Fila',       value: filaLabel,                                               inline: true },
        { name: '✋ Atendente',  value: `*Ninguém assumiu ainda*`,                              inline: true },
      )
      .setTimestamp()
      .setFooter({ text: `Máximo Store • Aberto por ${member.user.username}` });

    // Verificar se já tem vendedor vinculado ao pedido
    const pedidoAtual = db.prepare('SELECT afiliado_id FROM pedidos WHERE id=?').get(dadosExtra.pedidoId);
    const vendedorId  = pedidoAtual?.afiliado_id;
    if (vendedorId) {
      const vendedor = db.prepare('SELECT nome, codigo_afil FROM usuarios WHERE discord_id=?').get(vendedorId);
      embedCompra.addFields({
        name: '🤝 Vendedor',
        value: `<@${vendedorId}>${vendedor?.codigo_afil ? ` (\`${vendedor.codigo_afil}\`)` : ''}`,
        inline: true,
      });
    }

    // Row 1 — Pagamento (cliente)
    const rowPag = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`escolher_moeda_${dadosExtra.pedidoId}`).setLabel('💳 Escolher Pagamento').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`pagar_coins_${dadosExtra.pedidoId}`).setLabel(`🪙 Pagar com Coins`).setStyle(ButtonStyle.Secondary).setDisabled(!podeCoins),
      new ButtonBuilder().setCustomId(`aplicar_cupom_${dadosExtra.pedidoId}`).setLabel('🎟️ Cupom').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`informar_vendedor_${dadosExtra.pedidoId}`).setLabel('🤝 Código do Vendedor').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`cancelar_pedido_${dadosExtra.pedidoId}`).setLabel('❌ Cancelar').setStyle(ButtonStyle.Danger),
    );

    // Row 2 — Staff (só cargo suporte+ consegue usar)
    const rowStaff = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket_assumir').setLabel('✋ Assumir').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`ticket_aceitar_sem_pag_${dadosExtra.pedidoId}`).setLabel('✅ Liberar').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ticket_fechar').setLabel('🔒 Fechar').setStyle(ButtonStyle.Secondary),
    );

    await canal.send({
      content:    `<@&${config.roles.suporte}> <@${member.id}>`,
      embeds:     [embedCompra],
      components: [rowPag, rowStaff],
    });

    await log('ticket_aberto', { usuario: member.id, ticketId: ticketId.slice(0,8).toUpperCase(), descricao: `Ticket compra aberto por ${member.user.tag}` });
    return { ok: true, canal, ticketId };
  }

  // ── Outros tipos de ticket ────────────────────────────────────────────────
  const embed = new EmbedBuilder()
    .setColor(config.colors.primary)
    .setTitle(`${tipoEmoji[tipo] || '🎫'} Ticket — ${tipo.toUpperCase()}`)
    .setDescription([
      `Olá, <@${member.id}>! 👋`,
      '',
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

  const staffMencao = `<@&${config.roles.suporte}>`;
  await canal.send({
    content:    `${staffMencao} <@${member.id}>`,
    embeds:     [embed],
    components: [rowStaff2],
  });

  await log('ticket_aberto', {
    usuario:   member.id,
    ticketId:  ticketId.slice(0,8).toUpperCase(),
    descricao: `Ticket ${tipo} aberto por ${member.user.tag}`,
  });

  return { ok: true, canal, ticketId };
}

// ─── Fechar ticket + gerar transcrição ────────────────────────────────────────
async function fecharTicket(interaction, motivo = null) {
  const ticket = Tickets.get(interaction.channel.id);
  if (!ticket) return interaction.reply({ content: '❌ Este canal não é um ticket.', ephemeral: true });
  if (ticket.status === 'fechado') return interaction.reply({ content: '⚠️ Ticket já fechado.', ephemeral: true });

  const ehDono  = interaction.user.id === ticket.usuario_id;
  const ehStaff = podeVerTickets(interaction.member);
  if (!ehDono && !ehStaff) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });

  // Se não tem motivo, abrir modal para preencher
  if (!motivo) {
    const modal = new (require('discord.js').ModalBuilder)()
      .setCustomId(`modal_fechar_ticket_${interaction.channel.id}`)
      .setTitle('🔒 Fechar Ticket');
    modal.addComponents(
      new (require('discord.js').ActionRowBuilder)().addComponents(
        new (require('discord.js').TextInputBuilder)()
          .setCustomId('motivo')
          .setLabel('Motivo do fechamento')
          .setStyle(require('discord.js').TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder('Ex: Atendimento concluído, Resolvido, etc.'),
      ),
    );
    return interaction.showModal(modal);
  }

  await interaction.deferReply();

  // Atualizar banco
  Tickets.atualizar(interaction.channel.id, {
    status:      'fechado',
    fechado_por: interaction.user.id,
    motivo,
    fechado_em:  Math.floor(Date.now() / 1000),
  });

  // Gerar e enviar transcrição via sistema unificado
  const ticketAtualizado = Tickets.get(interaction.channel.id) || { ...ticket, fechado_por: interaction.user.id, motivo };
  const linkTranscript = await sendTranscriptUnificado(
    interaction.channel,
    { ...ticketAtualizado, fechado_por: interaction.user.id, motivo },
    null,
    interaction.user.tag,
  );

  // Embed LOG DE ATENDIMENTO no canal (formato da imagem)
  const duracao    = Math.floor((Date.now()/1000 - ticket.criado_em) / 60);
  const abertura   = moment.unix(ticket.criado_em).tz(config.timezone).format('DD/MM/YYYY HH:mm');
  const fechamento = moment().tz(config.timezone).format('DD/MM/YYYY HH:mm');

  const embedLog = new EmbedBuilder()
    .setColor(config.colors.dark)
    .setTitle('🗂️ LOG DE ATENDIMENTO')
    .addFields(
      { name: '🔒 Ticket aberto por',   value: `<@${ticket.usuario_id}>`,       inline: true },
      { name: '🔒 Ticket fechado por',  value: `<@${interaction.user.id}>`,     inline: true },
      { name: '🆔 ID do Ticket',        value: ticket.id,                       inline: false },
      { name: '🕐 Horário de abertura', value: abertura,                        inline: true },
      { name: '🕐 Horário de fechamento', value: fechamento,                    inline: true },
      { name: '⚠️ Motivo do Ticket',    value: ticket.tipo.toUpperCase(),       inline: false },
      { name: '📝 Considerações finais', value: motivo,                         inline: false },
    )
    .setFooter({ text: 'Ticket apagado com transcript' })
    .setTimestamp();

  await interaction.editReply({ embeds: [embedLog] });

  // Enviar DM para o cliente
  try {
    const { enviarDmFechamento } = require('../utils/dmHelpers');
    await enviarDmFechamento(interaction.guild, ticketAtualizado, motivo, interaction.user.id, linkTranscript);
  } catch (err) {
    console.error('[Ticket DM]', err.message);
  }

  await log('ticket_fechado', {
    executor:  interaction.user.id,
    usuario:   ticket.usuario_id,
    ticketId:  ticket.id.slice(0,8).toUpperCase(),
    motivo,
  });

  // Deletar canal após 8s
  setTimeout(() => interaction.channel.delete().catch(() => {}), 8000);
}

// ─── Assumir ticket (apenas admin+) ──────────────────────────────────────────
async function assumirTicket(interaction) {
  if (!podeAssumirTicket(interaction.member)) {
    return interaction.reply({ content: '❌ Apenas administradores podem assumir tickets.', ephemeral: true });
  }

  const ticket = Tickets.get(interaction.channel.id);
  if (!ticket) return interaction.reply({ content: '❌ Não é um ticket.', ephemeral: true });
  if (ticket.atendente) return interaction.reply({ content: `⚠️ Ticket já assumido por <@${ticket.atendente}>.`, ephemeral: true });

  Tickets.atualizar(interaction.channel.id, { atendente: interaction.user.id });

  // Atualizar o embed original do ticket com o atendente
  try {
    const msgs = await interaction.channel.messages.fetch({ limit: 10 });
    const msgBot = msgs.find(m => m.author.bot && m.embeds.length > 0);
    if (msgBot) {
      const embedOriginal = msgBot.embeds[0];
      const { EmbedBuilder: EB } = require('discord.js');
      const novoEmbed = EB.from(embedOriginal.toJSON());
      // Atualizar campo Atendente
      const fields = novoEmbed.data.fields || [];
      const idxAtendente = fields.findIndex(f => f.name.includes('Atendente'));
      if (idxAtendente >= 0) {
        fields[idxAtendente] = { name: '✋ Atendente', value: `<@${interaction.user.id}>`, inline: true };
        novoEmbed.data.fields = fields;
      }
      await msgBot.edit({ embeds: [novoEmbed] }).catch(() => {});
    }
  } catch {}

  await interaction.reply({
    embeds: [new EmbedBuilder()
      .setColor(config.colors.success)
      .setTitle('✋ Ticket Assumido')
      .setDescription(`> <@${interaction.user.id}> assumiu este ticket e irá atendê-lo.\n> Apenas ele pode fechar este ticket.`)
      .setTimestamp()
      .setFooter({ text: `Máximo Store • Atendente: ${interaction.user.username}` })],
  });
}

// ─── Liberar sem pagamento (cargo aceitar compra) ─────────────────────────────
async function liberarSemPagamento(interaction, pedidoId) {
  const { podeAceitarCompra } = require('../utils/permissions');
  if (!podeAceitarCompra(interaction.member)) {
    return interaction.reply({ content: '❌ Apenas quem tem o cargo **Aceitar Compra** pode liberar sem pagamento.', ephemeral: true });
  }

  const pedido = Pedidos.get(pedidoId);
  if (!pedido) return interaction.reply({ content: '❌ Pedido não encontrado.', ephemeral: true });
  if (pedido.status !== 'pendente') return interaction.reply({ content: '⚠️ Pedido não está pendente.', ephemeral: true });

  await interaction.deferReply();

  // Confirmar pagamento manualmente
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

  await log('pagamento', {
    executor:  interaction.user.id,
    usuario:   pedido.usuario_id,
    pedidoId,
    descricao: `Pedido liberado sem pagamento por ${interaction.user.tag}`,
  });
}

// ─── Gerar transcrição manual (botão) ────────────────────────────────────────
  const msgs = await canal.messages.fetch({ limit: 100 }).catch(() => null);
  if (!msgs) return null;

  const lista = [...msgs.values()].reverse();
  const abertura = moment.unix(ticket.criado_em).tz(config.timezone).format('DD/MM/YYYY HH:mm');
  const fechamento = moment().tz(config.timezone).format('DD/MM/YYYY HH:mm');
  const duracao = Math.floor((Date.now()/1000 - ticket.criado_em) / 60);

  const tipoLabel = { compra:'🛒 Compra', suporte:'🆘 Suporte', entrega:'📦 Entrega', afiliado:'🤝 Afiliado', reclamacao:'⚠️ Reclamação', saque:'💸 Saque' };

  let html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Transcript — #${ticket.id.slice(0,8).toUpperCase()}</title>
<style>
  :root {
    --bg: #313338; --sidebar: #2b2d31; --header: #1e1f22;
    --msg-hover: #2e3035; --text: #dbdee1; --text-muted: #949ba4;
    --link: #00a8fc; --brand: #5865f2; --green: #23a55a;
    --bot-tag: #5865f2; --radius: 4px;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--text); font-family: 'gg sans','Noto Sans',Whitney,'Helvetica Neue',Helvetica,Arial,sans-serif; font-size: 16px; line-height: 1.375; }
  a { color: var(--link); text-decoration: none; }
  /* Header */
  .transcript-header { background: var(--header); padding: 16px 24px; border-bottom: 1px solid #1a1b1e; display: flex; align-items: center; gap: 16px; }
  .transcript-header .icon { font-size: 2em; }
  .transcript-header h1 { font-size: 1.25rem; font-weight: 700; color: var(--text); }
  .transcript-header .meta { color: var(--text-muted); font-size: 0.85rem; margin-top: 2px; }
  .stats { display: flex; gap: 24px; margin-top: 8px; flex-wrap: wrap; }
  .stat { background: var(--sidebar); border-radius: 8px; padding: 8px 16px; font-size: 0.85rem; }
  .stat span { color: var(--brand); font-weight: 700; }
  /* Messages */
  .messages { padding: 16px 0; }
  .day-divider { display: flex; align-items: center; gap: 12px; padding: 16px 24px; color: var(--text-muted); font-size: 0.75rem; font-weight: 600; }
  .day-divider::before, .day-divider::after { content: ''; flex: 1; height: 1px; background: #3f4147; }
  .msg-group { display: flex; gap: 16px; padding: 4px 24px; border-radius: var(--radius); transition: background .1s; }
  .msg-group:hover { background: var(--msg-hover); }
  .msg-group.bot-msg .username { color: var(--green); }
  .avatar-wrap { flex-shrink: 0; width: 40px; height: 40px; border-radius: 50%; overflow: hidden; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 1rem; color: #fff; margin-top: 2px; }
  .avatar-img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; }
  .msg-content { flex: 1; min-width: 0; }
  .msg-meta { display: flex; align-items: baseline; gap: 8px; margin-bottom: 2px; }
  .username { font-weight: 600; font-size: 1rem; cursor: pointer; }
  .username:hover { text-decoration: underline; }
  .bot-badge { background: var(--bot-tag); color: #fff; font-size: 0.65rem; font-weight: 700; padding: 1px 5px; border-radius: 3px; text-transform: uppercase; letter-spacing: .3px; }
  .timestamp { color: var(--text-muted); font-size: 0.75rem; }
  .msg-text { color: var(--text); word-wrap: break-word; white-space: pre-wrap; }
  .embed-block { border-left: 4px solid var(--brand); background: #2b2d31; border-radius: 0 4px 4px 0; padding: 8px 12px; margin-top: 4px; font-size: 0.9rem; color: var(--text-muted); }
  /* Continued message (no avatar) */
  .msg-continued { padding: 1px 24px 1px 80px; }
  .msg-continued:hover { background: var(--msg-hover); }
  .msg-continued .msg-text { color: var(--text); }
  .msg-continued .timestamp-hover { color: var(--text-muted); font-size: 0.7rem; display: none; }
  /* Footer */
  .transcript-footer { background: var(--header); border-top: 1px solid #1a1b1e; padding: 16px 24px; text-align: center; color: var(--text-muted); font-size: 0.8rem; }
  .transcript-footer strong { color: var(--brand); }
</style>
</head>
<body>
<div class="transcript-header">
  <div class="icon">🎫</div>
  <div>
    <h1>Transcript — #${ticket.id.slice(0,8).toUpperCase()}</h1>
    <div class="meta">${tipoLabel[ticket.tipo] || ticket.tipo.toUpperCase()} • Aberto ${abertura} • Fechado ${fechamento}</div>
    <div class="stats">
      <div class="stat">Mensagens: <span>${lista.length}</span></div>
      <div class="stat">Duração: <span>${duracao} min</span></div>
      <div class="stat">Ticket ID: <span>${ticket.id.slice(0,8).toUpperCase()}</span></div>
      <div class="stat">Servidor: <span>Máximo Store</span></div>
    </div>
  </div>
</div>
<div class="messages">
<div class="day-divider">${abertura}</div>
`;

  let lastAuthor = null;
  let lastDay = null;

  for (const msg of lista) {
    if (!msg.content && !msg.embeds?.length && !msg.attachments?.size) continue;

    const isBot    = msg.author.bot;
    const tempo    = moment(msg.createdAt).tz(config.timezone);
    const dia      = tempo.format('DD/MM/YYYY');
    const hora     = tempo.format('HH:mm');
    const nome     = msg.author.username;
    const isSame   = lastAuthor === msg.author.id && lastDay === dia;
    const avatarUrl = msg.author.displayAvatarURL?.({ size: 64, format: 'png' }) || '';
    const letra    = nome[0]?.toUpperCase() || '?';

    const hsl = (str) => {
      let h = 0;
      for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
      return `hsl(${Math.abs(h) % 360},50%,40%)`;
    };

    if (dia !== lastDay) {
      if (lastDay) html += `<div class="day-divider">${dia}</div>\n`;
      lastDay = dia;
    }

    const texto = (msg.content || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>') || '';
    const embeds = msg.embeds?.length ? `<div class="embed-block">[Embed: ${msg.embeds[0]?.title || 'mensagem do bot'}]</div>` : '';
    const anexos = msg.attachments?.size ? `<div class="embed-block">📎 ${msg.attachments.size} anexo(s)</div>` : '';

    if (isSame) {
      html += `<div class="msg-continued"><span class="msg-text">${texto}${embeds}${anexos}</span></div>\n`;
    } else {
      html += `
<div class="msg-group${isBot ? ' bot-msg' : ''}">
  <div class="avatar-wrap" style="background:${hsl(nome)}">
    ${avatarUrl ? `<img class="avatar-img" src="${avatarUrl}" onerror="this.style.display='none'">` : letra}
  </div>
  <div class="msg-content">
    <div class="msg-meta">
      <span class="username" style="color:${isBot ? 'var(--green)' : ''}">${nome}</span>
      ${isBot ? '<span class="bot-badge">APP</span>' : ''}
      <span class="timestamp">${hora}</span>
    </div>
    <div class="msg-text">${texto}${embeds}${anexos}</div>
  </div>
</div>\n`;
      lastAuthor = msg.author.id;
    }
  }

  html += `</div>
<div class="transcript-footer">
  Gerado por <strong>Máximo Store</strong> • ${fechamento} • Ticket <strong>#${ticket.id.slice(0,8).toUpperCase()}</strong>
</div>
</body></html>`;

  return Buffer.from(html, 'utf-8');
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

// ─── Fechar ticket automaticamente após pagamento (com transcript) ────────────
async function fecharTicketAutomatico(guild, canalId, ticketId, motivo = 'Pagamento confirmado e produto entregue', fechadoPorId = null) {
  try {
    const ticket = Tickets.get(canalId) || db.prepare('SELECT * FROM tickets WHERE id=?').get(ticketId);
    if (!ticket || ticket.status === 'fechado') return;

    const fechadoPor = fechadoPorId || guild.client.user.id;

    Tickets.atualizar(canalId, {
      status:      'fechado',
      fechado_por: fechadoPor,
      motivo,
      fechado_em:  Math.floor(Date.now() / 1000),
    });

    const canal = guild.channels.cache.get(canalId);
    if (!canal) return;

    // Gerar e enviar transcript via sistema unificado
    const ticketAtualizado = { ...ticket, status: 'fechado', fechado_por: fechadoPor, motivo, fechado_em: Math.floor(Date.now() / 1000) };
    await sendTranscriptUnificado(canal, ticketAtualizado, null, 'Sistema');

    // Avisar no canal antes de deletar
    await canal.send({
      embeds: [new EmbedBuilder()
        .setColor(config.colors.success)
        .setTitle('✅ Pagamento Confirmado!')
        .setDescription('> Produto entregue no seu privado.\n> Este ticket será encerrado automaticamente.')
        .setTimestamp()
        .setFooter({ text: 'Máximo Store • Obrigado pela compra!' })],
    }).catch(() => {});

    // Deletar canal após 8s
    setTimeout(() => canal.delete().catch(() => {}), 8000);
  } catch (err) {
    console.error('[FecharTicketAuto]', err.message);
  }
}

module.exports = {
  abrirTicket, fecharTicket, assumirTicket,
  fecharTicketAutomatico,
  gerarTranscript,
};
