const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
  AttachmentBuilder,
} = require('discord.js');
const QRCode  = require('qrcode');
const config  = require('../config');
const { Usuarios, Produtos, Pedidos, Cupons, Config, db } = require('../database/database');
const { log }        = require('../utils/logger');
const { Embeds }     = require('../utils/embeds');
const efi            = require('./efi');
const antiFraude     = require('./antiFraude');
const {
  pedidosPendentesDoTicket, totalGrupoPedidos, descricaoGrupoPedidos,
  aplicarTxIdGrupo, marcarGrupoPago, ticketAindaTemItensAbertos,
} = require('../utils/pedidoGrupo');

// ─── Mostrar loja ─────────────────────────────────────────────────────────────
async function mostrarLoja(interaction, pagina = 0) {
  if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ ephemeral: true });

  const produtos = Produtos.listar(null, true);
  if (!produtos.length) return interaction.editReply({ content: '🏪 A loja está sem produtos no momento.' });

  const porPagina   = 5;
  const totalPaginas = Math.ceil(produtos.length / porPagina);
  const slice        = produtos.slice(pagina * porPagina, (pagina + 1) * porPagina);

  const embed = new EmbedBuilder()
    .setColor(config.colors.loja)
    .setTitle('🛍️ Máximo Store')
    .setDescription('Selecione um produto abaixo para ver detalhes ou comprar.')
    .setFooter({ text: `Página ${pagina + 1}/${totalPaginas} • ${produtos.length} produto(s)` })
    .setTimestamp();

  for (const p of slice) {
    const preco = p.preco_promo
      ? `~~R$ ${p.preco.toFixed(2)}~~ **R$ ${p.preco_promo.toFixed(2)}** 🔥`
      : `**R$ ${p.preco.toFixed(2)}**`;
    const est = p.estoque === -1 ? '∞' : p.estoque === 0 ? '❌' : `✅ ${p.estoque}`;
    embed.addFields({ name: `${p.destaque ? '⭐ ' : ''}${p.nome}`, value: `${preco} • ${est} • 🛒 ${p.vendas}`, inline: false });
  }

  const selectRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('loja_selecionar_produto')
      .setPlaceholder('📦 Selecione um produto...')
      .addOptions(slice.map(p => ({
        label:       p.nome.slice(0, 100),
        description: `R$ ${(p.preco_promo || p.preco).toFixed(2)} • ${p.categoria}`,
        value:       p.id,
        emoji:       p.destaque ? '⭐' : '📦',
      })))
  );

  const navRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`loja_pagina_${pagina - 1}`).setLabel('◀').setStyle(ButtonStyle.Secondary).setDisabled(pagina === 0),
    new ButtonBuilder().setCustomId(`loja_pagina_${pagina + 1}`).setLabel('▶').setStyle(ButtonStyle.Secondary).setDisabled(pagina >= totalPaginas - 1),
    new ButtonBuilder().setCustomId('carrinho_ver').setLabel('🛒 Carrinho').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('caixas_listar').setLabel('🎁 Caixas').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('perfil_ver').setLabel('👤 Perfil').setStyle(ButtonStyle.Secondary),
  );

  await interaction.editReply({ embeds: [embed], components: [selectRow, navRow] });
}

// ─── Mostrar produto ──────────────────────────────────────────────────────────
async function mostrarProduto(interaction, produtoId) {
  const produto = Produtos.get(produtoId);
  if (!produto || !produto.ativo) {
    const fn = interaction.replied || interaction.deferred ? 'editReply' : 'reply';
    return interaction[fn]({ content: '❌ Produto não encontrado.', ephemeral: true });
  }

  const avals = db.prepare('SELECT * FROM avaliacoes WHERE produto_id=? ORDER BY criado_em DESC LIMIT 3').all(produtoId);
  const embed = Embeds.produto(produto);
  if (avals.length) embed.addFields({ name: '💬 Avaliações', value: avals.map(a => `⭐${a.nota}/5 — ${a.comentario||'ok'}`).join('\n') });

  const preco      = produto.preco_promo || produto.preco;
  const temEstoque = Produtos.temEstoque(produtoId);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`comprar_${produtoId}`).setLabel(`💠 Comprar — R$ ${preco.toFixed(2)}`).setStyle(ButtonStyle.Success).setDisabled(!temEstoque),
    new ButtonBuilder().setCustomId(`carrinho_add_${produtoId}`).setLabel('🛒 Carrinho').setStyle(ButtonStyle.Secondary).setDisabled(!temEstoque),
    new ButtonBuilder().setCustomId('loja_voltar').setLabel('🔙 Voltar').setStyle(ButtonStyle.Secondary),
  );

  const fn = interaction.replied || interaction.deferred ? 'editReply' : 'reply';
  await interaction[fn]({ embeds: [embed], components: [row], ephemeral: true });
}

