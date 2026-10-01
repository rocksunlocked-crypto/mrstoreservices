/**
 * Sistema de Códigos de Coins
 * - Admin gera códigos com valor definido (ex: SHOP-ABC123 = 500 coins)
 * - Cada código só pode ser resgatado UMA vez
 * - Só códigos gerados pelo bot são válidos
 * - Usuário resgata pelo embed fixo no canal com modal
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { db, Usuarios } = require('../database/database');
const { addCoins, COIN_EMOJI } = require('./coins');
const { log } = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');

// ─── Gerar códigos ────────────────────────────────────────────────────────────
function gerarCodigos({ quantidade, coinsValor, criadoPor }) {
  const chars  = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem 0, O, 1, I (ambíguos)
  const codigos = [];

  for (let i = 0; i < quantidade; i++) {
    // Formato: XXXX-XXXX-XXXX
    let cod = '';
    for (let j = 0; j < 12; j++) {
      if (j === 4 || j === 8) cod += '-';
      cod += chars[Math.floor(Math.random() * chars.length)];
    }

    db.prepare('INSERT INTO codigos_coins (id, codigo, coins, criado_por) VALUES (?,?,?,?)')
      .run(uuidv4(), cod, coinsValor, criadoPor);
    codigos.push(cod);
  }

  return codigos;
}

// ─── Resgatar código ──────────────────────────────────────────────────────────
async function resgatarCodigo(interaction, codigoInput) {
  if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ ephemeral: true });

  const codigo = codigoInput.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');

  // Buscar código no banco
  const registro = db.prepare('SELECT * FROM codigos_coins WHERE codigo=?').get(codigo);

  if (!registro) {
    return interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(config.colors.error)
        .setTitle('❌ Código Inválido')
        .setDescription('Este código não existe ou não foi gerado pelo bot.')
        .setTimestamp()],
    });
  }

  if (registro.usado) {
    return interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(config.colors.error)
        .setTitle('❌ Código Já Utilizado')
        .setDescription('Este código já foi resgatado e não pode ser usado novamente.')
        .setTimestamp()],
    });
  }

  // Marcar como usado
  db.prepare("UPDATE codigos_coins SET usado=1, usado_por=?, usado_em=strftime('%s','now') WHERE id=?")
    .run(interaction.user.id, registro.id);

  // Creditar coins
  Usuarios.garantir(interaction.user.id, interaction.user.username);
  const novoSaldo = addCoins(interaction.user.id, registro.coins, `Código resgatado: ${codigo}`);

  const emReais = (registro.coins * 0.01).toFixed(2);

  await interaction.editReply({
    embeds: [new EmbedBuilder()
      .setColor(config.colors.success)
      .setTitle(`${COIN_EMOJI} Código Resgatado com Sucesso!`)
      .setDescription([
        `✅ O código **${codigo}** foi resgatado!`,
        '',
        `${COIN_EMOJI} **+${registro.coins.toLocaleString('pt-BR')} coins** adicionados`,
        `💵 Equivale a **R$ ${emReais}**`,
        `${COIN_EMOJI} **Saldo atual:** ${novoSaldo.toLocaleString('pt-BR')} coins`,
      ].join('\n'))
      .setTimestamp()
      .setFooter({ text: 'Máximo Store • Use seus coins para comprar produtos!' })],
  });

  await log('sistema', {
    usuario:   interaction.user.id,
    descricao: `${COIN_EMOJI} Código de coins resgatado: ${codigo} (+${registro.coins} coins)`,
  });
}

// ─── Embed fixo do canal — uma mensagem com 4 botões ─────────────────────────
async function enviarEmbedResgate(guild, canalId) {
  const canal = guild.channels.cache.get(canalId);
  if (!canal) return console.error('[Embed] Canal não encontrado:', canalId);

  // Deletar msgs antigas do bot
  const msgs = await canal.messages.fetch({ limit: 10 }).catch(() => null);
  const botMsgs = msgs?.filter(m => m.author.id === guild.client.user.id);
  if (botMsgs?.size) {
    for (const [, m] of botMsgs) await m.delete().catch(() => {});
    await new Promise(r => setTimeout(r, 500));
  }

  const totalCodigos = db.prepare('SELECT COUNT(*) as c FROM codigos_coins WHERE usado=0').get().c;
  const totalUsos    = db.prepare('SELECT COUNT(*) as c FROM convite_usos').get().c;

  const embed = new EmbedBuilder()
    .setColor(0xFFD700)
    .setTitle(`${COIN_EMOJI} Central de Coins & Convites`)
    .setDescription([
      `> Ganhe coins, use na loja e saque o saldo direto no seu PIX!`,
      '',
      `**📌 Como ganhar coins:**`,
      `🛒 **Compra sem cupom:** ganhe **5% de cashback** em coins automaticamente`,
      `🎁 **Código de coins** (do admin): resgate e receba coins instantaneamente`,
      `🔗 **Código de convite**: use o código de alguém e ganhe **+15 coins**`,
      `🤝 **Seu código**: quando alguém usar, você ganha **+5 coins**`,
      '',
      `**💸 Como sacar seus coins:**`,
      `> \`1.\` Clique em **💸 Sacar via PIX** abaixo`,
      `> \`2.\` Informe a quantidade de coins e sua chave PIX`,
      `> \`3.\` Aguarde aprovação — o valor cai na sua conta em minutos`,
      `> ⚠️ Mínimo de saque: **100 coins (R$ 1,00)**`,
      '',
      `> 💵 **100 coins = R$ 1,00** em qualquer produto da loja`,
      `> ${totalUsos} pessoas já usaram códigos de convite!`,
    ].join('\n'))
    .addFields(
      { name: `🎁 Código de Coins`,   value: `Resgatar código\ndo admin`,           inline: true },
      { name: `🔗 Criar Código`,      value: `Gere seu código\nde convite`,          inline: true },
      { name: `✅ Usar Código`,        value: `Use o código\nde alguém (+15 coins)`,  inline: true },
      { name: `💰 Meu Saldo`,         value: `Ver seus coins\ne histórico`,           inline: true },
      { name: `💸 Sacar via PIX`,     value: `Converter coins\nem dinheiro real`,     inline: true },
    )
    .setTimestamp()
    .setFooter({ text: `Máximo Store • ${totalCodigos} código(s) de coins disponíveis` });

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('resgatar_codigo_coins').setLabel(`${COIN_EMOJI} Código de Coins`).setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('convite_criar_codigo').setLabel('🔗 Criar Meu Código').setStyle(ButtonStyle.Primary),
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('convite_usar_codigo').setLabel('🎁 Usar Código de Convite').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('ver_saldo_coins').setLabel('💰 Ver Meu Saldo').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('sacar_coins_pix').setLabel('💸 Sacar via PIX').setStyle(ButtonStyle.Danger),
  );

  await canal.send({ embeds: [embed], components: [row1, row2] });
  console.log(`[Embed] Canal de coins/convites atualizado: ${canalId}`);
}

module.exports = { gerarCodigos, resgatarCodigo, enviarEmbedResgate };
