/**
 * Carrinho Multi-Produto por Variante
 * Armazenado em memória (Map) por usuário
 * Suporta variantes diferentes de produtos diferentes
 * TTL: 30 minutos de inatividade
 */

const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
} = require('discord.js');
const { db, Usuarios, Config } = require('../database/database');
const config = require('../config');

// ─── Estado em memória ────────────────────────────────────────────────────────
// Map: userId → { itens: [{ varianteId, produtoNome, varianteNome, preco, qtd }], timer }
const carrinhos = new Map();

function getCarrinho(userId) {
  return carrinhos.get(userId) || null;
}

function resetTimer(userId) {
  const c = carrinhos.get(userId);
  if (!c) return;
  if (c.timer) clearTimeout(c.timer);
  c.timer = setTimeout(() => carrinhos.delete(userId), 30 * 60 * 1000);
  c.timer.unref?.();
}

function garantirCarrinho(userId) {
  if (!carrinhos.get(userId)) {
    const c = { itens: [], timer: null };
    carrinhos.set(userId, c);
  }
  resetTimer(userId);
  return carrinhos.get(userId);
}

function limparCarrinhoVariante(userId) {
  const c = carrinhos.get(userId);
  if (c?.timer) clearTimeout(c.timer);
  carrinhos.delete(userId);
}

// ─── Adicionar item ───────────────────────────────────────────────────────────
function adicionarItem(userId, varianteId, qtd = 1) {
  const variante = db.prepare('SELECT * FROM variantes_produto WHERE id=? AND ativo=1').get(varianteId);
  if (!variante) return { ok: false, erro: 'Variante não encontrada.' };

  const produto = db.prepare('SELECT * FROM produtos WHERE id=?').get(variante.produto_id);
  if (!produto || !produto.ativo) return { ok: false, erro: 'Produto indisponível.' };

  const estoque = db.prepare('SELECT COUNT(*) as c FROM estoque_variante WHERE variante_id=? AND usado=0').get(varianteId)?.c || 0;
  if (estoque === 0) return { ok: false, erro: `**${produto.nome} — ${variante.nome}** está sem estoque.` };
  if (qtd > estoque) return { ok: false, erro: `Estoque insuficiente. Disponível: **${estoque}**` };

  const c = garantirCarrinho(userId);

  // Verificar se já existe esse item no carrinho
  const existente = c.itens.find(i => i.varianteId === varianteId);
  if (existente) {
    const novaQtd = existente.qtd + qtd;
    if (novaQtd > estoque) return { ok: false, erro: `Estoque insuficiente. Disponível: **${estoque}**, já tem **${existente.qtd}** no carrinho.` };
    existente.qtd = novaQtd;
  } else {
    c.itens.push({
      varianteId,
      produtoId:    produto.id,
      produtoNome:  produto.nome,
      varianteNome: variante.nome,
      preco:        Number(variante.preco),
      qtd,
      imagemUrl:    produto.imagem_url || null,
    });
  }

  return { ok: true, produto, variante, total: calcularTotal(userId) };
}

// ─── Remover item ─────────────────────────────────────────────────────────────
function removerItem(userId, varianteId) {
  const c = getCarrinho(userId);
  if (!c) return;
  c.itens = c.itens.filter(i => i.varianteId !== varianteId);
  if (c.itens.length === 0) limparCarrinhoVariante(userId);
  else resetTimer(userId);
}

// ─── Calcular total ───────────────────────────────────────────────────────────
function calcularTotal(userId) {
  const c = getCarrinho(userId);
  if (!c) return 0;
  return c.itens.reduce((acc, i) => acc + i.preco * i.qtd, 0);
}

