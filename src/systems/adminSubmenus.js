/**
 * Submenus interativos para:
 *  - Adicionar Plano (ap_*)
 *  - Adicionar Estoque (ae_*)
 *  - Criar Cupom (cu_*)
 *
 * Padrão: estado em memória → botões → modais → confirmar
 */

const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder,
} = require('discord.js');
const { db }       = require('../database/database');
const { v4: uuidv4 } = require('uuid');
const config       = require('../config');

// ─── Estado em memória ────────────────────────────────────────────────────────
const sessoes = new Map();

function nova(userId, tipo, dados = {}) {
  const s = { tipo, ...dados };
  sessoes.set(`${tipo}_${userId}`, s);
  const t = setTimeout(() => sessoes.delete(`${tipo}_${userId}`), 30 * 60 * 1000);
  t.unref?.();
  return s;
}
function get(userId, tipo) { return sessoes.get(`${tipo}_${userId}`) || null; }
function set(userId, tipo, patch) { const s = get(userId, tipo); if (s) Object.assign(s, patch); }
function del(userId, tipo) { sessoes.delete(`${tipo}_${userId}`); }

// ══════════════════════════════════════════════════════════════════════════════
// 1. ADICIONAR PLANO
// ══════════════════════════════════════════════════════════════════════════════

function buildPlanoEmbed(s) {
  const ok = v => v ? '🟢' : '🔴';
  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('＋ Adicionar Plano')
    .addFields(
      { name: `${ok(s.produtoId)} Produto`, value: s.produtoNome ? `\`${s.produtoNome}\`` : '`não selecionado`', inline: true },
      { name: `${ok(s.nome)} Nome do Plano`, value: s.nome ? `\`${s.nome}\`` : '`não definido`', inline: true },
      { name: `${ok(s.preco !== undefined)} Preço`, value: s.preco !== undefined ? `R$ ${Number(s.preco).toFixed(2)}` : '`não definido`', inline: true },
      { name: `${ok(s.descricao)} Descrição`, value: s.descricao ? s.descricao.slice(0, 50) : '`opcional`', inline: true },
    )
    .setDescription('> Selecione o produto e preencha os dados do plano.')
    .setTimestamp()
    .setFooter({ text: 'Máximo Store • Produto e Nome são obrigatórios' });
}

function buildPlanoRows(s) {
  const podeSalvar = !!(s.produtoId && s.nome && s.preco !== undefined);
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ap_produto').setLabel('📦 Produto').setStyle(s.produtoId ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ap_dados').setLabel('✏️ Nome e Preço').setStyle(s.nome ? ButtonStyle.Success : ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ap_salvar').setLabel('✅ Adicionar Plano').setStyle(ButtonStyle.Primary).setDisabled(!podeSalvar),
      new ButtonBuilder().setCustomId('ap_cancelar').setLabel('🗑️ Cancelar').setStyle(ButtonStyle.Danger),
    ),
  ];
}

async function abrirPlano(interaction) {
  nova(interaction.user.id, 'plano');
  await interaction.deferReply({ ephemeral: true });
  const s = get(interaction.user.id, 'plano');
  await interaction.editReply({ embeds: [buildPlanoEmbed(s)], components: buildPlanoRows(s) });
}

async function rerenderPlano(interaction) {
  const s = get(interaction.user.id, 'plano');
  if (!s) return interaction.reply({ content: '❌ Sessão expirada.', ephemeral: true });
  await interaction.update({ embeds: [buildPlanoEmbed(s)], components: buildPlanoRows(s) }).catch(() =>
    interaction.editReply({ embeds: [buildPlanoEmbed(s)], components: buildPlanoRows(s) }));
}

async function planoModalProduto(interaction) {
  // Listar produtos disponíveis via select
  const paineis = db.prepare('SELECT p.*, pr.nome AS pnome FROM paineis_canal p JOIN produtos pr ON p.produto_id=pr.id WHERE p.ativo=1 ORDER BY pr.nome').all();
  if (!paineis.length) return interaction.reply({ content: '❌ Nenhum carrinho criado ainda.', ephemeral: true });
  const options = paineis.slice(0, 25).map(p => ({ label: p.pnome.slice(0, 100), description: `ID: ${p.produto_id.slice(0,8)}`, value: p.produto_id }));
  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId('ap_select_produto').setPlaceholder('Selecione o produto').addOptions(options),
  );
  return interaction.reply({ content: '📦 Selecione o produto:', components: [row], ephemeral: true });
}

