const { SlashCommandBuilder } = require('discord.js');
const { Usuarios } = require('../../database/database');
const { Embeds } = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('perfil')
    .setDescription('👤 Veja seu perfil, saldo e pontos de fidelidade')
    .addUserOption(o => o.setName('usuario').setDescription('Ver perfil de outro usuário').setRequired(false)),
  cooldown: 5,
  async execute(interaction) {
    const alvo = interaction.options.getUser('usuario') || interaction.user;
    const member = await interaction.guild.members.fetch(alvo.id).catch(() => null);
    if (!member) return interaction.reply({ content: '❌ Usuário não encontrado.', ephemeral: true });

    const usuario = Usuarios.garantir(alvo.id, alvo.username);
    const embed = Embeds.perfil(usuario, member);
    await interaction.reply({ embeds: [embed], ephemeral: alvo.id !== interaction.user.id });
  },
};
