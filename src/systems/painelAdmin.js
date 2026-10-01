/**
 * Painel Admin Central — canal fixo 1533638769901703178
 * Organizado em submenus com navegação por botões
 */

const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder,
} = require('discord.js');
const { db, Config, Produtos, Usuarios } = require('../database/database');
const { isAdmin, isStaff, isLoja, isOwner } = require('../utils/permissions');
const config  = require('../config');
const moment  = require('moment-timezone');

const CANAL_PAINEL = '1533638769901703178';
const CANAL_PAINEL_PUBLICO_2FA = process.env.PAINEL_PUBLICO_2FA_CHANNEL_ID || process.env.PAINEL_2FA_CHANNEL_ID || CANAL_PAINEL;

// ─── Cache de stats (TTL 30s) ─────────────────────────────────────────────────
let _statsCache = null;
let _statsCacheTs = 0;

function getStats() {
  if (_statsCache && Date.now() - _statsCacheTs < 30000) return _statsCache;
  const hoje = Math.floor(new Date().setHours(0,0,0,0)/1000);
  _statsCache = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM pedidos WHERE status IN ('pago','entregue'))                           AS total_vendas,
      (SELECT COALESCE(SUM(valor_total),0) FROM pedidos WHERE status IN ('pago','entregue'))        AS receita_total,
      (SELECT COUNT(*) FROM pedidos WHERE status='pendente')                                        AS pendentes,
      (SELECT COUNT(*) FROM pedidos WHERE status IN ('pago','entregue') AND pago_em>=?)             AS vendas_hoje,
      (SELECT COALESCE(SUM(valor_total),0) FROM pedidos WHERE status IN ('pago','entregue') AND pago_em>=?) AS receita_hoje,
      (SELECT COUNT(*) FROM tickets WHERE status='aberto')                                          AS tickets,
      (SELECT COUNT(*) FROM reembolsos WHERE status='pendente')                                     AS reembolsos,
      (SELECT COUNT(*) FROM usuarios)                                                               AS usuarios,
      (SELECT COUNT(*) FROM produtos WHERE ativo=1)                                                AS produtos,
      (SELECT COUNT(*) FROM paineis_canal WHERE ativo=1)                                           AS paineis
  `).get(hoje, hoje);
  _statsCacheTs = Date.now();
  return _statsCache;
}

// ─── Embed e rows por submenu ─────────────────────────────────────────────────

async function buildHome(member) {
  const lojaAberta = Config.get('loja_aberta');
  const manutencao = Config.get('manutencao') === true;
  const nomeLoja   = Config.get('nome_loja') || 'Máximo Store';
  const metaDia    = Number(Config.get('meta_dia') || 0);

  const s = getStats();

  const statusEmoji = manutencao ? '🔧' : (lojaAberta === false || lojaAberta === '0') ? '🔴' : '🟢';
  const statusTxt   = manutencao ? 'Manutenção' : (lojaAberta === false || lojaAberta === '0') ? 'Fechada' : 'Online';

  // Barra de progresso da meta diária
  let metaBar = '';
  if (metaDia > 0) {
    const pct     = Math.min(Number(s.receita_hoje) / metaDia, 1);
    const filled  = Math.round(pct * 10);
    const bar     = '█'.repeat(filled) + '░'.repeat(10 - filled);
    metaBar = `\n\`${bar}\` ${Math.round(pct*100)}% da meta R$ ${metaDia.toFixed(2)}`;
  }

  // Alertas urgentes
  const alertas = [];
  if (s.reembolsos > 0) alertas.push(`↩️ **${s.reembolsos}** reembolso(s) pendente(s)`);
  if (s.pendentes  > 0) alertas.push(`⏳ **${s.pendentes}** pedido(s) pendente(s)`);
  if (s.tickets    > 0) alertas.push(`🎫 **${s.tickets}** ticket(s) aberto(s)`);

  // Estoque baixo
  const baixo = db.prepare(`
    SELECT COUNT(DISTINCT vp.produto_id) as c
    FROM variantes_produto vp
    LEFT JOIN estoque_variante ev ON ev.variante_id=vp.id AND ev.usado=0
    WHERE vp.ativo=1
    GROUP BY vp.id HAVING COUNT(ev.id) <= 2
  `).get();
  if (baixo?.c > 0) alertas.push(`📉 **${baixo.c}** variante(s) com estoque baixo`);

  const embed = new EmbedBuilder()
    .setColor(manutencao ? config.colors.warning : s.reembolsos > 0 ? config.colors.error : config.colors.success)
    .setTitle(`🎛️ ${nomeLoja} — Painel de Controle`)
    .setDescription(alertas.length
      ? `> ⚠️ **Alertas:**\n${alertas.map(a => `> • ${a}`).join('\n')}`
      : `> ✅ Tudo certo! Nenhum alerta no momento.`)
    .addFields(
      { name: '🟢 Status',   value: `${statusEmoji} **${statusTxt}**\n\`${moment().tz(config.timezone).format('DD/MM/YY HH:mm')}\``, inline: true },
      { name: '📅 Hoje',     value: `🛒 **${s.vendas_hoje}** vendas\n💵 **R$ ${Number(s.receita_hoje).toFixed(2)}**${metaBar}`,      inline: true },
      { name: '📈 Total',    value: `🛒 **${s.total_vendas}** vendas\n💵 **R$ ${Number(s.receita_total).toFixed(2)}**`,               inline: true },
      { name: '📦 Catálogo', value: `**${s.produtos}** produtos\n**${s.paineis}** painéis ativos`,                                   inline: true },
      { name: '👥 Usuários', value: `**${s.usuarios}** cadastrados`,                                                                  inline: true },
      { name: '🎫 Suporte',  value: `**${s.tickets}** tickets\n**${s.reembolsos}** reembolsos`,                                      inline: true },
    )
    .setFooter({ text: `${nomeLoja} • Atualizado` })
    .setTimestamp();

  const rows = [];

  // Row 1 — Controles rápidos
  rows.push(new ActionRowBuilder().addComponents(
    btn('pa_toggle_manut',  manutencao ? '✅ Sair Manutenção' : '🔧 Manutenção', manutencao ? ButtonStyle.Success : ButtonStyle.Danger),
    btn('pa_toggle_loja',   (lojaAberta === false || lojaAberta === '0') ? '🟢 Abrir Loja' : '🔴 Fechar Loja', (lojaAberta === false || lojaAberta === '0') ? ButtonStyle.Success : ButtonStyle.Danger),
    btn('pa_atualizar',     '🔄 Atualizar',  ButtonStyle.Primary),
    btn('pa_relatorio',     '📊 Relatório',  ButtonStyle.Secondary),
    btn('pa_estoque_baixo', '📉 Estoque',    ButtonStyle.Secondary),
  ));

  // Row 2 — Submenus
  rows.push(new ActionRowBuilder().addComponents(
    btn('pa_menu_loja',      '🛒 Loja',        ButtonStyle.Success),
    btn('pa_menu_operacoes', '⚙️ Operações',   ButtonStyle.Primary),
    btn('pa_menu_usuarios',  '👥 Usuários',    ButtonStyle.Secondary),
    btn('pa_menu_caixa',     '🎁 Caixas',      ButtonStyle.Secondary),
    btn('pa_menu_afiliados', '🤝 Afiliados',   ButtonStyle.Secondary),
  ));

  // Row 3 — Config
  rows.push(new ActionRowBuilder().addComponents(
    btn('pa_menu_config',    '🔧 Config',      ButtonStyle.Secondary),
  ));

  return { embed, components: rows };
}

// ─── Menu Loja (cargo Loja+) ──────────────────────────────────────────────────
function buildLojaMenu() {
  // Stats rápidas do catálogo
  const totalProd  = db.prepare("SELECT COUNT(*) as c FROM produtos WHERE ativo=1").get().c;
  const semEstoque = db.prepare(`
    SELECT COUNT(DISTINCT vp.produto_id) as c FROM variantes_produto vp
    WHERE vp.ativo=1 AND (SELECT COUNT(*) FROM estoque_variante ev WHERE ev.variante_id=vp.id AND ev.usado=0) = 0
  `).get().c;
  const totalCupons = db.prepare("SELECT COUNT(*) as c FROM cupons WHERE ativo=1").get().c;

  const embed = new EmbedBuilder()
    .setColor(config.colors.loja)
    .setTitle('🛒 Painel — Loja')
    .setDescription([
      '> **Como criar um produto do zero:**',
      '> `1.` **➕ Criar** — define canal, nome e imagem',
      '> `2.` **＋ Plano** — adiciona variantes com preço',
      '> `3.` **📥 Estoque** — cola os itens (1 por linha)',
      '> ',
      '> Use **🏆 Top** para ver os mais vendidos.',
    ].join('\n'))
    .addFields(
      { name: '📦 Produtos ativos', value: `**${totalProd}**`,                                    inline: true },
      { name: '📉 Sem estoque',     value: `**${semEstoque}** variante(s)`,                       inline: true },
      { name: '🎟️ Cupons ativos',  value: `**${totalCupons}**`,                                  inline: true },
    )
    .setFooter({ text: 'Máximo Store • Loja' })
    .setTimestamp();

  const row1 = new ActionRowBuilder().addComponents(
    btn('pa_criar_carrinho',   '➕ Criar',       ButtonStyle.Success),
    btn('pa_listar_carrinhos', '📋 Ver',         ButtonStyle.Primary),
    btn('pa_editar_carrinho',  '✏️ Editar',      ButtonStyle.Primary),
    btn('pa_add_plano',        '＋ Plano',        ButtonStyle.Secondary),
    btn('pa_add_estoque',      '📥 Estoque',     ButtonStyle.Secondary),
  );

  const row2 = new ActionRowBuilder().addComponents(
    btn('pa_remover_plano',    '➖ Rem Plano',   ButtonStyle.Danger),
    btn('pa_editar_plano',     '✏️ Edit Plano',  ButtonStyle.Primary),
    btn('pa_deletar_carrinho', '🗑️ Deletar',     ButtonStyle.Danger),
    btn('pa_estoque_baixo',    '📉 Est Baixo',   ButtonStyle.Secondary),
    btn('pa_top_produtos',     '🏆 Top',         ButtonStyle.Secondary),
  );

  const row3 = new ActionRowBuilder().addComponents(
    btn('pa_criar_cupom',      '🎟️ Criar Cupom', ButtonStyle.Success),
    btn('pa_listar_cupons',    '🎟️ Ver Cupons',  ButtonStyle.Secondary),
    btn('pa_deletar_cupom',    '🗑️ Del Cupom',   ButtonStyle.Danger),
    btn('pa_pausar_produto',   '⏸️ Pausar',       ButtonStyle.Secondary),
    btn('pa_ver_estoque',      '🔍 Ver Estoque',  ButtonStyle.Secondary),
  );

  const row4 = new ActionRowBuilder().addComponents(
    btn('pa_home',             '🔙 Voltar',       ButtonStyle.Secondary),
  );

  return { embed, components: [row1, row2, row3, row4] };
}

// ─── Menu Operações (Admin+) ──────────────────────────────────────────────────
function buildOperacoesMenu() {
  const s = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM reembolsos WHERE status='pendente') AS reimb,
      (SELECT COUNT(*) FROM tickets WHERE status='aberto')      AS tick,
      (SELECT COUNT(*) FROM pedidos WHERE status='pendente')    AS pend,
      (SELECT COUNT(*) FROM tickets WHERE status='aberto' AND tipo='compra') AS tick_compra
  `).get();

  const corStatus = (s.reimb > 0 || s.tick_compra > 3) ? config.colors.error
                  : (s.tick > 0 || s.pend > 0)         ? config.colors.warning
                  : config.colors.success;

  const embed = new EmbedBuilder()
    .setColor(corStatus)
    .setTitle('⚙️ Painel — Operações')
    .setDescription('> Gerencie tickets, reembolsos, pedidos e campanhas.')
    .addFields(
      { name: '↩️ Reembolsos', value: s.reimb > 0        ? `⚠️ **${s.reimb}** pendente(s)` : '✅ Nenhum', inline: true },
      { name: '🎫 Tickets',    value: s.tick > 0          ? `🟡 **${s.tick}** aberto(s)`    : '✅ Nenhum', inline: true },
      { name: '⏳ Pedidos',    value: s.pend > 0          ? `🟡 **${s.pend}** pendente(s)` : '✅ Nenhum', inline: true },
    )
    .setFooter({ text: 'Máximo Store • Operações' })
    .setTimestamp();

  const row1 = new ActionRowBuilder().addComponents(
    btn('pa_reembolsos',    `↩️ Reembolsos${s.reimb > 0 ? ` (${s.reimb})` : ''}`, s.reimb > 0 ? ButtonStyle.Danger   : ButtonStyle.Secondary),
    btn('pa_tickets',       `🎫 Tickets${s.tick > 0     ? ` (${s.tick})`  : ''}`, s.tick > 0  ? ButtonStyle.Primary  : ButtonStyle.Secondary),
    btn('pa_pendentes',     `⏳ Pedidos${s.pend > 0     ? ` (${s.pend})`  : ''}`, s.pend > 0  ? ButtonStyle.Primary  : ButtonStyle.Secondary),
    btn('pa_buscar_pedido', '🔍 Buscar',  ButtonStyle.Secondary),
    btn('pa_relatorio',     '📊 Relatório', ButtonStyle.Secondary),
  );

  const row2 = new ActionRowBuilder().addComponents(
    btn('pa_flashsale',            '⚡ Flash Sale',      ButtonStyle.Danger),
    btn('pa_anuncio',              '📣 Anúncio DM',      ButtonStyle.Primary),
    btn('pa_dm_compradores',       '📨 DM Compradores',  ButtonStyle.Primary),
    btn('pa_fechar_todos_tickets', '🔒 Fechar Tickets',  ButtonStyle.Danger),
    btn('pa_cancelar_pendentes',   '❌ Cancelar Pedidos',ButtonStyle.Danger),
  );

  const row3 = new ActionRowBuilder().addComponents(
    btn('pa_reentregas',      '📦 Reentregas',      ButtonStyle.Secondary),
    btn('pa_reenviar_produto','🔄 Reenviar',         ButtonStyle.Secondary),
    btn('pa_enviar_produto',  '📤 Enviar Produto',   ButtonStyle.Success),
    btn('pa_vendas_produto',  '📊 Receita',          ButtonStyle.Secondary),
    btn('pa_nota_fiscal',     '🧾 Nota Fiscal',      ButtonStyle.Secondary),
  );

  const row4 = new ActionRowBuilder().addComponents(
    btn('pa_filtrar_pedidos', '🔎 Filtrar Pedidos',  ButtonStyle.Secondary),
    btn('pa_ver_entrega',     '📄 Ver Entrega',      ButtonStyle.Secondary),
    btn('pa_gerar_qr',        '💠 Gerar QR Code',    ButtonStyle.Primary),
    btn('pa_home',            '🔙 Voltar',           ButtonStyle.Secondary),
  );

  return { embed, components: [row1, row2, row3, row4] };
}

// ─── Menu Usuários (Admin+) ───────────────────────────────────────────────────
function buildUsuariosMenu() {
  const totalUsers    = db.prepare("SELECT COUNT(*) as c FROM usuarios").get().c;
  const bloqueados    = db.prepare("SELECT COUNT(*) as c FROM usuarios WHERE bloqueado=1").get().c;
  const totalCoins    = db.prepare("SELECT COALESCE(SUM(coins),0) as c FROM usuarios").get().c;

  const embed = new EmbedBuilder()
    .setColor(config.colors.info)
    .setTitle('👥 Painel — Usuários')
    .setDescription('> Busque, gerencie coins e visualize rankings.')
    .addFields(
      { name: '👥 Cadastrados', value: `**${totalUsers}**`,                                     inline: true },
      { name: '🚫 Bloqueados',  value: `**${bloqueados}**`,                                     inline: true },
      { name: '🪙 Coins total', value: `**${Number(totalCoins).toLocaleString('pt-BR')}**`,     inline: true },
    )
    .setFooter({ text: 'Máximo Store • Usuários' })
    .setTimestamp();

  const row1 = new ActionRowBuilder().addComponents(
    btn('pa_buscar_usuario', '🔍 Buscar',        ButtonStyle.Primary),
    btn('pa_add_coins',      '🪙 Add Coins',      ButtonStyle.Success),
    btn('pa_remover_coins',  '🪙 Rem Coins',      ButtonStyle.Danger),
    btn('pa_gerar_codigos',  '🎫 Gerar Códigos',  ButtonStyle.Secondary),
    btn('pa_coins_todos',    '🎁 Coins p/ Todos', ButtonStyle.Success),
  );

  const row2 = new ActionRowBuilder().addComponents(
    btn('pa_blacklist_cpf',     '🚫 Blacklist CPF',   ButtonStyle.Danger),
    btn('pa_ranking',           '🏆 Ranking',          ButtonStyle.Secondary),
    btn('pa_top_produtos',      '🏆 Top Produtos',     ButtonStyle.Secondary),
    btn('pa_historico_usuario', '📜 Histórico',        ButtonStyle.Secondary),
    btn('pa_resetar_compras',   '🔄 Resetar Compras',  ButtonStyle.Danger),
  );

  const row3 = new ActionRowBuilder().addComponents(
    btn('pa_simulador',  '💡 Simulador',  ButtonStyle.Secondary),
    btn('pa_home',       '🔙 Voltar',     ButtonStyle.Secondary),
  );

  return { embed, components: [row1, row2, row3] };
}

function buildCaixaMenu() {
  const { listarCaixasAtivas, getItensCaixa, RARIDADES } = require('./caixaMisteriosa');
  // Inclui caixas inativas também para gerenciamento
  const caixas = db.prepare('SELECT * FROM caixa_config ORDER BY criado_em DESC').all();

  const embed = new EmbedBuilder()
    .setColor(0xFFD700)
    .setTitle('🎁 Painel — Caixas Misteriosas')
    .setDescription(caixas.length
      ? caixas.map(c => {
          const itens     = getItensCaixa(c.id);
          const totalChance = itens.reduce((a, i) => a + i.chance, 0);
          const statusBar = totalChance === 100 ? '✅' : totalChance > 100 ? '⚠️' : '📉';
          const linhas = itens.map(i => `  ${RARIDADES[i.raridade]?.emoji || '⚪'} ${i.variante_nome} — ${i.chance}%`);
          return [
            `${c.ativa ? '🟢' : '🔴'} **${c.nome}** — R$ ${c.preco.toFixed(2)} | 🎰 ${c.total_abertas} abertas | ${statusBar} ${totalChance}%`,
            ...linhas,
          ].join('\n');
        }).join('\n\n')
      : '❌ Nenhuma caixa criada.\nClique em **➕ Criar** para começar.')
    .setFooter({ text: `Máximo Store • ${caixas.length} caixa(s) cadastrada(s)` })
    .setTimestamp();

  const row1 = new ActionRowBuilder().addComponents(
    btn('pa_caixa_criar',    '➕ Criar',        ButtonStyle.Success),
    btn('pa_caixa_editar',   '✏️ Editar',       ButtonStyle.Primary),
    btn('pa_caixa_add_item', '🎯 Add Item',     ButtonStyle.Primary),
    btn('pa_caixa_listar',   '📋 Gerenciar',    ButtonStyle.Secondary),
    btn('pa_caixa_publicar', '📢 Publicar',     ButtonStyle.Success),
  );

  const row2 = new ActionRowBuilder().addComponents(
    btn('pa_caixa_historico', '📊 Histórico',   ButtonStyle.Secondary),
    btn('pa_caixa_deletar',   '🗑️ Deletar',     ButtonStyle.Danger),
    btn('pa_home',            '🔙 Voltar',      ButtonStyle.Secondary),
  );

  return { embed, components: [row1, row2] };
}

// ─── Menu Config (Owner) ─────────────────────────────────────────────────────
function buildConfigMenu() {
  const nomeLoja    = Config.get('nome_loja')        || 'Máximo Store';
  const metaDia     = Config.get('meta_dia')         || '0';
  const cashback    = Config.get('cashback_pct')     || '5';
  const canalVendas = Config.get('canal_vendas_id')  ? `<#${Config.get('canal_vendas_id')}>` : '❌ Não definido';
  const canalCupons = Config.get('canal_cupons_id')  ? `<#${Config.get('canal_cupons_id')}>` : '⚠️ Fixo no código';

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('🔧 Painel — Configurações')
    .setDescription('> Ajuste as configurações gerais da loja.')
    .addFields(
      { name: '🏪 Nome da loja',     value: `**${nomeLoja}**`,                       inline: true },
      { name: '🎯 Meta diária',      value: `**R$ ${Number(metaDia).toFixed(2)}**`,  inline: true },
      { name: '🪙 Cashback %',       value: `**${cashback}%**`,                      inline: true },
      { name: '📢 Canal de vendas',  value: canalVendas,                             inline: true },
      { name: '🎟️ Canal de cupons',  value: canalCupons,                             inline: true },
    )
    .setFooter({ text: 'Máximo Store • Configurações' })
    .setTimestamp();

  const row1 = new ActionRowBuilder().addComponents(
    btn('pa_cfg_nome',         '🏪 Nome Loja',      ButtonStyle.Primary),
    btn('pa_cfg_meta',         '🎯 Meta Diária',    ButtonStyle.Primary),
    btn('pa_cfg_cashback',     '🪙 Cashback',       ButtonStyle.Secondary),
    btn('pa_cfg_boas_vindas',  '👋 Boas-vindas',    ButtonStyle.Secondary),
    btn('pa_cfg_canal_vendas', '📢 Canal Vendas',   ButtonStyle.Secondary),
  );

  const row2 = new ActionRowBuilder().addComponents(
    btn('pa_cfg_canal_cupons', '🎟️ Canal Cupons',   ButtonStyle.Secondary),
    btn('pa_zerar_historico',  '🗑️ Zerar Histórico', ButtonStyle.Danger),
    btn('pa_home',             '🔙 Voltar',          ButtonStyle.Secondary),
  );

  return { embed, components: [row1, row2] };
}

