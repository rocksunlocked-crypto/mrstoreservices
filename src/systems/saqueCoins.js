/**
 * Sistema de Saque de Coins via PIX
 * - 100 coins = R$1,00
 * - Mínimo: 100 coins (R$1,00)
 * - Cashback: 5% em compras sem cupom
 * - Aprovação manual pelo cargo Aceitar Compra
 */

const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const { db, Usuarios } = require('../database/database');
const { addCoins, COIN_EMOJI } = require('./coins');
const { log }  = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');
const config   = require('../config');

const CANAL_SAQUES      = '1545265490216095834'; // canal onde caem os pedidos de saque
const CANAL_COINS       = '1544209839108915330'; // canal do painel de coins
const COINS_POR_REAL    = 100;                   // 100 coins = R$1,00
const SAQUE_MINIMO_COINS = 100;                  // mínimo R$1,00

// ─── Abrir modal de saque ─────────────────────────────────────────────────────
async function abrirModalSaque(interaction) {
  const usuario = Usuarios.get(interaction.user.id);
  const coins   = usuario?.coins || 0;

  if (coins < 1) {
    return interaction.reply({
      content: `❌ Você não tem coins para sacar.`,
      ephemeral: true,
    });
  }

  const modal = new ModalBuilder()
    .setCustomId('modal_saque_coins')
    .setTitle('💸 Saque de Coins via PIX');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('coins')
        .setLabel(`Quantidade de coins (você tem: ${coins})`)
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder(`Ex: ${Math.min(coins, 1000)}`)
        .setMaxLength(10),
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('chave_pix')
        .setLabel('Chave PIX (CPF, email, tel. ou aleatória)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('Ex: 12345678900 ou email@exemplo.com'),
    ),
  );

  return interaction.showModal(modal);
}

// ─── Processar solicitação de saque ──────────────────────────────────────────
async function processarSolicitacaoSaque(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const usuario = Usuarios.garantir(interaction.user.id, interaction.user.username);
  if (usuario.bloqueado) return interaction.editReply({ content: '🚫 Conta bloqueada.' });

  const coinsStr = interaction.fields.getTextInputValue('coins').trim();
  const chavePix = interaction.fields.getTextInputValue('chave_pix').trim();
  const qtdCoins = parseInt(coinsStr);

  if (isNaN(qtdCoins) || qtdCoins < 1) {
    return interaction.editReply({ content: `❌ Quantidade inválida. Digite um número maior que 0.` });
  }

  const saldoAtual = usuario.coins || 0;
  if (qtdCoins > saldoAtual) {
    return interaction.editReply({ content: `❌ Coins insuficientes. Você tem **${saldoAtual.toLocaleString('pt-BR')} ${COIN_EMOJI}** (R$ ${(saldoAtual/100).toFixed(2)}).` });
  }

  // Verificar saque pendente
  const pendente = db.prepare("SELECT id FROM saques_coins WHERE usuario_id=? AND status='pendente'").get(interaction.user.id);
  if (pendente) {
    return interaction.editReply({ content: `⚠️ Você já tem um saque pendente de aprovação. Aguarde a resolução antes de solicitar outro.` });
  }

  const valorReais = qtdCoins / COINS_POR_REAL;
  const saqueId    = uuidv4();

  // Debitar coins imediatamente (reserva)
  addCoins(interaction.user.id, -qtdCoins, `Saque solicitado — ${qtdCoins} coins`);

  // Criar saque
  db.prepare('INSERT INTO saques_coins (id,usuario_id,coins,valor_reais,chave_pix,status) VALUES (?,?,?,?,?,?)')
    .run(saqueId, interaction.user.id, qtdCoins, valorReais, chavePix, 'pendente');

  // Enviar para o canal de aprovação
  const guild = interaction.guild;
  const canalSaques = guild?.channels.cache.get(CANAL_SAQUES);
  if (canalSaques) {
    const member = await guild.members.fetch(interaction.user.id).catch(() => null);
    const embedSaque = new EmbedBuilder()
      .setColor(0xFFD700)
      .setTitle('💸 Novo Pedido de Saque')
      .setDescription(`> <@&${config.roles.aceitarCompra}> — Novo saque aguardando aprovação.`)
      .addFields(
        { name: '👤 Usuário',    value: `<@${interaction.user.id}> (${interaction.user.username})`, inline: true },
        { name: `${COIN_EMOJI} Coins`,  value: `**${qtdCoins.toLocaleString('pt-BR')}**`,         inline: true },
        { name: '💵 Valor',      value: `**R$ ${valorReais.toFixed(2)}**`,                        inline: true },
        { name: '🔑 Chave PIX',  value: `\`${chavePix}\``,                                       inline: false },
        { name: '🆔 Saque ID',   value: `\`${saqueId.slice(0,8).toUpperCase()}\``,               inline: true },
        { name: '📊 Saldo antes', value: `${saldoAtual.toLocaleString('pt-BR')} coins`,           inline: true },
      )
      .setTimestamp()
      .setFooter({ text: 'Máximo Store • Saques de Coins' });

    const rowAprovar = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`saque_aprovar_${saqueId}`).setLabel('✅ Aprovar e Enviar PIX').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`saque_rejeitar_${saqueId}`).setLabel('❌ Rejeitar').setStyle(ButtonStyle.Danger),
    );

    await canalSaques.send({
      content: `<@&${config.roles.aceitarCompra}>`,
      embeds: [embedSaque],
      components: [rowAprovar],
    });
  }

  await interaction.editReply({
    embeds: [new EmbedBuilder()
      .setColor(config.colors.success)
      .setTitle('✅ Saque Solicitado!')
      .setDescription([
        `> Sua solicitação foi enviada para aprovação.`,
        `> Assim que aprovada, o valor será enviado para sua chave PIX.`,
      ].join('\n'))
      .addFields(
        { name: `${COIN_EMOJI} Coins`,   value: `**${qtdCoins.toLocaleString('pt-BR')}**`, inline: true },
        { name: '💵 Valor',    value: `**R$ ${valorReais.toFixed(2)}**`,     inline: true },
        { name: '🔑 Chave',    value: `\`${chavePix}\``,                     inline: true },
      )
      .setTimestamp()
      .setFooter({ text: 'Máximo Store • Aguarde a aprovação' })],
  });

  await log('sistema', {
    usuario:   interaction.user.id,
    descricao: `💸 Saque solicitado: ${qtdCoins} coins (R$ ${valorReais.toFixed(2)}) → ${chavePix}`,
  });
}

