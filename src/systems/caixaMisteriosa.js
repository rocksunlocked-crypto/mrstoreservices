/**
 * Sistema de Caixa Misteriosa
 * - Múltiplas caixas configuráveis, cada uma com seus itens e % de drop
 * - Venda igual ao carrinho: embed no canal → ticket → PIX ou Coins
 * - Itens = variantes de produtos já cadastrados nos carrinhos
 * - 4 raridades: Comum, Raro, Épico, Lendário
 * - Entrega o item do estoque digital no privado do usuário
 */

const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder,
} = require('discord.js');
const { db, Usuarios, Pedidos } = require('../database/database');
const { log }           = require('../utils/logger');
const { pegarItemVariante } = require('./painelProduto');
const { v4: uuidv4 }    = require('uuid');
const config             = require('../config');

// ─── Raridades ────────────────────────────────────────────────────────────────
const RARIDADES = {
  comum:    { label: 'Comum',    emoji: '⚪', cor: 0x95A5A6, stars: '⭐'          },
  raro:     { label: 'Raro',     emoji: '🔵', cor: 0x3498DB, stars: '⭐⭐'        },
  epico:    { label: 'Épico',    emoji: '🟣', cor: 0x9B59B6, stars: '⭐⭐⭐'      },
  lendario: { label: 'Lendário', emoji: '🌟', cor: 0xF1C40F, stars: '⭐⭐⭐⭐'    },
  mitico:   { label: 'Mítico',   emoji: '🔴', cor: 0xFF0000, stars: '⭐⭐⭐⭐⭐'  },
};

// ─── Listar todas as caixas ativas ────────────────────────────────────────────
function listarCaixasAtivas() {
  return db.prepare("SELECT * FROM caixa_config WHERE ativa=1 ORDER BY criado_em ASC").all();
}

// ─── Obter caixa por ID ───────────────────────────────────────────────────────
function getCaixa(id) {
  return db.prepare('SELECT * FROM caixa_config WHERE id=?').get(id);
}

// ─── Itens de uma caixa específica ───────────────────────────────────────────
function getItensCaixa(caixaId) {
  return db.prepare(`
    SELECT ci.*, vp.nome as variante_nome, vp.descricao as variante_desc,
           vp.preco, pr.nome as produto_nome, pr.imagem_url,
           (SELECT COUNT(*) FROM estoque_variante WHERE variante_id=ci.variante_id AND usado=0) as estoque
    FROM caixa_itens_config ci
    JOIN variantes_produto vp ON ci.variante_id = vp.id
    JOIN produtos pr ON vp.produto_id = pr.id
    WHERE ci.caixa_id=? AND ci.ativa=1
    ORDER BY ci.chance DESC
  `).all(caixaId);
}

// ─── Sortear item de uma caixa ────────────────────────────────────────────────
function sortearItem(caixaId) {
  const itens = getItensCaixa(caixaId).filter(i => i.estoque > 0);
  if (!itens.length) return null;
  const totalChance = itens.reduce((acc, i) => acc + i.chance, 0);
  let rand = Math.random() * totalChance;
  for (const item of itens) {
    rand -= item.chance;
    if (rand <= 0) return item;
  }
  return itens[itens.length - 1];
}

