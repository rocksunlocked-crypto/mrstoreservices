/**
 * Submenu de Solicitação de Saque — Afiliados
 * Padrão: estado em memória → botões → modais → confirmar
 */

const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const { db, Config } = require('../database/database');
const config = require('../config');

const CANAL_SAQUES = '1545265490216095834';

// ─── Estado em memória ────────────────────────────────────────────────────────
const sessoes = new Map();

function novaSessao(userId, saldoDisponivel) {
  const s = { userId, saldoDisponivel, valor: null, nome: null, tipoPix: null, chavePix: null };
  sessoes.set(userId, s);
  const t = setTimeout(() => sessoes.delete(userId), 30 * 60 * 1000);
  t.unref?.();
  return s;
}
function getSessao(userId) { return sessoes.get(userId) || null; }
function setSessao(userId, patch) { const s = getSessao(userId); if (s) Object.assign(s, patch); }
function delSessao(userId) { sessoes.delete(userId); }

// ─── Montar embed de status ───────────────────────────────────────────────────
function buildEmbed(s) {
  const ok = v => v ? '🟢' : '🔴';
  const pct = [s.valor, s.nome, s.tipoPix, s.chavePix].filter(Boolean).length;
  const barra = '█'.repeat(pct) + '░'.repeat(4 - pct);

  return new EmbedBuilder()
    .setColor(pct === 4 ? 0x9B59B6 : 0x95A5A6)
    .setTitle('💸 Solicitar Saque')
    .setDescription('> Preencha todos os campos para confirmar o pedido de saque.')
    .addFields(
      { name: `${ok(s.valor)} Valor`,         value: s.valor   ? `**R$ ${Number(s.valor).toFixed(2)}**`  : '`não preenchido`', inline: true },
      { name: `${ok(s.nome)} Nome Completo`,  value: s.nome    ? `\`${s.nome}\``                         : '`não preenchido`', inline: true },
      { name: `${ok(s.tipoPix)} Tipo PIX`,    value: s.tipoPix ? `\`${s.tipoPix}\``                      : '`não preenchido`', inline: true },
      { name: `${ok(s.chavePix)} Chave PIX`,  value: s.chavePix? `\`${s.chavePix}\``                     : '`não preenchido`', inline: true },
      { name: '💰 Saldo disponível',          value: `R$ ${Number(s.saldoDisponivel).toFixed(2)}`,        inline: true },
      { name: '📊 Progresso',                  value: `\`${barra}\` ${pct * 25}%`,                       inline: true },
    )
    .setTimestamp()
    .setFooter({ text: 'Máximo Store • Saque Afiliado' });
}

function buildRows(s) {
  const podeConfirmar = !!(s.valor && s.nome && s.tipoPix && s.chavePix);
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('saque_campo_valor').setLabel('💵 Valor').setStyle(s.valor ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('saque_campo_nome').setLabel('👤 Nome').setStyle(s.nome ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('saque_campo_tipo').setLabel('🔑 Tipo PIX').setStyle(s.tipoPix ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('saque_campo_chave').setLabel('📋 Chave PIX').setStyle(s.chavePix ? ButtonStyle.Success : ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('saque_confirmar').setLabel('✅ Confirmar Saque').setStyle(ButtonStyle.Primary).setDisabled(!podeConfirmar),
      new ButtonBuilder().setCustomId('saque_cancelar').setLabel('❌ Cancelar').setStyle(ButtonStyle.Danger),
    ),
  ];
}

// ─── Abrir submenu ────────────────────────────────────────────────────────────
async function abrirSaqueSubmenu(interaction, afilId) {
  const usuario = db.prepare('SELECT * FROM usuarios WHERE discord_id=?').get(afilId);
  if (!usuario) return interaction.reply({ content: '❌ Usuário não encontrado.', ephemeral: true });

  const minSaque = parseFloat(Config.get('min_saque_afiliado') || '20');
  if ((usuario.saldo || 0) < minSaque) {
    return interaction.reply({
      content: `❌ Saldo insuficiente.\n💰 Seu saldo: **R$ ${Number(usuario.saldo||0).toFixed(2)}** | Mínimo: **R$ ${minSaque.toFixed(2)}**`,
      ephemeral: true,
    });
  }

  // Sessão sempre pela chave do usuário que está interagindo
  const s = novaSessao(interaction.user.id, usuario.saldo || 0);
  s.afilId = afilId; // guardar o afilId real separado
  setSessao(interaction.user.id, { valor: Number(usuario.saldo).toFixed(2) });

  if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ ephemeral: true });
  return interaction.editReply({ embeds: [buildEmbed(s)], components: buildRows(s) });
}

