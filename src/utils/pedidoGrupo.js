const { db, Produtos } = require('../database/database');

function pedidosPendentesDoTicket(pedido) {
  if (!pedido) return [];
  if (!pedido.ticket_id) return [pedido];
  const irmaos = db.prepare(
    "SELECT * FROM pedidos WHERE ticket_id=? AND status='pendente'"
  ).all(pedido.ticket_id);
  return irmaos.length ? irmaos : [pedido];
}

function totalGrupoPedidos(pedido) {
  return pedidosPendentesDoTicket(pedido).reduce((acc, p) => acc + Number(p.valor_total || 0), 0);
}

function descricaoGrupoPedidos(pedido) {
  return pedidosPendentesDoTicket(pedido).map(p => {
    const prod = Produtos.get(p.produto_id);
    const qtd = Math.max(1, parseInt(p.quantidade) || 1);
    const nome = prod?.nome || 'Produto';
    return qtd > 1 ? `${nome} x${qtd}` : nome;
  }).join(', ');
}

function aplicarTxIdGrupo(pedido, txId, metodoPag = null) {
  const grupo = pedidosPendentesDoTicket(pedido);
  for (const p of grupo) {
    if (metodoPag) {
      db.prepare('UPDATE pedidos SET tx_id=?, metodo_pag=? WHERE id=?').run(txId, metodoPag, p.id);
    } else {
      db.prepare('UPDATE pedidos SET tx_id=? WHERE id=?').run(txId, p.id);
    }
  }
}

function marcarGrupoPago(pedido) {
  if (pedido?.ticket_id) {
    db.prepare("UPDATE pedidos SET status='pago', pago_em=strftime('%s','now') WHERE ticket_id=? AND status='pendente'")
      .run(pedido.ticket_id);
  } else if (pedido?.id) {
    db.prepare("UPDATE pedidos SET status='pago', pago_em=strftime('%s','now') WHERE id=? AND status='pendente'")
      .run(pedido.id);
  }
}

function marcarGrupoCancelado(pedido, userId, motivo) {
  const agora = Math.floor(Date.now() / 1000);
  if (pedido?.ticket_id) {
    db.prepare(`
      UPDATE pedidos SET status='cancelado', cancelado_por=?, motivo_cancel=?, cancelado_em=?
      WHERE ticket_id=? AND status='pendente'
    `).run(userId, motivo, agora, pedido.ticket_id);
  } else if (pedido?.id) {
    db.prepare(`
      UPDATE pedidos SET status='cancelado', cancelado_por=?, motivo_cancel=?, cancelado_em=?
      WHERE id=? AND status='pendente'
    `).run(userId, motivo, agora, pedido.id);
  }
}

function ticketAindaTemItensAbertos(ticketId, pedidoIdAtual) {
  if (!ticketId) return false;
  const row = db.prepare(`
    SELECT COUNT(*) as c FROM pedidos
    WHERE ticket_id=? AND id!=? AND status IN ('pendente','pago')
  `).get(ticketId, pedidoIdAtual);
  return (row?.c || 0) > 0;
}

module.exports = {
  pedidosPendentesDoTicket,
  totalGrupoPedidos,
  descricaoGrupoPedidos,
  aplicarTxIdGrupo,
  marcarGrupoPago,
  marcarGrupoCancelado,
  ticketAindaTemItensAbertos,
};
