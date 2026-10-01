/**
 * Sistema de Afiliados — 2 níveis com hierarquia correta
 *
 * HIERARQUIA:
 *   Owner/Admin → registra Afiliado N1 (define codigo_acesso + codigo_afil de vendas)
 *   Afiliado N1 → no próprio painel, registra Afiliados N2
 *   Afiliado N2 → só acessa painel, NÃO pode registrar afiliados
 *
 * DOIS TIPOS DE CÓDIGO:
 *   codigo_acesso → gerado pelo admin/N1, serve pra ACESSAR o painel
 *   codigo_afil   → código de VENDAS, dado aos clientes pra usar no ticket
 *
 * COMISSÃO:
 *   N1 vende: N1 ganha taxa_afiliado % do valor
 *   N2 vende: N2 ganha taxa_afil_n2 %, N1 (superior do N2) também ganha taxa_afil_n1_bonus %
 *
 * SPLIT DO CASHBACK (configurado pelo admin):
 *   N1 com 1 afil N2: N1=75% do bônus, N2=25%
 *   N1 com 2 afil N2: N1=50%, N2a=25%, N2b=25%
 */

const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const { db, Usuarios, Config } = require('../database/database');
const config = require('../config');
const { log }  = require('../utils/logger');

const CANAL_AFILIADOS = '1546321296948731994';

// ─── Garantir colunas extras no startup ─────────────────────────────────────
function inicializarTabela() {
  try { db.exec("ALTER TABLE usuarios ADD COLUMN codigo_acesso TEXT"); }    catch {}
  try { db.exec("ALTER TABLE usuarios ADD COLUMN nivel_afil INTEGER DEFAULT 0"); } catch {}
}

// ─── Gerar código aleatório ──────────────────────────────────────────────────
function gerarCodigo(prefixo = '') {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let cod = prefixo ? prefixo.toUpperCase() : '';
  while (cod.length < 8) cod += chars[Math.floor(Math.random() * chars.length)];
  return cod.slice(0, 12);
}

// ─── Buscar afiliado pelo código de ACESSO ───────────────────────────────────
function buscarPorCodigoAcesso(codigo) {
  return db.prepare('SELECT * FROM usuarios WHERE codigo_acesso = ?').get(codigo.toUpperCase().trim()) || null;
}

// ─── Buscar afiliado pelo código de VENDAS ───────────────────────────────────
function buscarPorCodigoVendas(codigo) {
  return db.prepare('SELECT * FROM usuarios WHERE codigo_afil = ?').get(codigo.toUpperCase().trim()) || null;
}

// ─── Registrar Afiliado N1 (pelo admin) ─────────────────────────────────────
async function registrarAfiliadoN1(interaction, discordId, codigoAcesso, codigoVendas) {
  const membro = await interaction.guild.members.fetch(discordId).catch(() => null);
  if (!membro) return { ok: false, erro: `Usuário \`${discordId}\` não encontrado no servidor.` };

  // Verificar se os códigos já existem
  const existeAcesso  = db.prepare('SELECT discord_id FROM usuarios WHERE codigo_acesso=?').get(codigoAcesso);
  const existeVendas  = db.prepare('SELECT discord_id FROM usuarios WHERE codigo_afil=?').get(codigoVendas);
  if (existeAcesso  && existeAcesso.discord_id  !== discordId) return { ok: false, erro: `Código de acesso \`${codigoAcesso}\` já em uso.` };
  if (existeVendas  && existeVendas.discord_id  !== discordId) return { ok: false, erro: `Código de vendas \`${codigoVendas}\` já em uso.` };

  Usuarios.garantir(discordId, membro.user.username);
  db.prepare('UPDATE usuarios SET codigo_acesso=?, codigo_afil=?, nivel_afil=1, afiliado_de=NULL WHERE discord_id=?')
    .run(codigoAcesso, codigoVendas, discordId);

  const taxa1 = Config.get('taxa_afiliado') || '5';
  const taxa2 = Config.get('taxa_afil_n2')  || '2';
  const bonus  = Config.get('taxa_afil_n1_bonus') || '1';

  try {
    await membro.send({
      embeds: [new EmbedBuilder()
        .setColor(0x9B59B6)
        .setTitle('🤝 Bem-vindo ao Programa de Afiliados!')
        .setDescription([
          `> Você foi registrado como **Afiliado Nível 1**.`,
          '',
          `🔑 **Código de acesso ao painel:** \`${codigoAcesso}\``,
          `🏷️ **Seu código de vendas:** \`${codigoVendas}\``,
          '',
          `💰 **Sua comissão:** ${taxa1}% por venda com seu código`,
          `🤝 **Bônus quando seu N2 vende:** ${bonus}% do valor`,
          `👥 **Comissão do seu N2:** ${taxa2}% por venda deles`,
          '',
          `> Acesse o canal de afiliados e use seu código de acesso para ver seu painel.`,
          `> No painel você pode registrar seus próprios afiliados de nível 2.`,
        ].join('\n'))
        .setTimestamp()
        .setFooter({ text: 'Máximo Store • Programa de Afiliados' })],
    }).catch(() => {});
  } catch {}

  await log('sistema', { executor: interaction.user.id, descricao: `➕ Afiliado N1 registrado: <@${discordId}> | Acesso: \`${codigoAcesso}\` | Vendas: \`${codigoVendas}\`` });
  return { ok: true, membro };
}