// ─── Iniciar compra — abre ticket com opções, PIX só gerado ao clicar ─────────
async function iniciarCompra(interaction, produtoId, cupomCodigo = null) {
  if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ ephemeral: true });

  // Verificar manutenção
  if (Config.get('manutencao') === true) return interaction.editReply({ content: '🔧 A loja está em **manutenção** no momento. Tente novamente em breve!' });

  const usuario = Usuarios.garantir(interaction.user.id, interaction.user.username);
  if (usuario.bloqueado) return interaction.editReply({ content: '🚫 Conta bloqueada. Contate o suporte.' });

  const fraude = antiFraude.verificar(interaction.user.id);
  if (fraude.bloqueado) return interaction.editReply({ content: `🚫 ${fraude.mensagem}` });

  const produto = Produtos.get(produtoId);
  if (!produto || !produto.ativo) return interaction.editReply({ content: '❌ Produto não encontrado.' });

  // Verificar estoque (qualquer fonte)
  const estDig = db.prepare('SELECT COUNT(*) as c FROM estoque_digital WHERE produto_id=? AND usado=0').get(produtoId).c;
  const estVar = db.prepare("SELECT COUNT(*) as c FROM estoque_variante ev JOIN variantes_produto vp ON ev.variante_id=vp.id WHERE vp.produto_id=? AND ev.usado=0").get(produtoId).c;
  if (estDig === 0 && estVar === 0 && produto.estoque === 0) {
    return interaction.editReply({ content: '❌ Produto sem estoque no momento.' });
  }

  // Calcular preço
  let precoFinal = produto.preco_promo || produto.preco;
  let desconto   = 0;
  let cupomUsado = null;

  // Cupom
  if (cupomCodigo) {
    const { valido, cupom, erro } = Cupons.validar(cupomCodigo, interaction.user.id, precoFinal);
    if (!valido) return interaction.editReply({ content: erro });
    const d = Cupons.calcDesconto(cupom, precoFinal);
    desconto += d; precoFinal -= d; cupomUsado = cupom;
  }

  precoFinal = Math.max(0, precoFinal);

  // Afiliado
  let afiliadoId = null, comissaoAfil = 0;
  if (usuario.afiliado_de) {
    afiliadoId   = usuario.afiliado_de;
    const taxa   = parseFloat(db.prepare("SELECT valor FROM configuracoes WHERE chave='taxa_afiliado'").get()?.valor || '5');
    comissaoAfil = precoFinal * taxa / 100;
  }

  // Criar pedido pendente (sem PIX ainda)
  const pedidoId = Pedidos.criar({
    usuarioId:   interaction.user.id, produtoId, quantidade: 1,
    valorUnit:   produto.preco_promo || produto.preco,
    valorTotal:  precoFinal, desconto,
    cupomUsado:  cupomUsado?.codigo || null,
    afiliadoId, comissaoAfil, metodoPag: 'pix',
  });
  if (cupomUsado) Cupons.usar(cupomUsado.id, interaction.user.id, pedidoId);

  // Produto free — entregar direto
  if (precoFinal === 0) {
    const p = Pedidos.get(pedidoId);
    await entregarProduto(p, interaction.client);
    return interaction.editReply({ content: '✅ Produto resgatado gratuitamente! Verifique suas DMs.' });
  }

  // Garantir member (pode vir nulo em select menus)
  const { abrirTicket } = require('./tickets');
  const memberObj = interaction.member
    || await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
  const { ok, canal } = await abrirTicket(interaction.guild, memberObj, 'compra', {
    pedidoId, produtoId, produto: produto.nome, valor: precoFinal,
    usuarioId: interaction.user.id,
  });
  if (ok) Pedidos.atualizar(pedidoId, { ticket_id: canal.id });

  if (ok && canal) {
    await interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(config.colors.success)
        .setTitle('✅ Ticket Aberto!')
        .setDescription([
          `> Seu ticket foi criado em ${canal}.`,
          `> Escolha a forma de pagamento lá para finalizar a compra.`,
        ].join('\n'))
        .addFields(
          { name: '📦 Produto', value: produto.nome,                                inline: true },
          { name: '💵 Valor',   value: `R$ ${precoFinal.toFixed(2)}`,               inline: true },
          { name: '🆔 Pedido',  value: `\`${pedidoId.slice(0,8).toUpperCase()}\``, inline: true },
        )
        .setTimestamp()
        .setFooter({ text: 'Máximo Store • Ticket de Compra' })],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel('🎫 Ir para o Ticket')
          .setStyle(ButtonStyle.Link)
          .setURL(`https://discord.com/channels/${interaction.guild?.id}/${canal.id}`),
      )],
    });
  } else {
    // Fallback sem ticket
    const rowPag = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`gerar_pix_${pedidoId}`).setLabel('💠 Pagar via PIX').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`cancelar_pedido_${pedidoId}`).setLabel('❌ Cancelar').setStyle(ButtonStyle.Danger),
    );
    const embedFb = new EmbedBuilder().setColor(config.colors.pix).setTitle('🛒 Pedido').setDescription(`📦 ${produto.nome}\n💵 R$ ${precoFinal.toFixed(2)}\n🆔 \`${pedidoId.slice(0,8).toUpperCase()}\``).setTimestamp();
    await interaction.editReply({ embeds: [embedFb], components: [rowPag] });
  }

  antiFraude.registrarTentativa(interaction.user.id);
  await log('compra', { usuario: interaction.user.id, produto: produto.nome, valor: precoFinal, pedidoId, descricao: `Pedido criado: ${produto.nome}` });
}

// ─── Gerar PIX real ao clicar no botão ───────────────────────────────────────
async function gerarPixPedido(interaction, pedidoId, client) {
  if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ ephemeral: true });

  const pedido = Pedidos.get(pedidoId);
  if (!pedido) return interaction.editReply({ content: '❌ Pedido não encontrado.' });
  if (pedido.status !== 'pendente') return interaction.editReply({ content: `✅ Pedido já com status: **${pedido.status}**` });
  if (pedido.usuario_id !== interaction.user.id) return interaction.editReply({ content: '❌ Este pedido não é seu.' });

  const produto = Produtos.get(pedido.produto_id);
  const { t, getIdioma } = require('./i18n');
  const idioma = getIdioma(pedido.usuario_id);
  const valorPix = totalGrupoPedidos(pedido);
  const nomesPix = descricaoGrupoPedidos(pedido);

  let cobranca, qrData;
  try {
    cobranca = await efi.criarCobrancaPix({
      valor:       valorPix,
      descricao:   `Máximo Store - ${nomesPix}`.slice(0, 140),
      pedidoId,
      nomeCliente: interaction.user.username,
    });
    aplicarTxIdGrupo(pedido, cobranca.txid);
    // locId é o ID numérico do location — obrigatório para gerar QR Code
    qrData = await efi.gerarQRCode(cobranca.locId);
  } catch (err) {
    console.error('[PIX]', err.message, err.response?.data ? JSON.stringify(err.response.data) : '');
    const detalhe = err.response?.data?.mensagem || err.message || 'Erro desconhecido';
    return interaction.editReply({ content: `❌ Erro ao gerar PIX: \`${String(detalhe).slice(0,120)}\`\n\n> Use **📄 Boleto** ou **🪙 Coins** como alternativa.` });
  }

  let qrBuf = null;
  try { qrBuf = await QRCode.toBuffer(qrData.qrcode, { width: 300, margin: 2 }); } catch {}

  const pixEmbed = new EmbedBuilder()
    .setColor(config.colors.pix)
    .setTitle(t('pix_title', idioma))
    .setDescription([
      `📦 **${t('delivery_product', idioma)}:** ${nomesPix || produto?.nome}`,
      `💵 **${t('delivery_value', idioma)}:** R$ ${valorPix.toFixed(2)}`,
      `🆔 **${t('delivery_order', idioma)}:** \`${pedidoId.slice(0,8).toUpperCase()}\``,
      '',
      t('pix_expires', idioma),
    ].join('\n'))
    .addFields({ name: t('pix_code', idioma), value: `\`\`\`${qrData.qrcode}\`\`\`` })
    .setFooter({ text: t('pix_footer', idioma) })
    .setTimestamp();

  const { btnIdioma } = require('./i18n');
  const rowVerif = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`verificar_pix_${pedidoId}`).setLabel(t('pix_verify', idioma)).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`cancelar_pedido_${pedidoId}`).setLabel(t('ticket_cancel', idioma)).setStyle(ButtonStyle.Danger),
    btnIdioma(idioma),
  );

  const payload = { embeds: [pixEmbed], components: [rowVerif] };
  if (qrBuf) {
    const att = new AttachmentBuilder(qrBuf, { name: 'qrcode.png' });
    pixEmbed.setImage('attachment://qrcode.png');
    payload.files = [att];
  }

  await interaction.editReply(payload);
  iniciarPollingPagamento(pedidoId, cobranca.txid, interaction.guild, client || interaction.client);
}