async function planoSelectProduto(interaction) {
  const produtoId = interaction.values[0];
  const produto   = db.prepare('SELECT * FROM produtos WHERE id=?').get(produtoId);
  set(interaction.user.id, 'plano', { produtoId, produtoNome: produto?.nome });
  await interaction.deferUpdate().catch(() => {});
  return rerenderPlano(interaction);
}

async function planoModalDados(interaction) {
  const s = get(interaction.user.id, 'plano');
  const modal = new ModalBuilder().setCustomId('apm_dados').setTitle('✏️ Dados do Plano');
  modal.addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('nome').setLabel('Nome do Plano').setStyle(TextInputStyle.Short).setRequired(true).setValue(s?.nome || '').setPlaceholder('Ex: Mensal, Trimestral')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('preco').setLabel('Preço (R$)').setStyle(TextInputStyle.Short).setRequired(true).setValue(s?.preco !== undefined ? String(s.preco) : '').setPlaceholder('Ex: 29.90')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('descricao').setLabel('Descrição (opcional)').setStyle(TextInputStyle.Short).setRequired(false).setValue(s?.descricao || '')),
  );
  return interaction.showModal(modal);
}

async function planoProcessarDados(interaction) {
  const nome   = interaction.fields.getTextInputValue('nome').trim();
  const preco  = parseFloat(interaction.fields.getTextInputValue('preco').trim().replace(',', '.'));
  const desc   = interaction.fields.getTextInputValue('descricao').trim();
  if (isNaN(preco) || preco < 0) return interaction.reply({ content: '❌ Preço inválido.', ephemeral: true });
  set(interaction.user.id, 'plano', { nome, preco, descricao: desc || null });
  return rerenderPlano(interaction);
}

async function planoSalvar(interaction) {
  await interaction.deferUpdate().catch(() => {});
  const s = get(interaction.user.id, 'plano');
  if (!s?.produtoId || !s?.nome || s.preco === undefined) return;

  const ordem = db.prepare('SELECT COUNT(*) as c FROM variantes_produto WHERE produto_id=?').get(s.produtoId).c + 1;
  const varId = uuidv4();
  db.prepare('INSERT INTO variantes_produto (id,produto_id,nome,descricao,preco,estoque,ordem) VALUES (?,?,?,?,?,0,?)')
    .run(varId, s.produtoId, s.nome, s.descricao, s.preco, ordem);

  const { atualizarPainelProduto } = require('./painelProduto');
  const paineis = db.prepare('SELECT * FROM paineis_canal WHERE produto_id=? AND ativo=1').all(s.produtoId);
  for (const p of paineis) await atualizarPainelProduto(interaction.guild, p.id).catch(() => {});

  del(interaction.user.id, 'plano');
  await interaction.editReply({
    embeds: [new EmbedBuilder().setColor(config.colors.success).setTitle('✅ Plano Adicionado!')
      .addFields(
        { name: '📦 Produto', value: s.produtoNome || '—', inline: true },
        { name: '🏷️ Plano',   value: s.nome,               inline: true },
        { name: '💵 Preço',   value: `R$ ${Number(s.preco).toFixed(2)}`, inline: true },
        { name: '🆔 Variante ID', value: `\`${varId.slice(0,8)}\``, inline: false },
      )
      .setDescription('Use **📥 Estoque** para adicionar os itens a este plano.')
      .setTimestamp()],
    components: [],
  });
}

async function planoCancelar(interaction) {
  del(interaction.user.id, 'plano');
  await interaction.update({ embeds: [new EmbedBuilder().setColor(config.colors.error).setTitle('❌ Cancelado').setTimestamp()], components: [] });
}

// ══════════════════════════════════════════════════════════════════════════════
// 2. ADICIONAR ESTOQUE (até 4 slots)
// ══════════════════════════════════════════════════════════════════════════════