// ─── Enviar embed do canal com select de caixas ───────────────────────────────
async function enviarEmbedCaixasCanal(guild, canalId) {
  const canal = guild.channels.cache.get(canalId);
  if (!canal) return;

  const caixas = listarCaixasAtivas();
  if (!caixas.length) return;

  // Montar descrição com probabilidades visuais por caixa
  const descCaixas = caixas.map(c => {
    const itens     = getItensCaixa(c.id);
    const totalEst  = itens.reduce((a, i) => a + i.estoque, 0);

    // Agrupar chances por raridade
    const chancePorRar = {};
    for (const i of itens) {
      chancePorRar[i.raridade] = (chancePorRar[i.raridade] || 0) + i.chance;
    }
    const barraRar = Object.entries(RARIDADES)
      .filter(([k]) => chancePorRar[k])
      .map(([k, r]) => `${r.emoji} ${r.label} **${chancePorRar[k].toFixed(0)}%**`)
      .join(' • ');

    const linhasItens = itens.map(i => {
      const r = RARIDADES[i.raridade] || RARIDADES.comum;
      const est = i.estoque > 0 ? `${i.estoque} un.` : '❌';
      return `${r.emoji} **${i.variante_nome}** — ${i.chance}% — ${est}`;
    });

    return [
      `**🎁 ${c.nome}** — R$ ${c.preco.toFixed(2)} | 📦 ${totalEst} disponíveis | 🎰 ${c.total_abertas} abertas`,
      barraRar ? `> ${barraRar}` : '',
      ...linhasItens,
    ].filter(Boolean).join('\n');
  }).join('\n\n');

  const embed = new EmbedBuilder()
    .setColor(0xFFD700)
    .setTitle('🎁 Caixas Misteriosas')
    .setDescription([
      '> Abra uma caixa e descubra o que está dentro!',
      '> Pague via **PIX** ou **🪙 Coins** e receba no privado.',
      '',
      descCaixas,
    ].join('\n'))
    .setTimestamp()
    .setFooter({ text: `Máximo Store • ${caixas.reduce((a, c) => a + c.total_abertas, 0)} caixas abertas` });

  const caixaComImg = caixas.find(c => c.imagem_url);
  if (caixaComImg) embed.setImage(caixaComImg.imagem_url);

  // Se só tem 1 caixa → botão direto; mais de 1 → select menu
  const rows = [];
  if (caixas.length === 1) {
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`abrir_caixa_${caixas[0].id}`)
        .setLabel(`🎁 Abrir ${caixas[0].nome} — R$ ${caixas[0].preco.toFixed(2)}`)
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('historico_caixa').setLabel('📜 Histórico').setStyle(ButtonStyle.Secondary),
    ));
  } else {
    const options = caixas.map(c => {
      const itens    = getItensCaixa(c.id);
      const totalEst = itens.reduce((a, i) => a + i.estoque, 0);
      return {
        label:       c.nome.slice(0, 100),
        description: `R$ ${c.preco.toFixed(2)} • ${itens.length} itens possíveis • ${totalEst} em estoque`,
        value:       c.id,
        emoji:       '🎁',
      };
    });
    rows.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('caixa_selecionar_canal')
        .setPlaceholder('🎁 Escolha uma caixa para abrir...')
        .addOptions(options),
    ));
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('historico_caixa').setLabel('📜 Meu Histórico').setStyle(ButtonStyle.Secondary),
    ));
  }

  const msgs = await canal.messages.fetch({ limit: 10 }).catch(() => null);
  const existente = msgs?.find(m =>
    m.author.id === guild.client.user.id &&
    m.embeds.length > 0 &&
    m.embeds[0].title?.includes('Caixa')
  );

  if (existente) {
    await existente.edit({ embeds: [embed], components: rows }).catch(() => {});
  } else {
    await canal.send({ embeds: [embed], components: rows });
  }
}