// ─── Pagar com coins ──────────────────────────────────────────────────────────
async function pagarComCoins(interaction, pedidoId, client) {
  if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ ephemeral: true });

  const pedido = Pedidos.get(pedidoId);
  if (!pedido) return interaction.editReply({ content: '❌ Pedido não encontrado.' });
  if (pedido.status !== 'pendente') return interaction.editReply({ content: `✅ Pedido já com status: **${pedido.status}**` });
  if (pedido.usuario_id !== interaction.user.id) return interaction.editReply({ content: '❌ Este pedido não é seu.' });

  const usuario = Usuarios.get(pedido.usuario_id);
  const coins   = usuario?.coins || 0;
  const valorGrupo = totalGrupoPedidos(pedido);
  const coinsNecessarios = Math.ceil(valorGrupo / 0.01);

  if (coins < coinsNecessarios) {
    return interaction.editReply({
      content: [
        `❌ Coins insuficientes!`,
        `💵 Valor: R$ ${valorGrupo.toFixed(2)} = **${coinsNecessarios.toLocaleString('pt-BR')} coins**`,
        `🪙 Você tem: **${coins.toLocaleString('pt-BR')} coins**`,
        `❗ Faltam: **${(coinsNecessarios - coins).toLocaleString('pt-BR')} coins**`,
      ].join('\n'),
    });
  }

  // Debitar coins
  const novo = coins - coinsNecessarios;
  db.prepare('UPDATE usuarios SET coins=? WHERE discord_id=?').run(novo, pedido.usuario_id);

  // Identificar tipo de pedido e confirmar pagamento
  const notaOriginal = (() => { try { return pedido.nota_fiscal ? JSON.parse(pedido.nota_fiscal) : null; } catch { return null; } })();
  const notaNova     = { tipo: notaOriginal?.tipo || 'coins_pagamento', ...notaOriginal, coinsUsados: coinsNecessarios };

  db.prepare("UPDATE pedidos SET status='pago', pago_em=strftime('%s','now'), nota_fiscal=? WHERE id=?")
    .run(JSON.stringify(notaNova), pedidoId);

  marcarGrupoPago(pedido);
  const pedidoAtualizado = Pedidos.get(pedidoId);

  // Usar processarEntrega que entrega este + todos os outros do ticket
  // O fecharTicketAutomatico dentro de entregarProduto cuida do transcript + fechamento
  await processarEntrega(pedidoAtualizado, client || interaction.client);

  await interaction.editReply({
    embeds: [new EmbedBuilder()
      .setColor(config.colors.coins || config.colors.gold)
      .setTitle('🪙 Pagamento com Coins Realizado!')
      .setDescription([
        `✅ Pagamento confirmado!`,
        `🪙 **Coins usados:** ${coinsNecessarios.toLocaleString('pt-BR')}`,
        `🪙 **Saldo restante:** ${novo.toLocaleString('pt-BR')} coins`,
        `📦 Produto/prêmio entregue nas suas DMs!`,
      ].join('\n'))
      .setTimestamp()],
  });

  await log('pagamento', { usuario: pedido.usuario_id, valor: valorGrupo, pedidoId, descricao: `Pago com ${coinsNecessarios} coins` });
}