function buildEstoqueEmbed(s) {
  const ok = v => v ? '🟢' : '🔴';
  const itensTotal = (s.slot1 ? s.slot1.split('\n').filter(Boolean).length : 0)
    + (s.slot2 ? s.slot2.split('\n').filter(Boolean).length : 0)
    + (s.slot3 ? s.slot3.split('\n').filter(Boolean).length : 0)
    + (s.slot4 ? s.slot4.split('\n').filter(Boolean).length : 0);

  return new EmbedBuilder()
    .setColor(0x57F287)
    .setTitle('📥 Adicionar Estoque')
    .addFields(
      { name: `${ok(s.varianteId)} Variante`, value: s.varianteNome ? `\`${s.varianteNome}\`` : '`não selecionada`', inline: true },
      { name: '📊 Total de Itens', value: `**${itensTotal}** item(ns)`, inline: true },
      { name: `${s.slot1 ? '🟢' : '⬜'} Slot 1`, value: s.slot1 ? `${s.slot1.split('\n').filter(Boolean).length} itens` : '`vazio`', inline: true },
      { name: `${s.slot2 ? '🟢' : '⬜'} Slot 2`, value: s.slot2 ? `${s.slot2.split('\n').filter(Boolean).length} itens` : '`vazio`', inline: true },
      { name: `${s.slot3 ? '🟢' : '⬜'} Slot 3`, value: s.slot3 ? `${s.slot3.split('\n').filter(Boolean).length} itens` : '`vazio`', inline: true },
      { name: `${s.slot4 ? '🟢' : '⬜'} Slot 4`, value: s.slot4 ? `${s.slot4.split('\n').filter(Boolean).length} itens` : '`vazio`', inline: true },
    )
    .setDescription('> Selecione a variante e preencha até 4 slots com os itens (1 por linha).')
    .setTimestamp()
    .setFooter({ text: 'Máximo Store • Cada linha = 1 produto entregue' });
}

function buildEstoqueRows(s) {
  const itensTotal = (s.slot1 ? s.slot1.split('\n').filter(Boolean).length : 0)
    + (s.slot2 ? s.slot2.split('\n').filter(Boolean).length : 0)
    + (s.slot3 ? s.slot3.split('\n').filter(Boolean).length : 0)
    + (s.slot4 ? s.slot4.split('\n').filter(Boolean).length : 0);
  const podeSalvar = !!(s.varianteId && itensTotal > 0);

  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ae_variante').setLabel('🎯 Variante').setStyle(s.varianteId ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ae_slot1').setLabel(`📝 Slot 1${s.slot1 ? ' ✅' : ''}`).setStyle(s.slot1 ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ae_slot2').setLabel(`📝 Slot 2${s.slot2 ? ' ✅' : ''}`).setStyle(s.slot2 ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ae_slot3').setLabel(`📝 Slot 3${s.slot3 ? ' ✅' : ''}`).setStyle(s.slot3 ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ae_slot4').setLabel(`📝 Slot 4${s.slot4 ? ' ✅' : ''}`).setStyle(s.slot4 ? ButtonStyle.Success : ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ae_salvar').setLabel(`✅ Adicionar ${itensTotal > 0 ? itensTotal + ' itens' : 'Estoque'}`).setStyle(ButtonStyle.Primary).setDisabled(!podeSalvar),
      new ButtonBuilder().setCustomId('ae_cancelar').setLabel('🗑️ Cancelar').setStyle(ButtonStyle.Danger),
    ),
  ];
}

async function abrirEstoque(interaction) {
  nova(interaction.user.id, 'estoque');
  await interaction.deferReply({ ephemeral: true });
  const s = get(interaction.user.id, 'estoque');
  await interaction.editReply({ embeds: [buildEstoqueEmbed(s)], components: buildEstoqueRows(s) });
}

async function rerenderEstoque(interaction) {
  const s = get(interaction.user.id, 'estoque');
  if (!s) return interaction.reply({ content: '❌ Sessão expirada.', ephemeral: true });
  await interaction.update({ embeds: [buildEstoqueEmbed(s)], components: buildEstoqueRows(s) }).catch(() =>
    interaction.editReply({ embeds: [buildEstoqueEmbed(s)], components: buildEstoqueRows(s) }));
}

