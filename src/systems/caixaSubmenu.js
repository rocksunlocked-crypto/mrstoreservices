/**
 * Submenu interativo de Caixa Misteriosa — versão completa
 * Funcionalidades:
 *  1. Criar caixa (nome, preço, canal, imagem, descrição)
 *  2. Editar caixa existente
 *  3. Add Item — seleção com select menu, raridade por select (sem digitar)
 *  4. Listar itens da caixa com ações (editar raridade/chance, remover, toggle)
 *  5. Editar item existente (raridade + chance)
 */

const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
} = require('discord.js');
const { db }         = require('../database/database');
const { v4: uuidv4 } = require('uuid');
const config         = require('../config');

const RARIDADES = {
  comum:    { label: 'Comum',    emoji: '⚪', cor: 0x95A5A6, stars: '⭐' },
  raro:     { label: 'Raro',     emoji: '🔵', cor: 0x3498DB, stars: '⭐⭐' },
  epico:    { label: 'Épico',    emoji: '🟣', cor: 0x9B59B6, stars: '⭐⭐⭐' },
  lendario: { label: 'Lendário', emoji: '🌟', cor: 0xF1C40F, stars: '⭐⭐⭐⭐' },
  mitico:   { label: 'Mítico',   emoji: '🔴', cor: 0xFF0000, stars: '⭐⭐⭐⭐⭐' },
};

// ─── Estado em memória ────────────────────────────────────────────────────────
const sessoes = new Map();
function nova(userId, tipo, dados = {}) {
  const s = { tipo, ...dados };
  sessoes.set(`cx_${tipo}_${userId}`, s);
  const t = setTimeout(() => sessoes.delete(`cx_${tipo}_${userId}`), 30 * 60 * 1000);
  t.unref?.();
  return s;
}
function get(userId, tipo) { return sessoes.get(`cx_${tipo}_${userId}`) || null; }
function set(userId, tipo, patch) { const s = get(userId, tipo); if (s) Object.assign(s, patch); }
function del(userId, tipo) { sessoes.delete(`cx_${tipo}_${userId}`); }

// ══════════════════════════════════════════════════════════════════════════════
// 1. CRIAR / EDITAR CAIXA
// ══════════════════════════════════════════════════════════════════════════════

function buildCriarEmbed(s) {
  const ok    = v => v ? '🟢' : '🔴';
  const modo  = s.editando ? '✏️ Editar Caixa' : '🎁 Criar Caixa Misteriosa';
  const embed = new EmbedBuilder()
    .setColor(0xFFD700)
    .setTitle(modo)
    .addFields(
      { name: `${ok(s.nome)} Nome`,       value: s.nome    ? `\`${s.nome}\``                         : '`não definido`',  inline: true },
      { name: `${ok(s.preco)} Preço`,     value: s.preco   ? `R$ ${Number(s.preco).toFixed(2)}`       : '`não definido`',  inline: true },
      { name: `${ok(s.canalId)} Canal`,   value: s.canalId ? `<#${s.canalId}>`                        : '`não definido`',  inline: true },
      { name: `${ok(s.descricao)} Desc.`, value: s.descricao ? s.descricao.slice(0, 50)               : '`opcional`',      inline: true },
      { name: `${ok(s.imagemUrl)} Img`,   value: s.imagemUrl ? '`URL configurada ✅`'                 : '`opcional`',      inline: true },
    )
    .setDescription(`> Preencha os campos e clique em **${s.editando ? '💾 Salvar' : '🚀 Criar'}** quando terminar.`)
    .setTimestamp()
    .setFooter({ text: 'Máximo Store • Nome, Preço e Canal são obrigatórios' });
  if (s.imagemUrl) embed.setThumbnail(s.imagemUrl);
  return embed;
}

