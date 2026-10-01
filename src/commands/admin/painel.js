const {
  SlashCommandBuilder, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
} = require('discord.js');
const { db, Config } = require('../../database/database');
const { isAdmin, isStaff } = require('../../utils/permissions');
const config = require('../../config');
const moment = require('moment-timezone');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('painel-admin')
    .setDescription('🎛️ Abre o painel administrativo da loja'),
  cooldown: 5,
  async execute(interaction) {
    if (!isStaff(interaction.member)) {
      return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
    }
    await interaction.deferReply({ ephemeral: true });
    await enviarPainel(interaction);
  },
};

async function enviarPainel(interaction) {
  const lojaAberta    = Config.get('loja_aberta');
  const manutencao    = Config.get('manutencao');
  const nomeLoja      = Config.get('nome_loja') || 'Máximo Store';

  // ── Estatísticas rápidas ──────────────────────────────────────────────────
  const hoje = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);
  const stats = db.prepare(`
    SELECT
      (SELECT COUNT(*)  FROM pedidos WHERE status IN ('pago','entregue'))                          AS total_vendas,
      (SELECT COALESCE(SUM(valor_total),0) FROM pedidos WHERE status IN ('pago','entregue'))       AS receita_total,
      (SELECT COUNT(*)  FROM pedidos WHERE status='pendente')                                      AS pendentes,
      (SELECT COUNT(*)  FROM pedidos WHERE status IN ('pago','entregue') AND pago_em >= ?)         AS vendas_hoje,
      (SELECT COALESCE(SUM(valor_total),0) FROM pedidos WHERE status IN ('pago','entregue') AND pago_em >= ?) AS receita_hoje,
      (SELECT COUNT(*)  FROM tickets  WHERE status='aberto')                                       AS tickets_abertos,
      (SELECT COUNT(*)  FROM reembolsos WHERE status='pendente')                                   AS reembolsos,
      (SELECT COUNT(*)  FROM usuarios)                                                              AS usuarios,
      (SELECT COUNT(*)  FROM produtos  WHERE ativo=1)                                              AS produtos
  `).get(hoje, hoje);

  const lojaStatus  = manutencao ? '🔧 Manutenção' : lojaAberta ? '🟢 Aberta' : '🔴 Fechada';
  const agora = moment().tz(config.timezone).format('DD/MM/YYYY HH:mm');

  const embed = new EmbedBuilder()
    .setColor(manutencao ? config.colors.warning : lojaAberta ? config.colors.success : config.colors.error)
    .setTitle(`🎛️ Painel Admin — ${nomeLoja}`)
    .setDescription(`> Status atual da loja: **${lojaStatus}**\n> Atualizado em: \`${agora}\``)
    .addFields(
      // Linha 1 — hoje
      { name: '📅 Vendas Hoje',    value: `**${stats.vendas_hoje}**`,                      inline: true },
      { name: '💰 Receita Hoje',   value: `**R$ ${Number(stats.receita_hoje).toFixed(2)}**`, inline: true },
      { name: '⏳ Pendentes',       value: `**${stats.pendentes}**`,                         inline: true },
      // Linha 2 — total
      { name: '🛒 Total Vendas',   value: `${stats.total_vendas}`,                          inline: true },
      { name: '💸 Receita Total',  value: `R$ ${Number(stats.receita_total).toFixed(2)}`,   inline: true },
      { name: '👥 Usuários',       value: `${stats.usuarios}`,                              inline: true },
      // Linha 3 — operacional
      { name: '🎫 Tickets Abertos', value: `${stats.tickets_abertos}`,                     inline: true },
      { name: '↩️ Reembolsos',      value: `${stats.reembolsos}`,                          inline: true },
      { name: '📦 Produtos',        value: `${stats.produtos}`,                             inline: true },
    )
    .setTimestamp()
    .setFooter({ text: `Máximo Store • Painel Admin` });

  // ── Linha 1 de botões: Loja ──────────────────────────────────────────────
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('painel_toggle_loja')
      .setLabel(lojaAberta ? '🔴 Fechar Loja' : '🟢 Abrir Loja')
      .setStyle(lojaAberta ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('painel_toggle_manutencao')
      .setLabel(manutencao ? '✅ Sair Manutenção' : '🔧 Manutenção')
      .setStyle(manutencao ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('painel_atualizar')
      .setLabel('🔄 Atualizar')
      .setStyle(ButtonStyle.Primary),
  );

  // ── Linha 2 de botões: Gestão ────────────────────────────────────────────
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('painel_reembolsos')
      .setLabel(`↩️ Reembolsos (${stats.reembolsos})`)
      .setStyle(stats.reembolsos > 0 ? ButtonStyle.Danger : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('painel_tickets')
      .setLabel(`🎫 Tickets (${stats.tickets_abertos})`)
      .setStyle(stats.tickets_abertos > 0 ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('painel_pendentes')
      .setLabel(`⏳ Pendentes (${stats.pendentes})`)
      .setStyle(stats.pendentes > 0 ? ButtonStyle.Primary : ButtonStyle.Secondary),
  );

  // ── Linha 3 de botões: Ações rápidas ────────────────────────────────────
  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('painel_top_produtos')
      .setLabel('📦 Top Produtos')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('painel_estoque_baixo')
      .setLabel('📉 Estoque Baixo')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('painel_relatorio')
      .setLabel('📊 Relatório')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('painel_flashsale')
      .setLabel('⚡ Flash Sale')
      .setStyle(ButtonStyle.Success),
  );

  const payload = { embeds: [embed], components: [row1, row2, row3] };

  if (interaction.replied || interaction.deferred) {
    await interaction.editReply(payload);
  } else {
    await interaction.reply({ ...payload, ephemeral: true });
  }
}

module.exports.enviarPainel = enviarPainel;