// ─── Aprovar saque (manual — admin envia PIX por conta própria) ──────────────
async function aprovarSaque(interaction, saqueId) {
  await interaction.deferReply({ ephemeral: false });

  const { podeAceitarCompra } = require('../utils/permissions');
  if (!podeAceitarCompra(interaction.member)) {
    return interaction.editReply({ content: '❌ Apenas quem tem o cargo **Aceitar Compra** pode aprovar saques.' });
  }

  const saque = db.prepare('SELECT * FROM saques_coins WHERE id=?').get(saqueId);
  if (!saque) return interaction.editReply({ content: '❌ Saque não encontrado.' });
  if (saque.status !== 'pendente') return interaction.editReply({ content: `⚠️ Saque já está como: **${saque.status}**` });

  db.prepare("UPDATE saques_coins SET status='aprovado', aprovado_por=?, resolvido_em=strftime('%s','now') WHERE id=?")
    .run(interaction.user.id, saqueId);

  // Notificar usuário no privado
  const guild  = interaction.guild;
  const member = await guild?.members.fetch(saque.usuario_id).catch(() => null);
  if (member) {
    await member.send({
      embeds: [new EmbedBuilder()
        .setColor(config.colors.success)
        .setTitle('💸 Saque Aprovado!')
        .setDescription([
          `> Seu saque foi **aprovado** e o PIX está sendo enviado para sua chave.`,
          `> Verifique sua conta em alguns instantes.`,
        ].join('\n'))
        .addFields(
          { name: `${COIN_EMOJI} Coins`,    value: `**${saque.coins.toLocaleString('pt-BR')}**`,   inline: true },
          { name: '💵 Valor',     value: `**R$ ${Number(saque.valor_reais).toFixed(2)}**`,         inline: true },
          { name: '🔑 Chave PIX', value: `\`${saque.chave_pix}\``,                                inline: true },
          { name: '✅ Aprovado por', value: `<@${interaction.user.id}>`,                           inline: false },
        )
        .setTimestamp()
        .setFooter({ text: 'Máximo Store • O PIX pode levar alguns instantes para chegar' })],
    }).catch(() => {});
  }

  // Atualizar embed no canal de saques
  await interaction.message.edit({
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('_').setLabel(`✅ Aprovado por ${interaction.user.username}`).setStyle(ButtonStyle.Success).setDisabled(true),
    )],
  }).catch(() => {});

  await interaction.editReply({
    embeds: [new EmbedBuilder()
      .setColor(config.colors.success)
      .setTitle('✅ Saque Aprovado!')
      .setDescription('> Usuário notificado no privado. Envie o PIX manualmente.')
      .addFields(
        { name: '👤 Usuário',    value: `<@${saque.usuario_id}>`,                        inline: true },
        { name: '💵 Valor',      value: `R$ ${Number(saque.valor_reais).toFixed(2)}`,    inline: true },
        { name: '🔑 Chave PIX',  value: `\`${saque.chave_pix}\``,                       inline: true },
        { name: '✅ Aprovado por', value: `<@${interaction.user.id}>`,                   inline: false },
      )
      .setTimestamp()],
  });

  await log('pagamento', {
    executor:  interaction.user.id,
    usuario:   saque.usuario_id,
    valor:     saque.valor_reais,
    descricao: `💸 Saque APROVADO por <@${interaction.user.id}> | Usuário: <@${saque.usuario_id}> | R$ ${Number(saque.valor_reais).toFixed(2)} → \`${saque.chave_pix}\``,
  });
}