// ─── Re-renderizar ────────────────────────────────────────────────────────────
async function rerender(interaction) {
  const s = getSessao(interaction.user.id);
  if (!s) return interaction.reply({ content: '❌ Sessão expirada.', ephemeral: true });
  await interaction.update({ embeds: [buildEmbed(s)], components: buildRows(s) }).catch(() =>
    interaction.editReply({ embeds: [buildEmbed(s)], components: buildRows(s) }));
}

// ─── Modais de cada campo ─────────────────────────────────────────────────────
async function modalValor(interaction) {
  const s = getSessao(interaction.user.id);
  if (!s) return interaction.reply({ content: '❌ Sessão expirada.', ephemeral: true });
  const modal = new ModalBuilder().setCustomId('saque_m_valor').setTitle('💵 Valor do Saque');
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('valor')
        .setLabel(`Valor (saldo: R$ ${Number(s.saldoDisponivel).toFixed(2)})`)
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setValue(s.valor ? String(s.valor) : Number(s.saldoDisponivel).toFixed(2))
        .setPlaceholder(`Ex: ${Number(s.saldoDisponivel).toFixed(2)}`),
    ),
  );
  return interaction.showModal(modal);
}

async function modalNome(interaction) {
  const s = getSessao(interaction.user.id);
  if (!s) return interaction.reply({ content: '❌ Sessão expirada.', ephemeral: true });
  const modal = new ModalBuilder().setCustomId('saque_m_nome').setTitle('👤 Nome Completo');
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('nome')
        .setLabel('Nome completo (como está no banco/PIX)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setValue(s.nome || '')
        .setPlaceholder('Ex: João da Silva'),
    ),
  );
  return interaction.showModal(modal);
}

async function modalTipoPix(interaction) {
  const s = getSessao(interaction.user.id);
  if (!s) return interaction.reply({ content: '❌ Sessão expirada.', ephemeral: true });
  const modal = new ModalBuilder().setCustomId('saque_m_tipo').setTitle('🔑 Tipo da Chave PIX');
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('tipo')
        .setLabel('Tipo: CPF, E-mail, Telefone ou Aleatória')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setValue(s.tipoPix || '')
        .setPlaceholder('Ex: CPF'),
    ),
  );
  return interaction.showModal(modal);
}

async function modalChavePix(interaction) {
  const s = getSessao(interaction.user.id);
  if (!s) return interaction.reply({ content: '❌ Sessão expirada.', ephemeral: true });
  const modal = new ModalBuilder().setCustomId('saque_m_chave').setTitle('📋 Chave PIX');
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('chave')
        .setLabel('Chave PIX')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setValue(s.chavePix || '')
        .setPlaceholder('Cole sua chave PIX aqui'),
    ),
  );
  return interaction.showModal(modal);
}

// ─── Processadores de modais ──────────────────────────────────────────────────
async function processarValor(interaction) {
  const s = getSessao(interaction.user.id);
  if (!s) return interaction.reply({ content: '❌ Sessão expirada.', ephemeral: true });
  const valor = parseFloat(interaction.fields.getTextInputValue('valor').trim().replace(',', '.'));
  if (isNaN(valor) || valor <= 0) return interaction.reply({ content: '❌ Valor inválido.', ephemeral: true });
  const minSaque = parseFloat(Config.get('min_saque_afiliado') || '20');
  if (valor < minSaque) return interaction.reply({ content: `❌ Valor mínimo: **R$ ${minSaque.toFixed(2)}**`, ephemeral: true });
  if (valor > s.saldoDisponivel) return interaction.reply({ content: `❌ Valor superior ao saldo disponível (**R$ ${Number(s.saldoDisponivel).toFixed(2)}**).`, ephemeral: true });
  setSessao(interaction.user.id, { valor: valor.toFixed(2) });
  return rerender(interaction);
}

async function processarNome(interaction) {
  const nome = interaction.fields.getTextInputValue('nome').trim();
  setSessao(interaction.user.id, { nome });
  return rerender(interaction);
}