function buildCriarRows(s) {
  const pode = !!(s.nome && s.preco && s.canalId);
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('cxc_nome').setLabel('✏️ Nome e Preço').setStyle(s.nome ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('cxc_canal').setLabel('📡 Canal').setStyle(s.canalId ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('cxc_desc').setLabel('📝 Descrição').setStyle(s.descricao ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('cxc_img').setLabel('🖼️ Imagem').setStyle(s.imagemUrl ? ButtonStyle.Success : ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('cxc_salvar').setLabel(s.editando ? '💾 Salvar Alterações' : '🚀 Criar Caixa').setStyle(ButtonStyle.Primary).setDisabled(!pode),
      new ButtonBuilder().setCustomId('cxc_cancelar').setLabel('🗑️ Cancelar').setStyle(ButtonStyle.Danger),
    ),
  ];
}

async function abrirCriar(interaction) {
  nova(interaction.user.id, 'criar');
  await interaction.deferReply({ ephemeral: true });
  const s = get(interaction.user.id, 'criar');
  await interaction.editReply({ embeds: [buildCriarEmbed(s)], components: buildCriarRows(s) });
}

async function abrirEditar(interaction, caixaId) {
  const caixa = db.prepare('SELECT * FROM caixa_config WHERE id=?').get(caixaId);
  if (!caixa) return interaction.reply({ content: '❌ Caixa não encontrada.', ephemeral: true });
  nova(interaction.user.id, 'criar', {
    editando: true,
    caixaId:  caixa.id,
    nome:     caixa.nome,
    preco:    caixa.preco,
    canalId:  caixa.canal_id,
    descricao: caixa.descricao,
    imagemUrl: caixa.imagem_url,
  });
  await interaction.deferReply({ ephemeral: true });
  const s = get(interaction.user.id, 'criar');
  await interaction.editReply({ embeds: [buildCriarEmbed(s)], components: buildCriarRows(s) });
}

async function rerenderCriar(interaction) {
  const s = get(interaction.user.id, 'criar');
  if (!s) return interaction.reply({ content: '❌ Sessão expirada.', ephemeral: true });
  await interaction.update({ embeds: [buildCriarEmbed(s)], components: buildCriarRows(s) }).catch(() =>
    interaction.editReply({ embeds: [buildCriarEmbed(s)], components: buildCriarRows(s) }));
}

async function criarModalNome(interaction) {
  const s = get(interaction.user.id, 'criar');
  const modal = new ModalBuilder().setCustomId('cxm_nome').setTitle('✏️ Nome e Preço');
  modal.addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('nome').setLabel('Nome da caixa').setStyle(TextInputStyle.Short).setRequired(true).setValue(s?.nome || '').setPlaceholder('Ex: Caixa Premium')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('preco').setLabel('Preço (R$)').setStyle(TextInputStyle.Short).setRequired(true).setValue(s?.preco ? String(s.preco) : '').setPlaceholder('Ex: 5.00')),
  );
  return interaction.showModal(modal);
}

async function criarModalCanal(interaction) {
  const s = get(interaction.user.id, 'criar');
  const modal = new ModalBuilder().setCustomId('cxm_canal').setTitle('📡 Canal');
  modal.addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('canal_id').setLabel('ID do Canal').setStyle(TextInputStyle.Short).setRequired(true).setValue(s?.canalId || '').setPlaceholder('Ex: 1544832050924756993')),
  );
  return interaction.showModal(modal);
}

async function criarModalDesc(interaction) {
  const s = get(interaction.user.id, 'criar');
  const modal = new ModalBuilder().setCustomId('cxm_desc').setTitle('📝 Descrição');
  modal.addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('descricao').setLabel('Descrição (opcional)').setStyle(TextInputStyle.Paragraph).setRequired(false).setValue(s?.descricao || '')),
  );
  return interaction.showModal(modal);
}

async function criarModalImg(interaction) {
  const s = get(interaction.user.id, 'criar');
  const modal = new ModalBuilder().setCustomId('cxm_img').setTitle('🖼️ Imagem');
  modal.addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('imagem').setLabel('URL da imagem ou GIF').setStyle(TextInputStyle.Short).setRequired(false).setValue(s?.imagemUrl || '').setPlaceholder('https://...')),
  );
  return interaction.showModal(modal);
}

async function criarProcessarNome(interaction) {
  const nome  = interaction.fields.getTextInputValue('nome').trim();
  const preco = parseFloat(interaction.fields.getTextInputValue('preco').trim().replace(',', '.'));
  if (isNaN(preco) || preco <= 0) return interaction.reply({ content: '❌ Preço inválido.', ephemeral: true });
  set(interaction.user.id, 'criar', { nome, preco });
  return rerenderCriar(interaction);
}

async function criarProcessarCanal(interaction) {
  const canalId = interaction.fields.getTextInputValue('canal_id').trim();
  const canal   = interaction.guild.channels.cache.get(canalId);
  if (!canal) return interaction.reply({ content: `❌ Canal \`${canalId}\` não encontrado.`, ephemeral: true });
  set(interaction.user.id, 'criar', { canalId });
  return rerenderCriar(interaction);
}

async function criarProcessarDesc(interaction) {
  set(interaction.user.id, 'criar', { descricao: interaction.fields.getTextInputValue('descricao').trim() || null });
  return rerenderCriar(interaction);
}