// ─── Compra via variante (painel de produto) ──────────────────────────────────
async function iniciarCompraVariante(interaction, varianteId, client, cupomCodigo = null, qtdInicial = 1) {
  if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ ephemeral: true });

  // Verificar manutenção
  if (Config.get('manutencao') === true) return interaction.editReply({ content: '🔧 A loja está em **manutenção** no momento. Tente novamente em breve!' });

  const usuario = Usuarios.garantir(interaction.user.id, interaction.user.username);
  if (usuario.bloqueado) return interaction.editReply({ content: '🚫 Conta bloqueada.' });

  const fraude = antiFraude.verificar(interaction.user.id);
  if (fraude.bloqueado) return interaction.editReply({ content: `🚫 ${fraude.mensagem}` });

  const variante = db.prepare('SELECT * FROM variantes_produto WHERE id=? AND ativo=1').get(varianteId);
  if (!variante) return interaction.editReply({ content: '❌ Plano não encontrado.' });

  const produto = Produtos.get(variante.produto_id);
  if (!produto || !produto.ativo) return interaction.editReply({ content: '❌ Produto indisponível.' });

  // Bloquear pedido duplicado — mesmo produto pendente ou pago nos últimos 10 min
  const pedidoDup = db.prepare("SELECT id FROM pedidos WHERE usuario_id=? AND produto_id=? AND status='pendente' AND criado_em > ?").get(
    interaction.user.id, produto.id, Math.floor(Date.now()/1000) - 600
  );
  if (pedidoDup) {
    return interaction.editReply({ content: `⚠️ Você já tem um pedido pendente deste produto.\nID: \`${pedidoDup.id.slice(0,8).toUpperCase()}\`\nFinalize ou cancele o pedido anterior antes de comprar novamente.` });
  }

  // Verificar estoque — sem estoque, não abre ticket
  const digital = db.prepare('SELECT COUNT(*) as c FROM estoque_variante WHERE variante_id=? AND usado=0').get(varianteId);
  const qtdEstoque = Number(digital?.c || 0);
  if (qtdEstoque === 0) {
    const rowNotif = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`notif_estoque_${varianteId}`)
        .setLabel('🔔 Avisar quando voltar')
        .setStyle(ButtonStyle.Secondary),
    );
    return interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(config.colors.error)
        .setTitle('❌ Sem Estoque')
        .setDescription([
          `> O plano **${variante.nome}** está sem estoque no momento.`,
          `> Clique em **🔔 Avisar quando voltar** para receber uma notificação no privado quando o estoque for reposto.`,
        ].join('\n'))
        .setTimestamp()],
      components: [rowNotif],
    });
  }

  let precoFinal = Number(variante.preco);
  let desconto   = 0;

  // Cupom — busca painelId da loja para validar restrição
  let cupomUsado = null;
  if (cupomCodigo) {
    const painel = db.prepare('SELECT id FROM paineis_canal WHERE produto_id=? AND ativo=1 LIMIT 1').get(produto.id);
    const painelId = painel?.id || null;
    const { valido, cupom, erro } = Cupons.validar(cupomCodigo, interaction.user.id, precoFinal, painelId);
    if (!valido) return interaction.editReply({ content: erro });
    const d = Cupons.calcDesconto(cupom, precoFinal);
    desconto += d; precoFinal -= d; cupomUsado = cupom;
  }

  precoFinal = Math.max(0, precoFinal);

  let afiliadoId = null, comissaoAfil = 0;
  if (usuario.afiliado_de) {
    afiliadoId   = usuario.afiliado_de;
    const taxa   = parseFloat(db.prepare("SELECT valor FROM configuracoes WHERE chave='taxa_afiliado'").get()?.valor || '5');
    comissaoAfil = precoFinal * taxa / 100;
  }

  const pedidoId = Pedidos.criar({
    usuarioId: interaction.user.id, produtoId: produto.id, quantidade: qtdInicial,
    valorUnit: Number(variante.preco), valorTotal: precoFinal * qtdInicial, desconto,
    afiliadoId, comissaoAfil, metodoPag: 'pix',
    cupomUsado: cupomUsado?.codigo || null,
  });

  db.prepare('UPDATE pedidos SET nota_fiscal=? WHERE id=?').run(JSON.stringify({ varianteId }), pedidoId);
  if (cupomUsado) Cupons.usar(cupomUsado.id, interaction.user.id, pedidoId);

  // Produto free
  if (precoFinal === 0) {
    const p = Pedidos.get(pedidoId);
    await entregarProduto(p, client || interaction.client);
    return interaction.editReply({ content: '✅ Produto resgatado gratuitamente!' });
  }

  // Coins
  const coins      = usuario.coins || 0;
  const valorCoins = coins * 0.01;
  const podeCoins  = valorCoins >= precoFinal;

  // Abrir ticket — já envia embed completo com botões de pagamento
  const { abrirTicket } = require('./tickets');
  // Garantir member (pode vir nulo em select menus)
  const memberObj = interaction.member
    || await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
  const { ok, canal } = await abrirTicket(interaction.guild, memberObj, 'compra', {
    pedidoId, produtoId: produto.id, produto: `${produto.nome} — ${variante.nome}`, valor: precoFinal,
    usuarioId: interaction.user.id,
  });
  if (ok) Pedidos.atualizar(pedidoId, { ticket_id: canal.id });

  if (ok && canal) {
    await interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(config.colors.success)
        .setTitle('✅ Ticket Aberto!')
        .setDescription([
          `> Seu ticket foi criado em ${canal}.`,
          `> Escolha a forma de pagamento lá para finalizar a compra.`,
        ].join('\n'))
        .addFields(
          { name: '📦 Produto', value: produto.nome,                                inline: true },
          { name: '💵 Valor',   value: `R$ ${precoFinal.toFixed(2)}`,               inline: true },
          { name: '🆔 Pedido',  value: `\`${pedidoId.slice(0,8).toUpperCase()}\``, inline: true },
        )
        .setTimestamp()
        .setFooter({ text: 'Máximo Store • Ticket de Compra' })],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel('🎫 Ir para o Ticket')
          .setStyle(ButtonStyle.Link)
          .setURL(`https://discord.com/channels/${interaction.guild?.id}/${canal.id}`),
      )],
    });
  } else {
    const rowPag = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`gerar_pix_${pedidoId}`).setLabel('💠 Pagar via PIX').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`cancelar_pedido_${pedidoId}`).setLabel('❌ Cancelar').setStyle(ButtonStyle.Danger),
    );
    const embedFb = new EmbedBuilder().setColor(config.colors.pix).setTitle('🛒 Pedido').setDescription(`📦 ${produto.nome} — ${variante.nome}\n💵 R$ ${precoFinal.toFixed(2)}\n🆔 \`${pedidoId.slice(0,8).toUpperCase()}\``).setTimestamp();
    await interaction.editReply({ embeds: [embedFb], components: [rowPag] });
  }

  antiFraude.registrarTentativa(interaction.user.id);
  await log('compra', { usuario: interaction.user.id, produto: `${produto.nome}—${variante.nome}`, valor: precoFinal, pedidoId });
}