// ─── Registrar Afiliado N2 (pelo N1 no próprio painel) ──────────────────────
async function registrarAfiliadoN2(guild, superiorId, discordId, codigoAcesso, codigoVendas) {
  const membro = await guild.members.fetch(discordId).catch(() => null);
  if (!membro) return { ok: false, erro: `Usuário \`${discordId}\` não encontrado no servidor.` };

  // Verificar se já é afiliado
  const existente = db.prepare('SELECT nivel_afil, afiliado_de FROM usuarios WHERE discord_id=?').get(discordId);
  if (existente?.nivel_afil > 0) return { ok: false, erro: 'Este usuário já é afiliado.' };

  const existeAcesso = db.prepare('SELECT discord_id FROM usuarios WHERE codigo_acesso=?').get(codigoAcesso);
  const existeVendas = db.prepare('SELECT discord_id FROM usuarios WHERE codigo_afil=?').get(codigoVendas);
  if (existeAcesso && existeAcesso.discord_id !== discordId) return { ok: false, erro: `Código de acesso \`${codigoAcesso}\` já em uso.` };
  if (existeVendas && existeVendas.discord_id !== discordId) return { ok: false, erro: `Código de vendas \`${codigoVendas}\` já em uso.` };

  Usuarios.garantir(discordId, membro.user.username);
  db.prepare('UPDATE usuarios SET codigo_acesso=?, codigo_afil=?, nivel_afil=2, afiliado_de=? WHERE discord_id=?')
    .run(codigoAcesso, codigoVendas, superiorId, discordId);

  const taxa2  = Config.get('taxa_afil_n2')  || '2';
  const bonus1 = Config.get('taxa_afil_n1_bonus') || '1';

  try {
    await membro.send({
      embeds: [new EmbedBuilder()
        .setColor(0x3498DB)
        .setTitle('🤝 Bem-vindo ao Programa de Afiliados!')
        .setDescription([
          `> Você foi registrado como **Afiliado Nível 2**.`,
          '',
          `🔑 **Código de acesso ao painel:** \`${codigoAcesso}\``,
          `🏷️ **Seu código de vendas:** \`${codigoVendas}\``,
          '',
          `💰 **Sua comissão:** ${taxa2}% por venda com seu código`,
          `> Seu afiliado superior também recebe ${bonus1}% das suas vendas.`,
          '',
          `> Acesse o canal de afiliados para ver seu painel e acompanhar suas vendas.`,
        ].join('\n'))
        .setTimestamp()
        .setFooter({ text: 'Máximo Store • Programa de Afiliados' })],
    }).catch(() => {});
  } catch {}

  return { ok: true, membro };
}

// ─── Remover afiliado ────────────────────────────────────────────────────────
function removerAfiliado(discordId) {
  const u = db.prepare('SELECT * FROM usuarios WHERE discord_id=?').get(discordId);
  if (!u) return { ok: false, erro: 'Usuário não encontrado.' };
  if (!u.nivel_afil) return { ok: false, erro: 'Este usuário não é afiliado.' };

  // Desvincula seus N2 também (eles ficam sem superior)
  db.prepare('UPDATE usuarios SET afiliado_de=NULL WHERE afiliado_de=?').run(discordId);
  db.prepare('UPDATE usuarios SET codigo_acesso=NULL, codigo_afil=NULL, nivel_afil=0, afiliado_de=NULL WHERE discord_id=?').run(discordId);
  return { ok: true };
}