// ─── Rejeitar saque ───────────────────────────────────────────────────────────
async function rejeitarSaque(interaction, saqueId) {
  const { podeAceitarCompra } = require('../utils/permissions');
  if (!podeAceitarCompra(interaction.member)) {
    return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
  }

  const modal = new ModalBuilder().setCustomId(`modal_rejeitar_saque_${saqueId}`).setTitle('❌ Rejeitar Saque');
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('motivo').setLabel('Motivo da rejeição').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: Chave PIX inválida'),
    ),
  );
  return interaction.showModal(modal);
}

async function processarRejeicaoSaque(interaction, saqueId) {
  await interaction.deferReply({ ephemeral: false });
  const motivo = interaction.fields.getTextInputValue('motivo').trim();

  const saque = db.prepare('SELECT * FROM saques_coins WHERE id=?').get(saqueId);
  if (!saque || saque.status !== 'pendente') return interaction.editReply({ content: '⚠️ Saque não está mais pendente.' });

  // Devolver coins
  addCoins(saque.usuario_id, saque.coins, `Saque rejeitado — ${motivo}`);
  db.prepare("UPDATE saques_coins SET status='rejeitado', aprovado_por=?, motivo_rejeicao=?, resolvido_em=strftime('%s','now') WHERE id=?")
    .run(interaction.user.id, motivo, saqueId);

  // Notificar usuário no privado
  const member = await interaction.guild?.members.fetch(saque.usuario_id).catch(() => null);
  if (member) {
    await member.send({
      embeds: [new EmbedBuilder()
        .setColor(config.colors.error)
        .setTitle('❌ Saque Rejeitado')
        .setDescription([
          `> Seu pedido de saque foi **rejeitado**.`,
          `> Os coins foram **devolvidos** para o seu saldo automaticamente.`,
        ].join('\n'))
        .addFields(
          { name: `${COIN_EMOJI} Coins devolvidos`, value: `**${saque.coins.toLocaleString('pt-BR')}**`, inline: true },
          { name: '💵 Valor',                       value: `R$ ${Number(saque.valor_reais).toFixed(2)}`,  inline: true },
          { name: '❌ Motivo',                       value: motivo,                                        inline: false },
          { name: '🔧 Rejeitado por',               value: `<@${interaction.user.id}>`,                  inline: false },
        )
        .setTimestamp()
        .setFooter({ text: 'Máximo Store • Abra um ticket se achar que é um erro' })],
    }).catch(() => {});
  }

  await interaction.editReply({
    embeds: [new EmbedBuilder()
      .setColor(config.colors.error)
      .setTitle('❌ Saque Rejeitado')
      .setDescription('> Coins devolvidos ao usuário e notificação enviada no privado.')
      .addFields(
        { name: '👤 Usuário',       value: `<@${saque.usuario_id}>`,                      inline: true },
        { name: `${COIN_EMOJI} Coins`, value: `${saque.coins.toLocaleString('pt-BR')}`, inline: true },
        { name: '❌ Motivo',        value: motivo,                                        inline: false },
        { name: '🔧 Rejeitado por', value: `<@${interaction.user.id}>`,                  inline: false },
      )
      .setTimestamp()],
  });

  await interaction.message.edit({
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('_').setLabel(`❌ Rejeitado por ${interaction.user.username}`).setStyle(ButtonStyle.Danger).setDisabled(true),
    )],
  }).catch(() => {});

  await log('sistema', {
    executor:  interaction.user.id,
    usuario:   saque.usuario_id,
    descricao: `💸 Saque REJEITADO por <@${interaction.user.id}> | Usuário: <@${saque.usuario_id}> | ${saque.coins} coins | Motivo: ${motivo}`,
  });
}

// ─── Atualizar painel de coins com botão de saque ─────────────────────────────
async function atualizarPainelCoins(guild) {
  try {
    const { enviarEmbedResgate } = require('./codigosCoins');
    await enviarEmbedResgate(guild, CANAL_COINS);
  } catch {}
}

module.exports = {
  abrirModalSaque, processarSolicitacaoSaque,
  aprovarSaque, rejeitarSaque, processarRejeicaoSaque,
  atualizarPainelCoins,
  COINS_POR_REAL, SAQUE_MINIMO_COINS,
};
