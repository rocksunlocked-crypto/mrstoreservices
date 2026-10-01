const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { Usuarios } = require('../../database/database');
const {
  getCoins, addCoins, gastarCoins,
  embedSaldoCoins, iniciarCompraCoins,
  coinsParaReais, reaisParaCoins, COIN_EMOJI,
} = require('../../systems/coins');
const { isOwner } = require('../../utils/permissions');
const config = require('../../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('coins')
    .setDescription(`${COIN_EMOJI} Sistema de Coins`)
    .addSubcommand(sub => sub
      .setName('saldo')
      .setDescription(`${COIN_EMOJI} Ver seu saldo de coins`)
    )
    .addSubcommand(sub => sub
      .setName('comprar')
      .setDescription('💰 Comprar coins via PIX')
      .addIntegerOption(o => o.setName('quantidade').setDescription('Quantidade de coins (min: 100)').setRequired(true).setMinValue(100))
    )
    .addSubcommand(sub => sub
      .setName('add')
      .setDescription(`${COIN_EMOJI} [Owner] Adicionar coins a um usuário`)
      .addUserOption(o => o.setName('usuario').setDescription('Usuário').setRequired(true))
      .addIntegerOption(o => o.setName('quantidade').setDescription('Quantidade de coins').setRequired(true))
      .addStringOption(o => o.setName('motivo').setDescription('Motivo').setRequired(false))
    )
    .addSubcommand(sub => sub
      .setName('remover')
      .setDescription(`${COIN_EMOJI} [Owner] Remover coins de um usuário`)
      .addUserOption(o => o.setName('usuario').setDescription('Usuário').setRequired(true))
      .addIntegerOption(o => o.setName('quantidade').setDescription('Quantidade').setRequired(true))
      .addStringOption(o => o.setName('motivo').setDescription('Motivo').setRequired(false))
    )
    .addSubcommand(sub => sub
      .setName('transferir')
      .setDescription(`${COIN_EMOJI} Transferir coins para outro usuário`)
      .addUserOption(o => o.setName('para').setDescription('Destino').setRequired(true))
      .addIntegerOption(o => o.setName('quantidade').setDescription('Quantidade').setRequired(true).setMinValue(1))
    ),
  cooldown: 5,

  async execute(interaction) {
    const sub     = interaction.options.getSubcommand();
    const usuario = Usuarios.garantir(interaction.user.id, interaction.user.username);

    // ── SALDO ─────────────────────────────────────────────────────────────
    if (sub === 'saldo') {
      const member = interaction.member;
      return interaction.reply({ embeds: [embedSaldoCoins(usuario, member)], ephemeral: true });
    }

    // ── COMPRAR ───────────────────────────────────────────────────────────
    if (sub === 'comprar') {
      const qtd = interaction.options.getInteger('quantidade');
      return iniciarCompraCoins(interaction, qtd);
    }

    // ── ADD (owner only) ──────────────────────────────────────────────────
    if (sub === 'add') {
      if (!isOwner(interaction.member)) {
        return interaction.reply({ content: '❌ Apenas o Owner pode adicionar coins.', ephemeral: true });
      }
      const alvo    = interaction.options.getUser('usuario');
      const qtd     = interaction.options.getInteger('quantidade');
      const motivo  = interaction.options.getString('motivo') || `Adicionado por ${interaction.user.tag}`;

      Usuarios.garantir(alvo.id, alvo.username);
      const novo = addCoins(alvo.id, qtd, motivo, interaction.user.id);

      await interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(config.colors.coins)
          .setTitle(`${COIN_EMOJI} Coins Adicionados`)
          .addFields(
            { name: '👤 Usuário',     value: `<@${alvo.id}>`,              inline: true },
            { name: `${COIN_EMOJI} Adicionado`, value: `+${qtd.toLocaleString('pt-BR')}`, inline: true },
            { name: `${COIN_EMOJI} Novo Saldo`, value: `${novo.toLocaleString('pt-BR')}`, inline: true },
            { name: '📝 Motivo',      value: motivo },
          ).setTimestamp()],
        ephemeral: true,
      });

      // Notificar usuário
      const member = await interaction.guild.members.fetch(alvo.id).catch(() => null);
      if (member) {
        member.send({ embeds: [new EmbedBuilder()
          .setColor(config.colors.coins)
          .setTitle(`${COIN_EMOJI} Você recebeu Coins!`)
          .setDescription(`O **Owner** adicionou **${qtd.toLocaleString('pt-BR')} coins** à sua conta!\nSeu saldo atual: **${novo.toLocaleString('pt-BR')} coins** (R$ ${coinsParaReais(novo).toFixed(2)})\n📝 ${motivo}`)
          .setTimestamp()] }).catch(() => {});
      }
      return;
    }

    // ── REMOVER (owner only) ──────────────────────────────────────────────
    if (sub === 'remover') {
      if (!isOwner(interaction.member)) {
        return interaction.reply({ content: '❌ Apenas o Owner pode remover coins.', ephemeral: true });
      }
      const alvo   = interaction.options.getUser('usuario');
      const qtd    = interaction.options.getInteger('quantidade');
      const motivo = interaction.options.getString('motivo') || `Removido por ${interaction.user.tag}`;

      Usuarios.garantir(alvo.id, alvo.username);
      const { ok, erro, novo } = gastarCoins(alvo.id, qtd, motivo);
      if (!ok) return interaction.reply({ content: `❌ ${erro}`, ephemeral: true });

      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(config.colors.warning)
          .setTitle(`${COIN_EMOJI} Coins Removidos`)
          .addFields(
            { name: '👤 Usuário',      value: `<@${alvo.id}>`,              inline: true },
            { name: '➖ Removido',     value: `${qtd.toLocaleString('pt-BR')}`, inline: true },
            { name: '📦 Novo Saldo',   value: `${novo.toLocaleString('pt-BR')}`, inline: true },
          ).setTimestamp()],
        ephemeral: true,
      });
    }

    // ── TRANSFERIR ────────────────────────────────────────────────────────
    if (sub === 'transferir') {
      const destUser = interaction.options.getUser('para');
      const qtd      = interaction.options.getInteger('quantidade');

      if (destUser.id === interaction.user.id) return interaction.reply({ content: '❌ Não pode transferir para si mesmo.', ephemeral: true });
      if (destUser.bot) return interaction.reply({ content: '❌ Não pode transferir para bots.', ephemeral: true });

      const { ok, erro } = gastarCoins(interaction.user.id, qtd, `Transferência para ${destUser.username}`);
      if (!ok) return interaction.reply({ content: `❌ ${erro}`, ephemeral: true });

      Usuarios.garantir(destUser.id, destUser.username);
      const novo = addCoins(destUser.id, qtd, `Transferência de ${interaction.user.username}`);

      await interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(config.colors.success)
          .setTitle(`${COIN_EMOJI} Coins Transferidos`)
          .addFields(
            { name: '👤 Para',       value: `<@${destUser.id}>`,           inline: true },
            { name: `${COIN_EMOJI} Quantidade`, value: `${qtd.toLocaleString('pt-BR')}`, inline: true },
          ).setTimestamp()],
        ephemeral: true,
      });

      const memberDest = await interaction.guild.members.fetch(destUser.id).catch(() => null);
      if (memberDest) {
        memberDest.send({ embeds: [new EmbedBuilder()
          .setColor(config.colors.coins)
          .setTitle(`${COIN_EMOJI} Você recebeu Coins!`)
          .setDescription(`<@${interaction.user.id}> transferiu **${qtd.toLocaleString('pt-BR')} coins** para você!\nSeu saldo atual: **${novo.toLocaleString('pt-BR')} coins**`)
          .setTimestamp()] }).catch(() => {});
      }
    }
  },
};