async function criarProcessarImg(interaction) {
  const imagem = interaction.fields.getTextInputValue('imagem').trim();
  if (imagem) { try { new URL(imagem); } catch { return interaction.reply({ content: '❌ URL inválida.', ephemeral: true }); } }
  set(interaction.user.id, 'criar', { imagemUrl: imagem || null });
  return rerenderCriar(interaction);
}

async function criarSalvar(interaction) {
  await interaction.deferUpdate().catch(() => {});
  const s = get(interaction.user.id, 'criar');
  if (!s?.nome || !s?.preco || !s?.canalId) return;

  if (s.editando && s.caixaId) {
    // Atualizar caixa existente
    db.prepare('UPDATE caixa_config SET nome=?, descricao=?, preco=?, canal_id=?, imagem_url=? WHERE id=?')
      .run(s.nome, s.descricao || null, s.preco, s.canalId, s.imagemUrl || null, s.caixaId);
    del(interaction.user.id, 'criar');
    return interaction.editReply({
      embeds: [new EmbedBuilder().setColor(config.colors.success).setTitle('✅ Caixa Atualizada!')
        .addFields(
          { name: '🎁 Nome',  value: s.nome,                             inline: true },
          { name: '💵 Preço', value: `R$ ${Number(s.preco).toFixed(2)}`, inline: true },
          { name: '📡 Canal', value: `<#${s.canalId}>`,                  inline: true },
        )
        .setTimestamp()],
      components: [],
    });
  }

  // Criar nova caixa
  const id = uuidv4();
  db.prepare('INSERT INTO caixa_config (id,nome,descricao,preco,canal_id,imagem_url,ativa) VALUES (?,?,?,?,?,?,1)')
    .run(id, s.nome, s.descricao || null, s.preco, s.canalId, s.imagemUrl || null);
  del(interaction.user.id, 'criar');
  await interaction.editReply({
    embeds: [new EmbedBuilder().setColor(config.colors.success).setTitle('✅ Caixa Criada!')
      .addFields(
        { name: '🎁 Nome',  value: s.nome,                             inline: true },
        { name: '💵 Preço', value: `R$ ${Number(s.preco).toFixed(2)}`, inline: true },
        { name: '📡 Canal', value: `<#${s.canalId}>`,                  inline: true },
        { name: '🆔 ID',    value: `\`${id.slice(0,8)}\``,             inline: false },
      )
      .setDescription('> Use **🎯 Add Item** para adicionar prêmios.\n> Use **📢 Publicar** para enviar o embed no canal.')
      .setTimestamp()],
    components: [],
  });
}

async function criarCancelar(interaction) {
  del(interaction.user.id, 'criar');
  await interaction.update({ embeds: [new EmbedBuilder().setColor(config.colors.error).setTitle('❌ Cancelado').setTimestamp()], components: [] });
}

// ══════════════════════════════════════════════════════════════════════════════
// 2. ADD / EDITAR ITEM
// ══════════════════════════════════════════════════════════════════════════════

function buildItemEmbed(s) {
  const ok     = v => v ? '🟢' : '🔴';
  const rarInfo = s.raridade ? RARIDADES[s.raridade] : null;
  const titulo = s.editandoItemId ? '✏️ Editar Item da Caixa' : '🎯 Adicionar Item à Caixa';
  return new EmbedBuilder()
    .setColor(rarInfo?.cor || 0xFFD700)
    .setTitle(titulo)
    .addFields(
      { name: `${ok(s.caixaId)} Caixa`,     value: s.caixaNome    ? `\`${s.caixaNome}\``    : '`não selecionada`',  inline: true },
      { name: `${ok(s.varianteId)} Produto`, value: s.varianteNome ? `\`${s.varianteNome}\`` : '`não selecionado`',  inline: true },
      { name: `${ok(s.raridade)} Raridade`,  value: rarInfo        ? `${rarInfo.emoji} ${rarInfo.label} ${rarInfo.stars}` : '`não definida`', inline: true },
      { name: `${ok(s.chance)} Chance`,      value: s.chance       ? `**${s.chance}%**`       : '`não definida`',    inline: true },
    )
    .setDescription('> Configure todos os campos abaixo.')
    .setTimestamp()
    .setFooter({ text: 'Máximo Store • Todos os campos são obrigatórios' });
}