async function estoqueModalVariante(interaction) {
  // ETAPA 1: listar produtos primeiro
  const produtos = db.prepare(`
    SELECT pr.id, pr.nome, COUNT(vp.id) as num_vars
    FROM produtos pr
    JOIN variantes_produto vp ON vp.produto_id=pr.id AND vp.ativo=1
    WHERE pr.ativo=1
    GROUP BY pr.id ORDER BY pr.nome LIMIT 25
  `).all();

  if (!produtos.length) return interaction.reply({ content: '❌ Nenhum produto com variantes encontrado.', ephemeral: true });

  const { StringSelectMenuOptionBuilder } = require('discord.js');
  const opcoes = produtos.map(p =>
    new StringSelectMenuOptionBuilder()
      .setValue(p.id)
      .setLabel(p.nome.slice(0, 100))
      .setDescription(`${p.num_vars} variante(s)`),
  );

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('ae_select_produto')
      .setPlaceholder('1️⃣ Selecione o produto...')
      .addOptions(opcoes),
  );
  return interaction.reply({ content: '📦 Selecione o produto:', components: [row], ephemeral: true });
}

async function estoqueSelectProduto(interaction) {
  // ETAPA 2: listar variantes do produto escolhido
  const produtoId = interaction.values[0];
  const produto   = db.prepare('SELECT * FROM produtos WHERE id=?').get(produtoId);
  if (!produto) return interaction.reply({ content: '❌ Produto não encontrado.', ephemeral: true });

  const variantes = db.prepare(`
    SELECT vp.*,
      (SELECT COUNT(*) FROM estoque_variante WHERE variante_id=vp.id AND usado=0) as estoque
    FROM variantes_produto vp WHERE vp.produto_id=? AND vp.ativo=1 ORDER BY vp.ordem
  `).all(produtoId);

  if (!variantes.length) return interaction.reply({ content: '❌ Nenhuma variante encontrada para este produto.', ephemeral: true });

  const { StringSelectMenuOptionBuilder } = require('discord.js');
  const opcoes = variantes.slice(0, 25).map(v =>
    new StringSelectMenuOptionBuilder()
      .setValue(v.id)
      .setLabel(`${v.nome}`.slice(0, 100))
      .setDescription(`R$ ${Number(v.preco).toFixed(2)} • ${v.estoque} em estoque • ID: ${v.id.slice(0,8)}`),
  );

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('ae_select_variante')
      .setPlaceholder('2️⃣ Selecione a variante...')
      .addOptions(opcoes),
  );
  return interaction.update({ content: `📦 **${produto.nome}** — Selecione a variante:`, components: [row] });
}

async function estoqueSelectVariante(interaction) {
  const varianteId = interaction.values[0];
  const variante   = db.prepare('SELECT * FROM variantes_produto WHERE id=?').get(varianteId);
  const produto    = variante ? db.prepare('SELECT nome FROM produtos WHERE id=?').get(variante.produto_id) : null;
  set(interaction.user.id, 'estoque', { varianteId, varianteNome: `${produto?.nome || '?'} — ${variante?.nome || '?'}` });
  await interaction.deferUpdate().catch(() => {});
  return rerenderEstoque(interaction);
}

async function estoqueModalSlot(interaction, slot) {
  const s = get(interaction.user.id, 'estoque');
  const modal = new ModalBuilder().setCustomId(`aem_slot${slot}`).setTitle(`📝 Slot ${slot} — Itens do Estoque`);
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('conteudo')
        .setLabel(`Itens (1 por linha = 1 produto)`)
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setValue(s?.[`slot${slot}`] || '')
        .setPlaceholder('login1:senha1\nlogin2:senha2\nchave1'),
    ),
  );
  return interaction.showModal(modal);
}

async function estoqueProcessarSlot(interaction, slot) {
  const conteudo = interaction.fields.getTextInputValue('conteudo').trim();
  set(interaction.user.id, 'estoque', { [`slot${slot}`]: conteudo || null });
  return rerenderEstoque(interaction);
}