// ─── Menu Afiliados (Admin+) ──────────────────────────────────────────────────
function buildAfiliadosMenu() {
  const totalAfil  = db.prepare("SELECT COUNT(*) as c FROM usuarios WHERE nivel_afil > 0").get()?.c || 0;
  const totalN1    = db.prepare("SELECT COUNT(*) as c FROM usuarios WHERE nivel_afil = 1").get()?.c || 0;
  const totalN2    = db.prepare("SELECT COUNT(*) as c FROM usuarios WHERE nivel_afil = 2").get()?.c || 0;
  const comissPend = db.prepare("SELECT COALESCE(SUM(saldo),0) as t FROM usuarios WHERE saldo > 0 AND nivel_afil > 0").get().t;
  const vendasAfil = db.prepare("SELECT COUNT(*) as c, COALESCE(SUM(comissao_afil),0) as t FROM pedidos WHERE afiliado_id IS NOT NULL AND status IN ('pago','entregue')").get();

  const taxa1  = Config.get('taxa_afiliado')      || '5';
  const taxa2  = Config.get('taxa_afil_n2')       || '2';
  const bonus1 = Config.get('taxa_afil_n1_bonus') || '1';

  const embed = new EmbedBuilder()
    .setColor(0x9B59B6)
    .setTitle('🤝 Painel — Afiliados')
    .setDescription('> Gerencie o programa de afiliados, comissões e saques.')
    .addFields(
      { name: '👥 Total Afiliados',    value: `**${totalAfil}** (N1: ${totalN1} | N2: ${totalN2})`, inline: true },
      { name: '💰 Saldo a pagar',      value: `**R$ ${Number(comissPend).toFixed(2)}**`,             inline: true },
      { name: '🛒 Vendas c/ afiliado', value: `**${vendasAfil.c}** • R$ ${Number(vendasAfil.t).toFixed(2)}`, inline: true },
      { name: '⚙️ % Comissão N1',     value: `**${taxa1}%** por venda`,                             inline: true },
      { name: '⚙️ % Comissão N2',     value: `**${taxa2}%** por venda`,                             inline: true },
      { name: '⚙️ Bônus N1 (N2 vende)', value: `**+${bonus1}%** ao N1 superior`,                   inline: true },
    )
    .setFooter({ text: 'Máximo Store • Afiliados' })
    .setTimestamp();

  const row1 = new ActionRowBuilder().addComponents(
    btn('pa_afil_top',           '🏆 Top',             ButtonStyle.Primary),
    btn('pa_afil_saques',        '💸 Saques',          ButtonStyle.Secondary),
    btn('pa_afil_pagar_saque',   '✅ Pagar',           ButtonStyle.Success),
    btn('pa_afil_rejeitar_saque','❌ Rejeitar',        ButtonStyle.Danger),
    btn('pa_afil_buscar',        '🔍 Buscar',          ButtonStyle.Secondary),
  );

  const row2 = new ActionRowBuilder().addComponents(
    btn('pa_afil_registrar',     '➕ Registrar N1',    ButtonStyle.Success),
    btn('pa_afil_remover',       '🗑️ Remover',        ButtonStyle.Danger),
    btn('pa_afil_cfg_comissao',  '⚙️ % N1',           ButtonStyle.Secondary),
    btn('pa_afil_cfg_nivel2',    '⚙️ % N2',           ButtonStyle.Secondary),
    btn('pa_afil_cfg_bonus',     '⚙️ Bônus N1',       ButtonStyle.Secondary),
  );

  const row3 = new ActionRowBuilder().addComponents(
    btn('pa_afil_cfg_min_saque', '⚙️ Mín. Saque',     ButtonStyle.Secondary),
    btn('pa_home',               '🔙 Voltar',          ButtonStyle.Secondary),
  );

  return { embed, components: [row1, row2, row3] };
}

async function enviarPainelFixo(guild) {
  try {
    const canal = guild.channels.cache.get(CANAL_PAINEL);
    if (!canal) return console.error('[PainelAdmin] Canal não encontrado:', CANAL_PAINEL);

    const { embed, components } = await buildHome(null);

    // Buscar mensagem existente
    const msgs = await canal.messages.fetch({ limit: 15 }).catch(() => null);
    const msgExistente = msgs?.find(m => m.author.id === guild.client.user.id && m.embeds.length > 0);

    if (msgExistente) {
      await msgExistente.edit({ embeds: [embed], components }).catch(() => {});
      db.prepare("INSERT OR REPLACE INTO configuracoes (chave,valor,tipo) VALUES ('painel_admin_msg_id',?,'string')").run(msgExistente.id);
      return;
    }

    const msg = await canal.send({ embeds: [embed], components });
    db.prepare("INSERT OR REPLACE INTO configuracoes (chave,valor,tipo) VALUES ('painel_admin_msg_id',?,'string')").run(msg.id);
  } catch (err) {
    console.error('[PainelAdmin]', err.message);
  }
}

async function atualizarPainelAdmin(guild) {
  try {
    const canal = guild.channels.cache.get(CANAL_PAINEL);
    if (!canal) return;
    const msgId = Config.get('painel_admin_msg_id');
    if (!msgId) return enviarPainelFixo(guild);
    const msg = await canal.messages.fetch(msgId).catch(() => null);
    if (!msg) return enviarPainelFixo(guild);
    const { embed, components } = await buildHome(null);
    await msg.edit({ embeds: [embed], components });
  } catch (err) {
    console.error('[PainelAdmin] Atualizar:', err.message);
  }
}

function buildPublic2FAPanel() {
  const embed = new EmbedBuilder()
    .setColor(0x444d59)
    .setTitle('🔐 Rockstar 2FA Center')
    .setDescription('Central segura para geração de códigos 2FA Rockstar\n**Sistema operacional · Aspect Software · discord.gg/satzx**')
    .addFields(
      { name: '📡 Status', value: '🟢 Online', inline: true },
      { name: '🔒 Resposta', value: 'Privada', inline: true },
      { name: '⏱️ Renova', value: '30s', inline: true },
      { name: '✅ Estável', value: 'Operacional', inline: true },
      { name: '🧩 Central de Controle', value: '• Chave nunca armazenada\n• Código via canal público\n• Expira a cada 30s\n• Compatível com Rockstar', inline: false },
      { name: '📊 Códigos gerados', value: '295595', inline: true },
      { name: '👥 Usuários únicos', value: '390', inline: true },
    )
    .setTimestamp()
    .setFooter({ text: 'Aspect Software • discord.gg/satzx' });

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('public_2fa_gerar')
      .setLabel('🔐 Gerar Código')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('public_2fa_help')
      .setLabel('📘 Como usar')
      .setStyle(ButtonStyle.Secondary),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('public_2fa_translate')
      .setLabel('🌐 Traduzir / Translate')
      .setStyle(ButtonStyle.Secondary),
  );

  return { embed, components: [row1, row2] };
}

async function enviarPainelPublico2FA(guild) {
  try {
    const canal = guild.channels.cache.get(CANAL_PAINEL_PUBLICO_2FA);
    if (!canal) {
      console.warn('[PainelPublico2FA] Canal não encontrado:', CANAL_PAINEL_PUBLICO_2FA);
      return;
    }

    const { embed, components } = buildPublic2FAPanel();
    const msgs = await canal.messages.fetch({ limit: 20 }).catch(() => null);
    const msgExistente = msgs?.find(m =>
      m.author.id === guild.client.user.id &&
      m.embeds.some(e => e.title === '🔐 Rockstar 2FA Center')
    );

    if (msgExistente) {
      await msgExistente.edit({ embeds: [embed], components }).catch(() => {});
      return;
    }

    await canal.send({ embeds: [embed], components });
  } catch (err) {
    console.error('[PainelPublico2FA]', err.message);
  }
}

