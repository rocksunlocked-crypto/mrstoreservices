const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { db, Usuarios } = require('../../database/database');
const config = require('../../config');
const moment = require('moment-timezone');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('historico')
    .setDescription('📜 Ver histórico detalhado de transações e compras')
    .addStringOption(o =>
      o.setName('tipo')
       .setDescription('Tipo de histórico')
       .addChoices(
         { name: '💳 Transações de Saldo', value: 'transacoes' },
         { name: '🛒 Compras Realizadas',   value: 'compras'    },
         { name: '🎁 Caixas Abertas',        value: 'caixas'     },
         { name: '🎟️ Cupons Usados',          value: 'cupons'     },
       ).setRequired(false)
    )
    .addIntegerOption(o =>
      o.setName('pagina')
       .setDescription('Página (padrão: 1)')
       .setMinValue(1)
       .setRequired(false)
    ),
  cooldown: 5,
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    Usuarios.garantir(interaction.user.id, interaction.user.username);

    const tipo   = interaction.options.getString('tipo') || 'transacoes';
    const pagina = (interaction.options.getInteger('pagina') || 1) - 1;
    const limite = 10;
    const offset = pagina * limite;

    // ── TRANSAÇÕES ────────────────────────────────────────────────────────
    if (tipo === 'transacoes') {
      const total = db.prepare('SELECT COUNT(*) as c FROM transacoes WHERE usuario_id=?').get(interaction.user.id).c;
      const rows  = db.prepare('SELECT * FROM transacoes WHERE usuario_id=? ORDER BY criado_em DESC LIMIT ? OFFSET ?')
                      .all(interaction.user.id, limite, offset);

      const embed = new EmbedBuilder()
        .setColor(config.colors.primary)
        .setTitle('💳 Histórico de Transações')
        .setDescription(`Mostrando página ${pagina + 1} • ${total} registro(s) total`)
        .setTimestamp()
        .setFooter({ text: 'Máximo Store' });

      if (!rows.length) return interaction.editReply({ content: '📜 Nenhuma transação encontrada.' });

      for (const t of rows) {
        const sinal = t.tipo === 'credito' ? '🟢 **+**' : '🔴 **-**';
        const data  = moment.unix(t.criado_em).tz(config.timezone).format('DD/MM/YY HH:mm');
        embed.addFields({
          name: `${sinal}R$ ${Number(t.valor).toFixed(2)} — ${data}`,
          value: `${t.descricao || 'Sem descrição'}\nSaldo: R$ ${Number(t.saldo_ant||0).toFixed(2)} → **R$ ${Number(t.saldo_novo||0).toFixed(2)}**`,
          inline: false,
        });
      }
      return interaction.editReply({ embeds: [embed] });
    }

    // ── COMPRAS ───────────────────────────────────────────────────────────
    if (tipo === 'compras') {
      const total = db.prepare("SELECT COUNT(*) as c FROM pedidos WHERE usuario_id=?").get(interaction.user.id).c;
      const rows  = db.prepare(`
        SELECT p.*, pr.nome as produto_nome
        FROM pedidos p LEFT JOIN produtos pr ON p.produto_id=pr.id
        WHERE p.usuario_id=? ORDER BY p.criado_em DESC LIMIT ? OFFSET ?
      `).all(interaction.user.id, limite, offset);

      if (!rows.length) return interaction.editReply({ content: '🛒 Nenhuma compra encontrada.' });

      const statusEmoji = { pendente:'⏳', pago:'✅', entregue:'📦', cancelado:'❌', reembolsado:'↩️' };
      const embed = new EmbedBuilder()
        .setColor(config.colors.loja)
        .setTitle('🛒 Histórico de Compras')
        .setDescription(`Página ${pagina + 1} • ${total} pedido(s) total`)
        .setTimestamp()
        .setFooter({ text: 'Máximo Store' });

      for (const p of rows) {
        const data = moment.unix(p.criado_em).tz(config.timezone).format('DD/MM/YY HH:mm');
        embed.addFields({
          name: `${statusEmoji[p.status]||'📋'} ${p.produto_nome || 'Produto'} — R$ ${Number(p.valor_total).toFixed(2)}`,
          value: `ID: \`${p.id.slice(0,8).toUpperCase()}\` • ${data}${p.cupom_usado ? ` • 🎟️ ${p.cupom_usado}` : ''}`,
          inline: false,
        });
      }

      // Botão de recompra para os 3 mais recentes entregues
      const entregues = rows.filter(p => p.status === 'entregue').slice(0, 3);
      const rowsRecompra = entregues.map(p =>
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`recomprar_${p.produto_id}`)
            .setLabel(`🔄 Recomprar: ${(p.produto_nome || 'Produto').slice(0, 25)}`)
            .setStyle(ButtonStyle.Primary),
        )
      );

      return interaction.editReply({ embeds: [embed], components: rowsRecompra });
    }

    // ── CAIXAS ────────────────────────────────────────────────────────────
    if (tipo === 'caixas') {
      const total = db.prepare('SELECT COUNT(*) as c FROM caixas_abertas WHERE usuario_id=?').get(interaction.user.id).c;
      const rows  = db.prepare(`
        SELECT ca.*, cm.nome as caixa_nome, ci.nome as item_nome, ci.raridade
        FROM caixas_abertas ca
        JOIN caixas_misteriosas cm ON ca.caixa_id=cm.id
        JOIN caixa_itens ci ON ca.item_id=ci.id
        WHERE ca.usuario_id=? ORDER BY ca.aberta_em DESC LIMIT ? OFFSET ?
      `).all(interaction.user.id, limite, offset);

      if (!rows.length) return interaction.editReply({ content: '🎁 Nenhuma caixa aberta.' });

      const RARS = { comum:'⚪', incomum:'🟢', raro:'🔵', epico:'🟣', lendario:'🌟' };
      const embed = new EmbedBuilder()
        .setColor(config.colors.gold)
        .setTitle('🎁 Histórico de Caixas Abertas')
        .setDescription(`Página ${pagina + 1} • ${total} abertura(s)`)
        .setTimestamp();

      for (const h of rows) {
        const data = moment.unix(h.aberta_em).tz(config.timezone).format('DD/MM/YY HH:mm');
        embed.addFields({
          name: `${RARS[h.raridade]||'❓'} ${h.item_nome}`,
          value: `📦 ${h.caixa_nome} • 📅 ${data}`,
          inline: true,
        });
      }
      return interaction.editReply({ embeds: [embed] });
    }

    // ── CUPONS ────────────────────────────────────────────────────────────
    if (tipo === 'cupons') {
      const rows = db.prepare(`
        SELECT cu.*, c.codigo, c.tipo, c.valor
        FROM cupons_usos cu JOIN cupons c ON cu.cupom_id=c.id
        WHERE cu.usuario_id=? ORDER BY cu.usado_em DESC LIMIT ?
      `).all(interaction.user.id, 20);

      if (!rows.length) return interaction.editReply({ content: '🎟️ Nenhum cupom utilizado.' });

      const embed = new EmbedBuilder()
        .setColor(config.colors.purple)
        .setTitle('🎟️ Cupons Utilizados')
        .setTimestamp();

      for (const c of rows) {
        const data = moment.unix(c.usado_em).tz(config.timezone).format('DD/MM/YY HH:mm');
        const val  = c.tipo === 'percentual' ? `${c.valor}%` : `R$ ${Number(c.valor).toFixed(2)}`;
        embed.addFields({ name: `🎟️ ${c.codigo}`, value: `${val} de desconto • 📅 ${data}`, inline: true });
      }
      return interaction.editReply({ embeds: [embed] });
    }
  },
};
