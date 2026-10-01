const { Pedidos, Produtos, db } = require('../database/database');
const { iniciarCompra } = require('../systems/loja');
const { handlePainelModals } = require('../systems/painelProduto');
const { handlePainelAdminModals } = require('../systems/painelAdmin');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');

// Webhook de avaliações — instância global reutilizável
const { WebhookClient } = require('discord.js');
const _webhookAvaliacoes = new WebhookClient({ url: 'https://discord.com/api/webhooks/1544916846371672138/PbUH8Q_bYhoWuaNKPkgIcweud8UDCbMjMlwPpI6f1eb1hv8SGdE1Lvjg-7YW7FGs9AGa' });

module.exports = async (interaction, client) => {
  const id = interaction.customId;

  // ── Modal do painel público 2FA ─────────────────────────────────────────────
  if (id === 'public_2fa_modal') {
    const { generate2FACodeFromSecret } = require('../2fa');
    const secret = interaction.fields.getTextInputValue('secret').trim();

    if (!secret) {
      return interaction.reply({ content: '❌ Informe a chave secreta antes de gerar o código.', ephemeral: true });
    }

    try {
      const codigo = generate2FACodeFromSecret(secret, '2FA');
      return interaction.reply({
        content: `🔐 Código gerado\n\n\`\`\`\n${codigo.token}\n\`\`\`\n\n⏳ Expira em: **${codigo.remaining}s**`,
        ephemeral: true,
      });
    } catch (error) {
      return interaction.reply({ content: `❌ ${error.message}`, ephemeral: true });
    }
  }

  // ── Modal fechar ticket ───────────────────────────────────────────────────
  if (id.startsWith('modal_fechar_ticket_')) {
    const motivo = interaction.fields.getTextInputValue('motivo').trim();
    const { fecharTicket } = require('../systems/tickets');
    return fecharTicket(interaction, motivo);
  }

  // ── Modal quantidade na tela de confirmação ──────────────────────────────
  if (id.startsWith('modal_qtd_confirm_')) {
    const handler = require('../handlers/painelProdutoHandler');
    return handler(interaction, client);
  }

  // ── Modal Saque de Coins ──────────────────────────────────────────────────
  if (id === 'modal_saque_coins') {
    const { processarSolicitacaoSaque } = require('../systems/saqueCoins');
    return processarSolicitacaoSaque(interaction);
  }

  else if (id.startsWith('modal_rejeitar_saque_')) {
    const saqueId = id.replace('modal_rejeitar_saque_', '');
    const { processarRejeicaoSaque } = require('../systems/saqueCoins');
    return processarRejeicaoSaque(interaction, saqueId);
  }

  // ── Modais do painel admin central (pam_*) ────────────────────────────────
  if (id.startsWith('pam_')) {
    return handlePainelAdminModals(interaction, client);
  }

  // ── Modais do submenu criar/editar carrinho (ccm_*) ───────────────────────
  if (id.startsWith('ccm_')) {
    const cc = require('../systems/criarCarrinhoSub');
    switch (id) {
      case 'ccm_canal':     return cc.processarCanal(interaction);
      case 'ccm_titulo':    return cc.processarTitulo(interaction);
      case 'ccm_descricao': return cc.processarDescricao(interaction);
      case 'ccm_imagem':    return cc.processarImagem(interaction);
      case 'ccm_thumbnail': return cc.processarThumbnail(interaction);
      case 'ccm_add_plano': return cc.processarAddPlano(interaction);
    }
    return;
  }

  // ── Modais dos submenus admin (apm_*, aem_*, cum_*) ──────────────────────
  if (id.startsWith('apm_') || id.startsWith('aem_') || id.startsWith('cum_')) {
    const sub = require('../systems/adminSubmenus');
    if (id === 'apm_dados') return sub.planoProcessarDados(interaction);
    if (id === 'aem_slot1') return sub.estoqueProcessarSlot(interaction, 1);
    if (id === 'aem_slot2') return sub.estoqueProcessarSlot(interaction, 2);
    if (id === 'aem_slot3') return sub.estoqueProcessarSlot(interaction, 3);
    if (id === 'aem_slot4') return sub.estoqueProcessarSlot(interaction, 4);
    if (id === 'cum_codigo')   return sub.cupomProcessar(interaction, 'codigo');
    if (id === 'cum_valor')    return sub.cupomProcessar(interaction, 'valor');
    if (id === 'cum_validade') return sub.cupomProcessar(interaction, 'validade');
    if (id === 'cum_limite')   return sub.cupomProcessar(interaction, 'limite');
    if (id === 'cum_lojas')    return sub.cupomProcessar(interaction, 'lojas');
    return;
  }

  // ── Modais da caixa misteriosa (cxm_*) ────────────────────────────────────
  if (id.startsWith('cxm_')) {
    const cx = require('../systems/caixaSubmenu');
    if (id === 'cxm_nome')       return cx.criarProcessarNome(interaction);
    if (id === 'cxm_canal')      return cx.criarProcessarCanal(interaction);
    if (id === 'cxm_desc')       return cx.criarProcessarDesc(interaction);
    if (id === 'cxm_img')        return cx.criarProcessarImg(interaction);
    if (id === 'cxm_chance')     return cx.itemProcessarChance(interaction);
    // legado — mantém compatibilidade com sessões abertas antes da atualização
    if (id === 'cxm_item_dados') return cx.itemProcessarChance(interaction);
    return;
  }

  // ── Modal código do vendedor no pedido ───────────────────────────────────────
  if (id.startsWith('modal_vendedor_')) {
    const pedidoId = id.replace('modal_vendedor_', '');
    const codigo   = interaction.fields.getTextInputValue('codigo').trim();
    const { Pedidos, db } = require('../database/database');
    const pedido = Pedidos.get(pedidoId);
    if (!pedido || pedido.status !== 'pendente') {
      return interaction.reply({ content: '❌ Pedido não encontrado ou não está pendente.', ephemeral: true });
    }

    // Remover vendedor
    if (!codigo) {
      db.prepare('UPDATE pedidos SET afiliado_id=NULL, comissao_afil=0 WHERE id=?').run(pedidoId);
      return interaction.reply({ content: '✅ Código de vendedor removido do pedido.', ephemeral: true });
    }

    const { vincularCodigoAoPedido } = require('../systems/afiliados');
    const { ok, erro, afiliado } = vincularCodigoAoPedido(pedidoId, codigo, interaction.user.id);
    if (!ok) return interaction.reply({ content: erro, ephemeral: true });

    // Recalcular comissão estimada e salvar
    const { Config } = require('../database/database');
    const taxa = parseFloat(Config.get('taxa_afiliado') || '5');
    const comissaoEstimada = pedido.valor_total * taxa / 100;
    db.prepare('UPDATE pedidos SET comissao_afil=? WHERE id=?').run(comissaoEstimada, pedidoId);

    // Atualizar a mensagem do ticket com o novo vendedor
    try {
      const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
      const canalTicket = interaction.guild?.channels.cache.get(pedido.ticket_id);
      if (canalTicket) {
        const msgs = await canalTicket.messages.fetch({ limit: 5 }).catch(() => null);
        const msgTicket = msgs?.find(m => m.author.id === interaction.client.user.id && m.embeds.length > 0);
        if (msgTicket) {
          const embedAtual = EmbedBuilder.from(msgTicket.embeds[0]);
          // Remover campo vendedor anterior se existir
          const fieldsLimpos = (embedAtual.data.fields || []).filter(f => f.name !== '🤝 Vendedor');
          fieldsLimpos.push({ name: '🤝 Vendedor', value: `<@${afiliado.discord_id}> (\`${afiliado.codigo_afil}\`)`, inline: true });
          embedAtual.setFields(fieldsLimpos);
          await msgTicket.edit({ embeds: [embedAtual] }).catch(() => {});
        }
      }
    } catch {}

    return interaction.reply({
      content: `✅ Vendedor **${afiliado.nome || afiliado.discord_id}** (\`${afiliado.codigo_afil}\`) vinculado ao pedido!`,
      ephemeral: true,
    });
  }

  // ── Modais do submenu de saque (saque_m_*) ───────────────────────────────────
  if (id.startsWith('saque_m_')) {
    const sq = require('../systems/saqueSubmenu');
    if (id === 'saque_m_valor') return sq.processarValor(interaction);
    if (id === 'saque_m_nome')  return sq.processarNome(interaction);
    if (id === 'saque_m_tipo')  return sq.processarTipo(interaction);
    if (id === 'saque_m_chave') return sq.processarChave(interaction);
    return;
  }

  // ── Modal solicitação de saque do afiliado ────────────────────────────────────
  if (id.startsWith('modal_afil_saque_')) {
    const afilId = id.replace('modal_afil_saque_', '');
    const { processarSolicitacaoSaque } = require('../systems/afiliados');
    return processarSolicitacaoSaque(interaction, afilId);
  }

  // ── Modal acesso ao painel de afiliado ────────────────────────────────────────
  if (id === 'modal_afil_acesso') {
    const codigo = interaction.fields.getTextInputValue('codigo').trim();
    const { mostrarPainelAfiliado } = require('../systems/afiliados');
    await interaction.deferReply({ ephemeral: true });
    return mostrarPainelAfiliado(interaction, codigo);
  }

  // ── Modal registrar afiliado N2 (pelo N1 no painel) ───────────────────────────
  if (id.startsWith('modal_afil_reg_n2_')) {
    const superiorId   = id.replace('modal_afil_reg_n2_', '');
    const discordId    = interaction.fields.getTextInputValue('discord_id').trim();
    const codigoAcesso = interaction.fields.getTextInputValue('codigo_acesso').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    const codigoVendas = interaction.fields.getTextInputValue('codigo_vendas').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

    await interaction.deferReply({ ephemeral: true });
    const { registrarAfiliadoN2 } = require('../systems/afiliados');
    const { ok, erro, membro } = await registrarAfiliadoN2(interaction.guild, superiorId, discordId, codigoAcesso, codigoVendas);
    if (!ok) return interaction.editReply({ content: `❌ ${erro}` });

    // Dar cargo de Afiliado N2
    await membro.roles.add('1546330866828050532').catch(() => {});

    const { log } = require('../utils/logger');
    await log('sistema', { executor: interaction.user.id, descricao: `➕ Afiliado N2 registrado por <@${superiorId}>: <@${discordId}> | Acesso: \`${codigoAcesso}\` | Vendas: \`${codigoVendas}\`` });

    return interaction.editReply({
      content: `✅ Afiliado N2 **${membro.user.username}** registrado com sucesso!\n> Acesso: \`${codigoAcesso}\` | Vendas: \`${codigoVendas}\`\n> DM enviada com as informações.`,
    });
  }

  // ── Modal gerar novo código de vendas ─────────────────────────────────────────
  if (id.startsWith('modal_afil_novo_codigo_')) {
    const afilId  = id.replace('modal_afil_novo_codigo_', '');
    const codigo  = interaction.fields.getTextInputValue('codigo').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (codigo.length < 2) return interaction.reply({ content: '❌ Código inválido.', ephemeral: true });

    const existente = db.prepare('SELECT discord_id FROM usuarios WHERE codigo_afil=?').get(codigo);
    if (existente && existente.discord_id !== afilId) {
      return interaction.reply({ content: `❌ Código \`${codigo}\` já está em uso.`, ephemeral: true });
    }
    db.prepare('UPDATE usuarios SET codigo_afil=? WHERE discord_id=?').run(codigo, afilId);
    return interaction.reply({ content: `✅ Código de vendas atualizado para \`${codigo}\`!`, ephemeral: true });
  }

  // ── Modal resgate código de coins ─────────────────────────────────────────
  if (id === 'modal_resgatar_codigo') {
    const codigo = interaction.fields.getTextInputValue('codigo');
    const { resgatarCodigo } = require('../systems/codigosCoins');
    return resgatarCodigo(interaction, codigo);
  }

  // ── Modal código de convite ───────────────────────────────────────────────
  if (id === 'modal_usar_codigo_convite') {
    const codigo = interaction.fields.getTextInputValue('codigo');
    const { resgatarCodigoConvite } = require('../systems/sistemaConvite');
    return resgatarCodigoConvite(interaction, codigo);
  }

  // ── Modais do painel builder (pbm_*) ──────────────────────────────────────
  if (id.startsWith('pbm_')) {
    return handlePainelModals(interaction);
  }

  // ── Modal de reembolso ────────────────────────────────────────────────────
  if (id.startsWith('modal_reembolso_')) {
    const pedidoId = id.replace('modal_reembolso_', '');
    const motivo = interaction.fields.getTextInputValue('motivo');
    await interaction.deferReply({ ephemeral: true });
    await solicitarReembolso(interaction, pedidoId, motivo);
  }

  // ── Modal de avaliação ────────────────────────────────────────────────────
  else if (id.startsWith('modal_avaliacao_')) {
    const pedidoId = id.replace('modal_avaliacao_', '');
    const notaStr = interaction.fields.getTextInputValue('nota').trim();
    const comentario = interaction.fields.getTextInputValue('comentario') || '';

    const nota = parseInt(notaStr);
    if (isNaN(nota) || nota < 1 || nota > 5) {
      return interaction.reply({ content: '❌ Nota inválida. Digite um número de 1 a 5.', ephemeral: true });
    }

    const pedido = Pedidos.get(pedidoId);
    if (!pedido || pedido.usuario_id !== interaction.user.id) {
      return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
    }

    // Verificar se já avaliou
    const jaAvaliou = db.prepare('SELECT 1 FROM avaliacoes WHERE pedido_id=? AND usuario_id=?').get(pedidoId, interaction.user.id);
    if (jaAvaliou) return interaction.reply({ content: '⚠️ Você já avaliou este produto.', ephemeral: true });

    // Inserir avaliação
    db.prepare('INSERT INTO avaliacoes (id, produto_id, usuario_id, pedido_id, nota, comentario) VALUES (?,?,?,?,?,?)')
      .run(uuidv4(), pedido.produto_id, interaction.user.id, pedidoId, nota, comentario);

    // Atualizar média do produto
    const avals = db.prepare('SELECT AVG(nota) as media, COUNT(*) as total FROM avaliacoes WHERE produto_id=?').get(pedido.produto_id);
    db.prepare('UPDATE produtos SET avaliacao=?, total_aval=? WHERE id=?').run(avals.media, avals.total, pedido.produto_id);

    const produto = Produtos.get(pedido.produto_id);
    await interaction.reply({
      content: `✅ Avaliação registrada! ${'⭐'.repeat(nota)} para **${produto?.nome}**. Obrigado!`,
      ephemeral: true,
    });

    // ── Publicar avaliação na webhook ──────────────────────────────────────
    try {
      const estrelas  = '⭐'.repeat(nota) + '☆'.repeat(5 - nota);
      const cor       = nota >= 4 ? 0x57F287 : nota === 3 ? 0xFEE75C : 0xED4245;
      const avatar    = interaction.user.displayAvatarURL({ size: 64 });
      const { EmbedBuilder } = require('discord.js');

      const embed = new EmbedBuilder()
        .setColor(cor)
        .setAuthor({ name: interaction.user.username, iconURL: avatar })
        .setTitle(`${estrelas} Avaliação — ${produto?.nome || 'Produto'}`)
        .setDescription(comentario ? `> *"${comentario}"*` : '> *Sem comentário.*')
        .addFields(
          { name: '⭐ Nota',    value: `**${nota}/5**`,                          inline: true },
          { name: '📦 Produto', value: produto?.nome || '—',                     inline: true },
          { name: '🆔 Pedido',  value: `\`${pedidoId.slice(0,8).toUpperCase()}\``, inline: true },
        )
        .setTimestamp()
        .setFooter({ text: 'Máximo Store • Avaliações' });

      await _webhookAvaliacoes.send({ embeds: [embed] });
    } catch (err) {
      console.error('[Avaliação Webhook]', err.message);
    }
  }

  // ── Modal de compra com cupom ─────────────────────────────────────────────
  else if (id.startsWith('modal_cupom_')) {
    const produtoId = id.replace('modal_cupom_', '');
    const cupom = interaction.fields.getTextInputValue('cupom').trim();
    await iniciarCompra(interaction, produtoId, cupom || null);
  }

  // ── Modal Cupom no Ticket ─────────────────────────────────────────────────
  else if (id.startsWith('modal_ticket_cupom_')) {
    await interaction.deferReply({ ephemeral: true });
    const pedidoId = id.replace('modal_ticket_cupom_', '');
    const codigo   = interaction.fields.getTextInputValue('codigo').trim().toUpperCase();

    const { Cupons } = require('../database/database');
    const pedido  = Pedidos.get(pedidoId);
    if (!pedido) return interaction.editReply({ content: '❌ Pedido não encontrado.' });
    if (pedido.usuario_id !== interaction.user.id) return interaction.editReply({ content: '❌ Este pedido não é seu.' });
    if (pedido.status !== 'pendente') return interaction.editReply({ content: '⚠️ Pedido não está mais pendente.' });
    if (pedido.cupom_usado) return interaction.editReply({ content: `⚠️ Cupom **${pedido.cupom_usado}** já aplicado.` });

    const painel   = db.prepare('SELECT id FROM paineis_canal WHERE produto_id=? AND ativo=1 LIMIT 1').get(pedido.produto_id);
    const painelId = painel?.id || null;

    const { valido, cupom, erro } = Cupons.validar(codigo, interaction.user.id, pedido.valor_total, painelId);
    if (!valido) return interaction.editReply({ content: erro });

    const desconto  = Cupons.calcDesconto(cupom, pedido.valor_total);
    const novoTotal = Math.max(0, pedido.valor_total - desconto);

    db.prepare('UPDATE pedidos SET valor_total=?, desconto=desconto+?, cupom_usado=? WHERE id=?')
      .run(novoTotal, desconto, codigo, pedidoId);
    Cupons.usar(cupom.id, interaction.user.id, pedidoId);

    const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
    const coins     = db.prepare('SELECT coins FROM usuarios WHERE discord_id=?').get(interaction.user.id)?.coins || 0;
    const podeCoins = (coins * 0.01) >= novoTotal;

    const rowPag = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`gerar_pix_${pedidoId}`).setLabel('💠 Pagar via PIX').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`pagar_coins_${pedidoId}`).setLabel('🪙 Pagar com Coins').setStyle(ButtonStyle.Primary).setDisabled(!podeCoins),
      new ButtonBuilder().setCustomId(`alterar_qtd_${pedidoId}`).setLabel('🔢 Quantidade').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`cancelar_pedido_${pedidoId}`).setLabel('❌ Cancelar').setStyle(ButtonStyle.Danger),
    );

    await interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('🎟️ Cupom Aplicado!')
        .setDescription('> Desconto aplicado com sucesso ao seu pedido.')
        .addFields(
          { name: '🎟️ Cupom',     value: `**${codigo}**`,                              inline: true },
          { name: '💰 Desconto',  value: `${cupom.valor}% (−R$ ${desconto.toFixed(2)})`, inline: true },
          { name: '💵 Novo Total', value: `**R$ ${novoTotal.toFixed(2)}**`,               inline: true },
        )
        .setTimestamp()
        .setFooter({ text: 'Máximo Store • Cupom aplicado' })],
    });

    if (interaction.channel) {
      await interaction.channel.send({
        content: `<@${interaction.user.id}> 🎟️ Cupom **${codigo}** aplicado! Novo total: **R$ ${novoTotal.toFixed(2)}**`,
        components: [rowPag],
      }).catch(() => {});
    }
  }

  // ── Modal Boleto ──────────────────────────────────────────────────────────
  else if (id.startsWith('modal_boleto_')) {
    const produtoId = id.replace('modal_boleto_', '');
    const { processarCompraBoleto } = require('../systems/loja');
    await processarCompraBoleto(interaction, produtoId, {
      nome:     interaction.fields.getTextInputValue('nome'),
      cpf:      interaction.fields.getTextInputValue('cpf'),
      email:    interaction.fields.getTextInputValue('email'),
    });
  }

  // ── Modal Alterar Quantidade ──────────────────────────────────────────────
  else if (id.startsWith('modal_alterar_qtd_')) {
    await interaction.deferReply({ ephemeral: true });
    const pedidoId = id.replace('modal_alterar_qtd_', '');
    const qtdStr   = interaction.fields.getTextInputValue('quantidade').trim();
    const qtd      = parseInt(qtdStr);

    if (isNaN(qtd) || qtd < 1) {
      return interaction.editReply({ content: '❌ Quantidade inválida. Use um número maior que 0.' });
    }

    const { Pedidos, Produtos, db } = require('../database/database');
    const pedido  = Pedidos.get(pedidoId);
    if (!pedido) return interaction.editReply({ content: '❌ Pedido não encontrado.' });
    if (pedido.usuario_id !== interaction.user.id) return interaction.editReply({ content: '❌ Este pedido não é seu.' });
    if (pedido.status !== 'pendente') return interaction.editReply({ content: '⚠️ Pedido não está mais pendente.' });

    // Verificar estoque disponível para a variante
    let estoqueDisponivel = null;
    try {
      const nota = pedido.nota_fiscal ? JSON.parse(pedido.nota_fiscal) : null;
      const varianteId = nota?.varianteId;
      if (varianteId) {
        const est = db.prepare('SELECT COUNT(*) as c FROM estoque_variante WHERE variante_id=? AND usado=0').get(varianteId);
        estoqueDisponivel = Number(est?.c || 0);
      }
    } catch {}

    if (estoqueDisponivel !== null && qtd > estoqueDisponivel) {
      return interaction.editReply({
        content: [
          `❌ Estoque insuficiente!`,
          `📦 Disponível: **${estoqueDisponivel}** unidade(s)`,
          `🔢 Solicitado: **${qtd}**`,
        ].join('\n'),
      });
    }

    const produto    = Produtos.get(pedido.produto_id);
    const valorUnit  = pedido.valor_unit || (produto?.preco_promo || produto?.preco) || 0;
    const novoTotal  = Number(valorUnit) * qtd;

    db.prepare('UPDATE pedidos SET quantidade=?, valor_total=? WHERE id=?').run(qtd, novoTotal, pedidoId);

    // Verificar se pode pagar com coins agora
    const coins      = db.prepare('SELECT coins FROM usuarios WHERE discord_id=?').get(interaction.user.id)?.coins || 0;
    const podeCoins  = (coins * 0.01) >= novoTotal;
    const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

    // Atualizar embed no canal do ticket
    const rowPag = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`gerar_pix_${pedidoId}`).setLabel('💠 Pagar via PIX').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`pagar_coins_${pedidoId}`).setLabel('🪙 Pagar com Coins').setStyle(ButtonStyle.Primary).setDisabled(!podeCoins),
      new ButtonBuilder().setCustomId(`alterar_qtd_${pedidoId}`).setLabel('🔢 Quantidade').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`cancelar_pedido_${pedidoId}`).setLabel('❌ Cancelar').setStyle(ButtonStyle.Danger),
    );

    await interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('✅ Quantidade Atualizada')
        .addFields(
          { name: '📦 Produto',    value: produto?.nome || '—',                                        inline: true },
          { name: '🔢 Quantidade', value: `${qtd}x`,                                                   inline: true },
          { name: '💵 Novo Total', value: `R$ ${novoTotal.toFixed(2)}`,                               inline: true },
          ...(estoqueDisponivel !== null ? [{ name: '📊 Estoque restante', value: `${estoqueDisponivel - qtd} unidade(s) após entrega`, inline: false }] : []),
        )
        .setTimestamp()],
    });

    // Enviar nova row no ticket para atualizar os botões
    if (interaction.channel) {
      await interaction.channel.send({
        content: `<@${interaction.user.id}> Quantidade atualizada para **${qtd}x** — Novo total: **R$ ${novoTotal.toFixed(2)}**`,
        components: [rowPag],
      }).catch(() => {});
    }
  }

  // ── Modal de fechar ticket com motivo ─────────────────────────────────────
  else if (id === 'modal_fechar_ticket') {
    const motivo = interaction.fields.getTextInputValue('motivo');
    const { fecharTicket } = require('../systems/tickets');
    await fecharTicket(interaction, motivo);
  }

  // ── Modal Flash Sale (pelo painel) ────────────────────────────────────────
  else if (id === 'modal_flashsale') {
    if (!require('../utils/permissions').isAdmin(interaction.member)) {
      return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
    }
    const produtoId = interaction.fields.getTextInputValue('produto_id').trim();
    const desconto  = parseInt(interaction.fields.getTextInputValue('desconto'));
    const duracao   = parseInt(interaction.fields.getTextInputValue('duracao'));

    if (isNaN(desconto) || isNaN(duracao)) {
      return interaction.reply({ content: '❌ Desconto e duração precisam ser números.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });
    const { iniciarFlashSale } = require('../systems/flashsale');
    const { ok, erro, precoPromo, expira } = await iniciarFlashSale({
      produtoId, desconto, duracaoMin: duracao,
      guild: interaction.guild, executorId: interaction.user.id,
    });

    if (!ok) return interaction.editReply({ content: `❌ ${erro}` });
    return interaction.editReply({
      content: `⚡ **Flash Sale iniciada!** Novo preço: R$ ${precoPromo.toFixed(2)} (${desconto}% OFF) — Encerra <t:${Math.floor(expira/1000)}:R>`,
    });
  }

  // ── Modal rejeitar reembolso pelo painel ──────────────────────────────────
  else if (id.startsWith('modal_rej_reimb_')) {
    const reembolsoId = id.replace('modal_rej_reimb_', '');
    const motivo = interaction.fields.getTextInputValue('motivo');
    const { rejeitarReembolso } = require('../systems/reembolsos');
    return rejeitarReembolso(interaction, reembolsoId, motivo);
  }
};