// ─── Iniciar compra de uma caixa (igual ao carrinho — via ticket) ─────────────
async function iniciarCompraCaixa(interaction, caixaId, client) {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ ephemeral: true });
  }

  const usuario = Usuarios.garantir(interaction.user.id, interaction.user.username);
  if (usuario.bloqueado) return interaction.editReply({ content: '🚫 Conta bloqueada.' });

  const caixa = getCaixa(caixaId);
  if (!caixa || !caixa.ativa) return interaction.editReply({ content: '❌ Caixa não disponível.' });

  const itens = getItensCaixa(caixaId);
  const itensCom = itens.filter(i => i.estoque > 0);
  if (!itensCom.length) {
    const chancePorRar = {};
    for (const i of itens) chancePorRar[i.raridade] = (chancePorRar[i.raridade] || 0) + i.chance;
    const barraRar = Object.entries(RARIDADES)
      .filter(([k]) => chancePorRar[k])
      .map(([k, r]) => `${r.emoji} ${r.label} ${chancePorRar[k].toFixed(0)}%`)
      .join(' • ');
    return interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(0x95A5A6)
        .setTitle('📦 Caixa Esgotada')
        .setDescription([
          `> **${caixa.nome}** está temporariamente sem estoque.`,
          `> Aguarde o reabastecimento!`,
          '',
          barraRar ? `Probabilidades: ${barraRar}` : '',
        ].filter(Boolean).join('\n'))
        .setTimestamp()],
    });
  }

  // Verificar se pode pagar com coins
  const coins      = usuario.coins || 0;
  const coinsNec   = Math.ceil(caixa.preco / 0.01);
  const podeCoins  = coins >= coinsNec;

  // Criar pedido pendente — usa produto_id da própria caixa como referência
  // Garante que exista um produto "placeholder" para caixas no banco
  const produtoCaixaId = `caixa_${caixaId}`;
  const prodExiste = db.prepare('SELECT id FROM produtos WHERE id=?').get(produtoCaixaId);
  if (!prodExiste) {
    db.prepare("INSERT OR IGNORE INTO produtos (id,nome,descricao,preco,tipo,ativo,criado_por) VALUES (?,?,?,?,?,1,'sistema')")
      .run(produtoCaixaId, `🎁 ${caixa.nome}`, caixa.descricao || 'Caixa Misteriosa', caixa.preco, 'caixa');
  }

  const pedidoId = uuidv4();
  db.prepare(`
    INSERT INTO pedidos (id, usuario_id, produto_id, quantidade, valor_unit, valor_total, desconto, metodo_pag, nota_fiscal, status)
    VALUES (?, ?, ?, 1, ?, ?, 0, 'pix', ?, 'pendente')
  `).run(pedidoId, interaction.user.id, produtoCaixaId, caixa.preco, caixa.preco, JSON.stringify({ tipo: 'caixa', caixaId }));

  // Abrir ticket igual ao carrinho
  const { abrirTicket } = require('./tickets');
  const memberObj = interaction.member
    || await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);

  const { ok, canal } = await abrirTicket(interaction.guild, memberObj, 'compra', {
    pedidoId,
    produtoId: 'CAIXA',
    produto:   `🎁 ${caixa.nome}`,
    valor:     caixa.preco,
    usuarioId: interaction.user.id,
  });

  if (ok) db.prepare('UPDATE pedidos SET ticket_id=? WHERE id=?').run(canal.id, pedidoId);

  if (ok && canal) {
    await interaction.editReply({ content: `✅ Ticket aberto em ${canal}!\nEscolha o pagamento lá.` });
  } else {
    // Fallback sem ticket
    const rowPag = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`gerar_pix_${pedidoId}`).setLabel('💠 Pagar via PIX').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`pagar_coins_${pedidoId}`).setLabel('🪙 Pagar com Coins').setStyle(ButtonStyle.Secondary).setDisabled(!podeCoins),
      new ButtonBuilder().setCustomId(`cancelar_pedido_${pedidoId}`).setLabel('❌ Cancelar').setStyle(ButtonStyle.Danger),
    );
    const embedFb = new EmbedBuilder()
      .setColor(0xFFD700)
      .setTitle(`🎁 ${caixa.nome}`)
      .setDescription(`💵 R$ ${caixa.preco.toFixed(2)}\n🪙 ${coinsNec.toLocaleString('pt-BR')} coins\n🆔 \`${pedidoId.slice(0,8).toUpperCase()}\``)
      .setTimestamp();
    await interaction.editReply({ embeds: [embedFb], components: [rowPag] });
  }

  log('compra', { usuario: interaction.user.id, produto: caixa.nome, valor: caixa.preco, pedidoId });
}

