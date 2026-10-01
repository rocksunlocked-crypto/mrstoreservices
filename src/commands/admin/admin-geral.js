const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { Usuarios, db, Config } = require('../../database/database');
const { isAdmin, isStaff } = require('../../utils/permissions');
const { log } = require('../../utils/logger');
const { aprovarReembolso, rejeitarReembolso, listarPendentes } = require('../../systems/reembolsos');
const config = require('../../config');
const moment = require('moment-timezone');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('admin')
    .setDescription('⚙️ Painel administrativo do bot')
    .addSubcommand(sub =>
      sub.setName('stats')
         .setDescription('📊 Ver estatísticas gerais da loja')
    )
    .addSubcommand(sub =>
      sub.setName('usuario')
         .setDescription('👤 Ver info de um usuário')
         .addUserOption(o => o.setName('usuario').setDescription('Usuário').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('bloquear')
         .setDescription('🚫 Bloquear usuário')
         .addUserOption(o => o.setName('usuario').setDescription('Usuário').setRequired(true))
         .addStringOption(o => o.setName('motivo').setDescription('Motivo').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('desbloquear')
         .setDescription('✅ Desbloquear usuário')
         .addUserOption(o => o.setName('usuario').setDescription('Usuário').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('add_saldo')
         .setDescription('💰 Adicionar/remover saldo')
         .addUserOption(o => o.setName('usuario').setDescription('Usuário').setRequired(true))
         .addNumberOption(o => o.setName('valor').setDescription('Valor (negativo para remover)').setRequired(true))
         .addStringOption(o => o.setName('motivo').setDescription('Motivo').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('reembolsos')
         .setDescription('↩️ Ver reembolsos pendentes')
    )
    .addSubcommand(sub =>
      sub.setName('aprovar_reembolso')
         .setDescription('✅ Aprovar reembolso')
         .addStringOption(o => o.setName('id').setDescription('ID do reembolso').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('rejeitar_reembolso')
         .setDescription('❌ Rejeitar reembolso')
         .addStringOption(o => o.setName('id').setDescription('ID do reembolso').setRequired(true))
         .addStringOption(o => o.setName('motivo').setDescription('Motivo da rejeição').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('config')
         .setDescription('⚙️ Alterar configuração')
         .addStringOption(o => o.setName('chave').setDescription('Chave da config').addChoices(
           { name: 'Loja Aberta', value: 'loja_aberta' },
           { name: 'Manutenção', value: 'manutencao' },
           { name: 'Nome da Loja', value: 'nome_loja' },
           { name: 'Taxa Afiliado (%)', value: 'taxa_afiliado' },
           { name: 'Pontos por Real', value: 'pontos_por_real' },
           { name: 'Cooldown Caixa (h)', value: 'caixa_cooldown' },
           { name: 'Min Saque Afiliado', value: 'min_saque_afiliado' },
         ).setRequired(true))
         .addStringOption(o => o.setName('valor').setDescription('Novo valor').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('pedido')
         .setDescription('📋 Ver detalhes de um pedido')
         .addStringOption(o => o.setName('id').setDescription('ID do pedido').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('cancelar_pedido')
         .setDescription('❌ Cancelar pedido manualmente')
         .addStringOption(o => o.setName('id').setDescription('ID do pedido').setRequired(true))
         .addStringOption(o => o.setName('motivo').setDescription('Motivo').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('loja')
         .setDescription('🏪 Abrir/fechar loja')
         .addBooleanOption(o => o.setName('aberta').setDescription('Aberta?').setRequired(true))
    ),
  cooldown: 2,
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    // Permissões por sub-comando
    const apenasAdmin = ['bloquear', 'desbloquear', 'addSaldo', 'aprovar_reembolso', 'rejeitar_reembolso', 'config', 'cancelar_pedido', 'loja'];
    if (apenasAdmin.includes(sub) && !isAdmin(interaction.member)) {
      return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
    }
    if (!isStaff(interaction.member)) {
      return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    // ── STATS ──────────────────────────────────────────────────────────────────
    if (sub === 'stats') {
      const totais = db.prepare(`
        SELECT
          (SELECT COUNT(*) FROM usuarios) as total_usuarios,
          (SELECT COUNT(*) FROM pedidos WHERE status IN ('pago','entregue')) as total_vendas,
          (SELECT COALESCE(SUM(valor_total),0) FROM pedidos WHERE status IN ('pago','entregue')) as receita_total,
          (SELECT COUNT(*) FROM pedidos WHERE status='pendente') as pendentes,
          (SELECT COUNT(*) FROM produtos WHERE ativo=1) as produtos_ativos,
          (SELECT COUNT(*) FROM tickets WHERE status='aberto') as tickets_abertos,
          (SELECT COUNT(*) FROM reembolsos WHERE status='pendente') as reembolsos_pendentes
      `).get();

      const hoje = Math.floor(new Date().setHours(0,0,0,0) / 1000);
      const vendasHoje = db.prepare(`SELECT COUNT(*) as c, COALESCE(SUM(valor_total),0) as v FROM pedidos WHERE status IN ('pago','entregue') AND pago_em >= ?`).get(hoje);

      const embed = new EmbedBuilder()
        .setColor(config.colors.gold)
        .setTitle('📊 Estatísticas da Loja')
        .addFields(
          { name: '👤 Usuários', value: String(totais.total_usuarios), inline: true },
          { name: '🛒 Total Vendas', value: String(totais.total_vendas), inline: true },
          { name: '💰 Receita Total', value: `R$ ${Number(totais.receita_total).toFixed(2)}`, inline: true },
          { name: '⏳ Pedidos Pendentes', value: String(totais.pendentes), inline: true },
          { name: '📦 Produtos Ativos', value: String(totais.produtos_ativos), inline: true },
          { name: '🎫 Tickets Abertos', value: String(totais.tickets_abertos), inline: true },
          { name: '↩️ Reembolsos Pendentes', value: String(totais.reembolsos_pendentes), inline: true },
          { name: '📅 Vendas Hoje', value: `${vendasHoje.c} — R$ ${Number(vendasHoje.v).toFixed(2)}`, inline: true },
        )
        .setTimestamp()
        .setFooter({ text: `Máximo Store • ${moment().tz(config.timezone).format('DD/MM/YYYY HH:mm')}` });

      return interaction.editReply({ embeds: [embed] });
    }

    // ── USUARIO ────────────────────────────────────────────────────────────────
    if (sub === 'usuario') {
      const alvo = interaction.options.getUser('usuario');
      const u = Usuarios.get(alvo.id);
      if (!u) return interaction.editReply({ content: '❌ Usuário não encontrado.' });

      const pedidos = db.prepare("SELECT COUNT(*) as c FROM pedidos WHERE usuario_id=? AND status IN ('pago','entregue')").get(alvo.id);
      const embed = new EmbedBuilder()
        .setColor(config.colors.info)
        .setTitle(`👤 ${u.nome || alvo.username}`)
        .addFields(
          { name: '🆔 Discord ID', value: alvo.id, inline: true },
          { name: '💰 Saldo', value: `R$ ${(u.saldo||0).toFixed(2)}`, inline: true },
          { name: '⭐ Pontos', value: String(u.pontos||0), inline: true },
          { name: '🏆 Nível', value: u.nivel||'Bronze', inline: true },
          { name: '🛒 Compras', value: String(pedidos.c), inline: true },
          { name: '💸 Total Gasto', value: `R$ ${(u.total_gasto||0).toFixed(2)}`, inline: true },
          { name: '🔑 Código Afiliado', value: u.codigo_afil || 'N/A', inline: true },
          { name: '🚫 Bloqueado', value: u.bloqueado ? `Sim — ${u.motivo_bloquio}` : 'Não', inline: false },
        )
        .setTimestamp();
      return interaction.editReply({ embeds: [embed] });
    }

    // ── BLOQUEAR ───────────────────────────────────────────────────────────────
    if (sub === 'bloquear') {
      const alvo = interaction.options.getUser('usuario');
      const motivo = interaction.options.getString('motivo');
      Usuarios.bloquear(alvo.id, motivo);
      await log('usuario_block', { executor: interaction.user.id, usuario: alvo.id, motivo, descricao: `Usuário bloqueado por ${interaction.user.tag}` });
      return interaction.editReply({ content: `✅ <@${alvo.id}> bloqueado. Motivo: ${motivo}` });
    }

    // ── DESBLOQUEAR ────────────────────────────────────────────────────────────
    if (sub === 'desbloquear') {
      const alvo = interaction.options.getUser('usuario');
      Usuarios.desbloquear(alvo.id);
      await log('usuario_unblock', { executor: interaction.user.id, usuario: alvo.id, descricao: `Usuário desbloqueado por ${interaction.user.tag}` });
      return interaction.editReply({ content: `✅ <@${alvo.id}> desbloqueado.` });
    }

    // ── ADD SALDO ──────────────────────────────────────────────────────────────
    if (sub === 'add_saldo') {
      const alvo = interaction.options.getUser('usuario');
      const valor = interaction.options.getNumber('valor');
      const motivo = interaction.options.getString('motivo') || 'Ajuste manual';
      Usuarios.garantir(alvo.id, alvo.username);
      const novo = Usuarios.addSaldo(alvo.id, valor, motivo);
      return interaction.editReply({ content: `✅ Saldo de <@${alvo.id}> ajustado em **R$ ${valor.toFixed(2)}**. Novo saldo: R$ ${novo.toFixed(2)}` });
    }

    // ── REEMBOLSOS ─────────────────────────────────────────────────────────────
    if (sub === 'reembolsos') {
      const pendentes = listarPendentes();
      if (!pendentes.length) return interaction.editReply({ content: '✅ Nenhum reembolso pendente!' });
      const linhas = pendentes.map(r =>
        `↩️ ID: \`${r.id.slice(0,8)}\` | <@${r.usuario_id}> | R$ ${r.valor.toFixed(2)} | ${r.motivo}`
      );
      return interaction.editReply({ content: `**↩️ Reembolsos Pendentes:**\n\n${linhas.join('\n')}` });
    }

    if (sub === 'aprovar_reembolso') {
      return aprovarReembolso(interaction, interaction.options.getString('id'));
    }
    if (sub === 'rejeitar_reembolso') {
      return rejeitarReembolso(interaction, interaction.options.getString('id'), interaction.options.getString('motivo'));
    }

    // ── CONFIG ─────────────────────────────────────────────────────────────────
    if (sub === 'config') {
      const chave = interaction.options.getString('chave');
      const valor = interaction.options.getString('valor');
      Config.set(chave, valor);
      await log('sistema', { executor: interaction.user.id, descricao: `Config alterada: ${chave} = ${valor}` });
      return interaction.editReply({ content: `✅ Config **\`${chave}\`** = \`${valor}\`` });
    }

    // ── PEDIDO ─────────────────────────────────────────────────────────────────
    if (sub === 'pedido') {
      const { Pedidos, Produtos } = require('../../database/database');
      const pedido = db.prepare("SELECT * FROM pedidos WHERE id LIKE ?").get(`${interaction.options.getString('id')}%`);
      if (!pedido) return interaction.editReply({ content: '❌ Pedido não encontrado.' });
      const produto = Produtos.get(pedido.produto_id);
      const embed = new EmbedBuilder()
        .setColor(config.colors.info)
        .setTitle(`📋 Pedido #${pedido.id.slice(0,8).toUpperCase()}`)
        .addFields(
          { name: '👤 Usuário', value: `<@${pedido.usuario_id}>`, inline: true },
          { name: '📦 Produto', value: produto?.nome || pedido.produto_id, inline: true },
          { name: '💵 Valor', value: `R$ ${pedido.valor_total.toFixed(2)}`, inline: true },
          { name: '📊 Status', value: pedido.status, inline: true },
          { name: '💳 Método', value: pedido.metodo_pag || 'pix', inline: true },
          { name: '🆔 TxID', value: pedido.tx_id || 'N/A', inline: true },
          { name: '🎟️ Cupom', value: pedido.cupom_usado || 'Nenhum', inline: true },
          { name: '📅 Criado', value: moment.unix(pedido.criado_em).tz(config.timezone).format('DD/MM/YY HH:mm'), inline: true },
        ).setTimestamp();
      return interaction.editReply({ embeds: [embed] });
    }

    // ── CANCELAR PEDIDO ────────────────────────────────────────────────────────
    if (sub === 'cancelar_pedido') {
      const { Pedidos } = require('../../database/database');
      const id = interaction.options.getString('id');
      const pedido = db.prepare("SELECT * FROM pedidos WHERE id LIKE ?").get(`${id}%`);
      if (!pedido) return interaction.editReply({ content: '❌ Pedido não encontrado.' });
      if (['cancelado','reembolsado'].includes(pedido.status)) return interaction.editReply({ content: '⚠️ Pedido já cancelado.' });
      Pedidos.atualizar(pedido.id, { status: 'cancelado', cancelado_por: interaction.user.id, motivo_cancel: interaction.options.getString('motivo'), cancelado_em: Math.floor(Date.now()/1000) });
      return interaction.editReply({ content: `✅ Pedido \`${pedido.id.slice(0,8)}\` cancelado.` });
    }

    // ── LOJA ───────────────────────────────────────────────────────────────────
    if (sub === 'loja') {
      const aberta = interaction.options.getBoolean('aberta');
      Config.set('loja_aberta', aberta ? '1' : '0');
      await log('sistema', { executor: interaction.user.id, descricao: `Loja ${aberta ? 'aberta' : 'fechada'} por ${interaction.user.tag}` });
      return interaction.editReply({ content: `✅ Loja ${aberta ? '🟢 **aberta**' : '🔴 **fechada**'}.` });
    }
  },
};
