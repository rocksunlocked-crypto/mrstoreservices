/**
 * Sistema de Produtos Free
 * - Produto com preço R$ 0,00 vai direto pro inventário
 * - Cooldown de 24h por produto (exceto Owner e Aceitar Compra)
 * - Cada linha do estoque = 1 produto (key de 1 linha)
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../config');
const { db, Usuarios, Produtos } = require('../database/database');
const { log }  = require('../utils/logger');
const { temIsencaoCooldownFree } = require('../utils/permissions');
const { v4: uuidv4 } = require('uuid');
const moment = require('moment-timezone');

const COOLDOWN_HORAS = config.produtosFree.cooldownHoras; // 24h

/**
 * Verificar se usuário pode resgatar produto free
 */
function poderesgatar(member, produtoId) {
  // Cargos isentos de cooldown
  if (temIsencaoCooldownFree(member)) return { ok: true };

  const inicioDia = Math.floor(Date.now() / 1000) - (COOLDOWN_HORAS * 3600);
  const resgate   = db.prepare(`
    SELECT * FROM pedidos
    WHERE usuario_id=? AND produto_id=? AND status='entregue'
    AND criado_em > ?
  `).get(member.id, produtoId, inicioDia);

  if (resgate) {
    const proxResgate = resgate.criado_em + (COOLDOWN_HORAS * 3600);
    const restante    = proxResgate - Math.floor(Date.now() / 1000);
    const h           = Math.floor(restante / 3600);
    const m           = Math.floor((restante % 3600) / 60);
    return {
      ok:       false,
      mensagem: `⏳ Cooldown ativo! Você pode resgatar novamente em **${h}h ${m}m**.`,
      expira:   proxResgate,
    };
  }

  return { ok: true };
}

/**
 * Resgatar produto free — entrega imediata sem pagamento
 */
async function resgatarProdutoFree(interaction, produtoId) {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ ephemeral: true });
  }

  const usuario = Usuarios.garantir(interaction.user.id, interaction.user.username);
  if (usuario.bloqueado) return interaction.editReply({ content: '🚫 Conta bloqueada.' });

  const produto = Produtos.get(produtoId);
  if (!produto || !produto.ativo || produto.preco > 0) {
    return interaction.editReply({ content: '❌ Produto não disponível como free.' });
  }

  // Verificar cooldown
  const check = poderesgatar(interaction.member, produtoId);
  if (!check.ok) {
    return interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(config.colors.warning)
        .setTitle('⏳ Cooldown Ativo')
        .setDescription(check.mensagem)
        .addFields({ name: '🕐 Próximo resgate', value: `<t:${check.expira}:R>`, inline: true })
        .setTimestamp()],
    });
  }

  // Verificar estoque
  const item = db.prepare('SELECT * FROM estoque_digital WHERE produto_id=? AND usado=0 LIMIT 1').get(produtoId);
  if (!item) return interaction.editReply({ content: '❌ Estoque esgotado no momento.' });

  // Criar pedido gratuito
  const pedidoId = uuidv4();
  db.prepare(`
    INSERT INTO pedidos (id, usuario_id, produto_id, quantidade, valor_unit, valor_total, desconto, metodo_pag, status, pago_em, entregue_em)
    VALUES (?,?,?,?,0,0,0,'free','entregue',strftime('%s','now'),strftime('%s','now'))
  `).run(pedidoId, interaction.user.id, produtoId, 1);

  // Marcar item como usado
  db.prepare("UPDATE estoque_digital SET usado=1, usado_por=?, pedido_id=?, usado_em=strftime('%s','now') WHERE id=?")
    .run(interaction.user.id, pedidoId, item.id);

  // Atualizar estoque
  const restante = db.prepare('SELECT COUNT(*) as c FROM estoque_digital WHERE produto_id=? AND usado=0').get(produtoId).c;
  db.prepare('UPDATE produtos SET estoque=?, vendas=vendas+1 WHERE id=?').run(restante, produtoId);

  // Atualizar pedido com conteúdo
  db.prepare('UPDATE pedidos SET conteudo_entregue=? WHERE id=?').run(item.conteudo, pedidoId);

  // Adicionar ao inventário
  db.prepare(`
    INSERT OR IGNORE INTO inventario (id, usuario_id, produto_id, pedido_id, conteudo, resgatado_em)
    VALUES (?,?,?,?,?,strftime('%s','now'))
  `).run(uuidv4(), interaction.user.id, produtoId, pedidoId, item.conteudo);

  // Adicionar pontos
  Usuarios.addPontos(interaction.user.id, 1);

  const embed = new EmbedBuilder()
    .setColor(config.colors.free)
    .setTitle('✅ Produto Free Resgatado!')
    .setDescription([
      `📦 **Produto:** ${produto.nome}`,
      `🎁 **Seu produto:**`,
      `\`\`\`\n${item.conteudo}\n\`\`\``,
      `⏳ Próximo resgate disponível em **${COOLDOWN_HORAS}h**`,
    ].join('\n'))
    .addFields(
      { name: '🆔 Pedido',   value: `\`${pedidoId.slice(0,8).toUpperCase()}\``, inline: true },
      { name: '📦 Estoque',  value: `${restante} restante(s)`,                   inline: true },
    )
    .setTimestamp()
    .setFooter({ text: 'Máximo Store • Use /inventario para ver seus produtos' });

  await interaction.editReply({ embeds: [embed] });

  // Enviar também por DM
  await interaction.user.send({ embeds: [embed] }).catch(() => {});

  await log('compra', {
    usuario:   interaction.user.id,
    produto:   produto.nome,
    valor:     0,
    pedidoId,
    descricao: `Produto free resgatado: ${produto.nome}`,
  });

  if (restante <= 3) {
    await log('estoque_baixo', { produto: produto.nome, descricao: `Estoque free crítico: ${produto.nome} — ${restante} unidade(s)` });
  }
}

module.exports = { poderesgatar, resgatarProdutoFree };
