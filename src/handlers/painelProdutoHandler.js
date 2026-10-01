/**
 * Handler para interações dos painéis de produto
 */
const { iniciarCompraVariante } = require('../systems/loja');
const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const { db } = require('../database/database');
const config = require('../config');

// Estado de quantidade por usuário (em memória)
const qtdSessao = new Map();

function buildConfirmEmbed(varianteId, qtd) {
  const variante  = db.prepare('SELECT * FROM variantes_produto WHERE id=? AND ativo=1').get(varianteId);
  if (!variante) return null;
  const produto   = db.prepare('SELECT * FROM produtos WHERE id=?').get(variante.produto_id);
  const estoque   = db.prepare('SELECT COUNT(*) as c FROM estoque_variante WHERE variante_id=? AND usado=0').get(varianteId)?.c || 0;
  const precoUnit = Number(variante.preco);
  const total     = precoUnit * qtd;
  const cashback  = Math.floor(total * 5);
  const imagemUrl = produto?.imagem_url
    || db.prepare('SELECT imagem_url FROM paineis_canal WHERE produto_id=? AND ativo=1 LIMIT 1').get(variante.produto_id)?.imagem_url;

  const embed = new EmbedBuilder()
    .setColor(config.colors.primary)
    .setTitle('🛒 Confirmar Compra')
    .setDescription([
      `> Você está prestes a comprar o plano abaixo.`,
      `> Clique em **✅ Confirmar** para abrir o ticket e escolher o pagamento.`,
    ].join('\n'))
    .addFields(
      { name: '📦 Produto',    value: `**${produto?.nome || '—'}**`,                             inline: true },
      { name: '🏷️ Plano',     value: `**${variante.nome}**`,                                     inline: true },
      { name: '💵 Preço unit.', value: `R$ ${precoUnit.toFixed(2)}`,                             inline: true },
      { name: '🔢 Quantidade', value: `**${qtd}x**`,                                             inline: true },
      { name: '💰 Total',      value: `**R$ ${total.toFixed(2)}**`,                              inline: true },
      { name: '📊 Estoque',    value: `${estoque} unidade(s) disponível`,                        inline: true },
      { name: '🎁 Cashback',   value: `+**${cashback} coins** (5% sem cupom)`,                   inline: true },
    )
    .setTimestamp()
    .setFooter({ text: 'Máximo Store • Confirme para prosseguir' });

  if (imagemUrl) embed.setThumbnail(imagemUrl);
  return { embed, variante, produto, total, qtd, estoque };
}

