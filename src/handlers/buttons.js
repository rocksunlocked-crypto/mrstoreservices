const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { iniciarCompra, entregarProduto } = require('../systems/loja');
const efi = require('../systems/efi');
const { fecharTicket, assumirTicket, gerarTranscript } = require('../systems/tickets');
const { adicionarAoCarrinho, removerDoCarrinho, limparCarrinho, mostrarCarrinho, listarCarrinho, calcularTotal } = require('../systems/carrinho');
const { solicitarSaque } = require('../systems/afiliados');
const { Pedidos, Produtos, Usuarios, db } = require('../database/database');
const { isStaff, podeAceitarCompra, podeVerTickets } = require('../utils/permissions');
const { Embeds } = require('../utils/embeds');
const { log } = require('../utils/logger');
const painelButtons = require('./painelButtons');
const config = require('../config');

const painelProdutoHandler = require('./painelProdutoHandler');
const { handlePainelBuilder } = require('../systems/painelProduto');
const { handlePainelAdmin } = require('../systems/painelAdmin');

module.exports = async (interaction, client) => {
  const id = interaction.customId;

  // ── Abrir caixa misteriosa ────────────────────────────────────────────────────
  if (id === 'abrir_caixa_misteriosa') {
    const { iniciarCompraCaixa } = require('../systems/caixaMisteriosa');
    return iniciarCompraCaixa(interaction, null, client);
  }

  // ── Abrir caixa específica (botão direto quando há 1 caixa) ───────────────────
  if (id.startsWith('abrir_caixa_')) {
    const caixaId = id.replace('abrir_caixa_', '');
    const { iniciarCompraCaixa } = require('../systems/caixaMisteriosa');
    return iniciarCompraCaixa(interaction, caixaId, client);
  }

  // ── Histórico da caixa ────────────────────────────────────────────────────────
  if (id === 'historico_caixa') {
    const { mostrarHistorico } = require('../systems/caixaMisteriosa');
    return mostrarHistorico(interaction);
  }

  // ── Verificar pagamento da caixa ──────────────────────────────────────────────
  if (id.startsWith('caixa_verificar_')) {
    const pedidoId = id.replace('caixa_verificar_', '');
    const { verificarPagamentoCaixa } = require('../systems/caixaMisteriosa');
    return verificarPagamentoCaixa(interaction, pedidoId, client);
  }

  // ── Sistema de convites ───────────────────────────────────────────────────────
  if (id === 'convite_criar_codigo') {
    const { mostrarMeuCodigo } = require('../systems/sistemaConvite');
    return mostrarMeuCodigo(interaction);
  }

  if (id === 'convite_usar_codigo') {
    const modal = new ModalBuilder().setCustomId('modal_usar_codigo_convite').setTitle('🎁 Usar Código de Convite');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('codigo')
          .setLabel('Digite o código de convite')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder('Ex: ALAN-AB12')
          .setMinLength(9)
          .setMaxLength(9),
      ),
    );
    return interaction.showModal(modal);
  }

  // ── Seletor de idioma ────────────────────────────────────────────────────────
  if (id === 'abrir_idioma') {
    const { mostrarSeletorIdioma } = require('../systems/i18n');
    return mostrarSeletorIdioma(interaction);
  }

  // ── Painel público 2FA ────────────────────────────────────────────────────────
  if (id === 'public_2fa_gerar') {
    const modal = new ModalBuilder()
      .setCustomId('public_2fa_modal')
      .setTitle('🔐 Gerar Código 2FA');

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('secret')
          .setLabel('Cole sua chave Base32')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder('Ex: I7YFCQEIZEOBNOZNM34JLZVJ6M'),
      ),
    );

    return interaction.showModal(modal);
  }

  if (id === 'public_2fa_help') {
    return interaction.reply({
      content: '🔐 Como usar:\n\n1. Cole a chave Base32 no modal\n2. Clique em gerar\n3. O bot responde com o código atual e o tempo restante',
      ephemeral: true,
    });
  }

  if (id === 'public_2fa_translate') {
    return interaction.reply({
      content: '🌐 Tradução / Translate\n\n• Chave Base32: `secret`\n• Código gerado: `TOTP`\n• Tempo restante: `expira em 30s`',
      ephemeral: true,
    });
  }

  // ── Painel admin central (pa_*) ──────────────────────────────────────────
  if (id.startsWith('pa_')) {
    return handlePainelAdmin(interaction, client);
  }

  // ── Submenu criar/editar carrinho (cc_*) ─────────────────────────────────
  if (id.startsWith('cc_')) {
    return handlePainelAdmin(interaction, client);
  }

  // ── Submenus de plano (ap_*), estoque (ae_*), cupom (cu_*) ───────────────
  if (id.startsWith('ap_') || id.startsWith('ae_') || id.startsWith('cu_')) {
    const sub = require('../systems/adminSubmenus');
    // Plano
    if (id === 'ap_produto')  return sub.planoModalProduto(interaction);
    if (id === 'ap_dados')    return sub.planoModalDados(interaction);
    if (id === 'ap_salvar')   return sub.planoSalvar(interaction);
    if (id === 'ap_cancelar') return sub.planoCancelar(interaction);
    // Estoque
    if (id === 'ae_variante') return sub.estoqueModalVariante(interaction);
    if (id === 'ae_slot1')    return sub.estoqueModalSlot(interaction, 1);
    if (id === 'ae_slot2')    return sub.estoqueModalSlot(interaction, 2);
    if (id === 'ae_slot3')    return sub.estoqueModalSlot(interaction, 3);
    if (id === 'ae_slot4')    return sub.estoqueModalSlot(interaction, 4);
    if (id === 'ae_salvar')   return sub.estoqueSalvar(interaction);
    if (id === 'ae_cancelar') return sub.estoqueCancelar(interaction);
    // Cupom
    if (id === 'cu_codigo')   return sub.cupomModal(interaction, 'codigo');
    if (id === 'cu_valor')    return sub.cupomModal(interaction, 'valor');
    if (id === 'cu_validade') return sub.cupomModal(interaction, 'validade');
    if (id === 'cu_limite')   return sub.cupomModal(interaction, 'limite');
    if (id === 'cu_lojas')    return sub.cupomModal(interaction, 'lojas');
    if (id === 'cu_salvar')   return sub.cupomSalvar(interaction);
    if (id === 'cu_cancelar') return sub.cupomCancelar(interaction);
  }

  // ── Submenu Caixa Misteriosa (cxc_*, cxi_*) ──────────────────────────────
  if (id.startsWith('cxc_') || id.startsWith('cxi_')) {
    const cx = require('../systems/caixaSubmenu');
    // Criar/Editar caixa
    if (id === 'cxc_nome')     return cx.criarModalNome(interaction);
    if (id === 'cxc_canal')    return cx.criarModalCanal(interaction);
    if (id === 'cxc_desc')     return cx.criarModalDesc(interaction);
    if (id === 'cxc_img')      return cx.criarModalImg(interaction);
    if (id === 'cxc_salvar')   return cx.criarSalvar(interaction);
    if (id === 'cxc_cancelar') return cx.criarCancelar(interaction);
    // Add/Editar item
    if (id === 'cxi_caixa')    return cx.itemSelecionarCaixa(interaction);
    if (id === 'cxi_variante') return cx.itemSelecionarVariante(interaction);
    if (id === 'cxi_raridade') return cx.itemSelecionarRaridade(interaction);
    if (id === 'cxi_chance')   return cx.itemModalChance(interaction);
    if (id === 'cxi_dados')    return cx.itemModalChance(interaction); // legado
    if (id === 'cxi_salvar')   return cx.itemSalvar(interaction);
    if (id === 'cxi_cancelar') return cx.itemCancelar(interaction);
    // Botões inline do listar — roteados para painelAdmin que já tem os handlers
    if (id.startsWith('cxi_add_item_') || id.startsWith('cxi_editar_caixa_') ||
        id.startsWith('cxi_toggle_caixa_') || id.startsWith('cxi_edit_item_') ||
        id.startsWith('cxi_toggle_item_') || id.startsWith('cxi_del_item_') ||
        id.startsWith('cxi_listar_')) {
      const { handlePainelAdmin } = require('../systems/painelAdmin');
      return handlePainelAdmin(interaction, client);
    }
  }

  // ── Saque de coins via PIX ───────────────────────────────────────────────────
  if (id === 'sacar_coins_pix') {
    const { abrirModalSaque } = require('../systems/saqueCoins');
    return abrirModalSaque(interaction);
  }
  if (id.startsWith('saque_aprovar_')) {
    const saqueId = id.replace('saque_aprovar_', '');
    const { aprovarSaque } = require('../systems/saqueCoins');
    return aprovarSaque(interaction, saqueId);
  }
  if (id.startsWith('saque_rejeitar_')) {
    const saqueId = id.replace('saque_rejeitar_', '');
    const { rejeitarSaque } = require('../systems/saqueCoins');
    return rejeitarSaque(interaction, saqueId);
  }

  // ── Resgate de códigos de coins ───────────────────────────────────────────
  if (id === 'resgatar_codigo_coins') {
    const modal = new (require('discord.js').ModalBuilder)()
      .setCustomId('modal_resgatar_codigo')
      .setTitle('🎫 Resgatar Código de Coins');
    modal.addComponents(
      new (require('discord.js').ActionRowBuilder)().addComponents(
        new (require('discord.js').TextInputBuilder)()
          .setCustomId('codigo')
          .setLabel('Digite seu código')
          .setStyle(require('discord.js').TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder('Ex: ABCD-EFGH-IJKL')
          .setMinLength(14)
          .setMaxLength(14),
      ),
    );
    return interaction.showModal(modal);
  }

  if (id === 'ver_saldo_coins') {
    const { Usuarios } = require('../database/database');
    const usuario = Usuarios.garantir(interaction.user.id, interaction.user.username);
    const coins   = usuario.coins || 0;
    const { COIN_EMOJI } = require('../systems/coins');
    const config_ = require('../config');
    return interaction.reply({
      embeds: [new (require('discord.js').EmbedBuilder)()
        .setColor(config_.colors.coins || config_.colors.gold)
        .setTitle(`${COIN_EMOJI} Seu Saldo de Coins`)
        .addFields(
          { name: `${COIN_EMOJI} Coins`, value: `**${coins.toLocaleString('pt-BR')}**`, inline: true },
          { name: '💵 Valor',            value: `**R$ ${(coins * 0.01).toFixed(2)}**`, inline: true },
        )
        .setTimestamp()
        .setFooter({ text: 'Máximo Store • 100 coins = R$ 1,00' })],
      ephemeral: true,
    });
  }

  // ── Painel builder construtor (pb_*) ─────────────────────────────────────
  if (id.startsWith('pb_')) {
    return handlePainelBuilder(interaction, client);
  }

  // ── Painéis de produto publicados (compra/select) ────────────────────────
  if (id.startsWith('painel_selecionar_') || id.startsWith('painel_comprar_var_') || id.startsWith('confirmar_compra_var_') || id === 'cancelar_confirmacao') {
    return painelProdutoHandler(interaction, client);
  }

  // ── Painel admin antigo (painel_*) ───────────────────────────────────────
  if (id.startsWith('painel_')) {
    return painelButtons(interaction, client);
  }

  // ── Loja ────────────────────────────────────────────────────────────────────
  if (id === 'loja_abrir') return mostrarLoja(interaction);
  if (id === 'loja_voltar') return mostrarLoja(interaction);

  // ── Recompra com 1 clique ─────────────────────────────────────────────────────
  if (id.startsWith('recomprar_')) {
    const produtoId = id.replace('recomprar_', '');
    return iniciarCompra(interaction, produtoId);
  }

  // ── Notificar quando voltar estoque ──────────────────────────────────────────
  if (id.startsWith('notif_estoque_')) {
    const varianteId = id.replace('notif_estoque_', '');
    const { db } = require('../database/database');
    const { v4: uuidv4 } = require('uuid');
    try {
      db.prepare('INSERT OR IGNORE INTO notif_estoque (id,usuario_id,variante_id) VALUES (?,?,?)').run(uuidv4(), interaction.user.id, varianteId);
      return interaction.reply({ content: '🔔 Você será notificado no privado quando o estoque voltar!', ephemeral: true });
    } catch {
      return interaction.reply({ content: '⚠️ Você já está na lista de notificações.', ephemeral: true });
    }
  }
  if (id.startsWith('loja_pagina_')) {
    const pagina = parseInt(id.replace('loja_pagina_', ''));
    const { mostrarLoja } = require('../systems/loja');
    return mostrarLoja(interaction, pagina);
  }

  // ── Escolher moeda de pagamento (select menu) ────────────────────────────────
  if (id.startsWith('escolher_moeda_')) {
    const pedidoId = id.replace('escolher_moeda_', '');
    const pedido   = Pedidos.get(pedidoId);
    if (!pedido) return interaction.reply({ content: '❌ Pedido não encontrado.', ephemeral: true });
    if (pedido.status !== 'pendente') return interaction.reply({ content: `⚠️ Pedido já: **${pedido.status}**`, ephemeral: true });
    if (pedido.usuario_id !== interaction.user.id) return interaction.reply({ content: '❌ Este pedido não é seu.', ephemeral: true });

    const { StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
    const { MOEDAS } = require('../systems/stripe');

    const opcoes = [
      new StringSelectMenuOptionBuilder()
        .setValue('BRL')
        .setLabel('🇧🇷 Real Brasileiro (BRL) — PIX')
        .setDescription('💠 Pagar via PIX instantâneo'),
    ];
    for (const [code, info] of Object.entries(MOEDAS)) {
      opcoes.push(
        new StringSelectMenuOptionBuilder()
          .setValue(code)
          .setLabel(`${info.emoji} ${info.nome} (${code})`)
          .setDescription(`${info.simbolo} • Stripe — cartão, wallet, boleto e mais`),
      );
    }

    const selectRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`moeda_select_${pedidoId}`)
        .setPlaceholder('Selecione a moeda de pagamento...')
        .addOptions(opcoes),
    );

    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('💳 Escolher Forma de Pagamento')
        .setDescription([
          `> Selecione a moeda abaixo para prosseguir com o pagamento.`,
          `> **BRL** usa PIX instantâneo.`,
          `> **Outras moedas** usam Stripe (cartão de crédito).`,
          '',
          `💵 **Valor:** R$ ${Number(require('../utils/pedidoGrupo').totalGrupoPedidos(pedido)).toFixed(2)}`,
        ].join('\n'))
        .setFooter({ text: 'Máximo Store • Pagamento seguro' })],
      components: [selectRow],
      ephemeral: true,
    });
  }

  // ── Verificar pagamento Stripe (qualquer moeda) ───────────────────────────────
  if (id.startsWith('verificar_stripe_')) {
    const pedidoId = id.replace('verificar_stripe_', '');
    await interaction.deferReply({ ephemeral: true });
    const pedido = Pedidos.get(pedidoId);
    if (!pedido || pedido.status !== 'pendente') return interaction.editReply({ content: `⚠️ Pedido já: **${pedido?.status || 'não encontrado'}**` });

    const txId = pedido.tx_id;
    if (!txId) return interaction.editReply({ content: '❌ Sem sessão de pagamento registrada.' });

    const consultarId = txId.replace('ST_', '');

    try {
      const stripe = require('../systems/stripe');
      const status = await stripe.consultarSessao(consultarId);
      if (status.pago) {
        const pedidoAtual = Pedidos.get(pedidoId);
        const { marcarGrupoPago } = require('../utils/pedidoGrupo');
        marcarGrupoPago(pedidoAtual || pedido);
        const { processarEntrega } = require('../systems/loja');
        await processarEntrega(Pedidos.get(pedidoId), client);
        if (interaction.message) await interaction.message.delete().catch(() => {});
        return interaction.editReply({ content: '✅ Pagamento confirmado! Produto(s) entregue(s) no privado.' });
      }
      return interaction.editReply({ content: '⏳ Pagamento não confirmado ainda. Complete o pagamento e tente novamente.' });
    } catch (err) {
      console.error('[Stripe Verificar]', err.message);
      return interaction.editReply({ content: `❌ Erro: \`${err.message.slice(0,100)}\`` });
    }
  }

  // ── Pagar com Stripe legado / PayPal legado ────────────────────────────────────
  if (id.startsWith('pagar_stripe_') || id.startsWith('pagar_paypal_') || id.startsWith('verificar_paypal_')) {
    return interaction.reply({ content: '⚠️ Use o botão **💳 Escolher Pagamento** para selecionar a moeda.', ephemeral: true });
  }

  // ── Gerar PIX ao clicar no botão ────────────────────────────────────────────
  if (id.startsWith('gerar_pix_')) {
    const pedidoId = id.replace('gerar_pix_', '');
    const { gerarPixPedido } = require('../systems/loja');
    return gerarPixPedido(interaction, pedidoId, client);
  }

  // ── Pagar com Coins ───────────────────────────────────────────────────────────
  if (id.startsWith('pagar_coins_')) {
    const pedidoId = id.replace('pagar_coins_', '');
    const { pagarComCoins } = require('../systems/loja');
    return pagarComCoins(interaction, pedidoId, client);
  }

  // ── Aceitar compra sem pagamento (liberar manualmente) ───────────────────────
  if (id.startsWith('ticket_aceitar_sem_pag_')) {
    const pedidoId = id.replace('ticket_aceitar_sem_pag_', '');
    if (!podeAceitarCompra(interaction.member)) {
      return interaction.reply({ content: '❌ Apenas quem tem o cargo **Aceitar Compra** pode liberar.', ephemeral: true });
    }
    const { liberarPedidoManual } = require('../systems/loja');
    return liberarPedidoManual(interaction, pedidoId, client);
  }

  // ── Boleto ───────────────────────────────────────────────────────────────────
  if (id.startsWith('comprar_boleto_')) {
    const produtoId = id.replace('comprar_boleto_', '');
    const { iniciarCompraBoleto } = require('../systems/loja');
    return iniciarCompraBoleto(interaction, produtoId);
  }

  // ── Comprar direto PIX ───────────────────────────────────────────────────────
  if (id.startsWith('comprar_')) {
    const produtoId = id.replace('comprar_', '');
    return iniciarCompra(interaction, produtoId);
  }

  // ── Verificar PIX ────────────────────────────────────────────────────────────
  if (id.startsWith('verificar_pix_')) {
    const pedidoId = id.replace('verificar_pix_', '');
    await interaction.deferReply({ ephemeral: true });
    const pedido = Pedidos.get(pedidoId);
    if (!pedido) return interaction.editReply({ content: '❌ Pedido não encontrado.' });
    if (pedido.status !== 'pendente') return interaction.editReply({ content: `✅ Pedido já está como: **${pedido.status}**` });

    // Deletar a mensagem do QR Code (a mensagem que contém o botão verificar)
    if (interaction.message) {
      await interaction.message.delete().catch(() => {});
    }

    if (pedido.tx_id && !pedido.tx_id.startsWith('SIM_')) {
      try {
        const status = await efi.consultarCobranca(pedido.tx_id);
        if (status.pago) {
          // Marcar pedido como pago e entregar
          const { marcarGrupoPago } = require('../utils/pedidoGrupo');
          marcarGrupoPago(pedido);
          const pedidoAtualizado = Pedidos.get(pedidoId);
          const { processarEntrega } = require('../systems/loja');
          await processarEntrega(pedidoAtualizado, client);
          return interaction.editReply({ content: '✅ Pagamento confirmado! Produto entregue no seu privado.' });
        } else {
          return interaction.editReply({ content: '⏳ Pagamento ainda não identificado. Aguarde alguns segundos e tente novamente.' });
        }
      } catch (e) {
        console.error('[VerificarPix]', e.message);
        return interaction.editReply({ content: `❌ Erro ao verificar pagamento: \`${e.message.slice(0,100)}\`\nTente novamente em instantes.` });
      }
    } else {
      return interaction.editReply({ content: '⏳ Verificação automática ativa. Seu produto será entregue assim que o pagamento for confirmado.' });
    }
  }

  // ── Informar código de vendedor/afiliado no pedido ───────────────────────────
  if (id.startsWith('informar_vendedor_')) {
    const pedidoId = id.replace('informar_vendedor_', '');
    const pedido   = Pedidos.get(pedidoId);
    if (!pedido) return interaction.reply({ content: '❌ Pedido não encontrado.', ephemeral: true });
    if (pedido.usuario_id !== interaction.user.id) return interaction.reply({ content: '❌ Este pedido não é seu.', ephemeral: true });
    if (pedido.status !== 'pendente') return interaction.reply({ content: '⚠️ Pedido não está mais pendente.', ephemeral: true });

    // Verificar se já tem vendedor e mostrar quem é
    let descricaoAtual = '';
    if (pedido.afiliado_id) {
      const vendedor = db.prepare('SELECT nome, codigo_afil FROM usuarios WHERE discord_id=?').get(pedido.afiliado_id);
      descricaoAtual = `\n\n> ✅ Vendedor atual: **${vendedor?.nome || pedido.afiliado_id}** (\`${vendedor?.codigo_afil || '—'}\`)\n> Informe um novo código para substituir.`;
    }

    const modal = new ModalBuilder()
      .setCustomId(`modal_vendedor_${pedidoId}`)
      .setTitle('🤝 Código do Vendedor');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('codigo')
          .setLabel('Código do vendedor (deixe vazio para remover)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setPlaceholder('Ex: AB12CD34')
          .setMaxLength(20),
      ),
    );
    return interaction.showModal(modal);
  }

  // ── Painel do afiliado (canal fixo) ──────────────────────────────────────────
  if (id === 'afil_ranking') {
    const { mostrarRankingAfiliados } = require('../systems/afiliados');
    return mostrarRankingAfiliados(interaction);
  }

  if (id === 'afil_acessar_painel') {
    const modal = new ModalBuilder().setCustomId('modal_afil_acesso').setTitle('🔑 Acessar Painel de Afiliado');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('codigo')
          .setLabel('Seu código de ACESSO ao painel')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder('Código fornecido pelo admin'),
      ),
    );
    return interaction.showModal(modal);
  }

  if (id.startsWith('afil_solicitar_saque_')) {
    const afilId = id.replace('afil_solicitar_saque_', '');
    if (interaction.user.id !== afilId) return interaction.reply({ content: '❌ Você só pode solicitar saque do seu próprio painel.', ephemeral: true });
    const { solicitarSaque } = require('../systems/afiliados');
    return solicitarSaque(interaction, afilId);
  }

  if (id.startsWith('afil_historico_')) {
    const afilId = id.replace('afil_historico_', '');
    if (interaction.user.id !== afilId) return interaction.reply({ content: '❌ Você só pode ver o seu próprio histórico.', ephemeral: true });
    const { mostrarHistoricoAfiliado } = require('../systems/afiliados');
    return mostrarHistoricoAfiliado(interaction, afilId);
  }

  if (id.startsWith('afil_registrar_n2_')) {
    const superiorId = id.replace('afil_registrar_n2_', '');
    if (interaction.user.id !== superiorId) return interaction.reply({ content: '❌ Você só pode registrar afiliados no seu próprio painel.', ephemeral: true });
    const modal = new ModalBuilder().setCustomId(`modal_afil_reg_n2_${superiorId}`).setTitle('➕ Registrar Afiliado N2');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('discord_id').setLabel('Discord ID do afiliado N2').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: 1234567890123456789'),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('codigo_acesso').setLabel('Código de acesso (para entrar no painel)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: PEDRO2025').setMaxLength(20),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('codigo_vendas').setLabel('Código de vendas (para o ticket)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: PEDRO10').setMaxLength(20),
      ),
    );
    return interaction.showModal(modal);
  }

  // ── Submenu de saque (saque_campo_*, saque_confirmar, saque_cancelar) ───────
  if (id.startsWith('saque_')) {
    const sq = require('../systems/saqueSubmenu');
    if (id === 'saque_campo_valor')   return sq.modalValor(interaction);
    if (id === 'saque_campo_nome')    return sq.modalNome(interaction);
    if (id === 'saque_campo_tipo')    return sq.modalTipoPix(interaction);
    if (id === 'saque_campo_chave')   return sq.modalChavePix(interaction);
    if (id === 'saque_confirmar')     return sq.confirmarSaque(interaction);
    if (id === 'saque_cancelar')      return sq.cancelarSaque(interaction);
  }

  // ── Aprovar saque de afiliado ─────────────────────────────────────────────────
  if (id.startsWith('afil_aprovar_saque_')) {
    const { isAdmin } = require('../utils/permissions');
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Apenas admins.', ephemeral: true });
    // formato: afil_aprovar_saque_{afilId}_{valor}
    const partes  = id.replace('afil_aprovar_saque_', '').split('_');
    const afilId  = partes[0];
    const valor   = parseFloat(partes[1] || '0');
    await interaction.deferReply({ ephemeral: true });
    const usuario = db.prepare('SELECT * FROM usuarios WHERE discord_id=?').get(afilId);
    if (!usuario) return interaction.editReply({ content: '❌ Usuário não encontrado.' });
    if (valor > (usuario.saldo || 0)) return interaction.editReply({ content: '❌ Saldo insuficiente no momento.' });
    db.prepare('UPDATE usuarios SET saldo=saldo-? WHERE discord_id=?').run(valor, afilId);
    // Notificar afiliado
    try {
      const membro = await interaction.guild.members.fetch(afilId).catch(() => null);
      if (membro) await membro.send({ embeds: [new EmbedBuilder().setColor(0x00D26A).setTitle('💸 Saque Aprovado!').setDescription(`> Seu saque de **R$ ${valor.toFixed(2)}** foi aprovado e será enviado via PIX!`).setTimestamp().setFooter({ text: 'Máximo Store • Afiliados' })] }).catch(() => {});
    } catch {}
    // Desabilitar botões na mensagem
    await interaction.message.edit({ components: [] }).catch(() => {});
    const { log } = require('../utils/logger');
    await log('sistema', { executor: interaction.user.id, descricao: `✅ Saque aprovado: R$ ${valor.toFixed(2)} para <@${afilId}>` });
    return interaction.editReply({ content: `✅ Saque de **R$ ${valor.toFixed(2)}** aprovado para <@${afilId}>! Saldo debitado.` });
  }

  // ── Rejeitar saque de afiliado ────────────────────────────────────────────────
  if (id.startsWith('afil_rejeitar_saque_')) {
    const { isAdmin } = require('../utils/permissions');
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Apenas admins.', ephemeral: true });
    const afilId = id.replace('afil_rejeitar_saque_', '').split('_')[0];
    await interaction.deferReply({ ephemeral: true });
    try {
      const membro = await interaction.guild.members.fetch(afilId).catch(() => null);
      if (membro) await membro.send({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setTitle('❌ Saque Rejeitado').setDescription('> Seu pedido de saque foi rejeitado. Entre em contato com o suporte.').setTimestamp().setFooter({ text: 'Máximo Store • Afiliados' })] }).catch(() => {});
    } catch {}
    await interaction.message.edit({ components: [] }).catch(() => {});
    return interaction.editReply({ content: `✅ Saque de <@${afilId}> rejeitado. Saldo mantido.` });
  }

  if (id.startsWith('afil_gerar_codigo_')) {    const afilId = id.replace('afil_gerar_codigo_', '');
    if (interaction.user.id !== afilId) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
    const modal = new ModalBuilder().setCustomId(`modal_afil_novo_codigo_${afilId}`).setTitle('🔄 Gerar Novo Código de Vendas');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('codigo').setLabel('Novo código de vendas').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: ALAN20').setMaxLength(20),
      ),
    );
    return interaction.showModal(modal);
  }

  // ── Aplicar cupom no pedido ───────────────────────────────────────────────────
  if (id.startsWith('aplicar_cupom_')) {
    const pedidoId = id.replace('aplicar_cupom_', '');
    const pedido   = Pedidos.get(pedidoId);
    if (!pedido) return interaction.reply({ content: '❌ Pedido não encontrado.', ephemeral: true });
    if (pedido.usuario_id !== interaction.user.id) return interaction.reply({ content: '❌ Este pedido não é seu.', ephemeral: true });
    if (pedido.status !== 'pendente') return interaction.reply({ content: '⚠️ Pedido não está mais pendente.', ephemeral: true });
    if (pedido.cupom_usado) return interaction.reply({ content: `⚠️ Cupom **${pedido.cupom_usado}** já aplicado neste pedido.`, ephemeral: true });

    const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
    const modal = new ModalBuilder()
      .setCustomId(`modal_ticket_cupom_${pedidoId}`)
      .setTitle('🎟️ Aplicar Cupom');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('codigo')
          .setLabel('Código do cupom')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder('Ex: PROMO10'),
      ),
    );
    return interaction.showModal(modal);
  }

  // ── Alterar quantidade na confirmação (DEVE VIR ANTES do alterar_qtd_) ──────
  if (id.startsWith('alterar_qtd_confirm_')) {
    return painelProdutoHandler(interaction, client);
  }

  // ── Alterar quantidade do pedido ─────────────────────────────────────────────
  if (id.startsWith('alterar_qtd_')) {
    const pedidoId = id.replace('alterar_qtd_', '');
    const pedido   = Pedidos.get(pedidoId);
    if (!pedido) return interaction.reply({ content: '❌ Pedido não encontrado.', ephemeral: true });
    if (pedido.usuario_id !== interaction.user.id) return interaction.reply({ content: '❌ Este pedido não é seu.', ephemeral: true });
    if (pedido.status !== 'pendente') return interaction.reply({ content: '⚠️ Pedido não está mais pendente.', ephemeral: true });

    const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
    const modal = new ModalBuilder()
      .setCustomId(`modal_alterar_qtd_${pedidoId}`)
      .setTitle('🔢 Alterar Quantidade');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('quantidade')
          .setLabel('Nova quantidade (mínimo 1)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(3)
          .setPlaceholder('Ex: 2'),
      ),
    );
    return interaction.showModal(modal);
  }

  // ── Cancelar pedido ──────────────────────────────────────────────────────────
  if (id.startsWith('cancelar_pedido_') || id.startsWith('cancelar_pix_')) {
    const pedidoId = id.replace('cancelar_pedido_', '').replace('cancelar_pix_', '');
    const pedido = Pedidos.get(pedidoId);
    if (!pedido) return interaction.reply({ content: '❌ Pedido não encontrado.', ephemeral: true });
    if (pedido.usuario_id !== interaction.user.id && !isStaff(interaction.member)) {
      return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
    }
    if (pedido.status !== 'pendente') return interaction.reply({ content: '⚠️ Este pedido não pode ser cancelado.', ephemeral: true });

    // Confirmação antes de cancelar
    const { totalGrupoPedidos, descricaoGrupoPedidos } = require('../utils/pedidoGrupo');
    const rowConf = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`conf_cancelar_${pedidoId}`).setLabel('✅ Sim, cancelar').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`nao_cancelar_${pedidoId}`).setLabel('❌ Não, voltar').setStyle(ButtonStyle.Secondary),
    );
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(config.colors.warning)
        .setTitle('⚠️ Confirmar Cancelamento')
        .setDescription([
          `> Tem certeza que deseja cancelar este pedido?`,
          `> Esta ação não pode ser desfeita.`,
        ].join('\n'))
        .addFields(
          { name: '📦 Produto', value: descricaoGrupoPedidos(pedido) || '—', inline: true },
          { name: '💵 Valor',   value: `R$ ${Number(totalGrupoPedidos(pedido)).toFixed(2)}`, inline: true },
        )
        .setTimestamp()],
      components: [rowConf],
      ephemeral: true,
    });
  }

  // ── Confirmar cancelamento ────────────────────────────────────────────────────
  if (id.startsWith('conf_cancelar_')) {
    const pedidoId = id.replace('conf_cancelar_', '');
    const pedido = Pedidos.get(pedidoId);
    if (!pedido || pedido.status !== 'pendente') return interaction.reply({ content: '⚠️ Pedido não pode mais ser cancelado.', ephemeral: true });
    if (pedido.usuario_id !== interaction.user.id && !isStaff(interaction.member)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });

    const { marcarGrupoCancelado } = require('../utils/pedidoGrupo');
    marcarGrupoCancelado(pedido, interaction.user.id, 'Cancelado pelo usuário');

    // Fechar o ticket se existir
    if (pedido.ticket_id) {
      const { Tickets } = require('../database/database');
      const ticket = Tickets.get(pedido.ticket_id);
      if (ticket && ticket.status === 'aberto') {
        const canalTicket = interaction.guild?.channels.cache.get(pedido.ticket_id);
        if (canalTicket) {
          await canalTicket.send({
            embeds: [new EmbedBuilder().setColor(config.colors.error).setTitle('❌ Pedido Cancelado').setDescription('O pedido foi cancelado pelo comprador.').setTimestamp()],
          }).catch(() => {});
          setTimeout(() => canalTicket.delete().catch(() => {}), 5000);
        }
        Tickets.atualizar(pedido.ticket_id, { status: 'fechado', fechado_por: interaction.user.id, motivo: 'Cancelado', fechado_em: Math.floor(Date.now()/1000) });
      }
    }
    return interaction.update({ content: '✅ Pedido cancelado com sucesso.', embeds: [], components: [] });
  }

  if (id.startsWith('nao_cancelar_')) {
    return interaction.update({ content: '✅ Cancelamento abortado. Seu pedido continua ativo.', embeds: [], components: [] });
  }
  // ── Confirmar entrega → fecha ticket ─────────────────────────────────────────
  if (id.startsWith('confirmar_entrega_')) {
    const pedidoId = id.replace('confirmar_entrega_', '');
    const pedido = Pedidos.get(pedidoId);
    if (!pedido || pedido.usuario_id !== interaction.user.id) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
    if (pedido.status === 'entregue') return interaction.reply({ content: '✅ Entrega já confirmada!', ephemeral: true });

    Pedidos.atualizar(pedidoId, { status: 'entregue', entregue_em: Math.floor(Date.now()/1000) });

    await interaction.reply({ content: '✅ Recebimento confirmado! Obrigado pela compra. 🎉', ephemeral: true });

    // Fechar ticket automaticamente se existir
    if (pedido.ticket_id) {
      const { Tickets } = require('../database/database');
      const ticket = Tickets.get(pedido.ticket_id);
      if (ticket && ticket.status === 'aberto') {
        Tickets.atualizar(pedido.ticket_id, {
          status:     'fechado',
          fechado_por: interaction.user.id,
          motivo:     'Entrega confirmada pelo comprador',
          fechado_em: Math.floor(Date.now() / 1000),
        });
        const canalTicket = interaction.guild?.channels.cache.get(pedido.ticket_id);
        if (canalTicket) {
          await canalTicket.send({
            embeds: [new EmbedBuilder()
              .setColor(config.colors.success)
              .setTitle('✅ Entrega Confirmada')
              .setDescription(`<@${interaction.user.id}> confirmou o recebimento do produto.\nTicket encerrado automaticamente.`)
              .setTimestamp()],
          }).catch(() => {});
          setTimeout(() => canalTicket.delete().catch(() => {}), 5000);
        }

        // Notificar staff no canal de logs
        try {
          const { log } = require('../utils/logger');
          const produto = Produtos.get(pedido.produto_id);
          await log('pagamento', {
            usuario:    pedido.usuario_id,
            pedidoId:   pedido.id,
            produto:    produto?.nome,
            valor:      pedido.valor_total,
            descricao:  `✅ <@${pedido.usuario_id}> confirmou recebimento — ${produto?.nome || 'Produto'} — R$ ${Number(pedido.valor_total).toFixed(2)}`,
          });
        } catch {}
      }
    }
    return;
  }

  // ── Solicitar reembolso — removido (sem reembolso) ──────────────────────────
  if (id.startsWith('solicitar_reembolso_')) {
    return interaction.reply({ content: '❌ Esta loja não oferece reembolsos. Entre em contato com o suporte pelo ticket.', ephemeral: true });
  }

  // ── Avaliar produto ──────────────────────────────────────────────────────────
  if (id.startsWith('avaliar_')) {
    const pedidoId = id.replace('avaliar_', '');
    const modal = new ModalBuilder().setCustomId(`modal_avaliacao_${pedidoId}`).setTitle('⭐ Avaliar Produto');
    const nota = new TextInputBuilder().setCustomId('nota').setLabel('Nota (1 a 5)').setStyle(TextInputStyle.Short).setRequired(true).setMinLength(1).setMaxLength(1).setPlaceholder('Ex: 5');
    const comentario = new TextInputBuilder().setCustomId('comentario').setLabel('Comentário (opcional)').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(300);
    modal.addComponents(new ActionRowBuilder().addComponents(nota), new ActionRowBuilder().addComponents(comentario));
    return interaction.showModal(modal);
  }

  // ── Avaliação de ticket — redireciona para modal de avaliação unificado ──────
  if (id.startsWith('aval_ticket_')) {
    const parts    = id.split('_');
    const nota     = parseInt(parts[parts.length - 1]);
    const ticketId = parts.slice(2, parts.length - 1).join('_');
    // Salvar nota no banco
    db.prepare("UPDATE tickets SET avaliacao=? WHERE id=?").run(nota, ticketId);
    // Publicar no webhook de avaliações
    try {
      const { WebhookClient, EmbedBuilder: EB } = require('discord.js');
      const hook  = new WebhookClient({ url: 'https://discord.com/api/webhooks/1544916846371672138/PbUH8Q_bYhoWuaNKPkgIcweud8UDCbMjMlwPpI6f1eb1hv8SGdE1Lvjg-7YW7FGs9AGa' });
      const stars = '⭐'.repeat(nota) + '☆'.repeat(5 - nota);
      const cor   = nota >= 4 ? 0x57F287 : nota === 3 ? 0xFEE75C : 0xED4245;
      const avatar = interaction.user.displayAvatarURL({ size: 64 });
      const embed = new EB()
        .setColor(cor)
        .setAuthor({ name: interaction.user.username, iconURL: avatar })
        .setTitle(`${stars} Avaliação de Atendimento`)
        .addFields(
          { name: '⭐ Nota',    value: `**${nota}/5**`,                                   inline: true },
          { name: '🎫 Ticket', value: `\`${ticketId.slice(0,8).toUpperCase()}\``,        inline: true },
        )
        .setTimestamp()
        .setFooter({ text: 'Máximo Store • Avaliações de Atendimento' });
      await hook.send({ embeds: [embed] }).catch(() => {});
    } catch {}
    return interaction.reply({ content: `⭐ Avaliação **${nota}/5** registrada! Obrigado pelo feedback.`, ephemeral: true });
  }

  // ── Carrinho ─────────────────────────────────────────────────────────────────
  if (id === 'carrinho_ver') return mostrarCarrinho(interaction);
  if (id === 'carrinho_limpar') {
    limparCarrinho(interaction.user.id);
    return interaction.reply({ content: '🗑️ Carrinho limpo!', ephemeral: true });
  }
  if (id.startsWith('carrinho_add_')) {
    const produtoId = id.replace('carrinho_add_', '');
    const { ok, erro, produto } = adicionarAoCarrinho(interaction.user.id, produtoId);
    return interaction.reply({ content: ok ? `✅ **${produto.nome}** adicionado ao carrinho!` : `❌ ${erro}`, ephemeral: true });
  }
  if (id.startsWith('carrinho_remover_')) {
    const produtoId = id.replace('carrinho_remover_', '');
    removerDoCarrinho(interaction.user.id, produtoId);
    return interaction.reply({ content: '✅ Item removido do carrinho.', ephemeral: true });
  }
  // ── Carrinho multi-variante (cvar_*) ──────────────────────────────────────────
  if (id.startsWith('cvar_')) {
    const cv = require('../systems/carrinhoVariante');

    // Adicionar item ao carrinho
    if (id.startsWith('cvar_add_')) {
      const varianteId = id.replace('cvar_add_', '');
      // Pegar qty da sessão do painelProdutoHandler
      const handler = require('../handlers/painelProdutoHandler');
      const qtdSessao = handler.qtdSessao;
      const sessao = qtdSessao?.get(interaction.user.id) || { qtd: 1 };
      const qtd    = sessao.qtd || 1;
      const { ok, erro, total } = cv.adicionarItem(interaction.user.id, varianteId, qtd);
      if (!ok) return interaction.reply({ content: `❌ ${erro}`, ephemeral: true });

      const embed = cv.buildCarrinhoEmbed(interaction.user.id);
      const rows  = cv.buildCarrinhoRows(interaction.user.id);
      return interaction.update({ embeds: [embed], components: rows });
    }

    // Mostrar carrinho
    if (id === 'cvar_ver') {
      return cv.mostrarCarrinhoVariante(interaction);
    }

    // Continuar comprando — fecha o carrinho (a pessoa vai no canal escolher mais)
    if (id === 'cvar_continuar') {
      return interaction.update({
        content: '✅ Itens salvos no carrinho! Continue escolhendo produtos nos canais da loja.\nUse **🛒 Ver Carrinho** ou clique em **🛒 Add ao Carrinho** em qualquer produto.',
        embeds: [],
        components: [],
      });
    }

    // Finalizar carrinho
    if (id === 'cvar_finalizar') {
      await interaction.deferUpdate().catch(() => {});
      return cv.finalizarCarrinho(interaction, client);
    }

    // Limpar carrinho
    if (id === 'cvar_limpar') {
      cv.limparCarrinhoVariante(interaction.user.id);
      return interaction.update({ content: '🗑️ Carrinho limpo.', embeds: [], components: [] });
    }

    // Remover item individual (botão direto)
    if (id.startsWith('cvar_remover_')) {
      const varianteId = id.replace('cvar_remover_', '');
      cv.removerItem(interaction.user.id, varianteId);
      const embed = cv.buildCarrinhoEmbed(interaction.user.id);
      if (!embed) return interaction.update({ content: '🛒 Carrinho vazio.', embeds: [], components: [] });
      return interaction.update({ embeds: [embed], components: cv.buildCarrinhoRows(interaction.user.id) });
    }
  }

  if (id === 'carrinho_comprar_tudo') {
    await interaction.deferReply({ ephemeral: true });
    const { iniciarCompraCarrinho } = require('../systems/loja');
    return iniciarCompraCarrinho(interaction, client);
  }

  // ── Tickets ──────────────────────────────────────────────────────────────────
  if (id === 'ticket_fechar') {
    const { Tickets } = require('../database/database');
    const { isAdmin } = require('../utils/permissions');
    const ticket = Tickets.get(interaction.channel?.id);
    if (ticket) {
      const assumido = ticket.atendente;
      const ehAdmin  = isAdmin(interaction.member);
      const ehOwner  = interaction.member?.roles?.cache?.has(config.roles.owner);
      // Só pode fechar: quem assumiu, admin ou owner
      if (assumido && assumido !== interaction.user.id && !ehAdmin && !ehOwner) {
        return interaction.reply({ content: `❌ Apenas <@${assumido}> (que assumiu o ticket) pode fechá-lo.`, ephemeral: true });
      }
      if (!assumido) {
        // Ninguém assumiu — só staff consegue fechar
        if (!podeVerTickets(interaction.member)) {
          return interaction.reply({ content: '❌ Apenas cargo Suporte+ pode fechar tickets.', ephemeral: true });
        }
      }
    }
    return fecharTicket(interaction);
  }
  if (id === 'ticket_assumir') {
    if (!podeVerTickets(interaction.member)) {
      return interaction.reply({ content: '❌ Apenas cargo Suporte+ pode assumir tickets.', ephemeral: true });
    }
    return assumirTicket(interaction);
  }
  if (id === 'ticket_transcript') return gerarTranscript(interaction);

  if (id.startsWith('ticket_pagar_')) {
    const pedidoId = id.replace('ticket_pagar_', '');
    const pedido = Pedidos.get(pedidoId);
    if (!pedido) return interaction.reply({ content: '❌ Pedido não encontrado.', ephemeral: true });
    const produto = Produtos.get(pedido.produto_id);
    return iniciarCompra(interaction, pedido.produto_id);
  }

  if (id === 'ticket_banir_fraude') {
    if (!isStaff(interaction.member)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
    const ticket = require('../database/database').Tickets.get(interaction.channel.id);
    if (!ticket) return interaction.reply({ content: '❌ Não é um ticket.', ephemeral: true });
    const { bloquearPorFraude } = require('../systems/antiFraude');
    await bloquearPorFraude(ticket.usuario_id, `Marcado como fraude por ${interaction.user.tag}`);
    await interaction.reply({ content: `🚫 <@${ticket.usuario_id}> bloqueado por fraude.` });
    return fecharTicket(interaction, 'Bloqueado por fraude');
  }

  // ── Caixas Misteriosas ───────────────────────────────────────────────────────
  if (id === 'caixas_listar') {
    const { menuCaixas } = require('../systems/caixaMisteriosa');
    return menuCaixas(interaction);
  }
  if (id === 'caixa_historico' || id === 'historico_caixa') {
    const { mostrarHistorico } = require('../systems/caixaMisteriosa');
    return mostrarHistorico(interaction);
  }

  // ── Afiliados ────────────────────────────────────────────────────────────────
  if (id === 'perfil_ver') {
    const usuario = Usuarios.garantir(interaction.user.id, interaction.user.username);
    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => interaction.member);
    return interaction.reply({ embeds: [Embeds.perfil(usuario, member)], ephemeral: true });
  }
  if (id === 'afiliado_sacar') return solicitarSaque(interaction);
  if (id === 'afiliado_historico') {
    await interaction.deferReply({ ephemeral: true });
    const hist = db.prepare(`
      SELECT t.*, p.nome as produto_nome FROM transacoes t
      LEFT JOIN pedidos p ON t.ref_id = p.id
      WHERE t.usuario_id = ? AND t.descricao LIKE '%Comissão%'
      ORDER BY t.criado_em DESC LIMIT 10
    `).all(interaction.user.id);
    if (!hist.length) return interaction.editReply({ content: '📜 Nenhuma comissão recebida ainda.' });
    const linhas = hist.map(h => `💰 R$ ${h.valor.toFixed(2)} — ${h.descricao}`);
    return interaction.editReply({ content: `**💸 Histórico de Comissões:**\n\n${linhas.join('\n')}` });
  }

  // ── Saldo ─────────────────────────────────────────────────────────────────
  if (id === 'saldo_historico_completo') {
    const config_ = require('../config');
    const moment_ = require('moment-timezone');
    await interaction.deferReply({ ephemeral: true });
    const { EmbedBuilder: EB } = require('discord.js');
    const rows = db.prepare('SELECT * FROM transacoes WHERE usuario_id=? ORDER BY criado_em DESC LIMIT 20').all(interaction.user.id);
    if (!rows.length) return interaction.editReply({ content: '📜 Nenhuma transação.' });
    const embed = new EB()
      .setColor(config_.colors.primary).setTitle('💳 Histórico Completo de Saldo').setTimestamp();
    for (const t of rows) {
      const sinal = t.tipo === 'credito' ? '🟢 +' : '🔴 -';
      const data  = moment_.unix(t.criado_em).tz(config_.timezone).format('DD/MM/YY HH:mm');
      embed.addFields({ name: `${sinal}R$ ${Number(t.valor).toFixed(2)} — ${data}`, value: t.descricao || 'Sem descrição', inline: false });
    }
    return interaction.editReply({ embeds: [embed] });
  }

  // ── Comprar caixa misteriosa (pelo botão gerado no selectMenu) ───────────
  if (id.startsWith('comprar_caixa_')) {
    const caixaId = id.replace('comprar_caixa_', '');
    const { iniciarCompraCaixa } = require('../systems/caixaMisteriosa');
    return iniciarCompraCaixa(interaction, caixaId, client);
  }
};

async function mostrarLoja(interaction) {
  const { mostrarLoja: ml } = require('../systems/loja');
  return ml(interaction);
}
