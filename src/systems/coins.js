/**
 * Sistema de Coins
 * 1 coin = R$ 0,01 | 100 coins = R$ 1,00
 * Owner pode adicionar coins pra qualquer pessoa
 * Usuário pode comprar coins via PIX ou usar coins pra comprar produtos
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config  = require('../config');
const { db, Usuarios } = require('../database/database');
const { log }  = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

const COIN_EMOJI  = '🪙';
const VALOR_COIN  = config.coins.valorPorCoin;   // 0.01
const RATE        = config.coins.conversionRate;  // 100 coins = R$1

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getCoins(discordId) {
  const u = db.prepare('SELECT coins FROM usuarios WHERE discord_id=?').get(discordId);
  return u?.coins || 0;
}

function addCoins(discordId, quantidade, motivo = '', executorId = null) {
  const u = Usuarios.get(discordId);
  if (!u) return 0;
  const anterior = u.coins || 0;
  const novo     = anterior + quantidade;
  db.prepare('UPDATE usuarios SET coins=? WHERE discord_id=?').run(novo, discordId);
  // Registrar transação
  db.prepare(`
    INSERT INTO transacoes (id, usuario_id, tipo, valor, saldo_ant, saldo_novo, descricao, ref_id)
    VALUES (?,?,?,?,?,?,?,?)
  `).run(
    uuidv4(), discordId,
    quantidade > 0 ? 'coins_credito' : 'coins_debito',
    Math.abs(quantidade),
    anterior, novo,
    motivo || (quantidade > 0 ? 'Crédito de coins' : 'Débito de coins'),
    executorId || discordId,
  );
  return novo;
}

function gastarCoins(discordId, quantidade, motivo = '') {
  const atual = getCoins(discordId);
  if (atual < quantidade) return { ok: false, erro: `Coins insuficientes. Você tem ${atual}${COIN_EMOJI} mas precisa de ${quantidade}${COIN_EMOJI}.` };
  const novo = addCoins(discordId, -quantidade, motivo);
  return { ok: true, novo };
}

// Converter coins para reais
function coinsParaReais(coins) { return coins * VALOR_COIN; }
// Converter reais para coins
function reaisParaCoins(reais)  { return Math.floor(reais / VALOR_COIN); }

// ─── Embed de saldo de coins ──────────────────────────────────────────────────
function embedSaldoCoins(usuario, member) {
  const coins = usuario.coins || 0;
  const emReais = coinsParaReais(coins).toFixed(2);

  return new EmbedBuilder()
    .setColor(config.colors.coins)
    .setTitle(`${COIN_EMOJI} Coins — ${member.displayName}`)
    .setThumbnail(member.displayAvatarURL({ size: 128 }))
    .addFields(
      { name: `${COIN_EMOJI} Coins`,       value: `**${coins.toLocaleString('pt-BR')}**`,  inline: true },
      { name: '💵 Equivale a',             value: `**R$ ${emReais}**`,                       inline: true },
      { name: '📊 Conversão',              value: `100${COIN_EMOJI} = R$ 1,00`,              inline: true },
    )
    .setTimestamp()
    .setFooter({ text: 'Máximo Store • Sistema de Coins' });
}

// ─── Iniciar compra de coins via PIX ─────────────────────────────────────────
async function iniciarCompraCoins(interaction, quantidade) {
  const valorReais = coinsParaReais(quantidade);

  if (valorReais < 1) {
    return interaction.reply({ content: `❌ Mínimo de compra: 100${COIN_EMOJI} (R$ 1,00)`, ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  const usuario  = Usuarios.garantir(interaction.user.id, interaction.user.username);
  const pedidoId = uuidv4();

  // Registrar pedido especial de coins
  db.prepare(`
    INSERT INTO pedidos (id, usuario_id, produto_id, quantidade, valor_unit, valor_total, desconto, metodo_pag, nota_fiscal)
    VALUES (?,?,?,?,?,?,0,'pix',?)
  `).run(pedidoId, interaction.user.id, 'COINS', quantidade, VALOR_COIN, valorReais, JSON.stringify({ tipo: 'coins', quantidade }));

  // Gerar PIX
  const QRCode = require('qrcode');
  const efi    = require('./efi');
  let qrData, cobranca;

  try {
    cobranca = await efi.criarCobrancaPix({
      valor:       valorReais,
      descricao:   `Máximo Store — ${quantidade} Coins`,
      pedidoId,
      nomeCliente: interaction.user.username,
    });
    db.prepare('UPDATE pedidos SET tx_id=? WHERE id=?').run(cobranca.txid, pedidoId);
    qrData = await efi.gerarQRCode(cobranca.txid);
  } catch (err) {
    cobranca = { txid: `SIM_${pedidoId.slice(0,8)}` };
    qrData   = { qrcode: `PIX_COINS_${pedidoId.slice(0,8)}` };
    db.prepare('UPDATE pedidos SET tx_id=? WHERE id=?').run(cobranca.txid, pedidoId);
  }

  let qrBuf = null;
  try { qrBuf = await QRCode.toBuffer(qrData.qrcode, { width: 300, margin: 2 }); } catch {}

  const { AttachmentBuilder } = require('discord.js');
  const embed = new EmbedBuilder()
    .setColor(config.colors.coins)
    .setTitle(`${COIN_EMOJI} Comprar Coins — PIX`)
    .setDescription([
      `> Pague via PIX e receba seus coins instantaneamente!`,
      '',
      `${COIN_EMOJI} **Coins:** ${quantidade.toLocaleString('pt-BR')}`,
      `💵 **Valor:** R$ ${valorReais.toFixed(2)}`,
      `🆔 **Pedido:** \`${pedidoId.slice(0,8).toUpperCase()}\``,
    ].join('\n'))
    .addFields({ name: '📋 Código PIX', value: `\`\`\`${qrData.qrcode}\`\`\`` })
    .setTimestamp()
    .setFooter({ text: 'Coins creditados automaticamente após confirmação' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`verificar_pix_${pedidoId}`).setLabel('🔄 Verificar').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`cancelar_pedido_${pedidoId}`).setLabel('❌ Cancelar').setStyle(ButtonStyle.Danger),
  );

  const payload = { embeds: [embed], components: [row] };
  if (qrBuf) {
    const att = new AttachmentBuilder(qrBuf, { name: 'qrcode.png' });
    embed.setImage('attachment://qrcode.png');
    payload.files = [att];
  }

  await interaction.editReply(payload);

  // Polling
  const { iniciarPollingPagamento } = require('./loja');
  iniciarPollingPagamento(pedidoId, cobranca.txid, interaction.guild, interaction.client);
}

// ─── Entregar coins após pagamento ────────────────────────────────────────────
async function entregarCoins(pedido, client) {
  try {
    const nota = pedido.nota_fiscal ? JSON.parse(pedido.nota_fiscal) : null;
    if (nota?.tipo !== 'coins') return false;

    const quantidade = nota.quantidade || nota.qtdCoins || 0;
    if (!quantidade) return false;

    const novo       = addCoins(pedido.usuario_id, quantidade, `Compra de ${quantidade} coins via PIX`);

    db.prepare("UPDATE pedidos SET status='entregue', entregue_em=strftime('%s','now') WHERE id=?").run(pedido.id);

    if (!client) return true;
    const guild  = client.guilds.cache.first();
    const member = await guild?.members.fetch(pedido.usuario_id).catch(() => null);
    if (member) {
      await member.send({
        embeds: [new EmbedBuilder()
          .setColor(config.colors.coins)
          .setTitle(`${COIN_EMOJI} Coins Recebidos!`)
          .setDescription(`Você recebeu **${quantidade.toLocaleString('pt-BR')} coins**!\nSeu saldo atual: **${novo.toLocaleString('pt-BR')} coins** (R$ ${coinsParaReais(novo).toFixed(2)})`)
          .setTimestamp()],
      }).catch(() => {});
    }

    await log('pagamento', {
      usuario:  pedido.usuario_id,
      valor:    pedido.valor_total,
      descricao: `${quantidade} coins entregues após pagamento PIX`,
    });

    return true;
  } catch (err) {
    console.error('[Coins]', err.message);
    return false;
  }
}

module.exports = {
  getCoins, addCoins, gastarCoins,
  coinsParaReais, reaisParaCoins,
  embedSaldoCoins, iniciarCompraCoins, entregarCoins,
  COIN_EMOJI, VALOR_COIN, RATE,
};