module.exports = async (interaction, client) => {
  const id = interaction.customId;

  // ── Select: usuário escolheu um plano ─────────────────────────────────────
  if (id.startsWith('painel_selecionar_')) {
    // Select menu precisa de defer
    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: true });
      }
    } catch {}

    const varianteId = interaction.values[0];
    const variante   = db.prepare('SELECT * FROM variantes_produto WHERE id=? AND ativo=1').get(varianteId);
    if (!variante) return interaction.editReply({ content: '❌ Plano não encontrado.' });

    const estoque = db.prepare('SELECT COUNT(*) as c FROM estoque_variante WHERE variante_id=? AND usado=0').get(varianteId)?.c || 0;

    if (estoque === 0) {
      const rowNotif = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`notif_estoque_${varianteId}`).setLabel('🔔 Avisar quando voltar').setStyle(ButtonStyle.Secondary),
      );
      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(config.colors.error)
          .setTitle('❌ Sem Estoque')
          .setDescription([
            `> O plano **${variante.nome}** está sem estoque.`,
            `> Clique em 🔔 para ser notificado quando voltar.`,
          ].join('\n'))
          .setTimestamp()],
        components: [rowNotif],
      });
    }

    // Iniciar com quantidade 1
    qtdSessao.set(interaction.user.id, { varianteId, qtd: 1 });

    const result = buildConfirmEmbed(varianteId, 1);
    if (!result) return interaction.editReply({ content: '❌ Plano não encontrado.' });

    const rowConfirm = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`confirmar_compra_var_${varianteId}`).setLabel('✅ Confirmar Compra').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`cvar_add_${varianteId}`).setLabel('🛒 Add ao Carrinho').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`alterar_qtd_confirm_${varianteId}`).setLabel('🔢 Quantidade').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('cancelar_confirmacao').setLabel('❌ Cancelar').setStyle(ButtonStyle.Secondary),
    );

    return interaction.editReply({ embeds: [result.embed], components: [rowConfirm] });
  }

  // ── Botão: alterar quantidade na tela de confirmação ──────────────────────
  if (id.startsWith('alterar_qtd_confirm_')) {
    // Modal NÃO pode ter defer antes — responde direto com showModal
    const varianteId = id.replace('alterar_qtd_confirm_', '');
    const sessao     = qtdSessao.get(interaction.user.id) || { varianteId, qtd: 1 };
    const estoque    = db.prepare('SELECT COUNT(*) as c FROM estoque_variante WHERE variante_id=? AND usado=0').get(varianteId)?.c || 0;

    const modal = new ModalBuilder().setCustomId(`modal_qtd_confirm_${varianteId}`).setTitle('🔢 Alterar Quantidade');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('quantidade')
          .setLabel(`Quantidade (máx: ${estoque})`)
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setValue(String(sessao.qtd || 1))
          .setPlaceholder(`Ex: 2 (máx ${estoque})`),
      ),
    );
    return interaction.showModal(modal);
  }

  // ── Modal: confirmar quantidade ────────────────────────────────────────────
  if (id.startsWith('modal_qtd_confirm_')) {
    const varianteId = id.replace('modal_qtd_confirm_', '');
    const qtdStr     = interaction.fields.getTextInputValue('quantidade').trim();
    const qtd        = parseInt(qtdStr);
    const estoque    = db.prepare('SELECT COUNT(*) as c FROM estoque_variante WHERE variante_id=? AND usado=0').get(varianteId)?.c || 0;

    if (isNaN(qtd) || qtd < 1) return interaction.reply({ content: '❌ Quantidade inválida.', ephemeral: true });
    if (qtd > estoque) return interaction.reply({ content: `❌ Estoque insuficiente. Disponível: **${estoque}**.`, ephemeral: true });

    qtdSessao.set(interaction.user.id, { varianteId, qtd });

    const result = buildConfirmEmbed(varianteId, qtd);
    if (!result) return interaction.reply({ content: '❌ Plano não encontrado.', ephemeral: true });

    const rowConfirm = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`confirmar_compra_var_${varianteId}`).setLabel('✅ Confirmar Compra').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`cvar_add_${varianteId}`).setLabel('🛒 Add ao Carrinho').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`alterar_qtd_confirm_${varianteId}`).setLabel('🔢 Quantidade').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('cancelar_confirmacao').setLabel('❌ Cancelar').setStyle(ButtonStyle.Secondary),
    );

    // Atualizar embed existente
    await interaction.update({ embeds: [result.embed], components: [rowConfirm] }).catch(async () => {
      await interaction.reply({ embeds: [result.embed], components: [rowConfirm], ephemeral: true }).catch(() => {});
    });
    return;
  }

  // ── Botão: confirmar compra — some o embed e abre o ticket ────────────────
  if (id.startsWith('confirmar_compra_var_')) {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ ephemeral: true }).catch(() => {});
    }
    const varianteId = id.replace('confirmar_compra_var_', '');
    const sessao     = qtdSessao.get(interaction.user.id) || { varianteId, qtd: 1 };
    const qtd        = sessao.qtd || 1;

    // Sumir com o embed de confirmação
    await interaction.editReply({
      content: `⏳ Abrindo ticket...`,
      embeds: [],
      components: [],
    }).catch(() => {});

    qtdSessao.delete(interaction.user.id);

    // Abrir ticket com a quantidade escolhida
    return iniciarCompraVariante(interaction, varianteId, client, null, qtd);
  }

  // ── Botão: cancelar confirmação ───────────────────────────────────────────
  if (id === 'cancelar_confirmacao') {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ ephemeral: true }).catch(() => {});
    }
    qtdSessao.delete(interaction.user.id);
    return interaction.editReply({ content: '❌ Compra cancelada.', embeds: [], components: [] });
  }

  // ── Botão: compra direta (legado) ──────────────────────────────────────────
  if (id.startsWith('painel_comprar_var_')) {
    const varianteId = id.replace('painel_comprar_var_', '');
    return iniciarCompraVariante(interaction, varianteId, client);
  }
};

// Exportar qtdSessao para acesso externo
module.exports.qtdSessao = qtdSessao;