// ─── Entregar produto ─────────────────────────────────────────────────────────
async function entregarProduto(pedido, client) {
  try {
    const produto = Produtos.get(pedido.produto_id);
    if (!produto) return;

    let conteudo = null;

    if (produto.tipo === 'digital') {
      // Variante primeiro
      let notaFiscal = null;
      try { notaFiscal = pedido.nota_fiscal ? JSON.parse(pedido.nota_fiscal) : null; } catch {}
      const varianteId = notaFiscal?.varianteId;
      const qtd = Math.max(1, parseInt(pedido.quantidade) || 1);

      if (varianteId) {
        const { pegarItemVariante } = require('./painelProduto');
        // Pegar N itens conforme a quantidade do pedido
        const itens = [];
        for (let i = 0; i < qtd; i++) {
          const item = pegarItemVariante(varianteId, pedido.usuario_id, pedido.id);
          if (item) itens.push(item);
          else break; // sem mais estoque
        }
        conteudo = itens.length > 0 ? itens.join('\n') : null;
        if (!conteudo && itens.length === 0) {
          conteudo = '⚠️ Entrega manual — nossa equipe entrará em contato via ticket.';
        }
      }

      // Fallback estoque global
      if (!conteudo) {
        const itens = [];
        for (let i = 0; i < qtd; i++) {
          const item = db.prepare('SELECT * FROM estoque_digital WHERE produto_id=? AND usado=0 LIMIT 1').get(produto.id);
          if (item) {
            db.prepare("UPDATE estoque_digital SET usado=1,usado_por=?,usado_em=strftime('%s','now'),pedido_id=? WHERE id=?")
              .run(pedido.usuario_id, pedido.id, item.id);
            itens.push(item.conteudo);
          } else break;
        }
        if (itens.length > 0) {
          conteudo = itens.join('\n');
          const disponivel = db.prepare('SELECT COUNT(*) as c FROM estoque_digital WHERE produto_id=? AND usado=0').get(produto.id).c;
          db.prepare('UPDATE produtos SET estoque=?,vendas=vendas+? WHERE id=?').run(disponivel, itens.length, produto.id);
          if (disponivel <= 5) await log('estoque_baixo', { produto: produto.nome, descricao: `Estoque baixo: ${produto.nome} — ${disponivel}` });
        } else {
          conteudo = '⚠️ Entrega manual — nossa equipe entrará em contato via ticket.';
          db.prepare('UPDATE produtos SET vendas=vendas+1 WHERE id=?').run(produto.id);
        }
      } else {
        db.prepare('UPDATE produtos SET vendas=vendas+? WHERE id=?').run(qtd, produto.id);
      }
    } else {
      const qtd = Math.max(1, parseInt(pedido.quantidade) || 1);
      if (produto.estoque > 0) db.prepare('UPDATE produtos SET estoque=estoque-?,vendas=vendas+? WHERE id=?').run(qtd, qtd, produto.id);
      conteudo = 'Produto físico — entrega combinada via ticket.';
    }

    Pedidos.atualizar(pedido.id, {
      status:           'entregue',
      conteudo_entregue: conteudo || 'Entregue',
      entregue_em:       Math.floor(Date.now() / 1000),
    });

    // Atualizar estatísticas e cargo
    const usuario = Usuarios.get(pedido.usuario_id);
    if (usuario) {
      const novoGasto    = (usuario.total_gasto || 0) + pedido.valor_total;
      const novasCompras = (usuario.total_compras || 0) + 1;
      Usuarios.atualizar(pedido.usuario_id, { total_gasto: novoGasto, total_compras: novasCompras });
      Usuarios.addPontos(pedido.usuario_id, Math.floor(pedido.valor_total));

      // Cashback 5% — apenas em compras pagas com PIX ou cartão (não coins)
      const metodo = pedido.metodo_pag || '';
      const pagoComCoins = metodo.includes('coins') || pedido.nota_fiscal?.includes('coins_pagamento');
      if (!pedido.cupom_usado && !pagoComCoins && pedido.valor_total >= 1) {
        const { addCoins } = require('./coins');
        const pct = parseInt(require('../database/database').Config.get('cashback_pct') || '5');
        const coinsCashback = Math.floor(pedido.valor_total * pct);
        addCoins(pedido.usuario_id, coinsCashback, `Cashback ${pct}% — Pedido ${pedido.id.slice(0,8).toUpperCase()}`);
      }

      // Comissão afiliado — usa sistema de 2 níveis
      if (pedido.afiliado_id) {
        const { distribuirComissoes } = require('./afiliados');
        await distribuirComissoes(pedido, pedido.afiliado_id).catch(e => console.error('[Afiliados]', e.message));
      }
    }

    if (!client) return;
    const guild  = client.guilds.cache.first();
    if (!guild) return;

    // Dar cargo de cliente
    try {
      const member = await guild.members.fetch(pedido.usuario_id).catch(() => null);
      if (member && pedido.valor_total > 0) {
        const novoGasto = (usuario?.total_gasto || 0) + pedido.valor_total;
        const { atualizarCargoCliente } = require('./cargosAutomaticos');
        await atualizarCargoCliente(member, novoGasto);
      }
    } catch {}

    const member = await guild.members.fetch(pedido.usuario_id).catch(() => null);
    if (!member) return;

    // Obter idioma do usuário
    const { t, getIdioma, btnIdioma } = require('./i18n');
    const idioma = getIdioma(pedido.usuario_id);

    const embed = new EmbedBuilder()
      .setColor(config.colors.success)
      .setTitle(t('delivery_title', idioma))
      .setDescription(t('delivery_thanks', idioma, member.displayName))
      .addFields(
        { name: t('delivery_product', idioma), value: `**${produto.nome}**`,                                    inline: true },
        { name: t('delivery_value', idioma),   value: `**R$ ${pedido.valor_total.toFixed(2)}**`,               inline: true },
        { name: t('delivery_order', idioma),   value: `\`${pedido.id.slice(0,8).toUpperCase()}\``,            inline: true },
      )
      .setTimestamp()
      .setFooter({ text: t('delivery_footer', idioma) });

    if (conteudo && conteudo !== '⚠️ Entrega manual — nossa equipe entrará em contato via ticket.') {
      // Dividir em chunks de 900 chars para não ultrapassar o limite do Discord
      const chunks = [];
      let resto = conteudo;
      while (resto.length > 0) {
        chunks.push(resto.slice(0, 900));
        resto = resto.slice(900);
      }
      for (let i = 0; i < chunks.length; i++) {
        embed.addFields({
          name:  i === 0 ? t('delivery_your_product', idioma) : `📦 Continuação (${i + 1})`,
          value: `\`\`\`\n${chunks[i]}\n\`\`\``,
          inline: false,
        });
      }
    } else if (conteudo) {
      embed.addFields({
        name:  '⚠️ Entrega',
        value: t('delivery_manual', idioma),
        inline: false,
      });
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`confirmar_entrega_${pedido.id}`).setLabel(t('delivery_confirm', idioma)).setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`avaliar_${pedido.id}`).setLabel(t('delivery_rate', idioma)).setStyle(ButtonStyle.Secondary),
      btnIdioma(idioma),
    );

    // Buscar transcript do ticket se existir
    const { criarBotaoTranscript, montarEmbedSugestao } = require('../utils/dmHelpers');
    const transcriptBtn = criarBotaoTranscript(null); // sem transcript na entrega ainda
    if (transcriptBtn) row.addComponents(transcriptBtn);

    // Embed de sugestão dos 3 produtos mais baratos
    const embedSugestao = montarEmbedSugestao();

    const mensagens = [{ embeds: [embed], components: [row] }];
    if (embedSugestao) mensagens.push({ embeds: [embedSugestao] });

    // Sempre entrega no privado — nunca no ticket
    const enviado = await member.send(mensagens[0]).catch(() => null);
    if (enviado && embedSugestao) await member.send(mensagens[1]).catch(() => {});

    // Se não conseguiu enviar DM, avisa no ticket que o produto está pronto
    if (!enviado && pedido.ticket_id) {
      const canalTicket = guild.channels.cache.get(pedido.ticket_id);
      if (canalTicket) {
        await canalTicket.send({
          content: `<@${pedido.usuario_id}> ✅ Pagamento confirmado! Seu produto foi enviado para sua DM. Verifique suas mensagens privadas.`,
        }).catch(() => {});
      }
    }

    // ── Feed público de vendas ──────────────────────────────────────────────
    try {
      const { Config: Cfg } = require('../database/database');
      const canalVendasId = Cfg.get('canal_vendas_id');
      if (canalVendasId) {
        const canalVendas = guild.channels.cache.get(canalVendasId);
        if (canalVendas && pedido.valor_total > 0) {
          const nomeExibido = member?.displayName
            ? member.displayName.replace(/./g, (c, i) => i === 0 ? c : i === member.displayName.length - 1 ? c : '✦')
            : 'Alguém';
          const feedEmbed = new EmbedBuilder()
            .setColor(config.colors.success)
            .setDescription([
              `🛒 **${nomeExibido}** acabou de comprar **${produto.nome}**!`,
              `💵 R$ ${pedido.valor_total.toFixed(2)}`,
            ].join('\n'))
            .setTimestamp();
          await canalVendas.send({ embeds: [feedEmbed] }).catch(() => {});
        }
      }
    } catch {}

    // ── Log detalhado de vendas no canal fixo ─────────────────────────────
    try {
      const { logVenda } = require('../utils/canalVendas');
      await logVenda(client, pedido);
    } catch {}

    // ── Fechar ticket automaticamente com transcript ──────────────────────
    try {
      if (pedido.ticket_id && !ticketAindaTemItensAbertos(pedido.ticket_id, pedido.id)) {
        const { fecharTicketAutomatico } = require('./tickets');
        await fecharTicketAutomatico(guild, pedido.ticket_id, null, 'Pagamento confirmado e produto entregue');
      }
    } catch {}
  } catch (err) {
    console.error('[EntregarProduto]', err.message);
  }
}