async function processarTipo(interaction) {
  const tipo = interaction.fields.getTextInputValue('tipo').trim();
  setSessao(interaction.user.id, { tipoPix: tipo });
  return rerender(interaction);
}

async function processarChave(interaction) {
  const chave = interaction.fields.getTextInputValue('chave').trim();
  setSessao(interaction.user.id, { chavePix: chave });
  return rerender(interaction);
}

// ─── Confirmar saque ──────────────────────────────────────────────────────────
async function confirmarSaque(interaction) {
  await interaction.deferUpdate().catch(() => {});
  const s = getSessao(interaction.user.id);
  if (!s?.valor || !s?.nome || !s?.tipoPix || !s?.chavePix) return;

  const afilId  = s.afilId || s.userId;
  const usuario = db.prepare('SELECT * FROM usuarios WHERE discord_id=?').get(afilId);
  if (!usuario) return;

  const valor = parseFloat(s.valor);
  if (valor > (usuario.saldo || 0)) {
    return interaction.editReply({ content: '❌ Saldo insuficiente no momento.', embeds: [], components: [] });
  }

  // Enviar para o canal de saques
  const guild = interaction.guild;
  const canal = guild?.channels.cache.get(CANAL_SAQUES);
  if (!canal) return interaction.editReply({ content: '❌ Canal de saques não configurado.', embeds: [], components: [] });

  const nivelLabel = usuario.nivel_afil === 1 ? '🥇 Nível 1' : '🥈 Nível 2';

  const embedSaque = new EmbedBuilder()
    .setColor(0x9B59B6)
    .setTitle('💸 Pedido de Saque — Afiliado')
    .addFields(
      { name: '👤 Afiliado',        value: `<@${afilId}> (${usuario.nome || afilId})`, inline: true },
      { name: '📊 Nível',           value: nivelLabel,                                  inline: true },
      { name: '💰 Valor Solicitado',value: `**R$ ${valor.toFixed(2)}**`,                inline: true },
      { name: '👤 Nome no PIX',     value: `**${s.nome}**`,                             inline: true },
      { name: '🔑 Tipo da Chave',   value: s.tipoPix,                                   inline: true },
      { name: '📋 Chave PIX',       value: `\`${s.chavePix}\``,                         inline: true },
      { name: '💵 Saldo Total',     value: `R$ ${Number(usuario.saldo).toFixed(2)}`,    inline: true },
    )
    .setTimestamp()
    .setFooter({ text: 'Máximo Store • Programa de Afiliados' });

  const rowAcoes = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`afil_aprovar_saque_${afilId}_${valor}`).setLabel(`✅ Pagar R$ ${valor.toFixed(2)}`).setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`afil_rejeitar_saque_${afilId}`).setLabel('❌ Rejeitar').setStyle(ButtonStyle.Danger),
  );

  await canal.send({ embeds: [embedSaque], components: [rowAcoes] });

  const { log } = require('../utils/logger');
  await log('afiliado', { usuario: afilId, valor, descricao: `Saque solicitado: R$ ${valor.toFixed(2)} | ${s.tipoPix}: ${s.chavePix} | Nome: ${s.nome}` });

  delSessao(interaction.user.id);

  await interaction.editReply({
    embeds: [new EmbedBuilder()
      .setColor(config.colors.success)
      .setTitle('✅ Pedido de Saque Enviado!')
      .setDescription([
        `> Seu pedido de **R$ ${valor.toFixed(2)}** foi enviado para análise.`,
        `> A equipe irá processar e pagar via **${s.tipoPix}**: \`${s.chavePix}\``,
        `> Você será notificado por DM quando for processado.`,
      ].join('\n'))
      .setTimestamp()],
    components: [],
  });
}

// ─── Cancelar ─────────────────────────────────────────────────────────────────
async function cancelarSaque(interaction) {
  delSessao(interaction.user.id);
  await interaction.update({
    embeds: [new EmbedBuilder().setColor(config.colors.error).setTitle('❌ Cancelado').setDescription('Solicitação de saque cancelada.').setTimestamp()],
    components: [],
  });
}

module.exports = {
  abrirSaqueSubmenu,
  modalValor, modalNome, modalTipoPix, modalChavePix,
  processarValor, processarNome, processarTipo, processarChave,
  confirmarSaque, cancelarSaque,
};