function buildItemRows(s) {
  const pode = !!(s.caixaId && s.varianteId && s.raridade && s.chance);
  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('cxi_caixa').setLabel('🎁 Caixa').setStyle(s.caixaId ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('cxi_variante').setLabel('📦 Produto').setStyle(s.varianteId ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('cxi_raridade').setLabel('⭐ Raridade').setStyle(s.raridade ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('cxi_chance').setLabel('🎲 Chance %').setStyle(s.chance ? ButtonStyle.Success : ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('cxi_salvar').setLabel(s.editandoItemId ? '💾 Salvar Edição' : '✅ Adicionar Item').setStyle(ButtonStyle.Primary).setDisabled(!pode),
      new ButtonBuilder().setCustomId('cxi_cancelar').setLabel('🗑️ Cancelar').setStyle(ButtonStyle.Danger),
    ),
  ];
  return rows;
}

async function abrirItem(interaction) {
  nova(interaction.user.id, 'item');
  await interaction.deferReply({ ephemeral: true });
  const s = get(interaction.user.id, 'item');
  await interaction.editReply({ embeds: [buildItemEmbed(s)], components: buildItemRows(s) });
}

async function abrirEditarItem(interaction, itemId) {
  const item = db.prepare(`
    SELECT ci.*, vp.nome as v_nome, pr.nome as p_nome, cc.nome as c_nome
    FROM caixa_itens_config ci
    JOIN variantes_produto vp ON ci.variante_id=vp.id
    JOIN produtos pr ON vp.produto_id=pr.id
    JOIN caixa_config cc ON ci.caixa_id=cc.id
    WHERE ci.id=?
  `).get(itemId);
  if (!item) return interaction.reply({ content: '❌ Item não encontrado.', ephemeral: true });
  nova(interaction.user.id, 'item', {
    editandoItemId: item.id,
    caixaId:        item.caixa_id,
    caixaNome:      item.c_nome,
    varianteId:     item.variante_id,
    varianteNome:   `${item.p_nome} — ${item.v_nome}`,
    raridade:       item.raridade,
    chance:         item.chance,
  });
  await interaction.deferReply({ ephemeral: true });
  const s = get(interaction.user.id, 'item');
  await interaction.editReply({ embeds: [buildItemEmbed(s)], components: buildItemRows(s) });
}

async function rerenderItem(interaction) {
  const s = get(interaction.user.id, 'item');
  if (!s) return interaction.reply({ content: '❌ Sessão expirada.', ephemeral: true });
  await interaction.update({ embeds: [buildItemEmbed(s)], components: buildItemRows(s) }).catch(() =>
    interaction.editReply({ embeds: [buildItemEmbed(s)], components: buildItemRows(s) }));
}

// ─── Selecionar caixa ────────────────────────────────────────────────────────
async function itemSelecionarCaixa(interaction) {
  const caixas = db.prepare('SELECT * FROM caixa_config ORDER BY nome').all();
  if (!caixas.length) return interaction.reply({ content: '❌ Nenhuma caixa cadastrada.', ephemeral: true });
  const options = caixas.slice(0, 25).map(c => ({
    label:       c.nome.slice(0, 100),
    description: `R$ ${Number(c.preco).toFixed(2)} • ${c.ativa ? '🟢 Ativa' : '🔴 Inativa'} • ID: ${c.id.slice(0,8)}`,
    value:       c.id,
  }));
  return interaction.reply({
    content: '🎁 Selecione a caixa:',
    components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('cxs_caixa').setPlaceholder('Selecione a caixa').addOptions(options))],
    ephemeral: true,
  });
}

async function itemSelectCaixa(interaction) {
  const caixaId = interaction.values[0];
  const caixa   = db.prepare('SELECT * FROM caixa_config WHERE id=?').get(caixaId);
  set(interaction.user.id, 'item', { caixaId, caixaNome: caixa?.nome });
  await interaction.update({ content: `✅ Caixa **${caixa?.nome}** selecionada.`, components: [] }).catch(() => {});
  const s = get(interaction.user.id, 'item');
  if (s) await interaction.followUp({ embeds: [buildItemEmbed(s)], components: buildItemRows(s), ephemeral: true }).catch(() => {});
}