// ─── Liberar pedido sem pagamento (cargo aceitar compra) ──────────────────────
async function liberarPedidoManual(interaction, pedidoId, client) {
  const pedido = Pedidos.get(pedidoId);
  if (!pedido) return interaction.reply({ content: '❌ Pedido não encontrado.', ephemeral: true });
  if (pedido.status !== 'pendente') return interaction.reply({ content: `⚠️ Pedido não está pendente (status: ${pedido.status}).`, ephemeral: true });

  await interaction.deferReply({ ephemeral: false });

  const grupo = pedidosPendentesDoTicket(pedido);
  const entregues = [];

  for (const pedidoAtual of grupo) {
    const notaOriginal = (() => { try { return pedidoAtual.nota_fiscal ? JSON.parse(pedidoAtual.nota_fiscal) : {}; } catch { return {}; } })();
    const notaNova = { ...notaOriginal, manual: true, autorizadoPor: interaction.user.id };

    db.prepare("UPDATE pedidos SET status='entregue', pago_em=strftime('%s','now'), entregue_em=strftime('%s','now'), nota_fiscal=? WHERE id=?")
      .run(JSON.stringify(notaNova), pedidoAtual.id);

    const pedidoAtualizado = Pedidos.get(pedidoAtual.id);
    const produto = Produtos.get(pedidoAtualizado.produto_id);
    let conteudo = null;

    try {
      const nota = notaNova;
      const varianteId = nota?.varianteId;
      const qtd = Math.max(1, parseInt(pedidoAtualizado.quantidade) || 1);

      if (varianteId) {
        const { pegarItemVariante } = require('./painelProduto');
        const itens = [];
        for (let i = 0; i < qtd; i++) {
          const item = pegarItemVariante(varianteId, pedidoAtualizado.usuario_id, pedidoAtual.id);
          if (item) itens.push(item);
          else break;
        }
        conteudo = itens.length > 0 ? itens.join('\n') : null;
      }

      if (!conteudo) {
        const item = db.prepare('SELECT * FROM estoque_digital WHERE produto_id=? AND usado=0 LIMIT 1').get(pedidoAtualizado.produto_id);
        if (item) {
          db.prepare("UPDATE estoque_digital SET usado=1,usado_por=?,usado_em=strftime('%s','now'),pedido_id=? WHERE id=?")
            .run(pedidoAtualizado.usuario_id, pedidoAtual.id, item.id);
          conteudo = item.conteudo;
        }
      }

      db.prepare('UPDATE pedidos SET conteudo_entregue=? WHERE id=?').run(conteudo || 'Entregue manualmente', pedidoAtual.id);
    } catch (err) {
      console.error('[LiberarManual]', err.message);
    }

    entregues.push({ pedidoId: pedidoAtualizado.id, produto, conteudo: conteudo || 'Entregue manualmente' });
  }

  const guild = client || interaction.client;
  const guildObj = guild?.guilds?.cache?.first();
  if (guildObj && entregues.length) {
    const member = await guildObj.members.fetch(pedido.usuario_id).catch(() => null);
    if (member) {
      const { t, getIdioma, btnIdioma } = require('./i18n');
      const idioma = getIdioma(pedido.usuario_id);
      const totalConteudo = entregues
        .map((item, index) => `**${index + 1}. ${item.produto?.nome || 'Produto'}**\n${item.conteudo}`)
        .join('\n\n');

      const chunks = [];
      let resto = totalConteudo;
      while (resto.length > 0) { chunks.push(resto.slice(0, 900)); resto = resto.slice(900); }

      const embed = new EmbedBuilder()
        .setColor(config.colors.success)
        .setTitle(t('delivery_title', idioma))
        .setDescription(t('delivery_thanks', idioma, member.displayName))
        .addFields(
          { name: t('delivery_product', idioma), value: `**${entregues.map(e => e.produto?.nome || 'Produto').join(', ')}**`, inline: true },
          { name: t('delivery_order', idioma), value: `\`${pedidoId.slice(0,8).toUpperCase()}\``, inline: true },
        )
        .setTimestamp()
        .setFooter({ text: t('delivery_footer', idioma) });

      for (let i = 0; i < chunks.length; i++) {
        embed.addFields({ name: i === 0 ? t('delivery_your_product', idioma) : `📦 Cont. (${i+1})`, value: `\`\`\`\n${chunks[i]}\n\`\`\``, inline: false });
      }

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`confirmar_entrega_${entregues[0].pedidoId}`).setLabel(t('delivery_confirm', idioma)).setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`avaliar_${entregues[0].pedidoId}`).setLabel(t('delivery_rate', idioma)).setStyle(ButtonStyle.Secondary),
        btnIdioma(idioma),
      );
      await member.send({ embeds: [embed], components: [row] }).catch(() => {});
    }
  }

  await interaction.editReply({
    embeds: [new EmbedBuilder()
      .setColor(config.colors.success)
      .setTitle('✅ Liberado e Entregue!')
      .setDescription([
        `Pedido \`${pedidoId.slice(0,8).toUpperCase()}\` liberado por <@${interaction.user.id}>.`,
        `📦 ${entregues.length} item(ns) entregue(s) no **privado** do cliente <@${pedido.usuario_id}>.`,
      ].join('\n'))
      .setTimestamp()],
  });

  if (interaction.channel) {
    const tickets = require('../database/database').Tickets;
    const ticket = tickets.get(interaction.channel.id);
    if (ticket) {
      await interaction.channel.send({
        content: `✅ <@${pedido.usuario_id}> ${entregues.length} item(ns) liberado(s) no seu privado! Verifique suas DMs.`,
      }).catch(() => {});
    }
  }

  await log('pagamento', { executor: interaction.user.id, usuario: pedido.usuario_id, pedidoId, descricao: `Liberado e entregue manualmente por ${interaction.user.tag} (${entregues.length} itens)` });
}