// ─── Vincular código de vendas AO PEDIDO ─────────────────────────────────────
function vincularCodigoAoPedido(pedidoId, codigo, compradorId) {
  const afiliado = buscarPorCodigoVendas(codigo);
  if (!afiliado)                           return { ok: false, erro: '❌ Código de vendedor inválido.' };
  if (afiliado.discord_id === compradorId) return { ok: false, erro: '❌ Você não pode usar seu próprio código.' };
  if (!afiliado.nivel_afil)               return { ok: false, erro: '❌ Este código não pertence a um afiliado ativo.' };

  const taxa = parseFloat(Config.get(afiliado.nivel_afil === 1 ? 'taxa_afiliado' : 'taxa_afil_n2') || '5');
  const pedido = db.prepare('SELECT * FROM pedidos WHERE id=?').get(pedidoId);
  if (!pedido) return { ok: false, erro: '❌ Pedido não encontrado.' };

  const comissao = pedido.valor_total * taxa / 100;
  db.prepare('UPDATE pedidos SET afiliado_id=?, comissao_afil=? WHERE id=?').run(afiliado.discord_id, comissao, pedidoId);
  return { ok: true, afiliado };
}

// ─── Distribuir comissões após pagamento ─────────────────────────────────────
async function distribuirComissoes(pedido, afiliadoId) {
  if (!afiliadoId || !pedido.valor_total) return;

  const afiliado = db.prepare('SELECT * FROM usuarios WHERE discord_id=?').get(afiliadoId);
  if (!afiliado) return;

  const nivel = afiliado.nivel_afil || 1;

  if (nivel === 1) {
    // N1 vende → N1 ganha taxa_afiliado %
    const taxa1 = parseFloat(Config.get('taxa_afiliado') || '5');
    const comissao = pedido.valor_total * taxa1 / 100;
    Usuarios.addSaldo(afiliadoId, comissao, `Comissão N1 — Pedido ${pedido.id.slice(0,8).toUpperCase()}`);
    db.prepare('UPDATE pedidos SET comissao_afil=? WHERE id=?').run(comissao, pedido.id);
  } else if (nivel === 2) {
    // N2 vende → N2 ganha taxa_afil_n2 %, N1 superior ganha taxa_afil_n1_bonus %
    const taxa2   = parseFloat(Config.get('taxa_afil_n2')        || '2');
    const bonusN1 = parseFloat(Config.get('taxa_afil_n1_bonus')  || '1');

    const comissaoN2    = pedido.valor_total * taxa2 / 100;
    const comissaoBonus = pedido.valor_total * bonusN1 / 100;

    Usuarios.addSaldo(afiliadoId, comissaoN2,
      `Comissão N2 — Pedido ${pedido.id.slice(0,8).toUpperCase()}`);

    if (afiliado.afiliado_de) {
      Usuarios.addSaldo(afiliado.afiliado_de, comissaoBonus,
        `Bônus N1 (venda do N2) — Pedido ${pedido.id.slice(0,8).toUpperCase()}`);
    }

    db.prepare('UPDATE pedidos SET comissao_afil=? WHERE id=?').run(comissaoN2 + comissaoBonus, pedido.id);
  }
}