async function estoqueSalvar(interaction) {
  await interaction.deferUpdate().catch(() => {});
  const s = get(interaction.user.id, 'estoque');
  if (!s?.varianteId) return;

  const variante = db.prepare('SELECT * FROM variantes_produto WHERE id=?').get(s.varianteId);
  if (!variante) return;

  const todosItens = [s.slot1, s.slot2, s.slot3, s.slot4]
    .filter(Boolean)
    .flatMap(slot => slot.split('\n').map(l => l.trim()).filter(Boolean));

  for (const item of todosItens) {
    db.prepare('INSERT INTO estoque_variante (id,variante_id,conteudo) VALUES (?,?,?)').run(uuidv4(), s.varianteId, item);
  }
  const total = db.prepare('SELECT COUNT(*) as c FROM estoque_variante WHERE variante_id=? AND usado=0').get(s.varianteId).c;
  db.prepare('UPDATE variantes_produto SET estoque=?, estoque_atualizado_em=strftime(\'%s\',\'now\') WHERE id=?').run(total, s.varianteId);

  const { atualizarPainelProduto } = require('./painelProduto');
  const paineis = db.prepare('SELECT * FROM paineis_canal WHERE produto_id=? AND ativo=1').all(variante.produto_id);
  for (const p of paineis) await atualizarPainelProduto(interaction.guild, p.id).catch(() => {});

  // Notificar usuários que pediram aviso de estoque
  try {
    const notifs = db.prepare('SELECT * FROM notif_estoque WHERE variante_id=?').all(s.varianteId);
    if (notifs.length > 0 && interaction.guild) {
      for (const n of notifs) {
        const member = await interaction.guild.members.fetch(n.usuario_id).catch(() => null);
        if (member) {
          await member.send({
            embeds: [new EmbedBuilder()
              .setColor(0x57F287)
              .setTitle('🔔 Estoque Reposto!')
              .setDescription([
                `> O plano **${variante.nome}** que você estava esperando voltou ao estoque!`,
                `> Acesse a loja agora para garantir o seu.`,
              ].join('\n'))
              .setTimestamp()
              .setFooter({ text: 'Máximo Store • Notificação de Estoque' })],
          }).catch(() => {});
        }
        db.prepare('DELETE FROM notif_estoque WHERE id=?').run(n.id);
      }
    }
  } catch {}

  del(interaction.user.id, 'estoque');
  await interaction.editReply({
    embeds: [new EmbedBuilder().setColor(config.colors.success).setTitle('✅ Estoque Adicionado!')
      .addFields(
        { name: '🎯 Variante',    value: s.varianteNome || '—',  inline: true },
        { name: '📦 Itens add.',  value: `**${todosItens.length}**`, inline: true },
        { name: '📊 Total est.',  value: `**${total}**`,          inline: true },
      )
      .setTimestamp()],
    components: [],
  });
}

async function estoqueCancelar(interaction) {
  del(interaction.user.id, 'estoque');
  await interaction.update({ embeds: [new EmbedBuilder().setColor(config.colors.error).setTitle('❌ Cancelado').setTimestamp()], components: [] });
}

// ══════════════════════════════════════════════════════════════════════════════
// 3. CRIAR CUPOM
// ══════════════════════════════════════════════════════════════════════════════

function buildCupomEmbed(s) {
  const ok = v => v ? '🟢' : '🔴';
  return new EmbedBuilder()
    .setColor(0x9B59B6)
    .setTitle('🎟️ Criar Cupom')
    .addFields(
      { name: `${ok(s.codigo)} Código`, value: s.codigo ? `\`${s.codigo.toUpperCase()}\`` : '`automático`', inline: true },
      { name: `${ok(s.valor)} Desconto`, value: s.valor !== undefined ? `**${s.valor}%**` : '`não definido`', inline: true },
      { name: `${ok(s.dias)} Validade`, value: s.dias ? `**${s.dias} dias**` : '`30 dias`', inline: true },
      { name: `${ok(s.limiteUso)} Limite/usuário`, value: s.limiteUso ? `**${s.limiteUso}x**` : '`1x`', inline: true },
      { name: `${s.lojas?.length ? '🟢' : '⬜'} Lojas válidas`, value: s.lojas?.length ? `**${s.lojas.length}** loja(s)` : '`todas`', inline: true },
    )
    .setDescription('> Preencha os dados do cupom e clique em **✅ Criar**.')
    .setTimestamp()
    .setFooter({ text: 'Máximo Store • Apenas Desconto é obrigatório' });
}