// ─── Boleto ───────────────────────────────────────────────────────────────────
async function iniciarCompraBoleto(interaction, produtoId) {
  const modal = new ModalBuilder().setCustomId(`modal_boleto_${produtoId}`).setTitle('📄 Dados para Boleto');
  modal.addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('nome').setLabel('Nome Completo').setStyle(TextInputStyle.Short).setRequired(true)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cpf').setLabel('CPF (só números)').setStyle(TextInputStyle.Short).setRequired(true).setMinLength(11).setMaxLength(14)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('email').setLabel('E-mail').setStyle(TextInputStyle.Short).setRequired(true)),
  );
  return interaction.showModal(modal);
}

async function processarCompraBoleto(interaction, produtoId, dadosCliente) {
  await interaction.deferReply({ ephemeral: true });
  const usuario = Usuarios.garantir(interaction.user.id, interaction.user.username);
  if (usuario.bloqueado) return interaction.editReply({ content: '🚫 Conta bloqueada.' });
  // Verificar CPF na blacklist
  if (dadosCliente.cpf) {
    const { verificarCpf } = require('./antiFraude');
    const cpfCheck = verificarCpf(dadosCliente.cpf);
    if (cpfCheck.bloqueado) return interaction.editReply({ content: `🚫 ${cpfCheck.mensagem}` });
  }
  const produto = Produtos.get(produtoId);
  if (!produto || !produto.ativo) return interaction.editReply({ content: '❌ Produto indisponível.' });
  const precoFinal = produto.preco_promo || produto.preco;
  const pedidoId   = Pedidos.criar({ usuarioId: interaction.user.id, produtoId, quantidade: 1, valorUnit: precoFinal, valorTotal: precoFinal, desconto: 0, metodoPag: 'boleto' });

  let boleto = null;
  try {
    boleto = await efi.criarBoleto({ valor: precoFinal, descricao: `Máximo Store — ${produto.nome}`, cliente: dadosCliente });
    if (boleto?.id) Pedidos.atualizar(pedidoId, { tx_id: String(boleto.id) });
  } catch (err) { console.error('[Boleto]', err.message); }

  const embed = new EmbedBuilder()
    .setColor(config.colors.info)
    .setTitle('📄 Boleto Bancário')
    .setDescription('> ⚠️ Pode levar até **2 dias úteis** para compensar.')
    .addFields(
      { name: '📦 Produto', value: produto.nome,                                     inline: true },
      { name: '💵 Valor',   value: `R$ ${precoFinal.toFixed(2)}`,                   inline: true },
      { name: '🆔 Pedido',  value: `\`${pedidoId.slice(0,8).toUpperCase()}\``,     inline: true },
    )
    .setTimestamp()
    .setFooter({ text: 'Máximo Store • Boleto Bancário' });
  if (boleto?.link)        embed.addFields({ name: '🔗 Link',          value: boleto.link });
  if (boleto?.barcodeData) embed.addFields({ name: '📊 Código Barras', value: `\`\`\`${boleto.barcodeData}\`\`\`` });
  await interaction.editReply({ embeds: [embed] });
}

// ─── Função central de entrega pós-pagamento ─────────────────────────────────
// Usada por PIX, Coins, Webhook — garante entrega correta para caixa ou produto
async function processarEntrega(pedido, client) {
  try {
    const nota = (() => { try { return pedido.nota_fiscal ? JSON.parse(pedido.nota_fiscal) : null; } catch { return null; } })();

    if (nota?.tipo === 'caixa') {
      const { entregarPrêmioCaixa } = require('./caixaMisteriosa');
      return await entregarPrêmioCaixa(pedido, client);
    } else if (nota?.tipo === 'coins') {
      const { entregarCoins } = require('./coins');
      return await entregarCoins(pedido, client);
    } else {
      await entregarProduto(pedido, client);

      if (pedido.ticket_id) {
        const outrosPedidos = db.prepare(`
          SELECT * FROM pedidos
          WHERE ticket_id=? AND id!=? AND status='pago'
        `).all(pedido.ticket_id, pedido.id);

        for (const outro of outrosPedidos) {
          await entregarProduto(outro, client).catch(e =>
            console.error(`[ProcessarEntrega] Erro ao entregar pedido extra ${outro.id.slice(0,8)}:`, e.message)
          );
        }
      }
    }
  } catch (err) {
    console.error('[ProcessarEntrega]', err.message);
  }
}

