/**
 * Handler exclusivo para os botões do painel admin (/painel)
 */
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { db, Config, Produtos } = require('../database/database');
const { isStaff, isAdmin } = require('../utils/permissions');
const { listarPendentes } = require('../systems/reembolsos');
const { iniciarFlashSale } = require('../systems/flashsale');
const { log } = require('../utils/logger');
const config = require('../config');
const moment = require('moment-timezone');

module.exports = async (interaction, client) => {
  const id = interaction.customId;
  if (!id.startsWith('painel_')) return false; // não tratado aqui

  if (!isStaff(interaction.member)) {
    return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
  }

  // ── Atualizar painel ──────────────────────────────────────────────────────
  if (id === 'painel_atualizar') {
    const { enviarPainel } = require('../commands/admin/painel');
    await interaction.deferUpdate();
    return enviarPainel(interaction);
  }

  // ── Toggle loja aberta/fechada ────────────────────────────────────────────
  if (id === 'painel_toggle_loja') {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Apenas admins.', ephemeral: true });
    const atual = Config.get('loja_aberta');
    Config.set('loja_aberta', atual ? '0' : '1');
    await log('sistema', { executor: interaction.user.id, descricao: `Loja ${atual ? 'fechada' : 'aberta'} pelo painel` });
    await interaction.reply({ content: `✅ Loja ${atual ? '🔴 **fechada**' : '🟢 **aberta**'}.`, ephemeral: true });
    const { enviarPainel } = require('../commands/admin/painel');
    return enviarPainel(interaction);
  }

  // ── Toggle manutenção ─────────────────────────────────────────────────────
  if (id === 'painel_toggle_manutencao') {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Apenas admins.', ephemeral: true });
    const atual = Config.get('manutencao');
    Config.set('manutencao', atual ? '0' : '1');
    await log('sistema', { executor: interaction.user.id, descricao: `Manutenção ${atual ? 'desativada' : 'ativada'} pelo painel` });
    await interaction.reply({ content: `✅ Manutenção ${atual ? '✅ desativada' : '🔧 **ativada**'}.`, ephemeral: true });
    const { enviarPainel } = require('../commands/admin/painel');
    return enviarPainel(interaction);
  }

  // ── Ver reembolsos pendentes ──────────────────────────────────────────────
  if (id === 'painel_reembolsos') {
    await interaction.deferReply({ ephemeral: true });
    const pendentes = listarPendentes();
    if (!pendentes.length) return interaction.editReply({ content: '✅ Nenhum reembolso pendente.' });

    const embed = new EmbedBuilder()
      .setColor(config.colors.warning)
      .setTitle('↩️ Reembolsos Pendentes')
      .setTimestamp();

    for (const r of pendentes) {
      const data = moment.unix(r.criado_em).tz(config.timezone).format('DD/MM HH:mm');
      embed.addFields({
        name: `↩️ R$ ${Number(r.valor).toFixed(2)} — <@${r.usuario_id}>`,
        value: `ID: \`${r.id.slice(0,8)}\` • ${r.motivo} • 📅 ${data}`,
        inline: false,
      });
    }

    const rows = pendentes.slice(0, 3).map(r =>
      new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`painel_apr_reimb_${r.id}`).setLabel(`✅ Aprovar ${r.id.slice(0,6)}`).setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`painel_rej_reimb_${r.id}`).setLabel(`❌ Rejeitar ${r.id.slice(0,6)}`).setStyle(ButtonStyle.Danger),
      )
    );

    return interaction.editReply({ embeds: [embed], components: rows });
  }

  // ── Aprovar reembolso pelo painel ─────────────────────────────────────────
  if (id.startsWith('painel_apr_reimb_')) {
    const reembolsoId = id.replace('painel_apr_reimb_', '');
    const { aprovarReembolso } = require('../systems/reembolsos');
    return aprovarReembolso(interaction, reembolsoId);
  }

  // ── Rejeitar reembolso pelo painel ────────────────────────────────────────
  if (id.startsWith('painel_rej_reimb_')) {
    const reembolsoId = id.replace('painel_rej_reimb_', '');
    const modal = new ModalBuilder().setCustomId(`modal_rej_reimb_${reembolsoId}`).setTitle('❌ Rejeitar Reembolso');
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('motivo').setLabel('Motivo da rejeição').setStyle(TextInputStyle.Paragraph).setRequired(true),
    ));
    return interaction.showModal(modal);
  }

  // ── Tickets abertos ───────────────────────────────────────────────────────
  if (id === 'painel_tickets') {
    await interaction.deferReply({ ephemeral: true });
    const tickets = db.prepare("SELECT * FROM tickets WHERE status='aberto' ORDER BY criado_em ASC LIMIT 10").all();
    if (!tickets.length) return interaction.editReply({ content: '✅ Nenhum ticket aberto.' });

    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle('🎫 Tickets Abertos')
      .setTimestamp();

    for (const t of tickets) {
      const data = moment.unix(t.criado_em).tz(config.timezone).format('DD/MM HH:mm');
      const canal = `<#${t.canal_id}>`;
      embed.addFields({
        name: `🎫 ${t.tipo.toUpperCase()} — <@${t.usuario_id}>`,
        value: `Canal: ${canal} • ${data}${t.atendente ? ` • ✋ <@${t.atendente}>` : ' • Sem atendente'}`,
        inline: false,
      });
    }
    return interaction.editReply({ embeds: [embed] });
  }

  // ── Pedidos pendentes ─────────────────────────────────────────────────────
  if (id === 'painel_pendentes') {
    await interaction.deferReply({ ephemeral: true });
    const pedidos = db.prepare(`
      SELECT p.*, pr.nome as produto_nome FROM pedidos p
      JOIN produtos pr ON p.produto_id=pr.id
      WHERE p.status='pendente' ORDER BY p.criado_em DESC LIMIT 10
    `).all();
    if (!pedidos.length) return interaction.editReply({ content: '✅ Nenhum pedido pendente.' });

    const embed = new EmbedBuilder().setColor(config.colors.warning).setTitle('⏳ Pedidos Pendentes').setTimestamp();
    for (const p of pedidos) {
      const data = moment.unix(p.criado_em).tz(config.timezone).format('DD/MM HH:mm');
      const expira = Math.floor(p.criado_em) + 2100;
      embed.addFields({
        name: `⏳ ${p.produto_nome} — R$ ${Number(p.valor_total).toFixed(2)}`,
        value: `<@${p.usuario_id}> • ID: \`${p.id.slice(0,8)}\` • ${data} • Expira: <t:${expira}:R>`,
        inline: false,
      });
    }
    return interaction.editReply({ embeds: [embed] });
  }

  // ── Top produtos ──────────────────────────────────────────────────────────
  if (id === 'painel_top_produtos') {
    await interaction.deferReply({ ephemeral: true });
    const top = db.prepare('SELECT * FROM produtos WHERE ativo=1 ORDER BY vendas DESC LIMIT 10').all();
    if (!top.length) return interaction.editReply({ content: '📦 Nenhum produto.' });

    const embed = new EmbedBuilder().setColor(config.colors.gold).setTitle('📦 Top 10 Produtos').setTimestamp();
    top.forEach((p, i) => {
      embed.addFields({
        name: `${i + 1}. ${p.nome}`,
        value: `🛒 ${p.vendas} vendas • R$ ${(p.preco_promo || p.preco).toFixed(2)} • Estoque: ${p.estoque === -1 ? '∞' : p.estoque}`,
        inline: false,
      });
    });
    return interaction.editReply({ embeds: [embed] });
  }

  // ── Estoque baixo ─────────────────────────────────────────────────────────
  if (id === 'painel_estoque_baixo') {
    await interaction.deferReply({ ephemeral: true });
    const baixo = db.prepare(`
      SELECT p.*, (SELECT COUNT(*) FROM estoque_digital WHERE produto_id=p.id AND usado=0) as est_digital
      FROM produtos p WHERE p.ativo=1 AND p.tipo='digital'
    `).all().filter(p => p.est_digital <= 10);

    if (!baixo.length) return interaction.editReply({ content: '✅ Todos os produtos com estoque suficiente.' });

    const embed = new EmbedBuilder().setColor(config.colors.warning).setTitle('📉 Estoque Baixo').setTimestamp();
    for (const p of baixo) {
      embed.addFields({
        name: `${p.est_digital === 0 ? '❌' : '⚠️'} ${p.nome}`,
        value: `${p.est_digital} unidade(s) disponível(is) • ID: \`${p.id.slice(0,8)}\``,
        inline: true,
      });
    }
    return interaction.editReply({ embeds: [embed] });
  }

  // ── Relatório rápido ──────────────────────────────────────────────────────
  if (id === 'painel_relatorio') {
    await interaction.deferReply({ ephemeral: true });

    const periodos = [
      { nome: 'Hoje',       inicio: Math.floor(new Date().setHours(0,0,0,0)/1000)             },
      { nome: '7 dias',     inicio: Math.floor(Date.now()/1000) - 7*86400                      },
      { nome: '30 dias',    inicio: Math.floor(Date.now()/1000) - 30*86400                     },
      { nome: 'Total',      inicio: 0                                                           },
    ];

    const embed = new EmbedBuilder()
      .setColor(config.colors.info)
      .setTitle('📊 Relatório de Vendas')
      .setTimestamp();

    for (const p of periodos) {
      const r = db.prepare(`
        SELECT COUNT(*) as vendas, COALESCE(SUM(valor_total),0) as receita
        FROM pedidos WHERE status IN ('pago','entregue') AND pago_em >= ?
      `).get(p.inicio);
      embed.addFields({ name: `📅 ${p.nome}`, value: `${r.vendas} vendas • R$ ${Number(r.receita).toFixed(2)}`, inline: true });
    }

    return interaction.editReply({ embeds: [embed] });
  }

  // ── Flash Sale pelo painel ────────────────────────────────────────────────
  if (id === 'painel_flashsale') {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Apenas admins.', ephemeral: true });
    const modal = new ModalBuilder().setCustomId('modal_flashsale').setTitle('⚡ Iniciar Flash Sale');
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('produto_id').setLabel('ID do Produto').setStyle(TextInputStyle.Short).setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('desconto').setLabel('Desconto (%)').setStyle(TextInputStyle.Short).setPlaceholder('Ex: 30').setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('duracao').setLabel('Duração (minutos)').setStyle(TextInputStyle.Short).setPlaceholder('Ex: 60').setRequired(true)),
    );
    return interaction.showModal(modal);
  }

  return false;
};
