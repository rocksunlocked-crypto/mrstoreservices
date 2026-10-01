const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../config');
const { db, Usuarios, Produtos } = require('../database/database');
const { v4: uuidv4 } = require('uuid');

/**
 * Adicionar item ao carrinho
 */
function adicionarAoCarrinho(usuarioId, produtoId, quantidade = 1) {
  const produto = Produtos.get(produtoId);
  if (!produto || !produto.ativo) return { ok: false, erro: 'Produto não encontrado.' };
  if (!Produtos.temEstoque(produtoId)) return { ok: false, erro: 'Produto sem estoque.' };

  const existente = db.prepare('SELECT * FROM carrinho WHERE usuario_id = ? AND produto_id = ?').get(usuarioId, produtoId);
  if (existente) {
    db.prepare('UPDATE carrinho SET quantidade = quantidade + ? WHERE usuario_id = ? AND produto_id = ?').run(quantidade, usuarioId, produtoId);
  } else {
    db.prepare('INSERT INTO carrinho (id, usuario_id, produto_id, quantidade) VALUES (?,?,?,?)').run(uuidv4(), usuarioId, produtoId, quantidade);
  }
  return { ok: true, produto };
}

/**
 * Remover item do carrinho
 */
function removerDoCarrinho(usuarioId, produtoId) {
  return db.prepare('DELETE FROM carrinho WHERE usuario_id = ? AND produto_id = ?').run(usuarioId, produtoId);
}

/**
 * Listar itens do carrinho
 */
function listarCarrinho(usuarioId) {
  return db.prepare(`
    SELECT c.*, p.nome, p.preco, p.preco_promo, p.imagem_url, p.tipo, p.ativo
    FROM carrinho c
    JOIN produtos p ON c.produto_id = p.id
    WHERE c.usuario_id = ?
    ORDER BY c.adicionado DESC
  `).all(usuarioId);
}

/**
 * Limpar carrinho
 */
function limparCarrinho(usuarioId) {
  return db.prepare('DELETE FROM carrinho WHERE usuario_id = ?').run(usuarioId);
}

/**
 * Calcular total do carrinho
 */
function calcularTotal(itens) {
  return itens.reduce((acc, i) => acc + ((i.preco_promo || i.preco) * i.quantidade), 0);
}

/**
 * Embed do carrinho
 */
async function mostrarCarrinho(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const itens = listarCarrinho(interaction.user.id);

  if (!itens.length) {
    return interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(config.colors.warning)
        .setTitle('🛒 Carrinho Vazio')
        .setDescription('Adicione produtos à loja usando `/loja` ou clicando em **Adicionar ao Carrinho**.')
        .setTimestamp()],
    });
  }

  const total = calcularTotal(itens);

  const embed = new EmbedBuilder()
    .setColor(config.colors.primary)
    .setTitle('🛒 Seu Carrinho')
    .setDescription(`${itens.length} produto(s) no carrinho`)
    .setTimestamp()
    .setFooter({ text: 'Máximo Store • Use os botões para gerenciar' });

  for (const item of itens) {
    const preco = item.preco_promo || item.preco;
    const subtotal = preco * item.quantidade;
    embed.addFields({
      name: `📦 ${item.nome}`,
      value: `R$ ${preco.toFixed(2)} x${item.quantidade} = **R$ ${subtotal.toFixed(2)}**`,
      inline: false,
    });
  }

  embed.addFields({ name: '─────────────────', value: `💰 **Total: R$ ${total.toFixed(2)}**`, inline: false });

  const rows = [];

  // Botão de comprar tudo
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('carrinho_comprar_tudo').setLabel(`💰 Comprar Tudo — R$ ${total.toFixed(2)}`).setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('carrinho_limpar').setLabel('🗑️ Limpar Carrinho').setStyle(ButtonStyle.Danger),
  ));

  // Botões individuais (até 5 itens)
  if (itens.length <= 5) {
    const rowRemover = new ActionRowBuilder();
    for (const item of itens.slice(0, 5)) {
      rowRemover.addComponents(
        new ButtonBuilder()
          .setCustomId(`carrinho_remover_${item.produto_id}`)
          .setLabel(`❌ ${item.nome.slice(0, 20)}`)
          .setStyle(ButtonStyle.Secondary)
      );
    }
    rows.push(rowRemover);
  }

  await interaction.editReply({ embeds: [embed], components: rows });
}

module.exports = { adicionarAoCarrinho, removerDoCarrinho, listarCarrinho, limparCarrinho, calcularTotal, mostrarCarrinho };
