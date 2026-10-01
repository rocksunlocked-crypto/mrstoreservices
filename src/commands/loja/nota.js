const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { Pedidos, Produtos, Usuarios } = require('../../database/database');
const config = require('../../config');
const moment = require('moment-timezone');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('nota')
    .setDescription('🧾 Gerar nota fiscal de um pedido')
    .addStringOption(o =>
      o.setName('pedido_id')
       .setDescription('ID do pedido (primeiros caracteres)')
       .setRequired(true)
    ),
  cooldown: 5,
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const { db } = require('../../database/database');
    const idBusca = interaction.options.getString('pedido_id').toUpperCase();

    const pedido = db.prepare('SELECT * FROM pedidos WHERE id LIKE ? OR UPPER(SUBSTR(id,1,8)) = ?')
                     .get(`${idBusca}%`, idBusca);

    if (!pedido) {
      return interaction.editReply({ content: '❌ Pedido não encontrado. Verifique o ID.' });
    }

    // Apenas o dono ou staff pode ver
    const { isStaff } = require('../../utils/permissions');
    if (pedido.usuario_id !== interaction.user.id && !isStaff(interaction.member)) {
      return interaction.editReply({ content: '❌ Este pedido não pertence a você.' });
    }

    if (!['pago', 'entregue'].includes(pedido.status)) {
      return interaction.editReply({ content: '⚠️ Nota fiscal disponível apenas para pedidos pagos.' });
    }

    const produto = Produtos.get(pedido.produto_id);
    const usuario = Usuarios.get(pedido.usuario_id);

    const pagamento = pedido.nota_fiscal ? JSON.parse(pedido.nota_fiscal) : null;
    const dataPag   = pedido.pago_em
      ? moment.unix(pedido.pago_em).tz(config.timezone).format('DD/MM/YYYY [às] HH:mm:ss')
      : 'N/A';
    const dataCriacao = moment.unix(pedido.criado_em).tz(config.timezone).format('DD/MM/YYYY [às] HH:mm:ss');

    const embed = new EmbedBuilder()
      .setColor(config.colors.success)
      .setTitle('🧾 Nota Fiscal Eletrônica')
      .setDescription([
        '```',
        '╔══════════════════════════════════════╗',
        '║        MÁXIMO STORE — NF-e            ║',
        '╚══════════════════════════════════════╝',
        '```',
      ].join('\n'))
      .addFields(
        { name: '🆔 Número do Pedido',  value: `\`${pedido.id.toUpperCase()}\``,                     inline: false },
        { name: '📦 Produto',            value: produto?.nome || pedido.produto_id,                    inline: true  },
        { name: '🔢 Quantidade',         value: String(pedido.quantidade),                             inline: true  },
        { name: '💵 Valor Unitário',     value: `R$ ${Number(pedido.valor_unit).toFixed(2)}`,          inline: true  },
        { name: '🎟️ Desconto',           value: `R$ ${Number(pedido.desconto||0).toFixed(2)}`,         inline: true  },
        { name: '💰 Total Pago',         value: `**R$ ${Number(pedido.valor_total).toFixed(2)}**`,     inline: true  },
        { name: '💳 Método',             value: (pedido.metodo_pag || 'PIX').toUpperCase(),             inline: true  },
        { name: '👤 Comprador',          value: `<@${pedido.usuario_id}>`,                              inline: true  },
        { name: '📅 Data do Pedido',     value: dataCriacao,                                           inline: true  },
        { name: '✅ Data do Pagamento',  value: dataPag,                                                inline: true  },
      )
      .setTimestamp()
      .setFooter({ text: `Máximo Store • Nota válida como comprovante de compra` });

    if (pedido.cupom_usado) {
      embed.addFields({ name: '🎟️ Cupom Utilizado', value: `\`${pedido.cupom_usado}\``, inline: true });
    }
    if (pagamento?.txid) {
      embed.addFields({ name: '🔑 TxID PIX', value: `\`${pagamento.txid}\``, inline: false });
    }

    return interaction.editReply({ embeds: [embed] });
  },
};