// ─── Handler central dos botões pa_* ─────────────────────────────────────────
async function handlePainelAdmin(interaction, client) {
  const id = interaction.customId;

  if (!isStaff(interaction.member)) {
    return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
  }

  // ── Navegação de submenus ─────────────────────────────────────────────────
  if (id === 'pa_home') {
    const { embed, components } = await buildHome(interaction.member);
    return interaction.update({ embeds: [embed], components }).catch(() =>
      interaction.editReply({ embeds: [embed], components }));
  }
  if (id === 'pa_menu_loja') {
    if (!isLoja(interaction.member)) return interaction.reply({ content: '❌ Apenas cargo Loja+.', ephemeral: true });
    const { embed, components } = buildLojaMenu();
    return interaction.update({ embeds: [embed], components });
  }
  if (id === 'pa_menu_operacoes') {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Apenas admins.', ephemeral: true });
    const { embed, components } = buildOperacoesMenu();
    return interaction.update({ embeds: [embed], components });
  }
  if (id === 'pa_menu_usuarios') {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Apenas admins.', ephemeral: true });
    const { embed, components } = buildUsuariosMenu();
    return interaction.update({ embeds: [embed], components });
  }
  if (id === 'pa_menu_caixa') {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Apenas admins.', ephemeral: true });
    const { embed, components } = buildCaixaMenu();
    return interaction.update({ embeds: [embed], components });
  }
  if (id === 'pa_menu_config') {
    if (!isOwner(interaction.member)) return interaction.reply({ content: '❌ Apenas o Owner.', ephemeral: true });
    const { embed, components } = buildConfigMenu();
    return interaction.update({ embeds: [embed], components });
  }
  if (id === 'pa_menu_afiliados') {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Apenas admins.', ephemeral: true });
    const { embed, components } = buildAfiliadosMenu();
    return interaction.update({ embeds: [embed], components });
  }
  // Aliases antigos para não quebrar nada
  if (id === 'pa_menu_carrinho') {
    if (!isLoja(interaction.member)) return interaction.reply({ content: '❌ Apenas cargo Loja+.', ephemeral: true });
    const { embed, components } = buildLojaMenu();
    return interaction.update({ embeds: [embed], components });
  }
  if (id === 'pa_menu_gestao') {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Apenas admins.', ephemeral: true });
    const { embed, components } = buildOperacoesMenu();
    return interaction.update({ embeds: [embed], components });
  }

  // ── Configurações da loja ─────────────────────────────────────────────────
  if (id === 'pa_cfg_nome') {
    if (!isOwner(interaction.member)) return interaction.reply({ content: '❌ Apenas o Owner.', ephemeral: true });
    const modal = new ModalBuilder().setCustomId('pam_cfg_nome').setTitle('🏪 Nome da Loja');
    modal.addComponents(
      mRow(new TextInputBuilder().setCustomId('nome').setLabel('Novo nome da loja').setStyle(TextInputStyle.Short).setRequired(true)
        .setPlaceholder('Ex: Máximo Store').setValue(Config.get('nome_loja') || 'Máximo Store').setMaxLength(50)),
    );
    return interaction.showModal(modal);
  }

  if (id === 'pa_cfg_meta') {
    if (!isOwner(interaction.member)) return interaction.reply({ content: '❌ Apenas o Owner.', ephemeral: true });
    const modal = new ModalBuilder().setCustomId('pam_cfg_meta').setTitle('🎯 Meta Diária de Vendas');
    modal.addComponents(
      mRow(new TextInputBuilder().setCustomId('meta').setLabel('Meta em R$ (0 para desativar)').setStyle(TextInputStyle.Short).setRequired(true)
        .setPlaceholder('Ex: 500.00').setValue(String(Config.get('meta_dia') || '0'))),
    );
    return interaction.showModal(modal);
  }

  if (id === 'pa_cfg_cashback') {
    if (!isOwner(interaction.member)) return interaction.reply({ content: '❌ Apenas o Owner.', ephemeral: true });
    const modal = new ModalBuilder().setCustomId('pam_cfg_cashback').setTitle('🪙 Cashback em Coins');
    modal.addComponents(
      mRow(new TextInputBuilder().setCustomId('pct').setLabel('% de coins por compra (ex: 5 = 5%)').setStyle(TextInputStyle.Short).setRequired(true)
        .setPlaceholder('5').setValue(String(Config.get('cashback_pct') || '5')).setMaxLength(3)),
    );
    return interaction.showModal(modal);
  }

  if (id === 'pa_cfg_boas_vindas') {
    if (!isOwner(interaction.member)) return interaction.reply({ content: '❌ Apenas o Owner.', ephemeral: true });
    const modal = new ModalBuilder().setCustomId('pam_cfg_boas_vindas').setTitle('👋 Mensagem de Boas-vindas');
    modal.addComponents(
      mRow(new TextInputBuilder().setCustomId('msg').setLabel('Mensagem (use {usuario} para mencionar)').setStyle(TextInputStyle.Paragraph).setRequired(true)
        .setPlaceholder('Bem-vindo, {usuario}! 🎉')
        .setValue(Config.get('msg_boas_vindas') || 'Bem-vindo, {usuario}! 🎉').setMaxLength(500)),
    );
    return interaction.showModal(modal);
  }

  if (id === 'pa_cfg_canal_vendas') {
    if (!isOwner(interaction.member)) return interaction.reply({ content: '❌ Apenas o Owner.', ephemeral: true });
    const modal = new ModalBuilder().setCustomId('pam_cfg_canal_vendas').setTitle('📢 Canal de Feed de Vendas');
    modal.addComponents(
      mRow(new TextInputBuilder().setCustomId('canal_id').setLabel('ID do canal (0 para desativar)').setStyle(TextInputStyle.Short).setRequired(true)
        .setPlaceholder('Ex: 1234567890').setValue(Config.get('canal_vendas_id') || '')),
    );
    return interaction.showModal(modal);
  }

  if (id === 'pa_cfg_canal_cupons') {
    if (!isOwner(interaction.member)) return interaction.reply({ content: '❌ Apenas o Owner.', ephemeral: true });
    const modal = new ModalBuilder().setCustomId('pam_cfg_canal_cupons').setTitle('🎟️ Canal de Publicação de Cupons');
    modal.addComponents(
      mRow(new TextInputBuilder().setCustomId('canal_id').setLabel('ID do canal (0 para desativar)').setStyle(TextInputStyle.Short).setRequired(true)
        .setPlaceholder('Ex: 1234567890').setValue(Config.get('canal_cupons_id') || '')),
    );
    return interaction.showModal(modal);
  }

  // ── Handlers de afiliados ─────────────────────────────────────────────────
  if (id === 'pa_afil_top') {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Apenas admins.', ephemeral: true });
    await interaction.deferReply({ ephemeral: true });
    const top = db.prepare(`
      SELECT u.nome, u.discord_id, u.saldo, u.codigo_afil,
        COUNT(p.id) as vendas, COALESCE(SUM(p.comissao_afil),0) as total_comissao,
        (SELECT COUNT(*) FROM usuarios WHERE afiliado_de=u.discord_id) as indicados
      FROM usuarios u
      LEFT JOIN pedidos p ON p.afiliado_id=u.discord_id AND p.status IN ('pago','entregue')
      WHERE u.codigo_afil IS NOT NULL
      GROUP BY u.discord_id ORDER BY total_comissao DESC LIMIT 10
    `).all();
    if (!top.length) return interaction.editReply({ content: '📊 Nenhum afiliado com vendas ainda.' });
    const medals = ['🥇','🥈','🥉','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];
    const embed  = new EmbedBuilder().setColor(0x9B59B6).setTitle('🏆 Top Afiliados por Comissão').setTimestamp();
    top.forEach((u,i) => embed.addFields({
      name:  `${medals[i]} ${u.nome || u.discord_id}`,
      value: `💰 R$ ${Number(u.total_comissao).toFixed(2)} • ${u.vendas} venda(s) • 👥 ${u.indicados} indicado(s)\n🏦 Saldo: R$ ${Number(u.saldo||0).toFixed(2)} • Código: \`${u.codigo_afil}\``,
      inline: false,
    }));
    return interaction.editReply({ embeds: [embed] });
  }

  if (id === 'pa_afil_saques') {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Apenas admins.', ephemeral: true });
    await interaction.deferReply({ ephemeral: true });
    const saques = db.prepare(`
      SELECT u.discord_id, u.nome, u.saldo, u.codigo_afil,
        COUNT(p.id) as vendas, COALESCE(SUM(p.comissao_afil),0) as total_comissao
      FROM usuarios u
      LEFT JOIN pedidos p ON p.afiliado_id=u.discord_id AND p.status IN ('pago','entregue')
      WHERE u.saldo > 0
      GROUP BY u.discord_id ORDER BY u.saldo DESC LIMIT 10
    `).all();
    if (!saques.length) return interaction.editReply({ content: '✅ Nenhum saldo pendente para pagar.' });
    const embed = new EmbedBuilder().setColor(0x9B59B6).setTitle('💸 Afiliados com Saldo a Receber').setTimestamp();
    for (const s of saques) {
      embed.addFields({
        name:  `💸 ${s.nome || s.discord_id}`,
        value: `🏦 **R$ ${Number(s.saldo).toFixed(2)}** a receber • ${s.vendas} venda(s) gerada(s)\n\`${s.discord_id}\``,
        inline: false,
      });
    }
    const rowPagar = new ActionRowBuilder().addComponents(
      btn('pa_afil_pagar_saque', '✅ Pagar Saque', ButtonStyle.Success),
    );
    return interaction.editReply({ embeds: [embed], components: [rowPagar] });
  }

  if (id === 'pa_afil_pagar_saque') {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Apenas admins.', ephemeral: true });
    const modal = new ModalBuilder().setCustomId('pam_afil_pagar_saque').setTitle('✅ Confirmar Pagamento de Saque');
    modal.addComponents(
      mRow(new TextInputBuilder().setCustomId('discord_id').setLabel('Discord ID do afiliado').setStyle(TextInputStyle.Short).setRequired(true)),
      mRow(new TextInputBuilder().setCustomId('comprovante').setLabel('Comprovante / observação').setStyle(TextInputStyle.Paragraph).setRequired(false).setPlaceholder('Ex: PIX confirmado, chave: ...')),
    );
    return interaction.showModal(modal);
  }

  if (id === 'pa_afil_rejeitar_saque') {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Apenas admins.', ephemeral: true });
    const modal = new ModalBuilder().setCustomId('pam_afil_rejeitar_saque').setTitle('❌ Rejeitar Saque de Afiliado');
    modal.addComponents(
      mRow(new TextInputBuilder().setCustomId('discord_id').setLabel('Discord ID do afiliado').setStyle(TextInputStyle.Short).setRequired(true)),
      mRow(new TextInputBuilder().setCustomId('motivo').setLabel('Motivo da rejeição').setStyle(TextInputStyle.Short).setRequired(true)),
    );
    return interaction.showModal(modal);
  }

  if (id === 'pa_afil_buscar') {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Apenas admins.', ephemeral: true });
    const modal = new ModalBuilder().setCustomId('pam_afil_buscar').setTitle('🔍 Buscar Afiliado');
    modal.addComponents(
      mRow(new TextInputBuilder().setCustomId('discord_id').setLabel('Discord ID ou código do afiliado').setStyle(TextInputStyle.Short).setRequired(true)),
    );
    return interaction.showModal(modal);
  }

  if (id === 'pa_afil_cfg_comissao') {
    if (!isOwner(interaction.member)) return interaction.reply({ content: '❌ Apenas o Owner.', ephemeral: true });
    const atual = Config.get('taxa_afiliado') || '5';
    const modal = new ModalBuilder().setCustomId('pam_afil_cfg_comissao').setTitle('⚙️ Comissão N1');
    modal.addComponents(
      mRow(new TextInputBuilder().setCustomId('pct').setLabel('% comissão por venda (Nível 1)').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(atual)).setPlaceholder('Ex: 5')),
    );
    return interaction.showModal(modal);
  }

  if (id === 'pa_afil_cfg_min_saque') {
    if (!isOwner(interaction.member)) return interaction.reply({ content: '❌ Apenas o Owner.', ephemeral: true });
    const atual = Config.get('min_saque_afiliado') || '20';
    const modal = new ModalBuilder().setCustomId('pam_afil_cfg_min_saque').setTitle('⚙️ Mínimo para Saque');
    modal.addComponents(
      mRow(new TextInputBuilder().setCustomId('valor').setLabel('Valor mínimo em R$ para saque').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(atual)).setPlaceholder('Ex: 20.00')),
    );
    return interaction.showModal(modal);
  }

  if (id === 'pa_afil_cfg_nivel2') {
    if (!isOwner(interaction.member)) return interaction.reply({ content: '❌ Apenas o Owner.', ephemeral: true });
    const atual = Config.get('taxa_afil_n2') || '2';
    const modal = new ModalBuilder().setCustomId('pam_afil_cfg_nivel2').setTitle('⚙️ Comissão N2');
    modal.addComponents(
      mRow(new TextInputBuilder().setCustomId('pct').setLabel('% comissão por venda (Nível 2)').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(atual)).setPlaceholder('Ex: 2')),
    );
    return interaction.showModal(modal);
  }

  if (id === 'pa_afil_cfg_bonus') {
    if (!isOwner(interaction.member)) return interaction.reply({ content: '❌ Apenas o Owner.', ephemeral: true });
    const atual = Config.get('taxa_afil_n1_bonus') || '1';
    const modal = new ModalBuilder().setCustomId('pam_afil_cfg_bonus').setTitle('⚙️ Bônus N1 quando N2 vende');
    modal.addComponents(
      mRow(new TextInputBuilder().setCustomId('pct').setLabel('% que N1 ganha quando seu N2 vende').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(atual)).setPlaceholder('Ex: 1')),
    );
    return interaction.showModal(modal);
  }

  if (id === 'pa_afil_registrar') {
    if (!isOwner(interaction.member)) return interaction.reply({ content: '❌ Apenas o Owner.', ephemeral: true });
    const modal = new ModalBuilder().setCustomId('pam_afil_registrar').setTitle('➕ Registrar Afiliado N1');
    modal.addComponents(
      mRow(new TextInputBuilder().setCustomId('discord_id').setLabel('Discord ID do afiliado').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: 1234567890123456789')),
      mRow(new TextInputBuilder().setCustomId('codigo_acesso').setLabel('Código de acesso ao painel (único)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: ACESSO2025').setMaxLength(20)),
      mRow(new TextInputBuilder().setCustomId('codigo_vendas').setLabel('Código de vendas (para o ticket)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: ALAN10').setMaxLength(20)),
    );
    return interaction.showModal(modal);
  }

  if (id === 'pa_afil_remover') {
    if (!isOwner(interaction.member)) return interaction.reply({ content: '❌ Apenas o Owner.', ephemeral: true });
    const modal = new ModalBuilder().setCustomId('pam_afil_remover').setTitle('🗑️ Remover Afiliado');
    modal.addComponents(
      mRow(new TextInputBuilder().setCustomId('discord_id').setLabel('Discord ID do afiliado').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: 1234567890123456789')),
    );
    return interaction.showModal(modal);
  }

  // ── Gerar QR Code manualmente com valor ──────────────────────────────────
  if (id === 'pa_gerar_qr') {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Apenas admins.', ephemeral: true });
    const modal = new ModalBuilder().setCustomId('pam_gerar_qr').setTitle('💠 Gerar QR Code PIX');
    modal.addComponents(
      mRow(new TextInputBuilder().setCustomId('valor').setLabel('Valor (R$)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: 99.90')),
    );
    return interaction.showModal(modal);
  }

  // ── Gerar QR Code — modal handler ────────────────────────────────────────
  // (tratado em handlePainelAdminModals)

  // ── Ver entrega de um pedido ──────────────────────────────────────────────
  if (id === 'pa_ver_entrega') {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Apenas admins.', ephemeral: true });
    const modal = new ModalBuilder().setCustomId('pam_ver_entrega').setTitle('🔍 Ver Conteúdo Entregue');
    modal.addComponents(
      mRow(new TextInputBuilder().setCustomId('pedido_id').setLabel('ID do Pedido (primeiros 8 chars)').setStyle(TextInputStyle.Short).setRequired(true)),
    );
    return interaction.showModal(modal);
  }

  // ── Filtrar pedidos ───────────────────────────────────────────────────────
  if (id === 'pa_filtrar_pedidos') {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Apenas admins.', ephemeral: true });
    const modal = new ModalBuilder().setCustomId('pam_filtrar_pedidos').setTitle('🔎 Filtrar Pedidos');
    modal.addComponents(
      mRow(new TextInputBuilder().setCustomId('discord_id').setLabel('Discord ID do usuário (vazio = todos)').setStyle(TextInputStyle.Short).setRequired(false)),
      mRow(new TextInputBuilder().setCustomId('status').setLabel('Status: pago, entregue, pendente, cancelado').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('Vazio = todos')),
      mRow(new TextInputBuilder().setCustomId('dias').setLabel('Últimos X dias (vazio = todos)').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('Ex: 7')),
    );
    return interaction.showModal(modal);
  }

  // ── Zerar histórico ───────────────────────────────────────────────────────
  if (id === 'pa_zerar_historico') {
    if (!isOwner(interaction.member)) return interaction.reply({ content: '❌ Apenas o Owner.', ephemeral: true });
    // Confirmação com botões
    const rowConf = new ActionRowBuilder().addComponents(
      btn('pa_confirmar_zerar', '✅ Sim, zerar tudo', ButtonStyle.Danger),
      btn('pa_cancelar_zerar',  '❌ Cancelar',        ButtonStyle.Secondary),
    );
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(config.colors.error)
        .setTitle('⚠️ Confirmar Zeragem de Histórico')
        .setDescription([
          '> Esta ação é **irreversível** e irá apagar:',
          '> • Todos os pedidos (pagos, entregues, cancelados)',
          '> • Todos os tickets',
          '> • Todos os reembolsos',
          '> • Histórico de coins e caixas',
          '> • Contadores de vendas dos produtos',
          '> ',
          '> ✅ **Serão mantidos:** produtos, estoques, usuários, cupons, configurações.',
        ].join('\n'))],
      components: [rowConf],
      ephemeral: true,
    });
  }

  if (id === 'pa_confirmar_zerar') {
    if (!isOwner(interaction.member)) return interaction.reply({ content: '❌ Apenas o Owner.', ephemeral: true });
    await interaction.deferUpdate();
    try {
      const tabelas = ['pedidos', 'tickets', 'reembolsos', 'coins_historico', 'caixa_historico', 'afiliados_ganhos'];
      for (const t of tabelas) {
        try { db.prepare(`DELETE FROM ${t}`).run(); } catch {}
      }
      // Resetar contadores
      try { db.prepare('UPDATE produtos SET vendas=0').run(); } catch {}
      try { db.prepare('UPDATE variantes_produto SET vendas=0').run(); } catch {}
      try { db.prepare('UPDATE usuarios SET total_compras=0, total_gasto=0').run(); } catch {}
      // Resetar estoque_variante usado (marcar como disponível de novo os itens já usados são perdidos — só zera flag)
      // NÃO faz isso pois o conteúdo do item foi entregue
      _statsCache = null;
      await atualizarPainelAdmin(interaction.guild);
      const { log } = require('../utils/logger');
      await log('sistema', { executor: interaction.user.id, descricao: '🗑️ Histórico de vendas zerado pelo Owner' });
      return interaction.editReply({ content: '✅ Histórico zerado com sucesso. Produtos e estoques mantidos.', embeds: [], components: [] });
    } catch (err) {
      return interaction.editReply({ content: `❌ Erro: \`${err.message}\``, embeds: [], components: [] });
    }
  }

  if (id === 'pa_cancelar_zerar') {
    return interaction.update({ content: '✅ Cancelado.', embeds: [], components: [] });
  }

  // ── Reenviar produto para usuário ─────────────────────────────────────────
  if (id === 'pa_reenviar_produto') {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Apenas admins.', ephemeral: true });
    const modal = new ModalBuilder().setCustomId('pam_reenviar_produto').setTitle('🔄 Reenviar Produto');
    modal.addComponents(
      mRow(new TextInputBuilder().setCustomId('pedido_id').setLabel('ID do Pedido (primeiros 8 chars)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: A1B2C3D4')),
    );
    return interaction.showModal(modal);
  }

  // ── Reentregas pendentes ──────────────────────────────────────────────────
  if (id === 'pa_reentregas') {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Apenas admins.', ephemeral: true });
    await interaction.deferReply({ ephemeral: true });
    const falhos = db.prepare(`
      SELECT p.*, pr.nome as pnome FROM pedidos p
      JOIN produtos pr ON p.produto_id=pr.id
      WHERE p.status='pago' AND (p.entregue_em IS NULL OR p.entregue_em=0)
      ORDER BY p.pago_em DESC LIMIT 10
    `).all();
    if (!falhos.length) return interaction.editReply({ content: '✅ Nenhuma entrega pendente.' });
    const embed = new EmbedBuilder().setColor(config.colors.warning).setTitle('📦 Entregas Pendentes').setTimestamp();
    for (const p of falhos) {
      embed.addFields({ name: `📦 ${p.pnome}`, value: `<@${p.usuario_id}> • R$ ${Number(p.valor_total).toFixed(2)} • \`${p.id.slice(0,8)}\``, inline: false });
    }
    // Botão para cada pedido (até 5 por row × 5 rows = 25, mas Discord permite 5 rows por mensagem)
    const rows = [];
    for (let i = 0; i < Math.min(falhos.length, 5); i++) {
      rows.push(new ActionRowBuilder().addComponents(
        btn(`pa_forcar_entrega_${falhos[i].id}`, `📦 ${falhos[i].pnome.slice(0,20)} — ${falhos[i].id.slice(0,6)}`, ButtonStyle.Success),
      ));
    }
    return interaction.editReply({ embeds: [embed], components: rows });
  }

  if (id.startsWith('pa_forcar_entrega_')) {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Apenas admins.', ephemeral: true });
    await interaction.deferReply({ ephemeral: true });
    const pedidoId = id.replace('pa_forcar_entrega_', '');
    const pedido   = db.prepare('SELECT * FROM pedidos WHERE id=?').get(pedidoId);
    if (!pedido) return interaction.editReply({ content: '❌ Pedido não encontrado.' });
    try {
      const { entregarProduto } = require('./loja');
      await entregarProduto(pedido, client);
      return interaction.editReply({ content: `✅ Produto reenviado para <@${pedido.usuario_id}>.` });
    } catch (err) {
      return interaction.editReply({ content: `❌ Erro: \`${err.message}\`` });
    }
  }

  // ── Pausar/retomar produto ────────────────────────────────────────────────
  if (id === 'pa_pausar_produto') {
    if (!isLoja(interaction.member)) return interaction.reply({ content: '❌ Apenas cargo Loja.', ephemeral: true });
    const modal = new ModalBuilder().setCustomId('pam_pausar_produto').setTitle('⏸️ Pausar/Retomar Produto');
    modal.addComponents(
      mRow(new TextInputBuilder().setCustomId('produto_id').setLabel('ID do Produto (primeiros 8 chars)').setStyle(TextInputStyle.Short).setRequired(true)),
    );
    return interaction.showModal(modal);
  }

  // ── Vendas por produto (receita) ──────────────────────────────────────────
  if (id === 'pa_vendas_produto') {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Apenas admins.', ephemeral: true });
    await interaction.deferReply({ ephemeral: true });
    const dados = db.prepare(`
      SELECT pr.nome, COUNT(*) as qtd, COALESCE(SUM(p.valor_total),0) as receita
      FROM pedidos p JOIN produtos pr ON p.produto_id=pr.id
      WHERE p.status IN ('pago','entregue')
      GROUP BY p.produto_id ORDER BY receita DESC LIMIT 10
    `).all();
    if (!dados.length) return interaction.editReply({ content: '📊 Nenhuma venda registrada.' });
    const maxRec = dados[0].receita;
    const linhas = dados.map((d, i) => {
      const bar = '█'.repeat(Math.round((d.receita / maxRec) * 8)) + '░'.repeat(8 - Math.round((d.receita / maxRec) * 8));
      return `\`${String(i+1).padStart(2)}\` \`${bar}\` **${d.nome.slice(0,20)}** — ${d.qtd}× — R$ ${Number(d.receita).toFixed(2)}`;
    });
    const embed = new EmbedBuilder().setColor(config.colors.gold).setTitle('📊 Receita por Produto').setDescription(linhas.join('\n')).setTimestamp();
    return interaction.editReply({ embeds: [embed] });
  }

  // ── Ver conteúdo do estoque de uma variante ────────────────────────────────
  if (id === 'pa_ver_estoque') {
    if (!isLoja(interaction.member)) return interaction.reply({ content: '❌ Apenas cargo Loja.', ephemeral: true });
    const modal = new ModalBuilder().setCustomId('pam_ver_estoque').setTitle('🔍 Ver Estoque da Variante');
    modal.addComponents(
      mRow(new TextInputBuilder().setCustomId('variante_id').setLabel('ID da Variante (primeiros 8 chars)').setStyle(TextInputStyle.Short).setRequired(true)),
    );
    return interaction.showModal(modal);
  }

  // ── Histórico de compras de um usuário ────────────────────────────────────
  if (id === 'pa_historico_usuario') {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Apenas admins.', ephemeral: true });
    const modal = new ModalBuilder().setCustomId('pam_historico_usuario').setTitle('📜 Histórico do Usuário');
    modal.addComponents(
      mRow(new TextInputBuilder().setCustomId('discord_id').setLabel('Discord ID do usuário').setStyle(TextInputStyle.Short).setRequired(true)),
    );
    return interaction.showModal(modal);
  }

  // ── Resetar contador de compras de um usuário ─────────────────────────────
  if (id === 'pa_resetar_compras') {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Apenas admins.', ephemeral: true });
    const modal = new ModalBuilder().setCustomId('pam_resetar_compras').setTitle('🔄 Resetar Compras do Usuário');
    modal.addComponents(
      mRow(new TextInputBuilder().setCustomId('discord_id').setLabel('Discord ID do usuário').setStyle(TextInputStyle.Short).setRequired(true)),
      mRow(new TextInputBuilder().setCustomId('confirmar').setLabel('Digite CONFIRMAR para prosseguir').setStyle(TextInputStyle.Short).setRequired(true)),
    );
    return interaction.showModal(modal);
  }

  // ── Simulador de receita ──────────────────────────────────────────────────
  if (id === 'pa_simulador') {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Apenas admins.', ephemeral: true });
    const modal = new ModalBuilder().setCustomId('pam_simulador').setTitle('💡 Simulador de Receita');
    modal.addComponents(
      mRow(new TextInputBuilder().setCustomId('vendas_dia').setLabel('Vendas por dia (estimativa)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: 10')),
      mRow(new TextInputBuilder().setCustomId('ticket_medio').setLabel('Ticket médio R$ por venda').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: 35.00')),
      mRow(new TextInputBuilder().setCustomId('dias').setLabel('Período em dias').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: 30')),
    );
    return interaction.showModal(modal);
  }

  // ── DM em massa para compradores ──────────────────────────────────────────
  if (id === 'pa_dm_compradores') {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Apenas admins.', ephemeral: true });
    const modal = new ModalBuilder().setCustomId('pam_dm_compradores').setTitle('📨 DM para Compradores');
    modal.addComponents(
      mRow(new TextInputBuilder().setCustomId('titulo').setLabel('Título da mensagem').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('🎉 Novidade!')),
      mRow(new TextInputBuilder().setCustomId('mensagem').setLabel('Mensagem').setStyle(TextInputStyle.Paragraph).setRequired(true).setPlaceholder('Olá! Temos uma novidade...')),
      mRow(new TextInputBuilder().setCustomId('produto_id').setLabel('Filtrar por produto ID (vazio = todos)').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('Primeiros 8 chars do produto')),
    );
    return interaction.showModal(modal);
  }

  // ── Enviar produto manualmente ────────────────────────────────────────────
  if (id === 'pa_enviar_produto') {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Apenas admins.', ephemeral: true });

    // Buscar todos os produtos ativos com variantes
    const produtos = db.prepare(`
      SELECT p.id, p.nome,
        (SELECT COUNT(*) FROM variantes_produto WHERE produto_id=p.id AND ativo=1) as num_vars,
        (SELECT COUNT(*) FROM estoque_variante ev JOIN variantes_produto vp ON ev.variante_id=vp.id WHERE vp.produto_id=p.id AND ev.usado=0) as estoque
      FROM produtos p WHERE p.ativo=1 ORDER BY p.nome ASC LIMIT 25
    `).all();

    if (!produtos.length) return interaction.reply({ content: '❌ Nenhum produto ativo encontrado.', ephemeral: true });

    const { StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');

    const opcoes = produtos.map(p =>
      new StringSelectMenuOptionBuilder()
        .setValue(p.id)
        .setLabel(p.nome.slice(0, 100))
        .setDescription(`${p.num_vars} variante(s) • ${p.estoque} item(s) em estoque`)
        .setEmoji('📦'),
    );

    const selectRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('pa_select_produto_envio')
        .setPlaceholder('Selecione o produto...')
        .addOptions(opcoes),
    );

    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('📤 Enviar Produto')
        .setDescription([
          '> Selecione o produto que deseja enviar.',
          '> Em seguida você escolherá a variante e o destinatário.',
        ].join('\n'))
        .setFooter({ text: 'Máximo Store • Envio Manual' })],
      components: [selectRow],
      ephemeral: true,
    });
  }

  // ── Select produto → mostrar variantes ────────────────────────────────────
  if (id === 'pa_select_produto_envio') {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Apenas admins.', ephemeral: true });
    const produtoId = interaction.values[0];
    const produto   = db.prepare('SELECT * FROM produtos WHERE id=?').get(produtoId);
    if (!produto) return interaction.reply({ content: '❌ Produto não encontrado.', ephemeral: true });

    const variantes = db.prepare(`
      SELECT vp.*, (SELECT COUNT(*) FROM estoque_variante ev WHERE ev.variante_id=vp.id AND ev.usado=0) as estoque
      FROM variantes_produto vp WHERE vp.produto_id=? AND vp.ativo=1 ORDER BY vp.ordem ASC LIMIT 25
    `).all(produtoId);

    if (!variantes.length) return interaction.reply({ content: '❌ Nenhuma variante ativa neste produto.', ephemeral: true });

    const { StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');

    const opcoes = variantes.map(v =>
      new StringSelectMenuOptionBuilder()
        .setValue(v.id)
        .setLabel(v.nome.slice(0, 100))
        .setDescription(`R$ ${Number(v.preco).toFixed(2)} • ${v.estoque} item(s) disponível`)
        .setEmoji(v.estoque > 0 ? '✅' : '⚠️'),
    );

    const selectRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`pa_select_variante_envio_${produtoId}`)
        .setPlaceholder('Selecione a variante...')
        .addOptions(opcoes),
    );

    return interaction.update({
      embeds: [new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`📤 Enviar — ${produto.nome}`)
        .setDescription('> Selecione a variante que deseja enviar.')
        .setFooter({ text: 'Máximo Store • Envio Manual' })],
      components: [selectRow],
    });
  }

  // ── Select variante → modal de destinatário ───────────────────────────────
  if (id.startsWith('pa_select_variante_envio_')) {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Apenas admins.', ephemeral: true });
    const produtoId  = id.replace('pa_select_variante_envio_', '');
    const varianteId = interaction.values[0];
    const variante   = db.prepare('SELECT * FROM variantes_produto WHERE id=?').get(varianteId);
    const produto    = db.prepare('SELECT * FROM produtos WHERE id=?').get(produtoId);
    if (!variante || !produto) return interaction.reply({ content: '❌ Variante não encontrada.', ephemeral: true });

    const estoque = db.prepare('SELECT COUNT(*) as c FROM estoque_variante WHERE variante_id=? AND usado=0').get(varianteId).c;
    if (estoque === 0) return interaction.reply({ content: `⚠️ Variante **${variante.nome}** sem estoque.`, ephemeral: true });

    const modal = new ModalBuilder()
      .setCustomId(`pam_enviar_produto_${varianteId}`)
      .setTitle(`📤 Enviar — ${produto.nome.slice(0,30)}`);
    modal.addComponents(
      mRow(new TextInputBuilder()
        .setCustomId('discord_id')
        .setLabel('Discord ID do destinatário (opcional)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setPlaceholder('Deixe vazio para enviar neste canal')),
      mRow(new TextInputBuilder()
        .setCustomId('quantidade')
        .setLabel('Quantidade')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setValue('1')
        .setMaxLength(2)),
      mRow(new TextInputBuilder()
        .setCustomId('motivo')
        .setLabel('Motivo (aparece no log)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setPlaceholder('Ex: Brinde, reenvio, giveaway...')),
    );
    return interaction.showModal(modal);
  }

  // ── Nota fiscal manual ────────────────────────────────────────────────────
  if (id === 'pa_nota_fiscal') {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Apenas admins.', ephemeral: true });
    const modal = new ModalBuilder().setCustomId('pam_nota_fiscal').setTitle('🧾 Emitir Nota Fiscal Manual');
    modal.addComponents(
      mRow(new TextInputBuilder().setCustomId('pedido_id').setLabel('ID do Pedido').setStyle(TextInputStyle.Short).setRequired(true)),
    );
    return interaction.showModal(modal);
  }

  // ── Atualizar home ────────────────────────────────────────────────────────
  if (id === 'pa_atualizar') {    await interaction.deferReply({ ephemeral: true });
    await atualizarPainelAdmin(interaction.guild);
    return interaction.editReply({ content: '✅ Painel atualizado!' });
  }

  // ── Toggle loja ───────────────────────────────────────────────────────────
  if (id === 'pa_toggle_loja') {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Apenas admins.', ephemeral: true });
    const atual = Config.get('loja_aberta');
    Config.set('loja_aberta', atual ? '0' : '1');
    const { log } = require('../utils/logger');
    await log('sistema', { executor: interaction.user.id, descricao: `Loja ${atual ? 'fechada' : 'aberta'}` });
    await interaction.reply({ content: `✅ Loja ${atual ? '🔴 fechada' : '🟢 aberta'}.`, ephemeral: true });
    return atualizarPainelAdmin(interaction.guild);
  }

  // ── Toggle manutenção ─────────────────────────────────────────────────────
  if (id === 'pa_toggle_manut') {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Apenas admins.', ephemeral: true });
    const atual = Config.get('manutencao') === true || Config.get('manutencao') === '1';
    // Salvar como boolean explícito para Config.get retornar corretamente
    db.prepare("INSERT OR REPLACE INTO configuracoes (chave,valor,tipo) VALUES ('manutencao',?,'boolean')").run(atual ? '0' : '1');
    _statsCache = null; // invalidar cache
    await interaction.reply({ content: `✅ Manutenção ${atual ? 'desativada ✅' : 'ativada 🔧'}.`, ephemeral: true });
    return atualizarPainelAdmin(interaction.guild);
  }

  // ── Relatório ─────────────────────────────────────────────────────────────
  if (id === 'pa_relatorio') {
    await interaction.deferReply({ ephemeral: true });
    const periodos = [
      { nome: 'Hoje',    inicio: Math.floor(new Date().setHours(0,0,0,0)/1000) },
      { nome: '7 dias',  inicio: Math.floor(Date.now()/1000) - 7*86400 },
      { nome: '30 dias', inicio: Math.floor(Date.now()/1000) - 30*86400 },
      { nome: 'Total',   inicio: 0 },
    ];
    const embed = new EmbedBuilder().setColor(config.colors.info).setTitle('📊 Relatório de Vendas').setTimestamp();
    for (const p of periodos) {
      const r = db.prepare("SELECT COUNT(*) as v, COALESCE(SUM(valor_total),0) as r FROM pedidos WHERE status IN ('pago','entregue') AND pago_em>=?").get(p.inicio);
      embed.addFields({ name: `📅 ${p.nome}`, value: `${r.v} vendas • R$ ${Number(r.r).toFixed(2)}`, inline: true });
    }
    // Botão para exportar CSV e gráfico
    const { AttachmentBuilder } = require('discord.js');
    const rowCsv = new ActionRowBuilder().addComponents(
      btn('pa_exportar_csv',      '📥 Exportar CSV',    ButtonStyle.Secondary),
      btn('pa_grafico_vendas',    '📈 Gráfico Vendas',  ButtonStyle.Primary),
    );
    return interaction.editReply({ embeds: [embed], components: [rowCsv] });
  }

  if (id === 'pa_grafico_vendas') {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Apenas admins.', ephemeral: true });
    await interaction.deferReply({ ephemeral: true });

    // Últimos 7 dias
    const dias = [];
    for (let i = 6; i >= 0; i--) {
      const inicio = Math.floor(new Date(Date.now() - i * 86400000).setHours(0,0,0,0) / 1000);
      const fim    = inicio + 86400;
      const r = db.prepare("SELECT COUNT(*) as v, COALESCE(SUM(valor_total),0) as r FROM pedidos WHERE status IN ('pago','entregue') AND pago_em>=? AND pago_em<?").get(inicio, fim);
      const data = new Date(inicio * 1000);
      dias.push({ label: `${data.getDate().toString().padStart(2,'0')}/${(data.getMonth()+1).toString().padStart(2,'0')}`, vendas: r.v, receita: Number(r.r) });
    }

    // Tentar gerar gráfico com canvas (disponível no Railway)
    try {
      const { createCanvas } = require('canvas');
      const W = 700, H = 350, PAD = 50;
      const canvas = createCanvas(W, H);
      const ctx    = canvas.getContext('2d');

      // Fundo
      ctx.fillStyle = '#2C2F33';
      ctx.fillRect(0, 0, W, H);

      // Título
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 18px sans-serif';
      ctx.fillText('📈 Vendas — Últimos 7 Dias', PAD, 30);

      const maxVendas = Math.max(...dias.map(d => d.vendas), 1);
      const barW = (W - PAD * 2) / dias.length - 10;
      const chartH = H - PAD * 2;

      dias.forEach((d, i) => {
        const x     = PAD + i * ((W - PAD * 2) / dias.length) + 5;
        const barH  = (d.vendas / maxVendas) * chartH;
        const y     = H - PAD - barH;
        const hue   = 140; // verde
        ctx.fillStyle = `hsl(${hue}, 60%, ${40 + (d.vendas / maxVendas) * 30}%)`;
        ctx.fillRect(x, y, barW, barH);
        // Label data
        ctx.fillStyle = '#AAAAAA';
        ctx.font = '12px sans-serif';
        ctx.fillText(d.label, x, H - PAD + 15);
        // Valor
        if (d.vendas > 0) {
          ctx.fillStyle = '#FFFFFF';
          ctx.font = 'bold 12px sans-serif';
          ctx.fillText(String(d.vendas), x + barW/2 - 5, y - 5);
        }
      });

      // Eixo
      ctx.strokeStyle = '#555';
      ctx.beginPath();
      ctx.moveTo(PAD, PAD); ctx.lineTo(PAD, H - PAD); ctx.lineTo(W - PAD, H - PAD);
      ctx.stroke();

      const buf = canvas.toBuffer('image/png');
      const { AttachmentBuilder } = require('discord.js');
      const att = new AttachmentBuilder(buf, { name: 'grafico_vendas.png' });
      const embedG = new EmbedBuilder().setColor(config.colors.success).setTitle('📈 Gráfico de Vendas — 7 dias')
        .setImage('attachment://grafico_vendas.png')
        .addFields(dias.map(d => ({ name: d.label, value: `${d.vendas} venda(s)\nR$ ${d.receita.toFixed(2)}`, inline: true })))
        .setTimestamp();
      return interaction.editReply({ embeds: [embedG], files: [att] });
    } catch {
      // Fallback sem canvas: gráfico ASCII
      const maxVendas = Math.max(...dias.map(d => d.vendas), 1);
      const linhas = dias.map(d => {
        const barras = Math.round((d.vendas / maxVendas) * 15);
        return `\`${d.label}\` ${'█'.repeat(barras)}${'░'.repeat(15-barras)} **${d.vendas}** venda(s) • R$ ${d.receita.toFixed(2)}`;
      });
      const embedG = new EmbedBuilder().setColor(config.colors.success).setTitle('📈 Vendas — Últimos 7 Dias')
        .setDescription(linhas.join('\n')).setTimestamp();
      return interaction.editReply({ embeds: [embedG] });
    }
  }

  if (id === 'pa_exportar_csv') {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Apenas admins.', ephemeral: true });
    await interaction.deferReply({ ephemeral: true });
    const pedidos = db.prepare("SELECT p.*, u.nome AS nome_usuario FROM pedidos p LEFT JOIN usuarios u ON p.usuario_id=u.discord_id WHERE p.status IN ('pago','entregue') ORDER BY p.pago_em DESC LIMIT 1000").all();
    const linhas = ['ID,Usuário,Produto_ID,Valor,Status,Data_Pagamento,Cupom'];
    for (const p of pedidos) {
      const data = p.pago_em ? new Date(p.pago_em * 1000).toLocaleDateString('pt-BR') : '';
      linhas.push([
        p.id.slice(0,8),
        (p.nome_usuario || p.usuario_id).replace(/,/g, ' '),
        p.produto_id.slice(0,8),
        Number(p.valor_total).toFixed(2),
        p.status,
        data,
        p.cupom_usado || '',
      ].join(','));
    }
    const csv = linhas.join('\n');
    const buf = Buffer.from(csv, 'utf-8');
    const { AttachmentBuilder } = require('discord.js');
    const att = new AttachmentBuilder(buf, { name: `vendas_${new Date().toISOString().slice(0,10)}.csv` });
    return interaction.editReply({ content: `✅ ${pedidos.length} pedido(s) exportado(s).`, files: [att] });
  }

  // ─── CARRINHO ──────────────────────────────────────────────────────────────  // ─── CARRINHO ──────────────────────────────────────────────────────────────

  if (id === 'pa_criar_carrinho') {
    if (!isLoja(interaction.member)) return interaction.reply({ content: '❌ Apenas cargo Loja.', ephemeral: true });
    const cc = require('./criarCarrinhoSub');
    await interaction.deferReply({ ephemeral: true });
    return cc.abrirSubmenu(interaction, 'criar');
  }

  if (id === 'pa_editar_carrinho') {
    if (!isLoja(interaction.member)) return interaction.reply({ content: '❌ Apenas cargo Loja.', ephemeral: true });
    await interaction.deferReply({ ephemeral: true });
    // Listar carrinhos para escolher qual editar
    const paineis = db.prepare('SELECT p.*, pr.nome AS pnome FROM paineis_canal p JOIN produtos pr ON p.produto_id=pr.id WHERE p.ativo=1 ORDER BY p.criado_em DESC LIMIT 25').all();
    if (!paineis.length) return interaction.editReply({ content: '📋 Nenhum carrinho criado ainda.' });
    const options = paineis.map(p => ({
      label: p.pnome.slice(0, 100),
      description: `Canal: ${p.canal_id} | ID: ${p.produto_id.slice(0,8)}`,
      value: p.id,
    }));
    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('pa_select_editar_carrinho')
        .setPlaceholder('Selecione o carrinho para editar')
        .addOptions(options),
    );
    return interaction.editReply({ content: '✏️ Escolha o carrinho que deseja editar:', components: [row] });
  }

  if (id === 'pa_select_editar_carrinho') {
    if (!isLoja(interaction.member)) return interaction.reply({ content: '❌ Apenas cargo Loja.', ephemeral: true });
    const painelId = interaction.values[0];
    const painel   = db.prepare('SELECT * FROM paineis_canal WHERE id=?').get(painelId);
    const produto  = painel ? db.prepare('SELECT * FROM produtos WHERE id=?').get(painel.produto_id) : null;
    if (!painel || !produto) return interaction.reply({ content: '❌ Carrinho não encontrado.', ephemeral: true });
    await interaction.deferUpdate().catch(() => {});
    const cc = require('./criarCarrinhoSub');
    return cc.abrirSubmenu(interaction, 'editar', {
      canalId:   painel.canal_id,
      titulo:    painel.titulo || produto.nome,
      descricao: painel.descricao,
      imagemUrl: painel.imagem_url,
      cor:       painel.cor || 'FF6B6B',
      painelId:  painel.id,
      produtoId: produto.id,
    });
  }

  // Submenu criar/editar carrinho (cc_*)
  if (id.startsWith('cc_')) {
    const cc = require('./criarCarrinhoSub');
    switch (id) {
      case 'cc_canal':           return cc.modalCanal(interaction);
      case 'cc_titulo':          return cc.modalTitulo(interaction);
      case 'cc_descricao':       return cc.modalDescricao(interaction);
      case 'cc_imagem':          return cc.modalImagem(interaction);
      case 'cc_thumbnail':       return cc.modalThumbnail(interaction);
      case 'cc_add_plano':       return cc.modalAddPlano(interaction);
      case 'cc_rem_plano':       return cc.mostrarRemPlano(interaction);
      case 'cc_rem_plano_select':return cc.processarRemPlano(interaction);
      case 'cc_publicar':        return cc.publicar(interaction);
      case 'cc_salvar':          return cc.salvar(interaction);
      case 'cc_cancelar':        return cc.cancelar(interaction);
    }
  }

  if (id === 'pa_add_plano') {
    if (!isLoja(interaction.member)) return interaction.reply({ content: '❌ Apenas cargo Loja.', ephemeral: true });
    const sub = require('./adminSubmenus');
    return sub.abrirPlano(interaction);
  }

  if (id === 'pa_add_estoque') {
    if (!isLoja(interaction.member)) return interaction.reply({ content: '❌ Apenas cargo Loja.', ephemeral: true });
    const sub = require('./adminSubmenus');
    return sub.abrirEstoque(interaction);
  }

  if (id === 'pa_remover_plano') {
    if (!isLoja(interaction.member)) return interaction.reply({ content: '❌ Apenas cargo Loja.', ephemeral: true });
    const modal = new ModalBuilder().setCustomId('pam_remover_plano').setTitle('➖ Remover Plano');
    modal.addComponents(
      mRow(new TextInputBuilder().setCustomId('variante_id').setLabel('ID da Variante').setStyle(TextInputStyle.Short).setRequired(true)),
    );
    return interaction.showModal(modal);
  }

  if (id === 'pa_deletar_carrinho') {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Apenas admins.', ephemeral: true });
    const modal = new ModalBuilder().setCustomId('pam_deletar_carrinho').setTitle('🗑️ Deletar Carrinho');
    modal.addComponents(
      mRow(new TextInputBuilder().setCustomId('produto_id').setLabel('ID do Produto do Carrinho').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Primeiros 8 caracteres')),
    );
    return interaction.showModal(modal);
  }

  if (id === 'pa_listar_carrinhos') {
    await interaction.deferReply({ ephemeral: true });
    const paineis = db.prepare("SELECT p.*,pr.nome AS pnome FROM paineis_canal p JOIN produtos pr ON p.produto_id=pr.id WHERE p.ativo=1 ORDER BY p.criado_em DESC").all();
    if (!paineis.length) return interaction.editReply({ content: '📋 Nenhum carrinho criado ainda.' });
    const embed = new EmbedBuilder().setColor(config.colors.loja).setTitle('🛒 Carrinhos Ativos').setTimestamp();
    for (const p of paineis) {
      const vars = db.prepare('SELECT * FROM variantes_produto WHERE produto_id=? AND ativo=1 ORDER BY ordem').all(p.produto_id);
      const linhas = vars.map(v => {
        const dig = db.prepare('SELECT COUNT(*) as c FROM estoque_variante WHERE variante_id=? AND usado=0').get(v.id);
        const est = dig.c > 0 ? `${dig.c} un.` : (v.estoque === -1 ? '∞' : `${v.estoque}`);
        return `• **${v.nome}** — R$ ${Number(v.preco).toFixed(2)} (${est}) \`${v.id.slice(0,8)}\``;
      }).join('\n') || '_Sem planos_';
      embed.addFields({ name: `📦 ${p.pnome} → <#${p.canal_id}>`, value: `Produto ID: \`${p.produto_id.slice(0,8)}\`\n${linhas}`, inline: false });
    }
    return interaction.editReply({ embeds: [embed] });
  }

  // ─── PRODUTOS ──────────────────────────────────────────────────────────────

  if (id === 'pa_add_produto') {
    if (!isLoja(interaction.member)) return interaction.reply({ content: '❌ Apenas cargo Loja.', ephemeral: true });
    const modal = new ModalBuilder().setCustomId('pam_add_produto').setTitle('📦 Criar Produto');
    modal.addComponents(
      mRow(new TextInputBuilder().setCustomId('nome').setLabel('Nome do produto').setStyle(TextInputStyle.Short).setRequired(true)),
      mRow(new TextInputBuilder().setCustomId('preco').setLabel('Preço (R$) — 0 para free').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('29.90')),
      mRow(new TextInputBuilder().setCustomId('descricao').setLabel('Descrição (opcional)').setStyle(TextInputStyle.Paragraph).setRequired(false)),
      mRow(new TextInputBuilder().setCustomId('categoria').setLabel('Categoria (opcional)').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('Ex: Streaming, Games')),
      mRow(new TextInputBuilder().setCustomId('imagem').setLabel('URL da imagem (opcional)').setStyle(TextInputStyle.Short).setRequired(false)),
    );
    return interaction.showModal(modal);
  }

  if (id === 'pa_listar_produtos') {
    await interaction.deferReply({ ephemeral: true });
    const lista = db.prepare('SELECT * FROM produtos ORDER BY ativo DESC, vendas DESC LIMIT 20').all();
    if (!lista.length) return interaction.editReply({ content: '📦 Nenhum produto.' });
    const embed = new EmbedBuilder().setColor(config.colors.primary).setTitle('📦 Produtos').setTimestamp();
    for (const p of lista) {
      const digEst = db.prepare('SELECT COUNT(*) as c FROM estoque_digital WHERE produto_id=? AND usado=0').get(p.id);
      const varEst = db.prepare("SELECT COUNT(*) as c FROM estoque_variante ev JOIN variantes_produto vp ON ev.variante_id=vp.id WHERE vp.produto_id=? AND ev.usado=0").get(p.id);
      const total  = digEst.c + varEst.c;
      embed.addFields({
        name:  `${p.ativo ? '✅' : '❌'} ${p.nome}`,
        value: `R$ ${(p.preco_promo||p.preco).toFixed(2)} • Est: ${total > 0 ? total : p.estoque === -1 ? '∞' : p.estoque} • ${p.vendas} vendas\n\`${p.id.slice(0,8)}\``,
        inline: true,
      });
    }
    return interaction.editReply({ embeds: [embed] });
  }

  if (id === 'pa_criar_cupom') {
    if (!isLoja(interaction.member)) return interaction.reply({ content: '❌ Apenas cargo Loja.', ephemeral: true });
    const sub = require('./adminSubmenus');
    return sub.abrirCupom(interaction);
  }

  if (id === 'pa_deletar_cupom') {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Apenas admins.', ephemeral: true });
    // Listar cupons ativos para escolher qual deletar
    const cupons = db.prepare('SELECT * FROM cupons WHERE ativo=1 ORDER BY criado_em DESC LIMIT 25').all();
    if (!cupons.length) return interaction.reply({ content: '🎟️ Nenhum cupom ativo para deletar.', ephemeral: true });

    const { StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
    const opcoes = cupons.map(c => {
      const val = c.tipo === 'percentual' ? `${c.valor}%` : `R$ ${Number(c.valor).toFixed(2)}`;
      const exp = c.validade ? new Date(c.validade*1000).toLocaleDateString('pt-BR') : '∞';
      return new StringSelectMenuOptionBuilder()
        .setValue(c.id)
        .setLabel(`🎟️ ${c.codigo} — ${val}`)
        .setDescription(`Validade: ${exp} • ID: ${c.id.slice(0,8)}`);
    });

    const selectRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('pa_select_deletar_cupom')
        .setPlaceholder('Selecione o cupom para deletar...')
        .addOptions(opcoes),
    );

    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(config.colors.error)
        .setTitle('🗑️ Deletar Cupom')
        .setDescription('> Selecione o cupom que deseja **desativar permanentemente**.')
        .setTimestamp()],
      components: [selectRow],
      ephemeral: true,
    });
  }

  if (id === 'pa_select_deletar_cupom') {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Apenas admins.', ephemeral: true });
    const cupomId = interaction.values[0];
    const cupom   = db.prepare('SELECT * FROM cupons WHERE id=?').get(cupomId);
    if (!cupom) return interaction.reply({ content: '❌ Cupom não encontrado.', ephemeral: true });

    // Desativar (soft delete)
    db.prepare('UPDATE cupons SET ativo=0 WHERE id=?').run(cupomId);

    const { log } = require('../utils/logger');
    await log('sistema', { executor: interaction.user.id, descricao: `🗑️ Cupom deletado: \`${cupom.codigo}\`` });

    return interaction.update({
      embeds: [new EmbedBuilder()
        .setColor(config.colors.success)
        .setTitle('✅ Cupom Deletado')
        .addFields(
          { name: '🎟️ Código', value: `\`${cupom.codigo}\``,                                       inline: true },
          { name: '💰 Valor',  value: cupom.tipo === 'percentual' ? `${cupom.valor}%` : `R$ ${Number(cupom.valor).toFixed(2)}`, inline: true },
        )
        .setDescription('> Cupom desativado com sucesso. Não poderá mais ser usado.')
        .setTimestamp()],
      components: [],
    });
  }

  if (id === 'pa_listar_cupons') {
    await interaction.deferReply({ ephemeral: true });
    const cupons = db.prepare('SELECT * FROM cupons WHERE ativo=1 ORDER BY criado_em DESC LIMIT 15').all();
    if (!cupons.length) return interaction.editReply({ content: '🎟️ Nenhum cupom ativo.' });
    const embed = new EmbedBuilder().setColor(config.colors.purple).setTitle('🎟️ Cupons Ativos').setTimestamp();
    for (const c of cupons) {
      const val   = c.tipo === 'percentual' ? `${c.valor}%` : `R$ ${Number(c.valor).toFixed(2)}`;
      const exp   = c.validade ? new Date(c.validade*1000).toLocaleDateString('pt-BR') : '∞';
      const lim   = c.usos_por_usuario ? `${c.usos_por_usuario}x/user` : '1x/user';
      let lojas   = 'Todas as lojas';
      if (c.lojas_validas) {
        try {
          const arr = JSON.parse(c.lojas_validas);
          lojas = `${arr.length} loja(s) específica(s)`;
        } catch {}
      }
      embed.addFields({ name: `🎟️ ${c.codigo}`, value: `**${val}** • ${lim} • Exp: ${exp}\n🏪 ${lojas}`, inline: false });
    }
    // Botões de publicar para cada cupom (até 5)
    const rowsPub = [];
    for (let i = 0; i < Math.min(cupons.length, 5); i++) {
      const c = cupons[i];
      rowsPub.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`pa_pub_cupom_${c.id}`).setLabel(`📢 Publicar: ${c.codigo}`).setStyle(ButtonStyle.Primary),
      ));
    }
    return interaction.editReply({ embeds: [embed], components: rowsPub });
  }

  if (id === 'pa_estoque_baixo') {
    await interaction.deferReply({ ephemeral: true });
    const produtos2 = db.prepare('SELECT p.*, (SELECT COUNT(*) FROM estoque_digital WHERE produto_id=p.id AND usado=0) as ed FROM produtos p WHERE p.ativo=1').all();
    const baixo = produtos2.filter(p => p.ed <= 3 && p.estoque !== -1);
    if (!baixo.length) return interaction.editReply({ content: '✅ Estoque OK.' });
    const embed = new EmbedBuilder().setColor(config.colors.warning).setTitle('📉 Estoque Baixo').setTimestamp();
    for (const p of baixo) embed.addFields({ name: `${p.ed === 0 ? '❌' : '⚠️'} ${p.nome}`, value: `${p.ed} un. • \`${p.id.slice(0,8)}\``, inline: true });
    return interaction.editReply({ embeds: [embed] });
  }

  if (id === 'pa_top_produtos') {
    await interaction.deferReply({ ephemeral: true });
    const top = db.prepare('SELECT * FROM produtos ORDER BY vendas DESC LIMIT 10').all();
    const embed = new EmbedBuilder().setColor(config.colors.gold).setTitle('🏆 Top Produtos').setTimestamp();
    top.forEach((p, i) => embed.addFields({ name: `${i+1}. ${p.nome}`, value: `🛒 ${p.vendas} vendas`, inline: true }));
    return interaction.editReply({ embeds: [embed] });
  }

  // ─── GESTÃO ────────────────────────────────────────────────────────────────

  if (id === 'pa_reembolsos') {
    await interaction.deferReply({ ephemeral: true });
    const { listarPendentes } = require('./reembolsos');
    const pend = listarPendentes();
    if (!pend.length) return interaction.editReply({ content: '✅ Nenhum reembolso pendente.' });
    const embed = new EmbedBuilder().setColor(config.colors.warning).setTitle('↩️ Reembolsos Pendentes').setTimestamp();
    for (const r of pend) embed.addFields({ name: `↩️ R$ ${Number(r.valor).toFixed(2)}`, value: `<@${r.usuario_id}> • \`${r.id.slice(0,8)}\`\n${r.motivo}`, inline: false });
    const rows2 = pend.slice(0,3).map(r => new ActionRowBuilder().addComponents(
      btn(`pa_apr_reimb_${r.id}`, `✅ Aprovar ${r.id.slice(0,6)}`, ButtonStyle.Success),
      btn(`pa_rej_reimb_${r.id}`, `❌ Rejeitar`, ButtonStyle.Danger),
    ));
    return interaction.editReply({ embeds: [embed], components: rows2 });
  }

  if (id.startsWith('pa_apr_reimb_')) {
    const { aprovarReembolso } = require('./reembolsos');
    return aprovarReembolso(interaction, id.replace('pa_apr_reimb_',''));
  }
  if (id.startsWith('pa_rej_reimb_')) {
    const modal = new ModalBuilder().setCustomId(`modal_rej_reimb_${id.replace('pa_rej_reimb_','')}`).setTitle('❌ Rejeitar Reembolso');
    modal.addComponents(mRow(new TextInputBuilder().setCustomId('motivo').setLabel('Motivo').setStyle(TextInputStyle.Paragraph).setRequired(true)));
    return interaction.showModal(modal);
  }

  if (id === 'pa_tickets') {
    await interaction.deferReply({ ephemeral: true });
    const ticks = db.prepare("SELECT * FROM tickets WHERE status='aberto' ORDER BY criado_em ASC LIMIT 10").all();
    if (!ticks.length) return interaction.editReply({ content: '✅ Nenhum ticket aberto.' });
    const embed = new EmbedBuilder().setColor(config.colors.primary).setTitle('🎫 Tickets Abertos').setTimestamp();
    const tipoEmoji = { compra:'🛒', suporte:'🆘', reembolso:'↩️', entrega:'📦', afiliado:'🤝', reclamacao:'⚠️', saque:'💸' };
    for (const t of ticks) {
      const aberto = t.criado_em ? `<t:${t.criado_em}:R>` : '—';
      embed.addFields({
        name:  `${tipoEmoji[t.tipo]||'🎫'} ${t.tipo.toUpperCase()} — \`${t.id.slice(0,8)}\``,
        value: `<@${t.usuario_id}> • <#${t.canal_id}>${t.atendente ? ` • ✋ <@${t.atendente}>` : ' • *sem atendente*'}\nAberto: ${aberto}`,
        inline: false,
      });
    }
    // Botão fechar individual para cada ticket (até 5)
    const rowsTickets = [];
    for (let i = 0; i < Math.min(ticks.length, 5); i++) {
      const t = ticks[i];
      rowsTickets.push(new ActionRowBuilder().addComponents(
        btn(`pa_fechar_ticket_${t.id}`, `🔒 Fechar: ${t.tipo} — ${t.id.slice(0,6)}`, ButtonStyle.Danger),
      ));
    }
    return interaction.editReply({ embeds: [embed], components: rowsTickets });
  }

  if (id.startsWith('pa_fechar_ticket_')) {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Apenas admins.', ephemeral: true });
    await interaction.deferReply({ ephemeral: true });
    const ticketId = id.replace('pa_fechar_ticket_', '');
    const { Tickets } = require('../database/database');
    const ticket = Tickets.get(ticketId) || db.prepare('SELECT * FROM tickets WHERE id=?').get(ticketId);
    if (!ticket) return interaction.editReply({ content: '❌ Ticket não encontrado.' });
    db.prepare("UPDATE tickets SET status='fechado', motivo='Fechado pelo admin via painel', fechado_por=?, fechado_em=strftime('%s','now') WHERE id=?")
      .run(interaction.user.id, ticketId);
    try {
      const canal = interaction.guild.channels.cache.get(ticket.canal_id);
      if (canal) await canal.delete().catch(() => {});
    } catch {}
    _statsCache = null;
    return interaction.editReply({ content: `✅ Ticket \`${ticketId.slice(0,8)}\` fechado e canal deletado.` });
  }

  if (id === 'pa_pendentes') {
    await interaction.deferReply({ ephemeral: true });
    const pedidos = db.prepare("SELECT p.*,pr.nome as pnome FROM pedidos p JOIN produtos pr ON p.produto_id=pr.id WHERE p.status='pendente' ORDER BY p.criado_em DESC LIMIT 10").all();
    if (!pedidos.length) return interaction.editReply({ content: '✅ Nenhum pedido pendente.' });
    const embed = new EmbedBuilder().setColor(config.colors.warning).setTitle('⏳ Pedidos Pendentes').setTimestamp();
    for (const p of pedidos) {
      const expira = p.criado_em + 2100;
      embed.addFields({ name: `⏳ ${p.pnome}`, value: `<@${p.usuario_id}> • R$ ${Number(p.valor_total).toFixed(2)} • Expira <t:${expira}:R>`, inline: false });
    }
    return interaction.editReply({ embeds: [embed] });
  }

  // ── Fechar todos os tickets ───────────────────────────────────────────────
  if (id === 'pa_fechar_todos_tickets') {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Apenas admins.', ephemeral: true });
    await interaction.deferReply({ ephemeral: true });

    const ticketsAbertos = db.prepare("SELECT * FROM tickets WHERE status='aberto'").all();
    if (!ticketsAbertos.length) return interaction.editReply({ content: '✅ Nenhum ticket aberto.' });

    // Fechar no banco
    db.prepare("UPDATE tickets SET status='fechado', motivo='Fechado em massa pelo admin', fechado_em=strftime('%s','now') WHERE status='aberto'").run();

    // Deletar canais do Discord
    let deletados = 0;
    for (const t of ticketsAbertos) {
      try {
        const canal = interaction.guild.channels.cache.get(t.canal_id);
        if (canal) { await canal.delete().catch(() => {}); deletados++; }
      } catch {}
      await new Promise(r => setTimeout(r, 300));
    }

    await atualizarPainelAdmin(interaction.guild);
    return interaction.editReply({ content: `✅ **${ticketsAbertos.length}** ticket(s) fechado(s) no banco.\n🗑️ **${deletados}** canal(is) deletado(s).` });
  }

  // ── Cancelar todos os pedidos pendentes ───────────────────────────────────
  if (id === 'pa_cancelar_pendentes') {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Apenas admins.', ephemeral: true });
    await interaction.deferReply({ ephemeral: true });

    const pendentes = db.prepare("SELECT COUNT(*) as c FROM pedidos WHERE status='pendente'").get();
    if (!pendentes.c) return interaction.editReply({ content: '✅ Nenhum pedido pendente.' });

    db.prepare("UPDATE pedidos SET status='cancelado', motivo_cancel='Cancelado em massa pelo admin', cancelado_em=strftime('%s','now') WHERE status='pendente'").run();

    await atualizarPainelAdmin(interaction.guild);
    return interaction.editReply({ content: `✅ **${pendentes.c}** pedido(s) pendente(s) cancelado(s).` });
  }

  // ── Remover coins de um usuário ───────────────────────────────────────────
  if (id === 'pa_remover_coins') {
    if (!isOwner(interaction.member)) return interaction.reply({ content: '❌ Apenas o Owner.', ephemeral: true });
    const modal = new ModalBuilder().setCustomId('pam_remover_coins').setTitle('🪙 Remover Coins de Usuário');
    modal.addComponents(
      mRow(new TextInputBuilder().setCustomId('discord_id').setLabel('Discord ID do usuário').setStyle(TextInputStyle.Short).setRequired(true)),
      mRow(new TextInputBuilder().setCustomId('quantidade').setLabel('Quantidade de coins a remover').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: 500')),
      mRow(new TextInputBuilder().setCustomId('motivo').setLabel('Motivo (opcional)').setStyle(TextInputStyle.Short).setRequired(false)),
    );
    return interaction.showModal(modal);
  }

  // ─── CAIXA MISTERIOSA ─────────────────────────────────────────────────────

  if (id === 'pa_caixa_criar') {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Apenas admins.', ephemeral: true });
    const cx = require('./caixaSubmenu');
    return cx.abrirCriar(interaction);
  }

  if (id === 'pa_caixa_editar') {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Apenas admins.', ephemeral: true });
    const cx = require('./caixaSubmenu');
    return cx.selecionarCaixaListar(interaction); // reusa o select, depois redireciona para editar
  }

  if (id === 'pa_caixa_listar') {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Apenas admins.', ephemeral: true });
    const cx = require('./caixaSubmenu');
    return cx.selecionarCaixaListar(interaction);
  }

  if (id === 'pa_caixa_add_item') {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Apenas admins.', ephemeral: true });
    const cx = require('./caixaSubmenu');
    return cx.abrirItem(interaction);
  }

  // Alias antigo
  if (id === 'pa_caixa_config') {
    return handlePainelAdmin({ ...interaction, customId: 'pa_caixa_criar' }, client);
  }

  if (id === 'pa_caixa_deletar') {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Apenas admins.', ephemeral: true });
    const modal = new ModalBuilder().setCustomId('pam_caixa_deletar').setTitle('🗑️ Deletar Caixa');
    modal.addComponents(
      mRow(new TextInputBuilder().setCustomId('caixa_id').setLabel('ID ou nome da caixa (primeiros 8 chars)').setStyle(TextInputStyle.Short).setRequired(true)),
    );
    return interaction.showModal(modal);
  }

  // Legado — rem_item e toggle agora são feitos pelo submenu de listar
  if (id === 'pa_caixa_rem_item' || id === 'pa_caixa_toggle') {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Apenas admins.', ephemeral: true });
    const cx = require('./caixaSubmenu');
    return cx.selecionarCaixaListar(interaction);
  }

  if (id === 'pa_caixa_publicar') {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Apenas admins.', ephemeral: true });
    const modal = new ModalBuilder().setCustomId('pam_caixa_publicar').setTitle('📢 Publicar Caixas no Canal');
    modal.addComponents(
      mRow(new TextInputBuilder().setCustomId('canal_id').setLabel('ID do Canal onde publicar').setStyle(TextInputStyle.Short).setRequired(true)),
    );
    return interaction.showModal(modal);
  }

  if (id === 'pa_caixa_historico') {
    await interaction.deferReply({ ephemeral: true });
    const hist = db.prepare(`
      SELECT ch.*, vp.nome as item_nome, u.nome as usuario_nome
      FROM caixa_historico ch
      JOIN variantes_produto vp ON ch.variante_id=vp.id
      LEFT JOIN usuarios u ON ch.usuario_id=u.discord_id
      ORDER BY ch.aberta_em DESC LIMIT 15
    `).all();
    if (!hist.length) return interaction.editReply({ content: '📊 Nenhuma caixa aberta ainda.' });
    const { RARIDADES } = require('./caixaMisteriosa');
    const embed = new EmbedBuilder().setColor(0xFFD700).setTitle('📊 Histórico da Caixa Misteriosa').setTimestamp();
    for (const h of hist) {
      const rar  = RARIDADES[h.raridade] || RARIDADES.comum;
      const data = new Date(h.aberta_em * 1000).toLocaleDateString('pt-BR');
      embed.addFields({ name: `${rar.emoji} ${h.item_nome}`, value: `${h.usuario_nome || h.usuario_id} • ${rar.label} • ${data}`, inline: false });
    }
    return interaction.editReply({ embeds: [embed] });
  }

  if (id === 'pa_flashsale') {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Apenas admins.', ephemeral: true });
    const modal = new ModalBuilder().setCustomId('modal_flashsale').setTitle('⚡ Flash Sale');
    modal.addComponents(
      mRow(new TextInputBuilder().setCustomId('produto_id').setLabel('ID do Produto').setStyle(TextInputStyle.Short).setRequired(true)),
      mRow(new TextInputBuilder().setCustomId('desconto').setLabel('Desconto (%)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('30')),
      mRow(new TextInputBuilder().setCustomId('duracao').setLabel('Duração (minutos)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('60')),
    );
    return interaction.showModal(modal);
  }

  // ─── Botões inline do gerenciador de caixas ──────────────────────────────
  if (id.startsWith('cxi_add_item_')) {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Apenas admins.', ephemeral: true });
    const caixaId  = id.replace('cxi_add_item_', '');
    const caixaNome = db.prepare('SELECT nome FROM caixa_config WHERE id=?').get(caixaId)?.nome;
    const cx = require('./caixaSubmenu');
    // Pré-preenche a caixa na sessão
    const { nova: novaSessao } = (() => {
      // Acessa a função nova interna via require e inicia sessão com caixaId
      const m = require('./caixaSubmenu');
      const s = { tipo: 'item', caixaId, caixaNome };
      // Reinicia item session com caixaId pré-definido
      return { nova: () => m };
    })();
    return cx.abrirItem(interaction);
  }

  if (id.startsWith('cxi_editar_caixa_')) {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Apenas admins.', ephemeral: true });
    const caixaId = id.replace('cxi_editar_caixa_', '');
    const cx = require('./caixaSubmenu');
    return cx.abrirEditar(interaction, caixaId);
  }

  if (id.startsWith('cxi_toggle_caixa_')) {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Apenas admins.', ephemeral: true });
    const caixaId = id.replace('cxi_toggle_caixa_', '');
    const cx = require('./caixaSubmenu');
    return cx.toggleCaixa(interaction, caixaId);
  }

  if (id.startsWith('cxi_edit_item_')) {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Apenas admins.', ephemeral: true });
    const itemId = id.replace('cxi_edit_item_', '');
    const cx = require('./caixaSubmenu');
    return cx.abrirEditarItem(interaction, itemId);
  }

  if (id.startsWith('cxi_toggle_item_')) {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Apenas admins.', ephemeral: true });
    const [itemId, caixaId] = id.replace('cxi_toggle_item_', '').split('_');
    const cx = require('./caixaSubmenu');
    return cx.toggleItem(interaction, itemId, caixaId);
  }

  if (id.startsWith('cxi_del_item_')) {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Apenas admins.', ephemeral: true });
    const partes   = id.replace('cxi_del_item_', '').split('_');
    const itemId   = partes[0];
    const caixaId  = partes.slice(1).join('_');
    const cx = require('./caixaSubmenu');
    return cx.removerItem(interaction, itemId, caixaId);
  }

  if (id.startsWith('cxi_listar_')) {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Apenas admins.', ephemeral: true });
    const caixaId = id.replace('cxi_listar_', '');
    const cx = require('./caixaSubmenu');
    return cx.listarItens(interaction, caixaId);
  }

  // ─── USUÁRIOS ──────────────────────────────────────────────────────────────

  if (id === 'pa_buscar_usuario') {
    const modal = new ModalBuilder().setCustomId('pam_buscar_usuario').setTitle('🔍 Buscar Usuário');
    modal.addComponents(mRow(new TextInputBuilder().setCustomId('discord_id').setLabel('Discord ID').setStyle(TextInputStyle.Short).setRequired(true)));
    return interaction.showModal(modal);
  }

  if (id === 'pa_add_coins') {
    if (!isOwner(interaction.member)) return interaction.reply({ content: '❌ Apenas o Owner.', ephemeral: true });
    const modal = new ModalBuilder().setCustomId('pam_add_coins').setTitle('🪙 Adicionar Coins');
    modal.addComponents(
      mRow(new TextInputBuilder().setCustomId('discord_id').setLabel('Discord ID do usuário').setStyle(TextInputStyle.Short).setRequired(true)),
      mRow(new TextInputBuilder().setCustomId('quantidade').setLabel('Quantidade de coins').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('1000')),
      mRow(new TextInputBuilder().setCustomId('motivo').setLabel('Motivo (opcional)').setStyle(TextInputStyle.Short).setRequired(false)),
    );
    return interaction.showModal(modal);
  }

  if (id === 'pa_gerar_codigos') {
    if (!isOwner(interaction.member)) return interaction.reply({ content: '❌ Apenas o Owner pode gerar códigos.', ephemeral: true });
    const modal = new ModalBuilder().setCustomId('pam_gerar_codigos').setTitle('🎫 Gerar Código de Coins');
    modal.addComponents(
      mRow(new TextInputBuilder().setCustomId('coins').setLabel('Coins por código').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: 500 (= R$5,00)')),
      mRow(new TextInputBuilder().setCustomId('quantidade').setLabel('Quantidade de códigos (máx: 50)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: 10')),
      mRow(new TextInputBuilder().setCustomId('discord_id').setLabel('ID do usuário (vazio = envia só pra você)').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('Ex: 123456789012345678')),
    );
    return interaction.showModal(modal);
  }

  if (id === 'pa_anuncio') {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Apenas admins.', ephemeral: true });
    const modal = new ModalBuilder().setCustomId('pam_anuncio').setTitle('📣 Anúncio DM');
    modal.addComponents(
      mRow(new TextInputBuilder().setCustomId('titulo').setLabel('Título').setStyle(TextInputStyle.Short).setRequired(true)),
      mRow(new TextInputBuilder().setCustomId('mensagem').setLabel('Mensagem').setStyle(TextInputStyle.Paragraph).setRequired(true)),
      mRow(new TextInputBuilder().setCustomId('imagem').setLabel('Imagem URL (opcional)').setStyle(TextInputStyle.Short).setRequired(false)),
    );
    return interaction.showModal(modal);
  }

  if (id === 'pa_ranking') {
    await interaction.deferReply({ ephemeral: true });
    const ownerIds = [];
    if (process.env.OWNER_DISCORD_ID) ownerIds.push(process.env.OWNER_DISCORD_ID);
    try {
      const cargoOwner = interaction.guild?.roles.cache.get(config.roles?.owner);
      if (cargoOwner) cargoOwner.members.forEach(m => ownerIds.push(m.id));
    } catch {}
    const excluir = ownerIds.length ? `WHERE discord_id NOT IN (${ownerIds.map(() => '?').join(',')})` : '';
    const top = db.prepare(`SELECT * FROM usuarios ${excluir} ORDER BY total_gasto DESC LIMIT 10`).all(...ownerIds);
    const embed = new EmbedBuilder().setColor(config.colors.gold).setTitle('🏆 Ranking — Maiores Compradores').setTimestamp();
    const medals = ['🥇','🥈','🥉','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];
    top.forEach((u,i) => embed.addFields({ name: `${medals[i]} ${u.nome||'?'}`, value: `R$ ${(u.total_gasto||0).toFixed(2)} • ${u.total_compras||0} compras`, inline: true }));
    return interaction.editReply({ embeds: [embed] });
  }

  // ─── Buscar pedido por ID ─────────────────────────────────────────────────
  if (id === 'pa_buscar_pedido') {
    if (!isStaff(interaction.member)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
    const modal = new ModalBuilder().setCustomId('pam_buscar_pedido').setTitle('🔍 Buscar Pedido');
    modal.addComponents(
      mRow(new TextInputBuilder().setCustomId('pedido_id').setLabel('ID do Pedido (primeiros 8 chars)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: A1B2C3D4')),
    );
    return interaction.showModal(modal);
  }

  // ─── Editar preço de plano ────────────────────────────────────────────────
  if (id === 'pa_editar_plano') {
    if (!isLoja(interaction.member)) return interaction.reply({ content: '❌ Apenas cargo Loja.', ephemeral: true });
    const modal = new ModalBuilder().setCustomId('pam_editar_plano').setTitle('✏️ Editar Plano');
    modal.addComponents(
      mRow(new TextInputBuilder().setCustomId('variante_id').setLabel('ID da Variante (primeiros 8 chars)').setStyle(TextInputStyle.Short).setRequired(true)),
      mRow(new TextInputBuilder().setCustomId('nome').setLabel('Novo nome (vazio = manter)').setStyle(TextInputStyle.Short).setRequired(false)),
      mRow(new TextInputBuilder().setCustomId('preco').setLabel('Novo preço R$ (vazio = manter)').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('Ex: 29.90')),
    );
    return interaction.showModal(modal);
  }

  // ─── Blacklist por CPF ───────────────────────────────────────────────────
  if (id === 'pa_blacklist_cpf') {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Apenas admins.', ephemeral: true });
    const modal = new ModalBuilder().setCustomId('pam_blacklist_cpf').setTitle('🚫 Blacklist de CPF');
    modal.addComponents(
      mRow(new TextInputBuilder().setCustomId('acao').setLabel('Ação: bloquear ou desbloquear').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('bloquear').setValue('bloquear')),
      mRow(new TextInputBuilder().setCustomId('cpf').setLabel('CPF (só números)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('12345678901').setMaxLength(14)),
      mRow(new TextInputBuilder().setCustomId('motivo').setLabel('Motivo (só para bloquear)').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('Chargeback, fraude...')),
    );
    return interaction.showModal(modal);
  }

  // ─── Publicar cupom no canal ─────────────────────────────────────────────
  if (id.startsWith('pa_pub_cupom_')) {
    if (!isLoja(interaction.member)) return interaction.reply({ content: '❌ Apenas cargo Loja.', ephemeral: true });
    await interaction.deferReply({ ephemeral: true });
    const cupomId = id.replace('pa_pub_cupom_', '');
    const c = db.prepare('SELECT * FROM cupons WHERE id=?').get(cupomId);
    if (!c) return interaction.editReply({ content: '❌ Cupom não encontrado.' });

    const CANAL_CUPONS = Config.get('canal_cupons_id') || '1530039474082283610';
    const canal = interaction.guild.channels.cache.get(CANAL_CUPONS);
    if (!canal) return interaction.editReply({ content: '❌ Canal de cupons não encontrado. Configure em **🔧 Config → 🎟️ Canal Cupons**.' });

    const dataValidade = c.validade ? new Date(c.validade * 1000).toLocaleDateString('pt-BR') : '∞';
    const lojasLabel   = (() => {
      if (!c.lojas_validas) return 'Todas as lojas';
      try { const a = JSON.parse(c.lojas_validas); return `${a.length} loja(s) específica(s)`; } catch { return 'Todas as lojas'; }
    })();

    const embedPub = {
      color: 0xFFD700,
      title: '🎟️ Cupom de Desconto Disponível!',
      description: [
        '> Use o código abaixo para obter desconto na loja.',
        '> Cole no campo de cupom durante a compra.',
      ].join('\n'),
      fields: [
        { name: '🔑 Código',        value: `\`\`\`${c.codigo}\`\`\``,          inline: false },
        { name: '💰 Desconto',      value: `**${c.valor}%** off`,               inline: true },
        { name: '📅 Válido até',    value: `**${dataValidade}**`,                inline: true },
        { name: '👤 Usos/pessoa',   value: `**${c.usos_por_usuario || 1}x**`,   inline: true },
        { name: '🏪 Lojas válidas', value: lojasLabel,                          inline: false },
      ],
      timestamp: new Date().toISOString(),
      footer: { text: 'Máximo Store • Use o código acima para garantir seu desconto!' },
    };

    await canal.send({ embeds: [embedPub] });
    return interaction.editReply({ content: `✅ Cupom **\`${c.codigo}\`** publicado em <#${CANAL_CUPONS}>!` });
  }

  // ─── Dar coins para todos os usuários do servidor ───────────────────────
  if (id === 'pa_coins_todos') {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Apenas admins.', ephemeral: true });
    const modal = new ModalBuilder().setCustomId('pam_coins_todos').setTitle('🎁 Coins para Todos');
    modal.addComponents(
      mRow(new TextInputBuilder().setCustomId('quantidade').setLabel('Quantidade de coins para cada usuário').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: 5')),
      mRow(new TextInputBuilder().setCustomId('motivo').setLabel('Motivo (aparece na transação)').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('Ex: Bônus de boas-vindas')),
    );
    return interaction.showModal(modal);
  }

  // ─── Bloquear/desbloquear usuário ────────────────────────────────────────
  if (id.startsWith('pa_bloquear_')) {
    if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Apenas admins.', ephemeral: true });
    const discordId = id.replace('pa_bloquear_', '');
    const u = db.prepare('SELECT * FROM usuarios WHERE discord_id=?').get(discordId);
    if (!u) return interaction.reply({ content: '❌ Usuário não encontrado.', ephemeral: true });
    if (u.bloqueado) {
      Usuarios.desbloquear(discordId);
      return interaction.reply({ content: `✅ <@${discordId}> desbloqueado com sucesso.`, ephemeral: true });
    } else {
      const modal = new ModalBuilder().setCustomId(`pam_bloquear_${discordId}`).setTitle('🚫 Bloquear Usuário');
      modal.addComponents(
        mRow(new TextInputBuilder().setCustomId('motivo').setLabel('Motivo do bloqueio').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: Chargeback, fraude...')),
      );
      return interaction.showModal(modal);
    }
  }
}

// ─── Handler de modais pam_* ──────────────────────────────────────────────────
async function handlePainelAdminModals(interaction, client) {
  const id = interaction.customId;
  try {

  // ─── Modais de configuração ───────────────────────────────────────────────
  if (id === 'pam_cfg_nome') {
    await interaction.deferReply({ ephemeral: true });
    const nome = interaction.fields.getTextInputValue('nome').trim();
    if (!nome) return interaction.editReply({ content: '❌ Nome inválido.' });
    db.prepare("INSERT OR REPLACE INTO configuracoes (chave,valor,tipo) VALUES ('nome_loja',?,'string')").run(nome);
    _statsCache = null;
    await atualizarPainelAdmin(interaction.guild);
    return interaction.editReply({ content: `✅ Nome da loja alterado para **${nome}**.` });
  }

  if (id === 'pam_cfg_meta') {
    await interaction.deferReply({ ephemeral: true });
    const meta = parseFloat(interaction.fields.getTextInputValue('meta').trim().replace(',','.'));
    if (isNaN(meta) || meta < 0) return interaction.editReply({ content: '❌ Valor inválido.' });
    db.prepare("INSERT OR REPLACE INTO configuracoes (chave,valor,tipo) VALUES ('meta_dia',?,'string')").run(String(meta));
    return interaction.editReply({ content: `✅ Meta diária definida para **R$ ${meta.toFixed(2)}**.` });
  }

  if (id === 'pam_cfg_cashback') {
    await interaction.deferReply({ ephemeral: true });
    const pct = parseInt(interaction.fields.getTextInputValue('pct').trim());
    if (isNaN(pct) || pct < 0 || pct > 100) return interaction.editReply({ content: '❌ Valor entre 0 e 100.' });
    db.prepare("INSERT OR REPLACE INTO configuracoes (chave,valor,tipo) VALUES ('cashback_pct',?,'string')").run(String(pct));
    return interaction.editReply({ content: `✅ Cashback definido em **${pct}%** por compra.` });
  }

  if (id === 'pam_cfg_boas_vindas') {
    await interaction.deferReply({ ephemeral: true });
    const msg = interaction.fields.getTextInputValue('msg').trim();
    db.prepare("INSERT OR REPLACE INTO configuracoes (chave,valor,tipo) VALUES ('msg_boas_vindas',?,'string')").run(msg);
    return interaction.editReply({ content: `✅ Mensagem de boas-vindas atualizada.\n> ${msg.slice(0,100)}` });
  }

  if (id === 'pam_criar_carrinho') {
    await interaction.deferReply({ ephemeral: true });
    const canalId   = interaction.fields.getTextInputValue('canal_id').trim();
    const titulo    = interaction.fields.getTextInputValue('titulo').trim();
    const descricao = interaction.fields.getTextInputValue('descricao').trim();
    const imagemUrl = interaction.fields.getTextInputValue('imagem').trim();
    const corHex    = interaction.fields.getTextInputValue('cor').trim() || 'FF6B6B';

    const canal = interaction.guild.channels.cache.get(canalId);
    if (!canal) return interaction.editReply({ content: `❌ Canal \`${canalId}\` não encontrado.` });

    const { v4: uuidv4 } = require('uuid');
    const produtoId = uuidv4();
    // Produto sem estoque manual (estoque adicionado depois)
    db.prepare('INSERT INTO produtos (id,nome,descricao,preco,imagem_url,tipo,ativo,estoque,criado_por) VALUES (?,?,?,0,?,?,1,-1,?)')
      .run(produtoId, titulo, descricao, imagemUrl||null, 'digital', interaction.user.id);

    const painelId = uuidv4();
    db.prepare('INSERT INTO paineis_canal (id,canal_id,produto_id,titulo,descricao,cor,imagem_url,criado_por) VALUES (?,?,?,?,?,?,?,?)')
      .run(painelId, canal.id, produtoId, titulo, descricao, corHex, imagemUrl||null, interaction.user.id);

    const cor   = parseInt(corHex, 16) || config.colors.loja;
    const embed = new EmbedBuilder()
      .setColor(cor)
      .setTitle(`🛍️ ${titulo}`)
      .setTimestamp()
      .setFooter({ text: 'Máximo Store' });

    // Só mostra descrição se houver — sem campos de estoque/planos
    if (descricao) embed.setDescription(descricao);

    const payload = { embeds: [embed], components: [] };
    if (imagemUrl) embed.setImage(imagemUrl);

    const msg = await canal.send(payload);
    db.prepare('UPDATE paineis_canal SET mensagem_id=? WHERE id=?').run(msg.id, painelId);

    return interaction.editReply({
      content: [
        `✅ Carrinho criado em <#${canal.id}>!`,
        `🆔 Produto ID: \`${produtoId.slice(0,8)}\``,
        '',
        `➡️ Próximo passo: clique em **+ Adicionar Plano** e use o ID \`${produtoId.slice(0,8)}\``,
      ].join('\n'),
    });
  }

  if (id === 'pam_add_plano') {
    await interaction.deferReply({ ephemeral: true });
    const busca  = interaction.fields.getTextInputValue('produto_id').trim();
    const nome   = interaction.fields.getTextInputValue('nome').trim();
    const preco  = parseFloat(interaction.fields.getTextInputValue('preco').trim().replace(',','.'));
    const desc   = interaction.fields.getTextInputValue('descricao').trim();
    if (isNaN(preco)||preco<0) return interaction.editReply({ content: '❌ Preço inválido.' });

    const produto = db.prepare("SELECT * FROM produtos WHERE UPPER(SUBSTR(id,1,8))=UPPER(?) OR id LIKE ?").get(busca, `${busca}%`);
    if (!produto) return interaction.editReply({ content: `❌ Produto \`${busca}\` não encontrado. Use o ID correto de 8 caracteres.` });

    const { v4: uuidv4 } = require('uuid');
    const ordem  = db.prepare('SELECT COUNT(*) as c FROM variantes_produto WHERE produto_id=?').get(produto.id).c + 1;
    const varId  = uuidv4();
    // Estoque começa como 0 — só terá itens quando o estoque digital for adicionado
    db.prepare('INSERT INTO variantes_produto (id,produto_id,nome,descricao,preco,estoque,ordem) VALUES (?,?,?,?,?,0,?)')
      .run(varId, produto.id, nome, desc, preco, ordem);

    const { atualizarPainelProduto } = require('./painelProduto');
    const paineis = db.prepare('SELECT * FROM paineis_canal WHERE produto_id=? AND ativo=1').all(produto.id);
    for (const p of paineis) await atualizarPainelProduto(interaction.guild, p.id).catch(()=>{});

    return interaction.editReply({
      content: [
        `✅ Plano **${nome}** adicionado a **${produto.nome}**!`,
        `💵 R$ ${preco.toFixed(2)} • Estoque: 0 (adicione com 📥 Add Estoque)`,
        `🆔 Variante ID: \`${varId.slice(0,8)}\``,
        '',
        `➡️ Para adicionar estoque: clique em **📥 Add Estoque** com o ID \`${varId.slice(0,8)}\``,
      ].join('\n'),
    });
  }

  if (id === 'pam_add_estoque') {
    await interaction.deferReply({ ephemeral: true });
    const busca    = interaction.fields.getTextInputValue('variante_id').trim();
    const conteudo = interaction.fields.getTextInputValue('conteudo').trim();

    const variante = db.prepare("SELECT * FROM variantes_produto WHERE UPPER(SUBSTR(id,1,8))=UPPER(?) OR id LIKE ?").get(busca, `${busca}%`);
    if (!variante) return interaction.editReply({ content: `❌ Variante \`${busca}\` não encontrada.` });

    const { v4: uuidv4 } = require('uuid');
    // 1 linha = 1 produto
    const itens = conteudo.split('\n').map(s => s.trim()).filter(Boolean);
    for (const item of itens) {
      db.prepare('INSERT INTO estoque_variante (id,variante_id,conteudo) VALUES (?,?,?)').run(uuidv4(), variante.id, item);
    }
    const total = db.prepare('SELECT COUNT(*) as c FROM estoque_variante WHERE variante_id=? AND usado=0').get(variante.id).c;
    db.prepare('UPDATE variantes_produto SET estoque=? WHERE id=?').run(total, variante.id);

    // Atualiza só estoque/componentes — imagem preservada
    const { atualizarPainelProduto } = require('./painelProduto');
    const paineis = db.prepare('SELECT * FROM paineis_canal WHERE produto_id=? AND ativo=1').all(variante.produto_id);
    for (const p of paineis) await atualizarPainelProduto(interaction.guild, p.id).catch(()=>{});

    return interaction.editReply({
      content: [
        `✅ **${itens.length}** item(ns) adicionado(s) à variante **${variante.nome}**!`,
        `📦 Total disponível: **${total}** unidade(s)`,
        paineis.length ? `🔄 ${paineis.length} painel(is) atualizado(s) _(imagem preservada)_` : '',
      ].filter(Boolean).join('\n'),
    });
  }

  if (id === 'pam_remover_plano') {
    await interaction.deferReply({ ephemeral: true });
    const busca = interaction.fields.getTextInputValue('variante_id').trim();
    const v = db.prepare("SELECT * FROM variantes_produto WHERE UPPER(SUBSTR(id,1,8))=UPPER(?) OR id LIKE ?").get(busca, `${busca}%`);
    if (!v) return interaction.editReply({ content: '❌ Variante não encontrada.' });
    db.prepare('UPDATE variantes_produto SET ativo=0 WHERE id=?').run(v.id);
    const { atualizarPainelProduto } = require('./painelProduto');
    const paineis = db.prepare('SELECT * FROM paineis_canal WHERE produto_id=? AND ativo=1').all(v.produto_id);
    for (const p of paineis) await atualizarPainelProduto(interaction.guild, p.id).catch(()=>{});
    return interaction.editReply({ content: `✅ Plano **${v.nome}** removido.` });
  }

  if (id === 'pam_deletar_carrinho') {
    await interaction.deferReply({ ephemeral: true });
    const busca   = interaction.fields.getTextInputValue('produto_id').trim();
    const produto = db.prepare("SELECT * FROM produtos WHERE UPPER(SUBSTR(id,1,8))=UPPER(?) OR id LIKE ?").get(busca, `${busca}%`);
    if (!produto) return interaction.editReply({ content: `❌ Produto \`${busca}\` não encontrado.` });

    const paineis = db.prepare('SELECT * FROM paineis_canal WHERE produto_id=? AND ativo=1').all(produto.id);

    // Deletar mensagem do Discord em cada canal
    for (const painel of paineis) {
      try {
        const canal = interaction.guild.channels.cache.get(painel.canal_id);
        if (canal && painel.mensagem_id) {
          const msg = await canal.messages.fetch(painel.mensagem_id).catch(() => null);
          if (msg) await msg.delete().catch(() => {});
        }
      } catch {}
      db.prepare('UPDATE paineis_canal SET ativo=0 WHERE id=?').run(painel.id);
    }

    // Desativar produto e variantes
    db.prepare('UPDATE produtos SET ativo=0 WHERE id=?').run(produto.id);
    db.prepare('UPDATE variantes_produto SET ativo=0 WHERE produto_id=?').run(produto.id);

    return interaction.editReply({
      content: [
        `✅ Carrinho **${produto.nome}** deletado!`,
        `🗑️ ${paineis.length} painel(is) removido(s) dos canais.`,
      ].join('\n'),
    });
  }

  if (id === 'pam_add_produto') {
    await interaction.deferReply({ ephemeral: true });
    const nome  = interaction.fields.getTextInputValue('nome').trim();
    const preco = parseFloat(interaction.fields.getTextInputValue('preco').trim().replace(',','.'));
    const desc  = interaction.fields.getTextInputValue('descricao').trim();
    const cat   = interaction.fields.getTextInputValue('categoria').trim() || 'Geral';
    const img   = interaction.fields.getTextInputValue('imagem').trim();
    if (isNaN(preco)||preco<0) return interaction.editReply({ content: '❌ Preço inválido.' });
    const { v4: uuidv4 } = require('uuid');
    const pid = uuidv4();
    db.prepare('INSERT INTO produtos (id,nome,descricao,preco,imagem_url,categoria,tipo,ativo,estoque,criado_por) VALUES (?,?,?,?,?,?,?,1,-1,?)')
      .run(pid, nome, desc, preco, img||null, cat, 'digital', interaction.user.id);
    return interaction.editReply({ content: `✅ Produto **${nome}** criado!\n🆔 ID: \`${pid.slice(0,8)}\`` });
  }

  if (id === 'pam_criar_cupom') {
    await interaction.deferReply({ ephemeral: true });
    const cod            = interaction.fields.getTextInputValue('codigo').trim();
    const valor          = parseFloat(interaction.fields.getTextInputValue('valor').trim().replace(',','.'));
    const usosPorUsuario = parseInt(interaction.fields.getTextInputValue('usos_por_usuario').trim()) || 1;
    const dias           = parseInt(interaction.fields.getTextInputValue('validade').trim()) || 30;
    const lojasRaw       = interaction.fields.getTextInputValue('lojas').trim();

    if (isNaN(valor) || valor <= 0 || valor > 100) return interaction.editReply({ content: '❌ Percentual inválido. Use um número entre 1 e 100.' });

    // Processar lojas: buscar painelId pelo produto_id parcial
    let lojasValidas = null;
    if (lojasRaw) {
      const ids = lojasRaw.split(/[,\n]+/).map(s => s.trim()).filter(Boolean);
      const painelIds = [];
      for (const id of ids) {
        const painel = db.prepare("SELECT id FROM paineis_canal WHERE produto_id LIKE ? AND ativo=1").get(`${id}%`);
        if (painel) painelIds.push(painel.id);
        else {
          // Tentar como painelId diretamente
          const p2 = db.prepare("SELECT id FROM paineis_canal WHERE id LIKE ? AND ativo=1").get(`${id}%`);
          if (p2) painelIds.push(p2.id);
        }
      }
      if (painelIds.length > 0) lojasValidas = JSON.stringify(painelIds);
    }

    const { gerarCodigoCupom } = require('./cupons');
    const codigo = cod || gerarCodigoCupom();

    // Salvar no DB — compatível com banco sem as colunas novas
    const { v4: uuidv4 } = require('uuid');
    const cupomId    = uuidv4();
    const validadeTs = Math.floor(Date.now() / 1000) + (dias * 86400);

    // Garantir colunas novas existem (migração segura)
    try { db.exec('ALTER TABLE cupons ADD COLUMN usos_por_usuario INTEGER DEFAULT 1'); } catch {}
    try { db.exec('ALTER TABLE cupons ADD COLUMN lojas_validas TEXT DEFAULT NULL'); } catch {}

    db.prepare(`
      INSERT INTO cupons (id, codigo, tipo, valor, usos_max, usos_por_usuario, validade, lojas_validas, criado_por)
      VALUES (?,?,?,?,?,?,?,?,?)
    `).run(cupomId, codigo.toUpperCase(), 'percentual', valor, 9999, usosPorUsuario, validadeTs, lojasValidas, interaction.user.id);

    const lojasMsg = lojasValidas
      ? `\n🏪 Válido em **${JSON.parse(lojasValidas).length}** loja(s) específica(s)`
      : '\n🏪 Válido em **todas as lojas**';

    return interaction.editReply({ content: [
      `✅ Cupom **\`${codigo.toUpperCase()}\`** criado!`,
      `💰 Desconto: **${valor}%**`,
      `👤 Limite por usuário: **${usosPorUsuario}x**`,
      `📅 Validade: **${dias} dias**`,
      lojasMsg,
    ].join('\n') });
  }

  if (id === 'pam_buscar_usuario') {
    await interaction.deferReply({ ephemeral: true });
    const busca = interaction.fields.getTextInputValue('discord_id').trim().replace(/[<@>]/g,'');
    const u = db.prepare('SELECT * FROM usuarios WHERE discord_id=?').get(busca);
    if (!u) return interaction.editReply({ content: `❌ ID \`${busca}\` não encontrado.` });
    const pedidos = db.prepare("SELECT COUNT(*) as c FROM pedidos WHERE usuario_id=? AND status IN ('pago','entregue')").get(u.discord_id);
    // Últimos 3 pedidos
    const ultimosPedidos = db.prepare("SELECT p.*, pr.nome AS pnome FROM pedidos p LEFT JOIN produtos pr ON p.produto_id=pr.id WHERE p.usuario_id=? ORDER BY p.criado_em DESC LIMIT 3").all(u.discord_id);
    const statusE = { pendente:'⏳', pago:'✅', entregue:'📦', cancelado:'❌' };
    const pedidosLabel = ultimosPedidos.length
      ? ultimosPedidos.map(p => `${statusE[p.status]||'?'} ${(p.pnome||'?').slice(0,20)} — R$ ${Number(p.valor_total).toFixed(2)} \`${p.id.slice(0,8)}\``).join('\n')
      : 'Nenhum pedido';

    const embed = new EmbedBuilder().setColor(config.colors.info).setTitle(`👤 ${u.nome||'?'}`).addFields(
      { name:'🆔 ID',         value: u.discord_id,                                inline: true },
      { name:'💵 Saldo',      value: `R$ ${(u.saldo||0).toFixed(2)}`,             inline: true },
      { name:'🪙 Coins',      value: String(u.coins||0),                          inline: true },
      { name:'⭐ Pontos',     value: String(u.pontos||0),                         inline: true },
      { name:'🛒 Compras',    value: String(pedidos.c),                           inline: true },
      { name:'💸 Gasto',      value: `R$ ${(u.total_gasto||0).toFixed(2)}`,      inline: true },
      { name:'🚫 Bloqueado',  value: u.bloqueado ? `Sim — ${u.motivo_bloquio}` : 'Não', inline: false },
      { name:'📋 Últimos Pedidos', value: pedidosLabel,                           inline: false },
    ).setTimestamp();

    const rowAcoes = new ActionRowBuilder().addComponents(
      btn(`pa_bloquear_${u.discord_id}`,   u.bloqueado ? '✅ Desbloquear' : '🚫 Bloquear', u.bloqueado ? ButtonStyle.Success : ButtonStyle.Danger),
    );
    return interaction.editReply({ embeds: [embed], components: [rowAcoes] });
  }

  if (id === 'pam_add_coins') {
    await interaction.deferReply({ ephemeral: true });
    const discordId = interaction.fields.getTextInputValue('discord_id').trim().replace(/[<@>]/g,'');
    const qtd       = parseInt(interaction.fields.getTextInputValue('quantidade').trim());
    const motivo    = interaction.fields.getTextInputValue('motivo').trim() || `Adicionado por ${interaction.user.tag}`;
    if (isNaN(qtd)||qtd<=0) return interaction.editReply({ content: '❌ Quantidade inválida.' });
    Usuarios.garantir(discordId, 'Usuário');
    const { addCoins, coinsParaReais, COIN_EMOJI } = require('./coins');
    const novo = addCoins(discordId, qtd, motivo, interaction.user.id);
    const member = await interaction.guild.members.fetch(discordId).catch(()=>null);
    if (member) member.send({ embeds: [new EmbedBuilder().setColor(config.colors.coins).setTitle(`${COIN_EMOJI} Coins Recebidos!`).setDescription(`O Owner adicionou **${qtd.toLocaleString('pt-BR')} coins**!\nSaldo: **${novo.toLocaleString('pt-BR')} coins** (R$ ${coinsParaReais(novo).toFixed(2)})\n📝 ${motivo}`).setTimestamp()] }).catch(()=>{});
    return interaction.editReply({ content: `✅ **${qtd.toLocaleString('pt-BR')} coins** adicionados a <@${discordId}>!` });
  }

  if (id === 'pam_remover_coins') {
    await interaction.deferReply({ ephemeral: true });
    if (!isOwner(interaction.member)) return interaction.editReply({ content: '❌ Apenas o Owner.' });
    const discordId2 = interaction.fields.getTextInputValue('discord_id').trim().replace(/[<@>]/g,'');
    const qtd2       = parseInt(interaction.fields.getTextInputValue('quantidade').trim());
    const motivo2    = interaction.fields.getTextInputValue('motivo').trim() || `Removido por ${interaction.user.tag}`;
    if (isNaN(qtd2) || qtd2 <= 0) return interaction.editReply({ content: '❌ Quantidade inválida.' });
    const u2 = db.prepare('SELECT coins FROM usuarios WHERE discord_id=?').get(discordId2);
    if (!u2) return interaction.editReply({ content: '❌ Usuário não encontrado.' });
    const atual = u2.coins || 0;
    if (atual < qtd2) return interaction.editReply({ content: `❌ Usuário tem apenas **${atual.toLocaleString('pt-BR')} coins**.` });
    const novo2 = atual - qtd2;
    db.prepare('UPDATE usuarios SET coins=? WHERE discord_id=?').run(novo2, discordId2);
    const { COIN_EMOJI } = require('./coins');
    const member2 = await interaction.guild.members.fetch(discordId2).catch(() => null);
    if (member2) member2.send({ embeds: [new EmbedBuilder().setColor(config.colors.warning).setTitle(`${COIN_EMOJI} Coins Removidos`).setDescription(`**${qtd2.toLocaleString('pt-BR')} coins** foram removidos da sua conta.\n📝 ${motivo2}\nSaldo atual: **${novo2.toLocaleString('pt-BR')} coins**`).setTimestamp()] }).catch(()=>{});
    return interaction.editReply({ content: `✅ **${qtd2.toLocaleString('pt-BR')} coins** removidos de <@${discordId2}>. Novo saldo: ${novo2.toLocaleString('pt-BR')} coins.` });
  }

  // ─── Modais da Caixa Misteriosa ──────────────────────────────────────────────

  if (id === 'pam_caixa_config') {
    await interaction.deferReply({ ephemeral: true });
    const nome       = interaction.fields.getTextInputValue('nome').trim();
    const preco      = parseFloat(interaction.fields.getTextInputValue('preco').trim().replace(',','.'));
    const canal_id   = interaction.fields.getTextInputValue('canal_id').trim();
    const descricao  = interaction.fields.getTextInputValue('descricao').trim();
    const imagem     = interaction.fields.getTextInputValue('imagem').trim();
    if (isNaN(preco)||preco<=0) return interaction.editReply({ content: '❌ Preço inválido.' });

    // Criar sempre uma nova caixa (múltiplas caixas suportadas)
    const { v4: uuidv4 } = require('uuid');
    db.prepare('INSERT INTO caixa_config (id,nome,preco,canal_id,descricao,imagem_url,criado_por) VALUES (?,?,?,?,?,?,?)')
      .run(uuidv4(), nome, preco, canal_id, descricao||null, imagem||null, interaction.user.id);
    return interaction.editReply({ content: `✅ Caixa **${nome}** criada!\n💵 R$ ${preco.toFixed(2)} • Canal: <#${canal_id}>\n\n➡️ Agora clique em **🎯 Add Item** e informe o nome desta caixa para adicionar produtos.` });
  }

  if (id === 'pam_caixa_add_item') {
    await interaction.deferReply({ ephemeral: true });
    const caixaBusca = interaction.fields.getTextInputValue('caixa_id').trim();
    const varBusca   = interaction.fields.getTextInputValue('variante_id').trim();
    const raridade   = interaction.fields.getTextInputValue('raridade').trim().toLowerCase();
    const chance     = parseFloat(interaction.fields.getTextInputValue('chance').trim().replace(',','.'));
    const { RARIDADES } = require('./caixaMisteriosa');

    if (!RARIDADES[raridade]) return interaction.editReply({ content: '❌ Raridade inválida. Use: comum, raro, epico ou lendario' });
    if (isNaN(chance)||chance<=0||chance>100) return interaction.editReply({ content: '❌ Chance inválida (1-100).' });

    const caixa = db.prepare("SELECT * FROM caixa_config WHERE UPPER(SUBSTR(id,1,8))=UPPER(?) OR id LIKE ? OR LOWER(nome)=LOWER(?)").get(caixaBusca, `${caixaBusca}%`, caixaBusca);
    if (!caixa) return interaction.editReply({ content: `❌ Caixa \`${caixaBusca}\` não encontrada.` });

    const variante = db.prepare("SELECT * FROM variantes_produto WHERE UPPER(SUBSTR(id,1,8))=UPPER(?) OR id LIKE ?").get(varBusca, `${varBusca}%`);
    if (!variante) return interaction.editReply({ content: `❌ Variante \`${varBusca}\` não encontrada.` });

    // Verificar total de chances desta caixa
    const totalAtual = db.prepare('SELECT COALESCE(SUM(chance),0) as t FROM caixa_itens_config WHERE caixa_id=? AND ativa=1').get(caixa.id).t;
    const novoTotal  = totalAtual + chance;
    if (novoTotal > 100.1) return interaction.editReply({ content: `❌ Total de chances ultrapassa 100%!\nAtual: **${totalAtual}%** + **${chance}%** = **${novoTotal}%**` });

    const { v4: uuidv4 } = require('uuid');
    const existeItem = db.prepare('SELECT * FROM caixa_itens_config WHERE caixa_id=? AND variante_id=?').get(caixa.id, variante.id);
    if (existeItem) {
      db.prepare('UPDATE caixa_itens_config SET raridade=?,chance=?,ativa=1 WHERE id=?').run(raridade, chance, existeItem.id);
    } else {
      db.prepare('INSERT INTO caixa_itens_config (id,caixa_id,variante_id,raridade,chance) VALUES (?,?,?,?,?)').run(uuidv4(), caixa.id, variante.id, raridade, chance);
    }

    const rar  = RARIDADES[raridade];
    const prod = db.prepare('SELECT nome FROM produtos WHERE id=?').get(variante.produto_id);
    return interaction.editReply({
      content: [
        `✅ Item adicionado à **${caixa.nome}**!`,
        `${rar.emoji} **${prod?.nome} › ${variante.nome}** — ${chance}% de drop`,
        `📊 Total desta caixa: **${novoTotal.toFixed(1)}%** / 100%`,
        novoTotal < 99.9 ? `⚠️ Faltam **${(100-novoTotal).toFixed(1)}%** para completar 100%` : '✅ Total completo!',
      ].join('\n'),
    });
  }

  if (id === 'pam_caixa_deletar') {
    await interaction.deferReply({ ephemeral: true });
    if (!isAdmin(interaction.member)) return interaction.editReply({ content: '❌ Apenas admins.' });
    const busca  = interaction.fields.getTextInputValue('caixa_id').trim();
    const caixa  = db.prepare("SELECT * FROM caixa_config WHERE UPPER(SUBSTR(id,1,8))=UPPER(?) OR id LIKE ? OR LOWER(nome)=LOWER(?)").get(busca, `${busca}%`, busca);
    if (!caixa) return interaction.editReply({ content: `❌ Caixa \`${busca}\` não encontrada.` });

    // Deletar embed do canal
    if (caixa.canal_id && caixa.mensagem_id) {
      try {
        const canal = interaction.guild.channels.cache.get(caixa.canal_id);
        const msg   = await canal?.messages.fetch(caixa.mensagem_id).catch(() => null);
        if (msg) await msg.delete().catch(() => {});
      } catch {}
    }

    // Desativar no banco
    db.prepare('UPDATE caixa_config SET ativa=0 WHERE id=?').run(caixa.id);
    db.prepare('UPDATE caixa_itens_config SET ativa=0 WHERE caixa_id=?').run(caixa.id);

    return interaction.editReply({ content: `✅ Caixa **${caixa.nome}** deletada e embed removido do canal.` });
  }

  if (id === 'pam_caixa_rem_item') {
    await interaction.deferReply({ ephemeral: true });
    const varBusca  = interaction.fields.getTextInputValue('variante_id').trim();
    const caixaBusca = interaction.fields.getTextInputValue('caixa_id')?.trim() || '';
    // Buscar na caixa específica se informada, senão remove de todas
    const variante = db.prepare("SELECT * FROM variantes_produto WHERE UPPER(SUBSTR(id,1,8))=UPPER(?) OR id LIKE ?").get(varBusca, `${varBusca}%`);
    if (!variante) return interaction.editReply({ content: '❌ Variante não encontrada.' });
    if (caixaBusca) {
      const caixa = db.prepare("SELECT * FROM caixa_config WHERE UPPER(SUBSTR(id,1,8))=UPPER(?) OR id LIKE ? OR LOWER(nome)=LOWER(?)").get(caixaBusca, `${caixaBusca}%`, caixaBusca);
      if (!caixa) return interaction.editReply({ content: '❌ Caixa não encontrada.' });
      db.prepare('UPDATE caixa_itens_config SET ativa=0 WHERE caixa_id=? AND variante_id=?').run(caixa.id, variante.id);
      return interaction.editReply({ content: `✅ Item **${variante.nome}** removido da caixa **${caixa.nome}**.` });
    }
    db.prepare('UPDATE caixa_itens_config SET ativa=0 WHERE variante_id=?').run(variante.id);
    return interaction.editReply({ content: `✅ Item **${variante.nome}** removido de todas as caixas.` });
  }

  if (id === 'pam_caixa_toggle') {
    await interaction.deferReply({ ephemeral: true });
    const busca = interaction.fields.getTextInputValue('caixa_id').trim();
    const caixa = db.prepare("SELECT * FROM caixa_config WHERE UPPER(SUBSTR(id,1,8))=UPPER(?) OR id LIKE ? OR LOWER(nome)=LOWER(?)").get(busca, `${busca}%`, busca);
    if (!caixa) return interaction.editReply({ content: `❌ Caixa \`${busca}\` não encontrada.` });
    db.prepare('UPDATE caixa_config SET ativa=? WHERE id=?').run(caixa.ativa ? 0 : 1, caixa.id);
    return interaction.editReply({ content: `✅ Caixa **${caixa.nome}** ${caixa.ativa ? '🔴 desativada' : '🟢 ativada'}!` });
  }

  if (id === 'pam_caixa_publicar') {
    await interaction.deferReply({ ephemeral: true });
    const canalId = interaction.fields.getTextInputValue('canal_id').trim();
    const { enviarEmbedCaixasCanal } = require('./caixaMisteriosa');
    await enviarEmbedCaixasCanal(interaction.guild, canalId);
    return interaction.editReply({ content: `✅ Embed das caixas publicado em <#${canalId}>!` });
  }

  if (id === 'pam_gerar_codigos') {
    await interaction.deferReply({ ephemeral: true });
    if (!isOwner(interaction.member)) return interaction.editReply({ content: '❌ Apenas o Owner.' });
    const coins = parseInt(interaction.fields.getTextInputValue('coins').trim());
    const qtd2  = Math.min(parseInt(interaction.fields.getTextInputValue('quantidade').trim()), 50);
    const alvoId = interaction.fields.getTextInputValue('discord_id').trim().replace(/[<@>]/g, '') || null;
    if (isNaN(coins)||coins<=0) return interaction.editReply({ content: '❌ Valor de coins inválido.' });
    if (isNaN(qtd2)||qtd2<=0)  return interaction.editReply({ content: '❌ Quantidade inválida.' });

    const { gerarCodigos } = require('./codigosCoins');
    const { COIN_EMOJI: CE } = require('./coins');
    const codigos    = gerarCodigos({ quantidade: qtd2, coinsValor: coins, criadoPor: interaction.user.id });
    const valorReais = (coins * 0.01).toFixed(2);

    const embedCod = new EmbedBuilder()
      .setColor(config.colors.coins || config.colors.gold)
      .setTitle(`🎫 ${qtd2} Código(s) de Coins`)
      .setDescription([
        `${CE} **Valor:** ${coins.toLocaleString('pt-BR')} coins (R$ ${valorReais}) cada`,
        `📦 **Quantidade:** ${qtd2}`,
        `🔒 Uso único por código`,
        '',
        '```',
        codigos.join('\n'),
        '```',
      ].join('\n'))
      .setTimestamp()
      .setFooter({ text: 'Máximo Store • Guarde com segurança!' });

    // Enviar para o usuário informado ou para o próprio admin
    let enviado = false;
    if (alvoId) {
      try {
        const guild  = interaction.guild;
        const member = await guild.members.fetch(alvoId).catch(() => null);
        if (member) {
          await member.send({ embeds: [embedCod] });
          enviado = true;
          return interaction.editReply({ content: `✅ **${qtd2} código(s)** gerado(s) e enviado(s) no privado de <@${alvoId}>!\n${CE} ${coins.toLocaleString('pt-BR')} coins (R$ ${valorReais}) cada.` });
        } else {
          return interaction.editReply({ content: `❌ Usuário \`${alvoId}\` não encontrado no servidor.` });
        }
      } catch {
        return interaction.editReply({ content: `❌ Não foi possível enviar DM para <@${alvoId}>. A pessoa pode ter DMs desativadas.` });
      }
    }

    // Sem ID informado — envia para o admin
    await interaction.user.send({ embeds: [embedCod] }).catch(() => {});
    return interaction.editReply({ content: `✅ **${qtd2} código(s)** gerado(s)!\n${CE} ${coins.toLocaleString('pt-BR')} coins (R$ ${valorReais}) cada.\nCódigos enviados na sua **DM**.` });
  }

  if (id === 'pam_anuncio') {
    await interaction.deferReply({ ephemeral: true });
    const titulo   = interaction.fields.getTextInputValue('titulo').trim();
    const mensagem = interaction.fields.getTextInputValue('mensagem').trim();
    const imagem   = interaction.fields.getTextInputValue('imagem').trim();
    const { enviarAnuncio } = require('./anuncios');
    return enviarAnuncio(interaction, { titulo, mensagem, imagemUrl: imagem||null });
  }

  if (id === 'pam_buscar_pedido') {
    await interaction.deferReply({ ephemeral: true });
    const busca  = interaction.fields.getTextInputValue('pedido_id').trim().toUpperCase();
    const pedido = db.prepare("SELECT p.*, u.nome AS nome_usuario, pr.nome AS nome_produto FROM pedidos p LEFT JOIN usuarios u ON p.usuario_id=u.discord_id LEFT JOIN produtos pr ON p.produto_id=pr.id WHERE UPPER(SUBSTR(p.id,1,8))=?").get(busca);
    if (!pedido) return interaction.editReply({ content: `❌ Pedido \`${busca}\` não encontrado.` });
    const statusEmoji = { pendente:'⏳', pago:'✅', entregue:'📦', cancelado:'❌', reembolsado:'↩️' };
    const embed = new EmbedBuilder().setColor(config.colors.info).setTitle(`🔍 Pedido ${busca}`)
      .addFields(
        { name: '👤 Cliente',   value: `<@${pedido.usuario_id}> (${pedido.nome_usuario || '?'})`, inline: false },
        { name: '📦 Produto',   value: pedido.nome_produto || pedido.produto_id.slice(0,8),         inline: true },
        { name: '💵 Valor',     value: `R$ ${Number(pedido.valor_total).toFixed(2)}`,               inline: true },
        { name: '📊 Status',    value: `${statusEmoji[pedido.status]||'?'} ${pedido.status}`,       inline: true },
        { name: '🎟️ Cupom',    value: pedido.cupom_usado || '—',                                   inline: true },
        { name: '📅 Criado em', value: pedido.criado_em ? `<t:${pedido.criado_em}:f>` : '—',       inline: true },
      ).setTimestamp();
    const rowAcoes = new ActionRowBuilder().addComponents(
      btn(`ticket_aceitar_sem_pag_${pedido.id}`, '✅ Liberar', ButtonStyle.Success),
      btn(`pa_bloquear_${pedido.usuario_id}`,    '🚫 Bloquear', ButtonStyle.Danger),
    );
    return interaction.editReply({ embeds: [embed], components: [rowAcoes] });
  }

  if (id === 'pam_editar_plano') {
    await interaction.deferReply({ ephemeral: true });
    const busca = interaction.fields.getTextInputValue('variante_id').trim();
    const novoNome  = interaction.fields.getTextInputValue('nome').trim();
    const novoPreco = interaction.fields.getTextInputValue('preco').trim().replace(',', '.');
    const variante  = db.prepare("SELECT * FROM variantes_produto WHERE UPPER(SUBSTR(id,1,8))=UPPER(?) OR id LIKE ?").get(busca, `${busca}%`);
    if (!variante) return interaction.editReply({ content: `❌ Variante \`${busca}\` não encontrada.` });
    if (novoNome)  db.prepare('UPDATE variantes_produto SET nome=? WHERE id=?').run(novoNome, variante.id);
    if (novoPreco) {
      const p = parseFloat(novoPreco);
      if (!isNaN(p) && p >= 0) db.prepare('UPDATE variantes_produto SET preco=? WHERE id=?').run(p, variante.id);
    }
    const { atualizarPainelProduto } = require('./painelProduto');
    const paineis = db.prepare('SELECT * FROM paineis_canal WHERE produto_id=? AND ativo=1').all(variante.produto_id);
    for (const p of paineis) await atualizarPainelProduto(interaction.guild, p.id).catch(() => {});
    const atualizado = db.prepare('SELECT * FROM variantes_produto WHERE id=?').get(variante.id);
    return interaction.editReply({ content: `✅ Plano atualizado!\n**${atualizado.nome}** — R$ ${Number(atualizado.preco).toFixed(2)}` });
  }

  if (id === 'pam_blacklist_cpf') {
    await interaction.deferReply({ ephemeral: true });
    if (!isAdmin(interaction.member)) return interaction.editReply({ content: '❌ Apenas admins.' });
    const acao   = interaction.fields.getTextInputValue('acao').trim().toLowerCase();
    const cpf    = interaction.fields.getTextInputValue('cpf').trim().replace(/\D/g, '');
    const motivo = interaction.fields.getTextInputValue('motivo').trim() || 'Bloqueado pelo admin';
    if (cpf.length < 11) return interaction.editReply({ content: '❌ CPF inválido (mínimo 11 dígitos).' });
    const { bloquearCpf, desbloquearCpf, listarCpfsBloqueados } = require('./antiFraude');
    if (acao.includes('des')) {
      desbloquearCpf(cpf);
      return interaction.editReply({ content: `✅ CPF \`${cpf}\` desbloqueado.` });
    } else {
      bloquearCpf(cpf, motivo, interaction.user.id);
      return interaction.editReply({ content: `🚫 CPF \`${cpf}\` bloqueado.\n**Motivo:** ${motivo}` });
    }
  }

  if (id.startsWith('pam_bloquear_')) {
    await interaction.deferReply({ ephemeral: true });
    const discordId = id.replace('pam_bloquear_', '');
    const motivo    = interaction.fields.getTextInputValue('motivo').trim();
    Usuarios.bloquear(discordId, motivo);
    return interaction.editReply({ content: `🚫 <@${discordId}> bloqueado com sucesso.\n**Motivo:** ${motivo}` });
  }

  if (id === 'pam_coins_todos') {
    await interaction.deferReply({ ephemeral: true });
    if (!isAdmin(interaction.member)) return interaction.editReply({ content: '❌ Apenas admins.' });
    const qtd    = parseInt(interaction.fields.getTextInputValue('quantidade').trim());
    const motivo = interaction.fields.getTextInputValue('motivo').trim() || 'Bônus para todos';
    if (isNaN(qtd) || qtd <= 0) return interaction.editReply({ content: '❌ Quantidade inválida.' });

    const { addCoins, COIN_EMOJI } = require('./coins');
    const usuarios = db.prepare('SELECT discord_id FROM usuarios').all();
    let count = 0, erros = 0;
    // Processar em chunks de 50 para não travar
    const CHUNK = 50;
    for (let i = 0; i < usuarios.length; i += CHUNK) {
      const chunk = usuarios.slice(i, i + CHUNK);
      for (const u of chunk) {
        try { addCoins(u.discord_id, qtd, motivo); count++; } catch { erros++; }
      }
      // Pequena pausa entre chunks se base for grande
      if (i + CHUNK < usuarios.length) await new Promise(r => setTimeout(r, 50));
    }
    _statsCache = null;
    return interaction.editReply({ content: `✅ **${qtd} ${COIN_EMOJI}** adicionados para **${count}** usuário(s)!\n${erros > 0 ? `⚠️ ${erros} falha(s).` : ''}\n**Motivo:** ${motivo}` });
  }

  // ─── Enviar produto manualmente (modal) ──────────────────────────────────
  if (id.startsWith('pam_enviar_produto_')) {
    await interaction.deferReply({ ephemeral: true });
    const varianteId  = id.replace('pam_enviar_produto_', '');
    const discordId   = interaction.fields.getTextInputValue('discord_id').trim();
    const qtd         = Math.max(1, parseInt(interaction.fields.getTextInputValue('quantidade').trim()) || 1);
    const motivo      = interaction.fields.getTextInputValue('motivo').trim() || 'Envio manual pelo admin';

    const variante = db.prepare('SELECT * FROM variantes_produto WHERE id=?').get(varianteId);
    if (!variante) return interaction.editReply({ content: '❌ Variante não encontrada.' });

    const produto = db.prepare('SELECT * FROM produtos WHERE id=?').get(variante.produto_id);
    if (!produto) return interaction.editReply({ content: '❌ Produto não encontrado.' });

    // Pegar os itens do estoque
    const { pegarItemVariante } = require('./painelProduto');
    const itens = [];
    for (let i = 0; i < qtd; i++) {
      const item = db.prepare('SELECT * FROM estoque_variante WHERE variante_id=? AND usado=0 LIMIT 1').get(varianteId);
      if (!item) break;
      db.prepare("UPDATE estoque_variante SET usado=1, usado_por=?, usado_em=strftime('%s','now') WHERE id=?")
        .run(interaction.user.id, item.id);
      itens.push(item.conteudo);
    }

    if (!itens.length) return interaction.editReply({ content: '❌ Sem estoque disponível para esta variante.' });

    const conteudo = itens.join('\n');
    const embedProduto = new EmbedBuilder()
      .setColor(config.colors.success)
      .setTitle(`📦 ${produto.nome}`)
      .setDescription([
        motivo ? `> 📝 ${motivo}` : '',
        '',
        `**Variante:** ${variante.nome}`,
        `**Quantidade:** ${itens.length}`,
      ].filter(Boolean).join('\n'))
      .addFields({ name: '🎁 Produto', value: `\`\`\`\n${conteudo.slice(0, 900)}\n\`\`\`` })
      .setTimestamp()
      .setFooter({ text: `Enviado por ${interaction.user.username} • Máximo Store` });

    // Se tem Discord ID → envia DM
    if (discordId) {
      const membro = await interaction.guild.members.fetch(discordId).catch(() => null);
      if (!membro) return interaction.editReply({ content: `❌ Usuário \`${discordId}\` não encontrado no servidor.` });
      const enviado = await membro.send({ embeds: [embedProduto] }).catch(() => null);
      if (!enviado) return interaction.editReply({ content: `❌ Não foi possível enviar DM para <@${discordId}> (DMs fechadas).` });

      const { log } = require('../utils/logger');
      await log('envio_manual', { executor: interaction.user.id, usuario: discordId, descricao: `📤 Envio manual: ${produto.nome} (${variante.nome}) x${itens.length} → <@${discordId}> — ${motivo}` });

      return interaction.editReply({ content: `✅ **${itens.length}x ${produto.nome} — ${variante.nome}** enviado para <@${discordId}>!` });
    }

    // Sem Discord ID → envia no canal onde está o painel/menu
    const canal = interaction.channel;
    if (!canal) return interaction.editReply({ content: '❌ Canal não encontrado.' });
    await canal.send({ embeds: [embedProduto] }).catch(() => {});

    const { log } = require('../utils/logger');
    await log('envio_manual', { executor: interaction.user.id, descricao: `📤 Envio manual: ${produto.nome} (${variante.nome}) x${itens.length} no canal <#${canal.id}> — ${motivo}` });

    return interaction.editReply({ content: `✅ **${itens.length}x ${produto.nome} — ${variante.nome}** enviado em <#${canal.id}>!` });
  }

  // ─── Config canal de vendas ───────────────────────────────────────────────
  if (id === 'pam_cfg_canal_vendas') {
    await interaction.deferReply({ ephemeral: true });
    const canalId = interaction.fields.getTextInputValue('canal_id').trim();
    if (canalId === '0' || canalId === '') {
      db.prepare("INSERT OR REPLACE INTO configuracoes (chave,valor,tipo) VALUES ('canal_vendas_id','','string')").run();
      return interaction.editReply({ content: '✅ Feed de vendas desativado.' });
    }
    const canal = interaction.guild.channels.cache.get(canalId);
    if (!canal) return interaction.editReply({ content: `❌ Canal \`${canalId}\` não encontrado.` });
    db.prepare("INSERT OR REPLACE INTO configuracoes (chave,valor,tipo) VALUES ('canal_vendas_id',?,'string')").run(canalId);
    return interaction.editReply({ content: `✅ Feed de vendas configurado para <#${canalId}>.` });
  }

  if (id === 'pam_cfg_canal_cupons') {
    await interaction.deferReply({ ephemeral: true });
    const canalId = interaction.fields.getTextInputValue('canal_id').trim();
    if (canalId === '0' || canalId === '') {
      db.prepare("INSERT OR REPLACE INTO configuracoes (chave,valor,tipo) VALUES ('canal_cupons_id','','string')").run();
      return interaction.editReply({ content: '✅ Canal de cupons desativado.' });
    }
    const canal = interaction.guild.channels.cache.get(canalId);
    if (!canal) return interaction.editReply({ content: `❌ Canal \`${canalId}\` não encontrado.` });
    db.prepare("INSERT OR REPLACE INTO configuracoes (chave,valor,tipo) VALUES ('canal_cupons_id',?,'string')").run(canalId);
    return interaction.editReply({ content: `✅ Canal de cupons configurado para <#${canalId}>.` });
  }

  // ─── Afiliados modais ─────────────────────────────────────────────────────
  if (id === 'pam_afil_pagar_saque') {
    await interaction.deferReply({ ephemeral: true });
    const discordId   = interaction.fields.getTextInputValue('discord_id').trim();
    const comprovante = interaction.fields.getTextInputValue('comprovante').trim();
    const u = db.prepare('SELECT * FROM usuarios WHERE discord_id=?').get(discordId);
    if (!u) return interaction.editReply({ content: '❌ Usuário não encontrado.' });
    if (!u.saldo || u.saldo <= 0) return interaction.editReply({ content: '⚠️ Usuário sem saldo a receber.' });
    const valorPago = u.saldo;
    db.prepare('UPDATE usuarios SET saldo=0 WHERE discord_id=?').run(discordId);
    // Notificar afiliado
    try {
      const membro = await interaction.guild.members.fetch(discordId).catch(() => null);
      if (membro) {
        await membro.send({ embeds: [new EmbedBuilder()
          .setColor(config.colors.success)
          .setTitle('💸 Saque de Afiliado Aprovado!')
          .setDescription([
            `> Seu saque de **R$ ${Number(valorPago).toFixed(2)}** foi aprovado e pago!`,
            comprovante ? `> 📄 ${comprovante}` : '',
          ].filter(Boolean).join('\n'))
          .setTimestamp()
          .setFooter({ text: 'Máximo Store • Programa de Afiliados' }),
        ] }).catch(() => {});
      }
    } catch {}
    const { log } = require('../utils/logger');
    await log('sistema', { executor: interaction.user.id, usuario: discordId, descricao: `💸 Saque afiliado pago: R$ ${Number(valorPago).toFixed(2)} para <@${discordId}>` });
    return interaction.editReply({ content: `✅ Saque de **R$ ${Number(valorPago).toFixed(2)}** marcado como pago para <@${discordId}>. Saldo zerado.` });
  }

  if (id === 'pam_afil_rejeitar_saque') {
    await interaction.deferReply({ ephemeral: true });
    const discordId = interaction.fields.getTextInputValue('discord_id').trim();
    const motivo    = interaction.fields.getTextInputValue('motivo').trim();
    const u = db.prepare('SELECT * FROM usuarios WHERE discord_id=?').get(discordId);
    if (!u) return interaction.editReply({ content: '❌ Usuário não encontrado.' });
    try {
      const membro = await interaction.guild.members.fetch(discordId).catch(() => null);
      if (membro) {
        await membro.send({ embeds: [new EmbedBuilder()
          .setColor(config.colors.error)
          .setTitle('❌ Saque Rejeitado')
          .setDescription(`> Seu saque foi rejeitado.\n> **Motivo:** ${motivo}`)
          .setTimestamp()
          .setFooter({ text: 'Máximo Store • Programa de Afiliados' }),
        ] }).catch(() => {});
      }
    } catch {}
    return interaction.editReply({ content: `✅ Saque de <@${discordId}> rejeitado. Saldo mantido. Usuário notificado.` });
  }

  if (id === 'pam_afil_buscar') {
    await interaction.deferReply({ ephemeral: true });
    const busca = interaction.fields.getTextInputValue('discord_id').trim();
    const u = db.prepare('SELECT * FROM usuarios WHERE discord_id=? OR codigo_afil=? OR codigo_acesso=?').get(busca, busca.toUpperCase(), busca.toUpperCase());
    if (!u) return interaction.editReply({ content: '❌ Afiliado não encontrado.' });
    const vendas = db.prepare("SELECT COUNT(*) as c, COALESCE(SUM(comissao_afil),0) as t FROM pedidos WHERE afiliado_id=? AND status IN ('pago','entregue')").get(u.discord_id);
    const n2count = db.prepare('SELECT COUNT(*) as c FROM usuarios WHERE afiliado_de=? AND nivel_afil=2').get(u.discord_id).c;
    const nivelLabel = u.nivel_afil === 1 ? '🥇 Nível 1' : u.nivel_afil === 2 ? '🥈 Nível 2' : '❌ Não afiliado';
    const embed = new EmbedBuilder()
      .setColor(0x9B59B6)
      .setTitle(`🤝 Afiliado — ${u.nome || u.discord_id}`)
      .addFields(
        { name: '📊 Nível',          value: nivelLabel,                                          inline: true },
        { name: '🔑 Acesso',         value: `\`${u.codigo_acesso || '—'}\``,                    inline: true },
        { name: '🏷️ Vendas',         value: `\`${u.codigo_afil || '—'}\``,                      inline: true },
        { name: '💰 Saldo',          value: `R$ ${Number(u.saldo||0).toFixed(2)}`,               inline: true },
        { name: '🛒 Vendas geradas', value: `**${vendas.c}** • R$ ${Number(vendas.t).toFixed(2)}`, inline: true },
        { name: '👥 N2 registrados', value: `**${n2count}**`,                                    inline: true },
        { name: '🆔 Discord ID',     value: `\`${u.discord_id}\``,                              inline: true },
      )
      .setTimestamp();
    const rowAcoes = new ActionRowBuilder().addComponents(
      btn('pa_afil_pagar_saque',    '✅ Pagar Saque',   ButtonStyle.Success),
      btn('pa_afil_rejeitar_saque', '❌ Rejeitar',      ButtonStyle.Danger),
      btn(`pa_bloquear_${u.discord_id}`, u.bloqueado ? '✅ Desbloquear' : '🚫 Bloquear', u.bloqueado ? ButtonStyle.Success : ButtonStyle.Danger),
    );
    return interaction.editReply({ embeds: [embed], components: [rowAcoes] });
  }

  if (id === 'pam_afil_cfg_comissao') {
    await interaction.deferReply({ ephemeral: true });
    const pct = parseFloat(interaction.fields.getTextInputValue('pct').trim());
    if (isNaN(pct) || pct < 0 || pct > 100) return interaction.editReply({ content: '❌ Valor entre 0 e 100.' });
    db.prepare("INSERT OR REPLACE INTO configuracoes (chave,valor,tipo) VALUES ('taxa_afiliado',?,'string')").run(String(pct));
    return interaction.editReply({ content: `✅ Comissão N1 definida em **${pct}%** por venda.` });
  }

  if (id === 'pam_afil_cfg_nivel2') {
    await interaction.deferReply({ ephemeral: true });
    const pct = parseFloat(interaction.fields.getTextInputValue('pct').trim());
    if (isNaN(pct) || pct < 0 || pct > 100) return interaction.editReply({ content: '❌ Valor entre 0 e 100.' });
    db.prepare("INSERT OR REPLACE INTO configuracoes (chave,valor,tipo) VALUES ('taxa_afil_n2',?,'string')").run(String(pct));
    return interaction.editReply({ content: `✅ Comissão N2 definida em **${pct}%** por venda.` });
  }

  if (id === 'pam_afil_cfg_bonus') {
    await interaction.deferReply({ ephemeral: true });
    const pct = parseFloat(interaction.fields.getTextInputValue('pct').trim());
    if (isNaN(pct) || pct < 0 || pct > 100) return interaction.editReply({ content: '❌ Valor entre 0 e 100.' });
    db.prepare("INSERT OR REPLACE INTO configuracoes (chave,valor,tipo) VALUES ('taxa_afil_n1_bonus',?,'string')").run(String(pct));
    return interaction.editReply({ content: `✅ Bônus N1 (quando N2 vende) definido em **${pct}%**.` });
  }

  if (id === 'pam_afil_cfg_min_saque') {
    await interaction.deferReply({ ephemeral: true });
    const valor = parseFloat(interaction.fields.getTextInputValue('valor').trim().replace(',','.'));
    if (isNaN(valor) || valor < 0) return interaction.editReply({ content: '❌ Valor inválido.' });
    db.prepare("INSERT OR REPLACE INTO configuracoes (chave,valor,tipo) VALUES ('min_saque_afiliado',?,'string')").run(String(valor));
    return interaction.editReply({ content: `✅ Mínimo para saque definido em **R$ ${valor.toFixed(2)}**.` });
  }

  if (id === 'pam_afil_registrar') {
    await interaction.deferReply({ ephemeral: true });
    const discordId    = interaction.fields.getTextInputValue('discord_id').trim();
    const codigoAcesso = interaction.fields.getTextInputValue('codigo_acesso').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    const codigoVendas = interaction.fields.getTextInputValue('codigo_vendas').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (codigoAcesso.length < 4) return interaction.editReply({ content: '❌ Código de acesso inválido (mín. 4 chars).' });
    if (codigoVendas.length < 2) return interaction.editReply({ content: '❌ Código de vendas inválido (mín. 2 chars).' });

    const membro = await interaction.guild.members.fetch(discordId).catch(() => null);
    if (!membro) return interaction.editReply({ content: `❌ Usuário \`${discordId}\` não encontrado.` });

    const { registrarAfiliadoN1 } = require('./afiliados');
    const { ok, erro } = await registrarAfiliadoN1(interaction, discordId, codigoAcesso, codigoVendas);
    if (!ok) return interaction.editReply({ content: `❌ ${erro}` });

    // Dar cargo de Afiliado N1
    const cargoN1 = '1546330596207366175';
    await membro.roles.add(cargoN1).catch(() => {});

    return interaction.editReply({
      content: `✅ Afiliado N1 **${membro.user.username}** registrado!\n> Acesso: \`${codigoAcesso}\` | Vendas: \`${codigoVendas}\`\n> Cargo de Afiliado N1 adicionado. DM enviada.`,
    });
  }

  if (id === 'pam_afil_remover') {
    await interaction.deferReply({ ephemeral: true });
    const discordId = interaction.fields.getTextInputValue('discord_id').trim();
    const { removerAfiliado } = require('./afiliados');
    const { ok, erro } = removerAfiliado(discordId);
    if (!ok) return interaction.editReply({ content: `❌ ${erro}` });

    // Remover cargos de afiliado
    const membro = await interaction.guild.members.fetch(discordId).catch(() => null);
    if (membro) {
      await membro.roles.remove('1546330596207366175').catch(() => {});
      await membro.roles.remove('1546330866828050532').catch(() => {});
      // Notificar por DM
      await membro.send({
        embeds: [new EmbedBuilder()
          .setColor(config.colors.error)
          .setTitle('❌ Afiliado Removido')
          .setDescription('> Seu acesso ao programa de afiliados foi removido pelo administrador.')
          .setTimestamp()
          .setFooter({ text: 'Máximo Store' })],
      }).catch(() => {});
    }

    const { log } = require('../utils/logger');
    await log('sistema', { executor: interaction.user.id, descricao: `🗑️ Afiliado removido: <@${discordId}>` });
    return interaction.editReply({ content: `✅ Afiliado <@${discordId}> removido. Cargos e códigos apagados.` });
  }

  // ─── Gerar QR Code manualmente com valor ─────────────────────────────────
  if (id === 'pam_gerar_qr') {
    await interaction.deferReply({ ephemeral: true });

    const valorText = interaction.fields.getTextInputValue('valor').trim().replace(',', '.');
    const valor = Number(valorText);

    if (!valorText || Number.isNaN(valor) || valor <= 0) {
      return interaction.editReply({ content: '❌ Informe um valor válido em reais, ex: 99.90.' });
    }

    try {
      const efi      = require('../systems/efi');
      const QRCode   = require('qrcode');
      const { AttachmentBuilder, EmbedBuilder: EB } = require('discord.js');

      const pedidoId = `QR_${Date.now()}`;
      const cobranca = await efi.criarCobrancaPix({
        valor,
        descricao: 'Máximo Store - QR Code manual',
        pedidoId,
        nomeCliente: 'QR Manual',
      });

      const qrData = await efi.gerarQRCode(cobranca.locId);
      const qrcode = qrData.qrcode;

      let qrBuf = null;
      try { qrBuf = await QRCode.toBuffer(qrcode, { width: 300, margin: 2 }); } catch {}

      const embed = new EB()
        .setColor(0x00D4AA)
        .setTitle('💠 QR Code PIX Gerado')
        .addFields(
          { name: '💵 Valor', value: `R$ ${Number(valor).toFixed(2)}`, inline: true },
          { name: '💠 PIX Copia e Cola', value: `\`\`\`${qrcode}\`\`\``, inline: false },
        )
        .setTimestamp()
        .setFooter({ text: 'Máximo Store • QR Code gerado manualmente pelo admin' });

      if (qrBuf) {
        const att = new AttachmentBuilder(qrBuf, { name: 'qrcode.png' });
        embed.setImage('attachment://qrcode.png');
        return interaction.editReply({ embeds: [embed], files: [att] });
      }

      return interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('[GerarQR Admin]', err.message);
      return interaction.editReply({ content: `❌ Erro ao gerar QR Code: \`${err.message.slice(0,100)}\`` });
    }
  }

  // ─── Ver conteúdo entregue de um pedido ──────────────────────────────────
  if (id === 'pam_ver_entrega') {
    await interaction.deferReply({ ephemeral: true });
    const busca  = interaction.fields.getTextInputValue('pedido_id').trim();
    const pedido = db.prepare("SELECT p.*, pr.nome as pnome, u.nome as unome FROM pedidos p JOIN produtos pr ON p.produto_id=pr.id LEFT JOIN usuarios u ON p.usuario_id=u.discord_id WHERE UPPER(SUBSTR(p.id,1,8))=UPPER(?) OR p.id LIKE ?").get(busca, `${busca}%`);
    if (!pedido) return interaction.editReply({ content: `❌ Pedido \`${busca}\` não encontrado.` });
    const conteudo = pedido.conteudo_entregue || '_Nenhum conteúdo registrado._';
    const embed = new EmbedBuilder()
      .setColor(pedido.status === 'entregue' ? config.colors.success : config.colors.warning)
      .setTitle(`📄 Conteúdo Entregue — \`${pedido.id.slice(0,8).toUpperCase()}\``)
      .addFields(
        { name: '📦 Produto',   value: pedido.pnome,                                             inline: true },
        { name: '👤 Cliente',   value: `<@${pedido.usuario_id}>`,                                inline: true },
        { name: '📊 Status',    value: pedido.status.toUpperCase(),                              inline: true },
        { name: '💵 Valor',     value: `R$ ${Number(pedido.valor_total).toFixed(2)}`,            inline: true },
        { name: '🗓️ Entregue',  value: pedido.entregue_em ? `<t:${pedido.entregue_em}:f>` : '—',inline: true },
        { name: '💳 Método',    value: pedido.metodo_pag?.toUpperCase() || '—',                 inline: true },
      )
      .setTimestamp();
    if (conteudo.length <= 1000) {
      embed.addFields({ name: '🎁 Conteúdo', value: `\`\`\`\n${conteudo}\n\`\`\`` });
    } else {
      embed.addFields({ name: '🎁 Conteúdo', value: `\`\`\`\n${conteudo.slice(0, 900)}...\n\`\`\`` });
      embed.setFooter({ text: `Conteúdo truncado — total: ${conteudo.length} chars` });
    }
    const rowAcao = new ActionRowBuilder().addComponents(
      btn(`pa_forcar_entrega_${pedido.id}`, '🔄 Reenviar', ButtonStyle.Primary),
    );
    return interaction.editReply({ embeds: [embed], components: [rowAcao] });
  }

  // ─── Filtrar pedidos ──────────────────────────────────────────────────────
  if (id === 'pam_filtrar_pedidos') {
    await interaction.deferReply({ ephemeral: true });
    const discordId = interaction.fields.getTextInputValue('discord_id').trim();
    const status    = interaction.fields.getTextInputValue('status').trim().toLowerCase();
    const dias      = parseInt(interaction.fields.getTextInputValue('dias').trim()) || 0;

    let where = 'WHERE 1=1';
    const params = [];
    if (discordId) { where += ' AND p.usuario_id=?'; params.push(discordId); }
    if (status && ['pago','entregue','pendente','cancelado'].includes(status)) { where += ' AND p.status=?'; params.push(status); }
    if (dias > 0) { where += ' AND p.criado_em >= ?'; params.push(Math.floor(Date.now()/1000) - dias*86400); }

    const pedidos = db.prepare(`SELECT p.*, pr.nome as pnome FROM pedidos p JOIN produtos pr ON p.produto_id=pr.id ${where} ORDER BY p.criado_em DESC LIMIT 15`).all(...params);
    if (!pedidos.length) return interaction.editReply({ content: '🔎 Nenhum pedido encontrado com esses filtros.' });

    const statusEmoji = { pago:'✅', entregue:'📦', pendente:'⏳', cancelado:'❌' };
    const embed = new EmbedBuilder()
      .setColor(config.colors.info)
      .setTitle(`🔎 Pedidos Filtrados (${pedidos.length})`)
      .setDescription(discordId ? `Usuário: <@${discordId}>` : dias > 0 ? `Últimos **${dias}** dias` : `Status: **${status || 'todos'}**`)
      .setTimestamp();
    for (const p of pedidos) {
      const data = p.criado_em ? new Date(p.criado_em*1000).toLocaleDateString('pt-BR') : '—';
      embed.addFields({
        name:  `${statusEmoji[p.status]||'•'} ${p.pnome.slice(0,30)} — \`${p.id.slice(0,8)}\``,
        value: `<@${p.usuario_id}> • R$ ${Number(p.valor_total).toFixed(2)} • ${data}`,
        inline: false,
      });
    }
    return interaction.editReply({ embeds: [embed] });
  }

  // ─── Reenviar produto ─────────────────────────────────────────────────────
  if (id === 'pam_reenviar_produto') {
    await interaction.deferReply({ ephemeral: true });
    const busca  = interaction.fields.getTextInputValue('pedido_id').trim();
    const pedido = db.prepare("SELECT * FROM pedidos WHERE UPPER(SUBSTR(id,1,8))=UPPER(?) OR id LIKE ?").get(busca, `${busca}%`);
    if (!pedido) return interaction.editReply({ content: `❌ Pedido \`${busca}\` não encontrado.` });
    if (!['pago','entregue'].includes(pedido.status)) return interaction.editReply({ content: `⚠️ Pedido com status **${pedido.status}** — só é possível reenviar pedidos pagos.` });
    try {
      const { entregarProduto } = require('./loja');
      await entregarProduto(pedido, client);
      return interaction.editReply({ content: `✅ Produto reenviado para <@${pedido.usuario_id}>!` });
    } catch (err) {
      return interaction.editReply({ content: `❌ Erro ao reenviar: \`${err.message}\`` });
    }
  }

  // ─── Pausar/retomar produto ───────────────────────────────────────────────
  if (id === 'pam_pausar_produto') {
    await interaction.deferReply({ ephemeral: true });
    const busca   = interaction.fields.getTextInputValue('produto_id').trim();
    const produto = db.prepare("SELECT * FROM produtos WHERE UPPER(SUBSTR(id,1,8))=UPPER(?) OR id LIKE ?").get(busca, `${busca}%`);
    if (!produto) return interaction.editReply({ content: `❌ Produto \`${busca}\` não encontrado.` });
    const novoStatus = produto.ativo ? 0 : 1;
    db.prepare('UPDATE produtos SET ativo=? WHERE id=?').run(novoStatus, produto.id);
    const { atualizarPainelProduto } = require('./painelProduto');
    const paineis = db.prepare('SELECT * FROM paineis_canal WHERE produto_id=? AND ativo=1').all(produto.id);
    for (const p of paineis) await atualizarPainelProduto(interaction.guild, p.id).catch(() => {});
    return interaction.editReply({ content: `${novoStatus ? '✅ Produto **ativado**' : '⏸️ Produto **pausado**'}: **${produto.nome}**` });
  }

  // ─── Ver estoque da variante ──────────────────────────────────────────────
  if (id === 'pam_ver_estoque') {
    await interaction.deferReply({ ephemeral: true });
    const busca    = interaction.fields.getTextInputValue('variante_id').trim();
    const variante = db.prepare("SELECT * FROM variantes_produto WHERE UPPER(SUBSTR(id,1,8))=UPPER(?) OR id LIKE ?").get(busca, `${busca}%`);
    if (!variante) return interaction.editReply({ content: `❌ Variante \`${busca}\` não encontrada.` });
    const itens = db.prepare('SELECT * FROM estoque_variante WHERE variante_id=? AND usado=0 LIMIT 30').all(variante.id);
    const total = db.prepare('SELECT COUNT(*) as c FROM estoque_variante WHERE variante_id=? AND usado=0').get(variante.id).c;
    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle(`🔍 Estoque — ${variante.nome}`)
      .setDescription(itens.length
        ? itens.map((it, i) => `\`${String(i+1).padStart(2,'0')}\` ${it.conteudo.slice(0,80)}`).join('\n')
        : '_Sem itens disponíveis_')
      .addFields({ name: '📦 Total disponível', value: `**${total}** unidade(s)`, inline: true })
      .setFooter({ text: total > 30 ? `Mostrando 30 de ${total}` : `${total} item(s) total` })
      .setTimestamp();
    return interaction.editReply({ embeds: [embed] });
  }

  // ─── Histórico de compras do usuário ─────────────────────────────────────
  if (id === 'pam_historico_usuario') {
    await interaction.deferReply({ ephemeral: true });
    const discordId = interaction.fields.getTextInputValue('discord_id').trim();
    const usuario   = db.prepare('SELECT * FROM usuarios WHERE discord_id=?').get(discordId);
    if (!usuario) return interaction.editReply({ content: '❌ Usuário não encontrado no banco.' });
    const pedidos = db.prepare(`
      SELECT p.*, pr.nome as pnome FROM pedidos p
      JOIN produtos pr ON p.produto_id=pr.id
      WHERE p.usuario_id=? ORDER BY p.criado_em DESC LIMIT 15
    `).all(discordId);
    const embed = new EmbedBuilder()
      .setColor(config.colors.info)
      .setTitle(`📜 Histórico — ${usuario.nome || discordId}`)
      .addFields(
        { name: '🪙 Coins',        value: `**${(usuario.coins||0).toLocaleString('pt-BR')}**`,         inline: true },
        { name: '🛒 Compras',      value: `**${usuario.total_compras || 0}**`,                          inline: true },
        { name: '💵 Total gasto',  value: `**R$ ${Number(usuario.total_gasto||0).toFixed(2)}**`,        inline: true },
      )
      .setTimestamp();
    if (pedidos.length) {
      const statusEmoji = { pago:'✅', entregue:'📦', pendente:'⏳', cancelado:'❌' };
      const linhas = pedidos.map(p => {
        const data = p.pago_em ? new Date(p.pago_em*1000).toLocaleDateString('pt-BR') : '—';
        return `${statusEmoji[p.status]||'•'} **${p.pnome.slice(0,25)}** — R$ ${Number(p.valor_total).toFixed(2)} — ${data}`;
      });
      embed.setDescription(linhas.join('\n'));
    } else {
      embed.setDescription('_Nenhum pedido encontrado._');
    }
    const rowAcoes = new ActionRowBuilder().addComponents(
      btn(`pa_bloquear_${discordId}`, usuario.bloqueado ? '✅ Desbloquear' : '🚫 Bloquear', usuario.bloqueado ? ButtonStyle.Success : ButtonStyle.Danger),
    );
    return interaction.editReply({ embeds: [embed], components: [rowAcoes] });
  }

  // ─── Resetar compras do usuário ───────────────────────────────────────────
  if (id === 'pam_resetar_compras') {
    await interaction.deferReply({ ephemeral: true });
    const discordId = interaction.fields.getTextInputValue('discord_id').trim();
    const confirmar = interaction.fields.getTextInputValue('confirmar').trim().toUpperCase();
    if (confirmar !== 'CONFIRMAR') return interaction.editReply({ content: '❌ Digite exatamente **CONFIRMAR** para prosseguir.' });
    const u = db.prepare('SELECT * FROM usuarios WHERE discord_id=?').get(discordId);
    if (!u) return interaction.editReply({ content: '❌ Usuário não encontrado.' });
    db.prepare('UPDATE usuarios SET total_compras=0, total_gasto=0 WHERE discord_id=?').run(discordId);
    return interaction.editReply({ content: `✅ Contadores de <@${discordId}> resetados.\n> **total_compras** e **total_gasto** zerados.` });
  }

  // ─── Simulador de receita ─────────────────────────────────────────────────
  if (id === 'pam_simulador') {
    await interaction.deferReply({ ephemeral: true });
    const vendasDia  = parseFloat(interaction.fields.getTextInputValue('vendas_dia').trim());
    const ticketMed  = parseFloat(interaction.fields.getTextInputValue('ticket_medio').trim().replace(',','.'));
    const dias       = parseInt(interaction.fields.getTextInputValue('dias').trim());
    if (isNaN(vendasDia)||isNaN(ticketMed)||isNaN(dias)) return interaction.editReply({ content: '❌ Valores inválidos.' });

    const receitaBruta   = vendasDia * ticketMed * dias;

    // Taxa Stripe: 4,99% + R$0,39 por transação (BRL)
    const txStripe = receitaBruta * 0.0499 + (vendasDia * dias * 0.39);
    // Taxa PIX EFI: 0,99% por transação (sem taxa fixa)
    const txPix    = receitaBruta * 0.0099;
    // Estimativa 50% PIX / 50% Stripe
    const txMedia  = (txStripe + txPix) / 2;

    const liqStripe = receitaBruta - txStripe;
    const liqPix    = receitaBruta - txPix;
    const liqMedia  = receitaBruta - txMedia;

    const embed = new EmbedBuilder()
      .setColor(0x00D4AA)
      .setTitle('💡 Simulador de Receita')
      .addFields(
        { name: '📅 Período',         value: `**${dias}** dias`,                                   inline: true },
        { name: '🛒 Vendas/dia',      value: `**${vendasDia}**`,                                    inline: true },
        { name: '💵 Ticket médio',    value: `**R$ ${ticketMed.toFixed(2)}**`,                      inline: true },
        { name: '💰 Receita bruta',   value: `**R$ ${receitaBruta.toFixed(2)}**`,                   inline: false },
        { name: '💠 Líquido c/ PIX',  value: `R$ ${liqPix.toFixed(2)}\n*(taxa EFI ~0,99%)*`,        inline: true },
        { name: '💳 Líquido c/ Stripe',value:`R$ ${liqStripe.toFixed(2)}\n*(taxa ~4,99%+R$0,39)*`, inline: true },
        { name: '📊 Líquido médio',   value: `**R$ ${liqMedia.toFixed(2)}**\n*(mix 50/50)*`,        inline: true },
        { name: '📈 Proj. 7 dias',    value: `R$ ${(vendasDia * ticketMed * 7).toFixed(2)}`,        inline: true },
        { name: '📈 Proj. 30 dias',   value: `R$ ${(vendasDia * ticketMed * 30).toFixed(2)}`,       inline: true },
        { name: '📈 Proj. anual',     value: `**R$ ${(vendasDia * ticketMed * 365).toFixed(2)}**`,  inline: true },
      )
      .setFooter({ text: 'PIX via EFI Bank • Cartão via Stripe • Estimativas' })
      .setTimestamp();
    return interaction.editReply({ embeds: [embed] });
  }

  // ─── DM para compradores ──────────────────────────────────────────────────
  if (id === 'pam_dm_compradores') {
    await interaction.deferReply({ ephemeral: true });
    if (!isAdmin(interaction.member)) return interaction.editReply({ content: '❌ Apenas admins.' });
    const titulo    = interaction.fields.getTextInputValue('titulo').trim();
    const mensagem  = interaction.fields.getTextInputValue('mensagem').trim();
    const prodFiltro = interaction.fields.getTextInputValue('produto_id').trim();

    let query = "SELECT DISTINCT usuario_id FROM pedidos WHERE status IN ('pago','entregue')";
    const params = [];
    if (prodFiltro) {
      const prod = db.prepare("SELECT id FROM produtos WHERE UPPER(SUBSTR(id,1,8))=UPPER(?) OR id LIKE ?").get(prodFiltro, `${prodFiltro}%`);
      if (!prod) return interaction.editReply({ content: `❌ Produto \`${prodFiltro}\` não encontrado.` });
      query += ' AND produto_id=?';
      params.push(prod.id);
    }
    const destinatarios = db.prepare(query).all(...params);
    if (!destinatarios.length) return interaction.editReply({ content: '❌ Nenhum comprador encontrado.' });

    const embedMsg = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle(titulo)
      .setDescription(mensagem)
      .setFooter({ text: 'Máximo Store' })
      .setTimestamp();

    let enviados = 0, falhos = 0;
    for (const row of destinatarios) {
      try {
        const membro = await interaction.guild.members.fetch(row.usuario_id).catch(() => null);
        if (membro) { await membro.send({ embeds: [embedMsg] }); enviados++; }
        else falhos++;
      } catch { falhos++; }
      await new Promise(r => setTimeout(r, 400)); // rate limit
    }
    return interaction.editReply({ content: `✅ DM enviada para **${enviados}** comprador(es).\n❌ Falhou: **${falhos}** (DMs fechadas ou saíram do servidor).` });
  }

  // ─── Nota fiscal manual ───────────────────────────────────────────────────
  if (id === 'pam_nota_fiscal') {
    await interaction.deferReply({ ephemeral: true });
    const busca  = interaction.fields.getTextInputValue('pedido_id').trim();
    const pedido = db.prepare("SELECT p.*, pr.nome as pnome, u.nome as unome FROM pedidos p JOIN produtos pr ON p.produto_id=pr.id LEFT JOIN usuarios u ON p.usuario_id=u.discord_id WHERE UPPER(SUBSTR(p.id,1,8))=UPPER(?) OR p.id LIKE ?").get(busca, `${busca}%`);
    if (!pedido) return interaction.editReply({ content: `❌ Pedido \`${busca}\` não encontrado.` });

    const dataCompra = pedido.pago_em ? new Date(pedido.pago_em*1000).toLocaleString('pt-BR') : 'N/A';
    const nf = [
      '```',
      '════════════════════════════════════════',
      '          MÁXIMO STORE — NOTA FISCAL    ',
      '════════════════════════════════════════',
      `Pedido:    ${pedido.id.slice(0,8).toUpperCase()}`,
      `Data:      ${dataCompra}`,
      `Cliente:   ${pedido.unome || pedido.usuario_id}`,
      `Produto:   ${pedido.pnome}`,
      `Valor:     R$ ${Number(pedido.valor_total).toFixed(2)}`,
      `Status:    ${pedido.status.toUpperCase()}`,
      pedido.cupom_usado ? `Cupom:     ${pedido.cupom_usado}` : '',
      pedido.metodo_pag  ? `Pagamento: ${pedido.metodo_pag.toUpperCase()}` : '',
      '════════════════════════════════════════',
      '```',
    ].filter(Boolean).join('\n');

    // Enviar para o usuário no DM
    try {
      const membro = await interaction.guild.members.fetch(pedido.usuario_id).catch(() => null);
      if (membro) {
        await membro.send({
          embeds: [new EmbedBuilder().setColor(config.colors.success).setTitle('🧾 Nota Fiscal — Máximo Store').setDescription(nf).setTimestamp()],
        });
      }
    } catch {}

    return interaction.editReply({
      content: `✅ Nota fiscal gerada e enviada para <@${pedido.usuario_id}>!`,
      embeds: [new EmbedBuilder().setColor(config.colors.success).setTitle('🧾 Nota Fiscal').setDescription(nf).setTimestamp()],
    });
  }

  } catch (err) {
    console.error('[PainelAdminModals] Erro:', err.message, '| modal:', interaction.customId);
    const responder = interaction.deferred ? 'editReply' : 'reply';
    return interaction[responder]({ content: `❌ Erro: \`${err.message.slice(0, 200)}\``, ephemeral: true }).catch(() => {});
  }
}

// ─── Utilitário ───────────────────────────────────────────────────────────────
function btn(customId, label, style) {
  return new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style);
}
function mRow(input) {
  return new ActionRowBuilder().addComponents(input);
}

module.exports = {
  enviarPainelFixo,
  enviarPainelPublico2FA,
  atualizarPainelAdmin,
  handlePainelAdmin,
  handlePainelAdminModals,
  CANAL_PAINEL,
  CANAL_PAINEL_PUBLICO_2FA,
};
