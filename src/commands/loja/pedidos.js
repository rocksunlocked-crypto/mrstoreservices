const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { Pedidos, Produtos, Usuarios } = require('../../database/database');
const config = require('../../config');
const moment = require('moment-timezone');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('pedidos')
    .setDescription('📋 Veja seu histórico de pedidos')
    .addStringOption(o =>
      o.setName('status')
       .setDescription('Filtrar por status')
       .addChoices(
         { name: '⏳ Pendentes', value: 'pendente' },
         { name: '✅ Pagos', value: 'pago' },
         { name: '📦 Entregues', value: 'entregue' },
         { name: '❌ Cancelados', value: 'cancelado' },
         { name: '↩️ Reembolsados', value: 'reembolsado' },
       ).setRequired(false)
    ),
  cooldown: 5,
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    Usuarios.garantir(interaction.user.id, interaction.user.username);

    const status = interaction.options.getString('status');
    const pedidos = Pedidos.listarUsuario(interaction.user.id, status);

    if (!pedidos.length) {
      return interaction.editReply({ content: '📋 Nenhum pedido encontrado.' });
    }

    const statusEmoji = { pendente: '⏳', pago: '✅', entregue: '📦', cancelado: '❌', reembolsado: '↩️' };

    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle('📋 Seus Pedidos')
      .setDescription(`Exibindo os últimos ${pedidos.slice(0, 10).length} pedido(s)`)
      .setTimestamp()
      .setFooter({ text: 'Máximo Store' });

    for (const p of pedidos.slice(0, 10)) {
      const data = moment.unix(p.criado_em).tz(config.timezone).format('DD/MM/YY HH:mm');
      embed.addFields({
        name: `${statusEmoji[p.status] || '📋'} ${p.produto_nome || p.produto_id}`,
        value: `💵 R$ ${p.valor_total.toFixed(2)} • 📅 ${data} • ID: \`${p.id.slice(0,8).toUpperCase()}\``,
        inline: false,
      });
    }

    await interaction.editReply({ embeds: [embed] });
  },
};
