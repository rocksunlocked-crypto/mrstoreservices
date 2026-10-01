/**
 * Sistema de Painel de Produto — tudo via botões + modais
 * Sem precisar de múltiplos comandos.
 */

const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  StringSelectMenuBuilder, AttachmentBuilder,
} = require('discord.js');
const axios  = require('axios');
const { db, Produtos } = require('../database/database');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');

// ─── Estado temporário de painéis em construção ───────────────────────────────
// Map: userId → { canalId, produtoId, titulo, descricao, imagemUrl, cor, variantes: [] }
const builders = new Map();

// ─── 1. Abrir o painel builder (responde ao /painel criar) ────────────────────
async function abrirPainelBuilder(interaction, canal) {
  await interaction.deferReply({ ephemeral: true });

  const estado = {
    canalId:   canal.id,
    produtoId: null,
    titulo:    '',
    descricao: '',
    imagemUrl: '',
    cor:       'FF6B6B',
    variantes: [],  // [{nome, preco, estoque, descricao}]
  };
  builders.set(interaction.user.id, estado);

  await interaction.editReply(buildBuilderEmbed(estado, canal));
}

// ─── Montar o embed do builder com os botões ─────────────────────────────────
function buildBuilderEmbed(estado, canalObj) {
  const temProduto  = estado.titulo !== '';
  const temVariante = estado.variantes.length > 0;

  const embed = new EmbedBuilder()
    .setColor(parseInt(estado.cor, 16) || config.colors.loja)
    .setTitle('🛠️ Construtor de Painel')
    .setDescription([
      `> Canal de destino: <#${estado.canalId}>`,
      '',
      `📦 **Produto:** ${estado.titulo || '❌ Não configurado'}`,
      estado.descricao ? `📝 ${estado.descricao}` : '',
      estado.imagemUrl ? `🖼️ Imagem configurada ✅` : `🖼️ Sem imagem`,
      '',
      temVariante
        ? `**Planos (${estado.variantes.length}):**\n` +
          estado.variantes.map((v, i) =>
            `${i + 1}. **${v.nome}** — R$ ${Number(v.preco).toFixed(2)} | Estoque: ${v.estoque == -1 ? '∞' : v.estoque}`
          ).join('\n')
        : '❌ Nenhum plano adicionado ainda',
    ].filter(Boolean).join('\n'))
    .setFooter({ text: 'Preencha todos os campos e clique em ✅ Publicar' })
    .setTimestamp();

  if (estado.imagemUrl) embed.setThumbnail(estado.imagemUrl);

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('pb_produto')
      .setLabel(temProduto ? '✏️ Editar Produto' : '📦 Configurar Produto')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('pb_imagem')
      .setLabel('🖼️ Imagem')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('pb_cor')
      .setLabel('🎨 Cor')
      .setStyle(ButtonStyle.Secondary),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('pb_add_plano')
      .setLabel('➕ Adicionar Plano')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('pb_rem_plano')
      .setLabel('➖ Remover Plano')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!temVariante),
    new ButtonBuilder()
      .setCustomId('pb_publicar')
      .setLabel('✅ Publicar Painel')
      .setStyle(ButtonStyle.Success)
      .setDisabled(!temProduto || !temVariante),
  );

  return { embeds: [embed], components: [row1, row2], ephemeral: true };
}