// ─── Selecionar variante ──────────────────────────────────────────────────────
async function itemSelecionarVariante(interaction) {
  const variantes = db.prepare(`
    SELECT vp.id, vp.nome as v_nome, pr.nome as p_nome,
           (SELECT COUNT(*) FROM estoque_variante WHERE variante_id=vp.id AND usado=0) as estoque
    FROM variantes_produto vp JOIN produtos pr ON vp.produto_id=pr.id
    WHERE vp.ativo=1 ORDER BY pr.nome, vp.ordem LIMIT 25
  `).all();
  if (!variantes.length) return interaction.reply({ content: '❌ Nenhuma variante cadastrada.', ephemeral: true });
  const options = variantes.map(v => ({
    label:       `${v.p_nome} — ${v.v_nome}`.slice(0, 100),
    description: `${v.estoque > 0 ? `📦 ${v.estoque} em estoque` : '❌ Sem estoque'} • ID: ${v.id.slice(0,8)}`,
    value:       v.id,
  }));
  return interaction.reply({
    content: '📦 Selecione o produto prêmio:',
    components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('cxs_variante').setPlaceholder('Selecione o produto prêmio').addOptions(options))],
    ephemeral: true,
  });
}

async function itemSelectVariante(interaction) {
  const varianteId = interaction.values[0];
  const variante   = db.prepare('SELECT vp.*, pr.nome as p_nome FROM variantes_produto vp JOIN produtos pr ON vp.produto_id=pr.id WHERE vp.id=?').get(varianteId);
  set(interaction.user.id, 'item', { varianteId, varianteNome: variante ? `${variante.p_nome} — ${variante.nome}` : varianteId.slice(0,8) });
  await interaction.update({ content: `✅ Produto **${variante?.nome}** selecionado.`, components: [] }).catch(() => {});
  const s = get(interaction.user.id, 'item');
  if (s) await interaction.followUp({ embeds: [buildItemEmbed(s)], components: buildItemRows(s), ephemeral: true }).catch(() => {});
}

// ─── Selecionar raridade por select menu (sem digitar) ───────────────────────
async function itemSelecionarRaridade(interaction) {
  const s = get(interaction.user.id, 'item');
  if (!s) return interaction.reply({ content: '❌ Sessão expirada.', ephemeral: true });
  const options = Object.entries(RARIDADES).map(([key, r]) =>
    new StringSelectMenuOptionBuilder()
      .setValue(key)
      .setLabel(`${r.emoji} ${r.label}`)
      .setDescription(`${r.stars} — Selecionar esta raridade`)
      .setDefault(s.raridade === key),
  );
  return interaction.reply({
    content: '⭐ Selecione a raridade do item:',
    components: [new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId('cxs_raridade').setPlaceholder('Selecione a raridade').addOptions(options),
    )],
    ephemeral: true,
  });
}

async function itemSelectRaridade(interaction) {
  const raridade = interaction.values[0];
  set(interaction.user.id, 'item', { raridade });
  const r = RARIDADES[raridade];
  await interaction.update({ content: `${r.emoji} Raridade **${r.label}** selecionada.`, components: [] }).catch(() => {});
  const s = get(interaction.user.id, 'item');
  if (s) await interaction.followUp({ embeds: [buildItemEmbed(s)], components: buildItemRows(s), ephemeral: true }).catch(() => {});
}

// ─── Chance via modal ─────────────────────────────────────────────────────────
async function itemModalChance(interaction) {
  const s = get(interaction.user.id, 'item');
  if (!s) return interaction.reply({ content: '❌ Sessão expirada.', ephemeral: true });

  // Calcular total atual sem este item para mostrar quanto resta
  let totalAtual = 0;
  if (s.caixaId) {
    const q = s.editandoItemId
      ? db.prepare('SELECT COALESCE(SUM(chance),0) as t FROM caixa_itens_config WHERE caixa_id=? AND ativa=1 AND id!=?').get(s.caixaId, s.editandoItemId)
      : db.prepare('SELECT COALESCE(SUM(chance),0) as t FROM caixa_itens_config WHERE caixa_id=? AND ativa=1').get(s.caixaId);
    totalAtual = q.t || 0;
  }
  const restante = Math.max(0, 100 - totalAtual);

  const modal = new ModalBuilder().setCustomId('cxm_chance').setTitle('🎲 Chance de Drop');
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('chance')
        .setLabel(`Chance (%) — restam ${restante.toFixed(1)}% disponíveis`)
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setValue(s.chance ? String(s.chance) : String(restante))
        .setPlaceholder(`Ex: ${restante > 0 ? restante.toFixed(0) : 10}`),
    ),
  );
  return interaction.showModal(modal);
}