// ─── Polling PIX ─────────────────────────────────────────────────────────────
function iniciarPollingPagamento(pedidoId, txid, guild, client) {
  if (!txid || txid.startsWith('SIM_')) return;
  let tentativas = 0;
  const interval = setInterval(async () => {
    try {
      tentativas++;
      const pedido = Pedidos.get(pedidoId);
      if (!pedido || pedido.status !== 'pendente') { clearInterval(interval); return; }
      const status = await efi.consultarCobranca(txid);
      if (status.pago) {
        clearInterval(interval);
        const p = Pedidos.get(pedidoId);
        if (p?.status === 'pendente') {
          marcarGrupoPago(p);
          await processarEntrega(Pedidos.get(pedidoId), client);
        }
      }
      if (tentativas >= 36) {
        clearInterval(interval);
        const p = Pedidos.get(pedidoId);
        if (p?.status === 'pendente') {
          const { marcarGrupoCancelado } = require('../utils/pedidoGrupo');
          marcarGrupoCancelado(p, null, 'Tempo expirado');
        }
      }
    } catch (err) { console.error('[Polling PIX]', err.message); }
  }, 50000);
}

// ─── Compra de todos os itens do carrinho (/carrinho) ─────────────────────────
async function iniciarCompraCarrinho(interaction, client) {
  const { listarCarrinho, calcularTotal, limparCarrinho } = require('./carrinho');
  const itens = listarCarrinho(interaction.user.id);
  if (!itens.length) return interaction.editReply({ content: '🛒 Carrinho vazio.' });

  if (Config.get('manutencao') === true) {
    return interaction.editReply({ content: '🔧 A loja está em **manutenção** no momento. Tente novamente em breve!' });
  }

  const usuario = Usuarios.garantir(interaction.user.id, interaction.user.username);
  if (usuario.bloqueado) return interaction.editReply({ content: '🚫 Conta bloqueada. Contate o suporte.' });

  const fraude = antiFraude.verificar(interaction.user.id);
  if (fraude.bloqueado) return interaction.editReply({ content: `🚫 ${fraude.mensagem}` });

  for (const item of itens) {
    if (!item.ativo) {
      return interaction.editReply({ content: `❌ **${item.nome}** não está mais disponível.` });
    }
    if (!Produtos.temEstoque(item.produto_id, item.quantidade)) {
      return interaction.editReply({ content: `❌ **${item.nome}** sem estoque suficiente.` });
    }
  }

  const { v4: uuidv4 } = require('uuid');
  const total = calcularTotal(itens);
  const pedidoIds = [];

  let afiliadoId = null;
  if (usuario.afiliado_de) afiliadoId = usuario.afiliado_de;
  const taxa = parseFloat(db.prepare("SELECT valor FROM configuracoes WHERE chave='taxa_afiliado'").get()?.valor || '5');

  for (const item of itens) {
    const preco = item.preco_promo || item.preco;
    const subtotal = preco * item.quantidade;
    const comissao = afiliadoId ? subtotal * taxa / 100 : 0;
    const pedidoId = uuidv4();
    db.prepare(`
      INSERT INTO pedidos (id,usuario_id,produto_id,quantidade,valor_unit,valor_total,desconto,afiliado_id,comissao_afil,metodo_pag,nota_fiscal,status)
      VALUES (?,?,?,?,?,?,0,?,?,'pix',?,'pendente')
    `).run(
      pedidoId, interaction.user.id, item.produto_id, item.quantidade,
      preco, subtotal,
      afiliadoId || null, comissao,
      JSON.stringify({ carrinhoMulti: true }),
    );
    pedidoIds.push(pedidoId);
  }

  const resumoProdutos = itens.map(i => `${i.nome} (${i.quantidade}x)`).join(', ');
  const pedidoPrincipal = pedidoIds[0];

  const { abrirTicket } = require('./tickets');
  const memberObj = interaction.member
    || await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
  const { ok, canal } = await abrirTicket(interaction.guild, memberObj, 'compra', {
    pedidoId:  pedidoPrincipal,
    produtoId: itens[0].produto_id,
    produto:   resumoProdutos,
    valor:     total,
    usuarioId: interaction.user.id,
  });

  if (ok) {
    for (const pid of pedidoIds) {
      db.prepare('UPDATE pedidos SET ticket_id=? WHERE id=?').run(canal.id, pid);
    }
  }

  limparCarrinho(interaction.user.id);
  antiFraude.registrarTentativa(interaction.user.id);

  if (ok && canal) {
    return interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(config.colors.success)
        .setTitle('✅ Ticket Aberto!')
        .setDescription([
          `> Seu ticket foi criado em ${canal}.`,
          `> Escolha a forma de pagamento lá para finalizar a compra.`,
        ].join('\n'))
        .addFields(
          { name: '📦 Itens', value: resumoProdutos.slice(0, 200), inline: false },
          { name: '💵 Total', value: `R$ ${total.toFixed(2)}`, inline: true },
          { name: '📋 Pedidos', value: String(pedidoIds.length), inline: true },
        )
        .setTimestamp()
        .setFooter({ text: 'Máximo Store • Carrinho' })],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel('🎫 Ir para o Ticket')
          .setStyle(ButtonStyle.Link)
          .setURL(`https://discord.com/channels/${interaction.guild?.id}/${canal.id}`),
      )],
    });
  }

  return interaction.editReply({ content: '❌ Erro ao abrir ticket. Tente novamente.' });
}

module.exports = {
  mostrarLoja, mostrarProduto,
  iniciarCompra, iniciarCompraVariante, iniciarCompraCarrinho,
  gerarPixPedido, pagarComCoins, liberarPedidoManual,
  iniciarCompraBoleto, processarCompraBoleto,
  entregarProduto, processarEntrega, iniciarPollingPagamento,
};