// ─── Montar embed do carrinho ─────────────────────────────────────────────────
function buildCarrinhoEmbed(userId) {
  const c = getCarrinho(userId);
  if (!c || !c.itens.length) return null;

  // Ordenar por preço unitário crescente
  c.itens.sort((a, b) => a.preco - b.preco);

  const total    = calcularTotal(userId);
  const cashback = Math.floor(total * parseInt(Config.get('cashback_pct') || '5'));

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('🛒 Seu Carrinho')
    .setDescription('> Revise seus itens e clique em **✅ Finalizar** para criar o ticket.')
    .setTimestamp()
    .setFooter({ text: `Máximo Store • ${c.itens.length} item(s)` });

  for (const item of c.itens) {
    const subtotal = item.preco * item.qtd;
    const est = db.prepare('SELECT COUNT(*) as c FROM estoque_variante WHERE variante_id=? AND usado=0').get(item.varianteId)?.c || 0;
    embed.addFields({
      name:  `📦 ${item.produtoNome} — ${item.varianteNome}`,
      value: `R$ ${item.preco.toFixed(2)} × ${item.qtd} = **R$ ${subtotal.toFixed(2)}** | 📦 ${est} em estoque`,
      inline: false,
    });
  }

  embed.addFields(
    { name: '─────────────', value: `💰 **Total: R$ ${total.toFixed(2)}**`, inline: false },
    { name: '🎁 Cashback est.', value: `+**${cashback} coins** (sem cupom)`, inline: true },
    { name: '📦 Itens',         value: `**${c.itens.length}** produto(s)`,  inline: true },
  );

  return embed;
}

// ─── Montar rows do carrinho ──────────────────────────────────────────────────
function buildCarrinhoRows(userId) {
  const c = getCarrinho(userId);
  if (!c || !c.itens.length) return [];

  const total = calcularTotal(userId);
  const rows  = [];

  // Row 1 — ações principais
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('cvar_finalizar').setLabel(`✅ Finalizar — R$ ${total.toFixed(2)}`).setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('cvar_continuar').setLabel('🛍️ Continuar Comprando').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('cvar_limpar').setLabel('🗑️ Limpar').setStyle(ButtonStyle.Danger),
  ));

  // Row 2 — remover item (select se > 1, botão se = 1)
  if (c.itens.length === 1) {
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`cvar_remover_${c.itens[0].varianteId}`)
        .setLabel(`❌ Remover: ${c.itens[0].varianteNome.slice(0,20)}`)
        .setStyle(ButtonStyle.Secondary),
    ));
  } else if (c.itens.length <= 25) {
    const opcoes = c.itens.map(i =>
      new StringSelectMenuOptionBuilder()
        .setValue(i.varianteId)
        .setLabel(`${i.produtoNome} — ${i.varianteNome}`.slice(0,100))
        .setDescription(`R$ ${i.preco.toFixed(2)} × ${i.qtd} = R$ ${(i.preco*i.qtd).toFixed(2)}`),
    );
    rows.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('cvar_remover_select')
        .setPlaceholder('❌ Remover um item...')
        .addOptions(opcoes),
    ));
  }

  return rows;
}

// ─── Mostrar carrinho ─────────────────────────────────────────────────────────
async function mostrarCarrinhoVariante(interaction) {
  if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ ephemeral: true });

  const embed = buildCarrinhoEmbed(interaction.user.id);
  if (!embed) {
    return interaction.editReply({ content: '🛒 Seu carrinho está vazio.', embeds: [], components: [] });
  }
  return interaction.editReply({ embeds: [embed], components: buildCarrinhoRows(interaction.user.id) });
}