async function itemProcessarChance(interaction) {
  const chance = parseFloat(interaction.fields.getTextInputValue('chance').trim().replace(',', '.'));
  if (isNaN(chance) || chance <= 0 || chance > 100) return interaction.reply({ content: '❌ Chance inválida. Use um número entre 1 e 100.', ephemeral: true });
  const s = get(interaction.user.id, 'item');
  if (!s) return interaction.reply({ content: '❌ Sessão expirada.', ephemeral: true });
  set(interaction.user.id, 'item', { chance });
  await interaction.deferUpdate().catch(() => {});
  const sAtual = get(interaction.user.id, 'item');
  return interaction.editReply({ embeds: [buildItemEmbed(sAtual)], components: buildItemRows(sAtual) }).catch(() => {});
}

// ─── Salvar item ──────────────────────────────────────────────────────────────
async function itemSalvar(interaction) {
  await interaction.deferUpdate().catch(() => {});
  const s = get(interaction.user.id, 'item');
  if (!s?.caixaId || !s?.varianteId || !s?.raridade || !s?.chance) return;

  if (s.editandoItemId) {
    // Editar item existente
    db.prepare('UPDATE caixa_itens_config SET raridade=?, chance=? WHERE id=?').run(s.raridade, s.chance, s.editandoItemId);
  } else {
    // Verificar se já existe (atualiza) ou insere
    const existe = db.prepare('SELECT id FROM caixa_itens_config WHERE caixa_id=? AND variante_id=? AND ativa=1').get(s.caixaId, s.varianteId);
    if (existe) {
      db.prepare('UPDATE caixa_itens_config SET raridade=?, chance=? WHERE id=?').run(s.raridade, s.chance, existe.id);
    } else {
      db.prepare('INSERT INTO caixa_itens_config (id,caixa_id,variante_id,raridade,chance,ativa) VALUES (?,?,?,?,?,1)')
        .run(uuidv4(), s.caixaId, s.varianteId, s.raridade, s.chance);
    }
  }

  const totalChance = db.prepare('SELECT COALESCE(SUM(chance),0) as t FROM caixa_itens_config WHERE caixa_id=? AND ativa=1').get(s.caixaId).t;
  const aviso = totalChance > 100 ? `\n⚠️ **Total: ${totalChance}%** (acima de 100% — ajuste as chances)`
              : totalChance < 100 ? `\n⚠️ **Total: ${totalChance}%** (abaixo de 100% — adicione mais itens)`
              : `\n✅ **Total: 100%** — perfeito!`;

  del(interaction.user.id, 'item');
  const rarInfo = RARIDADES[s.raridade];
  await interaction.editReply({
    embeds: [new EmbedBuilder().setColor(rarInfo.cor)
      .setTitle(s.editandoItemId ? '✅ Item Editado!' : '✅ Item Adicionado!')
      .addFields(
        { name: '🎁 Caixa',                    value: s.caixaNome    || '—', inline: true },
        { name: '📦 Produto',                  value: s.varianteNome || '—', inline: true },
        { name: `${rarInfo.emoji} Raridade`,   value: `${rarInfo.label} ${rarInfo.stars}`, inline: true },
        { name: '🎲 Chance',                   value: `**${s.chance}%**`, inline: true },
        { name: '📊 Total da caixa',           value: `**${totalChance}%**`, inline: true },
      )
      .setDescription(`> Item salvo com sucesso.${aviso}`)
      .setTimestamp()],
    components: [],
  });
}

async function itemCancelar(interaction) {
  del(interaction.user.id, 'item');
  await interaction.update({ embeds: [new EmbedBuilder().setColor(config.colors.error).setTitle('❌ Cancelado').setTimestamp()], components: [] });
}

// ══════════════════════════════════════════════════════════════════════════════
// 3. LISTAR / GERENCIAR ITENS DE UMA CAIXA
// ══════════════════════════════════════════════════════════════════════════════