// ─── Handler central de todos os botões/modais do builder ────────────────────
async function handlePainelBuilder(interaction, client) {
  const id = interaction.customId;

  // ── Botão: configurar produto ─────────────────────────────────────────────
  if (id === 'pb_produto') {
    const modal = new ModalBuilder().setCustomId('pbm_produto').setTitle('📦 Configurar Produto');
    modal.addComponents(
      row(new TextInputBuilder().setCustomId('titulo').setLabel('Nome do Produto').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: Netflix Premium')),
      row(new TextInputBuilder().setCustomId('descricao').setLabel('Descrição (opcional)').setStyle(TextInputStyle.Paragraph).setRequired(false).setPlaceholder('Ex: Conta compartilhada, entrega automática...')),
    );
    return interaction.showModal(modal);
  }

  // ── Botão: imagem ─────────────────────────────────────────────────────────
  if (id === 'pb_imagem') {
    const modal = new ModalBuilder().setCustomId('pbm_imagem').setTitle('🖼️ Imagem do Produto');
    modal.addComponents(
      row(new TextInputBuilder().setCustomId('url').setLabel('URL da imagem').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('https://i.imgur.com/...')),
    );
    return interaction.showModal(modal);
  }

  // ── Botão: cor ────────────────────────────────────────────────────────────
  if (id === 'pb_cor') {
    const modal = new ModalBuilder().setCustomId('pbm_cor').setTitle('🎨 Cor do Embed');
    modal.addComponents(
      row(new TextInputBuilder().setCustomId('cor').setLabel('Cor HEX (sem #)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: FF6B6B ou 5865F2').setMinLength(6).setMaxLength(6)),
    );
    return interaction.showModal(modal);
  }

  // ── Botão: adicionar plano ────────────────────────────────────────────────
  if (id === 'pb_add_plano') {
    const estado = builders.get(interaction.user.id);
    if (!estado) return interaction.reply({ content: '❌ Sessão expirada. Use `/painel` novamente.', ephemeral: true });

    const modal = new ModalBuilder().setCustomId('pbm_add_plano').setTitle('➕ Adicionar Plano');
    modal.addComponents(
      row(new TextInputBuilder().setCustomId('nome').setLabel('Nome do Plano').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: Mensal, Trimestral, Vitalício')),
      row(new TextInputBuilder().setCustomId('preco').setLabel('Preço (R$)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: 29.90')),
      row(new TextInputBuilder().setCustomId('estoque').setLabel('Estoque (-1 = ilimitado)').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('-1').setValue('-1')),
      row(new TextInputBuilder().setCustomId('descricao').setLabel('Descrição do plano (opcional)').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('Ex: 30 dias de acesso')),
    );
    return interaction.showModal(modal);
  }

  // ── Botão: remover plano ──────────────────────────────────────────────────
  if (id === 'pb_rem_plano') {
    const estado = builders.get(interaction.user.id);
    if (!estado || !estado.variantes.length) return interaction.reply({ content: '❌ Nenhum plano para remover.', ephemeral: true });

    const options = estado.variantes.map((v, i) => ({
      label: `${v.nome} — R$ ${Number(v.preco).toFixed(2)}`,
      value: String(i),
    }));

    const row1 = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('pb_rem_plano_select')
        .setPlaceholder('Selecione o plano para remover')
        .addOptions(options),
    );
    return interaction.reply({ content: '🗑️ Qual plano deseja remover?', components: [row1], ephemeral: true });
  }

  // ── Select: confirmar remoção de plano ────────────────────────────────────
  if (id === 'pb_rem_plano_select') {
    const estado = builders.get(interaction.user.id);
    if (!estado) return interaction.reply({ content: '❌ Sessão expirada.', ephemeral: true });
    const idx = parseInt(interaction.values[0]);
    const removido = estado.variantes.splice(idx, 1)[0];
    await interaction.reply({ content: `✅ Plano **${removido.nome}** removido.`, ephemeral: true });
    return atualizarBuilder(interaction, estado);
  }

  // ── Botão: publicar ───────────────────────────────────────────────────────
  if (id === 'pb_publicar') {
    const estado = builders.get(interaction.user.id);
    if (!estado) return interaction.reply({ content: '❌ Sessão expirada. Use `/painel` novamente.', ephemeral: true });
    await interaction.deferReply({ ephemeral: true });
    await publicarPainel(interaction, estado, client);
    builders.delete(interaction.user.id);
    return;
  }
}

// ─── Handler de modais do builder ────────────────────────────────────────────
async function handlePainelModals(interaction) {
  const id = interaction.customId;

  // ── Modal: produto ────────────────────────────────────────────────────────
  if (id === 'pbm_produto') {
    const estado = builders.get(interaction.user.id);
    if (!estado) return interaction.reply({ content: '❌ Sessão expirada. Use `/painel` novamente.', ephemeral: true });

    estado.titulo    = interaction.fields.getTextInputValue('titulo').trim();
    estado.descricao = interaction.fields.getTextInputValue('descricao').trim();
    await interaction.deferUpdate().catch(() => {});
    return atualizarBuilder(interaction, estado);
  }

  // ── Modal: imagem ─────────────────────────────────────────────────────────
  if (id === 'pbm_imagem') {
    const estado = builders.get(interaction.user.id);
    if (!estado) return interaction.reply({ content: '❌ Sessão expirada.', ephemeral: true });

    estado.imagemUrl = interaction.fields.getTextInputValue('url').trim();
    await interaction.deferUpdate().catch(() => {});
    return atualizarBuilder(interaction, estado);
  }

  // ── Modal: cor ────────────────────────────────────────────────────────────
  if (id === 'pbm_cor') {
    const estado = builders.get(interaction.user.id);
    if (!estado) return interaction.reply({ content: '❌ Sessão expirada.', ephemeral: true });

    estado.cor = interaction.fields.getTextInputValue('cor').trim().replace('#', '');
    await interaction.deferUpdate().catch(() => {});
    return atualizarBuilder(interaction, estado);
  }

  // ── Modal: adicionar plano ────────────────────────────────────────────────
  if (id === 'pbm_add_plano') {
    const estado = builders.get(interaction.user.id);
    if (!estado) return interaction.reply({ content: '❌ Sessão expirada.', ephemeral: true });

    const nome     = interaction.fields.getTextInputValue('nome').trim();
    const precoStr = interaction.fields.getTextInputValue('preco').trim().replace(',', '.');
    const estStr   = interaction.fields.getTextInputValue('estoque').trim() || '-1';
    const desc     = interaction.fields.getTextInputValue('descricao').trim();

    const preco    = parseFloat(precoStr);
    const estoque  = parseInt(estStr);

    if (isNaN(preco) || preco <= 0) {
      return interaction.reply({ content: '❌ Preço inválido. Use números (ex: 29.90)', ephemeral: true });
    }

    estado.variantes.push({ nome, preco, estoque: isNaN(estoque) ? -1 : estoque, descricao: desc });
    await interaction.deferUpdate().catch(() => {});
    return atualizarBuilder(interaction, estado);
  }
}

// ─── Atualizar o embed do builder ─────────────────────────────────────────────
async function atualizarBuilder(interaction, estado) {
  try {
    const payload = buildBuilderEmbed(estado, { id: estado.canalId });
    if (interaction.replied || interaction.deferred) {
      await interaction.editReply(payload);
    } else {
      await interaction.update(payload);
    }
  } catch {}
}

// ─── Publicar o painel fixo no canal ─────────────────────────────────────────
async function publicarPainel(interaction, estado, client) {
  const guild = interaction.guild;
  const canal = guild.channels.cache.get(estado.canalId);
  if (!canal) return interaction.editReply({ content: '❌ Canal não encontrado.' });

  // Criar produto no banco
  const produtoId = uuidv4();
  db.prepare(`
    INSERT INTO produtos (id, nome, descricao, preco, imagem_url, tipo, ativo, criado_por)
    VALUES (?,?,?,?,?,?,1,?)
  `).run(produtoId, estado.titulo, estado.descricao, 0, estado.imagemUrl || null, 'digital', interaction.user.id);

  // Criar variantes no banco
  for (let i = 0; i < estado.variantes.length; i++) {
    const v = estado.variantes[i];
    db.prepare(`
      INSERT INTO variantes_produto (id, produto_id, nome, descricao, preco, estoque, ordem)
      VALUES (?,?,?,?,?,?,?)
    `).run(uuidv4(), produtoId, v.nome, v.descricao, v.preco, v.estoque, i + 1);
  }

  // Criar registro do painel
  const painelId = uuidv4();
  db.prepare(`
    INSERT INTO paineis_canal (id, canal_id, produto_id, titulo, descricao, cor, imagem_url, criado_por)
    VALUES (?,?,?,?,?,?,?,?)
  `).run(painelId, canal.id, produtoId, estado.titulo, estado.descricao, estado.cor, estado.imagemUrl || null, interaction.user.id);

  // Montar embed final
  const variantes = db.prepare('SELECT * FROM variantes_produto WHERE produto_id=? AND ativo=1 ORDER BY ordem ASC').all(produtoId);
  const cor       = parseInt(estado.cor, 16) || config.colors.loja;

  const embed = new EmbedBuilder()
    .setColor(cor)
    .setTitle(`🛍️ ${estado.titulo}`)
    .setTimestamp()
    .setFooter({ text: 'Máximo Store • Selecione um plano para comprar' });

  if (estado.descricao) {
    const descFmt = estado.descricao.split('\n').map(l => l.startsWith('>') ? l : `> ${l}`).join('\n');
    embed.setDescription(descFmt);
  } else embed.setDescription('> Selecione um plano abaixo para comprar.');
  if (estado.imagemUrl) embed.setImage(estado.imagemUrl);

  const components = montarComponentes(variantes, painelId);
  const payload = { embeds: [embed], components };

  const msg = await canal.send(payload);

  // Salvar ID da mensagem
  db.prepare('UPDATE paineis_canal SET mensagem_id=? WHERE id=?').run(msg.id, painelId);

  await interaction.editReply({
    content: [
      `✅ **Painel publicado em** <#${canal.id}>!`,
      `📦 Produto: **${estado.titulo}**`,
      `🎯 **${variantes.length}** plano(s) criado(s)`,
      '',
      `**Para adicionar estoque digital** use:`,
      `\`/painel estoque\` e informe o ID da variante`,
      `*(use \`/painel listar produto_id:${produtoId.slice(0,8)}\` para ver os IDs)*`,
    ].join('\n'),
  });
}

// ─── Montar componentes do painel publicado ───────────────────────────────────
// ─── Helper: truncar texto para Discord (sem remover chars especiais) ────────
function sanitizar(str, max = 100) {
  return (str || '').trim().slice(0, max) || '?';
}

// ─── Verificar flash sale ativa para um produto ───────────────────────────────
function getFlashSale(produtoId) {
  try {
    const { flashSalesAtivas } = require('./flashsale');
    return flashSalesAtivas?.get(produtoId) || null;
  } catch { return null; }
}

// ─── Montar componentes do painel publicado ───────────────────────────────────
function montarComponentes(variantes, painelId) {
  if (!variantes.length) return [];

  const produtoId = variantes[0]?.produto_id;
  const produto   = produtoId ? db.prepare('SELECT nome, tipo FROM produtos WHERE id=?').get(produtoId) : null;
  const isCoins   = produto?.nome?.toLowerCase().includes('coin') || produto?.tipo === 'coins';
  const fs        = getFlashSale(produtoId);

  const options = variantes.slice(0, 25).map(v => {
    const qtd        = isCoins ? null : (db.prepare('SELECT COUNT(*) as c FROM estoque_variante WHERE variante_id=? AND usado=0').get(v.id)?.c || 0);
    const temEstoque = isCoins || qtd > 0;

    // Preço com flash sale aplicado
    const precoBase = Number(v.preco);
    const precoFS   = fs ? parseFloat((precoBase * (1 - fs.desconto / 100)).toFixed(2)) : null;
    const precoStr  = precoFS
      ? `R$ ${precoFS.toFixed(2)} 🔥`
      : `R$ ${precoBase.toFixed(2)}`;

    // Emoji de status
    const statusEmoji = !temEstoque ? '❌' : qtd <= 3 ? '⚠️' : '✅';
    const nome = sanitizar(v.nome, 80 - precoStr.length) || 'Plano';
    const label = `${statusEmoji} ${nome} — ${precoStr}`.slice(0, 100);

    // Description: estoque + desconto se flash sale
    let desc;
    if (isCoins) {
      desc = '🪙 Entrega automática';
    } else if (!temEstoque) {
      desc = '❌ Sem estoque disponível';
    } else {
      const descCustom = v.descricao ? sanitizar(v.descricao, 40) : null;
      const estoqueStr = qtd <= 5 ? `⚠️ Últimas ${qtd} un.` : `📦 ${qtd} disponíveis`;
      const fsStr      = precoFS ? ` • era R$ ${precoBase.toFixed(2)}` : '';
      desc = descCustom
        ? `${descCustom} • ${estoqueStr}${fsStr}`
        : `${estoqueStr}${fsStr}`;
    }

    return { label, description: desc.slice(0, 100), value: v.id };
  });

  return [{ type: 1, components: [{
    type: 3,
    custom_id: `painel_selecionar_${painelId}`,
    placeholder: '🛒 Selecione um plano para comprar',
    options,
    min_values: 1,
    max_values: 1,
  }]}];
}

// ─── Atualizar painel após mudança de estoque ─────────────────────────────────
async function atualizarPainelProduto(guild, painelId) {
  try {
    const painel = db.prepare('SELECT * FROM paineis_canal WHERE id=?').get(painelId);
    if (!painel?.mensagem_id) return;

    const produto = db.prepare('SELECT * FROM produtos WHERE id=?').get(painel.produto_id);
    if (!produto) return;

    const variantes = db.prepare('SELECT * FROM variantes_produto WHERE produto_id=? AND ativo=1 ORDER BY ordem ASC').all(painel.produto_id);
    console.log(`[PainelProduto] Atualizando ${painelId.slice(0,8)} — ${produto.nome} — ${variantes.length} variante(s)`);

    const canal = guild.channels.cache.get(painel.canal_id);
    if (!canal) return;

    const msg = await canal.messages.fetch(painel.mensagem_id);

    const cor = parseInt(painel.cor || 'FF6B6B', 16);
    const isCoins = produto?.nome?.toLowerCase().includes('coin') || produto?.tipo === 'coins';

    // Imagem: URL salva no banco ou URL externa (não attachment expirado)
    const imagemBanco    = painel.imagem_url || null;
    const embedOriginal  = msg.embeds[0];
    const imagemOriginal = embedOriginal?.image?.url || null;
    const imagemCDN      = imagemOriginal &&
      !imagemOriginal.includes('cdn.discordapp.com/attachments') &&
      !imagemOriginal.includes('media.discordapp.net/attachments')
      ? imagemOriginal : null;
    const imagemValida = imagemBanco || imagemCDN;

    // Thumbnail: usa imagem do produto se disponível, senão thumbnail do painel, senão padrão
    const thumbnailProduto = produto.thumbnail_url || painel.thumbnail_url || null;
    const THUMBNAIL_PADRAO = 'https://i.imgur.com/YyHI49C.jpeg';
    const thumbnailUrl = thumbnailProduto || THUMBNAIL_PADRAO;

    // Flash sale ativa para este produto?
    const fs = getFlashSale(painel.produto_id);

    // Verificar se TODAS as variantes estão sem estoque
    const totalEstoque = db.prepare(`
      SELECT COUNT(*) as c FROM estoque_variante ev
      JOIN variantes_produto vp ON ev.variante_id = vp.id
      WHERE vp.produto_id=? AND ev.usado=0 AND vp.ativo=1
    `).get(painel.produto_id).c;
    const semEstoque = totalEstoque === 0 && variantes.length > 0;

    // Formatar descrição
    const descricaoBruta = painel.descricao || 'Selecione um plano abaixo para comprar.';
    const descricaoFormatada = descricaoBruta
      .split('\n')
      .map(linha => linha.startsWith('>') ? linha : `> ${linha}`)
      .join('\n')
      .slice(0, 4096);

    // Montar embed
    const corFinal = semEstoque ? 0x95A5A6  // cinza quando sem estoque
                   : fs         ? 0xFF4757  // vermelho flash sale
                   : isNaN(cor) ? 0xFF6B6B
                   : cor;

    let tituloFinal = `🛍️ ${(painel.titulo || produto.nome || 'Produto').slice(0, 256)}`;
    if (fs)         tituloFinal = `⚡ FLASH SALE — ${tituloFinal}`;
    if (semEstoque) tituloFinal = `🔴 ${(painel.titulo || produto.nome || 'Produto').slice(0, 256)}`;

    const embedData = {
      color:       corFinal,
      title:       tituloFinal,
      description: semEstoque
        ? `> ❌ **Produto temporariamente sem estoque.**\n> Acompanhe nossas redes para saber quando voltará!\n\n${descricaoFormatada}`
        : fs
          ? `> ⚡ **OFERTA RELÂMPAGO — ${fs.desconto}% OFF!**\n> Termina <t:${Math.floor(fs.expira/1000)}:R>\n\n${descricaoFormatada}`
          : descricaoFormatada,
      timestamp:   new Date().toISOString(),
      footer:      { text: 'Máximo Store • Selecione um plano para comprar' },
      thumbnail:   { url: thumbnailUrl },
    };
    if (imagemValida) embedData.image = { url: imagemValida };

    // Footer com data da última atualização de estoque
    const ultimaAtt = db.prepare('SELECT MAX(estoque_atualizado_em) as dt FROM variantes_produto WHERE produto_id=? AND ativo=1').get(painel.produto_id);
    if (ultimaAtt?.dt) {
      const dataAtt = new Date(ultimaAtt.dt * 1000).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit', timeZone:'America/Sao_Paulo' });
      embedData.footer = { text: `Máximo Store • Estoque atualizado em ${dataAtt}` };
    }

    const components = montarComponentes(variantes, painelId);
    console.log(`[PainelProduto] Enviando — title="${embedData.title.slice(0,30)}" components=${components.length}`);

    // Serializar components (ActionRowBuilder → JSON, ou já é JSON raw)
    const componentsJSON = components.map(c => c?.toJSON ? c.toJSON() : c);

    await msg.edit({ embeds: [embedData], components: componentsJSON, attachments: [] });
    console.log(`[PainelProduto] Edit OK ✅`);
  } catch (err) {
    console.error('[PainelProduto] Erro ao atualizar:', err.message);
    if (err.rawError) console.error('[PainelProduto] Raw:', JSON.stringify(err.rawError));
    if (err.stack)    console.error('[PainelProduto] Stack:', err.stack.split('\n').slice(0,3).join(' | '));
  }
}

// ─── Utilitário ───────────────────────────────────────────────────────────────
function row(input) {
  return new ActionRowBuilder().addComponents(input);
}

// ─── Entregar item de variante após pagamento ─────────────────────────────────
function pegarItemVariante(varianteId, usuarioId, pedidoId) {
  const item = db.prepare('SELECT * FROM estoque_variante WHERE variante_id=? AND usado=0 LIMIT 1').get(varianteId);
  if (!item) return null;
  db.prepare("UPDATE estoque_variante SET usado=1, usado_por=?, pedido_id=?, usado_em=strftime('%s','now') WHERE id=?")
    .run(usuarioId, pedidoId, item.id);
  const restante = db.prepare('SELECT COUNT(*) as c FROM estoque_variante WHERE variante_id=? AND usado=0').get(varianteId).c;
  db.prepare('UPDATE variantes_produto SET estoque=? WHERE id=?').run(restante, varianteId);

  // Alerta de estoque zerado ou baixo
  if (restante === 0 || restante <= 2) {
    try {
      const { log } = require('../utils/logger');
      const variante = db.prepare('SELECT * FROM variantes_produto WHERE id=?').get(varianteId);
      const produto  = variante ? db.prepare('SELECT nome FROM produtos WHERE id=?').get(variante.produto_id) : null;
      const nivel = restante === 0 ? '🚨 ZERADO' : `⚠️ BAIXO (${restante})`;
      log('estoque_baixo', {
        produto:   produto?.nome || '?',
        descricao: `${nivel} — **${produto?.nome || '?'}** — Plano: **${variante?.nome || '?'}** — ${restante} restante(s)`,
      }).catch(() => {});
    } catch {}
  }

  // Atualizar painel do produto para refletir novo estoque no select menu
  try {
    const varianteRow = db.prepare('SELECT produto_id FROM variantes_produto WHERE id=?').get(varianteId);
    if (varianteRow) {
      const paineis = db.prepare('SELECT * FROM paineis_canal WHERE produto_id=? AND ativo=1').all(varianteRow.produto_id);
      setImmediate(async () => {
        const { getClient } = require('../utils/logger');
        const c = getClient();
        const guild = c?.guilds?.cache?.first();
        if (!guild) return;
        for (const p of paineis) {
          await atualizarPainelProduto(guild, p.id).catch(() => {});
        }
      });
    }
  } catch {}

  return item.conteudo;
}

module.exports = {
  abrirPainelBuilder,
  handlePainelBuilder,
  handlePainelModals,
  atualizarPainelProduto,
  montarComponentes,
  pegarItemVariante,
};