// ─── Entregar prêmio após pagamento confirmado ────────────────────────────────
async function entregarPrêmioCaixa(pedido, client) {
  try {
    const nota = pedido.nota_fiscal ? JSON.parse(pedido.nota_fiscal) : null;
    if (nota?.tipo !== 'caixa') return false;

    const caixaId = nota.caixaId;
    const caixa   = getCaixa(caixaId);
    if (!caixa) return false;

    const itemSorteado = sortearItem(caixaId);
    if (!itemSorteado) {
      console.error('[CaixaEntrega] Nenhum item disponível');
      return false;
    }

    const rar = RARIDADES[itemSorteado.raridade] || RARIDADES.comum;

    // Registrar histórico
    db.prepare('INSERT INTO caixa_historico (id,caixa_id,usuario_id,variante_id,raridade,pedido_id) VALUES (?,?,?,?,?,?)')
      .run(uuidv4(), caixaId, pedido.usuario_id, itemSorteado.variante_id, itemSorteado.raridade, pedido.id);

    // Pegar item do estoque
    const conteudo = pegarItemVariante(itemSorteado.variante_id, pedido.usuario_id, pedido.id);

    // Atualizar pedido
    db.prepare("UPDATE pedidos SET status='entregue', conteudo_entregue=?, entregue_em=strftime('%s','now') WHERE id=?")
      .run(conteudo || 'Prêmio entregue', pedido.id);

    db.prepare('UPDATE caixa_config SET total_abertas=total_abertas+1 WHERE id=?').run(caixaId);

    if (!client) return true;
    const guild  = client.guilds.cache.first();
    if (!guild) return true;

    const member = await guild.members.fetch(pedido.usuario_id).catch(() => null);
    if (!member) return true;

    // ── Animação de abertura ──────────────────────────────────────────────────
    const embedAnim = new EmbedBuilder()
      .setColor(0xFFD700)
      .setTitle('🎁 Abrindo sua Caixa...')
      .setDescription('✨ *Sorteando seu prêmio...*\n\n```\n⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜\n```')
      .setTimestamp();
    if (caixa.imagem_url) embedAnim.setThumbnail(caixa.imagem_url);

    const msgAnim = await member.send({ embeds: [embedAnim] }).catch(() => null);
    if (msgAnim) {
      // Animação de suspense por raridade
      const raridade  = itemSorteado.raridade;
      const framesPre = raridade === 'mitico'
        ? ['⬛⬛⬛⬛⬛⬛⬛⬛⬛⬛','🟥⬛⬛⬛⬛⬛⬛⬛⬛⬛','🟥🟥⬛⬛⬛⬛⬛⬛⬛⬛','🟥🟥🟥⬛⬛⬛⬛⬛⬛⬛','🟥🟥🟥🟥🟥⬛⬛⬛⬛⬛','💥🟥🟥🟥🟥🟥🟥⬛⬛⬛','💥💥🟥🟥🟥🟥🟥🟥🟥⬛','🔴💥💥🟥🟥🟥🟥🟥🟥🟥','🔴🔴💥💥💥🟥🟥🟥🟥🟥','🔴🔴🔴💥💥💥💥💥🟥🟥']
        : raridade === 'lendario'
          ? ['🌑🌑🌑🌑🌑🌑🌑🌑🌑🌑','🌒🌑🌑🌑🌑🌑🌑🌑🌑🌑','🌓🌒🌑🌑🌑🌑🌑🌑🌑🌑','🌔🌓🌒🌑🌑🌑🌑🌑🌑🌑','🌕🌔🌓🌒🌑🌑🌑🌑🌑🌑','🌟🌕🌔🌓🌒🌑🌑🌑🌑🌑','✨🌟🌕🌔🌓🌒🌑🌑🌑🌑','🎆✨🌟🌕🌔🌓🌒🌑🌑🌑','🎇🎆✨🌟🌕🌔🌓🌒🌑🌑']
          : raridade === 'epico'
            ? ['⬛⬛⬛⬛⬛⬛⬛⬛⬛⬛','🟪⬛⬛⬛⬛⬛⬛⬛⬛⬛','🟪🟪⬛⬛⬛⬛⬛⬛⬛⬛','🟪🟪🟪🟪⬛⬛⬛⬛⬛⬛','🟪🟪🟪🟪🟪🟪⬛⬛⬛⬛','✨🟪🟪🟪🟪🟪🟪🟪⬛⬛']
            : raridade === 'raro'
              ? ['⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜','🟦⬜⬜⬜⬜⬜⬜⬜⬜⬜','🟦🟦🟦⬜⬜⬜⬜⬜⬜⬜','🟦🟦🟦🟦🟦⬜⬜⬜⬜⬜','🟦🟦🟦🟦🟦🟦🟦🟦⬜⬜']
              : ['⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜','🟨⬜⬜⬜⬜⬜⬜⬜⬜⬜','🟨🟨🟨⬜⬜⬜⬜⬜⬜⬜','🟨🟨🟨🟨🟨🟨⬜⬜⬜⬜'];

      const delay = raridade === 'mitico' ? 450 : raridade === 'lendario' ? 500 : raridade === 'epico' ? 550 : 600;
      for (const f of framesPre) {
        await new Promise(r => setTimeout(r, delay));
        embedAnim.setDescription(`✨ *Sorteando...*\n\n\`\`\`\n${f}\n\`\`\``);
        await msgAnim.edit({ embeds: [embedAnim] }).catch(() => {});
      }
      await new Promise(r => setTimeout(r, 900));

      // Embed de resultado com imagem do item
      const embedRes = new EmbedBuilder()
        .setColor(rar.cor)
        .setTitle(`${rar.emoji} ${rar.label.toUpperCase()} — ${itemSorteado.variante_nome}`)
        .setDescription([
          `🎉 Parabéns, **${member.displayName}**!`,
          '',
          `Você abriu a **${caixa.nome}** e ganhou:`,
          `> ${rar.emoji} **${itemSorteado.variante_nome}** *(${rar.stars})*`,
          '',
          conteudo ? `📋 **Seu prêmio:**\n\`\`\`\n${conteudo.slice(0, 800)}\n\`\`\`` : '📦 Prêmio sendo processado.',
        ].join('\n'))
        .addFields(
          { name: '📦 Produto',             value: itemSorteado.produto_nome,                      inline: true },
          { name: `${rar.emoji} Raridade`,   value: `${rar.label} ${rar.stars}`,                   inline: true },
          { name: '🎲 Chance',               value: `${itemSorteado.chance}%`,                      inline: true },
          { name: '💵 Pago',                 value: `R$ ${pedido.valor_total.toFixed(2)}`,           inline: true },
          { name: '🆔 Pedido',               value: `\`${pedido.id.slice(0,8).toUpperCase()}\``,    inline: true },
          { name: '📦 Estoque restante',     value: `${Math.max(0, (itemSorteado.estoque || 1) - 1)} un.`, inline: true },
        )
        .setTimestamp()
        .setFooter({ text: 'Máximo Store • Caixa Misteriosa ❤️' });

      // Imagem do item ganho (se disponível)
      if (itemSorteado.imagem_url) embedRes.setImage(itemSorteado.imagem_url);
      else if (caixa.imagem_url)   embedRes.setThumbnail(caixa.imagem_url);

      const rowConf = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`confirmar_entrega_${pedido.id}`).setLabel('✅ Confirmar Recebimento').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`avaliar_${pedido.id}`).setLabel('⭐ Avaliar').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('historico_caixa').setLabel('📜 Meu Histórico').setStyle(ButtonStyle.Secondary),
      );

      await msgAnim.edit({ embeds: [embedRes], components: [rowConf] }).catch(() => {});
    }

    // Anunciar no canal da caixa (só raridade, sem spoiler)
    if (caixa.canal_id) {
      const canalCaixa = guild.channels.cache.get(caixa.canal_id);
      if (canalCaixa) {
        await canalCaixa.send({
          embeds: [new EmbedBuilder()
            .setColor(rar.cor)
            .setDescription(`${rar.emoji} **${member.displayName}** abriu a **${caixa.nome}** e encontrou algo **${rar.label}**! ${rar.stars}`)
            .setTimestamp()],
        }).catch(() => {});
      }
    }

    await log('caixa_aberta', {
      usuario:   pedido.usuario_id,
      produto:   `${itemSorteado.variante_nome} (${rar.label})`,
      valor:     pedido.valor_total,
      descricao: `Caixa ${caixa.nome}: ${member.user.tag} ganhou ${itemSorteado.variante_nome} [${rar.label}]`,
    });

    return true;
  } catch (err) {
    console.error('[EntregarCaixa]', err.message);
    return false;
  }
}