// ─── Painel do afiliado ────────────────────────────────────────────────────────
async function mostrarPainelAfiliado(interaction, codigoAcesso) {
  if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ ephemeral: true });

  const usuario = buscarPorCodigoAcesso(codigoAcesso);
  if (!usuario) return interaction.editReply({ content: '❌ Código de acesso inválido.' });

  // Apenas o dono do código pode acessar o painel
  if (usuario.discord_id !== interaction.user.id) {
    return interaction.editReply({ content: '❌ Este código não pertence a você.' });
  }

  const nivel = usuario.nivel_afil || 0;
  if (!nivel) return interaction.editReply({ content: '❌ Você não é um afiliado ativo.' });

  const afilId = usuario.discord_id;
  const taxa1  = Config.get('taxa_afiliado')     || '5';
  const taxa2  = Config.get('taxa_afil_n2')      || '2';
  const bonus1 = Config.get('taxa_afil_n1_bonus')|| '1';
  const minSaque = parseFloat(Config.get('min_saque_afiliado') || '20');

  // Stats de vendas geradas pelo código deste afiliado
  const vendas = db.prepare(`
    SELECT COUNT(*) as total, COALESCE(SUM(valor_total),0) as receita,
           COALESCE(SUM(comissao_afil),0) as comissao
    FROM pedidos WHERE afiliado_id=? AND status IN ('pago','entregue')
  `).get(afilId);

  // Últimas 5 vendas
  const ultimasVendas = db.prepare(`
    SELECT p.id, p.valor_total, p.comissao_afil, p.metodo_pag, p.pago_em, pr.nome as produto
    FROM pedidos p JOIN produtos pr ON p.produto_id=pr.id
    WHERE p.afiliado_id=? AND p.status IN ('pago','entregue')
    ORDER BY p.pago_em DESC LIMIT 5
  `).all(afilId);

  const cor = nivel === 1 ? 0x9B59B6 : 0x3498DB;
  const nivelLabel = nivel === 1 ? '🥇 Nível 1' : '🥈 Nível 2';

  const embed = new EmbedBuilder()
    .setColor(cor)
    .setTitle(`🤝 Painel de Afiliado — ${nivelLabel}`)
    .addFields(
      { name: '👤 Afiliado',         value: `<@${afilId}>`,                                            inline: true },
      { name: '🏷️ Código de Vendas', value: `\`${usuario.codigo_afil || '—'}\``,                       inline: true },
      { name: '💰 Saldo a Receber',  value: `**R$ ${Number(usuario.saldo||0).toFixed(2)}**`,            inline: true },
      { name: '🛒 Vendas Geradas',   value: `**${vendas.total}**`,                                      inline: true },
      { name: '💵 Receita Gerada',   value: `R$ ${Number(vendas.receita).toFixed(2)}`,                  inline: true },
      { name: '🏆 Total Comissão',   value: `**R$ ${Number(vendas.comissao).toFixed(2)}**`,             inline: true },
    )
    .setTimestamp()
    .setFooter({ text: `Máximo Store • Mín. saque: R$ ${minSaque.toFixed(2)}` });

  // Info de comissão por nível
  if (nivel === 1) {
    embed.addFields(
      { name: '⚙️ Sua Comissão',      value: `**${taxa1}%** por venda com seu código`,                  inline: true },
      { name: '⚙️ Bônus sobre N2',    value: `**+${bonus1}%** quando seu N2 vende`,                     inline: true },
    );

    // N2 registrados
    const n2lista = db.prepare(`
      SELECT u.discord_id, u.nome, u.codigo_afil,
        COUNT(p.id) as vendas, COALESCE(SUM(p.valor_total),0) as receita
      FROM usuarios u
      LEFT JOIN pedidos p ON p.afiliado_id=u.discord_id AND p.status IN ('pago','entregue')
      WHERE u.afiliado_de=? AND u.nivel_afil=2
      GROUP BY u.discord_id
    `).all(afilId);

    if (n2lista.length) {
      embed.addFields({
        name: `👥 Seus Afiliados N2 (${n2lista.length})`,
        value: n2lista.map(u =>
          `• <@${u.discord_id}> | \`${u.codigo_afil||'—'}\` | ${u.vendas} vendas | R$ ${Number(u.receita).toFixed(2)}`
        ).join('\n'),
        inline: false,
      });
    } else {
      embed.addFields({ name: '👥 Afiliados N2', value: '_Nenhum registrado ainda._', inline: false });
    }
  } else {
    // N2: mostra seu superior
    embed.addFields(
      { name: '⚙️ Sua Comissão', value: `**${taxa2}%** por venda com seu código`, inline: true },
      { name: '👤 Seu Superior', value: usuario.afiliado_de ? `<@${usuario.afiliado_de}>` : '—', inline: true },
    );
  }

  // Últimas vendas
  if (ultimasVendas.length) {
    embed.addFields({
      name: '🛒 Últimas Vendas',
      value: ultimasVendas.map(v => {
        const data  = v.pago_em ? new Date(v.pago_em*1000).toLocaleDateString('pt-BR') : '—';
        const metod = v.metodo_pag?.includes('pix') ? '💠' : v.metodo_pag?.includes('coins') ? '🪙' : '💳';
        return `${metod} **${v.produto.slice(0,22)}** — R$ ${Number(v.valor_total).toFixed(2)} → **+R$ ${Number(v.comissao_afil||0).toFixed(2)}** | ${data}`;
      }).join('\n'),
      inline: false,
    });
  }

  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`afil_solicitar_saque_${afilId}`)
        .setLabel('💸 Solicitar Saque')
        .setStyle(ButtonStyle.Success)
        .setDisabled(Number(usuario.saldo||0) < minSaque),
      new ButtonBuilder()
        .setCustomId(`afil_historico_${afilId}`)
        .setLabel('📜 Histórico Completo')
        .setStyle(ButtonStyle.Secondary),
    ),
  ];

  // N1 pode registrar N2
  if (nivel === 1) {
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`afil_registrar_n2_${afilId}`)
        .setLabel('➕ Registrar Afiliado N2')
        .setStyle(ButtonStyle.Primary),
    ));
  }

  // Gerar novo código de vendas
  rows[0].addComponents(
    new ButtonBuilder()
      .setCustomId(`afil_gerar_codigo_${afilId}`)
      .setLabel('🔄 Gerar Novo Código')
      .setStyle(ButtonStyle.Secondary),
  );

  return interaction.editReply({ embeds: [embed], components: rows });
}

