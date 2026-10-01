const {
  SlashCommandBuilder, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
} = require('discord.js');
const { Usuarios, db } = require('../../database/database');
const { getCoins, embedSaldoCoins, iniciarCompraCoins, addCoins, COIN_EMOJI } = require('../../systems/coins');
const config = require('../../config');
const moment = require('moment-timezone');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('saldo')
    .setDescription('💰 Ver seu saldo, coins e histórico')
    .addSubcommand(sub => sub.setName('ver').setDescription('💰 Ver saldo e coins'))
    .addSubcommand(sub =>
      sub.setName('transferir')
         .setDescription('💸 Transferir saldo para outro usuário')
         .addUserOption(o => o.setName('para').setDescription('Destino').setRequired(true))
         .addNumberOption(o => o.setName('valor').setDescription('Valor (R$)').setRequired(true).setMinValue(0.01))
         .addStringOption(o => o.setName('motivo').setDescription('Motivo').setRequired(false))
    ),
  cooldown: 5,
  async execute(interaction) {
    const sub     = interaction.options.getSubcommand();
    const usuario = Usuarios.garantir(interaction.user.id, interaction.user.username);

    if (sub === 'ver') {
      await interaction.deferReply({ ephemeral: true });

      const transacoes = db.prepare('SELECT * FROM transacoes WHERE usuario_id=? ORDER BY criado_em DESC LIMIT 5').all(interaction.user.id);
      const nivelData  = config.fidelidade.niveis.find(n => n.nome === (usuario.nivel || 'Bronze')) || config.fidelidade.niveis[0];
      const coins      = getCoins(interaction.user.id);

      const embed = new EmbedBuilder()
        .setColor(config.colors.gold)
        .setTitle('💰 Meu Saldo')
        .addFields(
          { name: '💵 Saldo R$',      value: `**R$ ${(usuario.saldo || 0).toFixed(2)}**`,     inline: true },
          { name: `${COIN_EMOJI} Coins`, value: `**${coins.toLocaleString('pt-BR')}**`,         inline: true },
          { name: `${nivelData.emoji} Nível`, value: `**${usuario.nivel || 'Bronze'}**`,        inline: true },
        )
        .setTimestamp()
        .setFooter({ text: 'Máximo Store' });

      if (transacoes.length) {
        const linhas = transacoes.map(t => {
          const sinal = t.tipo.includes('credito') ? '🟢 +' : '🔴 -';
          const data  = moment.unix(t.criado_em).tz(config.timezone).format('DD/MM HH:mm');
          return `${sinal}${t.tipo.includes('coins') ? COIN_EMOJI : 'R$'} ${Number(t.valor).toFixed(2)} — ${t.descricao || t.tipo} \`${data}\``;
        });
        embed.addFields({ name: '📜 Últimas Movimentações', value: linhas.join('\n') });
      }

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('saldo_historico_completo').setLabel('📋 Histórico Completo').setStyle(ButtonStyle.Secondary),
      );

      return interaction.editReply({ embeds: [embed], components: [row] });
    }

    if (sub === 'transferir') {
      const destUser = interaction.options.getUser('para');
      const valor    = interaction.options.getNumber('valor');
      const motivo   = interaction.options.getString('motivo') || 'Transferência';

      if (destUser.id === interaction.user.id) return interaction.reply({ content: '❌ Não pode transferir para si mesmo.', ephemeral: true });
      if (destUser.bot) return interaction.reply({ content: '❌ Não pode transferir para bots.', ephemeral: true });
      if ((usuario.saldo || 0) < valor) return interaction.reply({ content: `❌ Saldo insuficiente. Seu saldo: **R$ ${(usuario.saldo||0).toFixed(2)}**`, ephemeral: true });

      await interaction.deferReply({ ephemeral: true });
      const { db: database } = require('../../database/database');
      database.transaction(() => {
        Usuarios.garantir(destUser.id, destUser.username);
        Usuarios.addSaldo(interaction.user.id, -valor, `Transferência para ${destUser.username}`);
        Usuarios.addSaldo(destUser.id, valor, `Transferência de ${interaction.user.username}: ${motivo}`);
      })();

      const member = await interaction.guild.members.fetch(destUser.id).catch(() => null);
      if (member) {
        member.send({ embeds: [new EmbedBuilder()
          .setColor(config.colors.success)
          .setTitle('💰 Você recebeu saldo!')
          .setDescription(`<@${interaction.user.id}> transferiu **R$ ${valor.toFixed(2)}** para você.\n📝 ${motivo}`)
          .setTimestamp()] }).catch(() => {});
      }

      return interaction.editReply({ embeds: [new EmbedBuilder()
        .setColor(config.colors.success)
        .setTitle('✅ Transferência Realizada')
        .addFields(
          { name: '👤 Para',   value: `<@${destUser.id}>`,      inline: true },
          { name: '💵 Valor',  value: `R$ ${valor.toFixed(2)}`, inline: true },
          { name: '📝 Motivo', value: motivo },
        ).setTimestamp()] });
    }
  },
};
