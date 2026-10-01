const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
} = require('discord.js');
const { db, Produtos, Config } = require('../database/database');
const { log } = require('../utils/logger');
const config = require('../config');
const { v4: uuidv4 } = require('uuid');

// Map de flash sales ativas: produtoId -> { desconto, expira, timeout, mensagemId, canalId }
const flashSalesAtivas = new Map();

/**
 * Iniciar flash sale em um produto
 * @param {object} opts
 * @param {string} opts.produtoId
 * @param {number} opts.desconto  - percentual de desconto (ex: 30 = 30%)
 * @param {number} opts.duracaoMin - duração em minutos
 * @param {object} opts.guild
 * @param {string} opts.executorId
 */
async function iniciarFlashSale({ produtoId, desconto, duracaoMin, guild, executorId }) {
  const produto = Produtos.get(produtoId);
  if (!produto) return { ok: false, erro: 'Produto não encontrado.' };
  if (!produto.ativo) return { ok: false, erro: 'Produto inativo.' };
  if (flashSalesAtivas.has(produtoId)) return { ok: false, erro: 'Já existe uma Flash Sale ativa para este produto.' };

  const precoOriginal = produto.preco;
  const precoPromo    = parseFloat((precoOriginal * (1 - desconto / 100)).toFixed(2));
  const expira        = Date.now() + duracaoMin * 60 * 1000;

  // Aplicar preço promocional
  Produtos.atualizar(produtoId, { preco_promo: precoPromo });

  // Enviar anúncio no canal de logs (pode customizar para canal de vendas)
  const canal = guild.channels.cache.get(config.channels.logs);

  let mensagem = null;
  if (canal) {
    const expiraTs = Math.floor(expira / 1000);
    const embed = new EmbedBuilder()
      .setColor(config.colors.error)
      .setTitle('⚡ FLASH SALE — OFERTA RELÂMPAGO!')
      .setDescription([
        `> 🔥 **${produto.nome}** com **${desconto}% OFF** por tempo limitado!`,
        '',
        `💵 ~~R$ ${precoOriginal.toFixed(2)}~~ → **R$ ${precoPromo.toFixed(2)}**`,
        `⏰ Termina em: <t:${expiraTs}:R>`,
        `📅 Até: <t:${expiraTs}:F>`,
        '',
        '> ⚠️ Válido enquanto durar o estoque!',
      ].join('\n'))
      .setTimestamp()
      .setFooter({ text: 'Máximo Store • Flash Sale' });

    if (produto.imagem_url) embed.setImage(produto.imagem_url);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`comprar_${produtoId}`)
        .setLabel(`⚡ Comprar por R$ ${precoPromo.toFixed(2)}`)
        .setStyle(ButtonStyle.Danger),
    );

    mensagem = await canal.send({ content: '@everyone', embeds: [embed], components: [row] }).catch(() => null);
  }

  // Agendar encerramento
  const timeout = setTimeout(() => encerrarFlashSale(produtoId, guild), duracaoMin * 60 * 1000);

  flashSalesAtivas.set(produtoId, {
    desconto,
    precoOriginal,
    precoPromo,
    expira,
    timeout,
    mensagemId: mensagem?.id,
    canalId: canal?.id,
  });

  await log('sistema', {
    executor: executorId,
    produto: produto.nome,
    descricao: `⚡ Flash Sale iniciada: ${produto.nome} com ${desconto}% OFF por ${duracaoMin} min`,
  });

  return { ok: true, precoPromo, expira };
}

/**
 * Encerrar flash sale
 */
async function encerrarFlashSale(produtoId, guild) {
  const sale = flashSalesAtivas.get(produtoId);
  if (!sale) return;

  clearTimeout(sale.timeout);
  flashSalesAtivas.delete(produtoId);

  // Remover preço promocional
  Produtos.atualizar(produtoId, { preco_promo: null });

  // Editar mensagem de anúncio
  if (guild && sale.canalId && sale.mensagemId) {
    try {
      const canal = guild.channels.cache.get(sale.canalId);
      const msg   = await canal?.messages.fetch(sale.mensagemId).catch(() => null);
      if (msg) {
        await msg.edit({
          content: '',
          embeds: [new EmbedBuilder()
            .setColor(config.colors.dark)
            .setTitle('⏰ Flash Sale Encerrada')
            .setDescription('Esta oferta relâmpago foi encerrada. Fique atento para as próximas!')
            .setTimestamp()],
          components: [],
        }).catch(() => {});
      }
    } catch {}
  }

  const produto = Produtos.get(produtoId);
  await log('sistema', {
    produto: produto?.nome || produtoId,
    descricao: `Flash Sale encerrada: ${produto?.nome || produtoId}`,
  });
}

/**
 * Listar flash sales ativas
 */
function listarAtivas() {
  return Array.from(flashSalesAtivas.entries()).map(([pid, data]) => {
    const produto = Produtos.get(pid);
    return { produto, ...data };
  });
}

module.exports = { iniciarFlashSale, encerrarFlashSale, listarAtivas };