// ─── Historico completo ──────────────────────────────────────────────────────
async function mostrarHistoricoAfiliado(interaction, afilId) {
  if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ ephemeral: true });

  const vendas = db.prepare(`
    SELECT p.id, p.valor_total, p.comissao_afil, p.metodo_pag, p.pago_em, pr.nome as produto,
           u.nome as comprador
    FROM pedidos p
    JOIN produtos pr ON p.produto_id=pr.id
    LEFT JOIN usuarios u ON p.usuario_id=u.discord_id
    WHERE p.afiliado_id=? AND p.status IN ('pago','entregue')
    ORDER BY p.pago_em DESC LIMIT 20
  `).all(afilId);

  if (!vendas.length) return interaction.editReply({ content: '📜 Nenhuma venda registrada ainda.' });

  const embed = new EmbedBuilder()
    .setColor(0x9B59B6)
    .setTitle('📜 Histórico de Vendas')
    .setDescription(vendas.map((v, i) => {
      const data  = v.pago_em ? new Date(v.pago_em*1000).toLocaleDateString('pt-BR') : '—';
      const metod = v.metodo_pag?.includes('pix') ? '💠' : v.metodo_pag?.includes('coins') ? '🪙' : '💳';
      return `\`${String(i+1).padStart(2,'0')}\` ${metod} **${v.produto.slice(0,20)}** — R$ ${Number(v.valor_total).toFixed(2)} → **+R$ ${Number(v.comissao_afil||0).toFixed(2)}** | ${v.comprador||'?'} | ${data}`;
    }).join('\n'))
    .setTimestamp();

  return interaction.editReply({ embeds: [embed] });
}

// ─── Solicitar saque — delega para o submenu ─────────────────────────────────
async function solicitarSaque(interaction, afilId) {
  const { abrirSaqueSubmenu } = require('./saqueSubmenu');
  return abrirSaqueSubmenu(interaction, afilId || interaction.user.id);
}

// ─── processarSolicitacaoSaque — mantido para compatibilidade ────────────────
async function processarSolicitacaoSaque() {} // delegado ao saqueSubmenu

