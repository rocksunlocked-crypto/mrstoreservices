const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../config');
const { db, Pedidos, Usuarios } = require('../database/database');
const { log } = require('../utils/logger');
const efi = require('./efi');
const { v4: uuidv4 } = require('uuid');

/**
 * Solicitar reembolso
 */
async function solicitarReembolso(interaction, pedidoId, motivo) {
  const pedido = Pedidos.get(pedidoId);
  if (!pedido) return interaction.reply({ content: '❌ Pedido não encontrado.', ephemeral: true });
  if (pedido.usuario_id !== interaction.user.id) return interaction.reply({ content: '❌ Este pedido não é seu.', ephemeral: true });
  if (!['pago', 'entregue'].includes(pedido.status)) return interaction.reply({ content: '❌ Este pedido não pode ser reembolsado.', ephemeral: true });

  // Verificar se já tem reembolso pendente
  const existente = db.prepare("SELECT * FROM reembolsos WHERE pedido_id = ? AND status = 'pendente'").get(pedidoId);
  if (existente) return interaction.reply({ content: '⚠️ Já existe uma solicitação de reembolso pendente para este pedido.', ephemeral: true });

  const id = uuidv4();
  db.prepare('INSERT INTO reembolsos (id, pedido_id, usuario_id, valor, motivo) VALUES (?,?,?,?,?)')
    .run(id, pedidoId, interaction.user.id, pedido.valor_total, motivo);

  await log('reembolso', {
    usuario: interaction.user.id,
    pedidoId,
    valor: pedido.valor_total,
    motivo,
    descricao: `Reembolso solicitado para pedido ${pedidoId.slice(0,8)}`,
  });

  // Abrir ticket de reembolso
  const { abrirTicket } = require('./tickets');
  const { ok, canal } = await abrirTicket(interaction.guild, interaction.member, 'reembolso', {
    pedidoId,
    valor: pedido.valor_total,
  });

  if (interaction.replied || interaction.deferred) {
    await interaction.editReply({ content: `✅ Reembolso solicitado! ${ok ? `Acesse ${canal}.` : 'Nossa equipe irá analisar.'}` });
  } else {
    await interaction.reply({ content: `✅ Reembolso solicitado! ${ok ? `Acesse ${canal}.` : 'Nossa equipe irá analisar.'}`, ephemeral: true });
  }

  return id;
}

/**
 * Aprovar reembolso
 */
async function aprovarReembolso(interaction, reembolsoId) {
  const reembolso = db.prepare('SELECT * FROM reembolsos WHERE id = ?').get(reembolsoId);
  if (!reembolso) return interaction.reply({ content: '❌ Reembolso não encontrado.', ephemeral: true });
  if (reembolso.status !== 'pendente') return interaction.reply({ content: '⚠️ Reembolso já processado.', ephemeral: true });

  const pedido = Pedidos.get(reembolso.pedido_id);

  // Tentar devolução PIX
  let reembolsadoPix = false;
  if (pedido?.tx_id && !pedido.tx_id.startsWith('SIM_')) {
    try {
      const notaFiscal = pedido.nota_fiscal ? JSON.parse(pedido.nota_fiscal) : null;
      if (notaFiscal?.e2eId) {
        await efi.devolverPix(pedido.tx_id, notaFiscal.e2eId, reembolso.valor, reembolsoId.slice(0, 35));
        reembolsadoPix = true;
      }
    } catch (err) {
      console.error('[Reembolso PIX]', err.message);
    }
  }

  // Se não conseguiu via PIX, adicionar saldo
  if (!reembolsadoPix) {
    Usuarios.addSaldo(reembolso.usuario_id, reembolso.valor, `Reembolso aprovado - Pedido ${reembolso.pedido_id.slice(0,8)}`);
  }

  db.prepare('UPDATE reembolsos SET status=?, analisado_por=?, resposta=?, resolvido_em=strftime(\'%s\',\'now\') WHERE id=?')
    .run('aprovado', interaction.user.id, reembolsadoPix ? 'Reembolso PIX processado.' : 'Crédito adicionado ao saldo.', reembolsoId);

  Pedidos.atualizar(reembolso.pedido_id, { status: 'reembolsado' });

  await log('reembolso', {
    executor: interaction.user.id,
    usuario: reembolso.usuario_id,
    valor: reembolso.valor,
    descricao: `Reembolso aprovado: R$ ${reembolso.valor.toFixed(2)} ${reembolsadoPix ? 'via PIX' : 'em saldo'}`,
  });

  await interaction.reply({ content: `✅ Reembolso de R$ ${reembolso.valor.toFixed(2)} aprovado! ${reembolsadoPix ? 'Devolvido via PIX.' : 'Crédito adicionado ao saldo.'}`, ephemeral: true });
}

/**
 * Rejeitar reembolso
 */
async function rejeitarReembolso(interaction, reembolsoId, motivo) {
  const reembolso = db.prepare('SELECT * FROM reembolsos WHERE id = ?').get(reembolsoId);
  if (!reembolso) return interaction.reply({ content: '❌ Reembolso não encontrado.', ephemeral: true });

  db.prepare('UPDATE reembolsos SET status=?, analisado_por=?, resposta=?, resolvido_em=strftime(\'%s\',\'now\') WHERE id=?')
    .run('rejeitado', interaction.user.id, motivo, reembolsoId);

  await interaction.reply({ content: '✅ Reembolso rejeitado.', ephemeral: true });
}

/**
 * Listar reembolsos pendentes
 */
function listarPendentes() {
  return db.prepare(`
    SELECT r.*, p.valor_total, u.nome as usuario_nome
    FROM reembolsos r
    JOIN pedidos p ON r.pedido_id = p.id
    LEFT JOIN usuarios u ON r.usuario_id = u.discord_id
    WHERE r.status = 'pendente'
    ORDER BY r.criado_em ASC
  `).all();
}

module.exports = { solicitarReembolso, aprovarReembolso, rejeitarReembolso, listarPendentes };
