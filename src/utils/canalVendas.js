/**
 * Sistema de log de vendas no canal fixo
 * Canal: 1546210832105340989
 * Mostra: comprador, vendedor/bot/afiliado, pedido, data, valor, cashback, método
 */

const { EmbedBuilder } = require('discord.js');

const CANAL_VENDAS_LOG = '1546210832105340989';

// Formatar método de pagamento para exibição
function formatarMetodo(metodo) {
  if (!metodo) return '❓ Desconhecido';
  if (metodo === 'pix')           return '💠 PIX';
  if (metodo.includes('coins'))   return '🪙 Coins';
  if (metodo.includes('boleto'))  return '🧾 Boleto';
  if (metodo.includes('stripe'))  {
    const moeda = metodo.split('_')[1]?.toUpperCase() || 'USD';
    return `💳 Cartão (${moeda})`;
  }
  return `💳 ${metodo.toUpperCase()}`;
}

// Enviar log de venda no canal
async function logVenda(client, pedido, extras = {}) {
  try {
    const guild = client.guilds.cache.first();
    if (!guild) return;
    const canal = guild.channels.cache.get(CANAL_VENDAS_LOG);
    if (!canal) return;

    const { db } = require('../database/database');

    // Buscar dados extras do pedido
    const produto  = db.prepare('SELECT * FROM produtos WHERE id=?').get(pedido.produto_id);
    const usuario  = db.prepare('SELECT * FROM usuarios WHERE discord_id=?').get(pedido.usuario_id);
    const afiliado = pedido.afiliado_id ? db.prepare('SELECT * FROM usuarios WHERE discord_id=?').get(pedido.afiliado_id) : null;

    // Determinar quem vendeu
    let vendidoPor = '🤖 Bot (automático)';
    if (extras.atendente) vendidoPor = `👤 <@${extras.atendente}> (staff)`;
    else if (afiliado)    vendidoPor = `🤝 Afiliado: **${afiliado.nome || afiliado.discord_id}** (\`${afiliado.codigo_afil || '—'}\`)`;

    // Cashback recebido (apenas se não foi coins)
    const metodo = pedido.metodo_pag || '';
    const pagoCoins = metodo.includes('coins');
    const pct = parseInt(db.prepare("SELECT valor FROM configuracoes WHERE chave='cashback_pct'").get()?.valor || '5');
    const cashback = (!pagoCoins && !pedido.cupom_usado && pedido.valor_total >= 1)
      ? Math.floor(pedido.valor_total * pct)
      : 0;

    // Data e hora
    const ts = pedido.pago_em || pedido.entregue_em || Math.floor(Date.now()/1000);
    const data = new Date(ts * 1000).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });

    const nomeProduto = extras.nomeProduto || produto?.nome || pedido.produto_id.slice(0,8);

    const embed = new EmbedBuilder()
      .setColor(pagoCoins ? 0xFFD700 : 0x00D26A)
      .setTitle('🛒 Nova Venda Realizada')
      .addFields(
        { name: '👤 Comprador',       value: `<@${pedido.usuario_id}> (${usuario?.nome || pedido.usuario_id})`, inline: false },
        { name: '📦 Produto',         value: `**${nomeProduto}**`,                                              inline: true  },
        { name: '💵 Valor',           value: `**R$ ${Number(pedido.valor_total).toFixed(2)}**`,                 inline: true  },
        { name: '💳 Pagamento',       value: formatarMetodo(metodo),                                            inline: true  },
        { name: '🆔 Pedido',          value: `\`${pedido.id.slice(0,8).toUpperCase()}\``,                       inline: true  },
        { name: '📅 Data/Hora',       value: data,                                                              inline: true  },
        { name: '🤝 Vendido por',     value: vendidoPor,                                                        inline: true  },
        { name: '🎁 Cashback',        value: cashback > 0 ? `+**${cashback} coins** (${pct}%)` : '❌ Sem cashback', inline: true },
        { name: '🎟️ Cupom',          value: pedido.cupom_usado ? `\`${pedido.cupom_usado}\`` : '—',            inline: true  },
        { name: '🤝 Afiliado',        value: afiliado ? `${afiliado.nome || afiliado.discord_id}` : '—',       inline: true  },
      )
      .setTimestamp(ts * 1000)
      .setFooter({ text: `Máximo Store • ${nomeProduto}` });

    await canal.send({ embeds: [embed] });
  } catch (err) {
    console.error('[CanalVendas] Erro ao logar venda:', err.message);
  }
}

// Enviar histórico de vendas anteriores (chamado no startup)
async function enviarHistoricoVendas(client) {
  try {
    const guild = client.guilds.cache.first();
    if (!guild) return;
    const canal = guild.channels.cache.get(CANAL_VENDAS_LOG);
    if (!canal) return;

    const { db } = require('../database/database');

    // Verificar se já enviamos histórico (evita duplicar no restart)
    const jaEnviou = db.prepare("SELECT valor FROM configuracoes WHERE chave='historico_vendas_enviado'").get();
    if (jaEnviou?.valor === '1') return;

    const pedidos = db.prepare(`
      SELECT p.*, pr.nome as produto_nome, u.nome as usuario_nome
      FROM pedidos p
      JOIN produtos pr ON p.produto_id = pr.id
      LEFT JOIN usuarios u ON p.usuario_id = u.discord_id
      WHERE p.status IN ('pago','entregue')
      ORDER BY p.pago_em ASC
    `).all();

    if (!pedidos.length) return;

    // Enviar cabeçalho
    await canal.send({
      embeds: [new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('📊 Histórico de Vendas — Carregando...')
        .setDescription(`> Enviando **${pedidos.length}** venda(s) anteriores ao sistema.\n> Aguarde...`)
        .setTimestamp()],
    });

    // Enviar em lotes para não ultrapassar rate limit
    let enviados = 0;
    for (const pedido of pedidos) {
      await logVenda(client, pedido, { nomeProduto: pedido.produto_nome });
      enviados++;
      // Pausa a cada 5 vendas para evitar rate limit
      if (enviados % 5 === 0) await new Promise(r => setTimeout(r, 1500));
    }

    // Marcar como enviado
    db.prepare("INSERT OR REPLACE INTO configuracoes (chave,valor,tipo) VALUES ('historico_vendas_enviado','1','string')").run();

    await canal.send({
      embeds: [new EmbedBuilder()
        .setColor(0x00D26A)
        .setTitle('✅ Histórico Enviado')
        .setDescription(`> **${enviados}** venda(s) carregadas com sucesso.`)
        .setTimestamp()],
    });

    console.log(`[CanalVendas] Histórico enviado: ${enviados} vendas`);
  } catch (err) {
    console.error('[CanalVendas] Erro ao enviar histórico:', err.message);
  }
}

module.exports = { logVenda, enviarHistoricoVendas, CANAL_VENDAS_LOG };