// ─── Histórico do usuário ─────────────────────────────────────────────────────
async function mostrarHistorico(interaction) {
  if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ ephemeral: true });

  const hist = db.prepare(`
    SELECT ch.*, vp.nome as item_nome, cc.nome as caixa_nome, cc.preco as caixa_preco
    FROM caixa_historico ch
    JOIN variantes_produto vp ON ch.variante_id=vp.id
    JOIN caixa_config cc ON ch.caixa_id=cc.id
    WHERE ch.usuario_id=? ORDER BY ch.aberta_em DESC LIMIT 15
  `).all(interaction.user.id);

  if (!hist.length) return interaction.editReply({ content: '📜 Você ainda não abriu nenhuma caixa.' });

  // Estatísticas
  const stats = db.prepare(`
    SELECT COUNT(*) as total,
      SUM(cc.preco) as total_gasto,
      COUNT(CASE WHEN ch.raridade='mitico'   THEN 1 END) as miticos,
      COUNT(CASE WHEN ch.raridade='lendario' THEN 1 END) as lendarios,
      COUNT(CASE WHEN ch.raridade='epico'    THEN 1 END) as epicos,
      COUNT(CASE WHEN ch.raridade='raro'     THEN 1 END) as raros,
      COUNT(CASE WHEN ch.raridade='comum'    THEN 1 END) as comuns
    FROM caixa_historico ch
    JOIN caixa_config cc ON ch.caixa_id=cc.id
    WHERE ch.usuario_id=?
  `).get(interaction.user.id);

  const melhor = hist.find(h => h.raridade === 'mitico') || hist.find(h => h.raridade === 'lendario') || hist.find(h => h.raridade === 'epico') || hist[0];
  const melhorRar = RARIDADES[melhor?.raridade] || RARIDADES.comum;

  const embed = new EmbedBuilder()
    .setColor(0xFFD700)
    .setTitle('📜 Histórico de Caixas')
    .addFields(
      { name: '🎰 Total abertas',   value: `**${stats.total}**`,                                      inline: true },
      { name: '💰 Total gasto',     value: `**R$ ${Number(stats.total_gasto || 0).toFixed(2)}**`,      inline: true },
      { name: '🏆 Melhor item',     value: `${melhorRar.emoji} **${melhor?.item_nome || '—'}**`,        inline: true },
      { name: '🔴 Míticos',         value: `**${stats.miticos}**`,                                     inline: true },
      { name: '🌟 Lendários',       value: `**${stats.lendarios}**`,                                   inline: true },
      { name: '🟣 Épicos',          value: `**${stats.epicos}**`,                                      inline: true },
      { name: '🔵 Raros',           value: `**${stats.raros}**`,                                       inline: true },
    )
    .setTimestamp();

  // Últimas 10 aberturas
  const linhas = hist.slice(0, 10).map(h => {
    const rar  = RARIDADES[h.raridade] || RARIDADES.comum;
    const data = new Date(h.aberta_em * 1000).toLocaleDateString('pt-BR');
    return `${rar.emoji} **${h.item_nome.slice(0, 25)}** — ${h.caixa_nome.slice(0, 20)} — ${data}`;
  });
  embed.setDescription(linhas.join('\n'));

  return interaction.editReply({ embeds: [embed] });
}

module.exports = {
  listarCaixasAtivas, getCaixa, getItensCaixa, sortearItem,
  iniciarCompraCaixa, entregarPrêmioCaixa,
  enviarEmbedCaixasCanal, mostrarHistorico,
  RARIDADES,
};