async function listarItens(interaction, caixaId) {
  const caixa = db.prepare('SELECT * FROM caixa_config WHERE id=?').get(caixaId);
  if (!caixa) return interaction.reply({ content: '❌ Caixa não encontrada.', ephemeral: true });

  const itens = db.prepare(`
    SELECT ci.*, vp.nome as v_nome, pr.nome as p_nome,
           (SELECT COUNT(*) FROM estoque_variante WHERE variante_id=ci.variante_id AND usado=0) as estoque
    FROM caixa_itens_config ci
    JOIN variantes_produto vp ON ci.variante_id=vp.id
    JOIN produtos pr ON vp.produto_id=pr.id
    WHERE ci.caixa_id=?
    ORDER BY ci.chance DESC
  `).all(caixaId);

  const totalChance = itens.filter(i => i.ativa).reduce((a, i) => a + i.chance, 0);
  const statusTotal = totalChance === 100 ? '✅ 100%' : totalChance > 100 ? `⚠️ ${totalChance}% (acima)` : `⚠️ ${totalChance}% (abaixo)`;

  const embed = new EmbedBuilder()
    .setColor(0xFFD700)
    .setTitle(`🎁 Itens — ${caixa.nome}`)
    .setDescription(itens.length
      ? itens.map((it, i) => {
          const r   = RARIDADES[it.raridade] || RARIDADES.comum;
          const est = it.estoque > 0 ? `📦 ${it.estoque}` : '❌ sem estoque';
          const ati = it.ativa ? '' : ' *(desativado)*';
          return `\`${String(i+1).padStart(2,'0')}\` ${r.emoji} **${it.p_nome} — ${it.v_nome}**${ati}\n   └ ${r.label} ${r.stars} • **${it.chance}%** • ${est} • ID: \`${it.id.slice(0,8)}\``;
        }).join('\n\n')
      : '*Nenhum item cadastrado ainda.*')
    .addFields({ name: '📊 Total de chances', value: statusTotal, inline: true })
    .setFooter({ text: `R$ ${caixa.preco.toFixed(2)} • ${caixa.ativa ? '🟢 Ativa' : '🔴 Inativa'}` })
    .setTimestamp();

  // Botões de ação por item (até 5 por row, máximo 5 rows = 25 itens)
  const rows = [];

  // Row de ações gerais
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`cxi_add_item_${caixaId}`).setLabel('➕ Add Item').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`cxi_editar_caixa_${caixaId}`).setLabel('✏️ Editar Caixa').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`cxi_toggle_caixa_${caixaId}`).setLabel(caixa.ativa ? '🔴 Desativar' : '🟢 Ativar').setStyle(caixa.ativa ? ButtonStyle.Danger : ButtonStyle.Success),
  ));

  // Select de itens para editar/remover (se tiver itens)
  if (itens.length) {
    const opcoes = itens.slice(0, 25).map(it => {
      const r = RARIDADES[it.raridade] || RARIDADES.comum;
      return new StringSelectMenuOptionBuilder()
        .setValue(it.id)
        .setLabel(`${r.emoji} ${it.v_nome} — ${it.chance}%`.slice(0, 100))
        .setDescription(`${r.label} • ${it.ativa ? '🟢 Ativo' : '🔴 Inativo'} • ID: ${it.id.slice(0,8)}`);
    });

    rows.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`cxs_item_acao_${caixaId}`)
        .setPlaceholder('Selecione um item para gerenciar...')
        .addOptions(opcoes),
    ));
  }

  const responder = interaction.deferred || interaction.replied ? 'editReply' : 'reply';
  return interaction[responder]({ embeds: [embed], components: rows, ephemeral: true });
}

// ─── Select de ação no item ───────────────────────────────────────────────────
async function itemSelectAcao(interaction, caixaId) {
  const itemId = interaction.values[0];
  const item   = db.prepare('SELECT ci.*, vp.nome as v_nome FROM caixa_itens_config ci JOIN variantes_produto vp ON ci.variante_id=vp.id WHERE ci.id=?').get(itemId);
  if (!item) return interaction.reply({ content: '❌ Item não encontrado.', ephemeral: true });

  const r = RARIDADES[item.raridade] || RARIDADES.comum;
  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`cxi_edit_item_${itemId}`).setLabel('✏️ Editar Raridade/Chance').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`cxi_toggle_item_${itemId}_${caixaId}`).setLabel(item.ativa ? '🔴 Desativar' : '🟢 Ativar').setStyle(item.ativa ? ButtonStyle.Danger : ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`cxi_del_item_${itemId}_${caixaId}`).setLabel('🗑️ Remover').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`cxi_listar_${caixaId}`).setLabel('↩️ Voltar').setStyle(ButtonStyle.Secondary),
    ),
  ];

  return interaction.update({
    embeds: [new EmbedBuilder()
      .setColor(r.cor)
      .setTitle(`${r.emoji} Gerenciar Item`)
      .addFields(
        { name: '📦 Produto',  value: item.v_nome,              inline: true },
        { name: '⭐ Raridade', value: `${r.label} ${r.stars}`,  inline: true },
        { name: '🎲 Chance',   value: `**${item.chance}%**`,    inline: true },
        { name: '📊 Status',   value: item.ativa ? '🟢 Ativo' : '🔴 Inativo', inline: true },
        { name: '🆔 ID',       value: `\`${item.id.slice(0,8)}\``, inline: true },
      )
      .setTimestamp()],
    components: rows,
  });
}