// ─── Finalizar carrinho — criar pedidos e abrir ticket ───────────────────────
async function finalizarCarrinho(interaction, client) {
  if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ ephemeral: true });

  const userId = interaction.user.id;
  const c = getCarrinho(userId);
  if (!c || !c.itens.length) return interaction.editReply({ content: '🛒 Carrinho vazio.' });

  const usuario = Usuarios.garantir(userId, interaction.user.username);
  if (usuario.bloqueado) return interaction.editReply({ content: '🚫 Conta bloqueada.' });

  // Verificar estoque de todos os itens antes de criar pedidos
  for (const item of c.itens) {
    const est = db.prepare('SELECT COUNT(*) as c FROM estoque_variante WHERE variante_id=? AND usado=0').get(item.varianteId)?.c || 0;
    if (est < item.qtd) {
      return interaction.editReply({
        content: `❌ **${item.produtoNome} — ${item.varianteNome}** não tem estoque suficiente.\nDisponível: **${est}** | No carrinho: **${item.qtd}**`,
      });
    }
  }

  // Criar um pedido por item
  const { v4: uuidv4 } = require('uuid');
  const pedidoIds = [];
  const total = calcularTotal(userId);

  // Calcular afiliado (usa o primeiro pedido como referência)
  let afiliadoId = null, comissaoAfil = 0;
  // Verifica se tem código de vendedor no carrinho
  const codigoVendedor = c.codigoVendedor;
  if (codigoVendedor) {
    const afil = db.prepare('SELECT * FROM usuarios WHERE codigo_afil=?').get(codigoVendedor);
    if (afil) { afiliadoId = afil.discord_id; }
  } else if (usuario.afiliado_de) {
    afiliadoId = usuario.afiliado_de;
  }

  for (const item of c.itens) {
    const taxa = parseFloat(db.prepare("SELECT valor FROM configuracoes WHERE chave='taxa_afiliado'").get()?.valor || '5');
    const comissao = afiliadoId ? item.preco * item.qtd * taxa / 100 : 0;

    const pedidoId = uuidv4();
    db.prepare(`
      INSERT INTO pedidos (id,usuario_id,produto_id,quantidade,valor_unit,valor_total,desconto,afiliado_id,comissao_afil,metodo_pag,nota_fiscal,status)
      VALUES (?,?,?,?,?,?,0,?,?,'pix',?,'pendente')
    `).run(
      pedidoId, userId, item.produtoId, item.qtd,
      item.preco, item.preco * item.qtd,
      afiliadoId || null, comissao,
      JSON.stringify({ varianteId: item.varianteId, carrinhoMulti: true }),
    );
    pedidoIds.push(pedidoId);
  }

  // Abrir UM único ticket com todos os itens
  const { abrirTicket } = require('./tickets');
  const memberObj = interaction.member || await interaction.guild?.members.fetch(userId).catch(() => null);

  // Montar nome do produto para o ticket (resumo)
  const resumoProdutos = c.itens.map(i => `${i.produtoNome} (${i.qtd}x)`).join(', ');
  const pedidoPrincipal = pedidoIds[0];

  const { ok, canal } = await abrirTicket(interaction.guild, memberObj, 'compra', {
    pedidoId:  pedidoPrincipal,
    produtoId: c.itens[0].produtoId,
    produto:   resumoProdutos,
    valor:     total,
    usuarioId: userId,
    // Passa todos os pedidoIds para o ticket saber que é multi-produto
    pedidosExtras: pedidoIds.slice(1),
    itensCarrinho: c.itens,
  });

  if (ok) {
    // Vincular todos os pedidos ao mesmo ticket
    for (const pid of pedidoIds) {
      db.prepare('UPDATE pedidos SET ticket_id=? WHERE id=?').run(canal.id, pid);
    }
  }

  limparCarrinhoVariante(userId);

  if (ok && canal) {
    return interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(config.colors.success)
        .setTitle('✅ Ticket Aberto!')
        .setDescription([
          `> Seu ticket foi criado em ${canal}.`,
          `> Escolha a forma de pagamento lá para finalizar a compra.`,
        ].join('\n'))
        .addFields(
          { name: '📦 Itens',   value: resumoProdutos.slice(0,200),          inline: false },
          { name: '💵 Total',   value: `R$ ${total.toFixed(2)}`,             inline: true  },
          { name: '📋 Pedidos', value: pedidoIds.length.toString(),           inline: true  },
        )
        .setTimestamp()
        .setFooter({ text: 'Máximo Store • Carrinho Multi-Produto' })],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel('🎫 Ir para o Ticket').setStyle(ButtonStyle.Link)
          .setURL(`https://discord.com/channels/${interaction.guild?.id}/${canal.id}`),
      )],
    });
  }

  return interaction.editReply({ content: '❌ Erro ao abrir ticket. Tente novamente.' });
}

module.exports = {
  adicionarItem,
  removerItem,
  calcularTotal,
  buildCarrinhoEmbed,
  buildCarrinhoRows,
  mostrarCarrinhoVariante,
  finalizarCarrinho,
  limparCarrinhoVariante,
  getCarrinho,
  garantirCarrinho,
};