// ─── Embed fixo do canal ─────────────────────────────────────────────────────
async function enviarEmbedCanalAfiliados(guild) {
  try {
    const canal = guild.channels.cache.get(CANAL_AFILIADOS);
    if (!canal) return;

    const embed = new EmbedBuilder()
      .setColor(0x9B59B6)
      .setTitle('🤝 Portal de Afiliados — Máximo Store')
      .setDescription([
        '> Acesse seu painel de afiliado inserindo seu código de acesso.',
        '',
        '**Níveis:**',
        '> 🥇 **Nível 1** — Registrado pelo admin. Pode adicionar afiliados N2.',
        '> 🥈 **Nível 2** — Registrado por um afiliado N1.',
        '',
        '> 💰 Ganhe comissão em cada venda realizada com seu código.',
        '> 🤝 Afiliados N1 também ganham bônus pelas vendas dos seus N2.',
      ].join('\n'))
      .setTimestamp()
      .setFooter({ text: 'Máximo Store • Programa de Afiliados' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('afil_acessar_painel').setLabel('🔑 Acessar Meu Painel').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('afil_ranking').setLabel('🏆 Ranking').setStyle(ButtonStyle.Secondary),
    );

    const msgs = await canal.messages.fetch({ limit: 10 }).catch(() => null);
    const existente = msgs?.find(m => m.author.id === guild.client.user.id && m.embeds[0]?.title?.includes('Portal de Afiliados'));
    if (existente) await existente.edit({ embeds: [embed], components: [row] }).catch(() => {});
    else await canal.send({ embeds: [embed], components: [row] });
  } catch (e) {
    console.error('[Afiliados] Erro canal:', e.message);
  }
}

// ─── Ranking de afiliados ────────────────────────────────────────────────────
async function mostrarRankingAfiliados(interaction) {
  if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ ephemeral: true });

  // Top 10 N1 por total de comissão gerada (própria + dos seus N2)
  const top = db.prepare(`
    SELECT u.discord_id, u.nome, u.codigo_afil,
      COALESCE(SUM(p.comissao_afil),0) as comissao_propria,
      COUNT(DISTINCT p.id) as vendas
    FROM usuarios u
    LEFT JOIN pedidos p ON p.afiliado_id=u.discord_id AND p.status IN ('pago','entregue')
    WHERE u.nivel_afil=1
    GROUP BY u.discord_id
    ORDER BY comissao_propria DESC
    LIMIT 10
  `).all();

  if (!top.length) return interaction.editReply({ content: '📊 Nenhum afiliado com vendas ainda.' });

  const medals = ['🥇','🥈','🥉','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];

  const linhas = top.map((n1, i) => {
    // Buscar N2 deste N1
    const n2list = db.prepare(`
      SELECT u.discord_id, u.nome, u.codigo_afil,
        COALESCE(SUM(p.comissao_afil),0) as comissao,
        COUNT(p.id) as vendas
      FROM usuarios u
      LEFT JOIN pedidos p ON p.afiliado_id=u.discord_id AND p.status IN ('pago','entregue')
      WHERE u.afiliado_de=? AND u.nivel_afil=2
      GROUP BY u.discord_id
      ORDER BY comissao DESC
    `).all(n1.discord_id);

    const n1linha = `${medals[i]} **${n1.nome || n1.discord_id}** (\`${n1.codigo_afil || '—'}\`) — ${n1.vendas} vendas • R$ ${Number(n1.comissao_propria).toFixed(2)}`;

    if (!n2list.length) {
      return `${n1linha}\n╰ *N/A*`;
    }

    const n2linhas = n2list.map(n2 =>
      `╠ **${n2.nome || n2.discord_id}** (\`${n2.codigo_afil || '—'}\`) — ${n2.vendas} vendas • R$ ${Number(n2.comissao).toFixed(2)}`
    );
    // Último N2 usa ╚ em vez de ╠
    if (n2linhas.length > 0) {
      n2linhas[n2linhas.length - 1] = n2linhas[n2linhas.length - 1].replace('╠', '╚');
    }

    return [n1linha, ...n2linhas].join('\n');
  });

  const embed = new EmbedBuilder()
    .setColor(0xFFD700)
    .setTitle('🏆 Ranking de Afiliados')
    .setDescription(linhas.join('\n\n'))
    .setTimestamp()
    .setFooter({ text: 'Máximo Store • Top 10 por comissão gerada' });

  return interaction.editReply({ embeds: [embed] });
}

module.exports = {
  inicializarTabela,
  registrarAfiliadoN1,
  registrarAfiliadoN2,
  removerAfiliado,
  vincularCodigoAoPedido,
  distribuirComissoes,
  buscarPorCodigoVendas,
  buscarPorCodigoAcesso,
  mostrarPainelAfiliado,
  mostrarHistoricoAfiliado,
  mostrarRankingAfiliados,
  solicitarSaque,
  processarSolicitacaoSaque,
  enviarEmbedCanalAfiliados,
  gerarCodigo,
  CANAL_AFILIADOS,
};