// ─── Toggle item ──────────────────────────────────────────────────────────────
async function toggleItem(interaction, itemId, caixaId) {
  const item = db.prepare('SELECT * FROM caixa_itens_config WHERE id=?').get(itemId);
  if (!item) return interaction.reply({ content: '❌ Item não encontrado.', ephemeral: true });
  db.prepare('UPDATE caixa_itens_config SET ativa=? WHERE id=?').run(item.ativa ? 0 : 1, itemId);
  await interaction.reply({ content: `${item.ativa ? '🔴 Item desativado' : '🟢 Item ativado'} com sucesso.`, ephemeral: true });
  // Re-listar após toggle
  return listarItens(interaction, caixaId);
}

// ─── Remover item ─────────────────────────────────────────────────────────────
async function removerItem(interaction, itemId, caixaId) {
  const item = db.prepare('SELECT ci.*, vp.nome as v_nome FROM caixa_itens_config ci JOIN variantes_produto vp ON ci.variante_id=vp.id WHERE ci.id=?').get(itemId);
  if (!item) return interaction.reply({ content: '❌ Item não encontrado.', ephemeral: true });
  db.prepare('DELETE FROM caixa_itens_config WHERE id=?').run(itemId);
  await interaction.reply({ content: `✅ Item **${item.v_nome}** removido da caixa.`, ephemeral: true });
  return listarItens(interaction, caixaId);
}

// ─── Toggle caixa ─────────────────────────────────────────────────────────────
async function toggleCaixa(interaction, caixaId) {
  const caixa = db.prepare('SELECT * FROM caixa_config WHERE id=?').get(caixaId);
  if (!caixa) return interaction.reply({ content: '❌ Caixa não encontrada.', ephemeral: true });
  db.prepare('UPDATE caixa_config SET ativa=? WHERE id=?').run(caixa.ativa ? 0 : 1, caixaId);
  await interaction.reply({ content: `${caixa.ativa ? '🔴 Caixa desativada' : '🟢 Caixa ativada'} com sucesso.`, ephemeral: true });
  return listarItens(interaction, caixaId);
}

// ══════════════════════════════════════════════════════════════════════════════
// 4. SELECIONAR CAIXA PARA LISTAR
// ══════════════════════════════════════════════════════════════════════════════

async function selecionarCaixaListar(interaction) {
  const caixas = db.prepare('SELECT * FROM caixa_config ORDER BY nome').all();
  if (!caixas.length) return interaction.reply({ content: '❌ Nenhuma caixa cadastrada.', ephemeral: true });

  const options = caixas.slice(0, 25).map(c => {
    const total = db.prepare('SELECT COUNT(*) as n FROM caixa_itens_config WHERE caixa_id=? AND ativa=1').get(c.id).n;
    return new StringSelectMenuOptionBuilder()
      .setValue(c.id)
      .setLabel(c.nome.slice(0, 100))
      .setDescription(`R$ ${Number(c.preco).toFixed(2)} • ${total} item(s) • ${c.ativa ? '🟢 Ativa' : '🔴 Inativa'}`);
  });

  await interaction.deferReply({ ephemeral: true });
  return interaction.editReply({
    content: '🎁 Selecione a caixa para gerenciar:',
    components: [new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId('cxs_listar_caixa').setPlaceholder('Selecione a caixa...').addOptions(options),
    )],
  });
}

async function selectListarCaixa(interaction) {
  const caixaId = interaction.values[0];
  await interaction.deferUpdate().catch(() => {});
  return listarItens(interaction, caixaId);
}

// ─── Exports ──────────────────────────────────────────────────────────────────
module.exports = {
  // Criar/Editar caixa
  abrirCriar, abrirEditar,
  criarModalNome, criarModalCanal, criarModalDesc, criarModalImg,
  criarProcessarNome, criarProcessarCanal, criarProcessarDesc, criarProcessarImg,
  criarSalvar, criarCancelar,
  // Add/Editar item
  abrirItem, abrirEditarItem,
  itemSelecionarCaixa, itemSelectCaixa,
  itemSelecionarVariante, itemSelectVariante,
  itemSelecionarRaridade, itemSelectRaridade,
  itemModalChance, itemProcessarChance,
  itemSalvar, itemCancelar,
  // Listar e gerenciar
  selecionarCaixaListar, selectListarCaixa,
  listarItens, itemSelectAcao,
  toggleItem, removerItem, toggleCaixa,
  RARIDADES,
};