function buildCupomRows(s) {
  const podeSalvar = s.valor !== undefined;
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('cu_codigo').setLabel('🔑 Código').setStyle(s.codigo ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('cu_valor').setLabel('💰 Desconto %').setStyle(s.valor !== undefined ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('cu_validade').setLabel('📅 Validade').setStyle(s.dias ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('cu_limite').setLabel('👤 Limite/User').setStyle(s.limiteUso ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('cu_lojas').setLabel(`🏪 Lojas${s.lojas?.length ? ` (${s.lojas.length})` : ''}`).setStyle(s.lojas?.length ? ButtonStyle.Success : ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('cu_salvar').setLabel('✅ Criar Cupom').setStyle(ButtonStyle.Primary).setDisabled(!podeSalvar),
      new ButtonBuilder().setCustomId('cu_cancelar').setLabel('🗑️ Cancelar').setStyle(ButtonStyle.Danger),
    ),
  ];
}

async function abrirCupom(interaction) {
  nova(interaction.user.id, 'cupom', { dias: 30, limiteUso: 1, lojas: [] });
  await interaction.deferReply({ ephemeral: true });
  const s = get(interaction.user.id, 'cupom');
  await interaction.editReply({ embeds: [buildCupomEmbed(s)], components: buildCupomRows(s) });
}

async function rerenderCupom(interaction) {
  const s = get(interaction.user.id, 'cupom');
  if (!s) return interaction.reply({ content: '❌ Sessão expirada.', ephemeral: true });
  await interaction.update({ embeds: [buildCupomEmbed(s)], components: buildCupomRows(s) }).catch(() =>
    interaction.editReply({ embeds: [buildCupomEmbed(s)], components: buildCupomRows(s) }));
}

function cupomModal(interaction, campo) {
  const s = get(interaction.user.id, 'cupom');
  const modais = {
    codigo:   { title: '🔑 Código do Cupom',  field: 'codigo',    label: 'Código (vazio = automático)', max: 20,  ph: 'PROMO10',          val: s?.codigo || '' },
    valor:    { title: '💰 Desconto',         field: 'valor',     label: 'Desconto em %',              max: 5,   ph: '10',               val: s?.valor !== undefined ? String(s.valor) : '' },
    validade: { title: '📅 Validade',         field: 'validade',  label: 'Dias de validade',           max: 5,   ph: '30',               val: s?.dias ? String(s.dias) : '30' },
    limite:   { title: '👤 Limite por User',  field: 'limite',    label: 'Usos por usuário',           max: 3,   ph: '1',                val: s?.limiteUso ? String(s.limiteUso) : '1' },
    lojas:    { title: '🏪 Lojas Válidas',    field: 'lojas',     label: 'IDs de produto (ou vazio=todas)', max: 500, ph: 'a1b2c3d4, e5f6g7h8', val: s?.lojasRaw || '' },
  };
  const m = modais[campo];
  const modal = new ModalBuilder().setCustomId(`cum_${campo}`).setTitle(m.title);
  modal.addComponents(new ActionRowBuilder().addComponents(
    new TextInputBuilder().setCustomId(m.field).setLabel(m.label).setStyle(campo === 'lojas' ? TextInputStyle.Paragraph : TextInputStyle.Short)
      .setRequired(campo === 'valor').setMaxLength(m.max).setValue(m.val).setPlaceholder(m.ph),
  ));
  return interaction.showModal(modal);
}

async function cupomProcessar(interaction, campo) {
  const val = interaction.fields.getTextInputValue(campo).trim();
  if (campo === 'valor') {
    const n = parseFloat(val.replace(',', '.'));
    if (isNaN(n) || n <= 0 || n > 100) return interaction.reply({ content: '❌ Desconto deve ser entre 1 e 100.', ephemeral: true });
    set(interaction.user.id, 'cupom', { valor: n });
  } else if (campo === 'validade') {
    const n = parseInt(val) || 30;
    set(interaction.user.id, 'cupom', { dias: n });
  } else if (campo === 'limite') {
    const n = parseInt(val) || 1;
    set(interaction.user.id, 'cupom', { limiteUso: n });
  } else if (campo === 'codigo') {
    set(interaction.user.id, 'cupom', { codigo: val.toUpperCase() || null });
  } else if (campo === 'lojas') {
    set(interaction.user.id, 'cupom', { lojasRaw: val });
    // Resolver IDs
    if (val) {
      const ids = val.split(/[,\n]+/).map(s => s.trim()).filter(Boolean);
      const painelIds = [];
      for (const id of ids) {
        const p = db.prepare('SELECT id FROM paineis_canal WHERE produto_id LIKE ? AND ativo=1').get(`${id}%`)
                || db.prepare('SELECT id FROM paineis_canal WHERE id LIKE ? AND ativo=1').get(`${id}%`);
        if (p) painelIds.push(p.id);
      }
      set(interaction.user.id, 'cupom', { lojas: painelIds });
    } else {
      set(interaction.user.id, 'cupom', { lojas: [] });
    }
  }
  return rerenderCupom(interaction);
}

async function cupomSalvar(interaction) {
  await interaction.deferUpdate().catch(() => {});
  const s = get(interaction.user.id, 'cupom');
  if (s.valor === undefined) return;

  const { gerarCodigoCupom } = require('./cupons');
  const codigo = s.codigo || gerarCodigoCupom();

  try { db.exec('ALTER TABLE cupons ADD COLUMN usos_por_usuario INTEGER DEFAULT 1'); } catch {}
  try { db.exec('ALTER TABLE cupons ADD COLUMN lojas_validas TEXT DEFAULT NULL'); } catch {}

  const lojasValidas = s.lojas?.length ? JSON.stringify(s.lojas) : null;
  const validadeTs   = Math.floor(Date.now() / 1000) + ((s.dias || 30) * 86400);
  const cupomId      = uuidv4();

  db.prepare('INSERT INTO cupons (id,codigo,tipo,valor,usos_max,usos_por_usuario,validade,lojas_validas,criado_por) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(cupomId, codigo.toUpperCase(), 'percentual', s.valor, 9999, s.limiteUso || 1, validadeTs, lojasValidas, interaction.user.id);

  del(interaction.user.id, 'cupom');

  const lojasLabel = s.lojas?.length ? `${s.lojas.length} loja(s) específica(s)` : 'Todas as lojas';
  const dataValidade = new Date((validadeTs) * 1000).toLocaleDateString('pt-BR');

  const embedCriado = new EmbedBuilder()
    .setColor(0xFFD700)
    .setTitle('🎟️ Cupom Criado com Sucesso!')
    .setDescription([
      `> Use o código abaixo para obter desconto na loja.`,
      `> Compartilhe apenas com quem deve receber o benefício.`,
    ].join('\n'))
    .addFields(
      { name: '🔑 Código',        value: `\`\`\`${codigo.toUpperCase()}\`\`\``,      inline: false },
      { name: '💰 Desconto',      value: `**${s.valor}%** off`,                       inline: true },
      { name: '📅 Válido até',    value: `**${dataValidade}**`,                        inline: true },
      { name: '👤 Usos/pessoa',   value: `**${s.limiteUso || 1}x**`,                  inline: true },
      { name: '🏪 Lojas válidas', value: lojasLabel,                                  inline: false },
    )
    .setTimestamp()
    .setFooter({ text: 'Máximo Store • Cupom gerado com sucesso' });

  const rowPublicar = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`pa_pub_cupom_${cupomId}`)
      .setLabel('📢 Publicar no canal de cupons')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('pa_menu_loja')
      .setLabel('🔙 Voltar ao Menu')
      .setStyle(ButtonStyle.Secondary),
  );

  await interaction.editReply({ embeds: [embedCriado], components: [rowPublicar] });
}

async function cupomCancelar(interaction) {
  del(interaction.user.id, 'cupom');
  await interaction.update({ embeds: [new EmbedBuilder().setColor(config.colors.error).setTitle('❌ Cancelado').setTimestamp()], components: [] });
}

// ─── Exports ──────────────────────────────────────────────────────────────────
module.exports = {
  // Plano
  abrirPlano, planoModalProduto, planoSelectProduto,
  planoModalDados, planoProcessarDados, planoSalvar, planoCancelar,
  // Estoque
  abrirEstoque, estoqueModalVariante, estoqueSelectProduto, estoqueSelectVariante,
  estoqueModalSlot, estoqueProcessarSlot, estoqueSalvar, estoqueCancelar,
  // Cupom
  abrirCupom, cupomModal, cupomProcessar, cupomSalvar, cupomCancelar,
};
